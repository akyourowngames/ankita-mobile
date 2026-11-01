import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../src/assistant/webPolicy.cjs';
import { readWebpage, searchWeb } from '../src/assistant/web.ts';
import { resolvePublicTarget } from '../server/public-fetch.cjs';

test('web URLs require public HTTPS without credentials, local names or reserved addresses', () => {
  for (const url of ['http://example.com', 'file:///data/private', 'https://user:pass@example.com', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1', 'https://172.16.0.1', 'https://192.168.1.1', 'https://169.254.169.254', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://device.local', 'https://single-label']) assert.throws(() => policy.publicURL(url), /public HTTPS/);
  assert.equal(policy.publicURL('https://example.com/a?q=one#section').href, 'https://example.com/a?q=one');
  assert.equal(policy.publicAddress('8.8.8.8'), true); assert.equal(policy.publicAddress('2606:4700:4700::1111'), true);
  for (const ip of ['0.1.2.3', '100.64.0.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '::', 'fc00::1', 'fe80::1', '2001:db8::1', '64:ff9b::7f00:1']) assert.equal(policy.publicAddress(ip), false, ip);
});
test('relay refuses mixed/private DNS and pins the checked resolved address', async () => {
  await assert.rejects(resolvePublicTarget('https://example.com', async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), /public address/);
  const target = await resolvePublicTarget('https://example.com', async () => [{ address: '8.8.8.8', family: 4 }]);
  assert.equal(target.address, '8.8.8.8'); assert.equal(target.url.hostname, 'example.com');
});
test('web reading returns sourced visible text, excludes scripts and refuses unsafe redirect/oversize', async () => {
  const signal = AbortSignal.timeout(5000);
  const result = await readWebpage('https://example.com/article', async () => new Response('<title>Real &amp; useful</title><style>private-style</style><script>private-script</script><main><h1>Article</h1><p>A clear result &lt;quoted&gt;.</p></main>', { headers: { 'content-type': 'text/html' } }), signal);
  assert.equal(result.title, 'Real & useful'); assert.equal(result.url, 'https://example.com/article'); assert.match(result.text, /A clear result <quoted>/); assert.doesNotMatch(result.text, /private-script|private-style/);
  let requests = 0;
  await assert.rejects(readWebpage('https://example.com', async () => { requests++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1' } }); }, signal), /public HTTPS/); assert.equal(requests, 1);
  await assert.rejects(readWebpage('https://example.com', async () => new Response('x', { headers: { 'content-type': 'text/plain', 'content-length': '999999999' } }), signal), /limit/);
});
test('configured search returns real sources and keeps credentials off result receipts', async () => {
  const options = { kind: 'brave', baseUrl: 'https://search.example.com' }, calls = [];
  const result = await searchWeb('mobile assistant', options, 'private-search-key', async (url, init) => { calls.push({ url, init }); return Response.json({ web: { results: [{ title: 'Actual page', url: 'https://example.com/article', description: 'A sourced result' }, { title: 'Blocked', url: 'https://127.0.0.1', description: 'private' }] } }); }, AbortSignal.timeout(5000));
  assert.equal(result.results.length, 1); assert.equal(calls[0].init.headers['X-Subscription-Token'], 'private-search-key'); assert.ok(!JSON.stringify(result).includes('private-search-key'));
  await assert.rejects(searchWeb('query', { kind: 'none', baseUrl: '' }, '', fetch, new AbortController().signal), /Configure/);
});
