import http from 'node:http';
import https from 'node:https';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import config from '../src/constants/companion.json' with { type: 'json' };

// The server owns bounded run state; credentials never enter runtime hooks or events.
export function createCompanionServer({ token, runtime, tls }) {
  if (!token || !runtime) throw new Error('Pairing credential and desktop runtime are required.');
  const credential = Buffer.from(`Bearer ${token}`), runs = new Map();
  const handler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { if (!res.headersSent) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); } };
    const received = Buffer.from(String(req.headers.authorization || ''));
    if (received.length !== credential.length || !timingSafeEqual(received, credential)) return send(401, { error: 'Pair with the desktop companion first.' });
    const redact = value => String(value ?? '').split(token).join('[redacted]').slice(0, config.resultChars);
    try {
      const url = new URL(req.url, 'http://companion.invalid'), path = url.pathname;
      for (const [id, run] of runs) if (run.finished && Date.now() - run.finished > config.retentionMs) runs.delete(id);
      if (path === `${config.rootPath}/capabilities` && req.method === 'GET') return send(200, { version: config.version, tools: await runtime.capabilities(), approvals: true });
      async function body() {
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > config.bodyBytes) throw new Error('Request limit'); chunks.push(chunk); }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
      if (path === `${config.rootPath}/runs` && req.method === 'POST') {
        const input = await body();
        if (input.version !== config.version || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > config.textChars || Object.keys(input).some(key => !['version', 'prompt'].includes(key))) return send(400, { error: 'Unsupported desktop request.' });
        if ([...runs.values()].some(run => !run.finished)) return send(409, { error: 'The desktop is busy with another companion request.' });
        if (runs.size >= config.maxRuns) runs.delete(runs.keys().next().value);
        const id = randomUUID(), controller = new AbortController();
        const run = { id, controller, status: 'running', events: [], sequence: 0, pending: null, resolve: null, reply: '', finished: null, timer: null };
        const event = value => { run.events.push({ sequence: ++run.sequence, ...value, detail: redact(value.detail).slice(0, config.previewChars) }); run.events = run.events.slice(-config.eventCount); };
        const cancel = () => { if (!run.finished) { controller.abort(); run.resolve?.(false); run.resolve = null; run.pending = null; run.status = 'cancelled'; run.finished = Date.now(); clearTimeout(run.timer); } };
        run.cancel = cancel; run.timer = setTimeout(cancel, config.runMs); runs.set(id, run);
        const approve = async (name, detail) => {
          if (controller.signal.aborted) return false;
          run.status = 'waiting'; run.pending = { id: randomUUID(), name, detail: redact(detail).slice(0, config.previewChars) };
          const allowed = await new Promise(resolve => { run.resolve = resolve; });
          run.pending = null; run.resolve = null; if (!controller.signal.aborted) run.status = 'running';
          return allowed === true && !controller.signal.aborted;
        };
        Promise.resolve().then(() => runtime.run(input.prompt, { signal: controller.signal, approve, event })).then(reply => {
          if (controller.signal.aborted) return;
          run.reply = redact(reply); run.status = 'completed';
        }).catch(() => { if (!controller.signal.aborted) run.status = 'failed'; }).finally(() => {
          run.resolve?.(false); run.resolve = null; run.pending = null; run.finished ||= Date.now(); clearTimeout(run.timer);
        });
        return send(202, { id });
      }
      const match = path.match(new RegExp(`^${config.rootPath}/runs/([a-f\\d-]+)(?:/approvals/([a-f\\d-]+))?$`));
      const run = match && runs.get(match[1]); if (!run) return send(404, { error: 'Desktop request was not found.' });
      if (match[2] && req.method === 'POST') {
        const input = await body();
        if (typeof input.allow !== 'boolean' || Object.keys(input).length !== 1) return send(400, { error: 'Invalid approval.' });
        if (!run.pending || run.pending.id !== match[2] || run.finished) return send(409, { error: 'This approval is no longer pending.' });
        const resolve = run.resolve; run.pending = null; run.resolve = null; resolve?.(input.allow); return send(200, { accepted: true });
      }
      if (!match[2] && req.method === 'DELETE') { run.cancel(); return send(200, { cancelled: true }); }
      if (!match[2] && req.method === 'GET') {
        const after = Number(url.searchParams.get('after') || 0); if (!Number.isSafeInteger(after) || after < 0) return send(400, { error: 'Invalid event cursor.' });
        return send(200, { id: run.id, status: run.status, pending: run.pending, events: run.events.filter(event => event.sequence > after), reply: run.reply });
      }
      return send(405, { error: 'Unsupported companion operation.' });
    } catch { return send(400, { error: 'The desktop request could not be processed.' }); }
  };
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.on('close', () => { for (const run of runs.values()) run.cancel(); });
  return server;
}
