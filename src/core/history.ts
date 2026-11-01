import type { Conversation } from './state.ts';
export function conversationSections(chats: Conversation[], search: string, pinnedOnly: boolean, now = new Date()) {
  const query = search.trim().toLocaleLowerCase();
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = day(now), yesterdayDate = new Date(now); yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = day(yesterdayDate);
  const grouped = new Map<string, Conversation[]>();
  for (const chat of [...chats].filter(c => c.messages.length && (!pinnedOnly || c.pinned) && (!query || `${c.title} ${c.messages.map(m => m.content).join(' ')}`.toLocaleLowerCase().includes(query))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)) {
    const at = new Date(chat.updatedAt), date = day(at);
    const title = chat.pinned ? 'Pinned' : date === today ? 'Today' : date === yesterday ? 'Yesterday' : at.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const group = grouped.get(title) || []; group.push(chat); grouped.set(title, group);
  }
  return Array.from(grouped, ([title, data]) => ({ title, data }));
}
