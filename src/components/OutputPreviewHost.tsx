import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { useApp } from '../core/AppContext';
import { OutputPreview } from './OutputPreview';

const OutputPreviewContext = createContext<((outputId: string) => void) | null>(null);
export function useOutputPreview() {
  const open = useContext(OutputPreviewContext);
  if (!open) throw new Error('Output preview host missing');
  return open;
}

/** Lives above screen navigation so source rows may unmount without losing drafts. */
export function OutputPreviewProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const [session, setSession] = useState<{ outputId: string; dataEpoch: number } | null>(null);
  const active = session?.dataEpoch === app.assistantDataEpoch ? session : null;
  const open = (outputId: string) => {
    if (!app.state.assistant.artifacts.some(item => item.id === outputId)) return;
    // Background navigation or another row must never replace an active draft.
    setSession(current => current?.dataEpoch === app.assistantDataEpoch ? current : { outputId, dataEpoch: app.assistantDataEpoch });
  };
  return <OutputPreviewContext.Provider value={open}>{children}{active && <OutputPreview key={`${active.dataEpoch}:${active.outputId}`} outputId={active.outputId} close={() => setSession(null)} />}</OutputPreviewContext.Provider>;
}
