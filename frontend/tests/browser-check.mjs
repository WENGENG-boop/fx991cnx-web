// Optional browser QA; pass an existing playwright-core index.mjs and browser exe.
// No browser automation package is required for normal calculator operation.
import assert from 'node:assert/strict';
import { pathToFileURL,fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
const { chromium }=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'frontend/qa-output/browser');await mkdir(output,{recursive:true});
const base=process.argv[4]||'http://127.0.0.1:5173/frontend/';
const report={base,scope:'Chromium emulated viewports and touch; not physical iPad/iPhone or Safari',checks:[],errors:[]};
try {
	for(const [name,width,height,touch] of [['desktop',1440,1000,false],['laptop',1280,800,false],['phone',390,844,true],['small-phone',320,568,true],['ipad',820,1180,true],['ipad-landscape',1180,820,true],['phone-landscape',844,390,true]]) {
		const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});
		const page=await context.newPage();page.on('pageerror',error=>report.errors.push(`${name}: ${error.message}`));
		await page.addInitScript(()=>{window.calculatorInputs=[];document.addEventListener('calculator-key',event=>window.calculatorInputs.push(event.detail.index));});
		page.on('response',response=>{if(response.status()>=400)report.errors.push(`${name}: HTTP ${response.status()} ${response.url()}`);});
		await page.goto(base);await page.waitForSelector('#device[aria-busy="false"]');
		assert.equal(await page.locator('.calc-key').count(),50);
		assert.equal(await page.locator('.guide-entry').count(),18);
		assert.equal(await page.locator('.manual-reference a').count(),18);
		assert.equal(await page.locator('.guide-entry .entry-note').count(),36);
		assert.ok((await page.locator('.manual-reference a').first().getAttribute('href')).includes('fx-991CN_X_B_CN.pdf#page=5'));
		const box=await page.locator('#device').boundingBox();assert.ok(Math.abs(box.width/box.height-344/720)<.002);
		assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: horizontal overflow`);
		await page.screenshot({path:path.join(output,`${name}.png`),fullPage:false});
		assert.ok(await page.locator('#guide').isHidden(),'Help must not appear on initial entry');
		assert.ok(await page.locator('.page-header').isHidden());assert.ok(await page.locator('.gesture-hint').isHidden());
		assert.equal(await page.locator('.guide-entry[open]').count(),0);
		await page.locator('#guide-toggle').click();assert.ok(await page.locator('#guide').isVisible());
		assert.equal(await page.locator('#guide-toggle').getAttribute('aria-expanded'),'true');
		await page.keyboard.press('Escape');assert.ok(await page.locator('#guide').isHidden());
		assert.equal(await page.evaluate(()=>window.calculatorInputs.length),0,'Closing help with Escape must not send AC');
		await page.locator('#guide-toggle').click();
		await page.locator('#guide-search').fill('分数');assert.ok(await page.locator('.guide-entry').count()>0);
		await page.locator('.guide-entry > summary').first().click();
		if(name==='phone') { await page.locator('#guide').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'phone-guide.png')}); }
		await page.locator('#guide-search').fill('not-a-real-topic');assert.ok(await page.locator('#guide-empty').isVisible());
		await page.locator('#guide-search').fill('');
		await page.getByRole('button',{name:'方程与数据',exact:true}).click();assert.equal(await page.locator('.guide-entry').count(),5);
		await page.getByRole('button',{name:'全部',exact:true}).click();
		await page.locator('.guide-entry > summary').first().click();
		const before=await page.evaluate(()=>window.calculatorInputs.length);
		await page.locator('[data-guide-key="45"]').first().click();assert.equal(await page.locator('.guide-target').count(),2);
		assert.equal(await page.evaluate(()=>window.calculatorInputs.length),before,'Guide locator must not input calculator keys');
		if(await page.locator('#guide').isVisible())await page.locator('#guide-close').click();
		assert.equal(await page.locator('#guide-toggle').getAttribute('aria-expanded'),'false');
		// Real pointer input exercises the retained calculator, not the guide chips.
		for(const key of [4,10,13,11,19]) {
			const button=page.locator(`#keys [data-index="${key}"]`);if(touch)await button.tap();else await button.click();
		}
		assert.deepEqual(await page.evaluate(()=>window.calculatorInputs.slice(-5)),[4,10,13,11,19]);
		if(name==='desktop') { await page.locator('#calculator').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'desktop-calculation.png')}); }
		await page.locator('#utilities summary').first().click();assert.ok(await page.locator('.tools-panel').isVisible());
		await page.locator('#pause').click();assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'true');
		const inputCount=await page.evaluate(()=>window.calculatorInputs.length);
		const smooth=await page.locator('#screen').evaluate(canvas=>canvas.toDataURL());
		if(name==='desktop')await writeFile(path.join(output,'display-smooth.png'),Buffer.from(smooth.split(',')[1],'base64'));
		await page.locator('#pixel-display').click();assert.equal(await page.locator('#pixel-display').getAttribute('aria-pressed'),'true');
		assert.ok(await page.locator('#screen').evaluate((canvas,smooth)=>canvas.toDataURL()!==smooth,smooth));
		if(name==='desktop') { const original=await page.locator('#screen').evaluate(canvas=>canvas.toDataURL());await writeFile(path.join(output,'display-pixel.png'),Buffer.from(original.split(',')[1],'base64')); }
		await page.locator('#pixel-display').click();assert.equal(await page.locator('#pixel-display').getAttribute('aria-pressed'),'false');
		assert.equal(await page.evaluate(()=>window.calculatorInputs.length),inputCount);
		await page.locator('#pause').click();assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'false');
		await page.locator('#utilities summary').first().click();
		const fitted=await page.locator('#fit-screen').getAttribute('aria-pressed')==='true';if(fitted)await page.locator('#fit-screen').click();
		if(await page.locator('#zoom').isVisible()){await page.locator('#zoom').click();const enlarged=await page.locator('#device').boundingBox();assert.ok(enlarged.width>=box.width);await page.locator('#zoom').click();}if(fitted)await page.locator('#fit-screen').click();
		await page.setViewportSize({width:height,height:width});
		const rotated=await page.locator('#device').boundingBox();assert.ok(Math.abs(rotated.width/rotated.height-344/720)<.002);
		report.checks.push({name,width,height,touch,deviceWidth:box.width,passed:true});await context.close();
	}
	assert.deepEqual(report.errors,[]);report.result='passed';
	// Compare only the retained faceplate. LCD state is intentionally excluded:
	// the original cover shows a fixed menu, while the app has a live ROM display.
	const comparison=await browser.newPage({viewport:{width:780,height:810},deviceScaleFactor:1});
	await comparison.goto(base);await comparison.waitForSelector('#device[aria-busy="false"]');
	const actual=await comparison.locator('#screen').evaluate(canvas=>canvas.toDataURL());
	await comparison.setContent('<html><body style="margin:20px;background:#fff;font:14px sans-serif"><div style="display:flex;gap:20px"><section><p>Original crop / LCD excluded</p><canvas id="source" width="344" height="720"></canvas></section><section><p>Browser canvas / LCD excluded</p><canvas id="actual" width="344" height="720"></canvas></section></div></body></html>');
	await comparison.evaluate(async ({base,actual})=>{
		const original=new Image();original.src=new URL('assets/source-cover.png',base).href;await original.decode();
		const rendered=new Image();rendered.src=actual;await rendered.decode();
		const source=document.getElementById('source').getContext('2d');source.drawImage(original,68,0,344,720,0,0,344,720);
		const target=document.getElementById('actual').getContext('2d');target.drawImage(rendered,0,0,344,720);
		for(const context of [source,target]){context.fillStyle='#e6e6e6';context.fillRect(34,103,277,112);}
	},{base,actual});
	await comparison.screenshot({path:path.join(output,'faceplate-comparison.png')});await comparison.close();
} catch(error) { report.result='failed';report.failure=error.message;throw error; }
finally { await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2)); }
