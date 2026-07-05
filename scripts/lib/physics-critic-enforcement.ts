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
import { execFileSync } from 'child_process'
import { resolve } from 'path'

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
  // a path that drills to an individual word/part/component/item leaf.
  // The Physics Critic emits the BRACKET form in practice — e.g.
  //   "energy_conversion_transduction/sub_modules[3]/words[0]" — so the index
  //   separator class MUST include "[" (verified 2026-06-04: the live CO₂
  //   critique's `words[0]` was silently rejected by the slash-only form, so
  //   gate 33 + the Phase-2 corrector both selected ZERO findings). We also keep
  //   the slash/underscore/colon/hash/dash forms ("words/3", "word_3", "part-7").
  if (/\b(?:word|part|component|item|element)s?\s*[[/_:#-]?\s*\d+/i.test(w)) return true
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
  // 2026-06-04: the live CO₂ feeder HIGH phrased undersizing as "rated for only
  //   106 kg/h … creates a severe bottleneck, limiting the maximum throughput …
  //   a 35% deficit against the brief" — none of the patterns above matched it,
  //   so the named-part HIGH evaded gate 33 and the corrector. These add the
  //   determinate-undersizing phrasings the Critic actually uses. Still
  //   conservative: each asserts a real exceedance/shortfall, not a hedge.
  // "rated for only/just/merely <N> <unit>" — an explicit under-rating callout.
  { tag: 'undersized-vs-load', re: /\brated\s+(?:for|at|to)\s+(?:only|just|merely)\b/i },
  // a severe bottleneck created by the part / limiting throughput-output-capacity.
  { tag: 'undersized-vs-load', re: /\b(?:severe\s+)?bottleneck\b/i },
  { tag: 'undersized-vs-load', re: /\blimit(?:s|ing|ed)?\b[^.]{0,60}?\b(?:throughput|output|production|capacity|flow|rate|delivery)\b/i },
  // an explicit deficit / shortfall of N% against the brief/requirement/demand.
  { tag: 'undersized-vs-load', re: /\b(?:deficit|shortfall|short\s+by|falls?\s+short)\b[^.]{0,60}?\b(?:against|of|below|versus|vs\.?|relative\s+to)\b/i },
  { tag: 'undersized-vs-load', re: /\b\d+(?:\.\d+)?\s*%\s+(?:deficit|shortfall|below|short)\b/i },
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
// THE DOCTRINE'S FOURTH APPLICATION (Tristan 2026-07-05) — gate 33 blocking
// requires DETERMINISTIC CORROBORATION, not just the three name/failure-mode
// bars above. v4 proved the gap: `issueIsBlocking` correctly cleared bars
// (a)/(b)/(c) on a plausible-but-FALSE "the 200 A rack fuse is undersized"
// HIGH — the Critic's OWN cited arithmetic (128.2 A rack demand, 1.56x
// margin) already showed the fuse was fine; it pivoted to comparing the
// fuse's rating against an unrelated switch/contactor rating (inverting
// protective coordination) to still call it "undersized". Blocking on a
// name+failure-mode-shaped finding alone cannot tell a genuine defect from
// this kind of confabulation — only a check against the DELIVERED artefacts
// can. This extends the enforcement decision with a THIRD gate, run only on
// findings that already cleared issueIsBlocking:
//
//   REFUTED        — a deterministic check over the delivered rows/contract
//                     shows the claim is FALSE (the rating-pair is actually
//                     coherent). Renders ADVISORY; the gate does NOT block
//                     (logged loudly — a refutation is as important a signal
//                     as a corroboration).
//   CORROBORATED   — the deterministic check confirms the pair genuinely
//                     diverges. Blocks, exactly as bars (a)-(c) alone did
//                     before this change.
//   UNCORROBORABLE — no deterministic evidence either way (e.g. a material-
//                     vs-temperature claim has no rating fields to compare —
//                     the CO₂ MDPE-at-120°C shape). CONSERVATIVE: still
//                     blocks — a known-failure claim with no counter-evidence
//                     must not ship silently — but the class is logged
//                     distinctly so an operator can see WHY it blocked.
//
// The corroboration oracle is INJECTED (`corroborate`), never called
// directly by the pure decision function, so `evaluatePhysicsCriticEnforcement`
// stays synchronous + harness-testable with a synthetic oracle. The REAL
// oracle (`corroborateFindingViaPython`, below) is a thin bridge onto
// `dossier_audit.py`'s existing deterministic corroboration layer (commit
// 247494a32's `_corroborate_finding` — rating-pair claims verify against the
// delivered rows' OWN values; extended 2026-07-05 with the `current_rating_pair`
// shape for protective-device Amp ratings, the v4 fuse case's shape). This
// reads that machinery rather than reinventing it in TypeScript. The DEFAULT
// oracle (`alwaysUncorroborable`) preserves the exact PRE-2026-07-05 blocking
// behaviour for any caller that does not wire a corroboration context — a
// caller that upgrades wiring later can only ever REDUCE false blocks
// (REFUTED cases), never introduce a new one.
// ---------------------------------------------------------------------------

/** REFUTED = a deterministic check proves the claim FALSE (do not block).
 *  CORROBORATED = a deterministic check confirms the claim (block).
 *  UNCORROBORABLE = no deterministic evidence either way (block, conservative). */
export type CorroborationVerdict = 'corroborated' | 'refuted' | 'uncorroborable'

export interface CorroborationResult {
  verdict: CorroborationVerdict
  shape: string     // the claim shape the corroborator classified this as (rating_pair, current_rating_pair, other, …)
  detail: string     // human-readable evidence, logged alongside the verdict
}

/** Injectable corroboration oracle. PURE consumers (evaluatePhysicsCriticEnforcement)
 *  never touch python/state directly — they take this function so the harness can
 *  inject a synthetic oracle and the chain can inject the real bridge
 *  (makePythonCorroborationOracle, below) without the decision function itself
 *  becoming impure or async. */
export type CorroborationOracle = (issue: CritiqueIssue) => CorroborationResult

/** The conservative default: no corroboration context was supplied, so every
 *  blocking-eligible finding is UNCORROBORABLE — i.e. blocks, exactly as the
 *  chain behaved before 2026-07-05. This is what makes the extension strictly
 *  backward-compatible: omit the third argument and nothing changes. */
export const alwaysUncorroborable: CorroborationOracle = () => ({
  verdict: 'uncorroborable',
  shape: 'unavailable',
  detail: 'no corroboration context supplied — conservative default (blocks)',
})

// The python bridge probe: calls dossier_audit.py's _corroborate_finding directly
// (NOT the full canonicalise_physics_critique — this decides ONE issue at a time,
// synchronously, from inside the pure-ish enforcement call site) so gate 33 reads
// the SAME deterministic machinery the final-shipped-critique canonicalisation uses,
// rather than re-deriving a second copy of the logic in TypeScript.
const CORROBORATE_FINDING_PROBE_PY = `
import sys, os, json
scripts_dir = sys.argv[1]
sys.path.insert(0, os.path.join(scripts_dir, 'lib'))
import dossier_audit as da
payload = json.load(sys.stdin)
verdict, shape, detail = da._corroborate_finding(payload.get('state') or {}, payload.get('issue') or {})
print(json.dumps({'verdict': verdict, 'shape': shape, 'detail': detail}))
`

/** Map dossier_audit.py's verdict vocabulary onto this module's:
 *  'falsified' (the claim is deterministically FALSE) -> 'refuted' (do not block);
 *  'corroborated' -> 'corroborated' (block); anything else -> 'uncorroborable' (block). */
function mapPythonVerdict(v: string): CorroborationVerdict {
  if (v === 'corroborated') return 'corroborated'
  if (v === 'falsified') return 'refuted'
  return 'uncorroborable'
}

/** Call the real deterministic corroboration bridge for a single issue against
 *  a state-shaped context (moduleDecomposition.modules, orchestratorContract /
 *  engineeringContract.quantities, parsedBrief — whatever _corroborate_finding's
 *  claim-shape matchers need; see dossier_audit.py). NEVER throws — a bridge
 *  failure (missing python3, malformed state, …) degrades to UNCORROBORABLE
 *  (conservative: still blocks) with the error recorded in `detail`, so a
 *  broken bridge can never silently unblock a real defect. */
export function corroborateFindingViaPython(issue: CritiqueIssue, state: unknown): CorroborationResult {
  try {
    const raw = execFileSync('python3', ['-c', CORROBORATE_FINDING_PROBE_PY, resolve(__dirname, '..')], {
      input: JSON.stringify({ state, issue }),
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    })
    const parsed = JSON.parse(raw) as { verdict: string; shape: string; detail: string }
    return { verdict: mapPythonVerdict(parsed.verdict), shape: String(parsed.shape ?? ''), detail: String(parsed.detail ?? '') }
  } catch (err) {
    return {
      verdict: 'uncorroborable',
      shape: 'bridge-error',
      detail: `corroboration bridge failed (conservative — still blocks): ${(err as Error).message.slice(0, 160)}`,
    }
  }
}

/** Build a CorroborationOracle bound to a fixed state context — the convenience
 *  the chain calls once per critique: `evaluatePhysicsCriticEnforcement(critique,
 *  mode, makePythonCorroborationOracle(state))`. */
export function makePythonCorroborationOracle(state: unknown): CorroborationOracle {
  return (issue) => corroborateFindingViaPython(issue, state)
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
  /** THE DOCTRINE'S FOURTH APPLICATION (2026-07-05): every blocking-eligible
   *  fault now also carries its corroboration verdict, so a log/audit reader
   *  can tell a genuinely-corroborated block apart from a conservative
   *  uncorroborable one without re-deriving it. */
  corroboration: CorroborationVerdict
  corroboration_detail: string
}

export interface PhysicsCriticEnforcementDecision {
  shouldExit: boolean
  exitCode: number        // PHYSICS_CRITIC_EXIT_CODE when shouldExit, else 0
  mode: PhysicsCriticEnforceMode
  reasons: string[]       // one human-readable reason per blocking fault (empty if none)
  blockingFaults: PhysicsCriticBlockingFault[]
  /** REFUTED findings (2026-07-05): cleared bars (a)-(c) but a deterministic
   *  check proved the claim FALSE. Never contribute to shouldExit/reasons —
   *  logged here so the refutation is visible (loudly) rather than silently
   *  dropped. Empty when mode is 'off' or no candidate finding refuted. */
  refutedFaults: PhysicsCriticBlockingFault[]
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
 * PURE + deterministic given (critique, mode, corroborate): decide whether enforcing
 * mode must hard-exit the chain because the Physics Critic has flagged a SPECIFIC
 * part with a CONCRETE, high-confidence failure mode THAT DETERMINISTIC EVIDENCE
 * DOES NOT REFUTE. A vague/holistic concern, a low/unknown confidence flag, a MED,
 * or an advisory "verify the rating" never blocks (bars (a)-(c), unchanged — matching
 * the gate-severity philosophy: a KNOWN-WRONG part hard-exits, a soft deviation flags
 * + renders). A finding that DOES clear bars (a)-(c) then passes through the
 * corroboration oracle (THE DOCTRINE'S FOURTH APPLICATION, 2026-07-05, see the design
 * note above): REFUTED -> advisory only, does NOT block; CORROBORATED or
 * UNCORROBORABLE -> blocks (conservative default for UNCORROBORABLE preserves the
 * pre-2026-07-05 behaviour exactly when `corroborate` is omitted). Harness-tested
 * both directions (UNIVERSAL.physics_critic_enforcement_blocks_failing_part) plus the
 * three corroboration branches (UNIVERSAL.physics_critic_enforcement_corroboration).
 *
 * NEVER throws — a malformed/absent critique yields a clean no-block decision, and the
 * oracle itself (corroborateFindingViaPython) never throws either, so a Critic that
 * errored upstream OR a broken corroboration bridge can never wedge the chain.
 */
export function evaluatePhysicsCriticEnforcement(
  critique: CritiqueReport | null | undefined,
  mode: PhysicsCriticEnforceMode,
  corroborate: CorroborationOracle = alwaysUncorroborable,
): PhysicsCriticEnforcementDecision {
  const base: PhysicsCriticEnforcementDecision = { shouldExit: false, exitCode: 0, mode, reasons: [], blockingFaults: [], refutedFaults: [] }
  if (mode === 'off') return base
  const issues: CritiqueIssue[] = Array.isArray(critique?.issues) ? (critique!.issues as CritiqueIssue[]) : []
  const reasons: string[] = []
  const blockingFaults: PhysicsCriticBlockingFault[] = []
  const refutedFaults: PhysicsCriticBlockingFault[] = []
  for (const issue of issues) {
    const v = issueIsBlocking(issue)
    if (!v.blocking) continue
    const corr = corroborate(issue)
    const fault: PhysicsCriticBlockingFault = {
      where: String(issue.where ?? '?'),
      failure_mode: v.tag,
      confidence: String(issue.confidence ?? '?'),
      issue: truncate(issue.issue, 200),
      suggested_check: issue.suggested_check ? truncate(issue.suggested_check, 160) : undefined,
      corroboration: corr.verdict,
      corroboration_detail: truncate(corr.detail, 200),
    }
    if (corr.verdict === 'refuted') {
      // REFUTED: a deterministic check proved the claim FALSE against the delivered
      // artefacts — renders advisory, does NOT block. Logged loudly (refutedFaults),
      // never silently dropped — the v4 fuse case's exact shape.
      refutedFaults.push(fault)
      continue
    }
    // CORROBORATED or UNCORROBORABLE — both block. UNCORROBORABLE is the
    // conservative default: a known-failure claim with no deterministic
    // counter-evidence must not ship silently.
    blockingFaults.push(fault)
    reasons.push(`physics:${v.tag}[${corr.verdict}] @ ${truncate(issue.where, 80)} — ${truncate(issue.issue, 140)}`)
  }
  const shouldExit = reasons.length > 0
  return {
    shouldExit,
    exitCode: shouldExit ? PHYSICS_CRITIC_EXIT_CODE : 0,
    mode,
    reasons,
    blockingFaults,
    refutedFaults,
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

/** Convenience for the chain: decide in one call from the env value. Pass `state`
 *  (the design/contract context corroboration needs — see makePythonCorroborationOracle)
 *  to wire the real deterministic corroboration bridge; omit it to keep the exact
 *  pre-2026-07-05 behaviour (every candidate finding blocks, uncorroborable-conservative). */
export function runPhysicsCriticEnforcement(
  critique: CritiqueReport | null | undefined,
  envValue?: string,
  state?: unknown,
): PhysicsCriticEnforcementDecision {
  const corroborate = state !== undefined ? makePythonCorroborationOracle(state) : alwaysUncorroborable
  return evaluatePhysicsCriticEnforcement(critique, physicsCriticEnforceModeFromEnv(envValue), corroborate)
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
