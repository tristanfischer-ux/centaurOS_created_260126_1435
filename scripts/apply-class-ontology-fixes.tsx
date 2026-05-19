#!/usr/bin/env -S npx tsx
/**
 * apply-class-ontology-fixes.tsx — extends the BESS ontology-fix pattern
 * (scripts/apply-bess-ontology-fixes.tsx) to the other 9 product classes per
 * Phase 2 pretraining findings (2026-05-17).
 *
 * Per-class reassignments are based on ≥8/10 reference-product placement in
 * the corpus, captured in `phase-2-{slug}-report.html`. Cross-class universal
 * rule: `motor` → energy_conversion_transduction (whenever found outside an
 * actuation_kinematics / energy_conversion_transduction module).
 *
 * Usage:
 *   npx tsx scripts/apply-class-ontology-fixes.tsx <slug> <state.json>
 *
 * Where <slug> is one of: drone | heatpump | ev-charger | edge-ai | bioreactor
 *                          | vertical-farm | cgm | auv | haps
 *
 * Run once per non-BESS iter; future runs should be correct after the Stage
 * 1.7 emitter prompt CORRECT-comment lines added in the same commit.
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

interface Move {
  sub_module_match: RegExp
  to: string
  /** Optional whitelist: only move sub-modules currently in one of these modules. Leave empty to match anywhere. */
  from?: string[]
  reason: string
}

const PER_CLASS_MOVES: Record<string, Move[]> = {
  drone: [
    {
      // Only match top-level shell/airframe sub-modules — narrow to avoid false matches
      // on `payload_mounting_frame` (already structure) or similar.
      sub_module_match: /^(container_shell|airframe_shell|frame_shell|airframe|central_chassis_core)$/i,
      to: 'structure_containment',
      reason: '9/10 reference drones place the airframe / frame shell under structure_containment.',
    },
  ],
  heatpump: [
    {
      sub_module_match: /(evaporator|condenser|refrigerant_coil)/i,
      to: 'energy_conversion_transduction',
      reason: '10/10 reference heat pumps place evaporator / condenser / refrigerant coils under energy_conversion_transduction — phase-change is energy transduction, not environmental interface.',
    },
    {
      sub_module_match: /(expansion_valve|service_valve|isolation_valve)/i,
      to: 'safety_protection',
      reason: '9/10 reference heat pumps place expansion / service / isolation valves under safety_protection — they are part of the refrigerant-circuit safety chain.',
    },
  ],
  'ev-charger': [
    {
      sub_module_match: /(thermal_management|cooling_loop|heatsink_array|cold_plate|liquid_cold_plate)/i,
      from: ['energy_conversion_transduction', 'control_compute_communication'],
      to: 'environmental_interface',
      reason: '10/10 reference EV chargers place thermal management (cooling loop, cold plate, heatsink) under environmental_interface, not energy_conversion_transduction.',
    },
  ],
  'edge-ai': [
    {
      // Only move sub-modules that LOOK like the outer chassis/shell, not access
      // mechanisms or grounding — those have their own homes.
      sub_module_match: /^(container_shell|chassis_shell|rack_chassis|chassis_base_tray|chassis_top_cover|chassis_gasket_seal)$/i,
      from: ['energy_storage_source', 'environmental_interface', 'hmi_ergonomics', 'maintenance_serviceability'],
      to: 'structure_containment',
      reason: '9/9 reference edge-AI servers place the chassis / container shell under structure_containment (only moves entries currently misplaced).',
    },
    {
      sub_module_match: /(memory_module|ram_dimm|memory_bank)/i,
      to: 'control_compute_communication',
      reason: '8/9 reference edge-AI servers place memory (DIMM / RAM) under control_compute_communication.',
    },
  ],
  bioreactor: [
    {
      sub_module_match: /(manifold|valve_manifold|fluid_manifold)/i,
      to: 'environmental_interface',
      reason: '10/10 reference bioreactors place fluid / valve manifolds under environmental_interface (gas/liquid boundary handling), not power_distribution or maintenance_serviceability.',
    },
  ],
  'vertical-farm': [
    {
      sub_module_match: /(expansion_tank|surge_tank|buffer_tank)/i,
      to: 'mass_fluid_transport_process',
      reason: '10/10 reference vertical farms place expansion / surge / buffer tanks under mass_fluid_transport_process (recirculating fertigation), not energy_storage_source or sensing_instrumentation.',
    },
  ],
  cgm: [
    {
      sub_module_match: /(thermal_management|skin_interface_heat)/i,
      to: 'environmental_interface',
      reason: 'Skin-interface thermal management belongs to environmental_interface, not energy_storage_source.',
    },
    {
      sub_module_match: /(grounding|ground_strap|esd_ground)/i,
      to: 'power_distribution',
      reason: 'Grounding / ESD return paths belong to power_distribution per uninterrupted-electrical-path rule.',
    },
  ],
  auv: [
    {
      sub_module_match: /(radio|comms_modem|surface_comms)/i,
      to: 'control_compute_communication',
      reason: '10/10 reference AUVs place comms radios / surface modems under control_compute_communication, not energy_conversion_transduction.',
    },
    {
      sub_module_match: /(sonar|acoustic_array)/i,
      to: 'sensing_instrumentation',
      reason: '9/10 reference AUVs place sonar / acoustic arrays under sensing_instrumentation — they measure the environment.',
    },
  ],
  haps: [
    {
      sub_module_match: /(grounding|airframe_ground)/i,
      to: 'power_distribution',
      reason: '9/10 reference HAPS place airframe grounding under power_distribution.',
    },
    {
      sub_module_match: /(mppt|maximum_power_point|solar_tracker)/i,
      to: 'energy_conversion_transduction',
      reason: '8/10 reference HAPS place MPPT / solar trackers under energy_conversion_transduction — they regulate the PV → DC bus conversion.',
    },
  ],
}

// Universal cross-class: motor → energy_conversion_transduction
// (unless already in energy_conversion_transduction OR actuation_kinematics)
//
// Narrow match: only sub-modules whose id *starts* with "motor" or are pure
// motor primitives. This avoids false positives on compound ids like
// `motor_environmental_protection`, `folding_motor_arms`, `haptic_feedback_motor`
// where the dominant function is environmental / structural / HMI rather than
// the motor itself. Matches the original phase-2 finding which used `motor`
// as a noun-only bucket in the lemmatised mismatch table.
const UNIVERSAL_MOTOR_MOVE: Move = {
  sub_module_match: /^(motor|motor_assembly|motor_stator|motor_rotor|electric_motor|bldc_motor|servo_motor|drive_motor|propulsion_motor|main_motor)(_assembly|_assemblies|_set|_sets)?$/i,
  to: 'energy_conversion_transduction',
  reason: 'Cross-class universal: motors (electrical → mechanical conversion) belong to energy_conversion_transduction unless already there or in actuation_kinematics where the kinematic geometry dominates.',
}

const MOTOR_ALLOWED_HOME = new Set(['energy_conversion_transduction', 'actuation_kinematics'])

function moveSubModule(state: any, move: Move, currentModule: string, idx: number, sm: any): { moved: boolean; details: string } {
  const modules = state?.moduleDecomposition?.modules ?? []
  const toMod = modules.find((m: any) => m.module === move.to)
  if (!toMod) return { moved: false, details: `target module ${move.to} not present in state` }
  if (currentModule === move.to) return { moved: false, details: '' }
  if (move.from && !move.from.includes(currentModule)) return { moved: false, details: '' }
  toMod.sub_modules = toMod.sub_modules ?? []
  toMod.sub_modules.push(sm)
  return { moved: true, details: `  ${currentModule}/${sm.id} → ${move.to}/${sm.id}` }
}

function applyMoves(state: any, moves: Move[]): { totalMoved: number; details: string[]; verifs: number } {
  const modules = state?.moduleDecomposition?.modules ?? []
  const details: string[] = []
  let totalMoved = 0
  for (const move of moves) {
    for (const fromMod of modules) {
      const currentModule = fromMod.module as string
      // Special-case the motor rule: skip if module is already a valid home.
      const isMotorRule = move === UNIVERSAL_MOTOR_MOVE
      if (isMotorRule && MOTOR_ALLOWED_HOME.has(currentModule)) continue
      if (!fromMod.sub_modules) continue
      const remaining: any[] = []
      for (let i = 0; i < fromMod.sub_modules.length; i += 1) {
        const sm = fromMod.sub_modules[i]
        if (move.sub_module_match.test(sm.id || '')) {
          const r = moveSubModule(state, move, currentModule, i, sm)
          if (r.moved) {
            details.push(r.details)
            totalMoved += 1
            continue
          }
        }
        remaining.push(sm)
      }
      fromMod.sub_modules = remaining
    }
  }
  // Update partVerifications module field too
  let verifs = 0
  const allModuleSubMap = new Map<string, string>() // sub_module_id → new module
  for (const m of modules) {
    for (const sm of (m.sub_modules ?? [])) {
      allModuleSubMap.set(sm.id, m.module)
    }
  }
  for (const v of (state?.partVerifications ?? [])) {
    const correct = allModuleSubMap.get(v.sub_module_id || '')
    if (correct && correct !== v.module) {
      v.module = correct
      verifs += 1
    }
  }
  return { totalMoved, details, verifs }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: apply-class-ontology-fixes.tsx <slug> <state.json>')
    console.error('Slugs:', Object.keys(PER_CLASS_MOVES).join(' | '))
    process.exit(1)
  }
  const slug = args[0]
  const statePath = resolve(args[1])
  const classMoves = PER_CLASS_MOVES[slug]
  if (!classMoves) {
    console.error(`Unknown slug ${slug}. Known: ${Object.keys(PER_CLASS_MOVES).join(', ')}`)
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const moves: Move[] = [...classMoves, UNIVERSAL_MOTOR_MOVE]
  console.log(`[ontology] ${slug} — ${classMoves.length} class-specific + 1 universal motor rule`)
  console.log(`  state: ${statePath}`)
  for (const m of classMoves) {
    console.log(`  rule: ${m.sub_module_match.source} → ${m.to}`)
    console.log(`    reason: ${m.reason}`)
  }
  const { totalMoved, details, verifs } = applyMoves(state, moves)
  if (details.length > 0) {
    console.log('\n[moved]')
    details.forEach((d) => console.log(d))
  } else {
    console.log('\n[ontology] no matching sub-modules found — nothing to move.')
  }
  console.log(`\n[ontology] total: ${totalMoved} sub-modules moved, ${verifs} verifications re-tagged`)
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  console.log(`[ontology] saved → ${statePath}`)
}

main()
