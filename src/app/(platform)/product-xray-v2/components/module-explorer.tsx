/**
 * @file module-explorer.tsx — Compact accordion module list
 *
 * @description Replaces the massive stacked cards with compact rows
 * that expand to reveal full module detail. Blueprint images are
 * displayed as the hero element of each expanded section.
 */

"use client"

import React, { useState, useMemo } from "react"

import { Card, CardContent } from "@/components/ui/card"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec, ModuleSpec } from "../../product-xray/services/xray-schema"

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
}: {
  module: ModuleSpec
  isExpanded: boolean
  onToggle: () => void
  onModuleUpdate: (m: ModuleSpec) => void
  scanId: string | null
  onDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>
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
}: {
  m: ModuleSpec
  accentColor: string
  onModuleUpdate: (m: ModuleSpec) => void
  scanId: string | null
  onDeriveProcessClass: (moduleId: string, answers: Record<string, string>) => Promise<void>
}): React.ReactNode {
  const [lightboxOpen, setLightboxOpen] = useState(false)
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
