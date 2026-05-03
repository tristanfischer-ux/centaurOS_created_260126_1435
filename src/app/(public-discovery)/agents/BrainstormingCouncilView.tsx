/**
 * @file BrainstormingCouncilView.tsx
 *
 * @description Authenticated brainstorming council UI per BRAINSTORM-COUNCIL-MOCKUP-V1.html.
 *
 * Renders the full Council experience for signed-in founders:
 * - Page header ("Brainstorming Council")
 * - Tier picker: Quick / Full / Deep / Strategy
 * - Question bar with "Convene the council" submit
 * - Section 1: Fiona host card (opening framing — empty state before session)
 * - Section 2: Council parallel-fire grid (4 specialist cards — empty state before session)
 * - Section 3: Fiona closing synthesis (held until council returns)
 *
 * The component is client-side (interactive tier picker + question input).
 * It reads specialist data from SPECIALISTS directly — no prop threading
 * needed beyond what this file already imports.
 *
 * Form submission: routes to the existing `saveMeetingThread` server action
 * from `src/actions/meeting-threads.ts`. Tier maps to councilTier string.
 *
 * @mockup /BRAINSTORM-COUNCIL-MOCKUP-V1.html — approved V1 spec. Port is
 *         top-to-bottom, class names and copy verbatim.
 *
 * @security Client component — no direct data access. Auth context is
 *           inherited from the server wrapper in page.tsx.
 */

"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { SPECIALISTS } from "@/lib/agents/specialists-config"
import type { Specialist } from "@/lib/agents/specialists-config"
import {
    getCalFraming,
    getSpecialistRound1Response,
    getSpecialistRound2Response,
    getCalClosingResponse,
} from "@/actions/brainstorming-council"
import type { SpecialistResponse } from "@/actions/brainstorming-council-types"
import {
    createMeetingThread,
    startMeetingThread,
    addProgressiveMeetingEntry,
    completeMeetingThread,
    getInProgressThread,
    refreshSessionAssetUrls,
} from "@/actions/meeting-threads"
import { generateSessionInfographic } from "@/actions/brainstorm-cover"
import { generateSessionAudio } from "@/actions/brainstorm-audio"
import { MeetingHistory } from "@/app/(platform)/agents/meeting-history"
import { typography } from "@/lib/design-system"

// ─── Council tier definitions (Quick / Full / Deep / Strategy) ───────────────

type CouncilTier = "quick" | "full" | "deep" | "strategy" | "full-council"

interface TierMeta {
    id: CouncilTier
    label: string
    subtitle: string
    hint: string
    specialists: number
}

const COUNCIL_TIERS: TierMeta[] = [
    {
        id: "quick",
        label: "Quick take",
        subtitle: "2 specialists · ~8s",
        hint: "Fast gut-check from two perspectives — useful when you need a directional read, not a full analysis.",
        specialists: 2,
    },
    {
        id: "full",
        label: "On reflection",
        subtitle: "3 specialists · ~12s",
        hint: "Three voices with different angles. Cal opens, three specialists respond in parallel, Cal closes.",
        specialists: 3,
    },
    {
        id: "deep",
        label: "Thinking further",
        subtitle: "4 specialists · ~14s",
        hint: "Four specialists in the 2×2 grid. Cal synthesises where they agree and disagree, plus a concrete next action.",
        specialists: 4,
    },
    {
        id: "strategy",
        label: "Council split",
        subtitle: "5 specialists · ~18s",
        hint: "Five voices, maximum lineage diversity. Best for high-stakes strategic questions.",
        specialists: 5,
    },
    {
        id: "full-council",
        label: "Full council",
        subtitle: "12 specialists · ~30s",
        hint: "Every specialist in the room — all 12 voices across every domain. Best for major strategic decisions where no angle should be missed.",
        specialists: 12,
    },
]

// ─── Suggestion prompts — common dilemmas hardware founders bring to the council ──
//
// Each suggestion pre-fills the question and switches to the tier that suits
// its depth. Categories cover fundraising, hiring, product, manufacturing,
// strategy, and operations — the dilemmas Tristan has heard most often from
// founders during Fractional Forge sessions.
//
// Voice rules: specific numbers over adjectives (£50K not "some MRR"),
// British spelling, no acronyms, no failure-mode framing, no "if you've been
// stuck" / "we know it's hard" framing — the prompts speak to what to DO,
// not why the founder has not done it yet.

interface SuggestionPrompt {
    text: string
    tier: CouncilTier
    category: string
}

const SUGGESTION_PROMPTS: SuggestionPrompt[] = [
    {
        text: "I want to create a new hardware product in the forge — where do I start and what does the first 90 days look like?",
        tier: "quick",
        category: "Product development",
    },
    {
        text: "Is £50K monthly recurring revenue enough to start a serious Seed raise on a hardware product?",
        tier: "quick",
        category: "Fundraising",
    },
    {
        text: "Should I lock in the Tier 1 contract manufacturer now or run a second prototype with the design house?",
        tier: "full",
        category: "Manufacturing",
    },
    {
        text: "How do I price a hardware product to leave 35% gross margin after first-year freight and warranty?",
        tier: "full",
        category: "Pricing",
    },
    {
        text: "What design changes can get my Bill of Materials cost down 30% before the second production run?",
        tier: "deep",
        category: "Bill of Materials",
    },
    {
        text: "How do we shorten manufacturing lead time from 14 weeks to 6 weeks without a second supplier?",
        tier: "deep",
        category: "Lead time",
    },
    {
        text: "What is our defensible moat once a Shenzhen clone of our product arrives at half our price in 12 months?",
        tier: "strategy",
        category: "Defensibility",
    },
    {
        text: "Is now the right time to take our hardware product from the United Kingdom into the United States?",
        tier: "strategy",
        category: "Geographic expansion",
    },
]

// ─── Council member subset selection ────────────────────────────────────────
// Cal always hosts; the council picks from a preferred ordering by role breadth.
// Fiona stays available as a specialist when the topic is fundraising/cap-table.
// All 12 non-Cal specialists are listed here; tier determines the count used.

const ALL_SPECIALIST_IDS = [
    "strategist",          // Sage  — Strategy
    "finance-lead",        // Finn  — Finance
    "sales-lead",          // Sal   — Sales
    "cto",                 // Max   — CTO
    "fundraising-advisor", // Fiona — Fundraising
    "vp-manufacturing",    // Fang  — Manufacturing
    "vp-supply-chain",     // Chase — Supply Chain
    "product-lead",        // Priya — Product
    "growth-marketer",     // Mia   — Marketing
    "vp-engineering",      // Jian  — Engineering
    "hiring-team",         // Harper — HR
    "legal-counsel",       // Leo  — Legal
] as const

// Cal is always host/closer
const CAL = SPECIALISTS.find(s => s.id === "chief-of-staff")!

// ─── Domain-aware default specialist selection ───────────────────────────────
// Keyword → preferred specialist IDs (ordered by relevance).
// Tier bounds the count — the list is truncated or padded with fallback IDs.

const DOMAIN_KEYWORD_MAP: Array<{ keywords: string[]; specialists: string[] }> = [
    {
        keywords: ["bom", "bill of materials", "cost", "manufacturing", "production", "factory", "supply", "component"],
        specialists: ["cto", "vp-manufacturing", "vp-supply-chain", "finance-lead", "product-lead"],
    },
    {
        keywords: ["fundraising", "valuation", "cap table", "seed", "series", "investor", "raise", "round", "term sheet"],
        specialists: ["fundraising-advisor", "finance-lead", "strategist", "legal-counsel", "vp-engineering"],
    },
    {
        keywords: ["sales", "pricing", "gtm", "go-to-market", "distribution", "revenue", "customer", "pipeline", "deal"],
        specialists: ["sales-lead", "growth-marketer", "finance-lead", "product-lead", "strategist"],
    },
    {
        keywords: ["product", "spec", "regulatory", "certification", "design", "feature", "roadmap", "launch"],
        specialists: ["product-lead", "cto", "legal-counsel", "vp-manufacturing", "growth-marketer"],
    },
    {
        keywords: ["hiring", "team", "culture", "org", "people", "recruit", "hr", "talent"],
        specialists: ["hiring-team", "strategist", "growth-marketer", "finance-lead", "vp-engineering"],
    },
    {
        keywords: ["legal", "contract", "ip", "patent", "intellectual property", "compliance", "regulation"],
        specialists: ["legal-counsel", "fundraising-advisor", "cto", "product-lead", "strategist"],
    },
    {
        keywords: ["strategy", "market", "pivot", "position", "competitive", "moat", "expand", "growth", "geographic"],
        specialists: ["strategist", "finance-lead", "growth-marketer", "sales-lead", "fundraising-advisor"],
    },
    {
        keywords: ["lead time", "logistics", "freight", "shipping", "warehouse", "inventory"],
        specialists: ["vp-supply-chain", "vp-manufacturing", "finance-lead", "cto", "product-lead"],
    },
]

const FALLBACK_SPECIALIST_IDS = ["strategist", "finance-lead", "sales-lead", "cto", "fundraising-advisor"]

/** Returns the auto-selected specialist IDs for a given question text. */
function getAutoSelectedIds(questionText: string, count: number): string[] {
    const lower = questionText.toLowerCase()
    for (const { keywords, specialists } of DOMAIN_KEYWORD_MAP) {
        if (keywords.some(k => lower.includes(k))) {
            const base = specialists.slice(0, count)
            if (base.length < count) {
                // Pad with fallbacks that aren't already in the list
                const extra = FALLBACK_SPECIALIST_IDS.filter(id => !base.includes(id))
                base.push(...extra.slice(0, count - base.length))
            }
            return base.slice(0, count)
        }
    }
    return FALLBACK_SPECIALIST_IDS.slice(0, count)
}

function getCouncilMembers(tier: CouncilTier, selectedIds?: string[]): Specialist[] {
    const tierMeta = COUNCIL_TIERS.find(t => t.id === tier)!
    const count = tierMeta.specialists
    const ids = selectedIds ?? ALL_SPECIALIST_IDS.slice(0, Math.min(count, ALL_SPECIALIST_IDS.length))
    return ids
        .slice(0, count)
        .map(id => SPECIALISTS.find(s => s.id === id)!)
        .filter(Boolean)
}

// ─── Avatar colour mapping ───────────────────────────────────────────────────

function getAvatarClass(specialistId: string): string {
    const map: Record<string, string> = {
        "strategist":          "bc-av-sage",
        "finance-lead":        "bc-av-finn",
        "sales-lead":          "bc-av-sal",
        "cto":                 "bc-av-max",
        "chief-of-staff":      "bc-av-cal",
        "fundraising-advisor": "bc-av-fiona",
    }
    return map[specialistId] ?? "bc-av-default"
}

// ─── Specialist sig-close label (verbatim from mockup / personality.ts) ─────

function getSigCloseLabel(specialistId: string): string {
    const map: Record<string, string> = {
        "strategist":          "What to do Monday morning",
        "finance-lead":        "The numbers that matter",
        "sales-lead":          "Send this today",
        "cto":                 "Ship this week",
        "chief-of-staff":      "Next concrete action",
        "fundraising-advisor": "What investors want to see",
    }
    return map[specialistId] ?? "Next step"
}

// ─── BrainstormingCouncilView ────────────────────────────────────────────────

interface BrainstormingCouncilViewProps {
    /** Authenticated user id — threaded through for future persistence calls */
    userId: string
}

// ─── Council session state ───────────────────────────────────────────────────

/**
 * W77: Top-level phase (idle → pending → done | error).
 * "pending" covers all in-flight sub-states; use councilPhase for detail.
 */
type SessionPhase = "idle" | "pending" | "done" | "error"

/**
 * W77: Fine-grained orchestration phase inside "pending" and at the
 * transition to "done". Drives which sections show loading vs content.
 *
 * - "cal-framing"   — only Cal's call is in flight; specialist section is queued
 * - "r1-running"    — Cal's text is shown; Round 1 specialists are in flight
 *                     (cards arrive one-by-one as individual promises resolve)
 * - "r2-running"    — R1 shown; Round 2 specialists are in flight
 * - "cal-closing"   — R2 (or R1 for quick tier) shown; Cal closing is in flight
 * - "done"          — everything populated
 * - "idle"          — pre-submission
 */
type CouncilPhase =
    | "idle"
    | "cal-framing"
    | "r1-running"
    | "r2-running"
    | "cal-closing"
    | "done"

interface CouncilSession {
    phase: SessionPhase
    /** W77: fine-grained sub-phase for progressive reveal */
    councilPhase: CouncilPhase
    hostOpening: string
    specialistResponses: SpecialistResponse[]
    hostClosing: string
    /** W56: per-specialist arrival tracking — IDs that have already rendered. */
    arrivedIds: Set<string>
    errorMessage: string
    /** The question that was submitted — captured at submit time to prevent
     *  stale-closure context leaks when the user edits the input mid-flight. */
    submittedQuestion: string
    /** The tier that was active when the session was submitted. Stored here
     *  so the council grid renders the correct specialist count even if the
     *  user changes the tier while the session is pending / done. */
    submittedTier: CouncilTier
    /** The specialist IDs locked in at submit time. */
    submittedSpecialistIds: string[]
    /** W50: true when the council ran two rounds (tier !== 'quick'). */
    hadRound2: boolean
    /** W52: UUID of the persisted meeting_thread — used by graphic/audio
     *  re-generation buttons. null until createMeetingThread returns. */
    savedThreadId: string | null
}

const EMPTY_SESSION: CouncilSession = {
    phase: "idle",
    councilPhase: "idle",
    hostOpening: "",
    specialistResponses: [],
    hostClosing: "",
    arrivedIds: new Set(),
    errorMessage: "",
    submittedQuestion: "",
    submittedTier: "deep",
    submittedSpecialistIds: [],
    hadRound2: false,
    savedThreadId: null,
}

export function BrainstormingCouncilView({ userId }: BrainstormingCouncilViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [activeTier, setActiveTier] = useState<CouncilTier>("deep")
    const [question, setQuestion] = useState("")
    const [session, setSession] = useState<CouncilSession>(EMPTY_SESSION)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const audioReadyRef = useRef<HTMLDivElement>(null)
    // W7: bump this counter after each successful session save to trigger
    // MeetingHistory to re-fetch its list.
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
    // W52: inline status for the graphic / audio re-generation buttons
    const [graphicStatus, setGraphicStatus] = useState<"idle" | "running" | "done" | "error">("idle")
    const [audioStatus, setAudioStatus] = useState<"idle" | "running" | "done" | "error">("idle")
    // W54: generated asset URLs — populated after generation completes so the
    // image and audio render inline on the page (not just in the saved-sessions panel).
    const [generatedCoverUrl, setGeneratedCoverUrl] = useState<string | null>(null)
    // Combined audio URL for new sessions (2026-04-28+). Legacy sessions
    // populate generatedAudioClips instead — both are shown via backwards-compat
    // logic in the render section below.
    const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null)
    const [generatedAudioClips, setGeneratedAudioClips] = useState<Array<{ specialistId: string; voice: string; url: string; durationMs: number | null }> | null>(null)
    // W70: show "audio ready" callout after generation
    const [audioReadyVisible, setAudioReadyVisible] = useState(false)
    // W57: manual specialist override picker
    const [showPicker, setShowPicker] = useState(false)
    const [selectedSpecialistIds, setSelectedSpecialistIds] = useState<string[]>(() =>
        getAutoSelectedIds("", COUNCIL_TIERS.find(t => t.id === "deep")!.specialists)
    )
    // W56: loading text animation index
    const [loadingLineIdx, setLoadingLineIdx] = useState(0)

    const LOADING_LINES = [
        "Reading your question…",
        "Cutting through the noise…",
        "Drafting a take…",
        "Stress-testing the assumption…",
    ]

    // Cycle loading lines every 2.5s during pending
    useEffect(() => {
        if (session.phase !== "pending") return
        const iv = setInterval(() => setLoadingLineIdx(i => (i + 1) % LOADING_LINES.length), 2500)
        return () => clearInterval(iv)
    }, [session.phase])

    // W57: update auto-selection when tier or question changes (only if not in a session)
    useEffect(() => {
        if (session.phase !== "idle") return
        const count = COUNCIL_TIERS.find(t => t.id === activeTier)!.specialists
        const newIds = getAutoSelectedIds(question, Math.min(count, ALL_SPECIALIST_IDS.length))
        setSelectedSpecialistIds(newIds)
    }, [activeTier, question, session.phase])

    // ── Session recovery on mount ──────────────────────────────────────────────
    // If the URL has ?session=<threadId>, attempt to restore the in-progress
    // brainstorm from DB entries written progressively during the live run.
    // Runs once on mount only.
    useEffect(() => {
        const threadId = searchParams.get("session")
        if (!threadId) return

        let cancelled = false

        async function tryRecover() {
            const { data, abandoned } = await getInProgressThread(threadId!)

            if (cancelled) return

            if (abandoned) {
                // Thread timed out — strip the param and let the user start fresh
                const params = new URLSearchParams(searchParams.toString())
                params.delete("session")
                const newUrl = params.toString() ? `${pathname}?${params}` : pathname
                router.replace(newUrl)
                return
            }

            if (!data) {
                // Thread complete or not found — strip param and move on
                const params = new URLSearchParams(searchParams.toString())
                params.delete("session")
                const newUrl = params.toString() ? `${pathname}?${params}` : pathname
                router.replace(newUrl)
                return
            }

            const { thread, entries } = data

            // Reconstruct session state from persisted entries
            const calOpeningEntry = entries.find(
                e => e.specialistId === "chief-of-staff" && e.councilPosition === "opener"
            )
            const calClosingEntry = entries.find(
                e => e.specialistId === "chief-of-staff" && e.councilPosition === "host-close"
            )
            const r1Entries = entries.filter(
                e => e.specialistId !== "chief-of-staff" && e.roundNumber === 1
            )
            const r2Entries = entries.filter(
                e => e.specialistId !== "chief-of-staff" && e.roundNumber === 2
            )

            // Rebuild specialistResponses from persisted entries
            const specialistResponses: SpecialistResponse[] = r1Entries.map(e => {
                const r2 = r2Entries.find(r => r.specialistId === e.specialistId)
                return {
                    id: e.specialistId ?? "",
                    name: e.specialistName ?? "",
                    title: "",
                    modelLabel: "",
                    response: e.content,
                    round2Response: r2?.content,
                }
            })

            const arrivedIds = new Set(specialistResponses.map(r => r.id))
            const hadRound2 = r2Entries.length > 0
            const tier = (thread.councilTier as CouncilTier) ?? "deep"

            // Determine the in-progress phase based on what's been persisted
            let councilPhase: CouncilPhase = "idle"
            let sessionPhase: SessionPhase = "pending"
            if (calClosingEntry) {
                sessionPhase = "done"
                councilPhase = "done"
            } else if (calOpeningEntry && r1Entries.length > 0) {
                councilPhase = "r1-running"
            } else if (calOpeningEntry) {
                councilPhase = "r1-running"
            } else {
                councilPhase = "cal-framing"
            }

            setSession({
                phase: sessionPhase,
                councilPhase,
                hostOpening: calOpeningEntry?.content ?? "",
                specialistResponses,
                hostClosing: calClosingEntry?.content ?? "",
                arrivedIds,
                errorMessage: "",
                submittedQuestion: thread.topic,
                submittedTier: tier,
                submittedSpecialistIds: thread.specialistIds,
                hadRound2,
                savedThreadId: sessionPhase === "done" ? threadId! : null,
            })

            setActiveTier(tier)
        }

        tryRecover()
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // mount only — searchParams intentionally excluded

    const submitted = session.phase !== "idle"
    // W8: always derive council members from activeTier for the pre-session
    // roster view. After submission, the rendered result grid uses
    // session.submittedTier so changing the picker mid-session doesn't
    // swap the specialist cards under live content.
    const tierCount = COUNCIL_TIERS.find(t => t.id === activeTier)!.specialists
    const councilMembers = getCouncilMembers(activeTier, selectedSpecialistIds.slice(0, Math.min(tierCount, ALL_SPECIALIST_IDS.length)))
    // The members that correspond to the in-flight or completed session.
    const sessionCouncilMembers = getCouncilMembers(session.submittedTier, session.submittedSpecialistIds)

    // W10: extracted to a named, stable callback so both the form onSubmit
    // and the button's onClick can reference it. React synthetic events
    // sometimes fail to bubble through deeply-nested form submit on first
    // interaction — dual-wiring is the belt-and-braces fix.
    //
    // W77: Cal-first progressive reveal — sequence is:
    //  1. Only Cal's framing call fires; specialists are in a "queued" visual state.
    //  2. When Cal returns, her card populates. Then all R1 specialist calls
    //     fire in parallel — but each updates state on its own promise resolution,
    //     so cards appear one-by-one as the fastest model finishes first.
    //  3. After all R1 resolve: fire R2 for non-quick tiers (same one-by-one reveal).
    //  4. After all R2 (or R1 for quick) resolve: fire Cal's closing.
    //  5. Cal's closing resolves → phase = "done".
    const handleConvene = useCallback((e: React.FormEvent | React.MouseEvent) => {
        e.preventDefault()
        const trimmedQ = question.trim()
        if (!trimmedQ) {
            inputRef.current?.focus()
            return
        }
        if (isSubmitting) return // already in flight

        // W2: capture the tier and specialists at the exact moment of
        // submission so they are locked for this session's lifecycle.
        const tierSnapshot: CouncilTier = activeTier
        const snapshotCount = COUNCIL_TIERS.find(t => t.id === tierSnapshot)!.specialists
        const snapshotIds = selectedSpecialistIds.slice(0, Math.min(snapshotCount, ALL_SPECIALIST_IDS.length))
        const specialistsForTier = getCouncilMembers(tierSnapshot, snapshotIds).map(s => ({
            id: s.id,
            name: s.name,
            title: s.title,
            tagline: s.tagline,
        }))

        // W2: clear the question input immediately on submit so the user
        // cannot accidentally re-send the previous question by hitting
        // submit a second time without typing new text.
        setQuestion("")
        setShowPicker(false)

        // Cal frames first — start in cal-framing so specialists show as queued.
        setSession({
            ...EMPTY_SESSION,
            phase: "pending",
            councilPhase: "cal-framing",
            submittedQuestion: trimmedQ,
            submittedTier: tierSnapshot,
            submittedSpecialistIds: snapshotIds,
        })

        setIsSubmitting(true)
        ;(async () => {
            try {
            // ── Step 0: Create the thread row immediately (progressive persistence) ──
            // Writing now means navigation-away-then-back can recover the session
            // from DB even while Cal and specialists are still in flight.
            // Fire-and-forget the threadId — we need it for progressive entry writes.
            let liveThreadId: string | null = null
            try {
                const startResult = await startMeetingThread({
                    topic: trimmedQ,
                    councilTier: tierSnapshot,
                    specialistIds: snapshotIds,
                })
                if (startResult.threadId) {
                    liveThreadId = startResult.threadId
                    // Pin the threadId in URL so a back-nav can recover.
                    // GOTCHA: router.replace() inside startTransition is
                    // unreliable — Next.js App Router batches the navigation
                    // update and may revert the URL on the next render when
                    // searchParams (from the server) re-asserts. Use
                    // window.history.replaceState directly: this is an
                    // imperative, synchronous DOM update that Next.js does
                    // not overwrite on re-render, matching how the Next.js
                    // docs recommend pinning non-navigation URL state.
                    const params = new URLSearchParams(window.location.search)
                    params.set("session", liveThreadId)
                    window.history.replaceState(null, "", `${pathname}?${params}`)
                }
            } catch {
                // Non-fatal — proceed without persistence; session still runs in memory
            }

            // ── Step 1: Cal frames the question first ────────────────────────
            // Specialists are queued (councilPhase: "cal-framing") while Cal runs.
            // Only after Cal's framing resolves do specialists start.
            const specialistNames = specialistsForTier.map(s => s.name)
            const useRound2 = tierSnapshot !== "quick"

            console.log("[BrainstormingCouncilView] Calling getCalFraming for question:", trimmedQ.slice(0, 80))
            const calFramingResult = await getCalFraming(trimmedQ, specialistNames)
            console.log("[BrainstormingCouncilView] getCalFraming result:", calFramingResult.ok, calFramingResult.ok ? "framing received" : calFramingResult.error)

            if (!calFramingResult.ok) {
                setSession(prev => ({
                    ...prev,
                    phase: "error",
                    councilPhase: "idle",
                    errorMessage: calFramingResult.error,
                }))
                return
            }

            setSession(prev => ({
                ...prev,
                hostOpening: calFramingResult.framing,
            }))

            if (liveThreadId) {
                addProgressiveMeetingEntry(liveThreadId, {
                    specialistId: "chief-of-staff",
                    specialistName: "Cal",
                    councilPosition: "opener",
                    roundNumber: 1,
                    content: calFramingResult.framing,
                    role: "specialist",
                }).catch(err => console.error("[BrainstormingCouncilView] Cal framing entry save failed:", err))
            }

            // Cal's framing is in — update her card and move to r1-running phase.
            // W77: specialists are NOW kicked off (gated on Cal resolving).
            setSession(prev => ({
                ...prev,
                councilPhase: "r1-running",
            }))

            const r1Promises = specialistsForTier.map(async (sp) => {
                const r1Result = await getSpecialistRound1Response(trimmedQ, sp)
                const resp: SpecialistResponse = r1Result.ok
                    ? r1Result.response
                    : {
                        id: sp.id,
                        name: sp.name,
                        title: sp.title,
                        modelLabel: "error",
                        response: `${sp.name} was unable to respond. Try again in a moment.`,
                    }
                setSession(prev => ({
                    ...prev,
                    specialistResponses: [...prev.specialistResponses.filter(r => r.id !== resp.id), resp],
                    arrivedIds: new Set([...prev.arrivedIds, resp.id]),
                }))
                if (liveThreadId) {
                    addProgressiveMeetingEntry(liveThreadId, {
                        specialistId: resp.id,
                        specialistName: resp.name,
                        councilPosition: "reactor",
                        roundNumber: 1,
                        content: resp.response,
                        role: "specialist",
                    }).catch(err => console.error("[BrainstormingCouncilView] R1 entry save failed:", err))
                }
                return resp
            })

            // Wait for all specialists to finish before proceeding to R2 / Cal closing
            const r1Responses = await Promise.all(r1Promises)
            const successfulR1 = r1Responses.filter(r => !r.response.includes("was unable to respond"))

            // ── Step 3: Round 2 (non-quick tiers) ─────────────────────────
            let finalSpecialistResponses: SpecialistResponse[] = r1Responses
            let hadRound2 = false

            if (useRound2 && successfulR1.length >= 2) {
                // W77: transition to r2-running phase before firing R2 calls.
                setSession(prev => ({ ...prev, councilPhase: "r2-running" }))

                const r2Promises = successfulR1.map(async (sp) => {
                    const peers = successfulR1
                        .filter(r => r.id !== sp.id)
                        .map(r => ({ name: r.name, response: r.response }))
                    const r2Result = await getSpecialistRound2Response(
                        trimmedQ,
                        { id: sp.id, name: sp.name, title: sp.title },
                        sp.response,
                        peers,
                    )
                    // W77: update this specialist's card with round2Response on resolve.
                    if (r2Result.ok) {
                        setSession(prev => ({
                            ...prev,
                            specialistResponses: prev.specialistResponses.map(r =>
                                r.id === r2Result.id ? { ...r, round2Response: r2Result.round2Response } : r
                            ),
                        }))
                        // Progressive persistence: write this specialist's R2 entry to DB
                        if (liveThreadId) {
                            addProgressiveMeetingEntry(liveThreadId, {
                                specialistId: sp.id,
                                specialistName: sp.name,
                                councilPosition: "reactor",
                                roundNumber: 2,
                                content: r2Result.round2Response,
                                role: "specialist",
                            }).catch(err => console.error("[BrainstormingCouncilView] R2 entry save failed:", err))
                        }
                        return { id: sp.id, round2Response: r2Result.round2Response }
                    }
                    return null
                })

                const r2Results = await Promise.all(r2Promises)
                const r2Map = new Map(
                    r2Results.filter((r): r is { id: string; round2Response: string } => r !== null)
                        .map(r => [r.id, r.round2Response])
                )
                finalSpecialistResponses = r1Responses.map(r => ({
                    ...r,
                    round2Response: r2Map.get(r.id),
                }))
                hadRound2 = r2Results.some(r => r !== null)
            }

            // ── Step 4: Cal's closing synthesis ───────────────────────────
            setSession(prev => ({ ...prev, councilPhase: "cal-closing" }))

            const r2ForCal = finalSpecialistResponses
                .filter(r => r.round2Response)
                .map(r => ({ name: r.name, response: r.round2Response! }))

            const calClosingResult = await getCalClosingResponse(
                trimmedQ,
                successfulR1.map(r => ({ name: r.name, response: r.response })),
                r2ForCal,
            )

            const hostClosing = calClosingResult.ok
                ? calClosingResult.closing
                : "Cal was unable to complete the synthesis. The responses above reflect the council's individual perspectives."

            // Persist Cal's closing entry before marking done
            if (liveThreadId) {
                await addProgressiveMeetingEntry(liveThreadId, {
                    specialistId: "chief-of-staff",
                    specialistName: "Cal",
                    councilPosition: "host-close",
                    roundNumber: hadRound2 ? 2 : 1,
                    content: hostClosing,
                    role: "specialist",
                }).catch(err => console.error("[BrainstormingCouncilView] Cal closing entry save failed:", err))
            }

            // ── Step 5: Mark done + persist ───────────────────────────────
            setSession(prev => ({
                ...prev,
                phase: "done",
                councilPhase: "done",
                specialistResponses: finalSpecialistResponses,
                hostClosing,
                hadRound2,
                savedThreadId: liveThreadId,
            }))

            // Reset asset generation buttons + cached URLs for the new session
            setGraphicStatus("idle")
            setAudioStatus("idle")
            setAudioReadyVisible(false)
            setGeneratedCoverUrl(null)
            setGeneratedAudioUrl(null)
            setGeneratedAudioClips(null)

            // W1 + W6 + W7: finalise persistence and trigger after() jobs.
            //
            // If we have a liveThreadId (startMeetingThread succeeded earlier),
            // use completeMeetingThread — entries are already in DB progressively,
            // so this just flips status to 'complete' and schedules cover/audio.
            //
            // Fallback: if startMeetingThread failed, call the original
            // createMeetingThread which does the full bulk-insert in one shot.
            try {
                if (liveThreadId) {
                    const completeResult = await completeMeetingThread(liveThreadId)
                    if (completeResult.ok) {
                        // Strip ?session= from URL now that the thread is complete.
                        // Use window.history.replaceState for the same reason as
                        // the pin above — avoids App Router re-render reversion.
                        const params = new URLSearchParams(window.location.search)
                        params.delete("session")
                        const newUrl = params.toString() ? `${pathname}?${params}` : pathname
                        window.history.replaceState(null, "", newUrl)
                    }
                } else {
                    // Fallback: no liveThreadId — bulk-insert the whole session
                    const entries = [
                        {
                            specialistId: "chief-of-staff",
                            specialistName: "Cal",
                            councilPosition: "opener" as const,
                            roundNumber: 1,
                            content: calFramingResult.framing,
                            role: "specialist" as const,
                        },
                        ...finalSpecialistResponses.map((resp: SpecialistResponse) => ({
                            specialistId: resp.id,
                            specialistName: resp.name,
                            councilPosition: "reactor" as const,
                            roundNumber: 1,
                            content: resp.response,
                            role: "specialist" as const,
                        })),
                        ...(hadRound2
                            ? finalSpecialistResponses
                                .filter((resp: SpecialistResponse) => resp.round2Response)
                                .map((resp: SpecialistResponse) => ({
                                    specialistId: resp.id,
                                    specialistName: resp.name,
                                    councilPosition: "reactor" as const,
                                    roundNumber: 2,
                                    content: resp.round2Response!,
                                    role: "specialist" as const,
                                }))
                            : []),
                        {
                            specialistId: "chief-of-staff",
                            specialistName: "Cal",
                            councilPosition: "host-close" as const,
                            roundNumber: hadRound2 ? 2 : 1,
                            content: hostClosing,
                            role: "specialist" as const,
                        },
                    ]
                    const saveResult = await createMeetingThread({
                        topic: trimmedQ,
                        councilTier: tierSnapshot,
                        specialistIds: specialistsForTier.map(s => s.id),
                        entries,
                    })
                    if (saveResult?.threadId) {
                        setSession(prev => ({ ...prev, savedThreadId: saveResult.threadId }))
                    }
                }
                // Bump the refresh key so MeetingHistory re-fetches.
                setHistoryRefreshKey(k => k + 1)
            } catch (saveErr) {
                // Non-fatal — the session content is still displayed,
                // saving is best-effort and must never crash the UI.
                console.error("[BrainstormingCouncilView] Failed to finalise session:", saveErr)
            }
            } catch (orchestrationErr) {
                console.error("[BrainstormingCouncilView] Council orchestration error:", orchestrationErr)
                setSession(prev => ({
                    ...prev,
                    phase: "error",
                    councilPhase: "idle",
                    errorMessage: orchestrationErr instanceof Error
                        ? orchestrationErr.message
                        : "Something went wrong starting the council. Please try again.",
                }))
            } finally {
                setIsSubmitting(false)
            }
        })()
    }, [question, isSubmitting, activeTier, selectedSpecialistIds, pathname, router])

    function handleReset() {
        setSession(EMPTY_SESSION)
        setIsSubmitting(false)
        setGraphicStatus("idle")
        setAudioStatus("idle")
        setAudioReadyVisible(false)
        setGeneratedCoverUrl(null)
        setGeneratedAudioUrl(null)
        setGeneratedAudioClips(null)
        setShowPicker(false)
        // Strip ?session= from URL so the reset is clean.
        // Use window.history.replaceState — avoids App Router re-render reversion.
        const params = new URLSearchParams(window.location.search)
        if (params.has("session")) {
            params.delete("session")
            const newUrl = params.toString() ? `${pathname}?${params}` : pathname
            window.history.replaceState(null, "", newUrl)
        }
        // Return focus to the question input so the next question
        // is immediately ready to type without an extra click.
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    return (
        <div className="bc-page">
            {/* ── CSS custom properties scoped to this component ── */}
            <style>{`
                .bc-page {
                    padding: 28px 0 80px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
                    --bc-fg: #292524;
                    --bc-fg-muted: #78716c;
                    --bc-fg-subtle: #a8a29e;
                    --bc-surface: #ffffff;
                    --bc-surface-soft: #fafaf9;
                    --bc-surface-muted: #f5f4f2;
                    --bc-border: #e7e5e4;
                    --bc-border-soft: #f0efed;
                    --bc-border-strong: #d6d3d1;
                    --bc-brand: #ff4500;
                    --bc-brand-soft: #fff0ea;
                    --bc-brand-dim: #ffdcc7;
                    --bc-blue: #3b82f6;
                    --bc-blue-soft: #eff6ff;
                    --bc-blue-dim: #bfdbfe;
                    --bc-success: #16a34a;
                    --bc-opus: #ff4500;
                    --bc-opus-soft: #fff4ee;
                    --bc-opus-dim: #fed7aa;
                    --bc-shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
                    --bc-shadow-sm: 0 2px 6px rgba(0,0,0,0.05);
                    --bc-shadow-md: 0 6px 16px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04);
                    --bc-shadow-lg: 0 14px 32px rgba(0,0,0,0.09), 0 3px 8px rgba(0,0,0,0.05);
                }
                /* ─── Page header ─── */
                .bc-page-head { margin-bottom: 22px; }
                .bc-page-head h1 {
                    margin: 0 0 6px;
                    font-size: 28px;
                    font-weight: 800;
                    letter-spacing: -0.025em;
                    color: var(--bc-fg);
                }
                .bc-page-head p {
                    margin: 0;
                    color: var(--bc-fg-muted);
                    font-size: 14px;
                    max-width: 720px;
                    line-height: 1.6;
                }
                /* ─── Tier picker ─── */
                .bc-tier-picker {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 10px;
                    margin-bottom: 22px;
                }
                .bc-tier-btn {
                    background: var(--bc-surface);
                    border: 1.5px solid var(--bc-border);
                    border-radius: 12px;
                    padding: 12px 14px;
                    cursor: pointer;
                    text-align: left;
                    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
                    box-shadow: var(--bc-shadow-xs);
                }
                .bc-tier-btn:hover {
                    border-color: var(--bc-brand);
                    box-shadow: var(--bc-shadow-sm);
                }
                .bc-tier-btn.active {
                    border-color: var(--bc-brand);
                    background: var(--bc-brand-soft);
                    box-shadow: 0 0 0 2px var(--bc-brand-dim);
                }
                .bc-tier-btn .bc-tier-label {
                    font-size: 13px;
                    font-weight: 700;
                    color: var(--bc-fg);
                    margin-bottom: 3px;
                }
                .bc-tier-btn.active .bc-tier-label { color: var(--bc-brand); }
                .bc-tier-btn .bc-tier-subtitle {
                    font-size: 11.5px;
                    color: var(--bc-fg-muted);
                    font-weight: 500;
                }
                /* ─── Question bar ─── */
                .bc-qbar {
                    background: var(--bc-surface);
                    border: 1px solid var(--bc-border);
                    border-radius: 14px;
                    padding: 14px 16px;
                    box-shadow: var(--bc-shadow-sm);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .bc-qbar-top {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                .bc-qbar .bc-qlabel {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 12px;
                    font-weight: 700;
                    color: var(--bc-fg-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    padding-top: 10px;
                    flex-shrink: 0;
                }
                .bc-qbar .bc-qlabel .bc-icon {
                    width: 28px; height: 28px; border-radius: 100%;
                    background: var(--bc-brand-soft);
                    color: var(--bc-brand);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 14px;
                    font-weight: 700;
                }
                .bc-qbar textarea {
                    border: none;
                    font-size: 16px;
                    font-family: inherit;
                    color: var(--bc-fg);
                    background: transparent;
                    width: 100%;
                    padding: 8px 4px;
                    font-weight: 500;
                    resize: none;
                    min-height: 48px;
                    line-height: 1.55;
                    overflow: hidden;
                }
                .bc-qbar textarea:focus { outline: none; }
                .bc-qbar-bottom {
                    display: flex;
                    justify-content: flex-end;
                    align-items: center;
                    gap: 10px;
                    padding-top: 4px;
                    border-top: 1px solid var(--bc-border-soft);
                }
                .bc-qbar .bc-convene {
                    background: var(--bc-brand);
                    color: #fff;
                    border: none;
                    padding: 10px 22px;
                    border-radius: 10px;
                    font-size: 13.5px;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    font-family: inherit;
                    box-shadow: 0 1px 0 rgba(255,69,0,0.5) inset, 0 6px 14px rgba(255,69,0,0.20);
                }
                .bc-qbar .bc-convene:hover { background: #e63e00; }
                /* ─── Specialist picker panel ─── */
                .bc-picker {
                    background: var(--bc-surface);
                    border: 1px solid var(--bc-border);
                    border-radius: 14px;
                    padding: 16px 18px;
                    margin-bottom: 20px;
                    box-shadow: var(--bc-shadow-sm);
                }
                .bc-picker-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 14px;
                }
                .bc-picker-head .bc-picker-title {
                    font-size: 12px;
                    font-weight: 700;
                    color: var(--bc-fg);
                    text-transform: uppercase;
                    letter-spacing: 0.07em;
                }
                .bc-picker-head .bc-picker-hint {
                    font-size: 11.5px;
                    color: var(--bc-fg-muted);
                }
                .bc-picker-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                }
                .bc-picker-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 10px;
                    border: 1px solid var(--bc-border);
                    border-radius: 8px;
                    cursor: pointer;
                    background: var(--bc-surface);
                    transition: border-color 0.12s, background 0.12s;
                    font-family: inherit;
                    text-align: left;
                }
                .bc-picker-item:hover { border-color: var(--bc-brand); }
                .bc-picker-item.selected {
                    border-color: var(--bc-brand);
                    background: var(--bc-brand-soft);
                }
                .bc-picker-item .bc-pi-check {
                    width: 16px; height: 16px;
                    border: 1.5px solid var(--bc-border-strong);
                    border-radius: 4px;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                    font-size: 11px;
                    color: transparent;
                    background: var(--bc-surface);
                }
                .bc-picker-item.selected .bc-pi-check {
                    background: var(--bc-brand);
                    border-color: var(--bc-brand);
                    color: #fff;
                }
                .bc-picker-item .bc-pi-label {
                    flex: 1;
                    min-width: 0;
                    display: inline-flex;
                    align-items: baseline;
                    gap: 6px;
                }
                .bc-picker-item .bc-pi-name {
                    font-size: 12.5px;
                    font-weight: 700;
                    color: var(--bc-fg);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .bc-picker-item .bc-pi-role {
                    font-size: 10.5px;
                    color: var(--bc-fg-muted);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                /* ─── Loading animation ─── */
                @keyframes bc-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.45; }
                }
                .bc-loading-pulse {
                    animation: bc-pulse 1.4s ease-in-out infinite;
                }
                /* ─── Audio ready callout ─── */
                .bc-audio-ready {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 16px;
                    background: var(--bc-blue-soft);
                    border: 1px solid var(--bc-blue-dim);
                    border-radius: 10px;
                    margin-bottom: 12px;
                    font-size: 13.5px;
                    font-weight: 600;
                    color: var(--bc-blue);
                }
                .bc-audio-ready button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: var(--bc-fg-muted);
                    font-size: 16px;
                    line-height: 1;
                    padding: 0 4px;
                }
                /* ─── Section labels ─── */
                .bc-section-label {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin: 36px 0 14px;
                }
                .bc-section-label .bc-step {
                    width: 24px; height: 24px; border-radius: 100%;
                    background: var(--bc-fg);
                    color: #fff;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 12px; font-weight: 700;
                    flex-shrink: 0;
                }
                .bc-section-label h2 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: var(--bc-fg);
                }
                .bc-section-label .bc-hint {
                    margin-left: auto;
                    font-size: 12px;
                    color: var(--bc-fg-muted);
                    white-space: nowrap;
                }
                .bc-section-label .bc-rule {
                    flex: 1;
                    height: 1px;
                    background: var(--bc-border);
                }
                /* Mobile: drop the rule line + hint so the heading gets the
                   full row instead of being squeezed into a 4-word column. */
                @media (max-width: 640px) {
                    .bc-section-label .bc-rule { display: none; }
                    .bc-section-label .bc-hint { display: none; }
                    .bc-section-label h2 { flex: 1; min-width: 0; }
                }
                /* ─── Fiona host card ─── */
                .bc-fiona-card {
                    background: linear-gradient(180deg, #fff4ee 0%, #ffffff 70%);
                    border: 1px solid var(--bc-opus-dim);
                    border-radius: 16px;
                    padding: 22px 26px;
                    box-shadow: var(--bc-shadow-md);
                    position: relative;
                    overflow: hidden;
                }
                .bc-fiona-card::before {
                    content: "";
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, var(--bc-opus), var(--bc-brand));
                }
                .bc-fiona-head {
                    display: flex; align-items: center; gap: 14px;
                    margin-bottom: 14px;
                }
                .bc-fiona-head .bc-avatar {
                    width: 56px; height: 56px; border-radius: 100%;
                    background: linear-gradient(135deg, #fff4ee 0%, #fed7aa 100%);
                    color: var(--bc-opus);
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 800; font-size: 18px;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 2px var(--bc-opus-dim);
                    flex-shrink: 0;
                }
                .bc-fiona-head .bc-who { flex: 1; }
                .bc-fiona-head .bc-who .bc-name {
                    font-size: 17px; font-weight: 800; letter-spacing: -0.01em;
                    display: flex; align-items: center; gap: 10px;
                    color: var(--bc-fg);
                }
                .bc-fiona-head .bc-who .bc-name .bc-role-chip {
                    font-size: 10.5px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    background: var(--bc-opus-soft);
                    color: var(--bc-opus);
                    padding: 3px 8px;
                    border-radius: 4px;
                    border: 1px solid var(--bc-opus-dim);
                }
                .bc-fiona-head .bc-who .bc-role {
                    font-size: 12.5px;
                    color: var(--bc-fg-muted);
                    margin-top: 2px;
                }
                /* ─── Fiona empty state ─── */
                .bc-fiona-empty {
                    background: var(--bc-surface);
                    border: 1.5px dashed var(--bc-opus-dim);
                    border-radius: 14px;
                    padding: 28px 26px;
                    text-align: center;
                }
                .bc-fiona-empty .bc-stub-avatar {
                    width: 48px; height: 48px;
                    border-radius: 100%;
                    background: var(--bc-opus-soft);
                    color: var(--bc-opus);
                    display: inline-flex; align-items: center; justify-content: center;
                    font-weight: 800; font-size: 16px;
                    margin-bottom: 12px;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 2px var(--bc-opus-dim);
                }
                .bc-fiona-empty p {
                    margin: 0; font-size: 13.5px; color: var(--bc-fg-muted); line-height: 1.6;
                }
                .bc-fiona-empty p strong { color: var(--bc-fg); }
                /* ─── Council grid ─── */
                .bc-council-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                }
                .bc-council-grid.specialists-3 {
                    grid-template-columns: repeat(3, 1fr);
                }
                /* ─── Specialist card ─── */
                .bc-specialist-card {
                    background: var(--bc-surface);
                    border: 1px solid var(--bc-border);
                    border-radius: 14px;
                    padding: 18px 20px;
                    box-shadow: var(--bc-shadow-xs);
                    display: flex;
                    flex-direction: column;
                    transition: box-shadow 0.15s, transform 0.15s;
                }
                .bc-specialist-card:hover {
                    box-shadow: var(--bc-shadow-md);
                    transform: translateY(-1px);
                }
                .bc-specialist-head {
                    display: flex; align-items: flex-start; gap: 12px;
                    margin-bottom: 12px;
                }
                .bc-specialist-head .bc-sp-avatar {
                    width: 44px; height: 44px;
                    border-radius: 100%;
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 800; font-size: 14px;
                    flex-shrink: 0;
                    border: 2px solid #fff;
                }
                .bc-av-sage  { background: #e0f2fe; color: #0c4a6e; box-shadow: 0 0 0 2px #bae6fd; }
                .bc-av-finn  { background: #ecfccb; color: #365314; box-shadow: 0 0 0 2px #d9f99d; }
                .bc-av-sal   { background: #fee2e2; color: #7f1d1d; box-shadow: 0 0 0 2px #fecaca; }
                .bc-av-max   { background: #f5f4f2; color: #44403c; box-shadow: 0 0 0 2px #d6d3d1; }
                .bc-av-cal   { background: #f0fdf4; color: #14532d; box-shadow: 0 0 0 2px #bbf7d0; }
                .bc-av-fiona { background: linear-gradient(135deg, #fff4ee 0%, #fed7aa 100%); color: #ff4500; box-shadow: 0 0 0 2px #fed7aa; }
                .bc-av-default { background: #f5f4f2; color: #44403c; box-shadow: 0 0 0 2px #d6d3d1; }
                .bc-specialist-head .bc-sp-meta { flex: 1; min-width: 0; }
                .bc-specialist-head .bc-name-row {
                    display: flex; align-items: center; gap: 8px;
                    margin-bottom: 2px;
                }
                .bc-specialist-head .bc-sp-name {
                    font-size: 15.5px;
                    font-weight: 800;
                    letter-spacing: -0.01em;
                    color: var(--bc-fg);
                }
                .bc-specialist-head .bc-sp-role {
                    font-size: 12px;
                    color: var(--bc-fg-muted);
                    margin-bottom: 6px;
                }
                /* ─── Specialist card body ─── */
                .bc-sp-body {
                    font-size: 13.5px;
                    line-height: 1.65;
                    color: var(--bc-fg);
                    flex: 1;
                }
                /* ─── Sig close ─── */
                .bc-sig-close {
                    margin-top: 14px;
                    padding-top: 12px;
                    border-top: 1px solid var(--bc-border-soft);
                    font-size: 12.5px;
                }
                .bc-sig-close .bc-sig-label {
                    font-weight: 700;
                    color: var(--bc-fg);
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 6px;
                }
                .bc-sig-close.bc-sig-sage .bc-sig-label { color: #075985; }
                .bc-sig-close.bc-sig-finn .bc-sig-label { color: #4d7c0f; }
                .bc-sig-close.bc-sig-sal  .bc-sig-label { color: #b91c1c; }
                .bc-sig-close.bc-sig-max  .bc-sig-label { color: #44403c; }
                .bc-sig-close.bc-sig-cal  .bc-sig-label { color: #14532d; }
                .bc-sig-close.bc-sig-fiona .bc-sig-label { color: #ff4500; }
                .bc-sig-close .bc-sig-body { color: var(--bc-fg-muted); line-height: 1.6; }
                /* ─── Empty card (slot) ─── */
                .bc-empty-card {
                    background: var(--bc-surface);
                    border: 1.5px dashed var(--bc-border-strong);
                    border-radius: 14px;
                    padding: 40px 28px;
                    text-align: center;
                    color: var(--bc-fg-muted);
                }
                .bc-empty-card .bc-empty-icon {
                    width: 56px; height: 56px;
                    background: var(--bc-surface-muted);
                    border-radius: 100%;
                    display: inline-flex; align-items: center; justify-content: center;
                    margin-bottom: 14px;
                    font-size: 22px;
                    color: var(--bc-fg-subtle);
                }
                .bc-empty-card h3 {
                    margin: 0 0 6px;
                    color: var(--bc-fg);
                    font-size: 16px;
                    font-weight: 700;
                }
                .bc-empty-card p {
                    margin: 0 auto;
                    max-width: 240px;
                    font-size: 13px;
                    line-height: 1.6;
                }
                /* ─── Closing held state ─── */
                .bc-closing-held {
                    margin-top: 28px;
                    text-align: center;
                    padding: 30px 20px;
                    background: var(--bc-surface);
                    border: 1.5px dashed var(--bc-opus-dim);
                    border-radius: 14px;
                }
                .bc-closing-held .bc-label {
                    font-size: 11.5px;
                    font-weight: 700;
                    color: var(--bc-opus);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 8px;
                }
                .bc-closing-held p {
                    color: var(--bc-fg-muted);
                    font-size: 13px;
                    margin: 0;
                }
                /* ─── Fiona closing card ─── */
                .bc-fiona-card.bc-closing {
                    background: linear-gradient(180deg, #fff7ed 0%, #ffffff 60%);
                    border-color: var(--bc-brand-dim);
                }
                .bc-fiona-card.bc-closing::before {
                    background: linear-gradient(90deg, var(--bc-brand), var(--bc-opus));
                }
                .bc-fiona-card.bc-closing .bc-avatar {
                    background: linear-gradient(135deg, var(--bc-brand-soft) 0%, var(--bc-brand-dim) 100%);
                    color: var(--bc-brand);
                    box-shadow: 0 0 0 2px var(--bc-brand-dim);
                }
                .bc-fiona-card.bc-closing .bc-role-chip {
                    background: var(--bc-brand-soft);
                    color: var(--bc-brand);
                    border-color: var(--bc-brand-dim);
                }
                /* ─── Tier hint tooltip ─── */
                .bc-tier-hint {
                    font-size: 11.5px;
                    color: var(--bc-fg-muted);
                    margin-top: 6px;
                    line-height: 1.5;
                }
                /* ─── Suggestion chips (pre-fill the question) ─── */
                .bc-suggestions {
                    margin: 18px 0 22px;
                }
                .bc-suggestions-label {
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--bc-fg-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 10px;
                }
                .bc-suggestions-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
                .bc-suggestion-chip {
                    background: var(--bc-surface);
                    border: 1px solid var(--bc-border);
                    border-radius: 10px;
                    padding: 10px 14px;
                    cursor: pointer;
                    text-align: left;
                    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 6px;
                    font-family: inherit;
                }
                .bc-suggestion-chip:hover {
                    border-color: var(--bc-brand);
                    box-shadow: var(--bc-shadow-sm);
                    transform: translateY(-1px);
                }
                .bc-suggestion-chip:active {
                    transform: translateY(0);
                }
                .bc-suggestion-cat {
                    font-size: 9.5px;
                    font-weight: 700;
                    color: var(--bc-brand);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    padding: 2px 7px;
                    border-radius: 100px;
                    background: var(--bc-brand-soft);
                    align-self: flex-start;
                }
                .bc-suggestion-text {
                    font-size: 13px;
                    color: var(--bc-fg);
                    line-height: 1.4;
                    font-weight: 500;
                }
                /* ─── Responsive ─── */
                @media (max-width: 900px) {
                    .bc-tier-picker { grid-template-columns: repeat(3, 1fr); }
                }
                @media (max-width: 780px) {
                    .bc-page { padding: 18px 0 60px; }
                    .bc-tier-picker { grid-template-columns: repeat(2, 1fr); }
                    .bc-council-grid { grid-template-columns: 1fr; }
                    .bc-council-grid.specialists-3 { grid-template-columns: 1fr; }
                    .bc-suggestions-grid { grid-template-columns: 1fr; }
                    .bc-picker-grid { grid-template-columns: repeat(2, 1fr); }
                }
                @media (max-width: 480px) {
                    .bc-picker-grid { grid-template-columns: 1fr; }
                }
            `}</style>

            {/* Tristan 2026-04-27: removed Home › Brainstorming breadcrumb +
                added the red-bar accent to the title so this page matches the
                canonical My Profile page-header pattern.
                2026-04-28: swapped inline styles to canonical typography classes
                so the header matches Investor Match / Suppliers / My Profile. */}
            <div className="bc-page-head" style={{ marginBottom: "16px" }}>
                <div className={typography.pageHeader} style={{ marginBottom: "4px" }}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Brainstorming Council</h1>
                </div>
                <p style={{ paddingLeft: "18px" }}>You ask one question. Cal frames it, {activeTier === "quick" ? "two specialists chime in" : activeTier === "full" ? "three specialists chime in" : activeTier === "deep" ? "four specialists chime in from different perspectives" : activeTier === "strategy" ? "five specialists chime in from different perspectives" : "all twelve specialists weigh in"} in parallel, and Cal closes with what they agreed on, where they disagreed, and the one thing to do this week.</p>
            </div>

            {/* ── Tier picker ── */}
            <div className="bc-tier-picker" role="radiogroup" aria-label="Council depth">
                {COUNCIL_TIERS.map((tier) => (
                    <button
                        key={tier.id}
                        role="radio"
                        aria-checked={activeTier === tier.id}
                        className={`bc-tier-btn${activeTier === tier.id ? " active" : ""}`}
                        onClick={() => setActiveTier(tier.id)}
                        type="button"
                    >
                        <div className="bc-tier-label">{tier.label}</div>
                        <div className="bc-tier-subtitle">{tier.subtitle}</div>
                    </button>
                ))}
            </div>
            {/* Active tier hint */}
            <p className="bc-tier-hint">{COUNCIL_TIERS.find(t => t.id === activeTier)?.hint}</p>

            {/* ── Suggestion chips — pre-fill the question + match the tier to the question depth */}
            <div className="bc-suggestions" aria-label="Suggested questions">
                <div className="bc-suggestions-label">Try one of these to start</div>
                <div className="bc-suggestions-grid">
                    {SUGGESTION_PROMPTS.map((s) => (
                        <button
                            key={s.text}
                            type="button"
                            className="bc-suggestion-chip"
                            onClick={() => {
                                // W67: chip click ONLY populates the question.
                                // Tier is set only by clicking a tier card.
                                setQuestion(s.text)
                                inputRef.current?.focus()
                            }}
                        >
                            <span className="bc-suggestion-cat">{s.category}</span>
                            <span className="bc-suggestion-text">{s.text}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Question bar — W66: vertical stack (textarea above, Convene below) ── */}
            <form className="bc-qbar" onSubmit={handleConvene} aria-label="Council question" style={{ marginBottom: showPicker ? "12px" : "28px" }}>
                <div className="bc-qbar-top">
                    <div className="bc-qlabel">
                        <span className="bc-icon">?</span>
                        What&apos;s the question
                    </div>
                    <textarea
                        ref={inputRef}
                        value={question}
                        onChange={(e) => {
                            setQuestion(e.target.value)
                            // auto-grow: reset height then set to scrollHeight
                            e.target.style.height = "auto"
                            e.target.style.height = `${e.target.scrollHeight}px`
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                handleConvene(e as unknown as React.FormEvent)
                            }
                        }}
                        placeholder="e.g. Should I raise £2M now or hit 100 paying users first?"
                        aria-label="Your question for the council"
                        rows={2}
                    />
                </div>
                <div className="bc-qbar-bottom">
                    {/* W57: "Choose your council" toggle */}
                    <button
                        type="button"
                        onClick={() => setShowPicker(p => !p)}
                        style={{
                            background: "none",
                            border: "1px solid var(--bc-border)",
                            borderRadius: "8px",
                            padding: "7px 14px",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            color: "var(--bc-fg-muted)",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "border-color 0.12s, color 0.12s",
                        }}
                    >
                        {showPicker ? "Close picker" : "Choose your council"}
                    </button>
                    {/* W10: dual-wire onClick + form onSubmit */}
                    <button
                        className="bc-convene"
                        type="submit"
                        onClick={handleConvene}
                        disabled={isSubmitting}
                        style={isSubmitting ? { opacity: 0.6, cursor: "wait" } : undefined}
                    >
                        {isSubmitting ? "Convening…" : "Convene the council  →"}
                    </button>
                </div>
            </form>

            {/* W57: Manual specialist picker — shown when user clicks "Choose your council" */}
            {showPicker && (
                <div className="bc-picker" style={{ marginBottom: "28px" }}>
                    <div className="bc-picker-head">
                        <span className="bc-picker-title">Choose your council</span>
                        <span className="bc-picker-hint">
                            {(() => {
                                const max = Math.min(COUNCIL_TIERS.find(t => t.id === activeTier)!.specialists, ALL_SPECIALIST_IDS.length)
                                return `Pick up to ${max} — ${selectedSpecialistIds.filter(id => (ALL_SPECIALIST_IDS as readonly string[]).includes(id)).length} selected`
                            })()}
                        </span>
                    </div>
                    <div className="bc-picker-grid">
                        {(ALL_SPECIALIST_IDS as readonly string[]).map(id => {
                            const sp = SPECIALISTS.find(s => s.id === id)
                            if (!sp) return null
                            const isSelected = selectedSpecialistIds.includes(id)
                            const max = Math.min(COUNCIL_TIERS.find(t => t.id === activeTier)!.specialists, ALL_SPECIALIST_IDS.length)
                            const atMax = selectedSpecialistIds.length >= max && !isSelected
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    className={`bc-picker-item${isSelected ? " selected" : ""}`}
                                    disabled={atMax}
                                    style={atMax ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                                    onClick={() => {
                                        setSelectedSpecialistIds(prev => {
                                            if (prev.includes(id)) return prev.filter(x => x !== id)
                                            if (prev.length >= max) return prev
                                            return [...prev, id]
                                        })
                                    }}
                                >
                                    <span className="bc-pi-check">{isSelected ? "✓" : ""}</span>
                                    <span className="bc-pi-label">
                                        <span className="bc-pi-name">{sp.name}</span>
                                        <span className="bc-pi-role">{sp.title}</span>
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                SECTION 1 — Cal frames the question
            ══════════════════════════════════════════════════════════════ */}
            <div className="bc-section-label">
                <span className="bc-step">1</span>
                <h2>
                    {session.phase === "idle"
                        ? "Cal frames the question"
                        : session.councilPhase === "cal-framing"
                        ? "Cal is framing the question…"
                        : "Cal’s framing"}
                </h2>
                <span className="bc-rule" />
                <span className="bc-hint">Host &middot; runs every brainstorm</span>
            </div>

            {/* W77: Cal's card shows real text as soon as cal-framing resolves,
                even while specialist calls are still in flight. The previous
                code only showed real text when phase==="done" (everything done). */}
            {session.phase === "idle" ? (
                /* Pre-submission: show Cal's role / what she does */
                <div className="bc-fiona-card">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-cal`}>CA</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                {CAL?.name ?? "Cal"}
                                <span className="bc-role-chip">Host &middot; Chief of Staff</span>
                            </div>
                            <div className="bc-role">Fractional Forge &mdash; Chief of Staff &middot; operational execution</div>
                        </div>
                    </div>
                    <p style={{ fontSize: "14px", lineHeight: "1.7", margin: "0 0 14px", color: "var(--bc-fg)" }}>
                        Cal opens every brainstorm. She reads your question, names what is actually worth
                        disagreeing about, and calls in the specialists best suited to answer it. She
                        comes back at the end with where they agreed, where they split, and the one concrete
                        thing to do this week.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: "10px" }}>
                        {[
                            "Cal frames the question before anyone gives you an answer — so you are not handed five answers to a question that was never quite right.",
                            "Cal calls in three to five specialists from different model lineages, in parallel — no single perspective dominates.",
                            "Cal closes with a synthesis that names the sharpest disagreement and lands a single next action.",
                        ].map((item, i) => (
                            <li
                                key={i}
                                style={{
                                    background: "rgba(255,255,255,0.7)",
                                    border: "1px solid var(--bc-opus-dim)",
                                    borderLeft: "3px solid var(--bc-opus)",
                                    borderRadius: "8px",
                                    padding: "10px 14px",
                                    fontSize: "13.5px",
                                    lineHeight: "1.55",
                                    display: "grid",
                                    gridTemplateColumns: "auto 1fr",
                                    gap: "10px",
                                    alignItems: "baseline",
                                }}
                            >
                                <span style={{ fontWeight: 800, color: "var(--bc-opus)", fontSize: "12px" }}>
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                    <p style={{ fontStyle: "italic", color: "var(--bc-fg-muted)", fontSize: "13.5px", margin: "14px 0 0", paddingTop: "14px", borderTop: "1px dashed var(--bc-opus-dim)" }}>
                        Type your question above and click &ldquo;Convene the council&rdquo; to start.
                    </p>
                </div>
            ) : session.phase === "error" ? (
                /* Error state */
                <div className="bc-fiona-empty">
                    <div className="bc-stub-avatar" style={{ background: "#fee2e2", color: "#b91c1c" }}>!</div>
                    <p>
                        <strong>The council could not be convened.</strong><br />
                        {session.errorMessage || "Something went wrong — please try again."}{" "}
                        <button
                            type="button"
                            onClick={handleReset}
                            style={{ color: "var(--bc-brand)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                        >
                            Try again
                        </button>
                    </p>
                </div>
            ) : session.councilPhase === "cal-framing" ? (
                /* W77: Cal's call is in flight — show animated loading placeholder.
                   Specialists are NOT running yet; this is the only loading card visible. */
                <div className="bc-fiona-empty">
                    <div className="bc-stub-avatar bc-loading-pulse">CA</div>
                    <p>
                        <strong>Cal is reading your question and framing what is worth disagreeing about.</strong><br />
                        <span className="bc-loading-pulse" style={{ fontStyle: "italic", color: "var(--bc-fg-muted)" }}>
                            {LOADING_LINES[loadingLineIdx]}
                        </span>
                    </p>
                </div>
            ) : (
                /* W77: Cal has resolved — show her real framing card even while
                   specialists are still loading (councilPhase = r1-running etc.) */
                <div className="bc-fiona-card">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-cal`}>CA</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                {CAL?.name ?? "Cal"}
                                <span className="bc-role-chip">Host &middot; Chief of Staff</span>
                            </div>
                            <div className="bc-role">Fractional Forge &mdash; Chief of Staff &middot; operational execution</div>
                        </div>
                    </div>
                    {/* Question callout — anchors context so the reader
                        does not lose sight of what was asked once the
                        brainstorm is in full flow. */}
                    {session.submittedQuestion && (
                        <div style={{
                            margin: "0 0 16px",
                            paddingLeft: "12px",
                            borderLeft: "3px solid rgba(255,69,0,0.4)",
                        }}>
                            <div style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--bc-fg-muted)",
                                marginBottom: "5px",
                            }}>Question</div>
                            <p style={{
                                margin: 0,
                                fontSize: "13.5px",
                                fontStyle: "italic",
                                lineHeight: "1.6",
                                color: "var(--bc-fg-muted)",
                            }}>{session.submittedQuestion}</p>
                        </div>
                    )}
                    <p style={{ fontSize: "14.5px", lineHeight: "1.75", margin: 0, color: "var(--bc-fg)", whiteSpace: "pre-wrap" }}>
                        {session.hostOpening}
                    </p>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                SECTION 2 — The council chimes in
            ══════════════════════════════════════════════════════════════ */}
            <div className="bc-section-label">
                <span className="bc-step">2</span>
                <h2>
                    {session.councilPhase === "cal-framing"
                        ? "The council — queued, waiting for Cal"
                        : session.councilPhase === "r1-running"
                        ? "The council is chiming in…"
                        : "The council"}
                </h2>
                <span className="bc-rule" />
                <span className="bc-hint">
                    {councilMembers.length} specialist{councilMembers.length !== 1 ? "s" : ""} &middot; ~{COUNCIL_TIERS.find(t => t.id === activeTier)?.subtitle.match(/~\d+s/)?.[0] ?? "12s"} end-to-end
                </span>
            </div>

            {session.phase === "idle" ? (
                /* Pre-submission: show the specialist roster with their personas */
                <div className={`bc-council-grid${councilMembers.length === 3 ? " specialists-3" : ""}`}>
                    {councilMembers.map((specialist) => {
                        const avatarClass = getAvatarClass(specialist.id)
                        const sigLabel = getSigCloseLabel(specialist.id)
                        const initials = specialist.name.slice(0, 2).toUpperCase()
                        const sigColorMap: Record<string, string> = {
                            "strategist":          "bc-sig-sage",
                            "finance-lead":        "bc-sig-finn",
                            "sales-lead":          "bc-sig-sal",
                            "cto":                 "bc-sig-max",
                            "chief-of-staff":      "bc-sig-cal",
                            "fundraising-advisor": "bc-sig-fiona",
                        }
                        const sigColorClass = sigColorMap[specialist.id] ?? ""

                        return (
                            <div key={specialist.id} className="bc-specialist-card">
                                <div className="bc-specialist-head">
                                    <div className={`bc-sp-avatar ${avatarClass}`}>{initials}</div>
                                    <div className="bc-sp-meta">
                                        <div className="bc-name-row">
                                            <span className="bc-sp-name">{specialist.name}</span>
                                        </div>
                                        <div className="bc-sp-role">{specialist.title}</div>
                                    </div>
                                </div>
                                <div className="bc-sp-body">
                                    <p style={{ margin: "0 0 10px", color: "var(--bc-fg-muted)", fontStyle: "italic" }}>
                                        {specialist.thinkingIndicator}
                                    </p>
                                    <p style={{ margin: 0, fontSize: "13px", color: "var(--bc-fg-muted)" }}>
                                        {specialist.tagline}
                                    </p>
                                </div>
                                <div className={`bc-sig-close ${sigColorClass}`} style={{ marginTop: "auto" }}>
                                    {/* W76: removed .slice(0, 120)+&hellip; truncation — show the full working style */}
                                    <div className="bc-sig-label">{sigLabel}</div>
                                    <div className="bc-sig-body">{specialist.workingStyle}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : session.councilPhase === "cal-framing" ? (
                /* W77: Cal is still framing — specialists are queued, NOT yet started.
                   Show a static roster with a "queued" label, no pulsing animation,
                   so the user can see who is in the council without implying they are running. */
                <div className={`bc-council-grid${sessionCouncilMembers.length === 3 ? " specialists-3" : ""}`}>
                    {sessionCouncilMembers.map((specialist) => (
                        <div key={specialist.id} className="bc-empty-card" style={{ borderStyle: "solid", borderColor: "var(--bc-border-soft)", opacity: 0.65 }}>
                            <div className={`bc-sp-avatar ${getAvatarClass(specialist.id)}`} style={{ margin: "0 auto 12px" }}>
                                {specialist.name.slice(0, 2).toUpperCase()}
                            </div>
                            <h3>{specialist.name}</h3>
                            <p style={{ color: "var(--bc-fg-subtle)", fontStyle: "italic", fontSize: "12px" }}>Queued — waiting for Cal to frame the question</p>
                        </div>
                    ))}
                </div>
            ) : (session.phase === "pending" && (session.councilPhase === "r1-running" || session.councilPhase === "r2-running" || session.councilPhase === "cal-closing")) ||
               (session.phase === "done" && session.specialistResponses.length > 0) ? (
                /* W77: R1 in flight or done — show hybrid grid.
                   Arrived specialists show real cards; others show animated loading placeholders.
                   This creates the one-by-one progressive reveal as each promise resolves. */
                <div className={`bc-council-grid${sessionCouncilMembers.length === 3 ? " specialists-3" : ""}`}>
                    {sessionCouncilMembers.map((specialist) => {
                        const arrived = session.specialistResponses.find(r => r.id === specialist.id)
                        const avatarClass = getAvatarClass(specialist.id)
                        const initials = specialist.name.slice(0, 2).toUpperCase()
                        const sigLabel = getSigCloseLabel(specialist.id)
                        const sigColorMap: Record<string, string> = {
                            "strategist":          "bc-sig-sage",
                            "finance-lead":        "bc-sig-finn",
                            "sales-lead":          "bc-sig-sal",
                            "cto":                 "bc-sig-max",
                            "chief-of-staff":      "bc-sig-cal",
                            "fundraising-advisor": "bc-sig-fiona",
                        }
                        const sigColorClass = sigColorMap[specialist.id] ?? ""

                        if (!arrived) {
                            // Still loading — animated placeholder
                            return (
                                <div key={specialist.id} className="bc-empty-card" style={{ borderStyle: "solid", borderColor: "var(--bc-border)" }}>
                                    <div className={`bc-sp-avatar bc-loading-pulse ${avatarClass}`} style={{ margin: "0 auto 12px" }}>
                                        {initials}
                                    </div>
                                    <h3>{specialist.name}</h3>
                                    <p style={{ fontStyle: "italic" }}>{LOADING_LINES[loadingLineIdx]}</p>
                                </div>
                            )
                        }

                        // Arrived — show real card
                        return (
                            <div key={arrived.id} className="bc-specialist-card">
                                <div className="bc-specialist-head">
                                    <div className={`bc-sp-avatar ${avatarClass}`}>{initials}</div>
                                    <div className="bc-sp-meta">
                                        <div className="bc-name-row">
                                            <span className="bc-sp-name">{arrived.name}</span>
                                        </div>
                                        <div className="bc-sp-role">{arrived.title}</div>
                                    </div>
                                </div>
                                <div className="bc-sp-body" style={{ whiteSpace: "pre-wrap" }}>
                                    {arrived.response}
                                </div>
                                <div className={`bc-sig-close ${sigColorClass}`} style={{ marginTop: "auto" }}>
                                    <div className="bc-sig-label">{sigLabel}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                /* Error or empty — show placeholder grid */
                <div className={`bc-council-grid${sessionCouncilMembers.length === 3 ? " specialists-3" : ""}`}>
                    {sessionCouncilMembers.map((_, idx) => (
                        <div key={idx} className="bc-empty-card">
                            <div className="bc-empty-icon">&middot;</div>
                            <h3>No response</h3>
                            <p>The council did not return responses. Please try again.</p>
                        </div>
                    ))}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                SECTION 2b — Round 2: specialists update after seeing peers
                W50: Only rendered when tier !== 'quick' (2-round tiers).
                W77: Show as soon as r2-running phase starts — each R2 card
                appears one-by-one as its promise resolves.
            ══════════════════════════════════════════════════════════════ */}
            {(session.councilPhase === "r2-running" || session.councilPhase === "cal-closing" || (session.phase === "done" && session.hadRound2)) && session.submittedTier !== "quick" && (
                <>
                    <div className="bc-section-label" style={{ marginTop: "36px" }}>
                        <span className="bc-step" style={{ background: "var(--bc-blue)" }}>2b</span>
                        <h2>Round 2 &mdash; after seeing each other</h2>
                        <span className="bc-rule" />
                        <span className="bc-hint">Each specialist updated their view</span>
                    </div>
                    <div className={`bc-council-grid${sessionCouncilMembers.length === 3 ? " specialists-3" : ""}`}>
                        {sessionCouncilMembers.map((specialist) => {
                            const r2arrived = session.specialistResponses.find(r => r.id === specialist.id && r.round2Response)
                            const avatarClass = getAvatarClass(specialist.id)
                            const initials = specialist.name.slice(0, 2).toUpperCase()
                            const sigColorMap: Record<string, string> = {
                                "strategist":          "bc-sig-sage",
                                "finance-lead":        "bc-sig-finn",
                                "sales-lead":          "bc-sig-sal",
                                "cto":                 "bc-sig-max",
                                "chief-of-staff":      "bc-sig-cal",
                                "fundraising-advisor": "bc-sig-fiona",
                            }
                            const sigColorClass = sigColorMap[specialist.id] ?? ""

                            if (!r2arrived) {
                                return (
                                    <div key={`r2-loading-${specialist.id}`} className="bc-empty-card" style={{ borderStyle: "solid", borderColor: "var(--bc-blue-dim)" }}>
                                        <div className={`bc-sp-avatar bc-loading-pulse ${avatarClass}`} style={{ margin: "0 auto 12px" }}>
                                            {initials}
                                        </div>
                                        <h3>{specialist.name}</h3>
                                        <p style={{ fontStyle: "italic" }}>Updating after seeing peers…</p>
                                    </div>
                                )
                            }

                            return (
                                <div key={`r2-${r2arrived.id}`} className="bc-specialist-card" style={{ borderColor: "var(--bc-blue-dim)", background: "linear-gradient(180deg, #f0f9ff 0%, var(--bc-surface) 40%)" }}>
                                    <div className="bc-specialist-head">
                                        <div className={`bc-sp-avatar ${avatarClass}`}>{initials}</div>
                                        <div className="bc-sp-meta">
                                            <div className="bc-name-row">
                                                <span className="bc-sp-name">{r2arrived.name}</span>
                                                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--bc-blue-soft)", color: "var(--bc-blue)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--bc-blue-dim)" }}>Round 2</span>
                                            </div>
                                            <div className="bc-sp-role">{r2arrived.title}</div>
                                        </div>
                                    </div>
                                    <div className="bc-sp-body" style={{ whiteSpace: "pre-wrap" }}>
                                        {r2arrived.round2Response}
                                    </div>
                                    <div className={`bc-sig-close ${sigColorClass}`} style={{ marginTop: "auto" }}>
                                        <div className="bc-sig-label">{getSigCloseLabel(r2arrived.id)}</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════
                SECTION 3 — Cal closes
            ══════════════════════════════════════════════════════════════ */}
            <div className="bc-section-label" style={{ marginTop: "36px" }}>
                <span className="bc-step">3</span>
                <h2>Cal closes &mdash; synthesis + next action</h2>
                <span className="bc-rule" />
                <span className="bc-hint">Host &middot; seals every brainstorm</span>
            </div>

            {session.phase === "idle" ? (
                /* Pre-submission: preview the closing card structure */
                <div className="bc-fiona-card bc-closing">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-cal`}>CA</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                Cal
                                <span className="bc-role-chip">Synthesis</span>
                            </div>
                            <div className="bc-role">Closing the loop &middot; Fractional Forge fundraising lead</div>
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--bc-brand-dim)", borderRadius: "10px", padding: "14px 16px" }}>
                            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--bc-brand)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                                Where they agreed
                            </div>
                            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.55", color: "var(--bc-fg-muted)" }}>
                                Cal will name what all {councilMembers.length} specialist{councilMembers.length !== 1 ? "s" : ""} agreed on &mdash; the common ground that tells you which assumptions the whole council shares.
                            </p>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--bc-brand-dim)", borderRadius: "10px", padding: "14px 16px" }}>
                            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--bc-brand)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                                Where they disagreed
                            </div>
                            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.55", color: "var(--bc-fg-muted)" }}>
                                The sharpest split &mdash; the one disagreement that matters most for your decision, named plainly.
                            </p>
                        </div>
                    </div>
                    <div style={{
                        background: "var(--bc-brand-soft)",
                        color: "var(--bc-fg)",
                        borderRadius: "12px",
                        padding: "18px 22px",
                        marginTop: "4px",
                        position: "relative",
                        overflow: "hidden",
                        border: "1px solid var(--bc-brand-dim)",
                    }}>
                        <div style={{
                            position: "absolute", top: 0, right: 0,
                            width: "200px", height: "200px",
                            background: "radial-gradient(circle, rgba(255,69,0,0.08) 0%, transparent 70%)",
                            pointerEvents: "none",
                        }} />
                        <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--bc-brand)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px", position: "relative" }}>
                            &rarr; Next concrete action this week
                        </div>
                        <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--bc-fg)", position: "relative" }}>
                            One action. One deadline. No ambiguity.
                        </h3>
                        <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.6", color: "var(--bc-fg)", position: "relative" }}>
                            Cal closes with the single most important thing to do this week &mdash; not a list, not options. One action with a deadline.
                        </p>
                    </div>
                    <p style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed var(--bc-brand-dim)", fontSize: "12.5px", color: "var(--bc-fg-muted)", fontStyle: "italic" }}>
                        &mdash; Cal, Fractional Forge Chief of Staff. The closing synthesis appears once the council has returned.
                    </p>
                </div>
            ) : session.councilPhase === "cal-closing" ? (
                /* W77: Cal's closing is now in flight — show animated loading state */
                <div className="bc-closing-held">
                    <div className="bc-stub-avatar bc-loading-pulse" style={{
                        width: "48px", height: "48px", borderRadius: "100%",
                        background: "var(--bc-brand-soft)", color: "var(--bc-brand)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: "16px",
                        marginBottom: "12px",
                        border: "2px solid #fff",
                        boxShadow: "0 0 0 2px var(--bc-brand-dim)",
                    }}>CA</div>
                    <div className="bc-label">Cal is synthesising…</div>
                    <p className="bc-loading-pulse" style={{ fontStyle: "italic" }}>Pulling together what the council agreed, where they split, and the one thing to do this week.</p>
                </div>
            ) : session.phase === "pending" ? (
                /* R1/R2 in flight — Cal closing held until specialists finish */
                <div className="bc-closing-held">
                    <div className="bc-label">Closing synthesis &mdash; held</div>
                    <p>Cal will close once all specialists have returned.</p>
                </div>
            ) : (session.phase === "done" || session.councilPhase === "done") && session.hostClosing ? (
                /* Done: real Cal closing */
                <div className="bc-fiona-card bc-closing">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-cal`}>CA</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                Cal
                                <span className="bc-role-chip">Synthesis</span>
                            </div>
                            <div className="bc-role">Closing the loop &middot; Fractional Forge fundraising lead</div>
                        </div>
                    </div>
                    <p style={{ fontSize: "14.5px", lineHeight: "1.75", margin: "0 0 18px", color: "var(--bc-fg)", whiteSpace: "pre-wrap" }}>
                        {session.hostClosing}
                    </p>
                    <p style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed var(--bc-brand-dim)", fontSize: "12.5px", color: "var(--bc-fg-muted)", fontStyle: "italic", margin: 0 }}>
                        <button
                            type="button"
                            onClick={handleReset}
                            style={{ color: "var(--bc-brand)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                        >
                            Ask a new question
                        </button>
                        {" "}to start another brainstorm.
                    </p>
                </div>
            ) : (
                /* Error or no closing — fallback */
                <div className="bc-closing-held">
                    <div className="bc-label">Synthesis unavailable</div>
                    <p>Cal&apos;s closing could not be generated.{" "}
                        <button
                            type="button"
                            onClick={handleReset}
                            style={{ color: "var(--bc-brand)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                        >
                            Try again
                        </button>
                    </p>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                Flow C — "Forge this idea" bridge CTA.
                Rendered after the council closes (session.phase === 'done').
                Writes the council's topic + synthesis to localStorage under
                the same key that ProjectCreateView and IntakeWizard already
                read — so the Forge intake wizard can pre-fill step 1 (subject)
                and step 5 (additional context) from the brainstorm output.
            ══════════════════════════════════════════════════════════════ */}
            {session.phase === "done" && session.hostClosing && (
                <div style={{
                    marginTop: "24px",
                    padding: "20px 24px",
                    background: "var(--bc-brand-soft)",
                    border: "1.5px solid var(--bc-brand-dim)",
                    borderRadius: "14px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "16px",
                    alignItems: "center",
                }}>
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--bc-brand)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "5px" }}>
                            Ready to build this?
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "var(--bc-fg)", lineHeight: "1.55" }}>
                            Take the council's output straight into a Forge engineering report —
                            the brief and context are pre-filled from this session so you just
                            fill in the scale numbers.
                        </p>
                    </div>
                    <a
                        href="/the-forge-v2/new?fromBrainstorm=1"
                        onClick={(e) => {
                            // INTENT: stash the brainstorm output in localStorage before
                            // navigating. IntakeWizard reads forge_brainstorm_handoff on
                            // mount when ?fromBrainstorm=1 is present, pre-fills subject
                            // (step 1) and additionalContext (step 5), then clears the key
                            // so it does not bleed into a future "+ New project" session.
                            if (typeof window === "undefined") return
                            try {
                                const payload = {
                                    topic: session.submittedQuestion ?? "",
                                    summary: session.hostClosing ?? "",
                                    createdAt: new Date().toISOString(),
                                }
                                window.localStorage.setItem(
                                    "forge-from-brainstorm-context",
                                    JSON.stringify(payload),
                                )
                            } catch {
                                // localStorage unavailable (private browsing, quota) —
                                // let the navigation happen anyway; the wizard lands
                                // empty rather than crashing.
                            }
                            // Allow the default <a> navigation — no e.preventDefault().
                        }}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            background: "var(--bc-brand)",
                            color: "#fff",
                            textDecoration: "none",
                            padding: "11px 22px",
                            borderRadius: "10px",
                            fontSize: "13.5px",
                            fontWeight: 700,
                            fontFamily: "inherit",
                            boxShadow: "0 1px 0 rgba(255,69,0,0.5) inset, 0 6px 14px rgba(255,69,0,0.20)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                        }}
                    >
                        Build this in the Forge →
                    </a>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                W52 — Generate graphic summary / audio transcript buttons.
                Rendered after the council closes (session.phase === 'done').
                Requires a saved threadId to call the generation actions.
            ══════════════════════════════════════════════════════════════ */}
            {session.phase === "done" && session.savedThreadId && (
                <div style={{
                    marginTop: "28px",
                    padding: "20px 24px",
                    background: "var(--bc-surface-soft)",
                    border: "1px solid var(--bc-border)",
                    borderRadius: "14px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    alignItems: "center",
                }}>
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--bc-fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
                            Session assets
                        </div>
                        <p style={{ margin: 0, fontSize: "12.5px", color: "var(--bc-fg-muted)", lineHeight: "1.5" }}>
                            Generate a visual summary or audio transcript of this discussion.
                        </p>
                    </div>
                    {/* Generate graphic summary button */}
                    <button
                        type="button"
                        disabled={graphicStatus === "running"}
                        onClick={async () => {
                            if (!session.savedThreadId || graphicStatus === "running") return
                            setGraphicStatus("running")
                            try {
                                const result = await generateSessionInfographic(session.savedThreadId)
                                if (result.ok) {
                                    // W54: fetch the signed URL so the image renders inline.
                                    // generateSessionInfographic only saves to storage; the
                                    // component previously had no render block for the result.
                                    const urls = await refreshSessionAssetUrls(session.savedThreadId)
                                    if (urls.coverUrl) {
                                        setGeneratedCoverUrl(urls.coverUrl)
                                    }
                                    setGraphicStatus("done")
                                    // W72: refresh router to pick up newly-generated cover in saved-sessions panel
                                    router.refresh()
                                } else {
                                    setGraphicStatus("error")
                                }
                            } catch {
                                setGraphicStatus("error")
                            }
                        }}
                        style={{
                            background: graphicStatus === "done" ? "var(--bc-success)" : graphicStatus === "error" ? "#b91c1c" : "var(--bc-fg)",
                            color: "#fff",
                            border: "none",
                            padding: "10px 18px",
                            borderRadius: "10px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: graphicStatus === "running" ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            fontFamily: "inherit",
                            opacity: graphicStatus === "running" ? 0.7 : 1,
                            transition: "background 0.15s",
                        }}
                    >
                        {graphicStatus === "running" ? "Generating…" :
                         graphicStatus === "done" ? "✓ Graphic saved" :
                         graphicStatus === "error" ? "Error — retry" :
                         "Generate graphic summary"}
                    </button>
                    {/* Create audio transcript button */}
                    <button
                        type="button"
                        disabled={audioStatus === "running"}
                        onClick={async () => {
                            if (!session.savedThreadId || audioStatus === "running") return
                            setAudioStatus("running")
                            try {
                                const result = await generateSessionAudio(session.savedThreadId)
                                if (result.ok) {
                                    // Fetch signed URLs. New sessions return audioUrl (single file);
                                    // legacy sessions return audioClips array.
                                    const urls = await refreshSessionAssetUrls(session.savedThreadId)
                                    if (urls.audioUrl) {
                                        setGeneratedAudioUrl(urls.audioUrl)
                                    } else if (urls.audioClips.length > 0) {
                                        // Backwards compat: old-style per-clip sessions
                                        setGeneratedAudioClips(urls.audioClips)
                                    }
                                    setAudioStatus("done")
                                    // W70: show ready callout + auto-scroll to audio section
                                    setAudioReadyVisible(true)
                                    setTimeout(() => {
                                        audioReadyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                                    }, 200)
                                } else {
                                    setAudioStatus("error")
                                }
                            } catch {
                                setAudioStatus("error")
                            }
                        }}
                        style={{
                            background: audioStatus === "done" ? "var(--bc-success)" : audioStatus === "error" ? "#b91c1c" : "var(--bc-blue)",
                            color: "#fff",
                            border: "none",
                            padding: "10px 18px",
                            borderRadius: "10px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: audioStatus === "running" ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            fontFamily: "inherit",
                            opacity: audioStatus === "running" ? 0.7 : 1,
                            transition: "background 0.15s",
                        }}
                    >
                        {audioStatus === "running" ? "Generating…" :
                         audioStatus === "done" ? "✓ Audio saved" :
                         audioStatus === "error" ? "Error — retry" :
                         "Create audio transcript"}
                    </button>
                </div>
            )}

            {/* W54 — Inline render of generated session assets.
                Shown below the generation buttons once the user triggers
                generation; disappears on reset/new session.
                Cover image: 16:9 rounded block, full-width.
                Audio: one <audio> player per clip, labelled with specialist name. */}
            {(generatedCoverUrl || generatedAudioUrl || (generatedAudioClips && generatedAudioClips.length > 0)) && (
                <div ref={audioReadyRef} style={{
                    marginTop: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                }}>
                    {/* W70: Audio ready callout — auto-dismissible */}
                    {audioReadyVisible && (generatedAudioUrl || (generatedAudioClips && generatedAudioClips.length > 0)) && (
                        <div className="bc-audio-ready">
                            <span>🔊</span>
                            <span>Your audio summary is ready — listen to the full council discussion</span>
                            <button
                                type="button"
                                onClick={() => setAudioReadyVisible(false)}
                                aria-label="Dismiss"
                            >×</button>
                        </div>
                    )}
                    {generatedCoverUrl && (
                        <div style={{
                            borderRadius: "12px",
                            overflow: "hidden",
                            border: "1px solid var(--bc-border)",
                            background: "#f9f8f6",
                        }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={generatedCoverUrl}
                                alt={`Graphic summary for: ${session.submittedQuestion}`}
                                style={{ width: "100%", display: "block", borderRadius: "12px" }}
                            />
                        </div>
                    )}
                    {/* Single combined audio player — new sessions (2026-04-28+) */}
                    {generatedAudioUrl && (
                        <div style={{
                            padding: "16px 20px",
                            background: "var(--bc-blue-soft)",
                            border: "1px solid var(--bc-blue-dim)",
                            borderRadius: "12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                        }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--bc-fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Listen to the full council discussion
                            </div>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <audio
                                controls
                                src={generatedAudioUrl}
                                aria-label="Full council discussion audio"
                                style={{ width: "100%" }}
                            />
                            <p style={{ margin: 0, fontSize: "11.5px", color: "var(--bc-fg-muted)", lineHeight: "1.5" }}>
                                Each specialist is introduced by name. Works well on the go.
                            </p>
                        </div>
                    )}
                    {/* Legacy per-clip fallback — old sessions without a combined file */}
                    {!generatedAudioUrl && generatedAudioClips && generatedAudioClips.length > 0 && (
                        <div style={{
                            padding: "16px 20px",
                            background: "var(--bc-blue-soft)",
                            border: "1px solid var(--bc-blue-dim)",
                            borderRadius: "12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                        }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--bc-fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Audio transcript — {generatedAudioClips.length} clips
                            </div>
                            {generatedAudioClips.map((clip, idx) => (
                                <div key={clip.url} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--bc-fg-muted)" }}>
                                        {clip.specialistId}
                                    </span>
                                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                    <audio
                                        controls
                                        src={clip.url}
                                        aria-label={`Audio clip ${idx + 1} — ${clip.specialistId}`}
                                        style={{ width: "100%", height: "36px" }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* F1 — Saved sessions panel. Lives inline on /agents per
                Tristan's requirement ("see those saves on the same page"). */}
            <div style={{ marginTop: "48px", paddingTop: "32px", borderTop: "1px solid var(--bc-border-soft)" }}>
                {/* W7: historyRefreshKey increments after each successful session
                    save so MeetingHistory re-fetches and shows the new entry. */}
                <MeetingHistory initialLimit={6} refreshKey={historyRefreshKey} />
            </div>
        </div>
    )
}
