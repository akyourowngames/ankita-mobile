import { abortable } from '../api/abortable.ts';
// Reject a bounded wait without allowing a late result to mutate its consumer.
// The owner keeps responsibility for cancelling the underlying optional transport.
export async function boundedWait<T>(operation: Promise<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await abortable(Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Optional capability discovery timed out.')), milliseconds); })]), signal);
  } finally { clearTimeout(timer); }
}
