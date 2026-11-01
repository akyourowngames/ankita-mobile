import { buildRequest, streamRequest } from './protocol.ts';
import { ProviderError } from './providerErrors.ts';
import { MODEL_TEST_TIMEOUT_MS } from '../constants/appConfig.ts';
import type { Provider } from '../core/state.ts';
const PROBE_TOKENS = 64; // Output tokens: user-triggered generation check has a small, explicit cost ceiling.
const PROBE_NAME = 'check_connection'; // Harmless function exists only in the probe request; never executes an action.
const PROBE_PROMPT = 'Call check_connection once with no arguments to confirm native tool calling. Do not answer in text.';
const PROBE_TOOL = { type: 'function' as const, function: { name: PROBE_NAME, description: 'Harmless connection test; no side effects.', parameters: { type: 'object', properties: {}, additionalProperties: false } } };
export async function probeModel(provider: Provider, key: string, fetcher: typeof fetch, signal: AbortSignal): Promise<'tools' | 'text'> {
  const request = buildRequest(provider, key, [{ role: 'user', content: PROBE_PROMPT }], '', provider.kind === 'chief' ? undefined : [PROBE_TOOL]);
  Object.assign(request.body, { max_tokens: PROBE_TOKENS, ...(provider.kind === 'chief' ? {} : { tool_choice: provider.kind === 'anthropic' ? { type: 'tool', name: PROBE_NAME } : { type: 'function', function: { name: PROBE_NAME } } }) });
  const controller = new AbortController(), cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  const timer = setTimeout(cancel, MODEL_TEST_TIMEOUT_MS);
  let validTool = false;
  try {
    await streamRequest(request, fetcher, controller.signal, () => {}, calls => { validTool = calls.length === 1 && calls[0].name === PROBE_NAME && Object.keys(JSON.parse(calls[0].arguments)).length === 0; });
    if (provider.kind === 'chief') return 'text';
    if (!validTool) throw new ProviderError('tools_unsupported');
    return 'tools';
  } catch (error) { if (controller.signal.aborted && !signal.aborted) throw new Error('Connection timed out while testing generation. Retry later or choose another model.'); throw error; }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
