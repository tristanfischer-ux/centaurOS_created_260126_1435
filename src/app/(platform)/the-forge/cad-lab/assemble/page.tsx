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

import { useState, useCallback, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Package,
  ArrowLeft,
  Loader2,
  Layers,
  Paintbrush,
  Truck,
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
import { toast } from "sonner"
import {
  DEFAULT_BRANDING,
  DEFAULT_SHIPPING,
} from "@/lib/assembly-utils"
import type {
  AssemblyCompanyMatch,
  AssemblyTierNode,
  BrandingSpec,
  ShippingConfig,
} from "@/lib/assembly-utils"
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
    () => loadJson<AssemblyCompanyMatch[]>(matchesKey, []),
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

  // ── Match assemblers action ──
  const handleMatchAssemblers = useCallback(async () => {
    if (eligibleModules.length === 0) return
    setIsMatching(true)
    try {
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
      })

      setAssemblerMatches(matches)

      // INTENT: Auto-assign top match as Tier 2 (final assembly) with all categories
      if (matches.length > 0) {
        const { categories } = await import("@/lib/sankey-utils").then((mod) =>
          mod.buildSankeyData(eligibleModules, diagnosticAnswers, aiCostEstimates),
        )
        const top = matches[0]
        setTierConfig([[top.id, {
          assemblerId: top.id,
          assemblerName: top.name,
          tierLevel: 2,
          assignedCategories: categories.map((c) => c.id),
        }]])
      }

      toast.success(`Found ${matches.length} assembly companies`)
    } catch (err) {
      console.error("[ASSEMBLE] Match failed:", err)
      toast.error("Failed to match assembly companies")
    } finally {
      setIsMatching(false)
    }
  }, [eligibleModules, diagnosticAnswers, aiCostEstimates, subject, setAssemblerMatches, setTierConfig])

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

  // ── Computed totals ──
  const totalEstimatedCost = useMemo(() => {
    if (!aiCostEstimates) return null
    let total = 0
    for (const est of Object.values(aiCostEstimates)) {
      if (est.parts) {
        for (const part of est.parts) {
          total += part.cost ?? 0
        }
      }
    }
    return Math.round(total * 100) / 100
  }, [aiCostEstimates])

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
                  subject={subject}
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
                  <div className="space-y-2">
                    {assemblerMatches.map((match) => (
                      <div
                        key={match.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border hover:-translate-y-0.5 transition-all duration-200"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{match.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {match.isVerified && <span className="text-xs text-success">Verified</span>}
                            {match.capabilities.map((c) => (
                              <span key={c} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {c.replace(/_/g, " ")}
                              </span>
                            ))}
                            {match.typicalLeadDays && (
                              <span className="text-xs text-muted-foreground">{match.typicalLeadDays}d lead</span>
                            )}
                            {match.locationCountry && (
                              <span className="text-xs text-muted-foreground">{match.locationCountry}</span>
                            )}
                          </div>
                          {match.matchReasons.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {match.matchReasons.join(" \u00b7 ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Score breakdown */}
                          <div className="flex items-center gap-1">
                            {[
                              { label: "S", value: match.scoreBreakdown.semantic, max: 30 },
                              { label: "C", value: match.scoreBreakdown.capability, max: 25 },
                              { label: "F", value: match.scoreBreakdown.capacity, max: 15 },
                              { label: "Q", value: match.scoreBreakdown.quality, max: 15 },
                              { label: "K", value: match.scoreBreakdown.keyword, max: 15 },
                            ].map(({ label, value, max }) => (
                              <div
                                key={label}
                                className="h-5 w-5 rounded text-[8px] font-bold flex items-center justify-center"
                                style={{
                                  backgroundColor: value > max * 0.5 ? "#05966920" : value > 0 ? "#d9770620" : "#f1f5f9",
                                  color: value > max * 0.5 ? "#059669" : value > 0 ? "#d97706" : "#94a3b8",
                                }}
                                title={`${label}: ${value}/${max}`}
                              >
                                {label}
                              </div>
                            ))}
                          </div>
                          <span className={`text-sm font-semibold font-mono px-2 py-0.5 rounded-full ${
                            match.matchScore >= 50
                              ? "bg-success/10 text-success"
                              : match.matchScore >= 30
                                ? "bg-warning/10 text-warning"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {Math.round(match.matchScore)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
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
    </div>
  )
}
