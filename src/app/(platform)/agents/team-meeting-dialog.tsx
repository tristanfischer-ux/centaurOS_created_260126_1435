"use client"

/**
 * @file team-meeting-dialog.tsx
 *
 * @description Conversation-led multi-specialist meeting dialog. Users pick 2+
 * specialists, pose a topic, and the FIRST specialist responds automatically.
 * After that, the user drives the conversation: tapping specialist chips to
 * hear from specific people, weighing in with their own thoughts, or letting
 * specialists debate autonomously. Specialists whose expertise is relevant to
 * what was just said are highlighted as "wants to speak".
 *
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
    ChevronDown,
    ChevronUp,
    Hand,
    Square,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/ui/markdown"
import { getOrCreateSpecialistThread } from "@/actions/agent-memory"
import { SPECIALISTS, getSpecialistById, getSpecialistDisplayName } from "./specialists-data"
import { compileInterSpecialistDynamics } from "@/lib/agents/relationship-matrix"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { useTts } from "@/hooks/use-tts"
import { MeetingOutputs } from "./meeting-outputs"
import { parseProposedActions, stripProposedActionsBlock } from "./brief-specialist-dialog"
import { ProposedActionsCard } from "@/components/specialists/proposed-actions-card"
import type { Specialist } from "./specialists-data"
import type { ProposedAction } from "./brief-specialist-dialog"

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single specialist response within a meeting */
interface MeetingEntry {
    specialistId: string
    specialistName: string
    round: number
    content: string
    /** Parsed PROPOSED_ACTIONS from specialist response; rendered as interactive approval cards. */
    proposals?: ProposedAction[]
}

/** The phases of a conversation-led meeting */
type MeetingPhase = "setup" | "in-progress" | "awaiting-input" | "outputs"

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

    if (selectedIds.size >= 3) {
        suggestions.push("What's our 90-day company plan? Where do we focus?")
    }

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

    if (suggestions.length < 4) {
        for (const id of selectedIds) {
            const perSpecialist = SPECIALIST_SUGGESTIONS[id]
            if (perSpecialist) {
                suggestions.push(...perSpecialist)
            }
            if (suggestions.length >= 6) break
        }
    }

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

// ─── "Wants to Speak" Detection ───────────────────────────────────────────────

/**
 * Keywords that map each specialist's domain. Used for client-side relevance
 * detection to highlight specialists who "want to speak" after a response.
 */
const SPECIALIST_KEYWORDS: Record<string, string[]> = {
    strategist: ["strategy", "market", "competitive", "positioning", "go-to-market", "gtm", "moat", "differentiation", "pivot", "vision", "mission", "okr", "roadmap"],
    cto: ["technology", "tech", "architecture", "infrastructure", "engineering", "code", "platform", "build", "ship", "technical debt", "stack", "api", "system"],
    "vp-engineering": ["engineering", "velocity", "sprint", "agile", "ci/cd", "deploy", "quality", "testing", "team velocity", "developer", "code review"],
    "vp-manufacturing": ["manufacturing", "production", "factory", "supply", "quality control", "lean", "tooling", "assembly", "prototype", "fabrication", "bom"],
    "vp-supply-chain": ["supply chain", "logistics", "procurement", "vendor", "supplier", "inventory", "shipping", "sourcing", "lead time", "warehouse"],
    "product-lead": ["product", "feature", "user experience", "ux", "prd", "roadmap", "prioritize", "mvp", "user research", "design", "iteration"],
    "growth-marketer": ["marketing", "growth", "brand", "content", "seo", "ads", "funnel", "conversion", "awareness", "campaign", "social media", "acquisition"],
    "sales-lead": ["sales", "revenue", "pipeline", "deal", "pricing", "customer", "close", "outreach", "crm", "quota", "prospect", "cold email"],
    "chief-of-staff": ["operations", "process", "alignment", "priorities", "board", "meeting", "coordination", "execution", "cross-functional", "ops"],
    "finance-lead": ["finance", "budget", "runway", "burn rate", "unit economics", "revenue", "cost", "cash flow", "financial model", "kpi", "metrics", "profit"],
    "fundraising-advisor": ["fundraising", "investor", "raise", "series", "pitch", "valuation", "term sheet", "vc", "angel", "capital", "deck"],
    "hiring-team": ["hiring", "recruit", "talent", "team", "compensation", "equity", "culture", "onboarding", "headcount", "job", "candidate", "hr"],
    "legal-counsel": ["legal", "contract", "compliance", "ip", "intellectual property", "liability", "regulation", "terms", "privacy", "gdpr", "incorporation"],
}

/**
 * Determine which specialists "want to speak" based on the latest response content.
 *
 * @description Scans the response text for keywords matching each remaining
 * specialist's domain. Returns the IDs of specialists whose expertise was
 * referenced or is relevant to what was just discussed.
 *
 * @param lastResponse - The text of the most recent specialist response
 * @param remainingSpecialistIds - IDs of specialists who haven't spoken yet (or could speak again)
 * @param lastSpeakerId - ID of the specialist who just spoke (excluded from results)
 * @returns Set of specialist IDs that are relevant
 */
function getWantsToSpeak(
    lastResponse: string,
    remainingSpecialistIds: string[],
    lastSpeakerId: string,
): Set<string> {
    const wants = new Set<string>()
    const lower = lastResponse.toLowerCase()

    for (const id of remainingSpecialistIds) {
        if (id === lastSpeakerId) continue
        const keywords = SPECIALIST_KEYWORDS[id]
        if (!keywords) continue

        const matchCount = keywords.filter((kw) => lower.includes(kw)).length
        // Require at least 2 keyword matches to reduce noise
        if (matchCount >= 2) {
            wants.add(id)
        }
    }

    return wants
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

/**
 * Maximum character budget for the prior discussion block in prompts.
 */
const MAX_PRIOR_DISCUSSION_CHARS = 30_000

/**
 * Truncates the prior discussion block to fit within the character budget.
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

    const formatted = responses.map(
        (r) => `**${r.specialistName}** (Round ${r.round}):\n${r.content}`
    )

    const fullBlock = formatted.join("\n\n---\n\n")
    if (fullBlock.length <= maxChars) return fullBlock

    const separator = "\n\n---\n\n"
    let recentBlock = ""
    let recentCount = 0

    for (let i = formatted.length - 1; i >= 0; i--) {
        const candidate = recentCount === 0
            ? formatted[i]
            : formatted[i] + separator + recentBlock
        if (candidate.length > maxChars - 2000 && recentCount > 0) break
        recentBlock = candidate
        recentCount++
    }

    const truncatedCount = responses.length - recentCount
    if (truncatedCount === 0) {
        return fullBlock.slice(0, maxChars) + "\n\n*[Discussion truncated for length]*"
    }

    const truncatedSummary = responses
        .slice(0, truncatedCount)
        .map((r) => `- ${r.specialistName} (Round ${r.round})`)
        .join("\n")

    return `*[Earlier discussion summarized — ${truncatedCount} responses from:]*\n${truncatedSummary}\n\n---\n\n${recentBlock}`
}

/**
 * Build a meeting prompt for a single specialist. Prompts are designed for
 * short, meeting-appropriate responses (100-200 words).
 *
 * @param specialist - The specialist who will respond
 * @param topic - The meeting topic
 * @param priorResponses - All prior responses in the meeting
 * @param round - Current round number
 * @param userThoughts - Optional founder input to respond to
 * @returns The formatted prompt string
 */
function buildMeetingPrompt(
    specialist: Specialist,
    topic: string,
    priorResponses: MeetingEntry[],
    round: number,
    userThoughts?: string
): string {
    const priorBlock = buildPriorDiscussionBlock(priorResponses)
    const displayName = getSpecialistDisplayName(specialist)

    // First speaker in the meeting -- no prior context
    if (priorResponses.length === 0) {
        return `You are ${specialist.name}, the ${specialist.title} specialist in a team meeting.

## Your Role
${specialist.description}

## Working Style
${specialist.workingStyle}

## Meeting Topic
"${topic}"

## Your Task
You are opening this meeting. Give your single strongest take on this topic. Be direct — this is a live meeting, not a memo.

Rules:
- State your position clearly in 2-3 sentences
- Flag your biggest concern or opportunity
- Pose one sharp question for the group to react to
- **Keep it under 150 words.** Short and punchy. You'll get to elaborate if asked.

Use markdown formatting. Sign off as "${displayName}".

{{company_context}}`
    }

    // Subsequent speaker reacting to what's been said
    if (round === 1) {
        return `You are ${specialist.name}, the ${specialist.title} specialist in a team meeting.

## Your Role
${specialist.description}

## Working Style
${specialist.workingStyle}

## Meeting Topic
"${topic}"

${userThoughts ? `## The Founder Just Said\n"${userThoughts}"\n\n` : ""}## What Has Been Said So Far

${priorBlock}

## Your Task
React to what you've heard. This is a meeting — be conversational, not formal.

Rules:
- Lead with where you agree or disagree (name the person)
- Add ONE new insight from your area of expertise
- If something concerns you, say so directly
- **Keep it under 200 words.** Be concise — you can elaborate if the founder asks.

Use markdown formatting. Sign off as "${displayName}".

{{company_context}}`
    }

    // Discussion rounds (round 2+)
    return `You are ${specialist.name}, the ${specialist.title} specialist in a team meeting discussion.

## Your Role
${specialist.description}

## Meeting Topic
"${topic}"

${userThoughts ? `## The Founder's Additional Thoughts\n"${userThoughts}"\n\n` : ""}## Full Discussion So Far

${priorBlock}

## Your Task
The founder has asked for your perspective. Respond directly to the discussion so far.

Rules:
- Reference specific points others made (by name)
- Build on what resonated, challenge what you disagree with
- Propose something concrete — a decision, a next step, a framework
- **Keep it under 250 words.** Be direct and specific.

Use markdown formatting. Sign off as "${displayName}".

{{company_context}}`
}

/**
 * Build a prompt for autonomous specialist-to-specialist debate.
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
- **Be opinionated** — the founder wants to hear real debate, not consensus for consensus's sake

If you disagree with someone, say so clearly and explain why. The founder needs to hear the tensions, not just the agreements.

Keep it punchy. Under 250 words. Use markdown.

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
- Extract 2-5 objectives with 2-5 tasks each. Be thorough — capture every actionable thread from the discussion.
- Extract 0-3 marketplace suggestions. Only suggest if a clear gap or need was identified.
- Key decisions should be things the group aligned on.
- Action items should be specific and assignable.
- Objectives should cover the major themes discussed. Don't miss anything the team committed to.
- Be concise. Quality over quantity.`

// ─── Meeting Outputs Loading ──────────────────────────────────────────────────

/**
 * Animated loading state shown while AI processes the meeting transcript.
 * Shows a step-by-step progress animation with specialist avatars and
 * contextual descriptions of what's being extracted.
 */

const OUTPUT_STEPS = [
    { id: "analyze", label: "Analyzing transcript", description: "Reading through the full discussion..." },
    { id: "decisions", label: "Extracting key decisions", description: "Identifying what the team aligned on..." },
    { id: "objectives", label: "Building objectives & tasks", description: "Turning action items into structured goals..." },
    { id: "resources", label: "Identifying resource needs", description: "Matching gaps to marketplace solutions..." },
    { id: "compile", label: "Compiling meeting notes", description: "Writing the executive summary..." },
] as const

function MeetingOutputsLoading({
    attendees,
    topic,
}: {
    attendees: Specialist[]
    topic: string
}) {
    const [activeStep, setActiveStep] = useState(0)

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveStep((prev) => {
                if (prev < OUTPUT_STEPS.length - 1) return prev + 1
                return prev
            })
        }, 3000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="py-8 px-2 space-y-8">
            {/* Header with specialist avatars */}
            <div className="text-center space-y-4">
                <div className="flex justify-center -space-x-3">
                    {attendees.slice(0, 6).map((s, i) => (
                        <div
                            key={s.id}
                            className="relative h-10 w-10 rounded-full overflow-hidden bg-muted border-2 border-background"
                            style={{
                                animation: `pulse 2s ease-in-out ${i * 0.3}s infinite`,
                            }}
                        >
                            {s.avatarImage ? (
                                <Image
                                    src={s.avatarImage}
                                    alt={s.name}
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                />
                            ) : (
                                <span className="flex items-center justify-center h-full w-full text-sm font-semibold">
                                    {s.name.charAt(0)}
                                </span>
                            )}
                        </div>
                    ))}
                    {attendees.length > 6 && (
                        <div className="h-10 w-10 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                            <span className="text-xs font-medium text-muted-foreground">
                                +{attendees.length - 6}
                            </span>
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-sm font-semibold text-foreground">
                        Processing your meeting
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto truncate">
                        {topic}
                    </p>
                </div>
            </div>

            {/* Step-by-step progress */}
            <div className="max-w-sm mx-auto space-y-1">
                {OUTPUT_STEPS.map((step, i) => {
                    const isActive = i === activeStep
                    const isComplete = i < activeStep
                    const isPending = i > activeStep

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "flex items-start gap-3 px-4 py-3 rounded-lg transition-all duration-500",
                                isActive && "bg-international-orange/5",
                                isComplete && "opacity-60",
                                isPending && "opacity-30",
                            )}
                        >
                            {/* Step indicator */}
                            <div className="flex-shrink-0 mt-0.5">
                                {isComplete ? (
                                    <CheckCircle2 className="h-4 w-4 text-status-success" />
                                ) : isActive ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                                ) : (
                                    <div className="h-4 w-4 rounded-full border-2 border-muted" />
                                )}
                            </div>

                            {/* Step content */}
                            <div className="min-w-0 flex-1">
                                <p
                                    className={cn(
                                        "text-sm font-medium transition-colors duration-300",
                                        isActive ? "text-foreground" : "text-muted-foreground",
                                    )}
                                >
                                    {step.label}
                                </p>
                                {isActive && (
                                    <p className="text-xs text-muted-foreground mt-0.5 animate-in fade-in slide-in-from-top-1 duration-300">
                                        {step.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Subtle progress bar */}
            <div className="max-w-sm mx-auto px-4">
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                        className="h-full rounded-full bg-international-orange transition-all duration-1000 ease-out"
                        style={{
                            width: `${Math.min(((activeStep + 1) / OUTPUT_STEPS.length) * 100, 100)}%`,
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * TeamMeetingDialog -- Conversation-led multi-specialist meeting.
 *
 * @description The first specialist speaks automatically. After that, the user
 * drives the conversation by tapping specialist chips, weighing in, or
 * triggering autonomous debate. Specialists whose expertise is relevant to
 * the latest response are highlighted as "wants to speak".
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
    const [isStarting, setIsStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [threadIds, setThreadIds] = useState<Record<string, string>>({})
    const [userThoughts, setUserThoughts] = useState("")
    const [showThoughtsInput, setShowThoughtsInput] = useState(false)
    const [meetingOutputs, setMeetingOutputs] = useState<MeetingOutputData | null>(null)
    const [isGeneratingOutputs, setIsGeneratingOutputs] = useState(false)
    const [speakingEntryIdx, setSpeakingEntryIdx] = useState<number | null>(null)
    const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())
    const [wantsToSpeak, setWantsToSpeak] = useState<Set<string>>(new Set())

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
            tts.stop()
            if (topicSpeechRecognition.isListening) topicSpeechRecognition.stop()
            if (thoughtsSpeechRecognition.isListening) thoughtsSpeechRecognition.stop()
            setSpeakingEntryIdx(null)

            const timer = setTimeout(() => {
                setPhase("setup")
                setSelectedIds(new Set())
                setTopic("")
                setEntries([])
                setCurrentRound(1)
                setCurrentSpecialistIdx(0)
                setStreamingContent("")
                setIsStreaming(false)
                setIsStarting(false)
                setError(null)
                setThreadIds({})
                setUserThoughts("")
                setShowThoughtsInput(false)
                setMeetingOutputs(null)
                setIsGeneratingOutputs(false)
                setExpandedEntries(new Set())
                setWantsToSpeak(new Set())
                setDebateCancelRequested(false)
                debateCancelRef.current = false
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
            } else if (result.error) {
                console.error(`[TeamMeeting] Thread init failed for ${specialist.name}:`, result.error)
            }
        }
        setThreadIds(ids)
        return ids
    }, [selectedSpecialists])

    // ─── Execute Single Specialist (Streaming) ───────────────────────────

    /** Read from a stream reader with a per-chunk timeout to prevent hanging. */
    const readWithTimeout = useCallback(
        async (reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number) => {
            return Promise.race([
                reader.read(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Stream chunk timeout — the AI provider may be unresponsive.")), timeoutMs)
                ),
            ])
        },
        []
    )

    const executeSpecialist = useCallback(
        async (
            specialist: Specialist,
            threadId: string | undefined,
            prompt: string,
            input: string,
            systemSuffix: string
        ): Promise<string> => {
            // 60s TTFB timeout — if the server doesn't respond at all, fail fast
            const controller = new AbortController()
            const fetchTimeout = setTimeout(() => controller.abort(), 60_000)

            let res: Response
            try {
                res = await fetch("/api/agents/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: controller.signal,
                    body: JSON.stringify({
                        prompt,
                        input,
                        providerId: "anthropic",
                        modelId: "claude-sonnet-4-20250514",
                        modelTier: "claude",
                        modality: "text",
                        threadId: threadId ?? undefined,
                        specialistId: specialist.id,
                        customSystemPromptSuffix: systemSuffix,
                    }),
                })
            } catch (err) {
                clearTimeout(fetchTimeout)
                if (err instanceof DOMException && err.name === "AbortError") {
                    throw new Error(`${specialist.name} took too long to respond. Please try again.`)
                }
                throw err
            }
            clearTimeout(fetchTimeout)

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Execution failed" }))
                throw new Error(errData.error || `HTTP ${res.status}`)
            }

            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullResponse = ""
            let streamError: string | null = null

            // 30s per-chunk timeout — prevents hanging on stalled streams
            const CHUNK_TIMEOUT_MS = 30_000

            while (true) {
                const { done, value } = await readWithTimeout(reader, CHUNK_TIMEOUT_MS)
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split("\n")
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6)
                        if (data === "[DONE]") continue
                        try {
                            const parsed = JSON.parse(data) as { text?: string; error?: string; rawHint?: string; errorCategory?: string }
                            if (parsed.error) {
                                streamError = parsed.error
                                if (parsed.rawHint || parsed.errorCategory) {
                                    console.error("[TeamMeeting] Provider error detail:", {
                                        classified: parsed.error,
                                        rawHint: parsed.rawHint,
                                        category: parsed.errorCategory,
                                        specialist: specialist.name,
                                        responseLength: fullResponse.length,
                                    })
                                }
                                break
                            }
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
                if (streamError) break
            }

            if (streamError) {
                throw new Error(streamError)
            }

            return fullResponse || "No response received."
        },
        [readWithTimeout]
    )

    // Use a ref to track entries for TTS playback
    const entriesRef = useRef<MeetingEntry[]>([])
    useEffect(() => {
        entriesRef.current = entries
    }, [entries])

    // ─── Run a Single Specialist ──────────────────────────────────────────

    /**
     * Execute a single specialist and transition to awaiting-input phase.
     *
     * @param specialistIdx - Index into selectedSpecialists
     * @param round - Current round number
     * @param threads - Thread ID map
     * @param thoughts - Optional user thoughts to include in prompt
     */
    const runSingleSpecialist = useCallback(
        async (
            specialistIdx: number,
            round: number,
            threads: Record<string, string>,
            thoughts?: string
        ) => {
            setPhase("in-progress")
            setError(null)
            setIsStreaming(true)
            setCurrentSpecialistIdx(specialistIdx)
            setStreamingContent("")

            const specialist = selectedSpecialists[specialistIdx]
            if (!specialist) {
                setError("Invalid specialist index")
                setIsStreaming(false)
                setPhase("awaiting-input")
                return
            }

            try {
                const prompt = buildMeetingPrompt(
                    specialist,
                    topic,
                    entriesRef.current,
                    round,
                    thoughts
                )

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

                const proposals = parseProposedActions(response)
                const entry: MeetingEntry = {
                    specialistId: specialist.id,
                    specialistName: getSpecialistDisplayName(specialist),
                    round,
                    content: stripProposedActionsBlock(response),
                    proposals: proposals.length > 0 ? proposals : undefined,
                }

                setEntries((prev) => [...prev, entry])

                // Compute "wants to speak" for remaining specialists
                const remainingIds = selectedSpecialists.map((s) => s.id)
                const wants = getWantsToSpeak(response, remainingIds, specialist.id)
                setWantsToSpeak(wants)

                // TTS: play the response if voice is enabled
                if (tts.voiceEnabled && specialist.voice) {
                    const globalIdx = entriesRef.current.length // will be the new entry's index
                    setSpeakingEntryIdx(globalIdx)
                    await tts.play(response, specialist.voice)
                    setSpeakingEntryIdx(null)
                }
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
                setEntries((prev) => [...prev, errorEntry])
            }

            setIsStreaming(false)
            setStreamingContent("")
            setCurrentRound(round)
            setPhase("awaiting-input")
        },
        [selectedSpecialists, topic, executeSpecialist, tts]
    )

    // ─── Start Meeting ────────────────────────────────────────────────────

    /**
     * Initialize threads and run only the FIRST specialist.
     */
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
        setIsStarting(true)

        // Unlock AudioContext on this user gesture so TTS works after async work
        tts.warmUp()

        try {
            const threads = await initializeThreads()

            // Verify all specialist threads were created
            if (Object.keys(threads).length !== selectedSpecialists.length) {
                const missing = selectedSpecialists
                    .filter((s) => !threads[s.id])
                    .map((s) => s.name)
                setError(`Failed to initialize threads for: ${missing.join(", ")}. Please try again.`)
                return
            }

            await runSingleSpecialist(0, 1, threads)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[TeamMeeting] Failed to start meeting:", message)
            setError(`Failed to start meeting: ${message}`)
        } finally {
            setIsStarting(false)
        }
    }, [selectedIds, topic, initializeThreads, runSingleSpecialist, tts, selectedSpecialists])

    // ─── Ask a Specific Specialist ────────────────────────────────────────

    /**
     * User tapped a specialist chip — run that specialist next.
     */
    const handleAskSpecialist = useCallback(
        async (specialist: Specialist) => {
            setShowThoughtsInput(false)
            const thoughts = userThoughts.trim() || undefined
            setUserThoughts("")

            // Unlock AudioContext on this user gesture so TTS works after async work
            tts.warmUp()

            const idx = selectedSpecialists.findIndex((s) => s.id === specialist.id)
            if (idx === -1) return

            const nextRound = currentRound + 1
            await runSingleSpecialist(idx, nextRound, threadIds, thoughts)
        },
        [selectedSpecialists, currentRound, threadIds, userThoughts, runSingleSpecialist, tts]
    )

    // ─── Autonomous Debate: Specialists discuss among themselves ──────────

    /**
     * Stop the autonomous debate after the current specialist finishes.
     */
    const handleStopDebate = useCallback(() => {
        debateCancelRef.current = true
        setDebateCancelRequested(true)
    }, [])

    const handleAutonomousDebate = useCallback(async () => {
        setShowThoughtsInput(false)
        setPhase("in-progress")
        setError(null)
        setDebateCancelRequested(false)
        debateCancelRef.current = false

        // Unlock AudioContext on this user gesture so TTS works after async work
        tts.warmUp()

        const debateAccumulator: MeetingEntry[] = [...entriesRef.current]
        let roundCounter = currentRound

        for (let debateRound = 1; debateRound <= 2; debateRound++) {
            roundCounter++
            const roundLabel = `Debate ${debateRound}`

            for (let i = 0; i < selectedSpecialists.length; i++) {
                // Check if user requested cancellation before starting next specialist
                if (debateCancelRef.current) {
                    break
                }

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

                    const proposals = parseProposedActions(response)
                    const entry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: getSpecialistDisplayName(specialist),
                        round: roundCounter,
                        content: stripProposedActionsBlock(response),
                        proposals: proposals.length > 0 ? proposals : undefined,
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

            // Check cancellation between debate rounds too
            if (debateCancelRef.current) {
                break
            }
        }

        setCurrentRound(roundCounter)
        setDebateCancelRequested(false)
        debateCancelRef.current = false

        // Compute "wants to speak" based on the last entry
        const lastAccEntry = debateAccumulator[debateAccumulator.length - 1]
        if (lastAccEntry) {
            const remainingIds = selectedSpecialists.map((s) => s.id)
            const wants = getWantsToSpeak(lastAccEntry.content, remainingIds, lastAccEntry.specialistId)
            setWantsToSpeak(wants)
        }

        setPhase("awaiting-input")
    }, [currentRound, selectedSpecialists, topic, threadIds, executeSpecialist, tts])

    // ─── Wrap Up (Generate Outputs) ───────────────────────────────────────
    const handleWrapUp = useCallback(async () => {
        setPhase("outputs")
        setIsGeneratingOutputs(true)
        setError(null)

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
                    modelTier: "claude",
                    modality: "text",
                }),
            })

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`)
            }

            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let fullResponse = ""
            let wrapUpStreamError: string | null = null

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
                            const parsed = JSON.parse(data) as { text?: string; error?: string }
                            if (parsed.error) {
                                wrapUpStreamError = parsed.error
                                break
                            }
                            if (parsed.text) fullResponse += parsed.text
                        } catch {
                            fullResponse += data
                        }
                    }
                }
                if (wrapUpStreamError) break
            }

            if (wrapUpStreamError) {
                throw new Error(wrapUpStreamError)
            }

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

    // ─── Toggle Entry Expansion ───────────────────────────────────────────
    const toggleEntry = useCallback((idx: number) => {
        setExpandedEntries((prev) => {
            const next = new Set(prev)
            if (next.has(idx)) {
                next.delete(idx)
            } else {
                next.add(idx)
            }
            return next
        })
    }, [])

    /**
     * Extract a short preview from a response (first 1-2 sentences).
     */
    function getPreview(content: string): string {
        // Split on sentence boundaries, take first 2
        const sentences = content.split(/(?<=[.!?])\s+/)
        const preview = sentences.slice(0, 2).join(" ")
        if (preview.length < content.length) {
            return preview.length > 200 ? preview.slice(0, 200) + "..." : preview + "..."
        }
        return preview
    }

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
                                onClick={() => {
                                    const enabling = !tts.voiceEnabled
                                    tts.setVoiceEnabled(enabling)
                                    if (enabling) tts.warmUp()
                                }}
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

                {/* ── Phase 2: In Progress (Single Specialist Streaming) ──── */}
                {phase === "in-progress" && (
                    <div
                        ref={scrollRef}
                        className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1"
                        style={{ maxHeight: "60vh" }}
                    >
                        {/* Earlier entries (collapsed) — all except the last completed one */}
                        {entries.slice(0, Math.max(0, entries.length - 1)).map((entry, i) => {
                            const specialist = getSpecialistById(entry.specialistId)
                            const isExpanded = expandedEntries.has(i)
                            return (
                                <div key={i}>
                                    <button
                                        onClick={() => toggleEntry(i)}
                                        className="flex items-start gap-2 w-full text-left py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors"
                                    >
                                        <div className="relative h-6 w-6 rounded-full overflow-hidden bg-muted flex-shrink-0 mt-0.5">
                                            {specialist?.avatarImage ? (
                                                <Image
                                                    src={specialist.avatarImage}
                                                    alt={entry.specialistName}
                                                    fill
                                                    className="object-cover"
                                                    sizes="24px"
                                                />
                                            ) : (
                                                <span className="flex items-center justify-center h-full w-full text-[10px] font-semibold">
                                                    {entry.specialistName.charAt(0)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-foreground">
                                                    {entry.specialistName}
                                                </span>
                                                <Badge variant="secondary" className="text-[10px]">
                                                    Round {entry.round}
                                                </Badge>
                                                {isExpanded ? (
                                                    <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto" />
                                                ) : (
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                                                )}
                                            </div>
                                            {isExpanded ? (
                                                <div className="mt-2 rounded-lg border border-muted bg-muted/30 p-3">
                                                    <Markdown content={entry.content} className="text-sm" />
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                    {getPreview(entry.content)}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                    {isExpanded && entry.proposals && entry.proposals.length > 0 && specialist && (
                                        <div className="ml-9 mt-2">
                                            <ProposedActionsCard
                                                proposals={entry.proposals}
                                                specialist={specialist}
                                                onDismiss={() => {
                                                    setEntries((prev) => prev.map((e, idx) =>
                                                        idx === i ? { ...e, proposals: undefined } : e
                                                    ))
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {/* Last completed entry (always expanded so user can see what was just said) */}
                        {entries.length > 0 && (() => {
                            const lastEntry = entries[entries.length - 1]
                            const specialist = getSpecialistById(lastEntry.specialistId)
                            return (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                            {specialist?.avatarImage ? (
                                                <Image
                                                    src={specialist.avatarImage}
                                                    alt={lastEntry.specialistName}
                                                    fill
                                                    className="object-cover"
                                                    sizes="28px"
                                                />
                                            ) : (
                                                <span className="flex items-center justify-center h-full w-full text-xs font-semibold">
                                                    {lastEntry.specialistName.charAt(0)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-sm font-semibold text-foreground">
                                            {lastEntry.specialistName}
                                        </span>
                                        <Badge variant="secondary" className="text-[10px]">
                                            Round {lastEntry.round}
                                        </Badge>
                                    </div>
                                    <div className="ml-9 rounded-lg border border-muted bg-muted/30 p-4">
                                        <Markdown content={lastEntry.content} className="text-sm" />
                                    </div>
                                    {lastEntry.proposals && lastEntry.proposals.length > 0 && specialist && (
                                        <div className="ml-9 mt-2">
                                            <ProposedActionsCard
                                                proposals={lastEntry.proposals}
                                                specialist={specialist}
                                                onDismiss={() => {
                                                    setEntries((prev) => prev.map((e, idx) =>
                                                        idx === entries.length - 1 ? { ...e, proposals: undefined } : e
                                                    ))
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

                        {/* Currently streaming specialist */}
                        {currentSpecialist && (
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
                                    {isStreaming && (
                                        <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                                    )}
                                </div>
                                <div className="ml-9 rounded-lg border border-international-orange/20 bg-international-orange/5 p-4">
                                    {streamingContent ? (
                                        <Markdown content={stripProposedActionsBlock(streamingContent)} className="text-sm" />
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
                    </div>
                )}

                {/* ── Phase 3: Awaiting Input (User Decides Who Speaks Next) ── */}
                {phase === "awaiting-input" && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div
                            ref={scrollRef}
                            className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1"
                            style={{ maxHeight: "50vh" }}
                        >
                            {/* Previous entries (collapsed) */}
                            {entries.slice(0, -1).map((entry, i) => {
                                const specialist = getSpecialistById(entry.specialistId)
                                const isExpanded = expandedEntries.has(i)
                                const isSpeaking = speakingEntryIdx === i
                                return (
                                    <div key={i}>
                                        <button
                                            onClick={() => toggleEntry(i)}
                                            className={cn(
                                                "flex items-start gap-2 w-full text-left py-2 px-3 rounded-lg transition-colors",
                                                isSpeaking
                                                    ? "bg-international-orange/5"
                                                    : "hover:bg-muted/30"
                                            )}
                                        >
                                            <div className="relative h-6 w-6 rounded-full overflow-hidden bg-muted flex-shrink-0 mt-0.5">
                                                {specialist?.avatarImage ? (
                                                    <Image
                                                        src={specialist.avatarImage}
                                                        alt={entry.specialistName}
                                                        fill
                                                        className="object-cover"
                                                        sizes="24px"
                                                    />
                                                ) : (
                                                    <span className="flex items-center justify-center h-full w-full text-[10px] font-semibold">
                                                        {entry.specialistName.charAt(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-foreground">
                                                        {entry.specialistName}
                                                    </span>
                                                    {isSpeaking && (
                                                        <Volume2 className="h-3 w-3 text-international-orange animate-pulse" />
                                                    )}
                                                    {isExpanded ? (
                                                        <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto" />
                                                    ) : (
                                                        <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                                                    )}
                                                </div>
                                                {isExpanded ? (
                                                    <div className="mt-2 rounded-lg border border-muted bg-muted/30 p-3">
                                                        <Markdown content={entry.content} className="text-sm" />
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                        {getPreview(entry.content)}
                                                    </p>
                                                )}
                                            </div>
                                        </button>
                                        {isExpanded && entry.proposals && entry.proposals.length > 0 && specialist && (
                                            <div className="ml-9 mt-2">
                                                <ProposedActionsCard
                                                    proposals={entry.proposals}
                                                    specialist={specialist}
                                                    onDismiss={() => {
                                                        setEntries((prev) => prev.map((e, idx) =>
                                                            idx === i ? { ...e, proposals: undefined } : e
                                                        ))
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {/* Latest entry (always expanded, highlighted) */}
                            {entries.length > 0 && (() => {
                                const lastEntry = entries[entries.length - 1]
                                const specialist = getSpecialistById(lastEntry.specialistId)
                                const isSpeaking = speakingEntryIdx === entries.length - 1
                                return (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                {specialist?.avatarImage ? (
                                                    <Image
                                                        src={specialist.avatarImage}
                                                        alt={lastEntry.specialistName}
                                                        fill
                                                        className="object-cover"
                                                        sizes="28px"
                                                    />
                                                ) : (
                                                    <span className="flex items-center justify-center h-full w-full text-xs font-semibold">
                                                        {lastEntry.specialistName.charAt(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-sm font-semibold text-foreground">
                                                {lastEntry.specialistName}
                                            </span>
                                            <Badge variant="secondary" className="text-[10px]">
                                                Round {lastEntry.round}
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
                                            <Markdown content={lastEntry.content} className="text-sm" />
                                        </div>
                                        {lastEntry.proposals && lastEntry.proposals.length > 0 && specialist && (
                                            <div className="ml-9 mt-2">
                                                <ProposedActionsCard
                                                    proposals={lastEntry.proposals}
                                                    specialist={specialist}
                                                    onDismiss={() => {
                                                        setEntries((prev) => prev.map((e, idx) =>
                                                            idx === entries.length - 1 ? { ...e, proposals: undefined } : e
                                                        ))
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}
                        </div>

                        {/* ── Specialist Chips: Who should speak next? ──────── */}
                        {!showThoughtsInput && (
                            <div className="mt-4 border-t pt-4 space-y-3">
                                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Who should speak next?
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedSpecialists.map((s) => {
                                        // Check if this specialist just spoke (last entry)
                                        const lastEntry = entries[entries.length - 1]
                                        const justSpoke = lastEntry?.specialistId === s.id
                                        const wants = wantsToSpeak.has(s.id)

                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => handleAskSpecialist(s)}
                                                disabled={justSpoke}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all",
                                                    justSpoke
                                                        ? "border-muted bg-muted/30 opacity-50 cursor-not-allowed"
                                                        : wants
                                                        ? "border-international-orange bg-international-orange/5 hover:bg-international-orange/10 ring-1 ring-international-orange/20"
                                                        : "border-muted hover:border-muted-foreground/30 bg-background"
                                                )}
                                            >
                                                <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                    {s.avatarImage ? (
                                                        <Image
                                                            src={s.avatarImage}
                                                            alt={s.name}
                                                            fill
                                                            className="object-cover"
                                                            sizes="28px"
                                                        />
                                                    ) : (
                                                        <span className="flex items-center justify-center h-full w-full text-xs font-semibold">
                                                            {s.name.charAt(0)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-foreground">
                                                        {s.name}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {s.title}
                                                    </p>
                                                </div>
                                                {wants && !justSpoke && (
                                                    <Hand className="h-3.5 w-3.5 text-international-orange flex-shrink-0" />
                                                )}
                                                {justSpoke && (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* User Thoughts Input */}
                        {showThoughtsInput && (
                            <div className="mt-4 space-y-3 border-t pt-4">
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
                                <p className="text-xs text-muted-foreground">
                                    Type your thoughts, then pick a specialist to respond.
                                </p>
                                {thoughtsSpeechRecognition.isListening && (
                                    <p className="text-xs text-destructive animate-pulse">
                                        Listening... speak now
                                    </p>
                                )}

                                {/* Specialist chips for responding to user thoughts */}
                                <div className="flex flex-wrap gap-2 pt-2">
                                    {selectedSpecialists.map((s) => {
                                        const wants = wantsToSpeak.has(s.id)
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => handleAskSpecialist(s)}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all",
                                                    wants
                                                        ? "border-international-orange bg-international-orange/5 hover:bg-international-orange/10"
                                                        : "border-muted hover:border-muted-foreground/30 bg-background"
                                                )}
                                            >
                                                <div className="relative h-6 w-6 rounded-full overflow-hidden bg-muted flex-shrink-0">
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
                                                <span className="text-sm font-medium text-foreground">
                                                    {s.name}
                                                </span>
                                                {wants && (
                                                    <Hand className="h-3 w-3 text-international-orange" />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
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
                            <MeetingOutputsLoading attendees={selectedSpecialists} topic={topic} />
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
                            disabled={isStreaming || isGeneratingOutputs || isStarting}
                        >
                            {phase === "outputs" && meetingOutputs ? "Done" : "Cancel"}
                        </Button>

                        {/* Right side */}
                        <div className="flex items-center gap-2">
                            {/* Stop button during autonomous debate */}
                            {phase === "in-progress" && isStreaming && (
                                <Button
                                    variant="destructive"
                                    onClick={handleStopDebate}
                                    disabled={debateCancelRequested}
                                >
                                    {debateCancelRequested ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Stopping after this response...
                                        </>
                                    ) : (
                                        <>
                                            <Square className="h-4 w-4 mr-2" />
                                            Stop Discussion
                                        </>
                                    )}
                                </Button>
                            )}

                            {phase === "setup" && (
                                <Button
                                    onClick={handleStartMeeting}
                                    disabled={selectedIds.size < 2 || !topic.trim() || isStarting}
                                    className="bg-international-orange hover:bg-international-orange-hover text-white"
                                >
                                    {isStarting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Starting...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-4 w-4 mr-2" />
                                            Start Meeting
                                        </>
                                    )}
                                </Button>
                            )}

                            {phase === "awaiting-input" && !showThoughtsInput && (
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
                                        onClick={handleWrapUp}
                                        className="bg-international-orange hover:bg-international-orange-hover text-white"
                                    >
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Wrap Up
                                    </Button>
                                </>
                            )}

                            {phase === "awaiting-input" && showThoughtsInput && (
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
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
