/**
 * @file headline-deriver.ts — Deterministic headline-from-modules per product class.
 *
 * Principles 1 + 2 (Tristan directive 2026-05-15): LLMs describe; deterministic
 * code computes. Summary metrics (annual throughput, round-trip efficiency,
 * payback) are derived from per-component data + brief constraints, NEVER
 * emitted by an LLM. Eliminates the bug class where a Flash-Lite headline of
 * "3832 MWh/year throughput" disagrees with both the LLM's stated derivation
 * (1533 MWh/year by arithmetic) and the cells-based recompute (1980 MWh/year).
 *
 * Framework is universal; per-class math lives in named deriver functions.
 * New product class = add a new deriver + register it. No prompt edits.
 *
 * Each deriver returns a KeyMetric shape with:
 *   - id, label, value (string), unit, notes (derivation, with show-your-work)
 *   - source: 'derived_deterministic' | 'derived_from_brief' | 'unavailable'
 */

import type { ModuleSpec, KeyMetric } from './types/module-decomposition'

// ─── helpers ───────────────────────────────────────────────────────────────

function pickModifier(mods: any[], kinds: string[]): any | undefined {
  for (const k of kinds) {
    const found = mods.find(m => m?.kind === k)
    if (found) return found
  }
  return undefined
}

function modNumber(mods: any[], kinds: string[]): number | null {
  const m = pickModifier(mods, kinds)
  if (!m) return null
  const raw = String(m.value ?? '').trim()
  const match = raw.match(/(-?\d[\d,]*\.?\d*)/)
  if (!match) return null
  const v = parseFloat(match[1].replace(/,/g, ''))
  return Number.isFinite(v) ? v : null
}

function getQuantity(word: { modifier_characters?: any[] }): number {
  const mods = Array.isArray(word.modifier_characters) ? word.modifier_characters : []
  const q = pickModifier(mods, ['quantity', 'qty'])
  if (!q) return 1
  const raw = String(q.value ?? '').trim().replace(/^(×|x|\*)\s*/i, '').replace(/[, ]/g, '')
  const m = raw.match(/^(\d[\d.]*)/)
  if (!m) return 1
  const v = parseFloat(m[1])
  return Number.isFinite(v) && v > 0 ? v : 1
}

function metric(id: string, label: string, value: string | number, unit: string, notes: string, source: 'derived_deterministic' | 'derived_from_brief' | 'unavailable' = 'derived_deterministic'): KeyMetric & { source: string } {
  return {
    id, label,
    value: typeof value === 'number' ? String(value) : value,
    unit,
    notes,
    source,
  } as any
}

function findModule(modules: ModuleSpec[], moduleId: string): ModuleSpec | undefined {
  return modules.find(m => m.module === moduleId)
}

/**
 * Build the deployment_context narrative for the Headline page.
 *
 * Strategy: pull the most useful sentences from parsedBrief — the deployment
 * envelope language ("inside a 40-ft container", "free-standing"), the
 * customer-installation scale ("100-250 m² per site", "fleet of 4-20"), and
 * any unit-count multiplier inferable from brief target_performance vs
 * unit-scale derived parameters.
 *
 * Universal pattern (2026-05-15): every class that ships as a unit AND is
 * typically deployed multi-unit at a customer site needs this line. iter-56
 * VF revealed the gap: 12 m² per-unit footprint read as 12 m² per site,
 * which is a 20× understatement of the customer installation. Headline page
 * surfaces this so the reader can't confuse the two.
 *
 * Per-class derivers can override with class-specific phrasing; this helper
 * is the default fallback.
 */
function buildDeploymentContextDefault(parsedBrief: any, unitYieldPerYear: number | null, briefAnnualConstraint: { value: number; unit: string } | null, briefText?: string | null): string | null {
  // Search every text source for deployment language. The brief-parser
  // (Flash-Lite) truncates context-rich detail — iter-56 VF dropped "shipping
  // container" entirely and "100-250 m²" survived only in `why_now`. Reading
  // the original brief text in addition to all parsedBrief text fields catches
  // both. parsedBrief fields are still used as fallbacks when briefText is
  // unavailable (state replay, partial state).
  const candidates: string[] = []
  if (briefText) candidates.push(String(briefText))
  for (const k of ['product_description', 'mission_statement', 'target_customers', 'why_now']) {
    const v = String(parsedBrief?.[k] ?? '').trim()
    if (v) candidates.push(v)
  }
  const searchHaystack = candidates.join('\n\n')
  if (!searchHaystack) return null

  const parts: string[] = []

  // Deployment-envelope hint ("inside a container", "wall-mounted", "rack-mounted", etc.)
  const deploymentPatterns: Array<{ rx: RegExp; phrase: string }> = [
    { rx: /\b(40|forty)[-\s]?(ft|foot)\s+(refrigerated\s+)?(iso\s+)?(shipping\s+)?container\b/i, phrase: '40-ft refrigerated ISO container' },
    { rx: /\b(20|twenty)[-\s]?(ft|foot)\s+(iso\s+)?container\b/i,                                phrase: '20-ft ISO container' },
    { rx: /\blight\s+industrial\s+(space|premises|unit)\b/i,                                        phrase: 'light industrial space' },
    { rx: /\b(stand[-\s]?alone|free[-\s]?standing|standalone)\b/i,                                  phrase: 'free-standing installation' },
    { rx: /\bwall[-\s]?mounted\b/i,                                                                  phrase: 'wall-mounted' },
    { rx: /\brack[-\s]?mounted\b/i,                                                                  phrase: 'rack-mounted' },
    { rx: /\bbody[-\s]?worn|\bwearable\b/i,                                                          phrase: 'body-worn' },
    { rx: /\bvehicle[-\s]?mounted\b/i,                                                               phrase: 'vehicle-mounted' },
  ]
  const venues: string[] = []
  const seen = new Set<string>()
  for (const { rx, phrase } of deploymentPatterns) {
    if (rx.test(searchHaystack) && !seen.has(phrase)) { venues.push(phrase); seen.add(phrase) }
  }
  if (venues.length > 0) {
    parts.push(`Per unit: ${venues.slice(0, 2).join(' or ')}.`)
  }

  // Customer installation scale — look for "N to M m²" or "fleet of N-M"
  const sizeMatch = searchHaystack.match(/(\d+)\s*[-–to]+\s*(\d+)\s*m[²2]/i)
  const fleetMatch = searchHaystack.match(/(?:fleet\s+of|up\s+to)\s+(\d+)\s*[-–to]+\s*(\d+)/i)
  if (sizeMatch || fleetMatch) {
    const range = sizeMatch ? `${sizeMatch[1]}-${sizeMatch[2]} m²` : `${fleetMatch![1]}-${fleetMatch![2]} units`
    parts.push(`Customer installations: ${range} per site.`)
  }

  // If we know both per-unit yield AND brief target, hint at unit-count multiplier
  if (unitYieldPerYear != null && briefAnnualConstraint != null && briefAnnualConstraint.value > 0) {
    const ratio = briefAnnualConstraint.value / unitYieldPerYear
    if (ratio >= 1.5) {
      const low = Math.max(1, Math.floor(ratio * 0.8))
      const high = Math.ceil(ratio * 1.2)
      parts.push(`At ${unitYieldPerYear.toLocaleString()} ${briefAnnualConstraint.unit} per unit, a customer reaches the brief target of ${briefAnnualConstraint.value.toLocaleString()} ${briefAnnualConstraint.unit} by deploying ~${low}-${high} units.`)
    }
  }

  return parts.length > 0 ? parts.join(' ') : null
}

// ─── BESS deriver ──────────────────────────────────────────────────────────

function deriveEnergyStorageHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null, orchestratorContract?: any): Record<string, any> {
  // Cells live in energy_storage_source. Aggregate count, find per-cell V and Ah.
  const esm = findModule(modules, 'energy_storage_source')
  let totalCells = 0
  let cellV: number | null = null
  let cellAh: number | null = null

  // ── Authoritative cell_count / cell_capacity_ah / cell_voltage_v from
  // orchestratorContract (single source of truth for all three).
  // The contract derives these from the physics tool (PyBaMM) output — they are
  // canonical, integer-clean values not susceptible to the BoM deny-list
  // whack-a-mole (cell_electrolyte missed L26; cell_heater_pad missed L28).
  // Fall back to the BoM walk ONLY if the contract is absent.
  const contractCellCount: number | null =
    typeof orchestratorContract?.quantities?.cell_count?.value === 'number'
      ? orchestratorContract.quantities.cell_count.value
      : null
  const contractCellAh: number | null =
    typeof orchestratorContract?.quantities?.cell_capacity_ah?.value === 'number'
      ? orchestratorContract.quantities.cell_capacity_ah.value
      : null
  const contractCellV: number | null =
    typeof orchestratorContract?.quantities?.cell_voltage_v?.value === 'number'
      ? orchestratorContract.quantities.cell_voltage_v.value
      : null

  // Match cells: character_id contains "cell" as a standalone word component,
  // but exclude cell-adjacent components (busbars, terminals, tap wires, etc.)
  const isCellRegex = /(^|_)cell(_|$)/
  // cell_electrolyte added 2026-05-25 (BESS L26 council fix 1): electrolyte is
  // an ancillary per-cell sub-component (×N_cells in BoM) and was being counted
  // as N additional cells, producing exactly 2× the true cell count (7501 vs 3750).
  // cell_heater_pad added 2026-05-25 (BESS L28 council fix): heater pads are
  // thermal management ancillaries (×N_subset in BoM, NOT full cell_count) and
  // were adding +15 to the count. Deny-list approach is whack-a-mole — prefer
  // contractCellCount above. Also skip no-qty cell words (spec/template rows).
  const isCellAdjacent = /cell_balanc|cell_to_cell|cell_terminal|cell_voltage_tap|cell_insulat|cell_string|cell_holder|cell_separator|cell_electrolyte|cell_heater/
  for (const sm of (esm?.sub_modules ?? [])) {
    for (const w of (sm.words ?? [])) {
      const charId = String(w.content_character?.character_id ?? w.id ?? '').toLowerCase()
      if (!isCellRegex.test(charId) || isCellAdjacent.test(charId)) continue
      const mods = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
      // Skip spec/template entries with no explicit quantity — bare cell words
      // default to qty=1 but represent a header row, not a counted cell.
      if (!mods.some((mc: any) => mc?.kind === 'quantity' || mc?.kind === 'qty')) continue
      totalCells += getQuantity(w)

      // Voltage extraction — LLM emits this several different ways:
      //   1. voltage / voltage_nominal_v / cell_voltage_v modifier (rare)
      //   2. dimension: "3.2 V"  (sometimes)
      //   3. dimension: "3.2"    (most common; bare number that happens to be voltage)
      //   4. rating_primary: "3.2 V"  (rare)
      // Bound check: LFP cell voltage is 3.0-3.4 V, NMC 3.6-3.8 V, NCA ~3.7 V.
      // Accept any bare number in 2.0-4.5 V on a cell-class component as voltage.
      if (cellV == null) {
        // Explicit voltage modifier first
        const v = modNumber(mods, ['voltage', 'voltage_nominal_v', 'nominal_voltage_v', 'cell_voltage_v', 'cell_voltage_nominal_v'])
        if (v != null && v >= 2.0 && v <= 4.5) cellV = v
      }
      if (cellV == null) {
        // Scan dimension / rating_primary / any modifier for a "<num> V" or
        // bare 2.0-4.5 numeric value
        for (const mc of mods) {
          const kind = String(mc.kind ?? '').toLowerCase()
          if (!/dimension|voltage|rating/.test(kind)) continue
          const raw = String(mc.value ?? '')
          // Try "<num> V" first
          const mV = raw.match(/(-?\d[\d.]*)\s*v\b/i)
          if (mV) { const n = parseFloat(mV[1]); if (n >= 2.0 && n <= 4.5) { cellV = n; break } }
          // Then bare number in valid cell-voltage range
          const mBare = raw.match(/^\s*(-?\d[\d.]*)\s*$/)
          if (mBare) { const n = parseFloat(mBare[1]); if (n >= 2.0 && n <= 4.5) { cellV = n; break } }
        }
      }

      if (cellAh == null) {
        cellAh = modNumber(mods, ['capacity_ah', 'capacity', 'rating_primary'])
        // rating_primary may be "280 Ah" or "280 Ah at 0.5 C" — modNumber's
        // regex grabs leading number. Bound check: typical cell Ah 50-1000.
        if (cellAh != null && (cellAh < 5 || cellAh > 10000)) cellAh = null
      }
    }
  }

  // Contract takes precedence over the BoM walk for cell_count / Ah / V.
  // These are derived from the physics tool (PyBaMM) and are the single source
  // of truth. BoM walk values are fallbacks for pre-contract runs only.
  if (contractCellCount !== null) {
    totalCells = contractCellCount
  }
  if (contractCellAh !== null) {
    cellAh = contractCellAh
  }
  if (contractCellV !== null) {
    cellV = contractCellV
  }

  // Brief target performance: usable energy in MWh (BESS-typical)
  const targetEnergyMwh = parsedBrief?.constraints?.target_performance?.value
  const targetUnit = String(parsedBrief?.constraints?.target_performance?.unit ?? '').toLowerCase()
  const briefMwh = typeof targetEnergyMwh === 'number' && targetUnit.includes('mwh') ? targetEnergyMwh : null

  // Nameplate energy — canonical source: orchestratorContract.quantities.nameplate_capacity_kwh
  // (emitted by pybamm tool or engineering-contract archetype builder; integer-clean).
  // Phase B fix (2026-05-28): this was recomputing cells×Ah×V/1e6 which diverges
  // from the contract when pybamm uses a different cell count than the BoM walk.
  // Fall back to the recomputation ONLY when the contract field is absent (pre-contract runs).
  const contractNameplateKwh: number | null =
    typeof orchestratorContract?.quantities?.nameplate_capacity_kwh?.value === 'number'
      ? orchestratorContract.quantities.nameplate_capacity_kwh.value
      : null
  const contractUsableKwh: number | null =
    typeof orchestratorContract?.quantities?.usable_capacity_kwh?.value === 'number'
      ? orchestratorContract.quantities.usable_capacity_kwh.value
      : null

  // Nameplate MWh — read canonical field; fall back to cell recomputation only if absent.
  let namePlateMwh: number | null = null
  if (contractNameplateKwh !== null) {
    // Primary: read the canonical single source of truth
    namePlateMwh = contractNameplateKwh / 1000
  } else if (totalCells > 0 && cellAh != null && cellV != null) {
    // Fallback: recompute from cells (pre-contract runs only)
    namePlateMwh = (totalCells * cellAh * cellV) / 1_000_000
  }

  // Usable energy at 80% DoD (BESS-standard assumption).
  // Phase B fix: prefer the canonical usable_capacity_kwh from the contract
  // (which is the integer-feasible achieved value, NOT the brief target).
  const dod = 0.80
  const usableMwh: number | null = contractUsableKwh !== null
    ? contractUsableKwh / 1000
    : namePlateMwh != null ? namePlateMwh * dod : null

  // Cycles per year — default 1 cycle/day = 365; brief may specify
  const cyclesPerYear = 365  // canonical BESS daily-cycling assumption

  // Annual throughput in MWh = usable × cycles/year
  const annualThroughputMwh = usableMwh != null ? usableMwh * cyclesPerYear : null

  // Round-trip efficiency: read from energy_conversion if present, else assume 0.92 (industry typical)
  const ect = findModule(modules, 'energy_conversion_transduction')
  let rteSystem: number | null = null
  if (ect?.derived_parameters) {
    const e = (ect.derived_parameters as any).round_trip_efficiency_percent ?? (ect.derived_parameters as any).efficiency_percent
    if (typeof e === 'number') rteSystem = e / 100
  }
  if (rteSystem == null) rteSystem = 0.92  // industry typical, surfaced in notes

  const out: Record<string, any> = {}

  // SUB-UTILITY HEADLINE = THE PRODUCT'S OWN CAPACITY IN ITS OWN UNITS (2026-07-10,
  // Powerwall cover: "5 MWh / year" annualised from a 13.5 kWh wall unit — technically
  // derived, completely misrepresenting the product's scale class; the deriver also
  // printed "0.01 MWh" usable. Below the containerised threshold (usable < 100 kWh —
  // the shared sub-utility signal) the headline is the usable energy in kWh, the
  // number the customer asked for; annual throughput stays available as a note.
  // Utility-scale output (≥ 100 kWh) is byte-identical.
  const usableKwhForHeadline = usableMwh != null ? usableMwh * 1000 : null
  if (usableKwhForHeadline != null && usableKwhForHeadline > 0 && usableKwhForHeadline < 100) {
    out.headline_output = metric(
      'usable_energy_kwh',
      'Usable energy',
      Math.round(usableKwhForHeadline * 10) / 10,
      'kWh',
      `${totalCells} cells × ${cellAh ?? '?'} Ah × ${cellV ?? '?'} V = ${((namePlateMwh ?? 0) * 1000).toFixed(1)} kWh nameplate; usable ${usableKwhForHeadline.toFixed(1)} kWh. (~${Math.round(annualThroughputMwh ?? 0)} MWh/year at daily cycling.) Derived deterministically from cell-string components.`,
      'derived_deterministic',
    )
  } else if (annualThroughputMwh != null) {
    out.headline_output = metric(
      'annual_throughput_mwh',
      'Annual MWh throughput',
      Math.round(annualThroughputMwh),
      'MWh / year',
      `${totalCells} cells × ${cellAh ?? '?'} Ah × ${cellV ?? '?'} V / 1e6 = ${namePlateMwh?.toFixed(2)} MWh nameplate; × ${dod} DoD = ${usableMwh?.toFixed(2)} MWh usable; × ${cyclesPerYear} cycles/year = ${Math.round(annualThroughputMwh)} MWh/year. Derived deterministically from cell-string components.`,
      'derived_deterministic',
    )
  } else if (briefMwh != null) {
    out.headline_output = metric(
      'annual_throughput_mwh',
      'Annual MWh throughput (estimated)',
      Math.round(briefMwh * dod * cyclesPerYear),
      'MWh / year',
      `Annual energy throughput estimated from brief constraints: target usable capacity × ${Math.round(dod * 100)}% DoD × ${cyclesPerYear} daily cycles/year. Cell components not yet emitted — throughput will be recalculated once cell topology is specified.`,
      'derived_from_brief',
    )
  }

  if (typeof briefMwh === 'number') {
    out.headline_constraint = metric(
      'usable_capacity_mwh',
      'Usable energy capacity (brief target)',
      briefMwh,
      'MWh',
      `Brief target: ${briefMwh} MWh usable at ${Math.round(dod * 100)}% DoD, beginning of life.`,
      'derived_from_brief',
    )
  } else if (usableMwh != null) {
    out.headline_constraint = metric(
      'usable_capacity_mwh',
      'Usable energy capacity (derived from cells)',
      usableMwh.toFixed(2),
      'MWh',
      `${totalCells} cells × ${cellAh ?? '?'} Ah × ${cellV ?? '?'} V × ${dod} DoD = ${usableMwh.toFixed(2)} MWh usable.`,
      'derived_deterministic',
    )
  }

  out.utilisation = metric(
    'round_trip_efficiency',
    'Round-trip efficiency',
    rteSystem.toFixed(2),
    'ratio',
    rteSystem === 0.92
      ? 'Industry-typical 0.92 (PCS + thermal losses). Not yet specified in design derived_parameters; surface a value once the energy_conversion module emits efficiency_percent.'
      : `System-level round-trip efficiency from energy_conversion_transduction.derived_parameters.efficiency_percent.`,
    rteSystem === 0.92 ? 'derived_from_brief' : 'derived_deterministic',
  )

  // Supporting: cell count, nameplate, cycles
  const supporting: any[] = []
  if (totalCells > 0) supporting.push(metric('cell_count', 'Cell count', totalCells, 'cells', `Total LFP prismatic cells in cell_string sub-modules.`, 'derived_deterministic'))
  if (namePlateMwh != null) supporting.push(metric(
    'nameplate_capacity_mwh',
    'Nameplate capacity',
    namePlateMwh.toFixed(2),
    'MWh',
    contractNameplateKwh !== null
      ? `From quantities.nameplate_capacity_kwh = ${contractNameplateKwh} kWh (canonical source, pybamm or archetype builder).`
      : `${totalCells} cells × ${cellAh} Ah × ${cellV} V (fallback: contract absent).`,
    contractNameplateKwh !== null ? 'derived_deterministic' : 'derived_deterministic',
  ))
  supporting.push(metric('cycles_per_year_assumed', 'Cycles per year (assumed)', cyclesPerYear, 'cycles/yr', 'BESS-standard daily-cycling assumption.', 'derived_from_brief'))

  out.supporting_metrics = supporting
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, annualThroughputMwh, null, briefText)

  return out
}

// ─── Heat pump deriver ────────────────────────────────────────────────────

function deriveHeatpumpHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // Heat pump output is bounded by compressor rated power × SCOP.
  // Compressor lives in energy_conversion_transduction; SCOP in derived_parameters there too.
  const ect = findModule(modules, 'energy_conversion_transduction')
  let ratedKw: number | null = null
  if (ect?.derived_parameters) {
    const dp = ect.derived_parameters as any
    const r = dp.rated_power_continuous_kw ?? dp.continuous_power_kw ?? dp.rated_power_kw ?? dp.rated_thermal_kw
    if (typeof r === 'number') ratedKw = r
  }
  // SCOP from energy_conversion
  let scop: number | null = null
  if (ect?.derived_parameters) {
    const dp = ect.derived_parameters as any
    const s = dp.scop ?? dp.cop_seasonal ?? dp.scop_seasonal
    if (typeof s === 'number') scop = s
  }
  const briefHeatKw = (() => {
    const tp = parsedBrief?.constraints?.target_performance
    if (!tp || typeof tp.value !== 'number') return null
    const unit = String(tp.unit ?? '').toLowerCase()
    if (unit.includes('kw')) return tp.value
    if (unit.includes('mw')) return tp.value * 1000
    return null
  })()
  const out: Record<string, any> = {}
  if (ratedKw != null) {
    out.headline_output = metric('thermal_output_kw', 'Thermal heating output', ratedKw, 'kW', `Rated continuous thermal output from energy_conversion_transduction.derived_parameters.rated_power_continuous_kw.`, 'derived_deterministic')
  } else if (briefHeatKw != null) {
    out.headline_output = metric('thermal_output_kw', 'Thermal heating output (brief target)', briefHeatKw, 'kW', `From brief target_performance.`, 'derived_from_brief')
  }
  if (briefHeatKw != null) {
    out.headline_constraint = metric('design_thermal_kw', 'Design thermal output', briefHeatKw, 'kW', `Brief target thermal output.`, 'derived_from_brief')
  }
  if (scop != null) {
    out.utilisation = metric('scop', 'Seasonal coefficient of performance', scop.toFixed(2), 'SCOP', `From energy_conversion_transduction.derived_parameters.`, 'derived_deterministic')
  } else {
    out.utilisation = metric('scop_assumed', 'SCOP (industry typical, not yet specified)', '4.0', 'SCOP', 'Industry-typical air-source SCOP; surface a value once energy_conversion emits scop.', 'derived_from_brief')
  }
  out.supporting_metrics = []
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, null, null, briefText)
  return out
}

// ─── Vertical farm deriver ────────────────────────────────────────────────

function deriveVerticalFarmHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // Yield = canopy_area × yield_rate (kg/m²/yr).
  //
  // Canopy area sources, in priority order:
  //   1. structure_containment.derived_parameters.canopy_area_m2 / growing_area_m2
  //      (canonical, if the LLMs emit it)
  //   2. footprint_m2 × tier_count from the same derived_parameters block
  //      (real-world VF designs emit footprint + tier count, not the product —
  //      iter-53 had footprint_m2=12, tier_count=6 → 72 m² canopy)
  //   3. brief target_performance if it carries m² units
  const struct = findModule(modules, 'structure_containment')
  let canopyArea: number | null = null
  let canopySource = ''
  if (struct?.derived_parameters) {
    const dp = struct.derived_parameters as any
    const tiers = typeof dp.tier_count === 'number' && dp.tier_count > 0 ? dp.tier_count : null

    // Explicit canopy field — use directly
    if (typeof dp.canopy_area_m2 === 'number') {
      canopyArea = dp.canopy_area_m2
      canopySource = `canopy_area_m2=${dp.canopy_area_m2} m² (explicit)`
    } else if (typeof dp.growing_area_m2 === 'number') {
      canopyArea = dp.growing_area_m2
      canopySource = `growing_area_m2=${dp.growing_area_m2} m² (explicit)`
    } else {
      // Footprint × tiers — `growing_area_sqm` and `footprint_m2` are ambiguous;
      // when tier_count > 1 and the value is small (< 50 m², plausible footprint),
      // assume it's footprint and multiply. Otherwise treat as canopy.
      const candidate = (typeof dp.footprint_m2 === 'number' ? dp.footprint_m2 : null)
                     ?? (typeof dp.growing_area_sqm === 'number' ? dp.growing_area_sqm : null)
                     ?? (typeof dp.growing_footprint_m2 === 'number' ? dp.growing_footprint_m2 : null)
      if (candidate != null) {
        if (tiers != null && tiers > 1 && candidate < 50) {
          canopyArea = candidate * tiers
          canopySource = `${candidate} m² footprint × ${tiers} tiers`
        } else {
          canopyArea = candidate
          canopySource = `${candidate} m² growing area (assumed canopy — no tier multiplier applied)`
        }
      }
    }
  }
  const briefAreaM2 = (() => {
    const tp = parsedBrief?.constraints?.target_performance
    if (tp && typeof tp.value === 'number' && /m.?2/i.test(String(tp.unit ?? ''))) return tp.value
    return null
  })()
  if (canopyArea == null && briefAreaM2 != null) {
    canopyArea = briefAreaM2
    canopySource = `${briefAreaM2} m² from brief target_performance`
  }
  // Bug fix #1 (2026-05-22): yield rate sourced from the tool-computed
  // achievable yield (plant-growth:yield output) first, then brief target,
  // then class-typical fallback. Previously hard-coded to 50 kg/m²/yr —
  // which mis-labelled real designs at 28.5 kg/m²/yr (achievable per the
  // Kozai 2019 + Bugbee 2017 DLI-driven empirical model) as failures. The
  // 50 number was the BRIEF TARGET (top-of-market Plenty/80 Acres
  // benchmark), not what the engineered LED+HVAC+plant model can deliver.
  // For Phase 1 we report the achievable on the headline; the Performance
  // Card 'brief target' column shows the 50 kg/m²/yr ambition and flags
  // the shortfall.
  const orchYieldPerM2 = (() => {
    // The orchestrator writes `crop_annual_yield_kg_m2` to module.derived_parameters
    // (growing_canopy in VF) from the plant-growth:yield tool. Search every
    // module's derived block for a tool-computed yield-per-m².
    if (!Array.isArray(modules)) return null
    for (const m of modules) {
      const dp = (m as any)?.derived_parameters ?? {}
      const cand = (typeof dp.yield_per_m2_per_year === 'number' ? dp.yield_per_m2_per_year : null)
        ?? (typeof dp.crop_annual_yield_kg_m2 === 'number' ? dp.crop_annual_yield_kg_m2 : null)
        ?? (typeof dp.annual_yield_kg_per_m2 === 'number' ? dp.annual_yield_kg_per_m2 : null)
      if (typeof cand === 'number' && Number.isFinite(cand) && cand > 0) return cand
    }
    return null
  })()
  const yieldPerM2 = orchYieldPerM2 ?? 50  // tool-derived achievable OR class-typical brief target
  const annualYieldKg = canopyArea != null ? canopyArea * yieldPerM2 : null

  // Brief constraint: convert kg/week → kg/year when needed so the headline
  // constraint matches the headline_output unit. iter-53 brief was 15 kg/week
  // (= 780 kg/year), prior code dropped it because unit didn't match m².
  let briefAnnualConstraint: { value: number; unit: string; raw: string } | null = null
  const tp = parsedBrief?.constraints?.target_performance
  if (tp && typeof tp.value === 'number') {
    const unit = String(tp.unit ?? '').toLowerCase()
    if (/kg.*week|kg.*wk/.test(unit))      briefAnnualConstraint = { value: Math.round(tp.value * 52), unit: 'kg/year', raw: `${tp.value} kg/week × 52 weeks` }
    else if (/kg.*month/.test(unit))       briefAnnualConstraint = { value: Math.round(tp.value * 12), unit: 'kg/year', raw: `${tp.value} kg/month × 12 months` }
    else if (/kg.*day|kg.*d/.test(unit))   briefAnnualConstraint = { value: Math.round(tp.value * 365), unit: 'kg/year', raw: `${tp.value} kg/day × 365 days` }
    else if (/kg.*year|kg.*yr/.test(unit)) briefAnnualConstraint = { value: Math.round(tp.value), unit: 'kg/year', raw: `${tp.value} kg/year` }
  }

  const out: Record<string, any> = {}
  if (annualYieldKg != null) {
    const yieldSourceNote = orchYieldPerM2 != null
      ? `${canopySource} × ${yieldPerM2.toFixed(1)} kg/m²/yr (tool-computed achievable from plant-growth:yield).`
      : `${canopySource} × ${yieldPerM2} kg/m²/yr (industry-typical brief-target leafy-green yield at high-end LED — design has no tool-computed yield rate yet).`
    out.headline_output = metric('annual_yield_kg', 'Annual yield', Math.round(annualYieldKg), 'kg/year', yieldSourceNote, 'derived_from_brief')
  }
  if (briefAnnualConstraint != null) {
    out.headline_constraint = metric('target_yield_kg_year', 'Brief target yield', briefAnnualConstraint.value, briefAnnualConstraint.unit, `Brief target_performance normalised: ${briefAnnualConstraint.raw}.`, 'derived_from_brief')
  } else if (canopyArea != null) {
    out.headline_constraint = metric('canopy_area_m2', 'Canopy area', canopyArea, 'm²', canopySource ? `Growing area: ${canopySource}.` : 'Growing area available.', 'derived_from_brief')
  }
  out.utilisation = metric('yield_per_m2_per_year', 'Yield per m² per year', Number(yieldPerM2.toFixed(1)), 'kg/m²/yr',
    orchYieldPerM2 != null
      ? 'Tool-computed achievable yield (plant-growth:yield DLI-driven model).'
      : 'Industry-typical high-end LED leafy-green rate (brief target — no tool-derived rate available).',
    'derived_from_brief')
  out.supporting_metrics = []
  out.deployment_context = buildDeploymentContextDefault(
    parsedBrief,
    annualYieldKg,
    briefAnnualConstraint ? { value: briefAnnualConstraint.value, unit: briefAnnualConstraint.unit } : null,
    briefText,
  )
  return out
}

// ─── Per-class derivers for the remaining 7 classes ───────────────────────
//
// Each follows the same template as deriveVerticalFarmHeadline:
//   1. Identify the headline output for the class (annual throughput, sessions
//      per day, doses per year, vehicles in the air, etc.).
//   2. Pull from structure_containment.derived_parameters with fallbacks to
//      brief target_performance.
//   3. Annotate every numeric with `source` (derived_deterministic /
//      derived_from_brief / unavailable).
//   4. Call buildDeploymentContextDefault to surface per-unit + installation
//      context to the Headline page.
//
// Universal pattern (2026-05-15): these derivers do NOT touch financial fields.
// Headline metrics are operational — output, capacity, utilisation, deployment.

function pickFirstNumber(dp: any, keys: string[]): number | null {
  if (!dp) return null
  for (const k of keys) {
    const v = dp[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

function deriveEvChargerHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // EV charger headline = peak DC power × utilisation hours/day × 365 = annual energy delivered.
  // Peak power lives in energy_conversion_transduction.derived_parameters.target_power_kw or rating.
  const ect = findModule(modules, 'energy_conversion_transduction')
  let peakKw = pickFirstNumber(ect?.derived_parameters, ['rated_power_kw', 'peak_power_kw', 'target_power_kw'])
  if (peakKw == null) {
    const tp = parsedBrief?.constraints?.target_performance
    if (tp && typeof tp.value === 'number' && /kw|kilowatt/i.test(String(tp.unit ?? ''))) peakKw = tp.value
  }
  const hoursPerDayAssumed = 8   // typical DC fast-charger utilisation
  const sessionsPerDayAssumed = peakKw != null && peakKw >= 50 ? 16 : 8  // 50 kW+ DC fast cycles faster
  const annualEnergyKwh = peakKw != null ? peakKw * hoursPerDayAssumed * 365 : null

  const out: Record<string, any> = {}
  if (annualEnergyKwh != null) {
    out.headline_output = metric('annual_energy_delivered_kwh', 'Annual energy delivered', Math.round(annualEnergyKwh), 'kWh/year',
      `${peakKw} kW peak × ${hoursPerDayAssumed} h/day average utilisation × 365 days (assumed utilisation; tighten with operator data).`,
      'derived_from_brief')
  }
  if (peakKw != null) {
    out.headline_constraint = metric('peak_power_kw', 'Peak DC output', peakKw, 'kW', `Rated peak DC output from energy_conversion_transduction.`, 'derived_deterministic')
  }
  out.utilisation = metric('sessions_per_day_assumed', 'Charging sessions per day (assumed)', sessionsPerDayAssumed, 'sessions/day', 'Industry-typical utilisation; tighten with site survey.', 'derived_from_brief')
  out.supporting_metrics = []
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, annualEnergyKwh, null, briefText)
  return out
}

function deriveWearableMedicalHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // CGM-style wearables: headline = sensor lifetime × accuracy. Brief usually
  // specifies "14-day wear" + "MARD ≤ 8%". Sensor lifetime from derived_parameters.
  const sensingMod = findModule(modules, 'sensing_instrumentation') ?? findModule(modules, 'energy_storage_source')
  const sensorDays = pickFirstNumber(sensingMod?.derived_parameters, ['sensor_lifetime_days', 'wear_duration_days', 'use_duration_days'])
  const mardPct = pickFirstNumber(sensingMod?.derived_parameters, ['mard_pct', 'accuracy_mard_pct', 'measurement_accuracy_mard_pct'])
  const dosesPerDayAssumed = 288  // CGM-typical: 1 reading every 5 minutes

  const out: Record<string, any> = {}
  if (sensorDays != null) {
    out.headline_output = metric('sensor_wear_duration_days', 'Sensor wear duration', sensorDays, 'days',
      `Continuous wear before replacement; matches brief lifetime target.`,
      'derived_from_brief')
  }
  if (mardPct != null) {
    out.headline_constraint = metric('mard_pct', 'Glucose accuracy (MARD)', mardPct, '% MARD', `Best-in-class CGMs hit ≤ 8% MARD vs YSI reference.`, 'derived_from_brief')
  }
  out.utilisation = metric('readings_per_day', 'Glucose readings per day', dosesPerDayAssumed, 'readings/day', '5-minute sampling is CGM-typical for closed-loop integration.', 'derived_from_brief')
  out.supporting_metrics = []
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, null, null, briefText)
  return out
}

function deriveDroneHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // Drone headline = MTOM (max take-off mass) → endurance + payload + range bounded by it.
  // Brief usually specifies MTOM, payload, endurance, max speed, IP rating.
  const struct = findModule(modules, 'structure_containment')
  const propulsion = findModule(modules, 'energy_conversion_transduction')
  const mtomKg = pickFirstNumber(struct?.derived_parameters, ['mtom_kg', 'max_takeoff_mass_kg', 'max_mass_kg'])
  const payloadKg = pickFirstNumber(struct?.derived_parameters, ['payload_kg', 'max_payload_kg'])
  const enduranceMin = pickFirstNumber(propulsion?.derived_parameters, ['endurance_min', 'flight_time_min', 'flight_duration_min'])
  const maxRangeKm = pickFirstNumber(propulsion?.derived_parameters, ['max_range_km', 'range_km'])

  const out: Record<string, any> = {}
  if (enduranceMin != null) {
    out.headline_output = metric('endurance_min', 'Flight endurance', enduranceMin, 'minutes',
      payloadKg != null
        ? `Sustained flight time at ${payloadKg} kg payload.`
        : 'Sustained flight time at nominal payload.',
      'derived_from_brief')
  }
  if (mtomKg != null) {
    out.headline_constraint = metric('mtom_kg', 'Maximum take-off mass', mtomKg, 'kg', 'Total airframe + battery + payload mass; sets EU class (C0/C1/C2/etc).', 'derived_from_brief')
  }
  if (payloadKg != null) {
    out.utilisation = metric('payload_kg', 'Useful payload', payloadKg, 'kg', 'Carrying capacity at full battery / nominal endurance.', 'derived_from_brief')
  }
  const supporting: any[] = []
  if (maxRangeKm != null) supporting.push(metric('max_range_km', 'Maximum range', maxRangeKm, 'km', 'Single-leg flight distance at cruise speed.', 'derived_from_brief'))
  out.supporting_metrics = supporting
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, null, null, briefText)
  return out
}

function deriveEdgeAiServerHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // Edge AI: headline = inference throughput (TOPS or TFLOPS or inferences/sec).
  // Power budget + thermal headroom are the binding constraints.
  const compute = findModule(modules, 'control_compute_communication') ?? findModule(modules, 'energy_conversion_transduction')
  const tops = pickFirstNumber(compute?.derived_parameters, ['target_performance_tops', 'compute_tops', 'inference_tops'])
  const powerW = pickFirstNumber(compute?.derived_parameters, ['power_budget_w', 'tdp_w', 'max_power_w'])
  const memoryGb = pickFirstNumber(compute?.derived_parameters, ['memory_gb', 'ram_gb', 'on_device_memory_gb'])

  const out: Record<string, any> = {}
  if (tops != null) {
    out.headline_output = metric('compute_tops', 'Inference throughput', tops, 'TOPS', 'Peak sustained INT8 inference performance at the device.', 'derived_from_brief')
  }
  if (powerW != null) {
    out.headline_constraint = metric('power_budget_w', 'Power budget', powerW, 'W', 'Sustained system power envelope; sets thermal and PSU sizing.', 'derived_from_brief')
  }
  if (tops != null && powerW != null && powerW > 0) {
    out.utilisation = metric('tops_per_watt', 'Compute efficiency', (tops / powerW).toFixed(2), 'TOPS/W', `${tops} TOPS / ${powerW} W = ${(tops / powerW).toFixed(2)} TOPS/W.`, 'derived_deterministic')
  }
  const supporting: any[] = []
  if (memoryGb != null) supporting.push(metric('memory_gb', 'On-device memory', memoryGb, 'GB', 'Model + working set capacity.', 'derived_from_brief'))
  out.supporting_metrics = supporting
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, null, null, briefText)
  return out
}

function deriveBioreactorHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // Bioreactor headline = working volume × batches/year × titer = annual product mass.
  // Brief usually specifies working volume (L), titer (g/L), batch time (days).
  const vessel = findModule(modules, 'structure_containment')
  const workingVolL = pickFirstNumber(vessel?.derived_parameters, ['working_volume_l', 'reactor_volume_l', 'volume_l'])
  const titerGpL = pickFirstNumber(vessel?.derived_parameters, ['titer_g_per_l', 'product_titer_g_per_l'])
  const batchDays = pickFirstNumber(vessel?.derived_parameters, ['batch_duration_days', 'cycle_time_days']) ?? 14
  const batchesPerYear = Math.floor(365 / batchDays)
  const annualKg = workingVolL != null && titerGpL != null ? (workingVolL * titerGpL * batchesPerYear) / 1000 : null

  const out: Record<string, any> = {}
  if (annualKg != null) {
    out.headline_output = metric('annual_product_kg', 'Annual product output', Math.round(annualKg), 'kg/year',
      `${workingVolL} L working volume × ${titerGpL} g/L titer × ${batchesPerYear} batches/year (${batchDays}-day cycle) ÷ 1000.`,
      'derived_deterministic')
  }
  if (workingVolL != null) {
    out.headline_constraint = metric('working_volume_l', 'Working volume', workingVolL, 'L', 'Maximum batch volume per cycle.', 'derived_from_brief')
  }
  if (titerGpL != null) {
    out.utilisation = metric('titer_g_per_l', 'Product titer', titerGpL, 'g/L', 'Product concentration at harvest.', 'derived_from_brief')
  }
  const supporting: any[] = []
  if (batchDays != null) supporting.push(metric('batch_duration_days', 'Batch cycle time', batchDays, 'days', 'Inoculation through harvest + CIP/SIP turnaround.', 'derived_from_brief'))
  out.supporting_metrics = supporting
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, annualKg, null, briefText)
  return out
}

function deriveAuvHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // AUV headline = mission duration × operating depth + payload.
  const propulsion = findModule(modules, 'energy_conversion_transduction')
  const struct = findModule(modules, 'structure_containment')
  const missionHours = pickFirstNumber(propulsion?.derived_parameters, ['endurance_hours', 'mission_duration_hours', 'endurance_h'])
  const operatingDepthM = pickFirstNumber(struct?.derived_parameters, ['operating_depth_m', 'max_depth_m', 'rated_depth_m'])
  const payloadKg = pickFirstNumber(struct?.derived_parameters, ['payload_kg', 'max_payload_kg'])
  const cruiseSpeedKn = pickFirstNumber(propulsion?.derived_parameters, ['cruise_speed_kn', 'speed_kn', 'cruise_speed_knots'])

  const out: Record<string, any> = {}
  if (missionHours != null) {
    out.headline_output = metric('mission_endurance_hours', 'Mission endurance', missionHours, 'hours',
      cruiseSpeedKn != null ? `Continuous mission at ${cruiseSpeedKn} kn cruise.` : 'Continuous mission at cruise speed.',
      'derived_from_brief')
  }
  if (operatingDepthM != null) {
    out.headline_constraint = metric('operating_depth_m', 'Operating depth', operatingDepthM, 'm', 'Rated maximum operating depth; sets hull pressure design.', 'derived_from_brief')
  }
  if (cruiseSpeedKn != null) {
    out.utilisation = metric('cruise_speed_kn', 'Cruise speed', cruiseSpeedKn, 'kn', 'Sustained cruise; range = endurance × this.', 'derived_from_brief')
  }
  const supporting: any[] = []
  if (payloadKg != null) supporting.push(metric('payload_kg', 'Payload capacity', payloadKg, 'kg', 'Sensor + sampling payload allowance.', 'derived_from_brief'))
  out.supporting_metrics = supporting
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, null, null, briefText)
  return out
}

function deriveHapsHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null): Record<string, any> {
  // HAPS headline = station-keeping duration at altitude × payload.
  const propulsion = findModule(modules, 'energy_conversion_transduction')
  const struct = findModule(modules, 'structure_containment')
  const stationDays = pickFirstNumber(propulsion?.derived_parameters, ['station_keeping_days', 'endurance_days', 'mission_duration_days'])
  const altitudeKm = pickFirstNumber(struct?.derived_parameters, ['cruise_altitude_km', 'operating_altitude_km', 'altitude_km'])
  const payloadKg = pickFirstNumber(struct?.derived_parameters, ['payload_kg', 'max_payload_kg'])
  const wingspanM = pickFirstNumber(struct?.derived_parameters, ['wingspan_m', 'span_m'])

  const out: Record<string, any> = {}
  if (stationDays != null) {
    out.headline_output = metric('station_keeping_days', 'Station-keeping endurance', stationDays, 'days',
      altitudeKm != null ? `Sustained station-keeping at ${altitudeKm} km altitude.` : 'Sustained station-keeping at operating altitude.',
      'derived_from_brief')
  }
  if (altitudeKm != null) {
    out.headline_constraint = metric('cruise_altitude_km', 'Operating altitude', altitudeKm, 'km', 'Stratospheric cruise altitude; sets thermal / pressure / UV exposure profile.', 'derived_from_brief')
  }
  if (payloadKg != null) {
    out.utilisation = metric('payload_kg', 'Payload mass', payloadKg, 'kg', 'Communications / sensing payload allowance.', 'derived_from_brief')
  }
  const supporting: any[] = []
  if (wingspanM != null) supporting.push(metric('wingspan_m', 'Wingspan', wingspanM, 'm', 'Total wingtip-to-wingtip span; drives solar array area.', 'derived_from_brief'))
  out.supporting_metrics = supporting
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, null, null, briefText)
  return out
}

function deriveWindHeadline(modules: ModuleSpec[], parsedBrief: any, briefText?: string | null, orchestratorContract?: any): Record<string, any> {
  // Wind headline = annual energy yield. CONVENTION (matches the BESS deriver):
  // read the ACHIEVED value from orchestratorContract.quantities — the canonical
  // single source of truth (the wind-resource tool's physics output), NOT the
  // brief target. The cover must agree with the Brief Compliance table; showing
  // the brief's 42% target yield (22,075 MWh) while the design achieves ~35%
  // (18,159 MWh) would be the same target-as-achievement overstatement we fixed
  // on cost. Fall back to the brief CF only for pre-contract runs.
  const q = orchestratorContract?.quantities ?? {}
  const ect = findModule(modules, 'energy_conversion_transduction') ?? findModule(modules, 'power_generation')
  let ratedKw = pickFirstNumber(ect?.derived_parameters, ['rated_power_kw', 'rated_power_continuous_kw', 'continuous_power_kw', 'rated_ac_power_kw'])
  const metrics: any[] = Array.isArray(parsedBrief?.constraints?.target_performance?.metrics) ? parsedBrief.constraints.target_performance.metrics : []
  const findM = (k: string) => metrics.find((m) => String(m?.key_metric ?? '').includes(k))
  if (ratedKw == null) {
    const rp = findM('rated_power')
    if (rp && typeof rp.value === 'number') ratedKw = /mw/i.test(String(rp.unit ?? '')) ? rp.value * 1000 : rp.value
  }
  if (typeof q?.rated_power_kw?.value === 'number' && q.rated_power_kw.value > 0) ratedKw = q.rated_power_kw.value
  // ACHIEVED capacity factor from the wind-resource tool; brief target is the
  // pre-contract fallback only.
  const achievedCfPct = typeof q?.capacity_factor_pct?.value === 'number' && q.capacity_factor_pct.value > 0 ? q.capacity_factor_pct.value : null
  const cfM = findM('capacity_factor')
  const briefCfPct = cfM && typeof cfM.value === 'number' && cfM.value > 0 ? cfM.value : 38
  const cfPct = achievedCfPct ?? briefCfPct
  const cfSource = achievedCfPct != null ? 'achieved' : 'brief target'
  // Prefer the tool's authoritative annual energy; else compute from CF.
  const contractAepMwh = typeof q?.annual_energy_kwh?.value === 'number' && q.annual_energy_kwh.value > 0 ? Math.round(q.annual_energy_kwh.value / 1000) : null
  const annualEnergyMwh = contractAepMwh ?? (ratedKw != null ? Math.round((ratedKw * (cfPct / 100) * 8760) / 1000) : null)

  const out: Record<string, any> = {}
  if (annualEnergyMwh != null && ratedKw != null) {
    out.headline_output = metric('annual_energy_mwh', 'Annual energy yield', annualEnergyMwh, 'MWh/year',
      `${(ratedKw / 1000).toFixed(1)} MW rated × ${cfPct.toFixed(0)}% capacity factor (${cfSource}) × 8760 h.`,
      achievedCfPct != null ? 'derived_deterministic' : 'derived_from_brief')
  }
  if (ratedKw != null) {
    out.headline_constraint = metric('rated_power_kw', 'Rated electrical power', ratedKw, 'kW', 'Nameplate AC power.', 'derived_deterministic')
  }
  out.supporting_metrics = []
  out.deployment_context = buildDeploymentContextDefault(parsedBrief, annualEnergyMwh != null ? annualEnergyMwh * 1000 : null, null, briefText)
  return out
}

// ─── Universal fallback deriver (any / unknown class) ────────────────────────
//
// THE AIM: the engine must work on UNKNOWN / novel classes. A class with no
// registered per-class deriver MUST still render a real headline — never a bare
// "—" (the DAC + h2_electrolyser blank-headline bug, 2026-06-01). This surfaces
// the brief's primary target_performance metric (the single "what it delivers"
// number the brief states), its supporting metrics, and a binding constraint
// (cost ceiling / mass cap) straight from parsedBrief — so DAC, h2_electrolyser,
// humanoid, cnc, tidal and any future class get a populated, honest, brief-
// faithful headline instead of a placeholder. A registered per-class deriver
// (BESS, wind, …) still takes precedence and computes from design data.

function prettyKey(k: string): string {
  let s = String(k || '').trim()
  // Strip a trailing unit-ish suffix that just duplicates the unit column.
  s = s.replace(/_(kw|kwh|kg_per_hr|kwh_per_kg|kg|gbp|bar|percent|pct|m_s|mm|m2|m3|nm3|hr|hz|deg_c|c|v|a|l)$/i, '')
  return s.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()).trim() || 'Headline output'
}

// Coerce a brief constraint that may be a bare number OR a { value, ... } object.
function briefNum(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object' && typeof v.value === 'number' && Number.isFinite(v.value)) return v.value
  return null
}

function deriveUniversalHeadlineFromBrief(modules: ModuleSpec[], parsedBrief: any, productClass: string, briefText?: string | null): Record<string, any> {
  const out: Record<string, any> = {}
  const c = parsedBrief?.constraints ?? {}
  const tp = c.target_performance
  const fmt = (v: any) => (typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-GB') : String(v)) : String(v ?? ''))

  // Primary headline output: the brief's top-level target_performance metric.
  let primaryKey: string | null = null
  if (tp && tp.value != null && String(tp.value) !== '') {
    primaryKey = String(tp.key_metric ?? '')
    out.headline_output = metric(
      'brief_headline_output',
      prettyKey(tp.key_metric ?? 'Headline output'),
      fmt(tp.value),
      String(tp.unit ?? ''),
      `Primary deliverable taken directly from the brief target (parsedBrief.constraints.target_performance). No per-class headline deriver yet for "${productClass}"; surfaced from the brief so the headline is never blank.`,
      'derived_from_brief',
    )
  }

  // Supporting metrics: the rest of target_performance.metrics[] (skip the dup).
  const metricsArr: any[] = Array.isArray(tp?.metrics) ? tp.metrics : []
  const supporting: any[] = []
  for (const m of metricsArr) {
    if (m?.value == null || String(m.value) === '') continue
    if (primaryKey && String(m.key_metric ?? '') === primaryKey) continue
    supporting.push(metric(String(m.key_metric ?? 'metric'), prettyKey(m.key_metric ?? 'Metric'), fmt(m.value), String(m.unit ?? ''), `Brief target metric (${String(m.category ?? 'spec')}).`, 'derived_from_brief'))
    if (supporting.length >= 5) break
  }
  // target_performance absent but metrics[] present → promote the first metric.
  if (!out.headline_output && supporting.length > 0) {
    out.headline_output = supporting.shift()
  }
  out.supporting_metrics = supporting

  // Binding constraint: cost ceiling preferred, else mass cap.
  const costCeil = briefNum(c.unit_cost_ceiling) ?? briefNum(c.unit_cost_ceiling_gbp) ?? briefNum(c.cost_ceiling_gbp)
  const massCap = briefNum(c.max_mass_kg) ?? briefNum(c.mass_ceiling_kg)
  if (costCeil != null && costCeil > 0) {
    out.headline_constraint = metric('unit_cost_ceiling_gbp', 'Unit cost ceiling', fmt(costCeil), 'GBP', 'Brief cost ceiling per unit.', 'derived_from_brief')
  } else if (massCap != null && massCap > 0) {
    out.headline_constraint = metric('max_mass_kg', 'Mass ceiling', fmt(massCap), 'kg', 'Brief maximum gross mass.', 'derived_from_brief')
  }

  out.deployment_context = buildDeploymentContextDefault(parsedBrief, null, null, briefText)
  return out
}

// ─── Registry ──────────────────────────────────────────────────────────────

type Deriver = (modules: ModuleSpec[], parsedBrief: any, briefText?: string | null, orchestratorContract?: any) => Record<string, any>

const DERIVERS: Record<string, Deriver> = {
  energy_storage:    deriveEnergyStorageHeadline,
  thermal_system:    deriveHeatpumpHeadline,
  vertical_farm:     deriveVerticalFarmHeadline,
  ev_charger:        deriveEvChargerHeadline,
  wearable_medical:  deriveWearableMedicalHeadline,
  drone:             deriveDroneHeadline,
  edge_ai_server:    deriveEdgeAiServerHeadline,
  bioreactor:        deriveBioreactorHeadline,
  auv:               deriveAuvHeadline,
  haps:              deriveHapsHeadline,
  wind_turbine:      deriveWindHeadline,
  wind:              deriveWindHeadline,
}

/**
 * Public entrypoint. Returns a KeyMetrics-shaped object whose every numeric
 * field carries a `source` annotation (derived_deterministic / derived_from_brief
 * / unavailable). Caller saves to state; renderer surfaces source provenance.
 *
 * `briefText` (optional) is the original brief markdown — passed through so
 * the deployment_context helper can search the source-of-truth, not just the
 * lossy parsedBrief. Brief-parser drops detail like "shipping container" or
 * narrow size ranges; reading the raw brief captures them.
 *
 * `orchestratorContract` (optional) is the engineering contract emitted at
 * Stage 17 of the chain. When present, class-specific derivers MAY read
 * authoritative quantities from it instead of re-deriving from the BoM.
 * For BESS: quantities.cell_count.value is the single source of truth for the
 * cell count (derived from rack_count × cells_per_rack by the physics tool).
 */
export function deriveHeadlineFromModules(modules: ModuleSpec[], parsedBrief: any, productClass: string, briefText?: string | null, orchestratorContract?: any): any {
  const deriver = DERIVERS[productClass]
  if (deriver) {
    const out = deriver(modules, parsedBrief, briefText, orchestratorContract)
    // Safety net: even a REGISTERED deriver can return an empty headline when
    // its class-specific required fields are absent from the design (e.g. the
    // bioreactor deriver needs a titer the brief never states → no headline).
    // Backfill any missing top-line field from the universal brief fallback so
    // the headline is never blank for ANY class. (2026-06-01 — DAC/h2/bioreactor
    // blank-headline bug family.)
    const ho = out.headline_output
    const needsOutput = !ho || ho.value == null || String(ho.value).trim() === '' || String(ho.value).trim() === '—'
    if (needsOutput || !out.headline_constraint || !(out.supporting_metrics?.length)) {
      const uni = deriveUniversalHeadlineFromBrief(modules, parsedBrief, productClass, briefText)
      if (needsOutput && uni.headline_output) out.headline_output = uni.headline_output
      if (!out.headline_constraint && uni.headline_constraint) out.headline_constraint = uni.headline_constraint
      if (!(out.supporting_metrics?.length) && uni.supporting_metrics?.length) out.supporting_metrics = uni.supporting_metrics
      if (!out.deployment_context && uni.deployment_context) out.deployment_context = uni.deployment_context
    }
    return {
      ...out,
      generated_by: needsOutput ? 'deterministic_deriver+brief_backfill' : 'deterministic_deriver',
      generated_at: new Date().toISOString(),
      product_class: productClass,
    }
  }
  // No per-class deriver — use the universal brief-derived fallback so the
  // headline is NEVER a bare "—" (THE AIM: the engine must work on unknown /
  // novel classes). Surfaces the brief's target_performance + supporting metrics
  // + a binding constraint straight from parsedBrief.
  const uni = deriveUniversalHeadlineFromBrief(modules, parsedBrief, productClass, briefText)
  return {
    ...uni,
    generated_by: 'universal_brief_fallback',
    generated_at: new Date().toISOString(),
    product_class: productClass,
  }
}
