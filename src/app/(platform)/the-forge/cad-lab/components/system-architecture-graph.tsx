"use client"

import { useState, useMemo } from "react"
import {
  CheckCircle2,
  ArrowRight,
  ArrowDownRight,
  Layers,
  Network,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { hasKeywordOverlap } from "@/lib/cad-lab/keyword-matching"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CadLabModule, EarlyCostEstimate } from "@/lib/cad-lab-types"

// ─── System Architecture ─────────────────────────────────────────────

/**
 * Represents a connection between two modules based on matching outputs to inputs.
 */
export interface ModuleConnection {
  fromId: string
  fromName: string
  toId: string
  toName: string
  /** The shared interface label (the matching input/output string) */
  label: string
}

/**
 * Builds the interface connection graph by matching module outputs to other
 * modules' inputs using keyword overlap (2+ shared significant words).
 *
 * @param modules - Array of decomposed modules
 * @returns Array of connections between modules
 */
export function buildConnectionGraph(modules: CadLabModule[]): ModuleConnection[] {
  const connections: ModuleConnection[] = []

  for (const source of modules) {
    for (const output of source.outputs) {
      for (const target of modules) {
        if (target.id === source.id) continue
        for (const input of target.inputs) {
          if (hasKeywordOverlap(output, input)) {
            // Avoid duplicate connections between same pair with same label
            const isDuplicate = connections.some(
              (c) => c.fromId === source.id && c.toId === target.id && c.label === output,
            )
            if (!isDuplicate) {
              connections.push({
                fromId: source.id,
                fromName: source.name,
                toId: target.id,
                toName: target.name,
                label: output,
              })
            }
          }
        }
      }
    }
  }

  return connections
}

/**
 * SystemArchitecture — Visualises how sub-assemblies relate to each other.
 *
 * @description Shows the product as a root node with all modules as children,
 * interface connections between modules, and status/lead-time at a glance.
 * Addresses the anxiety of not seeing the overall shape while working
 * bottom-up on individual modules.
 *
 * @param subject - Product name
 * @param modules - Array of decomposed modules
 * @param onModuleClick - Callback when a module node is clicked (scrolls to detail)
 */
export function SystemArchitecture({
  subject,
  modules,
  onModuleClick,
  earlyCostEstimates = {},
}: {
  subject: string
  modules: CadLabModule[]
  onModuleClick: (moduleId: string) => void
  earlyCostEstimates?: Record<string, EarlyCostEstimate>
}): React.ReactNode {
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null)

  const connections = useMemo(() => buildConnectionGraph(modules), [modules])

  // Find which modules connect to the hovered module
  const hoveredConnections = useMemo(() => {
    if (!hoveredModuleId) return new Set<string>()
    const related = new Set<string>()
    for (const conn of connections) {
      if (conn.fromId === hoveredModuleId) related.add(conn.toId)
      if (conn.toId === hoveredModuleId) related.add(conn.fromId)
    }
    return related
  }, [hoveredModuleId, connections])

  const maxLeadWeeks = Math.max(...modules.map((m) => m.leadWeeks), 0)
  const generatedCount = modules.filter((m) => m.status === "generated").length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="h-4 w-4" />
          System Architecture
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {connections.length} interface{connections.length !== 1 ? "s" : ""} mapped
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reassurance message */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your product has been decomposed into{" "}
          <span className="font-medium text-foreground">{modules.length} manufacturable sub-assemblies</span>.
          {connections.length > 0
            ? " The diagram below shows how they connect. Each module will be designed individually — the interfaces ensure they fit together."
            : " Each module will be designed individually, then assembled into the final product."}
        </p>

        {/* Assembly graph */}
        <div className="relative">
          {/* Product root node */}
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-international-orange/40 bg-gradient-to-r from-international-orange-light/20 to-background shadow-sm">
              <Layers className="h-4 w-4 text-international-orange" />
              <div>
                <p className="text-sm font-semibold text-foreground">{subject}</p>
                <p className="text-xs text-muted-foreground">
                  {modules.length} sub-assemblies &middot; {maxLeadWeeks}w critical path
                  {generatedCount > 0 && (
                    <> &middot; <span className="text-status-success">{generatedCount}/{modules.length} built</span></>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Connector line from root to module grid */}
          <div className="flex justify-center mb-3">
            <div className="w-0.5 h-6 bg-muted" />
          </div>

          {/* Module nodes grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {modules.map((mod) => {
              const isHovered = hoveredModuleId === mod.id
              const isConnectedToHovered = hoveredConnections.has(mod.id)
              const isCriticalPath = mod.leadWeeks === maxLeadWeeks
              const moduleConnections = connections.filter(
                (c) => c.fromId === mod.id || c.toId === mod.id,
              )

              return (
                <button
                  key={mod.id}
                  onClick={() => onModuleClick(mod.id)}
                  onMouseEnter={() => setHoveredModuleId(mod.id)}
                  onMouseLeave={() => setHoveredModuleId(null)}
                  className={cn(
                    "relative text-left p-3 rounded-lg border transition-all duration-200",
                    "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-international-orange focus:ring-offset-2",
                    mod.status === "generated" && "border-status-success/40 bg-status-success-light/10",
                    mod.status === "interface_ready" && "border-status-info/40 bg-status-info-light/10",
                    mod.status === "failed" && "border-destructive/40 bg-destructive/5",
                    mod.status === "pending" && "border-muted bg-muted/10",
                    isCriticalPath && mod.status !== "generated" && "border-l-2 border-l-international-orange",
                    isHovered && "shadow-md ring-1 ring-international-orange/30",
                    isConnectedToHovered && !isHovered && "ring-1 ring-status-info/40 bg-status-info-light/5",
                    hoveredModuleId && !isHovered && !isConnectedToHovered && "opacity-50",
                  )}
                  title={`Click to view details for ${mod.name}`}
                >
                  {/* Status dot + name */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          mod.status === "generated" && "bg-status-success",
                          mod.status === "interface_ready" && "bg-status-info",
                          mod.status === "failed" && "bg-destructive",
                          mod.status === "pending" && "bg-muted-foreground",
                        )}
                      />
                      <p className="text-xs font-semibold text-foreground truncate">{mod.name}</p>
                    </div>
                    {isCriticalPath && (
                      <span className="text-xs font-mono text-international-orange bg-international-orange-light/30 px-1 py-0.5 rounded flex-shrink-0">
                        CP
                      </span>
                    )}
                  </div>

                  {/* P9: Early cost estimate badge */}
                  {earlyCostEstimates[mod.id] && (
                    <p
                      className="text-xs text-muted-foreground font-mono mb-1"
                      title="Rough estimate from interface specs — refines after generation"
                    >
                      ~${Math.round(earlyCostEstimates[mod.id].totalLow)} – ${Math.round(earlyCostEstimates[mod.id].totalHigh)}
                    </p>
                  )}

                  {/* IO summary — inputs & outputs at a glance */}
                  {(mod.outputs.length > 0 || mod.inputs.length > 0) && (
                    <div className="hidden md:block space-y-1 mt-1.5">
                      {mod.outputs.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Out:</span>
                          {mod.outputs.slice(0, 2).map((out, j) => (
                            <span key={j} className="text-[10px] text-foreground bg-muted/60 rounded px-1 py-0.5 leading-tight truncate max-w-[100px]">{out}</span>
                          ))}
                          {mod.outputs.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{mod.outputs.length - 2}</span>
                          )}
                        </div>
                      )}
                      {mod.inputs.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">In:</span>
                          {mod.inputs.slice(0, 2).map((inp, j) => (
                            <span key={j} className="text-[10px] text-foreground bg-muted/60 rounded px-1 py-0.5 leading-tight truncate max-w-[100px]">{inp}</span>
                          ))}
                          {mod.inputs.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{mod.inputs.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Compact stats */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {moduleConnections.length > 0 && (
                      <span className="flex items-center gap-0.5" title={`${moduleConnections.length} interface connection${moduleConnections.length !== 1 ? "s" : ""}`}>
                        <ArrowDownRight className="h-2.5 w-2.5" />
                        {moduleConnections.length} interface{moduleConnections.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {mod.status === "generated" && (
                      <CheckCircle2 className="h-2.5 w-2.5 text-status-success ml-auto" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Interface connections list */}
        {connections.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Interface Connections
            </p>
            <div className="flex flex-wrap gap-2">
              {connections.map((conn, idx) => (
                <div
                  key={`${conn.fromId}-${conn.toId}-${idx}`}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all duration-200",
                    (hoveredModuleId === conn.fromId || hoveredModuleId === conn.toId)
                      ? "border-status-info/50 bg-status-info-light/20 text-foreground"
                      : "border-muted bg-muted/20 text-muted-foreground",
                  )}
                >
                  <button
                    onClick={() => onModuleClick(conn.fromId)}
                    className="font-medium hover:text-international-orange transition-colors"
                  >
                    {conn.fromName}
                  </button>
                  <ArrowRight className="h-3 w-3 flex-shrink-0" />
                  <button
                    onClick={() => onModuleClick(conn.toId)}
                    className="font-medium hover:text-international-orange transition-colors"
                  >
                    {conn.toName}
                  </button>
                  <span className="text-xs font-mono opacity-70 ml-0.5">({conn.label})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
          <span className="font-medium">Status:</span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-muted-foreground" /> Pending
          </span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-status-info" /> Dims Planned
          </span>
          <span className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-status-success" /> CAD Generated
          </span>
          <span className="flex items-center gap-1 ml-2">
            <span className="text-xs font-mono text-international-orange bg-international-orange-light/30 px-1 py-0.5 rounded">CP</span> Critical Path
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
