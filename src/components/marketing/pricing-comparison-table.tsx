/**
 * @file pricing-comparison-table.tsx
 *
 * @description Row-by-row comparison of the public pricing tiers, rendered
 * directly under the four pricing tier cards on the homepage and reused on
 * the dedicated `/pricing` page. Buy-or-bounce report flagged that buyers
 * cannot ladder Free to Starter to Pro in their head when each tier card
 * uses a different vocabulary (brainstorms vs leads vs Deep Council). One
 * tick or one number per cell, the featured tier visually emphasised with
 * the international-orange tint and a "RECOMMENDED" pill.
 *
 * Source of truth: `getPublicPlans()` and `INVESTOR_SEARCH_ADDON` from
 * `@/lib/billing/plans`. Adding or removing a public tier from plans.ts
 * flows automatically into this table without code changes here. The
 * Investor Search Add-On is a separate constant (it is not a subscription
 * tier, it is an in-product upsell), so it is rendered as an extra column
 * between Starter and Pro.
 *
 * Mobile: collapses to per-tier vertical stacks rather than a horizontal
 * scrolling table.
 */

'use client'

import { Check, Minus } from 'lucide-react'
import { AnimatedSection } from '@/components/marketing/animations'
import {
  getPublicPlans,
  INVESTOR_SEARCH_ADDON,
  type SubscriptionPlan,
} from '@/lib/billing/plans'

/**
 * Cell value contract.
 * - 'check'  → tick icon (feature included)
 * - 'dash'   → muted dash icon (feature not included / not applicable)
 * - string   → rendered as a value (e.g. "100", "Unlimited", "5 (lifetime)")
 */
type CellValue = 'check' | 'dash' | string

interface ComparisonRow {
  feature: string
  /**
   * Per-plan value lookup. Receives the plan's `limits` block and the
   * plan itself; returns the cell value to render.
   */
  getValue: (plan: SubscriptionPlan) => CellValue
  /**
   * Value to render in the Investor Search Add-On column. The add-on is
   * not a subscription tier so it has no `limits` block.
   */
  addOn: CellValue
}

/**
 * Format a `null | number` allowance from a plan's `limits` block.
 * - `null`        → 'Unlimited'
 * - `0`           → 'dash'
 * - positive int  → comma-formatted string
 */
function formatAllowance(value: number | null): CellValue {
  if (value === null) return 'Unlimited'
  if (value === 0) return 'dash'
  return value.toLocaleString('en-GB')
}

const ROWS: ComparisonRow[] = [
  {
    feature: 'Investor leads per month',
    getValue: (plan) => {
      // Free tier shows the lifetime saved-search cap rather than 0 leads
      // because it more accurately matches what the user gets — sandboxed
      // browse access with a small lifetime cap, not a monthly allowance.
      if (plan.tier === 'free' && plan.limits.savedSearchesLifetime !== null) {
        return `${plan.limits.savedSearchesLifetime} (lifetime)`
      }
      return formatAllowance(plan.limits.investorLeadsPerMonth)
    },
    addOn: '+100 / £10',
  },
  {
    feature: 'Manufacturer search',
    // Marketplace browse is on every paid + free tier
    getValue: () => 'check',
    addOn: 'dash',
  },
  {
    feature: 'Brainstorms per month',
    getValue: (plan) => formatAllowance(plan.limits.brainstormSessionsPerMonth),
    addOn: 'dash',
  },
  {
    feature: 'Saved searches',
    getValue: (plan) => {
      if (plan.limits.savedSearchesLifetime !== null) {
        return `${plan.limits.savedSearchesLifetime} (lifetime)`
      }
      return 'Unlimited'
    },
    addOn: 'dash',
  },
  {
    feature: 'Drafted emails per investor',
    // Drafted emails ship with the full investor lead bundle. Tied to
    // having a non-zero monthly lead allowance OR an unlimited allowance.
    getValue: (plan) => {
      const leads = plan.limits.investorLeadsPerMonth
      if (leads === null || (typeof leads === 'number' && leads > 0)) return 'check'
      return 'dash'
    },
    addOn: 'dash',
  },
  {
    feature: 'Marketplace fee on first 3 orders',
    // Every new account gets 0% on first 3 orders, regardless of tier
    getValue: () => '0%',
    addOn: 'dash',
  },
  {
    feature: 'Specialist access',
    getValue: () => 'All disciplines',
    addOn: 'dash',
  },
  {
    feature: 'Deep Council (multi-specialist deep dive)',
    // Deep Council is a Pro+ feature. We use the apiAccess flag as a
    // reasonable proxy for "Pro tier or above" until a dedicated capability
    // flag lands.
    getValue: (plan) => (plan.limits.apiAccess === true ? 'check' : 'dash'),
    addOn: 'dash',
  },
]

/**
 * Renders one cell. 'check' and 'dash' render an icon, anything else is a
 * verbatim string.
 */
function renderCell(value: CellValue): React.ReactNode {
  if (value === 'check') {
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-international-orange/10 text-international-orange">
        <Check className="h-3.5 w-3.5" aria-label="Included" />
      </span>
    )
  }
  if (value === 'dash') {
    return (
      <span className="inline-flex items-center justify-center h-6 w-6 text-muted-foreground/60">
        <Minus className="h-3.5 w-3.5" aria-label="Not included" />
      </span>
    )
  }
  return <span className="text-sm text-foreground font-medium">{value}</span>
}

/**
 * Synthetic "column" descriptor unifying real plans with the Investor
 * Search Add-On so the render loop can iterate over a single list.
 */
interface Column {
  /** Stable react key */
  key: string
  /** Display label in the header */
  label: string
  /** Whether this column is the featured / "RECOMMENDED" column */
  emphasised: boolean
  /** Resolves the cell value for a given row */
  resolve: (row: ComparisonRow) => CellValue
}

/**
 * Builds the column list from the public-plan catalogue plus the add-on.
 *
 * Plan order is preserved from `getPublicPlans()`. Enterprise is filtered
 * out of this table view because the comparison is targeted at the
 * self-serve buyer; Enterprise has its own contact-sales card on the
 * pricing page. The add-on is inserted directly after Starter so the
 * visual flow is Free → Starter → Add-on → Pro.
 */
function buildColumns(): Column[] {
  const plans = getPublicPlans().filter((p) => p.tier !== 'enterprise')

  const planColumns: Column[] = plans.map((plan) => ({
    key: plan.tier,
    label: plan.name,
    emphasised: plan.featured === true,
    resolve: (row) => row.getValue(plan),
  }))

  const addOnColumn: Column = {
    key: 'investor_search_addon',
    label: 'Add-on',
    emphasised: false,
    resolve: (row) => row.addOn,
  }

  // Insert the add-on directly after the featured plan (Starter). If no
  // featured plan exists, fall back to inserting after position 1 so the
  // visual flow stays Free → Starter → Add-on → Pro.
  const featuredIndex = planColumns.findIndex((c) => c.emphasised)
  const insertAt = featuredIndex >= 0 ? featuredIndex + 1 : 1

  const columns = [...planColumns]
  columns.splice(insertAt, 0, addOnColumn)
  return columns
}

export function PricingComparisonTable() {
  const columns = buildColumns()

  // Sanity check — INVESTOR_SEARCH_ADDON should be referenced so the
  // compiler errors visibly if the export is removed from plans.ts.
  // The label comes through the addOn column above; this is belt-and-braces.
  void INVESTOR_SEARCH_ADDON.id

  return (
    <AnimatedSection delay={0.15} className="mt-10 sm:mt-14">
      <div className="text-center mb-6 sm:mb-8">
        <h3 className="font-playfair text-xl sm:text-2xl md:text-3xl font-black mb-2 leading-tight">
          What you get on each tier
        </h3>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          One row per feature. One number or one tick per cell.
        </p>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed mt-3">
          The marketplace is where you engage fractional executives at their own day rates. ForgeOS takes a small platform fee on each engagement, waived on your first three orders.
        </p>
      </div>

      {/* Desktop / tablet table */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 lg:px-6 py-4 text-xs font-mono uppercase tracking-widest text-muted-foreground font-semibold">
                Feature
              </th>
              {columns.map((col) =>
                col.emphasised ? (
                  <th
                    key={col.key}
                    className="px-3 lg:px-4 py-4 text-xs font-mono uppercase tracking-widest text-international-orange font-semibold bg-international-orange/[0.05] border-x border-international-orange/30"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{col.label}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-international-orange text-white text-[9px] font-mono uppercase tracking-widest">
                        Recommended
                      </span>
                    </div>
                  </th>
                ) : (
                  <th
                    key={col.key}
                    className="px-3 lg:px-4 py-4 text-xs font-mono uppercase tracking-widest text-muted-foreground font-semibold"
                  >
                    {col.label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, idx) => (
              <tr
                key={row.feature}
                className={
                  idx === ROWS.length - 1
                    ? ''
                    : 'border-b border-border'
                }
              >
                <td className="px-4 lg:px-6 py-3.5 text-sm text-foreground font-medium">
                  {row.feature}
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.emphasised
                        ? 'px-3 lg:px-4 py-3.5 text-center bg-international-orange/[0.05] border-x border-international-orange/30'
                        : 'px-3 lg:px-4 py-3.5 text-center'
                    }
                  >
                    {renderCell(col.resolve(row))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile vertical stacks */}
      <div className="md:hidden space-y-4">
        {columns.map((col) => (
          <div
            key={col.key}
            className={`rounded-2xl border p-5 ${
              col.emphasised
                ? 'border-international-orange bg-international-orange/[0.05]'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p
                className={`text-xs font-mono uppercase tracking-widest font-semibold ${
                  col.emphasised
                    ? 'text-international-orange'
                    : 'text-muted-foreground'
                }`}
              >
                {col.label}
              </p>
              {col.emphasised && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-international-orange text-white text-[9px] font-mono uppercase tracking-widest">
                  Recommended
                </span>
              )}
            </div>
            <ul className="space-y-2.5">
              {ROWS.map((row) => (
                <li
                  key={row.feature}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="text-muted-foreground">{row.feature}</span>
                  <span className="shrink-0">{renderCell(col.resolve(row))}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AnimatedSection>
  )
}
