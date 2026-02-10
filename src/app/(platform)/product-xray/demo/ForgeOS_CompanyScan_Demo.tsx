/**
 * @file ForgeOS_CompanyScan_Demo.tsx — X-Ray Workbench
 *
 * @description Main UI for the Product X-Ray feature. Wired to real AI scan
 * (via server actions), live people/supplier matching from Supabase, and
 * generalized domain-agnostic diagnostic panel.
 *
 * Preserves the A-B-C-D tab flow and gating behavior:
 * - A: X-Ray scan + modules + diagnostic
 * - B: People matching (from marketplace_listings + provider_profiles)
 * - C: Supplier matching (gated on diagnostic completion)
 * - D: RFQ stub
 *
 * @related
 * - Server actions: src/actions/xray.ts
 * - Schema: ../services/xray-schema.ts
 */

"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import {
  AlertTriangle,
  Loader2,
  ImageIcon,
  Zap,
  Lightbulb,
  Layers,
  Wrench,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Box,
  ScanLine,
  Users,
  Building2,
  FileText,
  Lock,
  CheckCircle2,
  Clock,
  Star,
  Bookmark,
  CircleDot,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import {
  scanIdeaAction,
  deriveProcessClassAction,
  updateScanSpecAction,
  matchPeopleAction,
  matchSuppliersAction,
  generateImagesAction,
} from "@/actions/xray"

import type { XRaySpec, ModuleSpec, Discipline, TransformationDiagnostic } from "../services/xray-schema"
import type { PersonMatch } from "../services/people"
import type { SupplierMatch } from "../services/suppliers"

// ─── Re-exports for backward compat ──────────────────────────────────

// These types are re-exported so that product-xray-view.tsx and other
// files that import from this file continue to work.
export type { XRaySpec, ModuleSpec, Discipline }
export type ExpertQuestion = { discipline: Discipline; q: string }

export type InterviewState = {
  answers: Record<string, string>
  risks: string[]
  notes: string
  completedAt?: string
}

// Legacy type kept for backward compat with existing localStorage state
export type ReactionDiagnostic = {
  whereProductExists?: string
  triggerMechanism?: string
  timescale?: string
  controlSensitivity?: string
  postReactionForm?: string
  freeform?: string
  derivedProcessClass?: string
  derivedRisks?: string[]
}

export type PersonListing = { id: string; name: string; role: string; tags: string[]; rate: string }
export type CompanyListing = { id: string; name: string; capabilities: string[]; typicalLeadWeeks: number; warrantyMonths: number }

// ─── Mock scan (kept for XRAY_USE_MOCK=true) ─────────────────────────

export function newEmptySpec(idea: string): XRaySpec {
  return { idea, function: "", assumptions: [], materials: [], processes: [], validation: [], modules: [] }
}

function baseDetail(overrides: Partial<ModuleSpec["detail"]> = {}): ModuleSpec["detail"] {
  return {
    whatItIs: "Sub-assembly with clear IO and tests.",
    whyItMatters: "Controls yield/safety/uptime/cost.",
    commonFailureModes: [
      "Ambiguous spec causes bid mismatch",
      "Wrong materials lead to corrosion/leaks",
      "No test plan → latent failures",
    ],
    unknownsToResolve: ["Operating envelope (T, pH, TDS)", "Compatibility with upstream/downstream"],
    expertQuestions: [
      { discipline: "Process", q: "What operating ranges must we tolerate (flow, TDS, temperature, pH)?" },
      { discipline: "Mechanical", q: "What wetted materials are acceptable (316L, duplex, plastics)?" },
    ],
    ...overrides,
  }
}

export function mockScanIdea(idea: string): XRaySpec {
  const s = newEmptySpec(idea)
  s.function = "A modular processing machine performing staged transformations to produce a saleable output."
  s.assumptions = ["Skid-based system", "Corrosion resistant wetted path", "Designed for maintainability"]
  s.materials = ["316L stainless steel", "HDPE/PP for select plumbing", "Instrumentation", "Electronics/PLC"]
  s.processes = ["Skid fabrication", "Pipework & valves", "Controls & automation", "Commissioning"]
  s.validation = ["Leak test", "Instrument calibration", "72-hour endurance run", "Sampling protocol"]
  s.modules = [
    { id: "intake", name: "Intake & Pumping", purpose: "Stabilise flow/pressure into process modules", io: { in: ["Brine feed"], out: ["Pressurised feed"] }, keyParts: ["Pump", "Flowmeter", "Valves", "Pressure sensor"], tests: ["Flow calibration", "Cavitation check", "Leak check"], requirements: { leadWeeks: 3, notes: "Chemistry-resistant pump selection" }, detail: baseDetail({ whatItIs: "Front-end that receives brine and delivers stable flow/pressure.", whyItMatters: "Everything downstream depends on stable feed; poor intake kills uptime.", expertQuestions: [{ discipline: "Process", q: "How variable is the feed?" }, { discipline: "Mechanical", q: "Which pump type is appropriate?" }, { discipline: "Operations", q: "Top 3 maintenance pain points?" }] }) },
    { id: "pretreat", name: "Pre-treatment", purpose: "Remove foulants / protect core process", io: { in: ["Pressurised feed"], out: ["Conditioned brine"] }, keyParts: ["Strainer", "Filter housing", "Backwash/CIP"], tests: ["Pressure drop test", "Fouling stress test"], requirements: { leadWeeks: 6, notes: "Fouling resilience" }, detail: baseDetail({ whatItIs: "Screens/filters/CIP to protect the extraction steps.", whyItMatters: "Prevents performance collapse." }) },
    { id: "react", name: "Reaction / Transformation", purpose: "Change chemistry/physics to enable extraction", io: { in: ["Conditioned brine"], out: ["Converted stream"] }, keyParts: ["Reactor/vessel", "Dosing", "Agitation", "Temperature control"], tests: ["Kinetics sanity", "Yield verification"], requirements: { leadWeeks: 8, notes: "Kinetics + dosing control" }, isGatingModule: true, diagnostic: { questions: [{ id: "where_product_exists", question: "Where does the product exist right now?", options: ["Dissolved in a liquid", "Suspended particles in liquid", "Mixed solids", "Gas", "Created by combining ingredients", "Grown/produced by organisms"] }, { id: "trigger_mechanism", question: "What triggers the transformation?", options: ["Add chemical", "Change temperature", "Change pressure", "Electricity", "Biological activity", "Mechanical action"] }, { id: "timescale", question: "What is the timescale?", options: ["Seconds", "Minutes", "Hours", "Days"] }, { id: "control_sensitivity", question: "How sensitive is the process to control?", options: ["Naturally stable", "Temperature sensitive", "Concentration sensitive", "Mixing sensitive", "All of the above"] }, { id: "post_reaction_form", question: "After reaction, what does it look like?", options: ["Crystals in liquid", "Powder", "Sticky mass", "New liquid", "Gas bubbles", "Living biomass"] }] }, detail: baseDetail({ whatItIs: "The heart of the system where the transformation occurs.", whyItMatters: "This drives economics; ambiguity here makes all supplier quotes meaningless.", expertQuestions: [{ discipline: "Process", q: "What mechanism is most plausible?" }, { discipline: "Mechanical", q: "Is this batch or continuous?" }, { discipline: "Regulatory", q: "Any hazardous reagents/byproducts?" }] }) },
    { id: "solids", name: "Separation / Solids Handling", purpose: "Separate phases, dewater, package", io: { in: ["Slurry / mixed stream"], out: ["Solid product + filtrate"] }, keyParts: ["Filter press", "Centrifuge", "Dryer (optional)"], tests: ["Moisture spec test", "Throughput test"], requirements: { leadWeeks: 10, notes: "Downstream product spec" }, detail: baseDetail({ whatItIs: "Downstream unit ops.", whyItMatters: "Determines product quality + handling cost." }) },
    { id: "controls", name: "Controls & Instrumentation", purpose: "Stability, observability, alarms, data capture", io: { in: ["Sensor signals"], out: ["Actuation + logs"] }, keyParts: ["PLC", "HMI", "I/O", "Network", "Data logging"], tests: ["Interlock test", "Alarm simulation", "Data integrity check"], requirements: { leadWeeks: 6, notes: "Logging & traceability" }, detail: baseDetail({ whatItIs: "Automation layer: PLC logic, safety interlocks, HMI screens, and logging.", whyItMatters: "Without good controls you can't hold stable operating points.", expertQuestions: [{ discipline: "Controls", q: "Minimum viable sensor set?" }, { discipline: "Controls", q: "Which alarms/interlocks are non-negotiable?" }, { discipline: "Commercial", q: "What evidence/logs will buyers demand?" }] }) },
  ]
  s.lastScannedAt = new Date().toISOString()
  return s
}

// Keep PEOPLE and COMPANIES exports for backward compat (not used by new code)
export const PEOPLE: PersonListing[] = []
export const COMPANIES: CompanyListing[] = []

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

function readinessFor(m: ModuleSpec): { answered: number; total: number; risks: number; pct: number } {
  const a = m.interview?.answers || {}
  const answered = Object.keys(a).filter((k) => String(a[k] || "").trim()).length
  const total = m.detail.expertQuestions.length
  const risks = m.interview?.risks?.filter(Boolean).length || 0
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100)
  return { answered, total, risks, pct }
}

/**
 * Find the gating module - supports both new (isGatingModule) and legacy (id="react") format.
 */
function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

/**
 * Check if the gating diagnostic is complete.
 */
function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = findGatingModule(spec.modules)
  if (!gating) return true
  // New format
  if (gating.diagnostic?.derivedProcessClass) return true
  // Legacy format
  const legacyDiag = (gating as Record<string, unknown>).reactionDiag as ReactionDiagnostic | undefined
  if (legacyDiag?.derivedProcessClass) return true
  return false
}

/**
 * Get the derived process class from either new or legacy format.
 */
function getDerivedProcessClass(spec: XRaySpec): string | undefined {
  const gating = findGatingModule(spec.modules)
  if (!gating) return undefined
  if (gating.diagnostic?.derivedProcessClass) return gating.diagnostic.derivedProcessClass
  const legacyDiag = (gating as Record<string, unknown>).reactionDiag as ReactionDiagnostic | undefined
  return legacyDiag?.derivedProcessClass
}

// ─── Dynamic Diagnostic Panel (replaces hardcoded ReactionDiagnosticPanel) ────

function DiagnosticPanel({
  module,
  scanId,
  onClose,
  onSave,
}: {
  module: ModuleSpec
  scanId: string | null
  onClose: () => void
  onSave: (m: ModuleSpec) => void
}) {
  const diagnostic = module.diagnostic
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (!diagnostic?.questions) return {}
    const initial: Record<string, string> = {}
    for (const q of diagnostic.questions) {
      if (q.answer) initial[q.id] = q.answer
    }
    return initial
  })
  const [freeform, setFreeform] = useState(diagnostic?.freeform || "")
  const [isDeriving, setIsDeriving] = useState(false)
  const [derivedClass, setDerivedClass] = useState(diagnostic?.derivedProcessClass || "")
  const [derivedRisks, setDerivedRisks] = useState<string[]>(diagnostic?.derivedRisks || [])

  const allAnswered = diagnostic?.questions.every((q) => answers[q.id]) ?? false

  const handleDerive = async (): Promise<void> => {
    if (!scanId || !diagnostic) return
    setIsDeriving(true)
    try {
      const result = await deriveProcessClassAction(scanId, module.id, answers)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      // Extract gating module from updated spec
      const gating = findGatingModule(result.spec.modules)
      if (gating?.diagnostic) {
        setDerivedClass(gating.diagnostic.derivedProcessClass || "")
        setDerivedRisks(gating.diagnostic.derivedRisks || [])
      }
      onSave(gating || module)
    } catch (error) {
      toast.error("Failed to derive process class")
      console.error("[Diagnostic] Error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsDeriving(false)
    }
  }

  const handleSaveLocal = (): void => {
    // Save locally without AI derivation (useful when AI key not configured)
    const updated: ModuleSpec = {
      ...module,
      diagnostic: {
        ...module.diagnostic!,
        questions: module.diagnostic!.questions.map((q) => ({
          ...q,
          answer: answers[q.id] ?? q.answer,
        })),
        freeform,
        derivedProcessClass: derivedClass || undefined,
        derivedRisks: derivedRisks.length > 0 ? derivedRisks : undefined,
      },
    }
    onSave(updated)
  }

  if (!diagnostic?.questions?.length) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No diagnostic questions available for this module.</p>
          <Button variant="outline" onClick={onClose} className="mt-4">Close</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Guided diagnostic -- {module.name}</h3>
            <p className="text-xs text-muted-foreground">
              Answer {diagnostic.questions.length} decisive questions. AI derives the likely process class.
            </p>
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {diagnostic.questions.map((q, idx) => (
            <div key={q.id} className="space-y-2">
              <h4 className="text-sm font-semibold">{idx + 1}) {q.question}</h4>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <Button
                    key={opt}
                    variant={answers[q.id] === opt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                    type="button"
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Notes (optional)</h4>
            <Input
              value={freeform}
              onChange={(e) => setFreeform(e.target.value)}
              placeholder="Any extra context..."
            />
          </div>
        </div>

        {(derivedClass || derivedRisks.length > 0) && (
          <div className="rounded-lg bg-muted/50 p-6 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Derived process class</h4>
              <Badge>AI-derived</Badge>
            </div>
            {derivedClass && <p className="text-sm text-foreground">{derivedClass}</p>}
            <p className="text-xs text-muted-foreground">This will drive which experts/suppliers are shown next.</p>
            {derivedRisks.length > 0 && (
              <div className="mt-4 space-y-1">
                <h4 className="text-sm font-semibold">Derived risks / unknowns</h4>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {derivedRisks.map((r, i) => (<li key={i}>{r}</li>))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {scanId ? (
            <Button onClick={handleDerive} disabled={!allAnswered || isDeriving}>
              {isDeriving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deriving...</>
              ) : (
                "Derive process class (AI)"
              )}
            </Button>
          ) : (
            <Button onClick={handleSaveLocal} disabled={!allAnswered}>
              Save diagnostic
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Interview Panel (unchanged) ─────────────────────────────────────

function InterviewPanel({
  module,
  onClose,
  onSave,
}: {
  module: ModuleSpec
  onClose: () => void
  onSave: (m: ModuleSpec) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(module.interview?.answers || {})
  const [risks, setRisks] = useState<string[]>(module.interview?.risks || [])
  const [notes, setNotes] = useState<string>(module.interview?.notes || "")

  const save = (): void => {
    const updated: ModuleSpec = {
      ...module,
      interview: { answers, risks, notes, completedAt: new Date().toISOString() },
    }
    updated.detail.unknownsToResolve = [...new Set([...updated.detail.unknownsToResolve, ...risks.filter(Boolean)])]
    onSave(updated)
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Interview -- {module.name}</h3>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        <p className="text-xs text-muted-foreground">Capture answers live. Save writes back into module unknowns.</p>
        {module.detail.expertQuestions.map((q, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{q.discipline}</Badge>
              <span className="text-sm">{q.q}</span>
            </div>
            <Input
              value={answers[q.q] || ""}
              onChange={(e) => setAnswers({ ...answers, [q.q]: e.target.value })}
              placeholder="Type expert's answer..."
            />
          </div>
        ))}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Risks / Unknowns discovered</h4>
          {risks.map((r, i) => (
            <Input key={i} value={r} onChange={(e) => setRisks(risks.map((x, ix) => (ix === i ? e.target.value : x)))} placeholder="Risk or uncertainty" />
          ))}
          <Button variant="outline" onClick={() => setRisks([...risks, ""])}>Add risk</Button>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">General notes</h4>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Freeform notes" />
        </div>
        <Button onClick={save}>Save interview → update module</Button>
      </CardContent>
    </Card>
  )
}

// ─── UI Components ───────────────────────────────────────────────────

/** Category config for Pill/Stats cards */
const PILL_CONFIG = {
  Assumptions: { icon: Lightbulb, colorClass: "bg-chart-1/10 text-chart-1" },
  Materials: { icon: Layers, colorClass: "bg-chart-2/10 text-chart-2" },
  "Manufacturing processes": { icon: Wrench, colorClass: "bg-chart-3/10 text-chart-3" },
  Validation: { icon: ShieldCheck, colorClass: "bg-chart-4/10 text-chart-4" },
} satisfies Record<string, { icon: React.ElementType; colorClass: string }>

function Pill({ label, items }: { label: string; items: string[] }) {
  const config = PILL_CONFIG[label as keyof typeof PILL_CONFIG] ?? { icon: Box, colorClass: "bg-muted text-muted-foreground" }
  const Icon = config.icon

  return (
    <Card className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", config.colorClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-display font-semibold text-foreground">{label}</h4>
          </div>
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {items.length}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No items yet</span>
          ) : (
            items.map((x, i) => (
              <span key={i} className="inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 text-xs text-foreground">
                {x}
              </span>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ModuleCard({
  m,
  onOpenInterview,
  onOpenDiagnostic,
}: {
  m: ModuleSpec
  onOpenInterview: (m: ModuleSpec) => void
  onOpenDiagnostic: (m: ModuleSpec) => void
}) {
  const [open, setOpen] = useState(false)
  const r = readinessFor(m)
  const isGating = m.isGatingModule || m.id === "react"
  const hasDiagnostic = !!(m.diagnostic?.questions?.length)
  const diagComplete = isGating
    ? !!(m.diagnostic?.derivedProcessClass || (m as Record<string, unknown>).reactionDiag && ((m as Record<string, unknown>).reactionDiag as ReactionDiagnostic)?.derivedProcessClass)
    : true
  const processClass = m.diagnostic?.derivedProcessClass || ((m as Record<string, unknown>).reactionDiag as ReactionDiagnostic | undefined)?.derivedProcessClass
  const accentColor = chipColor(m.id)

  return (
    <Card className={cn(
      "rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden",
      isGating && !diagComplete && "ring-1 ring-status-warning"
    )}>
      {/* Colored accent bar */}
      <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />

      <CardContent className="pt-5 space-y-4">
        {/* Module image header */}
        {m.imageUrl && m.imageStatus === "complete" && (
          <div className="rounded-xl overflow-hidden -mx-6 mb-2 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.imageUrl} alt={`Blueprint: ${m.name}`} className="w-full h-48 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-3 left-4">
              <span className="text-white text-sm font-semibold drop-shadow-sm">{m.name}</span>
            </div>
          </div>
        )}
        {m.imageStatus === "generating" && (
          <div className="rounded-xl -mx-6 mb-2 overflow-hidden">
            <Skeleton className="h-48 w-full" />
            <p className="text-xs text-muted-foreground text-center py-2">Generating blueprint...</p>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor + "18" }}>
                <Box className="h-4 w-4" style={{ color: accentColor }} />
              </div>
              <h3 className="text-base font-display font-semibold text-foreground truncate">{m.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{m.purpose}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isGating && hasDiagnostic ? (
              <Button
                size="sm"
                className={cn(
                  "rounded-full",
                  diagComplete
                    ? "bg-status-success-light text-status-success-dark hover:bg-status-success-light/80"
                    : "bg-international-orange hover:bg-international-orange-hover text-white"
                )}
                onClick={() => onOpenDiagnostic(m)}
              >
                {diagComplete ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Diagnostic set</>
                ) : (
                  <><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Run diagnostic</>
                )}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => onOpenInterview(m)}>
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Interview
              </Button>
            )}
          </div>
        </div>

        {/* Readiness progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${r.pct}%`,
                backgroundColor: r.pct === 100 ? "#10b981" : r.pct > 0 ? "#3b82f6" : "#94a3b8",
              }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
            {r.answered}/{r.total} answers
          </span>
          {r.risks > 0 && (
            <span className="text-[11px] text-status-warning-dark tabular-nums whitespace-nowrap">
              {r.risks} risks
            </span>
          )}
        </div>

        {/* IO grid */}
        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3 text-chart-2" />
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Inputs</h4>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.io.in.map((x, i) => (
                <span key={i} className="inline-block rounded bg-background px-1.5 py-0.5 text-xs text-foreground">{x}</span>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3 text-chart-3 rotate-180" />
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Outputs</h4>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.io.out.map((x, i) => (
                <span key={i} className="inline-block rounded bg-background px-1.5 py-0.5 text-xs text-foreground">{x}</span>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-chart-4" />
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Key parts</h4>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.keyParts.slice(0, 5).map((x, i) => (
                <span key={i} className="inline-block rounded bg-background px-1.5 py-0.5 text-xs text-foreground">{x}</span>
              ))}
              {m.keyParts.length > 5 && (
                <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">+{m.keyParts.length - 5}</span>
              )}
            </div>
          </div>
        </div>

        {processClass && (
          <div className="rounded-xl bg-status-success-light/30 border border-status-success/20 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />
            <div>
              <h4 className="text-xs font-semibold text-foreground">Derived process class</h4>
              <p className="text-sm text-foreground">{processClass}</p>
            </div>
          </div>
        )}

        {/* Deep dive toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="font-medium">{open ? "Hide details" : "Deep dive"}</span>
        </button>

        {/* Expandable detail section */}
        <div className={cn(
          "overflow-hidden transition-all duration-300",
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="rounded-xl bg-muted/30 border p-5 space-y-5">
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-chart-1" />
                  <h4 className="text-sm font-semibold text-foreground">What it is</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.detail.whatItIs}</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-chart-2" />
                  <h4 className="text-sm font-semibold text-foreground">Why it matters</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.detail.whyItMatters}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
                  <h4 className="text-sm font-semibold text-foreground">Common failure modes</h4>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {m.detail.commonFailureModes.map((x, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-warning mt-1.5 shrink-0" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-3.5 w-3.5 text-chart-5" />
                  <h4 className="text-sm font-semibold text-foreground">Unknowns to resolve</h4>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {m.detail.unknownsToResolve.map((x, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-chart-5 mt-1.5 shrink-0" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Questions to ask experts</h4>
              <div className="space-y-2">
                {m.detail.expertQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-background p-2.5">
                    <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">{q.discipline}</Badge>
                    <span className="text-sm text-foreground">{q.q}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Schematic ───────────────────────────────────────────────────────

function Schematic({
  spec,
  onOpenDiagnostic,
}: {
  spec: XRaySpec
  onOpenDiagnostic: (m: ModuleSpec) => void
}) {
  const modules = spec.modules || []
  const n = modules.length
  const lastScannedLabel = spec.lastScannedAt ? new Date(spec.lastScannedAt).toLocaleString() : "Not scanned yet"
  const [showVisual, setShowVisual] = useState(false)

  if (n === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Scan to populate the schematic.</p>
        </CardContent>
      </Card>
    )
  }

  const start = modules[0]
  const end = modules[n - 1]
  const mid = modules.slice(1, n - 1)
  const branchA = mid.filter((_, i) => i % 2 === 0)
  const branchB = mid.filter((_, i) => i % 2 === 1)

  const W = 1100, H = 360
  const x0 = 90, xMerge = W - 260
  const yTop = 120, yBot = 240
  const nodeW = 210, nodeH = 64

  const pos: Record<string, { x: number; y: number }> = {}
  pos[start.id] = { x: x0, y: (yTop + yBot) / 2 }
  pos[end.id] = { x: W - 90 - nodeW, y: (yTop + yBot) / 2 }

  const placeBranch = (arr: ModuleSpec[], y: number): void => {
    const span = xMerge - (x0 + nodeW + 40)
    const step = arr.length > 0 ? span / (arr.length + 1) : span
    arr.forEach((m, i) => { pos[m.id] = { x: x0 + nodeW + 40 + step * (i + 1), y } })
  }
  placeBranch(branchA, yTop)
  placeBranch(branchB, yBot)

  const mergeId = "__merge__"
  pos[mergeId] = { x: xMerge, y: (yTop + yBot) / 2 }

  const svgPath = (a: { x: number; y: number }, b: { x: number; y: number }): string => {
    const x1 = a.x + nodeW, y1 = a.y, x2 = b.x, y2 = b.y
    const dx = Math.max(90, (x2 - x1) * 0.55)
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  }

  const edges: Array<{ from: string; to: string }> = []
  branchA.forEach((m) => edges.push({ from: start.id, to: m.id }))
  branchB.forEach((m) => edges.push({ from: start.id, to: m.id }))
  if (branchA.length === 0 && branchB.length === 0) edges.push({ from: start.id, to: mergeId })
  branchA.forEach((m) => edges.push({ from: m.id, to: mergeId }))
  branchB.forEach((m) => edges.push({ from: m.id, to: mergeId }))
  edges.push({ from: mergeId, to: end.id })

  const gating = findGatingModule(modules)
  const diagComplete = isGatingDiagComplete(spec)
  const needsDiagBlock = !diagComplete

  // Module readiness status for node indicators
  const getNodeStatus = (m: ModuleSpec): "complete" | "needs-diagnostic" | "partial" | "not-started" => {
    const isGatingNode = m.isGatingModule || m.id === "react"
    if (isGatingNode && !diagComplete) return "needs-diagnostic"
    const r = readinessFor(m)
    if (r.pct === 100) return "complete"
    if (r.pct > 0) return "partial"
    return "not-started"
  }

  const statusDotColor = (status: ReturnType<typeof getNodeStatus>): string => {
    switch (status) {
      case "complete": return "#10b981"
      case "needs-diagnostic": return "#f59e0b"
      case "partial": return "#3b82f6"
      default: return "#94a3b8"
    }
  }

  // SVG fill colors are an allowed exception per color-consistency rules
  const renderNode = (m: ModuleSpec): React.ReactNode => {
    const p = pos[m.id]
    if (!p) return null
    const c = chipColor(m.id)
    const isGatingNode = m.isGatingModule || m.id === "react"
    const nodeNeedsDiag = isGatingNode && !diagComplete
    const status = getNodeStatus(m)

    return (
      <g
        key={m.id}
        className="cursor-pointer transition-transform"
        onClick={() => document.getElementById(`module-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        role="button"
        tabIndex={0}
      >
        <rect x={p.x} y={p.y - nodeH / 2} width={nodeW} height={nodeH} rx={16} fill="#fff" stroke="#e2e8f0" strokeWidth="1" />
        <rect x={p.x} y={p.y - nodeH / 2} width={10} height={nodeH} rx={10} fill={c} />
        {/* Status dot */}
        <circle cx={p.x + nodeW - 16} cy={p.y - nodeH / 2 + 16} r={5} fill={statusDotColor(status)} />
        <text x={p.x + 18} y={p.y - 8} fontSize="13" fill="#0f172a" fontWeight="600">{m.name}</text>
        <text x={p.x + 18} y={p.y + 10} fontSize="11" fill="#64748b">
          {m.purpose.length > 35 ? m.purpose.slice(0, 32) + "..." : m.purpose}
        </text>
        {isGatingNode && (
          <text x={p.x + 18} y={p.y + 26} fontSize="10" fill={nodeNeedsDiag ? "#B45309" : "#64748b"} fontWeight="500">
            {nodeNeedsDiag ? "⚠ Needs diagnostic" : `Class: ${getDerivedProcessClass(spec) || "set"}`}
          </text>
        )}
      </g>
    )
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-electric-blue rounded-full" />
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">X-Ray schematic</h3>
            </div>
            <p className="text-sm text-muted-foreground ml-[1.375rem]">
              Parallel branches run in parallel then merge. Click any node to jump to its detail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {spec.systemImageUrl && (
              <Button variant="outline" size="sm" onClick={() => setShowVisual((v) => !v)}>
                <ImageIcon className="h-4 w-4 mr-2" />
                {showVisual ? "Functional" : "Visual Blueprint"}
              </Button>
            )}
            <Badge variant="secondary" className="text-xs">
              <Box className="h-3 w-3 mr-1" />
              {n} modules
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {lastScannedLabel}
            </Badge>
          </div>
        </div>

        {needsDiagBlock && gating && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <div>
                <span className="font-semibold">Stop: {gating.name} undefined.</span>{" "}
                <span className="text-muted-foreground">Complete the diagnostic. Until then, supplier quotes will be unreliable.</span>
              </div>
              <Button onClick={() => onOpenDiagnostic(gating)} className="shrink-0 bg-international-orange hover:bg-international-orange-hover text-white">Run diagnostic</Button>
            </AlertDescription>
          </Alert>
        )}

        {showVisual && spec.systemImageUrl ? (
          <div className="rounded-xl overflow-hidden border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spec.systemImageUrl} alt="System diagram" className="w-full" />
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border bg-muted/20">
            <div className="w-full overflow-x-auto">
              <div style={{ minWidth: W }} className="p-6 relative">
                {/* Dot grid background pattern */}
                <div className="absolute inset-0 opacity-[0.4]" style={{
                  backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }} />
                <div className="relative">
                  {/* SVG fill colors are an allowed exception per color-consistency rules */}
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[280px]">
                    <defs>
                      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.08" />
                      </filter>
                    </defs>
                    <rect x="26" y="70" width={W - 52} height="230" rx="22" fill="#fff" fillOpacity="0.6" />
                    <text x="40" y="60" fontSize="10" fill="#94a3b8" fontWeight="600" letterSpacing="0.1em">
                      PARALLEL BUILD (DAG)
                    </text>
                    {edges.map((e, idx) => {
                      const a = pos[e.from]; const b = pos[e.to]
                      if (!a || !b) return null
                      const toModule = modules.find((m) => m.id === e.to)
                      const isIncomplete = toModule && getNodeStatus(toModule) === "needs-diagnostic"
                      return (
                        <path
                          key={idx}
                          d={svgPath(a, b)}
                          fill="none"
                          stroke={isIncomplete ? "#f59e0b" : "#cbd5e1"}
                          strokeWidth="2.5"
                          strokeDasharray={isIncomplete ? "8 4" : "none"}
                          className={isIncomplete ? "animate-[dash_1.5s_linear_infinite]" : ""}
                        />
                      )
                    })}
                    <g filter="url(#softShadow)">
                      {renderNode(start)}
                      {branchA.map(renderNode)}
                      {branchB.map(renderNode)}
                      <g key={mergeId}>
                        <rect x={pos[mergeId].x} y={pos[mergeId].y - nodeH / 2} width={nodeW} height={nodeH} rx={16} fill="#fff" stroke="#e2e8f0" strokeWidth="1" />
                        <rect x={pos[mergeId].x} y={pos[mergeId].y - nodeH / 2} width={10} height={nodeH} rx={10} fill="#94A3B8" />
                        <text x={pos[mergeId].x + 18} y={pos[mergeId].y - 6} fontSize="13" fill="#0f172a" fontWeight="600">Merge / Assembly</text>
                        <text x={pos[mergeId].x + 18} y={pos[mergeId].y + 14} fontSize="11" fill="#64748b">Interfaces, tolerances, integration</text>
                      </g>
                      {renderNode(end)}
                    </g>
                  </svg>
                </div>
                {/* Navigation buttons */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {modules.map((m) => {
                    const status = getNodeStatus(m)
                    return (
                      <Button
                        key={m.id}
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => document.getElementById(`module-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      >
                        <CircleDot className="h-3 w-3 mr-1.5" style={{ color: statusDotColor(status) }} />
                        {m.name}
                      </Button>
                    )
                  })}
                  {gating && !diagComplete && (
                    <Button
                      size="sm"
                      className="rounded-full bg-international-orange hover:bg-international-orange-hover text-white"
                      onClick={() => onOpenDiagnostic(gating)}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1.5" />
                      Run diagnostic
                    </Button>
                  )}
                </div>
                {/* Status legend */}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="font-medium">Status:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#10b981" }} />
                    Complete
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
                    In progress
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
                    Needs diagnostic
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#94a3b8" }} />
                    Not started
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Tab Views ───────────────────────────────────────────────────────

function XRayView({
  spec,
  setSpec,
  onScan,
  isScanning,
  onOpenInterview,
  onOpenDiagnostic,
}: {
  spec: XRaySpec
  setSpec: (s: XRaySpec) => void
  onScan: (idea: string) => void
  isScanning: boolean
  onOpenInterview: (m: ModuleSpec) => void
  onOpenDiagnostic: (m: ModuleSpec) => void
}) {
  const [localIdea, setLocalIdea] = useState(spec.idea)
  useEffect(() => setLocalIdea(spec.idea), [spec.idea])

  return (
    <div className="space-y-8">
      {/* Hero Idea Input */}
      <Card className="relative overflow-hidden rounded-xl shadow-sm">
        <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none opacity-[0.04]">
          <ScanLine className="w-full h-full text-international-orange" />
        </div>
        <CardContent className="pt-6 pb-6 space-y-5 relative">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-international-orange rounded-full" />
              <h3 className="text-xl font-display font-bold tracking-tight text-foreground">Your idea</h3>
            </div>
            <p className="text-sm text-muted-foreground ml-[1.375rem]">
              Describe your product concept and we&apos;ll decompose it into buildable modules, experts, and suppliers.
            </p>
          </div>
          <Textarea
            value={localIdea}
            onChange={(e) => { setLocalIdea(e.target.value); setSpec({ ...spec, idea: e.target.value }) }}
            disabled={isScanning}
            rows={3}
            className="resize-none text-base"
            placeholder="e.g. A brine machine that extracts salts from desalination brine"
          />
          <Button
            onClick={() => onScan(localIdea)}
            disabled={isScanning}
            className="w-full bg-international-orange hover:bg-international-orange-hover text-white h-11"
          >
            {isScanning ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Scanning your idea...</>
            ) : (
              <><Zap className="h-4 w-4 mr-2" />Scan &amp; decompose</>
            )}
          </Button>
          {spec.function && (
            <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4 border-l-4 border-l-international-orange/40">
              <p className="text-sm text-foreground leading-relaxed italic">{spec.function}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {isScanning && (
        <div className="space-y-4">
          <Skeleton className="h-[280px] rounded-xl" />
          <div className="grid lg:grid-cols-2 gap-6">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      )}

      {!isScanning && spec.modules.length > 0 && (
        <>
          <Schematic spec={spec} onOpenDiagnostic={onOpenDiagnostic} />

          <div className="grid lg:grid-cols-2 gap-6">
            <Pill label="Assumptions" items={spec.assumptions} />
            <Pill label="Materials" items={spec.materials} />
            <Pill label="Manufacturing processes" items={spec.processes} />
            <Pill label="Validation" items={spec.validation} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Modules (sub-assemblies)</h2>
              <Badge variant="secondary">Gating module has guided diagnostic; others use interviews</Badge>
            </div>
            <div className="space-y-4">
              {spec.modules.map((m) => (
                <div key={m.id} id={`module-${m.id}`}>
                  <ModuleCard m={m} onOpenInterview={onOpenInterview} onOpenDiagnostic={onOpenDiagnostic} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!isScanning && spec.modules.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-foreground">
              No modules yet. Tap <span className="font-semibold">Scan</span> to generate the X-Ray.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PeopleView({ spec, scanId }: { spec: XRaySpec; scanId: string | null }) {
  const [people, setPeople] = useState<PersonMatch[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const processClass = getDerivedProcessClass(spec)

  const loadPeople = useCallback((forceRefresh = false) => {
    if (spec.modules.length === 0) return
    setIsLoading(true)
    matchPeopleAction(scanId, spec.modules, forceRefresh)
      .then((result) => {
        if ("people" in result) setPeople(result.people)
        else console.error("[PeopleView]", result.error)
      })
      .catch((err) => console.error("[PeopleView] Error:", err))
      .finally(() => { setIsLoading(false); setHasLoaded(true) })
  }, [scanId, spec.modules])

  useEffect(() => {
    if (hasLoaded) return
    loadPeople(false)
  }, [loadPeople, hasLoaded])

  // Group by discipline
  const grouped = useMemo(() => {
    const map = new Map<string, PersonMatch[]>()
    for (const p of people) {
      const existing = map.get(p.matchedDiscipline) || []
      existing.push(p)
      map.set(p.matchedDiscipline, existing)
    }
    return map
  }, [people])

  return (
    <div className="space-y-8">
      {/* Header card */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="w-1 h-7 bg-chart-2 rounded-full" />
                <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">Matched experts</h3>
              </div>
              <p className="text-sm text-muted-foreground ml-[1.375rem]">
                Derived from X-Ray modules{processClass ? ` and process class: ${processClass}` : ""}.
                {!processClass && " Run the diagnostic to sharpen matching."}
              </p>
            </div>
            {hasLoaded && (
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => loadPeople(true)} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      )}

      {!isLoading && people.length === 0 && hasLoaded && (
        <EmptyState
          title="No matching experts found"
          description="Try scanning a different idea or check that marketplace listings exist in your foundry."
          action={
            <Button variant="outline" onClick={() => loadPeople(true)}>
              <Users className="h-4 w-4 mr-2" />
              Retry matching
            </Button>
          }
        />
      )}

      {Array.from(grouped.entries()).map(([discipline, matches]) => (
        <div key={discipline} className="space-y-4">
          {/* Discipline section header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-chart-3 rounded-full" />
              <div>
                <h3 className="text-base font-display font-semibold text-foreground">{discipline} expertise</h3>
                <p className="text-xs text-muted-foreground">Because modules include {discipline} questions</p>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">Top {Math.min(matches.length, 3)}</Badge>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {matches.slice(0, 3).map((p) => {
              const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
              const matchPct = Math.round(p.matchScore * 100)

              return (
                <Card key={p.id} className="rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                  <CardContent className="pt-5 pb-5 space-y-3">
                    <div className="flex items-start gap-3">
                      {/* Initials avatar */}
                      <div className="h-10 w-10 rounded-full bg-chart-2/15 text-chart-2 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                          {p.isVerified && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.role}</p>
                      </div>
                    </div>
                    {/* Match score bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-chart-2"
                          style={{ width: `${matchPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums font-medium">{matchPct}%</span>
                    </div>
                    {/* Tags */}
                    {p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.tags.slice(0, 3).map((t, i) => (
                          <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
                        ))}
                        {p.tags.length > 3 && (
                          <span className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">+{p.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium text-foreground">{p.rate}</span>
                      <Button variant="ghost" size="sm" className="h-8 px-2 rounded-full">
                        <Bookmark className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function SupplierView({ spec, setSpec, scanId }: { spec: XRaySpec; setSpec: (s: XRaySpec) => void; scanId: string | null }) {
  const processClass = getDerivedProcessClass(spec)
  const diagComplete = isGatingDiagComplete(spec)
  const [suppliersByModule, setSuppliersByModule] = useState<Record<string, SupplierMatch[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  const loadSuppliers = useCallback((forceRefresh = false) => {
    if (!diagComplete || spec.modules.length === 0) return
    setIsLoading(true)
    matchSuppliersAction(scanId, spec.modules, diagComplete, forceRefresh)
      .then((result) => {
        if ("suppliersByModule" in result) setSuppliersByModule(result.suppliersByModule)
        else console.error("[SupplierView]", result.error)
      })
      .catch((err) => console.error("[SupplierView] Error:", err))
      .finally(() => { setIsLoading(false); setHasLoaded(true) })
  }, [scanId, spec.modules, diagComplete])

  useEffect(() => {
    if (!diagComplete || hasLoaded) return
    loadSuppliers(false)
  }, [diagComplete, loadSuppliers, hasLoaded])

  const assign = (moduleId: string, supplierName: string): void => {
    setSpec({ ...spec, modules: spec.modules.map((m) => (m.id === moduleId ? { ...m, supplier: supplierName } : m)) })
  }

  return (
    <div className="space-y-6">
      {!diagComplete ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-semibold">Supplier matching blocked</span> -- complete the diagnostic first. This preserves transparency: no bespoke negotiation, just clarity-first quoting.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Supplier matching</h3>
                <p className="text-sm text-foreground">Conditioned on process class: {processClass}.</p>
                <p className="text-xs text-muted-foreground mt-1">This preserves transparency: no bespoke negotiation, just clarity-first quoting.</p>
              </div>
              {hasLoaded && (
                <Button variant="ghost" size="sm" onClick={() => loadSuppliers(true)} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <Skeleton className="h-48 rounded-xl" />}

      {spec.modules.map((m) => {
        const suppliers = suppliersByModule[m.id] || []
        return (
          <Card key={m.id}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">{m.name}</h3>
                  <p className="text-xs text-muted-foreground">Based on {m.keyParts.slice(0, 3).join(", ")}</p>
                </div>
                {m.supplier ? <Badge>Selected: {m.supplier}</Badge> : <Badge variant="secondary">Pick 1</Badge>}
              </div>
              <div className={"grid md:grid-cols-3 gap-4 " + (!diagComplete ? "opacity-50 pointer-events-none" : "")}>
                {suppliers.length > 0 ? suppliers.slice(0, 3).map((s) => (
                  <Card
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    role="button"
                    tabIndex={0}
                    onClick={() => assign(m.id, s.name)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") assign(m.id, s.name) }}
                  >
                    <CardContent className="pt-6">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.capabilities.join(" • ")}</p>
                      <p className="text-xs text-muted-foreground">Lead {s.typicalLeadWeeks}w • Warranty {s.warrantyMonths}m</p>
                      {s.matchReason && <p className="text-xs text-muted-foreground mt-1">{s.matchReason}</p>}
                    </CardContent>
                  </Card>
                )) : (
                  <p className="text-xs text-muted-foreground col-span-3">
                    {diagComplete ? "No matching suppliers found" : "Complete diagnostic to unlock"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function RFQView({ spec }: { spec: XRaySpec }) {
  const total = spec.modules.reduce((s, m) => s + (m.estCost ?? 0), 0)
  const processClass = getDerivedProcessClass(spec)

  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <h3 className="text-base font-semibold">RFQ</h3>
        <p className="text-xs text-muted-foreground">(Coming soon) Generate a spec pack from diagnostic + interviews + selected suppliers.</p>
        <p className="text-sm">Process class: <span className="font-semibold">{processClass || "(unset)"}</span></p>
        {total > 0 && <p className="text-sm">Total estimated: £{Math.round(total).toLocaleString()}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Props ───────────────────────────────────────────────────────────

export interface CompanyScanDemoProps {
  /** Restored spec from localStorage or DB */
  initialSpec?: XRaySpec
  /** Restored active tab */
  initialTab?: string
  /** Scan ID if loaded from DB */
  initialScanId?: string
  /** Called whenever spec changes */
  onSpecChange?: (spec: XRaySpec) => void
  /** Called whenever active tab changes */
  onTabChange?: (tab: string) => void
  /** Hide the demo's internal heading */
  hideHeader?: boolean
}

// ─── Main Component ──────────────────────────────────────────────────

export default function ForgeOS_CompanyScan_Demo({
  initialSpec,
  initialTab,
  initialScanId,
  onSpecChange,
  onTabChange,
  hideHeader = false,
}: CompanyScanDemoProps) {
  const [spec, setSpecInternal] = useState<XRaySpec>(() =>
    initialSpec ?? newEmptySpec("A brine machine that extracts salts from desalination brine")
  )
  const [scanId, setScanId] = useState<string | null>(initialScanId ?? null)
  const [isScanning, setIsScanning] = useState(false)
  const [interviewModule, setInterviewModule] = useState<ModuleSpec | null>(null)
  const [diagnosticModule, setDiagnosticModule] = useState<ModuleSpec | null>(null)

  const setSpec = useCallback((next: XRaySpec) => {
    setSpecInternal(next)
    onSpecChange?.(next)
  }, [onSpecChange])

  // Persist changes to DB when scanId exists
  const persistSpec = useCallback(async (nextSpec: XRaySpec) => {
    if (!scanId) return
    try {
      await updateScanSpecAction(scanId, nextSpec)
    } catch (error) {
      console.warn("[XRay] Failed to persist spec:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId])

  const onScan = useCallback(async (idea: string) => {
    const trimmed = (idea || "").trim() || "New machine concept"
    setIsScanning(true)
    try {
      const result = await scanIdeaAction(trimmed)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setScanId(result.scanId)
      setSpec(result.spec)
      toast.success(`Scan complete: ${result.spec.modules.length} modules identified`)

      // Trigger image generation in background
      generateImagesAction(result.scanId)
        .then((imgResult) => {
          if ("spec" in imgResult) {
            setSpec(imgResult.spec)
          }
        })
        .catch((err) => {
          console.warn("[XRay] Image generation failed:", err instanceof Error ? err.message : "Unknown")
        })
    } catch (error) {
      toast.error("Scan failed. Check that OPENAI_API_KEY is configured.")
      console.error("[XRay] Scan error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsScanning(false)
    }
  }, [setSpec])

  // Auto-scan on mount if no initial spec (for fresh visits)
  useEffect(() => {
    if (!initialSpec && spec.modules.length === 0) {
      // Don't auto-scan with AI -- just show the mock as a starting point
      const mockSpec = mockScanIdea(spec.idea)
      setSpecInternal(mockSpec)
      onSpecChange?.(mockSpec)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveInterview = useCallback((m: ModuleSpec) => {
    const next = { ...spec, modules: spec.modules.map((x) => (x.id === m.id ? m : x)) }
    setSpec(next)
    setInterviewModule(null)
    persistSpec(next)
  }, [spec, setSpec, persistSpec])

  const saveDiagnostic = useCallback((m: ModuleSpec) => {
    const next = { ...spec, modules: spec.modules.map((x) => (x.id === m.id ? m : x)) }
    setSpec(next)
    setDiagnosticModule(null)
    persistSpec(next)
  }, [spec, setSpec, persistSpec])

  return (
    <div className="space-y-8">
      {!hideHeader && <h2 className="text-2xl font-semibold">ForgeOS</h2>}

      <Tabs defaultValue={initialTab ?? "A"} onValueChange={onTabChange}>
        <TabsList className="bg-muted/50 p-1 rounded-xl border border-muted h-auto">
          <TabsTrigger value="A" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2.5">
            <ScanLine className="h-4 w-4" />
            <span>X-Ray</span>
            {spec.modules.length > 0 && (
              <span className="ml-1 inline-block w-2 h-2 rounded-full bg-status-success" />
            )}
          </TabsTrigger>
          <TabsTrigger value="B" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2.5">
            <Users className="h-4 w-4" />
            <span>People</span>
          </TabsTrigger>
          <TabsTrigger value="C" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2.5">
            <Building2 className="h-4 w-4" />
            <span>Suppliers</span>
            {!isGatingDiagComplete(spec) && (
              <Lock className="h-3 w-3 text-muted-foreground" />
            )}
          </TabsTrigger>
          <TabsTrigger value="D" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2.5">
            <FileText className="h-4 w-4" />
            <span>RFQ</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="A">
          <XRayView
            spec={spec}
            setSpec={setSpec}
            onScan={onScan}
            isScanning={isScanning}
            onOpenInterview={setInterviewModule}
            onOpenDiagnostic={setDiagnosticModule}
          />
        </TabsContent>

        <TabsContent value="B">
          <PeopleView spec={spec} scanId={scanId} />
        </TabsContent>

        <TabsContent value="C">
          <SupplierView spec={spec} setSpec={setSpec} scanId={scanId} />
        </TabsContent>

        <TabsContent value="D">
          <RFQView spec={spec} />
        </TabsContent>
      </Tabs>

      {diagnosticModule && (
        <DiagnosticPanel
          module={diagnosticModule}
          scanId={scanId}
          onClose={() => setDiagnosticModule(null)}
          onSave={saveDiagnostic}
        />
      )}

      {interviewModule && (
        <InterviewPanel
          module={interviewModule}
          onClose={() => setInterviewModule(null)}
          onSave={saveInterview}
        />
      )}
    </div>
  )
}
