// Independent presentation only; no calculator code, ROM or WASM is imported.
const calculatorUrl='http://127.0.0.1:5173/frontend/';
for(const link of document.querySelectorAll('[data-calculator-link]'))link.href=calculatorUrl;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const menu=document.querySelector('.menu-button'),navigation=document.getElementById('navigation'),about=document.getElementById('about');
function closeMenu(){navigation.classList.remove('open');menu.setAttribute('aria-expanded','false');}
menu.addEventListener('click',()=>{const open=navigation.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
navigation.addEventListener('click',event=>{if(event.target.closest('a,button'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&navigation.classList.contains('open')){closeMenu();menu.focus();}});
window.addEventListener('resize',()=>{if(innerWidth>719)closeMenu();});
for(const button of document.querySelectorAll('[data-about]'))button.addEventListener('click',()=>{
	about.open=true;about.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});about.querySelector('summary').focus({preventScroll:true});
});
const product=document.getElementById('product'),context=product.getContext('2d'),cover=new Image();
const toggle=document.getElementById('motion-toggle'),replay=document.getElementById('intro-replay');
const field=document.getElementById('field'),drawing=field.getContext('2d');
let motionEnabled=!reduced.matches,ready=false,frameId=0,started=0;
const duration=6200;
let geometry={width:0,height:0,cx:0,cy:0};
function resizeField(){
	const box=field.getBoundingClientRect(),scene=document.getElementById('product-scene').getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
	field.width=Math.round(box.width*ratio);field.height=Math.round(box.height*ratio);drawing.setTransform(ratio,0,0,ratio,0,0);
	geometry={width:box.width,height:box.height,cx:scene.left-box.left+scene.width/2,cy:scene.top-box.top+scene.height/2};
}
function renderField(elapsed){
	const {width,height,cx,cy}=geometry,progress=Math.min(elapsed/duration,1);
	drawing.clearRect(0,0,width,height);
	// One cinematic light pulse and outward streaks, ending in a quiet backdrop.
	const energy=Math.sin(Math.PI*Math.min(elapsed/4400,1)),radius=Math.max(width,height)*(.25+progress*.65);
	const light=drawing.createRadialGradient(cx,cy,0,cx,cy,radius);
	light.addColorStop(0,`rgba(180,237,108,${.07+energy*.19})`);light.addColorStop(1,'rgba(180,237,108,0)');
	drawing.fillStyle=light;drawing.fillRect(0,0,width,height);
	if(elapsed>900&&elapsed<4400){
		drawing.save();drawing.globalAlpha=energy*.5;
		for(let i=0;i<36;i++){
			const angle=i*2.39996,r=60+((elapsed-900)*.22+i*29)%Math.max(width,height),length=20+energy*100;
			drawing.beginPath();drawing.moveTo(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r);
			drawing.lineTo(cx+Math.cos(angle)*(r+length),cy+Math.sin(angle)*(r+length));
			drawing.strokeStyle=i%3?'#d4ff7640':'#efffca90';drawing.lineWidth=i%3?.6:1.2;drawing.stroke();
		}
		drawing.restore();
	}
}
function tick(time){
	frameId=0;if(!started)started=time;
	const elapsed=time-started;renderField(elapsed);
	if(elapsed<duration&&motionEnabled&&!document.hidden)frameId=requestAnimationFrame(tick);
	else {document.body.classList.remove('intro-playing');document.body.classList.add('intro-complete');renderField(duration);}
}
function playIntro(){
	cancelAnimationFrame(frameId);frameId=0;started=0;
	document.body.classList.remove('intro-playing','intro-complete');
	resizeField();
	if(!ready||!motionEnabled){renderField(duration);document.body.classList.add('intro-complete');return;}
	// Reflow restarts the complete timeline, including the title and lighting.
	void document.body.offsetWidth;document.body.classList.add('intro-playing');
	frameId=requestAnimationFrame(tick);
}
function updateMotion(){
	document.body.classList.toggle('motion-off',!motionEnabled);toggle.setAttribute('aria-pressed',String(motionEnabled));
	toggle.textContent=reduced.matches?'动效：关（系统）':motionEnabled?'动效：开':'动效：关';toggle.disabled=reduced.matches;
	replay.disabled=!motionEnabled||!ready;
	playIntro();
}
cover.src='./assets/source-cover.png';
cover.decode().then(()=>{
	context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(cover,68,0,344,720,0,0,product.width,product.height);
	product.dataset.ready='true';ready=true;document.body.classList.add('product-ready');updateMotion();
}).catch(()=>{document.getElementById('asset-error').hidden=false;document.body.classList.add('intro-complete');});
replay.addEventListener('click',playIntro);
toggle.addEventListener('click',()=>{motionEnabled=!motionEnabled;updateMotion();});
reduced.addEventListener('change',()=>{motionEnabled=!reduced.matches;updateMotion();});
window.addEventListener('resize',()=>{resizeField();if(!frameId)renderField(duration);});
document.addEventListener('visibilitychange',()=>{
	if(document.hidden){cancelAnimationFrame(frameId);frameId=0;document.body.classList.remove('intro-playing');document.body.classList.add('intro-complete');renderField(duration);}
});
updateMotion();
