import TRANSPORT from './transport.json' with { type: 'json' };
// Single source of truth for runtime config.
// Units in comments. Values come from env / Expo extra so no OS, host, or port is assumed.
// NOTE: app.json (Expo-owned) duplicates name/slug/version for store builds — keep in sync manually.
export const APP_NAME = 'Ankita';

export const APP_SLUG = 'chief-mobile';

// Semantic version of the mobile client (unit: semver string). Why constant: shown in Settings + sent as header.
export const APP_VERSION = '2.1.1';

// Deep-link scheme (unit: URI scheme, no ://). Why constant: used in navigation + auth callbacks.
export const DEEP_LINK_SCHEME = 'chief';

// Backend base URL resolution: env first, then local dev fallback. Never hardcode LAN IPs in screens.
function resolveBackendBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_CHIEF_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return ''; // No guessed localhost: a phone must use an explicitly configured endpoint.
}

export const BACKEND_BASE_URL = resolveBackendBaseUrl();

// Network timeout (unit: milliseconds). Why 15000: mobile networks stall; avoids hanging chat.
export const NETWORK_TIMEOUT_MS = TRANSPORT.requestTimeoutMs; // Milliseconds: total generation deadline; Stop aborts immediately.

// Default API path prefix (unit: URL path). Why constant: every endpoint builds from here.
export const API_PREFIX = '/api';

export const STORAGE_KEY = 'chief.mobile.state.v1'; // Versioned metadata/history only; never API keys.
export const SECRET_PREFIX = 'chief.provider.'; // Native keychain namespace for per-provider keys.
export const BROWSER_KEY_NOTICE = 'Browser keys are kept in this browser so they survive a restart. Any script on this site can read them, and other people using this browser profile can too. Remove a key when finished.'; // Shared browser storage explanation for every credential screen.
export const DATA_VERSION = 1; // Saved state schema, independent of release version.
export const MAX_RESPONSE_CHARS = 200_000; // Characters: bound model output and SSE buffers on mobile.
export const MAX_PROVIDER_RESPONSE_BYTES = 1_048_576; // Bytes: bound JSON envelopes before parsing provider data.
export const MAX_CONTEXT_MESSAGES = 60; // Messages per request; full transcript remains on device.
export const MODEL_TEST_TIMEOUT_MS = 15_000; // Milliseconds: model discovery/connection probe deadline.
export const MAX_TOKENS = 4096; // Anthropic requires an explicit generation output token ceiling.
export const ANTHROPIC_VERSION = '2023-06-01'; // Anthropic Messages API protocol version.
const ASSISTANT_GUIDANCE = 'Be clear, honest and useful. Do not claim to have performed actions or accessed apps unless an available tool actually did so.';
export const DEFAULT_SYSTEM_PROMPT = `You are a thoughtful and practical personal assistant. ${ASSISTANT_GUIDANCE}`;
export const LEGACY_DEFAULT_SYSTEM_PROMPT = `You are Chief, a thoughtful and practical personal assistant. ${ASSISTANT_GUIDANCE}`; // Exact former default for saved-state migration; custom instructions stay intact.
export const EXPORT_MIME = 'text/plain'; // Shared conversation export format.
export const EXPORT_FILENAME = `${APP_NAME.toLowerCase()}-conversations.txt`; // User-facing export name, independent of the legacy storage/app identity.
