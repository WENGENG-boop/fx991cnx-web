// Records real fx-991CN X LCD frames (192×63 VRAM) from the WASM core + ROM,
// key by key, into showcase/assets/lcd-frames.json. The showcase page replays
// these frames; it never loads the ROM itself.
// Usage (from the workspace root, after building web/dist): node showcase/tools/capture-lcd.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '../..');
const web = path.join(workspace, 'CasioEmuNeo-master/web');
const model = path.join(workspace, 'release/fx991cnx');
const { CasioEmu } = await import(new URL('file:///' + path.join(web, 'js/casioemu-client.js').replace(/\\/g, '/')).href);
const temp = path.join(web, 'test/out/capture');
mkdirSync(temp, { recursive: true });

const require = createRequire(import.meta.url);
const module = await require(path.join(web, 'dist/casioemu_web.js'))({ print: () => {}, printErr: () => {} });
module.FS.mkdirTree('/model');
for (const name of ['model.lua', 'rom.bin', 'interface.png']) module.FS.writeFile('/model/' + name, new Uint8Array(readFileSync(path.join(model, name))));
const decoded = execFileSync('python', [path.join(web, 'tools/png_to_rgba.py'), 'decode', path.join(model, 'interface.png'), path.join(temp, 'atlas.raw')], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
const rgba = readFileSync(path.join(temp, 'atlas.raw'));
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
emu.runFor(2000);
const fresh = emu.save();

// Same index order as model.lua's button_map (see cnx-regression.mjs).
const labels = ['7','8','9','DEL','AC','4','5','6','*','/','1','2','3','+','-','0','.','EXP','Ans','=',
	'frac','sqrt','square','power','log','ln','neg','dms','inverse','sin','cos','tan','STO','ENG','(',')','decimal','M+',
	'OPTN','CALC','integral','x','SHIFT','ALPHA','MENU','ON','Left','Right','Up','Down'];
function tap(label) {
	const index = labels.indexOf(label);
	assert.ok(index >= 0, `Unknown label: ${label}`);
	const { x, y, w, h } = emu.buttons[index].rect;
	emu.pointer(1, x + w / 2, y + h / 2); emu.runFor(70);
	emu.pointer(2, x + w / 2, y + h / 2);
}
// 63 rows × 24 display bytes; rows start 32 bytes past 0xF800 with a 32-byte stride.
function vram() {
	const memory = emu.readMemory(0xf800, 64 * 32), out = new Uint8Array(63 * 24);
	for (let y = 0; y < 63; y++) out.set(memory.slice(32 + y * 32, 32 + y * 32 + 24), y * 24);
	return Buffer.from(out).toString('base64');
}
const frames = [], index = new Map();
const frameId = data => { if (!index.has(data)) { index.set(data, frames.length); frames.push(data); } return index.get(data); };
// Each step: the key, then two captures half a second apart (cursor blink on/off).
function record(keys) {
	assert.ok(emu.load(fresh)); emu.reset(); emu.runFor(1600);
	const steps = [{ key: null, frames: [frameId(vram()), (emu.runFor(500), frameId(vram()))] }];
	for (const key of keys) {
		tap(key); emu.runFor(260);
		const a = frameId(vram()); emu.runFor(500);
		steps.push({ key, frames: [a, frameId(vram())] });
	}
	return steps;
}
const sequences = {
	add: ['1', '+', '2', '*', '3', '='],
	fraction: ['frac', '1', 'Down', '3', 'Right', '+', 'frac', '1', 'Down', '6', '='],
	root: ['sqrt', '2', '='],
	power: ['2', 'power', '1', '0', '='],
	product: ['1', '9', '2', '*', '6', '3', '='],
};
const result = { source: 'fx-991CN X ROM on CasioEmuNeo WASM; 192×63, 24 bytes per row, MSB = leftmost dot', width: 192, height: 63, frames, sequences: {} };
for (const [name, keys] of Object.entries(sequences)) result.sequences[name] = record(keys);
module._emu_web_destroy();
const target = path.join(workspace, 'showcase/assets/lcd-frames.json');
writeFileSync(target, JSON.stringify(result));
console.log(`Wrote ${frames.length} unique frames to ${target}`);
