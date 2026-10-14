import { CasioEmu } from '../CasioEmuNeo-master/web/js/casioemu-client.js';
import { skin, keyRects, touchRects, drawSkin, lcdRaster } from './skin.js';
import { deviceLayout,canvasResolution } from './layout.js';
import { createPointerController } from './interaction.js';

const $ = id => document.getElementById(id);
const canvas = $('screen');
const context = canvas.getContext('2d');
canvas.width=skin.width;
canvas.height=skin.height;
const lcdCanvas=document.createElement('canvas');
lcdCanvas.width=skin.lcd.sourceWidth;
lcdCanvas.height=skin.lcd.sourceHeight;
const lcdContext=lcdCanvas.getContext('2d');
let cover;
const storageKey = 'fx991cnx.ram.v1';
const labels = [
	'7','8','9','DEL','AC','4','5','6','×','÷','1','2','3','＋','−','0','.','×10ˣ','Ans','＝',
	'分数','平方根','x²','xʸ','log','ln','负号','度分秒','x⁻¹','sin','cos','tan','STO','ENG','(',')','S⇔D','M+',
	'OPTN','CALC','积分','变量 x','SHIFT','ALPHA','菜单','ON','左','右','上','下',
];
let emu;
let active = null;
let keyElements = [];
let padElements = [];
const padCanvas=$('pad-screen'),padContext=padCanvas.getContext('2d');
let savedBytes = '';
let failed = false;
let autoSaveEnabled = true;
let hintTimer=0;
let smoothDisplay=true;

function showKey(index) {
	const feedback=$('key-feedback');
	for(const [i,element] of padElements.entries())element?.classList.toggle('pressed',i===index);
	if(index<0) {
		feedback.hidden=true;
		clearTimeout(hintTimer);
		hintTimer=setTimeout(()=>{ $('key-hint').textContent=''; },400);
		return;
	}
	clearTimeout(hintTimer);
	const box=keyRects[index];
	Object.assign(feedback.style,{ left:`${box.x/skin.width*100}%`,top:`${box.y/skin.height*100}%`,width:`${box.w/skin.width*100}%`,height:`${box.h/skin.height*100}%`,borderRadius:index>=42 && index<=45 ? '50%' : '5px' });
	feedback.hidden=false;
	$('key-hint').textContent=labels[index];
}

const pointer=createPointerController({
	press,
	release:owner=>{ if(active?.owner===owner) release(); },
	feedback:showKey,
});
// Catch a second finger even if it lands on the LCD or outside a key.
document.addEventListener('pointerdown',event=>{
	if(event.pointerType==='touch' && event.isPrimary===false) pointer.abort();
},true);

function setStatus(message, error = false) {
	$('status').textContent = message;
	$('status').parentElement.classList.toggle('failed', error);
}
function fail(error) {
	failed = true;
	pointer.abort();
	emu?.stop();
	$('device').setAttribute('aria-busy', 'false');
	$('error').hidden = false;
	$('error-message').textContent = error.message + '。请通过本地 HTTP 服务打开，并确认 WASM 和机型资源已准备好。';
	setStatus('加载失败', true);
	for (const button of document.querySelectorAll('#zoom,.tools button,.backup-tools button,.calc-key,.pad-key')) button.disabled = true;
	console.error(error);
}

function release() {
	if (!active || !emu) return;
	if(!failed) emu.pointer(2, active.x, active.y);
	keyElements[active.index]?.classList.remove('pressed');
	padElements[active.index]?.classList.remove('pressed');
	active = null;
	showKey(-1);
	if(!failed) emu.runFor(35);
}
function press(index, owner) {
	if (!emu || failed || emu.paused) return;
	if (active?.owner === owner) return;
	release();
	const button = emu.buttons[index];
	if (!button) return;
	const { x, y, w, h } = button.rect;
	active = { index, owner, x: x + w / 2, y: y + h / 2 };
	keyElements[index].classList.add('pressed');
	padElements[index]?.classList.add('pressed');
	showKey(index);
	emu.pointer(1, active.x, active.y);
	$('device').dispatchEvent(new CustomEvent('calculator-key',{bubbles:true,detail:{index}}));
	// Very quick clicks must still cover a complete ROM keyboard scan.
	emu.runFor(70);
}
function tap(index) { press(index, 'accessible'); release(); }

function installKeys() {
	keyElements = emu.buttons.map((button, index) => {
		const element = document.createElement('button');
		element.type = 'button';
		element.className = 'calc-key';
		element.dataset.index = index;
		element.setAttribute('aria-label', labels[index] || button.name || `按键 ${index + 1}`);
		element.title = labels[index] + (button.name ? ` · ${button.name}` : '');
		const { x, y, w, h } = touchRects[index];
		Object.assign(element.style, { left:`${x / skin.width * 100}%`, top:`${y / skin.height * 100}%`, width:`${w / skin.width * 100}%`, height:`${h / skin.height * 100}%` });
		bindKey(element,index);
		$('keys').append(element);
		return element;
	});
}

function bindKey(element,index) {
		let pointerClickUntil=0;
		element.addEventListener('pointerdown', event => {
			if(!emu || failed || emu.paused) return;
			if(!pointer.down(event,index)) return;
			if(event.pointerType!=='touch') event.preventDefault();
			element.setPointerCapture(event.pointerId);
		});
		element.addEventListener('pointermove',event=>pointer.move(event));
		element.addEventListener('pointerup',event=>{pointerClickUntil=performance.now()+800;pointer.up(event);});
		element.addEventListener('keydown',event=>{if(event.code==='Enter'||event.code==='Space')pointerClickUntil=0;});
		for(const name of ['pointercancel','lostpointercapture']) element.addEventListener(name,event=>pointer.cancel(event));
		// Native button activation by keyboard or an assistive technology.
		element.addEventListener('click', event => { if (event.detail === 0 && performance.now()>pointerClickUntil) tap(index); });
}
function installPad() {
	const shiftLegends={0:'科学常数',1:'单位转换',2:'复位',3:'插入',4:'关机',8:'nPr',9:'nCr',15:'Rnd',16:'Ran#',17:'π',18:'%',19:'≈',20:'带分数',21:'³√',22:'x³',23:'ⁿ√',24:'10ˣ',25:'eˣ',26:'log',27:'FACT',28:'x!',29:'sin⁻¹',30:'cos⁻¹',31:'tan⁻¹',32:'调用',33:'←',34:'Abs',36:'带分数 ⇔ 假分数',37:'M−',39:'SOLVE',40:'d/dx',44:'设置'};
	const alphaLegends={16:'RanInt',17:'e',26:'A',27:'B',28:'C',29:'D',30:'E',31:'F',35:'x',36:'y',37:'M',39:'='};
	const modeLegends={22:'DEC',23:'HEX',24:'BIN',25:'OCT',33:'i / ∠'};

	const display={20:'▱⁄▱',21:'√',22:'x²',23:'xʸ',24:'logₐ',26:'(−)',27:'° ′ ″',28:'x⁻¹',40:'∫',41:'x',44:'菜单',45:'ON',46:'←',47:'→',48:'↑',49:'↓'};
	const order=Array.from({length:50},(_,i)=>i);
	for(const index of order) {
		const button=document.createElement('button');button.type='button';button.className='pad-key';button.dataset.index=index;
		button.setAttribute('aria-label',labels[index]);button.disabled=true;
		const rect=keyRects[index];
		Object.assign(button.style,{left:`${rect.x/344*100}%`,top:`${(rect.y-263)/432*100}%`,width:`${rect.w/344*100}%`,height:`${rect.h/432*100}%`});
		if(index>=42&&index<=45)button.classList.add('pad-round');
		if(index>=46)button.classList.add('pad-direction');
		if(index===42||index===43)button.setAttribute('aria-pressed','false');
		const label=document.createElement('span');label.textContent=display[index]||labels[index];button.append(label);
		const legends=document.createElement('small');legends.className='pad-legends';
		for(const [kind,text] of [['shift',shiftLegends[index]],['alpha',alphaLegends[index]],['mode',modeLegends[index]]]){
			if(!text)continue;const hint=document.createElement('span');hint.className=`legend-${kind}`;hint.textContent=text;legends.append(hint);
		}
		if(legends.childElementCount)button.append(legends);
		if(index===42)button.classList.add('pad-shift');if(index===43)button.classList.add('pad-alpha');
		if(index===3||index===4)button.classList.add('pad-clear');if(index===19)button.classList.add('pad-equals');
		if(index>=0&&index<=19)button.classList.add(index%5<3?'pad-digit':'pad-operator');
		bindKey(button,index);padElements[index]=button;
		$(index<20?'pad-numbers':'pad-functions').append(button);
	}
}
installPad();

function keyboardIndex(event) {
	const symbol = { '+':13, '-':14, '*':8, '/':9, '=':19, '(':34, ')':35, '^':23, '.':16 };
	const code = { Enter:19, NumpadEnter:19, Backspace:3, Delete:3, Escape:4, Space:4,
		F1:42, F2:43, F3:44, F4:45, F5:38, F6:39, F7:40, F8:41,
		ArrowLeft:46, ArrowRight:47, ArrowUp:48, ArrowDown:49 };
	if (Object.hasOwn(symbol, event.key)) return symbol[event.key];
	if (Object.hasOwn(code, event.code)) return code[event.code];
	if (/^[0-9]$/.test(event.key)) return labels.indexOf(event.key);
	if (event.code === 'KeyE') return 17;
	return -1;
}
document.addEventListener('keydown', event => {
	if(event.target.closest('#guide')) return;
	if(event.code==='Escape' && $('utilities').open) {
		$('utilities').open=false; event.preventDefault(); return;
	}
	if (event.ctrlKey || event.metaKey || event.altKey || ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) return;
	if (event.target.closest('button,summary,a') && ['Enter','Space'].includes(event.code)) return;
	const index = keyboardIndex(event);
	if (index < 0 || !emu || failed) return;
	event.preventDefault();
	if (!event.repeat) press(index, event.code);
});
document.addEventListener('keyup', event => { if (active?.owner === event.code) release(); });
function releaseAll() { pointer.abort(); release(); }
window.addEventListener('blur',releaseAll);
$('device').addEventListener('contextmenu',event=>event.preventDefault());

function repaint() {
	if(cover?.complete && cover.naturalWidth) drawSkin(context,cover,lcdCanvas,{smooth:smoothDisplay});
	padContext.clearRect(0,0,padCanvas.width,padCanvas.height);
	padContext.imageSmoothingEnabled=false;
	padContext.drawImage(lcdCanvas,0,0,padCanvas.width,padCanvas.height);
	if(emu){const modifiers=emu.readMemory(0xf800,2);for(const [index,offset] of [[42,0],[43,1]]){const selected=Boolean(modifiers[offset]&1);padElements[index]?.setAttribute('aria-pressed',String(selected));keyElements[index]?.setAttribute('aria-pressed',String(selected));}}
}
function resizeCanvas() {
	const box=$('device').getBoundingClientRect();
	const size=canvasResolution(box.width,box.height,window.devicePixelRatio*(window.visualViewport?.scale||1));
	if(canvas.width===size.width && canvas.height===size.height) return;
	canvas.width=size.width; canvas.height=size.height;
	context.setTransform(size.width/skin.width,0,0,size.height/skin.height,0,0);
	repaint();
}
function fitDevice() {
	if(window.visualViewport?.scale>1.01) { resizeCanvas(); return; }
	const viewportHeight=window.visualViewport?.height||innerHeight;
	document.documentElement.style.setProperty('--view-height',`${viewportHeight}px`);
	const tablet=matchMedia('(min-width:720px) and (min-height:500px)').matches;
	document.body.classList.toggle('tablet-layout',tablet);
	$('touch-panel').inert=!tablet;
	if(tablet&&!$('touch-panel').hidden&&getComputedStyle($('touch-panel')).display!=='none'){
		const panel=$('touch-panel'),panelStyle=getComputedStyle(panel),num=value=>parseFloat(value)||0;
		const insideWidth=panel.clientWidth-num(panelStyle.paddingLeft)-num(panelStyle.paddingRight);
		const room=viewportHeight-40-num(panelStyle.paddingTop)-num(panelStyle.paddingBottom)-panel.querySelector('.pad-heading').getBoundingClientRect().height-panel.querySelector('.pad-lcd').getBoundingClientRect().height-num(panelStyle.gap)*2;
		panel.style.setProperty('--keypad-width',`${Math.min(insideWidth,Math.max(1,room)*344/432)}px`);
	}

	const main=document.querySelector('.calculator-column'),style=getComputedStyle(main),px=value=>parseFloat(value)||0;
	const paddingX=px(style.paddingLeft)+px(style.paddingRight),paddingY=px(style.paddingTop)+px(style.paddingBottom);
	const fitScreen=document.body.classList.contains('fit-screen');
	const toolbar=document.querySelector('.toolbar').getBoundingClientRect().height;
	const layout=document.querySelector('main.page-layout'),layoutStyle=getComputedStyle(layout);
	const height=viewportHeight-px(layoutStyle.paddingTop)-px(layoutStyle.paddingBottom)-paddingY;
	const size=deviceLayout({width:main.clientWidth-paddingX,height,reserved:toolbar+24,coarse:matchMedia('(pointer:coarse)').matches,zoomed:document.body.classList.contains('zoomed'),fitScreen:fitScreen||tablet});
	const wrap=document.querySelector('.device-wrap');
	if(Math.abs(wrap.getBoundingClientRect().width-size.width)>.5)releaseAll();
	wrap.style.width=`${size.width}px`;
	$('zoom').hidden=fitScreen;
	$('fit-screen').setAttribute('aria-pressed',String(fitScreen));$('fit-screen').textContent=fitScreen?'退出整屏':'适应整屏';
	resizeCanvas();
}
$('fit-screen').addEventListener('click',()=>{
	releaseAll();document.body.classList.toggle('fit-screen');document.body.classList.remove('zoomed');
	$('zoom').setAttribute('aria-pressed','false');$('zoom').textContent='放大操作';window.scrollTo(0,0);fitDevice();
});
if(!matchMedia('(min-width:720px) and (min-height:500px)').matches)document.body.classList.add('fit-screen');

if(typeof ResizeObserver==='function') new ResizeObserver(resizeCanvas).observe($('device'));
document.addEventListener('guide-visibility',()=>{releaseAll();fitDevice();});
function updateNavigation() {
	const current=location.hash==='#guide' ? '#guide' : '#calculator';
	for(const link of document.querySelectorAll('.mobile-nav a')) {
		if(link.getAttribute('href')===current)link.setAttribute('aria-current','location');
		else link.removeAttribute('aria-current');
	}
}
window.addEventListener('hashchange',updateNavigation);updateNavigation();
window.addEventListener('resize',fitDevice);
window.visualViewport?.addEventListener('resize',fitDevice);
window.addEventListener('orientationchange',releaseAll);
fitDevice();

function persist() {
	if (!emu || failed || !autoSaveEnabled) return;
	try {
		const bytes = emu.save();
		if (!bytes) return;
		const value = btoa(String.fromCharCode(...bytes));
		if (value !== savedBytes) {
			localStorage.setItem(storageKey, value);
			savedBytes = value;
		}
	} catch {
		$('save-note').textContent = '浏览器无法自动保存，请使用「导出记忆」备份。';
	}
}
document.addEventListener('visibilitychange', () => {
	if (!emu || failed) return;
	if (document.hidden) { releaseAll(); persist(); emu.stop(); }
	else emu.start();
});
window.addEventListener('pagehide',()=>{releaseAll();persist();});
function download(blob, name) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url; link.download = name; link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('zoom').addEventListener('click', () => {
	const enabled = document.body.classList.toggle('zoomed');
	$('zoom').setAttribute('aria-pressed', String(enabled));
	$('zoom').textContent = enabled ? '适应屏幕' : '放大操作';
	fitDevice();
});
$('utilities').addEventListener('toggle',()=>{if($('utilities').open) releaseAll();});
document.addEventListener('pointerdown',event=>{
	if($('utilities').open && !event.target.closest('#utilities')) $('utilities').open=false;
});
$('shot').addEventListener('click', () => canvas.toBlob(blob => { if (blob) download(blob, 'fx991cnx.png'); }));
$('pixel-display').addEventListener('click',()=>{
	smoothDisplay=!smoothDisplay;
	$('pixel-display').setAttribute('aria-pressed',String(!smoothDisplay));
	$('display-note').textContent=smoothDisplay ? '当前：细腻显示，保留真机字形。' : '当前：原始点阵，像素边缘不做平滑。';
	repaint();
});
$('restart').addEventListener('click', () => {
	releaseAll();
	const paused=emu.paused;
	emu.setPaused(false); emu.reset(); emu.runFor(1000); emu.setPaused(paused);
	setStatus(paused ? '计算器已暂停' : '计算器已就绪');
});
$('pause').addEventListener('click', () => {
	releaseAll(); emu.setPaused(!emu.paused);
	$('pause').setAttribute('aria-pressed', String(emu.paused));
	$('pause').textContent = emu.paused ? '继续运行' : '暂停运行';
	setStatus(emu.paused ? '计算器已暂停' : '计算器已就绪 · 支持键盘与触控');
});
$('export').addEventListener('click', () => {
	const bytes = emu.save();
	if (bytes) download(new Blob([bytes], { type:'application/octet-stream' }), 'fx991cnx-memory.bin');
});
$('import').addEventListener('click', () => $('memory-file').click());
$('memory-file').addEventListener('change', async event => {
	const file = event.target.files[0];
	if (!file) return;
	try {
		const size = emu.Module._emu_web_save_size();
		if (file.size !== size) throw new Error(`请选择本机型的 ${size} 字节记忆备份`);
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (!confirm('导入将替换当前计算器记忆。建议先导出备份，是否继续？')) return;
		releaseAll();
		if (!emu.load(bytes)) throw new Error('记忆导入失败');
		autoSaveEnabled = true;
		$('save-note').textContent = '记忆保存在本机，不上传计算数据。';
		emu.reset(); emu.runFor(1000); persist();
		setStatus('记忆已导入' + (emu.paused ? ' · 已暂停' : ''));
	} catch (error) { setStatus(error.message, true); }
	finally { event.target.value = ''; }
});

async function boot() {
	cover = new Image();
	cover.src = './assets/source-cover.png';
	await cover.decode();
	drawSkin(context,cover);
	emu = await CasioEmu.create({
		modelUrl:'../release/fx991cnx/',
		scriptUrl:new URL('../CasioEmuNeo-master/web/dist/casioemu_web.js', import.meta.url).href,
		onLog:text => console.debug('[calculator]', text),
	});
	if(emu.buttons.length!==keyRects.length || emu.deviceWidth!==284 || emu.deviceHeight!==597) throw new Error('写实面板与机型定义不匹配');
	emu.onFrame = image => {
		const registers=emu.readMemory(0xf031,2);
		const memory=emu.readMemory(0xf800,64*32);
		lcdContext.putImageData(new ImageData(lcdRaster(image,registers[1],registers[0],memory),lcdCanvas.width,lcdCanvas.height),0,0);
		repaint();
	};
	emu.onError = fail;
	try {
		const stored = localStorage.getItem(storageKey);
		if (stored) {
			const bytes = Uint8Array.from(atob(stored), value => value.charCodeAt(0));
			if (bytes.length !== emu.Module._emu_web_save_size() || !emu.load(bytes)) throw new Error('Invalid memory');
			savedBytes = stored;
			emu.reset();
		}
	} catch {
		// Keep an unreadable existing backup intact until the user chooses recovery.
		autoSaveEnabled = false;
		$('save-note').textContent = '无法恢复原有记忆，自动保存已暂停。可先导出当前记忆，再手动导入有效备份。';
	}
	installKeys();
	for(const button of padElements)button.disabled=false;
	fitDevice();
	emu.runFor(1600);
	emu._publish();
	if (failed) return;
	emu.start();
	$('device').setAttribute('aria-busy', 'false');
	for (const button of document.querySelectorAll('#zoom,.tools button,.backup-tools button')) button.disabled = false;
	setStatus('计算器已就绪 · 支持键盘与触控');
	setInterval(persist, 3000);
}
boot().catch(fail);
