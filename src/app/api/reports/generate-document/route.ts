/**
 * @file route.ts — SSE endpoint for document skill generation
 *
 * @description Streams a Claude Opus 4.6-generated document back to the client
 * via Server-Sent Events. Supports auto-data enrichment from Supabase and
 * saves the result to report_snapshots.
 *
 * @related
 * - src/lib/document-skills/ — Skill definitions and types
 * - src/lib/document-skills/data-collector.ts — Auto-data collection
 * - src/app/(platform)/reports/page.tsx — Client-side consumer
 */

import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"
import { createClient } from "@/lib/supabase/server"
import { aiGuard } from "@/lib/ai/guard"
import { rateLimit } from "@/lib/security/rate-limit"
import { getSkillById } from "@/lib/document-skills"
import { collectAutoData } from "@/lib/document-skills/data-collector"
import { WORD_RANGES } from "@/lib/document-skills/types"

import type { GenerateDocumentRequest, SkillDocumentResult, DocumentTone } from "@/lib/document-skills/types"
import type { Json } from "@/types/database.types"

export const runtime = "nodejs"
export const maxDuration = 300

// ─── SSE types ──────────────────────────────────────────────────────

type SSEEvent =
  | { type: "progress"; message: string; percent?: number }
  | { type: "chunk"; text: string }
  | { type: "complete"; result: SkillDocumentResult }
  | { type: "error"; message: string }

// ─── POST handler ───────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // AUTH + AI GATE: Verify user session and check AI usage limits
  const supabase = await createClient()
  const guard = await aiGuard(supabase, 'report_generation')
  if (guard.denied) return guard.response
  const user = { id: guard.userId }

  // SECURITY: Rate limit
  const rateLimitResult = await rateLimit("api", `doc-skill:${user.id}`, {
    limit: 20,
    window: 60 * 60 * 1000,
  })
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before generating more documents." },
      { status: 429 },
    )
  }

  // Parse request
  let body: GenerateDocumentRequest
  try {
    body = (await request.json()) as GenerateDocumentRequest
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { skillId, userContext, tone, length, includeAutoData, questionAnswers } = body

  // VALIDATION
  if (!skillId || !userContext?.trim()) {
    return NextResponse.json({ error: "skillId and userContext are required" }, { status: 400 })
  }

  if (userContext.length > 20000) {
    return NextResponse.json({ error: "Context too long (max 20,000 characters)" }, { status: 400 })
  }

  const skill = getSkillById(skillId)
  if (!skill) {
    return NextResponse.json({ error: "Unknown skill" }, { status: 400 })
  }

  const foundryId = guard.foundryId
  if (!foundryId) {
    return NextResponse.json({ error: "No foundry context" }, { status: 400 })
  }

  const { data: foundry } = await supabase
    .from("foundries")
    .select("name")
    .eq("id", foundryId)
    .single()

  const foundryName = foundry?.name ?? "My Company"

  // SSE setup
  const encoder = new TextEncoder()
  function formatSSE(event: SSEEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: SSEEvent) => {
        try {
          controller.enqueue(formatSSE(event))
        } catch {
          // Stream closed
        }
      }

      try {
        // Step 1: Collect auto-data
        let autoDataText = ""
        if (includeAutoData && skill.autoDataSources.length > 0) {
          emit({ type: "progress", message: "Collecting company data…", percent: 10 })
          try {
            autoDataText = await collectAutoData(skill.autoDataSources, foundryId)
          } catch (err) {
            console.warn("[DocumentSkill] Auto-data collection failed:", err)
            // Continue without auto-data — not a fatal error
          }
        }

        // Step 2: Build prompt
        emit({ type: "progress", message: "Preparing document…", percent: 20 })
        const wordRange = WORD_RANGES[length] ?? WORD_RANGES.standard
        const toneInstruction = buildToneInstruction(tone)

        const systemPrompt = [
          skill.systemPrompt,
          "",
          `Write approximately ${wordRange.min}–${wordRange.max} words.`,
          toneInstruction,
          "Output the document in Markdown format. Use proper heading hierarchy (##, ###, ####), tables, and lists.",
          "Do not include any preamble or meta-commentary — begin directly with the document content.",
        ].join("\n")

        // Format Q&A block if guided questions were answered
        let qaBlock = ""
        if (questionAnswers && typeof questionAnswers === "object") {
          const entries = Object.entries(questionAnswers).filter(([, a]) => a?.trim())
          if (entries.length > 0) {
            qaBlock = "# Clarifying Questions & Answers\n\n" +
              entries.map(([q, a]) => `Q: ${q}\nA: ${a.trim()}`).join("\n\n") +
              "\n\n---\n\n"
          }
        }

        const userMessage = [
          autoDataText ? `# Company Context\n\n${autoDataText}\n\n---\n\n` : "",
          qaBlock,
          `# User Brief\n\n${userContext.trim()}`,
        ].join("")

        // Step 3: Call Claude Opus 4.6 with streaming
        emit({ type: "progress", message: "Generating document…", percent: 30 })

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() })

        let fullContent = ""
        let tokensUsed = 0

        const messageStream = client.messages.stream({
          model: "claude-opus-4-7",
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        })

        for await (const event of messageStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text
            fullContent += text
            emit({ type: "chunk", text })
          }
        }

        const finalMessage = await messageStream.finalMessage()
        tokensUsed = (finalMessage.usage?.input_tokens ?? 0) + (finalMessage.usage?.output_tokens ?? 0)

        guard.trackUsage({
          model: 'claude-opus-4-7',
          promptTokens: finalMessage.usage?.input_tokens,
          completionTokens: finalMessage.usage?.output_tokens,
        }).catch(() => {})

        if (!fullContent.trim()) {
          emit({ type: "error", message: "Document generation returned empty content" })
          // GOTCHA: Don't close here — finally block handles it. Double close throws TypeError.
          return
        }

        // Step 4: Build result
        emit({ type: "progress", message: "Finalising document…", percent: 90 })

        const wordCount = fullContent.trim().split(/\s+/).length
        const result: SkillDocumentResult = {
          id: uuidv4(),
          skillId: skill.id,
          title: skill.title,
          content: fullContent,
          wordCount,
          generatedAt: new Date().toISOString(),
          foundryId,
          foundryName,
          tone,
          tokensUsed,
        }

        // Step 5: Save to report_snapshots
        const snapshotData = {
          foundry_id: foundryId,
          profile_id: user.id,
          report_type: "skill-document",
          report_date: new Date().toISOString().split("T")[0],
          report_data: result as unknown as Json,
          summary_text: `${skill.title} — ${wordCount} words`,
          generated_at: result.generatedAt,
        }

        const { error: saveErr } = await supabase.from("report_snapshots").insert(snapshotData)
        if (saveErr) {
          console.warn("[DocumentSkill] Failed to save snapshot:", saveErr)
        }

        emit({ type: "complete", result })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error during document generation"
        console.error("[DocumentSkill] Generation failed:", err)
        emit({ type: "error", message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildToneInstruction(tone: DocumentTone): string {
  switch (tone) {
    case "executive":
      return "Write in a formal, executive tone — concise, confident, suitable for board members and investors."
    case "technical":
      return "Write in a technical, precise tone — detailed, factual, suitable for engineers and specialists."
    case "conversational":
      return "Write in a friendly, conversational tone — approachable, clear, suitable for team-wide communication."
    case "professional":
    default:
      return "Write in a professional, clear tone — balanced between formal and approachable."
  }
}
