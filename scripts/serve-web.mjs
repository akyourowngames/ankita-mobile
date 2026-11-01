import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), config = require('../src/constants/transport.json');
const { createProviderProxy } = require('../server/provider-proxy.cjs');
const ROOT = fileURLToPath(new URL('../dist', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' };
export function createWebServer() {
  const proxy = createProviderProxy();
  return http.createServer((req, res) => void proxy(req, res, async () => {
    try {
      const requested = decodeURIComponent(new URL(req.url, 'http://unused.invalid').pathname);
      const file = path.resolve(ROOT, `.${requested === '/' ? '/index.html' : requested}`);
      if (!file.startsWith(`${ROOT}${path.sep}`)) { res.writeHead(403); res.end(); return; }
      const data = await fs.readFile(file); res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream'); res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createWebServer(), port = Number(process.env.CHIEF_WEB_PORT || config.defaultWebPort);
  server.listen(port, config.loopbackHost, () => console.log(`Chief web: http://${config.loopbackHost}:${server.address().port}`));
}
