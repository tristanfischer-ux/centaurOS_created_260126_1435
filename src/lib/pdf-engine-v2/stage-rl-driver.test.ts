/**
 * @file stage-rl-driver.test.ts
 *
 * Tests for:
 * 1. RlIterationResult JSON schema shape (all required fields present and typed)
 * 2. reviewPromptDiffWithCouncil: skips when diff <= 20 lines
 * 3. reviewPromptDiffWithCouncil: fires all 6 seats on diff > 20 lines
 * 4. reviewPromptDiffWithCouncil: counts BLOCKERs correctly
 * 5. Revert condition: blockerCount >= 2 means caller should REVERT
 * 6. Pass condition: blockerCount < 2 means caller proceeds
 * 7. Seat HTTP failure handled gracefully (no throw)
 * 8. RlIterationResult rl_decision accepts all valid enum values
 * 9. CouncilDiffResult interface contract (no-fire and fire shapes)
 * 10. mean_score can be null
 */

import type { RlIterationResult, CouncilDiffResult } from './stage-rl-council'
import { reviewPromptDiffWithCouncil } from './stage-rl-council'

// ── Mock fetch for OpenRouter calls ──────────────────────────────────────────
const mockFetch = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
  process.env.OPENROUTER_API_KEY = 'test-key'
})
afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
})

// ── Helper to build a mock seat response ─────────────────────────────────────
function mockSeatResponse(blocker: boolean, reasons: string[] = []) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({ blocker, reasons, confident_review_pass: !blocker }),
            },
          },
        ],
      }),
  }
}

// ── 1. RlIterationResult schema shape ─────────────────────────────────────────
describe('RlIterationResult schema', () => {
  it('has all required fields with correct types', () => {
    const result: RlIterationResult = {
      stage: 'brief_parsing',
      iteration_number: 1,
      started_at: '2026-05-08T23:15:00Z',
      ended_at: '2026-05-08T23:42:18Z',
      duration_seconds: 1638,
      briefs_run: ['cgm', 'drone', 'edge_ai'],
      per_brief_scores: { cgm: 7.3, drone: 6.8, edge_ai: 8.1 },
      mean_score: 7.4,
      prompt_changed: true,
      prompt_diff_size_lines: 47,
      council_fired: true,
      council_blockers_count: 0,
      committed_sha: 'abc12345',
      rl_decision: 'ITERATE',
    }

    expect(typeof result.stage).toBe('string')
    expect(typeof result.iteration_number).toBe('number')
    expect(typeof result.started_at).toBe('string')
    expect(typeof result.ended_at).toBe('string')
    expect(typeof result.duration_seconds).toBe('number')
    expect(Array.isArray(result.briefs_run)).toBe(true)
    expect(typeof result.per_brief_scores).toBe('object')
    expect(result.mean_score).toBeDefined()
    expect(typeof result.prompt_changed).toBe('boolean')
    expect(typeof result.prompt_diff_size_lines).toBe('number')
    expect(typeof result.council_fired).toBe('boolean')
    expect(typeof result.council_blockers_count).toBe('number')
    expect(result.committed_sha === null || typeof result.committed_sha === 'string').toBe(true)
    expect(['PROMOTE', 'ITERATE', 'GIVE-UP', 'REVERT', 'PENDING']).toContain(result.rl_decision)
  })

  it('mean_score can be null (no briefs scored)', () => {
    const result: RlIterationResult = {
      stage: 'brief_parsing',
      iteration_number: 1,
      started_at: '2026-05-08T23:15:00Z',
      ended_at: '2026-05-08T23:42:18Z',
      duration_seconds: 0,
      briefs_run: [],
      per_brief_scores: {},
      mean_score: null,
      prompt_changed: false,
      prompt_diff_size_lines: 0,
      council_fired: false,
      council_blockers_count: 0,
      committed_sha: null,
      rl_decision: 'PENDING',
    }
    expect(result.mean_score).toBeNull()
    expect(result.committed_sha).toBeNull()
  })
})

// ── 2. Council skips when diff <= 20 lines ────────────────────────────────────
describe('reviewPromptDiffWithCouncil — skip condition', () => {
  it('does not fire when diff is exactly 20 lines', async () => {
    const result = await reviewPromptDiffWithCouncil('brief_parsing', 'dummy diff', 20)
    expect(result.fired).toBe(false)
    expect(result.blockerCount).toBe(0)
    expect(result.seatFindings).toHaveLength(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not fire when diff is 0 lines', async () => {
    const result = await reviewPromptDiffWithCouncil('brief_parsing', '', 0)
    expect(result.fired).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ── 3. Council fires all 6 seats on diff > 20 lines ──────────────────────────
describe('reviewPromptDiffWithCouncil — fires on large diff', () => {
  it('calls 6 LLM seats when diff is 21 lines', async () => {
    mockFetch.mockResolvedValue(mockSeatResponse(false))
    const result = await reviewPromptDiffWithCouncil('brief_parsing', 'big diff', 21)
    expect(result.fired).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(6)
    expect(result.seatFindings).toHaveLength(6)
  })

  it('returns fired=true and blockerCount=0 when all seats pass', async () => {
    mockFetch.mockResolvedValue(mockSeatResponse(false))
    const result = await reviewPromptDiffWithCouncil('research_synthesis', 'some diff', 25)
    expect(result.fired).toBe(true)
    expect(result.blockerCount).toBe(0)
  })
})

// ── 4. BLOCKER counting ───────────────────────────────────────────────────────
describe('reviewPromptDiffWithCouncil — BLOCKER counting', () => {
  it('counts exactly 2 BLOCKERs when 2 seats flag blocker=true', async () => {
    let callIdx = 0
    mockFetch.mockImplementation(() => {
      const isBlocker = callIdx < 2
      callIdx++
      return Promise.resolve(mockSeatResponse(isBlocker, isBlocker ? ['schema broken'] : []))
    })
    const result = await reviewPromptDiffWithCouncil('decompose_pa', 'a diff', 30)
    expect(result.blockerCount).toBe(2)
  })

  it('counts 6 BLOCKERs when all seats agree', async () => {
    mockFetch.mockResolvedValue(mockSeatResponse(true, ['invention risk']))
    const result = await reviewPromptDiffWithCouncil('bom_pa', 'huge diff', 100)
    expect(result.blockerCount).toBe(6)
  })
})

// ── 5. Revert threshold: >= 2 BLOCKERs ───────────────────────────────────────
describe('reviewPromptDiffWithCouncil — revert threshold', () => {
  it('blockerCount >= 2 so caller should REVERT', async () => {
    let idx = 0
    mockFetch.mockImplementation(() => {
      const blocker = idx++ < 3
      return Promise.resolve(mockSeatResponse(blocker))
    })
    const result = await reviewPromptDiffWithCouncil('review', 'diff', 25)
    expect(result.blockerCount).toBeGreaterThanOrEqual(2)
  })

  it('blockerCount < 2 when only 1 seat flags BLOCKER — should NOT revert', async () => {
    let idx = 0
    mockFetch.mockImplementation(() => {
      const blocker = idx++ === 0
      return Promise.resolve(mockSeatResponse(blocker))
    })
    const result = await reviewPromptDiffWithCouncil('review', 'small diff', 21)
    expect(result.blockerCount).toBe(1)
    expect(result.blockerCount).toBeLessThan(2)
  })
})

// ── 6. Seat HTTP failure handled gracefully ───────────────────────────────────
describe('reviewPromptDiffWithCouncil — error tolerance', () => {
  it('handles individual seat HTTP failure without throwing', async () => {
    let idx = 0
    mockFetch.mockImplementation(() => {
      idx++
      if (idx <= 2) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
      }
      return Promise.resolve(mockSeatResponse(false))
    })
    const result = await reviewPromptDiffWithCouncil('brief_parsing', 'a diff', 30)
    expect(result.fired).toBe(true)
    expect(result.seatFindings).toHaveLength(6)
    expect(result.blockerCount).toBe(0)
  })
})

// ── 7. RlIterationResult rl_decision enum ─────────────────────────────────────
describe('RlIterationResult rl_decision enum', () => {
  const validDecisions: RlIterationResult['rl_decision'][] = [
    'PROMOTE', 'ITERATE', 'GIVE-UP', 'REVERT', 'PENDING',
  ]

  it.each(validDecisions)('accepts %s as a valid rl_decision', (decision) => {
    const result: RlIterationResult = {
      stage: 'brief_parsing',
      iteration_number: 1,
      started_at: '2026-05-08T23:00:00Z',
      ended_at: '2026-05-08T23:01:00Z',
      duration_seconds: 60,
      briefs_run: ['cgm'],
      per_brief_scores: { cgm: 7.0 },
      mean_score: 7.0,
      prompt_changed: false,
      prompt_diff_size_lines: 5,
      council_fired: false,
      council_blockers_count: 0,
      committed_sha: null,
      rl_decision: decision,
    }
    expect(validDecisions).toContain(result.rl_decision)
  })
})

// ── 8. CouncilDiffResult interface ────────────────────────────────────────────
describe('CouncilDiffResult interface', () => {
  it('has correct shape when council does not fire', () => {
    const result: CouncilDiffResult = {
      blockerCount: 0,
      seatFindings: [],
      fired: false,
    }
    expect(result.fired).toBe(false)
    expect(result.blockerCount).toBe(0)
    expect(result.seatFindings).toHaveLength(0)
  })

  it('has correct shape when council fires with findings', () => {
    const result: CouncilDiffResult = {
      blockerCount: 2,
      seatFindings: [
        { model: 'x-ai/grok-4.3', blocker: true, reasons: ['schema broken'] },
        { model: 'openai/gpt-5.4', blocker: true, reasons: ['invention risk'] },
        { model: 'z-ai/glm-5.1', blocker: false, reasons: [] },
      ],
      fired: true,
    }
    expect(result.fired).toBe(true)
    expect(result.blockerCount).toBe(2)
    expect(result.seatFindings[0].model).toBe('x-ai/grok-4.3')
    expect(result.seatFindings[0].blocker).toBe(true)
  })
})

// ── 9. per_brief_scores maps brief slugs to numeric scores ────────────────────
describe('RlIterationResult per_brief_scores', () => {
  it('maps brief slugs to numeric scores between 0 and 10', () => {
    const scores: Record<string, number> = {
      cgm: 7.3,
      drone: 6.8,
      edge_ai: 8.1,
      heatpump: 5.9,
      ev_charger: 7.0,
      bioreactor: 8.3,
      farm: 6.2,
      auv: 7.8,
      bess: 6.5,
      haps: 9.0,
    }
    for (const [, score] of Object.entries(scores)) {
      expect(typeof score).toBe('number')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(10)
    }
    expect(Object.keys(scores)).toHaveLength(10)
  })
})

// ── 10. Driver dry-run: council seat model identifiers ────────────────────────
describe('reviewPromptDiffWithCouncil — council seat models', () => {
  it('calls the correct 6 council models per coding-council.md spec', async () => {
    const modelsSeen: string[] = []
    mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string)
      modelsSeen.push(body.model)
      return Promise.resolve(mockSeatResponse(false))
    })

    await reviewPromptDiffWithCouncil('brief_parsing', 'a big diff', 50)

    const expectedModels = [
      'google/gemini-3.1-pro-preview',
      'openai/gpt-5.4',
      'x-ai/grok-4.3',
      'z-ai/glm-5.1',
      'moonshotai/kimi-k2.6',
      'xiaomi/mimo-v2.5-pro',
    ]
    for (const model of expectedModels) {
      expect(modelsSeen).toContain(model)
    }
    expect(modelsSeen).toHaveLength(6)
  })
})
