"use client"

/**
 * @file page.tsx — The Forge: Concept stage (Stage 1).
 *
 * @description Orchestrator page for the Concept stage. Before research:
 * shows hero input and optional design intake form. After research: a
 * side-by-side layout with the research report pinned on the left and
 * module image cards on the right. Clicking "Continue" after research
 * auto-chains decomposition → Gemini image generation.
 *
 * @related
 * - Context: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 * - Image card: src/app/(platform)/the-forge/cad-lab/components/module-image-card.tsx
 * - Image grid: src/app/(platform)/the-forge/cad-lab/components/module-image-grid.tsx
 */

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef } from "react"
import {
  Loader2,
  Search,
  Box,
  ArrowRight,
  ClipboardCheck,
  Layers,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { useRegisterScreenContext } from "@/contexts/screen-context"
import { useCadLab } from "./cad-lab-context"
import { HeroSection } from "./components/hero-section"
import { DesignIntakeForm } from "./components/design-intake-form"
import { ResearchSection } from "./components/research-section"
import { ModuleImageGrid } from "./components/module-image-grid"

// ─── Pipeline preview shown during research wait ─────────────────────

const PIPELINE_STAGES = [
  { icon: Search, label: "Concept", desc: "Research from real specs" },
  { icon: Box, label: "Build", desc: "Parametric CAD per module" },
  { icon: ClipboardCheck, label: "Review", desc: "Supplier-ready package" },
]

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabResearchPage(): React.ReactNode {
  const router = useRouter()
  const {
    subject, setSubject,
    referenceModel,
    modelId, setModelId,
    designBrief, setDesignBrief,
    assumptionNotes, setAssumptionNotes,
    designReadinessPct,
    isResearching, researchResult, editableReport, setEditableReport,
    showSources, setShowSources,
    hasResearch, isAnyLoading,
    handleResearch, handleReset, handleDecompose,
    modules, isDecomposing,
    expandedModuleId, setExpandedModuleId,
    isGeneratingImages,
  } = useCadLab()

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
                status: m.status === "generated" ? "CAD generated" : "pending",
              }))
            : undefined,
      }
    }, [hasResearch, isResearching, subject, modules]),
  )

  // When a template is selected, set the subject and flag that research
  // should auto-trigger on the next render (after state updates).
  const pendingTemplateResearchRef = useRef(false)

  function handleSelectTemplate(templateSubject: string): void {
    setSubject(templateSubject)
    pendingTemplateResearchRef.current = true
  }

  useEffect(() => {
    if (pendingTemplateResearchRef.current && subject.trim()) {
      pendingTemplateResearchRef.current = false
      handleResearch()
    }
  }, [subject, handleResearch])

  return (
    <div className="space-y-6">
      {/* ── Primary input + templates (hidden once research is complete) ── */}
      {!hasResearch && (
        <HeroSection
          subject={subject}
          setSubject={setSubject}
          referenceModel={referenceModel}
          isAnyLoading={isAnyLoading}
          isResearching={isResearching}
          hasResearch={hasResearch}
          onResearch={handleResearch}
          onSelectTemplate={handleSelectTemplate}
        />
      )}

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

      {/* ══════════════════════════════════════════════════════════════════
          AFTER RESEARCH: Side-by-side layout
          Left: Research report (sticky on desktop)
          Right: Continue → Modules with images → Continue to Build
          ══════════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ── Left panel: Research report (sticky on desktop) ── */}
          <div className="w-full lg:w-[420px] xl:w-[480px] lg:sticky lg:top-6 shrink-0 self-start">
            <ResearchSection
              hasResearch={hasResearch}
              isAnyLoading={isAnyLoading}
              researchResult={researchResult}
              editableReport={editableReport}
              setEditableReport={setEditableReport}
              showSources={showSources}
              setShowSources={setShowSources}
              handleReset={handleReset}
              onRetryResearch={handleResearch}
            />
          </div>

          {/* ── Right panel: Modules + CTA ── */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* State 1: Research done, decomposition not started */}
            {modules.length === 0 && !isDecomposing && (
              <Card className="border-international-orange/20">
                <CardContent className="pt-6 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Research complete. Click continue to decompose into sub-assemblies and generate engineering illustrations.
                  </p>
                  <Button
                    onClick={handleDecompose}
                    className="gap-2"
                    disabled={!editableReport.trim() || isAnyLoading}
                  >
                    <Layers className="h-4 w-4" />
                    Continue
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* State 2: Decomposing in progress */}
            {modules.length === 0 && isDecomposing && (
              <Card className="border-international-orange/20">
                <CardContent className="pt-6 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                  <p className="text-sm text-muted-foreground">Mapping sub-assemblies...</p>
                </CardContent>
              </Card>
            )}

            {/* State 3: Modules ready — animated image grid */}
            {modules.length > 0 && (
              <>
                {/* Header with image generation progress */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {modules.length} sub-assemblies
                  </p>
                  {isGeneratingImages && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                      Generating illustrations...
                    </span>
                  )}
                </div>

                {/* Module image grid with stagger animation */}
                <ModuleImageGrid
                  modules={modules}
                  expandedModuleId={expandedModuleId}
                  onToggleExpand={(id) => setExpandedModuleId(expandedModuleId === id ? null : id)}
                />

                {/* Continue to Build CTA */}
                <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Ready to build
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Generate parametric CAD for each module.
                        </p>
                      </div>
                      <Button onClick={() => router.push("/the-forge/cad-lab/build")} className="gap-1.5">
                        Continue to Build
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Research section shown below hero when research hasn't started yet */}
      {!hasResearch && (
        <ResearchSection
          hasResearch={hasResearch}
          isAnyLoading={isAnyLoading}
          researchResult={researchResult}
          editableReport={editableReport}
          setEditableReport={setEditableReport}
          showSources={showSources}
          setShowSources={setShowSources}
          handleReset={handleReset}
          onRetryResearch={handleResearch}
        />
      )}
    </div>
  )
}
