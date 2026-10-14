import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceLayout,canvasResolution } from '../layout.js';
import { skin,keyRects,touchRects,touchKeyAt } from '../skin.js';
import { createPointerController } from '../interaction.js';

for(const [name,width,height] of [
	['small phone',320,568],['iPhone SE',375,667],['phone portrait',390,844],['large phone',430,932],
	['phone landscape',844,390],['iPad mini portrait',768,1024],['iPad portrait',820,1180],
	['iPad landscape',1180,820],['iPad Pro portrait',1024,1366],['iPad split view',507,1024],
]) test(`${name}: preserve ratio and readable minimum`,()=>{
	const available=width-24,roomHeight=height-24;
	const box=deviceLayout({width:available,height:roomHeight,coarse:true});
	assert.ok(box.width<=available);
	assert.ok(box.width>=Math.min(available,Math.min(available,roomHeight)>=600 ? 330 : 286));
	assert.ok(Math.abs(box.width/box.height-skin.width/skin.height)<1e-10);
	assert.equal(box.scrolls,box.height>roomHeight-104);
	if(height>=812) assert.equal(box.scrolls,false);
	const enlarged=deviceLayout({width:available,height:roomHeight,coarse:true,zoomed:true});
	assert.ok(enlarged.width>=box.width);
	assert.ok(enlarged.width<=available);
});

test('high-density canvas allocation stays bounded',()=>{
	for(const density of [1,2,3,4]) {
		const box=canvasResolution(540,540*720/344,density);
		assert.ok(box.width<=1620 && box.height<4096);
		assert.ok(Math.abs(box.width/box.height-344/720)<.002);
	}
});

test('expanded touch areas have no overlaps and map every visible key correctly',()=>{
	assert.equal(touchRects.length,50);
	for(const [index,b] of touchRects.entries()) {
		const original=keyRects[index];
		assert.equal(touchKeyAt(original.x+original.w/2,original.y+original.h/2),index);
		assert.ok(b.x>=0 && b.y>=0 && b.x+b.w<=344 && b.y+b.h<=720);
		for(const other of touchRects.slice(index+1)) {
			const w=Math.min(b.x+b.w,other.x+other.w)-Math.max(b.x,other.x);
			const h=Math.min(b.y+b.h,other.y+other.h)-Math.max(b.y,other.y);
			assert.ok(w<=0 || h<=0,`Overlapping regions at ${index}`);
		}
	}
	assert.equal(touchKeyAt(0,0),-1);
});

function setup() {
	const calls=[],jobs=new Map(); let next=1;
	const controller=createPointerController({
		press:(...args)=>calls.push(['press',...args]),release:owner=>calls.push(['release',owner]),
		schedule:fn=>{ const id=next++;jobs.set(id,fn);return id; },cancel:id=>jobs.delete(id),
	});
	return {controller,calls,hold:()=>{const pending=[...jobs.values()];jobs.clear();pending.forEach(fn=>fn());}};
}
const event=(id=1,type='touch',x=40,y=500,primary=true)=>({pointerId:id,pointerType:type,button:0,clientX:x,clientY:y,isPrimary:primary});

test('quick tap commits exactly one key on release',()=>{
	const {controller,calls,hold}=setup(); controller.down(event(),10);
	assert.deepEqual(calls,[]); controller.up(event()); hold();
	assert.deepEqual(calls,[['press',10,1],['release',1]]);
});
test('scroll before hold threshold never types a key',()=>{
	const {controller,calls,hold}=setup(); controller.down(event(),10);
	controller.move(event(1,'touch',40,520));hold();controller.up(event());
	assert.deepEqual(calls,[]);
});
test('holding starts once and releases once without an extra tap',()=>{
	const {controller,calls,hold}=setup();controller.down(event(),10);hold();controller.up(event());
	assert.deepEqual(calls,[['press',10,1],['release',1]]);
});
test('browser pointercancel releases a held key and clears its timer',()=>{
	const {controller,calls,hold}=setup();controller.down(event(),10);hold();controller.cancel(event());controller.up(event());hold();
	assert.deepEqual(calls,[['press',10,1],['release',1]]);
});
test('pinch second finger cannot inject a second key',()=>{
	const {controller,calls,hold}=setup();controller.down(event(),10);
	assert.equal(controller.down(event(2,'touch',40,500,false),11),false);
	hold();controller.up(event());controller.up(event(2));
	assert.deepEqual(calls,[]);
});
test('blur, pause, orientation change or toolbar opening cancels pending input',()=>{
	const {controller,calls,hold}=setup();controller.down(event(),10);controller.abort();hold();controller.up(event());
	assert.deepEqual(calls,[]);
});
test('mouse and pencil press immediately and wrong owner cannot release',()=>{
	for(const type of ['mouse','pen']) {
		const {controller,calls}=setup();controller.down(event(1,type),10);controller.up(event(2,type));
		assert.deepEqual(calls,[['press',10,1]]);controller.up(event(1,type));
		assert.deepEqual(calls,[['press',10,1],['release',1]]);
	}
});
test('rapid sequential taps do not reuse previous pointer ownership',()=>{
	const {controller,calls}=setup();for(const [index,id] of [[10,1],[13,2],[11,3],[19,4]]) {controller.down(event(id),index);controller.up(event(id));}
	assert.equal(calls.filter(call=>call[0]==='press').length,4);
	assert.deepEqual(calls.filter(call=>call[0]==='press').map(call=>call[1]),[10,13,11,19]);
});


test('whole-screen fitting removes the minimum size that would cause scrolling',()=>{
	for(const [width,height] of [[320,480],[393,720],[844,300],[507,900]]){
		const box=deviceLayout({width:width-16,height:height-16,reserved:68,coarse:true,fitScreen:true});
		assert.equal(box.scrolls,false);
		assert.ok(box.height+68<=height-16+1e-8);
		assert.ok(Math.abs(box.width/box.height-344/720)<1e-10);
	}
});
