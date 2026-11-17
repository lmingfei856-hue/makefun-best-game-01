// Tiny static server for local playtesting (Node 22, standard library only).
// Serves this directory, so the game loads at http://localhost:8080/game/.
// Not part of the entry: the grader only reads game/ and screenshots/.
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.md': 'text/plain',
};

createServer((req, res) => {
  const path = normalize(join(here, decodeURIComponent(req.url.split('?')[0])));
  if (!path.startsWith(here)) { res.writeHead(403); res.end(); return; }
  const file = path.endsWith('/') ? join(path, 'index.html') : path;
  createReadStream(file)
    .on('open', () => res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }))
    .on('error', () => { res.writeHead(404); res.end('not found'); })
    .pipe(res);
}).listen(port, () => console.log(`NEON BREACH dev server: http://localhost:${port}/game/`));
