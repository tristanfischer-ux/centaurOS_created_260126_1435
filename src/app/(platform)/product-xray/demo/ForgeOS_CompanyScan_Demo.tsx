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
  ArrowDown,
  Box,
  ScanLine,
  Users,
  Building2,
  FileText,
  Lock,
  CheckCircle2,
  Clock,
  Star,
  CircleDot,
  Package,
  FlaskConical,
  Truck,
  ClipboardCheck,
  Gauge,
  HelpCircle,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { MarketCardV2 } from "@/app/(platform)/marketplace-v2/components/MarketCardV2"
import type { MarketplaceListing } from "@/actions/marketplace"

import {
  scanIdeaAction,
  deriveProcessClassAction,
  updateScanSpecAction,
  matchPeopleAction,
  matchSuppliersAction,
  generateImagesAction,
} from "@/actions/xray"

import { XRaySchematic } from "../components/xray-schematic"

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
    <Card className="rounded-xl shadow-sm border-status-warning/30">
      <div className="h-1 w-full bg-status-warning rounded-t-xl" />
      <CardContent className="pt-5 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-status-warning rounded-full" />
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">Guided diagnostic</h3>
            </div>
            <p className="text-sm text-muted-foreground ml-[1.375rem]">
              Answer {diagnostic.questions.length} decisive questions for <span className="font-medium text-foreground">{module.name}</span>. AI derives the likely process class.
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onClose}>Close</Button>
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
    <Card className="rounded-xl shadow-sm">
      <div className="h-1 w-full bg-chart-2 rounded-t-xl" />
      <CardContent className="pt-5 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-chart-2 rounded-full" />
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">Expert interview</h3>
            </div>
            <p className="text-sm text-muted-foreground ml-[1.375rem]">
              Capture answers for <span className="font-medium text-foreground">{module.name}</span>. Save writes back into module unknowns.
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onClose}>Close</Button>
        </div>
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
        <Button onClick={save} className="bg-international-orange hover:bg-international-orange-hover text-white">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Save interview
        </Button>
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
  const derivedRisks = m.diagnostic?.derivedRisks || []

  // Group expert questions by discipline for organized display
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
    <Card className={cn(
      "rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden",
      isGating && !diagComplete && "ring-1 ring-status-warning"
    )}>
      {/* Colored accent bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />

      <CardContent className="pt-5 space-y-5">
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

        {/* ── SECTION 1: Header ────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor + "18" }}>
                <Box className="h-4 w-4" style={{ color: accentColor }} />
              </div>
              <h3 className="text-base font-display font-semibold text-foreground truncate">{m.name}</h3>
              {isGating && (
                <Badge variant={diagComplete ? "success" : "warning"} className="text-[10px] shrink-0">
                  {diagComplete ? "Gating set" : "Gating"}
                </Badge>
              )}
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

        {/* ── SECTION 2: Quick Stats Row ───────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Readiness progress */}
          <div className="flex items-center gap-2 flex-1 min-w-[160px]">
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
          </div>
          {/* Lead time */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="font-medium">{m.requirements.leadWeeks}w lead</span>
          </div>
          {/* Key parts count */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Package className="h-3 w-3" />
            <span>{m.keyParts.length} parts</span>
          </div>
          {/* Tests count */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ClipboardCheck className="h-3 w-3" />
            <span>{m.tests.length} tests</span>
          </div>
          {/* Risk indicators */}
          {(m.detail.commonFailureModes.length > 0 || m.detail.unknownsToResolve.length > 0) && (
            <div className="flex items-center gap-1.5 text-[11px] text-status-warning-dark">
              <AlertTriangle className="h-3 w-3" />
              <span>{m.detail.commonFailureModes.length} risks, {m.detail.unknownsToResolve.length} unknowns</span>
            </div>
          )}
        </div>

        {/* ── SECTION 3: Technical Description ─────────────────────── */}
        <div className="rounded-xl bg-muted/30 border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-chart-1 shrink-0" />
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Technical description</h4>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{m.detail.whatItIs}</p>
          <p className="text-sm text-muted-foreground leading-relaxed italic">{m.detail.whyItMatters}</p>
        </div>

        {/* ── SECTION 4: Process Flow (IO) ─────────────────────────── */}
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Gauge className="h-3.5 w-3.5 text-chart-2" />
            Process flow
          </h4>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Inputs */}
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3.5 w-3.5 text-chart-2 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {m.io.in.map((x, i) => (
                  <span key={i} className="inline-flex items-center rounded-md bg-chart-2/10 border border-chart-2/20 px-2 py-0.5 text-xs font-medium text-foreground">{x}</span>
                ))}
              </div>
            </div>
            {/* Arrow */}
            <ArrowDown className="h-4 w-4 text-muted-foreground rotate-[-90deg] shrink-0" />
            {/* Module box */}
            <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border-2" style={{ borderColor: accentColor + "40", backgroundColor: accentColor + "08" }}>
              <Box className="h-3.5 w-3.5" style={{ color: accentColor }} />
              <span className="text-xs font-semibold text-foreground">{m.name}</span>
            </div>
            {/* Arrow */}
            <ArrowDown className="h-4 w-4 text-muted-foreground rotate-[-90deg] shrink-0" />
            {/* Outputs */}
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

        {/* ── SECTION 5: Key Components ────────────────────────────── */}
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

        {/* ── SECTION 6: Acceptance Tests ──────────────────────────── */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheck className="h-3.5 w-3.5 text-chart-3" />
            Acceptance tests ({m.tests.length})
          </h4>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {m.tests.map((test, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/30 border px-2.5 py-1.5">
                <CheckCircle2 className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-xs text-foreground">{test}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 7: Procurement ───────────────────────────────── */}
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

        {/* ── SECTION 8: Risk Summary ──────────────────────────────── */}
        {(m.detail.commonFailureModes.length > 0 || derivedRisks.length > 0) && (
          <div className="rounded-xl bg-status-warning-light/20 border border-status-warning/15 p-4 space-y-3">
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
            <FlaskConical className="h-5 w-5 text-status-success shrink-0" />
            <div>
              <h4 className="text-xs font-semibold text-foreground">Derived process class</h4>
              <p className="text-sm font-medium text-foreground">{processClass}</p>
            </div>
          </div>
        )}

        {/* ── SECTION 9: Deep Dive Toggle ──────────────────────────── */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="font-medium">{open ? "Hide engineering detail" : "Engineering detail"}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {m.detail.unknownsToResolve.length} unknowns &middot; {m.detail.expertQuestions.length} expert questions
          </span>
        </button>

        {/* Expandable deep dive */}
        <div className={cn(
          "overflow-hidden transition-all duration-300",
          open ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="rounded-xl bg-muted/30 border p-5 space-y-6">

            {/* Unknowns to resolve */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-3.5 w-3.5 text-chart-5" />
                <h4 className="text-sm font-semibold text-foreground">Unknowns to resolve before design</h4>
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

            {/* Expert questions by discipline */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-chart-1" />
                <h4 className="text-sm font-semibold text-foreground">Expert questions by discipline</h4>
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
                        <span className="text-sm text-foreground">{q.q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Old Schematic removed — now uses XRaySchematic from components/xray-schematic.tsx ──

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _OldSchematic({
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

  // Dynamic sizing based on module count to prevent overlap
  const minNodeSpacing = 240 // Minimum space per node
  const maxBranchLength = Math.max(branchA.length, branchB.length)
  const nodeW = 210, nodeH = 64
  const x0 = 90
  
  // Calculate required width to prevent overlap
  const W = Math.max(1100, x0 + nodeW + (maxBranchLength + 2) * minNodeSpacing + nodeW + 90)
  const H = 360
  const xMerge = W - 260
  const yTop = 120, yBot = 240

  const pos: Record<string, { x: number; y: number }> = {}
  pos[start.id] = { x: x0, y: (yTop + yBot) / 2 }
  pos[end.id] = { x: W - 90 - nodeW, y: (yTop + yBot) / 2 }

  const placeBranch = (arr: ModuleSpec[], y: number): void => {
    const span = xMerge - (x0 + nodeW + 40)
    const step = arr.length > 0 ? Math.max(minNodeSpacing, span / (arr.length + 1)) : span
    arr.forEach((m, i) => { 
      const xPos = x0 + nodeW + 40 + step * (i + 1)
      pos[m.id] = { x: Math.min(xPos, xMerge - nodeW - 40), y } 
    })
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
  isGeneratingImages,
  onOpenInterview,
  onOpenDiagnostic,
  scanId,
  onGenerateImages,
}: {
  spec: XRaySpec
  setSpec: (s: XRaySpec) => void
  onScan: (idea: string) => void
  isScanning: boolean
  isGeneratingImages: boolean
  onOpenInterview: (m: ModuleSpec) => void
  onOpenDiagnostic: (m: ModuleSpec) => void
  scanId: string | null
  onGenerateImages: () => void
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
              Describe your product concept and we&apos;ll reverse engineer it into buildable modules, experts, and suppliers.
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
              <><Zap className="h-4 w-4 mr-2" />Scan &amp; reverse engineer</>
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
        <div className="space-y-6">
          <Skeleton className="h-[320px] rounded-xl" />
          <div className="grid lg:grid-cols-2 gap-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {!isScanning && spec.modules.length > 0 && (
        <>
          {isGeneratingImages && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <span>Generating AI blueprint images for modules...</span>
                  <span className="text-xs text-muted-foreground">This may take 30-60 seconds</span>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Generate images button — visible when scan exists but no images */}
          {scanId && !isGeneratingImages && spec.modules.length > 0 &&
            !spec.modules.some((m) => m.imageStatus === "complete") && (
            <div className="flex items-center justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateImages}
                className="rounded-full"
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                Generate blueprint images
              </Button>
            </div>
          )}

          <XRaySchematic spec={spec} onOpenDiagnostic={onOpenDiagnostic} />

          <div className="grid lg:grid-cols-2 gap-4">
            <Pill label="Assumptions" items={spec.assumptions} />
            <Pill label="Materials" items={spec.materials} />
            <Pill label="Manufacturing processes" items={spec.processes} />
            <Pill label="Validation" items={spec.validation} />
          </div>

          {/* Modules section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-7 bg-international-orange rounded-full" />
                <div>
                  <h2 className="text-lg font-display font-semibold tracking-tight text-foreground">
                    Modules
                  </h2>
                  <p className="text-xs text-muted-foreground">Sub-assemblies that make up your product</p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {spec.modules.length} modules
              </Badge>
            </div>
            <div className="space-y-5">
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
        <EmptyState
          title="No modules yet"
          description="Describe your product idea above and hit Scan to reverse engineer it into buildable modules."
          action={
            <Button className="bg-international-orange hover:bg-international-orange-hover text-white" onClick={() => onScan(localIdea)}>
              <Zap className="h-4 w-4 mr-2" />
              Scan now
            </Button>
          }
        />
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

  /** Convert a PersonMatch to a MarketplaceListing for MarketCardV2 */
  const toMarketplaceListing = useCallback((p: PersonMatch): MarketplaceListing => {
    if (p.listing) {
      return p.listing as MarketplaceListing
    }
    // Fallback for provider profiles without a full listing
    return {
      id: p.id,
      category: "People",
      subcategory: p.role,
      title: p.name,
      description: p.tags.join(", "),
      attributes: {
        rate: p.rate,
        expertise: p.tags,
        skills: p.tags,
      },
      image_url: null,
      is_verified: p.isVerified,
    }
  }, [])

  const handleViewDetail = useCallback((listing: MarketplaceListing) => {
    toast.info(`Opening ${listing.title} profile`)
  }, [])

  const handleSaveToggle = useCallback((id: string) => {
    toast.success("Saved to favorites")
    // Save state not persisted in X-Ray context — placeholder
    void id
  }, [])

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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
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
            <Badge variant="secondary" className="text-xs">{matches.length} match{matches.length !== 1 ? "es" : ""}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {matches.slice(0, 6).map((p) => (
              <MarketCardV2
                key={`${p.id}-${p.matchedDiscipline}`}
                listing={toMarketplaceListing(p)}
                isSaved={false}
                onSaveToggle={handleSaveToggle}
                onViewDetail={handleViewDetail}
              />
            ))}
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
    <div className="space-y-8">
      {!diagComplete ? (
        <EmptyState
          title="Supplier matching locked"
          description="Complete the gating diagnostic first. This preserves transparency: no bespoke negotiation, just clarity-first quoting."
          action={
            <Button className="bg-international-orange hover:bg-international-orange-hover text-white">
              <Lock className="h-4 w-4 mr-2" />
              Go to X-Ray tab to run diagnostic
            </Button>
          }
        />
      ) : (
        <>
          {/* Header card */}
          <Card className="rounded-xl shadow-sm">
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-7 bg-chart-4 rounded-full" />
                    <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">Supplier matching</h3>
                  </div>
                  <p className="text-sm text-muted-foreground ml-[1.375rem]">
                    Conditioned on process class: <span className="font-medium text-foreground">{processClass}</span>. Transparency-first quoting.
                  </p>
                </div>
                {hasLoaded && (
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => loadSuppliers(true)} disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {isLoading && (
            <div className="grid md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          )}

          {spec.modules.map((m) => {
            const suppliers = suppliersByModule[m.id] || []
            const accentColor = chipColor(m.id)
            const isSelected = (name: string): boolean => m.supplier === name

            return (
              <div key={m.id} className="space-y-4">
                {/* Module section header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accentColor + "18" }}>
                      <Box className="h-4 w-4" style={{ color: accentColor }} />
                    </div>
                    <div>
                      <h3 className="text-base font-display font-semibold text-foreground">{m.name}</h3>
                      <p className="text-xs text-muted-foreground">{m.keyParts.slice(0, 3).join(", ")}</p>
                    </div>
                  </div>
                  {m.supplier ? (
                    <Badge className="bg-status-success-light text-status-success-dark">
                      <CheckCircle2 className="h-3 w-3 mr-1" />{m.supplier}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Select a supplier</Badge>
                  )}
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {suppliers.length > 0 ? suppliers.slice(0, 3).map((s) => {
                    const initials = s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                    const selected = isSelected(s.name)

                    return (
                      <Card
                        key={s.id}
                        className={cn(
                          "cursor-pointer rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
                          selected && "ring-2 ring-international-orange border-international-orange"
                        )}
                        role="button"
                        tabIndex={0}
                        onClick={() => assign(m.id, s.name)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") assign(m.id, s.name) }}
                      >
                        <CardContent className="pt-5 pb-5 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-lg bg-chart-4/15 text-chart-4 flex items-center justify-center text-sm font-semibold shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm text-foreground truncate">{s.name}</p>
                                {s.isVerified && <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />}
                                {selected && <CheckCircle2 className="h-3.5 w-3.5 text-international-orange shrink-0" />}
                              </div>
                              <p className="text-xs text-muted-foreground">{s.supplierType}</p>
                            </div>
                          </div>
                          {/* Capability tags */}
                          <div className="flex flex-wrap gap-1">
                            {s.capabilities.slice(0, 3).map((c, i) => (
                              <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{c}</span>
                            ))}
                            {s.capabilities.length > 3 && (
                              <span className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">+{s.capabilities.length - 3}</span>
                            )}
                          </div>
                          {/* Lead time and warranty */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{s.typicalLeadWeeks}w lead</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              <span>{s.warrantyMonths}m warranty</span>
                            </div>
                          </div>
                          {s.matchReason && (
                            <p className="text-xs text-muted-foreground italic">{s.matchReason}</p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  }) : (
                    <p className="text-sm text-muted-foreground col-span-3 py-4 text-center">
                      No matching suppliers found for this module.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function RFQView({ spec }: { spec: XRaySpec }) {
  const total = spec.modules.reduce((s, m) => s + (m.estCost ?? 0), 0)
  const processClass = getDerivedProcessClass(spec)

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 pb-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 bg-chart-5 rounded-full" />
          <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">Request for Quotation</h3>
        </div>
        <div className="rounded-xl bg-muted/30 border p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Coming soon</p>
              <p className="text-xs text-muted-foreground">Generate a spec pack from diagnostic + interviews + selected suppliers.</p>
            </div>
          </div>
          <div className="flex items-center gap-6 pt-2">
            <div>
              <p className="text-xs text-muted-foreground">Process class</p>
              <p className="text-sm font-semibold text-foreground">{processClass || "(unset)"}</p>
            </div>
            {total > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Estimated total</p>
                <p className="text-sm font-semibold text-foreground">£{Math.round(total).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
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
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
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

      // Trigger image generation in background with user feedback
      setIsGeneratingImages(true)
      toast.info("Generating blueprint images...")
      generateImagesAction(result.scanId)
        .then((imgResult) => {
          if ("spec" in imgResult) {
            setSpec(imgResult.spec)
            const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
            const total = imgResult.spec.modules.length
            if (successCount > 0) {
              toast.success(`Generated ${successCount}/${total} module images`)
            }
            if (imgResult.spec.systemImageStatus === "complete") {
              toast.success("System diagram generated")
            }
          } else {
            toast.error(imgResult.error || "Image generation failed")
          }
        })
        .catch((err) => {
          toast.error("Image generation failed: " + (err instanceof Error ? err.message : "Unknown error"))
          console.error("[XRay] Image generation error:", err)
        })
        .finally(() => {
          setIsGeneratingImages(false)
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
            isGeneratingImages={isGeneratingImages}
            onOpenInterview={setInterviewModule}
            onOpenDiagnostic={setDiagnosticModule}
            scanId={scanId}
            onGenerateImages={() => {
              if (!scanId) {
                toast.error("Save a scan first before generating images")
                return
              }
              setIsGeneratingImages(true)
              toast.info("Generating blueprint images...")
              generateImagesAction(scanId)
                .then((imgResult) => {
                  if ("spec" in imgResult) {
                    setSpec(imgResult.spec)
                    const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
                    if (successCount > 0) toast.success(`Generated ${successCount} module images`)
                    if (imgResult.spec.systemImageStatus === "complete") toast.success("System diagram generated")
                  } else {
                    toast.error(imgResult.error || "Image generation failed")
                  }
                })
                .catch((err) => {
                  toast.error("Image generation failed: " + (err instanceof Error ? err.message : "Unknown error"))
                  console.error("[XRay] Image generation error:", err)
                })
                .finally(() => setIsGeneratingImages(false))
            }}
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
