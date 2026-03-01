/**
 * @file module-node.tsx — Custom React Flow node for CAD module flow canvas.
 *
 * @description Renders a module card with per-port handles — every input gets
 * a left Handle and every output gets a right Handle, enabling edges to connect
 * to specific ports. Port labels are color-coded pills by signal type.
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
import { ArrowUpFromLine, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

import type { NodeProps } from "@xyflow/react"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { SignalType } from "../lib/flow-edge-utils"
import { classifySignalType, SIGNAL_CONFIG } from "../lib/flow-edge-utils"

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface ModuleNodeData {
  /** Module display name */
  label: string
  /** One-sentence purpose */
  purpose: string
  /** Module pipeline status */
  status: CadLabModule["status"]
  /** ALL input names (not truncated) */
  inputs: string[]
  /** ALL output names (not truncated) */
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

/* ─── Port row height (px) — used for Handle positioning ──────────────── */

const PORT_ROW_H = 22

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

/* ─── Signal type pill styling ─────────────────────────────────────────── */

function signalPillClasses(signalType: SignalType): string {
  const cfg = SIGNAL_CONFIG[signalType]
  return cn(cfg.activeBg, cfg.activeBorder, cfg.text)
}

/* ─── Port row component ──────────────────────────────────────────────── */

function PortRow({
  name,
  type,
}: {
  name: string
  type: "input" | "output"
}) {
  const signalType = classifySignalType(name)
  const pillClasses = signalPillClasses(signalType)
  const isInput = type === "input"

  // INTENT: Center Handle in its row. The PortRow div is `position: relative`,
  // so `top` here is relative to the row, not the node root. React Flow reads
  // the absolute DOM position via getBoundingClientRect(), so edges connect correctly.
  const handleTop = PORT_ROW_H / 2

  return (
    <div
      className={cn(
        "relative flex items-center gap-1 px-2",
        isInput ? "justify-start" : "justify-end",
      )}
      style={{ height: PORT_ROW_H }}
    >
      <Handle
        type={isInput ? "target" : "source"}
        position={isInput ? Position.Left : Position.Right}
        id={name}
        style={{ top: handleTop }}
        className="!w-2 !h-2 !border-2 !border-background !bg-international-orange"
      />

      <span
        title={name}
        className={cn(
          "truncate max-w-[160px] text-[10px] rounded px-1 py-px leading-tight border",
          pillClasses,
        )}
      >
        {name}
      </span>

      {!isInput && <ArrowUpFromLine className="h-2.5 w-2.5 shrink-0 text-chart-3" />}
    </div>
  )
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
      {/* Header: name + purpose */}
      <div className="p-2.5 pb-1.5 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", statusDotColor(d.status))} />
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1 flex-1 min-w-0">
            {d.label}
          </p>
          {d.isOrphan && (
            <AlertCircle className="h-3 w-3 text-status-warning shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
          {d.purpose}
        </p>
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Input ports */}
      {d.inputCount > 0 && (
        <div className="pt-1 pb-0.5">
          <div className="flex items-center gap-1 px-2" style={{ height: 18 }}>
            <span className="text-[9px] font-medium text-chart-2 uppercase tracking-wider">
              Inputs ({d.inputCount})
            </span>
          </div>
          {d.inputs.map((inp) => (
            <PortRow
              key={inp}
              name={inp}
              type="input"
            />
          ))}
        </div>
      )}

      {/* Output ports */}
      {d.outputCount > 0 && (
        <div className={cn("pb-1.5", d.inputCount > 0 && "pt-1")}>
          <div className="flex items-center gap-1 px-2" style={{ height: 18 }}>
            <ArrowUpFromLine className="h-2.5 w-2.5 text-chart-3" />
            <span className="text-[9px] font-medium text-chart-3 uppercase tracking-wider">
              Outputs ({d.outputCount})
            </span>
          </div>
          {d.outputs.map((out) => (
            <PortRow
              key={out}
              name={out}
              type="output"
            />
          ))}
        </div>
      )}

      {/* Connection count footer */}
      {(d.receivesFrom > 0 || d.feedsTo > 0) && (
        <div className="px-2.5 pb-2 pt-1 border-t border-border">
          <p className="text-[9px] text-muted-foreground">
            {[
              d.receivesFrom > 0 && `Receives from ${d.receivesFrom}`,
              d.feedsTo > 0 && `Feeds ${d.feedsTo}`,
            ].filter(Boolean).join(" \u00B7 ")}
          </p>
        </div>
      )}
    </div>
  )
}

export const ModuleNode = memo(ModuleNodeComponent)
