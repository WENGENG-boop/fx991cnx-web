// Optional QA only: existing playwright-core module and Chromium executable.
import assert from 'node:assert/strict';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const {chromium}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),workspace=path.dirname(root),out=path.join(root,'qa-output');
await mkdir(out,{recursive:true});
const report={result:'pending',scope:'independent site / Chromium; viewports are simulated, not real devices',checks:[],errors:[],calculatorFilesUnchanged:false};
const protectedFiles={
	'frontend/index.html':'20D2601CB66B122BBC13E9CD2F4F2ED725EDD7B0598EC43EBAB686512C2E9480',
	'frontend/app.js':'BEB19B245564C83EC2C5DC507B0C11B37023C5F1C439DB5A5607C8C9974D520F',
	'frontend/style.css':'AC80371714172F6EFA15C59F7EDDB8889EDFFBDC0C85CCD5B78D18B5A12B07D2',
	'frontend/guide.js':'6ECFD9141AA55B419807072BCFEC02FFBAF120E34463292ACD4011F1BB7BD040',
	'frontend/skin.js':'BCD2A00A770D052972B00F2796757A3A62F92532F634535FAFE75F03A45E9B44',
	'AGENTS.md':'6134D152269C0245DBAD1DF7B55C70229D09780434CAC91B22932D42BD62E5A9',
};
try {
	for(const [name,width,height,touch] of [['desktop',1440,1000,false],['laptop',1280,800,false],['phone',390,844,true],['small-phone',320,568,true],['ipad',820,1180,true],['ipad-landscape',1180,820,true]]) {
		const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});
		const page=await context.newPage(),requests=[];page.on('pageerror',e=>report.errors.push(`${name}: ${e.message}`));
		page.on('request',request=>requests.push(request.url()));
		page.on('response',response=>{if(response.status()>=400)report.errors.push(`${name}: HTTP ${response.status()}`);});
		await page.goto('http://127.0.0.1:5175/');await page.waitForSelector('#product[data-ready="true"]');
		assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('.calc-key').count(),0);
		assert.ok(!requests.some(url=>/\.wasm|rom\.bin|casioemu|:5173/.test(url)),'Presentation must not load calculator resources');
		assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: horizontal overflow`);
		assert.equal(await page.locator('[data-calculator-link]').count(),2);
		for(const link of await page.locator('[data-calculator-link]').all()) {assert.equal(await link.getAttribute('href'),'http://127.0.0.1:5173/frontend/');assert.equal(await link.getAttribute('target'),'_blank');}
		await page.evaluate(async()=>{const finite=document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity);await Promise.all(finite.map(animation=>animation.finished.catch(()=>{})));});
		assert.equal(await page.locator('.hero-actions .button').count(),1);
		assert.ok(await page.locator('.about-content').isHidden());
		await page.screenshot({path:path.join(out,name+'.png')});
		if(width<=719){await page.locator('.menu-button').click();assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'),'false');}
		assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations===Infinity).length),0,'No looping product animation');
		await page.locator('#intro-replay').click();
		assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('intro-playing')));
		assert.equal(await page.locator('#product-card').evaluate(el=>getComputedStyle(el).animationName),'product-entrance');
		const first=await page.locator('#product-card').evaluate(el=>getComputedStyle(el).transform);
		await page.waitForTimeout(1100);
		assert.notEqual(await page.locator('#product-card').evaluate(el=>getComputedStyle(el).transform),first,'Entrance must move through the frame');
		await page.screenshot({path:path.join(out,name+'-entrance.png')});
		await page.locator('#motion-toggle').click();assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'),'false');
		assert.equal(await page.locator('#product-card').evaluate(el=>getComputedStyle(el).animationName),'none');
		assert.ok(await page.locator('#intro-replay').isDisabled());
		await page.locator('#motion-toggle').click();assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'),'true');
		assert.equal(await page.locator('#product-card').evaluate(el=>getComputedStyle(el).animationName),'product-entrance');
		await page.locator('#motion-toggle').click();
		await page.locator('.hero-bottom [data-about]').click();assert.ok(await page.locator('.about-content').isVisible());
		await page.locator('#about > summary').click();assert.ok(await page.locator('.about-content').isHidden());

		report.checks.push({name,width,height,touch,passed:true});await context.close();
	}
	const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await reduced.newPage();
	await page.goto('http://127.0.0.1:5175/');await page.waitForSelector('#product[data-ready="true"]');assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('motion-off')));assert.ok(await page.locator('#motion-toggle').isDisabled());assert.equal(await page.locator('#product-card').evaluate(el=>getComputedStyle(el).animationName),'none');await reduced.close();
	for(const [file,hash] of Object.entries(protectedFiles))assert.equal(createHash('sha256').update(await readFile(path.join(workspace,file))).digest('hex').toUpperCase(),hash,`Original calculator changed: ${file}`);
	report.calculatorFilesUnchanged=true;assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=error.message;throw error;}
finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));}
