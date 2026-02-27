/**
 * @file supply-flow-types.ts — Types for the Supply Flow fan diagram.
 *
 * @description Defines the node, edge, and data shapes used by the
 * supply-flow page and its SVG diagram component.
 */

/** Which column/tier a node belongs to in the fan diagram. */
export type SupplyFlowTier = "component" | "manufacturer" | "assembler"

/** A single node in the supply flow diagram. */
export interface SupplyFlowNode {
  id: string
  label: string
  sublabel?: string
  tier: SupplyFlowTier
  meta?: Record<string, string | number | boolean>
}

/** A directed edge between two nodes. */
export interface SupplyFlowEdge {
  fromId: string
  toId: string
  label?: string
  /** Match score (0–100) — drives stroke width. */
  score?: number
}

/** Complete data payload returned by the server action. */
export interface SupplyFlowData {
  nodes: SupplyFlowNode[]
  edges: SupplyFlowEdge[]
  projectName: string
}
