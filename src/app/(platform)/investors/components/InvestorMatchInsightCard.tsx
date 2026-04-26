/**
 * @file InvestorMatchInsightCard.tsx
 *
 * @description Phase G: per-result rendering of the why-fit / how-to-pitch /
 * drafted-email output for one investor on the /investors page. Replaces the
 * stats-heavy card pattern with a search-first, read-the-output layout that
 * justifies the post-pivot pricing (£20 Starter / £10 add-on per 100 leads).
 *
 * Tier behaviour:
 * - Paid (Seed / Starter / Pro / Enterprise): renders full output.
 * - Free / Anonymous: renders blurred preview + upgrade CTA.
 * - Anonymous teaser slot: ONE result rendered fully as a teaser; the rest
 *   are blurred. The page chooses which result is the teaser.
 *
 * The expanded "View drafted email" panel opens inline with copy-to-clipboard
 * on subject + body so the founder pastes straight into Gmail.
 */

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Mail,
  Heart,
  Lock,
  Quote,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { InvestorFirm, InvestorMatchOutputView, InvestorMatchCitation } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RenderMode = 'full' | 'blurred' | 'teaser-only-first'

interface Props {
  firm: InvestorFirm
  matchOutput?: InvestorMatchOutputView
  /** 0-100 deterministic match score (from calculateMatchScore). */
  matchScore?: number
  /** Lead partner name to display in the header. Falls back to "Partner". */
  partnerName?: string
  partnerTitle?: string
  /** Render mode — blurred for free tier, full for paid, teaser-only for anonymous. */
  mode: RenderMode
  /** Click target — open detail page or run a side action. */
  onSave?: () => void
  isSaved?: boolean
  /**
   * Called when the founder clicks "Reveal why-fit" on a paid card that has
   * no matchOutput yet. Parent updates the matchOutputs map and re-renders
   * this card with the enriched output. Only passed on mode='full'.
   */
  onRevealWhyFit?: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CITATION_LABELS: Record<InvestorMatchCitation['type'], string> = {
  fund_decision: 'Fund decision',
  partner_statement: 'Partner statement',
  portfolio_precedent: 'Portfolio precedent',
}

const CITATION_TONES: Record<InvestorMatchCitation['type'], string> = {
  fund_decision: 'bg-international-orange/10 text-international-orange border-international-orange/20',
  partner_statement: 'bg-info/10 text-info border-info/20',
  portfolio_precedent: 'bg-success/10 text-success border-success/20',
}

function CitationPill({ citation }: { citation: InvestorMatchCitation }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium cursor-help',
              CITATION_TONES[citation.type],
            )}
          >
            <Quote className="h-3 w-3" />
            {CITATION_LABELS[citation.type]}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          <div className="font-medium mb-1">{citation.text}</div>
          <div className="text-muted-foreground">Source: {citation.source}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InvestorMatchInsightCard({
  firm,
  matchOutput,
  matchScore,
  partnerName,
  partnerTitle,
  mode,
  onSave,
  isSaved,
  onRevealWhyFit,
}: Props) {
  const [emailOpen, setEmailOpen] = useState(false)
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)
  const [isRevealing, startReveal] = useTransition()

  const isBlurred = mode === 'blurred'
  const showInsights = !!matchOutput && !isBlurred
  // Paid card with no enrichment yet — show the "Reveal why-fit" CTA.
  const canReveal = mode === 'full' && !matchOutput && !!onRevealWhyFit

  function handleReveal() {
    if (!onRevealWhyFit) return
    startReveal(() => onRevealWhyFit())
  }

  async function copyText(value: string, which: 'subject' | 'body') {
    try {
      await navigator.clipboard.writeText(value)
      if (which === 'subject') {
        setCopiedSubject(true)
        setTimeout(() => setCopiedSubject(false), 1500)
      } else {
        setCopiedBody(true)
        setTimeout(() => setCopiedBody(false), 1500)
      }
    } catch {
      /* clipboard denied — silent */
    }
  }

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all',
        isBlurred && 'relative',
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/investors/${firm.id}`}
                className="text-base font-semibold tracking-tight hover:text-international-orange transition-colors line-clamp-1"
              >
                {firm.title}
              </Link>
              {firm.attributes.firm_type && (
                <Badge variant="outline" className="text-[10px]">
                  {firm.attributes.firm_type}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              {typeof matchScore === 'number' && (
                <span className="font-medium text-foreground">
                  Match: {Math.round(matchScore)}%
                </span>
              )}
              {partnerName && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {partnerName}
                    {partnerTitle ? ` · ${partnerTitle}` : ' · Partner'}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onSave && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onSave}
                aria-label={isSaved ? 'Remove from shortlist' : 'Save to shortlist'}
                className="h-8 px-2"
              >
                <Heart
                  className={cn('h-4 w-4', isSaved && 'fill-international-orange text-international-orange')}
                />
                <span className="ml-1 text-xs hidden sm:inline">
                  {isSaved ? 'Saved' : 'Save'}
                </span>
              </Button>
            )}
            {showInsights && matchOutput && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEmailOpen((v) => !v)}
                className="h-8 px-2"
              >
                <Mail className="h-3.5 w-3.5 mr-1" />
                Draft email
                {emailOpen ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-4">
        {/* LAZY-LOAD: paid card with no enrichment yet — show Reveal CTA */}
        {canReveal && (
          <div className="flex flex-col items-center justify-center py-6 text-center rounded-lg bg-muted/30 border border-dashed border-border">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-international-orange/10 mb-3">
              <Sparkles className="h-5 w-5 text-international-orange" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">See why this investor fits</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs">
              We analyse their fund decisions, partner statements, and portfolio precedents against your profile.
            </p>
            <Button
              size="sm"
              variant="default"
              onClick={handleReveal}
              disabled={isRevealing}
              className="gap-2"
            >
              {isRevealing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analysing fit
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Reveal why-fit
                </>
              )}
            </Button>
          </div>
        )}

        {/* WHY YOU SHOULD INTEREST THEM */}
        {!canReveal && (
        <section className={cn(isBlurred && 'select-none')}>
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            Why you should interest them
          </h3>
          <p
            className={cn(
              'text-sm leading-relaxed text-foreground',
              isBlurred && 'blur-[6px] pointer-events-none',
            )}
          >
            {showInsights
              ? matchOutput!.whyFit
              : 'Conviction has led 4 of the last 6 UK food-tech Series A rounds in the £4-6M band. Your traction matches the operational maturity bar Tina cited as a deal-breaker on the Hardware in Climate podcast.'}
          </p>
        </section>
        )}

        {/* HOW TO PITCH THIS TO THEM */}
        {!canReveal && (
        <section className={cn(isBlurred && 'select-none')}>
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            How to pitch this to them
          </h3>
          <p
            className={cn(
              'text-sm leading-relaxed text-foreground',
              isBlurred && 'blur-[6px] pointer-events-none',
            )}
          >
            {showInsights
              ? matchOutput!.howToPitch
              : 'Open with unit economics — Conviction\'s last 3 deals anchored on cost-per-output, not top-line growth. Skip the TAM slide. Lead with your strongest contract.'}
          </p>
        </section>
        )}

        {/* Citations */}
        {showInsights && matchOutput!.sourceCitations.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {matchOutput!.sourceCitations.map((c, i) => (
              <CitationPill key={i} citation={c} />
            ))}
          </div>
        )}

        {/* Drafted email panel (paid only, opens inline) */}
        {showInsights && emailOpen && matchOutput && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Subject
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyText(matchOutput.draftedEmailSubject, 'subject')}
                  className="h-7 px-2 text-xs"
                >
                  {copiedSubject ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-success" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium">
                {matchOutput.draftedEmailSubject}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Body
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyText(matchOutput.draftedEmailBody, 'body')}
                  className="h-7 px-2 text-xs"
                >
                  {copiedBody ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-success" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <textarea
                readOnly
                value={matchOutput.draftedEmailBody}
                rows={Math.min(14, Math.max(8, Math.ceil(matchOutput.draftedEmailBody.length / 70)))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed font-sans resize-y"
              />
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              We draft a starting point. Edit it, then send from your own inbox.
            </p>
          </div>
        )}

        {/* Blurred-tier upsell overlay */}
        {isBlurred && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <div className="rounded-xl border bg-card shadow-lg p-5 max-w-sm text-center space-y-3">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-international-orange/10">
                <Lock className="h-5 w-5 text-international-orange" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Upgrade to Starter to see why this investor is a fit
                </p>
                <p className="text-xs text-muted-foreground">
                  £20/month — 100 personalised matches with why-fit, how-to-pitch and drafted outreach emails
                </p>
              </div>
              <Button asChild size="sm" className="w-full">
                <Link href="/pricing?from=investor_match_insight">
                  Upgrade for £20/month
                  <ExternalLink className="h-3 w-3 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {showInsights && matchOutput?.fromCache && (
        <CardFooter className="pt-0 pb-3">
          <span className="text-[10px] text-muted-foreground italic">
            cached · refreshes when your foundry profile changes
          </span>
        </CardFooter>
      )}
    </Card>
  )
}
