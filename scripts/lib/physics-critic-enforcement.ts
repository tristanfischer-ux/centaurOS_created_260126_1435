// physics-critic-enforcement.ts
//
// THE CORRECTIVE PHYSICS-CRITIC GATE (chain exit 33) — the "never ship a part
// the engine KNOWS will fail" guarantee.
//
// WHY THIS EXISTS (Tristan 2026-06-04: "what is the point of suggesting a part
// that it knows will fail?"). The Physics Critic (Stage 7.5, runPhysicsCritic →
// `7-5-physics-critique.json`) already does the first-principles engineering
// maths the structural gates skip — it caught, on the CO₂-mineralisation
// release, an MDPE buffer tank spec'd for a 120 °C MEA-stripper loop ("MDPE has
// a maximum service temperature of 60-80 °C and melts around 120-130 °C … it
// will lose structural integrity and fail"). But that finding was purely
// ADVISORY: the chain recorded it as a HIGH, fed it to R4 as a suggested check,
// and then rendered the flagged MDPE tank straight into the BoM anyway (exit 0).
// AUDIT.md surfaced "[HIGH] F-4 … 1 HIGH-severity engineering issue" but nothing
// blocked. That is incoherent — the dossier recommends a part the engine's own
// physics check has already proven wrong.
//
// THIS MODULE makes that finding CORRECTIVE (Phase 1: block). It is the PURE
// decision function the chain's enforcing mode calls to hard-exit when the
// Critic has flagged a SPECIFIC part with a CONCRETE, high-confidence failure
// mode. It mirrors `evaluateSelfAuditEnforcement` in semantic-self-audit.ts
// exactly: pure + deterministic given (critique, mode), returns
// {shouldExit, exitCode, reasons}, harness-tested both directions.
//
// SHADOW by default (mirrors the K10 / self-audit / cost-sanity ladder): the
// chain records `state.physicsCriticEnforcement`, logs the verdict, and NEVER
// exits unless `PHYSICS_CRITIC_ENFORCING` is set. Default OFF so an in-flight
// re-run is never blocked. Exit code 33 when enforcing and a blocking fault is
// present.
//
// FALSE-POSITIVE DISCIPLINE (the whole point of a PURE block predicate — the
// Critic is an LLM, grok/gemini, and LLMs flake): we block ONLY on findings
// that clear THREE bars simultaneously, so a vague or holistic concern can never
// hard-exit the chain:
//   (a) severity === 'high'                — the Critic's own strongest verdict;
//   (b) confidence is high or medium       — it "did the maths", per the Critic's
//                                            honesty contract (low/unknown never block);
//   (c) it NAMES A SPECIFIC COMPONENT       — the `where` field points at a concrete
//       AND describes a CONCRETE FAILURE       word/part path (…/words/N) and the
//       MODE                                   `issue` text matches a recognised
//                                              failure-mode pattern (material-vs-
//                                              temperature, undersized-vs-load,
//                                              pressure/voltage-vs-rating, melt/
//                                              corrosion/rupture-of-a-named-part).
// A holistic "perform a detailed load-list analysis" MED, or a HIGH that merely
// says "the system is over-constrained", does NOT clear bar (c) and never blocks.
//
// PHASE 2 (NOT built here — see the design note at the foot of this file and in
// the report): instead of blocking, FEED the blocking finding back to re-emit a
// COMPLIANT part (e.g. swap the MDPE tank for the Critic's own suggested 316L
// stainless vessel rated for 120 °C) and RE-RUN the Critic to confirm the fault
// cleared — the full self-correcting loop. Phase 1 (block) is the immediate
// guarantee that a KNOWN-failing part never reaches a paying client.

import type { CritiqueReport, CritiqueIssue } from '../../src/lib/pdf-engine-v2/radical/physics-critic'

// ---------------------------------------------------------------------------
// Concrete-failure-mode detection (universal — no per-class table)
// ---------------------------------------------------------------------------

/**
 * Does `where` point at a SPECIFIC component/part, rather than a whole module or
 * a holistic system concern? The Critic addresses individual parts with a path
 * ending in a word/part index (e.g.
 *   "mass_fluid_transport_process/MEA Recovery & Recycle/sub_modules/0/words/3").
 * A holistic finding typically targets a module/sub-module level or carries no
 * part path at all. We require a words/parts/components leaf OR an explicit
 * part-ish token, so a "module X is over-constrained" finding does NOT qualify.
 */
export function whereNamesSpecificComponent(where: string): boolean {
  const w = String(where ?? '').trim()
  if (!w) return false
  // a path that drills to an individual word/part/component/item leaf
  if (/\b(?:word|part|component|item|element)s?\s*[/_:#-]?\s*\d+/i.test(w)) return true
  if (/\/words?\//i.test(w) || /\/parts?\//i.test(w) || /\/components?\//i.test(w)) return true
  return false
}

/**
 * Concrete, physically-determinate failure modes — the patterns where the Critic
 * has compared a named part's rating against a named demand and found it short.
 * Each entry is a recognised "this specific part will fail" shape:
 *   - material-vs-temperature  (melt / max service temp exceeded / thermal degradation)
 *   - chemical incompatibility of a named material with a named fluid
 *   - undersized-vs-load       (rated < required; under-rated current/power/flow/torque)
 *   - pressure/voltage-vs-rating (operating pressure or voltage exceeds the part's rating)
 *   - mechanical failure of a named part (rupture / yield / buckling / fracture under load)
 *
 * Deliberately CONSERVATIVE: a phrase must assert a determinate exceedance/failure,
 * not merely a "verify" / "consider" / "may be marginal" hedge. The hedge words are
 * filtered separately (see isHedgeOnly) so a bar-(a)+(b) HIGH that is purely advisory
 * ("verify the rating") does NOT block.
 */
const CONCRETE_FAILURE_PATTERNS: Array<{ tag: string; re: RegExp }> = [
  // material / component vs temperature — the canonical MDPE-at-120 °C case
  { tag: 'material-vs-temperature', re: /\b(?:max(?:imum)?\s+(?:service|operating|continuous)\s+temperature|melt(?:s|ing)?(?:\s+point)?|softening\s+point|glass\s+transition|thermal(?:ly)?\s+(?:degrad|decompos))/i },
  { tag: 'material-vs-temperature', re: /\b(?:will|would|shall)\s+(?:melt|soften|deform|lose\s+(?:structural\s+)?integrity|fail\s+(?:thermally|at\s+temperature))/i },
  { tag: 'temperature-exceeds-rating', re: /\b(?:operat\w+|service|process|stripping|exhaust|flue|steam)\s+temperature\b[^.]{0,80}?\b(?:exceed|above|over|beyond|higher\s+than)\b/i },
  { tag: 'temperature-exceeds-rating', re: /\b(?:exceed|above|over|beyond)\b[^.]{0,40}?\b(?:max(?:imum)?\s+(?:service|operating|rated)\s+temperature|temperature\s+rating)/i },
  // chemical incompatibility of a named material with a named fluid/medium
  { tag: 'chemical-incompatibility', re: /\b(?:incompatible|not\s+compatible|chemically\s+attack|corrod\w+|degrad\w+|embrittl\w+|swell\w+)\b[^.]{0,80}?\b(?:with|by|in)\b/i },
  // undersized vs load — rated below required (current/power/flow/torque/duty)
  { tag: 'undersized-vs-load', re: /\b(?:under-?sized|under-?rated|insufficient(?:ly)?\s+rated|too\s+small|cannot\s+(?:supply|deliver|handle|carry|reject|dissipate)|unable\s+to\s+(?:supply|deliver|handle|carry))\b/i },
  { tag: 'undersized-vs-load', re: /\brated\b[^.]{0,40}?\b(?:below|less\s+than|under|short\s+of)\b[^.]{0,40}?\b(?:required|demand|load|continuous|peak|design)\b/i },
  { tag: 'undersized-vs-load', re: /\b(?:exceed|above|over|beyond|greater\s+than)\b[^.]{0,60}?\b(?:rating|rated\s+(?:current|power|capacity|load|flow|torque)|capacity\s+of\s+the)\b/i },
  // pressure / voltage vs rating
  { tag: 'pressure-vs-rating', re: /\b(?:operat\w+|design|working|process)\s+pressure\b[^.]{0,80}?\b(?:exceed|above|over|beyond|higher\s+than)\b[^.]{0,40}?\b(?:rating|rated|max)/i },
  { tag: 'voltage-vs-rating', re: /\b(?:operat\w+|bus|system|string|dc|ac)\s+voltage\b[^.]{0,80}?\b(?:exceed|above|over|beyond|higher\s+than)\b[^.]{0,40}?\b(?:rating|rated|withstand|insulation)/i },
  // explicit mechanical failure of a named part under load
  { tag: 'mechanical-failure', re: /\b(?:will|would|shall)\s+(?:rupture|burst|yield|buckle|fracture|crack|collapse|fail\s+(?:structurally|mechanically|under\s+(?:load|pressure)))/i },
]

/**
 * Hedge-only language: the finding asks the reader to CHECK / VERIFY / CONSIDER a
 * value but does NOT itself assert a determinate failure. These are advisory even
 * at HIGH severity and must NOT block. We treat a finding as hedge-only when it
 * matches a hedge cue AND matches no concrete-failure pattern (the concrete patterns
 * win — a finding that both states the failure AND suggests a check still blocks).
 */
function isHedgeOnly(text: string): boolean {
  const t = String(text ?? '')
  const hedge = /\b(?:verify|please\s+verify|confirm|consider|review|re-?check|recommend(?:ed)?\s+to|may\s+be\s+marginal|might\s+be|could\s+be|perform\s+a\s+detailed|carry\s+out\s+a)\b/i.test(t)
  if (!hedge) return false
  return !CONCRETE_FAILURE_PATTERNS.some((p) => p.re.test(t))
}

/**
 * Does this single issue describe a CONCRETE failure mode of a named part? PURE.
 * Reads `issue` (+ `suggested_check` as secondary context) for a recognised
 * failure-mode pattern, after excluding hedge-only advisories.
 */
export function issueDescribesConcreteFailure(issue: CritiqueIssue): { matched: boolean; tag: string } {
  const body = String(issue?.issue ?? '')
  // suggested_check is corroborating context only — a concrete pattern must appear
  // in the issue body itself, so a benign issue with an aggressive suggested_check
  // ("replace the …") cannot, on its own, trip the block.
  if (isHedgeOnly(body)) return { matched: false, tag: '' }
  for (const p of CONCRETE_FAILURE_PATTERNS) {
    if (p.re.test(body)) return { matched: true, tag: p.tag }
  }
  return { matched: false, tag: '' }
}

// ---------------------------------------------------------------------------
// The block predicate + the pure enforcement decision (mirrors self-audit)
// ---------------------------------------------------------------------------

export type PhysicsCriticEnforceMode = 'off' | 'on'

/** Fatal chain exit code for an enforced physics-critic block. Next free after
 *  32 (see CLAUDE.md exit-code table). Module-local: consumers read
 *  decision.exitCode, nothing imports the constant. */
export const PHYSICS_CRITIC_EXIT_CODE = 33

export interface PhysicsCriticBlockingFault {
  where: string
  failure_mode: string   // the concrete-failure tag (material-vs-temperature, …)
  confidence: string
  issue: string          // truncated for the log
  suggested_check?: string
}

export interface PhysicsCriticEnforcementDecision {
  shouldExit: boolean
  exitCode: number        // PHYSICS_CRITIC_EXIT_CODE when shouldExit, else 0
  mode: PhysicsCriticEnforceMode
  reasons: string[]       // one human-readable reason per blocking fault (empty if none)
  blockingFaults: PhysicsCriticBlockingFault[]
}

const truncate = (s: any, n: number): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/**
 * Is a single Critic issue a BLOCKING "this specific part will fail" finding?
 * The THREE bars (all required):
 *   (a) severity === 'high'
 *   (b) confidence ∈ {high, medium}            — low/unknown never block (Critic honesty contract)
 *   (c) names a SPECIFIC component (where)  AND describes a CONCRETE failure mode (issue)
 * PURE. Exported so the harness can assert it directly.
 */
export function issueIsBlocking(issue: CritiqueIssue): { blocking: boolean; tag: string } {
  if (!issue) return { blocking: false, tag: '' }
  if (String(issue.severity).toLowerCase() !== 'high') return { blocking: false, tag: '' }
  const conf = String(issue.confidence ?? '').toLowerCase()
  if (conf !== 'high' && conf !== 'medium') return { blocking: false, tag: '' }   // bar (b)
  if (!whereNamesSpecificComponent(issue.where)) return { blocking: false, tag: '' } // bar (c) part-naming
  const concrete = issueDescribesConcreteFailure(issue)                              // bar (c) failure-mode
  if (!concrete.matched) return { blocking: false, tag: '' }
  return { blocking: true, tag: concrete.tag }
}

/**
 * PURE + deterministic given (critique, mode): decide whether enforcing mode must
 * hard-exit the chain because the Physics Critic has flagged a SPECIFIC part with
 * a CONCRETE, high-confidence failure mode. A vague/holistic concern, a low/unknown
 * confidence flag, a MED, or an advisory "verify the rating" never blocks (matching
 * the gate-severity philosophy: a KNOWN-WRONG part hard-exits, a soft deviation
 * flags + renders). Harness-tested both directions
 * (UNIVERSAL.physics_critic_enforcement_blocks_failing_part).
 *
 * NEVER throws — a malformed/absent critique yields a clean no-block decision, so a
 * Critic that errored upstream (returns null → caller passes null) can never wedge
 * the chain.
 */
export function evaluatePhysicsCriticEnforcement(
  critique: CritiqueReport | null | undefined,
  mode: PhysicsCriticEnforceMode,
): PhysicsCriticEnforcementDecision {
  const base: PhysicsCriticEnforcementDecision = { shouldExit: false, exitCode: 0, mode, reasons: [], blockingFaults: [] }
  if (mode === 'off') return base
  const issues: CritiqueIssue[] = Array.isArray(critique?.issues) ? (critique!.issues as CritiqueIssue[]) : []
  const reasons: string[] = []
  const blockingFaults: PhysicsCriticBlockingFault[] = []
  for (const issue of issues) {
    const v = issueIsBlocking(issue)
    if (!v.blocking) continue
    blockingFaults.push({
      where: String(issue.where ?? '?'),
      failure_mode: v.tag,
      confidence: String(issue.confidence ?? '?'),
      issue: truncate(issue.issue, 200),
      suggested_check: issue.suggested_check ? truncate(issue.suggested_check, 160) : undefined,
    })
    reasons.push(`physics:${v.tag} @ ${truncate(issue.where, 80)} — ${truncate(issue.issue, 140)}`)
  }
  const shouldExit = reasons.length > 0
  return {
    shouldExit,
    exitCode: shouldExit ? PHYSICS_CRITIC_EXIT_CODE : 0,
    mode,
    reasons,
    blockingFaults,
  }
}

/** Map PHYSICS_CRITIC_ENFORCING to a mode. unset / 0 / false / off / no / shadow → off;
 *  anything else truthy (1 / true / on / enforce / enforcing) → on. Default is OFF
 *  (shadow) so an in-flight re-run is NEVER blocked unless the operator opts in. */
export function physicsCriticEnforceModeFromEnv(v: string | undefined): PhysicsCriticEnforceMode {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no' || s === 'shadow') return 'off'
  return 'on'
}

/** Convenience for the chain: decide in one call from the env value. */
export function runPhysicsCriticEnforcement(
  critique: CritiqueReport | null | undefined,
  envValue?: string,
): PhysicsCriticEnforcementDecision {
  return evaluatePhysicsCriticEnforcement(critique, physicsCriticEnforceModeFromEnv(envValue))
}

// ---------------------------------------------------------------------------
// PHASE 2 — AUTO-CORRECT (DESIGN NOTE ONLY; NOT built in this change)
// ---------------------------------------------------------------------------
//
// Phase 1 above is the "never ship a known-failing part" BLOCK guarantee. Phase 2
// closes the loop so the chain CORRECTS rather than merely refuses:
//
//   1. For each blocking fault, the Critic ALREADY emits a `suggested_check` that
//      names the compliant replacement (e.g. MDPE buffer tank → "316L stainless
//      steel vessel rated for the operating temperature and chemical
//      compatibility"). Parse that into a structured re-spec instruction
//      {word path (from `where`), new material/part, required rating}.
//   2. Re-emit the flagged word: patch the offending `modifier_characters`
//      (material / part_number / rating) in place at the `where` path — the same
//      surgical patch mechanism Stage 10.5 Part Reality Check already uses to
//      substitute a fictional MPN. (Owned by the emitter team — this module would
//      only PRODUCE the instruction, never edit the emitter directly.)
//   3. RE-RUN runPhysicsCritic on the patched design and confirm the specific
//      fault cleared (the same `where` no longer returns a blocking finding).
//      Bound the loop to ≤2 correction passes; if it still fails, fall back to the
//      Phase-1 BLOCK (exit 33) so a part the engine cannot fix is never shipped.
//   4. Record before/after in actions.jsonl ("R-PHYS corrected words/3:
//      MDPE → 316L SS at step 7.5") so the auto-correction is auditable.
//
// Net effect: the dossier ships a part that PASSES the physics check, not one the
// engine knew would fail — the self-correcting behaviour Tristan asked for. Phase 1
// is the safety floor that makes Phase 2 safe to build incrementally.
