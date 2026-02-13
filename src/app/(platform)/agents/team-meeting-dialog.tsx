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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/ui/markdown"
import { getOrCreateSpecialistThread } from "@/actions/agent-memory"
import { SPECIALISTS, getSpecialistById } from "./specialists-data"
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

// ─── Prompt Templates ─────────────────────────────────────────────────────────

function buildMeetingPrompt(
    specialist: Specialist,
    topic: string,
    priorResponses: MeetingEntry[],
    round: number,
    userThoughts?: string
): string {
    const priorBlock =
        priorResponses.length > 0
            ? priorResponses
                  .map((r) => `**${r.specialistName}** (Round ${r.round}):\n${r.content}`)
                  .join("\n\n---\n\n")
            : ""

    if (round === 1) {
        return `You are the ${specialist.name} in a team meeting.

## Your Role
${specialist.description}

## Working Style
${specialist.workingStyle}

## Meeting Topic
"${topic}"

${priorBlock ? `## What Your Colleagues Have Said\n\n${priorBlock}\n\n` : ""}## Your Task
Provide your expert perspective on this topic. Be specific, actionable, and direct.
${priorBlock ? "Build on or respectfully challenge what your colleagues have said where relevant. Reference them by name." : "You are speaking first. Set the stage with your analysis."}

Keep your response focused and under 600 words. Use markdown formatting.

{{company_context}}`
    }

    // Discussion rounds
    return `You are the ${specialist.name} in a team meeting discussion round.

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

    const scrollRef = useRef<HTMLDivElement>(null)

    // Ordered list of selected specialists
    const selectedSpecialists = useMemo(() => {
        return SPECIALISTS.filter((s) => selectedIds.has(s.id))
    }, [selectedIds])

    const currentSpecialist = selectedSpecialists[currentSpecialistIdx] ?? null

    // ─── Reset on close ───────────────────────────────────────────────────
    useEffect(() => {
        if (!open) {
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

            for (let i = 0; i < selectedSpecialists.length; i++) {
                const specialist = selectedSpecialists[i]
                setCurrentSpecialistIdx(i)
                setStreamingContent("")
                setIsStreaming(true)

                try {
                    const prompt = buildMeetingPrompt(
                        specialist,
                        topic,
                        entries,
                        round,
                        thoughts
                    )

                    const response = await executeSpecialist(
                        specialist,
                        threads[specialist.id],
                        prompt,
                        topic,
                        `\n\n## Meeting Context\nThis is a team meeting with ${selectedSpecialists.length} specialists. Topic: "${topic}"`
                    )

                    const entry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: specialist.name,
                        round,
                        content: response,
                    }

                    setEntries((prev) => [...prev, entry])
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error"
                    console.error(`[TeamMeeting] ${specialist.name} failed:`, message)
                    setError(`${specialist.name} encountered an error: ${message}`)

                    // Add error entry so the meeting can continue
                    setEntries((prev) => [
                        ...prev,
                        {
                            specialistId: specialist.id,
                            specialistName: specialist.name,
                            round,
                            content: `*[Error: Could not generate response]*`,
                        },
                    ])
                } finally {
                    setIsStreaming(false)
                    setStreamingContent("")
                }
            }

            setCurrentRound(round)
            setPhase("round-complete")
        },
        [selectedSpecialists, topic, entries, executeSpecialist]
    )

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
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
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
                            <span className="text-xs text-muted-foreground">
                                {selectedSpecialists.map((s) => s.name).join(", ")}
                            </span>
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
                                                    {s.row.toUpperCase()}
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
                            <Textarea
                                id="meeting-topic"
                                value={topic}
                                onChange={(e) => {
                                    setTopic(e.target.value)
                                    if (error) setError(null)
                                }}
                                placeholder="e.g., Should we raise a Series A? What's the best go-to-market strategy for our B2B SaaS product? How do we get our first 100 customers?"
                                className="min-h-[100px] resize-none"
                                aria-required
                            />
                            <p className="text-xs text-muted-foreground">
                                {topic.length.toLocaleString()} characters
                            </p>
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

                        {/* Currently streaming specialist */}
                        {isStreaming && currentSpecialist && (
                            <div className="space-y-2">
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
                                        <p className="text-sm text-muted-foreground">
                                            {currentSpecialist.name} is thinking...
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Progress indicator */}
                        {isStreaming && (
                            <div className="flex items-center justify-center gap-2 py-2">
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
                        )}
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
                        </div>

                        {/* User Thoughts Input */}
                        {showThoughtsInput && (
                            <div className="mt-4 space-y-2 border-t pt-4">
                                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Your thoughts for the team
                                </Label>
                                <Textarea
                                    value={userThoughts}
                                    onChange={(e) => setUserThoughts(e.target.value)}
                                    placeholder="Share your reaction, add context, or steer the discussion..."
                                    className="min-h-[80px] resize-none"
                                />
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
                                        Add My Thoughts
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={handleDiscussionRound}
                                    >
                                        <Users className="h-4 w-4 mr-2" />
                                        Open Discussion
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
