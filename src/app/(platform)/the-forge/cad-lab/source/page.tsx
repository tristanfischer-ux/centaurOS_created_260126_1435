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
import { motion } from "framer-motion"
import { SafeAnimatePresence } from "@/components/ui/safe-animate-presence"
import {
  ShoppingCart,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  FileDown,
} from "lucide-react"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, Users as UsersIcon } from "lucide-react"
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
import { DesignReportDialog } from "../components/design-report-dialog"
import { classifyPart } from "@/lib/part-classification"
import { GetQuoteButton } from "@/components/cad/get-quote-button"
import { SourceSpecialistInsights } from "@/components/cad/source-specialist-insights"
import { SupplierFitnessReview } from "@/components/cad/supplier-fitness-review"
import { StageSpecialistCard } from "@/components/cad/stage-specialist-card"
import { useStageBriefing } from "@/hooks/use-stage-briefing"
import { useCompanyReview } from "@/hooks/use-company-review"
import {
  getProjectShortlist,
  addToShortlist as addToShortlistAction,
  removeFromShortlist as removeFromShortlistAction,
  migrateShortlistFromLocalStorage,
  clearProjectShortlist,
} from "@/actions/forge-shortlist"
import { STAGE_SPECIALISTS, getNextStageSpecialist } from "@/lib/cad-lab/stage-specialist-map"
import { SupplyRiskRadar } from "@/components/cad/supply-risk-radar"
import { VolumeRampPlanner } from "@/components/cad/volume-ramp-planner"
import type { RampRole, RampRoleState } from "@/components/cad/volume-ramp-planner"
import { CapabilityInterviewPackDialog } from "@/components/cad/capability-interview-pack-dialog"
import { NDAGate } from "@/components/cad/nda-gate"
import type { NDAState } from "@/components/cad/nda-gate"
import { SupplierOutreachLog } from "@/components/cad/supplier-outreach-log"
import type { OutreachLogState } from "@/components/cad/supplier-outreach-log"
import { RFQBenchmarksCard } from "@/components/cad/rfq-benchmarks-card"
import { CostReductionTrigger } from "@/components/cad/cost-reduction-trigger"
import { DesignIterationHost, type DesignIterationHostHandle } from "@/components/cad/design-iteration-host"
import { DesignConstraintBanners } from "@/components/cad/design-constraint-banners"
import { ProjectRatingPrompt } from "@/components/cad/project-rating-prompt"
import { FileText } from "lucide-react"

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
    modules = [],
    diagnosticAnswers,
    designBrief,
    assumptionNotes,
    activeProjectId,
    initialized,
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
    linkedRfqId,
    linkRfqToProject,
    moduleReviews,
    revisedModuleIds,
  } = useCadLab()

  // Fetch RFQ quotes if linked — with proper cleanup to avoid stale state
  const [rfqQuotes, setRfqQuotes] = useState<{ rfqTitle: string | null; quotes: { supplierName: string; price: number | null; timelineWeeks: number | null; proposalTitle: string | null }[] } | undefined>()
  useEffect(() => {
    if (!linkedRfqId) { setRfqQuotes(undefined); return }
    let cancelled = false
    import("@/actions/rfq").then(({ getLinkedRFQQuotes }) =>
      getLinkedRFQQuotes(linkedRfqId).then(result => {
        if (!cancelled) setRfqQuotes(result)
      })
    ).catch(err => {
      console.warn("[SOURCE] RFQ quotes fetch failed:", err instanceof Error ? err.message : err)
      if (!cancelled) setRfqQuotes(undefined)
    })
    return () => { cancelled = true }
  }, [linkedRfqId])

  // Gate: redirect to Specify if no specified modules.
  // GATE-HYDRATION FIX: Wait for `initialized=true` from context before firing —
  // otherwise direct URL hits silently bounce to Specify because context values
  // are their initial defaults (hasResearch=false, specifiedModuleCount=0) on
  // first render. See MEMORY.md "gate-redirect pre-hydration" rule.
  useEffect(() => {
    if (!initialized) return
    if (!hasResearch || specifiedModuleCount === 0) {
      router.replace(FORGE_ROUTES.cadLabSpecify)
    }
  }, [initialized, hasResearch, specifiedModuleCount, router])

  // ── Supplier matching state (persisted to localStorage per project) ──
  const storageKey = activeProjectId ? `forge-supplier-matches-${activeProjectId}` : null

  const [supplierMatches, setSupplierMatchesRaw] = useState<Map<string, CadLabSupplierMatch[]>>(() => {
    if (!storageKey || typeof window === "undefined") return new Map()
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
    if (!shortlistKey || typeof window === "undefined") return new Map()
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
    if (!rfqIdsKey || typeof window === "undefined") return new Map()
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

  // ── Phase 4: DB-backed shortlist hydration ────────────────────────
  // On mount (or project change), DB is authoritative. Migration path:
  //   1. Fetch DB rows via getProjectShortlist(projectId).
  //   2. If DB has rows → replace local Map with DB state (cross-device sync).
  //   3. If DB empty AND localStorage v2 has entries → migrate to DB, then
  //      refetch and apply. Bump v3 marker so we don't re-migrate.
  //   4. Local mutations still write localStorage for offline cache; DB
  //      writes happen fire-and-forget alongside.
  // Safe to fail: if DB read errors, we keep the localStorage-hydrated Map.
  const shortlistMigratedKey = activeProjectId ? `forge-supplier-shortlist-v3-migrated-${activeProjectId}` : null
  const hydratedProjectRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeProjectId || typeof window === "undefined") return
    if (hydratedProjectRef.current === activeProjectId) return
    hydratedProjectRef.current = activeProjectId

    const doHydrate = async () => {
      try {
        const dbRows = await getProjectShortlist(activeProjectId)

        if (dbRows.length > 0) {
          // DB authoritative
          setShortlistedSuppliersRaw(new Map(
            dbRows.map((r) => [r.supplierId, {
              id: r.supplierId,
              name: r.name,
              isVerified: r.isVerified,
              supplierType: r.supplierType,
              moduleIds: r.moduleIds,
              bestMatchScore: r.bestMatchScore,
              bestScoreBreakdown: r.bestScoreBreakdown,
              allMatchReasons: r.allMatchReasons,
            } satisfies ShortlistedSupplier]),
          ))
          return
        }

        // DB empty — check localStorage v2 for one-shot migration
        const alreadyMigrated = shortlistMigratedKey ? localStorage.getItem(shortlistMigratedKey) : null
        if (alreadyMigrated) return

        const v2 = shortlistKey ? localStorage.getItem(shortlistKey) : null
        if (!v2) {
          if (shortlistMigratedKey) localStorage.setItem(shortlistMigratedKey, new Date().toISOString())
          return
        }

        let entries: [string, ShortlistedSupplier][] = []
        try {
          entries = JSON.parse(v2) as [string, ShortlistedSupplier][]
        } catch {
          return
        }
        if (entries.length === 0) {
          if (shortlistMigratedKey) localStorage.setItem(shortlistMigratedKey, new Date().toISOString())
          return
        }

        const result = await migrateShortlistFromLocalStorage({
          projectId: activeProjectId,
          entries: entries.map(([, s]) => ({
            supplierId: s.id,
            name: s.name,
            isVerified: s.isVerified,
            supplierType: s.supplierType,
            moduleIds: s.moduleIds,
            bestMatchScore: s.bestMatchScore,
            bestScoreBreakdown: s.bestScoreBreakdown,
            allMatchReasons: s.allMatchReasons,
          })),
        })
        if (result.migrated > 0 && shortlistMigratedKey) {
          localStorage.setItem(shortlistMigratedKey, new Date().toISOString())
          // Refetch from DB so the Map reflects server-side state (with added_at etc.)
          const refetched = await getProjectShortlist(activeProjectId)
          if (refetched.length > 0) {
            setShortlistedSuppliersRaw(new Map(
              refetched.map((r) => [r.supplierId, {
                id: r.supplierId,
                name: r.name,
                isVerified: r.isVerified,
                supplierType: r.supplierType,
                moduleIds: r.moduleIds,
                bestMatchScore: r.bestMatchScore,
                bestScoreBreakdown: r.bestScoreBreakdown,
                allMatchReasons: r.allMatchReasons,
              } satisfies ShortlistedSupplier]),
            ))
          }
        }
      } catch (err) {
        console.warn("[SOURCE] shortlist hydration failed:", err instanceof Error ? err.message : err)
      }
    }
    doHydrate()
  }, [activeProjectId, shortlistKey, shortlistMigratedKey])

  const eligibleModules = useMemo(
    () => modules.filter((m) => m.status === "specified" || m.status === "generated"),
    [modules],
  )

  // ── Per-category ranked supplier state (v3 localStorage key) ──
  const categoryRankingsKey = activeProjectId ? `forge-supplier-shortlist-v3-${activeProjectId}` : null

  const [categoryRankings, setCategoryRankingsRaw] = useState<Map<string, string[]>>(() => {
    if (!categoryRankingsKey || typeof window === "undefined") return new Map()
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
    if (!buySearchKey || typeof window === "undefined") return []
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

  // INTENT: Build classified parts for the report export
  const reportClassifiedParts = useMemo(() => {
    return eligibleModules.flatMap((mod) => {
      const diag = diagnosticAnswers[mod.id]
      const costEstimate = aiCostEstimates?.[mod.id]
      const partNames = costEstimate?.parts?.map((p) => p.name) ?? mod.keyParts
      return partNames.map((name) => {
        const cls = classifyPart(name, diag?.mfg_process ?? "Unknown", diag?.material ?? "Unknown")
        const override = partCategoryOverrides[`${mod.id}::${name}`]
        return {
          partName: name,
          moduleName: mod.name,
          type: (override?.type ?? cls.type) as "buy" | "make",
          confidence: override ? "high" : cls.confidence,
          reasons: cls.reasons,
        }
      })
    })
  }, [eligibleModules, diagnosticAnswers, aiCostEstimates, partCategoryOverrides])

  // DECISION: activeTab declared here (before effects that reference it) to avoid block-scoping TDZ error.
  const [activeTab, setActiveTab] = useState("suppliers")
  const [execReviewOpen, setExecReviewOpen] = useState(false)
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  // Design-iteration host ref — cost-overrun trigger on Costs tab + future
  // manual triggers on this page route through here.
  const designIterationHostRef = useRef<DesignIterationHostHandle | null>(null)

  // ── Volume Ramp Planner state (per-project localStorage) ──
  const rampRolesKey = activeProjectId ? `forge-ramp-roles-${activeProjectId}` : null
  const [rampRoles, setRampRolesRaw] = useState<RampRoleState>(() => {
    if (!rampRolesKey || typeof window === "undefined") return {}
    try {
      const stored = localStorage.getItem(rampRolesKey)
      if (stored) return JSON.parse(stored) as RampRoleState
    } catch { /* ignore */ }
    return {}
  })
  const setRampRole = useCallback((supplierId: string, role: RampRole) => {
    setRampRolesRaw((prev) => {
      const next: RampRoleState = { ...prev, [supplierId]: role }
      if (rampRolesKey) {
        try { localStorage.setItem(rampRolesKey, JSON.stringify(next)) } catch { /* quota */ }
      }
      return next
    })
  }, [rampRolesKey])

  // ── NDA state (per-project localStorage) ──
  const ndaKey = activeProjectId ? `forge-nda-state-${activeProjectId}` : null
  const [ndaState, setNdaStateRaw] = useState<NDAState>(() => {
    if (!ndaKey || typeof window === "undefined") return { acknowledged: false, ndaReference: "" }
    try {
      const stored = localStorage.getItem(ndaKey)
      if (stored) return JSON.parse(stored) as NDAState
    } catch { /* ignore */ }
    return { acknowledged: false, ndaReference: "" }
  })
  const setNdaState = useCallback((next: NDAState) => {
    setNdaStateRaw(next)
    if (ndaKey) {
      try { localStorage.setItem(ndaKey, JSON.stringify(next)) } catch { /* quota */ }
    }
  }, [ndaKey])

  // ── Target market (per-project localStorage, used by Supply Risk + Assemble) ──
  const targetMarketKey = activeProjectId ? `forge-target-market-${activeProjectId}` : null
  const [targetMarket, setTargetMarketRaw] = useState<"US" | "UK" | "EU" | "other">(() => {
    if (!targetMarketKey || typeof window === "undefined") return "UK"
    try {
      const stored = localStorage.getItem(targetMarketKey)
      if (stored === "US" || stored === "UK" || stored === "EU" || stored === "other") return stored
    } catch { /* ignore */ }
    return "UK"
  })
  const setTargetMarket = useCallback((next: "US" | "UK" | "EU" | "other") => {
    setTargetMarketRaw(next)
    if (targetMarketKey) {
      try { localStorage.setItem(targetMarketKey, next) } catch { /* quota */ }
    }
  }, [targetMarketKey])

  // ── Capability interview pack dialog ──
  const [interviewPackOpen, setInterviewPackOpen] = useState(false)
  const [interviewPackSupplier, setInterviewPackSupplier] = useState<string | null>(null)

  // ── Supplier outreach log state (per-project localStorage) ──
  const outreachKey = activeProjectId ? `forge-outreach-log-${activeProjectId}` : null
  const [outreachState, setOutreachStateRaw] = useState<OutreachLogState>(() => {
    if (!outreachKey || typeof window === "undefined") return {}
    try {
      const stored = localStorage.getItem(outreachKey)
      if (stored) return JSON.parse(stored) as OutreachLogState
    } catch { /* ignore */ }
    return {}
  })
  const setOutreachState = useCallback((next: OutreachLogState) => {
    setOutreachStateRaw(next)
    if (outreachKey) {
      try { localStorage.setItem(outreachKey, JSON.stringify(next)) } catch { /* quota */ }
    }
  }, [outreachKey])

  const replySlaKey = activeProjectId ? `forge-outreach-sla-${activeProjectId}` : null
  const [replySlaDays, setReplySlaDaysRaw] = useState<number>(() => {
    if (!replySlaKey || typeof window === "undefined") return 5
    try {
      const stored = localStorage.getItem(replySlaKey)
      if (stored) {
        const n = parseInt(stored, 10)
        if (!Number.isNaN(n) && n >= 1 && n <= 30) return n
      }
    } catch { /* ignore */ }
    return 5
  })
  const setReplySlaDays = useCallback((n: number) => {
    setReplySlaDaysRaw(n)
    if (replySlaKey) {
      try { localStorage.setItem(replySlaKey, String(n)) } catch { /* quota */ }
    }
  }, [replySlaKey])

  // ── Category labels map for Supply Risk Radar ──
  const categoryLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const cat of sankeyCategories) m.set(cat.id, cat.label)
    return m
  }, [sankeyCategories])

  // ── MOQ lookup for Volume Ramp Planner (reads supplier matches) ──
  const moqBySupplier = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const matches of supplierMatches.values()) {
      for (const match of matches) {
        if (!m.has(match.id)) m.set(match.id, match.minimumOrder ?? null)
      }
    }
    return m
  }, [supplierMatches])

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
          next.delete(supplier.id)
          // DB: fire-and-forget removal. Failures logged server-side; local
          // state owns the optimistic update.
          if (activeProjectId) {
            removeFromShortlistAction(activeProjectId, supplier.id).catch((e) =>
              console.warn("[SOURCE] remove shortlist DB sync failed:", e))
          }
        } else {
          next.set(supplier.id, { ...existing, moduleIds: remainingModules })
          if (activeProjectId) {
            addToShortlistAction({
              projectId: activeProjectId,
              supplierId: supplier.id,
              name: existing.name,
              isVerified: existing.isVerified,
              supplierType: existing.supplierType,
              moduleIds: remainingModules,
              bestMatchScore: existing.bestMatchScore,
              bestScoreBreakdown: existing.bestScoreBreakdown,
              allMatchReasons: existing.allMatchReasons,
            }).catch((e) => console.warn("[SOURCE] update shortlist DB sync failed:", e))
          }
        }
      } else {
        // Add to shortlist
        const newEntry: ShortlistedSupplier = {
          id: supplier.id,
          name: supplier.name,
          isVerified: supplier.isVerified,
          supplierType: supplier.supplierType,
          moduleIds: [moduleId],
          bestMatchScore: supplier.matchScore,
          bestScoreBreakdown: supplier.scoreBreakdown,
          allMatchReasons: [...supplier.matchReasons],
        }
        next.set(supplier.id, newEntry)
        if (activeProjectId) {
          addToShortlistAction({
            projectId: activeProjectId,
            supplierId: supplier.id,
            name: newEntry.name,
            isVerified: newEntry.isVerified,
            supplierType: newEntry.supplierType,
            moduleIds: newEntry.moduleIds,
            bestMatchScore: newEntry.bestMatchScore,
            bestScoreBreakdown: newEntry.bestScoreBreakdown,
            allMatchReasons: newEntry.allMatchReasons,
          }).catch((e) => console.warn("[SOURCE] add shortlist DB sync failed:", e))
        }
      }
      return next
    })
  }, [setShortlistedSuppliers, activeProjectId])

  const handleRemoveFromShortlist = useCallback((supplierId: string) => {
    setShortlistedSuppliers((prev) => {
      const next = new Map(prev)
      next.delete(supplierId)
      return next
    })
    if (activeProjectId) {
      removeFromShortlistAction(activeProjectId, supplierId).catch((e) =>
        console.warn("[SOURCE] remove shortlist DB sync failed:", e))
    }
  }, [setShortlistedSuppliers, activeProjectId])

  // Phase 3 (2026-04-18): coarse-grained toggle used by the consolidated
  // Supplier Intelligence card shortlist button. Clicking "Shortlist" on a
  // candidate card is a supplier-level action, not per-module — so we pick
  // the first matching module (if any) as the initial association when
  // adding, and fully remove on toggle-off.
  const handleToggleShortlistFromIntel = useCallback(
    (supplier: CadLabSupplierMatch) => {
      if (shortlistedSupplierIds.has(supplier.id)) {
        handleRemoveFromShortlist(supplier.id)
        return
      }
      // Find the first module this supplier matches on (from supplierMatches)
      let firstModuleId: string | null = null
      for (const [moduleId, matches] of supplierMatches.entries()) {
        if (matches.some((m) => m.id === supplier.id)) {
          firstModuleId = moduleId
          break
        }
      }
      if (!firstModuleId) {
        // Fallback: no module mapping found — shouldn't happen because the
        // card only renders for matched suppliers, but log and no-op.
        console.warn("[SOURCE] toggleShortlist: no module mapping for", supplier.id)
        return
      }
      handleShortlistSupplier(supplier, firstModuleId)
    },
    [shortlistedSupplierIds, supplierMatches, handleShortlistSupplier, handleRemoveFromShortlist],
  )

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
      // Use wrapper to sync localStorage
      setSupplierMatches(() => new Map())
      handleMatchAll()
      toast.info("Refreshing supplier matches…")
    } else if (activeTab === "shortlist") {
      setSupplierMatches(() => new Map())
      setShortlistedSuppliers(() => new Map())
      setCategoryRankings(() => new Map())
      autoSelectKeyRef.current = ""
      // DB sync: wipe persisted shortlist for this project so next mount
      // doesn't re-hydrate yesterday's shortlist over a fresh match run.
      if (activeProjectId) {
        clearProjectShortlist(activeProjectId).catch((e) =>
          console.warn("[SOURCE] refresh wipe shortlist DB sync failed:", e))
      }
      handleMatchAll()
      toast.info("Refreshing shortlist…")
    } else if (activeTab === "costs") {
      setBuyPartResults([])
      // GOTCHA: Do NOT reset buySearchTriggeredRef — we call handleSearchBuyParts
      // directly below. Resetting the ref would let the auto-trigger effect fire
      // a duplicate search when the first one returns zero results.
      reEstimateCosts()
      if (buyPartNames.length > 0) {
        handleSearchBuyParts(buyPartNames)
      }
      toast.info("Refreshing cost data…")
    }
  }, [activeTab, handleMatchAll, handleSearchBuyParts, buyPartNames, reEstimateCosts, setSupplierMatches, setShortlistedSuppliers, setCategoryRankings, setBuyPartResults])

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
    const newlyAdded: ShortlistedSupplier[] = []
    setShortlistedSuppliers((prev) => {
      const next = new Map(prev)
      for (const sup of top3) {
        if (!next.has(sup.id)) {
          const entry: ShortlistedSupplier = {
            id: sup.id,
            name: sup.name,
            isVerified: sup.isVerified,
            supplierType: sup.originalMatch.supplierType,
            moduleIds: [sup.firstModuleId],
            bestMatchScore: sup.bestScore,
            bestScoreBreakdown: sup.originalMatch.scoreBreakdown,
            allMatchReasons: [...sup.originalMatch.matchReasons],
          }
          next.set(sup.id, entry)
          newlyAdded.push(entry)
        }
      }
      return next
    })

    // DB sync: persist newly auto-added top-3 suppliers for this project.
    if (activeProjectId && newlyAdded.length > 0) {
      for (const entry of newlyAdded) {
        addToShortlistAction({
          projectId: activeProjectId,
          supplierId: entry.id,
          name: entry.name,
          isVerified: entry.isVerified,
          supplierType: entry.supplierType,
          moduleIds: entry.moduleIds,
          bestMatchScore: entry.bestMatchScore,
          bestScoreBreakdown: entry.bestScoreBreakdown,
          allMatchReasons: entry.allMatchReasons,
        }).catch((e) => console.warn("[SOURCE] auto-select DB sync failed:", e))
      }
    }

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
    ],
    [],
  )

  // INTENT: Read tab from URL after hydration — avoids React #418.
  // useSearchParams() returns empty during SSR; reading in useState causes mismatch.
  useEffect(() => {
    let param = searchParams.get("tab")
    // INTENT: Legacy redirects
    //   - "proposals" → renamed to "shortlist"
    //   - "executive_review" → removed as standalone tab in Phase 2B (2026-04-18),
    //     folded into the Supplier Intelligence tab as a collapsed secondary card.
    if (param === "proposals") param = "shortlist"
    if (param === "executive_review") param = "supplier_intelligence"
    if (param && TABS.some((t) => t.id === param)) {
      setActiveTab(param)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show time-logging toast when arriving from a completed stage
  useEffect(() => {
    const from = searchParams.get("from")
    if (from === "specify") {
      toast("Specify stage complete", {
        description: "Log the time you spent specifying?",
        action: { label: "Log Time", onClick: () => { window.location.href = "/time" } },
      })
      // Clean up the URL param
      const params = new URLSearchParams(searchParams.toString())
      params.delete("from")
      router.replace(`?${params.toString()}`, { scroll: false })
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

  // ── Rehydrate per-project state on project switch ──
  // INTENT: Every `useState(() => ...)` initializer above reads localStorage
  // once at mount. If the user switches projects via the CAD Lab context
  // (without a route change), storageKey/shortlistKey/etc. recompute to the
  // new project's keys but the in-memory state still holds the OLD project's
  // data. The setter wrappers then WRITE that stale data into the new
  // project's localStorage bucket — silently corrupting Project B's state
  // with Project A's matches.
  // FIX: watch activeProjectId and force a rehydrate from the new project's
  // keys. Reset one-shot refs so auto-trigger effects fire for the new
  // project. Guarded on first mount to avoid a double-init.
  const prevProjectIdRef = useRef<string | null>(activeProjectId)
  useEffect(() => {
    // First mount: prevProjectIdRef was initialized to activeProjectId, so this
    // effect's first run is a no-op. Only rehydrate on actual change.
    if (activeProjectId === prevProjectIdRef.current) return
    prevProjectIdRef.current = activeProjectId

    // INTENT: read fresh from localStorage for the new project. If no stored
    // data exists (or we don't have a project yet), fall back to empty.
    const readMap = <V,>(key: string | null): Map<string, V> => {
      if (!key || typeof window === "undefined") return new Map()
      try {
        const stored = localStorage.getItem(key)
        if (stored) return new Map(JSON.parse(stored) as [string, V][])
      } catch (err) {
        console.warn("[SOURCE] Failed to rehydrate map from key:", key, err)
      }
      return new Map()
    }
    const readArray = <T,>(key: string | null): T[] => {
      if (!key || typeof window === "undefined") return []
      try {
        const stored = localStorage.getItem(key)
        if (stored) return JSON.parse(stored) as T[]
      } catch (err) {
        console.warn("[SOURCE] Failed to rehydrate array from key:", key, err)
      }
      return []
    }

    setSupplierMatchesRaw(readMap<CadLabSupplierMatch[]>(storageKey))
    setShortlistedSuppliersRaw(readMap<ShortlistedSupplier>(shortlistKey))
    setPerSupplierRfqIdsRaw(readMap<string>(rfqIdsKey))
    setCategoryRankingsRaw(readMap<string[]>(categoryRankingsKey))
    setBuyPartResultsRaw(readArray<BuyPartSearchResult>(buySearchKey))
    setRfqQuotes(undefined)

    // INTENT: Also rehydrate ramp roles, NDA state, and target market on project switch.
    // See 2026-04-17 rule: useState initialisers don't re-run when activeProjectId changes.
    const readJson = <T,>(key: string | null, fallback: T): T => {
      if (!key || typeof window === "undefined") return fallback
      try {
        const stored = localStorage.getItem(key)
        if (stored) return JSON.parse(stored) as T
      } catch (err) {
        console.warn("[SOURCE] Failed to rehydrate json from key:", key, err)
      }
      return fallback
    }
    setRampRolesRaw(readJson<RampRoleState>(rampRolesKey, {}))
    setNdaStateRaw(readJson<NDAState>(ndaKey, { acknowledged: false, ndaReference: "" }))
    const tm = targetMarketKey && typeof window !== "undefined" ? localStorage.getItem(targetMarketKey) : null
    setTargetMarketRaw(tm === "US" || tm === "UK" || tm === "EU" || tm === "other" ? tm : "UK")
    setOutreachStateRaw(readJson<OutreachLogState>(outreachKey, {}))
    const sla = replySlaKey && typeof window !== "undefined" ? localStorage.getItem(replySlaKey) : null
    const slaN = sla ? parseInt(sla, 10) : NaN
    setReplySlaDaysRaw(!Number.isNaN(slaN) && slaN >= 1 && slaN <= 30 ? slaN : 5)

    // Reset one-shot refs so auto-behaviour runs for the new project
    autoSelectKeyRef.current = ""
    autoMatchTriggeredRef.current = false
    buySearchTriggeredRef.current = false
  }, [activeProjectId, storageKey, shortlistKey, rfqIdsKey, categoryRankingsKey, buySearchKey, rampRolesKey, ndaKey, targetMarketKey, outreachKey, replySlaKey])

  // ── Screen context ──
  useRegisterScreenContext(
    useMemo(() => ({
      pageTitle: `The Forge — Source: ${subject}`,
      summary: `Sourcing ${eligibleModules.length} modules. ${supplierMatches.size} matched.`,
    }), [subject, eligibleModules.length, supplierMatches.size]),
  )

  // ── Stage briefings — Source stage owned by Chase (VP Supply Chain) ──
  const sourceMapping = STAGE_SPECIALISTS.source
  const nextSource = getNextStageSpecialist("source")
  const matchedCount = [...supplierMatches.values()].filter(v => v.length > 0).length
  const sourceEntryBriefingText = useMemo(() => {
    const total = eligibleModules.length
    if (matchedCount === 0) return "Match suppliers for each module to start building your supply chain. I'll validate dual-sourcing and flag single-source risks."
    if (matchedCount < total) return `${matchedCount} of ${total} modules matched. Keep going — match all modules before proceeding to assembly.`
    if (manufacturingOrderCount > 0) return `All ${total} modules matched with ${manufacturingOrderCount} manufacturing order${manufacturingOrderCount !== 1 ? "s" : ""} created. Ready to proceed to assembly.`
    return `All ${total} modules matched. Create RFQs and manufacturing orders to proceed to assembly.`
  }, [matchedCount, eligibleModules.length, manufacturingOrderCount])

  const { briefing: sourceExitBriefing, isLoading: sourceExitLoading } = useStageBriefing({
    stage: "source",
    variant: "exit",
    projectId: activeProjectId,
    projectSubject: subject,
    moduleCount: modules.length,
    supplierMatchCount: matchedCount,
    manufacturingOrderCount,
    enabled: manufacturingOrderCount > 0,
  })

  // ── Company review context — shared verdict source for SupplierFitnessReview
  // AND SupplierIntelligenceTab so the two surfaces agree on which supplier is
  // Recommended vs Not Recommended. Both call useCompanyReview individually but
  // share the localStorage cache via identical cache key, so only one fetch fires.
  // Sankey coverage map — category id → shortlisted vs target. Target 2 reflects
  // the dual-source rule (Phase 2 Round 2 decision). Used by SupplierProcurementFlow
  // to render per-category coverage pills so single-source risks are visible up-front.
  const sankeyCoverage = useMemo(() => {
    const map = new Map<string, { shortlisted: number; target: number }>()
    for (const [catKey, rankedIds] of categoryRankings) {
      const shortlisted = rankedIds.filter((id) => shortlistedSuppliers.has(id)).length
      map.set(catKey, { shortlisted, target: 2 })
    }
    return map
  }, [categoryRankings, shortlistedSuppliers])

  const companyReviewCompanyIds = useMemo(() => {
    const set = new Set<string>()
    for (const matches of supplierMatches.values()) {
      for (const m of matches) set.add(m.id)
    }
    return [...set]
  }, [supplierMatches])

  const companyReviewMatchContext = useMemo(() => {
    const bestByCompany = new Map<string, CadLabSupplierMatch>()
    for (const matches of supplierMatches.values()) {
      for (const m of matches) {
        const existing = bestByCompany.get(m.id)
        if (!existing || m.matchScore > existing.matchScore) bestByCompany.set(m.id, m)
      }
    }
    return companyReviewCompanyIds.map((id) => {
      const m = bestByCompany.get(id)
      return {
        companyId: id,
        matchScore: m ? Math.round(m.matchScore) : 0,
        topReasons: m ? m.matchReasons.slice(0, 3) : [],
      }
    })
  }, [companyReviewCompanyIds, supplierMatches])

  const companyReviewModuleSpecs = useMemo(
    () =>
      eligibleModules.map((mod) => {
        const diag = diagnosticAnswers[mod.id] ?? {}
        return {
          name: mod.name,
          process: diag.mfg_process ?? "",
          material: diag.material ?? "",
          tolerance: diag.tolerance ?? "",
          batchSize: diag.batch_size ?? "",
          environment: diag.environment ?? "",
        }
      }),
    [eligibleModules, diagnosticAnswers],
  )

  const { reviews: sharedCompanyReviews } = useCompanyReview({
    stage: "source",
    projectId: activeProjectId,
    projectSubject: subject,
    modules: companyReviewModuleSpecs,
    companyIds: companyReviewCompanyIds,
    matchContext: companyReviewMatchContext,
    enabled: companyReviewCompanyIds.length > 0,
  })

  if (!hasResearch || specifiedModuleCount === 0) return null

  return (
    <div className="space-y-6">
      {/* Phase 2D (2026-04-18): section order follows Round 2 red-team:
          Header → constraint banners → specialist framing → Classification Review
          → Tabs (Suppliers / Shortlist / Costs / Supplier Intelligence + Chase
          + Exec Review as collapsed inside Supplier Intelligence). Chase's
          SupplierFitnessReview moved into the Supplier Intelligence tab where
          it belongs contextually. Page header moved to the top. */}

      {/* ── Page header (top of scroll) ── */}
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
          <GetQuoteButton
            projectId={activeProjectId}
            pipelineStage="source"
            modules={modules}
            diagnosticAnswers={diagnosticAnswers}
            designBrief={designBrief}
            assumptionNotes={assumptionNotes}
            projectName={subject}
            linkedRfqId={linkedRfqId}
            onRfqLinked={linkRfqToProject}
            size="sm"
          />
        </div>
      </div>

      {/* Design-iteration host — cost-reduction trigger on Costs tab routes here. */}
      {activeProjectId && (
        <DesignIterationHost
          ref={designIterationHostRef}
          projectId={activeProjectId}
          onApplied={() => {
            toast.success("Design change applied — re-run supplier matching to see updated quotes.", { duration: 8000 })
          }}
        />
      )}

      {/* ── Phase VII: compliance / lead-time / MOQ constraint alerts ── */}
      {shortlistedSupplierIds.size > 0 && (
        <DesignConstraintBanners
          supplierMatches={supplierMatches}
          shortlistedSupplierIds={shortlistedSupplierIds}
          targetMarket={targetMarket}
          batchSizeText={(() => {
            for (const diag of Object.values(diagnosticAnswers)) {
              const bs = (diag as { batch_size?: string | null })?.batch_size
              if (bs && String(bs).trim().length > 0) return String(bs)
            }
            return null
          })()}
          hostRef={designIterationHostRef}
        />
      )}

      {/* ── Task H: Post-project rating nudge (surfaces on delivered order) ── */}
      {activeProjectId && shortlistedSuppliers.size > 0 && (
        <ProjectRatingPrompt
          projectId={activeProjectId}
          shortlistedSuppliers={[...shortlistedSuppliers.values()].map((s) => ({ id: s.id, name: s.name }))}
        />
      )}

      {/* ── Chase (VP Supply Chain) entry briefing ── */}
      <StageSpecialistCard
        specialistId={sourceMapping.specialistId}
        variant="entry"
        stageName="Source"
        briefing={sourceEntryBriefingText}
        onReconsider={() => {
          const q = typeof window !== "undefined"
            ? window.prompt("What do you want to reconsider about the sourcing / design?", "")
            : null
          if (q && q.trim().length >= 20) {
            designIterationHostRef.current?.triggerManual(q.trim())
          } else if (q !== null) {
            toast.error("Tell us what you want to reconsider in at least 20 characters")
          }
        }}
      />

      {/* ── Unresolved specialist warnings from Specify reviews ── */}
      <SourceSpecialistInsights
        modules={modules}
        moduleReviews={moduleReviews}
        revisedModuleIds={revisedModuleIds}
      />

      {/* ── Supply Risk Radar (framing before supplier picks) ── */}
      <SupplyRiskRadar
        shortlistedSuppliers={shortlistedSuppliers}
        categoryRankings={categoryRankings}
        supplierMatches={supplierMatches}
        categoryLabels={categoryLabels}
        targetMarket={targetMarket}
        onTargetMarketChange={setTargetMarket}
      />

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
      {/* a11y: role=tablist + role=tab + arrow-key nav per ARIA APG */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
        <div
          role="tablist"
          aria-label="Source stage sections"
          className="flex items-center gap-2"
        >
          {TABS.map((tab, idx) => (
            <button
              key={tab.id}
              id={`source-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`source-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault()
                  const delta = e.key === "ArrowRight" ? 1 : -1
                  const nextIdx = (idx + delta + TABS.length) % TABS.length
                  const nextTab = TABS[nextIdx]
                  handleTabClick(nextTab.id)
                  document.getElementById(`source-tab-${nextTab.id}`)?.focus()
                } else if (e.key === "Home") {
                  e.preventDefault()
                  handleTabClick(TABS[0].id)
                  document.getElementById(`source-tab-${TABS[0].id}`)?.focus()
                } else if (e.key === "End") {
                  e.preventDefault()
                  const last = TABS[TABS.length - 1]
                  handleTabClick(last.id)
                  document.getElementById(`source-tab-${last.id}`)?.focus()
                }
              }}
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
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setIsReportDialogOpen(true)}
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Download Report</span>
            </Button>
            <button
              onClick={handleRefreshActiveTab}
              disabled={isRefreshing}
              title="Refresh current tab"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Tab content ── */}
      <SafeAnimatePresence mode="wait">
        {/* ═══ Suppliers tab ═══ */}
        {activeTab === "suppliers" && (
          <motion.div key="suppliers" role="tabpanel" id="source-panel-suppliers" aria-labelledby="source-tab-suppliers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
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
              <>
                <SupplierProcurementFlow
                  modules={eligibleModules}
                  diagnosticAnswers={diagnosticAnswers}
                  aiCostEstimates={aiCostEstimates}
                  coverageByCategory={sankeyCoverage}
                />

                {/* Link to marketplace for broader supplier discovery */}
                {(() => {
                  const processes = new Set<string>()
                  for (const moduleAnswers of Object.values(diagnosticAnswers || {})) {
                    if (moduleAnswers && typeof moduleAnswers === 'object' && !Array.isArray(moduleAnswers)) {
                      const ans = moduleAnswers as Record<string, string>
                      if (ans.mfg_process) processes.add(ans.mfg_process)
                    }
                  }
                  if (processes.size === 0) return null
                  // Use the process names as search terms (consistent with project banner)
                  const searchTerms = Array.from(processes).join(' ')
                  return (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      <Link
                        href={`/marketplace?q=${encodeURIComponent(searchTerms)}`}
                        className="text-international-orange hover:underline"
                      >
                        Browse more suppliers in the marketplace →
                      </Link>
                    </p>
                  )
                })()}
              </>
            )}

            {/* Forward navigation — visible when manufacturing orders exist */}
            {manufacturingOrderCount > 0 && (
              <StageSpecialistCard
                specialistId={sourceMapping.specialistId}
                variant="exit"
                stageName="Source"
                briefing={sourceExitBriefing}
                isLoading={sourceExitLoading}
                nextSpecialistId={nextSource?.specialistId}
                nextStageName={nextSource?.stageLabel}
                onProceed={() => {
                  router.push(`${FORGE_ROUTES.cadLabAssemble}?from=source`)
                }}
                proceedLabel="Continue to Assemble"
              />
            )}
          </motion.div>
        )}

        {/* ═══ Shortlist tab ═══ */}
        {activeTab === "shortlist" && (
          <motion.div key="shortlist" role="tabpanel" id="source-panel-shortlist" aria-labelledby="source-tab-shortlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">

            {/* Phase 3 IA note: supplier SELECTION (which candidates make the
                shortlist) now lives on the Supplier Intelligence tab — each
                card has an inline Shortlist toggle. THIS tab is the ops view:
                NDA discipline, ramp role, outreach log, RFQ creation per
                category. Both views read the same DB-backed shortlist state. */}
            <div className="rounded-md bg-muted/40 border border-border px-3 py-2.5 text-xs text-muted-foreground">
              <strong className="text-foreground">Shortlist ops.</strong> Pick suppliers on the <span className="font-medium text-foreground">Supplier Intelligence</span> tab — this view manages NDA, ramp role, outreach log, and RFQ creation for the {shortlistedSupplierIds.size} shortlisted supplier{shortlistedSupplierIds.size !== 1 ? "s" : ""}.
            </div>

            {/* ── NDA gate: required discipline before sharing designs with suppliers ── */}
            <NDAGate state={ndaState} onChange={setNdaState} />

            {/* ── Volume ramp planner: tag suppliers proto/pilot/production ── */}
            <VolumeRampPlanner
              shortlistedSuppliers={shortlistedSuppliers}
              rampRoles={rampRoles}
              onRampRoleChange={setRampRole}
              moqBySupplier={moqBySupplier}
            />

            {/* ── Capability interview pack trigger ── */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-international-orange" />
                  Capability interview pack
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send this to every shortlisted supplier before awarding work. Covers MOQ, tooling, lead time, payment terms, quality &amp; compliance — with red flags to watch for in replies.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setInterviewPackSupplier(null); setInterviewPackOpen(true) }}
                className="flex-shrink-0"
              >
                Open pack
              </Button>
            </div>

            {/* ── Supplier outreach log (status tracker + stale flags) ── */}
            <SupplierOutreachLog
              shortlistedSuppliers={shortlistedSuppliers}
              state={outreachState}
              onChange={setOutreachState}
              replySlaDays={replySlaDays}
              onReplySlaChange={setReplySlaDays}
              supplierMatches={supplierMatches}
            />

            <p className="text-xs text-muted-foreground">Click a supplier to set priority (1st → 2nd → 3rd). Top-ranked suppliers per category receive your RFQ.</p>
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
              companyReviews={sharedCompanyReviews}
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
          <motion.div key="costs" role="tabpanel" id="source-panel-costs" aria-labelledby="source-tab-costs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {/* ── Cost-reduction iteration trigger (Phase IV cost-overrun path) ── */}
            {activeProjectId && (() => {
              const total = aiCostEstimates
                ? Object.values(aiCostEstimates).reduce((s, est) => s + (est.totalPerUnit ?? 0), 0)
                : 0
              const currentUnitCostGbp = total > 0 ? Math.round(total * 100) / 100 : null
              const moduleCostBreakdown = aiCostEstimates
                ? eligibleModules
                    .map((m) => ({
                      moduleId: m.id,
                      moduleName: m.name,
                      costGbp: aiCostEstimates[m.id]?.totalPerUnit ?? 0,
                    }))
                    .filter((x) => x.costGbp > 0)
                : []
              return (
                <CostReductionTrigger
                  projectId={activeProjectId}
                  currentUnitCostGbp={currentUnitCostGbp}
                  moduleCostBreakdown={moduleCostBreakdown}
                  onTrigger={({ currentUnitCostGbp: c, targetUnitCostGbp, moduleCostBreakdown: b }) => {
                    designIterationHostRef.current?.triggerCostReduction({
                      currentUnitCostGbp: c, targetUnitCostGbp, moduleCostBreakdown: b,
                    })
                  }}
                />
              )
            })()}

            {/* ── Benchmarks from historical RFQ responses (item #16) ── */}
            <RFQBenchmarksCard />

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
          <motion.div key="supplier_intelligence" role="tabpanel" id="source-panel-supplier_intelligence" aria-labelledby="source-tab-supplier_intelligence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <SupplierIntelligenceTab
              modules={eligibleModules}
              diagnosticAnswers={diagnosticAnswers}
              supplierMatches={supplierMatches}
              companyReviews={sharedCompanyReviews}
              shortlistedSupplierIds={shortlistedSupplierIds}
              onToggleShortlist={handleToggleShortlistFromIntel}
            />

            {/* Phase 2D: Chase's per-supplier narrative review lives inside
                Supplier Intelligence — same context (matched suppliers), same
                scoring pool. Previously rendered above the tab bar where it
                competed with the page header for primary attention. */}
            <SupplierFitnessReview
              modules={eligibleModules}
              diagnosticAnswers={diagnosticAnswers}
              supplierMatches={supplierMatches}
              activeProjectId={activeProjectId}
              subject={subject}
            />

            {/* Phase 2B: Executive Review moved from standalone tab to a
                collapsed secondary card. Rationale: the primary decisions on
                Source are supplier-facing. Exec review stays accessible but
                no longer competes for tab-bar space. */}
            <Collapsible
              open={execReviewOpen}
              onOpenChange={setExecReviewOpen}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs w-full sm:w-auto justify-between"
                >
                  <span className="inline-flex items-center gap-2">
                    <UsersIcon className="h-3.5 w-3.5 text-international-orange" />
                    Executive Review (optional)
                    <span className="text-muted-foreground font-normal">— expert eyes on your sourcing plan</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      execReviewOpen && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <ExecutiveReviewTab
                  modules={eligibleModules}
                  diagnosticAnswers={diagnosticAnswers}
                  context="sourcing"
                  useCase={designBrief?.useCase}
                />
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        )}
      </SafeAnimatePresence>

      <DesignReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        stage="source"
        stageData={{
          classifiedParts: reportClassifiedParts,
          supplierMatches: Object.fromEntries(
            [...supplierMatches.entries()].map(([moduleId, matches]) => [
              moduleId,
              matches.map((m) => ({
                providerId: m.id,
                providerName: m.name,
                matchScore: m.matchScore,
                matchReasons: m.matchReasons,
                tier: "approved" as const,
                isAvailable: true,
              })),
            ]),
          ),
          ...(rfqQuotes && rfqQuotes.quotes.length > 0 ? { rfqQuotes } : {}),
        }}
      />

      <CapabilityInterviewPackDialog
        open={interviewPackOpen}
        onOpenChange={setInterviewPackOpen}
        productName={subject || "Your product"}
        supplierName={interviewPackSupplier ? (shortlistedSuppliers.get(interviewPackSupplier)?.name ?? undefined) : undefined}
        moduleNames={eligibleModules.map((m) => m.name)}
      />
    </div>
  )
}
