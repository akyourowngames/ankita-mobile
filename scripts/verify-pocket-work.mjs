import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';
import { openWorkStore } from '../server/work-store.mjs';
import { createWorkRuntime } from '../server/work-runtime.mjs';
import { createWorkServer } from '../server/work-server.mjs';
import { initialState } from '../src/core/state.ts';
import { rememberMemory } from '../src/assistant/records.ts';
import { STORAGE_KEY } from '../src/constants/appConfig.ts';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ankita-pocket-ui-'));
let release; const gate = new Promise(resolve => { release = resolve; });
const requests = [], errors = [];
const provider = http.createServer((req, res) => { const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => void (async () => {
  const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
  await gate; res.setHeader('content-type', 'application/json');
  const tool = body.messages.at(-1)?.role === 'tool';
  const args = { title: 'Launch budget', kind: 'table', content: JSON.stringify({ columns: ['Item', 'Amount'], rows: [['Hosting', '12'], ['Domain', '8']] }) };
  const message = tool ? { content: 'Your edited-ready launch budget is complete.' } : { tool_calls: [{ id: 'budget-table', type: 'function', function: { name: 'output_create', arguments: JSON.stringify(args) } }] };
  res.end(JSON.stringify({ choices: [{ message }] }));
})()); });
const store = await openWorkStore(root), runtime = createWorkRuntime({ store });
const token = 'pocket-ui-private-fixture', worker = createWorkServer({ runtime, token }), web = createWebServer();
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await Promise.all([listen(provider), listen(worker), listen(web)]);
const base = `http://127.0.0.1:${web.address().port}`;
const state = initialState(); state.onboardingDone = true; state.assistant.preferences.suggestMemories = false;
state.providers = [{ id: 'fixture', kind: 'openai', name: 'Pocket fixture', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, model: 'fixture-model', keyRequired: false }]; state.activeProviderId = 'fixture';
state.assistant = rememberMemory(state.assistant, { text: 'Launch budget is 250 dollars', category: 'fact', pinned: false, source: { kind: 'user', conversationId: 'source-chat', messageId: 'source-message', quote: 'My launch budget is 250 dollars.' } }, { id: () => 'budget-memory', now: Date.now }).state;
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(({ state, key }) => { if (location.protocol === 'http:' && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: STORAGE_KEY });
const button = title => page.getByRole('button', { name: title, exact: true });
const field = title => page.getByRole('textbox', { name: title, exact: true });
const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const settings = async () => { if (await button('Conversations').count()) { await button('Conversations').click(); await button('Settings').click(); await button('Close sidebar').waitFor({ state: 'hidden' }); } else if (await button('Back').count()) { await button('Back').click(); } };
try {
  await page.goto(base); await field('Message').waitFor();
  await field('Message').fill('Create a table for my launch budget.');
  await button('Message actions').click(); await button('Run in background').click();
  await field('Worker address').fill(`http://127.0.0.1:${worker.address().port}`); await field('Pairing key').fill(token); await button('Connect worker').click();
  await page.getByText('Paired worker', { exact: true }).waitFor();
  await button('Back').click(); // Settings
  await button('Back').click(); // Chat; draft is preserved.
  assert.equal(await field('Message').inputValue(), 'Create a table for my launch budget.');
  await button('Message actions').click(); await button('Run in background').click(); await button('Start background work').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).work.jobs.length === 1, STORAGE_KEY);
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).work.jobs[0].submitted, STORAGE_KEY);
  for (let count = 0; count < 100 && !requests.length; count++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(requests.length, 1); assert.match(requests[0].messages[0].content, /250 dollars/);
  assert.equal(await field('Message').inputValue(), '');
  await page.goto('about:blank'); release();
  for (let count = 0; count < 100 && runtime.list()[0]?.status !== 'completed'; count++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(runtime.list()[0].status, 'completed');
  await page.goto(base); await field('Message').waitFor();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).work.jobs[0].delivered, STORAGE_KEY);
  let value = await saved(); assert.equal(value.assistant.artifacts.length, 1); assert.equal(value.work.notices.length, 1); assert.equal(value.conversations[0].messages.filter(message => message.workId).length, 1);
  assert.ok(!JSON.stringify(value).includes(token));
  await button('Inspect 1 memories used for this reply').click(); await page.getByText('Launch budget is 250 dollars', { exact: true }).waitFor(); await page.getByText(/My launch budget is 250 dollars/).waitFor(); await button('Close remembered facts').click();
  await settings(); await button('Work & recovery').click(); await button('Refresh work').click();
  await page.getByText(/Alerts disabled/).waitFor();
  await button('Back').click(); await button('Finished outputs').click(); await button('Preview Launch budget').click();
  await button('Edit output').click(); await field('Row 1, column 1').fill('Edited hosting'); await field('Row 1, column 2').fill('15'); await button('Remove row 2').click(); await button('Save output changes').click();
  await button('Save / Share').click(); const downloadPromise = page.waitForEvent('download'); await button('Download file').click(); const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.csv$/); const output = await fs.readFile(await download.path(), 'utf8'); assert.match(output, /Edited hosting/); assert.match(output, /15/);
  await page.reload(); await field('Message').waitFor(); await page.waitForTimeout(2300);
  value = await saved(); assert.equal(value.assistant.artifacts.length, 1); assert.match(value.assistant.artifacts[0].content, /Edited hosting/); assert.equal(value.work.notices.length, 1); assert.equal(requests.length, 2);
  await runtime.registerDevice(value.work.deviceId, 'ExponentPushToken[fixture]');
  await page.goto(`${base}/seed-fixture`); // Stop the renderer before replacing the fixture metadata.
  await page.evaluate(key => { const value = JSON.parse(localStorage.getItem(key)); value.work.notifications.enabled = true; value.work.notifications.registered = true; localStorage.setItem(key, JSON.stringify(value)); }, STORAGE_KEY);
  await page.goto(base); await field('Message').waitFor(); await settings(); await button('Work & recovery').click();
  await page.route('**/__chief_work', route => route.request().postDataJSON().method === 'DELETE' ? route.fulfill({ status: 502, contentType: 'application/json', body: '{}' }) : route.continue());
  await page.getByRole('switch', { name: 'Completion notifications', exact: true }).click();
  await page.waitForFunction(key => { const value = JSON.parse(localStorage.getItem(key)); return !value.work.notifications.enabled && value.work.notifications.revokePending; }, STORAGE_KEY);
  await page.getByText(/Push revocation is waiting for the worker to reconnect/).first().waitFor();
  await page.unroute('**/__chief_work'); await button('Refresh work').click();
  await page.waitForFunction(key => !JSON.parse(localStorage.getItem(key)).work.notifications.revokePending, STORAGE_KEY);
  assert.equal(store.read().devices[value.work.deviceId], undefined);
  await page.goto(`${base}/?share_text=Original%20shared%20brief&share_title=Shared%20brief&share_url=https%3A%2F%2Fexample.com`);
  await page.getByText('Shared with Ankita', { exact: true }).waitFor(); assert.equal(requests.length, 2);
  await button('Add to current draft').first().click();
  if (await button('Save to library').count()) await button('Save to library').first().click();
  await field('Message').waitFor(); value = await saved(); assert.ok(value.assistant.library.some(item => item.content.includes('Original shared brief'))); assert.equal(requests.length, 2); assert.equal(value.assistant.memories.length, 1);
  assert.equal(new URL(page.url()).search, '');
  for (const width of [320, 390, 1024]) { await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no horizontal page overflow at ${width}`); }
  await fs.mkdir(new URL('../release/screenshots/', import.meta.url), { recursive: true }); await page.screenshot({ path: fileURLToPath(new URL('../release/screenshots/pocket-work-chat.png', import.meta.url)), fullPage: true });
  assert.deepEqual(errors, []); console.log('POCKET_WORK_UI_OK: authenticated pairing; saved draft; durable work while renderer closed; ranked recall; one delivered result/notice; edited CSV read back; incoming share preview/attach; 320/390/1024 layouts. Native push and OS share sheets require physical-device acceptance.');
} catch (error) {
  console.log('POCKET_UI_FAILURE', error.message, await page.locator('body').innerText(), (await saved())?.work?.notices);
  throw error;
} finally {
  release(); await browser.close(); await runtime.close(); for (const server of [provider, worker, web]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await fs.rm(root, { recursive: true, force: true });
}
