import config from '../constants/companion.json' with { type: 'json' };
import { abortable } from '../api/abortable.ts';
import { readJSON } from '../api/readJSON.ts';
import { companionURL, discoverDesktop, type DesktopCapabilities } from './desktop.ts';
import { desktopOrigin, normalizePairingCode, PAIRING_DEVICE_NAME_CHARS, PAIRING_PLATFORM_CHARS } from './pairingProtocol.ts';
import { ToolFault } from './schema.ts';

export type PairingFailure = 'code' | 'expired' | 'rejected' | 'lost' | 'busy' | 'unreachable' | 'untrusted' | 'mismatch' | 'cancelled' | 'protocol';
export type PairingStage = 'contacting' | 'waiting' | 'verifying';

// Fixed user-facing copy: a network error must never leak a URL, header or token.
const FAILURE_TEXT: Record<PairingFailure, string> = {
  code: 'That code did not match. Check the code on your computer and try again.',
  expired: 'This pairing code expired. Create a new code on your computer.',
  rejected: 'The computer rejected this pairing request.',
  lost: 'The computer finished pairing, but this phone did not receive its key. Remove the unneeded phone on the computer, then pair again.',
  busy: 'The computer is already handling another pairing request. Finish that one, then try again.',
  unreachable: 'Could not reach the computer. Check that both devices are on the same Wi-Fi and that the address is correct.',
  untrusted: 'This phone does not trust the computer’s certificate yet. In the computer’s Settings, save the certificate and install it as a trusted certificate, then try again.',
  mismatch: 'This is not the computer shown in the code. Pairing was stopped for your safety.',
  cancelled: 'Pairing stopped.',
  protocol: 'The computer sent an unexpected response. Update both apps and try again.',
};
export class PairingError extends Error {
  readonly failure: PairingFailure;
  constructor(failure: PairingFailure) { super(FAILURE_TEXT[failure]); this.name = 'PairingError'; this.failure = failure; }
}

export type PairedDesktop = {
  baseUrl: string;
  token: string;
  metadata: { name: string; deviceId: string; deviceName: string; teammateName: string; fingerprint: string; pairedAt: number };
};
export type PairingOptions = {
  address: string; code: string; fingerprint?: string; deviceName: string; platform: string;
  signal: AbortSignal; transport: typeof fetch; onStage?: (stage: PairingStage) => void;
};
type Json = { status: number; data: any };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url without padding.
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_ID = /^[0-9a-f-]{36}$/;
const TRUST_ERROR = /certificate|ssl|tls|handshake|trust|unable to verify|self.signed/i;

function failureFor(status: number, phase: 'start' | 'claim'): PairingFailure {
  if (status === 403) return 'code';
  if (status === 409) return 'busy';
  if (status === 410 || status === 401 || status === 404) return 'expired';
  return phase === 'start' ? 'protocol' : 'lost';
}

function classify(error: unknown, fallback: PairingFailure): PairingError {
  if (error instanceof PairingError) return error;
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (TRUST_ERROR.test(message)) return new PairingError('untrusted');
  if (error instanceof ToolFault && /HTTP 401/.test(message)) return new PairingError('expired');
  if (/invalid JSON|too large|unreadable|invalid run|version is incompatible/i.test(message)) return new PairingError('protocol');
  return new PairingError(fallback);
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return abortable(new Promise<void>(resolve => { timer = setTimeout(resolve, ms); }), signal)
    .finally(() => { if (timer) clearTimeout(timer); });
}

async function call(origin: string, path: string, options: { method: string; headers?: Record<string, string>; body?: unknown }, transport: typeof fetch, signal: AbortSignal): Promise<Json> {
  if (signal.aborted) throw new PairingError('cancelled');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, config.requestMs);
  let response: Response;
  try {
    response = await transport(`${companionURL(origin)}${path}`, {
      method: options.method,
      headers: { 'content-type': 'application/json', ...options.headers },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal, redirect: 'error', credentials: 'omit',
    });
  } catch (error) {
    if (signal.aborted) throw new PairingError('cancelled');
    throw classify(error, 'unreachable');
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  try {
    return { status: response.status, data: await readJSON(response, controller.signal, config.responseBytes, 'The computer') };
  } catch (error) {
    if (signal.aborted) throw new PairingError('cancelled');
    throw classify(error, 'protocol');
  }
}

/** Approves a short-lived invitation and claims the phone's own long-lived key. */
export async function pairDesktop(options: PairingOptions): Promise<PairedDesktop> {
  const { signal, onStage, transport } = options;
  const code = normalizePairingCode(options.code);
  if (!code) throw new PairingError('code');
  let origin: string;
  try { origin = desktopOrigin(options.address); } catch { throw new PairingError('unreachable'); }
  const expected = options.fingerprint ? options.fingerprint.toUpperCase() : '';

  onStage?.('contacting');
  const started = await call(origin, '/pair', {
    method: 'POST',
    body: { code, deviceName: options.deviceName.slice(0, PAIRING_DEVICE_NAME_CHARS), platform: options.platform.slice(0, PAIRING_PLATFORM_CHARS) },
  }, transport, signal);
  if (started.status !== 202) throw new PairingError(failureFor(started.status, 'start'));
  const requestId = started.data?.requestId;
  const secret = started.data?.secret;
  if (started.data?.status !== 'pending' || !REQUEST_ID.test(String(requestId || '')) || !SECRET_PATTERN.test(String(secret || ''))) throw new PairingError('protocol');

  onStage?.('waiting');
  const deadline = Date.now() + config.pairingMs;
  let token = '';
  let claimedDevice: { id: string; name: string } | undefined;
  while (!token) {
    if (signal.aborted) throw new PairingError('cancelled');
    if (Date.now() >= deadline) throw new PairingError('expired');
    const claim = await call(origin, `/pair/${requestId}`, { method: 'GET', headers: { 'x-pair-secret': secret } }, transport, signal);
    if (claim.status !== 200) throw new PairingError(failureFor(claim.status, 'claim'));
    const state = claim.data?.status;
    if (state === 'pending') {
      try { await pause(config.pairingPollMs, signal); } catch { throw new PairingError(signal.aborted ? 'cancelled' : 'unreachable'); }
      continue;
    }
    if (state === 'rejected') throw new PairingError('rejected');
    if (state === 'expired') throw new PairingError('expired');
    if (state !== 'claimed') throw new PairingError('protocol');
    if (!TOKEN_PATTERN.test(String(claim.data?.token || '')) || typeof claim.data?.device?.id !== 'string' || typeof claim.data?.device?.name !== 'string') throw new PairingError('lost');
    token = claim.data.token;
    claimedDevice = { id: claim.data.device.id, name: claim.data.device.name };
  }

  onStage?.('verifying');
  let capabilities: DesktopCapabilities;
  try {
    capabilities = await discoverDesktop({ enabled: true, baseUrl: origin }, token, transport, signal);
  } catch (error) {
    await selfRevokeDesktop(origin, token, transport, new AbortController().signal).catch(() => {});
    throw classify(error, 'unreachable');
  }
  const fingerprint = capabilities.fingerprint || '';
  const wrongComputer = !fingerprint || (expected && fingerprint.toUpperCase() !== expected) || capabilities.device?.id !== claimedDevice!.id;
  if (wrongComputer) {
    await selfRevokeDesktop(origin, token, transport, new AbortController().signal).catch(() => {});
    throw new PairingError(expected || fingerprint ? 'mismatch' : 'protocol');
  }
  return {
    baseUrl: origin,
    token,
    metadata: {
      name: capabilities.computer || capabilities.app?.name || 'Desktop',
      deviceId: claimedDevice!.id,
      deviceName: capabilities.device?.name || claimedDevice!.name,
      teammateName: capabilities.teammate?.name || 'Desktop teammate',
      fingerprint,
      pairedAt: Date.now(),
    },
  };
}

/** Best-effort remote removal. A missing key on the computer counts as already revoked. */
export async function selfRevokeDesktop(origin: string, token: string, transport: typeof fetch, signal: AbortSignal): Promise<void> {
  if (!token) return;
  const result = await call(origin, '/pair/revoke', { method: 'POST', headers: { authorization: `Bearer ${token}` } }, transport, signal);
  if (result.status === 200 || result.status === 401) return;
  throw new PairingError(result.status === 409 ? 'busy' : 'unreachable');
}

export function checkDesktop(connection: { enabled: boolean; baseUrl: string }, token: string, transport: typeof fetch, signal: AbortSignal): Promise<DesktopCapabilities> {
  return discoverDesktop(connection, token, transport, signal);
}

export function phoneDeviceName(profile: string, platform: string): string {
  const kind = platform === 'ios' ? 'iPhone or iPad' : platform === 'android' ? 'Android phone' : 'Phone';
  const name = profile.trim();
  return (name ? `${name}’s ${kind}` : kind).slice(0, PAIRING_DEVICE_NAME_CHARS);
}

export function pairingFailure(error: unknown): PairingFailure {
  return error instanceof PairingError ? error.failure : 'protocol';
}

export function pairingMessage(error: unknown): string {
  if (error instanceof PairingError) return error.message;
  if (error instanceof Error && error.message === 'The desktop connection needs the local Ankita web server.') return 'Pairing needs the Ankita desktop app. Open this screen inside the app on your phone.';
  return FAILURE_TEXT.protocol;
}
