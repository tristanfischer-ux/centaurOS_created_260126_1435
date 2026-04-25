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
import { useRouter } from "next/navigation"
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
    Sparkles,
    ChevronDown,
    ChevronUp,
    Hand,
    Square,
    Hammer,
    Building2,
    ArrowRight,
    Copy,
    Mail,
    Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/ui/markdown"
import { getOrCreateSpecialistThread } from "@/actions/agent-memory"
import { SPECIALISTS, getSpecialistById, getSpecialistDisplayName } from "@/lib/agents/specialists-config"
import { compileInterSpecialistDynamics } from "@/lib/agents/relationship-matrix"
import { getPrimaryTargetForTier } from "@/lib/agents/failover"
import { getEffectiveModelTier } from "@/lib/agents/tier-aware-models"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { AiDisclaimer } from "@/components/ui/ai-disclaimer"
import { MeetingOutputs } from "./meeting-outputs"
import { HuddleReport } from "./huddle-report"
import { createArtifact } from "@/actions/agent-artifacts"
import { createMeetingThread } from "@/actions/meeting-threads"
import { parseProposedActions, stripProposedActionsBlock } from "@/lib/agents/message-parsers"
import { ProposedActionsCard } from "@/components/specialists/proposed-actions-card"
import type { Specialist } from "@/lib/agents/specialists-config"
import type { ProposedAction } from "@/lib/agents/message-parsers"
import type { SubscriptionTier } from "@/lib/billing/plans"
import { SUBSCRIPTION_PLANS } from "@/lib/billing/plans"
import { APP_DOMAIN } from "@/lib/domains"
import { toast } from "sonner"
import Link from "next/link"
import {
    type CouncilTier,
    COUNCIL_TIER_META,
    getCouncilSpecialists,
    getCouncilPosition,
    COUNCIL_POSITION_LABELS,
    MODEL_TIER_LATENCY_WEIGHT,
    classifyTopic,
    canAccessCouncilTier,
    getCouncilUpgradeCopy,
} from "@/lib/agents/council"

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single specialist response within a meeting */
interface MeetingEntry {
    specialistId: string
    specialistName: string
    round: number
    content: string
    /** Parsed PROPOSED_ACTIONS from specialist response; rendered as interactive approval cards. */
    proposals?: ProposedAction[]
    /**
     * Council position label for this entry — shown as a pill above the
     * response card in the streaming UI.
     */
    councilPosition?: import("@/lib/agents/council").CouncilPosition
    /**
     * Wall-clock time in milliseconds from meeting start when this
     * response completed (used for the arrival timer pill).
     */
    arrivalMs?: number
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
    /** Items Cal identifies as redundant, superseded, or no longer necessary */
    redundantItems?: Array<{
        type: "objective" | "task"
        title: string
        reason: string
        recommendation: "archive" | "delete" | "merge"
    }>
    /** Shareable report for emailing to team members */
    report?: {
        subject: string
        summary: string
        decisions: string[]
        newActions: string[]
        removedItems: string[]
    }
}

/** Pre-configured meeting setup from huddle cards */
export interface MeetingPreset {
    participantIds: string[]
    topic: string
}

interface TeamMeetingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** When provided, auto-selects participants and pre-fills topic */
    preset?: MeetingPreset
    /**
     * Authenticated user id, used by the post-meeting upsell to build the
     * referral URL `${APP_DOMAIN}/signup?ref=<user_id>`. Optional so the
     * dialog still renders cleanly when the parent has not loaded it yet.
     */
    userId?: string
    /**
     * Subscription tier of the current user, used to decide which post-
     * meeting upsell variant to show. Free hits the hard upsell after 1
     * brainstorm; Starter+ users get the softer top-up nudge once they
     * pass 80% of the bundled allowance.
     */
    userTier?: SubscriptionTier
    /** Brainstorm sessions the user has consumed this calendar month. */
    brainstormsUsedThisMonth?: number
}

// ─── Meeting Topic Suggestions ────────────────────────────────────────────────

/** Suggestions for specific specialist pair/triple combinations (sorted key = specialist IDs joined). */
const COMBINATION_SUGGESTIONS: Record<string, string[]> = {
    // Product Ideation pairs — whenever Sage is paired with the
    // ideation-relevant specialists (Priya for product feasibility, Fang
    // for manufacturability, Fiona for investor appetite), surface
    // smart-version product-ideation prompts. These drive the killer
    // feedback loop: brainstorming → Forge (build it) AND → Investors
    // (test it).
    "product-lead,strategist": [
        "What new physical product could we build that becomes 10× better with cheap intelligence embedded?",
        "Pick a boring commodity in our domain — what's the smart-version that nobody has shipped yet?",
        "What should our product roadmap look like? How do we prioritize?",
        "How do we validate product-market fit with limited resources?",
    ],
    "strategist,vp-manufacturing": [
        "What new product idea has both a clear bill of materials AND a sharp investor pitch?",
        "Which physical product category has the cheapest BOM-to-intelligence-uplift ratio right now?",
    ],
    "fundraising-advisor,strategist": [
        "What new product idea would investors back today? Stress-test our top candidate.",
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
    // Deep-tech / regulated-product founders: pair Leo with Sage to map a
    // de-risking sequence the seed round can underwrite. Picks the most
    // actionable of the three candidate prompts — once founders see how
    // the milestones nest, the regulatory-pathway and prototype questions
    // tend to fall out of the conversation naturally.
    "legal-counsel,strategist": [
        "How do we sequence the technical milestones so each one de-risks the next round?",
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
        "What new product could we build that becomes 10× better with cheap intelligence embedded?",
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

    // First speaker in the meeting -- no prior context.
    // Council copy ladder: opening speaker uses "Quick take —" so the
    // founder reads a short pointed reaction first while later speakers
    // (using "On reflection —" / "Thinking about this further —") arrive
    // with more nuance. The ladder is per-round, not per-specialist —
    // any specialist can be the opener.
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
- **Open your reply with the literal phrase "**Quick take —**" in bold (markdown), then your position.** This is part of the ForgeOS Council pattern: the opener gives the fastest, sharpest read; later speakers add nuance.
- State your position clearly in 2-3 sentences after the "Quick take —" opener.
- Flag your biggest concern or opportunity.
- Pose one sharp question for the group to react to.
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
- **Open your reply with the literal phrase "**On reflection —**" in bold (markdown), then your reaction.** This is part of the ForgeOS Council pattern: you arrive after the opener with more nuance.
- Lead with where you agree or disagree (name the person).
- Add ONE new insight from your area of expertise.
- If something concerns you, say so directly.
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
- **Open your reply with the literal phrase "**Thinking about this further —**" in bold (markdown), then your contribution.** This is part of the ForgeOS Council pattern: round-${round} speakers go deeper than round-1 reactors.
- If you disagree sharply with another specialist's earlier position, you may instead open with "**Council split:**" and state the divergence — only when the disagreement is real, not for flavour.
- Reference specific points others made (by name).
- Build on what resonated, challenge what you disagree with.
- Propose something concrete — a decision, a next step, a framework.
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
                                    unoptimized
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
    preset,
    userId,
    userTier,
    brainstormsUsedThisMonth,
}: TeamMeetingDialogProps) {
    const router = useRouter()
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
    const [isAutoSaved, setIsAutoSaved] = useState(false)
    /** The persisted meeting_threads id — set after wrap-up saves */
    const [meetingThreadId, setMeetingThreadId] = useState<string | null>(null)
    const [isGeneratingOutputs, setIsGeneratingOutputs] = useState(false)
    const [showReportDialog, setShowReportDialog] = useState(false)
    const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())
    const [wantsToSpeak, setWantsToSpeak] = useState<Set<string>>(new Set())
    const [debateCancelRequested, setDebateCancelRequested] = useState(false)
    /** Which Council tier the user has selected in the setup phase */
    const [councilTier, setCouncilTier] = useState<CouncilTier>("quick")
    /** When set, the upgrade modal is shown for this Council tier */
    const [showCouncilUpgradeFor, setShowCouncilUpgradeFor] = useState<CouncilTier | null>(null)

    const scrollRef = useRef<HTMLDivElement>(null)
    const debateCancelRef = useRef(false)
    /** Epoch ms when the meeting was started — used for arrival timers */
    const meetingStartMsRef = useRef<number>(0)

    // ─── Voice Hooks ──────────────────────────────────────────────────────
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
            if (topicSpeechRecognition.isListening) topicSpeechRecognition.stop()
            if (thoughtsSpeechRecognition.isListening) thoughtsSpeechRecognition.stop()
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
                setMeetingThreadId(null)
                setIsGeneratingOutputs(false)
                setExpandedEntries(new Set())
                setWantsToSpeak(new Set())
                setDebateCancelRequested(false)
                debateCancelRef.current = false
                setCouncilTier("quick")
                setShowCouncilUpgradeFor(null)
            }, 300)
            return () => clearTimeout(timer)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // INTENT: When a huddle card opens the dialog with a preset, auto-select
    // the participants and pre-fill the topic so the user can jump straight in.
    useEffect(() => {
        if (open && preset && phase === "setup") {
            setSelectedIds(new Set(preset.participantIds))
            setTopic(preset.topic)
        }
    }, [open, preset, phase])

    // INTENT: When the Council tier changes and a topic has been entered,
    // auto-select the matching specialist set. The user can still override
    // by clicking the specialist grid directly ("customise").
    useEffect(() => {
        if (phase !== "setup") return
        if (councilTier === "strategy") return
        if (!topic.trim()) return
        const topicClass = classifyTopic(topic)
        const specialists = getCouncilSpecialists(councilTier, topicClass)
        if (specialists.length > 0) {
            setSelectedIds(new Set(specialists.map((s) => s.id)))
        }
    // Intentionally limited deps: only re-run when councilTier changes mid-setup.
    // Topic changes do NOT re-fire so manual customisation isn't clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [councilTier, phase])

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

            // FLOW: read primary target per specialist's modelTier (NOT hardcoded
            // claude-opus-4-7). Fixes the 02:55:12 P0 where every specialist was
            // routed to Anthropic Opus and an Anthropic 529 OVERLOADED took out
            // brainstorming entirely. Server still receives modelTier and builds
            // the full FALLBACK_CHAINS[tier] cascade.
            //
            // Tier-aware override (2026-04-25): free / anonymous users always get
            // the cheap-class model (Haiku) regardless of the specialist's natural
            // modelTier. Paid tiers (starter_v2 and above) keep the benchmark-
            // validated per-specialist mapping unchanged.
            const effectiveTier = getEffectiveModelTier(
                specialist.modelTier,
                userTier ?? "free",
                councilTier,
            )
            const target = getPrimaryTargetForTier(effectiveTier)
            let res: Response
            try {
                res = await fetch("/api/agents/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: controller.signal,
                    body: JSON.stringify({
                        prompt,
                        input,
                        providerId: target.providerId,
                        modelId: target.modelId,
                        modelTier: target.modelTier,
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
        // userTier + councilTier are included so that if the user's tier
        // changes mid-session (edge case) the next dispatch picks up the
        // correct model class immediately.
        [readWithTimeout, userTier, councilTier]
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
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error"
                console.error(`[TeamMeeting] ${specialist.name} failed:`, message)
                // In-character empty state — keeps the meeting feeling like a meeting,
                // not a stack trace. Retry CTA stays visible elsewhere in the UI.
                setError(`${specialist.name} stepped out for a moment — give it 30 seconds and try the round again.`)

                const errorEntry: MeetingEntry = {
                    specialistId: specialist.id,
                    specialistName: getSpecialistDisplayName(specialist),
                    round,
                    content: `*${specialist.name} stepped out for a moment — give it 30 seconds and try the round again.*`,
                }
                setEntries((prev) => [...prev, errorEntry])
            }

            setIsStreaming(false)
            setStreamingContent("")
            setCurrentRound(round)
            setPhase("awaiting-input")
        },
        [selectedSpecialists, topic, executeSpecialist]
    )

    // ─── Run Council: staggered dispatch in latency order ────────────────

    /**
     * Run a full Council session in latency-ascending stagger order.
     *
     * Fires each specialist 500ms apart so the slowest models don't all
     * start simultaneously and saturate token rate limits. Each specialist
     * streams in independently — the UI updates as each one finishes.
     *
     * Attaches a `councilPosition` and `arrivalMs` to every entry so the
     * streaming UI can show the position pill and arrival timer.
     *
     * @param orderedSpecialists - Specialists in latency-ascending order
     * @param threads            - Thread ID map (pre-initialised)
     */
    const runCouncilMeeting = useCallback(
        async (orderedSpecialists: Specialist[], threads: Record<string, string>) => {
            meetingStartMsRef.current = Date.now()
            const total = orderedSpecialists.length

            for (let dispatchIdx = 0; dispatchIdx < total; dispatchIdx++) {
                const specialist = orderedSpecialists[dispatchIdx]
                const position = getCouncilPosition(dispatchIdx, total)

                // 500ms stagger between dispatches (except the first)
                if (dispatchIdx > 0) {
                    await new Promise((r) => setTimeout(r, 500))
                }

                setPhase("in-progress")
                setError(null)
                setIsStreaming(true)
                setCurrentSpecialistIdx(dispatchIdx)
                setStreamingContent("")

                try {
                    // Build the prompt using the standard round-based logic:
                    // dispatcher index 0 → round 0 entries present → "Quick take"
                    // dispatcher index 1 → round 1 → "On reflection"
                    // dispatcher index 2+ → round 2+ → "Thinking about this further"
                    const currentEntries = entriesRef.current
                    const prompt = buildMeetingPrompt(
                        specialist,
                        topic,
                        currentEntries,
                        currentEntries.length === 0 ? 1 : currentEntries.length + 1,
                    )

                    const dynamicsBlock = compileInterSpecialistDynamics(
                        specialist.id,
                        orderedSpecialists.map((s) => s.id),
                        topic,
                    )

                    const response = await executeSpecialist(
                        specialist,
                        threads[specialist.id],
                        prompt,
                        topic,
                        `\n\n## Council Context\nThis is a ${total}-specialist Council on: "${topic}". Your position in the staircase: ${COUNCIL_POSITION_LABELS[position]}.${dynamicsBlock ? `\n\n${dynamicsBlock}` : ""}`
                    )

                    const arrivalMs = Date.now() - meetingStartMsRef.current
                    const proposals = parseProposedActions(response)
                    const entry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: getSpecialistDisplayName(specialist),
                        round: dispatchIdx + 1,
                        content: stripProposedActionsBlock(response),
                        proposals: proposals.length > 0 ? proposals : undefined,
                        councilPosition: position,
                        arrivalMs,
                    }

                    setEntries((prev) => [...prev, entry])

                    // Compute "wants to speak" after each response
                    const remainingIds = orderedSpecialists.map((s) => s.id)
                    const wants = getWantsToSpeak(response, remainingIds, specialist.id)
                    setWantsToSpeak(wants)
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error"
                    console.error(`[Council] ${specialist.name} failed:`, message)
                    setError(`${specialist.name} stepped out for a moment — give it 30 seconds and try the round again.`)

                    const errorEntry: MeetingEntry = {
                        specialistId: specialist.id,
                        specialistName: getSpecialistDisplayName(specialist),
                        round: dispatchIdx + 1,
                        content: `*${specialist.name} stepped out for a moment — give it 30 seconds and try the round again.*`,
                        councilPosition: position,
                    }
                    setEntries((prev) => [...prev, errorEntry])
                }

                setIsStreaming(false)
                setStreamingContent("")
            }

            setCurrentRound(total)
            setPhase("awaiting-input")
        },
        [topic, executeSpecialist]
    )

    // ─── Start Meeting ────────────────────────────────────────────────────

    /**
     * Initialize threads and run only the FIRST specialist.
     * When a Council tier is selected, auto-select and stagger all specialists.
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

            // Council mode: run all specialists in latency-ascending order with 500ms stagger
            if (councilTier !== "quick" || selectedSpecialists.length > 2) {
                // Sort the already-selected specialists by latency weight for dispatch order
                const sortedForDispatch = [...selectedSpecialists].sort(
                    (a, b) =>
                        (MODEL_TIER_LATENCY_WEIGHT[a.modelTier] ?? 3) -
                        (MODEL_TIER_LATENCY_WEIGHT[b.modelTier] ?? 3)
                )
                setIsStarting(false)
                await runCouncilMeeting(sortedForDispatch, threads)
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
    }, [selectedIds, topic, initializeThreads, runSingleSpecialist, selectedSpecialists, councilTier, runCouncilMeeting])

    // ─── Ask a Specific Specialist ────────────────────────────────────────

    /**
     * User tapped a specialist chip — run that specialist next.
     */
    const handleAskSpecialist = useCallback(
        async (specialist: Specialist) => {
            setShowThoughtsInput(false)
            const thoughts = userThoughts.trim() || undefined
            setUserThoughts("")

            const idx = selectedSpecialists.findIndex((s) => s.id === specialist.id)
            if (idx === -1) return

            const nextRound = currentRound + 1
            await runSingleSpecialist(idx, nextRound, threadIds, thoughts)
        },
        [selectedSpecialists, currentRound, threadIds, userThoughts, runSingleSpecialist]
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
                        content: `*${specialist.name} stepped out for a moment — give it 30 seconds and try the round again.*`,
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
    }, [currentRound, selectedSpecialists, topic, threadIds, executeSpecialist])

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
            // Wrap-up stays on the claude tier deliberately — synthesis benefits
            // from Opus and the wrap-up cost is one call per meeting, not per
            // turn. Piping through getPrimaryTargetForTier keeps client/server
            // routing consistent with the per-specialist call site above.
            const wrapUpTarget = getPrimaryTargetForTier("claude")
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: WRAP_UP_PROMPT,
                    input: fullTranscript,
                    providerId: wrapUpTarget.providerId,
                    modelId: wrapUpTarget.modelId,
                    modelTier: wrapUpTarget.modelTier,
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

            // INTENT: Auto-save meeting to deliverables so the user never loses output.
            // Previously, users had to manually click "Save Meeting" — if they closed
            // the dialog first, the entire meeting output was lost.
            try {
                const attendeeNames = selectedSpecialists.map((s) => s.name)
                const redundantItems = parsed.redundantItems ?? []
                const notesMarkdown = [
                    `# Team Meeting: ${topic}`,
                    `**Attendees:** ${attendeeNames.join(", ")}`,
                    `**Rounds:** ${currentRound}`,
                    "",
                    "## Summary",
                    parsed.notes.summary,
                    "",
                    "## Key Decisions",
                    ...parsed.notes.keyDecisions.map((d: string) => `- ${d}`),
                    "",
                    "## Action Items",
                    ...parsed.notes.actionItems.map((a: string) => `- ${a}`),
                    "",
                    "## Open Questions",
                    ...parsed.notes.openQuestions.map((q: string) => `- ${q}`),
                    "",
                    "## Next Steps",
                    ...parsed.notes.nextSteps.map((s: string) => `- ${s}`),
                    ...(redundantItems.length > 0
                        ? [
                              "",
                              "## Items Retired",
                              ...redundantItems.map(
                                  (item: { title: string; reason: string; recommendation: string }) =>
                                      `- **${item.title}** — ${item.reason} (${item.recommendation})`
                              ),
                          ]
                        : []),
                    "",
                    "---",
                    "",
                    "## Full Transcript",
                    "",
                    "*The complete meeting discussion is included below for reference.*",
                    "",
                    fullTranscript,
                ].join("\n")

                const saveResult = await createArtifact({
                    title: `Team Meeting: ${topic.slice(0, 80)}`,
                    content: notesMarkdown,
                    contentType: "document",
                    metadata: {
                        source: "team-meeting",
                        topic,
                        attendees: attendeeNames,
                        roundCount: currentRound,
                        notes: parsed.notes,
                        objectiveCount: parsed.objectives.length,
                        marketplaceCount: parsed.marketplaceSuggestions.length,
                        redundantItemCount: redundantItems.length,
                    },
                })

                if (!saveResult.error) {
                    setIsAutoSaved(true)

                    // INTENT: Also persist a structured meeting_thread so the
                    // session gets a permanent /agents/m/<id> URL the founder
                    // can return to, share, or branch from.
                    const artifactId = (saveResult.data as { id?: string } | null)?.id
                    const threadEntries = entries.map((e) => ({
                        specialistId: e.specialistId,
                        specialistName: e.specialistName,
                        councilPosition: e.councilPosition,
                        arrivalMs: e.arrivalMs,
                        roundNumber: e.round,
                        content: e.content,
                        role: "specialist" as const,
                    }))

                    createMeetingThread({
                        topic,
                        councilTier,
                        specialistIds: [...selectedIds],
                        outputs: parsed as unknown as Record<string, unknown>,
                        artifactId,
                        entries: threadEntries,
                    }).then(({ threadId, error: threadErr }) => {
                        if (threadErr) {
                            console.error("[TeamMeeting] Failed to create meeting_thread:", threadErr)
                        } else if (threadId) {
                            setMeetingThreadId(threadId)
                        }
                    }).catch(() => {})

                    // INTENT: Feed meeting insights into Knowledge Vault.
                    import("@/actions/knowledge").then(({ extractKnowledgeFromText }) => {
                        extractKnowledgeFromText(notesMarkdown, `Meeting: ${topic.slice(0, 60)}`).catch(() => {})
                    }).catch(() => {})
                } else {
                    console.error("[TeamMeeting] Auto-save failed:", saveResult.error)
                }
            } catch (saveErr) {
                console.error("[TeamMeeting] Auto-save error:", saveErr instanceof Error ? saveErr.message : "Unknown")
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[TeamMeeting] Wrap-up failed:", message)
            setError(`Failed to generate meeting outputs: ${message}`)
        } finally {
            setIsGeneratingOutputs(false)
        }
    }, [selectedSpecialists, entries, topic, currentRound, councilTier, selectedIds])

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
     *
     * Specialist responses include markdown ladder phrases like
     * `**Quick take —**` and inline emphasis. The preview is rendered as
     * plain text in a collapsed row, so we strip the markdown markers
     * before truncating — otherwise the user sees literal asterisks.
     */
    function getPreview(content: string): string {
        // INTENT: strip the markdown the message body uses so the
        // collapsed-row preview reads as plain prose. We only strip
        // emphasis markers (** __ *), not destructive transforms like
        // headings — those would change the sentence structure.
        const stripped = content
            .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
            .replace(/__([^_]+)__/g, '$1') // alt-bold
            .replace(/\*([^*]+)\*/g, '$1') // italic
            .replace(/_([^_]+)_/g, '$1') // alt-italic
            .replace(/`([^`]+)`/g, '$1') // inline code
        // Split on sentence boundaries, take first 2
        const sentences = stripped.split(/(?<=[.!?])\s+/)
        const preview = sentences.slice(0, 2).join(" ")
        if (preview.length < stripped.length) {
            return preview.length > 200 ? preview.slice(0, 200) + "..." : preview + "..."
        }
        return preview
    }

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <>
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
                                                unoptimized
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
                        </div>
                    )}
                </DialogHeader>

                {/* ── Phase 1: Setup ───────────────────────────────────────── */}
                {phase === "setup" && (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-6">

                        {/* Council Tier Picker */}
                        <div className="space-y-3">
                            <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                Pick the Council depth
                            </Label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {COUNCIL_TIER_META.map((meta) => {
                                    const hasAccess = canAccessCouncilTier(userTier, meta.tier)
                                    const isSelected = councilTier === meta.tier

                                    return (
                                        <button
                                            key={meta.tier}
                                            type="button"
                                            onClick={() => {
                                                if (!hasAccess) {
                                                    if (!meta.isComingSoon) {
                                                        setShowCouncilUpgradeFor(meta.tier)
                                                    }
                                                    return
                                                }
                                                setCouncilTier(meta.tier)
                                                // Auto-select the specialists for this tier when topic is available
                                                if (topic.trim() && meta.tier !== "strategy") {
                                                    const topicClass = classifyTopic(topic)
                                                    const specialists = getCouncilSpecialists(meta.tier, topicClass)
                                                    setSelectedIds(new Set(specialists.map((s) => s.id)))
                                                }
                                            }}
                                            className={cn(
                                                "flex flex-col items-start p-3 rounded-lg border text-left transition-all relative",
                                                isSelected && hasAccess
                                                    ? "border-international-orange bg-international-orange/5 ring-1 ring-international-orange/20"
                                                    : !hasAccess
                                                    ? "border-muted bg-muted/30 opacity-60 cursor-not-allowed"
                                                    : "border-muted hover:border-muted-foreground/30 bg-background",
                                            )}
                                        >
                                            <div className="flex items-center justify-between w-full mb-1">
                                                <span className={cn(
                                                    "text-sm font-semibold",
                                                    isSelected && hasAccess ? "text-international-orange" : "text-foreground"
                                                )}>
                                                    {meta.label}
                                                </span>
                                                {!hasAccess && !meta.isComingSoon && (
                                                    <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground bg-muted rounded px-1 py-0.5">
                                                        upgrade
                                                    </span>
                                                )}
                                                {meta.isComingSoon && (
                                                    <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground bg-muted rounded px-1 py-0.5">
                                                        soon
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                {meta.description}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground mt-1 leading-tight">
                                                {meta.latencyDescription}
                                            </span>
                                            {!hasAccess && !meta.isComingSoon && (
                                                <span className="text-[10px] text-international-orange/70 mt-1">
                                                    {meta.pricingHint}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Specialist Picker — shown as a "customise" section */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    {councilTier !== "strategy" && selectedIds.size > 0
                                        ? "Customise the lineup"
                                        : "Who should attend? (pick 2 or more)"}
                                </Label>
                                {councilTier !== "strategy" && topic.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const topicClass = classifyTopic(topic)
                                            const specialists = getCouncilSpecialists(councilTier, topicClass)
                                            setSelectedIds(new Set(specialists.map((s) => s.id)))
                                        }}
                                        className="text-[10px] text-international-orange hover:underline"
                                    >
                                        Reset to {COUNCIL_TIER_META.find((m) => m.tier === councilTier)?.label} defaults
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                                                        unoptimized
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
                                                    unoptimized
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
                                                    unoptimized
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
                            <div
                                className="space-y-2 animate-in fade-in duration-400"
                                style={{ animationTimingFunction: "ease-out" }}
                            >
                                {/* Council position pill */}
                                {(() => {
                                    const position = getCouncilPosition(currentSpecialistIdx, selectedSpecialists.length)
                                    const label = COUNCIL_POSITION_LABELS[position]
                                    return (
                                        <div className="ml-9 mb-1">
                                            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-international-orange/80 bg-international-orange/8 px-2 py-0.5 rounded-full border border-international-orange/15">
                                                {label}
                                            </span>
                                        </div>
                                    )
                                })()}
                                <div className="flex items-center gap-2">
                                    <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                        {currentSpecialist.avatarImage ? (
                                            <Image
                                                src={currentSpecialist.avatarImage}
                                                alt={currentSpecialist.name}
                                                fill
                                                unoptimized
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
                                return (
                                    <div key={i}>
                                        <button
                                            onClick={() => toggleEntry(i)}
                                            className={cn(
                                                "flex items-start gap-2 w-full text-left py-2 px-3 rounded-lg transition-colors",
                                                "hover:bg-muted/30"
                                            )}
                                        >
                                            <div className="relative h-6 w-6 rounded-full overflow-hidden bg-muted flex-shrink-0 mt-0.5">
                                                {specialist?.avatarImage ? (
                                                    <Image
                                                        src={specialist.avatarImage}
                                                        alt={entry.specialistName}
                                                        fill
                                                        unoptimized
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
                                                    {entry.councilPosition && (
                                                        <span className="text-[9px] font-mono uppercase tracking-wider text-international-orange/70 bg-international-orange/8 px-1.5 py-0.5 rounded-full border border-international-orange/10">
                                                            {COUNCIL_POSITION_LABELS[entry.councilPosition]}
                                                        </span>
                                                    )}
                                                    {entry.arrivalMs !== undefined && (
                                                        <span className="text-[9px] text-muted-foreground">
                                                            {(entry.arrivalMs / 1000).toFixed(1)}s
                                                        </span>
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
                                return (
                                    <div
                                        className="space-y-2 animate-in fade-in duration-400"
                                        style={{ animationTimingFunction: "ease-out" }}
                                    >
                                        {/* Council position pill + arrival timer */}
                                        {lastEntry.councilPosition && (
                                            <div className="ml-9 mb-1 flex items-center gap-2">
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-international-orange/80 bg-international-orange/8 px-2 py-0.5 rounded-full border border-international-orange/15">
                                                    {COUNCIL_POSITION_LABELS[lastEntry.councilPosition]}
                                                </span>
                                                {lastEntry.arrivalMs !== undefined && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {(lastEntry.arrivalMs / 1000).toFixed(1)}s
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <div className="relative h-7 w-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                {specialist?.avatarImage ? (
                                                    <Image
                                                        src={specialist.avatarImage}
                                                        alt={lastEntry.specialistName}
                                                        fill
                                                        unoptimized
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
                                        <div className={cn(
                                            "ml-9 rounded-lg border p-4",
                                            "border-muted bg-muted/30"
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
                                                            unoptimized
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
                                                            unoptimized
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
                            <>
                                <MeetingOutputs
                                    outputs={meetingOutputs}
                                    topic={topic}
                                    attendees={selectedSpecialists.map((s) => s.name)}
                                    transcript={entries
                                        .map((e) => `**${e.specialistName}** (Round ${e.round}):\n${e.content}`)
                                        .join("\n\n---\n\n")}
                                    roundCount={currentRound}
                                    onShareReport={() => setShowReportDialog(true)}
                                    initialSaved={isAutoSaved}
                                />
                                {/* Cross-surface handoff CTAs (RED-TEAM-PIVOT-PLAN.md):
                                    turn the brainstorm into a Forge build OR an investor
                                    test in one click. localStorage carries topic + a short
                                    summary; the receiving page reads on mount. Both CTAs are
                                    weighted equally — building and testing investor appetite
                                    are the two killer surfaces a brainstorm should feed. */}
                                <div className="px-6 pb-4 pt-2">
                                    <div className="rounded-lg border border-international-orange/20 bg-international-orange/[0.04] p-4">
                                        <p className="text-sm font-semibold text-foreground mb-2">
                                            What next?
                                        </p>
                                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                                            Carry this conversation into the killer surfaces — your specialists already framed the problem, now build it AND test it with investors.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="gap-2"
                                                onClick={() => {
                                                    try {
                                                        localStorage.setItem(
                                                            "forge-from-brainstorm-context",
                                                            JSON.stringify({
                                                                topic,
                                                                summary: meetingOutputs?.notes.summary ?? "",
                                                                createdAt: new Date().toISOString(),
                                                            }),
                                                        )
                                                    } catch {
                                                        /* localStorage may be disabled — proceed anyway */
                                                    }
                                                    router.push("/the-forge-v2/new?fromBrainstorm=1")
                                                }}
                                            >
                                                <Hammer className="h-3.5 w-3.5" />
                                                Build this in The Forge
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="gap-2"
                                                onClick={() => {
                                                    try {
                                                        localStorage.setItem(
                                                            "investor-from-brainstorm-context",
                                                            JSON.stringify({
                                                                topic,
                                                                summary: meetingOutputs?.notes.summary ?? "",
                                                                createdAt: new Date().toISOString(),
                                                            }),
                                                        )
                                                    } catch {
                                                        /* localStorage may be disabled — proceed anyway */
                                                    }
                                                    router.push("/investors?fromBrainstorm=1")
                                                }}
                                            >
                                                <Building2 className="h-3.5 w-3.5" />
                                                See which investors would back this
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Tier-aware upsell — renders below the What-next CTAs only
                                 * when the user has used >= 80% of their bundled brainstorm
                                 * allowance for the month. Free hits this on session 1 of 1;
                                 * Starter+ surfaces the £10 top-up / Pro upgrade language. */}
                                <PostMeetingUpsell
                                    userId={userId}
                                    tier={userTier ?? 'free'}
                                    used={
                                        typeof brainstormsUsedThisMonth === 'number'
                                            ? brainstormsUsedThisMonth + 1
                                            : 1
                                    }
                                    cap={
                                        SUBSCRIPTION_PLANS[userTier ?? 'free']?.limits
                                            .brainstormSessionsPerMonth ?? null
                                    }
                                />

                                {/* Persistent URL nudge — shown once the thread has been saved */}
                                {meetingThreadId && (
                                    <div className="px-6 pb-6">
                                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                                            <p className="text-xs text-muted-foreground">
                                                This meeting has a permanent link you can return to, share, or branch from.
                                            </p>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="flex-shrink-0 gap-1.5 text-xs"
                                                onClick={() => {
                                                    router.push(`/agents/m/${meetingThreadId}`)
                                                    onOpenChange(false)
                                                }}
                                            >
                                                View meeting
                                                <ArrowRight className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
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

                {/* AI disclaimer */}
                <div className="px-6 pb-1">
                    <AiDisclaimer />
                </div>

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

        {meetingOutputs?.report && (
            <HuddleReport
                open={showReportDialog}
                onOpenChange={setShowReportDialog}
                report={meetingOutputs.report}
                topic={topic}
                attendees={selectedSpecialists.map((s) => s.name)}
            />
        )}

        {/* Council tier upgrade modal */}
        {showCouncilUpgradeFor && (
            <CouncilUpgradeModal
                tier={showCouncilUpgradeFor}
                onClose={() => setShowCouncilUpgradeFor(null)}
            />
        )}
        </>
    )
}

// ─── Council Upgrade Modal ────────────────────────────────────────────────

interface CouncilUpgradeModalProps {
    tier: CouncilTier
    onClose: () => void
}

/**
 * Upgrade modal shown when a user clicks a Council tier they cannot access.
 * Voice rules: lead with the option, not the failure. British spelling.
 * No em dashes. No model names in copy.
 */
function CouncilUpgradeModal({ tier, onClose }: CouncilUpgradeModalProps) {
    const copy = getCouncilUpgradeCopy(tier)

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle className="font-display flex items-center gap-2">
                        <Users className="h-5 w-5 text-international-orange" />
                        {copy.headline}
                    </DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {copy.body}
                    </p>
                    <div className="rounded-lg border border-international-orange/20 bg-international-orange/[0.04] px-4 py-3">
                        <p className="text-xs text-muted-foreground">{copy.pricingHint}</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={onClose}>
                        Stay on Quick Council
                    </Button>
                    <Button
                        asChild
                        className="bg-international-orange hover:bg-international-orange-hover text-white"
                    >
                        <Link href="/settings/billing">
                            Upgrade to {copy.planName}
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Post-meeting upsell ──────────────────────────────────────────────────

interface PostMeetingUpsellProps {
    /** Authenticated user id, used to build the referral URL. Optional. */
    userId?: string
    /** Subscription tier of the current user. */
    tier: SubscriptionTier
    /** Brainstorm sessions consumed this calendar month (including this one). */
    used: number
    /** Bundled allowance for this tier. `null` = unlimited (no upsell). */
    cap: number | null
}

/**
 * Tier-aware upsell rendered below the existing "What next?" CTA bar at
 * the end of every brainstorm. Shown only when the user is at >= 80% of
 * their bundled brainstorm allowance — earlier than that and the upsell
 * is noise.
 *
 * Voice rules: lead with the option, never the failure. "Cancel anytime,
 * no contract" reassurance line. Referral URL pattern is
 * `${APP_DOMAIN}/signup?ref=<user_id>` so the conversion engine in
 * Tier 5 step 22 can credit the inviter without any URL-shape migration.
 */
function PostMeetingUpsell({ userId, tier, used, cap }: PostMeetingUpsellProps) {
    const [copied, setCopied] = useState(false)

    if (cap === null) return null
    if (cap <= 0) return null
    if (used / cap < 0.8) return null

    const referralUrl = userId ? `${APP_DOMAIN}/signup?ref=${userId}` : null
    const isFree = tier === 'free'
    const remaining = Math.max(0, cap - used)

    // Resolve Starter v2 / Pro copy from the live plan data so a price
    // change in plans.ts ripples through here without manual edits.
    const starter = SUBSCRIPTION_PLANS['starter_v2']
    const pro = SUBSCRIPTION_PLANS['professional']
    const starterPrice = starter ? `£${(starter.priceMonthlyGBP / 100).toFixed(0)}` : '£20'
    const starterBrainstorms = starter?.limits.brainstormSessionsPerMonth ?? 10
    const starterLeads = starter?.limits.investorLeadsPerMonth ?? 100
    const proPrice = pro ? `£${(pro.priceMonthlyGBP / 100).toFixed(0)}` : '£149'

    const usageLine = isFree
        ? `You've used ${used} of ${cap} brainstorms this month.`
        : `${used} of ${cap} brainstorms used this month, ${remaining} remaining.`

    const offerLine = isFree
        ? `Upgrade to Starter, ${starterPrice}/month for ${starterBrainstorms} brainstorms, ${starterLeads} investor leads, and a drafted email for each match.`
        : `Top up with the £10 add-on for 100 extra investor leads, or upgrade to Pro (${proPrice}/month) for unlimited brainstorming.`

    const handleCopy = async () => {
        if (!referralUrl) return
        try {
            await navigator.clipboard.writeText(referralUrl)
            setCopied(true)
            toast.success('Invite link copied. Paste it anywhere.')
            setTimeout(() => setCopied(false), 2400)
        } catch {
            toast.error('Could not copy link. Long-press the link to copy manually.')
        }
    }

    const handleEmailShare = () => {
        if (!referralUrl) return
        const subject = encodeURIComponent('ForgeOS, the brainstorming room I\'ve been using')
        const body = encodeURIComponent(
            [
                'Hey,',
                '',
                'I\'ve been running brainstorms with the ForgeOS specialist team. Sharing my invite link below in case it\'s useful.',
                '',
                referralUrl,
                '',
                'Tristan',
            ].join('\n'),
        )
        window.location.href = `mailto:?subject=${subject}&body=${body}`
    }

    return (
        <div className="px-6 pb-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div>
                    <p className="text-sm font-semibold text-foreground">{usageLine}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                        {offerLine}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className="gap-2">
                        <Link href={isFree ? '/pricing?plan=starter_v2' : '/pricing'}>
                            {isFree ? `Start Starter, ${starterPrice}/month` : 'See plans'}
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </Button>
                    {referralUrl && (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopy}
                                className="gap-2"
                            >
                                {copied ? (
                                    <>
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                        Copy invite link
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleEmailShare}
                                className="gap-2"
                            >
                                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                Send via email
                            </Button>
                        </>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    {isFree
                        ? 'Or invite a friend who pays for Starter, you get +100 investor searches free this month. Cancel anytime, no contract.'
                        : 'Invite a friend who pays for Starter, you get +100 investor searches free this month.'}
                </p>
            </div>
        </div>
    )
}
