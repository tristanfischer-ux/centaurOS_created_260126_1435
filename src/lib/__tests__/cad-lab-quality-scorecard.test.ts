import type { CadLabModule } from "@/lib/cad-lab-types"
import { computeCadLabQualityScorecard } from "@/lib/cad-lab-quality-scorecard"

function makeModule(overrides: Partial<CadLabModule>): CadLabModule {
  return {
    id: "module",
    name: "Module",
    purpose: "Purpose",
    inputs: [],
    outputs: [],
    keyParts: [],
    leadWeeks: 4,
    description: "",
    whyItMatters: "",
    failureModes: [],
    unknowns: [],
    status: "pending",
    ...overrides,
  }
}

describe("computeCadLabQualityScorecard", () => {
  it("computes quality scores and blockers from mixed module readiness", () => {
    const modules: CadLabModule[] = [
      makeModule({
        id: "frame",
        name: "Frame",
        status: "generated",
        result: {
          success: true,
          bbox: { xLen: 100, yLen: 80, zLen: 40 },
          dfm: {
            printable: true,
            issues: [],
            estimatedPrintTimeMin: 120,
            estimatedMaterialG: 200,
            supportVolumePct: 10,
            compatiblePrinters: ["X1"],
          },
          drawingPackage: {
            revision: "A",
            generatedAt: "2026-01-01T00:00:00.000Z",
            title: "Frame Pack",
            manifestUrl: "https://example.com/frame/manifest.json",
            files: [
              {
                name: "frame.step",
                url: "https://example.com/frame/frame.step",
                mimeType: "application/step",
              },
              {
                name: "frame.stl",
                url: "https://example.com/frame/frame.stl",
                mimeType: "model/stl",
              },
            ],
          },
        },
      }),
      makeModule({
        id: "bracket",
        name: "Bracket",
        status: "generated",
        result: {
          success: true,
          drawingPackage: {
            revision: "A",
            generatedAt: "2026-01-01T00:00:00.000Z",
            title: "Bracket Pack",
            manifestUrl: "https://example.com/bracket/manifest.json",
            files: [
              {
                name: "bracket.step",
                url: "https://example.com/bracket/bracket.step",
                mimeType: "application/step",
              },
            ],
          },
        },
      }),
      makeModule({
        id: "cover",
        name: "Cover",
        status: "pending",
      }),
    ]

    const diagnostics = {
      frame: {
        mfg_process: "CNC",
        material: "Aluminium",
        tolerance: "±0.1",
        finish: "Anodized",
        batch_size: "100-500",
        environment: "Outdoor",
      },
      bracket: {
        mfg_process: "Laser",
      },
    }

    expect(computeCadLabQualityScorecard(modules, diagnostics)).toEqual({
      cadValidityScore: 50,
      drawingCompletenessScore: 43,
      rfqReadinessScore: 48,
      overallScore: 47,
      blockers: [
        "1 module(s) not generated",
        "1 generated module(s) missing DFM analysis",
        "2 module(s) missing procurement diagnostics",
        "1 generated module(s) missing STEP/STL/manifest",
      ],
    })
  })
})
