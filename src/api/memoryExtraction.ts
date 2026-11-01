import { buildRequest, streamRequest } from './protocol.ts';
import { ASSISTANT_LIMITS as L } from '../assistant/config.ts';
import { MEMORY_EXTRACTION_PROMPT, type ConsolidationInput } from '../assistant/consolidation.ts';
import type { Provider } from '../core/state.ts';
export type ModelMemoryInput = ConsolidationInput & { provider: Provider; key: string };
export async function extractPersonalMemories(input: ModelMemoryInput, fetcher: typeof fetch, signal: AbortSignal) {
  let output = '';
  await streamRequest(buildRequest(input.provider, input.key, [{ role: 'user', content: input.user.text.slice(0, L.extractionInputChars) }], MEMORY_EXTRACTION_PROMPT, []), fetcher, signal, delta => { if (output.length + delta.length > L.extractionReplyChars) throw new Error('Memory suggestion output exceeded its limit.'); output += delta; }, calls => { if (calls.length) throw new Error('Memory extraction cannot call tools.'); });
  return output;
}
