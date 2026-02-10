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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Loader2, ImageIcon } from "lucide-react"
import { toast } from "sonner"

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

function Pill({ label, items }: { label: string; items: string[] }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <h4 className="text-sm font-semibold">{label}</h4>
        <div className="flex flex-wrap gap-2">
          {items.length === 0 ? (
            <span className="text-xs text-muted-foreground">--</span>
          ) : (
            items.map((x, i) => (<Badge key={i} variant="secondary">{x}</Badge>))
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

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Module image header */}
        {m.imageUrl && m.imageStatus === "complete" && (
          <div className="rounded-t-lg overflow-hidden -mx-6 -mt-6 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.imageUrl} alt={`Blueprint: ${m.name}`} className="w-full h-48 object-cover" />
          </div>
        )}
        {m.imageStatus === "generating" && (
          <div className="rounded-t-lg -mx-6 -mt-6 mb-4">
            <Skeleton className="h-48 w-full rounded-t-lg" />
            <p className="text-xs text-muted-foreground text-center py-2">Generating blueprint...</p>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{m.name}</h3>
            <p className="text-xs text-muted-foreground">{m.purpose}</p>
          </div>
          <div className="flex items-center gap-2">
            {isGating && (diagComplete ? <Badge>Diagnostic set</Badge> : <Badge variant="secondary">Needs diagnostic</Badge>)}
            <Badge variant="secondary">Answers {r.answered}/{r.total} • Risks {r.risks}</Badge>
            <Button variant="outline" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Deep dive"}
            </Button>
            {isGating && hasDiagnostic ? (
              <Button onClick={() => onOpenDiagnostic(m)}>Diagnostic</Button>
            ) : (
              <Button variant="outline" onClick={() => onOpenInterview(m)}>Interview</Button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-xs font-semibold">Inputs</h4>
            <p className="text-xs text-muted-foreground">{m.io.in.join(", ")}</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-xs font-semibold">Outputs</h4>
            <p className="text-xs text-muted-foreground">{m.io.out.join(", ")}</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-xs font-semibold">Key parts</h4>
            <p className="text-xs text-muted-foreground">
              {m.keyParts.slice(0, 4).join(", ")}
              {m.keyParts.length > 4 ? "…" : ""}
            </p>
          </div>
        </div>

        {processClass && (
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-sm font-semibold">Derived process class</h4>
            <p className="text-sm text-foreground">{processClass}</p>
          </div>
        )}

        {open && (
          <div className="rounded-lg bg-muted p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">What it is</h4>
                <p className="text-sm text-foreground">{m.detail.whatItIs}</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Why it matters</h4>
                <p className="text-sm text-foreground">{m.detail.whyItMatters}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Common failure modes</h4>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {m.detail.commonFailureModes.map((x, i) => (<li key={i}>{x}</li>))}
                </ul>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Unknowns to resolve</h4>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {m.detail.unknownsToResolve.map((x, i) => (<li key={i}>{x}</li>))}
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Questions to ask experts</h4>
              {m.detail.expertQuestions.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant="secondary">{q.discipline}</Badge>
                  <span className="text-sm text-foreground">{q.q}</span>
                </div>
              ))}
            </div>
          </div>
        )}
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

  // SVG fill colors are an allowed exception per color-consistency rules
  const renderNode = (m: ModuleSpec): React.ReactNode => {
    const p = pos[m.id]
    if (!p) return null
    const c = chipColor(m.id)
    const isGating = m.isGatingModule || m.id === "react"
    const nodeNeedsDiag = isGating && !diagComplete

    return (
      <g key={m.id}>
        <rect x={p.x} y={p.y - nodeH / 2} width={nodeW} height={nodeH} rx={16} fill="#fff" />
        <rect x={p.x} y={p.y - nodeH / 2} width={10} height={nodeH} rx={10} fill={c} />
        <text x={p.x + 18} y={p.y - 10} fontSize="13" fill="#0f172a" fontWeight="600">{m.name}</text>
        <text x={p.x + 18} y={p.y + 10} fontSize="11" fill="#64748b">{m.purpose}</text>
        {isGating && (
          <text x={p.x + 18} y={p.y + 28} fontSize="11" fill={nodeNeedsDiag ? "#B45309" : "#64748b"}>
            {nodeNeedsDiag ? "Needs diagnostic" : `Class: ${getDerivedProcessClass(spec) || "set"}`}
          </text>
        )}
      </g>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">X-Ray schematic</h3>
            <p className="text-xs text-muted-foreground">Parallel branches run in parallel then merge. Diagnostic is a gating step.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {spec.systemImageUrl && (
              <Button variant="outline" size="sm" onClick={() => setShowVisual((v) => !v)}>
                <ImageIcon className="h-4 w-4 mr-2" />
                {showVisual ? "Functional" : "Visual Blueprint"}
              </Button>
            )}
            <Badge variant="secondary">Modules: <span className="ml-1 font-semibold">{n}</span></Badge>
            <Badge variant="secondary">Last scan: <span className="ml-1 font-semibold">{lastScannedLabel}</span></Badge>
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
              <Button onClick={() => onOpenDiagnostic(gating)} className="shrink-0">Run diagnostic</Button>
            </AlertDescription>
          </Alert>
        )}

        {showVisual && spec.systemImageUrl ? (
          <Card className="overflow-hidden bg-muted/30">
            <CardContent className="p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spec.systemImageUrl} alt="System diagram" className="w-full rounded-lg" />
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden bg-muted/30">
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <div style={{ minWidth: W }} className="p-6">
                  {/* SVG fill colors are an allowed exception per color-consistency rules */}
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[280px]">
                    <defs>
                      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#0f172a" floodOpacity="0.10" />
                      </filter>
                    </defs>
                    <rect x="26" y="70" width={W - 52} height="230" rx="22" fill="#F8FAFC" />
                    <text x="40" y="60" fontSize="12" fill="#64748b">PARALLEL BUILD (DAG)</text>
                    {edges.map((e, idx) => {
                      const a = pos[e.from]; const b = pos[e.to]
                      if (!a || !b) return null
                      return <path key={idx} d={svgPath(a, b)} fill="none" stroke="#CBD5E1" strokeWidth="3" />
                    })}
                    <g filter="url(#softShadow)">
                      {renderNode(start)}
                      {branchA.map(renderNode)}
                      {branchB.map(renderNode)}
                      <g key={mergeId}>
                        <rect x={pos[mergeId].x} y={pos[mergeId].y - nodeH / 2} width={nodeW} height={nodeH} rx={16} fill="#fff" />
                        <rect x={pos[mergeId].x} y={pos[mergeId].y - nodeH / 2} width={10} height={nodeH} rx={10} fill="#94A3B8" />
                        <text x={pos[mergeId].x + 18} y={pos[mergeId].y - 6} fontSize="13" fill="#0f172a" fontWeight="600">Merge / Assembly</text>
                        <text x={pos[mergeId].x + 18} y={pos[mergeId].y + 14} fontSize="11" fill="#64748b">Interfaces, tolerances, integration</text>
                      </g>
                      {renderNode(end)}
                    </g>
                  </svg>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {modules.map((m) => (
                      <Button key={m.id} variant="outline" onClick={() => document.getElementById(`module-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                        View {m.name}
                      </Button>
                    ))}
                    {gating && <Button onClick={() => onOpenDiagnostic(gating)}>Diagnostic</Button>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Idea</h3>
              <p className="text-xs text-muted-foreground">Scan to generate machine spec (X-Ray)</p>
            </div>
            <Button onClick={() => onScan(localIdea)} disabled={isScanning}>
              {isScanning ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Scanning...</>
              ) : (
                "Scan"
              )}
            </Button>
          </div>
          <Input
            value={localIdea}
            onChange={(e) => { setLocalIdea(e.target.value); setSpec({ ...spec, idea: e.target.value }) }}
            disabled={isScanning}
          />
          {spec.function && <p className="text-sm text-foreground">{spec.function}</p>}
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

function PeopleView({ spec }: { spec: XRaySpec }) {
  const [people, setPeople] = useState<PersonMatch[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const processClass = getDerivedProcessClass(spec)

  useEffect(() => {
    if (spec.modules.length === 0 || hasLoaded) return
    setIsLoading(true)
    matchPeopleAction(spec.modules)
      .then((result) => {
        if ("people" in result) setPeople(result.people)
        else console.error("[PeopleView]", result.error)
      })
      .catch((err) => console.error("[PeopleView] Error:", err))
      .finally(() => { setIsLoading(false); setHasLoaded(true) })
  }, [spec.modules, hasLoaded])

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
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-base font-semibold">Why these people?</h3>
          <p className="text-sm text-foreground">
            Derived from X-Ray modules{processClass ? `, and process class: ${processClass}.` : "."}
          </p>
          {!processClass && <p className="text-xs text-muted-foreground mt-1">Tip: run the diagnostic to sharpen matching.</p>}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      )}

      {!isLoading && people.length === 0 && hasLoaded && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No matching experts found. Try scanning a different idea or check that marketplace listings exist.</p>
          </CardContent>
        </Card>
      )}

      {Array.from(grouped.entries()).map(([discipline, matches]) => (
        <Card key={discipline}>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{discipline} expertise needed</h3>
                <p className="text-xs text-muted-foreground">Because modules include {discipline} questions</p>
              </div>
              <Badge>Top {Math.min(matches.length, 3)}</Badge>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {matches.slice(0, 3).map((p) => (
                <Card key={p.id}>
                  <CardContent className="pt-6">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.role}</p>
                    <p className="text-xs text-muted-foreground">{p.rate}</p>
                    {p.isVerified && <Badge variant="secondary" className="mt-2">Verified</Badge>}
                    <Button variant="outline" className="mt-4">Shortlist</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SupplierView({ spec, setSpec }: { spec: XRaySpec; setSpec: (s: XRaySpec) => void }) {
  const processClass = getDerivedProcessClass(spec)
  const diagComplete = isGatingDiagComplete(spec)
  const [suppliersByModule, setSuppliersByModule] = useState<Record<string, SupplierMatch[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    if (!diagComplete || spec.modules.length === 0 || hasLoaded) return
    setIsLoading(true)
    Promise.all(
      spec.modules.map((m) =>
        matchSuppliersAction(m, diagComplete)
          .then((result) => {
            if ("suppliers" in result) return { moduleId: m.id, suppliers: result.suppliers }
            return { moduleId: m.id, suppliers: [] }
          })
          .catch(() => ({ moduleId: m.id, suppliers: [] as SupplierMatch[] }))
      )
    )
      .then((results) => {
        const map: Record<string, SupplierMatch[]> = {}
        for (const r of results) map[r.moduleId] = r.suppliers
        setSuppliersByModule(map)
      })
      .finally(() => { setIsLoading(false); setHasLoaded(true) })
  }, [diagComplete, spec.modules, hasLoaded])

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
            <h3 className="text-base font-semibold">Supplier matching</h3>
            <p className="text-sm text-foreground">Conditioned on process class: {processClass}.</p>
            <p className="text-xs text-muted-foreground mt-1">This preserves transparency: no bespoke negotiation, just clarity-first quoting.</p>
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
        <TabsList>
          <TabsTrigger value="A">A -- X-Ray</TabsTrigger>
          <TabsTrigger value="B">B -- People</TabsTrigger>
          <TabsTrigger value="C">C -- Suppliers</TabsTrigger>
          <TabsTrigger value="D">D -- RFQ</TabsTrigger>
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
          <PeopleView spec={spec} />
        </TabsContent>

        <TabsContent value="C">
          <SupplierView spec={spec} setSpec={setSpec} />
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
