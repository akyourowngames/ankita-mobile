import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pairDesktop, selfRevokeDesktop, checkDesktop } from '../src/assistant/desktopPairing.ts';
import { desktopOrigin, formatPairingCode, isLoopbackAddress, normalizePairingCode, parsePairingLink, FINGERPRINT_PATTERN } from '../src/assistant/pairingProtocol.ts';
import { emptyAssistantState, restoreAssistantState } from '../src/assistant/records.ts';

// Test-only fixture endpoint and identity; production pairing only uses LAN discovery.
const FINGERPRINT = `${'AB:'.repeat(31)}CD`;
const ADDRESS = `https://192.168.1.20:8443/v1/ankita-companion`;
const desktopRoot = process.env.ANKITA_DESKTOP_REPO || path.resolve('..', 'copilot-chat');
const { PhonePairing } = await import(pathToFileURL(path.join(desktopRoot, 'desktop/electron/phone-pairing.mjs')).href);
const { INVITATION_TTL_MS } = await import(pathToFileURL(path.join(desktopRoot, 'desktop/shared/phone-pairing.mjs')).href);

function code(platform = 'android', profile = '') {
  const kind = platform === 'ios' ? 'iPhone or iPad' : 'Android phone';
  return (profile ? `${profile}’s ${kind}` : kind);
}

/** Node-side stand-in for the phone's OS trust store: verify the generated CA explicitly. */
function transport(ca) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? Buffer.from(String(init.body)) : null;
    return await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`,
        method: init.method || 'GET', headers: init.headers, ca, rejectUnauthorized: true,
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode || 500, headers: response.headers })));
      });
      request.on('error', reject);
      if (init.signal) {
        if (init.signal.aborted) request.destroy(new Error('cancelled'));
        else init.signal.addEventListener('abort', () => request.destroy(new Error('cancelled')), { once: true });
      }
      if (body) request.write(body);
      request.end();
    });
  };
}

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ankita-phone-pair-'));
  let now = Date.now(), requestResolve;
  const requested = new Promise(resolve => { requestResolve = resolve; });
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async value => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptStringAsync: async bytes => ({ result: Buffer.from(bytes).toString('utf8').replace(/^encrypted:/, '') }),
    getSelectedStorageBackend: () => 'fixture',
  };
  const engine = {
    listTeammates: () => [{ id: 'chief', name: 'Ankita' }],
    init: async () => {},
    onEvent: () => () => {},
    send: async () => ({ turnId: 'fixture-turn' }),
    waitForTurn: async () => 'fixture reply',
    cancel: () => {},
    respondApproval: () => true,
    turns: new Map(), turnIds: new Map(), approvals: { pending: new Map() },
    secretHistory: { clean: value => String(value ?? '') },
  };
  const pairing = new PhonePairing({
    configFile: path.join(directory, 'pairing.json'), devicesFile: path.join(directory, 'devices.json'),
    safeStorage, engine, addresses: ['127.0.0.1'], hostname: 'fixture-host', now: () => now, platform: 'win32',
    emit: event => { if (event.type === 'phone-pairing-request') requestResolve(event); },
  });
  await pairing.start();
  if (pairing.state !== 'ready') throw new Error(`Fixture pairing service did not start: ${pairing.error}`);
  return {
    pairing, requested,
    advance: ms => { now += ms; },
    close: async () => { await pairing.close(); await fs.rm(directory, { recursive: true, force: true }); },
  };
}

test('pairing links and codes are strict, reusable helpers stay in sync with the desktop', () => {
  assert.equal(normalizePairingCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizePairingCode('ABCD-EFGI'), '', 'I is not in the unambiguous alphabet');
  assert.equal(normalizePairingCode('short'), '');
  assert.equal(formatPairingCode('abcdefgh'), 'ABCD-EFGH');
  assert.equal(desktopOrigin(ADDRESS), 'https://192.168.1.20:8443');
  assert.equal(desktopOrigin('https://192.168.1.20:8443'), 'https://192.168.1.20:8443');
  assert.throws(() => desktopOrigin('http://192.168.1.20:8443'), /HTTPS/);
  assert.equal(isLoopbackAddress('https://127.0.0.1:8443'), true);
  assert.equal(isLoopbackAddress('https://192.168.1.20:8443'), false);
  assert.match(FINGERPRINT, FINGERPRINT_PATTERN);

  const link = parsePairingLink(`chief://pair?u=${encodeURIComponent(ADDRESS)}&c=abcd-efgh&f=${encodeURIComponent(FINGERPRINT)}&n=Studio`);
  assert.deepEqual(link, { address: ADDRESS, origin: 'https://192.168.1.20:8443', code: 'ABCDEFGH', fingerprint: FINGERPRINT, name: 'Studio' });
  assert.equal(parsePairingLink(`chief://pair?u=${encodeURIComponent(ADDRESS.replace('192.168.1.20', '127.0.0.1'))}&c=ABCDEFGH&f=${encodeURIComponent(FINGERPRINT)}`), null);
  assert.equal(parsePairingLink(`chief://pair?u=${encodeURIComponent(ADDRESS)}&c=ABCDEFGH`), null);
  assert.equal(parsePairingLink(ADDRESS), null);
  assert.equal(code('ios', 'Ava'), 'Ava’s iPhone or iPad');
});

test('paired desktop metadata restores only when every optional field is well formed', () => {
  const valid = { enabled: true, baseUrl: 'https://192.168.1.20:8443', name: 'Studio', deviceId: 'device-fixture', deviceName: 'Ava’s Android phone', teammateName: 'Ankita', fingerprint: FINGERPRINT, pairedAt: 1_000_000 };
  const restored = restoreAssistantState(JSON.parse(JSON.stringify({ ...emptyAssistantState(), desktop: valid })));
  assert.deepEqual(restored.desktop, valid);
  for (const desktop of [
    { enabled: true, baseUrl: '', name: 5 },
    { enabled: true, baseUrl: '', fingerprint: 'not-a-fingerprint' },
    { enabled: true, baseUrl: '', pairedAt: -1 },
    { enabled: true, baseUrl: '', unexpected: true },
  ]) assert.throws(() => restoreAssistantState({ ...emptyAssistantState(), desktop }));
});

test('a real invitation round trip rejects a wrong code, claims a per-phone key and revokes it', async () => {
  const f = await fixture();
  try {
    const invite = await f.pairing.createInvitation();
    const client = transport(f.pairing.certificate().pem);
    const options = { address: invite.address, fingerprint: invite.fingerprint, deviceName: 'Fixture phone', platform: 'android', signal: new AbortController().signal, transport: client };
    await assert.rejects(pairDesktop({ ...options, code: 'ZZZZ-ZZZZ' }), error => error.failure === 'code');

    const pairing = pairDesktop({ ...options, code: invite.code });
    const request = await f.requested;
    assert.equal(request.deviceName, 'Fixture phone');
    await f.pairing.respondPairing(request.requestId, true, 'chief');
    const paired = await pairing;
    assert.equal(paired.baseUrl, `https://127.0.0.1:${f.pairing.port}`);
    assert.equal(paired.metadata.name, 'fixture-host');
    assert.equal(paired.metadata.teammateName, 'Ankita');
    assert.equal(paired.metadata.fingerprint, invite.fingerprint);
    assert.equal(paired.metadata.deviceId, f.pairing.snapshot().devices[0].id);
    assert.match(paired.token, /^[A-Za-z0-9_-]{43}$/);

    const capabilities = await checkDesktop({ enabled: true, baseUrl: paired.baseUrl }, paired.token, client, new AbortController().signal);
    assert.equal(capabilities.fingerprint, invite.fingerprint);
    assert.equal(capabilities.computer, 'fixture-host');
    assert.equal(f.pairing.snapshot().devices.length, 1);

    await selfRevokeDesktop(paired.baseUrl, paired.token, client, new AbortController().signal);
    await selfRevokeDesktop(paired.baseUrl, paired.token, client, new AbortController().signal);
    assert.equal(f.pairing.snapshot().devices.length, 0);
  } finally { await f.close(); }
});

test('rejecting the request ends the phone wait without a key', async () => {
  const f = await fixture();
  try {
    const invite = await f.pairing.createInvitation();
    const client = transport(f.pairing.certificate().pem);
    const pairing = pairDesktop({ address: invite.address, code: invite.code, fingerprint: invite.fingerprint, deviceName: 'Fixture phone', platform: 'android', signal: new AbortController().signal, transport: client });
    const request = await f.requested;
    await f.pairing.respondPairing(request.requestId, false);
    await assert.rejects(pairing, error => error.failure === 'rejected' && !error.message.includes(invite.code));
    assert.equal(f.pairing.snapshot().devices.length, 0);
  } finally { await f.close(); }
});

test('an expired invitation cannot be claimed and never exposes the code in the error', async () => {
  const f = await fixture();
  try {
    const invite = await f.pairing.createInvitation();
    f.advance(INVITATION_TTL_MS + 1);
    await assert.rejects(pairDesktop({ address: invite.address, code: invite.code, fingerprint: invite.fingerprint, deviceName: 'Fixture phone', platform: 'android', signal: new AbortController().signal, transport: transport(f.pairing.certificate().pem) }), error => error.failure === 'expired' && !error.message.includes(invite.code));
  } finally { await f.close(); }
});
