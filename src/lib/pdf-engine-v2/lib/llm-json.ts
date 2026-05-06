/**
 * @file llm-json.ts — Robust JSON extraction from LLM responses
 *
 * LLMs return JSON in many shapes: bare, markdown-fenced, prefixed with prose,
 * wrapped in <thinking> blocks, padded with trailing commentary, or with
 * reasoning streams interleaved. The parser below tries the cheapest, most
 * common shapes first and falls through to harder fallbacks.
 *
 * Strategy (in order):
 *   1. Strip thinking/reasoning XML blocks
 *   2. Strip markdown code fences
 *   3. JSON.parse the whole thing (happy path — most LLMs when prompt says
 *      "return ONLY JSON")
 *   4. First-brace-to-last-brace slice (handles leading/trailing prose)
 *   5. Keyed-object locator: find the first `{` that precedes a known top-level
 *      key, balance braces forward (string-aware), parse that slice
 *   6. On final failure, dump full raw response to /tmp/ for later inspection
 *      and throw with a compact error
 *
 * The string-aware brace balancer is the key upgrade over previous versions —
 * it correctly handles `{` and `}` characters that appear inside string values
 * (e.g. a module description that quotes JSON-like text).
 */

import { writeFileSync } from 'fs'

export interface ParseOpts {
  /** Tag used to locate the top-level object (e.g. "modules" for {"modules": [...]}). */
  expectKey?: string
  /** Used in log messages and dump filenames. */
  model?: string
  /** Used in log messages. */
  stage?: string
}

/**
 * Extract and parse a JSON object from free-form LLM output.
 * Throws with a helpful error message if nothing parses. Also writes the
 * raw response to /tmp/ on final failure so it can be inspected without
 * re-running the pipeline.
 */
export function parseJsonFromLlm(raw: string, opts: ParseOpts = {}): any {
  const { expectKey, model = 'unknown', stage = 'unknown' } = opts

  if (!raw || typeof raw !== 'string') {
    throw new Error('No LLM content to parse')
  }

  // Step 1: strip thinking / reasoning blocks
  let str = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()

  // Step 2: strip markdown fences (```json ... ``` or ``` ... ```)
  str = str.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  // Step 3: parse-whole
  try {
    return JSON.parse(str)
  } catch { /* fall through */ }

  // Step 4: first-brace-to-last-brace slice
  const firstBrace = str.indexOf('{')
  const lastBrace = str.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(str.slice(firstBrace, lastBrace + 1))
    } catch { /* fall through */ }
  }

  // Step 5: keyed-object locator with string-aware brace balancing.
  //
  // Find the first `{` whose matching close contains `"<expectKey>"` at
  // shallow depth. String-aware means `{` and `}` inside string values are
  // ignored so descriptions containing JSON-like text don't break the count.
  if (expectKey) {
    const needle = `"${expectKey}"`
    const keyIdx = str.indexOf(needle)
    if (keyIdx > 0) {
      // Walk backwards from the key to find the enclosing `{`
      let start = keyIdx
      while (start > 0 && str[start] !== '{') start--
      const end = findMatchingClose(str, start)
      if (end > start) {
        try {
          return JSON.parse(str.slice(start, end + 1))
        } catch { /* fall through */ }
      }
    }
  }

  // Step 6: dump and fail
  try {
    const tag = `${stage}-${model.replace(/[^a-z0-9]+/gi, '_')}-${Date.now()}`
    const dumpPath = `/tmp/llm-raw-${tag}.txt`
    writeFileSync(dumpPath, raw)
    console.error(
      `[${stage}] ${model} JSON parse failed. Full raw dumped to ${dumpPath}. ` +
      `First 500 chars: ${raw.slice(0, 500)}`,
    )
  } catch { /* ignore dump failures */ }
  throw new Error('Failed to parse JSON response from LLM')
}

/**
 * Find the index of the `}` that matches the `{` at `openIdx`, respecting
 * string boundaries so braces inside string values are ignored.
 * Returns -1 if no match found.
 */
function findMatchingClose(str: string, openIdx: number): number {
  if (str[openIdx] !== '{') return -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"' && !escaped) { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}
