/**
 * @file export-design-report-html.ts
 *
 * @description Exports a Design Report as a standalone, print-ready HTML
 * file. One self-contained `.html` that renders in any browser, respects
 * a per-audience print stylesheet (A4 portrait, 18mm margins), and can be
 * "Save as PDF"d or shared as a web asset.
 *
 * Audience layers:
 *   investor   — editorial serif (Playfair), narrative-led, KPI cards
 *   marketing  — editorial serif (Playfair), hero-first, glossy cover
 *   engineer   — technical sans (Inter), dense specs + standards
 *   supplier   — technical sans (Inter), BOM first
 *
 * Images (hero + per-module) are resized via the sharp server action and
 * inlined as JPEG data URIs so the .html file is portable.
 *
 * @related
 * - src/lib/cad-lab/design-report-types.ts — DesignReportData
 * - src/lib/cad-lab/audience.ts — reorderSectionsForAudience + AUDIENCE_META
 * - src/actions/image-resize-action.ts — server-side sharp resize
 */

import type {
  DesignReportData,
  AiReportSection,
  ReportSectionType,
} from '@/lib/cad-lab/design-report-types'
import {
  AUDIENCE_META,
  DEFAULT_AUDIENCE,
  reorderSectionsForAudience,
} from '@/lib/cad-lab/audience'
import type { ReportAudience } from '@/lib/cad-lab/audience'

// ─── Brand tokens (mirrors docx/pptx) ───────────────────────────────

const ORANGE = '#FF4500'
const TEAL = '#14B8A6'
const DARK_TEXT = '#1E293B'
const MID_TEXT = '#64748B'
const LIGHT_BG = '#F8FAFC'
const CARD_BORDER = '#E2E8F0'

// ─── Helpers ────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Very light markdown → HTML (bold, italic, bullet lists, paragraphs).
 *  The AI prose uses at most these. Keeps the dependency surface tiny. */
function mdToHtml(src: string): string {
  const blocks = src.trim().split(/\n{2,}/)
  return blocks
    .map((block) => {
      const lines = block.split('\n')
      // Bullet list block — every line starts with "- " or "* "
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => inline(l.replace(/^\s*[-*]\s+/, '')))
          .map((l) => `<li>${l}</li>`)
          .join('')
        return `<ul>${items}</ul>`
      }
      return `<p>${inline(block.replace(/\n/g, ' '))}</p>`
    })
    .join('\n')
}

function inline(src: string): string {
  return escapeHtml(src)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const { resizeImageToDataUri } = await import('@/actions/image-resize-action')
    return await resizeImageToDataUri(url, { maxEdge: 1600, quality: 85 })
  } catch {
    return null
  }
}

// ─── KPI extraction (mirrors docx/pptx logic) ───────────────────────

interface HtmlKpi { label: string; value: string; hint?: string }

function extractKpisForAudience(
  data: DesignReportData,
  audience: ReportAudience,
): HtmlKpi[] {
  const kpis: HtmlKpi[] = []
  switch (audience) {
    case 'investor': {
      kpis.push({ label: 'Modules', value: String(data.modules.length), hint: 'sub-assemblies' })
      const massTotal = data.modules.reduce((s, m) => s + (m.estimatedMassKg ?? 0), 0)
      if (massTotal > 0) kpis.push({ label: 'Mass', value: `${massTotal.toFixed(1)} kg`, hint: 'per unit' })
      const costTotal = Object.values(data.aiCostEstimates).reduce((s, e) => s + (e.totalPerUnit ?? 0), 0)
      if (costTotal > 0) kpis.push({ label: 'Unit cost', value: `£${Math.round(costTotal).toLocaleString('en-GB')}`, hint: 'early est.' })
      const leadMax = Math.max(0, ...data.modules.map((m) => m.leadWeeks ?? 0))
      if (leadMax > 0) kpis.push({ label: 'Lead time', value: `${leadMax} wks`, hint: 'longest' })
      break
    }
    case 'engineer': {
      kpis.push({ label: 'Modules', value: String(data.modules.length) })
      const diagCount = Object.keys(data.diagnosticAnswers).length
      if (diagCount > 0) kpis.push({ label: 'Diagnosed', value: String(diagCount), hint: 'with specs' })
      const stdCount = data.engineeringIntelligence?.standards.length ?? 0
      if (stdCount > 0) kpis.push({ label: 'Standards', value: String(stdCount), hint: 'referenced' })
      const cad = data.unifiedCadResult
      if (cad?.success && cad.massGrams != null) kpis.push({ label: 'CAD mass', value: `${(cad.massGrams / 1000).toFixed(2)} kg` })
      break
    }
    case 'supplier': {
      kpis.push({ label: 'Modules', value: String(data.modules.length) })
      const parts = data.classifiedParts?.length ?? 0
      if (parts > 0) kpis.push({ label: 'Parts', value: String(parts), hint: 'classified' })
      const buyParts = data.classifiedParts?.filter((p) => p.type === 'buy').length ?? 0
      if (parts > 0) kpis.push({ label: 'Buy', value: String(buyParts), hint: 'of ' + parts })
      const quoteCount = data.rfqQuotes?.quotes.length ?? 0
      if (quoteCount > 0) kpis.push({ label: 'Quotes', value: String(quoteCount) })
      break
    }
    case 'marketing': {
      kpis.push({ label: 'Modules', value: String(data.modules.length), hint: 'sub-assemblies' })
      const massTotal = data.modules.reduce((s, m) => s + (m.estimatedMassKg ?? 0), 0)
      if (massTotal > 0) kpis.push({ label: 'Weight', value: `${massTotal.toFixed(1)} kg` })
      const stdCount = data.engineeringIntelligence?.standards.length ?? 0
      if (stdCount > 0) kpis.push({ label: 'Standards', value: String(stdCount), hint: 'compliant' })
      kpis.push({ label: 'Stage', value: data.stage.charAt(0).toUpperCase() + data.stage.slice(1) })
      break
    }
  }
  return kpis.slice(0, 4)
}

// ─── Audience-specific CSS ──────────────────────────────────────────

function stylesFor(audience: ReportAudience): string {
  const editorial = audience === 'investor' || audience === 'marketing'

  // INTENT: A4 portrait, 18mm margins. Editorial audiences get Playfair
  // Display for display type + Inter for body; technical audiences get
  // Inter across the board with tighter line height.
  return `
    :root {
      --orange: ${ORANGE};
      --teal: ${TEAL};
      --dark: ${DARK_TEXT};
      --mid: ${MID_TEXT};
      --light-bg: ${LIGHT_BG};
      --card-border: ${CARD_BORDER};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: var(--dark); }
    body {
      font-family: ${editorial
        ? "'Inter', -apple-system, 'Segoe UI', sans-serif"
        : "'Inter', -apple-system, 'Segoe UI', sans-serif"};
      font-size: 11pt;
      line-height: ${editorial ? 1.6 : 1.5};
      max-width: 210mm;
      margin: 0 auto;
      padding: 24mm 18mm;
    }
    h1, h2, h3 { color: var(--dark); margin: 0; }
    h1 {
      font-family: ${editorial ? "'Playfair Display', Georgia, serif" : "'Inter', sans-serif"};
      font-size: ${editorial ? '42pt' : '28pt'};
      font-weight: ${editorial ? 700 : 800};
      line-height: 1.1;
      margin: 12pt 0 0 0;
      letter-spacing: ${editorial ? '-0.01em' : '-0.02em'};
    }
    h2 {
      font-family: ${editorial ? "'Playfair Display', Georgia, serif" : "'Inter', sans-serif"};
      font-size: 18pt;
      font-weight: 700;
      color: var(--orange);
      margin: 28pt 0 10pt 0;
      padding-bottom: 6pt;
      border-bottom: 3pt solid var(--orange);
    }
    h3 {
      font-family: 'Inter', sans-serif;
      font-size: 13pt;
      font-weight: 600;
      margin: 18pt 0 6pt 0;
    }
    p { margin: 0 0 10pt 0; }
    ul { margin: 0 0 10pt 20pt; padding: 0; }
    li { margin-bottom: 4pt; }
    .eyebrow {
      color: var(--orange);
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      margin-bottom: 6pt;
    }
    .masthead {
      color: var(--mid);
      font-size: 8pt;
      font-weight: 500;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin: 0 0 20pt 0;
    }
    .cover {
      padding: 30pt 0 40pt 0;
      border-bottom: 1pt solid var(--card-border);
    }
    .cover-meta {
      color: var(--mid);
      font-size: 12pt;
      margin-top: 12pt;
    }
    .cover-hero {
      margin-top: 28pt;
      width: 100%;
      height: auto;
      border-radius: 6pt;
    }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10pt;
      margin: 24pt 0;
    }
    .kpi-card {
      background: var(--light-bg);
      border: 1pt solid var(--card-border);
      border-radius: 6pt;
      padding: 12pt 14pt;
    }
    .kpi-label {
      font-size: 8pt;
      font-weight: 700;
      color: var(--mid);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 6pt;
    }
    .kpi-value {
      font-size: 26pt;
      font-weight: 700;
      color: var(--dark);
      font-family: ${editorial ? "'Playfair Display', Georgia, serif" : "'Inter', sans-serif"};
      line-height: 1;
    }
    .kpi-hint {
      font-size: 9pt;
      color: var(--mid);
      font-style: italic;
      margin-top: 4pt;
    }
    section { page-break-inside: avoid; }
    .module {
      margin-bottom: 22pt;
      padding-bottom: 22pt;
      border-bottom: 1pt solid var(--card-border);
    }
    .module:last-child { border-bottom: none; }
    .module-image { width: 100%; max-width: 420pt; border-radius: 4pt; margin: 6pt 0 10pt 0; }
    table { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt 0; }
    th, td { text-align: left; padding: 6pt 8pt; border: 1pt solid var(--card-border); font-size: 10pt; }
    th { background: var(--light-bg); color: var(--mid); font-weight: 700; }
    tbody tr:nth-child(even) td { background: #fbfdff; }
    .badge {
      display: inline-block;
      font-size: 8pt;
      font-weight: 700;
      padding: 2pt 6pt;
      border-radius: 3pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .badge-buy { background: rgba(20, 184, 166, 0.12); color: var(--teal); }
    .badge-make { background: rgba(255, 69, 0, 0.12); color: var(--orange); }
    .footer {
      margin-top: 40pt;
      padding-top: 18pt;
      border-top: 1pt solid var(--card-border);
      color: var(--mid);
      font-size: 9pt;
      font-style: italic;
      text-align: center;
    }
    @page { size: A4 portrait; margin: 18mm; }
    @media print {
      body { max-width: none; padding: 0; }
      h2 { page-break-after: avoid; }
      .module { page-break-inside: avoid; }
      .no-print { display: none; }
    }
  `
}

function audienceIntro(audience: ReportAudience): string {
  switch (audience) {
    case 'investor':
      return 'This edition leads with the opportunity — modules, unit economics, and lead times up front. Detailed engineering follows.'
    case 'engineer':
      return 'Specifications, referenced standards, and CAD metrics first. Narrative last.'
    case 'supplier':
      return 'Buy/make classification and supplier shortlist first. Process and material specs follow.'
    case 'marketing':
      return 'A narrative walkthrough of the product and its design decisions — suitable for the web or a press pack.'
  }
}

// ─── Section content renderers ──────────────────────────────────────

function renderKpiCallout(data: DesignReportData, audience: ReportAudience): string {
  const kpis = extractKpisForAudience(data, audience)
  if (kpis.length === 0) return ''
  const cards = kpis
    .map((k) => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-value">${escapeHtml(k.value)}</div>
        ${k.hint ? `<div class="kpi-hint">${escapeHtml(k.hint)}</div>` : ''}
      </div>`)
    .join('')
  return `
    <section>
      <h2>At a glance</h2>
      <div class="kpi-row">${cards}</div>
    </section>`
}

function renderSpecsTable(data: DesignReportData): string {
  const ids = Object.keys(data.diagnosticAnswers)
  if (ids.length === 0) return ''
  const rows = ids
    .map((id) => {
      const mod = data.modules.find((m) => m.id === id)
      const a = data.diagnosticAnswers[id] ?? {}
      if (!mod) return ''
      return `<tr>
        <td>${escapeHtml(mod.name)}</td>
        <td>${escapeHtml(a.mfg_process ?? '—')}</td>
        <td>${escapeHtml(a.material ?? '—')}</td>
        <td>${escapeHtml(a.tolerance ?? '—')}</td>
        <td>${escapeHtml(a.finish ?? '—')}</td>
        <td>${escapeHtml(a.batch_size ?? '—')}</td>
      </tr>`
    })
    .join('')
  return `
    <table>
      <thead><tr>
        <th>Module</th><th>Process</th><th>Material</th><th>Tolerance</th><th>Finish</th><th>Batch</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function renderCostTable(data: DesignReportData): string {
  const ids = Object.keys(data.aiCostEstimates)
  if (ids.length === 0) return ''
  const rows = ids
    .map((id) => {
      const mod = data.modules.find((m) => m.id === id)
      const est = data.aiCostEstimates[id]
      if (!mod || !est) return ''
      return `<tr>
        <td>${escapeHtml(mod.name)}</td>
        <td>${est.totalPerUnit != null ? `£${est.totalPerUnit.toFixed(2)}` : 'Not estimated'}</td>
        <td>${escapeHtml(est.confidence)}</td>
        <td>${escapeHtml(est.assumptions?.join('; ') ?? '—')}</td>
      </tr>`
    })
    .join('')
  return `
    <table>
      <thead><tr>
        <th>Module</th><th>Total / Unit</th><th>Confidence</th><th>Assumptions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function renderPartClassificationTable(data: DesignReportData): string {
  const parts = data.classifiedParts ?? []
  if (parts.length === 0) return ''
  const rows = parts
    .map((p) => {
      const badgeClass = p.type === 'buy' ? 'badge-buy' : 'badge-make'
      return `<tr>
        <td>${escapeHtml(p.partName)}</td>
        <td>${escapeHtml(p.moduleName)}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(p.type)}</span></td>
        <td>${escapeHtml(p.confidence)}</td>
        <td>${escapeHtml(p.reasons.join('; '))}</td>
      </tr>`
    })
    .join('')
  return `
    <table>
      <thead><tr>
        <th>Part</th><th>Module</th><th>Type</th><th>Confidence</th><th>Reasons</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function renderStandardsTable(data: DesignReportData): string {
  const standards = data.engineeringIntelligence?.standards ?? []
  if (standards.length === 0) return ''
  const rows = standards
    .slice(0, 20)
    .map(
      (s) => `<tr>
        <td>${escapeHtml(s.code)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.issuingBody)}</td>
        <td>${escapeHtml(s.summary.slice(0, 140) + (s.summary.length > 140 ? '…' : ''))}</td>
      </tr>`,
    )
    .join('')
  return `
    <table>
      <thead><tr>
        <th>Code</th><th>Standard</th><th>Body</th><th>Summary</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function renderSupplierMatchesTable(data: DesignReportData): string {
  const matches = data.supplierMatches ?? {}
  const ids = Object.keys(matches)
  if (ids.length === 0) return ''
  const rows = ids
    .flatMap((id) => {
      const mod = data.modules.find((m) => m.id === id)
      if (!mod) return []
      return (matches[id] ?? [])
        .slice(0, 3)
        .map(
          (m) => `<tr>
            <td>${escapeHtml(mod.name)}</td>
            <td>${escapeHtml(m.providerName)}</td>
            <td>${m.matchScore}</td>
            <td>${escapeHtml(m.matchReasons.join(', '))}</td>
          </tr>`,
        )
    })
    .join('')
  if (!rows) return ''
  return `
    <table>
      <thead><tr>
        <th>Module</th><th>Supplier</th><th>Score</th><th>Reasons</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function tableForSectionType(
  sectionType: ReportSectionType,
  data: DesignReportData,
): string {
  switch (sectionType) {
    case 'specifications':
      return renderSpecsTable(data)
    case 'cost-analysis':
      return renderCostTable(data)
    case 'part-classification':
      return renderPartClassificationTable(data)
    case 'engineering-standards':
      return renderStandardsTable(data)
    case 'supplier-analysis':
      return renderSupplierMatchesTable(data)
    default:
      return ''
  }
}

function renderAiSection(
  section: AiReportSection,
  data: DesignReportData,
  moduleImages: Map<string, string>,
): string {
  const bullets =
    section.keyPoints?.length > 0
      ? `<ul>${section.keyPoints
          .map((p) => `<li>${inline(p)}</li>`)
          .join('')}</ul>`
      : ''
  const img =
    section.includeImage && section.moduleId && moduleImages.has(section.moduleId)
      ? `<img class="module-image" src="${moduleImages.get(section.moduleId)}" alt="${escapeHtml(section.title)}" />`
      : ''
  const table = section.includeTable ? tableForSectionType(section.sectionType, data) : ''
  return `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      ${img}
      ${section.prose ? mdToHtml(section.prose) : ''}
      ${bullets}
      ${table}
    </section>`
}

// ─── Fallback (non-AI) rendering ────────────────────────────────────

function renderModuleCards(
  data: DesignReportData,
  moduleImages: Map<string, string>,
): string {
  if (data.modules.length === 0) return ''
  const cards = data.modules
    .map((m) => {
      const img = moduleImages.has(m.id)
        ? `<img class="module-image" src="${moduleImages.get(m.id)}" alt="${escapeHtml(m.name)}" />`
        : ''
      const specs: string[] = []
      if (m.leadWeeks != null) specs.push(`Lead: ${m.leadWeeks} weeks`)
      if (m.estimatedMassKg != null) specs.push(`Mass: ${m.estimatedMassKg} kg`)
      const specLine = specs.length ? `<p style="color:var(--mid);font-size:10pt;">${specs.join(' · ')}</p>` : ''
      return `
        <div class="module">
          <h3>${escapeHtml(m.name)}</h3>
          ${img}
          ${m.purpose ? `<p>${escapeHtml(m.purpose)}</p>` : ''}
          ${m.description ? `<p>${escapeHtml(m.description)}</p>` : ''}
          ${specLine}
        </div>`
    })
    .join('')
  return `<section><h2>Module breakdown</h2>${cards}</section>`
}

// ─── Public API ─────────────────────────────────────────────────────

export async function exportDesignReportAsHTML(
  data: DesignReportData,
): Promise<Blob> {
  const audience: ReportAudience = data.audience ?? DEFAULT_AUDIENCE
  const audienceMeta = AUDIENCE_META[audience]
  const editorial = audience === 'investor' || audience === 'marketing'

  // Pre-fetch hero + module images in parallel
  const heroPromise = data.heroImageUrl ? fetchImageAsDataUri(data.heroImageUrl) : Promise.resolve(null)
  const moduleUrls = data.modules.map((m) => ({ id: m.id, url: m.imageUrl }))
  const modulePromises = moduleUrls.map((x) => (x.url ? fetchImageAsDataUri(x.url) : Promise.resolve(null)))
  const [hero, ...modImgs] = await Promise.all([heroPromise, ...modulePromises])

  const moduleImages = new Map<string, string>()
  moduleUrls.forEach((x, i) => {
    const uri = modImgs[i]
    if (uri) moduleImages.set(x.id, uri)
  })

  // Subtitle mirrors docx/pptx
  const subtitle = data.stage === 'concept' ? 'Concept Report'
    : data.stage === 'specify' ? 'Specification Report'
    : data.stage === 'source' ? 'Sourcing Report'
    : data.stage === 'assemble' ? 'Assembly Report'
    : data.stage === 'cad' ? 'CAD Report'
    : data.stage === 'journey' ? 'Design Journey Report'
    : 'Engineering Design Report'

  const dateFmt = new Date(data.generatedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const cover = `
    <header class="cover">
      <div class="eyebrow">${escapeHtml(audienceMeta.label)}</div>
      <div class="masthead">Fractional Forge</div>
      <h1>${escapeHtml(data.projectName)}</h1>
      <div class="cover-meta">${escapeHtml(subtitle)} · ${escapeHtml(dateFmt)}</div>
      ${hero ? `<img class="cover-hero" src="${hero}" alt="${escapeHtml(data.projectName)}" />` : ''}
      <p style="margin-top:20pt;color:var(--mid);font-size:11pt;">${escapeHtml(audienceIntro(audience))}</p>
    </header>`

  const kpi = renderKpiCallout(data, audience)

  let body = ''
  if (data.aiContent) {
    const aiContent = data.aiContent
    const ordered = reorderSectionsForAudience(aiContent.sections, audience)
    const execSummary = aiContent.executiveSummary
      ? `<section><h2>Executive Summary</h2>${mdToHtml(aiContent.executiveSummary)}</section>`
      : ''
    const sectionHtml = ordered
      .filter((s) => s.sectionType !== 'executive-summary')
      .map((s) => renderAiSection(s, data, moduleImages))
      .join('\n')
    body = execSummary + sectionHtml
  } else {
    // Fallback — no AI narration available
    const overview = data.productOverview
      ? `<section><h2>Product Overview</h2><p>${escapeHtml(data.productOverview)}</p></section>`
      : ''
    const modCards = renderModuleCards(data, moduleImages)
    const specs = Object.keys(data.diagnosticAnswers).length > 0
      ? `<section><h2>Specifications</h2>${renderSpecsTable(data)}</section>`
      : ''
    const costs = Object.keys(data.aiCostEstimates).length > 0
      ? `<section><h2>Cost Estimates</h2>${renderCostTable(data)}</section>`
      : ''
    const classification = (data.classifiedParts?.length ?? 0) > 0
      ? `<section><h2>Part Classification</h2>${renderPartClassificationTable(data)}</section>`
      : ''
    const standards = (data.engineeringIntelligence?.standards?.length ?? 0) > 0
      ? `<section><h2>Referenced Design Standards</h2>${renderStandardsTable(data)}</section>`
      : ''
    const suppliers = renderSupplierMatchesTable(data)
      ? `<section><h2>Supplier Matches</h2>${renderSupplierMatchesTable(data)}</section>`
      : ''

    // Apply audience ordering to the legacy blocks too.
    const blocks: { sectionType: ReportSectionType; html: string }[] = [
      { sectionType: 'product-overview' as ReportSectionType, html: overview },
      { sectionType: 'module-overview' as ReportSectionType, html: modCards },
      { sectionType: 'specifications' as ReportSectionType, html: specs },
      { sectionType: 'cost-analysis' as ReportSectionType, html: costs },
      { sectionType: 'part-classification' as ReportSectionType, html: classification },
      { sectionType: 'engineering-standards' as ReportSectionType, html: standards },
      { sectionType: 'supplier-analysis' as ReportSectionType, html: suppliers },
    ].filter((b) => b.html)
    body = reorderSectionsForAudience(blocks, audience).map((b) => b.html).join('\n')
  }

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.projectName)} — ${escapeHtml(subtitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap${editorial ? '&family=Playfair+Display:wght@600;700' : ''}" rel="stylesheet" />
<style>${stylesFor(audience)}</style>
</head>
<body>
${cover}
${kpi}
${body}
<footer class="footer">Generated by ForgeOS — ${escapeHtml(audienceMeta.label)} · ${escapeHtml(dateFmt)}</footer>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })

  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '-')
  const stageLabel = data.stage ? `-${data.stage.charAt(0).toUpperCase() + data.stage.slice(1)}` : ''
  const dateStr = new Date(data.generatedAt).toISOString().split('T')[0]
  const filename = `${safeName}-${audience}${stageLabel}-${dateStr}.html`

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)

  return blob
}
