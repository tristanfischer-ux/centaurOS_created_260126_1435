/**
 * @file module-to-sentence-mapping.ts — Maps each of the 12 UNIVERSAL_MODULES to
 * the sentence IDs in `character-hierarchy.ts` that the per-module Stage 2 LLM
 * may use as candidate sub-trees.
 *
 * Implements §5.4 "module → sentence" mapping from
 * `radical/ITER3-ARCHITECTURE-DESIGN.md`.
 *
 * USAGE — Stage 2 per-module LLM call (`runDecomposeRadicalPerModule`):
 *   1. For the active ModuleSpec (primary + optional secondary modules), look
 *      up `MODULE_TO_SENTENCES[primary]` ∪ `MODULE_TO_SENTENCES[secondary]`.
 *   2. From the unioned candidate sentence set, intersect with sentences
 *      whose `allowed_classes` contains the normalised product class — this
 *      yields the per-module candidate sentence list (universality probes
 *      with no normalised class skip the intersection).
 *   3. The character library subset Stage 2 sees is the union of all
 *      `characters[]` across the words in those candidate sentences, further
 *      narrowed by `module.allowed_radicals`.
 *   4. Outside-mapping characters are filtered out — the deterministic builder
 *      `buildTreeFromLeaves()` discards leaves whose character_id isn't in the
 *      mandatory set or in the per-module candidate set.
 *
 * COVERAGE NOTE — for unseen product classes (universality probes §7), the
 * per-class intersection is skipped; the per-module LLM sees the full union
 * of the module's mapped sentences. This is the universality path.
 *
 * MAINTENANCE — when a new sentence is added to `character-hierarchy.ts`
 * (future Iter-4 product class), append its ID to the appropriate
 * UniversalModule key here. Sentences not listed under any module are
 * "orphaned" and will not be reachable by any per-module call. The legacy
 * single-shot decomposition path can still reach them — Iter 3 is gated
 * behind `RADICAL_PHASE_3_PER_MODULE`.
 *
 * Design doc: ../ITER3-ARCHITECTURE-DESIGN.md §5.4
 * Council reasoning: ../COUNCIL-UNIVERSAL-TAXONOMY-2026-05-11.md
 */

import type { UniversalModule } from '../types/module-decomposition.js'

/**
 * Each UniversalModule maps to the sentence IDs from
 * `radical/character-hierarchy.ts` that legitimately decompose THAT module.
 *
 * A sentence MAY appear under more than one module (multi-classification).
 * Examples:
 *   - `propulsion_system` appears under `actuation_kinematics` (rotors,
 *     drive train, propellers ARE the kinematic actuator) AND under
 *     `energy_conversion_transduction` (motors convert electrical →
 *     mechanical). The per-module LLM sees the same sentence twice when
 *     the ModuleSpec lists both modules; the deterministic builder dedups
 *     characters at the leaf level.
 *   - `thermal_management_system` appears under `environmental_interface`
 *     (handles heat exchange with the operating environment) AND under
 *     `mass_fluid_transport_process` (when the cooling loop is the product's
 *     own internal fluid path, e.g. liquid-cooled DC fast charger).
 *
 * Sentence inventory in `character-hierarchy.ts` (31 sentences as of
 * 2026-05-11): battery_rack_assembly, battery_management_system_bms,
 * power_conversion_system_pcs, dc_distribution_switchgear,
 * thermal_management_system, fire_detection_and_suppression_system_fss,
 * energy_management_system_ems_scada, container_enclosure_fit_out,
 * refrigerant_circuit, hydronic_circuit, heat_pump_controls,
 * heat_pump_enclosure, growing_rack_system, lighting_system,
 * fertigation_loop, hvac_co2_system, airframe_structure, propulsion_system,
 * flight_computer, charger_power_conversion, charger_enclosure,
 * bioreactor_vessel, bioreactor_controls, bioprocess_vessel,
 * edge_compute_system, hull_and_buoyancy, subsea_pressure_vessel,
 * biosensor_system, medical_wearable_enclosure, haps_airframe,
 * solar_electric_airframe.
 */
export const MODULE_TO_SENTENCES: Record<UniversalModule, string[]> = {
  // 1. Storage / source / dissipation — what the product holds or originates.
  energy_storage_source: [
    'battery_rack_assembly',                 // BESS cells + rack
    'solar_electric_airframe',                // HAPS PV + Li-S night battery (storage role)
  ],

  // 2. Conversion / transduction — changes energy domain.
  energy_conversion_transduction: [
    'power_conversion_system_pcs',            // BESS inverter + transformer
    'charger_power_conversion',               // EV charger PCS + DC-DC + filters
    'refrigerant_circuit',                    // Heat pump compressor + heat exchanger
    'biosensor_system',                       // CGM electrochemistry → electrical signal
    'solar_electric_airframe',                // HAPS PV array (also under structure_containment)
    'propulsion_system',                      // Drone/AUV/HAPS motors convert electrical → mechanical
    'lighting_system',                        // Vfarm LEDs convert electrical → photons
  ],

  // 3. Structure / containment — passive load + form.
  structure_containment: [
    'battery_rack_assembly',                  // Steel rack frame is structural
    'container_enclosure_fit_out',            // Container shell
    'heat_pump_enclosure',
    'charger_enclosure',
    'airframe_structure',                     // Drone airframe
    'haps_airframe',                          // HAPS structural ribs / skin
    'solar_electric_airframe',                // PV-as-skin structural composite spar
    'hull_and_buoyancy',                      // AUV hull
    'subsea_pressure_vessel',                 // AUV pressure-rated body
    'medical_wearable_enclosure',             // CGM patch housing
    'bioreactor_vessel',                      // Bioreactor body
    'growing_rack_system',                    // Vfarm rack frame
  ],

  // 4. Sensing / instrumentation — physical-phenomenon transduction.
  sensing_instrumentation: [
    'biosensor_system',                       // CGM glucose sensor (analogue front-end + electrode)
    'bioreactor_controls',                    // pH, DO, level, temperature transducers
    'fertigation_loop',                       // Vfarm fertigation_sensors word
    'flight_computer',                        // IMU, GNSS, barometer, magnetometer
    'heat_pump_controls',                     // hp_controls_sensors word
    'fire_detection_and_suppression_system_fss', // detection_sensors word (gas, arc, smoke)
    'energy_management_system_ems_scada',     // ems_metering word (CT/PT)
  ],

  // 5. Control / compute / communication — closed-loop and supervisory.
  control_compute_communication: [
    'energy_management_system_ems_scada',     // BESS EMS / SCADA
    'heat_pump_controls',                     // hp_controls_compute word
    'bioreactor_controls',                    // Bioprocess control loops
    'flight_computer',                        // Drone/AUV/HAPS avionics + comms
    'edge_compute_system',                    // Edge AI compute
    'battery_management_system_bms',          // BMS = closed-loop control of cells
  ],

  // 6. Safety / protection — ACTIVE hazard mitigation only.
  safety_protection: [
    'fire_detection_and_suppression_system_fss', // BESS / EV-charger FSS
    'dc_distribution_switchgear',             // dc_protection word (relays, breakers)
    'charger_enclosure',                      // charger_safety word
    'heat_pump_controls',                     // hp_controls_protection word
    'hydronic_circuit',                       // hydronic_safety word (PRV, expansion vessel)
  ],

  // 7. Environmental interface — boundary with operating environment.
  environmental_interface: [
    'thermal_management_system',              // BESS / edge AI / EV / HAPS thermal
    'container_enclosure_fit_out',            // container_hvac word, IP rating, security/access
    'heat_pump_enclosure',                    // hp_enclosure_drainage / mounting / weather seals
    'hvac_co2_system',                        // Vfarm HVAC + CO2 dosing (interface with grow env)
    'hull_and_buoyancy',                      // AUV hull fairing, anti-biofouling
    'subsea_pressure_vessel',                 // AUV ingress protection, dive seals
  ],

  // 8. Power distribution — UNINTERRUPTED routing only.
  power_distribution: [
    'dc_distribution_switchgear',             // BESS DC busbars + earthing + buswork
    'energy_management_system_ems_scada',     // ems_power word
    'charger_power_conversion',               // charger_dc_link word (DC bus)
    'edge_compute_system',                    // edge_compute_power word
    'flight_computer',                        // avionics_power word
    'biosensor_system',                       // biosensor_power word (battery + harvesting)
    'container_enclosure_fit_out',            // container_aux_power word
  ],

  // 9. Maintenance / serviceability — OFFLINE access only.
  maintenance_serviceability: [
    'container_enclosure_fit_out',            // container_access word, lifting eyes, panels
    'bioreactor_vessel',                      // bioreactor_inspection word, sample ports
    'heat_pump_enclosure',                    // hp_enclosure_drainage / mounting (service access)
    'battery_rack_assembly',                  // rack_lifting_eye, rack_caster_wheel, earthing strap
  ],

  // 10. Actuation / kinematics — applies converted energy to kinematic intent.
  actuation_kinematics: [
    'propulsion_system',                      // Drone/AUV/HAPS rotors + drive train + propeller
    'haps_airframe',                          // haps_servos + haps_control_surfaces
    'refrigerant_circuit',                    // compressor_word + fan_word + expansion_valve_word
    'hydronic_circuit',                       // hydronic_pump word
    'bioprocess_vessel',                      // agitation_drive_word (bioreactor impeller)
    'fertigation_loop',                       // fertigation_dosing word (dosing pump motor)
    'hvac_co2_system',                        // hvac_flow word (fans/blowers)
  ],

  // 11. Mass / fluid transport & process — internal mass flow + transformation.
  mass_fluid_transport_process: [
    'refrigerant_circuit',                    // refrigerant_cycle + refrigerant_distribution
    'hydronic_circuit',                       // hydronic_flow + hydronic_manifold + connections
    'fertigation_loop',                       // Vfarm irrigation manifold + drains
    'hvac_co2_system',                        // CO2 dosing + hvac_filtration
    'bioreactor_vessel',                      // bioreactor_ports_and_valves word (CIP/SIP/harvest)
    'bioprocess_vessel',                      // gas_sparger_word + single_use_bag_word + thermal_jacket_word
    'thermal_management_system',              // cooling_hydraulics word (when product's OWN fluid loop)
    'subsea_pressure_vessel',                 // buoyancy_compensation_word (AUV ballast)
  ],

  // 12. HMI / ergonomics — operator-facing surfaces only.
  hmi_ergonomics: [
    'charger_enclosure',                      // charger_hmi_payment word (touchscreen, RFID)
    'heat_pump_controls',                     // hp_controls_hmi word
    'energy_management_system_ems_scada',     // ems_compute word can include operator display
    'medical_wearable_enclosure',             // wearable_skin_interface + wearable_applicator (CGM)
    'biosensor_system',                       // biosensor_motion (haptic feedback / accelerometer)
    'bioreactor_vessel',                      // bioreactor_inspection word (sight glass — operator-facing)
  ],
}

/**
 * Given a primary UniversalModule and an optional list of secondary modules,
 * return the union of candidate sentence IDs across all of them.
 *
 * Use case: a ModuleSpec with PRIMARY `actuation_kinematics` and SECONDARY
 * `mass_fluid_transport_process` (e.g. a pump) needs the union of both
 * sentence sets so the per-module Stage 2 call can decompose into BOTH the
 * motor-stator characters AND the fluid-line characters.
 *
 * Returns sorted, deduped sentence IDs for determinism.
 */
export function candidateSentencesForModule(
  primary: UniversalModule,
  secondary: UniversalModule[] = [],
): string[] {
  const set = new Set<string>(MODULE_TO_SENTENCES[primary] ?? [])
  for (const sec of secondary) {
    for (const sentenceId of MODULE_TO_SENTENCES[sec] ?? []) {
      set.add(sentenceId)
    }
  }
  return [...set].sort()
}

/**
 * Diagnostic helper — returns the set of distinct sentence IDs covered by
 * the mapping. Used by tests to enforce the "no orphans" invariant: if a
 * sentence is added to `character-hierarchy.ts` without a corresponding
 * entry here, the per-module path will not reach it.
 */
export function mappedSentenceIds(): Set<string> {
  const out = new Set<string>()
  for (const sentences of Object.values(MODULE_TO_SENTENCES)) {
    for (const s of sentences) out.add(s)
  }
  return out
}
