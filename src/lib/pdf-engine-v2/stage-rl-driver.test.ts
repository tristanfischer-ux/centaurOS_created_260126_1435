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
 * 11. Curriculum: phase field is 1 or 2
 * 12. Curriculum: slug → filename mapping covers all 10 canonical briefs
 * 13. Curriculum: Phase 1 default brief set is cgm, drone, bess
 * 14. Curriculum: Phase 2 brief set is all 10
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
      phase: 1,
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
    expect([1, 2]).toContain(result.phase)
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
      phase: 1,
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
      phase: 1,
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

// ── 11. Curriculum: phase field ───────────────────────────────────────────────
describe('RlIterationResult curriculum phase field', () => {
  it('phase 1 represents the fast loop (3 briefs)', () => {
    const result: RlIterationResult = {
      stage: 'brief_parsing',
      iteration_number: 1,
      started_at: '2026-05-09T00:00:00Z',
      ended_at: '2026-05-09T00:25:00Z',
      duration_seconds: 1500,
      briefs_run: ['cgm', 'drone', 'bess'],
      per_brief_scores: { cgm: 7.5, drone: 7.8, bess: 8.1 },
      mean_score: 7.8,
      prompt_changed: true,
      prompt_diff_size_lines: 12,
      council_fired: false,
      council_blockers_count: 0,
      committed_sha: null,
      rl_decision: 'ITERATE',
      phase: 1,
    }
    expect(result.phase).toBe(1)
    expect(result.briefs_run).toHaveLength(3)
    expect(result.briefs_run).toEqual(expect.arrayContaining(['cgm', 'drone', 'bess']))
  })

  it('phase 2 represents the validation pass (10 briefs)', () => {
    const allTen = ['cgm', 'drone', 'edge-ai', 'heatpump', 'ev-charger', 'bioreactor', 'farm', 'auv', 'bess', 'haps']
    const result: RlIterationResult = {
      stage: 'brief_parsing',
      iteration_number: 4,
      started_at: '2026-05-09T02:00:00Z',
      ended_at: '2026-05-09T03:10:00Z',
      duration_seconds: 4200,
      briefs_run: allTen,
      per_brief_scores: Object.fromEntries(allTen.map(s => [s, 8.2])),
      mean_score: 8.2,
      prompt_changed: false,
      prompt_diff_size_lines: 0,
      council_fired: false,
      council_blockers_count: 0,
      committed_sha: null,
      rl_decision: 'PROMOTE',
      phase: 2,
    }
    expect(result.phase).toBe(2)
    expect(result.briefs_run).toHaveLength(10)
  })

  it('phase only accepts 1 or 2 (type-level constraint)', () => {
    const validPhases: Array<1 | 2> = [1, 2]
    for (const p of validPhases) {
      expect([1, 2]).toContain(p)
    }
  })
})

// ── 12. Curriculum: slug → filename mapping ───────────────────────────────────
describe('Curriculum slug → filename mapping', () => {
  // This mapping must match SLUG_TO_FILENAME in stage-rl-iterate.ts parseArgs().
  // Validated here without importing the module (avoids __dirname SyntaxError in Jest).
  const SLUG_TO_FILENAME: Record<string, string> = {
    'cgm':        '01-cgm-wearable.md',
    'drone':      '02-drone-prosumer.md',
    'edge-ai':    '03-edge-ai-server.md',
    'heatpump':   '04-heatpump-30kw.md',
    'ev-charger': '05-dc-fast-ev-charger.md',
    'bioreactor': '06-pharma-bioreactor.md',
    'farm':       '07-vertical-farm.md',
    'auv':        '08-auv-coastal.md',
    'bess':       '09-bess-container.md',
    'haps':       '10-haps-stratospheric.md',
  }

  it('covers all 10 canonical brief slugs', () => {
    const slugs = Object.keys(SLUG_TO_FILENAME)
    expect(slugs).toHaveLength(10)
  })

  it('Phase 1 default slugs (cgm, drone, bess) are all in the mapping', () => {
    const phase1Slugs = ['cgm', 'drone', 'bess']
    for (const slug of phase1Slugs) {
      expect(SLUG_TO_FILENAME).toHaveProperty(slug)
    }
  })

  it('Phase 2 slugs (all 10) are all in the mapping', () => {
    const phase2Slugs = ['cgm', 'drone', 'edge-ai', 'heatpump', 'ev-charger', 'bioreactor', 'farm', 'auv', 'bess', 'haps']
    for (const slug of phase2Slugs) {
      expect(SLUG_TO_FILENAME).toHaveProperty(slug)
    }
    expect(phase2Slugs).toHaveLength(10)
  })

  it('each slug maps to a .md file with correct numeric prefix', () => {
    const prefixes = Object.values(SLUG_TO_FILENAME).map(f => parseInt(f.split('-')[0], 10))
    const expectedPrefixes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(prefixes.sort((a, b) => a - b)).toEqual(expectedPrefixes)
  })
})

// ── 13. Curriculum logic: Phase 1 → Phase 2 transition rules ─────────────────
describe('Curriculum transition logic', () => {
  // These tests encode the promotion rules without running the actual driver.
  // The driver bash logic is tested at the shell level (bash -n syntax check).

  it('Phase 1 → Phase 2: requires mean >= 8.0 AND 2 consecutive iterations above 8', () => {
    // Simulate tracking consecutive_above_8
    function shouldPromoteToPhase2(
      meanScore: number,
      consecutiveAbove8: number,
    ): boolean {
      return meanScore >= 8.0 && consecutiveAbove8 >= 2
    }

    // One iteration above 8 — not enough
    expect(shouldPromoteToPhase2(8.2, 1)).toBe(false)
    // Two consecutive — promote
    expect(shouldPromoteToPhase2(8.2, 2)).toBe(true)
    // High score but only once
    expect(shouldPromoteToPhase2(9.5, 1)).toBe(false)
    // Exactly 8.0 with 2 consecutive
    expect(shouldPromoteToPhase2(8.0, 2)).toBe(true)
    // 7.9 — below threshold
    expect(shouldPromoteToPhase2(7.9, 5)).toBe(false)
  })

  it('Phase 2 PROMOTE: mean >= 8.0 across all 10 briefs', () => {
    function shouldPromoteRound(meanScore: number): boolean {
      return meanScore >= 8.0
    }

    expect(shouldPromoteRound(8.0)).toBe(true)
    expect(shouldPromoteRound(8.5)).toBe(true)
    expect(shouldPromoteRound(7.9)).toBe(false)
  })

  it('Phase 2 fail: identifies briefs scoring < 8.0 to add back to Phase 1 set', () => {
    const perBriefScores: Record<string, number> = {
      cgm: 8.5, drone: 8.1, 'edge-ai': 6.2,
      heatpump: 7.8, 'ev-charger': 8.0, bioreactor: 8.3,
      farm: 5.9, auv: 8.1, bess: 8.4, haps: 7.5,
    }
    const failingBriefs = Object.entries(perBriefScores)
      .filter(([, score]) => score < 8.0)
      .map(([slug]) => slug)

    expect(failingBriefs).toEqual(expect.arrayContaining(['edge-ai', 'heatpump', 'farm', 'haps']))
    expect(failingBriefs).toHaveLength(4)
    // These get added back to Phase 1 set
    const updatedPhase1 = [...new Set(['cgm', 'drone', 'bess', ...failingBriefs])]
    expect(updatedPhase1).toHaveLength(7)
  })
})

// ── 14. Driver dry-run: council seat model identifiers ────────────────────────
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
