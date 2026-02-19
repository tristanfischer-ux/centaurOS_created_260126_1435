"use client"

/**
 * @file schematic-view.tsx — React Flow schematic with draggable assembly slots.
 *
 * @description Renders an interactive diagram of the assembly with clickable,
 * draggable slot nodes, group-colored edges, and completion indicator.
 * Replaces the previous static SVG implementation.
 *
 * @component
 * @example
 * <SchematicView
 *   slots={slots}
 *   placedComponents={placed}
 *   activeSlotId={activeId}
 *   onSlotClick={handleSlotClick}
 * />
 */

import { useMemo, useCallback, useEffect } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { cn } from "@/lib/utils"

import { AssemblySlotNode } from "./assembly-slot-node"
import type { AssemblySlotNodeData } from "./assembly-slot-node"
import { computeAssemblyLayout } from "./assembly-auto-layout"

import type { TemplateSlot, PlacedComponent } from "@/actions/assembly-builder"
import type { Node, Edge } from "@xyflow/react"

// ─── Group Colors ────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  propulsion: { fill: "#fff7ed", stroke: "#f97316", text: "#c2410c" },
  structure: { fill: "#eff6ff", stroke: "#3b82f6", text: "#1d4ed8" },
  electronics: { fill: "#faf5ff", stroke: "#a855f7", text: "#7e22ce" },
  power: { fill: "#fefce8", stroke: "#eab308", text: "#a16207" },
  sensors: { fill: "#ecfdf5", stroke: "#10b981", text: "#047857" },
  payload: { fill: "#fdf2f8", stroke: "#ec4899", text: "#be185d" },
  control: { fill: "#f0f9ff", stroke: "#0ea5e9", text: "#0369a1" },
  default: { fill: "#f8fafc", stroke: "#94a3b8", text: "#475569" },
}

function getGroupColor(group: string): { fill: string; stroke: string; text: string } {
  return GROUP_COLORS[group.toLowerCase()] ?? GROUP_COLORS.default
}

// ─── Props ───────────────────────────────────────────────────────────

/** Screen-space position for popover placement */
export interface SlotClickPosition {
  x: number
  y: number
}

interface SchematicViewProps {
  /** Slot definitions from the template */
  slots: TemplateSlot[]
  /** Currently placed components */
  placedComponents: PlacedComponent[]
  /** Currently active/selected slot ID */
  activeSlotId: string | null
  /** Called when a slot is clicked, with optional screen position for popover */
  onSlotClick: (slotId: string, position?: SlotClickPosition) => void
  /** Custom SVG from template (optional; not used in React Flow version) */
  customSvg?: string | null
  /** Optional className */
  className?: string
}

// ─── Node types ──────────────────────────────────────────────────────

const nodeTypes = {
  assemblySlot: AssemblySlotNode,
}

// ─── Build nodes and edges ───────────────────────────────────────────

function buildNodesAndEdges(
  slots: TemplateSlot[],
  placedBySlot: Map<string, PlacedComponent>,
  activeSlotId: string | null,
  layout: Map<string, { x: number; y: number }>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const grouped = new Map<string, TemplateSlot[]>()
  for (const slot of slots) {
    const g = slot.group.toLowerCase()
    if (!grouped.has(g)) grouped.set(g, [])
    grouped.get(g)!.push(slot)
  }

  for (const slot of slots) {
    const pos = layout.get(slot.id) ?? { x: slot.position.x, y: slot.position.y }
    const placed = placedBySlot.get(slot.id)
    const isFilled = !!placed
    const color = getGroupColor(slot.group)
    const data: AssemblySlotNodeData = {
      slotId: slot.id,
      label: slot.label,
      group: slot.group,
      required: slot.required,
      isFilled,
      componentName: placed?.componentName,
      isActive: activeSlotId === slot.id,
      groupFill: color.fill,
      groupStroke: color.stroke,
      groupText: color.text,
    }
    nodes.push({
      id: slot.id,
      type: "assemblySlot",
      position: pos,
      data,
      draggable: true,
    })
  }

  // Group label annotation nodes — non-interactive labels at group centroids
  for (const [groupName, groupSlots] of grouped) {
    const positions = groupSlots.map(
      (s) => layout.get(s.id) ?? { x: s.position.x, y: s.position.y },
    )
    const centroidX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length
    const minY = Math.min(...positions.map((p) => p.y))
    const color = getGroupColor(groupName)

    nodes.push({
      id: `group-label-${groupName}`,
      type: "default",
      position: { x: centroidX, y: minY - 40 },
      data: { label: groupName.charAt(0).toUpperCase() + groupName.slice(1) },
      draggable: false,
      selectable: false,
      connectable: false,
      style: {
        background: "transparent",
        border: "none",
        boxShadow: "none",
        fontSize: "11px",
        fontWeight: 600,
        color: color.text,
        opacity: 0.7,
        padding: 0,
        pointerEvents: "none" as const,
        width: "auto",
      },
    })
  }

  // Edges — subtle dashed lines connecting same-group nodes
  const edges: Edge[] = []
  for (const [, groupSlots] of grouped) {
    if (groupSlots.length < 2) continue
    const color = getGroupColor(groupSlots[0].group)
    for (let i = 0; i < groupSlots.length - 1; i++) {
      edges.push({
        id: `edge-${groupSlots[i].id}-${groupSlots[i + 1].id}`,
        source: groupSlots[i].id,
        target: groupSlots[i + 1].id,
        type: "smoothstep",
        animated: false,
        style: {
          stroke: color.stroke,
          strokeWidth: 1,
          strokeDasharray: "6 4",
          opacity: 0.35,
        },
      })
    }
  }

  return { nodes, edges }
}

// ─── Component ───────────────────────────────────────────────────────

export function SchematicView({
  slots,
  placedComponents,
  activeSlotId,
  onSlotClick,
  className,
}: SchematicViewProps): React.ReactNode {
  const placedBySlot = useMemo(() => {
    const map = new Map<string, PlacedComponent>()
    for (const pc of placedComponents) {
      if (pc.slotId) map.set(pc.slotId, pc)
    }
    return map
  }, [placedComponents])

  const layout = useMemo(() => computeAssemblyLayout(slots), [slots])

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildNodesAndEdges(slots, placedBySlot, activeSlotId, layout),
    [slots, placedBySlot, activeSlotId, layout],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync node data when slots/placed/activeSlotId change; preserve drag positions
  useEffect(() => {
    const next = buildNodesAndEdges(slots, placedBySlot, activeSlotId, layout)
    setNodes((current) =>
      next.nodes.map((nextNode) => {
        const existing = current.find((n) => n.id === nextNode.id)
        return {
          ...nextNode,
          position: existing?.position ?? nextNode.position,
        }
      }),
    )
    setEdges(next.edges)
  }, [slots, placedBySlot, activeSlotId, layout, setNodes, setEdges])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Skip group label annotation nodes
      if (node.id.startsWith("group-label-")) return

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const position: SlotClickPosition = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      onSlotClick(node.id, position)
    },
    [onSlotClick],
  )

  const filledCount = placedComponents.filter((pc) =>
    slots.some((s) => s.id === pc.slotId),
  ).length
  const totalCount = slots.length
  const completionPct = totalCount > 0 ? (filledCount / totalCount) * 100 : 0

  // Unique groups present in slots for the legend
  const activeGroups = useMemo(() => {
    const seen = new Set<string>()
    return slots
      .map((s) => s.group.toLowerCase())
      .filter((g) => {
        if (seen.has(g)) return false
        seen.add(g)
        return true
      })
  }, [slots])

  if (slots.length === 0) {
    return (
      <div className={cn("flex items-center justify-center w-full h-full min-h-[300px]", className)}>
        <p className="text-sm text-muted-foreground">No slots in this assembly.</p>
      </div>
    )
  }

  return (
    <div className={cn("relative w-full h-full", className)}>
      {/* Completion ring */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke={
              completionPct === 100
                ? "hsl(var(--status-success))"
                : "hsl(var(--international-orange))"
            }
            strokeWidth="3"
            strokeDasharray={`${(completionPct / 100) * 87.96} 87.96`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="text-xs font-mono font-medium text-muted-foreground">
          {filledCount}/{totalCount}
        </span>
      </div>

      {/* Group color legend */}
      {activeGroups.length > 1 && (
        <div className="absolute top-4 left-4 z-10 bg-background/90 rounded-lg border shadow-sm px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Groups
          </p>
          <div className="flex flex-col gap-1">
            {activeGroups.map((group) => {
              const color = getGroupColor(group)
              return (
                <div key={group} className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color.stroke }}
                  />
                  <span className="text-[11px] text-foreground capitalize">
                    {group}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        className="bg-muted/10"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as AssemblySlotNodeData
            return d.groupStroke ?? "#94a3b8"
          }}
          maskColor="hsl(var(--background) / 0.8)"
        />
      </ReactFlow>

      {/* Hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <p className="text-xs text-muted-foreground bg-background/90 rounded-full px-3 py-1.5 shadow-sm border">
          Drag nodes to rearrange · Click a slot to assign a component
        </p>
      </div>
    </div>
  )
}
