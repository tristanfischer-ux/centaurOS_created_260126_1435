/**
 * @file export-debate.ts — DOCX export for Red Team debates (v2)
 *
 * @description Client-side module that converts a RedTeamDebateDocument
 * into a downloadable .docx file. Features two-column Bull vs Bear layout,
 * fact-check callout boxes, colour-coded tensions table, and cover page.
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
  ShadingType,
} from "docx"

import type { RedTeamDebateDocument, DebateRole, FactCheck } from "./types"

// ─── Brand Colors ───────────────────────────────────────────────

const ORANGE = "FF4500"
const DARK = "1A1A1A"
const MUTED = "666666"
const LIGHT_BG = "F8F9FA"
const WHITE = "FFFFFF"

const ROLE_LABELS: Record<DebateRole, string> = {
  bull: "BULL", bear: "BEAR", realist: "REALIST", disruptor: "DISRUPTOR", wildcard: "WILDCARD",
}

const ROLE_HEX: Record<DebateRole, string> = {
  bull: "22C55E", bear: "EF4444", realist: "3B82F6", disruptor: "F59E0B", wildcard: "06B6D4",
}

const ROLE_BG: Record<DebateRole, string> = {
  bull: "F0FDF4", bear: "FEF2F2", realist: "EFF6FF", disruptor: "FFFBEB", wildcard: "ECFEFF",
}

const VERDICT_HEX: Record<FactCheck["verdict"], string> = {
  verified: "22C55E", corrected: "F59E0B", disputed: "EF4444", unverified: "999999",
}

// ─── Export Function ────────────────────────────────────────────

export async function exportDebateAsDOCX(debate: RedTeamDebateDocument): Promise<Blob> {
  const children: (Paragraph | Table)[] = []

  // ── Cover Page ─────────────────────────────────────
  children.push(
    new Paragraph({ spacing: { before: 2000 }, children: [] }),
    new Paragraph({
      children: [new TextRun({ text: "RED TEAM DEBATE", bold: true, size: 44, color: ORANGE, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: debate.topic, bold: true, size: 32, color: DARK })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generated ${new Date(debate.generatedAt).toLocaleDateString()} | ${Math.round(debate.totalDuration / 1000)}s | ${debate.totalCostUsd ? `$${debate.totalCostUsd.toFixed(2)}` : ""}`, size: 20, color: MUTED })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "ForgeOS — Fractional Forge", size: 18, color: MUTED, italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  )

  // Debaters table
  const debaterRows = debate.personas.map(p =>
    new TableRow({
      children: [
        makeCell(ROLE_LABELS[p.role], { bold: true, color: ROLE_HEX[p.role], bg: ROLE_BG[p.role] }),
        makeCell(`${p.characterName} (${p.characterTitle})`),
        makeCell(p.position, { color: MUTED }),
        makeCell(p.modelId, { color: MUTED, size: 16 }),
      ],
    }),
  )

  children.push(
    new Table({
      rows: [
        new TableRow({
          children: ["Role", "Character", "Position", "Model"].map(h => makeCell(h, { bold: true, bg: LIGHT_BG })),
        }),
        ...debaterRows,
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  )

  // ── Rounds ─────────────────────────────────────────
  for (const round of debate.rounds) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Round ${round.roundNumber}: ${round.question}`, bold: true, color: DARK })],
        spacing: { before: 300 },
      }),
    )

    // Two-column table: Bull vs Bear (side by side)
    const bull = round.arguments.find(a => a.role === "bull")
    const bear = round.arguments.find(a => a.role === "bear")

    if (bull && bear) {
      children.push(
        new Table({
          rows: [
            new TableRow({
              children: [
                makeCell(`BULL (${bull.characterName})`, { bold: true, color: ROLE_HEX.bull, bg: ROLE_BG.bull }),
                makeCell(`BEAR (${bear.characterName})`, { bold: true, color: ROLE_HEX.bear, bg: ROLE_BG.bear }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: bull.content, size: 18 })], spacing: { after: 100 } })],
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, fill: ROLE_BG.bull, color: ROLE_BG.bull },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: bear.content, size: 18 })], spacing: { after: 100 } })],
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, fill: ROLE_BG.bear, color: ROLE_BG.bear },
                }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      )
    }

    // Other personas (Realist, Disruptor, Wildcard) — full width
    for (const arg of round.arguments.filter(a => a.role !== "bull" && a.role !== "bear")) {
      const role = arg.role as DebateRole
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${ROLE_LABELS[role]} `, bold: true, color: ROLE_HEX[role], size: 22 }),
            new TextRun({ text: `(${arg.characterName}) `, bold: true, size: 22 }),
            new TextRun({ text: `via ${arg.modelId}${arg.costUsd ? ` — $${arg.costUsd.toFixed(3)}` : ""}`, size: 16, color: MUTED }),
          ],
          spacing: { before: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: arg.content, size: 18 })],
          spacing: { after: 200 },
          shading: { type: ShadingType.SOLID, fill: ROLE_BG[role], color: ROLE_BG[role] },
        }),
      )
    }

    // Fact-check callout boxes
    if (round.factChecks.length > 0) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: "FACT CHECKS", bold: true, size: 18, color: MUTED })], spacing: { before: 200 } }),
      )
      for (const fc of round.factChecks) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `[${fc.verdict.toUpperCase()}] `, bold: true, color: VERDICT_HEX[fc.verdict], size: 18 }),
              new TextRun({ text: fc.claim, size: 18, bold: true }),
            ],
            shading: { type: ShadingType.SOLID, fill: LIGHT_BG, color: LIGHT_BG },
            spacing: { before: 50 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 6, color: VERDICT_HEX[fc.verdict] },
            },
          }),
          new Paragraph({
            children: [new TextRun({ text: fc.detail, size: 16, color: MUTED })],
            shading: { type: ShadingType.SOLID, fill: LIGHT_BG, color: LIGHT_BG },
            spacing: { after: 100 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 6, color: VERDICT_HEX[fc.verdict] },
            },
          }),
        )
      }
    }

    // User interjection (if any)
    if (round.userInput) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "FOUNDER INTERJECTION: ", bold: true, color: ORANGE, size: 20 }),
            new TextRun({ text: round.userInput, size: 20, italics: true }),
          ],
          spacing: { before: 200, after: 200 },
          shading: { type: ShadingType.SOLID, fill: "FFF7ED", color: "FFF7ED" },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: ORANGE } },
        }),
      )
    }

    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // ── Key Tensions ───────────────────────────────────
  if (debate.tensions.length > 0) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Key Tensions", bold: true, color: ORANGE })] }),
    )

    const headers = ["Dimension", "Sage (Bull)", "Max (Bear)", "Finn (Realist)", "Cal (Disruptor)", "Fiona (Wildcard)"]
    const headerColors = [DARK, ROLE_HEX.bull, ROLE_HEX.bear, ROLE_HEX.realist, ROLE_HEX.disruptor, ROLE_HEX.wildcard]

    children.push(
      new Table({
        rows: [
          new TableRow({
            children: headers.map((h, i) => makeCell(h, { bold: true, color: headerColors[i], bg: LIGHT_BG })),
          }),
          ...debate.tensions.map(row =>
            new TableRow({
              children: [row.dimension, row.bull, row.bear, row.realist, row.disruptor, row.wildcard].map((cell, i) =>
                makeCell(cell || "—", { size: 16, bg: i === 0 ? WHITE : undefined }),
              ),
            }),
          ),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
      new Paragraph({ children: [new PageBreak()] }),
    )
  }

  // ── Verdict ────────────────────────────────────────
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Verdict", bold: true, color: ORANGE })] }),
    new Paragraph({ children: [new TextRun({ text: debate.verdict, size: 20 })], spacing: { after: 400 } }),
  )

  // ── Actions ────────────────────────────────────────
  if (debate.suggestedObjectives.length > 0 || debate.suggestedTasks.length > 0) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Recommended Actions", bold: true, color: ORANGE })] }),
    )
    for (const obj of debate.suggestedObjectives) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Objective: ${obj.title}`, bold: true, size: 20 }), new TextRun({ text: ` — ${obj.description}`, size: 20, color: MUTED })] }))
    }
    for (const task of debate.suggestedTasks) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Task: ${task.title}`, size: 20 }), new TextRun({ text: ` — ${task.description}`, size: 20, color: MUTED })] }))
    }
    for (const risk of debate.suggestedRiskMitigations) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Risk: ${risk.risk}`, size: 20, color: "EF4444" }), new TextRun({ text: ` → ${risk.mitigation}`, size: 20, color: MUTED })] }))
    }
  }

  const doc = new Document({
    sections: [{ children }],
    styles: { paragraphStyles: [{ id: "Normal", run: { font: "Calibri", size: 22 } }] },
  })

  return Packer.toBlob(doc)
}

// ─── Helpers ────────────────────────────────────────────────────

function makeCell(text: string, opts?: { bold?: boolean; color?: string; size?: number; bg?: string }): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({
        text,
        bold: opts?.bold,
        color: opts?.color || DARK,
        size: opts?.size || 18,
        font: "Calibri",
      })],
    })],
    shading: opts?.bg ? { type: ShadingType.SOLID, fill: opts.bg, color: opts.bg } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
  })
}
