import { createCadLabRfqAction } from "../cad-lab-rfq"

jest.mock("../rfq", () => ({
  createNewRFQ: jest.fn(),
}))

import { createNewRFQ } from "../rfq"

const mockedCreateNewRFQ = createNewRFQ as jest.MockedFunction<typeof createNewRFQ>

describe("createCadLabRfqAction", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("rejects when no generated modules exist", async () => {
    const res = await createCadLabRfqAction({
      projectName: "Test Project",
      modules: [
        {
          id: "m1",
          name: "Module 1",
          purpose: "Pending",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 4,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "pending",
        },
      ],
      diagnosticAnswers: {},
    })

    expect(res).toEqual({
      error: "At least one generated module is required before creating an RFQ.",
    })
    expect(mockedCreateNewRFQ).not.toHaveBeenCalled()
  })

  it("rejects when generated modules have no CAD artifacts", async () => {
    const res = await createCadLabRfqAction({
      projectName: "Artifactless Project",
      modules: [
        {
          id: "m1",
          name: "Module 1",
          purpose: "Generated but no files",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 4,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
          },
        },
      ],
      diagnosticAnswers: {},
    })

    expect(res).toEqual({
      error:
        "RFQ package is incomplete — Module 1: missing STEP, STL, manifest. Generate CAD with drawing packages before creating an RFQ.",
    })
    expect(mockedCreateNewRFQ).not.toHaveBeenCalled()
  })

  it("rejects when artifacts exist but no module is quote-ready", async () => {
    const res = await createCadLabRfqAction({
      projectName: "Missing STL Project",
      modules: [
        {
          id: "m1",
          name: "Module 1",
          purpose: "Has step only",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 4,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
            drawingPackage: {
              revision: "A",
              generatedAt: "2026-01-01T00:00:00.000Z",
              title: "Module Package",
              manifestUrl: "https://example.com/m1/manifest.json",
              files: [
                {
                  name: "m1.step",
                  url: "https://example.com/m1/m1.step",
                  mimeType: "application/step",
                },
              ],
            },
          },
        },
      ],
      diagnosticAnswers: {},
    })

    expect(res).toEqual({
      error:
        "RFQ package is incomplete — Module 1: missing STL. Generate CAD with drawing packages before creating an RFQ.",
    })
    expect(mockedCreateNewRFQ).not.toHaveBeenCalled()
  })

  it("builds RFQ payload from drawing package artifacts", async () => {
    mockedCreateNewRFQ.mockResolvedValue({
      data: { id: "rfq-123" },
      error: null,
    })

    const res = await createCadLabRfqAction({
      projectName: "Orbital Drone Frame",
      deadline: "2027-01-15",
      designBrief: {
        useCase: "High-speed aerial frame",
        targetProcess: "CNC machining",
        targetMaterial: "Aluminium 6061",
        toleranceTarget: "±0.1 mm",
        quantityTarget: "100-1000",
        complianceNotes: "RoHS",
      },
      assumptionNotes: "Arm interfaces follow v2 mounting pattern",
      diagnosticAnswers: {
        frame: {
          material: "Aluminium",
          batch_size: "100-1000 (pilot)",
        },
      },
      modules: [
        {
          id: "frame",
          name: "Frame",
          purpose: "Load-bearing structure",
          inputs: ["power"],
          outputs: ["mount points"],
          keyParts: ["arm", "hub"],
          leadWeeks: 6,
          description: "frame",
          whyItMatters: "critical",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
            bbox: { xLen: 200, yLen: 180, zLen: 70 },
            massGrams: 350,
            drawingPackage: {
              revision: "A",
              generatedAt: "2026-01-01T00:00:00.000Z",
              title: "Frame Drawing Package",
              manifestUrl: "https://example.com/manifest.json",
              files: [
                {
                  name: "frame.step",
                  url: "https://example.com/frame.step",
                  mimeType: "application/step",
                  sizeKb: 512,
                },
                {
                  name: "frame.stl",
                  url: "https://example.com/frame.stl",
                  mimeType: "model/stl",
                  sizeKb: 256,
                },
              ],
            },
          },
        },
      ],
    })

    expect(res).toEqual({ rfqId: "rfq-123" })
    expect(mockedCreateNewRFQ).toHaveBeenCalledTimes(1)

    const payload = mockedCreateNewRFQ.mock.calls[0][0]
    expect(payload.title).toContain("Orbital Drone Frame")
    expect(payload.rfq_type).toBe("custom")
    expect(payload.category).toBe("Products")
    expect(payload.specifications?.attachments).toEqual([
      "https://example.com/frame.step",
      "https://example.com/frame.stl",
      "https://example.com/manifest.json",
    ])
    expect(payload.specifications?.materials).toEqual(["Aluminium"])
    expect(payload.specifications?.quantity).toBe(550)
    expect(payload.specifications?.custom_fields?.package_readiness_score_pct).toBe(60)
    expect(payload.specifications?.custom_fields?.quote_ready_module_count).toBe(1)
    expect(payload.specifications?.custom_fields?.design_brief).toEqual({
      useCase: "High-speed aerial frame",
      targetProcess: "CNC machining",
      targetMaterial: "Aluminium 6061",
      toleranceTarget: "±0.1 mm",
      quantityTarget: "100-1000",
      complianceNotes: "RoHS",
    })
    expect(payload.specifications?.custom_fields?.assumption_notes).toBe(
      "Arm interfaces follow v2 mounting pattern",
    )
    expect(payload.specifications?.description).toContain(
      "- Use case: High-speed aerial frame",
    )
    expect(payload.specifications?.description).toContain(
      "- Assumptions: Arm interfaces follow v2 mounting pattern",
    )
    expect(payload.specifications?.description).toContain(
      "Outstanding blockers:",
    )
    expect(payload.specifications?.description).toContain(
      "Frame: Diagnostics incomplete",
    )
    expect(payload.specifications?.description).toContain(
      "Quality scorecard — CAD 80%, Drawings 100%, RFQ 65%, Overall 82%",
    )
    expect(payload.specifications?.description).toContain("Scorecard blockers:")
    expect(payload.specifications?.description).toContain(
      "1 generated module(s) missing DFM analysis",
    )
    expect(payload.specifications?.custom_fields?.module_blockers).toEqual([
      {
        moduleId: "frame",
        moduleName: "Frame",
        blockers: ["Diagnostics incomplete"],
      },
    ])
    expect(payload.specifications?.custom_fields?.quality_scorecard).toEqual({
      cadValidityScore: 80,
      drawingCompletenessScore: 100,
      rfqReadinessScore: 65,
      overallScore: 82,
      blockers: [
        "1 generated module(s) missing DFM analysis",
        "1 module(s) missing procurement diagnostics",
      ],
      validationPassCount: 1,
      validationFailCount: 0,
    })
    expect(payload.specifications?.custom_fields?.readiness_checks).toEqual([
      {
        moduleId: "frame",
        moduleName: "Frame",
        diagnosticsComplete: false,
        hasStep: true,
        hasStl: true,
        hasManifest: true,
        scorePct: 60,
      },
    ])
  })

  it("parses batch ranges with commas and suffixes", async () => {
    mockedCreateNewRFQ.mockResolvedValue({
      data: { id: "rfq-quantity" },
      error: null,
    })

    const res = await createCadLabRfqAction({
      projectName: "Batch Quantity Parsing",
      diagnosticAnswers: {
        m1: {
          batch_size: "1,000-5,000",
          material: "Steel",
        },
        m2: {
          batch_size: "2k-4k",
          material: "Steel",
        },
      },
      modules: [
        {
          id: "m1",
          name: "Module A",
          purpose: "A",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 3,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
            drawingPackage: {
              revision: "A",
              generatedAt: "2026-01-01T00:00:00.000Z",
              title: "A",
              manifestUrl: "https://example.com/a/manifest.json",
              files: [
                {
                  name: "a.step",
                  url: "https://example.com/a/a.step",
                  mimeType: "application/step",
                },
                {
                  name: "a.stl",
                  url: "https://example.com/a/a.stl",
                  mimeType: "model/stl",
                },
              ],
            },
          },
        },
        {
          id: "m2",
          name: "Module B",
          purpose: "B",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 3,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
            drawingPackage: {
              revision: "A",
              generatedAt: "2026-01-01T00:00:00.000Z",
              title: "B",
              manifestUrl: "https://example.com/b/manifest.json",
              files: [
                {
                  name: "b.step",
                  url: "https://example.com/b/b.step",
                  mimeType: "application/step",
                },
                {
                  name: "b.stl",
                  url: "https://example.com/b/b.stl",
                  mimeType: "model/stl",
                },
              ],
            },
          },
        },
      ],
    })

    expect(res).toEqual({ rfqId: "rfq-quantity" })
    const payload = mockedCreateNewRFQ.mock.calls[0][0]
    expect(payload.specifications?.quantity).toBe(3000)
  })

  it("uses strongest quantity hint from mixed batch text", async () => {
    mockedCreateNewRFQ.mockResolvedValue({
      data: { id: "rfq-mixed-quantity" },
      error: null,
    })

    const res = await createCadLabRfqAction({
      projectName: "Mixed Quantity Parsing",
      diagnosticAnswers: {
        m1: {
          batch_size: "pilot 100-300, ramp 2k, annual 5,000 units",
          material: "Steel",
        },
      },
      modules: [
        {
          id: "m1",
          name: "Module A",
          purpose: "A",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 3,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
            drawingPackage: {
              revision: "A",
              generatedAt: "2026-01-01T00:00:00.000Z",
              title: "A",
              manifestUrl: "https://example.com/a/manifest.json",
              files: [
                {
                  name: "a.step",
                  url: "https://example.com/a/a.step",
                  mimeType: "application/step",
                },
                {
                  name: "a.stl",
                  url: "https://example.com/a/a.stl",
                  mimeType: "model/stl",
                },
              ],
            },
          },
        },
      ],
    })

    expect(res).toEqual({ rfqId: "rfq-mixed-quantity" })
    const payload = mockedCreateNewRFQ.mock.calls[0][0]
    expect(payload.specifications?.quantity).toBe(5000)
  })

  it("deduplicates and filters invalid artifact URLs", async () => {
    mockedCreateNewRFQ.mockResolvedValue({
      data: { id: "rfq-artifacts" },
      error: null,
    })

    const res = await createCadLabRfqAction({
      projectName: "Artifact URL Hygiene",
      diagnosticAnswers: {},
      modules: [
        {
          id: "m1",
          name: "Module A",
          purpose: "A",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 3,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
            drawingPackage: {
              revision: "A",
              generatedAt: "2026-01-01T00:00:00.000Z",
              title: "A",
              manifestUrl: "https://example.com/shared/manifest.json",
              files: [
                {
                  name: "a.step",
                  url: "https://example.com/shared/model.step",
                  mimeType: "application/step",
                },
                {
                  name: "a.stl",
                  url: "https://example.com/shared/model.stl",
                  mimeType: "model/stl",
                },
                {
                  name: "invalid.stl",
                  url: "blob:local-preview",
                  mimeType: "model/stl",
                },
              ],
            },
          },
        },
        {
          id: "m2",
          name: "Module B",
          purpose: "B",
          inputs: [],
          outputs: [],
          keyParts: [],
          leadWeeks: 3,
          description: "",
          whyItMatters: "",
          failureModes: [],
          unknowns: [],
          status: "generated",
          result: {
            success: true,
            drawingPackage: {
              revision: "A",
              generatedAt: "2026-01-01T00:00:00.000Z",
              title: "B",
              manifestUrl: "https://example.com/shared/manifest.json",
              files: [
                {
                  name: "b.step",
                  url: "https://example.com/shared/model.step",
                  mimeType: "application/step",
                },
                {
                  name: "b.stl",
                  url: "https://example.com/shared/model.stl",
                  mimeType: "model/stl",
                },
              ],
            },
          },
        },
      ],
    })

    expect(res).toEqual({ rfqId: "rfq-artifacts" })
    const payload = mockedCreateNewRFQ.mock.calls[0][0]
    expect(payload.specifications?.attachments).toEqual([
      "https://example.com/shared/model.step",
      "https://example.com/shared/model.stl",
      "https://example.com/shared/manifest.json",
    ])
    expect(payload.specifications?.custom_fields?.module_blockers).toEqual([
      {
        moduleId: "m1",
        moduleName: "Module A",
        blockers: ["Diagnostics incomplete"],
      },
      {
        moduleId: "m2",
        moduleName: "Module B",
        blockers: ["Diagnostics incomplete"],
      },
    ])
    expect(payload.specifications?.custom_fields?.quality_scorecard).toEqual({
      cadValidityScore: 60,
      drawingCompletenessScore: 100,
      rfqReadinessScore: 65,
      overallScore: 75,
      blockers: [
        "2 generated module(s) missing DFM analysis",
        "2 module(s) missing procurement diagnostics",
      ],
      validationPassCount: 2,
      validationFailCount: 0,
    })
  })
})
