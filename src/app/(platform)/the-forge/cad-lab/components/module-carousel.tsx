"use client"

/**
 * @file module-carousel.tsx
 *
 * @description Progressive module flow: one module at a time with description
 * and "Generate CAD". When user triggers generation, view auto-advances to
 * the next module so they can read while the previous one builds.
 */

import { useState, useCallback, useEffect } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  Loader2,
  CheckCircle2,
  Clock,
  Puzzle,
  AlertTriangle,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Manufacturing Micro-Lessons ────────────────────────────────────

const PART_INSIGHTS: Array<{ keywords: string[]; insight: string }> = [
  { keywords: ["bearing", "bearings"], insight: "Bearings require precise bore tolerances (IT6-IT7). Specify shaft fit class (e.g., h6/H7 for a transition fit) on your drawing." },
  { keywords: ["gear", "gears", "gearbox"], insight: "Gears need surface hardness callouts (e.g., HRC 58-62 for hardened teeth). Specify module, pressure angle, and quality grade (AGMA or DIN)." },
  { keywords: ["shaft", "axle"], insight: "Shafts need concentricity callouts between bearing journals. Specify surface finish Ra on bearing seats and keyway tolerances." },
  { keywords: ["spring", "springs"], insight: "Springs are specified by rate (N/mm), free length, solid height, and material. Never dimension a spring by wire diameter alone — specify the functional requirements." },
  { keywords: ["seal", "seals", "o-ring", "gasket"], insight: "Seals require surface finish Ra ≤ 0.8μm on mating surfaces. Specify groove dimensions per the seal manufacturer's catalog, not just the seal size." },
  { keywords: ["pcb", "circuit board", "electronics"], insight: "PCBs need mounting hole positions with ±0.1mm tolerance. Specify standoff height, connector keep-out zones, and thermal relief requirements." },
  { keywords: ["motor", "actuator", "servo"], insight: "Motors need mounting pattern tolerances of ±0.05mm for shaft alignment. Specify torque, speed, and duty cycle — not just power rating." },
  { keywords: ["lens", "optic", "optical"], insight: "Optical components need surface quality callouts (scratch-dig per MIL-PRF-13830). Specify focal length tolerance and coating requirements." },
  { keywords: ["thread", "threads", "screw", "bolt", "fastener"], insight: "Specify thread class (e.g., 6H/6g for metric). Blind holes need minimum thread engagement of 1.5× nominal diameter. Call out thread depth, not just tap depth." },
  { keywords: ["hinge", "pivot"], insight: "Hinges need clearance fits on the pin (H7/g6 typical). Specify max angular play and fatigue cycle requirement for the intended life." },
  { keywords: ["housing", "enclosure", "case", "chassis"], insight: "Housings need boss design for fasteners (OD = 2× screw diameter). Specify IP rating if environmental sealing is needed, and EMI shielding if applicable." },
  { keywords: ["sensor", "transducer", "probe"], insight: "Sensor mounting needs vibration isolation consideration. Specify sensing axis alignment tolerance and cable routing clearance." },
  { keywords: ["valve", "flow", "manifold"], insight: "Flow components need surface finish Ra ≤ 1.6μm on sealing surfaces. Specify pressure rating, flow coefficient (Cv), and compatible fluid types." },
  { keywords: ["bracket", "mount", "mounting"], insight: "Brackets need load path analysis. Specify bolt pattern, maximum deflection under load, and material thickness for the expected force." },
  { keywords: ["heat sink", "heatsink", "thermal", "cooling"], insight: "Heat sinks need thermal interface material (TIM) specification. Call out fin height, spacing, and base flatness (typically ≤ 0.05mm)." },
  { keywords: ["filter", "mesh", "screen"], insight: "Filters need micron rating and differential pressure specification. Call out flow direction, bypass pressure, and replacement interval." },
  { keywords: ["cam", "linkage"], insight: "Cam profiles need surface finish Ra ≤ 0.4μm and hardness HRC 55-62. Specify lift curve data points, not just max lift." },
  { keywords: ["battery", "cell", "power"], insight: "Battery compartments need ventilation for thermal runaway gases. Specify contact spring force, polarity marking, and retention mechanism." },
]

function getPartInsight(keyParts: string[]): string | null {
  const joined = keyParts.join(" ").toLowerCase()
  for (const { keywords, insight } of PART_INSIGHTS) {
    if (keywords.some((kw) => joined.includes(kw))) return insight
  }
  return null
}

type BatchStatus = "queued" | "interface" | "generating" | "done" | "error"

interface ModuleCarouselProps {
  modules: CadLabModule[]
  batchProgress: Record<string, BatchStatus>
  isBatchRunning: boolean
  activeModuleId: string | null
  onGenerate: (moduleId: string) => void
  onViewResult?: (moduleId: string) => void
  /** When true, after starting generation for current module, auto-advance to next */
  autoAdvanceOnGenerate?: boolean
}

/**
 * Progressive module carousel: one focused module at a time with Generate CAD.
 * Optional auto-advance to next module when generation starts.
 */
export function ModuleCarousel({
  modules,
  batchProgress,
  isBatchRunning,
  activeModuleId,
  onGenerate,
  onViewResult,
  autoAdvanceOnGenerate = true,
}: ModuleCarouselProps): React.ReactNode {
  const [focusedIndex, setFocusedIndex] = useState(0)

  const focusedModule = modules[focusedIndex] ?? null
  const status = focusedModule ? batchProgress[focusedModule.id] ?? "queued" : null
  const isGenerating = status === "interface" || status === "generating"
  const isDone = status === "done"
  const isError = status === "error"
  const canGenerate = focusedModule && focusedModule.status !== "generated" && !activeModuleId && !isBatchRunning

  // Auto-advance to next pending module when current one starts generating
  const handleGenerateClick = useCallback(() => {
    if (!focusedModule) return
    onGenerate(focusedModule.id)
    if (autoAdvanceOnGenerate) {
      const nextPending = modules.findIndex((m, i) => i > focusedIndex && m.status !== "generated")
      if (nextPending >= 0) setFocusedIndex(nextPending)
      else if (focusedIndex < modules.length - 1) setFocusedIndex(focusedIndex + 1)
    }
  }, [focusedModule, focusedIndex, modules, onGenerate, autoAdvanceOnGenerate])

  // Keep focused index in bounds
  useEffect(() => {
    if (focusedIndex >= modules.length && modules.length > 0) setFocusedIndex(Math.max(0, modules.length - 1))
  }, [focusedIndex, modules.length])

  if (modules.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Build modules one by one
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={focusedIndex === 0}
              onClick={() => setFocusedIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous module"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[4rem] text-center">
              {focusedIndex + 1} of {modules.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={focusedIndex >= modules.length - 1}
              onClick={() => setFocusedIndex((i) => Math.min(modules.length - 1, i + 1))}
              aria-label="Next module"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Read about each module and generate its CAD. The view advances so you can read the next while one builds.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Background progress strip */}
        {Object.keys(batchProgress).length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {modules.map((mod, i) => {
              const s = batchProgress[mod.id]
              const done = s === "done"
              const active = s === "interface" || s === "generating"
              const err = s === "error"
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setFocusedIndex(i)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    i === focusedIndex
                      ? "ring-2 ring-international-orange bg-international-orange-light/20"
                      : done
                        ? "bg-status-success-light text-status-success"
                        : active
                          ? "bg-international-orange-light/20 text-international-orange"
                          : err
                            ? "bg-status-error-light text-destructive"
                            : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done && <CheckCircle2 className="h-3 w-3" />}
                  {active && <Loader2 className="h-3 w-3 animate-spin" />}
                  {err && <AlertTriangle className="h-3 w-3" />}
                  <span className="truncate max-w-[80px]">{mod.name}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Focused module content */}
        {focusedModule && (
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{focusedModule.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{focusedModule.purpose}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {focusedModule.status === "generated" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onViewResult?.(focusedModule.id)}
                    className="gap-1 text-status-success"
                  >
                    <CheckCircle2 className="h-3 w-3" /> View result
                  </Button>
                ) : isGenerating ? (
                  <span className="text-xs text-international-orange flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Building CAD...
                  </span>
                ) : isError ? (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => onGenerate(focusedModule.id)}>
                    <Zap className="h-3 w-3" /> Retry
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleGenerateClick} disabled={!canGenerate} className="gap-1">
                    <Zap className="h-3 w-3" /> Generate CAD
                  </Button>
                )}
              </div>
            </div>

            {/* Blueprint image from Concept stage (shown before CAD is generated) */}
            {focusedModule.imageUrl && focusedModule.imageStatus === "complete" && focusedModule.status !== "generated" && (
              <div className="aspect-[3/2] w-full rounded-lg overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={focusedModule.imageUrl} alt={`Blueprint: ${focusedModule.name}`} className="w-full h-full object-cover" />
              </div>
            )}

            <p className="text-sm text-foreground">{focusedModule.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Lead time:</span>
                <span className="font-medium">{focusedModule.leadWeeks} weeks</span>
              </div>
              <div className="flex items-center gap-2">
                <Puzzle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Key parts:</span>
                <span className="font-medium">{focusedModule.keyParts.length}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {focusedModule.inputs.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Inputs</p>
                  <div className="flex flex-wrap gap-1">
                    {focusedModule.inputs.map((inp, i) => (
                      <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded font-mono text-[10px]">{inp}</span>
                    ))}
                  </div>
                </div>
              )}
              {focusedModule.outputs.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Outputs</p>
                  <div className="flex flex-wrap gap-1">
                    {focusedModule.outputs.map((out, i) => (
                      <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded font-mono text-[10px]">{out}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(focusedModule.failureModes.length > 0 || focusedModule.unknowns.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {focusedModule.failureModes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Failure modes
                    </p>
                    <ul className="space-y-0.5">
                      {focusedModule.failureModes.map((fm, i) => (
                        <li key={i} className="text-xs text-foreground">{fm}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {focusedModule.unknowns.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                      <Info className="h-3 w-3" /> Unknowns
                    </p>
                    <ul className="space-y-0.5">
                      {focusedModule.unknowns.map((u, i) => (
                        <li key={i} className="text-xs text-foreground">{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Manufacturing micro-lesson keyed to key parts */}
            {(() => {
              const insight = getPartInsight(focusedModule.keyParts)
              if (!insight) return null
              return (
                <div className="rounded-md bg-international-orange-light/10 border border-international-orange/20 px-3 py-2">
                  <p className="text-[10px] font-semibold text-international-orange uppercase tracking-wider mb-0.5">
                    Manufacturing Insight
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">{insight}</p>
                </div>
              )
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
