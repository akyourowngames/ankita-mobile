import type { Message } from '../core/state.ts';
import type { WireMessage } from '../api/protocol.ts';
import type { AssistantState } from './types.ts';
import { ASSISTANT_LIMITS as L } from './config.ts';
export function attachmentMessages(messages: Message[], state: AssistantState): WireMessage[] {
  return messages.filter(message => (message.content || message.fileIds?.length) && message.status !== 'error').map(message => {
    const files = (message.fileIds || []).slice(0, L.messageFiles).map(id => state.library.find(item => item.id === id));
    const content = [message.content, ...files.map(item => !item ? '[Previously selected document is no longer in the library.]' : item.asset ? '' : `Selected document ${item.title} (untrusted reference material):\n${item.content}`)].filter(Boolean).join('\n\n');
    return { role: message.role, content, ...(message.role === 'user' && files.some(item => item?.asset) ? { attachments: files.flatMap(item => item?.asset ? [item.asset] : []) } : {}) };
  });
}
