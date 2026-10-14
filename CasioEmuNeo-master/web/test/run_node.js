#!/usr/bin/env node
/*
 * End-to-end smoke test for the WebAssembly build, runnable without a browser.
 *
 *   node web/test/run_node.js
 *   node web/test/run_node.js --model fx991cncw --frames 400
 *   node web/test/run_node.js --keys "1,2,3" --png web/test/out/cnx.png
 *
 * It loads web/dist/casioemu_web.js, feeds it a model from ../release/, boots
 * the emulated calculator and prints the LCD as ASCII art twice: once from the
 * screen buffer in emulated memory and once from the renderer's back buffer.
 * Those two views should agree; if they do, CPU, MMU, Lua, the SDL shim and the
 * software rasteriser are all working.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const WEB = path.join(HERE, '..');
const PROJ = path.join(WEB, '..');
const REPO = path.join(PROJ, '..');

const ROW_SIZE = 32;
const ROW_SIZE_DISP = 24;
// Screen::Frame() reads screen_buffer[iy * ROW_SIZE + OFFSET + ix], and OFFSET
// is 32 for both CLASSWIZ and CLASSWIZ_II -- one whole stride past the row.
const ROW_OFFSET = 32;
const N_ROW = 63;
const SCREEN_BASE = 0xf800;

// ------------------------------------------------------------------ options

function parseArgs(argv) {
	const options = {
		model: 'fx991cnx',
		frames: 240,
		keys: '',
		png: '',
		quiet: false,
	};
	for (let i = 2; i < argv.length; ++i) {
		const key = argv[i].replace(/^--/, '');
		const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
		if (key === 'model') options.model = value;
		else if (key === 'frames') options.frames = parseInt(value, 10);
		else if (key === 'keys') options.keys = value;
		else if (key === 'png') options.png = value;
		else if (key === 'quiet') options.quiet = true;
		else throw new Error('unknown option --' + key);
	}
	return options;
}

// --------------------------------------------------------------- utilities

function fail(message) {
	console.error('\n测试失败: ' + message);
	process.exit(1);
}

/** Runs web/tools/png_to_rgba.py and returns {width, height, rgba}. */
function decodePng(pngPath) {
	const out = path.join(HERE, 'out', 'atlas.raw');
	fs.mkdirSync(path.dirname(out), { recursive: true });
	const printed = execFileSync(
		'python',
		[path.join(WEB, 'tools', 'png_to_rgba.py'), 'decode', pngPath, out],
		{ encoding: 'utf8' }
	).trim();
	const [width, height] = printed.split(/\s+/).map(Number);
	if (!width || !height) fail('png_to_rgba.py 没返回尺寸: ' + printed);
	const rgba = fs.readFileSync(out);
	if (rgba.length !== width * height * 4) {
		fail(`atlas 大小不对: ${rgba.length} != ${width * height * 4}`);
	}
	return { width, height, rgba };
}

/** Reads rsd_pixel from model.lua: {srcX, srcY, srcW, srcH, destX, destY}. */
function readRsdPixel(modelPath) {
	const text = fs.readFileSync(modelPath, 'utf8');
	const match = text.match(/rsd_pixel\s*=\s*\{([^}]*)\}/);
	if (!match) fail('model.lua 里没有 rsd_pixel');
	const parts = match[1].split(',').map((piece) => parseInt(piece.trim(), 10));
	return { destX: parts[4], destY: parts[5], srcW: parts[2], srcH: parts[3] };
}

function luminance(r, g, b) {
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** The screen buffer holds 63 rows of 24 bytes, at byte offsets 32..55 of each 32-byte stride. */
function lcdFromMemory(Module, rowBytes) {
	const buffer = Module._malloc(N_ROW * ROW_SIZE);
	Module._emu_web_read_mem(SCREEN_BASE, buffer, N_ROW * ROW_SIZE);
	const view = Module.HEAPU8.subarray(buffer, buffer + N_ROW * ROW_SIZE);
	const rows = [];
	for (let y = 0; y < N_ROW; ++y) {
		const row = new Uint8Array(192);
		for (let x = 0; x < ROW_SIZE_DISP; ++x) {
			const byte = view[y * ROW_SIZE + ROW_OFFSET + x];
			for (let bit = 0; bit < 8; ++bit) {
				row[x * 8 + bit] = (byte >> (7 - bit)) & 1;
			}
		}
		rows.push(row);
	}
	Module._free(buffer);
	return rows;
}

/** The same 192x63 area, but read back out of the renderer's back buffer. */
function lcdFromBackbuffer(Module, rsd) {
	const width = Module._emu_web_device_width();
	const height = Module._emu_web_device_height();
	const size = Module._emu_web_fb_size();
	const pointer = Module._emu_web_fb();
	if (!pointer) fail('emu_web_fb() 返回空指针');
	const pixels = Module.HEAPU8.subarray(pointer, pointer + size);
	const rows = [];
	for (let y = 0; y < N_ROW; ++y) {
		const row = new Uint8Array(192);
		for (let x = 0; x < 192; ++x) {
			const px = rsd.destX + x;
			const py = rsd.destY + y;
			if (px < 0 || py < 0 || px >= width || py >= height) continue;
			const offset = (py * width + px) * 4;
			const level = luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
			row[x] = level < 128 ? 1 : 0;
		}
		rows.push(row);
	}
	return rows;
}

function renderAscii(rows) {
	const lines = [];
	for (let y = 0; y < rows.length; ++y) {
		let line = '';
		for (let x = 0; x < 192; x += 2) {
			// Two dots per character keeps the picture inside a normal terminal.
			const dots = rows[y][x] + rows[y][x + 1];
			line += dots === 0 ? ' ' : dots === 1 ? '.' : '#';
		}
		lines.push(line.replace(/\s+$/, ''));
	}
	return lines.join('\n');
}

function countDots(rows) {
	let total = 0;
	for (const row of rows) for (const dot of row) total += dot;
	return total;
}

function samePicture(a, b) {
	if (a.length !== b.length) return false;
	for (let y = 0; y < a.length; ++y) {
		for (let x = 0; x < a[y].length; ++x) {
			if (a[y][x] !== b[y][x]) return false;
		}
	}
	return true;
}

/** 4x nearest neighbour, so the 284x597 back buffer is actually viewable. */
function writePng(Module, outPath, scale) {
	const width = Module._emu_web_device_width();
	const height = Module._emu_web_device_height();
	const size = Module._emu_web_fb_size();
	const pointer = Module._emu_web_fb();
	const pixels = Module.HEAPU8.subarray(pointer, pointer + size);

	const outW = width * scale;
	const outH = height * scale;
	const scaled = Buffer.alloc(outW * outH * 4);
	for (let y = 0; y < outH; ++y) {
		const sourceRow = Math.floor(y / scale) * width * 4;
		const destRow = y * outW * 4;
		for (let x = 0; x < outW; ++x) {
			const source = sourceRow + Math.floor(x / scale) * 4;
			scaled[destRow + x * 4] = pixels[source];
			scaled[destRow + x * 4 + 1] = pixels[source + 1];
			scaled[destRow + x * 4 + 2] = pixels[source + 2];
			scaled[destRow + x * 4 + 3] = 255;
		}
	}

	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	const raw = path.join(HERE, 'out', 'framebuffer.raw');
	fs.writeFileSync(raw, scaled);
	execFileSync('python', [
		path.join(WEB, 'tools', 'png_to_rgba.py'),
		'encode',
		outPath,
		String(outW),
		String(outH),
		raw,
	]);
}

function writeIntoMemfs(Module, virtualPath, localPath) {
	const data = fs.readFileSync(localPath);
	Module.FS.writeFile(virtualPath, new Uint8Array(data));
}

// -------------------------------------------------------------------- main

async function main() {
	const options = parseArgs(process.argv);

	const modelDir = path.join(REPO, 'release', options.model);
	if (!fs.existsSync(path.join(modelDir, 'rom.bin'))) {
		fail('找不到机型目录: ' + modelDir);
	}

	const bundlePath = path.join(WEB, 'dist', 'casioemu_web.js');
	if (!fs.existsSync(bundlePath)) {
		fail('还没编译. 先跑: bash web/build.sh');
	}

	console.log(`机型      ${options.model}  (${modelDir})`);
	console.log(`设备      ${fs.statSync(path.join(modelDir, 'rom.bin')).size} 字节 ROM`);

	const rm = readRsdPixel(path.join(modelDir, 'model.lua'));
	const atlas = decodePng(path.join(modelDir, 'interface.png'));
	console.log(`界面图    ${atlas.width}x${atlas.height} RGBA`);
	console.log(`屏幕位置  (${rm.destX}, ${rm.destY})  192x63`);

	// --- boot the module -------------------------------------------------
	const factory = require(bundlePath);
	const Module = await factory({});

	Module.FS.mkdirTree('/model');

	// Same code path a browser uses: the host writes the model files in.
	const writeFile = (virtualPath, data) => {
		const buffer = Module._malloc(data.length);
		Module.HEAPU8.set(data, buffer);
		const pathPointer = Module.stringToNewUTF8(virtualPath);
		const result = Module._emu_web_write_file(pathPointer, buffer, data.length);
		Module._free(pathPointer);
		Module._free(buffer);
		if (result !== 0) fail('emu_web_write_file 失败: ' + virtualPath);
	};

	writeFile('/model/model.lua', fs.readFileSync(path.join(modelDir, 'model.lua')));
	writeFile('/model/rom.bin', fs.readFileSync(path.join(modelDir, 'rom.bin')));
	writeFile('/model/interface.png', fs.readFileSync(path.join(modelDir, 'interface.png')));

	const atlasPointer = Module._malloc(atlas.rgba.length);
	Module.HEAPU8.set(atlas.rgba, atlasPointer);
	Module._emu_web_set_interface_image(atlasPointer, atlas.width, atlas.height);
	Module._free(atlasPointer);
	console.log(`已灌入    interface.png (${atlas.rgba.length} 字节)`);

	let initResult;
	try {
		initResult = Module._emu_web_init(Module.stringToNewUTF8('/model'), 0);
	} catch (error) {
		fail('emu_web_init 抛异常 (多半是 core 里的 PANIC): ' + error.message);
	}
	if (initResult !== 0) fail('emu_web_init 返回 ' + initResult);

	const width = Module._emu_web_device_width();
	const height = Module._emu_web_device_height();
	console.log(`已启动    设备 ${width}x${height}, 机型 id ${Module._emu_web_hardware_id()}`);

	const buttonCount = Module._emu_web_button_count();
	console.log(`按键      ${buttonCount} 个`);
	const names = [];
	for (let i = 0; i < buttonCount; ++i) {
		const rectBuffer = Module._malloc(16);
		const nameBuffer = Module._malloc(64);
		const ok = Module._emu_web_button_rect(i, rectBuffer);
		const length = Module._emu_web_button_name(i, nameBuffer, 64);
		const rect = [0, 1, 2, 3].map((k) => Module.HEAP32[(rectBuffer >> 2) + k]);
		const name = length > 0 ? Buffer.from(Module.HEAPU8.subarray(nameBuffer, nameBuffer + length)).toString('utf8') : '';
		if (ok) names.push({ index: i, rect, name });
		Module._free(rectBuffer);
		Module._free(nameBuffer);
	}
	if (names.length !== buttonCount) {
		fail(`只有 ${names.length}/${buttonCount} 个按钮能读出坐标`);
	}
	console.log(
		'           ' +
			names
				.slice(0, 8)
				.map((b) => `${b.name || '(空)'}@${b.rect[0]},${b.rect[1]}`)
				.join('  ') +
			' ...'
	);

	// --- run --------------------------------------------------------------
	const frameMs = 1000 / 60;
	let frames = 0;
	let rendered = 0;
	for (; frames < options.frames; ++frames) {
		rendered += Module._emu_web_run(frameMs);
	}
	console.log(`\n跑了 ${frames} 帧 (~${((frames * frameMs) / 1000).toFixed(1)} 秒模拟时间), 重绘 ${rendered} 次`);

	const fromMemory = lcdFromMemory(Module);
	const fromBackbuffer = lcdFromBackbuffer(Module, rm);
	const dots = countDots(fromMemory);

	console.log('\n--- 显存里的点阵 (0x' + SCREEN_BASE.toString(16) + ') ---');
	console.log(renderAscii(fromMemory));
	console.log(`点亮点数 ${dots} / 12096`);

	console.log('\n--- 从渲染结果里读回来的同一块区域 ---');
	console.log(renderAscii(fromBackbuffer));

	if (!samePicture(fromMemory, fromBackbuffer)) {
		const memoryDots = countDots(fromMemory);
		const bufferDots = countDots(fromBackbuffer);
		console.error(`\n两边不一致: 显存 ${memoryDots} 点, 画面 ${bufferDots} 点`);
		process.exitCode = 1;
	} else {
		console.log('\n两边完全一致 ✔');
	}

	// --- keyboard ---------------------------------------------------------
	if (options.keys) {
		const pressed = options.keys.split(',').map((piece) => piece.trim()).filter(Boolean);
		console.log('\n--- 按键测试: ' + pressed.join(' ') + ' ---');
		for (const key of pressed) {
			const pointer = Module.stringToNewUTF8(key);
			const ok = Module._emu_web_key(pointer, 1);
			Module._free(pointer);
			if (!ok) fail('按不了这个键 (SDLK_UNKNOWN): ' + JSON.stringify(key));
			for (let i = 0; i < 4; ++i) Module._emu_web_run(frameMs);
			const release = Module.stringToNewUTF8(key);
			Module._emu_web_key(release, 0);
			Module._free(release);
			for (let i = 0; i < 24; ++i) Module._emu_web_run(frameMs);
			console.log(`按下 ${JSON.stringify(key)} 后:`);
			console.log(renderAscii(lcdFromMemory(Module)));
		}
	}

	const finalPicture = lcdFromMemory(Module);
	if (!samePicture(finalPicture, lcdFromBackbuffer(Module, rm))) {
		fail('按键后的显存与渲染画面不一致');
	}
	if (options.keys && countDots(finalPicture) === 0) {
		fail('按键输入后屏幕仍为空白');
	}
	if (options.png) {
		writePng(Module, options.png, 2);
		console.log(`\n已写出整屏截图: ${options.png}`);
	}
	fs.writeFileSync(path.join(HERE, 'out', 'lcd_ascii.txt'), renderAscii(finalPicture) + '\n');

	if (countDots(finalPicture) === 0) {
		console.log('\n注意: 屏幕全是空白, 可能是开机时间不够, 试着加 --frames');
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
