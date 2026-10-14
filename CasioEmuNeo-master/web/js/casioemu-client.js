/*
 * Front-end wiring for the WebAssembly build.
 *
 * This file contains no styling and creates no DOM: it is the glue between a
 * UI you write yourself and the exported emu_web_* C API.  Everything a page
 * needs to do -- fetch the model, decode the interface image, drive the clock,
 * push input, read the picture -- happens through the class below.
 *
 *   <script src="dist/casioemu_web.js"></script>
 *   <script type="module">
 *     import { CasioEmu } from './js/casioemu-client.js';
 *
 *     const emu = await CasioEmu.create({
 *       baseUrl: '../release/fx991cnx/',
 *       scriptUrl: new URL('./dist/casioemu_web.js', import.meta.url).href,
 *     });
 *
 *     emu.onFrame = (image) => {
 *       canvas.width = image.width;
 *       canvas.height = image.height;
 *       canvas.getContext('2d').putImageData(image, 0, 0);
 *     };
 *     emu.start();
 *   </script>
 */

/* Browser KeyboardEvent.code -> the SDL key name the models are written with.
 * Anything missing here can still be sent via emu.keyDown('Name'). */
const BROWSER_KEY_TO_SDL = {
	Backspace: 'Backspace',
	Tab: 'Tab',
	Enter: 'Return',
	NumpadEnter: 'Keypad Enter',
	Escape: 'Escape',
	Space: 'Space',
	Home: 'Home',
	End: 'End',
	PageUp: 'PageUp',
	PageDown: 'PageDown',
	Insert: 'Insert',
	Delete: 'Delete',
	CapsLock: 'CapsLock',
	ShiftLeft: 'Left Shift',
	ShiftRight: 'Right Shift',
	ControlLeft: 'Left Ctrl',
	ControlRight: 'Right Ctrl',
	AltLeft: 'Left Alt',
	AltRight: 'Right Alt',
	ArrowLeft: 'Left',
	ArrowRight: 'Right',
	ArrowUp: 'Up',
	ArrowDown: 'Down',
	Minus: '-',
	Equal: '=',
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	Semicolon: ';',
	Quote: "'",
	Backquote: '`',
	Comma: ',',
	Period: '.',
	Slash: '/',
	NumpadDecimal: 'Keypad .',
	NumpadDivide: 'Keypad /',
	NumpadMultiply: 'Keypad *',
	NumpadSubtract: 'Keypad -',
	NumpadAdd: 'Keypad +',
	NumpadEquals: 'Keypad =',
};

for (let digit = 0; digit !== 10; ++digit) {
	BROWSER_KEY_TO_SDL['Digit' + digit] = String(digit);
	BROWSER_KEY_TO_SDL['Numpad' + digit] = 'Keypad ' + digit;
}
for (let index = 1; index !== 13; ++index) {
	BROWSER_KEY_TO_SDL['F' + index] = 'F' + index;
}
for (let code = 65; code !== 91; ++code) {
	const letter = String.fromCharCode(code);
	BROWSER_KEY_TO_SDL['Key' + letter] = letter;
}

/** Loads a classic (non-module) script and resolves once it has run. */
function loadScript(url) {
	return new Promise((resolve, reject) => {
		const existing = document.querySelector(`script[data-casioemu="${url}"]`);
		if (existing) {
			if (existing.dataset.loaded === 'true') resolve();
			else {
				existing.addEventListener('load', () => resolve());
				existing.addEventListener('error', () => reject(new Error('load failed: ' + url)));
			}
			return;
		}
		const element = document.createElement('script');
		element.src = url;
		element.dataset.casioemu = url;
		element.addEventListener('load', () => {
			element.dataset.loaded = 'true';
			resolve();
		});
		element.addEventListener('error', () => reject(new Error('load failed: ' + url)));
		document.head.appendChild(element);
	});
}

export class CasioEmu {
	constructor(module, options) {
		this.Module = module;
		this.options = options;
		this.image = null;
		this.onFrame = null;
		this.onError = null;
		this.buttons = [];
		this.deviceWidth = 0;
		this.deviceHeight = 0;

		this._rafHandle = 0;
		this._lastTimestamp = 0;
		this._scaled = null;
	}

	/* ------------------------------------------------------------ loading */

	/**
	 * @param {object} options
	 * @param {string} options.modelUrl      directory holding model.lua + rom.bin
	 * @param {string} [options.scriptUrl]   dist/casioemu_web.js, if not already loaded
	 * @param {string} [options.interfaceImage] file name inside modelUrl (default interface.png)
	 * @param {object} [options.moduleOptions] extra fields for the Emscripten factory
	 * @param {(text:string)=>void} [options.onLog] console sink for core output
	 */
	static async create(options) {
		const modelUrl = new URL(
			options.modelUrl.endsWith('/') ? options.modelUrl : options.modelUrl + '/',
			document.baseURI
		);

		if (options.scriptUrl) await loadScript(options.scriptUrl);
		const factory = options.factory || globalThis.CasioEmuWeb;
		if (typeof factory !== 'function') {
			throw new Error('找不到 CasioEmuWeb, 先加载 dist/casioemu_web.js');
		}

		const sink = options.onLog || ((text) => console.log('[casioemu] ' + text));
		const module = await factory(
			Object.assign(
				{
					print: sink,
					printErr: (text) => console.error('[casioemu] ' + text),
					locateFile: (name) => new URL(name, new URL(options.scriptUrl || '.', document.baseURI)).href,
				},
				options.moduleOptions || {}
			)
		);

		const emu = new CasioEmu(module, { modelUrl });
		await emu.loadModel(options.interfaceImage || 'interface.png');
		return emu;
	}

	async loadModel(interfaceImageName) {
		const module = this.Module;
		const model = this.options.modelUrl;

		module.FS.mkdirTree('/model');

		const fetchBytes = async (name) => {
			const response = await fetch(new URL(name, model).href);
			if (!response.ok) throw new Error(`取 ${name} 失败: HTTP ${response.status}`);
			return new Uint8Array(await response.arrayBuffer());
		};

		for (const name of ['model.lua', 'rom.bin']) {
			this._writeFile('/model/' + name, await fetchBytes(name));
		}

		const image = await this._decodeInterface(interfaceImageName);
		this.setInterfaceImage(image);

		const modelPath = this._toUtf8('/model');
		const result = module._emu_web_init(modelPath, 0);
		module._free(modelPath);
		if (result !== 0) throw new Error('emu_web_init 失败, 返回 ' + result);

		this.deviceWidth = module._emu_web_device_width();
		this.deviceHeight = module._emu_web_device_height();
		this.buttons = this._readButtons();

		if (typeof ImageData !== 'undefined') {
			this.image = new ImageData(this.deviceWidth, this.deviceHeight);
		}

		return this;
	}

	/**
	 * Decodes the interface atlas with the browser's own PNG decoder and copies
	 * it into wasm memory.  The C++ side never parses PNG data.
	 */
	async _decodeInterface(name) {
		const response = await fetch(new URL(name, this.options.modelUrl).href);
		if (!response.ok) throw new Error(`取 ${name} 失败: HTTP ${response.status}`);
		const bitmap = await createImageBitmap(await response.blob());

		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
		context.drawImage(bitmap, 0, 0);
		bitmap.close();

		const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
		const pointer = this.Module._malloc(rgba.length);
		this.Module.HEAPU8.set(rgba, pointer);
		return { width: canvas.width, height: canvas.height, pointer, byteLength: rgba.length };
	}

	setInterfaceImage(image) {
		this.Module._emu_web_set_interface_image(image.pointer, image.width, image.height);
		this.Module._free(image.pointer);
		image.pointer = 0;
	}

	_writeFile(virtualPath, bytes) {
		const pointer = this.Module._malloc(bytes.length);
		this.Module.HEAPU8.set(bytes, pointer);
		const pathPointer = this.Module.stringToNewUTF8(virtualPath);
		const result = this.Module._emu_web_write_file(pathPointer, pointer, bytes.length);
		this.Module._free(pathPointer);
		this.Module._free(pointer);
		if (result !== 0) throw new Error('写入失败: ' + virtualPath);
	}

	_toUtf8(text) {
		return this.Module.stringToNewUTF8(text);
	}

	_readButtons() {
		const module = this.Module;
		const count = module._emu_web_button_count();
		const buttons = [];
		const rectPointer = module._malloc(16);
		const namePointer = module._malloc(64);
		try {
			for (let index = 0; index < count; ++index) {
				if (!module._emu_web_button_rect(index, rectPointer)) continue;
				const length = module._emu_web_button_name(index, namePointer, 64);
				const name =
					length > 0
						? new TextDecoder().decode(module.HEAPU8.subarray(namePointer, namePointer + length))
						: '';
				const base = rectPointer >> 2;
				buttons.push({
					index,
					name,
					rect: {
						x: module.HEAP32[base],
						y: module.HEAP32[base + 1],
						w: module.HEAP32[base + 2],
						h: module.HEAP32[base + 3],
					},
				});
			}
		} finally {
			module._free(rectPointer);
			module._free(namePointer);
		}
		return buttons;
	}

	/* -------------------------------------------------------------- clock */

	/**
	 * Drives the emulator from requestAnimationFrame.  60 emulated frames per
	 * second is what the calculator itself does, so this stays real-time.
	 */
	start() {
		if (this._rafHandle) return;
		this._lastTimestamp = 0;
		const step = (timestamp) => {
			this._rafHandle = requestAnimationFrame(step);
			const elapsed = this._lastTimestamp ? timestamp - this._lastTimestamp : 0;
			this._lastTimestamp = timestamp;
			this.run(elapsed);
		};
		this._rafHandle = requestAnimationFrame(step);
	}

	stop() {
		if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
		this._rafHandle = 0;
	}

	run(elapsedMs) {
		const module = this.Module;
		try {
			if (module._emu_web_run(elapsedMs)) this._publish();
		} catch (error) {
			this.stop();
			if (this.onError) this.onError(error);
			else throw error;
		}
	}

	/** Steps a fixed number of emulated milliseconds, ignoring wall-clock time. */
	runFor(milliseconds, stepMs = 1000 / 60) {
		for (let done = 0; done < milliseconds; done += stepMs) this.run(stepMs);
	}

	_publish() {
		if (!this.onFrame) return;
		const module = this.Module;
		const size = module._emu_web_fb_size();
		const pointer = module._emu_web_fb();
		if (!pointer || !size) return;
		// The heap can move as it grows, so the view is rebuilt every frame.
		const pixels = module.HEAPU8.subarray(pointer, pointer + size);

		if (this.image && this.image.data.length === size) {
			this.image.data.set(pixels);
			this.onFrame(this.image);
			return;
		}

		// No ImageData available (Node, worker without it): hand over a plain
		// Uint8ClampedArray the caller can wrap itself.
		if (!this._scaled || this._scaled.length !== size) this._scaled = new Uint8ClampedArray(size);
		this._scaled.set(pixels);
		this.onFrame({ width: this.deviceWidth, height: this.deviceHeight, data: this._scaled });
	}

	/* -------------------------------------------------------------- input */

	/** @param {string} name an SDL key name, e.g. "1", "F1", "Keypad 5" */
	keyDown(name) {
		return this._key(name, 1);
	}

	keyUp(name) {
		return this._key(name, 0);
	}

	/** Taps a key: down, a moment of emulated time, up. */
	tap(name, settleMs = 250) {
		this.keyDown(name);
		this.runFor(settleMs);
		this.keyUp(name);
		this.runFor(settleMs);
	}

	_key(name, down) {
		const pointer = this.Module.stringToNewUTF8(name);
		const result = this.Module._emu_web_key(pointer, down);
		this.Module._free(pointer);
		return result === 1;
	}

	/**
	 * Maps a real keyboard event onto an SDL key name.
	 * Returns null for keys the models do not know about.
	 */
	static keyNameFromEvent(event) {
		return BROWSER_KEY_TO_SDL[event.code] || null;
	}

	/**
	 * Mouse/touch input.  Coordinates are in interface-atlas pixels, i.e. the
	 * same numbers the model's button_map uses.
	 *
	 * phase 0 = move, 1 = left down, 2 = left up, 3 = right down, 4 = right up.
	 * Left clicks are momentary; a right click latches the key down until the
	 * next release anywhere.
	 */
	pointer(phase, x, y) {
		this.Module._emu_web_pointer(phase, Math.round(x), Math.round(y));
	}

	/** Converts a DOM event to atlas pixels, given the element that shows the device. */
	atlasPointFromEvent(element, event) {
		const box = element.getBoundingClientRect();
		// The visible area is the atlas cropped to the top-left deviceWidth x
		// deviceHeight rectangle, so the scale factor assumes exactly that.
		const source = event.touches ? event.touches[0] : event;
		return {
			x: ((source.clientX - box.left) / box.width) * this.deviceWidth,
			y: ((source.clientY - box.top) / box.height) * this.deviceHeight,
		};
	}

	/** Index of the button under an atlas point, or -1. */
	buttonAt(x, y) {
		for (const button of this.buttons) {
			const { rect } = button;
			if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) return button.index;
		}
		return -1;
	}

	/* ------------------------------------------------------------- control */

	setPaused(paused) {
		this.Module._emu_web_set_paused(paused ? 1 : 0);
	}

	get paused() {
		return this.Module._emu_web_is_paused() === 1;
	}

	reset() {
		this.Module._emu_web_reset();
	}

	command(luaCode) {
		const pointer = this.Module.stringToNewUTF8(luaCode);
		this.Module._emu_web_command(pointer);
		this.Module._free(pointer);
	}

	/* ---------------------------------------------------------- persistence */

	/** Serialised battery-backed RAM -- the calculator's "memory" contents. */
	save() {
		const size = this.Module._emu_web_save_size();
		if (size <= 0) return null;
		const pointer = this.Module._malloc(size);
		const written = this.Module._emu_web_save(pointer, size);
		const bytes = written > 0 ? new Uint8Array(this.Module.HEAPU8.subarray(pointer, pointer + written)) : null;
		this.Module._free(pointer);
		return bytes;
	}

	load(bytes) {
		if (!bytes || !bytes.length) return false;
		const pointer = this.Module._malloc(bytes.length);
		this.Module.HEAPU8.set(bytes, pointer);
		const result = this.Module._emu_web_load(pointer, bytes.length);
		this.Module._free(pointer);
		return result > 0;
	}

	/* ------------------------------------------------------------ debugging */

	readMemory(address, length) {
		const pointer = this.Module._malloc(length);
		this.Module._emu_web_read_mem(address, pointer, length);
		const bytes = new Uint8Array(this.Module.HEAPU8.subarray(pointer, pointer + length));
		this.Module._free(pointer);
		return bytes;
	}

	writeMemory(address, bytes) {
		const pointer = this.Module._malloc(bytes.length);
		this.Module.HEAPU8.set(bytes, pointer);
		this.Module._emu_web_write_mem(address, pointer, bytes.length);
		this.Module._free(pointer);
	}
}

export { BROWSER_KEY_TO_SDL };
export default CasioEmu;
