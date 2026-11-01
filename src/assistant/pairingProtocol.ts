import config from '../constants/companion.json' with { type: 'json' };
import policy from './companionPolicy.cjs';

// Mirrors desktop/shared/phone-pairing.mjs. Both apps ship together, so the
// protocol version and code alphabet stay pinned rather than negotiated.
export const PAIRING_PROTOCOL_VERSION = 1;
export const PAIRING_LINK_SCHEME = 'chief';
export const PAIRING_LINK_HOST = 'pair';
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0/1/I/L/O.
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_DEVICE_NAME_CHARS = 64; // Desktop limit for the name shown in its approval list.
export const PAIRING_PLATFORM_CHARS = 32; // Desktop limit for the reported platform label.
const PAIRING_CODE_GROUP = 4;
export const FINGERPRINT_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export type ParsedPairingLink = { address: string; origin: string; code: string; fingerprint: string; name: string };

export function normalizePairingCode(value: unknown): string {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
  if (raw.length !== PAIRING_CODE_LENGTH) return '';
  for (const character of raw) if (!PAIRING_CODE_ALPHABET.includes(character)) return '';
  return raw;
}

export function formatPairingCode(value: unknown): string {
  const raw = normalizePairingCode(value);
  return raw ? `${raw.slice(0, PAIRING_CODE_GROUP)}-${raw.slice(PAIRING_CODE_GROUP)}` : '';
}

/** Accepts an origin or the full companion address shown on the desktop. */
export function desktopOrigin(value: unknown): string {
  let parsed: URL;
  try { parsed = new URL(String(value || '').trim()); } catch { throw new Error(policy.URL_ERROR); }
  const url = parsed.pathname === config.rootPath || parsed.pathname === `${config.rootPath}/` ? new URL(parsed.origin) : parsed;
  policy.companionURL(url.href);
  return url.origin;
}

/** A phone cannot reach the computer's own loopback address. */
export function isLoopbackAddress(value: unknown): boolean {
  try { return LOOPBACK_HOSTS.includes(new URL(String(value)).hostname.toLowerCase()); } catch { return false; }
}

/** Reads a `chief://pair?...` link produced by the desktop QR code. */
export function parsePairingLink(value: unknown): ParsedPairingLink | null {
  let url: URL;
  try { url = new URL(String(value || '').trim()); } catch { return null; }
  if (url.protocol !== `${PAIRING_LINK_SCHEME}:` || url.hostname !== PAIRING_LINK_HOST) return null;
  const address = url.searchParams.get('u') || '';
  const code = normalizePairingCode(url.searchParams.get('c') || '');
  const fingerprint = (url.searchParams.get('f') || '').toUpperCase();
  let target: URL;
  try { target = new URL(address); } catch { return null; }
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) return null;
  if (LOOPBACK_HOSTS.includes(target.hostname.toLowerCase())) return null;
  if (target.pathname.replace(/\/+$/, '') !== config.rootPath) return null;
  if (!code || !FINGERPRINT_PATTERN.test(fingerprint)) return null;
  return { address: `${target.origin}${config.rootPath}`, origin: target.origin, code, fingerprint, name: (url.searchParams.get('n') || '').slice(0, 80) };
}
