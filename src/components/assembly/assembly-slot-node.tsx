"use client"

/**
 * @file assembly-slot-node.tsx — Custom React Flow node for assembly slots.
 *
 * @description Renders a slot card with group color accent, filled/empty state,
 * required indicator, category icon, tier badge, and connection handles.
 * Used in the assembly schematic view.
 *
 * @component
 * @related schematic-view.tsx, assembly-auto-layout.ts
 */

import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import {
  Cpu,
  Zap,
  Box,
  CircleDot,
  Wrench,
  Shield,
  Plus,
  PackageCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { NodeProps } from "@xyflow/react"
import type { LucideIcon } from "lucide-react"

// ─── Constants ───────────────────────────────────────────────────────

export const NODE_WIDTH = 220
export const NODE_HEIGHT = 96

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}

// ─── Category Icons ──────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  motor: Zap,
  fastener: Wrench,
  bearing: CircleDot,
  connector: Cpu,
  structural: Shield,
  electronics: Cpu,
  sensor: CircleDot,
  default: Box,
}

function getCategoryIcon(category: string): LucideIcon {
  const lower = category.toLowerCase()
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return CATEGORY_ICONS.default
}

// ─── Tier Labels ─────────────────────────────────────────────────────

function getTierLabel(tier: string): string {
  if (tier === "universal") return "T1"
  if (tier === "electromechanical") return "T2"
  return "T3"
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
  /** Component category (for icon lookup) — populated when filled */
  category?: string
  /** Component tier — populated when filled */
  tier?: string
  /** Whether the placed component is from the catalog (has geometryTypeSlug) */
  isCatalogPart?: boolean
  [key: string]: unknown
}

// ─── Component ───────────────────────────────────────────────────────

function AssemblySlotNodeComponent({ data }: NodeProps): React.ReactNode {
  const nodeData = data as unknown as AssemblySlotNodeData
  const isFilled = nodeData.isFilled
  const isActive = nodeData.isActive === true
  const Icon = nodeData.category ? getCategoryIcon(nodeData.category) : Box

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 shadow-sm transition-all duration-200",
        "hover:shadow-md cursor-pointer",
        isActive && "ring-2 ring-international-orange ring-offset-2 shadow-lg",
        !isFilled && !isActive && "border-dashed",
      )}
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        backgroundColor: isFilled ? nodeData.groupFill : "white",
        borderColor: isActive
          ? "hsl(var(--international-orange))"
          : isFilled
            ? nodeData.groupStroke
            : "hsl(var(--muted-foreground) / 0.3)",
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
        {isFilled ? (
          <>
            {/* Top row: category icon + tier badge */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div
                  className="flex h-5 w-5 items-center justify-center rounded"
                  style={{ backgroundColor: `${nodeData.groupStroke}20` }}
                >
                  <Icon className="h-3 w-3" style={{ color: nodeData.groupStroke }} />
                </div>
                {nodeData.isCatalogPart && (
                  <PackageCheck
                    className="h-3 w-3"
                    style={{ color: nodeData.groupStroke }}
                    aria-label="Verified catalog part"
                  />
                )}
              </div>
              {nodeData.tier && (
                <span
                  className="text-[9px] font-bold rounded px-1.5 py-0.5 leading-none"
                  style={{
                    backgroundColor: `${nodeData.groupStroke}18`,
                    color: nodeData.groupText,
                  }}
                >
                  {getTierLabel(nodeData.tier)}
                </span>
              )}
            </div>

            {/* Component name */}
            <p
              className="text-xs font-semibold leading-tight truncate"
              style={{ color: nodeData.groupText }}
            >
              {truncateText(nodeData.componentName ?? "", 26)}
            </p>

            {/* Slot label */}
            <p
              className="text-[10px] mt-0.5 truncate"
              style={{ color: nodeData.groupStroke, opacity: 0.8 }}
            >
              {nodeData.label}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 py-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40">
              <Plus className="h-3 w-3 text-muted-foreground/60" />
            </div>
            <p className="text-xs font-medium text-muted-foreground truncate max-w-[180px]">
              {truncateText(nodeData.label, 24)}
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              {nodeData.required ? "Required" : "Click to assign"}
            </p>
            {nodeData.required && (
              <span
                className="absolute top-2 right-2 inline-block w-2 h-2 rounded-full bg-destructive"
                title="Required slot"
              />
            )}
          </div>
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
