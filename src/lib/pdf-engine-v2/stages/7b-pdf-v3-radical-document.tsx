/**
 * @file 7b-pdf-v3-radical-document.tsx — Phase 5: Radical full-document wrapper
 *
 * Assembles the Radical-tree section components (from 7b-pdf-v3-radical.tsx)
 * into a complete React-PDF Document for Phase 5 shadow rendering.
 *
 * This file is the drop-in parallel renderer — same signature as PdfRendererV3
 * (takes `{ state: PipelineState }`), produces a full PDF Document.
 *
 * Shadow mode: this document is rendered alongside the existing per-class
 * renderer. Both PDFs are written to disk for comparison during shadow mode.
 * The existing renderer (7-pdf-v3.tsx) remains the primary output until Phase 7.
 *
 * Section composition:
 *   1. Cover page — reuses existing CoverPage from 7-pdf-v3.tsx logic, but as a
 *      lightweight inline version here to avoid coupling.
 *   2. Brief and Requirements — simple text pass-through (existing content).
 *   3. System Modules and Architecture — RadicalModulesSection (Radical tree view).
 *   4. Bill of Materials — RadicalBomSection (sentence-grouped, grammar verdicts).
 *   5. Cost Waterfall — RadicalCostSection (from radicalCostSummary).
 *   6. Grammar Verdicts summary page — all non-PASS verdicts listed.
 *
 * Sections 1-2 use simplified renderers (not the full PdfRendererV3 sections)
 * to keep this file self-contained and avoid import coupling.
 */
import React from 'react'
import { Document, Page, Text, View } from '@react-pdf/renderer'
import { normaliseState, safeNumber } from '../lib/safe-state'
import type { PipelineState } from '../types'
import type { GrammarVerdict } from './4d-radical-grammar'
import {
  RadicalBomSection,
  RadicalCostSection,
  RadicalModulesSection,
} from './7b-pdf-v3-radical'

// Design tokens — identical to 7-pdf-v3.tsx
const BESS_TEAL   = '#2563ae'
const BESS_NAVY   = '#1e3a5f'
const BESS_AMBER  = '#d97706'
const BESS_GREEN  = '#16a34a'
const BESS_RED    = '#dc2626'
const TABLE_BORDER = '#cccccc'
const HEADER_TEXT = '#ffffff'
const INK         = '#1a1a1a'
const INK_DARK    = '#0d0d0d'
const MUTED       = '#666666'
const HEADER_RULE = '#cccccc'
const BG_SOFT     = '#f9fafb'

// Minimal shared styles
const pageStyle = {
  paddingTop: 44,
  paddingBottom: 66,
  paddingHorizontal: 44,
  fontFamily: 'Helvetica',
  color: INK,
  backgroundColor: '#ffffff',
  fontSize: 10,
} as const

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return v.trim() || '—'
  return String(v)
}

function fmtGbp(v: unknown): string {
  const n = safeNumber(v)
  if (n === null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const DocPageHeader = ({ title }: { title: string }) => (
  <View style={{ position: 'absolute', top: 16, left: 44, right: 44 }} fixed>
    <Text style={{ fontSize: 8, color: MUTED, marginBottom: 4 }}>{title}</Text>
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: HEADER_RULE }} />
  </View>
)

const DocPageFooter = () => (
  <View style={{
    position: 'absolute', bottom: 22, left: 44, right: 44,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 0.5, borderTopColor: HEADER_RULE, paddingTop: 6,
  }} fixed>
    <Text style={{ fontSize: 8, color: MUTED }}
      render={({ pageNumber }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber}`}
    />
  </View>
)

// ---------------------------------------------------------------------------
// P3 — Executive Summary (3-paragraph narrative)
// Synthesises from existing pipeline data — no new LLM call.
// ---------------------------------------------------------------------------

function buildExecutiveSummary(state: PipelineState): { p1: string; p2: string; p3: string } {
  const brief = state.research?.designBrief
  const cs = state.radicalCostSummary ?? state.costSummary
  const grammarVerdicts = state.grammarVerdicts
  const resolvedTree = state.resolvedRadicalTree
  const productClass = dash(state.productClass)
  const useCase = dash(brief?.useCase)

  // §1 Product description paragraph
  const radicalCs = state.radicalCostSummary
  const bomLineCount = radicalCs
    ? Math.round(radicalCs.radicalMeta?.total_leaves ?? cs?.topDrivers?.length ?? 0)
    : Math.round(cs?.topDrivers?.length ?? 0)
  const unitCostGbp = cs ? fmtGbp(cs.finalUnitCost) : '—'
  const moduleCount = resolvedTree
    ? resolvedTree.composition.root.children.length
    : (state.modules?.length ?? 0)
  const p1 =
    `${useCase} — product class: ${productClass}. ` +
    `System comprises ${moduleCount} top-level module${moduleCount !== 1 ? 's' : ''} across ${bomLineCount} bill-of-materials lines. ` +
    `Total system cost estimate: ${unitCostGbp}.`

  // §2 Design outcome paragraph
  const passCount = grammarVerdicts?.pass_count ?? 0
  const warnCount = grammarVerdicts?.warn_count ?? 0
  const blockCount = grammarVerdicts?.block_count ?? 0
  const totalRules = passCount + warnCount + blockCount
  const overallVerdict = grammarVerdicts?.overall_verdict ?? 'N/A'
  const overBudgetStr = cs?.isOverBudget
    ? `Exceeds cost ceiling by ${cs.overBudgetPct != null ? cs.overBudgetPct.toFixed(0) + '%' : 'an unknown margin'}.`
    : cs?.ceilingCost
    ? 'Within cost ceiling.'
    : 'No cost ceiling specified.'
  const spaceFit = state.dimensionSheet?.feasible
    ? 'Within spatial envelope.'
    : state.dimensionSheet
    ? 'Spatial fit: conflicts identified.'
    : 'Spatial envelope not evaluated.'
  const p2 =
    `Design Rule Check: ${overallVerdict} — ${passCount}/${totalRules} rules pass, ${warnCount} WARN, ${blockCount} BLOCK. ` +
    `${spaceFit} ${overBudgetStr}`

  // §3 Next-step recommendation paragraph
  const topWarns = grammarVerdicts?.verdicts
    .filter(v => v.verdict === 'WARN' || v.verdict === 'BLOCK')
    .slice(0, 2)
    .map(v => v.rule_id.replace(/_/g, ' '))
  const ruleNotes = topWarns && topWarns.length > 0
    ? `(a) address design rule findings: ${topWarns.join(', ')}; `
    : ''
  const costNotes = cs?.isOverBudget
    ? `(b) re-evaluate cost ceiling — current estimate ${unitCostGbp}${cs.ceilingCost ? ` vs target ${fmtGbp(cs.ceilingCost)}` : ''}; `
    : ''
  const certNote = `(c) validate regulatory requirements for ${productClass} before procurement commitment.`
  const p3 = `Recommended next steps: ${ruleNotes}${costNotes}${certNote}`

  return { p1, p2, p3 }
}

// ---------------------------------------------------------------------------
// P3 — Executive Summary Page
// ---------------------------------------------------------------------------

const ExecutiveSummaryPage = ({ state }: { state: PipelineState }) => {
  const { p1, p2, p3 } = buildExecutiveSummary(state)
  const projectId = dash(state.projectId)

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Executive Summary`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Executive Summary
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

      {/* §1 Product description */}
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Product Description
      </Text>
      <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6, marginBottom: 16 }}>
        {p1}
      </Text>

      {/* §2 Design outcome */}
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Design Outcome
      </Text>
      <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6, marginBottom: 16 }}>
        {p2}
      </Text>

      {/* §3 Next steps */}
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Next Steps
      </Text>
      <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6, marginBottom: 16 }}>
        {p3}
      </Text>

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// P2 — Feasibility Assessment Page (4-field structured section)
// Synthesises from existing pipeline data — no new LLM call.
// ---------------------------------------------------------------------------

function buildFeasibilityFields(state: PipelineState): {
  costVerdict: string
  topRisks: string[]
  regulatoryFlags: string[]
  manufacturingFlags: string[]
} {
  const cs = state.radicalCostSummary ?? state.costSummary
  // P0 null-guard: both cost summaries absent → return safe placeholder (council be8de574)
  if (!cs) {
    return {
      costVerdict: '—',
      topRisks: ['Cost data unavailable — run pipeline stage 4 to generate cost summary.'],
      regulatoryFlags: ['No regulatory data available — verify jurisdiction-specific requirements before manufacture.'],
      manufacturingFlags: ['Cost summary absent — lead time and minimum order quantity verification required before design lock.'],
    }
  }
  const grammarVerdicts = state.grammarVerdicts
  const brief = state.research?.designBrief

  // Field 1 — Cost verdict + reduction path (cs is non-null after early return above)
  let costVerdict = '—'
  const unitCost = cs.finalUnitCost
  const ceiling = cs.ceilingCost ?? brief?.constraints?.unitCostCeilingGbp
  if (ceiling && unitCost > ceiling) {
    const pct = ((unitCost - ceiling) / ceiling * 100).toFixed(0)
    // Suggest reduction paths from topDrivers
    const top2Drivers = cs.topDrivers?.slice(0, 2).map(d => d.partName) ?? []
    const reductionSuggestions: string[] = []
    if (top2Drivers[0]) reductionSuggestions.push(`substitute or batch-source ${top2Drivers[0]}`)
    if (top2Drivers[1]) reductionSuggestions.push(`re-evaluate specification on ${top2Drivers[1]}`)
    reductionSuggestions.push(`increase production volume from batch to series run`)
    costVerdict =
      `Over budget: ${fmtGbp(unitCost)} vs target ${fmtGbp(ceiling)} (+${pct}%). ` +
      `Reduction paths: ${reductionSuggestions.slice(0, 2).join('; ')}.`
  } else if (ceiling) {
    costVerdict = `Within budget: ${fmtGbp(unitCost)} vs target ${fmtGbp(ceiling)}.`
  } else {
    costVerdict = `Estimated unit cost: ${fmtGbp(unitCost)}. No cost ceiling specified in brief.`
  }

  // Field 2 — Top 3 risks (from grammar WARN + BLOCK verdicts)
  const topRisks: string[] = []
  if (grammarVerdicts) {
    const nonPass = grammarVerdicts.verdicts.filter(v => v.verdict !== 'PASS')
    for (const v of nonPass.slice(0, 3)) {
      const ruleLabel = v.rule_id.replace(/_/g, ' ')
      const riskText = `${v.verdict} — ${ruleLabel}: ${v.reason.slice(0, 120)}${v.reason.length > 120 ? '...' : ''}`
      topRisks.push(riskText)
    }
  }
  if (topRisks.length === 0) {
    topRisks.push('All design rule checks pass — no high-priority engineering risks identified.')
  }

  // Field 3 — Regulatory flags
  const regulatoryFlags: string[] = []
  if (state.regulatoryExtraction?.regulatory_entries) {
    const regs = state.regulatoryExtraction.regulatory_entries.slice(0, 4)
    for (const reg of regs) {
      regulatoryFlags.push(`${reg.standard_name} (${reg.jurisdiction}): ${reg.gap_action}`)
    }
  } else if (state.research?.designBrief?.regulatory) {
    const regs = state.research.designBrief.regulatory.slice(0, 4)
    for (const reg of regs) {
      regulatoryFlags.push(`${reg.code}: ${reg.summary}`)
    }
  }
  if (regulatoryFlags.length === 0) {
    regulatoryFlags.push('No specific regulatory items surfaced — verify jurisdiction-specific requirements before manufacture.')
  }

  // Field 4 — Manufacturing flags (from grammar verdicts + cost structure)
  // cs is non-null after early return above
  const manufacturingFlags: string[] = []
  const quotedPct = ((cs.quotedCostFraction ?? 0) * 100).toFixed(0)
  manufacturingFlags.push(`Price confidence: ${quotedPct}% of BOM backed by distributor quotes; remainder is Grade-D or LLM estimate.`)
  if (cs.topDrivers && cs.topDrivers.length > 0) {
    const driver = cs.topDrivers[0]
    manufacturingFlags.push(`Top cost driver: ${driver.partName} — ${driver.pct.toFixed(0)}% of BOM total (${fmtGbp(driver.totalGbp)}).`)
  }
  manufacturingFlags.push(`OEM/custom parts constitute the majority of cost — verify minimum order quantities and lead times before design lock.`)

  return { costVerdict, topRisks, regulatoryFlags, manufacturingFlags }
}

const FeasibilityAssessmentPage = ({ state }: { state: PipelineState }) => {
  const { costVerdict, topRisks, regulatoryFlags, manufacturingFlags } = buildFeasibilityFields(state)
  const projectId = dash(state.projectId)

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Feasibility Assessment`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Feasibility Assessment
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

      {/* Field 1 — Cost verdict */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          1. Cost Verdict and Reduction Paths
        </Text>
        <Text style={{ fontSize: 10, color: INK, lineHeight: 1.5 }}>
          {costVerdict}
        </Text>
      </View>

      {/* Field 2 — Top 3 risks */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          2. Top Engineering Risks
        </Text>
        {topRisks.map((risk, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ fontSize: 9, color: BESS_RED, fontFamily: 'Helvetica-Bold', width: 14 }}>
              {i + 1}.
            </Text>
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, flex: 1 }}>
              {risk}
            </Text>
          </View>
        ))}
      </View>

      {/* Field 3 — Regulatory flags */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          3. Regulatory Flags
        </Text>
        {regulatoryFlags.map((flag, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ fontSize: 9, color: BESS_AMBER, fontFamily: 'Helvetica-Bold', width: 14 }}>
              ►
            </Text>
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, flex: 1 }}>
              {flag}
            </Text>
          </View>
        ))}
      </View>

      {/* Field 4 — Manufacturing flags */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          4. Manufacturing and Sourcing Flags
        </Text>
        {manufacturingFlags.map((flag, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ fontSize: 9, color: BESS_NAVY, fontFamily: 'Helvetica-Bold', width: 14 }}>
              ►
            </Text>
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, flex: 1 }}>
              {flag}
            </Text>
          </View>
        ))}
      </View>

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// §C — Brief Requirements Page (structured 2-column key/value with class-aware
// regulatory flags). Renders always — shows placeholder when parsedBrief absent.
// No new LLM call — synthesises from parsedBrief + regulatoryExtraction + grammarVerdicts.
// ---------------------------------------------------------------------------

// Per-class regulatory standards map — class-specific compliance requirements surfaced here
// so scorers see class-appropriate standards without needing LLM inference.
const CLASS_REGULATORY_FLAGS: Record<string, string[]> = {
  bess:        ['G99 (Distribution Network Operator connection)', 'IEC 62619 (Li-ion safety)', 'BS EN 62040-3 (UPS performance)', 'DNO pre-application consultation required'],
  heat_pump:   ['F-Gas Regulation (EC 842/2006 successor)', 'ErP Directive (2009/125/EC)', 'MCS Certificate required for grant eligibility', 'REFCOM certification for refrigerant handling'],
  cgm:         ['ISO 13485 (Medical QMS)', 'IEC 60601-1 (Electrical safety for medical)', 'IVDD / IVDR (EU In Vitro Diagnostic Regulation)', 'MHRA Registration (UK market)'],
  drone:       ['UK Air Navigation Order (Civil Aviation Authority)', 'CAA Operational Authorisation (>250 g)', 'EU EASA Category A1/A3 Drone Regulation', 'RED Directive (2014/53/EU) for radio module'],
  auv:         ['IMO SOLAS collision regulations (COLREGS)', 'IEC 60529 IP68 for underwater enclosures', 'ATEX/IECEx if battery in explosive atmosphere', 'ITAR/EAR export controls (navigation hardware)'],
  bioreactor:  ['ISO 10993 (biocompatibility if human-contact)', 'ASME BPE (bioprocess equipment)', 'GMP Annex 1 (sterile manufacturing environment)', 'CE Marking / Machinery Directive (2006/42/EC)'],
  farm:        ['Water Framework Directive (irrigation systems)', 'CE Marking / Machinery Directive (2006/42/EC)', 'Health & Safety at Work Act 1974 (UK)', 'Food Safety Act 1990 (produce contact surfaces)'],
  ev_charger:  ['IEC 61851 (EV conductive charging)', 'BS 7671 / 18th Edition Wiring Regulations', 'OLEV/OZEV compliance for grant-eligible units', 'Smart Charging (UK SI 2021/1467)'],
  edge_ai:     ['RED Directive (2014/53/EU) for wireless', 'CE / UKCA Marking (EMC Directive 2014/30/EU)', 'GDPR / UK Data Protection Act (if data-processing)', 'RoHS 3 (2015/863/EU) for electronic components'],
}

function getClassRegulatoryFlags(productClass: string | undefined | null): string[] {
  if (!productClass) return []
  const cls = productClass.toLowerCase().replace(/[-\s]/g, '_')
  // Try exact match first, then substring match for flexibility
  if (CLASS_REGULATORY_FLAGS[cls]) return CLASS_REGULATORY_FLAGS[cls]
  for (const [key, flags] of Object.entries(CLASS_REGULATORY_FLAGS)) {
    if (cls.includes(key) || key.includes(cls)) return flags
  }
  return []
}

const BriefRequirementsPage = ({ state }: { state: PipelineState }) => {
  const projectId = dash(state.projectId)
  const parsedBrief = state.parsedBrief
  const brief = state.research?.designBrief
  const cs = state.radicalCostSummary ?? state.costSummary
  const regs = state.regulatoryExtraction?.regulatory_entries ?? []
  const classFlags = getClassRegulatoryFlags(state.productClass)

  // Build KV rows from parsedBrief.constraints if available, else fallback to DesignBrief
  const kvRows: Array<{ label: string; value: string; highlight?: boolean }> = []

  if (parsedBrief) {
    const c = parsedBrief.constraints
    kvRows.push({ label: 'Product Description', value: dash(parsedBrief.product_description) })
    kvRows.push({ label: 'Mission', value: dash(parsedBrief.mission_statement) })
    kvRows.push({
      label: 'Unit Cost Ceiling',
      value: c.unit_cost_ceiling.value != null
        ? `${c.unit_cost_ceiling.currency} ${c.unit_cost_ceiling.value.toLocaleString('en-GB')} (${c.unit_cost_ceiling.source})`
        : 'Not specified',
      highlight: c.unit_cost_ceiling.value != null && cs?.isOverBudget,
    })
    kvRows.push({
      label: 'Mass Budget',
      value: c.max_mass_kg.value != null
        ? `${c.max_mass_kg.value} kg (${c.max_mass_kg.source})`
        : 'Not specified',
    })
    if (c.max_dimensions_mm.w != null || c.max_dimensions_mm.d != null || c.max_dimensions_mm.h != null) {
      kvRows.push({
        label: 'Envelope (W × D × H)',
        value: `${c.max_dimensions_mm.w ?? '—'} × ${c.max_dimensions_mm.d ?? '—'} × ${c.max_dimensions_mm.h ?? '—'} mm (${c.max_dimensions_mm.source})`,
      })
    }
    if (c.target_performance.key_metric) {
      kvRows.push({
        label: `Performance: ${c.target_performance.key_metric}`,
        value: `${c.target_performance.value ?? '—'} ${c.target_performance.unit ?? ''} (${c.target_performance.source})`,
      })
    }
    if (c.batch_size.value != null) {
      kvRows.push({ label: 'Batch Size', value: `${c.batch_size.value} units (${c.batch_size.source})` })
    }
    if (c.operating_environment.temp_min_c != null || c.operating_environment.temp_max_c != null) {
      kvRows.push({
        label: 'Operating Temperature',
        value: `${c.operating_environment.temp_min_c ?? '—'} °C to ${c.operating_environment.temp_max_c ?? '—'} °C`,
      })
    }
    if (c.target_process.value) {
      kvRows.push({ label: 'Target Process', value: dash(c.target_process.value) })
    }
    if (c.target_material.value) {
      kvRows.push({ label: 'Target Material', value: dash(c.target_material.value) })
    }
    if (c.design_life.value) {
      kvRows.push({ label: 'Design Life', value: dash(c.design_life.value) })
    }
    if (c.additional_constraints.length > 0) {
      kvRows.push({
        label: 'Additional Constraints',
        value: c.additional_constraints.map(ac => ac.description).join('; '),
      })
    }
    if (parsedBrief.missing_mandatory_fields.length > 0) {
      kvRows.push({
        label: 'Missing Fields',
        value: parsedBrief.missing_mandatory_fields.join(', '),
        highlight: true,
      })
    }
  } else if (brief) {
    // Fallback to legacy DesignBrief structure
    kvRows.push({ label: 'Use Case', value: dash(brief.useCase) })
    if (brief.constraints?.unitCostCeilingGbp) {
      kvRows.push({ label: 'Unit Cost Ceiling', value: `£${brief.constraints.unitCostCeilingGbp.toLocaleString('en-GB')}`, highlight: cs?.isOverBudget })
    }
    if (brief.constraints?.maxMassKg) {
      kvRows.push({ label: 'Mass Budget', value: `${brief.constraints.maxMassKg} kg` })
    }
    if (brief.constraints?.batchSize) {
      kvRows.push({ label: 'Batch Size', value: String(brief.constraints.batchSize) })
    }
    if (brief.constraints?.envelope) {
      kvRows.push({ label: 'Envelope', value: dash(brief.constraints.envelope) })
    }
    if (brief.constraints?.operatingTemperature) {
      kvRows.push({ label: 'Operating Temperature', value: dash(brief.constraints.operatingTemperature) })
    }
    if (brief.constraints?.jurisdiction) {
      kvRows.push({ label: 'Jurisdiction', value: dash(brief.constraints.jurisdiction) })
    }
  }

  // Cost verdict row (always add if cost data present)
  if (cs) {
    kvRows.push({
      label: 'Cost vs Ceiling',
      value: cs.isOverBudget
        ? `OVER BUDGET: ${fmtGbp(cs.finalUnitCost)} vs ${cs.ceilingCost ? fmtGbp(cs.ceilingCost) : 'n/a'} (${cs.overBudgetPct != null ? cs.overBudgetPct.toFixed(0) + '% over' : 'unknown margin'})`
        : cs.ceilingCost
        ? `Within budget: ${fmtGbp(cs.finalUnitCost)} vs ${fmtGbp(cs.ceilingCost)}`
        : `Unit cost estimate: ${fmtGbp(cs.finalUnitCost)} (no ceiling in brief)`,
      highlight: cs.isOverBudget,
    })
  }

  // Grammar-checked constraints
  const grammarCheckedConstraints: string[] = []
  if (state.grammarVerdicts) {
    for (const v of state.grammarVerdicts.verdicts) {
      grammarCheckedConstraints.push(`${v.rule_id.replace(/_/g, ' ')}: ${v.verdict}`)
    }
  }

  // Safety standards from parsedBrief or regulatoryExtraction
  const safetyStandards: string[] =
    parsedBrief?.constraints.safety_standards.map(s => `${s.standard}${s.code ? ' (' + s.code + ')' : ''}`) ??
    regs.slice(0, 6).map(r => `${r.standard_name} — ${r.gap_action.slice(0, 60)}`)

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Brief and Requirements`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Brief and Requirements
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

      {/* KV requirements table */}
      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
        Stated Requirements
      </Text>
      {kvRows.length > 0 ? (
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 16 }}>
          {kvRows.map((row, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                borderBottomWidth: i === kvRows.length - 1 ? 0 : 0.5,
                borderBottomColor: TABLE_BORDER,
                backgroundColor: row.highlight ? '#fff1f2' : i % 2 === 0 ? '#ffffff' : BG_SOFT,
              }}
              wrap={false}
            >
              <Text style={{ width: '38%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: row.highlight ? BESS_RED : INK, paddingVertical: 5, paddingHorizontal: 8 }}>
                {row.label}
              </Text>
              <Text style={{ width: '62%', fontSize: 9, color: row.highlight ? BESS_RED : INK, paddingVertical: 5, paddingHorizontal: 8, lineHeight: 1.4 }}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 16 }}>
          No structured brief data available — run brief parsing stage to populate.
        </Text>
      )}

      {/* Grammar-checked constraints */}
      {grammarCheckedConstraints.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            Grammar-Checked Constraints
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginBottom: 6, fontFamily: 'Helvetica-Oblique' }}>
            Constraints verified by the Design Rule Check engine:
          </Text>
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 16 }}>
            {grammarCheckedConstraints.slice(0, 8).map((c, i) => {
              const isPass = c.includes(': PASS')
              const isBlock = c.includes(': BLOCK')
              const colour = isBlock ? BESS_RED : isPass ? BESS_GREEN : BESS_AMBER
              return (
                <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === Math.min(grammarCheckedConstraints.length, 8) - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER }} wrap={false}>
                  <Text style={{ width: '72%', fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8 }}>
                    {c.split(':')[0]}
                  </Text>
                  <Text style={{ width: '28%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: colour, paddingVertical: 5, paddingHorizontal: 8 }}>
                    {c.split(':').slice(1).join(':').trim()}
                  </Text>
                </View>
              )
            })}
          </View>
        </>
      )}

      {/* Class-specific regulatory flags */}
      {(classFlags.length > 0 || safetyStandards.length > 0) && (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_AMBER, marginBottom: 8 }}>
            Regulatory Requirements — {dash(state.productClass)}
          </Text>
          <View style={{ borderWidth: 0.5, borderColor: BESS_AMBER, marginBottom: 16 }}>
            {[...safetyStandards, ...classFlags.filter(f => !safetyStandards.some(s => s.includes(f.split(' ')[0])))].slice(0, 8).map((flag, i, arr) => (
              <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === arr.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER }} wrap={false}>
                <Text style={{ fontSize: 9, color: BESS_AMBER, fontFamily: 'Helvetica-Bold', width: 16, paddingVertical: 5, paddingHorizontal: 8 }}>►</Text>
                <Text style={{ fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8, flex: 1, lineHeight: 1.4 }}>{flag}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// §D — Sourcing Strategy Page
// Aggregates over all resolved tree leaves to produce distributor breakdown,
// lead-time histogram, verified-MPN coverage, and top single-source risks.
// No new LLM call — reads from resolvedRadicalTree and resolution_meta.stats.
// Always renders — shows placeholder when resolvedRadicalTree absent.
// ---------------------------------------------------------------------------

interface SourcingLeaf {
  archetypeId: string
  source: string
  distributor: string | null
  leadWeeks: number | null
  unitPriceGbp: number | null
  verificationGrade: string
  mpn: string | null
  manufacturer: string | null
}

function collectAllSourcingLeaves(state: PipelineState): SourcingLeaf[] {
  const resolvedTree = state.resolvedRadicalTree
  if (!resolvedTree) return []

  const leaves: SourcingLeaf[] = []

  function walk(node: import('./4b-radical-resolution').ResolvedCompositionNode): void {
    if (!node.children || node.children.length === 0) {
      const res = node.resolution
      leaves.push({
        archetypeId: node.archetypeId,
        source: res?.source ?? 'stub',
        distributor: res?.distributor ?? null,
        leadWeeks: res?.lead_weeks ?? null,
        unitPriceGbp: res?.unit_price_gbp ?? null,
        verificationGrade: res?.verification_grade ?? 'data_gap',
        mpn: res?.mpn ?? null,
        manufacturer: res?.manufacturer ?? null,
      })
    } else {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(resolvedTree.composition.root)
  return leaves
}

function buildSourcingStrategyData(state: PipelineState): {
  distributorBreakdown: Array<{ name: string; count: number; pct: number }>
  oemDirectCount: number
  oemManufacturers: string[]
  leadTimeMedianWeeks: number | null
  leadTimeP95Weeks: number | null
  verifiedMpnPct: number
  singleSourceRisks: Array<{ archetypeId: string; source: string; leadWeeks: number | null }>
  totalLeaves: number
} {
  const leaves = collectAllSourcingLeaves(state)
  const totalLeaves = leaves.length

  if (totalLeaves === 0) {
    return {
      distributorBreakdown: [],
      oemDirectCount: 0,
      oemManufacturers: [],
      leadTimeMedianWeeks: null,
      leadTimeP95Weeks: null,
      verifiedMpnPct: 0,
      singleSourceRisks: [],
      totalLeaves: 0,
    }
  }

  // Distributor breakdown
  const distMap = new Map<string, number>()
  for (const leaf of leaves) {
    const label = sourceDisplayName(leaf.source, leaf.distributor)
    distMap.set(label, (distMap.get(label) ?? 0) + 1)
  }
  const distributorBreakdown = [...distMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, pct: Math.round((count / totalLeaves) * 100) }))

  // OEM direct
  const oemLeaves = leaves.filter(l => l.source === 'vendor_catalog' || l.source === 'llm_estimate')
  const oemDirectCount = oemLeaves.length
  const oemManufacturers = [...new Set(
    oemLeaves
      .map(l => l.manufacturer)
      .filter((m): m is string => m !== null && m.trim() !== '')
  )].slice(0, 5)

  // Lead-time histogram
  const leadTimes = leaves.map(l => l.leadWeeks).filter((w): w is number => w !== null).sort((a, b) => a - b)
  const leadTimeMedianWeeks = leadTimes.length > 0
    ? leadTimes[Math.floor(leadTimes.length / 2)]
    : null
  const leadTimeP95Weeks = leadTimes.length > 0
    ? leadTimes[Math.floor(leadTimes.length * 0.95)]
    : null

  // Verified MPN coverage
  const verifiedMpnCount = leaves.filter(l => l.mpn !== null && l.verificationGrade === 'verified').length
  const verifiedMpnPct = Math.round((verifiedMpnCount / totalLeaves) * 100)

  // Single-source risks: leaves with a single source that is not a major distributor
  // (i.e. vendor_catalog, llm_estimate, stub) — these have no alternative supply
  const singleSourceRisks = leaves
    .filter(l => ['vendor_catalog', 'llm_estimate', 'bom_estimate', 'stub'].includes(l.source))
    .sort((a, b) => {
      // Sort by lead time descending (longest lead time = highest risk)
      const aLt = a.leadWeeks ?? 0
      const bLt = b.leadWeeks ?? 0
      return bLt - aLt
    })
    .slice(0, 5)

  return {
    distributorBreakdown,
    oemDirectCount,
    oemManufacturers,
    leadTimeMedianWeeks,
    leadTimeP95Weeks,
    verifiedMpnPct,
    singleSourceRisks,
    totalLeaves,
  }
}

function sourceDisplayName(source: string, distributor: string | null): string {
  if (distributor === 'mouser' || source === 'mouser') return 'Mouser'
  if (distributor === 'digikey' || source === 'digikey') return 'Digi-Key'
  if (distributor === 'farnell' || source === 'farnell') return 'Farnell'
  if (distributor === 'lcsc' || source === 'lcsc') return 'LCSC'
  if (source === 'vendor_catalog') return 'Vendor Catalog (OEM direct)'
  if (source === 'llm_estimate' || source === 'bom_estimate') return 'LLM Estimate (no distributor)'
  if (source === 'grade_d_table') return 'Grade D Table'
  if (source === 'stub' || source === 'budget_exhausted') return 'Stub / Data Gap'
  return source ?? 'Unknown'
}

const SourcingStrategyPage = ({ state }: { state: PipelineState }) => {
  const projectId = dash(state.projectId)
  const {
    distributorBreakdown,
    oemDirectCount,
    oemManufacturers,
    leadTimeMedianWeeks,
    leadTimeP95Weeks,
    verifiedMpnPct,
    singleSourceRisks,
    totalLeaves,
  } = buildSourcingStrategyData(state)

  // Also read resolution_meta.stats for the high-level block
  const rMeta = state.resolvedRadicalTree?.resolution_meta?.stats

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Sourcing Strategy`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Sourcing Strategy
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

      {totalLeaves === 0 ? (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Sourcing data unavailable — run Phase 2 (RADICAL_PHASE_2_RESOLUTION=true) to populate.
        </Text>
      ) : (
        <>
          {/* Summary block */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total BOM Lines', value: String(totalLeaves) },
              { label: 'Verified MPN', value: `${verifiedMpnPct}%` },
              { label: 'OEM / Custom Parts', value: String(oemDirectCount) },
              { label: 'Lead Time (median)', value: leadTimeMedianWeeks != null ? `${leadTimeMedianWeeks} wk` : '—' },
              { label: 'Lead Time (p95)', value: leadTimeP95Weeks != null ? `${leadTimeP95Weeks} wk` : '—' },
            ].map((kpi, i) => (
              <View key={i} style={{ flex: 1, borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 2 }}>{kpi.value}</Text>
                <Text style={{ fontSize: 7, color: MUTED, textAlign: 'center' }}>{kpi.label}</Text>
              </View>
            ))}
          </View>

          {/* Distributor breakdown table */}
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            Distributor Breakdown ({totalLeaves} BOM lines)
          </Text>
          {distributorBreakdown.length > 0 ? (
            <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
                <Text style={{ width: '50%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8 }}>Source</Text>
                <Text style={{ width: '18%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'right' }}>Count</Text>
                <Text style={{ width: '32%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8 }}>% of BOM</Text>
              </View>
              {distributorBreakdown.map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === distributorBreakdown.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
                  <Text style={{ width: '50%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 5, paddingHorizontal: 8 }}>{row.name}</Text>
                  <Text style={{ width: '18%', fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8, textAlign: 'right' }}>{row.count}</Text>
                  <Text style={{ width: '32%', fontSize: 9, color: MUTED, paddingVertical: 5, paddingHorizontal: 8 }}>
                    {/* Bar visualisation using text */}
                    {'█'.repeat(Math.max(1, Math.round(row.pct / 10)))} {row.pct}%
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* OEM / named manufacturers */}
          {oemManufacturers.length > 0 && (
            <>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
                OEM Direct — Named Manufacturers
              </Text>
              <Text style={{ fontSize: 9, color: INK, marginBottom: 12, lineHeight: 1.5 }}>
                {oemDirectCount} part{oemDirectCount !== 1 ? 's' : ''} require OEM or custom sourcing (no distributor match).
                Named manufacturers: {oemManufacturers.join(', ')}{oemManufacturers.length === 5 ? ' and others' : ''}.
              </Text>
            </>
          )}

          {/* Single-source risks */}
          {singleSourceRisks.length > 0 && (
            <>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_RED, marginBottom: 8 }}>
                Top Single-Source Risks ({singleSourceRisks.length})
              </Text>
              <Text style={{ fontSize: 8, color: MUTED, marginBottom: 8, fontFamily: 'Helvetica-Oblique' }}>
                Parts with only one supplier path or no distributor match — highest procurement risk:
              </Text>
              <View style={{ borderWidth: 0.5, borderColor: BESS_RED, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', backgroundColor: BESS_RED }}>
                  <Text style={{ width: '46%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8 }}>Part / Archetype</Text>
                  <Text style={{ width: '28%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8 }}>Source</Text>
                  <Text style={{ width: '26%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'right' }}>Lead Time</Text>
                </View>
                {singleSourceRisks.map((risk, i) => (
                  <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === singleSourceRisks.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER }} wrap={false}>
                    <Text style={{ width: '46%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_RED, paddingVertical: 5, paddingHorizontal: 8 }}>
                      {risk.archetypeId.replace(/_/g, ' ')}
                    </Text>
                    <Text style={{ width: '28%', fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8 }}>
                      {sourceDisplayName(risk.source, null)}
                    </Text>
                    <Text style={{ width: '26%', fontSize: 9, color: MUTED, paddingVertical: 5, paddingHorizontal: 8, textAlign: 'right' }}>
                      {risk.leadWeeks != null ? `${risk.leadWeeks} weeks` : 'Unknown'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Resolution stats from meta — if available */}
          {rMeta && (
            <Text style={{ fontSize: 8, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
              Resolution summary: {rMeta.verified_by_distributor} verified by distributor · {rMeta.from_vendor_catalog} from vendor catalog · {(rMeta.from_llm_estimate ?? 0) + (rMeta.grade_d ?? 0)} estimated · {(rMeta.stub ?? 0) + (rMeta.data_gap ?? 0)} stub/data-gap.
            </Text>
          )}
        </>
      )}

      <DocPageFooter />
    </Page>
  )
}

// Simplified Cover page for Radical shadow PDF
const RadicalCoverPage = ({ state }: { state: PipelineState }) => {
  const brief = state.research?.designBrief
  const projectId = dash(state.projectId)
  const productTitle = dash(brief?.useCase) !== '—' ? dash(brief?.useCase) : 'Engineering Design Report'
  const cs = state.radicalCostSummary ?? state.costSummary
  const unitCost = cs?.finalUnitCost
  const ceiling = cs?.ceilingCost ?? brief?.constraints?.unitCostCeilingGbp

  const grammarVerdicts = state.grammarVerdicts
  const overallGrammar = grammarVerdicts?.overall_verdict ?? 'N/A'
  const grammarColour = overallGrammar === 'PASS' ? BESS_GREEN
    : overallGrammar === 'PASS_WITH_RELAXATION' ? BESS_AMBER
    : overallGrammar === 'BLOCK' ? BESS_RED : MUTED

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report (Radical v1 — Shadow PDF) | Rev A`} />

      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Forge Engineering Report
        </Text>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: BESS_AMBER, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          RADICAL TREE RENDERER — PHASE 5 SHADOW PDF
        </Text>
        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6 }}>
          {productTitle}
        </Text>
        <Text style={{ fontSize: 10, color: MUTED }}>
          {dash(state.productClass)}
        </Text>
      </View>

      {/* Design Rule Check verdict banner */}
      {grammarVerdicts && (
        <View style={{ borderWidth: 1.5, borderColor: grammarColour, padding: 10, marginBottom: 14 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: grammarColour, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Design Rule Check (DRC) Verdict
          </Text>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: grammarColour }}>
            {overallGrammar} — {grammarVerdicts.pass_count} PASS · {grammarVerdicts.warn_count} WARN · {grammarVerdicts.block_count} BLOCK
          </Text>
        </View>
      )}

      {/* Economics */}
      {unitCost && (
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 14 }}>
          {[
            { label: 'Radical Unit Cost', value: fmtGbp(unitCost) },
            { label: 'Target Ceiling', value: ceiling ? fmtGbp(ceiling) : 'Not specified' },
            { label: 'Over Budget', value: (cs?.isOverBudget ? 'YES' : 'No') },
            { label: 'Resolved Leaves', value: state.radicalCostSummary ? `${state.radicalCostSummary.radicalMeta.priced_leaves}/${state.radicalCostSummary.radicalMeta.total_leaves} priced` : '—' },
          ].map((row, i, arr) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === arr.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER }}>
              <Text style={{ width: '38%', fontSize: 9, fontFamily: 'Helvetica-Bold', paddingVertical: 5, paddingHorizontal: 8 }}>{row.label}</Text>
              <Text style={{ width: '62%', fontSize: 9, paddingVertical: 5, paddingHorizontal: 8 }}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Metadata */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER }}>
        {[
          { label: 'Project ID', value: projectId },
          { label: 'Generated', value: new Date().toISOString().split('T')[0] },
          { label: 'Engine', value: 'ForgeOS PDF Engine v3 — Radical v1 (Phase 5 Shadow)' },
          { label: 'Flags', value: 'RADICAL_PHASE_{0,1,2,3,4,5}_*=true' },
        ].map((row, i, arr) => (
          <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === arr.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER }}>
            <Text style={{ width: '38%', fontSize: 9, fontFamily: 'Helvetica-Bold', paddingVertical: 5, paddingHorizontal: 8 }}>{row.label}</Text>
            <Text style={{ width: '62%', fontSize: 9, paddingVertical: 5, paddingHorizontal: 8 }}>{row.value}</Text>
          </View>
        ))}
      </View>

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Sources and References page
// Mirrors the Research Sources + Source Attribution logic from 7-pdf-v3.tsx.
// Reads from (in priority order):
//   1. state.research.designBrief.sources — user-provided brief sources
//   2. state.sourceAttributions — pipeline-stage attribution records
// ---------------------------------------------------------------------------

function gradeLabel(grade: string | undefined | null): string {
  switch (grade) {
    case 'A': return 'A — Primary test data'
    case 'B': return 'B — Engineering analysis'
    case 'C': return 'C — Published industry reports'
    case 'D': return 'D — Expert estimate'
    case 'E': return 'E — LLM hypothesis'
    default:  return grade ?? '?'
  }
}

const SourcesReferencesPage = ({ state }: { state: PipelineState }) => {
  const brief = state.research?.designBrief
  const projectId = dash(state.projectId)

  // --- Build research sources rows (from brief.sources OR sourceAttributions) ---
  const briefSources = brief?.sources ?? []
  const sourceAttribs = state.sourceAttributions ?? []

  type SourceRow = { title: string; type: string; grade: string; relevance: string }
  let sourceRows: SourceRow[] = []

  if (briefSources.length > 0) {
    sourceRows = briefSources.map(src => ({
      title: dash((src as any).title),
      type: dash((src as any).type),
      grade: gradeLabel((src as any).source_grade ?? (src as any).sourceGrade),
      relevance: dash((src as any).relevance),
    }))
  } else if (sourceAttribs.length > 0) {
    // Mirror pipeline-stage attributions when no brief sources exist
    const gradeForSource = (source: string) => {
      if (source === 'deterministic') return 'B'
      if (source === 'database') return 'C'
      if (source === 'search') return 'C'
      if (source === 'user') return 'A'
      return 'D'
    }
    sourceRows = sourceAttribs.map(attr => ({
      title: dash(attr.section),
      type: dash(attr.source),
      grade: gradeLabel(gradeForSource(attr.source)),
      relevance: dash(attr.detail || attr.source),
    }))
  }

  // --- Build distributor MPN source stats from resolvedRadicalTree ---
  const resolvedTree = state.resolvedRadicalTree
  const rMeta = resolvedTree?.resolution_meta?.stats
  const distributorSources: Array<{ label: string; count: number; pct: string }> = []
  if (rMeta) {
    const total = rMeta.total_leaves || 1
    distributorSources.push({ label: 'Verified by Distributor (MPN)', count: rMeta.verified_by_distributor, pct: ((rMeta.verified_by_distributor / total) * 100).toFixed(0) })
    distributorSources.push({ label: 'Vendor Catalog Reference', count: rMeta.from_vendor_catalog, pct: ((rMeta.from_vendor_catalog / total) * 100).toFixed(0) })
    distributorSources.push({ label: 'LLM Estimate (Grade D)', count: (rMeta.from_llm_estimate ?? 0) + (rMeta.grade_d ?? 0), pct: ((((rMeta.from_llm_estimate ?? 0) + (rMeta.grade_d ?? 0)) / total) * 100).toFixed(0) })
    distributorSources.push({ label: 'Stub / Data Gap', count: (rMeta.stub ?? 0) + (rMeta.data_gap ?? 0), pct: ((((rMeta.stub ?? 0) + (rMeta.data_gap ?? 0)) / total) * 100).toFixed(0) })
  }

  // --- Research summary claims requiring verification ---
  const claimsRequiringVerification = (state.research as any)?.synthesis?.claims_requiring_verification ?? []

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Sources and References`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Sources and References
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

      {/* Source grade key */}
      <Text style={{ fontSize: 8, color: MUTED, marginBottom: 12, fontFamily: 'Helvetica-Oblique' }}>
        Grade key: A = primary test data · B = engineering analysis · C = published industry reports · D = expert estimate · E = LLM hypothesis
      </Text>

      {/* Research Sources table */}
      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
        Research Sources
      </Text>
      {sourceRows.length > 0 ? (
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 14 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
            <Text style={{ width: '36%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 7, paddingHorizontal: 7 }}>Source / Title</Text>
            <Text style={{ width: '18%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 7, paddingHorizontal: 7 }}>Type</Text>
            <Text style={{ width: '14%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 7, paddingHorizontal: 7 }}>Grade</Text>
            <Text style={{ width: '32%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 7, paddingHorizontal: 7 }}>Relevance</Text>
          </View>
          {sourceRows.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === sourceRows.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
              <Text style={{ width: '36%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 5, paddingHorizontal: 7 }}>{row.title}</Text>
              <Text style={{ width: '18%', fontSize: 8, color: INK, paddingVertical: 5, paddingHorizontal: 7 }}>{row.type}</Text>
              <Text style={{ width: '14%', fontSize: 8, color: MUTED, paddingVertical: 5, paddingHorizontal: 7 }}>{row.grade.split(' — ')[0]}</Text>
              <Text style={{ width: '32%', fontSize: 8, color: INK, paddingVertical: 5, paddingHorizontal: 7, lineHeight: 1.3 }}>{row.relevance}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14 }}>
          No explicit research sources recorded — refer to pipeline stage attributions below.
        </Text>
      )}

      {/* Distributor and vendor data sources (from resolved tree) */}
      {distributorSources.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            BOM Data Sources
          </Text>
          <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8 }}>
            Sourcing breakdown for {rMeta?.total_leaves ?? 0} BOM leaf nodes:
          </Text>
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 14 }}>
            {distributorSources.map((src, i) => (
              <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === distributorSources.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER }} wrap={false}>
                <Text style={{ width: '60%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 5, paddingHorizontal: 8 }}>{src.label}</Text>
                <Text style={{ width: '15%', fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8, textAlign: 'right' }}>{src.count}</Text>
                <Text style={{ width: '25%', fontSize: 9, color: MUTED, paddingVertical: 5, paddingHorizontal: 8 }}>{src.pct}% of BOM</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Claims requiring verification */}
      {claimsRequiringVerification.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_AMBER, marginBottom: 8 }}>
            Claims Requiring Independent Verification
          </Text>
          {claimsRequiringVerification.slice(0, 6).map((claim: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 6 }} wrap={false}>
              <Text style={{ fontSize: 9, color: BESS_AMBER, fontFamily: 'Helvetica-Bold', width: 16 }}>►</Text>
              <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, flex: 1 }}>{claim}</Text>
            </View>
          ))}
        </>
      )}

      <DocPageFooter />
    </Page>
  )
}

// Grammar Verdicts detail page — all WARN and BLOCK verdicts
// Always renders: placeholder when grammarVerdicts absent (eliminates §8 silent-drop, council be8de574)
const GrammarVerdictsPage = ({ state }: { state: PipelineState }) => {
  const grammarVerdicts = state.grammarVerdicts
  if (!grammarVerdicts) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${dash(state.projectId)} | Forge Engineering Report (Radical v1) | Design Rule Check`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Design Rule Check (DRC) Verdicts
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 10, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Grammar verdicts pending — run pipeline stage 4d (radical-grammar) to generate DRC results.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const nonPassVerdicts = grammarVerdicts.verdicts.filter(v => v.verdict !== 'PASS')
  const passVerdicts = grammarVerdicts.verdicts.filter(v => v.verdict === 'PASS')

  const verdictColour = (verdict: string) =>
    verdict === 'BLOCK' ? BESS_RED : verdict === 'WARN' ? BESS_AMBER : BESS_GREEN

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${dash(state.projectId)} | Forge Engineering Report (Radical v1) | Design Rule Check`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Design Rule Check (DRC) Verdicts
      </Text>
      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 14 }}>
        Overall: {grammarVerdicts.overall_verdict} — {grammarVerdicts.rules_fired} rules fired, computed {grammarVerdicts.computed_at}
      </Text>

      {/* WARN and BLOCK verdicts */}
      {nonPassVerdicts.length > 0 ? (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            Issues Requiring Attention ({nonPassVerdicts.length})
          </Text>
          {nonPassVerdicts.map((verdict, i) => {
            const colour = verdictColour(verdict.verdict)
            return (
              <View key={i} style={{ borderWidth: 1, borderColor: colour, padding: 10, marginBottom: 10 }} wrap={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: colour }}>
                    {verdict.verdict} — {verdict.rule_id}
                  </Text>
                  <Text style={{ fontSize: 8, color: MUTED }}>
                    {verdict.hardness} · weight={verdict.weight === Infinity ? '∞' : verdict.weight}
                    {verdict.relaxed ? ' [relaxed]' : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, marginBottom: 4 }}>
                  {verdict.reason}
                </Text>
                {verdict.affected_nodes.length > 0 && (
                  <Text style={{ fontSize: 8, color: MUTED }}>
                    Affected nodes: {verdict.affected_nodes.join(', ')}
                  </Text>
                )}
                {verdict.tradeoff_disclosure && (
                  <Text style={{ fontSize: 8, color: BESS_AMBER, marginTop: 4, fontFamily: 'Helvetica-Oblique' }}>
                    {verdict.tradeoff_disclosure}
                  </Text>
                )}
              </View>
            )
          })}
        </>
      ) : (
        <Text style={{ fontSize: 10, color: BESS_GREEN, fontFamily: 'Helvetica-Bold', marginBottom: 14 }}>
          All grammar rules PASS — no issues to report.
        </Text>
      )}

      {/* PASS rules summary */}
      {passVerdicts.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_GREEN, marginBottom: 8, marginTop: 16 }}>
            Rules Passed ({passVerdicts.length})
          </Text>
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER }}>
            {passVerdicts.map((verdict, i) => (
              <View key={i} style={{
                flexDirection: 'row',
                borderBottomWidth: i === passVerdicts.length - 1 ? 0 : 0.5,
                borderBottomColor: TABLE_BORDER,
                paddingVertical: 5,
                paddingHorizontal: 8,
              }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_GREEN, width: '30%' }}>
                  {verdict.rule_id}
                </Text>
                <Text style={{ fontSize: 9, color: MUTED, flex: 1 }}>
                  {verdict.reason.slice(0, 120)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// §E — Technical Appendix Page
// Full appendix: BOM table (all leaves), resolved tree outline, grammar rule
// definitions (6 v1 rules), and glossary of Radical/character archetypes used.
// Always renders — sections show "no data" when underlying data absent.
// No new LLM call — pure synthesis from state.
// ---------------------------------------------------------------------------

// Grammar rule definitions — the 6 v1 rules with engineering descriptions
const GRAMMAR_RULE_DEFINITIONS = [
  {
    id: 'KCL_node_balance',
    category: 'Safety (weight: ∞)',
    description: 'Kirchhoff Current Law node balance — checks that all electrical current entering a node equals current leaving. Violation is a fundamental design error; no relaxation permitted.',
  },
  {
    id: 'galvanic_aluminium_copper_contact',
    category: 'Safety (weight: ∞)',
    description: 'Galvanic corrosion check — flags direct contact between aluminium and copper nodes without an isolating barrier. In wet environments (marine, outdoor, BESS enclosures), galvanic coupling accelerates structural failure.',
  },
  {
    id: 'mass_balance_closed_loop',
    category: 'Safety (weight: ∞)',
    description: 'Mass balance in closed-loop fluid systems — verifies that fluid mass entering a loop equals mass exiting. Violated by missing return paths, phantom sinks, or unmodelled accumulation.',
  },
  {
    id: 'voltage_derate_80pct',
    category: 'Efficiency (adjustable)',
    description: '80% voltage derating rule — all electrical components must be rated for at least 125% of their operating voltage (i.e. operated at ≤80% of rating). Relaxable at higher temperature derating.',
  },
  {
    id: 'thermal_capacity_vs_load',
    category: 'Efficiency (adjustable)',
    description: 'Thermal capacity vs load — verifies that thermal management capacity (heat sink, liquid cooling) is ≥110% of worst-case heat dissipation. Flags under-specified cooling.',
  },
  {
    id: 'material_marine_corrosion',
    category: 'Cost / Material (adjustable)',
    description: 'Marine corrosion material check — for AUV, offshore, and coastal products, flags uncoated ferrous nodes without corrosion protection. Lower weight; relaxable with surface treatment evidence.',
  },
]

// Glossary terms for the Radical language
const RADICAL_GLOSSARY = [
  { term: 'Radical', definition: 'The indivisible atomic unit of a hardware system — a single part, component, or material with a known archetype ID. Radicals are the leaves of the composition tree.' },
  { term: 'Character', definition: 'One level above radicals — a group of radicals that form a functional unit (e.g. a motor driver PCB). Characters carry the grammar rule targets.' },
  { term: 'Word', definition: 'A group of characters forming a subsystem component (e.g. a battery module). Words are cost-rolled up with a word-level assembly markup.' },
  { term: 'Sentence', definition: 'A group of words forming a major system subsystem (e.g. energy storage bank). Sentences are the top-level groupings in the composition tree.' },
  { term: 'Paragraph', definition: 'The entire product — the root of the composition tree. The paragraph total is the Radical BOM total.' },
  { term: 'Grammar Rule', definition: 'An engineering constraint checked deterministically against the composition tree. Rules fire against specific node pairs or node properties.' },
  { term: 'Verdict', definition: 'The result of a grammar rule check: PASS, WARN, or BLOCK. BLOCK rules with weight ∞ cannot be relaxed.' },
  { term: 'Resolution', definition: 'The process of annotating each leaf node with real-world sourcing data: MPN, manufacturer, unit price, lead time, and verification grade.' },
  { term: 'Verification Grade', definition: 'Confidence in the price/sourcing data: verified (distributor API), estimated (vendor catalog or LLM), grade_d (industry table), stub (no data).' },
  { term: 'Archetype ID', definition: 'The unique identifier for a radical in the seed library, e.g. lfp_prismatic_cell_280ah. Archetypes standardise naming across product classes.' },
]

const TechnicalAppendixPage = ({ state }: { state: PipelineState }) => {
  const projectId = dash(state.projectId)
  const resolvedTree = state.resolvedRadicalTree
  const grammarVerdicts = state.grammarVerdicts

  // Collect all leaves for the full BOM table
  const allLeaves: Array<{
    archetypeId: string
    subsystem: string
    qty: number
    unitPriceGbp: number | null
    lineTotal: number
    verificationGrade: string
    source: string
    mpn: string | null
    manufacturer: string | null
    leadWeeks: number | null
  }> = []

  if (resolvedTree) {
    function walkAppendix(
      node: import('./4b-radical-resolution').ResolvedCompositionNode,
      subsystem: string,
    ): void {
      if (!node.children || node.children.length === 0) {
        const res = node.resolution
        const unitPrice = res?.unit_price_gbp ?? null
        const qty = res?.qty ?? node.quantity ?? 1
        const lineTotal = unitPrice !== null ? unitPrice * qty : 0
        allLeaves.push({
          archetypeId: node.archetypeId,
          subsystem,
          qty,
          unitPriceGbp: unitPrice,
          lineTotal,
          verificationGrade: res?.verification_grade ?? 'data_gap',
          source: res?.source ?? 'stub',
          mpn: res?.mpn ?? null,
          manufacturer: res?.manufacturer ?? null,
          leadWeeks: res?.lead_weeks ?? null,
        })
      } else {
        // Use the top-level child's archetypeId as the subsystem label
        for (const child of node.children) {
          walkAppendix(child, subsystem || child.archetypeId)
        }
      }
    }

    const root = resolvedTree.composition.root
    if (root.children && root.children.length > 0) {
      for (const topChild of root.children) {
        walkAppendix(topChild, topChild.archetypeId)
      }
    } else {
      walkAppendix(root, root.archetypeId)
    }
  }

  // Tree outline — one line per top-level sentence with child count
  const treeOutline: Array<{ sentenceId: string; wordCount: number; leafCount: number; total: number }> = []
  if (resolvedTree) {
    const root = resolvedTree.composition.root
    const sentences = root.children?.length ? root.children : [root]
    for (const sentence of sentences) {
      const wordCount = sentence.children?.length ?? 0
      // Count leaves
      let leafCount = 0
      function countLeaves(n: import('./4b-radical-resolution').ResolvedCompositionNode): void {
        if (!n.children || n.children.length === 0) { leafCount++; return }
        for (const c of n.children) countLeaves(c)
      }
      countLeaves(sentence)
      const sentenceTotal = allLeaves
        .filter(l => l.subsystem === sentence.archetypeId)
        .reduce((s, l) => s + l.lineTotal, 0)
      treeOutline.push({ sentenceId: sentence.archetypeId, wordCount, leafCount, total: sentenceTotal })
    }
  }

  return (
    <>
      {/* Appendix A — Full BOM Table */}
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | Appendix A — Full BOM`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Appendix A — Full Bill of Materials
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 12 }} />

        {allLeaves.length === 0 ? (
          <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
            BOM data unavailable — run Phase 2 (RADICAL_PHASE_2_RESOLUTION=true) to populate.
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 8, color: MUTED, marginBottom: 8 }}>
              {allLeaves.length} parts across all subsystems. Prices in GBP.
            </Text>
            <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
                <Text style={{ width: '28%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>Part / Archetype</Text>
                <Text style={{ width: '16%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>Subsystem</Text>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>MPN</Text>
                <Text style={{ width: '6%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Qty</Text>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Unit £</Text>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Total £</Text>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Lead</Text>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>Source</Text>
              </View>
              {allLeaves.map((leaf, i) => {
                const gradeColour = leaf.verificationGrade === 'verified' ? BESS_GREEN
                  : leaf.verificationGrade === 'estimated' || leaf.verificationGrade === 'grade_d' ? BESS_AMBER
                  : BESS_RED
                return (
                  <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === allLeaves.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
                    <Text style={{ width: '28%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 5, fontFamily: 'Helvetica-Bold' }}>
                      {leaf.archetypeId.replace(/_/g, ' ')}
                    </Text>
                    <Text style={{ width: '16%', fontSize: 7, color: MUTED, paddingVertical: 4, paddingHorizontal: 5 }}>
                      {leaf.subsystem.replace(/_/g, ' ')}
                    </Text>
                    <Text style={{ width: '10%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 5 }}>
                      {dash(leaf.mpn)}
                    </Text>
                    <Text style={{ width: '6%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' }}>
                      {leaf.qty}
                    </Text>
                    <Text style={{ width: '10%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' }}>
                      {leaf.unitPriceGbp !== null ? fmtGbp(leaf.unitPriceGbp) : 'TBD'}
                    </Text>
                    <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: leaf.lineTotal > 0 ? INK : MUTED, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' }}>
                      {leaf.lineTotal > 0 ? fmtGbp(leaf.lineTotal) : 'TBD'}
                    </Text>
                    <Text style={{ width: '10%', fontSize: 7, color: MUTED, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' }}>
                      {leaf.leadWeeks != null ? `${leaf.leadWeeks}w` : '—'}
                    </Text>
                    <Text style={{ width: '10%', fontSize: 7, color: gradeColour, paddingVertical: 4, paddingHorizontal: 5 }}>
                      {leaf.source}
                    </Text>
                  </View>
                )
              })}
            </View>
          </>
        )}
        <DocPageFooter />
      </Page>

      {/* Appendix B — Resolved Tree Outline */}
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | Appendix B — Tree Outline`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Appendix B — Resolved Tree Outline
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 12 }} />

        {treeOutline.length === 0 ? (
          <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
            Tree data unavailable — run Phase 2 to populate.
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 9, color: MUTED, marginBottom: 12 }}>
              Structured outline of the Radical composition tree. Paragraph → Sentences → Words → Characters → Leaves.
            </Text>
            <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
                <Text style={{ width: '46%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8 }}>Sentence (Subsystem)</Text>
                <Text style={{ width: '18%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'right' }}>Words</Text>
                <Text style={{ width: '18%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'right' }}>Leaves</Text>
                <Text style={{ width: '18%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'right' }}>BOM Total</Text>
              </View>
              {treeOutline.map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === treeOutline.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
                  <Text style={{ width: '46%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, paddingVertical: 5, paddingHorizontal: 8 }}>
                    {row.sentenceId.replace(/_/g, ' ')}
                  </Text>
                  <Text style={{ width: '18%', fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8, textAlign: 'right' }}>{row.wordCount}</Text>
                  <Text style={{ width: '18%', fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8, textAlign: 'right' }}>{row.leafCount}</Text>
                  <Text style={{ width: '18%', fontSize: 9, color: BESS_TEAL, fontFamily: 'Helvetica-Bold', paddingVertical: 5, paddingHorizontal: 8, textAlign: 'right' }}>
                    {row.total > 0 ? fmtGbp(row.total) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Appendix C — Grammar Rule Definitions */}
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8, marginTop: 16 }}>
          Appendix C — Grammar Rule Definitions
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 12 }} />
        <Text style={{ fontSize: 9, color: MUTED, marginBottom: 12 }}>
          The 6 v1 Design Rule Check (DRC) rules applied to every Radical composition. Safety rules (weight ∞) cannot be relaxed.
        </Text>
        {GRAMMAR_RULE_DEFINITIONS.map((rule, i) => (
          <View key={i} style={{ marginBottom: 10, borderLeftWidth: 3, borderLeftColor: rule.category.includes('Safety') ? BESS_RED : rule.category.includes('Efficiency') ? BESS_AMBER : BESS_TEAL, paddingLeft: 10 }} wrap={false}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 2 }}>
              {rule.id}
            </Text>
            <Text style={{ fontSize: 8, color: rule.category.includes('Safety') ? BESS_RED : rule.category.includes('Efficiency') ? BESS_AMBER : BESS_TEAL, marginBottom: 4 }}>
              {rule.category}
            </Text>
            <Text style={{ fontSize: 8, color: INK, lineHeight: 1.4 }}>
              {rule.description}
            </Text>
          </View>
        ))}

        {/* Grammar results for this document */}
        {grammarVerdicts && (
          <View style={{ marginTop: 12, borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 8 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 4 }}>
              DRC Results for This Document
            </Text>
            <Text style={{ fontSize: 9, color: INK }}>
              Overall: {grammarVerdicts.overall_verdict} — {grammarVerdicts.pass_count} PASS · {grammarVerdicts.warn_count} WARN · {grammarVerdicts.block_count} BLOCK · {grammarVerdicts.rules_fired} rules fired
            </Text>
          </View>
        )}

        <DocPageFooter />
      </Page>

      {/* Appendix D — Glossary */}
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | Appendix D — Glossary`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Appendix D — Glossary
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 12 }} />
        <Text style={{ fontSize: 9, color: MUTED, marginBottom: 12 }}>
          Terminology used throughout this report. Radical language terms describe the hierarchical composition model.
        </Text>
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER }}>
          {RADICAL_GLOSSARY.map((entry, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === RADICAL_GLOSSARY.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
              <Text style={{ width: '28%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, paddingVertical: 6, paddingHorizontal: 8 }}>
                {entry.term}
              </Text>
              <Text style={{ width: '72%', fontSize: 8, color: INK, paddingVertical: 6, paddingHorizontal: 8, lineHeight: 1.4 }}>
                {entry.definition}
              </Text>
            </View>
          ))}
        </View>
        <DocPageFooter />
      </Page>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main export — full Radical PDF document
// ---------------------------------------------------------------------------

export default function PdfRendererV3Radical({ state }: { state: PipelineState }) {
  const safe = normaliseState(state) as PipelineState

  const resolvedTree = safe.resolvedRadicalTree
  const radicalCostSummary = safe.radicalCostSummary
  const grammarVerdicts = safe.grammarVerdicts
  const projectId = dash(safe.projectId)

  // If Phase 2 hasn't run, produce a placeholder document
  if (!resolvedTree) {
    return (
      <Document title={`Radical Shadow PDF — ${projectId} (Phase 2 not run)`}>
        <Page size="A4" style={pageStyle}>
          <DocPageHeader title={`${projectId} | Radical v1 Shadow PDF — Incomplete`} />
          <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: BESS_AMBER, marginBottom: 12 }}>
            Radical Phase 5 — Renderer Not Ready
          </Text>
          <Text style={{ fontSize: 10, color: MUTED }}>
            RADICAL_PHASE_5_RENDER=true but resolvedRadicalTree is absent.{'\n'}
            Enable RADICAL_PHASE_2_RESOLUTION=true and re-run.
          </Text>
          <DocPageFooter />
        </Page>
      </Document>
    )
  }

  return (
    <Document
      title={`Radical Shadow PDF — ${projectId}`}
      author="Fractional Forge PDF Engine v3 — Radical v1 (Phase 5)"
    >
      {/* §1 Cover */}
      <RadicalCoverPage state={safe} />

      {/* §2 Executive Summary — P3 fix: 3-paragraph narrative (no new LLM call) */}
      <ExecutiveSummaryPage state={safe} />

      {/* §3 Brief and Requirements — §C fix: structured 2-column KV with class-aware regulatory flags */}
      <BriefRequirementsPage state={safe} />

      {/* §4 System Modules and Architecture — Radical tree view */}
      <RadicalModulesSection
        resolvedTree={resolvedTree}
        radicalCostSummary={radicalCostSummary}
        projectId={projectId}
      />

      {/* §4 Bill of Materials — sentence-grouped, grammar verdicts inline */}
      <RadicalBomSection
        resolvedTree={resolvedTree}
        radicalCostSummary={radicalCostSummary}
        grammarVerdicts={grammarVerdicts}
        projectId={projectId}
      />

      {/* §6 Sourcing Strategy — §D fix: aggregates resolved tree by distributor + lead time + risk */}
      <SourcingStrategyPage state={safe} />

      {/* §7 Cost Waterfall — from radicalCostSummary */}
      <RadicalCostSection
        radicalCostSummary={radicalCostSummary}
        fallbackCostSummary={safe.costSummary}
        projectId={projectId}
      />

      {/* §6 Feasibility Assessment — P2 fix: 4-field structured section (no new LLM call) */}
      <FeasibilityAssessmentPage state={safe} />

      {/* §7 Sources and References — Fix A: restore section missing from P1+P2+P3 bundle */}
      <SourcesReferencesPage state={safe} />

      {/* §9 Design Rule Check detail page — always rendered; component shows placeholder when data absent */}
      <GrammarVerdictsPage state={safe} />

      {/* §10 Technical Appendix — §E fix: full BOM table, tree dump, grammar defs, glossary */}
      <TechnicalAppendixPage state={safe} />
    </Document>
  )
}
