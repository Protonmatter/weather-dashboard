export interface ComparisonScheduler {
  schedule<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

interface QueueItem<T> {
  work: () => Promise<T>;
  signal?: AbortSignal;
  started: boolean;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  onAbort: () => void;
}

const abortError = (): DOMException => new DOMException("Aborted", "AbortError");

export function createComparisonScheduler(limit = 2): ComparisonScheduler {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("comparison scheduler: limit must be a positive integer");
  }

  let active = 0;
  const queue: QueueItem<unknown>[] = [];

  const pump = (): void => {
    while (active < limit && queue.length > 0) {
      const item = queue.shift()!;
      item.signal?.removeEventListener("abort", item.onAbort);
      if (item.signal?.aborted) {
        item.reject(abortError());
        continue;
      }

      item.started = true;
      active += 1;
      Promise.resolve()
        .then(item.work)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };

  return {
    schedule<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(abortError());

      return new Promise<T>((resolve, reject) => {
        const item: QueueItem<T> = {
          work,
          signal,
          started: false,
          resolve,
          reject,
          onAbort: () => {
            if (item.started) return;
            const index = queue.indexOf(item as QueueItem<unknown>);
            if (index >= 0) queue.splice(index, 1);
            signal?.removeEventListener("abort", item.onAbort);
            reject(abortError());
            pump();
          },
        };
        signal?.addEventListener("abort", item.onAbort, { once: true });
        queue.push(item as QueueItem<unknown>);
        pump();
      });
    },
  };
}
