import type { CadLabModule } from "@/lib/cad-lab-types"
import {
  getModuleArtifactReadiness,
  isDiagnosticsComplete,
} from "@/lib/cad-lab-readiness"

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
    status: "generated",
    ...overrides,
  }
}

describe("cad-lab-readiness helpers", () => {
  it("computes artifact readiness and missing artifacts", () => {
    const mod = makeModule({
      result: {
        success: true,
        drawingPackage: {
          revision: "A",
          generatedAt: "2026-01-01T00:00:00.000Z",
          title: "Package",
          manifestUrl: "https://example.com/manifest.json",
          files: [
            {
              name: "module.step",
              url: "https://example.com/module.step",
              mimeType: "application/step",
            },
          ],
        },
      },
    })

    expect(getModuleArtifactReadiness(mod)).toEqual({
      hasStep: true,
      hasStl: false,
      hasManifest: true,
      missingArtifacts: ["STL"],
      scorePct: 67,
    })
  })

  it("validates diagnostic completeness with required fields", () => {
    expect(
      isDiagnosticsComplete({
        mfg_process: "CNC",
        material: "Steel",
        tolerance: "±0.1",
        finish: "Anodized",
        batch_size: "100-500",
        environment: "Outdoor",
      }),
    ).toBe(true)

    expect(
      isDiagnosticsComplete({
        mfg_process: "CNC",
        material: "Steel",
        tolerance: "±0.1",
        finish: "Anodized",
        batch_size: "100-500",
      } as Record<string, string>),
    ).toBe(false)
  })
})
