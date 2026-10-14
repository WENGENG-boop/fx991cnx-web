import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
const out=path.resolve('frontend/qa-output/responsive');await mkdir(out,{recursive:true});
const report={scope:'Chromium simulated visible Safari viewport, not real iOS acceptance',checks:[],errors:[]};
try{
 for(const [name,width,height,tablet] of [['iphone',393,720,false],['small-phone',320,480,false],['phone-landscape',844,300,false],['ipad-portrait',820,1000,true],['ipad-landscape',1180,700,true],['ipad-safari',1024,650,true],['ipad-short',1024,550,true],['ipad-split',507,900,false]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(name+': '+e.message));
 await page.addInitScript(()=>{window.qaInputs=[];document.addEventListener('calculator-key',e=>qaInputs.push(e.detail.index));});
 await page.goto('http://127.0.0.1:5176/frontend/');await page.waitForSelector('#device[aria-busy="false"]');
 assert.equal(await page.locator('.calc-key').count(),50);assert.equal(await page.locator('.pad-key').count(),50);
 assert.equal(await page.locator('#touch-panel').isVisible(),tablet);
 if(tablet){for(const index of [4,17,26,29,39,44])assert.ok(await page.locator(`#touch-panel [data-index="${index}"] .pad-legends`).isVisible(),'alternate legends visible');assert.equal(await page.locator('#touch-panel [data-index="26"] .legend-alpha').textContent(),'A');assert.equal(await page.locator('#touch-panel [data-index="29"] .legend-shift').textContent(),'sin⁻¹');}

 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(!tablet){assert.equal(await page.locator('#fit-screen').getAttribute('aria-pressed'),'true');assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=visualViewport.height+1),'phone must fit without document scrolling');}
 const device=await page.locator('#device').boundingBox(),toolbar=await page.locator('.toolbar').boundingBox();
 assert.ok(device.y>=-1&&device.y+device.height<=height-35,'whole faceplate fits');assert.ok(toolbar.y+toolbar.height<=height+1,'toolbar fits');
 if(tablet){const panel=await page.locator('#touch-panel').boundingBox();assert.ok(panel.x>device.x+device.width);assert.ok(panel.y+panel.height<=height+1);assert.ok(await page.evaluate(async()=>{const {keyRects}=await import('./skin.js');const area=document.querySelector('.pad-keyboard').getBoundingClientRect();return Array.from(document.querySelectorAll('.pad-key')).every(button=>{const rect=keyRects[Number(button.dataset.index)],box=button.getBoundingClientRect();return Math.abs((box.x-area.x)/area.width-rect.x/344)<.002&&Math.abs((box.y-area.y)/area.height-(rect.y-263)/432)<.002;});}),'Every right-side key must keep the original faceplate position');}
 await page.screenshot({path:path.join(out,name+'.png')});
 // Both sets feed the same existing ROM. Capture that instance only in this isolated test.
 await page.evaluate(async()=>{const {CasioEmu}=await import('../CasioEmuNeo-master/web/js/casioemu-client.js');const original=CasioEmu.prototype.pointer;CasioEmu.prototype.pointer=function(...args){window.qaEmu=this;return original.apply(this,args);};});
 await page.locator('#keys [data-index="4"]').tap();await page.evaluate(()=>{qaEmu.stop();qaEmu.runFor(330);});
 for(const index of [10,13,11,19]){await page.locator(`${tablet?'#touch-panel':'#keys'} [data-index="${index}"]`).tap();await page.evaluate(()=>qaEmu.runFor(330));}
 assert.deepEqual(await page.evaluate(()=>qaInputs.slice(-4)),[10,13,11,19]);
 const result=await page.evaluate(()=>{const m=qaEmu.readMemory(0xf800,2048);return Array.from(m.slice(33*32));});
 for(const index of [4,12,19]){await page.locator(`#keys [data-index="${index}"]`).tap();await page.evaluate(()=>qaEmu.runFor(330));}
 assert.deepEqual(await page.evaluate(()=>{const m=qaEmu.readMemory(0xf800,2048);return Array.from(m.slice(33*32));}),result,'shared calculator result = 3');
 await page.locator('#guide-toggle').click();assert.ok(await page.locator('#guide').isVisible());await page.locator('#guide-close').click();
 await page.locator('#utilities > summary').click();await page.locator('#pause').click();assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'true');await page.locator('#pause').click();await page.locator('#utilities > summary').click();
 if(!tablet){await page.locator('#fit-screen').click();assert.equal(await page.locator('#fit-screen').getAttribute('aria-pressed'),'false');await page.locator('#fit-screen').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=visualViewport.height+1));}
 await page.setViewportSize({width:height,height:width});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 report.checks.push({name,width,height,tablet,passed:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=error.message;process.exitCode=1;}
finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
