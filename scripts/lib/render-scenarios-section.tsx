/**
 * scripts/lib/render-scenarios-section.tsx
 *
 * The "Economics & Scenarios" dossier section (react-pdf). Self-contained:
 * receives the shared PageHeader/PageFooter/pageStyle as props (no circular
 * import) and computes the scenario plan from state (compute-if-absent, so it
 * renders whether or not the chain populated state.scenarioPlanning).
 *
 * Charts are View-rectangle bars (robust across @react-pdf versions; no Svg
 * geometry fragility): a sensitivity TORNADO and a base->NOAK WATERFALL.
 */
import React from 'react'
import { Page, Text, View } from '@react-pdf/renderer'
import { planScenariosForState } from './scenario-models'
import type { ScenarioPlanning, ScenarioResult, TornadoItem } from './scenario-planning'

const INK = '#0d1117'
const MUTED = '#6b7280'
const ACCENT = '#1e3a5f'
const ACCENT_SOFT = '#2563ae'
const RULE_SOFT = '#e5e7eb'
const GOOD = '#15803d'
const BAD = '#b91c1c'
const GOOD_BG = '#eafaf1'
const BAD_BG = '#fdeaea'

function gbpM(v: number): string {
  const m = v / 1e6
  const s = Math.abs(m) >= 100 ? m.toFixed(0) : m.toFixed(1)
  return `${v < 0 ? '-' : ''}£${s.replace('-', '')}M`
}
/** Format a single lever value with its unit (capex in £M; prices keep their unit). */
function fmtLeverVal(v: number, unit: string): string {
  if (unit === '£') return `£${Math.round(v / 1e6)}M`
  if (unit === '%') return `${Math.round(v * 10) / 10}%`
  if (unit === 'h/yr') return `${Math.round(v).toLocaleString('en-GB')} h`
  if (unit.startsWith('£')) return `£${v}${unit.slice(1)}`
  return `${v} ${unit}`
}
/** Format a low-to-high range with one unit suffix (e.g. "£1.4-£5.9/kg", "£18-£30M"). */
function fmtRange(lo: number, hi: number, unit: string): string {
  if (unit === '£') return `£${Math.round(lo / 1e6)}-£${Math.round(hi / 1e6)}M`
  if (unit === '%') return `${Math.round(lo * 10) / 10}-${Math.round(hi * 10) / 10}%`
  if (unit === 'h/yr') return `${Math.round(lo).toLocaleString('en-GB')}-${Math.round(hi).toLocaleString('en-GB')} h`
  if (unit.startsWith('£')) return `£${lo}-£${hi}${unit.slice(1)}`
  return `${lo}-${hi} ${unit}`
}
function leverValueDisplay(scn: ScenarioResult, t: TornadoItem): string {
  const lv = scn.lever_values
  const key = t.lever_id === 'capex' ? 'capex'
    : t.lever_id === 'output_price' ? 'output_price'
    : t.lever_id === 'utilisation' ? 'utilisation'
    : t.lever_id === 'discount_rate' ? 'discount_rate'
    : t.lever_id.replace('vprice_', '')
  const v = (lv as any)[key]
  if (v == null) return '—'
  if (t.unit === '£') return gbpM(v)
  if (t.unit === '%') return `${Math.round(v * 10) / 10}%`
  if (t.unit === 'h/yr') return `${Math.round(v).toLocaleString('en-GB')}`
  return `${Math.round(v * 100) / 100}`
}
function clears(s: ScenarioResult): React.ReactElement {
  return (
    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: s.clears_hurdle ? GOOD : BAD }}>
      {s.clears_hurdle ? 'yes' : 'no'}
    </Text>
  )
}

function KpiTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'good' }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: RULE_SOFT, borderRadius: 4, padding: 7, marginRight: 6 }}>
      <Text style={{ fontSize: 6.8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 12.5, fontFamily: 'Helvetica-Bold', color: tone === 'bad' ? BAD : tone === 'good' ? GOOD : INK }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 6.8, color: MUTED, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  )
}

function ScenarioMatrix({ sp }: { sp: ScenarioPlanning }) {
  const cols: ScenarioResult[] = [sp.base, ...sp.scenarios]
  const leverRows = sp.tornado.slice(0, 5) // top 5 by impact
  const colW = 92
  const labW = 150
  const cell = (k: string, txt: string | React.ReactElement, bold = false, color = INK) =>
    typeof txt === 'string'
      ? <Text key={k} style={{ width: colW, fontSize: 9, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica', color, textAlign: 'right' }}>{txt}</Text>
      : <View key={k} style={{ width: colW, alignItems: 'flex-end' }}>{txt}</View>
  return (
    <View style={{ marginBottom: 14 }} wrap={false}>
      {/* header */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: ACCENT, paddingBottom: 4, marginBottom: 3 }}>
        <Text style={{ width: labW, fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>Assumption (only exogenous; BoM fixed)</Text>
        {cols.map((c) => (
          <Text key={c.id} style={{ width: colW, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: c.id === 'noak' ? ACCENT_SOFT : INK, textAlign: 'right' }}>{c.label.replace(' (FOAK, as designed)', ' FOAK').replace(' (nth-of-a-kind)', '')}</Text>
        ))}
      </View>
      {leverRows.map((t) => (
        <View key={t.lever_id} style={{ flexDirection: 'row', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: RULE_SOFT }}>
          <Text style={{ width: labW, fontSize: 9, color: INK }}>{t.label}<Text style={{ color: MUTED }}> ({t.unit})</Text></Text>
          {cols.map((c) => cell(c.id, leverValueDisplay(c, t)))}
        </View>
      ))}
      {/* results */}
      <View style={{ flexDirection: 'row', paddingTop: 5, marginTop: 2, borderTopWidth: 1, borderTopColor: ACCENT }}>
        <Text style={{ width: labW, fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>Levelised cost ({sp.levelised_unit_label})</Text>
        {cols.map((c) => cell(c.id, `£${c.levelised_display.toLocaleString('en-GB')}`, true))}
      </View>
      <View style={{ flexDirection: 'row', paddingVertical: 2.5 }}>
        <Text style={{ width: labW, fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>NPV (20-yr)</Text>
        {cols.map((c) => cell(c.id, gbpM(c.npv_gbp), true, c.npv_gbp >= 0 ? GOOD : BAD))}
      </View>
      <View style={{ flexDirection: 'row', paddingVertical: 2.5 }}>
        <Text style={{ width: labW, fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>IRR</Text>
        {cols.map((c) => cell(c.id, c.irr_pct == null ? 'n/a' : `${c.irr_pct}%`, true))}
      </View>
      <View style={{ flexDirection: 'row', paddingVertical: 2.5 }}>
        <Text style={{ width: labW, fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>Clears NPV&gt;=0 / {sp.irr_hurdle_pct}% IRR?</Text>
        {cols.map((c) => cell(c.id, clears(c)))}
      </View>
    </View>
  )
}

function Tornado({ sp }: { sp: ScenarioPlanning }) {
  const items = sp.tornado.filter((t) => t.delta_npv_abs > 0).slice(0, 7)
  // shared NPV axis over every endpoint + the base + breakeven (£0)
  const npvs = [sp.base.npv_gbp, 0]
  for (const t of items) npvs.push(t.npv_pessimistic, t.npv_optimistic)
  const axMin = Math.min(...npvs), axMax = Math.max(...npvs)
  const BARW = 168
  const x = (v: number) => (axMax === axMin ? 0 : ((v - axMin) / (axMax - axMin)) * BARW)
  const baseX = x(sp.base.npv_gbp), zeroX = Math.min(BARW - 1, x(0))
  const cName = 92, cRange = 70, cNpv = 96
  const tick = (v: number) => `${v < 0 ? '-' : ''}£${Math.abs(Math.round(v / 1e6))}M`
  return (
    <View style={{ marginBottom: 14 }} wrap={false}>
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 2 }}>What moves the economics</Text>
      <Text style={{ fontSize: 8, color: MUTED, marginBottom: 6 }}>Each assumption is moved on its own across the range shown (others held at base). The bar spans the resulting NPV, read on the axis below — so you can see what each end of the range does. Dotted line = base case, solid line = breakeven (£0).</Text>
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: RULE_SOFT, paddingBottom: 2, marginBottom: 4 }}>
        <Text style={{ width: cName, fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>Assumption</Text>
        <Text style={{ width: cRange, fontSize: 7, color: MUTED, textAlign: 'right', paddingRight: 6 }}>Range tested</Text>
        <Text style={{ width: BARW, fontSize: 7, color: MUTED, textAlign: 'center' }}>NPV across that range</Text>
        <Text style={{ width: cNpv, fontSize: 7, color: MUTED, textAlign: 'right' }}>NPV: low to high val</Text>
      </View>
      {items.map((t) => {
        const lo = Math.min(t.pessimistic_value, t.optimistic_value)
        const hi = Math.max(t.pessimistic_value, t.optimistic_value)
        const lowValIsPess = t.pessimistic_value <= t.optimistic_value
        const npvAtLow = lowValIsPess ? t.npv_pessimistic : t.npv_optimistic
        const npvAtHigh = lowValIsPess ? t.npv_optimistic : t.npv_pessimistic
        const barL = Math.min(x(npvAtLow), x(npvAtHigh)), barR = Math.max(x(npvAtLow), x(npvAtHigh))
        return (
          <View key={t.lever_id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3.5 }}>
            <Text style={{ width: cName, fontSize: 8, color: INK }}>{t.label}</Text>
            <Text style={{ width: cRange, fontSize: 7.5, color: MUTED, textAlign: 'right', paddingRight: 6 }}>{fmtRange(lo, hi, t.unit)}</Text>
            <View style={{ width: BARW, height: 11, position: 'relative' }}>
              <View style={{ position: 'absolute', left: baseX, top: 0, width: 0.6, height: 11, backgroundColor: MUTED, opacity: 0.7 }} />
              <View style={{ position: 'absolute', left: zeroX, top: 0, width: 0.9, height: 11, backgroundColor: INK }} />
              <View style={{ position: 'absolute', left: barL, top: 2.5, width: Math.max(2, barR - barL), height: 6, backgroundColor: ACCENT_SOFT, opacity: 0.55, borderRadius: 1 }} />
            </View>
            <Text style={{ width: cNpv, fontSize: 7.5, color: INK, textAlign: 'right' }}>{gbpM(npvAtLow)} to {gbpM(npvAtHigh)}</Text>
          </View>
        )
      })}
      <View style={{ flexDirection: 'row', marginTop: 1 }}>
        <View style={{ width: cName + cRange }} />
        <View style={{ width: BARW, height: 9, position: 'relative' }}>
          <Text style={{ position: 'absolute', left: 0, top: 0, fontSize: 6, color: MUTED }}>{tick(axMin)}</Text>
          <Text style={{ position: 'absolute', left: Math.max(0, Math.min(BARW - 18, baseX - 7)), top: 0, fontSize: 6, color: MUTED }}>base</Text>
          <Text style={{ position: 'absolute', right: 0, top: 0, fontSize: 6, color: INK }}>{tick(axMax)}</Text>
        </View>
        <View style={{ width: cNpv }} />
      </View>
    </View>
  )
}

function Waterfall({ sp }: { sp: ScenarioPlanning }) {
  if (!sp.waterfall.length) return null
  const noak = sp.scenarios.find((s) => s.id === 'noak')
  // shared NPV axis over the base, breakeven (£0), and every step endpoint
  const npvs = [sp.base.npv_gbp, 0]
  for (const w of sp.waterfall) npvs.push(w.from_npv, w.to_npv)
  const axMin = Math.min(...npvs), axMax = Math.max(...npvs)
  const BARW = 168
  const x = (v: number) => (axMax === axMin ? 0 : ((v - axMin) / (axMax - axMin)) * BARW)
  const baseX = x(sp.base.npv_gbp), zeroX = Math.min(BARW - 1, x(0))
  const cName = 96, cChange = 96, cNpv = 96
  const tick = (v: number) => `${v < 0 ? '-' : ''}£${Math.abs(Math.round(v / 1e6))}M`
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 2 }}>Bridge: base to {noak?.label ?? 'NOAK'}</Text>
      <Text style={{ fontSize: 8, color: MUTED, marginBottom: 6 }}>Each assumption is moved in turn from the FOAK base ({gbpM(sp.base.npv_gbp)}) toward {noak?.label ?? 'NOAK'} ({gbpM(noak?.npv_gbp ?? 0)}). Each bar floats from the running NPV before the change to after it, read on the axis below — green improves NPV, red worsens it. Dotted line = base case, solid line = breakeven (£0).</Text>
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: RULE_SOFT, paddingBottom: 2, marginBottom: 4 }}>
        <Text style={{ width: cName, fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>Assumption</Text>
        <Text style={{ width: cChange, fontSize: 7, color: MUTED, textAlign: 'right', paddingRight: 6 }}>Change (base to NOAK)</Text>
        <Text style={{ width: BARW, fontSize: 7, color: MUTED, textAlign: 'center' }}>NPV before to after</Text>
        <Text style={{ width: cNpv, fontSize: 7, color: MUTED, textAlign: 'right' }}>Running NPV</Text>
      </View>
      {sp.waterfall.map((w, i) => {
        const up = w.delta_npv >= 0
        const barL = Math.min(x(w.from_npv), x(w.to_npv)), barR = Math.max(x(w.from_npv), x(w.to_npv))
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3.5 }}>
            <Text style={{ width: cName, fontSize: 8, color: INK }}>{w.label}</Text>
            <Text style={{ width: cChange, fontSize: 7.5, color: MUTED, textAlign: 'right', paddingRight: 6 }}>{fmtLeverVal(w.from_value, w.unit)} to {fmtLeverVal(w.to_value, w.unit)}</Text>
            <View style={{ width: BARW, height: 11, position: 'relative' }}>
              <View style={{ position: 'absolute', left: baseX, top: 0, width: 0.6, height: 11, backgroundColor: MUTED, opacity: 0.7 }} />
              <View style={{ position: 'absolute', left: zeroX, top: 0, width: 0.9, height: 11, backgroundColor: INK }} />
              <View style={{ position: 'absolute', left: barL, top: 2.5, width: Math.max(2, barR - barL), height: 6, backgroundColor: up ? GOOD : BAD, opacity: 0.55, borderRadius: 1 }} />
            </View>
            <Text style={{ width: cNpv, fontSize: 7.5, color: INK, textAlign: 'right' }}>reaches {gbpM(w.to_npv)}</Text>
          </View>
        )
      })}
      <View style={{ flexDirection: 'row', marginTop: 1 }}>
        <View style={{ width: cName + cChange }} />
        <View style={{ width: BARW, height: 9, position: 'relative' }}>
          <Text style={{ position: 'absolute', left: 0, top: 0, fontSize: 6, color: MUTED }}>{tick(axMin)}</Text>
          <Text style={{ position: 'absolute', left: Math.max(0, Math.min(BARW - 18, baseX - 7)), top: 0, fontSize: 6, color: MUTED }}>base</Text>
          <Text style={{ position: 'absolute', right: 0, top: 0, fontSize: 6, color: INK }}>{tick(axMax)}</Text>
        </View>
        <View style={{ width: cNpv }} />
      </View>
    </View>
  )
}

export interface EconomicsScenariosPageProps {
  state: any
  project: string
  PageHeader: React.ComponentType<{ section: string; project: string }>
  PageFooter: React.ComponentType<Record<string, never>>
  pageStyle: any
  sectionLabel?: string
}

export function EconomicsScenariosPage(props: EconomicsScenariosPageProps): React.ReactElement | null {
  const { state, project, PageHeader, PageFooter, pageStyle } = props
  let sp: ScenarioPlanning | null = null
  try {
    sp = (state?.scenarioPlanning as ScenarioPlanning) ?? planScenariosForState(state)
  } catch {
    return null
  }
  if (!sp || !sp.base) return null
  const b = sp.base
  return (
    <Page size="A4" style={pageStyle}>
      <PageHeader section={props.sectionLabel ?? 'Section 12 · Economics & Scenarios'} project={project} />
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 }}>Economics &amp; Scenarios</Text>
      <Text style={{ fontSize: 9.5, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
        Indicative, concept-stage. The base case reproduces the dossier&apos;s costed economics; scenarios vary only EXOGENOUS
        assumptions (prices, utilisation, cost of capital, and capex via a nth-of-a-kind learning curve floored by the bill of
        materials) — never the physical design, which would change the parts list. Investable = NPV &gt;= 0 or IRR &gt;= {sp.irr_hurdle_pct}%.
      </Text>

      <Text style={{ fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Base case — first-of-a-kind, as designed</Text>
      <View style={{ flexDirection: 'row', marginBottom: 16 }}>
        <KpiTile label="Levelised cost" value={`£${b.levelised_display.toLocaleString('en-GB')}`} sub={sp.levelised_unit_label.replace('£/', 'per ')} tone="bad" />
        <KpiTile label="NPV (20-yr)" value={gbpM(b.npv_gbp)} sub={`at ${sp.irr_hurdle_pct - 2}-${sp.irr_hurdle_pct}% discount`} tone={b.npv_gbp >= 0 ? 'good' : 'bad'} />
        <KpiTile label="IRR" value={b.irr_pct == null ? 'n/a' : `${b.irr_pct}%`} sub={b.irr_pct == null ? 'never positive' : ''} tone="bad" />
        <KpiTile label="Payback" value={b.payback_years == null ? '> life' : `${b.payback_years} yr`} />
        <KpiTile label="Investable?" value={b.clears_hurdle ? 'yes' : 'no'} tone={b.clears_hurdle ? 'good' : 'bad'} />
      </View>

      <ScenarioMatrix sp={sp} />
      <Tornado sp={sp} />
      <Waterfall sp={sp} />

      <View style={{ marginTop: 4, padding: 11, borderWidth: 1, borderColor: sp.honest_reading.clears_any ? '#cfe6e0' : '#f0d9b5', backgroundColor: sp.honest_reading.clears_any ? GOOD_BG : '#fdf6ec', borderRadius: 5 }} wrap={false}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: ACCENT, marginBottom: 5 }}>What it would take</Text>
        {sp.honest_reading.points.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }}>
            <Text style={{ width: 10, fontSize: 9, color: ACCENT_SOFT }}>•</Text>
            <Text style={{ flex: 1, fontSize: 9, color: '#28313f', lineHeight: 1.45 }}>{p}</Text>
          </View>
        ))}
      </View>

      <Text style={{ marginTop: 10, fontSize: 7, color: MUTED, lineHeight: 1.4 }}>
        Scenario figures are deterministic recomputations of the same discounted-cash-flow model used for the base case, with one or
        more exogenous inputs changed within defensible market/literature bands. They are not a forecast or investment advice. Capex
        in any scenario is floored at the bottom-up bill-of-materials cost (£{(sp.bom_floor_gbp / 1e6).toFixed(1)}M); a value below that is shown as infeasible.
      </Text>
      <PageFooter />
    </Page>
  )
}
