/**
 * @file API route for business plan objectives extraction using Opus.
 *
 * @description Opus takes 60-150s to extract objectives from action plans.
 * Server actions have a 60s timeout on Vercel that cannot be overridden
 * (maxDuration on "use server" files breaks the build, maxDuration on
 * page.tsx only affects SSR, not client-invoked server actions).
 *
 * This API route has its own maxDuration=300, giving Opus enough time.
 * Called by analyzeBusinessPlan() in src/actions/analyze.ts for the
 * objectives section only — other sections use Sonnet via the server action.
 *
 * @security Requires authentication via Supabase session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// DECISION: 300s timeout for Opus objectives extraction.
// Opus typically takes 60-150s on 30K-char documents.
// This is the ONLY way to get a >60s timeout on Vercel — server actions
// can't have maxDuration, and page-level maxDuration only affects SSR.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const OBJECTIVES_MODEL = 'claude-opus-4-6'
const OBJECTIVES_MAX_TOKENS = 8192

const OBJECTIVES_PROMPT = `You are an expert business consultant and operations strategist. Extract ALL strategic objectives, goals, milestones, and action items from the document.

IMPORTANT: The document may be a traditional business plan, BUT it could also be:
- A go-to-market action plan with day-by-day or week-by-week tasks
- A project tracker with checklists and deadlines
- A commercial audit with recommended actions
- A strategic roadmap with phases and milestones

Your job is to extract EVERY actionable objective — NOT the products/features described in the plan, but the ACTIONS the company needs to take. For example:
- "Fix website SEO issues" is an objective (action to take)
- "ForgeOS CAD Lab" is a product (NOT an objective — skip it)
- "Reach out to 50 hardware founders" is an objective
- "Record demo video" is a task under an objective

Group related tasks into objectives. If the document has explicit phases/weeks/days, use those as the grouping.

For each objective:
- title: the goal name (action-oriented, e.g. "Launch founder outreach campaign", NOT product names)
- description: what it entails and why it matters
- phase: business phase (e.g. "Week 1", "Day 1-2", "Launch", "Scale", "Month 1") — use the document's own phasing if available
- suggestedStartDate, suggestedEndDate: ISO dates if timing is mentioned or inferable
- tasks: 3-8 concrete, actionable tasks. Each task has:
  - title, description
  - role: "Executive" (decisions/hiring/strategy/outreach/demos), "Apprentice" (research/setup/data entry), or "AI_Agent" (data analysis/content generation/coding)
  - estimatedDays (optional)

Aim for 5-15 objectives with 3-8 tasks each. Extract generously — it's better to have too many than too few.

Return ONLY a raw JSON array (no markdown, no code fences):
[{ "title": "...", "description": "...", "phase": "...", "suggestedStartDate": "...", "suggestedEndDate": "...", "tasks": [{"title":"...","description":"...","role":"Executive","estimatedDays":1}] }]`

export async function POST(request: NextRequest) {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { text } = body

  if (!text || typeof text !== 'string' || text.length < 50) {
    return NextResponse.json({ error: 'Insufficient text provided' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const truncatedText = text.slice(0, 100000)

    const response = await client.messages.create({
      model: OBJECTIVES_MODEL,
      max_tokens: OBJECTIVES_MAX_TOKENS,
      system: OBJECTIVES_PROMPT,
      messages: [
        { role: 'user', content: `Analyze the following business plan:\n\n${truncatedText}` },
      ],
    })

    const textBlock = response.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'AI returned no text content' }, { status: 500 })
    }

    // Strip markdown code fences
    let raw = textBlock.text.trim()
    const fenceMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
    if (fenceMatch) raw = fenceMatch[1].trim()

    return NextResponse.json({ raw, usage: response.usage })
  } catch (error) {
    console.error('[analyze-objectives] Opus extraction failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Objectives extraction failed' }, { status: 500 })
  }
}
