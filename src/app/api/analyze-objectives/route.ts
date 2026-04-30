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
import { aiGuard } from '@/lib/ai/guard'

// DECISION: 300s timeout for Opus objectives extraction.
// Opus typically takes 60-150s on 30K-char documents.
// This is the ONLY way to get a >60s timeout on Vercel — server actions
// can't have maxDuration, and page-level maxDuration only affects SSR.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const OBJECTIVES_MODEL = 'gpt-5.5'
// GOTCHA: With dates on every task, 15 objectives × 8 tasks × full fields
// produces ~12K-16K tokens. 8192 was truncating the JSON mid-string.
const OBJECTIVES_MAX_TOKENS = 16384

const OBJECTIVES_PROMPT = `You are an expert business strategist. Extract a 3-LEVEL HIERARCHY from the document:

Level 1: STRATEGIC GOALS (3-4 maximum) — high-level pillars
Level 2: OBJECTIVES (3-8 per goal) — concrete workstreams
Level 3: TASKS (2-6 per objective) — specific actionable items

IMPORTANT RULES:
- Extract ACTIONS, not product descriptions
- Only 3-4 strategic goals maximum. Group the document's content into broad themes.
- Each objective should have MULTIPLE tasks (not 1 task per objective)
- ROLES: Only "Executive" (founder does it) or "AI_Agent" (AI specialist does it). NO "Apprentice".
- DATES: Every level needs ISO dates (YYYY-MM-DD). Stagger tasks within objectives sequentially.
- TASKS need a dueDate field (single date when it should be done)

Return ONLY a raw JSON array (no markdown, no code fences):
[{
  "title": "Strategic Goal Name",
  "description": "Why this matters",
  "suggestedStartDate": "2026-04-11",
  "suggestedEndDate": "2026-05-09",
  "objectives": [{
    "title": "Objective Name",
    "description": "What this achieves",
    "suggestedStartDate": "2026-04-11",
    "suggestedEndDate": "2026-04-13",
    "tasks": [{
      "title": "Task name",
      "description": "Specific action",
      "role": "Executive",
      "dueDate": "2026-04-11",
      "estimatedDays": 1
    }]
  }]
}]`

export async function POST(request: NextRequest) {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SECURITY: AI cost gate — Opus calls are expensive ($5/$25 per 1M tokens)
  const guard = await aiGuard(supabase, 'objectives_analysis')
  if (guard.denied) return guard.response

  const body = await request.json()
  const { text } = body

  if (!text || typeof text !== 'string' || text.length < 50) {
    return NextResponse.json({ error: 'Insufficient text provided' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
  }

  try {
    const truncatedText = text.slice(0, 100000)

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OBJECTIVES_MODEL,
        max_completion_tokens: OBJECTIVES_MAX_TOKENS,
        messages: [
          { role: 'system', content: OBJECTIVES_PROMPT },
          { role: 'user', content: `Analyze the following business plan:\n\n${truncatedText}` },
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok || !data.choices) {
      console.error('[analyze-objectives] OpenAI API error:', data.error?.message ?? data)
      return NextResponse.json({ error: 'Objectives extraction failed' }, { status: 500 })
    }

    const rawText: string = data.choices[0]?.message?.content ?? ''
    if (!rawText) {
      return NextResponse.json({ error: 'AI returned no text content' }, { status: 500 })
    }

    // Strip markdown code fences
    let raw = rawText.trim()
    const fenceMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
    if (fenceMatch) raw = fenceMatch[1].trim()

    // GOTCHA: If the model hit max_completion_tokens, the JSON may be truncated.
    // Try to recover by finding the last complete object in the array.
    if (data.choices[0]?.finish_reason === 'length') {
      console.warn('[analyze-objectives] Model hit max_completion_tokens — attempting JSON repair')
      const lastCompleteObj = raw.lastIndexOf('}')
      if (lastCompleteObj > 0) {
        raw = raw.slice(0, lastCompleteObj + 1) + ']'
      }
    }

    const usage = {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    }

    return NextResponse.json({ raw, usage, stopReason: data.choices[0]?.finish_reason })
  } catch (error) {
    console.error('[analyze-objectives] Objectives extraction failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Objectives extraction failed' }, { status: 500 })
  }
}
