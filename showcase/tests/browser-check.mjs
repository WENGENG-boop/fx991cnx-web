// Optional QA: node showcase/tests/browser-check.mjs <playwright-core/index.mjs> <chrome.exe> [url]
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const url = process.argv[4] || 'http://127.0.0.1:5176/';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../qa-output');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
const report = { url, scope: 'Chromium, simulated viewports', checks: [], errors: [] };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Scroll to a fraction of a pinned scene's scroll range.
const scrollScene = (page, id, p) => page.evaluate(([id, p]) => {
	const el = document.getElementById(id), top = el.getBoundingClientRect().top + scrollY;
	scrollTo(0, top + (el.offsetHeight - innerHeight) * p);
}, [id, p]);
const darkPixels = (page, id) => page.evaluate(id => {
	const c = document.getElementById(id), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
	let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 200 && d[i] < 90) n++; return n;
}, id);
try {
	for (const [name, width, height, touch, reducedMotion] of [
		['desktop', 1440, 900, false, 'no-preference'], ['laptop', 1280, 720, false, 'no-preference'],
		['ipad', 820, 1180, true, 'no-preference'], ['phone', 390, 844, true, 'no-preference'],
		['small-phone', 320, 568, true, 'no-preference'], ['reduced', 1280, 800, false, 'reduce'],
	]) {
		const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, reducedMotion });
		const page = await context.newPage(), requests = [];
		page.on('pageerror', e => report.errors.push(`${name}: ${e.message}`));
		page.on('console', m => { if (m.type() === 'error') report.errors.push(`${name}: ${m.text()}`); });
		page.on('response', r => { if (r.status() >= 400) report.errors.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
		page.on('request', r => requests.push(r.url()));
		await page.goto(url);
		if (reducedMotion === 'no-preference') { await wait(500); await page.screenshot({ path: path.join(out, `${name}-0-loader.png`) }); }
		await page.waitForSelector('body.ready');
		await wait(2600); await page.screenshot({ path: path.join(out, `${name}-1-hero.png`) });
		assert.ok(!requests.some(u => /\.wasm|rom\.bin|casioemu/.test(u)), 'must not load calculator resources');
		assert.ok(await darkPixels(page, 'lcd') > 0, 'device LCD draws dots');
		if (reducedMotion === 'no-preference') {
			const snaps = await page.evaluate(() => [...document.querySelectorAll('div.snap')].map(m => Math.round(m.getBoundingClientRect().top + scrollY)));
			assert.equal(snaps.length, 6, 'snap markers');
			if (!touch) {
				await page.mouse.move(width / 2, height / 2); await page.mouse.wheel(0, 240); await wait(1600);
				const y = await page.evaluate(() => Math.round(scrollY));
				assert.ok(snaps.some(s => Math.abs(s - y) <= 2), `wheel should settle on a snap point, got ${y}`);
				await page.screenshot({ path: path.join(out, `${name}-2-snapped.png`) });
			}
			await scrollScene(page, 'top', .9); await wait(2200); await page.screenshot({ path: path.join(out, `${name}-3-screen.png`) });
			assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('screen')).opacity), '1');
			assert.ok(await darkPixels(page, 'matrix-lcd') > 0, 'full-screen LCD draws dots');
			await scrollScene(page, 'stack', .15); await wait(900); await page.screenshot({ path: path.join(out, `${name}-4-stack-a.png`) });
			await scrollScene(page, 'stack', .85); await wait(900); await page.screenshot({ path: path.join(out, `${name}-5-stack-b.png`) });
			assert.equal(await page.locator('.layers li.on').count(), 1);
		} else {
			assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.pin')).position), 'relative');
			await page.locator('#stack').scrollIntoViewIfNeeded(); await wait(300); await page.screenshot({ path: path.join(out, `${name}-4-stack.png`) });
		}
		await page.locator('#numbers').scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 200)); await wait(2000);
		await page.screenshot({ path: path.join(out, `${name}-6-numbers.png`) });
		await page.evaluate(() => document.getElementById('finale').scrollIntoView({ behavior: 'instant' })); await wait(600);
		if (!touch) {
			const box = await page.locator('#field').boundingBox();
			await page.mouse.move(box.x + box.width * .55, box.y + box.height * .35, { steps: 10 });
			await page.mouse.down(); await page.mouse.up(); await wait(350);
		}
		await page.screenshot({ path: path.join(out, `${name}-7-finale.png`) });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
		assert.equal(await page.locator('[data-calculator-link]').count(), 3);
		report.checks.push(`${name}: ok`);
		await context.close();
	}
	assert.deepEqual(report.errors, []);
	report.result = 'pass';
} catch (error) { report.result = 'fail'; report.failure = String(error.stack || error); process.exitCode = 1; }
finally { await browser.close(); await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
