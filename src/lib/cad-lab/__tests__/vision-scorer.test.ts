/**
 * @file vision-scorer.test.ts — Tests for P2 vision-based render scoring
 */

import { scoreRenderVision } from "../vision-scorer"

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  process.env.OPENAI_API_KEY = "test-key"
})

afterEach(() => {
  delete process.env.OPENAI_API_KEY
})

describe("scoreRenderVision", () => {
  it("returns parsed score on valid API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 8,
                issues: ["Minor proportion issue on lid"],
                summary: "Good match to product description",
              }),
            },
          },
        ],
      }),
    })

    const result = await scoreRenderVision(
      "dGVzdA==",
      "A storage container with lid",
      "Storage Module",
    )

    expect(result).toEqual({
      score: 8,
      issues: ["Minor proportion issue on lid"],
      summary: "Good match to product description",
    })
  })

  it("handles JSON wrapped in markdown code blocks", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '```json\n{"score": 6, "issues": ["Missing handle"], "summary": "Acceptable"}\n```',
            },
          },
        ],
      }),
    })

    const result = await scoreRenderVision(
      "dGVzdA==",
      "A mug with handle",
      "Mug Module",
    )

    expect(result).toEqual({
      score: 6,
      issues: ["Missing handle"],
      summary: "Acceptable",
    })
  })

  it("returns null when API key is missing", async () => {
    delete process.env.OPENAI_API_KEY
    const result = await scoreRenderVision("dGVzdA==", "test", "test")
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns null when SVG is empty", async () => {
    const result = await scoreRenderVision("", "test", "test")
    expect(result).toBeNull()
  })

  it("returns null when description is empty", async () => {
    const result = await scoreRenderVision("dGVzdA==", "", "test")
    expect(result).toBeNull()
  })

  it("returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const result = await scoreRenderVision("dGVzdA==", "test", "test")
    expect(result).toBeNull()
  })

  it("returns null on invalid response shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"score": "not a number", "issues": [], "summary": "ok"}' } }],
      }),
    })

    const result = await scoreRenderVision("dGVzdA==", "test", "test")
    expect(result).toBeNull()
  })

  it("returns null on score out of range", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"score": 15, "issues": [], "summary": "ok"}' }],
      }),
    })

    const result = await scoreRenderVision("dGVzdA==", "test", "test")
    expect(result).toBeNull()
  })

  it("returns null on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await scoreRenderVision("dGVzdA==", "test", "test")
    expect(result).toBeNull()
  })

  it("rounds decimal scores to integers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"score": 7.5, "issues": [], "summary": "ok"}' }],
      }),
    })

    const result = await scoreRenderVision("dGVzdA==", "test", "test")
    expect(result?.score).toBe(8)
  })

  it("passes interface definition to API when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"score": 9, "issues": [], "summary": "great"}' }],
      }),
    })

    await scoreRenderVision("dGVzdA==", "test", "test", "=== a) SPACE BUDGET ===\nTotal: 100mm")

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    const textContent = callBody.messages[0].content.find((c: { type: string }) => c.type === "text")
    expect(textContent.text).toContain("Interface specification excerpt")
  })
})
