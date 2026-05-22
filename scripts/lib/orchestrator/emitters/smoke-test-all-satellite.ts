/**
 * scripts/lib/orchestrator/emitters/smoke-test-all-satellite.ts
 *
 * Smoke test for all 6 satellite/ground emitters: cubesat, smallsat,
 * geo_comsat, interplanetary, propulsion_thruster_product, ground_station.
 * Confirms each produces a sensible DesignJSON when invoked with a fake Contract.
 */

import '../register-all'
import { assembleDesign, listAssemblers } from '../assembler'
import type { ContractInProgress, BriefEnvelope, ParsedConstraints } from '../types'

function makeFakeQuantity(value: number): any {
  return {
    value, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const,
    uncertainty_pct: 5, temporal_resolution_s: null, condition: null,
    provenance: { source: 'brief' as const, invocation_output_field: 'fake' },
  }
}

interface TestCase {
  className: string
  scaleTier: string
  quantities: Record<string, number>
}

const cases: TestCase[] = [
  {
    className: 'satellite_cubesat',
    scaleTier: 'cubesat',
    quantities: { cubesat_u: 3, mass_kg: 4, orbital_altitude_km: 500, design_life_years: 3, avg_power_w: 15 },
  },
  {
    className: 'satellite_smallsat',
    scaleTier: 'smallsat',
    quantities: { mass_kg: 150, orbital_altitude_km: 600, design_life_years: 5, avg_power_w: 400, delta_v_budget_ms: 200 },
  },
  {
    className: 'satellite_geo_comsat',
    scaleTier: 'geo_comsat',
    quantities: { mass_kg: 5000, design_life_years: 15, bol_power_kw: 12, delta_v_budget_ms: 1500 },
  },
  {
    className: 'satellite_interplanetary',
    scaleTier: 'interplanetary',
    quantities: { mass_kg: 2000, mission_duration_years: 7, target_solar_flux_w_m2: 590, avg_power_w: 600, delta_v_budget_ms: 4500 },
  },
  {
    className: 'propulsion_thruster_product',
    scaleTier: 'thruster',
    quantities: { thrust_n: 22, isp_s: 220, propellant_class: 2 },
  },
  {
    className: 'ground_station',
    scaleTier: 'earth_station',
    quantities: { antenna_diameter_m: 3.7, frequency_band_ghz: 10.7, eirp_dbw: 60, gt_db_per_k: 30 },
  },
]

async function main(): Promise<void> {
  console.log('Registered assemblers:', listAssemblers().join(', '))
  console.log('')

  let failed = 0
  for (const c of cases) {
    const quantities: Record<string, any> = {}
    for (const [k, v] of Object.entries(c.quantities)) {
      quantities[k] = makeFakeQuantity(v)
    }
    const contract: ContractInProgress = {
      product_class: c.className,
      brief_summary: `Test ${c.className}`,
      envelope: { class: c.className, scale_tier: c.scaleTier, voltage_tier: 'low', form_factor: 'default', application: 'default' },
      quantities,
      topology: [],
      closures: [],
      macro_assembly_prices: [],
      _tools_run: [],
    }
    const envelope: BriefEnvelope = { class: c.className, scale_tier: c.scaleTier, voltage_tier: 'low', form_factor: 'default', application: 'default' }
    const brief: ParsedConstraints = { product_class: c.className, product_description: `Test ${c.className}` }

    const result = await assembleDesign(contract, envelope, brief)
    if (!result.ok || !result.design) {
      console.log(`FAIL  ${c.className}: ${result.error}`)
      failed += 1
      continue
    }
    const d = result.design
    let okSubmodules = true
    let okWords = true
    for (const m of d.modules) {
      if (!m.sub_modules || m.sub_modules.length === 0) okSubmodules = false
      for (const sm of m.sub_modules as any[]) {
        if (!sm.words || sm.words.length === 0) okWords = false
      }
    }
    const status = okSubmodules && okWords ? 'PASS' : 'FAIL'
    if (status === 'FAIL') failed += 1
    console.log(`${status}  ${c.className}: ${d.modules.length} modules, ${d.cross_module_grammar_links.length} links`)
  }

  console.log('')
  if (failed === 0) {
    console.log(`SUMMARY: ${cases.length}/${cases.length} PASS`)
  } else {
    console.log(`SUMMARY: ${cases.length - failed}/${cases.length} PASS, ${failed} FAIL`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
