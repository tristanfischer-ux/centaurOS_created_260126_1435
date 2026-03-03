/**
 * @file fetch-with-timeout.ts — Reliable timeout wrapper for server-side fetch
 *
 * @description AbortSignal.timeout() silently fails to abort in-flight fetches in
 * Next.js server actions (Node.js runtime). This helper uses Promise.race to guarantee
 * rejection after timeoutMs, while AbortController.abort() attempts to kill the TCP
 * connection for cleanup.
 *
 * @see Commit 0795994c — original discovery in cad-lab.ts
 */

/**
 * Fetches a URL with a reliable timeout that works in Next.js server actions.
 *
 * @param url - The URL to fetch
 * @param init - Standard fetch RequestInit options (signal will be overridden)
 * @param timeoutMs - Maximum time in ms before the request is aborted
 * @returns The fetch Response
 * @throws Error("Request timeout") if the request exceeds timeoutMs
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeoutMs),
      ),
    ])
    return response
  } finally {
    clearTimeout(timer)
  }
}
