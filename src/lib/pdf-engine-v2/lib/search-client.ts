/**
 * @file search-client.ts — unified web search for pdf-engine-v2.
 *
 * @description Primary backend is Tavily (purpose-built for LLM agent
 * retrieval — returns concise, relevance-scored snippets). Brave Search
 * stays as a graceful fallback when Tavily is misconfigured, over-quota,
 * or returns a non-200. Callers should treat an empty array as "no
 * usable results" and decide their own next action (skip, retry with a
 * broader query, etc.) — this module deliberately never throws.
 *
 * Consumers (planned):
 *   - Stage 13 Assembly Partner Discovery — Wave 2
 *   - Stage 7 plausibility fallback when local corpus is thin
 *
 * @cost
 *   - Tavily free tier: 1,000 searches / month (no card required)
 *   - Tavily paid: $0.005 / search (basic depth); 'advanced' depth
 *     costs roughly 2× — only use for high-stakes lookups
 *   - Brave fallback: ~$5 / 1,000 searches on the Pro plan
 *   - Typical call cost: $0 until the monthly Tavily quota is exhausted,
 *     then $0.005 / call, then $0.005 / call via Brave when Tavily fails
 *
 * @env
 *   - TAVILY_API_KEY — loaded by run.ts env-loader from
 *     ~/.claude/secrets/tavily.env
 *   - BRAVE_SEARCH_API_KEY — same loader, ~/.claude/secrets/brave.env
 *
 * @repo-convention We use AbortController + setTimeout rather than
 * AbortSignal.timeout() because the latter is unreliable on Vercel
 * (see MEMORY.md).
 */

// ─── Public types ──────────────────────────────────────────────────────

export interface SearchResult {
    title: string
    url: string
    snippet: string
    source: "tavily" | "brave"
    /** Tavily relevance score, 0–1. Absent for Brave results. */
    score?: number
}

export interface SearchOpts {
    query: string
    /** Max results to return. Defaults to 10. */
    maxResults?: number
    /**
     * Tavily-only: 'advanced' costs more but pulls richer page content.
     * Ignored by the Brave fallback. Defaults to 'basic'.
     */
    searchDepth?: "basic" | "advanced"
    /** Per-provider timeout. Defaults to 30_000 ms. */
    timeoutMs?: number
}

// ─── Constants ─────────────────────────────────────────────────────────

const TAVILY_SEARCH_URL = "https://api.tavily.com/search"
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
const DEFAULT_MAX_RESULTS = 10
const DEFAULT_TIMEOUT_MS = 30_000

// ─── Provider response shapes ──────────────────────────────────────────

interface TavilyResult {
    title?: string
    url?: string
    content?: string
    score?: number
}

interface TavilyResponse {
    results?: TavilyResult[]
    answer?: string
}

interface BraveWebResult {
    title?: string
    url?: string
    description?: string
}

interface BraveResponse {
    web?: { results?: BraveWebResult[] }
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Wraps fetch with an AbortController-driven timeout. We avoid
 * AbortSignal.timeout() because Vercel's runtime intermittently
 * fails to honour it on cold starts.
 */
async function fetchWithAbortTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

async function tryTavily(opts: SearchOpts): Promise<SearchResult[] | null> {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) {
        console.warn(
            "[search-client] TAVILY_API_KEY not set — skipping Tavily and falling back to Brave.",
        )
        return null
    }

    const body = {
        api_key: apiKey,
        query: opts.query,
        max_results: opts.maxResults ?? DEFAULT_MAX_RESULTS,
        search_depth: opts.searchDepth ?? "basic",
    }

    try {
        const res = await fetchWithAbortTimeout(
            TAVILY_SEARCH_URL,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(body),
            },
            opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        )

        if (!res.ok) {
            const errBody = await res.text().catch(() => "<no body>")
            console.warn(
                `[search-client] Tavily ${res.status}: ${errBody.slice(0, 200)} — falling back to Brave.`,
            )
            return null
        }

        const data = (await res.json()) as TavilyResponse
        const results = data.results ?? []
        return results
            .filter((r): r is TavilyResult & { title: string; url: string } =>
                Boolean(r.title && r.url),
            )
            .map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content ?? "",
                source: "tavily" as const,
                score: typeof r.score === "number" ? r.score : undefined,
            }))
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
            `[search-client] Tavily request failed (${msg}) — falling back to Brave.`,
        )
        return null
    }
}

async function tryBrave(opts: SearchOpts): Promise<SearchResult[] | null> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY
    if (!apiKey) {
        console.warn(
            "[search-client] BRAVE_SEARCH_API_KEY not set — Brave fallback unavailable.",
        )
        return null
    }

    const url = new URL(BRAVE_SEARCH_URL)
    url.searchParams.set("q", opts.query)
    url.searchParams.set(
        "count",
        String(opts.maxResults ?? DEFAULT_MAX_RESULTS),
    )
    url.searchParams.set("search_lang", "en")

    try {
        const res = await fetchWithAbortTimeout(
            url.toString(),
            {
                headers: {
                    Accept: "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": apiKey,
                },
            },
            opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        )

        if (!res.ok) {
            const errBody = await res.text().catch(() => "<no body>")
            console.warn(
                `[search-client] Brave ${res.status}: ${errBody.slice(0, 200)}.`,
            )
            return null
        }

        const data = (await res.json()) as BraveResponse
        const results = data.web?.results ?? []
        return results
            .filter((r): r is BraveWebResult & { title: string; url: string } =>
                Boolean(r.title && r.url),
            )
            .map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.description ?? "",
                source: "brave" as const,
            }))
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[search-client] Brave request failed (${msg}).`)
        return null
    }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Unified web search with provider failover.
 *
 * Order: Tavily → Brave. Returns the first provider's results if non-empty.
 * If Tavily returns zero results we still treat that as a successful call
 * (no fallback) — the empty array signals "the web has nothing relevant"
 * rather than "the provider failed".
 *
 * Returns `[]` if both providers fail or are unconfigured. Never throws.
 *
 * @example
 *   const results = await webSearch({
 *     query: "EU contract manufacturers vertical farming racks",
 *     maxResults: 8,
 *     searchDepth: "basic",
 *   })
 *
 * @cost see file-level @cost block.
 */
export async function webSearch(opts: SearchOpts): Promise<SearchResult[]> {
    const tavilyResults = await tryTavily(opts)
    if (tavilyResults !== null) {
        return tavilyResults
    }

    const braveResults = await tryBrave(opts)
    if (braveResults !== null) {
        return braveResults
    }

    return []
}
