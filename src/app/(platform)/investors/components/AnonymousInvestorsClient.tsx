/**
 * @file AnonymousInvestorsClient.tsx
 *
 * @description Client interactivity for the unauthenticated /investors
 * landing per RED-TEAM-PIVOT-PLAN Tier 2 step 15. Owns:
 *
 * 1. The visible search box. Typing is allowed; pressing enter (or clicking
 *    the search button) opens the signup wall instead of running a search.
 * 2. The signup wall modal, framed as "Save this search to your private
 *    sandbox". Carries the visitor's typed query through to /signup as a
 *    query param so the post-signup landing can replay it.
 * 3. The fully-rendered teaser card for the curated investor (Planet A by
 *    default), labelled with a small EXAMPLE pill so the visitor knows the
 *    match was generated for a sample profile, not theirs.
 * 4. Four blurred locked cards. Clicking any of them opens the signup wall
 *    too — the click is the trigger, no navigation happens.
 *
 * Voice rules (RED-TEAM-PIVOT-PLAN): no em dashes in user-visible copy,
 * British spelling, semantic tokens, no emojis, "save to your private
 * sandbox" framing rather than "you must sign up to continue".
 */

"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import {
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Lock,
    Mail,
    Quote,
    Search,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import {
    type InvestorFirm,
    type InvestorMatchOutputView,
} from "@/actions/investors"

interface AnonymousInvestorsClientProps {
    teaserFirm: InvestorFirm | null
    teaserMatchOutput: InvestorMatchOutputView | null
    blurredFirms: InvestorFirm[]
}

type SignupWallTrigger = "search" | "locked-card" | "draft-email" | "save"

/**
 * Maps a signup-wall trigger to the soft microcopy shown in the modal. Each
 * line leads with what the founder gets, not why they need to sign up.
 */
const TRIGGER_COPY: Record<SignupWallTrigger, { title: string; body: string }> = {
    search: {
        title: "Save this search to your private sandbox",
        body: "Sign up to run this against your live foundry profile. Every match arrives with a why-fit paragraph, a how-to-pitch line, and a drafted opening email. We will replay your search the moment you land back here.",
    },
    "locked-card": {
        title: "Save this match to your private sandbox",
        body: "Sign up to unlock the why-fit, the how-to-pitch, and the drafted email for this investor. Every match in your shortlist looks like the example above.",
    },
    "draft-email": {
        title: "Save this drafted email to your private sandbox",
        body: "Sign up to see the drafted email, edit it, and send it from your own inbox. We draft the starting point so you spend the time on the relationship, not the wording.",
    },
    save: {
        title: "Save this to your private sandbox",
        body: "Sign up to save searches, save matches, and run your own outreach. Free forever, no credit card required.",
    },
}

export function AnonymousInvestorsClient({
    teaserFirm,
    teaserMatchOutput,
    blurredFirms,
}: AnonymousInvestorsClientProps) {
    const [searchValue, setSearchValue] = useState("")
    const [signupWallOpen, setSignupWallOpen] = useState(false)
    const [signupTrigger, setSignupTrigger] = useState<SignupWallTrigger>("save")
    const [emailOpen, setEmailOpen] = useState(false)

    const openSignupWall = useCallback((trigger: SignupWallTrigger) => {
        setSignupTrigger(trigger)
        setSignupWallOpen(true)
    }, [])

    const handleSearchSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            openSignupWall("search")
        },
        [openSignupWall],
    )

    const triggerCopy = TRIGGER_COPY[signupTrigger]

    // Build the signup URL with the typed query carried through so the
    // post-signup landing can replay it. Empty query just lands on /investors.
    const signupHref = (() => {
        const trimmed = searchValue.trim()
        const base = "/signup?from=investors-anonymous"
        return trimmed
            ? `${base}&q=${encodeURIComponent(trimmed)}`
            : base
    })()

    return (
        <>
            {/* ─────────────────────────────────────────────────────
              * Search box. Typing freely is allowed (no signup wall on
              * keystroke), but submitting opens the wall. The "or skip"
              * close lets the founder keep browsing without losing context.
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
                        Search 7,800 investors
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                </form>
                <p className="text-[11px] text-muted-foreground pl-1">
                    Search runs the moment you sign up. We replay your typed
                    query against your live foundry profile.
                </p>
            </section>

            {/* ─────────────────────────────────────────────────────
              * Teaser card. Real firm row + curated match output.
              * Labelled EXAMPLE so the visitor never confuses it with
              * a match against their own profile.
              * ───────────────────────────────────────────────────── */}
            {teaserFirm && teaserMatchOutput && (
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-international-orange text-white text-[10px] font-mono font-bold uppercase tracking-widest">
                            Example
                        </span>
                        One fully-rendered match
                    </h2>
                    <Card className="overflow-hidden">
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                        <h3 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                                            {teaserFirm.title}
                                        </h3>
                                        {teaserFirm.attributes.firm_type && (
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] uppercase tracking-wider"
                                            >
                                                {normaliseFirmTypeLabel(teaserFirm.attributes.firm_type)}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        {teaserFirm.attributes.sectors?.length ? (
                                            <span>
                                                <span className="font-medium text-foreground">
                                                    Sector match
                                                </span>{" "}
                                                {teaserFirm.attributes.sectors
                                                    .slice(0, 3)
                                                    .join(", ")}
                                            </span>
                                        ) : null}
                                        {teaserFirm.attributes.stage_focus?.length ? (
                                            <>
                                                <span aria-hidden>·</span>
                                                <span>
                                                    <span className="font-medium text-foreground">
                                                        Stage
                                                    </span>{" "}
                                                    {teaserFirm.attributes.stage_focus
                                                        .slice(0, 3)
                                                        .join(", ")}
                                                </span>
                                            </>
                                        ) : null}
                                        {teaserFirm.attributes.cheque_range_gbp?.min !== undefined &&
                                            teaserFirm.attributes.cheque_range_gbp?.max !== undefined && (
                                                <>
                                                    <span aria-hidden>·</span>
                                                    <span>
                                                        <span className="font-medium text-foreground">
                                                            Cheque
                                                        </span>{" "}
                                                        £
                                                        {(
                                                            teaserFirm.attributes.cheque_range_gbp
                                                                .min ?? 0
                                                        ).toLocaleString()}
                                                        {" to £"}
                                                        {(
                                                            teaserFirm.attributes.cheque_range_gbp
                                                                .max ?? 0
                                                        ).toLocaleString()}
                                                    </span>
                                                </>
                                            )}
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openSignupWall("save")}
                                    className="h-8 px-3 whitespace-nowrap"
                                >
                                    Save to sandbox
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-5 pt-1 pb-5">
                            <section>
                                <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                                    Why {teaserFirm.title} would back you
                                </h4>
                                <p className="text-sm leading-relaxed text-foreground">
                                    {teaserMatchOutput.whyFit}
                                </p>
                            </section>

                            <section>
                                <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                                    How to pitch this to them
                                </h4>
                                <p className="text-sm leading-relaxed text-foreground">
                                    {teaserMatchOutput.howToPitch}
                                </p>
                            </section>

                            {teaserMatchOutput.sourceCitations.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {teaserMatchOutput.sourceCitations.map((citation, idx) => (
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
                                                {teaserMatchOutput.draftedEmailSubject}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                                                Body
                                            </div>
                                            <div className="rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground space-y-2">
                                                {teaserMatchOutput.draftedEmailBody
                                                    .split("\n\n")
                                                    .map((line, i) => (
                                                        <p key={i}>{line}</p>
                                                    ))}
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => openSignupWall("draft-email")}
                                            className="bg-international-orange hover:bg-international-orange-hover text-white"
                                        >
                                            Save this drafted email
                                            <ArrowRight className="h-3 w-3 ml-1.5" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </section>
            )}

            {/* ─────────────────────────────────────────────────────
              * Blurred locked cards. Each card is clickable and opens
              * the signup wall. Visual treatment matches the existing
              * paid-tier blurred state in InvestorMatchInsightCard.
              * ───────────────────────────────────────────────────── */}
            {blurredFirms.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground">
                        Plus {blurredFirms.length} more matches in your shortlist
                    </h2>
                    <div className="space-y-3">
                        {blurredFirms.map((firm) => (
                            <button
                                key={firm.id}
                                type="button"
                                onClick={() => openSignupWall("locked-card")}
                                className="w-full text-left group"
                                aria-label={`Locked match for ${firm.title}. Sign up to unlock.`}
                            >
                                <Card className="relative overflow-hidden transition-all group-hover:border-international-orange/50">
                                    {/* Blurred firm summary — visible enough to
                                      * confirm there is a real firm behind the
                                      * lock, blurred enough that the founder's
                                      * curiosity drives the click. */}
                                    <div className="select-none filter blur-[2px] pointer-events-none">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-semibold tracking-tight text-foreground">
                                                    {firm.title}
                                                </h3>
                                                {firm.attributes.firm_type && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] uppercase tracking-wider"
                                                    >
                                                        {normaliseFirmTypeLabel(firm.attributes.firm_type)}
                                                    </Badge>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0 space-y-2">
                                            <div className="h-3 w-3/4 rounded bg-muted" />
                                            <div className="h-3 w-2/3 rounded bg-muted" />
                                            <div className="h-3 w-1/2 rounded bg-muted" />
                                        </CardContent>
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                                        <div className="rounded-xl border bg-card shadow-lg p-4 max-w-sm text-center space-y-2">
                                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-international-orange/10">
                                                <Lock className="h-4 w-4 text-international-orange" />
                                            </div>
                                            <p className="text-sm font-semibold text-foreground">
                                                Sign up to see why {firm.title} would back you
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Same depth as the example above, generated against your live foundry profile.
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* ─────────────────────────────────────────────────────
              * Signup wall modal. "Save to your private sandbox"
              * framing per Tier 2 step 15 — the close action is
              * "skip and just browse", never "you must sign up".
              * ───────────────────────────────────────────────────── */}
            <Dialog open={signupWallOpen} onOpenChange={setSignupWallOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight">
                            {triggerCopy.title}
                        </DialogTitle>
                        <DialogDescription className="text-sm leading-relaxed text-muted-foreground pt-1">
                            {triggerCopy.body}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                        <Button
                            asChild
                            className="w-full bg-international-orange hover:bg-international-orange-hover text-white"
                        >
                            <Link href={signupHref}>
                                Save to my private sandbox
                                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                            </Link>
                        </Button>
                        <button
                            type="button"
                            onClick={() => setSignupWallOpen(false)}
                            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                        >
                            Or skip and keep browsing
                        </button>
                        <p className="text-[11px] text-center text-muted-foreground pt-1">
                            Free forever, no credit card required. Takes 20 seconds.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
