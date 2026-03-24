/**
 * @file export-design-report-pdf.ts — Native PDF export using html2pdf.js.
 *
 * Builds a clean HTML document from DesignReportData with inline CSS,
 * then converts to PDF client-side. No server-side rendering needed.
 */

import type { DesignReportData } from "./design-report-types"

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildReportHTML(data: DesignReportData): string {
  const sections: string[] = []

  // Inline styles
  const css = `
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 24px; color: #ff4500; border-bottom: 2px solid #ff4500; padding-bottom: 8px; }
    h2 { font-size: 18px; color: #333; margin-top: 24px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
    h3 { font-size: 14px; color: #555; margin-top: 16px; }
    p { font-size: 12px; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
    th { background: #f5f5f5; text-align: left; padding: 6px 8px; border: 1px solid #ddd; font-weight: 600; }
    td { padding: 6px 8px; border: 1px solid #ddd; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 500; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-orange { background: #fff7ed; color: #9a3412; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e5e5; font-size: 10px; color: #999; }
    .meta { font-size: 10px; color: #888; }
  `

  // Cover
  sections.push(`<h1>${escapeHtml(data.projectName)}</h1>`)
  sections.push(`<p class="meta">Generated ${new Date(data.generatedAt).toLocaleDateString()} — Stage: ${data.stage}</p>`)

  // Product Overview
  if (data.productOverview && !data.productOverview.includes("synthesis failed")) {
    sections.push(`<h2>Product Overview</h2>`)
    sections.push(`<p>${escapeHtml(data.productOverview)}</p>`)
  }

  // Design Brief
  if (data.designBrief) {
    const b = data.designBrief
    const briefLines = [
      b.useCase && `Use Case: ${b.useCase}`,
      b.targetProcess && `Process: ${b.targetProcess}`,
      b.targetMaterial && `Material: ${b.targetMaterial}`,
      b.toleranceTarget && `Tolerance: ${b.toleranceTarget}`,
      b.quantityTarget && `Quantity: ${b.quantityTarget}`,
      b.complianceNotes && `Compliance: ${b.complianceNotes}`,
    ].filter(Boolean)
    if (briefLines.length > 0) {
      sections.push(`<h2>Design Brief</h2>`)
      sections.push(`<ul>${briefLines.map(l => `<li>${escapeHtml(l!)}</li>`).join("")}</ul>`)
    }
  }

  // Modules
  if (data.modules.length > 0) {
    sections.push(`<h2>Modules (${data.modules.length})</h2>`)
    sections.push(`<table><tr><th>Module</th><th>Purpose</th><th>Key Parts</th><th>Lead Time</th></tr>`)
    for (const mod of data.modules) {
      sections.push(`<tr><td><strong>${escapeHtml(mod.name)}</strong></td><td>${escapeHtml(mod.purpose?.slice(0, 150) ?? "")}</td><td>${(mod.keyParts ?? []).slice(0, 3).map(escapeHtml).join(", ")}</td><td>${mod.leadWeeks ?? "—"} wks</td></tr>`)
    }
    sections.push(`</table>`)
  }

  // Specifications
  const diagIds = Object.keys(data.diagnosticAnswers)
  if (diagIds.length > 0) {
    sections.push(`<h2>Specifications</h2>`)
    sections.push(`<table><tr><th>Module</th><th>Process</th><th>Material</th><th>Tolerance</th><th>Finish</th></tr>`)
    for (const moduleId of diagIds) {
      const mod = data.modules.find(m => m.id === moduleId)
      const a = data.diagnosticAnswers[moduleId]
      if (!mod || !a) continue
      sections.push(`<tr><td>${escapeHtml(mod.name)}</td><td>${escapeHtml(a.mfg_process ?? "—")}</td><td>${escapeHtml(a.material ?? "—")}</td><td>${escapeHtml(a.tolerance ?? "—")}</td><td>${escapeHtml(a.finish ?? "—")}</td></tr>`)
    }
    sections.push(`</table>`)
  }

  // Cost Estimates
  const costIds = Object.keys(data.aiCostEstimates)
  if (costIds.length > 0) {
    sections.push(`<h2>Cost Estimates</h2>`)
    sections.push(`<table><tr><th>Module</th><th>£/Unit</th><th>Confidence</th></tr>`)
    for (const moduleId of costIds) {
      const mod = data.modules.find(m => m.id === moduleId)
      const est = data.aiCostEstimates[moduleId]
      if (!mod || !est) continue
      sections.push(`<tr><td>${escapeHtml(mod.name)}</td><td>£${est.totalPerUnit.toFixed(2)}</td><td>${escapeHtml(est.confidence)}</td></tr>`)
    }
    sections.push(`</table>`)
  }

  // Engineering Intelligence
  if (data.engineeringIntelligence) {
    const ei = data.engineeringIntelligence
    if (ei.standards.length > 0) {
      sections.push(`<h2>Referenced Design Standards</h2>`)
      sections.push(`<table><tr><th>Code</th><th>Standard</th><th>Issuing Body</th></tr>`)
      for (const s of ei.standards.slice(0, 15)) {
        sections.push(`<tr><td>${escapeHtml(s.code)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.issuingBody)}</td></tr>`)
      }
      sections.push(`</table>`)
    }
    if (ei.materials.length > 0) {
      sections.push(`<h2>Material Specifications</h2>`)
      sections.push(`<table><tr><th>Material</th><th>Density (kg/m³)</th><th>Yield (MPa)</th><th>Cost ($/kg)</th></tr>`)
      for (const m of ei.materials.slice(0, 15)) {
        sections.push(`<tr><td>${escapeHtml(m.code)} — ${escapeHtml(m.name)}</td><td>${m.density ?? "—"}</td><td>${m.yieldStrength ?? "—"}</td><td>${m.costPerKg != null ? `$${m.costPerKg.toFixed(2)}` : "—"}</td></tr>`)
      }
      sections.push(`</table>`)
    }
    if (ei.processes.length > 0) {
      sections.push(`<h2>Process Constraints</h2>`)
      sections.push(`<table><tr><th>Process</th><th>Tolerance</th><th>Min Wall</th></tr>`)
      for (const p of ei.processes) {
        sections.push(`<tr><td>${escapeHtml(p.displayName)}</td><td>±${p.toleranceTypical ?? "—"}mm</td><td>${p.minWall ?? "—"}mm</td></tr>`)
      }
      sections.push(`</table>`)
    }
  }

  // Footer
  sections.push(`<div class="footer">Generated by ForgeOS — Fractional Forge</div>`)

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${sections.join("\n")}</body></html>`
}

/**
 * Exports a design report as PDF using html2pdf.js (client-side).
 */
export async function exportDesignReportAsPDF(data: DesignReportData): Promise<Blob> {
  const html = buildReportHTML(data)

  // Dynamic import — html2pdf.js is a client-side library
  const html2pdf = (await import("html2pdf.js")).default

  const filename = `${data.projectName.replace(/[^a-zA-Z0-9]/g, "_")}_${data.stage}_report.pdf`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker = (html2pdf() as any)
    .set({
      margin: [15, 15, 15, 15],
      filename,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    })
    .from(html)

  // Generate blob for upload + manual browser download
  // DECISION: Don't call worker.save() — it triggers a second download prompt.
  // Instead, do a manual download via createObjectURL (consistent with DOCX/PPTX paths).
  let blob = await worker.outputPdf("blob")
  if (!(blob instanceof Blob)) {
    blob = new Blob([blob], { type: 'application/pdf' })
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)

  return blob
}
