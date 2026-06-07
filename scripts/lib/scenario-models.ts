/**
 * scripts/lib/scenario-models.ts
 *
 * Per-class ADAPTERS that build a universal ScenarioModel + Bands from a chain
 * state.json, plus a dispatcher. The scenario ENGINE (scenario-planning.ts) is
 * class-agnostic; these adapters are per-class CONFIG (same pattern as
 * class-plans / class-price-bands). A class with no adapter falls back to the
 * generic builder (works whenever the economics step recorded its inputs).
 *
 * The e_fuel adapter MIRRORS scripts/lib/orchestrator/class-plans/
 * e-fuel-synthesis.ts::stepYieldEconomics.input_from_contract so the Base
 * scenario reproduces the dossier's stored economics EXACTLY (guarded by the
 * regression invariant scenario_recompute_matches_base).
 *
 * Self-test:  npx tsx scripts/lib/scenario-models.ts <state.json>
 */
import type { ScenarioModel, Bands } from './scenario-planning'
import { computeScenarioPlanning } from './scenario-planning'

export interface BuiltScenario { model: ScenarioModel; bands: Bands; hurdle: number }

type QMap = Record<string, { value?: unknown } | undefined>
function qnum(q: QMap, key: string, dflt: number): number {
  const v = q?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}

// ---------------------------------------------------------------------------
// e_fuel_synthesis — mirrors stepYieldEconomics exactly (same defaults).
// ---------------------------------------------------------------------------
function buildEfuel(q: QMap, rawBomFloorGbp: number): BuiltScenario {
  const hours = qnum(q, 'operating_hours_yr', 8000)
  const capexInstalled = qnum(q, 'plant_capex_installed_gbp', 25_000_000) // mirror step default
  const yieldKg = qnum(q, 'saf_output_tonnes_yr', 1000) * 1000
  const life = qnum(q, 'design_life_yr', 20)
  const elecLoadKw =
    qnum(q, 'co2_feed_compressor_power_kw', 73) +
    qnum(q, 'h2_feed_compressor_power_kw', 140) +
    qnum(q, 'recycle_gas_compressor_power_kw', 40) +
    qnum(q, 'feed_preheater_input_kw', 133) +
    qnum(q, 'product_pump_motor_kw', 1) +
    120 // utilities (cooling/instrument air/N2/lighting) — matches the step
  const h2PriceBase = qnum(q, 'h2_price_gbp_kg', 5.0)
  const elecPriceBase = qnum(q, 'electricity_price_gbp_kwh', 0.10)
  const co2PriceBase = qnum(q, 'co2_price_gbp_t', 45)

  const model: ScenarioModel = {
    output_unit_label: 'SAF', output_unit_short: 'kg',
    levelised_unit_label: '£/t SAF', levelised_display_factor: 1000,
    capex_base_gbp: capexInstalled,
    bom_floor_gbp: rawBomFloorGbp,
    hours_base: hours, hours_design_max: hours,
    annual_yield_at_base_hours: yieldKg,
    output_price_base: 2.2,                       // step assumption (£2,200/t target)
    output_price_unit: '£/kg',
    discount_rate_pct_base: 10, project_life_years: life,
    price_inflation_pct: 2, operational_inflation_pct: 2, tax_rate_pct: 25,
    fixed_capex_fraction: 0.04, fixed_non_capex_gbp: 0,
    variable_costs: [
      { id: 'h2', label: 'Hydrogen', price_base: h2PriceBase, price_unit: '£/kg', qty_per_year_at_base_hours: qnum(q, 'h2_feed_kg_h', 140) * hours },
      { id: 'elec', label: 'Electricity', price_base: elecPriceBase, price_unit: '£/kWh', qty_per_year_at_base_hours: elecLoadKw * hours },
      { id: 'co2', label: 'CO2 feedstock', price_base: co2PriceBase, price_unit: '£/t', qty_per_year_at_base_hours: (qnum(q, 'co2_feed_kg_h', 1000) / 1000) * hours },
    ],
  }
  const bands: Bands = {
    capex: { pessimistic: Math.round(capexInstalled * 1.2), optimistic: Math.round(capexInstalled * 0.72) }, // NOAK ~28% learning
    output_price: { pessimistic: 1.4, optimistic: 5.9 }, // merchant Jet-A+small premium … UK SAF mandate buy-out (£4.70/L ÷ 0.8 kg/L ≈ £5.9/kg)
    hours: { pessimistic: Math.round(hours * 0.75), optimistic: hours },
    discount_rate_pct: { pessimistic: 12, optimistic: 8 },
    variable_prices: {
      h2: { pessimistic: 6, optimistic: 2 },   // today £4-6/kg … future green H2 £2/kg
      elec: { pessimistic: 0.14, optimistic: 0.07 },
      co2: { pessimistic: 60, optimistic: 30 },
    },
  }
  return { model, bands, hurdle: 12 } // FOAK deep-tech equity hurdle
}

// ---------------------------------------------------------------------------
// Generic fallback — works when the economics step recorded its inputs as
// quantities (economics_capex_gbp / economics_opex_gbp_year / economics_yield_units
// / economics_output_price_gbp_unit / economics_discount_rate_pct / economics_life_yr).
// Single lumped "Operating cost" variable -> generic opex lever. Returns null
// if the inputs are absent (stage no-ops gracefully).
// ---------------------------------------------------------------------------
function buildGeneric(q: QMap, rawBomFloorGbp: number, installedAspGbp: number): BuiltScenario | null {
  const capex = qnum(q, 'economics_capex_gbp', installedAspGbp || 0)
  const opex = qnum(q, 'economics_opex_gbp_year', 0)
  const yld = qnum(q, 'economics_yield_units', 0)
  const price = qnum(q, 'economics_output_price_gbp_unit', 0)
  if (capex <= 0 || opex <= 0 || yld <= 0 || price <= 0) return null
  const life = qnum(q, 'economics_life_yr', 20)
  const hours = qnum(q, 'operating_hours_yr', 8000)
  const model: ScenarioModel = {
    output_unit_label: 'output', output_unit_short: 'unit',
    levelised_unit_label: '£/unit', levelised_display_factor: 1,
    capex_base_gbp: capex, bom_floor_gbp: rawBomFloorGbp,
    hours_base: hours, hours_design_max: hours, annual_yield_at_base_hours: yld,
    output_price_base: price, output_price_unit: '£/unit',
    discount_rate_pct_base: qnum(q, 'economics_discount_rate_pct', 10), project_life_years: life,
    price_inflation_pct: 2, operational_inflation_pct: 2, tax_rate_pct: 25,
    fixed_capex_fraction: 0, fixed_non_capex_gbp: 0,
    variable_costs: [{ id: 'opex', label: 'Operating cost', price_base: opex, price_unit: '£/yr', qty_per_year_at_base_hours: 1 }],
  }
  const bands: Bands = {
    capex: { pessimistic: Math.round(capex * 1.2), optimistic: Math.round(capex * 0.78) },
    output_price: { pessimistic: price * 0.8, optimistic: price * 1.3 },
    hours: { pessimistic: Math.round(hours * 0.8), optimistic: hours },
    discount_rate_pct: { pessimistic: 12, optimistic: 8 },
    variable_prices: { opex: { pessimistic: opex * 1.15, optimistic: opex * 0.85 } },
  }
  return { model, bands, hurdle: 10 }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export function buildScenarioFromState(state: any): BuiltScenario | null {
  const q: QMap = state?.orchestratorContract?.quantities ?? {}
  const costStack = state?.costStack ?? {}
  const rawBomFloor = Number(costStack.raw_materials_bom_gbp) || 0
  const installedAsp = Number(costStack.installed_asp_gbp) || 0
  if (rawBomFloor <= 0) return null // no cost stack yet -> can't floor capex -> skip

  const cls: string =
    state?.parsedBrief?.product_class ||
    state?.moduleDecomposition?.product_class ||
    state?.orchestratorContract?.product_class ||
    state?.keyMetrics?.product_class ||
    ''

  const built = cls === 'e_fuel_synthesis' ? buildEfuel(q, rawBomFloor) : buildGeneric(q, rawBomFloor, installedAsp)
  if (!built) return null
  // Degenerate-model guard (impl council 2026-06-07): never let a zero/negative
  // input reach the DCF (would render as £NaN). The section no-ops instead.
  const mo = built.model
  if (!(mo.capex_base_gbp > 0 && mo.hours_base > 0 && mo.project_life_years > 0 &&
        mo.annual_yield_at_base_hours > 0 && mo.output_price_base > 0)) return null
  return built
}

/** Convenience: build + compute in one call. Returns null if no economics. */
export function planScenariosForState(state: any) {
  const built = buildScenarioFromState(state)
  if (!built) return null
  return computeScenarioPlanning(built.model, built.bands, { irr_hurdle_pct: built.hurdle })
}

// ---------------------------------------------------------------------------
// Self-test on a real state.json
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('scenario-models.ts') && process.argv[2]) {
  const fs = require('fs') as typeof import('fs')
  const state = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const built = buildScenarioFromState(state)
  if (!built) { console.error('no scenario model (no cost stack / economics)'); process.exit(1) }
  const sp = computeScenarioPlanning(built.model, built.bands, { irr_hurdle_pct: built.hurdle })
  const q = state.orchestratorContract?.quantities ?? {}
  const storedLev = q.saf_levelised_cost_gbp_kg?.value
  const storedNpv = q.plant_npv_gbp?.value
  console.log('class           :', state?.parsedBrief?.product_class || state?.moduleDecomposition?.product_class || '(unknown)')
  console.log('BoM floor       : £' + (built.model.bom_floor_gbp / 1e6).toFixed(2) + 'M  |  capex base £' + (built.model.capex_base_gbp / 1e6).toFixed(2) + 'M')
  console.log('base levelised  :', sp.base.levelised_per_unit_gbp, '£/' + built.model.output_unit_short, '  stored:', storedLev)
  console.log('base NPV        : £' + (sp.base.npv_gbp / 1e6).toFixed(2) + 'M   stored: £' + (Number(storedNpv) / 1e6).toFixed(2) + 'M')
  const okLev = storedLev == null || Math.abs(sp.base.levelised_per_unit_gbp - Number(storedLev)) <= 0.05
  const okNpv = storedNpv == null || Math.abs(sp.base.npv_gbp - Number(storedNpv)) / Math.abs(Number(storedNpv)) <= 0.02
  console.log('reproduces base :', okLev && okNpv ? 'PASS' : 'FAIL')
  console.log('\nScenarios:')
  for (const s of [sp.base, ...sp.scenarios]) console.log(`  ${s.label.padEnd(26)} £${s.levelised_display}/t  NPV £${(s.npv_gbp / 1e6).toFixed(1)}M  IRR ${s.irr_pct ?? 'n/a'}  clears=${s.clears_hurdle}`)
  console.log('\nGoal-seek (from FOAK base -> NPV>=0):')
  for (const g of sp.goal_seek) console.log(`  ${g.label.padEnd(28)} ${g.feasible ? 'need ' + (g.required_value ?? 0).toFixed(2) + ' ' + g.unit : 'INFEASIBLE (' + g.reason + ')'}`)
  console.log('\nHonest reading:')
  for (const p of sp.honest_reading.points) console.log('  •', p)
  if (!okLev || !okNpv) process.exit(1)
}
