const { randomBytes, timingSafeEqual } = require('node:crypto');
const config = require('../src/constants/transport.json');
const { normalizeEndpoint } = require('../src/api/endpoint.cjs');
const composio = require('../src/constants/composio.json');
const publicConfig = require('../src/constants/assistantTransport.json');
const { fetchPublic } = require('./public-fetch.cjs');
const companion = require('../src/constants/companion.json');
const companionPolicy = require('../src/assistant/companionPolicy.cjs');
const work = require('../src/constants/work.json');
const workPolicy = require('../src/work/policy.cjs');
const TOKEN_BYTES = 32; // Cryptographic bytes: unguessable per-process local relay session.
const ALLOWED_HEADERS = new Set(['authorization', 'content-type', 'x-api-key', 'anthropic-version', 'anthropic-dangerous-direct-browser-access']);
const ALLOWED_ROUTES = /\/(models|messages|chat\/completions|chat|health)$/; // Only supported AI protocol operations.
const RETRY_AFTER_HEADER = 'retry-after'; // Safe retry timing survives the relay; cookies/private headers never do.

function createProviderProxy() {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  return async (req, res, next = () => { res.writeHead(404); res.end(); }) => {
    const path = (req.url || '').split('?')[0];
    const publicRequest = path === publicConfig.webProxyPath;
    const companionRequest = path === companion.relayPath;
    const workRequest = path === work.relayPath;
    if (![config.sessionPath, config.proxyPath, publicConfig.webProxyPath, companion.relayPath, work.relayPath].includes(path)) return next();
    res.setHeader('Cache-Control', 'no-store');
    const fail = (status, message) => { if (!res.headersSent) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: message })); } else res.destroy(); };
    const remote = req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return fail(403, 'Relay is available only on this computer. Native apps connect directly.');
    let sameOrigin = false;
    try { sameOrigin = req.headers.origin ? new URL(req.headers.origin).host === req.headers.host : req.headers['sec-fetch-site'] === 'same-origin'; } catch {}
    if (!sameOrigin) return fail(403, 'Only same-origin app requests are allowed.');
    if (path === config.sessionPath) { if (req.method !== 'GET') return fail(405, 'Method not allowed'); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ token })); }
    const received = String(req.headers['x-chief-session'] || '');
    const receivedBytes = Buffer.from(received), tokenBytes = Buffer.from(token);
    if (req.method !== 'POST' || receivedBytes.length !== tokenBytes.length || !timingSafeEqual(receivedBytes, tokenBytes)) {
      res.setHeader(config.relayErrorHeader, config.sessionInvalidCode);
      return fail(403, 'Invalid app relay session');
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), companionRequest ? companion.requestMs : publicRequest ? publicConfig.requestMs : config.requestTimeoutMs);
    const cancel = () => controller.abort(); req.on('aborted', cancel); res.on('close', cancel);
    try {
      let bytes = 0; const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > config.maxBodyBytes) return fail(413, 'Request exceeds mobile relay limit'); chunks.push(chunk); }
      let request, target;
      let composioTarget = false;
      if (companionRequest || workRequest) {
        try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); target = workRequest ? workPolicy.workerTarget(request.url, request.method) : companionPolicy.companionTarget(request.url, request.method); } catch { return fail(400, 'Invalid paired service request'); }
        const authorization = request.headers?.authorization;
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return fail(400, 'Companion pairing is required');
        const upstream = await fetch(target, { method: request.method, headers: { authorization, 'content-type': 'application/json' }, ...(request.method === 'POST' ? { body: request.body } : {}), redirect: 'error', signal: controller.signal });
        res.writeHead(upstream.status, { 'content-type': 'application/json', 'x-content-type-options': 'nosniff' });
        let received = 0;
        if (upstream.body) for await (const chunk of upstream.body) { received += chunk.length; if (received > (workRequest ? work.maxResponseBytes : companion.responseBytes)) { controller.abort(); throw new Error('Paired service response limit'); } res.write(chunk); }
        return res.end();
      }
      if (publicRequest) {
        try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail(400, 'Invalid public web request'); }
        if (request.method !== 'GET' || request.body) return fail(400, 'Public web requests must be read-only');
        const headers = {};
        for (const [name, value] of Object.entries(request.headers || {})) if (['accept', 'x-subscription-token'].includes(name.toLowerCase()) && typeof value === 'string') headers[name] = value;
        let upstream;
        try { upstream = await fetchPublic(request.url, { headers, signal: controller.signal }); } catch { return fail(400, 'Public web target was rejected or unavailable.'); }
        const exposed = { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream', 'x-content-type-options': 'nosniff' };
        if (upstream.headers.get('location')) exposed.location = upstream.headers.get('location');
        res.writeHead(upstream.status, exposed);
        let received = 0;
        if (upstream.body) for await (const chunk of upstream.body) { received += chunk.length; if (received > publicConfig.webMaxBytes) { controller.abort(); throw new Error('Public content limit'); } if (!res.write(chunk)) await new Promise((resolve, reject) => { const done = () => { res.removeListener('close', closed); resolve(); }; const closed = () => { res.removeListener('drain', done); reject(new Error('Client closed')); }; res.once('drain', done); res.once('close', closed); }); }
        return res.end();
      }
      try {
        request = JSON.parse(Buffer.concat(chunks).toString('utf8')); target = new URL(request.url);
        const root = new URL(composio.baseUrl);
        composioTarget = target.origin === root.origin && (target.pathname === `${root.pathname}/toolkits` || new RegExp(`^${root.pathname}${composio.sessionPath}(?:/[\\w-]+(?:/(?:tools|toolkits|link|execute|execute_meta))?)?$`).test(target.pathname));
        if (composioTarget) { if (target.username || target.password || target.hash || [...target.searchParams.keys()].some(k => !['limit', 'cursor', 'search'].includes(k))) throw new Error(); }
        else target = new URL(normalizeEndpoint(request.url));
      } catch { return fail(400, 'Invalid provider request'); }
      if ((!composioTarget && !ALLOWED_ROUTES.test(target.pathname)) || !['GET', 'POST'].includes(request.method)) return fail(400, 'Unsupported provider target');
      const headers = {};
      for (const [key, value] of Object.entries(request.headers || {})) if (ALLOWED_HEADERS.has(key.toLowerCase()) && typeof value === 'string') headers[key] = value;
      const upstream = await fetch(target, { method: request.method, headers, ...(request.method === 'POST' ? { body: request.body } : {}), redirect: 'manual', signal: controller.signal });
      if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return fail(502, 'Provider redirect rejected; configure its final API endpoint.'); }
      const responseHeaders = { 'content-type': upstream.headers.get('content-type') || 'application/json', 'x-content-type-options': 'nosniff' };
      if (upstream.headers.has(RETRY_AFTER_HEADER)) responseHeaders[RETRY_AFTER_HEADER] = upstream.headers.get(RETRY_AFTER_HEADER);
      res.writeHead(upstream.status, responseHeaders);
      if (upstream.body) for await (const chunk of upstream.body) { if (!res.write(chunk)) await new Promise((resolve, reject) => { const close = () => { res.removeListener('drain', drain); reject(new Error('Client closed')); }; const drain = () => { res.removeListener('close', close); resolve(); }; res.once('close', close); res.once('drain', drain); }); }
      res.end();
    } catch { fail(502, 'Provider request failed or timed out. Check your connection and endpoint.'); }
    finally { clearTimeout(timer); req.removeListener('aborted', cancel); res.removeListener('close', cancel); }
  };
}
module.exports = { createProviderProxy };
