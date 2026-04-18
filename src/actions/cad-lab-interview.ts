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
import { classifyAIError } from "@/lib/agents/error-classification"
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

Your job: ask smart follow-up questions to uncover what they're actually building, what it needs to do, any constraints they know about, and what matters most to them. You need ENOUGH detail to write a complete engineering design brief — don't stop early.

Rules:
- Ask ONE question at a time
- Keep it conversational, not form-like
- If they give vague answers, ask clarifying follow-ups — don't move on with gaps
- If they give detailed answers, don't re-ask what they already told you
- You MUST ask at least 4 questions. After 4-6 exchanges, set done=true ONLY when you have covered at least 4 of the 6 areas below
- Maximum 6 questions
- Include 3-5 quick-select chip suggestions for each question (accessible options the user can click)
- Include a brief acknowledgment of their previous answer (1 sentence, Max's voice) — omit for the first question
- Do NOT set done=true until you understand: what it does, where it's used, how many they need, and what matters most

Areas to cover (aim for at least 4 of these — be natural about the order):
1. What the product actually does / what problem it solves
2. Physical size, form factor, or weight expectations
3. How many they want to make (1 prototype vs 100 vs 10,000+)
4. Where it will be used (environment, conditions, indoor/outdoor, temperature, moisture)
5. What matters most to them (cost, speed, durability, looks, precision)
6. Any materials or manufacturing they already have in mind

Return ONLY valid JSON: { "done": boolean, "nextQuestion": string | null, "suggestedChips": string[] | null, "acknowledgment": string | null }`

const SYNTHESIS_SYSTEM_PROMPT = `You are Max, CTO. You just interviewed a user about what they want to build. Synthesize their answers into a structured design brief.

Be opinionated — fill ALL fields with specific, actionable engineering details based on what they told you. If they said "outdoor use", specify IP rating and UV-resistant materials. If they said "cheap", name the specific cheap process (FDM, injection moulding) and material (ABS, PP). If they said "a few", quantify it (10-50 units). Never leave a field vague — make real engineering calls.

Rules for each brief field:
- useCase: 2-3 sentences covering what it does, who uses it, and the key problem it solves
- targetProcess: Name a specific manufacturing process (e.g. "FDM 3D printing for prototyping, injection moulding for production")
- targetMaterial: Name specific materials with grades (e.g. "ABS for housing, 6061-T6 aluminium for structural brackets")
- toleranceTarget: Give actual numbers (e.g. "±0.5mm general, ±0.1mm on mating surfaces")
- quantityTarget: Give a number or range (e.g. "5 prototypes, then 500-unit initial production run")
- complianceNotes: List any applicable standards, certifications, or safety requirements — or "None identified" if truly none apply

The enrichedSubject should be a more specific, engineering-informed version of their original subject line (keep it under 100 chars).

The summary should be 4-6 sentences that Max would say to the user: confident, specific, explaining the key design decisions you've made and why. This is what the user reads before the system starts researching — make them feel like their product was understood. Reference specific things they said.

Return ONLY valid JSON:
{
  "brief": {
    "useCase": "string",
    "targetProcess": "string",
    "targetMaterial": "string",
    "toleranceTarget": "string",
    "quantityTarget": "string",
    "complianceNotes": "string"
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

    // INTENT: Hard minimum — Sonnet sometimes sets done=true after 2-3 exchanges.
    // Override: force at least 4 exchanges before allowing done.
    const questionCount = safeConversation.length
    const forceContinue = parsed.done && questionCount < 4

    if (forceContinue) {
      console.info(`[INTERVIEW] Sonnet tried to end after ${questionCount} questions — forcing continuation`)
    }

    return {
      done: forceContinue ? false : (parsed.done ?? false),
      nextQuestion: forceContinue
        ? (parsed.nextQuestion ?? "A couple more things — what matters most to you about this build? Cost, speed, durability, or something else?")
        : (parsed.nextQuestion ?? undefined),
      suggestedChips: Array.isArray(parsed.suggestedChips) ? parsed.suggestedChips : (forceContinue ? ["Low cost", "Fast turnaround", "Maximum durability", "Best precision", "Great aesthetics"] : undefined),
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
    "claude-opus-4-7",
    4096, // Generous — brief fields + summary need room for specific engineering detail
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
    throw new Error(classifyAIError(err).message)
  }
}
