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

      {/* Grammar verdict banner */}
      {grammarVerdicts && (
        <View style={{ borderWidth: 1.5, borderColor: grammarColour, padding: 10, marginBottom: 14 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: grammarColour, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Grammar Engine Verdict
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

// Grammar Verdicts detail page — all WARN and BLOCK verdicts
const GrammarVerdictsPage = ({ state }: { state: PipelineState }) => {
  const grammarVerdicts = state.grammarVerdicts
  if (!grammarVerdicts) return <></>

  const nonPassVerdicts = grammarVerdicts.verdicts.filter(v => v.verdict !== 'PASS')
  const passVerdicts = grammarVerdicts.verdicts.filter(v => v.verdict === 'PASS')

  const verdictColour = (verdict: string) =>
    verdict === 'BLOCK' ? BESS_RED : verdict === 'WARN' ? BESS_AMBER : BESS_GREEN

  return (
    <Page size="A4" style={pageStyle}>
      <DocPageHeader title={`${dash(state.projectId)} | Forge Engineering Report (Radical v1) | Grammar Verdicts`} />
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK_DARK, marginBottom: 8 }}>
        Grammar Engine Verdicts
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

      {/* §2 System Modules and Architecture — Radical tree view */}
      <RadicalModulesSection
        resolvedTree={resolvedTree}
        radicalCostSummary={radicalCostSummary}
        projectId={projectId}
      />

      {/* §3 Bill of Materials — sentence-grouped, grammar verdicts inline */}
      <RadicalBomSection
        resolvedTree={resolvedTree}
        radicalCostSummary={radicalCostSummary}
        grammarVerdicts={grammarVerdicts}
        projectId={projectId}
      />

      {/* §4 Cost Waterfall — from radicalCostSummary */}
      <RadicalCostSection
        radicalCostSummary={radicalCostSummary}
        fallbackCostSummary={safe.costSummary}
        projectId={projectId}
      />

      {/* §5 Grammar Verdicts detail page */}
      {grammarVerdicts && (
        <GrammarVerdictsPage state={safe} />
      )}
    </Document>
  )
}
