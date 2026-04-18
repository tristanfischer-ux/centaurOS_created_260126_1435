"use client"

/**
 * @file supplier-intelligence-tab.tsx — Nightshift deep enrichment data for matched suppliers.
 *
 * @description Shows process capabilities matrix and per-supplier detail cards.
 * Data comes from the `processCapabilities` JSONB field on marketplace listings,
 * populated by Nightshift deep enrichment.
 *
 * Phase 3 (2026-04-18) — consolidation: each supplier card now carries an
 * inline "Shortlist" toggle + module-fit chips. The separate Shortlist tab
 * remains as the operational view (NDA/Ramp/Outreach/RFQ) but no longer owns
 * supplier selection UX — one view lists candidates with an explicit
 * "shortlisted?" state per card.
 */

import { useState } from "react"
import { Factory, CheckCircle2, Minus, ChevronDown, ChevronRight, Info, Star } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { CompanyReview } from "@/actions/company-review"

interface SupplierIntelligenceTabProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  /**
   * Per-company verdict from Chase's assessment. When supplied, drives the
   * primary sort order: Recommended → Acceptable → Caution → Not Recommended,
   * with matchScore as tiebreaker within each tier.
   */
  companyReviews?: CompanyReview[]
  /**
   * Phase 3 consolidation: when supplied, each card renders a shortlist
   * toggle that maps onto the parent's DB-backed shortlist state. Absent
   * = legacy render (read-only cards).
   */
  shortlistedSupplierIds?: Set<string>
  onToggleShortlist?: (supplier: CadLabSupplierMatch) => void
}

const VERDICT_PRIORITY: Record<string, number> = {
  recommended: 0,
  acceptable: 1,
  caution: 2,
  not_recommended: 3,
}

const VERDICT_LABEL: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "destructive" }> = {
  recommended: { label: "Recommended", variant: "success" },
  acceptable: { label: "Acceptable", variant: "secondary" },
  caution: { label: "Caution", variant: "warning" },
  not_recommended: { label: "Not Recommended", variant: "destructive" },
}

// INTENT: Flatten all unique suppliers across module matches into a single list.
// Sort by verdict (if reviews present) then by matchScore descending. When no
// reviews are available, falls back to pure matchScore sort.
function getUniqueSuppliers(
  supplierMatches: Map<string, CadLabSupplierMatch[]>,
  verdictByCompany: Map<string, string>,
): CadLabSupplierMatch[] {
  const seen = new Map<string, CadLabSupplierMatch>()
  for (const matches of supplierMatches.values()) {
    for (const match of matches) {
      const existing = seen.get(match.id)
      if (!existing || match.matchScore > existing.matchScore) {
        seen.set(match.id, match)
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    const va = VERDICT_PRIORITY[verdictByCompany.get(a.id) ?? ""] ?? 99
    const vb = VERDICT_PRIORITY[verdictByCompany.get(b.id) ?? ""] ?? 99
    if (va !== vb) return va - vb
    return b.matchScore - a.matchScore
  })
}

function getUniqueProcesses(diagnosticAnswers: DiagnosticAnswers, moduleIds: string[]): string[] {
  const processes = new Set<string>()
  for (const id of moduleIds) {
    const process = diagnosticAnswers[id]?.mfg_process?.trim()
    if (process) processes.add(process)
  }
  return Array.from(processes)
}

export function SupplierIntelligenceTab({
  modules,
  diagnosticAnswers,
  supplierMatches,
  companyReviews,
  shortlistedSupplierIds,
  onToggleShortlist,
}: SupplierIntelligenceTabProps) {
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null)

  const verdictByCompany = new Map<string, string>()
  if (companyReviews) {
    for (const r of companyReviews) verdictByCompany.set(r.companyId, r.verdict)
  }

  // Per-supplier: which modules did they match on? Used for inline "Fits M1, M3"
  // chips so the founder can see supplier → module mapping at a glance.
  const moduleNamesBySupplier = new Map<string, string[]>()
  for (const [moduleId, matches] of supplierMatches.entries()) {
    const moduleName = modules.find((m) => m.id === moduleId)?.name ?? ""
    if (!moduleName) continue
    for (const m of matches) {
      const existing = moduleNamesBySupplier.get(m.id) ?? []
      if (!existing.includes(moduleName)) {
        existing.push(moduleName)
        moduleNamesBySupplier.set(m.id, existing)
      }
    }
  }

  const allSuppliers = getUniqueSuppliers(supplierMatches, verdictByCompany)
  const suppliersWithCaps = allSuppliers.filter((s) => s.processCapabilities && s.processCapabilities.length > 0)
  const moduleIds = modules.map((m) => m.id)
  const processes = getUniqueProcesses(diagnosticAnswers, moduleIds)
  const shortlistEnabled = typeof onToggleShortlist === "function"
  const shortlistedCount = shortlistedSupplierIds?.size ?? 0

  if (supplierMatches.size === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Factory className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No supplier data yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Match suppliers first to see their capabilities.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-international-orange" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Supplier Intelligence</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {allSuppliers.length} matched supplier{allSuppliers.length !== 1 ? "s" : ""} across {processes.length} process{processes.length !== 1 ? "es" : ""}
                {suppliersWithCaps.length > 0 && (
                  <> &mdash; {suppliersWithCaps.length} with verified capabilities</>
                )}
                {shortlistEnabled && (
                  <> &mdash; <span className="text-foreground font-medium">{shortlistedCount} shortlisted</span></>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coverage callout when most suppliers lack capabilities */}
      {suppliersWithCaps.length === 0 && allSuppliers.length > 0 && (
        <Card className="border-info/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-foreground font-medium">No detailed capability data available</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Capability data is populated as suppliers are verified. Match scores and reasons are still available below for all {allSuppliers.length} suppliers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {suppliersWithCaps.length > 0 && suppliersWithCaps.length < allSuppliers.length && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          {suppliersWithCaps.length} of {allSuppliers.length} suppliers have detailed capability data. Others show match scores only.
        </div>
      )}

      {/* Capability matrix */}
      {suppliersWithCaps.length > 0 && processes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Capability Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Supplier</th>
                    {processes.map((proc) => (
                      <th key={proc} className="text-center py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">
                        {proc}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliersWithCaps.map((supplier) => {
                    const caps = supplier.processCapabilities ?? []
                    const capCategories = caps.map((c) => (c.process_category ?? "").toLowerCase())

                    return (
                      <tr key={supplier.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{supplier.name}</span>
                            {supplier.isVerified && (
                              <Badge variant="info" className="text-[9px] px-1 py-0">Verified</Badge>
                            )}
                          </div>
                        </td>
                        {processes.map((proc) => {
                          const procLower = proc.toLowerCase()
                          const hasCapability = capCategories.some(
                            (c) => c.includes(procLower) || procLower.includes(c.split(" ")[0]),
                          )
                          return (
                            <td key={proc} className="text-center py-2 px-2">
                              {hasCapability ? (
                                <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                              ) : (
                                <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-supplier expandable cards */}
      <div className="space-y-3">
        {allSuppliers.map((supplier) => {
          const caps = supplier.processCapabilities ?? []
          const isExpanded = expandedSupplierId === supplier.id
          const allMaterials = caps.flatMap((c) => c.materials_worked ?? [])
          const uniqueMaterials = [...new Set(allMaterials)]
          const tolerances = caps.map((c) => c.tolerance_value_mm).filter((t): t is number => t != null)
          const minTolerance = tolerances.length > 0 ? Math.min(...tolerances) : null
          const fitModules = moduleNamesBySupplier.get(supplier.id) ?? []
          const isShortlisted = shortlistedSupplierIds?.has(supplier.id) ?? false

          return (
            <Card key={supplier.id} className={isShortlisted ? "border-international-orange/50 shadow-sm" : undefined}>
              <div className="flex items-stretch">
                <button
                  onClick={() => setExpandedSupplierId(isExpanded ? null : supplier.id)}
                  className="flex-1 text-left"
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium text-foreground">{supplier.name}</span>
                        {(() => {
                          const verdict = verdictByCompany.get(supplier.id)
                          const cfg = verdict ? VERDICT_LABEL[verdict] : null
                          return cfg ? (
                            <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
                          ) : null
                        })()}
                        <Badge variant="secondary" className="text-[10px]">
                          {supplier.matchScore}pt
                        </Badge>
                        {supplier.isVerified && (
                          <Badge variant="info" className="text-[10px]">Verified</Badge>
                        )}
                        {/* Module-fit chips: Phase 3 — show which modules this supplier matched on */}
                        {fitModules.slice(0, 3).map((name) => (
                          <span
                            key={name}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                          >
                            {name}
                          </span>
                        ))}
                        {fitModules.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{fitModules.length - 3} more
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {caps.length > 0 && (
                          <Badge variant="success" className="text-[10px]">
                            {caps.length} capabilit{caps.length !== 1 ? "ies" : "y"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </button>
                {shortlistEnabled && (
                  <div className="flex items-center pr-4">
                    <Button
                      size="sm"
                      variant={isShortlisted ? "default" : "outline"}
                      className="gap-1 h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleShortlist?.(supplier)
                      }}
                      aria-pressed={isShortlisted}
                      aria-label={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
                    >
                      <Star className={`h-3.5 w-3.5 ${isShortlisted ? "fill-current" : ""}`} />
                      {isShortlisted ? "Shortlisted" : "Shortlist"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && caps.length > 0 && (
                <CardContent className="pt-0 pb-4 space-y-3">
                  <div className="border-t border-border pt-3 space-y-3">
                    {/* Process categories */}
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Process Categories
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {caps.map((cap, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {cap.process_category ?? "Unknown"}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Materials */}
                    {uniqueMaterials.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Materials Worked
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {uniqueMaterials.slice(0, 10).map((mat) => (
                            <span key={mat} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {mat}
                            </span>
                          ))}
                          {uniqueMaterials.length > 10 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              +{uniqueMaterials.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tolerance */}
                    {minTolerance != null && (
                      <div className="text-xs text-foreground">
                        <span className="text-muted-foreground">Best tolerance: </span>
                        <span className="font-mono">{"\u00B1"}{minTolerance}mm</span>
                      </div>
                    )}

                    {/* Match reasons */}
                    {supplier.matchReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {supplier.matchReasons.map((reason) => (
                          <span key={reason} className="text-[10px] text-muted-foreground">
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              )}

              {isExpanded && caps.length === 0 && (
                <CardContent className="pt-0 pb-4">
                  <div className="border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground italic">
                      No detailed capabilities data available for this supplier.
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
