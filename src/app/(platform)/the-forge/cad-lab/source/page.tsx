"use client"

/**
 * @file source/page.tsx — The Forge: Source stage (Stage 3).
 *
 * @description Supplier matching, RFQ creation, quote comparison, and cost tracking.
 * Users match suppliers to specified modules, create and broadcast RFQs, compare
 * incoming quotes, and award contracts to unlock the Assemble stage.
 *
 * 3 tabs: Suppliers, Shortlist, Costs.
 *
 * Gate: redirects to Specify if no specified modules exist.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  Package,
  AlertCircle,
  RefreshCw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SupplierProcurementFlow } from "@/components/cad/supplier-procurement-flow"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { CadLabShortlist } from "@/components/cad/cad-lab-shortlist"
import { useCadLab } from "../cad-lab-context"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { matchCadLabModuleSuppliers } from "@/actions/cad-lab-supplier-match"
import { getToleranceMm } from "@/lib/cad-lab/diagnostic-to-technique"
import { searchBuyPartProducts } from "@/actions/buy-part-search"
import type { BuyPartSearchResult } from "@/actions/buy-part-search"
import { toast } from "sonner"
import { buildUniqueSuppliers, buildSankeyData, buildPerCategorySuppliers } from "@/lib/sankey-utils"
import { ClassificationReviewPanel } from "@/components/cad/classification-review-panel"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { CadLabSupplierMatch, ScoreBreakdown } from "@/actions/cad-lab-supplier-match"
import { SupplierIntelligenceTab } from "@/components/cad/supplier-intelligence-tab"
import { ExecutiveReviewTab } from "@/components/cad/executive-review-tab"

// ─── Shortlisted supplier type ──────────────────────────────────────

export interface ShortlistedSupplier {
  id: string
  name: string
  isVerified: boolean
  supplierType: string
  moduleIds: string[]
  bestMatchScore: number
  bestScoreBreakdown: ScoreBreakdown
  allMatchReasons: string[]
}

// ─── Page Component ──────────────────────────────────────────────────

export default function SourcePage(): React.ReactNode {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    subject,
    hasResearch,
    modules,
    diagnosticAnswers,
    designBrief,
    assumptionNotes,
    activeProjectId,
    specifiedModuleCount,
    manufacturingOrderCount,
    refreshManufacturingOrderCount,
    setModules,
    aiCostEstimates,
    isEstimatingCosts,
    reEstimateCosts,
    partCategoryOverrides,
    setPartCategoryOverride,
    clearPartCategoryOverride,
  } = useCadLab()

  // Gate: redirect to Specify if no specified modules
  useEffect(() => {
    if (!hasResearch || specifiedModuleCount === 0) {
      router.replace(FORGE_ROUTES.cadLabSpecify)
    }
  }, [hasResearch, specifiedModuleCount, router])

  // ── Supplier matching state (persisted to localStorage per project) ──
  const storageKey = activeProjectId ? `forge-supplier-matches-${activeProjectId}` : null

  const [supplierMatches, setSupplierMatchesRaw] = useState<Map<string, CadLabSupplierMatch[]>>(() => {
    if (!storageKey) return new Map()
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) return new Map(JSON.parse(stored) as [string, CadLabSupplierMatch[]][])
    } catch { /* ignore corrupt data */ }
    return new Map()
  })

  const setSupplierMatches = useCallback((updater: (prev: Map<string, CadLabSupplierMatch[]>) => Map<string, CadLabSupplierMatch[]>) => {
    setSupplierMatchesRaw((prev) => {
      const next = updater(prev)
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify([...next.entries()])) } catch { /* quota */ }
      }
      return next
    })
  }, [storageKey])

  const [loadingModules, setLoadingModules] = useState<Set<string>>(new Set())
  const [matchAllLoading, setMatchAllLoading] = useState(false)

  // ── Shortlisted suppliers (persisted to localStorage per project) ──
  // INTENT: v2 key flushes stale shortlist data from the old infinite-loop bug
  const shortlistKey = activeProjectId ? `forge-supplier-shortlist-v2-${activeProjectId}` : null
  const rfqIdsKey = activeProjectId ? `forge-supplier-rfqs-${activeProjectId}` : null

  const [shortlistedSuppliers, setShortlistedSuppliersRaw] = useState<Map<string, ShortlistedSupplier>>(() => {
    if (!shortlistKey) return new Map()
    try {
      const stored = localStorage.getItem(shortlistKey)
      if (stored) return new Map(JSON.parse(stored) as [string, ShortlistedSupplier][])
    } catch { /* ignore corrupt data */ }
    return new Map()
  })

  const setShortlistedSuppliers = useCallback((updater: (prev: Map<string, ShortlistedSupplier>) => Map<string, ShortlistedSupplier>) => {
    setShortlistedSuppliersRaw((prev) => {
      const next = updater(prev)
      if (shortlistKey) {
        try { localStorage.setItem(shortlistKey, JSON.stringify([...next.entries()])) } catch { /* quota */ }
      }
      return next
    })
  }, [shortlistKey])

  const [perSupplierRfqIds, setPerSupplierRfqIdsRaw] = useState<Map<string, string>>(() => {
    if (!rfqIdsKey) return new Map()
    try {
      const stored = localStorage.getItem(rfqIdsKey)
      if (stored) return new Map(JSON.parse(stored) as [string, string][])
    } catch { /* ignore corrupt data */ }
    return new Map()
  })

  const setPerSupplierRfqIds = useCallback((updater: (prev: Map<string, string>) => Map<string, string>) => {
    setPerSupplierRfqIdsRaw((prev) => {
      const next = updater(prev)
      if (rfqIdsKey) {
        try { localStorage.setItem(rfqIdsKey, JSON.stringify([...next.entries()])) } catch { /* quota */ }
      }
      return next
    })
  }, [rfqIdsKey])

  const shortlistedSupplierIds = useMemo(
    () => new Set(shortlistedSuppliers.keys()),
    [shortlistedSuppliers],
  )

  const eligibleModules = useMemo(
    () => modules.filter((m) => m.status === "specified" || m.status === "generated"),
    [modules],
  )

  // ── Per-category ranked supplier state (v3 localStorage key) ──
  const categoryRankingsKey = activeProjectId ? `forge-supplier-shortlist-v3-${activeProjectId}` : null

  const [categoryRankings, setCategoryRankingsRaw] = useState<Map<string, string[]>>(() => {
    if (!categoryRankingsKey) return new Map()
    try {
      const stored = localStorage.getItem(categoryRankingsKey)
      if (stored) return new Map(JSON.parse(stored) as [string, string[]][])
    } catch { /* ignore corrupt data */ }
    return new Map()
  })

  const setCategoryRankings = useCallback((updater: (prev: Map<string, string[]>) => Map<string, string[]>) => {
    setCategoryRankingsRaw((prev) => {
      const next = updater(prev)
      if (categoryRankingsKey) {
        try { localStorage.setItem(categoryRankingsKey, JSON.stringify([...next.entries()])) } catch { /* quota */ }
      }
      return next
    })
  }, [categoryRankingsKey])

  // ── Buy part search state (persisted to localStorage per project) ──
  // DECISION: v7 cache key invalidates stale results after adding relevance scoring + unsourceable filter
  const buySearchKey = activeProjectId ? `forge-buy-search-v7-${activeProjectId}` : null

  const [buyPartResults, setBuyPartResultsRaw] = useState<BuyPartSearchResult[]>(() => {
    if (!buySearchKey) return []
    try {
      const stored = localStorage.getItem(buySearchKey)
      if (stored) return JSON.parse(stored) as BuyPartSearchResult[]
    } catch { /* ignore corrupt data */ }
    return []
  })

  const setBuyPartResults = useCallback((results: BuyPartSearchResult[]) => {
    setBuyPartResultsRaw(results)
    if (buySearchKey) {
      try { localStorage.setItem(buySearchKey, JSON.stringify(results)) } catch { /* quota */ }
    }
  }, [buySearchKey])

  const [buySearchLoading, setBuySearchLoading] = useState(false)

  const handleSearchBuyParts = useCallback(async (partNames: string[]) => {
    if (partNames.length === 0) return
    setBuySearchLoading(true)
    try {
      const results = await searchBuyPartProducts(partNames)
      setBuyPartResults(results)
      const withProducts = results.filter((r) => r.products.length > 0).length
      if (withProducts > 0) {
        toast.success(`Found products for ${withProducts} of ${results.length} buy parts`)
      } else {
        toast.info("No supplier products found — try again later or check supplier websites directly")
      }
    } catch (err) {
      console.error("[SOURCE] Buy part search failed:", err)
      toast.error("Buy part search failed")
    } finally {
      setBuySearchLoading(false)
    }
  }, [setBuyPartResults])

  // Build per-category supplier entries
  const { categories: sankeyCategories } = useMemo(
    () => buildSankeyData(eligibleModules, diagnosticAnswers, aiCostEstimates, partCategoryOverrides),
    [eligibleModules, diagnosticAnswers, aiCostEstimates, partCategoryOverrides],
  )

  const categorySupplierEntries = useMemo(
    () => buildPerCategorySuppliers(sankeyCategories, supplierMatches),
    [sankeyCategories, supplierMatches],
  )

  // ── Buy part names from Sankey categories ──
  const buyPartNames = useMemo(() => {
    const names: string[] = []
    for (const cat of sankeyCategories) {
      if (cat.type === "buy") {
        for (const part of cat.parts) names.push(part.name)
      }
    }
    return names
  }, [sankeyCategories])

  // DECISION: activeTab declared here (before effects that reference it) to avoid block-scoping TDZ error.
  const [activeTab, setActiveTab] = useState("suppliers")

  // ── Auto-trigger buy search when buy parts exist but no results cached ──
  const buySearchTriggeredRef = useRef(false)

  useEffect(() => {
    if (
      buyPartNames.length > 0 &&
      buyPartResults.length === 0 &&
      !buySearchLoading &&
      !buySearchTriggeredRef.current &&
      (activeTab === "costs" || activeTab === "shortlist")
    ) {
      buySearchTriggeredRef.current = true
      handleSearchBuyParts(buyPartNames)
    }
  }, [buyPartNames, buyPartResults.length, buySearchLoading, activeTab, handleSearchBuyParts])

  // INTENT: Clicking a supplier cycles its rank: unranked→1st→2nd→3rd→unranked.
  // Max 3 ranked per category. If a slot is occupied, the displaced supplier shifts down.
  const handlePromoteSupplier = useCallback((categoryId: string, supplierId: string, targetRank?: number) => {
    setCategoryRankings((prev) => {
      const next = new Map(prev)
      const current = [...(next.get(categoryId) ?? [])]
      const idx = current.indexOf(supplierId)

      if (targetRank != null) {
        // Sentinel: -1 means "remove from rankings entirely"
        if (targetRank === -1) {
          if (idx >= 0) current.splice(idx, 1)
          next.set(categoryId, current)
          return next
        }
        // Explicit rank target (0-indexed): remove from current position and insert
        if (idx >= 0) current.splice(idx, 1)
        current.splice(targetRank, 0, supplierId)
        // Cap at 3
        next.set(categoryId, current.slice(0, 3))
        return next
      }

      // Cycle: unranked → 1st(0) → 2nd(1) → 3rd(2) → unranked
      if (idx < 0) {
        // Not ranked → insert at position 0 (1st)
        current.unshift(supplierId)
        // Cap at 3
        next.set(categoryId, current.slice(0, 3))
      } else if (idx < 2 && current.length > idx + 1) {
        // Ranked at 1st or 2nd with room to demote → move down one position
        current.splice(idx, 1)
        current.splice(idx + 1, 0, supplierId)
        next.set(categoryId, current.slice(0, 3))
      } else {
        // Already at 3rd (or only entry) → remove (unranked)
        current.splice(idx, 1)
        next.set(categoryId, current)
      }

      return next
    })
  }, [setCategoryRankings])

  const handleShortlistSupplier = useCallback((supplier: CadLabSupplierMatch, moduleId: string) => {
    setShortlistedSuppliers((prev) => {
      const next = new Map(prev)
      const existing = next.get(supplier.id)

      if (existing) {
        // If already shortlisted from this module, remove the module association
        const remainingModules = existing.moduleIds.filter((id) => id !== moduleId)
        if (remainingModules.length === 0) {
          // Fully remove from shortlist
          next.delete(supplier.id)
        } else {
          next.set(supplier.id, { ...existing, moduleIds: remainingModules })
        }
      } else {
        // Add to shortlist
        next.set(supplier.id, {
          id: supplier.id,
          name: supplier.name,
          isVerified: supplier.isVerified,
          supplierType: supplier.supplierType,
          moduleIds: [moduleId],
          bestMatchScore: supplier.matchScore,
          bestScoreBreakdown: supplier.scoreBreakdown,
          allMatchReasons: [...supplier.matchReasons],
        })
      }
      return next
    })
  }, [setShortlistedSuppliers])

  const handleRemoveFromShortlist = useCallback((supplierId: string) => {
    setShortlistedSuppliers((prev) => {
      const next = new Map(prev)
      next.delete(supplierId)
      return next
    })
  }, [setShortlistedSuppliers])

  const handleMatchModule = useCallback(async (mod: CadLabModule) => {
    setLoadingModules((prev) => new Set(prev).add(mod.id))
    try {
      const diag = diagnosticAnswers[mod.id] ?? {}
      const matches = await matchCadLabModuleSuppliers({
        id: mod.id,
        name: mod.name,
        purpose: mod.purpose,
        keyParts: mod.keyParts,
        description: mod.description,
        process: diag.mfg_process ?? null,
        material: diag.material ?? null,
        toleranceMm: getToleranceMm(diag.tolerance),
        batchSize: diag.batch_size ?? null,
      })
      setSupplierMatches((prev) => new Map(prev).set(mod.id, matches))
    } catch (err) {
      console.error("[SOURCE] Supplier match failed:", err)
      toast.error(`Failed to match suppliers for ${mod.name}`)
    } finally {
      setLoadingModules((prev) => {
        const next = new Set(prev)
        next.delete(mod.id)
        return next
      })
    }
  }, [diagnosticAnswers, setSupplierMatches])

  const handleMatchAll = useCallback(async () => {
    setMatchAllLoading(true)
    try {
      await Promise.all(eligibleModules.map(handleMatchModule))
    } finally {
      setMatchAllLoading(false)
    }
  }, [eligibleModules, handleMatchModule])

  // ── Refresh active tab ──
  const isRefreshing =
    activeTab === "costs"
      ? buySearchLoading || isEstimatingCosts
      : matchAllLoading

  const handleRefreshActiveTab = useCallback(() => {
    if (activeTab === "suppliers") {
      setSupplierMatchesRaw(new Map())
      handleMatchAll()
      toast.info("Refreshing supplier matches…")
    } else if (activeTab === "shortlist") {
      setSupplierMatchesRaw(new Map())
      setShortlistedSuppliersRaw(new Map())
      setCategoryRankingsRaw(new Map())
      autoSelectKeyRef.current = ""
      handleMatchAll()
      toast.info("Refreshing shortlist…")
    } else if (activeTab === "costs") {
      setBuyPartResultsRaw([])
      // GOTCHA: Do NOT reset buySearchTriggeredRef — we call handleSearchBuyParts
      // directly below. Resetting the ref would let the auto-trigger effect fire
      // a duplicate search when the first one returns zero results.
      reEstimateCosts()
      if (buyPartNames.length > 0) {
        handleSearchBuyParts(buyPartNames)
      }
      toast.info("Refreshing cost data…")
    }
  }, [activeTab, handleMatchAll, handleSearchBuyParts, buyPartNames, reEstimateCosts])

  // ── Auto-select top 3 suppliers after matching ──
  const autoSelectKeyRef = useRef<string>("")

  useEffect(() => {
    const uniqueSuppliers = buildUniqueSuppliers(supplierMatches)
    if (uniqueSuppliers.length === 0) return

    const matchKey = [...supplierMatches.keys()].sort().join(",")
    if (matchKey === autoSelectKeyRef.current) return
    autoSelectKeyRef.current = matchKey

    // INTENT: Use setShortlistedSuppliers directly (stable ref) to avoid
    // re-triggering this effect via shortlistedSupplierIds / handleShortlistSupplier.
    const top3 = uniqueSuppliers.slice(0, 3)
    setShortlistedSuppliers((prev) => {
      const next = new Map(prev)
      for (const sup of top3) {
        if (!next.has(sup.id)) {
          next.set(sup.id, {
            id: sup.id,
            name: sup.name,
            isVerified: sup.isVerified,
            supplierType: sup.originalMatch.supplierType,
            moduleIds: [sup.firstModuleId],
            bestMatchScore: sup.bestScore,
            bestScoreBreakdown: sup.originalMatch.scoreBreakdown,
            allMatchReasons: [...sup.originalMatch.matchReasons],
          })
        }
      }
      return next
    })

    // INTENT: Auto-populate per-category rankings with top 3 per category.
    // Also prune stale supplier IDs that no longer exist in the current match results.
    setCategoryRankings((prev) => {
      const next = new Map(prev)
      for (const [catId, entries] of categorySupplierEntries) {
        const currentIds = new Set(entries.map((e) => e.supplierId))
        const existing = next.get(catId) ?? []
        const hasValidRanking = existing.some((id) => currentIds.has(id))
        if (!hasValidRanking) {
          next.set(catId, entries.slice(0, 3).map((e) => e.supplierId))
        } else {
          const pruned = existing.filter((id) => currentIds.has(id))
          if (pruned.length !== existing.length) next.set(catId, pruned)
        }
      }
      return next
    })
  }, [supplierMatches, setShortlistedSuppliers, categorySupplierEntries, setCategoryRankings])

  // ── Tab navigation ──
  const TABS = useMemo(
    () => [
      { id: "suppliers", label: "Suppliers" },
      { id: "shortlist", label: "Shortlist" },
      { id: "costs", label: "Costs" },
      { id: "supplier_intelligence", label: "Supplier Intelligence" },
      { id: "executive_review", label: "Executive Review" },
    ],
    [],
  )

  // INTENT: Read tab from URL after hydration — avoids React #418.
  // useSearchParams() returns empty during SSR; reading in useState causes mismatch.
  useEffect(() => {
    let param = searchParams.get("tab")
    // INTENT: Legacy redirect — "proposals" was renamed to "shortlist"
    if (param === "proposals") param = "shortlist"
    if (param && TABS.some((t) => t.id === param)) {
      setActiveTab(param)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId)
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", tabId)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // ── Auto-match on Shortlist tab load ──
  const autoMatchTriggeredRef = useRef(false)

  useEffect(() => {
    if (
      activeTab === "shortlist" &&
      supplierMatches.size === 0 &&
      eligibleModules.length > 0 &&
      !matchAllLoading &&
      !autoMatchTriggeredRef.current
    ) {
      autoMatchTriggeredRef.current = true
      handleMatchAll()
    }
  }, [activeTab, supplierMatches.size, eligibleModules.length, matchAllLoading, handleMatchAll])

  // ── Screen context ──
  useRegisterScreenContext(
    useMemo(() => ({
      pageTitle: `The Forge — Source: ${subject}`,
      summary: `Sourcing ${eligibleModules.length} modules. ${supplierMatches.size} matched.`,
    }), [subject, eligibleModules.length, supplierMatches.size]),
  )

  if (!hasResearch || specifiedModuleCount === 0) return null

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-international-orange" />
            Source
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Match suppliers, create RFQs, and compare quotes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabSpecify)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Specify
          </Button>
        </div>
      </div>

      {/* ── Classification review panel ── */}
      <ClassificationReviewPanel
        modules={eligibleModules}
        diagnosticAnswers={diagnosticAnswers}
        aiCostEstimates={aiCostEstimates}
        partCategoryOverrides={partCategoryOverrides}
        onOverride={setPartCategoryOverride}
        onClearOverride={clearPartCategoryOverride}
      />

      {/* ── Tab navigation ── */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
        <div className="flex items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "bg-international-orange text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={handleRefreshActiveTab}
            disabled={isRefreshing}
            title="Refresh current tab"
            className="ml-auto p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </nav>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        {/* ═══ Suppliers tab ═══ */}
        {activeTab === "suppliers" && (
          <motion.div key="suppliers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {eligibleModules.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">No eligible modules</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Modules need to be specified or generated before they can be matched with suppliers.
                  </p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.push(FORGE_ROUTES.cadLabSpecify)}>
                    Go to Specify
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <SupplierProcurementFlow
                modules={eligibleModules}
                diagnosticAnswers={diagnosticAnswers}
                aiCostEstimates={aiCostEstimates}
              />
            )}

            {/* Forward navigation — visible when manufacturing orders exist */}
            {manufacturingOrderCount > 0 && (
              <Card>
                <CardContent className="pt-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Sourcing complete</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {manufacturingOrderCount} manufacturing order{manufacturingOrderCount !== 1 ? "s" : ""} created. Continue to assembly.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabAssemble)}>
                    <Package className="h-4 w-4 mr-1.5" />
                    Continue to Assemble
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* ═══ Shortlist tab ═══ */}
        {activeTab === "shortlist" && (
          <motion.div key="shortlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <CadLabShortlist
              modules={eligibleModules}
              projectName={subject}
              diagnosticAnswers={diagnosticAnswers}
              projectId={activeProjectId}
              designBrief={designBrief}
              assumptionNotes={assumptionNotes}
              shortlistedSuppliers={shortlistedSuppliers}
              perSupplierRfqIds={perSupplierRfqIds}
              onSupplierRfqCreated={(supplierId, rfqId) => {
                setPerSupplierRfqIds((prev) => new Map(prev).set(supplierId, rfqId))
              }}
              onRemoveFromShortlist={handleRemoveFromShortlist}
              onOrderCreated={refreshManufacturingOrderCount}
              aiCostEstimates={aiCostEstimates}
              supplierMatches={supplierMatches}
              shortlistedSupplierIds={shortlistedSupplierIds}
              onShortlistSupplier={handleShortlistSupplier}
              categoryRankings={categoryRankings}
              categorySupplierEntries={categorySupplierEntries}
              onPromoteSupplier={handlePromoteSupplier}
              matchAllLoading={matchAllLoading}
              onMatchAll={handleMatchAll}
              buyPartResults={buyPartResults}
              buySearchLoading={buySearchLoading}
              onRefreshBuyParts={() => handleSearchBuyParts(buyPartNames)}
            />
            {/* INTENT: Show re-search button when all buy parts returned empty (stale cache from RS blocking) */}
            {buyPartResults.length > 0 &&
              buyPartResults.every((r) => r.products.length === 0) &&
              !buySearchLoading && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBuyPartResults([])
                    buySearchTriggeredRef.current = false
                    handleSearchBuyParts(buyPartNames)
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Re-search suppliers
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ Costs tab ═══ */}
        {activeTab === "costs" && (
          <motion.div key="costs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <CadLabCostEstimate
              modules={eligibleModules}
              diagnosticAnswers={diagnosticAnswers}
              shortlistedSupplierCount={shortlistedSuppliers.size}
              aiCostEstimates={aiCostEstimates}
              isEstimatingCosts={isEstimatingCosts}
              supplierMatches={supplierMatches}
              categoryRankings={categoryRankings}
              categorySupplierEntries={categorySupplierEntries}
              onPromoteSupplier={handlePromoteSupplier}
              buyPartResults={buyPartResults}
              buySearchLoading={buySearchLoading}
              onCostOverride={(moduleId, overrides) => {
                setModules(prev => prev.map(m =>
                  m.id === moduleId ? { ...m, costOverrides: overrides } : m
                ))
              }}
            />
            {/* INTENT: Show re-search button when all buy parts returned empty (stale cache from RS blocking) */}
            {buyPartResults.length > 0 &&
              buyPartResults.every((r) => r.products.length === 0) &&
              !buySearchLoading && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBuyPartResults([])
                    buySearchTriggeredRef.current = false
                    handleSearchBuyParts(buyPartNames)
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Re-search suppliers
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ Supplier Intelligence tab ═══ */}
        {activeTab === "supplier_intelligence" && (
          <motion.div key="supplier_intelligence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <SupplierIntelligenceTab
              modules={eligibleModules}
              diagnosticAnswers={diagnosticAnswers}
              supplierMatches={supplierMatches}
            />
          </motion.div>
        )}

        {/* ═══ Executive Review tab ═══ */}
        {activeTab === "executive_review" && (
          <motion.div key="executive_review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <ExecutiveReviewTab
              modules={eligibleModules}
              diagnosticAnswers={diagnosticAnswers}
              context="sourcing"
              useCase={designBrief?.useCase}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
