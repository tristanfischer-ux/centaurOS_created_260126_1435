/**
 * scripts/lib/orchestrator/generic/tool-creation-pass.ts
 *
 * THE PLANNER HOOK for TOOL-CREATION-ON-THE-FLY. Runs on the selectPlan-MISS path
 * (a NOVEL/unregistered class) IMMEDIATELY BEFORE the on-the-fly tool-plan
 * bootstrap (bootstrap-tool-plan.ts). It asks: which engineering duties does this
 * brief require that NO existing catalogue tool covers? For each genuine GAP it
 * generates a new python sizing tool (tool-generator.ts) that SELF-TESTS and is
 * registered ONLY if it passes — so when the bootstrap planner then builds its
 * catalogue (listTools() + the in-memory raw-IO map), the new tools are present
 * and wirable.
 *
 * UNIVERSAL (no per-class code): the SAME strong reasoner used everywhere else
 * proposes the duty GAPS from the detailed brief + the current catalogue; the
 * DETERMINISTIC self-test gate disposes (a proposed tool that cannot prove itself
 * is rejected, not used). FAIL-SAFE: a failed creation simply means that duty has
 * no tool this run — the chain proceeds (every generated step is required:false in
 * the bootstrap plan anyway).
 *
 * Gated behind UNIVERSAL_TOOL_CREATION (default ON; =0 disables), mirroring
 * UNIVERSAL_TOOL_PLAN_BOOTSTRAP / CLASS_GRAPH_BOOTSTRAP.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

import type { BriefEnvelope, ParsedConstraints, ToolDomain } from '../types'
import { buildToolCatalogue, type ToolCatalogueEntry } from './bootstrap-tool-plan'
import {
  generateAndRegisterTool,
  type DutySpec,
  type DutyKeySpec,
  type ToolGenerationResult,
} from './tool-generator'
import {
  structuralCacheReuseEnabled,
  tableHasQuarantineColumn,
  reusableCandidateWhereSql,
  ensureQuarantineColumn,
} from './structural-cache-policy'

// The SAME strong reasoner the bootstrap uses to PROPOSE duty gaps. The
// deterministic self-test gate (tool-generator.ts) is what actually disposes.
const GAP_MODEL = 'google/gemini-3.1-pro-preview'
const MAX_OUTPUT_TOKENS = 150_000
/** Hard ceiling on tools created per run (cost + time safety). The job's real
 *  shape rarely needs more NEW tools than this in one pass; the bootstrap can run
 *  again next cycle if more gaps remain. */
const MAX_NEW_TOOLS_PER_RUN = 8

// ── PER-CLASS PROPOSAL CACHE (FIX 1 — determinism root cause) ────────────────
//
// THE BUG IT FIXES (RAS regression, 2026-06-14): the gap PROPOSAL is an LLM call
// (proposeGapsViaLLM). At temp 0 the reasoner STILL chooses different tool_ids +
// different physics_descriptions across runs for the SAME class (run 1:
// `ras-metabolism:load-generation`/`degasser:co2-stripping`; run 2:
// `ras:metabolic-load`/`ras:degasser-sizing`). Because the bootstrap's cached
// tool-plan candidate v1 references the run-1 tool_ids, a run-2 proposal with
// different ids makes that candidate fail validation ("stored candidate v1 fails
// current validation — re-harvesting"); the re-harvest then timed out and the
// orchestrator fell through to the DOMAIN-BLIND auto-planner (25 airfoil/AUV/
// bicycle tools for a fish farm). Non-determinism HERE is the upstream cause.
//
// THE FIX (mirrors the existing growing-DB DB-first pattern in
// class_tool_plan_candidates + generated_tools): after a successful pass, PERSIST
// the ACCEPTED DutySpec list (the full specs — tool_id + purpose +
// physics_description + input/output keys, NOT just the ids) for the class. On the
// NEXT pass for that class, LOAD the cached proposal and SKIP the LLM propose
// entirely — re-generate/re-register those EXACT specs. Because generateAnd
// RegisterTool keys its own per-tool DB by dutyHash(duty) (tool_id + normalised
// physics + input/output field names + units), replaying the IDENTICAL DutySpec
// yields the IDENTICAL duty_hash → each tool is REUSED from generated_tools with
// NO LLM call. Net: byte-identical tool_ids every run → the cached tool-plan
// candidate stays valid → NO re-harvest → NO auto-planner fallback.
//
// Why persist the WHOLE DutySpec, not just the tool_ids: the generated-tool DB is
// keyed by duty_hash, and the hash includes the physics_description + key set. Run
// 2 produced the SAME tool_id `mbbr:biofilter-sizing` but a DIFFERENT duty_hash
// (the physics prose drifted), so it generated a SECOND tool row instead of
// reusing the first. Replaying the stored DutySpec verbatim is what makes the hash
// — and therefore the reuse — deterministic.
const FORGE_TRUTH_DB = resolve(homedir(), '.forge-truth', 'forge-truth.db')
// product_class slugs key DB rows: validate at the boundary, bind every value,
// never string-interpolate (security item 18 pattern, mirrors bootstrap-tool-plan).
const PROPOSAL_SLUG_RE = /^[a-z0-9_]{1,64}$/
const PROPOSAL_SOURCE = `tool-creation-proposal@v1:${GAP_MODEL}`

const TOOL_ID_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/
const FIELD_RE = /^[a-z][a-z0-9_]*$/

// ── Public result ─────────────────────────────────────────────────────────────

export interface ToolCreationPassResult {
  /** Tools that PASSED their self-test and were registered this run. */
  created: Array<{ tool_id: string; output_keys: string[] }>
  /** Tools whose generation/self-test FAILED (rejected, not used). */
  rejected: Array<{ tool_id: string; stage: string; error: string }>
  /** Proposed duties skipped before generation (bad id, no outputs, duplicate). */
  skipped: Array<{ tool_id: string; reason: string }>
  attempts: number
  llm_cost_usd: number | null
  /** A terminal stage when the pass could not even propose duties. `ran` = a fresh
   *  LLM-proposed pass; `reused-proposal` = the per-class proposal cache was hit so
   *  the LLM propose was SKIPPED and the stored DutySpec list was replayed (the
   *  determinism path — identical tool_ids every run). */
  stage: 'disabled' | 'no-api-key' | 'no-gaps' | 'propose-failed' | 'ran' | 'reused-proposal'
  /** True when the duty set came from the per-class proposal cache (no LLM propose). */
  proposal_reused?: boolean
}

// ── (1) PROPOSE the duty gaps via the reasoner ──────────────────────────────

function buildGapProposalPrompt(
  envelope: BriefEnvelope,
  brief: ParsedConstraints,
  contractQuantities: ReadonlyArray<{ key: string; value: number; unit: string }>,
  catalogue: ToolCatalogueEntry[],
): string {
  const desc = String(brief.product_description ?? '').slice(0, 5000)
  const dutyLines = contractQuantities.slice(0, 120)
    .map(q => `- ${q.key} = ${q.value} ${q.unit}`)
    .join('\n')
  const wirableKeys = contractQuantities.slice(0, 120)
    .map(q => `${q.key} (${q.unit})`)
    .join(', ')
  // Show the catalogue COMPACTLY (id + domain + a few output fields) — enough for
  // the reasoner to judge coverage without the full I/O blob.
  const catalogueLines = catalogue
    .map(c => `- ${c.tool_id} [${c.domain}]: ${c.output_fields.slice(0, 6).join(', ')}${c.output_fields.length > 6 ? ', …' : ''}`)
    .join('\n')

  return (
    `You are a senior systems engineer scoping the TOOLS needed to design a NOVEL ` +
    `product the deterministic engineering pipeline has never seen. An on-the-fly ` +
    `tool planner will shortly pick + wire tools from the catalogue. Your job NOW: ` +
    `identify engineering duties this brief REQUIRES for which NO catalogue tool ` +
    `fits, so a NEW first-principles sizing tool can be generated for each gap.\n\n` +
    `PRODUCT CLASS: ${envelope.class} (scale ${envelope.scale_tier}, ${envelope.application})\n\n` +
    `BRIEF:\n${desc}\n\n` +
    (dutyLines ? `ENGINEERING DUTIES THE SYSTEM MUST PERFORM (parsed contract quantities):\n${dutyLines}\n\n` : '') +
    (wirableKeys ? `AVAILABLE CONTRACT KEYS (a new tool may READ these as inputs — wire by EXACT key name):\n${wirableKeys}\n\n` : '') +
    `EXISTING TOOL CATALOGUE (tool_id [domain]: sample output fields). A duty is ` +
    `COVERED if a tool here already computes it — do NOT propose a new tool for a ` +
    `covered duty:\n${catalogueLines}\n\n` +
    `RULES:\n` +
    `1. Propose a NEW tool ONLY for a duty that is genuinely UNCOVERED by the ` +
    `catalogue AND that this specific product physically needs (a sizing/duty ` +
    `calculation — a vessel volume, a media volume, an area, a power, a flow, a ` +
    `heat duty, a mass). Do NOT propose tools for a different domain than this ` +
    `product. If everything the brief needs is already covered, return an EMPTY ` +
    `list.\n` +
    `2. Each new tool computes ONE duty from FIRST PRINCIPLES. Give a precise ` +
    `physics_description naming the real method/equation (the generator will ` +
    `implement it). Do NOT hand-wave.\n` +
    `3. tool_id MUST be "<name>:<sub-capability>" in lower-kebab (e.g. ` +
    `"mbbr:biofilter-sizing"), unique, and NOT equal to any catalogue tool_id.\n` +
    `4. available_input_keys: the fields the tool reads — PREFER the AVAILABLE ` +
    `CONTRACT KEYS above (wire by exact name) plus any genuine physical ` +
    `coefficients. required_output_keys: the COMPUTED quantities the tool must ` +
    `return (lower_snake names, with units). These become contract quantities.\n` +
    `5. Keep the list focused — propose the few HIGH-VALUE missing duties, not a ` +
    `sprawling set. At most ${MAX_NEW_TOOLS_PER_RUN}.\n\n` +
    `Return STRICT JSON ONLY (no fence, no commentary):\n` +
    `{"duties": [{"tool_id": "...", "name": "...", "purpose": "<one line>", ` +
    `"physics_description": "<the real first-principles method + equation>", ` +
    `"domain": "process", "available_input_keys": [{"name": "<field>", "unit": "...", ` +
    `"family": "..."}], "required_output_keys": [{"name": "<field>", "unit": "...", ` +
    `"family": "..."}]}]}`
  )
}

interface GapProposalOutcome {
  duties: DutySpec[]
  costUsd: number | null
  error: string | null
}

/** Is a gap-proposal error TRANSIENT (timeout / 5xx / transport / empty
 *  completion)? Retried WITHOUT failing the pass. A JSON-parse / "no JSON object"
 *  error is NOT transient (the model answered, just malformed) — those proceed as
 *  before (the pass proceeds with the existing catalogue). */
function isTransientProposeError(error: string): boolean {
  const e = (error || '').toLowerCase()
  return (
    e.includes('timeout') || e.includes('aborted') ||
    e.includes('http 5') ||
    e.includes('econnreset') || e.includes('socket hang up') ||
    e.includes('network') || e.includes('fetch failed') || e.includes('etimedout') ||
    e.includes('empty completion')
  )
}

const VALID_DOMAINS = new Set<ToolDomain>([
  'battery', 'thermal', 'power_electronics', 'mechanical', 'grid', 'aero', 'process',
  'biochemistry', 'parts_catalog', 'standards', 'photonics', 'control_systems', 'cad', 'pcb',
])

/** Coerce one raw proposed duty into a validated DutySpec, or null (skip). */
function coerceDuty(raw: any, existingToolIds: Set<string>): { duty: DutySpec | null; reason?: string } {
  const toolId = typeof raw?.tool_id === 'string' ? raw.tool_id.trim() : ''
  if (!TOOL_ID_RE.test(toolId)) return { duty: null, reason: `bad tool_id "${toolId}"` }
  if (existingToolIds.has(toolId)) return { duty: null, reason: `tool_id "${toolId}" already in catalogue (not a gap)` }
  const coerceKeys = (arr: any): DutyKeySpec[] => (Array.isArray(arr) ? arr : [])
    .map((k: any) => ({
      name: typeof k?.name === 'string' ? k.name.trim() : '',
      unit: typeof k?.unit === 'string' ? k.unit.trim() : '',
      family: typeof k?.family === 'string' ? k.family.trim() : undefined,
    }))
    .filter((k: DutyKeySpec) => FIELD_RE.test(k.name))
  const outKeys = coerceKeys(raw?.required_output_keys)
  if (outKeys.length === 0) return { duty: null, reason: `"${toolId}" has no valid required_output_keys` }
  const physics = typeof raw?.physics_description === 'string' ? raw.physics_description.trim() : ''
  if (physics.length < 20) return { duty: null, reason: `"${toolId}" physics_description too thin` }
  const domain: ToolDomain = VALID_DOMAINS.has(raw?.domain) ? raw.domain : 'process'
  return {
    duty: {
      tool_id: toolId,
      name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : toolId,
      purpose: typeof raw?.purpose === 'string' ? raw.purpose.trim().slice(0, 200) : toolId,
      physics_description: physics.slice(0, 4000),
      domain,
      available_input_keys: coerceKeys(raw?.available_input_keys),
      required_output_keys: outKeys,
    },
  }
}

// ── PER-CLASS PROPOSAL CACHE — store/load (DB-first determinism) ─────────────

/** Boundary validation BEFORE any DB use. */
function isCacheableSlug(slug: string): boolean {
  return typeof slug === 'string' && PROPOSAL_SLUG_RE.test(slug)
}

/** Normalise a class label to the proposal-cache slug alphabet (hyphens → '_',
 *  lower-case), matching how bootstrap-tool-plan keys class_tool_plan_candidates.
 *  Returns null if it cannot sanitise. */
function proposalSlugFor(rawClass: string, application?: string): string | null {
  const slug = String(rawClass ?? '').trim().toLowerCase().replace(/-/g, '_')
  if (!isCacheableSlug(slug)) return null
  // CLASS ALONE IS NOT A SAFE KEY (2026-07-27). The cache existed to make tool
  // selection deterministic — same class, same tool_ids, no re-harvest. But two
  // products that merely SHARE a class have nothing else in common, and the second
  // one silently inherits the first one's tools. Observed live: a benchtop battery
  // cell cycler classified `consumer_electronics` replayed the stored proposal from
  // an earlier microgravity RPM appliance and was handed
  // rpm-kinematics:microgravity-simulation, microfluidics:shear-stress and
  // gimbal-dynamics:torque-sizing. The chain then declared "plausibility 1/10 — tool
  // skeleton is unrecoverable" and emitted an 'Imaging Intensity' word sized at
  // 229 m2 on a desktop instrument.
  //
  // `application` is the envelope's own functional descriptor, so including it means a
  // functionally different product MISSES and proposes fresh — which is the fail-safe
  // path this cache already documents ("A cache miss / parse error falls through to
  // the LLM propose"). Determinism is preserved for genuine re-runs of the same
  // product, which is what the cache was for.
  if (!application) return slug
  const app = String(application).trim().toLowerCase()
  if (!app) return slug
  const fp = createHash('sha1').update(app).digest('hex').slice(0, 8)
  return `${slug}__${fp}`
}

function openProposalDb(dbPath: string = FORGE_TRUTH_DB): Database.Database {
  const db = new Database(dbPath, { timeout: 30_000 })
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 3000')
  db.exec(`CREATE TABLE IF NOT EXISTS tool_creation_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  duties_json TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','shadow','approved')),
  UNIQUE(slug, version)
);`)
  ensureQuarantineColumn(db, 'tool_creation_proposals')
  return db
}

interface ProposalRow { id: number; slug: string; version: number; duties_json: string }

/**
 * Newest stored proposal DutySpec list for a class, re-coerced through the CURRENT
 * coerceDuty schema (so a stored row that no longer validates — bad id, registry
 * drift — is treated as a miss and the LLM re-proposes). Read-only; never throws.
 * Returns null on miss/parse-error/empty (the caller then proposes via the LLM —
 * current behaviour, the fail-safe).
 */
export function loadProposalForClass(rawClass: string, dbPath: string = FORGE_TRUTH_DB, application?: string): DutySpec[] | null {
  const slug = proposalSlugFor(rawClass, application)
  if (!slug) return null
  if (!structuralCacheReuseEnabled()) {
    console.error('[tool-creation] STRUCTURAL_CACHE_REUSE disabled — skipping proposal cache (cold miss path)')
    return null
  }
  if (!existsSync(dbPath)) return null
  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 2000')
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tool_creation_proposals'`).get()
    if (!exists) return null
    const qCol = tableHasQuarantineColumn(db, 'tool_creation_proposals')
    const qSql = reusableCandidateWhereSql(qCol)
    const row = db.prepare(
      `SELECT id, slug, version, duties_json FROM tool_creation_proposals
       WHERE slug = ? ${qSql} ORDER BY version DESC LIMIT 1`,
    ).get(slug) as ProposalRow | undefined
    if (!row) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(row.duties_json)
    } catch {
      return null // corrupt row → miss → re-propose
    }
    const rawDuties: any[] = Array.isArray(parsed) ? parsed : []
    if (rawDuties.length === 0) return null
    // Re-coerce EACH stored duty against the current schema. If ANY fails to
    // coerce (id no longer valid, etc.), treat the whole cached proposal as a miss
    // rather than replay a partially-stale set — fail-safe to a fresh LLM propose.
    const duties: DutySpec[] = []
    const seen = new Set<string>()
    for (const rd of rawDuties) {
      // existingToolIds is intentionally EMPTY here: a cached duty's tool_id is a
      // tool we created OURSELVES last run (so it IS now in the live catalogue) —
      // coerceDuty's "already in catalogue" guard is for NOVEL proposals, not for
      // re-validating our own stored specs. We re-key reuse by duty_hash downstream.
      const { duty } = coerceDuty(rd, new Set<string>())
      if (!duty) return null
      if (seen.has(duty.tool_id)) continue
      seen.add(duty.tool_id)
      duties.push(duty)
    }
    return duties.length > 0 ? duties : null
  } catch (err) {
    console.warn(`[tool-creation] proposal-cache read failed: ${(err as Error).message}`)
    return null
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

/**
 * Persist the ACCEPTED DutySpec list for a class (status 'candidate', version =
 * MAX+1, atomic, bound params). Stores the FULL specs so a replay reproduces the
 * IDENTICAL dutyHash (→ generated-tool DB reuse) on the next run. Never throws —
 * a store failure just means the next run re-proposes (fail-safe). No-op when the
 * class slug doesn't sanitise or the duty list is empty.
 */
export function storeProposalForClass(rawClass: string, duties: DutySpec[], dbPath: string = FORGE_TRUTH_DB, application?: string): void {
  const slug = proposalSlugFor(rawClass, application)
  if (!slug || duties.length === 0) return
  let db: Database.Database | null = null
  try {
    db = openProposalDb(dbPath)
    db.prepare(
      `INSERT INTO tool_creation_proposals (slug, version, duties_json, source, status)
       VALUES (@slug,
               COALESCE((SELECT MAX(version) FROM tool_creation_proposals WHERE slug = @slug), 0) + 1,
               @dutiesJson, @source, 'candidate')`,
    ).run({ slug, dutiesJson: JSON.stringify(duties), source: PROPOSAL_SOURCE })
  } catch (err) {
    console.warn(`[tool-creation] proposal-cache store failed: ${(err as Error).message} — next run will re-propose (fail-safe).`)
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

/** ONE OpenRouter call → the proposed duty gaps. Mirrors the bootstrap fetch
 *  idiom (auth headers, temp 0, usage.include, fence-strip, brace-slice). */
async function proposeGapsViaLLM(
  prompt: string,
  existingToolIds: Set<string>,
): Promise<GapProposalOutcome & { skipped: Array<{ tool_id: string; reason: string }> }> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { duties: [], costUsd: null, error: 'OPENROUTER_API_KEY not set', skipped: [] }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS tool-creation gap-proposal',
      },
      body: JSON.stringify({
        model: GAP_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) return { duties: [], costUsd: null, error: `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, skipped: [] }
    const j: any = await res.json()
    const costUsd = typeof j?.usage?.cost === 'number' ? j.usage.cost : null
    const rawContent = j?.choices?.[0]?.message?.content
    if (!rawContent || typeof rawContent !== 'string') {
      return { duties: [], costUsd, error: `empty completion (finish_reason=${j?.choices?.[0]?.finish_reason ?? '?'})`, skipped: [] }
    }
    let cleaned = rawContent.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    const a = cleaned.indexOf('{')
    const b = cleaned.lastIndexOf('}')
    if (a === -1 || b === -1) return { duties: [], costUsd, error: 'no JSON object in completion', skipped: [] }
    let parsed: any
    try {
      parsed = JSON.parse(cleaned.slice(a, b + 1))
    } catch (err) {
      return { duties: [], costUsd, error: `JSON parse failed: ${(err as Error).message}`, skipped: [] }
    }
    const rawDuties: any[] = Array.isArray(parsed?.duties) ? parsed.duties : []
    const duties: DutySpec[] = []
    const skipped: Array<{ tool_id: string; reason: string }> = []
    const seen = new Set<string>()
    for (const rd of rawDuties) {
      const { duty, reason } = coerceDuty(rd, existingToolIds)
      if (!duty) { skipped.push({ tool_id: typeof rd?.tool_id === 'string' ? rd.tool_id : '(unknown)', reason: reason ?? 'invalid' }); continue }
      if (seen.has(duty.tool_id)) { skipped.push({ tool_id: duty.tool_id, reason: 'duplicate in proposal' }); continue }
      seen.add(duty.tool_id)
      duties.push(duty)
      if (duties.length >= MAX_NEW_TOOLS_PER_RUN) break
    }
    return { duties, costUsd, error: null, skipped }
  } catch (err) {
    return { duties: [], costUsd: null, error: `OpenRouter call failed: ${(err as Error).message}`, skipped: [] }
  }
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Run the tool-creation pass for a novel class. Proposes the uncovered duty gaps,
 * then for each gap generates a self-test-gated python tool (registered ONLY if it
 * passes). Returns what was created/rejected/skipped. NEVER throws — every error
 * is captured so the caller can proceed to the bootstrap planner regardless
 * (fail-safe: a failed creation just means that duty has no tool this run).
 *
 * @param contractQuantities the partial engineering-contract quantities (the
 *   detailed brief's duties), same as bootstrapToolPlan receives.
 */
export async function runToolCreationPass(
  envelope: BriefEnvelope,
  brief: ParsedConstraints,
  contractQuantities: ReadonlyArray<{ key: string; value: number; unit: string }> = [],
): Promise<ToolCreationPassResult> {
  const base: ToolCreationPassResult = {
    created: [], rejected: [], skipped: [], attempts: 0, llm_cost_usd: null, stage: 'ran',
  }
  if (process.env.UNIVERSAL_TOOL_CREATION === '0') {
    return { ...base, stage: 'disabled' }
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return { ...base, stage: 'no-api-key' }
  }

  let totalCost = 0
  try {
    // (0) DB-FIRST PROPOSAL REUSE — the determinism root cause (FIX 1). If this
    // class was proposed for on a prior run, REPLAY the stored DutySpec list and
    // SKIP the LLM propose entirely. Replaying the identical specs yields the
    // identical dutyHash per tool → each is reused from generated_tools with NO
    // LLM call → byte-identical tool_ids → the cached tool-plan candidate stays
    // valid → NO re-harvest → NO domain-blind auto-planner fallback. A cache miss /
    // parse error falls through to the LLM propose (current behaviour — fail-safe).
    const cachedDuties = loadProposalForClass(envelope.class, undefined, envelope.application)
    let duties: DutySpec[]
    let proposalReused = false
    if (cachedDuties && cachedDuties.length > 0) {
      duties = cachedDuties
      proposalReused = true
      console.error(
        `[tool-creation] PROPOSAL-CACHE HIT for ${envelope.class}: replaying ${duties.length} stored duty spec(s) ` +
        `(${duties.map(d => d.tool_id).join(', ')}) — SKIPPING the LLM propose. Identical tool_ids + duty_hashes ` +
        `→ deterministic per-tool reuse, no re-harvest, no fallback.`,
      )
    } else {
      const catalogue = buildToolCatalogue()
      const existingToolIds = new Set(catalogue.map(c => c.tool_id))
      const prompt = buildGapProposalPrompt(envelope, brief, contractQuantities, catalogue)
      // Retry the gap-proposal call on a TRANSIENT failure (timeout / 5xx / empty
      // completion). The RAS regression's run-1 lost ALL tools because this single
      // call returned `empty completion (finish_reason=?)` once — a one-off
      // OpenRouter hiccup, not a real "no gaps" answer. A bounded transient retry
      // makes the cold-start (the run that POPULATES the proposal cache) reliable.
      let proposal = await proposeGapsViaLLM(prompt, existingToolIds)
      if (proposal.costUsd) totalCost += proposal.costUsd
      for (
        let pr = 1;
        pr <= 3 && proposal.error != null && isTransientProposeError(proposal.error);
        pr++
      ) {
        console.error(`[tool-creation] gap proposal TRANSIENT failure (${proposal.error}) — retry ${pr}/3.`)
        proposal = await proposeGapsViaLLM(prompt, existingToolIds)
        if (proposal.costUsd) totalCost += proposal.costUsd
      }
      base.skipped.push(...proposal.skipped)

      if (proposal.error) {
        console.error(`[tool-creation] gap proposal failed: ${proposal.error} — proceeding with the existing catalogue (no new tools this run).`)
        return { ...base, llm_cost_usd: totalCost > 0 ? totalCost : null, stage: 'propose-failed' }
      }
      if (proposal.duties.length === 0) {
        console.error(`[tool-creation] no uncovered duty gaps proposed for ${envelope.class} — existing catalogue is sufficient.`)
        return { ...base, llm_cost_usd: totalCost > 0 ? totalCost : null, stage: 'no-gaps' }
      }
      duties = proposal.duties
      console.error(
        `[tool-creation] ${duties.length} duty gap(s) proposed for ${envelope.class}: ` +
        duties.map(d => d.tool_id).join(', ') + ' — generating + self-testing each.',
      )
    }

    // Generate + self-test + register each gap. Sequential (each is a strong-model
    // call + python subprocess runs; keep cost/concurrency bounded). On the
    // proposal-reuse path each tool is found in generated_tools by duty_hash and
    // re-registered WITHOUT an LLM call (see generateAndRegisterTool step 0).
    let attemptsTotal = 0
    const acceptedDuties: DutySpec[] = []
    for (const duty of duties) {
      let result: ToolGenerationResult
      try {
        result = await generateAndRegisterTool(duty)
      } catch (err) {
        base.rejected.push({ tool_id: duty.tool_id, stage: 'threw', error: (err as Error).message })
        continue
      }
      attemptsTotal += result.attempts
      if (result.ok && 'llm_cost_usd' in result && result.llm_cost_usd) totalCost += result.llm_cost_usd
      if (result.ok) {
        base.created.push({ tool_id: result.tool_id, output_keys: result.output_keys })
        acceptedDuties.push(duty) // the spec that produced a registered tool
      } else {
        base.rejected.push({ tool_id: result.tool_id, stage: result.stage, error: result.error })
      }
    }
    base.attempts = attemptsTotal

    // (3) PERSIST the accepted DutySpec list for this class so the NEXT run replays
    // these EXACT specs (determinism). Only on a FRESH LLM-proposed pass (a replay
    // would just re-store the same set), and only when EVERY proposed duty was
    // accepted — a partial accept (e.g. one tool timed out its self-test this run)
    // would freeze an incomplete set; leaving it unstored lets the next run
    // re-propose + complete, then store the full set. (When the cache was hit, the
    // stored set is by definition already complete + accepted, so no re-store.)
    if (!proposalReused && acceptedDuties.length === duties.length && acceptedDuties.length > 0) {
      storeProposalForClass(envelope.class, acceptedDuties, undefined, envelope.application)
      console.error(
        `[tool-creation] PROPOSAL-CACHE STORE for ${envelope.class}: persisted ${acceptedDuties.length} accepted duty spec(s) ` +
        `— the next run for this class replays them verbatim (no LLM propose, deterministic tool_ids).`,
      )
    } else if (!proposalReused && acceptedDuties.length > 0) {
      console.error(
        `[tool-creation] PROPOSAL-CACHE NOT stored for ${envelope.class}: ${acceptedDuties.length}/${duties.length} duties accepted ` +
        `(partial) — leaving unstored so the next run re-proposes + completes the full set before caching.`,
      )
    }

    console.error(
      `[tool-creation] DONE for ${envelope.class}: created ${base.created.length} self-test-passed tool(s) ` +
      `(${base.created.map(c => c.tool_id).join(', ') || 'none'}), rejected ${base.rejected.length} ` +
      `(${base.rejected.map(r => `${r.tool_id}:${r.stage}`).join(', ') || 'none'}), cost_usd=${totalCost.toFixed(4)}` +
      `${proposalReused ? ' [proposal-cache REUSED]' : ''}. ` +
      `Created tools are now in the catalogue for the tool-plan bootstrap to wire.`,
    )
    return {
      ...base,
      llm_cost_usd: totalCost > 0 ? totalCost : null,
      stage: proposalReused ? 'reused-proposal' : 'ran',
      proposal_reused: proposalReused,
    }
  } catch (err) {
    console.error(`[tool-creation] pass threw: ${(err as Error).message} — proceeding without new tools (fail-safe).`)
    return { ...base, llm_cost_usd: totalCost > 0 ? totalCost : null, stage: 'ran' }
  }
}
