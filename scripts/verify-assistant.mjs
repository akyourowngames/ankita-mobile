import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';
import { initialState } from '../src/core/state.ts';
import { STORAGE_KEY } from '../src/constants/appConfig.ts';
import { TOOL_NAMES as N, ASSISTANT_SECRET_IDS } from '../src/assistant/config.ts';
import { VERIFY_TIMEOUTS } from './verification-config.mjs';
import { createCompanionServer } from '../server/companion.mjs';
import publicTransport from '../src/constants/assistantTransport.json' with { type: 'json' };

const PHONE = { width: 390, height: 844 }, NARROW = { width: 320, height: 640 }; // CSS px: supported phone regressions.
const SHOTS = new URL('../release/screenshots/', import.meta.url);
const TEXT = 'Remember I prefer concise answers.'; // User-provenance fixture, never production profile truth.
const requests = [];
const provider = http.createServer((req, res) => { const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => {
  const body = JSON.parse(Buffer.concat(chunks)); requests.push(body); res.setHeader('content-type', 'application/json');
  const user = body.messages.filter(message => message.role === 'user').at(-1)?.content;
  const tool = body.messages.at(-1)?.role === 'tool';
  const system = body.messages.find(message => message.role === 'system')?.content || '';
  if (system.includes('Review only the supplied user message')) return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ memories: typeof user === 'string' && user.includes('I like green tea') ? [{ text: 'Likes green tea', category: 'preference', source_quote: 'I like green tea' }] : [] }) } }] }));
  if (user === 'I like green tea.') return res.end(JSON.stringify({ choices: [{ message: { content: 'Tea preference understood.' } }] }));
  if (Array.isArray(user) || (typeof user === 'string' && user.includes('Selected document '))) return res.end(JSON.stringify({ choices: [{ message: { content: 'Read actual attached document.' } }] }));
  const toolName = user?.includes('computer') ? N.desktopRun : user?.includes('public page') ? N.webRead : user?.includes('task') ? N.taskSave : N.memorySave;
  const args = toolName === N.desktopRun ? { prompt: 'Run the approved desktop fixture' } : toolName === N.webRead ? { url: 'https://example.com/' } : toolName === N.taskSave ? { title: 'Actual model task' } : { text: 'Prefers concise answers', category: 'preference', source_quote: 'I prefer concise answers' };
  const result = tool ? JSON.parse(body.messages.at(-1).content) : null;
  res.end(JSON.stringify({ choices: [{ message: tool ? { content: result.ok ? toolName === N.desktopRun ? result.data.reply : toolName === N.webRead ? `Read the sourced page: ${result.data.title}.` : 'Saved using the real phone tool.' : 'The action was declined.' } : { tool_calls: [{ id: `fixture-${requests.length}`, type: 'function', function: { name: toolName, arguments: JSON.stringify(args) } }] } }] }));
}); });
const web = createWebServer();
const PAIRING = 'browser-fixture-pairing-key'; // Fixture only; the production launcher generates a private random token.
let desktopActions = 0;
const companion = createCompanionServer({ token: PAIRING, runtime: { capabilities: async () => ['fixture_action'], run: async (prompt, hooks) => { const allowed = await hooks.approve('fixture_action', 'Perform actual browser fixture action'); if (!allowed) return 'Computer action declined.'; desktopActions++; hooks.event({ type: 'tool_result', name: 'fixture_action', detail: 'Fixture action executed' }); return 'Computer fixture completed.'; } } });
await Promise.all([new Promise(resolve => provider.listen(0, '127.0.0.1', resolve)), new Promise(resolve => web.listen(0, '127.0.0.1', resolve)), new Promise(resolve => companion.listen(0, '127.0.0.1', resolve))]);
const state = initialState(); state.onboardingDone = true; state.assistant.preferences.suggestMemories = false;
state.providers = [{ id: 'fixture', kind: 'openai', name: 'Assistant fixture', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, model: 'fixture-model', keyRequired: false }]; state.activeProviderId = 'fixture';
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: PHONE });
page.setDefaultTimeout(VERIFY_TIMEOUTS.interactionMs);
const errors = []; page.on('pageerror', error => errors.push(error.message));
// Keep this UI flow independent from public-network availability. URL/relay
// validation and content extraction have their own assistant-web tests.
let publicReads = 0;
await page.route(`**${publicTransport.webProxyPath}`, async route => {
  assert.equal(route.request().postDataJSON().url, 'https://example.com/');
  publicReads++;
  await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Example Domain</title><main><h1>Example Domain</h1><p>Public webpage fixture for the assistant UI.</p></main>' });
});
await page.addInitScript(({ key, state }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
const button = title => page.getByRole('button', { name: title, exact: true });
// Assistant management is reached through the sidebar's single Settings entry.
const goTo = async title => {
  if (!await page.getByRole('main').getByText('Settings', { exact: true }).count()) {
    if (await button('Conversations').count()) await button('Conversations').click();
    await button('Settings').click();
    await button('Close sidebar').waitFor({ state: 'hidden' });
  }
  if (title !== 'Settings') await button(title).click();
};
const field = name => page.getByRole('textbox', { name, exact: true });
const snapshot = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const waitSaved = async predicate => { await page.waitForFunction(({ key, source }) => { const data = JSON.parse(localStorage.getItem(key)); return data && new Function('state', `return (${source})(state)`)(data); }, { key: STORAGE_KEY, source: predicate.toString() }); };
const shot = async name => { await fs.mkdir(SHOTS, { recursive: true }); await page.waitForTimeout(VERIFY_TIMEOUTS.visualSettleMs); await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, SHOTS)), fullPage: true }); };
try {
  await page.goto(process.env.CHIEF_VERIFY_URL || `http://127.0.0.1:${web.address().port}`);
  await goTo('Assistant'); await button('Memory').click(); await button('Add memory').click();
  await field('Memory text').fill('Lives in a quiet neighbourhood'); await button('Save memory').click();
  await button('Edit Lives in a quiet neighbourhood').click(); await page.getByRole('switch', { name: 'Pin in every conversation' }).click(); await button('Save memory').click();
  await button('Back').click(); await button('Tasks').click(); await button('Add task').click(); await field('Task title').fill('Plan tomorrow'); await page.getByLabel('Due date & time', { exact: true }).fill('2030-06-12T10:30'); await button('Save task').click(); await waitSaved(state => state.assistant.tasks[0]?.dueAt !== null); await field('Search tasks').fill('tomorrow'); await button('Complete Plan tomorrow').click();
  await button('Back').click(); await button('Library').click(); await button('New note').click(); await field('Note title').fill('Project brief'); await field('Note text').fill('An actual stored note.'); await button('Save note').click();
  await button('Project brief').click(); assert.equal(await field('Note text').inputValue(), 'An actual stored note.'); await button('Cancel').click(); await button('Back').click();
  await shot('assistant-hub'); await button('Back').click();
  await field('Message').fill(TEXT); await button('Send message').click(); await button('Allow once').waitFor();
  assert.equal((await snapshot()).assistant.memories.length, 1, 'An approval cannot pre-save a model memory');
  await button('Allow once').click(); await button('Retry reply').waitFor(); await page.getByText('Saved using the real phone tool.', { exact: true }).waitFor();
  await waitSaved(state => state.assistant.memories.length === 2);
  const saved = await snapshot(); assert.equal(saved.assistant.memories[1].source.kind, 'user'); assert.equal(saved.assistant.memories[1].pinned, false);
  assert.match(requests[0].messages[0].content, /Lives in a quiet neighbourhood/);
  const toolBox = await button('Tool activity').boundingBox(), replyBox = await page.getByRole('main').getByText('Saved using the real phone tool.', { exact: true }).boundingBox();
  assert.ok(toolBox.y - (replyBox.y + replyBox.height) >= 12, 'Completed tools sit below the answer with clear spacing');
  assert.ok(toolBox.height >= 44 && toolBox.height <= 60, 'Completed tool summary stays compact and accessible');
  await shot('assistant-tool-spacing');
  await button('Tool activity').click(); await page.getByRole('dialog').last().getByText('Completed', { exact: true }).waitFor(); await shot('assistant-tool-result'); await button('Close tool activity').click();
  await field('Message').fill('Create a task'); await button('Send message').click(); await button('Decline action').click(); await button('Retry reply').waitFor();
  assert.equal((await snapshot()).assistant.tasks.length, 1);
  await field('Message').fill('Create another task'); await button('Send message').click(); await button('Allow once').waitFor(); await button('Stop assistant').click(); await page.getByText('Stopped · partial reply kept', { exact: true }).waitFor();
  await button('Allow once').waitFor({ state: 'hidden' }); assert.equal((await snapshot()).assistant.tasks.length, 1);
  await page.reload(); await goTo('Assistant'); await button('Memory').click(); await field('Search memories').fill('concise'); await button('Edit Prefers concise answers').waitFor();
  await button('Edit Prefers concise answers').click(); await field('Memory text').fill('Prefers brief answers'); await button('Save memory').click(); await field('Search memories').fill('brief'); await button('Edit Prefers brief answers').click(); await button('Forget memory').click(); await button('Confirm forget').click();
  await waitSaved(state => state.assistant.memories.length === 1); await button('Back').click();
  await button('Memory').click(); await page.getByRole('switch', { name: 'Suggest useful memories' }).click(); await button('Back').click(); await button('Back').click();
  await field('Message').fill('I like green tea.'); await button('Send message').click(); await button('Retry reply').waitFor();
  await waitSaved(state => state.assistant.proposals.length === 1);
  assert.equal((await snapshot()).assistant.memories.length, 1, 'Consolidation must not auto-save a proposed fact');
  await page.reload(); await goTo('Assistant'); await button('Memory').click(); await page.getByText('Likes green tea', { exact: true }).waitFor(); await button('Remember this').click();
  await waitSaved(state => state.assistant.memories.length === 2 && state.assistant.proposals.length === 0); assert.equal((await snapshot()).assistant.memories.find(memory => memory.text === 'Likes green tea').pinned, false);
  await button('Back').click();
  await button('Library').click();
  const picker = page.waitForEvent('filechooser'); await button('Import a file').click(); await (await picker).setFiles({ name: 'actual-brief.md', mimeType: 'text/markdown', buffer: Buffer.from('# Selected brief\nActual imported phone text.') });
  await field('Note text').waitFor(); assert.match(await field('Note text').inputValue(), /Actual imported phone text/); await button('Use in conversation').click();
  await field('Message').fill('Read my selected document'); await button('Send message').click(); await button('Retry reply').waitFor(); await page.getByText('Read actual attached document.', { exact: true }).waitFor();
  assert.match(JSON.stringify(requests.at(-1).messages), /Actual imported phone text/);
  await field('Message').fill('Read a public page'); await button('Send message').click(); await button('Allow once').click(); await button('Retry reply').waitFor(); await page.getByText('Read the sourced page: Example Domain.', { exact: true }).waitFor();
  assert.match(JSON.stringify(requests.at(-1).messages), /https:\/\/example.com/);
  assert.equal(publicReads, 1, 'The model reads the sourced webpage fixture once');
  // Pairing now has its own QR/code screen. Restore a paired fixture here to
  // keep this acceptance focused on real chat delegation and nested approvals;
  // invitation setup and revocation have dedicated pairing UI/HTTP tests.
  await page.addInitScript(({ key, secretId, token, baseUrl }) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.assistant.desktop = { enabled: true, baseUrl };
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('chief.tab-secret.' + secretId, token);
  }, { key: STORAGE_KEY, secretId: ASSISTANT_SECRET_IDS.desktop, token: PAIRING, baseUrl: `http://127.0.0.1:${companion.address().port}` });
  await page.reload(); await field('Message').waitFor();
  assert.equal((await snapshot()).assistant.desktop.enabled, true, 'paired fixture restores before delegation');
  assert.ok(!JSON.stringify(await snapshot()).includes(PAIRING), 'Pairing keys cannot enter exported/persistent state');
  await field('Message').fill('Work on my computer'); await button('Send message').click(); await button('Allow once').click(); await page.getByText('Desktop · fixture_action', { exact: true }).waitFor(); await button('Decline action').click(); await page.getByText('Computer action declined.', { exact: true }).waitFor(); assert.equal(desktopActions, 0);
  await field('Message').fill('Try the computer again'); await button('Send message').click(); await button('Allow once').click(); await page.getByText('Desktop · fixture_action', { exact: true }).waitFor(); await button('Allow once').click(); await page.getByText('Computer fixture completed.', { exact: true }).waitFor(); assert.equal(desktopActions, 1);
  await goTo('Assistant');
  await page.setViewportSize(NARROW);
  for (const name of ['Memory', 'Tasks', 'Library', 'Tools & permissions']) { await button(name).click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflow`); await shot(`assistant-${name.split(' ')[0].toLowerCase()}-narrow`); await button('Back').click(); }
  await button('Back').click(); await goTo('Settings'); await button('Privacy & data').click();
  const downloadEvent = page.waitForEvent('download'); await button('Export assistant data').click(); const download = await downloadEvent;
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8')); assert.equal(exported.records.memories.length, 2); assert.match(exported.records.library.find(item => item.title === 'actual-brief.md').content, /Actual imported/);
  await button('Clear assistant data').click(); await button('Clear personal assistant data').click(); await waitSaved(state => !state.assistant.memories.length && !state.assistant.tasks.length && !state.assistant.library.length); assert.ok((await snapshot()).conversations.length > 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`ASSISTANT_UI_OK: real memory/task/note CRUD and local due picker; explicit pins; model tool approval/denial/Stop; receipts/reload; system-picker import; sourced webpage; background review/accept without auto-pin; paired desktop HTTP delegation, nested approval/denial and secret isolation; export/clear with chats retained; 320/390 layouts; ${requests.length} provider HTTP requests; zero page errors`);
} catch (error) { await shot('assistant-verification-failure'); console.error('ASSISTANT_UI_FAILURE', await page.locator('body').innerText()); throw error; }
finally { await browser.close(); for (const server of [web, provider, companion]) { server.closeAllConnections(); server.close(); } }
