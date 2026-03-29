/**
 * @file product-detail-view.tsx — Client component for product detail page.
 *
 * @description Renders the full product detail with hero image, lifecycle
 * progress indicator, linked CAD project card, and unit economics summary.
 * Tab structure is scaffolded for future phases (Market, Economics, etc).
 *
 * @related
 * - src/app/(platform)/products/[id]/page.tsx — Server component
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
import { updateProduct, deleteProduct, syncProductFinancials, generateMarketAssessment, scoreFundability } from '@/actions/products'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { typography } from '@/lib/design-system'
import { formatCurrency } from '@/types/payments'
import { toast } from 'sonner'
import {
  Package,
  Pencil,
  Trash2,
  ArrowLeft,
  Hammer,
  ExternalLink,
  Check,
  Lock,
  Loader2,
  Plus,
  X,
  AlertTriangle,
  Search,
  TrendingUp,
  Lightbulb,
  Target,
} from 'lucide-react'
import type { Product, ProductLifecycle, MarketAssessment, FundabilityScore } from '@/types/product'
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER } from '@/types/product'

// ─── Lifecycle styling ──────────────────────────────────────────────

const LIFECYCLE_VARIANT: Record<ProductLifecycle, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'brand' | 'outline'> = {
  concept: 'outline',
  researching: 'info',
  validated: 'info',
  prototyping: 'warning',
  pre_production: 'brand',
  in_market: 'success',
  deprecated: 'secondary',
}

// ─── Tabs ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'market', label: 'Market', enabled: true },
  { id: 'economics', label: 'Economics', enabled: true },
  { id: 'financials', label: 'Financials', enabled: false },
  { id: 'fundability', label: 'Fundability', enabled: true },
  { id: 'history', label: 'History', enabled: false },
] as const

// ─── Helpers ────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`
}

// ─── Props ──────────────────────────────────────────────────────────

interface ProductDetailViewProps {
  product: Product
}

// ─── Component ──────────────────────────────────────────────────────

export function ProductDetailView({ product: initialProduct }: ProductDetailViewProps) {
  const router = useRouter()
  const [product, setProduct] = React.useState(initialProduct)
  const [activeTab, setActiveTab] = React.useState('overview')
  const [isEditing, setIsEditing] = React.useState(false)
  const [editDescription, setEditDescription] = React.useState(product.description || '')
  const [isSaving, setIsSaving] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // ── Economics tab state ────────────────────────────────────────
  const [priceInput, setPriceInput] = React.useState(product.unit_price_pence ? String(product.unit_price_pence / 100) : '')
  const [volumeInput, setVolumeInput] = React.useState(product.target_monthly_units ? String(product.target_monthly_units) : '')

  // ── Fundability tab state ────────────────────────────────────────
  const [isScoring, setIsScoring] = React.useState(false)
  const [fundability, setFundability] = React.useState<FundabilityScore | null>(product.fundability_score)

  // ── Market tab state ─────────────────────────────────────────────
  const [isAssessing, setIsAssessing] = React.useState(false)
  const [marketDraft, setMarketDraft] = React.useState<MarketAssessment | null>(product.market_assessment)
  const [isSavingMarket, setIsSavingMarket] = React.useState(false)

  // ── AI Briefing ──────────────────────────────────────────────────
  const briefingContext = React.useMemo(() => {
    const parts: string[] = [`Product: ${product.name}`, `Stage: ${product.lifecycle}`]
    if (product.unit_economics?.cogs_per_unit_pence) {
      parts.push(`COGS: ${formatPence(product.unit_economics.cogs_per_unit_pence)}`)
    }
    if (product.unit_economics?.gross_margin_pct != null) {
      parts.push(`Margin: ${product.unit_economics.gross_margin_pct.toFixed(1)}%`)
    }
    if (product.cad_lab_project_id) parts.push('Linked to CAD Lab')
    return parts.join(', ')
  }, [product])

  const briefingSeverity = React.useMemo(() => {
    if (product.lifecycle === 'deprecated') return 'warning' as const
    return 'success' as const
  }, [product.lifecycle])

  const briefing = usePageBriefing(
    () => generatePageBriefing('product-lead', briefingContext, briefingSeverity),
    briefingSeverity,
    true,
    `briefing-product-${product.id}`,
  )

  // ── Handlers ─────────────────────────────────────────────────────
  const handleSaveDescription = React.useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await updateProduct(product.id, { description: editDescription })
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setProduct(result.data)
        setIsEditing(false)
        toast.success('Description updated')
      }
    } catch {
      toast.error('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [product.id, editDescription])

  const handleDelete = React.useCallback(async () => {
    if (!confirm('Delete this product? This cannot be undone.')) return
    setIsDeleting(true)
    try {
      const result = await deleteProduct(product.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Product deleted')
        router.push('/products')
      }
    } catch {
      toast.error('Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }, [product.id, router])

  const handleSavePricing = React.useCallback(async () => {
    const price = parseFloat(priceInput)
    const volume = parseInt(volumeInput)
    if (isNaN(price) || price <= 0 || isNaN(volume) || volume <= 0) {
      toast.error('Enter a valid price and volume')
      return
    }
    setIsSaving(true)
    try {
      const result = await updateProduct(product.id, {
        unit_price_pence: Math.round(price * 100),
        target_monthly_units: volume,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) setProduct(result.data)

      // INTENT: Auto-create/update Cash Burn items from product pricing
      const syncResult = await syncProductFinancials(product.id)
      if (syncResult.error) {
        toast.error(`Saved pricing, but sync failed: ${syncResult.error}`)
      } else {
        toast.success('Pricing saved & synced to Cash Burn')
      }
    } catch {
      toast.error('Failed to save pricing')
    } finally {
      setIsSaving(false)
    }
  }, [product.id, priceInput, volumeInput])

  // ── Fundability tab handler ──────────────────────────────────────
  const handleScoreFundability = React.useCallback(async () => {
    setIsScoring(true)
    try {
      const result = await scoreFundability(product.id)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setFundability(result.data)
        toast.success('Fundability score computed')
      }
    } catch {
      toast.error('Failed to compute fundability score')
    } finally {
      setIsScoring(false)
    }
  }, [product.id])

  // ── Market tab handlers ───────────────────────────────────────────

  const handleAssessMarket = React.useCallback(async () => {
    setIsAssessing(true)
    try {
      const result = await generateMarketAssessment(product.id)
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setMarketDraft(result.data)
        // INTENT: Re-fetch product to pick up lifecycle change (concept -> researching)
        const refreshed = await import('@/actions/products').then(m => m.getProduct(product.id))
        if (refreshed.data) setProduct(refreshed.data)
        toast.success('Market assessment generated — review and validate the findings')
      }
    } catch {
      toast.error('Failed to generate market assessment')
    } finally {
      setIsAssessing(false)
    }
  }, [product.id])

  const handleSaveAssessment = React.useCallback(async () => {
    if (!marketDraft) return
    setIsSavingMarket(true)
    try {
      const result = await updateProduct(product.id, { market_assessment: marketDraft })
      if (result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setProduct(result.data)
        toast.success('Market assessment saved')
      }
    } catch {
      toast.error('Failed to save assessment')
    } finally {
      setIsSavingMarket(false)
    }
  }, [product.id, marketDraft])

  /**
   * Updates a specific field in the market draft and marks it as founder_validated.
   */
  const updateMarketField = React.useCallback(<K extends keyof MarketAssessment>(
    field: K,
    value: MarketAssessment[K],
  ) => {
    setMarketDraft(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [field]: value,
        validation_status: {
          ...prev.validation_status,
          [field]: 'founder_validated' as const,
        },
      }
    })
  }, [])

  const lifecycleIndex = LIFECYCLE_ORDER.indexOf(product.lifecycle)

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Products
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={typography.pageHeader}>
              <div className={typography.pageHeaderAccent} />
              <h1 className={typography.h1}>{product.name}</h1>
              <Badge variant={LIFECYCLE_VARIANT[product.lifecycle]} size="sm">
                {LIFECYCLE_LABELS[product.lifecycle]}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Priya briefing */}
      <SpecialistBriefingHero
        specialistId="product-lead"
        specialistName="Priya"
        specialistTitle="Product Development"
        narrative={briefing.narrative}
        fallbackMessage={`Reviewing ${product.name} — currently in ${LIFECYCLE_LABELS[product.lifecycle]} stage.`}
        isLoading={briefing.isLoading}
        loadingMessage={`Analysing ${product.name}...`}
        severity={briefing.severity}
        context={{ type: 'general', title: product.name, description: briefingContext }}
      />

      {/* Tab bar */}
      <div className="border-b border-border">
        <div className="flex gap-0 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              disabled={!tab.enabled}
              className={`
                inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-international-orange text-international-orange'
                  : tab.enabled
                    ? 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    : 'border-transparent text-muted-foreground/50 cursor-not-allowed'
                }
              `}
            >
              {!tab.enabled && <Lock className="h-3 w-3" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content: Overview */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero image */}
            {product.hero_image_url ? (
              <Card>
                <CardContent className="p-0 overflow-hidden rounded-lg">
                  <div className="relative h-64 w-full bg-muted">
                    <Image
                      src={product.hero_image_url}
                      alt={product.name}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 66vw"
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                      <Package className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No hero image yet. Link a CAD Lab project to import one.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Description */}
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Description</h3>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full min-h-[120px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
                      placeholder="Describe your product..."
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditing(false)
                          setEditDescription(product.description || '')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveDescription}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {product.description || 'No description yet.'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Lifecycle progress */}
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Lifecycle</h3>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1">
                  {LIFECYCLE_ORDER.filter(s => s !== 'deprecated').map((stage, i) => {
                    const isCurrent = stage === product.lifecycle
                    const isPast = i < lifecycleIndex && product.lifecycle !== 'deprecated'
                    return (
                      <div key={stage} className="flex-1 flex flex-col items-center gap-1.5">
                        <div
                          className={`
                            h-2 w-full rounded-full transition-colors
                            ${isCurrent ? 'bg-international-orange' : isPast ? 'bg-international-orange/30' : 'bg-muted'}
                          `}
                        />
                        <span className={`text-[10px] font-medium ${isCurrent ? 'text-international-orange' : 'text-muted-foreground'}`}>
                          {LIFECYCLE_LABELS[stage]}
                        </span>
                        {isPast && (
                          <Check className="h-3 w-3 text-international-orange/50" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar column */}
          <div className="space-y-6">
            {/* Linked CAD Lab project */}
            {product.cad_lab_project_id && (
              <Card>
                <CardHeader>
                  <h3 className={typography.h3}>Linked Design</h3>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/the-forge/cad-lab?project=${product.cad_lab_project_id}`}
                    className="flex items-center gap-3 p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-international-orange/10">
                      <Hammer className="h-4 w-4 text-international-orange" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        CAD Lab Project
                      </p>
                      <p className="text-xs text-muted-foreground">
                        View in The Forge
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Unit economics */}
            {product.unit_economics && (
              <Card>
                <CardHeader>
                  <h3 className={typography.h3}>Unit Economics</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">COGS / unit</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatPence(product.unit_economics.cogs_per_unit_pence)}
                      </span>
                    </div>

                    {product.unit_economics.selling_price_pence != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Selling price</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatPence(product.unit_economics.selling_price_pence)}
                        </span>
                      </div>
                    )}

                    {product.unit_economics.gross_margin_pct != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Gross margin</span>
                        <span className="text-sm font-medium text-foreground">
                          {product.unit_economics.gross_margin_pct.toFixed(1)}%
                        </span>
                      </div>
                    )}

                    {product.unit_economics.cogs_confidence && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Confidence</span>
                        <Badge
                          variant={
                            product.unit_economics.cogs_confidence === 'high' ? 'success'
                            : product.unit_economics.cogs_confidence === 'medium' ? 'warning'
                            : 'outline'
                          }
                          size="sm"
                        >
                          {product.unit_economics.cogs_confidence}
                        </Badge>
                      </div>
                    )}

                    {/* COGS breakdown */}
                    {product.unit_economics.cogs_breakdown.length > 0 && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Breakdown</p>
                        <div className="space-y-1.5">
                          {product.unit_economics.cogs_breakdown.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate mr-2">{item.category}</span>
                              <span className="text-foreground font-medium shrink-0">
                                {formatPence(item.amount_pence)} ({item.pct}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick stats */}
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Details</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {product.unit_price_pence != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Unit price</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatPence(product.unit_price_pence)}
                      </span>
                    </div>
                  )}
                  {product.target_monthly_units != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Target monthly units</span>
                      <span className="text-sm font-medium text-foreground">
                        {product.target_monthly_units.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Created</span>
                    <span className="text-sm text-foreground">
                      {new Date(product.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab content: Market */}
      {activeTab === 'market' && (
        <div className="space-y-6">
          {/* Header with action button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Market Assessment</h2>
              <p className="text-sm text-muted-foreground">
                Research-backed market data for you to validate and refine.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {marketDraft && (
                <Button
                  onClick={handleSaveAssessment}
                  disabled={isSavingMarket}
                  variant="default"
                >
                  {isSavingMarket ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Assessment'
                  )}
                </Button>
              )}
              <Button
                onClick={handleAssessMarket}
                disabled={isAssessing}
                variant={marketDraft ? 'secondary' : 'default'}
              >
                {isAssessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-1" />
                    {marketDraft ? 'Re-assess Market' : 'Assess Market'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Staleness warning */}
          {marketDraft?.assessed_at && product.updated_at && (
            new Date(product.updated_at) > new Date(marketDraft.assessed_at)
          ) && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <p className="text-sm text-warning">
                Product details have changed since this assessment was generated. Consider re-assessing.
              </p>
            </div>
          )}

          {!marketDraft ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                    <Search className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">No market assessment yet</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Click &quot;Assess Market&quot; to generate research on market size, competitors, pricing, and opportunities for Priya to present.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* TAM / SAM / SOM Card */}
              <Card>
                <CardHeader>
                  <h3 className={typography.h3}>Market Size (TAM / SAM / SOM)</h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {(['tam_gbp', 'sam_gbp', 'som_gbp'] as const).map((field) => {
                      const labels = { tam_gbp: 'TAM', sam_gbp: 'SAM', som_gbp: 'SOM' }
                      const descriptions = {
                        tam_gbp: 'Total Addressable Market',
                        sam_gbp: 'Serviceable Addressable Market',
                        som_gbp: 'Serviceable Obtainable Market',
                      }
                      const status = marketDraft.validation_status[field]
                      return (
                        <div key={field} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={field}>{labels[field]}</Label>
                            <Badge variant={status === 'founder_validated' ? 'success' : 'warning'} size="sm">
                              {status === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{descriptions[field]}</p>
                          <Input
                            id={field}
                            type="number"
                            min={0}
                            value={marketDraft[field] ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : Number(e.target.value)
                              updateMarketField(field, val)
                            }}
                            placeholder="0"
                          />
                          {marketDraft[field] != null && (
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(marketDraft[field]!)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Target Customer Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className={typography.h3}>Target Customer</h3>
                    <Badge
                      variant={marketDraft.validation_status.target_customer === 'founder_validated' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {marketDraft.validation_status.target_customer === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <textarea
                    value={marketDraft.target_customer || ''}
                    onChange={(e) => updateMarketField('target_customer', e.target.value || null)}
                    className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background text-foreground resize-y"
                    placeholder="Describe your ideal customer..."
                  />

                  {/* Customer Segments */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-foreground">Customer Segments</h4>
                      <Badge
                        variant={marketDraft.validation_status.customer_segments === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.customer_segments === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Segment</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Size</th>
                            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Willingness to Pay</th>
                            <th className="text-right py-2 pl-4 font-medium text-muted-foreground w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketDraft.customer_segments.map((seg, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="py-2 pr-4">
                                <Input
                                  value={seg.name}
                                  onChange={(e) => {
                                    const updated = [...marketDraft.customer_segments]
                                    updated[i] = { ...seg, name: e.target.value }
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8"
                                />
                              </td>
                              <td className="py-2 px-4">
                                <Input
                                  type="number"
                                  min={0}
                                  value={seg.size ?? ''}
                                  onChange={(e) => {
                                    const updated = [...marketDraft.customer_segments]
                                    updated[i] = { ...seg, size: e.target.value === '' ? null : Number(e.target.value) }
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8 text-right"
                                />
                              </td>
                              <td className="py-2 px-4">
                                <Input
                                  type="number"
                                  min={0}
                                  value={seg.willingness_to_pay ?? ''}
                                  onChange={(e) => {
                                    const updated = [...marketDraft.customer_segments]
                                    updated[i] = { ...seg, willingness_to_pay: e.target.value === '' ? null : Number(e.target.value) }
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8 text-right"
                                  placeholder="pence"
                                />
                              </td>
                              <td className="py-2 pl-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const updated = marketDraft.customer_segments.filter((_, idx) => idx !== i)
                                    updateMarketField('customer_segments', updated)
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        updateMarketField('customer_segments', [
                          ...marketDraft.customer_segments,
                          { name: '', size: null, willingness_to_pay: null },
                        ])
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Segment
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Competitive Landscape Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className={typography.h3}>Competitive Landscape</h3>
                    <Badge
                      variant={marketDraft.validation_status.competitive_landscape === 'founder_validated' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {marketDraft.validation_status.competitive_landscape === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Competitor</th>
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">Strengths</th>
                          <th className="text-left py-2 px-4 font-medium text-muted-foreground">Weaknesses</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Price Point</th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketDraft.competitive_landscape.map((comp, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="py-2 pr-4">
                              <Input
                                value={comp.competitor}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, competitor: e.target.value }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <Input
                                value={comp.strengths}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, strengths: e.target.value }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <Input
                                value={comp.weaknesses}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, weaknesses: e.target.value }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <Input
                                type="number"
                                min={0}
                                value={comp.price_point ?? ''}
                                onChange={(e) => {
                                  const updated = [...marketDraft.competitive_landscape]
                                  updated[i] = { ...comp, price_point: e.target.value === '' ? null : Number(e.target.value) }
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8 text-right"
                                placeholder="pence"
                              />
                            </td>
                            <td className="py-2 pl-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = marketDraft.competitive_landscape.filter((_, idx) => idx !== i)
                                  updateMarketField('competitive_landscape', updated)
                                }}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      updateMarketField('competitive_landscape', [
                        ...marketDraft.competitive_landscape,
                        { competitor: '', strengths: '', weaknesses: '', price_point: null },
                      ])
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Competitor
                  </Button>
                </CardContent>
              </Card>

              {/* Pricing Analysis Card */}
              {marketDraft.pricing_analysis && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className={typography.h3}>Pricing Analysis</h3>
                      <Badge
                        variant={marketDraft.validation_status.pricing_analysis === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.pricing_analysis === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="rec-price">Recommended Price (pence)</Label>
                        <Input
                          id="rec-price"
                          type="number"
                          min={0}
                          value={marketDraft.pricing_analysis.recommended_price_pence ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.recommended_price_pence = e.target.value === '' ? null : Number(e.target.value)
                            updateMarketField('pricing_analysis', pa)
                          }}
                        />
                        {marketDraft.pricing_analysis.recommended_price_pence != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatPence(marketDraft.pricing_analysis.recommended_price_pence)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="pricing-model">Pricing Model</Label>
                        <Input
                          id="pricing-model"
                          value={marketDraft.pricing_analysis.pricing_model ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.pricing_model = e.target.value || null
                            updateMarketField('pricing_analysis', pa)
                          }}
                          placeholder="e.g. One-time purchase, Subscription"
                        />
                      </div>
                      <div>
                        <Label htmlFor="price-low">Price Range Low (pence)</Label>
                        <Input
                          id="price-low"
                          type="number"
                          min={0}
                          value={marketDraft.pricing_analysis.price_range_low_pence ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.price_range_low_pence = e.target.value === '' ? null : Number(e.target.value)
                            updateMarketField('pricing_analysis', pa)
                          }}
                        />
                        {marketDraft.pricing_analysis.price_range_low_pence != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatPence(marketDraft.pricing_analysis.price_range_low_pence)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="price-high">Price Range High (pence)</Label>
                        <Input
                          id="price-high"
                          type="number"
                          min={0}
                          value={marketDraft.pricing_analysis.price_range_high_pence ?? ''}
                          onChange={(e) => {
                            const pa = { ...marketDraft.pricing_analysis! }
                            pa.price_range_high_pence = e.target.value === '' ? null : Number(e.target.value)
                            updateMarketField('pricing_analysis', pa)
                          }}
                        />
                        {marketDraft.pricing_analysis.price_range_high_pence != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatPence(marketDraft.pricing_analysis.price_range_high_pence)}
                          </p>
                        )}
                      </div>
                    </div>
                    {marketDraft.pricing_analysis.reasoning && (
                      <div className="p-3 rounded-md bg-muted">
                        <p className="text-xs font-medium text-muted-foreground mb-1">AI Reasoning</p>
                        <p className="text-sm text-foreground">{marketDraft.pricing_analysis.reasoning}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Risks & Opportunities */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Market Risks */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className={typography.h3}>Market Risks</h3>
                      <Badge
                        variant={marketDraft.validation_status.market_risks === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.market_risks === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {marketDraft.market_risks.map((risk, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={risk}
                            onChange={(e) => {
                              const updated = [...marketDraft.market_risks]
                              updated[i] = e.target.value
                              updateMarketField('market_risks', updated)
                            }}
                            className="h-8"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateMarketField('market_risks', marketDraft.market_risks.filter((_, idx) => idx !== i))
                            }}
                            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => updateMarketField('market_risks', [...marketDraft.market_risks, ''])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Risk
                    </Button>
                  </CardContent>
                </Card>

                {/* Market Opportunities */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className={typography.h3}>Market Opportunities</h3>
                      <Badge
                        variant={marketDraft.validation_status.market_opportunities === 'founder_validated' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {marketDraft.validation_status.market_opportunities === 'founder_validated' ? 'Validated' : 'AI Estimated'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {marketDraft.market_opportunities.map((opp, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={opp}
                            onChange={(e) => {
                              const updated = [...marketDraft.market_opportunities]
                              updated[i] = e.target.value
                              updateMarketField('market_opportunities', updated)
                            }}
                            className="h-8"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateMarketField('market_opportunities', marketDraft.market_opportunities.filter((_, idx) => idx !== i))
                            }}
                            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => updateMarketField('market_opportunities', [...marketDraft.market_opportunities, ''])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Opportunity
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Assessment metadata */}
              {marketDraft.assessed_at && (
                <p className="text-xs text-muted-foreground text-right">
                  Last assessed: {new Date(marketDraft.assessed_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                  {marketDraft.model_used && ` | Model: ${marketDraft.model_used}`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab content: Economics */}
      {activeTab === 'economics' && (
        <div className="space-y-6">
          {/* Price & Volume */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Pricing & Volume</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="unit-price">Unit Price (&pound;)</Label>
                  <Input
                    id="unit-price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="e.g. 49.99"
                  />
                </div>
                <div>
                  <Label htmlFor="target-volume">Target Monthly Units</Label>
                  <Input
                    id="target-volume"
                    type="number"
                    min={0}
                    step={1}
                    value={volumeInput}
                    onChange={(e) => setVolumeInput(e.target.value)}
                    placeholder="e.g. 100"
                  />
                </div>
              </div>
              <Button onClick={handleSavePricing} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save & Sync to Cash Burn'}
              </Button>
            </CardContent>
          </Card>

          {/* Volume Sensitivity */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Volume Sensitivity</h3>
              {(() => {
                const unitPrice = product.unit_price_pence ?? 0
                const cogsPerUnit = product.unit_economics?.cogs_per_unit_pence ?? 0
                const targetUnits = product.target_monthly_units ?? 0

                if (!unitPrice || !targetUnits) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Set unit price and target monthly units above to see volume sensitivity.
                    </p>
                  )
                }

                const scenarios = [
                  { label: '50% volume', multiplier: 0.5 },
                  { label: '100% volume (target)', multiplier: 1 },
                  { label: '200% volume', multiplier: 2 },
                ]

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Scenario</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Units</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Monthly Revenue</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Monthly COGS</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Monthly Gross Profit</th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Annual Gross Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenarios.map((s) => {
                          const units = Math.round(targetUnits * s.multiplier)
                          const revenue = unitPrice * units
                          const cogs = cogsPerUnit * units
                          const grossProfit = revenue - cogs
                          const annualGross = grossProfit * 12

                          return (
                            <tr key={s.label} className="border-b border-border last:border-0">
                              <td className="py-2 pr-4 font-medium text-foreground">{s.label}</td>
                              <td className="text-right py-2 px-4 text-foreground">{units.toLocaleString()}</td>
                              <td className="text-right py-2 px-4 text-foreground">{formatCurrency(revenue / 100)}</td>
                              <td className="text-right py-2 px-4 text-foreground">{formatCurrency(cogs / 100)}</td>
                              <td className={`text-right py-2 px-4 font-medium ${grossProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {formatCurrency(grossProfit / 100)}
                              </td>
                              <td className={`text-right py-2 pl-4 font-medium ${annualGross >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {formatCurrency(annualGross / 100)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab content: Fundability */}
      {activeTab === 'fundability' && (
        <div className="space-y-6">
          {/* Score Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className={typography.h3}>Fundability Score</h3>
                <Button
                  onClick={handleScoreFundability}
                  disabled={isScoring}
                  size="sm"
                >
                  {isScoring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Scoring...
                    </>
                  ) : (
                    <>
                      <Target className="h-4 w-4 mr-1.5" />
                      {fundability ? 'Re-score' : 'Score Fundability'}
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {fundability ? (
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <span
                      className={`text-5xl font-bold tabular-nums ${
                        fundability.overall > 70 ? 'text-success'
                        : fundability.overall > 45 ? 'text-warning'
                        : 'text-destructive'
                      }`}
                    >
                      {fundability.overall}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">out of 100</span>
                  </div>
                  <div>
                    <Badge
                      variant={
                        fundability.investor_appetite === 'strong' ? 'success'
                        : fundability.investor_appetite === 'moderate' ? 'warning'
                        : 'destructive'
                      }
                      size="sm"
                    >
                      {fundability.investor_appetite === 'strong' ? 'Strong investor appetite'
                      : fundability.investor_appetite === 'moderate' ? 'Moderate investor appetite'
                      : 'Weak investor appetite'}
                    </Badge>
                    {fundability.scored_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last scored {new Date(fundability.scored_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                    <Target className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Score this product to see how fundable it is and get improvement suggestions.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          {fundability && (
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Score Breakdown</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Market Size', score: fundability.market_size_score, weight: '25%' },
                    { label: 'Margin', score: fundability.margin_score, weight: '25%' },
                    { label: 'Defensibility', score: fundability.defensibility_score, weight: '20%' },
                    { label: 'Team Readiness', score: fundability.team_readiness_score, weight: '15%' },
                    { label: 'Traction', score: fundability.traction_score, weight: '15%' },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {item.label}
                          <span className="text-xs text-muted-foreground ml-1">({item.weight})</span>
                        </span>
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            item.score > 70 ? 'text-success'
                            : item.score > 45 ? 'text-warning'
                            : 'text-destructive'
                          }`}
                        >
                          {item.score}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            item.score > 70 ? 'bg-success'
                            : item.score > 45 ? 'bg-warning'
                            : 'bg-destructive'
                          }`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Improvement Suggestions */}
          {fundability && fundability.improvement_suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className={typography.h3}>Improvement Suggestions</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fundability.improvement_suggestions.map((suggestion, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-md bg-muted/50">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-international-orange/10">
                        <Lightbulb className="h-4 w-4 text-international-orange" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{suggestion.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{suggestion.impact_description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" size="sm">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            +{suggestion.estimated_score_lift} pts
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            className="text-xs h-6 px-2"
                            title="Coming soon"
                          >
                            Apply to Design Brief
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
