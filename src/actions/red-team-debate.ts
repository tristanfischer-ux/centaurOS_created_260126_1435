"use server"

/**
 * @file red-team-debate.ts — Multi-LLM adversarial debate generator
 *
 * @description Orchestrates a structured debate between 5 different LLMs,
 * each playing a distinct persona (Bull, Bear, Realist, Disruptor, Wildcard).
 * Includes pre-debate research swarm, per-round fact-checking, synthesis,
 * and auto-generated objectives/tasks.
 *
 * @security Requires authenticated user. API keys resolved server-side.
 */

import { v4 as uuidv4 } from "uuid"
import { getTextProvider } from "@/lib/ai-providers/registry"
import type { AIProviderId } from "@/lib/ai-providers/types"
import { withUser } from "@/lib/server-action-utils"
import {
  DEBATE_PERSONAS,
  DEBATE_ROUNDS,
  getPersonaSystemPrompt,
  getResearchPrompts,
  getFactCheckPrompt,
  getSynthesisPrompt,
  getClaimExtractionPrompt,
  getObjectivesPrompt,
  getTasksPrompt,
  getRiskMitigationsPrompt,
} from "@/lib/red-team/prompts"
import type {
  RedTeamDebateResult,
  RedTeamDebateDocument,
  DebateRound,
  DebateArgument,
  FactCheck,
  SuggestedObjective,
  SuggestedTask,
  SuggestedRiskMitigation,
  DebateRole,
} from "@/lib/red-team/types"

// ─── API Key Resolution ─────────────────────────────────────────

function resolveApiKey(providerId: AIProviderId): string {
  const envMap: Partial<Record<AIProviderId, string>> = {
    openai: process.env.OPENAI_API_KEY?.trim(),
    anthropic: process.env.ANTHROPIC_API_KEY?.trim(),
    google: process.env.GOOGLE_AI_API_KEY?.trim(),
    qwen: process.env.DASHSCOPE_API_KEY?.trim(),
    minimax: process.env.MINIMAX_API_KEY?.trim(),
    together: process.env.TOGETHER_API_KEY?.trim(),
  }
  const key = envMap[providerId]
  if (!key) throw new Error(`API key not configured for provider: ${providerId}`)
  return key
}

// ─── Single LLM Call (batch, non-streaming) ─────────────────────

async function callLLM(
  providerId: AIProviderId,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1500,
): Promise<{ text: string; duration: number }> {
  const streamFn = getTextProvider(providerId)
  if (!streamFn) throw new Error(`Provider ${providerId} does not support text`)

  const apiKey = resolveApiKey(providerId)
  const startTime = Date.now()
  let fullOutput = ""

  await new Promise<void>((resolve, reject) => {
    streamFn({
      apiKey,
      modelId,
      systemPrompt,
      userPrompt,
      maxTokens,
      onChunk: (text) => { fullOutput += text },
      onDone: () => resolve(),
      onError: (error) => reject(new Error(`${providerId}/${modelId}: ${error}`)),
    }).catch(reject)
  })

  return { text: fullOutput, duration: Date.now() - startTime }
}

// ─── Quick Haiku Call ───────────────────────────────────────────

async function callHaiku(prompt: string, maxTokens = 500): Promise<string> {
  try {
    const { text } = await callLLM(
      "anthropic",
      "claude-haiku-4-5",
      "You are a research assistant. Be concise, factual, and cite sources when possible.",
      prompt,
      maxTokens,
    )
    return text
  } catch (err) {
    console.warn("[RedTeam] Haiku call failed:", err)
    return "[Research unavailable]"
  }
}

// ─── Research Swarm ─────────────────────────────────────────────

async function runResearchSwarm(topic: string): Promise<string> {
  const prompts = getResearchPrompts(topic)
  const results = await Promise.all(prompts.map(p => callHaiku(p, 400)))

  const labels = [
    "Market Size & TAM",
    "Competitors & Comparables",
    "Pricing & Unit Economics",
    "Regulatory & Compliance",
    "Industry Analogies",
    "Technology Risks",
  ]

  return labels
    .map((label, i) => `### ${label}\n${results[i]}`)
    .join("\n\n")
}

// ─── Fact-Checking ──────────────────────────────────────────────

async function extractAndFactCheck(roundText: string): Promise<FactCheck[]> {
  // Extract claims
  let claims: string[] = []
  try {
    const extractionResult = await callHaiku(getClaimExtractionPrompt(roundText), 500)
    const parsed = JSON.parse(extractionResult.trim())
    if (Array.isArray(parsed)) claims = parsed.slice(0, 5) // Max 5 claims per round
  } catch {
    return [] // No verifiable claims found or parse error
  }

  if (claims.length === 0) return []

  // Fact-check each claim in parallel
  const checks = await Promise.all(
    claims.map(async (claim): Promise<FactCheck> => {
      try {
        const result = await callHaiku(getFactCheckPrompt(claim), 200)
        const verdictMatch = result.match(/VERDICT:\s*(verified|unverified|disputed|corrected)/i)
        const detailMatch = result.match(/DETAIL:\s*([\s\S]+)/i)
        return {
          claim,
          verdict: (verdictMatch?.[1]?.toLowerCase() as FactCheck["verdict"]) || "unverified",
          detail: detailMatch?.[1]?.trim() || result.trim(),
        }
      } catch {
        return { claim, verdict: "unverified", detail: "Fact-check failed" }
      }
    }),
  )

  return checks
}

// ─── Generate Suggested Actions ─────────────────────────────────

function safeParseJSON<T>(text: string): T[] {
  try {
    // Find JSON array in response (models sometimes wrap in markdown)
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    return JSON.parse(match[0])
  } catch {
    return []
  }
}

async function generateActions(
  topic: string,
  verdict: string,
  bearArguments: string,
  wildcardArguments: string,
): Promise<{
  objectives: SuggestedObjective[]
  tasks: SuggestedTask[]
  riskMitigations: SuggestedRiskMitigation[]
}> {
  const [objectivesRaw, tasksRaw, risksRaw] = await Promise.all([
    callHaiku(getObjectivesPrompt(topic, verdict), 800),
    callHaiku(getTasksPrompt(topic, verdict), 1000),
    callHaiku(getRiskMitigationsPrompt(topic, bearArguments, wildcardArguments), 800),
  ])

  return {
    objectives: safeParseJSON<SuggestedObjective>(objectivesRaw),
    tasks: safeParseJSON<SuggestedTask>(tasksRaw),
    riskMitigations: safeParseJSON<SuggestedRiskMitigation>(risksRaw),
  }
}

// ─── Main Orchestrator ──────────────────────────────────────────

export async function generateRedTeamDebate(input: {
  topic: string
  context?: string
}): Promise<RedTeamDebateResult> {
  return withUser(async () => {
    const startTime = Date.now()
    const { topic, context } = input

    if (!topic || topic.trim().length < 10) {
      return { success: false, error: "Topic must be at least 10 characters" }
    }

    try {
      // ── Step 1: Research Swarm ──────────────────────────────
      console.log("[RedTeam] Starting research swarm...")
      const evidencePack = await runResearchSwarm(topic)

      // ── Step 2: Debate Rounds ──────────────────────────────
      const rounds: DebateRound[] = []
      let fullTranscript = ""

      for (let roundIdx = 0; roundIdx < DEBATE_ROUNDS.length; roundIdx++) {
        const question = DEBATE_ROUNDS[roundIdx]
        console.log(`[RedTeam] Round ${roundIdx + 1}: ${question}`)

        const roundArguments: DebateArgument[] = []
        let roundText = ""

        // Each persona speaks sequentially, seeing all prior arguments
        for (const persona of DEBATE_PERSONAS) {
          const systemPrompt = getPersonaSystemPrompt(persona.role, topic)

          const userPrompt = `## Evidence Pack (Pre-Debate Research)
${evidencePack}

${context ? `## Additional Context Provided by User\n${context}\n\n` : ""}## Debate History So Far
${fullTranscript || "(This is the opening — no prior arguments yet.)"}

## Current Round (${roundIdx + 1}/${DEBATE_ROUNDS.length})
**Question: ${question}**

${roundText ? `### Arguments so far this round:\n${roundText}` : "(You are speaking first this round.)"}

Now make your argument as ${persona.label} (${persona.characterName}, ${persona.characterTitle}). Be specific, cite evidence, and respond directly to what others have said.`

          console.log(`[RedTeam]   ${persona.characterName} (${persona.label}) via ${persona.providerId}/${persona.modelId}...`)

          const { text, duration } = await callLLM(
            persona.providerId,
            persona.modelId,
            systemPrompt,
            userPrompt,
          )

          const argument: DebateArgument = {
            role: persona.role,
            characterName: persona.characterName,
            modelId: persona.modelId,
            content: text,
            duration,
          }

          roundArguments.push(argument)
          roundText += `\n### ${persona.label} (${persona.characterName})\n${text}\n`
        }

        fullTranscript += `\n## ROUND ${roundIdx + 1}: ${question}\n${roundText}`

        // ── Step 3: Fact-Check This Round ───────────────────
        console.log(`[RedTeam] Fact-checking round ${roundIdx + 1}...`)
        const factChecks = await extractAndFactCheck(roundText)

        rounds.push({
          roundNumber: roundIdx + 1,
          question,
          arguments: roundArguments,
          factChecks,
        })
      }

      // ── Step 4: Synthesis ──────────────────────────────────
      console.log("[RedTeam] Generating synthesis via Opus...")
      const { text: synthesisText } = await callLLM(
        "anthropic",
        "claude-opus-4-6",
        "You are writing the authoritative final synthesis of a multi-model Red Team debate. Be measured, specific, and honest about what the debate revealed.",
        getSynthesisPrompt(topic, fullTranscript),
        3000,
      )

      // Parse tensions table from synthesis
      const tensionsMatch = synthesisText.match(/## KEY TENSIONS[\s\S]*?(?=## VERDICT|$)/i)
      const verdictMatch = synthesisText.match(/## VERDICT[\s\S]*/i)
      const verdict = verdictMatch?.[0] || synthesisText

      // Parse tensions table rows (best effort)
      const tensions = parseTensionsTable(tensionsMatch?.[0] || "")

      // ── Step 5: Generate Actions ───────────────────────────
      console.log("[RedTeam] Generating suggested actions...")
      const bearArgs = rounds
        .flatMap(r => r.arguments.filter(a => a.role === "bear"))
        .map(a => a.content)
        .join("\n\n")
      const wildcardArgs = rounds
        .flatMap(r => r.arguments.filter(a => a.role === "wildcard"))
        .map(a => a.content)
        .join("\n\n")

      const actions = await generateActions(topic, verdict, bearArgs, wildcardArgs)

      // ── Step 6: Compose Document ───────────────────────────
      const document: RedTeamDebateDocument = {
        id: uuidv4(),
        topic,
        context,
        generatedAt: new Date().toISOString(),
        personas: DEBATE_PERSONAS,
        evidencePack,
        rounds,
        tensions,
        verdict,
        suggestedObjectives: actions.objectives,
        suggestedTasks: actions.tasks,
        suggestedRiskMitigations: actions.riskMitigations,
        totalDuration: Date.now() - startTime,
      }

      console.log(`[RedTeam] Debate complete in ${Math.round(document.totalDuration / 1000)}s`)

      return { success: true, document }
    } catch (err) {
      console.error("[RedTeam] Debate failed:", err)
      return {
        success: false,
        error: err instanceof Error ? err.message : "Debate generation failed",
      }
    }
  })
}

// ─── Helpers ────────────────────────────────────────────────────

function parseTensionsTable(text: string): RedTeamDebateDocument["tensions"] {
  // Best-effort parse of markdown table
  const rows = text.split("\n").filter(line => line.includes("|") && !line.includes("---"))
  if (rows.length < 2) return []

  // Skip header row
  return rows.slice(1).map(row => {
    const cells = row.split("|").map(c => c.trim()).filter(Boolean)
    return {
      dimension: cells[0] || "",
      bull: cells[1] || "",
      bear: cells[2] || "",
      realist: cells[3] || "",
      disruptor: cells[4] || "",
      wildcard: cells[5] || "",
    }
  }).filter(r => r.dimension.length > 0)
}
