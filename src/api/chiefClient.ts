import { providerFetch } from './transport';
import { ANTHROPIC_VERSION, MAX_CONTEXT_MESSAGES, MAX_PROVIDER_RESPONSE_BYTES, MODEL_TEST_TIMEOUT_MS } from '../constants/appConfig';
import type { Provider } from '../core/state';
import { normalizeEndpoint, type WireMessage } from './protocol';
import { readJSON } from './readJSON';
import { agentLoop } from './agentLoop';
import { ComposioSession } from './composioProtocol';
import type { IntegrationConfig } from '../core/state';
import { createPhoneToolSession, type PhoneToolOptions } from '../assistant/tools';
import { ASSISTANT_TIMING } from '../assistant/config';
import { boundedWait } from '../assistant/deadline';
import { ProviderError, responseError } from './providerErrors';
import { ConnectionError } from './connectionErrors';

export async function postChat(provider: Provider, key: string, messages: WireMessage[], system: string, signal: AbortSignal, onDelta: (text: string) => void, options?: { integrations: IntegrationConfig; composioKey: string; activity: (text: string) => void; phone?: Omit<PhoneToolOptions, 'signal' | 'external'> }): Promise<string> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  const timer = setTimeout(cancel, ASSISTANT_TIMING.turnMs);
  const externalController = new AbortController(), cancelExternal = () => externalController.abort();
  controller.signal.addEventListener('abort', cancelExternal, { once: true });
  if (controller.signal.aborted) cancelExternal();
  try {
    let external;
    try { external = options?.integrations.enabled && options.integrations.toolkits.length ? await boundedWait(ComposioSession.create(options.integrations, options.composioKey, providerFetch, externalController.signal), controller.signal, ASSISTANT_TIMING.catalogMs) : undefined; }
    catch (error) { cancelExternal(); controller.signal.throwIfAborted(); if (!options?.phone) throw error; options.activity('Connected apps are unavailable; phone tools remain available'); }
    const session = options?.phone ? createPhoneToolSession({ ...options.phone, signal: controller.signal, external, externalUnavailable: () => { cancelExternal(); options.activity('Connected apps are unavailable; phone tools remain available'); } }) : external;
    if (session && provider.kind === 'chief' && (await session.tools()).length) throw new Error('The provider does not support mobile app tools. Select an OpenAI-compatible or Anthropic provider, or disable tools in Assistant settings.');
    return await agentLoop(provider, key, messages.slice(-MAX_CONTEXT_MESSAGES), system, providerFetch, controller.signal, onDelta, session, options?.activity);
  }
  catch (error) { if (controller.signal.aborted && !signal.aborted) throw new Error('The assistant turn timed out. Your partial reply is kept; retry when ready.'); throw error; }
  finally { cancelExternal(); controller.signal.removeEventListener('abort', cancelExternal); clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
export async function discoverModels(provider: Provider, key: string, signal?: AbortSignal): Promise<string[]> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), MODEL_TEST_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  try {
    controller.signal.throwIfAborted();
    if (provider.keyRequired && !key.trim()) throw new ProviderError('missing_key');
    const headers: Record<string, string> = provider.kind === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' } : key ? { Authorization: `Bearer ${key}` } : {};
    const res = await providerFetch(`${normalizeEndpoint(provider.baseUrl, provider.kind)}${provider.kind === 'chief' ? '/health' : '/models'}`, { headers, signal: controller.signal, redirect: 'error' });
    if (!res.ok) throw await responseError(res, controller.signal);
    const data = await readJSON(res, controller.signal, MAX_PROVIDER_RESPONSE_BYTES, 'The endpoint');
    if (provider.kind === 'chief') return [];
    if (!Array.isArray(data?.data)) throw new ConnectionError('catalogue_format');
    return [...new Set<string>(data.data.map((m: { id?: unknown } | null) => m?.id).filter((id: unknown): id is string => typeof id === 'string'))].sort();
  } catch (error) { if (signal?.aborted) throw signal.reason; if (controller.signal.aborted) throw new ConnectionError('catalogue_timeout'); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
