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

import type { DesignReportData, AiReportSection, SlideData } from '@/lib/cad-lab/design-report-types'
import { AUDIENCE_META, DEFAULT_AUDIENCE } from '@/lib/cad-lab/audience'
import type { ReportAudience } from '@/lib/cad-lab/audience'

// ─── Brand Constants ────────────────────────────────────────────────

const ORANGE = 'FF4500'
const TEAL = '14B8A6'
const DARK_TEXT = '1E293B'
const MID_TEXT = '64748B'
const LIGHT_BG = 'F8FAFC'
const WHITE = 'FFFFFF'
const CARD_BORDER = 'E2E8F0'
const SUCCESS_BG = 'ECFDF5'

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

/** Fetch + resize a remote image via the server action (sharp lives server-side).
 *  Returns a `data:image/jpeg;base64,...` URI for pptxgenjs.
 *
 *  WHY: before this change, the pptx exporter fetched raw PNGs and embedded
 *  them at their native resolution — a single deck could ship 30+MB of
 *  unnecessary pixels. Routing through the resize server action gives Sharp
 *  compression (1600px, JPEG q85) while keeping the native binding
 *  server-side (sharp can't run in the browser bundle). */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const { resizeImageToDataUri } = await import('@/actions/image-resize-action')
    return await resizeImageToDataUri(url, { maxEdge: 1600, quality: 85 })
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

// ─── Shared Builders ────────────────────────────────────────────────

/** Build the branded cover slide — used by both legacy and AI paths.
 *  Audience-aware: editorial audiences (investor / marketing) get a larger
 *  serif title and an audience eyebrow in the orange brand colour; the
 *  engineer / supplier masthead stays sans-serif and tighter. */
function buildCoverSlide(pres: PptxGenJS, data: DesignReportData, heroBase64: string | null): void {
  const audience: ReportAudience = data.audience ?? DEFAULT_AUDIENCE
  const audienceMeta = AUDIENCE_META[audience]
  const editorial = audience === 'investor' || audience === 'marketing'

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

  // Audience eyebrow — replaces the generic "FRACTIONAL FORGE" banner so the
  // reader sees the edition label first (Investor edition / Press asset etc.).
  coverSlide.addText(audienceMeta.label.toUpperCase(), {
    x: MARGIN, y: 0.5, w: 4.5, h: 0.3,
    fontSize: 11,
    fontFace: 'Helvetica Neue',
    color: ORANGE,
    bold: true,
    charSpacing: 4,
  })

  coverSlide.addText('FRACTIONAL FORGE', {
    x: MARGIN, y: 0.78, w: 4.5, h: 0.28,
    fontSize: 9,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
    charSpacing: 3,
  })

  coverSlide.addText(data.projectName, {
    x: MARGIN, y: 1.15, w: 4.5, h: editorial ? 1.1 : 0.9,
    fontSize: editorial ? 36 : 28,
    fontFace: editorial ? 'Georgia' : 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })

  const coverSubtitle = data.stage === 'concept' ? 'Concept Report'
    : data.stage === 'specify' ? 'Specification Report'
    : data.stage === 'source' ? 'Sourcing Report'
    : data.stage === 'assemble' ? 'Assembly Report'
    : data.stage === 'cad' ? 'CAD Report'
    : data.stage === 'journey' ? 'Design Journey Report'
    : 'Engineering Design Report'

  // Title height varies by audience — push subtitle + date down for editorial
  // so the bigger Georgia title doesn't overlap.
  const subtitleY = editorial ? 2.35 : 2.1
  coverSlide.addText(coverSubtitle, {
    x: MARGIN, y: subtitleY, w: 4.5, h: 0.35,
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
    x: MARGIN, y: subtitleY + 0.45, w: 4.5, h: 0.35,
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
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * @description Generate a branded PowerPoint presentation from design report
 * data and trigger a browser download.
 */
export async function exportDesignReportAsPPTX(data: DesignReportData): Promise<Blob> {
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

  // ── 1. Cover Slide (shared helper) ──
  buildCoverSlide(pres, data, heroBase64)

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

  // ── 8. Engineering Intelligence ──
  if (data.engineeringIntelligence) {
    const ei = data.engineeringIntelligence

    const STD_SHOWN = 8
    const MAT_SHOWN = 8
    const PROC_SHOWN = 8
    const HALF_W = (CONTENT_W - 0.2) / 2 // Two-column with 0.2" gap
    const RIGHT_X = MARGIN + HALF_W + 0.2

    if (ei.standards.length > 0) {
      const stdSlide = pres.addSlide()
      addSectionTitle(stdSlide, 'Referenced Design Standards')
      const domainLabel = ei.industryDomain
        ? `${ei.industryDomain.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} domain — `
        : ''
      const truncNote = ei.standards.length > STD_SHOWN ? ` (showing ${STD_SHOWN} of ${ei.standards.length})` : ''
      stdSlide.addText(
        `${domainLabel}${ei.standards.length} standards applied${truncNote}`,
        { x: MARGIN, y: 0.8, w: CONTENT_W, h: 0.35, fontSize: 11, color: '666666', fontFace: 'Helvetica Neue' },
      )
      const stdTableRows = [
        [
          { text: 'Code', options: { bold: true, fontSize: 9, fill: { color: 'F5F5F5' } } },
          { text: 'Standard', options: { bold: true, fontSize: 9, fill: { color: 'F5F5F5' } } },
          { text: 'Issuing Body', options: { bold: true, fontSize: 9, fill: { color: 'F5F5F5' } } },
        ],
        ...ei.standards.slice(0, STD_SHOWN).map(s => [
          { text: s.code, options: { fontSize: 8 } },
          { text: s.name, options: { fontSize: 8 } },
          { text: s.issuingBody, options: { fontSize: 8 } },
        ]),
      ]
      stdSlide.addTable(stdTableRows, {
        x: MARGIN, y: 1.2, w: CONTENT_W, colW: [2.5, 4.5, 2],
        border: { type: 'solid', pt: 0.5, color: 'DDDDDD' },
        rowH: 0.3,
        fontFace: 'Helvetica Neue',
      })
    }

    if (ei.materials.length > 0 || ei.processes.length > 0) {
      const engSlide = pres.addSlide()
      addSectionTitle(engSlide, 'Material & Process Specifications')

      if (ei.materials.length > 0) {
        const matTrunc = ei.materials.length > MAT_SHOWN ? ` (${MAT_SHOWN} of ${ei.materials.length})` : ''
        engSlide.addText(`Verified Material Properties${matTrunc}`, {
          x: MARGIN, y: 0.8, w: HALF_W, h: 0.3, fontSize: 10, bold: true, color: '333333', fontFace: 'Helvetica Neue',
        })
        const matRows = [
          [
            { text: 'Material', options: { bold: true, fontSize: 8, fill: { color: 'F5F5F5' } } },
            { text: 'ρ (kg/m³)', options: { bold: true, fontSize: 8, fill: { color: 'F5F5F5' } } },
            { text: 'σy (MPa)', options: { bold: true, fontSize: 8, fill: { color: 'F5F5F5' } } },
            { text: '$/kg', options: { bold: true, fontSize: 8, fill: { color: 'F5F5F5' } } },
          ],
          ...ei.materials.slice(0, MAT_SHOWN).map(m => [
            { text: m.code, options: { fontSize: 7 } },
            { text: m.density != null ? String(m.density) : '—', options: { fontSize: 7 } },
            { text: m.yieldStrength != null ? String(m.yieldStrength) : '—', options: { fontSize: 7 } },
            { text: m.costPerKg != null ? `$${m.costPerKg.toFixed(2)}` : '—', options: { fontSize: 7 } },
          ]),
        ]
        engSlide.addTable(matRows, {
          x: MARGIN, y: 1.15, w: HALF_W, colW: [1.5, 1, 1, 0.9],
          border: { type: 'solid', pt: 0.5, color: 'DDDDDD' },
          rowH: 0.25,
          fontFace: 'Helvetica Neue',
        })
      }

      if (ei.processes.length > 0) {
        const procTrunc = ei.processes.length > PROC_SHOWN ? ` (${PROC_SHOWN} of ${ei.processes.length})` : ''
        engSlide.addText(`Process Constraints${procTrunc}`, {
          x: RIGHT_X, y: 0.8, w: HALF_W, h: 0.3, fontSize: 10, bold: true, color: '333333', fontFace: 'Helvetica Neue',
        })
        const procRows = [
          [
            { text: 'Process', options: { bold: true, fontSize: 8, fill: { color: 'F5F5F5' } } },
            { text: 'Tolerance', options: { bold: true, fontSize: 8, fill: { color: 'F5F5F5' } } },
            { text: 'Min Wall', options: { bold: true, fontSize: 8, fill: { color: 'F5F5F5' } } },
          ],
          ...ei.processes.slice(0, PROC_SHOWN).map(p => [
            { text: p.displayName, options: { fontSize: 7 } },
            { text: p.toleranceTypical != null ? `±${p.toleranceTypical}mm` : '—', options: { fontSize: 7 } },
            { text: p.minWall != null ? `${p.minWall}mm` : '—', options: { fontSize: 7 } },
          ]),
        ]
        engSlide.addTable(procRows, {
          x: RIGHT_X, y: 1.15, w: HALF_W, colW: [2, 1.2, 1.2],
          border: { type: 'solid', pt: 0.5, color: 'DDDDDD' },
          rowH: 0.25,
          fontFace: 'Helvetica Neue',
        })
      }
    }
  }

  // ── 9. Stage-specific slides ──

  // Specify: Reviews Summary
  if ((data.stage === 'specify' || data.stage === 'journey') && data.moduleReviews) {
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
  if ((data.stage === 'source' || data.stage === 'journey') && data.classifiedParts && data.classifiedParts.length > 0) {
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
  if ((data.stage === 'source' || data.stage === 'journey') && data.supplierMatches) {
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
  if (data.stage === 'assemble' || data.stage === 'journey') {
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
  if ((data.stage === 'cad' || data.stage === 'journey') && data.unifiedCadResult?.success) {
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
  return downloadPptx(pres, data)
}

// ─── Download Helper ─────────────────────────────────────────────────

async function downloadPptx(pres: PptxGenJS, data: DesignReportData): Promise<Blob> {
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '-')
  const stageLabel = data.stage ? `-${data.stage.charAt(0).toUpperCase() + data.stage.slice(1)}` : ''
  const dateStr = new Date(data.generatedAt).toISOString().split('T')[0]
  const filename = `${safeName}${stageLabel}-Report-${dateStr}.pptx`

  // INTENT: Use write() to get a blob instead of writeFile() which triggers
  // a direct download we can't capture. We trigger the download manually.
  // GOTCHA: PptxGenJS write() returns Promise<string | ArrayBuffer | Blob | Uint8Array>
  const output = await pres.write({ outputType: 'blob' })
  if (!(output instanceof Blob)) throw new Error('Expected Blob from PptxGenJS')
  const blob = output

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)

  return blob
}

// ─── AI Prose Presentation Builder ───────────────────────────────────

// ─── Slide Data Normalization ───────────────────────────────────────
// INTENT: Opus returns slideData with varying field names (e.g., "cards" vs "items",
// "heading" vs "label", "axisX" vs "xAxis"). Normalize to our canonical SlideData shape
// so builders can rely on consistent field names.

/* eslint-disable @typescript-eslint/no-explicit-any -- normalizes arbitrary LLM output with varying field names into canonical SlideData shape; any is unavoidable here */
function normalizeSlideData(layout: string, raw: any): SlideData | any {
  if (!raw || typeof raw !== 'object') return raw

  switch (layout) {
    case 'value-props': {
      // Opus may use "cards" instead of "items", "title" instead of "label"
      const items = raw.items ?? raw.cards ?? []
      return {
        ...raw,
        heading: raw.heading ?? raw.headline ?? '',
        items: items.map((c: any) => ({
          label: c.label ?? c.title ?? c.heading ?? '',
          description: c.description ?? c.detail ?? c.text ?? '',
        })),
      }
    }

    case 'comparison-two-col': {
      // Opus may use "leftColumn/rightColumn" objects instead of flat fields
      const left = raw.leftColumn ?? raw.left ?? {}
      const right = raw.rightColumn ?? raw.right ?? {}
      return {
        ...raw,
        leftTitle: raw.leftTitle ?? left.heading ?? left.title ?? 'Current',
        leftItems: raw.leftItems ?? left.details ?? left.items ?? left.bullets ?? [],
        rightTitle: raw.rightTitle ?? right.heading ?? right.title ?? 'Proposed',
        rightDescription: raw.rightDescription ?? right.description ?? right.summary ?? '',
        rightItems: raw.rightItems ?? right.details ?? right.items ?? right.bullets ?? [],
      }
    }

    case 'quadrant-chart': {
      // Opus may use "axisX/axisY" objects instead of flat strings, numeric x/y instead of low/mid/high
      const xObj = raw.axisX ?? {}
      const yObj = raw.axisY ?? {}
      return {
        ...raw,
        xAxis: raw.xAxis ?? (typeof xObj === 'string' ? xObj : xObj.label ?? 'X Axis'),
        yAxis: raw.yAxis ?? (typeof yObj === 'string' ? yObj : yObj.label ?? 'Y Axis'),
        items: (raw.items ?? []).map((item: any) => ({
          label: item.label ?? item.name ?? '',
          // Convert numeric 0-1 to low/mid/high
          x: typeof item.x === 'number' ? (item.x < 0.33 ? 'low' : item.x < 0.66 ? 'mid' : 'high') : (item.x ?? 'mid'),
          y: typeof item.y === 'number' ? (item.y < 0.33 ? 'low' : item.y < 0.66 ? 'mid' : 'high') : (item.y ?? 'mid'),
          color: item.color,
        })),
        insight: raw.insight ?? raw.summary ?? '',
      }
    }

    case 'technical-dossiers': {
      return {
        ...raw,
        heading: raw.heading ?? raw.title ?? '',
        cards: (raw.cards ?? []).map((c: any) => ({
          title: c.title ?? c.heading ?? c.name ?? '',
          profile: c.profile ?? c.description ?? c.summary ?? '',
          items: (c.items ?? []).map((item: any) => ({
            label: item.label ?? item.part ?? item.name ?? item.key ?? '',
            value: item.value ?? item.rationale ?? item.description ?? item.detail ?? '',
          })),
        })),
      }
    }

    case 'process-flow': {
      return {
        ...raw,
        heading: raw.heading ?? raw.title ?? '',
        subtitle: raw.subtitle ?? '',
        phases: (raw.phases ?? raw.steps ?? []).map((p: any, i: number) => ({
          name: p.name ?? p.label ?? `Phase ${i + 1}`,
          title: p.title ?? p.subtitle ?? p.heading ?? '',
          description: p.description ?? p.detail ?? p.text ?? '',
        })),
      }
    }

    case 'architecture-diagram': {
      return {
        ...raw,
        heading: raw.heading ?? raw.title ?? '',
        annotations: (raw.annotations ?? raw.layers ?? raw.components ?? []).map((a: any) => ({
          label: a.label ?? a.name ?? a.title ?? '',
          description: a.description ?? a.detail ?? a.text ?? '',
        })),
        specs: (raw.specs ?? raw.keySpecs ?? []).map((s: any) => ({
          label: s.label ?? s.name ?? s.key ?? '',
          value: s.value ?? s.detail ?? '',
        })),
      }
    }

    case 'data-table': {
      // Opus may return rows as flat arrays ["label", "v1", "v2"] instead of {label, values}
      const rows = (raw.rows ?? []).map((row: any) => {
        if (Array.isArray(row)) {
          return { label: String(row[0] ?? ''), values: row.slice(1).map(String) }
        }
        return {
          label: row.label ?? row.name ?? '',
          values: Array.isArray(row.values) ? row.values.map(String) : [],
        }
      })
      return { ...raw, heading: raw.heading ?? raw.title ?? '', rows, columns: raw.columns ?? [] }
    }

    case 'stat-callouts': {
      // Opus may use different stat shapes
      return {
        ...raw,
        stats: (raw.stats ?? []).map((s: any) => ({
          value: String(s.value ?? s.number ?? s.metric ?? ''),
          label: s.label ?? s.description ?? s.caption ?? '',
        })),
      }
    }

    default:
      return raw
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Rich Slide Layout Builders ──────────────────────────────────────
// INTENT: Each builder creates a visually distinct slide layout matching
// the quality of NotebookLM reports. Opus chooses the layout; these render it.

function buildValuePropsSlide(pres: PptxGenJS, section: AiReportSection, slideImage: string | null): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'value-props' }> | undefined
  if (!sd?.items?.length) return
  const slide = pres.addSlide()

  // Optional slide image on the left
  const hasImg = !!slideImage
  const cardX = hasImg ? 4.5 : MARGIN
  const cardW = hasImg ? 5.0 : CONTENT_W

  if (hasImg) {
    slide.addImage({ data: `data:image/png;base64,${slideImage}`, x: MARGIN, y: 0.5, w: 3.8, h: 4.5, rounding: true })
  }

  if (sd.heading) {
    slide.addText(sd.heading, { x: cardX, y: 0.3, w: cardW, h: 0.4, fontSize: 14, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
  }

  // Stacked value-prop cards
  const cardH = Math.min(1.2, 4.0 / sd.items.length)
  sd.items.slice(0, 4).forEach((item, i) => {
    const y = 0.9 + i * (cardH + 0.15)
    slide.addShape('roundRect', { x: cardX, y, w: cardW, h: cardH, fill: { color: WHITE }, line: { color: CARD_BORDER, width: 1 }, rectRadius: 0.08 })
    slide.addText(item.label, { x: cardX + 0.2, y: y + 0.1, w: cardW - 0.4, h: 0.3, fontSize: 13, fontFace: 'Helvetica Neue', bold: true, color: TEAL })
    slide.addText(truncate(item.description, 120), { x: cardX + 0.2, y: y + 0.4, w: cardW - 0.4, h: cardH - 0.55, fontSize: 10, fontFace: 'Helvetica Neue', color: MID_TEXT, lineSpacingMultiple: 1.2 })
  })
}

function buildComparisonTwoColSlide(pres: PptxGenJS, section: AiReportSection): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'comparison-two-col' }> | undefined
  if (!sd?.leftTitle || !sd?.rightTitle) return
  const slide = pres.addSlide()
  addSectionTitle(slide, section.title)

  const colW = 4.3
  const leftX = MARGIN
  const rightX = MARGIN + colW + 0.4

  // Left column — "old way" with red accent
  slide.addShape('roundRect', { x: leftX, y: 1.0, w: colW, h: 3.8, fill: { color: LIGHT_BG }, line: { color: 'FCA5A5', width: 1.5 }, rectRadius: 0.1 })
  slide.addText(sd.leftTitle, { x: leftX + 0.2, y: 1.1, w: colW - 0.4, h: 0.35, fontSize: 14, fontFace: 'Helvetica Neue', bold: true, color: 'DC2626' })
  const leftBullets = (sd.leftItems || []).slice(0, 5).map((item) => ({
    text: truncate(typeof item === 'string' ? item : String(item), 80),
    options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 6 },
  }))
  if (leftBullets.length > 0) {
    slide.addText(leftBullets, { x: leftX + 0.2, y: 1.55, w: colW - 0.4, h: 3.1, valign: 'top' as const })
  }

  // Right column — "new way" with teal accent
  slide.addShape('roundRect', { x: rightX, y: 1.0, w: colW, h: 3.8, fill: { color: SUCCESS_BG }, line: { color: TEAL, width: 1.5 }, rectRadius: 0.1 })
  slide.addText(sd.rightTitle, { x: rightX + 0.2, y: 1.1, w: colW - 0.4, h: 0.35, fontSize: 14, fontFace: 'Helvetica Neue', bold: true, color: TEAL })
  if (sd.rightDescription) {
    slide.addText(truncate(sd.rightDescription, 200), { x: rightX + 0.2, y: 1.55, w: colW - 0.4, h: 1.0, fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, lineSpacingMultiple: 1.3 })
  }
  if (sd.rightItems?.length) {
    const rightBullets = sd.rightItems.slice(0, 4).map((item) => ({
      text: truncate(typeof item === 'string' ? item : String(item), 80),
      options: { fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, bullet: { type: 'bullet' as const }, paraSpaceBefore: 6 },
    }))
    slide.addText(rightBullets, { x: rightX + 0.2, y: sd.rightDescription ? 2.6 : 1.55, w: colW - 0.4, h: 2.0, valign: 'top' as const })
  }

  // Arrow between columns
  slide.addText('→', { x: MARGIN + colW, y: 2.5, w: 0.4, h: 0.5, fontSize: 28, fontFace: 'Helvetica Neue', color: TEAL, align: 'center' })
}

function buildDataTableSlide(pres: PptxGenJS, section: AiReportSection): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'data-table' }> | undefined
  if (!sd?.rows?.length) return
  // INTENT: Infer column headers from the first row's value count if Opus omitted them
  const columns = sd.columns?.length
    ? sd.columns
    : sd.rows[0]?.values?.length
      ? sd.rows[0].values.map((_: unknown, i: number) => `Col ${i + 1}`)
      : []
  if (!columns.length) return
  const slide = pres.addSlide()
  addSectionTitle(slide, sd.heading || section.title)

  const labelW = 2.0
  const dataW = (CONTENT_W - labelW) / columns.length

  // Header row
  const header: PptxGenJS.TableRow = [
    { text: '', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
    ...columns.map((col) => ({
      text: col,
      options: { bold: true, fontSize: 9, color: WHITE, fill: { color: TEAL }, align: 'center' as const },
    })),
  ]

  // Data rows — alternating colors
  const rows: PptxGenJS.TableRow[] = sd.rows.slice(0, 10).map((row, i) => [
    { text: row.label, options: { bold: true, fontSize: 9, color: DARK_TEXT, fill: { color: i % 2 === 0 ? WHITE : LIGHT_BG } } },
    ...row.values.slice(0, columns.length).map((val) => ({
      text: val,
      options: { fontSize: 9, color: DARK_TEXT, fill: { color: i % 2 === 0 ? WHITE : LIGHT_BG }, align: 'center' as const },
    })),
  ])

  slide.addTable([header, ...rows], {
    x: MARGIN, y: 1.0, w: CONTENT_W,
    colW: [labelW, ...Array(columns.length).fill(dataW)],
    border: { type: 'solid', pt: 0.5, color: CARD_BORDER },
    rowH: 0.4,
    fontFace: 'Helvetica Neue',
  })

  if (sd.footnote) {
    slide.addText(sd.footnote, { x: MARGIN, y: FOOTER_Y, w: CONTENT_W, h: 0.3, fontSize: 8, fontFace: 'Helvetica Neue', italic: true, color: MID_TEXT })
  }
}

function buildProcessFlowSlide(pres: PptxGenJS, section: AiReportSection, slideImage: string | null): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'process-flow' }> | undefined
  if (!sd?.phases?.length) return
  const slide = pres.addSlide()
  addSectionTitle(slide, sd.heading || section.title)

  if (sd.subtitle) {
    slide.addText(sd.subtitle, { x: MARGIN, y: 0.85, w: CONTENT_W, h: 0.3, fontSize: 10, fontFace: 'Helvetica Neue', color: MID_TEXT })
  }

  // Chevron pipeline
  // INTENT: Cap at 4 phases — 5+ makes chevrons too narrow for readable text.
  // Extra phases are omitted (the prose section covers them narratively).
  const phaseCount = Math.min(sd.phases.length, 4)
  const chevronW = (CONTENT_W - (phaseCount - 1) * 0.15) / phaseCount
  const chevronY = 1.3
  const chevronH = 3.5

  sd.phases.slice(0, phaseCount).forEach((phase, i) => {
    const x = MARGIN + i * (chevronW + 0.15)
    // Chevron background
    slide.addShape('roundRect', { x, y: chevronY, w: chevronW, h: chevronH, fill: { color: WHITE }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 })
    // Phase label
    slide.addText(phase.name.toUpperCase(), { x: x + 0.1, y: chevronY + 0.1, w: chevronW - 0.2, h: 0.25, fontSize: 7, fontFace: 'Helvetica Neue', bold: true, color: MID_TEXT })
    // Title
    slide.addText(truncate(phase.title, 30), { x: x + 0.1, y: chevronY + 0.4, w: chevronW - 0.2, h: 0.35, fontSize: 10, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
    // Description
    slide.addText(truncate(phase.description, 80), { x: x + 0.1, y: chevronY + 0.8, w: chevronW - 0.2, h: chevronH - 1.0, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT, lineSpacingMultiple: 1.2, valign: 'top' as const })

    // Arrow between phases
    if (i < phaseCount - 1) {
      slide.addText('▸', { x: x + chevronW - 0.05, y: chevronY + chevronH / 2 - 0.15, w: 0.35, h: 0.3, fontSize: 16, color: TEAL, align: 'center' })
    }
  })
}

function buildStatCalloutsSlide(pres: PptxGenJS, section: AiReportSection, slideImage: string | null): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'stat-callouts' }> | undefined
  if (!sd?.stats?.length) return
  const slide = pres.addSlide()
  addSectionTitle(slide, section.title)

  // Optional before/after illustration
  if (slideImage) {
    slide.addImage({ data: `data:image/png;base64,${slideImage}`, x: MARGIN, y: 1.0, w: CONTENT_W, h: 2.5 })
  }

  // Stats bar
  const statsY = slideImage ? 3.8 : 2.0
  const visibleStats = sd.stats.slice(0, 4)
  const statW = CONTENT_W / visibleStats.length
  visibleStats.forEach((stat, i) => {
    const x = MARGIN + i * statW
    slide.addShape('roundRect', { x: x + 0.1, y: statsY, w: statW - 0.2, h: 1.2, fill: { color: WHITE }, line: { color: CARD_BORDER, width: 1 }, rectRadius: 0.08 })
    slide.addText(stat.value, { x: x + 0.1, y: statsY + 0.1, w: statW - 0.2, h: 0.55, fontSize: 22, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT, align: 'center' })
    slide.addText(truncate(stat.label, 50), { x: x + 0.15, y: statsY + 0.65, w: statW - 0.3, h: 0.45, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT, align: 'center', lineSpacingMultiple: 1.1 })
  })

  // Labels
  if (sd.leftLabel || sd.rightLabel) {
    if (sd.leftLabel) slide.addText(sd.leftLabel, { x: MARGIN, y: statsY - 0.3, w: CONTENT_W / 2, h: 0.25, fontSize: 9, fontFace: 'Helvetica Neue', bold: true, color: MID_TEXT })
    if (sd.rightLabel) slide.addText(sd.rightLabel, { x: MARGIN + CONTENT_W / 2, y: statsY - 0.3, w: CONTENT_W / 2, h: 0.25, fontSize: 9, fontFace: 'Helvetica Neue', bold: true, color: TEAL, align: 'right' as const })
  }
}

function buildTechnicalDossiersSlide(pres: PptxGenJS, section: AiReportSection): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'technical-dossiers' }> | undefined
  if (!sd?.cards?.length) return
  const slide = pres.addSlide()
  addSectionTitle(slide, sd.heading || section.title)

  const cardCount = Math.min(sd.cards.length, 3)
  const cardW = (CONTENT_W - (cardCount - 1) * 0.3) / cardCount
  const cardH = 3.6

  sd.cards.slice(0, 3).forEach((card, i) => {
    const x = MARGIN + i * (cardW + 0.3)
    const y = 1.0
    // Card background
    slide.addShape('roundRect', { x, y, w: cardW, h: cardH, fill: { color: WHITE }, line: { color: TEAL, width: 1.5 }, rectRadius: 0.1 })
    // Title
    slide.addText(card.title.toUpperCase(), { x: x + 0.15, y: y + 0.15, w: cardW - 0.3, h: 0.35, fontSize: 10, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
    // Profile text
    slide.addText(truncate(card.profile, 100), { x: x + 0.15, y: y + 0.55, w: cardW - 0.3, h: 0.6, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT, lineSpacingMultiple: 1.2 })
    // Key-value items
    ;(card.items ?? []).slice(0, 5).forEach((item, j) => {
      const itemY = y + 1.25 + j * 0.4
      slide.addText(item.label + ':', { x: x + 0.15, y: itemY, w: cardW - 0.3, h: 0.18, fontSize: 8, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
      slide.addText(truncate(item.value, 60), { x: x + 0.15, y: itemY + 0.18, w: cardW - 0.3, h: 0.18, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT })
    })
  })
}

function buildQuadrantChartSlide(pres: PptxGenJS, section: AiReportSection): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'quadrant-chart' }> | undefined
  if (!sd?.items?.length) return
  const slide = pres.addSlide()
  addSectionTitle(slide, sd.heading || section.title)

  // Chart area
  const chartX = MARGIN + 0.4
  const chartY = 1.2
  const chartW = 5.5
  const chartH = 3.8

  // Axes
  slide.addShape('line', { x: chartX, y: chartY, w: 0, h: chartH, line: { color: DARK_TEXT, width: 1.5 } })
  slide.addShape('line', { x: chartX, y: chartY + chartH, w: chartW, h: 0, line: { color: DARK_TEXT, width: 1.5 } })

  // Axis labels
  slide.addText(sd.yAxis, { x: MARGIN - 0.1, y: chartY + chartH / 2 - 0.5, w: 0.5, h: 1.0, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT, rotate: 270 })
  slide.addText(sd.xAxis, { x: chartX, y: chartY + chartH + 0.05, w: chartW, h: 0.3, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT, align: 'center' })

  // Plot items
  const posMap = { low: 0.2, mid: 0.5, high: 0.8 }
  sd.items.slice(0, 8).forEach((item) => {
    const ix = chartX + (posMap[item.x] ?? 0.5) * chartW
    const iy = chartY + (1 - (posMap[item.y] ?? 0.5)) * chartH
    const itemColor = item.color === 'orange' ? ORANGE : item.color === 'teal' ? TEAL : DARK_TEXT
    slide.addText(item.label, { x: ix - 0.5, y: iy - 0.15, w: 1.0, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', bold: true, color: itemColor, align: 'center' })
  })

  // Insight box
  if (sd.insight) {
    slide.addShape('roundRect', { x: 6.5, y: 1.2, w: 3.0, h: 3.8, fill: { color: WHITE }, line: { color: CARD_BORDER, width: 1 }, rectRadius: 0.08 })
    slide.addText(sd.insight, { x: 6.7, y: 1.4, w: 2.6, h: 3.4, fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, lineSpacingMultiple: 1.3, valign: 'top' as const })
  }
}

function buildArchitectureDiagramSlide(pres: PptxGenJS, section: AiReportSection, slideImage: string | null): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'architecture-diagram' }> | undefined
  if (!sd?.heading) return
  const slide = pres.addSlide()
  addSectionTitle(slide, sd.heading || section.title)

  // AI illustration + annotation layout depends on whether we have an image
  const annotations = sd.annotations?.slice(0, 4) ?? []

  if (slideImage) {
    // Image center, annotations left, specs right
    slide.addImage({ data: `data:image/png;base64,${slideImage}`, x: 2.2, y: 1.0, w: 4.0, h: 3.5, rounding: true })
    annotations.forEach((ann, i) => {
      const y = 1.0 + i * 0.95
      slide.addShape('roundRect', { x: MARGIN, y, w: 1.5, h: 0.8, fill: { color: WHITE }, line: { color: CARD_BORDER, width: 1 }, rectRadius: 0.06 })
      slide.addText(ann.label, { x: MARGIN + 0.1, y: y + 0.05, w: 1.3, h: 0.25, fontSize: 8, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
      slide.addText(truncate(ann.description, 50), { x: MARGIN + 0.1, y: y + 0.3, w: 1.3, h: 0.4, fontSize: 7, fontFace: 'Helvetica Neue', color: MID_TEXT, lineSpacingMultiple: 1.1 })
    })
  } else {
    // No image — annotations as a 2-column grid filling the content area
    const annW = (CONTENT_W - 0.3) / 2
    annotations.forEach((ann, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const ax = MARGIN + col * (annW + 0.3)
      const ay = 1.0 + row * 1.1
      slide.addShape('roundRect', { x: ax, y: ay, w: annW, h: 0.95, fill: { color: WHITE }, line: { color: CARD_BORDER, width: 1 }, rectRadius: 0.06 })
      slide.addText(ann.label, { x: ax + 0.15, y: ay + 0.08, w: annW - 0.3, h: 0.3, fontSize: 10, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
      slide.addText(truncate(ann.description, 100), { x: ax + 0.15, y: ay + 0.38, w: annW - 0.3, h: 0.5, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT, lineSpacingMultiple: 1.2 })
    })
  }

  // Key specs sidebar (right) — only when image present (otherwise annotations fill the space)
  if (slideImage && sd.specs?.length) {
    const specX = 6.8
    slide.addShape('roundRect', { x: specX, y: 1.0, w: 2.7, h: 3.5, fill: { color: LIGHT_BG }, line: { color: TEAL, width: 1 }, rectRadius: 0.08 })
    slide.addText('Key Specs', { x: specX + 0.15, y: 1.1, w: 2.4, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
    sd.specs.slice(0, 6).forEach((spec, i) => {
      const sy = 1.5 + i * 0.45
      slide.addText(spec.label + ':', { x: specX + 0.15, y: sy, w: 2.4, h: 0.2, fontSize: 8, fontFace: 'Helvetica Neue', bold: true, color: DARK_TEXT })
      slide.addText(spec.value, { x: specX + 0.15, y: sy + 0.2, w: 2.4, h: 0.2, fontSize: 8, fontFace: 'Helvetica Neue', color: MID_TEXT })
    })
  }
}

function buildModuleDetailSlide(pres: PptxGenJS, section: AiReportSection, slideImage: string | null, moduleImages: (string | null)[], modules: { id: string; name: string }[]): void {
  const sd = section.slideData as Extract<SlideData, { layout: 'module-detail' }> | undefined
  const slide = pres.addSlide()
  addSectionTitle(slide, sd?.moduleName || section.title)

  // Find the module image — try slideImage first, then module images
  const modIdx = section.moduleId ? modules.findIndex((m) => m.id === section.moduleId) : -1
  const imgBase64 = slideImage ?? (modIdx >= 0 ? moduleImages[modIdx] : null)

  if (imgBase64) {
    const imgData = imgBase64.startsWith('data:') ? imgBase64 : `data:image/png;base64,${imgBase64}`
    slide.addImage({ data: imgData, x: MARGIN, y: 1.0, w: 4.0, h: 2.8, rounding: true })
  }

  const textX = imgBase64 ? 4.8 : MARGIN
  const textW = imgBase64 ? 4.7 : CONTENT_W

  // Prose
  if (section.prose) {
    const cleanProse = section.prose.replace(/[#*_]/g, '').trim()
    slide.addText(truncate(cleanProse, imgBase64 ? 300 : 600), {
      x: textX, y: 1.0, w: textW, h: 1.5,
      fontSize: 10, fontFace: 'Helvetica Neue', color: DARK_TEXT, lineSpacingMultiple: 1.3, valign: 'top',
    })
  }

  // Specs from slideData
  if (sd?.specs?.length) {
    const specRows: PptxGenJS.TableRow[] = sd.specs.slice(0, 6).map((spec) => [
      { text: spec.label, options: { bold: true, fontSize: 9, color: DARK_TEXT } },
      { text: spec.value, options: { fontSize: 9, color: MID_TEXT } },
    ])
    slide.addTable(specRows, {
      x: textX, y: 2.7, w: textW,
      colW: [textW * 0.4, textW * 0.6],
      border: { type: 'solid', pt: 0.5, color: CARD_BORDER },
      rowH: 0.3,
      fontFace: 'Helvetica Neue',
    })
  }
}

/** Dispatch a section to the appropriate rich slide builder based on slideLayout */
function buildRichSlide(
  pres: PptxGenJS,
  section: AiReportSection,
  slideImage: string | null,
  moduleImages: (string | null)[],
  modules: { id: string; name: string }[],
): boolean {
  const layout = section.slideLayout
  if (!layout || layout === 'prose-section' || layout === 'hero-cover') return false

  // INTENT: Normalize slideData before passing to builders. Opus uses varying
  // field names (cards vs items, heading vs label, numeric vs enum positions).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- slideData may have non-canonical field names from Opus LLM output
  const normalized = normalizeSlideData(layout, section.slideData as any)
  const normalizedSection = { ...section, slideData: normalized }

  switch (layout) {
    case 'value-props':
      buildValuePropsSlide(pres, normalizedSection, slideImage)
      return true
    case 'comparison-two-col':
      buildComparisonTwoColSlide(pres, normalizedSection)
      return true
    case 'data-table':
      buildDataTableSlide(pres, normalizedSection)
      return true
    case 'process-flow':
      buildProcessFlowSlide(pres, normalizedSection, slideImage)
      return true
    case 'stat-callouts':
      buildStatCalloutsSlide(pres, normalizedSection, slideImage)
      return true
    case 'technical-dossiers':
      buildTechnicalDossiersSlide(pres, normalizedSection)
      return true
    case 'quadrant-chart':
      buildQuadrantChartSlide(pres, normalizedSection)
      return true
    case 'architecture-diagram':
      buildArchitectureDiagramSlide(pres, normalizedSection, slideImage)
      return true
    case 'module-detail':
      buildModuleDetailSlide(pres, normalizedSection, slideImage, moduleImages, modules)
      return true
    default:
      return false
  }
}

async function buildAiPptx(data: DesignReportData): Promise<Blob> {
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

  // ── Cover Slide (shared helper) ──
  buildCoverSlide(pres, data, heroBase64)

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

    // INTENT: Try the rich slide builder first. If the section has a slideLayout
    // and structured slideData, render a visually rich slide (comparison, process
    // flow, stat callouts, etc.). Fall back to the generic text layout if no
    // rich builder matches or if slideData is missing.
    const slideImage = section.slideImageBase64 ?? null
    const usedRichLayout = buildRichSlide(pres, section, slideImage, moduleImages, data.modules)

    if (!usedRichLayout) {
      const slide = pres.addSlide()
      addSectionTitle(slide, section.title)

      // Check if this section has a module image or per-slide AI illustration
      const modIdx = section.moduleId
        ? data.modules.findIndex((m) => m.id === section.moduleId)
        : -1
      const imgBase64 = slideImage ?? (modIdx >= 0 ? moduleImages[modIdx] : null)
      const hasImage = (section.includeImage || !!slideImage) && !!imgBase64

      if (hasImage && imgBase64) {
        const imgData = imgBase64.startsWith('data:') ? imgBase64 : `data:image/png;base64,${imgBase64}`
        slide.addImage({
          data: imgData,
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
      if (section.keyPoints?.length > 0 && !hasImage) {
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
    }

    // Table slide if flagged — buildTableSlide adds the slide directly to pres
    if (section.includeTable) {
      buildTableSlide(pres, section, data)
    }
  }

  return downloadPptx(pres, data)
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

    case 'supplier-analysis': {
      if (!data.supplierMatches) return null
      const matchModuleIds = Object.keys(data.supplierMatches)
      if (matchModuleIds.length === 0) return null

      const slide = pres.addSlide()
      addSectionTitle(slide, 'Top Suppliers')

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
        for (const match of matches.slice(0, 3)) {
          supDataRows.push([
            { text: mod.name, options: { fontSize: 8, color: DARK_TEXT } },
            { text: match.providerName, options: { fontSize: 8, color: DARK_TEXT } },
            { text: String(match.matchScore), options: { fontSize: 8, color: DARK_TEXT, align: 'center' as const } },
            { text: truncate(match.matchReasons.join(', '), 40), options: { fontSize: 8, color: DARK_TEXT } },
          ])
        }
      }

      if (supDataRows.length === 0) return null
      slide.addTable([supHeader, ...supDataRows], {
        x: MARGIN, y: 1.0, w: CONTENT_W,
        colW: [2.0, 2.5, 1.0, 3.5],
        border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
        rowH: 0.3,
        fontFace: 'Helvetica Neue',
      })

      return slide
    }

    case 'assembly-logistics': {
      if (!data.assemblyPartners || data.assemblyPartners.length === 0) return null

      const slide = pres.addSlide()
      addSectionTitle(slide, 'Assembly Partners')

      const asmHeader: PptxGenJS.TableRow = [
        { text: 'Partner', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Score', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG }, align: 'center' } },
        { text: 'Reasons', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      ]

      const asmDataRows: PptxGenJS.TableRow[] = data.assemblyPartners.slice(0, 10).map((p) => [
        { text: p.name, options: { fontSize: 9, color: DARK_TEXT } },
        { text: String(p.score), options: { fontSize: 9, color: DARK_TEXT, align: 'center' as const } },
        { text: truncate(p.reasons.join('; '), 50), options: { fontSize: 9, color: DARK_TEXT } },
      ])

      slide.addTable([asmHeader, ...asmDataRows], {
        x: MARGIN, y: 1.0, w: CONTENT_W,
        colW: [3.0, 1.5, 4.5],
        border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
        rowH: 0.35,
        fontFace: 'Helvetica Neue',
      })

      return slide
    }

    case 'cad-output': {
      if (!data.unifiedCadResult?.success) return null

      const r = data.unifiedCadResult
      const details: [string, string][] = []
      if (r.massGrams != null) details.push(['Mass', `${r.massGrams.toFixed(1)} g`])
      if (r.volumeMm3 != null) details.push(['Volume', `${r.volumeMm3.toFixed(1)} mm³`])
      if (r.bbox) details.push(['Bounding Box', `${r.bbox.xLen.toFixed(1)} × ${r.bbox.yLen.toFixed(1)} × ${r.bbox.zLen.toFixed(1)} mm`])
      if (r.modelUsed) details.push(['Model', r.modelUsed])
      if (details.length === 0) return null

      const slide = pres.addSlide()
      addSectionTitle(slide, 'CAD Output')

      const cadHeader: PptxGenJS.TableRow = [
        { text: 'Property', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
        { text: 'Value', options: { bold: true, fontSize: 9, color: MID_TEXT, fill: { color: LIGHT_BG } } },
      ]

      const cadDataRows: PptxGenJS.TableRow[] = details.map(([label, value]) => [
        { text: label, options: { fontSize: 9, color: DARK_TEXT } },
        { text: value, options: { fontSize: 9, color: DARK_TEXT } },
      ])

      slide.addTable([cadHeader, ...cadDataRows], {
        x: MARGIN, y: 1.0, w: CONTENT_W,
        colW: [3.0, 6.0],
        border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
        rowH: 0.35,
        fontFace: 'Helvetica Neue',
      })

      return slide
    }

    default:
      return null
  }
}
