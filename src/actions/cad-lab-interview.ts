"use server"

/**
 * @file cad-lab-interview.ts — Server actions for the guided design brief interview.
 *
 * @description Two LLM calls:
 *   1. `getNextInterviewQuestion()` — Sonnet 4.6 generates dynamic follow-up questions
 *   2. `synthesizeDesignBrief()` — Opus 4.6 synthesizes conversation into a structured brief
 *
 * @security Server-side only, uses ANTHROPIC_API_KEY directly.
 */

import { createClient } from "@/lib/supabase/server"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import type { CadLabDesignBrief } from "@/lib/cad-lab-types"

/** Maximum length for a single user answer — prevents context overflow and cost abuse */
const MAX_ANSWER_LENGTH = 2000

// ─── Types ───────────────────────────────────────────────────────────

interface ConversationEntry {
  question: string
  answer: string
}

interface InterviewQuestionResult {
  done: boolean
  nextQuestion?: string
  suggestedChips?: string[]
  acknowledgment?: string
}

interface SynthesisResult {
  brief: CadLabDesignBrief
  enrichedSubject: string
  summary: string
}

// ─── Claude API Helper ───────────────────────────────────────────────

async function callClaudeForInterview(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number = 1024,
  timeoutMs: number = 30_000,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const response = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    },
    timeoutMs,
  )

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    console.error(`[INTERVIEW] Claude API error ${response.status}: ${text.slice(0, 500)}`)
    throw new Error(sanitizeErrorMessage(`Interview request failed (${response.status})`))
  }

  const data = await response.json()
  const block = data.content?.[0]
  if (!block || block.type !== "text") throw new Error("Unexpected Claude response format")
  return block.text
}

// ─── JSON Extraction ─────────────────────────────────────────────────

function extractJson(text: string): string {
  const first = text.indexOf("{")
  const last = text.lastIndexOf("}")
  if (first !== -1 && last > first) {
    return text.slice(first, last + 1)
  }
  return text
}

// ─── System Prompts ──────────────────────────────────────────────────

const INTERVIEW_SYSTEM_PROMPT = `You are Max, CTO of a hardware design platform. You're helping a user figure out what they want to build. They may not be engineers — keep questions accessible and conversational. No jargon unless they use it first.

Your job: ask smart follow-up questions to uncover what they're actually building, what it needs to do, any constraints they know about, and what matters most to them.

Rules:
- Ask ONE question at a time
- Keep it conversational, not form-like
- If they give vague answers, ask clarifying follow-ups
- If they give detailed answers, don't re-ask what they already told you
- After 3-6 exchanges (when you have enough to write a design brief), set done=true
- Minimum 3 questions, maximum 6
- Include 3-5 quick-select chip suggestions for each question (accessible options the user can click)
- Include a brief acknowledgment of their previous answer (1 sentence, Max's voice) — omit for the first question

Areas to cover (not necessarily in order — be natural):
- What the product actually does / what problem it solves
- Physical size, form factor, or weight expectations (if relevant)
- How many they want to make (1 prototype vs production)
- Where it will be used (environment, conditions)
- What matters most to them (cost, speed, durability, looks, precision)
- Any materials or manufacturing they already have in mind

Return ONLY valid JSON: { "done": boolean, "nextQuestion": string | null, "suggestedChips": string[] | null, "acknowledgment": string | null }`

const SYNTHESIS_SYSTEM_PROMPT = `You are Max, CTO. You just interviewed a user about what they want to build. Synthesize their answers into a structured design brief.

Be opinionated — fill gaps with sensible engineering defaults based on what they told you. If they said "outdoor use", infer weather resistance. If they said "cheap", lean toward standard materials and simple processes.

The enrichedSubject should be a more specific, engineering-informed version of their original subject line (keep it under 100 chars).

The summary should be 2-3 sentences that Max would say: direct, confident, capturing the key design decisions.

Return ONLY valid JSON:
{
  "brief": {
    "useCase": "string — what it's for, how it's used",
    "targetProcess": "string — recommended manufacturing process",
    "targetMaterial": "string — recommended material family",
    "toleranceTarget": "string — tolerance requirement",
    "quantityTarget": "string — production scale",
    "complianceNotes": "string — any compliance/certification needs"
  },
  "enrichedSubject": "string",
  "summary": "string"
}`

// ─── Server Actions ──────────────────────────────────────────────────

/**
 * Generates the next interview question using Sonnet 4.6.
 *
 * @param subject - The product subject the user typed
 * @param conversation - Array of previous Q&A pairs
 * @returns Next question + chips, or done=true when enough info gathered
 */
export async function getNextInterviewQuestion(
  subject: string,
  conversation: ConversationEntry[],
): Promise<InterviewQuestionResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { done: true }

  // SECURITY: Rate limit interview questions to prevent cost abuse
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { done: true }

  // SECURITY: Truncate answers to prevent context overflow and cost abuse
  const safeConversation = conversation.map((e) => ({
    question: e.question.slice(0, MAX_ANSWER_LENGTH),
    answer: e.answer.slice(0, MAX_ANSWER_LENGTH),
  }))

  const userPrompt = safeConversation.length === 0
    ? `The user wants to build: "${subject.slice(0, 500)}"\n\nThis is your first question — no acknowledgment needed.`
    : `The user wants to build: "${subject.slice(0, 500)}"\n\nConversation so far:\n${safeConversation.map((e, i) => `Q${i + 1}: ${e.question}\nA${i + 1}: ${e.answer}`).join("\n\n")}\n\nGenerate your next response.`

  const text = await callClaudeForInterview(
    INTERVIEW_SYSTEM_PROMPT,
    userPrompt,
    "claude-sonnet-4-6",
    1024,
  )

  try {
    const parsed = JSON.parse(extractJson(text)) as InterviewQuestionResult
    return {
      done: parsed.done ?? false,
      nextQuestion: parsed.nextQuestion ?? undefined,
      suggestedChips: Array.isArray(parsed.suggestedChips) ? parsed.suggestedChips : undefined,
      acknowledgment: parsed.acknowledgment ?? undefined,
    }
  } catch (err) {
    console.error("[INTERVIEW] Failed to parse Sonnet response:", text.slice(0, 500), err)
    return { done: false, nextQuestion: "Could you tell me more about what you're building?", suggestedChips: [] }
  }
}

/**
 * Synthesizes the full conversation into a structured design brief using Opus 4.6.
 *
 * @param subject - The original product subject
 * @param conversation - Full conversation history
 * @returns Structured brief, enriched subject, and Max's summary
 */
export async function synthesizeDesignBrief(
  subject: string,
  conversation: ConversationEntry[],
): Promise<SynthesisResult> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  // SECURITY: Rate limit synthesis calls to prevent cost abuse
  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) throw new Error("Rate limit exceeded")

  // SECURITY: Truncate to prevent context overflow
  const safeConversation = conversation.map((e) => ({
    question: e.question.slice(0, MAX_ANSWER_LENGTH),
    answer: e.answer.slice(0, MAX_ANSWER_LENGTH),
  }))

  const userPrompt = `Original subject: "${subject.slice(0, 500)}"\n\nInterview transcript:\n${safeConversation.map((e, i) => `Q${i + 1}: ${e.question}\nA${i + 1}: ${e.answer}`).join("\n\n")}\n\nSynthesize into a design brief.`

  const text = await callClaudeForInterview(
    SYNTHESIS_SYSTEM_PROMPT,
    userPrompt,
    "claude-opus-4-6",
    2048,
    60_000, // 60s — Opus needs more time than Sonnet for synthesis
  )

  try {
    const parsed = JSON.parse(extractJson(text)) as SynthesisResult
    return {
      brief: {
        useCase: parsed.brief?.useCase ?? "",
        targetProcess: parsed.brief?.targetProcess ?? "",
        targetMaterial: parsed.brief?.targetMaterial ?? "",
        toleranceTarget: parsed.brief?.toleranceTarget ?? "",
        quantityTarget: parsed.brief?.quantityTarget ?? "",
        complianceNotes: parsed.brief?.complianceNotes ?? "",
      },
      enrichedSubject: parsed.enrichedSubject ?? subject,
      summary: parsed.summary ?? "",
    }
  } catch (err) {
    console.error("[INTERVIEW] Failed to parse Opus response:", text.slice(0, 500), err)
    throw new Error("Failed to synthesize design brief")
  }
}
