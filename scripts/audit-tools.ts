/**
 * scripts/audit-tools.ts
 *
 * UNIVERSAL TOOL AUDIT — applies the tool-generator's "ASSUME EVERY TOOL IS
 * BROKEN UNTIL ITS OWN SELF-TEST PROVES OTHERWISE" discipline (Tristan
 * 2026-06-14) to ALL 182 already-registered engineering tools, which today have
 * NO correctness audit — only a smoke test (harvest-tool-io-runtime.py runs each
 * on a minimal seed). The smoke test proves a tool does not crash on a trivial
 * payload; it does NOT prove the tool computes a CORRECT number on a REALISTIC
 * engineering input. This audit closes that gap and leaves a durable record.
 *
 * WHAT IT DOES, per registered tool:
 *   (1) GENERATE ≥2 REALISTIC test cases via the SAME strong reasoner the
 *       on-the-fly tool-generator + bootstrap-tool-plan use
 *       (google/gemini-3.1-pro-preview, temp 0, the harvestPlanViaLLM fetch
 *       idiom). Each case = {inputs:{realistic physical values for THIS tool},
 *       expect:{output_field:[min,max] plausible range}} derived from the tool's
 *       name/purpose + its REAL input_keys/output_keys (tool-io-raw.json). The
 *       point is REALISTIC engineering inputs, not a minimal seed.
 *   (2) RUN the tool's python on each case STANDALONE (stdin JSON → stdout JSON
 *       via the repo .venv — the EXACT spawnSync idiom dynamic-tool.ts /
 *       absorption-column-htu-ntu.ts use).
 *   (3) VERDICT — REUSING tool-generator.ts::runSelfTestCase gate logic verbatim:
 *       PASS = every case exits 0, output parses (no `error`), every expected
 *       output key present + finite + within [min,max]. Else FAIL with the
 *       precise reason (crash exit N / missing key / NaN / out-of-range value).
 *
 * The reasoner generates the test for the tool — it does NOT see or score the
 * tool's source. A tool is GUILTY until a realistic self-test proves it innocent.
 * This is exactly the gate the tool-generator applies to a NEWLY generated tool,
 * turned around and pointed at the EXISTING catalogue.
 *
 * QUOTA-SAFE: concurrency cap 4 (one reasoner call per tool). The OpenRouter
 * calls SHARE rate limits with a chain run that may be in progress — on a 429 we
 * back off (exponential) AND permanently drop the concurrency cap to 2.
 *
 * OUTPUT (the durable RECORD Tristan asked for):
 *   - scripts/lib/orchestrator/tool-audit-record.json — per tool {tool_id,
 *     verdict, cases_run, cases_passed, failure_reason, py_file, audited_at_note}.
 *   - docs/TOOL-AUDIT.md — human-readable: total / passed / failed counts + a
 *     TABLE of every FAILED tool with its reason, grouped by failure type.
 *
 * DOES NOT fix any failing tool (separate pass) and DOES NOT commit.
 *
 * Run: npx tsx scripts/audit-tools.ts            (all 182 tools, ~$10-12, one-off)
 *      npx tsx scripts/audit-tools.ts --limit=8  (smoke a handful first)
 *      npx tsx scripts/audit-tools.ts --only=reactor:cstr-pfr-sizing,fluids:pipe-sizing
 *      npx tsx scripts/audit-tools.ts --concurrency=2
 *
 * British spelling throughout.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import './lib/orchestrator/register-all'
import { listTools } from './lib/orchestrator/registry'
// REUSE the tool-generator's gate logic verbatim — a generated tool and an
// existing tool are judged by the SAME self-test rule.
import { runSelfTestCase, type SelfTestCase, type SelfTestCaseResult } from './lib/orchestrator/generic/tool-generator'

// ── Paths ─────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ORCH = join(REPO, 'scripts', 'lib', 'orchestrator')
const PY_DIR = join(ORCH, 'tools', 'python')
const RAW_IO_PATH = join(ORCH, 'tool-io-raw.json')
const RECORD_PATH = join(ORCH, 'tool-audit-record.json')
const DOC_PATH = join(REPO, 'docs', 'TOOL-AUDIT.md')
// Same repo .venv the static wrappers + the self-test gate use (NOT system python).
const VENV_PY = join(REPO, '.venv', 'bin', 'python3')

// ── .env.local self-load (council-scorer / bootstrap-tool-plan.test idiom) ─────

const envLocal = join(REPO, '.env.local')
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

// The SAME strong reasoner the tool-generator + bootstrap-tool-plan use — temp 0
// for determinism. It writes the REALISTIC test cases; it never sees the tool's
// source, so it cannot "grade to the code".
const REASONER_MODEL = 'google/gemini-3.1-pro-preview'
const MAX_OUTPUT_TOKENS = 150_000 // repo rule: 150_000 everywhere in pdf-engine-v2
const AUDIT_NOTE = 'audit-tools.ts@v1 — realistic-input correctness audit (not a smoke test)'

// ── CLI ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
function argVal(name: string): string | null {
  const pref = `--${name}=`
  const hit = argv.find(a => a.startsWith(pref))
  return hit ? hit.slice(pref.length) : null
}
const LIMIT = argVal('limit') ? Math.max(1, parseInt(argVal('limit')!, 10)) : null
const ONLY = argVal('only') ? new Set(argVal('only')!.split(',').map(s => s.trim()).filter(Boolean)) : null
let CONCURRENCY = argVal('concurrency') ? Math.max(1, parseInt(argVal('concurrency')!, 10)) : 4
const MIN_CASES = 2

// ── Verdict record ───────────────────────────────────────────────────────────

type Verdict = 'PASS' | 'FAIL' | 'SKIP-NON-PYTHON'
type FailureType =
  | 'crash'           // python exited non-zero (exit 2 input-parse / exit 3 runtime / signal / crash)
  | 'missing-output'  // a required output key absent
  | 'nan'             // a required output present but non-finite (NaN / Infinity / non-number)
  | 'out-of-range'    // a value computed but outside the realistic [min,max]
  | 'tool-error'      // tool wrote {"error": "..."} (validation rejected the input it should accept)
  | 'no-realistic-inputs' // the reasoner could not produce a usable test (LLM/parse failure)
  | 'bad-stdout'      // exit 0 but stdout was not a JSON object
  | null

interface ToolAuditRow {
  tool_id: string
  verdict: Verdict
  cases_run: number
  cases_passed: number
  failure_type: FailureType
  failure_reason: string | null
  py_file: string
  llm_cost_usd: number | null
  audited_at_note: string
}

// ── Raw I/O manifest (REAL invoke field names) ───────────────────────────────

interface RawEntry { input_keys?: string[]; output_keys?: string[]; py_file?: string; io_source?: string }
const rawIo: Record<string, RawEntry> = JSON.parse(readFileSync(RAW_IO_PATH, 'utf8'))

// ── Reasoner: generate realistic test cases for ONE tool ─────────────────────

function buildTestGenPrompt(
  toolId: string,
  name: string,
  domain: string,
  inputKeys: string[],
  outputKeys: string[],
): string {
  const sub = toolId.includes(':') ? toolId.split(':')[1].replace(/-/g, ' ') : toolId
  return (
    `You are a senior process/mechanical/electrical engineer writing REALISTIC ` +
    `SELF-TEST CASES for an existing deterministic engineering sizing tool. You will ` +
    `NOT see the tool's code — you reason ONLY from its name, purpose, and its REAL ` +
    `input/output field names. Your job: pick GENUINELY REALISTIC physical inputs for ` +
    `this specific tool (a real operating point an engineer would actually size for — ` +
    `NOT a minimal/trivial seed of all-1s), and for each REQUIRED output field give the ` +
    `PLAUSIBLE [min, max] numeric range a CORRECT tool MUST land in for those inputs.\n\n` +
    `TOOL ID: ${toolId}\n` +
    `TOOL NAME / PURPOSE: ${name} — ${sub} (${domain} domain)\n\n` +
    `INPUT FIELDS the tool reads from the JSON payload (payload.get("<name>")). Provide a ` +
    `realistic value for EVERY field that is needed to compute the duty; you may omit a ` +
    `field only if it is clearly an optional override (the tool will use a sensible ` +
    `default):\n${inputKeys.map(k => `  - ${k}`).join('\n') || '  (none declared — provide an empty inputs object)'}\n\n` +
    `OUTPUT FIELDS the tool returns. For each one that is a COMPUTED NUMBER, give a ` +
    `plausible [min, max] range. Skip output fields that are not numbers (e.g. a name, a ` +
    `mode string, a data_sources list, a boolean check flag, a worked-calc list):\n` +
    `${outputKeys.map(k => `  - ${k}`).join('\n')}\n\n` +
    `RULES:\n` +
    `1. Produce AT LEAST ${MIN_CASES} test cases covering TWO genuinely different ` +
    `operating points (e.g. a small duty and a large duty, or two different regimes). ` +
    `Realistic engineering values with correct units implied by the field name ` +
    `(e.g. *_kg_h is a mass flow in kg/h, *_barg is gauge pressure in bar, *_m3_h is a ` +
    `volumetric flow in m3/h, *_c is degrees Celsius, *_kw is kilowatts).\n` +
    `2. Make the "expect" ranges ENGINEERING-PLAUSIBLE but not trivially wide — a factor ` +
    `of ~2-10 between min and max is typical. They are the proof the tool is correct, so ` +
    `do not make them so wide that any number passes, and do not make them so tight that a ` +
    `correct-but-rounded value fails. If you are UNSURE of the exact magnitude of an ` +
    `output, give a generous-but-bounded range (e.g. spanning one order of magnitude) ` +
    `rather than omitting it — at least ONE numeric output MUST be range-checked per case.\n` +
    `3. Use ONLY the field names listed above (exact spelling). Do NOT invent fields.\n` +
    `4. For any unit/string/categorical input (e.g. material, fluid, mode, orientation, ` +
    `lift_gas, packing), use a realistic in-domain value the tool will recognise ` +
    `(e.g. material:"carbon_steel" or "SS316", fluid:"water", mode:"absorber").\n\n` +
    `Return STRICT JSON ONLY (no markdown fence, no commentary), this exact shape:\n` +
    `{\n` +
    `  "self_tests": [\n` +
    `    {"inputs": {"<field>": <number-or-string>, ...}, "expect": {"<numeric_output_field>": [<min>, <max>], ...}, "note": "<the operating point this exercises>"},\n` +
    `    {"inputs": {...}, "expect": {...}, "note": "..."}\n` +
    `  ]\n` +
    `}`
  )
}

interface GenOutcome {
  cases: SelfTestCase[] | null
  costUsd: number | null
  error: string | null
  rateLimited: boolean
}

/** ONE OpenRouter call → parse {self_tests:[…]}. Mirrors
 *  bootstrap-tool-plan.ts::harvestPlanViaLLM (auth headers, temp 0, usage.include,
 *  fence-strip, first/last-brace slice). Surfaces rateLimited on HTTP 429. */
async function generateCasesViaLLM(prompt: string): Promise<GenOutcome> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { cases: null, costUsd: null, error: 'OPENROUTER_API_KEY not set', rateLimited: false }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS universal tool audit',
      },
      body: JSON.stringify({
        model: REASONER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (res.status === 429) {
      return { cases: null, costUsd: null, error: `OpenRouter HTTP 429 (rate limited): ${(await res.text()).slice(0, 200)}`, rateLimited: true }
    }
    if (!res.ok) {
      return { cases: null, costUsd: null, error: `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, rateLimited: false }
    }
    const j: any = await res.json()
    const costUsd = typeof j?.usage?.cost === 'number' ? j.usage.cost : null
    const rawContent = j?.choices?.[0]?.message?.content
    if (!rawContent || typeof rawContent !== 'string') {
      return { cases: null, costUsd, error: `empty completion (finish_reason=${j?.choices?.[0]?.finish_reason ?? '?'})`, rateLimited: false }
    }
    let cleaned = rawContent.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    const a = cleaned.indexOf('{')
    const b = cleaned.lastIndexOf('}')
    if (a === -1 || b === -1) return { cases: null, costUsd, error: 'no JSON object in completion', rateLimited: false }
    let parsed: any
    try {
      parsed = JSON.parse(cleaned.slice(a, b + 1))
    } catch (err) {
      return { cases: null, costUsd, error: `JSON parse failed: ${(err as Error).message}`, rateLimited: false }
    }
    const arr = Array.isArray(parsed?.self_tests) ? parsed.self_tests : []
    const cases: SelfTestCase[] = arr
      .filter((c: any) => c && typeof c === 'object' && c.inputs && typeof c.inputs === 'object')
      .map((c: any) => ({
        inputs: c.inputs as Record<string, number | string | boolean>,
        expect: (c.expect && typeof c.expect === 'object') ? c.expect : {},
        note: typeof c.note === 'string' ? c.note : undefined,
      }))
    if (cases.length === 0) return { cases: null, costUsd, error: `completion had 0 usable self-tests`, rateLimited: false }
    return { cases, costUsd, error: null, rateLimited: false }
  } catch (err) {
    return { cases: null, costUsd: null, error: `OpenRouter call failed: ${(err as Error).message}`, rateLimited: false }
  }
}

// ── Verdict classification from a failing case reason ────────────────────────

/** Map a runSelfTestCase failure reason string to a coarse failure type. The
 *  reason strings come from tool-generator.ts::runSelfTestCase. */
function classifyFailure(result: SelfTestCaseResult): FailureType {
  const r = result.reason
  if (result.exit_code !== 0 && result.exit_code !== null) return 'crash'
  if (result.exit_code === null) return 'crash' // signal / spawn failure (e.g. timeout)
  if (/tool returned error field/.test(r)) return 'tool-error'
  if (/is MISSING/.test(r)) return 'missing-output'
  if (/not a finite number|is absent or non-finite/.test(r)) return 'nan'
  if (/OUT OF RANGE/.test(r)) return 'out-of-range'
  if (/not valid JSON|JSON is not an object/.test(r)) return 'bad-stdout'
  if (/self-test range .* is malformed/.test(r)) return 'no-realistic-inputs' // the LLM gave an unusable range
  return 'crash'
}

/**
 * runSelfTestCase reports a non-zero exit only as "non-zero exit N" + stderr —
 * but a contract-conformant tool writes its ValueError message to STDOUT (as
 * {"error": "..."}) and exits 3, so the actionable message is lost from the gate
 * reason. For a FAILING case, re-run the python ONCE to recover the stdout error
 * text (and any stderr traceback for a true crash) so the record is diagnosable.
 * Returns '' when there is nothing useful to add. Cheap (the python tools run in
 * well under a second) and only invoked for the minority of failing tools.
 */
function captureCrashDetail(scriptPath: string, inputs: SelfTestCase['inputs']): string {
  try {
    const proc = spawnSync(VENV_PY, [scriptPath], {
      input: JSON.stringify(inputs), encoding: 'utf-8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    })
    // Contract pattern: error written to stdout as {"error": "..."}.
    try {
      const out = JSON.parse(proc.stdout) as { error?: unknown }
      if (out && typeof out.error === 'string' && out.error) return out.error.slice(0, 240)
    } catch { /* stdout not JSON — fall through to stderr */ }
    if (proc.stderr && proc.stderr.trim()) {
      // Last non-empty stderr line is usually the exception summary.
      const errLine = proc.stderr.trim().split('\n').filter(Boolean).pop() ?? ''
      return errLine.slice(0, 240)
    }
  } catch { /* spawn failure — nothing to add */ }
  return ''
}

/** Run the tool ONCE for a case and return its parsed stdout object (the tool's
 *  ACTUAL output), or null if it crashed / errored / didn't emit a JSON object.
 *  Used to discover which output keys are genuinely NUMERIC before the gate runs,
 *  so the reasoner mis-targeting a non-numeric field (e.g. range-checking a list
 *  like `materials_failed: []`) does NOT cause a false-FAIL. Deterministic — the
 *  gate re-runs the same script + inputs and gets the same output. */
function runForOutput(scriptPath: string, inputs: SelfTestCase['inputs']): Record<string, unknown> | null {
  try {
    const proc = spawnSync(VENV_PY, [scriptPath], {
      input: JSON.stringify(inputs), encoding: 'utf-8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    })
    if (proc.status !== 0) return null
    const out = JSON.parse(proc.stdout) as Record<string, unknown>
    if (typeof out !== 'object' || out === null || Array.isArray(out)) return null
    if (typeof (out as any).error === 'string' && (out as any).error) return null
    return out
  } catch {
    return null
  }
}

/**
 * Clean a test case's `expect` map so the gate only range-checks fields the tool
 * ACTUALLY emits as a finite number. Drops any expected key the tool emits as a
 * non-number (a list/string/boolean — e.g. data_sources, mode, *_ok flags,
 * materials_failed:[]). This is NOT a leniency hole: a tool that emits a
 * genuinely-numeric field as NaN/Infinity, or omits a numeric field entirely,
 * STILL fails (the key stays in `expect` because it isn't present-and-non-numeric
 * — an absent key is kept so the gate flags it MISSING; a NaN is kept because NaN
 * is typeof 'number'). Only a key whose emitted value is a real non-numeric TYPE
 * is dropped, which is exactly the reasoner-mis-targeting artefact we must not
 * penalise. Returns the cleaned case + the cleaned required-key list (the numeric
 * subset of the originally-ranged keys).
 */
function cleanCaseAgainstOutput(
  tc: SelfTestCase,
  output: Record<string, unknown> | null,
): { cleaned: SelfTestCase; numericRequired: string[]; droppedNonNumeric: string[] } {
  // No output to inspect (the case will crash/error in the gate too) → leave the
  // case as-is so the gate reports the crash/error faithfully.
  if (!output) {
    return { cleaned: tc, numericRequired: Object.keys(tc.expect ?? {}), droppedNonNumeric: [] }
  }
  // Drop a key ONLY when the tool emits it as a present, non-number TYPE
  // (list/string/boolean). Keep: absent keys (gate → MISSING), and number-typed
  // values incl. NaN/Infinity (gate → non-finite). typeof null === 'object', so a
  // null value is treated as non-numeric-present and dropped too (a tool that
  // emits null for a field the reasoner thought numeric is the same artefact).
  const isPresentNonNumber = (k: string): boolean => k in output && typeof output[k] !== 'number'
  const cleanedExpect: Record<string, [number, number]> = {}
  const dropped: string[] = []
  for (const [k, range] of Object.entries(tc.expect ?? {})) {
    if (isPresentNonNumber(k)) { dropped.push(k); continue } // tool emits a non-number here → not a numeric output
    cleanedExpect[k] = range
  }
  const numericRequired = Object.keys(cleanedExpect)
  return { cleaned: { ...tc, expect: cleanedExpect }, numericRequired, droppedNonNumeric: dropped }
}

// ── Audit ONE tool ───────────────────────────────────────────────────────────

interface AuditOneResult { row: ToolAuditRow; rateLimited: boolean }

async function auditTool(toolId: string, name: string, domain: string): Promise<AuditOneResult> {
  const io = rawIo[toolId] ?? {}
  const pyFile = io.py_file ?? '(unknown)'
  const inputKeys = io.input_keys ?? []
  const outputKeys = io.output_keys ?? []

  // Pure-TS tools have no standalone python script — the python self-test
  // contract does not apply. Record them honestly as SKIP-NON-PYTHON so they
  // neither pass nor pollute the FAIL count.
  if (pyFile === '(pure-ts)' || io.io_source === 'ts-source-parse') {
    return {
      rateLimited: false,
      row: {
        tool_id: toolId, verdict: 'SKIP-NON-PYTHON', cases_run: 0, cases_passed: 0,
        failure_type: null, failure_reason: 'pure-TS tool — no standalone python script to self-test',
        py_file: pyFile, llm_cost_usd: null, audited_at_note: AUDIT_NOTE,
      },
    }
  }

  const scriptPath = resolve(PY_DIR, pyFile)
  if (!existsSync(scriptPath)) {
    return {
      rateLimited: false,
      row: {
        tool_id: toolId, verdict: 'FAIL', cases_run: 0, cases_passed: 0,
        failure_type: 'crash', failure_reason: `python script not found at ${scriptPath}`,
        py_file: pyFile, llm_cost_usd: null, audited_at_note: AUDIT_NOTE,
      },
    }
  }

  // (1) GENERATE realistic test cases (one reasoner call).
  const prompt = buildTestGenPrompt(toolId, name, domain, inputKeys, outputKeys)
  const gen = await generateCasesViaLLM(prompt)
  if (!gen.cases) {
    return {
      rateLimited: gen.rateLimited,
      row: {
        tool_id: toolId, verdict: 'FAIL', cases_run: 0, cases_passed: 0,
        failure_type: 'no-realistic-inputs',
        failure_reason: `could not generate realistic test cases: ${gen.error}`,
        py_file: pyFile, llm_cost_usd: gen.costUsd, audited_at_note: AUDIT_NOTE,
      },
    }
  }
  const cases = gen.cases

  // The gate validates EVERY required output key is present + finite, AND every
  // expected field is within [min,max]. We pass the tool's REAL output keys (raw
  // manifest) as the required set — but only the NUMERIC ones can be asserted
  // finite, and the LLM was told to range-check only numeric outputs. A tool
  // whose output_keys include non-numeric fields (data_sources, mode, *_ok flags,
  // worked) would false-FAIL the "required finite" check. So: requiredOutputKeys
  // = the keys the LLM chose to range-check (its judgement of which outputs are
  // the load-bearing computed numbers), UNION nothing else. This keeps the gate
  // faithful to the tool-generator contract (assert the proven numbers) without
  // failing a tool for emitting a legitimate non-numeric field.
  //
  // BUT first defuse the reasoner-mis-targeting artefact: the reasoner sometimes
  // range-checks a NON-numeric output (e.g. `materials_failed: []`, a `*_ok`
  // boolean, a `mode` string). Treating that as a required-finite output would
  // FALSE-FAIL a perfectly correct tool. So per case we run the tool once, learn
  // which expected keys it emits as a real non-number, and DROP only those from
  // the case's expect + required set. Everything load-bearing (crash, error-field,
  // a numeric output that is NaN/missing/out-of-range) is still asserted.
  const caseResults: SelfTestCaseResult[] = []
  const cleanedCases: SelfTestCase[] = []
  const droppedAll = new Set<string>()
  for (const tc of cases) {
    const output = runForOutput(scriptPath, tc.inputs)
    const { cleaned, numericRequired, droppedNonNumeric } = cleanCaseAgainstOutput(tc, output)
    for (const k of droppedNonNumeric) droppedAll.add(k)
    cleanedCases.push(cleaned)
    // (2)+(3) RUN through the python + apply the REUSED gate on the cleaned case.
    caseResults.push(runSelfTestCase(scriptPath, cleaned, numericRequired))
  }
  const passedCount = caseResults.filter(c => c.passed).length
  const allPassed = caseResults.length > 0 && caseResults.every(c => c.passed)

  if (allPassed) {
    return {
      rateLimited: false,
      row: {
        tool_id: toolId, verdict: 'PASS', cases_run: caseResults.length, cases_passed: passedCount,
        failure_type: null, failure_reason: null, py_file: pyFile,
        llm_cost_usd: gen.costUsd, audited_at_note: AUDIT_NOTE,
      },
    }
  }

  // FAIL — report the FIRST failing case's precise reason + classify it. (The
  // first failure is the most actionable; the count tells how many cases failed.)
  const firstFail = caseResults.find(c => !c.passed)!
  const failIdx = caseResults.indexOf(firstFail)
  const ftype = classifyFailure(firstFail)
  const noteForCase = cases[failIdx]?.note ? ` [case: ${cases[failIdx].note}]` : ''
  const failedN = caseResults.length - passedCount
  // For a crash (the gate lost the stdout {"error":...} message), recover it so
  // the record distinguishes a real defect from a correct domain-rejection
  // (e.g. a tool that raised ValueError on a physically-infeasible reasoner input).
  let reason = `${failedN}/${caseResults.length} case(s) failed; first: ${firstFail.reason}${noteForCase}`
  if ((ftype === 'crash' || ftype === 'bad-stdout') && !/:/.test(firstFail.reason.replace(/^non-zero exit \d+/, ''))) {
    const detail = captureCrashDetail(scriptPath, cases[failIdx].inputs)
    if (detail) reason += ` | tool message: ${detail}`
  }
  return {
    rateLimited: false,
    row: {
      tool_id: toolId, verdict: 'FAIL', cases_run: caseResults.length, cases_passed: passedCount,
      failure_type: ftype, failure_reason: reason,
      py_file: pyFile, llm_cost_usd: gen.costUsd, audited_at_note: AUDIT_NOTE,
    },
  }
}

// ── Concurrency runner with 429 back-off ─────────────────────────────────────

interface Job { toolId: string; name: string; domain: string }

async function runAll(jobs: Job[]): Promise<ToolAuditRow[]> {
  const rows: ToolAuditRow[] = []
  const total = jobs.length
  const startedAt = Date.now()
  let cursor = 0
  let totalCost = 0
  let done = 0

  // Shared, mutable concurrency cap. On the FIRST 429 it drops to 2 for the rest
  // of the run; any worker whose launch index is now >= the cap retires at its
  // next loop boundary (the low-index workers keep draining the queue). This is
  // the quota-safe back-off Tristan asked for: the audit shares OpenRouter limits
  // with an in-progress chain run.
  let concurrencyCap = CONCURRENCY

  async function worker(myWorkerIndex: number): Promise<void> {
    for (;;) {
      // Retire surplus workers after a mid-run cap drop.
      if (myWorkerIndex >= concurrencyCap) return
      const myIdx = cursor++
      if (myIdx >= jobs.length) return
      const job = jobs[myIdx]

      // Per-tool retry on a 429: exponential back-off (4s,8s,16s,32s,60s) up to 4
      // attempts; the FIRST 429 anywhere drops the shared cap to 2.
      let result: AuditOneResult = await auditTool(job.toolId, job.name, job.domain)
      let attempt = 0
      while (result.rateLimited && attempt < 4) {
        attempt++
        if (concurrencyCap > 2) {
          concurrencyCap = 2
          console.error(`[audit-tools] HIT 429 — backing off + dropping concurrency to ${concurrencyCap} (shares OpenRouter limits with a chain run).`)
        }
        const waitMs = Math.min(60_000, 2_000 * 2 ** attempt)
        console.error(`[audit-tools] ${job.toolId}: 429 — waiting ${(waitMs / 1000).toFixed(0)}s then retry (attempt ${attempt}/4).`)
        await new Promise(r => setTimeout(r, waitMs))
        result = await auditTool(job.toolId, job.name, job.domain)
      }
      if (result.rateLimited) {
        console.error(`[audit-tools] ${job.toolId}: still 429 after ${attempt} attempts — recorded as no-realistic-inputs (rate limited).`)
      }

      rows.push(result.row)
      if (typeof result.row.llm_cost_usd === 'number') totalCost += result.row.llm_cost_usd
      done++
      const v = result.row.verdict
      const mark = v === 'PASS' ? 'PASS' : v === 'FAIL' ? 'FAIL' : 'SKIP'
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0)
      console.error(
        `[audit-tools] (${done}/${total}, ${elapsed}s, $${totalCost.toFixed(2)}) ${mark} ${job.toolId}` +
        (v === 'FAIL' ? ` — ${result.row.failure_type}: ${(result.row.failure_reason ?? '').slice(0, 160)}` : '') +
        (v === 'PASS' ? ` (${result.row.cases_passed}/${result.row.cases_run} cases)` : ''),
      )
    }
  }

  const launches: Promise<void>[] = []
  for (let i = 0; i < concurrencyCap; i++) launches.push(worker(i))
  await Promise.all(launches)
  console.error(`[audit-tools] all workers finished — ${rows.length} tools audited, total reasoner cost $${totalCost.toFixed(2)}.`)
  return rows
}

// ── Record writers ───────────────────────────────────────────────────────────

const FAILURE_TYPE_LABEL: Record<string, string> = {
  'crash': 'Crash (non-zero exit / signal / missing script)',
  'tool-error': 'Tool error (rejected a realistic input it should accept)',
  'missing-output': 'Missing output (a required output key absent)',
  'nan': 'Non-finite output (NaN / Infinity / non-number)',
  'out-of-range': 'Out-of-range value (computed but implausible)',
  'bad-stdout': 'Bad stdout (exit 0 but not a JSON object)',
  'no-realistic-inputs': 'No realistic inputs (reasoner could not produce / rate-limited)',
}

/**
 * Write the record, MERGING this run's rows into any existing record. A partial
 * run (--only / --limit) PATCHES the rows it audited and PRESERVES every other
 * tool's prior verdict — a targeted re-audit must never clobber the full record
 * (it did once, 2026-06-14, which is why this merge exists). Returns the full
 * merged set so the doc renders the COMPLETE picture, not just this run's subset.
 */
function writeRecord(rows: ToolAuditRow[], partial: boolean): ToolAuditRow[] {
  let merged = new Map<string, ToolAuditRow>()
  if (partial && existsSync(RECORD_PATH)) {
    try {
      const prior = JSON.parse(readFileSync(RECORD_PATH, 'utf8')) as ToolAuditRow[]
      for (const r of prior) if (r && r.tool_id) merged.set(r.tool_id, r)
    } catch (err) {
      console.warn(`[audit-tools] could not read prior record to merge (${(err as Error).message}) — writing this run's rows only.`)
    }
  }
  for (const r of rows) merged.set(r.tool_id, r) // this run wins for the tools it audited
  const sorted = [...merged.values()].sort((a, b) => a.tool_id.localeCompare(b.tool_id))
  writeFileSync(RECORD_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
  return sorted
}

function writeDoc(rows: ToolAuditRow[]): void {
  const total = rows.length
  const passed = rows.filter(r => r.verdict === 'PASS')
  const failed = rows.filter(r => r.verdict === 'FAIL')
  const skipped = rows.filter(r => r.verdict === 'SKIP-NON-PYTHON')
  const pythonAudited = total - skipped.length

  // Group failures by type.
  const byType = new Map<string, ToolAuditRow[]>()
  for (const r of failed) {
    const t = r.failure_type ?? 'crash'
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t)!.push(r)
  }
  // Stable ordering of failure-type sections.
  const typeOrder = ['crash', 'tool-error', 'missing-output', 'nan', 'out-of-range', 'bad-stdout', 'no-realistic-inputs']

  const lines: string[] = []
  lines.push('# Universal Tool Audit — correctness on realistic engineering inputs')
  lines.push('')
  lines.push(`> Generated by \`scripts/audit-tools.ts\`. ${AUDIT_NOTE}.`)
  lines.push('>')
  lines.push('> Each tool is treated as **broken until a realistic self-test proves otherwise** — the')
  lines.push('> same discipline the on-the-fly tool-generator applies to a newly generated tool')
  lines.push('> (`scripts/lib/orchestrator/generic/tool-generator.ts`), turned around and pointed at the')
  lines.push('> existing 182-tool catalogue. For each tool the reasoner')
  lines.push(`> (\`${REASONER_MODEL}\`, temp 0) generated ≥${MIN_CASES} realistic test cases (realistic`)
  lines.push('> physical inputs + plausible `[min,max]` output ranges) from the tool\'s name/purpose +')
  lines.push('> its real input/output field names; each case was run through the tool\'s python via the')
  lines.push('> repo `.venv`; the verdict reuses `tool-generator.ts::runSelfTestCase` verbatim.')
  lines.push('>')
  lines.push('> This is NOT a fix pass — it is the audit record. Fixing the failing tools is a separate pass.')
  lines.push('')
  lines.push('## Headline counts')
  lines.push('')
  lines.push(`| Metric | Count |`)
  lines.push(`| --- | ---: |`)
  lines.push(`| Tools registered | ${total} |`)
  lines.push(`| Python tools audited | ${pythonAudited} |`)
  lines.push(`| **PASS** (correct on realistic inputs) | **${passed.length}** |`)
  lines.push(`| **FAIL** (silently broken on realistic inputs) | **${failed.length}** |`)
  lines.push(`| Skipped (pure-TS, no python self-test) | ${skipped.length} |`)
  const passPct = pythonAudited > 0 ? ((passed.length / pythonAudited) * 100).toFixed(1) : '0.0'
  lines.push(`| **Pass rate of python tools** | **${passPct}%** |`)
  lines.push('')
  lines.push('## Failure breakdown by type')
  lines.push('')
  lines.push(`| Failure type | Count |`)
  lines.push(`| --- | ---: |`)
  for (const t of typeOrder) {
    const n = byType.get(t)?.length ?? 0
    if (n > 0) lines.push(`| ${FAILURE_TYPE_LABEL[t] ?? t} | ${n} |`)
  }
  lines.push('')

  // The TABLE of every FAILED tool, grouped by failure type.
  lines.push('## Every FAILED tool (grouped by failure type)')
  lines.push('')
  if (failed.length === 0) {
    lines.push('_No failing tools._')
  } else {
    for (const t of typeOrder) {
      const group = (byType.get(t) ?? []).sort((a, b) => a.tool_id.localeCompare(b.tool_id))
      if (group.length === 0) continue
      lines.push(`### ${FAILURE_TYPE_LABEL[t] ?? t} (${group.length})`)
      lines.push('')
      lines.push(`| Tool | py_file | cases (pass/run) | Reason |`)
      lines.push(`| --- | --- | ---: | --- |`)
      for (const r of group) {
        const reason = (r.failure_reason ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 300)
        lines.push(`| \`${r.tool_id}\` | \`${r.py_file}\` | ${r.cases_passed}/${r.cases_run} | ${reason} |`)
      }
      lines.push('')
    }
  }

  // Appendix: the PASS list (compact), and the SKIP list.
  lines.push('## Appendix — tools that PASSED')
  lines.push('')
  if (passed.length === 0) lines.push('_None._')
  else lines.push(passed.map(r => `\`${r.tool_id}\``).sort().join(', '))
  lines.push('')
  if (skipped.length > 0) {
    lines.push('## Appendix — pure-TS tools (not python-self-testable)')
    lines.push('')
    lines.push(skipped.map(r => `\`${r.tool_id}\``).sort().join(', '))
    lines.push('')
  }

  if (!existsSync(dirname(DOC_PATH))) mkdirSync(dirname(DOC_PATH), { recursive: true })
  writeFileSync(DOC_PATH, lines.join('\n'), 'utf8')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('[audit-tools] FATAL: OPENROUTER_API_KEY not set (looked in env + .env.local). Cannot generate realistic tests.')
    process.exit(1)
  }

  let entries = [...listTools().entries()].map(([id, t]) => ({
    toolId: id,
    name: (t as any).name ?? id,
    domain: String((t as any).domain ?? 'unknown'),
  }))
  entries.sort((a, b) => a.toolId.localeCompare(b.toolId))
  if (ONLY) entries = entries.filter(e => ONLY.has(e.toolId))
  if (LIMIT) entries = entries.slice(0, LIMIT)

  console.error(
    `[audit-tools] auditing ${entries.length} tool(s) at concurrency ${CONCURRENCY} ` +
    `via ${REASONER_MODEL}. NOTE: shares OpenRouter rate limits with any in-progress chain run — ` +
    `will back off + drop to concurrency 2 on a 429.`,
  )

  const rows = await runAll(entries)

  // A partial run (--only/--limit) MERGES into the existing record; a full run
  // (every registered tool) replaces it. The doc always renders the MERGED set.
  const partial = !!(ONLY || LIMIT)
  const fullRecord = writeRecord(rows, partial)
  writeDoc(fullRecord)

  const passed = fullRecord.filter(r => r.verdict === 'PASS').length
  const failed = fullRecord.filter(r => r.verdict === 'FAIL').length
  const skipped = fullRecord.filter(r => r.verdict === 'SKIP-NON-PYTHON').length
  console.error('')
  if (partial) console.error(`[audit-tools] partial run of ${rows.length} tool(s) merged into the record.`)
  console.error(`[audit-tools] RECORD TOTALS (full): total=${fullRecord.length} PASS=${passed} FAIL=${failed} SKIP(pure-TS)=${skipped}`)
  console.error(`[audit-tools] record → ${RECORD_PATH}`)
  console.error(`[audit-tools] doc    → ${DOC_PATH}`)
}

main().catch(err => {
  console.error('[audit-tools] FATAL:', err)
  process.exit(1)
})
