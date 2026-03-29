/**
 * @file product-list-view.tsx — Client component for the /products page.
 *
 * @description Renders the product grid with Priya's briefing hero, empty state
 * with 3 creation flow cards, and product cards with lifecycle badges and
 * unit economics summary.
 *
 * @related
 * - src/app/(platform)/products/page.tsx — Server component
 * - src/actions/products.ts — Server actions
 * - src/types/product.ts — Types
 */

'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { typography } from '@/lib/design-system'
import { Hammer, Lightbulb, FileText, Package, ArrowRight, Lock } from 'lucide-react'
import type { ProductSummary, ProductLifecycle } from '@/types/product'
import { LIFECYCLE_LABELS } from '@/types/product'

// ─── Lifecycle badge variant mapping ─────────────────────────────────

const LIFECYCLE_VARIANT: Record<ProductLifecycle, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'brand' | 'outline'> = {
  concept: 'outline',
  researching: 'info',
  validated: 'info',
  prototyping: 'warning',
  pre_production: 'brand',
  in_market: 'success',
  deprecated: 'secondary',
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`
}

function formatMargin(pct: number): string {
  return `${pct.toFixed(1)}%`
}

function countByLifecycle(products: ProductSummary[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of products) {
    counts[p.lifecycle] = (counts[p.lifecycle] || 0) + 1
  }
  return counts
}

// ─── Props ──────────────────────────────────────────────────────────

interface ProductListViewProps {
  products: ProductSummary[]
}

// ─── Component ──────────────────────────────────────────────────────

export function ProductListView({ products }: ProductListViewProps) {
  // ── AI Briefing ──────────────────────────────────────────────────
  const briefingContext = React.useMemo(() => {
    const counts = countByLifecycle(products)
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')
    return `Products: ${products.length}${parts ? ` (${parts})` : ''}`
  }, [products])

  const briefingSeverity = React.useMemo(() => {
    return products.length === 0 ? 'warning' as const : 'success' as const
  }, [products.length])

  const briefing = usePageBriefing(
    () => generatePageBriefing('product-lead', briefingContext, briefingSeverity),
    briefingSeverity,
    true,
    'briefing-products',
  )

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Products</h1>
        </div>
        <p className={typography.pageSubtitle}>
          Your hardware products — from concept to market
        </p>
      </div>

      {/* Priya briefing */}
      <SpecialistBriefingHero
        specialistId="product-lead"
        specialistName="Priya"
        specialistTitle="Product Development"
        narrative={briefing.narrative}
        fallbackMessage={
          products.length === 0
            ? "No products yet. Let's get your first product defined — start from a Forge design, a market idea, or your business plan."
            : `You have ${products.length} product${products.length === 1 ? '' : 's'}. Let me review your portfolio.`
        }
        isLoading={briefing.isLoading}
        loadingMessage="Reviewing your product portfolio..."
        severity={briefing.severity}
        context={{ type: 'general', title: 'Products', description: briefingContext }}
      />

      {/* Empty state or product grid */}
      {products.length === 0 ? (
        <EmptyProductState />
      ) : (
        <div className="space-y-4">
          {/* New Product button */}
          <div className="flex justify-end">
            <Link
              href="/the-forge"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-international-orange bg-international-orange/10 rounded-md hover:bg-international-orange/20 transition-colors"
            >
              <Package className="h-4 w-4" />
              New Product
            </Link>
          </div>

          {/* Product grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────────────────

function EmptyProductState() {
  const flows = [
    {
      title: 'From The Forge',
      description: 'Promote a completed design to a product',
      icon: Hammer,
      href: '/the-forge',
      enabled: true,
    },
    {
      title: 'From a Market Idea',
      description: 'Start with your target market',
      icon: Lightbulb,
      href: undefined,
      enabled: false,
      badge: 'Coming soon',
    },
    {
      title: 'From Your Business Plan',
      description: 'Extract products from an uploaded plan',
      icon: FileText,
      href: undefined,
      enabled: false,
      badge: 'Coming soon',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-international-orange/10 mb-4">
          <Package className="h-6 w-6 text-international-orange" />
        </div>
        <h3 className="text-lg font-display font-medium text-foreground mb-2">
          No products yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Products bridge your designs, finances, and fundraising. Create your first product to start building your portfolio.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
        {flows.map((flow) => {
          const content = (
            <Card
              key={flow.title}
              className={
                flow.enabled
                  ? 'hover:-translate-y-0.5 active:scale-[0.99] duration-200 cursor-pointer'
                  : 'opacity-60'
              }
            >
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-international-orange/10">
                    {flow.enabled ? (
                      <flow.icon className="h-5 w-5 text-international-orange" />
                    ) : (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{flow.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{flow.description}</p>
                  </div>
                  {flow.badge && (
                    <Badge variant="outline" size="sm">{flow.badge}</Badge>
                  )}
                  {flow.enabled && (
                    <ArrowRight className="h-4 w-4 text-international-orange" />
                  )}
                </div>
              </CardContent>
            </Card>
          )

          if (flow.enabled && flow.href) {
            return (
              <Link key={flow.title} href={flow.href}>
                {content}
              </Link>
            )
          }

          return <div key={flow.title}>{content}</div>
        })}
      </div>
    </div>
  )
}

// ─── Product Card ───────────────────────────────────────────────────

function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link href={`/products/${product.id}`}>
      <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 cursor-pointer h-full">
        {/* Hero image */}
        {product.hero_image_url ? (
          <div className="relative h-36 w-full overflow-hidden rounded-t-lg bg-muted">
            <Image
              src={product.hero_image_url}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div className="h-24 w-full rounded-t-lg bg-muted flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground line-clamp-1">
              {product.name}
            </h3>
            <Badge variant={LIFECYCLE_VARIANT[product.lifecycle]} size="sm">
              {LIFECYCLE_LABELS[product.lifecycle]}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {product.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {product.description}
            </p>
          )}

          {/* Unit economics summary */}
          {(product.cogs_per_unit != null || product.gross_margin_pct != null) && (
            <div className="flex items-center gap-3 text-xs">
              {product.cogs_per_unit != null && (
                <span className="text-muted-foreground">
                  COGS: <span className="text-foreground font-medium">{formatPence(product.cogs_per_unit * 100)}</span>
                </span>
              )}
              {product.gross_margin_pct != null && (
                <span className="text-muted-foreground">
                  Margin: <span className="text-foreground font-medium">{formatMargin(product.gross_margin_pct)}</span>
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
