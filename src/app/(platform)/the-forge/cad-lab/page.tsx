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

import { useRouter } from "next/navigation"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { useEffect, useMemo } from "react"
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
import { ProcessFlowDiagram } from "./components/process-flow-diagram"
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
    isResearching, editableReport,
    hasResearch, isAnyLoading,
    handleResearch, handleDecompose,
    modules, isDecomposing, decompositionError,
    expandedModuleId, setExpandedModuleId,
    isGeneratingImages,
    revealedModuleIds,
    interfaceContracts, isExtractingContracts,
    systemIllustrationUrl, systemIllustrationStatus, systemIllustrationError, handleRetryIllustration,
    progressLines,
    checkpoints, isCheckpointing,
    isRevising, revisedModuleIds, checkpointAcknowledged, handleAcknowledgeCheckpoints,
    productOverview, setProductOverview,
    handleUpdateModule,
  } = useCadLab()

  // TEMPORARY: deploy verification — remove after confirming new code is live
  useEffect(() => { console.log("[CAD-LAB] page.tsx build: 2026-02-27T4") }, [])

  const allModulesRevealed = modules.length > 0 && revealedModuleIds.size >= modules.length

  // INTENT: Block "Continue to Build" while checkpoints load OR have unacknowledged concerns.
  // Without the isCheckpointing guard, users could skip past the gate before results arrive.
  const canContinueToBuild = allModulesRevealed && !isCheckpointing && !isRevising && !isGeneratingImages && systemIllustrationStatus !== "generating" && (() => {
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

  // When a template is selected, set the subject and flag that research

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


      {/* ══════════════════════════════════════════════════════════════════
          AFTER RESEARCH: Lightweight concept view
          1. System overview illustration (if available)
          2. Auto-trigger decomposition (or manual Continue button)
          3. Modules revealed progressively (name + image + purpose only)
          4. Continue to Build CTA
          ══════════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <div className="space-y-6">
          {/* ── System overview illustration — only shown once decomposition starts ── */}
          {(modules.length > 0 || isDecomposing) && (
            <>
              {systemIllustrationUrl && systemIllustrationStatus === "complete" && (
                <Card className="overflow-hidden">
                  <div className="aspect-[16/9] w-full bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={systemIllustrationUrl}
                      alt={`System overview: ${subject}`}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).parentElement!.parentElement!.style.display = "none" }}
                    />
                  </div>
                  <CardContent className="pt-4 pb-4">
                    <h2 className="text-base font-semibold text-foreground">{subject}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      System overview — full research report available in the Build stage.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ── System illustration generating ── */}
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

              {/* ── System illustration failed — show error with retry ── */}
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
            </>
          )}

          {/* ── Product overview — always visible after research, editable ── */}
          {productOverview && (
            <ProductOverviewCard
              overview={productOverview}
              onSave={setProductOverview}
            />
          )}

          {/* ── Continue button: triggers decomposition ── */}
          {modules.length === 0 && !isDecomposing && !decompositionError && (
            <Card className="border-international-orange/20">
              <CardContent className="pt-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Research complete. Continue to map sub-assemblies and generate concept illustrations.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDecompose}
                    className="gap-2"
                    disabled={!editableReport.trim() || isAnyLoading}
                  >
                    <Layers className="h-4 w-4" />
                    Map sub-assemblies
                  </Button>
                  <span className="text-xs text-muted-foreground">~10-15s</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Decomposing in progress (inline below Product Overview) ── */}
          {modules.length === 0 && isDecomposing && (
            <CadLabProgress
              lines={progressLines}
              isActive={true}
              operationType="breakdown"
              subject={subject}
            />
          )}

          {/* ── Decomposition failed — persistent error card with retry ── */}
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

          {/* ── Modules: progressive reveal grid (name + image + purpose only) ── */}
          {modules.length > 0 && (
            <>
              {/* Header with reveal progress */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {Math.min(revealedModuleIds.size, modules.length)} of {modules.length} sub-assemblies
                </p>
                {isGeneratingImages && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                    Generating illustrations...
                  </span>
                )}
              </div>

              {/* Module image grid with progressive reveal */}
              <ModuleImageGrid
                modules={modules}
                revealedModuleIds={revealedModuleIds}
                expandedModuleId={expandedModuleId}
                onToggleExpand={(id) => setExpandedModuleId(expandedModuleId === id ? null : id)}
                onModuleSave={handleUpdateModule}
              />

              {/* Process flow — how modules connect via inputs and outputs */}
              {isExtractingContracts && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                  Extracting interface contracts...
                </p>
              )}
              <ProcessFlowDiagram modules={modules} onModuleClick={handleModuleClick} interfaceContracts={interfaceContracts} />

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
              {allModulesRevealed && !canContinueToBuild && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Review specialist feedback above before continuing.
                </p>
              )}
              {canContinueToBuild && (
                <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Ready to build
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Continue to the Build stage for full research report, detailed engineering, and parametric CAD.
                        </p>
                      </div>
                      <Button onClick={() => router.push(FORGE_ROUTES.cadLabBuild)} className="gap-1.5">
                        Continue to Build
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
