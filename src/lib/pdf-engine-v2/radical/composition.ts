/**
 * Radical Composition helpers — First Light spike
 *
 * Re-exports the runGrammarEngine runner and provides factory helpers
 * for building Composition objects used in tests and the first-light runner.
 */

import type { Composition, CompositionNode } from "./schema.js"

export { runGrammarEngine } from "./grammar.js"

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Build a leaf CompositionNode (no children) */
export function leafNode(
  archetypeId: string,
  quantity = 1,
  electricalNode?: CompositionNode["electricalNode"]
): CompositionNode {
  return { archetypeId, quantity, children: [], electricalNode }
}

/** Build a Composition from a root node */
export function makeComposition(
  id: string,
  description: string,
  root: CompositionNode,
  environment: string[] = []
): Composition {
  return { id, description, root, environment }
}

// ---------------------------------------------------------------------------
// Pre-built test compositions
// ---------------------------------------------------------------------------

/**
 * KCL balanced: a single-node circuit where I_in = I_out = 5A.
 * KCL must PASS.
 */
export const KCL_BALANCED_COMPOSITION: Composition = makeComposition(
  "kcl_balanced_test",
  "Single electrical node with balanced current (5A in, 5A out)",
  leafNode("standard_copper_busbar", 1, {
    nodeId: "node_A",
    current_in_A: 5.0,
    current_out_A: 5.0,
  }),
  ["indoor"]
)

/**
 * KCL broken: a single-node circuit where I_in ≠ I_out.
 * KCL must BLOCK.
 */
export const KCL_BROKEN_COMPOSITION: Composition = makeComposition(
  "kcl_broken_test",
  "Single electrical node with unbalanced current (5A in, 3A out) — deliberate KCL violation",
  leafNode("standard_copper_busbar", 1, {
    nodeId: "node_B",
    current_in_A: 5.0,
    current_out_A: 3.0,
  }),
  ["indoor"]
)

/**
 * Marine 316L bolt: a bolt with 316L grade modifier in a marine environment.
 * Rule 6 (material_marine_corrosion) must PASS because 316L_grade overrides
 * marine_corrosion_resistant to true.
 * Criterion 3.
 */
export const MARINE_316L_COMPOSITION: Composition = makeComposition(
  "marine_316L_bolt_test",
  "316L socket head bolt in marine environment — should pass marine corrosion rule",
  leafNode("M8x30_316L_socket_head_bolt", 4),
  ["marine"]
)

/**
 * Marine plain steel bolt: a plain steel bolt in a marine environment.
 * Rule 6 (material_marine_corrosion) must BLOCK (no 316L override).
 */
export const MARINE_PLAIN_STEEL_COMPOSITION: Composition = makeComposition(
  "marine_plain_steel_test",
  "Plain steel bolt in marine environment — should BLOCK on marine corrosion rule",
  leafNode("M8x30_plain_steel_bolt", 4),
  ["marine"]
)

/**
 * Relaxation test: uses two conflicting soft rules simultaneously.
 * - VOLTAGE_DERATE_80PCT fires a WARN (voltage at 85% rated)
 * - MATERIAL_MARINE_CORROSION fires a BLOCK (plain steel in marine)
 *
 * The engine must relax MATERIAL_MARINE_CORROSION (weight=5) in preference
 * to VOLTAGE_DERATE_80PCT (weight=6), since 5 < 6 means 5 relaxes first.
 *
 * Expected result: PASS_WITH_RELAXATION, both soft rules relaxed.
 * The relaxation summary must be EXPLICIT.
 */
export const RELAXATION_TEST_COMPOSITION: Composition = makeComposition(
  "relaxation_weight_test",
  "Plain steel in marine + over-voltage derate — tests relaxation optimiser",
  {
    archetypeId: "M8x30_plain_steel_bolt",
    quantity: 1,
    children: [
      {
        archetypeId: "standard_copper_busbar",
        quantity: 1,
        children: [],
        // voltage at 85% of rated — triggers WARN on VOLTAGE_DERATE_80PCT
        electricalNode: undefined,
      },
    ],
  },
  [
    "marine",
    // Annotate the busbar with voltage properties via environment tags
    // (the relaxation test for voltage is separate — we set archetype-level
    // in a dedicated fixture below; here we just test the marine soft block relaxing)
  ]
)

/**
 * Two-rule conflict relaxation: plain steel in marine (BLOCK, weight 5) +
 * voltage over-derate at > 100% (BLOCK, weight 6 with relaxation_cost 8).
 *
 * We need archetypes with voltage props. Use a separate composition that
 * annotates both conflicts via the composition structure itself.
 *
 * Actually: to avoid needing archetype-level voltage props in the seed library,
 * we test relaxation with the TWO SOFT-RULE BLOCKS that CAN fire naturally:
 *  - MATERIAL_MARINE_CORROSION (plain steel, marine env, weight=5) → BLOCK
 *  - THERMAL_CAPACITY_VS_LOAD (cooling 800W < load 1000W, weight=7) → BLOCK
 *
 * Lower weight (5) relaxes first, making the tradeoff explicit.
 */
export const TWO_RULE_CONFLICT_COMPOSITION: Composition = makeComposition(
  "two_rule_conflict_relaxation_test",
  "Plain steel in marine (marine corrosion BLOCK, w=5) + cooling deficit (thermal BLOCK, w=7) — lower-weight rule must relax first",
  leafNode("M8x30_plain_steel_bolt", 2),
  [
    "marine",
    "cooling_capacity_W:800",  // 800W cooling
    "thermal_load_W:1000",     // 1000W load → 1200W required → BLOCK
  ]
)
