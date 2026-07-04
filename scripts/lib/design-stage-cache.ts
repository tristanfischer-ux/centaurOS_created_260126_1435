/**
 * scripts/lib/design-stage-cache.ts — THE FINAL DETERMINISM PIECE (drawer #86 doctrine:
 * "same brief must -> same scorecard").
 *
 * PROVEN NEED (Tristan): v64 vs v67, same brief, produced DIFFERENT designs (30 vs 31 parts,
 * different dims). Root-caused on the recorded artefacts in this repo — `out/fischer-codema-v64/
 * 1-parsed-brief-original.json` and `out/fischer-codema-v67/1-parsed-brief-original.json` DIFFER
 * (different derived-requirement KEY spellings — "ro_permeate_production_m3_per_h" vs
 * "ro_permeate_flow_m3_h") even though `0-original-brief.md` is byte-identical between the two
 * runs. Brief PARSING — an LLM call, `temperature:0, seed:42` per LLM_CONFIG.brief_parser — is
 * NOT actually bit-reproducible across calls (seed support is provider-dependent and not a
 * guarantee on OpenRouter). That divergence then cascades: U6 brief-expansion (`brief-expander.ts`)
 * already caches on `sha1(prompt)`, but the prompt is BUILT FROM the parsed brief, so a re-rolled
 * parse mints a fresh prompt hash and a fresh (and differently-keyed) expansion — v67's
 * `ro_working_pressure_bar` structured metric was lost this way, not because U6 itself re-rolled
 * carelessly.
 *
 * The critic (247494a32), the benchmark-expectation net (284c69c09), and the vision critique
 * (3c4e7d7de) already solved this for their own stages with a per-stage content-hash cache. This
 * module is the SAME pattern, generalised, for the remaining uncached LLM stages that mint the
 * design itself: brief parsing, the Phase-0 plausibility critic + brief rewriter, and the
 * generator/reviewer passes (R1/R4/R4.5, all funnelled through `callLlm` in
 * serial-design-chain-v2.tsx).
 *
 * THE KEY DISCIPLINE (why a fresh brief or a changed prompt can never go stale): the cache key is
 * a hash of the CALLER-SUPPLIED payload, and every call site is required to fold in every value
 * its output is a pure function of — not just the brief text, but the model id and (wherever
 * practical) the actual prompt/template text. Folding the real prompt text in means an edited
 * prompt changes the hash AUTOMATICALLY — there is no separate "prompt version" counter to
 * remember to bump, and therefore nothing to forget to bump.
 *
 * QUALITY-LOOP NUANCE: the self-correcting quality loop re-invokes the WHOLE chain as a child
 * process to fix a defect (`execFileSync('npx', ['tsx', __filename, ...])`, serial-design-chain-
 * v2.tsx ~line 10318). A verbatim replay of a stage whose input is genuinely unchanged between
 * iteration N and N+1 is CORRECT to hit this cache — that IS the doctrine: if the exact same
 * question gets asked twice, the defect the loop is chasing needs a CODE fix, not a re-roll.
 * Conversely, when an iteration's fix directives change what a stage actually receives (e.g. a
 * reviewer prompt gains a new `fixDirectivesBlock`), that text is part of the payload/prompt the
 * caller hashes, so the key changes and the cache misses NATURALLY — no special-casing needed.
 *
 * Store: out/.design-cache/<stage>/<hash>.json (override dir: DESIGN_STAGE_CACHE_DIR).
 * Kill switch: DESIGN_STAGE_CACHE=0 (or false/off/no) — every read/write becomes a no-op and every
 * call falls through to `run()`, exactly like the pre-existing benchmark/critique caches.
 *
 * Usage:
 *   npx tsx scripts/lib/design-stage-cache.ts --selftest
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { createHash } from 'crypto'

// ── kill switch + storage location (BENCHMARK_CACHE_DIR precedent, benchmark-expectation.ts) ──
export function designStageCacheEnabled(): boolean {
  return !['0', 'false', 'off', 'no'].includes(String(process.env.DESIGN_STAGE_CACHE ?? '1').toLowerCase())
}
export function designStageCacheRoot(): string {
  return process.env.DESIGN_STAGE_CACHE_DIR || resolve(process.cwd(), 'out/.design-cache')
}
export function designStageCacheDir(stage: string): string {
  return join(designStageCacheRoot(), stage)
}

/**
 * Canonical JSON: object keys sorted recursively, so the SAME logical payload hashes identically
 * regardless of the order its fields were constructed in (proveCatch: key reordering is a no-op —
 * `{a,b}` and `{b,a}` must produce the same key). Arrays keep their order (order is semantic there).
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v
    if (v instanceof Date) return v.toISOString()
    const obj = v as object
    if (seen.has(obj)) throw new Error('stableStringify: circular reference')
    seen.add(obj)
    if (Array.isArray(v)) return v.map(walk)
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = walk((v as Record<string, unknown>)[k])
    }
    return out
  }
  return JSON.stringify(walk(value))
}

/** The exact-input-payload hash. Every caller must fold in everything its output is a pure
 *  function of (brief text + upstream stage outputs + model id + — wherever practical — the
 *  actual prompt/template text, so a prompt edit changes the key with no separate version to bump). */
export function designStageCacheKey(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 32)
}

export interface DesignStageCacheRecord<T> {
  key: string
  stage: string
  cached_at: string
  value: T
}

/** Read-only; never throws. A corrupt/missing entry is a miss, not a fatal error. */
export function readDesignStageCache<T>(stage: string, key: string): T | null {
  if (!designStageCacheEnabled()) return null
  const p = join(designStageCacheDir(stage), `${key}.json`)
  if (!existsSync(p)) return null
  try {
    const rec = JSON.parse(readFileSync(p, 'utf8')) as DesignStageCacheRecord<T>
    return rec && Object.prototype.hasOwnProperty.call(rec, 'value') ? rec.value : null
  } catch {
    return null
  }
}

/** Write-through; best-effort — a cache-write failure must never break the run. */
export function writeDesignStageCache<T>(stage: string, key: string, value: T): void {
  if (!designStageCacheEnabled()) return
  try {
    const dir = designStageCacheDir(stage)
    mkdirSync(dir, { recursive: true })
    const rec: DesignStageCacheRecord<T> = { key, stage, cached_at: new Date().toISOString(), value }
    writeFileSync(join(dir, `${key}.json`), JSON.stringify(rec, null, 2))
  } catch { /* non-fatal — the run proceeds with the freshly-generated value either way */ }
}

export interface CachedDesignStageResult<T> { value: T; cacheHit: boolean; key: string }

/**
 * The call-site helper. Given a STAGE name + the EXACT input payload, check the cache before
 * calling `run()` — a hit means the LLM is never invoked. `isValid` optionally rejects a value
 * (cached or freshly produced) before it is trusted/cached (e.g. `{ok:false}` error shapes) — a
 * rejected value is never written to the cache and never returned as a "hit".
 */
export async function cachedDesignStage<T>(opts: {
  stage: string
  payload: unknown
  run: () => Promise<T>
  isValid?: (value: T) => boolean
}): Promise<CachedDesignStageResult<T>> {
  const key = designStageCacheKey(opts.payload)
  const cached = readDesignStageCache<T>(opts.stage, key)
  if (cached !== null && (!opts.isValid || opts.isValid(cached))) {
    return { value: cached, cacheHit: true, key }
  }
  const value = await opts.run()
  if (!opts.isValid || opts.isValid(value)) {
    writeDesignStageCache(opts.stage, key, value)
  }
  return { value, cacheHit: false, key }
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────
function _selftestPure(): number {
  let bad = 0
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.log(`FAIL: ${msg}`); bad++ } }

  // hash stability under key reordering (proveCatch)
  const k1 = designStageCacheKey({ a: 1, b: { c: 2, d: 3 } })
  const k2 = designStageCacheKey({ b: { d: 3, c: 2 }, a: 1 })
  ok(k1 === k2, 'designStageCacheKey must be stable under object-key reordering')

  // a changed value anywhere in the payload must change the key
  const k3 = designStageCacheKey({ a: 1, b: { c: 2, d: 4 } })
  ok(k1 !== k3, 'a changed nested value must change the key')

  // array ORDER is semantic and must still distinguish payloads
  const k4 = designStageCacheKey({ items: [1, 2, 3] })
  const k5 = designStageCacheKey({ items: [3, 2, 1] })
  ok(k4 !== k5, 'array element order must be part of the key (order is semantic)')

  // determinism: same payload, independently constructed, same key
  const k6 = designStageCacheKey({ x: 'brief text', model: 'gemini-3.1-pro-preview' })
  const k7 = designStageCacheKey({ model: 'gemini-3.1-pro-preview', x: 'brief text' })
  ok(k6 === k7, 'designStageCacheKey must be deterministic (same inputs -> same key)')

  console.log(bad === 0 ? 'design-stage-cache pure selftest: OK' : `design-stage-cache pure selftest: ${bad} FAIL`)
  return bad
}

async function _selftestCache(): Promise<number> {
  let bad = 0
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.log(`FAIL: ${msg}`); bad++ } }
  const { mkdtempSync } = await import('fs')
  const { tmpdir } = await import('os')
  const dir = mkdtempSync(join(tmpdir(), 'design-stage-cache-selftest-'))
  const prevDir = process.env.DESIGN_STAGE_CACHE_DIR
  const prevOn = process.env.DESIGN_STAGE_CACHE
  process.env.DESIGN_STAGE_CACHE_DIR = dir
  delete process.env.DESIGN_STAGE_CACHE
  try {
    // 1. read/write round-trip
    const key = designStageCacheKey({ brief: 'a test brief', model: 'test-model' })
    ok(readDesignStageCache('unit-test-stage', key) === null, 'an unseeded key must read as a miss')
    writeDesignStageCache('unit-test-stage', key, { hello: 'world', n: 42 })
    const roundtrip = readDesignStageCache<{ hello: string; n: number }>('unit-test-stage', key)
    ok(!!roundtrip && roundtrip.hello === 'world' && roundtrip.n === 42, 'a written entry must read back verbatim')

    // 2. cachedDesignStage: a HIT must never invoke run() (proveCatch — the raising stub)
    const raisingStub = async (): Promise<{ hello: string; n: number }> => {
      throw new Error('run() was called on a cache HIT — this must never happen')
    }
    const hitResult = await cachedDesignStage({ stage: 'unit-test-stage', payload: { brief: 'a test brief', model: 'test-model' }, run: raisingStub })
    ok(hitResult.cacheHit === true, 'cachedDesignStage must report a hit when the entry exists')
    ok(hitResult.value.hello === 'world', 'cachedDesignStage must return the cached value verbatim on a hit')

    // 3. a MISS calls run() exactly once and writes through on success
    let calls = 0
    const countingRun = async () => { calls++; return { hello: 'fresh', n: 7 } }
    const missResult = await cachedDesignStage({ stage: 'unit-test-stage', payload: { brief: 'a DIFFERENT brief', model: 'test-model' }, run: countingRun })
    ok(missResult.cacheHit === false && calls === 1, 'a genuine miss must call run() exactly once')
    const secondCall = await cachedDesignStage({ stage: 'unit-test-stage', payload: { brief: 'a DIFFERENT brief', model: 'test-model' }, run: countingRun })
    ok(secondCall.cacheHit === true && calls === 1, 'the SAME payload on a second call must hit — run() must not be called again')

    // 4. prompt-version bump misses the cache: folding the prompt/template text into the payload
    //    means an edited prompt (simulated here as a changed `prompt` field, holding brief+model
    //    fixed) is indistinguishable from any other payload change — it MUST miss.
    let promptCalls = 0
    const promptRun = async () => { promptCalls++; return { text: 'v1 output' } }
    const v1 = await cachedDesignStage({ stage: 'unit-test-stage', payload: { brief: 'x', model: 'm', prompt: 'PROMPT v1' }, run: promptRun })
    ok(v1.cacheHit === false && promptCalls === 1, 'first call with prompt v1 must miss and call run()')
    const v1Again = await cachedDesignStage({ stage: 'unit-test-stage', payload: { brief: 'x', model: 'm', prompt: 'PROMPT v1' }, run: promptRun })
    ok(v1Again.cacheHit === true && promptCalls === 1, 'same prompt text must hit — no re-roll')
    const v2 = await cachedDesignStage({ stage: 'unit-test-stage', payload: { brief: 'x', model: 'm', prompt: 'PROMPT v2 (bumped)' }, run: promptRun })
    ok(v2.cacheHit === false && promptCalls === 2, 'a bumped prompt (changed prompt text, same brief+model) must MISS the cache')

    // 5. isValid rejects a bad value: never cached, never returned as a hit
    const invalidRun = async () => ({ ok: false, data: null })
    const rejected = await cachedDesignStage({
      stage: 'unit-test-stage', payload: { brief: 'invalid-case' }, run: invalidRun,
      isValid: (v: any) => v?.ok === true,
    })
    ok(rejected.cacheHit === false, 'an invalid fresh value must not be reported as a hit')
    const rejectedAgain = await cachedDesignStage({
      stage: 'unit-test-stage', payload: { brief: 'invalid-case' }, run: invalidRun,
      isValid: (v: any) => v?.ok === true,
    })
    ok(rejectedAgain.cacheHit === false, 'an invalid value must never have been written — the next call must miss again too')

    // 6. kill switch: DESIGN_STAGE_CACHE=0 disables read AND write
    process.env.DESIGN_STAGE_CACHE = '0'
    let killSwitchCalls = 0
    const killSwitchRun = async () => { killSwitchCalls++; return { v: killSwitchCalls } }
    const killPayload = { brief: 'kill-switch-case' }
    await cachedDesignStage({ stage: 'unit-test-stage', payload: killPayload, run: killSwitchRun })
    const killResult2 = await cachedDesignStage({ stage: 'unit-test-stage', payload: killPayload, run: killSwitchRun })
    ok(killSwitchCalls === 2, 'DESIGN_STAGE_CACHE=0 must call run() every time (no caching at all)')
    ok(killResult2.cacheHit === false, 'DESIGN_STAGE_CACHE=0 must never report a hit')
    delete process.env.DESIGN_STAGE_CACHE
  } finally {
    if (prevDir === undefined) delete process.env.DESIGN_STAGE_CACHE_DIR; else process.env.DESIGN_STAGE_CACHE_DIR = prevDir
    if (prevOn === undefined) delete process.env.DESIGN_STAGE_CACHE; else process.env.DESIGN_STAGE_CACHE = prevOn
  }
  console.log(bad === 0 ? 'design-stage-cache roundtrip selftest: OK' : `design-stage-cache roundtrip selftest: ${bad} FAIL`)
  return bad
}

if (process.argv.includes('--selftest')) {
  const bad1 = _selftestPure()
  _selftestCache().then(bad2 => { if (bad1 + bad2 > 0) process.exit(1) }).catch(e => { console.error(e); process.exit(1) })
}
