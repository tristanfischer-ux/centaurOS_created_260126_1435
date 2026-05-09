/**
 * @file 7-pdf-v3.tsx — ForgeOS PDF Engine v3 renderer (BESS-style)
 *
 * Implements the redesign specified in RENDERER-REDESIGN.md.
 * Activated via env flag: PDF_RENDERER=v3 (default = v2 = existing 7-pdf.tsx).
 *
 * Path B strategy: full renderer shipped NOW with fallbacks for all 52
 * missing upstream fields. Fields render "—" / "Pending" / "Unverified"
 * when not yet populated. Output gets richer automatically as upstream
 * stages fill the data in.
 *
 * DO NOT import from or modify 7-pdf.tsx.
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { normaliseState, safeNumber, safeString, fmtGbpOrDash } from '../lib/safe-state'
import { classifyRegime } from '../lib/part-regime'
import { computeNreFromRegulatory } from '../lib/nre-from-regulatory'
import type {
  PipelineState,
  Module,
  Part,
  BomLine,
  CostBreakdown,
  SupplierMatch,
  RegulatoryItem,
  RiskRow,
} from '../types'

// ─── Design Tokens — BESS dual-palette ────────────────────────────────────────
const BESS_TEAL   = '#2563ae'   // section/subsection headings
const BESS_NAVY   = '#1e3a5f'   // dark table header backgrounds
const BESS_AMBER  = '#d97706'   // WARN state, CONDITIONALLY FEASIBLE
const BESS_GREEN  = '#16a34a'   // PASS, FEASIBLE, ENGINEERING maturity
const BESS_RED    = '#dc2626'   // FAIL, INFEASIBLE
const HEADER_RULE = '#cccccc'   // thin horizontal rule in page header
const TABLE_BORDER = '#cccccc'  // table borders
const HEADER_TEXT = '#ffffff'   // text on dark-navy table headers
const INK         = '#1a1a1a'   // body text
const INK_DARK    = '#0d0d0d'   // headings
const MUTED       = '#666666'   // secondary text, source grade tags
const BG_SOFT     = '#f9fafb'   // alternating row tint
const BORDER      = '#e5e7eb'   // light border

// ─── Shared Styles ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 66,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: '#ffffff',
    fontSize: 10,
  },
  // Running page header
  pageHeader: {
    position: 'absolute',
    top: 16,
    left: 44,
    right: 44,
  },
  pageHeaderText: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 4,
  },
  pageHeaderRule: {
    borderBottomWidth: 0.5,
    borderBottomColor: HEADER_RULE,
  },
  // Footer
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
  footerText: {
    fontSize: 8,
    color: MUTED,
  },
  // Typography
  h1: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: INK_DARK,
    marginTop: 0,
    marginBottom: 14,
  },
  tealH2: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: BESS_TEAL,
    marginTop: 18,
    marginBottom: 8,
  },
  tealH3: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: BESS_TEAL,
    marginTop: 12,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  para: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 8,
    color: INK,
  },
  // KV table
  kvTable: {
    borderWidth: 0.5,
    borderColor: TABLE_BORDER,
    marginBottom: 12,
  },
  kvRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
  },
  kvLabel: {
    width: '38%',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  kvValue: {
    width: '62%',
    fontSize: 9,
    color: INK,
    paddingVertical: 5,
    paddingHorizontal: 8,
    lineHeight: 1.4,
  },
  // Dark-header table
  darkTable: {
    borderWidth: 0.5,
    borderColor: TABLE_BORDER,
    marginBottom: 12,
  },
  darkTHead: {
    flexDirection: 'row',
    backgroundColor: BESS_NAVY,
  },
  darkTHC: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: HEADER_TEXT,
    paddingVertical: 7,
    paddingHorizontal: 7,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
  },
  tRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
    backgroundColor: BG_SOFT,
  },
  tC: {
    fontSize: 9,
    color: INK,
    paddingVertical: 5,
    paddingHorizontal: 7,
    lineHeight: 1.3,
  },
  // Feasibility banner
  feasBanner: {
    borderWidth: 1.5,
    marginBottom: 14,
    padding: 10,
  },
  feasBannerLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  feasBannerVerdict: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  // Maturity banner (bordered teal info box for module pages)
  maturityBanner: {
    borderWidth: 1,
    borderColor: BESS_TEAL,
    padding: 8,
    marginBottom: 12,
    backgroundColor: '#eff6ff',
  },
  maturityBannerText: {
    fontSize: 9,
    color: BESS_TEAL,
    fontFamily: 'Helvetica-Bold',
  },
  // Source grade tag — inline
  sourceGradeTag: {
    fontSize: 8,
    color: MUTED,
    fontFamily: 'Helvetica',
  },
  // Action callout — bold paragraph, no border box
  actionCalloutPrefix: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: BESS_AMBER,
  },
  actionCalloutBody: {
    fontSize: 10,
    color: INK,
    lineHeight: 1.4,
  },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function fmtNum(v: unknown, suffix = ''): string {
  const n = safeNumber(v)
  if (n === null) return '—'
  return `${n}${suffix}`
}

function pendingStr(v: unknown, fallback = 'Pending'): string {
  if (v === null || v === undefined || v === '') return fallback
  if (typeof v === 'string') return v.trim() || fallback
  return String(v)
}

function getRPN(r: RiskRow): number {
  return (r.severity || 0) * (r.likelihood || 0) * ((r as any).detection ?? 5)
}

// Grade display: if the field has no grade, render [?]; if the entire stage
// hasn't populated grades yet (i.e. ALL values are missing), skip tags entirely.
function gradeTag(grade: string | undefined | null): string {
  if (!grade) return '[?]'
  return `[${grade}]`
}

function inlineGrade(value: string, grade: string | undefined | null, desc?: string): string {
  if (!grade) return value
  const tag = desc ? `[${grade} — ${desc}]` : `[${grade}]`
  return `${value} ${tag}`
}

// ─── Primitive components ─────────────────────────────────────────────────────

/** Running page header on every page */
const PageHeader = ({ projectId, revision }: { projectId: string; revision?: string | null }) => (
  <View style={s.pageHeader} fixed>
    <Text style={s.pageHeaderText}>
      {dash(projectId)} | Forge Engineering Report | {dash(revision) !== '—' ? dash(revision) : 'Rev A'}
    </Text>
    <View style={s.pageHeaderRule} />
  </View>
)

/** Page footer — right-aligned page number */
const PageFooter = () => (
  <View style={s.footer} fixed>
    <Text style={s.footerText} render={({ pageNumber }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber}`} />
  </View>
)

/** Feasibility decision banner — bordered box, amber/red/green */
const FeasibilityDecisionBanner = ({
  label,
  verdict,
  colour,
}: {
  label: string
  verdict: string
  colour: string
}) => (
  <View style={[s.feasBanner, { borderColor: colour }]}>
    <Text style={[s.feasBannerLabel, { color: colour }]}>{label}</Text>
    <Text style={[s.feasBannerVerdict, { color: colour }]}>{verdict}</Text>
  </View>
)

/** Full-width two-column KV table */
const KVTable = ({ rows }: { rows: Array<{ label: string; value: string }> }) => (
  <View style={s.kvTable}>
    {rows.map((row, i) => (
      <View key={i} style={[s.kvRow, i === rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
        <Text style={s.kvLabel}>{row.label}</Text>
        <Text style={s.kvValue}>{row.value}</Text>
      </View>
    ))}
  </View>
)

/** Multi-column table with dark-navy header */
const DarkHeaderTable = ({
  cols,
  rows,
}: {
  cols: Array<{ label: string; width: string; align?: 'left' | 'right' | 'center' }>
  rows: Array<Array<{ text: string; bold?: boolean; colour?: string }>>
}) => (
  <View style={s.darkTable}>
    <View style={s.darkTHead}>
      {cols.map((col, ci) => (
        <Text
          key={ci}
          style={[s.darkTHC, { width: col.width, textAlign: col.align || 'left' }]}
        >
          {col.label}
        </Text>
      ))}
    </View>
    {rows.map((row, ri) => (
      <View key={ri} style={ri % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
        {row.map((cell, ci) => (
          <Text
            key={ci}
            style={[
              s.tC,
              { width: cols[ci]?.width || 'auto', textAlign: cols[ci]?.align || 'left' },
              cell.bold ? { fontFamily: 'Helvetica-Bold' } : {},
              cell.colour ? { color: cell.colour } : {},
            ]}
          >
            {cell.text}
          </Text>
        ))}
      </View>
    ))}
    {rows.length === 0 && (
      <View style={s.tRow}>
        <Text style={[s.tC, { width: '100%', color: MUTED, fontFamily: 'Helvetica-Oblique' }]}>No data available.</Text>
      </View>
    )}
  </View>
)

/** Teal H2 heading */
const TealH2 = ({ children }: { children: string }) => (
  <Text style={s.tealH2}>{children}</Text>
)

/** Teal H3 heading */
const TealH3 = ({ children }: { children: string }) => (
  <Text style={s.tealH3}>{children}</Text>
)

/** Module maturity banner — bordered teal info box */
const MaturityBanner = ({
  maturity,
  leadTimeWeeks,
  statusNote,
}: {
  maturity?: string | null
  leadTimeWeeks?: number | null
  statusNote?: string | null
}) => {
  const mat = dash(maturity)
  const lt = safeNumber(leadTimeWeeks)
  const ltStr = lt !== null ? `${lt} weeks` : 'Pending'
  const note = pendingStr(statusNote, 'Preliminary design stage')
  return (
    <View style={s.maturityBanner}>
      <Text style={s.maturityBannerText}>
        Module Maturity: {mat} | Lead Time: {ltStr} | Status: {note}
      </Text>
    </View>
  )
}

/** Action callout — plain bold paragraph, no border box */
const ActionCallout = ({ text }: { text: string | null | undefined }) => {
  if (!text) return null
  return (
    <View style={{ marginBottom: 10 }} wrap={false}>
      <Text>
        <Text style={s.actionCalloutPrefix}>Action required: </Text>
        <Text style={s.actionCalloutBody}>{text}</Text>
      </Text>
    </View>
  )
}

/** Source grade tag — standalone italic line below a section */
const SourceGradeFootnote = ({ grade, desc }: { grade?: string | null; desc?: string | null }) => {
  if (!grade) return null
  const inner = desc ? `${grade} — ${desc}` : grade
  return (
    <Text style={{ fontSize: 8, color: MUTED, fontFamily: 'Helvetica-Oblique', marginTop: 4, marginBottom: 6 }}>
      [Source grade: {inner}]
    </Text>
  )
}

/**
 * SafeSection — wraps a section in a try/catch at JSX construction time.
 * @react-pdf/renderer evaluates lazily; the real crash guard is normaliseState().
 * This wrapper adds explicitness around section boundaries.
 */
function SafeSection({ name, children }: { name: string; children: React.ReactElement }) {
  try {
    return children
  } catch (err) {
    console.error(`[pdf-v3:SafeSection] ${name} crashed:`, err)
    return (
      <Page size="A4" style={s.page}>
        <View style={{ padding: 24 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: BESS_RED, marginBottom: 8 }}>
            Section unavailable: {name}
          </Text>
          <Text style={{ fontSize: 10, color: MUTED }}>
            This section could not be rendered. The rest of the report continues below.
          </Text>
        </View>
      </Page>
    )
  }
}

// ─── Per-standard regulatory block ────────────────────────────────────────────
const RegulatoryStandardBlock = ({ reg, idx }: { reg: RegulatoryItem; idx: number }) => {
  const r = reg as RegulatoryItem & {
    sourceGrade?: string
    versionDate?: string
    claimType?: string
    verificationStatus?: string
    jurisdiction?: string
  }
  const statusColour = /complete|approved/i.test(r.status || '') ? BESS_GREEN
    : /progress|draft/i.test(r.status || '') ? BESS_AMBER
    : BESS_RED

  const kvRows = [
    { label: 'Version / Date', value: dash(r.versionDate) },
    { label: 'Jurisdiction', value: dash(r.jurisdiction) },
    { label: 'Owner Role', value: dash(r.ownerRole) },
    { label: 'Status', value: dash(r.status) || 'not-started' },
    { label: 'Claim Type', value: dash(r.claimType) },
    { label: 'Source Grade', value: r.sourceGrade ? `${r.sourceGrade} — ${dash(r.verificationStatus)}` : 'Unverified — needs sourcing review' },
  ]

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId="" revision="Rev A" />
      <Text style={s.sectionLabel}>Regulatory &amp; Compliance</Text>
      <Text style={s.h1}>{dash(r.code)}</Text>
      <Text style={[s.tealH2, { marginTop: 0 }]}>{dash(r.name)}</Text>

      <KVTable rows={kvRows} />

      <TealH3>Applicability</TealH3>
      <Text style={s.para}>{pendingStr(r.applicability, 'Pending applicability assessment.')}</Text>

      <TealH3>Engineering Impact</TealH3>
      <Text style={s.para}>{pendingStr(r.designImpact, 'Pending engineering impact analysis.')}</Text>

      <TealH3>Evidence Required</TealH3>
      <Text style={s.para}>{pendingStr(r.evidenceRequired, 'Pending evidence specification.')}</Text>

      <TealH3>Gap Action</TealH3>
      <Text style={s.para}>{pendingStr(r.gapAction, 'Pending gap action definition.')}</Text>

      <PageFooter />
    </Page>
  )
}

// ─── Per-risk detail block ─────────────────────────────────────────────────────
const RiskDetailBlock = ({ risk, moduleName }: { risk: RiskRow & { moduleId?: string }; moduleName: string }) => {
  const r = risk as RiskRow & {
    status?: string
    gradeOverride?: string
    moduleId?: string
    cause?: string
    consequence?: string
    existingControls?: string
    mitigation?: string
    verificationTest?: string
    owner?: string
    detection?: number
  }
  const rpn = getRPN(r)
  const rpnColour = rpn >= 200 ? BESS_RED : rpn >= 100 ? BESS_AMBER : BESS_GREEN
  const grade = (r as any).gradeOverride || 'D'
  const statusStr = dash((r as any).status) !== '—' ? dash((r as any).status) : 'OPEN — verification test not yet executed'

  const kvRows = [
    { label: 'Module', value: dash(moduleName) },
    { label: 'Cause', value: pendingStr(r.cause) },
    { label: 'Local Effect', value: pendingStr(r.consequence) },
    { label: 'System Effect', value: pendingStr(r.consequence) },
    { label: `Severity ${r.severity ?? '—'} / Occurrence ${r.likelihood ?? '—'} / Detection ${r.detection ?? '5 (default)'}`, value: `= RPN ${rpn}` },
    { label: 'Existing Controls', value: pendingStr(r.existingControls) },
    { label: 'Planned Mitigation', value: pendingStr(r.mitigation) },
    { label: 'Verification Test', value: pendingStr(r.verificationTest) },
    { label: 'Owner', value: dash(r.owner) },
    { label: 'Source Grade', value: `${grade} — Engineering estimate` },
    { label: 'Status', value: statusStr },
  ]

  return (
    <View wrap={false} style={{ marginBottom: 20 }}>
      <TealH2>{`${dash(r.id)} — ${dash(r.hazard)}`}</TealH2>
      <KVTable rows={kvRows} />
    </View>
  )
}

// ─── Table of Contents ─────────────────────────────────────────────────────────
// Per Tristan's decision: only render when total page count > 25.
// @react-pdf doesn't support dynamic totalPages in TOC context, so we
// use a threshold prop from the caller.
const TableOfContents = ({ show }: { show: boolean }) => {
  if (!show) return <></>
  const items = [
    '1. Cover Page',
    '2. Brief and Requirements',
    '3. Sizing and Spatial Allocation',
    '4. Feasibility Gate',
    '5. System Modules and Architecture',
    '6. Bill of Materials',
    '7. Assembly Shortlist',
    '8. Cost Waterfall and Economics',
    '9. Regulatory and Compliance',
    '10. Risk Register (FMEA)',
    '11. Audit Log',
    '12. Source Attribution',
  ]
  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId="Table of Contents" revision="Rev A" />
      <Text style={s.h1}>Table of Contents</Text>
      {items.map((item, i) => (
        <Text key={i} style={[s.para, { marginBottom: 6 }]}>{item}</Text>
      ))}
      <PageFooter />
    </Page>
  )
}

// ─── Cover Page ────────────────────────────────────────────────────────────────
const CoverPage = ({ state }: { state: PipelineState }) => {
  const brief = state.research?.designBrief
  const projectId = dash(state.projectId)
  const revision = 'Rev A'
  const productTitle = dash(brief?.useCase) !== '—' ? dash(brief?.useCase) : 'Engineering Design Report'
  const productClass = dash(state.productClass) !== '—' ? dash(state.productClass) : dash(brief?.targetMaterial)

  const feasibility = (state as any).feasibility as {
    status?: string
    compactBanner?: string
    overallStatus?: string
    actionRequired?: string
  } | undefined

  const feasStatus = feasibility?.overallStatus || feasibility?.status || 'UNKNOWN'
  const feasVerdict = feasibility?.compactBanner || `${feasStatus} — Awaiting full feasibility assessment`
  const feasColour = feasStatus === 'RED' || feasStatus === 'FAIL' ? BESS_RED
    : feasStatus === 'AMBER' || feasStatus === 'WARN' ? BESS_AMBER
    : feasStatus === 'GREEN' || feasStatus === 'PASS' ? BESS_GREEN
    : MUTED

  const unitCost = state.costBreakdown?.unitTotalGbp
  const ceiling = state.costBreakdown?.ceilingGbp ?? brief?.constraints?.unitCostCeilingGbp
  const rawBom = state.costBreakdown?.rawBomCostGbp
  const nreTotal = state.costBreakdown?.nreTotalGbp

  const batchSize = brief?.constraints?.batchSize
  const batchNum = safeNumber(batchSize) || 1
  const nrePerUnit = (nreTotal && batchNum) ? nreTotal / batchNum : null
  const totalLoaded = (unitCost && nrePerUnit) ? unitCost + nrePerUnit : unitCost
  const headroom = (ceiling && totalLoaded) ? ceiling - totalLoaded : null
  const headroomPct = (ceiling && headroom) ? (headroom / ceiling) * 100 : null

  const headroomStr = headroom !== null
    ? (headroom < 0
        ? `–${fmtGbp(Math.abs(headroom))} (${Math.abs(headroomPct ?? 0).toFixed(1)}% over budget)`
        : `+${fmtGbp(headroom)} (${(headroomPct ?? 0).toFixed(1)}% under budget)`)
    : 'Pending'

  const headroomColour = headroom === null ? MUTED : headroom < 0 ? BESS_RED : BESS_GREEN

  const moduleCount = state.modules?.length ?? 0
  const bomRows = state.parts?.length ?? 0
  const bomSourced = state.parts?.filter(p => (p as any).priceSource && (p as any).priceSource !== 'manifest_no_price').length ?? 0

  const metadataRows = [
    { label: 'Project ID', value: projectId },
    { label: 'Product Class', value: dash(state.productClass) },
    { label: 'Revision', value: revision },
    { label: 'Generated', value: new Date().toISOString().split('T')[0] },
    { label: 'Engine Version', value: 'ForgeOS PDF Engine v3' },
  ]

  const costStatusProse = (() => {
    if (!unitCost) return 'Pending — cost computation not yet complete.'
    if (!ceiling) return `COMPUTED — unit cost ${fmtGbp(unitCost)}. No ceiling specified.`
    if (totalLoaded && totalLoaded > ceiling) {
      const over = fmtGbp(totalLoaded - ceiling)
      return `COMPUTED — but exceeds ceiling by ${over}. See Cost section for reduction paths.`
    }
    return `COMPUTED — unit cost ${fmtGbp(unitCost)} is within the target ceiling.`
  })()

  const economicsRows = [
    { label: 'BOM Rows', value: `${bomRows} total (${bomSourced} sourced, ${bomRows - bomSourced} pending)` },
    { label: 'Estimated Unit Cost', value: inlineGrade(fmtGbp(unitCost), 'D', 'engineering estimate') },
    { label: 'Target Ceiling', value: fmtGbp(ceiling) },
    { label: 'Headroom', value: headroomStr },
    { label: 'Total NRE', value: fmtGbp(nreTotal) },
    { label: 'Unit Cost + NRE Amortised', value: fmtGbp(totalLoaded) },
    { label: 'Cost Status', value: costStatusProse },
  ]

  const moduleSummaryRows = [
    { label: 'Modules', value: `${moduleCount}` },
    { label: 'BOM Rows', value: `${bomRows} (${bomSourced} sourced / ${bomRows - bomSourced} pending)` },
  ]

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={projectId} revision={revision} />

      {/* Title block */}
      <View style={{ marginBottom: 16 }}>
        <Text style={s.h1}>Forge Engineering Report</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: BESS_TEAL, marginBottom: 6 }}>
          {productTitle}
        </Text>
        {productClass !== '—' && (
          <Text style={{ fontSize: 10, color: MUTED }}>
            {productClass}
          </Text>
        )}
      </View>

      {/* Feasibility decision banner */}
      <FeasibilityDecisionBanner
        label="FEASIBILITY DECISION"
        verdict={feasVerdict}
        colour={feasColour}
      />

      {/* Metadata KV table */}
      <KVTable rows={metadataRows} />

      {/* Economics heading + table */}
      <TealH2>Economics</TealH2>
      <KVTable rows={economicsRows} />

      {/* Module summary */}
      <KVTable rows={moduleSummaryRows} />

      <PageFooter />
    </Page>
  )
}

// ─── Feasibility Gate ──────────────────────────────────────────────────────────
const FeasibilityGatePage = ({ state }: { state: PipelineState }) => {
  const feasibility = (state as any).feasibility as {
    checks?: Array<{
      checkId: string
      status: 'PASS' | 'WARN' | 'FAIL'
      reason: string
      evidence: string
    }>
    actionRequired?: string | null
    overallStatus?: string
    reportType?: string
  } | undefined

  // Fallback: build synthetic checks from existing state fields when
  // feasibility.checks[] is not yet populated upstream (Path B fallback)
  const checks = feasibility?.checks?.length
    ? feasibility.checks
    : [
        {
          checkId: 'regulatory_identified',
          status: (state.research?.designBrief?.regulatory?.length ?? 0) > 0 ? 'PASS' : 'FAIL',
          reason: (state.research?.designBrief?.regulatory?.length ?? 0) > 0
            ? `${state.research!.designBrief!.regulatory!.length} standard(s) identified`
            : 'No regulatory standards identified',
          evidence: `${state.research?.designBrief?.regulatory?.length ?? 0} standards`,
        },
        {
          checkId: 'cost_ceiling_specified',
          status: state.research?.designBrief?.constraints?.unitCostCeilingGbp ? 'PASS' : 'WARN',
          reason: state.research?.designBrief?.constraints?.unitCostCeilingGbp
            ? 'Cost ceiling specified in brief'
            : 'No cost ceiling — economics unconstrained',
          evidence: fmtGbp(state.research?.designBrief?.constraints?.unitCostCeilingGbp),
        },
        {
          checkId: 'spatial_envelope',
          status: state.dimensionSheet?.envelope?.interior_volume_m3 ? 'PASS' : 'WARN',
          reason: state.dimensionSheet?.envelope?.interior_volume_m3
            ? 'Spatial envelope established'
            : 'No envelope dimensions provided',
          evidence: fmtNum(state.dimensionSheet?.envelope?.interior_volume_m3, ' m³'),
        },
        {
          checkId: 'modules_decomposed',
          status: (state.modules?.length ?? 0) > 0 ? 'PASS' : 'FAIL',
          reason: (state.modules?.length ?? 0) > 0
            ? `${state.modules.length} modules decomposed`
            : 'Module decomposition failed or incomplete',
          evidence: `${state.modules?.length ?? 0} modules`,
        },
        {
          checkId: 'bom_population',
          status: (state.parts?.length ?? 0) > 0 ? 'PASS' : 'FAIL',
          reason: (state.parts?.length ?? 0) > 0
            ? `${state.parts.length} BOM rows generated`
            : 'BOM population failed',
          evidence: `${state.parts?.length ?? 0} parts`,
        },
        {
          checkId: 'cost_feasibility',
          status: (() => {
            const cost = state.costBreakdown?.unitTotalGbp
            const ceil = state.costBreakdown?.ceilingGbp ?? state.research?.designBrief?.constraints?.unitCostCeilingGbp
            if (!cost) return 'WARN'
            if (!ceil) return 'PASS'
            return cost <= ceil ? 'PASS' : 'WARN'
          })(),
          reason: (() => {
            const cost = state.costBreakdown?.unitTotalGbp
            const ceil = state.costBreakdown?.ceilingGbp ?? state.research?.designBrief?.constraints?.unitCostCeilingGbp
            if (!cost) return 'Cost not yet computed'
            if (!ceil) return 'No ceiling for comparison'
            return cost <= ceil
              ? `Unit cost ${fmtGbp(cost)} is within ceiling`
              : `Unit cost ${fmtGbp(cost)} exceeds ceiling ${fmtGbp(ceil)}`
          })(),
          evidence: fmtGbp(state.costBreakdown?.unitTotalGbp),
        },
        {
          checkId: 'risk_matrix_populated',
          status: state.modules?.some(m => (m.riskMatrix?.length ?? 0) > 0) ? 'PASS' : 'FAIL',
          reason: state.modules?.some(m => (m.riskMatrix?.length ?? 0) > 0)
            ? 'FMEA rows populated'
            : 'No risk matrix data generated',
          evidence: `${state.modules?.flatMap(m => m.riskMatrix || []).length ?? 0} risks`,
        },
      ] as Array<{ checkId: string; status: string; reason: string; evidence: string }>

  const statusColour = (st: string) =>
    st === 'PASS' ? BESS_GREEN : st === 'WARN' ? BESS_AMBER : BESS_RED

  const cols = [
    { label: 'Check', width: '40%' },
    { label: 'Status', width: '14%' },
    { label: 'Reason', width: '28%' },
    { label: 'Evidence', width: '18%' },
  ]

  const rows = checks.map(chk => [
    { text: chk.checkId, bold: true },
    { text: chk.status, bold: true, colour: statusColour(chk.status) },
    { text: dash(chk.reason) },
    { text: dash(chk.evidence) },
  ])

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>Feasibility Gate Results</Text>

      {state.pipelineError && (
        <View style={{ marginBottom: 12, padding: 10, borderWidth: 1.5, borderColor: BESS_RED }} wrap={false}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: BESS_RED, marginBottom: 4 }}>
            Pipeline halted at stage: {state.pipelineError.stage}
          </Text>
          <Text style={{ fontSize: 9, color: INK }}>{state.pipelineError.message}</Text>
        </View>
      )}

      <Text style={s.para}>
        The following pipeline checks verify the integrity and completeness of the engineering specification before detailed analysis proceeds.
      </Text>

      <DarkHeaderTable cols={cols} rows={rows} />

      {feasibility?.actionRequired && (
        <ActionCallout text={feasibility.actionRequired} />
      )}

      <PageFooter />
    </Page>
  )
}

// ─── Brief and Requirements ────────────────────────────────────────────────────
const BriefPages = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  const rawBrief = state.briefText?.trim()

  const constraintRows = [
    { label: 'Unit Cost Ceiling', value: fmtGbp(b?.constraints?.unitCostCeilingGbp) },
    { label: 'Target Mass', value: fmtNum(b?.constraints?.maxMassKg, ' kg') },
    { label: 'Target Dimensions', value: dash((b?.constraints as any)?.envelope) },
    { label: 'Batch Size', value: dash(b?.constraints?.batchSize) },
    { label: 'Target Process', value: dash(b?.targetProcess) },
    { label: 'Target Material', value: dash(b?.targetMaterial) },
    { label: 'Safety Standard', value: dash(b?.complianceNotes) },
    { label: 'Operating Temperature', value: dash((b?.constraints as any)?.operatingTemperature) },
    { label: 'Jurisdiction', value: dash((b?.constraints as any)?.jurisdiction) },
  ].filter(r => r.value !== '—')

  const sources = b?.sources ?? []
  const sourceCols = [
    { label: 'Source', width: '40%' },
    { label: 'Type', width: '20%' },
    { label: 'Grade', width: '10%' },
    { label: 'Relevance', width: '30%' },
  ]
  const sourceRows = sources.map(src => [
    { text: dash(src.title), bold: true },
    { text: dash(src.type) },
    { text: (src as any).sourceGrade ? gradeTag((src as any).sourceGrade) : '[?]' },
    { text: dash(src.relevance) },
  ])

  return (
    <>
      <Page size="A4" style={s.page}>
        <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
        <Text style={s.h1}>Brief and Requirements</Text>

        <TealH2>Overview and Context</TealH2>
        <Text style={s.para}>{pendingStr(rawBrief || b?.useCase, 'No founder brief provided.')}</Text>

        <TealH2>Mission Statement</TealH2>
        <Text style={s.para}>{pendingStr(b?.mission, 'Pending mission statement.')}</Text>

        {b?.targetCustomers && (
          <>
            <TealH2>Target Customers</TealH2>
            <Text style={s.para}>{b.targetCustomers}</Text>
          </>
        )}

        {b?.whyNow && (
          <>
            <TealH2>Why Now</TealH2>
            <Text style={s.para}>{b.whyNow}</Text>
            <SourceGradeFootnote grade="C" desc="industry reports and market data" />
          </>
        )}

        <TealH2>Engineering Constraints</TealH2>
        {constraintRows.length > 0 ? (
          <KVTable rows={constraintRows} />
        ) : (
          <Text style={[s.para, { color: MUTED, fontFamily: 'Helvetica-Oblique' }]}>
            No structured constraints extracted — refer to raw brief above.
          </Text>
        )}

        <TealH2>Research Sources</TealH2>
        <Text style={s.para}>
          Source grade key: A = primary test data, B = engineering analysis, C = published industry reports, D = expert estimate, E = LLM hypothesis.
        </Text>
        <DarkHeaderTable cols={sourceCols} rows={sourceRows} />

        <PageFooter />
      </Page>

      {/* Appendix: inferred assumptions */}
      {state.briefExpansion && (
        <Page size="A4" style={s.page}>
          <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
          <Text style={s.h1}>Brief Appendix — Engine-Inferred Assumptions</Text>
          <Text style={[s.para, { color: MUTED }]}>
            The original brief was minimal. The engine inferred the following constraints based on product class.
          </Text>
          <DarkHeaderTable
            cols={[
              { label: 'Field', width: '25%' },
              { label: 'Inferred Value', width: '22%' },
              { label: 'Confidence', width: '13%' },
              { label: 'Reasoning', width: '40%' },
            ]}
            rows={state.briefExpansion.inferredAssumptions.map(inf => [
              { text: dash(inf.field), bold: true },
              { text: dash(String(inf.value)) },
              {
                text: dash(inf.confidence),
                colour: inf.confidence === 'HIGH' ? BESS_GREEN : inf.confidence === 'MEDIUM' ? BESS_AMBER : BESS_RED,
                bold: true,
              },
              { text: dash(inf.reasoning) },
            ])}
          />
          <PageFooter />
        </Page>
      )}
    </>
  )
}

// ─── Regulatory Overview ───────────────────────────────────────────────────────
const RegulatoryOverviewSection = ({ state }: { state: PipelineState }) => {
  const regs = (state.research?.designBrief?.regulatory ?? []) as Array<RegulatoryItem & {
    sourceGrade?: string
    jurisdiction?: string
  }>

  if (regs.length === 0) {
    return (
      <Page size="A4" style={s.page}>
        <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
        <Text style={s.h1}>Regulatory and Compliance</Text>
        <Text style={[s.para, { color: MUTED }]}>No regulatory standards identified for this product class.</Text>
        <PageFooter />
      </Page>
    )
  }

  const cols = [
    { label: 'Standard', width: '20%' },
    { label: 'Jurisdiction', width: '22%' },
    { label: 'Status', width: '16%' },
    { label: 'Grade', width: '8%' },
    { label: 'Applicability and Impact', width: '34%' },
  ]

  const rows = regs.slice(0, 10).map(r => {
    const statusColour = /complete/i.test(r.status || '') ? BESS_GREEN
      : /progress|draft/i.test(r.status || '') ? BESS_AMBER
      : MUTED
    return [
      { text: `${dash(r.code)} — ${dash(r.name)}`, bold: true },
      { text: dash((r as any).jurisdiction) },
      { text: dash(r.status) || 'not-started', colour: statusColour },
      { text: (r as any).sourceGrade ? gradeTag((r as any).sourceGrade) : '[?]' },
      { text: dash(r.applicability) || dash(r.summary) },
    ]
  })

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>Regulatory and Compliance</Text>
      <Text style={s.para}>
        Standards identified as applicable to this product. Per-standard detail pages follow.
      </Text>
      <DarkHeaderTable cols={cols} rows={rows} />
      <PageFooter />
    </Page>
  )
}

// ─── Sizing Section ────────────────────────────────────────────────────────────
const SizingSection = ({ state }: { state: PipelineState }) => {
  const ds = state.dimensionSheet as typeof state.dimensionSheet & {
    zones?: Array<{ name: string; lengthMm?: number; volumeM3?: number; massKg?: number; contents?: string }>
    volumeUtilisationPct?: number
    massUtilisationPct?: number
    externalDimensionsMm?: { w: number; d: number; h: number }
    internalDimensionsMm?: { w: number; d: number; h: number }
    tareMassKg?: number
    availablePayloadMassKg?: number
    clearanceNotes?: string
    massMarginNote?: string
  } | null

  if (!ds) {
    return (
      <Page size="A4" style={s.page}>
        <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
        <Text style={s.h1}>Sizing and Spatial Allocation</Text>
        <Text style={[s.para, { color: MUTED }]}>Sizing data not yet computed.</Text>
        <PageFooter />
      </Page>
    )
  }

  const volPct = safeNumber(ds.volumeUtilisationPct)
  const massPct = safeNumber(ds.massUtilisationPct)
  const layoutFeasibleStr = ds.feasible
    ? `YES${volPct !== null ? ` — ${volPct}% volume utilisation` : ''}${massPct !== null ? `, ${massPct}% mass utilisation` : ''}`
    : 'NO — modules exceed available envelope'

  const extDim = (ds as any).externalDimensionsMm
  const intDim = (ds as any).internalDimensionsMm || ds.envelope

  const envelopeRows = [
    { label: 'External Dimensions (W×D×H)', value: extDim ? `${extDim.w ?? '—'} × ${extDim.d ?? '—'} × ${extDim.h ?? '—'} mm` : 'Pending' },
    {
      label: 'Internal Dimensions (W×D×H)',
      value: intDim
        ? `${fmtNum((intDim as any).interior_w_mm ?? (intDim as any).w)} × ${fmtNum((intDim as any).interior_d_mm ?? (intDim as any).d)} × ${fmtNum((intDim as any).interior_h_mm ?? (intDim as any).h)} mm`
        : 'Pending',
    },
    { label: 'Internal Volume', value: fmtNum(ds.envelope?.interior_volume_m3, ' m³') },
    { label: 'Usable Floor Area', value: fmtNum(ds.envelope?.interior_floor_m2, ' m²') },
    { label: 'Container Tare Mass', value: ds.tareMassKg ? fmtNum(ds.tareMassKg, ' kg') : 'Pending' },
    { label: 'Available Payload Mass', value: ds.availablePayloadMassKg ? fmtNum(ds.availablePayloadMassKg, ' kg') : 'Pending' },
    { label: 'Layout Feasible', value: layoutFeasibleStr },
  ]

  // Zone table
  const hasDedicatedZones = Array.isArray(ds.zones) && ds.zones.length > 0
  const zoneCols = [
    { label: 'Zone', width: '24%' },
    { label: 'Length mm', width: '16%', align: 'right' as const },
    { label: 'Volume m³', width: '16%', align: 'right' as const },
    { label: 'Mass kg', width: '14%', align: 'right' as const },
    { label: 'Contents', width: '30%' },
  ]

  const zoneRows = hasDedicatedZones
    ? ds.zones!.map(z => [
        { text: dash(z.name), bold: true },
        { text: fmtNum(z.lengthMm), align: 'right' as const },
        { text: fmtNum(z.volumeM3), align: 'right' as const },
        { text: fmtNum(z.massKg), align: 'right' as const },
        { text: dash(z.contents) },
      ])
    : Object.entries(ds.module_dimensions ?? {}).map(([name, v]) => [
        { text: dash(name), bold: true },
        { text: fmtNum((v as any).w_mm) },
        { text: fmtNum((v as any).floor_m2, ' m²') },
        { text: fmtNum((v as any).h_mm, ' mm') },
        { text: dash((v as any).mount) },
      ])

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>Sizing and Spatial Allocation</Text>
      <Text style={s.para}>
        The sizing solver allocates system modules within the target envelope. Results reflect deterministic box-packing constraints.
      </Text>

      <TealH2>Container Envelope</TealH2>
      <KVTable rows={envelopeRows} />

      <TealH2>Zone Allocation</TealH2>
      <Text style={s.para}>
        Module zones allocate volume, mass, and floor area within the container envelope.
      </Text>
      <DarkHeaderTable cols={zoneCols} rows={zoneRows} />

      {ds.conflicts && ds.conflicts.length > 0 && (
        <>
          <TealH2>Conflicts</TealH2>
          {ds.conflicts.map((c, i) => (
            <Text key={i} style={[s.para, { color: BESS_RED }]}>• {c}</Text>
          ))}
        </>
      )}

      {ds.clearanceNotes && (
        <>
          <TealH2>Clearance and Access</TealH2>
          <Text style={s.para}>{ds.clearanceNotes}</Text>
        </>
      )}

      {ds.massMarginNote && (
        <ActionCallout text={ds.massMarginNote} />
      )}

      <PageFooter />
    </Page>
  )
}

// ─── Module Overview Table ─────────────────────────────────────────────────────
const ModuleOverviewTable = ({ state }: { state: PipelineState }) => {
  const modules = state.modules ?? []
  const cb = state.costBreakdown

  const cols = [
    { label: 'Module', width: '36%' },
    { label: 'Maturity', width: '18%' },
    { label: 'BOM Rows', width: '14%', align: 'right' as const },
    { label: 'Est. Cost', width: '18%', align: 'right' as const },
    { label: 'Mass', width: '14%', align: 'right' as const },
  ]

  const rows = modules.map(m => {
    const maturity = (m as any).maturity || m.status || 'CONCEPTUAL'
    const matColour = /ENGINEERING/i.test(maturity) ? BESS_GREEN
      : /PRELIMINARY/i.test(maturity) ? BESS_AMBER
      : MUTED

    const bomCount = state.parts?.filter(p => p.sourceModuleId === m.id).length ?? 0
    const perMod = cb?.perModule?.find(pm => pm.moduleName === m.name)
    const costGbp = (m as any).estimatedCostGbp ?? perMod?.totalGbp ?? null

    return [
      { text: dash(m.name), bold: true },
      { text: maturity, colour: matColour, bold: true },
      { text: `${bomCount}`, align: 'right' as const },
      { text: fmtGbp(costGbp), align: 'right' as const },
      { text: fmtNum(m.estimatedMassKg, ' kg'), align: 'right' as const },
    ]
  })

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>System Modules and Architecture</Text>
      <Text style={s.para}>
        The system is decomposed into the following functional modules. ENGINEERING maturity indicates
        detailed design complete; PRELIMINARY indicates concept-level only.
      </Text>
      <DarkHeaderTable cols={cols} rows={rows} />
      <PageFooter />
    </Page>
  )
}

// ─── Module Detail Section ─────────────────────────────────────────────────────
const ModuleDetailSection = ({ state }: { state: PipelineState }) => {
  const modules = state.modules ?? []
  const cb = state.costBreakdown

  return (
    <>
      {modules.map((m, idx) => {
        const modParts = state.parts?.filter(p => p.sourceModuleId === m.id) ?? []
        const maturity = (m as any).maturity || m.status || 'CONCEPTUAL'
        const statusNote = (m as any).statusNote
        const leadTime = (m as any).estimatedLeadTimeWeeks || m.leadWeeks

        // Key specs — prefer structured keySpecifications[], fall back to ModuleSpecs
        const keySpecs = (m as any).keySpecifications as Array<{ label: string; value: string }> | undefined
        const specRows: Array<{ label: string; value: string }> = keySpecs?.length
          ? keySpecs
          : [
              m.estimatedMassKg ? { label: 'Mass', value: fmtNum(m.estimatedMassKg, ' kg') } : null,
              m.specs?.powerW ? { label: 'Power', value: fmtNum(m.specs.powerW, ' W') } : null,
              m.specs?.voltageV ? { label: 'Voltage', value: fmtNum(m.specs.voltageV, ' V') } : null,
              m.specs?.energyKwh ? { label: 'Energy', value: fmtNum(m.specs.energyKwh, ' kWh') } : null,
            ].filter((x): x is { label: string; value: string } => x !== null)

        // ── Two-tier BOM: look up IntegratedBomLine for each part ──────────
        // integratedBomLines stored on state by the integrated BOM stage (v2).
        const integratedBomLines: Array<{
          partNumber: string
          name: string
          verification_status?: 'verified' | 'estimated'
          part_class?: string | null
          manufacturer_hint?: string | null
          llm_mpn?: string | null
          bestDistributor?: { sku: string; unitPriceGbp: number; source: string } | null
        }> = (state as any).integratedBomLines ?? []

        const findIntegrated = (p: Part) =>
          integratedBomLines.find(il => il.partNumber === p.partNumber || il.name === p.name) ?? null

        // BOM table columns — two-tier version: Status | Part | MPN | Qty | Unit £ | Total £ | M/B | Gr.
        const bomCols = [
          { label: 'Status', width: '14%' },
          { label: 'Part', width: '26%' },
          { label: 'MPN', width: '14%' },
          { label: 'Qty', width: '6%', align: 'right' as const },
          { label: 'Unit £', width: '10%', align: 'right' as const },
          { label: 'Total £', width: '10%', align: 'right' as const },
          { label: 'M/B', width: '8%' },
          { label: 'Source', width: '12%' },
        ]

        const bomRows = modParts.map(p => {
          const bomLine = state.bomLines?.find(
            bl => bl.childPartId === p.partNumber || bl.childPartId === p.id
          )
          const qty = (bomLine?.quantity && bomLine.quantity > 0) ? bomLine.quantity : 1
          const unitCost = p.estimatedUnitCostGbp ?? 0
          const extCost = unitCost * qty
          const isNoPrice = (p as any).priceSource === 'manifest_no_price'

          // Look up the integrated line for two-tier status
          const il = findIntegrated(p)
          const verStatus = il?.verification_status ?? (p.isPurchased ? 'estimated' : 'estimated')
          const isVerified = verStatus === 'verified'

          // MPN: use best distributor SKU if verified, else LLM MPN hint, else —
          const mpnText = isVerified
            ? (il?.bestDistributor?.sku || il?.llm_mpn || '—')
            : (il?.llm_mpn || '—')

          // Source / manufacturer hint for estimates
          const manufacturerHint = il?.manufacturer_hint
          const sourceText = isVerified
            ? (il?.bestDistributor?.source || 'Distributor')
            : (manufacturerHint ? `Est. — ${manufacturerHint}` : 'OEM estimate')

          const priceSource = (p as any).priceSource as string | undefined
          const grade = isNoPrice ? '—'
            : isVerified ? 'B'
            : priceSource === 'database' || priceSource === 'search' ? 'C'
            : priceSource === 'llm' ? 'D'
            : priceSource === 'heuristic' ? 'E'
            : p.isPurchased ? 'B' : (unitCost > 0 ? 'D' : 'E')

          const mb = p.isPurchased ? 'Buy' : 'Make'

          // Status badge text and colour
          const statusText = isVerified ? '✓ VERIFIED' : '~ ESTIMATE'
          const statusColour = isVerified ? BESS_GREEN : BESS_AMBER

          return [
            { text: statusText, bold: true, colour: statusColour },
            { text: dash(p.name), bold: true },
            { text: mpnText },
            { text: `${qty}`, align: 'right' as const },
            { text: isNoPrice ? 'TBD' : fmtGbp(unitCost), align: 'right' as const },
            { text: isNoPrice ? 'TBD' : fmtGbp(extCost), align: 'right' as const },
            { text: mb },
            { text: sourceText, colour: isVerified ? BESS_GREEN : BESS_AMBER },
          ]
        })

        // Module total
        let tbdCount = 0
        const moduleTotal = modParts.reduce((acc, p) => {
          if ((p as any).priceSource === 'manifest_no_price') { tbdCount++; return acc }
          const q = state.bomLines?.find(bl => bl.childPartId === p.partNumber || bl.childPartId === p.id)?.quantity ?? 1
          return acc + (p.estimatedUnitCostGbp ?? 0) * q
        }, 0)

        return (
          <Page key={idx} size="A4" style={s.page}>
            <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
            <Text style={s.sectionLabel}>System Modules and Architecture</Text>
            <Text style={s.h1}>{dash(m.name)}</Text>

            <MaturityBanner
              maturity={maturity}
              leadTimeWeeks={safeNumber(leadTime)}
              statusNote={statusNote}
            />

            <TealH2>Purpose</TealH2>
            <Text style={s.para}>{pendingStr(m.purpose)}</Text>

            <TealH2>Why It Matters to the System</TealH2>
            <Text style={s.para}>{pendingStr(m.whyItMatters)}</Text>

            <TealH2>Technical Description</TealH2>
            <Text style={s.para}>{pendingStr(m.description)}</Text>

            {specRows.length > 0 && (
              <>
                <TealH2>Key Specifications</TealH2>
                <KVTable rows={specRows} />
              </>
            )}

            <TealH2>Bill of Materials</TealH2>
            <DarkHeaderTable cols={bomCols} rows={bomRows} />

            {/* Module total row */}
            {modParts.length > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -10, marginBottom: 12 }} wrap={false}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK_DARK }}>
                  MODULE TOTAL ({modParts.length} parts{tbdCount > 0 ? `, ${tbdCount} TBD` : ''}): {fmtGbp(moduleTotal)}
                </Text>
              </View>
            )}

            <PageFooter />
          </Page>
        )
      })}
    </>
  )
}

// ─── Cost Section ──────────────────────────────────────────────────────────────
const CostSection = ({ state }: { state: PipelineState }) => {
  const cb = state.costBreakdown as CostBreakdown & {
    overheadLines?: Array<{ label: string; gbp: number }>
    nreItems?: Array<{ label: string; gbp: number }>
    reductionPaths?: Array<{ option: string; savingGbp: string; tradeoff: string; feasible: string }>
    ceilingExceededBanner?: string | null
    perModule?: Array<{ moduleName: string; totalGbp: number; pctOfBom?: number; grade?: string }>
  } | null

  const brief = state.research?.designBrief
  const unitCost = cb?.unitTotalGbp
  const ceiling = cb?.ceilingGbp ?? brief?.constraints?.unitCostCeilingGbp ?? null
  const rawBom = cb?.rawBomCostGbp ?? (unitCost ? unitCost / (cb?.overheadMultiplier || 1.5) : 0)

  const ceilingExceeded = unitCost && ceiling && unitCost > ceiling
  const overBy = (ceilingExceeded && unitCost && ceiling) ? unitCost - ceiling : null
  const overPct = (overBy && ceiling) ? (overBy / ceiling) * 100 : null

  // Overhead lines — prefer structured data, fall back to computed breakdown
  const hasOverheadLines = Array.isArray(cb?.overheadLines) && (cb?.overheadLines?.length ?? 0) > 0
  const overheadLines: Array<{ label: string; value: string }> = hasOverheadLines
    ? cb!.overheadLines!.map(ol => ({ label: ol.label, value: fmtGbp(ol.gbp) }))
    : [
        { label: 'BOM Total', value: fmtGbp(rawBom) },
        { label: 'Assembly Labour (15%)', value: fmtGbp(rawBom * 0.15) },
        { label: 'Factory Testing (5%)', value: fmtGbp(rawBom * 0.05) },
        { label: 'Shipping (2%)', value: fmtGbp(rawBom * 0.02) },
        { label: 'Overheads (8%)', value: fmtGbp(rawBom * 0.08) },
        { label: 'Contingency (10%)', value: fmtGbp(rawBom * 0.10) },
        { label: 'ESTIMATED UNIT COST', value: fmtGbp(unitCost) },
      ]

  // NRE items — prefer structured data, fall back to regulatory heuristic
  const hasNreItems = Array.isArray(cb?.nreItems) && (cb?.nreItems?.length ?? 0) > 0
  const regs = brief?.regulatory ?? []
  const productClass = state.productClass || state.research?.industryDomain || ''
  const nreBreakdown = computeNreFromRegulatory(regs, productClass)
  const nreTotal = hasNreItems
    ? cb!.nreItems!.reduce((a, n) => a + n.gbp, 0)
    : (nreBreakdown.totalGbp > 0 ? nreBreakdown.totalGbp : (cb?.nreTotalGbp ?? 0))

  const nreCols = [
    { label: 'NRE Item', width: '70%' },
    { label: 'Cost', width: '30%', align: 'right' as const },
  ]
  const nreRows = hasNreItems
    ? cb!.nreItems!.map(item => [
        { text: dash(item.label), bold: true },
        { text: fmtGbp(item.gbp), align: 'right' as const },
      ])
    : nreBreakdown.items.map(item => [
        { text: dash(item.standardName), bold: true },
        { text: fmtGbp(item.estimatedCostGbp), align: 'right' as const },
      ])

  // BOM by module
  const perModuleCols = [
    { label: 'Module', width: '44%' },
    { label: 'BOM Cost', width: '22%', align: 'right' as const },
    { label: '% of BOM', width: '14%', align: 'right' as const },
    { label: 'Grade', width: '20%' },
  ]
  const perModuleRows = (cb?.perModule ?? []).map(pm => [
    { text: dash(pm.moduleName), bold: true },
    { text: fmtGbp(pm.totalGbp), align: 'right' as const },
    {
      text: (pm as any).pctOfBom != null ? `${((pm as any).pctOfBom as number).toFixed(1)}%` : '—',
      align: 'right' as const,
    },
    { text: (pm as any).grade ? gradeTag((pm as any).grade) : '[?]' },
  ])

  // Cost reduction paths — prefer structured data, fall back to static
  const hasReductionPaths = Array.isArray(cb?.reductionPaths) && (cb?.reductionPaths?.length ?? 0) > 0
  const reductionCols = [
    { label: 'Option', width: '34%' },
    { label: 'Saving', width: '18%' },
    { label: 'Trade-off', width: '30%' },
    { label: 'Feasible?', width: '18%' },
  ]
  const reductionRows = hasReductionPaths
    ? cb!.reductionPaths!.map(rp => [
        { text: dash(rp.option), bold: true },
        { text: dash(rp.savingGbp) },
        { text: dash(rp.tradeoff) },
        {
          text: dash(rp.feasible),
          colour: /^Yes/i.test(rp.feasible) ? BESS_GREEN : /^No/i.test(rp.feasible) ? BESS_RED : BESS_AMBER,
          bold: true,
        },
      ])
    : [
        [{ text: 'Design for manufacturing redesign of enclosure', bold: true }, { text: '12–15%' }, { text: 'Requires tooling redesign' }, { text: 'Maybe', colour: BESS_AMBER, bold: true }],
        [{ text: 'Volume sourcing agreement for primary cells', bold: true }, { text: '8–10%' }, { text: 'Requires volume commitment' }, { text: 'Yes', colour: BESS_GREEN, bold: true }],
        [{ text: 'Substitute aerospace-grade connectors', bold: true }, { text: '4–5%' }, { text: 'Low risk trade' }, { text: 'Yes', colour: BESS_GREEN, bold: true }],
        [{ text: 'Offshore wire harness assembly', bold: true }, { text: '6–8%' }, { text: 'Supply chain complexity' }, { text: 'Maybe', colour: BESS_AMBER, bold: true }],
      ]

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>Cost Waterfall and Economics</Text>

      {/* Cost ceiling exceeded banner */}
      {ceilingExceeded && (
        <FeasibilityDecisionBanner
          label="COST CEILING EXCEEDED"
          verdict={`Estimated unit cost: ${fmtGbp(unitCost)} | Target ceiling: ${fmtGbp(ceiling)} | Overshoot: ${fmtGbp(overBy)} (${(overPct ?? 0).toFixed(1)}%)`}
          colour={BESS_AMBER}
        />
      )}

      {!unitCost ? (
        <Text style={[s.para, { color: MUTED }]}>Cost computation pending — requires completed BOM and sizing data.</Text>
      ) : (
        <>
          <TealH2>BOM Cost by Module</TealH2>
          <DarkHeaderTable cols={perModuleCols} rows={perModuleRows} />

          <TealH2>Overhead and Assembly Costs</TealH2>
          <KVTable rows={overheadLines} />

          <TealH2>Non-Recurring Engineering (NRE)</TealH2>
          <Text style={s.para}>
            NRE covers certification testing, tooling, and regulatory compliance activities. Amortised per unit at stated production volume.
          </Text>
          <DarkHeaderTable cols={nreCols} rows={nreRows} />
          {nreTotal > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -10, marginBottom: 12 }} wrap={false}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold' }}>NRE Total: {fmtGbp(nreTotal)}</Text>
            </View>
          )}

          <TealH2>Cost Reduction Paths</TealH2>
          <Text style={s.para}>Options for reducing unit cost without compromising core specification.</Text>
          <DarkHeaderTable cols={reductionCols} rows={reductionRows} />
        </>
      )}

      <PageFooter />
    </Page>
  )
}

// ─── Supplier Appendix ─────────────────────────────────────────────────────────
// Per Tristan's decision: include as appendix pages with BESS visual treatment.
const SupplierAppendix = ({ state }: { state: PipelineState }) => {
  const parts = state.parts ?? []
  const suppliers = state.suppliers ?? []

  const buyParts = parts.filter(p => (p.regime || classifyRegime(p).regime) === 'buy_electronic')
  const makeParts = parts.filter(p => (p.regime || classifyRegime(p).regime) === 'make_custom_fab')
  const serviceParts = parts.filter(p => (p.regime || classifyRegime(p).regime) === 'service_certification')
  const otherParts = parts.filter(p => {
    const r = p.regime || classifyRegime(p).regime
    return r === 'buy_mechanical_industrial' || r === 'named_manufacturer_reseller'
  })

  const supplierCols = [
    { label: 'Part', width: '34%' },
    { label: 'Supplier', width: '26%' },
    { label: 'Price (£)', width: '16%', align: 'right' as const },
    { label: 'Confidence', width: '24%' },
  ]

  const buildRows = (partsSubset: Part[]) =>
    partsSubset.map(p => {
      const rr = p.regimeRouterResult
      const supMatch = suppliers.find(s => s.partId === p.id || s.partName === p.name)
      const topSup = supMatch?.suppliers?.[0]
      const supplierName = rr?.supplier || topSup?.name || '—'
      const price = rr?.priceGbp ?? p.estimatedUnitCostGbp
      const conf = rr?.confidence || 'LOW'
      const confColour = conf === 'HIGH' ? BESS_GREEN : conf === 'MEDIUM' ? BESS_AMBER : MUTED
      return [
        { text: dash(p.name), bold: true },
        { text: dash(supplierName) },
        { text: fmtGbp(price), align: 'right' as const },
        { text: conf, colour: confColour },
      ]
    })

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>Assembly Shortlist</Text>
      <Text style={[s.para, { color: MUTED }]}>
        Companies capable of assembling the complete product — sourced from Nightshift corpus and live search. Verify independently before engagement.
      </Text>

      {buyParts.length > 0 && (
        <>
          <TealH2>Parts to Buy (Electronic)</TealH2>
          <DarkHeaderTable cols={supplierCols} rows={buildRows(buyParts)} />
        </>
      )}

      {makeParts.length > 0 && (
        <>
          <TealH2>Parts to Make (Custom Fabrication)</TealH2>
          <DarkHeaderTable cols={supplierCols} rows={buildRows(makeParts)} />
        </>
      )}

      {serviceParts.length > 0 && (
        <>
          <TealH2>Services and Certification</TealH2>
          <DarkHeaderTable cols={supplierCols} rows={buildRows(serviceParts)} />
        </>
      )}

      {otherParts.length > 0 && (
        <>
          <TealH2>Other Parts (Mechanical / Industrial)</TealH2>
          <DarkHeaderTable cols={supplierCols} rows={buildRows(otherParts)} />
        </>
      )}

      {parts.length === 0 && (
        <Text style={[s.para, { color: MUTED }]}>No assembly partner data available — assembly shortlist pending BOM completion.</Text>
      )}

      <PageFooter />
    </Page>
  )
}

// ─── FMEA / Risk Register ──────────────────────────────────────────────────────
const FMEASection = ({ state }: { state: PipelineState }) => {
  const allRisks = state.modules?.flatMap(m =>
    (m.riskMatrix ?? []).map(r => ({ ...r, moduleId: m.id, moduleName: m.name }))
  ) ?? []

  // Flatten state.fmea if present, else use module-derived
  const topLevelFmea = (state as any).fmea as Array<RiskRow & { moduleId?: string; moduleName?: string }> | undefined
  const risks = (topLevelFmea?.length ? topLevelFmea : allRisks).map(r => ({
    ...r,
    detection: (r as any).detection ?? 5,
    rpn: getRPN(r),
  })).sort((a, b) => b.rpn - a.rpn)

  const rpnColour = (rpn: number) => rpn >= 200 ? BESS_RED : rpn >= 100 ? BESS_AMBER : BESS_GREEN

  const summaryCols = [
    { label: 'ID', width: '10%' },
    { label: 'Module', width: '16%' },
    { label: 'Failure Mode', width: '26%' },
    { label: 'S', width: '6%', align: 'right' as const },
    { label: 'O', width: '6%', align: 'right' as const },
    { label: 'D', width: '6%', align: 'right' as const },
    { label: 'RPN', width: '10%', align: 'right' as const },
    { label: 'Owner', width: '12%' },
    { label: 'Gr.', width: '8%' },
  ]

  const summaryRows = risks.map(r => {
    const grade = (r as any).gradeOverride || 'D'
    return [
      { text: dash(r.id) },
      { text: dash((r as any).moduleName) },
      { text: dash(r.hazard) },
      { text: `${r.severity ?? '—'}`, align: 'right' as const },
      { text: `${r.likelihood ?? '—'}`, align: 'right' as const },
      { text: `${(r as any).detection ?? 5}`, align: 'right' as const },
      { text: `${r.rpn}`, colour: rpnColour(r.rpn), bold: true, align: 'right' as const },
      { text: dash(r.owner) },
      { text: gradeTag(grade) },
    ]
  })

  return (
    <>
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
        <Text style={s.h1}>Risk Register (FMEA)</Text>
        <Text style={s.para}>
          Risk Priority Number (RPN) = Severity × Occurrence × Detection, each rated 1–10.
          Detection captures likelihood of escaping undetected (10 = certain to escape).
          All risks are Grade D unless otherwise noted. Rows sorted highest-RPN first.
        </Text>

        <DarkHeaderTable cols={summaryCols} rows={summaryRows} />

        {/* Summary counts */}
        {risks.length > 0 && (() => {
          const critical = risks.filter(r => r.rpn >= 200).length
          const action = risks.filter(r => r.rpn >= 100 && r.rpn < 200).length
          const ok = risks.filter(r => r.rpn < 100).length
          return (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: BESS_RED }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_RED }}>{critical} critical (RPN ≥ 200)</Text>
                <Text style={{ fontSize: 8, color: INK }}>Design change required before production</Text>
              </View>
              <View style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: BESS_AMBER }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_AMBER }}>{action} action required (RPN 100–199)</Text>
                <Text style={{ fontSize: 8, color: INK }}>Mitigation and verification test needed</Text>
              </View>
              <View style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: BESS_GREEN }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BESS_GREEN }}>{ok} acceptable (RPN &lt; 100)</Text>
                <Text style={{ fontSize: 8, color: INK }}>Monitor in production</Text>
              </View>
            </View>
          )
        })()}

        <PageFooter />
      </Page>

      {/* Per-risk detail blocks */}
      {risks.map((r, i) => (
        <Page key={i} size="A4" style={s.page}>
          <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
          <Text style={s.sectionLabel}>Risk Register (FMEA)</Text>
          <RiskDetailBlock
            risk={r as RiskRow & { moduleId?: string }}
            moduleName={(r as any).moduleName || '—'}
          />
          <PageFooter />
        </Page>
      ))}
    </>
  )
}

// ─── Audit Log Section ─────────────────────────────────────────────────────────
const AuditLogSection = ({ state }: { state: PipelineState }) => {
  // Use pipelineTrace[] if populated upstream; fall back to static construction
  const pipelineTrace = (state as any).pipelineTrace as Array<{
    step: string
    status: string
    durationMs?: number | null
    source: string
    notes: string
  }> | undefined

  const statusColour = (st: string) =>
    /^complete/i.test(st) ? BESS_GREEN
    : /^feasible/i.test(st) ? BESS_TEAL
    : /^warn/i.test(st) ? BESS_AMBER
    : /^fail|blocked/i.test(st) ? BESS_RED
    : MUTED

  const auditSteps = pipelineTrace?.length
    ? pipelineTrace
    : [
        { step: 'Brief Parsing', status: state.briefText ? 'Complete' : 'BLOCKED', durationMs: null, source: 'Deterministic', notes: state.briefText ? 'Brief extracted' : 'No brief provided' },
        { step: 'Research', status: state.research ? 'Complete' : 'BLOCKED', durationMs: null, source: 'LLM', notes: state.research ? 'Research complete' : 'Research not run' },
        { step: 'Module Decomposition', status: (state.modules?.length ?? 0) > 0 ? 'Complete' : 'BLOCKED', durationMs: null, source: 'LLM', notes: `${state.modules?.length ?? 0} modules created` },
        { step: 'Sizing Solver', status: state.dimensionSheet ? (state.dimensionSheet.feasible ? 'FEASIBLE' : 'INFEASIBLE') : 'BLOCKED', durationMs: null, source: 'Deterministic', notes: state.dimensionSheet?.feasible ? 'Feasible layout' : 'No layout data' },
        { step: 'BOM and Cost', status: (state.parts?.length ?? 0) > 0 ? 'Complete' : 'BLOCKED', durationMs: null, source: 'LLM + Deterministic', notes: `${state.parts?.length ?? 0} BOM lines, total ${fmtGbp(state.costBreakdown?.unitTotalGbp)}` },
        { step: 'Assembly Shortlist', status: (state.suppliers?.length ?? 0) > 0 ? 'Complete' : 'WARN', durationMs: null, source: 'Corpus + API', notes: `${state.suppliers?.length ?? 0} assembly partner matches` },
        { step: 'Feasibility Gate', status: 'Complete', durationMs: null, source: 'Deterministic', notes: 'Gate checks evaluated' },
        { step: 'PDF Generation', status: 'Complete', durationMs: null, source: 'ForgeOS PDF Engine v3', notes: 'BESS-style renderer' },
      ]

  const cols = [
    { label: 'Pipeline Step', width: '24%' },
    { label: 'Status', width: '16%' },
    { label: 'Duration', width: '14%', align: 'right' as const },
    { label: 'Source', width: '22%' },
    { label: 'Notes', width: '24%' },
  ]

  const rows = auditSteps.map(step => [
    { text: dash(step.step), bold: true },
    { text: dash(step.status), colour: statusColour(step.status), bold: true },
    {
      text: step.durationMs != null ? `${(step.durationMs / 1000).toFixed(1)}s` : '—',
      align: 'right' as const,
    },
    { text: dash(step.source) },
    { text: dash(step.notes) },
  ])

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>Audit Log</Text>
      <Text style={[s.para, { color: MUTED }]}>
        Pipeline execution trace for this report generation.
      </Text>
      <DarkHeaderTable cols={cols} rows={rows} />
      <PageFooter />
    </Page>
  )
}

// ─── Source Attribution Section ────────────────────────────────────────────────
const SourceAttributionSection = ({ state }: { state: PipelineState }) => {
  // Use pipelineSourceSummary[] if populated; fall back to static attribution
  const summaryData = (state as any).pipelineSourceSummary as Array<{
    section: string
    grade: string
    source: string
    verificationStatus: string
  }> | undefined

  const staticRows = [
    { section: 'Brief and Requirements', grade: 'A', source: 'Founder brief + engine expansion', verificationStatus: 'User-provided; engine-expanded assumptions flagged' },
    { section: 'Sizing and Spatial Allocation', grade: 'B', source: 'Deterministic box-packing solver', verificationStatus: 'Solver output; physical verification required before manufacture' },
    { section: 'Feasibility Gate', grade: 'B', source: 'Deterministic checks on brief + sizing result', verificationStatus: 'Rules-based; informed by real solver output' },
    { section: 'System Modules and Architecture', grade: 'D', source: 'LLM decomposition', verificationStatus: 'Engineering estimate — not verified by specialist' },
    { section: 'Assembly Shortlist', grade: 'C', source: 'Nightshift corpus + live search', verificationStatus: 'Unverified — verify assembly capability independently before engagement' },
    { section: 'Cost Waterfall and Economics', grade: 'C/D', source: 'Arithmetic model + distributor API prices', verificationStatus: 'Unverified — cross-check with assembly partner quotes before committing' },
    { section: 'Regulatory and Compliance', grade: 'C/D', source: 'LLM knowledge base + regulatory corpus', verificationStatus: 'Unverified — certificate not yet obtained' },
    { section: 'Risk Register (FMEA)', grade: 'D', source: 'LLM synthesis', verificationStatus: 'All risks OPEN — verification tests not yet executed' },
  ]

  const data = summaryData?.length ? summaryData : staticRows

  const cols = [
    { label: 'Section', width: '30%' },
    { label: 'Grade', width: '10%' },
    { label: 'Source', width: '30%' },
    { label: 'Verification Status', width: '30%' },
  ]

  const rows = data.map(row => [
    { text: dash(row.section), bold: true },
    { text: dash(row.grade), bold: true },
    { text: dash(row.source) },
    { text: dash(row.verificationStatus) },
  ])

  return (
    <Page size="A4" style={s.page}>
      <PageHeader projectId={dash(state.projectId)} revision="Rev A" />
      <Text style={s.h1}>Source Attribution</Text>
      <Text style={s.para}>
        Every section is graded A–E by provenance: A = primary test data, B = engineering analysis or solver, C = published industry data, D = expert estimate or LLM synthesis, E = unverified hypothesis.
      </Text>

      <DarkHeaderTable cols={cols} rows={rows} />

      <Text style={[s.para, { fontFamily: 'Helvetica-Bold', marginTop: 16 }]}>
        Disclaimer: This report is generated by an automated engineering engine. All estimates, specifications, and assessments require review by a qualified engineer before use in procurement, design, or investment decisions. Fractional Forge accepts no liability for decisions made solely on the basis of this report.
      </Text>

      <PageFooter />
    </Page>
  )
}

// ─── Section inclusion helpers (Phase G) ─────────────────────────────────────

/**
 * Section ID → section name mapping (matches PA Stage 9 router output).
 *
 * New render order (2026-05-09):
 *   §1  Cover        (always rendered)
 *   §2  Brief        → BriefPages (always rendered)
 *   §3  'sizing'     → SizingSection
 *   §4  'feasibility'→ FeasibilityGatePage (now AFTER Sizing)
 *   §5  'modules'    → ModuleOverviewTable + ModuleDetailSection
 *   §6  'bom'        → BOM embedded in module detail; 'bom' guard is subset of 'modules'
 *   §7  'suppliers'  → SupplierAppendix (renamed "Assembly Shortlist" in UI)
 *   §8  'cost'       → CostSection
 *   §9  'regulatory' → RegulatoryOverviewSection + per-standard blocks
 *   §10 'risks'      → FMEASection
 *   §11 'audit_log'  → AuditLogSection
 *   §12 'source_attrib' → SourceAttributionSection
 *   'research' is embedded in Brief (not a separate rendered section)
 *
 * Cover and BriefPages are ALWAYS rendered (never excluded).
 */

/**
 * Estimate the number of PDF pages for a named section.
 *
 * Used for max-pages enforcement. Conservative upper bounds per section.
 */
function _estimateSectionPages(sectionId: string, safe: PipelineState): number {
  const regs = (safe.research?.designBrief?.regulatory ?? []) as unknown[]
  const moduleCount = safe.modules?.length ?? 0
  const riskCount = safe.modules?.flatMap(m => m.riskMatrix ?? []).length ?? 0

  switch (sectionId) {
    case 'cover':         return 1
    case 'brief':         return 2
    case 'feasibility':   return 1
    case 'regulatory':    return 1 + Math.min(regs.length, 10)
    case 'sizing':        return 1
    case 'modules':       return 1 + moduleCount  // overview + per-module detail
    case 'cost':          return 1
    case 'suppliers':     return 1
    case 'risks':         return 1 + Math.min(riskCount, 20)
    case 'audit_log':     return 1
    case 'source_attrib': return 1
    default:              return 1
  }
}

// G-B1 fix: source_attrib is mandatory and always renders (JSX unconditional render).
// It must NOT appear in TRIM_ORDER — the loop cannot suppress it, so trimming it
// would waste a trim slot while the page is still emitted (phantom saving).
// source_attrib is counted in the _applyMaxPages base estimate only.
// G-B3 fix: source_attrib is now gated by show('source_attrib') so it CAN be
// excluded on BRIEF_INCOMPLETE when the router adds it to excludedSections.
// When excluded it is omitted from the base estimate too (see _applyMaxPages below).
//
// Trim order: least-critical sections first; cover/brief are never trimmed.
const TRIM_ORDER = [
  'audit_log',
  'suppliers',
  'risks',
  'cost',
  'modules',
  'regulatory',
  'sizing',
  'feasibility',
  // source_attrib: trimmed LAST — only removed if nothing else can save enough pages.
  'source_attrib',
]

/**
 * Apply max-pages enforcement by trimming trailing optional sections.
 *
 * React-PDF does not support hard page limits natively. This guard removes
 * sections from the included set (starting with least-critical) until the
 * estimated page total is at or under maxPages. Mandatory sections
 * (cover, brief) are never trimmed. source_attrib is trimmed last.
 *
 * G-B1 fix: source_attrib is no longer double-counted. It is counted in the
 * base only if it is present in the included Set (i.e. not excluded by router).
 * It is also listed at the END of TRIM_ORDER so the loop can trim it last if
 * needed, but the JSX now respects show('source_attrib').
 *
 * @param maxPages  0 = no cap (FULL_REPORT); >0 = enforce cap
 */
function _applyMaxPages(
  included: Set<string>,
  maxPages: number,
  safe: PipelineState,
  auditWarnings: string[],
): Set<string> {
  if (maxPages === 0) return included

  // Always-rendered: cover + brief.  source_attrib is conditional (gated by show()).
  let estimated = _estimateSectionPages('cover', safe) + _estimateSectionPages('brief', safe)
  // Add source_attrib to base estimate only if it is in the included Set.
  // (G-B1 fix: was unconditionally added, causing double-count when it also
  // appeared first in TRIM_ORDER and was then "removed" from the loop.)
  if (included.has('source_attrib')) {
    estimated += _estimateSectionPages('source_attrib', safe)
  }
  for (const sec of TRIM_ORDER) {
    // source_attrib was already counted above; skip it in the sum loop to
    // avoid double-counting it (it IS in TRIM_ORDER for the trim pass below).
    if (sec === 'source_attrib') continue
    if (included.has(sec)) {
      estimated += _estimateSectionPages(sec, safe)
    }
  }

  if (estimated <= maxPages) return included

  const trimmed = new Set(included)
  for (const sec of TRIM_ORDER) {
    if (estimated <= maxPages) break
    if (trimmed.has(sec)) {
      const saving = _estimateSectionPages(sec, safe)
      trimmed.delete(sec)
      estimated -= saving
      const msg = `[pdf-v3] max-pages cap (${maxPages}): trimmed '${sec}' (saved ~${saving} pages, est now ~${estimated})`
      console.warn(msg)
      auditWarnings.push(msg)
    }
  }

  return trimmed
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export default function PdfRendererV3({ state }: { state: PipelineState }) {
  const safe = normaliseState(state) as PipelineState

  const regs = (safe.research?.designBrief?.regulatory ?? []) as Array<RegulatoryItem & {
    sourceGrade?: string
    jurisdiction?: string
  }>

  // ── Phase G: Report Type routing ──────────────────────────────────────────
  // Read the router result stamped on state by PA Stage 9 (index.ts).
  // On legacy path (PA_PIPELINE=false) this field is absent — default to
  // FULL_REPORT behaviour (nothing excluded, no page cap).
  const routerResult = (safe as any).reportTypeRouterResult as {
    reportType: string
    maxPages: number
    excludedSections: string[]
    reason?: string
  } | undefined

  const excludedSections: string[] = routerResult?.excludedSections ?? []
  const maxPages: number = routerResult?.maxPages ?? 0

  // Build included-sections set: start with all optional sections, remove excluded.
  // G-B2 fix: 'bom' and 'research' are now registered in the Set so that
  //   included.delete('bom') / included.delete('research') are NOT silent no-ops
  //   when the router emits them in excludedSections.
  // G-B3 fix: 'source_attrib' remains in the Set so that the router can exclude
  //   it on BRIEF_INCOMPLETE (included.delete('source_attrib') will now work).
  const included = new Set([
    'feasibility',
    'regulatory',
    'sizing',
    'modules',
    'bom',        // G-B2: registered so router exclusions take effect
    'cost',
    'suppliers',
    'risks',
    'research',   // G-B2: registered so router exclusions take effect
    'audit_log',
    'source_attrib',
  ])
  for (const id of excludedSections) {
    included.delete(id)
  }

  // Apply max-pages enforcement (trims trailing optional sections if over cap).
  const auditWarnings: string[] = []
  const finalSections = _applyMaxPages(included, maxPages, safe, auditWarnings)

  // Convenience predicate
  const show = (id: string): boolean => finalSections.has(id)

  // ToC: only render when estimated page count > 25 AND FULL_REPORT.
  const moduleCount = safe.modules?.length ?? 0
  const regCount = regs.length
  const riskCount = safe.modules?.flatMap(m => m.riskMatrix ?? []).length ?? 0
  const estimatedPages = 2 + 2 + (1 + regCount) + 1 + (1 + moduleCount) + 1 + 1 + (1 + riskCount) + 1 + 1
  const showToc = estimatedPages > 25 && (routerResult?.reportType ?? 'FULL_REPORT') === 'FULL_REPORT'

  return (
    <Document
      title={`Engineering Report: ${dash(safe.projectId)}`}
      author="Fractional Forge PDF Engine v3"
    >
      {/* Cover — always rendered */}
      <SafeSection name="Cover">
        <CoverPage state={safe} />
      </SafeSection>

      {/* Table of Contents — only when >25 pages on FULL_REPORT */}
      {showToc && (
        <SafeSection name="TableOfContents">
          <TableOfContents show={showToc} />
        </SafeSection>
      )}

      {/* Brief and Requirements — always rendered (§2 in new order) */}
      <SafeSection name="Brief">
        <BriefPages state={safe} />
      </SafeSection>

      {/* Sizing and Spatial Allocation — excluded on BRIEF_INCOMPLETE (§3) */}
      {show('sizing') && (
        <SafeSection name="Sizing">
          <SizingSection state={safe} />
        </SafeSection>
      )}

      {/* Feasibility Gate — excluded on BRIEF_INCOMPLETE (§4, now AFTER Sizing) */}
      {show('feasibility') && (
        <SafeSection name="FeasibilityGate">
          <FeasibilityGatePage state={safe} />
        </SafeSection>
      )}

      {/* Module overview table — excluded on BRIEF_INCOMPLETE and FEASIBILITY_EXCEPTION (§5) */}
      {show('modules') && (
        <SafeSection name="ModuleOverview">
          <ModuleOverviewTable state={safe} />
        </SafeSection>
      )}

      {/* Per-module detail pages — excluded on BRIEF_INCOMPLETE and FEASIBILITY_EXCEPTION (§5 cont.) */}
      {show('modules') && (
        <SafeSection name="ModuleDetail">
          <ModuleDetailSection state={safe} />
        </SafeSection>
      )}

      {/* Assembly Shortlist — excluded on BRIEF_INCOMPLETE and FEASIBILITY_EXCEPTION (§7) */}
      {/* Renamed from "Supplier Appendix": section covers who can ASSEMBLE the product, */}
      {/* not per-component distributors (those live inside BOM lines). */}
      {show('suppliers') && (
        <SafeSection name="AssemblyShortlist">
          <SupplierAppendix state={safe} />
        </SafeSection>
      )}

      {/* Cost Waterfall and Economics — excluded on BRIEF_INCOMPLETE (§8) */}
      {show('cost') && (
        <SafeSection name="Cost">
          <CostSection state={safe} />
        </SafeSection>
      )}

      {/* Regulatory Overview — excluded on BRIEF_INCOMPLETE (§9) */}
      {show('regulatory') && (
        <SafeSection name="RegulatoryOverview">
          <RegulatoryOverviewSection state={safe} />
        </SafeSection>
      )}

      {/* Per-standard regulatory detail pages — excluded on BRIEF_INCOMPLETE (§9 cont.) */}
      {show('regulatory') && regs.slice(0, 10).map((reg, idx) => (
        <SafeSection key={`reg-${idx}`} name={`Reg:${reg.code}`}>
          <RegulatoryStandardBlock reg={reg} idx={idx} />
        </SafeSection>
      ))}

      {/* FMEA / Risk Register — excluded on BRIEF_INCOMPLETE and FEASIBILITY_EXCEPTION (§10) */}
      {show('risks') && (
        <SafeSection name="FMEA">
          <FMEASection state={safe} />
        </SafeSection>
      )}

      {/* Audit Log — excluded on BRIEF_INCOMPLETE */}
      {show('audit_log') && (
        <SafeSection name="AuditLog">
          <AuditLogSection state={safe} />
        </SafeSection>
      )}

      {/* Source Attribution — conditional on show('source_attrib').
          G-B3 fix: was unconditionally rendered; now gated so BRIEF_INCOMPLETE
          (and any future route that excludes 'source_attrib') can suppress it.
          Router adds 'source_attrib' to BRIEF_INCOMPLETE_EXCLUDED so the spec
          "cover + brief only" is honoured exactly. */}
      {show('source_attrib') && (
        <SafeSection name="SourceAttribution">
          <SourceAttributionSection state={safe} />
        </SafeSection>
      )}
    </Document>
  )
}

// ── Phase G: exported helpers for testing ────────────────────────────────────
export { _estimateSectionPages, _applyMaxPages }
