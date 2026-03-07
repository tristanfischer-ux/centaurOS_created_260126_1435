/**
 * @file cad-lab-shortlist.tsx — Supplier shortlist & per-supplier RFQ creation.
 *
 * @description Replaces the Proposals/Contracting tab. Shows all shortlisted suppliers
 * with their matched modules, allows per-supplier document generation (RFQ/SOW/NDA)
 * and per-supplier marketplace RFQ creation. Each supplier gets a tailored package
 * containing only their relevant modules.
 *
 * @component
 */

"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import {
  ListChecks,
  Copy,
  FileText,
  Shield,
  ClipboardList,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  BadgeCheck,
  X,
  Users,
  Search,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { AiCostEstimate, CadLabDesignBrief, CadLabModule } from "@/lib/cad-lab-types"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { CategorySupplierEntry } from "@/lib/sankey-utils"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import { ShortlistCoverageFlow } from "./shortlist-coverage-flow"
import { SupplierDetailDialog } from "./supplier-detail-dialog"
import type { SupplierDetail } from "@/actions/cad-lab-supplier-detail"
import { createCadLabRfqAction } from "@/actions/cad-lab-rfq"
import { getRFQDetail } from "@/actions/rfq"
import { createOrderFromAward } from "@/actions/manufacturing-orders"
import { trackFeatureUse } from "@/hooks/useActivityTracker"
import { generateRfq, generateSow, generateNda } from "@/lib/cad-lab-document-generators"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"
import type { BuyPartSearchResult } from "@/actions/buy-part-search"

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabShortlistProps {
  /** All eligible modules */
  modules: CadLabModule[]
  /** Project name */
  projectName: string
  /** Diagnostic answers per module */
  diagnosticAnswers?: DiagnosticAnswers
  /** Active project ID */
  projectId?: string | null
  /** Design brief from research stage */
  designBrief?: CadLabDesignBrief
  /** Optional assumption notes */
  assumptionNotes?: string
  /** Shortlisted suppliers map */
  shortlistedSuppliers: Map<string, ShortlistedSupplier>
  /** Per-supplier RFQ IDs */
  perSupplierRfqIds: Map<string, string>
  /** Callback when per-supplier RFQ is created */
  onSupplierRfqCreated: (supplierId: string, rfqId: string) => void
  /** Callback to remove a supplier from the shortlist */
  onRemoveFromShortlist: (supplierId: string) => void
  /** Called after a manufacturing order is created */
  onOrderCreated?: () => void
  /** AI cost estimates keyed by module ID — used for buy/make grouping in flow diagram */
  aiCostEstimates?: Record<string, AiCostEstimate>
  /** All supplier matches (for allocation Sankey) */
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  /** IDs of shortlisted suppliers */
  shortlistedSupplierIds: Set<string>
  /** Toggle supplier on/off shortlist */
  onShortlistSupplier: (supplier: CadLabSupplierMatch, moduleId: string) => void
  /** Per-category ranked supplier IDs (index 0 = 1st choice) */
  categoryRankings: Map<string, string[]>
  /** Per-category supplier entries */
  categorySupplierEntries: Map<string, CategorySupplierEntry[]>
  /** Promote a supplier within a category. Optional targetRank (0-indexed) for direct placement. */
  onPromoteSupplier: (categoryId: string, supplierId: string, targetRank?: number) => void
  /** Whether "Match All Modules" is loading */
  matchAllLoading?: boolean
  /** Trigger match-all supplier search */
  onMatchAll?: () => void
  /** Buy part search results */
  buyPartResults?: BuyPartSearchResult[]
  /** Whether buy search is loading */
  buySearchLoading?: boolean
  /** Callback to re-trigger buy part price search */
  onRefreshBuyParts?: () => void
}

type DocType = "rfq" | "sow" | "nda"

interface DocTemplate {
  id: DocType
  name: string
  shortName: string
  icon: React.ComponentType<{ className?: string }>
}

const DOC_TYPES: DocTemplate[] = [
  { id: "rfq", name: "Request for Quotation", shortName: "RFQ", icon: ClipboardList },
  { id: "sow", name: "Statement of Work", shortName: "SOW", icon: FileText },
  { id: "nda", name: "Non-Disclosure Agreement", shortName: "NDA", icon: Shield },
]

// ─── Per-supplier flow stages ────────────────────────────────────────

type ProcurementStage = "draft" | "rfq_sent" | "awaiting" | "quoted"

const PROCUREMENT_STEPS: { key: ProcurementStage; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "rfq_sent", label: "RFQ Sent" },
  { key: "awaiting", label: "Awaiting" },
  { key: "quoted", label: "Quoted" },
]

// ─── Component ──────────────────────────────────────────────────────

export function CadLabShortlist({
  modules,
  projectName,
  diagnosticAnswers,
  projectId,
  designBrief,
  assumptionNotes,
  shortlistedSuppliers,
  perSupplierRfqIds,
  onSupplierRfqCreated,
  onRemoveFromShortlist,
  onOrderCreated,
  aiCostEstimates,
  supplierMatches,
  shortlistedSupplierIds,
  onShortlistSupplier,
  categoryRankings,
  categorySupplierEntries,
  onPromoteSupplier,
  matchAllLoading,
  onMatchAll,
  buyPartResults,
  buySearchLoading,
  onRefreshBuyParts,
}: CadLabShortlistProps): React.ReactNode {
  // ── Shared buyer details ──
  const [buyerName, setBuyerName] = useState("")
  const [deadline, setDeadline] = useState("")
  const [specialTerms, setSpecialTerms] = useState("")

  // ── Supplier detail dialog state ──
  const [detailSupplierId, setDetailSupplierId] = useState<string | null>(null)
  const [detailSupplierName, setDetailSupplierName] = useState<string | undefined>()
  const [detailMatchScore, setDetailMatchScore] = useState<number | undefined>()
  const [detailMatchReasons, setDetailMatchReasons] = useState<string[] | undefined>()
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const supplierDetailCache = useRef<Map<string, SupplierDetail>>(new Map())

  const handleOpenSupplierDetail = useCallback((supplierId: string, name?: string, score?: number, reasons?: string[]) => {
    setDetailSupplierId(supplierId)
    setDetailSupplierName(name)
    setDetailMatchScore(score)
    setDetailMatchReasons(reasons)
    setDetailDialogOpen(true)
  }, [])

  // ── Per-supplier expanded document state ──
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)
  const [generatedDocs, setGeneratedDocs] = useState<Map<string, Map<DocType, string>>>(new Map())
  const [creatingRfqFor, setCreatingRfqFor] = useState<string | null>(null)
  const [broadcastCounts, setBroadcastCounts] = useState<Map<string, number>>(new Map())

  // ── Per-supplier RFQ status polling ──
  const [rfqStatuses, setRfqStatuses] = useState<Map<string, { status: string; responseCount: number }>>(new Map())

  useEffect(() => {
    if (perSupplierRfqIds.size === 0) return
    let isMounted = true

    const fetchStatuses = async (): Promise<void> => {
      const entries = [...perSupplierRfqIds.entries()]
      const results = await Promise.allSettled(
        entries.map(async ([supplierId, rfqId]) => {
          const detail = await getRFQDetail(rfqId)
          return {
            supplierId,
            status: detail.data?.status ?? "unknown",
            responseCount: detail.data?.response_count ?? 0,
          }
        }),
      )
      if (!isMounted) return
      setRfqStatuses((prev) => {
        const next = new Map(prev)
        for (const result of results) {
          if (result.status === "fulfilled") {
            next.set(result.value.supplierId, {
              status: result.value.status,
              responseCount: result.value.responseCount,
            })
          }
        }
        return next
      })
    }

    fetchStatuses()
    const poll = window.setInterval(fetchStatuses, 20000)
    return () => {
      isMounted = false
      window.clearInterval(poll)
    }
  }, [perSupplierRfqIds])

  // ── Module lookup for supplier card detail ──
  const moduleMap = useMemo(() => {
    const map = new Map<string, CadLabModule>()
    for (const mod of modules) map.set(mod.id, mod)
    return map
  }, [modules])

  const suppliers = useMemo(
    () => [...shortlistedSuppliers.values()].sort((a, b) => b.bestMatchScore - a.bestMatchScore),
    [shortlistedSuppliers],
  )

  // ── Document generation (per-supplier, filtered modules) ──
  const handleGenerateDoc = useCallback((supplierId: string, supplier: ShortlistedSupplier, type: DocType) => {
    const filteredModules = supplier.moduleIds
      .map((id) => moduleMap.get(id))
      .filter((m): m is CadLabModule => m != null)

    if (filteredModules.length === 0) {
      toast.error("No matched modules found for this supplier")
      return
    }

    const rfqId = perSupplierRfqIds.get(supplierId)
    const rfqStatus = rfqStatuses.get(supplierId)?.status

    let text: string
    switch (type) {
      case "rfq":
        text = generateRfq(
          `${projectName} — RFQ for ${supplier.name}`,
          filteredModules,
          diagnosticAnswers,
          buyerName || undefined,
          deadline || undefined,
          specialTerms || undefined,
          rfqId,
          rfqStatus,
        )
        break
      case "sow":
        text = generateSow(
          `${projectName} — SOW for ${supplier.name}`,
          filteredModules,
          diagnosticAnswers,
          buyerName || undefined,
          rfqId,
        )
        break
      case "nda":
        text = generateNda(projectName, buyerName || undefined, rfqId)
        break
    }

    setGeneratedDocs((prev) => {
      const next = new Map(prev)
      const supplierDocs = new Map(next.get(supplierId) || new Map())
      supplierDocs.set(type, text)
      next.set(supplierId, supplierDocs)
      return next
    })

    trackFeatureUse("cad_lab_shortlist_doc_generated", {
      docType: type,
      supplierId,
      moduleCount: filteredModules.length,
    })
  }, [moduleMap, perSupplierRfqIds, rfqStatuses, projectName, diagnosticAnswers, buyerName, deadline, specialTerms])

  const handleCopyDoc = useCallback(async (supplierId: string, type: DocType) => {
    const text = generatedDocs.get(supplierId)?.get(type)
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success(`${DOC_TYPES.find((d) => d.id === type)?.name} copied to clipboard`)
  }, [generatedDocs])

  // ── Per-supplier marketplace RFQ ──
  const handleCreateSupplierRfq = useCallback(async (supplierId: string, supplier: ShortlistedSupplier) => {
    const filteredModules = supplier.moduleIds
      .map((id) => moduleMap.get(id))
      .filter((m): m is CadLabModule => m != null)

    if (filteredModules.length === 0) {
      toast.error("No matched modules found for this supplier")
      return
    }

    setCreatingRfqFor(supplierId)
    try {
      const res = await createCadLabRfqAction({
        projectName: `${projectName} — RFQ for ${supplier.name}`,
        modules: filteredModules,
        diagnosticAnswers: diagnosticAnswers || {},
        deadline: deadline || undefined,
        designBrief,
        assumptionNotes,
      })

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      onSupplierRfqCreated(supplierId, res.rfqId)
      if (res.broadcastCount > 0) {
        setBroadcastCounts((prev) => new Map(prev).set(supplierId, res.broadcastCount))
      }
      trackFeatureUse("cad_lab_shortlist_rfq_created", {
        supplierId,
        moduleCount: filteredModules.length,
        broadcastCount: res.broadcastCount,
      })
      toast.success(
        res.broadcastCount > 0
          ? `RFQ created and sent to ${res.broadcastCount} supplier${res.broadcastCount !== 1 ? "s" : ""}`
          : `Marketplace RFQ created for ${supplier.name}`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create RFQ")
    } finally {
      setCreatingRfqFor(null)
    }
  }, [moduleMap, projectName, diagnosticAnswers, deadline, designBrief, assumptionNotes, onSupplierRfqCreated])

  // ── Per-supplier award ──
  const [awardingFor, setAwardingFor] = useState<string | null>(null)

  const handleAwardOrder = useCallback(async (supplierId: string, supplier: ShortlistedSupplier) => {
    const rfqId = perSupplierRfqIds.get(supplierId)
    if (!rfqId || !projectId) return

    setAwardingFor(supplierId)
    try {
      const res = await createOrderFromAward(
        rfqId,
        rfqId,
        projectId,
        `${projectName} — ${supplier.name}`,
      )
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      trackFeatureUse("cad_lab_shortlist_order_created", {
        supplierId,
        orderId: res.orderId,
        rfqId,
      })
      toast.success("Manufacturing order created")
      onOrderCreated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create order")
    } finally {
      setAwardingFor(null)
    }
  }, [perSupplierRfqIds, projectId, projectName, onOrderCreated])

  // ── Get procurement stage for a supplier ──
  const getStage = useCallback((supplierId: string): ProcurementStage => {
    const rfqId = perSupplierRfqIds.get(supplierId)
    if (!rfqId) return "draft"
    const status = rfqStatuses.get(supplierId)
    if (!status) return "rfq_sent"
    if (status.responseCount > 0) return "quoted"
    return "awaiting"
  }, [perSupplierRfqIds, rfqStatuses])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Supplier Shortlist
            {suppliers.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
              </span>
            )}
          </CardTitle>
          {onMatchAll && (
            <Button
              variant="default"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={onMatchAll}
              disabled={matchAllLoading || modules.length === 0}
            >
              {matchAllLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              {matchAllLoading ? "Matching…" : "Re-match All"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Shared buyer details form ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sl-buyer-name" className="text-xs">
              Buyer / Company Name
            </Label>
            <Input
              id="sl-buyer-name"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Acme Corp"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sl-deadline" className="text-xs">
              Quote Deadline
            </Label>
            <Input
              id="sl-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sl-special-terms" className="text-xs">
              Special Terms (optional)
            </Label>
            <Input
              id="sl-special-terms"
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
              placeholder="ISO 9001 required, etc."
              className="text-sm"
            />
          </div>
        </div>

        {/* ── Allocation flow diagram (Categories → Suppliers) ── */}
        {suppliers.length > 0 && modules.length > 0 && (
          <ShortlistCoverageFlow
            modules={modules}
            diagnosticAnswers={diagnosticAnswers}
            aiCostEstimates={aiCostEstimates}
            supplierMatches={supplierMatches}
            categoryRankings={categoryRankings}
            categorySupplierEntries={categorySupplierEntries}
            onPromoteSupplier={onPromoteSupplier}
            onSupplierClick={handleOpenSupplierDetail}
            buyPartResults={buyPartResults}
            buySearchLoading={buySearchLoading}
            onRefreshBuyParts={onRefreshBuyParts}
          />
        )}

        {/* ── Empty state ── */}
        {suppliers.length === 0 && (
          <div className="text-center py-10 space-y-2">
            <Users className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No suppliers shortlisted</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Go to the Suppliers tab, match modules, then click &quot;Shortlist&quot; next to suppliers you want to send RFQs to.
            </p>
          </div>
        )}

        {/* ── Per-supplier cards ── */}
        <div className="space-y-3">
          {suppliers.map((supplier) => {
            const isExpanded = expandedSupplier === supplier.id
            const supplierDocs = generatedDocs.get(supplier.id) ?? new Map()
            const rfqId = perSupplierRfqIds.get(supplier.id)
            const rfqStatus = rfqStatuses.get(supplier.id)
            const stage = getStage(supplier.id)
            const currentStageIndex = PROCUREMENT_STEPS.findIndex((s) => s.key === stage)

            // Get matched modules for this supplier
            const matchedModules = supplier.moduleIds
              .map((id) => moduleMap.get(id))
              .filter((m): m is CadLabModule => m != null)

            return (
              <div key={supplier.id} className="border rounded-lg overflow-hidden">
                {/* Supplier header */}
                <div className="flex items-center justify-between p-3 bg-muted/20">
                  <button
                    onClick={() => setExpandedSupplier(isExpanded ? null : supplier.id)}
                    className="flex items-center gap-2 min-w-0 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-sm font-semibold text-foreground truncate hover:text-international-orange transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenSupplierDetail(supplier.id, supplier.name, supplier.bestMatchScore, supplier.allMatchReasons)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation()
                          e.preventDefault()
                          handleOpenSupplierDetail(supplier.id, supplier.name, supplier.bestMatchScore, supplier.allMatchReasons)
                        }
                      }}
                    >
                      {supplier.name}
                    </span>
                    {supplier.isVerified && (
                      <BadgeCheck className="h-3.5 w-3.5 text-status-success flex-shrink-0" />
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                      {Math.round(supplier.bestMatchScore)}% match
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {matchedModules.length} module{matchedModules.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5 ml-auto mr-1">
                    {!rfqId ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCreateSupplierRfq(supplier.id, supplier)
                        }}
                        disabled={creatingRfqFor === supplier.id}
                      >
                        {creatingRfqFor === supplier.id ? "Creating…" : "Create RFQ"}
                      </Button>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                            stage === "quoted"
                              ? "bg-status-success/10 text-status-success border border-status-success/30"
                              : stage === "awaiting"
                                ? "bg-warning/10 text-warning border border-warning/30"
                                : "bg-info/10 text-info border border-info/30",
                          )}
                        >
                          {broadcastCounts.get(supplier.id)
                            ? `Sent to ${broadcastCounts.get(supplier.id)} supplier${broadcastCounts.get(supplier.id)! !== 1 ? "s" : ""}`
                            : (PROCUREMENT_STEPS.find((s) => s.key === stage)?.label ?? "RFQ Sent")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`/rfq/${rfqId}`, "_blank", "noopener,noreferrer")
                          }}
                        >
                          View
                          <ArrowRight className="h-2.5 w-2.5 ml-0.5" />
                        </Button>
                      </>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveFromShortlist(supplier.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {isExpanded && (
                  <div className="p-3 space-y-4 border-t">
                    {/* Matched modules list */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Matched Modules</p>
                      <div className="space-y-1">
                        {matchedModules.map((mod) => {
                          const diag = diagnosticAnswers?.[mod.id]
                          return (
                            <div key={mod.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                              <span className="font-medium text-foreground">{mod.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {diag?.mfg_process ?? "—"} · {diag?.material ?? "—"}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Match reasons */}
                    {supplier.allMatchReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {supplier.allMatchReasons.slice(0, 6).map((reason, i) => (
                          <span key={i} className="text-[9px] bg-international-orange/10 text-international-orange px-1.5 py-0.5 rounded-full font-mono">
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Procurement flow stepper */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Procurement Status</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {PROCUREMENT_STEPS.map((step, index) => {
                          const isActive = index <= currentStageIndex
                          return (
                            <span
                              key={step.key}
                              className={cn(
                                "inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium",
                                isActive
                                  ? "border-status-success/40 bg-status-success-light text-status-success"
                                  : "border-border bg-background text-muted-foreground",
                              )}
                            >
                              {step.label}
                            </span>
                          )
                        })}
                      </div>
                      {rfqId && (
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          {broadcastCounts.get(supplier.id) ? (
                            <p className="text-status-success font-medium">
                              RFQ broadcast to {broadcastCounts.get(supplier.id)} supplier{broadcastCounts.get(supplier.id)! !== 1 ? "s" : ""} · Notifications sent
                            </p>
                          ) : (
                            <p>
                              RFQ <span className="font-mono">{rfqId.slice(0, 8)}…</span>
                              {rfqStatus?.status ? ` · ${rfqStatus.status}` : ""}
                            </p>
                          )}
                          <p>
                            {rfqStatus?.responseCount
                              ? `${rfqStatus.responseCount} response${rfqStatus.responseCount !== 1 ? "s" : ""} received`
                              : "0 responses so far"}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Document generation + RFQ actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {DOC_TYPES.map((doc) => {
                        const isGenerated = supplierDocs.has(doc.id)
                        return (
                          <div key={doc.id} className="flex items-center gap-1">
                            <Button
                              variant={isGenerated ? "secondary" : "outline"}
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => handleGenerateDoc(supplier.id, supplier, doc.id)}
                            >
                              {isGenerated && <CheckCircle2 className="h-2.5 w-2.5 text-status-success" />}
                              {doc.shortName}
                            </Button>
                            {isGenerated && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-1.5 text-[10px]"
                                onClick={() => handleCopyDoc(supplier.id, doc.id)}
                              >
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            )}
                          </div>
                        )
                      })}

                      <div className="flex-1" />

                      {!rfqId ? (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => handleCreateSupplierRfq(supplier.id, supplier)}
                          disabled={creatingRfqFor === supplier.id}
                        >
                          {creatingRfqFor === supplier.id ? "Creating…" : "Create Marketplace RFQ"}
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => {
                              window.open(`/rfq/${rfqId}`, "_blank", "noopener,noreferrer")
                            }}
                          >
                            View RFQ
                            <ArrowRight className="h-2.5 w-2.5 ml-1" />
                          </Button>
                          {rfqStatus && rfqStatus.responseCount > 0 && projectId && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => handleAwardOrder(supplier.id, supplier)}
                              disabled={awardingFor === supplier.id}
                            >
                              {awardingFor === supplier.id ? "Awarding…" : "Award & Create Order"}
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Expandable document preview */}
                    {supplierDocs.size > 0 && (
                      <div className="space-y-2">
                        {[...supplierDocs.entries()].map(([docType, text]) => (
                          <details key={docType} className="border rounded-lg overflow-hidden">
                            <summary className="p-2 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/30 transition-colors">
                              {DOC_TYPES.find((d) => d.id === docType)?.name}
                            </summary>
                            <div className="border-t p-3 bg-muted/10">
                              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground max-h-[300px] overflow-auto">
                                {text}
                              </pre>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        {suppliers.length > 0 && (
          <div className="text-[11px] text-muted-foreground border-t pt-3">
            Each supplier receives a tailored RFQ package with only their matched modules.
            Documents are templates — review before sending.
          </div>
        )}
      </CardContent>

      {/* Supplier detail dialog */}
      <SupplierDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        supplierId={detailSupplierId}
        supplierName={detailSupplierName}
        cache={supplierDetailCache}
        matchScore={detailMatchScore}
        matchReasons={detailMatchReasons}
      />
    </Card>
  )
}
