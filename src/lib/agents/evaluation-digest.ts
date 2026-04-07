/**
 * @file evaluation-digest.ts — Aggregates specialist evaluation scores across
 * the last 30 days, identifies systematic weak spots, and generates concrete
 * patches to domain-knowledge markdown files via Claude.
 *
 * @description Cross-foundry, cross-specialist quality analysis. Pulls all
 * evaluated assistant messages, groups by specialist, computes averages, then
 * uses Claude to write targeted prompt patches for underperforming specialists.
 *
 * @related
 * - Evaluator: src/lib/agents/evaluator.ts (writes scores)
 * - Lessons Learned: src/lib/agents/lessons-learned.ts (per-specialist layer)
 * - Domain Knowledge: src/lib/agents/domain-knowledge/ (patch targets)
 * - Prompt Builder: src/lib/agents/prompt-builder.ts (consumes domain knowledge)
 */

import Anthropic from "@anthropic-ai/sdk"

import { createAdminClient } from "@/lib/supabase/admin"

// INTENT: Specialist ID → domain knowledge file mapping (authoritative list from reference doc)
const SPECIALIST_FILE_MAP: Record<string, string> = {
    "strategist": "src/lib/agents/domain-knowledge/strategist.md",
    "cto": "src/lib/agents/domain-knowledge/cto.md",
    "vp-engineering": "src/lib/agents/domain-knowledge/vp-engineering.md",
    "vp-manufacturing": "src/lib/agents/domain-knowledge/vp-manufacturing.md",
    "vp-supply-chain": "src/lib/agents/domain-knowledge/vp-supply-chain.md",
    "product-lead": "src/lib/agents/domain-knowledge/product-lead.md",
    "growth-marketer": "src/lib/agents/domain-knowledge/growth-marketer.md",
    "sales-lead": "src/lib/agents/domain-knowledge/sales-lead.md",
    "chief-of-staff": "src/lib/agents/domain-knowledge/chief-of-staff.md",
    "finance-lead": "src/lib/agents/domain-knowledge/finance-lead.md",
    "fundraising-advisor": "src/lib/agents/domain-knowledge/fundraising-advisor.md",
    "hiring-team": "src/lib/agents/domain-knowledge/hiring-team.md",
    "legal-counsel": "src/lib/agents/domain-knowledge/legal-counsel.md",
}

// DECISION: Minimum responses needed before flagging — avoids noise from low sample sizes
const MIN_RESPONSE_COUNT = 3
const WEAK_OVERALL_THRESHOLD = 0.6
const WEAK_DIMENSION_THRESHOLD = 0.5
const STRONG_OVERALL_THRESHOLD = 0.8

type Dimension = "relevance" | "completeness" | "actionability"

export interface WeakSpot {
    specialistId: string
    avgOverall: number
    avgRelevance: number
    avgCompleteness: number
    avgActionability: number
    responseCount: number
    weakestDimension: Dimension
    feedbackSamples: string[]
}

export interface PromptPatch {
    specialistId: string
    targetFile: string
    sectionTitle: string
    content: string
    reasoning: string
}

export interface DigestResult {
    weakSpots: WeakSpot[]
    patches: PromptPatch[]
    strongSpots: Array<{ specialistId: string; avgOverall: number; responseCount: number }>
    ranAt: string
}

// INTENT: Internal type for joining messages with their thread's specialist ID
interface EvaluatedMessage {
    specialistId: string
    overall: number
    relevance: number
    completeness: number
    actionability: number
    feedback: string
}

interface EvaluationScores {
    overall: number
    relevance: number
    completeness: number
    actionability: number
    feedback?: string
}

/**
 * Pure aggregation function — testable without DB or AI calls.
 *
 * @description Groups evaluated messages by specialist, computes averages,
 * and classifies into weak spots and strong spots.
 *
 * @param messages - Pre-joined messages with specialist IDs and evaluation scores
 * @returns Weak spots and strong spots, sorted by score
 */
export function aggregateBySpecialist(
    messages: EvaluatedMessage[],
): { weakSpots: WeakSpot[]; strongSpots: Array<{ specialistId: string; avgOverall: number; responseCount: number }> } {
    // INTENT: Group by specialist ID
    const bySpecialist = new Map<string, EvaluatedMessage[]>()
    for (const msg of messages) {
        const existing = bySpecialist.get(msg.specialistId)
        if (existing) {
            existing.push(msg)
        } else {
            bySpecialist.set(msg.specialistId, [msg])
        }
    }

    const weakSpots: WeakSpot[] = []
    const strongSpots: Array<{ specialistId: string; avgOverall: number; responseCount: number }> = []

    for (const [specialistId, msgs] of bySpecialist) {
        if (msgs.length < MIN_RESPONSE_COUNT) continue

        const count = msgs.length
        const avgOverall = msgs.reduce((s, m) => s + m.overall, 0) / count
        const avgRelevance = msgs.reduce((s, m) => s + m.relevance, 0) / count
        const avgCompleteness = msgs.reduce((s, m) => s + m.completeness, 0) / count
        const avgActionability = msgs.reduce((s, m) => s + m.actionability, 0) / count

        // INTENT: Determine weakest dimension
        const dims: Array<{ name: Dimension; avg: number }> = [
            { name: "relevance", avg: avgRelevance },
            { name: "completeness", avg: avgCompleteness },
            { name: "actionability", avg: avgActionability },
        ]
        dims.sort((a, b) => a.avg - b.avg)
        const weakestDimension = dims[0].name

        const feedbackSamples = msgs
            .map(m => m.feedback)
            .filter(f => f.length > 0)
            .slice(0, 5)

        const isWeakOverall = avgOverall < WEAK_OVERALL_THRESHOLD
        const isWeakDimension = dims[0].avg < WEAK_DIMENSION_THRESHOLD

        if (isWeakOverall || isWeakDimension) {
            weakSpots.push({
                specialistId,
                avgOverall: round(avgOverall),
                avgRelevance: round(avgRelevance),
                avgCompleteness: round(avgCompleteness),
                avgActionability: round(avgActionability),
                responseCount: count,
                weakestDimension,
                feedbackSamples,
            })
        } else if (avgOverall > STRONG_OVERALL_THRESHOLD) {
            strongSpots.push({
                specialistId,
                avgOverall: round(avgOverall),
                responseCount: count,
            })
        }
    }

    // INTENT: Sort weak spots worst-first, strong spots best-first
    weakSpots.sort((a, b) => a.avgOverall - b.avgOverall)
    strongSpots.sort((a, b) => b.avgOverall - a.avgOverall)

    return { weakSpots, strongSpots }
}

function round(n: number): number {
    return Math.round(n * 100) / 100
}

/**
 * Runs the full evaluation digest pipeline.
 *
 * @description Fetches evaluation data from the last 30 days, aggregates by
 * specialist, identifies weak/strong spots, and generates prompt patches for
 * weak spots using Claude.
 *
 * @returns DigestResult with weak spots, patches, strong spots, and timestamp
 */
export async function runEvaluationDigest(): Promise<DigestResult> {
    const supabase = createAdminClient()

    // Step 1: Fetch threads with specialist IDs
    // GOTCHA: specialist_id is NOT a column — it's stored in context_id (when context_type='specialist')
    // and also in metadata->specialistId. We use context_id as the canonical source.
    const { data: threads, error: threadErr } = await supabase
        .from("agent_memory_threads")
        .select("id, context_id, context_type")
        .eq("context_type", "specialist")
        .not("context_id", "is", null)

    if (threadErr) {
        console.error("[evaluation-digest] Failed to fetch threads:", threadErr.message)
        return emptyResult()
    }

    if (!threads || threads.length === 0) {
        return emptyResult()
    }

    // INTENT: Build thread→specialist lookup for fast JS-side join
    const threadSpecialist = new Map<string, string>()
    for (const t of threads) {
        if (t.context_id) {
            threadSpecialist.set(t.id, t.context_id)
        }
    }

    // Step 1b: Fetch evaluated assistant messages from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // GOTCHA: agent_memory_messages has no 'message_index' column — removed from select
    const { data: messages, error: msgErr } = await supabase
        .from("agent_memory_messages")
        .select("id, thread_id, metadata, created_at")
        .eq("role", "assistant")
        .gte("created_at", thirtyDaysAgo)
        .not("metadata", "is", null)
        .order("created_at", { ascending: false })
        .limit(500)

    if (msgErr) {
        console.error("[evaluation-digest] Failed to fetch messages:", msgErr.message)
        return emptyResult()
    }

    if (!messages || messages.length === 0) {
        return emptyResult()
    }

    // Step 1c: Join in JS — filter to messages that have evaluation scores AND a known specialist
    const evaluated: EvaluatedMessage[] = []
    for (const msg of messages) {
        const specialistId = threadSpecialist.get(msg.thread_id)
        if (!specialistId) continue

        const meta = msg.metadata as Record<string, unknown> | null
        const evalData = meta?.evaluation as EvaluationScores | undefined
        if (!evalData || typeof evalData.overall !== "number") continue

        evaluated.push({
            specialistId,
            overall: evalData.overall,
            relevance: evalData.relevance ?? 0,
            completeness: evalData.completeness ?? 0,
            actionability: evalData.actionability ?? 0,
            feedback: evalData.feedback ?? "",
        })
    }

    if (evaluated.length === 0) {
        return emptyResult()
    }

    // Step 2+3: Aggregate and classify
    const { weakSpots, strongSpots } = aggregateBySpecialist(evaluated)

    // Step 4: Generate patches via Claude (only if there are weak spots)
    let patches: PromptPatch[] = []
    if (weakSpots.length > 0) {
        patches = await generatePatches(weakSpots)
    }

    return {
        weakSpots,
        patches,
        strongSpots,
        ranAt: new Date().toISOString(),
    }
}

const PATCH_SYSTEM_PROMPT = `You write targeted additions to AI specialist domain-knowledge files based on measured quality problems.

For each weak spot, write ONE markdown section (under 300 words) to append to the specialist's file. Rules:
- If weakest dimension is actionability: add a checklist of specific outputs the specialist MUST include (numbers, timelines, costs, next steps)
- If weakest dimension is completeness: add a "Before responding, verify you addressed:" checklist
- If weakest dimension is relevance: add "Stay focused on:" guardrails
- Be SPECIFIC: "When advising on tolerances, ALWAYS include the ISO 2768 grade AND cost multiplier" not "be more actionable"
- Include your reasoning (what the data showed)

Return ONLY a JSON array (no markdown fences, no preamble):
[{"specialistId":"vp-manufacturing","targetFile":"src/lib/agents/domain-knowledge/vp-manufacturing.md","sectionTitle":"### Actionability: Tolerance Recommendations","content":"When a founder asks about tolerances...","reasoning":"5 responses averaged 0.42 actionability..."}]`

/**
 * Sends weak spots to Claude and parses the returned prompt patches.
 *
 * @param weakSpots - Identified weak spots to generate patches for
 * @returns Array of prompt patches, or empty array on failure
 */
async function generatePatches(weakSpots: WeakSpot[]): Promise<PromptPatch[]> {
    // INTENT: Enrich weak spots with targetFile before sending to Claude
    const enriched = weakSpots.map(ws => ({
        ...ws,
        targetFile: SPECIALIST_FILE_MAP[ws.specialistId] ?? `src/lib/agents/domain-knowledge/${ws.specialistId}.md`,
    }))

    const anthropic = new Anthropic()

    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: PATCH_SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: JSON.stringify(enriched, null, 2),
                },
            ],
        })

        // INTENT: Extract text from response content blocks
        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map(block => block.text)
            .join("")

        return parsePatchResponse(text)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[evaluation-digest] Claude API error:", message)
        return []
    }
}

/**
 * Parses Claude's JSON response into PromptPatch array.
 * Handles markdown fences, preamble, and malformed JSON gracefully.
 */
function parsePatchResponse(text: string): PromptPatch[] {
    // INTENT: Strip markdown code fences if Claude wraps the JSON
    let cleaned = text.trim()
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
        cleaned = fenceMatch[1].trim()
    }

    // INTENT: Find the JSON array even if there's preamble text
    const arrayStart = cleaned.indexOf("[")
    const arrayEnd = cleaned.lastIndexOf("]")
    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
        console.warn("[evaluation-digest] No JSON array found in Claude response")
        return []
    }

    try {
        const parsed: unknown = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1))
        if (!Array.isArray(parsed)) {
            console.warn("[evaluation-digest] Parsed response is not an array")
            return []
        }

        // INTENT: Validate each patch has required fields
        return parsed.filter((item): item is PromptPatch => {
            return (
                typeof item === "object" &&
                item !== null &&
                typeof (item as Record<string, unknown>).specialistId === "string" &&
                typeof (item as Record<string, unknown>).targetFile === "string" &&
                typeof (item as Record<string, unknown>).sectionTitle === "string" &&
                typeof (item as Record<string, unknown>).content === "string" &&
                typeof (item as Record<string, unknown>).reasoning === "string"
            )
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn("[evaluation-digest] Failed to parse Claude response as JSON:", message)
        return []
    }
}

/**
 * Apply digest patches by appending them to the corresponding domain-knowledge markdown files.
 *
 * @description Each patch targets a specific domain-knowledge file (e.g. vp-manufacturing.md).
 * This function reads the existing file, appends the patch section, and writes it back.
 * Uses Node fs directly because these are local project files, not Supabase data.
 *
 * @param patches - Patches from runEvaluationDigest()
 * @param dryRun - If true, logs what would be done but doesn't write files
 * @returns Count of applied and skipped patches
 */
export async function applyDigestPatches(
    patches: PromptPatch[],
    dryRun = false,
): Promise<{ applied: number; skipped: number; details: string[] }> {
    // INTENT: Dynamic import of fs/path to keep this module server-only and avoid bundler issues
    const fs = await import("fs/promises")
    const path = await import("path")

    let applied = 0
    let skipped = 0
    const details: string[] = []

    for (const patch of patches) {
        const filePath = path.resolve(process.cwd(), patch.targetFile)

        try {
            // Read existing content (create file if it doesn't exist)
            let existing = ""
            try {
                existing = await fs.readFile(filePath, "utf-8")
            } catch {
                // File doesn't exist yet — that's OK, we'll create it
                existing = `# ${patch.specialistId} Domain Knowledge\n\n`
            }

            // Check if this section already exists (avoid duplicates)
            if (existing.includes(patch.sectionTitle)) {
                details.push(`SKIPPED ${patch.specialistId}: "${patch.sectionTitle}" already exists in ${patch.targetFile}`)
                skipped++
                continue
            }

            const newContent = existing.trimEnd() + "\n\n" + patch.sectionTitle + "\n\n" + patch.content + "\n"

            if (dryRun) {
                details.push(`DRY RUN ${patch.specialistId}: would append "${patch.sectionTitle}" to ${patch.targetFile}`)
                details.push(`  Reasoning: ${patch.reasoning}`)
                applied++
            } else {
                // Ensure directory exists
                await fs.mkdir(path.dirname(filePath), { recursive: true })
                await fs.writeFile(filePath, newContent, "utf-8")
                details.push(`APPLIED ${patch.specialistId}: appended "${patch.sectionTitle}" to ${patch.targetFile}`)
                applied++
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            details.push(`FAILED ${patch.specialistId}: ${message}`)
            skipped++
        }
    }

    return { applied, skipped, details }
}

function emptyResult(): DigestResult {
    return {
        weakSpots: [],
        patches: [],
        strongSpots: [],
        ranAt: new Date().toISOString(),
    }
}
