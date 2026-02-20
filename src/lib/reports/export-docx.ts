/**
 * @file export-docx.ts
 *
 * @description Client-side module that converts a ReportDocument into a
 * downloadable .docx file using the `docx` library. Dynamically imported
 * in the browser when a user requests a Word document export.
 *
 * DECISION: Each section becomes a set of paragraphs in a single document
 * rather than separate pages, because Word documents are expected to flow
 * continuously. Page breaks are inserted between major sections for readability.
 *
 * @related
 * - src/lib/reports/report-document-types.ts — Section data shapes
 * - src/lib/reports/export-pptx.ts — PPTX counterpart
 * - src/lib/reports/export-pdf.ts — PDF counterpart
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  PageBreak,
  BorderStyle,
  Footer,
} from 'docx'

import type {
  ReportDocument,
  CoverSectionData,
  ExecutiveSummarySectionData,
  KeyMetricsSectionData,
  ObjectivesProgressSectionData,
  TeamActivitySectionData,
  BlockersRisksSectionData,
  CompletionTrendSectionData,
  WeekAheadSectionData,
} from '@/lib/reports/report-document-types'

const ORANGE = 'FF4500'
const DARK_TEXT = '1E293B'
const MID_TEXT = '64748B'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMetricValue(value: number, fmt: string): string {
  if (fmt === 'percentage') return `${Math.round(value)}%`
  if (fmt === 'decimal') return value.toFixed(1)
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Display names for sections in TOC. */
const SECTION_DISPLAY_NAMES: Record<string, string> = {
  'executive-summary': 'Executive Summary',
  'key-metrics': 'Key Metrics',
  'objectives-progress': 'Objectives Progress',
  'team-activity': 'Team Activity',
  'blockers-risks': 'Blockers & Risks',
  'completion-trend': 'Completion Trend',
  'week-ahead': 'Week Ahead',
}

interface ExportContext {
  templateId: string
  sectionNumber?: number
}

function sectionHeading(text: string, options?: { number?: number }): Paragraph {
  const headingText = options?.number !== undefined ? `${options.number}. ${text}` : text
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({ text: headingText, bold: true, size: 28, color: DARK_TEXT }),
    ],
  })
}

function bodyParagraph(text: string, spacing?: { before?: number; after?: number }): Paragraph {
  return new Paragraph({
    spacing: { before: spacing?.before ?? 0, after: spacing?.after ?? 120 },
    children: [
      new TextRun({ text, size: 22, color: DARK_TEXT }),
    ],
  })
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [
      new TextRun({ text, size: 22, color: DARK_TEXT }),
    ],
  })
}

// INTENT: Simple border definition reused across all table cells for visual consistency.
const THIN_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
} as const

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: THIN_BORDER,
    shading: { fill: 'F8FAFC' },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18, color: MID_TEXT })],
      }),
    ],
  })
}

function dataCell(text: string, widthPct: number, color?: string): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: THIN_BORDER,
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, color: color ?? DARK_TEXT })],
      }),
    ],
  })
}

// ========================
// Section Builders
// ========================

function buildCover(data: CoverSectionData, ctx: ExportContext): DocChild[] {
  const subtitle = data.subtitle || `${formatDate(data.dateRange.start)} – ${formatDate(data.dateRange.end)}`
  const isBoardPack = ctx.templateId === 'board-pack'
  const companySize = isBoardPack ? 28 : 22
  const companySpacingAfter = isBoardPack ? 400 : 200
  return [
    new Paragraph({
      spacing: { after: companySpacingAfter },
      children: [
        new TextRun({
          text: data.companyName.toUpperCase(),
          size: companySize,
          color: MID_TEXT,
          characterSpacing: 80,
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: isBoardPack ? 400 : 200 },
      children: [
        new TextRun({ text: data.reportTitle, bold: true, size: 48, color: DARK_TEXT }),
      ],
    }),
    bodyParagraph(subtitle, { after: isBoardPack ? 600 : 400 }),
    bodyParagraph(`Generated by ForgeOS · ${formatDate(data.generatedAt.split('T')[0])}`),
    new Paragraph({ children: [new PageBreak()] }),
  ]
}

/** Builds a Table of Contents page (heading + bulleted list) for Board Pack. */
function buildTocPage(sectionTypes: string[]): DocChild[] {
  const items = sectionTypes.map((t) => SECTION_DISPLAY_NAMES[t] ?? t).filter(Boolean)
  const paragraphs: DocChild[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 400 },
      children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, color: DARK_TEXT })],
    }),
  ]
  for (const label of items) {
    paragraphs.push(bulletParagraph(label))
  }
  paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
  return paragraphs
}

function buildExecutiveSummary(data: ExecutiveSummarySectionData, ctx: ExportContext): DocChild[] {
  const num = ctx.templateId === 'board-pack' ? ctx.sectionNumber : undefined
  const paragraphs: DocChild[] = [sectionHeading('Executive Summary', num !== undefined ? { number: num } : undefined)]
  if (data.narrative) {
    paragraphs.push(bodyParagraph(data.narrative, { after: 200 }))
  }
  for (const h of data.highlights) {
    paragraphs.push(bulletParagraph(h))
  }
  paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
  return paragraphs
}

type DocChild = Paragraph | Table

function buildKeyMetrics(data: KeyMetricsSectionData, ctx: ExportContext): DocChild[] {
  const num = ctx.templateId === 'board-pack' ? ctx.sectionNumber : undefined
  const paragraphs: DocChild[] = [sectionHeading('Key Metrics', num !== undefined ? { number: num } : undefined)]
  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Metric', 40),
        headerCell('Value', 20),
        headerCell('Change', 20),
        headerCell('Trend', 20),
      ],
    }),
  ]

  for (const m of data.metrics) {
    const sign = m.changePercent >= 0 ? '+' : ''
    const trendSymbol = m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : '●'
    rows.push(
      new TableRow({
        children: [
          dataCell(m.label, 40),
          dataCell(formatMetricValue(m.value, m.format), 20),
          dataCell(`${sign}${m.changePercent.toFixed(1)}%`, 20),
          dataCell(trendSymbol, 20),
        ],
      })
    )
  }

  paragraphs.push(
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
  )
  return paragraphs
}

function buildObjectivesProgress(data: ObjectivesProgressSectionData, ctx: ExportContext): DocChild[] {
  const num = ctx.templateId === 'board-pack' ? ctx.sectionNumber : undefined
  const paragraphs: DocChild[] = [sectionHeading('Objectives Progress', num !== undefined ? { number: num } : undefined)]
  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Objective', 45),
        headerCell('Progress', 15),
        headerCell('Health', 20),
        headerCell('Tasks', 20),
      ],
    }),
  ]

  for (const obj of data.objectives.slice(0, 15)) {
    const healthColorMap: Record<string, string> = {
      'on-track': '16A34A',
      'completed': '16A34A',
      'at-risk': 'FF4500',
      'off-track': 'DC2626',
    }
    rows.push(
      new TableRow({
        children: [
          dataCell(obj.title, 45),
          dataCell(`${Math.round(obj.progress)}%`, 15),
          dataCell(obj.health.replace('-', ' '), 20, healthColorMap[obj.health] ?? MID_TEXT),
          dataCell(`${obj.tasksCompleted}/${obj.tasksCompleted + obj.tasksRemaining}`, 20),
        ],
      })
    )
  }

  paragraphs.push(
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
  )
  return paragraphs
}

function buildTeamActivity(data: TeamActivitySectionData, ctx: ExportContext): DocChild[] {
  const num = ctx.templateId === 'board-pack' ? ctx.sectionNumber : undefined
  const paragraphs: DocChild[] = [sectionHeading('Team Activity', num !== undefined ? { number: num } : undefined)]
  const sorted = [...data.members].sort((a, b) => b.tasksCompleted - a.tasksCompleted).slice(0, 15)

  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Name', 40),
        headerCell('Role', 35),
        headerCell('Tasks Completed', 25),
      ],
    }),
  ]

  for (const m of sorted) {
    rows.push(
      new TableRow({
        children: [
          dataCell(m.name, 40),
          dataCell(m.role ?? '—', 35),
          dataCell(String(m.tasksCompleted), 25),
        ],
      })
    )
  }

  paragraphs.push(
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
  )
  return paragraphs
}

function buildBlockersRisks(data: BlockersRisksSectionData, ctx: ExportContext): DocChild[] {
  const num = ctx.templateId === 'board-pack' ? ctx.sectionNumber : undefined
  const paragraphs: DocChild[] = [sectionHeading('Blockers & Risks', num !== undefined ? { number: num } : undefined)]

  if (data.blockers.length > 0) {
    paragraphs.push(bodyParagraph('Blockers:', { after: 80 }))
    for (const b of data.blockers) {
      paragraphs.push(bulletParagraph(`${b.reporterName}: ${b.description}`))
    }
  }

  if (data.atRiskObjectives.length > 0) {
    paragraphs.push(bodyParagraph('At-Risk Objectives:', { before: 200, after: 80 }))
    for (const o of data.atRiskObjectives) {
      paragraphs.push(
        bulletParagraph(`${o.title} — ${Math.round(o.progress)}% complete, ${o.daysRemaining} days remaining`)
      )
    }
  }

  if (data.blockers.length === 0 && data.atRiskObjectives.length === 0) {
    paragraphs.push(bodyParagraph('No blockers or at-risk objectives reported.'))
  }

  return paragraphs
}

function buildCompletionTrend(data: CompletionTrendSectionData, ctx: ExportContext): DocChild[] {
  // DECISION: DOCX doesn't natively support chart rendering the way PPTX does.
  // Instead, present the trend data as a table. Users can chart it in Word/Excel.
  const num = ctx.templateId === 'board-pack' ? ctx.sectionNumber : undefined
  const title = `Completion Trend — ${data.periodLabel}`
  const paragraphs: DocChild[] = [sectionHeading(title, num !== undefined ? { number: num } : undefined)]

  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Date', 40),
        headerCell('Completed', 30),
        headerCell('Created', 30),
      ],
    }),
  ]

  for (const dp of data.dataPoints) {
    rows.push(
      new TableRow({
        children: [
          dataCell(formatDate(dp.date), 40),
          dataCell(String(dp.completed), 30),
          dataCell(String(dp.created), 30),
        ],
      })
    )
  }

  paragraphs.push(
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
  )
  return paragraphs
}

function buildWeekAhead(data: WeekAheadSectionData, ctx: ExportContext): DocChild[] {
  const num = ctx.templateId === 'board-pack' ? ctx.sectionNumber : undefined
  const paragraphs: DocChild[] = [sectionHeading('Week Ahead', num !== undefined ? { number: num } : undefined)]

  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Task', 35),
        headerCell('Assignee', 20),
        headerCell('Due Date', 20),
        headerCell('Objective', 25),
      ],
    }),
  ]

  for (const t of data.tasks.slice(0, 20)) {
    rows.push(
      new TableRow({
        children: [
          dataCell(t.title, 35),
          dataCell(t.assigneeName ?? '—', 20),
          dataCell(formatDate(t.dueDate), 20),
          dataCell(t.objectiveTitle ?? '—', 25),
        ],
      })
    )
  }

  paragraphs.push(
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
  )
  return paragraphs
}

// ========================
// Section dispatcher
// ========================

type SectionBuilder = (data: Record<string, unknown>, ctx: ExportContext) => DocChild[]

const SECTION_BUILDERS: Record<string, SectionBuilder> = {
  'cover': (d, ctx) => buildCover(d as unknown as CoverSectionData, ctx),
  'executive-summary': (d, ctx) => buildExecutiveSummary(d as unknown as ExecutiveSummarySectionData, ctx),
  'key-metrics': (d, ctx) => buildKeyMetrics(d as unknown as KeyMetricsSectionData, ctx),
  'objectives-progress': (d, ctx) => buildObjectivesProgress(d as unknown as ObjectivesProgressSectionData, ctx),
  'team-activity': (d, ctx) => buildTeamActivity(d as unknown as TeamActivitySectionData, ctx),
  'blockers-risks': (d, ctx) => buildBlockersRisks(d as unknown as BlockersRisksSectionData, ctx),
  'completion-trend': (d, ctx) => buildCompletionTrend(d as unknown as CompletionTrendSectionData, ctx),
  'week-ahead': (d, ctx) => buildWeekAhead(d as unknown as WeekAheadSectionData, ctx),
}

// ========================
// Public API
// ========================

/**
 * @description Converts a ReportDocument into a branded .docx Word document
 * and triggers a browser download. Each document section becomes a series of
 * paragraphs and tables with consistent formatting.
 *
 * @param document The fully-populated report document to export
 */
// Margin values (twentieths of a point; 1440 = 1 inch)
const MARGIN_DEFAULT = 1440
const MARGIN_COMPACT = 1080 // Smaller for weekly-update

export async function exportReportAsDOCX(document: ReportDocument): Promise<void> {
  const templateId = document.templateId ?? 'custom'
  const isBoardPack = templateId === 'board-pack'
  const isWeeklyUpdate = templateId === 'weekly-update'

  const allChildren: DocChild[] = []
  let sectionNumber = 0

  for (const section of document.sections) {
    const builder = SECTION_BUILDERS[section.type]
    if (builder) {
      const ctx: ExportContext = { templateId, sectionNumber: sectionNumber || undefined }
      if (section.type !== 'cover') {
        if (isBoardPack) sectionNumber += 1
        ctx.sectionNumber = sectionNumber || undefined
      }
      const content = builder(section.data as unknown as Record<string, unknown>, ctx)
      allChildren.push(...content)

      // Insert TOC after cover for board-pack
      if (isBoardPack && section.type === 'cover') {
        const tocSectionTypes = document.sections
          .filter((s) => s.type !== 'cover')
          .map((s) => s.type)
        allChildren.push(...buildTocPage(tocSectionTypes))
      }
    } else {
      console.warn('[ExportDOCX] Unknown section type, skipping:', section.type)
    }
  }

  allChildren.push(
    new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Generated by ForgeOS', size: 18, color: MID_TEXT, italics: true }),
      ],
    })
  )

  const margin = isWeeklyUpdate ? MARGIN_COMPACT : MARGIN_DEFAULT
  const sectionOptions: { properties: object; children: DocChild[]; footers?: { default: Footer } } = {
    properties: {
      page: {
        margin: { top: margin, bottom: margin, left: margin, right: margin },
      },
    },
    children: allChildren,
  }

  if (isBoardPack) {
    sectionOptions.footers = {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Confidential — Prepared by ForgeOS', size: 18, color: MID_TEXT }),
            ],
          }),
        ],
      }),
    }
  }

  const doc = new Document({
    creator: 'ForgeOS',
    title: document.title,
    description: `${document.foundryName} — ${document.title}`,
    styles: {
      default: {
        heading1: {
          run: { size: 48, bold: true, color: DARK_TEXT },
          paragraph: { spacing: { after: 200 } },
        },
        heading2: {
          run: { size: 28, bold: true, color: DARK_TEXT },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
      },
    },
    sections: [sectionOptions],
  })

  const blob = await Packer.toBlob(doc)

  const safeName = document.foundryName.replace(/[^a-zA-Z0-9]/g, '-')
  const safeTitle = document.title.replace(/[^a-zA-Z0-9]/g, '-')
  const filename = `${safeName}-${safeTitle}-${document.dateRange.start}.docx`

  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
