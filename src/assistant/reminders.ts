import type { AssistantStore } from './tools.ts';
import type { RecordClock, Task, TaskInput } from './types.ts';
import { saveTask, deleteTask } from './records.ts';
import { ToolFault } from './schema.ts';
export type ReminderPort = { supported: boolean; schedule(task: Task, signal: AbortSignal): Promise<string>; cancel(id: string): Promise<void>; cancelAll?: () => Promise<void> };
export function createReminderService(store: AssistantStore, clock: RecordClock, port: ReminderPort) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>) => { const pending = tail.catch(() => {}).then(work); tail = pending; return pending; };
  const find = (id: string) => { const task = store.get().tasks.find(task => task.id === id); if (!task) throw new ToolFault('not_found', 'Task was not found.'); return task; };
  const cancel = async (id: string, signal: AbortSignal) => { signal.throwIfAborted(); const task = find(id); if (task.notificationId) await port.cancel(task.notificationId); signal.throwIfAborted(); await store.commit(state => saveTask(state, { ...find(id), notificationId: null }, clock).state, signal); return { cancelled: true }; };
  const operations = {
    async save(input: TaskInput, signal: AbortSignal) { if (input.id && find(input.id).notificationId) await cancel(input.id, signal); let task!: Task; await store.commit(state => { const changed = saveTask(state, { ...input, notificationId: null }, clock); task = changed.record; return changed.state; }, signal); return task; },
    async schedule(id: string, signal: AbortSignal) {
      signal.throwIfAborted(); if (!port.supported) throw new ToolFault('unsupported_platform', 'Reminders require the native phone app. Browser reminders are not scheduled.');
      let task = find(id);
      if (task.status !== 'open' || task.dueAt === null || task.dueAt <= clock.now()) throw new ToolFault('invalid_date', 'An open task needs a future due date before scheduling a reminder.');
      if (task.notificationId) await cancel(id, signal); task = find(id);
      const notificationId = await port.schedule(task, signal);
      try { signal.throwIfAborted(); await store.commit(state => saveTask(state, { ...find(id), notificationId }, clock).state, signal); signal.throwIfAborted(); return { notificationId, dueAt: task.dueAt }; }
      catch (error) { await port.cancel(notificationId); throw error; }
    },
    cancel,
    async complete(id: string, signal: AbortSignal) { if (find(id).notificationId) await cancel(id, signal); await store.commit(state => saveTask(state, { ...find(id), status: 'done' }, clock).state, signal); return find(id); },
    async remove(id: string, signal: AbortSignal) { if (find(id).notificationId) await cancel(id, signal); await store.commit(state => deleteTask(state, id), signal); return { removed: true }; },
    async clear(signal: AbortSignal) { for (const task of store.get().tasks) { signal.throwIfAborted(); if (task.notificationId) await port.cancel(task.notificationId); } if (port.cancelAll) await port.cancelAll(); signal.throwIfAborted(); await store.commit(state => ({ ...state, memories: [], tasks: [], library: [], proposals: [], artifacts: [] }), signal); },
  };
  // UI and model calls share this instance: never leave an orphan notification
  // when two callers schedule or reset the same task concurrently.
  return { supported: port.supported, save: (input: TaskInput, signal: AbortSignal) => serial(() => operations.save(input, signal)), schedule: (id: string, signal: AbortSignal) => serial(() => operations.schedule(id, signal)), cancel: (id: string, signal: AbortSignal) => serial(() => cancel(id, signal)), complete: (id: string, signal: AbortSignal) => serial(() => operations.complete(id, signal)), remove: (id: string, signal: AbortSignal) => serial(() => operations.remove(id, signal)), clear: (signal: AbortSignal) => serial(() => operations.clear(signal)) };
}
