/**
 * @file pricing-comparison-table.tsx
 *
 * @description Row-by-row comparison of Free / Starter / Add-on / Pro
 * directly under the four pricing tier cards on the homepage. Buy-or-bounce
 * report flagged that buyers cannot ladder Free to Starter to Pro in their
 * head when each tier card uses a different vocabulary (brainstorms vs leads
 * vs Deep Council). One ✓ or one number per cell, Starter visually emphasised
 * with the international-orange tint and a "RECOMMENDED" pill.
 *
 * Mobile: collapses to per-tier vertical stacks rather than a horizontal
 * scrolling table.
 */

'use client'

import { Check, Minus } from 'lucide-react'
import { AnimatedSection } from '@/components/marketing/animations'

interface ComparisonRow {
  feature: string
  free: string
  starter: string
  addOn: string
  pro: string
}

const ROWS: ComparisonRow[] = [
  {
    feature: 'Investor leads per month',
    free: '5 (lifetime)',
    starter: '100',
    addOn: '+100 / £10',
    pro: 'Unlimited',
  },
  {
    feature: 'Manufacturer search',
    free: 'check',
    starter: 'check',
    addOn: 'dash',
    pro: 'check',
  },
  {
    feature: 'Brainstorms per month',
    free: '1',
    starter: '10',
    addOn: 'dash',
    pro: 'Unlimited',
  },
  {
    feature: 'Saved searches',
    free: '5 (lifetime)',
    starter: 'Unlimited',
    addOn: 'dash',
    pro: 'Unlimited',
  },
  {
    feature: 'Drafted emails per investor',
    free: 'dash',
    starter: 'check',
    addOn: 'dash',
    pro: 'check',
  },
  {
    feature: 'Marketplace fee on first 3 orders',
    free: '0%',
    starter: '0%',
    addOn: 'dash',
    pro: '0%',
  },
  {
    feature: 'Specialist access',
    free: 'All disciplines',
    starter: 'All disciplines',
    addOn: 'dash',
    pro: 'All disciplines',
  },
  {
    feature: 'Deep Council (multi-specialist deep dive)',
    free: 'dash',
    starter: 'dash',
    addOn: 'dash',
    pro: 'check',
  },
]

function renderCell(value: string): React.ReactNode {
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

export function PricingComparisonTable() {
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
              <th className="px-3 lg:px-4 py-4 text-xs font-mono uppercase tracking-widest text-muted-foreground font-semibold">
                Free
              </th>
              <th className="px-3 lg:px-4 py-4 text-xs font-mono uppercase tracking-widest text-international-orange font-semibold bg-international-orange/[0.05] border-x border-international-orange/30">
                <div className="flex flex-col items-center gap-1">
                  <span>Starter</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-international-orange text-white text-[9px] font-mono uppercase tracking-widest">
                    Recommended
                  </span>
                </div>
              </th>
              <th className="px-3 lg:px-4 py-4 text-xs font-mono uppercase tracking-widest text-muted-foreground font-semibold">
                Add-on
              </th>
              <th className="px-3 lg:px-4 py-4 text-xs font-mono uppercase tracking-widest text-muted-foreground font-semibold">
                Pro
              </th>
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
                <td className="px-3 lg:px-4 py-3.5 text-center">
                  {renderCell(row.free)}
                </td>
                <td className="px-3 lg:px-4 py-3.5 text-center bg-international-orange/[0.05] border-x border-international-orange/30">
                  {renderCell(row.starter)}
                </td>
                <td className="px-3 lg:px-4 py-3.5 text-center">
                  {renderCell(row.addOn)}
                </td>
                <td className="px-3 lg:px-4 py-3.5 text-center">
                  {renderCell(row.pro)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile vertical stacks */}
      <div className="md:hidden space-y-4">
        {(
          [
            { name: 'Free', key: 'free' as const, emphasised: false },
            { name: 'Starter', key: 'starter' as const, emphasised: true },
            { name: 'Add-on', key: 'addOn' as const, emphasised: false },
            { name: 'Pro', key: 'pro' as const, emphasised: false },
          ]
        ).map((tier) => (
          <div
            key={tier.name}
            className={`rounded-2xl border p-5 ${
              tier.emphasised
                ? 'border-international-orange bg-international-orange/[0.05]'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p
                className={`text-xs font-mono uppercase tracking-widest font-semibold ${
                  tier.emphasised
                    ? 'text-international-orange'
                    : 'text-muted-foreground'
                }`}
              >
                {tier.name}
              </p>
              {tier.emphasised && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-international-orange text-white text-[9px] font-mono uppercase tracking-widest">
                  Recommended
                </span>
              )}
            </div>
            <ul className="space-y-2.5">
              {ROWS.map((row) => {
                const value = row[tier.key]
                return (
                  <li
                    key={row.feature}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">{row.feature}</span>
                    <span className="shrink-0">{renderCell(value)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </AnimatedSection>
  )
}
