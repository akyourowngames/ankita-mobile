import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';
import { initialState, restoreState } from '../src/core/state.ts';
import { createOutput } from '../src/assistant/outputs.ts';
import { STORAGE_KEY } from '../src/constants/appConfig.ts';

const state = initialState(), now = Date.now(); state.onboardingDone = true; state.assistant.preferences.suggestMemories = false;
const provider = { id: 'fixture', name: 'Preview provider', kind: 'openai', baseUrl: 'http://127.0.0.1:1/v1', model: 'preview-model', models: ['preview-model', 'another-model'], keyRequired: false };
state.providers = [provider]; state.activeProviderId = provider.id;
state.assistant.library = [{ id: 'brief', title: 'Draft brief', kind: 'note', content: 'Actual selected document.', createdAt: now, updatedAt: now }];
state.assistant.memories = [{ id: 'fact', text: 'Launch budget is 250 dollars', category: 'fact', pinned: false, source: { kind: 'user', conversationId: 'chat', messageId: 'user', quote: 'My launch budget is 250 dollars.' }, createdAt: now, updatedAt: now }];
state.conversations = [{ id: 'chat', title: 'Launch plan', createdAt: now, updatedAt: now, pinned: false, messages: [{ id: 'user', role: 'user', status: 'complete', content: 'Make a launch plan.' }, { id: 'reply', role: 'assistant', status: 'complete', content: 'Your launch plan is ready.', memoryIds: ['fact'], workId: 'job', tools: [{ id: 'read', name: 'web_read', title: 'Read a source', status: 'succeeded', arguments: '{}', result: '{"title":"Source"}', startedAt: now, finishedAt: now }, { id: 'calc', name: 'calculate', title: 'Calculate costs', status: 'succeeded', arguments: '{"expression":"12+8"}', result: '20', startedAt: now, finishedAt: now }] }] }];
const { models, ...requestProvider } = provider;
state.work.jobs = [{ id: 'job', title: 'Launch plan', status: 'completed', progress: 'Finished', reply: 'Your launch plan is ready.', error: '', artifacts: [], createdAt: now, updatedAt: now, request: { id: 'job', deviceId: state.work.deviceId, title: 'Launch plan', prompt: 'Make a launch plan.', system: '', messages: [{ role: 'user', content: 'Make a launch plan.' }], provider: requestProvider }, conversationId: 'chat', messageId: 'reply', teammateId: 'chief', submitted: true, delivered: true }];
state.assistant.artifacts = createOutput([], { id: 'plan', title: 'Launch notes', kind: 'document', content: '# Launch notes\n\nA clear plan.', source: { conversationId: 'chat', messageId: 'reply' } }, { id: () => 'plan', now: () => now }).artifacts;
restoreState(JSON.stringify(state));
const web = createWebServer(); await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: STORAGE_KEY });
const button = name => page.getByRole('button', { name, exact: true }), message = () => page.getByRole('textbox', { name: 'Message', exact: true });
const shots = new URL('../release/clean-chat/', import.meta.url); await fs.mkdir(shots, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${web.address().port}`); await message().waitFor();
  await button('Message actions').waitFor(); // New behavior must be discoverable through the sole composer action menu.
  assert.equal(await button('Choose provider and model').count(), 0); assert.equal(await button('Attach a document').count(), 0); assert.equal(await button('Run in background').count(), 0);
  const reply = await page.getByRole('main').getByText('Your launch plan is ready.', { exact: true }).boundingBox();
  const tools = await button('Tool activity').boundingBox(), memories = await button('Inspect 1 memories used for this reply').boundingBox();
  assert.ok(reply.y + reply.height <= tools.y, 'answer comes before tool metadata'); assert.ok(reply.y + reply.height <= memories.y, 'answer comes before memory metadata'); assert.ok(tools.height >= 44 && tools.height <= 60, 'compact accessible activity row'); assert.equal(await button('Remove work').count(), 0, 'no deletion button in chat');
  await message().fill('A draft worth keeping'); await button('Message actions').click(); await button('Choose provider and model').click();
  await page.getByRole('textbox', { name: 'Search models', exact: true }).fill('another'); await button('Preview provider: another-model').click(); assert.equal(await message().inputValue(), 'A draft worth keeping');
  await button('Message actions').click(); await page.getByText('another-model', { exact: true }).waitFor(); await button('Close message actions').click(); assert.equal(await message().inputValue(), 'A draft worth keeping');
  await button('Message actions').click(); await button('Attach a document').click(); await button('Draft brief').click(); await button('Remove attachment Draft brief').waitFor(); assert.equal(await message().inputValue(), 'A draft worth keeping');
  await button('Message actions').click(); await button('Run in background').click(); await page.getByRole('textbox', { name: 'Worker address', exact: true }).waitFor(); await button('Back').click(); await button('Back').click(); await button('Remove attachment Draft brief').waitFor(); assert.equal(await message().inputValue(), 'A draft worth keeping');
  await button('Tool activity').click(); await page.getByText('Calculate costs', { exact: true }).waitFor(); await button('Close tool activity').click(); await button('Inspect 1 memories used for this reply').click(); await page.getByText('Launch budget is 250 dollars', { exact: true }).waitFor(); await button('Close remembered facts').click();
  for (const width of [320, 390, 768, 1024]) { await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(150); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); const box = await button('Send message').boundingBox(); assert.ok(box.width >= 44 && box.height >= 44); await page.screenshot({ path: fileURLToPath(new URL(`chat-${width}.png`, shots)) }); await button('Message actions').click(); await button('Run in background').waitFor(); await page.waitForTimeout(250); await page.screenshot({ path: fileURLToPath(new URL(`actions-${width}.png`, shots)) }); await button('Close message actions').click(); await button('Run in background').waitFor({ state: 'hidden' }); }
  assert.deepEqual(errors, []); console.log('CLEAN_CHAT_OK: answer-first compact tools/memory/work, one composer actions menu, model/attachment/setup routes preserve drafts, usable 320/390/768/1024 layouts; zero page errors.');
} finally { await browser.close(); web.closeAllConnections(); await new Promise(resolve => web.close(resolve)); }
