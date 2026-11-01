import { abortable } from './abortable.ts';
// Bytes: callers choose an explicit protocol response ceiling before parsing JSON.
export async function readJSON(response: Response, signal: AbortSignal, maxBytes: number, source: string): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${source} returned an unreadable response.`);
  const decoder = new TextDecoder(); let text = '', size = 0;
  try {
    while (true) {
      signal.throwIfAborted(); const part = await abortable(reader.read(), signal);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error(`${source} returned a response that is too large.`);
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode(); signal.throwIfAborted();
    try { return JSON.parse(text); } catch { throw new Error(`${source} returned invalid JSON.`); }
  } finally { void reader.cancel().catch(() => {}); }
}
