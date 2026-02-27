"use client"

/**
 * @file source/page.tsx — The Forge: Source stage (Stage 3).
 *
 * @description Supplier matching, RFQ creation, quote comparison, and cost tracking.
 * Users match suppliers to specified modules, create and broadcast RFQs, compare
 * incoming quotes, and award contracts to unlock the Assemble stage.
 *
 * 3 tabs: Suppliers, Proposals, Costs.
 *
 * Gate: redirects to Specify if no specified modules exist.
 */

import { useState, useCallback, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  ShoppingCart,
  ArrowLeft,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { CadLabSupplyChain } from "@/components/cad/cad-lab-supply-chain"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { CadLabContracting } from "@/components/cad/cad-lab-contracting"
import { useCadLab } from "../cad-lab-context"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { matchCadLabModuleSuppliers } from "@/actions/cad-lab-supplier-match"
import { toast } from "sonner"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Supplier match type (mirrors action return) ────────────────────

interface SupplierMatch {
  id: string
  name: string
  matchScore: number
  matchReasons: string[]
  isVerified: boolean
  supplierType: string
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
    linkedRfqId,
    linkRfqToProject,
    specifiedModuleCount,
  } = useCadLab()

  // Gate: redirect to Specify if no specified modules
  useEffect(() => {
    if (!hasResearch || specifiedModuleCount === 0) {
      router.replace(FORGE_ROUTES.cadLabSpecify)
    }
  }, [hasResearch, specifiedModuleCount, router])

  // ── Supplier matching state ──
  const [supplierMatches, setSupplierMatches] = useState<Map<string, SupplierMatch[]>>(new Map())
  const [loadingModules, setLoadingModules] = useState<Set<string>>(new Set())
  const [matchAllLoading, setMatchAllLoading] = useState(false)

  const eligibleModules = useMemo(
    () => modules.filter((m) => m.status === "specified" || m.status === "generated"),
    [modules],
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
      })
      setSupplierMatches((prev) => new Map(prev).set(mod.id, matches))
    } catch {
      toast.error(`Failed to match suppliers for ${mod.name}`)
    } finally {
      setLoadingModules((prev) => {
        const next = new Set(prev)
        next.delete(mod.id)
        return next
      })
    }
  }, [diagnosticAnswers])

  const handleMatchAll = useCallback(async () => {
    setMatchAllLoading(true)
    try {
      await Promise.all(eligibleModules.map(handleMatchModule))
    } finally {
      setMatchAllLoading(false)
    }
  }, [eligibleModules, handleMatchModule])

  // ── Tab navigation ──
  const TABS = useMemo(
    () => [
      { id: "suppliers", label: "Suppliers" },
      { id: "proposals", label: "Proposals" },
      { id: "costs", label: "Costs" },
    ],
    [],
  )

  const [activeTab, setActiveTab] = useState(() => {
    const param = searchParams.get("tab")
    if (param && TABS.some((t) => t.id === param)) return param
    return "suppliers"
  })

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
        </div>
      </nav>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        {/* ═══ Suppliers tab ═══ */}
        {activeTab === "suppliers" && (
          <motion.div key="suppliers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <CadLabSupplyChain
              modules={eligibleModules}
              diagnosticAnswers={diagnosticAnswers}
              supplierMatches={supplierMatches}
              loadingModules={loadingModules}
              matchAllLoading={matchAllLoading}
              onMatchModule={handleMatchModule}
              onMatchAll={handleMatchAll}
            />
          </motion.div>
        )}

        {/* ═══ Proposals tab ═══ */}
        {activeTab === "proposals" && (
          <motion.div key="proposals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <CadLabContracting
              modules={eligibleModules}
              projectName={subject}
              diagnosticAnswers={diagnosticAnswers}
              projectId={activeProjectId}
              linkedRfqId={linkedRfqId}
              onRfqLinked={linkRfqToProject}
              designBrief={designBrief}
              assumptionNotes={assumptionNotes}
            />
          </motion.div>
        )}

        {/* ═══ Costs tab ═══ */}
        {activeTab === "costs" && (
          <motion.div key="costs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
            <CadLabCostEstimate
              modules={eligibleModules}
              diagnosticAnswers={diagnosticAnswers}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
