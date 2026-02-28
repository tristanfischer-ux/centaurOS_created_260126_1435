/**
 * @file module-node.tsx — Custom React Flow node for CAD module flow canvas.
 *
 * @description Renders a compact, draggable module card inside the React Flow
 * canvas. Shows module name, purpose, I/O pills, connection counts, and status.
 * Follows the xray-module-node.tsx pattern (memo-wrapped, Handle components).
 *
 * FLOW: module-flow-canvas.tsx registers this as nodeTypes["module"]
 *
 * @related
 * - X-Ray module node: ../../components/xray-module-node.tsx
 * - Canvas: ./module-flow-canvas.tsx
 */

"use client"

import React, { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { ArrowDownToLine, ArrowUpFromLine, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

import type { NodeProps } from "@xyflow/react"
import type { CadLabModule } from "@/lib/cad-lab-types"

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface ModuleNodeData {
  /** Module display name */
  label: string
  /** One-sentence purpose */
  purpose: string
  /** Module pipeline status */
  status: CadLabModule["status"]
  /** First 3 input names for pill display */
  inputs: string[]
  /** First 3 output names for pill display */
  outputs: string[]
  /** Total input count */
  inputCount: number
  /** Total output count */
  outputCount: number
  /** Inbound connection count */
  receivesFrom: number
  /** Outbound connection count */
  feedsTo: number
  /** Whether this module is currently generating */
  isGenerating: boolean
  /** Whether this module has zero connections */
  isOrphan: boolean
  /** Module ID for click callback */
  moduleId: string
  /** React Flow requires index signature */
  [key: string]: unknown
}

/* ─── Status dot color ─────────────────────────────────────────────────── */

function statusDotColor(status: CadLabModule["status"]): string {
  switch (status) {
    case "generated":
      return "bg-status-success"
    case "specified":
    case "interface_ready":
      return "bg-status-info"
    case "researched":
      return "bg-chart-2"
    case "failed":
      return "bg-destructive"
    default:
      return "bg-muted-foreground/40"
  }
}

/* ─── Component ────────────────────────────────────────────────────────── */

function ModuleNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as ModuleNodeData

  return (
    <div
      className={cn(
        "bg-background rounded-xl border-2 shadow-sm w-[220px]",
        "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        selected
          ? "ring-2 ring-international-orange/20 shadow-lg border-muted"
          : "border-muted",
        d.isGenerating && "ring-2 ring-international-orange/40 animate-pulse",
      )}
      style={{ borderLeftColor: "hsl(var(--international-orange))", borderLeftWidth: "4px" }}
    >
      {/* Left handle — target (inputs flow in) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-international-orange !border-2 !border-background"
      />

      <div className="p-2.5 space-y-1.5">
        {/* Header: name + status dot */}
        <div className="flex items-center gap-2">
          <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", statusDotColor(d.status))} />
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1 flex-1 min-w-0">
            {d.label}
          </p>
          {d.isOrphan && (
            <AlertCircle className="h-3 w-3 text-status-warning shrink-0" />
          )}
        </div>

        {/* Purpose */}
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
          {d.purpose}
        </p>

        {/* Input pills */}
        {d.inputCount > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <ArrowDownToLine className="h-2.5 w-2.5 text-chart-2" />
              <span className="text-[9px] font-medium text-chart-2 uppercase tracking-wider">In</span>
            </div>
            <div className="flex flex-wrap gap-0.5">
              {d.inputs.map((inp, j) => (
                <span
                  key={j}
                  title={inp}
                  className="truncate max-w-[90px] text-[10px] text-foreground bg-chart-2/10 border border-chart-2/20 rounded px-1 py-px leading-tight"
                >
                  {inp}
                </span>
              ))}
              {d.inputCount > 3 && (
                <span className="text-[9px] text-muted-foreground">+{d.inputCount - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* Output pills */}
        {d.outputCount > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <ArrowUpFromLine className="h-2.5 w-2.5 text-chart-3" />
              <span className="text-[9px] font-medium text-chart-3 uppercase tracking-wider">Out</span>
            </div>
            <div className="flex flex-wrap gap-0.5">
              {d.outputs.map((out, j) => (
                <span
                  key={j}
                  title={out}
                  className="truncate max-w-[90px] text-[10px] text-foreground bg-chart-3/10 border border-chart-3/20 rounded px-1 py-px leading-tight"
                >
                  {out}
                </span>
              ))}
              {d.outputCount > 3 && (
                <span className="text-[9px] text-muted-foreground">+{d.outputCount - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* Connection count footer */}
        {(d.receivesFrom > 0 || d.feedsTo > 0) && (
          <p className="text-[9px] text-muted-foreground pt-1 border-t border-border">
            {[
              d.receivesFrom > 0 && `Receives from ${d.receivesFrom}`,
              d.feedsTo > 0 && `Feeds ${d.feedsTo}`,
            ].filter(Boolean).join(" \u00B7 ")}
          </p>
        )}
      </div>

      {/* Right handle — source (outputs flow out) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-international-orange !border-2 !border-background"
      />
    </div>
  )
}

export const ModuleNode = memo(ModuleNodeComponent)
