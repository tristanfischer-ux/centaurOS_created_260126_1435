/**
 * @file coming-soon.tsx — Pre-Phase Coming Soon bridge for /products.
 *
 * @description Server component rendered by the Products layout whenever the
 * current route sits under /products but not under /products/legacy. Shows the
 * optimistic "coming soon" message with the five-tab workbench preview and, if
 * the foundry has existing product records, a single link through to the
 * read-only legacy view at /products/legacy.
 *
 * Copy follows the PHASE-PLAN Pre-Phase brief: lead with what's coming,
 * preserve existing data, no failure framing.
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
// Kept light on copy so the page stays calm and optimistic.
const WORKBENCH_TABS = [
  {
    icon: Beaker,
    name: 'Hypothesis',
    blurb: 'Frame each product as a testable bet with If / Then / Because.',
  },
  {
    icon: Globe2,
    name: 'Market',
    blurb: 'Size the opportunity with TAM / SAM / SOM, sourced, not vibed.',
  },
  {
    icon: FileSearch,
    name: 'Evidence',
    blurb: 'Interviews, LOIs, and experiment logs that back every claim.',
  },
  {
    icon: Coins,
    name: 'Economics',
    blurb: 'Unit economics, pricing, and margins — live from The Forge.',
  },
  {
    icon: TrendingUp,
    name: 'Action',
    blurb: 'Investor-readiness checklist and promotion into The Forge.',
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
  } catch {
    // INTENT: Coming Soon page must never error out on a fetch. Zero is fine.
    legacyCount = 0
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Products</h1>
          <Badge variant="brand" size="sm" className="ml-1 uppercase tracking-wide">
            Coming Soon
          </Badge>
        </div>
        <p className={typography.pageSubtitle}>
          A new market-validation workbench is on the way.
        </p>
      </div>

      {/* Lead card — what's coming */}
      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-international-orange/10">
              <Package className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h2 className="text-base font-display font-medium text-foreground">
                Products is being redesigned
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                We&rsquo;ll be back with a five-tab workbench for market validation.
              </p>
            </div>
          </div>

          <p className="text-sm text-foreground leading-relaxed">
            The new Products experience covers hypothesis testing, TAM / SAM / SOM,
            evidence logs, unit economics, and investor-readiness scoring — all in
            one place. Your existing product records are preserved.
          </p>
        </CardContent>
      </Card>

      {/* Five-tab preview */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
          What&rsquo;s coming
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {WORKBENCH_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <Card key={tab.name}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-international-orange/10 flex-shrink-0">
                      <Icon className="h-4 w-4 text-international-orange" />
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
                  You have {legacyCount} existing product record
                  {legacyCount === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  View them read-only while the new workbench is built.
                </p>
              </div>
              <Link
                href="/products/legacy"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-international-orange hover:underline"
              >
                View read-only
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
