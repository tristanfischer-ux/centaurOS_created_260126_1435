"use client"

/**
 * @file page.tsx — The Forge: Concept stage (Stage 1).
 *
 * @description Lightweight "napkin sketch" stage. Collects the product idea,
 * runs research in the background (report is displayed in Build), generates a
 * system overview illustration, decomposes into modules, and reveals them
 * progressively as blueprint images arrive. Concept is intentionally fast and
 * minimal — the detailed engineering happens in the Build stage.
 *
 * @related
 * - Context: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 * - Image card: src/app/(platform)/the-forge/cad-lab/components/module-image-card.tsx
 * - Image grid: src/app/(platform)/the-forge/cad-lab/components/module-image-grid.tsx
 * - Build stage: src/app/(platform)/the-forge/cad-lab/build/page.tsx
 */

import { useRouter, useSearchParams } from "next/navigation"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2,
  ArrowRight,
  Layers,
  ImageIcon,
  RotateCcw,
  AlertTriangle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { useRegisterScreenContext } from "@/contexts/screen-context"
import { useCadLab } from "./cad-lab-context"
import { HeroSection } from "./components/hero-section"
import { ModuleImageGrid } from "./components/module-image-grid"
import { ModuleFlowCanvas } from "./components/module-flow-canvas"
import { ProductOverviewCard } from "./components/product-overview-card"
import { CadLabProgress } from "@/components/cad/cad-lab-progress"
import { DecompositionCheckpointCard } from "@/components/cad/decomposition-checkpoint-card"
import { CheckpointRevisionDiffs } from "./components/checkpoint-revision-diffs"

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabResearchPage(): React.ReactNode {
  const router = useRouter()
  const {
    subject, setSubject,
    referenceModel,
    isResearching,
    hasResearch, isAnyLoading, freshResearchRef, activeProjectId,
    handleResearch, handleDecompose,
    modules, isDecomposing, decompositionError,
    expandedModuleId, setExpandedModuleId,
    isGeneratingImages, handleGenerateModuleImages,
    revealedModuleIds,
    interfaceContracts, isExtractingContracts, generatingModuleIds,
    systemIllustrationUrl, systemIllustrationStatus, systemIllustrationError, handleRetryIllustration,
    progressLines,
    checkpoints, isCheckpointing,
    isRevising, revisedModuleIds, checkpointAcknowledged, handleAcknowledgeCheckpoints,
    productOverview, setProductOverview,
    handleUpdateModule,
  } = useCadLab()

  // INTENT: Track hero image load failures via state instead of DOM mutation (avoids React error 418).
  const [heroImgError, setHeroImgError] = useState(false)
  useEffect(() => { setHeroImgError(false) }, [systemIllustrationUrl])

  const allModulesRevealed = modules.length > 0 && revealedModuleIds.size >= modules.length

  // INTENT: Block "Continue to Specify" while checkpoints load OR have unacknowledged concerns.
  // Without the isCheckpointing guard, users could skip past the gate before results arrive.
  const canContinueToSpecify = allModulesRevealed && !isCheckpointing && !isRevising && !isGeneratingImages && systemIllustrationStatus !== "generating" && (() => {
    const entries = checkpoints ? Object.values(checkpoints) : []
    if (entries.length === 0) return true
    const hasConcerns = entries.some(
      (c) => c.sentiment === "cautious" || c.sentiment === "concerned",
    )
    return !hasConcerns || checkpointAcknowledged
  })()

  // Helper: open module detail dialog from flow diagram click
  const handleModuleClick = (moduleId: string): void => {
    setExpandedModuleId(expandedModuleId === moduleId ? null : moduleId)
  }

  // Retry image generation for a single failed module
  const handleRetryModule = useCallback((moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId)
    if (mod) handleGenerateModuleImages([mod])
  }, [modules, handleGenerateModuleImages])

  useRegisterScreenContext(
    useMemo(() => {
      const parts: string[] = []
      if (hasResearch) {
        parts.push(`Research complete for "${subject}".`)
        if (modules.length > 0) {
          parts.push(`${modules.length} sub-assemblies mapped.`)
        }
      } else if (isResearching) {
        parts.push(`Running research for "${subject}".`)
      } else {
        parts.push(`Viewing the CAD Lab concept stage.`)
        if (subject) parts.push(`Subject: "${subject}".`)
      }
      return {
        pageTitle: `The Forge — Concept${subject ? `: ${subject}` : ""}`,
        summary: parts.join(" "),
        entities:
          modules.length > 0
            ? modules.map((m) => ({
                type: "module",
                title: m.name,
                status: m.status === "generated" ? "CAD generated" : m.status === "failed" ? "generation failed" : "pending",
              }))
            : undefined,
      }
    }, [hasResearch, isResearching, subject, modules]),
  )

  // ── Tab navigation state ──
  const CONCEPT_TABS = useMemo(() => {
    const tabs = [{ id: "research", label: "Research" }]
    if (modules.length > 0) tabs.push({ id: "modules", label: "Modules" })
    return tabs
  }, [modules.length])

  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const param = searchParams.get("tab")
    if (param && (param === "research" || (param === "modules" && modules.length > 0))) return param
    return "research"
  })

  const handleTabClick = useCallback((tabId: string) => {
    if (tabId === "modules") setModulesUnseen(false)
    setActiveTab(tabId)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tabId)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  // INTENT: Show a pulsing notification dot on the Modules tab when modules
  // first appear, instead of auto-switching tabs (which was disorienting).
  const [modulesUnseen, setModulesUnseen] = useState(false)
  const prevModuleCount = useMemo(() => ({ current: 0 }), [])
  useEffect(() => {
    if (modules.length > 0 && prevModuleCount.current === 0) {
      setModulesUnseen(true)
    }
    prevModuleCount.current = modules.length
  }, [modules.length, prevModuleCount])

  // INTENT: Auto-trigger decomposition after fresh research completes.
  // freshResearchRef is only set by handleResearch — loading a saved project won't trigger this.
  useEffect(() => {
    if (freshResearchRef.current && hasResearch && modules.length === 0 && !isDecomposing && activeProjectId) {
      freshResearchRef.current = false
      handleDecompose()
    }
  }, [freshResearchRef, hasResearch, modules.length, isDecomposing, handleDecompose, activeProjectId])

  // Fall back to research if modules tab is active but no modules exist
  useEffect(() => {
    if (activeTab === "modules" && modules.length === 0) {
      setActiveTab("research")
    }
  }, [activeTab, modules.length])

  return (
    <div className="space-y-6">
      {/* ── Primary input — always visible so the user sees what they're building ── */}
      <HeroSection
        subject={subject}
        setSubject={setSubject}
        referenceModel={referenceModel}
        isAnyLoading={isAnyLoading}
        isResearching={isResearching}
        hasResearch={hasResearch}
        onResearch={handleResearch}
      />

      {/* ── Tab navigation — appears after research is complete ── */}
      {hasResearch && CONCEPT_TABS.length > 1 && (
        <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border overflow-x-auto">
          <div className="flex items-center gap-2">
            {CONCEPT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-international-orange text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
                {tab.id === "modules" && modulesUnseen && (
                  <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-international-orange animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* ── Tab content ── */}
      {hasResearch && (
        <AnimatePresence mode="wait">
          {/* ═══ Research tab ═══ */}
          {activeTab === "research" && (
            <motion.div key="research" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              {/* System overview illustration — visible as soon as research completes */}
              {hasResearch && (
                <>
                  {systemIllustrationUrl && systemIllustrationStatus === "complete" && (
                    <Card className="overflow-hidden">
                      <div className="aspect-[16/9] w-full bg-muted">
                        {heroImgError ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={systemIllustrationUrl}
                            alt={`System overview: ${subject}`}
                            className="w-full h-full object-cover"
                            onError={() => setHeroImgError(true)}
                          />
                        )}
                      </div>
                      <CardContent className="pt-4 pb-4">
                        <h2 className="text-base font-semibold text-foreground">{subject}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          System overview — full research report available in the Specify stage.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* System illustration generating */}
                  {systemIllustrationStatus === "generating" && (
                    <Card className="overflow-hidden">
                      <div className="aspect-[16/9] w-full bg-muted animate-pulse flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                          <span className="text-xs text-muted-foreground">Generating concept illustration...</span>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* System illustration failed — show error with retry */}
                  {systemIllustrationStatus === "failed" && (
                    <Card className="overflow-hidden border-dashed">
                      <div className="aspect-[16/9] w-full bg-muted/30 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                          <span className="text-xs text-muted-foreground">
                            {systemIllustrationError ?? "Concept illustration unavailable"}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRetryIllustration}
                            className="text-xs gap-1.5"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* During decomposition — rich progress in hero position */}
                  {systemIllustrationStatus === "idle" && !decompositionError && isDecomposing && (
                    <CadLabProgress
                      lines={progressLines}
                      isActive={true}
                      operationType="breakdown"
                      subject={subject}
                    />
                  )}

                  {/* Idle placeholder — only when NOT decomposing */}
                  {systemIllustrationStatus === "idle" && !decompositionError && !isDecomposing && (
                    <Card className="overflow-hidden border-dashed border-muted-foreground/20">
                      <div className="aspect-[16/9] w-full bg-muted/30 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-center px-6">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                          <span className="text-xs text-muted-foreground">
                            System illustration will appear here after decomposition
                          </span>
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* "View Modules" banner — shown as soon as modules exist (not gated on system illustration) */}
              {modules.length > 0 && !isDecomposing && activeTab === "research" && (
                <Card className="border-international-orange/20 bg-international-orange-light/10">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-international-orange shrink-0" />
                        <p className="text-sm text-foreground">
                          {isGeneratingImages || systemIllustrationStatus === "generating"
                            ? `${modules.length} sub-assemblies mapped \u2014 generating illustrations (${modules.filter(m => m.imageStatus === "complete").length} of ${modules.length} ready)`
                            : `${modules.length} sub-assembly illustrations ready`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-international-orange text-international-orange hover:bg-international-orange-light/20"
                        onClick={() => handleTabClick("modules")}
                      >
                        View Modules
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Module summary — shown during illustration generation so user sees what was found */}
              {modules.length > 0 && !isDecomposing && (isGeneratingImages || systemIllustrationStatus === "generating") && activeTab === "research" && (
                <Card className="border-border">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-international-orange shrink-0" />
                      <p className="text-sm font-medium text-foreground">
                        {modules.length} sub-assemblies identified
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      {modules.map((m, i) => (
                        <div key={m.id} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0 w-4 text-right tabular-nums">{i + 1}.</span>
                          <div>
                            <span className="font-medium text-foreground">{m.name}</span>
                            <span className="text-muted-foreground"> — {m.purpose.slice(0, 80)}{m.purpose.length > 80 ? "..." : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Generating engineering illustrations — {modules.filter(m => m.imageStatus === "complete").length} of {modules.length} ready. Each illustration coordinates manufacturing constraints, interfaces, and dimensional specs.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Product overview — always visible after research, editable */}
              {productOverview && (
                <ProductOverviewCard
                  overview={productOverview}
                  onSave={setProductOverview}
                />
              )}

              {/* Decomposition failed — persistent error card with retry */}
              {modules.length === 0 && !isDecomposing && decompositionError && (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Sub-assembly mapping failed</p>
                        <p className="text-sm text-muted-foreground">{decompositionError}</p>
                      </div>
                    </div>
                    <Button onClick={handleDecompose} variant="secondary" size="sm">
                      Try again
                    </Button>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* ═══ Modules tab ═══ */}
          {activeTab === "modules" && modules.length > 0 && (
            <motion.div key="modules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              {/* Header with reveal progress */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {Math.min(revealedModuleIds.size, modules.length)} of {modules.length} sub-assemblies
                </p>
              </div>

              {/* Illustration progress card — prominent feedback during image generation */}
              {(isGeneratingImages || systemIllustrationStatus === "generating") && (() => {
                const completed = modules.filter(m => m.imageStatus === "complete").length
                const failed = modules.filter(m => m.imageStatus === "failed").length
                const done = completed + failed
                const total = modules.length
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                const isHeroPhase = systemIllustrationStatus === "generating"

                return (
                  <Card className="border-international-orange/20 bg-muted/50">
                    <CardContent className="pt-4 pb-4 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-international-orange shrink-0" />
                        <p className="text-sm font-medium text-foreground">
                          {isHeroPhase
                            ? "Creating system overview..."
                            : `Generating module illustrations — ${done} of ${total}`}
                        </p>
                      </div>
                      {!isHeroPhase && total > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-international-orange transition-all duration-500 ease-out"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Module image grid with progressive reveal */}
              <ModuleImageGrid
                modules={modules}
                revealedModuleIds={revealedModuleIds}
                expandedModuleId={expandedModuleId}
                onToggleExpand={(id) => setExpandedModuleId(expandedModuleId === id ? null : id)}
                onModuleSave={handleUpdateModule}
                onRetryModule={handleRetryModule}
              />

              {/* Process flow — how modules connect via inputs and outputs */}
              {isExtractingContracts && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                  Extracting interface contracts...
                </p>
              )}
              {modules.length > 1 && (
                <ModuleFlowCanvas
                  modules={modules}
                  onModuleClick={handleModuleClick}
                  interfaceContracts={interfaceContracts}
                  generatingModuleIds={generatingModuleIds}
                />
              )}

              {/* Specialist checkpoint — early feedback before generation */}
              {(isCheckpointing || (checkpoints && Object.keys(checkpoints).length > 0)) && (
                <DecompositionCheckpointCard
                  checkpoints={checkpoints}
                  isCheckpointing={isCheckpointing}
                  onAcknowledge={handleAcknowledgeCheckpoints}
                  acknowledged={checkpointAcknowledged}
                  isRevising={isRevising}
                  revisedModuleCount={revisedModuleIds.size}
                />
              )}

              {/* Checkpoint revision diffs — shown after modules are revised */}
              {revisedModuleIds.size > 0 && (
                <CheckpointRevisionDiffs modules={modules} revisedModuleIds={revisedModuleIds} />
              )}

              {/* Continue to Build CTA — gated on modules revealed + checkpoint acknowledgment */}
              {allModulesRevealed && !canContinueToSpecify && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Review specialist feedback above before continuing.
                </p>
              )}
              {canContinueToSpecify && (
                <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Ready to specify
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Continue to the Specify stage for detailed specs, diagnostics, and specialist review.
                        </p>
                      </div>
                      <Button onClick={() => router.push(FORGE_ROUTES.cadLabSpecify)} className="gap-1.5">
                        Continue to Specify
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
