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
import { useRouter } from 'next/navigation'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { createProduct, createIteration, generateMarketAssessment } from '@/actions/products'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { typography } from '@/lib/design-system'
import { toast } from 'sonner'
import { Hammer, Lightbulb, FileText, Package, ArrowRight, Lock, Loader2 } from 'lucide-react'
import type { ProductSummary, ProductLifecycle, ConvergenceStatus } from '@/types/product'
import { LIFECYCLE_LABELS } from '@/types/product'

// ─── Convergence badge config ─────────────────────────────────────────

const CONVERGENCE_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'destructive' }> = {
  improving: { label: 'Improving', variant: 'success' },
  moderate: { label: 'Moderate', variant: 'info' },
  plateauing: { label: 'Plateauing', variant: 'warning' },
  regressing: { label: 'Regressing', variant: 'destructive' },
  converged: { label: 'Converged', variant: 'info' },
}

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
  const router = useRouter()
  const [marketDialogOpen, setMarketDialogOpen] = React.useState(false)
  const [marketDescription, setMarketDescription] = React.useState('')
  const [problem, setProblem] = React.useState('')
  const [industry, setIndustry] = React.useState('')
  const [isCreating, setIsCreating] = React.useState(false)

  const handleMarketIdeaSubmit = React.useCallback(async () => {
    if (!marketDescription.trim() || !problem.trim()) {
      toast.error('Please fill in target market and problem')
      return
    }
    setIsCreating(true)
    try {
      const productName = industry.trim()
        ? `${industry.trim()} Product`
        : 'Market Opportunity Product'
      const description = `${marketDescription.trim()}\n\nProblem: ${problem.trim()}`

      const result = await createProduct({ name: productName, description })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (!result.data) {
        toast.error('Failed to create product')
        return
      }

      // INTENT: Create first iteration with zero scores for the new market-first product
      await createIteration(
        result.data.id,
        { market: 0, financial: 0, fundability: 0, manufacturing: 0 },
        [],
        'Initial product from market opportunity',
      )

      toast.success('Product created — running market assessment...')
      setMarketDialogOpen(false)

      // FLOW: Auto-trigger market assessment for market-first products
      generateMarketAssessment(result.data.id).catch(() => {
        // Non-critical — user can trigger manually from Market tab
      })

      router.push(`/products/${result.data.id}`)
    } catch {
      toast.error('Failed to create product')
    } finally {
      setIsCreating(false)
    }
  }, [marketDescription, problem, industry, router])

  const flows = [
    {
      title: 'From The Forge',
      description: 'Promote a completed design to a product',
      icon: Hammer,
      href: '/the-forge' as string | undefined,
      enabled: true,
      onClick: undefined as (() => void) | undefined,
    },
    {
      title: 'From a Market Idea',
      description: 'Start with your target market',
      icon: Lightbulb,
      href: undefined as string | undefined,
      enabled: true,
      onClick: (() => setMarketDialogOpen(true)) as (() => void) | undefined,
    },
    {
      title: 'From Your Business Plan',
      description: 'Upload a business plan on the Strategy page to extract products',
      icon: FileText,
      href: '/strategy' as string | undefined,
      enabled: true,
      badge: undefined as string | undefined,
      onClick: undefined as (() => void) | undefined,
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

          if (flow.enabled && flow.onClick) {
            const handler = flow.onClick
            return (
              <div key={flow.title} onClick={handler} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handler() }}>
                {content}
              </div>
            )
          }

          return <div key={flow.title}>{content}</div>
        })}
      </div>

      {/* Market Idea Dialog */}
      <Dialog open={marketDialogOpen} onOpenChange={setMarketDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create from a Market Idea</DialogTitle>
            <DialogDescription>
              Describe your market opportunity and we will help you build a product around it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="market-description">
                Describe your target market <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="market-description"
                value={marketDescription}
                onChange={(e) => setMarketDescription(e.target.value)}
                className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
                placeholder="e.g. Small UK manufacturers who need affordable quality inspection tools..."
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="market-problem">
                What problem does your product solve? <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="market-problem"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
                placeholder="e.g. Current solutions cost 10x more and require specialist training..."
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="market-industry">What industry?</Label>
              <Input
                id="market-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Manufacturing, Healthcare, Agriculture..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarketDialogOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleMarketIdeaSubmit} disabled={isCreating || !marketDescription.trim() || !problem.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Product'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

          {/* Convergence badge */}
          {product.latest_convergence_status && CONVERGENCE_BADGE[product.latest_convergence_status] && (
            <div className="mt-2">
              <Badge variant={CONVERGENCE_BADGE[product.latest_convergence_status].variant} size="sm">
                {CONVERGENCE_BADGE[product.latest_convergence_status].label}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
