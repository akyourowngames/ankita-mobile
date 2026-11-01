import { readJSON } from './readJSON.ts';

const ERROR_BYTES = 16_384; // Bytes: inspect only a bounded error envelope; never display remote text.
const MS_PER_SECOND = 1000; // Retry-After uses seconds or an HTTP date.
const MAX_RETRY_MS = 24 * 60 * 60 * MS_PER_SECOND; // Milliseconds: reject unbounded/malformed retry hints.
const MESSAGES = {
  rate_limit: 'The provider is rate-limiting this model. Wait before retrying, or choose another model. Your API key may still be valid.',
  quota: 'The provider reports exhausted credits or usage quota. Check your account balance or choose an eligible free model; repeating this request will not restore credits.',
  model_access: 'The provider requires account access or credits for this model. Choose an eligible model, or check your provider account.',
  authentication: 'The provider rejected authentication. Check that this is the gateway API key for the configured endpoint, then save it in provider settings.',
  client_restricted: 'The provider restricts this free model to its own client. Choose a model available through its API or use another provider.',
  vision_unsupported: 'This model has no available image/PDF route. Remove the attachment or choose a vision-capable model.',
  tools_unsupported: 'This model does not accept tool calls. Choose a tool-capable model for the phone assistant.',
  model_unavailable: 'This model is unavailable at the configured endpoint. Refresh the model list and test your selected model.',
  unavailable: 'The provider or its upstream model is unavailable. Retry later or choose another model.',
  generation: 'The provider could not generate a reply. Test the selected model in provider settings to check account access and compatibility.',
  missing_key: 'Add your API key in provider settings. Browser keys are kept in this browser; if storage is blocked, enter the key again after a restart.',
} as const;
export type ProviderErrorCode = keyof typeof MESSAGES;
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;
  constructor(code: ProviderErrorCode, status?: number, retryAfterMs?: number) {
    const prefix = status ? `Provider returned HTTP ${status}. ` : '';
    const wait = retryAfterMs ? ` Retry after ${Math.ceil(retryAfterMs / MS_PER_SECOND)} seconds.` : '';
    super(prefix + MESSAGES[code] + wait);
    this.name = 'ProviderError'; this.code = code; this.status = status; this.retryAfterMs = retryAfterMs;
  }
}
export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return;
  const seconds = Number(value), ms = Number.isFinite(seconds) ? seconds * MS_PER_SECOND : Date.parse(value) - now;
  return Number.isFinite(ms) && ms > 0 && ms <= MAX_RETRY_MS ? Math.ceil(ms) : undefined;
}
export function providerError(payload: unknown, status?: number, retryMs?: number): ProviderError {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const error = root.error && typeof root.error === 'object' ? root.error as Record<string, unknown> : root;
  const hint = [error.code, error.type, error.message, root.error_type, typeof root.error === 'string' ? root.error : ''].filter(value => typeof value === 'string').join(' ').toLowerCase();
  const numericCode = Number(error.code);
  const effectiveStatus = status || (Number.isInteger(numericCode) && numericCode >= 400 && numericCode <= 599 ? numericCode : undefined);
  let code: ProviderErrorCode = 'generation';
  if (/insufficient_quota|quota_exceeded|credits? (?:exhausted|required)|insufficient (?:credits|balance)|payment_required/.test(hint) || effectiveStatus === 402) code = 'quota';
  else if (/paid_model_auth_required/.test(hint)) code = 'model_access';
  else if (/freetiererror|only.*(?:within|from).*opencode|client.restricted/.test(hint)) code = 'client_restricted';
  else if (/support.*(?:image|vision).*input|image input|vision.*not supported/.test(hint)) code = 'vision_unsupported';
  else if (/tools?.*(?:not supported|unsupported)|does not support.*tools?|function.call.*not supported/.test(hint)) code = 'tools_unsupported';
  else if (effectiveStatus === 429 || /rate_limit|rate.limit|concurrency limit/.test(hint)) code = 'rate_limit';
  else if (effectiveStatus === 401 || effectiveStatus === 403) code = 'authentication';
  else if (effectiveStatus === 404 || /model_not_found|model not found|no endpoints found/.test(hint)) code = 'model_unavailable';
  else if (effectiveStatus && effectiveStatus >= 500) code = 'unavailable';
  return new ProviderError(code, effectiveStatus, code === 'rate_limit' ? retryMs : undefined);
}
export async function responseError(response: Response, signal: AbortSignal): Promise<ProviderError> {
  let data: unknown;
  try { data = await readJSON(response, signal, ERROR_BYTES, 'The provider'); }
  catch { signal.throwIfAborted(); }
  return providerError(data, response.status, retryAfter(response.headers.get('retry-after')));
}
