/**
 * @file xray-module-node.tsx — Custom React Flow node for X-Ray modules
 *
 * @description Renders a module card inside the React Flow schematic.
 * Displays module name, purpose, status indicator, and progress.
 * Styled to match the strategy page (orange edges) and agents page
 * (colored left accent bar) visual patterns.
 *
 * @related
 * - Strategy node: src/app/(platform)/canvas/strategy-node.tsx
 * - Agents prompt node: src/app/(platform)/agents/components/prompt-node.tsx
 * - X-Ray schematic: ./xray-schematic.tsx
 */

"use client"

import React, { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { AlertTriangle, Box, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

import type { NodeProps } from "@xyflow/react"

// ─── Types ───────────────────────────────────────────────────────────

export interface XRayModuleNodeData {
  /** Module display name */
  label: string
  /** One-sentence purpose */
  purpose: string
  /** Accent color for the left border (hex) */
  accentColor: string
  /** Module status */
  status: "complete" | "needs-diagnostic" | "partial" | "not-started"
  /** Progress percentage (0-100) */
  progress: number
  /** Whether this is the gating module */
  isGating: boolean
  /** Lead time in weeks */
  leadWeeks: number
  /** Module ID for scroll target */
  moduleId: string
  [key: string]: unknown
}

// ─── Status helpers ──────────────────────────────────────────────────

function statusDotColor(status: XRayModuleNodeData["status"]): string {
  switch (status) {
    case "complete":
      return "#10b981"
    case "needs-diagnostic":
      return "#f59e0b"
    case "partial":
      return "#3b82f6"
    default:
      return "#94a3b8"
  }
}

function statusLabel(status: XRayModuleNodeData["status"]): string {
  switch (status) {
    case "complete":
      return "Complete"
    case "needs-diagnostic":
      return "Needs diagnostic"
    case "partial":
      return "In progress"
    default:
      return "Not started"
  }
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * Custom React Flow node for X-Ray module cards.
 *
 * @description Renders a compact module card with colored accent bar,
 * status indicator, progress bar, and click-to-scroll behavior.
 */
function XRayModuleNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as XRayModuleNodeData
  const dotColor = statusDotColor(nodeData.status)

  const handleClick = (): void => {
    document.getElementById(`module-${nodeData.moduleId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  return (
    <div
      className={cn(
        "bg-background rounded-xl border-2 shadow-sm w-[280px] cursor-pointer",
        "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        selected
          ? "shadow-lg ring-2 ring-international-orange/20"
          : "border-muted"
      )}
      style={{
        borderLeftColor: nodeData.accentColor,
        borderLeftWidth: "4px",
      }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick()
      }}
    >
      {/* Top connection handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-international-orange !border-2 !border-background"
      />

      <div className="p-3 space-y-2">
        {/* Header: icon + name + status dot */}
        <div className="flex items-start gap-2">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: nodeData.accentColor + "18" }}
          >
            <Box className="h-3.5 w-3.5" style={{ color: nodeData.accentColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1 flex-1">
                {nodeData.label}
              </p>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: dotColor }}
                title={statusLabel(nodeData.status)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">
              {nodeData.purpose}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(nodeData.progress, 100)}%`,
                backgroundColor: dotColor,
              }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {nodeData.progress}%
          </span>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          {nodeData.isGating && nodeData.status === "needs-diagnostic" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-status-warning-dark bg-status-warning-light rounded-full px-2 py-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
              Gating
            </span>
          )}
          {nodeData.isGating && nodeData.status !== "needs-diagnostic" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-status-success-dark bg-status-success-light rounded-full px-2 py-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Gating
            </span>
          )}
          {nodeData.leadWeeks > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {nodeData.leadWeeks}w lead
            </span>
          )}
        </div>
      </div>

      {/* Bottom connection handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-international-orange !border-2 !border-background"
      />
    </div>
  )
}

export const XRayModuleNode = memo(XRayModuleNodeComponent)
