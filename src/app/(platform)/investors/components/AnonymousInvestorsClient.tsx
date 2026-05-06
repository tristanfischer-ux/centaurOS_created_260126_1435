/**
 * @file AnonymousInvestorsClient.tsx
 *
 * @description Client interactivity for the unauthenticated /investors
 * landing. Renders:
 *
 * 1. A search box. Typing is allowed; submitting opens the two-route wall
 *    because real-time search requires the live pipeline.
 * 2. Ten fully-rendered hand-curated match cards. Each card has a solid-orange
 *    EXAMPLE pill so visitors never confuse the example matches with their
 *    personal results. No blurred cards. No wall during the scroll.
 * 3. A two-route wall after the 10th card:
 *    Card A: Sign up to keep going. Routes to /signup?from=investors-anonymous.
 *    Card B: Refer a friend to keep going. For anonymous visitors, this opens a
 *            sub-modal explaining that the invite link is generated on signup.
 *    Both cards are visually equal — neither is dimmed.
 * 4. A sub-modal for the refer-a-friend route that explains the mechanic and
 *    routes to /signup?from=investors-anonymous-refer.
 *
 * Voice rules: no em dashes, no emojis, British spelling, semantic tokens,
 * light theme. Wall copy leads with what the visitor gains, not what they have
 * run out of.
 */

"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import {
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Mail,
    Quote,
    Search,
    Share2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { normaliseFirmTypeLabel } from "@/lib/investors/firm-type-labels"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import type { AnonymousTeaserCard } from "@/lib/investors/anonymous-teaser-matches"

interface AnonymousInvestorsClientProps {
    teaserCards: AnonymousTeaserCard[]
}

// ── Individual card email toggle state ──────────────────────────────────────

function TeaserMatchCard({ card }: { card: AnonymousTeaserCard }) {
    const [emailOpen, setEmailOpen] = useState(false)

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            {/* EXAMPLE pill — solid orange, mirrors the spec */}
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-international-orange text-white text-[10px] font-mono font-bold uppercase tracking-widest shrink-0">
                                Example
                            </span>
                            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                                {card.title}
                            </h3>
                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                                {normaliseFirmTypeLabel(card.firmType)}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {card.sectors.length > 0 && (
                                <span>
                                    <span className="font-medium text-foreground">Sector</span>{" "}
                                    {card.sectors.slice(0, 3).join(", ")}
                                </span>
                            )}
                            {card.stageFocus.length > 0 && (
                                <>
                                    <span aria-hidden>·</span>
                                    <span>
                                        <span className="font-medium text-foreground">Stage</span>{" "}
                                        {card.stageFocus.slice(0, 3).join(", ")}
                                    </span>
                                </>
                            )}
                            {card.chequeRangeGbp.min !== undefined && card.chequeRangeGbp.max !== undefined && (
                                <>
                                    <span aria-hidden>·</span>
                                    <span>
                                        <span className="font-medium text-foreground">Cheque</span>{" "}
                                        £{card.chequeRangeGbp.min.toLocaleString()} to £{card.chequeRangeGbp.max.toLocaleString()}
                                    </span>
                                </>
                            )}
                            {card.location && (
                                <>
                                    <span aria-hidden>·</span>
                                    <span>{card.location}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-1 pb-5">
                <section>
                    <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                        Why {card.title} might back you
                    </h4>
                    <p className="text-sm leading-relaxed text-foreground">
                        {card.matchOutput.whyFit}
                    </p>
                </section>

                <section>
                    <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                        How to pitch this to them
                    </h4>
                    <p className="text-sm leading-relaxed text-foreground">
                        {card.matchOutput.howToPitch}
                    </p>
                </section>

                {card.matchOutput.sourceCitations.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {card.matchOutput.sourceCitations.map((citation, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-full border border-international-orange/20 bg-international-orange/10 text-international-orange px-2 py-0.5 text-[11px] font-medium"
                            >
                                <Quote className="h-3 w-3" />
                                {citation.type === "fund_decision"
                                    ? "Fund decision"
                                    : citation.type === "partner_statement"
                                        ? "Partner statement"
                                        : "Portfolio precedent"}
                            </span>
                        ))}
                    </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            Drafted email preview
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEmailOpen((v) => !v)}
                            className="h-7 px-2 text-xs"
                        >
                            {emailOpen ? "Hide" : "Read"}
                            {emailOpen ? (
                                <ChevronUp className="h-3 w-3 ml-1" />
                            ) : (
                                <ChevronDown className="h-3 w-3 ml-1" />
                            )}
                        </Button>
                    </div>
                    {emailOpen && (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Subject
                                </div>
                                <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground">
                                    {card.matchOutput.draftedEmailSubject}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Body
                                </div>
                                <div className="rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground space-y-2">
                                    {card.matchOutput.draftedEmailBody
                                        .split("\n\n")
                                        .map((para, i) => (
                                            <p key={i}>{para}</p>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

// ── Refer-a-friend sub-modal ─────────────────────────────────────────────────

interface ReferSubModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

function ReferSubModal({ open, onOpenChange }: ReferSubModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight">
                        Your invite link is generated when you sign up
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-muted-foreground pt-1">
                        Signing up takes 20 seconds. Once you land on your dashboard, your
                        personal invite link is ready to copy and share. Every friend who signs
                        up with it gets a free month, and you both get +50 investor searches
                        against your real profiles.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                    <Button
                        asChild
                        className="w-full bg-international-orange hover:bg-international-orange-hover text-white"
                    >
                        <Link href="/signup?from=investors-anonymous-refer">
                            Sign up to get your invite link
                            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Link>
                    </Button>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    >
                        Go back
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ── Search signup wall (triggered by search submit) ──────────────────────────

interface SearchWallModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    searchHref: string
    onReferClick: () => void
}

function SearchWallModal({ open, onOpenChange, searchHref, onReferClick }: SearchWallModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight">
                        Want your own matches?
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-muted-foreground pt-1">
                        Running a search against your real profile requires your foundry
                        details. Sign up in 20 seconds and we will replay your query the
                        moment you land on your dashboard.
                    </DialogDescription>
                </DialogHeader>
                <TwoRouteWallCards
                    onReferClick={() => {
                        onOpenChange(false)
                        onReferClick()
                    }}
                    signupHref={searchHref}
                />
                <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] mt-1"
                >
                    Or keep browsing the examples
                </button>
            </DialogContent>
        </Dialog>
    )
}

// ── Two-route wall cards (reused in both the inline section and modal) ───────

interface TwoRouteWallCardsProps {
    signupHref: string
    onReferClick: () => void
}

function TwoRouteWallCards({ signupHref, onReferClick }: TwoRouteWallCardsProps) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {/* Card A: Sign up */}
            <div className="rounded-lg border border-international-orange/30 bg-card p-5 space-y-3 flex flex-col">
                <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">Sign up to keep going</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Free for your first 30 days. We will match against your sector, stage,
                        and traction. Same drafted-email format on every result.
                    </p>
                </div>
                <div className="flex-1" />
                <Button
                    asChild
                    className="w-full justify-center bg-international-orange hover:bg-international-orange-hover text-white"
                >
                    <Link href={signupHref}>
                        Start free, takes 20 seconds
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                </Button>
            </div>

            {/* Card B: Refer a friend */}
            <div className="rounded-lg shadow-sm bg-card p-5 space-y-3 flex flex-col">
                <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">Refer a friend to keep going</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Send the link to another founder. They sign up free; you both get
                        +50 searches against your real profiles.
                    </p>
                </div>
                <div className="flex-1" />
                <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={onReferClick}
                >
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    Copy invite link
                </Button>
            </div>
        </div>
    )
}

// ── Main export ──────────────────────────────────────────────────────────────

export function AnonymousInvestorsClient({ teaserCards }: AnonymousInvestorsClientProps) {
    const [searchValue, setSearchValue] = useState("")
    const [searchWallOpen, setSearchWallOpen] = useState(false)
    const [referSubModalOpen, setReferSubModalOpen] = useState(false)

    const handleSearchSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            setSearchWallOpen(true)
        },
        [],
    )

    const openReferSubModal = useCallback(() => {
        setReferSubModalOpen(true)
    }, [])

    // Carry the typed query through to /signup so the post-signup landing can
    // replay it against the founder's real profile.
    const signupHref = (() => {
        const trimmed = searchValue.trim()
        const base = "/signup?from=investors-anonymous"
        return trimmed ? `${base}&q=${encodeURIComponent(trimmed)}` : base
    })()

    return (
        <>
            {/* ─────────────────────────────────────────────────────
              * Search box. Typing is free; submitting opens the
              * two-route wall because real-time search requires the
              * live pipeline — we cannot run it anonymously without
              * incurring language-model cost.
              * ───────────────────────────────────────────────────── */}
            <section className="space-y-3">
                <form
                    onSubmit={handleSearchSubmit}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    aria-label="Investor search"
                >
                    <label htmlFor="anonymous-investor-search" className="sr-only">
                        Describe your startup
                    </label>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                            id="anonymous-investor-search"
                            type="text"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder="Try: pre-seed climate hardware, first commercial pilot signed"
                            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2.5 text-sm leading-tight placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange focus:border-transparent"
                            autoComplete="off"
                        />
                    </div>
                    <Button
                        type="submit"
                        className="bg-international-orange hover:bg-international-orange-hover text-white whitespace-nowrap"
                    >
                        Search investors
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                </form>
                <p className="text-[11px] text-muted-foreground pl-1">
                    Search runs against your real profile the moment you sign up. We replay
                    your typed query automatically.
                </p>
            </section>

            {/* ─────────────────────────────────────────────────────
              * Ten fully-rendered match cards. No blurred cards.
              * No wall during the scroll. Each card has an EXAMPLE
              * pill so visitors know the matches are illustrative.
              * ───────────────────────────────────────────────────── */}
            <section className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-international-orange text-white text-[10px] font-mono font-bold uppercase tracking-widest">
                        Examples
                    </span>
                    10 fully-rendered matches, drafted against a sample climate-hardware profile
                </h2>
                {teaserCards.map((card) => (
                    <TeaserMatchCard key={card.id} card={card} />
                ))}
            </section>

            {/* ─────────────────────────────────────────────────────
              * Two-route wall after the 10th card. Clean section,
              * visually equal options — sign up OR refer a friend.
              * Neither card is dimmed. The headline is "Want your
              * own matches?" not "You have used your free quota."
              * ───────────────────────────────────────────────────── */}
            <section className="rounded-xl border border-international-orange/30 bg-international-orange/[0.04] px-5 py-8 sm:px-8 space-y-6">
                <div className="text-center space-y-2">
                    <h2 className="text-xl sm:text-2xl font-display font-semibold text-foreground">
                        Want your own matches?
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                        The examples above were drafted for a sample profile. Sign up and we
                        will run the same analysis against your real sector, stage, traction,
                        and region. Every match arrives with a tailored why-fit paragraph and
                        a ready-to-send drafted email.
                    </p>
                </div>

                <TwoRouteWallCards
                    signupHref={signupHref}
                    onReferClick={openReferSubModal}
                />

                <p className="text-center text-[11px] text-muted-foreground">
                    Free for your first 30 days. No credit card required.
                </p>

                <div className="text-center">
                    <Link
                        href="/login"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono uppercase tracking-widest"
                    >
                        Already have an account? Sign in
                    </Link>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────
              * Search wall modal — triggered when the visitor
              * submits the search form. Same two-route cards.
              * ───────────────────────────────────────────────────── */}
            <SearchWallModal
                open={searchWallOpen}
                onOpenChange={setSearchWallOpen}
                searchHref={signupHref}
                onReferClick={() => {
                    setSearchWallOpen(false)
                    setReferSubModalOpen(true)
                }}
            />

            {/* ─────────────────────────────────────────────────────
              * Refer-a-friend sub-modal. For anonymous visitors,
              * explains that the invite link is generated on signup
              * and routes them to /signup?from=investors-anonymous-refer.
              * ───────────────────────────────────────────────────── */}
            <ReferSubModal
                open={referSubModalOpen}
                onOpenChange={setReferSubModalOpen}
            />
        </>
    )
}
