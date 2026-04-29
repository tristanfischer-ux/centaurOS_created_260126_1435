/**
 * @file cad-lab-report.test.ts
 *
 * @description Integration tests for the two-phase AI report pipeline
 * (Opus structures → Gemini writes). Mocks fetchWithTimeout at module level.
 *
 * @related
 * - src/actions/cad-lab-report.ts — the server actions under test
 * - src/lib/cad-lab/design-report-types.ts — type definitions
 */

// Suppress expected console.error/warn from retry and error paths
let consoleErrorSpy: jest.SpyInstance
let consoleWarnSpy: jest.SpyInstance
beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => {
  consoleErrorSpy.mockRestore()
  consoleWarnSpy.mockRestore()
})

// ─── Mock auth for withAIGate wrapper ────────────────────────────────
const mockSupabaseClient = {
  auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }) },
  from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn(() => ({ data: null, error: null })), maybeSingle: jest.fn(() => ({ data: null, error: null })) })), gte: jest.fn(() => ({ lt: jest.fn(() => ({ data: [], error: null, count: 0 })) })) })) })),
  rpc: jest.fn(() => ({ data: [{ month_count: 0, month_cost_usd: 0 }], error: null })),
}
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}))
jest.mock('@/lib/supabase/foundry-context', () => ({
  getFoundryIdCached: jest.fn(() => Promise.resolve('test-foundry-id')),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => mockSupabaseClient),
}))
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))
jest.mock('@/lib/ai/usage-tracking', () => ({
  trackUsage: jest.fn(),
  trackAIUsage: jest.fn(),
  countTokens: jest.fn(() => 100),
  estimateCost: jest.fn(() => 0.01),
  COST_MAP: {},
}))
jest.mock('@/lib/ai/limit-check', () => ({
  checkAILimit: jest.fn(() => Promise.resolve({ allowed: true, remaining: 50, tier: 'professional', monthlyLimit: 500, currentUsage: 0, costBudgetUsd: 100, currentCostUsd: 0 })),
  FREE_TIER_SPECIALISTS: new Set(),
}))

// ─── Mock fetchWithTimeout (used by Phase 2 / Gemini writer) ────────

const mockFetchWithTimeout = jest.fn()

jest.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}))

jest.mock('@/lib/retry', () => ({
  withRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}))

// ─── Mock callOpenRouter (used by Phase 1 / outline) ────────────────

const mockCallOpenRouter = jest.fn()

jest.mock('@/lib/ai/openrouter', () => ({
  callOpenRouter: (...args: unknown[]) => mockCallOpenRouter(...args),
}))

// ─── Import after mocks ──────────────────────────────────────────────

import { structureReportOutline, writeReportSections } from '../cad-lab-report'
import type { DesignReportData, ReportOutline } from '@/lib/cad-lab/design-report-types'

// ─── Test Fixtures ───────────────────────────────────────────────────

const FIXTURE_DATA: DesignReportData = {
  projectName: 'Test Widget',
  generatedAt: '2026-03-13T10:00:00.000Z',
  heroImageUrl: null,
  stage: 'specify',
  productOverview: 'A test widget for testing purposes.',
  researchReport: 'Research found that widgets are useful.',
  sources: [{ title: 'Widget Research', url: 'https://example.com' }],
  designBrief: {
    useCase: 'Testing',
    targetProcess: 'CNC Machining',
    targetMaterial: 'Aluminium 6061',
    toleranceTarget: '±0.1mm',
    quantityTarget: '100',
    complianceNotes: 'ISO 9001',
  },
  modules: [
    {
      id: 'mod-1',
      name: 'Housing',
      purpose: 'Encloses the internal components',
      description: 'CNC machined aluminium housing',
      keyParts: ['Top shell', 'Bottom shell'],
      failureModes: ['Thermal distortion'],
      estimatedMassKg: 0.5,
      leadWeeks: 4,
    } as DesignReportData['modules'][0],
    {
      id: 'mod-2',
      name: 'PCB Assembly',
      purpose: 'Controls the device logic',
      description: 'Multi-layer PCB with MCU',
      keyParts: ['MCU', 'Power regulator'],
      failureModes: ['Solder joint failure'],
      estimatedMassKg: 0.05,
      leadWeeks: 6,
    } as DesignReportData['modules'][0],
  ],
  diagnosticAnswers: {
    'mod-1': { mfg_process: 'CNC', material: 'Aluminium', tolerance: '±0.1mm', finish: 'Anodised', batch_size: '100' },
    'mod-2': { mfg_process: 'SMT', material: 'FR4', tolerance: '±0.2mm', finish: 'HASL', batch_size: '100' },
  },
  aiCostEstimates: {
    'mod-1': { moduleId: 'mod-1', totalPerUnit: 45.50, confidence: 'medium', assumptions: ['Standard 6061', 'No complex undercuts'] },
    'mod-2': { moduleId: 'mod-2', totalPerUnit: 12.30, confidence: 'high', assumptions: ['Standard PCB fab'] },
  },
  researchModelUsed: 'gemini-3.1-pro',
  decompositionModelUsed: 'claude-opus-4-7',
}

const VALID_OUTLINE: ReportOutline = {
  executiveSummary: 'This is a test widget specification report.',
  narrativeThread: 'From concept through specification.',
  sections: [
    {
      id: 'exec-summary',
      title: 'Executive Summary',
      sectionType: 'executive-summary',
      brief: 'Summarise the project.',
      keyPoints: ['Test widget for testing'],
      dataHighlights: ['2 modules'],
      includeTable: false,
      includeImage: false,
    },
    {
      id: 'module-overview',
      title: 'Module Overview',
      sectionType: 'module-overview',
      brief: 'Overview all modules.',
      keyPoints: ['Housing', 'PCB Assembly'],
      dataHighlights: ['0.55kg total mass'],
      includeTable: true,
      includeImage: false,
    },
  ],
}

// ─── Helper to build mock API responses ──────────────────────────────

function mockOpusResponse(content: string, inputTokens = 500, outputTokens = 300) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ content: [{ text: content }] }),
    json: async () => ({
      content: [{ text: content }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  }
}

function mockGeminiResponse(text: string, promptTokens = 200, candidateTokens = 400) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: promptTokens, candidatesTokenCount: candidateTokens },
    }),
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('structureReportOutline', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  })

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
  })

  function mockOpenRouterOutline(content: string, inputTokens = 500, outputTokens = 300) {
    return { ok: true, text: content, inputTokens, outputTokens, modelUsed: 'deepseek/deepseek-v4-pro' }
  }

  it('returns a valid outline on happy path', async () => {
    mockCallOpenRouter.mockResolvedValueOnce(
      mockOpenRouterOutline(JSON.stringify(VALID_OUTLINE)),
    )

    const result = await structureReportOutline(FIXTURE_DATA)

    expect(result.outline.sections).toHaveLength(2)
    expect(result.outline.executiveSummary).toBe('This is a test widget specification report.')
    expect(result.tokensIn).toBe(500)
    expect(result.tokensOut).toBe(300)
  })

  it('handles JSON wrapped in code fences', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_OUTLINE) + '\n```'
    mockCallOpenRouter.mockResolvedValueOnce(mockOpenRouterOutline(fenced))

    const result = await structureReportOutline(FIXTURE_DATA)
    expect(result.outline.sections).toHaveLength(2)
  })

  it('throws meaningful error on malformed JSON', async () => {
    mockCallOpenRouter.mockResolvedValueOnce(
      mockOpenRouterOutline('{ this is not valid json }}'),
    )

    const result = await structureReportOutline(FIXTURE_DATA)
    expect(result).toHaveProperty('error')
  })

  it('returns error when outline has 0 sections', async () => {
    const emptySections = { ...VALID_OUTLINE, sections: [] }
    mockCallOpenRouter.mockResolvedValueOnce(
      mockOpenRouterOutline(JSON.stringify(emptySections)),
    )

    const result = await structureReportOutline(FIXTURE_DATA)
    expect(result).toHaveProperty('error')
  })

  it('returns error when OpenRouter call fails', async () => {
    mockCallOpenRouter.mockResolvedValueOnce(
      { ok: false, text: '', error: 'API error', inputTokens: 0, outputTokens: 0, modelUsed: '' },
    )

    const result = await structureReportOutline(FIXTURE_DATA)
    expect(result).toHaveProperty('error')
  })

  it('defaults missing section fields instead of crashing', async () => {
    const sparse = {
      sections: [
        { sectionType: 'conclusions' },
        { id: 'full', title: 'Full Section', sectionType: 'product-overview', brief: 'Do it', keyPoints: ['a'], dataHighlights: ['b'] },
      ],
    }
    mockCallOpenRouter.mockResolvedValueOnce(
      mockOpenRouterOutline(JSON.stringify(sparse)),
    )

    const result = await structureReportOutline(FIXTURE_DATA)
    const s0 = result.outline.sections[0]
    expect(s0.id).toBe('section-0')
    expect(s0.title).toBe('Section 1')
    expect(s0.keyPoints).toEqual([])
    expect(s0.dataHighlights).toEqual([])
    expect(s0.includeTable).toBe(false)
    expect(result.outline.executiveSummary).toBe('')
    expect(result.outline.narrativeThread).toBe('')
  })
})

describe('writeReportSections', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GOOGLE_AI_API_KEY = 'test-google-key'
  })

  afterEach(() => {
    delete process.env.GOOGLE_AI_API_KEY
  })

  it('returns AiReportContent with prose on happy path', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(mockGeminiResponse('Executive summary prose.'))
      .mockResolvedValueOnce(mockGeminiResponse('Module overview prose.'))

    const result = await writeReportSections(
      VALID_OUTLINE,
      FIXTURE_DATA,
      { in: 500, out: 300 },
    )

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].prose).toBe('Executive summary prose.')
    expect(result.sections[1].prose).toBe('Module overview prose.')
    expect(result.opusTokens).toEqual({ in: 500, out: 300 })
    expect(result.geminiTokens.in).toBe(400)
    expect(result.geminiTokens.out).toBe(800)
    expect(result.generatedAt).toBeTruthy()
  })

  it('gives failed sections empty prose, others succeed', async () => {
    mockFetchWithTimeout
      .mockRejectedValueOnce(new Error('Gemini API error (500): Internal error'))
      .mockResolvedValueOnce(mockGeminiResponse('Module overview prose.'))

    const result = await writeReportSections(
      VALID_OUTLINE,
      FIXTURE_DATA,
      { in: 500, out: 300 },
    )

    expect(result.sections[0].prose).toBe('')
    expect(result.sections[1].prose).toBe('Module overview prose.')
  })

  it('throws immediately when API key is missing', async () => {
    delete process.env.GOOGLE_AI_API_KEY

    const result = await writeReportSections(VALID_OUTLINE, FIXTURE_DATA, { in: 500, out: 300 })
    expect(result).toHaveProperty('error')

    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })
})

describe('audience steering', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    process.env.GOOGLE_AI_API_KEY = 'test-google-key'
  })

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.GOOGLE_AI_API_KEY
  })

  function extractSystemPromptFromOpenRouter(callArgs: unknown[]): string {
    const opts = callArgs[0] as { system?: string } | undefined
    return opts?.system ?? ''
  }

  function extractSystemPromptFromFetch(callArgs: unknown[]): string {
    const init = callArgs[1] as { body?: string } | undefined
    if (!init?.body) return ''
    try {
      const payload = JSON.parse(init.body)
      return (payload.system as string) ?? (payload.system_instruction?.parts?.[0]?.text as string) ?? ''
    } catch {
      return ''
    }
  }

  it('structureReportOutline defaults to investor context when audience is omitted', async () => {
    mockCallOpenRouter.mockResolvedValueOnce({ ok: true, text: JSON.stringify(VALID_OUTLINE), inputTokens: 500, outputTokens: 300, modelUsed: 'deepseek/deepseek-v4-pro' })

    await structureReportOutline(FIXTURE_DATA)

    const sysPrompt = extractSystemPromptFromOpenRouter(mockCallOpenRouter.mock.calls[0])
    expect(sysPrompt).toContain('Investor / Executive reader')
  })

  it('structureReportOutline injects engineer context when audience=engineer', async () => {
    mockCallOpenRouter.mockResolvedValueOnce({ ok: true, text: JSON.stringify(VALID_OUTLINE), inputTokens: 500, outputTokens: 300, modelUsed: 'deepseek/deepseek-v4-pro' })

    await structureReportOutline(FIXTURE_DATA, 'engineer')

    const sysPrompt = extractSystemPromptFromOpenRouter(mockCallOpenRouter.mock.calls[0])
    expect(sysPrompt).toContain('Engineer / Technical reviewer')
    expect(sysPrompt).not.toContain('Investor / Executive reader')
  })

  it('structureReportOutline injects supplier context when audience=supplier', async () => {
    mockCallOpenRouter.mockResolvedValueOnce({ ok: true, text: JSON.stringify(VALID_OUTLINE), inputTokens: 500, outputTokens: 300, modelUsed: 'deepseek/deepseek-v4-pro' })

    await structureReportOutline(FIXTURE_DATA, 'supplier')

    const sysPrompt = extractSystemPromptFromOpenRouter(mockCallOpenRouter.mock.calls[0])
    expect(sysPrompt).toContain('Supplier / Procurement reader')
  })

  it('structureReportOutline injects marketing context when audience=marketing', async () => {
    mockCallOpenRouter.mockResolvedValueOnce({ ok: true, text: JSON.stringify(VALID_OUTLINE), inputTokens: 500, outputTokens: 300, modelUsed: 'deepseek/deepseek-v4-pro' })

    await structureReportOutline(FIXTURE_DATA, 'marketing')

    const sysPrompt = extractSystemPromptFromOpenRouter(mockCallOpenRouter.mock.calls[0])
    expect(sysPrompt).toContain('Marketing press asset')
  })

  it('writeReportSections threads audience tone register to the Gemini writer', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(mockGeminiResponse('Exec prose.'))
      .mockResolvedValueOnce(mockGeminiResponse('Module prose.'))

    await writeReportSections(VALID_OUTLINE, FIXTURE_DATA, { in: 500, out: 300 }, 'engineer')

    const sysPrompt = extractSystemPromptFromFetch(mockFetchWithTimeout.mock.calls[0])
    expect(sysPrompt.toLowerCase()).toContain('terse')
  })
})

describe('extractJson (via structureReportOutline)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  })

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
  })

  it('strips code fences and comments', async () => {
    const withComments = `\`\`\`json
// This is a comment
${JSON.stringify(VALID_OUTLINE)}
\`\`\``
    mockCallOpenRouter.mockResolvedValueOnce({ ok: true, text: withComments, inputTokens: 500, outputTokens: 300, modelUsed: 'deepseek/deepseek-v4-pro' })

    const result = await structureReportOutline(FIXTURE_DATA)
    expect(result.outline.sections).toHaveLength(2)
  })

  it('strips trailing commas', async () => {
    const withTrailing = JSON.stringify(VALID_OUTLINE)
      .replace('"includeImage":false}', '"includeImage":false,}')
    mockCallOpenRouter.mockResolvedValueOnce({ ok: true, text: withTrailing, inputTokens: 500, outputTokens: 300, modelUsed: 'deepseek/deepseek-v4-pro' })

    const result = await structureReportOutline(FIXTURE_DATA)
    expect(result.outline.sections).toHaveLength(2)
  })
})
