"use client"

/**
 * @file page.tsx — The Forge: Research stage (Stage 1).
 *
 * @description Orchestrator page for The Forge research pipeline stage.
 * Renders a focused input area (hero), collapsible manufacturing details,
 * research report viewer, and auto-triggers module decomposition after
 * research completes. Navigates to /build once modules are mapped.
 */

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Search,
  Box,
  BarChart3,
  ArrowRight,
  ShoppingCart,
  ClipboardCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { useCadLab } from "./cad-lab-context"
import { HeroSection } from "./components/hero-section"
import { DesignIntakeForm } from "./components/design-intake-form"
import { ResearchSection } from "./components/research-section"

// ─── Pipeline preview shown during research wait ─────────────────────

const PIPELINE_STAGES = [
  { icon: Search, label: "Research", desc: "Real-world specs from datasheets" },
  { icon: Box, label: "Build", desc: "Parametric CAD for each module" },
  { icon: BarChart3, label: "Analysis", desc: "Risk register & timeline" },
  { icon: ShoppingCart, label: "Procurement", desc: "Costs & supply chain" },
  { icon: ClipboardCheck, label: "Review", desc: "Supplier-ready package" },
]

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabResearchPage(): React.ReactNode {
  const router = useRouter()
  const {
    subject, setSubject,
    modelId, setModelId,
    designBrief, setDesignBrief,
    assumptionNotes, setAssumptionNotes,
    designReadinessPct,
    isResearching, researchResult, editableReport, setEditableReport,
    showSources, setShowSources,
    hasResearch, isAnyLoading,
    handleResearch, handleReset, handleDecompose,
    modules, isDecomposing, milestone,
  } = useCadLab()

  // Auto-decompose after research completes (only if no modules yet)
  const hasAutoDecomposed = useRef(false)
  useEffect(() => {
    if (hasResearch && modules.length === 0 && !isDecomposing && !hasAutoDecomposed.current) {
      hasAutoDecomposed.current = true
      const timer = setTimeout(() => { handleDecompose() }, 1500)
      return () => clearTimeout(timer)
    }
  }, [hasResearch, modules.length, isDecomposing, handleDecompose])

  // Reset auto-decompose flag when starting fresh
  useEffect(() => {
    if (!hasResearch) hasAutoDecomposed.current = false
  }, [hasResearch])

  // Auto-navigate to /build after decompose completes
  useEffect(() => {
    if (milestone === "breakdown" && modules.length > 0) {
      const timer = setTimeout(() => {
        router.push("/the-forge/cad-lab/build")
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [milestone, modules.length, router])

  /**
   * Handles quick-start template selection — sets subject and auto-triggers research.
   */
  function handleSelectTemplate(templateSubject: string): void {
    setSubject(templateSubject)
    setTimeout(() => {
      const btn = document.getElementById("research-btn")
      if (btn) btn.click()
    }, 400)
  }

  return (
    <div className="space-y-6">
      {/* ── Primary input + templates ── */}
      <HeroSection
        subject={subject}
        setSubject={setSubject}
        isAnyLoading={isAnyLoading}
        isResearching={isResearching}
        hasResearch={hasResearch}
        onResearch={handleResearch}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* ── Pipeline preview during research wait ── */}
      {isResearching && (
        <Card className="border-international-orange/20">
          <CardContent className="pt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">What happens next</p>
            <div className="flex items-start gap-2">
              {PIPELINE_STAGES.map((stage, i) => {
                const Icon = stage.icon
                const isCurrent = i === 0
                return (
                  <div key={stage.label} className="flex items-start flex-1">
                    {i > 0 && <div className={`h-0.5 flex-1 mt-4 ${isCurrent ? "bg-international-orange" : "bg-muted"}`} />}
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isCurrent ? "bg-international-orange text-white" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className={`text-[10px] font-medium ${isCurrent ? "text-international-orange" : "text-muted-foreground"}`}>
                        {stage.label}
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-tight hidden sm:block">
                        {stage.desc}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Collapsible manufacturing details ── */}
      {!hasResearch && !isResearching && (
        <DesignIntakeForm
          modelId={modelId}
          setModelId={setModelId}
          designBrief={designBrief}
          setDesignBrief={setDesignBrief}
          assumptionNotes={assumptionNotes}
          setAssumptionNotes={setAssumptionNotes}
          designReadinessPct={designReadinessPct}
          isAnyLoading={isAnyLoading}
        />
      )}

      {/* ── Research results (report + sources) ── */}
      <ResearchSection
        hasResearch={hasResearch}
        isAnyLoading={isAnyLoading}
        researchResult={researchResult}
        editableReport={editableReport}
        setEditableReport={setEditableReport}
        showSources={showSources}
        setShowSources={setShowSources}
        handleReset={handleReset}
      />

      {/* ── Auto-decomposing indicator ── */}
      {hasResearch && modules.length === 0 && !isDecomposing && !isResearching && (
        <Card className="border-international-orange/20">
          <CardContent className="pt-6 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
            <p className="text-sm text-muted-foreground">Preparing to map sub-assemblies...</p>
          </CardContent>
        </Card>
      )}

      {/* ── Proceed to Build (if modules exist but user is still on Research) ── */}
      {hasResearch && modules.length > 0 && (
        <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {modules.length} sub-assemblies mapped
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ready to generate parametric CAD for each module.
                </p>
              </div>
              <Button onClick={() => router.push("/the-forge/cad-lab/build")} className="gap-1.5">
                Continue to Build
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
