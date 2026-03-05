import { createCadLabRfqAction } from "../cad-lab-rfq"
import { computeCadLabQualityScorecard } from "@/lib/cad-lab-quality-scorecard"
import { CAD_LAB_GOLDEN_BENCHMARKS } from "@/lib/cad-lab-golden-benchmarks"

jest.mock("../rfq", () => ({
  createNewRFQ: jest.fn(),
}))

import { createNewRFQ } from "../rfq"

const mockedCreateNewRFQ = createNewRFQ as jest.MockedFunction<typeof createNewRFQ>

describe("cad-lab RFQ golden benchmarks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each(CAD_LAB_GOLDEN_BENCHMARKS)(
    "meets quality and RFQ thresholds for $id",
    async (benchmark) => {
      mockedCreateNewRFQ.mockResolvedValueOnce({
        data: { id: `rfq-${benchmark.id}`, broadcastCount: 0 },
        error: null,
      })

      const qualityScorecard = computeCadLabQualityScorecard(
        benchmark.modules,
        benchmark.diagnosticAnswers,
      )
      expect(qualityScorecard.overallScore).toBeGreaterThanOrEqual(
        benchmark.expectations.minOverallScore,
      )
      expect(qualityScorecard.rfqReadinessScore).toBeGreaterThanOrEqual(
        benchmark.expectations.minRfqReadinessScore,
      )

      const result = await createCadLabRfqAction({
        projectName: benchmark.projectName,
        modules: benchmark.modules,
        diagnosticAnswers: benchmark.diagnosticAnswers,
        designBrief: benchmark.designBrief,
        assumptionNotes: benchmark.assumptionNotes,
      })

      expect(result).toEqual({ rfqId: `rfq-${benchmark.id}` })
      expect(mockedCreateNewRFQ).toHaveBeenCalledTimes(1)

      const payload = mockedCreateNewRFQ.mock.calls[0][0]
      expect(payload.specifications?.attachments?.length).toBeGreaterThanOrEqual(
        benchmark.expectations.minAttachmentCount,
      )
      expect(payload.specifications?.quantity).toBe(
        benchmark.expectations.expectedQuantity,
      )
      expect(
        payload.specifications?.custom_fields?.quote_ready_module_count,
      ).toBeGreaterThanOrEqual(benchmark.expectations.minQuoteReadyModules)
      expect(payload.specifications?.custom_fields?.quality_scorecard).toBeDefined()
      expect(payload.specifications?.description).toContain("Quality scorecard — CAD")
      expect(payload.specifications?.description).toContain("Design intent:")
    },
  )
})
