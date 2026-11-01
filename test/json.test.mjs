import test from 'node:test';
import assert from 'node:assert/strict';
import { readJSON } from '../src/api/readJSON.ts';
const MAX_BYTES = 100, DEADLINE_MS = 5000; // Local test byte ceiling and milliseconds.
test('JSON parsing bounds bytes, preserves Unicode and hides invalid remote payloads', async () => {
  const signal = AbortSignal.timeout(DEADLINE_MS);
  assert.deepEqual(await readJSON(Response.json({ value: 'こんにちは' }), signal, MAX_BYTES, 'The provider'), { value: 'こんにちは' });
  await assert.rejects(readJSON(Response.json({ value: 'x'.repeat(MAX_BYTES) }), signal, MAX_BYTES, 'The provider'), /too large/);
  await assert.rejects(readJSON(new Response('secret-provider-data'), signal, MAX_BYTES, 'The provider'), { message: 'The provider returned invalid JSON.' });
});
test('Stop interrupts a stalled JSON reader', async () => {
  const controller = new AbortController(), response = new Response(new ReadableStream({ start() {} }));
  const result = readJSON(response, controller.signal, MAX_BYTES, 'The provider'); controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
});
