export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

export function retryCount(method: string, requested?: number): number {
  if (!isSafeMethod(method)) return 0;
  return Math.min(Math.max(requested ?? 1, 0), 2);
}

export function createAttemptSignal(externalSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new TimeoutError());
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', forwardAbort);
    },
  };
}
