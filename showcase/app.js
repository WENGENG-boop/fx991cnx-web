// Presentation only: no emulator, WASM or ROM is loaded on this page.
const calculatorUrl = 'http://127.0.0.1:5173/frontend/';
for (const link of document.querySelectorAll('[data-calculator-link]')) link.href = calculatorUrl;

const body = document.body, $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let motion = !reduced;
try { if (localStorage.getItem('showcase-motion') === 'off') motion = false; } catch {}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - t, 4);
const LCD_INK = '29,41,33';

/* ---------- Real LCD frames, recorded from the ROM by tools/capture-lcd.mjs ---------- */
let lcdFrames = null, lcdSeqs = null;
const lcdReady = fetch('./assets/lcd-frames.json').then(r => r.json()).then(data => {
	// 24 bytes per row, most significant bit = leftmost dot.
	lcdFrames = data.frames.map(b64 => {
		const raw = atob(b64), bits = new Uint8Array(192 * 63);
		for (let i = 0; i < bits.length; i++) bits[i] = (raw.charCodeAt((i / 192 | 0) * 24 + ((i % 192) >> 3)) >> (7 - (i & 7))) & 1;
		return bits;
	});
	lcdSeqs = data.sequences;
}).catch(() => {});
const STEP_MS = 340, FIRST_MS = 700, HOLD_MS = 2600;
const seqLength = steps => FIRST_MS + (steps.length - 2) * STEP_MS + HOLD_MS;
// Step 0 is the cleared screen, then one recorded step per key; the last step holds.
// Each step has two captures 500 ms apart, so the cursor blinks like the real unit.
function frameAt(steps, t, now) {
	const k = t < FIRST_MS ? 0 : Math.min(steps.length - 1, 1 + Math.floor((t - FIRST_MS) / STEP_MS));
	return lcdFrames[steps[k].frames[(now / 500 | 0) % 2]];
}
// Canvas + cached unlit-dot background; regions copy rectangles of the 192×63 frame.
function makeLcd(canvas) {
	const ctx = canvas.getContext('2d'), back = document.createElement('canvas');
	const lcd = { w: 0, h: 0, layout: null,
		resize(w, h, ratio, layout, gridAll) {
			lcd.w = w; lcd.h = h; lcd.layout = layout;
			for (const c of [canvas, back]) { c.width = Math.round(w * ratio); c.height = Math.round(h * ratio); }
			ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
			const b = back.getContext('2d'); b.setTransform(ratio, 0, 0, ratio, 0, 0);
			const g = b.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#dae8e1'); g.addColorStop(1, '#c6dfd2');
			b.fillStyle = g; b.fillRect(0, 0, w, h);
			const { dot, ox, oy } = layout, s = dot * .86;
			b.fillStyle = `rgba(${LCD_INK},.055)`;
			if (gridAll) { for (let y = oy - Math.ceil(oy / dot) * dot; y < h; y += dot) for (let x = ox - Math.ceil(ox / dot) * dot; x < w; x += dot) b.fillRect(x, y, s, s); }
			else for (const r of layout.regions) for (let y = 0; y < r.sh; y++) for (let x = 0; x < r.sw; x++) b.fillRect(ox + (r.dx + x) * dot, oy + (r.dy + y) * dot, s, s);
		},
		paint(bits) {
			ctx.clearRect(0, 0, lcd.w, lcd.h); ctx.drawImage(back, 0, 0, lcd.w, lcd.h);
			if (!bits || !lcd.layout) return;
			const { dot, ox, oy, regions } = lcd.layout, s = dot * .86;
			ctx.fillStyle = `rgb(${LCD_INK})`;
			for (const r of regions) for (let y = 0; y < r.sh; y++) for (let x = 0; x < r.sw; x++)
				if (bits[(r.sy + y) * 192 + r.sx + x]) ctx.fillRect(ox + (r.dx + x) * dot, oy + (r.dy + y) * dot, s, s);
		},
	};
	return lcd;
}
const FULL = { sx: 0, sy: 0, sw: 192, sh: 63, dx: 0, dy: 0 };

/* ---------- Faceplate ---------- */
const deviceWrap = $('device-wrap'), device = $('device'), bodyCanvas = $('body');
const coverReady = new Promise(resolve => {
	const cover = new Image();
	cover.onload = () => {
		const ctx = bodyCanvas.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		// Same crop as frontend/skin.js (x=68, y=0, 344×720), drawn at 2×.
		ctx.drawImage(cover, 68, 0, 344, 720, 0, 0, 688, 1440);
		clearBackdrop(ctx, 688, 1440);
		bodyCanvas.dataset.ready = 'true'; resolve();
	};
	cover.onerror = resolve;
	cover.src = './assets/source-cover.png';
});
// The photo sits on white; flood-fill that backdrop to transparent from the edges.
function clearBackdrop(ctx, w, h) {
	const img = ctx.getImageData(0, 0, w, h), d = img.data, seen = new Uint8Array(w * h), stack = [];
	const light = i => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 28; };
	for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
	for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
	while (stack.length) {
		const i = stack.pop();
		if (seen[i] || !light(i)) continue;
		seen[i] = 1; d[i * 4 + 3] = 0;
		const x = i % w;
		if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
		if (i >= w) stack.push(i - w); if (i < w * (h - 1)) stack.push(i + w);
	}
	ctx.putImageData(img, 0, 0);
}

/* ---------- Small LCD inside the device: the recorded ROM sequences on loop ---------- */
const small = makeLcd($('lcd'));
const PLAYLIST = ['add', 'fraction', 'root', 'power'];
let smallStart = 0;
function sizeSmall() {
	const el = $('lcd'), w = el.offsetWidth, h = el.offsetHeight, dot = Math.min(w / 198, h / 69);
	small.resize(w, h, Math.min(devicePixelRatio || 1, 2) * 2, { dot, ox: (w - 192 * dot) / 2, oy: (h - 63 * dot) / 2, regions: [FULL] }, false);
}
function drawSmall(now) {
	if (!lcdFrames) return small.paint(null);
	if (!motion) { const s = lcdSeqs.add; return small.paint(lcdFrames[s[s.length - 1].frames[0]]); }
	const t = now - smallStart;
	if (t < 0) return small.paint(lcdFrames[lcdSeqs.add[0].frames[0]]);
	let local = t % PLAYLIST.reduce((sum, name) => sum + seqLength(lcdSeqs[name]), 0), i = 0;
	while (local >= seqLength(lcdSeqs[PLAYLIST[i]])) local -= seqLength(lcdSeqs[PLAYLIST[i++]]);
	small.paint(frameAt(lcdSeqs[PLAYLIST[i]], local, now));
}

/* ---------- Full-screen LCD at the end of the zoom: 192×63 = 12096, typed on the ROM ---------- */
const screen = $('screen'), big = makeLcd($('matrix-lcd'));
let bigStart = -1;
// Bounding box of lit dots in rows [y0, y1) across a sequence's final frame.
function litBox(bits, y0, y1) {
	let a = 192, b = -1, c = 63, d = -1;
	for (let y = y0; y < y1; y++) for (let x = 0; x < 192; x++) if (bits[y * 192 + x]) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
	return { x: a, y: c, w: b - a + 1, h: d - c + 1 };
}
function sizeBig() {
	const w = innerWidth, h = innerHeight, g = Math.max(20, w * .03), ratio = Math.min(devicePixelRatio || 1, 2);
	let layout;
	if (w >= 760 || !lcdFrames) {
		const dot = Math.floor(Math.min((w - 2 * g) / 192, h * .56 / 63) * 4) / 4;
		layout = { dot, ox: Math.round((w - 192 * dot) / 2), oy: Math.round(h * .13), regions: [FULL] };
	} else {
		// Narrow screens: show the formula and the result as two real crops of the frame.
		const steps = lcdSeqs.product, last = lcdFrames[steps[steps.length - 1].frames[0]];
		const input = litBox(last, 0, 32), output = litBox(last, 32, 63);
		input.w += 4; input.y = Math.max(0, input.y - 1); input.h += 2;
		const span = Math.max(input.w, output.w), dot = Math.floor(Math.min((w - 2 * g) / span, h * .5 / (input.h + output.h + 6)) * 4) / 4;
		layout = { dot, ox: Math.round(g), oy: Math.round(h * .15), regions: [
			{ sx: input.x, sy: input.y, sw: input.w, sh: input.h, dx: 0, dy: 0 },
			{ sx: output.x, sy: output.y, sw: output.w, sh: output.h, dx: span - output.w, dy: input.h + 6 },
		] };
	}
	big.resize(w, h, ratio, layout, true);
}
function drawBig(now) {
	if (!lcdFrames) return big.paint(null);
	const steps = lcdSeqs.product;
	big.paint(frameAt(steps, motion && bigStart >= 0 ? now - bigStart : 1e9, now));
}

/* ---------- Scroll scenes ---------- */
const hero = $('top'), giant = document.querySelector('.giant'), callouts = document.querySelector('.callouts');
const fadeOnZoom = [document.querySelector('.hero-text'), document.querySelector('.hero-note'), document.querySelector('.orbit'), document.querySelector('.scroll-cue')];
const bar = document.querySelector('.bar'), stack = $('stack'), iso = $('iso'), plates = [...iso.children], layers = [...$('layers').children];
const progress = el => { const r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };
let screenShown = false;
function updateScenes() {
	const vw = innerWidth, vh = innerHeight;
	if (!motion) {
		bar.classList.toggle('on-signal', finale.getBoundingClientRect().top < 40);
		device.style.transform = ''; giant.style.transform = ''; callouts.style.setProperty('--fade', 1);
		for (const el of fadeOnZoom) el.style.opacity = '';
		screen.classList.remove('on'); screenShown = false;
		iso.style.setProperty('--sep', 1); setLayer(-1, true);
		return;
	}
	// Hero: hold, then dolly into the LCD, then hand off to the full-screen matrix.
	const p = progress(hero), z = smooth(.1, .62, p);
	const W = deviceWrap.offsetWidth, H = deviceWrap.offsetHeight, r = deviceWrap.getBoundingClientRect();
	const S = Math.max(vw * 1.2 / (W * .80523), vh * 1.2 / (H * .15556));
	const tx = vw / 2 - (r.left + W * .5015), ty = vh / 2 - (r.top + H * .22084);
	const e = Math.pow(z, 2.6);
	device.style.transform = `translate3d(${(tx * z).toFixed(1)}px,${(ty * z).toFixed(1)}px,0) scale(${(1 + (S - 1) * e).toFixed(4)})`;
	const fade = 1 - smooth(.08, .26, p);
	giant.style.transform = `translateX(${(-z * 22).toFixed(2)}vw) scale(${(1 + z * .25).toFixed(3)})`;
	if (body.classList.contains('settled')) { giant.style.opacity = fade; for (const el of fadeOnZoom) el.style.opacity = fade; }
	callouts.style.setProperty('--fade', fade.toFixed(3));
	const s = smooth(.52, .62, p);
	screen.style.opacity = s.toFixed(3);
	screen.classList.toggle('on', s > 0);
	screen.style.setProperty('--cap', smooth(.66, .78, p).toFixed(3));
	if (s > .5 && !screenShown) { screenShown = true; bigStart = performance.now(); kick(); }
	if (s < .05) screenShown = false;

	// Header and cursor switch to ink over the signal-orange finale.
	const onSignal = finale.getBoundingClientRect().top < 40;
	bar.classList.toggle('on-signal', onSignal); cursor.classList.toggle('on-signal', onSignal);

	// Stack: plates separate, layers activate one by one.
	const q = progress(stack);
	iso.style.setProperty('--sep', smooth(.04, .38, q).toFixed(3));
	iso.style.transform = `rotateX(${57 - q * 6}deg) rotateZ(${-42 + q * 14}deg) translateZ(calc(var(--s) * -0.4))`;
	setLayer(Math.min(3, Math.floor(smooth(.08, .92, q) * 4)));
}
let currentLayer = -2;
function setLayer(i, all = false) {
	if (i === currentLayer && !all) return;
	currentLayer = i;
	layers.forEach((li, k) => li.classList.toggle('on', all || k === i));
	plates.forEach((pl, k) => pl.classList.toggle('on', !all && k === i));
}
addEventListener('scroll', updateScenes, { passive: true });

/* ---------- Scroll snapping: hero, full screen, each stack layer, then sections ---------- */
// Invert smoothstep so a snap lands in the middle of each layer's range.
const unsmooth = v => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (m * m * (3 - 2 * m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
function placeSnaps() {
	for (const el of document.querySelectorAll('div.snap')) el.remove();
	// Enabled only once the intro has finished; turning snapping on mid-load makes Chrome pick a wrong target.
	const on = motion && body.classList.contains('ready');
	const y = scrollY;
	document.documentElement.classList.toggle('snapping', on);
	if (!on) return;
	const add = (section, p) => {
		const marker = document.createElement('div');
		marker.className = 'snap'; marker.style.top = Math.round(p * (section.offsetHeight - innerHeight)) + 'px';
		section.append(marker);
	};
	add(hero, 0); add(hero, .9);
	for (let i = 0; i < 4; i++) add(stack, .08 + unsmooth((i + .5) / 4) * .84);
	if (Math.abs(scrollY - y) > 2) scrollTo(0, y);
}

/* ---------- Render loop (only while something animates) ---------- */
let frameId = 0, lastDraw = 0, heroVisible = true, finaleVisible = false;
function loop(now) {
	frameId = 0;
	let again = false;
	if (heroVisible && (motion || !lastDraw)) {
		if (now - lastDraw > 33) {
			lastDraw = now;
			if (!screenShown || parseFloat(screen.style.opacity || 0) < 1) drawSmall(now);
			if (screen.classList.contains('on')) drawBig(now);
		}
		again = motion;
	}
	if (finaleVisible) again = drawField(now) || again;
	if (again && !document.hidden) frameId = requestAnimationFrame(loop);
}
function kick() { if (!frameId) frameId = requestAnimationFrame(loop); }
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; if (heroVisible) kick(); }).observe(hero);
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

/* ---------- Finale: magnetic dot field ---------- */
const field = $('field'), fctx = field.getContext('2d'), finale = $('finale');
let dots = [], fw = 0, fh = 0, pitch = 26, ripples = [], idleUntil = 0;
const fmouse = { x: -1e4, y: -1e4 };
function buildField() {
	const ratio = Math.min(devicePixelRatio || 1, 2);
	fw = field.offsetWidth; fh = field.offsetHeight; field.width = Math.round(fw * ratio); field.height = Math.round(fh * ratio);
	fctx.setTransform(ratio, 0, 0, ratio, 0, 0);
	pitch = fw < 600 ? 20 : 26;
	dots = [];
	for (let y = pitch / 2; y < fh; y += pitch) for (let x = pitch / 2; x < fw; x += pitch) dots.push({ hx: x, hy: y, x, y, vx: 0, vy: 0, g: 0 });
}
function drawField(now) {
	const R = 150, active = motion && (fmouse.x > -1e3 || ripples.length || now < idleUntil);
	fctx.clearRect(0, 0, fw, fh);
	ripples = ripples.filter(r => now - r.t < 1600);
	let energy = 0;
	for (const d of dots) {
		let ax = (d.hx - d.x) * .08, ay = (d.hy - d.y) * .08, glow = 0;
		if (motion) {
			const dx = d.hx - fmouse.x, dy = d.hy - fmouse.y, dist = Math.hypot(dx, dy);
			if (dist < R) { const k = 1 - dist / R; ax += dx / (dist || 1) * k * 3.2; ay += dy / (dist || 1) * k * 3.2; glow = k; }
			for (const r of ripples) {
				const age = now - r.t, front = age * .9, rx = d.hx - r.x, ry = d.hy - r.y, rd = Math.hypot(rx, ry), band = Math.abs(rd - front);
				if (band < 40) { const k = (1 - band / 40) * (1 - age / 1600); ax += rx / (rd || 1) * k * 5; ay += ry / (rd || 1) * k * 5; glow = Math.max(glow, k); }
			}
		}
		d.vx = (d.vx + ax) * .78; d.vy = (d.vy + ay) * .78; d.x += d.vx; d.y += d.vy;
		d.g += (glow - d.g) * .2;
		energy += Math.abs(d.vx) + Math.abs(d.vy);
		const size = 2 + d.g * 7;
		fctx.fillStyle = d.g > .02 ? `rgba(14,14,12,${.28 + d.g * .72})` : 'rgba(14,14,12,.28)';
		fctx.fillRect(d.x - size / 2, d.y - size / 2, size, size);
	}
	return active || energy > dots.length * .01;
}
finale.addEventListener('pointermove', e => { const r = field.getBoundingClientRect(); fmouse.x = e.clientX - r.left; fmouse.y = e.clientY - r.top; kick(); });
for (const type of ['pointerleave', 'pointercancel']) finale.addEventListener(type, () => { fmouse.x = fmouse.y = -1e4; idleUntil = performance.now() + 900; kick(); });
finale.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { fmouse.x = fmouse.y = -1e4; idleUntil = performance.now() + 900; kick(); } });
finale.addEventListener('pointerdown', e => {
	if (!motion || e.target.closest('a')) return;
	const r = field.getBoundingClientRect(); ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }); kick();
});
new IntersectionObserver(([e]) => { finaleVisible = e.isIntersecting; if (finaleVisible) { if (!dots.length) buildField(); kick(); } }).observe(finale);

/* ---------- Numbers ---------- */
const fmt = new Intl.NumberFormat('en-US');
const rows = [...document.querySelectorAll('.numbers li')];
const counted = new IntersectionObserver(entries => {
	for (const e of entries) if (e.isIntersecting) {
		counted.unobserve(e.target); e.target.classList.add('seen');
		const el = e.target.querySelector('[data-count]'), target = Number(el.dataset.count);
		if (!motion || !target) { el.textContent = fmt.format(target); continue; }
		const start = performance.now();
		(function step(now) { const t = clamp((now - start) / 1600); el.textContent = fmt.format(Math.round(target * easeOut(t))); if (t < 1) requestAnimationFrame(step); })(start);
	}
}, { threshold: .4 });
for (const row of rows) { if (motion) { row.classList.add('reveal-row'); row.querySelector('[data-count]').textContent = '0'; } counted.observe(row); }

/* ---------- Cursor + clock ---------- */
const cursor = document.querySelector('.cursor'), ring = cursor.querySelector('.ring'), coord = cursor.querySelector('.coord');
let cx = -100, cy = -100, rx = -100, ry = -100, cursorFrame = 0;
function cursorLoop() {
	rx += (cx - rx) * .2; ry += (cy - ry) * .2;
	ring.style.transform = `translate(${rx}px,${ry}px)`; coord.style.transform = `translate(${cx}px,${cy}px)`;
	cursorFrame = Math.abs(cx - rx) + Math.abs(cy - ry) > .3 ? requestAnimationFrame(cursorLoop) : 0;
}
addEventListener('pointermove', e => {
	if (e.pointerType !== 'mouse' || !finePointer.matches) return;
	cx = e.clientX; cy = e.clientY;
	cursor.classList.add('on');
	cursor.classList.toggle('hot', !!e.target.closest?.('a,button'));
	coord.textContent = `X ${String(Math.round(e.pageX)).padStart(4, '0')} · Y ${String(Math.round(e.pageY)).padStart(4, '0')}`;
	if (!cursorFrame) cursorFrame = requestAnimationFrame(cursorLoop);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('on'));
const clock = $('clock');
const tickClock = () => { clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false }) + ' LOCAL'; };
tickClock(); setInterval(tickClock, 1000);

/* ---------- Motion toggle ---------- */
const motionButton = $('motion');
function applyMotion() {
	body.classList.toggle('still', !motion);
	motionButton.textContent = motion ? '动效 · 开' : '动效 · 关';
	motionButton.setAttribute('aria-pressed', String(motion));
	if (!motion) for (const row of rows) { row.classList.add('seen'); const el = row.querySelector('[data-count]'); el.textContent = fmt.format(Number(el.dataset.count)); }
	placeSnaps();
	sizeSmall(); drawSmall(performance.now());
	updateScenes(); lastDraw = 0; kick();
}
motionButton.addEventListener('click', () => {
	motion = !motion;
	try { localStorage.setItem('showcase-motion', motion ? 'on' : 'off'); } catch {}
	if (motion) smallStart = performance.now();
	applyMotion();
	if (dots.length) { buildField(); kick(); }
});

let resizeTimer = 0;
addEventListener('resize', () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => { placeSnaps(); sizeSmall(); sizeBig(); if (dots.length) buildField(); updateScenes(); lastDraw = 0; kick(); }, 120);
});

/* ---------- Boot ---------- */
sizeBig();
applyMotion();
const loaderNum = document.querySelector('.loader-num'), loaderBar = document.querySelector('.loader-bar i');
async function boot() {
	if (motion) {
		const start = performance.now(), minimum = 1100;
		let loaded = false; Promise.all([coverReady, lcdReady]).then(() => { loaded = true; });
		await new Promise(resolve => (function step(now) {
			const t = clamp((now - start) / minimum), shown = loaded ? t : Math.min(t, .9);
			const n = Math.round(easeOut(shown) * 100);
			loaderNum.textContent = String(n).padStart(3, '0'); loaderBar.style.width = n + '%';
			if (shown >= 1) resolve(); else requestAnimationFrame(step);
		})(start));
	} else await coverReady;
	await lcdReady;
	sizeSmall(); sizeBig(); lastDraw = 0;
	body.classList.remove('loading'); body.classList.add('ready');
	placeSnaps();
	smallStart = performance.now() + 700;
	setTimeout(() => { body.classList.add('settled'); updateScenes(); }, 2400);
	updateScenes(); kick();
}
boot();
