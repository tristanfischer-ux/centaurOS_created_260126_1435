import type { CadLabDesignBrief, CadLabModule } from "@/lib/cad-lab-types"

export interface CadLabGoldenBenchmarkCase {
  id: string
  projectName: string
  designBrief: CadLabDesignBrief
  assumptionNotes: string
  modules: CadLabModule[]
  diagnosticAnswers: Record<string, Record<string, string>>
  expectations: {
    minOverallScore: number
    minRfqReadinessScore: number
    minQuoteReadyModules: number
    minAttachmentCount: number
    expectedQuantity: number
  }
}

function makeDrawingPackage(baseUrl: string, includeStl = true, includeManifest = true) {
  return {
    revision: "A",
    generatedAt: "2026-01-01T00:00:00.000Z",
    title: `${baseUrl.split("/").pop() || "module"} package`,
    manifestUrl: includeManifest ? `${baseUrl}/manifest.json` : undefined,
    files: [
      {
        name: "part.step",
        url: `${baseUrl}/part.step`,
        mimeType: "application/step",
      },
      ...(includeStl
        ? [
            {
              name: "part.stl",
              url: `${baseUrl}/part.stl`,
              mimeType: "model/stl",
            },
          ]
        : []),
    ],
  }
}

function makeGeneratedModule(
  id: string,
  name: string,
  baseUrl: string,
  options?: { includeStl?: boolean; includeManifest?: boolean; includeDfm?: boolean },
): CadLabModule {
  return {
    id,
    name,
    purpose: `${name} purpose`,
    inputs: [],
    outputs: [],
    keyParts: [name.toLowerCase()],
    leadWeeks: 4,
    description: `${name} description`,
    whyItMatters: `${name} is critical`,
    failureModes: [],
    unknowns: [],
    status: "generated",
    result: {
      success: true,
      bbox: { xLen: 120, yLen: 80, zLen: 40 },
      massGrams: 320,
      ...(options?.includeDfm === false
        ? {}
        : {
            dfm: {
              printable: true,
              issues: [],
              estimatedPrintTimeMin: 80,
              estimatedMaterialG: 140,
              supportVolumePct: 12,
              compatiblePrinters: ["Prusa MK4"],
            },
          }),
      drawingPackage: makeDrawingPackage(
        baseUrl,
        options?.includeStl ?? true,
        options?.includeManifest ?? true,
      ),
    },
  }
}

const completeDiagnostics = (
  material: string,
  batchSize: string,
): Record<string, string> => ({
  mfg_process: "CNC machining",
  material,
  tolerance: "±0.1 mm",
  finish: "Anodized",
  batch_size: batchSize,
  environment: "Outdoor, 0-45C",
})

export const CAD_LAB_GOLDEN_BENCHMARKS: CadLabGoldenBenchmarkCase[] = [
  {
    id: "precision-gearbox",
    projectName: "Precision Gearbox Housing",
    designBrief: {
      useCase: "High-duty gearbox enclosure for compact actuators",
      targetProcess: "CNC machining",
      targetMaterial: "Aluminium 7075",
      toleranceTarget: "±0.05 mm on bearing seats",
      quantityTarget: "500-1500",
      complianceNotes: "RoHS, REACH",
    },
    assumptionNotes: "Bearing interface follows 608 seat standard.",
    modules: [
      makeGeneratedModule(
        "housing",
        "Housing",
        "https://benchmarks.example.com/precision-gearbox/housing",
      ),
      makeGeneratedModule(
        "cover",
        "Cover Plate",
        "https://benchmarks.example.com/precision-gearbox/cover",
      ),
    ],
    diagnosticAnswers: {
      housing: completeDiagnostics("Aluminium 7075", "500-1500"),
      cover: completeDiagnostics("Aluminium 7075", "800-1200"),
    },
    expectations: {
      minOverallScore: 95,
      minRfqReadinessScore: 95,
      minQuoteReadyModules: 2,
      minAttachmentCount: 6,
      expectedQuantity: 1000,
    },
  },
  {
    id: "medical-pump",
    projectName: "Sterile Medical Pump Cartridge",
    designBrief: {
      useCase: "Single-use fluid pump cartridge",
      targetProcess: "Injection molding + CNC post-op",
      targetMaterial: "PEEK + 316L",
      toleranceTarget: "±0.08 mm on valve seats",
      quantityTarget: "1k-3k",
      complianceNotes: "ISO 13485, biocompatibility",
    },
    assumptionNotes: "Valve diaphragm thickness fixed to 0.4 mm baseline.",
    modules: [
      makeGeneratedModule(
        "pump_body",
        "Pump Body",
        "https://benchmarks.example.com/medical-pump/pump-body",
      ),
      makeGeneratedModule(
        "impeller",
        "Impeller",
        "https://benchmarks.example.com/medical-pump/impeller",
      ),
      makeGeneratedModule(
        "sensor_shroud",
        "Sensor Shroud",
        "https://benchmarks.example.com/medical-pump/sensor-shroud",
        { includeStl: false, includeDfm: false },
      ),
    ],
    diagnosticAnswers: {
      pump_body: {
        ...completeDiagnostics("PEEK", "pilot 1k-2k"),
        mfg_process: "Injection molding",
      },
      impeller: {
        ...completeDiagnostics("316L", "scale 3k"),
        mfg_process: "CNC machining",
      },
      sensor_shroud: {
        ...completeDiagnostics("PEEK", "800-1200"),
        finish: "",
      },
    },
    expectations: {
      minOverallScore: 80,
      minRfqReadinessScore: 80,
      minQuoteReadyModules: 2,
      minAttachmentCount: 8,
      expectedQuantity: 3000,
    },
  },
  {
    id: "ev-charger",
    projectName: "EV Charger Field Enclosure",
    designBrief: {
      useCase: "Outdoor AC charger enclosure with thermal shielding",
      targetProcess: "Sheet metal + CNC finishing",
      targetMaterial: "Powder-coated aluminium",
      toleranceTarget: "±0.2 mm overall, ±0.1 mm for mating rails",
      quantityTarget: "2k-5k",
      complianceNotes: "IP65, UL 2594",
    },
    assumptionNotes: "Cable gland pattern follows existing v3 infrastructure.",
    modules: [
      makeGeneratedModule(
        "outer_shell",
        "Outer Shell",
        "https://benchmarks.example.com/ev-charger/outer-shell",
        { includeDfm: false },
      ),
      makeGeneratedModule(
        "mount_rail",
        "Mount Rail",
        "https://benchmarks.example.com/ev-charger/mount-rail",
      ),
    ],
    diagnosticAnswers: {
      outer_shell: {
        ...completeDiagnostics("Aluminium 5052", "pilot 100-300, ramp 2k, annual 5,000 units"),
        mfg_process: "Sheet metal",
      },
      mount_rail: {
        ...completeDiagnostics("Aluminium 6061", "500-900"),
        mfg_process: "CNC machining",
      },
    },
    expectations: {
      minOverallScore: 90,
      minRfqReadinessScore: 95,
      minQuoteReadyModules: 2,
      minAttachmentCount: 6,
      expectedQuantity: 5000,
    },
  },
]
