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
  MapPin,
  Clock,
  ShieldCheck,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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

                  {/* ── Scoring legend ── */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 px-1 py-2 rounded-lg bg-muted/50">
                    {[
                      { label: "S", full: "Semantic", max: 30 },
                      { label: "C", full: "Capability", max: 25 },
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
                      const scoreItems = [
                        { label: "S", full: "Semantic", value: match.scoreBreakdown.semantic, max: 30 },
                        { label: "C", full: "Capability", value: match.scoreBreakdown.capability, max: 25 },
                        { label: "F", full: "Capacity", value: match.scoreBreakdown.capacity, max: 15 },
                        { label: "Q", full: "Quality", value: match.scoreBreakdown.quality, max: 15 },
                        { label: "K", full: "Keyword", value: match.scoreBreakdown.keyword, max: 15 },
                      ]
                      return (
                        <div
                          key={match.id}
                          onClick={() => setSelectedAssembler(match)}
                          className="p-3 rounded-lg border border-border hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-4">
                            {/* Left: name, meta, reasons */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
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
                              </div>
                              {/* Location, lead time, capabilities row */}
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
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
                              {/* Certifications */}
                              {match.certifications.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  {match.certifications.map((cert) => (
                                    <span key={cert} className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded">
                                      {cert}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {match.matchReasons.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {match.matchReasons.join(" \u00b7 ")}
                                </p>
                              )}
                            </div>
                            {/* Right: score breakdown mini-bars */}
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
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Assembler detail Dialog ── */}
            <Dialog open={!!selectedAssembler} onOpenChange={(open) => { if (!open) setSelectedAssembler(null) }}>
              <DialogContent size="md">
                {selectedAssembler && (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        {selectedAssembler.name}
                        {selectedAssembler.isVerified && (
                          <ShieldCheck className="h-4 w-4 text-success" />
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        Assembly company details and match breakdown
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 mt-2">
                      {/* Quick facts */}
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {selectedAssembler.locationCountry && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {selectedAssembler.locationCountry}
                          </span>
                        )}
                        {selectedAssembler.typicalLeadDays && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {selectedAssembler.typicalLeadDays} days lead time
                          </span>
                        )}
                      </div>

                      {/* Capabilities */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Capabilities</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedAssembler.capabilities.map((c) => (
                            <span key={c} className="text-xs text-foreground bg-muted px-2 py-1 rounded-md">
                              {c.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Score breakdown */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Score Breakdown</p>
                        <div className="space-y-1.5">
                          {[
                            { label: "S", full: "Semantic match", value: selectedAssembler.scoreBreakdown.semantic, max: 30 },
                            { label: "C", full: "Capability match", value: selectedAssembler.scoreBreakdown.capability, max: 25 },
                            { label: "F", full: "Capacity/availability", value: selectedAssembler.scoreBreakdown.capacity, max: 15 },
                            { label: "Q", full: "Quality signals", value: selectedAssembler.scoreBreakdown.quality, max: 15 },
                            { label: "K", full: "Keyword match", value: selectedAssembler.scoreBreakdown.keyword, max: 15 },
                          ].map(({ label, full, value, max }) => (
                            <div key={label} className="flex items-center gap-2">
                              <div
                                className="h-5 w-5 rounded text-[8px] font-bold flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: value > max * 0.5 ? "#05966920" : value > 0 ? "#d9770620" : "#f1f5f9",
                                  color: value > max * 0.5 ? "#059669" : value > 0 ? "#d97706" : "#94a3b8",
                                }}
                              >
                                {label}
                              </div>
                              <span className="text-sm text-foreground w-40">{full}</span>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${(value / max) * 100}%`,
                                    backgroundColor: value > max * 0.5 ? "#059669" : value > 0 ? "#d97706" : "#94a3b8",
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground font-mono w-12 text-right">{value}/{max}</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-1 border-t border-border">
                            <span className="text-sm font-semibold text-foreground ml-7 w-40">Total</span>
                            <div className="flex-1" />
                            <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded-full ${
                              selectedAssembler.matchScore >= 50
                                ? "bg-success/10 text-success"
                                : selectedAssembler.matchScore >= 30
                                  ? "bg-warning/10 text-warning"
                                  : "bg-muted text-muted-foreground"
                            }`}>
                              {Math.round(selectedAssembler.matchScore)}/100
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Match reasons */}
                      {selectedAssembler.matchReasons.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Why this match</p>
                          <ul className="space-y-1">
                            {selectedAssembler.matchReasons.map((reason, i) => (
                              <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                                <span className="text-international-orange mt-0.5">&#x2022;</span>
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Certifications */}
                      {selectedAssembler.certifications.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Certifications</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedAssembler.certifications.map((cert) => (
                              <span key={cert} className="text-xs text-foreground bg-success/10 text-success px-2 py-1 rounded-md">
                                {cert}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
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
