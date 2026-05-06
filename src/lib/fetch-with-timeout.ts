/**
 * @file fetch-with-timeout.ts — Reliable timeout wrapper for server-side fetch
 *
 * @description AbortSignal.timeout() silently fails to abort in-flight fetches in
 * Next.js server actions (Node.js runtime). This helper uses Promise.race to guarantee
 * rejection after timeoutMs, while AbortController.abort() attempts to kill the TCP
 * connection for cleanup.
 *
 * DECISION: Single timer handles both abort + rejection to prevent dangling timers.
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
  let timer: ReturnType<typeof setTimeout>
  try {
    const response = await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error("Request timeout"))
        }, timeoutMs)
      }),
    ])
    return response
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * Enhanced fetch wrapper that safely protects BOTH the headers and the body streaming phase
 * from hanging infinitely. Use this for LLM API calls where response.json() can stall.
 */
export async function fetchAndParseJsonWithTimeout<T = any>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ data: T; headers: Headers }> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error("Request timeout"))
    }, timeoutMs)
  })

  const fetchAndParse = async () => {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 300)}`)
    }
    const data = await response.json()
    return { data, headers: response.headers }
  }

  try {
    return await Promise.race([fetchAndParse(), timeoutPromise])
  } finally {
    clearTimeout(timer!)
  }
}
