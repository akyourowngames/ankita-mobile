import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';
import composio from '../src/constants/composio.json' with { type: 'json' };
import transport from '../src/constants/transport.json' with { type: 'json' };
import { VERIFY_TIMEOUTS } from './verification-config.mjs';

const PHONE = { width: 390, height: 844 }; // iPhone-sized CSS viewport fixture.
const SMALL_PHONE = { width: 320, height: 640 }; // Narrow phone layout regression fixture.
const DESKTOP = { width: 1280, height: 900 }; // Wide web layout fixture.
const TIMEOUT_MS = VERIFY_TIMEOUTS.interactionMs, CHUNK_MS = 100; // Milliseconds: UI assertion deadline and fixture stream cadence.
const SCREENSHOT_DIR = new URL('../release/screenshots/', import.meta.url);
const FIXTURE_KEY = 'fixture-session-secret';
const TOUCH_PX = 44, MAX_HISTORY_ROW_PX = 80; // CSS pixels: minimum tap area and bounded two-line history rows.
const DRAFT = 'Keep this draft while I check settings'; // UI-only unsent text fixture.
let cancelled = false, received = [], modelRequests = 0;
const upstream = http.createServer((req, res) => {
  if (req.url === '/delayed/models') { res.setHeader('content-type', 'application/json'); setTimeout(() => res.end('{"data":[{"id":"obsolete-model"}]}'), CHUNK_MS * 5); return; }
  // Deliberately no CORS headers: only the app's same-origin relay can use this provider in a browser.
  if (req.url === '/v1/models') { modelRequests++; res.setHeader('content-type', 'application/json'); return res.end('{"data":[{"id":"fixture-model"},{"id":"alt-model"}]}'); }
  const body = []; req.on('data', b => body.push(b)); req.on('end', () => {
    const data = JSON.parse(Buffer.concat(body).toString()); received.push(data);
    const last = data.messages.at(-1)?.content || '';
    if (last === 'rate limit fixture') { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' }); return res.end(JSON.stringify({ error: { code: 429, message: 'private-provider-sentinel' } })); }
    if (last === 'quota fixture') { res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 'insufficient_quota', message: 'private-provider-sentinel' } })); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (data.tools?.some(tool => tool.function.name === 'check_connection')) { setTimeout(() => res.end('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"connection-probe","function":{"name":"check_connection","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n'), CHUNK_MS * 5); return; }
    if (last === 'stream error fixture') return res.end('data: {"error":{"code":503,"message":"private-provider-sentinel"}}\n\ndata: [DONE]\n\n');
    if (last === 'Read fixture app') return res.end('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"fixture-call","function":{"name":"READ_FIXTURE","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n');
    if (/slow/i.test(last)) { const timer = setInterval(() => res.write('data: {"choices":[{"delta":{"content":"Still thinking. "}}]}\n\n'), CHUNK_MS); res.on('close', () => { cancelled = true; clearInterval(timer); }); return; }
    res.write('data: {"choices":[{"delta":{"content":"Here is your "}}]}\n\n');
    setTimeout(() => res.end('data: {"choices":[{"delta":{"content":"**clear plan**.\\n\\n• Start with one thing.\\n• Keep it simple."}}]}\n\ndata: [DONE]\n\n'), CHUNK_MS);
  });
});
const web = createWebServer();
await Promise.all([new Promise(r => upstream.listen(0, '127.0.0.1', r)), new Promise(r => web.listen(0, '127.0.0.1', r))]);
const url = process.env.CHIEF_VERIFY_URL || `http://127.0.0.1:${web.address().port}`, providerUrl = `http://127.0.0.1:${upstream.address().port}/v1`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: PHONE });
const page = await context.newPage();
let toolExecutions = 0;
await page.route(`**${transport.proxyPath}`, async route => {
  const request = route.request().postDataJSON();
  if (!request.url.startsWith(composio.baseUrl)) return route.continue();
  const path = new URL(request.url).pathname; let body;
  if (path.endsWith('/toolkits')) body = { items: [{ slug: 'fixture_app', name: 'Fixture app', connected_account: { status: 'ACTIVE' } }] };
  else if (path.endsWith(composio.sessionPath)) body = { session_id: 'fixture-session' };
  else if (path.endsWith('/tools')) body = { items: [{ slug: 'READ_FIXTURE', description: 'Read approved fixture data', input_parameters: { type: 'object', properties: {} } }] };
  else if (path.endsWith('/execute')) { toolExecutions++; body = { data: { value: 'fixture-tool-result' } }; }
  else throw new Error(`Unexpected Composio fixture route: ${path}`);
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
page.setDefaultTimeout(TIMEOUT_MS);
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', message => { if (message.type() === 'error' || /props.pointerEvents|useNativeDriver.*not supported/.test(message.text())) errors.push(message.text()); });
const button = title => page.getByRole('button', { name: title, exact: true });
// Settings is the only management entry in the conversation sidebar.
const goTo = async title => {
  if (!await page.getByRole('main').getByText('Settings', { exact: true }).count()) {
    if (await button('Conversations').count()) await button('Conversations').click();
    await button('Settings').click();
    await button('Close sidebar').waitFor({ state: 'hidden' });
  }
  if (title !== 'Settings') await button(title).click();
};
// The drawer finishes its fade-out before header controls become unique again.
const closeDrawer = async () => { await button('Close sidebar').click(); await button('Close sidebar').waitFor({ state: 'hidden' }); };
const shot = async name => { await page.waitForTimeout(CHUNK_MS * 3); await fs.mkdir(SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, SCREENSHOT_DIR)), fullPage: true }); };
try {
  await page.goto(url, { timeout: process.env.CHIEF_VERIFY_URL ? VERIFY_TIMEOUTS.developmentMs : TIMEOUT_MS }); await button('Get started').waitFor(); await shot('01-onboarding');
  await button('Get started').click(); await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Krish'); await button('Continue').click(); await button('Set up my provider').click();
  await button('Add Custom provider').click(); await page.getByRole('textbox', { name: 'Provider name', exact: true }).fill('Local test'); await page.getByRole('textbox', { name: 'API base URL', exact: true }).fill(providerUrl); await page.getByRole('switch', { name: 'API key required' }).click(); await page.getByRole('textbox', { name: 'API key', exact: true }).fill(FIXTURE_KEY);
  await page.getByRole('textbox', { name: 'API base URL', exact: true }).fill(providerUrl.replace('/v1', '/delayed'));
  await button('Test connection & find models').click();
  await page.getByRole('textbox', { name: 'API base URL', exact: true }).fill(providerUrl);
  await page.waitForTimeout(CHUNK_MS * 7);
  assert.equal(await button('obsolete-model').count(), 0);
  assert.equal(await page.getByText(/Connection works/).count(), 0);
  await button('Test connection & find models').click(); await button('fixture-model').click(); await button('Test selected model').click();
  await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill('changed-during-probe');
  await page.waitForTimeout(CHUNK_MS * 7);
  assert.equal(await page.getByText(/Selected model generated a native tool call/).count(), 0, 'A previous model probe must not certify an edited model');
  await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill('fixture-model');
  await button('Test selected model').click(); await page.getByText(/Selected model generated a native tool call/).waitFor(); await shot('02-provider'); await button('Save provider').click(); await button('Start chatting').click(); await shot('03-chat-empty');
  await button('Message actions').click(); assert.match(await button('Choose provider and model').innerText(), /fixture-model/, 'Message actions show the active model');
  await button('Choose provider and model').click();
  await shot('03b-model-picker');
  await page.getByRole('textbox', { name: 'Search models', exact: true }).fill('alt');
  assert.equal(await button('Local test: fixture-model').count(), 0, 'Model search filters rows');
  await shot('03c-model-search');
  await button('Local test: alt-model').click();
  await button('Message actions').click(); assert.match(await button('Choose provider and model').innerText(), /alt-model/, 'Picking a model updates message actions');
  await button('Choose provider and model').click();
  await button('Local test: fixture-model').click();
  await button('Message actions').click(); assert.match(await button('Choose provider and model').innerText(), /fixture-model/, 'Model picker restores the default'); await button('Close message actions').click();
  assert.equal(await page.getByRole('navigation', { name: 'Workspace', exact: true }).count(), 0, 'No top or bottom workspace navigation');
  await button('Conversations').click();
  const conversationNavigation = page.getByRole('navigation', { name: 'Conversation history', exact: true });
  for (const destination of ['Assistant', 'Teammates', 'Chat', 'View all conversations']) assert.equal(await conversationNavigation.getByRole('button', { name: destination, exact: true }).count(), 0, 'Management stays inside Settings');
  assert.equal(await conversationNavigation.getByRole('button', { name: 'Settings', exact: true }).count(), 1);
  const settingsLink = await button('Settings').boundingBox();
  assert.ok(settingsLink.height >= TOUCH_PX && settingsLink.y + settingsLink.height <= PHONE.height, `Settings destination: ${JSON.stringify(settingsLink)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Sidebar must fit the phone width');
  await closeDrawer();
  const beforeStarter = received.length;
  await button('Plan my day').click();
  assert.match(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), /plan my day/);
  assert.equal(received.length, beforeStarter, 'A starter prepares a draft without sending');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(DRAFT);
  await goTo('Settings');
  await button('Back').click();
  assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), DRAFT, 'Opening settings preserves the conversation draft');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Plan my day'); await button('Send message').click(); await button('Retry reply').waitFor(); assert.match(await page.locator('body').innerText(), /clear plan/); assert.equal(received[0].model, 'fixture-model'); await shot('04-chat'); const composerBox = await page.getByRole('textbox', { name: 'Message' }).boundingBox(); assert.ok(composerBox.width > PHONE.width / 3, JSON.stringify(composerBox));
  const composerChip = await button('Message actions').boundingBox(), composerSend = await button('Send message').boundingBox();
  assert.ok(composerBox.y + composerBox.height <= composerChip.y + 1, `Writing area must sit above the toolbar: ${JSON.stringify({ composerChip, composerBox })}`);
  assert.ok(Math.abs(composerChip.y + composerChip.height / 2 - (composerSend.y + composerSend.height / 2)) <= 2, `Model and send controls share a toolbar: ${JSON.stringify({ composerChip, composerSend })}`);
  await page.evaluate(() => {
    // Capture the actual RN Web ScrollView layout callback, as an in-flight measurement does.
    for (const node of document.querySelectorAll('div')) {
      const fiberKey = Object.keys(node).find(key => key.startsWith('__reactFiber'));
      let fiber = fiberKey && node[fiberKey];
      while (fiber) {
        const instance = fiber.stateNode;
        if (instance && typeof instance._handleContentOnLayout === 'function' && typeof instance.props?.onContentSizeChange === 'function') { window.pendingScrollMeasurement = instance._handleContentOnLayout; return; }
        fiber = fiber.return;
      }
    }
    throw new Error('Transcript ScrollView was not found');
  });
  await button('New conversation').click();
  const measurementError = await page.evaluate(() => { try { window.pendingScrollMeasurement({ nativeEvent: { layout: { width: innerWidth, height: innerHeight } } }); return ''; } catch (error) { return error.message; } });
  assert.equal(measurementError, '', 'Delayed content measurement must survive switching to an empty chat');
  await button('Conversations').click(); await button('Open Plan my day').click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('slow request'); await button('Send message').click(); await page.getByText('Still thinking.', { exact: false }).first().waitFor(); await button('Stop reply').click(); await page.getByText('Stopped · partial reply kept', { exact: true }).waitFor(); await page.waitForFunction(() => document.body.innerText.includes('Stopped'));
  await goTo('Settings'); await button('Personal instructions').click(); await page.getByRole('textbox', { name: 'Personal instructions' }).fill('Personal instruction fixture'); await button('Save instructions').click();
  await button('AI providers').click(); await button('Local test').click(); const probesBefore = modelRequests; await button('Choose from available models').click(); await button('fixture-model').click(); await button('Save provider').click(); assert.equal(modelRequests, probesBefore, 'Saved model picker must not refetch the catalog'); await button('Back').click();
  await button('Teammates').click(); await button('Add teammate').click(); await page.getByRole('textbox', { name: 'Teammate name' }).fill('Research desk'); await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Research'); await page.getByRole('textbox', { name: 'Teammate instructions' }).fill('Teammate instruction fixture'); await button('Save teammate').click(); await button('Edit Research desk').click(); await page.getByRole('textbox', { name: 'Role', exact: true }).fill('Careful research'); await button('Save teammate').click(); await button('Research desk').click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Research fixture'); await button('Send message').click(); await button('Retry reply').waitFor(); assert.match(received.at(-1).messages[0].content, /Personal instruction fixture/); assert.match(received.at(-1).messages[0].content, /Teammate instruction fixture/); await shot('12-teammate-chat');
  await button('Choose teammate').click(); await button('Chief').click();
  await page.getByRole('textbox', { name: 'Message' }).fill('slow inactive deletion fixture'); await button('Send message').click(); await button('Stop reply').waitFor(); await goTo('Settings'); await button('Teammates').click(); await button('Edit Research desk').click(); await button('Remove this teammate').click(); await button('Remove teammate').click(); await button('Back').click(); await button('Stop reply').waitFor(); assert.match(await page.locator('body').innerText(), /Plan my day|clear plan/); await button('Stop reply').click();
  await goTo('Settings'); await button('Plugins').click(); await page.getByRole('textbox', { name: 'Composio API key' }).fill('fixture-composio-secret'); await button('Find apps & save key').click(); await button('Fixture app').click(); await page.getByRole('switch', { name: 'Enable Composio tools' }).click(); await button('Refresh connections').click(); await page.getByText('Connected', { exact: true }).waitFor(); await shot('13-plugins'); await button('Back').click(); await button('Back').click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Read fixture app'); await button('Send message').click(); await button('Allow once').click(); await button('Retry reply').waitFor(); assert.equal(toolExecutions, 1); assert.match(JSON.stringify(received.at(-1).messages), /fixture-tool-result/);
  await goTo('Settings'); await button('Plugins').click(); await button('Remove Composio key').click(); await page.getByText('Key removed. App tools are disabled.', { exact: true }).waitFor(); await button('Back').click(); await shot('10-settings'); await button('Appearance').click(); await button('Use light theme').click(); await shot('05-appearance-light'); await button('Use Sage accent').click(); await button('Use dark theme').click(); await shot('06-appearance-dark');
  await page.setViewportSize(SMALL_PHONE); await shot('07-small-phone'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false); await page.setViewportSize(PHONE);
  await button('Back').click(); await button('Your profile').count();
  await button('Krish').click(); await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('K'); await button('Save profile').click();
  await button('About Ankita').click(); await shot('08-about'); await button('Back').click(); await button('Back').click();
  await button('Conversations').click(); await shot('11-history'); const row = await button('Open Plan my day').boundingBox(); assert.ok(row.height >= TOUCH_PX && row.height <= MAX_HISTORY_ROW_PX, `Conversation row height: ${row.height}`); await page.getByRole('textbox', { name: 'Search conversations' }).fill('Plan my day'); await button('Open Plan my day').click();
  await page.waitForTimeout(CHUNK_MS * 5); const storage = await page.evaluate(() => ({ state: localStorage.getItem('chief.mobile.state.v1') || '', keys: Object.entries(localStorage).filter(([key]) => key.startsWith('chief.tab-secret.')).map(([, value]) => value) })); assert.equal(storage.state.includes(FIXTURE_KEY), false, 'provider keys never enter saved metadata'); assert.equal(storage.state.includes('fixture-composio-secret'), false, 'Composio key never enters saved metadata'); assert.match(storage.state, /Plan my day/); assert.ok(storage.keys.includes(FIXTURE_KEY), 'the browser provider key is retained across restarts'); assert.equal(storage.keys.includes('fixture-composio-secret'), false, 'removing a key clears it from browser storage');
  await page.reload(); await button('Conversations').waitFor(); assert.match(await page.locator('body').innerText(), /clear plan/);
  for (const [prompt, expected] of [['rate limit fixture', /Retry after 2 seconds/], ['quota fixture', /exhausted credits/], ['stream error fixture', /upstream model is unavailable/]]) { await button('New conversation').click(); await page.getByRole('textbox', { name: 'Message' }).fill(prompt); await button('Send message').click(); await page.getByText(expected).waitFor(); assert.doesNotMatch(await page.locator('body').innerText(), /private-provider-sentinel/); } await button('New conversation').click(); await page.getByRole('textbox', { name: 'Message' }).fill('Hello again'); await button('Send message').click(); await button('Retry reply').waitFor(); assert.match(await page.locator('body').innerText(), /clear plan/); const freshTab = await page.context().newPage(); await freshTab.goto(url); await freshTab.getByRole('textbox', { name: 'Message' }).fill('Fresh tab'); await freshTab.getByRole('button', { name: 'Send message', exact: true }).click(); await freshTab.getByText(/clear plan/).waitFor(); await freshTab.close();
  await page.setViewportSize(DESKTOP); await shot('09-desktop'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await goTo('Settings'); await button('Privacy & data').click(); await button('Clear conversations').click(); await button('Clear all conversations').click(); await page.getByText('Saved conversations', { exact: true }).waitFor();
  // Small-phone section and form checks exercise the actual RN screen tree.
  await page.setViewportSize(SMALL_PHONE);
  await button('Back').click();
  for (const title of ['Teammates', 'AI providers', 'Plugins', 'Personal instructions', 'Appearance', 'About Ankita']) {
    await button(title).click();
    await shot(`small-${title.replace(/[^a-z]+/gi, '-').toLowerCase()}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${title} overflows the phone`);
    await button('Back').click();
    if (title === 'Teammates') await goTo('Settings');
  }
  await button('Back').click();
  await button('Conversations').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Sidebar must fit the narrow phone');
  await closeDrawer();
  await button('New conversation').click(); await shot('07-chat-empty-small-phone');
  await page.waitForTimeout(CHUNK_MS * 5);
  const LONG_MESSAGES = 240, LONG_MATE = 'Research teammate with a deliberately long display name'; // Synthetic UI stress fixture, not production data.
  const stressState = await page.evaluate(({ count, mateName }) => {
    const entry = Object.entries(localStorage).find(([, value]) => { try { const data = JSON.parse(value); return Array.isArray(data.teammates) && Array.isArray(data.conversations); } catch { return false; } });
    if (!entry) throw new Error('Saved mobile state was not found');
    const [key, value] = entry, state = JSON.parse(value), now = Date.now();
    state.settings.theme = 'dark'; state.settings.textSize = 'large';
    state.teammates.push({ id: 'virtual-mate', name: mateName, description: 'A role with enough words to check wrapping', instructions: '', providerId: null, model: '' });
    state.activeTeammateId = state.teammates[0].id;
    state.conversations = [{ id: 'virtual-chat', teammateId: state.activeTeammateId, title: 'Long conversation fixture', createdAt: now, updatedAt: now, pinned: false, messages: Array.from({ length: count }, (_, i) => ({ id: `virtual-${i}`, role: i % 2 ? 'assistant' : 'user', content: i % 2 ? `Virtual reply ${i}: a measured list keeps earlier messages available without mounting every row.${i === count - 1 ? '\n\n```text\n' + 'long-code-token-'.repeat(25) + '\n```' : ''}` : `Virtual question ${i}`, status: 'complete' })) }];
    return { key, state };
  }, { count: LONG_MESSAGES, mateName: LONG_MATE });
  // Reload invokes the real background-save handler. Seed before the next app
  // startup so that handler cannot overwrite the fixture with the old state.
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), stressState);
  await page.reload();
  await page.getByText(`Virtual reply ${LONG_MESSAGES - 1}:`, { exact: false }).waitFor();
  const mountedReplies = await page.getByText(/^Virtual reply /).count();
  assert.ok(mountedReplies > 0 && mountedReplies < LONG_MESSAGES / 4, `Long transcript mounted ${mountedReplies} replies`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Long code must scroll within the message');
  await shot('14-long-chat-small-phone');
  // A genuine upward wheel gesture pauses following even when wrapping changes
  // measured row heights. Returning to the bottom must resume following.
  await page.mouse.move(SMALL_PHONE.width / 2, SMALL_PHONE.height / 3);
  await page.mouse.wheel(0, -SMALL_PHONE.height);
  const transcriptGap = () => page.evaluate(() => {
    const node = [...document.querySelectorAll('div')].find(el => el.clientHeight > 0 && el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto');
    return node ? node.scrollHeight - node.clientHeight - node.scrollTop : 0;
  });
  await page.waitForTimeout(CHUNK_MS * 3);
  assert.ok(await transcriptGap() > TOUCH_PX, 'Reading older messages must pause following');
  await page.setViewportSize({ width: PHONE.width, height: SMALL_PHONE.height });
  await page.waitForTimeout(CHUNK_MS * 3);
  assert.ok(await transcriptGap() > TOUCH_PX, 'Remeasuring rows must not jump away from older messages');
  await page.setViewportSize(SMALL_PHONE);
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('div')].find(el => el.clientHeight > 0 && el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto');
    if (node) node.scrollTop = node.scrollHeight;
  });
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Chief unsent fixture');
  await button('Choose teammate').click(); await button(LONG_MATE).click();
  assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), '');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Research unsent fixture');
  await shot('15-long-name-small-phone');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await button('Choose teammate').click(); await button('Chief').click();
  assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), 'Chief unsent fixture');
  await button('Choose teammate').click(); await button(LONG_MATE).click();
  assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), 'Research unsent fixture');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goTo('Settings');
  await button('Back').click();
  assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), 'Research unsent fixture');
  const inputOutline = await page.getByRole('textbox', { name: 'Message', exact: true }).evaluate(el => { el.focus(); const style = getComputedStyle(el); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseFloat) }; });
  assert.ok(inputOutline.style === 'none' || (inputOutline.style === 'solid' && inputOutline.width === 0), `Visible input outline: ${JSON.stringify(inputOutline)}`);
  assert.ok(inputOutline.borders.every(width => width === 0), `Visible input border: ${JSON.stringify(inputOutline)}`);
  console.log(`MOBILE_PHONE_LAYOUT_OK: 320/390/1280 widths, large text, long names/code, 240-message transcript (${mountedReplies} mounted replies), reading older messages without jumps, isolated teammate drafts, borderless inputs and reduced motion`);
  const expected429 = errors.filter(message => message === 'Failed to load resource: the server responded with a status of 429 (Too Many Requests)');
  assert.equal(expected429.length, 2, 'Exactly the two intentional rate/quota fixtures may produce HTTP console failures');
  const unexpected = errors.filter(message => !expected429.includes(message));
  assert.equal(unexpected.length, 0, unexpected.join('\n')); assert.equal(cancelled, true);
  console.log(`MOBILE_UI_OK: separate workspace navigation and history -> starter without send -> draft retention -> onboarding -> CORS-less provider discovery -> selected model native tool test and edit cancellation -> cached model picker without refetch -> teammate create/edit/switch -> personal and teammate system prompts -> Composio fixture catalog/account/tool execution/model continuation/key removal -> streamed chat -> Stop -> appearance -> profile -> About -> conversation library -> reload with key retained -> fresh tab reuses the durable browser key -> clear; ${received.length} real HTTP generation requests; zero unexpected console errors or animation/pointer warnings; two intentional HTTP 429 failures; phone/narrow/desktop screenshots`);
} catch (error) {
  // Capture only fixture UI/scroll metadata, never provider keys or raw storage.
  await shot('verification-failure');
  console.error('MOBILE_UI_FAILURE_STATE', JSON.stringify(await page.evaluate(() => ({
    text: document.body.innerText.slice(-3000),
    saved: Object.values(localStorage).flatMap(value => { try { const state = JSON.parse(value); return Array.isArray(state.conversations) ? [{ activeTeammateId: state.activeTeammateId, messages: state.conversations.map(chat => chat.messages.length) }] : []; } catch { return []; } }),
    scrolls: [...document.querySelectorAll('div')].filter(el => el.scrollHeight > el.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)).map(el => ({ height: el.clientHeight, content: el.scrollHeight, top: el.scrollTop })),
  }))));
  throw error;
} finally { await browser.close(); for (const server of [web, upstream]) { server.closeAllConnections(); server.close(); } }
