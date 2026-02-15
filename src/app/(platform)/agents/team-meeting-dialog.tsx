"use client"

/**
 * @file team-meeting-dialog.tsx
 *
 * @description Multi-specialist roundtable meeting dialog. Users pick 2-9
 * specialists, pose a topic, and each specialist responds sequentially --
 * each seeing what prior specialists said. After Round 1 the user can
 * trigger discussion rounds where specialists respond to each other.
 * On wrap-up, generates structured meeting outputs (notes, objectives,
 * marketplace suggestions) via a single AI call.
 *
 * @related
 * - specialists-data.ts -- Specialist roster
 * - meeting-outputs.tsx -- Phase 4 tabbed outputs display
 * - /api/agents/execute -- AI execution endpoint
 * - agent-memory.ts -- Memory thread management
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import Image from "next/image"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    Loader2,
    Play,
    MessageCircle,
    AlertCircle,
    CheckCircle2,
    Users,
    X,
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/ui/markdown"
import { getOrCreateSpecialistThread } from "@/actions/agent-memory"
import { SPECIALISTS, getSpecialistById, getSpecialistDisplayName } from "./specialists-data"
import { compileInterSpecialistDynamics } from "@/lib/agents/relationship-matrix"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useTts } from "@/hooks/use-tts"
import { MeetingOutputs } from "./meeting-outputs"
import type { Specialist } from "./specialists-data"

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single specialist response within a meeting round */
interface MeetingEntry {
    specialistId: string
    specialistName: string
    round: number
    content: string
}

/** The four phases of a team meeting */
type MeetingPhase = "setup" | "in-progress" | "round-complete" | "outputs"

/** Structured outputs from the post-meeting AI call */
export interface MeetingOutputData {
    notes: {
        summary: string
        keyDecisions: string[]
        actionItems: string[]
        openQuestions: string[]
        nextSteps: string[]
    }
    objectives: Array<{
        title: string
        description: string
        tasks: Array<{ title: string; description: string }>
    }>
    marketplaceSuggestions: Array<{
        title: string
        reasoning: string
        category: "People" | "Products" | "Services"
        subcategory: string
        searchQuery: string
    }>
}

interface TeamMeetingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// ─── Meeting Topic Suggestions ────────────────────────────────────────────────

/** Suggestions for specific specialist pair/triple combinations (sorted key = specialist IDs joined). */
const COMBINATION_SUGGESTIONS: Record<string, string[]> = {
    "fundraising-advisor,strategist": [
        "Should we raise a Series A? What's our fundraising timeline?",
        "How do we position ourselves for investors given our current traction?",
    ],
    "growth-marketer,sales-lead": [
        "How do we build a go-to-market engine? What's our pipeline strategy?",
        "How should marketing and sales work together on lead gen?",
    ],
    "finance-lead,fundraising-advisor": [
        "What financial model do investors need to see? How's our burn rate?",
        "How do we extend runway while preparing for a raise?",
    ],
    "hiring-team,legal-counsel": [
        "What employment contracts and equity agreements do we need?",
        "How do we structure compensation and stay compliant?",
    ],
    "product-lead,strategist": [
        "What should our product roadmap look like? How do we prioritize?",
        "How do we validate product-market fit with limited resources?",
    ],
    "growth-marketer,product-lead": [
        "How do we drive adoption for our new feature launch?",
        "What's the ideal product-led growth strategy for us?",
    ],
    "finance-lead,strategist": [
        "What's our unit economics story? Are we building a sustainable business?",
        "How should we allocate our budget across the next quarter?",
    ],
    "chief-of-staff,strategist": [
        "What are the top 3 priorities for the company this quarter?",
        "Where are our biggest blind spots right now?",
    ],
    "fundraising-advisor,legal-counsel": [
        "What should we know about term sheets and investor agreements?",
        "How do we protect our interests during fundraising?",
    ],
    "finance-lead,hiring-team": [
        "Can we afford to hire right now? What's the cost per new hire?",
        "How do we plan headcount against our runway?",
    ],
    "growth-marketer,fundraising-advisor": [
        "How do we tell our growth story to investors?",
        "What marketing metrics do investors care about most?",
    ],
    "sales-lead,strategist": [
        "What pricing model maximizes revenue at our stage?",
        "How do we break into a new market segment?",
    ],
}

/** Per-specialist fallback suggestions when no combination matches. */
const SPECIALIST_SUGGESTIONS: Record<string, string[]> = {
    strategist: [
        "What's the best go-to-market strategy for our product?",
        "How should we think about competitive positioning?",
    ],
    "product-lead": [
        "What features should we prioritize for the next release?",
        "How do we write a PRD that engineers actually use?",
    ],
    "chief-of-staff": [
        "What's falling through the cracks that I'm not seeing?",
        "How should I prepare for our next board meeting?",
    ],
    "growth-marketer": [
        "What's the most effective marketing channel for our stage?",
        "How do we build a content strategy that drives pipeline?",
    ],
    "sales-lead": [
        "How do we get our first 100 paying customers?",
        "What does a winning cold outreach sequence look like?",
    ],
    "fundraising-advisor": [
        "Should we raise now or wait? What's our fundraising readiness?",
        "How do we build a compelling pitch narrative?",
    ],
    "finance-lead": [
        "How many months of runway do we have left?",
        "What KPIs should we track at our stage?",
    ],
    "hiring-team": [
        "Who should our next hire be?",
        "How do we attract top talent without big-company budgets?",
    ],
    "legal-counsel": [
        "What legal foundations do we need before we scale?",
        "How do we protect our IP and avoid early legal pitfalls?",
    ],
}

/**
 * Compute topic suggestions based on which specialists are selected.
 *
 * @description Checks combination keys first (pairs of selected specialists),
 * then falls back to per-specialist suggestions. Returns up to 4 suggestions.
 */
function computeSuggestions(selectedIds: Set<string>): string[] {
    if (selectedIds.size === 0) return []

    const suggestions: string[] = []

    // Check for 3+ selected: show a broad suggestion
    if (selectedIds.size >= 3) {
        suggestions.push("What's our 90-day company plan? Where do we focus?")
    }

    // Check combination matches (all pairs of selected specialists)
    const ids = Array.from(selectedIds).sort()
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const key = `${ids[i]},${ids[j]}`
            const combos = COMBINATION_SUGGESTIONS[key]
            if (combos) {
                suggestions.push(...combos)
            }
        }
    }

    // If we still need more, add per-specialist suggestions
    if (suggestions.length < 4) {
        for (const id of selectedIds) {
            const perSpecialist = SPECIALIST_SUGGESTIONS[id]
            if (perSpecialist) {
                suggestions.push(...perSpecialist)
            }
            if (suggestions.length >= 6) break
        }
    }

    // Deduplicate and cap at 4
    return [...new Set(suggestions)].slice(0, 4)
}

/**
 * Generate a dynamic placeholder based on selected specialists.
 */
function getDynamicPlaceholder(selectedIds: Set<string>): string {
    if (selectedIds.size === 0) {
        return "Select specialists above, then describe what you'd like to discuss..."
    }
    if (selectedIds.size === 1) {
        const id = Array.from(selectedIds)[0]
        const s = getSpecialistById(id)
        return s ? `What do you want to discuss with ${s.name} (${s.title})?` : "What do you want to discuss?"
    }
    const names = Array.from(selectedIds)
        .map((id) => getSpecialistById(id)?.name)
        .filter(Boolean)
        .join(", ")
    return `What should ${names} discuss together?`
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

/**
 * Maximum character budget for the prior discussion block in prompts.
 * The /api/agents/execute endpoint has a 50k char limit on the prompt field.
 * We reserve ~15k for the prompt template, company context placeholder, and
 * specialist metadata, leaving ~30k for prior discussion content.
 */
const MAX_PRIOR_DISCUSSION_CHARS = 30_000

/**
 * Truncates the prior discussion block to fit within the character budget.
 * Keeps the most recent entries in full (they're most relevant for continuity)
 * and summarizes older entries with just the specialist name and round.
 *
 * @param responses - All prior meeting entries
 * @param maxChars - Maximum character budget for the block
 * @returns Formatted prior discussion string within the budget
 */
function buildPriorDiscussionBlock(
    responses: MeetingEntry[],
    maxChars: number = MAX_PRIOR_DISCUSSION_CHARS
): string {
    if (responses.length === 0) return ""

    // Format all entries
    const formatted = responses.map(
        (r) => `**${r.specialistName}** (Round ${r.round}):\n${r.content}`
    )

    // Check if everything fits
    const fullBlock = formatted.join("\n\n---\n\n")
    if (fullBlock.length <= maxChars) return fullBlock

    // Doesn't fit — keep recent entries in full, truncate older ones.
    // Work backwards from the most recent entry.
    const separator = "\n\n---\n\n"
    let recentBlock = ""
    let recentCount = 0

    for (let i = formatted.length - 1; i >= 0; i--) {
        const candidate = recentCount === 0
            ? formatted[i]
            : formatted[i] + separator + recentBlock
        // Reserve ~2k chars for the summary header of truncated entries
        if (candidate.length > maxChars - 2000 && recentCount > 0) break
        recentBlock = candidate
        recentCount++
    }

    const truncatedCount = responses.length - recentCount
    if (truncatedCount === 0) {
        // Even with all entries, we're over budget — just hard-truncate
        return fullBlock.slice(0, maxChars) + "\n\n*[Discussion truncated for length]*"
    }

    // Build a brief summary of the truncated (older) entries
    const truncatedSummary = responses
        .slice(0, truncatedCount)
        .map((r) => `- ${r.specialistName} (Round ${r.round})`)
        .join("\n")

    return `*[Earlier discussion summarized — ${truncatedCount} responses from:]*\n${truncatedSummary}\n\n---\n\n${recentBlock}`
}

function buildMeetingPrompt(
    specialist: Specialist,
    topic: string,
    priorResponses: MeetingEntry[],
    round: number,
    userThoughts?: string
): string {
    const priorBlock = buildPriorDiscussionBlock(priorResponses)

    const displayName = getSpecialistDisplayName(specialist)

    if (round === 1) {
        return `You are ${specialist.name}, the ${specialist.title} specialist in a team meeting.

## Your Role
${specialist.description}

## Working Style
${specialist.workingStyle}

## Meeting Topic
"${topic}"

${priorBlock ? `## What Your Colleagues Have Said\n\n${priorBlock}\n\n` : ""}## Your Task
Provide your expert perspective on this topic. Be specific, actionable, and direct.
${priorBlock ? "Build on or respectfully challenge what your colleagues have said. Reference them by name. If you spot a synergy or conflict between your view and theirs, call it out explicitly." : "You are speaking first. Set the stage with your analysis and flag areas where you'll need input from other specialists."}

Keep your response focused and under 600 words. Use markdown formatting. Sign off as "${displayName}".

{{company_context}}`
    }

    // Discussion rounds
    return `You are ${specialist.name}, the ${specialist.title} specialist in a team meeting discussion round.

## Your Role
${specialist.description}

## Meeting Topic
"${topic}"

${userThoughts ? `## The Founder's Additional Thoughts\n"${userThoughts}"\n\n` : ""}## Full Discussion So Far

${priorBlock}

## Your Task
This is the discussion round. You have heard everyone's perspective${userThoughts ? " and the founder's additional thoughts" : ""}. Now:
- Build on ideas that resonated with you (name the colleague)
- Respectfully challenge points you disagree with (explain why)
- Refine or update your own position based on what you have learned
- Propose concrete next steps from your area of expertise

Be direct and specific. Reference colleagues by name. Under 400 words. Use markdown formatting.

{{company_context}}`
}

/**
 * Build a prompt for autonomous specialist-to-specialist debate.
 * In this mode, specialists respond to EACH OTHER, not the founder.
 * They build on, challenge, and refine each other's ideas.
 */
function buildDebatePrompt(
    specialist: Specialist,
    topic: string,
    allResponses: MeetingEntry[],
    debateRound: number
): string {
    const priorBlock = buildPriorDiscussionBlock(allResponses)

    return `You are the ${specialist.name} in an active team debate.

## Your Role
${specialist.description}

## Working Style
${specialist.workingStyle}

## Meeting Topic
"${topic}"

## Full Discussion So Far

${priorBlock}

## Your Task (Debate Round ${debateRound})
The founder is listening but has NOT weighed in yet. You are debating DIRECTLY with your fellow specialists. This is NOT a presentation — it is an active discussion.

You MUST:
- **Directly address at least one other specialist by name** ("I agree with the Sales Lead's point about...")
- **Challenge or build on a specific point** — don't just repeat what others said
- **Propose something concrete** — a decision, a next step, a framework
- **Ask a direct question to another specialist** if you need their expertise
- **Be opinionated** — the founder wants to hear real debate, not consensus for consensus's sake

If you disagree with someone, say so clearly and explain why. The founder needs to hear the tensions, not just the agreements.

Keep it punchy. Under 300 words. Use markdown. Be direct.

{{company_context}}`
}

const WRAP_UP_PROMPT = `You are a meeting facilitator. Analyze the following team meeting transcript and produce a structured JSON output.

## Meeting Transcript
{{input}}

## Required Output Format
Return ONLY valid JSON (no markdown code fences, no extra text). Use this exact structure:

{
  "notes": {
    "summary": "A 2-3 paragraph executive summary of the meeting discussion",
    "keyDecisions": ["Decision 1", "Decision 2"],
    "actionItems": ["Action item with owner if mentioned"],
    "openQuestions": ["Question that needs further discussion"],
    "nextSteps": ["Concrete next step 1", "Concrete next step 2"]
  },
  "objectives": [
    {
      "title": "Objective title (actionable, starts with verb)",
      "description": "1-2 sentence description",
      "tasks": [
        { "title": "Task title", "description": "What needs to be done" }
      ]
    }
  ],
  "marketplaceSuggestions": [
    {
      "title": "Role or resource name",
      "reasoning": "Why this was identified as needed, referencing the meeting discussion",
      "category": "People or Services or Products",
      "subcategory": "e.g. Fractional Executive, Consultant, Legal, Financial",
      "searchQuery": "search terms for marketplace"
    }
  ]
}

Rules:
- Extract 1-4 objectives with 2-5 tasks each. Only include objectives that were clearly discussed.
- Extract 0-3 marketplace suggestions. Only suggest if a clear gap or need was identified.
- Key decisions should be things the group aligned on.
- Action items should be specific and assignable.
- Be concise. Quality over quantity.`

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * TeamMeetingDialog -- Multi-specialist roundtable with discussion rounds
 * and structured post-meeting outputs.
 */
export function TeamMeetingDialog({
    open,
    onOpenChange,
}: TeamMeetingDialogProps) {
    // ─── State ────────────────────────────────────────────────────────────
    const [phase, setPhase] = useState<MeetingPhase>("setup")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [topic, setTopic] = useState("")
    const [entries, setEntries] = useState<MeetingEntry[]>([])
    const [currentRound, setCurrentRound] = useState(1)
    const [currentSpecialistIdx, setCurrentSpecialistIdx] = useState(0)
    const [streamingContent, setStreamingContent] = useState("")
    const [isStreaming, setIsStreaming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [threadIds, setThreadIds] = useState<Record<string, string>>({})
    const [userThoughts, setUserThoughts] = useState("")
    const [showThoughtsInput, setShowThoughtsInput] = useState(false)
    const [meetingOutputs, setMeetingOutputs] = useState<MeetingOutputData | null>(null)
    const [isGeneratingOutputs, setIsGeneratingOutputs] = useState(false)
    const [speakingEntryIdx, setSpeakingEntryIdx] = useState<number | null>(null)

    const scrollRef = useRef<HTMLDivElement>(null)

    // ─── Voice Hooks ──────────────────────────────────────────────────────
    const tts = useTts()
    const topicSpeechRecognition = useSpeechRecognition({
        onResult: (transcript) => {
            setTopic((prev) => (prev ? prev + " " + transcript : transcript))
        },
    })
    const thoughtsSpeechRecognition = useSpeechRecognition({
        onResult: (transcript) => {
            setUserThoughts((prev) => (prev ? prev + " " + transcript : transcript))
        },
    })

    // Ordered list of selected specialists
    const selectedSpecialists = useMemo(() => {
        return SPECIALISTS.filter((s) => selectedIds.has(s.id))
    }, [selectedIds])

    const currentSpecialist = selectedSpecialists[currentSpecialistIdx] ?? null

    // Compute context-aware topic suggestions
    const suggestions = useMemo(() => computeSuggestions(selectedIds), [selectedIds])

    // ─── Reset on close ───────────────────────────────────────────────────
    useEffect(() => {
        if (!open) {
            // Stop voice when dialog closes
            tts.stop()
            if (topicSpeechRecognition.isListening) topicSpeechRecognition.stop()
            if (thoughtsSpeechRecognition.isListening) thoughtsSpeechRecognition.stop()
            setSpeakingEntryIdx(null)

            // Small delay to let close animation finish
            const timer = setTimeout(() => {
                setPhase("setup")
                setSelectedIds(new Set())
                setTopic("")
                setEntries([])
                setCurrentRound(1)
                setCurrentSpecialistIdx(0)
                setStreamingContent("")
                setIsStreaming(false)
                setError(null)
                setThreadIds({})
                setUserThoughts("")
                setShowThoughtsInput(false)
                setMeetingOutputs(null)
                setIsGeneratingOutputs(false)
            }, 300)
            return () => clearTimeout(timer)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // Auto-scroll during streaming
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [entries, streamingContent])

    // ─── Specialist Selection ─────────────────────────────────────────────
    const toggleSpecialist = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    // ─── Initialize Thread IDs ────────────────────────────────────────────
    const initializeThreads = useCallback(async (): Promise<Record<string, string>> => {
        const ids: Record<string, string> = {}
        for (const specialist of selectedSpecialists) {
            const result = await getOrCreateSpecialistThread(specialist.id)
            if (result.threadId) {
                ids[specialist.id] = result.threadId
            }
        }
        setThreadIds(ids)
        return ids
    }, [selectedSpecialists])

    // ─── Execute Single Specialist ────────────────────────────────────────
    const executeSpecialist = useCallback(
        async (
            specialist: Specialist,
            threadId: string | undefined,
            prompt: string,
            input: string,
            systemSuffix: string
        ): Promise<string> => {
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    input,
                    providerId: "anthropic",
                    modelId: "claude-sonnet-4-20250514",
                    modality: "text",
                    threadId: threadId ?? undefined,
                    specialistId: specialist.id,
                    customSystemPromptSuffix: systemSuffix,
                }),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Execution failed" }))
                throw new Error(errData.error || `HTTP ${res.status}`)
            }

            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullResponse = ""

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split("\n")
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6)
                        if (data === "[DONE]") continue
                        try {
                            const parsed = JSON.parse(data)
                            if (parsed.text) {
                                fullResponse += parsed.text
                                setStreamingContent(fullResponse)
                            }
                        } catch {
                            fullResponse += data
                            setStreamingContent(fullResponse)
                        }
                    }
                }
            }

            return fullResponse || "No response received."
        },
        []
    )

    // ─── Run a Full Round ─────────────────────────────────────────────────
    const runRound = useCallback(
        async (round: number, threads: Record<string, string>, thoughts?: string) => {
            setPhase("in-progress")
            setError(null)
            setIsStreaming(true)

            // Local accumulator so each specialist sees what earlier
            // specialists said in THIS round (not just prior rounds)
            const roundAccumulator: MeetingEntry[] = [...entries]

            for (let i = 0; i < selectedSpecialists.length; i++) {
                const specialist = selectedSpecialists[i]
                setCurrentSpecialistIdx(i)
                setStreamingContent("")

                try {
                    // Pass the accumulator (includes earlier responses from this round)
                    const prompt = buildMeetingPrompt(
                        specialist,
                        topic,
                        roundAccumulator,
                        round,
                        thoughts
                    )

                    // Build inter-specialist dynamics context (relationships + strong opinions)
                    const dynamicsBlock = compileInterSpecialistDynamics(
                        specialist.id,
                        selectedSpecialists.map((s) => s.id),
                        topic,
                    )

                    const response = await executeSpecialist(
                        specialist,
                        threads[specialist.id],
                        prompt,
                        topic,
                        `\n\n## Meeting Context\nThis is a team meeting with ${selectedSpecialists.length} specialists. Topic: "${topic}"${dynamicsBlock ? `\n\n${dynamicsBlock}` : ""}`
                    )

                    const entry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: getSpecialistDisplayName(specialist),
                        round,
                        content: response,
                    }

                    // Add to both local accumulator and React state
                    roundAccumulator.push(entry)
                    setEntries((prev) => [...prev, entry])
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error"
                    console.error(`[TeamMeeting] ${specialist.name} failed:`, message)
                    setError(`${specialist.name} encountered an error: ${message}`)

                    const errorEntry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: getSpecialistDisplayName(specialist),
                        round,
                        content: `*[Error: Could not generate response]*`,
                    }

                    // Add to both accumulator and state so next specialist sees the gap
                    roundAccumulator.push(errorEntry)
                    setEntries((prev) => [...prev, errorEntry])
                }
            }

            setIsStreaming(false)
            setStreamingContent("")
            // Brief delay so streaming UI can fade out before switching to round-complete
            await new Promise((r) => setTimeout(r, 200))
            setCurrentRound(round)
            setPhase("round-complete")

            // TTS sequential playback is handled by the useEffect below
            // that watches for phase === "round-complete"
        },
        [selectedSpecialists, topic, entries, executeSpecialist]
    )

    // Use a ref to track entries for sequential playback
    const entriesRef = useRef<MeetingEntry[]>([])
    useEffect(() => {
        entriesRef.current = entries
    }, [entries])

    // Effect: When phase changes to round-complete, play entries sequentially
    useEffect(() => {
        if (phase !== "round-complete" || !tts.voiceEnabled) return

        let cancelled = false

        async function playSequentially(): Promise<void> {
            const roundEntries = entriesRef.current.filter((e) => e.round === currentRound)
            for (let i = 0; i < roundEntries.length; i++) {
                if (cancelled) break
                const entry = roundEntries[i]
                const specialist = getSpecialistById(entry.specialistId)
                if (!specialist?.voice) continue

                // Find the global index for this entry
                const globalIdx = entriesRef.current.indexOf(entry)
                setSpeakingEntryIdx(globalIdx)

                // Play and wait for it to finish
                await tts.play(entry.content, specialist.voice)

                // Small pause between specialists
                if (i < roundEntries.length - 1 && !cancelled) {
                    await new Promise((r) => setTimeout(r, 1500))
                }
            }
            if (!cancelled) setSpeakingEntryIdx(null)
        }

        playSequentially()
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, currentRound])

    // ─── Start Meeting ────────────────────────────────────────────────────
    const handleStartMeeting = useCallback(async () => {
        if (selectedIds.size < 2) {
            setError("Select at least 2 specialists for a meeting.")
            return
        }
        if (!topic.trim()) {
            setError("Enter a topic for the meeting.")
            return
        }
        setError(null)
        const threads = await initializeThreads()
        await runRound(1, threads)
    }, [selectedIds, topic, initializeThreads, runRound])

    // ─── Discussion Round ─────────────────────────────────────────────────
    const handleDiscussionRound = useCallback(async () => {
        setShowThoughtsInput(false)
        const nextRound = currentRound + 1
        await runRound(nextRound, threadIds, userThoughts.trim() || undefined)
        setUserThoughts("")
    }, [currentRound, threadIds, userThoughts, runRound])

    // ─── Autonomous Debate: Specialists discuss among themselves ──────
    const handleAutonomousDebate = useCallback(async () => {
        setShowThoughtsInput(false)
        setPhase("in-progress")
        setError(null)

        // Run 2 autonomous debate rounds where specialists talk to each other
        const debateAccumulator: MeetingEntry[] = [...entriesRef.current]
        let roundCounter = currentRound

        for (let debateRound = 1; debateRound <= 2; debateRound++) {
            roundCounter++
            const roundLabel = `Debate ${debateRound}`

            for (let i = 0; i < selectedSpecialists.length; i++) {
                const specialist = selectedSpecialists[i]
                setCurrentSpecialistIdx(i)
                setStreamingContent("")
                setIsStreaming(true)

                try {
                    const prompt = buildDebatePrompt(
                        specialist,
                        topic,
                        debateAccumulator,
                        debateRound
                    )

                    // Build inter-specialist dynamics for debate
                    const debateDynamicsBlock = compileInterSpecialistDynamics(
                        specialist.id,
                        selectedSpecialists.map((s) => s.id),
                        topic,
                    )

                    const response = await executeSpecialist(
                        specialist,
                        threadIds[specialist.id],
                        prompt,
                        topic,
                        `\n\n## Autonomous Debate\nThe specialists are debating among themselves. The founder is listening. Round: ${roundLabel}${debateDynamicsBlock ? `\n\n${debateDynamicsBlock}` : ""}`
                    )

                    const entry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: getSpecialistDisplayName(specialist),
                        round: roundCounter,
                        content: response,
                    }

                    debateAccumulator.push(entry)
                    setEntries((prev) => [...prev, entry])
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error"
                    console.error(`[TeamMeeting] Debate - ${specialist.name} failed:`, message)

                    const errorEntry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: getSpecialistDisplayName(specialist),
                        round: roundCounter,
                        content: `*[Error: Could not generate response]*`,
                    }
                    debateAccumulator.push(errorEntry)
                    setEntries((prev) => [...prev, errorEntry])
                } finally {
                    setIsStreaming(false)
                    setStreamingContent("")
                }
            }
        }

        setCurrentRound(roundCounter)
        setPhase("round-complete")
    }, [currentRound, selectedSpecialists, topic, threadIds, executeSpecialist])

    // ─── Wrap Up (Generate Outputs) ───────────────────────────────────────
    const handleWrapUp = useCallback(async () => {
        setPhase("outputs")
        setIsGeneratingOutputs(true)
        setError(null)

        // Build full transcript
        const attendees = selectedSpecialists.map((s) => s.name).join(", ")
        const transcript = entries
            .map((e) => `**${e.specialistName}** (Round ${e.round}):\n${e.content}`)
            .join("\n\n---\n\n")

        const fullTranscript = `Meeting Topic: "${topic}"\nAttendees: ${attendees}\nRounds: ${currentRound}\n\n${transcript}`

        try {
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: WRAP_UP_PROMPT,
                    input: fullTranscript,
                    providerId: "anthropic",
                    modelId: "claude-sonnet-4-20250514",
                    modality: "text",
                }),
            })

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`)
            }

            // Collect full streaming response
            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullResponse = ""

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split("\n")
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6)
                        if (data === "[DONE]") continue
                        try {
                            const parsed = JSON.parse(data)
                            if (parsed.text) fullResponse += parsed.text
                        } catch {
                            fullResponse += data
                        }
                    }
                }
            }

            // Parse JSON from the response (strip any markdown fences)
            const jsonStr = fullResponse
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim()

            const parsed = JSON.parse(jsonStr) as MeetingOutputData
            setMeetingOutputs(parsed)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[TeamMeeting] Wrap-up failed:", message)
            setError(`Failed to generate meeting outputs: ${message}`)
        } finally {
            setIsGeneratingOutputs(false)
        }
    }, [selectedSpecialists, entries, topic, currentRound])

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="font-display flex items-center gap-2">
                        <Users className="h-5 w-5 text-international-orange" />
                        {phase === "setup"
                            ? "Call a Team Meeting"
                            : phase === "outputs"
                            ? "Meeting Outputs"
                            : `Team Meeting: ${topic.slice(0, 60)}${topic.length > 60 ? "..." : ""}`}
                    </DialogTitle>
                    {phase !== "setup" && phase !== "outputs" && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex -space-x-2">
                                {selectedSpecialists.map((s) => (
                                    <div
                                        key={s.id}
                                        className="relative h-6 w-6 rounded-full overflow-hidden bg-muted border-2 border-background"
                                    >
                                        {s.avatarImage ? (
                                            <Image
                                                src={s.avatarImage}
                                                alt={s.name}
                                                fill
                                                className="object-cover"
                                                sizes="24px"
                                            />
                                        ) : (
                                            <span className="flex items-center justify-center h-full w-full text-[10px] font-semibold">
                                                {s.name.charAt(0)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <span className="text-xs text-muted-foreground flex-1 truncate">
                                {selectedSpecialists.map((s) => `${s.name} (${s.title})`).join(", ")}
                            </span>
                            {/* Voice mute toggle */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => tts.setVoiceEnabled(!tts.voiceEnabled)}
                                className={cn(
                                    "h-7 w-7 p-0 flex-shrink-0",
                                    tts.voiceEnabled && "text-international-orange",
                                    tts.isPlaying && "animate-pulse"
                                )}
                                aria-label={tts.voiceEnabled ? "Mute voice output" : "Enable voice output"}
                            >
                                {tts.voiceEnabled ? (
                                    <Volume2 className="h-4 w-4" />
                                ) : (
                                    <VolumeX className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    )}
                </DialogHeader>

                {/* ── Phase 1: Setup ───────────────────────────────────────── */}
                {phase === "setup" && (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
                        {/* Specialist Picker */}
                        <div className="space-y-3">
                            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                Who should attend? (pick 2 or more)
                            </Label>
                            <div className="grid grid-cols-3 gap-2">
                                {SPECIALISTS.map((s) => {
                                    const isSelected = selectedIds.has(s.id)
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => toggleSpecialist(s.id)}
                                            className={cn(
                                                "flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all",
                                                isSelected
                                                    ? "border-international-orange bg-international-orange/5"
                                                    : "border-muted hover:border-muted-foreground/30 bg-background"
                                            )}
                                        >
                                            <div className="relative h-8 w-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                {s.avatarImage ? (
                                                    <Image
                                                        src={s.avatarImage}
                                                        alt={s.name}
                                                        fill
                                                        className="object-cover"
                                                        sizes="32px"
                                                    />
                                                ) : (
                                                    <span className="flex items-center justify-center h-full w-full text-xs font-semibold">
                                                        {s.name.charAt(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-foreground truncate">
                                                    {s.name}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    {s.title}
                                                </p>
                                            </div>
                                            {isSelected && (
                                                <CheckCircle2 className="h-4 w-4 text-international-orange flex-shrink-0" />
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                            {selectedIds.size > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {selectedIds.size} specialist{selectedIds.size !== 1 ? "s" : ""} selected
                                </p>
                            )}
                        </div>

                        {/* Topic Input */}
                        <div className="space-y-2">
                            <Label
                                htmlFor="meeting-topic"
                                className="text-xs font-mono uppercase tracking-widest text-muted-foreground"
                            >
                                What do you want the team to discuss?
                            </Label>
                            <div className="relative">
                                <Textarea
                                    id="meeting-topic"
                                    value={topicSpeechRecognition.isListening
                                        ? (topic + (topicSpeechRecognition.interimTranscript ? " " + topicSpeechRecognition.interimTranscript : ""))
                                        : topic
                                    }
                                    onChange={(e) => {
                                        setTopic(e.target.value)
                                        if (error) setError(null)
                                    }}
                                    placeholder={topicSpeechRecognition.isListening
                                        ? "Listening..."
                                        : getDynamicPlaceholder(selectedIds)
                                    }
                                    className={cn(
                                        "min-h-[100px] resize-none pr-12",
                                        topicSpeechRecognition.isListening && "border-destructive/50"
                                    )}
                                    aria-required
                                />
                                {topicSpeechRecognition.isSupported && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                            if (topicSpeechRecognition.isListening) {
                                                topicSpeechRecognition.stop()
                                            } else {
                                                topicSpeechRecognition.start()
                                            }
                                        }}
                                        className={cn(
                                            "absolute bottom-2 right-2 h-8 w-8",
                                            topicSpeechRecognition.isListening
                                                ? "text-destructive animate-pulse"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        aria-label={topicSpeechRecognition.isListening ? "Stop listening" : "Voice input"}
                                    >
                                        {topicSpeechRecognition.isListening ? (
                                            <MicOff className="h-4 w-4" />
                                        ) : (
                                            <Mic className="h-4 w-4" />
                                        )}
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    {topic.length.toLocaleString()} characters
                                </p>
                                {topicSpeechRecognition.isListening && (
                                    <p className="text-xs text-destructive animate-pulse">
                                        Listening... speak now
                                    </p>
                                )}
                            </div>

                            {/* Context-aware suggestion chips */}
                            {suggestions.length > 0 && !topic.trim() && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                        Suggested topics
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {suggestions.map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                type="button"
                                                onClick={() => {
                                                    setTopic(suggestion)
                                                    if (error) setError(null)
                                                }}
                                                className={cn(
                                                    "text-xs px-3 py-1.5 rounded-full border border-muted",
                                                    "bg-background text-foreground",
                                                    "hover:border-international-orange hover:bg-international-orange/5",
                                                    "transition-colors cursor-pointer text-left"
                                                )}
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}

                {/* ── Phase 2: In Progress ─────────────────────────────────── */}
                {phase === "in-progress" && (
                    <div
                        ref={scrollRef}
                        className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1"
                        style={{ maxHeight: "60vh" }}
                    >
                        {/* Completed entries */}
                        {entries.map((entry, i) => {
                            const specialist = getSpecialistById(entry.specialistId)
                            return (
                                <div key={i} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                            {specialist?.avatarImage ? (
                                                <Image
                                                    src={specialist.avatarImage}
                                                    alt={entry.specialistName}
                                                    fill
                                                    className="object-cover"
                                                    sizes="28px"
                                                />
                                            ) : (
                                                <span className="flex items-center justify-center h-full w-full text-xs font-semibold">
                                                    {entry.specialistName.charAt(0)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-sm font-semibold text-foreground">
                                            {entry.specialistName}
                                        </span>
                                        <Badge variant="secondary" className="text-[10px]">
                                            Round {entry.round}
                                        </Badge>
                                    </div>
                                    <div className="ml-9 rounded-lg border border-muted bg-muted/30 p-4">
                                        <Markdown content={entry.content} className="text-sm" />
                                    </div>
                                </div>
                            )
                        })}

                        {/* Currently streaming specialist — always mounted during round, opacity transition when done */}
                        {currentSpecialist && (
                            <div
                                className={cn(
                                    "space-y-2 transition-opacity duration-200",
                                    !isStreaming && "opacity-0 pointer-events-none"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                        {currentSpecialist.avatarImage ? (
                                            <Image
                                                src={currentSpecialist.avatarImage}
                                                alt={currentSpecialist.name}
                                                fill
                                                className="object-cover"
                                                sizes="28px"
                                            />
                                        ) : (
                                            <span className="flex items-center justify-center h-full w-full text-xs font-semibold">
                                                {currentSpecialist.name.charAt(0)}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold text-foreground">
                                        {currentSpecialist.name}
                                    </span>
                                    <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                                </div>
                                <div className="ml-9 rounded-lg border border-muted bg-muted/30 p-4">
                                    {streamingContent ? (
                                        <Markdown content={streamingContent} className="text-sm" />
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">
                                            {currentSpecialist.thinkingIndicator
                                                ? `${currentSpecialist.name}: ${currentSpecialist.thinkingIndicator}`
                                                : `${currentSpecialist.name} is thinking...`
                                            }
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Progress indicator — always mounted during round, opacity transition when done */}
                        <div
                            className={cn(
                                "flex items-center justify-center gap-2 py-2 transition-opacity duration-200",
                                !isStreaming && "opacity-0 pointer-events-none"
                            )}
                        >
                            <div className="flex gap-1">
                                {selectedSpecialists.map((s, i) => (
                                    <div
                                        key={s.id}
                                        className={cn(
                                            "h-1.5 w-6 rounded-full transition-colors",
                                            i < currentSpecialistIdx
                                                ? "bg-international-orange"
                                                : i === currentSpecialistIdx
                                                ? "bg-international-orange/50"
                                                : "bg-muted"
                                        )}
                                    />
                                ))}
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {currentSpecialistIdx + 1} of {selectedSpecialists.length}
                            </span>
                        </div>
                    </div>
                )}

                {/* ── Phase 3: Round Complete ───────────────────────────────── */}
                {phase === "round-complete" && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div
                            ref={scrollRef}
                            className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1"
                            style={{ maxHeight: "55vh" }}
                        >
                            {entries.map((entry, i) => {
                                const specialist = getSpecialistById(entry.specialistId)
                                const isSpeaking = speakingEntryIdx === i
                                return (
                                    <div key={i} className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                {specialist?.avatarImage ? (
                                                    <Image
                                                        src={specialist.avatarImage}
                                                        alt={entry.specialistName}
                                                        fill
                                                        className="object-cover"
                                                        sizes="28px"
                                                    />
                                                ) : (
                                                    <span className="flex items-center justify-center h-full w-full text-xs font-semibold">
                                                        {entry.specialistName.charAt(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-sm font-semibold text-foreground">
                                                {entry.specialistName}
                                            </span>
                                            <Badge variant="secondary" className="text-[10px]">
                                                Round {entry.round}
                                            </Badge>
                                            {isSpeaking && (
                                                <Volume2 className="h-3.5 w-3.5 text-international-orange animate-pulse" />
                                            )}
                                        </div>
                                        <div className={cn(
                                            "ml-9 rounded-lg border p-4",
                                            isSpeaking
                                                ? "border-international-orange/30 bg-international-orange/5"
                                                : "border-muted bg-muted/30"
                                        )}>
                                            <Markdown content={entry.content} className="text-sm" />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* User Thoughts Input */}
                        {showThoughtsInput && (
                            <div className="mt-4 space-y-2 border-t pt-4">
                                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Your thoughts for the team
                                </Label>
                                <div className="relative">
                                    <Textarea
                                        value={thoughtsSpeechRecognition.isListening
                                            ? (userThoughts + (thoughtsSpeechRecognition.interimTranscript ? " " + thoughtsSpeechRecognition.interimTranscript : ""))
                                            : userThoughts
                                        }
                                        onChange={(e) => setUserThoughts(e.target.value)}
                                        placeholder={thoughtsSpeechRecognition.isListening
                                            ? "Listening..."
                                            : "Share your reaction, add context, or steer the discussion..."
                                        }
                                        className={cn(
                                            "min-h-[80px] resize-none pr-12",
                                            thoughtsSpeechRecognition.isListening && "border-destructive/50"
                                        )}
                                    />
                                    {thoughtsSpeechRecognition.isSupported && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                                if (thoughtsSpeechRecognition.isListening) {
                                                    thoughtsSpeechRecognition.stop()
                                                } else {
                                                    thoughtsSpeechRecognition.start()
                                                }
                                            }}
                                            className={cn(
                                                "absolute bottom-2 right-2 h-8 w-8",
                                                thoughtsSpeechRecognition.isListening
                                                    ? "text-destructive animate-pulse"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                            aria-label={thoughtsSpeechRecognition.isListening ? "Stop listening" : "Voice input"}
                                        >
                                            {thoughtsSpeechRecognition.isListening ? (
                                                <MicOff className="h-4 w-4" />
                                            ) : (
                                                <Mic className="h-4 w-4" />
                                            )}
                                        </Button>
                                    )}
                                </div>
                                {thoughtsSpeechRecognition.isListening && (
                                    <p className="text-xs text-destructive animate-pulse">
                                        Listening... speak now
                                    </p>
                                )}
                            </div>
                        )}

                        {error && (
                            <Alert variant="destructive" className="mt-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}

                {/* ── Phase 4: Outputs ──────────────────────────────────────── */}
                {phase === "outputs" && (
                    <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: "65vh" }}>
                        {isGeneratingOutputs ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-4">
                                <Loader2 className="h-8 w-8 animate-spin text-international-orange" />
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">
                                        Generating meeting outputs...
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Extracting notes, objectives, and recommendations
                                    </p>
                                </div>
                            </div>
                        ) : meetingOutputs ? (
                            <MeetingOutputs
                                outputs={meetingOutputs}
                                topic={topic}
                                attendees={selectedSpecialists.map((s) => s.name)}
                                transcript={entries
                                    .map((e) => `**${e.specialistName}** (Round ${e.round}):\n${e.content}`)
                                    .join("\n\n---\n\n")}
                                roundCount={currentRound}
                            />
                        ) : error ? (
                            <div className="space-y-4 py-8">
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                                <div className="flex justify-center">
                                    <Button variant="secondary" onClick={handleWrapUp}>
                                        Retry
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}

                {/* ── Footer ───────────────────────────────────────────────── */}
                <DialogFooter>
                    <div className="flex w-full items-center justify-between">
                        {/* Left side */}
                        <Button
                            variant="secondary"
                            onClick={() => onOpenChange(false)}
                            disabled={isStreaming || isGeneratingOutputs}
                        >
                            {phase === "outputs" && meetingOutputs ? "Done" : "Cancel"}
                        </Button>

                        {/* Right side */}
                        <div className="flex items-center gap-2">
                            {phase === "setup" && (
                                <Button
                                    onClick={handleStartMeeting}
                                    disabled={selectedIds.size < 2 || !topic.trim()}
                                    className="bg-international-orange hover:bg-international-orange-hover text-white"
                                >
                                    <Play className="h-4 w-4 mr-2" />
                                    Start Meeting
                                </Button>
                            )}

                            {phase === "round-complete" && !showThoughtsInput && (
                                <>
                                    <Button
                                        variant="secondary"
                                        onClick={() => setShowThoughtsInput(true)}
                                    >
                                        <MessageCircle className="h-4 w-4 mr-2" />
                                        Weigh In
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={handleAutonomousDebate}
                                    >
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        Let Them Discuss
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={handleDiscussionRound}
                                    >
                                        <Users className="h-4 w-4 mr-2" />
                                        Guided Discussion
                                    </Button>
                                    <Button
                                        onClick={handleWrapUp}
                                        className="bg-international-orange hover:bg-international-orange-hover text-white"
                                    >
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Wrap Up
                                    </Button>
                                </>
                            )}

                            {phase === "round-complete" && showThoughtsInput && (
                                <>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setShowThoughtsInput(false)
                                            setUserThoughts("")
                                        }}
                                    >
                                        <X className="h-4 w-4 mr-2" />
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleDiscussionRound}
                                        className="bg-international-orange hover:bg-international-orange-hover text-white"
                                    >
                                        <Users className="h-4 w-4 mr-2" />
                                        Continue Discussion
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
