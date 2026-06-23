/**
 * Promise-based concurrency limiter.
 *
 * Functionally equivalent to the `p-limit` package, inlined to avoid an
 * external dependency for ~20 lines of code.
 *
 * Usage:
 *
 *   const limit = createLimit(4);
 *   const results = await Promise.all(tasks.map(t => limit(() => run(t))));
 *
 * The limiter is unbounded in queue depth — it doesn't push back on the
 * caller. If you need bounded enqueue, wrap it.
 */

/** A function that runs an async task under the concurrency limit. */
export type LimitedRunner = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimit(max: number): LimitedRunner {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`createLimit: max must be a positive integer, got ${max}`);
  }

  let running = 0;
  /**
   * FIFO list of resolvers belonging to tasks waiting for a slot. When a
   * running task finishes, the next resolver is invoked to wake one waiter.
   */
  const waiters: (() => void)[] = [];

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // Wait for a slot. The loop guards a race where another waiter could
    // grab the slot between our `await` resolving and our increment — in
    // single-threaded JS this is theoretical, but `while` is the right shape.
    while (running >= max) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    running++;

    try {
      return await fn();
    } finally {
      running--;
      // Wake exactly one waiter per finished task. Shifting from the front
      // gives FIFO behaviour — earlier callers get slots first.
      const next = waiters.shift();
      if (next) next();
    }
  };
}
