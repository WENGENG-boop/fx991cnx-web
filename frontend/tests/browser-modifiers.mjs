import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
const out=path.resolve('frontend/qa-output/modifiers');await mkdir(out,{recursive:true});
const report={scope:'live touch input without extra runFor settling after taps; Chromium simulated iPad',checks:[],errors:[]};
try{
 const context=await browser.newContext({viewport:{width:1180,height:700},isMobile:true,hasTouch:true});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:5176/frontend/');await page.waitForSelector('#device[aria-busy="false"]');
 await page.evaluate(async()=>{const {CasioEmu}=await import('../CasioEmuNeo-master/web/js/casioemu-client.js');const original=CasioEmu.prototype.pointer;CasioEmu.prototype.pointer=function(...args){window.qaEmu=this;return original.apply(this,args);};window.trace=[];document.addEventListener('calculator-key',e=>trace.push(e.detail.index));});
 async function keys(sequence,delay=0){for(const index of sequence){await page.locator(`#touch-panel [data-index="${index}"]`).tap();if(delay)await page.waitForTimeout(delay);}await page.waitForTimeout(700);}
 async function dots(){return page.evaluate(()=>{const m=qaEmu.readMemory(0xf800,2048);return Array.from({length:31},(_,i)=>Array.from(m.slice((i+33)*32,(i+33)*32+24))).flat();});}
 await keys([4,10,11,15,19],150);const expected120=await dots();
 for(const delay of [0,40,150]){await keys([4,6,42,28,19],delay);const pass=JSON.stringify(await dots())===JSON.stringify(expected120);report.checks.push({name:'factorial',delay,pass});await page.screenshot({path:path.join(out,'factorial-'+delay+'.png')});}
 await keys([4]);await page.locator('#touch-panel [data-index="42"]').tap();await page.waitForTimeout(300);assert.equal(await page.locator('#touch-panel [data-index="42"]').getAttribute('aria-pressed'),'true');report.shiftMemory=await page.evaluate(()=>Array.from(qaEmu.readMemory(0xf800,24)));await page.screenshot({path:path.join(out,'shift.png')});
 await keys([45,4,43]);assert.equal(await page.locator('#touch-panel [data-index="43"]').getAttribute('aria-pressed'),'true');report.alphaMemory=await page.evaluate(()=>Array.from(qaEmu.readMemory(0xf800,24)));await page.screenshot({path:path.join(out,'alpha.png')});
 // Some touch paths synthesize a zero-detail click after pointerup: it must not toggle SHIFT a second time.
 await keys([45,4]);await page.locator('#touch-panel [data-index="42"]').tap();await page.locator('#touch-panel [data-index="42"]').dispatchEvent('click',{detail:0});await page.waitForTimeout(350);assert.equal(await page.locator('#touch-panel [data-index="42"]').getAttribute('aria-pressed'),'true');report.checks.push({name:'touch-followed-by-zero-detail-click',pass:true});
 await keys([45,4,0,19],150);const expected7=await dots();await keys([4,6,32,26,4,43,26,13,11,19]);assert.deepEqual(await dots(),expected7);report.checks.push({name:'ALPHA-variable-5-plus-2',pass:true});
 await keys([45,4,12,15,19],150);const expected30=await dots();await keys([4,42,29,15,16,6,35,19]);assert.deepEqual(await dots(),expected30);report.checks.push({name:'SHIFT-inverse-sine',pass:true});
 report.trace=await page.evaluate(()=>trace);report.result=report.checks.every(x=>x.pass)?'passed':'failed';if(report.result==='failed')process.exitCode=1;
}finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
