import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';
import { initialState } from '../src/core/state.ts';
import { createOutput } from '../src/assistant/outputs.ts';
import { STORAGE_KEY } from '../src/constants/appConfig.ts';

const state = initialState(); state.onboardingDone = true;
state.assistant.artifacts = createOutput([], { id: 'lifecycle-output', title: 'Lifecycle brief', kind: 'document', content: '# Saved brief' }, { id: () => 'unused', now: Date.now }).artifacts;
const web = createWebServer(); await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(15000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(({ key, state }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
const button = name => page.getByRole('button', { name, exact: true });
// Native notification handlers can navigate underneath an open modal. Trigger
// the real background navigation actions without first dismissing the preview.
const backgroundPress = name => page.getByRole('button', { name, exact: true, includeHidden: true }).evaluate(node => node.click());
try {
  await page.goto(`http://127.0.0.1:${web.address().port}`);
  await button('Conversations').click(); await button('Settings').click(); await button('Close sidebar').waitFor({ state: 'hidden' });
  await button('Finished outputs').click(); await button('Preview Lifecycle brief').click(); await button('Edit output').click();
  const draft = page.getByRole('textbox', { name: 'Output text', exact: true });
  await draft.fill('# Keep this draft across navigation');
  await backgroundPress('Back'); // Finished outputs → Settings unmounts the source row.
  await page.waitForTimeout(100);
  assert.equal(await draft.count(), 1, 'navigating away must retain the active output editor');
  assert.equal(await draft.inputValue(), '# Keep this draft across navigation');
  await page.keyboard.press('Escape'); await button('Discard changes').waitFor(); await button('Keep editing').click();
  assert.equal(await draft.inputValue(), '# Keep this draft across navigation');
  await backgroundPress('Privacy & data');
  assert.equal(await draft.inputValue(), '# Keep this draft across navigation');
  await backgroundPress('Clear assistant data');
  await backgroundPress('Clear personal assistant data');
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).assistant.artifacts.length === 0, STORAGE_KEY);
  await draft.waitFor({ state: 'hidden' }); await button('Close output').waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('OUTPUT_LIFECYCLE_OK: real background screen navigation unmounts source row without losing draft; Escape still guards discard; explicit assistant-data clear destroys the private editor session; zero page errors.');
} finally { await browser.close(); web.closeAllConnections(); await new Promise(resolve => web.close(resolve)); }
