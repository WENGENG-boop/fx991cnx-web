// Render an inspection crop of the original cover, without changing the asset.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const raw = await readFile('frontend/qa-output/cover.raw');
const crop = { x:68, y:0, width:344, height:720 };
const scale = 2;
const out = Buffer.alloc(crop.width * crop.height * scale * scale * 4);
for (let y=0; y<crop.height*scale; ++y) for (let x=0; x<crop.width*scale; ++x) {
	const source = ((crop.y + Math.floor(y/scale)) * 1280 + crop.x + Math.floor(x/scale)) * 4;
	raw.copy(out, (y * crop.width * scale + x) * 4, source, source + 4);
}
await writeFile('frontend/qa-output/skin-inspection.raw', out);
execFileSync('python', ['CasioEmuNeo-master/web/tools/png_to_rgba.py','encode','frontend/qa-output/skin-inspection.png',String(crop.width*scale),String(crop.height*scale),'frontend/qa-output/skin-inspection.raw']);
