import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: theme + config must stay centralized (no hardcoded copies in UI).
// Fails if CozyScreen/HomeScreen/chiefClient introduce inline hex or localhost literals.
const ROOT = new URL('../', import.meta.url);

function read(rel) {
  return readFileSync(new URL(rel, ROOT), 'utf8');
}

test('theme tokens define cozy palette', () => {
  const tokens = read('src/theme/tokens.ts');
  for (const hex of ['#1E1B16', '#FFF6E8', '#F5B942']) {
    assert.ok(tokens.includes(hex), `tokens.ts missing ${hex}`);
  }
});

test('screens use tokens, not inline hex', () => {
  for (const f of ['src/components/CozyScreen.tsx', 'src/screens/HomeScreen.tsx']) {
    const src = read(f);
    assert.ok(!/#[0-9A-Fa-f]{6}/.test(src), `${f} contains inline hex`);
    assert.ok(src.includes('COLOR.') || src.includes('SPACING.') || src.includes('tokens'), `${f} must import tokens`);
  }
});

test('backend URL is configurable, not hardcoded in client', () => {
  const client = read('src/api/chiefClient.ts');
  const config = read('src/constants/appConfig.ts');
  assert.ok(config.includes('EXPO_PUBLIC_CHIEF_API_URL'), 'config must read env');
  assert.ok(!client.includes('localhost'), 'client must not hardcode localhost');
});
