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
 await page.goto('http://127.0.0.1:5173/frontend/');await ready();await page.evaluate(()=>window.qaFresh=Array.from(qaEmu.save()));
 for(const [name,sequence] of [
 ['matrix-addition',[44,5,10,11,11,10,19,11,19,12,19,5,19,4,38,12,13,38,12,19]],
 ['vector-addition',[44,6,10,11,10,19,11,19,4,38,12,13,38,12,19]],
 ]){await reset();await keys(sequence);await page.screenshot({path:path.join(out,name+'.png')});report.guideRuns.push({id:name,check:'executed and captured; numerical result visually verified separately'});}
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=error.message;process.exitCode=1;}
finally{await writeFile(path.join(out,'mode-arithmetic-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
