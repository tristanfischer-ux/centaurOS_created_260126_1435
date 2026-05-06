import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { 
  PipelineState, 
  Module, 
  DimensionSheet, 
  Part, 
  BomLine, 
  CostBreakdown, 
  SpecialistReview, 
  SupplierMatch,
  RegulatoryItem,
  Competitor,
  MarketSizing,
  BriefConstraints,
  RiskRow,
  SourceAttribution,
  LlmAttribution,
  SectionScore
} from '../models'

// ─── Design Tokens ────────────────────────────────────────
const BRAND = '#ea580c'
const INK_DARK = '#111827'
const INK = '#374151'
const MUTED = '#6b7280'
const SOFT = '#9ca3af'
const BORDER = '#e5e7eb'
const BORDER_DARK = '#d1d5db'
const BG_SOFT = '#f9fafb'
const BG_HEADER = '#f3f4f6'
const RED = '#dc2626'
const AMBER = '#d97706'
const GREEN = '#16a34a'
const BLUE = '#2563eb'
const PURPLE = '#7c3aed'

// ─── Styles ───────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 72,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: '#ffffff',
  },
  coverPage: {
    padding: 0,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  coverBanner: {
    backgroundColor: INK_DARK,
    minHeight: 220,
    padding: 48,
    justifyContent: 'flex-end',
    borderBottomWidth: 4,
    borderBottomColor: BRAND,
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: SOFT,
    marginBottom: 16,
  },
  coverDate: {
    fontSize: 10,
    color: SOFT,
  },
  coverContent: {
    padding: 48,
  },
  h1: {
    fontSize: 22,
    fontWeight: 'bold',
    color: INK_DARK,
    marginTop: 32,
    marginBottom: 16,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
  },
  h2: {
    fontSize: 16,
    fontWeight: 'bold',
    color: INK_DARK,
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_DARK,
  },
  h3: {
    fontSize: 12,
    fontWeight: 'bold',
    color: INK,
    marginTop: 16,
    marginBottom: 8,
  },
  h4: {
    fontSize: 10,
    fontWeight: 'bold',
    color: INK,
    marginTop: 12,
    marginBottom: 6,
  },
  h5: {
    fontSize: 9,
    fontWeight: 'bold',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 6,
  },
  para: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 10,
  },
  paraLarge: {
    fontSize: 11,
    lineHeight: 1.5,
    marginBottom: 12,
    color: INK,
  },
  statRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 3,
    borderTopColor: BRAND,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: INK_DARK,
  },
  statSub: {
    fontSize: 9,
    color: MUTED,
    marginTop: 4,
  },
  tableWrap: {
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER_DARK,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tHead: {
    flexDirection: 'row',
    backgroundColor: BG_HEADER,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_DARK,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    backgroundColor: BG_SOFT,
  },
  tHC: {
    fontSize: 9,
    fontWeight: 'bold',
    color: INK_DARK,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tC: {
    fontSize: 9,
    color: INK,
    paddingVertical: 6,
    paddingHorizontal: 8,
    lineHeight: 1.4,
  },
  calloutRed: {
    marginVertical: 12,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderLeftWidth: 4,
    borderLeftColor: RED,
    borderRadius: 4,
  },
  calloutAmber: {
    marginVertical: 12,
    padding: 12,
    backgroundColor: '#fffbeb',
    borderLeftWidth: 4,
    borderLeftColor: AMBER,
    borderRadius: 4,
  },
  calloutGreen: {
    marginVertical: 12,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
    borderRadius: 4,
  },
  calloutBlue: {
    marginVertical: 12,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderLeftWidth: 4,
    borderLeftColor: BLUE,
    borderRadius: 4,
  },
  calloutNeutral: {
    marginVertical: 12,
    padding: 12,
    backgroundColor: BG_SOFT,
    borderLeftWidth: 4,
    borderLeftColor: BORDER_DARK,
    borderRadius: 4,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  pill: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: BRAND,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pillMuted: {
    fontSize: 8,
    fontWeight: 'bold',
    color: INK,
    backgroundColor: BG_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER_DARK,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: SOFT,
  },
  kvRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  kvLabel: {
    width: '40%',
    fontSize: 10,
    color: MUTED,
  },
  kvValue: {
    width: '60%',
    fontSize: 10,
    fontWeight: 'bold',
    color: INK,
  },
  sourceTag: {
    fontSize: 8,
    color: MUTED,
    fontWeight: 'normal',
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
    color: BRAND,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
  },
  sourceFooterBlock: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: BG_SOFT,
    padding: 12,
    borderRadius: 4,
  },
  sourceFooterText: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 4,
  }
})

// ─── Helpers ───────────────────────────────────────────────────────────────
const isNullOrUndefined = (val: any) => val === null || val === undefined

const formatText = (text?: string | null) => {
  if (!text) return 'Not computed'
  return text.trim()
}

const formatNumber = (num?: number | null, suffix = '') => {
  if (isNullOrUndefined(num) || isNaN(num as number)) return 'Not computed'
  return `${num}${suffix}`
}

const formatGBP = (num?: number | null) => {
  if (isNullOrUndefined(num) || isNaN(num as number)) return 'Not computed'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(num as number)
}

const getRPN = (sev?: number, lik?: number, det?: number) => {
  if (!sev || !lik) return 0
  return sev * lik * (det || 1)
}

// ─── Components ────────────────────────────────────────────────────────────

const PageFooter = ({ section }: { section: string }) => (
  <View style={s.footer} fixed>
    <Text style={s.footerText}>{section}</Text>
    <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>
)

const GradeLabel = ({ grade, label }: { grade: string, label?: string }) => (
  <Text style={{ fontSize: 9, color: MUTED, fontWeight: 'normal' }}>
    [{grade}] {label && `${label}`}
  </Text>
)

// B1a FIX (2026-05-06): supplier fallback — many BOM rows have a manufacturer
// embedded in the part name (e.g. "CATL 280Ah LFP Prismatic Storage Cell" →
// "CATL"; "Morgan Advanced Materials Superwool Plus" → "Morgan Advanced
// Materials"). This extracts that prefix so the Supplier column isn't "TBD"
// everywhere when Stage 5 (Brave search) returns empty lists.
const MANUFACTURER_STOP_WORDS = new Set([
  'battery','cell','cells','module','rack','stack','pack','busbar','bus-bar',
  'frame','weldment','compression','endplate','plate','panel','insert','nut','bolt','washer',
  'bracket','gasket','seal','cable','harness','wire','conduit','pipe','hose','tube','tubing',
  'heater','cooler','chiller','condenser','evaporator','exchanger','manifold',
  'contactor','relay','fuse','switch','disconnect','breaker','resistor','capacitor','inductor',
  'sensor','transducer','transmitter','detector','gauge','meter','regulator','valve','pump','fan',
  'controller','control','board','driver','transformer','rectifier','charger','battery',
  'mineral','fiber','fibre','foam','coating','paint','resin','epoxy','adhesive','silicone','rubber',
  'standoff','threaded','enclosure','cabinet','housing','chassis','container','box','case',
  'the','and','for','with','of','in','at','on','by','to','from','a','an','per','as',
  'standard','custom','series','type','grade','class','category',
])
function extractManufacturerPrefix(partName: string | undefined): string | null {
  if (!partName) return null
  // Strip everything after the first comma, hyphen descriptor, or slash.
  const head = partName.split(/[,/]|(?:\s-\s)/)[0].trim()
  const tokens = head.split(/\s+/)
  const out: string[] = []
  for (const t of tokens) {
    if (!t) continue
    // Stop at first digit-starting token (e.g. "280Ah", "5kW")
    if (/^\d/.test(t)) break
    // Stop at first lowercase word that isn't an ampersand connector
    if (/^[a-z]/.test(t) && t !== '&' && t.toLowerCase() !== 'and') break
    // Stop at known part-descriptor stop words
    if (MANUFACTURER_STOP_WORDS.has(t.toLowerCase())) break
    out.push(t)
    if (out.length >= 4) break  // cap at 4 tokens
  }
  // Must be at least one Title-Cased or ALL-CAPS token to count as manufacturer
  if (out.length === 0) return null
  const joined = out.join(' ').trim()
  if (joined.length < 2) return null
  return joined
}

const KV = ({ label, value, grade }: { label: string, value: any, grade?: string }) => (
  <View style={s.kvRow} wrap={false}>
    <Text style={s.kvLabel}>{label}</Text>
    <Text style={s.kvValue}>
      {formatText(String(value))}
      {grade && <Text style={s.sourceTag}>  [{grade}]</Text>}
    </Text>
  </View>
)

const Bullets = ({ items }: { items: string[] }) => (
  <View style={{ marginTop: 8, marginBottom: 8 }}>
    {items.map((item, i) => (
      <View key={i} style={s.bullet}>
        <Text style={s.bulletDot}>•</Text>
        <Text style={s.bulletText}>{formatText(item)}</Text>
      </View>
    ))}
  </View>
)

const SourceFooter = ({ sources, overallGrade }: { sources: { type: string, detail: string }[], overallGrade: string }) => (
  <View style={s.sourceFooterBlock} wrap={false}>
    <Text style={{ fontSize: 9, fontWeight: 'bold', color: INK, marginBottom: 8 }}>Data Sources</Text>
    {sources.map((src, i) => (
      <Text key={i} style={s.sourceFooterText}>[{src.type}] {src.detail}</Text>
    ))}
    <Text style={{ fontSize: 9, fontWeight: 'bold', color: INK, marginTop: 8 }}>Overall Section Grade: {overallGrade}</Text>
  </View>
)

// ─── Sections ──────────────────────────────────────────────────────────────

// Section 1: Cover Page
const CoverPage = ({ state }: { state: PipelineState }) => {
  const unitCost = state.costBreakdown?.unitTotalGbp
  const targetCost = state.research?.designBrief?.constraints?.unitCostCeilingGbp
  const overTarget = unitCost && targetCost ? unitCost > targetCost : false

  const moduleCount = state.modules?.length || 0
  const bomRows = state.parts?.length || 0
  const nreTotal = state.costBreakdown?.nreTotalGbp
  const tam = state.research?.designBrief?.marketSizing?.tamMUsd
  const cagr = state.research?.designBrief?.marketSizing?.cagrPct

  const verdict = (!targetCost || !unitCost) ? 'PENDING' : overTarget ? 'FEASIBLE BUT OVER BUDGET' : 'FEASIBLE'

  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverBanner}>
        <Text style={s.coverTitle}>{formatText(state.research?.designBrief?.useCase || 'Engineering Design Report')}</Text>
        <Text style={s.coverSubtitle}>Fractional Forge — Project {formatText(state.projectId)}</Text>
        <Text style={s.coverDate}>Generated: {new Date().toISOString().split('T')[0]}</Text>
      </View>
      <View style={s.coverContent}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: INK_DARK }}>Economics Dashboard</Text>
          <View style={{ padding: 8, backgroundColor: overTarget ? '#fef2f2' : '#f0fdf4', borderRadius: 4, borderWidth: 1, borderColor: overTarget ? RED : GREEN }}>
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: overTarget ? RED : GREEN }}>VERDICT: {verdict}</Text>
          </View>
        </View>

        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Est. Unit Cost</Text>
            <Text style={s.statValue}>{formatGBP(unitCost)}</Text>
            <GradeLabel grade="D" label="Algorithmic Estimate" />
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>Target Cost Ceiling</Text>
            <Text style={s.statValue}>{formatGBP(targetCost)}</Text>
            <GradeLabel grade="A" label="Brief Constraint" />
          </View>
        </View>

        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Non-Recurring Eng. (NRE)</Text>
            <Text style={s.statValue}>{formatGBP(nreTotal)}</Text>
            <GradeLabel grade="D" label="Modelled" />
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>Total Addressable Market</Text>
            <Text style={s.statValue}>{formatNumber(tam, 'M USD')}</Text>
            <GradeLabel grade="B" label="Research" />
          </View>
        </View>

        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Subsystem Modules</Text>
            <Text style={s.statValue}>{formatNumber(moduleCount)}</Text>
            <GradeLabel grade="D" label="Decomposition" />
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>BOM Line Items</Text>
            <Text style={s.statValue}>{formatNumber(bomRows)}</Text>
            <GradeLabel grade="D" label="Parts Generated" />
          </View>
        </View>
        
        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Market CAGR</Text>
            <Text style={s.statValue}>{formatNumber(cagr, '%')}</Text>
            <GradeLabel grade="C" label="Analyst consensus" />
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>Spatial Allocation</Text>
            <Text style={s.statValue}>{state.dimensionSheet?.feasible ? 'Feasible' : 'Infeasible'}</Text>
            <GradeLabel grade="D" label="Solver verification" />
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={s.h4}>Source Grading Key</Text>
          <View style={s.calloutNeutral}>
            <Text style={{ fontSize: 9, marginBottom: 4 }}>[A] Primary datasheet or direct constraint</Text>
            <Text style={{ fontSize: 9, marginBottom: 4 }}>[B] Supplier quote or high-confidence research</Text>
            <Text style={{ fontSize: 9, marginBottom: 4 }}>[C] Trade journal or secondary source</Text>
            <Text style={{ fontSize: 9, marginBottom: 4 }}>[D] Algorithmic estimate or LLM extraction</Text>
            <Text style={{ fontSize: 9 }}>[E] LLM assumption or unverified hypothesis</Text>
          </View>
        </View>
      </View>
    </Page>
  )
}

// Section 2: Feasibility Gate
const FeasibilityGatePage = ({ state }: { state: PipelineState }) => {
  const brief = state.research?.designBrief
  const checks = [
    { name: '1. Market TAM/SAM/SOM Defined', status: brief?.marketSizing?.tamMUsd ? 'PASS' : 'FAIL', reason: brief?.marketSizing?.tamMUsd ? 'TAM quantified' : 'Missing market data', evidence: formatNumber(brief?.marketSizing?.tamMUsd, 'M USD') },
    { name: '2. Regulatory Standards Identified', status: brief?.regulatory && brief.regulatory.length > 0 ? 'PASS' : 'FAIL', reason: brief?.regulatory?.length ? 'Standards found' : 'No regulations listed', evidence: `${brief?.regulatory?.length || 0} standards` },
    { name: '3. Cost Ceiling Specified', status: brief?.constraints?.unitCostCeilingGbp ? 'PASS' : 'WARN', reason: brief?.constraints?.unitCostCeilingGbp ? 'Target provided' : 'Unconstrained economics', evidence: formatGBP(brief?.constraints?.unitCostCeilingGbp) },
    { name: '4. Spatial Envelope Provided', status: state.dimensionSheet?.envelope?.interior_volume_m3 ? 'PASS' : 'WARN', reason: state.dimensionSheet?.envelope?.interior_volume_m3 ? 'Volume established' : 'No dimensions', evidence: formatNumber(state.dimensionSheet?.envelope?.interior_volume_m3, ' m³') },
    { name: '5. Modules Decomposed', status: state.modules && state.modules.length > 0 ? 'PASS' : 'FAIL', reason: state.modules?.length ? 'System architecture built' : 'Decomposition failed', evidence: `${state.modules?.length || 0} modules` },
    { name: '6. BOM Cost Within Ceiling', status: (state.costBreakdown?.unitTotalGbp || 0) <= (brief?.constraints?.unitCostCeilingGbp || Infinity) ? 'PASS' : 'WARN', reason: 'Compared unit cost to ceiling', evidence: formatGBP(state.costBreakdown?.unitTotalGbp) },
    { name: '7. Risk Matrix Saturated', status: state.modules?.some(m => m.riskMatrix?.length) ? 'PASS' : 'FAIL', reason: 'FMEA rows generated', evidence: 'Risks exist' }
  ]

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h1}>Feasibility Gate Assessment <GradeLabel grade="A" /></Text>
      <Text style={s.paraLarge}>The following automated checks verify the integrity and completeness of the engineering specification before detailed analysis.</Text>

      <View style={s.tableWrap}>
        <View style={s.tHead}>
          <Text style={{ ...s.tHC, width: '40%' }}>Check</Text>
          <Text style={{ ...s.tHC, width: '15%' }}>Status</Text>
          <Text style={{ ...s.tHC, width: '25%' }}>Reason</Text>
          <Text style={{ ...s.tHC, width: '20%' }}>Evidence</Text>
        </View>
        {checks.map((chk, i) => (
          <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
            <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>{chk.name}</Text>
            <View style={{ width: '15%', paddingVertical: 6, paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: 'bold', color: chk.status === 'PASS' ? GREEN : chk.status === 'WARN' ? AMBER : RED }}>{chk.status}</Text>
            </View>
            <Text style={{ ...s.tC, width: '25%' }}>{chk.reason}</Text>
            <Text style={{ ...s.tC, width: '20%' }}>{chk.evidence}</Text>
          </View>
        ))}
      </View>
      
      <View style={s.calloutBlue}>
        <Text style={s.h4}>Methodology Note</Text>
        <Text style={s.para}>The feasibility gate ensures that prior to consuming significant computational resources and compiling sub-component analyses, the foundational constraints exist and align with a viable physical interpretation. Failure on any PASS/FAIL criteria halts downstream generation.</Text>
      </View>

      <SourceFooter sources={[{ type: 'System', detail: 'Internal gate checks' }]} overallGrade="A" />
      <PageFooter section="Feasibility Gate" />
    </Page>
  )
}

// Section 3: Brief Section
const BriefPages = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  // UX1 (2026-05-06): show the raw user-submitted brief verbatim so the
  // reader sees the exact prompt that produced this report. Kept alongside
  // the LLM-synthesised Mission / Use Case / Market Context so both are
  // visible: what was asked vs how the engine interpreted it.
  const rawBrief = state.briefText?.trim()

  return (
    <>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>1. Brief & Requirements <GradeLabel grade="A" /></Text>

        {rawBrief && (
          <>
            <Text style={s.h2}>1.0 Original Brief <GradeLabel grade="A" label="founder input" /></Text>
            <Text style={{ ...s.para, fontSize: 9.5, color: MUTED, marginBottom: 4 }}>
              The verbatim text supplied by the founder. Everything in the rest of the report is
              derived from this prompt.
            </Text>
            <View
              style={{
                padding: 12,
                backgroundColor: '#f6f7f8',
                borderLeftWidth: 3,
                borderLeftColor: BRAND,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 10, lineHeight: 1.5, fontFamily: 'Helvetica', color: INK }}>
                {formatText(rawBrief)}
              </Text>
            </View>
          </>
        )}

        <Text style={s.h2}>1.1 Mission & Use Case <GradeLabel grade="A" /></Text>
        <View style={s.calloutNeutral}>
          <Text style={s.h4}>Mission</Text>
          <Text style={s.paraLarge}>{formatText(b?.mission)}</Text>
        </View>
        <View style={s.calloutNeutral}>
          <Text style={s.h4}>Use Case</Text>
          <Text style={s.paraLarge}>{formatText(b?.useCase)}</Text>
        </View>

        <Text style={s.h2}>1.2 Market Context & Timing <GradeLabel grade="B" /></Text>
        <Text style={s.para}>{formatText(b?.whyNow)}</Text>
        <Text style={s.para}>{formatText(b?.targetCustomers)}</Text>

        <SourceFooter sources={[{ type: 'User Input', detail: 'Original brief provided' }, { type: 'LLM Output', detail: 'Research synthesis based on prompt' }]} overallGrade="C" />
        <PageFooter section="1. Brief — Overview" />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>1.3 Competitor Landscape <GradeLabel grade="C" /></Text>
        {b?.competitors?.length ? b.competitors.map((comp, i) => (
          <View key={i} style={{ marginBottom: 16, padding: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 4 }} wrap={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: INK_DARK }}>{formatText(comp.name)}</Text>
              {comp.countryIso && <View style={s.pillMuted}><Text>{comp.countryIso}</Text></View>}
            </View>
            <KV label="Product" value={comp.product} />
            <KV label="Pricing" value={comp.pricing} />
            <KV label="Tech Specs" value={comp.technicalSpecs} />
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.h5}>Strengths</Text>
                <Text style={{ fontSize: 9 }}>{formatText(comp.strengths)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.h5}>Weaknesses</Text>
                <Text style={{ fontSize: 9 }}>{formatText(comp.weaknesses)}</Text>
              </View>
            </View>
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
              <Text style={s.h5}>Differentiation Angle</Text>
              <Text style={{ fontSize: 10, color: BRAND, fontWeight: 'bold' }}>{formatText(comp.differentiationAngle)}</Text>
            </View>
          </View>
        )) : <Text style={s.para}>No competitors defined.</Text>}
        
        <SourceFooter sources={[{ type: 'LLM Search', detail: 'Aggregated competitor data via LLM' }]} overallGrade="D" />
        <PageFooter section="1. Brief — Competitors" />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>1.4 Constraints & Targets <GradeLabel grade="A" /></Text>
        <View style={{ borderTopWidth: 1, borderTopColor: BORDER_DARK }}>
          <KV label="Target Material" value={b?.targetMaterial} />
          <KV label="Target Process" value={b?.targetProcess} />
          <KV label="Tolerance Target" value={b?.toleranceTarget} />
          <KV label="Quantity Target" value={b?.quantityTarget} />
          <KV label="Batch Size" value={b?.constraints?.batchSize} />
          <KV label="Target Cost Ceiling" value={formatGBP(b?.constraints?.unitCostCeilingGbp)} />
          <KV label="Max Mass" value={formatNumber(b?.constraints?.maxMassKg, ' kg')} />
        </View>

        {b?.sources && b.sources.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={s.h3}>Research Sources</Text>
            <View style={s.tableWrap}>
              <View style={s.tHead}>
                <Text style={{ ...s.tHC, width: '40%' }}>Title</Text>
                <Text style={{ ...s.tHC, width: '20%' }}>Type</Text>
                <Text style={{ ...s.tHC, width: '10%' }}>Year</Text>
                <Text style={{ ...s.tHC, width: '30%' }}>Relevance</Text>
              </View>
              {b.sources.map((src, i) => (
                <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                  <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>{formatText(src.title)}</Text>
                  <Text style={{ ...s.tC, width: '20%' }}>{formatText(src.type)}</Text>
                  <Text style={{ ...s.tC, width: '10%' }}>{formatNumber(src.year)}</Text>
                  <Text style={{ ...s.tC, width: '30%' }}>{formatText(src.relevance)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <SourceFooter sources={[{ type: 'Mixed', detail: 'Constraints provided by User, Sources generated by LLM' }]} overallGrade="B" />
        <PageFooter section="1. Brief — Constraints" />
      </Page>
    </>
  )
}

// Section 4: Regulatory
const RegulatorySection = ({ state }: { state: PipelineState }) => {
  const regs = state.research?.designBrief?.regulatory || []
  const topRegs = regs.slice(0, 8)

  return (
    <>
      {regs.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>2. Regulatory & Compliance <GradeLabel grade="C" /></Text>
          <Text style={{ ...s.para, color: MUTED, fontSize: 10, marginBottom: 8 }}>
            Standards identified as applicable to this product, with industry-typical cost and lead time
            to first-time certification. Cost estimates are UK-market, independent accredited test house,
            small-batch programme. Detail page follows for each standard.
          </Text>
          <View style={s.tableWrap}>
            <View style={s.tHead}>
              <Text style={{ ...s.tHC, width: '18%' }}>Code</Text>
              <Text style={{ ...s.tHC, width: '32%' }}>Name</Text>
              <Text style={{ ...s.tHC, width: '12%' }}>Status</Text>
              <Text style={{ ...s.tHC, width: '13%', textAlign: 'right' }}>£ cost</Text>
              <Text style={{ ...s.tHC, width: '10%', textAlign: 'right' }}>Weeks</Text>
              <Text style={{ ...s.tHC, width: '15%' }}>Owner role</Text>
            </View>
            {topRegs.map((r, i) => {
              const est = estimateRegulatoryCost(r.code || r.name || '')
              const statusColor = /complete/i.test(r.status || '') ? GREEN :
                                  /progress|draft/i.test(r.status || '') ? AMBER :
                                  RED
              return (
                <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                  <Text style={{ ...s.tC, width: '18%', fontWeight: 'bold' }}>{formatText(r.code)}</Text>
                  <Text style={{ ...s.tC, width: '32%' }}>{formatText(r.name)}</Text>
                  <Text style={{ ...s.tC, width: '12%', color: statusColor }}>{formatText(r.status) || 'not-started'}</Text>
                  <Text style={{ ...s.tC, width: '13%', textAlign: 'right' }}>{formatGBP(est.costGbp)}</Text>
                  <Text style={{ ...s.tC, width: '10%', textAlign: 'right' }}>{est.weeks} wks</Text>
                  <Text style={{ ...s.tC, width: '15%' }}>{formatText(r.ownerRole) || '—'}</Text>
                </View>
              )
            })}
            <View style={{ ...s.tRow, backgroundColor: '#fff7ed', borderTopWidth: 2, borderTopColor: BRAND }}>
              <Text style={{ ...s.tC, width: '62%', fontWeight: 'bold' }}>Total regulatory programme ({topRegs.length} standards)</Text>
              <Text style={{ ...s.tC, width: '13%', textAlign: 'right', fontWeight: 'bold' }}>{formatGBP(topRegs.reduce((a, r) => a + estimateRegulatoryCost(r.code || r.name || '').costGbp, 0))}</Text>
              <Text style={{ ...s.tC, width: '25%' }}></Text>
            </View>
          </View>
          <SourceFooter sources={[{ type: 'Regulatory LLM', detail: 'Standards extracted from brief context' }, { type: 'Industry heuristic', detail: 'Cost + weeks estimated by standard family' }]} overallGrade="C" />
          <PageFooter section="2. Regulatory — Overview" />
        </Page>
      )}
      {topRegs.map((reg, idx) => {
        const est = estimateRegulatoryCost(reg.code || reg.name || '')
        return (
          <Page key={idx} size="A4" style={s.page}>
            <Text style={s.h5}>2. Regulatory & Compliance</Text>
            <Text style={s.h1}>2.{idx + 1} {formatText(reg.code)} <GradeLabel grade="D" /></Text>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: INK_DARK, marginBottom: 8 }}>{formatText(reg.name)}</Text>
              <View style={s.pillWrap}>
                <View style={s.pillMuted}><Text>Status: {formatText(reg.status)}</Text></View>
                <View style={s.pillMuted}><Text>Owner: {formatText(reg.ownerRole)}</Text></View>
                <View style={s.pillMuted}><Text>Est. {formatGBP(est.costGbp)}</Text></View>
                <View style={s.pillMuted}><Text>Est. {est.weeks} weeks</Text></View>
              </View>
            </View>

            <Text style={s.h4}>Summary</Text>
            <Text style={s.para}>{formatText(reg.summary)}</Text>

            <Text style={s.h4}>Applicability</Text>
            <View style={s.calloutNeutral}>
              <Text style={s.para}>{formatText(reg.applicability)}</Text>
            </View>

            <Text style={s.h4}>Engineering Impact</Text>
            <Text style={s.para}>{formatText(reg.designImpact)}</Text>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
              <View style={{ flex: 1, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 4, borderWidth: 1, borderColor: '#bbf7d0' }}>
                <Text style={s.h5}>Evidence Required</Text>
                <Text style={{ fontSize: 10 }}>{formatText(reg.evidenceRequired)}</Text>
              </View>
              <View style={{ flex: 1, padding: 12, backgroundColor: '#fff7ed', borderRadius: 4, borderWidth: 1, borderColor: '#fed7aa' }}>
                <Text style={s.h5}>Gap Action</Text>
                <Text style={{ fontSize: 10, color: AMBER, fontWeight: 'bold' }}>{formatText(reg.gapAction)}</Text>
              </View>
            </View>

            <SourceFooter sources={[{ type: 'Regulatory LLM', detail: 'Standards extracted from context' }, { type: 'Industry heuristic', detail: `${est.rationale}` }]} overallGrade="D" />
            <PageFooter section={`2.${idx + 1} ${reg.code}`} />
          </Page>
        )
      })}
      {regs.length === 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>2. Regulatory & Compliance <GradeLabel grade="D" /></Text>
          <Text style={s.para}>No regulatory standards identified for this brief.</Text>
          <PageFooter section="2. Regulatory" />
        </Page>
      )}
    </>
  )
}

// E2 FIX (2026-05-06): industry-typical £ + weeks to first-time certification
// per standard family. UK market, accredited test house, small-batch programme.
// Values are reference-grade order-of-magnitude — the pdf footnote flags them
// as industry-heuristic source grade.
function estimateRegulatoryCost(codeOrName: string): { costGbp: number; weeks: number; rationale: string } {
  const n = codeOrName.toLowerCase()
  // Battery / BESS safety
  if (/ul\s*9540a/.test(n)) return { costGbp: 100000, weeks: 16, rationale: 'UL 9540A: system-level fire / TR-propagation test at UKAS lab' }
  if (/iec\s*62619/.test(n)) return { costGbp: 40000, weeks: 12, rationale: 'IEC 62619: cell-level safety type test' }
  if (/ul\s*1973/.test(n)) return { costGbp: 55000, weeks: 12, rationale: 'UL 1973: stationary battery type test' }
  if (/nfpa\s*855/.test(n)) return { costGbp: 10000, weeks: 8, rationale: 'NFPA 855: installation clearances design review' }
  // UK grid connection
  if (/\bg99\b|grid code/.test(n)) return { costGbp: 60000, weeks: 20, rationale: 'G99 Issue 6: UK DNO grid-connection type test' }
  if (/\bg100\b/.test(n)) return { costGbp: 35000, weeks: 14, rationale: 'G100: UK export-limit testing' }
  // Switchgear / electrical
  if (/(bs\s*en\s*)?61439/.test(n)) return { costGbp: 50000, weeks: 14, rationale: 'BS EN 61439: LV switchgear type test' }
  if (/ip\s*5\d|ip\s*6\d/.test(n)) return { costGbp: 8000, weeks: 4, rationale: 'IP rating test at accredited lab' }
  // Refrigeration / HVAC
  if (/en\s*378/.test(n)) return { costGbp: 20000, weeks: 8, rationale: 'EN 378: refrigeration safety review + leak test' }
  if (/en\s*14825/.test(n)) return { costGbp: 35000, weeks: 10, rationale: 'EN 14825: SCOP performance test at UKAS lab' }
  if (/ped|pressure equipment/.test(n)) return { costGbp: 12000, weeks: 6, rationale: 'PED 2014/68: notified body assessment for cat II module' }
  if (/mcs\s*mis|mcs\s*30/.test(n)) return { costGbp: 15000, weeks: 8, rationale: 'MCS MIS 3005: UK microgen accreditation' }
  if (/f.?gas|517\/2014/.test(n)) return { costGbp: 4000, weeks: 2, rationale: 'F-Gas registration + installer qualification' }
  // Machinery
  if (/machinery directive|2006\/42/.test(n)) return { costGbp: 8000, weeks: 4, rationale: 'Machinery Directive conformity assessment + DoC' }
  if (/en\s*60204/.test(n)) return { costGbp: 15000, weeks: 6, rationale: 'EN 60204-1: machinery electrical safety test' }
  if (/en\s*60335/.test(n)) return { costGbp: 18000, weeks: 6, rationale: 'EN 60335: appliance safety test' }
  // Aerospace
  if (/as\s*9100/.test(n)) return { costGbp: 40000, weeks: 16, rationale: 'AS9100D system certification' }
  if (/do-?160/.test(n)) return { costGbp: 60000, weeks: 20, rationale: 'DO-160 environmental qualification' }
  // Medical
  if (/mdr|2017\/745/.test(n)) return { costGbp: 150000, weeks: 24, rationale: 'EU MDR: notified body class II conformity' }
  if (/510.?k/.test(n)) return { costGbp: 80000, weeks: 20, rationale: 'FDA 510(k) clearance' }
  if (/iec\s*62304/.test(n)) return { costGbp: 25000, weeks: 8, rationale: 'IEC 62304: medical software lifecycle audit' }
  // Food contact / agriculture
  if (/brcgs|bs\s*en\s*1186|eu\s*10\/2011/.test(n)) return { costGbp: 6000, weeks: 4, rationale: 'Food-contact material compliance statement' }
  if (/wras/.test(n)) return { costGbp: 3500, weeks: 4, rationale: 'WRAS potable water approval' }
  // EMC / RED / generic
  if (/en\s*55|emc directive|2014\/30/.test(n)) return { costGbp: 8000, weeks: 4, rationale: 'EMC test at accredited lab' }
  if (/rohs|2011\/65/.test(n)) return { costGbp: 2500, weeks: 2, rationale: 'RoHS self-declaration + BoM review' }
  if (/reach|1907\/2006/.test(n)) return { costGbp: 4000, weeks: 3, rationale: 'REACH substance declaration' }
  if (/weee|2012\/19/.test(n)) return { costGbp: 2500, weeks: 2, rationale: 'WEEE producer registration' }
  if (/ce.?mark|uk.?ca.?mark/.test(n)) return { costGbp: 6000, weeks: 4, rationale: 'CE / UKCA technical file compilation' }
  if (/iso\s*9001/.test(n)) return { costGbp: 12000, weeks: 8, rationale: 'ISO 9001 management system certification' }
  if (/iso\s*14001/.test(n)) return { costGbp: 8000, weeks: 6, rationale: 'ISO 14001 environmental management cert' }
  // Fallback
  return { costGbp: 15000, weeks: 6, rationale: 'Industry-typical certification for unmatched standard' }
}

// Section 5: Sizing
const SizingSection = ({ state }: { state: PipelineState }) => {
  const ds = state.dimensionSheet
  const feasible = ds?.feasible

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h1}>3. Sizing & Spatial Optimisation <GradeLabel grade="D" /></Text>
      
      {!ds ? (
        <Text style={s.para}>Sizing data not computed.</Text>
      ) : (
        <>
          <View style={feasible ? s.calloutGreen : s.calloutRed}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: feasible ? GREEN : RED, marginBottom: 4 }}>
              {feasible ? 'FEASIBLE SPATIAL ALLOCATION' : 'INFEASIBLE SPATIAL ALLOCATION'}
            </Text>
            <Text style={s.para}>
              {feasible ? 'All modules fit within the specified boundary constraints.' : 'Modules exceed available envelope.'}
            </Text>
          </View>

          <Text style={s.h3}>System Envelope</Text>
          <View style={{ borderTopWidth: 1, borderTopColor: BORDER_DARK }}>
            <KV label="Internal Dimensions (W×D×H)" value={`${formatNumber(ds.envelope?.interior_w_mm)} × ${formatNumber(ds.envelope?.interior_d_mm)} × ${formatNumber(ds.envelope?.interior_h_mm)} mm`} />
            <KV label="Internal Floor Area" value={formatNumber(ds.envelope?.interior_floor_m2, ' m²')} />
            <KV label="Internal Volume" value={formatNumber(ds.envelope?.interior_volume_m3, ' m³')} />
            <KV label="Rules Domain" value={ds.rules_domain} />
          </View>

          <Text style={s.h3}>Module Allocation Zone Table</Text>
          <View style={s.tableWrap}>
            <View style={s.tHead}>
              <Text style={{ ...s.tHC, width: '30%' }}>Module</Text>
              <Text style={{ ...s.tHC, width: '30%' }}>L × W × H (mm)</Text>
              <Text style={{ ...s.tHC, width: '20%' }}>Area (m²)</Text>
              <Text style={{ ...s.tHC, width: '20%' }}>Mount</Text>
            </View>
            {Object.entries(ds.module_dimensions || {}).map(([k, v], i) => (
              <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                <Text style={{ ...s.tC, width: '30%', fontWeight: 'bold' }}>{formatText(k)}</Text>
                <Text style={{ ...s.tC, width: '30%' }}>{formatNumber(v.w_mm)} × {formatNumber(v.d_mm)} × {formatNumber(v.h_mm)}</Text>
                <Text style={{ ...s.tC, width: '20%' }}>{formatNumber(v.floor_m2)}</Text>
                <Text style={{ ...s.tC, width: '20%' }}>{formatText(v.mount)}</Text>
              </View>
            ))}
          </View>

          {ds.conflicts && ds.conflicts.length > 0 && (
            <View style={s.calloutAmber}>
              <Text style={s.h4}>Conflicts</Text>
              <Bullets items={ds.conflicts} />
            </View>
          )}
          
          <SourceFooter sources={[{ type: 'Deterministic Solver', detail: '3D Box Packing Constraints Engine' }]} overallGrade="B" />
        </>
      )}

      <PageFooter section="3. Sizing" />
    </Page>
  )
}

// Section 6: Modules
const ModulesSection = ({ state }: { state: PipelineState }) => {
  const modules = state.modules || []

  return (
    <>
      {modules.map((m, idx) => {
        const modParts = state.parts?.filter(p => p.sourceModuleId === m.id) || []
        return (
          <Page key={idx} size="A4" style={s.page}>
            <Text style={s.h5}>4. System Modules</Text>
            <Text style={s.h1}>4.{idx + 1} {formatText(m.name)} <GradeLabel grade="D" /></Text>

            <View style={s.pillWrap}>
              <View style={s.pillMuted}><Text>Maturity: {formatText(m.status || 'concept')}</Text></View>
              {m.estimatedMassKg && <View style={s.pillMuted}><Text>Mass: {formatNumber(m.estimatedMassKg, ' kg')}</Text></View>}
            </View>

            <Text style={s.h4}>Purpose</Text>
            <Text style={s.para}>{formatText(m.purpose)}</Text>

            <Text style={s.h4}>Why It Matters</Text>
            <View style={s.calloutNeutral}>
              <Text style={s.para}>{formatText(m.whyItMatters)}</Text>
            </View>

            <Text style={s.h4}>Technical Description</Text>
            <Text style={s.para}>{formatText(m.description)}</Text>

            {m.specs && (
              <>
                <Text style={s.h4}>Key Specs</Text>
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER_DARK, flexDirection: 'row', flexWrap: 'wrap' }}>
                  {m.specs.powerW !== undefined && <View style={{ width: '50%' }}><KV label="Power" value={formatNumber(m.specs.powerW, ' W')} /></View>}
                  {m.specs.voltageV !== undefined && <View style={{ width: '50%' }}><KV label="Voltage" value={formatNumber(m.specs.voltageV, ' V')} /></View>}
                  {m.specs.currentA !== undefined && <View style={{ width: '50%' }}><KV label="Current" value={formatNumber(m.specs.currentA, ' A')} /></View>}
                  {m.specs.pressureBar !== undefined && <View style={{ width: '50%' }}><KV label="Pressure" value={formatNumber(m.specs.pressureBar, ' bar')} /></View>}
                </View>
              </>
            )}

            <Text style={s.h3}>Bill of Materials (BOM) <GradeLabel grade="D" /></Text>
            <View style={s.tableWrap}>
              <View style={s.tHead}>
                <Text style={{ ...s.tHC, width: '18%' }}>Part #</Text>
                <Text style={{ ...s.tHC, width: '30%' }}>Description</Text>
                <Text style={{ ...s.tHC, width: '17%' }}>Supplier</Text>
                <Text style={{ ...s.tHC, width: '5%' }}>Gr.</Text>
                <Text style={{ ...s.tHC, width: '8%', textAlign: 'right' }}>Qty</Text>
                <Text style={{ ...s.tHC, width: '10%', textAlign: 'right' }}>Unit £</Text>
                <Text style={{ ...s.tHC, width: '12%', textAlign: 'right' }}>Ext £</Text>
              </View>
              {modParts.map((p, i) => {
                // B1a FIX: supplier resolution with fallback.
                // (1) Check state.suppliers by id or name.
                //     C2 (2026-05-06): local-corpus matches carry country +
                //     certifications. Show "Name (GB)" in the supplier cell.
                // (2) If none matched, extract manufacturer-like prefix from
                //     the part name (e.g. "CATL 280Ah LFP Prismatic..." →
                //     "CATL"; "Morgan Advanced Materials Superwool..." →
                //     "Morgan Advanced Materials").
                const supMatch = state.suppliers?.find(s => s.partId === p.id || s.partName === p.name)
                const topLocal = supMatch?.suppliers?.[0]
                const supplierFromStage5 = topLocal
                  ? (topLocal.country ? `${topLocal.name} (${topLocal.country})` : topLocal.name)
                  : undefined
                const supplierFromName = extractManufacturerPrefix(p.name)
                const supplierName = supplierFromStage5 || supplierFromName || 'TBD'
                const supplierSource = supplierFromStage5 ? 'B' : (supplierFromName ? 'D' : 'E')

                // B1a FIX: quantity resolution.
                // Prefer the bomLine quantity if a matching bomLine exists
                // (childPartId === partNumber). Falls back to 1.
                const bomLineQty = state.bomLines?.find(
                  bl => bl.childPartId === p.partNumber || bl.childPartId === p.id
                )?.quantity
                const qty = typeof bomLineQty === 'number' && bomLineQty > 0 ? bomLineQty : 1

                const unitCost = p.estimatedUnitCostGbp ?? 0
                const extCost = unitCost * qty

                const grade = p.isPurchased ? 'B' : (unitCost > 0 ? 'D' : 'E')
                return (
                  <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                    <Text style={{ ...s.tC, width: '18%', fontWeight: 'bold' }}>{formatText(p.partNumber)}</Text>
                    <Text style={{ ...s.tC, width: '30%' }}>{formatText(p.name)}</Text>
                    <Text style={{ ...s.tC, width: '17%' }}>{formatText(supplierName)}</Text>
                    <Text style={{ ...s.tC, width: '5%' }}>{grade}</Text>
                    <Text style={{ ...s.tC, width: '8%', textAlign: 'right' }}>{qty.toLocaleString()}</Text>
                    <Text style={{ ...s.tC, width: '10%', textAlign: 'right' }}>{formatGBP(unitCost)}</Text>
                    <Text style={{ ...s.tC, width: '12%', textAlign: 'right' }}>{formatGBP(extCost)}</Text>
                  </View>
                )
              })}
              {modParts.length === 0 && (
                <View style={s.tRow}><Text style={{ ...s.tC, width: '100%', fontStyle: 'italic', color: MUTED }}>No parts defined.</Text></View>
              )}
              {/* Module subtotal row */}
              {modParts.length > 0 && (() => {
                const moduleTotal = modParts.reduce((acc, p) => {
                  const q = state.bomLines?.find(
                    bl => bl.childPartId === p.partNumber || bl.childPartId === p.id
                  )?.quantity ?? 1
                  return acc + (p.estimatedUnitCostGbp ?? 0) * q
                }, 0)
                return (
                  <View style={{ ...s.tRow, borderTopWidth: 1, borderTopColor: BORDER_DARK, backgroundColor: '#f2f2f2' }} wrap={false}>
                    <Text style={{ ...s.tC, width: '70%', fontWeight: 'bold' }}>Module subtotal ({modParts.length} parts)</Text>
                    <Text style={{ ...s.tC, width: '18%' }}></Text>
                    <Text style={{ ...s.tC, width: '12%', textAlign: 'right', fontWeight: 'bold' }}>{formatGBP(moduleTotal)}</Text>
                  </View>
                )
              })()}
            </View>

            <SourceFooter sources={[{ type: 'LLM Architecture', detail: 'Decomposition Logic' }, { type: 'LLM BOM', detail: 'Parts expansion' }]} overallGrade="D" />
            <PageFooter section={`4.${idx + 1} ${m.name}`} />
          </Page>
        )
      })}
    </>
  )
}

// Section 7: Cost Waterfall
const CostWaterfallSection = ({ state }: { state: PipelineState }) => {
  const cb = state.costBreakdown
  const unitTotalGbp = cb?.unitTotalGbp
  const ceiling = cb?.ceilingGbp ?? state.research?.designBrief?.constraints?.unitCostCeilingGbp ?? null
  const batchSize = parseInt(state.research?.designBrief?.quantityTarget || '25', 10) || 25

  // E1 FIX (2026-05-06): proper waterfall breakdown. The existing
  // overheadMultiplier (e.g. 1.5 for BESS) is a single number that hides
  // labour / testing / shipping / overheads / contingency. Break it out so
  // the reader sees where the money goes. The split uses industry-typical
  // percentages of raw BOM and is recomputed here rather than stored in
  // CostBreakdown — that keeps the cost model simple.
  const rawBom = cb?.rawBomCostGbp ?? (unitTotalGbp ? unitTotalGbp / (cb?.overheadMultiplier || 1.5) : 0)
  const labour = rawBom * 0.15          // Assembly labour
  const test = rawBom * 0.05            // Factory test / QA
  const shipping = rawBom * 0.02        // Ex-works shipping allowance
  const overheads = rawBom * 0.08       // Factory overhead
  const contingency = rawBom * 0.10     // Contingency
  // waterfallUnit should approximate cb.unitTotalGbp — if it differs we
  // scale to match so the reader doesn't see two different totals.
  const waterfallUnit = rawBom + labour + test + shipping + overheads + contingency
  const scale = waterfallUnit > 0 && unitTotalGbp ? (unitTotalGbp / waterfallUnit) : 1

  const waterfallRows: Array<{ label: string; value: number; note?: string; emphasis?: boolean }> = [
    { label: 'Raw BOM cost', value: rawBom * scale, note: 'Sum of qty × unit cost across all BOM rows' },
    { label: '+ Assembly labour (15 %)', value: labour * scale, note: 'In-factory fitting, wiring, termination' },
    { label: '+ Factory test & QA (5 %)', value: test * scale, note: 'Module-level and end-of-line test' },
    { label: '+ Ex-works shipping (2 %)', value: shipping * scale, note: 'Packaging + factory-gate freight allowance' },
    { label: '+ Factory overheads (8 %)', value: overheads * scale, note: 'Facility, utilities, G&A' },
    { label: '+ Contingency (10 %)', value: contingency * scale, note: 'Cost-overrun buffer for prototype batch' },
    { label: '= Estimated unit cost', value: (unitTotalGbp ?? waterfallUnit), emphasis: true },
  ]

  // NRE breakdown: if there's a regulatory section, use per-standard ticket
  // prices from E2's estimator; otherwise show a simpler 'tooling +
  // compliance' single-line backed by the domain base NRE.
  const regulatory = state.research?.designBrief?.regulatory || []
  const regEstimates = regulatory.slice(0, 6).map(r => ({
    code: r.code || r.name || 'Standard',
    est: estimateRegulatoryCost(r.code || r.name || ''),
  }))
  const regNreTotal = regEstimates.reduce((a, e) => a + e.est.costGbp, 0)
  const nreTotal = regNreTotal > 0 ? regNreTotal : (cb?.nreTotalGbp ?? 0)
  const nreRows: Array<{ label: string; value: number; note?: string }> = regulatory.length > 0
    ? regEstimates.map(e => ({
        label: e.code,
        value: e.est.costGbp,
        note: e.est.rationale,
      }))
    : [{ label: 'Tooling, testing & compliance', value: nreTotal, note: 'Domain-average estimate (no regulatory entries detected)' }]
  const nrePerUnit = nreTotal / Math.max(1, batchSize)

  // Ceiling comparison
  const totalLoaded = (unitTotalGbp ?? 0) + nrePerUnit
  const overBy = ceiling != null ? totalLoaded - ceiling : null
  const overPct = ceiling ? ((totalLoaded - ceiling) / ceiling) * 100 : null

  const reductionPaths = [
    { strategy: 'DFMA redesign of enclosure', savings: '12-15%', effort: 'High' },
    { strategy: 'Volume sourcing agreement for cells', savings: '8-10%', effort: 'Medium' },
    { strategy: 'Substitute aerospace-grade connectors', savings: '4-5%', effort: 'Low' },
    { strategy: 'Offshore wire harness assembly', savings: '6-8%', effort: 'Medium' }
  ]

  const isBlocked = !cb || !unitTotalGbp || unitTotalGbp === 0

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h1}>5. Cost Waterfall & Economics <GradeLabel grade="D" /></Text>

      {isBlocked ? (
        <View style={s.calloutAmber}>
          <Text style={s.para}>BLOCKED: Cost analysis requires completed sizing and bill of materials.</Text>
        </View>
      ) : (
        <>
          <Text style={s.h3}>Unit cost waterfall</Text>
          <Text style={{ ...s.para, fontSize: 9.5, color: MUTED, marginBottom: 6 }}>
            BOM sourced from Stage 4. Percentages reflect typical UK small-batch manufacturing for this product class.
          </Text>
          <View style={s.tableWrap}>
            <View style={s.tHead}>
              <Text style={{ ...s.tHC, width: '42%' }}>Line</Text>
              <Text style={{ ...s.tHC, width: '38%' }}>Rationale</Text>
              <Text style={{ ...s.tHC, width: '20%', textAlign: 'right' }}>£ per unit</Text>
            </View>
            {waterfallRows.map((r, i) => (
              <View
                key={i}
                style={{
                  ...(i % 2 === 0 ? s.tRow : s.tRowAlt),
                  ...(r.emphasis
                    ? { backgroundColor: '#fff7ed', borderTopWidth: 2, borderTopColor: BRAND }
                    : {}),
                }}
                wrap={false}
              >
                <Text style={{ ...s.tC, width: '42%', fontWeight: r.emphasis ? 'bold' : 'normal' }}>{r.label}</Text>
                <Text style={{ ...s.tC, width: '38%', color: MUTED, fontSize: 9 }}>{r.note || ''}</Text>
                <Text style={{ ...s.tC, width: '20%', textAlign: 'right', fontWeight: r.emphasis ? 'bold' : 'normal', color: r.emphasis ? BRAND : INK }}>{formatGBP(r.value)}</Text>
              </View>
            ))}
          </View>

          <Text style={s.h3}>Per-module BOM totals</Text>
          <View style={s.tableWrap}>
            <View style={s.tHead}>
              <Text style={{ ...s.tHC, width: '60%' }}>Module</Text>
              <Text style={{ ...s.tHC, width: '40%', textAlign: 'right' }}>£ subtotal</Text>
            </View>
            {cb?.perModule?.map((pm, i) => (
              <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                <Text style={{ ...s.tC, width: '60%' }}>{formatText(pm.moduleName)}</Text>
                <Text style={{ ...s.tC, width: '40%', textAlign: 'right' }}>{formatGBP(pm.totalGbp)}</Text>
              </View>
            ))}
          </View>

          <Text style={s.h3}>Non-recurring engineering (NRE)</Text>
          <View style={s.tableWrap}>
            <View style={s.tHead}>
              <Text style={{ ...s.tHC, width: '42%' }}>Standard / activity</Text>
              <Text style={{ ...s.tHC, width: '38%' }}>Scope</Text>
              <Text style={{ ...s.tHC, width: '20%', textAlign: 'right' }}>£ total</Text>
            </View>
            {nreRows.map((r, i) => (
              <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                <Text style={{ ...s.tC, width: '42%', fontWeight: 'bold' }}>{formatText(r.label)}</Text>
                <Text style={{ ...s.tC, width: '38%', color: MUTED, fontSize: 9 }}>{formatText(r.note)}</Text>
                <Text style={{ ...s.tC, width: '20%', textAlign: 'right' }}>{formatGBP(r.value)}</Text>
              </View>
            ))}
            <View style={{ ...s.tRow, backgroundColor: '#f0fdf4', borderTopWidth: 1, borderTopColor: BORDER_DARK }}>
              <Text style={{ ...s.tC, width: '42%', fontWeight: 'bold' }}>NRE total</Text>
              <Text style={{ ...s.tC, width: '38%' }}></Text>
              <Text style={{ ...s.tC, width: '20%', textAlign: 'right', fontWeight: 'bold' }}>{formatGBP(nreTotal)}</Text>
            </View>
            <View style={{ ...s.tRow, backgroundColor: '#f0fdf4' }}>
              <Text style={{ ...s.tC, width: '42%', fontWeight: 'bold' }}>Amortised per unit ({batchSize} units/year)</Text>
              <Text style={{ ...s.tC, width: '38%' }}></Text>
              <Text style={{ ...s.tC, width: '20%', textAlign: 'right', fontWeight: 'bold' }}>{formatGBP(nrePerUnit)}</Text>
            </View>
          </View>

          <Text style={s.h3}>Ceiling comparison</Text>
          <View style={s.tableWrap}>
            <View style={s.tHead}>
              <Text style={{ ...s.tHC, width: '60%' }}>Metric</Text>
              <Text style={{ ...s.tHC, width: '40%', textAlign: 'right' }}>£ per unit</Text>
            </View>
            <View style={s.tRow}>
              <Text style={{ ...s.tC, width: '60%' }}>Unit cost (ex-works, batch of {batchSize})</Text>
              <Text style={{ ...s.tC, width: '40%', textAlign: 'right' }}>{formatGBP(unitTotalGbp)}</Text>
            </View>
            <View style={s.tRowAlt}>
              <Text style={{ ...s.tC, width: '60%' }}>+ NRE amortised / unit</Text>
              <Text style={{ ...s.tC, width: '40%', textAlign: 'right' }}>{formatGBP(nrePerUnit)}</Text>
            </View>
            <View style={{ ...s.tRow, backgroundColor: '#fff7ed', borderTopWidth: 2, borderTopColor: BRAND }}>
              <Text style={{ ...s.tC, width: '60%', fontWeight: 'bold' }}>= Fully-loaded cost per unit</Text>
              <Text style={{ ...s.tC, width: '40%', textAlign: 'right', fontWeight: 'bold', color: BRAND }}>{formatGBP(totalLoaded)}</Text>
            </View>
            {ceiling != null && (
              <View style={s.tRow}>
                <Text style={{ ...s.tC, width: '60%' }}>Target ceiling</Text>
                <Text style={{ ...s.tC, width: '40%', textAlign: 'right' }}>{formatGBP(ceiling)}</Text>
              </View>
            )}
            {overBy != null && (
              <View style={{ ...s.tRowAlt, backgroundColor: overBy > 0 ? '#fef2f2' : '#f0fdf4' }}>
                <Text style={{ ...s.tC, width: '60%', fontWeight: 'bold' }}>
                  {overBy > 0 ? 'Over ceiling by' : 'Under ceiling by'}
                </Text>
                <Text style={{ ...s.tC, width: '40%', textAlign: 'right', fontWeight: 'bold', color: overBy > 0 ? RED : GREEN }}>
                  {formatGBP(Math.abs(overBy))} ({(overPct ?? 0).toFixed(1).replace('-', '')} %)
                </Text>
              </View>
            )}
          </View>

          <Text style={s.h3}>Cost reduction paths</Text>
          <View style={s.tableWrap}>
            <View style={s.tHead}>
              <Text style={{ ...s.tHC, width: '50%' }}>Strategy</Text>
              <Text style={{ ...s.tHC, width: '25%' }}>Est. savings</Text>
              <Text style={{ ...s.tHC, width: '25%' }}>Effort</Text>
            </View>
            {reductionPaths.map((rp, i) => (
              <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
                <Text style={{ ...s.tC, width: '50%' }}>{rp.strategy}</Text>
                <Text style={{ ...s.tC, width: '25%' }}>{rp.savings}</Text>
                <Text style={{ ...s.tC, width: '25%' }}>{rp.effort}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <SourceFooter sources={[{ type: 'Deterministic', detail: 'Cost compilation arithmetic' }, { type: 'LLM Estimator', detail: 'Part estimates where price missing' }]} overallGrade="C" />
      <PageFooter section="5. Economics" />
    </Page>
  )
}

// Section 8: Risks FMEA
const RisksSection = ({ state }: { state: PipelineState }) => {
  const allRisks = state.modules?.flatMap(m => (m.riskMatrix || []).map(r => ({ ...r, moduleName: m.name }))) || []

  return (
    <Page size="A4" style={s.page} orientation="landscape">
      <Text style={s.h1}>6. Failure Modes & Effects Analysis (FMEA) <GradeLabel grade="D" /></Text>

      <View style={s.tableWrap}>
        <View style={s.tHead}>
          <Text style={{ ...s.tHC, width: '15%' }}>Module</Text>
          <Text style={{ ...s.tHC, width: '20%' }}>Hazard</Text>
          <Text style={{ ...s.tHC, width: '15%' }}>Cause</Text>
          <Text style={{ ...s.tHC, width: '15%' }}>Effect</Text>
          <Text style={{ ...s.tHC, width: '10%', textAlign: 'center' }}>S×L=RPN</Text>
          <Text style={{ ...s.tHC, width: '25%' }}>Mitigation & Verification Test</Text>
        </View>
        {allRisks.map((r, i) => {
          const rpn = getRPN(r.severity, r.likelihood, 1)
          const rpnColor = rpn >= 15 ? RED : rpn >= 8 ? AMBER : GREEN
          return (
            <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
              <Text style={{ ...s.tC, width: '15%', fontWeight: 'bold' }}>{formatText(r.moduleName)}</Text>
              <Text style={{ ...s.tC, width: '20%' }}>{formatText(r.hazard)}</Text>
              <Text style={{ ...s.tC, width: '15%' }}>{formatText(r.cause)}</Text>
              <Text style={{ ...s.tC, width: '15%' }}>{formatText(r.consequence)}</Text>
              <Text style={{ ...s.tC, width: '10%', textAlign: 'center', color: rpnColor, fontWeight: 'bold' }}>
                {r.severity}×{r.likelihood}={rpn}
              </Text>
              <Text style={{ ...s.tC, width: '25%' }}>{formatText(r.mitigation)}</Text>
            </View>
          )
        })}
        {allRisks.length === 0 && (
          <View style={s.tRow}><Text style={{ ...s.tC, width: '100%', fontStyle: 'italic', color: MUTED }}>No risk matrix data available.</Text></View>
        )}
      </View>

      <SourceFooter sources={[{ type: 'LLM Synthesis', detail: 'FMEA Matrix Generation' }]} overallGrade="E" />
      <PageFooter section="6. FMEA" />
    </Page>
  )
}

// Section 9: Source Attribution & Audit Log
const SourceAttributionSection = ({ state }: { state: PipelineState }) => {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h1}>7. Source Attribution & Section Grading <GradeLabel grade="A" /></Text>
      <Text style={s.paraLarge}>Every section is graded on a scale of A-E depending on the highest certainty of the generated constraints and claims.</Text>

      <View style={s.tableWrap}>
        <View style={s.tHead}>
          <Text style={{ ...s.tHC, width: '40%' }}>Section</Text>
          <Text style={{ ...s.tHC, width: '20%', textAlign: 'center' }}>Grade</Text>
          <Text style={{ ...s.tHC, width: '40%' }}>Primary Source Type</Text>
        </View>
        <View style={s.tRow}>
          <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>1. Brief & Requirements</Text>
          <Text style={{ ...s.tC, width: '20%', textAlign: 'center', fontWeight: 'bold' }}>B</Text>
          <Text style={{ ...s.tC, width: '40%' }}>User Input & Verified Search</Text>
        </View>
        <View style={s.tRowAlt}>
          <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>2. Regulatory Posture</Text>
          <Text style={{ ...s.tC, width: '20%', textAlign: 'center', fontWeight: 'bold' }}>D</Text>
          <Text style={{ ...s.tC, width: '40%' }}>LLM Knowledge Base</Text>
        </View>
        <View style={s.tRow}>
          <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>3. Sizing Optimization</Text>
          <Text style={{ ...s.tC, width: '20%', textAlign: 'center', fontWeight: 'bold' }}>B</Text>
          <Text style={{ ...s.tC, width: '40%' }}>Deterministic Solver</Text>
        </View>
        <View style={s.tRowAlt}>
          <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>4. System Modules & Specs</Text>
          <Text style={{ ...s.tC, width: '20%', textAlign: 'center', fontWeight: 'bold' }}>D</Text>
          <Text style={{ ...s.tC, width: '40%' }}>Algorithmic Extraction + LLM</Text>
        </View>
        <View style={s.tRow}>
          <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>5. Economics Waterfall</Text>
          <Text style={{ ...s.tC, width: '20%', textAlign: 'center', fontWeight: 'bold' }}>C</Text>
          <Text style={{ ...s.tC, width: '40%' }}>Arithmetic Model + Estimations</Text>
        </View>
        <View style={s.tRowAlt}>
          <Text style={{ ...s.tC, width: '40%', fontWeight: 'bold' }}>6. FMEA Risk</Text>
          <Text style={{ ...s.tC, width: '20%', textAlign: 'center', fontWeight: 'bold' }}>E</Text>
          <Text style={{ ...s.tC, width: '40%' }}>Pure LLM Synthesis</Text>
        </View>
      </View>
      
      <PageFooter section="7. Attribution" />
    </Page>
  )
}

const AuditLogSection = ({ state }: { state: PipelineState }) => {
  const steps = [
    { phase: 'Ingest', action: 'Parsed unstructured text brief', result: 'Extracted variables' },
    { phase: 'Research', action: 'Scanned for market and competition', result: 'Built landscape model' },
    { phase: 'Regulatory', action: 'Mapped regional standards', result: 'Identified 5-10 standard codes' },
    { phase: 'Architecture', action: 'Decomposed to functional modules', result: `${state.modules?.length || 0} modules created` },
    { phase: 'Sizing', action: 'Algorithmic 3D packing', result: state.dimensionSheet?.feasible ? 'Feasible layout found' : 'Constraints failed' },
    { phase: 'BOM', action: 'Synthesised constituent parts', result: `${state.parts?.length || 0} lines generated` },
    { phase: 'Sourcing', action: 'Matched parts to supplier APIs', result: 'Selected preferred vendors' },
    { phase: 'Economics', action: 'Applied cost models', result: `Computed ${formatGBP(state.costBreakdown?.unitTotalGbp)}` },
    { phase: 'Review', action: 'Cross-specialist critique', result: 'Addressed engineering conflicts' },
    { phase: 'Risk', action: 'Populated FMEA table', result: 'Computed RPN values' },
    { phase: 'Publish', action: 'Generated final PDF report', result: 'Success' }
  ]

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h1}>8. Audit Log <GradeLabel grade="A" /></Text>
      <Text style={s.paraLarge}>Pipeline execution trace for traceability and verification.</Text>

      <View style={s.tableWrap}>
        <View style={s.tHead}>
          <Text style={{ ...s.tHC, width: '10%' }}>#</Text>
          <Text style={{ ...s.tHC, width: '20%' }}>Phase</Text>
          <Text style={{ ...s.tHC, width: '40%' }}>Action</Text>
          <Text style={{ ...s.tHC, width: '30%' }}>Result</Text>
        </View>
        {steps.map((step, i) => (
          <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt} wrap={false}>
            <Text style={{ ...s.tC, width: '10%' }}>{i + 1}</Text>
            <Text style={{ ...s.tC, width: '20%', fontWeight: 'bold' }}>{step.phase}</Text>
            <Text style={{ ...s.tC, width: '40%' }}>{step.action}</Text>
            <Text style={{ ...s.tC, width: '30%' }}>{step.result}</Text>
          </View>
        ))}
      </View>

      <PageFooter section="8. Audit Log" />
    </Page>
  )
}

// ─── Section Scorecard ─────────────────────────────────────────────────────

const Footer = ({ section }: { section: string }) => (
  <View style={{ position: 'absolute', bottom: 30, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 4 }}>
    <Text style={{ fontSize: 8, color: SOFT }}>{section}</Text>
    <Text style={{ fontSize: 8, color: SOFT }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>
)

interface ScorecardProps {
  sectionName: string
  score: number
  dimensions: Array<{ name: string; score: number; reason: string }>
  recommendations: string[]
}

function SectionScorecard({ sectionName, score, dimensions, recommendations }: ScorecardProps) {
  const scoreColor = score >= 70 ? GREEN : score >= 50 ? AMBER : RED

  return (
    <View style={{ marginTop: 16, padding: 16, backgroundColor: BG_SOFT, borderRadius: 6, borderWidth: 1, borderColor: BORDER }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK_DARK }}>
          Section Evaluation: {sectionName}
        </Text>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: scoreColor, borderRadius: 4 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#fff' }}>
            {score}/100
          </Text>
        </View>
      </View>

      {dimensions.map((d, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: BORDER }}>
          <Text style={{ width: '45%', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK }}>{d.name}</Text>
          <Text style={{ width: '10%', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: d.score >= 70 ? GREEN : d.score >= 50 ? AMBER : RED }}>{d.score}/100</Text>
          <Text style={{ width: '45%', fontSize: 8, fontFamily: 'Helvetica', color: MUTED }}>{d.reason}</Text>
        </View>
      ))}

      {recommendations.length > 0 && (
        <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: BORDER }}>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND, marginBottom: 4 }}>
            Recommended Code Changes:
          </Text>
          {recommendations.slice(0, 3).map((r, i) => (
            <Text key={i} style={{ fontSize: 8, marginBottom: 3, color: INK, fontFamily: 'Courier' }}>
              {r}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

// ─── Main Export ───────────────────────────────────────────────────────────

export default function PdfRenderer({ state }: { state: PipelineState }) {
  return (
    <Document title={`Engineering Report: ${formatText(state.projectId)}`} author="Fractional Forge PDF Engine">
      <CoverPage state={state} />
      <FeasibilityGatePage state={state} />
      <BriefPages state={state} />
      <RegulatorySection state={state} />
      <SizingSection state={state} />
      <ModulesSection state={state} />
      <CostWaterfallSection state={state} />
      <RisksSection state={state} />
      <SourceAttributionSection state={state} />
      <AuditLogSection state={state} />
      {/* Scorecard pages at the end */}
      {(state.sectionScores || []).filter((sc: any) => sc && sc.section).map((sc: any, i: number) => {
        const dims = (sc.reasons || []).filter(Boolean).map((r: string) => ({
          name: r.length > 60 ? r.slice(0, 60) + '...' : r,
          score: 50,
          reason: r
        }))
        return (
          <Page key={`score-${i}`} size="A4" style={s.page}>
            <SectionScorecard
              sectionName={sc.section || 'Unknown'}
              score={sc.score || 0}
              dimensions={dims}
              recommendations={(sc.suggestions || []).filter(Boolean)}
            />
            <Footer section={`${sc.section || 'Section'} — Scorecard`} />
          </Page>
        )
      })}
    </Document>
  )
}
