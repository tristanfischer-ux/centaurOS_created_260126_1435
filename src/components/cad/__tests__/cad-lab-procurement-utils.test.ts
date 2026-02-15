import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { computeRfqReadiness } from "@/components/cad/cad-lab-procurement-utils"
import {
  buildDrawingPackageSummary,
  buildSupplierPacketMarkdown,
  buildModuleBomCsv,
} from "@/components/cad/cad-lab-drawing-package"

function makeModule(overrides: Partial<CadLabModule>): CadLabModule {
  return {
    id: "module",
    name: "Module",
    purpose: "Purpose",
    inputs: [],
    outputs: [],
    keyParts: [],
    leadWeeks: 4,
    description: "Description",
    whyItMatters: "Why it matters",
    failureModes: [],
    unknowns: [],
    status: "pending",
    ...overrides,
  }
}

describe("Cad Lab procurement utility functions", () => {
  const modules: CadLabModule[] = [
    makeModule({
      id: "frame",
      name: "Frame",
      purpose: "Primary load-bearing structure",
      keyParts: ["arm", "hub"],
      status: "generated",
      result: {
        success: true,
        bbox: { xLen: 120, yLen: 100, zLen: 40 },
        massGrams: 820,
        drawingPackage: {
          revision: "A",
          generatedAt: "2026-01-01T00:00:00.000Z",
          title: "Frame Package",
          manifestUrl: "https://example.com/frame/manifest.json",
          files: [
            {
              name: "frame.step",
              url: "https://example.com/frame/frame.step",
              mimeType: "application/step",
              sizeKb: 420,
            },
            {
              name: "frame.stl",
              url: "https://example.com/frame/frame.stl",
              mimeType: "model/stl",
              sizeKb: 180,
            },
          ],
        },
      },
    }),
    makeModule({
      id: "bracket",
      name: "Bracket",
      purpose: "Mounting support",
      keyParts: [],
      status: "generated",
      result: {
        success: true,
        bbox: { xLen: 45, yLen: 20, zLen: 10 },
        massGrams: 90,
        drawingPackage: {
          revision: "A",
          generatedAt: "2026-01-01T00:00:00.000Z",
          title: "Bracket Package",
          manifestUrl: "https://example.com/bracket/manifest.json",
          files: [
            {
              name: "bracket.step",
              url: "https://example.com/bracket/bracket.step",
              mimeType: "application/step",
              sizeKb: 90,
            },
          ],
        },
      },
    }),
    makeModule({
      id: "cover",
      name: "Cover",
      purpose: "Protective shell",
      status: "pending",
    }),
  ]

  const diagnosticAnswers: DiagnosticAnswers = {
    frame: {
      mfg_process: "CNC milling",
      material: "Aluminium 6061",
      tolerance: "±0.05 mm",
      finish: "Anodized",
      batch_size: "100-200",
      environment: "Outdoor",
    },
    bracket: {
      mfg_process: "Laser cut",
      material: "Steel",
    },
  }

  it("computes weighted RFQ readiness and blockers", () => {
    const readiness = computeRfqReadiness(modules, diagnosticAnswers)

    expect(readiness.totalScore).toBe(48)
    expect(readiness.generatedCount).toBe(2)
    expect(readiness.diagnosticsComplete).toBe(1)
    expect(readiness.artifactComplete).toBe(1)
    expect(readiness.quoteReadyModuleCount).toBe(1)
    expect(readiness.gaps).toEqual([
      "1 module(s) still need generated geometry",
      "2 module(s) missing procurement diagnostics",
      "2 module(s) missing full STEP/STL/manifest package",
    ])
    expect(readiness.moduleDetails).toEqual([
      {
        moduleId: "frame",
        moduleName: "Frame",
        generated: true,
        missingDiagnostics: [],
        missingArtifacts: [],
        quoteReady: true,
      },
      {
        moduleId: "bracket",
        moduleName: "Bracket",
        generated: true,
        missingDiagnostics: ["tolerance", "finish", "batch_size", "environment"],
        missingArtifacts: ["STL"],
        quoteReady: false,
      },
      {
        moduleId: "cover",
        moduleName: "Cover",
        generated: false,
        missingDiagnostics: [
          "mfg_process",
          "material",
          "tolerance",
          "finish",
          "batch_size",
          "environment",
        ],
        missingArtifacts: ["STEP", "STL", "Manifest"],
        quoteReady: false,
      },
    ])
  })

  it("builds drawing package summary with readiness and files", () => {
    const summary = buildDrawingPackageSummary(modules)

    expect(summary.generatedModules).toHaveLength(2)
    expect(summary.files).toHaveLength(3)
    expect(summary.completeModules).toBe(1)
    expect(summary.readinessPct).toBe(50)
    expect(summary.moduleManifests).toHaveLength(2)
    expect(summary.moduleCoverage).toEqual([
      {
        moduleId: "frame",
        moduleName: "Frame",
        hasStep: true,
        hasStl: true,
        hasManifest: true,
        scorePct: 100,
        missingArtifacts: [],
      },
      {
        moduleId: "bracket",
        moduleName: "Bracket",
        hasStep: true,
        hasStl: false,
        hasManifest: true,
        scorePct: 67,
        missingArtifacts: ["STL"],
      },
    ])
  })

  it("builds supplier markdown packet with module and artifact details", () => {
    const summary = buildDrawingPackageSummary(modules)
    const markdown = buildSupplierPacketMarkdown(
      "Autonomous Rover Chassis",
      modules,
      summary,
      "2026-02-01T10:00:00.000Z",
    )

    expect(markdown).toContain("Project: Autonomous Rover Chassis")
    expect(markdown).toContain("Generated: 2026-02-01T10:00:00.000Z")
    expect(markdown).toContain("| Frame | Primary load-bearing structure |")
    expect(markdown).toContain("[frame.step](https://example.com/frame/frame.step)")
    expect(markdown).toContain("Frame: https://example.com/frame/manifest.json")
    expect(markdown).toContain("Frame — 100% (complete)")
    expect(markdown).toContain("Bracket — 67% (missing STL)")
  })

  it("builds module BOM CSV with part-level rows", () => {
    const summary = buildDrawingPackageSummary(modules)
    const csv = buildModuleBomCsv(summary)
    const lines = csv.split("\n")

    expect(lines[0]).toBe(
      "module_id,module_name,part_name,module_purpose,lead_weeks,envelope,material_hint,artifact_count,artifact_readiness_pct,missing_artifacts",
    )
    expect(lines).toHaveLength(4)
    expect(csv).toContain("\"frame\",\"Frame\",\"arm\"")
    expect(csv).toContain("\"bracket\",\"Bracket\",\"module-assembly\"")
    expect(csv).toContain(",\"67\",\"STL\"")
  })
})
