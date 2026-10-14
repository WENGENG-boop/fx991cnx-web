// Extract original embedded raster assets without altering their pixels.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(workspace, '991CN-X-CW-Decompilation-main/991CN X 教程 V2.0/封面.svg');
const output = path.join(workspace, 'frontend/qa-output/reference/source-assets');
const svg = await readFile(source, 'utf8');
await mkdir(output, { recursive:true });
const manifest = [];
for (const match of svg.matchAll(/<image\b([^>]+)>/g)) {
	const attrs = Object.fromEntries([...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
	const uri = attrs['xlink:href'] || attrs.href;
	const data = uri?.match(/^data:image\/(png|jpeg|jpg|webp);base64,([\s\S]+)$/);
	if (!data) continue;
	const bytes = Buffer.from(data[2], 'base64');
	const name = `image-${manifest.length + 1}.${data[1] === 'jpeg' ? 'jpg' : data[1]}`;
	await writeFile(path.join(output, name), bytes);
	manifest.push({ name, id:attrs.id, width:attrs.width, height:attrs.height, bytes:bytes.length });
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ source, images:manifest }, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
