"use client"

/**
 * @file assembly-slot-node.tsx — Custom React Flow node for assembly slots.
 *
 * @description Renders a slot card with group color accent, filled/empty state,
 * required indicator, and connection handles. Used in the assembly schematic view.
 *
 * @component
 * @related schematic-view.tsx, assembly-auto-layout.ts
 */

import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"

import type { NodeProps } from "@xyflow/react"

// ─── Constants ───────────────────────────────────────────────────────

const NODE_WIDTH = 200
const NODE_HEIGHT = 80

/** Max characters before truncation */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}

// ─── Types ───────────────────────────────────────────────────────────

export interface AssemblySlotNodeData {
  slotId: string
  label: string
  group: string
  required: boolean
  isFilled: boolean
  componentName?: string
  /** Whether this slot is the active/selected one (orange ring) */
  isActive?: boolean
  /** Group fill (background tint) */
  groupFill: string
  /** Group stroke (border/accent) */
  groupStroke: string
  /** Group text color */
  groupText: string
  [key: string]: unknown
}

// ─── Component ───────────────────────────────────────────────────────

function AssemblySlotNodeComponent({ data }: NodeProps): React.ReactNode {
  const nodeData = data as unknown as AssemblySlotNodeData
  const isFilled = nodeData.isFilled
  const isActive = nodeData.isActive === true

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 shadow-sm transition-all duration-200",
        "hover:shadow-md cursor-pointer",
        isActive && "ring-2 ring-international-orange ring-offset-2 shadow-lg",
        !isFilled && !isActive && "animate-pulse border-dashed",
      )}
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        backgroundColor: isFilled ? nodeData.groupFill : "white",
        borderColor: isActive ? "hsl(var(--international-orange))" : isFilled ? nodeData.groupStroke : "hsl(var(--muted-foreground) / 0.4)",
        borderLeftWidth: "4px",
        borderLeftColor: nodeData.groupStroke,
      }}
      role="button"
      tabIndex={0}
      aria-label={`${nodeData.label}${isFilled ? ` — ${nodeData.componentName ?? ""}` : " — empty"}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-background"
      />

      <div className="p-2.5 h-full flex flex-col justify-center">
        {/* Required indicator */}
        {nodeData.required && !isFilled && (
          <div className="absolute top-2 right-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-destructive"
              title="Required slot"
            />
          </div>
        )}

        {isFilled ? (
          <>
            <p
              className="text-xs font-semibold leading-tight truncate pr-6"
              style={{ color: nodeData.groupText }}
            >
              {truncateText(nodeData.componentName ?? "", 22)}
            </p>
            <p className="text-[10px] mt-0.5 opacity-80" style={{ color: nodeData.groupStroke }}>
              {nodeData.label}
            </p>
            <span
              className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: nodeData.groupStroke }}
            />
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-muted-foreground truncate pr-6">
              {truncateText(nodeData.label, 22)}
            </p>
            <p className="text-[10px] text-muted-foreground/80 mt-0.5">
              Click to assign
            </p>
          </>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-muted-foreground/60 !border-2 !border-background"
      />
    </div>
  )
}

export const AssemblySlotNode = memo(AssemblySlotNodeComponent)
export { NODE_WIDTH, NODE_HEIGHT }
