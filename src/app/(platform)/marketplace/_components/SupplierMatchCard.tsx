'use client'

/**
 * @file SupplierMatchCard.tsx
 *
 * @description Card component for a single supplier result in the marketplace
 * search panel. Mirrors the supplier-card pattern from SUPPLIES-MOCKUP-SUPPLIERS.html:
 * three-column layout (logo | body with name/headline/tags/trust | actions with location/badge/button).
 *
 * Why-fit: on expand, calls generateSupplierWhyFit(listingId, query) and shows
 * 1-2 LLM-generated sentences explaining the match. Renders a spinner while loading
 * and an honest fallback message on error.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ShieldCheck, MapPin, Star, Package, Clock, ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MarketplaceListing } from '@/actions/marketplace'
import { generateSupplierWhyFit } from '@/actions/suppliers'

// ---------------------------------------------------------------------------
// Logo initials helper
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// INTENT: Deterministic gradient per listing ID so cards don't all look the same.
const LOGO_GRADIENTS = [
  'from-slate-600 to-slate-800',
  'from-sky-600 to-blue-800',
  'from-pink-600 to-rose-700',
  'from-amber-500 to-orange-600',
  'from-emerald-600 to-teal-700',
  'from-violet-600 to-purple-700',
  'from-orange-500 to-red-600',
]

function logoGradient(id: string): string {
  // Simple hash on the id string
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return LOGO_GRADIENTS[hash % LOGO_GRADIENTS.length]
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupplierMatchCardProps {
  listing: MarketplaceListing & { similarity?: number }
  /** Semantic search query that produced this result — shown in why-fit area */
  searchQuery?: string
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrustSignals({ listing }: { listing: MarketplaceListing }) {
  const attrs = listing.attributes
  const rating = listing.average_rating ?? (attrs.rating_average as number | undefined)
  const reviews = listing.review_count ?? (attrs.total_reviews as number | undefined)
  const orders = attrs.total_bookings as number | string | undefined
  const replyHours = attrs.response_time_hours as number | undefined
  const leadDays = attrs.delivery_time_days as number | string | undefined

  const hasAny = rating || orders || replyHours || leadDays

  if (!hasAny) return null

  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-2 border-t border-border/50">
      {rating ? (
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-warning text-warning" />
          <strong className="text-foreground font-semibold tabular-nums">
            {Number(rating).toFixed(1)}
          </strong>
          {reviews ? ` (${reviews} reviews)` : ''}
        </span>
      ) : null}
      {orders ? (
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          <strong className="text-foreground font-semibold tabular-nums">{orders}</strong>
          {' orders'}
        </span>
      ) : null}
      {replyHours ? (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {'Replies in '}
          <strong className="text-foreground font-semibold">~{replyHours}h</strong>
        </span>
      ) : null}
      {leadDays ? (
        <span>
          {'Lead time '}
          <strong className="text-foreground font-semibold">{leadDays} days</strong>
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Why-fit expand sub-component
// ---------------------------------------------------------------------------

function WhyFitExpander({
  listingId,
  searchQuery,
}: {
  listingId: string
  searchQuery: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [whyFit, setWhyFit] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleExpand = (e: React.MouseEvent) => {
    // Prevent the Link navigation from firing when the expand button is clicked.
    e.preventDefault()
    e.stopPropagation()

    if (expanded) {
      setExpanded(false)
      return
    }

    // Already fetched — just show it.
    if (whyFit || fetchError) {
      setExpanded(true)
      return
    }

    // First expand — call the server action.
    setExpanded(true)
    startTransition(async () => {
      try {
        const result = await generateSupplierWhyFit(listingId, searchQuery)
        if (result.ok) {
          setWhyFit(result.whyFit)
        } else {
          setFetchError(true)
        }
      } catch {
        setFetchError(true)
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExpand}
        className={cn(
          'flex items-center gap-1.5 text-[11px] font-medium transition-colors',
          expanded
            ? 'text-international-orange'
            : 'text-muted-foreground hover:text-foreground'
        )}
        aria-expanded={expanded}
      >
        <Sparkles className="h-3 w-3 shrink-0" />
        Why this supplier
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="mt-2 rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs text-foreground leading-relaxed">
          {isPending ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analysing match…
            </span>
          ) : fetchError ? (
            <span className="text-muted-foreground italic">
              Could not generate insight — try refining your description.
            </span>
          ) : whyFit ? (
            whyFit
          ) : null}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SupplierMatchCard({ listing, searchQuery }: SupplierMatchCardProps) {
  const attrs = listing.attributes

  const location = [
    listing.city ?? (attrs.city as string | undefined),
    listing.country ?? (attrs.country as string | undefined),
  ]
    .filter(Boolean)
    .join(', ')

  // Tags: combine process_capabilities names, certifications, materials
  const capTags =
    listing.process_capabilities
      ?.slice(0, 3)
      .map((c) => c.process_name ?? c.process_category)
      .filter(Boolean) ?? []
  const certTags = (listing.certifications ?? []).slice(0, 3)
  const matTags = (listing.materials ?? []).slice(0, 2)
  const allTags = [...capTags, ...certTags, ...matTags].filter(
    (t, i, arr) => t && arr.indexOf(t) === i
  ) as string[]

  const headline =
    listing.description ||
    (attrs.headline as string | undefined) ||
    listing.subcategory

  const similarity = (listing as MarketplaceListing & { similarity?: number }).similarity

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className={cn(
        'group flex gap-4 bg-card border border-border rounded-xl p-4 sm:p-5',
        'hover:-translate-y-0.5 hover:shadow-sm hover:border-border-strong transition-all duration-200',
        'text-foreground no-underline'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'h-14 w-14 shrink-0 rounded-lg flex items-center justify-center',
          'bg-gradient-to-br text-white font-bold text-sm',
          logoGradient(listing.id)
        )}
        aria-hidden="true"
      >
        {getInitials(listing.title)}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Name + verified */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-base text-foreground leading-tight">
            {listing.title}
          </span>
          {listing.is_verified && (
            <Badge variant="success" className="text-xs gap-1 px-1.5 py-0.5">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </Badge>
          )}
          {similarity !== undefined && similarity > 0 && (
            <Badge variant="secondary" className="text-xs tabular-nums">
              {Math.round(similarity * 100)}% match
            </Badge>
          )}
        </div>

        {/* Headline */}
        {headline && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {headline}
          </p>
        )}

        {/* Tags */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags.slice(0, 7).map((tag) => (
              <span
                key={tag}
                className="text-[10.5px] px-1.5 py-0.5 rounded bg-muted text-foreground font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Why-fit — expand on demand */}
        {searchQuery && (
          <WhyFitExpander listingId={listing.id} searchQuery={searchQuery} />
        )}

        {/* Trust signals */}
        <TrustSignals listing={listing} />
      </div>

      {/* Actions column */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        {location && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
            <MapPin className="h-3 w-3 shrink-0" />
            {location}
          </span>
        )}

        {listing.subcategory && (
          <Badge variant="outline" className="text-[10.5px] text-muted-foreground">
            {listing.subcategory}
          </Badge>
        )}

        <Button
          size="sm"
          className="bg-international-orange hover:bg-international-orange text-white text-xs mt-auto"
          onClick={(e) => {
            // Prevent the Link navigation when the button itself is clicked
            // (user goes to the detail page via the card link; button is visual affordance)
            e.preventDefault()
            window.location.href = `/marketplace/${listing.id}`
          }}
        >
          View details
        </Button>
      </div>
    </Link>
  )
}
