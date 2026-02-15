"use client"

/**
 * @file page.tsx — The Forge: Research stage (Stage 1).
 *
 * @description Focused landing page with a single-action input field,
 * quick-start template pills, and a clean research report display.
 * User controls the pace — no auto-navigation.
 */

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Search,
  Box,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  RotateCcw,
  ArrowRight,
  BarChart3,
  ShoppingCart,
  ClipboardCheck,
  Sparkles,
  Pencil,
  AlertCircle,
  Building2,
  BookOpen,
  Database,
  MessageSquare,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { CadLabResearchReport } from "@/components/cad/cad-lab-research-report"
import { cn } from "@/lib/utils"

import { useCadLab } from "./cad-lab-context"

// ─── Source credibility classification ───────────────────────────────

type SourceType = "manufacturer" | "datasheet" | "reference" | "community"

/**
 * Classifies a URL into a credibility category based on domain patterns.
 *
 * @param uri - Source URL
 * @param title - Source title (for additional heuristics)
 * @returns Source type for icon/label treatment
 */
function classifySource(uri: string, title: string): SourceType {
  const lower = uri.toLowerCase()
  const titleLower = title.toLowerCase()

  // Datasheets and spec documents
  if (titleLower.includes("datasheet") || titleLower.includes("spec sheet") ||
      titleLower.includes("technical data") || lower.includes("/datasheet") ||
      lower.includes(".pdf") || titleLower.includes("product specification")) {
    return "datasheet"
  }

  // Known manufacturer/OEM domains
  const manufacturerPatterns = [
    "ti.com", "analog.com", "digikey.com", "mouser.com", "arrow.com",
    "mcmaster.com", "misumi", "hiwin.com", "harmonicdrive", "maxon",
    "faulhaber.com", "nanotec.com", "pololu.com", "sparkfun.com",
    "adafruit.com", "dji.com", "cubespace", "nanoavionics", "endurosat",
    "blue-canyon", "spacex.com", "boeing.com", "airbus.com", "tesla.com",
    "nvidia.com", "intel.com", "stmicro", "nxp.com", "infineon.com",
    "rohde-schwarz", "keysight.com", "thingiverse.com", "grabcad.com",
    "manufacturer", ".gov", "nasa.gov", "esa.int", "mil",
  ]
  if (manufacturerPatterns.some((p) => lower.includes(p))) {
    return "manufacturer"
  }

  // Reference/educational sites
  const referencePatterns = [
    "wikipedia", "engineering.com", "machinedesign.com", "asme.org",
    "iso.org", "astm.org", "sae.org", "ieee.org", "springer.com",
    "sciencedirect", "researchgate", "arxiv.org", ".edu", "handbook",
    "standard", "reference",
  ]
  if (referencePatterns.some((p) => lower.includes(p))) {
    return "reference"
  }

  // Community/forums/blogs
  return "community"
}

const SOURCE_TYPE_CONFIG: Record<SourceType, { label: string; icon: typeof Globe; color: string }> = {
  manufacturer: { label: "Manufacturer", icon: Building2, color: "text-status-success" },
  datasheet: { label: "Datasheet", icon: Database, color: "text-electric-blue" },
  reference: { label: "Reference", icon: BookOpen, color: "text-international-orange" },
  community: { label: "Community", icon: MessageSquare, color: "text-muted-foreground" },
}

// ─── Quick-start templates ───────────────────────────────────────────

const QUICK_START_TEMPLATES = [
  { id: "cubesat", label: "CubeSat Bus", subject: "1U CubeSat structural bus frame (100×100×100mm) with PC-104 avionics stack mounting, solar panel rail interfaces, and deployment switch cutout per CDS rev 14", tag: "Aerospace" },
  { id: "rocket", label: "Rocket Thrust Mount", subject: "Bipropellant rocket engine thrust structure with gimbal bearing attachment points, regenerative cooling channel interfaces, and propellant feed-through ports for 5kN class engine", tag: "Aerospace" },
  { id: "ev-battery", label: "EV Battery Module", subject: "Prismatic cell battery module enclosure with liquid cooling channels, BMS mounting plate, thermal runaway vent ports, and HV busbar connectors for 400V architecture", tag: "Automotive" },
  { id: "robotic-arm", label: "Robotic Arm Joint", subject: "6-DOF robotic arm wrist joint with harmonic drive gear housing, precision encoder mount, cable passthrough channels, and force-torque sensor interface", tag: "Robotics" },
  { id: "reaction-wheel", label: "Reaction Wheel", subject: "Satellite reaction wheel assembly with precision flywheel housing, BLDC motor mount, optical encoder interface, and vibration-isolated mounting flange", tag: "Aerospace" },
  { id: "heavy-drone", label: "Heavy-Lift Drone", subject: "Octocopter heavy-lift drone frame with coaxial motor mounts, central payload bay with 3-axis gimbal interface, retractable landing gear, and folding arm hinges in carbon fiber", tag: "UAV" },
] as const

// ─── Pipeline preview (always visible) ───────────────────────────────

const PIPELINE_STAGES = [
  { icon: Search, label: "Research", desc: "Real-world specs" },
  { icon: Box, label: "Build", desc: "Parametric CAD" },
  { icon: BarChart3, label: "Analysis", desc: "Risk & timeline" },
  { icon: ShoppingCart, label: "Procurement", desc: "Costs & supply" },
  { icon: ClipboardCheck, label: "Review", desc: "Supplier-ready" },
]

// ─── Page Component ──────────────────────────────────────────────────

export default function CadLabResearchPage(): React.ReactNode {
  const router = useRouter()
  const {
    subject, setSubject,
    isResearching, researchResult, editableReport, setEditableReport,
    showSources, setShowSources,
    hasResearch, isAnyLoading,
    handleResearch, handleReset, handleDecompose,
    modules, isDecomposing,
  } = useCadLab()

  // Reset confirmation dialog
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Report view mode: structured cards, raw markdown, or editing
  type ReportViewMode = "structured" | "markdown" | "edit"
  const [reportViewMode, setReportViewMode] = useState<ReportViewMode>("structured")

  /**
   * Handles template pill click — sets subject and triggers research directly.
   *
   * @param templateSubject - The template's subject string
   */
  const handleTemplateClick = useCallback((templateSubject: string) => {
    setSubject(templateSubject)
    // We need a small delay for the state to propagate before calling handleResearch
    // which reads subject from context. Instead, we'll use a ref approach via
    // the input value, but since handleResearch reads from context state,
    // we trigger it on next tick.
    setTimeout(() => {
      // handleResearch reads from the context `subject`, which is now set
      handleResearch()
    }, 50)
  }, [setSubject, handleResearch])

  /**
   * Handles safe reset with confirmation.
   */
  const handleSafeReset = useCallback(() => {
    if (hasResearch || modules.length > 0) {
      setShowResetConfirm(true)
    } else {
      handleReset()
    }
  }, [hasResearch, modules.length, handleReset])

  const handleConfirmReset = useCallback(() => {
    setShowResetConfirm(false)
    handleReset()
  }, [handleReset])

  /**
   * Handles "Continue to Build" — decomposes if needed, then navigates.
   */
  const handleContinueToBuild = useCallback(async () => {
    if (modules.length === 0 && !isDecomposing) {
      await handleDecompose()
    }
    router.push("/the-forge/cad-lab/build")
  }, [modules.length, isDecomposing, handleDecompose, router])

  return (
    <div className="space-y-6">
      {/* ── Focused Launchpad (before research) ── */}
      {!hasResearch && !isResearching && (
        <div className="space-y-8">
          {/* Hero area — clean and focused */}
          <div className="text-center space-y-3 pt-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-international-orange" />
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                From idea to manufacturing-ready CAD
              </span>
            </div>
            <h2 className="text-3xl font-bold text-foreground leading-tight">
              Parametric CAD from a single sentence
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Describe any physical product. We&apos;ll research real-world specs, generate parametric models
              with 7 orthographic projections, run DFM analysis, and deliver STEP + STL exports.
            </p>
          </div>

          {/* Primary input — the center of gravity */}
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && subject.trim() && !isAnyLoading) {
                    handleResearch()
                  }
                }}
                placeholder="Describe a product or sub-assembly to engineer..."
                disabled={isAnyLoading}
                className="h-14 pl-12 pr-4 text-base rounded-xl border-2 border-muted focus:border-international-orange transition-colors"
              />
            </div>
            <Button
              id="research-btn"
              onClick={handleResearch}
              disabled={isAnyLoading || !subject.trim()}
              className="w-full h-12 text-base rounded-xl gap-2"
            >
              <Search className="h-5 w-5" />
              Research &amp; Build
            </Button>

            {/* Error from failed research attempt */}
            {researchResult && !researchResult.success && researchResult.error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-status-error-light border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Research failed</p>
                  <p className="text-xs text-destructive/80 mt-0.5">{researchResult.error}</p>
                </div>
              </div>
            )}
          </div>

          {/* Template pills */}
          <div className="max-w-2xl mx-auto space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Or try an engineering template:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_START_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTemplateClick(t.subject)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-full border border-muted bg-card text-xs font-medium text-foreground hover:border-international-orange/50 hover:bg-international-orange-light/10 transition-all cursor-pointer"
                >
                  {t.label}
                  <span className="text-xs text-muted-foreground font-mono">{t.tag}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Credibility stats — subtle */}
          <div className="flex items-center justify-center gap-6 py-3 px-4 text-xs text-muted-foreground">
            <span><span className="font-mono font-semibold text-foreground">256</span> Components</span>
            <span className="text-muted">·</span>
            <span><span className="font-mono font-semibold text-foreground">15</span> Sectors</span>
            <span className="text-muted">·</span>
            <span><span className="font-mono font-semibold text-foreground">7</span> Views</span>
            <span className="text-muted">·</span>
            <span className="font-mono font-semibold text-foreground">STEP + STL</span>
          </div>

          {/* Pipeline preview — always visible, teaching the user what comes next */}
          <div className="max-w-lg mx-auto">
            <div className="flex items-start">
              {PIPELINE_STAGES.map((stage, i) => {
                const Icon = stage.icon
                return (
                  <div key={stage.label} className="flex items-start flex-1">
                    {i > 0 && <div className="h-0.5 flex-1 mt-4 bg-muted" />}
                    <div className="flex flex-col items-center gap-1 text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {stage.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Researching state ── */}
      {isResearching && (
        <div className="text-center space-y-4 py-8">
          <div className="flex items-center justify-center gap-2">
            <Search className="h-5 w-5 text-international-orange" />
            <h3 className="text-lg font-semibold text-foreground">Researching: {subject}</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Searching engineering databases, cross-referencing datasheets, and synthesising a dimensional report...
          </p>
        </div>
      )}

      {/* ── Research Results (after research completes) ── */}
      {hasResearch && !isResearching && (
        <>
          {/* Success banner with actions */}
          <Card className="border-status-success/30 bg-gradient-to-r from-status-success-light/20 to-background">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-light">
                    <CheckCircle2 className="h-5 w-5 text-status-success" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Research Complete</p>
                    <p className="text-xs text-muted-foreground">
                      {researchResult?.sources.length ?? 0} sources · {editableReport.length.toLocaleString()} chars
                      {researchResult?.researchTime ? ` · ${(researchResult.researchTime / 1000).toFixed(1)}s` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleResearch()} disabled={isAnyLoading}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Re-research
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSafeReset}>
                    Start Over
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Input — still visible for editing */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isAnyLoading}
                className="pl-10 text-sm"
              />
            </div>
          </div>

          {/* Research Report — structured view with mode toggle */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Research Report
                </CardTitle>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => setReportViewMode("structured")}
                    className={cn(
                      "px-2.5 py-2 min-h-[44px] text-xs font-medium rounded-md transition-colors",
                      reportViewMode === "structured"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Structured
                  </button>
                  <button
                    onClick={() => setReportViewMode("markdown")}
                    className={cn(
                      "px-2.5 py-2 min-h-[44px] text-xs font-medium rounded-md transition-colors",
                      reportViewMode === "markdown"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Markdown
                  </button>
                  <button
                    onClick={() => setReportViewMode("edit")}
                    className={cn(
                      "px-2.5 py-2 min-h-[44px] text-xs font-medium rounded-md transition-colors flex items-center gap-1",
                      reportViewMode === "edit"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {reportViewMode === "edit" ? (
                <Textarea
                  value={editableReport}
                  onChange={(e) => setEditableReport(e.target.value)}
                  className="font-mono text-xs min-h-[400px]"
                  disabled={isAnyLoading}
                />
              ) : reportViewMode === "markdown" ? (
                <div className="border rounded-md p-4 bg-muted/30 max-h-[500px] overflow-y-auto">
                  <Markdown content={editableReport} className="text-sm text-foreground" />
                </div>
              ) : (
                <CadLabResearchReport report={editableReport} />
              )}
              <p className="text-xs text-muted-foreground">
                {editableReport.length.toLocaleString()} characters
                {reportViewMode === "edit" && " · Edit dimensions before proceeding"}
              </p>
            </CardContent>
          </Card>

          {/* Research Sources — collapsible */}
          {researchResult?.success &&
            ((researchResult.sources.length > 0) || (researchResult.referenceModels.length > 0)) && (
            <Card>
              <CardHeader>
                <button
                  onClick={() => setShowSources(!showSources)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Research Sources
                    <span className="text-xs font-normal text-muted-foreground">
                      ({researchResult.sources.length} web + {researchResult.referenceModels.length} CAD refs)
                    </span>
                  </CardTitle>
                  {showSources ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CardHeader>
              {showSources && (
                <CardContent className="space-y-4">
                  {/* Source credibility legend */}
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="font-medium">Type:</span>
                    {(Object.entries(SOURCE_TYPE_CONFIG) as [SourceType, typeof SOURCE_TYPE_CONFIG[SourceType]][]).map(([key, cfg]) => {
                      const Icon = cfg.icon
                      return (
                        <div key={key} className="flex items-center gap-1">
                          <Icon className={cn("h-3 w-3", cfg.color)} />
                          <span>{cfg.label}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Classified source list */}
                  {researchResult.sources.length > 0 && (
                    <div className="space-y-1.5">
                      {researchResult.sources.map((source, i) => {
                        const sourceType = classifySource(source.uri, source.title || "")
                        const cfg = SOURCE_TYPE_CONFIG[sourceType]
                        const TypeIcon = cfg.icon
                        return (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <TypeIcon className={cn("h-3 w-3 flex-shrink-0 mt-0.5", cfg.color)} />
                            <a
                              href={source.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-electric-blue hover:underline truncate flex-1"
                            >
                              {source.title || source.uri}
                            </a>
                            <span className={cn("text-xs font-mono flex-shrink-0 px-1.5 py-0.5 rounded", cfg.color, "bg-muted/50")}>
                              {cfg.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Error display */}
          {researchResult && !researchResult.success && researchResult.error && (
            <Card className="border-destructive/30">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-destructive font-mono">{researchResult.error}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Continue to Build — the main CTA ── */}
          <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/10 to-background">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {modules.length > 0 ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        {modules.length} sub-assemblies mapped
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ready to generate parametric CAD for each module.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        Ready to decompose into sub-assemblies
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        The system will map your product into manufacturable modules and generate CAD for each.
                      </p>
                    </>
                  )}
                </div>
                <Button
                  onClick={handleContinueToBuild}
                  disabled={isAnyLoading || isDecomposing}
                  className="gap-1.5"
                >
                  {isDecomposing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Mapping...</>
                  ) : (
                    <>
                      Continue to Build
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Reset Confirmation Dialog ── */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Start Over?</DialogTitle>
            <DialogDescription>
              This will reset all research, modules, and generated CAD for this project. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmReset}>
              Start Over
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
