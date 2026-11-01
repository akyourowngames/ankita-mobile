import test from 'node:test';
import assert from 'node:assert/strict';
const probe = await import('../src/api/modelProbe.ts').catch(() => ({}));
for (const kind of ['openai', 'anthropic']) test(`${kind}: model test checks actual generation and native tool calling without executing a phone action`, async () => {
  assert.equal(typeof probe.probeModel, 'function');
  const provider = { id: 'p', name: 'Fixture', kind, baseUrl: 'https://fixture.test/v1', model: 'selected', keyRequired: true };
  let request;
  const fetcher = async (_url, init) => {
    request = JSON.parse(init.body);
    const tool = request.tools[0], name = tool.function?.name || tool.name;
    return Response.json(kind === 'openai' ? { choices: [{ message: { tool_calls: [{ id: 'probe', type: 'function', function: { name, arguments: '{}' } }] } }] } : { content: [{ type: 'tool_use', id: 'probe', name, input: {} }] });
  };
  assert.equal(await probe.probeModel(provider, 'private-fixture-key', fetcher, new AbortController().signal), 'tools');
  assert.equal(request.model, 'selected');
  assert.ok(request.max_tokens > 0 && request.max_tokens <= 128);
  assert.doesNotMatch(JSON.stringify(request), /private-fixture-key|phone_task_save|phone_memory_save/);
});
test('model test rejects a text-only reply rather than promising working assistant tools', async () => {
  assert.equal(typeof probe.probeModel, 'function');
  const provider = { id: 'p', name: 'Fixture', kind: 'openai', baseUrl: 'https://fixture.test', model: 'selected', keyRequired: false };
  await assert.rejects(probe.probeModel(provider, '', async () => Response.json({ choices: [{ message: { content: 'Hello' } }] }), new AbortController().signal), /tool/i);
});
