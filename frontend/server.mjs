import http from 'node:http';
import { isIP } from 'node:net';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packaged = process.argv.includes('--dist');
const root = packaged ? path.join(workspace, 'website-dist') : workspace;
const portFlag = process.argv.indexOf('--port');
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 5173;
const hostFlag=process.argv.indexOf('--host');
const host=hostFlag>=0 ? process.argv[hostFlag+1] : '127.0.0.1';
if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid --port');
if(!isIP(host) && host!=='localhost') throw new Error('Use an IP address or localhost for --host');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.wasm':'application/wasm', '.png':'image/png', '.lua':'text/plain; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.bin':'application/octet-stream' };
const server = http.createServer(async (request, response) => {
	try {
		if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
		let url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
		if (url === '/' && !packaged) { response.writeHead(302, { Location:'/frontend/' }); response.end(); return; }
		if (url.endsWith('/')) url += 'index.html';
		if (!packaged && !(/^\/frontend\/(index\.html|app\.js|guide\.js|skin\.js|layout\.js|interaction\.js|style\.css|assets\/source-cover\.png)$/.test(url)
			|| /^\/CasioEmuNeo-master\/web\/(js\/casioemu-client\.js|dist\/casioemu_web\.(js|wasm))$/.test(url)
			|| /^\/release\/fx991cnx\/(model\.lua|rom\.bin|interface\.png)$/.test(url))) {
			response.writeHead(404); response.end('Not found'); return;
		}
		const target = path.resolve(root, '.' + url);
		if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
		const info = await stat(target);
		if (!info.isFile() || !mime[path.extname(target)]) { response.writeHead(404); response.end(); return; }
		response.writeHead(200, { 'Content-Type':mime[path.extname(target)], 'Content-Length':info.size,
			'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' });
		if (request.method === 'HEAD') response.end();
		else createReadStream(target).on('error', () => response.destroy()).pipe(response);
	} catch { response.writeHead(404); response.end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, host, () => {
	const display=host==='0.0.0.0' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
	console.log(`FX-991CN X: http://${display}:${port}/${packaged ? '' : 'frontend/'}`);
	if(host==='0.0.0.0') console.log(`LAN: use this PC's local IP with port ${port} on a phone/iPad on the same network.`);
});
