/**
 * @file route.ts — Red Team Debate SSE streaming endpoint (v2)
 *
 * @description Streams a multi-LLM adversarial debate via Server-Sent Events.
 * Supports interactive mode (pause between rounds for user input),
 * numbered evidence linking, adaptive round questions, cost tracking,
 * and structured JSON tensions output.
 *
 * @security Requires authenticated user via Supabase cookie session.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { v4 as uuidv4 } from "uuid"
import { getTextProvider } from "@/lib/ai-providers/registry"
import type { AIProviderId } from "@/lib/ai-providers/types"
import { estimateAICost } from "@/lib/ai/usage-tracking"
import {
  DEBATE_PERSONAS,
  DEBATE_ROUNDS,
  getPersonaSystemPrompt,
  getResearchPrompts,
  getFactCheckPrompt,
  getClaimExtractionPrompt,
  getSynthesisPrompt,
  getObjectivesPrompt,
  getTasksPrompt,
  getRiskMitigationsPrompt,
  getAdaptiveQuestionsPrompt,
} from "@/lib/red-team/prompts"
import type {
  RedTeamDebateDocument,
  DebateRound,
  DebateArgument,
  FactCheck,
  TensionRow,
} from "@/lib/red-team/types"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── API Key Resolution ─────────────────────────────────────────

function resolveApiKey(providerId: AIProviderId): string {
  const envMap: Partial<Record<AIProviderId, string>> = {
    openai: process.env.OPENAI_API_KEY?.trim(),
    anthropic: process.env.ANTHROPIC_API_KEY?.trim(),
    google: process.env.GOOGLE_AI_API_KEY?.trim(),
    qwen: process.env.DASHSCOPE_API_KEY?.trim(),
  }
  const key = envMap[providerId]
  if (!key) throw new Error(`API key not configured for: ${providerId}`)
  return key
}

// ─── LLM Calls ──────────────────────────────────────────────────

async function callLLMStreaming(
  providerId: AIProviderId, modelId: string, systemPrompt: string, userPrompt: string,
  onChunk: (text: string) => void, maxTokens = 1500,
): Promise<{ text: string; duration: number; costUsd: number }> {
  const streamFn = getTextProvider(providerId)
  if (!streamFn) throw new Error(`Provider ${providerId} not available`)
  const apiKey = resolveApiKey(providerId)
  const start = Date.now()
  let output = ""

  await new Promise<void>((resolve, reject) => {
    streamFn({
      apiKey, modelId, systemPrompt, userPrompt, maxTokens,
      onChunk: (t) => { output += t; onChunk(t) },
      onDone: () => resolve(),
      onError: (e) => reject(new Error(`${providerId}/${modelId}: ${e}`)),
    }).catch(reject)
  })

  // Estimate cost from token count (rough: 4 chars ≈ 1 token)
  const promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4)
  const completionTokens = Math.ceil(output.length / 4)
  const costUsd = estimateAICost(modelId, promptTokens, completionTokens)

  return { text: output, duration: Date.now() - start, costUsd }
}

async function callHaiku(prompt: string, maxTokens = 500): Promise<string> {
  try {
    const result = await callLLMStreaming("anthropic", "claude-haiku-4-5", "Be concise, factual, cite sources.", prompt, () => {}, maxTokens)
    return result.text
  } catch (err) {
    console.warn("[RedTeam] Haiku call failed:", err instanceof Error ? err.message : err)
    return "[Research unavailable]"
  }
}

function safeParseJSON<T>(text: string): T[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch { return [] }
}

// ─── POST Handler ───────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json() as {
    topic: string
    context?: string
    /** Resume from a specific round with user input (interactive mode) */
    resumeFromRound?: number
    userInput?: string
    /** Prior state when resuming */
    priorRounds?: DebateRound[]
    priorTranscript?: string
    evidencePack?: string
    evidenceItems?: { label: string; content: string }[]
    customQuestions?: string[]
    userInputs?: Record<number, string>
    totalCostSoFar?: number
    debateId?: string
  }

  const { topic, context } = body
  if (!topic || topic.trim().length < 10) {
    return NextResponse.json({ error: "Topic must be at least 10 characters" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  // SECURITY: Validate debateId is a UUID if provided, otherwise generate one
  const debateId = (body.debateId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.debateId))
    ? body.debateId
    : uuidv4()
  const startTime = Date.now()
  const isResume = !!body.resumeFromRound

  const readable = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) }
        catch { /* stream closed */ }
      }

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")) }
        catch { clearInterval(heartbeat) }
      }, 15_000)

      let totalCostUsd = body.totalCostSoFar || 0

      try {
        // ── Research Swarm (skip if resuming) ────────────
        let evidencePack = body.evidencePack || ""
        let evidenceItems: { label: string; content: string }[] = body.evidenceItems || []
        let customQuestions: string[] = body.customQuestions || []

        if (!isResume) {
          emit({ phase: "research", message: "Researching market data, competitors, and analogies..." })
          const researchPrompts = getResearchPrompts(topic)
          const researchResults = await Promise.all(researchPrompts.map(p => callHaiku(p, 400)))
          const labels = ["Market Size & TAM", "Competitors", "Pricing & Unit Economics", "Regulatory", "Industry Analogies", "Technology Risks"]

          // Number each evidence item for citation
          evidenceItems = labels.map((l, i) => ({ label: l, content: researchResults[i] }))
          evidencePack = evidenceItems.map((item, i) => `[R${i + 1}] ${item.label}\n${item.content}`).join("\n\n")
          emit({ phase: "evidence", data: evidencePack, items: evidenceItems })

          // ── Adaptive Questions ─────────────────────────
          emit({ phase: "research", message: "Generating debate questions..." })
          try {
            const questionsRaw = await callHaiku(getAdaptiveQuestionsPrompt(topic), 300)
            const parsed = safeParseJSON<string>(questionsRaw)
            if (parsed.length >= 4) {
              customQuestions = parsed.slice(0, 5)
              emit({ phase: "custom_questions", questions: customQuestions })
            }
          } catch { /* use defaults */ }
        }

        const roundQuestions = customQuestions.length >= 4 ? customQuestions : DEBATE_ROUNDS
        const rounds: DebateRound[] = body.priorRounds || []
        let fullTranscript = body.priorTranscript || ""
        const userInputs: Record<number, string> = body.userInputs || {}
        const startRound = body.resumeFromRound || 0

        // If resuming with user input, add it to the transcript
        if (isResume && body.userInput && body.resumeFromRound) {
          const roundNum = body.resumeFromRound
          userInputs[roundNum] = body.userInput
          fullTranscript += `\n## FOUNDER INTERJECTION (after Round ${roundNum})\n${body.userInput}\n`
          emit({ phase: "user_input_recorded", round: roundNum, input: body.userInput })
        }

        // ── Debate Rounds ────────────────────────────────
        for (let roundIdx = startRound; roundIdx < roundQuestions.length; roundIdx++) {
          const question = roundQuestions[roundIdx]
          emit({ phase: "round_start", round: roundIdx + 1, question })

          const roundArguments: DebateArgument[] = []
          let roundText = ""

          for (const persona of DEBATE_PERSONAS) {
            emit({ phase: "persona_start", round: roundIdx + 1, persona: persona.role, characterName: persona.characterName, modelId: persona.modelId })

            const systemPrompt = getPersonaSystemPrompt(persona.role, topic)
            const userPrompt = `## Evidence Pack (cite as [R1], [R2], etc.)\n${evidencePack}\n\n${context ? `## User Context\n${context}\n\n` : ""}## Debate History\n${fullTranscript || "(Opening — no prior arguments.)"}\n\n## Round ${roundIdx + 1}/${roundQuestions.length}: ${question}\n${roundText ? `### This round so far:\n${roundText}` : "(You speak first.)"}\n\nMake your argument as ${persona.label} (${persona.characterName}). Be specific, cite evidence with [R1]-[R6] references.`

            // INTENT: If the primary provider fails (e.g., Qwen key expired), fall back
            // to Claude Sonnet so the debate continues. The persona keeps its personality
            // — only the underlying model changes.
            let usedModelId = persona.modelId
            let result: { text: string; duration: number; costUsd: number }
            try {
              result = await callLLMStreaming(
                persona.providerId, persona.modelId, systemPrompt, userPrompt,
                (chunk) => emit({ phase: "chunk", round: roundIdx + 1, persona: persona.role, chunk }),
              )
            } catch (primaryErr) {
              console.warn(`[RedTeam] ${persona.providerId}/${persona.modelId} failed, falling back to Sonnet:`, primaryErr instanceof Error ? primaryErr.message : primaryErr)
              emit({ phase: "chunk", round: roundIdx + 1, persona: persona.role, chunk: `*[${persona.characterName} running on fallback model]*\n\n` })
              usedModelId = "claude-sonnet-4-6 (fallback)"
              result = await callLLMStreaming(
                "anthropic", "claude-sonnet-4-6", systemPrompt, userPrompt,
                (chunk) => emit({ phase: "chunk", round: roundIdx + 1, persona: persona.role, chunk }),
              )
            }

            totalCostUsd += result.costUsd
            roundArguments.push({ role: persona.role, characterName: persona.characterName, modelId: usedModelId, content: result.text, duration: result.duration, costUsd: result.costUsd })
            roundText += `\n### ${persona.label} (${persona.characterName})\n${result.text}\n`
            emit({ phase: "persona_complete", round: roundIdx + 1, persona: persona.role, duration: result.duration, costUsd: result.costUsd })
          }

          fullTranscript += `\n## ROUND ${roundIdx + 1}: ${question}\n${roundText}`

          // Fact-check
          emit({ phase: "fact_check_start", round: roundIdx + 1 })
          let factChecks: FactCheck[] = []
          try {
            const extractionResult = await callHaiku(getClaimExtractionPrompt(roundText), 500)
            const claims = safeParseJSON<string>(extractionResult).slice(0, 5)
            if (claims.length > 0) {
              factChecks = await Promise.all(claims.map(async (claim): Promise<FactCheck> => {
                try {
                  const result = await callHaiku(getFactCheckPrompt(claim), 200)
                  const vm = result.match(/VERDICT:\s*(verified|unverified|disputed|corrected)/i)
                  const dm = result.match(/DETAIL:\s*([\s\S]+)/i)
                  return { claim, verdict: (vm?.[1]?.toLowerCase() as FactCheck["verdict"]) || "unverified", detail: dm?.[1]?.trim() || result.trim() }
                } catch { return { claim, verdict: "unverified" as const, detail: "Check failed" } }
              }))
            }
          } catch { /* continue */ }
          emit({ phase: "fact_check_complete", round: roundIdx + 1, checks: factChecks })

          rounds.push({
            roundNumber: roundIdx + 1,
            question,
            arguments: roundArguments,
            factChecks,
            // Set userInput on the round if the user interjected after it (for DOCX export)
            userInput: userInputs[roundIdx + 1],
          })

          // ── Interactive pause (after each round except the last) ──
          if (roundIdx < roundQuestions.length - 1) {
            emit({
              phase: "awaiting_input",
              round: roundIdx + 1,
              message: "Add your thoughts before the next round, or skip to continue.",
              // Send state so client can resume
              state: {
                priorRounds: rounds,
                priorTranscript: fullTranscript,
                evidencePack,
                evidenceItems,
                customQuestions: roundQuestions,
                userInputs,
                totalCostSoFar: totalCostUsd,
                debateId,
              },
            })
            // Close stream — client will re-POST to resume
            clearInterval(heartbeat)
            try { controller.close() } catch { /* already closed */ }
            return
          }
        }

        // ── Synthesis ────────────────────────────────────
        emit({ phase: "synthesis_start", message: "Writing verdict..." })
        const { text: synthesisText, costUsd: synthCost } = await callLLMStreaming(
          "anthropic", "claude-opus-4-6",
          "Write the authoritative final synthesis. Be measured, specific, honest.",
          getSynthesisPrompt(topic, fullTranscript),
          (chunk) => emit({ phase: "synthesis_chunk", chunk }),
          3000,
        )
        totalCostUsd += synthCost

        // Parse JSON tensions
        let tensions: TensionRow[] = []
        const jsonMatch = synthesisText.match(/```json\s*([\s\S]*?)```/)
        if (jsonMatch) {
          try { tensions = JSON.parse(jsonMatch[1]) } catch { /* fallback below */ }
        }
        if (tensions.length === 0) {
          // Fallback: regex parse markdown table
          tensions = parseTensionsTable(synthesisText)
        }

        const verdictMatch = synthesisText.match(/## VERDICT[\s\S]*/i)
        const verdict = verdictMatch?.[0] || synthesisText

        // ── Actions ──────────────────────────────────────
        emit({ phase: "actions_start", message: "Generating recommended actions..." })
        const bearArgs = rounds.flatMap(r => r.arguments.filter(a => a.role === "bear")).map(a => a.content).join("\n\n")
        const wildcardArgs = rounds.flatMap(r => r.arguments.filter(a => a.role === "wildcard")).map(a => a.content).join("\n\n")

        const [objRaw, taskRaw, riskRaw] = await Promise.all([
          callHaiku(getObjectivesPrompt(topic, verdict), 800),
          callHaiku(getTasksPrompt(topic, verdict), 1000),
          callHaiku(getRiskMitigationsPrompt(topic, bearArgs, wildcardArgs), 800),
        ])

        const suggestedObjectives = safeParseJSON(objRaw) as RedTeamDebateDocument["suggestedObjectives"]
        const suggestedTasks = safeParseJSON(taskRaw) as RedTeamDebateDocument["suggestedTasks"]
        const suggestedRiskMitigations = safeParseJSON(riskRaw) as RedTeamDebateDocument["suggestedRiskMitigations"]

        emit({ phase: "actions_complete", objectives: suggestedObjectives, tasks: suggestedTasks, risks: suggestedRiskMitigations })

        // ── Compose Document ─────────────────────────────
        const document: RedTeamDebateDocument = {
          id: debateId, topic, context,
          generatedAt: new Date().toISOString(),
          personas: DEBATE_PERSONAS,
          evidencePack, evidenceItems,
          rounds, tensions, verdict,
          customQuestions: customQuestions.length > 0 ? customQuestions : undefined,
          userInputs: Object.keys(userInputs).length > 0 ? userInputs : undefined,
          suggestedObjectives, suggestedTasks, suggestedRiskMitigations,
          totalDuration: Date.now() - startTime,
          totalCostUsd: Number(totalCostUsd.toFixed(4)),
        }

        emit({ phase: "complete", document })

        // ── Save to History (fire-and-forget) ────────────
        const profileData = await supabase.from("profiles").select("foundry_id").eq("id", user.id).single()
        const userFoundryId = profileData.data?.foundry_id
        if (userFoundryId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(supabase as any).from("report_snapshots").insert({
            id: debateId,
            report_type: "red-team-debate",
            report_date: new Date().toISOString().slice(0, 10),
            summary_text: `Red Team Debate: ${topic.slice(0, 200)}`,
            report_data: document,
            foundry_id: userFoundryId,
            profile_id: user.id,
          }).then(({ error }: { error: { message: string } | null }) => {
            if (error) console.warn("[RedTeam] Save failed:", error.message)
          })
        } else {
          console.warn("[RedTeam] No foundry_id found for user, debate not saved to history")
        }

      } catch (err) {
        emit({ phase: "error", message: err instanceof Error ? err.message : "Debate failed" })
      } finally {
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  })
}

function parseTensionsTable(text: string): TensionRow[] {
  const rows = text.split("\n").filter(line => line.includes("|") && !line.includes("---"))
  if (rows.length < 2) return []
  return rows.slice(1).map(row => {
    const cells = row.split("|").map(c => c.trim()).filter(Boolean)
    return { dimension: cells[0] || "", bull: cells[1] || "", bear: cells[2] || "", realist: cells[3] || "", disruptor: cells[4] || "", wildcard: cells[5] || "" }
  }).filter(r => r.dimension.length > 0)
}
