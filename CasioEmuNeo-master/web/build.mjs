// Native Windows / POSIX build. Uses the same source list as build.sh.
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const web = path.dirname(fileURLToPath(import.meta.url));
const project = path.dirname(web);
const sdk = process.env.EMSDK || path.join(os.homedir(), 'emsdk');
const python = process.env.PYTHON || 'python';
const emcc = path.join(sdk, 'upstream/emscripten/emcc.py');
await stat(emcc).catch(() => { throw new Error(`Missing Emscripten: ${emcc}. Install and activate emsdk first.`); });
const out = path.join(web, 'dist');
const build = path.join(web, 'build/native');
await mkdir(out, { recursive: true });
await mkdir(build, { recursive: true });
const debug = process.argv.includes('--debug');
const flags = [debug ? '-O0' : '-O2', '-DCASIOEMU_WEB', '-Iemulator', '-Iweb/shims', '-Iweb/third_party/lua-5.3.6/src'];
const shellBuild = await readFile(path.join(web, 'build.sh'), 'utf8');
const core = shellBuild.match(/CORE_SRC=\(([\s\S]*?)\n\)/)[1].trim().split(/\s+/);
const lua = (await readdir(path.join(web, 'third_party/lua-5.3.6/src')))
	.filter(name => name.endsWith('.c') && !['lua.c', 'luac.c'].includes(name))
	.map(name => `web/third_party/lua-5.3.6/src/${name}`);
const sources = [...lua, ...core];
async function headers(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) result.push(...await headers(filename));
		else if (/\.(h|hpp)$/.test(entry.name)) result.push(await readFile(filename));
	}
	return result;
}
const hash = createHash('sha256').update(JSON.stringify(flags));
for (const dir of ['emulator', 'web/shims', 'web/third_party/lua-5.3.6/src']) {
	for (const header of await headers(path.join(project, dir))) hash.update(header);
}
hash.update(await readFile(path.join(sdk, 'upstream/emscripten/emscripten-version.txt')));
const fingerprint = hash.digest('hex');
const stamp = path.join(build, 'fingerprint');
const rebuild = (await readFile(stamp, 'utf8').catch(() => '')) !== fingerprint;
function compile(args) {
	return new Promise((resolve, reject) => {
		const child = spawn(python, [emcc, ...args], {
			cwd: project, stdio: 'inherit', env: { ...process.env, EM_CONFIG: path.join(sdk, '.emscripten') },
		});
		child.on('error', reject);
		child.on('exit', code => code === 0 ? resolve() : reject(new Error(`emcc exited ${code}`)));
	});
}
// Warm the SDK cache once before concurrent compiler processes start.
await compile(['--version']);
const objects = sources.map(source => path.join(build, source.replace(/[\\/]/g, '_').replace(/\.(c|cpp)$/, '.o')));
const pending = sources.map((source, index) => ({ source, object: objects[index] }));
let failure;
await Promise.all(Array.from({ length: 4 }, async () => {
	while (pending.length && !failure) {
		const { source, object } = pending.shift();
		const cached = !rebuild && (await stat(object).catch(() => null));
		if (cached && cached.mtimeMs > (await stat(path.join(project, source))).mtimeMs) continue;
		console.log(`Compile ${source}`);
		try { await compile([...flags, ...(source.endsWith('.cpp') ? ['-std=c++17'] : []), '-c', source, '-o', object]); }
		catch (error) { failure = error; }
	}
}));
if (failure) throw failure;
await writeFile(stamp, fingerprint);
const api = await readFile(path.join(web, 'src/web_api.cpp'), 'utf8');
const exports = [...new Set(api.match(/emu_web_[a-zA-Z_0-9]+/g))].map(name => '_' + name).concat('_malloc', '_free');
await compile([...objects, debug ? '-O0' : '-O2', '--no-entry',
	'-sDEFAULT_TO_CXX=1', '-sMODULARIZE=1', '-sEXPORT_NAME=CasioEmuWeb', '-sENVIRONMENT=web,node',
	'-sFORCE_FILESYSTEM=1', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=67108864',
	'-sSTACK_SIZE=5242880', '-sEXIT_RUNTIME=0', `-sASSERTIONS=${debug ? 2 : 0}`,
	`-sEXPORTED_FUNCTIONS=${JSON.stringify(exports)}`,
	'-sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAPU32,HEAP32,getValue,setValue,cwrap,UTF8ToString,stringToNewUTF8,lengthBytesUTF8',
	'-o', path.join(out, 'casioemu_web.js')]);
await writeFile(stamp, fingerprint);
console.log(`Built ${path.join(out, 'casioemu_web.wasm')}`);
