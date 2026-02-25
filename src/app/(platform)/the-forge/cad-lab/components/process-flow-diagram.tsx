"use client"

/**
 * @file process-flow-diagram.tsx
 *
 * @description Visual process flow showing how modules connect via inputs/outputs.
 * Renders module nodes in a responsive grid with hover-to-trace interaction.
 * Connections are grouped by signal type (Power, Data, Mechanical, Thermal).
 *
 * FLOW: Parent passes CadLabModule[] → buildEdges() matches outputs→inputs →
 *       cards + connection pills rendered with hover-highlight traceability.
 */

import { useMemo, useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, Box } from "lucide-react"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

/* ─── Types ────────────────────────────────────────────────────────────── */

interface ProcessFlowDiagramProps {
  modules: CadLabModule[]
  className?: string
}

interface FlowNode {
  id: string
  name: string
  inputs: string[]
  outputs: string[]
}

type SignalType = "power" | "data" | "mechanical" | "thermal" | "other"

interface FlowEdge {
  from: string
  to: string
  label?: string
  signalType: SignalType
}

/* ─── Signal type classification ───────────────────────────────────────── */

/** Keywords that classify a connection's signal type. */
const SIGNAL_KEYWORDS: Record<Exclude<SignalType, "other">, string[]> = {
  power: ["voltage", "battery", "current", "watt", "amp", "dc", "charger", "power", "supply", "energy"],
  data: ["signal", "data", "control", "sensor", "telemetry", "pwm", "serial", "usb", "uart", "command", "feedback", "communication", "protocol", "digital", "analog"],
  mechanical: ["force", "torque", "mount", "structural", "load", "bracket", "axle", "frame", "chassis", "gear", "shaft", "bearing", "mechanical", "assembly"],
  thermal: ["heat", "thermal", "cooling", "temperature", "dissipation", "fan", "heatsink", "ventilation"],
}

/**
 * Display config per signal type. All Tailwind classes are spelled out in full
 * so the JIT compiler picks them up (no dynamic string interpolation).
 */
const SIGNAL_CONFIG: Record<SignalType, {
  label: string
  dot: string
  text: string
  activeBorder: string
  activeBg: string
}> = {
  power:      { label: "Power",      dot: "bg-chart-1",  text: "text-chart-1",  activeBorder: "border-chart-1/50",  activeBg: "bg-chart-1/10" },
  data:       { label: "Data",       dot: "bg-chart-2",  text: "text-chart-2",  activeBorder: "border-chart-2/50",  activeBg: "bg-chart-2/10" },
  mechanical: { label: "Mechanical", dot: "bg-chart-3",  text: "text-chart-3",  activeBorder: "border-chart-3/50",  activeBg: "bg-chart-3/10" },
  thermal:    { label: "Thermal",    dot: "bg-chart-4",  text: "text-chart-4",  activeBorder: "border-chart-4/50",  activeBg: "bg-chart-4/10" },
  other:      { label: "Other",      dot: "bg-chart-5",  text: "text-chart-5",  activeBorder: "border-chart-5/50",  activeBg: "bg-chart-5/10" },
}

/** Classify a connection label into a signal type by keyword matching. */
function classifySignalType(label: string): SignalType {
  const lower = label.toLowerCase()
  for (const [type, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return type as SignalType
  }
  return "other"
}

/* ─── Edge building (keyword overlap) ──────────────────────────────────── */

/** Stop words excluded from keyword matching. */
const STOP_WORDS = new Set([
  "the", "a", "an", "to", "of", "for", "from", "in", "on", "at", "and",
  "or", "via", "per", "with", "each", "all", "into", "between", "by",
])

/** Extracts significant keywords from an IO label. */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  )
}

/** Returns true if two IO labels share at least `minShared` keywords. */
function hasKeywordOverlap(a: string, b: string, minShared: number = 2): boolean {
  const kA = extractKeywords(a)
  const kB = extractKeywords(b)
  let shared = 0
  for (const w of kA) {
    if (kB.has(w)) {
      shared++
      if (shared >= minShared) return true
    }
  }
  return false
}

/**
 * Builds edges by matching outputs of one module to inputs of another
 * using keyword overlap (2+ shared significant words). Each edge is also
 * classified by signal type.
 */
function buildEdges(modules: CadLabModule[]): FlowEdge[] {
  const edges: FlowEdge[] = []
  for (const source of modules) {
    for (const output of source.outputs) {
      for (const target of modules) {
        if (target.id === source.id) continue
        for (const input of target.inputs) {
          if (hasKeywordOverlap(output, input)) {
            const isDuplicate = edges.some(
              (e) => e.from === source.id && e.to === target.id && e.label === output,
            )
            if (!isDuplicate) {
              edges.push({
                from: source.id,
                to: target.id,
                label: output,
                signalType: classifySignalType(output),
              })
            }
          }
        }
      }
    }
  }
  return edges
}

/* ─── Component ────────────────────────────────────────────────────────── */

export function ProcessFlowDiagram({ modules, className = "" }: ProcessFlowDiagramProps): React.ReactNode {
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null)

  const nodes: FlowNode[] = useMemo(
    () =>
      modules.map((m) => ({
        id: m.id,
        name: m.name,
        inputs: m.inputs,
        outputs: m.outputs,
      })),
    [modules],
  )

  const edges = useMemo(() => buildEdges(modules), [modules])

  /** Set of module IDs connected to the currently hovered module. */
  const hoveredConnections = useMemo(() => {
    if (!hoveredModuleId) return new Set<string>()
    const related = new Set<string>()
    for (const edge of edges) {
      if (edge.from === hoveredModuleId) related.add(edge.to)
      if (edge.to === hoveredModuleId) related.add(edge.from)
    }
    return related
  }, [hoveredModuleId, edges])

  /** Connection counts per module: how many it receives from / feeds to. */
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, { receivesFrom: number; feedsTo: number }>()
    for (const node of nodes) {
      counts.set(node.id, { receivesFrom: 0, feedsTo: 0 })
    }
    for (const edge of edges) {
      const fromCounts = counts.get(edge.from)
      const toCounts = counts.get(edge.to)
      if (fromCounts) fromCounts.feedsTo++
      if (toCounts) toCounts.receivesFrom++
    }
    return counts
  }, [nodes, edges])

  /** Edges grouped by signal type, ordered by SIGNAL_CONFIG key order. */
  const edgesBySignalType = useMemo(() => {
    const groups = new Map<SignalType, (FlowEdge & { fromName: string; toName: string })[]>()
    for (const edge of edges) {
      const fromName = nodes.find((n) => n.id === edge.from)?.name ?? edge.from
      const toName = nodes.find((n) => n.id === edge.to)?.name ?? edge.to
      if (!groups.has(edge.signalType)) groups.set(edge.signalType, [])
      groups.get(edge.signalType)!.push({ ...edge, fromName, toName })
    }
    const ordered: [SignalType, (FlowEdge & { fromName: string; toName: string })[]][] = []
    for (const type of Object.keys(SIGNAL_CONFIG) as SignalType[]) {
      const group = groups.get(type)
      if (group && group.length > 0) ordered.push([type, group])
    }
    return ordered
  }, [edges, nodes])

  /* ── Empty state ─────────────────────────────────────────────────────── */

  if (modules.length === 0) {
    return (
      <div className={cn("rounded-lg border border-border bg-muted/20 p-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">Map sub-assemblies to see the process flow.</p>
      </div>
    )
  }

  /* ── Main render ─────────────────────────────────────────────────────── */

  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      {/* Header with orange accent bar */}
      <div className="border-b border-border">
        <div className="h-1 bg-international-orange/60" />
        <div className="px-5 py-3">
          <p className="text-sm font-semibold text-foreground">Module integration flow</p>
          <p className="text-xs text-muted-foreground">
            Hover a module to trace its connections &middot; {edges.length} interface{edges.length !== 1 ? "s" : ""} mapped
          </p>
        </div>
      </div>

      <div className="p-5">
        {/* ── Module grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {nodes.map((node) => {
            const isHovered = hoveredModuleId === node.id
            const isConnected = hoveredConnections.has(node.id)
            const isDimmed = hoveredModuleId !== null && !isHovered && !isConnected
            const counts = connectionCounts.get(node.id)

            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoveredModuleId(node.id)}
                onMouseLeave={() => setHoveredModuleId(null)}
                className={cn(
                  "rounded-lg border bg-card p-3 space-y-2 transition-all duration-200 cursor-default",
                  "hover:-translate-y-0.5 active:scale-[0.99]",
                  !hoveredModuleId && "border-border",
                  isHovered && "shadow-md ring-2 ring-international-orange/40 border-international-orange/40",
                  isConnected && !isHovered && "ring-1 ring-status-info/40 border-status-info/40",
                  isDimmed && "opacity-40",
                )}
              >
                {/* Module name with branded icon */}
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 h-6 w-6 rounded-md bg-international-orange/10 flex items-center justify-center">
                    <Box className="h-3.5 w-3.5 text-international-orange" />
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight truncate">{node.name}</p>
                </div>

                {/* Inputs (top — data flowing IN) */}
                {node.inputs.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <ArrowDownToLine className="h-3 w-3 text-chart-2" />
                      <p className="text-[10px] font-medium text-chart-2 uppercase tracking-wider">Inputs</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {node.inputs.slice(0, 3).map((inp, j) => (
                        <span key={j} className="text-[11px] text-foreground bg-chart-2/10 border border-chart-2/20 rounded px-1.5 py-0.5 leading-tight">
                          {inp}
                        </span>
                      ))}
                      {node.inputs.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{node.inputs.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Outputs (bottom — data flowing OUT) */}
                {node.outputs.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <ArrowUpFromLine className="h-3 w-3 text-chart-3" />
                      <p className="text-[10px] font-medium text-chart-3 uppercase tracking-wider">Outputs</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {node.outputs.slice(0, 3).map((out, j) => (
                        <span key={j} className="text-[11px] text-foreground bg-chart-3/10 border border-chart-3/20 rounded px-1.5 py-0.5 leading-tight">
                          {out}
                        </span>
                      ))}
                      {node.outputs.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{node.outputs.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Relationship summary footer */}
                {counts && (counts.receivesFrom > 0 || counts.feedsTo > 0) && (
                  <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                    Receives from {counts.receivesFrom} &middot; Feeds {counts.feedsTo}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Connections grouped by signal type ────────────────────────── */}
        {edges.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border space-y-4">
            <p className="text-xs font-semibold text-foreground">
              Connections <span className="text-muted-foreground font-normal">({edges.length})</span>
            </p>

            {edgesBySignalType.map(([signalType, groupEdges]) => {
              const config = SIGNAL_CONFIG[signalType]
              return (
                <div key={signalType}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className={cn("h-2 w-2 rounded-full", config.dot)} />
                    <p className="text-[11px] font-medium text-foreground">
                      {config.label} <span className="text-muted-foreground font-normal">({groupEdges.length})</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {groupEdges.map((e, i) => {
                      const isHighlighted = hoveredModuleId === e.from || hoveredModuleId === e.to
                      const isEdgeDimmed = hoveredModuleId !== null && !isHighlighted
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5 border transition-all duration-200",
                            isHighlighted && [config.activeBorder, config.activeBg, "text-foreground"],
                            isEdgeDimmed && "border-border bg-muted/10 text-muted-foreground opacity-40",
                            !hoveredModuleId && "border-border bg-muted/20 text-foreground",
                          )}
                        >
                          <span className="font-medium truncate">{e.fromName}</span>
                          <span className={cn("flex-shrink-0", config.text)}>&rarr;</span>
                          <span className="font-medium truncate">{e.toName}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Signal type legend */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Signal types:</span>
              {(Object.keys(SIGNAL_CONFIG) as SignalType[]).map((type) => (
                <span key={type} className="flex items-center gap-1">
                  <div className={cn("h-2 w-2 rounded-full", SIGNAL_CONFIG[type].dot)} />
                  {SIGNAL_CONFIG[type].label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
