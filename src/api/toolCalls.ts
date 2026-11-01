import { ASSISTANT_LIMITS as L } from '../assistant/config.ts';
import config from '../constants/composio.json' with { type: 'json' };
export type ToolCall = { id: string; name: string; arguments: string };
export function toolCollector() {
  const calls = new Map<number, ToolCall>();
  const validIndex = (index: number) => { if (!Number.isInteger(index) || index < 0 || index >= config.maxTools) throw new Error('The provider sent an invalid tool call.'); };
  return {
    push(event: any) {
      if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        validIndex(event.index);
        if (calls.has(event.index)) throw new Error('The provider sent a duplicate tool block.');
        calls.set(event.index, { id: event.content_block.id, name: event.content_block.name, arguments: Object.keys(event.content_block.input || {}).length ? JSON.stringify(event.content_block.input) : '' });
      }
      if (event?.type === 'content_block_delta' && typeof event.delta?.partial_json === 'string') { const call = calls.get(event.index); if (!call) throw new Error('The provider sent an invalid tool stream.'); call.arguments += event.delta.partial_json; }
      for (const item of event?.choices?.[0]?.delta?.tool_calls || []) {
        const index = item.index;
        validIndex(index);
        const call = calls.get(index) || { id: '', name: '', arguments: '' };
        if (typeof item.id === 'string') call.id += item.id;
        if (typeof item.function?.name === 'string') call.name += item.function.name;
        if (typeof item.function?.arguments === 'string') call.arguments += item.function.arguments;
        calls.set(index, call);
      }
      if (calls.size > config.maxTools || [...calls.values()].some(c => c.arguments.length > L.argumentChars || c.id?.length > L.toolIdentityChars || c.name?.length > L.toolIdentityChars)) throw new Error('The provider tool request exceeded the mobile limit.');
    },
    finish() {
      const ids = new Set<string>();
      return [...calls.values()].map(call => {
        if (typeof call.id !== 'string' || typeof call.name !== 'string' || !call.id || !call.name) throw new Error('The provider sent an incomplete tool call.');
        if (ids.has(call.id)) throw new Error('The provider sent duplicate tool IDs.');
        ids.add(call.id);
        let args; try { args = JSON.parse(call.arguments || '{}'); } catch { throw new Error('The provider sent invalid tool arguments.'); }
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('The provider sent invalid tool arguments.');
        return { ...call, arguments: JSON.stringify(args) };
      });
    },
  };
}
