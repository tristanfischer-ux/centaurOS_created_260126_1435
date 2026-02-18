"use client"

/**
 * @file process-flow-diagram.tsx
 *
 * @description Visual process flow showing how modules connect via inputs/outputs.
 * Renders module nodes and edges where one module's output feeds another's input.
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
      <div className="px-4 py-2 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Module integration flow</p>
        <p className="text-xs text-muted-foreground">Outputs connect to inputs between modules</p>
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-3 min-w-max">
          {nodes.map((node, i) => (
            <div key={node.id} className="flex items-center gap-2">
              <div className="rounded-md border-2 border-international-orange/60 bg-international-orange-light/10 px-3 py-2 min-w-[120px]">
                <p className="text-xs font-semibold text-foreground truncate">{node.name}</p>
                {node.outputs.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    out: {node.outputs.slice(0, 2).join(", ")}
                    {node.outputs.length > 2 ? "…" : ""}
                  </p>
                )}
              </div>
              {i < nodes.length - 1 && (
                <div className="flex items-center gap-0.5 text-muted-foreground">
                  <div className="w-4 h-0.5 bg-border" />
                  <span className="text-[10px]">→</span>
                  <div className="w-4 h-0.5 bg-border" />
                </div>
              )}
            </div>
          ))}
        </div>
        {edges.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">Connections ({edges.length})</p>
            <ul className="space-y-1 text-xs text-foreground">
              {edges.slice(0, 12).map((e, i) => {
                const fromName = nodes.find((n) => n.id === e.from)?.name ?? e.from
                const toName = nodes.find((n) => n.id === e.to)?.name ?? e.to
                return (
                  <li key={i}>
                    <span className="font-medium">{fromName}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium">{toName}</span>
                    {e.label && <span className="text-muted-foreground"> ({e.label})</span>}
                  </li>
                )
              })}
              {edges.length > 12 && (
                <li className="text-muted-foreground">+{edges.length - 12} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
