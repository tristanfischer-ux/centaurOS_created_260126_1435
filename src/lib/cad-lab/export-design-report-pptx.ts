/**
 * @file export-design-report-pptx.ts
 *
 * @description Exports a Design Report as a branded .pptx PowerPoint
 * presentation. Slides: cover, executive summary, research highlights,
 * module overview table, per-module detail slides, specs, and costs.
 *
 * DECISION: pptxgenjs LAYOUT_16x9 = 10" × 5.625" (NOT 13.33" × 7.5").
 * All text boxes must stay within these bounds. Using 0.5" margins on
 * all sides gives a content area of 9.0" × 4.625".
 *
 * @related
 * - src/lib/cad-lab/design-report-types.ts — DesignReportData shape
 * - src/lib/reports/export-pptx.ts — Pattern reference (brand constants, slide builders)
 */

import PptxGenJS from 'pptxgenjs'

import type { DesignReportData, AiReportSection } from '@/lib/cad-lab/design-report-types'

// ─── Brand Constants ────────────────────────────────────────────────

const ORANGE = 'FF4500'
const DARK_TEXT = '1E293B'
const MID_TEXT = '64748B'
const LIGHT_BG = 'F8FAFC'

// ─── Layout Constants ───────────────────────────────────────────────
// INTENT: LAYOUT_16x9 = 10" × 5.625". Keep all content within bounds.

const MARGIN = 0.5
const CONTENT_W = 9.0 // 10 - 0.5 - 0.5
const SLIDE_H = 5.625
const FOOTER_Y = 5.2

// ─── Helpers ────────────────────────────────────────────────────────

function addSectionTitle(slide: PptxGenJS.Slide, title: string): void {
  slide.addText(title, {
    x: MARGIN,
    y: 0.3,
    w: CONTENT_W,
    h: 0.45,
    fontSize: 22,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })
  slide.addShape('rect', {
    x: MARGIN,
    y: 0.75,
    w: 1.2,
    h: 0.04,
    fill: { color: ORANGE },
  })
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Truncate text to a max length, breaking at the last space before the limit. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.lastIndexOf(' ', maxLen)
  return text.slice(0, cut > 0 ? cut : maxLen) + '...'
}

// ─── Diagnostic key labels ──────────────────────────────────────────

const DIAG_KEYS = ['mfg_process', 'material', 'tolerance', 'finish', 'batch_size'] as const
const DIAG_LABELS: Record<string, string> = {
  mfg_process: 'Process',
  material: 'Material',
  tolerance: 'Tolerance',
  finish: 'Finish',
  batch_size: 'Batch',
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * @description Generate a branded PowerPoint presentation from design report
 * data and trigger a browser download.
 */
export async function exportDesignReportAsPPTX(data: DesignReportData): Promise<void> {
  // INTENT: If AI narration is available, use the polished prose path
  if (data.aiContent) {
    return buildAiPptx(data)
  }

  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.author = 'ForgeOS'
  pres.subject = data.projectName
  pres.title = `${data.projectName} — Design Report`

  // Pre-fetch images in parallel
  const heroBase64Promise = data.heroImageUrl ? fetchImageAsBase64(data.heroImageUrl) : Promise.resolve(null)
  const moduleImagePromises = data.modules.map((m) =>
    m.imageUrl ? fetchImageAsBase64(m.imageUrl) : Promise.resolve(null),
  )
  const [heroBase64, ...moduleImages] = await Promise.all([heroBase64Promise, ...moduleImagePromises])

  // ── 1. Cover Slide ──
  const coverSlide = pres.addSlide()
  coverSlide.addShape('rect', {
    x: 0, y: 0, w: '100%', h: 0.04,
    fill: { color: ORANGE },
  })

  if (heroBase64) {
    coverSlide.addImage({
      data: heroBase64,
      x: 5.2, y: 1.2, w: 4.3, h: 3.2,
      rounding: true,
    })
  }

  coverSlide.addText('FRACTIONAL FORGE', {
    x: MARGIN, y: 0.5, w: 4.5, h: 0.35,
    fontSize: 12,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
    charSpacing: 3,
  })

  coverSlide.addText(data.projectName, {
    x: MARGIN, y: 1.0, w: 4.5, h: 0.9,
    fontSize: 28,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })

  const coverSubtitle = data.stage === 'concept' ? 'Concept Report'
    : data.stage === 'specify' ? 'Specification Report'
    : data.stage === 'source' ? 'Sourcing Report'
    : data.stage === 'assemble' ? 'Assembly Report'
    : data.stage === 'cad' ? 'CAD Report'
    : 'Engineering Design Report'

  coverSlide.addText(coverSubtitle, {
    x: MARGIN, y: 2.0, w: 4.5, h: 0.35,
    fontSize: 14,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
  })

  const dateFormatted = new Date(data.generatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  coverSlide.addText(dateFormatted, {
    x: MARGIN, y: 2.45, w: 4.5, h: 0.35,
    fontSize: 12,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
  })

  coverSlide.addText('Generated by ForgeOS', {
    x: MARGIN, y: FOOTER_Y, w: CONTENT_W, h: 0.25,
    fontSize: 9,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
  })

  // ── 2. Executive Summary ──
  if (data.productOverview) {
    const summarySlide = pres.addSlide()
    addSectionTitle(summarySlide, 'Executive Summary')

    const overviewText = truncate(data.productOverview, 600)

    summarySlide.addText(overviewText, {
      x: MARGIN, y: 1.0, w: CONTENT_W, h: 2.4,
      fontSize: 11,
      fontFace: 'Helvetica Neue',
      color: DARK_TEXT,
      lineSpacingMultiple: 1.4,
      valign: 'top',
    })

    // Design brief bullets
    if (data.designBrief) {
      const bullets: { text: string; options: object }[] = []
      if (data.designBrief.useCase) bullets.push({ text: `Use Case: ${data.designBrief.useCase}`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
      if (data.designBrief.targetProcess) bullets.push({ text: `Process: ${data.designBrief.targetProcess}`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
      if (data.designBrief.targetMaterial) bullets.push({ text: `Material: ${data.designBrief.targetMaterial}`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
      if (data.designBrief.toleranceTarget) bullets.push({ text: `Tolerance: ${data.designBrief.toleranceTarget}`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })

      if (bullets.length > 0) {
        summarySlide.addText(bullets, {
          x: MARGIN, y: 3.6, w: CONTENT_W, h: 1.8,
          valign: 'top',
        })
      }
    }
  }

  // ── 3. Research Highlights ──
  if (data.researchReport) {
    const researchSlide = pres.addSlide()
    addSectionTitle(researchSlide, 'Research Highlights')

    const preview = data.researchReport.slice(0, 400).replace(/[#*_]/g, '').trim()
    const truncatedPreview = preview.length < data.researchReport.length ? `${preview}...` : preview

    researchSlide.addText(truncatedPreview, {
      x: MARGIN, y: 1.0, w: CONTENT_W, h: 3.6,
      fontSize: 10,
      fontFace: 'Helvetica Neue',
      color: DARK_TEXT,
      lineSpacingMultiple: 1.4,
      valign: 'top',
    })

    if (data.researchReport.length > 400) {
      researchSlide.addText('Full research report available in the Word (.docx) export.', {
        x: MARGIN, y: FOOTER_Y, w: CONTENT_W, h: 0.25,
        fontSize: 9,
        fontFace: 'Helvetica Neue',
        color: MID_TEXT,
        italic: true,
      })
    }
  }

  // ── 4. Module Overview Table ──
  if (data.modules.length > 0) {
    const overviewSlide = pres.addSlide()
    addSectionTitle(overviewSlide, 'Module Overview')

    const headerRow: PptxGenJS.TableRow = [
      { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      { text: 'Purpose', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      { text: 'Lead', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
      { text: 'Mass', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
    ]

    const dataRows: PptxGenJS.TableRow[] = data.modules.slice(0, 12).map((m) => [
      { text: m.name, options: { fontSize: 9, color: DARK_TEXT } },
      { text: truncate(m.purpose, 50), options: { fontSize: 9, color: DARK_TEXT } },
      { text: m.leadWeeks != null ? `${m.leadWeeks}w` : '—', options: { fontSize: 9, color: DARK_TEXT, align: 'center' as const } },
      { text: m.estimatedMassKg != null ? `${m.estimatedMassKg} kg` : '—', options: { fontSize: 9, color: DARK_TEXT, align: 'center' as const } },
    ])

    overviewSlide.addTable([headerRow, ...dataRows], {
      x: MARGIN, y: 1.0, w: CONTENT_W,
      colW: [2.5, 4.5, 1.0, 1.0],
      border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
      rowH: 0.35,
      fontFace: 'Helvetica Neue',
    })
  }

  // ── 5. Per-module slides (max 10) ──
  const modulesToShow = data.modules.slice(0, 10)
  for (let idx = 0; idx < modulesToShow.length; idx++) {
    const mod = modulesToShow[idx]
    const moduleSlide = pres.addSlide()

    const revSuffix = (mod.revisionNumber ?? 1) >= 2 ? ` (Rev ${mod.revisionNumber})` : ''
    moduleSlide.addText(`${idx + 1}. ${mod.name}${revSuffix}`, {
      x: MARGIN, y: 0.3, w: CONTENT_W, h: 0.45,
      fontSize: 18,
      fontFace: 'Helvetica Neue',
      bold: true,
      color: DARK_TEXT,
    })
    moduleSlide.addShape('rect', {
      x: MARGIN, y: 0.75, w: 1.2, h: 0.04,
      fill: { color: ORANGE },
    })

    // Blueprint image (left side)
    const imgBase64 = moduleImages[idx] ?? null
    const hasImage = !!imgBase64
    if (imgBase64) {
      moduleSlide.addImage({
        data: imgBase64,
        x: MARGIN, y: 1.0, w: 4.0, h: 2.8,
        rounding: true,
      })
    }

    // Text content (right side if image, full width otherwise)
    const textX = hasImage ? 4.8 : MARGIN
    const textW = hasImage ? 4.7 : CONTENT_W

    moduleSlide.addText(truncate(mod.purpose, 200), {
      x: textX, y: 1.0, w: textW, h: 1.0,
      fontSize: 10,
      fontFace: 'Helvetica Neue',
      color: DARK_TEXT,
      lineSpacingMultiple: 1.3,
      valign: 'top',
    })

    // Key parts as bullets
    if (mod.keyParts && mod.keyParts.length > 0) {
      const partBullets = mod.keyParts.slice(0, 5).map((p) => ({
        text: truncate(p, 80),
        options: {
          fontSize: 9,
          fontFace: 'Helvetica Neue',
          color: DARK_TEXT,
          bullet: { type: 'bullet' as const },
          paraSpaceBefore: 3,
        },
      }))
      moduleSlide.addText(partBullets, {
        x: textX, y: 2.1, w: textW, h: 2.0,
        valign: 'top',
      })
    }

    // Quick specs at bottom
    const specParts: string[] = []
    if (mod.leadWeeks != null) specParts.push(`Lead: ${mod.leadWeeks}w`)
    if (mod.estimatedMassKg != null) specParts.push(`Mass: ${mod.estimatedMassKg} kg`)
    if (specParts.length > 0) {
      moduleSlide.addText(specParts.join('  |  '), {
        x: MARGIN, y: FOOTER_Y, w: CONTENT_W, h: 0.25,
        fontSize: 9,
        fontFace: 'Helvetica Neue',
        color: MID_TEXT,
      })
    }
  }

  // ── 6. Specs slide ──
  const diagModuleIds = Object.keys(data.diagnosticAnswers)
  if (diagModuleIds.length > 0) {
    const specsSlide = pres.addSlide()
    addSectionTitle(specsSlide, 'Specifications')

    const specHeader: PptxGenJS.TableRow = [
      { text: 'Module', options: { bold: true, fontSize: 8, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      ...DIAG_KEYS.map((k) => ({
        text: DIAG_LABELS[k],
        options: { bold: true, fontSize: 8, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' as const },
      })),
    ]

    const specDataRows: PptxGenJS.TableRow[] = diagModuleIds.slice(0, 12).map((moduleId) => {
      const mod = data.modules.find((m) => m.id === moduleId)
      const answers = data.diagnosticAnswers[moduleId]
      return [
        { text: mod?.name ?? moduleId, options: { fontSize: 8, color: DARK_TEXT } },
        ...DIAG_KEYS.map((k) => ({
          text: answers?.[k] ?? '—',
          options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const },
        })),
      ]
    })

    specsSlide.addTable([specHeader, ...specDataRows], {
      x: MARGIN, y: 1.0, w: CONTENT_W,
      colW: [2.5, 1.3, 1.3, 1.3, 1.3, 1.3],
      border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
      rowH: 0.3,
      fontFace: 'Helvetica Neue',
    })
  }

  // ── 7. Costs slide ──
  const costModuleIds = Object.keys(data.aiCostEstimates)
  if (costModuleIds.length > 0) {
    const costsSlide = pres.addSlide()
    addSectionTitle(costsSlide, 'Cost Estimates')

    const costHeader: PptxGenJS.TableRow = [
      { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      { text: 'Total / Unit', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
      { text: 'Confidence', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
    ]

    const costDataRows: PptxGenJS.TableRow[] = costModuleIds.slice(0, 12).map((moduleId) => {
      const mod = data.modules.find((m) => m.id === moduleId)
      const est = data.aiCostEstimates[moduleId]
      return [
        { text: mod?.name ?? moduleId, options: { fontSize: 9, color: DARK_TEXT } },
        { text: est ? `£${est.totalPerUnit.toFixed(2)}` : '—', options: { fontSize: 9, color: DARK_TEXT, align: 'center' as const } },
        { text: est?.confidence ?? '—', options: { fontSize: 9, color: DARK_TEXT, align: 'center' as const } },
      ]
    })

    costsSlide.addTable([costHeader, ...costDataRows], {
      x: MARGIN, y: 1.0, w: CONTENT_W,
      colW: [4.0, 2.5, 2.5],
      border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
      rowH: 0.35,
      fontFace: 'Helvetica Neue',
    })
  }

  // ── 8. Stage-specific slides ──

  // Specify: Reviews Summary
  if (data.stage === 'specify' && data.moduleReviews) {
    const reviewModuleIds = Object.keys(data.moduleReviews)
    if (reviewModuleIds.length > 0) {
      const reviewSlide = pres.addSlide()
      addSectionTitle(reviewSlide, 'Specialist Reviews')

      const reviewHeader: PptxGenJS.TableRow = [
        { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Specialist', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Verdict', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
        { text: 'Summary', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      ]

      const reviewDataRows: PptxGenJS.TableRow[] = []
      for (const moduleId of reviewModuleIds.slice(0, 10)) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const reviews = data.moduleReviews[moduleId]
        if (!mod || !reviews) continue
        for (const review of reviews.slice(0, 2)) {
          reviewDataRows.push([
            { text: mod.name, options: { fontSize: 8, color: DARK_TEXT } },
            { text: review.specialistName, options: { fontSize: 8, color: DARK_TEXT } },
            { text: review.verdict.toUpperCase(), options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const } },
            { text: truncate(review.summary, 60), options: { fontSize: 8, color: DARK_TEXT } },
          ])
        }
      }

      if (reviewDataRows.length > 0) {
        reviewSlide.addTable([reviewHeader, ...reviewDataRows], {
          x: MARGIN, y: 1.0, w: CONTENT_W,
          colW: [2.0, 2.0, 1.0, 4.0],
          border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
          rowH: 0.3,
          fontFace: 'Helvetica Neue',
        })
      }
    }
  }

  // Source: Classification Summary
  if (data.stage === 'source' && data.classifiedParts && data.classifiedParts.length > 0) {
    const clsSlide = pres.addSlide()
    addSectionTitle(clsSlide, 'Part Classification')

    const clsHeader: PptxGenJS.TableRow = [
      { text: 'Part', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      { text: 'Type', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
      { text: 'Reasons', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
    ]

    const clsDataRows: PptxGenJS.TableRow[] = data.classifiedParts.slice(0, 12).map((part) => [
      { text: truncate(part.partName, 30), options: { fontSize: 8, color: DARK_TEXT } },
      { text: truncate(part.moduleName, 20), options: { fontSize: 8, color: DARK_TEXT } },
      { text: part.type.toUpperCase(), options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const } },
      { text: truncate(part.reasons.join('; '), 50), options: { fontSize: 8, color: DARK_TEXT } },
    ])

    clsSlide.addTable([clsHeader, ...clsDataRows], {
      x: MARGIN, y: 1.0, w: CONTENT_W,
      colW: [2.5, 2.0, 1.0, 3.5],
      border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
      rowH: 0.3,
      fontFace: 'Helvetica Neue',
    })
  }

  // Source: Top Suppliers
  if (data.stage === 'source' && data.supplierMatches) {
    const matchModuleIds = Object.keys(data.supplierMatches)
    if (matchModuleIds.length > 0) {
      const supplierSlide = pres.addSlide()
      addSectionTitle(supplierSlide, 'Top Suppliers')

      const supHeader: PptxGenJS.TableRow = [
        { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Supplier', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Score', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
        { text: 'Reasons', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      ]

      const supDataRows: PptxGenJS.TableRow[] = []
      for (const moduleId of matchModuleIds.slice(0, 8)) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const matches = data.supplierMatches[moduleId]
        if (!mod || !matches) continue
        for (const match of matches.slice(0, 2)) {
          supDataRows.push([
            { text: mod.name, options: { fontSize: 8, color: DARK_TEXT } },
            { text: match.providerName, options: { fontSize: 8, color: DARK_TEXT } },
            { text: String(match.matchScore), options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const } },
            { text: truncate(match.matchReasons.join(', '), 40), options: { fontSize: 8, color: DARK_TEXT } },
          ])
        }
      }

      if (supDataRows.length > 0) {
        supplierSlide.addTable([supHeader, ...supDataRows], {
          x: MARGIN, y: 1.0, w: CONTENT_W,
          colW: [2.0, 2.5, 1.0, 3.5],
          border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
          rowH: 0.3,
          fontFace: 'Helvetica Neue',
        })
      }
    }
  }

  // Assemble: Assembly & Logistics
  if (data.stage === 'assemble') {
    const hasContent = (data.assemblyPartners && data.assemblyPartners.length > 0) || data.brandingNotes || data.shippingNotes
    if (hasContent) {
      const assembleSlide = pres.addSlide()
      addSectionTitle(assembleSlide, 'Assembly & Logistics')

      const bullets: { text: string; options: object }[] = []

      if (data.assemblyPartners && data.assemblyPartners.length > 0) {
        for (const partner of data.assemblyPartners.slice(0, 3)) {
          bullets.push({
            text: `${partner.name} (Score: ${partner.score})`,
            options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 },
          })
        }
      }

      if (data.brandingNotes) {
        bullets.push({
          text: `Branding: ${truncate(data.brandingNotes, 80)}`,
          options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 },
        })
      }

      if (data.shippingNotes) {
        bullets.push({
          text: `Shipping: ${truncate(data.shippingNotes, 80)}`,
          options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 },
        })
      }

      if (bullets.length > 0) {
        assembleSlide.addText(bullets, {
          x: MARGIN, y: 1.0, w: CONTENT_W, h: 3.8,
          valign: 'top',
        })
      }
    }
  }

  // CAD: Output Summary
  if (data.stage === 'cad' && data.unifiedCadResult?.success) {
    const cadSlide = pres.addSlide()
    addSectionTitle(cadSlide, 'CAD Output')

    const result = data.unifiedCadResult
    const bullets: { text: string; options: object }[] = []

    if (result.stepUrl) bullets.push({ text: `STEP file generated`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
    if (result.stlUrl) bullets.push({ text: `STL file generated`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
    if (result.massGrams != null) bullets.push({ text: `Mass: ${result.massGrams.toFixed(1)} g`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
    if (result.volumeMm3 != null) bullets.push({ text: `Volume: ${result.volumeMm3.toFixed(1)} mm³`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
    if (result.bbox) bullets.push({ text: `Bounding Box: ${result.bbox.xLen.toFixed(1)} × ${result.bbox.yLen.toFixed(1)} × ${result.bbox.zLen.toFixed(1)} mm`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })
    if (result.modelUsed) bullets.push({ text: `Model: ${result.modelUsed}`, options: { fontSize: 10, fontFace: 'Helvetica Neue', color: MID_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 4 } })

    if (bullets.length > 0) {
      cadSlide.addText(bullets, {
        x: MARGIN, y: 1.0, w: CONTENT_W, h: 3.8,
        valign: 'top',
      })
    }
  }

  // ── Download ──
  await downloadPptx(pres, data)
}

// ─── Download Helper ─────────────────────────────────────────────────

async function downloadPptx(pres: PptxGenJS, data: DesignReportData): Promise<void> {
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '-')
  const stageLabel = data.stage ? `-${data.stage.charAt(0).toUpperCase() + data.stage.slice(1)}` : ''
  const dateStr = new Date(data.generatedAt).toISOString().split('T')[0]

  await pres.writeFile({ fileName: `${safeName}${stageLabel}-Report-${dateStr}.pptx` })
}

// ─── AI Prose Presentation Builder ───────────────────────────────────

async function buildAiPptx(data: DesignReportData): Promise<void> {
  const aiContent = data.aiContent!
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.author = 'ForgeOS'
  pres.subject = data.projectName
  pres.title = `${data.projectName} — Design Report`

  // Pre-fetch images in parallel
  const heroBase64Promise = data.heroImageUrl ? fetchImageAsBase64(data.heroImageUrl) : Promise.resolve(null)
  const moduleImagePromises = data.modules.map((m) =>
    m.imageUrl ? fetchImageAsBase64(m.imageUrl) : Promise.resolve(null),
  )
  const [heroBase64, ...moduleImages] = await Promise.all([heroBase64Promise, ...moduleImagePromises])

  // ── Cover Slide (same as legacy) ──
  const coverSlide = pres.addSlide()
  coverSlide.addShape('rect', {
    x: 0, y: 0, w: '100%', h: 0.04,
    fill: { color: ORANGE },
  })

  if (heroBase64) {
    coverSlide.addImage({
      data: heroBase64,
      x: 5.2, y: 1.2, w: 4.3, h: 3.2,
      rounding: true,
    })
  }

  coverSlide.addText('FRACTIONAL FORGE', {
    x: MARGIN, y: 0.5, w: 4.5, h: 0.35,
    fontSize: 12,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
    charSpacing: 3,
  })

  coverSlide.addText(data.projectName, {
    x: MARGIN, y: 1.0, w: 4.5, h: 0.9,
    fontSize: 28,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })

  const coverSubtitle = data.stage === 'concept' ? 'Concept Report'
    : data.stage === 'specify' ? 'Specification Report'
    : data.stage === 'source' ? 'Sourcing Report'
    : data.stage === 'assemble' ? 'Assembly Report'
    : data.stage === 'cad' ? 'CAD Report'
    : 'Engineering Design Report'

  coverSlide.addText(coverSubtitle, {
    x: MARGIN, y: 2.0, w: 4.5, h: 0.35,
    fontSize: 14,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
  })

  const dateFormatted = new Date(data.generatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  coverSlide.addText(dateFormatted, {
    x: MARGIN, y: 2.45, w: 4.5, h: 0.35,
    fontSize: 12,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
  })

  coverSlide.addText('Generated by ForgeOS', {
    x: MARGIN, y: FOOTER_Y, w: CONTENT_W, h: 0.25,
    fontSize: 9,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
  })

  // ── Executive Summary Slide ──
  if (aiContent.executiveSummary) {
    const summarySlide = pres.addSlide()
    addSectionTitle(summarySlide, 'Executive Summary')

    summarySlide.addText(truncate(aiContent.executiveSummary, 800), {
      x: MARGIN, y: 1.0, w: CONTENT_W, h: 4.0,
      fontSize: 11,
      fontFace: 'Helvetica Neue',
      color: DARK_TEXT,
      lineSpacingMultiple: 1.4,
      valign: 'top',
    })
  }

  // ── AI Section Slides ──
  for (const section of aiContent.sections) {
    // Skip executive-summary as it has its own slide above
    if (section.sectionType === 'executive-summary') continue

    const slide = pres.addSlide()
    addSectionTitle(slide, section.title)

    // Check if this section has a module image to show
    const modIdx = section.moduleId
      ? data.modules.findIndex((m) => m.id === section.moduleId)
      : -1
    const imgBase64 = modIdx >= 0 ? moduleImages[modIdx] : null
    const hasImage = section.includeImage && !!imgBase64

    if (hasImage && imgBase64) {
      slide.addImage({
        data: imgBase64,
        x: MARGIN, y: 1.0, w: 4.0, h: 2.8,
        rounding: true,
      })
    }

    // Prose text
    const textX = hasImage ? 4.8 : MARGIN
    const textW = hasImage ? 4.7 : CONTENT_W
    const textH = hasImage ? 2.8 : 3.8

    if (section.prose) {
      // Strip markdown formatting for slides (keep it readable)
      const cleanProse = section.prose.replace(/[#*_]/g, '').trim()
      slide.addText(truncate(cleanProse, hasImage ? 400 : 700), {
        x: textX, y: 1.0, w: textW, h: textH,
        fontSize: 10,
        fontFace: 'Helvetica Neue',
        color: DARK_TEXT,
        lineSpacingMultiple: 1.3,
        valign: 'top',
      })
    }

    // Key points as bullets (below prose or image)
    if (section.keyPoints.length > 0 && !hasImage) {
      const bullets = section.keyPoints.slice(0, 4).map((p) => ({
        text: truncate(p, 80),
        options: {
          fontSize: 9,
          fontFace: 'Helvetica Neue',
          color: DARK_TEXT,
          bullet: { type: 'bullet' as const },
          paraSpaceBefore: 3,
        },
      }))
      slide.addText(bullets, {
        x: MARGIN, y: 4.2, w: CONTENT_W, h: 1.0,
        valign: 'top',
      })
    }

    // Table slide if flagged — buildTableSlide adds the slide directly to pres
    if (section.includeTable) {
      buildTableSlide(pres, section, data)
    }
  }

  await downloadPptx(pres, data)
}

/** Create a data table slide for the given section type. */
function buildTableSlide(
  pres: PptxGenJS,
  section: AiReportSection,
  data: DesignReportData,
): PptxGenJS.Slide | null {
  switch (section.sectionType) {
    case 'specifications': {
      const diagModuleIds = Object.keys(data.diagnosticAnswers)
      if (diagModuleIds.length === 0) return null

      const slide = pres.addSlide()
      addSectionTitle(slide, 'Specifications')

      const specHeader: PptxGenJS.TableRow = [
        { text: 'Module', options: { bold: true, fontSize: 8, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        ...DIAG_KEYS.map((k) => ({
          text: DIAG_LABELS[k],
          options: { bold: true, fontSize: 8, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' as const },
        })),
      ]

      const specDataRows: PptxGenJS.TableRow[] = diagModuleIds.slice(0, 12).map((moduleId) => {
        const mod = data.modules.find((m) => m.id === moduleId)
        const answers = data.diagnosticAnswers[moduleId]
        return [
          { text: mod?.name ?? moduleId, options: { fontSize: 8, color: DARK_TEXT } },
          ...DIAG_KEYS.map((k) => ({
            text: answers?.[k] ?? '—',
            options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const },
          })),
        ]
      })

      slide.addTable([specHeader, ...specDataRows], {
        x: MARGIN, y: 1.0, w: CONTENT_W,
        colW: [2.5, 1.3, 1.3, 1.3, 1.3, 1.3],
        border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
        rowH: 0.3,
        fontFace: 'Helvetica Neue',
      })

      return slide
    }

    case 'cost-analysis': {
      const costModuleIds = Object.keys(data.aiCostEstimates)
      if (costModuleIds.length === 0) return null

      const slide = pres.addSlide()
      addSectionTitle(slide, 'Cost Estimates')

      const costHeader: PptxGenJS.TableRow = [
        { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Total / Unit', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
        { text: 'Confidence', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
      ]

      const costDataRows: PptxGenJS.TableRow[] = costModuleIds.slice(0, 12).map((moduleId) => {
        const mod = data.modules.find((m) => m.id === moduleId)
        const est = data.aiCostEstimates[moduleId]
        return [
          { text: mod?.name ?? moduleId, options: { fontSize: 9, color: DARK_TEXT } },
          { text: est ? `£${est.totalPerUnit.toFixed(2)}` : '—', options: { fontSize: 9, color: DARK_TEXT, align: 'center' as const } },
          { text: est?.confidence ?? '—', options: { fontSize: 9, color: DARK_TEXT, align: 'center' as const } },
        ]
      })

      slide.addTable([costHeader, ...costDataRows], {
        x: MARGIN, y: 1.0, w: CONTENT_W,
        colW: [4.0, 2.5, 2.5],
        border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
        rowH: 0.35,
        fontFace: 'Helvetica Neue',
      })

      return slide
    }

    case 'specialist-reviews': {
      if (!data.moduleReviews) return null
      const reviewModuleIds = Object.keys(data.moduleReviews)
      if (reviewModuleIds.length === 0) return null

      const slide = pres.addSlide()
      addSectionTitle(slide, 'Specialist Reviews')

      const reviewHeader: PptxGenJS.TableRow = [
        { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Specialist', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Verdict', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
        { text: 'Summary', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      ]

      const reviewDataRows: PptxGenJS.TableRow[] = []
      for (const moduleId of reviewModuleIds.slice(0, 10)) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const reviews = data.moduleReviews[moduleId]
        if (!mod || !reviews) continue
        for (const review of reviews.slice(0, 2)) {
          reviewDataRows.push([
            { text: mod.name, options: { fontSize: 8, color: DARK_TEXT } },
            { text: review.specialistName, options: { fontSize: 8, color: DARK_TEXT } },
            { text: review.verdict.toUpperCase(), options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const } },
            { text: truncate(review.summary, 60), options: { fontSize: 8, color: DARK_TEXT } },
          ])
        }
      }

      if (reviewDataRows.length > 0) {
        slide.addTable([reviewHeader, ...reviewDataRows], {
          x: MARGIN, y: 1.0, w: CONTENT_W,
          colW: [2.0, 2.0, 1.0, 4.0],
          border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
          rowH: 0.3,
          fontFace: 'Helvetica Neue',
        })
      }

      return slide
    }

    case 'part-classification': {
      if (!data.classifiedParts || data.classifiedParts.length === 0) return null

      const slide = pres.addSlide()
      addSectionTitle(slide, 'Part Classification')

      const clsHeader: PptxGenJS.TableRow = [
        { text: 'Part', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Module', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Type', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
        { text: 'Reasons', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      ]

      const clsDataRows: PptxGenJS.TableRow[] = data.classifiedParts.slice(0, 12).map((part) => [
        { text: truncate(part.partName, 30), options: { fontSize: 8, color: DARK_TEXT } },
        { text: truncate(part.moduleName, 20), options: { fontSize: 8, color: DARK_TEXT } },
        { text: part.type.toUpperCase(), options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const } },
        { text: truncate(part.reasons.join('; '), 50), options: { fontSize: 8, color: DARK_TEXT } },
      ])

      slide.addTable([clsHeader, ...clsDataRows], {
        x: MARGIN, y: 1.0, w: CONTENT_W,
        colW: [2.5, 2.0, 1.0, 3.5],
        border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
        rowH: 0.3,
        fontFace: 'Helvetica Neue',
      })

      return slide
    }

    default:
      return null
  }
}
