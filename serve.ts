// Merpati Kilat — serve.ts
// Server statik kecil untuk play-test lokal: sajikan game/ di localhost:8080.
// Node 22, stdlib only (node:http, node:fs, node:path). Tanpa dependensi.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const PORT: number = Number(process.env.PORT || 8080);
const gameDir: string = new URL('./game/', import.meta.url).pathname;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  // Hanya layani GET/HEAD; metode lain ditolak supaya server tetap statik murni.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('405 — hanya GET/HEAD');
    return;
  }
  const urlPath: string = decodeURIComponent((req.url || '/').split('?')[0]);
  const relPath: string = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const filePath: string = join(gameDir, relPath);
  if (!filePath.startsWith(gameDir) || !existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404 — file tidak ditemukan: ' + relPath);
    return;
  }
  const ext: string = extname(filePath).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log('Merpati Kilat tersaji di http://localhost:' + PORT);
});
