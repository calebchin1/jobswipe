import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Local test preview with history fallback for Expo's single-page web export. */
export async function serveExport(directory, port) {
  const root = path.resolve(directory);
  const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.ico':'image/x-icon'};
  const server = createServer(async (request,response)=>{
    try {
      if (!['GET','HEAD'].includes(request.method)) {response.writeHead(405);response.end();return;}
      const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      let file=path.resolve(root,`.${pathname}`);
      if (file!==root&&!file.startsWith(`${root}${path.sep}`)) {response.writeHead(403);response.end();return;}
      try { if ((await stat(file)).isDirectory()) file=path.join(file,'index.html');await stat(file); }
      catch { if (path.extname(pathname)) {response.writeHead(404);response.end();return;} file=path.join(root,'index.html'); }
      const bytes=await readFile(file);
      response.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
      response.end(request.method==='HEAD'?undefined:bytes);
    } catch {response.writeHead(400);response.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();})};
}
