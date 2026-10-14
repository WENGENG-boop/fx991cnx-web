import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { topics,manual } from '../guide.js';

test('manual guide has unique IDs, traceable pages and valid physical keys',()=>{
	assert.equal(new Set(topics.map(topic=>topic.id)).size,topics.length);
	assert.ok(topics.length>=16);
	for(const topic of topics) {
		assert.ok(topic.title && topic.category && topic.note);
		assert.ok(topic.precondition && topic.manualSection);
		assert.ok(Number.isInteger(topic.page) && topic.page>=3 && topic.page<=71);
		assert.ok(topic.steps.length>=2);
		for(const [description,keys] of topic.steps) {
			assert.ok(description.length>0);
			for(const key of keys)assert.ok(Number.isInteger(key) && key>=0 && key<50,`${topic.id}: invalid key`);
		}
	}
});

test('CALC, statistics and table instructions include the manual confirmations',()=>{
	assert.equal(manual.revision,'RJA530830-001V02');
	assert.deepEqual(topics.find(t=>t.id==='calc').steps.slice(1).flatMap(step=>step[1]),[39,6,19,10,15,19,19]);
	assert.deepEqual(topics.find(t=>t.id==='statistics').steps[2][1],[38,12]);
	assert.deepEqual(topics.find(t=>t.id==='statistics').steps[3][1],[4,4,38,11]);
	assert.deepEqual(topics.find(t=>t.id==='table').steps.at(-1)[1].slice(-2),[19,19]);
	assert.ok(topics.find(t=>t.id==='solve').steps[0][1].includes(43));
});

test('model-specific mode shortcuts match the CN X ROM layout',()=>{
	assert.deepEqual(topics.find(topic=>topic.id==='quadratic').steps[0][1],[44,1,11,11]);
	assert.deepEqual(topics.find(topic=>topic.id==='statistics').steps[0][1],[44,7,10]);
	assert.deepEqual(topics.find(topic=>topic.id==='table').steps[0][1].slice(0,2),[44,0]);
});

test('guide references the official V02 manual and its printed pages',()=>{
	const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
	assert.equal((html.match(/https:\/\/www\.casio\.com\/content\/dam\/casio\/global\/support\/manuals\/calculators\/pdf\/004-zh-cn\/f\/fx-991CN_X_B_CN\.pdf/g)||[]).length,2);
	assert.ok(html.includes('RJA530830‑001V02'));
	assert.ok(!html.includes('manuals.plus'));
	for(const [id,page] of Object.entries({start:4,shift:5,fraction:18,decimal:17,power:27,negative:13,factorial:31,angle:10,log:27,history:23,memory:24,calc:34,solve:35,quadratic:45,statistics:36,table:50,modes:7,errors:58})) {
		assert.equal(topics.find(topic=>topic.id===id).page,page,`${id}: official V02 printed page`);
	}
});

test('guide is hidden before JavaScript starts and has explicit open/close controls',()=>{
	const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
	assert.match(html,/<aside[^>]*id="guide"[^>]*hidden>/);
	assert.match(html,/id="guide-toggle"[^>]*aria-expanded="false"/);
	assert.ok(html.includes('id="guide-close"'));
});
