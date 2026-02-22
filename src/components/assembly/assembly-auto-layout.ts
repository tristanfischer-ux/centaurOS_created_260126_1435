/**
 * @file assembly-auto-layout.ts — Group-based auto-layout for assembly schematic nodes.
 *
 * @description Computes non-overlapping positions for assembly slots by grouping
 * by slot.group and arranging groups in a grid with slots stacked vertically
 * within each group. Used by the React Flow schematic view.
 *
 * @related schematic-view.tsx, assembly-slot-node.tsx
 */

import type { TemplateSlot } from "@/actions/assembly-builder"

// ─── Constants ───────────────────────────────────────────────────────

/** Width of each slot node (must match AssemblySlotNode) */
export const NODE_WIDTH = 220
/** Height of each slot node */
export const NODE_HEIGHT = 96
/** Vertical gap between slots within a group */
export const SLOT_GAP_Y = 24
/** Horizontal gap between groups */
export const GROUP_GAP_X = 120
/** Vertical gap between groups */
export const GROUP_GAP_Y = 60
/** Space reserved above each group for the group label */
export const GROUP_LABEL_HEIGHT = 28
/** Padding around the entire layout */
export const PADDING = 60
/** Number of columns in the group grid */
const MAX_GROUP_COLUMNS = 3

// ─── Layout Result ───────────────────────────────────────────────────

export interface LayoutPosition {
  x: number
  y: number
}

/**
 * Computes positions for all slots using a group-based grid layout.
 * Groups are laid out in columns; within each group, slots are stacked vertically.
 *
 * @param slots - Template slots from the assembly
 * @returns Map of slot id to { x, y } in React Flow coordinate space
 */
export function computeAssemblyLayout(
  slots: TemplateSlot[],
): Map<string, LayoutPosition> {
  const result = new Map<string, LayoutPosition>()

  if (slots.length === 0) return result

  // 1. Group slots by slot.group (preserve order of first occurrence)
  const groupOrder: string[] = []
  const groups = new Map<string, TemplateSlot[]>()
  for (const slot of slots) {
    const g = slot.group.toLowerCase()
    if (!groups.has(g)) {
      groupOrder.push(g)
      groups.set(g, [])
    }
    groups.get(g)!.push(slot)
  }

  // 2. Build list of groups with heights
  const groupMeta: { key: string; slots: TemplateSlot[]; height: number }[] = []
  for (const key of groupOrder) {
    const groupSlots = groups.get(key)!
    const height =
      GROUP_LABEL_HEIGHT +
      groupSlots.length * NODE_HEIGHT +
      Math.max(0, groupSlots.length - 1) * SLOT_GAP_Y
    groupMeta.push({ key, slots: groupSlots, height })
  }

  // 3. Distribute groups into columns (column 0: 0,3,6... column 1: 1,4,7... column 2: 2,5,8...)
  const columnY = new Array(MAX_GROUP_COLUMNS).fill(PADDING)

  for (let i = 0; i < groupMeta.length; i++) {
    const col = i % MAX_GROUP_COLUMNS
    const { slots: groupSlots, height } = groupMeta[i]
    const x = PADDING + col * (NODE_WIDTH + GROUP_GAP_X)
    let y = columnY[col] + GROUP_LABEL_HEIGHT

    for (const slot of groupSlots) {
      result.set(slot.id, { x, y })
      y += NODE_HEIGHT + SLOT_GAP_Y
    }

    columnY[col] += height + GROUP_GAP_Y
  }

  return result
}
