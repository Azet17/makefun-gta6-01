// Neon Tide — Palmera Bay: a tiny static server for local play.
// `node serve.ts` serves game/ at http://localhost:8080 — no build
// step, no dependencies, standard library only. It refuses any path
// outside game/ and sends the MIME types a browser game needs.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const rawPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const safe = normalize(join(root, rawPath)).replace(/\\/g, '/');
  const rootSlash = root.replace(/\\/g, '/');
  if (safe !== rootSlash && !safe.startsWith(rootSlash + '/')) {
    response.writeHead(403, { 'content-type': 'text/plain' });
    response.end('forbidden');
    return;
  }
  let file = safe === rootSlash ? join(root, 'index.html') : safe;
  let stat;
  try {
    stat = statSync(file);
    if (stat.isDirectory()) file = join(file, 'index.html');
    stat = statSync(file);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`Neon Tide — Palmera Bay: serving game/ at http://localhost:${port}`);
});
