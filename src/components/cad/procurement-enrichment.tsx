'use client'

/**
 * @file procurement-enrichment.tsx — Real market data panels for Procurement stage.
 *
 * @description Adds live pricing, certification requirements, and supplier ratings
 * from the Forge data tables to the Procurement workflow. Designed as additive panels
 * that sit alongside the existing estimation components.
 */

import { useEffect, useState } from 'react'
import {
  DollarSign,
  Shield,
  Star,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Link2,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getLiveSupplierPricing } from '@/actions/supplier-pricing'

// ============================================================================
// TYPES
// ============================================================================

interface PricingData {
  component_name: string
  pricing_tiers: Array<{
    qty_min: number
    qty_max: number | null
    unit_price_usd: number
    source: string
  }>
  moq: number
  lead_time_days: Record<string, string> | null
  currency: string
}

interface CertificationData {
  component_name: string
  certifications: Array<{
    standard: string
    status: string
  }>
}

interface SupplierReview {
  entity_name: string
  rating: number
  title: string | null
}

// ============================================================================
// MAIN PANEL
// ============================================================================

interface ProcurementEnrichmentProps {
  /** Component names from the modules (used to look up enrichment data) */
  componentNames: string[]
  /** Batch size from diagnostics (to highlight relevant pricing tiers) */
  batchSize?: number
}

/**
 * ProcurementEnrichment — Panels showing real pricing, certifications, and
 * supplier reviews for components in the current project.
 *
 * @description Fetches enrichment data from component_pricing,
 * component_certifications, and entity_reviews tables. Displays in
 * collapsible sections within the procurement workflow.
 */
export function ProcurementEnrichment({
  componentNames,
  batchSize = 1,
}: ProcurementEnrichmentProps) {
  const [pricing, setPricing] = useState<PricingData[]>([])
  const [certifications, setCertifications] = useState<CertificationData[]>([])
  const [supplierReviews, setSupplierReviews] = useState<Record<string, { avg: number; count: number }>>({})
  const [liveSupplierResults, setLiveSupplierResults] = useState<Awaited<ReturnType<typeof getLiveSupplierPricing>>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPricingExpanded, setIsPricingExpanded] = useState(true)
  const [isCertsExpanded, setIsCertsExpanded] = useState(true)

  useEffect(() => {
    if (componentNames.length === 0) {
      setIsLoading(false)
      return
    }

    async function loadData() {
      setIsLoading(true)
      const supabase = createClient()

      const [pricingRes, certsRes, reviewsRes] = await Promise.all([
        supabase
          .from('component_pricing')
          .select('component_name, pricing_tiers, moq, lead_time_days, currency')
          .in('component_name', componentNames),
        supabase
          .from('component_certifications')
          .select('component_name, certifications')
          .in('component_name', componentNames),
        supabase
          .from('entity_reviews')
          .select('entity_name, rating')
          .eq('entity_type', 'supplier'),
      ])

      if (pricingRes.data) {
        setPricing(pricingRes.data as unknown as PricingData[])
      }
      if (certsRes.data) {
        setCertifications(certsRes.data as unknown as CertificationData[])
      }
      if (reviewsRes.data) {
        const reviewMap: Record<string, { total: number; count: number }> = {}
        for (const r of reviewsRes.data) {
          const name = r.entity_name as string
          if (!reviewMap[name]) reviewMap[name] = { total: 0, count: 0 }
          reviewMap[name].total += r.rating
          reviewMap[name].count += 1
        }
        const mapped: Record<string, { avg: number; count: number }> = {}
        for (const [name, acc] of Object.entries(reviewMap)) {
          mapped[name] = {
            avg: Math.round((acc.total / acc.count) * 10) / 10,
            count: acc.count,
          }
        }
        setSupplierReviews(mapped)
      }

      if (componentNames.length > 0) {
        try {
          const firstQuery = componentNames[0]
          const live = await getLiveSupplierPricing(firstQuery)
          setLiveSupplierResults(live)
        } catch {
          setLiveSupplierResults([])
        }
      }
      setIsLoading(false)
    }

    loadData()
  }, [componentNames])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  const hasPricing = pricing.length > 0
  const hasCerts = certifications.length > 0
  const hasReviews = Object.keys(supplierReviews).length > 0
  const hasLiveSupplier = liveSupplierResults.length > 0

  if (!hasPricing && !hasCerts && !hasReviews && !hasLiveSupplier) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Live supplier pricing (DigiKey, Mouser) */}
      {hasLiveSupplier && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ExternalLink className="h-4 w-4 text-international-orange" />
              Live supplier pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {liveSupplierResults.slice(0, 5).map((r, i) => (
              <div key={`${r.supplierId}-${r.partNumber}-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.description || r.partNumber}</p>
                  <p className="text-xs text-muted-foreground capitalize">{r.supplierId}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.unitPrice != null && (
                    <span className="text-sm font-semibold text-foreground">
                      ${r.unitPrice.toFixed(2)}
                    </span>
                  )}
                  <a
                    href={r.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-electric-blue hover:underline flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Real Market Pricing */}
      {hasPricing && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setIsPricingExpanded(!isPricingExpanded)}
          >
            <CardTitle className="flex items-center gap-2 text-sm">
              {isPricingExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <DollarSign className="h-4 w-4 text-international-orange" />
              Real Market Pricing
              <Badge variant="secondary" className="text-[10px] ml-2">
                {pricing.length} component{pricing.length !== 1 ? 's' : ''} with pricing
              </Badge>
            </CardTitle>
          </CardHeader>
          {isPricingExpanded && (
            <CardContent className="pt-0 space-y-3">
              {pricing.map((p) => {
                const bestTier = p.pricing_tiers.find(
                  (t) => batchSize >= t.qty_min && (t.qty_max == null || batchSize <= t.qty_max)
                ) ?? p.pricing_tiers[0]

                return (
                  <div key={p.component_name} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {p.component_name}
                      </span>
                      {bestTier && (
                        <span className="text-sm font-bold text-foreground">
                          ${bestTier.unit_price_usd.toFixed(2)}/ea
                        </span>
                      )}
                    </div>

                    {p.moq > 1 && batchSize < p.moq && (
                      <div className="flex items-center gap-1.5 text-xs text-status-warning">
                        <AlertTriangle className="h-3 w-3" />
                        MOQ is {p.moq} — your batch of {batchSize} is below minimum
                      </div>
                    )}

                    {p.lead_time_days && (
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {Object.entries(p.lead_time_days).map(([key, value]) => (
                          <span key={key} className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="h-3 w-3" />
                      <span className="hover:underline text-electric-blue cursor-pointer">
                        View in Component Library
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* Certification Requirements */}
      {hasCerts && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setIsCertsExpanded(!isCertsExpanded)}
          >
            <CardTitle className="flex items-center gap-2 text-sm">
              {isCertsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Shield className="h-4 w-4 text-status-success" />
              Certification Status
              <Badge variant="secondary" className="text-[10px] ml-2">
                {certifications.length} component{certifications.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          {isCertsExpanded && (
            <CardContent className="pt-0 space-y-3">
              {certifications.map((c) => {
                const activeCerts = (c.certifications || []).filter(
                  (cert) => cert.status === 'active'
                )
                const pendingCerts = (c.certifications || []).filter(
                  (cert) => cert.status === 'pending'
                )
                const hasGap = (c.certifications || []).some(
                  (cert) => cert.status !== 'active'
                )

                return (
                  <div key={c.component_name} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {c.component_name}
                      </span>
                      {hasGap && (
                        <Badge variant="warning" className="text-[10px]">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                          Gaps
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeCerts.map((cert, i) => (
                        <Badge key={i} variant="success" className="text-[10px]">
                          {cert.standard}
                        </Badge>
                      ))}
                      {pendingCerts.map((cert, i) => (
                        <Badge key={i} variant="warning" className="text-[10px]">
                          {cert.standard} (pending)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* Supplier Ratings */}
      {hasReviews && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              Supplier Ratings
              <Badge variant="secondary" className="text-[10px] ml-2">
                {Object.keys(supplierReviews).length} suppliers rated
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {Object.entries(supplierReviews)
              .sort(([, a], [, b]) => b.avg - a.avg)
              .slice(0, 10)
              .map(([name, data]) => (
                <div key={name} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <span className="text-sm text-foreground">{name}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={cn(
                            'h-3 w-3',
                            s <= Math.round(data.avg)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ({data.count})
                    </span>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
