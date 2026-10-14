// Produce a self-contained static site for local use or an authorized host.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const frontend = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(frontend);
const out = path.join(root, 'website-dist');
await mkdir(path.join(out, 'runtime'), { recursive:true });
await mkdir(path.join(out, 'model'), { recursive:true });
await mkdir(path.join(out, 'assets'), { recursive:true });
for (const name of ['index.html','style.css','guide.js','skin.js','layout.js','interaction.js']) await cp(path.join(frontend, name), path.join(out, name));
await cp(path.join(frontend,'assets/source-cover.png'), path.join(out,'assets/source-cover.png'));
const source = (await readFile(path.join(frontend, 'app.js'), 'utf8'))
	.replaceAll('../CasioEmuNeo-master/web/js/casioemu-client.js', './runtime/casioemu-client.js')
	.replaceAll('../CasioEmuNeo-master/web/dist/casioemu_web.js', './runtime/casioemu_web.js')
	.replaceAll('../release/fx991cnx/', './model/');
await writeFile(path.join(out, 'app.js'), source);
for (const name of ['casioemu_web.js','casioemu_web.wasm']) await cp(path.join(root, 'CasioEmuNeo-master/web/dist', name), path.join(out, 'runtime', name));
await cp(path.join(root, 'CasioEmuNeo-master/web/js/casioemu-client.js'), path.join(out, 'runtime/casioemu-client.js'));
for (const name of ['model.lua','interface.png','rom.bin']) await cp(path.join(root, 'release/fx991cnx', name), path.join(out, 'model', name));
await cp(path.join(root, 'CasioEmuNeo-master/LICENSE'), path.join(out, 'LICENSE.txt'));
await writeFile(path.join(out, 'NOTICE.txt'), 'Local FX-991CN X web emulator based on CasioEmuNeo (GPL-3.0).\nCalculator ROM and faceplate assets retain their original ownership. Verify redistribution rights before uploading this directory.\nSource is available in the accompanying workspace.\n');
console.log(`Static site ready: ${out}. ROM included for local use; no upload performed.`);
