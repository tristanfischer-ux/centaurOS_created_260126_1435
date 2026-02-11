/**
 * @file architecture-node.tsx — Custom horizontal React Flow node
 *
 * @description Compact module card for the horizontal architecture map.
 * Shows module name, purpose snippet, status, and lead time.
 * Left/right handles for horizontal flow layout.
 */

"use client"

import React, { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { AlertTriangle, Box, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

import type { NodeProps } from "@xyflow/react"

// ─── Types ───────────────────────────────────────────────────────────

export interface ArchitectureNodeData {
  label: string
  purpose: string
  accentColor: string
  status: "complete" | "needs-diagnostic" | "partial" | "not-started"
  progress: number
  isGating: boolean
  leadWeeks: number
  moduleId: string
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────

function statusDotColor(status: ArchitectureNodeData["status"]): string {
  switch (status) {
    case "complete": return "#10b981"
    case "needs-diagnostic": return "#f59e0b"
    case "partial": return "#3b82f6"
    default: return "#94a3b8"
  }
}

// ─── Component ───────────────────────────────────────────────────────

function ArchitectureNodeComponent({ data, selected }: NodeProps): React.ReactNode {
  const nodeData = data as unknown as ArchitectureNodeData
  const dotColor = statusDotColor(nodeData.status)

  const handleClick = (): void => {
    document.getElementById(`module-v2-${nodeData.moduleId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  return (
    <div
      className={cn(
        "bg-background rounded-xl border-2 shadow-sm w-[220px] cursor-pointer",
        "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        selected ? "shadow-lg ring-2 ring-international-orange/20" : "border-muted",
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick() }}
    >
      {/* Left handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-international-orange !border-2 !border-background"
      />

      {/* Top accent bar */}
      <div className="h-1 w-full rounded-t-xl" style={{ backgroundColor: nodeData.accentColor }} />

      <div className="p-3 space-y-1.5">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div
            className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: nodeData.accentColor + "18" }}
          >
            <Box className="h-3 w-3" style={{ color: nodeData.accentColor }} />
          </div>
          <p className="text-xs font-semibold text-foreground leading-snug line-clamp-1 flex-1">
            {nodeData.label}
          </p>
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
          />
        </div>

        {/* Purpose */}
        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
          {nodeData.purpose}
        </p>

        {/* Progress + badges */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(nodeData.progress, 100)}%`, backgroundColor: dotColor }}
            />
          </div>
          <span className="text-[9px] tabular-nums text-muted-foreground">{nodeData.leadWeeks}w</span>
        </div>

        {/* Gating badge */}
        {nodeData.isGating && (
          <span className={cn(
            "inline-flex items-center gap-1 text-[9px] font-medium rounded-full px-1.5 py-0.5",
            nodeData.status === "needs-diagnostic"
              ? "text-status-warning-dark bg-status-warning-light"
              : "text-status-success-dark bg-status-success-light",
          )}>
            {nodeData.status === "needs-diagnostic" ? (
              <><AlertTriangle className="h-2 w-2" />Gating</>
            ) : (
              <><CheckCircle2 className="h-2 w-2" />Gating</>
            )}
          </span>
        )}
      </div>

      {/* Right handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-international-orange !border-2 !border-background"
      />
    </div>
  )
}

export const ArchitectureNode = memo(ArchitectureNodeComponent)
