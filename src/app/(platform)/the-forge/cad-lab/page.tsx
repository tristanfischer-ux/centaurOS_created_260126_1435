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
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Loader2,
  Search,
  Box,
  ArrowRight,
  ClipboardCheck,
  Layers,
  ImageIcon,
  Pencil,
  RotateCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputWithSpeech } from "@/components/ui/input-with-speech"
import { Card, CardContent } from "@/components/ui/card"

import { useRegisterScreenContext } from "@/contexts/screen-context"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import { useCadLab } from "./cad-lab-context"
import { HeroSection } from "./components/hero-section"
import { ModuleImageGrid } from "./components/module-image-grid"
import { ProcessFlowDiagram } from "./components/process-flow-diagram"

// ─── Extract executive summary from research report markdown ─────────

function extractExecutiveSummary(report: string): string | null {
  const startMatch = report.match(/^##\s+Executive\s+Summary/im)
  if (!startMatch || startMatch.index === undefined) return null
  const afterHeading = report.slice(startMatch.index + startMatch[0].length)
  const nextHeading = afterHeading.search(/^##\s/m)
  const body = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)
  const trimmed = body.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ─── Pipeline preview shown during research wait ─────────────────────

const PIPELINE_STAGES = [
  { icon: Search, label: "Concept", desc: "Quick overview & modules" },
  { icon: Box, label: "Build", desc: "Research, CAD & engineering" },
  { icon: ClipboardCheck, label: "Review", desc: "Supplier-ready package" },
]

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabResearchPage(): React.ReactNode {
  const router = useRouter()
  const {
    subject, setSubject,
    referenceModel,
    isResearching, editableReport,
    hasResearch, isAnyLoading,
    handleResearch, handleDecompose,
    modules, isDecomposing,
    expandedModuleId, setExpandedModuleId,
    isGeneratingImages,
    revealedModuleIds,
    systemIllustrationUrl, systemIllustrationStatus, systemIllustrationError, handleRetryIllustration,
  } = useCadLab()

  const allModulesRevealed = modules.length > 0 && revealedModuleIds.size >= modules.length
  const [isEditingSubject, setIsEditingSubject] = useState(false)
  const executiveSummary = useMemo(() => extractExecutiveSummary(editableReport), [editableReport])

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
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
              <div>
                <p className="text-sm font-semibold text-foreground">Researching &ldquo;{subject}&rdquo;</p>
                <p className="text-xs text-muted-foreground">Gathering specs, standards, and manufacturing context — ~30-60 seconds</p>
              </div>
            </div>
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

      {/* ══════════════════════════════════════════════════════════════════
          AFTER RESEARCH: Lightweight concept view
          1. System overview illustration (if available)
          2. Auto-trigger decomposition (or manual Continue button)
          3. Modules revealed progressively (name + image + purpose only)
          4. Continue to Build CTA
          ══════════════════════════════════════════════════════════════════ */}
      {hasResearch && (
        <div className="space-y-6">
          {/* ── Product subject heading (stays visible after research) ── */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-international-orange flex-shrink-0" />
            {isEditingSubject ? (
              <InputWithSpeech
                enableSpeech
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onSpeechTranscript={(text) => setSubject(subject ? subject + " " + text : text)}
                onBlur={() => setIsEditingSubject(false)}
                onKeyDown={(e) => { if (e.key === "Enter") setIsEditingSubject(false) }}
                className="text-xl font-bold h-auto py-1 px-2"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingSubject(true)}
                className="group flex items-center gap-2 text-left"
              >
                <h2 className="text-xl font-bold text-foreground">{subject}</h2>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs ml-auto"
              onClick={handleResearch}
              disabled={isAnyLoading}
            >
              <RotateCcw className="h-3 w-3" />
              Re-Research
            </Button>
            <AskSpecialistButton
              context={{
                type: "general",
                title: subject,
                description: "Product concept in The Forge",
                metadata: {
                  status: hasResearch ? "researched" : "new",
                  notes: modules.length > 0
                    ? `${modules.length} sub-assemblies mapped: ${modules.map((m) => m.name).join(", ")}`
                    : undefined,
                },
              }}
              specialistId="cto"
              specialistName="Max"
              variant="chip"
              label="Ask Max"
            />
          </div>

          {/* ── System overview illustration (silently hidden on failure — enhancement, not blocker) ── */}
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
                  {modules.length === 0
                    ? "Concept illustration — this will be refined when sub-assemblies are mapped."
                    : "System overview — full research report available in the Build stage."}
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
          {(systemIllustrationStatus === "failed" ||
            (systemIllustrationStatus === "idle" && !systemIllustrationUrl)) && (
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

          {/* ── Executive summary (extracted from research report) ── */}
          {executiveSummary && modules.length === 0 && (
            <Card>
              <CardContent className="pt-5 pb-5">
                <h3 className="text-sm font-semibold text-foreground mb-2">Product Overview</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {executiveSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Continue button: triggers decomposition ── */}
          {modules.length === 0 && !isDecomposing && (
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

          {/* ── Decomposing in progress ── */}
          {modules.length === 0 && isDecomposing && (
            <Card className="border-international-orange/20">
              <CardContent className="pt-6 flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                <p className="text-sm text-muted-foreground">Mapping sub-assemblies...</p>
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
              />

              {/* Process flow — how modules connect via inputs and outputs */}
              <ProcessFlowDiagram modules={modules} />

              {/* Continue to Build CTA — only after all modules are revealed */}
              {allModulesRevealed && (
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
