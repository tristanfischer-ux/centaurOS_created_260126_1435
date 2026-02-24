"use client"

/**
 * @file process-flow-diagram.tsx
 *
 * @description Visual process flow showing how modules connect via inputs/outputs.
 * Renders module nodes in a responsive grid and edges where one module's output
 * feeds another's input.
 */

import { useMemo } from "react"
import type { CadLabModule } from "@/lib/cad-lab-types"

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

interface FlowEdge {
  from: string
  to: string
  label?: string
}

/**
 * Builds edges by matching outputs of one module to inputs of another
 * (by signal name or keyword overlap).
 */
function buildEdges(modules: CadLabModule[]): FlowEdge[] {
  const edges: FlowEdge[] = []
  const outputToModules = new Map<string, { moduleId: string; output: string }[]>()
  for (const m of modules) {
    for (const out of m.outputs) {
      const key = out.toLowerCase().replace(/\s+/g, "-")
      if (!outputToModules.has(key)) outputToModules.set(key, [])
      outputToModules.get(key)!.push({ moduleId: m.id, output: out })
    }
  }
  for (const m of modules) {
    for (const inp of m.inputs) {
      const key = inp.toLowerCase().replace(/\s+/g, "-")
      const producers = outputToModules.get(key)
      if (producers) {
        for (const { moduleId } of producers) {
          if (moduleId !== m.id) edges.push({ from: moduleId, to: m.id, label: inp })
        }
      }
    }
  }
  return edges
}

export function ProcessFlowDiagram({ modules, className = "" }: ProcessFlowDiagramProps): React.ReactNode {
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

  if (modules.length === 0) {
    return (
      <div className={`rounded-lg border border-border bg-muted/20 p-6 text-center ${className}`}>
        <p className="text-sm text-muted-foreground">Map sub-assemblies to see the process flow.</p>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border border-border bg-card overflow-hidden ${className}`}>
      <div className="px-5 py-3 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Module integration flow</p>
        <p className="text-xs text-muted-foreground">Outputs connect to inputs between modules</p>
      </div>

      {/* Module grid — responsive, all visible without scrolling */}
      <div className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {nodes.map((node, i) => (
            <div
              key={node.id}
              className="rounded-lg border-2 border-international-orange/40 bg-international-orange-light/5 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground leading-tight">{node.name}</p>
                <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 flex-shrink-0">
                  {i + 1}
                </span>
              </div>
              {node.outputs.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Outputs</p>
                  <div className="flex flex-wrap gap-1">
                    {node.outputs.slice(0, 3).map((out, j) => (
                      <span key={j} className="text-[11px] text-foreground bg-muted/60 rounded px-1.5 py-0.5 leading-tight">
                        {out}
                      </span>
                    ))}
                    {node.outputs.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{node.outputs.length - 3}</span>
                    )}
                  </div>
                </div>
              )}
              {node.inputs.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Inputs</p>
                  <div className="flex flex-wrap gap-1">
                    {node.inputs.slice(0, 3).map((inp, j) => (
                      <span key={j} className="text-[11px] text-foreground bg-muted/60 rounded px-1.5 py-0.5 leading-tight">
                        {inp}
                      </span>
                    ))}
                    {node.inputs.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{node.inputs.length - 3}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Connections — how modules link to each other */}
        {edges.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-foreground mb-3">
              Connections <span className="text-muted-foreground font-normal">({edges.length})</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {edges.slice(0, 12).map((e, i) => {
                const fromName = nodes.find((n) => n.id === e.from)?.name ?? e.from
                const toName = nodes.find((n) => n.id === e.to)?.name ?? e.to
                return (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded-md px-3 py-2">
                    <span className="font-medium text-foreground truncate">{fromName}</span>
                    <span className="text-international-orange flex-shrink-0">&rarr;</span>
                    <span className="font-medium text-foreground truncate">{toName}</span>
                    {e.label && (
                      <span className="text-muted-foreground text-[10px] ml-auto flex-shrink-0 truncate max-w-[120px]">
                        {e.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {edges.length > 12 && (
              <p className="text-[10px] text-muted-foreground mt-2">+{edges.length - 12} more connections</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
