/**
 * Semantic self-audit — the universal LLM-judge complement to the 30 deterministic gates.
 *
 * WHY THIS EXISTS (Tristan 2026-06-01: "they're all supposed to be self-correcting, and that
 * part clearly has failed"). The chain has 30 deterministic gates (exit 10-30) + 13 named
 * audits, but they are curated, BESS-derived "scar tissue": each checks a SPECIFIC failure
 * (Schaltbau C310 spec, Pfannenberg derating, NEC-in-a-UK-doc). None asks the GENERIC question
 * a human reviewer asks at a glance: "is this section actually any good — is a field blank, a
 * number absurd, a price impossible, a part from the wrong product class, or a claim made over
 * an unverified cell?" The six cross-class defect patterns found 2026-06-01 (blank headline,
 * false-PASS compliance banner, £0 module, 579x unit bug, wrong-class part, fidelity banner
 * over a real breach) are precisely the gaps BETWEEN the curated gates.
 *
 * This module builds a per-section digest of the assembled dossier (reusing the renderer's OWN
 * compliance builder so the audit sees exactly what the PDF prints) and asks a non-Anthropic
 * reasoning model to score every section against the >=8 floor and enumerate every defect.
 * It is UNIVERSAL: it judges an unknown class (tidal, humanoid) with no curated table, from
 * world knowledge — exactly what a deterministic gate cannot do. Shadow-first, like K10.
 *
 * SPLIT: buildAuditDigest() is PURE + SYNC + deterministic → regression-harness testable.
 * runSemanticSelfAudit() makes the (non-deterministic) LLM call → not harness-testable; it is
 * dependency-injected with a callLlm-shaped function so this file never imports the 6k-line chain.
 */
import { _buildComplianceRows, summariseComplianceRows } from '../render-minimal-pdf'

// ── injected LLM caller (chain provides its callLlm; CLI/test provides a thin OpenRouter shim) ──
export type LlmCaller = (opts: {
  model: string
  system: string
  user: string
  maxTokens?: number
  temperature?: number
}) => Promise<{ text: string }>

export interface SectionDigest {
  /** stable section key the judge scores */
  name: string
  /** human-readable label for the prompt */
  label: string
  /** the rendered digest text the judge reads */
  text: string
  /** deterministic flags pre-computed here so the judge cannot miss them (belt-and-braces) */
  hardSignals: string[]
}

export interface AuditDigest {
  productClass: string
  /** the brief, rendered as the yardstick (reference context, not itself scored) */
  briefText: string
  sections: SectionDigest[]
}

export interface SectionVerdict {
  name: string
  score: number          // 0-10; >=8 is the ship floor
  defects: string[]
  blocking: boolean      // a ship-blocking defect (blank field, absurd number, impossible price, wrong-class part)
}

export interface SelfAuditResult {
  product_class: string
  min_score: number | null      // min over scored sections — the FLOOR, the thing that must reach 8
  mean_score: number | null
  blocking_defects: string[]    // flattened defects from blocking sections
  sections: SectionVerdict[]
  summary: string
  hard_signals: string[]        // deterministic pre-flags (independent of the LLM)
  model: string
  mode: 'shadow' | 'enforcing'
  generated_at: string
  ok: boolean                   // false if the LLM call/parse failed (shadow: chain continues regardless)
  error?: string
}

// ───────────────────────── helpers ─────────────────────────

const num = (v: any): number | null =>
  (typeof v === 'number' && isFinite(v)) ? v : null

const gbp = (v: number | null): string =>
  v == null ? 'n/a' : `£${Math.round(v).toLocaleString('en-GB')}`

/** Rendered unit price cascade — matches the renderer/gate-13 priority order. 0 is a REAL value (the bug). */
function coalescePrice(p: any): number | null {
  for (const k of ['distributor_price_gbp', 'cost_repair_corrected_price_gbp', 'price_estimate_gbp', 'list_price_gbp', 'unit_price_gbp']) {
    const v = num(p?.[k])
    if (v != null) return v
  }
  return null
}

function truncate(s: any, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

// ───────────────────────── PURE: build the judge's digest ─────────────────────────

/**
 * Build the per-section digest the judge reads. PURE + SYNC + deterministic given `state`.
 * Defensive throughout: a missing section yields an honest "(absent)" digest, never a throw —
 * the regression harness asserts this returns all sections and never crashes on any snapshot.
 */
export function buildAuditDigest(state: any, productClass: string): AuditDigest {
  const pb = state?.parsedBrief ?? {}
  const c = pb?.constraints ?? {}
  const sections: SectionDigest[] = []

  // ── BRIEF (reference yardstick) ──
  const tp = c?.target_performance ?? {}
  const briefLines: string[] = []
  if (pb?.product_description) briefLines.push(`Product: ${truncate(pb.product_description, 240)}`)
  if (tp?.key_metric || tp?.value) briefLines.push(`Primary target: ${tp.key_metric ?? '?'} = ${tp.value ?? '?'} ${tp.unit ?? ''}`.trim())
  for (const m of (tp?.metrics ?? []).slice(0, 12)) {
    briefLines.push(`  • ${m.key ?? m.name ?? '?'} = ${m.value ?? '?'} ${m.unit ?? ''}`.trim())
  }
  if (c?.unit_cost_ceiling) briefLines.push(`Cost ceiling: ${JSON.stringify(c.unit_cost_ceiling)}`)
  if (c?.max_mass_kg) briefLines.push(`Mass cap: ${JSON.stringify(c.max_mass_kg)}`)
  if (c?.design_life) briefLines.push(`Design life: ${JSON.stringify(c.design_life)}`)
  if (c?.operating_environment) briefLines.push(`Operating env: ${truncate(JSON.stringify(c.operating_environment), 160)}`)
  const briefText = briefLines.join('\n') || '(brief constraints absent)'

  // ── SECTION 1: HEADLINE (catches P2 blank-headline) ──
  {
    const km = state?.keyMetrics ?? {}
    const ho = km?.headline_output
    const val = ho?.value
    const blank = ho == null || val == null || String(val).trim() === '' || String(val).trim() === '—'
    const hard: string[] = []
    if (blank) hard.push('HEADLINE_BLANK')
    const sm = (km?.supporting_metrics ?? []).slice(0, 6)
      .map((m: any) => `${m.label ?? m.id ?? '?'} = ${m.value ?? '?'} ${m.unit ?? ''}`.trim())
    const text = blank
      ? `Operational headline output: BLANK / "—" (no value rendered on page 1).`
      : `Operational headline output: ${ho.label ?? '?'} = ${ho.value} ${ho.unit ?? ''}\n` +
        (ho.notes ? `  basis: ${truncate(ho.notes, 200)}\n` : '') +
        (sm.length ? `Supporting metrics:\n${sm.map((s: string) => '  • ' + s).join('\n')}` : 'Supporting metrics: none')
    sections.push({ name: 'headline', label: 'Operational headline (page 1)', text, hardSignals: hard })
  }

  // ── SECTION 2: BRIEF COMPLIANCE (catches P1 false-PASS, missing rows) ──
  {
    const hard: string[] = []
    let text: string
    try {
      const rows = _buildComplianceRows(state, null, null)
      const v = summariseComplianceRows(rows)
      const fails = rows.filter((r: any) => r.status === 'fail')
      const unknowns = rows.filter((r: any) => r.status === 'unknown')
      const lbl = (r: any) => r.label ?? r.constraint ?? r.metric ?? r.name ?? r.brief_key ?? '?'
      const claimsAllPass = /^All \d+ brief constraints PASS$/.test(v.headline)
      if (claimsAllPass && (v.failCount + v.unknownCount) > 0) hard.push('COMPLIANCE_FALSE_PASS')
      if (v.total > 0 && v.unknownCount / v.total > 0.34) hard.push(`COMPLIANCE_UNVERIFIED_${v.unknownCount}_OF_${v.total}`)
      if (v.failCount > 0) hard.push(`COMPLIANCE_FAIL_${v.failCount}`)
      text = `Brief Compliance banner: "${v.headline}"\n` +
        `Rows: ${v.total} (pass ${v.passCount}, fail ${v.failCount}, unverified ${v.unknownCount}).\n` +
        (fails.length ? `FAILING: ${fails.slice(0, 8).map(lbl).join('; ')}\n` : '') +
        (unknowns.length ? `UNVERIFIED (rendered "—"): ${unknowns.slice(0, 10).map(lbl).join('; ')}` : '')
    } catch (err) {
      // fall back to the gate's own verdict if the renderer builder throws on this snapshot
      const cg = state?.complianceGate ?? {}
      text = `Compliance gate verdict: ${cg.verdict ?? '?'} (${cg.mandatory_covered ?? '?'}/${cg.mandatory_total ?? '?'} mandatory covered). [row-builder unavailable: ${truncate((err as Error).message, 80)}]`
    }
    sections.push({ name: 'brief_compliance', label: 'Brief compliance table', text, hardSignals: hard })
  }

  // ── SECTION 3: BILL OF MATERIALS (catches P3 £0/collapse, P4 absurd price, P5 wrong-class part) ──
  {
    const hard: string[] = []
    const cr = state?.cost_reality ?? {}
    const total = num(cr?.bom_total_gbp) ?? num(state?.legacyCostBomTotal)
    const pv: any[] = Array.isArray(state?.partVerifications) ? state.partVerifications : []
    const priced = pv.map(p => ({
      name: p.word_name ?? p.word_id ?? '?',
      mfr: p.manufacturer ?? '',
      mpn: p.part_number ?? '',
      module: p.module ?? '?',
      price: coalescePrice(p),
    }))
    const withPrice = priced.filter(p => p.price != null)
    // Big-ticket items are priced by dimension-based MACROS in the renderer (vessel
    // £50k, etc.) and that override is NOT written back to partVerifications — those
    // keep the PRE-MACRO Engine-B estimate (often £0). So a £0 here is usually a
    // pre-macro placeholder for an item the rendered PDF actually prices via a macro.
    // Surface the macros so the judge sees the £50k vessel, not a phantom £0. (Bug
    // found 2026-06-02: the audit reported bioreactor £47.9k when the PDF renders £199k.)
    const macros: any[] = Array.isArray(state?.engineeringContract?.macro_assembly_prices) ? state.engineeringContract.macro_assembly_prices : []
    const macroTotal = macros.reduce((a, m) => a + (num(m?.total_gbp) ?? 0), 0)
    const sigToks = (s: string) => new Set(String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 4))
    const macroTokSets = macros.map(m => sigToks(m?.word_name ?? ''))
    const macroCovered = (name: string) => { const nt = sigToks(name); return macroTokSets.some(ms => [...ms].some(t => nt.has(t))) }
    const zeros = withPrice.filter(p => (p.price as number) <= 0)
    const realZeros = zeros.filter(p => !macroCovered(p.name))  // £0 lines NOT explained by a macro
    const sorted = [...withPrice].sort((a, b) => (a.price as number) - (b.price as number))
    const effTotal = Math.max(num(total) ?? 0, macroTotal)
    if (effTotal <= 0) hard.push('BOM_TOTAL_ZERO')
    if (realZeros.length > 0) hard.push(`BOM_ZERO_PRICE_LINES_${realZeros.length}`)
    const line = (p: any) => `${truncate(p.name, 48)}${p.mfr ? ` [${truncate(p.mfr, 24)} ${truncate(p.mpn, 24)}]` : ''} = ${gbp(p.price)}`
    // per-module unit-price rollup (rough — qty-weighted total lives in cost_reality)
    const byMod: Record<string, number> = {}
    for (const p of withPrice) byMod[p.module] = (byMod[p.module] ?? 0) + (p.price as number)
    const modRoll = Object.entries(byMod).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([m, s]) => `  ${truncate(m, 32)}: ${gbp(s)}`).join('\n')
    const macroList = [...macros].sort((a, b) => (num(b?.total_gbp) ?? 0) - (num(a?.total_gbp) ?? 0)).slice(0, 8)
      .map((m: any) => `  ${truncate(m?.word_name ?? '?', 34)} = ${gbp(num(m?.total_gbp))}${m?.source_detail ? `  (${truncate(m.source_detail, 48)})` : ''}`).join('\n')
    const text =
      `BoM total (chain estimate): ${gbp(total)} for this ${productClass}.  priced lines ${cr?.priced_lines ?? withPrice.length}, unpriced ${cr?.unpriced_lines ?? (pv.length - withPrice.length)}.\n` +
      (macros.length ? `BIG-TICKET ASSEMBLIES priced by dimension-based MACROS (authoritative for large items; total ${gbp(macroTotal)}):\n${macroList}\nNOTE: per-line prices below are PRE-MACRO component estimates — a line whose name matches a macro above renders at the macro price, so a £0/tiny price on a vessel/skid/motor below is a pre-macro placeholder, NOT the shipped price.\n` : '') +
      (realZeros.length ? `£0 LINES not covered by any macro (${realZeros.length}): ${realZeros.slice(0, 10).map((p: any) => truncate(p.name, 40)).join('; ')}\n` : '') +
      `Dearest component lines:\n${sorted.slice(-6).reverse().map((p: any) => '  ' + line(p)).join('\n')}\n` +
      `Cheapest component lines:\n${sorted.slice(0, 6).map((p: any) => '  ' + line(p)).join('\n')}\n` +
      `Module unit-price rollup:\n${modRoll || '  (none)'}\n` +
      `This BoM is computed PRE-RENDER: the SHIPPED total is HIGHER (the renderer applies macro qty-weighting + final pricing not reflected in the chain estimate above). So judge BoM COMPLETENESS, per-line sanity, genuinely-unpriced (£0, non-macro) items, and WRONG-CLASS parts — but do NOT hard-penalise the absolute magnitude of this pre-render estimate. Price macro-covered big items at their macro price, NOT the pre-macro £0. Does any part belong to a DIFFERENT product class?`
    sections.push({ name: 'bill_of_materials', label: 'Bill of materials + costs', text, hardSignals: hard })
  }

  // ── SECTION 4: PERFORMANCE / SPEC CARD (catches blank spec cells) ──
  {
    const hard: string[] = []
    const pc = state?.performanceCard ?? {}
    const secs: any[] = Array.isArray(pc?.sections) ? pc.sections : []
    const allMetrics = secs.flatMap((s: any) => (s.metrics ?? []).map((m: any) => ({ ...m, _section: s.name })))
    const blankVal = (m: any) => m.value == null || String(m.value).trim() === '' || String(m.value).trim() === '—'
    const blanks = allMetrics.filter(blankVal)
    if (allMetrics.length === 0) hard.push('PERFCARD_EMPTY')
    if (allMetrics.length > 0 && blanks.length / allMetrics.length > 0.34) hard.push(`PERFCARD_BLANK_${blanks.length}_OF_${allMetrics.length}`)
    const text = allMetrics.length === 0
      ? `Performance / specification card: EMPTY (no metric rows).`
      : `Performance card: ${secs.length} sections, ${allMetrics.length} metrics (${blanks.length} blank/"—").\n` +
        allMetrics.slice(0, 16).map((m: any) =>
          `  • [${truncate(m._section, 20)}] ${m.label ?? m.id}: ${blankVal(m) ? '—' : `${m.value}`}${m.brief_target ? ` (target ${m.brief_target})` : ''}`).join('\n') +
        (pc?.warnings?.length ? `\nwarnings: ${truncate(JSON.stringify(pc.warnings), 160)}` : '')
    sections.push({ name: 'performance_card', label: 'Performance / spec card', text, hardSignals: hard })
  }

  // ── SECTION 5: DESIGN NARRATIVE (catches generic / off-class prose) ──
  {
    const prose = state?.briefOverviewProse ?? {}
    const md = state?.moduleDecomposition ?? {}
    const mods: any[] = Array.isArray(md?.modules) ? md.modules : []
    const sampleMods = mods.slice(0, 3).map((m: any) =>
      `  [${m.module ?? '?'}] ${truncate(m.overview_paragraph_en ?? m.module_brief, 220)}`).join('\n')
    const text =
      `(Excerpted by this audit — a trailing "…" is truncation here, NOT a defect in the dossier; do not flag truncation.)\n` +
      `Mission: ${truncate(prose?.mission_statement, 320)}\n` +
      `Why now: ${truncate(prose?.why_now, 220)}\n` +
      `Module overviews (sample):\n${sampleMods || '  (none)'}\n` +
      `Judge: is the prose specific to THIS product/brief and engineering-grounded, or generic boilerplate that could describe any product?`
    sections.push({ name: 'design_narrative', label: 'Design narrative', text, hardSignals: [] })
  }

  // ── SECTION 6: PHYSICS / FIDELITY (catches P4 unit absurdity, P6 breach-over-banner, plausibility) ──
  {
    const hard: string[] = []
    const phc = state?.physicsCritique ?? {}
    const sc = phc?.scores ?? {}
    const fidelity = num(sc?.brief_to_design_fidelity)
    if (fidelity != null && fidelity < 6) hard.push(`PHYSICS_FIDELITY_${fidelity}`)
    const issues: any[] = Array.isArray(phc?.issues) ? phc.issues : []
    const high = issues.filter((i: any) => /high/i.test(String(i.severity ?? '')))
    if (high.length > 0) hard.push(`PHYSICS_HIGH_ISSUES_${high.length}`)
    const text =
      `Physics critic scores: ${Object.entries(sc).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}\n` +
      (phc?.headline ? `Critic headline: ${truncate(phc.headline, 280)}\n` : '') +
      (issues.length
        ? `Issues (${issues.length}; ${high.length} HIGH):\n` + issues.slice(0, 6).map((i: any) =>
            `  • [${i.severity ?? '?'}] ${truncate(i.detail ?? i.description ?? i.summary ?? JSON.stringify(i), 180)}`).join('\n')
        : 'No physics issues recorded.') +
      `\nJudge: any physically impossible value (unit-confused magnitude, e.g. a torque 100x too large)? Any "concept scaffold / infeasible" flag waved over a real constraint breach?`
    sections.push({ name: 'physics_fidelity', label: 'Engineering plausibility & fidelity', text, hardSignals: hard })
  }

  return { productClass, briefText, sections }
}

// ───────────────────────── LLM judge ─────────────────────────

const JUDGE_SYSTEM = `You are a ruthless senior engineering-proposal reviewer doing the FINAL pre-ship check on an auto-generated technical design dossier before it reaches a paying client.

The bar is 8/10 on EVERY section — that is the FLOOR, not the average. You are not here to be kind. The following are SHIP-BLOCKING defects (the section scores 4 or below, blocking=true):
  • a blank / "—" headline or core metric where the brief states a target;
  • a Bill of Materials total that is implausible for the product's scale (e.g. a 200 L bioreactor skid priced at £48k when real ones are £300k+), or an expensive physical item (vessel, motor, inverter, transformer) priced at £0;
  • a numeric value that is physically impossible — usually a unit confusion making a quantity ~100x too big/small;
  • a part that belongs to a DIFFERENT product class (e.g. a Raspberry-Pi cooling fan listed as a heat-pump compressor driver);
  • a compliance / status claim asserted over an unverified or failing cell;
  • prose that is generic boilerplate rather than grounded in THIS brief.

HONESTY DISTINCTION (decides blocking vs non-blocking — apply it strictly): the question for blocking is "is the reader DECEIVED?", not "is there a gap?".
  - A brief target MISSED but OPENLY stated as a deliberate trade-off ("accepts a 23% shortfall vs the 3.5 MWh target as a mass-constrained trade-off") is a WEAKNESS (score <=6) but NOT ship-blocking — the reader is not deceived.
  - An UNVERIFIED constraint rendered HONESTLY as "—" / "unverified", where the banner DISCLOSES the unverified count ("12 of 13 verified · 1 unverified"), is an INCOMPLETENESS weakness, NOT ship-blocking. Score by how many: a few "—" among many verified → 5-6; many "—" → 3-4. blocking=false either way, because nothing is claimed falsely.
  - It becomes ship-blocking (blocking=true) ONLY when a headline, banner, or compliance row ASSERTS pass / "met" / "All N PASS" over a cell that is actually "—" or failing — i.e. a positive false claim. Deception blocks; an honestly-labelled gap or "—" does not.

Score honestly from your own engineering world knowledge — you judge UNKNOWN product classes with no lookup table. The pre-computed HARD-SIGNAL tags in the digest are deterministic facts you must treat as true. Reward a section that is genuinely complete, specific, and plausible with 8-10.

Return ONLY a JSON object, no prose, no markdown fence:
{"sections":[{"name":"<section key>","score":<0-10 int>,"defects":["..."],"blocking":<bool>}],"summary":"<=40 words on the single worst problem"}
Include one entry per section given to you, using the exact section keys.`

function parseJudgeJson(raw: string): { sections: SectionVerdict[]; summary: string } {
  let t = (raw ?? '').trim()
  // strip ```json fences if present
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const a = t.indexOf('{'); const b = t.lastIndexOf('}')
  if (a >= 0 && b > a) t = t.slice(a, b + 1)
  const o = JSON.parse(t)
  const sections: SectionVerdict[] = (Array.isArray(o.sections) ? o.sections : []).map((s: any) => ({
    name: String(s.name ?? '?'),
    score: Math.max(0, Math.min(10, Number(s.score) || 0)),
    defects: Array.isArray(s.defects) ? s.defects.map((d: any) => String(d)).filter(Boolean) : [],
    blocking: Boolean(s.blocking),
  }))
  return { sections, summary: String(o.summary ?? '') }
}

/**
 * Run the semantic self-audit. Dependency-injected with `callLlm` (the chain's, or a CLI shim).
 * NEVER throws — on any LLM/parse failure returns { ok:false, error } so shadow-mode callers
 * record the failure and continue. The deterministic hard_signals are returned regardless.
 */
export async function runSemanticSelfAudit(
  state: any,
  opts: {
    productClass: string
    callLlm: LlmCaller
    model?: string
    mode?: 'shadow' | 'enforcing'
    generatedAt?: string
  },
): Promise<SelfAuditResult> {
  const model = opts.model ?? process.env.SELF_AUDIT_MODEL ?? 'x-ai/grok-4.3'
  const mode = opts.mode ?? 'shadow'
  const generated_at = opts.generatedAt ?? new Date().toISOString()
  const digest = buildAuditDigest(state, opts.productClass)
  const hard_signals = digest.sections.flatMap(s => s.hardSignals)

  const base: SelfAuditResult = {
    product_class: opts.productClass,
    min_score: null, mean_score: null, blocking_defects: [],
    sections: [], summary: '', hard_signals, model, mode, generated_at, ok: false,
  }

  const user =
    `PRODUCT CLASS: ${opts.productClass}\n\n=== BRIEF (the yardstick) ===\n${digest.briefText}\n\n` +
    `=== DOSSIER SECTIONS TO SCORE ===\n` +
    digest.sections.map(s =>
      `--- section "${s.name}" (${s.label}) ---\n` +
      (s.hardSignals.length ? `HARD-SIGNALS (deterministic, treat as fact): ${s.hardSignals.join(', ')}\n` : '') +
      s.text).join('\n\n') +
    `\n\nScore every section. Section keys: ${digest.sections.map(s => s.name).join(', ')}.`

  let res
  try {
    res = await opts.callLlm({ model, system: JUDGE_SYSTEM, user, maxTokens: 4000, temperature: 0.1 })
  } catch (err) {
    return { ...base, error: `llm_call_failed: ${truncate((err as Error).message, 200)}` }
  }
  let parsed
  try {
    parsed = parseJudgeJson(res.text)
  } catch (err) {
    return { ...base, error: `judge_json_parse_failed: ${truncate((err as Error).message, 120)} | raw: ${truncate(res.text, 200)}` }
  }
  if (!parsed.sections.length) return { ...base, error: 'judge_returned_no_sections' }

  const scores = parsed.sections.map(s => s.score)
  const min_score = Math.min(...scores)
  const mean_score = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
  const blocking_defects = parsed.sections.filter(s => s.blocking).flatMap(s => s.defects.map(d => `[${s.name}] ${d}`))

  return {
    ...base, ok: true, sections: parsed.sections, summary: parsed.summary,
    min_score, mean_score, blocking_defects,
  }
}

// ───────────────────────── enforcing ladder (K10-style: shadow → enforce) ─────────────────────────
//
// The shadow stage records state.selfAudit every run. ENFORCING mode (env-flagged, like the K10
// PDF_ENGINE_K10_ENFORCING gate) turns a DECEPTION into a hard chain exit so a deceptive/broken
// dossier never ships. The trigger is NOT min_score<8 — an honestly-disclosed brief miss or an
// honest "—" is a weakness, not a deception, and must still render (gate-severity philosophy:
// WRONGNESS hard-exits, a disclosed DESIGN-BREACH flags+renders). Only a positive false claim or a
// broken core (blank headline, false-PASS banner, £0 BoM total) blocks.
//
// Tiers (graded for LLM-flake safety — the judge is the non-deterministic grok-4.3):
//   'off'           — shadow only (default): never exits.
//   'deterministic' — exits ONLY on a deterministic deception/broken hard-signal (computed in
//                     buildAuditDigest WITHOUT the LLM, so zero judge-flake risk). Safe enforce default.
//   'judge'         — ALSO exits on the LLM judge's blocking_defects (requires sa.ok). Stricter;
//                     opt-in once shadow telemetry shows the judge is reliable for a class.

export type SelfAuditEnforceMode = 'off' | 'deterministic' | 'judge'

/** Fatal chain exit code for an enforced self-audit block (next free after 30; see CLAUDE.md table).
 *  Module-local: consumers read decision.exitCode, nothing imports the constant. */
const SELF_AUDIT_EXIT_CODE = 31

/** Deterministic signals that mean the dossier is DECEPTIVE or BROKEN AT THE CORE — pure facts from
 *  buildAuditDigest, no LLM. A blank page-1 headline, a banner claiming pass over a failing/unverified
 *  cell, or a £0 bill of materials. NOT included: COMPLIANCE_FAIL_n (an honest, rendered FAIL row is a
 *  disclosed design-breach, not a deception) or COMPLIANCE_UNVERIFIED_n (an honest "—" weakness). */
const DETERMINISTIC_BLOCK_SIGNALS = ['HEADLINE_BLANK', 'COMPLIANCE_FALSE_PASS', 'BOM_TOTAL_ZERO']

export interface SelfAuditEnforcementDecision {
  shouldExit: boolean
  exitCode: number          // SELF_AUDIT_EXIT_CODE when shouldExit, else 0
  mode: SelfAuditEnforceMode
  reasons: string[]         // the deception/broken signals that triggered the block (empty if none)
}

/**
 * PURE + deterministic given (sa, mode): decide whether enforcing mode must hard-exit the chain.
 * Deception/broken-core blocks; a disclosed gap, an honest "—", a rendered FAIL row, or a low score
 * never blocks. Harness-tested (UNIVERSAL.self_audit_enforcement_blocks_deception).
 */
export function evaluateSelfAuditEnforcement(sa: SelfAuditResult, mode: SelfAuditEnforceMode): SelfAuditEnforcementDecision {
  if (mode === 'off') return { shouldExit: false, exitCode: 0, mode, reasons: [] }
  const reasons: string[] = []
  for (const h of (sa?.hard_signals ?? [])) {
    if (DETERMINISTIC_BLOCK_SIGNALS.some((d) => String(h).startsWith(d))) reasons.push(`deterministic:${h}`)
  }
  if (mode === 'judge' && sa?.ok && Array.isArray(sa.blocking_defects)) {
    for (const d of sa.blocking_defects) reasons.push(`judge-blocking:${d}`)
  }
  const shouldExit = reasons.length > 0
  return { shouldExit, exitCode: shouldExit ? SELF_AUDIT_EXIT_CODE : 0, mode, reasons }
}

/** Map PDF_ENGINE_SELF_AUDIT_ENFORCING to a mode. unset/0/false/shadow/off/no → off; judge/strict/all →
 *  judge; anything else truthy (1/true/deterministic/enforce) → deterministic (the safe enforce default). */
export function selfAuditEnforceModeFromEnv(v: string | undefined): SelfAuditEnforceMode {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '' || s === '0' || s === 'false' || s === 'shadow' || s === 'off' || s === 'no') return 'off'
  if (s === 'judge' || s === 'strict' || s === 'all') return 'judge'
  return 'deterministic'
}
