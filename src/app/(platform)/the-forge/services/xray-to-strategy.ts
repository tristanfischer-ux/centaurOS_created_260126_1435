/**
 * @file xray-to-strategy.ts — Bridge from X-Ray scans to the Strategy Canvas
 *
 * @description Converts X-Ray outputs into Strategy Canvas nodes:
 * - XRaySpec.idea → StrategicGoal (top-level node in canvas)
 * - XRaySpec.modules → Milestones under that goal
 * - Module requirements/lead times → informs milestone sequencing
 *
 * CURRENT STATE: Stub with documented integration signatures.
 *
 * DECISION: Stub — real canvas integration planned for future release.
 * 1. Call createStrategicGoal() from src/actions/canvas.ts:
 *    - title: spec.idea
 *    - description: spec.function
 *    - is_ghost: true, ghost_source: 'ai' (appears as draft for user to confirm)
 * 2. For each module, call createMilestones():
 *    - title: module.name
 *    - description: module.purpose
 *    - parent: the StrategicGoal node
 *    - position: based on module order
 * 3. Create WorkEdge dependencies between milestones based on module IO:
 *    - If module A's output feeds module B's input, create A → B edge
 * 4. The canvas will show the entire machine build as a strategy tree
 *
 * @related
 * - Canvas types: src/types/canvas.ts (StrategicGoal, Milestone, CanvasObjective, CanvasTask)
 * - Canvas actions: src/actions/canvas.ts (createStrategicGoal, createMilestones, etc.)
 * - Ghost items: is_ghost flag + ghost_source: 'ai' | 'template' | 'user'
 * - WorkEdge: { source, target, label } for dependency arrows
 */

import type { XRaySpec, ModuleSpec } from "./xray-schema"

export interface StrategyExportResult {
  goalId: string
  milestoneIds: string[]
  edgeCount: number
}

/**
 * Exports an X-Ray spec to the Strategy Canvas as ghost nodes.
 *
 * @param spec - The scanned X-Ray spec
 * @param foundryId - The foundry to create strategy nodes in
 * @param canvasId - The target canvas ID
 * @returns IDs of created nodes for further linking
 *
 * @security Requires authenticated user with canvas.edit permission
 * @audit Logs xray_to_strategy_export event
 */
export async function exportToStrategy(
  _spec: XRaySpec,
  _foundryId: string,
  _canvasId: string
): Promise<StrategyExportResult> {
  // DECISION: Stub — real canvas integration planned for future release
  //
  // const goal = await createStrategicGoal({
  //   title: spec.idea,
  //   description: spec.function,
  //   canvas_id: canvasId,
  //   foundry_id: foundryId,
  //   is_ghost: true,
  //   ghost_source: 'ai',
  // })
  //
  // const milestoneIds = await Promise.all(
  //   spec.modules.map((m, i) => createMilestones({
  //     title: m.name,
  //     description: m.purpose,
  //     parent_id: goal.id,
  //     position: { x: i * 200, y: 200 },
  //     is_ghost: true,
  //     ghost_source: 'ai',
  //   }))
  // )
  //
  // // Create edges based on IO flow
  // const edges = deriveEdgesFromModuleIO(spec.modules)
  // await createWorkEdges(canvasId, edges)

  throw new Error("exportToStrategy is not yet implemented — stub only.")
}

/**
 * Derives dependency edges from module IO relationships.
 *
 * If module A's output matches module B's input, A depends-on B.
 *
 * @param modules - The modules to analyze
 * @returns Edges as { sourceModuleId, targetModuleId, label }
 */
export function deriveEdgesFromModuleIO(
  modules: ModuleSpec[]
): Array<{ source: string; target: string; label: string }> {
  const edges: Array<{ source: string; target: string; label: string }> = []

  for (const source of modules) {
    for (const target of modules) {
      if (source.id === target.id) continue
      // Check if source output feeds target input
      const overlap = source.io.out.filter((out) =>
        target.io.in.some((inp) => inp.toLowerCase().includes(out.toLowerCase()) || out.toLowerCase().includes(inp.toLowerCase()))
      )
      if (overlap.length > 0) {
        edges.push({
          source: source.id,
          target: target.id,
          label: overlap.join(", "),
        })
      }
    }
  }

  return edges
}
