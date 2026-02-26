"use client"

/**
 * @file process-flow-diagram.tsx
 *
 * @description Visual process flow showing how modules connect via inputs/outputs.
 * Renders module nodes in a responsive grid with hover-to-trace interaction.
 * Connections are grouped by source module with signal-type color coding.
 *
 * FLOW: Parent passes CadLabModule[] → buildEdges() matches outputs→inputs →
 *       cards + connection rows rendered with hover-highlight traceability.
 */

import { useMemo, useState, type KeyboardEvent } from "react"
import { ArrowDownToLine, ArrowUpFromLine, Box, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { hasKeywordOverlap } from "@/lib/cad-lab/keyword-matching"
import { cn } from "@/lib/utils"
import { ForgeSectionHeader } from "../../components/forge-hover-explanations"

/* ─── Types ────────────────────────────────────────────────────────────── */

interface ProcessFlowDiagramProps {
  modules: CadLabModule[]
  className?: string
  onModuleClick?: (moduleId: string) => void
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

/** Number of connections shown in collapsed preview before "Show all" toggle. */
const PREVIEW_COUNT = 6

/* ─── Component ────────────────────────────────────────────────────────── */

export function ProcessFlowDiagram({ modules, className = "", onModuleClick }: ProcessFlowDiagramProps): React.ReactNode {
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null)
  const [connectionsExpanded, setConnectionsExpanded] = useState(false)

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

  /** Edges grouped by source module for the connections list. */
  const groupedEdges = useMemo(() => {
    const groups = new Map<string, { sourceId: string; sourceName: string; edges: (FlowEdge & { toName: string })[] }>()
    for (const edge of edges) {
      const sourceName = nodes.find((n) => n.id === edge.from)?.name ?? edge.from
      const toName = nodes.find((n) => n.id === edge.to)?.name ?? edge.to
      if (!groups.has(edge.from)) groups.set(edge.from, { sourceId: edge.from, sourceName, edges: [] })
      groups.get(edge.from)!.edges.push({ ...edge, toName })
    }
    return Array.from(groups.values())
  }, [edges, nodes])

  /** Modules with zero connections (orphans). */
  const orphanModules = useMemo(() => {
    const connectedIds = new Set<string>()
    for (const edge of edges) {
      connectedIds.add(edge.from)
      connectedIds.add(edge.to)
    }
    return nodes.filter((n) => !connectedIds.has(n.id))
  }, [edges, nodes])

  /** Signal types actually present in the current data (for legend filtering). */
  const presentSignalTypes = useMemo(() => {
    const types = new Set<SignalType>()
    for (const edge of edges) types.add(edge.signalType)
    return types
  }, [edges])

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
                tabIndex={0}
                role="button"
                aria-label={`${node.name} — click to view details`}
                onMouseEnter={() => setHoveredModuleId(node.id)}
                onMouseLeave={() => setHoveredModuleId(null)}
                onFocus={() => setHoveredModuleId(node.id)}
                onBlur={() => setHoveredModuleId(null)}
                onClick={() => onModuleClick?.(node.id)}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onModuleClick?.(node.id)
                  }
                }}
                className={cn(
                  "rounded-lg border bg-card p-3 space-y-2 transition-all duration-200",
                  onModuleClick ? "cursor-pointer" : "cursor-default",
                  "hover:-translate-y-0.5 active:scale-[0.99]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange/40",
                  !hoveredModuleId && "border-border",
                  isHovered && "shadow-md ring-2 ring-international-orange/40 border-international-orange/40",
                  isConnected && !isHovered && "ring-1 ring-status-info/40 border-status-info/40",
                  isDimmed && "opacity-40",
                )}
              >
                {/* Module name with branded icon — wraps instead of truncating */}
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 h-6 w-6 rounded-md bg-international-orange/10 flex items-center justify-center mt-0.5">
                    <Box className="h-3.5 w-3.5 text-international-orange" />
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{node.name}</p>
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
                        <span key={j} title={inp} className="truncate max-w-[140px] text-[11px] text-foreground bg-chart-2/10 border border-chart-2/20 rounded px-1.5 py-0.5 leading-tight">
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
                        <span key={j} title={out} className="truncate max-w-[140px] text-[11px] text-foreground bg-chart-3/10 border border-chart-3/20 rounded px-1.5 py-0.5 leading-tight">
                          {out}
                        </span>
                      ))}
                      {node.outputs.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{node.outputs.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Relationship summary footer — only show non-zero counts */}
                {counts && (counts.receivesFrom > 0 || counts.feedsTo > 0) && (
                  <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                    {[
                      counts.receivesFrom > 0 && `Receives from ${counts.receivesFrom}`,
                      counts.feedsTo > 0 && `Feeds ${counts.feedsTo}`,
                    ].filter(Boolean).join(" \u00B7 ")}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Empty connections explanation ──────────────────────────────── */}
        {edges.length === 0 && modules.length > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            No shared interfaces detected — module inputs and outputs may need
            more descriptive labels to identify connections.
          </p>
        )}

        {/* ── Orphan module callout ────────────────────────────────────── */}
        {orphanModules.length > 0 && edges.length > 0 && (
          <div className="mt-4 rounded-md border border-status-warning/30 bg-warning/10 px-3 py-2 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-status-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              <span className="font-medium">{orphanModules.length} module{orphanModules.length !== 1 ? "s" : ""} not connected:</span>{" "}
              {orphanModules.map((m, i) => (
                <span key={m.id}>
                  {onModuleClick ? (
                    <button
                      className="underline text-international-orange hover:text-international-orange-hover"
                      onClick={() => onModuleClick(m.id)}
                    >
                      {m.name}
                    </button>
                  ) : (
                    m.name
                  )}
                  {i < orphanModules.length - 1 ? ", " : ""}
                </span>
              ))}
              . Review inputs/outputs to identify integration points.
            </p>
          </div>
        )}

        {/* ── All modules connected callout ─────────────────────────────── */}
        {orphanModules.length === 0 && edges.length > 0 && (
          <p className="text-xs text-muted-foreground mt-4">
            All {modules.length} modules are connected — integration coverage looks good.
          </p>
        )}

        {/* ── Connections grouped by source module ────────────────────── */}
        {edges.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border">
            <div className="mb-1 flex items-center justify-between">
              <ForgeSectionHeader
                title="Module Connections"
                description="Shows where one module's output feeds into another module's input. If a connection is missing or mismatched, it signals a potential integration gap in your design."
                detail="Connections are matched by comparing the input and output labels across your modules. Two or more shared keywords between an output and an input create a connection."
              >
                <span className="text-xs font-semibold text-foreground">
                  Connections <span className="text-muted-foreground font-normal">({edges.length})</span>
                </span>
              </ForgeSectionHeader>
              {/* Collapse toggle when many connections */}
              {edges.length > PREVIEW_COUNT && (
                <button
                  onClick={() => setConnectionsExpanded((prev) => !prev)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {connectionsExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show all {edges.length} connections
                    </>
                  )}
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Matched by shared inputs and outputs between modules
            </p>

            {/* Render connections (preview when collapsed, all when expanded) */}
            {(edges.length <= PREVIEW_COUNT || connectionsExpanded) ? (
              <div className="space-y-4">
                {groupedEdges.map((group) => (
                  <div key={group.sourceId}>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      From{" "}
                      {onModuleClick ? (
                        <button
                          className="underline hover:text-foreground transition-colors"
                          onClick={() => onModuleClick(group.sourceId)}
                        >
                          {group.sourceName}
                        </button>
                      ) : (
                        group.sourceName
                      )}
                    </p>
                    <div className="space-y-1.5">
                      {group.edges.map((edge, i) => {
                        const config = SIGNAL_CONFIG[edge.signalType]
                        const isHighlighted = hoveredModuleId === edge.from || hoveredModuleId === edge.to
                        const isEdgeDimmed = hoveredModuleId !== null && !isHighlighted
                        return (
                          <div
                            key={i}
                            className={cn(
                              "rounded-md px-3 py-2 border transition-all duration-200",
                              isHighlighted && [config.activeBorder, config.activeBg],
                              isEdgeDimmed && "border-border bg-muted/10 opacity-40",
                              !hoveredModuleId && "border-border bg-muted/20 hover:bg-muted/40",
                            )}
                          >
                            <div className="flex items-center gap-2 text-xs">
                              <div className={cn("h-2 w-2 rounded-full flex-shrink-0", config.dot)} />
                              <span className={cn("flex-shrink-0", config.text)}>&rarr;</span>
                              {onModuleClick ? (
                                <button
                                  className="font-medium text-foreground underline hover:text-international-orange transition-colors"
                                  onClick={() => onModuleClick(edge.to)}
                                >
                                  {edge.toName}
                                </button>
                              ) : (
                                <span className="font-medium text-foreground">{edge.toName}</span>
                              )}
                            </div>
                            {edge.label && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 ml-7">
                                {edge.label}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {groupedEdges.slice(0, PREVIEW_COUNT).map((group) => (
                  <div key={group.sourceId}>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      From{" "}
                      {onModuleClick ? (
                        <button
                          className="underline hover:text-foreground transition-colors"
                          onClick={() => onModuleClick(group.sourceId)}
                        >
                          {group.sourceName}
                        </button>
                      ) : (
                        group.sourceName
                      )}
                    </p>
                    <div className="space-y-1.5">
                      {group.edges.map((edge, i) => {
                        const config = SIGNAL_CONFIG[edge.signalType]
                        return (
                          <div
                            key={i}
                            className="rounded-md px-3 py-2 border border-border bg-muted/20 hover:bg-muted/40 transition-all duration-200"
                          >
                            <div className="flex items-center gap-2 text-xs">
                              <div className={cn("h-2 w-2 rounded-full flex-shrink-0", config.dot)} />
                              <span className={cn("flex-shrink-0", config.text)}>&rarr;</span>
                              {onModuleClick ? (
                                <button
                                  className="font-medium text-foreground underline hover:text-international-orange transition-colors"
                                  onClick={() => onModuleClick(edge.to)}
                                >
                                  {edge.toName}
                                </button>
                              ) : (
                                <span className="font-medium text-foreground">{edge.toName}</span>
                              )}
                            </div>
                            {edge.label && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 ml-7">
                                {edge.label}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Signal type legend — only shows types present in current data */}
            {presentSignalTypes.size > 1 && (
              <div className="flex flex-wrap items-center gap-4 pt-3 mt-4 border-t border-border text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Signal types:</span>
                {(Object.keys(SIGNAL_CONFIG) as SignalType[])
                  .filter((type) => presentSignalTypes.has(type))
                  .map((type) => (
                    <span key={type} className="flex items-center gap-1">
                      <div className={cn("h-2 w-2 rounded-full", SIGNAL_CONFIG[type].dot)} />
                      {SIGNAL_CONFIG[type].label}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
