/**
 * @file coming-soon.tsx — Pre-Phase Coming Soon bridge for /products.
 *
 * @description Server component rendered by the Products layout whenever the
 * current route sits under /products but not under /products/legacy. Shows the
 * optimistic "coming soon" message with the five-tab workbench preview and, if
 * the foundry has existing product records, a single link through to the
 * read-only legacy view at /products/legacy.
 *
 * Copy follows the PHASE-PLAN Pre-Phase brief + 2026-04-19 3-round red-team:
 * - Lead with the value, not the absence (no "we'll be back" / "on the way")
 * - One clear next action per card
 * - British spelling, no AI-emphasis, specific numbers over adjectives
 *
 * @related
 * - src/app/(platform)/products/layout.tsx — intercepts and renders this
 * - src/app/(platform)/products/legacy/page.tsx — read-only list
 * - FORGE-MOCKUP-PRODUCTS-V2.html — the preview target
 */

import Link from 'next/link'
import {
  Beaker,
  Globe2,
  FileSearch,
  Coins,
  TrendingUp,
  Package,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { typography } from '@/lib/design-system'
import { getProducts } from '@/actions/products'

// INTENT: Five previews of the workbench tabs — straight from PHASE-PLAN Pre-Phase.
// Copy refined 2026-04-19 post-R1 red-team: lead with the doing, not the framework.
const WORKBENCH_TABS = [
  {
    icon: Beaker,
    name: 'Hypothesis',
    blurb: 'Frame every product as a testable bet — what you believe, what you will test, why it matters.',
  },
  {
    icon: Globe2,
    name: 'Market',
    blurb: 'Size the opportunity with cited sources — no "AI estimated" placeholders.',
  },
  {
    icon: FileSearch,
    name: 'Evidence',
    blurb: 'Customer interviews, signed LOIs, and experiment results that back every claim.',
  },
  {
    icon: Coins,
    name: 'Economics',
    blurb: 'Unit economics, pricing, and margins — live from The Forge when linked.',
  },
  {
    icon: TrendingUp,
    name: 'Action',
    blurb: 'Investor-readiness checklist, then hand off to The Forge to build.',
  },
] as const

export async function ProductsComingSoon() {
  // DATA: Count legacy product records so we can surface the read-only link
  // only when it's useful. getProducts() is foundry-scoped and safe to call
  // here — it has withAuth inside and the page is already behind (platform)
  // auth. A failure degrades gracefully to 0.
  let legacyCount = 0
  try {
    const result = await getProducts()
    legacyCount = result.data?.length ?? 0
  } catch (err) {
    // INTENT: Coming Soon page must never error out on a fetch. Zero is fine —
    // but log so Vercel ops can see sustained failures (R3 red-team rule:
    // silent catch hides Supabase regressions from ops).
    console.error('[products/coming-soon] getProducts failed, defaulting legacyCount to 0', err)
    legacyCount = 0
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Products</h1>
          <Badge variant="outline" size="sm" className="uppercase tracking-wide">
            Beta
          </Badge>
        </div>
        <p className={typography.pageSubtitle}>
          Validate every product as a testable bet — hypothesis to unit economics, in one workbench.
        </p>
      </div>

      {/* Lead card — what the workbench does */}
      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-international-orange/10">
              <Package className="h-5 w-5 text-international-orange" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-display font-medium text-foreground">
                Turn ideas into investor-ready bets
              </h2>
            </div>
          </div>

          <p className="text-sm text-foreground leading-relaxed">
            Five tabs take a product from first hypothesis to investor pitch — each claim cited,
            every assumption tested, economics modelled from The Forge. See the shape below.
          </p>
        </CardContent>
      </Card>

      {/* Five-tab preview */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
          The five tabs
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {WORKBENCH_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <Card key={tab.name}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-international-orange/10 flex-shrink-0">
                      <Icon className="h-4 w-4 text-international-orange" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{tab.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tab.blurb}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Legacy bridge — only shown when data exists */}
      {legacyCount > 0 && (
        <Card className="border-international-orange/30">
          <CardContent className="py-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Your {legacyCount} product record{legacyCount === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Read-only preview — everything migrates to the new workbench when it lands.
                </p>
              </div>
              <Link
                href="/products/legacy"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-international-orange hover:underline"
              >
                Open
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fallback CTA when there's nothing else to do on this page (no legacy data).
          R1 red-team: "one clear next action per piece" — without this the page is a dead end. */}
      {legacyCount === 0 && (
        <div className="pt-2">
          <Link
            href="/today"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Back to Today
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  )
}
