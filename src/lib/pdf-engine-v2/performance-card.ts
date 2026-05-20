/**
 * @file performance-card.ts — Class-aware performance summary table.
 *
 * Tristan 2026-05-20: every PDF should open with a one-glance spec sheet:
 * canopy area, installed power, cooling capacity, humidity range, CO2
 * target, etc. for a vertical farm; capacity / cell topology / DC voltage /
 * cooling for a BESS; rated thermal / COP / refrigerant / SCOP for a heat
 * pump.
 *
 * The card serves three audiences simultaneously:
 *  1. Buyer / non-engineer: confirm "this matches my brief" at a glance.
 *  2. Engineer: spot contradictions between modules without reading 80 pages
 *     of prose (e.g. LED prose says 20 kW but BoM has 40 × 200 W = 8 kW).
 *  3. Council reviewer: structured numbers to compare against benchmarks.
 *
 * Architecture:
 *  - A `PerformanceCardSchema` per product class defines which metrics to
 *    surface and where to find them in state.
 *  - `buildPerformanceCard(state)` resolves each metric from priority-ordered
 *    sources, optionally compares against a brief target, and tags each row
 *    with a status (`ok` | `delta` | `missing` | `out_of_range`).
 *  - Renderer emits a `PerformanceCardPage` after the operational headline.
 *
 * To add a new product class, drop a new entry in PERFORMANCE_CARDS. The
 * generic schema is a fallback for unmapped classes.
 */

export type PerformanceStatus = 'ok' | 'delta' | 'missing' | 'out_of_range' | 'computed'

export interface ResolvedMetric {
  id: string
  section: string
  label: string
  unit: string
  /** Resolved value (number, string, or formatted range). null if not found. */
  value: string | number | null
  /** Where the value was resolved from (e.g. "module 4.derived.led_power_kw"). */
  source: string | null
  /** Brief constraint, when applicable. Shown alongside `value`. */
  brief_target: string | number | null
  /** Status (drives the icon in the table). */
  status: PerformanceStatus
  /** Optional human-readable note (e.g. "low for leafy greens"). */
  note: string | null
}

export interface PerformanceCard {
  product_class: string
  sections: Array<{ name: string; metrics: ResolvedMetric[] }>
  /** Top-line `delta` / `missing` / `out_of_range` rows (for cover-page hint badge). */
  warnings: Array<{ id: string; section: string; label: string; status: PerformanceStatus; note: string }>
}

export interface MetricSpec {
  id: string
  label: string
  unit: string
  /**
   * Field paths to search in priority order. Searched left-to-right; first
   * non-null wins. Each path is a dot-notation against `state`, plus two
   * special prefixes:
   *  - `module:<module_id>.derived.<key>` → reads
   *    `state.moduleDecomposition[.design].modules.find(m=>m.module===module_id).derived_parameters[key]`
   *  - `any_module.derived.<key>` → first module whose derived_parameters
   *    contains <key>
   */
  sources: string[]
  /** Brief constraint path for cross-check (dot-notation against state). Optional. */
  brief_path?: string
  /** Plausible range. Outside → status='out_of_range'. Optional. */
  reasonable_range?: [number, number]
  /**
   * Optional computed value. If provided AND no source resolves, the function
   * is called with `(state, resolvedMetricsSoFar)` and its return becomes the
   * value (status='computed'). Used for ratios like yield_per_m2.
   */
  compute?: (state: any, resolved: Record<string, ResolvedMetric>) => number | null
  /** Optional note/warning template — passed the resolved value. */
  note?: (value: any, state: any) => string | null
  /** When this metric is a numeric range like "65-75% RH" or "22 / 18 °C", format separately. */
  format?: 'number' | 'range_dash' | 'range_slash' | 'string'
}

export interface PerformanceCardSchema {
  product_class: string
  sections: Array<{ name: string; metrics: MetricSpec[] }>
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getByPath(state: any, path: string): any {
  if (!path) return null
  // Special: module:<id>.derived.<key>
  const modMatch = path.match(/^module:([^.]+)\.derived\.(.+)$/)
  if (modMatch) {
    const [, modId, key] = modMatch
    const mods = getModules(state)
    const m = mods.find((mm: any) => mm?.module === modId)
    return m?.derived_parameters?.[key] ?? null
  }
  // Special: any_module.derived.<key>
  const anyMatch = path.match(/^any_module\.derived\.(.+)$/)
  if (anyMatch) {
    const [, key] = anyMatch
    const mods = getModules(state)
    for (const m of mods) {
      const v = m?.derived_parameters?.[key]
      if (v !== undefined && v !== null) return v
    }
    return null
  }
  // Generic dot path
  const parts = path.split('.')
  let cursor: any = state
  for (const p of parts) {
    if (cursor === null || cursor === undefined) return null
    cursor = cursor[p]
  }
  return cursor ?? null
}

function getModules(state: any): any[] {
  const a = state?.moduleDecomposition?.design?.modules
  if (Array.isArray(a)) return a
  const b = state?.moduleDecomposition?.modules
  if (Array.isArray(b)) return b
  return []
}

function num(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function fmt(value: number | string | null, unit: string, format: MetricSpec['format'] = 'number'): string | number | null {
  if (value === null) return null
  if (format === 'string') return String(value)
  if (typeof value === 'number') {
    const rounded = Math.abs(value) >= 100 ? Math.round(value) : value
    return `${rounded} ${unit}`.trim()
  }
  return `${value} ${unit}`.trim()
}

function compareToBrief(value: number | string | null, brief: number | string | null): { isDelta: boolean; pct: number | null } {
  if (value === null || brief === null) return { isDelta: false, pct: null }
  const v = num(value)
  const b = num(brief)
  if (v === null || b === null) {
    return { isDelta: String(value).trim() !== String(brief).trim(), pct: null }
  }
  if (b === 0) return { isDelta: v !== 0, pct: null }
  const pct = ((v - b) / b) * 100
  return { isDelta: Math.abs(pct) > 5, pct }
}

// ─── per-class schemas ──────────────────────────────────────────────────────

const VERTICAL_FARM_SCHEMA: PerformanceCardSchema = {
  product_class: 'vertical-farm',
  sections: [
    {
      name: 'Production',
      metrics: [
        { id: 'canopy_area_m2', label: 'Growing area', unit: 'm²', sources: ['any_module.derived.canopy_area_m2', 'any_module.derived.growing_area_m2'], brief_path: 'parsedBrief.constraints.target_canopy_m2.value' },
        { id: 'annual_yield_kg', label: 'Annual yield', unit: 'kg/year', sources: ['keyMetrics.headline_output.value', 'any_module.derived.annual_yield_kg'] },
        { id: 'yield_density', label: 'Yield density', unit: 'kg/m²/yr', sources: ['keyMetrics.supporting_metrics.0.value', 'any_module.derived.yield_per_m2_per_year'],
          compute: (_s, r) => {
            const a = num(r.canopy_area_m2?.value)
            const y = num(r.annual_yield_kg?.value)
            return a && y ? y / a : null
          },
        },
        { id: 'photoperiod_h', label: 'Photoperiod', unit: 'h/day', sources: ['any_module.derived.photoperiod_h', 'any_module.derived.photoperiod_hours'], reasonable_range: [12, 20] },
      ],
    },
    {
      name: 'Lighting',
      metrics: [
        { id: 'led_power_kw', label: 'LED installed power', unit: 'kW', sources: ['any_module.derived.led_power_kw', 'any_module.derived.lighting_power_kw'], reasonable_range: [0.05, 0.5], note: () => null /* note set by per-m² check below */ },
        { id: 'led_power_per_m2', label: 'LED power density', unit: 'kW/m²', sources: [],
          compute: (_s, r) => {
            const a = num(r.canopy_area_m2?.value)
            const p = num(r.led_power_kw?.value)
            return a && p ? p / a : null
          },
          note: (v) => {
            const n = num(v)
            if (n === null) return null
            if (n < 0.15) return 'Low for leafy greens (typical 0.20-0.30 kW/m²)'
            if (n > 0.35) return 'High — verify PPFD claim matches'
            return null
          },
        },
        { id: 'ppfd_umol_m2_s', label: 'Photon flux at canopy', unit: 'µmol/m²/s', sources: ['any_module.derived.ppfd_umol_m2_s', 'any_module.derived.ppfd', 'any_module.derived.target_ppfd'], reasonable_range: [150, 400],
          note: (v) => {
            const n = num(v)
            if (n === null) return null
            if (n < 200) return 'Low for leafy greens (commercial typical 250-300)'
            return null
          },
        },
        { id: 'led_efficacy', label: 'LED efficacy', unit: 'µmol/J', sources: ['any_module.derived.led_efficacy_umol_j', 'any_module.derived.photon_efficacy'], reasonable_range: [2.0, 3.5] },
      ],
    },
    {
      name: 'HVAC / Environment',
      metrics: [
        { id: 'heat_load_kw', label: 'Sensible heat load', unit: 'kW', sources: ['any_module.derived.heat_load_kw', 'any_module.derived.max_heat_rejection_kw', 'any_module.derived.sensible_heat_kw'] },
        { id: 'cooling_capacity_kw', label: 'Cooling capacity', unit: 'kW', sources: ['any_module.derived.cooling_capacity_kw', 'any_module.derived.dx_cooling_kw'] },
        { id: 'latent_load_kg_h', label: 'Latent moisture load', unit: 'kg/h', sources: ['any_module.derived.latent_load_kg_h', 'any_module.derived.transpiration_kg_h', 'any_module.derived.dehumidification_kg_h'] },
        { id: 'condensate_recovery_l_day', label: 'Condensate recovery', unit: 'L/day', sources: ['any_module.derived.condensate_recovery_l_day'] },
        { id: 'temp_setpoint_day_c', label: 'Day temperature setpoint', unit: '°C', sources: ['any_module.derived.temp_setpoint_day_c', 'any_module.derived.day_setpoint_c'], reasonable_range: [18, 26] },
        { id: 'temp_setpoint_night_c', label: 'Night temperature setpoint', unit: '°C', sources: ['any_module.derived.temp_setpoint_night_c', 'any_module.derived.night_setpoint_c'], reasonable_range: [14, 22] },
        { id: 'humidity_min_pct', label: 'Humidity minimum', unit: '% RH', sources: ['any_module.derived.humidity_min_pct', 'any_module.derived.rh_min_pct'], reasonable_range: [40, 80] },
        { id: 'humidity_max_pct', label: 'Humidity maximum', unit: '% RH', sources: ['any_module.derived.humidity_max_pct', 'any_module.derived.rh_max_pct'], reasonable_range: [50, 90] },
        { id: 'ach', label: 'Air changes per hour', unit: 'ACH', sources: ['any_module.derived.air_changes_per_hour', 'any_module.derived.ach'], reasonable_range: [10, 60] },
      ],
    },
    {
      name: 'Atmosphere',
      metrics: [
        { id: 'co2_ppm_target', label: 'CO2 enrichment target', unit: 'ppm', sources: ['any_module.derived.co2_ppm_target', 'any_module.derived.target_co2_ppm'], reasonable_range: [600, 1500] },
        { id: 'co2_alarm_ppm', label: 'CO2 occupancy alarm', unit: 'ppm', sources: ['any_module.derived.co2_alarm_ppm'], reasonable_range: [1000, 3000] },
      ],
    },
    {
      name: 'Electrical',
      metrics: [
        { id: 'peak_power_kw', label: 'Peak electrical load', unit: 'kW', sources: ['any_module.derived.peak_power_kw', 'any_module.derived.max_power_kw', 'any_module.derived.continuous_power_kw'] },
        { id: 'supply_voltage_v', label: 'Supply voltage', unit: 'V AC', sources: ['any_module.derived.supply_voltage_v', 'any_module.derived.grid_voltage_v'] },
        { id: 'supply_current_a', label: 'Supply current', unit: 'A', sources: ['any_module.derived.supply_current_a', 'any_module.derived.main_breaker_a', 'any_module.derived.ac_breaker_rating_a'] },
      ],
    },
    {
      name: 'Envelope',
      metrics: [
        { id: 'primary_container', label: 'Primary container', unit: '', sources: ['any_module.derived.primary_container_type', 'any_module.derived.container_type'], format: 'string' },
        { id: 'fertigation_container', label: 'Fertigation container', unit: '', sources: ['any_module.derived.fertigation_container_type'], format: 'string' },
        { id: 'envelope_volume_m3', label: 'Envelope volume', unit: 'm³', sources: ['any_module.derived.envelope_volume_m3', 'any_module.derived.cabinet_volume_m3'] },
      ],
    },
  ],
}

const BESS_SCHEMA: PerformanceCardSchema = {
  product_class: 'bess',
  sections: [
    {
      name: 'Capacity',
      metrics: [
        { id: 'nameplate_kwh', label: 'Nameplate energy', unit: 'kWh', sources: ['any_module.derived.capacity_kwh', 'any_module.derived.capacity_kwh_total', 'any_module.derived.capacity_kwh_nameplate'], brief_path: 'parsedBrief.constraints.target_performance.value' },
        { id: 'usable_kwh', label: 'Usable energy', unit: 'kWh', sources: ['any_module.derived.usable_kwh', 'any_module.derived.usable_capacity_kwh'] },
        { id: 'dod_fraction', label: 'Depth of discharge', unit: '', sources: ['any_module.derived.dod_fraction', 'any_module.derived.dod_max'], reasonable_range: [0.7, 0.95] },
        { id: 'round_trip_eff', label: 'Round-trip efficiency', unit: '%', sources: ['any_module.derived.round_trip_efficiency_percent', 'any_module.derived.efficiency_percent'], reasonable_range: [85, 95] },
      ],
    },
    {
      name: 'Cell topology',
      metrics: [
        { id: 'cell_count', label: 'Cell count', unit: '', sources: ['any_module.derived.cell_count'] },
        { id: 'cell_capacity_ah', label: 'Cell capacity', unit: 'Ah', sources: ['any_module.derived.cell_capacity_ah', 'any_module.derived.cell_ah'] },
        { id: 'cell_voltage_v', label: 'Cell nominal voltage', unit: 'V', sources: ['any_module.derived.cell_voltage_v', 'any_module.derived.cell_voltage_nominal_v'] },
        { id: 'cell_chemistry', label: 'Cell chemistry', unit: '', sources: ['any_module.derived.cell_chemistry'], format: 'string' },
        { id: 'module_count', label: 'Module count', unit: '', sources: ['any_module.derived.module_count', 'any_module.derived.modules_count'] },
        { id: 'rack_count', label: 'Rack count', unit: '', sources: ['any_module.derived.rack_count'] },
      ],
    },
    {
      name: 'Power',
      metrics: [
        { id: 'rated_power_kw', label: 'Rated power', unit: 'kW', sources: ['any_module.derived.continuous_power_kw', 'any_module.derived.rated_power_kw'] },
        { id: 'peak_power_kw', label: 'Peak power', unit: 'kW', sources: ['any_module.derived.peak_power_kw'] },
        { id: 'c_rate', label: 'C-rate', unit: 'C', sources: ['any_module.derived.c_rate'], reasonable_range: [0.25, 2.0] },
        { id: 'dc_bus_voltage_v', label: 'DC bus voltage', unit: 'V', sources: ['any_module.derived.dc_bus_voltage_v', 'any_module.derived.dc_bus_voltage_nominal_v', 'any_module.derived.nominal_voltage_v'] },
      ],
    },
    {
      name: 'Thermal',
      metrics: [
        { id: 'cooling_capacity_kw', label: 'Cooling capacity', unit: 'kW', sources: ['any_module.derived.cooling_capacity_kw', 'any_module.derived.max_heat_rejection_kw'] },
        { id: 'refrigerant', label: 'Refrigerant', unit: '', sources: ['any_module.derived.refrigerant'], format: 'string' },
        { id: 'max_ambient_c', label: 'Max ambient', unit: '°C', sources: ['any_module.derived.max_ambient_c'] },
      ],
    },
    {
      name: 'Envelope',
      metrics: [
        { id: 'container_type', label: 'Container type', unit: '', sources: ['any_module.derived.container_type', 'any_module.derived.primary_container_type'], format: 'string' },
        { id: 'envelope_volume_m3', label: 'Envelope volume', unit: 'm³', sources: ['any_module.derived.envelope_volume_m3'] },
      ],
    },
  ],
}

const HEAT_PUMP_SCHEMA: PerformanceCardSchema = {
  product_class: 'heatpump',
  sections: [
    {
      name: 'Thermal performance',
      metrics: [
        { id: 'rated_thermal_kw', label: 'Rated thermal output', unit: 'kW', sources: ['any_module.derived.rated_thermal_kw', 'any_module.derived.heat_output_kw', 'any_module.derived.thermal_capacity_kw'], brief_path: 'parsedBrief.constraints.target_performance.value', reasonable_range: [3, 50] },
        { id: 'cop', label: 'COP (rated)', unit: '', sources: ['any_module.derived.cop_target', 'any_module.derived.cop', 'any_module.derived.cop_rated'], reasonable_range: [2.5, 5.0] },
        { id: 'scop', label: 'SCOP (seasonal)', unit: '', sources: ['any_module.derived.scop', 'any_module.derived.seasonal_cop'], reasonable_range: [3.0, 5.5] },
        { id: 'rated_electrical_kw', label: 'Rated electrical input', unit: 'kW', sources: ['any_module.derived.rated_electrical_kw', 'any_module.derived.compressor_power_kw'] },
      ],
    },
    {
      name: 'Refrigerant',
      metrics: [
        { id: 'refrigerant', label: 'Refrigerant', unit: '', sources: ['any_module.derived.refrigerant'], format: 'string' },
        { id: 'refrigerant_charge_kg', label: 'Refrigerant charge', unit: 'kg', sources: ['any_module.derived.refrigerant_charge_kg'] },
      ],
    },
    {
      name: 'Acoustic',
      metrics: [
        { id: 'sound_power_dba', label: 'Sound power level', unit: 'dB(A)', sources: ['any_module.derived.sound_power_dba', 'any_module.derived.acoustic_limit_dba'], reasonable_range: [35, 70] },
      ],
    },
    {
      name: 'Electrical',
      metrics: [
        { id: 'supply_voltage_v', label: 'Supply voltage', unit: 'V AC', sources: ['any_module.derived.supply_voltage_v'] },
        { id: 'supply_phase', label: 'Supply phases', unit: '', sources: ['any_module.derived.supply_phase', 'any_module.derived.phases'], format: 'string' },
      ],
    },
  ],
}

const GENERIC_SCHEMA: PerformanceCardSchema = {
  product_class: 'generic',
  sections: [
    {
      name: 'Brief targets',
      metrics: [
        { id: 'target_performance', label: 'Performance target', unit: '', sources: ['parsedBrief.constraints.target_performance.value'], format: 'string' },
        { id: 'unit_cost_ceiling', label: 'Unit cost ceiling', unit: 'GBP', sources: ['parsedBrief.constraints.unit_cost_ceiling.value'] },
        { id: 'max_mass_kg', label: 'Mass ceiling', unit: 'kg', sources: ['parsedBrief.constraints.max_mass_kg.value'] },
      ],
    },
  ],
}

export const PERFORMANCE_CARDS: Record<string, PerformanceCardSchema> = {
  'vertical-farm': VERTICAL_FARM_SCHEMA,
  vertical_farm: VERTICAL_FARM_SCHEMA,
  bess: BESS_SCHEMA,
  heatpump: HEAT_PUMP_SCHEMA,
  heat_pump: HEAT_PUMP_SCHEMA,
  generic: GENERIC_SCHEMA,
}

// ─── builder ────────────────────────────────────────────────────────────────

function normaliseClassSlug(raw: string): string {
  const lower = String(raw ?? '').toLowerCase()
  // Reuse classToSlug-style heuristics; keep in sync with renderer's classToSlug.
  if (lower.includes('bess') || lower.includes('battery energy storage')) return 'bess'
  if (lower.includes('vertical farm') || lower.includes('vertical_farm')) return 'vertical-farm'
  if (lower.includes('heat pump') || lower.includes('heat_pump') || lower.includes('heatpump') || lower.includes('thermal system')) return 'heatpump'
  return lower.replace(/[_ ]/g, '-')
}

export function buildPerformanceCard(state: any): PerformanceCard {
  const productClass =
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    'generic'
  const slug = normaliseClassSlug(productClass)
  const schema = PERFORMANCE_CARDS[slug] ?? PERFORMANCE_CARDS.generic

  const resolved: Record<string, ResolvedMetric> = {}
  const sections: PerformanceCard['sections'] = []
  const warnings: PerformanceCard['warnings'] = []

  for (const section of schema.sections) {
    const rows: ResolvedMetric[] = []
    for (const m of section.metrics) {
      let raw: any = null
      let source: string | null = null
      for (const path of m.sources) {
        const v = getByPath(state, path)
        if (v !== null && v !== undefined) {
          raw = v
          source = path
          break
        }
      }
      // Compute fallback
      if (raw === null && m.compute) {
        try {
          const v = m.compute(state, resolved)
          if (v !== null && v !== undefined) { raw = v; source = 'computed' }
        } catch {}
      }
      // Brief target
      const brief = m.brief_path ? getByPath(state, m.brief_path) : null
      // Status
      let status: PerformanceStatus = raw === null ? 'missing' : (source === 'computed' ? 'computed' : 'ok')
      if (raw !== null && m.reasonable_range) {
        const n = num(raw)
        if (n !== null && (n < m.reasonable_range[0] || n > m.reasonable_range[1])) status = 'out_of_range'
      }
      if (raw !== null && brief !== null) {
        const { isDelta } = compareToBrief(raw, brief)
        if (isDelta) status = 'delta'
      }
      // Note
      let note: string | null = null
      if (raw !== null && m.note) {
        try { note = m.note(raw, state) ?? null } catch {}
      }

      const row: ResolvedMetric = {
        id: m.id,
        section: section.name,
        label: m.label,
        unit: m.unit,
        value: raw !== null ? (fmt(raw, m.unit, m.format) as string | number | null) : null,
        source,
        brief_target: brief !== null ? (fmt(brief, m.unit, m.format) as string | number | null) : null,
        status,
        note,
      }
      resolved[m.id] = row
      rows.push(row)

      // Sprint 2C (Tristan 2026-05-20): also surface metrics that have
      // an inline NOTE even when status stays 'ok' or 'computed'. Inline
      // notes are produced by metric.note(raw, state) callbacks that
      // catch domain-specific issues (e.g. "LED installed power 0.9 kW
      // — Low for leafy greens, typical 0.20-0.30 kW/m²"). Previously
      // these only surfaced inline next to the row — now they also
      // bubble to the headline warnings strip so the reader can see at
      // a glance which metrics need attention. Universal across product
      // classes — every metric.note() callback already classifies
      // domain-typical ranges per class.
      if (note || ((status === 'delta' || status === 'out_of_range') && brief !== null)) {
        warnings.push({ id: m.id, section: section.name, label: m.label, status, note: note ?? `target ${brief}` })
      }
    }
    sections.push({ name: section.name, metrics: rows })
  }

  return {
    product_class: slug,
    sections,
    warnings,
  }
}
