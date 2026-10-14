import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { skin,keyRects,photoKeyAt,corePointForPhoto,composeSkin,lcdRaster } from '../skin.js';
import { CasioEmu } from '../../CasioEmuNeo-master/web/js/casioemu-client.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const qa=path.join(root,'frontend/qa-output');
const helper=path.join(root,'CasioEmuNeo-master/web/tools/png_to_rgba.py');
mkdirSync(qa,{recursive:true});
function decode(file,name) {
	const raw=path.join(qa,name+'.raw');
	const dimensions=execFileSync('python',[helper,'decode',file,raw],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
	return { width:dimensions[0],height:dimensions[1],data:readFileSync(raw) };
}
function png(bytes,name,width=skin.width,height=skin.height) {
	const raw=path.join(qa,name+'.raw');
	writeFileSync(raw,bytes);
	execFileSync('python',[helper,'encode',path.join(qa,name+'.png'),String(width),String(height),raw]);
}
const cover=decode(path.join(root,'frontend/assets/source-cover.png'),'cover');
const original=readFileSync(path.join(root,'991CN-X-CW-Decompilation-main/readme_assets/cover.png'));
assert.equal(createHash('sha256').update(original).digest('hex'),createHash('sha256').update(readFileSync(path.join(root,'frontend/assets/source-cover.png'))).digest('hex'),'Source cover must be unchanged');
assert.equal(keyRects.length,50);
for(const [index,box] of keyRects.entries()) {
	assert.ok(box.x>=0 && box.y>=0 && box.x+box.w<=skin.width && box.y+box.h<=skin.height);
	assert.equal(photoKeyAt(box.x+box.w/2,box.y+box.h/2),index,`Overlapping center at ${index}`);
}
const require=createRequire(import.meta.url);
const Module=await require(path.join(root,'CasioEmuNeo-master/web/dist/casioemu_web.js'))({print:()=>{},printErr:()=>{}});
Module.FS.mkdirTree('/model');
const model=path.join(root,'release/fx991cnx');
for(const name of ['model.lua','rom.bin']) Module.FS.writeFile('/model/'+name,new Uint8Array(readFileSync(path.join(model,name))));
const atlas=decode(path.join(model,'interface.png'),'atlas');
const pointer=Module._malloc(atlas.data.length);
Module.HEAPU8.set(atlas.data,pointer); Module._emu_web_set_interface_image(pointer,atlas.width,atlas.height); Module._free(pointer);
const modelPointer=Module.stringToNewUTF8('/model');
assert.equal(Module._emu_web_init(modelPointer,0),0); Module._free(modelPointer);
const emu=new CasioEmu(Module,{});
emu.deviceWidth=Module._emu_web_device_width(); emu.deviceHeight=Module._emu_web_device_height(); emu.buttons=emu._readButtons();
assert.equal(emu.buttons.length,50);
let frame;
emu.onFrame=image=>{frame={width:image.width,height:image.height,data:new Uint8Array(image.data)};};
function capture(name) {
	emu._publish();
	const [mode,contrast]=emu.readMemory(0xf031,2);
	const memory=emu.readMemory(0xf800,64*32);
	const bytes=composeSkin(cover.data,cover.width,frame,contrast,mode,memory);
	// Outside the live LCD, every pixel must remain exactly the source asset.
	for(let y=0;y<skin.height;y++) for(let x=0;x<skin.width;x++) {
		const b=skin.blank;
		if(x>=b.x && x<b.x+b.width && y>=b.y && y<b.y+b.height) continue;
		const src=((y+skin.crop.y)*cover.width+x+skin.crop.x)*4,dst=(y*skin.width+x)*4;
		for(let c=0;c<4;c++) assert.equal(bytes[dst+c],cover.data[src+c]);
	}
	png(bytes,name);
	return lcdRaster(frame,contrast,mode,memory);
}
function click(index) {
	const box=keyRects[index], point=corePointForPhoto(emu.buttons,box.x+box.w/2,box.y+box.h/2);
	assert.equal(point.index,index);
	emu.pointer(1,point.x,point.y); emu.runFor(70); emu.pointer(2,point.x,point.y); emu.runFor(330);
}
try {
	emu.runFor(2000); const empty=capture('realistic-blank');
	for(let index=0;index<50;index++) {
		const box=keyRects[index],point=corePointForPhoto(emu.buttons,box.x+box.w/2,box.y+box.h/2),native=emu.buttons[index].rect;
		assert.equal(point.x,native.x+native.w/2); assert.equal(point.y,native.y+native.h/2);
	}
	for(const index of [10,13,11,19]) click(index);
	const sum=capture('realistic-addition');
	assert.ok(!Buffer.from(empty).equals(Buffer.from(sum)),'ROM input must change the live LCD');
	assert.ok(Array.from(sum).some((value,index)=>index%4===3 && value>150),'Live LCD must contain visible ink');
	click(44); capture('realistic-menu');
	const report={source:'991CN-X-CW-Decompilation-main/readme_assets/cover.png',sourceUnchanged:true,hotspots:50,geometry:'all centers route to original ROM model coordinates',lcd:'actual ROM framebuffer; original cover menu erased',outsideLcd:'pixel-identical to source crop',browserAcceptance:false};
	writeFileSync(path.join(qa,'skin-report.json'),JSON.stringify(report,null,2)+'\n');
	console.log(JSON.stringify(report,null,2));
} finally { Module._emu_web_destroy(); }
