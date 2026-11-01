import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import config from '../src/constants/work.json' with { type: 'json' };
import policy from '../src/work/policy.cjs';

export function createWorkHandler({ runtime, token }) {
  const expected = Buffer.from(token);
  return async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.origin) return reply(403, { error: 'Browser requests must use the authenticated app relay.' });
      const received = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!received.length || received.length !== expected.length || !timingSafeEqual(received, expected)) return reply(401, { error: 'Pair this worker in Settings first.' });
      let target;
      try { target = policy.workerTarget(`http://127.0.0.1${req.url}`, req.method); } catch { return reply(400, { error: 'Unsupported worker operation.' }); }
      await runtime.ready;
      const route = target.pathname.slice(config.rootPath.length), parts = route.split('/').filter(Boolean);
      let body;
      if (req.method === 'POST') {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > config.maxRequestBytes) return reply(413, { error: 'Work request is too large.' }); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return reply(400, { error: 'Invalid work request.' }); }
      }
      if (route === '/capabilities') { const health = runtime.health(); return reply(health.ok ? 200 : 503, { version: config.version, durable: health.ok, tools: ['web_read', 'calculate', 'output_create'], maxJobs: config.maxJobs, push: true, health }); }
      if (route === '/jobs') return req.method === 'GET' ? reply(200, { jobs: runtime.list() }) : reply(202, await runtime.submit(body));
      const id = parts[1];
      if (parts[0] === 'devices') { if (req.method === 'DELETE') await runtime.unregisterDevice(id); else await runtime.registerDevice(id, body.token); return reply(200, { registered: req.method !== 'DELETE' }); }
      if (!runtime.get(id)) return reply(404, { error: 'Work was not found on this worker.' });
      if (req.method === 'DELETE') { await runtime.remove(id); return reply(200, { removed: true }); }
      if (parts[2] === 'cancel') return reply(200, await runtime.cancel(id));
      if (parts[2] === 'resume') return reply(200, await runtime.resume(id));
      return reply(200, runtime.get(id));
    } catch (error) {
      // Protocol validation messages are controlled by this runtime; upstream
      // private errors are converted by execute() before reaching the API.
      const known = /^(Invalid |Persistent work needs|Add your API key|Work identity|Work history|Only interrupted|This job used|Work request|Work context)/.test(error.message || '');
      return reply(known && /different request/.test(error.message) ? 409 : 400, { error: known ? error.message : 'The worker could not save this operation. Check its storage and try again.' });
    }
  };
}
export function createWorkServer(options) { const handler = createWorkHandler(options); return http.createServer((req, res) => { void handler(req, res); }); }
