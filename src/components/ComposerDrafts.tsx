import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../core/AppContext';
import { PHONE } from '../theme/tokens';
import { ASSISTANT_LIMITS } from '../assistant/config';

type Drafts = { values: ReadonlyMap<string, string>; set: (key: string, value: string) => void; files: ReadonlyMap<string, string[]>; setFiles: (key: string, value: string[]) => void };
const DraftContext = createContext<Drafts>({ values: new Map(), set: () => {}, files: new Map(), setFiles: () => {} });
// Session-only text stays outside saved state and exports. Keys distinguish the
// teammate's new conversation from every existing conversation.
export function ComposerDraftProvider({ children }: { children: ReactNode }) {
  const app = useApp(), [values, setValues] = useState<Map<string, string>>(() => new Map());
  const [files, setFiles] = useState<Map<string, string[]>>(() => new Map());
  useEffect(() => { if (app.ready && !app.state.onboardingDone) { setValues(new Map()); setFiles(new Map()); } }, [app.ready, app.state.onboardingDone]);
  const value = useMemo(() => ({ values, set: (key: string, text: string) => setValues(previous => {
    const next = new Map(previous); next.delete(key);
    if (text) next.set(key, text);
    while (next.size > PHONE.draftLimit) next.delete(next.keys().next().value!);
    return next;
  }), files, setFiles: (key: string, selected: string[]) => setFiles(previous => { const next = new Map(previous); next.delete(key); if (selected.length) next.set(key, [...new Set(selected)].slice(0, ASSISTANT_LIMITS.messageFiles)); while (next.size > PHONE.draftLimit) next.delete(next.keys().next().value!); return next; }) }), [values, files]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
export function useComposerFiles(teammateId: string, conversationId: string | null) { const context = useContext(DraftContext), key = JSON.stringify([teammateId, conversationId]); return [context.files.get(key) || [], (files: string[]) => context.setFiles(key, files)] as const; }
export function useComposerDraft(teammateId: string, conversationId: string | null) {
  const context = useContext(DraftContext), key = JSON.stringify([teammateId, conversationId]);
  return [context.values.get(key) || '', (text: string) => context.set(key, text)] as const;
}
