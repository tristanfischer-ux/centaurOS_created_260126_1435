'use client'

/**
 * @file SupplierMatchCard.tsx
 *
 * @description Card component for a single supplier result in the marketplace
 * search panel. Ported to the Forge Capital search-result-card structure
 * (07b-export-python.py lines 2347-2360) — same visual vocabulary as the
 * investor directory card.
 *
 * Layout:
 *   Header row (flex justify-between):
 *     Left  — rank-aware name + supplier-type chip + meta line (country · capability count · cert count)
 *     Right — big composite % + "match" caption
 *   6-column scorecard grid (Forge Capital scorecard CSS pattern)
 *   Description paragraph (≤ 260 chars)
 *   Tags row (top capabilities, max 4)
 *   Why-fit button (bottom-right, on-demand — no expand chevron, just a small button)
 *
 * Scorecard bar colours:
 *   ≥ 70 → #16a34a (green, score-high)
 *   ≥ 40 → #f59e0b (amber, score-mid)
 *   < 40  → #dc2626 (red, score-low)
 *   0     → #d1d5db (grey, score-na)
 *
 * DECISION: Dropped lucide icon clutter (ShieldCheck/Star/Package/Clock/MapPin).
 * Restrained look: white bg, 1px border, 12px radius, ~14px padding.
 * DECISION: why-fit expand chevron replaced by a small bottom-right button;
 *   the WhyFitExpander logic is preserved intact.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Sparkles, Heart } from 'lucide-react'
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
 * data doesn't exist render as 0 (displayed as "—" via N/A bar style).
 */
export interface SupplierPillars {
  match: number        // Overall semantic similarity (0-100 from pgvector cosine)
  capability: number   // % of listed process_capabilities present
  materials: number    // % of listed materials present (honest-empty if no data)
  certifications: number // Certification signal (honest-empty if no data)
  verified: number     // 100 if verified, 0 if not (shown as full/empty bar)
  region: number       // Geography match derived from query + listing.country
}

/**
 * Returns the Forge Capital score-dim fill colour.
 *   ≥ 70 → #16a34a (score-high)
 *   ≥ 40 → #f59e0b (score-mid)
 *   < 40  → #dc2626 (score-low)
 *   0     → #d1d5db (score-na)
 */
function scoreFillColor(value: number): string {
  if (value === 0) return '#d1d5db'  // score-na
  if (value >= 70) return '#16a34a'  // score-high
  if (value >= 40) return '#f59e0b'  // score-mid
  return '#dc2626'                   // score-low
}

export const SUPPLIER_PILLAR_ORDER: Array<{ key: keyof SupplierPillars; label: string }> = [
  { key: 'match',         label: 'MATCH' },
  { key: 'capability',    label: 'CAPABILITY' },
  { key: 'materials',     label: 'MATERIALS' },
  { key: 'certifications', label: 'CERTS' },
  { key: 'verified',      label: 'VERIFIED' },
  { key: 'region',        label: 'REGION' },
]

/**
 * Compute supplier pillars client-side from the listing record + search query.
 * Returns honest-empty (0) for any dimension where data is insufficient — rendered
 * as grey N/A bars, not fake fills.
 */
export function computeSupplierPillars(
  listing: MarketplaceListing & { similarity?: number },
  searchQuery?: string,
): SupplierPillars {
  // Match: cosine similarity from pgvector, scaled to 0-100
  const match = listing.similarity != null
    ? Math.round(Math.min(100, Math.max(0, listing.similarity * 100)))
    : 0

  // Capability: presence of process_capabilities is the signal; more caps = higher score
  const capCount = listing.process_capabilities?.length ?? 0
  const capability = capCount > 0 ? Math.min(100, 40 + capCount * 12) : 0

  // Materials: same heuristic
  const matCount = listing.materials?.length ?? 0
  const materials = matCount > 0 ? Math.min(100, 40 + matCount * 15) : 0

  // Certifications: each cert adds ~25 points, capped at 100
  const certCount = listing.certifications?.length ?? 0
  const certifications = certCount > 0 ? Math.min(100, certCount * 25) : 0

  // Verified: boolean flag → full bar or empty
  const verified = listing.is_verified ? 100 : 0

  // Region: token-match between listing country and search query
  let region = 0
  if (searchQuery && listing.country) {
    const q = searchQuery.toLowerCase()
    const c = listing.country.toLowerCase()
    if (q.includes(c)
      || (c.includes('united kingdom') && (q.includes('uk') || q.includes('united kingdom') || q.includes('london') || q.includes('england')))
      || (c.includes('united states') && (q.includes('us') || q.includes('usa') || q.includes('united states')))
      || (c.includes('germany') && q.includes('german'))
      || (c.includes('france') && q.includes('french'))
      || (c.includes('china') && (q.includes('china') || q.includes('chinese')))) {
      region = 90
    } else if (q.includes('europe') && ['united kingdom', 'germany', 'france', 'netherlands', 'sweden', 'norway', 'denmark', 'spain', 'italy', 'belgium'].some(eu => c.includes(eu))) {
      region = 70
    }
  }

  return { match, capability, materials, certifications, verified, region }
}

// ---------------------------------------------------------------------------
// Forge Capital-style scorecard (6 columns, 5px bar, 9px label)
// ---------------------------------------------------------------------------

function SupplierScorecard({ pillars }: { pillars: SupplierPillars }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '6px',
        marginBottom: '10px',
      }}
    >
      {SUPPLIER_PILLAR_ORDER.map(({ key, label }) => {
        const value = pillars[key]
        const fillColor = scoreFillColor(value)
        const isNa = value === 0

        return (
          <div key={key} style={{ textAlign: 'center' }}>
            {/* Uppercase 9px label */}
            <div
              style={{
                fontSize: '9px',
                color: 'hsl(var(--muted-foreground))',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                marginBottom: '3px',
                fontWeight: 600,
              }}
            >
              {label}
            </div>

            {/* 5px tall bar */}
            <div
              style={{
                height: '5px',
                borderRadius: '3px',
                background: '#e5e7eb',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: '3px',
                  width: isNa ? '100%' : `${value}%`,
                  background: fillColor,
                }}
              />
            </div>

            {/* Numeric value or N/A */}
            <div
              style={{
                fontSize: '10px',
                color: isNa ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                marginTop: '2px',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isNa ? '—' : value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Supplier-type chip — small inline badge
// ---------------------------------------------------------------------------

function SupplierTypeChip({ type }: { type: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '10px',
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: '4px',
        background: 'hsl(var(--muted))',
        color: 'hsl(var(--muted-foreground))',
        verticalAlign: 'middle',
        lineHeight: '1.5',
        textTransform: 'capitalize',
      }}
    >
      {type}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Why-fit button — on-demand, bottom-right of card
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
    // Prevent the parent Link from navigating when the button is clicked.
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
          'flex items-center gap-1 text-[11px] font-medium transition-colors rounded px-1.5 py-0.5 border',
          expanded
            ? 'text-international-orange border-international-orange/30 bg-international-orange/5'
            : 'text-muted-foreground border-border hover:text-foreground hover:border-border-strong'
        )}
        aria-expanded={expanded}
      >
        <Sparkles className="h-3 w-3 shrink-0" />
        Why this fits
      </button>

      {expanded && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-foreground leading-relaxed">
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
// Types
// ---------------------------------------------------------------------------

export interface SupplierMatchCardProps {
  listing: MarketplaceListing & { similarity?: number }
  /** Rank position (1-based) in the results list — shown before the name */
  rank?: number
  /** Semantic search query that produced this result — for why-fit + region scoring */
  searchQuery?: string
  /** Whether this listing is in the user's saved set */
  isSaved?: boolean
  /** Whether a save/unsave action is in flight for this listing */
  isSaving?: boolean
  /** Callback to toggle saved state — receives the listing id + the click event */
  onToggleSave?: (listingId: string, e: React.MouseEvent) => void
}

// ---------------------------------------------------------------------------
// Main component — Forge Capital search-result-card structure
// ---------------------------------------------------------------------------

export function SupplierMatchCard({ listing, rank, searchQuery, isSaved = false, isSaving = false, onToggleSave }: SupplierMatchCardProps) {
  const attrs = listing.attributes

  // Composite match score for the right-column big number
  const similarity = (listing as MarketplaceListing & { similarity?: number }).similarity
  const compositeScore = similarity != null
    ? Math.round(Math.min(100, Math.max(0, similarity * 100)))
    : null

  // Supplier type chip — from attributes.supplier_type, or derive from category
  const supplierType =
    (attrs?.supplier_type as string | undefined) ||
    listing.subcategory ||
    listing.category ||
    ''

  // Meta line: country · capability count · cert count
  const country = listing.country ?? (attrs?.country as string | undefined) ?? ''
  const capCount = listing.process_capabilities?.length ?? 0
  const certCount = listing.certifications?.length ?? 0
  const metaParts: string[] = []
  if (country) metaParts.push(country)
  if (capCount > 0) metaParts.push(`${capCount} process${capCount !== 1 ? 'es' : ''}`)
  if (certCount > 0) metaParts.push(`${certCount} cert${certCount !== 1 ? 's' : ''}`)
  const metaLine = metaParts.join(' · ')

  // Description snippet — truncate to 260 chars
  const description =
    listing.description ||
    (attrs?.headline as string | undefined) ||
    listing.subcategory ||
    ''
  const snippet = description.length > 260 ? description.slice(0, 257) + '…' : description

  // Capability tags — top 4 UNIQUE process_capability names. Dedupe before
  // slicing so React never sees duplicate keys when a listing has repeated
  // process_name entries in process_capabilities[].
  const capTags = Array.from(
    new Set(
      (listing.process_capabilities ?? [])
        .map((c) => {
          if (typeof c === 'string') return c
          return (c as Record<string, unknown>)?.process_name as string | undefined
            ?? (c as Record<string, unknown>)?.process_category as string | undefined
        })
        .filter((t): t is string => Boolean(t)),
    ),
  ).slice(0, 4)

  // 6-pillar breakdown
  const pillars = computeSupplierPillars(listing, searchQuery)

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group block text-foreground no-underline"
      style={{
        background: 'hsl(var(--card))',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        borderRadius: '12px',
        padding: '14px 16px',
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
      }}
    >
      {/* ── Header row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px' }}>
        {/* Left: name + chip + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1.3, marginBottom: '3px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            {rank != null && (
              <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500, fontSize: '13px' }}>
                {rank}.
              </span>
            )}
            <span>{listing.title}</span>
            {supplierType && <SupplierTypeChip type={supplierType} />}
            {listing.is_verified === true && (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-success/30 bg-success/10 text-success"
                style={{ lineHeight: 1.4 }}
              >
                ✓ Verified by Forge
              </span>
            )}
          </div>
          {metaLine && (
            <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
              {metaLine}
            </div>
          )}
        </div>

        {/* Right: composite score + save heart */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {compositeScore != null && compositeScore > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '22px', fontWeight: 900, lineHeight: 1, color: 'hsl(var(--foreground))' }}>
                {compositeScore}%
              </div>
              <div style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                match
              </div>
            </div>
          )}
          {/* FIX 2: Heart / save toggle — stops link navigation via e.preventDefault */}
          {onToggleSave && (
            <button
              type="button"
              onClick={(e) => onToggleSave(listing.id, e)}
              disabled={isSaving}
              aria-label={isSaved ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: isSaving ? 'wait' : 'pointer',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isSaved ? '#ff4500' : 'hsl(var(--muted-foreground))',
                transition: 'color 0.15s ease',
              }}
            >
              {isSaving ? (
                <Loader2 style={{ width: '15px', height: '15px' }} className="animate-spin" />
              ) : (
                <Heart
                  style={{
                    width: '15px',
                    height: '15px',
                    fill: isSaved ? '#ff4500' : 'none',
                  }}
                />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── 6-column scorecard ── */}
      <SupplierScorecard pillars={pillars} />

      {/* ── Description snippet ── */}
      {snippet && (
        <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', lineHeight: 1.55, marginBottom: '8px', margin: '0 0 8px' }}>
          {snippet}
        </p>
      )}

      {/* ── Tags row + why-fit button row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        {/* Capability tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1 }}>
          {capTags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '10.5px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'hsl(var(--muted))',
                color: 'hsl(var(--foreground))',
                fontWeight: 500,
                border: '1px solid hsl(var(--border))',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Why-fit — small button, bottom-right */}
        {searchQuery && (
          <div style={{ flexShrink: 0 }}>
            <WhyFitExpander listingId={listing.id} searchQuery={searchQuery} />
          </div>
        )}
      </div>

      {/* Why-fit expanded text renders inline via the WhyFitExpander state above */}
    </Link>
  )
}
