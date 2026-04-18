/**
 * @file supplier-detail-dialog.tsx — Dialog showing detailed supplier company info.
 *
 * @description Centered dialog triggered from the Shortlist/Costs tabs when a user clicks
 * the info icon on a supplier bar or the supplier name. Fetches data from marketplace_listings
 * via getSupplierDetail(). Parent caches results via a Map ref to avoid repeat fetches.
 *
 * @component
 */

"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2, MapPin, Calendar, Users, Factory, Clock, Package, ShieldCheck } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSupplierDetail, type SupplierDetail } from "@/actions/cad-lab-supplier-detail"
import { SupplierEnrichmentPanel } from "@/components/cad/supplier-enrichment-panel"

// ─── Props ───────────────────────────────────────────────────────────

interface SupplierDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierId: string | null
  supplierName?: string
  /** Parent-managed cache — avoids re-fetching */
  cache: React.MutableRefObject<Map<string, SupplierDetail>>
  /** Optional match score (0-100) from supplier matching */
  matchScore?: number
  /** Optional match reasons from supplier matching */
  matchReasons?: string[]
}

// ─── Component ───────────────────────────────────────────────────────

export function SupplierDetailDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  cache,
  matchScore,
  matchReasons,
}: SupplierDetailDialogProps): React.ReactNode {
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !supplierId) return

    const cached = cache.current.get(supplierId)
    if (cached) {
      setDetail(cached)
      return
    }

    let cancelled = false
    setLoading(true)
    setDetail(null)

    getSupplierDetail(supplierId).then((result) => {
      if (cancelled) return
      if (result) {
        cache.current.set(supplierId, result)
        setDetail(result)
      }
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [open, supplierId, cache])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {detail?.name ?? supplierName ?? "Supplier Details"}
            {matchScore != null && matchScore > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-international-orange/10 text-international-orange text-xs font-medium px-2 py-0.5 rounded-full">
                <span className="inline-block h-1.5 w-8 rounded-full bg-international-orange/20 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-international-orange"
                    style={{ width: `${matchScore}%` }}
                  />
                </span>
                {Math.round(matchScore)}% match
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !detail && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No details available for this supplier.
          </p>
        )}

        {!loading && detail && (
          <div className="space-y-4">
            {/* Website */}
            {detail.websiteUrl ? (
              <a
                href={detail.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-info hover:text-info/80 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {detail.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground italic">No website on file</p>
            )}

            {/* Match context — why this supplier matches */}
            {matchReasons && matchReasons.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Why This Supplier Matches</p>
                <div className="flex flex-wrap gap-1">
                  {matchReasons.map((reason, i) => (
                    <span
                      key={i}
                      className="text-[9px] bg-international-orange/10 text-international-orange px-1.5 py-0.5 rounded-full font-mono"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Key info grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(detail.city || detail.country) && (
                <InfoItem icon={MapPin} label="Location" value={[detail.city, detail.country].filter(Boolean).join(", ")} />
              )}
              {detail.companySize && (
                <InfoItem icon={Users} label="Company Size" value={detail.companySize} />
              )}
              {detail.foundedYear && (
                <InfoItem icon={Calendar} label="Founded" value={String(detail.foundedYear)} />
              )}
              {detail.leadTime && (
                <InfoItem icon={Clock} label="Lead Time" value={detail.leadTime} />
              )}
              {detail.minimumOrder && (
                <InfoItem icon={Package} label="Min. Order" value={detail.minimumOrder} />
              )}
              {detail.productionCapacity && (
                <InfoItem icon={Factory} label="Production Capacity" value={detail.productionCapacity} />
              )}
              {detail.qualitySystems && (
                <InfoItem icon={ShieldCheck} label="Quality Systems" value={detail.qualitySystems} />
              )}
            </div>

            {/* Description */}
            {detail.description && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">About</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                  {detail.description}
                </p>
              </div>
            )}

            {/* Certifications */}
            {detail.certifications.length > 0 && (
              <PillGroup label="Certifications" items={detail.certifications} pillClassName="bg-status-success/10 text-status-success" />
            )}

            {/* Materials */}
            {detail.materials.length > 0 && (
              <PillGroup label="Materials" items={detail.materials} pillClassName="bg-info/10 text-info" />
            )}

            {/* Specialties */}
            {detail.specialties.length > 0 && (
              <PillGroup label="Specialties" items={detail.specialties} pillClassName="bg-international-orange/10 text-international-orange" />
            )}

            {/* Key Equipment */}
            {detail.keyEquipment.length > 0 && (
              <PillGroup label="Key Equipment" items={detail.keyEquipment} pillClassName="bg-muted text-muted-foreground" />
            )}

            {/* ── Enrichment panel: brief, certs, ratings, rate/correct/interview actions ── */}
            <div className="pt-2 border-t border-border">
              <SupplierEnrichmentPanel
                listingId={detail.id}
                supplierName={detail.name ?? supplierName ?? "this supplier"}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }): React.ReactNode {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}

function PillGroup({ label, items, pillClassName }: { label: string; items: string[]; pillClassName: string }): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 12).map((item, i) => (
          <span
            key={i}
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${pillClassName}`}
          >
            {item}
          </span>
        ))}
        {items.length > 12 && (
          <span className="text-[9px] text-muted-foreground">+{items.length - 12} more</span>
        )}
      </div>
    </div>
  )
}
