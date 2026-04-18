/**
 * @file export-design-report-pdf.tsx — Polished PDF export via @react-pdf/renderer.
 *
 * @description Replaces the legacy html2pdf.js pipeline. @react-pdf/renderer
 * produces vector PDFs with embedded web fonts and true typography control —
 * dramatically higher visual ceiling than the previous HTML-to-canvas approach,
 * at the cost of a fully declarative React layout system.
 *
 * Audience-aware:
 *   - investor → magazine cover + KPI stat cards + narrative-led layout
 *   - marketing → full-bleed editorial cover + hero image + brand voice
 *   - engineer → dense spec tables + standards + CAD metrics
 *   - supplier → BOM-first with part classification + process grids + lead times
 *
 * Unset audience defaults to `investor`.
 *
 * @related
 * - src/lib/cad-lab/audience.ts — ReportAudience + AUDIENCE_META
 * - src/lib/constants/brand-tokens.ts — colours, fonts, spacing
 * - src/lib/cad-lab/image-resize.ts — Sharp resize helper
 * - src/lib/cad-lab/design-report-types.ts — DesignReportData
 */

import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer'

import { BRAND_COLORS_CSS, FONT_URLS } from '@/lib/constants/brand-tokens'
import { AUDIENCE_META, DEFAULT_AUDIENCE } from '@/lib/cad-lab/audience'
import { fetchImageDataUriResized } from '@/lib/cad-lab/image-resize'
import type { DesignReportData } from '@/lib/cad-lab/design-report-types'
import type { ReportAudience } from '@/lib/cad-lab/audience'

// ─── Font registration (module-level, runs once per client bundle) ──

Font.register({
  family: 'Outfit',
  fonts: [
    { src: FONT_URLS.outfitRegular, fontWeight: 'normal' },
    { src: FONT_URLS.outfitMedium, fontWeight: 'medium' },
    { src: FONT_URLS.outfitBold, fontWeight: 'bold' },
  ],
})
Font.register({
  family: 'Playfair Display',
  fonts: [
    { src: FONT_URLS.playfairRegular, fontWeight: 'normal' },
    { src: FONT_URLS.playfairBold, fontWeight: 'bold' },
  ],
})
Font.register({
  family: 'Inter',
  fonts: [
    { src: FONT_URLS.interRegular, fontWeight: 'normal' },
    { src: FONT_URLS.interSemibold, fontWeight: 'semibold' },
  ],
})

// ─── Shared stylesheet ──────────────────────────────────────────────

const C = BRAND_COLORS_CSS

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontFamily: 'Outfit',
    fontSize: 10,
    color: C.darkText,
    backgroundColor: C.white,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 20,
    left: 56,
    right: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: C.midText,
    borderTop: 1,
    borderTopColor: C.cardBorder,
    paddingTop: 8,
  },
  coverPage: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    fontFamily: 'Outfit',
    color: C.darkText,
    backgroundColor: C.white,
  },
  coverAccent: {
    height: 6,
    backgroundColor: C.orange,
  },
  coverBody: {
    paddingHorizontal: 56,
    paddingTop: 72,
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  coverEyebrow: {
    fontSize: 10,
    fontWeight: 'medium',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: C.orange,
  },
  coverTitle: {
    fontFamily: 'Playfair Display',
    fontSize: 44,
    fontWeight: 'bold',
    color: C.darkText,
    marginTop: 12,
    marginBottom: 16,
    lineHeight: 1.08,
  },
  coverSubtitle: {
    fontSize: 13,
    color: C.midText,
    maxWidth: '80%',
    lineHeight: 1.5,
  },
  coverHeroImage: {
    marginTop: 36,
    marginBottom: 36,
    height: 340,
    borderRadius: 4,
    objectFit: 'cover',
  },
  coverMetaRow: {
    flexDirection: 'row',
    gap: 28,
    borderTop: 1,
    borderTopColor: C.cardBorder,
    paddingTop: 20,
    paddingBottom: 48,
  },
  coverMetaItem: {
    flexDirection: 'column',
  },
  coverMetaLabel: {
    fontSize: 8,
    fontWeight: 'medium',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.midText,
    marginBottom: 4,
  },
  coverMetaValue: {
    fontSize: 11,
    fontWeight: 'medium',
    color: C.darkText,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionAccentBar: {
    width: 24,
    height: 3,
    backgroundColor: C.orange,
    marginRight: 10,
  },
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: 'medium',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.orange,
  },
  sectionTitle: {
    fontFamily: 'Playfair Display',
    fontSize: 22,
    fontWeight: 'bold',
    color: C.darkText,
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 1.15,
  },
  sectionProse: {
    fontSize: 10.5,
    lineHeight: 1.55,
    color: C.darkText,
    marginBottom: 12,
  },
  proseParagraph: {
    fontSize: 10.5,
    lineHeight: 1.55,
    color: C.darkText,
    marginBottom: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  kpiCard: {
    width: '23%',
    minHeight: 92,
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.lightBg,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontSize: 8,
    fontWeight: 'medium',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.midText,
  },
  kpiValue: {
    fontFamily: 'Playfair Display',
    fontSize: 24,
    fontWeight: 'bold',
    color: C.darkText,
    marginTop: 4,
  },
  kpiHint: {
    fontSize: 8,
    color: C.midText,
    marginTop: 2,
  },
  table: {
    marginTop: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: C.lightBg,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  tableHeaderCell: {
    padding: 8,
    fontSize: 8.5,
    fontWeight: 'medium',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.midText,
    flex: 1,
  },
  tableCell: {
    padding: 8,
    fontSize: 9.5,
    color: C.darkText,
    flex: 1,
  },
  tableCellMuted: {
    padding: 8,
    fontSize: 9.5,
    color: C.midText,
    flex: 1,
  },
  moduleGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  moduleCard: {
    width: '48%',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.white,
    marginBottom: 6,
  },
  moduleCardTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: C.darkText,
    marginBottom: 4,
  },
  moduleCardBody: {
    fontSize: 9,
    color: C.midText,
    lineHeight: 1.45,
  },
  moduleCardSpec: {
    fontSize: 8.5,
    color: C.midText,
    marginTop: 6,
  },
  verdictPass: {
    backgroundColor: C.successBg,
    color: C.successText,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  verdictWarn: {
    backgroundColor: C.warningBg,
    color: C.warningText,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  verdictFail: {
    backgroundColor: C.destructiveBg,
    color: C.destructiveText,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
    paddingLeft: 14,
    paddingVertical: 4,
    marginVertical: 12,
    fontSize: 11,
    fontStyle: 'italic',
    color: C.darkText,
    lineHeight: 1.5,
  },
  cautionBanner: {
    padding: 10,
    borderRadius: 4,
    backgroundColor: C.warningBg,
    borderWidth: 1,
    borderColor: C.warningText,
    marginBottom: 16,
    fontSize: 9.5,
    color: C.warningText,
    lineHeight: 1.45,
  },
  spacer: { height: 12 },
  spacerLarge: { height: 24 },
})

// ─── Helpers ────────────────────────────────────────────────────────

function formatStageLabel(stage: DesignReportData['stage']): string {
  switch (stage) {
    case 'concept': return 'Concept'
    case 'specify': return 'Specification'
    case 'source': return 'Sourcing'
    case 'assemble': return 'Assembly'
    case 'cad': return 'CAD'
    case 'journey': return 'Design Journey'
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return iso.split('T')[0] ?? iso
  }
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

// ─── KPI extraction per audience ────────────────────────────────────

interface Kpi { label: string; value: string; hint?: string }

function extractInvestorKpis(data: DesignReportData): Kpi[] {
  const kpis: Kpi[] = []
  kpis.push({ label: 'Modules', value: String(data.modules.length), hint: 'sub-assemblies' })

  const massTotal = data.modules.reduce((sum, m) => sum + (m.estimatedMassKg ?? 0), 0)
  if (massTotal > 0) kpis.push({ label: 'Mass', value: `${massTotal.toFixed(1)} kg`, hint: 'target per unit' })

  const costTotal = Object.values(data.aiCostEstimates).reduce((sum, e) => sum + (e.totalPerUnit ?? 0), 0)
  if (costTotal > 0) kpis.push({ label: 'Unit cost', value: `£${Math.round(costTotal).toLocaleString('en-GB')}`, hint: 'per unit (early est.)' })

  const leadMax = Math.max(0, ...data.modules.map((m) => m.leadWeeks ?? 0))
  if (leadMax > 0) kpis.push({ label: 'Lead time', value: `${leadMax} wks`, hint: 'longest module' })

  return kpis.slice(0, 4)
}

function extractEngineerKpis(data: DesignReportData): Kpi[] {
  const kpis: Kpi[] = []
  kpis.push({ label: 'Modules', value: String(data.modules.length) })
  const diagCount = Object.keys(data.diagnosticAnswers).length
  if (diagCount > 0) kpis.push({ label: 'Diagnosed', value: String(diagCount), hint: 'modules with specs' })
  const stdCount = data.engineeringIntelligence?.standards.length ?? 0
  if (stdCount > 0) kpis.push({ label: 'Standards', value: String(stdCount), hint: 'referenced' })
  const cad = data.unifiedCadResult
  if (cad?.success && cad.massGrams != null) kpis.push({ label: 'CAD mass', value: `${(cad.massGrams / 1000).toFixed(2)} kg` })
  return kpis.slice(0, 4)
}

function extractSupplierKpis(data: DesignReportData): Kpi[] {
  const kpis: Kpi[] = []
  kpis.push({ label: 'Modules', value: String(data.modules.length) })
  const parts = data.classifiedParts?.length ?? 0
  if (parts > 0) kpis.push({ label: 'Parts', value: String(parts), hint: 'classified' })
  const buyParts = data.classifiedParts?.filter((p) => p.type === 'buy').length ?? 0
  if (parts > 0) kpis.push({ label: 'Buy', value: String(buyParts), hint: 'of ' + parts })
  const quoteCount = data.rfqQuotes?.quotes.length ?? 0
  if (quoteCount > 0) kpis.push({ label: 'Quotes', value: String(quoteCount) })
  return kpis.slice(0, 4)
}

function extractMarketingKpis(data: DesignReportData): Kpi[] {
  const kpis: Kpi[] = []
  kpis.push({ label: 'Modules', value: String(data.modules.length), hint: 'sub-assemblies' })
  const massTotal = data.modules.reduce((sum, m) => sum + (m.estimatedMassKg ?? 0), 0)
  if (massTotal > 0) kpis.push({ label: 'Weight', value: `${massTotal.toFixed(1)} kg` })
  const stdCount = data.engineeringIntelligence?.standards.length ?? 0
  if (stdCount > 0) kpis.push({ label: 'Standards', value: String(stdCount), hint: 'compliant' })
  kpis.push({ label: 'Stage', value: formatStageLabel(data.stage) })
  return kpis.slice(0, 4)
}

function extractKpis(data: DesignReportData, audience: ReportAudience): Kpi[] {
  switch (audience) {
    case 'investor': return extractInvestorKpis(data)
    case 'engineer': return extractEngineerKpis(data)
    case 'supplier': return extractSupplierKpis(data)
    case 'marketing': return extractMarketingKpis(data)
  }
}

// ─── Components ──────────────────────────────────────────────────────

function Footer({ projectName, audience, stage }: { projectName: string; audience: ReportAudience; stage: string }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text>{projectName} · {AUDIENCE_META[audience].label}</Text>
      <Text>{stage}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <>
      {eyebrow && (
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccentBar} />
          <Text style={s.sectionEyebrow}>{eyebrow}</Text>
        </View>
      )}
      <Text style={s.sectionTitle}>{title}</Text>
    </>
  )
}

function Cover({ data, heroDataUri, audience }: { data: DesignReportData; heroDataUri: string | null; audience: ReportAudience }) {
  const audienceMeta = AUDIENCE_META[audience]
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverAccent} />
      <View style={s.coverBody}>
        <View>
          <Text style={s.coverEyebrow}>{audienceMeta.label}</Text>
          <Text style={s.coverTitle}>{data.projectName}</Text>
          <Text style={s.coverSubtitle}>
            {formatStageLabel(data.stage)} report · prepared by Fractional Forge.
          </Text>
          {heroDataUri && <Image src={heroDataUri} style={s.coverHeroImage} />}
        </View>
        <View style={s.coverMetaRow}>
          <View style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>Generated</Text>
            <Text style={s.coverMetaValue}>{formatDate(data.generatedAt)}</Text>
          </View>
          <View style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>Modules</Text>
            <Text style={s.coverMetaValue}>{data.modules.length}</Text>
          </View>
          <View style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>Stage</Text>
            <Text style={s.coverMetaValue}>{formatStageLabel(data.stage)}</Text>
          </View>
        </View>
      </View>
    </Page>
  )
}

function KpiCards({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) return null
  return (
    <View style={s.kpiRow}>
      {kpis.map((k, i) => (
        <View key={i} style={s.kpiCard}>
          <Text style={s.kpiLabel}>{k.label}</Text>
          <View>
            <Text style={s.kpiValue}>{k.value}</Text>
            {k.hint && <Text style={s.kpiHint}>{k.hint}</Text>}
          </View>
        </View>
      ))}
    </View>
  )
}

function Prose({ text }: { text: string }) {
  const paragraphs = splitParagraphs(text)
  if (paragraphs.length === 0) return null
  return (
    <>
      {paragraphs.map((p, i) => (
        <Text key={i} style={s.proseParagraph}>{p}</Text>
      ))}
    </>
  )
}

function ExecutiveSummarySection({ summary, kpis }: { summary: string; kpis: Kpi[] }) {
  return (
    <View wrap={false}>
      <SectionTitle eyebrow="Executive summary" title="At a glance" />
      <KpiCards kpis={kpis} />
      {summary && <Text style={s.quoteBlock}>{summary}</Text>}
    </View>
  )
}

function ModulesTable({ data }: { data: DesignReportData }) {
  if (data.modules.length === 0) return null
  const rows = data.modules
  return (
    <View>
      <SectionTitle eyebrow="Architecture" title={`${rows.length} modules`} />
      <View style={s.table}>
        <View style={s.tableHeaderRow}>
          <Text style={s.tableHeaderCell}>Module</Text>
          <Text style={s.tableHeaderCell}>Purpose</Text>
          <Text style={s.tableHeaderCell}>Mass</Text>
          <Text style={s.tableHeaderCell}>Lead</Text>
        </View>
        {rows.map((m, idx) => (
          <View key={m.id} style={idx === rows.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={s.tableCell}>{m.name}</Text>
            <Text style={s.tableCellMuted}>{(m.purpose ?? '').slice(0, 180)}</Text>
            <Text style={s.tableCell}>{m.estimatedMassKg != null ? `${m.estimatedMassKg} kg` : '—'}</Text>
            <Text style={s.tableCell}>{m.leadWeeks != null ? `${m.leadWeeks} wks` : '—'}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function SpecificationsTable({ data }: { data: DesignReportData }) {
  const diagIds = Object.keys(data.diagnosticAnswers)
  if (diagIds.length === 0) return null
  return (
    <View>
      <SectionTitle eyebrow="Specifications" title="Diagnostic answers" />
      <View style={s.table}>
        <View style={s.tableHeaderRow}>
          <Text style={s.tableHeaderCell}>Module</Text>
          <Text style={s.tableHeaderCell}>Process</Text>
          <Text style={s.tableHeaderCell}>Material</Text>
          <Text style={s.tableHeaderCell}>Tolerance</Text>
          <Text style={s.tableHeaderCell}>Finish</Text>
        </View>
        {diagIds.map((moduleId, idx) => {
          const mod = data.modules.find((m) => m.id === moduleId)
          const a = data.diagnosticAnswers[moduleId]
          if (!mod || !a) return null
          return (
            <View key={moduleId} style={idx === diagIds.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={s.tableCell}>{mod.name}</Text>
              <Text style={s.tableCellMuted}>{a.mfg_process ?? '—'}</Text>
              <Text style={s.tableCellMuted}>{a.material ?? '—'}</Text>
              <Text style={s.tableCellMuted}>{a.tolerance ?? '—'}</Text>
              <Text style={s.tableCellMuted}>{a.finish ?? '—'}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function CostTable({ data }: { data: DesignReportData }) {
  const costIds = Object.keys(data.aiCostEstimates)
  if (costIds.length === 0) return null
  return (
    <View>
      <SectionTitle eyebrow="Economics" title="Per-module cost (early estimate)" />
      <View style={s.cautionBanner}>
        <Text>Early AI-generated estimates. Numbers may be off by a large margin — do not use for pricing, fundraising, or procurement without a qualified cost engineer or supply-chain lead reviewing each line item.</Text>
      </View>
      <View style={s.table}>
        <View style={s.tableHeaderRow}>
          <Text style={s.tableHeaderCell}>Module</Text>
          <Text style={s.tableHeaderCell}>£/Unit</Text>
          <Text style={s.tableHeaderCell}>Confidence</Text>
        </View>
        {costIds.map((moduleId, idx) => {
          const mod = data.modules.find((m) => m.id === moduleId)
          const est = data.aiCostEstimates[moduleId]
          if (!mod || !est) return null
          return (
            <View key={moduleId} style={idx === costIds.length - 1 ? s.tableRowLast : s.tableRow}>
              <Text style={s.tableCell}>{mod.name}</Text>
              <Text style={s.tableCell}>£{est.totalPerUnit.toFixed(2)}</Text>
              <Text style={s.tableCellMuted}>{est.confidence}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function StandardsTable({ data }: { data: DesignReportData }) {
  const ei = data.engineeringIntelligence
  if (!ei || ei.standards.length === 0) return null
  return (
    <View>
      <SectionTitle eyebrow="Compliance" title="Referenced design standards" />
      <View style={s.table}>
        <View style={s.tableHeaderRow}>
          <Text style={s.tableHeaderCell}>Code</Text>
          <Text style={s.tableHeaderCell}>Standard</Text>
          <Text style={s.tableHeaderCell}>Issuing body</Text>
        </View>
        {ei.standards.slice(0, 15).map((st, idx, arr) => (
          <View key={st.code} style={idx === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={s.tableCell}>{st.code}</Text>
            <Text style={s.tableCellMuted}>{st.name}</Text>
            <Text style={s.tableCellMuted}>{st.issuingBody}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function SupplierTable({ data }: { data: DesignReportData }) {
  const matches = data.supplierMatches
  if (!matches) return null
  const entries = Object.entries(matches)
  if (entries.length === 0) return null
  return (
    <View>
      <SectionTitle eyebrow="Sourcing" title="Supplier matches" />
      {entries.map(([moduleId, ms]) => {
        const mod = data.modules.find((m) => m.id === moduleId)
        return (
          <View key={moduleId} style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: 'medium', marginBottom: 4, color: C.darkText }}>{mod?.name ?? moduleId}</Text>
            <View style={s.table}>
              <View style={s.tableHeaderRow}>
                <Text style={s.tableHeaderCell}>Supplier</Text>
                <Text style={s.tableHeaderCell}>Score</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Match reasons</Text>
              </View>
              {ms.map((match, idx) => (
                <View key={match.providerName + idx} style={idx === ms.length - 1 ? s.tableRowLast : s.tableRow}>
                  <Text style={s.tableCell}>{match.providerName}</Text>
                  <Text style={s.tableCell}>{match.matchScore}</Text>
                  <Text style={[s.tableCellMuted, { flex: 2 }]}>{match.matchReasons.slice(0, 3).join('; ')}</Text>
                </View>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function PartClassificationTable({ data }: { data: DesignReportData }) {
  if (!data.classifiedParts?.length) return null
  return (
    <View>
      <SectionTitle eyebrow="BOM" title="Part classification (buy vs make)" />
      <View style={s.table}>
        <View style={s.tableHeaderRow}>
          <Text style={s.tableHeaderCell}>Part</Text>
          <Text style={s.tableHeaderCell}>Module</Text>
          <Text style={s.tableHeaderCell}>Type</Text>
          <Text style={s.tableHeaderCell}>Confidence</Text>
        </View>
        {data.classifiedParts.map((p, idx, arr) => (
          <View key={p.partName + idx} style={idx === arr.length - 1 ? s.tableRowLast : s.tableRow}>
            <Text style={s.tableCell}>{p.partName}</Text>
            <Text style={s.tableCellMuted}>{p.moduleName}</Text>
            <Text style={s.tableCell}>{p.type === 'buy' ? 'Buy' : 'Make'}</Text>
            <Text style={s.tableCellMuted}>{p.confidence}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function ModuleGrid({ data }: { data: DesignReportData }) {
  if (data.modules.length === 0) return null
  return (
    <View>
      <SectionTitle eyebrow="Architecture" title="Modules" />
      <View style={s.moduleGridRow}>
        {data.modules.map((m) => (
          <View key={m.id} style={s.moduleCard} wrap={false}>
            <Text style={s.moduleCardTitle}>{m.name}</Text>
            <Text style={s.moduleCardBody}>{(m.purpose ?? '').slice(0, 180)}</Text>
            <Text style={s.moduleCardSpec}>
              {m.estimatedMassKg != null ? `${m.estimatedMassKg} kg` : '—'}
              {' · '}
              {m.leadWeeks != null ? `${m.leadWeeks} wks` : '—'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function NarrativeBlock({ title, prose }: { title: string; prose: string }) {
  if (!prose.trim()) return null
  return (
    <View>
      <SectionTitle title={title} />
      <Prose text={prose} />
    </View>
  )
}

// ─── Per-audience page composition ──────────────────────────────────

function InvestorBody({ data, kpis }: { data: DesignReportData; kpis: Kpi[] }) {
  const ai = data.aiContent
  return (
    <>
      <ExecutiveSummarySection summary={ai?.executiveSummary ?? ''} kpis={kpis} />

      {ai?.sections?.length ? (
        ai.sections.slice(0, 6).map((sec) => (
          <View key={sec.id}>
            <View style={s.spacerLarge} />
            <NarrativeBlock title={sec.title} prose={sec.prose} />
          </View>
        ))
      ) : (
        <>
          <View style={s.spacerLarge} />
          <NarrativeBlock title="Product overview" prose={data.productOverview ?? ''} />
        </>
      )}

      <View style={s.spacerLarge} />
      <ModulesTable data={data} />

      {data.aiCostEstimates && Object.keys(data.aiCostEstimates).length > 0 && (
        <>
          <View style={s.spacerLarge} />
          <CostTable data={data} />
        </>
      )}
    </>
  )
}

function EngineerBody({ data, kpis }: { data: DesignReportData; kpis: Kpi[] }) {
  return (
    <>
      <ExecutiveSummarySection summary={data.aiContent?.executiveSummary ?? ''} kpis={kpis} />
      <View style={s.spacerLarge} />
      <ModulesTable data={data} />
      <View style={s.spacerLarge} />
      <SpecificationsTable data={data} />
      {data.engineeringIntelligence?.standards.length ? (
        <>
          <View style={s.spacerLarge} />
          <StandardsTable data={data} />
        </>
      ) : null}
      <View style={s.spacerLarge} />
      <CostTable data={data} />
      {data.aiContent?.sections.map((sec) => (
        <View key={sec.id} break>
          <NarrativeBlock title={sec.title} prose={sec.prose} />
        </View>
      ))}
    </>
  )
}

function SupplierBody({ data, kpis }: { data: DesignReportData; kpis: Kpi[] }) {
  return (
    <>
      <ExecutiveSummarySection summary={data.aiContent?.executiveSummary ?? ''} kpis={kpis} />
      <View style={s.spacerLarge} />
      <PartClassificationTable data={data} />
      <View style={s.spacerLarge} />
      <SpecificationsTable data={data} />
      <View style={s.spacerLarge} />
      <SupplierTable data={data} />
      {data.rfqQuotes?.quotes?.length ? (
        <>
          <View style={s.spacerLarge} />
          <SectionTitle eyebrow="RFQ" title={data.rfqQuotes.rfqTitle ?? 'Quotes received'} />
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={s.tableHeaderCell}>Supplier</Text>
              <Text style={s.tableHeaderCell}>Price</Text>
              <Text style={s.tableHeaderCell}>Weeks</Text>
              <Text style={s.tableHeaderCell}>Proposal</Text>
            </View>
            {data.rfqQuotes.quotes.map((q, idx, arr) => (
              <View key={q.supplierName + idx} style={idx === arr.length - 1 ? s.tableRowLast : s.tableRow}>
                <Text style={s.tableCell}>{q.supplierName}</Text>
                <Text style={s.tableCell}>{q.price != null ? `£${q.price.toFixed(2)}` : '—'}</Text>
                <Text style={s.tableCell}>{q.timelineWeeks ?? '—'}</Text>
                <Text style={s.tableCellMuted}>{q.proposalTitle ?? '—'}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </>
  )
}

function MarketingBody({ data, kpis }: { data: DesignReportData; kpis: Kpi[] }) {
  const heroText = data.aiContent?.executiveSummary ?? data.productOverview ?? ''
  return (
    <>
      {heroText && (
        <View>
          <SectionTitle eyebrow="The story" title="In brief" />
          <Text style={s.quoteBlock}>{heroText}</Text>
        </View>
      )}
      <View style={s.spacerLarge} />
      <KpiCards kpis={kpis} />
      <View style={s.spacerLarge} />
      <ModuleGrid data={data} />
      {data.aiContent?.sections.slice(0, 4).map((sec) => (
        <View key={sec.id}>
          <View style={s.spacerLarge} />
          <NarrativeBlock title={sec.title} prose={sec.prose} />
        </View>
      ))}
    </>
  )
}

// ─── Document assembly ──────────────────────────────────────────────

function ReportBodyPage({ data, kpis, audience }: { data: DesignReportData; kpis: Kpi[]; audience: ReportAudience }) {
  return (
    <Page size="A4" style={s.page}>
      {audience === 'investor' && <InvestorBody data={data} kpis={kpis} />}
      {audience === 'engineer' && <EngineerBody data={data} kpis={kpis} />}
      {audience === 'supplier' && <SupplierBody data={data} kpis={kpis} />}
      {audience === 'marketing' && <MarketingBody data={data} kpis={kpis} />}
      <Footer projectName={data.projectName} audience={audience} stage={formatStageLabel(data.stage)} />
    </Page>
  )
}

function ReportDocument({ data, heroDataUri }: { data: DesignReportData; heroDataUri: string | null }) {
  const audience = data.audience ?? DEFAULT_AUDIENCE
  const kpis = extractKpis(data, audience)
  return (
    <Document
      author="Fractional Forge"
      title={`${data.projectName} — ${AUDIENCE_META[audience].label}`}
      subject={`${formatStageLabel(data.stage)} report`}
    >
      <Cover data={data} heroDataUri={heroDataUri} audience={audience} />
      <ReportBodyPage data={data} kpis={kpis} audience={audience} />
    </Document>
  )
}

// ─── Public export ──────────────────────────────────────────────────

/** Render the Design Journey Report to a PDF blob. Triggers a browser
 *  download and returns the blob so callers can persist it to Storage. */
export async function exportDesignReportAsPDF(data: DesignReportData): Promise<Blob> {
  const heroDataUri = data.heroImageUrl ? await fetchImageDataUriResized(data.heroImageUrl, { maxEdge: 1800, quality: 88 }) : null

  const blob = await pdf(<ReportDocument data={data} heroDataUri={heroDataUri} />).toBlob()

  const audience = data.audience ?? DEFAULT_AUDIENCE
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'
  const filename = `${safeName}_${audience}_${data.stage}_report.pdf`

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)

  return blob
}
