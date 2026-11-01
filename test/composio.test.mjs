import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ComposioSession } from '../src/api/composioProtocol.ts';
import config from '../src/constants/composio.json' with { type: 'json' };
const DEADLINE_MS = 5000; // Milliseconds: local HTTP fixture deadline.
test('Composio session, paginated tools, account state, connection link and execution make real HTTP round trips', async t => {
  const calls = [];
  const server = http.createServer((req, res) => {
    const parts = []; req.on('data', chunk => parts.push(chunk)); req.on('end', () => {
      const body = parts.length ? JSON.parse(Buffer.concat(parts)) : undefined;
      calls.push({ path: req.url, key: req.headers['x-api-key'], body }); res.setHeader('content-type', 'application/json');
      let reply;
      if (req.url === config.sessionPath) reply = { session_id: 'fixture-session' };
      else if (req.url.includes('/tools?')) reply = req.url.includes('cursor=next') ? { items: [{ slug: 'SECOND', input_parameters: { type: 'object', properties: {} } }] } : { items: [{ slug: 'FIRST', input_parameters: { query: { type: 'string', required: true } } }], next_cursor: 'next' };
      else if (req.url.includes('/toolkits?')) reply = req.url.includes('cursor=later') ? { items: [{ slug: 'later', name: 'Later account', connected_account: { status: 'ACTIVE' } }] } : { items: [{ slug: 'fixture', name: 'Fixture', connected_account: { status: 'ACTIVE' } }], next_cursor: 'later' };
      else if (req.url.endsWith('/link')) reply = { redirect_url: 'https://example.test/connect' };
      else reply = { data: { executed: true } };
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const local = `http://127.0.0.1:${server.address().port}`;
  const fetcher = (url, options) => fetch(`${local}${new URL(url).pathname.replace(new URL(config.baseUrl).pathname, '')}${new URL(url).search}`, options);
  const session = await ComposioSession.create({ enabled: true, userId: 'fixture-user', toolkits: ['fixture'] }, 'fixture-key', fetcher, AbortSignal.timeout(DEADLINE_MS));
  const tools = await session.tools(); assert.deepEqual(tools.map(t => t.function.name), ['FIRST', 'SECOND']);
  assert.deepEqual(tools[0].function.parameters.required, ['query']);
  const accounts = await session.toolkits(); assert.equal(accounts[0].connected, true); assert.equal(accounts[1].connected, true); assert.equal(accounts[1].slug, 'later');
  assert.equal(await session.connect('fixture'), 'https://example.test/connect');
  assert.match(await session.execute('FIRST', { query: 'hello' }), /executed/);
  assert.match(await session.execute('COMPOSIO_FIXTURE', {}), /executed/);
  assert.deepEqual(calls[0].body.toolkits, { enable: ['fixture'] });
  assert.equal(calls[0].body.premium_usage, false); assert.ok(calls.every(c => c.key === 'fixture-key'));
  assert.match(calls.at(-1).path, /execute_meta$/);
});
test('Composio rejects malformed schemas, repeated cursors, oversized responses and insecure links', async () => {
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const session = payload => new ComposioSession('fixture', 'fixture-key', async () => Response.json(payload), signal);
  await assert.rejects(session({ items: [{ slug: 'BAD', input_parameters: { field: null } }] }).tools(), /invalid tool schema/);
  await assert.rejects(session({ items: [], next_cursor: 'same' }).tools(), /repeated page cursor/);
  await assert.rejects(session({ redirect_url: 'http://example.test' }).connect('fixture'), /invalid connection link/);
  await assert.rejects(session({ data: 'x'.repeat(config.maxResponseBytes) }).execute('FIRST', {}), /too large/);
  await assert.rejects(ComposioSession.create({ userId: 'fixture', toolkits: [] }, '', fetch, signal), /Add your Composio key/);
});
