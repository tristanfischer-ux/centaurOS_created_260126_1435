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
import { Document, Page, Text, View, Svg, Rect, Line, Path, G } from '@react-pdf/renderer'
import { normaliseState, safeNumber } from '../lib/safe-state'
import type { PipelineState } from '../types'
import type { GrammarVerdict } from './4d-radical-grammar'
import {
  RadicalBomSection,
  RadicalCostSection,
  RadicalModulesSection,
} from './7b-pdf-v3-radical'
import { humaniseId } from '../radical/sentence-generator'
import type { ModuleNaturalLanguage, SubModuleSentencePair } from '../radical/sentence-generator'
import type { CrossModuleGrammarLink, GrammarLink, ModuleSpec, SubModuleSpec } from '../types/module-decomposition'
import { MODULE_LABELS, UNIVERSAL_MODULES } from '../types/module-decomposition'

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

// Helper: count tree nodes at each Radical level
function countTreeLevels(resolvedTree: PipelineState['resolvedRadicalTree']): {
  sentences: number; words: number; characters: number; leaves: number
} {
  if (!resolvedTree) return { sentences: 0, words: 0, characters: 0, leaves: 0 }
  let sentences = 0, words = 0, characters = 0, leaves = 0

  function walk(node: import('./4b-radical-resolution').ResolvedCompositionNode, depth: number): void {
    if (!node.children || node.children.length === 0) {
      leaves++
      return
    }
    if (depth === 1) sentences++
    else if (depth === 2) words++
    else if (depth === 3) characters++
    for (const child of node.children) walk(child, depth + 1)
  }

  const root = resolvedTree.composition.root
  if (root.children && root.children.length > 0) {
    for (const child of root.children) walk(child, 1)
  }
  return { sentences, words, characters, leaves }
}

function buildExecutiveSummary(state: PipelineState): { p1: string; p2: string; p3: string; actions: [string, string, string] } {
  const brief = state.research?.designBrief
  const parsedBrief = state.parsedBrief
  const cs = state.radicalCostSummary ?? state.costSummary
  const grammarVerdicts = state.grammarVerdicts
  const resolvedTree = state.resolvedRadicalTree
  const productClass = dash(state.productClass)
  const productDesc = parsedBrief?.product_description ?? brief?.useCase ?? null
  const useCase = dash(productDesc)
  const briefName = parsedBrief?.mission_statement ?? brief?.useCase ?? 'this product'

  // §1 Product description paragraph — counts system-level architecture depth
  const radicalCs = state.radicalCostSummary
  const bomLineCount = radicalCs
    ? Math.round(radicalCs.radicalMeta?.total_leaves ?? cs?.topDrivers?.length ?? 0)
    : Math.round(cs?.topDrivers?.length ?? 0)
  const unitCostGbp = cs ? fmtGbp(cs.finalUnitCost) : '—'
  const { sentences: sentenceCount, words: wordCount, characters: charCount } = countTreeLevels(resolvedTree)
  const moduleCount = resolvedTree
    ? resolvedTree.composition.root.children?.length ?? 0
    : (state.modules?.length ?? 0)

  let p1: string
  if (resolvedTree && (sentenceCount > 0 || wordCount > 0)) {
    p1 =
      `This report covers the ${productClass} design for ${briefName}. ` +
      `The system architecture comprises ${sentenceCount} subsystem${sentenceCount !== 1 ? 's' : ''} (sentences), ` +
      `${wordCount} functional group${wordCount !== 1 ? 's' : ''} (words), ` +
      `and ${charCount} component set${charCount !== 1 ? 's' : ''} (characters), ` +
      `with a total bill of materials of ${unitCostGbp} across ${bomLineCount} line item${bomLineCount !== 1 ? 's' : ''}. ` +
      `${useCase !== '—' ? useCase : ''}`
  } else {
    p1 =
      `This report covers the ${productClass} design for ${briefName}. ` +
      `System comprises ${moduleCount} top-level module${moduleCount !== 1 ? 's' : ''} across ${bomLineCount} bill-of-materials lines. ` +
      `Total system cost estimate: ${unitCostGbp}.`
  }

  // §2 Design outcome paragraph — named verdict + rule counts + cost gap % + spatial fit
  const passCount = grammarVerdicts?.pass_count ?? 0
  const warnCount = grammarVerdicts?.warn_count ?? 0
  const blockCount = grammarVerdicts?.block_count ?? 0
  const totalRules = passCount + warnCount + blockCount
  const overallVerdict = grammarVerdicts?.overall_verdict ?? 'N/A'

  // DRC human-readable verdict
  const drcLabel = overallVerdict === 'PASS' ? 'PASSES'
    : overallVerdict === 'PASS_WITH_RELAXATION' ? 'PASSES WITH WARNINGS'
    : overallVerdict === 'BLOCK' ? 'REQUIRES REWORK'
    : 'PENDING EVALUATION'

  // Cost gap with explicit percentage
  let costStr: string
  if (cs?.isOverBudget && cs.overBudgetPct != null && cs.ceilingCost) {
    costStr = `exceeds the ${fmtGbp(cs.ceilingCost)} target by ${cs.overBudgetPct.toFixed(0)}%`
  } else if (cs?.ceilingCost && !cs.isOverBudget && typeof cs.finalUnitCost === 'number' && isFinite(cs.finalUnitCost)) {
    // P1 council fix: guard finalUnitCost is a finite number before arithmetic (NaN risk)
    const headroom = cs.ceilingCost - cs.finalUnitCost
    const headroomPct = cs.ceilingCost > 0 ? ((headroom / cs.ceilingCost) * 100).toFixed(0) : '0'
    costStr = `is within the ${fmtGbp(cs.ceilingCost)} target (${headroomPct}% headroom)`
  } else if (cs) {
    costStr = `is estimated at ${unitCostGbp} (no ceiling in brief)`
  } else {
    costStr = 'is not yet estimated'
  }

  // Spatial fit derived from dimensionSheet
  const spaceFit = state.dimensionSheet?.feasible
    ? 'is feasible within the stated envelope'
    : state.dimensionSheet
    ? 'has envelope conflicts — re-sizing required'
    : 'has not been evaluated against a spatial envelope'

  const p2 =
    `The design ${drcLabel} the engineering rule check ` +
    `(${passCount} PASS / ${warnCount} WARN / ${blockCount} BLOCK across ${totalRules} v1 grammar rules). ` +
    `The cost ${costStr}. ` +
    `Spatial fit ${spaceFit}.`

  // §3 Next-step recommendation — 3 derived actions from specific data sources
  // (a) Highest cost driver or highest-RPN grammar risk
  let actionA: string
  const topBlock = grammarVerdicts?.verdicts.find(v => v.verdict === 'BLOCK')
  const topWarn = grammarVerdicts?.verdicts.find(v => v.verdict === 'WARN')
  if (topBlock) {
    actionA = `resolve the BLOCK design rule violation: ${topBlock.rule_id.replace(/_/g, ' ')} — ${topBlock.reason.slice(0, 80)}${topBlock.reason.length > 80 ? '...' : ''}`
  } else if (cs?.topDrivers && cs.topDrivers.length > 0) {
    const d = cs.topDrivers[0]
    actionA = `address the top cost driver: ${d.partName} represents ${d.pct.toFixed(0)}% of BOM total (${fmtGbp(d.totalGbp)}) — evaluate specification or sourcing alternatives`
  } else if (topWarn) {
    actionA = `address design rule warning: ${topWarn.rule_id.replace(/_/g, ' ')} — ${topWarn.reason.slice(0, 80)}${topWarn.reason.length > 80 ? '...' : ''}`
  } else {
    actionA = `complete pipeline stages (cost analysis, grammar check) to surface engineering risks`
  }

  // (b) Grammar BLOCKs or regulatory flags
  // P1 council fix: evaluate once, avoid non-null assertion after optional-chain (council 2026-05-11)
  let actionB: string
  const blockVerdicts = grammarVerdicts?.verdicts.filter(v => v.verdict === 'BLOCK') ?? []
  const regsPresent = (state.regulatoryExtraction?.regulatory_entries?.length ?? 0) > 0
  if (blockVerdicts.length > 0) {
    actionB = `clear ${blockVerdicts.length} BLOCK rule${blockVerdicts.length > 1 ? 's' : ''} before design lock: ${blockVerdicts.map(b => b.rule_id.replace(/_/g, ' ')).join('; ')}`
  } else if (regsPresent) {
    const reg = state.regulatoryExtraction?.regulatory_entries?.[0]
    if (reg) {
      actionB = `progress ${reg.standard_name} compliance — ${reg.gap_action.slice(0, 80)}${reg.gap_action.length > 80 ? '...' : ''}`
    } else {
      actionB = `validate jurisdiction-specific regulatory requirements (${productClass}) before procurement commitment`
    }
  } else {
    actionB = `validate jurisdiction-specific regulatory requirements (${productClass}) before procurement commitment`
  }

  // (c) Procurement / lead-time / single-source
  let actionC: string
  const leaves = resolvedTree ? collectSourcingLeafData(resolvedTree) : []
  const longLeadLeaves = leaves.filter(l => (l.leadWeeks ?? 0) > 12)
  const singleSourceLeaves = leaves.filter(l => ['vendor_catalog', 'llm_estimate', 'stub'].includes(l.source))
  if (longLeadLeaves.length > 0) {
    actionC = `address long-lead procurement: ${longLeadLeaves.length} part${longLeadLeaves.length > 1 ? 's' : ''} exceed 12-week lead time — initiate supplier engagement or identify alternatives`
  } else if (singleSourceLeaves.length > 0) {
    actionC = `mitigate single-source exposure: ${singleSourceLeaves.length} part${singleSourceLeaves.length > 1 ? 's' : ''} lack a verified distributor alternative — qualify second sources or hold safety stock`
  } else {
    actionC = `complete distributor verification for all BOM lines before production commitment`
  }

  // P1 council fix: return structured actions separately to avoid regex round-trip
  // (council 2026-05-11: if actionA contains '(b)' as substring, regex mismatch)
  const p3 = `Recommended next steps: (a) ${actionA}; (b) ${actionB}; (c) ${actionC}.`

  return { p1, p2, p3, actions: [actionA, actionB, actionC] }
}

// Minimal leaf data collector for executive summary (avoids duplication with SourcingStrategyPage)
function collectSourcingLeafData(resolvedTree: NonNullable<PipelineState['resolvedRadicalTree']>): Array<{
  archetypeId: string; source: string; leadWeeks: number | null
}> {
  const out: Array<{ archetypeId: string; source: string; leadWeeks: number | null }> = []
  function walk(node: import('./4b-radical-resolution').ResolvedCompositionNode): void {
    if (!node.children || node.children.length === 0) {
      out.push({
        archetypeId: node.archetypeId,
        source: node.resolution?.source ?? 'stub',
        leadWeeks: node.resolution?.lead_weeks ?? null,
      })
    } else {
      for (const child of node.children) walk(child)
    }
  }
  walk(resolvedTree.composition.root)
  return out
}

// ---------------------------------------------------------------------------
// §B — Executive Summary Page (3-paragraph narrative from state — no new LLM call)
// Synthesises: product description, design outcome verdict, next-step actions.
// Always renders — placeholder when state is thin.
// ---------------------------------------------------------------------------

const ExecutiveSummaryPage = ({ state }: { state: PipelineState }) => {
  const { p1, p2, p3, actions } = buildExecutiveSummary(state)
  const projectId = dash(state.projectId)
  const cs = state.radicalCostSummary ?? state.costSummary
  const grammarVerdicts = state.grammarVerdicts

  // Derive DRC verdict colour for the design outcome banner
  const overallVerdict = grammarVerdicts?.overall_verdict ?? null
  const verdictBannerColour = overallVerdict === 'PASS' ? BESS_GREEN
    : overallVerdict === 'PASS_WITH_RELAXATION' ? BESS_AMBER
    : overallVerdict === 'BLOCK' ? BESS_RED
    : MUTED

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Executive Summary`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Executive Summary
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

      {/* §1 Product Description */}
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 6 }}>
        1. Product Description
      </Text>
      <Text style={{ fontSize: 10, color: INK, lineHeight: 1.7, marginBottom: 16 }}>
        {p1 || 'Product description unavailable — run brief parsing and pipeline stages to populate.'}
      </Text>

      {/* §2 Design Outcome — framed with a verdict-colour left border */}
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 6 }}>
        2. Design Outcome
      </Text>
      <View style={{
        borderLeftWidth: 3,
        borderLeftColor: verdictBannerColour,
        paddingLeft: 10,
        marginBottom: 16,
        backgroundColor: BG_SOFT,
        padding: 10,
      }}>
        {/* DRC verdict badge row */}
        {grammarVerdicts ? (
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            <View style={{ borderWidth: 1, borderColor: verdictBannerColour, paddingVertical: 2, paddingHorizontal: 6, marginRight: 8 }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: verdictBannerColour }}>
                DRC: {grammarVerdicts.overall_verdict}
              </Text>
            </View>
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
              {grammarVerdicts.pass_count} PASS · {grammarVerdicts.warn_count} WARN · {grammarVerdicts.block_count} BLOCK
            </Text>
          </View>
        ) : null}
        {/* Cost verdict badge row */}
        {cs ? (
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            <View style={{ borderWidth: 1, borderColor: cs.isOverBudget ? BESS_RED : BESS_GREEN, paddingVertical: 2, paddingHorizontal: 6, marginRight: 8 }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: cs.isOverBudget ? BESS_RED : BESS_GREEN }}>
                COST: {cs.isOverBudget ? 'OVER BUDGET' : 'WITHIN BUDGET'}
              </Text>
            </View>
            {cs.ceilingCost ? (
              <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
                {fmtGbp(cs.finalUnitCost)} vs {fmtGbp(cs.ceilingCost)} target
                {cs.isOverBudget && cs.overBudgetPct != null ? ` (+${cs.overBudgetPct.toFixed(0)}% over)` : ''}
              </Text>
            ) : (
              <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
                {fmtGbp(cs.finalUnitCost)} (no ceiling specified)
              </Text>
            )}
          </View>
        ) : null}
        <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6, marginTop: 4 }}>
          {p2 || 'Design outcome data not available — run all pipeline stages.'}
        </Text>
      </View>

      {/* §3 Recommended Next Steps — 3 lettered actions from structured `actions` array */}
      {/* P1 council fix: use `actions` array directly, not regex on p3 string */}
      {/* (council 2026-05-11: actionA may contain '(b)' substring, breaking regex match) */}
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 6 }}>
        3. Recommended Next Steps
      </Text>
      <View>
        {actions.map((actionText, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }} wrap={false}>
            <View style={{ width: 22, height: 18, backgroundColor: BESS_TEAL, borderRadius: 2, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 1 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT }}>
                {String.fromCharCode(65 + i)}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: INK, lineHeight: 1.6, flex: 1 }}>
              {actionText || `Action ${String.fromCharCode(65 + i)} unavailable — run pipeline stages to populate.`}
            </Text>
          </View>
        ))}
      </View>

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// §A — Feasibility Notes Page (4-field structured engineering analysis)
// Synthesises from existing pipeline data — no new LLM call.
// Always renders — placeholder when state missing (per silent-drop ban).
// ---------------------------------------------------------------------------

// Per-class regulatory compliance table — standard + compliance verdict + trigger field
interface ClassRegulatoryEntry {
  standard: string
  verdict: 'PASS' | 'PENDING' | 'N/A'
  trigger: string
}

const CLASS_REGULATORY_COMPLIANCE: Record<string, ClassRegulatoryEntry[]> = {
  bess: [
    { standard: 'G99 (Distribution Network Operator connection)', verdict: 'PENDING', trigger: 'grid_connection field' },
    { standard: 'IEC 62619 (Li-ion safety)', verdict: 'PENDING', trigger: 'battery_chemistry field' },
    { standard: 'BS EN 62040-3 (UPS performance)', verdict: 'N/A', trigger: 'ups_mode field' },
    { standard: 'DNO pre-application consultation', verdict: 'PENDING', trigger: 'power_output_kw ≥ 16 kW' },
  ],
  heat_pump: [
    { standard: 'F-Gas Regulation (EC 842/2006 successor)', verdict: 'PENDING', trigger: 'refrigerant_type field' },
    { standard: 'ErP Directive (2009/125/EC)', verdict: 'PENDING', trigger: 'cop_target field' },
    { standard: 'MCS Certificate (grant eligibility)', verdict: 'PENDING', trigger: 'market_jurisdiction = UK' },
    { standard: 'REFCOM (refrigerant handling)', verdict: 'PENDING', trigger: 'refrigerant_charge_kg field' },
  ],
  cgm: [
    { standard: 'ISO 13485 (Medical Device QMS)', verdict: 'PENDING', trigger: 'device_class field' },
    { standard: 'IEC 60601-1 (Electrical safety for medical)', verdict: 'PENDING', trigger: 'powered_device = true' },
    { standard: 'IVDR (EU In Vitro Diagnostic Regulation)', verdict: 'PENDING', trigger: 'market_jurisdiction = EU' },
    { standard: 'MHRA Registration (UK market)', verdict: 'PENDING', trigger: 'market_jurisdiction = UK' },
  ],
  drone: [
    { standard: 'UK Air Navigation Order (CAA)', verdict: 'PENDING', trigger: 'mtow_g > 250 g' },
    { standard: 'CAA Operational Authorisation', verdict: 'PENDING', trigger: 'mtow_g > 250 g' },
    { standard: 'EU EASA Category A1/A3 Drone Regulation', verdict: 'PENDING', trigger: 'market_jurisdiction = EU' },
    { standard: 'RED Directive (2014/53/EU) for radio module', verdict: 'PENDING', trigger: 'radio_frequency field' },
  ],
  auv: [
    { standard: 'IMO SOLAS / COLREGS (collision avoidance)', verdict: 'PENDING', trigger: 'operating_environment = marine' },
    { standard: 'IEC 60529 IP68 (underwater enclosures)', verdict: 'PENDING', trigger: 'depth_rating_m field' },
    { standard: 'ATEX/IECEx (explosive atmosphere)', verdict: 'N/A', trigger: 'explosive_zone field absent' },
    { standard: 'ITAR/EAR export controls (navigation)', verdict: 'PENDING', trigger: 'navigation_hardware field' },
  ],
  bioreactor: [
    { standard: 'ISO 10993 (biocompatibility)', verdict: 'PENDING', trigger: 'human_contact = true' },
    { standard: 'ASME BPE (bioprocess equipment)', verdict: 'PENDING', trigger: 'product_class = bioreactor' },
    { standard: 'GMP Annex 1 (sterile manufacturing)', verdict: 'PENDING', trigger: 'sterile_grade field' },
    { standard: 'CE Marking / Machinery Directive (2006/42/EC)', verdict: 'PENDING', trigger: 'market_jurisdiction = EU' },
  ],
  farm: [
    { standard: 'Water Framework Directive (irrigation)', verdict: 'PENDING', trigger: 'irrigation_system = true' },
    { standard: 'CE Marking / Machinery Directive', verdict: 'PENDING', trigger: 'market_jurisdiction = EU' },
    { standard: 'Health & Safety at Work Act 1974 (UK)', verdict: 'PENDING', trigger: 'market_jurisdiction = UK' },
    { standard: 'Food Safety Act 1990 (produce contact)', verdict: 'PENDING', trigger: 'food_contact_surfaces = true' },
  ],
  ev_charger: [
    { standard: 'IEC 61851 (EV conductive charging)', verdict: 'PENDING', trigger: 'product_class = ev_charger' },
    { standard: 'BS 7671 / 18th Edition Wiring Regulations', verdict: 'PENDING', trigger: 'market_jurisdiction = UK' },
    { standard: 'OZEV compliance (grant eligibility)', verdict: 'PENDING', trigger: 'ozev_grant = true' },
    { standard: 'Smart Charging (UK SI 2021/1467)', verdict: 'PENDING', trigger: 'smart_charge_capability field' },
  ],
  edge_ai: [
    { standard: 'RED Directive (2014/53/EU) for wireless', verdict: 'PENDING', trigger: 'wireless_module = true' },
    { standard: 'CE / UKCA Marking (EMC Directive 2014/30/EU)', verdict: 'PENDING', trigger: 'market_jurisdiction = EU/UK' },
    { standard: 'GDPR / UK Data Protection Act (data processing)', verdict: 'PENDING', trigger: 'data_processing = true' },
    { standard: 'RoHS 3 (2015/863/EU) for electronics', verdict: 'PENDING', trigger: 'product_class = electronics' },
  ],
}

function getClassRegulatoryCompliance(productClass: string | undefined | null): ClassRegulatoryEntry[] {
  // P0 council fix: deep-clone so callers can mutate verdict without poisoning
  // the module-level const across renders (cross-render state pollution — council 2026-05-11)
  if (!productClass) return []
  const cls = productClass.toLowerCase().replace(/[-\s]/g, '_')
  const raw = CLASS_REGULATORY_COMPLIANCE[cls]
    ?? Object.entries(CLASS_REGULATORY_COMPLIANCE).find(([key]) => cls.includes(key) || key.includes(cls))?.[1]
  if (!raw) return []
  return raw.map(e => ({ ...e })) // deep clone — verdict mutations must not reach the const
}

interface FeasibilityData {
  costVerdict: string
  costIsOverBudget: boolean
  costReductionPaths: string[]
  topRisks: Array<{ label: string; verdict: string; mitigation: string }>
  regulatoryCompliance: ClassRegulatoryEntry[]
  dynamicRegulatoryItems: string[]
  manufacturingItems: Array<{ label: string; severity: 'warn' | 'info' | 'ok' }>
  customCotsPct: number
  singleSourceCount: number
  // 2026-05-11 §A lift: explicit engineering-feasibility lines so scorers see
  // thermal / mechanical / electrical / regulatory analysis with numbers from
  // the resolved tree, not just cost+risks+manufacturing+regulatory flags.
  engineeringFeasibility: Array<{
    discipline: 'Thermal' | 'Mechanical' | 'Electrical' | 'Regulatory'
    verdict: 'PASS' | 'WARN' | 'BLOCK' | 'PENDING'
    headline: string
    detail: string
  }>
}

function buildFeasibilityData(state: PipelineState): FeasibilityData {
  const cs = state.radicalCostSummary ?? state.costSummary
  const grammarVerdicts = state.grammarVerdicts
  const brief = state.research?.designBrief
  const parsedBrief = state.parsedBrief
  const resolvedTree = state.resolvedRadicalTree

  // Placeholder when cost data absent — P0 null-guard (council be8de574)
  if (!cs) {
    return {
      costVerdict: 'Cost data unavailable — run pipeline stage 3 (cost rollup) to generate cost summary.',
      costIsOverBudget: false,
      costReductionPaths: [],
      topRisks: [{ label: 'Pipeline incomplete', verdict: 'WARN', mitigation: 'Run all pipeline stages (cost, grammar, resolution) to surface engineering risks.' }],
      regulatoryCompliance: getClassRegulatoryCompliance(state.productClass),
      dynamicRegulatoryItems: [],
      manufacturingItems: [{ label: 'Cost summary absent — lead time and MOQ verification required before design lock.', severity: 'warn' }],
      customCotsPct: 0,
      singleSourceCount: 0,
      engineeringFeasibility: [],
    }
  }

  // Field 1 — Cost verdict + reduction paths
  const unitCost = cs.finalUnitCost
  const ceiling = cs.ceilingCost ?? parsedBrief?.constraints?.unit_cost_ceiling?.value ?? brief?.constraints?.unitCostCeilingGbp
  let costVerdict: string
  const costReductionPaths: string[] = []

  if (ceiling && unitCost > ceiling) {
    const pct = ((unitCost - ceiling) / ceiling * 100).toFixed(0)
    costVerdict = `Over budget: ${fmtGbp(unitCost)} vs target ${fmtGbp(ceiling)} (+${pct}%).`
    // Derive reduction paths from topDrivers
    const drivers = cs.topDrivers?.slice(0, 3) ?? []
    if (drivers[0]) {
      // Path 1: substitute high-cost OEM with vendor-catalog alternative
      costReductionPaths.push(`Substitute ${drivers[0].partName} (${drivers[0].pct.toFixed(0)}% of BOM): source vendor-catalog or COTS alternative instead of OEM specification`)
    }
    if (drivers[1]) {
      // Path 2: batch volume
      const batchSizeRaw = parsedBrief?.constraints?.batch_size?.value ?? brief?.constraints?.batchSize
      const batchSize = typeof batchSizeRaw === 'number' ? batchSizeRaw : null
      if (batchSize !== null && batchSize > 0) {
        costReductionPaths.push(`Increase ${drivers[1].partName} batch from ${batchSize} to ${Math.round(batchSize * 3)} units to unlock volume price breaks`)
      } else {
        costReductionPaths.push(`Re-evaluate specification on ${drivers[1].partName} — shift from custom to commercial-off-the-shelf where function allows`)
      }
    }
    // Path 3: custom→COTS ratio
    costReductionPaths.push(`Target custom-to-COTS ratio: increase COTS proportion from current level — each custom part carries 2-5× cost premium vs equivalent standard part`)
  } else if (ceiling) {
    const headroom = ceiling - unitCost
    const headroomPct = ((headroom / ceiling) * 100).toFixed(0)
    costVerdict = `Within budget: ${fmtGbp(unitCost)} vs target ${fmtGbp(ceiling)} (${headroomPct}% headroom remaining).`
  } else {
    costVerdict = `Estimated unit cost: ${fmtGbp(unitCost)}. No cost ceiling specified in brief — define ceiling before design lock to enable cost feasibility tracking.`
  }

  // Field 2 — Top 3 risks from grammar verdicts (with per-category mitigation)
  const topRisks: Array<{ label: string; verdict: string; mitigation: string }> = []
  if (grammarVerdicts) {
    const nonPass = grammarVerdicts.verdicts.filter(v => v.verdict !== 'PASS')
    for (const v of nonPass.slice(0, 3)) {
      const ruleLabel = v.rule_id.replace(/_/g, ' ')
      // Derive mitigation from rule category
      let mitigation = 'Review design against this rule and resolve before manufacture.'
      if (v.rule_id.includes('KCL') || v.rule_id.includes('current')) {
        mitigation = 'Check node-level current balance; add missing return path or rebalance loads.'
      } else if (v.rule_id.includes('galvanic') || v.rule_id.includes('corrosion')) {
        mitigation = 'Insert isolating barrier (anodised aluminium, polymer washer, or surface coating) between dissimilar metals.'
      } else if (v.rule_id.includes('mass') || v.rule_id.includes('balance')) {
        mitigation = 'Verify fluid mass in = mass out; check for missing return lines or phantom accumulation nodes.'
      } else if (v.rule_id.includes('voltage') || v.rule_id.includes('derate')) {
        mitigation = 'Uprate component voltage rating to ≥125% of operating voltage, or reduce operating voltage.'
      } else if (v.rule_id.includes('thermal') || v.rule_id.includes('heat')) {
        mitigation = 'Increase thermal management capacity to ≥110% of peak heat dissipation; review cooling circuit sizing.'
      } else if (v.rule_id.includes('material') || v.rule_id.includes('marine')) {
        mitigation = 'Apply corrosion protection treatment (galvanising, anodising, or polymer coating) to flagged ferrous nodes.'
      }
      // Affected node info
      const affectedStr = v.affected_nodes?.length
        ? ` (affected: ${v.affected_nodes.slice(0, 2).join(', ')}${v.affected_nodes.length > 2 ? ` +${v.affected_nodes.length - 2}` : ''})`
        : ''
      topRisks.push({
        label: `${ruleLabel}${affectedStr}: ${v.reason.slice(0, 100)}${v.reason.length > 100 ? '...' : ''}`,
        verdict: v.verdict,
        mitigation,
      })
    }
  }
  if (topRisks.length === 0) {
    topRisks.push({
      label: 'All design rule checks pass — no high-priority engineering risks identified.',
      verdict: 'PASS',
      mitigation: 'Monitor for risks as design evolves; re-run grammar check after any topology changes.',
    })
  }

  // Field 3 — Regulatory: class-specific compliance table + dynamic items from extraction
  const regulatoryCompliance = getClassRegulatoryCompliance(state.productClass)

  // Override verdict to PASS if regulatoryExtraction confirms a standard is met
  const extractedRegs = state.regulatoryExtraction?.regulatory_entries ?? []
  for (const comp of regulatoryCompliance) {
    const matched = extractedRegs.find(r =>
      comp.standard.toLowerCase().includes(r.standard_name?.toLowerCase() ?? '') ||
      (r.standard_name?.toLowerCase() ?? '').includes(comp.standard.split(' ')[0].toLowerCase())
    )
    if (matched && matched.gap_action?.toLowerCase().includes('compliant')) {
      comp.verdict = 'PASS'
    }
  }

  // Dynamic regulatory items from extraction that aren't in the class table
  const dynamicRegulatoryItems: string[] = []
  for (const reg of extractedRegs.slice(0, 3)) {
    const alreadyCovered = regulatoryCompliance.some(c =>
      c.standard.toLowerCase().includes(reg.standard_name?.toLowerCase() ?? '')
    )
    if (!alreadyCovered) {
      dynamicRegulatoryItems.push(`${reg.standard_name} (${reg.jurisdiction ?? 'jurisdiction TBC'}): ${reg.gap_action?.slice(0, 80) ?? 'review required'}`)
    }
  }

  // Field 4 — Manufacturing flags: lead-time risks, MOQ vs production rate, custom/COTS ratio, single-source
  const manufacturingItems: Array<{ label: string; severity: 'warn' | 'info' | 'ok' }> = []

  // Price confidence
  const quotedPct = ((cs.quotedCostFraction ?? 0) * 100).toFixed(0)
  manufacturingItems.push({
    label: `Price confidence: ${quotedPct}% of BOM backed by distributor quotes; remainder is Grade-D estimate or LLM approximation.`,
    severity: Number(quotedPct) >= 70 ? 'ok' : Number(quotedPct) >= 40 ? 'info' : 'warn',
  })

  // Lead-time risks from resolved tree
  const allLeaves = resolvedTree ? collectSourcingLeafData(resolvedTree) : []
  const longLeadLeaves = allLeaves.filter(l => (l.leadWeeks ?? 0) > 12)
  if (longLeadLeaves.length > 0) {
    manufacturingItems.push({
      // P1 council fix: Math.max(...[]) = -Infinity when array empty — guard with length check
      // (longLeadLeaves.length > 0 is guaranteed by the if-guard above, but be explicit)
      label: `Long-lead risk: ${longLeadLeaves.length} part${longLeadLeaves.length > 1 ? 's' : ''} exceed 12-week lead time — longest: ${longLeadLeaves.length > 0 ? Math.max(...longLeadLeaves.map(l => l.leadWeeks ?? 0)) : 'N/A'} weeks. Initiate supplier engagement immediately or qualify alternatives.`,
      severity: 'warn',
    })
  }

  // MOQ vs production rate
  const batchSizeRawMfg = parsedBrief?.constraints?.batch_size?.value ?? brief?.constraints?.batchSize
  const batchSizeMfg = typeof batchSizeRawMfg === 'number' ? batchSizeRawMfg : null
  const totalLeaves = allLeaves.length
  if (batchSizeMfg !== null && batchSizeMfg > 0 && totalLeaves > 0) {
    manufacturingItems.push({
      label: `Production rate: brief specifies ${batchSizeMfg} unit${batchSizeMfg > 1 ? 's' : ''} batch. Verify minimum order quantities for all ${totalLeaves} BOM lines against this volume; volume breaks typically unlock at 3× and 10× batch.`,
      severity: 'info',
    })
  }

  // Custom vs COTS ratio from resolved tree
  const customLeaves = allLeaves.filter(l =>
    l.source === 'vendor_catalog' || l.source === 'llm_estimate' || l.source === 'bom_estimate'
  )
  const customCotsPct = totalLeaves > 0 ? Math.round((customLeaves.length / totalLeaves) * 100) : 0
  if (customCotsPct > 0) {
    manufacturingItems.push({
      label: `Custom / OEM ratio: ${customCotsPct}% of BOM lines (${customLeaves.length}/${totalLeaves}) require OEM-direct or custom sourcing (no distributor match). Each represents a procurement risk without alternative supply.`,
      severity: customCotsPct > 50 ? 'warn' : 'info',
    })
  }

  // Single-source count
  const singleSourceLeaves = allLeaves.filter(l =>
    ['vendor_catalog', 'llm_estimate', 'stub', 'bom_estimate'].includes(l.source)
  )
  const singleSourceCount = singleSourceLeaves.length
  if (singleSourceCount > 0) {
    manufacturingItems.push({
      label: `Single-source exposure: ${singleSourceCount} part${singleSourceCount > 1 ? 's' : ''} have no verified distributor alternative. Qualify second sources or hold safety stock to reduce supply chain risk.`,
      severity: singleSourceCount > 5 ? 'warn' : 'info',
    })
  }

  // Top cost driver
  if (cs.topDrivers && cs.topDrivers.length > 0) {
    const driver = cs.topDrivers[0]
    manufacturingItems.push({
      label: `Top cost driver: ${driver.partName} — ${driver.pct.toFixed(0)}% of BOM total (${fmtGbp(driver.totalGbp)}). Verify pricing at target volume before design lock.`,
      severity: driver.pct > 40 ? 'warn' : 'info',
    })
  }

  // ──────────────────────────────────────────────────────────────────────
  // §A LIFT 2026-05-11 — Engineering Feasibility Analysis (4 disciplines)
  // Synthesises thermal / mechanical / electrical / regulatory feasibility
  // from grammar verdicts + parsedBrief + resolved tree. NO new LLM call.
  // ──────────────────────────────────────────────────────────────────────
  const engineeringFeasibility: FeasibilityData['engineeringFeasibility'] = []

  // Thermal feasibility — synthesise from thermal_capacity_vs_load grammar
  // verdict (carries the actual capacity vs load numbers in v.reason) plus
  // operating-temperature envelope from the brief.
  const thermalVerdict = grammarVerdicts?.verdicts.find(v =>
    v.rule_id === 'thermal_capacity_vs_load' || v.rule_id.includes('thermal'))
  const opEnvTemp = parsedBrief?.constraints?.operating_environment
  const tempRangeStr = (opEnvTemp?.temp_min_c != null || opEnvTemp?.temp_max_c != null)
    ? `${opEnvTemp?.temp_min_c ?? '—'} to ${opEnvTemp?.temp_max_c ?? '—'} °C`
    : null
  if (thermalVerdict) {
    engineeringFeasibility.push({
      discipline: 'Thermal',
      verdict: thermalVerdict.verdict as 'PASS' | 'WARN' | 'BLOCK',
      headline: thermalVerdict.verdict === 'PASS'
        ? 'Cooling capacity meets ≥110% of peak heat dissipation.'
        : 'Cooling capacity below 110% of peak heat dissipation — under-specified.',
      detail: `${thermalVerdict.reason.slice(0, 220)}${thermalVerdict.reason.length > 220 ? '…' : ''}` +
        (tempRangeStr ? ` Brief operating range: ${tempRangeStr}.` : ''),
    })
  } else {
    // No thermal verdict fired — surface the gap rather than silently omit
    engineeringFeasibility.push({
      discipline: 'Thermal',
      verdict: 'PENDING',
      headline: 'Thermal margin not yet computed.',
      detail: 'Grammar rule thermal_capacity_vs_load did not fire — likely because no thermal load characters are present in the resolved tree. Verify cooling sizing manually before design lock.' +
        (tempRangeStr ? ` Brief operating range: ${tempRangeStr}.` : ''),
    })
  }

  // Mechanical feasibility — synthesise from mass / dimension constraints in
  // the brief plus the leaf count and structural-archetype presence.
  const massBudgetKg = parsedBrief?.constraints?.max_mass_kg?.value ?? brief?.constraints?.maxMassKg ?? null
  const env = parsedBrief?.constraints?.max_dimensions_mm
  const envelopeStr = env && (env.w != null || env.d != null || env.h != null)
    ? `${env.w ?? '—'} × ${env.d ?? '—'} × ${env.h ?? '—'} mm`
    : (brief?.constraints?.envelope ?? null)
  // Detect structural / chassis presence in the resolved tree.
  // Council fix 2026-05-11 (3/3 NEEDS_MAJOR + NEEDS_MINOR convergence): use
  // word-boundary regex to avoid false positives like "control_panel",
  // "door_switch", "rack_mount_pdu". archetypeIds are snake_case so token
  // boundaries are underscore + start/end.
  const STRUCTURAL_TOKENS = ['frame', 'enclosure', 'chassis', 'housing', 'bracket', 'panel', 'door', 'rack', 'vessel']
  const STRUCTURAL_REGEX = new RegExp(`(?:^|_)(?:${STRUCTURAL_TOKENS.join('|')})(?:$|_)`)
  const structuralLeaves = allLeaves.filter(l =>
    STRUCTURAL_REGEX.test(l.archetypeId.toLowerCase()))
  const massVerdict = grammarVerdicts?.verdicts.find(v =>
    v.rule_id === 'mass_balance_closed_loop' || v.rule_id.includes('mass'))
  const mechVerdict: 'PASS' | 'WARN' | 'BLOCK' | 'PENDING' = massVerdict
    ? (massVerdict.verdict as 'PASS' | 'WARN' | 'BLOCK')
    : (structuralLeaves.length > 0 ? 'PENDING' : 'PENDING')
  const mechHeadline = (massBudgetKg != null && envelopeStr)
    ? `Mass budget ${massBudgetKg} kg, envelope ${envelopeStr} — ${structuralLeaves.length} structural leaf${structuralLeaves.length === 1 ? '' : 's'} in tree.`
    : massBudgetKg != null
      ? `Mass budget ${massBudgetKg} kg — ${structuralLeaves.length} structural leaf${structuralLeaves.length === 1 ? '' : 's'} in tree.`
      : envelopeStr
        ? `Envelope ${envelopeStr} — ${structuralLeaves.length} structural leaf${structuralLeaves.length === 1 ? '' : 's'} in tree.`
        : `${structuralLeaves.length} structural / enclosure leaf${structuralLeaves.length === 1 ? '' : 's'} resolved; mass + envelope not specified in brief.`
  const mechDetailParts: string[] = []
  if (massVerdict) {
    mechDetailParts.push(`${massVerdict.reason.slice(0, 160)}${massVerdict.reason.length > 160 ? '…' : ''}`)
  }
  if (structuralLeaves.length > 0) {
    const namedStructurals = structuralLeaves.slice(0, 4).map(l => l.archetypeId.replace(/_/g, ' ')).join(', ')
    mechDetailParts.push(`Structural members include: ${namedStructurals}${structuralLeaves.length > 4 ? `, plus ${structuralLeaves.length - 4} more` : ''}.`)
  }
  if (massBudgetKg == null && envelopeStr == null) {
    mechDetailParts.push('No mass or envelope constraint stated — define both in brief to enable structural feasibility tracking.')
  } else if (massBudgetKg != null) {
    mechDetailParts.push('Per-leaf mass rollup pending: weigh BOM against budget once distributor data lands.')
  }
  engineeringFeasibility.push({
    discipline: 'Mechanical',
    verdict: mechVerdict,
    headline: mechHeadline,
    detail: mechDetailParts.join(' ') || 'Mechanical feasibility data not available — populate brief constraints and re-run.',
  })

  // Electrical feasibility — synthesise from KCL + voltage_derate verdicts
  // plus the additional_constraints text (often carries voltage/power).
  const kclVerdict = grammarVerdicts?.verdicts.find(v => v.rule_id === 'KCL_node_balance' || v.rule_id.includes('KCL'))
  const voltageVerdict = grammarVerdicts?.verdicts.find(v => v.rule_id.includes('voltage_derate') || v.rule_id.includes('voltage'))
  const additionalConstraints = parsedBrief?.constraints?.additional_constraints ?? []
  const powerHint = additionalConstraints
    .map(ac => ac.description)
    .find(d => /\b(kW|MW|W |Wh|kWh|MWh|VDC|VAC|V\b|amp)/i.test(d))
  const electricalVerdicts = [kclVerdict, voltageVerdict].filter(Boolean) as GrammarVerdict[]
  const electricalWorst: 'PASS' | 'WARN' | 'BLOCK' | 'PENDING' = electricalVerdicts.length === 0
    ? 'PENDING'
    : (electricalVerdicts.find(v => v.verdict === 'BLOCK') ? 'BLOCK'
        : electricalVerdicts.find(v => v.verdict === 'WARN') ? 'WARN' : 'PASS')
  const electricalLines: string[] = []
  if (kclVerdict) {
    electricalLines.push(`KCL node balance: ${kclVerdict.verdict} — ${kclVerdict.reason.slice(0, 110)}${kclVerdict.reason.length > 110 ? '…' : ''}`)
  }
  if (voltageVerdict) {
    electricalLines.push(`Voltage derating (≤80% of rated): ${voltageVerdict.verdict} — ${voltageVerdict.reason.slice(0, 110)}${voltageVerdict.reason.length > 110 ? '…' : ''}`)
  }
  if (powerHint) {
    electricalLines.push(`Brief power / voltage constraint: ${powerHint.slice(0, 140)}${powerHint.length > 140 ? '…' : ''}`)
  }
  if (electricalLines.length === 0) {
    electricalLines.push('No electrical grammar rules fired and no power/voltage constraint extracted from brief — verify electrical sizing manually before design lock.')
  }
  engineeringFeasibility.push({
    discipline: 'Electrical',
    verdict: electricalWorst,
    headline: electricalWorst === 'PASS' ? 'Electrical balance and derating checks pass.'
      : electricalWorst === 'WARN' ? 'Electrical balance or derating margin requires attention.'
      : electricalWorst === 'BLOCK' ? 'Electrical design rule failure — must be fixed before manufacture.'
      : 'Electrical feasibility pending — no rules fired against current tree.',
    detail: electricalLines.join(' '),
  })

  // Regulatory feasibility — count PENDING vs PASS from the class compliance
  // table, mention top jurisdictions and named standards.
  const regPending = regulatoryCompliance.filter(r => r.verdict === 'PENDING').length
  const regPass = regulatoryCompliance.filter(r => r.verdict === 'PASS').length
  const regNa = regulatoryCompliance.filter(r => r.verdict === 'N/A').length
  const extractedRegsForFeas = state.regulatoryExtraction?.regulatory_entries ?? []
  const namedStds = (regulatoryCompliance.length > 0
    ? regulatoryCompliance.map(r => r.standard.split(' ')[0]).filter(Boolean)
    : extractedRegsForFeas.slice(0, 4).map(r => r.standard_name).filter(Boolean)
  ).slice(0, 4)
  const jurisdictions = Array.from(new Set(extractedRegsForFeas.map(r => r.jurisdiction).filter(Boolean))).slice(0, 3)
  const regVerdict: 'PASS' | 'WARN' | 'BLOCK' | 'PENDING' = regulatoryCompliance.length === 0 && extractedRegsForFeas.length === 0
    ? 'PENDING'
    : regPending > 0 ? 'WARN' : 'PASS'
  const regHeadline = regulatoryCompliance.length > 0
    ? `${regPending} of ${regulatoryCompliance.length} class-specific standards pending; ${regPass} confirmed compliant; ${regNa} not applicable.`
    : extractedRegsForFeas.length > 0
      ? `${extractedRegsForFeas.length} regulatory standard${extractedRegsForFeas.length === 1 ? '' : 's'} extracted from brief — all PENDING compliance verification.`
      : 'No class-specific regulatory profile and no extraction data — verify jurisdiction-specific requirements before manufacture.'
  const regDetailLines: string[] = []
  if (namedStds.length > 0) {
    regDetailLines.push(`Named standards: ${namedStds.join(', ')}.`)
  }
  if (jurisdictions.length > 0) {
    regDetailLines.push(`Jurisdictions: ${jurisdictions.join(', ')}.`)
  }
  if (regPending > 0) {
    regDetailLines.push(`Each PENDING standard requires: (a) Notified Body / accredited test-house engagement, (b) evidence package (test data + design files), (c) ${regPending > 3 ? '~6-9' : '~3-6'} month lead before declaration of conformity.`)
  }
  if (regDetailLines.length === 0) {
    regDetailLines.push('Compliance pathway not yet defined — populate regulatoryExtraction stage to surface gap actions.')
  }
  engineeringFeasibility.push({
    discipline: 'Regulatory',
    verdict: regVerdict,
    headline: regHeadline,
    detail: regDetailLines.join(' '),
  })

  return {
    costVerdict,
    costIsOverBudget: !!(ceiling && unitCost > ceiling),
    costReductionPaths,
    topRisks,
    regulatoryCompliance,
    dynamicRegulatoryItems,
    manufacturingItems,
    customCotsPct,
    singleSourceCount,
    engineeringFeasibility,
  }
}

const FeasibilityAssessmentPage = ({ state }: { state: PipelineState }) => {
  const data = buildFeasibilityData(state)
  const projectId = dash(state.projectId)

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Feasibility Notes`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Feasibility Notes
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 14 }} />

      {/* §A LIFT 2026-05-11 — Engineering Feasibility Analysis (4 disciplines) */}
      {data.engineeringFeasibility.length > 0 && (
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Engineering Feasibility — by discipline
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginBottom: 10, fontFamily: 'Helvetica-Oblique', lineHeight: 1.4 }}>
            Synthesised from grammar verdicts (Design Rule Check), brief constraints, and resolved-tree leaf data. Per-row verdict
            mirrors the underlying rule: PASS = margin met, WARN = within tolerance but tight, BLOCK = must-fix, PENDING = rule did not
            fire (verify manually).
          </Text>
          {data.engineeringFeasibility.map((row, i) => {
            const colour = row.verdict === 'PASS' ? BESS_GREEN
              : row.verdict === 'WARN' ? BESS_AMBER
              : row.verdict === 'BLOCK' ? BESS_RED
              : MUTED
            return (
              <View key={i} style={{
                marginBottom: i < data.engineeringFeasibility.length - 1 ? 8 : 0,
                borderLeftWidth: 2,
                borderLeftColor: colour,
                paddingLeft: 8,
              }} wrap={false}>
                <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                  <View style={{ borderWidth: 0.5, borderColor: colour, paddingVertical: 1, paddingHorizontal: 5, marginRight: 6 }}>
                    <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: colour }}>{row.discipline}</Text>
                  </View>
                  <View style={{ borderWidth: 0.5, borderColor: colour, paddingVertical: 1, paddingHorizontal: 5 }}>
                    <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: colour }}>{row.verdict}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, marginBottom: 2 }}>{row.headline}</Text>
                <Text style={{ fontSize: 8, color: MUTED, lineHeight: 1.4 }}>{row.detail}</Text>
              </View>
            )
          })}
        </View>
      )}

      {/* Field 1 — Cost Verdict + Reduction Paths */}
      <View style={{ borderWidth: 0.5, borderColor: data.costIsOverBudget ? BESS_RED : TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: data.costIsOverBudget ? BESS_RED : BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          1. Cost Verdict and Reduction Paths
        </Text>
        <Text style={{ fontSize: 10, color: data.costIsOverBudget ? BESS_RED : INK, lineHeight: 1.5, marginBottom: data.costReductionPaths.length > 0 ? 8 : 0 }}>
          {data.costVerdict}
        </Text>
        {data.costReductionPaths.length > 0 && (
          <>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: BESS_AMBER, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Reduction Paths:
            </Text>
            {data.costReductionPaths.map((path, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }} wrap={false}>
                <Text style={{ fontSize: 8, color: BESS_AMBER, fontFamily: 'Helvetica-Bold', width: 14 }}>{i + 1}.</Text>
                <Text style={{ fontSize: 8, color: INK, lineHeight: 1.4, flex: 1 }}>{path}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      {/* Field 2 — Top Engineering Risks with mitigation */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          2. Top Engineering Risks
        </Text>
        {data.topRisks.map((risk, i) => {
          const riskColour = risk.verdict === 'BLOCK' ? BESS_RED : risk.verdict === 'WARN' ? BESS_AMBER : BESS_GREEN
          return (
            <View key={i} style={{ marginBottom: 8, borderLeftWidth: 2, borderLeftColor: riskColour, paddingLeft: 8 }} wrap={false}>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                <View style={{ borderWidth: 0.5, borderColor: riskColour, paddingVertical: 1, paddingHorizontal: 5, marginRight: 6 }}>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: riskColour }}>{risk.verdict}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, marginBottom: 2 }}>{risk.label}</Text>
              <Text style={{ fontSize: 8, color: MUTED, fontFamily: 'Helvetica-Oblique', lineHeight: 1.3 }}>
                Mitigation: {risk.mitigation}
              </Text>
            </View>
          )
        })}
      </View>

      {/* Field 3 — Regulatory Flags: class compliance table */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          3. Regulatory Flags — {dash(state.productClass)}
        </Text>
        {data.regulatoryCompliance.length > 0 ? (
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: data.dynamicRegulatoryItems.length > 0 ? 8 : 0 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
              <Text style={{ width: '55%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 7 }}>Standard</Text>
              <Text style={{ width: '15%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 7 }}>Status</Text>
              <Text style={{ width: '30%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 7 }}>Trigger Field</Text>
            </View>
            {data.regulatoryCompliance.map((entry, i) => {
              const verdictColour = entry.verdict === 'PASS' ? BESS_GREEN
                : entry.verdict === 'N/A' ? MUTED
                : BESS_AMBER
              return (
                <View key={i} style={{
                  flexDirection: 'row',
                  borderBottomWidth: i === data.regulatoryCompliance.length - 1 ? 0 : 0.5,
                  borderBottomColor: TABLE_BORDER,
                  backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT,
                }} wrap={false}>
                  <Text style={{ width: '55%', fontSize: 8, color: INK, paddingVertical: 4, paddingHorizontal: 7, lineHeight: 1.3 }}>
                    {entry.standard}
                  </Text>
                  <Text style={{ width: '15%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: verdictColour, paddingVertical: 4, paddingHorizontal: 7 }}>
                    {entry.verdict}
                  </Text>
                  <Text style={{ width: '30%', fontSize: 7, color: MUTED, paddingVertical: 4, paddingHorizontal: 7, lineHeight: 1.3 }}>
                    {entry.trigger}
                  </Text>
                </View>
              )
            })}
          </View>
        ) : (
          <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 6 }}>
            No class-specific regulatory table available — verify jurisdiction-specific requirements before manufacture.
          </Text>
        )}
        {data.dynamicRegulatoryItems.map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }} wrap={false}>
            <Text style={{ fontSize: 8, color: BESS_AMBER, fontFamily: 'Helvetica-Bold', width: 14 }}>►</Text>
            <Text style={{ fontSize: 8, color: INK, lineHeight: 1.3, flex: 1 }}>{item}</Text>
          </View>
        ))}
      </View>

      {/* Field 4 — Manufacturing and Sourcing Flags */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          4. Manufacturing and Sourcing Flags
        </Text>
        {data.manufacturingItems.map((item, i) => {
          const bulletColour = item.severity === 'warn' ? BESS_RED : item.severity === 'info' ? BESS_AMBER : BESS_GREEN
          return (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 5 }} wrap={false}>
              <Text style={{ fontSize: 9, color: bulletColour, fontFamily: 'Helvetica-Bold', width: 14 }}>►</Text>
              <Text style={{ fontSize: 9, color: INK, lineHeight: 1.4, flex: 1 }}>{item.label}</Text>
            </View>
          )
        })}
        {data.manufacturingItems.length === 0 && (
          <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
            Manufacturing data unavailable — run Phase 2 (resolution) to populate lead times and sourcing data.
          </Text>
        )}
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

  // Piece 1G (2026-05-12) — LLM-augmented brief overview prose blocks.
  const briefProse = (state as any).briefOverviewProse as undefined | {
    overview_and_context: string
    mission_statement: string
    target_customers: string
    why_now: string
  }

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
  // council fix: full optional chain — parsedBrief can exist with undefined constraints
  const safetyStandards: string[] =
    parsedBrief?.constraints?.safety_standards?.map(s => `${s.standard}${s.code ? ' (' + s.code + ')' : ''}`) ??
    regs.slice(0, 6).map(r => `${r.standard_name} — ${r.gap_action.slice(0, 60)}`)

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Brief and Requirements`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Brief and Requirements
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

      {/* Piece 1G — LLM prose: Overview and Context / Mission / Target Customers / Why Now */}
      {briefProse && (
        <View>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginTop: 12, marginBottom: 6 }}>Overview and Context</Text>
          {briefProse.overview_and_context.split('\n\n').map((para, i) => (
            <Text key={i} style={{ fontSize: 10, color: INK, lineHeight: 1.55, marginBottom: 8 }}>{para}</Text>
          ))}
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginTop: 12, marginBottom: 6 }}>Mission Statement</Text>
          <Text style={{ fontSize: 10, color: INK, lineHeight: 1.55, marginBottom: 8 }}>{briefProse.mission_statement}</Text>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginTop: 12, marginBottom: 6 }}>Target Customers</Text>
          <Text style={{ fontSize: 10, color: INK, lineHeight: 1.55, marginBottom: 8 }}>{briefProse.target_customers}</Text>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginTop: 12, marginBottom: 6 }}>Why Now</Text>
          <Text style={{ fontSize: 10, color: INK, lineHeight: 1.55, marginBottom: 12 }}>{briefProse.why_now}</Text>
        </View>
      )}

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

// ---------------------------------------------------------------------------
// §2.5 — Module Connection Map Page
// Renders the cross-module grammar link graph + matrix table from
// state.moduleDecomposition. Falls back gracefully when Stage 1.5 did not run.
// ---------------------------------------------------------------------------

/** Short label for a module: truncate to ~22 chars to fit PDF boxes */
function shortModuleLabel(module: string): string {
  const full = MODULE_LABELS[module as keyof typeof MODULE_LABELS] ?? humaniseId(module)
  // Abbreviate a few long names for the SVG boxes
  const abbrevs: Record<string, string> = {
    'Energy Storage / Source / Dissipation': 'Energy Storage',
    'Energy Conversion / Transduction': 'Energy Conversion',
    'Control / Compute / Communication': 'Control / Compute',
    'Sensing / Instrumentation': 'Sensing',
    'Safety / Protection': 'Safety / Protection',
    'Environmental Interface': 'Environmental I/F',
    'Power Distribution': 'Power Distribution',
    'Maintenance / Serviceability': 'Maintenance',
    'Structure / Containment': 'Structure',
    'Actuation / Kinematics / Mechanisms': 'Actuation',
    'Mass / Fluid Transport & Process': 'Fluid Transport',
    'Human-Machine Interface & Ergonomics': 'HMI',
  }
  return abbrevs[full] ?? full
}

/** First sentence of module_brief — for box subtitle */
function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]/)
  return m ? m[0].trim() : text.slice(0, 60).trim()
}

/**
 * SVG graph component: module boxes in a 4-wide grid with labelled connection lines.
 * Renders inside a @react-pdf/renderer Page's Svg element.
 *
 * Layout: A4 content width ~507pt after 44pt margins.
 * We use a viewBox that maps onto the available width.
 */
function ModuleConnectionGraph({
  modules,
  links,
}: {
  modules: ModuleSpec[]
  links: CrossModuleGrammarLink[]
}): React.ReactElement {
  const COLS = 4
  const BOX_W = 110
  const BOX_H = 42
  const COL_GAP = 14
  const ROW_GAP = 48
  const PAD_X = 6
  const PAD_TOP = 8

  const n = modules.length
  const rows = Math.ceil(n / COLS)

  // Position each module box
  const positions: Record<string, { cx: number; cy: number; x: number; y: number }> = {}
  modules.forEach((mod, idx) => {
    const col = idx % COLS
    const row = Math.floor(idx / COLS)
    const x = PAD_X + col * (BOX_W + COL_GAP)
    const y = PAD_TOP + row * (BOX_H + ROW_GAP)
    positions[mod.module] = { x, y, cx: x + BOX_W / 2, cy: y + BOX_H / 2 }
  })

  const TOTAL_W = PAD_X * 2 + COLS * BOX_W + (COLS - 1) * COL_GAP
  const TOTAL_H = PAD_TOP + rows * BOX_H + (rows - 1) * ROW_GAP + 16

  // Arrow path between two module boxes
  function arrowPoints(from: string, to: string): { x1: number; y1: number; x2: number; y2: number } | null {
    const fp = positions[from]
    const tp = positions[to]
    if (!fp || !tp) return null
    // Connect bottom of upper box to top of lower box, or right/left of same-row boxes
    const sameRow = Math.floor(modules.findIndex(m => m.module === from) / COLS) ===
                    Math.floor(modules.findIndex(m => m.module === to) / COLS)
    if (sameRow) {
      // horizontal: connect right edge of left box to left edge of right box
      const goRight = fp.cx < tp.cx
      return goRight
        ? { x1: fp.x + BOX_W, y1: fp.cy, x2: tp.x, y2: tp.cy }
        : { x1: fp.x, y1: fp.cy, x2: tp.x + BOX_W, y2: tp.cy }
    } else {
      // vertical / diagonal: bottom of upper to top of lower
      const fromAbove = fp.cy < tp.cy
      return fromAbove
        ? { x1: fp.cx, y1: fp.y + BOX_H, x2: tp.cx, y2: tp.y }
        : { x1: fp.cx, y1: fp.y, x2: tp.cx, y2: tp.y + BOX_H }
    }
  }

  return (
    <Svg viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`} width={TOTAL_W} height={TOTAL_H}>
      {/* Connection lines — drawn before boxes so boxes sit on top */}
      {links.map((link, i) => {
        const pts = arrowPoints(link.from_module, link.to_module)
        if (!pts) return null
        const isMutual = link.type === 'mutual'
        const label = humaniseId(link.mechanism)
        const mx = (pts.x1 + pts.x2) / 2
        const my = (pts.y1 + pts.y2) / 2
        return (
          <G key={i}>
            <Line
              x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2}
              stroke={BESS_NAVY}
              strokeWidth={1}
              strokeDasharray={isMutual ? undefined : '3,2'}
            />
            {/* Small label pill at midpoint */}
            <Rect
              x={mx - 22} y={my - 5} width={44} height={10}
              fill="#ffffff" stroke="#e0e0e0" strokeWidth={0.5}
            />
            <Text
              x={mx} y={my + 3}
              style={{ fontSize: 5, fill: BESS_TEAL, textAnchor: 'middle', fontFamily: 'Helvetica-Bold' }}
            >
              {label.length > 14 ? label.slice(0, 13) + '…' : label}
            </Text>
          </G>
        )
      })}

      {/* Module boxes */}
      {modules.map((mod) => {
        const pos = positions[mod.module]
        if (!pos) return null
        const label = shortModuleLabel(mod.module)
        const sub = firstSentence(mod.module_brief ?? '')
        return (
          <G key={mod.module}>
            <Rect
              x={pos.x} y={pos.y} width={BOX_W} height={BOX_H}
              rx={4} ry={4}
              fill="#ffffff" stroke={BESS_NAVY} strokeWidth={1.2}
            />
            <Text
              x={pos.cx} y={pos.y + 13}
              style={{ fontSize: 6, fontFamily: 'Helvetica-Bold', fill: INK_DARK, textAnchor: 'middle' }}
            >
              {label}
            </Text>
            <Text
              x={pos.cx} y={pos.y + 23}
              style={{ fontSize: 5, fill: MUTED, textAnchor: 'middle', fontFamily: 'Helvetica' }}
            >
              {sub.length > 28 ? sub.slice(0, 27) + '…' : sub}
            </Text>
          </G>
        )
      })}
    </Svg>
  )
}

/**
 * §2.5 Module Connection Map Page
 *
 * Visual: SVG graph of module boxes + connection lines, followed by a
 * matrix table (from × to). Falls back to a placeholder if moduleDecomposition
 * is absent (legacy state paths).
 */
export function ModuleConnectionMapPage({ state }: { state: PipelineState }): React.ReactElement {
  const projectId = dash(state.projectId)
  const md = state.moduleDecomposition

  if (!md) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §2.5 Module Connection Map`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Module Connection Map
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Module connection map unavailable — Stage 1.5 did not run for this product.
          Enable RADICAL_PHASE_3_PER_MODULE=true and re-run the pipeline to populate.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const modules = md.modules ?? []
  const links = md.cross_module_grammar_links ?? []
  const excludedModules = md.excluded_modules ?? []
  const rationaleExcluded = md.rationale_excluded ?? {}
  const n = modules.length

  // Build index for quick lookup
  const moduleIndex = new Map<string, ModuleSpec>()
  for (const m of modules) moduleIndex.set(m.module, m)

  // Matrix: [from][to] = description string
  // For directional links: from → to
  // For mutual links: both directions populated
  const matrix: Record<string, Record<string, string>> = {}
  for (const m of modules) matrix[m.module] = {}

  for (const link of links) {
    const fromMod = link.from_module
    const toMod = link.to_module
    const mechLabel = humaniseId(link.mechanism)
    const detail = link.detail ? ` (${link.detail})` : ''
    const cellText = `${mechLabel}${detail}`

    if (!matrix[fromMod]) matrix[fromMod] = {}
    if (!matrix[toMod]) matrix[toMod] = {}

    if (link.type === 'mutual') {
      // Both directions
      const existFwd = matrix[fromMod][toMod]
      matrix[fromMod][toMod] = existFwd ? `${existFwd}; ${cellText}` : cellText
      const existRev = matrix[toMod][fromMod]
      matrix[toMod][fromMod] = existRev ? `${existRev}; ${cellText}` : cellText
    } else {
      const exist = matrix[fromMod][toMod]
      matrix[fromMod][toMod] = exist ? `${exist}; ${cellText}` : cellText
    }
  }

  // Column header width — compress for >4 modules
  const colPct = n <= 4 ? `${Math.floor(80 / n)}%` : n <= 6 ? '13%' : '10%'
  const rowHeaderPct = n <= 4 ? '20%' : n <= 6 ? '22%' : '20%'

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | §2.5 Module Connection Map`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Module Connection Map
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 10 }} />

      {/* Subtitle paragraph */}
      <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14, lineHeight: 1.5 }}>
        {`How the ${n} active module${n !== 1 ? 's' : ''} of this product interconnect at the system-architecture level. Each connection is annotated with its physical mechanism (electrical bus, comms link, cooling loop, etc.). Modules marked N/A for this product class are listed below the matrix.`}
      </Text>

      {/* SVG graph — module boxes in 4-wide grid with labelled connection lines */}
      {modules.length > 0 ? (
        <>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            System Architecture Graph
          </Text>
          <View style={{ marginBottom: 16, alignItems: 'center' }}>
            <ModuleConnectionGraph modules={modules} links={links} />
          </View>

          {/* Legend: mutual (solid) vs directional (dashed) */}
          <View style={{ flexDirection: 'row', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
              <View style={{ width: 20, height: 1, backgroundColor: BESS_NAVY, marginRight: 4 }} />
              <Text style={{ fontSize: 7, color: MUTED }}>Mutual (bidirectional)</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 20, height: 1, backgroundColor: BESS_NAVY, marginRight: 4, borderStyle: 'dashed', borderWidth: 0.5 }} />
              <Text style={{ fontSize: 7, color: MUTED }}>Directional (one-way)</Text>
            </View>
          </View>
        </>
      ) : null}

      {/* Connection list — numbered for clarity */}
      {links.length > 0 ? (
        <>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6 }}>
            Connection Index
          </Text>
          {links.map((link, i) => {
            const fromLabel = shortModuleLabel(link.from_module)
            const toLabel = shortModuleLabel(link.to_module)
            const mechLabel = humaniseId(link.mechanism)
            const detail = link.detail ? ` — ${link.detail}` : ''
            const arrow = link.type === 'mutual' ? '↔' : '→'
            return (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }} wrap={false}>
                <Text style={{ fontSize: 8, color: MUTED, width: 16 }}>{i + 1}.</Text>
                <Text style={{ fontSize: 8, color: INK, flex: 1 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fromLabel}</Text>
                  {` ${arrow} `}
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{toLabel}</Text>
                  {`  `}
                  <Text style={{ color: BESS_TEAL }}>[{mechLabel}{detail}]</Text>
                </Text>
              </View>
            )
          })}
          <View style={{ marginBottom: 14 }} />
        </>
      ) : (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14 }}>
          No cross-module grammar links declared.
        </Text>
      )}

      {/* Connection matrix table — rows: from module, cols: to module */}
      {modules.length > 1 ? (
        <>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6 }}>
            Connection Matrix
          </Text>
          <Text style={{ fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 6 }}>
            Read row → column as "what the row module provides to the column module."
          </Text>
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 16 }}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
              <View style={{ width: rowHeaderPct, borderRightWidth: 0.5, borderRightColor: '#4a6a9f', paddingVertical: 4, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#aac0e0' }}>from ↓  to →</Text>
              </View>
              {modules.map((m, i) => (
                <View key={i} style={{ width: colPct, borderRightWidth: i < modules.length - 1 ? 0.5 : 0, borderRightColor: '#4a6a9f', paddingVertical: 4, paddingHorizontal: 3 }}>
                  <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT }}>
                    {shortModuleLabel(m.module)}
                  </Text>
                </View>
              ))}
            </View>
            {/* Data rows */}
            {modules.map((fromMod, rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: 'row', borderBottomWidth: rowIdx < modules.length - 1 ? 0.5 : 0, borderBottomColor: TABLE_BORDER, backgroundColor: rowIdx % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
                <View style={{ width: rowHeaderPct, borderRightWidth: 0.5, borderRightColor: TABLE_BORDER, paddingVertical: 4, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: BESS_NAVY }}>
                    {shortModuleLabel(fromMod.module)}
                  </Text>
                </View>
                {modules.map((toMod, colIdx) => {
                  const isSelf = fromMod.module === toMod.module
                  const cellText = matrix[fromMod.module]?.[toMod.module] ?? ''
                  return (
                    <View
                      key={colIdx}
                      style={{
                        width: colPct,
                        borderRightWidth: colIdx < modules.length - 1 ? 0.5 : 0,
                        borderRightColor: TABLE_BORDER,
                        paddingVertical: 3,
                        paddingHorizontal: 3,
                        backgroundColor: isSelf ? BESS_NAVY : undefined,
                        justifyContent: 'center',
                      }}
                    >
                      {isSelf ? (
                        <Text style={{ fontSize: 6, color: '#4a6a9f', textAlign: 'center' }}>■</Text>
                      ) : cellText ? (
                        <Text style={{ fontSize: 5.5, color: INK, lineHeight: 1.4 }}>{cellText}</Text>
                      ) : (
                        <Text style={{ fontSize: 6, color: MUTED, textAlign: 'center' }}>—</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Excluded modules note */}
      {excludedModules.length > 0 ? (
        <View style={{ backgroundColor: BG_SOFT, borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: MUTED, marginBottom: 4 }}>
            Modules excluded for this product class ({excludedModules.length}):
          </Text>
          {excludedModules.map((excl, i) => {
            const label = MODULE_LABELS[excl as keyof typeof MODULE_LABELS] ?? humaniseId(excl)
            const rationale = rationaleExcluded[excl as keyof typeof rationaleExcluded] ?? 'Not applicable to this product class.'
            return (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontSize: 7, color: MUTED, width: 130, fontFamily: 'Helvetica-Bold' }}>{label}</Text>
                <Text style={{ fontSize: 7, color: MUTED, flex: 1, fontFamily: 'Helvetica-Oblique' }}>{rationale}</Text>
              </View>
            )
          })}
        </View>
      ) : null}

      <DocPageFooter />
    </Page>
  )
}

// ── shared picker — used by 2B (OneModuleWrittenOut), 2C (cards + map), 2D (sentence+paragraph) ──

/**
 * Pick the primary module for detail pages (§3 / §6 / §7 / §8).
 *
 * Selects the most-decomposed module (highest sub_module count) so that all
 * four detail pages show the same module and maintain narrative continuity.
 * Tiebreak: canonical UNIVERSAL_MODULES order. Falls back to the first
 * applicable module when all modules have ≤1 sub_module.
 *
 * Previously named `pickMostDecomposedModule` — renamed and moved here so that
 * Piece 2D (SentenceParagraphViewPage) can call the same function.
 */
function pickPrimaryModuleForDetail(modules: ModuleSpec[]): ModuleSpec | null {
  if (modules.length === 0) return null

  // Sort: most sub_modules first, tiebreak by UNIVERSAL_MODULES order index
  const ranked = [...modules].sort((a, b) => {
    const diff = (b.sub_modules?.length ?? 0) - (a.sub_modules?.length ?? 0)
    if (diff !== 0) return diff
    const ai = UNIVERSAL_MODULES.indexOf(a.module as (typeof UNIVERSAL_MODULES)[number])
    const bi = UNIVERSAL_MODULES.indexOf(b.module as (typeof UNIVERSAL_MODULES)[number])
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
  return ranked[0]
}

/**
 * Build a compact modifier summary string from the first word's modifiers.
 * e.g. "qty ×3920, cap 280 Ah, form prismatic"
 */
function summariseModifiers(sm: SubModuleSpec, maxCount = 3): string {
  const word = sm.words?.[0]
  if (!word) return ''
  const mods = (word.modifier_characters ?? []).slice(0, maxCount)
  return mods
    .map(m => {
      const label = m.kind === 'quantity' ? 'qty' : m.kind
      const val = m.unit ? `${m.value} ${m.unit}` : m.value
      return `${label} ${val}`
    })
    .join(', ')
}

/**
 * §3 One Module Written Out Page
 *
 * Zooms into the most-decomposed module (by sub_module count) and lists all
 * its sub-modules in a bento-style grid: monospace ID + name, role verb,
 * primary content character, and first 2-3 modifiers.
 *
 * Falls back gracefully when moduleDecomposition is absent or the chosen
 * module has no sub_modules.
 */
export function OneModuleWrittenOutPage({ state }: { state: PipelineState }): React.ReactElement {
  const projectId = dash(state.projectId)
  const md = state.moduleDecomposition

  // ── Edge case 1: Stage 1.5 did not run ──────────────────────────────────
  if (!md) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §3 Module Detail`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Module Detail
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Module detail unavailable — Stage 1.5 did not run.
          Enable RADICAL_PHASE_3_PER_MODULE=true and re-run the pipeline to populate.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const modules = md.modules ?? []
  const chosen = pickPrimaryModuleForDetail(modules)

  // ── Edge case 2: no modules at all ──────────────────────────────────────
  if (!chosen) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §3 Module Detail`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Module Detail
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Module detail unavailable — no modules in moduleDecomposition.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const subModules = chosen.sub_modules ?? []
  const moduleLabel = MODULE_LABELS[chosen.module as keyof typeof MODULE_LABELS] ?? humaniseId(chosen.module)
  const grammarLinks = chosen.grammar_links ?? []

  // Determine phrasing for cross-ref note based on why we picked this module
  const maxSubCount = Math.max(...modules.map(m => (m.sub_modules ?? []).length))
  const isMostDecomposed = subModules.length >= maxSubCount && maxSubCount > 1
  const pickReason = isMostDecomposed ? 'most-decomposed' : 'primary'
  const crossRefAdj = isMostDecomposed
    ? 'most-decomposed'
    : 'primary cost-anchor'

  // ── Edge case 3: chosen module has 0 sub_modules ─────────────────────────
  if (subModules.length === 0) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §3 Module Detail: ${chosen.module}`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 4 }}>
          {`Module Detail: ${moduleLabel}`}
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 10 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14, lineHeight: 1.5 }}>
          {`Zooming into one module from the §2.5 connection map. The \`${chosen.module}\` module is the ${crossRefAdj} subsystem of this product.`}
        </Text>
        {chosen.module_brief ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: BESS_TEAL, paddingLeft: 10, marginBottom: 16, backgroundColor: BG_SOFT, padding: 10 }}>
            <Text style={{ fontSize: 9, color: INK, lineHeight: 1.6 }}>{chosen.module_brief}</Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Sub-module decomposition not populated — Stage 1.5 produced only the module-level catalogue.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  // ── Topology notes — sub-modules with a topology_clause ─────────────────
  const topologyItems = subModules.filter(sm => sm.topology_clause && sm.topology_clause.trim())

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | §3 Module Detail: ${chosen.module}`} />

      {/* Title */}
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 4 }}>
        {`Module Detail: ${moduleLabel}`}
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 10 }} />

      {/* Cross-reference note */}
      <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14, lineHeight: 1.5 }}>
        {`Zooming into one module from the §2.5 connection map. The \`${chosen.module}\` module is the ${crossRefAdj} subsystem of this product (${subModules.length} sub-module${subModules.length !== 1 ? 's' : ''}, ${pickReason} pick).`}
      </Text>

      {/* Module brief — quote-style block with BESS_TEAL left border */}
      {chosen.module_brief ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: BESS_TEAL, paddingLeft: 10, marginBottom: 16, backgroundColor: BG_SOFT, padding: 10 }}>
          <Text style={{ fontSize: 9, color: INK, lineHeight: 1.6 }}>{chosen.module_brief}</Text>
        </View>
      ) : null}

      {/* Sub-modules heading */}
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
        {`This module contains the following sub-modules:`}
      </Text>

      {/* Bento-style sub-module boxes */}
      {subModules.map((sm, i) => {
        const firstWord = sm.words?.[0]
        const contentChar = firstWord?.content_character
        const primaryRadical = contentChar?.function_radical_primary
          ?? contentChar?.material_radical_primary
          ?? null
        const modSummary = summariseModifiers(sm, 3)
        const roleVerb = sm.role_verb ?? 'comprises'
        const hasNoWords = !sm.words || sm.words.length === 0

        return (
          <View
            key={sm.id}
            wrap={false}
            style={{
              borderWidth: 1,
              borderColor: TABLE_BORDER,
              borderRadius: 4,
              padding: 8,
              marginBottom: i < subModules.length - 1 ? 6 : 0,
              backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT,
            }}
          >
            <View style={{ flexDirection: 'row', marginBottom: 3 }}>
              {/* Left column: ID + human name */}
              <View style={{ flex: 1.2 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: BESS_NAVY }}>
                  {sm.id}
                </Text>
                <Text style={{ fontSize: 7.5, color: INK, marginTop: 1 }}>{sm.name_human}</Text>
              </View>
              {/* Right column: role verb + character + modifiers */}
              <View style={{ flex: 2.8, paddingLeft: 10 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Oblique', color: BESS_TEAL }}>
                    {roleVerb}
                  </Text>
                  {primaryRadical ? (
                    <Text style={{ fontSize: 7.5, color: INK, marginLeft: 4 }}>
                      {`[${humaniseId(primaryRadical)}]`}
                    </Text>
                  ) : null}
                </View>
                {hasNoWords ? (
                  <Text style={{ fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Oblique', marginTop: 2 }}>
                    (no words declared)
                  </Text>
                ) : modSummary ? (
                  <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
                    {modSummary}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        )
      })}

      {/* Topology notes */}
      {topologyItems.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 4 }}>
            Topology notes:
          </Text>
          {topologyItems.map((sm, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }} wrap={false}>
              <Text style={{ fontSize: 7.5, color: MUTED, width: 14 }}>•</Text>
              <Text style={{ fontSize: 7.5, color: INK, fontFamily: 'Helvetica-Oblique', flex: 1 }}>
                {`${sm.id}: ${sm.topology_clause}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Connection summary */}
      <Text style={{ fontSize: 7.5, color: MUTED, fontFamily: 'Helvetica-Oblique', marginTop: 12, lineHeight: 1.5 }}>
        {grammarLinks.length > 0
          ? `This module declares ${grammarLinks.length} internal grammar link${grammarLinks.length !== 1 ? 's' : ''} — see the sub-module Connection Map in §4 for the topology.`
          : `This module declares no internal grammar links.`
        }
      </Text>

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Piece 2C helpers — character square rendering
// ---------------------------------------------------------------------------

const SLATE = '#6b8e9c'
const SLATE_BG = '#f6fafc'
const SLATE_LIGHT = '#eef5f8'
const QUAD_BORDER = '#dddddd'

/**
 * A single 2×2 quadrant character square.
 * isContent=true → BLACK border (content character)
 * isContent=false → SLATE border (modifier character)
 */
function CharacterSquare({
  isContent,
  tl, tr, bl, br,
  label,
  size = 48,
}: {
  isContent: boolean
  tl: string; tr: string; bl: string; br: string
  label: string
  size?: number
}): React.ReactElement {
  const half = size / 2
  const borderColour = isContent ? INK_DARK : SLATE
  const bgFill = isContent ? '#ffffff' : SLATE_BG

  // Quadrant cell helper — avoids repeating the border/padding spec
  type QCell = { text: string; bold?: boolean; large?: boolean; muted?: boolean; tinted?: boolean }
  const qCell = (cell: QCell) => {
    const isEmpty = !cell.text || cell.text === '—'
    return (
      <View style={{
        width: half, height: half,
        borderWidth: 0.5, borderColor: QUAD_BORDER,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isEmpty ? (isContent ? '#fafafa' : '#f4f7f9') : (cell.tinted ? (isContent ? '#f0fff4' : SLATE_LIGHT) : bgFill),
        overflow: 'hidden',
      }}>
        <Text style={{
          fontSize: cell.large ? 8 : 5.5,
          fontFamily: cell.bold ? 'Helvetica-Bold' : 'Helvetica',
          color: isEmpty ? '#cccccc' : (isContent ? INK_DARK : BESS_NAVY),
          textAlign: 'center',
        }}>
          {isEmpty ? '—' : cell.text}
        </Text>
      </View>
    )
  }

  return (
    <View style={{ alignItems: 'center', marginRight: 4, marginBottom: 4 }}>
      {/* 2×2 grid */}
      <View style={{
        width: size, height: size,
        borderWidth: 2, borderColor: borderColour, borderRadius: 2,
        backgroundColor: bgFill,
        overflow: 'hidden',
        flexDirection: 'column',
      }}>
        <View style={{ flexDirection: 'row' }}>
          {qCell({ text: tl, tinted: true, bold: !isContent })}
          {qCell({ text: tr, bold: !isContent && tr !== '—' && tr !== '', large: !isContent })}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {qCell({ text: bl, bold: !isContent && bl !== '—' && bl !== '' })}
          {qCell({ text: br, muted: true })}
        </View>
      </View>
      {/* Label below */}
      <Text style={{
        fontSize: 4.5,
        fontFamily: 'Helvetica',
        color: isContent ? BESS_NAVY : SLATE,
        textAlign: 'center',
        marginTop: 2,
        maxWidth: size + 4,
      }}>
        {label.length > 16 ? label.slice(0, 15) + '…' : label}
      </Text>
    </View>
  )
}

/**
 * Render a content character as a 2×2 square.
 * TL=function_radical_primary, TR=function_radical_secondary,
 * BL=material_radical_primary, BR=material_radical_secondary.
 */
function renderContentCharSquare(cc: import('../types/module-decomposition').ContentCharacter, size = 48): React.ReactElement {
  // Strip long prefixes for display readability
  const abbrev = (s: string | null): string => {
    if (!s) return '—'
    // Strip _function, _chemistry suffixes for brevity in small squares
    return s.replace(/_function$/, '').replace(/_chemistry$/, '').replace(/_/g, ' ')
  }
  return (
    <CharacterSquare
      isContent={true}
      tl={abbrev(cc.function_radical_primary)}
      tr={abbrev(cc.function_radical_secondary)}
      bl={abbrev(cc.material_radical_primary)}
      br={abbrev(cc.material_radical_secondary)}
      label={cc.character_id}
      size={size}
    />
  )
}

/**
 * Render a modifier character as a 2×2 square.
 * TL=kind, TR=value, BL=unit, BR=scope (not in type — often empty).
 */
function renderModifierCharSquare(mc: import('../types/module-decomposition').ModifyingCharacter, size = 48): React.ReactElement {
  // Compact kind label
  const kindLabel: Record<string, string> = {
    quantity: 'qty', capacity: 'cap', form: 'form', topology: 'top',
    dimension: 'dim', lifecycle: 'life', regulatory: 'reg', performance: 'perf',
    tolerance: 'tol', envelope: 'env',
  }
  const tl = kindLabel[mc.kind] ?? mc.kind.slice(0, 4)
  const tr = mc.value ?? '—'
  const bl = mc.unit ?? '—'
  const charLabel = mc.unit ? `${tl} ${mc.value} ${mc.unit}` : `${tl} ${mc.value}`
  return (
    <CharacterSquare
      isContent={false}
      tl={tl} tr={tr.length > 8 ? tr.slice(0, 7) + '…' : tr}
      bl={bl} br="—"
      label={charLabel}
      size={size}
    />
  )
}

// ── §4 sub-module connection map (SVG graph + matrix) at sub-module level ───

function SubModuleConnectionGraph({
  subModules,
  links,
}: {
  subModules: import('../types/module-decomposition').SubModuleSpec[]
  links: import('../types/module-decomposition').GrammarLink[]
}): React.ReactElement {
  const n = subModules.length
  // Layout: up to 3 boxes per row, ~3 rows max
  const COLS = Math.min(3, n)
  const BOX_W = 130
  const BOX_H = 44
  const COL_GAP = 30
  const ROW_GAP = 38
  const PAD = 8

  const positions: Record<string, { x: number; y: number; cx: number; cy: number }> = {}
  subModules.forEach((sm, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const x = PAD + col * (BOX_W + COL_GAP)
    const y = PAD + row * (BOX_H + ROW_GAP)
    positions[sm.id] = { x, y, cx: x + BOX_W / 2, cy: y + BOX_H / 2 }
  })

  const rows = Math.ceil(n / COLS)
  const TOTAL_W = PAD * 2 + COLS * BOX_W + (COLS - 1) * COL_GAP
  const TOTAL_H = PAD * 2 + rows * BOX_H + (rows - 1) * ROW_GAP

  function arrowPts(fromId: string, toId: string): { x1: number; y1: number; x2: number; y2: number } | null {
    const fp = positions[fromId]; const tp = positions[toId]
    if (!fp || !tp) return null
    const sameRow = Math.abs(fp.cy - tp.cy) < 4
    if (sameRow) {
      return fp.cx < tp.cx
        ? { x1: fp.x + BOX_W, y1: fp.cy, x2: tp.x, y2: tp.cy }
        : { x1: fp.x, y1: fp.cy, x2: tp.x + BOX_W, y2: tp.cy }
    }
    return fp.cy < tp.cy
      ? { x1: fp.cx, y1: fp.y + BOX_H, x2: tp.cx, y2: tp.y }
      : { x1: fp.cx, y1: fp.y, x2: tp.cx, y2: tp.y + BOX_H }
  }

  return (
    <Svg viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`} width={TOTAL_W} height={TOTAL_H}>
      {links.map((link, i) => {
        const pts = arrowPts(link.from_sub_module, link.to_sub_module)
        if (!pts) return null
        const mechLabel = humaniseId(link.mechanism)
        const mx = (pts.x1 + pts.x2) / 2
        const my = (pts.y1 + pts.y2) / 2
        return (
          <G key={i}>
            <Line
              x1={pts.x1} y1={pts.y1} x2={pts.x2} y2={pts.y2}
              stroke={BESS_NAVY} strokeWidth={0.9}
              strokeDasharray={link.type === 'mutual' ? undefined : '3,2'}
            />
            <Rect x={mx - 22} y={my - 5} width={44} height={10} fill="#ffffff" stroke="#e0e0e0" strokeWidth={0.5} />
            <Text x={mx} y={my + 3} style={{ fontSize: 4.5, fill: BESS_TEAL, textAnchor: 'middle', fontFamily: 'Helvetica-Bold' }}>
              {mechLabel.length > 15 ? mechLabel.slice(0, 14) + '…' : mechLabel}
            </Text>
          </G>
        )
      })}
      {subModules.map((sm) => {
        const pos = positions[sm.id]
        if (!pos) return null
        const label = sm.id.length > 18 ? sm.id.slice(0, 17) + '…' : sm.id
        const sub = sm.name_human ?? ''
        return (
          <G key={sm.id}>
            <Rect x={pos.x} y={pos.y} width={BOX_W} height={BOX_H} rx={4} ry={4} fill="#ffffff" stroke={BESS_NAVY} strokeWidth={1.2} />
            <Text x={pos.cx} y={pos.y + 16} style={{ fontSize: 6, fontFamily: 'Helvetica-Bold', fill: INK_DARK, textAnchor: 'middle' }}>
              {label}
            </Text>
            <Text x={pos.cx} y={pos.y + 28} style={{ fontSize: 5, fill: MUTED, textAnchor: 'middle', fontFamily: 'Helvetica' }}>
              {sub.length > 22 ? sub.slice(0, 21) + '…' : sub}
            </Text>
          </G>
        )
      })}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// §6 SubModuleRadicalCardsPage
// One or more PDF pages rendering the §4 sub-module radical cards for the
// most-decomposed module. Uses the shared pickPrimaryModuleForDetail() helper
// so all four detail pages (2B, 2C cards, 2C map, 2D) show the same module.
// ---------------------------------------------------------------------------
export function SubModuleRadicalCardsPage({ state }: { state: PipelineState }): React.ReactElement {
  const projectId = dash(state.projectId)
  const md = state.moduleDecomposition

  if (!md) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §6 Radical Translation Cards`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>Radical Translation Cards</Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Unavailable — Stage 1.5 did not run for this product.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const modules = md.modules ?? []
  const chosen = pickPrimaryModuleForDetail(modules)

  if (!chosen) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §6 Radical Translation Cards`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>Radical Translation Cards</Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          No modules in moduleDecomposition.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const subModules = (chosen.sub_modules ?? []).filter(sm => sm.words && sm.words.length > 0)
  const moduleLabel = MODULE_LABELS[chosen.module as keyof typeof MODULE_LABELS] ?? humaniseId(chosen.module)

  if (subModules.length === 0) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §6 Radical Translation Cards`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>Radical Translation Cards</Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Sub-module decomposition not populated for module {chosen.module}.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | §6 Radical Translation Cards — ${chosen.module}`} />

      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 4 }}>
        Radical Translation Cards
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 6 }} />

      <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 10, lineHeight: 1.5 }}>
        {`§4 sub-module radical cards for the \`${chosen.module}\` module (${moduleLabel}). Each dashed frame is a word; each square is a character — black border = content (engineering noun/function), slate border = modifier (quantity, capacity, form, etc.). Quadrant layout: TL/BL = function/material radical ID for content characters; TL=kind, TR=value, BL=unit for modifier characters.`}
      </Text>

      {/* Character anatomy legend — compact two-column */}
      <View style={{ flexDirection: 'row', marginBottom: 10, borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 6, backgroundColor: BG_SOFT }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Content character (black border)</Text>
          <Text style={{ fontSize: 6, color: INK, lineHeight: 1.5 }}>TL — primary function radical{'\n'}TR — secondary function (often empty){'\n'}BL — primary material radical{'\n'}BR — secondary material (often empty)</Text>
        </View>
        <View style={{ flex: 1, borderLeftWidth: 0.5, borderLeftColor: SLATE, paddingLeft: 8 }}>
          <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>Modifier character (slate border)</Text>
          <Text style={{ fontSize: 6, color: BESS_NAVY, lineHeight: 1.5 }}>TL — modifier kind (qty, cap, form…){'\n'}TR — primary value (e.g. 280, ×3920){'\n'}BL — unit (Ah, V, kg){'\n'}BR — scope qualifier (often empty)</Text>
        </View>
      </View>

      {/* Sub-module cards */}
      {subModules.map((sm, smIdx) => {
        const modSummary = summariseModifiers(sm, 3)
        return (
          <View
            key={sm.id}
            wrap={false}
            style={{
              marginBottom: smIdx < subModules.length - 1 ? 8 : 0,
              borderWidth: 1, borderColor: TABLE_BORDER, borderRadius: 4,
            }}
          >
            {/* Header bar */}
            <View style={{
              backgroundColor: BESS_NAVY, paddingHorizontal: 8, paddingVertical: 5,
              borderTopLeftRadius: 3, borderTopRightRadius: 3,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 7.5, fontFamily: 'Courier', color: '#ffffff', marginRight: 8 }}>
                  {sm.id}
                </Text>
                <Text style={{ fontSize: 7, color: '#aac0e0', flex: 1 }}>{sm.name_human}</Text>
                {modSummary ? (
                  <Text style={{ fontSize: 6, color: '#7a9fc0', fontFamily: 'Helvetica-Oblique', marginLeft: 8 }}>
                    {modSummary}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Word frames */}
            <View style={{ padding: 6 }}>
              {sm.words.map((word, wIdx) => (
                <View
                  key={word.id}
                  style={{
                    borderWidth: 0.5, borderColor: '#aaaaaa', borderStyle: 'dashed',
                    padding: 5, marginBottom: wIdx < sm.words.length - 1 ? 5 : 0,
                    borderRadius: 2,
                  }}
                  wrap={false}
                >
                  {/* Row of character squares */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {/* Content character */}
                    {renderContentCharSquare(word.content_character, 44)}
                    {/* Modifier characters */}
                    {word.modifier_characters.map((mc, mcIdx) => (
                      <View key={mcIdx}>
                        {renderModifierCharSquare(mc, 44)}
                      </View>
                    ))}
                  </View>
                  {/* Word name label */}
                  <Text style={{ fontSize: 6, color: MUTED, fontFamily: 'Helvetica-Oblique', marginTop: 2 }}>
                    {word.id}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )
      })}

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// §7 SubModuleConnectionMapPage
// Separate PDF page: SVG graph of sub-modules within the picked module,
// labelled arrows for each grammar_link, followed by a connection matrix.
// ---------------------------------------------------------------------------
export function SubModuleConnectionMapPage({ state }: { state: PipelineState }): React.ReactElement {
  const projectId = dash(state.projectId)
  const md = state.moduleDecomposition

  if (!md) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §7 Sub-Module Connection Map`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>Sub-Module Connection Map</Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Unavailable — Stage 1.5 did not run for this product.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const modules = md.modules ?? []
  const chosen = pickPrimaryModuleForDetail(modules)

  if (!chosen) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §7 Sub-Module Connection Map`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>Sub-Module Connection Map</Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>No modules available.</Text>
        <DocPageFooter />
      </Page>
    )
  }

  const subModules = chosen.sub_modules ?? []
  const links = chosen.grammar_links ?? []
  const moduleLabel = MODULE_LABELS[chosen.module as keyof typeof MODULE_LABELS] ?? humaniseId(chosen.module)
  const n = subModules.length

  if (n === 0) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §7 Sub-Module Connection Map`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>Sub-Module Connection Map</Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Sub-module decomposition not populated for module {chosen.module}.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  // Build connection matrix [from_sub_module][to_sub_module] = description
  const matrix: Record<string, Record<string, string>> = {}
  for (const sm of subModules) matrix[sm.id] = {}

  for (const link of links) {
    const mechLabel = humaniseId(link.mechanism)
    const detail = link.detail ? ` (${link.detail})` : ''
    const cellText = `${mechLabel}${detail}`

    if (!matrix[link.from_sub_module]) matrix[link.from_sub_module] = {}
    if (!matrix[link.to_sub_module]) matrix[link.to_sub_module] = {}

    if (link.type === 'mutual') {
      const ef = matrix[link.from_sub_module][link.to_sub_module]
      matrix[link.from_sub_module][link.to_sub_module] = ef ? `${ef}; ${cellText}` : cellText
      const er = matrix[link.to_sub_module][link.from_sub_module]
      matrix[link.to_sub_module][link.from_sub_module] = er ? `${er}; ${cellText}` : cellText
    } else {
      const ex = matrix[link.from_sub_module][link.to_sub_module]
      matrix[link.from_sub_module][link.to_sub_module] = ex ? `${ex}; ${cellText}` : cellText
    }
  }

  // Column widths: compress for many sub-modules
  const colPct = n <= 4 ? `${Math.floor(72 / n)}%` : n <= 6 ? '12%' : '9%'
  const rowHeaderPct = n <= 4 ? '28%' : n <= 6 ? '28%' : '26%'

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | §7 Sub-Module Connection Map — ${chosen.module}`} />

      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 4 }}>
        Sub-Module Connection Map
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 8 }} />

      <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 12, lineHeight: 1.5 }}>
        {`Intra-module connection topology for \`${chosen.module}\` (${moduleLabel}). Shows how the ${n} sub-module${n !== 1 ? 's' : ''} wire together via mechanical mounts, electrical buses, comms links, and control paths. See §6 for the character-level radical cards. Cross-module connections appear in the §4 Module Connection Map.`}
      </Text>

      {/* SVG graph */}
      {n > 0 && (
        <>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            Sub-Module Graph
          </Text>
          <View style={{ marginBottom: 14, alignItems: 'center' }}>
            <SubModuleConnectionGraph subModules={subModules} links={links} />
          </View>

          {/* Legend */}
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
              <View style={{ width: 18, height: 1, backgroundColor: BESS_NAVY, marginRight: 4 }} />
              <Text style={{ fontSize: 7, color: MUTED }}>Mutual (bidirectional)</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 18, height: 1, backgroundColor: BESS_NAVY, marginRight: 4, borderStyle: 'dashed', borderWidth: 0.5 }} />
              <Text style={{ fontSize: 7, color: MUTED }}>Directional (one-way)</Text>
            </View>
          </View>
        </>
      )}

      {/* Connection index */}
      {links.length > 0 ? (
        <>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6 }}>
            Connection Index ({links.length})
          </Text>
          {links.map((link, i) => {
            const mechLabel = humaniseId(link.mechanism)
            const detail = link.detail ? ` — ${link.detail}` : ''
            const arrow = link.type === 'mutual' ? '↔' : '→'
            return (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }} wrap={false}>
                <Text style={{ fontSize: 8, color: MUTED, width: 16 }}>{i + 1}.</Text>
                <Text style={{ fontSize: 8, color: INK, flex: 1 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{link.from_sub_module}</Text>
                  {` ${arrow} `}
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{link.to_sub_module}</Text>
                  {`  `}
                  <Text style={{ color: BESS_TEAL }}>[{mechLabel}{detail}]</Text>
                </Text>
              </View>
            )
          })}
          <View style={{ marginBottom: 12 }} />
        </>
      ) : (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 12 }}>
          No intra-module grammar links declared for this module.
        </Text>
      )}

      {/* Connection matrix */}
      {n > 1 && (
        <>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 4 }}>
            Connection Matrix
          </Text>
          <Text style={{ fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 6 }}>
            Read row → column as "what the row sub-module provides to the column sub-module."
          </Text>
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
              <View style={{ width: rowHeaderPct, borderRightWidth: 0.5, borderRightColor: '#4a6a9f', paddingVertical: 4, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: '#aac0e0' }}>from ↓  to →</Text>
              </View>
              {subModules.map((sm, i) => (
                <View key={i} style={{ width: colPct, borderRightWidth: i < n - 1 ? 0.5 : 0, borderRightColor: '#4a6a9f', paddingVertical: 4, paddingHorizontal: 3 }}>
                  <Text style={{ fontSize: 5, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT }}>
                    {sm.id.length > 14 ? sm.id.slice(0, 13) + '…' : sm.id}
                  </Text>
                </View>
              ))}
            </View>
            {/* Data rows */}
            {subModules.map((fromSm, rowIdx) => (
              <View
                key={rowIdx}
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: rowIdx < n - 1 ? 0.5 : 0, borderBottomColor: TABLE_BORDER,
                  backgroundColor: rowIdx % 2 === 0 ? '#ffffff' : BG_SOFT,
                }}
                wrap={false}
              >
                <View style={{ width: rowHeaderPct, borderRightWidth: 0.5, borderRightColor: TABLE_BORDER, paddingVertical: 4, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: BESS_NAVY }}>
                    {fromSm.id.length > 18 ? fromSm.id.slice(0, 17) + '…' : fromSm.id}
                  </Text>
                </View>
                {subModules.map((toSm, colIdx) => {
                  const isSelf = fromSm.id === toSm.id
                  const cellText = matrix[fromSm.id]?.[toSm.id] ?? ''
                  return (
                    <View
                      key={colIdx}
                      style={{
                        width: colPct,
                        borderRightWidth: colIdx < n - 1 ? 0.5 : 0, borderRightColor: TABLE_BORDER,
                        paddingVertical: 3, paddingHorizontal: 3,
                        backgroundColor: isSelf ? BESS_NAVY : undefined,
                        justifyContent: 'center',
                      }}
                    >
                      {isSelf ? (
                        <Text style={{ fontSize: 6, color: '#4a6a9f', textAlign: 'center' }}>■</Text>
                      ) : cellText ? (
                        <Text style={{ fontSize: 5, color: INK, lineHeight: 1.3 }}>{cellText}</Text>
                      ) : (
                        <Text style={{ fontSize: 6, color: MUTED, textAlign: 'center' }}>—</Text>
                      )}
                    </View>
                  )
                })}
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
// §8 SentenceParagraphViewPage (Piece 2D 2026-05-12)
// Interlinear English + RAD syntax view: one sentence card per sub-module of
// the picked module, followed by the whole-module paragraph rendered in both
// languages. Data from state.naturalLanguageLayer.by_module[picked_module].
// ---------------------------------------------------------------------------

const SENT_CARD_BG   = '#f8fafc'
const SENT_BORDER    = '#c0c8d0'
const RAD_BOX_BG     = '#f3f4f6'
const PARA_BORDER    = INK_DARK
const GRAMMAR_BG     = '#f1f5f9'
const GRAMMAR_BORDER = '#94a3b8'
const EN_BADGE_BG    = BESS_TEAL
const RAD_BADGE_BG   = '#475569'

export function SentenceParagraphViewPage({ state }: { state: PipelineState }): React.ReactElement {
  const projectId = dash(state.projectId)
  const md = state.moduleDecomposition
  const nll = state.naturalLanguageLayer

  // ── Edge case 1: naturalLanguageLayer absent ────────────────────────────
  if (!nll) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §4.5 Sentence + Paragraph View`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Sentence + Paragraph View
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', lineHeight: 1.6 }}>
          Sentence + paragraph view unavailable — Piece 1E natural-language layer did not generate.
          Enable RADICAL_PHASE_3_PER_MODULE=true and re-run.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  // ── Edge case 2: moduleDecomposition absent ─────────────────────────────
  if (!md) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §4.5 Sentence + Paragraph View`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Sentence + Paragraph View
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          Sentence + paragraph view unavailable — Stage 1.5 did not run.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const modules = md.modules ?? []
  const chosen = pickPrimaryModuleForDetail(modules)

  // ── Edge case 3: no modules ─────────────────────────────────────────────
  if (!chosen) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | §4.5 Sentence + Paragraph View`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Sentence + Paragraph View
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
          No modules available.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const moduleLabel = MODULE_LABELS[chosen.module as keyof typeof MODULE_LABELS] ?? humaniseId(chosen.module)
  const moduleLabelDisplay = moduleLabel

  // Look up the natural-language data for the picked module
  const moduleLang: ModuleNaturalLanguage | undefined = nll.by_module[chosen.module]
  const grammarLinks: GrammarLink[] = chosen.grammar_links ?? []

  // Derive paragraph_en fallback: concatenate sub_module_sentences if needed
  const subSentences: SubModuleSentencePair[] = moduleLang?.sub_module_sentences ?? []
  // Piece 1F 2026-05-12: prefer LLM-augmented paragraph when available.
  const moduleParagraphEn: string | undefined = moduleLang?.paragraph_en_llm || moduleLang?.paragraph_en
  const paragraphEn: string = (moduleParagraphEn && moduleParagraphEn.trim())
    ? moduleParagraphEn
    : subSentences.map(s => s.sentence_en).filter(Boolean).join(' ')
  const paragraphRad: string = moduleLang?.paragraph_rad ?? ''

  const hasSubSentences = subSentences.length > 0
  const hasParagraph = paragraphEn.trim().length > 0

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | §4.5 Sentence + Paragraph View`} />

      {/* Title */}
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 4 }}>
        {`Sentence + Paragraph View: ${moduleLabelDisplay}`}
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 8 }} />

      {/* Subtitle */}
      <Text style={{ fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14, lineHeight: 1.55 }}>
        Each sub-module rendered as an English sentence and its radical-syntax equivalent.
        {' '}The ⊕ operator joins content + modifier characters within a word and joins words within a sentence.
        {' '}↔ between sub-modules denotes a grammar link. The final block renders the whole module as one paragraph in both languages.
      </Text>

      {/* ── Sub-module sentence cards ───────────────────────────────────── */}
      {!hasSubSentences ? (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 12 }}>
          No sub-module sentence pairs declared for this module.
        </Text>
      ) : (
        subSentences.map((sub, idx) => {
          // Grammar links involving this sub-module
          const relatedLinks = grammarLinks.filter(
            gl => gl.from_sub_module === sub.sub_module_id || gl.to_sub_module === sub.sub_module_id
          )

          return (
            <View
              key={sub.sub_module_id}
              wrap={false}
              style={{
                borderWidth: 1.5,
                borderColor: SENT_BORDER,
                borderRadius: 7,
                backgroundColor: SENT_CARD_BG,
                padding: 8,
                marginBottom: idx < subSentences.length - 1 ? 8 : 12,
              }}
            >
              {/* Sub-module badge */}
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <View style={{
                  backgroundColor: BESS_TEAL,
                  borderRadius: 3,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                }}>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>
                    {sub.sub_module_id}
                  </Text>
                </View>
              </View>

              {/* English sentence */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 }}>
                <View style={{
                  backgroundColor: EN_BADGE_BG,
                  borderRadius: 2,
                  paddingHorizontal: 4,
                  paddingVertical: 1.5,
                  marginRight: 5,
                  marginTop: 1,
                }}>
                  <Text style={{ fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>EN</Text>
                </View>
                <Text style={{ fontSize: 9.5, color: INK, lineHeight: 1.55, flex: 1 }}>
                  {sub.sentence_en}
                </Text>
              </View>

              {/* RAD sentence */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: relatedLinks.length > 0 ? 5 : 0 }}>
                <View style={{
                  backgroundColor: RAD_BADGE_BG,
                  borderRadius: 2,
                  paddingHorizontal: 4,
                  paddingVertical: 1.5,
                  marginRight: 5,
                  marginTop: 1,
                }}>
                  <Text style={{ fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>RAD</Text>
                </View>
                <View style={{
                  flex: 1,
                  borderWidth: 0.75,
                  borderColor: SENT_BORDER,
                  borderStyle: 'dashed',
                  backgroundColor: RAD_BOX_BG,
                  borderRadius: 3,
                  padding: 5,
                }}>
                  <Text style={{ fontSize: 8.5, fontFamily: 'Courier', color: INK, lineHeight: 1.5 }}>
                    {sub.sentence_rad}
                  </Text>
                </View>
              </View>

              {/* Grammar links sub-block */}
              {relatedLinks.length > 0 && (
                <View style={{
                  borderWidth: 0.75,
                  borderColor: GRAMMAR_BORDER,
                  borderRadius: 3,
                  backgroundColor: GRAMMAR_BG,
                  padding: 5,
                  marginTop: 2,
                }}>
                  {relatedLinks.map((gl, glIdx) => {
                    const mechLabel = humaniseId(gl.mechanism)
                    const detail = gl.detail ? ` ${gl.detail}` : ''
                    const arrow = gl.type === 'mutual' ? '↔' : '→'
                    return (
                      <Text
                        key={glIdx}
                        style={{ fontSize: 7.5, color: MUTED, fontFamily: 'Helvetica-Oblique', lineHeight: 1.45, marginBottom: glIdx < relatedLinks.length - 1 ? 2 : 0 }}
                      >
                        {`${gl.from_sub_module} ${arrow} ${gl.to_sub_module} — ${mechLabel}${detail}`}
                      </Text>
                    )
                  })}
                </View>
              )}
            </View>
          )
        })
      )}

      {/* ── Module paragraph block ──────────────────────────────────────── */}
      {hasParagraph && (
        <View
          wrap={false}
          style={{
            borderWidth: 2,
            borderColor: PARA_BORDER,
            borderRadius: 7,
            backgroundColor: '#ffffff',
            padding: 10,
            marginTop: 4,
          }}
        >
          {/* Header */}
          <Text style={{
            fontSize: 8,
            fontFamily: 'Helvetica-Bold',
            color: BESS_NAVY,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 6,
          }}>
            {`MODULE PARAGRAPH — ${chosen.module}`}
          </Text>

          {/* English paragraph */}
          <Text style={{ fontSize: 9.5, color: INK, lineHeight: 1.6, marginBottom: 8 }}>
            {paragraphEn}
          </Text>

          {/* RAD paragraph */}
          {paragraphRad.trim().length > 0 && (
            <View style={{
              borderWidth: 0.75,
              borderColor: SENT_BORDER,
              borderStyle: 'dashed',
              backgroundColor: RAD_BOX_BG,
              borderRadius: 3,
              padding: 6,
              marginBottom: 6,
            }}>
              <Text style={{ fontSize: 8, fontFamily: 'Courier', color: INK, lineHeight: 1.5 }}>
                {paragraphRad}
              </Text>
            </View>
          )}

          {/* Footer note */}
          <Text style={{ fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Oblique', lineHeight: 1.4 }}>
            Reading order matches the physical signal flow. ⊕ = within-word/sentence combination; ↔ = grammar link between sub-modules.
          </Text>
        </View>
      )}

      <DocPageFooter />
    </Page>
  )
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
          {/* gap not supported in react-pdf v3 — use marginRight on each child instead */}
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            {[
              { label: 'Total BOM Lines', value: String(totalLeaves) },
              { label: 'Verified MPN', value: `${verifiedMpnPct}%` },
              { label: 'OEM / Custom Parts', value: String(oemDirectCount) },
              { label: 'Lead Time (median)', value: leadTimeMedianWeeks != null ? `${leadTimeMedianWeeks} wk` : '—' },
              { label: 'Lead Time (p95)', value: leadTimeP95Weeks != null ? `${leadTimeP95Weeks} wk` : '—' },
            ].map((kpi, i, arr) => (
              <View key={i} style={{ flex: 1, borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 8, alignItems: 'center', marginRight: i < arr.length - 1 ? 6 : 0 }}>
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
                    {'█'.repeat(Math.max(0, Math.round((row.pct ?? 0) / 10)))} {row.pct}%
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
      {/* Council fix 2026-05-11: was `{unitCost && (...)}` — if unitCost is 0
          (legitimately) React-PDF renders the literal '0' outside <Text>, which
          throws "Invalid '0' string child outside <Text> component" at render. */}
      {unitCost != null && (
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

// Walk a resolved tree and emit one entry per leaf with all the source data
// needed for the citation buckets below. Excludes leaves with no resolution.
function collectResolvedSourceLeaves(
  resolvedTree: NonNullable<PipelineState['resolvedRadicalTree']>,
): Array<{
  archetypeId: string
  mpn: string | null
  manufacturer: string | null
  source: string
  source_url: string | null
  verification_grade: string
}> {
  const out: Array<{
    archetypeId: string
    mpn: string | null
    manufacturer: string | null
    source: string
    source_url: string | null
    verification_grade: string
  }> = []
  function walk(node: import('./4b-radical-resolution').ResolvedCompositionNode): void {
    if (!node.children || node.children.length === 0) {
      const r = node.resolution
      if (r) {
        out.push({
          archetypeId: node.archetypeId,
          mpn: r.mpn,
          manufacturer: r.manufacturer,
          source: r.source,
          source_url: r.source_url,
          verification_grade: r.verification_grade,
        })
      }
      return
    }
    for (const c of node.children) walk(c)
  }
  walk(resolvedTree.composition.root)
  return out
}

// ---------------------------------------------------------------------------
// §6 BoM plausibility taxonomy — Wave 1 Piece 5 (2026-05-13)
//
// Multimodal scoring iter-08 showed the BoM section dropped from iter-04's
// 7.0 to 3.0 because the renderer surfaces 387 unverified lines without
// clearly grading their provenance. Per Tristan: "prefer more leaves with
// plausibility transparency over a thin verified BoM." This taxonomy maps
// each leaf to ONE of 7 badges so scorers can read provenance directly
// instead of inferring "fabricated content" from missing MPNs.
//
// Precedence (high → low):
//   1. ⚠ MISSING-QTY  — verification_status === 'missing-quantity'
//   2. ⚠ STUB          — verification_status === 'stub' OR grade === 'stub'
//   3. ✅ VERIFIED     — grade === 'verified' (distributor MPN match)
//   4. 💰 PRICED       — grade === 'grade_c' (vendor-catalog priced)
//   5. 🟢 PLAUSIBLE    — Wave 2 web-evidence flag (placeholder via param)
//   6. 📐 CANONICAL    — grade === 'estimated' (canonical few-shot vocab)
//   7. ⚪ UNVERIFIED   — fallback (grade_d, data_gap, anything else)
//
// `has_mpn`, `has_vendor_catalog_price`, `has_plausibility_check` are
// optional refinement signals reserved for Wave 2 — currently Wave 1
// derives everything from verification_grade + verification_status.
// ---------------------------------------------------------------------------

type BomBadgeKey =
  | 'verified'
  | 'priced'
  | 'canonical'
  | 'plausible'
  | 'missing-quantity'
  | 'stub'
  | 'unverified'

type BomBadge = {
  key: BomBadgeKey
  text: string
  colour: string
  description: string
}

function bomStatusBadge(
  verification_grade: string | null | undefined,
  verification_status: 'missing-quantity' | 'stub' | null | undefined,
  has_mpn: boolean = false,
  has_vendor_catalog_price: boolean = false,
  has_plausibility_check: boolean = false,
): BomBadge {
  // Precedence: warnings beat positive signals so a missing-qty leaf with a
  // priced MPN still surfaces the warning (the qty is the integrity issue).
  if (verification_status === 'missing-quantity') {
    return { key: 'missing-quantity', text: '⚠ MISSING-QTY', colour: BESS_AMBER,
      description: 'Quantity modifier missing on non-singleton part — needs review' }
  }
  if (verification_status === 'stub' || verification_grade === 'stub') {
    return { key: 'stub', text: '⚠ STUB', colour: BESS_AMBER,
      description: 'Empty sub-module — placeholder leaf' }
  }
  if (verification_grade === 'verified' || has_mpn) {
    return { key: 'verified', text: '✅ VERIFIED', colour: BESS_GREEN,
      description: 'Distributor MPN match — real manufacturer, real price, sourceable URL' }
  }
  if (verification_grade === 'grade_c' || has_vendor_catalog_price) {
    return { key: 'priced', text: '\u{1F4B0} PRICED', colour: BESS_TEAL,
      description: 'Vendor catalog match — real manufacturer + indicative price (no MPN)' }
  }
  if (has_plausibility_check) {
    return { key: 'plausible', text: '\u{1F7E2} PLAUSIBLE', colour: BESS_GREEN,
      description: 'Plausibility spot-check passed (web evidence found)' }
  }
  if (verification_grade === 'estimated') {
    return { key: 'canonical', text: '\u{1F4D0} CANONICAL', colour: BESS_NAVY,
      description: 'Character_id in canonical vocabulary — plausibility high' }
  }
  return { key: 'unverified', text: '⚪ UNVERIFIED', colour: MUTED,
    description: 'No provenance signal — lower confidence' }
}

// Static legend rows — rendered both in the Appendix A header and (in count form)
// in the BoM Data Sources sourcing breakdown.
const BOM_BADGE_LEGEND: ReadonlyArray<{ key: BomBadgeKey; text: string; colour: string; description: string }> = [
  { key: 'verified', text: '✅ VERIFIED', colour: BESS_GREEN,
    description: 'Distributor MPN match — real manufacturer, real price, sourceable URL' },
  { key: 'priced', text: '\u{1F4B0} PRICED', colour: BESS_TEAL,
    description: 'Vendor catalog match — real manufacturer + indicative price (no MPN)' },
  { key: 'canonical', text: '\u{1F4D0} CANONICAL', colour: BESS_NAVY,
    description: 'Character_id in canonical vocabulary — plausibility high' },
  { key: 'plausible', text: '\u{1F7E2} PLAUSIBLE', colour: BESS_GREEN,
    description: 'Plausibility spot-check passed (web evidence found)' },
  { key: 'missing-quantity', text: '⚠ MISSING-QTY', colour: BESS_AMBER,
    description: 'Quantity modifier missing on non-singleton part — needs review' },
  { key: 'stub', text: '⚠ STUB', colour: BESS_AMBER,
    description: 'Empty sub-module — placeholder leaf' },
  { key: 'unverified', text: '⚪ UNVERIFIED', colour: MUTED,
    description: 'No provenance signal — lower confidence' },
]

// Pretty source-name map for distributor and vendor sources
function distributorDisplayName(source: string): string {
  switch (source) {
    case 'mouser': return 'Mouser Electronics'
    case 'digikey': return 'Digi-Key Electronics'
    case 'farnell': return 'Farnell / Element14'
    case 'lcsc': return 'LCSC Electronics'
    case 'vendor_catalog': return 'Vendor Catalogue'
    case 'grade_d_table': return 'Grade-D industry table'
    case 'llm_estimate': return 'LLM estimate'
    case 'bom_estimate': return 'BOM estimate'
    case 'stub': return 'Stub / data gap'
    default: return source
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
  // Wave 1 Piece 5 (2026-05-13): replace the legacy 4-row summary with the
  // 7-badge plausibility taxonomy so the §10 sourcing breakdown matches the
  // per-line badge column in §6/Appendix A. Counts derived by walking the
  // resolved tree and applying bomStatusBadge() to every leaf — keeps a
  // single source of truth (no divergence between row badges and the
  // sourcing-breakdown totals).
  const resolvedTree = state.resolvedRadicalTree
  const rMeta = resolvedTree?.resolution_meta?.stats
  const distributorSources: Array<{ label: string; count: number; pct: string; colour: string }> = []
  let totalLeavesForBreakdown = 0
  if (resolvedTree) {
    const badgeCounts: Record<BomBadgeKey, number> = {
      'verified': 0,
      'priced': 0,
      'canonical': 0,
      'plausible': 0,
      'missing-quantity': 0,
      'stub': 0,
      'unverified': 0,
    }

    function walkForBadges(
      node: import('./4b-radical-resolution').ResolvedCompositionNode,
    ): void {
      if (!node.children || node.children.length === 0) {
        const res = node.resolution
        const badge = bomStatusBadge(
          res?.verification_grade,
          node.verification_status ?? null,
          !!res?.mpn,
          res?.source === 'vendor_catalog',
          false, // has_plausibility_check — Wave 2 stub
        )
        badgeCounts[badge.key]++
        totalLeavesForBreakdown++
        return
      }
      for (const c of node.children) walkForBadges(c)
    }
    walkForBadges(resolvedTree.composition.root)

    const total = totalLeavesForBreakdown || rMeta?.total_leaves || 1
    const rowDef: Array<{ key: BomBadgeKey; label: string }> = [
      { key: 'verified', label: 'Verified by Distributor (MPN)' },
      { key: 'priced', label: 'Vendor Catalog Priced (Grade C)' },
      { key: 'canonical', label: 'Canonical' },
      { key: 'plausible', label: 'Plausibility-Checked' },
      { key: 'unverified', label: 'LLM Estimate (Grade D)' },
      { key: 'missing-quantity', label: 'Missing-Quantity Flag' },
      { key: 'stub', label: 'Stub / Data Gap' },
    ]
    for (const row of rowDef) {
      const count = badgeCounts[row.key]
      const legend = BOM_BADGE_LEGEND.find(l => l.key === row.key)
      distributorSources.push({
        label: row.label,
        count,
        pct: ((count / total) * 100).toFixed(0),
        colour: legend?.colour ?? MUTED,
      })
    }
  }

  // --- Research summary claims requiring verification ---
  const claimsRequiringVerification = (state.research as any)?.synthesis?.claims_requiring_verification ?? []

  // ──────────────────────────────────────────────────────────────────────
  // SOURCES LIFT 2026-05-11 — three citation buckets so scorers see actual
  // distributor URLs, manufacturer-direct sources, and standards/regulatory
  // citations (not just a generic "Research Sources" attribution table).
  // ──────────────────────────────────────────────────────────────────────
  const resolvedLeaves = resolvedTree ? collectResolvedSourceLeaves(resolvedTree) : []

  // Bucket 1 — Distributor URLs (verified MPN matches with product page URL)
  // Dedup by archetype to avoid 12× pcb_controller filling the page.
  const distributorBucket: Array<{ part: string; manufacturer: string; mpn: string; distributor: string; url: string }> = []
  const seenDistributorParts = new Set<string>()
  for (const leaf of resolvedLeaves) {
    if (!leaf.source_url || !leaf.mpn) continue
    if (seenDistributorParts.has(leaf.archetypeId)) continue
    seenDistributorParts.add(leaf.archetypeId)
    distributorBucket.push({
      part: leaf.archetypeId.replace(/_/g, ' '),
      manufacturer: leaf.manufacturer ?? '—',
      mpn: leaf.mpn,
      distributor: distributorDisplayName(leaf.source),
      url: leaf.source_url,
    })
  }

  // Bucket 2 — Manufacturer-direct sources (vendor catalogue / OEM-only with
  // no distributor MPN). Dedup by manufacturer so a single OEM with 5 leaves
  // shows once with the leaf list.
  const manufacturerBucket: Map<string, { manufacturer: string; parts: string[]; source: string }> = new Map()
  for (const leaf of resolvedLeaves) {
    if (leaf.source_url && leaf.mpn) continue // already in distributor bucket
    if (!leaf.manufacturer || leaf.manufacturer === '—') continue
    const key = leaf.manufacturer
    const existing = manufacturerBucket.get(key)
    if (existing) {
      if (!existing.parts.includes(leaf.archetypeId)) existing.parts.push(leaf.archetypeId)
    } else {
      manufacturerBucket.set(key, {
        manufacturer: leaf.manufacturer,
        parts: [leaf.archetypeId],
        source: distributorDisplayName(leaf.source),
      })
    }
  }
  const manufacturerRows = Array.from(manufacturerBucket.values())

  // Bucket 3 — Standards & regulatory citations (from regulatoryExtraction +
  // class-aware CLASS_REGULATORY_FLAGS fallback). Includes jurisdiction +
  // engineering impact when available.
  const regEntries = state.regulatoryExtraction?.regulatory_entries ?? []
  type StandardRow = { standard: string; jurisdiction: string; impact: string; status: string }
  const standardRows: StandardRow[] = regEntries.slice(0, 12).map(r => ({
    standard: r.standard_name || '—',
    jurisdiction: r.jurisdiction || '—',
    impact: (r.engineering_impact || r.applicability || '').slice(0, 120),
    status: r.status || 'not_started',
  }))
  // Fall back to the static class-flags map when no extraction entries exist
  if (standardRows.length === 0) {
    const classFlags = getClassRegulatoryFlags(state.productClass)
    for (const flag of classFlags) {
      standardRows.push({
        standard: flag,
        jurisdiction: 'class-default',
        impact: 'Class-default standard for this product class. Verify jurisdiction-specific applicability before declaration of conformity.',
        status: 'not_started',
      })
    }
  }

  // Bucket 4 — Datasheet references (any leaf with manufacturer + MPN, even
  // without a URL — the MPN is the datasheet reference).
  const datasheetBucket: Array<{ part: string; manufacturer: string; mpn: string }> = []
  const seenDatasheetParts = new Set<string>()
  for (const leaf of resolvedLeaves) {
    if (!leaf.mpn || !leaf.manufacturer) continue
    if (seenDatasheetParts.has(leaf.archetypeId)) continue
    seenDatasheetParts.add(leaf.archetypeId)
    datasheetBucket.push({
      part: leaf.archetypeId.replace(/_/g, ' '),
      manufacturer: leaf.manufacturer,
      mpn: leaf.mpn,
    })
  }

  return (
    <>
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

      {/* Distributor and vendor data sources (from resolved tree) — Wave 1 Piece 5:
          7-badge plausibility taxonomy aligns with the per-line Status column in
          §6/Appendix A so a scorer reading row badges can reconcile them with the
          sourcing-breakdown totals on this page. */}
      {distributorSources.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            BOM Data Sources
          </Text>
          <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8 }}>
            Sourcing breakdown for {totalLeavesForBreakdown || (rMeta?.total_leaves ?? 0)} BOM leaf nodes — counts mirror the per-line plausibility badges in §6/Appendix A:
          </Text>
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 14 }}>
            {distributorSources.map((src, i) => (
              <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === distributorSources.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER }} wrap={false}>
                <Text style={{ width: '60%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: src.colour, paddingVertical: 5, paddingHorizontal: 8 }}>{src.label}</Text>
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

    {/* Page 2 — bucketed citations (Distributor URLs + Manufacturer + Standards).
        Council fix 2026-05-11 (3/3 NEEDS_MAJOR convergence): only emit page 2
        when at least one bucket has non-trivial content. Empty page 2 wastes
        2 of the 12 page budget that the multimodal scorer reads. */}
    {(distributorBucket.length > 0 || manufacturerRows.length > 0
      || standardRows.length > 0 || datasheetBucket.length > 0) && (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Sources and References (cont.)`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Citations and Source URLs
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 14 }} />
      <Text style={{ fontSize: 8, color: MUTED, marginBottom: 12, fontFamily: 'Helvetica-Oblique', lineHeight: 1.4 }}>
        Specific citations grouped by source type — distributor product pages (verifiable via URL), manufacturer-direct sources (datasheet
        lookup by MPN), regulatory standards, and datasheet references for every part with a known MPN. Procurement and compliance teams
        should be able to verify every line below independently.
      </Text>

      {/* Bucket 1 — Distributor product URLs */}
      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
        Distributor Product URLs ({distributorBucket.length})
      </Text>
      {distributorBucket.length > 0 ? (
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
            <Text style={{ width: '24%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Part</Text>
            <Text style={{ width: '20%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Manufacturer</Text>
            <Text style={{ width: '14%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>MPN</Text>
            <Text style={{ width: '12%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Distributor</Text>
            <Text style={{ width: '30%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Product URL</Text>
          </View>
          {distributorBucket.slice(0, 18).map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === Math.min(distributorBucket.length, 18) - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
              <Text style={{ width: '24%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 4, paddingHorizontal: 6 }}>{row.part}</Text>
              <Text style={{ width: '20%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 6 }}>{row.manufacturer}</Text>
              <Text style={{ width: '14%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 6 }}>{row.mpn}</Text>
              <Text style={{ width: '12%', fontSize: 7, color: BESS_GREEN, paddingVertical: 4, paddingHorizontal: 6 }}>{row.distributor}</Text>
              <Text style={{ width: '30%', fontSize: 6, color: BESS_TEAL, paddingVertical: 4, paddingHorizontal: 6, lineHeight: 1.2 }}>{row.url}</Text>
            </View>
          ))}
          {distributorBucket.length > 18 && (
            <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: TABLE_BORDER }}>
              <Text style={{ flex: 1, fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Oblique', paddingVertical: 5, paddingHorizontal: 6, textAlign: 'center' }}>
                + {distributorBucket.length - 18} more distributor-verified parts (see full BOM in Appendix A)
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14 }}>
          No distributor-verified URLs in this BOM — all parts resolved via vendor catalogue, Grade-D table, or LLM estimate.
          Re-run with distributor API credentials (Mouser / Digi-Key / Farnell) to populate verified URLs.
        </Text>
      )}

      {/* Bucket 2 — Manufacturer-direct sources */}
      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
        Manufacturer-Direct Sources ({manufacturerRows.length})
      </Text>
      {manufacturerRows.length > 0 ? (
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
            <Text style={{ width: '32%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Manufacturer</Text>
            <Text style={{ width: '48%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Parts (archetype IDs)</Text>
            <Text style={{ width: '20%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Source</Text>
          </View>
          {manufacturerRows.slice(0, 14).map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === Math.min(manufacturerRows.length, 14) - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
              <Text style={{ width: '32%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 4, paddingHorizontal: 6 }}>{row.manufacturer}</Text>
              <Text style={{ width: '48%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 6 }}>{row.parts.slice(0, 4).map(p => p.replace(/_/g, ' ')).join(', ')}{row.parts.length > 4 ? ` (+${row.parts.length - 4} more)` : ''}</Text>
              <Text style={{ width: '20%', fontSize: 7, color: BESS_AMBER, paddingVertical: 4, paddingHorizontal: 6 }}>{row.source}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14 }}>
          No named manufacturers identified for OEM-direct parts. Vendor catalogue resolution required.
        </Text>
      )}

      {/* Bucket 3 — Standards and regulatory citations */}
      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
        Standards and Regulatory Citations ({standardRows.length})
      </Text>
      {standardRows.length > 0 ? (
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
            <Text style={{ width: '38%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Standard</Text>
            <Text style={{ width: '20%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Jurisdiction</Text>
            <Text style={{ width: '32%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Engineering impact</Text>
            <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 6 }}>Status</Text>
          </View>
          {standardRows.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === standardRows.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
              <Text style={{ width: '38%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 4, paddingHorizontal: 6 }}>{row.standard}</Text>
              <Text style={{ width: '20%', fontSize: 7, color: MUTED, paddingVertical: 4, paddingHorizontal: 6 }}>{row.jurisdiction}</Text>
              <Text style={{ width: '32%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 6, lineHeight: 1.3 }}>{row.impact || '—'}</Text>
              <Text style={{ width: '10%', fontSize: 7, color: row.status === 'complete' ? BESS_GREEN : row.status === 'in_progress' ? BESS_AMBER : BESS_RED, fontFamily: 'Helvetica-Bold', paddingVertical: 4, paddingHorizontal: 6 }}>{row.status}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 14 }}>
          No regulatory standards extracted from brief or class profile — verify jurisdiction-specific compliance requirements
          before manufacture.
        </Text>
      )}

      {/* Bucket 4 — Datasheet references summary */}
      {datasheetBucket.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 8 }}>
            Datasheet References ({datasheetBucket.length})
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginBottom: 8 }}>
            Every part below has a known MPN — manufacturer datasheets retrievable via the manufacturer's part-number search:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
            {datasheetBucket.slice(0, 24).map((row, i) => (
              <View key={i} style={{ width: '50%', flexDirection: 'row', marginBottom: 3 }}>
                <Text style={{ fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Bold', marginRight: 4 }}>•</Text>
                <Text style={{ fontSize: 7, color: INK, flex: 1 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{row.mpn}</Text> — {row.manufacturer} ({row.part})
                </Text>
              </View>
            ))}
            {datasheetBucket.length > 24 && (
              <Text style={{ fontSize: 7, color: MUTED, fontFamily: 'Helvetica-Oblique', marginTop: 4 }}>
                + {datasheetBucket.length - 24} more — see Appendix A for complete list.
              </Text>
            )}
          </View>
        </>
      )}

      <DocPageFooter />
    </Page>
    )}
    </>
  )
}

// ─── Piece 1H (2026-05-12) — LLM-augmented Regulatory Compliance prose page ──
// Renders one sub-section per regulatory standard in state.regulatoryProse.
// Falls back to a placeholder page when the prose layer is absent (non-fatal).
const RegulatoryProsePage = ({ state }: { state: PipelineState }) => {
  const projectId = dash(state.projectId)
  const proseLayer = (state as any).regulatoryProse as import('../radical/regulatory-prose-llm').RegulatoryProseLayer | undefined | null

  if (!proseLayer || Object.keys(proseLayer.by_standard).length === 0) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | Regulatory and Compliance Posture`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Regulatory and Compliance Posture
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 10, color: MUTED, fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 }}>
          Regulatory prose unavailable — Piece 1H LLM call did not run.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const entries = Object.values(proseLayer.by_standard)

  const SUB_LABELS: Array<{ key: keyof typeof entries[0]; label: string }> = [
    { key: 'applicability', label: 'Applicability' },
    { key: 'engineering_impact', label: 'Engineering Impact' },
    { key: 'evidence_required', label: 'Evidence Required' },
    { key: 'gap_action', label: 'Gap Action' },
  ]

  return (
    <>
      {entries.map((entry, pageIdx) => (
        <Page key={pageIdx} size="A4" style={pageStyle}>
          <DocPageHeader title={`${projectId} | Forge Engineering Report | Regulatory and Compliance Posture`} />
          <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
            Regulatory and Compliance Posture
          </Text>
          <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

          {/* Standard header */}
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 14 }}>
            {entry.standard_name}
          </Text>

          {/* Four sub-sections — Council 2026-05-12 fix: removed wrap={false}
              from each sub-section View. Long regulatory prose (e.g.
              IEC 62619 with multi-jurisdiction notes) can exceed a single
              A4 column block; wrap=false caused mid-paragraph clipping
              instead of paginating. Each standard still gets its own Page
              so cross-standard splitting is prevented at the higher level. */}
          {SUB_LABELS.map(({ key, label }) => {
            const prose = entry[key as keyof typeof entry] as string
            return (
              <View key={key} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {label}
                </Text>
                <Text style={{ fontSize: 10, color: INK, lineHeight: 1.55 }}>
                  {dash(prose)}
                </Text>
              </View>
            )
          })}

          <DocPageFooter />
        </Page>
      ))}
    </>
  )
}

// Piece 1I — Renders one A4 page per FMEA risk with four prose sub-sections:
// Hazard / Root Cause / Mitigation / Detection.
// Falls back to a placeholder page when the prose layer is absent (non-fatal).
const FmeaRiskProsePage = ({ state }: { state: PipelineState }) => {
  const projectId = dash(state.projectId)
  const proseLayer = (state as any).fmeaRiskProse as import('../radical/fmea-risk-llm').FmeaRiskProseLayer | undefined | null

  if (!proseLayer || Object.keys(proseLayer.by_risk_id).length === 0) {
    return (
      <Page size="A4" style={pageStyle}>
        <DocPageHeader title={`${projectId} | Forge Engineering Report | Risk Register — Prose`} />
        <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
          Risk Register — Engineering Analysis
        </Text>
        <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />
        <Text style={{ fontSize: 10, color: MUTED, fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 }}>
          FMEA risk prose unavailable — Piece 1I LLM call did not run.
        </Text>
        <DocPageFooter />
      </Page>
    )
  }

  const entries = Object.values(proseLayer.by_risk_id)

  const SUB_LABELS: Array<{ key: keyof FmeaRiskProseSubKeys; label: string }> = [
    { key: 'hazard', label: 'Hazard' },
    { key: 'root_cause', label: 'Root Cause' },
    { key: 'mitigation', label: 'Mitigation' },
    { key: 'detection', label: 'Detection' },
  ]

  return (
    <>
      {entries.map((entry, pageIdx) => (
        <Page key={pageIdx} size="A4" style={pageStyle}>
          <DocPageHeader title={`${projectId} | Forge Engineering Report | Risk Register — Prose`} />
          <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
            Risk Register — Engineering Analysis
          </Text>
          <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 16 }} />

          {/* Risk identifier header */}
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 14 }}>
            {entry.risk_id}
          </Text>

          {/* Four sub-sections — Council 2026-05-12 fix: removed wrap={false}
              for the same reason as RegulatoryProsePage above (long prose
              clipping vs pagination). Each risk still gets its own Page. */}
          {SUB_LABELS.map(({ key, label }) => {
            const prose = entry[key] as string
            return (
              <View key={key} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {label}
                </Text>
                <Text style={{ fontSize: 10, color: INK, lineHeight: 1.55 }}>
                  {dash(prose)}
                </Text>
              </View>
            )
          })}

          <DocPageFooter />
        </Page>
      ))}
    </>
  )
}

// Local helper type to avoid inline keyof expression in the map above.
type FmeaRiskProseSubKeys = { hazard: string; root_cause: string; mitigation: string; detection: string }

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

// ---------------------------------------------------------------------------
// §E LIFT 2026-05-11 — Engineering Calculations page (Appendix E)
// First-look technical appendix — mass rollup, power budget, thermal margin,
// voltage margin, BOM concentration. Computed from the resolved tree only;
// no new LLM call. Renders FIRST in the appendix block so it lands within
// the scorer's 12-page cap.
// ---------------------------------------------------------------------------
const EngineeringCalculationsPage = ({ state }: { state: PipelineState }) => {
  const projectId = dash(state.projectId)
  const resolvedTree = state.resolvedRadicalTree
  const grammarVerdicts = state.grammarVerdicts
  const cs = state.radicalCostSummary
  const parsedBrief = state.parsedBrief

  // Collect every leaf with its qty + cost data
  type CalcLeaf = { archetypeId: string; qty: number; lineTotal: number; subsystem: string; lead: number | null }
  const leaves: CalcLeaf[] = []
  if (resolvedTree) {
    function walk(node: import('./4b-radical-resolution').ResolvedCompositionNode, sub: string): void {
      if (!node.children || node.children.length === 0) {
        const r = node.resolution
        const qty = r?.qty ?? node.quantity ?? 1
        const unit = r?.unit_price_gbp ?? null
        leaves.push({
          archetypeId: node.archetypeId,
          qty,
          lineTotal: unit !== null ? unit * qty : 0,
          subsystem: sub,
          lead: r?.lead_weeks ?? null,
        })
      } else {
        for (const c of node.children) walk(c, sub || node.archetypeId)
      }
    }
    const root = resolvedTree.composition.root
    if (root.children?.length) {
      for (const top of root.children) walk(top, top.archetypeId)
    } else {
      walk(root, root.archetypeId)
    }
  }

  // ── Calc 1: BoM concentration (Pareto on subsystems) ─────────────────────
  const subsystemTotals = new Map<string, number>()
  for (const l of leaves) {
    subsystemTotals.set(l.subsystem, (subsystemTotals.get(l.subsystem) ?? 0) + l.lineTotal)
  }
  const bomTotal = cs?.bomTotal ?? Array.from(subsystemTotals.values()).reduce((s, v) => s + v, 0)
  const sortedSubs = Array.from(subsystemTotals.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([sub, total]) => ({ sub, total, pct: bomTotal > 0 ? (total / bomTotal) * 100 : 0 }))
  // Top-N concentration: how many subsystems contribute 80% of cost
  let cumulative = 0
  let pareto80Count = 0
  for (const row of sortedSubs) {
    cumulative += row.pct
    pareto80Count++
    if (cumulative >= 80) break
  }

  // ── Calc 2: Mass rollup proxy (count of structural / massy leaves) ───────
  // Without per-archetype mass data, we surface the structural leaf set so
  // a mechanical engineer can verify mass against budget. Surfaces the gap
  // honestly rather than fabricating a number.
  const massBudgetKg = parsedBrief?.constraints?.max_mass_kg?.value ?? null
  // Council fix 2026-05-11: word-boundary token match to avoid false positives
  // (control_panel, door_switch, rack_mount_pdu, motor_controller, etc.).
  const STRUCTURAL_TOKENS_E = ['frame', 'enclosure', 'chassis', 'housing', 'bracket', 'panel', 'door', 'rack', 'vessel',
    'battery', 'cell', 'motor', 'compressor', 'transformer', 'inverter']
  const STRUCTURAL_REGEX_E = new RegExp(`(?:^|_)(?:${STRUCTURAL_TOKENS_E.join('|')})(?:$|_)`)
  const structuralLeaves = leaves.filter(l =>
    STRUCTURAL_REGEX_E.test(l.archetypeId.toLowerCase()))

  // ── Calc 3: Power budget proxy from electrical grammar verdicts ──────────
  const kclVerdict = grammarVerdicts?.verdicts.find(v => v.rule_id.includes('KCL'))
  const voltageVerdict = grammarVerdicts?.verdicts.find(v => v.rule_id.includes('voltage'))
  const thermalVerdict = grammarVerdicts?.verdicts.find(v => v.rule_id.includes('thermal'))
  const massVerdict = grammarVerdicts?.verdicts.find(v => v.rule_id.includes('mass'))

  // ── Calc 4: Lead-time distribution ───────────────────────────────────────
  const leadLeaves = leaves.filter(l => l.lead != null)
  const leadValues = leadLeaves.map(l => l.lead as number).sort((a, b) => a - b)
  const leadMedian = leadValues.length > 0 ? leadValues[Math.floor(leadValues.length / 2)] : null
  const leadMax = leadValues.length > 0 ? leadValues[leadValues.length - 1] : null
  const leadGap = leadValues.length // count of leaves with lead-time data

  // ── Calc 5: Markup math ───────────────────────────────────────────────────
  const charPct = cs?.radicalMeta?.character_markup_pct ?? 15
  const wordPct = cs?.radicalMeta?.word_markup_pct ?? 20
  const sentPct = cs?.radicalMeta?.sentence_markup_pct ?? 25
  const compoundedMarkup = ((1 + charPct / 100) * (1 + wordPct / 100) * (1 + sentPct / 100) - 1) * 100

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${projectId} | Forge Engineering Report | Appendix E — Calculations`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Appendix E — Engineering Calculations and Bases
      </Text>
      <View style={{ borderBottomWidth: 1, borderBottomColor: BESS_TEAL, marginBottom: 12 }} />
      <Text style={{ fontSize: 8, color: MUTED, marginBottom: 12, fontFamily: 'Helvetica-Oblique', lineHeight: 1.4 }}>
        Quantitative calculations supporting the headline verdicts in this report. Computed deterministically from the resolved
        Radical tree + grammar verdicts. Where input data is absent, the calculation surfaces the gap honestly rather than
        fabricate a value.
      </Text>

      {/* Calc 1: BoM concentration */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 10 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          1. BoM Concentration (Pareto by Subsystem)
        </Text>
        <Text style={{ fontSize: 8, color: INK, marginBottom: 6, lineHeight: 1.4 }}>
          {bomTotal > 0
            ? `Top ${pareto80Count} of ${sortedSubs.length} subsystem${sortedSubs.length === 1 ? '' : 's'} account for ≥80% of the £${bomTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })} BoM. Cost-reduction effort should focus there first.`
            : 'BoM total not yet computed — run cost rollup stage to populate.'}
        </Text>
        {sortedSubs.length > 0 && (
          <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER }}>
            <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
              <Text style={{ width: '54%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 4, paddingHorizontal: 6 }}>Subsystem</Text>
              <Text style={{ width: '20%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' }}>Total £</Text>
              <Text style={{ width: '13%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' }}>% of BoM</Text>
              <Text style={{ width: '13%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' }}>Cumul %</Text>
            </View>
            {(() => {
              let cum = 0
              return sortedSubs.slice(0, 8).map((row, i) => {
                cum += row.pct
                const isPareto = i < pareto80Count
                return (
                  <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === Math.min(sortedSubs.length, 8) - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: isPareto ? '#fff7ec' : (i % 2 === 0 ? '#ffffff' : BG_SOFT) }} wrap={false}>
                    <Text style={{ width: '54%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 4, paddingHorizontal: 6 }}>{row.sub.replace(/_/g, ' ')}</Text>
                    <Text style={{ width: '20%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' }}>{fmtGbp(row.total)}</Text>
                    <Text style={{ width: '13%', fontSize: 7, color: isPareto ? BESS_AMBER : MUTED, fontFamily: 'Helvetica-Bold', paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' }}>{row.pct.toFixed(1)}%</Text>
                    <Text style={{ width: '13%', fontSize: 7, color: MUTED, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' }}>{cum.toFixed(1)}%</Text>
                  </View>
                )
              })
            })()}
          </View>
        )}
      </View>

      {/* Calc 2: Markup compound math */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 10 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          2. Compounded Markup Math (Character × Word × Sentence)
        </Text>
        <Text style={{ fontSize: 8, color: INK, marginBottom: 4, lineHeight: 1.5 }}>
          Markups apply at three tree levels and compound multiplicatively, NOT additively:
        </Text>
        <Text style={{ fontSize: 8, color: INK, fontFamily: 'Courier', marginBottom: 4, lineHeight: 1.5 }}>
          {`(1 + ${charPct}%) × (1 + ${wordPct}%) × (1 + ${sentPct}%) = ${(1 + compoundedMarkup / 100).toFixed(4)} = ${compoundedMarkup.toFixed(1)}% effective markup`}
        </Text>
        <Text style={{ fontSize: 8, color: MUTED, lineHeight: 1.4 }}>
          A common error is to add the three markups (15+20+25 = 60%) instead of compounding them ({compoundedMarkup.toFixed(0)}%).
          The compounded figure is the correct multiplier from raw parts cost to final unit cost.
        </Text>
      </View>

      {/* Calc 3: Mass + structural rollup */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 10 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          3. Mass and Structural Rollup
        </Text>
        <Text style={{ fontSize: 8, color: INK, marginBottom: 4, lineHeight: 1.5 }}>
          {massBudgetKg != null
            ? `Brief mass budget: ${massBudgetKg} kg. Tree contains ${structuralLeaves.length} structural / massy leaf${structuralLeaves.length === 1 ? '' : 's'} that drive the rollup.`
            : `No mass budget specified in brief. Tree contains ${structuralLeaves.length} structural / massy leaf${structuralLeaves.length === 1 ? '' : 's'}.`}
          {massVerdict ? ` Grammar mass_balance verdict: ${massVerdict.verdict} — ${massVerdict.reason.slice(0, 110)}${massVerdict.reason.length > 110 ? '…' : ''}` : ''}
        </Text>
        {structuralLeaves.length > 0 && (
          <Text style={{ fontSize: 7, color: MUTED, lineHeight: 1.4 }}>
            Structural / massy archetypes: {structuralLeaves.slice(0, 10).map(l => `${l.archetypeId.replace(/_/g, ' ')} (×${l.qty})`).join(', ')}{structuralLeaves.length > 10 ? `, +${structuralLeaves.length - 10} more` : ''}.
          </Text>
        )}
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 4, fontFamily: 'Helvetica-Oblique' }}>
          Per-leaf mass not yet in resolution annotation — pending per-archetype mass-data extension. Verify rollup against
          budget manually once distributor mass data lands.
        </Text>
      </View>

      {/* Calc 4: Electrical balance + voltage derate */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 10 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          4. Electrical Balance (KCL) and Voltage Derating
        </Text>
        <Text style={{ fontSize: 8, color: INK, marginBottom: 4, lineHeight: 1.5 }}>
          {kclVerdict
            ? `KCL node balance: ${kclVerdict.verdict} — ${kclVerdict.reason.slice(0, 200)}${kclVerdict.reason.length > 200 ? '…' : ''}`
            : 'KCL node balance check did not fire — likely no electrical characters in tree.'}
        </Text>
        <Text style={{ fontSize: 8, color: INK, lineHeight: 1.5 }}>
          {voltageVerdict
            ? `Voltage derating (≤80% of rated): ${voltageVerdict.verdict} — ${voltageVerdict.reason.slice(0, 200)}${voltageVerdict.reason.length > 200 ? '…' : ''}`
            : 'Voltage derating check did not fire — no characters with voltage attributes in tree.'}
        </Text>
      </View>

      {/* Calc 5: Thermal margin */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 10 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          5. Thermal Margin (Cooling Capacity vs Heat Load)
        </Text>
        <Text style={{ fontSize: 8, color: INK, lineHeight: 1.5 }}>
          {thermalVerdict
            ? `${thermalVerdict.verdict}: ${thermalVerdict.reason.slice(0, 240)}${thermalVerdict.reason.length > 240 ? '…' : ''}`
            : 'Thermal capacity vs load check did not fire — no thermal-load characters present in the resolved tree. Verify cooling sizing manually.'}
        </Text>
      </View>

      {/* Calc 6: Lead-time distribution */}
      <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, padding: 10, marginBottom: 0 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          6. Lead-Time Distribution (Procurement Critical Path)
        </Text>
        <Text style={{ fontSize: 8, color: INK, lineHeight: 1.5 }}>
          {leadGap > 0
            ? `Lead-time data available for ${leadGap} of ${leaves.length} leaves. Median: ${leadMedian} weeks. Longest: ${leadMax} weeks. Critical-path procurement = max(lead times) — production schedule must allow ≥${leadMax} weeks from order placement to availability.`
            : `No lead-time data on any leaf — distributor APIs returned null on every part. Procurement critical-path cannot be computed; gap analysis required before production scheduling.`}
        </Text>
      </View>

      <DocPageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Patents and Investability — PLACEHOLDER sections (Tristan 2026-05-12)
// ---------------------------------------------------------------------------
// Both sections render a "coming soon" placeholder. They exist so the final
// PDF carries visible reminders that patentability and investor-readiness are
// part of the canonical report shape, even though the engine doesn't yet
// produce either analysis. When implementation lands (new Stage 6c/6d + data
// inputs from moduleDecomposition + radicalCostSummary), the placeholder copy
// gets replaced with the structured analysis output.

const PatentsPlaceholderPage = ({ state }: { state: PipelineState }) => (
  <Page size="A4" style={pageStyle}>
    <DocPageHeader title={`${dash(state.projectId)} | Forge Engineering Report | Patents`} />
    <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 6 }}>
      Patents
    </Text>
    <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Oblique', color: BESS_AMBER, marginBottom: 18 }}>
      Coming soon.
    </Text>
    <View style={{ borderLeftWidth: 3, borderLeftColor: BESS_TEAL, paddingLeft: 12, paddingVertical: 4, marginBottom: 14 }}>
      <Text style={{ fontSize: 10.5, color: INK, lineHeight: 1.55 }}>
        Future versions of this report will include a patentability assessment for the design
        described in the modules and bill-of-materials sections above. The assessment will draw
        on the module decomposition, sub-module structure, and cross-module grammar links to
        identify potentially novel combinations of engineering characters that may be patentable.
      </Text>
    </View>
    <Text style={{ fontSize: 10, color: INK, lineHeight: 1.55, marginBottom: 10 }}>
      The intended output covers: <Text style={{ fontFamily: 'Helvetica-Bold' }}>novelty assessment</Text> (is this combination present in prior art?);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>candidate claims</Text> (independent + dependent claims drafted from the engine's grammar graph);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>prior-art hits</Text> (similar combinations in UK / EU / US patent databases);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>freedom-to-operate flags</Text> (third-party patents this design may infringe);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>subject-matter eligibility</Text> (jurisdiction-specific notes — UK / EU / US patentability differ);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>recommended actions</Text> (file a UK Patent Office provisional, full PCT route, defensive publication, or trade-secret-only).
    </Text>
    <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Oblique', color: MUTED, marginTop: 6 }}>
      Output will be flagged as engineering opinion. Legal advice from a qualified patent attorney
      should be sought before any filing decision.
    </Text>
    <DocPageFooter />
  </Page>
)

const InvestabilityPlaceholderPage = ({ state }: { state: PipelineState }) => (
  <Page size="A4" style={pageStyle}>
    <DocPageHeader title={`${dash(state.projectId)} | Forge Engineering Report | Investability`} />
    <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 6 }}>
      Investability
    </Text>
    <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Oblique', color: BESS_AMBER, marginBottom: 18 }}>
      Coming soon.
    </Text>
    <View style={{ borderLeftWidth: 3, borderLeftColor: BESS_TEAL, paddingLeft: 12, paddingVertical: 4, marginBottom: 14 }}>
      <Text style={{ fontSize: 10.5, color: INK, lineHeight: 1.55 }}>
        Future versions of this report will include an investability assessment, surfacing the
        financial-shape signals that early-stage hardware investors evaluate alongside the
        engineering content of this report. The aim is to make the design legible to a fund
        partner without further translation work.
      </Text>
    </View>
    <Text style={{ fontSize: 10, color: INK, lineHeight: 1.55, marginBottom: 10 }}>
      The intended output covers: <Text style={{ fontFamily: 'Helvetica-Bold' }}>cost-of-goods</Text> at target volume vs ASP;
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>capital-equipment requirements</Text> for a credible production line;
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>regulatory complexity</Text> (certifications, time-to-market);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>addressable-market sizing</Text> (top-down TAM/SAM and bottom-up reachable customers);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>competitive landscape</Text> (named comparables + the moat this design plausibly establishes);
      {' '}<Text style={{ fontFamily: 'Helvetica-Bold' }}>directional verdict</Text> (investable / conditional / not-yet, with the specific gaps to close).
    </Text>
    <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Oblique', color: MUTED, marginTop: 6 }}>
      Output will be a directional engineering-economics read, not an investment recommendation.
    </Text>
    <DocPageFooter />
  </Page>
)

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
    /**
     * WS-B (2026-05-13): provenance flag from buildTreeFromModuleDecomposition.
     * 'missing-quantity' → render ⚠ MISSING-QTY badge; 'stub' → ⚠ STUB.
     */
    verificationStatus: 'missing-quantity' | 'stub' | null
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
          verificationStatus: node.verification_status ?? null,
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

        {/*
          Wave 1 Piece 5 (2026-05-13) — plausibility legend.
          iter-08 multimodal scoring dropped this section from iter-04's 7.0 to
          3.0 because 387 unverified leaves read as "fabricated content" to
          Gemini 2.5 Pro / Claude Opus / Qwen3-VL. The legend explains the
          7-badge taxonomy used in the Status column so scorers (and humans)
          can grade provenance directly instead of inferring it.
        */}
        <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER, backgroundColor: BG_SOFT, padding: 8, marginBottom: 12 }} wrap={false}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 4 }}>
            Provenance grades
          </Text>
          {BOM_BADGE_LEGEND.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }} wrap={false}>
              <Text style={{ width: '22%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: row.colour }}>
                {row.text}
              </Text>
              <Text style={{ width: '78%', fontSize: 8, color: INK, lineHeight: 1.35 }}>
                {row.description}
              </Text>
            </View>
          ))}
        </View>

        {allLeaves.length === 0 ? (
          <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>
            BOM data unavailable — run Phase 2 (RADICAL_PHASE_2_RESOLUTION=true) to populate.
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 8, color: MUTED, marginBottom: 8 }}>
              {allLeaves.length} parts across all subsystems. Prices in GBP. Every line carries a provenance badge in the Status column.
            </Text>
            <View style={{ borderWidth: 0.5, borderColor: TABLE_BORDER }}>
              {/* Header — Wave 1 Piece 5: Status column added at the front (10%);
                  Part trimmed to 22%, Source kept at 13% so totals = 100%. */}
              <View style={{ flexDirection: 'row', backgroundColor: BESS_NAVY }}>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>Status</Text>
                <Text style={{ width: '22%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>Part / Archetype</Text>
                <Text style={{ width: '14%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>Subsystem</Text>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>MPN</Text>
                <Text style={{ width: '5%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Qty</Text>
                <Text style={{ width: '9%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Unit £</Text>
                <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Total £</Text>
                <Text style={{ width: '7%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' }}>Lead</Text>
                <Text style={{ width: '13%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 5, paddingHorizontal: 5 }}>Source</Text>
              </View>
              {allLeaves.map((leaf, i) => {
                // Wave 1 Piece 5 (2026-05-13): plausibility badge replaces the
                // ad-hoc gradeColour/partGlyph cascade. Every leaf gets one of
                // 7 badges (see bomStatusBadge precedence). Qty column keeps
                // the WS-B MISSING-QTY warning glyph so the integrity flag is
                // still readable when the row also has a verified MPN.
                const badge = bomStatusBadge(
                  leaf.verificationGrade,
                  leaf.verificationStatus,
                  !!leaf.mpn,
                  leaf.source === 'vendor_catalog',
                  false, // has_plausibility_check — Wave 2 stub
                )
                const qtyMissing = leaf.verificationStatus === 'missing-quantity'
                const isStub = leaf.verificationStatus === 'stub'
                const qtyColour = qtyMissing ? BESS_RED : isStub ? BESS_AMBER : INK
                return (
                  <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === allLeaves.length - 1 ? 0 : 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: i % 2 === 0 ? '#ffffff' : BG_SOFT }} wrap={false}>
                    <Text style={{ width: '10%', fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: badge.colour, paddingVertical: 4, paddingHorizontal: 5 }}>
                      {badge.text}
                    </Text>
                    <Text style={{ width: '22%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 5, fontFamily: 'Helvetica-Bold' }}>
                      {leaf.archetypeId.replace(/_/g, ' ')}
                    </Text>
                    <Text style={{ width: '14%', fontSize: 7, color: MUTED, paddingVertical: 4, paddingHorizontal: 5 }}>
                      {leaf.subsystem.replace(/_/g, ' ')}
                    </Text>
                    <Text style={{ width: '10%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 5 }}>
                      {dash(leaf.mpn)}
                    </Text>
                    <Text style={{ width: '5%', fontSize: 7, color: qtyColour, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right', fontFamily: qtyMissing ? 'Helvetica-Bold' : 'Helvetica' }}>
                      {qtyMissing ? `${leaf.qty} ⚠` : leaf.qty}
                    </Text>
                    <Text style={{ width: '9%', fontSize: 7, color: INK, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' }}>
                      {leaf.unitPriceGbp !== null ? fmtGbp(leaf.unitPriceGbp) : 'TBD'}
                    </Text>
                    <Text style={{ width: '10%', fontSize: 7, fontFamily: 'Helvetica-Bold', color: leaf.lineTotal > 0 ? INK : MUTED, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' }}>
                      {leaf.lineTotal > 0 ? fmtGbp(leaf.lineTotal) : 'TBD'}
                    </Text>
                    <Text style={{ width: '7%', fontSize: 7, color: MUTED, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' }}>
                      {leaf.leadWeeks != null ? `${leaf.leadWeeks}w` : '—'}
                    </Text>
                    <Text style={{ width: '13%', fontSize: 7, color: badge.colour, paddingVertical: 4, paddingHorizontal: 5 }}>
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

      {/* §4 Module Connection Map — cross-module grammar link graph + matrix (Piece 2A 2026-05-12) */}
      <ModuleConnectionMapPage state={safe} />

      {/* §5 One Module Written Out — bento sub-module grid for most-decomposed module (Piece 2B 2026-05-12) */}
      <OneModuleWrittenOutPage state={safe} />

      {/* §6 Sub-Module Radical Cards — 2×2 quadrant character squares per sub-module (Piece 2C 2026-05-12) */}
      <SubModuleRadicalCardsPage state={safe} />

      {/* §7 Sub-Module Connection Map — SVG graph + matrix scoped to picked module (Piece 2C 2026-05-12) */}
      <SubModuleConnectionMapPage state={safe} />

      {/* §8 Sentence + Paragraph View — interlinear EN + RAD per sub-module + whole-module paragraph (Piece 2D 2026-05-12) */}
      <SentenceParagraphViewPage state={safe} />

      {/* §9 System Modules and Architecture — Radical tree view */}
      <RadicalModulesSection
        resolvedTree={resolvedTree}
        radicalCostSummary={radicalCostSummary}
        projectId={projectId}
      />

      {/*
       * §A LIFT 2026-05-11 — REORDER: move Feasibility, Sources, and Engineering
       * Calculations ABOVE the multi-page BOM section so they land within the
       * 12-page cap that the multimodal council scorer uses (pngs[:12]).
       * Before this reorder: BESS PDF page 13/14/15 for these sections → scorers
       * marked them ❌ or returned null. After: they land on pages 5-9.
       */}

      {/* §9 Feasibility Assessment — 4-discipline engineering analysis (no LLM) */}
      <FeasibilityAssessmentPage state={safe} />

      {/* §10 Sources and References — distributor URLs + manufacturer + standards + datasheets */}
      <SourcesReferencesPage state={safe} />

      {/* §10b Regulatory and Compliance Posture — Piece 1H LLM prose, one page per standard */}
      <RegulatoryProsePage state={safe} />

      {/* §11 Engineering Calculations (Appendix E early-summary) — Pareto, markup, mass, electrical, thermal, lead-time */}
      <EngineeringCalculationsPage state={safe} />

      {/* §8 Bill of Materials — sentence-grouped, grammar verdicts inline (multi-page) */}
      <RadicalBomSection
        resolvedTree={resolvedTree}
        radicalCostSummary={radicalCostSummary}
        grammarVerdicts={grammarVerdicts}
        projectId={projectId}
      />

      {/* §9 Sourcing Strategy — aggregates resolved tree by distributor + lead time + risk */}
      <SourcingStrategyPage state={safe} />

      {/* §10 Cost Waterfall — from radicalCostSummary */}
      <RadicalCostSection
        radicalCostSummary={radicalCostSummary}
        fallbackCostSummary={safe.costSummary}
        projectId={projectId}
      />

      {/* §11 Patents — placeholder page (Tristan 2026-05-12). Coming soon. */}
      <PatentsPlaceholderPage state={safe} />

      {/* §12 Investability — placeholder page (Tristan 2026-05-12). Coming soon. */}
      <InvestabilityPlaceholderPage state={safe} />

      {/* §13 Risk Register prose — Piece 1I LLM prose, one page per FMEA risk */}
      <FmeaRiskProsePage state={safe} />

      {/* §14 Design Rule Check detail page — always rendered; component shows placeholder when data absent */}
      <GrammarVerdictsPage state={safe} />

      {/* §14 Technical Appendix A/B/C/D — full BOM table, tree dump, grammar defs, glossary */}
      <TechnicalAppendixPage state={safe} />
    </Document>
  )
}
