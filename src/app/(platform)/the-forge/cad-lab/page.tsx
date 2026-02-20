"use client"

/**
 * @file page.tsx — The Forge: Research stage (Stage 1).
 *
 * @description Orchestrator page for The Forge research pipeline stage.
 * Renders a focused input area (hero), collapsible manufacturing details,
 * research report viewer, and a manual "Map Sub-Assemblies" step. After
 * decomposition, sub-assembly overview is shown on this page; user
 * chooses when to continue to Build.
 */

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef } from "react"
import {
  Loader2,
  Search,
  Box,
  BarChart3,
  ArrowRight,
  ShoppingCart,
  ClipboardCheck,
  Layers,
  Clock,
  Puzzle,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { useRegisterScreenContext } from "@/contexts/screen-context"
import { useCadLab } from "./cad-lab-context"
import { HeroSection } from "./components/hero-section"
import { DesignIntakeForm } from "./components/design-intake-form"
import { ResearchSection } from "./components/research-section"
import { SystemVisualOverview } from "./components/system-visual-overview"
import { ProcessFlowDiagram } from "./components/process-flow-diagram"

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
        parts.push(`Viewing the CAD Lab research stage.`)
        if (subject) parts.push(`Subject: "${subject}".`)
      }
      return {
        pageTitle: `The Forge — Research${subject ? `: ${subject}` : ""}`,
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

      {/* ── System overview: central 3D + module cards (visual-first) ── */}
      {hasResearch && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">System overview</h2>
          <SystemVisualOverview referenceModel={referenceModel ?? null} modules={modules} />
        </div>
      )}

      {/* ── Narrated description (research report) ── */}
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

      {/* ── Process flow: how modules integrate ── */}
      {hasResearch && modules.length > 0 && (
        <ProcessFlowDiagram modules={modules} />
      )}

      {/* ── Map Sub-Assemblies: manual trigger after research ── */}
      {hasResearch && modules.length === 0 && !isDecomposing && !isResearching && (
        <Card className="border-international-orange/20">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-3">
              Review the research report above, then map the product into sub-assemblies.
            </p>
            <Button onClick={handleDecompose} className="gap-2" disabled={!editableReport.trim()}>
              <Layers className="h-4 w-4" />
              Map Sub-Assemblies
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Decomposing in progress ── */}
      {hasResearch && modules.length === 0 && isDecomposing && (
        <Card className="border-international-orange/20">
          <CardContent className="pt-6 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
            <p className="text-sm text-muted-foreground">Mapping sub-assemblies...</p>
          </CardContent>
        </Card>
      )}

      {/* ── Sub-assembly overview (explore each before continuing to Build) ── */}
      {hasResearch && modules.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-semibold text-foreground mb-1">Sub-assembly overview</p>
            <p className="text-xs text-muted-foreground mb-4">
              Expand each sub-assembly to review description, inputs/outputs, key parts, and risks. When ready, continue to Build to generate CAD.
            </p>
            <div className="space-y-2">
              {modules.map((mod) => (
                <div key={mod.id} className="border rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id)}
                    className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-2 w-2 rounded-full flex-shrink-0 bg-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{mod.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{mod.purpose}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-1" title={`Lead time: ${mod.leadWeeks} weeks`}>
                        <Clock className="h-3 w-3" />
                        {mod.leadWeeks} wk
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1" title={`${mod.keyParts.length} key parts`}>
                        <Puzzle className="h-3 w-3" />
                        {mod.keyParts.length} parts
                      </span>
                      {expandedModuleId === mod.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                  {expandedModuleId === mod.id && (
                    <div className="border-t p-4 space-y-4 bg-muted/20">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                        <p className="text-sm text-foreground">{mod.description}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1">Inputs</p>
                          {mod.inputs.length > 0 ? (
                            mod.inputs.map((inp, i) => (
                              <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{inp}</span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1">Outputs</p>
                          {mod.outputs.length > 0 ? (
                            mod.outputs.map((out, i) => (
                              <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded mr-1 mb-1 font-mono">{out}</span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Key components</p>
                        <div className="flex flex-wrap gap-1.5">
                          {mod.keyParts.map((part, i) => (
                            <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{part}</span>
                          ))}
                        </div>
                      </div>
                      {(mod.failureModes.length > 0 || mod.unknowns.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {mod.failureModes.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Failure modes</p>
                              <ul className="space-y-1">
                                {mod.failureModes.map((fm, i) => (
                                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                    <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0 mt-0.5" />
                                    {fm}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {mod.unknowns.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Unknowns</p>
                              <ul className="space-y-1">
                                {mod.unknowns.map((u, i) => (
                                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                    <Info className="h-3 w-3 text-status-info flex-shrink-0 mt-0.5" />
                                    {u}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Continue to Build ── */}
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
