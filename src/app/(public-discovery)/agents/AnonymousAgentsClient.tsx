/**
 * @file AnonymousAgentsClient.tsx
 *
 * @description Client interactivity for the unauthenticated /agents landing
 * per RED-TEAM-PIVOT-PLAN Tier 2 step 16. Owns:
 *
 * 1. Council tier picker (Quick / Full / Deep / Strategy). Quick is
 *    unlocked and shows a description. The other three display a lock badge;
 *    clicking any locked tier opens the signup wall.
 * 2. A hand-crafted teaser brainstorm transcript (Sage + Fiona on "Should we
 *    raise a Series A or extend our runway?") with the EXAMPLE pill so the
 *    visitor knows this was curated, not generated against their profile.
 * 3. Three blurred meeting cards. Clicking any of them opens the signup wall.
 * 4. Typing in the topic input box opens the signup wall after 6 characters.
 * 5. The AnonymousSignupWall modal shared with /investors and /the-forge-v2.
 *
 * Voice rules: no em dashes, British spelling, no emojis, semantic tokens.
 */

"use client"

import { useCallback, useState } from "react"
import { ArrowRight, Lock, Users, Zap, BarChart3, Compass, Clock, CheckCircle2 } from "lucide-react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { AnonymousSignupWall, type SignupWallCopy } from "@/components/marketing/anonymous-signup-wall"

// ─── Council tiers ──────────────────────────────────────────────────────────

interface CouncilTier {
    id: string
    label: string
    duration: string
    description: string
    locked: boolean
    specialists: string
}

const COUNCIL_TIERS: CouncilTier[] = [
    {
        id: "quick",
        label: "Quick",
        duration: "15 min",
        description: "Two to three specialists, one focused question, action items in fifteen minutes. Good for a daily stand-in or a fast sanity check.",
        locked: false,
        specialists: "2 to 3 specialists",
    },
    {
        id: "full",
        label: "Full",
        duration: "30 min",
        description: "Your complete leadership team, one topic, a structured recommendation with dissenting views clearly labelled.",
        locked: true,
        specialists: "5 to 7 specialists",
    },
    {
        id: "deep",
        label: "Deep",
        duration: "60 min",
        description: "Long-form investigation with research loops, financial modelling, and a written deliverable you can share with co-founders or board members.",
        locked: true,
        specialists: "Up to 13 specialists",
    },
    {
        id: "strategy",
        label: "Strategy",
        duration: "90 min",
        description: "Full strategic review: competitive landscape, scenario planning, a twelve-month roadmap, and prioritised risk register.",
        locked: true,
        specialists: "Up to 13 specialists",
    },
]

// ─── Teaser transcript ───────────────────────────────────────────────────────

interface TeaserMessage {
    specialistId: string
    name: string
    role: string
    avatarInitial: string
    avatarColor: string
    content: string
    timestamp: string
}

const TEASER_TOPIC = "Should we raise a Series A or extend our runway?"

const TEASER_MESSAGES: TeaserMessage[] = [
    {
        specialistId: "strategist",
        name: "Sage",
        role: "Strategy Lead",
        avatarInitial: "S",
        avatarColor: "bg-chart-5 text-white",
        content: "Let me open with the framing that actually matters here: this is not a fundraising question, it is a conviction question. Before we discuss Series A terms, I need to understand what evidence has appeared in the last ninety days that is genuinely new. Not what you hoped would happen. What has actually changed in the signal set that would make an institutional lead believe the risk profile is meaningfully different from six months ago?",
        timestamp: "10:02",
    },
    {
        specialistId: "fundraising-advisor",
        name: "Fiona",
        role: "Fundraising Advisor",
        avatarInitial: "F",
        avatarColor: "bg-purple-500 text-white",
        content: "Sage is right to start there. The assumption I want to challenge is that runway extension is the conservative option. It often is not. If you extend on convertible notes at a cap that undervalues the next milestone, you hand dilution to bridge investors at exactly the moment your cap table should be cleanest for a lead investor. The real question is: can you reach a milestone in twelve months that is worth a Series A valuation, or does the evidence say you need eighteen months? If it is eighteen, the bridge conversation should happen now at a premium, not as a rescue round.",
        timestamp: "10:04",
    },
    {
        specialistId: "strategist",
        name: "Sage",
        role: "Strategy Lead",
        avatarInitial: "S",
        avatarColor: "bg-chart-5 text-white",
        content: "Agreed. Three things I would want to see before recommending Series A now: first, a paying customer with a signed contract, not an letter of intent. Second, a repeatable cost of acquisition number across at least three channels. Third, a clear answer to what happens if the lead investor asks for board representation and you say yes. If you cannot walk me through how that changes your decision-making velocity, you are not ready. If you can, the Series A conversation becomes much easier.",
        timestamp: "10:07",
    },
    {
        specialistId: "fundraising-advisor",
        name: "Fiona",
        role: "Fundraising Advisor",
        avatarInitial: "F",
        avatarColor: "bg-purple-500 text-white",
        content: "One concrete recommendation: run the Series A process in parallel with the bridge conversation for four weeks. You will learn more from twenty investor conversations than from any internal analysis. If you get two term sheets, you raise now. If you get strong interest but no term sheet, you bridge for twelve months with a clean note structure and return with better numbers. The process itself is market research.",
        timestamp: "10:09",
    },
]

const TEASER_SUMMARY = {
    actionItems: [
        "Identify one signed paying customer contract, not a letter of intent, as the primary Series A anchor.",
        "Calculate cost of acquisition across at least three channels before the investor process starts.",
        "Run four weeks of investor conversations in parallel with the bridge structure analysis.",
        "Prepare the board seat conversation: who gets it, what decisions require board approval, and how that changes your speed.",
    ],
    recommendation: "Run the Series A process in parallel with bridge planning for four weeks. Use investor feedback to determine which path to close.",
}

// ─── Blurred meeting cards ───────────────────────────────────────────────────

const BLURRED_MEETINGS = [
    {
        id: "bm1",
        topic: "Is our pricing model leaving money on the table?",
        specialists: "Sage, Sal, Finn",
        duration: "Quick (15 min)",
        actionCount: 4,
    },
    {
        id: "bm2",
        topic: "What does our hiring roadmap look like for the next six months?",
        specialists: "Harper, Sage, Cal",
        duration: "Full (30 min)",
        actionCount: 7,
    },
    {
        id: "bm3",
        topic: "Which three risks should we disclose in the investor data room?",
        specialists: "Leo, Fiona, Finn",
        duration: "Quick (15 min)",
        actionCount: 3,
    },
]

// ─── Signup wall copy ─────────────────────────────────────────────────────────

type WallTrigger = "locked-tier" | "topic-input" | "blurred-card"

const WALL_COPY: Record<WallTrigger, SignupWallCopy> = {
    "locked-tier": {
        title: "Save this meeting to your private sandbox",
        body: "Sign up to run Full, Deep, and Strategy meetings against your live company profile. Every session arrives with a structured summary and action items attributed to each specialist.",
    },
    "topic-input": {
        title: "Save this brainstorm to your private sandbox",
        body: "Sign up to run this question through your specialist team. The meeting saves to your private sandbox so you can pick it up, share it with co-founders, and build on it over time.",
    },
    "blurred-card": {
        title: "Save this meeting to your private sandbox",
        body: "Sign up to see the full transcript, structured summary, and action items. Every meeting runs against your live company profile so the advice is specific to your situation.",
    },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnonymousAgentsClient() {
    const [topicValue, setTopicValue] = useState("")
    const [wallOpen, setWallOpen] = useState(false)
    const [wallTrigger, setWallTrigger] = useState<WallTrigger>("locked-tier")
    const [activeTierId, setActiveTierId] = useState("quick")

    const openWall = useCallback((trigger: WallTrigger) => {
        setWallTrigger(trigger)
        setWallOpen(true)
    }, [])

    const handleTopicChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value
            setTopicValue(val)
            if (val.length === 6) {
                openWall("topic-input")
            }
        },
        [openWall],
    )

    const handleTierClick = useCallback(
        (tier: CouncilTier) => {
            if (tier.locked) {
                openWall("locked-tier")
            } else {
                setActiveTierId(tier.id)
            }
        },
        [openWall],
    )

    const signupHref = (() => {
        const trimmed = topicValue.trim()
        const base = "/signup?from=agents-anonymous"
        return trimmed ? `${base}&topic=${encodeURIComponent(trimmed)}` : base
    })()

    const activeTier = COUNCIL_TIERS.find((t) => t.id === activeTierId) ?? COUNCIL_TIERS[0]

    return (
        <>
            {/* ── Topic input ───────────────────────────────────────────── */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                    What would you like to discuss?
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="anonymous-agents-topic" className="sr-only">
                        Meeting topic
                    </label>
                    <input
                        id="anonymous-agents-topic"
                        type="text"
                        value={topicValue}
                        onChange={handleTopicChange}
                        placeholder="Try: Should we raise a Series A or extend runway?"
                        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-tight placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange focus:border-transparent"
                        autoComplete="off"
                    />
                    <Button
                        type="button"
                        onClick={() => openWall("topic-input")}
                        className="bg-international-orange hover:bg-international-orange-hover text-white whitespace-nowrap"
                    >
                        Start meeting
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                </div>
                <p className="text-[11px] text-muted-foreground pl-1">
                    Your meeting saves to your private sandbox the moment you sign up.
                </p>
            </section>

            {/* ── Council tier picker ───────────────────────────────────── */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                    Choose a meeting format
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {COUNCIL_TIERS.map((tier) => (
                        <button
                            key={tier.id}
                            type="button"
                            onClick={() => handleTierClick(tier)}
                            className={`relative rounded-xl border p-3 text-left transition-all group ${
                                activeTierId === tier.id && !tier.locked
                                    ? "border-international-orange bg-international-orange/5 ring-1 ring-international-orange/30"
                                    : "border-border bg-card hover:border-international-orange/50"
                            }`}
                            aria-pressed={activeTierId === tier.id && !tier.locked}
                        >
                            {tier.locked && (
                                <div className="absolute top-2 right-2">
                                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                            )}
                            <div className="space-y-1">
                                <p className={`text-sm font-semibold ${tier.locked ? "text-muted-foreground" : "text-foreground"}`}>
                                    {tier.label}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {tier.duration}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {tier.specialists}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
                {/* Active tier description */}
                <p className="text-xs text-muted-foreground leading-relaxed rounded-lg bg-muted/40 border border-border px-3 py-2.5">
                    {activeTier.description}
                </p>
            </section>

            {/* ── Teaser brainstorm transcript ──────────────────────────── */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-international-orange text-white text-[10px] font-mono font-bold uppercase tracking-widest">
                        Example
                    </span>
                    One real meeting, hand-picked to show specialist depth
                </h2>

                <Card className="overflow-hidden">
                    <CardHeader className="pb-3 border-b border-border">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1">
                                    Quick Council
                                </p>
                                <h3 className="text-base font-semibold text-foreground leading-snug">
                                    {TEASER_TOPIC}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                                    <Users className="h-3.5 w-3.5" />
                                    Sage, Fiona
                                </div>
                                <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                                    <Clock className="h-3.5 w-3.5" />
                                    15 min
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-5 pb-5 space-y-5">
                        {/* Transcript */}
                        <div className="space-y-4">
                            {TEASER_MESSAGES.map((msg) => (
                                <div key={msg.specialistId + msg.timestamp} className="flex gap-3">
                                    <div
                                        className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${msg.avatarColor}`}
                                        aria-hidden="true"
                                    >
                                        {msg.avatarInitial}
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-foreground">
                                                {msg.name}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground">
                                                {msg.role}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground font-mono">
                                                {msg.timestamp}
                                            </span>
                                        </div>
                                        <p className="text-sm leading-relaxed text-foreground">
                                            {msg.content}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Summary */}
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Meeting summary
                                </p>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">
                                {TEASER_SUMMARY.recommendation}
                            </p>
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Action items
                                </p>
                                <ul className="space-y-1.5">
                                    {TEASER_SUMMARY.actionItems.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-international-orange flex-shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <Button
                            type="button"
                            onClick={() => openWall("topic-input")}
                            className="bg-international-orange hover:bg-international-orange-hover text-white"
                        >
                            Run your own meeting
                            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Button>
                    </CardContent>
                </Card>
            </section>

            {/* ── Blurred meeting cards ─────────────────────────────────── */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                    Plus {BLURRED_MEETINGS.length} more meetings in your sandbox
                </h2>
                <div className="space-y-3">
                    {BLURRED_MEETINGS.map((meeting) => (
                        <button
                            key={meeting.id}
                            type="button"
                            onClick={() => openWall("blurred-card")}
                            className="w-full text-left group"
                            aria-label={`Locked meeting. Sign up to unlock.`}
                        >
                            <Card className="relative overflow-hidden transition-all group-hover:border-international-orange/50">
                                {/* Blurred content */}
                                <div className="select-none filter blur-[2px] pointer-events-none">
                                    <CardHeader className="pb-2">
                                        <h3 className="text-sm font-semibold text-foreground">
                                            {meeting.topic}
                                        </h3>
                                    </CardHeader>
                                    <CardContent className="pt-0 pb-3 space-y-1.5">
                                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {meeting.specialists}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {meeting.duration}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                {meeting.actionCount} action items
                                            </span>
                                        </div>
                                    </CardContent>
                                </div>
                                {/* Lock overlay */}
                                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                                    <div className="rounded-xl border bg-card shadow-lg p-4 max-w-sm text-center space-y-2">
                                        <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-international-orange/10">
                                            <Lock className="h-4 w-4 text-international-orange" />
                                        </div>
                                        <p className="text-sm font-semibold text-foreground">
                                            Sign up to see the full transcript
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Same depth as the example above, generated against your live company profile.
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </button>
                    ))}
                </div>
            </section>

            {/* ── Signup wall ───────────────────────────────────────────── */}
            <AnonymousSignupWall
                open={wallOpen}
                onOpenChange={setWallOpen}
                copy={WALL_COPY[wallTrigger]}
                signupHref={signupHref}
                ctaLabel="Save to my private sandbox"
            />
        </>
    )
}
