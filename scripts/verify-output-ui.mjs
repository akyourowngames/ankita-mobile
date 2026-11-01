import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';
import { initialState, restoreState } from '../src/core/state.ts';
import { createOutput } from '../src/assistant/outputs.ts';
import { STORAGE_KEY } from '../src/constants/appConfig.ts';

const state = initialState(), now = Date.now(); state.onboardingDone = true;
for (const input of [
  { id: 'document', title: 'Launch brief', kind: 'document', content: '# Friday launch\n\nA clear **plan** for the team.' },
  { id: 'table', title: 'Launch budget', kind: 'table', content: JSON.stringify({ columns: ['Item', 'Amount'], rows: [['Hosting', '12']] }) },
  { id: 'checklist', title: 'Launch checklist', kind: 'checklist', content: JSON.stringify({ items: [{ text: 'Draft copy', checked: false }, { text: 'Review', checked: false }] }) },
  { id: 'calendar', title: 'Launch calendar', kind: 'calendar', content: JSON.stringify({ events: [{ title: 'Launch review', start: '2026-10-27T09:00:00Z', end: '2026-10-27T10:00:00Z' }] }) },
  { id: 'json', title: 'Launch data', kind: 'json', content: '{"ready":false}' },
]) state.assistant.artifacts = createOutput(state.assistant.artifacts, input, { id: () => input.id, now: () => now }).artifacts;
restoreState(JSON.stringify(state));
const web = createWebServer(); await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(15000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(({ key, state }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state });
const button = name => page.getByRole('button', { name, exact: true }), field = name => page.getByRole('textbox', { name, exact: true });
const saved = id => page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)).assistant.artifacts.find(item => item.id === id), { key: STORAGE_KEY, id });
const download = async () => { const pending = page.waitForEvent('download'); await button('Download file').click(); const file = await pending; return { name: file.suggestedFilename(), content: await fs.readFile(await file.path(), 'utf8') }; };
const shots = new URL('../release/clean-outputs/', import.meta.url); await fs.mkdir(shots, { recursive: true });
const shot = async name => page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, shots)) });
try {
  await page.goto(`http://127.0.0.1:${web.address().port}`); await button('Conversations').click(); await button('Settings').click(); await button('Close sidebar').waitFor({ state: 'hidden' }); await button('Finished outputs').click();
  await button('Preview Launch brief').click(); await page.getByText(/^Friday launch\s/).waitFor();
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'));
  const close = await button('Close output').boundingBox(), edit = await button('Edit output').boundingBox(); await shot('initial-preview'); assert.ok(close.y < 70 && edit.y > 600, `preview uses the full phone screen: ${JSON.stringify({ close, edit })}`);
  await button('Edit output').click(); await field('Output text').fill('# Unsaved draft');
  // Simulate external navigation while a native notification/deep link owns routing.
  // The actual underlying screen unmounts; the preview and draft must remain alive.
  await page.getByRole('button', { name: 'Back', exact: true, includeHidden: true }).evaluate(node => node.click());
  assert.equal(await field('Output text').inputValue(), '# Unsaved draft', 'external navigation preserves the open editor');
  await page.keyboard.press('Escape'); await button('Discard changes').waitFor(); await button('Keep editing').click(); assert.equal(await field('Output text').inputValue(), '# Unsaved draft');
  await button('Cancel editing').click(); await button('Discard changes').click(); await page.getByText(/^Friday launch\s/).waitFor(); assert.match((await saved('document')).content, /Friday launch/);
  await button('Edit output').click(); await field('Output title').fill(''); await button('Save output changes').click(); await page.getByRole('alert').filter({ hasText: /title/i }).waitFor(); assert.equal(await field('Output title').inputValue(), ''); await field('Output title').fill('Launch brief'); await field('Output text').fill('# Final launch\n\nReady to share.'); await button('Save output changes').click(); await page.getByText(/^Final launch\s/).waitFor(); await shot('document-preview'); await button('Close output').click(); await button('Finished outputs').click();
  await button('Preview Launch budget').click(); await button('Edit output').click(); assert.equal(await field('Output data (JSON)').count(), 0); await field('Row 1, column 1').fill('Edited hosting'); await field('Row 1, column 2').fill('15'); await button('Add column').click(); await field('Column 3 heading').fill('Owner'); await field('Row 1, column 3').fill('Krish'); await button('Add row').click(); await field('Row 2, column 1').fill('Domain'); await field('Row 2, column 2').fill('8'); await field('Row 2, column 3').fill('Team'); await shot('table-editor'); await button('Save output changes').click();
  await button('Save / Share').click(); await button('Export as CSV').click(); const csv = await download(); assert.match(csv.name, /\.csv$/); assert.match(csv.content, /"Edited hosting","15","Krish"/); assert.match(csv.content, /"Domain","8","Team"/); await button('Close output').click();
  await button('Preview Launch checklist').click(); await page.getByRole('checkbox', { name: 'Draft copy', exact: true }).click(); await page.waitForFunction(key => JSON.parse(JSON.parse(localStorage.getItem(key)).assistant.artifacts.find(item => item.id === 'checklist').content).items[0].checked, STORAGE_KEY);
  await button('Edit output').click(); await field('Item 1').fill('Write launch copy'); await button('Add item').click(); await field('Item 3').fill('Publish launch'); await button('Remove item 2').click(); await button('Save output changes').click(); await page.getByRole('checkbox', { name: 'Write launch copy', exact: true }).waitFor(); assert.deepEqual(JSON.parse((await saved('checklist')).content).items.map(item => item.text), ['Write launch copy', 'Publish launch']); await shot('checklist-preview'); await button('Close output').click();
  await button('Preview Launch calendar').click(); await button('Edit output').click(); await field('Event 1 title').fill('Team launch review'); await page.getByLabel('Event 1 start', { exact: true }).fill('2026-10-28T09:30'); await page.getByLabel('Event 1 end (optional)', { exact: true }).fill('2026-10-28T10:30'); await field('Event 1 location').fill('Home office'); await button('Save output changes').click(); await button('Save / Share').click(); await button('Export as ICS').click(); const ics = await download(); assert.match(ics.content, /BEGIN:VEVENT/); assert.match(ics.content, /SUMMARY:Team launch review/); assert.match(ics.content, /LOCATION:Home office/); await button('Close output').click();
  await button('Preview Launch data').click(); await button('Edit output').click(); await field('JSON content').fill('{broken'); await button('Save output changes').click(); await page.getByRole('alert').filter({ hasText: /valid JSON/i }).waitFor(); assert.equal((await saved('json')).content, '{"ready":false}'); await field('JSON content').fill('{"ready":true}'); await button('Save output changes').click(); await button('Output options').click(); await button('Delete output').click(); await button('Delete output permanently').click(); await button('Preview Launch data').waitFor({ state: 'hidden' });
  for (const width of [320, 390, 768, 1024]) { await page.setViewportSize({ width, height: 844 }); await button('Preview Launch budget').click(); await button('Edit output').click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no output page overflow at ${width}`); const save = await button('Save output changes').boundingBox(); assert.ok(save.x >= 0 && save.x + save.width <= width && save.y + save.height <= 844); await shot(`table-${width}`); await button('Cancel editing').click(); await button('Close output').click(); }
  assert.deepEqual(errors, []); console.log('OUTPUT_UI_OK: fullscreen Markdown/table/checklist/calendar/JSON; ordinary structured fields; guarded Escape/discard; failed-save draft retention; actual edited CSV/ICS downloaded and read back; checklist persistence; confirmed delete; 320/390/768/1024 layouts; zero page errors.');
} catch (error) { console.log('OUTPUT_UI_FAILURE', error.message, await page.locator('body').innerText()); throw error; }
finally { await browser.close(); web.closeAllConnections(); await new Promise(resolve => web.close(resolve)); }
