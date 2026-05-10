/**
 * @file radical/demo/grammar-pass.ts
 *
 * Grammar pass for the BESS Radical demo.
 *
 * Builds a BESS-specific RadicalLibrary from the BESS decomposition tree,
 * then runs all 6 grammar rules against a BESS Composition object.
 *
 * BESS-specific context injected as environment annotations:
 *   - cooling_capacity_W: 1_200_000  (1.2 MW chiller, 20% above 1 MW load)
 *   - thermal_load_W: 1_000_000      (1 MW power conversion losses)
 *   - fluid_mass_in_kg_s: 2.5        (coolant loop — closed, balanced)
 *   - fluid_mass_out_kg_s: 2.5
 *
 * The BESS is an indoor (not marine) industrial environment.
 * KCL: declared at the DC busbar node (2000A in, 2000A out).
 */

import type { Composition, CompositionNode, RadicalLibrary } from '../schema.js'
import { buildSeedLibrary } from '../seed-library.js'
import {
  runGrammarEngine,
  KCL_NODE_BALANCE,
  GALVANIC_ALUMINIUM_COPPER_CONTACT,
  VOLTAGE_DERATE_80PCT,
  MASS_BALANCE_CLOSED_LOOP,
  THERMAL_CAPACITY_VS_LOAD,
  MATERIAL_MARINE_CORROSION,
  type EngineResult,
  type GrammarRule,
} from '../grammar.js'
import type { ResolvedLeaf } from './resolution.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GrammarPassResult {
  engineResult: EngineResult
  rulesFired: number
  passCount: number
  warnCount: number
  blockCount: number
  relaxationsApplied: number
  summary: string[]
}

// ---------------------------------------------------------------------------
// Build a BESS-enriched RadicalLibrary
//
// The seed library covers steel/copper/polymer. BESS adds semiconductor, LFP,
// switchgear radicals. For the grammar pass, we only need what the grammar rules
// actually query (primary_material, marine_corrosion_resistant, voltage_ props).
// We extend the seed library with BESS-specific archetypes and characters.
// ---------------------------------------------------------------------------

function buildBessLibrary(resolvedLeaves: ResolvedLeaf[]): RadicalLibrary {
  const lib = buildSeedLibrary()

  // ── Additional BESS radicals ──────────────────────────────────────────────
  lib.radicals.set('silicon_semiconductor_function', {
    id: 'silicon_semiconductor_function',
    category: 'function',
    properties: { function_class: 'semiconductor_switching', primary_material: 'silicon' },
  })
  lib.radicals.set('lithium_iron_phosphate_chemistry', {
    id: 'lithium_iron_phosphate_chemistry',
    category: 'material',
    properties: {
      primary_material: 'lfp',
      energy_density_wh_kg: 160,
      marine_corrosion_resistant: true,
      max_service_temp_c: 60,
    },
  })
  lib.radicals.set('electrochemical_energy_function', {
    id: 'electrochemical_energy_function',
    category: 'function',
    properties: { function_class: 'electrochemical_storage' },
  })
  lib.radicals.set('electromechanical_switching_function', {
    id: 'electromechanical_switching_function',
    category: 'function',
    properties: { function_class: 'electromechanical_switching' },
  })
  lib.radicals.set('magnetic_coupling_function', {
    id: 'magnetic_coupling_function',
    category: 'function',
    properties: { function_class: 'magnetic_coupling' },
  })
  lib.radicals.set('thermal_transfer_function', {
    id: 'thermal_transfer_function',
    category: 'function',
    properties: { function_class: 'thermal_transfer' },
  })
  lib.radicals.set('fluid_flow_state', {
    id: 'fluid_flow_state',
    category: 'state_of_matter',
    properties: { phase: 'liquid', compressible: false, flow_capable: true },
  })
  lib.radicals.set('mineral_fibre_material', {
    id: 'mineral_fibre_material',
    category: 'material',
    properties: {
      primary_material: 'mineral_wool',
      thermal_conductivity_w_mk: 0.033,
      marine_corrosion_resistant: true,
      max_service_temp_c: 700,
    },
  })
  lib.radicals.set('pressure_vessel_function', {
    id: 'pressure_vessel_function',
    category: 'function',
    properties: { function_class: 'pressure_containment' },
  })
  lib.radicals.set('chemical_suppressant_material', {
    id: 'chemical_suppressant_material',
    category: 'material',
    properties: { primary_material: 'novec_1230', marine_corrosion_resistant: true },
  })
  lib.radicals.set('chemical_sensing_function', {
    id: 'chemical_sensing_function',
    category: 'function',
    properties: { function_class: 'chemical_sensing' },
  })
  lib.radicals.set('optical_sensing_function', {
    id: 'optical_sensing_function',
    category: 'function',
    properties: { function_class: 'optical_sensing' },
  })

  // ── BESS characters ────────────────────────────────────────────────────────
  lib.characters.set('lfp_prismatic_cell', {
    id: 'lfp_prismatic_cell',
    radicals: ['lithium_iron_phosphate_chemistry', 'electrochemical_energy_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'battery_cell',
      primary_material: 'lfp',
      marine_corrosion_resistant: true,
      voltage_rated_V: 3.65,
      voltage_operating_V: 3.2,
    },
    function: 'electrochemical_storage',
  })
  lib.characters.set('dc_contactor', {
    id: 'dc_contactor',
    radicals: ['electrical_conducting_function', 'electromechanical_switching_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'contactor',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
      voltage_rated_V: 1500,
      voltage_operating_V: 1200, // 80% of rated — exactly at derating threshold
    },
    function: 'switching',
  })
  lib.characters.set('circuit_breaker', {
    id: 'circuit_breaker',
    radicals: ['electrical_conducting_function', 'electromechanical_switching_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'circuit_breaker',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
      voltage_rated_V: 1500,
      voltage_operating_V: 1000,
    },
    function: 'protection',
  })
  lib.characters.set('pcb_controller', {
    id: 'pcb_controller',
    radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'polymer_thermoplastic', 'solid_state_of_matter'],
    properties: {
      component_type: 'pcb',
      primary_material: 'polymer',
      marine_corrosion_resistant: true,
      voltage_rated_V: 24,
      voltage_operating_V: 12,
    },
    function: 'control',
  })
  lib.characters.set('power_converter', {
    id: 'power_converter',
    radicals: ['electrical_conducting_function', 'silicon_semiconductor_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'power_converter',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
      voltage_rated_V: 1500,
      voltage_operating_V: 1000,
    },
    function: 'power_conversion',
  })
  lib.characters.set('transformer', {
    id: 'transformer',
    radicals: ['electrical_conducting_function', 'magnetic_coupling_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'transformer',
      primary_material: 'copper',
      marine_corrosion_resistant: true,
      voltage_rated_V: 11000,
      voltage_operating_V: 11000,
    },
    function: 'voltage_transformation',
  })
  lib.characters.set('resistor', {
    id: 'resistor',
    radicals: ['electrical_conducting_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'resistor',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
      voltage_rated_V: 1500,
      voltage_operating_V: 1200,
    },
    function: 'current_limiting',
  })
  lib.characters.set('protection_relay', {
    id: 'protection_relay',
    radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'electromechanical_switching_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'protection_relay',
      primary_material: 'polymer',
      marine_corrosion_resistant: true,
      voltage_rated_V: 250,
      voltage_operating_V: 110,
    },
    function: 'protection',
  })
  lib.characters.set('gas_sensor', {
    id: 'gas_sensor',
    radicals: ['chemical_sensing_function', 'silicon_semiconductor_function', 'polymer_thermoplastic', 'solid_state_of_matter'],
    properties: {
      component_type: 'sensor',
      primary_material: 'polymer',
      marine_corrosion_resistant: true,
      voltage_rated_V: 5,
      voltage_operating_V: 3.3,
    },
    function: 'gas_detection',
  })
  lib.characters.set('optical_arc_sensor', {
    id: 'optical_arc_sensor',
    radicals: ['optical_sensing_function', 'silicon_semiconductor_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'sensor',
      primary_material: 'polymer',
      marine_corrosion_resistant: true,
    },
    function: 'arc_detection',
  })
  lib.characters.set('network_switch', {
    id: 'network_switch',
    radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'polymer_thermoplastic', 'solid_state_of_matter'],
    properties: {
      component_type: 'network_switch',
      primary_material: 'polymer',
      marine_corrosion_resistant: true,
      voltage_rated_V: 48,
      voltage_operating_V: 24,
    },
    function: 'network_switching',
  })
  lib.characters.set('ems_controller', {
    id: 'ems_controller',
    radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'polymer_thermoplastic', 'solid_state_of_matter'],
    properties: {
      component_type: 'controller',
      primary_material: 'polymer',
      marine_corrosion_resistant: true,
      voltage_rated_V: 24,
      voltage_operating_V: 12,
    },
    function: 'energy_management',
  })
  lib.characters.set('liquid_cooling_system', {
    id: 'liquid_cooling_system',
    radicals: ['thermal_transfer_function', 'fluid_flow_state', 'electrical_conducting_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'cooling_loop',
      primary_material: 'aluminium',
      marine_corrosion_resistant: true,
    },
    function: 'thermal_management',
  })
  lib.characters.set('thermal_insulation_panel', {
    id: 'thermal_insulation_panel',
    radicals: ['mineral_fibre_material', 'solid_state_of_matter'],
    properties: {
      component_type: 'insulation_panel',
      primary_material: 'mineral_wool',
      marine_corrosion_resistant: true,
    },
    function: 'thermal_insulation',
  })
  lib.characters.set('fire_suppression_system', {
    id: 'fire_suppression_system',
    radicals: ['pressure_vessel_function', 'chemical_suppressant_material', 'solid_state_of_matter'],
    properties: {
      component_type: 'fire_suppression',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
    },
    function: 'fire_suppression',
  })
  lib.characters.set('pressure_vessel', {
    id: 'pressure_vessel',
    radicals: ['pressure_vessel_function', 'steel', 'solid_state_of_matter'],
    properties: {
      component_type: 'pressure_vessel',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
    },
    function: 'pressure_containment',
  })
  lib.characters.set('steel_rack_frame', {
    id: 'steel_rack_frame',
    radicals: ['steel', 'solid_state_of_matter'],
    properties: {
      component_type: 'rack_frame',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
    },
    function: 'structural_support',
  })
  lib.characters.set('cable_transit_frame', {
    id: 'cable_transit_frame',
    radicals: ['polymer_thermoplastic', 'solid_state_of_matter'],
    properties: {
      component_type: 'cable_transit',
      primary_material: 'polymer',
      marine_corrosion_resistant: true,
    },
    function: 'cable_management',
  })
  lib.characters.set('steel_door', {
    id: 'steel_door',
    radicals: ['steel', 'solid_state_of_matter'],
    properties: {
      component_type: 'door',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
    },
    function: 'access_control',
  })
  lib.characters.set('switchboard_enclosure', {
    id: 'switchboard_enclosure',
    radicals: ['steel', 'electrical_conducting_function', 'solid_state_of_matter'],
    properties: {
      component_type: 'switchboard',
      primary_material: 'steel',
      marine_corrosion_resistant: false,
    },
    function: 'power_distribution',
  })

  // ── BESS modifiers ─────────────────────────────────────────────────────────
  const bessModifiers = [
    { id: '280Ah_capacity', category: 'rating' as const, properties: { capacity_ah: 280 } },
    { id: 'battery_management_grade', category: 'grade' as const, properties: { grade: 'bms_master' } },
    { id: 'cell_monitoring_grade', category: 'grade' as const, properties: { grade: 'bms_slave' } },
    { id: '1MW_rating', category: 'rating' as const, properties: { power_rating_mw: 1 } },
    { id: 'bidirectional_grade', category: 'grade' as const, properties: { bidirectional: true } },
    { id: '11kV_HV_grade', category: 'rating' as const, properties: { voltage_rated_V: 11000, voltage_operating_V: 11000 } },
    { id: '1500V_DC_rating', category: 'rating' as const, properties: { voltage_rated_V: 1500 } },
    { id: '2000A_rating', category: 'rating' as const, properties: { current_rating_A: 2000 } },
    { id: '400V_AC_rating', category: 'rating' as const, properties: { voltage_rated_V: 400, voltage_operating_V: 400 } },
    { id: '800V_DC_rating', category: 'rating' as const, properties: { voltage_rated_V: 800, voltage_operating_V: 640 } },
    { id: 'high_power_grade', category: 'grade' as const, properties: { high_power: true } },
    { id: 'G99_certification', category: 'certification' as const, properties: { g99_certified: true } },
    { id: '1MW_thermal_grade', category: 'rating' as const, properties: { thermal_capacity_w: 1200000 } },
    { id: 'halogenated_agent_grade', category: 'grade' as const, properties: { agent: 'novec_1230' } },
    { id: 'Li_ion_offgas_grade', category: 'grade' as const, properties: { target_gas: 'hf_co_co2' } },
    { id: 'SCADA_grade', category: 'grade' as const, properties: { scada_capable: true } },
    { id: 'managed_grade', category: 'grade' as const, properties: { managed: true } },
    { id: 'IP55', category: 'rating' as const, properties: { ingress_protection_rating: 'IP55' } },
    { id: 'UPS_grade', category: 'grade' as const, properties: { ups: true } },
    { id: '3kVA_rating', category: 'rating' as const, properties: { power_rating_kva: 3 } },
    { id: 'panic_hardware_grade', category: 'grade' as const, properties: { panic_hardware: true } },
    { id: 'fire_rated_grade', category: 'rating' as const, properties: { fire_rated_minutes: 60 } },
  ]
  for (const m of bessModifiers) lib.modifiers.set(m.id, m)

  // ── BESS archetypes (one per BOM line) ────────────────────────────────────
  const bessArchetypes = [
    { id: 'lfp_prismatic_cell_280Ah', character: 'lfp_prismatic_cell', modifiers: ['280Ah_capacity'] },
    { id: 'steel_battery_rack_frame', character: 'steel_rack_frame', modifiers: [] },
    { id: 'bms_master_controller', character: 'pcb_controller', modifiers: ['battery_management_grade'] },
    { id: 'bms_slave_cell_monitor', character: 'pcb_controller', modifiers: ['cell_monitoring_grade'] },
    { id: 'pcs_inverter_1mw_bidirectional', character: 'power_converter', modifiers: ['1MW_rating', 'bidirectional_grade'] },
    { id: 'step_up_transformer_400v_11kv', character: 'transformer', modifiers: ['11kV_HV_grade'] },
    { id: 'dc_contactor_1500v_300a', character: 'dc_contactor', modifiers: ['1500V_DC_rating'] },
    { id: 'dc_mccb_1500v_2000a', character: 'circuit_breaker', modifiers: ['1500V_DC_rating', '2000A_rating'] },
    { id: 'ac_acb_400v_2000a', character: 'circuit_breaker', modifiers: ['400V_AC_rating', '2000A_rating'] },
    { id: 'ac_output_circuit_breaker', character: 'circuit_breaker', modifiers: ['400V_AC_rating'] },
    { id: 'dc_busbar_800v_2000a', character: 'copper_busbar', modifiers: ['800V_DC_rating', '2000A_rating'] },
    { id: 'precharge_resistor_hv', character: 'resistor', modifiers: ['high_power_grade'] },
    { id: 'g99_protection_relay', character: 'protection_relay', modifiers: ['G99_certification'] },
    { id: 'liquid_cooling_loop_1mw', character: 'liquid_cooling_system', modifiers: ['1MW_thermal_grade'] },
    { id: 'mineral_wool_insulation_panel', character: 'thermal_insulation_panel', modifiers: [] },
    { id: 'container_fire_suppression_system', character: 'fire_suppression_system', modifiers: [] },
    { id: 'fire_suppression_cylinder_novec', character: 'pressure_vessel', modifiers: ['halogenated_agent_grade'] },
    { id: 'li_ion_offgas_detector', character: 'gas_sensor', modifiers: ['Li_ion_offgas_grade'] },
    { id: 'arc_flash_detection_sensor', character: 'optical_arc_sensor', modifiers: [] },
    { id: 'ems_scada_controller', character: 'ems_controller', modifiers: ['SCADA_grade'] },
    { id: 'managed_ethernet_switch_industrial', character: 'network_switch', modifiers: ['managed_grade', 'IP55'] },
    { id: 'ups_3kva_industrial', character: 'power_converter', modifiers: ['UPS_grade', '3kVA_rating'] },
    { id: 'fire_rated_steel_door_panic', character: 'steel_door', modifiers: ['panic_hardware_grade', 'fire_rated_grade'] },
    { id: 'cable_transit_frame_ip55', character: 'cable_transit_frame', modifiers: ['IP55'] },
    { id: 'ac_distribution_board_ip55', character: 'switchboard_enclosure', modifiers: ['IP55'] },
  ]
  for (const a of bessArchetypes) lib.archetypes.set(a.id, a)

  return lib
}

// ---------------------------------------------------------------------------
// Build BESS Composition tree
// ---------------------------------------------------------------------------

function buildBessComposition(resolvedLeaves: ResolvedLeaf[]): Composition {
  // Build composition nodes from resolved leaves
  const nodes: CompositionNode[] = resolvedLeaves.map(leaf => {
    const node: CompositionNode = {
      archetypeId: leaf.archetype_id,
      quantity: leaf.qty,
      children: [],
    }

    // Attach electrical node for DC busbar (line 11) — KCL check
    if (leaf.line_id === 11) {
      node.electricalNode = {
        nodeId: 'dc_busbar_main',
        current_in_A: 2000,
        current_out_A: 2000,
      }
    }

    return node
  })

  const root: CompositionNode = {
    archetypeId: 'bess_container_3_5mwh_system',
    quantity: 1,
    children: nodes,
  }

  return {
    id: 'bess_container_3_5mwh',
    description: 'BESS Container 3.5 MWh / 1 MW, 40-ft ISO, LFP prismatic',
    root,
    environment: [
      'indoor',
      'industrial',
      // Cooling loop annotations for THERMAL_CAPACITY_VS_LOAD rule
      'cooling_capacity_W:1200000',   // 1.2 MW chiller — 20% above 1 MW load
      'thermal_load_W:1000000',        // 1 MW system losses
      // Fluid mass balance for MASS_BALANCE_CLOSED_LOOP rule (closed coolant loop)
      'fluid_mass_in_kg_s:2.5',
      'fluid_mass_out_kg_s:2.5',
    ],
  }
}

// ---------------------------------------------------------------------------
// Main grammar pass function
// ---------------------------------------------------------------------------

export function runBessGrammarPass(resolvedLeaves: ResolvedLeaf[]): GrammarPassResult {
  // Need at least one archetype in the library — add a placeholder root archetype
  const lib = buildBessLibrary(resolvedLeaves)

  // Add the root system archetype (not in BESS decomposition — synthetic for grammar)
  if (!lib.characters.has('bess_system_root')) {
    lib.characters.set('bess_system_root', {
      id: 'bess_system_root',
      radicals: ['steel', 'electrical_conducting_function', 'solid_state_of_matter'],
      properties: { component_type: 'system_root', primary_material: 'steel', marine_corrosion_resistant: false },
      function: 'system_integration',
    })
  }
  if (!lib.archetypes.has('bess_container_3_5mwh_system')) {
    lib.archetypes.set('bess_container_3_5mwh_system', {
      id: 'bess_container_3_5mwh_system',
      character: 'bess_system_root',
      modifiers: [],
    })
  }

  const composition = buildBessComposition(resolvedLeaves)

  const rules: GrammarRule[] = [
    KCL_NODE_BALANCE,
    GALVANIC_ALUMINIUM_COPPER_CONTACT,
    VOLTAGE_DERATE_80PCT,
    MASS_BALANCE_CLOSED_LOOP,
    THERMAL_CAPACITY_VS_LOAD,
    MATERIAL_MARINE_CORROSION,
  ]

  console.log(`\n[grammar] Running ${rules.length} grammar rules against BESS composition...`)
  const engineResult = runGrammarEngine(composition, lib, rules)

  const rulesFired = engineResult.ruleResults.length
  const passCount = engineResult.ruleResults.filter(r => r.verdict === 'PASS').length
  const warnCount = engineResult.ruleResults.filter(r => r.verdict === 'WARN').length
  const blockCount = engineResult.ruleResults.filter(r => r.verdict === 'BLOCK').length
  const relaxationsApplied = engineResult.ruleResults.filter(r => r.relaxed).length

  const summary = [
    `Overall verdict: ${engineResult.overallVerdict}`,
    `Rules fired: ${rulesFired} | PASS: ${passCount} | WARN: ${warnCount} | BLOCK: ${blockCount}`,
    `Relaxations applied: ${relaxationsApplied}`,
    ...engineResult.ruleResults.map(r => {
      const relaxed = r.relaxed ? ' [RELAXED]' : ''
      return `  ${r.ruleId} (w=${r.weight === Infinity ? '∞' : r.weight}) → ${r.verdict}${relaxed}: ${r.reason.slice(0, 120)}`
    }),
    ...(engineResult.relaxationSummary.length > 0
      ? ['Relaxation details:', ...engineResult.relaxationSummary.map(s => `  ${s}`)]
      : []),
  ]

  console.log(`[grammar] Verdict: ${engineResult.overallVerdict} | PASS: ${passCount} | WARN: ${warnCount} | BLOCK: ${blockCount} | Relaxed: ${relaxationsApplied}`)

  return { engineResult, rulesFired, passCount, warnCount, blockCount, relaxationsApplied, summary }
}
