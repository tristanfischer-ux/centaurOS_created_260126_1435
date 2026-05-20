/**
 * @file RaiseChequeStrip.tsx
 *
 * @description Compact two-row comparison strip shown on investor match cards.
 * Sits below the firm name + sector tags, above the pillar bars.
 *
 * Shows the founder's target raise next to the investor's typical cheque size
 * with a colour-coded status badge so founders can see at a glance whether
 * this investor writes cheques in the right range — without inferring it from
 * a wt-25 bar.
 *
 * Props use GBP amounts in major units (same unit as cheque_range_gbp.min/max).
 * The caller is responsible for dividing cheque_min_cents / cheque_max_cents
 * by 100 before passing here.
 *
 * Mobile-responsive: at <640px the badge wraps below the "they write" row.
 */

'use client'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a GBP amount in major units as a compact label.
 *   500000  → "£500K"
 *   1500000 → "£1.5M"
 *   2000000 → "£2M"
 */
export function fmtRaise(gbp: number): string {
  if (gbp >= 1_000_000) {
    const m = gbp / 1_000_000
    return `£${m % 1 === 0 ? m : parseFloat(m.toFixed(1))}M`
  }
  if (gbp >= 1_000) {
    return `£${Math.round(gbp / 1_000)}K`
  }
  return `£${gbp}`
}

/** Format a range. Returns "£500K – £2M" or "£500K" (single bound) or null. */
function fmtRange(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = min != null && min > 0 ? fmtRaise(min) : null
  const hi = max != null && max > 0 ? fmtRaise(max) : null
  if (!lo && !hi) return null
  if (lo && hi) return `${lo} – ${hi}`
  return lo ?? hi
}

// ─── Status logic ─────────────────────────────────────────────────────────────

type StatusKey =
  | 'covers'
  | 'above_floor'
  | 'below_ceiling'
  | 'too_small'
  | 'too_big'
  | 'missing_data'

interface StatusResult {
  key: StatusKey
  dot: string   // Tailwind bg-* class
  label: string
}

function computeStatus(
  founderMin: number | null | undefined,
  founderMax: number | null | undefined,
  investorMin: number | null | undefined,
  investorMax: number | null | undefined,
): StatusResult {
  // Either side missing meaningful data → undetermined
  const fMin = founderMin != null && founderMin > 0 ? founderMin : null
  const fMax = founderMax != null && founderMax > 0 ? founderMax : null
  const iMin = investorMin != null && investorMin > 0 ? investorMin : null
  const iMax = investorMax != null && investorMax > 0 ? investorMax : null

  if (fMin == null && fMax == null) {
    // No founder data — can still show investor row, but no comparison
    return { key: 'missing_data', dot: 'bg-muted-foreground', label: 'Cheque size not disclosed' }
  }

  if (iMin == null && iMax == null) {
    return { key: 'missing_data', dot: 'bg-muted-foreground', label: 'Cheque size not disclosed' }
  }

  // Use 0 as fallback for one-sided bounds so comparisons still work
  const fm = fMin ?? 0
  const fx = fMax ?? fMin ?? 0
  const im = iMin ?? 0
  const ix = iMax ?? iMin ?? 0

  // Disjoint too small: investor max < founder min
  if (ix < fm) {
    return { key: 'too_small', dot: 'bg-red-500', label: `Disjoint — top cheque ${fmtRaise(ix)} is below your floor` }
  }

  // Disjoint too big: investor min > founder max
  if (im > fx) {
    return { key: 'too_big', dot: 'bg-amber-400', label: 'Would lead-only at your size' }
  }

  // Covers full range: investor min ≤ founder min AND investor max ≥ founder max
  if (im <= fm && ix >= fx) {
    return { key: 'covers', dot: 'bg-green-500', label: 'Covers your raise' }
  }

  // Above floor: investor min ≤ founder min AND investor max < founder max
  if (im <= fm && ix < fx) {
    const gap = fx - ix
    return { key: 'above_floor', dot: 'bg-amber-400', label: `Covers the bottom end — your ask exceeds their top by ${fmtRaise(gap)}` }
  }

  // Below ceiling: investor min > founder min AND investor max ≥ founder max
  if (im > fm && ix >= fx) {
    return { key: 'below_ceiling', dot: 'bg-amber-400', label: `Below your ceiling — your ask exceeds the top end by ${fmtRaise(im - fm)}` }
  }

  // Partial overlap (should not normally reach here, but handle gracefully)
  return { key: 'missing_data', dot: 'bg-muted-foreground', label: 'Partial overlap — check range' }
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface RaiseChequeStripProps {
  /** Founder's target raise lower bound, in GBP major units (e.g. 500000 = £500K) */
  founderMin?: number | null
  /** Founder's target raise upper bound, in GBP major units */
  founderMax?: number | null
  /** Investor's typical cheque lower bound, in GBP major units */
  investorMin?: number | null
  /** Investor's typical cheque upper bound, in GBP major units */
  investorMax?: number | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RaiseChequeStrip({
  founderMin,
  founderMax,
  investorMin,
  investorMax,
}: RaiseChequeStripProps) {
  const investorStr = fmtRange(investorMin, investorMax)

  // If there's no investor cheque data at all, render nothing — the chip row
  // already shows the range in a chip, no need to add a "not disclosed" strip.
  if (!investorStr) return null

  const hasFounderData = (founderMin != null && founderMin > 0) || (founderMax != null && founderMax > 0)
  const founderStr = fmtRange(founderMin, founderMax)

  const status = computeStatus(founderMin, founderMax, investorMin, investorMax)

  return (
    <div className="mb-2 rounded-md bg-muted/40 border border-border/30 px-2.5 py-1.5 text-[11px]">
      {/* Founder row — only when deck has been pasted */}
      {hasFounderData && founderStr && (
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="w-[100px] shrink-0 font-bold text-muted-foreground uppercase tracking-wider"
            style={{ fontSize: '9px' }}
          >
            YOU&apos;RE RAISING
          </span>
          <span className="font-semibold text-foreground">{founderStr}</span>
        </div>
      )}

      {/* Investor row + status badge */}
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-[100px] shrink-0 font-bold text-muted-foreground uppercase tracking-wider"
            style={{ fontSize: '9px' }}
          >
            THEY WRITE
          </span>
          <span className="font-semibold text-foreground">{investorStr}</span>
        </div>

        {/* Status badge — right-aligned on sm+, wraps below on mobile */}
        {hasFounderData && (
          <div className="flex items-center gap-1 sm:ml-auto shrink-0">
            <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${status.dot}`} />
            <span className="text-muted-foreground" style={{ fontSize: '9px' }}>{status.label}</span>
          </div>
        )}
      </div>
    </div>
  )
}
