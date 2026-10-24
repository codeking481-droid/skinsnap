import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.env.SKIN_SNAP_LEGAL_SITE_ROOT ?? 'artifacts/finalization/legal-site');
const config = JSON.parse(await fs.readFile(path.join(root, 'site-config.json'), 'utf8'));
const origins = [config.apiUrl, config.supabaseUrl].filter(Boolean).map(url => new URL(url).origin).join(' ');
const port = Number(process.env.SKIN_SNAP_LEGAL_SITE_PORT ?? 8795);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a valid local review port.');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };
http.createServer(async (request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  if (pathname === '/privacy') pathname = '/privacy.html';
  if (pathname === '/terms') pathname = '/terms.html';
  if (pathname === '/delete-account') pathname = '/delete-account.html';
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${config.deletionEnabled ? origins : ''}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  if (!target.startsWith(root + path.sep) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404).end('Not found'); return; }
  try { const body = await fs.readFile(target); response.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream' }); response.end(request.method === 'HEAD' ? '' : body); }
  catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local legal review: http://127.0.0.1:${port}`));
