/**
 * @file export-slide-deck-pptx.ts
 *
 * @description Client-side module that converts a StrategicBriefing into a
 * downloadable .pptx presentation. Each slide type gets a dedicated layout
 * builder that matches the on-screen rendering.
 *
 * DECISION: Separate file from export-pptx.ts because the data model is
 * fundamentally different (SlideContent[] vs SectionData[]). Sharing brand
 * constants keeps the visual language consistent.
 *
 * @related
 * - src/lib/reports/slide-deck-types.ts — Type definitions
 * - src/lib/reports/export-pptx.ts — Operational report PPTX export
 * - src/components/reports/SlideDeckRenderer.tsx — On-screen renderer
 */

import PptxGenJS from 'pptxgenjs'

import type {
  StrategicBriefing,
  SlideContent,
  TitleSlideContent,
  HeroInsightSlideContent,
  ArgumentSlideContent,
  ComparisonSlideContent,
  DataCalloutSlideContent,
  EvidenceSlideContent,
  SummarySlideContent,
  SectionDividerSlideContent,
} from './slide-deck-types'

// ========================
// Brand Constants
// ========================

const ORANGE = 'FF4500'
const DARK_TEXT = '1E293B'
const MID_TEXT = '64748B'
const WHITE = 'FFFFFF'
const MUTED_BG = 'F1F5F9'

// ========================
// Slide Builders
// ========================

function buildTitleSlide(
  pres: PptxGenJS,
  slide: TitleSlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()

  // Orange background
  s.background = { fill: ORANGE }

  if ((slide as any).imageUrl) {
    s.addImage({
      path: (slide as any).imageUrl,
      x: 0, y: 0, w: '100%', h: '100%',
      sizing: { type: 'cover', w: 10, h: 5.63 },
    })
  }

  // Company name
  s.addText(slide.companyName.toUpperCase(), {
    x: 0.8,
    y: 0.6,
    w: 10,
    h: 0.4,
    fontSize: 11,
    fontFace: 'Helvetica Neue',
    color: WHITE,
    charSpacing: 4,
    transparency: 30,
  })

  // Title
  s.addText(slide.headline, {
    x: 0.8,
    y: 1.6,
    w: 10,
    h: 1.8,
    fontSize: 40,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: WHITE,
    valign: 'top',
  })

  // Subtitle
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.8,
      y: 3.6,
      w: 9,
      h: 1.0,
      fontSize: 18,
      fontFace: 'Helvetica Neue',
      color: WHITE,
      transparency: 10,
    })
  }

  // Footer bar
  s.addShape('rect', {
    x: 0,
    y: 6.8,
    w: '100%',
    h: 0.7,
    fill: { color: DARK_TEXT },
  })

  s.addText(slide.date, {
    x: 0.8,
    y: 6.85,
    w: 5,
    h: 0.5,
    fontSize: 10,
    fontFace: 'Helvetica Neue',
    color: WHITE,
    transparency: 20,
  })

  s.addText('ForgeOS', {
    x: 9,
    y: 6.85,
    w: 3.5,
    h: 0.5,
    fontSize: 10,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: WHITE,
    transparency: 40,
    align: 'right',
  })

  return s
}

function buildHeroInsightSlide(
  pres: PptxGenJS,
  slide: HeroInsightSlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()

  if ((slide as any).imageUrl) {
    s.addImage({
      path: (slide as any).imageUrl,
      x: 6, y: 0.5, w: 3.5, h: 4.5,
      rounding: true,
    })
  }

  // Accent badge
  if (slide.accent) {
    s.addShape('roundRect', {
      x: 0.8,
      y: 1.0,
      w: 2.0,
      h: 0.4,
      rectRadius: 0.2,
      fill: { color: 'FFF0EB' },
    })
    s.addText(slide.accent.toUpperCase(), {
      x: 0.8,
      y: 1.0,
      w: 2.0,
      h: 0.4,
      fontSize: 9,
      fontFace: 'Helvetica Neue',
      bold: true,
      color: ORANGE,
      align: 'center',
      charSpacing: 2,
    })
  }

  // Headline
  s.addText(slide.headline, {
    x: 0.8,
    y: slide.accent ? 1.8 : 1.2,
    w: 10,
    h: 2.0,
    fontSize: 32,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
    valign: 'top',
  })

  // Body
  if (slide.body) {
    s.addText(slide.body, {
      x: 0.8,
      y: slide.accent ? 3.9 : 3.3,
      w: 9,
      h: 1.5,
      fontSize: 16,
      fontFace: 'Helvetica Neue',
      color: MID_TEXT,
      lineSpacingMultiple: 1.4,
      valign: 'top',
    })
  }

  // Accent bar
  s.addShape('rect', {
    x: 0.8,
    y: 5.6,
    w: 1.2,
    h: 0.06,
    fill: { color: ORANGE },
  })

  return s
}

function buildArgumentSlide(
  pres: PptxGenJS,
  slide: ArgumentSlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()

  // Headline
  s.addText(slide.headline, {
    x: 0.8,
    y: 0.6,
    w: 10,
    h: 0.8,
    fontSize: 24,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })

  // Body
  let yPos = 1.6
  if (slide.body) {
    s.addText(slide.body, {
      x: 0.8,
      y: yPos,
      w: 10,
      h: 0.8,
      fontSize: 14,
      fontFace: 'Helvetica Neue',
      color: MID_TEXT,
      lineSpacingMultiple: 1.4,
    })
    yPos += 1.0
  }

  // Supporting points
  slide.supportingPoints.forEach((point, i) => {
    // Numbered circle
    s.addShape('roundRect', {
      x: 0.8,
      y: yPos + i * 0.9,
      w: 0.45,
      h: 0.45,
      rectRadius: 0.1,
      fill: { color: 'FFF0EB' },
    })
    s.addText('✓', {
      x: 0.8,
      y: yPos + i * 0.9,
      w: 0.45,
      h: 0.45,
      fontSize: 12,
      fontFace: 'Helvetica Neue',
      color: ORANGE,
      align: 'center',
      valign: 'middle',
    })

    // Point text
    s.addText(point, {
      x: 1.5,
      y: yPos + i * 0.9,
      w: 10,
      h: 0.45,
      fontSize: 14,
      fontFace: 'Helvetica Neue',
      color: DARK_TEXT,
      valign: 'middle',
    })
  })

  return s
}

function buildComparisonSlide(
  pres: PptxGenJS,
  slide: ComparisonSlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()

  // Headline
  s.addText(slide.headline, {
    x: 0.8,
    y: 0.5,
    w: 10,
    h: 0.8,
    fontSize: 24,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })

  // Column headers
  s.addText(slide.leftLabel.toUpperCase(), {
    x: 0.8,
    y: 1.5,
    w: 5.2,
    h: 0.4,
    fontSize: 10,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: MID_TEXT,
    charSpacing: 2,
  })
  s.addText(slide.rightLabel.toUpperCase(), {
    x: 6.3,
    y: 1.5,
    w: 5.2,
    h: 0.4,
    fontSize: 10,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: ORANGE,
    charSpacing: 2,
  })

  // Rows
  slide.comparisonPairs.forEach((pair, i) => {
    const rowY = 2.1 + i * 0.9
    const bgColor = i % 2 === 0 ? MUTED_BG : WHITE

    s.addShape('rect', {
      x: 0.5,
      y: rowY,
      w: 11.5,
      h: 0.75,
      rectRadius: 0.1,
      fill: { color: bgColor },
    })

    s.addText(pair.left, {
      x: 0.8,
      y: rowY,
      w: 5.2,
      h: 0.75,
      fontSize: 13,
      fontFace: 'Helvetica Neue',
      color: MID_TEXT,
      valign: 'middle',
    })

    s.addText(pair.right, {
      x: 6.3,
      y: rowY,
      w: 5.2,
      h: 0.75,
      fontSize: 13,
      fontFace: 'Helvetica Neue',
      bold: true,
      color: DARK_TEXT,
      valign: 'middle',
    })
  })

  return s
}

function buildDataCalloutSlide(
  pres: PptxGenJS,
  slide: DataCalloutSlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()

  // Label
  s.addText(slide.label.toUpperCase(), {
    x: 0,
    y: 1.5,
    w: '100%',
    h: 0.4,
    fontSize: 11,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
    charSpacing: 3,
    align: 'center',
  })

  // Value
  s.addText(slide.value, {
    x: 0,
    y: 2.0,
    w: '100%',
    h: 1.8,
    fontSize: 72,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: ORANGE,
    align: 'center',
  })

  // Headline
  s.addText(slide.headline, {
    x: 2,
    y: 3.9,
    w: 8.5,
    h: 0.8,
    fontSize: 20,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
    align: 'center',
  })

  // Context
  s.addText(slide.context, {
    x: 2.5,
    y: 4.8,
    w: 7.5,
    h: 1.0,
    fontSize: 14,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
    align: 'center',
    lineSpacingMultiple: 1.4,
  })

  return s
}

function buildEvidenceSlide(
  pres: PptxGenJS,
  slide: EvidenceSlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()

  // Headline
  s.addText(slide.headline, {
    x: 0.8,
    y: 0.6,
    w: 10,
    h: 0.8,
    fontSize: 22,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })

  // Quote background
  s.addShape('roundRect', {
    x: 0.8,
    y: 1.8,
    w: 10.9,
    h: 2.5,
    rectRadius: 0.15,
    fill: { color: MUTED_BG },
  })

  // Quote mark
  s.addText('\u201C', {
    x: 1.0,
    y: 1.6,
    w: 0.6,
    h: 0.8,
    fontSize: 36,
    fontFace: 'Georgia',
    color: ORANGE,
    transparency: 40,
  })

  // Quote text
  s.addText(`\u201C${slide.quote}\u201D`, {
    x: 1.5,
    y: 2.0,
    w: 9.5,
    h: 1.5,
    fontSize: 16,
    fontFace: 'Georgia',
    italic: true,
    color: DARK_TEXT,
    lineSpacingMultiple: 1.5,
    valign: 'top',
  })

  // Attribution
  if (slide.attribution) {
    s.addText(`\u2014 ${slide.attribution}`, {
      x: 1.5,
      y: 3.6,
      w: 9.5,
      h: 0.5,
      fontSize: 12,
      fontFace: 'Helvetica Neue',
      color: MID_TEXT,
    })
  }

  // Analysis
  s.addText(slide.analysis, {
    x: 0.8,
    y: 4.8,
    w: 10,
    h: 1.5,
    fontSize: 14,
    fontFace: 'Helvetica Neue',
    color: MID_TEXT,
    lineSpacingMultiple: 1.4,
    valign: 'top',
  })

  return s
}

function buildSummarySlide(
  pres: PptxGenJS,
  slide: SummarySlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()

  // Headline
  s.addText(slide.headline, {
    x: 0.8,
    y: 0.6,
    w: 10,
    h: 0.8,
    fontSize: 26,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: DARK_TEXT,
  })

  // Takeaway items
  slide.takeaways.forEach((takeaway, i) => {
    const rowY = 1.8 + i * 1.0

    // Numbered circle
    s.addShape('roundRect', {
      x: 0.8,
      y: rowY,
      w: 0.55,
      h: 0.55,
      rectRadius: 0.12,
      fill: { color: ORANGE },
    })
    s.addText(String(i + 1), {
      x: 0.8,
      y: rowY,
      w: 0.55,
      h: 0.55,
      fontSize: 12,
      fontFace: 'Helvetica Neue',
      bold: true,
      color: WHITE,
      align: 'center',
      valign: 'middle',
    })

    // Takeaway text
    s.addText(takeaway, {
      x: 1.6,
      y: rowY,
      w: 10,
      h: 0.55,
      fontSize: 15,
      fontFace: 'Helvetica Neue',
      color: DARK_TEXT,
      valign: 'middle',
    })
  })

  // Closing line
  if (slide.closingLine) {
    const closingY = 1.8 + slide.takeaways.length * 1.0 + 0.5

    s.addShape('rect', {
      x: 0.8,
      y: closingY,
      w: 10.5,
      h: 0.01,
      fill: { color: MUTED_BG },
    })

    s.addText(slide.closingLine, {
      x: 0.8,
      y: closingY + 0.3,
      w: 10,
      h: 0.6,
      fontSize: 13,
      fontFace: 'Helvetica Neue',
      italic: true,
      color: MID_TEXT,
      lineSpacingMultiple: 1.4,
    })
  }

  return s
}

function buildSectionDividerSlide(
  pres: PptxGenJS,
  slide: SectionDividerSlideContent,
): PptxGenJS.Slide {
  const s = pres.addSlide()
  s.background = { fill: DARK_TEXT }

  if ((slide as any).imageUrl) {
    s.addImage({
      path: (slide as any).imageUrl,
      x: 0, y: 0, w: '100%', h: '100%',
      sizing: { type: 'cover', w: 10, h: 5.63 },
    })
  }

  // Accent bar
  s.addShape('rect', {
    x: 5.5,
    y: 2.5,
    w: 1.5,
    h: 0.06,
    fill: { color: ORANGE },
  })

  // Headline
  s.addText(slide.headline, {
    x: 1,
    y: 2.8,
    w: 10.5,
    h: 1.2,
    fontSize: 36,
    fontFace: 'Helvetica Neue',
    bold: true,
    color: WHITE,
    align: 'center',
  })

  // Subtitle
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 2,
      y: 4.1,
      w: 8.5,
      h: 0.8,
      fontSize: 16,
      fontFace: 'Helvetica Neue',
      color: WHITE,
      transparency: 40,
      align: 'center',
    })
  }

  return s
}

// ========================
// Slide Dispatcher
// ========================

function buildSlide(
  pres: PptxGenJS,
  slide: SlideContent,
): PptxGenJS.Slide | undefined {
  switch (slide.slideType) {
    case 'title':
      return buildTitleSlide(pres, slide)
    case 'hero-insight':
      return buildHeroInsightSlide(pres, slide)
    case 'argument':
      return buildArgumentSlide(pres, slide)
    case 'comparison':
      return buildComparisonSlide(pres, slide)
    case 'data-callout':
      return buildDataCalloutSlide(pres, slide)
    case 'evidence':
      return buildEvidenceSlide(pres, slide)
    case 'summary':
      return buildSummarySlide(pres, slide)
    case 'section-divider':
      return buildSectionDividerSlide(pres, slide)
    default:
      console.warn('[ExportSlideDeckPPTX] Unknown slide type, skipping:', (slide as SlideContent).slideType)
      return undefined
  }
}

// ========================
// Public API
// ========================

/**
 * Convert a StrategicBriefing into a branded .pptx presentation and trigger download.
 *
 * @description Each slide in the briefing becomes one pptx slide with a
 * layout matching the on-screen renderer. Uses 16:9 landscape format.
 *
 * @param briefing The fully-populated strategic briefing to export
 */
export async function exportSlideDeckAsPPTX(
  briefing: StrategicBriefing,
): Promise<Blob> {
  const pres = new PptxGenJS()

  pres.layout = 'LAYOUT_16x9'
  pres.author = 'ForgeOS'
  pres.subject = briefing.title
  pres.title = briefing.title

  briefing.slides.forEach((slide) => {
    buildSlide(pres, slide)
  })

  const safeName = briefing.companyName.replace(/[^a-zA-Z0-9]/g, '-')
  const safeTitle = briefing.title.replace(/[^a-zA-Z0-9]/g, '-')
  const dateStr = new Date().toISOString().split('T')[0]
  const filename = `${safeName}-${safeTitle}-${dateStr}.pptx`

  // Write as blob for upload, then trigger browser download
  const content = await pres.write({ outputType: 'blob' })
  if (!(content instanceof Blob)) throw new Error('Expected Blob from PptxGenJS')
  const url = URL.createObjectURL(content)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)

  return content
}
