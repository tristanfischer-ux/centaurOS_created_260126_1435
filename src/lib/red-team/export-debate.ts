/**
 * @file export-debate.ts — DOCX export for Red Team debates
 *
 * @description Client-side module that converts a RedTeamDebateDocument
 * into a downloadable .docx file. Dynamically imported when user clicks
 * the Export DOCX button.
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
} from "docx"

import type { RedTeamDebateDocument, DebateRole } from "./types"

// ─── Brand Colors ───────────────────────────────────────────────

const ORANGE = "FF4500"
const DARK = "1A1A1A"
const MUTED = "666666"
const LIGHT_BG = "F8F9FA"

const ROLE_LABELS: Record<DebateRole, string> = {
  bull: "BULL",
  bear: "BEAR",
  realist: "REALIST",
  disruptor: "DISRUPTOR",
  wildcard: "WILDCARD",
}

const ROLE_HEX: Record<DebateRole, string> = {
  bull: "22C55E",
  bear: "EF4444",
  realist: "3B82F6",
  disruptor: "F59E0B",
  wildcard: "06B6D4",
}

// ─── Export Function ────────────────────────────────────────────

export async function exportDebateAsDOCX(debate: RedTeamDebateDocument): Promise<Blob> {
  const sections: (Paragraph | Table)[] = []

  // Title
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: "RED TEAM DEBATE", bold: true, size: 36, color: ORANGE })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: debate.topic, bold: true, size: 28, color: DARK })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generated: ${new Date(debate.generatedAt).toLocaleDateString()} | Duration: ${Math.round(debate.totalDuration / 1000)}s`, size: 18, color: MUTED })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  )

  // Debaters table
  sections.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Debaters", bold: true, color: DARK })] }),
  )

  const debaterRows = debate.personas.map(p =>
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ROLE_LABELS[p.role], bold: true, color: ROLE_HEX[p.role], size: 20 })] })], width: { size: 15, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${p.characterName} (${p.characterTitle})`, size: 20 })] })], width: { size: 30, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.position, size: 20, color: MUTED })] })], width: { size: 35, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.modelId, size: 18, color: MUTED })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
      ],
    }),
  )

  sections.push(
    new Table({
      rows: [
        new TableRow({
          children: ["Role", "Character", "Position", "Model"].map(h =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, color: MUTED })] })],
              shading: { fill: LIGHT_BG },
            }),
          ),
        }),
        ...debaterRows,
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  )

  // Rounds
  for (const round of debate.rounds) {
    sections.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Round ${round.roundNumber}: ${round.question}`, bold: true, color: DARK })],
        spacing: { before: 400 },
      }),
    )

    for (const arg of round.arguments) {
      const role = arg.role as DebateRole
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${ROLE_LABELS[role]} `, bold: true, color: ROLE_HEX[role], size: 22 }),
            new TextRun({ text: `(${arg.characterName}) `, bold: true, size: 22 }),
            new TextRun({ text: `via ${arg.modelId} — ${(arg.duration / 1000).toFixed(1)}s`, size: 18, color: MUTED }),
          ],
          spacing: { before: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: arg.content, size: 20 })],
          spacing: { after: 200 },
        }),
      )
    }

    // Fact checks
    if (round.factChecks.length > 0) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: "FACT CHECKS", bold: true, size: 18, color: MUTED })],
          spacing: { before: 200 },
        }),
      )
      for (const fc of round.factChecks) {
        const verdictColor = fc.verdict === "verified" ? "22C55E" : fc.verdict === "corrected" ? "F59E0B" : fc.verdict === "disputed" ? "EF4444" : MUTED
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `[${fc.verdict.toUpperCase()}] `, bold: true, color: verdictColor, size: 18 }),
              new TextRun({ text: fc.claim, size: 18 }),
              new TextRun({ text: ` — ${fc.detail}`, size: 18, color: MUTED }),
            ],
            spacing: { after: 100 },
          }),
        )
      }
    }

    sections.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // Key Tensions
  if (debate.tensions.length > 0) {
    sections.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Key Tensions", bold: true, color: ORANGE })] }),
    )

    const tensionHeaderCells = ["Dimension", "Sage (Bull)", "Max (Bear)", "Finn (Realist)", "Cal (Disruptor)", "Fiona (Wildcard)"]
    const tensionRows = debate.tensions.map(row =>
      new TableRow({
        children: [row.dimension, row.bull, row.bear, row.realist, row.disruptor, row.wildcard].map(cell =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: cell || "—", size: 18 })] })],
            borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" } },
          }),
        ),
      }),
    )

    sections.push(
      new Table({
        rows: [
          new TableRow({
            children: tensionHeaderCells.map(h =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, color: DARK })] })],
                shading: { fill: LIGHT_BG },
              }),
            ),
          }),
          ...tensionRows,
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
      new Paragraph({ children: [new PageBreak()] }),
    )
  }

  // Verdict
  sections.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Verdict", bold: true, color: ORANGE })] }),
    new Paragraph({ children: [new TextRun({ text: debate.verdict, size: 20 })], spacing: { after: 400 } }),
  )

  // Suggested Actions
  if (debate.suggestedObjectives.length > 0 || debate.suggestedTasks.length > 0) {
    sections.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Recommended Actions", bold: true, color: ORANGE })] }),
    )
    for (const obj of debate.suggestedObjectives) {
      sections.push(new Paragraph({ children: [new TextRun({ text: `Objective: ${obj.title}`, bold: true, size: 20 }), new TextRun({ text: ` — ${obj.description}`, size: 20, color: MUTED })] }))
    }
    for (const task of debate.suggestedTasks) {
      sections.push(new Paragraph({ children: [new TextRun({ text: `Task: ${task.title}`, size: 20 }), new TextRun({ text: ` — ${task.description}`, size: 20, color: MUTED })] }))
    }
  }

  const doc = new Document({
    sections: [{ children: sections }],
    styles: {
      paragraphStyles: [
        { id: "Normal", run: { font: "Calibri", size: 22 } },
      ],
    },
  })

  return Packer.toBlob(doc)
}
