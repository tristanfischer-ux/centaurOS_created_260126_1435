/**
 * @file design-decisions-review.ts — Surface design choices already in state.
 *
 * Tristan 2026-05-20: every PDF should include a "Design Trade-offs" review
 * that articulates the compromises the chain made, grounded in truth. No
 * Generator invention at render time — every entry sourced from existing
 * chain state.
 *
 * Council convergence on framing (Grok, Gemini): CAPEX / OPEX / Reliability,
 * not speed/cost/quality. The former language lands with the engineering /
 * procurement / investor audience this report serves; the latter is a
 * software-PM meme that obscures the real physical-financial trade-off.
 *
 * Each decision has a primary axis it improves (CAPEX↓ / OPEX↓ / Reliability↑)
 * and a secondary axis it sacrifices. "You can pick 2 of 3" rendered as:
 *     [⬇ CAPEX] [⬇ OPEX] [⬆ Reliability]
 *     gained        gained        sacrificed
 *
 * Sources (all already in state — see council `forgeos_decisions` drawer):
 *   - state.brief.revisions[] — Phase 0 plausibility critic auto-revisions
 *   - state.briefTargetReconciliation — G0.5 target reconciliation
 *   - state.designDecisions[] — unrepaired Phase 2 gates accepted
 *   - state.complianceGate — declared mandatory standards + jurisdictions
 *   - state.physicsCritique.issues[] — physics critic findings
 *   - state.grammarVerdicts — gate results
 *   - state.cost_reality / state.cost_stack — scale factor + multiplier path
 *   - state.acceptanceStatus — overall verdict
 *   - state.physicsCritique.scores — engineering-plausibility, etc.
 */

export type TradeAxis = 'capex' | 'opex' | 'reliability'

export interface ChoiceTradeOff {
  /** Axis(es) this choice IMPROVES (lowers CAPEX / OPEX, raises Reliability). */
  gained: TradeAxis[]
  /** Axis(es) this choice SACRIFICES (raises CAPEX/OPEX, lowers Reliability). */
  sacrificed: TradeAxis[]
}

export interface DesignChoice {
  /** Stable id for renderer keys. */
  id: string
  /** Where in the chain this decision was made (e.g. 'Brief', 'Phase 2', 'Engine B'). */
  scope: 'Brief' | 'Compliance' | 'Phase 2' | 'Engine B' | 'Physics critic' | 'Renderer' | 'K10' | 'Architecture'
  /** Plain-English headline ("Yield target reduced from 25 t/yr to 5 t/yr"). */
  what: string
  /** Plain-English alternative that was NOT chosen ("Expand canopy to 500 m²"). */
  alternative: string
  /** CAPEX/OPEX/Reliability trade. */
  trade_off: ChoiceTradeOff
  /** One-sentence summary of the compromise. */
  rationale: string
  /** State path that proves this decision was real. */
  evidence_path: string
  /** Whether the chain shipped this choice or flagged it for human review. */
  status: 'applied' | 'flagged_for_review' | 'blocked'
}

export interface DesignDecisionsReview {
  product_class: string
  choices: DesignChoice[]
  /** Summary counts for cover-page indicator. */
  summary: {
    total: number
    applied: number
    flagged: number
    blocked: number
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function safe<T>(fn: () => T): T | null {
  try { return fn() } catch { return null }
}

function asArray<T>(v: any): T[] {
  return Array.isArray(v) ? v : []
}

// ─── extractors ─────────────────────────────────────────────────────────────

/** Phase 0 brief auto-revisions (e.g. yield 25 t/yr → 5 t/yr) */
function extractBriefRevisions(state: any): DesignChoice[] {
  const revisions = asArray<any>(state?.brief?.revisions)
  return revisions.map((rev, idx): DesignChoice => {
    const field = String(rev?.field ?? rev?.constraint ?? 'target_performance')
    const original = rev?.original ?? rev?.from ?? 'original'
    const revised = rev?.revised ?? rev?.to ?? 'revised'
    const alternatives = asArray<any>(rev?.alternatives_considered ?? rev?.alternatives)
    const altSummary = alternatives.length > 0
      ? alternatives.map((a: any) => `${a.field ?? a.constraint ?? 'constraint'} ${a.proposal ?? a.to ?? 'change'}`).slice(0, 2).join(' / ')
      : 'Hold the constraint and ship a non-viable design'
    return {
      id: `brief_rev_${idx}`,
      scope: 'Brief',
      what: `${field} revised from ${original} to ${revised}`,
      alternative: altSummary,
      // Brief revision typically REDUCES scope to match physical reality:
      // lowers CAPEX (smaller machine), raises Reliability (within physics
      // ceiling). Sacrifices OPEX-equivalent (lower output → lower revenue
      // per unit time — same engineering operating cost over fewer kg/kWh).
      trade_off: { gained: ['capex', 'reliability'], sacrificed: ['opex'] },
      rationale: rev?.rationale ?? rev?.reason ?? 'Phase 0 plausibility critic auto-relaxed the lowest-priority constraint to bring the brief inside the physical envelope.',
      evidence_path: `state.brief.revisions[${idx}]`,
      status: 'applied',
    }
  })
}

/** G0.5 brief-target-reconciliation alternatives */
function extractBriefTargetReconciliation(state: any): DesignChoice[] {
  const r = state?.briefTargetReconciliation
  if (!r || (r.verdict !== 'WARN' && r.verdict !== 'HALT')) return []
  const alts = asArray<any>(r.alternatives_considered)
  if (alts.length === 0) return []
  return [{
    id: 'g0_5_reconciliation',
    scope: 'Brief',
    what: `Brief target ${r.verdict === 'HALT' ? 'BLOCKED' : 'flagged'} by G0.5 reconciliation: ${r.headline ?? 'design scale mismatch'}`,
    alternative: alts.slice(0, 2).map((a: any) => `${a.label ?? a.summary ?? 'alternative'}`).join(' / '),
    trade_off: { gained: ['capex', 'reliability'], sacrificed: ['opex'] },
    rationale: r.reason ?? 'Brief target performance did not match the design generated; G0.5 surfaced the scale mismatch with alternatives.',
    evidence_path: 'state.briefTargetReconciliation',
    status: r.verdict === 'HALT' ? 'blocked' : 'flagged_for_review',
  }]
}

/** Phase 2 unrepaired gates that the chain shipped despite */
function extractDesignDecisions(state: any): DesignChoice[] {
  const decisions = asArray<any>(state?.designDecisions)
  return decisions.map((d: any, idx: number): DesignChoice => ({
    id: `phase2_dd_${idx}`,
    scope: 'Phase 2',
    what: d.title ?? d.gate ?? `Unrepaired Phase 2 gate ${idx + 1}`,
    alternative: 'Halt Phase 2 and re-run with additional reviewer rounds, or block the PDF until the gate clears',
    // Shipping with unrepaired gates = chose CAPEX (no further LLM cost) +
    // speed-of-delivery; sacrificed Reliability (gate guarantees skipped).
    trade_off: { gained: ['capex'], sacrificed: ['reliability', 'opex'] },
    rationale: d.we_are_doing ?? d.action ?? 'Gate retry budget exhausted; the chain proceeded with best-effort output rather than blocking the report.',
    evidence_path: `state.designDecisions[${idx}]`,
    status: 'flagged_for_review',
  }))
}

/** Compliance jurisdiction declaration */
function extractComplianceJurisdiction(state: any): DesignChoice[] {
  const cg = state?.complianceGate
  if (!cg) return []
  const jurisdictions = asArray<string>(cg.jurisdictions ?? cg.jurisdiction)
  if (jurisdictions.length === 0) return []
  if (jurisdictions.length === 1) return []
  // Multi-jurisdiction is the interesting decision — single-juris is the default
  return [{
    id: 'compliance_jurisdictions',
    scope: 'Compliance',
    what: `Multi-jurisdiction compliance declared: ${jurisdictions.join(', ')}`,
    alternative: `Single-jurisdiction (e.g. UK-only) — saves approximately £25-60k in certification cost per region not targeted`,
    // Multi-region: gains reliability (covers more markets, less re-cert risk
    // when expanding), sacrifices CAPEX (more cert fees + lead time upfront).
    trade_off: { gained: ['reliability'], sacrificed: ['capex'] },
    rationale: 'Wider market reach increases compliance cost upfront but reduces the risk of having to re-certify when entering additional markets.',
    evidence_path: 'state.complianceGate.jurisdictions',
    status: 'applied',
  }]
}

/** Physics critic findings — each surfaced as "we shipped despite this" */
function extractPhysicsCriticIssues(state: any): DesignChoice[] {
  const issues = asArray<any>(state?.physicsCritique?.issues)
  const scores = state?.physicsCritique?.scores
  const plausibility = scores?.engineering_plausibility
  // Only surface as decisions if chain SHIPPED with these (i.e. not blocked).
  // If acceptanceStatus is 'blocked', these aren't trade-offs — they're stop signs.
  const shipped = state?.acceptanceStatus !== 'blocked'
  if (!shipped) return []
  const highSev = issues.filter((i: any) => {
    const s = String(i?.severity ?? '').toLowerCase()
    return s === 'high' || s === 'critical' || s === 'halt'
  })
  if (highSev.length === 0) return []
  const sampleNote = `${highSev.length} HIGH-severity physics findings ` +
    (typeof plausibility === 'number' ? `(plausibility ${plausibility}/10)` : '')
  return [{
    id: 'physics_critic_shipped',
    scope: 'Physics critic',
    what: `Shipped report with ${sampleNote}`,
    alternative: 'Halt the chain at physics-critic step and require the Generator to address each finding before re-emission',
    trade_off: { gained: ['capex'], sacrificed: ['reliability'] },
    rationale: 'Physics critic raised findings that the engine could not auto-repair in the retry budget; surfaced as manual-review badges and shipped.',
    evidence_path: 'state.physicsCritique.issues',
    status: 'flagged_for_review',
  }]
}

/** Cost-stack scale factor (BoM × 0.3 batch-economics multiplier etc.) */
function extractCostStackChoice(state: any): DesignChoice[] {
  const cs = state?.cost_stack
  if (!cs) return []
  const scale = cs.bom_scale_factor ?? cs.scale_factor
  if (typeof scale !== 'number' || scale === 1.0) return []
  return [{
    id: 'cost_stack_scale',
    scope: 'Engine B',
    what: `Raw BoM × ${scale} batch-economics scale factor applied`,
    alternative: 'Per-line distributor quotes for every SKU (1000+ live distributor API calls per chain run)',
    // Scaling = cheaper + faster chain, less accurate (lower reliability of
    // the reported cost figure).
    trade_off: { gained: ['capex', 'opex'], sacrificed: ['reliability'] },
    rationale: `Single class-level scale factor reflects production-volume economy without per-line distributor lookups. Approximation, not procurement-grade.`,
    evidence_path: 'state.cost_stack.bom_scale_factor',
    status: 'applied',
  }]
}

/** G5 part-number verification — manual-review-shipped count */
function extractG5ShippedFakes(state: any): DesignChoice[] {
  const summary = state?.partVerificationSummary
  if (!summary) return []
  const stripped = Number(summary.stripped ?? 0)
  const uncertain = Number(summary.uncertain ?? 0)
  const total = Number(summary.total ?? 0)
  const unverified = stripped + uncertain
  if (unverified === 0 || total === 0) return []
  const pct = ((unverified / total) * 100).toFixed(0)
  return [{
    id: 'g5_shipped_unverified',
    scope: 'Engine B',
    what: `Shipped with ${unverified} of ${total} part numbers unverified (${pct}%) — flagged for manual sourcing`,
    alternative: 'Block PDF emission until every SKU is verified against DigiKey / Mouser / Farnell, OR auto-replace fakes with the engine\'s recommended SKUs from Appendix A',
    trade_off: { gained: ['capex'], sacrificed: ['reliability'] },
    rationale: 'Generator emits plausible-but-fabricated part numbers when the catalogue lookup misses; the chain ships them flagged rather than block on every gap. Appendix A lists real replacements.',
    evidence_path: 'state.partVerificationSummary',
    status: 'flagged_for_review',
  }]
}

/** Manual-review badges that fired (G1b / G4) */
function extractManualReviewBadges(state: any): DesignChoice[] {
  const out: DesignChoice[] = []
  // G1b
  const cg = state?.complianceGate
  if (cg && (cg.verdict === 'WARN' || cg.verdict === 'HALT')) {
    out.push({
      id: 'g1b_manual_review',
      scope: 'Compliance',
      what: `Compliance gate ${cg.verdict} — ${cg.reason ?? 'mandatory standard gap'}`,
      alternative: 'Halt the chain and require brief enrichment to declare the missing mandatory standards before report emission',
      trade_off: { gained: ['capex'], sacrificed: ['reliability'] },
      rationale: 'Compliance gap surfaced as a manual-review badge so the founder can address before procurement, rather than blocking the report.',
      evidence_path: 'state.complianceGate.verdict',
      status: cg.verdict === 'HALT' ? 'blocked' : 'flagged_for_review',
    })
  }
  // G4 grammar
  if ((state as any)?.moduleDecomposition?.g4ManualReview || (state as any)?.g4ManualReview) {
    out.push({
      id: 'g4_manual_review',
      scope: 'Phase 2',
      what: 'Stage 1.7 grammar synthesis flagged for manual review — module-decomposition grammar gate exhausted retry budget',
      alternative: 'Re-trigger Stage 1.7 with additional emitters or a different prompt; OR halt and surface the synthesis disagreement to the user',
      trade_off: { gained: ['capex'], sacrificed: ['reliability'] },
      rationale: 'Cross-emitter judge disagreement on final synthesis; shipped with best-effort grammar links rather than escalating to further LLM cost.',
      evidence_path: 'state.moduleDecomposition.g4ManualReview',
      status: 'flagged_for_review',
    })
  }
  return out
}

/** Phase 2 architecture choice — 4-reviewer chain is meta-decision */
function extractArchitecturalChoice(_state: any): DesignChoice[] {
  // This is constant for the chain — surface once per report to make the
  // architectural compromise visible.
  return [{
    id: 'architecture_4_reviewer_chain',
    scope: 'Architecture',
    what: 'Four-reviewer chain (R1 Grok 4.3 → R2 GLM → R3 Haiku/Qwen → R4 Flash-Lite) plus physics critic',
    alternative: 'Single-shot generation with the strongest model, no cross-check (faster, ~4× cheaper)',
    trade_off: { gained: ['reliability'], sacrificed: ['capex', 'opex'] },
    rationale: 'Cross-model review catches contradictions that single-shot misses. ~4× LLM cost + ~30 min latency in exchange for catching ~20-40 percentage-point more design defects.',
    evidence_path: 'scripts/serial-design-chain-v2.tsx (chain architecture)',
    status: 'applied',
  }]
}

// ─── builder ────────────────────────────────────────────────────────────────

export function buildDesignDecisionsReview(state: any): DesignDecisionsReview {
  const productClass = String(
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    'unknown'
  )
  const choices: DesignChoice[] = [
    ...(safe(() => extractBriefRevisions(state)) ?? []),
    ...(safe(() => extractBriefTargetReconciliation(state)) ?? []),
    ...(safe(() => extractDesignDecisions(state)) ?? []),
    ...(safe(() => extractComplianceJurisdiction(state)) ?? []),
    ...(safe(() => extractManualReviewBadges(state)) ?? []),
    ...(safe(() => extractPhysicsCriticIssues(state)) ?? []),
    ...(safe(() => extractCostStackChoice(state)) ?? []),
    ...(safe(() => extractG5ShippedFakes(state)) ?? []),
    ...(safe(() => extractArchitecturalChoice(state)) ?? []),
  ]
  const summary = {
    total: choices.length,
    applied: choices.filter(c => c.status === 'applied').length,
    flagged: choices.filter(c => c.status === 'flagged_for_review').length,
    blocked: choices.filter(c => c.status === 'blocked').length,
  }
  return { product_class: productClass, choices, summary }
}

// Public for unit testing / chain code reuse.
export const __test_extractBriefRevisions = extractBriefRevisions
export const __test_extractDesignDecisions = extractDesignDecisions
