/**
 * @file module-explorer.tsx — Compact accordion module list
 *
 * @description Replaces the massive stacked cards with compact rows
 * that expand to reveal full module detail. Blueprint images are
 * displayed as the hero element of each expanded section.
 */

"use client"

import React, { useState, useMemo } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Box,
  ChevronDown,
  ChevronRight,
  Clock,
  Package,
  ClipboardCheck,
  AlertTriangle,
  Lightbulb,
  Gauge,
  ArrowRight,
  ArrowDown,
  Wrench,
  Truck,
  HelpCircle,
  Users,
  CheckCircle2,
  X,
  ShieldCheck,
  Boxes,
  Download,
  Loader2,
  RotateCcw,
  Scale,
  Ruler,
  Printer,
  CircleDot,
  TriangleAlert,
  Info,
  ShieldAlert,
  Activity,
  ImageIcon,
  Zap,
  RefreshCw,
  Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec, ModuleSpec, ModuleAnalysis, MassProperties, DfmAnalysis, DfmIssue, StructuralAnalysis, StressHotspot, EmiShielding, Fatigue, Impact } from "../../product-xray/services/xray-schema"

// ─── Helpers ─────────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
]

function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

function readinessFor(m: ModuleSpec): { answered: number; total: number; pct: number } {
  const a = m.interview?.answers || {}
  const answered = Object.keys(a).filter((k) => String(a[k] || "").trim()).length
  const total = m.detail.expertQuestions.length
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100)
  return { answered, total, pct }
}

// ─── Props ───────────────────────────────────────────────────────────

interface ModuleExplorerProps {
  spec: XRaySpec
  onModuleUpdate: (m: ModuleSpec) => void
  scanId: string | null
  onDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>
  /** Callback to trigger 3D CAD model generation for a specific module */
  onGenerateCadModel?: (moduleId: string) => Promise<void>
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ModuleExplorer — Accordion-style module browser.
 *
 * @description Shows all modules as compact rows. Clicking a row expands
 * to reveal the full module detail with blueprint image as hero.
 */
export function ModuleExplorer({
  spec,
  onModuleUpdate,
  scanId,
  onDeriveProcessClass,
  onGenerateCadModel,
}: ModuleExplorerProps): React.ReactNode {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const modules = spec.modules || []
  if (modules.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 bg-international-orange rounded-full" />
          <div>
            <h2 className="text-lg font-display font-semibold tracking-tight text-foreground">
              Module Explorer
            </h2>
            <p className="text-xs text-muted-foreground">
              Click a module to expand its full engineering detail
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs">
          {modules.length} modules
        </Badge>
      </div>

      <div className="space-y-2">
        {modules.map((m) => (
          <ModuleRow
            key={m.id}
            module={m}
            isExpanded={expandedId === m.id}
            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
            onModuleUpdate={onModuleUpdate}
            scanId={scanId}
            onDeriveProcessClass={onDeriveProcessClass}
            onGenerateCadModel={onGenerateCadModel}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Module Row ──────────────────────────────────────────────────────

function ModuleRow({
  module: m,
  isExpanded,
  onToggle,
  onModuleUpdate,
  scanId,
  onDeriveProcessClass,
  onGenerateCadModel,
}: {
  module: ModuleSpec
  isExpanded: boolean
  onToggle: () => void
  onModuleUpdate: (m: ModuleSpec) => void
  scanId: string | null
  onDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>
  onGenerateCadModel?: (moduleId: string) => Promise<void>
}): React.ReactNode {
  const r = readinessFor(m)
  const accentColor = chipColor(m.id)
  const isGating = m.isGatingModule || m.id === "react"
  const diagComplete = !!(m.diagnostic?.derivedProcessClass)
  const riskCount = m.detail.commonFailureModes.length + (m.diagnostic?.derivedRisks?.length ?? 0)

  return (
    <Card
      id={`module-v2-${m.id}`}
      className={cn(
        "rounded-xl shadow-sm transition-all duration-200 overflow-hidden",
        isExpanded && "shadow-md",
      )}
    >
      {/* Compact row header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors text-left"
      >
        {/* Accent + icon */}
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: accentColor + "18" }}
        >
          <Box className="h-4 w-4" style={{ color: accentColor }} />
        </div>

        {/* Name + purpose */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
            {isGating && (
              <Badge variant={diagComplete ? "success" : "warning"} className="text-[9px] shrink-0">
                {diagComplete ? "Gating set" : "Gating"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{m.purpose}</p>
        </div>

        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{m.requirements.leadWeeks}w</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Package className="h-3 w-3" />
            <span>{m.keyParts.length}</span>
          </div>
          {riskCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-status-warning-dark">
              <AlertTriangle className="h-3 w-3" />
              <span>{riskCount}</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="hidden md:flex items-center gap-2 w-24 shrink-0">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${r.pct}%`,
                backgroundColor: r.pct === 100 ? "#10b981" : r.pct > 0 ? "#3b82f6" : "#94a3b8",
              }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{r.pct}%</span>
        </div>

        {/* Chevron */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <ExpandedModuleDetail
          m={m}
          accentColor={accentColor}
          onModuleUpdate={onModuleUpdate}
          scanId={scanId}
          onDeriveProcessClass={onDeriveProcessClass}
          onGenerateCadModel={onGenerateCadModel}
        />
      )}
    </Card>
  )
}

// ─── Expanded Detail ─────────────────────────────────────────────────

function ExpandedModuleDetail({
  m,
  accentColor,
  onModuleUpdate,
  scanId,
  onDeriveProcessClass,
  onGenerateCadModel,
}: {
  m: ModuleSpec
  accentColor: string
  onModuleUpdate: (m: ModuleSpec) => void
  scanId: string | null
  onDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>
  onGenerateCadModel?: (moduleId: string) => Promise<void>
}): React.ReactNode {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [cadGenerating, setCadGenerating] = useState(false)
  const processClass = m.diagnostic?.derivedProcessClass
  const derivedRisks = m.diagnostic?.derivedRisks || []

  const disciplineGroups = useMemo(() => {
    const groups = new Map<string, Array<{ q: string }>>()
    for (const eq of m.detail.expertQuestions) {
      const existing = groups.get(eq.discipline) || []
      existing.push({ q: eq.q })
      groups.set(eq.discipline, existing)
    }
    return groups
  }, [m.detail.expertQuestions])

  return (
    <div className="border-t px-5 py-6 space-y-6 bg-muted/5">
      {/* 1. Blueprint Image (HERO — first thing you see) */}
      {m.imageUrl && m.imageStatus === "complete" && (
        <>
          <div className="rounded-xl overflow-hidden border bg-muted/5 p-4">
            <button
              onClick={() => setLightboxOpen(true)}
              className="w-full cursor-zoom-in hover:opacity-90 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.imageUrl}
                alt={`Technical blueprint: ${m.name}`}
                className="w-full h-auto object-contain max-h-[400px]"
              />
            </button>
            <p className="text-xs text-muted-foreground text-center mt-2 font-medium">
              {m.name} — Technical Illustration (click to enlarge)
            </p>
          </div>

          <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <DialogContent size="xl" className="max-w-[95vw] max-h-[95vh] p-0">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 z-10 bg-background/90 hover:bg-background shadow-sm"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="overflow-auto max-h-[95vh] p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.imageUrl || ""} alt={`Technical blueprint: ${m.name}`} className="w-full h-auto" />
                </div>
              </div>
              <DialogTitle className="sr-only">{m.name} Technical Blueprint</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      )}
      {m.imageStatus === "generating" && (
        <div className="rounded-xl overflow-hidden relative">
          <Skeleton className="h-48 w-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted-foreground font-medium">Generating blueprint...</span>
          </div>
        </div>
      )}

      {/* 1b. 3D CAD Model Section */}
      <CadModelSection
        module={m}
        onGenerate={onGenerateCadModel}
        isGenerating={cadGenerating}
        onGeneratingChange={setCadGenerating}
      />

      {/* 1c. Engineering Analysis Results */}
      {m.cadModel?.analysis && (
        <AnalysisSection analysis={m.cadModel.analysis} moduleName={m.name} />
      )}

      {/* 2. Technical Description */}
      <div className="rounded-xl bg-muted/20 border p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-chart-1 shrink-0" />
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">What it is</h4>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{m.detail.whatItIs}</p>
        <p className="text-sm text-muted-foreground leading-relaxed italic">{m.detail.whyItMatters}</p>
      </div>

      {/* 3. Process Flow (IO) */}
      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-chart-2" />
          Process flow
        </h4>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 text-chart-2 shrink-0" />
            <div className="flex flex-wrap gap-1">
              {m.io.in.map((x, i) => (
                <span key={i} className="inline-flex items-center rounded-md bg-chart-2/10 border border-chart-2/20 px-2 py-0.5 text-xs font-medium text-foreground">{x}</span>
              ))}
            </div>
          </div>
          <ArrowDown className="h-4 w-4 text-muted-foreground rotate-[-90deg] shrink-0" />
          <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border-2" style={{ borderColor: accentColor + "40", backgroundColor: accentColor + "08" }}>
            <Box className="h-3.5 w-3.5" style={{ color: accentColor }} />
            <span className="text-xs font-semibold text-foreground">{m.name}</span>
          </div>
          <ArrowDown className="h-4 w-4 text-muted-foreground rotate-[-90deg] shrink-0" />
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {m.io.out.map((x, i) => (
                <span key={i} className="inline-flex items-center rounded-md bg-chart-3/10 border border-chart-3/20 px-2 py-0.5 text-xs font-medium text-foreground">{x}</span>
              ))}
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-chart-3 shrink-0" />
          </div>
        </div>
      </div>

      {/* 4. Key Components + Acceptance Tests (side by side) */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-chart-4" />
            Key components ({m.keyParts.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {m.keyParts.map((part, i) => (
              <span key={i} className="inline-flex items-center rounded-lg bg-muted/50 border px-2.5 py-1 text-xs text-foreground">
                <Wrench className="h-2.5 w-2.5 mr-1.5 text-muted-foreground" />
                {part}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheck className="h-3.5 w-3.5 text-chart-3" />
            Acceptance tests ({m.tests.length})
          </h4>
          <div className="space-y-1.5">
            {m.tests.map((test, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/30 border px-2.5 py-1.5">
                <CheckCircle2 className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-xs text-foreground">{test}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Procurement */}
      <div className="rounded-xl bg-chart-2/5 border border-chart-2/15 p-4 flex items-start gap-3">
        <Truck className="h-4 w-4 text-chart-2 shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">Procurement &amp; lead time</h4>
            <Badge variant="secondary" className="text-[10px]">
              <Clock className="h-2.5 w-2.5 mr-1" />
              {m.requirements.leadWeeks} weeks
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{m.requirements.notes}</p>
        </div>
      </div>

      {/* 6. Risks */}
      {(m.detail.commonFailureModes.length > 0 || derivedRisks.length > 0) && (
        <div className="rounded-xl bg-status-warning-light/20 border border-status-warning/15 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
            Risk indicators
          </h4>
          <div className="grid sm:grid-cols-2 gap-2">
            {m.detail.commonFailureModes.map((x, i) => (
              <div key={`fm-${i}`} className="flex items-start gap-2 text-sm">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-warning mt-1.5 shrink-0" />
                <span className="text-muted-foreground">{x}</span>
              </div>
            ))}
            {derivedRisks.map((x, i) => (
              <div key={`dr-${i}`} className="flex items-start gap-2 text-sm">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
                <span className="text-muted-foreground">{x}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Derived process class */}
      {processClass && (
        <div className="rounded-xl bg-status-success-light/30 border border-status-success/20 p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-status-success shrink-0" />
          <div>
            <h4 className="text-xs font-semibold text-foreground">Derived process class</h4>
            <p className="text-sm font-medium text-foreground">{processClass}</p>
          </div>
        </div>
      )}

      {/* 7. Expert Questions by Discipline */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-chart-1" />
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Expert questions by discipline
          </h4>
        </div>
        {Array.from(disciplineGroups.entries()).map(([discipline, questions]) => (
          <div key={discipline} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{discipline}</Badge>
              <span className="text-[10px] text-muted-foreground">{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-1">
              {questions.map((q, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-background border px-3 py-2">
                  <HelpCircle className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground">{q.q}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 8. Unknowns */}
      {m.detail.unknownsToResolve.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-3.5 w-3.5 text-chart-5" />
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Unknowns to resolve
            </h4>
          </div>
          <ul className="space-y-1.5">
            {m.detail.unknownsToResolve.map((x, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-background border px-3 py-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-chart-5/15 text-[10px] font-bold text-chart-5 shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-sm text-foreground">{x}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── CAD Model Section ───────────────────────────────────────────────

const SVG_VIEWS = [
  { key: "svgIsoUrl", label: "Isometric", short: "ISO" },
  { key: "svgTopUrl", label: "Top", short: "Top" },
  { key: "svgFrontUrl", label: "Front", short: "Front" },
  { key: "svgRightUrl", label: "Right", short: "Right" },
] as const

type SvgViewKey = typeof SVG_VIEWS[number]["key"]

/**
 * CadModelSection — Displays 3D CAD model SVG views with download buttons.
 *
 * @description Shows an SVG view carousel for the generated 3D model,
 * download links for STEP/STL files, and a generate trigger when no
 * model exists yet.
 */
function CadModelSection({
  module: m,
  onGenerate,
  isGenerating,
  onGeneratingChange,
}: {
  module: ModuleSpec
  onGenerate?: (moduleId: string) => Promise<void>
  isGenerating: boolean
  onGeneratingChange: (v: boolean) => void
}): React.ReactNode {
  const [activeView, setActiveView] = useState<SvgViewKey>("svgIsoUrl")
  const [svgLightboxOpen, setSvgLightboxOpen] = useState(false)
  const cadModel = m.cadModel

  /** Trigger CAD generation */
  async function handleGenerate(): Promise<void> {
    if (!onGenerate || isGenerating) return
    onGeneratingChange(true)
    try {
      await onGenerate(m.id)
    } finally {
      onGeneratingChange(false)
    }
  }

  // No cadModel field at all — show generate button
  if (!cadModel) {
    return (
      <div className="rounded-xl border border-dashed p-6 flex flex-col items-center justify-center gap-3 bg-muted/10">
        <Boxes className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">3D Engineering Model</p>
          <p className="text-xs text-muted-foreground mt-1">
            Generate a parametric 3D CAD model with STEP and STL exports
          </p>
        </div>
        {onGenerate && (
          <Button
            variant="default"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="mt-1"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Boxes className="h-4 w-4 mr-2" />
                Generate 3D Model
              </>
            )}
          </Button>
        )}
      </div>
    )
  }

  // Generating state
  if (cadModel.status === "generating" || isGenerating) {
    return (
      <div className="rounded-xl border p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-chart-2" />
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            3D Engineering Model
          </h4>
        </div>
        <div className="relative">
          <Skeleton className="h-48 w-full rounded-lg" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                Generating 3D model...
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Failed state
  if (cadModel.status === "failed") {
    return (
      <div className="rounded-xl border border-destructive/20 bg-status-error-light/10 p-6 flex flex-col items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">3D model generation failed</p>
          <p className="text-xs text-muted-foreground mt-1">
            The AI-generated code could not produce a valid model
          </p>
        </div>
        {onGenerate && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        )}
      </div>
    )
  }

  // Complete state — show SVG views + downloads
  const activeSvgUrl = cadModel[activeView]
  const availableViews = SVG_VIEWS.filter((v) => cadModel[v.key])

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-chart-2" />
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            3D Engineering Model
          </h4>
        </div>
        {/* Download buttons */}
        <div className="flex items-center gap-2">
          {cadModel.stepUrl && (
            <a
              href={cadModel.stepUrl}
              download={`${m.id}-model.step`}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3 w-3" />
              STEP
            </a>
          )}
          {cadModel.stlUrl && (
            <a
              href={cadModel.stlUrl}
              download={`${m.id}-model.stl`}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3 w-3" />
              STL
            </a>
          )}
        </div>
      </div>

      {/* View selector tabs */}
      {availableViews.length > 1 && (
        <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
          {availableViews.map((view) => (
            <button
              key={view.key}
              onClick={() => setActiveView(view.key)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeView === view.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {view.short}
            </button>
          ))}
        </div>
      )}

      {/* SVG Display */}
      {activeSvgUrl && (
        <>
          <button
            onClick={() => setSvgLightboxOpen(true)}
            className="w-full cursor-zoom-in hover:opacity-90 transition-opacity rounded-lg overflow-hidden bg-background border p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeSvgUrl}
              alt={`${m.name} — ${SVG_VIEWS.find((v) => v.key === activeView)?.label ?? "Engineering"} view`}
              className="w-full h-auto object-contain max-h-[350px]"
            />
          </button>
          <p className="text-xs text-muted-foreground text-center font-medium">
            {m.name} — {SVG_VIEWS.find((v) => v.key === activeView)?.label ?? "Engineering"} View (click to enlarge)
          </p>

          {/* SVG Lightbox */}
          <Dialog open={svgLightboxOpen} onOpenChange={setSvgLightboxOpen}>
            <DialogContent size="xl" className="max-w-[95vw] max-h-[95vh] p-0">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 z-10 bg-background/90 hover:bg-background shadow-sm"
                  onClick={() => setSvgLightboxOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="overflow-auto max-h-[95vh] p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeSvgUrl}
                    alt={`${m.name} — ${SVG_VIEWS.find((v) => v.key === activeView)?.label ?? "Engineering"} view`}
                    className="w-full h-auto"
                  />
                </div>
              </div>
              <DialogTitle className="sr-only">
                {m.name} — {SVG_VIEWS.find((v) => v.key === activeView)?.label ?? "Engineering"} View
              </DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* No SVGs available but model exists */}
      {!activeSvgUrl && (cadModel.stepUrl || cadModel.stlUrl) && (
        <div className="rounded-lg bg-muted/20 border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            SVG views unavailable. Download the STEP or STL file above to view in a CAD application.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Engineering Analysis Section ────────────────────────────────────

/**
 * AnalysisSection — Displays mass properties and DFM analysis results.
 *
 * @description Shows computed engineering data from CAD model analysis:
 * mass, center of gravity, bounding box, DFM printability assessment,
 * and actionable issues.
 */
function AnalysisSection({
  analysis,
  moduleName,
}: {
  analysis: ModuleAnalysis
  moduleName: string
}): React.ReactNode {
  const mp = analysis.massProperties
  const dfm = analysis.dfm
  const structural = analysis.structural
  const emi = analysis.emiShielding
  const fatigue = analysis.fatigue
  const impact = analysis.impact

  if (!mp && !dfm && !structural && !emi && !fatigue && !impact) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-chart-1" />
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Engineering Analysis
        </h4>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Mass Properties Card */}
        {mp && <MassPropertiesCard mp={mp} />}

        {/* DFM Report Card */}
        {dfm && <DfmReportCard dfm={dfm} />}
      </div>

      {/* Structural Analysis Card (full width) */}
      {structural && <StructuralAnalysisCard structural={structural} moduleName={moduleName} />}

      {/* Premium Analysis Cards */}
      {(emi || fatigue || impact) && (
        <div className="grid md:grid-cols-3 gap-3">
          {emi && <EmiShieldingCard emi={emi} />}
          {fatigue && <FatigueCard fatigue={fatigue} />}
          {impact && <ImpactCard impact={impact} />}
        </div>
      )}
    </div>
  )
}

/**
 * MassPropertiesCard — Displays mass, CG, volume, and bounding box.
 */
function MassPropertiesCard({ mp }: { mp: MassProperties }): React.ReactNode {
  const massDisplay = mp.mass_kg >= 1
    ? `${mp.mass_kg.toFixed(2)} kg`
    : `${(mp.mass_kg * 1000).toFixed(1)} g`

  const volumeDisplay = mp.volume_mm3 >= 1_000_000
    ? `${(mp.volume_mm3 / 1_000_000).toFixed(1)} cm³`
    : `${mp.volume_mm3.toFixed(0)} mm³`

  const bb = mp.boundingBox

  return (
    <div className="rounded-xl border bg-muted/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-3.5 w-3.5 text-chart-1" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Mass Properties
          </span>
        </div>
        {mp.materialName && (
          <Badge variant="secondary" className="text-[10px]">
            {mp.materialName}
          </Badge>
        )}
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCell label="Mass" value={massDisplay} icon={<Scale className="h-3 w-3" />} />
        <MetricCell label="Volume" value={volumeDisplay} icon={<Box className="h-3 w-3" />} />
        <MetricCell
          label="Bounding Box"
          value={`${bb.xLen.toFixed(0)} × ${bb.yLen.toFixed(0)} × ${bb.zLen.toFixed(0)} mm`}
          icon={<Ruler className="h-3 w-3" />}
        />
        <MetricCell
          label="Center of Gravity"
          value={`(${mp.centerOfGravity[0].toFixed(1)}, ${mp.centerOfGravity[1].toFixed(1)}, ${mp.centerOfGravity[2].toFixed(1)})`}
          icon={<CircleDot className="h-3 w-3" />}
        />
      </div>
    </div>
  )
}

/**
 * MetricCell — A single metric display with label, value, and optional icon.
 */
function MetricCell({
  label,
  value,
  icon,
  className,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  className?: string
}): React.ReactNode {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-background border px-3 py-2">
      {icon && <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("text-sm font-medium text-foreground truncate", className)}>{value}</p>
      </div>
    </div>
  )
}

/**
 * DfmReportCard — DFM (Design for Manufacturability) analysis results.
 */
function DfmReportCard({ dfm }: { dfm: DfmAnalysis }): React.ReactNode {
  const criticalCount = dfm.issues.filter((i) => i.severity === "critical").length
  const warningCount = dfm.issues.filter((i) => i.severity === "warning").length

  return (
    <div className="rounded-xl border bg-muted/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer className="h-3.5 w-3.5 text-chart-2" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            3D Print DFM
          </span>
        </div>
        <Badge
          variant={dfm.printable ? (warningCount > 0 ? "warning" : "success") : "destructive"}
          className="text-[10px]"
        >
          {dfm.printable ? (warningCount > 0 ? "Printable (with notes)" : "Printable") : "Not printable"}
        </Badge>
      </div>

      {/* Estimates */}
      <div className="grid grid-cols-2 gap-3">
        {dfm.estimatedPrintTime_min !== undefined && (
          <MetricCell
            label="Est. Print Time"
            value={dfm.estimatedPrintTime_min >= 60
              ? `${(dfm.estimatedPrintTime_min / 60).toFixed(1)} hr`
              : `${dfm.estimatedPrintTime_min.toFixed(0)} min`}
            icon={<Clock className="h-3 w-3" />}
          />
        )}
        {dfm.estimatedMaterial_g !== undefined && (
          <MetricCell
            label="Est. Material"
            value={`${dfm.estimatedMaterial_g.toFixed(1)} g`}
            icon={<Package className="h-3 w-3" />}
          />
        )}
      </div>

      {/* Compatible printers */}
      {dfm.compatiblePrinters && dfm.compatiblePrinters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dfm.compatiblePrinters.map((printer) => (
            <span key={printer} className="inline-flex items-center rounded-md bg-muted/50 border px-2 py-0.5 text-[10px] text-foreground">
              {printer}
            </span>
          ))}
        </div>
      )}

      {/* Issues */}
      {dfm.issues.length > 0 && (
        <div className="space-y-1.5">
          {dfm.issues.map((issue, i) => (
            <DfmIssueRow key={i} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * DfmIssueRow — Single DFM issue with severity icon and message.
 */
function DfmIssueRow({ issue }: { issue: DfmIssue }): React.ReactNode {
  const severityConfig = {
    critical: { icon: TriangleAlert, color: "text-destructive", bg: "bg-status-error-light/20" },
    warning: { icon: AlertTriangle, color: "text-status-warning", bg: "bg-status-warning-light/20" },
    info: { icon: Info, color: "text-status-info", bg: "bg-status-info-light/20" },
  }
  const config = severityConfig[issue.severity] || severityConfig.info
  const Icon = config.icon

  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", config.bg)}>
      <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", config.color)} />
      <span className="text-xs text-foreground">{issue.message}</span>
    </div>
  )
}

// ─── Structural Analysis Card ────────────────────────────────────────

/**
 * StructuralAnalysisCard — Displays FEA results for a module.
 *
 * Shows safety factor gauge, max stress/deformation, mesh info,
 * hotspot list, and optional stress contour image.
 */
function StructuralAnalysisCard({
  structural,
  moduleName,
}: {
  structural: StructuralAnalysis
  moduleName: string
}): React.ReactNode {
  // Handle running/failed states
  if (structural.status === "running") {
    return (
      <Card className="border bg-card">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-chart-2" />
            <span className="text-sm text-muted-foreground">
              Running structural analysis for {moduleName}...
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (structural.status === "failed") {
    return (
      <Card className="border border-status-error-light bg-status-error-light/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">
              Structural analysis failed for {moduleName}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const sf = structural.safetyFactor
  const sfColor = sf != null ? (sf >= 2.0 ? "text-status-success" : sf >= 1.5 ? "text-status-warning" : "text-destructive") : "text-muted-foreground"
  const sfLabel = sf != null ? (sf >= 2.0 ? "Pass" : sf >= 1.5 ? "Marginal" : "Fail") : "N/A"

  return (
    <Card className="border bg-card">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5 text-chart-2" />
          Structural Analysis (FEA)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Safety Factor Gauge */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={cn("text-2xl font-display font-bold tabular-nums", sfColor)}>
              {sf != null ? sf.toFixed(2) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
              Safety Factor
            </div>
          </div>

          {/* SF bar */}
          {sf != null && (
            <div className="flex-1 space-y-1">
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    sf >= 2.0 ? "bg-status-success" : sf >= 1.5 ? "bg-status-warning" : "bg-destructive",
                  )}
                  style={{ width: `${Math.min((sf / 3) * 100, 100)}%` }}
                />
                {/* 1.5 threshold marker */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-foreground/30"
                  style={{ left: `${(1.5 / 3) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>0</span>
                <span>1.5 (min)</span>
                <span>3.0+</span>
              </div>
            </div>
          )}

          <Badge
            variant={sf != null && sf >= 2.0 ? "success" : sf != null && sf >= 1.5 ? "warning" : "destructive"}
            className="text-[10px]"
          >
            {sfLabel}
          </Badge>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCell
            label="Max Stress"
            value={structural.maxVonMisesStress_MPa != null ? `${structural.maxVonMisesStress_MPa.toFixed(1)} MPa` : "—"}
            icon={<Activity className="h-3 w-3 text-chart-1" />}
          />
          <MetricCell
            label="Max Deformation"
            value={structural.maxDeformation_mm != null ? `${structural.maxDeformation_mm.toFixed(3)} mm` : "—"}
            icon={<ArrowDown className="h-3 w-3 text-chart-3" />}
          />
          <MetricCell
            label="Mesh Elements"
            value={structural.meshElementCount != null ? structural.meshElementCount.toLocaleString() : "—"}
            icon={<Boxes className="h-3 w-3 text-chart-5" />}
          />
        </div>

        {/* Stress Hotspots */}
        {structural.criticalLocations && structural.criticalLocations.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Stress Hotspots
            </p>
            <div className="space-y-1">
              {structural.criticalLocations.slice(0, 5).map((hs: StressHotspot, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs rounded-md border px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        hs.vonMisesStress_MPa > (structural.maxVonMisesStress_MPa ?? 1) * 0.9
                          ? "bg-destructive"
                          : "bg-status-warning",
                      )}
                    />
                    <span className="text-muted-foreground">{hs.description || `Hotspot ${i + 1}`}</span>
                  </div>
                  <span className="font-mono text-foreground tabular-nums">
                    {`${hs.vonMisesStress_MPa.toFixed(1)} MPa`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stress Contour Image */}
        {structural.contourImageUrl && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              Stress Contour
            </p>
            <div className="rounded-lg border overflow-hidden bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={structural.contourImageUrl}
                alt={`Stress contour for ${moduleName}`}
                className="w-full h-auto"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Premium Analysis Cards ─────────────────────────────────────────

/**
 * EmiShieldingCard — Displays EMI/EMC shielding effectiveness results.
 */
function EmiShieldingCard({ emi }: { emi: EmiShielding }): React.ReactNode {
  if (emi.status === "failed") {
    return (
      <Card className="border bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              EMI Shielding
            </p>
          </div>
          <p className="text-sm text-muted-foreground">Analysis failed</p>
        </CardContent>
      </Card>
    )
  }

  const ratingColor = {
    excellent: "text-status-success",
    good: "text-status-success",
    moderate: "text-status-warning",
    poor: "text-destructive",
    none: "text-destructive",
  }[emi.overallRating ?? "none"] ?? "text-muted-foreground"

  return (
    <Card className="border bg-muted/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-chart-4" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            EMI Shielding
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCell
            label="SE @ 1 GHz"
            value={emi.seAt1GHz_dB != null ? `${emi.seAt1GHz_dB.toFixed(1)} dB` : "—"}
          />
          <MetricCell
            label="Rating"
            value={emi.overallRating ?? "—"}
            className={ratingColor}
          />
        </div>

        {emi.recommendation && (
          <p className="text-xs text-muted-foreground">{emi.recommendation}</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * FatigueCard — Displays fatigue life estimation results.
 */
function FatigueCard({ fatigue }: { fatigue: Fatigue }): React.ReactNode {
  if (fatigue.status === "failed") {
    return (
      <Card className="border bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Fatigue Life
            </p>
          </div>
          <p className="text-sm text-muted-foreground">Analysis failed</p>
        </CardContent>
      </Card>
    )
  }

  const categoryColor = {
    infinite: "text-status-success",
    very_high_cycle: "text-status-success",
    high_cycle: "text-status-info",
    medium_cycle: "text-status-warning",
    low_cycle: "text-destructive",
  }[fatigue.lifeCategory ?? "low_cycle"] ?? "text-muted-foreground"

  return (
    <Card className="border bg-muted/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-chart-5" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Fatigue Life
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCell
            label="Cycles to Failure"
            value={fatigue.cyclesToFailureLabel ?? (fatigue.cyclesToFailure != null ? fatigue.cyclesToFailure.toExponential(1) : "—")}
          />
          <MetricCell
            label="Category"
            value={(fatigue.lifeCategory ?? "—").replace(/_/g, " ")}
            className={categoryColor}
          />
        </div>

        {fatigue.safetyFactor != null && (
          <MetricCell
            label="Fatigue Safety Factor"
            value={fatigue.safetyFactor.toFixed(2)}
            className={fatigue.safetyFactor >= 1.5 ? "text-status-success" : fatigue.safetyFactor >= 1.0 ? "text-status-warning" : "text-destructive"}
          />
        )}

        {fatigue.description && (
          <p className="text-xs text-muted-foreground">{fatigue.description}</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * ImpactCard — Displays impact/crash resistance estimation results.
 */
function ImpactCard({ impact }: { impact: Impact }): React.ReactNode {
  if (impact.status === "failed") {
    return (
      <Card className="border bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Impact Resistance
            </p>
          </div>
          <p className="text-sm text-muted-foreground">Analysis failed</p>
        </CardContent>
      </Card>
    )
  }

  const ratingColor = {
    excellent: "text-status-success",
    adequate: "text-status-info",
    marginal: "text-status-warning",
    insufficient: "text-destructive",
  }[impact.rating ?? "insufficient"] ?? "text-muted-foreground"

  return (
    <Card className="border bg-muted/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-chart-6" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Impact Resistance
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCell
            label="Safety Factor"
            value={impact.safetyFactor != null ? impact.safetyFactor.toFixed(2) : "—"}
            className={ratingColor}
          />
          <MetricCell
            label="Rating"
            value={impact.rating ?? "—"}
            className={ratingColor}
          />
        </div>

        {impact.kineticEnergy_J != null && impact.energyAbsorptionCapacity_J != null && (
          <div className="grid grid-cols-2 gap-2">
            <MetricCell
              label="Kinetic Energy"
              value={`${impact.kineticEnergy_J.toFixed(1)} J`}
            />
            <MetricCell
              label="Absorption Cap."
              value={`${impact.energyAbsorptionCapacity_J.toFixed(1)} J`}
            />
          </div>
        )}

        {impact.description && (
          <p className="text-xs text-muted-foreground">{impact.description}</p>
        )}
      </CardContent>
    </Card>
  )
}
