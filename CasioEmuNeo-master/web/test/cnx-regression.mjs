// Real ROM regression: compare calculated result glyphs to a known literal.
// This validates the WASM core, not browser DOM, touch, or real hardware.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CasioEmu } from '../js/casioemu-client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.dirname(here);
const model = path.resolve(web, '../../release/fx991cnx');
const output = path.join(here, 'out/regression');
mkdirSync(output, { recursive:true });
const require = createRequire(import.meta.url);
const module = await require(path.join(web, 'dist/casioemu_web.js'))({ print:() => {}, printErr:() => {} });
module.FS.mkdirTree('/model');
for (const name of ['model.lua','rom.bin','interface.png']) module.FS.writeFile('/model/' + name, new Uint8Array(readFileSync(path.join(model, name))));
const decoded = execFileSync('python', [path.join(web, 'tools/png_to_rgba.py'), 'decode', path.join(model, 'interface.png'), path.join(output, 'atlas.raw')], { encoding:'utf8' }).trim().split(/\s+/).map(Number);
const rgba = readFileSync(path.join(output, 'atlas.raw'));
const pixels = module._malloc(rgba.length);
module.HEAPU8.set(rgba, pixels);
module._emu_web_set_interface_image(pixels, ...decoded);
module._free(pixels);
const modelPath = module.stringToNewUTF8('/model');
assert.equal(module._emu_web_init(modelPath, 0), 0);
module._free(modelPath);
const emu = new CasioEmu(module, {});
emu.deviceWidth = module._emu_web_device_width();
emu.deviceHeight = module._emu_web_device_height();
emu.buttons = emu._readButtons();
assert.equal(emu.buttons.length, 50);
assert.equal(module._emu_web_save_size(), 8192);
assert.equal(module._emu_web_hardware_id(), 4);
emu.runFor(2000);
const fresh = emu.save();
const labels = ['7','8','9','DEL','AC','4','5','6','*','/','1','2','3','+','-','0','.','EXP','Ans','=',
	'frac','sqrt','square','power','log','ln','neg','dms','inverse','sin','cos','tan','STO','ENG','(',')','decimal','M+',
	'OPTN','CALC','integral','x','SHIFT','ALPHA','MENU','ON','Left','Right','Up','Down'];
function tap(label) {
	const index = labels.indexOf(label);
	assert.ok(index >= 0, `Unknown label: ${label}`);
	const { x,y,w,h } = emu.buttons[index].rect;
	emu.pointer(1, x + w / 2, y + h / 2);
	emu.runFor(70);
	emu.pointer(2, x + w / 2, y + h / 2);
	emu.runFor(330);
}
function keys(sequence) { for (const key of sequence) tap(key); }
function reboot() { assert.ok(emu.load(fresh)); emu.reset(); emu.runFor(1600); }
function result() {
	const memory = emu.readMemory(0xf800, 64 * 32);
	// Bottom 31 LCD rows contain the result, independently of the formula.
	return Buffer.concat(Array.from({length:31}, (_, i) => Buffer.from(memory.slice((i + 33) * 32, (i + 33) * 32 + 24))));
}
function screenshot(name) {
	const bytes = Buffer.from(module.HEAPU8.subarray(module._emu_web_fb(), module._emu_web_fb() + module._emu_web_fb_size()));
	const raw = path.join(output, 'frame.raw');
	writeFileSync(raw, bytes);
	execFileSync('python', [path.join(web,'tools/png_to_rgba.py'), 'encode', path.join(output, name + '.png'), '284', '597', raw]);
}
const cases = [
	['addition', ['1','+','2','='], '3'],
	['multiplication', ['6','*','7','='], '42'],
	['division', ['8','1','/','9','='], '9'],
	['square-root', ['sqrt','9','='], '3'],
	['power', ['2','power','1','0','='], '1024'],
	['sine-degrees', ['sin','9','0',')','='], '1'],
	['logarithm', ['log','1','0','Right','1','0','0','='], '2'],
	['parentheses', ['(','2','+','3',')','*','4','='], '20'],
	['factorial-shift', ['5','SHIFT','inverse','='], '120'],
	['fraction-addition', ['frac','1','Down','2','Right','+','frac','1','Down','2','='], '1'],
];
const report = { model:'fx991cnx', scope:'real ROM / WASM; no browser or real-device acceptance', passed:[], modes:[] };
try {
	for (const [name, sequence, expected] of cases) {
		reboot(); keys([...expected, '=']); const expectedDots = result();
		assert.ok(expectedDots.some(byte => byte !== 0), `Empty expected display: ${name}`);
		reboot(); keys(sequence); screenshot(name);
		assert.ok(result().equals(expectedDots), `${name}: result differs from ${expected}; see ${name}.png`);
		report.passed.push({ name, expected }); console.log(`PASS ${name} = ${expected}`);
	}
	reboot(); keys(['1','2','3','=']); const literal123 = result();
	keys(['STO','neg']);
	const saved = emu.save();
	assert.ok(saved.some((value,index) => value !== fresh[index]), 'Variable assignment must change RAM');
	reboot(); assert.ok(emu.load(saved));
	assert.ok(Buffer.from(emu.save()).equals(Buffer.from(saved)), 'RAM must survive load');
	emu.reset(); emu.runFor(1600); keys(['AC','ALPHA','neg','=']);
	screenshot('memory-restored-A');
	assert.ok(result().equals(literal123), 'Variable A must survive RAM restoration and reboot');
	report.passed.push({ name:'memory-roundtrip', bytes:saved.length });
	reboot(); tap('MENU'); screenshot('menu');
	for (const [name, selection] of [['calculate',['1']],['complex',['2']],['base-n',['3']],['matrix',['4']],['vector',['5']],['statistics',['6']],['table',['7']],['equation',['8']],['inequality',['9']],['ratio',['Down','Down','Right','=']]]) {
		reboot(); keys(['MENU',...selection]); screenshot('mode-' + name);
		report.modes.push({ name, check:'entered and captured; full mode calculations not asserted' });
	}
	console.log(`PASS ${report.passed.length} regressions; ${report.modes.length} mode captures`);
} finally {
	writeFileSync(path.join(output,'report.json'), JSON.stringify(report,null,2) + '\n');
	module._emu_web_destroy();
}
