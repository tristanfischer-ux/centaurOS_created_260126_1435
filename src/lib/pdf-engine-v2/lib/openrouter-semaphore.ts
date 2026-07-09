/**
 * @file openrouter-semaphore.ts
 * @description Process-wide concurrency gate for OpenRouter chat completions.
 *
 * INTENT (Tristan 2026-07-09 concurrency): with N=2 chain workers on one host,
 * unbounded parallel LLM calls trip OpenRouter rate limits. Cap in-flight
 * fetches per process via OPENROUTER_MAX_INFLIGHT (default 4).
 *
 * Pure await-queue — no Redis. Each Node process (each worker child) has its
 * own semaphore; two workers × 4 = 8 host-wide in-flight max under the default.
 */

let inflight = 0
const waiters: Array<() => void> = []

/**
 * @description Max concurrent OpenRouter HTTP calls in this process.
 * @returns Cap from OPENROUTER_MAX_INFLIGHT env, default 4, minimum 1.
 */
export function openRouterMaxInflight(): number {
  const n = parseInt(process.env.OPENROUTER_MAX_INFLIGHT || '4', 10)
  return Number.isFinite(n) && n >= 1 ? n : 4
}

/**
 * @description Acquire a slot before calling OpenRouter; release in finally.
 * @returns Promise that resolves when a slot is available.
 */
export async function acquireOpenRouterSlot(): Promise<void> {
  const max = openRouterMaxInflight()
  if (inflight < max) {
    inflight++
    return
  }
  await new Promise<void>((resolve) => {
    waiters.push(() => {
      inflight++
      resolve()
    })
  })
}

/**
 * @description Release a previously acquired slot (wakes one waiter if any).
 */
export function releaseOpenRouterSlot(): void {
  inflight = Math.max(0, inflight - 1)
  const next = waiters.shift()
  if (next) next()
}

/**
 * @description Run `fn` while holding one OpenRouter concurrency slot.
 * @param fn Async work that performs the OpenRouter fetch.
 * @returns The result of `fn`.
 */
export async function withOpenRouterSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireOpenRouterSlot()
  try {
    return await fn()
  } finally {
    releaseOpenRouterSlot()
  }
}

/** @internal Test/reset helper — not for production call sites. */
export function _resetOpenRouterSemaphoreForTests(): void {
  inflight = 0
  waiters.length = 0
}
