// React Native's controller lacks the instance APIs used by app cancellation.
// Feature probes keep browsers and newer native runtimes on their own implementation.
export function installAbortSignalCompatibility(
  Signal: typeof AbortSignal = globalThis.AbortSignal,
  Controller: typeof AbortController = globalThis.AbortController,
): void {
  if (!Signal || !Controller) return;
  if (!('reason' in Signal.prototype)) {
    const reasons = new WeakMap<AbortSignal, unknown>();
    const originalAbort = Controller.prototype.abort;
    const defaultReason = () => {
      if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError');
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      return error;
    };
    Object.defineProperty(Signal.prototype, 'reason', {
      configurable: true,
      get(this: AbortSignal) {
        if (!this.aborted) return undefined;
        if (!reasons.has(this)) reasons.set(this, defaultReason());
        return reasons.get(this);
      },
    });
    Controller.prototype.abort = function (reason?: unknown) {
      if (!this.signal.aborted) reasons.set(this.signal, reason === undefined ? defaultReason() : reason);
      originalAbort.call(this, reason);
    };
  }
  if (typeof Signal.prototype.throwIfAborted !== 'function') {
    Object.defineProperty(Signal.prototype, 'throwIfAborted', {
      configurable: true,
      writable: true,
      value(this: AbortSignal) { if (this.aborted) throw this.reason; },
    });
  }
}

installAbortSignalCompatibility();
