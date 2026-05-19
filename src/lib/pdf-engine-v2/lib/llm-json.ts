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
import { callFastExtract } from './openrouter-models'

export interface ParseOpts {
  /** Tag used to locate the top-level object (e.g. "modules" for {"modules": [...]}). */
  expectKey?: string
  /** Used in log messages and dump filenames. */
  model?: string
  /** Used in log messages. */
  stage?: string
  /**
   * When true, attempt a Gemini 3.1 Flash-Lite "JSON repair" pass if all local
   * parse strategies fail. The repair model receives the malformed raw string
   * and is instructed to return valid JSON only (no commentary, no fences).
   *
   * Use selectively in stages where transient JSON failures are common
   * (Stage 0.5 brief expansion, PA Stage 3 research synthesis, Stage 1.7
   * multi-emitter). Adds ~£0.0005 per failed-parse occurrence.
   *
   * Default: false (caller must opt in).
   */
  enableLlmRepair?: boolean
}

/**
 * Extract and parse a JSON object from free-form LLM output.
 * Throws with a helpful error message if nothing parses. Also writes the
 * raw response to /tmp/ on final failure so it can be inspected without
 * re-running the pipeline.
 *
 * Now async: when `opts.enableLlmRepair === true`, a final repair pass is
 * attempted via Gemini 3.1 Flash-Lite (Piece 8, 2026-05-13). The repair
 * model receives the malformed raw string and is instructed to return only
 * valid JSON. If repair also fails, the ORIGINAL parse error is thrown
 * (failures are not swallowed). Default behaviour (enableLlmRepair=false)
 * is unchanged: throw on parse failure.
 */
export async function parseJsonFromLlm(raw: string, opts: ParseOpts = {}): Promise<any> {
  const { expectKey, model = 'unknown', stage = 'unknown', enableLlmRepair = false } = opts

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

  // Step 5.5 (2026-05-18): deterministic bracket-imbalance repair.
  //
  // Grok 4.3 (and intermittently other models) emit a stray extra `]` or `}`
  // mid-stream in deeply nested JSON patches. This is not truncation — the
  // JSON is otherwise complete — so the existing LLM-repair fallback can be
  // unreliable on 100+ KB inputs. Try a cheap deterministic strip of stray
  // top-level closing brackets/braces first (free, no tokens, no latency).
  const stripped = stripStrayTopLevelClosers(str)
  if (stripped !== null) {
    try {
      const parsed = JSON.parse(stripped)
      console.warn(
        `[${stage}] ${model} JSON had stray top-level closer(s); deterministic strip SUCCEEDED.`,
      )
      return parsed
    } catch { /* fall through */ }
    // Also retry the first-to-last-brace slice on the stripped string —
    // a stray `]` between two `}` blocks can disrupt step-4 lastIndexOf logic.
    const sFirstBrace = stripped.indexOf('{')
    const sLastBrace = stripped.lastIndexOf('}')
    if (sFirstBrace >= 0 && sLastBrace > sFirstBrace) {
      try {
        const parsed = JSON.parse(stripped.slice(sFirstBrace, sLastBrace + 1))
        console.warn(
          `[${stage}] ${model} JSON had stray top-level closer(s); deterministic strip + slice SUCCEEDED.`,
        )
        return parsed
      } catch { /* fall through */ }
    }
  }

  // Step 6 (Piece 8, 2026-05-13): optional LLM-based repair pass.
  //
  // When the caller has opted in via `enableLlmRepair: true`, dispatch a
  // single Gemini 3.1 Flash-Lite call asking the model to repair the
  // malformed JSON. Use thinkingLevel='minimal' (pure transformation, no
  // reasoning needed) and grounding off (offline transformation). If repair
  // succeeds we return the parsed result. If repair ALSO fails, we throw
  // the original error — the failure is not swallowed.
  const originalErr = new Error('Failed to parse JSON response from LLM')
  if (enableLlmRepair) {
    try {
      const repairSystem =
        'You are a JSON repair tool. The input is malformed JSON. Output ONLY ' +
        'valid JSON matching the intended schema. Do NOT add commentary. Do NOT ' +
        'wrap in markdown fences. Your first character MUST be `{` or `[`.'
      const repaired = await callFastExtract(raw, {
        systemPrompt: repairSystem,
        thinkingLevel: 'minimal',
        groundWithGoogleSearch: false,
        maxTokens: 32_000,
      })
      // Strip any stray fences just in case the repair model ignored instructions.
      const stripped = repaired
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()
      const parsed = JSON.parse(stripped)
      console.warn(
        `[${stage}] ${model} JSON parse failed; Flash-Lite repair fallback SUCCEEDED.`,
      )
      return parsed
    } catch (repairErr) {
      console.error(
        `[${stage}] ${model} Flash-Lite repair fallback FAILED: ` +
        `${(repairErr as Error).message ?? String(repairErr)}`,
      )
      // fall through to dump + throw
    }
  }

  // Step 7: dump and fail
  try {
    const tag = `${stage}-${model.replace(/[^a-z0-9]+/gi, '_')}-${Date.now()}`
    const dumpPath = `/tmp/llm-raw-${tag}.txt`
    writeFileSync(dumpPath, raw)
    console.error(
      `[${stage}] ${model} JSON parse failed. Full raw dumped to ${dumpPath}. ` +
      `First 500 chars: ${raw.slice(0, 500)}`,
    )
  } catch { /* ignore dump failures */ }
  throw originalErr
}

/**
 * Strip stray top-level `]` or `}` characters that appear when overall
 * bracket/brace depth would go negative — i.e. mid-stream extras emitted by
 * the LLM that have no matching opener. Returns the cleaned string, or null
 * if no stray top-level closer was found (i.e. nothing to do).
 *
 * Walks the string respecting string boundaries (so closers inside quoted
 * values are never touched). Tracks depth for `{`/`}` and `[`/`]` separately;
 * a `]` at brace-aware depth 0 with no matching `[` opener is dropped, and
 * vice versa for `}`.
 *
 * Why this exists: Grok 4.3 emits mid-stream stray closers (typically a
 * single extra `]`) in large nested JSON patches. The LLM repair fallback
 * can be unreliable on 100+ KB raw input, so try a cheap deterministic strip
 * first.
 */
function stripStrayTopLevelClosers(str: string): string | null {
  let curlyDepth = 0
  let squareDepth = 0
  let inString = false
  let escaped = false
  const dropIdx: number[] = []
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"' && !escaped) { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') curlyDepth++
    else if (ch === '}') {
      if (curlyDepth === 0) dropIdx.push(i)
      else curlyDepth--
    } else if (ch === '[') squareDepth++
    else if (ch === ']') {
      if (squareDepth === 0) dropIdx.push(i)
      else squareDepth--
    }
  }
  if (dropIdx.length === 0) return null
  // Rebuild without dropped indices. Iterate from end so indices stay valid.
  const chars = str.split('')
  for (let k = dropIdx.length - 1; k >= 0; k--) chars.splice(dropIdx[k], 1)
  return chars.join('')
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
