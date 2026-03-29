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
import { updateProduct, deleteProduct, syncProductFinancials } from '@/actions/products'
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
} from 'lucide-react'
import type { Product, ProductLifecycle } from '@/types/product'
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
  { id: 'market', label: 'Market', enabled: false },
  { id: 'economics', label: 'Economics', enabled: true },
  { id: 'financials', label: 'Financials', enabled: false },
  { id: 'fundability', label: 'Fundability', enabled: false },
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
    </div>
  )
}
