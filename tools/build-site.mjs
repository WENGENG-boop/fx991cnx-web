// Build the deployable static site into dist/:
//   /      → showcase/ (presentation page)
//   /app/  → frontend/ packaged with the WASM runtime and the fx991cnx model
// rom.bin is NOT in the repository; it is copied from release/fx991cnx/ on this machine.
// Usage: node tools/build-site.mjs   (then: npx wrangler pages deploy dist --project-name <name>)
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const localCalculator = 'http://127.0.0.1:5173/frontend/';

const need = async (file, hint) => { await stat(path.join(root, file)).catch(() => { throw new Error(`Missing ${file}. ${hint}`); }); };
await need('release/fx991cnx/rom.bin', 'Place your own fx-991CN X ROM there; it is not distributed with the repository.');
await need('CasioEmuNeo-master/web/dist/casioemu_web.wasm', 'Build the core first: node CasioEmuNeo-master/web/build.mjs');

// 1. Calculator: reuse frontend/package.mjs, which writes website-dist/.
execFileSync(process.execPath, [path.join(root, 'frontend/package.mjs')], { stdio: 'inherit' });
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'website-dist'), path.join(dist, 'app'), { recursive: true });

// 2. Presentation page at the root; point its calculator links at /app/.
for (const name of ['style.css', 'assets/source-cover.png', 'assets/lcd-frames.json', 'assets/NOTICE.md']) {
	await mkdir(path.dirname(path.join(dist, name)), { recursive: true });
	await cp(path.join(root, 'showcase', name), path.join(dist, name));
}
for (const name of ['index.html', 'app.js']) {
	const source = await readFile(path.join(root, 'showcase', name), 'utf8');
	if (!source.includes(localCalculator)) throw new Error(`showcase/${name} no longer contains ${localCalculator}`);
	await writeFile(path.join(dist, name), source.replaceAll(localCalculator, '/app/').replaceAll(' target="_blank" rel="noopener noreferrer"', ''));
}

// 3. Cloudflare Pages headers.
await writeFile(path.join(dist, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY

/app/runtime/*
  Cache-Control: public, max-age=86400

/app/model/*
  Cache-Control: public, max-age=86400
`);
await cp(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE.txt'));
console.log(`Site ready: ${dist}`);
