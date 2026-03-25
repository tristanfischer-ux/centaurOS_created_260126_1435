/**
 * @file export-design-report-docx.ts
 *
 * @description Exports a Design Report as a branded .docx Word document.
 * Sections: cover page, product overview, research findings, module breakdown
 * with blueprint images, specifications summary, and cost estimates.
 *
 * @related
 * - src/lib/cad-lab/design-report-types.ts — DesignReportData shape
 * - src/lib/reports/markdown-to-docx.ts — Shared markdown parser
 * - src/lib/reports/export-docx.ts — Pattern reference (fetchImageAsBuffer)
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  PageBreak,
  BorderStyle,
  ImageRun,
  LevelFormat,
} from 'docx'

import type { DesignReportData, AiReportSection } from '@/lib/cad-lab/design-report-types'
import {
  parseMarkdownToDocx,
  ORANGE,
  DARK_TEXT,
  MID_TEXT,
  LIGHT_BG,
  bodyParagraph as mdBodyParagraph,
  bulletParagraph as mdBulletParagraph,
} from '@/lib/reports/markdown-to-docx'

// ─── Helpers ────────────────────────────────────────────────────────

const THIN_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
} as const

async function fetchImageAsBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return null
    return await response.arrayBuffer()
  } catch {
    return null
  }
}

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: THIN_BORDER,
    shading: { fill: LIGHT_BG },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18, color: MID_TEXT, font: 'Calibri' })],
      }),
    ],
  })
}

function dataCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: THIN_BORDER,
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, color: DARK_TEXT, font: 'Calibri' })],
      }),
    ],
  })
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({ text, bold: true, size: 32, color: ORANGE, font: 'Calibri' }),
    ],
  })
}

function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 28, color: DARK_TEXT, font: 'Calibri' }),
    ],
  })
}

function textParagraph(text: string, opts?: { after?: number; color?: string; italic?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    spacing: { after: opts?.after ?? 120 },
    children: [
      new TextRun({
        text,
        size: opts?.size ?? 22,
        color: opts?.color ?? DARK_TEXT,
        font: 'Calibri',
        italics: opts?.italic,
      }),
    ],
  })
}

type DocChild = Paragraph | Table

// ─── Diagnostic key labels ──────────────────────────────────────────

const DIAG_KEYS = ['mfg_process', 'material', 'tolerance', 'finish', 'batch_size', 'environment'] as const
const DIAG_LABELS: Record<string, string> = {
  mfg_process: 'Process',
  material: 'Material',
  tolerance: 'Tolerance',
  finish: 'Finish',
  batch_size: 'Batch',
  environment: 'Environment',
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * @description Generate a branded Word document from design report data
 * and trigger a browser download.
 */
export async function exportDesignReportAsDOCX(data: DesignReportData): Promise<Blob> {
  // INTENT: If AI narration is available, use the polished prose path
  if (data.aiContent) {
    return buildAiDocx(data)
  }

  const children: DocChild[] = []

  // ── 1. Cover page (shared helper) ──
  const coverChildren = await buildCoverPage(data)
  children.push(...coverChildren)

  // ── 2. Product Overview ──
  if (data.productOverview) {
    children.push(sectionHeading('Product Overview'))
    children.push(textParagraph(data.productOverview, { after: 200 }))

    // Design brief table
    if (data.designBrief) {
      const briefEntries: [string, string][] = []
      if (data.designBrief.useCase) briefEntries.push(['Use Case', data.designBrief.useCase])
      if (data.designBrief.targetProcess) briefEntries.push(['Target Process', data.designBrief.targetProcess])
      if (data.designBrief.targetMaterial) briefEntries.push(['Target Material', data.designBrief.targetMaterial])
      if (data.designBrief.toleranceTarget) briefEntries.push(['Tolerance Target', data.designBrief.toleranceTarget])
      if (data.designBrief.quantityTarget) briefEntries.push(['Quantity Target', data.designBrief.quantityTarget])
      if (data.designBrief.complianceNotes) briefEntries.push(['Compliance', data.designBrief.complianceNotes])

      if (briefEntries.length > 0) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [headerCell('Parameter', 35), headerCell('Value', 65)],
              }),
              ...briefEntries.map(
                ([label, value]) =>
                  new TableRow({ children: [dataCell(label, 35), dataCell(value, 65)] }),
              ),
            ],
          }),
        )
        children.push(textParagraph('', { after: 200 }))
      }
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // ── 3. Research Findings ──
  if (data.researchReport) {
    children.push(sectionHeading('Research Findings'))
    const researchParagraphs = parseMarkdownToDocx(data.researchReport)
    children.push(...researchParagraphs)

    // Source citations
    if (data.sources.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 300, after: 120 },
          children: [
            new TextRun({ text: 'Sources', bold: true, size: 24, color: DARK_TEXT, font: 'Calibri' }),
          ],
        }),
      )
      for (const source of data.sources) {
        children.push(mdBulletParagraph(`${source.title} — ${source.url}`))
      }
    }

    if (data.researchModelUsed) {
      children.push(
        textParagraph(`Research model: ${data.researchModelUsed}`, { after: 120, color: MID_TEXT, italic: true, size: 18 }),
      )
    }

    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // ── 4. Module Breakdown ──
  if (data.modules.length > 0) {
    children.push(sectionHeading('Module Breakdown'))

    if (data.decompositionModelUsed) {
      children.push(
        textParagraph(`Decomposition model: ${data.decompositionModelUsed}`, { after: 200, color: MID_TEXT, italic: true, size: 18 }),
      )
    }

    // Pre-fetch all module images in parallel
    const imageUrls = data.modules.map((m) => m.imageUrl)
    const imageResults = await Promise.allSettled(
      imageUrls.map((url) => (url ? fetchImageAsBuffer(url) : Promise.resolve(null))),
    )

    for (let idx = 0; idx < data.modules.length; idx++) {
      const mod = data.modules[idx]
      const revSuffix = (mod.revisionNumber ?? 1) >= 2 ? ` (Rev ${mod.revisionNumber})` : ''
      children.push(h3(`${idx + 1}. ${mod.name}${revSuffix}`))

      // Blueprint image
      const imgResult = imageResults[idx]
      const imgBuffer = imgResult.status === 'fulfilled' ? imgResult.value : null
      if (imgBuffer) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new ImageRun({
                data: imgBuffer,
                transformation: { width: 400, height: 250 },
                type: 'png',
              }),
            ],
          }),
        )
      }

      // Purpose & description
      if (mod.purpose) children.push(textParagraph(mod.purpose, { after: 80 }))
      if (mod.description) children.push(mdBodyParagraph(mod.description))

      // Key parts
      if (mod.keyParts && mod.keyParts.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [new TextRun({ text: 'Key Parts:', bold: true, size: 22, color: DARK_TEXT, font: 'Calibri' })],
          }),
        )
        for (const part of mod.keyParts) {
          children.push(mdBulletParagraph(part))
        }
      }

      // Failure modes
      if (mod.failureModes && mod.failureModes.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [new TextRun({ text: 'Failure Modes:', bold: true, size: 22, color: DARK_TEXT, font: 'Calibri' })],
          }),
        )
        for (const fm of mod.failureModes) {
          children.push(mdBulletParagraph(fm))
        }
      }

      // Module specs table
      const specRows: [string, string][] = []
      if (mod.leadWeeks != null) specRows.push(['Lead Time', `${mod.leadWeeks} weeks`])
      if (mod.estimatedMassKg != null) specRows.push(['Estimated Mass', `${mod.estimatedMassKg} kg`])
      if (mod.inputs && mod.inputs.length > 0) specRows.push(['Inputs', mod.inputs.join(', ')])
      if (mod.outputs && mod.outputs.length > 0) specRows.push(['Outputs', mod.outputs.join(', ')])

      if (specRows.length > 0) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: specRows.map(
              ([label, value]) =>
                new TableRow({ children: [dataCell(label, 30), dataCell(value, 70)] }),
            ),
          }),
        )
      }

      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }

  // ── 5. Specifications Summary ──
  const moduleIdsWithDiag = Object.keys(data.diagnosticAnswers)
  if (moduleIdsWithDiag.length > 0) {
    children.push(sectionHeading('Specifications Summary'))

    const specHeaderCells = [headerCell('Module', 20)]
    for (const key of DIAG_KEYS) {
      specHeaderCells.push(headerCell(DIAG_LABELS[key], 13))
    }

    const specRows: TableRow[] = [new TableRow({ children: specHeaderCells })]

    for (const moduleId of moduleIdsWithDiag) {
      const mod = data.modules.find((m) => m.id === moduleId)
      const answers = data.diagnosticAnswers[moduleId]
      if (!mod || !answers) continue

      const cells = [dataCell(mod.name, 20)]
      for (const key of DIAG_KEYS) {
        cells.push(dataCell(answers[key] ?? '—', 13))
      }
      specRows.push(new TableRow({ children: cells }))
    }

    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: specRows }),
    )
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // ── 6. Cost Estimates ──
  const costModuleIds = Object.keys(data.aiCostEstimates)
  if (costModuleIds.length > 0) {
    children.push(sectionHeading('Cost Estimates'))

    const costRows: TableRow[] = [
      new TableRow({
        children: [
          headerCell('Module', 30),
          headerCell('Total / Unit', 20),
          headerCell('Confidence', 15),
          headerCell('Assumptions', 35),
        ],
      }),
    ]

    for (const moduleId of costModuleIds) {
      const mod = data.modules.find((m) => m.id === moduleId)
      const est = data.aiCostEstimates[moduleId]
      if (!mod || !est) continue

      costRows.push(
        new TableRow({
          children: [
            dataCell(mod.name, 30),
            dataCell(`£${est.totalPerUnit.toFixed(2)}`, 20),
            dataCell(est.confidence, 15),
            dataCell(est.assumptions?.join('; ') ?? '—', 35),
          ],
        }),
      )
    }

    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: costRows }),
    )
  }

  // ── 7. Engineering Intelligence ──
  if (data.engineeringIntelligence) {
    const ei = data.engineeringIntelligence

    if (ei.standards.length > 0) {
      children.push(sectionHeading('Referenced Design Standards'))
      if (ei.industryDomain) {
        children.push(textParagraph(
          `Industry domain: ${ei.industryDomain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}. The following engineering standards were referenced during design generation.`,
          { after: 120, color: MID_TEXT },
        ))
      }
      const stdRows: TableRow[] = [
        new TableRow({
          children: [
            headerCell('Code', 20),
            headerCell('Standard', 30),
            headerCell('Issuing Body', 15),
            headerCell('Summary', 35),
          ],
        }),
      ]
      const STD_MAX = 15
      if (ei.standards.length > STD_MAX) {
        children.push(textParagraph(`Showing ${STD_MAX} of ${ei.standards.length} referenced standards.`, { after: 80, color: MID_TEXT }))
      }
      for (const std of ei.standards.slice(0, STD_MAX)) {
        stdRows.push(new TableRow({
          children: [
            dataCell(std.code, 20),
            dataCell(std.name, 30),
            dataCell(std.issuingBody, 15),
            dataCell(std.summary.slice(0, 200) + (std.summary.length > 200 ? '...' : ''), 35),
          ],
        }))
      }
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: stdRows }))
    }

    if (ei.materials.length > 0) {
      children.push(sectionHeading('Material Specifications'))
      children.push(textParagraph(
        'Verified material properties from engineering handbooks — used to ensure accurate mass, thermal, and structural calculations.',
        { after: 120, color: MID_TEXT },
      ))
      const matRows: TableRow[] = [
        new TableRow({
          children: [
            headerCell('Material', 25),
            headerCell('Density (kg/m³)', 15),
            headerCell('Yield (MPa)', 15),
            headerCell('Thermal (W/m·K)', 15),
            headerCell('Cost ($/kg)', 15),
          ],
        }),
      ]
      const MAT_MAX = 15
      if (ei.materials.length > MAT_MAX) {
        children.push(textParagraph(`Showing ${MAT_MAX} of ${ei.materials.length} materials.`, { after: 80, color: MID_TEXT }))
      }
      for (const mat of ei.materials.slice(0, MAT_MAX)) {
        matRows.push(new TableRow({
          children: [
            dataCell(`${mat.code} — ${mat.name}`, 25),
            dataCell(mat.density != null ? String(mat.density) : '—', 15),
            dataCell(mat.yieldStrength != null ? String(mat.yieldStrength) : '—', 15),
            dataCell(mat.thermalConductivity != null ? String(mat.thermalConductivity) : '—', 15),
            dataCell(mat.costPerKg != null ? `$${mat.costPerKg.toFixed(2)}` : '—', 15),
          ],
        }))
      }
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: matRows }))
    }

    if (ei.processes.length > 0) {
      children.push(sectionHeading('Manufacturing Process Constraints'))
      children.push(textParagraph(
        'Achievable tolerances and minimum wall thicknesses per manufacturing process — used to ensure designs are manufacturable.',
        { after: 120, color: MID_TEXT },
      ))
      const procRows: TableRow[] = [
        new TableRow({
          children: [
            headerCell('Process', 35),
            headerCell('Typical Tolerance', 25),
            headerCell('Min Wall Thickness', 25),
          ],
        }),
      ]
      for (const proc of ei.processes) {
        procRows.push(new TableRow({
          children: [
            dataCell(proc.displayName, 35),
            dataCell(proc.toleranceTypical != null ? `±${proc.toleranceTypical}mm` : '—', 25),
            dataCell(proc.minWall != null ? `${proc.minWall}mm` : '—', 25),
          ],
        }))
      }
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: procRows }))
    }

    if (ei.hardwareCount > 0) {
      children.push(textParagraph(
        `${ei.hardwareCount} ISO metric fastener specifications referenced (bolt clearance holes, thread pitches, nut dimensions, bearing specs).`,
        { after: 120, color: MID_TEXT },
      ))
    }

    if (ei.supplierInsights && ei.supplierInsights.length > 0) {
      children.push(sectionHeading('Supplier Intelligence (Nightshift)'))
      children.push(textParagraph(
        'Real-world manufacturing capabilities aggregated from verified UK supplier data.',
        { after: 120, color: MID_TEXT },
      ))
      const supRows: TableRow[] = [
        new TableRow({
          children: [
            headerCell('Technique', 30),
            headerCell('Verified Suppliers', 20),
            headerCell('Tolerances', 25),
            headerCell('Common Materials', 25),
          ],
        }),
      ]
      for (const s of ei.supplierInsights) {
        supRows.push(new TableRow({
          children: [
            dataCell(s.technique, 30),
            dataCell(String(s.supplierCount), 20),
            dataCell(s.tolerances, 25),
            dataCell(s.materials, 25),
          ],
        }))
      }
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: supRows }))
    }
  }

  // ── 8. Stage-specific sections ──

  // Specify: Specialist Reviews
  if ((data.stage === 'specify' || data.stage === 'journey') && data.moduleReviews) {
    const reviewModuleIds = Object.keys(data.moduleReviews)
    if (reviewModuleIds.length > 0) {
      children.push(sectionHeading('Specialist Reviews'))

      for (const moduleId of reviewModuleIds) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const reviews = data.moduleReviews[moduleId]
        if (!mod || !reviews || reviews.length === 0) continue

        children.push(h3(mod.name))
        for (const review of reviews) {
          children.push(textParagraph(
            `${review.specialistName} — ${review.verdict.toUpperCase()}`,
            { after: 80 },
          ))
          if (review.summary) children.push(textParagraph(review.summary, { after: 80, color: MID_TEXT }))
          if (review.recommendations?.length > 0) {
            for (const rec of review.recommendations) {
              children.push(mdBulletParagraph(rec))
            }
          }
        }
      }

      if (data.reviewSkipped) {
        children.push(textParagraph('Note: Specialist reviews were skipped by the user.', { after: 120, italic: true, color: MID_TEXT }))
      }

      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }

  // Source: Part Classification
  if ((data.stage === 'source' || data.stage === 'journey') && data.classifiedParts && data.classifiedParts.length > 0) {
    children.push(sectionHeading('Part Classification'))

    const clsRows: TableRow[] = [
      new TableRow({
        children: [
          headerCell('Part', 25),
          headerCell('Module', 20),
          headerCell('Type', 10),
          headerCell('Confidence', 10),
          headerCell('Reasons', 35),
        ],
      }),
    ]

    for (const part of data.classifiedParts) {
      clsRows.push(
        new TableRow({
          children: [
            dataCell(part.partName, 25),
            dataCell(part.moduleName, 20),
            dataCell(part.type.toUpperCase(), 10),
            dataCell(part.confidence, 10),
            dataCell(part.reasons.join('; '), 35),
          ],
        }),
      )
    }

    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: clsRows }),
    )
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // Source: Supplier Matches
  if ((data.stage === 'source' || data.stage === 'journey') && data.supplierMatches) {
    const matchModuleIds = Object.keys(data.supplierMatches)
    if (matchModuleIds.length > 0) {
      children.push(sectionHeading('Supplier Matches'))

      for (const moduleId of matchModuleIds) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const matches = data.supplierMatches[moduleId]
        if (!mod || !matches || matches.length === 0) continue

        children.push(h3(mod.name))
        for (const match of matches.slice(0, 3)) {
          children.push(textParagraph(
            `${match.providerName} — Score: ${match.matchScore}`,
            { after: 60 },
          ))
          if (match.matchReasons.length > 0) {
            children.push(textParagraph(match.matchReasons.join(', '), { after: 80, color: MID_TEXT, size: 18 }))
          }
        }
      }

      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }

  // Source: RFQ Quotes Received
  if ((data.stage === 'source' || data.stage === 'journey') && data.rfqQuotes && data.rfqQuotes.quotes.length > 0) {
    children.push(sectionHeading('Quotes Received'))
    if (data.rfqQuotes.rfqTitle) {
      children.push(textParagraph(`RFQ: ${data.rfqQuotes.rfqTitle}`, { after: 120, color: MID_TEXT }))
    }
    const quoteRows: TableRow[] = [
      new TableRow({
        children: [
          headerCell('Supplier', 30),
          headerCell('Quoted Price', 20),
          headerCell('Lead Time', 15),
          headerCell('Proposal', 35),
        ],
      }),
    ]
    for (const q of data.rfqQuotes.quotes) {
      quoteRows.push(new TableRow({
        children: [
          dataCell(q.supplierName, 30),
          dataCell(q.price != null ? `£${q.price.toFixed(2)}` : '—', 20),
          dataCell(q.timelineWeeks != null ? `${q.timelineWeeks} weeks` : '—', 15),
          dataCell(q.proposalTitle ?? '—', 35),
        ],
      }))
    }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: quoteRows }))
  }

  // Source: Technique Recommendations
  if ((data.stage === 'source' || data.stage === 'journey') && data.techniqueRecommendations) {
    const techModuleIds = Object.keys(data.techniqueRecommendations)
    if (techModuleIds.length > 0) {
      children.push(sectionHeading('Technique Recommendations'))

      for (const moduleId of techModuleIds) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const recs = data.techniqueRecommendations[moduleId]
        if (!mod || !recs || recs.length === 0) continue

        children.push(h3(mod.name))
        for (const rec of recs.slice(0, 3)) {
          children.push(textParagraph(
            `${rec.name} — Score: ${rec.score}/100 (${rec.supplierCount} suppliers)`,
            { after: 60 },
          ))
          if (rec.reasons.length > 0) {
            for (const reason of rec.reasons) {
              children.push(mdBulletParagraph(reason))
            }
          }
        }
      }

      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }

  // Assemble: Assembly Partners, Branding, Shipping
  if (data.stage === 'assemble' || data.stage === 'journey') {
    if (data.assemblyPartners && data.assemblyPartners.length > 0) {
      children.push(sectionHeading('Assembly Partners'))

      const partnerRows: TableRow[] = [
        new TableRow({
          children: [
            headerCell('Partner', 30),
            headerCell('Score', 15),
            headerCell('Reasons', 55),
          ],
        }),
      ]

      for (const partner of data.assemblyPartners) {
        partnerRows.push(
          new TableRow({
            children: [
              dataCell(partner.name, 30),
              dataCell(String(partner.score), 15),
              dataCell(partner.reasons.join('; '), 55),
            ],
          }),
        )
      }

      children.push(
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: partnerRows }),
      )
      children.push(textParagraph('', { after: 200 }))
    }

    if (data.brandingNotes) {
      children.push(sectionHeading('Branding & Packaging'))
      children.push(textParagraph(data.brandingNotes, { after: 200 }))
    }

    if (data.shippingNotes) {
      children.push(sectionHeading('Shipping & Fulfilment'))
      children.push(textParagraph(data.shippingNotes, { after: 200 }))
    }

    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // CAD: Unified Result Summary
  if ((data.stage === 'cad' || data.stage === 'journey') && data.unifiedCadResult) {
    const result = data.unifiedCadResult
    children.push(sectionHeading('CAD Output'))

    if (result.success) {
      const cadDetails: [string, string][] = []
      if (result.stepUrl) cadDetails.push(['STEP File', result.stepUrl])
      if (result.stlUrl) cadDetails.push(['STL File', result.stlUrl])
      if (result.massGrams != null) cadDetails.push(['Mass', `${result.massGrams.toFixed(1)} g`])
      if (result.volumeMm3 != null) cadDetails.push(['Volume', `${result.volumeMm3.toFixed(1)} mm³`])
      if (result.bbox) cadDetails.push(['Bounding Box', `${result.bbox.xLen.toFixed(1)} × ${result.bbox.yLen.toFixed(1)} × ${result.bbox.zLen.toFixed(1)} mm`])

      if (cadDetails.length > 0) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [headerCell('Property', 30), headerCell('Value', 70)] }),
              ...cadDetails.map(
                ([label, value]) =>
                  new TableRow({ children: [dataCell(label, 30), dataCell(value, 70)] }),
              ),
            ],
          }),
        )
      }

      if (result.modelUsed) {
        children.push(textParagraph(`CAD model: ${result.modelUsed}`, { after: 120, color: MID_TEXT, italic: true, size: 18 }))
      }
    } else {
      children.push(textParagraph('CAD generation was attempted but did not produce a successful result.', { after: 120, color: MID_TEXT }))
    }

    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // ── 8. Footer ──
  children.push(
    new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Generated by ForgeOS', size: 18, color: MID_TEXT, italics: true, font: 'Calibri' }),
      ],
    }),
  )

  // ── Build document (shared helper) ──
  const doc = buildDocxDocument(children, data)
  return downloadDocx(doc, data)
}

// ─── Download Helper ─────────────────────────────────────────────────

async function downloadDocx(doc: Document, data: DesignReportData): Promise<Blob> {
  const blob = await Packer.toBlob(doc)
  const safeName = data.projectName.replace(/[^a-zA-Z0-9]/g, '-')
  const stageLabel = data.stage ? `-${data.stage.charAt(0).toUpperCase() + data.stage.slice(1)}` : ''
  const dateStr = new Date(data.generatedAt).toISOString().split('T')[0]
  const filename = `${safeName}${stageLabel}-Report-${dateStr}.docx`

  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)

  return blob
}

// ─── Reusable Table Builders ─────────────────────────────────────────

function buildSpecsTable(data: DesignReportData): Table | null {
  const moduleIdsWithDiag = Object.keys(data.diagnosticAnswers)
  if (moduleIdsWithDiag.length === 0) return null

  const specHeaderCells = [headerCell('Module', 20)]
  for (const key of DIAG_KEYS) {
    specHeaderCells.push(headerCell(DIAG_LABELS[key], 13))
  }

  const specRows: TableRow[] = [new TableRow({ children: specHeaderCells })]

  for (const moduleId of moduleIdsWithDiag) {
    const mod = data.modules.find((m) => m.id === moduleId)
    const answers = data.diagnosticAnswers[moduleId]
    if (!mod || !answers) continue

    const cells = [dataCell(mod.name, 20)]
    for (const key of DIAG_KEYS) {
      cells.push(dataCell(answers[key] ?? '—', 13))
    }
    specRows.push(new TableRow({ children: cells }))
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: specRows })
}

function buildCostTable(data: DesignReportData): Table | null {
  const costModuleIds = Object.keys(data.aiCostEstimates)
  if (costModuleIds.length === 0) return null

  const costRows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Module', 30),
        headerCell('Total / Unit', 20),
        headerCell('Confidence', 15),
        headerCell('Assumptions', 35),
      ],
    }),
  ]

  for (const moduleId of costModuleIds) {
    const mod = data.modules.find((m) => m.id === moduleId)
    const est = data.aiCostEstimates[moduleId]
    if (!mod || !est) continue

    costRows.push(
      new TableRow({
        children: [
          dataCell(mod.name, 30),
          dataCell(`£${est.totalPerUnit.toFixed(2)}`, 20),
          dataCell(est.confidence, 15),
          dataCell(est.assumptions?.join('; ') ?? '—', 35),
        ],
      }),
    )
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: costRows })
}

function buildReviewTable(data: DesignReportData): Table | null {
  if (!data.moduleReviews) return null
  const reviewModuleIds = Object.keys(data.moduleReviews)
  if (reviewModuleIds.length === 0) return null

  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Module', 20),
        headerCell('Specialist', 20),
        headerCell('Verdict', 10),
        headerCell('Summary', 50),
      ],
    }),
  ]

  for (const moduleId of reviewModuleIds) {
    const mod = data.modules.find((m) => m.id === moduleId)
    const reviews = data.moduleReviews[moduleId]
    if (!mod || !reviews) continue
    for (const r of reviews) {
      rows.push(
        new TableRow({
          children: [
            dataCell(mod.name, 20),
            dataCell(r.specialistName, 20),
            dataCell(r.verdict.toUpperCase(), 10),
            dataCell(r.summary ?? '', 50),
          ],
        }),
      )
    }
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows })
}

function buildClassificationTable(data: DesignReportData): Table | null {
  if (!data.classifiedParts || data.classifiedParts.length === 0) return null

  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Part', 25),
        headerCell('Module', 20),
        headerCell('Type', 10),
        headerCell('Confidence', 10),
        headerCell('Reasons', 35),
      ],
    }),
  ]

  for (const part of data.classifiedParts) {
    rows.push(
      new TableRow({
        children: [
          dataCell(part.partName, 25),
          dataCell(part.moduleName, 20),
          dataCell(part.type.toUpperCase(), 10),
          dataCell(part.confidence, 10),
          dataCell(part.reasons.join('; '), 35),
        ],
      }),
    )
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows })
}

function buildSupplierTable(data: DesignReportData): Table | null {
  if (!data.supplierMatches) return null
  const matchModuleIds = Object.keys(data.supplierMatches)
  if (matchModuleIds.length === 0) return null

  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Module', 25),
        headerCell('Supplier', 25),
        headerCell('Score', 10),
        headerCell('Reasons', 40),
      ],
    }),
  ]

  for (const moduleId of matchModuleIds) {
    const mod = data.modules.find((m) => m.id === moduleId)
    const matches = data.supplierMatches[moduleId]
    if (!mod || !matches) continue
    for (const m of matches.slice(0, 3)) {
      rows.push(
        new TableRow({
          children: [
            dataCell(mod.name, 25),
            dataCell(m.providerName, 25),
            dataCell(String(m.matchScore), 10),
            dataCell(m.matchReasons.join(', '), 40),
          ],
        }),
      )
    }
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function buildAssemblyTable(data: DesignReportData): Table | null {
  if (!data.assemblyPartners || data.assemblyPartners.length === 0) return null

  const rows: TableRow[] = [
    new TableRow({
      children: [
        headerCell('Partner', 30),
        headerCell('Score', 15),
        headerCell('Reasons', 55),
      ],
    }),
  ]

  for (const partner of data.assemblyPartners) {
    rows.push(
      new TableRow({
        children: [
          dataCell(partner.name, 30),
          dataCell(String(partner.score), 15),
          dataCell(partner.reasons.join('; '), 55),
        ],
      }),
    )
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function buildCadOutputTable(data: DesignReportData): Table | null {
  if (!data.unifiedCadResult?.success) return null

  const r = data.unifiedCadResult
  const details: [string, string][] = []
  if (r.massGrams != null) details.push(['Mass', `${r.massGrams.toFixed(1)} g`])
  if (r.volumeMm3 != null) details.push(['Volume', `${r.volumeMm3.toFixed(1)} mm³`])
  if (r.bbox) details.push(['Bounding Box', `${r.bbox.xLen.toFixed(1)} × ${r.bbox.yLen.toFixed(1)} × ${r.bbox.zLen.toFixed(1)} mm`])
  if (r.modelUsed) details.push(['Model', r.modelUsed])
  if (details.length === 0) return null

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [headerCell('Property', 30), headerCell('Value', 70)] }),
      ...details.map(
        ([label, value]) =>
          new TableRow({ children: [dataCell(label, 30), dataCell(value, 70)] }),
      ),
    ],
  })
}

// ─── Shared Builders ─────────────────────────────────────────────────

/** Build the branded cover page elements — used by both legacy and AI paths. */
async function buildCoverPage(data: DesignReportData): Promise<DocChild[]> {
  const children: DocChild[] = []

  children.push(
    new Paragraph({
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: 'FRACTIONAL FORGE',
          size: 28,
          color: MID_TEXT,
          characterSpacing: 80,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: data.projectName, bold: true, size: 48, color: DARK_TEXT, font: 'Calibri' }),
      ],
    }),
    textParagraph(
      data.stage === 'concept' ? 'Concept Report'
        : data.stage === 'specify' ? 'Specification Report'
        : data.stage === 'source' ? 'Sourcing Report'
        : data.stage === 'assemble' ? 'Assembly Report'
        : data.stage === 'cad' ? 'CAD Report'
        : data.stage === 'journey' ? 'Design Journey Report'
        : 'Engineering Design Report',
      { after: 200, color: MID_TEXT, size: 24 },
    ),
    textParagraph(
      new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      { after: 400, color: MID_TEXT },
    ),
  )

  if (data.heroImageUrl) {
    const heroBuffer = await fetchImageAsBuffer(data.heroImageUrl)
    if (heroBuffer) {
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new ImageRun({
              data: heroBuffer,
              transformation: { width: 600, height: 340 },
              type: 'png',
            }),
          ],
        }),
      )
    }
  }

  children.push(new Paragraph({ children: [new PageBreak()] }))
  return children
}

/** Build the Document wrapper — shared config between legacy and AI paths. */
function buildDocxDocument(children: DocChild[], data: DesignReportData): Document {
  return new Document({
    creator: 'ForgeOS',
    title: `${data.projectName} — Engineering Design Report`,
    description: `Design report for ${data.projectName}`,
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  })
}

// ─── AI Prose Document Builder ───────────────────────────────────────

async function buildAiDocx(data: DesignReportData): Promise<Blob> {
  const aiContent = data.aiContent!
  const children: DocChild[] = []

  // ── Cover page (shared helper) ──
  const coverChildren = await buildCoverPage(data)
  children.push(...coverChildren)

  // ── Executive Summary ──
  if (aiContent.executiveSummary) {
    children.push(sectionHeading('Executive Summary'))
    const summaryParagraphs = parseMarkdownToDocx(aiContent.executiveSummary)
    children.push(...summaryParagraphs)
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // ── Pre-fetch module images ──
  const imageUrls = data.modules.map((m) => m.imageUrl)
  const imageResults = await Promise.allSettled(
    imageUrls.map((url) => (url ? fetchImageAsBuffer(url) : Promise.resolve(null))),
  )

  // ── AI Sections ──
  for (const section of aiContent.sections) {
    // GOTCHA: Executive summary already rendered above — skip duplicate
    if (section.sectionType === 'executive-summary') continue

    children.push(sectionHeading(section.title))

    // Prose (parsed as markdown to handle bold, bullets, etc.)
    if (section.prose) {
      const proseParagraphs = parseMarkdownToDocx(section.prose)
      children.push(...proseParagraphs)
    }

    // Key points as bullets
    if (section.keyPoints?.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: 'Key Points:', bold: true, size: 22, color: DARK_TEXT, font: 'Calibri' })],
        }),
      )
      for (const point of section.keyPoints) {
        children.push(mdBulletParagraph(point))
      }
    }

    // Data table if flagged
    if (section.includeTable) {
      const table = getTableForSection(section, data)
      if (table) {
        children.push(textParagraph('', { after: 100 }))
        children.push(table)
      }
    }

    // Module image if flagged
    if (section.includeImage && section.moduleId) {
      const modIdx = data.modules.findIndex((m) => m.id === section.moduleId)
      if (modIdx >= 0) {
        const imgResult = imageResults[modIdx]
        const imgBuffer = imgResult?.status === 'fulfilled' ? imgResult.value : null
        if (imgBuffer) {
          children.push(
            new Paragraph({
              spacing: { before: 120, after: 120 },
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: { width: 400, height: 250 },
                  type: 'png',
                }),
              ],
            }),
          )
        }
      }
    }

    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  // ── Footer ──
  children.push(
    new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Generated by ForgeOS', size: 18, color: MID_TEXT, italics: true, font: 'Calibri' }),
      ],
    }),
  )

  const doc = buildDocxDocument(children, data)
  return downloadDocx(doc, data)
}

/** Map section type to the appropriate data table. */
function getTableForSection(section: AiReportSection, data: DesignReportData): Table | null {
  switch (section.sectionType) {
    case 'specifications':
      return buildSpecsTable(data)
    case 'cost-analysis':
      return buildCostTable(data)
    case 'specialist-reviews':
      return buildReviewTable(data)
    case 'part-classification':
      return buildClassificationTable(data)
    case 'supplier-analysis':
      return buildSupplierTable(data)
    case 'assembly-logistics':
      return buildAssemblyTable(data)
    case 'cad-output':
      return buildCadOutputTable(data)
    default:
      return null
  }
}
