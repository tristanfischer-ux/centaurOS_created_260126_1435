// physics-critic-autocorrect.ts
//
// THE PHYSICS-CRITIC PHASE-2 AUTO-CORRECT — the self-correcting loop. The engine
// FIXES a part the Physics Critic flagged and RE-CHECKS, instead of listing the
// fault as a customer risk (Tristan, twice: "you should automatically be fixing,
// not just saying they are there").
//
// RELATIONSHIP TO PHASE 1 (physics-critic-enforcement.ts, gate 33). Phase 1 is the
// "never ship a part the engine KNOWS will fail" BLOCK guarantee: it hard-exits 33
// (when enforcing) on a finding that clears the SAME three bars this module reuses
// — (a) severity high, (b) confidence high|medium, (c) a `where` that names a
// specific …/words/N part AND an `issue` describing a CONCRETE failure mode. Phase 2
// (this module) runs BEFORE that decision: it tries to CORRECT each blocking-eligible
// finding so the design ships a PASSING part rather than refusing or shipping a known
// failure. Anything still uncorrectable after the bounded loop falls through to the
// Phase-1 enforcement gate untouched.
//
// SELECTOR REUSE (single source of truth). The set of findings this corrector targets
// is EXACTLY the set Phase-1 would block on — we import `issueIsBlocking` from
// physics-critic-enforcement.ts rather than re-deriving the classifier. That keeps the
// two phases in lock-step: a finding the corrector can attempt is a finding the gate
// would otherwise block, and vice-versa. A vague/holistic concern ("perform a detailed
// load-list analysis"), an advisory hedge ("verify the rating"), a MED, a low/unknown
// flag, or a non-physical JSON/truncation finding is NEVER selected (it does not clear
// the three bars) — so the corrector touches only feeder/boiler/material-style named
// part findings and skips the rest.
//
// PRIOR-ART GUARDRAILS (mempalace pre-change search, 2026-06-04 —
//   "physics critic auto-correct re-emit flagged part re-run loop" → 6 drawers;
//   "LLM re-spec corrected part upsize feeder material swap modifier set" → 6 drawers).
// Four load-bearing prior findings shaped this design; the corrector respects all four:
//
//   1. PHYSICS-REPAIR IS THE DOMINANT CORRUPTION VECTOR (drawer: physics-repair.ts +
//      PLAN-deterministic-generation.md, anchor A1 2026-05-28). The old free-hand
//      physics-repair loop bypassed applyPatches and silently smeared a wrong
//      manufacturer/part_number onto the wrong part ("Module-8 MPN smear"). A1
//      restricted that loop to set_derived_parameter + name_human. This corrector
//      mutates the emitter-owned fields A1 protects (manufacturer/part_number/rating),
//      so it is deliberately NARROW and VERIFIED where physics-repair was broad and
//      blind: it (a) targets ONLY the single word the finding names, located by the
//      finding's own part tokens (not blind index navigation — the `where` indices are
//      LLM-emitted and unreliable when a module name repeats, verified on the CO₂
//      release where the Gericke feeder's stated path resolved to a pH probe); (b)
//      re-runs the Critic to CONFIRM the specific fault cleared before keeping the
//      correction; (c) defaults to SHADOW so the shipped design is never mutated on a
//      first build. It is a targeted Critic-driven correction, not a free-hand swap.
//
//   2. BRIEF-PINNED vs ENGINE-FLEXIBLE (drawer: physics-repair.ts canopy_area_m2=672
//      disaster). An LLM repair given a physics finding will relax whichever axis is
//      easiest — including a brief-pinned constraint — unless told not to. So the
//      re-spec prompt receives the brief's primary metrics and FORBIDS changing the
//      requirement: the corrector may only change the PART to MEET the stated demand,
//      never the demand. (e.g. "upsize the feeder to ≥200 kg/h" — it picks a bigger
//      feeder; it must NOT instead cut the K₂SO₄ target.)
//
//   3. RE-SPEC'D MPNs CAN BE HALLUCINATED (drawer: Phase 2 repair LLM hallucinates
//      structured part_numbers → gate-20). The prompt demands a GENUINE manufacturer /
//      commodity descriptor and a real catalogue model; the corrected word is stamped
//      with a `source_detail` modifier recording the swap so gate-20 (fictional-PN) and
//      the BoM audit can see the provenance. Gate-20 remains the post-render backstop
//      on anything the corrector invents.
//
//   4. RE-EMIT GATES ARE GAMEABLE / GOODHART (drawer: Engine-A Jaccard category
//      preservation). An LLM asked to "fix the flagged part" can pass the check by
//      swapping in a cheaper, functionally-DIFFERENT part. The prompt requires the
//      corrected part to preserve the SAME functional class (upsize/upgrade the feeder,
//      do not replace it with a pump); the corrector keeps the word's id +
//      content_character untouched (identity-lock) so only the spec changes.
//
// MODE (env PHYSICS_CRITIC_AUTOCORRECT): default SHADOW — compute + record the
// corrections it WOULD apply, but do NOT mutate the shipped state. ENABLED (=1 / on /
// true / enabled) actually applies them. SHADOW keeps this first build from silently
// rewriting designs.
//
// PURITY. The decision/parse helpers are pure + unit-testable: `selectCorrectableFindings`
// (which findings the corrector targets, reusing issueIsBlocking), `locateWordForFinding`
// (resolve the finding to a concrete word object by its part tokens), `parseCorrection`
// (parse the LLM's corrected-modifier JSON), and `applyCorrectionToWord` (the surgical
// in-place patch). The only impure piece is `respecPartViaLLM` (the OpenRouter call) and
// the `runPhysicsCriticAutocorrect` orchestration, both of which take their LLM caller +
// re-critique callback as injected functions so tests can run with mocks.
//
// British spelling throughout.

import {
  issueIsBlocking,
  type PhysicsCriticEnforceMode,
} from './physics-critic-enforcement'
import type { CritiqueReport, CritiqueIssue } from '../../src/lib/pdf-engine-v2/radical/physics-critic'

// ---------------------------------------------------------------------------
// Modes (mirror the enforcement env helper: shadow by default)
// ---------------------------------------------------------------------------

export type PhysicsCriticAutocorrectMode = 'shadow' | 'enabled'

/** Map PHYSICS_CRITIC_AUTOCORRECT to a mode. unset / 0 / false / off / no / shadow →
 *  SHADOW (compute + record, never mutate the shipped state); anything else truthy
 *  (1 / true / on / enabled / apply) → ENABLED (actually patch). Default SHADOW so a
 *  first build can never silently rewrite a design. */
export function physicsCriticAutocorrectModeFromEnv(v: string | undefined): PhysicsCriticAutocorrectMode {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no' || s === 'shadow') return 'shadow'
  return 'enabled'
}

// ---------------------------------------------------------------------------
// Modifier kinds the corrector is allowed to rewrite on a flagged word.
// These are the part-IDENTITY + SPEC fields (emitter-owned per A1). The corrector
// rewrites them ONLY on a Critic-named blocking word, ONLY to clear a proven
// failure, and re-checks afterwards — the controlled exception to A1's lock.
// The word's `id` + `content_character` are NEVER touched (identity-lock), so the
// part stays the same functional slot; only its make/model/spec changes.
// ---------------------------------------------------------------------------

/** Modifier kinds the LLM may set in a correction. One value per kind (deduped on
 *  apply). `source_detail` is appended by the corrector itself, not the LLM. */
export const CORRECTABLE_MODIFIER_KINDS = [
  'manufacturer',
  'part_number',
  'form',
  'rating_primary',
  'rating',
  'capacity',
  'performance',
  'dimension',
  'material',
  'list_price_gbp',
  'price_estimate_gbp',
] as const

export type CorrectableModifierKind = (typeof CORRECTABLE_MODIFIER_KINDS)[number]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A finding the corrector has selected, paired with its concrete-failure tag. */
export interface CorrectableFinding {
  issue: CritiqueIssue
  failure_mode: string
}

/** Minimal word reference the corrector mutates (mirrors part-reality-check's WordRef). */
export interface WordLocation {
  word: any            // direct object reference (mutable)
  word_id: string
  module_id: string
  module_index: number
  sub_module_id: string
  sub_module_index: number
  word_index: number
  /** Path actually resolved, for the audit trail (may differ from finding.where). */
  resolved_path: string
  /** How the word was matched (exact-path | part-token | word-id | single-candidate). */
  match_method: string
}

/** The structured correction the LLM returns for one flagged word. */
export interface ParsedCorrection {
  /** kind → value, restricted to CORRECTABLE_MODIFIER_KINDS, one value per kind. */
  modifiers: Partial<Record<CorrectableModifierKind, string>>
  /** The LLM's one-line note on what it changed and why (for the audit trail). */
  rationale: string
  /** True when the model declined to correct (e.g. only fixable by violating the brief). */
  declined: boolean
  /** Reason the model declined, if any (surfaces as a manual-review note). */
  declined_reason?: string
}

/** Before→after record of a single attempted correction. */
export interface CorrectionRecord {
  where: string
  resolved_path: string
  match_method: string
  word_id: string
  module_id: string
  sub_module_id: string
  failure_mode: string
  issue: string
  suggested_check?: string
  before: Record<string, string>     // modifier kind → value, pre-correction
  after: Record<string, string>      // modifier kind → value, post-correction (shadow: would-be)
  rationale: string
  pass: number                        // which correction pass produced this (1-based)
  applied: boolean                    // true if mutated state (enabled), false if shadow
  cleared: boolean | null             // did the re-critique clear this where? null = not yet checked
  status: 'corrected' | 'declined' | 'unlocatable' | 'llm_error' | 'uncleared'
  note?: string
}

/** The full auto-correct result, persisted to state.physicsCriticAutocorrect. */
export interface PhysicsCriticAutocorrectResult {
  mode: PhysicsCriticAutocorrectMode
  passes_run: number
  selected: number                    // blocking-eligible findings selected pass-1
  corrected: number                   // findings whose fault cleared after correction
  declined: number                    // model declined (brief-pinned / cannot fix)
  unlocatable: number                 // could not resolve the finding to a word
  uncorrectable_after_passes: number  // still blocking after the loop (→ gate 33)
  records: CorrectionRecord[]
  /** Final critique after the loop (the one the enforcement gate should read). */
  final_critique: CritiqueReport | null
}

// ---------------------------------------------------------------------------
// 1. SELECT — which findings does the corrector target? (PURE)
// ---------------------------------------------------------------------------

/**
 * Select the blocking-eligible findings — EXACTLY the set Phase-1 would block on,
 * by reusing `issueIsBlocking` (the shared classifier). A finding is selected iff it
 * clears all three bars: severity high + confidence high|medium + names a specific
 * …/words/N part AND describes a concrete failure mode. Vague/holistic/JSON/hedge
 * findings never clear the bars, so they are skipped.
 *
 * PURE. Exported so the harness can assert the corrector targets feeder/boiler/material
 * findings and skips the rest.
 */
export function selectCorrectableFindings(critique: CritiqueReport | null | undefined): CorrectableFinding[] {
  const issues: CritiqueIssue[] = Array.isArray(critique?.issues) ? (critique!.issues as CritiqueIssue[]) : []
  const out: CorrectableFinding[] = []
  for (const issue of issues) {
    const v = issueIsBlocking(issue)
    if (v.blocking) out.push({ issue, failure_mode: v.tag })
  }
  return out
}

// ---------------------------------------------------------------------------
// 2. LOCATE — resolve a finding to a concrete word object (PURE)
// ---------------------------------------------------------------------------

const modValue = (word: any, kind: string): string => {
  const mods: Array<{ kind?: string; value?: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  const m = mods.find((x) => x?.kind === kind)
  return String(m?.value ?? '').trim()
}

/** Lower-cased alphanumeric tokens (len ≥ 3) from a string, for token-overlap matching. */
function tokens(s: string): string[] {
  return String(s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3)
}

interface FlatWord {
  word: any
  word_id: string
  module_id: string
  module_index: number
  sub_module_id: string
  sub_module_index: number
  word_index: number
}

/** Flatten modules → every word with its full index path. Mirrors part-reality-check's
 *  collectWordRefs traversal but keeps EVERY word (not just MPN-bearing ones) and records
 *  the numeric indices so we can build a `where`-style resolved path. */
export function flattenWords(modules: any[]): FlatWord[] {
  const out: FlatWord[] = []
  const mods: any[] = Array.isArray(modules) ? modules : []
  for (let mi = 0; mi < mods.length; mi++) {
    const m = mods[mi]
    const module_id = String(m?.module ?? m?.id ?? m?.module_id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules)
      ? m.sub_modules
      : Array.isArray(m?.submodules) ? m.submodules : []
    for (let si = 0; si < subs.length; si++) {
      const sm = subs[si]
      const sub_module_id = String(sm?.sub_module_id ?? sm?.id ?? sm?.name ?? 'unknown')
      const wa: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (let wi = 0; wi < wa.length; wi++) {
        const w = wa[wi]
        if (!w || typeof w !== 'object') continue
        out.push({
          word: w,
          word_id: String(w?.id ?? w?.word_id ?? w?.content_character?.character_id ?? 'unknown'),
          module_id,
          module_index: mi,
          sub_module_id,
          sub_module_index: si,
          word_index: wi,
        })
      }
    }
  }
  return out
}

/** Build a stable `where`-style path for the audit trail. */
function pathOf(fw: FlatWord): string {
  return `${fw.module_id}/sub_modules[${fw.sub_module_index}]/words[${fw.word_index}]`
}

/**
 * Resolve a Critic finding to the concrete word it names.
 *
 * The finding's `where` (e.g. "energy_conversion_transduction/sub_modules[3]/words[0]")
 * is LLM-emitted and UNRELIABLE when a module name repeats — verified on the CO₂ release,
 * where the Gericke-feeder finding's stated path resolved to a pH probe (two modules share
 * the name `energy_conversion_transduction`). So we resolve by the PART THE FINDING NAMES,
 * not by blind index navigation:
 *
 *   (a) Score every word by token-overlap between {issue + suggested_check} and the word's
 *       manufacturer + part_number + form + name_human + word_id. The finding text names
 *       "Gericke GLD 87 screw feeder", which overlaps the feeder word strongly and the pH
 *       probe weakly.
 *   (b) Use the `where` path's module-name + word-id token as a TIE-BREAKER / confirmation:
 *       a candidate in a module whose name matches the where-prefix, or whose word_id token
 *       appears in where, gets a bonus. The where INDICES are NOT trusted.
 *   (c) Require a minimum overlap so a finding that names no resolvable part returns null
 *       (→ counted unlocatable, falls through to the gate-33 block).
 *
 * PURE. Returns null when no word clears the minimum match.
 */
export function locateWordForFinding(modules: any[], issue: CritiqueIssue): WordLocation | null {
  const flat = flattenWords(modules)
  if (flat.length === 0) return null

  const where = String(issue?.where ?? '')
  const issueText = `${String(issue?.issue ?? '')} ${String(issue?.suggested_check ?? '')}`
  const needle = new Set(tokens(issueText))
  // where tokens used only as a soft confirmation, never as the primary key.
  const whereModuleName = where.split('/')[0]?.trim().toLowerCase() ?? ''
  const whereTokens = new Set(tokens(where))

  let best: { fw: FlatWord; score: number; method: string } | null = null

  for (const fw of flat) {
    const hay = [
      modValue(fw.word, 'manufacturer'),
      modValue(fw.word, 'part_number'),
      modValue(fw.word, 'form'),
      String(fw.word?.name_human ?? ''),
      fw.word_id,
    ].join(' ')
    const hayTokens = tokens(hay)
    let overlap = 0
    for (const t of hayTokens) if (needle.has(t)) overlap += 1

    // word_id token appearing verbatim in the where path is a strong signal.
    const wordIdTokens = tokens(fw.word_id)
    const whereHasWordId = wordIdTokens.length > 0 && wordIdTokens.some((t) => whereTokens.has(t))

    // module-name agreement with the where-prefix is a soft confirmation.
    const moduleMatches = whereModuleName !== '' && fw.module_id.toLowerCase() === whereModuleName

    let score = overlap
    if (whereHasWordId) score += 3
    if (moduleMatches) score += 1

    let method = 'part-token'
    if (whereHasWordId) method = 'word-id'

    if (!best || score > best.score) best = { fw, score, method }
  }

  if (!best) return null

  // Minimum confidence: require either a where/word-id confirmation, OR a real
  // token overlap (≥2 shared content tokens). A finding that names no resolvable
  // part scores ~0 and returns null.
  const MIN_SCORE = 2
  if (best.score < MIN_SCORE) return null

  // If exactly one word's id token matches the where path, prefer the
  // single-candidate label for the audit trail.
  const method = best.method

  return {
    word: best.fw.word,
    word_id: best.fw.word_id,
    module_id: best.fw.module_id,
    module_index: best.fw.module_index,
    sub_module_id: best.fw.sub_module_id,
    sub_module_index: best.fw.sub_module_index,
    word_index: best.fw.word_index,
    resolved_path: pathOf(best.fw),
    match_method: method,
  }
}

// ---------------------------------------------------------------------------
// 3. PARSE — turn the LLM's reply into a structured correction (PURE)
// ---------------------------------------------------------------------------

/** Strip ```json fences / preamble and JSON.parse. Returns null on failure. */
function parseLooseJson(text: string): any | null {
  const t = String(text ?? '').trim()
  if (!t) return null
  // try direct parse first
  try {
    return JSON.parse(t)
  } catch { /* fall through */ }
  // strip code fences
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try { return JSON.parse(fence[1].trim()) } catch { /* fall through */ }
  }
  // grab the first {...} block
  const brace = t.match(/\{[\s\S]*\}/)
  if (brace) {
    try { return JSON.parse(brace[0]) } catch { /* fall through */ }
  }
  return null
}

/**
 * Parse the LLM's corrected-modifier reply. Expected JSON shape:
 *   { "declined": false,
 *     "rationale": "...",
 *     "modifiers": { "manufacturer": "...", "part_number": "...", "rating_primary": "...", ... } }
 * OR, when the model cannot fix without violating the brief:
 *   { "declined": true, "declined_reason": "only fixable by reducing the brief's K2SO4 target" }
 *
 * Restricts modifiers to CORRECTABLE_MODIFIER_KINDS, coerces to strings, drops empties,
 * and keeps one value per kind. PURE — never throws; a malformed reply yields a
 * declined=true correction with an llm-parse note so the loop falls through cleanly.
 */
export function parseCorrection(text: string): ParsedCorrection {
  const obj = parseLooseJson(text)
  if (!obj || typeof obj !== 'object') {
    return { modifiers: {}, rationale: '', declined: true, declined_reason: 'unparseable LLM reply' }
  }
  if (obj.declined === true) {
    return {
      modifiers: {},
      rationale: String(obj.rationale ?? ''),
      declined: true,
      declined_reason: String(obj.declined_reason ?? obj.reason ?? 'model declined to correct'),
    }
  }
  const rawMods = (obj.modifiers && typeof obj.modifiers === 'object') ? obj.modifiers : {}
  const modifiers: Partial<Record<CorrectableModifierKind, string>> = {}
  for (const kind of CORRECTABLE_MODIFIER_KINDS) {
    const v = rawMods[kind]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (!s) continue
    modifiers[kind] = s   // one value per kind by construction (object key)
  }
  // A correction with no usable modifiers is effectively a decline.
  if (Object.keys(modifiers).length === 0) {
    return {
      modifiers: {},
      rationale: String(obj.rationale ?? ''),
      declined: true,
      declined_reason: 'LLM returned no usable corrected modifiers',
    }
  }
  return {
    modifiers,
    rationale: String(obj.rationale ?? ''),
    declined: false,
  }
}

// ---------------------------------------------------------------------------
// 4. APPLY — surgical in-place patch of a word's modifier_characters (PURE-ish)
// ---------------------------------------------------------------------------

/** Snapshot the correctable modifier kinds currently on a word (for before/after). */
export function snapshotModifiers(word: any): Record<string, string> {
  const out: Record<string, string> = {}
  const mods: Array<{ kind?: string; value?: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []
  for (const m of mods) {
    const k = String(m?.kind ?? '')
    if (!k) continue
    if ((CORRECTABLE_MODIFIER_KINDS as readonly string[]).includes(k)) {
      out[k] = String(m?.value ?? '')
    }
  }
  return out
}

/**
 * Apply a parsed correction to a word IN PLACE, the same surgical idiom Stage 10.5
 * Part Reality Check uses (find-or-replace each modifier by kind, one value per kind),
 * plus a `source_detail` stamp recording the swap so gate-20 / the BoM audit can see the
 * provenance. The word's id + content_character are NOT touched (identity-lock). Returns
 * the before/after modifier maps. Mutates `word.modifier_characters` only.
 */
export function applyCorrectionToWord(
  word: any,
  correction: ParsedCorrection,
  finding: { issue: string; failure_mode: string },
): { before: Record<string, string>; after: Record<string, string> } {
  const before = snapshotModifiers(word)
  const mods: Array<{ kind: string; value: string }> = Array.isArray(word?.modifier_characters)
    ? word.modifier_characters
    : []

  const setMod = (kind: string, value: string) => {
    const idx = mods.findIndex((x) => x.kind === kind)
    if (idx >= 0) mods[idx] = { kind, value }
    else mods.push({ kind, value })
  }

  for (const [kind, value] of Object.entries(correction.modifiers)) {
    if (value === undefined || value === null) continue
    const s = String(value).trim()
    if (!s) continue
    setMod(kind, s)
  }

  // Provenance stamp (gate-20 / BoM audit can see this was a physics auto-correction).
  const beforeStr = Object.entries(before).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'
  const stamp =
    `Physics-Critic auto-correct (${finding.failure_mode}): re-spec'd to clear the flagged failure ` +
    `[${String(finding.issue).replace(/\s+/g, ' ').slice(0, 160)}]. Was {${beforeStr}}.`
  setMod('source_detail', stamp)

  word.modifier_characters = mods
  const after = snapshotModifiers(word)
  return { before, after }
}

// ---------------------------------------------------------------------------
// 5. RE-SPEC PROMPT + LLM call (impure; caller injects the LLM function)
// ---------------------------------------------------------------------------

/** A subset of brief constraints the corrector must NOT relax (passed into the prompt). */
export interface BriefPinSummary {
  /** Human-readable list of the brief's primary, NON-negotiable metrics/constraints. */
  pinned_lines: string[]
  product_class?: string
}

/** Build a compact brief-pin block. Tolerant of partial/absent briefs. */
export function buildBriefPinSummary(parsedBrief: any, productClass?: string): BriefPinSummary {
  const lines: string[] = []
  const c = parsedBrief?.constraints ?? {}
  const tp = c?.target_performance ?? parsedBrief?.target_performance ?? {}
  const metrics: any[] = Array.isArray(tp?.metrics) ? tp.metrics : []
  for (const m of metrics) {
    const name = m?.name ?? m?.metric ?? m?.key
    const val = m?.value ?? m?.target ?? m?.min ?? m?.max
    const unit = m?.unit ?? ''
    if (name !== undefined && val !== undefined) lines.push(`${name} = ${val} ${unit}`.trim())
  }
  if (c?.unit_cost_ceiling !== undefined) lines.push(`unit_cost_ceiling = ${c.unit_cost_ceiling}`)
  if (c?.max_mass_kg !== undefined) lines.push(`max_mass_kg = ${c.max_mass_kg}`)
  for (const ac of (Array.isArray(c?.additional_constraints) ? c.additional_constraints : [])) {
    if (typeof ac === 'string' && ac.trim()) lines.push(ac.trim())
  }
  return { pinned_lines: lines.slice(0, 24), product_class: productClass }
}

/** Build the re-spec user prompt for one flagged word. */
export function buildRespecPrompt(args: {
  finding: { failure_mode: string; issue: string; suggested_check?: string }
  word: any
  briefPins: BriefPinSummary
}): string {
  const { finding, word, briefPins } = args
  const currentMods = snapshotModifiers(word)
  const currentStr = JSON.stringify(currentMods, null, 2)
  const partName = String(word?.name_human ?? word?.id ?? 'the flagged part')
  const pins = briefPins.pinned_lines.length
    ? briefPins.pinned_lines.map((l) => `  - ${l}`).join('\n')
    : '  (none provided)'

  return `You are a senior systems engineer making a SURGICAL part substitution to FIX a part the physics check has proven will FAIL. Output ONLY JSON.

PRODUCT CLASS: ${briefPins.product_class ?? 'unknown'}

THE FLAGGED PART (you may change its make/model/spec ONLY — it stays the same functional component):
  name: ${partName}
  failure mode: ${finding.failure_mode}
  current spec (modifier_characters, kind → value):
${currentStr}

THE PROVEN FAILURE (do the engineering; the fix must clear THIS):
  ${finding.issue}
${finding.suggested_check ? `  suggested fix: ${finding.suggested_check}` : ''}

BRIEF CONSTRAINTS YOU MUST NOT RELAX (these are the customer's requirements — change the PART to MEET them, NEVER change the requirement):
${pins}

RULES (read twice):
1. Keep the SAME functional component class. If the failure is an undersized feeder, pick a BIGGER feeder of the same type — do NOT replace it with a pump, a tank, or a cheaper different part. Upsizing/upgrading the make+model is the goal; functional substitution is forbidden (it games the check).
2. Pick a GENUINE, real-world part: a real manufacturer + a real catalogue model number that actually exists and is rated to clear the failure (with a sensible engineering margin). For commodity items, a precise commodity descriptor + correct material/grade is acceptable. NEVER invent a plausible-looking but fictional part number — a fabricated MPN is worse than none and will be rejected downstream.
3. Update EVERY spec field the change implies: if you upsize the feeder you must update its rating/capacity AND its part_number AND (if you know it) its price. One value per field.
4. If — and ONLY if — the failure cannot be fixed WITHOUT relaxing a brief constraint above, do NOT guess: return {"declined": true, "declined_reason": "<which brief constraint blocks any in-class fix>"}. The chain will surface that for human review.

Return ONLY this JSON (no markdown fences, no preamble):
{
  "declined": false,
  "rationale": "<one sentence: what you changed and the new rating vs the required demand>",
  "modifiers": {
    "manufacturer": "<real manufacturer>",
    "part_number": "<real catalogue model>",
    "form": "<short descriptor of the part>",
    "rating_primary": "<the rating that now clears the failure, with unit>",
    "capacity": "<if applicable, with unit>",
    "dimension": "<if applicable>",
    "material": "<if applicable>",
    "list_price_gbp": "<updated unit price in GBP, number only, if you can estimate it>"
  }
}
Include ONLY the modifier keys that actually change or are needed to make the fix coherent. Omit keys you are not changing.`
}

/** The injected LLM caller signature (matches a thin wrapper around callFastExtract). */
export type RespecLLM = (prompt: string) => Promise<string>

/**
 * Ask the LLM to re-spec one flagged word. Impure (calls the injected LLM). Returns a
 * parsed correction; on any LLM error returns a declined correction tagged llm_error so
 * the loop falls through to the gate-33 block rather than throwing.
 */
export async function respecPartViaLLM(args: {
  finding: { failure_mode: string; issue: string; suggested_check?: string }
  word: any
  briefPins: BriefPinSummary
  llm: RespecLLM
}): Promise<ParsedCorrection & { llm_error?: boolean }> {
  const prompt = buildRespecPrompt(args)
  let raw: string
  try {
    raw = await args.llm(prompt)
  } catch (e) {
    return {
      modifiers: {},
      rationale: '',
      declined: true,
      declined_reason: `LLM error: ${(e as Error).message}`,
      llm_error: true,
    }
  }
  return parseCorrection(raw)
}

// ---------------------------------------------------------------------------
// 6. ORCHESTRATION — the bounded correct → re-check loop
// ---------------------------------------------------------------------------

/** Callback the orchestrator uses to re-run the Physics Critic on the patched modules. */
export type ReCritiqueFn = (modules: any[]) => Promise<CritiqueReport | null>

/** Optional action logger (the chain passes its logAction). */
export type ActionLogger = (record: Record<string, any>) => void

/**
 * Run the Physics-Critic Phase-2 auto-correct loop.
 *
 * For each blocking-eligible HIGH finding in `critique`, locate the named word, ask the
 * LLM for a corrected modifier set, apply it (ENABLED) or compute the would-be patch
 * (SHADOW), then RE-RUN the Critic and keep only corrections whose specific `where`
 * cleared. Loops at most `maxPasses` (default 2): a pass re-selects from the LATEST
 * critique, so a correction that introduced a new failure, or a finding that did not
 * clear, is retried (bounded). Anything still blocking after the loop is reported as
 * uncorrectable and falls through to the gate-33 enforcement decision.
 *
 * SHADOW vs ENABLED:
 *   - SHADOW (default): computes every correction it WOULD apply and re-critiques against
 *     a DEEP COPY (the shipped `modules` is never mutated). `final_critique` is the
 *     ORIGINAL critique (the gate sees the un-corrected design, as if Phase 2 were off),
 *     so a first build cannot silently change what ships. Records carry applied=false.
 *   - ENABLED (=1): mutates the real `modules` in place; `final_critique` is the
 *     post-correction critique the enforcement gate then reads.
 *
 * Returns the result; the caller persists it to state.physicsCriticAutocorrect and logs
 * each record to actions.jsonl.
 */
export async function runPhysicsCriticAutocorrect(args: {
  modules: any[]
  critique: CritiqueReport | null
  parsedBrief: any
  productClass: string
  mode: PhysicsCriticAutocorrectMode
  llm: RespecLLM
  reCritique: ReCritiqueFn
  log?: ActionLogger
  maxPasses?: number
}): Promise<PhysicsCriticAutocorrectResult> {
  const { parsedBrief, productClass, mode, llm, reCritique } = args
  const log = args.log ?? (() => {})
  const maxPasses = Math.max(1, Math.min(2, args.maxPasses ?? 2))

  const result: PhysicsCriticAutocorrectResult = {
    mode,
    passes_run: 0,
    selected: 0,
    corrected: 0,
    declined: 0,
    unlocatable: 0,
    uncorrectable_after_passes: 0,
    records: [],
    final_critique: args.critique ?? null,
  }

  // Nothing to do if the original critique has no blocking-eligible findings.
  const initiallySelected = selectCorrectableFindings(args.critique)
  result.selected = initiallySelected.length
  if (initiallySelected.length === 0) {
    log({ step: 'physics_autocorrect', action_type: 'stage_summary', mode, selected: 0, note: 'no blocking-eligible findings; nothing to correct' })
    return result
  }

  // SHADOW operates on a deep copy so the shipped design is never touched; ENABLED
  // operates on the real modules. The re-critique callback always receives whichever
  // modules array is the "working" one for this mode.
  const working: any[] = mode === 'enabled'
    ? args.modules
    : JSON.parse(JSON.stringify(args.modules))

  const briefPins = buildBriefPinSummary(parsedBrief, productClass)

  // Track which `where` paths we have already RESOLVED + corrected, so re-passes don't
  // re-correct an already-cleared word (we only retry still-failing ones).
  let currentCritique: CritiqueReport | null = args.critique ?? null

  for (let pass = 1; pass <= maxPasses; pass++) {
    const selected = selectCorrectableFindings(currentCritique)
    if (selected.length === 0) break
    result.passes_run = pass

    let appliedThisPass = 0

    for (const { issue, failure_mode } of selected) {
      const loc = locateWordForFinding(working, issue)
      const baseRec: CorrectionRecord = {
        where: String(issue.where ?? '?'),
        resolved_path: loc?.resolved_path ?? '(unresolved)',
        match_method: loc?.match_method ?? 'none',
        word_id: loc?.word_id ?? '?',
        module_id: loc?.module_id ?? '?',
        sub_module_id: loc?.sub_module_id ?? '?',
        failure_mode,
        issue: String(issue.issue ?? '').replace(/\s+/g, ' ').slice(0, 240),
        suggested_check: issue.suggested_check ? String(issue.suggested_check).slice(0, 200) : undefined,
        before: {},
        after: {},
        rationale: '',
        pass,
        applied: false,
        cleared: null,
        status: 'uncleared',
      }

      if (!loc) {
        result.unlocatable += 1
        baseRec.status = 'unlocatable'
        baseRec.note = 'could not resolve the finding to a specific word by its part tokens; falls through to gate-33'
        result.records.push(baseRec)
        log({ step: 'physics_autocorrect', action_type: 'autocorrect_unlocatable', mode, pass, where: baseRec.where, failure_mode })
        continue
      }

      const respec = await respecPartViaLLM({ finding: { failure_mode, issue: String(issue.issue ?? ''), suggested_check: issue.suggested_check }, word: loc.word, briefPins, llm })

      if (respec.declined) {
        result.declined += 1
        baseRec.status = (respec as any).llm_error ? 'llm_error' : 'declined'
        baseRec.rationale = respec.rationale
        baseRec.note = respec.declined_reason
        baseRec.before = snapshotModifiers(loc.word)
        baseRec.after = baseRec.before
        result.records.push(baseRec)
        log({ step: 'physics_autocorrect', action_type: 'autocorrect_declined', mode, pass, where: baseRec.where, resolved_path: loc.resolved_path, failure_mode, reason: respec.declined_reason })
        continue
      }

      // Apply (mutates `working`, which is the real modules only in ENABLED mode).
      const { before, after } = applyCorrectionToWord(loc.word, respec, { issue: String(issue.issue ?? ''), failure_mode })
      baseRec.before = before
      baseRec.after = after
      baseRec.rationale = respec.rationale
      baseRec.applied = mode === 'enabled'
      result.records.push(baseRec)
      appliedThisPass += 1
      log({
        step: 'physics_autocorrect',
        action_type: 'autocorrect_patch',
        mode,
        pass,
        where: baseRec.where,
        resolved_path: loc.resolved_path,
        match_method: loc.match_method,
        word_id: loc.word_id,
        failure_mode,
        before,
        after,
        rationale: respec.rationale,
        applied: baseRec.applied,
      })
    }

    if (appliedThisPass === 0) break   // only declines/unlocatables this pass — re-critique won't change

    // Re-run the Critic on the working modules to see which faults cleared.
    const reCrit = await reCritique(working)
    currentCritique = reCrit
    const stillBlocking = selectCorrectableFindings(reCrit)
    const stillByPath = new Set(stillBlocking.map((f) => String(f.issue.where ?? '')))

    // Mark cleared status on this pass's applied records by whether their where survived.
    for (const rec of result.records) {
      if (rec.pass !== pass || rec.status !== 'uncleared') continue
      // A correction "cleared" if its where (and its resolved path's module/word) no
      // longer appears as a blocking finding.
      const survived = stillByPath.has(rec.where) ||
        stillBlocking.some((f) => locateMatchesRecord(reCrit, f.issue, rec))
      if (!survived) {
        rec.cleared = true
        rec.status = 'corrected'
        result.corrected += 1
      } else {
        rec.cleared = false
        rec.status = 'uncleared'
      }
    }

    log({ step: 'physics_autocorrect', action_type: 'autocorrect_recheck', mode, pass, still_blocking: stillBlocking.length })

    if (stillBlocking.length === 0) break
  }

  // Final accounting: anything still selected after the loop is uncorrectable → gate 33.
  const finalSelected = selectCorrectableFindings(currentCritique)
  result.uncorrectable_after_passes = finalSelected.length

  // SHADOW: the shipped design is unchanged, so the enforcement gate must see the
  // ORIGINAL critique (not the would-be-corrected one). ENABLED: the gate reads the
  // post-correction critique because the real modules were patched.
  result.final_critique = mode === 'enabled' ? currentCritique : (args.critique ?? null)

  log({
    step: 'physics_autocorrect',
    action_type: 'stage_summary',
    mode,
    passes_run: result.passes_run,
    selected: result.selected,
    corrected: result.corrected,
    declined: result.declined,
    unlocatable: result.unlocatable,
    uncorrectable_after_passes: result.uncorrectable_after_passes,
  })

  return result
}

/** Helper: does a still-blocking finding refer to the same word as a prior record? Used
 *  to decide whether a record's fault survived re-critique even if the where string drifted
 *  (the re-run LLM may phrase `where` slightly differently). Compares resolved word_id. */
function locateMatchesRecord(critique: CritiqueReport | null, issue: CritiqueIssue, rec: CorrectionRecord): boolean {
  // Cheap structural check: if the finding's where path module + a word-id token match
  // the record's resolved word, treat it as the same unresolved fault.
  const w = String(issue?.where ?? '').toLowerCase()
  const recWord = String(rec.word_id ?? '').toLowerCase()
  if (recWord && recWord !== '?' && recWord !== 'unknown') {
    const recTokens = recWord.split(/[^a-z0-9]+/i).filter((t) => t.length >= 3)
    if (recTokens.some((t) => w.includes(t))) return true
  }
  return false
}
