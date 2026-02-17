'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Star,
  Shield,
  Link2,
  ExternalLink,
  ThumbsUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Loader2,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getComponentDetail } from '@/actions/component-library'
import type { ComponentDetail } from '@/actions/component-library'

interface ComponentDetailDialogProps {
  componentId: string | null
  componentName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * ComponentDetailDialog - Full detail view for a single component.
 *
 * @description Centered dialog with tabs for Overview, Pricing, Certifications,
 * Compatibility, and Reviews. Loads all enrichment data on open.
 *
 * @component
 */
export function ComponentDetailDialog({
  componentId,
  componentName,
  open,
  onOpenChange,
}: ComponentDetailDialogProps) {
  const [detail, setDetail] = useState<ComponentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    if (!componentId) return
    setIsLoading(true)
    setError(null)
    const result = await getComponentDetail(componentId)
    if ('error' in result) {
      setError(result.error)
    } else {
      setDetail(result)
    }
    setIsLoading(false)
  }, [componentId])

  useEffect(() => {
    if (open && componentId) {
      loadDetail()
    } else {
      setDetail(null)
      setError(null)
    }
  }, [open, componentId, loadDetail])

  const comp = detail?.component
  const pricing = detail?.pricing
  const certs = detail?.certifications
  const compatibility = detail?.compatibility ?? []
  const reviews = detail?.reviews ?? []

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating as number), 0) / reviews.length
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-international-orange" />
            {componentName ?? 'Component Detail'}
          </DialogTitle>
          {comp?.manufacturer && (
            <p className="text-sm text-muted-foreground">
              by {comp.manufacturer as string}
            </p>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="certifications">
                Certifications
                {certs && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {(certs.certifications as unknown[])?.length ?? 0}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="compatibility">
                Compatibility
                {compatibility.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {compatibility.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reviews">
                Reviews
                {reviews.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {reviews.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4">
              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 m-0">
                <OverviewTab component={comp} />
              </TabsContent>

              {/* Pricing Tab */}
              <TabsContent value="pricing" className="space-y-4 m-0">
                <PricingTab pricing={pricing} />
              </TabsContent>

              {/* Certifications Tab */}
              <TabsContent value="certifications" className="space-y-4 m-0">
                <CertificationsTab certifications={certs} />
              </TabsContent>

              {/* Compatibility Tab */}
              <TabsContent value="compatibility" className="space-y-4 m-0">
                <CompatibilityTab compatibility={compatibility} />
              </TabsContent>

              {/* Reviews Tab */}
              <TabsContent value="reviews" className="space-y-4 m-0">
                <ReviewsTab reviews={reviews} avgRating={avgRating} />
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {comp?.datasheet_url && (
            <Button variant="outline" asChild>
              <a
                href={comp.datasheet_url as string}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Datasheet
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function OverviewTab({ component }: { component: Record<string, unknown> | undefined }) {
  if (!component) return <EmptyTabMessage message="No component data available." />

  const fields = [
    { label: 'Material', value: component.material },
    { label: 'Weight', value: component.weight_g ? `${component.weight_g}g` : null },
    { label: 'Geometry Type', value: component.geometry_type_slug },
    { label: 'Tags', value: Array.isArray(component.tags) ? (component.tags as string[]).join(', ') : null },
  ]

  return (
    <div className="space-y-3">
      {fields.map(({ label, value }) =>
        value ? (
          <div key={label} className="flex items-start gap-3">
            <span className="text-xs font-medium text-muted-foreground w-28 shrink-0 pt-0.5">
              {label}
            </span>
            <span className="text-sm text-foreground">{value as string}</span>
          </div>
        ) : null
      )}

      {component.geometry_params && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Geometry Parameters</p>
          <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(component.geometry_params, null, 2)}
          </pre>
        </div>
      )}

      {component.mounting_points && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Mounting Points</p>
          <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(component.mounting_points, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function PricingTab({ pricing }: { pricing: Record<string, unknown> | null }) {
  if (!pricing) return <EmptyTabMessage message="Pricing data coming soon." />

  const tiers = pricing.pricing_tiers as Array<{
    qty_min: number
    qty_max: number | null
    unit_price_usd: number
    source: string
  }> | null

  const leadTimes = pricing.lead_time_days as Record<string, string> | null

  return (
    <div className="space-y-4">
      {/* MOQ + Currency */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          MOQ: <strong className="text-foreground">{(pricing.moq as number) ?? 1}</strong>
        </span>
        <span className="text-muted-foreground">
          Currency: <strong className="text-foreground">{(pricing.currency as string) ?? 'USD'}</strong>
        </span>
      </div>

      {/* Pricing tiers table */}
      {tiers && tiers.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Unit Price</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 text-foreground">
                    {tier.qty_min}{tier.qty_max ? `–${tier.qty_max}` : '+'}
                  </td>
                  <td className="px-3 py-2 font-semibold text-foreground">
                    ${tier.unit_price_usd.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{tier.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lead times */}
      {leadTimes && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Lead Times</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(leadTimes).map(([key, value]) => (
              <div key={key} className="flex items-center gap-1.5 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                <span className="text-foreground font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pricing.shipping_notes && (
        <p className="text-xs text-muted-foreground italic">
          {pricing.shipping_notes as string}
        </p>
      )}
    </div>
  )
}

function CertificationsTab({ certifications }: { certifications: Record<string, unknown> | null }) {
  if (!certifications) return <EmptyTabMessage message="Certification data coming soon." />

  const certs = certifications.certifications as Array<{
    standard: string
    status: string
    certificate_number: string | null
    issued_date: string | null
    expiry_date: string | null
    testing_lab: string | null
    scope: string | null
  }> | null

  const compliance = certifications.compliance_summary as Record<string, unknown> | null

  return (
    <div className="space-y-4">
      {/* Certification list */}
      {certs && certs.length > 0 && (
        <div className="space-y-2">
          {certs.map((cert, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Shield className={cn(
                'h-4 w-4 mt-0.5 shrink-0',
                cert.status === 'active' ? 'text-status-success' :
                cert.status === 'pending' ? 'text-status-warning' :
                'text-muted-foreground'
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{cert.standard}</span>
                  <Badge
                    variant={cert.status === 'active' ? 'success' : cert.status === 'pending' ? 'warning' : 'secondary'}
                    className="text-[10px]"
                  >
                    {cert.status}
                  </Badge>
                </div>
                {cert.scope && (
                  <p className="text-xs text-muted-foreground mt-0.5">{cert.scope}</p>
                )}
                {cert.testing_lab && (
                  <p className="text-xs text-muted-foreground">Lab: {cert.testing_lab}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compliance summary */}
      {compliance && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Compliance Summary</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {compliance.rohs_compliant != null && (
              <ComplianceItem
                label="RoHS"
                value={compliance.rohs_compliant as boolean}
              />
            )}
            {compliance.reach_compliant != null && (
              <ComplianceItem
                label="REACH"
                value={compliance.reach_compliant as boolean}
              />
            )}
            {compliance.ip_rating && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">IP Rating:</span>
                <span className="font-medium text-foreground">{compliance.ip_rating as string}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Material declarations */}
      {Array.isArray(certifications.material_declarations) &&
        (certifications.material_declarations as string[]).length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Material Declarations</p>
          <div className="flex flex-wrap gap-1.5">
            {(certifications.material_declarations as string[]).map((d, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{d}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompatibilityTab({ compatibility }: { compatibility: Record<string, unknown>[] }) {
  if (compatibility.length === 0) {
    return <EmptyTabMessage message="No compatibility data yet." />
  }

  return (
    <div className="space-y-2">
      {compatibility.map((c, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Link2 className="h-4 w-4 text-electric-blue shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {(c.component_a as string) || (c.component_b as string)}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-[10px]">
                {(c.relationship as string)?.replace(/_/g, ' ')}
              </Badge>
              {c.confidence != null && (
                <span className="text-xs text-muted-foreground">
                  {Math.round((c.confidence as number) * 100)}% confidence
                </span>
              )}
              {c.domain && (
                <span className="text-xs text-muted-foreground">
                  · {c.domain as string}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReviewsTab({ reviews, avgRating }: { reviews: Record<string, unknown>[]; avgRating: number }) {
  if (reviews.length === 0) {
    return <EmptyTabMessage message="No reviews yet." />
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="text-center">
          <p className="text-3xl font-bold text-foreground">{avgRating.toFixed(1)}</p>
          <div className="flex items-center gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={cn(
                  'h-4 w-4',
                  s <= Math.round(avgRating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground'
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{reviews.length} reviews</p>
        </div>
      </div>

      {/* Review list */}
      {reviews.map((r, i) => (
        <div key={i} className="border-b border-muted pb-4 last:border-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={cn(
                      'h-3 w-3',
                      s <= (r.rating as number)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground'
                    )}
                  />
                ))}
              </div>
              {r.verified_purchase && (
                <Badge variant="success" className="text-[10px]">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                  Verified
                </Badge>
              )}
            </div>
            {(r.helpful_count as number) > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ThumbsUp className="h-3 w-3" />
                {r.helpful_count as number}
              </div>
            )}
          </div>

          {r.title && (
            <p className="text-sm font-semibold text-foreground">{r.title as string}</p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{r.body as string}</p>

          {/* Pros/Cons */}
          {((r.pros as string[])?.length > 0 || (r.cons as string[])?.length > 0) && (
            <div className="flex gap-4 mt-2">
              {(r.pros as string[])?.length > 0 && (
                <div className="text-xs">
                  <span className="text-status-success font-medium">Pros: </span>
                  <span className="text-muted-foreground">
                    {(r.pros as string[]).join(', ')}
                  </span>
                </div>
              )}
              {(r.cons as string[])?.length > 0 && (
                <div className="text-xs">
                  <span className="text-destructive font-medium">Cons: </span>
                  <span className="text-muted-foreground">
                    {(r.cons as string[]).join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Reviewer info */}
          <p className="text-xs text-muted-foreground mt-2">
            {r.reviewer_name as string}
            {r.reviewer_role && ` · ${r.reviewer_role as string}`}
            {r.reviewer_company && ` at ${r.reviewer_company as string}`}
          </p>
        </div>
      ))}
    </div>
  )
}

function ComplianceItem({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {value ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
      )}
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn('font-medium', value ? 'text-status-success' : 'text-status-warning')}>
        {value ? 'Compliant' : 'Non-compliant'}
      </span>
    </div>
  )
}

function EmptyTabMessage({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
