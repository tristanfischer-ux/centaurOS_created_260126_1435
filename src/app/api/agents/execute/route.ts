import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/security/rate-limit"
import { checkAILimit } from "@/lib/ai/limit-check"
import { estimateAICost, trackAIUsage, MODALITY_FEATURE_MAP } from "@/lib/ai/usage-tracking"
import { countTokens } from "@/lib/agent-memory"
import { getTextProvider, getImageProvider, getAudioProvider, getVideoProvider } from "@/lib/ai-providers/registry"
import { decryptApiKey } from "@/lib/ai-providers/key-vault"
import type { AIProviderId, OutputModality } from "@/lib/ai-providers/types"
import { PROVIDER_REGISTRY } from "@/lib/ai-providers/types"
import {
    getMemoryContext,
    formatObservationsForPrompt,
    getConversationHistory,
    addMemoryMessage,
} from "@/lib/agent-memory"
import type { ConversationMessage } from "@/lib/agent-memory"
import { buildAIContext } from "@/lib/ai-context/builder"
import { getSpecialistById, SPECIALISTS } from "@/app/(platform)/agents/specialists-data"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"
import { compilePersonalityPrompt, compileRelationshipContext } from "@/lib/agents/personality"
import { createRollout, finishRollout } from "@/lib/agent-spans"
import { FAST_MODEL_CHAIN, buildSpeculativeFastPrompt, parseComplexityTag } from "@/lib/agents/speculative-prompt"
// AUDIT: Converted 9 dynamic imports to static (2026-02-19, refactor step 5 of 8).
// Dynamic imports in a server-side API route provide no bundle benefit. Static
// imports improve readability and eliminate runtime import overhead.
import { getSpecialistWorkflows } from "@/lib/agents/specialist-workflows"
// AUDIT: Decision journal imports moved to post-response-handler.ts (2026-02-19, refactor step 7 of 8)
import { buildContextLayers, buildCrossSpecialistContext } from "@/lib/agents/prompt-builder"
import { classifyComplexity } from "@/lib/agents/complexity-classifier"
import { buildHandoffContext } from "@/lib/agents/handoff-context"
import { createPostResponseCallback } from "@/lib/agents/post-response-handler"
import { shouldTriggerWebSearch, runPreSearch, formatSearchResultsForPrompt } from "@/lib/agents/web-search"
import { getToolsForSpecialist, executeToolCall } from "@/lib/agents/tools/registry"
import type { ToolDefinition } from "@/lib/ai-providers/types"
import { loadDomainKnowledge } from "@/lib/agents/domain-knowledge"
import { getPageActions, filterActionsBySpecialist, serializePageActions } from "@/lib/page-actions"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min for video generation

const SYSTEM_PROMPT = `You are a world-class business strategist and AI assistant helping startup founders and operators build, grow, and scale their companies.

## Your Standards
- Be direct and actionable. Every recommendation should be something the reader can act on this week.
- Write for busy founders — use clear structure, short paragraphs, and bullet points. No filler, no fluff, no corporate speak.
- Use markdown formatting: headers for sections, tables for comparative data, bold for key terms, bullet points for lists.
- When presenting numbers, use tables. When comparing options, use tables. When showing timelines, use tables.

## Honesty & Accuracy
- Clearly distinguish between: (1) data the user provided, (2) widely-accepted industry knowledge, and (3) your estimates or assumptions.
- Flag assumptions explicitly: "Assumption: ..." or mark estimates with "~" or "[estimated]".
- Never fabricate specific statistics, company names, or benchmark numbers. If you don't have real data, say so and provide ranges or directional guidance instead.
- When uncertain, say "I'd recommend validating this with..." rather than presenting guesses as facts.

## Output Quality
- Prioritize depth on the 2-3 most important points over shallow coverage of everything.
- End with clear next steps: who does what, by when.
- If the user's input is missing critical information, note what's missing and work with what you have rather than asking questions (since this is a one-shot prompt, not a conversation).
- Calibrate your response length to the complexity of the request — don't pad short answers.`

const SLIDES_SYSTEM_PROMPT = `You are a world-class slide deck creator. Generate a structured slide deck in JSON format that will be rendered as a visual presentation with AI-generated images.

Return ONLY valid JSON wrapped in a markdown code block. Use this exact structure:

\`\`\`json
{
  "title": "Deck Title",
  "slides": [
    {
      "title": "Slide Title",
      "subtitle": "Optional subtitle",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "notes": "Speaker notes",
      "layout": "title",
      "imagePrompt": "A concise visual description for AI image generation"
    }
  ],
  "theme": {
    "primaryColor": "EA580C",
    "secondaryColor": "1E293B"
  }
}
\`\`\`

Layout options: "title" (first slide), "content" (standard), "two-column" (split bullets), "closing" (last slide).

CRITICAL — imagePrompt guidelines:
- Every slide MUST have an imagePrompt field
- Describe a professional, modern visual that reinforces the slide's message
- Style: clean minimal 16:9 layout, dark navy/charcoal background, white text, orange (#FF4500) accents
- Use abstract data visualizations, geometric patterns, icons, or conceptual imagery
- NO stock photos, no people, no clichés — use abstract shapes, gradients, charts, and diagrams
- Keep prompts under 100 words
- Title slides: bold typographic visual with the deck title
- Content slides: relevant data viz, process diagram, or conceptual illustration
- Closing slides: impactful summary visual or call-to-action design

Create 6-12 slides. Make content concise, professional, and actionable. Every bullet should earn its place.`

// ─── Provider Failover Configuration ─────────────────────────────────

/**
 * Model tier type matching specialists-data.ts modelTier field.
 * Used to look up the fallback chain when a primary provider fails.
 */
type ModelTier = "claude" | "qwen" | "qwen-local" | "minimax"

interface ProviderTarget {
    providerId: AIProviderId
    modelId: string
}

/**
 * Ordered fallback chains per model tier. When the primary provider returns
 * a retryable error (503, rate limit, network), the system tries the next
 * provider in the chain. The first entry is the primary (same as MODEL_TIERS
 * on the client). "qwen-local" has no fallbacks — local-only by design.
 *
 * @security Failover never crosses the qwen-local boundary. If you chose
 * local inference for privacy, a cloud fallback would violate that contract.
 */
const FALLBACK_CHAINS: Record<ModelTier, ProviderTarget[]> = {
    claude: [
        { providerId: "anthropic", modelId: "claude-sonnet-4-6" },
        { providerId: "together", modelId: "Qwen/Qwen3.5-397B-A17B" },
        { providerId: "google", modelId: "gemini-3.1-pro-preview" },
        { providerId: "openai", modelId: "gpt-5.3-instant" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
    ],
    qwen: [
        { providerId: "qwen", modelId: "qwen3.5-plus" },
        { providerId: "together", modelId: "Qwen/Qwen3.5-397B-A17B" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
        { providerId: "openai", modelId: "gpt-5.3-instant" },
    ],
    minimax: [
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
        { providerId: "together", modelId: "Qwen/Qwen3.5-397B-A17B" },
        { providerId: "qwen", modelId: "qwen3.5-plus" },
        { providerId: "openai", modelId: "gpt-5.3-instant" },
    ],
    "qwen-local": [
        { providerId: "qwen-local", modelId: "qwen3:30b-a3b" },
        // No fallbacks — local-only for privacy
    ],
}

// AUDIT: isRetryableError extracted to src/lib/agents/error-classification.ts (2026-02-19, refactor step 3 of 8)
import { isRetryableError } from "@/lib/agents/error-classification"

/**
 * Resolves the platform API key for a given provider from environment variables.
 *
 * @description Centralises the env var → API key mapping so both the primary
 * request path and failover attempts use the same resolution logic.
 *
 * @param pid - The provider ID to resolve an API key for
 * @returns The API key string, or null if not configured
 */
function resolveApiKeyForProvider(pid: AIProviderId): string | null {
    const envMap: Partial<Record<AIProviderId, string>> = {
        openai: process.env.OPENAI_API_KEY?.trim() ?? "",
        anthropic: process.env.ANTHROPIC_API_KEY?.trim() ?? "",
        google: process.env.GOOGLE_AI_API_KEY?.trim() ?? "",
        qwen: process.env.DASHSCOPE_API_KEY?.trim() ?? "",
        "qwen-local": "ollama",
        stability: process.env.STABILITY_API_KEY?.trim() ?? "",
        elevenlabs: process.env.ELEVENLABS_API_KEY?.trim() ?? "",
        replicate: process.env.REPLICATE_API_TOKEN ?? "",
        minimax: process.env.MINIMAX_API_KEY?.trim() ?? "",
        together: process.env.TOGETHER_API_KEY?.trim() ?? "",
    }
    const key = envMap[pid]
    return key || null
}

export async function POST(request: Request) {
    // 1. Authenticate
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // SECURITY: Rate limit to prevent API cost abuse (AI calls are expensive)
    const rateLimitResult = await rateLimit('api', `agent-execute:${user.id}`, { limit: 30, window: 3600 * 1000 })
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: "Rate limit exceeded. Please wait before running more AI agents." },
            { status: 429 }
        )
    }

    // 2. Parse body
    let prompt: string
    let input: string
    let providerId: AIProviderId
    let modelId: string
    let modality: OutputModality
    let threadId: string | undefined
    let customSystemPromptSuffix: string | undefined
    let specialistId: string | undefined
    let enableThinking: boolean
    let videoConfig: { duration?: number; resolution?: string; promptOptimizer?: boolean } | undefined
    let firstFrameImage: string | undefined
    let modelTier: ModelTier | undefined
    let attachments: Array<{ path?: string; url?: string | null; filename?: string; mimeType?: string }> | undefined
    let speculative: boolean
    let handoffSourceThreadId: string | undefined
    let handoffSourceSpecialistId: string | undefined
    let healedThreadId: string | null = null
    // Attaches X-New-Thread-Id header when a stale thread was auto-healed
    const withHealedThreadHeader = (response: Response): Response => {
        if (!healedThreadId) return response
        const headers = new Headers(response.headers)
        headers.set("X-New-Thread-Id", healedThreadId)
        return new Response(response.body, { headers })
    }
    let currentRoute: string | undefined
    let cadLabProjectId: string | undefined

    try {
        const body = await request.json()
        prompt = body.prompt
        input = body.input ?? ""
        providerId = body.providerId ?? "anthropic"
        modelId = body.modelId ?? "claude-sonnet-4-6"
        modality = body.modality ?? "text"
        threadId = body.threadId ?? undefined
        customSystemPromptSuffix =
            typeof body.customSystemPromptSuffix === "string"
                ? body.customSystemPromptSuffix.slice(0, 2000)
                : undefined
        specialistId = typeof body.specialistId === "string" ? body.specialistId : undefined
        enableThinking = body.enableThinking === true
        videoConfig = body.videoConfig ?? undefined
        firstFrameImage = typeof body.firstFrameImage === "string" ? body.firstFrameImage : undefined
        modelTier = (typeof body.modelTier === "string" && body.modelTier in FALLBACK_CHAINS)
            ? body.modelTier as ModelTier
            : undefined
        attachments = Array.isArray(body.attachments)
            ? body.attachments.filter(
                (a: unknown): a is { path?: string; url?: string | null; filename?: string; mimeType?: string } =>
                    typeof a === "object" && a !== null && (typeof (a as { url?: unknown }).url === "string" || (a as { url?: unknown }).url === null)
            )
            : undefined
        speculative = body.speculative === true
        handoffSourceThreadId = typeof body.handoffSourceThreadId === "string" ? body.handoffSourceThreadId : undefined
        handoffSourceSpecialistId = typeof body.handoffSourceSpecialistId === "string" ? body.handoffSourceSpecialistId : undefined
        currentRoute = typeof body.currentRoute === "string" ? body.currentRoute : undefined
        cadLabProjectId = typeof body.cadLabProjectId === "string" ? body.cadLabProjectId : undefined

        if (!prompt || typeof prompt !== "string") {
            return NextResponse.json({ error: "prompt is required" }, { status: 400 })
        }
        if (typeof input !== "string") {
            return NextResponse.json({ error: "input must be a string" }, { status: 400 })
        }
        if (prompt.length > 50_000) {
            return NextResponse.json({ error: "prompt too long (max 50k chars)" }, { status: 400 })
        }
        if (input.length > 100_000) {
            return NextResponse.json({ error: "input too long (max 100k chars)" }, { status: 400 })
        }
        if (!PROVIDER_REGISTRY[providerId]) {
            return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 })
        }
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // 3. Resolve API key
    // Platform provides AI — use env vars by default.
    // Users can optionally bring their own key (BYOK) to override.
    let apiKey: string | null = resolveApiKeyForProvider(providerId)
    let keySource: "platform" | "user" = "platform"

    // Allow user's own key to override (BYOK), if configured
    const { data: keyRow } = await supabase
        .from("ai_provider_keys")
        .select("encrypted_key")
        .eq("user_id", user.id)
        .eq("provider_id", providerId)
        .single()

    if (keyRow?.encrypted_key) {
        try {
            const userKey = decryptApiKey(keyRow.encrypted_key)
            if (userKey) {
                apiKey = userKey
                keySource = "user"
            }
        } catch (err) {
            // Non-critical — fall back to platform key
            console.warn("[agents/execute] User key decrypt failed, using platform key:", err)
        }
    }

    if (!apiKey) {
        const providerName = PROVIDER_REGISTRY[providerId]?.name ?? providerId
        console.error("[agents/execute] No API key configured for provider:", { providerId, modelId })
        return NextResponse.json(
            {
                error: `${providerName} is not configured. Try again later or add an API key in settings.`,
                code: "PROVIDER_UNAVAILABLE",
                providerId,
            },
            { status: 503 }
        )
    }

    // 4. Build rich company context using the AI Context Builder
    const foundryId = await resolveFoundryId(supabase, user.id)

    // SECURITY: Enforce subscription tier limits (monthly AI task cap).
    // The per-hour rate limit above prevents burst abuse; this prevents
    // sustained overuse beyond what the subscription tier allows.
    if (!foundryId) {
        return NextResponse.json(
            { error: "No active foundry. Please complete onboarding first.", code: "NO_FOUNDRY" },
            { status: 403 }
        )
    }
    const limitCheck = await checkAILimit(foundryId)
    if (!limitCheck.allowed) {
        return NextResponse.json(
            {
                error: limitCheck.message,
                code: "SUBSCRIPTION_LIMIT",
                usage: {
                    current: limitCheck.currentUsage,
                    limit: limitCheck.limit,
                    remaining: 0,
                },
            },
            { status: 429 }
        )
    }

    // 4a. Validate threadId belongs to user's foundry (IDOR prevention)
    if (threadId && foundryId) {
        const { data: thread } = await supabase
            .from("agent_memory_threads")
            .select("id")
            .eq("id", threadId)
            .eq("foundry_id", foundryId)
            .single()
        if (!thread) {
            // Auto-heal: if this is a specialist chat, create a fresh thread via SECURITY DEFINER RPC
            if (specialistId) {
                const { data: freshThreadId } = await supabase.rpc(
                    'get_or_create_specialist_thread',
                    {
                        p_foundry_id: foundryId,
                        p_user_id: user.id,
                        p_context_type: 'specialist',
                        p_context_id: specialistId,
                        p_metadata: { specialistId, specialistType: 'specialist' },
                    }
                )
                if (freshThreadId) {
                    threadId = freshThreadId as string
                    healedThreadId = freshThreadId as string
                }
                // If RPC also fails, proceed without threadId (non-critical)
            } else {
                return NextResponse.json(
                    { error: "Invalid or inaccessible thread" },
                    { status: 403 }
                )
            }
        }
    }

    // 4a2. Create agent rollout for training/optimization (best-effort, non-blocking)
    const rolloutId =
        foundryId != null
            ? await createRollout({
                  foundryId,
                  userId: user.id,
                  agentId: specialistId ? `specialist:${specialistId}` : "workflow",
                  threadId: threadId ?? null,
                  metadata: { modality, providerId, modelId },
              })
            : null

    // 4b. Fast-path detection for conversational follow-ups.
    // When a user sends a follow-up message in an existing conversation, skip the
    // ~15 DB queries for company context, preferences, intelligence, knowledge vault,
    // etc. The conversation history and specialist personality are sufficient for a
    // responsive reply. Triggers when: short-ish input (<400 chars), existing thread,
    // text mode, no cross-specialist context injection.
    const isConversationalFastPath = !!(
        input.length > 0 &&
        input.length < 400 &&
        threadId &&
        specialistId &&
        modality === "text" &&
        !customSystemPromptSuffix // No cross-specialist context injected
    )

    if (isConversationalFastPath) {
        console.info("[agents/execute] Fast-path: short follow-up, skipping heavy context", {
            inputLength: input.length,
            specialistId,
            threadId,
        })
    }

    // 4c. Fetch user profile (skip on fast path — not needed for conversational turns)
    let userProfile: { full_name: string | null; role: string | null } | null = null
    if (!isConversationalFastPath) {
        const { data } = await supabase
            .from("profiles")
            .select("full_name, role")
            .eq("id", user.id)
            .single()
        userProfile = data
    }

    // 4d. Build company context (skip on fast path — biggest latency saver)
    let companyContext = ""
    if (!isConversationalFastPath) {
        try {
            if (foundryId) {
                companyContext = await buildAIContext(foundryId, user.id, {
                    includeActivity: true,
                    includeObjectives: true,
                    includeUserProfile: false, // Skip heavy profile for streaming performance
                    includeInsightHistory: false,
                    includeEngineeringHistory: true,
                })
            }
        } catch (err) {
            // Non-critical — proceed without company context
            console.warn("[agents/execute] Could not load company context:", err)
        }
    }

    // 4d2. Inject CAD Lab project context when specialist is reviewing designs
    if (cadLabProjectId && foundryId && specialistId) {
        try {
            const adminClient = createAdminClient()
            const { data: cadProject } = await adminClient
                .from("cad_lab_projects")
                .select("subject, modules, research, result")
                .eq("id", cadLabProjectId)
                .eq("foundry_id", foundryId)
                .single()

            if (cadProject) {
                const cadContextParts: string[] = ["\n\n## Active CAD Lab Project Context"]
                cadContextParts.push(`**Product:** ${cadProject.subject}`)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mods = cadProject.modules as any[]
                if (mods && mods.length > 0) {
                    cadContextParts.push(`**Modules (${mods.length}):**`)
                    for (const m of mods) {
                        const bboxStr = m.result?.bbox
                            ? ` — ${m.result.bbox.xLen}×${m.result.bbox.yLen}×${m.result.bbox.zLen}mm`
                            : ""
                        cadContextParts.push(`- ${m.name}: ${m.purpose} [${m.status}]${bboxStr}`)
                    }
                }
                companyContext += cadContextParts.join("\n")
            }
        } catch (err) {
            console.debug("[agents/execute] CAD Lab context injection failed:", err)
        }
    }

    // 4b. Enrich input with attachment context (for prompt only; memory stores original input)
    const MAX_ATTACHMENT_CONTEXT_CHARS = 25_000
    // SECURITY: Only allow fetching from our own Supabase storage to prevent SSRF
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    const isAllowedAttachmentUrl = (url: string): boolean => {
        try {
            const parsed = new URL(url)
            const supabaseParsed = SUPABASE_URL ? new URL(SUPABASE_URL) : null
            // Allow only our Supabase storage domain
            if (supabaseParsed && parsed.hostname === supabaseParsed.hostname) return true
            // Block everything else (internal IPs, metadata endpoints, etc.)
            return false
        } catch {
            return false
        }
    }
    let inputForPrompt = input
    if (attachments && attachments.length > 0) {
        const parts: string[] = []
        let totalChars = 0
        for (const a of attachments) {
            const name = typeof a.filename === "string" ? a.filename : "file"
            const mime = typeof a.mimeType === "string" ? a.mimeType : ""
            const url = a.url
            if (!url) {
                parts.push(`[User attached file: ${name}]`)
                continue
            }
            if (!isAllowedAttachmentUrl(url)) {
                console.warn("[agents/execute] Blocked non-Supabase attachment URL:", url)
                parts.push(`[User attached file: ${name} — URL not allowed]`)
                continue
            }
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
                if (!res.ok) {
                    parts.push(`[User attached file: ${name} — could not load]`)
                    continue
                }
                if (mime.startsWith("image/")) {
                    parts.push(`[User attached image: ${name}]`)
                    continue
                }
                if (mime === "text/plain" || mime === "text/csv") {
                    const text = await res.text()
                    const slice = text.slice(0, MAX_ATTACHMENT_CONTEXT_CHARS - totalChars)
                    if (slice.length > 0) {
                        parts.push(`### Contents of "${name}"\n\n${slice}`)
                        totalChars += slice.length
                    }
                    if (totalChars >= MAX_ATTACHMENT_CONTEXT_CHARS) break
                    continue
                }
                if (mime === "application/pdf") {
                    const buf = await res.arrayBuffer()
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>
                    const data = await pdfParse(Buffer.from(buf))
                    const text = (data.text ?? "").slice(0, MAX_ATTACHMENT_CONTEXT_CHARS - totalChars)
                    if (text.length > 0) {
                        parts.push(`### Contents of "${name}" (PDF)\n\n${text}`)
                        totalChars += text.length
                    }
                    if (totalChars >= MAX_ATTACHMENT_CONTEXT_CHARS) break
                    continue
                }
                // Word (.docx) — extract raw text via mammoth
                if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) {
                    const buf = await res.arrayBuffer()
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const mammoth = require("mammoth") as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> }
                    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) })
                    const text = (result.value ?? "").slice(0, MAX_ATTACHMENT_CONTEXT_CHARS - totalChars)
                    if (text.length > 0) {
                        parts.push(`### Contents of "${name}" (Word)\n\n${text}`)
                        totalChars += text.length
                    }
                    if (totalChars >= MAX_ATTACHMENT_CONTEXT_CHARS) break
                    continue
                }
                // Excel (.xlsx) — convert each sheet to CSV via exceljs
                if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || name.endsWith(".xlsx") || name.endsWith(".xls")) {
                    const buf = await res.arrayBuffer()
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const ExcelJS = require("exceljs") as typeof import("exceljs")
                    const workbook = new ExcelJS.Workbook()
                    // GOTCHA: exceljs types expect old Buffer; TS 5.9 made Buffer generic
                    await workbook.xlsx.load(Buffer.from(buf) as never)
                    const sheetTexts: string[] = []
                    for (const worksheet of workbook.worksheets) {
                        const rows: string[] = []
                        worksheet.eachRow((row) => {
                            const values = (row.values as (string | number | null | undefined)[]).slice(1)
                            rows.push(values.map(v => String(v ?? "")).join(","))
                        })
                        const csv = rows.join("\n")
                        if (csv.trim()) {
                            sheetTexts.push(`#### Sheet: ${worksheet.name}\n\n${csv}`)
                        }
                    }
                    const text = sheetTexts.join("\n\n").slice(0, MAX_ATTACHMENT_CONTEXT_CHARS - totalChars)
                    if (text.length > 0) {
                        parts.push(`### Contents of "${name}" (Excel)\n\n${text}`)
                        totalChars += text.length
                    }
                    if (totalChars >= MAX_ATTACHMENT_CONTEXT_CHARS) break
                    continue
                }
                // PowerPoint (.pptx) — extract text from slides via officeparser
                if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || name.endsWith(".pptx")) {
                    const buf = await res.arrayBuffer()
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const officeparser = require("officeparser") as { parseOffice: (buffer: Buffer) => Promise<string> }
                    try {
                        const text = await officeparser.parseOffice(Buffer.from(buf))
                        if (text.trim()) {
                            const trimmed = text.slice(0, MAX_ATTACHMENT_CONTEXT_CHARS - totalChars)
                            parts.push(`### Contents of "${name}" (PowerPoint)\n\n${trimmed}`)
                            totalChars += trimmed.length
                        } else {
                            parts.push(`[User attached PowerPoint: ${name} — text extraction limited]`)
                        }
                    } catch {
                        parts.push(`[User attached PowerPoint: ${name} — could not extract text]`)
                    }
                    if (totalChars >= MAX_ATTACHMENT_CONTEXT_CHARS) break
                    continue
                }
                parts.push(`[User attached file: ${name}]`)
            } catch (err) {
                console.warn("[agents/execute] Attachment fetch failed:", name, err)
                parts.push(`[User attached file: ${name} — could not load]`)
            }
        }
        if (parts.length > 0) {
            inputForPrompt = `## Attached files\n\n${parts.join("\n\n")}\n\n## User message\n\n${input}`
        }
    }

    // 5. Build the final prompt
    let finalPrompt = prompt.replace(/\{\{input\}\}/g, inputForPrompt)
    finalPrompt = finalPrompt.replace(/\{\{company_context\}\}/g, companyContext)

    // 6. Build system prompt with agent memory (observations only) and
    //    extract conversation history as proper multi-turn messages.
    //    Observations (compressed summaries of older conversations) go into the
    //    system prompt. Recent messages become real user/assistant turns in the
    //    messages array so the model properly tracks the conversation.
    let memoryBlock = ""
    let conversationHistory: ConversationMessage[] = []

    if (threadId && foundryId) {
        try {
            const memoryContext = await getMemoryContext(threadId, foundryId, true)

            // Observations → system prompt (compressed background context)
            memoryBlock = formatObservationsForPrompt(memoryContext)

            // Recent messages → proper multi-turn messages array
            conversationHistory = getConversationHistory(memoryContext)

            // Record the user's ACTUAL input as a message in the memory thread.
            // We save `input` (what the user typed) rather than `finalPrompt`
            // (which includes the full template + company context) so that
            // conversation history reads naturally when fetched back.
            const userMessageForHistory = input.trim() || finalPrompt.slice(0, 500)
            await addMemoryMessage(threadId, foundryId, "user", userMessageForHistory)
        } catch (err) {
            // Non-critical — proceed without memory context
            console.warn("[agents/execute] Could not load agent memory:", err)
        }
    }

    // ─── Specialist Tool Resolution (early) ─────────────────────────
    // Resolve tools early so they can be referenced in the system prompt.
    // The actual tool-use loop happens later in handleToolAwareStreaming.
    const isClaudeTierEarly = modelTier === "claude"
    let specialistTools: ToolDefinition[] = []
    if (specialistId && modality === "text") {
        specialistTools = getToolsForSpecialist(specialistId, {
            includeWebSearch: !isClaudeTierEarly,
        })
    }

    // Build system prompt: personality FIRST (identity leads), then context layers.
    // Structure: personality → temporal → emotional → company → memory → custom suffix
    // This ensures the specialist's identity is the dominant instruction, not a footnote.

    let systemPromptWithContext = ""

    // Inject specialist personality FIRST — identity leads, everything else is context.
    if (specialistId) {
        const specialist = getSpecialistById(specialistId)
        if (specialist) {
            // INTENT: Load curated domain knowledge (frameworks, methodologies) for the specialist.
            // Falls back to the short description if no domain knowledge file exists yet.
            const domainContext = loadDomainKnowledge(specialistId, specialist.description)
            const personalityPrompt = compilePersonalityPrompt(
                `${specialist.name}, the ${specialist.title} specialist`,
                specialist.personality,
                domainContext,
                specialistId,
            )
            systemPromptWithContext = personalityPrompt

            // Inject relationship awareness for cross-specialist dynamics
            if (specialist.personality.relationships) {
                // Build live cross-specialist context from recent insights + decisions
                let crossContext = typeof customSystemPromptSuffix === "string" && customSystemPromptSuffix.includes("CROSS_SPECIALIST_CONTEXT")
                    ? customSystemPromptSuffix
                    : undefined
                if (!crossContext && foundryId) {
                    try {
                        const liveContext = await buildCrossSpecialistContext(foundryId, specialistId)
                        if (liveContext) crossContext = liveContext
                    } catch {
                        // Non-critical — proceed without cross-specialist context
                    }
                }
                const relationshipBlock = compileRelationshipContext(
                    specialist.name,
                    specialist.personality.relationships,
                    crossContext,
                )
                if (relationshipBlock) {
                    systemPromptWithContext += `\n\n${relationshipBlock}`
                }
            }

            // Proposed actions: allow specialist to suggest tasks/objectives
            systemPromptWithContext += `

## Suggesting Actions (Create and Archive) — CRITICAL REQUIREMENT

**THIS IS THE MOST IMPORTANT INSTRUCTION IN THIS PROMPT.**

When your recommendation includes ANY concrete next steps — tasks to do, objectives to create, items to remove, strategy changes — you **MUST** output a PROPOSED_ACTIONS block. This is the ONLY mechanism that renders interactive checkboxes in the UI. Without it, the user sees static text they cannot act on.

### What NEVER to do
- **NEVER use markdown tables** (| Action | Owner | Deadline |) for action items. Tables are static text. The user CANNOT tick, execute, or interact with them.
- **NEVER use bullet lists** for assignments (- Do X by Friday). Those are also non-interactive.
- **NEVER describe actions only in prose** without the structured block. The user will see words but no way to execute.

If you catch yourself writing a markdown table with action items, STOP and convert it to PROPOSED_ACTIONS format instead.

### Format
In the same response where you explain your recommendation in prose, include this HTML comment block with valid JSON at the END of your response:

\`\`\`
<!-- PROPOSED_ACTIONS
[
  { "type": "archive_objective", "title": "Exact title from objectives list", "description": "Why" },
  { "type": "archive_task", "title": "Exact task title", "description": "Why" },
  { "type": "objective", "title": "New objective title", "description": "Details", "strategicGoalTitle": "Parent goal title", "estimatedWeeks": 6 },
  { "type": "task", "title": "New task title", "description": "Details", "objectiveTitle": "Parent objective title", "estimatedWeeks": 2 }
]
-->
\`\`\`

### Action types
- \`"archive_objective"\` — Remove an existing objective (soft-delete). Use the EXACT title from the objectives list above.
- \`"archive_task"\` — Remove an existing task (soft-delete). Use the EXACT title.
- \`"objective"\` — Create a new objective. \`"strategicGoalTitle"\` is **REQUIRED** — every objective MUST belong to a strategic goal. Use an existing strategic goal title, OR provide a NEW strategic goal title and the system will auto-create it.
- \`"task"\` — Create a new task. \`"objectiveTitle"\` is **REQUIRED** — every task MUST belong to an objective. Use an existing objective title, a new objective you are creating in the same batch, OR provide a new title and the system will auto-create the objective.

### MANDATORY HIERARCHY RULE
Every item must fit into the strategy hierarchy: **Strategic Goal → Objective → Task**. 
- You CANNOT create a task without specifying which objective it belongs to (\`"objectiveTitle"\` is required).
- You CANNOT create an objective without specifying which strategic goal it belongs to (\`"strategicGoalTitle"\` is required).
- If no suitable strategic goal exists, use a clear descriptive title for \`"strategicGoalTitle"\` — the system will auto-create the strategic goal.
- If no suitable objective exists for a task, create one in the same batch BEFORE the task, OR reference a clear title and the system will auto-create it.
- Items missing the required \`"strategicGoalTitle"\` or \`"objectiveTitle"\` fields will be REJECTED.
- When extracting many items from a document, ALWAYS organize them into a logical hierarchy — group related tasks under objectives, and group objectives under strategic goals.

### Example: Recommending to kill a feature and consolidate strategy
If the user has duplicate objectives like "raise 50m funding" and "raise 60m funding", and you recommend consolidating:

\`\`\`
<!-- PROPOSED_ACTIONS
[
  { "type": "archive_objective", "title": "raise 50m funding", "description": "Duplicate — consolidating into single fundraising strategy" },
  { "type": "archive_objective", "title": "raise 60m funding", "description": "Duplicate — consolidating into single fundraising strategy" },
  { "type": "objective", "title": "Raise $50M Series A", "description": "Consolidated fundraising objective with clear milestones", "strategicGoalTitle": "Consolidate Fundraising Strategy" }
]
-->
\`\`\`

This renders as interactive cards with checkboxes. The user ticks which ones to archive, which to create, and clicks one button.

### Rules
1. **ALWAYS include PROPOSED_ACTIONS when you recommend actions.** This is mandatory, not optional. The user explicitly expects interactive checkboxes.
2. **When recommending cleanup or strategy changes, include BOTH archive AND create actions.** Archive the old, create the new — in one block.
3. **Use EXACT titles from the objectives/tasks list** for archive actions. Title matching is case-insensitive but must be exact otherwise.
4. **Put archive actions BEFORE create actions** in the array.
5. **Every objective MUST have "strategicGoalTitle"** — use an existing title or a new one (the system auto-creates missing strategic goals). This is REQUIRED — objectives without it will be rejected.
6. **Every task MUST have "objectiveTitle"** — use an existing, batch-created, or new title (the system auto-creates missing objectives). This is REQUIRED — tasks without it will be rejected.
7. If you need to create a task under a new objective, create the objective first in the same batch, then reference its title in the task's "objectiveTitle".
8. Only skip the block for purely informational responses with zero actionable recommendations.
9. The visible prose should read naturally. The PROPOSED_ACTIONS block is supplementary — describe actions in words, then include the structured block at the end.
10. **NEVER show raw JSON, code blocks, or structured data in your prose.** The PROPOSED_ACTIONS HTML comment is the ONLY place JSON should appear. The user sees the structured data as interactive cards — they do NOT need to see the raw JSON. Your conversational text should describe actions in plain language only.

### QUALITY STANDARDS — Be Specific, Not Generic
Your proposed actions must be **grounded in the company's actual data** from the context above. Generic actions are useless.

**BAD (vague, template-like):**
- "Improve marketing strategy" — says nothing actionable
- "Increase revenue" — obvious, not a real objective
- "Build better product" — meaningless

**GOOD (specific, grounded, measurable):**
- "Achieve 500 qualified leads/month via LinkedIn content by Q3 2026" — specific channel, metric, timeline
- "Reduce manufacturing unit cost from $45 to $32 by consolidating PCB suppliers" — real numbers from context
- "Ship v2.0 MVP with payment integration by March 15" — concrete deliverable and date

**Rules for specificity:**
- Include REAL NUMBERS from the company context (revenue, team size, metrics) in titles and descriptions
- Include TIMEFRAMES — "by [date]" or "within [N] weeks"
- Reference ACTUAL company products, features, or initiatives by name
- For tasks, include what DONE looks like (acceptance criteria in the description)
- If you don't have enough data to be specific, say so in the description and give the best estimate you can with "[estimated]" markers

### TIMELINE SCHEDULING
For every "objective" and "task" action, include \`"estimatedWeeks"\` (integer, 1-12) — how many weeks this item should realistically take. The system uses this to auto-schedule staggered start/end dates so work is sequenced properly. Tasks under the same objective will be spread across waves (3 concurrent), not all starting on the same day.

Guidelines:
- Quick tasks (send an email, schedule a meeting): 1 week
- Medium tasks (build a prototype, write a report): 2-4 weeks
- Large tasks (launch a product, complete a hiring cycle): 4-8 weeks
- Do NOT default everything to the same number — vary based on realistic effort`

            // Reinforce PROPOSED_ACTIONS format for non-Claude models that struggle
            // with HTML comment syntax. MiniMax and Qwen need extra emphasis and
            // a concrete, minimal example repeated at the end of the instructions.
            if (modelTier && modelTier !== "claude") {
                systemPromptWithContext += `

### CRITICAL FORMAT REMINDER

You MUST output the PROPOSED_ACTIONS block using EXACTLY this format. Copy the delimiters character-for-character:

<!-- PROPOSED_ACTIONS
[
  { "type": "objective", "title": "Your objective title here", "description": "Description", "strategicGoalTitle": "Name of existing strategic goal", "estimatedWeeks": 6 },
  { "type": "task", "title": "Your task title here", "description": "Description", "objectiveTitle": "Name of parent objective", "estimatedWeeks": 2 }
]
-->

ABSOLUTE REQUIREMENTS for the block:
- Start with exactly: <!-- PROPOSED_ACTIONS
- End with exactly: -->
- The JSON array MUST be valid JSON (use double quotes for keys and string values)
- Every objective MUST include "strategicGoalTitle" (existing or new — system auto-creates missing ones) — REQUIRED, not optional
- Every task MUST include "objectiveTitle" (existing, batch-created, or new — system auto-creates missing ones) — REQUIRED, not optional
- Items missing "strategicGoalTitle" (objectives) or "objectiveTitle" (tasks) will be REJECTED
- Place the block at the END of your response, after all prose

DO NOT:
- Wrap the block in markdown code fences (\`\`\`)
- Omit the <!-- or --> delimiters
- Use single quotes in the JSON
- Skip the block when you recommend concrete actions
- Create tasks without "objectiveTitle" — they will fail
- Create objectives without "strategicGoalTitle" — they will fail
- When extracting from documents, organize items into a hierarchy (strategic goal → objective → task)`
            }

            // Workflow capabilities: let the specialist know what they can produce
            const workflows = getSpecialistWorkflows(specialistId as SpecialistId)
            if (workflows.length > 0) {
                const workflowList = workflows
                    .map(
                        (w) =>
                            `- "${w.name}": ${w.description} (triggered by phrases like: ${w.triggers.slice(0, 2).join(", ")})`,
                    )
                    .join("\n")
                systemPromptWithContext += `\n\n## Your Executable Workflows
You can produce these deliverables when the founder asks. Mention them naturally when relevant:
${workflowList}

When the founder triggers one of these (e.g., "draft the plan", "run the numbers"), produce the full deliverable in your response. Don't just outline it — actually write it out completely and thoroughly.

**CRITICAL: Use real data.** Your system context includes the company's actual profile (revenue range, team size, funding status, sector), active objectives with progress, recent decisions from the decision journal, and knowledge vault notes. When producing deliverables:
- Reference actual team members by name and role
- Use real metrics from the company profile (revenue range, employee count, funding stage)
- Incorporate active objectives and their progress into strategic deliverables
- Reference past decisions and their outcomes when relevant
- If a data point is missing, say "[DATA NEEDED: X]" — never invent numbers
- Label clearly: [FROM COMPANY DATA] vs [INDUSTRY BENCHMARK] vs [YOUR ESTIMATE]`
            }

            // Tool-calling instructions: tell the specialist they have tools
            if (specialistTools.length > 0) {
                const toolList = specialistTools.map((t) => `- **${t.name}**: ${t.description}`).join("\n")
                systemPromptWithContext += `\n\n## Your Data Tools

You have access to these tools that you can call to query REAL company data during this conversation:

${toolList}

**CRITICAL INSTRUCTIONS for tool use:**
- **Always use tools** when the founder asks about company data, metrics, progress, team, finances, or anything that requires real numbers. Do NOT guess or make up data.
- Call tools BEFORE writing your analysis — ground your advice in actual data.
- You can chain multiple tool calls in one turn (e.g., query objectives + query tasks + run calculation).
- When you use run_calculation, show your work: explain the formula and what the numbers mean.
- After getting tool results, synthesize them into clear, actionable insights — don't just dump raw data.
- If a tool returns no data or an error, acknowledge it honestly and work with what you have.`
            }

            // Chart output capability for data-heavy specialists
            const DATA_HEAVY_SPECIALISTS = ["finance-lead", "strategist", "cto", "vp-engineering", "product-lead", "fundraising-advisor"]
            if (specialistId && DATA_HEAVY_SPECIALISTS.includes(specialistId)) {
                systemPromptWithContext += `\n\n## Chart Output

When presenting quantitative data, trends, or comparisons, include a chart visualization using this format:

<!-- CHART {"type": "bar|line|pie|area", "title": "Chart Title", "xLabel": "X Label", "yLabel": "Y Label", "seriesName": "Series 1", "data": [{"label": "Item", "value": 42}]} -->

Rules:
- Use bar charts for comparisons, line/area for trends over time, pie for proportions
- Keep data to 12 points or fewer for readability
- Place charts after the relevant analysis section, not at the end
- You can include multiple charts in one response`
            }

            // INTENT: Inject recent deliverables so the specialist can iterate on them
            // when the founder asks to revise/update an existing artifact.
            if (specialistId && foundryId && modality === "text") {
                try {
                    const adminClient = createAdminClient()
                    const { data: recentArtifacts } = await adminClient
                        .from("agent_artifacts")
                        .select("id, title, content_type, metadata, created_at, updated_at")
                        .eq("foundry_id", foundryId)
                        .filter("metadata->>specialistId", "eq", specialistId)
                        .order("created_at", { ascending: false })
                        .limit(5)

                    if (recentArtifacts && recentArtifacts.length > 0) {
                        const artifactRows = recentArtifacts
                            .map((a, i) => {
                                const date = new Date(a.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                })
                                return `| ${i + 1} | ${a.title} | ${a.content_type} | ${date} | ${a.id} |`
                            })
                            .join("\n")

                        systemPromptWithContext += `\n\n## Your Recent Deliverables

You've previously produced these deliverables for this founder. If they ask to revise, update, or iterate on any of these, produce the updated version and include a PROPOSED_EDIT block.

| # | Title | Type | Date | ID |
|---|-------|------|------|----|
${artifactRows}

When the founder asks to revise an existing deliverable, output the FULL updated content followed by:
<!-- PROPOSED_EDIT {"artifactId": "uuid-here", "title": "Updated title", "changeSummary": "Brief description of what changed"} -->`
                    }
                } catch (artifactCtxErr) {
                    // GOTCHA: Non-blocking — if artifact lookup fails, the specialist
                    // simply won't have revision context. This is acceptable degradation.
                    console.warn("[execute] Failed to fetch recent artifacts for specialist context:", artifactCtxErr)
                }
            }

            // Multi-step execution plan capability
            const otherSpecialists = SPECIALISTS
                .filter((s) => s.id !== specialistId)
                .map((s) => `- ${s.id}: ${s.name} (${s.title})`)
                .join("\n")
            systemPromptWithContext += `\n\n## Multi-Step Plans

When a founder's request involves multiple sequential deliverables, cross-specialist coordination, or a complex project that would benefit from step-by-step execution, propose a multi-step plan using this format at the END of your response (after your prose):

<!-- PROPOSED_PLAN
{
  "title": "Plan title",
  "steps": [
    {
      "specialistId": "${specialistId}",
      "title": "Step 1 title",
      "prompt": "Detailed prompt for this step...",
      "description": "What the founder will see before execution",
      "outputLabel": "Name for what this step produces"
    }
  ]
}
-->

Rules:
- Only for genuinely multi-step work (2-5 steps). Single deliverables should use workflows or direct responses.
- Each step must produce a distinct deliverable that feeds into the next.
- You may include steps for other specialists when their expertise is needed:
${otherSpecialists}
- Keep prompts detailed and self-contained — each step executes independently with prior step outputs as context.
- Place the block at the very end of your response, after your conversational prose.
- Do NOT propose a plan for simple questions, follow-up responses, or single-deliverable requests.`

            // External service integration instructions
            systemPromptWithContext += `\n\n## External Actions

When your analysis warrants creating an external deliverable (spreadsheet, calendar event, or email), propose it at the END of your response using:

<!-- PROPOSED_EXTERNAL_ACTION
{"type": "create_google_sheet", "title": "Budget Forecast Q2", "description": "Spreadsheet with projected expenses", "payload": {"title": "Budget Forecast Q2 2026", "headers": ["Category", "Jan", "Feb", "Mar", "Total"], "rows": [["Engineering", "50000", "52000", "54000", "156000"]]}}
-->

Available types:
- create_google_sheet: Creates a Google Sheet. Payload: {title: string, headers: string[], rows: string[][]}
- create_calendar_event: Schedules a calendar event. Payload: {title: string, startTime: ISO string, endTime: ISO string, description?: string, attendees?: string[]}
- draft_email: Drafts an email. Payload: {to: string, subject: string, body: string}
- create_linear_issue: Creates a Linear issue. Payload: {title: string, description: string, priority?: "urgent"|"high"|"medium"|"low"|"none", labels?: string[], teamName?: string}
- send_slack_message: Sends a Slack message. Payload: {channel: string, message: string, threadTs?: string}
- draft_invoice: Creates an invoice draft. Payload: {recipientName: string, recipientEmail?: string, items: [{description: string, quantity: number, unitPrice: number}], currency?: string, dueDate?: string, notes?: string}
- generate_pitch_deck: Generates a PowerPoint pitch deck. Payload: {title: string, subtitle?: string, slides: [{title: string, bullets?: string[], content?: string}], companyName?: string}

Rules:
- Only propose external actions when the conversation naturally warrants them (e.g. the founder asks for a spreadsheet, a meeting, or an email)
- The founder must approve before any action is executed
- Include all relevant data in the payload — do not reference conversation context
- You can include multiple PROPOSED_EXTERNAL_ACTION blocks (one per action)
- Place external action blocks at the very end of your response, after all prose and after any PROPOSED_ACTIONS blocks`

            // Page-specific action instructions (executable mutations on the current page)
            if (currentRoute && specialistId) {
                const allPageActions = getPageActions(currentRoute)
                const specialistPageActions = filterActionsBySpecialist(allPageActions, specialistId)
                if (specialistPageActions.length > 0) {
                    systemPromptWithContext += `\n\n${serializePageActions(specialistPageActions)}`
                }
            }

            // Add STRUCTURED_OUTPUT documentation
            systemPromptWithContext += `\n\n## Structured Visual Outputs

When a visual layout would communicate better than prose, use a STRUCTURED_OUTPUT block:

<!-- STRUCTURED_OUTPUT
{"type": "kanban", "title": "Sprint Board", "columns": [{"title": "To Do", "items": [{"title": "Task 1", "priority": "high"}]}, {"title": "In Progress", "items": []}, {"title": "Done", "items": []}]}
-->

Available types:
- kanban: Board with columns and card items. Schema: {type: "kanban", title: string, columns: [{title: string, items: [{title: string, description?: string, priority?: "urgent"|"high"|"medium"|"low"}]}]}
- comparison: Table with optional cell highlights. Schema: {type: "comparison", title: string, headers: string[], rows: [{values: string[], highlights?: {columnIndex: "positive"|"negative"|"neutral"}}], recommendation?: string}
- dashboard: KPI card grid with trends. Schema: {type: "dashboard", title: string, kpis: [{label: string, value: string|number, change?: string, trend?: "up"|"down"|"flat"}]}
- org_chart: Tree layout. Schema: {type: "org_chart", title: string, root: {name: string, role: string, children?: [...]}}

Rules:
- Use structured outputs when they add clarity (e.g. comparing options, showing a sprint board, summarising KPIs)
- Always include prose explanation alongside the structured output
- Place STRUCTURED_OUTPUT blocks inline where they're most relevant in your response`
        }
    }

    // If no specialist, fall back to generic system prompt
    if (!systemPromptWithContext) {
        systemPromptWithContext = SYSTEM_PROMPT
    }

    // Add core business standards (condensed — the specialist personality already
    // covers most of the behavioral guidance)
    systemPromptWithContext += `\n\n## Response Standards
- Be direct and actionable. Use markdown: headers, tables, bullets.
- Distinguish between data the user provided, industry knowledge, and your estimates.
- Flag assumptions explicitly. Never fabricate statistics.
- End with clear next steps: who does what, by when.
- When providing guidance on legal, financial, or medical topics, explicitly note that your output is AI-generated and recommend consulting qualified professionals before making binding decisions.
- Never present yourself as infallible. When uncertain, say so clearly. The human is always the final decision-maker.`

    // User identity: address them by name
    if (userProfile?.full_name) {
        const roleSuffix = userProfile.role ? ` (${userProfile.role})` : ""
        systemPromptWithContext += `\n\n## User Identity\nYou are speaking with ${userProfile.full_name}${roleSuffix}. Address them by name when natural.`
    }

    // AUDIT: Heavy context layers extracted to prompt-builder.ts (2026-02-19, refactor step 6 of 8).
    // Each layer is independently failable — see prompt-builder.ts for the full assembly logic.
    const { contextBlocks: contextLayers, activeLayers, contextTokensUsed, contextTokenBudget } = await buildContextLayers({
        foundryId,
        specialistId,
        threadId,
        input,
        finalPrompt,
        isConversationalFastPath,
        handoffSourceThreadId,
        handoffSourceSpecialistId,
        modelTier: modelTier ?? 'claude',
    })
    systemPromptWithContext += contextLayers
    console.info(`[Execute] Context layers: ${activeLayers.join(', ')} (${contextTokensUsed}/${contextTokenBudget} tokens)`)

    if (companyContext) {
        systemPromptWithContext += `\n\n${companyContext}`
    }
    if (memoryBlock) {
        systemPromptWithContext += `\n\n## Agent Memory\n${memoryBlock}`
    }
    if (customSystemPromptSuffix) {
        systemPromptWithContext += customSystemPromptSuffix
    }

    // AUDIT: Usage logging — uses trackAIUsage to atomically increment monthly counters
    const featureKey = MODALITY_FEATURE_MAP[modality] ?? 'other'
    const logUsageAfterCompletion = async (outputLength: number): Promise<void> => {
        if (!foundryId) return
        try {
            const inputTokens = countTokens(finalPrompt) + countTokens(systemPromptWithContext)
            const outputTokens = Math.ceil(outputLength / 4) // Non-text outputs (URLs, base64) use rough estimate
            await trackAIUsage({
                foundryId,
                userId: user.id,
                feature: featureKey,
                model: `${providerId}/${modelId}`,
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                estimatedCostUsd: estimateAICost(modelId, inputTokens, outputTokens),
                metadata: { modality, providerId, modelId, keySource },
            })
        } catch (err) {
            console.warn("[agents/execute] Failed to log usage:", err)
        }
    }

    // AUDIT: Post-response callback extracted to post-response-handler.ts (2026-02-19, refactor step 7 of 8).
    // Handles: memory save, decision detection, interaction tracking, knowledge extraction,
    // usage logging, and rollout tracing. All independently failable — see post-response-handler.ts.
    const memoryCallback = createPostResponseCallback({
        supabase,
        userId: user.id,
        foundryId,
        threadId,
        specialistId,
        input,
        finalPrompt,
        systemPromptWithContext,
        modality,
        providerId,
        modelId,
        keySource,
        rolloutId,
    })

    // ─── Prompt Size Observability & Smart Truncation ──────────────────────
    // INTENT: Log every layer's size on every request (not just overflow) so we
    // can see the real distribution in production. When over the 120k cap, trim
    // layers in priority order (least critical first) instead of blindly slicing
    // company context from the end.
    const MAX_SYSTEM_PROMPT_CHARS = 120_000
    const layerSizes: Record<string, number> = {
        contextLayers: contextLayers.length,
        companyContext: companyContext.length,
        memory: memoryBlock.length,
        customSuffix: (customSystemPromptSuffix ?? "").length,
        total: systemPromptWithContext.length,
    }
    console.info("[agents/execute] Prompt layer sizes:", {
        ...layerSizes,
        headroom: MAX_SYSTEM_PROMPT_CHARS - systemPromptWithContext.length,
        specialistId,
    })

    if (systemPromptWithContext.length > MAX_SYSTEM_PROMPT_CHARS) {
        // Tier 1: Remove supplementary layers (least → most critical)
        const trimmableLayers = [
            { name: "customSuffix", value: customSystemPromptSuffix ?? "" },
            { name: "memory", value: memoryBlock ? `\n\n## Agent Memory\n${memoryBlock}` : "" },
            { name: "contextLayers", value: contextLayers },
        ]

        for (const layer of trimmableLayers) {
            if (systemPromptWithContext.length <= MAX_SYSTEM_PROMPT_CHARS) break
            if (!layer.value) continue

            const before = systemPromptWithContext.length
            systemPromptWithContext = systemPromptWithContext.replace(layer.value, "")
            console.warn(`[agents/execute] Trimmed ${layer.name} (${before - systemPromptWithContext.length} chars) to fit under ${MAX_SYSTEM_PROMPT_CHARS} limit`, { specialistId })
        }

        // Tier 2: Section-aware company context trimming (preserve core identity)
        // buildAIContext() produces sections joined by \n\n. Remove from the end
        // (engineering history, activity, objectives) while keeping the first 4
        // sections intact (company identity, profile, purpose/mission, founder).
        if (systemPromptWithContext.length > MAX_SYSTEM_PROMPT_CHARS && companyContext) {
            const overage = systemPromptWithContext.length - MAX_SYSTEM_PROMPT_CHARS
            const sections = companyContext.split("\n\n")
            const MIN_SECTIONS_TO_KEEP = 4
            let trimmedChars = 0

            while (sections.length > MIN_SECTIONS_TO_KEEP && trimmedChars < overage) {
                const removed = sections.pop()!
                trimmedChars += removed.length + 2 // +2 for the \n\n separator
            }

            const truncatedContext = sections.join("\n\n")
            systemPromptWithContext = systemPromptWithContext.replace(companyContext, truncatedContext)
            console.warn(`[agents/execute] Trimmed company context: removed ${trimmedChars} chars (${sections.length} sections kept)`, { specialistId })
        }
    }

    // Complexity-based tier escalation — Fix 4
    // When a minimax-tier specialist receives a request classified as 'high' complexity
    // (long message + analysis/strategy keywords + multiple questions), escalate to the
    // qwen tier for that single request to maintain response quality.
    // DECISION: minimax→qwen only (not qwen→claude) to keep cost predictable.
    if (modelTier === 'minimax' && specialistId && modality === 'text') {
        const complexity = classifyComplexity(input)
        if (complexity === 'high') {
            console.info('[agents/execute] Complexity escalation: minimax → qwen', {
                specialistId,
                inputLength: input.length,
            })
            modelTier = 'qwen'
        }
    }

    // Build the fallback chain for text modalities.
    // If the client sent modelTier, use that chain. Otherwise fall back to single-provider (no failover).
    const fallbackChain: ProviderTarget[] = modelTier
        ? FALLBACK_CHAINS[modelTier]
        : [{ providerId, modelId }]

    // ─── Web Search Detection ──────────────────────────────────────
    // Claude-tier: always enable web search as a native tool (specialists decide when to search)
    // Non-Claude: web_search is included in specialistTools above (replaces keyword heuristic)
    const isClaudeTier = isClaudeTierEarly
    const needsSearch = specialistId && modality === "text" && shouldTriggerWebSearch(input)
    let enableWebSearchForStreaming = false

    if (needsSearch && !isClaudeTier && specialistId) {
        // Pre-search for non-Claude providers (keyword-triggered fallback)
        try {
            const specialist = getSpecialistById(specialistId)
            const results = await runPreSearch(input, specialist?.title ?? "business", 2)
            if (results.sources.length > 0) {
                systemPromptWithContext += "\n\n" + formatSearchResultsForPrompt(results)
            }
        } catch (err) {
            console.warn("[agents/execute] Pre-search failed:", err)
        }
    } else if (isClaudeTier && specialistId && modality === "text") {
        // DECISION: Always enable web search for Claude-tier specialists.
        // The model decides when to search rather than relying on keyword heuristics.
        enableWebSearchForStreaming = true
    }

    try {
        // DECISION: Non-claude-tier specialists (minimax/qwen) use speculative dual-stream
        // for instant perceived response. Pre-fetch data tools (parallel) so the fast model
        // has company context even without native tool calling. With tool caching (60s TTL),
        // this pre-fetch is near-instant on cache hits.
        if (modality === "text" && speculative && specialistId && !isClaudeTier) {
            const specialist = getSpecialistById(specialistId)

            // Pre-fetch data tools for specialists that have tools (all minimax specialists do)
            if (specialistTools.length > 0 && foundryId) {
                const dataTools = ["query_objectives", "query_tasks", "query_activity_metrics"]
                const toolCtx = { foundryId }
                const results = await Promise.all(
                    dataTools.map(async (toolName) => {
                        try { return await executeToolCall(toolName, {}, toolCtx) }
                        catch { return null }
                    })
                )
                let toolContext = ""
                for (const result of results) {
                    if (result && !result.startsWith("Error") && !result.startsWith("No ")) {
                        toolContext += `\n\n${result}`
                    }
                }
                if (toolContext) {
                    systemPromptWithContext += `\n\n## Live Company Data\n${toolContext}`
                }
            }

            return withHealedThreadHeader(await handleSpeculativeStreaming(
                fallbackChain,
                finalPrompt,
                systemPromptWithContext,
                memoryCallback,
                enableThinking,
                conversationHistory,
                rolloutId,
                specialist?.name ?? "Specialist",
                specialist?.title ?? "Advisor",
                specialist?.workingStyle ?? "",
            ))
        }
        // DECISION: Route to tool-aware streaming when specialist has tools (claude-tier).
        // This enables the multi-turn tool loop where the model can query data,
        // run calculations, and search the web before responding.
        if (modality === "text" && specialistTools.length > 0 && foundryId && specialistId) {
            return withHealedThreadHeader(await handleToolAwareStreaming({
                chain: fallbackChain,
                finalPrompt,
                systemPrompt: systemPromptWithContext,
                onComplete: memoryCallback,
                enableThinking,
                history: conversationHistory,
                rolloutId,
                enableWebSearch: enableWebSearchForStreaming,
                groundingLayers: activeLayers,
                tools: specialistTools,
                foundryId,
                specialistId,
                userId: user.id,
                threadId,
            }))
        }
        if (modality === "text") {
            return withHealedThreadHeader(await handleTextStreaming(fallbackChain, finalPrompt, systemPromptWithContext, memoryCallback, enableThinking, conversationHistory, rolloutId, enableWebSearchForStreaming, activeLayers))
        }
        if (modality === "slides") {
            return withHealedThreadHeader(await handleTextStreaming(fallbackChain, finalPrompt, SLIDES_SYSTEM_PROMPT, memoryCallback, enableThinking, undefined, rolloutId))
        }
        if (modality === "image") {
            const result = await handleImageGeneration(apiKey, providerId, modelId, finalPrompt)
            logUsageAfterCompletion(0).catch(() => {})
            if (rolloutId) finishRollout(rolloutId, "finished").catch(() => {})
            return result
        }
        if (modality === "audio") {
            const result = await handleAudioGeneration(apiKey, providerId, modelId, finalPrompt)
            logUsageAfterCompletion(0).catch(() => {})
            if (rolloutId) finishRollout(rolloutId, "finished").catch(() => {})
            return result
        }
        if (modality === "video") {
            const result = await handleVideoGeneration(apiKey, providerId, modelId, finalPrompt, videoConfig, firstFrameImage)
            logUsageAfterCompletion(0).catch(() => {})
            if (rolloutId) finishRollout(rolloutId, "finished").catch(() => {})
            return result
        }

        return NextResponse.json({ error: `Unsupported modality: ${modality}` }, { status: 400 })
    } catch (err) {
        if (rolloutId) {
            finishRollout(rolloutId, "failed").catch(() => {})
        }
        console.error(`[agents/execute] ${providerId}/${modality} error:`, err)
        return NextResponse.json(
            { error: "Failed to execute prompt" },
            { status: 500 }
        )
    }
}

// AUDIT: classifyStreamError + ClassifiedError extracted to src/lib/agents/error-classification.ts
// (2026-02-19, refactor step 3 of 8). Now independently testable.
import { classifyStreamError } from "@/lib/agents/error-classification"

// ─── Text Streaming Handler (with Provider Failover) ─────────────────

/**
 * Streams a text generation response back to the client via SSE,
 * with automatic failover across providers in the fallback chain.
 *
 * @description Tries each provider in the chain sequentially. If the primary
 * provider throws a retryable error (503, rate limit, network) during stream
 * setup, the next provider in the chain is attempted. Mid-stream errors
 * (after chunks have already been sent) are NOT retried — the partial
 * response is abandoned and the error is surfaced to the client.
 *
 * @param chain - Ordered list of {providerId, modelId} to try
 * @param finalPrompt - The user prompt with placeholders resolved
 * @param customSystemPrompt - System prompt override
 * @param onComplete - Callback fired after streaming completes (for memory + usage logging)
 * @param enableThinking - When true, enables Anthropic extended thinking for deeper reasoning
 * @param history - Optional conversation history for multi-turn context
 *
 * @security Failover never leaves the declared chain. qwen-local chains
 * have no cloud fallbacks, preserving the privacy contract.
 */
async function handleTextStreaming(
    chain: ProviderTarget[],
    finalPrompt: string,
    customSystemPrompt?: string,
    onComplete?: (fullOutput: string) => Promise<void>,
    enableThinking?: boolean,
    history?: ConversationMessage[],
    rolloutId?: string | null,
    enableWebSearch?: boolean,
    groundingLayers?: string[],
): Promise<Response> {
    const conversationHistory = history?.map((msg) => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
    }))

    const encoder = new TextEncoder()
    let fullOutput = ""

    const readable = new ReadableStream({
        async start(controller) {
            // Emit grounding event with active context layers before LLM stream
            if (groundingLayers && groundingLayers.length > 0) {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ grounding: { activeLayers: groundingLayers } })}\n\n`))
                } catch {
                    // Stream not ready yet
                }
            }

            const heartbeatInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(": keepalive\n\n"))
                } catch {
                    // Stream already closed
                }
            }, 15_000)

            let lastError = "No providers available"

            for (let i = 0; i < chain.length; i++) {
                const target = chain[i]
                const streamFn = getTextProvider(target.providerId)
                if (!streamFn) {
                    console.warn("[agents/execute] Provider does not support text:", target.providerId)
                    continue
                }

                const targetApiKey = resolveApiKeyForProvider(target.providerId)
                if (!targetApiKey) {
                    console.warn("[agents/execute] No API key for fallback provider:", target.providerId)
                    continue
                }

                const maxTokens = enableThinking ? 32768 : 16384
                const useThinking = enableThinking && target.providerId === "anthropic"

                if (i > 0) {
                    console.info("[agents/execute] Failover attempt:", {
                        attempt: i + 1,
                        from: `${chain[i - 1].providerId}/${chain[i - 1].modelId}`,
                        to: `${target.providerId}/${target.modelId}`,
                        reason: lastError,
                    })
                }

                try {
                    await new Promise<void>((resolve, reject) => {
                        let hasStartedStreaming = false

                        // Only enable web search for Anthropic providers
                        const useWebSearch = enableWebSearch && target.providerId === "anthropic"

                        streamFn({
                            apiKey: targetApiKey,
                            modelId: target.modelId,
                            systemPrompt: customSystemPrompt ?? SYSTEM_PROMPT,
                            userPrompt: finalPrompt,
                            conversationHistory,
                            maxTokens,
                            enableThinking: useThinking,
                            enableWebSearch: useWebSearch,
                            onCitations: useWebSearch ? (sources) => {
                                try {
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ webSources: sources })}\n\n`))
                                } catch {
                                    // Stream may be closed
                                }
                            } : undefined,
                            onChunk(text) {
                                hasStartedStreaming = true
                                fullOutput += text
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                            },
                            onDone() {
                                clearInterval(heartbeatInterval)
                                controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                                controller.close()
                                if (onComplete && fullOutput) {
                                    onComplete(fullOutput).catch(() => {})
                                }
                                resolve()
                            },
                            onError(error) {
                                if (hasStartedStreaming) {
                                    if (rolloutId) finishRollout(rolloutId, "failed").catch(() => {})
                                    clearInterval(heartbeatInterval)
                                    console.error("[agents/execute] Mid-stream error (no failover):", {
                                        provider: target.providerId,
                                        model: target.modelId,
                                        error,
                                    })
                                    const classified = classifyStreamError(error)
                                    controller.enqueue(
                                        encoder.encode(`data: ${JSON.stringify({
                                            error: classified.message,
                                            errorCategory: classified.category,
                                            rawHint: classified.rawHint,
                                        })}\n\n`)
                                    )
                                    controller.close()
                                    resolve()
                                } else {
                                    reject(new Error(error))
                                }
                            },
                        }).catch(reject)
                    })

                    // If we reach here, streaming completed successfully
                    if (i > 0) {
                        console.info("[agents/execute] Failover succeeded:", {
                            provider: target.providerId,
                            model: target.modelId,
                            attempt: i + 1,
                        })
                    }
                    return // Exit the ReadableStream start — response is streaming
                } catch (err) {
                    const errorStr = err instanceof Error ? err.message : String(err)
                    lastError = errorStr

                    if (isRetryableError(errorStr) && i < chain.length - 1) {
                        // Retryable error with more providers available — continue to next
                        console.warn("[agents/execute] Retryable error, trying next provider:", {
                            failedProvider: target.providerId,
                            failedModel: target.modelId,
                            error: errorStr,
                            remainingProviders: chain.length - i - 1,
                        })
                        continue
                    }

                    // Non-retryable error OR last provider in chain — surface to client
                    if (rolloutId) finishRollout(rolloutId, "failed").catch(() => {})
                    clearInterval(heartbeatInterval)
                    if (!isRetryableError(errorStr)) {
                        console.error("[agents/execute] Non-retryable error:", {
                            provider: target.providerId,
                            model: target.modelId,
                            error: errorStr,
                        })
                    } else {
                        console.error("[agents/execute] All providers exhausted:", {
                            chainLength: chain.length,
                            lastProvider: target.providerId,
                            lastError: errorStr,
                        })
                    }

                    const classified = classifyStreamError(errorStr)
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                            error: classified.message,
                            errorCategory: classified.category,
                            rawHint: classified.rawHint,
                        })}\n\n`)
                    )
                    controller.close()
                    return
                }
            }

            // All providers skipped (no streamFn or no API key) — should be very rare
            clearInterval(heartbeatInterval)
            console.error("[agents/execute] No viable provider in fallback chain:", {
                chain: chain.map(t => t.providerId),
                lastError,
            })
            const classified = classifyStreamError(lastError)
            controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                    error: classified.message,
                    errorCategory: classified.category,
                    rawHint: classified.rawHint,
                })}\n\n`)
            )
            controller.close()
        },
    })

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...(rolloutId ? { "X-Rollout-Id": rolloutId } : {}),
        },
    })
}

// ─── Tool-Aware Streaming Handler ────────────────────────────────────

/**
 * Parameters for the tool-aware streaming handler.
 */
interface ToolAwareStreamingParams {
    chain: ProviderTarget[]
    finalPrompt: string
    systemPrompt: string
    onComplete?: (fullOutput: string) => Promise<void>
    enableThinking?: boolean
    history?: ConversationMessage[]
    rolloutId?: string | null
    enableWebSearch?: boolean
    groundingLayers?: string[]
    tools: ToolDefinition[]
    foundryId: string
    specialistId: string
    userId?: string
    threadId?: string
}

/**
 * Streams a text generation response with tool-calling support.
 *
 * @description Implements a multi-turn tool loop where the LLM can invoke
 * tools (query data, run calculations, search web) and receive results before
 * producing its final response. Uses the Anthropic beta API for Claude-tier
 * (non-streaming with simulated chunks, like web search handler) and falls
 * back to standard streaming for non-Claude providers with tool results
 * injected as context.
 *
 * Tool loop: max 8 iterations. Each tool call is a Supabase query or
 * sandboxed JS execution (cheap). The extra LLM turns are bounded.
 * A `tools_remaining` counter is injected so the model can plan its
 * tool usage. Multiple tool_use blocks in a single response are
 * executed in parallel via Promise.all.
 *
 * @param params - All parameters for tool-aware streaming
 * @returns SSE Response with tool-use markers and final text
 */
async function handleToolAwareStreaming(params: ToolAwareStreamingParams): Promise<Response> {
    const {
        chain, finalPrompt, systemPrompt, onComplete, enableThinking,
        history, rolloutId, enableWebSearch, groundingLayers,
        tools, foundryId, specialistId, userId, threadId,
    } = params

    const encoder = new TextEncoder()
    let fullOutput = ""
    const MAX_TOOL_LOOPS = 8

    // Resolve the primary provider from the chain
    const primaryTarget = chain[0]
    if (!primaryTarget) {
        return NextResponse.json({ error: "No providers available" }, { status: 503 })
    }

    const targetApiKey = resolveApiKeyForProvider(primaryTarget.providerId)
    if (!targetApiKey) {
        return NextResponse.json({ error: "No API key for provider" }, { status: 503 })
    }

    const isAnthropic = primaryTarget.providerId === "anthropic"

    const readable = new ReadableStream({
        async start(controller) {
            // Emit grounding event with active context layers
            if (groundingLayers && groundingLayers.length > 0) {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ grounding: { activeLayers: groundingLayers } })}\n\n`))
                } catch {
                    // Stream not ready yet
                }
            }

            const heartbeatInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(": keepalive\n\n"))
                } catch {
                    // Stream already closed
                }
            }, 15_000)

            try {
                if (isAnthropic) {
                    // ── Anthropic Tool Loop (non-streaming beta API) ──────
                    const Anthropic = (await import("@anthropic-ai/sdk")).default
                    const client = new Anthropic({ apiKey: targetApiKey })

                    // Build conversation messages
                    const conversationMessages: Array<{
                        role: "user" | "assistant"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        content: string | any[]
                    }> = []
                    if (history && history.length > 0) {
                        for (const msg of history) {
                            if (msg.role === "user" || msg.role === "assistant") {
                                conversationMessages.push({ role: msg.role, content: msg.content })
                            }
                        }
                    }
                    conversationMessages.push({ role: "user", content: finalPrompt })

                    // Build tool definitions for Anthropic format
                    const anthropicTools: Array<{
                        name: string
                        description: string
                        input_schema: Record<string, unknown>
                    }> = tools.map((t) => ({
                        name: t.name,
                        description: t.description,
                        input_schema: t.parameters,
                    }))

                    // Add web search tool if enabled
                    const WEB_SEARCH_BETA = "code-execution-web-tools-2026-02-09"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const allTools: any[] = [...anthropicTools]
                    const betas: string[] = []
                    if (enableWebSearch) {
                        allTools.push({
                            type: "web_search_20260209",
                            name: "web_search",
                            max_uses: 3,
                        })
                        betas.push(WEB_SEARCH_BETA)
                    }

                    const maxTokens = enableThinking ? 32768 : 16384
                    const useThinking = enableThinking && primaryTarget.providerId === "anthropic"

                    const createParams = {
                        model: primaryTarget.modelId,
                        max_tokens: maxTokens,
                        system: systemPrompt,
                        messages: conversationMessages,
                        tools: allTools,
                        tool_choice: { type: "auto" as const },
                        ...(betas.length > 0 && { betas }),
                        ...(useThinking && {
                            thinking: {
                                type: "enabled" as const,
                                budget_tokens: 10_000,
                            },
                        }),
                    }

                    let loopCount = 0

                    while (loopCount <= MAX_TOOL_LOOPS) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const response = await client.beta.messages.create(createParams as any) as any

                        // Handle pause_turn (web search continuation)
                        let finalResponse = response
                        let continueCount = 0
                        while (finalResponse.stop_reason === "pause_turn" && continueCount < 3) {
                            continueCount++
                            const continueMessages = [
                                ...conversationMessages,
                                { role: "assistant" as const, content: finalResponse.content },
                                { role: "user" as const, content: "Continue." },
                            ]
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- beta API types incomplete
                            finalResponse = await client.beta.messages.create({
                                ...createParams,
                                messages: continueMessages,
                            } as any) as any
                        }

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const content: any[] = finalResponse.content ?? []

                        // Check if the model wants to use tools
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const toolUseBlocks = content.filter((b: any) => b.type === "tool_use")
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const textBlocks = content.filter((b: any) => b.type === "text")

                        // Stream any intermediate text the model produced before tool calls
                        for (const block of textBlocks) {
                            if (block.text) {
                                const chunkSize = 100
                                for (let i = 0; i < block.text.length; i += chunkSize) {
                                    const text = block.text.slice(i, i + chunkSize)
                                    fullOutput += text
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                                }
                            }
                        }

                        // Extract and emit web search citations
                        const citations: Array<{ title: string; url: string; snippet: string }> = []
                        const seenUrls = new Set<string>()
                        for (const block of content) {
                            if (block.type === "text" && block.citations) {
                                for (const c of block.citations) {
                                    const url = c.url ?? ""
                                    if (url && !seenUrls.has(url)) {
                                        seenUrls.add(url)
                                        citations.push({
                                            title: (c.title ?? "Source").toString(),
                                            url,
                                            snippet: (c.cited_text ?? "").slice(0, 200),
                                        })
                                    }
                                }
                            }
                        }
                        if (citations.length > 0) {
                            try {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ webSources: citations })}\n\n`))
                            } catch {
                                // Stream may be closed
                            }
                        }

                        // If no tool calls or we've hit the limit, we're done
                        if (toolUseBlocks.length === 0 || loopCount >= MAX_TOOL_LOOPS) {
                            break
                        }

                        // Stream tool-use markers to the client for UX feedback
                        for (const toolBlock of toolUseBlocks) {
                            try {
                                controller.enqueue(encoder.encode(
                                    `data: ${JSON.stringify({ toolUse: { name: toolBlock.name, id: toolBlock.id } })}\n\n`,
                                ))
                            } catch {
                                // Stream may be closed
                            }
                            console.info("[agents/execute] Tool call:", {
                                tool: toolBlock.name,
                                specialistId,
                                loopIteration: loopCount,
                            })
                        }

                        // Execute all tool calls in parallel for lower latency
                        const toolResults = await Promise.all(
                            toolUseBlocks.map(async (toolBlock: { name: string; input?: Record<string, unknown>; id: string }) => {
                                const result = await executeToolCall(
                                    toolBlock.name,
                                    (toolBlock.input ?? {}) as Record<string, unknown>,
                                    { foundryId, specialistId, userId, threadId },
                                )
                                return {
                                    type: "tool_result" as const,
                                    tool_use_id: toolBlock.id,
                                    content: result,
                                }
                            })
                        )

                        // Append the assistant's response (with tool_use) and tool results to messages
                        conversationMessages.push({
                            role: "assistant",
                            content: finalResponse.content,
                        })

                        loopCount++
                        const remaining = MAX_TOOL_LOOPS - loopCount

                        // Inject tools_remaining counter so the model can plan its tool usage
                        conversationMessages.push({
                            role: "user",
                            content: [
                                ...toolResults,
                                { type: "text", text: `[System: ${remaining} tool call${remaining === 1 ? "" : "s"} remaining]` },
                            ],
                        })

                        // Update createParams with new messages for next iteration
                        createParams.messages = conversationMessages
                    }
                } else {
                    // ── Non-Anthropic: inject tool context into system prompt ──
                    // For non-Claude providers, we execute all common tools upfront
                    // and inject results as system prompt context. This is simpler
                    // than full tool-calling integration for Qwen/MiniMax/OpenAI.
                    let toolContext = ""
                    const toolCtx = { foundryId }

                    // Execute data-access tools proactively for non-Claude providers
                    // DECISION: Run in parallel since each queries a different Supabase table (~200-400ms saved)
                    const dataTools = ["query_objectives", "query_tasks", "query_activity_metrics"]
                    const dataResults = await Promise.all(
                        dataTools.map(async (toolName) => {
                            try {
                                return await executeToolCall(toolName, {}, toolCtx)
                            } catch {
                                return null
                            }
                        })
                    )
                    for (const result of dataResults) {
                        if (result && !result.startsWith("Error") && !result.startsWith("No ")) {
                            toolContext += `\n\n${result}`
                        }
                    }

                    const enrichedSystemPrompt = toolContext
                        ? `${systemPrompt}\n\n## Live Company Data\n${toolContext}`
                        : systemPrompt

                    // Fall back to standard streaming with enriched context
                    const streamFn = getTextProvider(primaryTarget.providerId)
                    if (!streamFn) {
                        throw new Error(`Provider ${primaryTarget.providerId} does not support text`)
                    }

                    const conversationHistory = history?.map((msg) => ({
                        role: msg.role as "system" | "user" | "assistant",
                        content: msg.content,
                    }))

                    await new Promise<void>((resolve, reject) => {
                        streamFn({
                            apiKey: targetApiKey,
                            modelId: primaryTarget.modelId,
                            systemPrompt: enrichedSystemPrompt,
                            userPrompt: finalPrompt,
                            conversationHistory,
                            maxTokens: enableThinking ? 32768 : 16384,
                            onChunk(text) {
                                fullOutput += text
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                            },
                            onDone() {
                                resolve()
                            },
                            onError(error) {
                                reject(new Error(error))
                            },
                        }).catch(reject)
                    })
                }

                // Stream complete
                clearInterval(heartbeatInterval)
                controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                controller.close()

                if (onComplete && fullOutput) {
                    onComplete(fullOutput).catch(() => {})
                }
                if (rolloutId) finishRollout(rolloutId, "finished").catch(() => {})
            } catch (err) {
                clearInterval(heartbeatInterval)
                if (rolloutId) finishRollout(rolloutId, "failed").catch(() => {})

                const errorStr = err instanceof Error ? err.message : String(err)
                console.error("[agents/execute] Tool-aware streaming failed:", {
                    provider: primaryTarget.providerId,
                    model: primaryTarget.modelId,
                    specialistId,
                    error: errorStr,
                })

                const classified = classifyStreamError(errorStr)
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                            error: classified.message,
                            errorCategory: classified.category,
                            rawHint: classified.rawHint,
                        })}\n\n`),
                    )
                    controller.close()
                } catch {
                    // Stream may already be closed
                }
            }
        },
    })

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...(rolloutId ? { "X-Rollout-Id": rolloutId } : {}),
        },
    })
}

// ─── Speculative Dual-Stream Handler ─────────────────────────────────

/**
 * Runs a fast model and deep model in parallel over a single SSE connection.
 *
 * @description The fast model (Gemini Flash) provides an instant response while
 * the deep model (from the fallback chain) works on a thorough answer. The fast
 * model self-classifies the question's complexity:
 *
 * - **Simple**: Fast model answered fully → deep model call is aborted (cost saved)
 * - **Complex**: Fast model gave a brief acknowledgment → deep model continues
 *
 * SSE chunks are tagged with `{"stream":"fast",...}` or `{"stream":"deep",...}`
 * so the client can render them in the right place.
 *
 * @param chain - Fallback chain for the deep model
 * @param finalPrompt - User prompt with placeholders resolved
 * @param systemPrompt - Full system prompt (for deep model)
 * @param onComplete - Post-response callback (memory, usage logging)
 * @param enableThinking - Deep thinking for deep model
 * @param history - Conversation history for multi-turn
 * @param rolloutId - Rollout tracing ID
 * @param specialistName - Display name for fast model personality
 * @param specialistTitle - Role title for fast model personality
 * @param workingStyle - Working style description for fast model
 */
async function handleSpeculativeStreaming(
    chain: ProviderTarget[],
    finalPrompt: string,
    systemPrompt: string,
    onComplete?: (fullOutput: string) => Promise<void>,
    enableThinking?: boolean,
    history?: ConversationMessage[],
    rolloutId?: string | null,
    specialistName?: string,
    specialistTitle?: string,
    workingStyle?: string,
): Promise<Response> {
    const encoder = new TextEncoder()
    const conversationHistory = history?.map((msg) => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
    }))

    // Trim conversation history for the fast model (last 4 messages max)
    const recentMessages = conversationHistory?.slice(-4).map(m => ({
        role: m.role,
        content: m.content.slice(0, 500),
    }))

    const fastSystemPrompt = buildSpeculativeFastPrompt(
        specialistName ?? "Specialist",
        specialistTitle ?? "Advisor",
        workingStyle ?? "",
        recentMessages,
    )

    const readable = new ReadableStream({
        async start(controller) {
            const heartbeatInterval = setInterval(() => {
                try { controller.enqueue(encoder.encode(": keepalive\n\n")) } catch { /* closed */ }
            }, 15_000)

            let fastFullOutput = ""
            let deepFullOutput = ""
            let complexity: "simple" | "complex" = "complex"
            const deepAbortController = new AbortController()
            let fastDone = false
            let deepDone = false

            const sendTaggedChunk = (stream: "fast" | "deep", data: Record<string, unknown>): void => {
                try {
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({ stream, ...data })}\n\n`
                    ))
                } catch { /* stream closed */ }
            }

            const tryFinalize = (): void => {
                if (!fastDone || !deepDone) return
                clearInterval(heartbeatInterval)
                // INTENT: Save only the substantive answer to memory. When the
                // question was "simple", the fast model IS the answer. When
                // "complex", the deep model has the real analysis — the fast
                // model's brief acknowledgment ("Great question, let me think...")
                // wastes tokens and reads unnaturally in future conversation history.
                const outputForMemory = complexity === "simple"
                    ? fastFullOutput
                    : (deepFullOutput || fastFullOutput).trim()
                controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                controller.close()
                if (onComplete && outputForMemory) {
                    onComplete(outputForMemory).catch(() => {})
                }
            }

            // ── Fast model call ──────────────────────────────────────────

            const runFastModel = async (): Promise<void> => {
                for (const target of FAST_MODEL_CHAIN) {
                    const streamFn = getTextProvider(target.providerId)
                    const apiKey = resolveApiKeyForProvider(target.providerId)
                    if (!streamFn || !apiKey) continue

                    try {
                        await new Promise<void>((resolve, reject) => {
                            streamFn({
                                apiKey,
                                modelId: target.modelId,
                                systemPrompt: fastSystemPrompt,
                                userPrompt: finalPrompt,
                                maxTokens: 1024,
                                onChunk(text) {
                                    fastFullOutput += text
                                    sendTaggedChunk("fast", { text })
                                },
                                onDone() {
                                    const { cleanResponse, complexity: c } = parseComplexityTag(fastFullOutput)
                                    complexity = c
                                    fastFullOutput = cleanResponse

                                    sendTaggedChunk("fast", { done: true, complexity: c })

                                    // INTENT: If simple, abort the deep model to save cost.
                                    if (c === "simple") {
                                        deepAbortController.abort()
                                        deepDone = true
                                        sendTaggedChunk("deep", { done: true, skipped: true })
                                    }

                                    fastDone = true
                                    tryFinalize()
                                    resolve()
                                },
                                onError(error) {
                                    reject(new Error(error))
                                },
                            }).catch(reject)
                        })
                        return
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err)
                        console.warn("[speculative] Fast model failed, trying next:", { provider: target.providerId, error: msg })
                        continue
                    }
                }

                // All fast models failed — send fast_done with no content,
                // let the deep model be the sole responder.
                fastDone = true
                sendTaggedChunk("fast", { done: true, complexity: "complex" })
                tryFinalize()
            }

            // ── Deep model call ──────────────────────────────────────────

            const runDeepModel = async (): Promise<void> => {
                for (let i = 0; i < chain.length; i++) {
                    if (deepAbortController.signal.aborted) {
                        deepDone = true
                        tryFinalize()
                        return
                    }

                    const target = chain[i]
                    const streamFn = getTextProvider(target.providerId)
                    const apiKey = resolveApiKeyForProvider(target.providerId)
                    if (!streamFn || !apiKey) continue

                    const maxTokens = enableThinking ? 32768 : 16384
                    const useThinking = enableThinking && target.providerId === "anthropic"

                    try {
                        await new Promise<void>((resolve, reject) => {
                            if (deepAbortController.signal.aborted) {
                                resolve()
                                return
                            }

                            streamFn({
                                apiKey,
                                modelId: target.modelId,
                                systemPrompt,
                                userPrompt: finalPrompt,
                                conversationHistory,
                                maxTokens,
                                enableThinking: useThinking,
                                onChunk(text) {
                                    if (deepAbortController.signal.aborted) return
                                    deepFullOutput += text
                                    sendTaggedChunk("deep", { text })
                                },
                                onDone() {
                                    deepDone = true
                                    sendTaggedChunk("deep", { done: true })
                                    tryFinalize()
                                    resolve()
                                },
                                onError(error) {
                                    reject(new Error(error))
                                },
                            }).catch(reject)
                        })
                        return
                    } catch (err) {
                        if (deepAbortController.signal.aborted) {
                            deepDone = true
                            tryFinalize()
                            return
                        }
                        const msg = err instanceof Error ? err.message : String(err)
                        if (isRetryableError(msg) && i < chain.length - 1) {
                            console.warn("[speculative] Deep model failover:", { from: target.providerId, error: msg })
                            continue
                        }
                        // Surface error on the deep stream
                        sendTaggedChunk("deep", { error: msg })
                        deepDone = true
                        tryFinalize()
                        return
                    }
                }

                // All deep providers failed
                if (!deepDone) {
                    sendTaggedChunk("deep", { error: "All providers exhausted", done: true })
                    deepDone = true
                    tryFinalize()
                }
            }

            // Launch both in parallel
            Promise.all([runFastModel(), runDeepModel()]).catch((err) => {
                clearInterval(heartbeatInterval)
                console.error("[speculative] Unexpected error:", err)
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Speculative streaming failed" })}\n\n`))
                    controller.close()
                } catch { /* already closed */ }
            })
        },
    })

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...(rolloutId ? { "X-Rollout-Id": rolloutId } : {}),
        },
    })
}

// ─── Image Generation Handler ────────────────────────────────────────

async function handleImageGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string
): Promise<Response> {
    const genFn = getImageProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support image generation` },
            { status: 400 }
        )
    }

    const result = await genFn({ apiKey, modelId, prompt: finalPrompt })
    return NextResponse.json({ modality: "image", imageUrl: result.imageUrl })
}

// ─── Audio Generation Handler ────────────────────────────────────────

async function handleAudioGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string
): Promise<Response> {
    const genFn = getAudioProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support audio generation` },
            { status: 400 }
        )
    }

    const result = await genFn({ apiKey, modelId, text: finalPrompt })
    return NextResponse.json({ modality: "audio", audioUrl: result.audioUrl })
}

// ─── Video Generation Handler ────────────────────────────────────────

/**
 * Handles video generation with optional configuration and first-frame image.
 *
 * @param videoConfig - Optional duration, resolution, and prompt optimizer settings
 * @param firstFrameImage - Optional image URL for Image-to-Video mode (I2V)
 */
async function handleVideoGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string,
    videoConfig?: { duration?: number; resolution?: string; promptOptimizer?: boolean },
    firstFrameImage?: string,
): Promise<Response> {
    const genFn = getVideoProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support video generation` },
            { status: 400 }
        )
    }

    const result = await genFn({
        apiKey,
        modelId,
        prompt: finalPrompt,
        duration: videoConfig?.duration,
        resolution: videoConfig?.resolution,
        promptOptimizer: videoConfig?.promptOptimizer,
        firstFrameImage,
    })
    return NextResponse.json({ modality: "video", videoUrl: result.videoUrl })
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the active foundry ID for a user.
 *
 * @param supabase - Authenticated Supabase client
 * @param userId - The authenticated user's ID
 * @returns The foundry ID, or null if not found
 */
async function resolveFoundryId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
): Promise<string | null> {
    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id, active_foundry_id")
        .eq("id", userId)
        .single()

    return profile?.active_foundry_id || profile?.foundry_id || null
}
