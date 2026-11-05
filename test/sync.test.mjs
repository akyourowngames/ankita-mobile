import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
function read(rel) {
  return readFileSync(new URL(rel, ROOT), 'utf8');
}
function json(rel) {
  return JSON.parse(read(rel));
}

test('app.json stays in sync with appConfig', () => {
  const appJson = json('app.json').expo;
  const config = read('src/constants/appConfig.ts');
  assert.equal(appJson.slug, 'chief-mobile');
  assert.equal(appJson.scheme, 'chief');
  assert.ok(config.includes("'chief-mobile'"), 'appConfig slug drifted');
  assert.ok(config.includes("'chief'"), 'appConfig scheme drifted');
  const name = /export const APP_NAME = '([^']+)'/.exec(config)?.[1];
  const version = /export const APP_VERSION = '([^']+)'/.exec(config)?.[1];
  assert.equal(appJson.name, name, 'visible app name drifted');
  assert.equal(appJson.version, version, 'mobile version drifted');
  assert.equal(json('package.json').version, version);
  assert.equal(json('package-lock.json').version, version);
  assert.equal(json('package-lock.json').packages[''].version, version);
});

test('the packaged Android version and native build numbers match Expo metadata', () => {
  const config = json('app.json').expo;
  const gradle = read('android/app/build.gradle');
  assert.equal(/versionName "([^"]+)"/.exec(gradle)?.[1], config.version);
  assert.equal(Number(/versionCode (\d+)/.exec(gradle)?.[1]), config.android.versionCode);
  assert.equal(config.ios.buildNumber, String(config.android.versionCode));
});

test('package.json is private closed-source', () => {
  const pkg = json('package.json');
  assert.equal(pkg.private, true);
  assert.equal(pkg.name, 'chief-mobile');
});

test('tokens have full cozy shape', () => {
  const tokens = read('src/theme/tokens.ts');
  for (const key of ['background', 'surface', 'cream', 'honey', 'leaf', 'codeBlue', 'rose', 'lavender']) {
    assert.ok(tokens.includes(key), `missing color ${key}`);
  }
  assert.ok(tokens.includes('FEATURE_ACCENTS'), 'missing FEATURE_ACCENTS');
});
