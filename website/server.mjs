import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
const root=path.dirname(fileURLToPath(import.meta.url));
const portIndex=process.argv.indexOf('--port'),port=portIndex>=0 ? Number(process.argv[portIndex+1]) : 5175;
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid --port');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
const allowed=new Set(['/index.html','/style.css','/app.js','/assets/source-cover.png']);
const server=http.createServer(async(request,response)=>{
	try {
		if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
		let url=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(url==='/')url='/index.html';
		if(!allowed.has(url)){response.writeHead(404);response.end('Not found');return;}
		const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
		const info=await stat(file);response.writeHead(200,{'Content-Type':types[path.extname(file)],'Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
		if(request.method==='HEAD')response.end();else createReadStream(file).on('error',()=>response.destroy()).pipe(response);
	}catch{response.writeHead(404);response.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`CNX independent website: http://127.0.0.1:${port}/`));
