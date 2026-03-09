"use client"

/**
 * @file assemble/page.tsx — The Forge: Assemble stage (Stage 4).
 *
 * @description Convergence flow, branding/packaging, and shipping/fulfilment.
 * The visual and functional inverse of Source: many parts -> assembler(s) -> one product.
 *
 * 3 tabs: Assembly Flow, Branding & Packaging, Shipping & Fulfilment.
 *
 * Gate: redirects to Source if no research or no specified modules.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Package,
  ArrowLeft,
  Loader2,
  Layers,
  Paintbrush,
  Truck,
  MapPin,
  Clock,
  ShieldCheck,
  CircleDot,
  Circle,
  ExternalLink,
  Check,
  Info,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useCadLab } from "../cad-lab-context"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { matchAssemblyCompanies } from "@/actions/assembly-match"
import { getAssemblyDashboard } from "@/actions/assembly"
import { AssemblyConvergenceFlow } from "@/components/cad/assembly-convergence-flow"
import { AssemblyBrandingSpec } from "@/components/cad/assembly-branding-spec"
import { AssemblyShipping } from "@/components/cad/assembly-shipping"
import { AssemblyCostRollup } from "@/components/cad/assembly-cost-rollup"
import { AssemblyLeadTime } from "@/components/cad/assembly-lead-time"
import { SupplierDetailDialog } from "@/components/cad/supplier-detail-dialog"
import { AssemblerCompareDialog } from "@/components/cad/assembler-compare-dialog"
import type { SupplierDetail } from "@/actions/cad-lab-supplier-detail"
import { toast } from "sonner"
import {
  DEFAULT_BRANDING,
  DEFAULT_SHIPPING,
  recommendAssemblerConfig,
} from "@/lib/assembly-utils"
import type {
  AssemblyCompanyMatch,
  AssemblyTierNode,
  BrandingSpec,
  ShippingConfig,
} from "@/lib/assembly-utils"
import { inferRequiredSpecialties } from "@/lib/cad-lab/assembly-capability-map"
import type { CategoryInput } from "@/lib/cad-lab/assembly-capability-map"
import type { OrderTrackingStep } from "@/lib/assembly-utils"
import type { OrderLineSummary } from "@/actions/assembly"
import type { ShortlistedSupplier } from "../source/page"

// ─── localStorage helpers ───────────────────────────────────────────

function loadJson<T>(key: string | null, fallback: T): T {
  if (!key) return fallback
  try {
    const stored = localStorage.getItem(key)
    if (stored) return JSON.parse(stored) as T
  } catch { /* ignore corrupt data */ }
  return fallback
}

function saveJson(key: string | null, value: unknown): void {
  if (!key) return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota */ }
}

// ─── Page Component ──────────────────────────────────────────────────

export default function AssemblePage(): React.ReactNode {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    subject,
    activeProjectId,
    hasResearch,
    modules,
    diagnosticAnswers,
    aiCostEstimates,
    specifiedModuleCount,
  } = useCadLab()

  // Gate: redirect to Source if prerequisites are missing
  useEffect(() => {
    if (!hasResearch || specifiedModuleCount === 0) {
      router.replace(FORGE_ROUTES.cadLabSource)
    }
  }, [hasResearch, specifiedModuleCount, router])

  const pid = activeProjectId

  // ── Source stage data (read-only — written by Source page) ──
  const shortlistKey = pid ? `forge-supplier-shortlist-v2-${pid}` : null
  const [shortlistedSuppliers] = useState<Map<string, ShortlistedSupplier>>(() => {
    if (!shortlistKey) return new Map()
    try {
      const stored = localStorage.getItem(shortlistKey)
      if (stored) return new Map(JSON.parse(stored) as [string, ShortlistedSupplier][])
    } catch { /* ignore */ }
    return new Map()
  })

  const catRankingsKey = pid ? `forge-supplier-shortlist-v3-${pid}` : null
  const [categoryRankings] = useState<Map<string, string[]>>(() => {
    if (!catRankingsKey) return new Map()
    try {
      const stored = localStorage.getItem(catRankingsKey)
      if (stored) return new Map(JSON.parse(stored) as [string, string[]][])
    } catch { /* ignore */ }
    return new Map()
  })

  // ── Assembly matches (persisted to localStorage per project) ──
  const matchesKey = pid ? `forge-assembly-matches-${pid}` : null

  const [assemblerMatches, setAssemblerMatchesRaw] = useState<AssemblyCompanyMatch[]>(
    () => loadJson<AssemblyCompanyMatch[]>(matchesKey, []).map((m) => ({
      ...m,
      // GOTCHA: Stale localStorage from before specialty-aware scoring has no specialty fields.
      // Without defaults, .length / .map() on undefined crashes the page.
      specialties: m.specialties ?? [],
      matchedSpecialties: m.matchedSpecialties ?? [],
      missingSpecialties: m.missingSpecialties ?? [],
    })),
  )
  const setAssemblerMatches = useCallback((matches: AssemblyCompanyMatch[]) => {
    setAssemblerMatchesRaw(matches)
    saveJson(matchesKey, matches)
  }, [matchesKey])

  // ── Tier config (persisted) ──
  const tierKey = pid ? `forge-assembly-tiers-${pid}` : null

  const [tierConfig, setTierConfigRaw] = useState<[string, AssemblyTierNode][]>(
    () => loadJson<[string, AssemblyTierNode][]>(tierKey, []),
  )
  const setTierConfig = useCallback((config: [string, AssemblyTierNode][]) => {
    setTierConfigRaw(config)
    saveJson(tierKey, config)
  }, [tierKey])

  // ── Branding (persisted) ──
  const brandingKey = pid ? `forge-assembly-branding-${pid}` : null

  const [branding, setBrandingRaw] = useState<BrandingSpec>(
    () => loadJson<BrandingSpec>(brandingKey, DEFAULT_BRANDING),
  )
  const updateBranding = useCallback((updates: Partial<BrandingSpec>) => {
    setBrandingRaw((prev) => {
      const next = { ...prev, ...updates }
      saveJson(brandingKey, next)
      return next
    })
  }, [brandingKey])

  // ── Shipping (persisted) ──
  const shippingKey = pid ? `forge-assembly-shipping-${pid}` : null

  const [shipping, setShippingRaw] = useState<ShippingConfig>(
    () => loadJson<ShippingConfig>(shippingKey, DEFAULT_SHIPPING),
  )
  const updateShipping = useCallback((updates: Partial<ShippingConfig>) => {
    setShippingRaw((prev) => {
      const next = { ...prev, ...updates }
      saveJson(shippingKey, next)
      return next
    })
  }, [shippingKey])

  // ── Matching state ──
  const [isMatching, setIsMatching] = useState(false)

  const eligibleModules = useMemo(
    () => modules.filter((m) => m.status === "specified" || m.status === "generated"),
    [modules],
  )

  // ── Assembly dashboard data (for order tracking) ──
  const [orderLines, setOrderLines] = useState<OrderLineSummary[]>([])

  useEffect(() => {
    if (!pid) return
    getAssemblyDashboard(pid)
      .then((result) => {
        if ("orderLines" in result) setOrderLines(result.orderLines)
      })
      .catch(() => { /* non-blocking */ })
  }, [pid])

  // ── Required specialties (persisted so badges survive page reload) ──
  const reqSpecsKey = pid ? `forge-assembly-req-specs-${pid}` : null

  const [requiredSpecialties, setRequiredSpecialtiesRaw] = useState<string[]>(
    () => loadJson<string[]>(reqSpecsKey, []),
  )
  const setRequiredSpecialties = useCallback((specs: string[]) => {
    setRequiredSpecialtiesRaw(specs)
    saveJson(reqSpecsKey, specs)
  }, [reqSpecsKey])

  // ── Match assemblers action ──
  const handleMatchAssemblers = useCallback(async () => {
    if (eligibleModules.length === 0) return
    setIsMatching(true)
    try {
      // INTENT: Build categories BEFORE calling server action so we can pass them for specialty scoring
      const { categories } = await import("@/lib/sankey-utils").then((mod) =>
        mod.buildSankeyData(eligibleModules, diagnosticAnswers, aiCostEstimates),
      )
      const categoryInputs: CategoryInput[] = categories.map((c) => ({
        id: c.id,
        process: c.process,
        material: c.material,
        type: c.type as "buy" | "make",
        parts: c.parts,
      }))
      const reqSpecs = inferRequiredSpecialties(categoryInputs)
      setRequiredSpecialties(reqSpecs)

      const processTypes = new Set<string>()
      const materialTypes = new Set<string>()
      for (const mod of eligibleModules) {
        const diag = diagnosticAnswers?.[mod.id]
        if (diag?.mfg_process) processTypes.add(diag.mfg_process)
        if (diag?.material) materialTypes.add(diag.material)
      }

      const matches = await matchAssemblyCompanies({
        productName: subject,
        productDescription: eligibleModules.map((m) => `${m.name}: ${m.purpose}`).join(". "),
        processTypes: [...processTypes],
        materialTypes: [...materialTypes],
        categories: categoryInputs,
      })

      setAssemblerMatches(matches)

      // INTENT: Use specialty-aware recommendation instead of naive top-match auto-assign
      if (matches.length > 0) {
        const recommended = recommendAssemblerConfig(matches, categoryInputs)
        const newTierConfig: [string, AssemblyTierNode][] = recommended.map((node) => [node.assemblerId, node])
        setTierConfig(newTierConfig)

        const tier1Count = recommended.filter((n) => n.tierLevel === 1).length
        if (tier1Count > 0) {
          toast.success(`Found ${matches.length} assemblers — multi-assembler config (${tier1Count} sub + 1 final)`)
        } else {
          toast.success(`Found ${matches.length} assembly companies`)
        }
      } else {
        toast.success("No assembly companies matched")
      }
    } catch (err) {
      console.error("[ASSEMBLE] Match failed:", err)
      toast.error("Failed to match assembly companies")
    } finally {
      setIsMatching(false)
    }
  }, [eligibleModules, diagnosticAnswers, aiCostEstimates, subject, setAssemblerMatches, setTierConfig, setRequiredSpecialties])

  // ── Assign category to assembler ──
  const handleAssignCategory = useCallback((categoryId: string, assemblerId: string) => {
    setTierConfigRaw((prev) => {
      const map = new Map(prev)
      // Remove category from any existing assignment
      for (const [id, node] of map) {
        if (node.assignedCategories.includes(categoryId)) {
          map.set(id, {
            ...node,
            assignedCategories: node.assignedCategories.filter((c: string) => c !== categoryId),
          })
        }
      }
      // Add to target assembler
      const target = map.get(assemblerId)
      if (target) {
        map.set(assemblerId, {
          ...target,
          assignedCategories: [...target.assignedCategories, categoryId],
        })
      }
      const next = [...map.entries()] as [string, AssemblyTierNode][]
      saveJson(tierKey, next)
      return next
    })
  }, [tierKey])

  // ── Select a different assembler as Tier 2 (final assembly) ──
  // INTENT: When Tier 1 sub-assemblers exist, preserve them and only replace the Tier 2 node
  const handleSelectAssembler = useCallback(async (match: AssemblyCompanyMatch) => {
    const { buildSankeyData } = await import("@/lib/sankey-utils")
    const { categories } = buildSankeyData(eligibleModules, diagnosticAnswers, aiCostEstimates)

    const tier1Entries = tierConfig.filter(([, node]) => node.tierLevel === 1)

    if (tier1Entries.length > 0) {
      // Preserve Tier 1 sub-assemblers, replace only Tier 2
      const tier1CatIds = new Set(tier1Entries.flatMap(([, node]) => node.assignedCategories))
      const remainingCatIds = categories.map((c) => c.id).filter((id) => !tier1CatIds.has(id))
      setTierConfig([
        ...tier1Entries,
        [match.id, {
          assemblerId: match.id,
          assemblerName: match.name,
          tierLevel: 2,
          assignedCategories: remainingCatIds,
        }],
      ])
    } else {
      // No Tier 1 nodes — assign all categories (existing behavior)
      setTierConfig([[match.id, {
        assemblerId: match.id,
        assemblerName: match.name,
        tierLevel: 2,
        assignedCategories: categories.map((c) => c.id),
      }]])
    }
    toast.success(`${match.name} set as assembler`)
  }, [eligibleModules, diagnosticAnswers, aiCostEstimates, tierConfig, setTierConfig])

  // ── Active assembler ID (the Tier 2 entry) ──
  const activeAssemblerId = useMemo(() => {
    const tier2 = tierConfig.find(([, node]) => node.tierLevel === 2)
    return tier2?.[0] ?? (assemblerMatches.length > 0 ? assemblerMatches[0].id : null)
  }, [tierConfig, assemblerMatches])

  // ── Computed totals ──
  // INTENT: Use totalPerUnit (includes labour) to match Source Costs tab, not parts[].cost
  const totalEstimatedCost = useMemo(() => {
    if (!aiCostEstimates) return null
    let total = 0
    for (const est of Object.values(aiCostEstimates)) {
      total += est.totalPerUnit ?? 0
    }
    return total > 0 ? Math.round(total * 100) / 100 : null
  }, [aiCostEstimates])

  // ── Clean product display name (strip conversational prefixes) ──
  const productDisplayName = useMemo(() => {
    let name = subject.trim()
    const prefixes = [
      /^i\s+want\s+to\s+(create|build|make|design|develop)\s+(a|an|the)\s+/i,
      /^i\s+want\s+to\s+(create|build|make|design|develop)\s+/i,
      /^(create|build|make|design|develop)\s+(a|an|the)\s+/i,
      /^(a|an|the)\s+/i,
    ]
    for (const prefix of prefixes) {
      const match = name.match(prefix)
      if (match) { name = name.slice(match[0].length); break }
    }
    if (name.endsWith(".")) name = name.slice(0, -1)
    return name.charAt(0).toUpperCase() + name.slice(1)
  }, [subject])

  // Lead time from best assembler match
  const assemblyDays = assemblerMatches[0]?.typicalLeadDays ?? 10
  const manufacturingDays = 14 // INTENT: Estimated from Source stage; TODO: derive from supplier lead times

  // Order tracking status
  const latestJob = orderLines.flatMap((l) => l.assemblyJobs).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]
  const currentOrderStatus = (latestJob?.status as OrderTrackingStep) ?? null
  const trackingReference = latestJob?.trackingReference ?? null

  // ── Tab navigation ──
  const TABS = useMemo(
    () => [
      { id: "flow", label: "Assembly Flow", icon: Layers },
      { id: "branding", label: "Branding & Packaging", icon: Paintbrush },
      { id: "shipping", label: "Shipping & Fulfilment", icon: Truck },
    ],
    [],
  )

  const [activeTab, setActiveTab] = useState("flow")
  const [selectedAssembler, setSelectedAssembler] = useState<AssemblyCompanyMatch | null>(null)
  const assemblerDetailCache = useRef(new Map<string, SupplierDetail>())

  // ── Compare selection ──
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [showCompare, setShowCompare] = useState(false)

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  const compareAssemblers = useMemo(
    () => assemblerMatches.filter((m) => compareIds.has(m.id)),
    [assemblerMatches, compareIds],
  )

  // INTENT: Read tab from URL after hydration — avoids React #418.
  useEffect(() => {
    const param = searchParams.get("tab")
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

  // ── Screen context ──
  useRegisterScreenContext(
    useMemo(() => ({
      pageTitle: `The Forge — Assemble: ${subject}`,
      summary: `${assemblerMatches.length} assemblers matched. Convergence flow.`,
    }), [subject, assemblerMatches.length]),
  )

  if (!hasResearch || specifiedModuleCount === 0) return null

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-international-orange" />
            Assemble
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Converge parts into a finished, branded product.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabSource)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Source
        </Button>
      </div>

      {/* ── Tab navigation ── */}
      <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
        <div className="flex items-center gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5",
                  activeTab === tab.id
                    ? "bg-international-orange text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        {/* ═══ Assembly Flow tab ═══ */}
        {activeTab === "flow" && (
          <motion.div key="flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            {/* Match button */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Convergence Flow</p>
                <p className="text-xs text-muted-foreground">
                  {assemblerMatches.length > 0
                    ? `${assemblerMatches.length} assembler${assemblerMatches.length !== 1 ? "s" : ""} matched`
                    : "Match assembly companies to see the convergence diagram"
                  }
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleMatchAssemblers}
                disabled={isMatching || eligibleModules.length === 0}
              >
                {isMatching ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Layers className="h-4 w-4 mr-1.5" />
                )}
                {isMatching ? "Matching..." : assemblerMatches.length > 0 ? "Re-match" : "Match Assemblers"}
              </Button>
            </div>

            {/* Convergence Sankey */}
            <Card>
              <CardContent className="pt-6">
                <AssemblyConvergenceFlow
                  modules={eligibleModules}
                  diagnosticAnswers={diagnosticAnswers}
                  aiCostEstimates={aiCostEstimates}
                  subject={productDisplayName}
                  assemblerMatches={assemblerMatches}
                  tierConfig={tierConfig}
                  onAssignCategory={handleAssignCategory}
                  totalEstimatedCost={totalEstimatedCost}
                  shortlistedSuppliers={shortlistedSuppliers}
                  categoryRankings={categoryRankings}
                />
              </CardContent>
            </Card>

            {/* Matched assembler list */}
            {assemblerMatches.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Matched Assembly Companies
                  </p>

                  {/* ── Required specialties badges ── */}
                  {requiredSpecialties.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      <span className="text-[10px] text-muted-foreground font-medium mr-1">Required:</span>
                      {requiredSpecialties.map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {s.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* ── Multi-assembler banner ── */}
                  {tierConfig.some(([, node]) => node.tierLevel === 1) && (
                    <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-info/10 border border-info/20">
                      <Info className="h-3.5 w-3.5 text-info shrink-0" />
                      <p className="text-xs text-info">
                        Multi-assembler configuration — sub-assemblers handle specialist work before final assembly.
                      </p>
                    </div>
                  )}

                  {/* ── Scoring legend ── */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 px-1 py-2 rounded-lg bg-muted/50">
                    {[
                      { label: "S", full: "Semantic", max: 30 },
                      { label: "C", full: "Specialty Coverage", max: 25 },
                      { label: "F", full: "Capacity", max: 15 },
                      { label: "Q", full: "Quality", max: 15 },
                      { label: "K", full: "Keyword", max: 15 },
                    ].map(({ label, full, max }) => (
                      <span key={label} className="text-[10px] text-muted-foreground">
                        <span className="font-bold text-foreground">{label}</span> = {full} ({max})
                      </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1.5 ml-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#059669" }} /> Strong
                      <span className="inline-block h-2.5 w-2.5 rounded-sm ml-1" style={{ backgroundColor: "#d97706" }} /> Partial
                      <span className="inline-block h-2.5 w-2.5 rounded-sm ml-1" style={{ backgroundColor: "#94a3b8" }} /> None
                    </span>
                  </div>

                  <div className="space-y-2">
                    {assemblerMatches.map((match) => {
                      const isActive = match.id === activeAssemblerId
                      const scoreItems = [
                        { label: "S", full: "Semantic", value: match.scoreBreakdown.semantic, max: 30 },
                        { label: "C", full: "Specialty Coverage", value: match.scoreBreakdown.capability, max: 25 },
                        { label: "F", full: "Capacity", value: match.scoreBreakdown.capacity, max: 15 },
                        { label: "Q", full: "Quality", value: match.scoreBreakdown.quality, max: 15 },
                        { label: "K", full: "Keyword", value: match.scoreBreakdown.keyword, max: 15 },
                      ]
                      return (
                        <div
                          key={match.id}
                          onClick={() => setSelectedAssembler(match)}
                          className={cn(
                            "p-3 rounded-lg border hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer",
                            isActive
                              ? "border-international-orange ring-1 ring-international-orange/30"
                              : "border-border",
                            compareIds.has(match.id) && "ring-1 ring-info/30",
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            {/* Compare checkbox */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleCompare(match.id)
                              }}
                              className={cn(
                                "shrink-0 mt-0.5 h-4 w-4 rounded border flex items-center justify-center transition-colors",
                                compareIds.has(match.id)
                                  ? "bg-international-orange border-international-orange"
                                  : "border-border hover:border-international-orange/50",
                              )}
                              aria-label={`${compareIds.has(match.id) ? "Deselect" : "Select"} ${match.name} for comparison`}
                            >
                              {compareIds.has(match.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                            </button>
                            {/* Left: radio dot + name, meta, reasons */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {isActive ? (
                                  <CircleDot className="h-4 w-4 text-international-orange shrink-0" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                )}
                                <p className="text-sm font-medium text-foreground truncate">{match.name}</p>
                                {match.isVerified && (
                                  <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                                )}
                                <span className={`text-xs font-semibold font-mono px-2 py-0.5 rounded-full shrink-0 ${
                                  match.matchScore >= 50
                                    ? "bg-success/10 text-success"
                                    : match.matchScore >= 30
                                      ? "bg-warning/10 text-warning"
                                      : "bg-muted text-muted-foreground"
                                }`}>
                                  {Math.round(match.matchScore)}
                                </span>
                                {isActive && (
                                  <span className="text-[10px] font-semibold text-international-orange bg-international-orange/10 px-2 py-0.5 rounded-full shrink-0">
                                    Active
                                  </span>
                                )}
                              </div>
                              {/* Location, lead time, capabilities row */}
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap ml-6">
                                {match.locationCountry && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {match.locationCountry}
                                  </span>
                                )}
                                {match.typicalLeadDays && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {match.typicalLeadDays}d lead
                                  </span>
                                )}
                                {match.capabilities.map((c) => (
                                  <span key={c} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {c.replace(/_/g, " ")}
                                  </span>
                                ))}
                              </div>
                              {/* Specialty coverage badges */}
                              {(match.matchedSpecialties.length > 0 || match.missingSpecialties.length > 0) && (
                                <div className="flex items-center gap-1 mt-1.5 ml-6 flex-wrap">
                                  {match.matchedSpecialties.map((s) => (
                                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">
                                      {s.replace(/_/g, " ")}
                                    </span>
                                  ))}
                                  {match.missingSpecialties.map((s) => (
                                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground line-through">
                                      {s.replace(/_/g, " ")}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Website URL */}
                              {match.websiteUrl && (
                                <a
                                  href={match.websiteUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80 transition-colors ml-6 mt-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {match.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                                </a>
                              )}
                              {/* Certifications */}
                              {match.certifications.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5 ml-6">
                                  {match.certifications.map((cert) => (
                                    <span key={cert} className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded">
                                      {cert}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {match.matchReasons.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1 ml-6">
                                  {match.matchReasons.join(" \u00b7 ")}
                                </p>
                              )}
                            </div>
                            {/* Right: score bars + action button */}
                            <div className="shrink-0 w-36 space-y-1">
                              {scoreItems.map(({ label, value, max }) => (
                                <div key={label} className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-muted-foreground w-3 text-right">{label}</span>
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${(value / max) * 100}%`,
                                        backgroundColor: value > max * 0.5 ? "#059669" : value > 0 ? "#d97706" : "#94a3b8",
                                      }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground font-mono w-7 text-right">{value}/{max}</span>
                                </div>
                              ))}
                              {!isActive && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSelectAssembler(match)
                                  }}
                                  className="w-full mt-1.5 text-[10px] font-medium text-international-orange hover:bg-international-orange/10 rounded px-2 py-1 transition-colors"
                                >
                                  Use as Assembler
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Assembler detail Dialog (standard formatting) ── */}
            <SupplierDetailDialog
              open={!!selectedAssembler}
              onOpenChange={(open) => { if (!open) setSelectedAssembler(null) }}
              supplierId={selectedAssembler?.id ?? null}
              supplierName={selectedAssembler?.name}
              matchScore={selectedAssembler?.matchScore}
              matchReasons={selectedAssembler?.matchReasons}
              cache={assemblerDetailCache}
            />
          </motion.div>
        )}

        {/* ═══ Branding & Packaging tab ═══ */}
        {activeTab === "branding" && (
          <motion.div key="branding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <AssemblyBrandingSpec
              branding={branding}
              onUpdate={updateBranding}
            />
          </motion.div>
        )}

        {/* ═══ Shipping & Fulfilment tab ═══ */}
        {activeTab === "shipping" && (
          <motion.div key="shipping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <AssemblyShipping
              shipping={shipping}
              onUpdate={updateShipping}
              assemblerMatches={assemblerMatches}
            />

            <AssemblyCostRollup
              aiCostEstimates={aiCostEstimates}
              assemblyEstimate={15}
              packagingEstimate={5}
              shippingEstimate={shipping.estimatedShippingCost ?? 8}
            />

            <AssemblyLeadTime
              manufacturingDays={manufacturingDays}
              assemblyDays={assemblyDays}
              currentStatus={currentOrderStatus}
              hasOrder={orderLines.length > 0}
              trackingReference={trackingReference}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Compare bar ── */}
      <AnimatePresence>
        {compareIds.size >= 2 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full bg-card border border-border shadow-lg px-5 py-2.5"
          >
            <Button size="sm" onClick={() => setShowCompare(true)}>
              Compare ({compareIds.size})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCompareIds(new Set())}
            >
              Clear
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Assembler compare dialog ── */}
      <AssemblerCompareDialog
        open={showCompare}
        onOpenChange={setShowCompare}
        assemblers={compareAssemblers}
        onRemove={(id) => {
          setCompareIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          // Close dialog if fewer than 2 remain
          if (compareIds.size <= 2) setShowCompare(false)
        }}
      />
    </div>
  )
}
