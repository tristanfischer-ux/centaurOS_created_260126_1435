/**
 * @file brave-search.ts — Brave Search API client + Flash-Lite judge.
 *
 * Brave Search is a real web search engine (independent index, not just a
 * Bing/Google wrapper) with a free tier of 2,000 queries/month. Designed
 * for AI use cases; returns clean snippets per result.
 *
 * Key: lives in nightshift Tauri app sqlite at
 *   ~/Library/Application Support/com.fractionalforge.nightshift/nightshift.db
 *   table `config`, key `brave_api_key`.
 *
 * Cascade position: phase 4 (after distributor APIs, before Tavily).
 * Brave is cheaper than Tavily but Tavily has slightly denser industrial
 * catalogue coverage; we try Brave first for cost.
 */

import Database from 'better-sqlite3'
import { resolve } from 'path'
import { homedir } from 'os'
import { urlResolves } from './url-resolves'

const NIGHTSHIFT_DB = resolve(homedir(), 'Library', 'Application Support', 'com.fractionalforge.nightshift', 'nightshift.db')

let _braveKey: string | null = null

function getBraveKey(): string | null {
  if (_braveKey !== null) return _braveKey
  // Try env first
  if (process.env.BRAVE_API_KEY) {
    _braveKey = process.env.BRAVE_API_KEY
    return _braveKey
  }
  // Try nightshift sqlite
  try {
    const db = new Database(NIGHTSHIFT_DB, { readonly: true, fileMustExist: true })
    const row = db.prepare<[], { value: string }>(`SELECT value FROM config WHERE key = 'brave_api_key' LIMIT 1`).get()
    db.close()
    if (row?.value) {
      _braveKey = row.value
      return _braveKey
    }
  } catch {}
  _braveKey = ''
  return null
}

export interface BraveSearchResult {
  title: string
  url: string
  description: string
  age?: string
}

/**
 * Run a Brave Search and return the top results. Returns empty array if
 * the key isn't available or the call fails.
 */
export async function braveSearch(query: string, count: number = 5): Promise<BraveSearchResult[]> {
  const key = getBraveKey()
  if (!key) return []
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&safesearch=off`
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': key,
        'User-Agent': 'ForgeOS-engine/1.0',
      },
    })
    if (!res.ok) return []
    const j: any = await res.json()
    const results = j?.web?.results ?? []
    return results.slice(0, count).map((r: any) => ({
      title: String(r.title || ''),
      url: String(r.url || ''),
      description: String(r.description || ''),
      age: r.age,
    }))
  } catch {
    return []
  }
}

/**
 * Search Brave for a specific part, then return the best result if any.
 * Caller is expected to feed the result to a Flash-Lite judge to decide
 * which URL (if any) is the right product page.
 */
export async function braveSearchForPart(manufacturer: string, partNumber: string): Promise<{
  results: BraveSearchResult[]
  query: string
}> {
  const query = `"${manufacturer}" "${partNumber}" datasheet OR distributor OR catalogue OR product`
  const results = await braveSearch(query, 5)
  return { results, query }
}

/**
 * Flash-Lite judge: given Brave Search results, pick the URL that best
 * matches the requested part. Returns null if no result is a confident
 * match. The picked URL is HEAD-checked before being returned.
 */
export async function judgeBraveResults(opts: {
  manufacturer: string
  part_number: string
  application_context: string
  results: BraveSearchResult[]
  apiKey: string
  model?: string
}): Promise<{ url: string | null; title: string | null; confidence: 'high' | 'medium' | 'low'; reasoning: string } | null> {
  if (opts.results.length === 0) return null
  const model = opts.model ?? 'google/gemini-3.1-flash-lite'
  const resultsBlock = opts.results.map((r, i) =>
    `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${(r.description || '').slice(0, 250)}`
  ).join('\n\n')
  const prompt = `You are picking the best web search result for a real industrial part.

PART:
  manufacturer: ${opts.manufacturer}
  part_number:  ${opts.part_number}
  application:  ${opts.application_context}

SEARCH RESULTS:
${resultsBlock}

Rules:
- Pick the result that BEST shows the EXACT part on a real product / datasheet / distributor page.
- "verified" requires both the manufacturer name AND the exact part number to be mentioned in the snippet OR the URL.
- Generic category pages (e.g. "/products/resistors/" without the SKU) do NOT count as verified.
- If no result is a confident match, return null.

Output JSON only:
{
  "best_result_index": <1-based index or null>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence — why this result, or why none qualify>"
}`

  let res: Response
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 400,
        thinking_level: 'low',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const body: any = await res.json()
  const text = (body?.choices?.[0]?.message?.content ?? '').trim()
  if (!text) return null
  let parsed: any
  try { parsed = JSON.parse(text) } catch { return null }
  const idx = typeof parsed.best_result_index === 'number' ? parsed.best_result_index : null
  if (idx === null) return { url: null, title: null, confidence: 'low', reasoning: String(parsed.reasoning ?? 'no match') }
  if (idx < 1 || idx > opts.results.length) return null
  const confidence = String(parsed.confidence ?? '').toLowerCase() as 'high' | 'medium' | 'low'
  if (!['high', 'medium', 'low'].includes(confidence)) return null
  const winner = opts.results[idx - 1]
  // HEAD-check the picked URL — Brave returned it but the page might still 404
  // (catalogue reorg, dead link from old crawl).
  const ok = await urlResolves(winner.url)
  if (!ok) {
    return { url: null, title: null, confidence: 'low', reasoning: `Picked ${winner.url} but HEAD-check failed (dead link).` }
  }
  return {
    url: winner.url,
    title: winner.title,
    confidence,
    reasoning: String(parsed.reasoning ?? ''),
  }
}
