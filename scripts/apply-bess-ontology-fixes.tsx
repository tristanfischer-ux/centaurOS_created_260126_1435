#!/usr/bin/env -S npx tsx
/**
 * apply-bess-ontology-fixes.tsx — move 3 BESS sub-modules to their
 * industry-standard buckets per Phase 1 pretraining findings 2026-05-17.
 *
 *   coolant_pump: mass_fluid_transport_process → environmental_interface
 *   bms_master + bms_slave: energy_storage_source → control_compute_communication
 *   deflagration_vent: safety_protection → structure_containment
 *
 * Mutates state.json AND partVerifications entries (so the BoM walk picks
 * them up in the right module). Run once per BESS iter; future runs should
 * be correct after class-connections.ts + Stage 1.7 emitter prompt are
 * updated (separate architectural fix).
 *
 * Usage: npx tsx scripts/apply-bess-ontology-fixes.tsx <state.json>
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const MOVES: Array<{ sub_module_match: RegExp; from: string; to: string; reason: string }> = [
  {
    sub_module_match: /(coolant_pump|water_pump|circulating_pump|pump_skid)/i,
    from: 'mass_fluid_transport_process',
    to: 'environmental_interface',
    reason: '10/10 reference BESS products place coolant pump under environmental interface — it is part of the heat-rejection loop, not a generic fluid transport function.',
  },
  {
    sub_module_match: /^(bms_master|bms_slave|battery_management_system|battery_management_board|bms_controller|bms.*)$/i,
    from: 'energy_storage_source',
    to: 'control_compute_communication',
    reason: '8/10 reference BESS products place the BMS under control + communication — BMS is the safety + telemetry brain, not the energy storage element itself.',
  },
  {
    sub_module_match: /(deflagration_vent|relief_panel|burst_disc|explosion_vent|smoke_vent)/i,
    from: 'safety_protection',
    to: 'structure_containment',
    reason: '8/10 reference BESS products place deflagration vents under structural containment — they are part of the enclosure pressure-relief architecture, fitted to roof/wall panels.',
  },
]

function moveSubModule(state: any, move: typeof MOVES[number]): { moved: number; details: string[] } {
  const modules = state?.moduleDecomposition?.modules ?? []
  const fromMod = modules.find((m: any) => m.module === move.from)
  const toMod = modules.find((m: any) => m.module === move.to)
  if (!fromMod || !toMod) {
    return { moved: 0, details: [`Module(s) not found: from=${move.from} present=${!!fromMod}, to=${move.to} present=${!!toMod}`] }
  }
  const details: string[] = []
  let moved = 0
  const remaining: any[] = []
  toMod.sub_modules = toMod.sub_modules ?? []
  for (const sm of (fromMod.sub_modules ?? [])) {
    if (move.sub_module_match.test(sm.id)) {
      toMod.sub_modules.push(sm)
      details.push(`  ${move.from}/${sm.id} → ${move.to}/${sm.id}`)
      moved += 1
    } else {
      remaining.push(sm)
    }
  }
  fromMod.sub_modules = remaining
  return { moved, details }
}

function updateVerifications(state: any, move: typeof MOVES[number]): number {
  const verifs = state?.partVerifications ?? []
  let updated = 0
  for (const v of verifs) {
    if (v.module === move.from && move.sub_module_match.test(v.sub_module_id || '')) {
      v.module = move.to
      updated += 1
    }
  }
  return updated
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: apply-bess-ontology-fixes.tsx <state.json>')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))

  console.log('[ontology] applying 3 BESS sub-module reassignments per Phase 1 corpus findings')
  console.log(`  state: ${statePath}`)

  let totalMoved = 0
  let totalVerifsUpdated = 0
  for (const move of MOVES) {
    const subResult = moveSubModule(state, move)
    const verifsUpdated = updateVerifications(state, move)
    totalMoved += subResult.moved
    totalVerifsUpdated += verifsUpdated
    console.log(`\n[move] ${move.from} → ${move.to}`)
    console.log(`  reason: ${move.reason}`)
    if (subResult.details.length > 0) {
      subResult.details.forEach((d) => console.log(d))
    } else {
      console.log(`  (no matching sub-modules under ${move.from})`)
    }
    if (verifsUpdated > 0) {
      console.log(`  + ${verifsUpdated} partVerification entries re-tagged`)
    }
  }

  console.log(`\n[ontology] total: ${totalMoved} sub-modules moved, ${totalVerifsUpdated} verifications re-tagged`)
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  console.log(`[ontology] saved → ${statePath}`)
}

main()
