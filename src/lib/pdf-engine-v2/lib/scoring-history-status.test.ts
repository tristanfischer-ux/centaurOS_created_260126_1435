/**
 * @file scoring-history-status.test.ts — J1a: status field on scoring records.
 *
 * Verifies that recordScoringRun writes the status field when provided and
 * defaults to absent (treated as 'COMPLETED' by the dashboard) when omitted.
 */

import { recordScoringRun, type ScoringRecord } from './scoring-history'

// Mock the fs module so tests don't touch ~/Downloads/engine-evidence/.
jest.mock('fs', () => {
  const written: string[] = []
  return {
    __written: written,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    appendFileSync: jest.fn((_path: string, data: string) => { written.push(data) }),
    readFileSync: jest.fn(() => written.join('')),
    writeFileSync: jest.fn(),
  }
})

const fs = jest.requireMock('fs') as {
  __written: string[]
  existsSync: jest.Mock
  mkdirSync: jest.Mock
  appendFileSync: jest.Mock
  readFileSync: jest.Mock
  writeFileSync: jest.Mock
}

beforeEach(() => {
  fs.__written.length = 0
  fs.appendFileSync.mockClear()
  fs.writeFileSync.mockClear()
})

describe('recordScoringRun — status field', () => {
  it('should write status=PIPELINE_ERROR to the JSONL record', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T10:00:00.000Z',
      projectId: 'test-brief',
      briefLabel: 'test',
      compound: -1,
      rubric: -1,
      councilAvg: null,
      councilScored: 0,
      councilFailed: 0,
      sections: [],
      formulaVersion: 'f7',
      status: 'PIPELINE_ERROR',
    }

    recordScoringRun(record)

    expect(fs.appendFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(fs.__written[0])
    expect(written.status).toBe('PIPELINE_ERROR')
    expect(written.compound).toBe(-1)
    expect(written.rubric).toBe(-1)
  })

  it('should write status=BRIEF_INCOMPLETE to the JSONL record', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T10:00:00.000Z',
      projectId: 'incomplete-brief',
      briefLabel: 'incomplete',
      compound: -1,
      rubric: -1,
      councilAvg: null,
      councilScored: 0,
      councilFailed: 0,
      sections: [],
      formulaVersion: 'f7',
      status: 'BRIEF_INCOMPLETE',
    }

    recordScoringRun(record)

    const written = JSON.parse(fs.__written[0])
    expect(written.status).toBe('BRIEF_INCOMPLETE')
  })

  it('should write status=INFEASIBLE to the JSONL record', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T10:00:00.000Z',
      projectId: 'infeasible-brief',
      briefLabel: 'infeasible',
      compound: -1,
      rubric: -1,
      councilAvg: null,
      councilScored: 0,
      councilFailed: 0,
      sections: [],
      formulaVersion: 'f7',
      status: 'INFEASIBLE',
    }

    recordScoringRun(record)

    const written = JSON.parse(fs.__written[0])
    expect(written.status).toBe('INFEASIBLE')
  })

  it('should omit status when not provided (defaults to COMPLETED behaviour)', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T10:00:00.000Z',
      projectId: 'completed-brief',
      briefLabel: 'bess',
      compound: 72,
      rubric: 85,
      councilAvg: 7.5,
      councilScored: 8,
      councilFailed: 0,
      sections: [{ section: 'BOM', score: 8 }],
      formulaVersion: 'f7',
    }

    recordScoringRun(record)

    const written = JSON.parse(fs.__written[0])
    expect(written.status).toBeUndefined()
    expect(written.compound).toBe(72)
    expect(written.rubric).toBe(85)
  })

  it('should write status=COMPLETED explicitly when provided', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T10:00:00.000Z',
      projectId: 'explicit-completed',
      briefLabel: 'farm',
      compound: 60,
      rubric: 70,
      councilAvg: 5.0,
      councilScored: 6,
      councilFailed: 2,
      sections: [],
      formulaVersion: 'f7',
      status: 'COMPLETED',
    }

    recordScoringRun(record)

    const written = JSON.parse(fs.__written[0])
    expect(written.status).toBe('COMPLETED')
  })
})

describe('recordScoringRun — councilScores (J2)', () => {
  it('should write councilScores with judgeBreakdown to the JSONL record', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T12:00:00.000Z',
      projectId: 'j2-test',
      briefLabel: 'bess',
      compound: 68,
      rubric: 75,
      councilAvg: 6.5,
      councilScored: 6,
      councilFailed: 0,
      sections: [
        { section: 'Brief', score: 7 },
        { section: 'BOM', score: 6 },
      ],
      formulaVersion: 'f7',
      status: 'COMPLETED',
      councilScores: [
        {
          section: 'Brief',
          judgeBreakdown: [
            { model: 'gemini-3.1-pro', score: 8 },
            { model: 'gpt-5.4', score: 7 },
            { model: 'grok-4.3', score: 6 },
          ],
        },
        {
          section: 'BOM',
          judgeBreakdown: [
            { model: 'gemini-3.1-pro', score: 7 },
            { model: 'gpt-5.4', score: 5 },
            { model: 'grok-4.3', score: 6 },
          ],
        },
      ],
    }

    recordScoringRun(record)

    const written = JSON.parse(fs.__written[0])
    expect(written.councilScores).toBeDefined()
    expect(written.councilScores).toHaveLength(2)
    expect(written.councilScores[0].section).toBe('Brief')
    expect(written.councilScores[0].judgeBreakdown).toHaveLength(3)
    expect(written.councilScores[0].judgeBreakdown[0].model).toBe('gemini-3.1-pro')
    expect(written.councilScores[0].judgeBreakdown[0].score).toBe(8)
  })

  it('should omit councilScores when not provided (backward compatible)', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T12:00:00.000Z',
      projectId: 'no-council',
      briefLabel: 'bess',
      compound: 55,
      rubric: 60,
      councilAvg: null,
      councilScored: 0,
      councilFailed: 4,
      sections: [],
      formulaVersion: 'f7',
      status: 'COMPLETED',
    }

    recordScoringRun(record)

    const written = JSON.parse(fs.__written[0])
    expect(written.councilScores).toBeUndefined()
  })

  it('should render judge spread in the dashboard HTML when councilScores are present', () => {
    const record: ScoringRecord = {
      timestamp: '2026-05-07T12:00:00.000Z',
      projectId: 'j2-html-test',
      briefLabel: 'bess',
      compound: 70,
      rubric: 80,
      councilAvg: 6.5,
      councilScored: 2,
      councilFailed: 0,
      sections: [
        { section: 'Brief', score: 7 },
      ],
      formulaVersion: 'f7',
      status: 'COMPLETED',
      councilScores: [
        {
          section: 'Brief',
          judgeBreakdown: [
            { model: 'gemini-3.1-pro', score: 8 },
            { model: 'gpt-5.4', score: 6 },
            { model: 'grok-4.3', score: 7 },
          ],
        },
      ],
    }

    recordScoringRun(record)

    // The dashboard is written via writeFileSync — find the HTML call
    const htmlCall = fs.writeFileSync.mock.calls.find(
      (c: string[]) => typeof c[1] === 'string' && c[1].includes('<!DOCTYPE html>')
    )
    expect(htmlCall).toBeDefined()
    const html = htmlCall![1] as string
    expect(html).toContain('Judges: 8, 6, 7 (spread 2)')
    expect(html).toContain('judge-spread')
  })
})
