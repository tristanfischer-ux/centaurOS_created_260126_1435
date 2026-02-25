/**
 * @file cad-lab-timeline.tsx — Gantt-style timeline for The Forge modules.
 *
 * @description Horizontal bar chart showing module lead times with
 * dependency-based scheduling. Infers dependencies from module
 * inputs/outputs: if module A outputs "X" and module B takes "X" as
 * input, B depends on A. The critical path is highlighted in orange.
 *
 * Pure CSS — no charting library required.
 *
 * @component
 *
 * @example
 * <CadLabTimeline modules={modules} />
 */

"use client"

import { useMemo, useState } from "react"
import { Clock, Box, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Chart colors (semantic tokens) ─────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
]

/**
 * Deterministic color assignment based on module id.
 *
 * @param id - Module identifier
 * @returns HSL color string from the chart palette
 */
function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabTimelineProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
}

/** Scheduled module with computed start and end weeks */
interface ScheduledModule {
  module: CadLabModule
  /** Start week (0-indexed) */
  startWeek: number
  /** End week */
  endWeek: number
  /** Module IDs this module depends on */
  dependsOn: string[]
  /** Whether this module is on the critical path */
  isCritical: boolean
}

// ─── Scheduling Logic ───────────────────────────────────────────────

/**
 * Infers dependencies between modules by matching outputs to inputs.
 *
 * If module A outputs "power_12v" and module B lists "power_12v" as
 * an input, B depends on A. Matching is case-insensitive and
 * normalised (lowercased, trimmed).
 *
 * @param modules - Array of CadLab modules
 * @returns Map of moduleId → array of dependency moduleIds
 */
function inferDependencies(
  modules: CadLabModule[]
): Map<string, string[]> {
  // Build output → moduleId lookup
  const outputMap = new Map<string, string>()
  for (const mod of modules) {
    for (const out of mod.outputs) {
      outputMap.set(out.toLowerCase().trim(), mod.id)
    }
  }

  // For each module, find which other modules produce its inputs
  const deps = new Map<string, string[]>()
  for (const mod of modules) {
    const modDeps: string[] = []
    for (const inp of mod.inputs) {
      const producerId = outputMap.get(inp.toLowerCase().trim())
      if (producerId && producerId !== mod.id && !modDeps.includes(producerId)) {
        modDeps.push(producerId)
      }
    }
    deps.set(mod.id, modDeps)
  }

  return deps
}

/**
 * Schedules modules based on dependencies and lead times.
 *
 * Uses topological ordering: a module starts after all its dependencies
 * complete. Modules without dependencies start at week 0 (parallel).
 * Also identifies the critical path.
 *
 * @param modules - Array of CadLab modules
 * @returns Array of scheduled modules with start/end times and critical path
 */
function scheduleModules(modules: CadLabModule[]): ScheduledModule[] {
  const deps = inferDependencies(modules)
  const scheduled = new Map<string, ScheduledModule>()

  // Topological sort with BFS (Kahn's algorithm)
  const inDegree = new Map<string, number>()
  for (const mod of modules) {
    inDegree.set(mod.id, (deps.get(mod.id) || []).length)
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  // Process in dependency order
  while (queue.length > 0) {
    const id = queue.shift()!
    const mod = modules.find((m) => m.id === id)!
    const modDeps = deps.get(id) || []

    // Start after all dependencies complete
    let startWeek = 0
    for (const depId of modDeps) {
      const depSchedule = scheduled.get(depId)
      if (depSchedule) {
        startWeek = Math.max(startWeek, depSchedule.endWeek)
      }
    }

    scheduled.set(id, {
      module: mod,
      startWeek,
      endWeek: startWeek + mod.leadWeeks,
      dependsOn: modDeps,
      isCritical: false, // Computed below
    })

    // Unblock dependents
    for (const other of modules) {
      const otherDeps = deps.get(other.id) || []
      if (otherDeps.includes(id)) {
        const newDegree = (inDegree.get(other.id) || 0) - 1
        inDegree.set(other.id, newDegree)
        if (newDegree === 0) queue.push(other.id)
      }
    }
  }

  // Handle circular dependencies: schedule unvisited modules at week 0
  for (const mod of modules) {
    if (!scheduled.has(mod.id)) {
      scheduled.set(mod.id, {
        module: mod,
        startWeek: 0,
        endWeek: mod.leadWeeks,
        dependsOn: [],
        isCritical: false,
      })
    }
  }

  // Find critical path: trace back from the module with the latest end time
  const allScheduled = Array.from(scheduled.values())
  const maxEnd = Math.max(...allScheduled.map((s) => s.endWeek), 0)

  // Mark modules on the critical path by tracing backwards
  const criticalSet = new Set<string>()
  const findCritical = (endWeek: number): void => {
    for (const s of allScheduled) {
      if (s.endWeek === endWeek && !criticalSet.has(s.module.id)) {
        criticalSet.add(s.module.id)
        // Trace back to dependencies that end at this module's start
        for (const depId of s.dependsOn) {
          const depSchedule = scheduled.get(depId)
          if (depSchedule && depSchedule.endWeek === s.startWeek) {
            findCritical(depSchedule.endWeek)
          }
        }
      }
    }
  }
  findCritical(maxEnd)

  // Apply critical path marking
  for (const s of allScheduled) {
    s.isCritical = criticalSet.has(s.module.id)
  }

  // Sort by start week, then by name for stable ordering
  return allScheduled.sort((a, b) =>
    a.startWeek !== b.startWeek
      ? a.startWeek - b.startWeek
      : a.module.name.localeCompare(b.module.name)
  )
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabTimeline — Gantt-style lead time visualization.
 *
 * @description Shows each module as a horizontal bar. Bar position is
 * computed from inferred dependencies (inputs/outputs matching).
 * The critical path (longest chain of dependent modules) is highlighted
 * in International Orange.
 */
export function CadLabTimeline({
  modules,
}: CadLabTimelineProps): React.ReactNode {
  const [showDeps, setShowDeps] = useState(false)

  const { scheduled, totalWeeks, criticalWeeks, parallelGroups } = useMemo(() => {
    const sched = scheduleModules(modules)
    const total = Math.max(...sched.map((s) => s.endWeek), 0)
    const critical = sched
      .filter((s) => s.isCritical)
      .reduce((sum, s) => Math.max(sum, s.endWeek), 0)

    // Count parallel groups (modules starting at the same week)
    const startGroups = new Map<number, number>()
    for (const s of sched) {
      startGroups.set(s.startWeek, (startGroups.get(s.startWeek) || 0) + 1)
    }
    const maxParallel = Math.max(...startGroups.values(), 0)

    return {
      scheduled: sched,
      totalWeeks: total,
      criticalWeeks: critical,
      parallelGroups: maxParallel,
    }
  }, [modules])

  if (modules.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Manufacturing Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete the Concept stage to generate a manufacturing timeline. Module lead times and dependencies are needed.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Week scale markers
  const weekMarkers: number[] = []
  for (let w = 0; w <= totalWeeks; w++) {
    weekMarkers.push(w)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Project Timeline
          <span className="text-xs font-normal text-muted-foreground">
            {totalWeeks} weeks total
            {criticalWeeks < totalWeeks && ` (${criticalWeeks}w critical path)`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-international-orange/10 text-international-orange font-medium">
            <Clock className="h-3 w-3" />
            Critical path: {criticalWeeks}w
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-foreground font-medium">
            Total: {totalWeeks}w
          </div>
          {parallelGroups > 1 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-info-light text-status-info font-medium">
              Up to {parallelGroups} modules in parallel
            </div>
          )}
        </div>

        {/* Week scale header */}
        <div className="flex items-end gap-3">
          <div className="w-36 shrink-0" />
          <div className="flex-1 relative h-5">
            {weekMarkers.map((w) => (
              <div
                key={w}
                className="absolute text-[9px] text-muted-foreground font-mono"
                style={{
                  left: `${totalWeeks > 0 ? (w / totalWeeks) * 100 : 0}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {w}w
              </div>
            ))}
          </div>
        </div>

        {/* Gantt bars */}
        <div className="space-y-2">
          {scheduled.map((s) => {
            const leftPct =
              totalWeeks > 0 ? (s.startWeek / totalWeeks) * 100 : 0
            const widthPct =
              totalWeeks > 0
                ? (s.module.leadWeeks / totalWeeks) * 100
                : 100
            const color = chipColor(s.module.id)
            const statusDot =
              s.module.status === "generated"
                ? "bg-status-success"
                : s.module.status === "interface_ready"
                  ? "bg-status-info"
                  : "bg-muted-foreground"

            return (
              <div key={s.module.id} className="flex items-center gap-3">
                {/* Module label */}
                <div className="w-36 shrink-0 flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: color + "18" }}
                  >
                    <Box className="h-3 w-3" style={{ color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground truncate block">
                      {s.module.name}
                    </span>
                  </div>
                  <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot)} />
                </div>

                {/* Bar track */}
                <div className="flex-1 h-7 bg-muted/20 rounded-lg overflow-hidden relative">
                  {/* Grid lines for each week */}
                  {weekMarkers.slice(1).map((w) => (
                    <div
                      key={w}
                      className="absolute top-0 bottom-0 w-px bg-muted/30"
                      style={{
                        left: `${(w / totalWeeks) * 100}%`,
                      }}
                    />
                  ))}

                  {/* Bar */}
                  <div
                    className={cn(
                      "absolute top-0 h-full rounded-lg transition-all duration-500 flex items-center px-2",
                      s.isCritical ? "bg-international-orange/80" : "",
                    )}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 4)}%`,
                      backgroundColor: s.isCritical
                        ? undefined
                        : color + "30",
                    }}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-semibold tabular-nums whitespace-nowrap",
                        s.isCritical ? "text-white" : "text-foreground"
                      )}
                    >
                      {s.module.leadWeeks}w
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-international-orange/80" />
            Critical path
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-muted/60" />
            Parallel modules
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-status-success" />
            CAD generated
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-status-info" />
            Interface ready
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            Pending
          </div>
        </div>

        {/* Dependency details (toggle) */}
        {scheduled.some((s) => s.dependsOn.length > 0) && (
          <div>
            <button
              onClick={() => setShowDeps(!showDeps)}
              className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-muted-foreground transition-colors"
            >
              {showDeps ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Inferred Dependencies
            </button>

            {showDeps && (
              <div className="mt-2 space-y-1.5">
                {scheduled
                  .filter((s) => s.dependsOn.length > 0)
                  .map((s) => {
                    const depNames = s.dependsOn
                      .map((id) => modules.find((m) => m.id === id)?.name || id)
                      .join(", ")
                    return (
                      <div
                        key={s.module.id}
                        className="text-xs text-muted-foreground flex items-start gap-2"
                      >
                        <span className="font-medium text-foreground min-w-[120px]">
                          {s.module.name}
                        </span>
                        <span>depends on</span>
                        <span className="font-mono text-foreground">
                          {depNames}
                        </span>
                      </div>
                    )
                  })}
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-2">
                  <AlertTriangle className="h-3 w-3" />
                  Dependencies inferred from module input/output matching. Actual schedule may vary.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
