import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_PRESETS } from '../src/constants/providers.ts';
import { buildRequest, normalizeEndpoint } from '../src/api/protocol.ts';
import { initialState, restoreState } from '../src/core/state.ts';

const LEGACY_KILO_ROOT = 'https://api.kilo.ai/api/gateway';
const CURRENT_KILO_ROOT = 'https://ai-gateway.kilo.ai/api/v1';
const savedProvider = baseUrl => ({ id: 'saved-kilo-provider', name: 'My gateway', kind: 'openai', baseUrl, model: 'my-chosen-model', keyRequired: false, models: ['my-chosen-model'], modelsUpdatedAt: 123 });

test('new Kilo providers send chat requests to the documented API root', () => {
  const preset = PROVIDER_PRESETS.find(provider => provider.id === 'kilo');
  const request = buildRequest({ ...preset, model: 'my-chosen-model' }, '', [{ role: 'user', content: 'Hello' }], '');
  assert.equal(request.url, `${CURRENT_KILO_ROOT}/chat/completions`);
});

test('pasted legacy roots upgrade during validation and requests only for compatible providers', () => {
  assert.equal(normalizeEndpoint(LEGACY_KILO_ROOT), CURRENT_KILO_ROOT);
  assert.equal(buildRequest(savedProvider(LEGACY_KILO_ROOT), '', [], '').url, `${CURRENT_KILO_ROOT}/chat/completions`);
  for (const kind of ['anthropic', 'chief']) assert.equal(normalizeEndpoint(LEGACY_KILO_ROOT, kind), LEGACY_KILO_ROOT);
});

test('saved legacy Kilo roots migrate while provider identity and model ownership remain intact', () => {
  for (const baseUrl of [LEGACY_KILO_ROOT, `${LEGACY_KILO_ROOT}/`, `  ${LEGACY_KILO_ROOT}///  `]) {
    const provider = savedProvider(baseUrl);
    const saved = { ...initialState(), providers: [provider], activeProviderId: provider.id };
    saved.teammates[0].providerId = provider.id;
    saved.teammates[0].model = provider.model;
    const restored = restoreState(JSON.stringify(saved));
    assert.deepEqual(restored.providers, [{ ...provider, baseUrl: CURRENT_KILO_ROOT }]);
    assert.equal(restored.activeProviderId, provider.id);
    assert.deepEqual(restored.teammates, saved.teammates);
    assert.deepEqual(restoreState(JSON.stringify(restored)).providers, restored.providers);
  }
});

test('saved custom roots and Kilo-like URLs stay unchanged', () => {
  const unchangedRoots = [
    CURRENT_KILO_ROOT,
    'https://custom.example/api/gateway',
    'http://api.kilo.ai/api/gateway',
    `${LEGACY_KILO_ROOT}/custom`,
    `${LEGACY_KILO_ROOT}?key=fixture`,
    `${LEGACY_KILO_ROOT}#fragment`,
    'https://api.kilo.ai.evil.example/api/gateway',
    'https://user:fixture@api.kilo.ai/api/gateway',
    'https://api.kilo.ai:444/api/gateway',
  ];
  for (const baseUrl of unchangedRoots) {
    const provider = savedProvider(baseUrl);
    const restored = restoreState(JSON.stringify({ ...initialState(), providers: [provider] }));
    assert.deepEqual(restored.providers, [provider]);
  }
});

test('saved Anthropic and Chief endpoints never receive OpenAI Kilo migration', () => {
  const providers = ['anthropic', 'chief'].map(kind => ({ ...savedProvider(LEGACY_KILO_ROOT), id: kind, kind }));
  assert.deepEqual(restoreState(JSON.stringify({ ...initialState(), providers })).providers, providers);
});
