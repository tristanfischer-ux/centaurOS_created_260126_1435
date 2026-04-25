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
 *
 * 6-pillar breakdown: mirrors the investor match pillar bars pattern with dimensions
 * specific to supplier matching — Match / Capability / Materials / Certifications /
 * Verified / Region. Scores computed client-side from the listing record + search query.
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
// Supplier pillar score computation
// ---------------------------------------------------------------------------

/**
 * 6-pillar supplier match breakdown.
 * All values are 0-100 (whole numbers).
 *
 * INTENT: Mirrors the Investor MatchPillarBars pattern so both pages share
 * the same visual language. Scores are heuristic-but-honest — dimensions where
 * data doesn't exist render as 0 (displayed as "—" via hideEmpty flag).
 */
export interface SupplierPillars {
  match: number        // Overall semantic similarity (0-100 from pgvector cosine)
  capability: number   // % of listed process_capabilities present
  materials: number    // % of listed materials present (honest-empty if no data)
  certifications: number // Certification signal (honest-empty if no data)
  verified: number     // 100 if verified, 0 if not (shown as full/empty bar)
  region: number       // Geography match derived from query + listing.country
}

function fillHex(value: number): string {
  if (value >= 70) return '#22c55e'
  if (value >= 40) return '#f59e0b'
  return '#94a3b8'
}

const SUPPLIER_PILLAR_ORDER: Array<{ key: keyof SupplierPillars; label: string }> = [
  { key: 'match',         label: 'MATCH' },
  { key: 'capability',    label: 'CAPABILITY' },
  { key: 'materials',     label: 'MATERIALS' },
  { key: 'certifications', label: 'CERTS' },
  { key: 'verified',      label: 'VERIFIED' },
  { key: 'region',        label: 'REGION' },
]

/**
 * Compute supplier pillars client-side from the listing record + search query.
 * Returns honest-empty (0) for any dimension where the data isn't structured
 * enough to compute a real score — the UI renders these as "—".
 */
function computeSupplierPillars(
  listing: MarketplaceListing & { similarity?: number },
  searchQuery?: string,
): SupplierPillars {
  // Match: cosine similarity from pgvector, scaled to 0-100
  const match = listing.similarity != null
    ? Math.round(Math.min(100, Math.max(0, listing.similarity * 100)))
    : 0

  // Capability: if the listing has process_capabilities, score as 100
  // (we can't compare against query intent without parsing, so presence = signal)
  const capCount = listing.process_capabilities?.length ?? 0
  const capability = capCount > 0 ? Math.min(100, 40 + capCount * 12) : 0

  // Materials: presence signal — same heuristic as capability
  const matCount = listing.materials?.length ?? 0
  const materials = matCount > 0 ? Math.min(100, 40 + matCount * 15) : 0

  // Certifications: each cert adds ~25 points, capped at 100
  const certCount = listing.certifications?.length ?? 0
  const certifications = certCount > 0 ? Math.min(100, certCount * 25) : 0

  // Verified: boolean flag → full bar or empty
  const verified = listing.is_verified ? 100 : 0

  // Region: simple token-match between listing country and search query
  let region = 0
  if (searchQuery && listing.country) {
    const q = searchQuery.toLowerCase()
    const c = listing.country.toLowerCase()
    // Try direct substring match and common aliases
    if (q.includes(c) || c.includes('united kingdom') && (q.includes('uk') || q.includes('united kingdom') || q.includes('london') || q.includes('england'))
      || c.includes('united states') && (q.includes('us') || q.includes('usa') || q.includes('united states'))
      || c.includes('germany') && q.includes('german')
      || c.includes('france') && q.includes('french')
      || c.includes('china') && (q.includes('china') || q.includes('chinese'))) {
      region = 90
    } else if (q.includes('europe') && ['united kingdom', 'germany', 'france', 'netherlands', 'sweden', 'norway', 'denmark', 'spain', 'italy'].some(eu => c.includes(eu))) {
      region = 70
    }
  }

  return { match, capability, materials, certifications, verified, region }
}

// ---------------------------------------------------------------------------
// SupplierPillarBars — compact 6-bar row matching InvestorMatchCard layout
// ---------------------------------------------------------------------------

function SupplierPillarBars({
  pillars,
  className,
}: {
  pillars: SupplierPillars
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-6 gap-1.5', className)}>
      {SUPPLIER_PILLAR_ORDER.map(({ key, label }) => {
        const value = pillars[key]
        const isEmpty = value === 0
        return (
          <div
            key={key}
            className="flex flex-col items-center gap-0.5"
            title={isEmpty ? `${label}: —` : `${label}: ${value}`}
          >
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              {!isEmpty && (
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, value))}%`,
                    backgroundColor: fillHex(value),
                  }}
                />
              )}
            </div>
            <span className="text-[9px] font-medium text-muted-foreground leading-none tabular-nums">
              {isEmpty ? '—' : value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

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

  // 6-pillar breakdown — computed client-side from listing record + search query
  const pillars = computeSupplierPillars(listing, searchQuery)

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

        {/* 6-pillar breakdown bars — mirrors InvestorMatchCard layout */}
        <SupplierPillarBars pillars={pillars} className="w-full mt-1 mb-1" />

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
