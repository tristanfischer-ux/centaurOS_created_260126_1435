/**
 * @file supplier-match-insight-card.tsx
 *
 * @description RED-TEAM-PIVOT-PLAN spec 6f: per-result rendering of the
 * why-relevant + three-questions output for one supplier on the V2
 * suppliers page. Mirrors `InvestorMatchInsightCard` (Phase G) — same
 * heading/sections layout, same source-citation chips at the foot, same
 * tier-blurred overlay pattern.
 *
 * Tier behaviour (mode prop):
 * - 'full'    — paid users see the complete output.
 * - 'blurred' — free / anonymous users see blurred why-relevant + questions
 *               with an upgrade overlay anchored on top.
 *
 * The card is a Link to the supplier detail page so the founder can dive
 * deeper after reading the briefing.
 */

'use client'

import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Lock,
  Quote,
  ExternalLink,
  MapPin,
  MessageCircleQuestion,
  Sparkles,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type {
  SupplierMatchOutput,
  SupplierMatchCitation,
} from '@/actions/supplier-match-generation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupplierMatchInsightMode = 'full' | 'blurred'

export interface SupplierMatchInsightSupplier {
  /** marketplace_listings.id stringified — also used in the detail-page URL. */
  supplierId: string
  /** Stable React key from the shortlist row. */
  shortlistId: string
  /** Display name from the shortlist row. */
  name: string
  /** Optional headquarters / location string for the header chip. */
  hq: string | null
}

interface Props {
  /** Path to the project (e.g. `/the-forge-v2/projects/<uuid>`). The card
   *  appends `/suppliers/<supplierId>` to build its detail link. */
  baseHref: string
  supplier: SupplierMatchInsightSupplier
  /** The generated insight payload, when available. Always undefined for
   *  blurred mode (we render the placeholder copy instead). */
  matchOutput?: SupplierMatchOutput
  /** Render mode — see SupplierMatchInsightMode for details. */
  mode: SupplierMatchInsightMode
}

// ---------------------------------------------------------------------------
// Citation pill (mirrors InvestorMatchInsightCard's CitationPill)
// ---------------------------------------------------------------------------

function CitationPill({ citation }: { citation: SupplierMatchCitation }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium cursor-help',
              'bg-info/10 text-info border-info/20',
            )}
          >
            <Quote className="h-3 w-3" />
            {citation.source.length > 28
              ? citation.source.slice(0, 28) + '…'
              : citation.source}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          <div className="font-medium mb-1">{citation.claim}</div>
          <div className="text-muted-foreground">Source: {citation.source}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PLACEHOLDER_WHY = 'Brixham Precision has run 4 similar volume injection moulding jobs in 2024 and 2025, two of those in your sector. Tooling cost band matches your Q3 budget. Lead time 18 ± 3 days fits your launch window. ISO 9001 plus AS9100 (you will need the latter for the aviation original equipment manufacturer partnership).'
const PLACEHOLDER_Q1 = 'Capacity for parallel runs in Q1, they ran three simultaneous jobs in 2024 but you would be the fourth.'
const PLACEHOLDER_Q2 = 'Their stance on near-shore tooling sourcing, you mentioned intellectual property sensitivity, they have a stated United Kingdom-tooling-only policy that would help.'
const PLACEHOLDER_Q3 = 'Lead time compression on tooling iterations, your design is 80% locked but expect one to two revisions and you will need cost per revision before you commit.'

export function SupplierMatchInsightCard({
  baseHref,
  supplier,
  matchOutput,
  mode,
}: Props) {
  const isBlurred = mode === 'blurred'
  const showInsights = !!matchOutput && !isBlurred
  const detailHref = `${baseHref}/suppliers/${supplier.supplierId}`

  const questions = showInsights
    ? matchOutput!.questionsToAsk
    : [PLACEHOLDER_Q1, PLACEHOLDER_Q2, PLACEHOLDER_Q3]

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
                href={detailHref}
                className="text-base font-semibold tracking-tight hover:text-international-orange transition-colors line-clamp-1"
              >
                {supplier.name}
              </Link>
              {showInsights && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Sparkles className="h-3 w-3" />
                  Match insight
                </Badge>
              )}
            </div>
            {supplier.hq && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                <span>{supplier.hq}</span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            <Button asChild size="sm" variant="outline" className="h-8 px-2">
              <Link href={detailHref}>
                Open supplier
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-4">
        {/* WHY THIS SUPPLIER IS RELEVANT TO YOU */}
        <section className={cn(isBlurred && 'select-none')}>
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            Why this supplier is relevant to you
          </h3>
          <p
            className={cn(
              'text-sm leading-relaxed text-foreground',
              isBlurred && 'blur-[6px] pointer-events-none',
            )}
          >
            {showInsights ? matchOutput!.whyRelevant : PLACEHOLDER_WHY}
          </p>
        </section>

        {/* THREE QUESTIONS TO ASK */}
        <section className={cn(isBlurred && 'select-none')}>
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <MessageCircleQuestion className="h-3.5 w-3.5" />
            Three questions to ask them
          </h3>
          <ol
            className={cn(
              'space-y-1.5 text-sm leading-relaxed text-foreground list-decimal pl-5',
              isBlurred && 'blur-[6px] pointer-events-none',
            )}
          >
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </section>

        {/* Citations */}
        {showInsights && matchOutput!.sourceCitations.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {matchOutput!.sourceCitations.map((c, i) => (
              <CitationPill key={i} citation={c} />
            ))}
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
                  Upgrade to Starter to see why each supplier fits and what to ask them
                </p>
                <p className="text-xs text-muted-foreground">
                  £20/month. Every shortlisted supplier comes with a tailored why-fit and three qualifying questions drawn from this project&rsquo;s bill of materials.
                </p>
              </div>
              <Button asChild size="sm" className="w-full">
                <Link href="/pricing?from=supplier_match_insight">
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
            cached. Refreshes when this project&rsquo;s bill of materials or constraints change.
          </span>
        </CardFooter>
      )}
    </Card>
  )
}
