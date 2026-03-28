/**
 * @file route.ts — Red Team Debate SSE streaming endpoint
 *
 * @description Streams a multi-LLM adversarial debate via Server-Sent Events.
 * Each persona's argument streams incrementally to the client, with progress
 * events for research, fact-checking, synthesis, and action generation.
 *
 * Uses 15-second heartbeat to prevent Vercel idle timeout.
 * Saves completed debates to report_snapshots for history.
 *
 * @security Requires authenticated user via Supabase cookie session.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { v4 as uuidv4 } from "uuid"
import { getTextProvider } from "@/lib/ai-providers/registry"
import type { AIProviderId } from "@/lib/ai-providers/types"
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
} from "@/lib/red-team/prompts"
import type {
  RedTeamDebateDocument,
  DebateRound,
  DebateArgument,
  FactCheck,
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
  if (!key) throw new Error(`API key not configured for provider: ${providerId}`)
  return key
}

// ─── LLM Call (batch — collects full output) ────────────────────

async function callLLMBatch(
  providerId: AIProviderId,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1500,
): Promise<{ text: string; duration: number }> {
  const streamFn = getTextProvider(providerId)
  if (!streamFn) throw new Error(`Provider ${providerId} not available`)
  const apiKey = resolveApiKey(providerId)
  const start = Date.now()
  let output = ""

  await new Promise<void>((resolve, reject) => {
    streamFn({
      apiKey, modelId, systemPrompt, userPrompt, maxTokens,
      onChunk: (t) => { output += t },
      onDone: () => resolve(),
      onError: (e) => reject(new Error(`${providerId}/${modelId}: ${e}`)),
    }).catch(reject)
  })

  return { text: output, duration: Date.now() - start }
}

// ─── LLM Call (streaming — emits chunks via callback) ───────────

async function callLLMStreaming(
  providerId: AIProviderId,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
  maxTokens = 1500,
): Promise<{ text: string; duration: number }> {
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

  return { text: output, duration: Date.now() - start }
}

// ─── Quick Haiku ────────────────────────────────────────────────

async function callHaiku(prompt: string, maxTokens = 500): Promise<string> {
  try {
    const { text } = await callLLMBatch("anthropic", "claude-haiku-4-5", "Be concise, factual, cite sources.", prompt, maxTokens)
    return text
  } catch { return "[Research unavailable]" }
}

// ─── JSON Parser ────────────────────────────────────────────────

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

  const { topic, context } = await request.json() as { topic: string; context?: string }
  if (!topic || topic.trim().length < 10) {
    return NextResponse.json({ error: "Topic must be at least 10 characters" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const debateId = uuidv4()
  const startTime = Date.now()

  const readable = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) }
        catch { /* stream closed */ }
      }

      // Heartbeat — prevents Vercel idle timeout
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")) }
        catch { clearInterval(heartbeat) }
      }, 15_000)

      try {
        // ── Research Swarm ───────────────────────────────
        emit({ phase: "research", message: "Researching market data, competitors, and analogies..." })
        const researchPrompts = getResearchPrompts(topic)
        const researchResults = await Promise.all(researchPrompts.map(p => callHaiku(p, 400)))
        const labels = ["Market Size & TAM", "Competitors", "Pricing & Unit Economics", "Regulatory", "Industry Analogies", "Technology Risks"]
        const evidencePack = labels.map((l, i) => `### ${l}\n${researchResults[i]}`).join("\n\n")
        emit({ phase: "evidence", data: evidencePack })

        // ── Debate Rounds ────────────────────────────────
        const rounds: DebateRound[] = []
        let fullTranscript = ""

        for (let roundIdx = 0; roundIdx < DEBATE_ROUNDS.length; roundIdx++) {
          const question = DEBATE_ROUNDS[roundIdx]
          emit({ phase: "round_start", round: roundIdx + 1, question })

          const roundArguments: DebateArgument[] = []
          let roundText = ""

          for (const persona of DEBATE_PERSONAS) {
            emit({ phase: "persona_start", round: roundIdx + 1, persona: persona.role, characterName: persona.characterName, modelId: persona.modelId })

            const systemPrompt = getPersonaSystemPrompt(persona.role, topic)
            const userPrompt = `## Evidence Pack\n${evidencePack}\n\n${context ? `## User Context\n${context}\n\n` : ""}## Debate History\n${fullTranscript || "(Opening — no prior arguments.)"}\n\n## Round ${roundIdx + 1}/${DEBATE_ROUNDS.length}: ${question}\n${roundText ? `### This round so far:\n${roundText}` : "(You speak first.)"}\n\nMake your argument as ${persona.label} (${persona.characterName}). Be specific, cite evidence.`

            const { text, duration } = await callLLMStreaming(
              persona.providerId,
              persona.modelId,
              systemPrompt,
              userPrompt,
              (chunk) => emit({ phase: "chunk", round: roundIdx + 1, persona: persona.role, chunk }),
            )

            roundArguments.push({ role: persona.role, characterName: persona.characterName, modelId: persona.modelId, content: text, duration })
            roundText += `\n### ${persona.label} (${persona.characterName})\n${text}\n`
            emit({ phase: "persona_complete", round: roundIdx + 1, persona: persona.role, duration })
          }

          fullTranscript += `\n## ROUND ${roundIdx + 1}: ${question}\n${roundText}`

          // Fact-check this round
          emit({ phase: "fact_check_start", round: roundIdx + 1 })
          let factChecks: FactCheck[] = []
          try {
            const extractionResult = await callHaiku(getClaimExtractionPrompt(roundText), 500)
            const claims: string[] = safeParseJSON<string>(extractionResult).slice(0, 5)
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
          } catch { /* claim extraction failed — continue without fact-checks */ }
          emit({ phase: "fact_check_complete", round: roundIdx + 1, checks: factChecks })

          rounds.push({ roundNumber: roundIdx + 1, question, arguments: roundArguments, factChecks })
        }

        // ── Synthesis ────────────────────────────────────
        emit({ phase: "synthesis_start", message: "Writing verdict..." })
        let synthesisText = ""
        await callLLMStreaming(
          "anthropic", "claude-opus-4-6",
          "Write the authoritative final synthesis. Be measured, specific, honest.",
          getSynthesisPrompt(topic, fullTranscript),
          (chunk) => { synthesisText += ""; emit({ phase: "synthesis_chunk", chunk }) },
          3000,
        ).then(r => { synthesisText = r.text })

        // Parse tensions
        const tensionsMatch = synthesisText.match(/## KEY TENSIONS[\s\S]*?(?=## VERDICT|$)/i)
        const verdictMatch = synthesisText.match(/## VERDICT[\s\S]*/i)
        const verdict = verdictMatch?.[0] || synthesisText

        const tensions = parseTensionsTable(tensionsMatch?.[0] || "")

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
          id: debateId,
          topic, context,
          generatedAt: new Date().toISOString(),
          personas: DEBATE_PERSONAS,
          evidencePack,
          rounds, tensions, verdict,
          suggestedObjectives, suggestedTasks, suggestedRiskMitigations,
          totalDuration: Date.now() - startTime,
        }

        emit({ phase: "complete", document })

        // ── Save to History (fire-and-forget) ────────────
        const profileData = await supabase.from("profiles").select("foundry_id").eq("id", user.id).single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(supabase as any).from("report_snapshots").insert({
          id: debateId,
          report_type: "red-team-debate",
          report_date: new Date().toISOString().slice(0, 10),
          summary_text: `Red Team Debate: ${topic.slice(0, 200)}`,
          report_data: document,
          foundry_id: profileData.data?.foundry_id || "unknown",
          profile_id: user.id,
        }).then(({ error }: { error: { message: string } | null }) => {
          if (error) console.warn("[RedTeam] Failed to save snapshot:", error.message)
          else console.log("[RedTeam] Saved debate snapshot:", debateId)
        })

      } catch (err) {
        emit({ phase: "error", message: err instanceof Error ? err.message : "Debate generation failed" })
      } finally {
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}

// ─── Helpers ────────────────────────────────────────────────────

function parseTensionsTable(text: string): RedTeamDebateDocument["tensions"] {
  const rows = text.split("\n").filter(line => line.includes("|") && !line.includes("---"))
  if (rows.length < 2) return []
  return rows.slice(1).map(row => {
    const cells = row.split("|").map(c => c.trim()).filter(Boolean)
    return { dimension: cells[0] || "", bull: cells[1] || "", bear: cells[2] || "", realist: cells[3] || "", disruptor: cells[4] || "", wildcard: cells[5] || "" }
  }).filter(r => r.dimension.length > 0)
}
