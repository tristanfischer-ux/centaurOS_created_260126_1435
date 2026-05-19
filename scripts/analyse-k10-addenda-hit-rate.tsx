#!/usr/bin/env npx tsx
/**
 * @file scripts/analyse-k10-addenda-hit-rate.tsx
 *
 * @description Reads the multi-emitter outputs in /tmp/k10-multiemit-out/
 *   and computes per-addendum hit rates (K10-1 through K10-8) per emitter
 *   per datapoint. Each addendum is converted to a concrete edge-pattern
 *   check the analyser can score against an emitter's cross_module_grammar_links.
 *
 *   Output: a table — one row per (datapoint, emitter, addendum) — plus a
 *   roll-up per addendum across emitters & datapoints.
 *
 * @usage  npx tsx scripts/analyse-k10-addenda-hit-rate.tsx
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve } from 'path'

const OUT_DIR = resolve(process.cwd(), '/tmp/k10-multiemit-out')

type Link = { from_module: string; to_module: string; mechanism: string; detail?: string }
type Parsed = {
  product_class?: string
  modules?: Array<{ module: string }>
  excluded_modules?: string[]
  cross_module_grammar_links?: Link[]
}

const DATAPOINTS = ['bess1', 'bess2', 'heatpump', 'ev']

const EMITTERS = [
  'google_gemini-3_1-pro-preview',
  'x-ai_grok-4_3',
  'anthropic_claude-opus-4-7',
  'qwen_qwen3_6-max-preview',
  'xiaomi_mimo-v2_5-pro',
  'moonshotai_kimi-k2_6',
]

function loadEmitterParsed(dp: string, emitterSlug: string): Parsed | null {
  const fp = resolve(OUT_DIR, `${dp}.${emitterSlug}.parsed.json`)
  if (!existsSync(fp)) return null
  try {
    return JSON.parse(readFileSync(fp, 'utf-8'))
  } catch {
    return null
  }
}

// ── Each addendum becomes a concrete edge-pattern check ────────────────────
// Returns: number of distinct matching edges (0 = MISS, 1+ = HIT count)
function k10_1_mechanicalMount(p: Parsed): number {
  // ≥1 mechanical_mount edge to structure_containment
  return (p.cross_module_grammar_links ?? []).filter(
    l => l.mechanism === 'mechanical_mount' && (l.to_module === 'structure_containment' || l.from_module === 'structure_containment'),
  ).length
}

function k10_2_hardSafetyChain(p: Parsed): number {
  // hard-wired trip from safety_protection to power module (ESS/ECT/PD) — counts non-alarm_interlock edges from safety_protection
  return (p.cross_module_grammar_links ?? []).filter(l =>
    l.from_module === 'safety_protection'
    && ['energy_storage_source', 'power_distribution', 'energy_conversion_transduction'].includes(l.to_module)
    && ['safety_isolation', 'imd_trip', 'contactor_command'].includes(l.mechanism),
  ).length
}

function k10_3_thermalTwoEdge(p: Parsed): { sourceToTransport: number; transportToEI: number } {
  const links = p.cross_module_grammar_links ?? []
  const sourceToTransport = links.filter(l =>
    l.to_module === 'mass_fluid_transport_process'
    && ['cooling_loop', 'refrigerant_line', 'air_duct', 'fluid_routing'].includes(l.mechanism),
  ).length
  const transportToEI = links.filter(l =>
    l.from_module === 'mass_fluid_transport_process' && l.to_module === 'environmental_interface',
  ).length
  return { sourceToTransport, transportToEI }
}

function k10_4_bessDCPath(p: Parsed): { ess_pd: boolean; pd_ect: boolean } {
  const links = p.cross_module_grammar_links ?? []
  const ess_pd = links.some(l =>
    ((l.from_module === 'energy_storage_source' && l.to_module === 'power_distribution')
      || (l.from_module === 'power_distribution' && l.to_module === 'energy_storage_source'))
    && l.mechanism === 'dc_busbar',
  )
  const pd_ect = links.some(l =>
    ((l.from_module === 'power_distribution' && l.to_module === 'energy_conversion_transduction')
      || (l.from_module === 'energy_conversion_transduction' && l.to_module === 'power_distribution'))
    && l.mechanism === 'dc_busbar',
  )
  return { ess_pd, pd_ect }
}

function k10_5_modbusPerSubsystem(p: Parsed): number {
  // count distinct CCC↔X modbus_tcp links
  return (p.cross_module_grammar_links ?? []).filter(
    l => l.mechanism === 'modbus_tcp' && (l.from_module === 'control_compute_communication' || l.to_module === 'control_compute_communication'),
  ).length
}

function k10_6_evCableBoth(p: Parsed): { power: boolean; comms: boolean } {
  const links = p.cross_module_grammar_links ?? []
  const power = links.some(l =>
    ((l.from_module === 'power_distribution' && l.to_module === 'actuation_kinematics')
      || (l.from_module === 'actuation_kinematics' && l.to_module === 'power_distribution'))
    && l.mechanism === 'dc_busbar',
  )
  const comms = links.some(l =>
    ((l.from_module === 'control_compute_communication' && l.to_module === 'actuation_kinematics')
      || (l.from_module === 'actuation_kinematics' && l.to_module === 'control_compute_communication'))
    && (l.mechanism === 'modbus_tcp' || l.mechanism === 'can_bus' || l.mechanism === 'sensor_feedback'),
  )
  return { power, comms }
}

function k10_7_modulationDetail(p: Parsed): { totalContactor: number; withModulation: number } {
  // contactor_command edges from CCC with explicit modulation in detail
  const cmds = (p.cross_module_grammar_links ?? []).filter(l =>
    l.from_module === 'control_compute_communication' && l.mechanism === 'contactor_command',
  )
  const totalContactor = cmds.length
  const withModulation = cmds.filter(l => {
    const d = (l.detail ?? '').toLowerCase()
    return d.includes('pwm') || d.includes('0-10v') || d.includes('4-20ma') || d.includes('step/dir')
      || d.includes('vfd') || d.includes('servo')
  }).length
  return { totalContactor, withModulation }
}

function k10_8_modulePresence(p: Parsed, dp: string): { si: boolean; ak: boolean; mftp: boolean } {
  // checks whether the K10-required modules are NOT excluded
  const excluded = new Set(p.excluded_modules ?? [])
  // For BESS: SI + MFTP required (not AK). For heat-pump: AK + MFTP. For EV: SI + AK + MFTP.
  return {
    si: !excluded.has('sensing_instrumentation'),
    ak: !excluded.has('actuation_kinematics'),
    mftp: !excluded.has('mass_fluid_transport_process'),
  }
}

function classify(dp: string): 'bess' | 'heat_pump' | 'ev' {
  if (dp.startsWith('bess')) return 'bess'
  if (dp === 'heatpump') return 'heat_pump'
  return 'ev'
}

function main() {
  console.log('═══════ K10 addenda per-emitter hit rate ═══════\n')
  // Per-addendum tracking
  type Tally = { hits: number; total: number }
  const perAddendum = new Map<string, Tally>()
  function add(addendum: string, hit: boolean) {
    const t = perAddendum.get(addendum) ?? { hits: 0, total: 0 }
    t.total++
    if (hit) t.hits++
    perAddendum.set(addendum, t)
  }

  for (const dp of DATAPOINTS) {
    const cls = classify(dp)
    console.log(`\n── ${dp} (${cls}) ──`)
    for (const slug of EMITTERS) {
      const p = loadEmitterParsed(dp, slug)
      if (!p) {
        console.log(`  ${slug.padEnd(34)} (no file)`)
        continue
      }
      const k1 = k10_1_mechanicalMount(p)
      const k2 = k10_2_hardSafetyChain(p)
      const k3 = k10_3_thermalTwoEdge(p)
      const k4 = k10_4_bessDCPath(p)
      const k5 = k10_5_modbusPerSubsystem(p)
      const k6 = k10_6_evCableBoth(p)
      const k7 = k10_7_modulationDetail(p)
      const k8 = k10_8_modulePresence(p, dp)

      // Score per addendum — class-conditional where it makes sense
      const k1_hit = k1 >= 1
      const k2_hit = k2 >= 1
      const k3_hit = k3.sourceToTransport >= 1 && k3.transportToEI >= 1
      const k4_hit = cls === 'bess' ? (k4.ess_pd && k4.pd_ect) : true  // n/a for non-BESS
      const k4_applies = cls === 'bess'
      const k5_target = cls === 'bess' ? 3 : (cls === 'heat_pump' ? 1 : 2)
      const k5_hit = k5 >= k5_target
      const k6_hit = cls === 'ev' ? (k6.power && k6.comms) : true
      const k6_applies = cls === 'ev'
      // K10-7: at least 1 modulation-detailed contactor for heat pump; not required for others
      const k7_hit = cls === 'heat_pump' ? k7.withModulation >= 1 : true
      const k7_applies = cls === 'heat_pump'
      // K10-8: class-conditional module presence
      const k8_target =
        cls === 'bess'      ? { si: true, ak: false, mftp: true }
        : cls === 'heat_pump' ? { si: false, ak: true, mftp: true }
        :                       { si: true, ak: true, mftp: true }
      const k8_hit =
        (!k8_target.si   || k8.si)
        && (!k8_target.ak   || k8.ak)
        && (!k8_target.mftp || k8.mftp)

      const tag = (b: boolean) => b ? '✓' : '✗'
      console.log(
        `  ${slug.padEnd(34)}  K1=${tag(k1_hit)}(${k1})  K2=${tag(k2_hit)}(${k2})  K3=${tag(k3_hit)}(${k3.sourceToTransport}/${k3.transportToEI})  K4=${k4_applies ? tag(k4_hit) : 'n/a'}  K5=${tag(k5_hit)}(${k5}/${k5_target})  K6=${k6_applies ? tag(k6_hit) : 'n/a'}(p:${k6.power}/c:${k6.comms})  K7=${k7_applies ? tag(k7_hit) : 'n/a'}(${k7.withModulation}/${k7.totalContactor})  K8=${tag(k8_hit)}[si:${k8.si},ak:${k8.ak},mftp:${k8.mftp}]`,
      )
      add('K10-1', k1_hit)
      add('K10-2', k2_hit)
      add('K10-3', k3_hit)
      if (k4_applies) add('K10-4', k4_hit)
      add('K10-5', k5_hit)
      if (k6_applies) add('K10-6', k6_hit)
      if (k7_applies) add('K10-7', k7_hit)
      add('K10-8', k8_hit)
    }
  }

  console.log('\n═══════ ROLLUP per-addendum hit rate ═══════')
  for (const k of ['K10-1', 'K10-2', 'K10-3', 'K10-4', 'K10-5', 'K10-6', 'K10-7', 'K10-8']) {
    const t = perAddendum.get(k)
    if (!t) { console.log(`  ${k}   (no data)`); continue }
    const pct = t.total > 0 ? (100 * t.hits / t.total).toFixed(1) : 'n/a'
    console.log(`  ${k}   ${t.hits}/${t.total}   (${pct}%)`)
  }
}

main()
