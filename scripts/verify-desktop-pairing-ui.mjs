import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createWebServer } from './serve-web.mjs';

// Browser fixtures only: an isolated browser profile, documentation-range address and fake key.
const PHONE = { width: 390, height: 844 }; // iPhone-sized CSS viewport fixture.
const SMALL_PHONE = { width: 320, height: 640 }; // Narrow layout regression fixture.
const TIMEOUT_MS = 20_000; // Milliseconds: local UI assertion deadline.
const TOUCH_PX = 44; // CSS pixels: minimum comfortable tap height.
const STORAGE_KEY = 'chief.mobile.state.v1'; // Mirrors src/constants/appConfig.ts; seeded browser metadata only.
const TAB_SECRET_PREFIX = 'chief.tab-secret.'; // Mirrors src/storage/tabKeys.ts.
const DESKTOP_KEY = 'assistant.desktop'; // Mirrors ASSISTANT_SECRET_IDS.desktop.
const FIXTURE_TOKEN = 'fixture-phone-key-never-used-over-the-network';
const FINGERPRINT = `${'AB:'.repeat(31)}CD`;
const DESKTOP_ORIGIN = 'https://192.168.1.20:8443';
const COMPANION_ADDRESS = `${DESKTOP_ORIGIN}/v1/ankita-companion`;
const artifactDir = process.env.ANKITA_PAIRING_UI_ARTIFACT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'ankita-pairing-mobile-ui-'));

const web = createWebServer();
await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: PHONE });
const page = await context.newPage();
page.setDefaultTimeout(TIMEOUT_MS);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const button = name => page.getByRole('button', { name, exact: true });
const shot = async name => { await fs.mkdir(artifactDir, { recursive: true }); await page.screenshot({ path: path.join(artifactDir, `${name}.png`) }); };
const openSettings = async () => {
  if (await button('Conversations').count()) await button('Conversations').click();
  await button('Settings').click();
  await button('Close sidebar').waitFor({ state: 'hidden' });
};
const openDesktop = async () => { await openSettings(); await page.getByRole('button', { name: /^Desktop computer/ }).click(); await page.getByText('Desktop connection', { exact: true }).first().waitFor(); };
try {
  await page.goto(`http://127.0.0.1:${web.address().port}/`);
  await button('Get started').waitFor();
  await button('Get started').click();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Verification');
  await button('Continue').click();
  await button('Set up my provider').click();
  await button('Add Custom provider').click();
  await page.getByRole('textbox', { name: 'Provider name', exact: true }).fill('Fixture provider');
  await page.getByRole('textbox', { name: 'API base URL', exact: true }).fill('https://provider.invalid/v1');
  const keySwitch = page.getByRole('switch', { name: 'API key required' });
  if (await keySwitch.isChecked()) await keySwitch.click();
  await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill('fixture-model');
  await button('Save provider').click();
  await button('Start chatting').waitFor();
  await button('Start chatting').click();
  await openDesktop();

  await button('Scan code from computer').waitFor();
  await button('Paste pairing link').waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Computer address' }).count(), 1);
  const pairingCode = page.getByRole('textbox', { name: 'Pairing code' });
  assert.equal(await pairingCode.getAttribute('placeholder'), 'ABCD-EFGH');
  assert.equal(await button('Send pairing request').isDisabled(), true, 'An empty code cannot be sent');
  await page.getByRole('textbox', { name: 'Computer address' }).fill(COMPANION_ADDRESS.replace('192.168.1.20', '127.0.0.1'));
  await pairingCode.fill('ABCD-EFGH');
  await button('Send pairing request').click();
  await page.getByText('A phone cannot reach 127.0.0.1. Use the Wi-Fi address shown on the computer.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Computer address' }).fill(COMPANION_ADDRESS.replace('https:', 'http:'));
  await button('Send pairing request').click();
  await page.getByText('Enter the HTTPS address shown on your computer, including the port.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Computer address' }).fill(COMPANION_ADDRESS);
  assert.equal(await page.getByText(/This phone no longer has its pairing key/i).count(), 0);
  await shot('01-pairing-390');
  console.log('MOBILE_PAIRING_VIEW_OK: scan/paste/manual paths, loopback and plain-HTTP rejection, no automatic connection');

  // Seed the metadata and tab-scoped key that a successful native pairing would persist.
  // The init script runs after the previous page's unload save and before the app boots.
  await page.addInitScript(({ storageKey, prefix, desktopKey, token, origin, fingerprint }) => {
    const state = JSON.parse(localStorage.getItem(storageKey));
    state.assistant.desktop = { enabled: true, baseUrl: origin, name: 'Studio desktop', deviceId: 'fixture-device', deviceName: 'Verification’s Android phone', teammateName: 'Ankita', fingerprint, pairedAt: Date.now() };
    localStorage.setItem(storageKey, JSON.stringify(state));
    localStorage.setItem(prefix + desktopKey, token);
  }, { storageKey: STORAGE_KEY, prefix: TAB_SECRET_PREFIX, desktopKey: DESKTOP_KEY, token: FIXTURE_TOKEN, origin: DESKTOP_ORIGIN, fingerprint: FINGERPRINT });
  await page.reload();
  await button('Get started').waitFor({ state: 'hidden' }).catch(() => {});
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  await openDesktop();
  await page.getByText('Studio desktop', { exact: true }).first().waitFor();
  await page.getByText('Ankita', { exact: true }).first().waitFor();
  await page.getByText(DESKTOP_ORIGIN, { exact: true }).first().waitFor();
  await page.getByText(FINGERPRINT, { exact: true }).first().waitFor();
  await page.getByText('Not reachable', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('switch', { name: 'Use desktop tools' }).isChecked(), true);
  await page.getByRole('switch', { name: 'Use desktop tools' }).click();
  await page.getByText('Paired, but desktop tools are switched off', { exact: true }).waitFor();
  await page.getByRole('switch', { name: 'Use desktop tools' }).click();
  await page.getByText('Chat can delegate work to this computer', { exact: true }).waitFor();
  await shot('02-connected-390');
  await button('Disconnect this phone').click();
  await page.getByText('This removes this phone’s key from Studio desktop immediately.', { exact: false }).waitFor();
  await button('Keep connection').click();
  await button('Disconnect this phone').waitFor();
  await button('Disconnect this phone').click();
  await button('Disconnect phone').click();
  await page.getByText('Disconnected on this phone. The computer could not be reached; remove this phone there if it still appears.', { exact: true }).waitFor();
  await button('Scan code from computer').waitFor();
  assert.equal(await page.evaluate(({ storageKey, prefix, desktopKey }) => JSON.parse(localStorage.getItem(storageKey)).assistant.desktop.baseUrl === '' && !localStorage.getItem(prefix + desktopKey), { storageKey: STORAGE_KEY, prefix: TAB_SECRET_PREFIX, desktopKey: DESKTOP_KEY }), true, 'Local disconnect clears metadata and the stored key even when the desktop is unreachable');
  console.log('MOBILE_CONNECTED_VIEW_OK: restored metadata, reachability, tools toggle, keep/disconnect confirmation and offline-safe local removal');

  await page.setViewportSize(SMALL_PHONE);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('textbox', { name: 'Computer address' }).fill(COMPANION_ADDRESS);
  await pairingCode.fill('ABCD-EFGH');
  const geometry = await page.evaluate(() => {
    const send = [...document.querySelectorAll('[role=button]')].find(item => item.textContent?.trim() === 'Send pairing request') || null;
    return { overflow: document.documentElement.scrollWidth > innerWidth, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, sendBottom: send ? send.getBoundingClientRect().right : null, sendHeight: send ? send.getBoundingClientRect().height : null };
  });
  assert.equal(geometry.overflow, false, `Narrow pairing screen fits the phone (${geometry.documentWidth}/${geometry.viewport})`);
  assert.ok(geometry.sendHeight >= TOUCH_PX, `Send pairing request is a comfortable tap target (${geometry.sendHeight}px)`);
  assert.ok(geometry.sendBottom <= SMALL_PHONE.width, 'Send pairing request stays inside the narrow viewport');
  await shot('03-pairing-320');
  console.log('MOBILE_NARROW_LAYOUT_OK: no horizontal overflow and bounded tap target at 320×640');

  assert.deepEqual(pageErrors, []);
  console.log(`MOBILE_PAIRING_UI_OK: artifacts=${artifactDir}`);
} finally {
  await browser.close();
  await new Promise(resolve => web.close(resolve));
  if (!process.argv.includes('--keep-artifacts')) {
    assert.equal(path.dirname(await fs.realpath(artifactDir)), await fs.realpath(os.tmpdir()), 'Cleanup stays inside the temporary directory');
    await fs.rm(artifactDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
