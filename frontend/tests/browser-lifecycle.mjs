import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {topics} from '../guide.js';
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
const out=path.resolve('frontend/qa-output/full');await mkdir(out,{recursive:true});
const report={scope:'CN X frontend and real ROM in isolated Chromium; no physical-device acceptance',passed:[],guideRuns:[],errors:[]};
const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
async function ready(){await page.waitForSelector('#device[aria-busy="false"]');await page.evaluate(async()=>{
 const {CasioEmu}=await import('../CasioEmuNeo-master/web/js/casioemu-client.js');
 const original=CasioEmu.prototype.pointer;
 CasioEmu.prototype.pointer=function(...args){window.qaEmu=this;return original.apply(this,args);};
 });await page.locator('#keys [data-index="4"]').click();await page.evaluate(()=>{qaEmu.stop();qaEmu.runFor(500);});}
async function keys(sequence){if(await page.locator('#utilities').evaluate(el=>el.open))await page.locator('#utilities > summary').click();for(const index of sequence){await page.locator(`#keys [data-index="${index}"]`).click();await page.evaluate(()=>qaEmu.runFor(330));}}
async function reset(){await page.evaluate(()=>{qaEmu.setPaused(false);qaEmu.load(Uint8Array.from(window.qaFresh));qaEmu.reset();qaEmu.runFor(1600);qaEmu._publish();});}
async function dots(){return page.evaluate(()=>{const m=qaEmu.readMemory(0xf800,2048);return Array.from({length:31},(_,i)=>Array.from(m.slice((i+33)*32,(i+33)*32+24))).flat();});}
async function tools(){if(!await page.locator('#utilities').evaluate(el=>el.open))await page.locator('#utilities > summary').click();}
async function download(id,name){await tools();if(['export','import'].includes(id))await page.locator('.backup-tools').evaluate(el=>el.closest('details').open=true);const promise=page.waitForEvent('download');await page.locator('#'+id).click();const d=await promise;await d.saveAs(path.join(out,name));return readFile(path.join(out,name));}
try{
 await page.goto('http://127.0.0.1:5173/frontend/');await ready();
 await page.evaluate(()=>window.qaFresh=Array.from(qaEmu.save()));
 // Actual browser button input plus independent literal-result pixel comparisons.
 for(const [name,sequence,literal] of [
 ['inverse-sine',[4,42,29,15,16,6,35,19],[12,15,19]],
 ['arbitrary-log',[4,24,11,47,10,7,19],[5,19]],
 ['cube',[4,34,6,22,35,42,22,19],[10,6,7,11,6,19]],
 ['negative-exponent',[4,10,17,26,12,19],[15,16,15,15,10,19]],
 ['history-edit',[4,5,8,12,13,11,19,46,3,3,14,0,19],[6,19]],
 ['variable-use',[4,12,13,6,32,26,4,43,26,8,10,15,19],[1,15,19]],
 ['CALC',[44,10,4,12,43,26,13,43,27,39,6,19,10,15,19,19],[11,6,19]],
 ]){
 await reset();await keys(literal);const expected=await dots();await reset();await keys(sequence);
 await page.screenshot({path:path.join(out,name+'.png')});assert.deepEqual(await dots(),expected,name+' result mismatch');report.passed.push(name);
 }
 for(const [name,mode,expression,literal] of [
 ['complex-addition',[44,11],[10,13,33,13,11,13,33,19],[12,13,11,33,19]],
 ['base-decimal-addition',[44,12,22],[10,15,13,6,19],[10,6,19]],
 ]){await reset();await keys(mode);await keys(literal);const expected=await dots();await reset();await keys(mode);await keys(expression);assert.deepEqual(await dots(),expected,name);await page.screenshot({path:path.join(out,name+'.png')});report.passed.push(name);}
 for(const [name,sequence] of [
 ['matrix-editor',[44,5,10,11,11,10,19,11,19,12,19,5,19,4,38]],
 ['vector-editor',[44,6,10,11,10,19,11,19,4,38]],
 ['inequality-quadratic',[44,2,11,10,10,19,15,19,26,10,19,19]],
 ['ratio',[44,49,49,47,19,10,12,19,11,19,7,19,19]],
 ['integration',[44,10,4,40,41,47,15,47,10,19]],
 ]){await reset();await keys(sequence);await page.screenshot({path:path.join(out,name+'.png')});report.guideRuns.push({id:name,check:'executed and captured; result needs visual inspection'});}
 for(const topic of topics){await reset();for(const [stepIndex,[,sequence]] of topic.steps.entries()){await keys(sequence);if(topic.id==='statistics')await page.screenshot({path:path.join(out,'statistics-step-'+stepIndex+'.png')});}await page.screenshot({path:path.join(out,'guide-'+topic.id+'.png')});report.guideRuns.push({id:topic.id,steps:topic.steps.length,check:'executed and captured; not all numerical results asserted'});}
 // Keyboard and blur release through the frontend handlers.
 await reset();await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.type('1+2');await page.keyboard.press('Enter');await page.evaluate(()=>qaEmu.runFor(500));const keyboard=await dots();await reset();await keys([12,19]);assert.deepEqual(keyboard,await dots());report.passed.push('keyboard-calculation');
 await page.keyboard.down('7');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.locator('.calc-key.pressed').count(),0);await page.keyboard.up('7');report.passed.push('blur-releases-held-key');
 await reset();await keys([10,11,12,19,32,26]);
 const bytes=await download('export','memory.bin');assert.equal(bytes.length,8192);report.passed.push('export-8192-byte-memory');
 const shot=await download('shot','calculator.png');assert.equal(shot.subarray(0,8).toString('hex'),'89504e470d0a1a0a');report.passed.push('download-PNG-screenshot');
 await tools();await page.locator('#pause').click();assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'true');await page.locator('#restart').click();assert.equal(await page.evaluate(()=>qaEmu.paused),true);await page.locator('#pause').click();report.passed.push('restart-preserves-pause');
 await page.locator('#memory-file').setInputFiles({name:'invalid.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(17)});await page.waitForFunction(()=>document.getElementById('status').textContent.includes('8192'));report.passed.push('reject-invalid-backup-size');
 await keys([4,15,32,26]);await tools();page.once('dialog',dialog=>dialog.accept());await page.locator('#memory-file').setInputFiles({name:'memory.bin',mimeType:'application/octet-stream',buffer:bytes});await page.waitForFunction(()=>document.getElementById('status').textContent.includes('记忆已导入'));
 await keys([4,43,26,19]);const restored=await dots();await reset();await keys([10,11,12,19]);assert.deepEqual(restored,await dots());report.passed.push('import-restores-variable-A');
 await keys([32,26]);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.evaluate(()=>atob(localStorage.getItem('fx991cnx.ram.v1')).length),8192);
 await page.reload();await ready();await keys([4,43,26,19]);assert.deepEqual(await dots(),restored);report.passed.push('reload-restores-variable-A');
 // Existing corrupt storage is protected rather than overwritten.
 await page.addInitScript(()=>localStorage.setItem('fx991cnx.ram.v1','invalid-value'));await page.reload();await ready();assert.ok((await page.locator('#save-note').textContent()).includes('自动保存已暂停'));await page.waitForTimeout(3200);assert.equal(await page.evaluate(()=>localStorage.getItem('fx991cnx.ram.v1')),'invalid-value');report.passed.push('corrupt-memory-preserved');
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=error.message;process.exitCode=1;}
finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
