import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lcdRaster,skin } from '../skin.js';
import { canvasResolution } from '../layout.js';
const frame={width:284,height:597,data:new Uint8Array(284*597*4)};
const alpha=(pixels,x,y)=>pixels[(y*skin.lcd.sourceWidth+x)*4+3];

test('blank VRAM cannot inherit ghost labels or background dirt',()=>{
	const memory=new Uint8Array(2048);
	for(const contrast of [8,16,24]) {
		const pixels=lcdRaster(frame,contrast,5,memory);
		for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],0);
	}
});

test('all 192 x 63 dots map exactly to CN X VRAM, including the last row',()=>{
	const memory=new Uint8Array(2048);memory[32]=0x81;memory[63*32+23]=1;
	const pixels=lcdRaster(frame,8,5,memory);
	assert.equal(alpha(pixels,0,10),148);assert.equal(alpha(pixels,7,10),148);
	assert.equal(alpha(pixels,191,72),148);assert.equal(alpha(pixels,1,10),0);
	assert.equal(Array.from(pixels).filter((v,i)=>i%4===3 && v>0).length,3);
});

test('status enables come from individual VRAM bytes, not guessed bitfields',()=>{
	const memory=new Uint8Array(2048);memory[0]=1;
	const pixels=lcdRaster(frame,8,5,memory);
	assert.ok(alpha(pixels,0,0)>0);assert.equal(alpha(pixels,8,0),0);
	assert.equal(alpha(pixels,0,8),0);
	memory[0]=0;memory[6]=1;const degrees=lcdRaster(frame,8,5,memory);
	assert.equal(alpha(degrees,0,0),0);assert.ok(alpha(degrees,56,0)>0);
});

test('clear mode suppresses old characters and display raster rejects short memory',()=>{
	const memory=new Uint8Array(2048).fill(255),pixels=lcdRaster(frame,8,4,memory);
	for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],0);
	assert.throws(()=>lcdRaster(frame,8,5,new Uint8Array(20)),/Incomplete/);
});

test('ordinary displays also receive at least 2x backing pixels',()=>{
	assert.deepEqual(canvasResolution(344,720,1),{width:688,height:1440});
	assert.deepEqual(canvasResolution(344,720,4),{width:1032,height:2160});
});
