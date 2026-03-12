/**
 * @file markdown-to-docx.ts
 *
 * @description Shared Markdown → DOCX paragraph parser. Handles headings,
 * tables, bullet/numbered lists, blockquotes, horizontal rules, and inline
 * formatting (**bold**, *italic*). Extracted from export-skill-docx.ts so
 * both skill documents and design reports share the same parser.
 *
 * @related
 * - src/lib/reports/export-skill-docx.ts — original consumer
 * - src/lib/cad-lab/export-design-report-docx.ts — design report consumer
 */

import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  BorderStyle,
} from 'docx'

// ─── Brand Constants ────────────────────────────────────────────────

export const ORANGE = 'FF4500'
export const DARK_TEXT = '1E293B'
export const MID_TEXT = '64748B'
export const LIGHT_BG = 'F8FAFC'

// ─── Types ──────────────────────────────────────────────────────────

export type DocChild = Paragraph | Table

// ─── Parser ─────────────────────────────────────────────────────────

export function parseMarkdownToDocx(markdown: string): DocChild[] {
  const lines = markdown.split('\n')
  const children: DocChild[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (!line.trim()) {
      i++
      continue
    }

    // Headings
    if (line.startsWith('#### ')) {
      children.push(heading(line.slice(5).trim(), HeadingLevel.HEADING_4))
      i++
      continue
    }
    if (line.startsWith('### ')) {
      children.push(heading(line.slice(4).trim(), HeadingLevel.HEADING_3))
      i++
      continue
    }
    if (line.startsWith('## ')) {
      children.push(heading(line.slice(3).trim(), HeadingLevel.HEADING_2))
      i++
      continue
    }
    if (line.startsWith('# ')) {
      children.push(heading(line.slice(2).trim(), HeadingLevel.HEADING_1))
      i++
      continue
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          },
          children: [],
        })
      )
      i++
      continue
    }

    // Table (pipe-delimited)
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const table = parseTable(tableLines)
      if (table) children.push(table)
      continue
    }

    // Bullet list
    if (/^[-*] /.test(line.trim())) {
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        children.push(bulletParagraph(lines[i].trim().slice(2).trim()))
        i++
      }
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line.trim())) {
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^\d+\.\s/, '')
        children.push(numberedParagraph(text))
        i++
      }
      continue
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().slice(1).trim())
        i++
      }
      children.push(blockquote(quoteLines.join(' ')))
      continue
    }

    // Regular paragraph
    children.push(bodyParagraph(line.trim()))
    i++
  }

  return children
}

// ─── Primitives ─────────────────────────────────────────────────────

export function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  const isH2 = level === HeadingLevel.HEADING_2
  return new Paragraph({
    heading: level,
    spacing: { before: isH2 ? 400 : 240, after: 120 },
    children: [
      new TextRun({
        text: stripMarkdownFormatting(text),
        bold: true,
        size: isH2 ? 32 : level === HeadingLevel.HEADING_3 ? 28 : level === HeadingLevel.HEADING_1 ? 36 : 24,
        color: isH2 ? ORANGE : DARK_TEXT,
        font: 'Calibri',
      }),
    ],
  })
}

export function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: parseInlineFormatting(text),
  })
}

export function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    bullet: { level: 0 },
    children: parseInlineFormatting(text),
  })
}

export function numberedParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    numbering: { reference: 'default-numbering', level: 0 },
    children: parseInlineFormatting(text),
  })
}

export function blockquote(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 720 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: ORANGE },
    },
    children: [
      new TextRun({
        text: stripMarkdownFormatting(text),
        italics: true,
        size: 22,
        color: MID_TEXT,
        font: 'Calibri',
      }),
    ],
  })
}

export function parseTable(tableLines: string[]): Table | null {
  if (tableLines.length < 2) return null

  const parseRow = (line: string): string[] =>
    line.split('|').map(c => c.trim()).filter(Boolean)

  const headerCells = parseRow(tableLines[0])
  // Skip separator row (index 1)
  const dataRows = tableLines.slice(2).map(parseRow)

  if (headerCells.length === 0) return null

  const cellWidth = Math.floor(100 / headerCells.length)

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerCells.map(
      cell =>
        new TableCell({
          width: { size: cellWidth, type: WidthType.PERCENTAGE },
          shading: { fill: LIGHT_BG },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: stripMarkdownFormatting(cell),
                  bold: true,
                  size: 20,
                  color: DARK_TEXT,
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        })
    ),
  })

  const rows = dataRows.map(
    cells =>
      new TableRow({
        children: cells.map(
          cell =>
            new TableCell({
              width: { size: cellWidth, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: stripMarkdownFormatting(cell),
                      size: 20,
                      color: DARK_TEXT,
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            })
        ),
      })
  )

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows],
  })
}

// ─── Inline formatting ──────────────────────────────────────────────

export function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = []
  // Simple regex to handle **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)

  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(
        new TextRun({
          text: part.slice(2, -2),
          bold: true,
          size: 22,
          color: DARK_TEXT,
          font: 'Calibri',
        })
      )
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          italics: true,
          size: 22,
          color: DARK_TEXT,
          font: 'Calibri',
        })
      )
    } else if (part) {
      runs.push(
        new TextRun({
          text: part,
          size: 22,
          color: DARK_TEXT,
          font: 'Calibri',
        })
      )
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: '', size: 22, font: 'Calibri' })]
}

export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}
