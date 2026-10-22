import { performance } from "node:perf_hooks";

export interface Clock {
  /** Epoch milliseconds, but monotonic: immune to system clock jumps. */
  now(): number;
}

/**
 * Single time source for the server. Timers and protocol deadlines must all
 * read from here (or from the injected fake in tests), never from Date.now().
 */
export function createClock(): Clock {
  const offset = Date.now() - performance.now();
  return { now: () => Math.round(offset + performance.now()) };
}
