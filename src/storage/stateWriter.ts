import type { AppState } from '../core/state.ts';
import type { AssistantState } from '../assistant/types.ts';

type StateIO = { get(): AppState; publish(update: (state: AppState) => AppState): void; persist(state: AppState): Promise<void> };
export function createStateWriter(io: StateIO) {
  let tail: Promise<void> = Promise.resolve();
  const queue = (work: () => Promise<void>) => { const pending = tail.catch(() => {}).then(work); tail = pending; return pending; };
  return {
    save: () => queue(() => io.persist(io.get())),
    transaction: (update: (state: AppState) => AppState, signal: AbortSignal) => queue(async () => {
      signal.throwIfAborted(); let previous = io.get(), next = update(previous);
      if (next === previous) return;
      await io.persist(next);
      // Foreground streams can publish while disk I/O is pending. Rebase the
      // pure transaction on current state instead of losing new reply text.
      while (!signal.aborted && io.get() !== previous) { previous = io.get(); next = update(previous); await io.persist(next); }
      if (signal.aborted) { await io.persist(io.get()); signal.throwIfAborted(); }
      io.publish(() => next);
    }),
    commit: (update: (state: AssistantState) => AssistantState, signal: AbortSignal) => queue(async () => {
      signal.throwIfAborted();
      const previous = io.get().assistant, assistant = update(previous);
      signal.throwIfAborted();
      if (assistant === previous) return;
      await io.persist({ ...io.get(), assistant });
      // AsyncStorage cannot cancel a write already in progress. Restore the
      // latest published snapshot before another queued operation can proceed.
      if (signal.aborted) { await io.persist(io.get()); signal.throwIfAborted(); }
      io.publish(state => ({ ...state, assistant }));
    }),
    replace: (state: AppState) => queue(async () => { await io.persist(state); io.publish(() => state); }),
  };
}
