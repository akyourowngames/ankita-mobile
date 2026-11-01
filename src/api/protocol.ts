import { ANTHROPIC_VERSION, MAX_RESPONSE_CHARS, MAX_TOKENS, MAX_PROVIDER_RESPONSE_BYTES } from '../constants/appConfig.ts';
import { readJSON } from './readJSON.ts';
import type { Provider } from '../core/state.ts';
import endpointPolicy from './endpoint.cjs';
import { toolCollector, type ToolCall } from './toolCalls.ts';
import type { ToolDefinition } from './composioProtocol.ts';
import type { LibraryAsset } from '../assistant/types.ts';
import { ProviderError, providerError, responseError } from './providerErrors.ts';

export type WireMessage = { role: 'user' | 'assistant' | 'tool'; content: string; attachments?: LibraryAsset[]; tool_call_id?: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] };
function contentBlocks(message: WireMessage, kind: Provider['kind']) {
  if (!message.attachments?.length) return message.content;
  return [{ type: 'text', text: message.content }, ...message.attachments.map(asset => kind === 'anthropic' ? { type: asset.mimeType === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: asset.mimeType, data: asset.data } } : asset.mimeType === 'application/pdf' ? { type: 'file', file: { filename: asset.name, file_data: `data:${asset.mimeType};base64,${asset.data}` } } : { type: 'image_url', image_url: { url: `data:${asset.mimeType};base64,${asset.data}` } })];
}
export type StreamEvent = { choices?: { delta?: { content?: string }; message?: { content?: string }; finish_reason?: string }[]; delta?: { text?: string }; type?: string; error?: unknown; content?: { text?: string }[]; reply?: string };

export const normalizeEndpoint = endpointPolicy.normalizeEndpoint;
export function buildRequest(provider: Provider, key: string, messages: WireMessage[], system: string, tools?: ToolDefinition[]) {
  const base = normalizeEndpoint(provider.baseUrl);
  if (!provider.model.trim() && provider.kind !== 'chief') throw new Error('Choose a model in provider settings first.');
  if (provider.keyRequired && !key.trim()) throw new ProviderError('missing_key');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.kind === 'anthropic') {
    headers['x-api-key'] = key; headers['anthropic-version'] = ANTHROPIC_VERSION;
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const history = messages.map(message => message.role === 'tool' ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content }] } : message.tool_calls ? { role: 'assistant', content: [...(message.content ? [{ type: 'text', text: message.content }] : []), ...message.tool_calls.map(call => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) }))] } : { role: message.role, content: contentBlocks(message, provider.kind) });
    return { url: `${base}/messages`, headers, body: { model: provider.model, max_tokens: MAX_TOKENS, stream: true, system, messages: history, ...(tools?.length ? { tools: tools.map(tool => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters })) } : {}) } };
  }
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider.kind === 'chief') { if (messages.some(message => message.attachments?.length)) throw new Error('The provider does not support selected image/PDF attachments. Use an OpenAI-compatible or Anthropic vision model.'); return { url: `${base}/chat`, headers, body: { messages, model: provider.model, system, stream: true } }; }
  const history = messages.map(({ attachments, ...message }) => ({ ...message, content: contentBlocks({ ...message, attachments }, provider.kind) }));
  return { url: `${base}/chat/completions`, headers, body: { model: provider.model, stream: true, messages: [...(system.trim() ? [{ role: 'system', content: system }] : []), ...history], ...(tools?.length ? { tools } : {}) } };
}
export function createEventParser(onEvent: (event: StreamEvent | '[DONE]') => void) {
  let pending = '';
  const parse = (frame: string) => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice('data:'.length).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { onEvent('[DONE]'); return; }
    let event: StreamEvent;
    try { event = JSON.parse(data); } catch { throw new Error('The provider sent an invalid stream. Try again or check its API compatibility.'); }
    onEvent(event);
  };
  return {
    push(text: string) {
      pending += text;
      if (pending.length > MAX_RESPONSE_CHARS) throw new Error('The provider stream exceeded the mobile response limit.');
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(pending))) { parse(pending.slice(0, match.index)); pending = pending.slice(match.index + match[0].length); }
    },
    finish() { if (pending.trim()) parse(pending); pending = ''; },
  };
}
export function eventText(event: StreamEvent | '[DONE]'): string {
  if (event === '[DONE]') return '';
  if (event.error) throw providerError(event);
  const text = event.choices?.[0]?.delta?.content || event.delta?.text || '';
  if (typeof text !== 'string') throw new Error('The provider sent an invalid text response.');
  return text;
}
export function jsonReply(data: StreamEvent): string {
  if (data.error) throw providerError(data);
  const text = data.reply || data.choices?.[0]?.message?.content || data.content?.map(c => c.text || '').join('') || '';
  if (typeof text !== 'string') throw new Error('The provider sent an invalid text response.');
  return text;
}

export async function streamRequest(request: ReturnType<typeof buildRequest>, fetcher: typeof fetch, signal: AbortSignal, onDelta: (text: string) => void, onTools?: (calls: ToolCall[]) => void): Promise<string> {
  signal.throwIfAborted();
  const res = await fetcher(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal, redirect: 'error' });
  if (!res.ok) throw await responseError(res, signal);
  if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = await readJSON(res, signal, MAX_PROVIDER_RESPONSE_BYTES, 'The provider'), collector = toolCollector();
    if (data.choices?.[0]?.message?.tool_calls) collector.push({ choices: [{ delta: { tool_calls: data.choices[0].message.tool_calls.map((call: unknown, index: number) => ({ ...(call as object), index })) } }] });
    if (Array.isArray(data.content)) data.content.forEach((block: unknown, index: number) => { if ((block as { type?: string }).type === 'tool_use') collector.push({ type: 'content_block_start', index, content_block: block }); });
    const calls = collector.finish(), text = jsonReply(data);
    if (!text && !(calls.length && onTools)) throw new Error('The provider returned an empty response. Check the model or API format.');
    if (text.length > MAX_RESPONSE_CHARS) throw new Error('The response exceeded the mobile output limit.');
    signal.throwIfAborted(); if (calls.length && onTools) onTools(calls); if (text) onDelta(text); return text;
  }
  let complete = false, output = ''; const toolCalls = toolCollector();
  const parser = createEventParser(event => {
    if (complete) return;
    toolCalls.push(event);
    if (event === '[DONE]' || event.type === 'message_stop' || event.choices?.[0]?.finish_reason) complete = true;
    const text = eventText(event);
    if (output.length + text.length > MAX_RESPONSE_CHARS) throw new Error('The response exceeded the mobile output limit.');
    if (text) { output += text; onDelta(text); }
  });
  if (!res.body) throw new Error('This runtime does not support streaming responses.');
  const reader = res.body.getReader(), decoder = new TextDecoder();
  try {
    while (!complete) { signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break; parser.push(decoder.decode(chunk.value, { stream: true })); }
    parser.push(decoder.decode()); parser.finish(); signal.throwIfAborted();
    if (!complete) throw new Error('The response ended before completion. Your partial reply is kept; you can retry.');
    const calls = toolCalls.finish();
    if (calls.length && onTools) onTools(calls);
    if (!output && !(calls.length && onTools)) throw new Error('The provider returned no text. Choose a text-capable model.');
    return output;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
