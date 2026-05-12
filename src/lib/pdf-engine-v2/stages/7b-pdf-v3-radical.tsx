/**
 * @file 7b-pdf-v3-radical.tsx — Phase 5: Radical-tree-consuming renderer
 *
 * Feature flag: RADICAL_PHASE_5_RENDER=true enables this path.
 *
 * When active, this renderer replaces the BOM, Modules, and Cost Waterfall
 * sections in the PDF with Radical-tree-structured equivalents:
 *
 *   BOM section     → sentence-grouped sub-tables (one box per sentence/subsystem),
 *                     words as sub-headings, characters as rows, leaves as part lines
 *   Grammar verdicts→ WARN: amber dashed border + footnote; BLOCK: red fracture row
 *   Cost Waterfall  → reads from state.radicalCostSummary instead of state.costSummary
 *   Modules section → paragraph → sentences → words tree (high-level architecture view)
 *
 * Council mandate D5: INCREMENTAL, NOT REWRITE.
 * - Existing per-class renderer (7-pdf-v3.tsx) is UNCHANGED.
 * - This file exports additive section components consumed by PdfRendererV3
 *   via a feature-flag branch. Both renderers coexist until Phase 7 cutover.
 *
 * Shadow mode (Phase 6): both renders run in parallel; diffs are surfaced.
 * Phase 7 cutover: PdfRendererV3 swaps to these sections unconditionally.
 *
 * Design notes:
 *   - PURELY ADDITIVE — no imports or mutations of 7-pdf-v3.tsx internals.
 *   - Grammar verdicts: PASS rules are NOT rendered (don't clutter with green noise).
 *   - WARN: amber dashed border around affected character row + footnote.
 *   - BLOCK: red bold fracture line break + filled red triangle badge + must-fix note.
 *   - Cost Waterfall: reads radicalCostSummary.radicalHierarchy for sentence subtotals.
 *   - Modules tree: paragraph → sentences → words bullet points (no characters/radicals).
 */
import React from 'react'
import { Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { normaliseState, safeNumber } from '../lib/safe-state'
import type { PipelineState } from '../types'
import type { RadicalCostSummary } from './4c-radical-cost-rollup'
import type { GrammarPassState, GrammarVerdict } from './4d-radical-grammar'
import type { ResolvedRadicalTree, ResolvedCompositionNode } from './4b-radical-resolution'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Check if Phase 5 Radical Renderer is enabled.
 * Must be set to exactly "true" (case-insensitive), "1", "yes", or "on".
 */
export function isPhase5RenderEnabled(): boolean {
  const raw = (process.env.RADICAL_PHASE_5_RENDER ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Design tokens — mirrors 7-pdf-v3.tsx tokens exactly (no import to avoid coupling)
// ---------------------------------------------------------------------------

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
const BG_SOFT     = '#f9fafb'
const HEADER_RULE = '#cccccc'

// ---------------------------------------------------------------------------
// Styles — radical-specific additions
// ---------------------------------------------------------------------------

const rs = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 66,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: '#ffffff',
    fontSize: 10,
  },
  pageHeader: {
    position: 'absolute',
    top: 16,
    left: 44,
    right: 44,
  },
  pageHeaderText: { fontSize: 8, color: MUTED, marginBottom: 4 },
  pageHeaderRule: { borderBottomWidth: 0.5, borderBottomColor: HEADER_RULE },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 0.5,
    borderTopColor: HEADER_RULE,
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: MUTED },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 14 },
  tealH2: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginTop: 18, marginBottom: 8 },
  tealH3: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginTop: 12, marginBottom: 6 },
  para: { fontSize: 10, lineHeight: 1.5, marginBottom: 8, color: INK },
  sectionLabel: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  kvTable: { borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 12 },
  kvRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: TABLE_BORDER },
  kvLabel: { width: '38%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, paddingVertical: 5, paddingHorizontal: 8 },
  kvValue: { width: '62%', fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 8, lineHeight: 1.4 },
  darkTable: { borderWidth: 0.5, borderColor: TABLE_BORDER, marginBottom: 12 },
  darkTHead: { flexDirection: 'row', backgroundColor: BESS_NAVY },
  darkTHC: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT, paddingVertical: 7, paddingHorizontal: 7 },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: TABLE_BORDER },
  tRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: BG_SOFT },
  tC: { fontSize: 9, color: INK, paddingVertical: 5, paddingHorizontal: 7, lineHeight: 1.3 },
  // Sentence box — one per subsystem
  sentenceBox: {
    borderWidth: 1,
    borderColor: TABLE_BORDER,
    marginBottom: 16,
  },
  sentenceHeader: {
    backgroundColor: BESS_NAVY,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sentenceTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: HEADER_TEXT },
  sentenceSubtotal: { fontSize: 9, color: HEADER_TEXT },
  // Word sub-heading within a sentence box
  wordHeader: {
    backgroundColor: '#e8f0fe',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
  },
  wordLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL },
  // Sub-module divider row within a sentence box (Piece 2E)
  subModDivider: {
    flexDirection: 'row',
    backgroundColor: BESS_TEAL,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
  },
  subModDividerText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: HEADER_TEXT,
    flex: 1,
  },
  // Character row styles — normal, WARN-bordered, BLOCK-fracture
  charRowNormal: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
  },
  charRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
    backgroundColor: BG_SOFT,
  },
  charRowWarn: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
    borderLeftWidth: 3,
    borderLeftColor: BESS_AMBER,
    borderTopWidth: 1,
    borderTopColor: BESS_AMBER,
    // dashed effect via opacity — react-pdf doesn't support borderStyle: 'dashed'
    // We simulate with amber solid left bar + opacity on background
    backgroundColor: '#fffbeb',
  },
  charRowBlock: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: BESS_RED,
    borderLeftWidth: 4,
    borderLeftColor: BESS_RED,
    borderTopWidth: 1.5,
    borderTopColor: BESS_RED,
    backgroundColor: '#fff1f2',
  },
  // Fracture line for BLOCK — full-width red separator
  fractureLine: {
    borderTopWidth: 2,
    borderTopColor: BESS_RED,
    marginVertical: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff1f2',
    flexDirection: 'row',
    alignItems: 'center',
  },
  fractureBadge: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: BESS_RED,
    marginRight: 8,
  },
  fractureText: {
    fontSize: 8,
    color: BESS_RED,
    lineHeight: 1.4,
    flex: 1,
  },
  // WARN footnote below a WARN row
  warnFootnote: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: '#fffbeb',
    borderBottomWidth: 0.5,
    borderBottomColor: BESS_AMBER,
  },
  warnFootnoteText: {
    fontSize: 7.5,
    color: BESS_AMBER,
    fontFamily: 'Helvetica-Oblique',
  },
  // Status badge
  statusBadge: { fontSize: 8, fontFamily: 'Helvetica-Bold', paddingVertical: 2 },
  // Sentence subtotal row
  sentenceTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f0f4ff',
    borderTopWidth: 0.5,
    borderTopColor: BESS_TEAL,
  },
  sentenceTotalText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_TEAL },
  // Sub-module sub-totals table (Piece 2E)
  subTotalsTable: { borderWidth: 0.5, borderColor: TABLE_BORDER, marginTop: 10, marginBottom: 6 },
  subTotalsHeader: { flexDirection: 'row', backgroundColor: '#e8f0fe' },
  subTotalsHC: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, paddingVertical: 5, paddingHorizontal: 7 },
  subTotalsRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: TABLE_BORDER },
  subTotalsRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: TABLE_BORDER, backgroundColor: BG_SOFT },
  subTotalsRowTotal: { flexDirection: 'row', backgroundColor: '#f0f4ff', borderTopWidth: 1, borderTopColor: BESS_TEAL },
  subTotalsCell: { fontSize: 8, color: INK, paddingVertical: 4, paddingHorizontal: 7, lineHeight: 1.3 },
  // Pricing context note (Piece 2E)
  pricingNote: {
    borderLeftWidth: 3,
    borderLeftColor: BESS_AMBER,
    backgroundColor: '#fffbe8',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 14,
  },
  pricingNoteLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#7a5500', marginBottom: 3 },
  pricingNoteText: { fontSize: 8, color: '#555555', lineHeight: 1.4 },
  // Grammar verdict summary banner
  grammarBanner: {
    borderWidth: 1,
    padding: 10,
    marginBottom: 14,
  },
  grammarBannerLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  grammarBannerText: { fontSize: 9, lineHeight: 1.4 },
  // Module tree item
  moduleTreeItem: { fontSize: 10, color: INK, marginBottom: 4, lineHeight: 1.4 },
  moduleTreeWord: { fontSize: 9, color: MUTED, marginLeft: 16, marginBottom: 2, lineHeight: 1.4 },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function fmtGbpDetailed(v: unknown): string {
  const n = safeNumber(v)
  if (n === null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function labelFromId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function sourceLabel(source: string | undefined | null): string {
  if (!source) return 'Unknown'
  const map: Record<string, string> = {
    mouser: 'Mouser',
    digikey: 'Digi-Key',
    farnell: 'Farnell',
    lcsc: 'LCSC',
    vendor_catalog: 'Vendor Catalog',
    llm_estimate: 'LLM Estimate',
    grade_d_table: 'Grade D Table',
    bom_estimate: 'BOM Estimate',
    stub: 'Stub',
    budget_exhausted: 'Budget Limit',
  }
  return map[source] ?? source
}

/** Map verification_grade to a status badge text and colour */
function gradeToStatus(grade: string | undefined): { text: string; colour: string } {
  switch (grade) {
    case 'verified':  return { text: '✓ VERIFIED', colour: BESS_GREEN }
    case 'estimated': return { text: '~ EST', colour: BESS_AMBER }
    case 'grade_d':   return { text: '~ EST D', colour: BESS_AMBER }
    case 'stub':      return { text: '~ STUB', colour: MUTED }
    case 'data_gap':
    default:          return { text: '? DATA GAP', colour: BESS_RED }
  }
}

// ---------------------------------------------------------------------------
// Primitive layout components (no coupling to 7-pdf-v3.tsx internals)
// ---------------------------------------------------------------------------

const PageHeader = ({ projectId, revision }: { projectId: string; revision?: string | null }) => (
  <View style={rs.pageHeader} fixed>
    <Text style={rs.pageHeaderText}>
      {dash(projectId)} | Forge Engineering Report (Radical v1) | {revision ?? 'Rev A'}
    </Text>
    <View style={rs.pageHeaderRule} />
  </View>
)

const PageFooter = () => (
  <View style={rs.footer} fixed>
    <Text style={rs.footerText} render={({ pageNumber }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber}`} />
  </View>
)

// ---------------------------------------------------------------------------
// Grammar verdict helpers
// ---------------------------------------------------------------------------

/**
 * Collect all WARN/BLOCK verdicts keyed by affected_node so the BOM renderer
 * can look up verdicts for a given character node in O(1).
 */
function buildVerdictMap(
  grammarVerdicts: GrammarPassState | undefined,
): Map<string, GrammarVerdict[]> {
  const map = new Map<string, GrammarVerdict[]>()
  if (!grammarVerdicts) return map

  for (const v of grammarVerdicts.verdicts) {
    if (v.verdict === 'PASS') continue  // PASS rules never rendered
    for (const nodeId of v.affected_nodes) {
      if (!map.has(nodeId)) map.set(nodeId, [])
      map.get(nodeId)!.push(v)
    }
    // Composition-level verdicts (affected_nodes empty) keyed under special marker
    if (v.affected_nodes.length === 0) {
      const key = `__composition__${v.rule_id}`
      map.set(key, [v])
    }
  }
  return map
}

/** Grammar verdict summary banner — shown at top of BOM section */
const GrammarVerdictSummaryBanner = ({ grammarVerdicts }: { grammarVerdicts: GrammarPassState }) => {
  const { warn_count, block_count, pass_count, overall_verdict } = grammarVerdicts
  const colour = block_count > 0 ? BESS_RED : warn_count > 0 ? BESS_AMBER : BESS_GREEN
  const verdict = overall_verdict === 'PASS' ? 'All grammar rules PASS'
    : overall_verdict === 'PASS_WITH_RELAXATION' ? 'Grammar: PASS with relaxations applied'
    : `Grammar: BLOCK — ${block_count} blocking issue(s) must be resolved`

  return (
    <View style={[rs.grammarBanner, { borderColor: colour }]} wrap={false}>
      <Text style={[rs.grammarBannerLabel, { color: colour }]}>Design Rule Check (DRC) Results</Text>
      <Text style={[rs.grammarBannerText, { color: colour }]}>{verdict.replace('grammar rules', 'design rules').replace('Grammar:', 'DRC:')}</Text>
      <Text style={[rs.grammarBannerText, { color: MUTED, marginTop: 4 }]}>
        {pass_count} PASS · {warn_count} WARN · {block_count} BLOCK
        {grammarVerdicts.relaxations_applied > 0 ? ` · ${grammarVerdicts.relaxations_applied} relaxation(s) applied` : ''}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Character row rendering — with WARN/BLOCK grammar overlay
// ---------------------------------------------------------------------------

interface CharRowProps {
  archetypeId: string
  label: string
  qty: number
  unitPriceGbp: number | null
  lineTotal: number
  verificationGrade: string
  source: string
  mpn?: string | null
  manufacturer?: string | null
  leadWeeks?: number | null
  rowIndex: number
  verdicts: GrammarVerdict[]  // verdicts affecting this node (filtered before passing)
}

const CharacterRow = ({
  archetypeId,
  label,
  qty,
  unitPriceGbp,
  lineTotal,
  verificationGrade,
  source,
  mpn,
  manufacturer,
  leadWeeks,
  rowIndex,
  verdicts,
}: CharRowProps) => {
  const status = gradeToStatus(verificationGrade)
  const hasWarn = verdicts.some(v => v.verdict === 'WARN')
  const hasBlock = verdicts.some(v => v.verdict === 'BLOCK')

  const rowStyle = hasBlock ? rs.charRowBlock
    : hasWarn ? rs.charRowWarn
    : rowIndex % 2 === 0 ? rs.charRowNormal
    : rs.charRowAlt

  const blockVerdicts = verdicts.filter(v => v.verdict === 'BLOCK')
  const warnVerdicts = verdicts.filter(v => v.verdict === 'WARN')

  // Lead time display: prefer integer weeks, fall back to dash
  const leadStr = leadWeeks != null ? `${leadWeeks} wk` : '—'

  // Grade display: use the raw verification_grade as a compact label
  function gradeLabel(g: string): string {
    switch (g) {
      case 'verified':  return 'Verified'
      case 'estimated': return 'Est.'
      case 'grade_d':   return 'Grade D'
      case 'stub':      return 'Stub'
      case 'data_gap':  return 'Gap'
      default:          return g || '—'
    }
  }

  return (
    <View wrap={false}>
      {/* BLOCK fracture line above the row */}
      {hasBlock && (
        <View style={rs.fractureLine}>
          <Text style={rs.fractureBadge}>▲ MUST FIX</Text>
          {blockVerdicts.map((bv, bi) => (
            <Text key={bi} style={rs.fractureText}>
              {bv.rule_id}: {bv.reason.slice(0, 200)}
            </Text>
          ))}
        </View>
      )}

      {/* Main row — 10 columns on A4 portrait with tight widths */}
      {/*
        Column widths (total = 100%):
        Status  8% | Part 20% | MPN 12% | Manufacturer 14% | Qty 5%
        Unit£  9%  | Line£ 9% | Source 11% | Lead 7% | Grade 5%
      */}
      <View style={rowStyle}>
        {/* Status badge */}
        <Text style={[rs.tC, { width: '8%', fontSize: 7 }]}>
          <Text style={[rs.statusBadge, { color: status.colour, fontSize: 7 }]}>{status.text}</Text>
        </Text>
        {/* Part name */}
        <Text style={[rs.tC, { width: '20%', fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>
          {labelFromId(label)}
          {hasWarn && !hasBlock && (
            <Text style={{ color: BESS_AMBER }}> ⚠</Text>
          )}
          {hasBlock && (
            <Text style={{ color: BESS_RED }}> ▲</Text>
          )}
        </Text>
        {/* MPN */}
        <Text style={[rs.tC, { width: '12%', fontSize: 8 }]}>{dash(mpn)}</Text>
        {/* Manufacturer */}
        <Text style={[rs.tC, { width: '14%', fontSize: 7.5, color: MUTED }]}>{dash(manufacturer)}</Text>
        {/* Qty */}
        <Text style={[rs.tC, { width: '5%', textAlign: 'right', fontSize: 8 }]}>{qty}</Text>
        {/* Unit £ */}
        <Text style={[rs.tC, { width: '9%', textAlign: 'right', fontSize: 8 }]}>
          {unitPriceGbp !== null ? fmtGbpDetailed(unitPriceGbp) : 'TBD'}
        </Text>
        {/* Line £ */}
        <Text style={[rs.tC, { width: '9%', textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>
          {lineTotal > 0 ? fmtGbp(lineTotal) : 'TBD'}
        </Text>
        {/* Source */}
        <Text style={[rs.tC, { width: '11%', color: status.colour, fontSize: 7.5 }]}>
          {sourceLabel(source)}
        </Text>
        {/* Lead time */}
        <Text style={[rs.tC, { width: '7%', fontSize: 7.5, color: MUTED }]}>{leadStr}</Text>
        {/* Grade */}
        <Text style={[rs.tC, { width: '5%', fontSize: 7, color: status.colour }]}>
          {gradeLabel(verificationGrade)}
        </Text>
      </View>

      {/* WARN footnote below row */}
      {hasWarn && (
        warnVerdicts.map((wv, wi) => (
          <View key={wi} style={rs.warnFootnote}>
            <Text style={rs.warnFootnoteText}>
              ⚠ {wv.rule_id}: {wv.reason.slice(0, 300)}
            </Text>
          </View>
        ))
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Sentence sub-table — one box per sentence/subsystem
// ---------------------------------------------------------------------------

interface LeafEntry {
  archetypeId: string
  label: string
  qty: number
  unitPriceGbp: number | null
  lineTotal: number
  verificationGrade: string
  source: string
  mpn?: string | null
  manufacturer?: string | null
  leadWeeks?: number | null
  sub_module_id?: string | null
}

interface SentenceBoxProps {
  sentenceId: string
  label: string
  leaves: LeafEntry[]
  sentenceTotal: number
  wordSubtotal: number
  sentenceMarkupGbp: number
  verdictMap: Map<string, GrammarVerdict[]>
  wordLabel?: string
}

/** Render a sub-module divider row spanning all 10 columns */
const SubModuleDividerRow = ({ subModuleId, leaves }: { subModuleId: string; leaves: LeafEntry[] }) => {
  const subTotal = leaves.reduce((s, l) => s + l.lineTotal, 0)
  const label = subModuleId === '<UNCATEGORISED>' || subModuleId === 'uncategorised' || subModuleId === '__none__'
    ? 'Uncategorised'
    : labelFromId(subModuleId)
  const description = `${label} — ${leaves.length} part${leaves.length !== 1 ? 's' : ''}${subTotal > 0 ? ' / ' + fmtGbp(subTotal) : ''}`

  return (
    <View style={rs.subModDivider} wrap={false}>
      <Text style={rs.subModDividerText}>{description}</Text>
    </View>
  )
}

/** Sub-module sub-totals compact table (Piece 2E) */
const SubModuleSubTotalsTable = ({ groups, sentenceTotal }: {
  groups: Array<{ subModuleId: string; leaves: LeafEntry[] }>
  sentenceTotal: number
}) => {
  const totalLines = groups.reduce((s, g) => s + g.leaves.length, 0)

  return (
    <View style={rs.subTotalsTable} wrap={false}>
      {/* Header */}
      <View style={rs.subTotalsHeader}>
        <Text style={[rs.subTotalsHC, { width: '46%' }]}>Sub-module</Text>
        <Text style={[rs.subTotalsHC, { width: '14%', textAlign: 'right' }]}>Lines</Text>
        <Text style={[rs.subTotalsHC, { width: '24%', textAlign: 'right' }]}>Sub-total £</Text>
        <Text style={[rs.subTotalsHC, { width: '16%', textAlign: 'right' }]}>% of module</Text>
      </View>
      {/* Data rows */}
      {groups.map((g, gi) => {
        const subTotal = g.leaves.reduce((s, l) => s + l.lineTotal, 0)
        const pct = sentenceTotal > 0 ? (subTotal / sentenceTotal) * 100 : 0
        const displayId = g.subModuleId === '<UNCATEGORISED>' || g.subModuleId === 'uncategorised' || g.subModuleId === '__none__'
          ? 'uncategorised'
          : g.subModuleId
        return (
          <View key={gi} style={gi % 2 === 0 ? rs.subTotalsRow : rs.subTotalsRowAlt}>
            <Text style={[rs.subTotalsCell, { width: '46%' }]}>{displayId}</Text>
            <Text style={[rs.subTotalsCell, { width: '14%', textAlign: 'right' }]}>{g.leaves.length}</Text>
            <Text style={[rs.subTotalsCell, { width: '24%', textAlign: 'right' }]}>{fmtGbp(subTotal)}</Text>
            <Text style={[rs.subTotalsCell, { width: '16%', textAlign: 'right' }]}>{pct.toFixed(2)} %</Text>
          </View>
        )
      })}
      {/* Total row */}
      <View style={rs.subTotalsRowTotal}>
        <Text style={[rs.subTotalsCell, { width: '46%', fontFamily: 'Helvetica-Bold' }]}>Module total</Text>
        <Text style={[rs.subTotalsCell, { width: '14%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{totalLines}</Text>
        <Text style={[rs.subTotalsCell, { width: '24%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{fmtGbp(sentenceTotal)}</Text>
        <Text style={[rs.subTotalsCell, { width: '16%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>100.00 %</Text>
      </View>
    </View>
  )
}

/** Pricing context note (Piece 2E) — hardcoded 25-unit batch context */
const PricingContextNote = () => (
  // Coding-council 2026-05-12 fix: pricing note de-hardcoded from BESS specifics
  // (was citing "£2,800 bms_master_pcb" verbatim — misleading on non-BESS products).
  // Now generic prose about batch-volume vs high-volume pricing applicable to any
  // product class. Per-product specific commentary deferred to a future piece that
  // reads brief batch size + product class and generates a per-class note.
  <View style={rs.pricingNote} wrap={false}>
    <Text style={rs.pricingNoteLabel}>Pricing note (batch-volume context):</Text>
    <Text style={rs.pricingNoteText}>
      Pricing reflects the annual batch volumes declared in the brief. High-volume equivalents
      (10,000+ units/year) typically land 30–40% lower for commodity components and 60–70% lower
      for custom-engineered subassemblies once non-recurring engineering (NRE) is amortised. Where
      a line item shows a high unit cost relative to comparable industrial parts, that gap usually
      reflects the small-batch order quantity rather than a fundamental cost-of-goods issue.
    </Text>
  </View>
)

/** Group leaves by sub_module_id — preserves insertion order of first occurrence */
function groupLeavesBySubModule(leaves: LeafEntry[]): Array<{ subModuleId: string; leaves: LeafEntry[] }> {
  const order: string[] = []
  const map = new Map<string, LeafEntry[]>()

  for (const leaf of leaves) {
    const key = leaf.sub_module_id ?? '__none__'
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(leaf)
  }

  return order.map(k => ({ subModuleId: k, leaves: map.get(k)! }))
}

/**
 * Determine whether sub-module grouping is meaningful:
 * returns true only if there is at least one non-null, non-sentinel sub_module_id
 * that is not '__none__' and is not the single "all uncategorised" case.
 */
function hasRealSubModules(leaves: LeafEntry[]): boolean {
  const ids = new Set(leaves.map(l => l.sub_module_id ?? '__none__'))
  // Filter out the sentinel/null group — if more than one real sub-module ID exists, it's meaningful
  const real = [...ids].filter(id => id !== '__none__' && id !== '<UNCATEGORISED>' && id !== 'uncategorised')
  return real.length > 1
}

const SentenceBox = ({
  sentenceId,
  label,
  leaves,
  sentenceTotal,
  wordSubtotal,
  sentenceMarkupGbp,
  verdictMap,
  wordLabel,
}: SentenceBoxProps) => {
  // 10-column header — tight widths for A4 portrait
  const bomCols = [
    { label: 'Status',   width: '8%' },
    { label: 'Part',     width: '20%' },
    { label: 'MPN',      width: '12%' },
    { label: 'Manufacturer', width: '14%' },
    { label: 'Qty',      width: '5%',  align: 'right' as const },
    { label: 'Unit £',   width: '9%',  align: 'right' as const },
    { label: 'Line £',   width: '9%',  align: 'right' as const },
    { label: 'Source',   width: '11%' },
    { label: 'Lead',     width: '7%' },
    { label: 'Grade',    width: '5%' },
  ]

  // Decide grouping mode
  const useSubModuleGrouping = hasRealSubModules(leaves)
  const groups = useSubModuleGrouping ? groupLeavesBySubModule(leaves) : null

  // Global row index counter for alternating row colours across groups
  let globalRowIndex = 0

  return (
    <View style={rs.sentenceBox}>
      {/* Sentence header — dark navy, full-width */}
      <View style={rs.sentenceHeader}>
        <Text style={rs.sentenceTitle}>{labelFromId(label)}</Text>
        <Text style={rs.sentenceSubtotal}>{fmtGbp(sentenceTotal)} total</Text>
      </View>

      {/* Optional word sub-heading (legacy path when no sub-module grouping) */}
      {!useSubModuleGrouping && wordLabel && wordLabel !== label && (
        <View style={rs.wordHeader}>
          <Text style={rs.wordLabel}>{labelFromId(wordLabel)}</Text>
        </View>
      )}

      {/* BOM table header */}
      <View style={[rs.darkTHead, { borderTopWidth: 0 }]}>
        {bomCols.map((col, ci) => (
          <Text
            key={ci}
            style={[rs.darkTHC, { width: col.width, textAlign: col.align || 'left', fontSize: 7.5, paddingHorizontal: 5 }]}
          >
            {col.label}
          </Text>
        ))}
      </View>

      {/* Part rows — with optional sub-module dividers */}
      {leaves.length === 0 ? (
        <View style={rs.tRow}>
          <Text style={[rs.tC, { width: '100%', color: MUTED, fontFamily: 'Helvetica-Oblique' }]}>
            No parts for this subsystem.
          </Text>
        </View>
      ) : useSubModuleGrouping && groups ? (
        // Sub-module grouped rendering
        groups.map((group, gi) => (
          <View key={gi}>
            <SubModuleDividerRow subModuleId={group.subModuleId} leaves={group.leaves} />
            {group.leaves.map((leaf, ri) => {
              const verdicts = verdictMap.get(leaf.archetypeId) ?? []
              const rowIdx = globalRowIndex++
              return (
                <CharacterRow
                  key={ri}
                  archetypeId={leaf.archetypeId}
                  label={leaf.label || leaf.archetypeId}
                  qty={leaf.qty}
                  unitPriceGbp={leaf.unitPriceGbp}
                  lineTotal={leaf.lineTotal}
                  verificationGrade={leaf.verificationGrade}
                  source={leaf.source}
                  mpn={leaf.mpn}
                  manufacturer={leaf.manufacturer}
                  leadWeeks={leaf.leadWeeks}
                  rowIndex={rowIdx}
                  verdicts={verdicts}
                />
              )
            })}
          </View>
        ))
      ) : (
        // Flat rendering (legacy / all-uncategorised)
        leaves.map((leaf, ri) => {
          const verdicts = verdictMap.get(leaf.archetypeId) ?? []
          return (
            <CharacterRow
              key={ri}
              archetypeId={leaf.archetypeId}
              label={leaf.label || leaf.archetypeId}
              qty={leaf.qty}
              unitPriceGbp={leaf.unitPriceGbp}
              lineTotal={leaf.lineTotal}
              verificationGrade={leaf.verificationGrade}
              source={leaf.source}
              mpn={leaf.mpn}
              manufacturer={leaf.manufacturer}
              leadWeeks={leaf.leadWeeks}
              rowIndex={ri}
              verdicts={verdicts}
            />
          )
        })
      )}

      {/* Sentence subtotal row */}
      <View style={rs.sentenceTotalRow}>
        <Text style={rs.sentenceTotalText}>
          Subsystem Parts: {fmtGbp(wordSubtotal)}
          {sentenceMarkupGbp > 0 ? `  +  Integration Markup: ${fmtGbp(sentenceMarkupGbp)}` : ''}
          {'  =  '}
          Subsystem Total: {fmtGbp(sentenceTotal)}
        </Text>
      </View>

      {/* Sub-module sub-totals table — only when we have real sub-module grouping */}
      {useSubModuleGrouping && groups && (
        <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginTop: 8, marginBottom: 2 }}>
            Sub-module sub-totals (per unit)
          </Text>
          <SubModuleSubTotalsTable groups={groups} sentenceTotal={wordSubtotal} />
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Radical BOM Section
// ---------------------------------------------------------------------------

/**
 * Collect all leaf nodes from a resolved tree node recursively.
 * Returns flat array of leaf data for rendering.
 * Piece 2E: extended with manufacturer, lead_weeks, sub_module_id.
 */
function collectLeavesFromNode(
  node: ResolvedCompositionNode,
): LeafEntry[] {
  const results: LeafEntry[] = []

  function walk(n: ResolvedCompositionNode): void {
    const isLeaf = !n.children || n.children.length === 0
    if (isLeaf) {
      const res = n.resolution
      const unitPrice = res?.unit_price_gbp ?? null
      const qty = res?.qty ?? n.quantity ?? 1
      const lineTotal = unitPrice !== null ? unitPrice * qty : 0
      results.push({
        archetypeId: n.archetypeId,
        label: n.archetypeId.replace(/_/g, ' '),
        qty,
        unitPriceGbp: unitPrice,
        lineTotal,
        verificationGrade: res?.verification_grade ?? 'data_gap',
        source: res?.source ?? 'stub',
        mpn: res?.mpn ?? null,
        manufacturer: res?.manufacturer ?? null,
        leadWeeks: res?.lead_weeks ?? null,
        sub_module_id: n.sub_module_id ?? null,
      })
    } else {
      for (const child of n.children) {
        walk(child)
      }
    }
  }
  walk(node)
  return results
}

/**
 * Radical BOM section — sentence-grouped sub-tables.
 *
 * Renders one SentenceBox per top-level child of the resolved tree root.
 * Uses radicalCostSummary.radicalHierarchy for subtotals (pre-computed by Phase 3).
 * Falls back to walking the resolved tree directly when hierarchy is absent.
 */
export const RadicalBomSection = ({
  resolvedTree,
  radicalCostSummary,
  grammarVerdicts,
  projectId,
}: {
  resolvedTree: ResolvedRadicalTree
  radicalCostSummary: RadicalCostSummary | undefined
  grammarVerdicts: GrammarPassState | undefined
  projectId: string
}) => {
  const verdictMap = buildVerdictMap(grammarVerdicts)
  const root = resolvedTree.composition.root

  // Build sentence groups from the resolved tree
  // If the root has children, each child is a sentence (subsystem)
  // If the root is flat (no children), treat root itself as a single sentence
  const sentenceNodes: ResolvedCompositionNode[] = root.children?.length
    ? root.children
    : [root]

  // Get pre-computed sentence totals from radicalCostSummary.radicalHierarchy
  const hierarchy = radicalCostSummary?.radicalHierarchy
  const sentenceCostMap = new Map<string, { sentenceTotal: number; wordSubtotal: number; sentenceMarkupGbp: number }>()
  if (hierarchy) {
    for (const sentence of hierarchy.sentences) {
      sentenceCostMap.set(sentence.sentenceId, {
        sentenceTotal: sentence.sentenceTotal,
        wordSubtotal: sentence.wordSubtotal,
        sentenceMarkupGbp: sentence.sentenceMarkupGbp,
      })
    }
  }

  // Total priced/unpriced stats
  let totalLeaves = 0
  let pricedLeaves = 0
  const bomTotal = radicalCostSummary?.bomTotal ?? 0

  // Collect all leaves across all sentences for stats
  for (const sentenceNode of sentenceNodes) {
    const leaves = collectLeavesFromNode(sentenceNode)
    totalLeaves += leaves.length
    pricedLeaves += leaves.filter(l => l.lineTotal > 0).length
  }

  return (
    <Page size="A4" style={rs.page}>
      <PageHeader projectId={dash(projectId)} revision="Rev A" />
      <Text style={rs.h1}>Bill of Materials — Radical Tree v1</Text>

      {/* Grammar verdict summary banner */}
      {grammarVerdicts && (
        <GrammarVerdictSummaryBanner grammarVerdicts={grammarVerdicts} />
      )}

      <Text style={rs.para}>
        BOM organised by system subsystem (sentence) → component group (word) → part (character).
        {' '}{totalLeaves} parts total ({pricedLeaves} priced, {totalLeaves - pricedLeaves} pending).
        {bomTotal > 0 ? ` Radical total: ${fmtGbp(bomTotal)}.` : ''}
      </Text>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
        <Text style={{ fontSize: 8, color: BESS_GREEN }}>✓ VERIFIED — distributor-priced MPN</Text>
        <Text style={{ fontSize: 8, color: BESS_AMBER }}>~ EST — LLM or Grade D estimate</Text>
        <Text style={{ fontSize: 8, color: BESS_RED }}>? DATA GAP — no price available</Text>
        <Text style={{ fontSize: 8, color: BESS_AMBER }}>⚠ WARN — grammar rule triggered</Text>
        <Text style={{ fontSize: 8, color: BESS_RED }}>▲ BLOCK — must-fix grammar issue</Text>
      </View>

      {/* One SentenceBox per subsystem */}
      {sentenceNodes.map((sentenceNode, si) => {
        const leaves = collectLeavesFromNode(sentenceNode)

        // Get word label from first word child (if tree is deep enough)
        const wordLabel = sentenceNode.children?.length
          ? sentenceNode.children[0]?.archetypeId
          : undefined

        // Get pre-computed subtotals, fall back to leaf summation
        const precomputed = sentenceCostMap.get(sentenceNode.archetypeId)
        const rawLeavesTotal = leaves.reduce((s, l) => s + l.lineTotal, 0)
        const sentenceTotal = precomputed?.sentenceTotal ?? rawLeavesTotal
        const wordSubtotal = precomputed?.wordSubtotal ?? rawLeavesTotal
        const sentenceMarkupGbp = precomputed?.sentenceMarkupGbp ?? 0

        return (
          <SentenceBox
            key={si}
            sentenceId={sentenceNode.archetypeId}
            label={sentenceNode.archetypeId}
            leaves={leaves}
            sentenceTotal={sentenceTotal}
            wordSubtotal={wordSubtotal}
            sentenceMarkupGbp={sentenceMarkupGbp}
            verdictMap={verdictMap}
            wordLabel={wordLabel}
          />
        )
      })}

      {/* Module total */}
      {bomTotal > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }} wrap={false}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK_DARK }}>
            RADICAL BOM TOTAL ({totalLeaves} parts, {pricedLeaves} priced): {fmtGbp(bomTotal)}
          </Text>
        </View>
      )}

      {/* Pricing context note — Piece 2E */}
      <PricingContextNote />

      <PageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Radical Cost Waterfall Section
// ---------------------------------------------------------------------------

/**
 * Cost Waterfall — reads from radicalCostSummary when Phase 5 flag is set.
 * Same visual structure as CostSection in 7-pdf-v3.tsx but data from Radical hierarchy.
 */
export const RadicalCostSection = ({
  radicalCostSummary,
  fallbackCostSummary,
  projectId,
}: {
  radicalCostSummary: RadicalCostSummary | undefined
  fallbackCostSummary: PipelineState['costSummary']
  projectId: string
}) => {
  // Use radical summary if available, else fall back to existing costSummary
  const cs = radicalCostSummary ?? fallbackCostSummary
  const isRadical = !!radicalCostSummary

  if (!cs) {
    return (
      <Page size="A4" style={rs.page}>
        <PageHeader projectId={dash(projectId)} revision="Rev A" />
        <Text style={rs.h1}>Cost Waterfall and Economics — Radical v1</Text>
        <Text style={[rs.para, { color: MUTED }]}>Cost computation pending.</Text>
        <PageFooter />
      </Page>
    )
  }

  const hierarchy = radicalCostSummary?.radicalHierarchy
  const meta = radicalCostSummary?.radicalMeta

  const bomTotal = cs.bomTotal
  const finalUnitCost = cs.finalUnitCost
  const ceilingCost = cs.ceilingCost
  const nreTotal = cs.nreTotal
  const isOverBudget = cs.isOverBudget
  const topDrivers = cs.topDrivers ?? []

  const headroom = (ceilingCost && finalUnitCost) ? ceilingCost - finalUnitCost : null
  const headroomPct = (ceilingCost && headroom) ? (headroom / ceilingCost) * 100 : null
  const headroomStr = headroom === null ? 'Pending'
    : headroom < 0
      ? `–${fmtGbp(Math.abs(headroom))} (${Math.abs(headroomPct ?? 0).toFixed(1)}% over budget)`
      : `+${fmtGbp(headroom)} (${(headroomPct ?? 0).toFixed(1)}% under budget)`

  // Sentence breakdown from radical hierarchy
  const sentenceRows = hierarchy?.sentences ?? Object.values(cs.byModule ?? {}).map(m => ({
    sentenceId: m.moduleName,
    label: m.moduleName,
    sentenceTotal: m.rawGbp,
    wordSubtotal: m.rawGbp,
    sentenceMarkupGbp: 0,
    words: [],
  }))

  // Summary KV rows
  const summaryRows = [
    { label: isRadical ? 'Radical BOM Total' : 'BOM Total', value: fmtGbp(bomTotal) },
    ...(meta ? [
      { label: 'Character Markup (PCB assembly)', value: `${meta.character_markup_pct}%` },
      { label: 'Word Markup (subsystem integration)', value: `${meta.word_markup_pct}%` },
      { label: 'Sentence Markup (system integration)', value: `${meta.sentence_markup_pct}%` },
    ] : []),
    { label: 'Estimated Unit Cost (loaded)', value: fmtGbp(finalUnitCost) },
    { label: 'Target Ceiling', value: ceilingCost ? fmtGbp(ceilingCost) : 'Not specified' },
    { label: 'Headroom vs Ceiling', value: headroomStr },
    ...(nreTotal > 0 ? [{ label: 'NRE (non-recurring)', value: fmtGbp(nreTotal) }] : []),
    ...(meta ? [{ label: 'Priced Leaves', value: `${meta.priced_leaves} / ${meta.total_leaves}` }] : []),
  ]

  return (
    <Page size="A4" style={rs.page}>
      <PageHeader projectId={dash(projectId)} revision="Rev A" />
      <Text style={rs.h1}>Cost Waterfall and Economics — Radical v1</Text>

      {isOverBudget && (
        <View style={{ borderWidth: 1.5, borderColor: BESS_RED, padding: 10, marginBottom: 14 }} wrap={false}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_RED, marginBottom: 4 }}>
            OVER BUDGET
          </Text>
          <Text style={{ fontSize: 9, color: BESS_RED }}>
            Unit cost {fmtGbp(finalUnitCost)} exceeds ceiling {fmtGbp(ceilingCost)}.
            Overshoot: {fmtGbp(Math.abs(headroom ?? 0))} ({Math.abs(headroomPct ?? 0).toFixed(1)}%).
            See top cost drivers below for reduction paths.
          </Text>
        </View>
      )}

      {/* Cost summary KV */}
      <Text style={rs.tealH2}>Cost Summary</Text>
      <View style={rs.kvTable}>
        {summaryRows.map((row, i) => (
          <View key={i} style={[rs.kvRow, i === summaryRows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
            <Text style={rs.kvLabel}>{row.label}</Text>
            <Text style={rs.kvValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* Sentence (subsystem) breakdown */}
      {sentenceRows.length > 0 && (
        <>
          <Text style={rs.tealH2}>Cost by Subsystem</Text>
          <View style={rs.darkTable}>
            <View style={rs.darkTHead}>
              <Text style={[rs.darkTHC, { width: '46%' }]}>Subsystem</Text>
              <Text style={[rs.darkTHC, { width: '20%', textAlign: 'right' }]}>Parts Cost</Text>
              <Text style={[rs.darkTHC, { width: '18%', textAlign: 'right' }]}>Integration</Text>
              <Text style={[rs.darkTHC, { width: '16%', textAlign: 'right' }]}>Subsystem Total</Text>
            </View>
            {sentenceRows.map((sentence, ri) => (
              <View key={ri} style={ri % 2 === 0 ? rs.tRow : rs.tRowAlt} wrap={false}>
                <Text style={[rs.tC, { width: '46%', fontFamily: 'Helvetica-Bold' }]}>
                  {labelFromId(sentence.label)}
                </Text>
                <Text style={[rs.tC, { width: '20%', textAlign: 'right' }]}>
                  {fmtGbp(sentence.wordSubtotal)}
                </Text>
                <Text style={[rs.tC, { width: '18%', textAlign: 'right', color: MUTED }]}>
                  {sentence.sentenceMarkupGbp > 0 ? `+${fmtGbp(sentence.sentenceMarkupGbp)}` : '—'}
                </Text>
                <Text style={[rs.tC, { width: '16%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {fmtGbp(sentence.sentenceTotal)}
                </Text>
              </View>
            ))}
            {/* BOM Total row */}
            <View style={[rs.tRow, { backgroundColor: '#e8f0fe' }]} wrap={false}>
              <Text style={[rs.tC, { width: '46%', fontFamily: 'Helvetica-Bold', color: BESS_TEAL }]}>
                RADICAL BOM TOTAL
              </Text>
              <Text style={[rs.tC, { width: '20%', textAlign: 'right' }]}>—</Text>
              <Text style={[rs.tC, { width: '18%', textAlign: 'right' }]}>—</Text>
              <Text style={[rs.tC, { width: '16%', textAlign: 'right', fontFamily: 'Helvetica-Bold', color: BESS_TEAL }]}>
                {fmtGbp(bomTotal)}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* Top cost drivers */}
      {topDrivers.length > 0 && (
        <>
          <Text style={rs.tealH2}>Top Cost Drivers</Text>
          <View style={rs.darkTable}>
            <View style={rs.darkTHead}>
              <Text style={[rs.darkTHC, { width: '46%' }]}>Part / Archetype</Text>
              <Text style={[rs.darkTHC, { width: '20%', textAlign: 'right' }]}>Total Cost</Text>
              <Text style={[rs.darkTHC, { width: '16%', textAlign: 'right' }]}>% of BOM</Text>
              <Text style={[rs.darkTHC, { width: '18%' }]}>Grade</Text>
            </View>
            {topDrivers.map((driver, ri) => (
              <View key={ri} style={ri % 2 === 0 ? rs.tRow : rs.tRowAlt} wrap={false}>
                <Text style={[rs.tC, { width: '46%', fontFamily: 'Helvetica-Bold' }]}>{dash(driver.partName)}</Text>
                <Text style={[rs.tC, { width: '20%', textAlign: 'right' }]}>{fmtGbp(driver.totalGbp)}</Text>
                <Text style={[rs.tC, { width: '16%', textAlign: 'right' }]}>{driver.pct.toFixed(1)}%</Text>
                <Text style={[rs.tC, { width: '18%', color: MUTED }]}>{dash(driver.costSource)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {meta && (
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 8 }}>
          Computed at {meta.computed_at}. Markups: character +{meta.character_markup_pct}%, word +{meta.word_markup_pct}%, sentence +{meta.sentence_markup_pct}%.
          {meta.unpriced_leaves > 0 ? ` ${meta.unpriced_leaves} leaves unpriced — totals are lower bounds.` : ''}
        </Text>
      )}

      <PageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Radical Modules Section — tree visualisation (paragraph → sentences → words)
// ---------------------------------------------------------------------------

/**
 * System Modules and Architecture — tree visualisation.
 *
 * Top level: paragraph (product system)
 * Children: sentences (system modules / subsystems)
 * Each sentence: constituent words as bullet points
 *
 * Characters and radicals are in the BOM section. This section gives the
 * high-level architecture view only.
 */
export const RadicalModulesSection = ({
  resolvedTree,
  radicalCostSummary,
  projectId,
}: {
  resolvedTree: ResolvedRadicalTree
  radicalCostSummary: RadicalCostSummary | undefined
  projectId: string
}) => {
  const root = resolvedTree.composition.root
  const description = resolvedTree.composition.description
  const productClass = resolvedTree.resolution_meta?.product_class ?? 'System'
  const hierarchy = radicalCostSummary?.radicalHierarchy

  // Build sentence entries with optional word children
  const sentenceNodes: ResolvedCompositionNode[] = root.children?.length ? root.children : [root]

  return (
    <Page size="A4" style={rs.page}>
      <PageHeader projectId={dash(projectId)} revision="Rev A" />
      <Text style={rs.h1}>System Modules and Architecture — Radical v1</Text>

      {/* System overview */}
      <View style={{ borderWidth: 1, borderColor: BESS_TEAL, padding: 10, marginBottom: 16, backgroundColor: '#eff6ff' }} wrap={false}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 4 }}>
          {labelFromId(productClass)}
        </Text>
        <Text style={{ fontSize: 9, color: INK }}>{dash(description)}</Text>
        {resolvedTree.composition.environment?.length > 0 && (
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>
            Environment: {resolvedTree.composition.environment.join(' · ')}
          </Text>
        )}
      </View>

      {/* Sentence tree */}
      <Text style={rs.tealH2}>Subsystem Breakdown</Text>
      <Text style={[rs.para, { color: MUTED }]}>
        Each subsystem (sentence) contains component groups (words). Parts are in the BOM section.
      </Text>

      {sentenceNodes.map((sentenceNode, si) => {
        const sentenceCostEntry = hierarchy?.sentences.find(s => s.sentenceId === sentenceNode.archetypeId)
        const sentenceTotal = sentenceCostEntry?.sentenceTotal

        // Gather word-level children (direct children of sentence node that have their own children)
        const wordNodes = sentenceNode.children?.filter(c => c.children?.length > 0) ?? []
        // Also include flat children that are leaves
        const flatLeaves = sentenceNode.children?.filter(c => !c.children || c.children.length === 0) ?? []

        return (
          <View key={si} style={{ marginBottom: 12 }} wrap={false}>
            {/* Sentence heading */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ width: 12, height: 12, backgroundColor: BESS_NAVY, marginRight: 8, borderRadius: 2 }} />
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: BESS_NAVY, flex: 1 }}>
                {labelFromId(sentenceNode.archetypeId)}
              </Text>
              {sentenceTotal && (
                <Text style={{ fontSize: 9, color: MUTED }}>
                  {fmtGbp(sentenceTotal)}
                </Text>
              )}
            </View>

            {/* Word children as bullet points */}
            {wordNodes.map((wordNode, wi) => {
              const wordCostEntry = sentenceCostEntry?.words.find(w => w.wordId === wordNode.archetypeId)
              const leafCount = collectLeavesFromNode(wordNode).length
              return (
                <View key={wi} style={{ flexDirection: 'row', marginLeft: 20, marginBottom: 3 }}>
                  <Text style={{ fontSize: 9, color: MUTED, marginRight: 6 }}>—</Text>
                  <Text style={{ fontSize: 9, color: INK, flex: 1 }}>
                    {labelFromId(wordNode.archetypeId)}
                    <Text style={{ color: MUTED }}>{' '}({leafCount} part{leafCount !== 1 ? 's' : ''}</Text>
                    {wordCostEntry ? (
                      <Text style={{ color: MUTED }}>{', '}
                        {fmtGbp(wordCostEntry.wordTotal)}
                        {')'}</Text>
                    ) : (
                      <Text style={{ color: MUTED }}>{')'}</Text>
                    )}
                  </Text>
                </View>
              )
            })}

            {/* Flat leaves (no word intermediary) */}
            {flatLeaves.length > 0 && (
              <View style={{ flexDirection: 'row', marginLeft: 20, marginBottom: 3 }}>
                <Text style={{ fontSize: 9, color: MUTED, marginRight: 6 }}>—</Text>
                <Text style={{ fontSize: 9, color: INK }}>
                  {flatLeaves.length} component{flatLeaves.length !== 1 ? 's' : ''} (flat — see BOM)
                </Text>
              </View>
            )}
          </View>
        )
      })}

      {/* Resolution stats */}
      {resolvedTree.resolution_meta?.stats && (
        <>
          <Text style={rs.tealH2}>Resolution Statistics</Text>
          <View style={rs.kvTable}>
            {([
              ['Total Parts', resolvedTree.resolution_meta.stats.total_leaves],
              ['Verified by Distributor', resolvedTree.resolution_meta.stats.verified_by_distributor],
              ['From Vendor Catalog', resolvedTree.resolution_meta.stats.from_vendor_catalog],
              ['LLM Estimate', resolvedTree.resolution_meta.stats.from_llm_estimate],
              ['Grade D Table', resolvedTree.resolution_meta.stats.grade_d],
              ['Stub / Data Gap', resolvedTree.resolution_meta.stats.stub + (resolvedTree.resolution_meta.stats.data_gap ?? 0)],
            ] as Array<[string, number]>).map(([label, val], i, arr) => (
              <View key={i} style={[rs.kvRow, i === arr.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                <Text style={rs.kvLabel}>{label}</Text>
                <Text style={rs.kvValue}>{val}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <PageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Feature flag check export
// ---------------------------------------------------------------------------

export { isPhase5RenderEnabled as checkPhase5RenderEnabled }
