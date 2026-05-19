/**
 * @file radical/phase-0-slice/bess-hardcoded-tree.ts
 *
 * Phase 0 vertical slice — hardcoded BESS Radical tree.
 *
 * This is NOT an LLM-emitted tree — it is derived from the Week-2
 * decomposition JSON (decomposition-bess.json) and hardcoded here.
 * The purpose is to validate that the tree SHAPE works in all production
 * paths (resolution → grammar → cost rollup → render) before Phase 1
 * begins changing MODULE_DECOMPOSITION_SYSTEM_PA to emit trees live.
 *
 * Activated only when RADICAL_PHASE_0_SLICE=true.
 *
 * This file lifts the BESS composition tree from the demo grammar-pass
 * and returns it as a RadicalTree (with spec version set).
 */

import type { RadicalTree, Composition, CompositionNode } from '../schema.js'
import { CURRENT_RADICAL_SPEC_VERSION } from '../schema.js'

// ---------------------------------------------------------------------------
// BESS module groupings (from decomposition-bess.json)
// ---------------------------------------------------------------------------

const BESS_MODULE_CHILDREN: Record<string, Array<{ archetypeId: string; quantity: number }>> = {
  battery_rack_assembly: [
    { archetypeId: 'lfp_prismatic_cell_280Ah', quantity: 4375 },
    { archetypeId: 'steel_battery_rack_frame', quantity: 1 },
  ],
  battery_management_system_bms: [
    { archetypeId: 'bms_master_controller', quantity: 1 },
    { archetypeId: 'bms_slave_cell_monitor', quantity: 12 },  // midpoint of 10–14
  ],
  power_conversion_system_pcs: [
    { archetypeId: 'pcs_inverter_1mw_bidirectional', quantity: 1 },
    { archetypeId: 'step_up_transformer_400v_11kv', quantity: 1 },
  ],
  dc_distribution_switchgear: [
    { archetypeId: 'dc_contactor_1500v_300a', quantity: 2 },
    { archetypeId: 'dc_mccb_1500v_2000a', quantity: 1 },
    { archetypeId: 'ac_acb_400v_2000a', quantity: 1 },
    { archetypeId: 'ac_output_circuit_breaker', quantity: 1 },
    {
      archetypeId: 'dc_busbar_800v_2000a',
      quantity: 1,
    },
    { archetypeId: 'precharge_resistor_hv', quantity: 2 },
    { archetypeId: 'g99_protection_relay', quantity: 1 },
  ],
  thermal_management_system: [
    { archetypeId: 'liquid_cooling_loop_1mw', quantity: 1 },
  ],
  container_enclosure_fit_out: [
    { archetypeId: 'mineral_wool_insulation_panel', quantity: 1 },
    { archetypeId: 'fire_rated_steel_door_panic', quantity: 1 },
    { archetypeId: 'cable_transit_frame_ip55', quantity: 6 },
    { archetypeId: 'ac_distribution_board_ip55', quantity: 1 },
  ],
  fire_detection_and_suppression_system_fss: [
    { archetypeId: 'container_fire_suppression_system', quantity: 1 },
    { archetypeId: 'fire_suppression_cylinder_novec', quantity: 2 },
    { archetypeId: 'li_ion_offgas_detector', quantity: 4 },
    { archetypeId: 'arc_flash_detection_sensor', quantity: 2 },
  ],
  energy_management_system_ems_scada: [
    { archetypeId: 'ems_scada_controller', quantity: 1 },
    { archetypeId: 'managed_ethernet_switch_industrial', quantity: 2 },
    { archetypeId: 'ups_3kva_industrial', quantity: 1 },
  ],
}

// ---------------------------------------------------------------------------
// Build the BESS Radical tree
// ---------------------------------------------------------------------------

export function buildBessHardcodedTree(): RadicalTree {
  // Build word-level (module) nodes
  const moduleNodes: CompositionNode[] = Object.entries(BESS_MODULE_CHILDREN).map(
    ([moduleId, parts]) => {
      const children: CompositionNode[] = parts.map(p => {
        const node: CompositionNode = {
          archetypeId: p.archetypeId,
          quantity: p.quantity,
          children: [],
        }

        // Attach KCL electrical node for DC busbar (line 11)
        if (p.archetypeId === 'dc_busbar_800v_2000a') {
          node.electricalNode = {
            nodeId: 'dc_busbar_main',
            current_in_A: 2000,
            current_out_A: 2000,
          }
        }

        return node
      })

      return {
        archetypeId: `module_${moduleId}`,
        quantity: 1,
        children,
      }
    }
  )

  const root: CompositionNode = {
    archetypeId: 'bess_container_3_5mwh_system',
    quantity: 1,
    children: moduleNodes,
  }

  const composition: Composition = {
    id: 'bess_container_3_5mwh',
    description: 'BESS Container 3.5 MWh / 1 MW, 40-ft ISO, LFP prismatic — Phase 0 hardcoded tree',
    root,
    environment: [
      'indoor',
      'industrial',
      'cooling_capacity_W:1200000',
      'thermal_load_W:1000000',
      'fluid_mass_in_kg_s:2.5',
      'fluid_mass_out_kg_s:2.5',
    ],
  }

  return {
    radical_spec_version: CURRENT_RADICAL_SPEC_VERSION,
    composition,
    meta: {
      created_at: new Date().toISOString(),
      product_slug: 'bess-container',
      authored_by: 'phase-0-hardcoded',
    },
  }
}

/**
 * Flatten the BESS tree to a list of leaf nodes (archetypes with quantities).
 * Skips intermediate module nodes (archetypeId starts with "module_").
 */
export function flattenBessTreeLeaves(tree: RadicalTree): Array<{ archetypeId: string; quantity: number }> {
  const leaves: Array<{ archetypeId: string; quantity: number }> = []

  function walk(node: CompositionNode): void {
    if (!node.archetypeId.startsWith('module_') && node.archetypeId !== 'bess_container_3_5mwh_system') {
      leaves.push({ archetypeId: node.archetypeId, quantity: node.quantity })
    }
    for (const child of node.children) walk(child)
  }

  walk(tree.composition.root)
  return leaves
}
