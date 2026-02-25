/**
 * @file ai-narrative.ts
 *
 * @description Server-side module that generates executive narratives for
 * reports using the Gemini API. Two exported functions: one for the full
 * executive summary and one for lightweight section intros. Falls back to
 * template-based prose when the API key is missing or the call fails.
 *
 * @related
 * - src/lib/reports/report-document-types.ts — Type definitions consumed here
 * - src/actions/report-generator.ts — Calls these functions during report build
 * - src/actions/progress-report.ts — Similar Gemini pattern for weekly digests
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

// DECISION: Instantiate at module level so the SDK reuses its internal HTTP
// client across calls within the same server lifetime, matching the pattern in
// progress-report.ts and nudges.ts.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

const MODEL_ID = 'gemini-3-flash-preview'
const API_TIMEOUT_MS = 10_000

// ─── Public Types ─────────────────────────────────────────────────

export interface NarrativeContext {
  companyName: string
  reportTitle: string
  dateRange: { start: string; end: string }
  tasksCompleted: number
  tasksCreated: number
  previousPeriodCompleted: number
  topContributors: { name: string; count: number }[]
  atRiskObjectives: { title: string; progress: number }[]
  blockersCount: number
  objectivesProgressing: number
  totalActiveObjectives: number
  overdueTaskCount?: number
  standupParticipationRate?: number
  objectivesCompleted?: number
  // Phase 5: Cross-cutting business context
  periodRevenue?: number
  periodExpenses?: number
  previousPeriodRevenue?: number
  pipelineReplies?: number
  pipelineRFQsAwarded?: number
  cadProjectsCompleted?: number
  knowledgeNotesAdded?: number
  overBudgetCategories?: number
}

export interface NarrativeOptions {
  tone: 'internal' | 'board' | 'investor'
  detailLevel: 'brief' | 'standard' | 'detailed'
}

export interface NarrativeResult {
  narrative: string
  highlights: string[]
}

// ─── Constants ────────────────────────────────────────────────────

const TONE_INSTRUCTIONS: Record<NarrativeOptions['tone'], string> = {
  internal:
    'Write in casual first-person plural ("We shipped…", "Our team…"). ' +
    'Be warm, encouraging, and team-oriented.',
  board:
    'Write in formal third-person ("The team completed…", "The organisation…"). ' +
    'Be professional, balanced, and precise.',
  investor:
    'Write in a metrics-forward, concise style. Lead with velocity and traction. ' +
    'No fluff — every sentence should carry data or insight.',
}

const DETAIL_LENGTH: Record<NarrativeOptions['detailLevel'], string> = {
  brief: '1-2 sentences only. Highlights: exactly 2-3 bullet points.',
  standard: '2-3 paragraphs. Highlights: 3-5 bullet points.',
  detailed:
    '3-4 paragraphs with specific metrics woven into the prose. ' +
    'Highlights: 5-7 bullet points.',
}

// INTENT: More deterministic output for formal reports (investor/board),
// more creative latitude for internal team updates.
const TONE_TEMPERATURE: Record<NarrativeOptions['tone'], number> = {
  investor: 0.3,
  board: 0.5,
  internal: 0.7,
}

// INTENT: Section intros are lighter than full narratives, so they get
// slightly lower temperatures across the board.
const SECTION_TONE_TEMPERATURE: Record<NarrativeOptions['tone'], number> = {
  investor: 0.2,
  board: 0.4,
  internal: 0.6,
}

// ─── Executive Narrative ──────────────────────────────────────────

/**
 * Generate a full executive narrative for a report.
 *
 * @description Sends the report metrics to Gemini and returns polished prose
 * suitable for the executive-summary section. Falls back to a deterministic
 * template when the API is unavailable.
 *
 * @param context - Metrics and metadata for the report period
 * @param options - Tone and detail-level controls
 * @returns Narrative prose and a list of key highlights
 */
export async function generateExecutiveNarrative(
  context: NarrativeContext,
  options: NarrativeOptions,
): Promise<NarrativeResult> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.warn('[ReportNarrative] GOOGLE_AI_API_KEY not set — using template fallback')
    return buildFallbackNarrative(context, options)
  }

  try {
    const systemPrompt = buildExecutiveSystemPrompt(options)
    const userPrompt = buildExecutiveUserPrompt(context)

    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: { temperature: TONE_TEMPERATURE[options.tone], maxOutputTokens: 1024 },
    })

    const t = timeoutWithCleanup(API_TIMEOUT_MS)
    try {
      const result = await Promise.race([
        model.generateContent({
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
          ],
        }),
        t.promise,
      ])

      const text = result.response.text()
      return parseNarrativeResponse(text, context, options)
    } finally {
      t.clear()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ReportNarrative] Executive narrative generation failed:', { message })
    return buildFallbackNarrative(context, options)
  }
}

// ─── Section Narrative ────────────────────────────────────────────

/**
 * Generate a short intro sentence for any report section.
 *
 * @description Produces a 1-2 sentence lead-in that contextualises a section's
 * data. Falls back to a pre-written template on failure.
 *
 * @param sectionType - Section identifier (e.g. 'team-activity')
 * @param sectionData - Raw data for the section
 * @param options - Tone and detail-level controls
 * @returns A 1-2 sentence narrative string
 */
export async function generateSectionNarrative(
  sectionType: string,
  sectionData: Record<string, unknown>,
  options: NarrativeOptions,
): Promise<string> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    return buildSectionFallback(sectionType)
  }

  try {
    const prompt =
      `You are a report writer. Write exactly 1-2 sentences introducing the ` +
      `"${sectionType}" section of an executive report.\n\n` +
      `Tone: ${TONE_INSTRUCTIONS[options.tone]}\n\n` +
      `Section data:\n${JSON.stringify(sectionData, null, 2)}\n\n` +
      `Rules:\n` +
      `- Never use the word "AI"\n` +
      `- Reference specific numbers from the data when possible\n` +
      `- Keep it to 1-2 sentences maximum\n` +
      `- Return ONLY the sentences, no extra formatting`

    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: { temperature: SECTION_TONE_TEMPERATURE[options.tone], maxOutputTokens: 256 },
    })

    const t = timeoutWithCleanup(API_TIMEOUT_MS)
    try {
      const result = await Promise.race([
        model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
        t.promise,
      ])

      const text = result.response.text().trim()
      return text || buildSectionFallback(sectionType)
    } finally {
      t.clear()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ReportNarrative] Section narrative failed:', {
      sectionType,
      message,
    })
    return buildSectionFallback(sectionType)
  }
}

// ─── Prompt Builders ──────────────────────────────────────────────

// INTENT: The system prompt encodes all tone/length/style rules so the user
// prompt can stay purely data-oriented. Separating them makes it easy to
// tweak style without touching data assembly.
function buildExecutiveSystemPrompt(options: NarrativeOptions): string {
  return [
    'You are a senior executive report writer.',
    TONE_INSTRUCTIONS[options.tone],
    DETAIL_LENGTH[options.detailLevel],
    '',
    'Rules:',
    '- NEVER use the word "AI" anywhere in the output.',
    '- Include specific numbers from the data provided.',
    '- Compare current period to previous period (up/down trends).',
    '- If there are at-risk objectives, call them out clearly.',
    '- If there are unresolved blockers, flag that they need attention.',
    '- End on a forward-looking note about what to focus on next.',
    '- Write clean, professional prose — no bullet lists in the narrative.',
    '',
    'Output format (return ONLY this JSON, no markdown fences):',
    '{"narrative": "...", "highlights": ["...", "..."]}',
  ].join('\n')
}

function buildExecutiveUserPrompt(ctx: NarrativeContext): string {
  const completionDelta = ctx.tasksCompleted - ctx.previousPeriodCompleted
  const trendDirection = completionDelta > 0 ? 'up' : completionDelta < 0 ? 'down' : 'flat'
  const trendPercent =
    ctx.previousPeriodCompleted > 0
      ? Math.round(Math.abs(completionDelta / ctx.previousPeriodCompleted) * 100)
      : 0

  return [
    `Company: ${ctx.companyName}`,
    `Report: ${ctx.reportTitle}`,
    `Period: ${ctx.dateRange.start} to ${ctx.dateRange.end}`,
    '',
    `Tasks completed this period: ${ctx.tasksCompleted}`,
    `Tasks created this period: ${ctx.tasksCreated}`,
    `Previous period completed: ${ctx.previousPeriodCompleted}`,
    `Completion trend: ${trendDirection} ${trendPercent}%`,
    '',
    `Active objectives progressing: ${ctx.objectivesProgressing} of ${ctx.totalActiveObjectives}`,
    `Unresolved blockers: ${ctx.blockersCount}`,
    '',
    ctx.topContributors.length > 0
      ? `Top contributors:\n${ctx.topContributors.map((c) => `  - ${c.name}: ${c.count} tasks`).join('\n')}`
      : 'Top contributors: none recorded',
    '',
    ctx.atRiskObjectives.length > 0
      ? `At-risk objectives:\n${ctx.atRiskObjectives.map((o) => `  - ${o.title} (${o.progress}% complete)`).join('\n')}`
      : 'At-risk objectives: none',
    '',
    ctx.overdueTaskCount != null ? `Overdue tasks: ${ctx.overdueTaskCount}` : '',
    ctx.standupParticipationRate != null ? `Standup participation: ${Math.round(ctx.standupParticipationRate)}%` : '',
    ctx.objectivesCompleted != null ? `Objectives completed this period: ${ctx.objectivesCompleted}` : '',
    '',
    // Financial context
    ctx.periodRevenue != null ? `Period revenue: £${(ctx.periodRevenue / 100).toFixed(2)}` : '',
    ctx.periodExpenses != null ? `Period expenses: £${(ctx.periodExpenses / 100).toFixed(2)}` : '',
    ctx.previousPeriodRevenue != null ? `Previous period revenue: £${(ctx.previousPeriodRevenue / 100).toFixed(2)}` : '',
    ctx.overBudgetCategories != null && ctx.overBudgetCategories > 0 ? `Over-budget categories: ${ctx.overBudgetCategories}` : '',
    // Pipeline context
    ctx.pipelineReplies != null && ctx.pipelineReplies > 0 ? `Pipeline replies received: ${ctx.pipelineReplies}` : '',
    ctx.pipelineRFQsAwarded != null && ctx.pipelineRFQsAwarded > 0 ? `RFQs awarded: ${ctx.pipelineRFQsAwarded}` : '',
    // Engineering context
    ctx.cadProjectsCompleted != null && ctx.cadProjectsCompleted > 0 ? `CAD projects completed: ${ctx.cadProjectsCompleted}` : '',
    // Knowledge context
    ctx.knowledgeNotesAdded != null && ctx.knowledgeNotesAdded > 0 ? `Knowledge notes added: ${ctx.knowledgeNotesAdded}` : '',
  ].filter(Boolean).join('\n')
}

// ─── Response Parser ──────────────────────────────────────────────

// DECISION: We attempt JSON.parse first, then fall back to treating the raw
// text as the narrative. Gemini occasionally wraps its response in markdown
// fences or adds preamble, so we strip those before parsing.
function parseNarrativeResponse(
  raw: string,
  context: NarrativeContext,
  options: NarrativeOptions,
): NarrativeResult {
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/\s*```/gi, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as { narrative?: string; highlights?: string[] }
    if (parsed.narrative && Array.isArray(parsed.highlights)) {
      return {
        narrative: parsed.narrative,
        highlights: parsed.highlights,
      }
    }
  } catch {
    // JSON parse failed — fall through to raw text handling
  }

  // GOTCHA: If Gemini returns plain text instead of JSON (happens with
  // certain prompt lengths), we still produce a valid result rather than
  // dropping the entire response.
  console.warn('[ReportNarrative] Could not parse JSON — using raw text as narrative')
  return {
    narrative: cleaned,
    highlights: buildFallbackHighlights(context, options),
  }
}

// ─── Fallbacks ────────────────────────────────────────────────────

// INTENT: The app must never show a blank executive summary. These
// deterministic fallbacks produce useful (if generic) narratives when
// the generative API is unavailable.
function buildFallbackNarrative(
  ctx: NarrativeContext,
  options: NarrativeOptions,
): NarrativeResult {
  const completionDelta = ctx.tasksCompleted - ctx.previousPeriodCompleted
  const trendWord = completionDelta > 0 ? 'an increase' : completionDelta < 0 ? 'a decrease' : 'no change'

  const opener: Record<NarrativeOptions['tone'], string> = {
    internal: `During ${ctx.dateRange.start} to ${ctx.dateRange.end}, we completed ${ctx.tasksCompleted} tasks — ${trendWord} compared to the previous period.`,
    board: `The team completed ${ctx.tasksCompleted} tasks between ${ctx.dateRange.start} and ${ctx.dateRange.end}, representing ${trendWord} from the prior period.`,
    investor: `${ctx.tasksCompleted} tasks shipped (${ctx.dateRange.start}–${ctx.dateRange.end}). ${completionDelta > 0 ? `+${completionDelta}` : completionDelta} vs. prior period.`,
  }

  const riskLine =
    ctx.atRiskObjectives.length > 0
      ? ` ${ctx.atRiskObjectives.length} objective${ctx.atRiskObjectives.length > 1 ? 's remain' : ' remains'} at risk and should be reviewed.`
      : ''

  const blockerLine =
    ctx.blockersCount > 0
      ? ` There ${ctx.blockersCount === 1 ? 'is' : 'are'} ${ctx.blockersCount} unresolved blocker${ctx.blockersCount > 1 ? 's' : ''} requiring attention.`
      : ''

  const narrative = `${opener[options.tone]}${riskLine}${blockerLine} ${ctx.objectivesProgressing} of ${ctx.totalActiveObjectives} objectives are actively progressing.`

  return {
    narrative,
    highlights: buildFallbackHighlights(ctx, options),
  }
}

function buildFallbackHighlights(
  ctx: NarrativeContext,
  options: NarrativeOptions,
): string[] {
  const highlights: string[] = []

  highlights.push(`${ctx.tasksCompleted} tasks completed this period`)

  if (ctx.topContributors.length > 0) {
    highlights.push(`Top contributor: ${ctx.topContributors[0].name} (${ctx.topContributors[0].count} tasks)`)
  }

  highlights.push(`${ctx.objectivesProgressing} of ${ctx.totalActiveObjectives} objectives progressing`)

  if (ctx.atRiskObjectives.length > 0) {
    highlights.push(`${ctx.atRiskObjectives.length} objective${ctx.atRiskObjectives.length > 1 ? 's' : ''} at risk`)
  }

  if (ctx.blockersCount > 0) {
    highlights.push(`${ctx.blockersCount} blocker${ctx.blockersCount > 1 ? 's' : ''} need resolution`)
  }

  const maxHighlights =
    options.detailLevel === 'brief' ? 3 : options.detailLevel === 'standard' ? 5 : 7
  return highlights.slice(0, maxHighlights)
}

const SECTION_FALLBACKS: Record<string, string> = {
  'team-activity': 'Here is a breakdown of individual contributions across the team during this period.',
  'objectives-progress': 'The following objectives are actively being tracked, with current progress and health status.',
  'key-metrics': 'Key performance indicators for this period are summarised below, with comparisons to the prior period.',
  'blockers-risks': 'The items below represent current blockers and objectives that may need additional attention.',
  'completion-trend': 'Task completion volume over the period is shown below, highlighting daily throughput.',
  'week-ahead': 'These are the upcoming tasks and deadlines for the next week.',
  'financial-snapshot': 'A summary of revenue, expenses, and budget health for the reporting period.',
  'sales-pipeline': 'Outreach, RFQ, and discovery call activity across the sales pipeline this period.',
  'engineering-activity': 'CAD Lab project activity and engineering throughput for this period.',
  'knowledge-learning': 'Knowledge vault contributions and apprenticeship programme progress.',
  'cover': '',
  'executive-summary': '',
}

function buildSectionFallback(sectionType: string): string {
  return SECTION_FALLBACKS[sectionType] ?? 'This section provides additional detail for the reporting period.'
}

// ─── Utilities ────────────────────────────────────────────────────

// DECISION: Using Promise.race with a rejecting timeout rather than
// AbortSignal because the @google/generative-ai SDK doesn't expose an
// abort option on generateContent. This guarantees we never wait longer
// than API_TIMEOUT_MS regardless of network conditions.
// Returns a clearable handle so the timer doesn't dangle after the race resolves.
function timeoutWithCleanup(ms: number) {
  let timer: ReturnType<typeof setTimeout>
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  })
  return { promise, clear: () => clearTimeout(timer!) }
}
