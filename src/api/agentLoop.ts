import { buildRequest, streamRequest, type WireMessage } from './protocol.ts';
import type { Provider } from '../core/state.ts';
import type { ToolCall } from './toolCalls.ts';
import type { ToolSession } from '../assistant/tools.ts';
import { ASSISTANT_LIMITS as L } from '../assistant/config.ts';
import { canonicalArguments, ToolFault } from '../assistant/schema.ts';
import { boundedToolResult } from '../assistant/receipts.ts';
import { MAX_RESPONSE_CHARS } from '../constants/appConfig.ts';
import { abortable } from './abortable.ts';
const SUMMARY_GUIDANCE = 'Tool execution has stopped at its safety budget. Summarize only completed results, explain rejected or unfinished work, and do not request more tools or claim unperformed actions.';
const LIMIT_ERROR = 'The provider reached the tool execution limit. Your partial reply is kept.';
const failed = (code: string, message: string) => boundedToolResult({ ok: false, error: { code, message } });
function boundResult(result: string) {
  if (result.length <= L.toolResultChars) return result;
  return boundedToolResult({ result, truncated: true });
}
export async function agentLoop(provider: Provider, key: string, history: WireMessage[], system: string, fetcher: typeof fetch, signal: AbortSignal, onDelta: (text: string) => void, session?: ToolSession, activity: (text: string) => void = () => {}) {
  const tools = session ? await abortable(session.tools(), signal) : [], messages = [...history], allowed = new Set(tools.map(t => t.function.name));
  const repeats = new Map<string, number>();
  let output = '', attempts = 0, summarize = false;
  // One additional request may summarize real results with tools removed.
  for (let round = 0; round <= L.toolRounds; round++) {
    const summaryOnly = summarize || round === L.toolRounds;
    signal.throwIfAborted(); let calls: ToolCall[] = [];
    activity('Thinking');
    let firstDelta = true;
    const text = await streamRequest(buildRequest(provider, key, messages, summaryOnly ? `${system}\n\n${SUMMARY_GUIDANCE}` : system, summaryOnly ? [] : tools), fetcher, signal, delta => {
      const next = firstDelta && output ? `\n\n${delta}` : delta; firstDelta = false;
      if (output.length + next.length > MAX_RESPONSE_CHARS) throw new Error('The response exceeded the mobile output limit.');
      output += next; activity('Writing'); onDelta(next);
    }, found => { calls = found; });
    if (!calls.length) return output;
    if (summaryOnly) throw new Error(LIMIT_ERROR);
    messages.push({ role: 'assistant', content: text, tool_calls: calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) });
    for (const call of calls) {
      signal.throwIfAborted();
      let result: string;
      attempts++;
      if (attempts > L.toolCalls) { summarize = true; result = failed('execution_limit', 'The turn exhausted its tool budget. This call was not executed.'); }
      else if (!session || !allowed.has(call.name)) result = failed('unavailable', 'This tool is not enabled. No action was performed.');
      else {
        try {
          const args = JSON.parse(call.arguments), fingerprint = `${call.name}:${canonicalArguments(args)}`, count = (repeats.get(fingerprint) || 0) + 1;
          repeats.set(fingerprint, count);
          if (count > L.identicalCalls) { summarize = true; result = failed('repeat_limit', 'This identical call already ran. It was not repeated.'); }
          else {
            activity(`Using ${call.name}`);
            result = boundResult(await abortable(session.execute(call.name, args), signal));
          }
        } catch (error) {
          signal.throwIfAborted();
          result = error instanceof ToolFault ? failed(error.code, error.message) : failed('execution_failed', 'The tool failed. No successful result is available.');
        }
      }
      signal.throwIfAborted();
      messages.push({ role: 'tool', content: result, tool_call_id: call.id });
    }
  }
  throw new Error(LIMIT_ERROR);
}
