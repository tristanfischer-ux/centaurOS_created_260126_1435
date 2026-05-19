/**
 * @file class-floors.ts — Per-product-class physical floors registry.
 *
 * Principle 3 (Tristan directive 2026-05-15): physical floors are DATA, not
 * code. Adding a new product class = adding a new entry here, not editing
 * prompts. The plausibility critic + headline deriver both read from this
 * registry programmatically.
 *
 * Each floor entry is annotated with:
 *   - value: the numeric floor
 *   - unit: SI-ish or industry-standard string
 *   - source: how the floor was derived (cell datasheet, market report, etc.)
 *   - confidence: 'verified' (multiple-source) | 'industry' (single-industry-source) | 'estimate' (back-of-envelope)
 *
 * A floor represents a HARD physical/economic boundary — current state-of-the-art
 * cannot push below it. Briefs requesting performance beyond a floor (claimed
 * brief value × ratio > 2× the floor) are physically impossible.
 */

export interface PhysicalFloor {
  value: number
  unit: string
  source: string
  confidence: 'verified' | 'industry' | 'estimate'
}

export interface ClassFloors {
  /** Stable product-class id matching `product-classifier.ts` output. */
  product_class: string
  /** Human label for the class (used in critic prompts). */
  display_name: string
  /** Floor entries, keyed by short slug. Slugs are class-meaningful, not standardised. */
  floors: Record<string, PhysicalFloor>
  /** One-sentence summary of the class's primary feasibility axis (for critic context). */
  feasibility_summary: string
}

// ─── Per-class floor data ──────────────────────────────────────────────────

const ENERGY_STORAGE: ClassFloors = {
  product_class: 'energy_storage',
  display_name: 'Battery Energy Storage System (BESS)',
  feasibility_summary: 'Cells dominate mass, volume and capex. Top LFP cells hit ~200 Wh/kg and ~300 Wh/L; system-level pack density drops to ~150 Wh/L after structure + cooling. Installed cost floor at scale is ~£80/kWh; below £60/kWh is implausible without subsidies.',
  floors: {
    cell_specific_energy_min_wh_per_kg:    { value: 200, unit: 'Wh/kg',    source: 'CATL EnerC / BYD blade datasheets 2025',                 confidence: 'verified' },
    pack_volumetric_density_min_wh_per_l:  { value: 150, unit: 'Wh/L',     source: 'industry pack-level surveys (BloombergNEF 2025)',        confidence: 'industry' },
    installed_cost_min_gbp_per_kwh:        { value: 80,  unit: '£/kWh',    source: 'utility BESS price tracking (Q1 2026 UK)',                confidence: 'industry' },
    installed_cost_stretch_gbp_per_kwh:    { value: 60,  unit: '£/kWh',    source: 'aspirational integrated-pack pricing (2027)',             confidence: 'estimate' },
    cell_round_trip_efficiency_max:        { value: 0.96, unit: 'ratio',   source: 'top-tier LFP at 0.5C',                                    confidence: 'verified' },
    system_round_trip_efficiency_max:      { value: 0.92, unit: 'ratio',   source: 'top BESS systems including PCS + thermal losses',         confidence: 'industry' },
    cycle_life_at_80pct_dod_max:           { value: 8000, unit: 'cycles',  source: 'top LFP cells with thermal management',                   confidence: 'industry' },
  },
}

const HEATPUMP: ClassFloors = {
  product_class: 'thermal_system',
  display_name: 'Heat Pump',
  feasibility_summary: 'COP is bounded by Carnot efficiency × refrigerant cycle effectiveness. Air-source units cap at SCOP ~5 in mild climates; ground-source can reach 6. Capex scales linearly with heating capacity; £400/kW is the floor for residential systems.',
  floors: {
    scop_max_air_source:           { value: 5.0,  unit: 'SCOP',          source: 'top air-source units in mild climates (MCS database)',  confidence: 'verified' },
    scop_max_ground_source:        { value: 6.0,  unit: 'SCOP',          source: 'top ground-source units',                              confidence: 'industry' },
    refrigerant_charge_min_kg_per_kw: { value: 0.3, unit: 'kg/kW',       source: 'R290/R32 systems',                                     confidence: 'industry' },
    refrigerant_charge_max_kg_per_kw: { value: 0.6, unit: 'kg/kW',       source: 'R290/R32 systems',                                     confidence: 'industry' },
    installed_cost_min_gbp_per_kw_residential: { value: 400, unit: '£/kW', source: 'UK residential air-source 2026 quotes',               confidence: 'industry' },
    installed_cost_min_gbp_per_kw_commercial:  { value: 250, unit: '£/kW', source: 'commercial heat pump at scale',                       confidence: 'industry' },
  },
}

const VERTICAL_FARM: ClassFloors = {
  product_class: 'vertical_farm',
  display_name: 'Vertical Farm',
  feasibility_summary: 'Yield is bounded by LED PPFD × photoperiod × CO2 × water/nutrient delivery. High-end systems hit 50 kg leafy greens per m² per year. LED power density 200-400 W/m² canopy is typical.',
  floors: {
    yield_max_kg_per_m2_per_year:    { value: 50,  unit: 'kg/m²/yr',  source: 'top commercial vertical farms (Plenty / 80 Acres)', confidence: 'industry' },
    led_power_min_w_per_m2_canopy:   { value: 200, unit: 'W/m²',      source: 'horticultural LED specs',                          confidence: 'industry' },
    led_power_max_w_per_m2_canopy:   { value: 400, unit: 'W/m²',      source: 'high-DLI crops',                                   confidence: 'industry' },
    water_min_l_per_kg_yield:        { value: 10,  unit: 'L/kg',      source: 'closed-loop systems with condensate recovery',     confidence: 'industry' },
    installed_cost_min_gbp_per_m2:   { value: 1500, unit: '£/m²',     source: 'turnkey containerised farms 2026',                 confidence: 'industry' },
  },
}

const EV_CHARGER: ClassFloors = {
  product_class: 'ev_charger',
  display_name: 'EV Charger',
  feasibility_summary: 'Cost scales with power and topology. AC chargers floor at ~£400/kW; DC fast (50-150 kW) ~£800/kW; ultra-fast (>150 kW) ~£1500/kW including transformer + grid upgrade.',
  floors: {
    installed_cost_min_gbp_per_kw_ac:         { value: 400,  unit: '£/kW', source: 'OZEV-eligible AC chargepoint pricing 2026', confidence: 'industry' },
    installed_cost_min_gbp_per_kw_dc_fast:    { value: 800,  unit: '£/kW', source: 'CCS2 50-150 kW DC fast chargers',           confidence: 'industry' },
    installed_cost_min_gbp_per_kw_ultra_fast: { value: 1500, unit: '£/kW', source: 'CCS2 350 kW liquid-cooled cable systems',   confidence: 'industry' },
    efficiency_min_ac_to_dc:                  { value: 0.94, unit: 'ratio', source: 'wide-bandgap-SiC chargers',                  confidence: 'industry' },
  },
}

const CGM: ClassFloors = {
  product_class: 'wearable_medical',
  display_name: 'Continuous Glucose Monitor',
  feasibility_summary: 'Enzymatic sensor lifetime is 14 days max for non-implantable; implantable hits ~180 days. Disposable sensor BoM cost floor £30; transmitter (electronics + radio) £200.',
  floors: {
    sensor_lifetime_max_days_enzymatic:    { value: 14,  unit: 'days', source: 'Dexcom G7 / Abbott Libre 3 datasheets',         confidence: 'verified' },
    sensor_lifetime_max_days_implantable:  { value: 180, unit: 'days', source: 'Eversense XL',                                  confidence: 'verified' },
    sensor_cost_min_gbp_disposable:        { value: 30,  unit: '£',    source: 'CGM consumable BoM at scale',                   confidence: 'estimate' },
    transmitter_cost_min_gbp:              { value: 200, unit: '£',    source: 'reusable transmitter electronics + BLE',        confidence: 'estimate' },
    measurement_accuracy_mard_max_pct:     { value: 8,   unit: '% MARD', source: 'best-in-class MARD vs YSI reference 2025',    confidence: 'industry' },
  },
}

const DRONE: ClassFloors = {
  product_class: 'drone',
  display_name: 'Drone / UAV',
  feasibility_summary: 'Lift-to-weight = thrust × propulsion efficiency. Prosumer multirotors fly ~30 min at 0.5-1 kg payload; commercial mapping drones 60-90 min with rapid swaps. Cost from £500 prosumer to £5K commercial.',
  floors: {
    flight_time_max_min_prosumer:          { value: 45,  unit: 'min',    source: 'DJI Mavic / Air series 2025',                  confidence: 'verified' },
    payload_capacity_max_kg_prosumer:      { value: 1.5, unit: 'kg',     source: 'prosumer multirotor specs',                   confidence: 'verified' },
    energy_density_min_wh_per_kg_lipo:     { value: 250, unit: 'Wh/kg',  source: 'high-rate LiPo packs',                        confidence: 'industry' },
    bom_cost_min_gbp_prosumer:             { value: 500, unit: '£',      source: 'prosumer BoM at volume',                      confidence: 'industry' },
    bom_cost_min_gbp_commercial:           { value: 3000, unit: '£',     source: 'commercial mapping/inspection drones',        confidence: 'industry' },
  },
}

const EDGE_AI: ClassFloors = {
  product_class: 'edge_ai_server',
  display_name: 'Edge AI Server',
  feasibility_summary: 'Power per unit FLOPS is bounded by current silicon (Hopper / Blackwell / Ampere) × cooling. Edge boxes use thermally-limited GPU SKUs. Cost ~£10K-£40K per box at typical performance tiers.',
  floors: {
    tflops_per_watt_max:                   { value: 50,   unit: 'TFLOPS/W', source: 'NVIDIA Jetson Orin AGX 2025',                confidence: 'verified' },
    power_max_w_passive_cooled:            { value: 40,   unit: 'W',        source: 'passive heatsink envelope in IP65 box',     confidence: 'industry' },
    power_max_w_active_cooled:             { value: 400,  unit: 'W',        source: 'fanned edge box',                           confidence: 'industry' },
    bom_cost_min_gbp_consumer:             { value: 800,  unit: '£',        source: 'Jetson Orin Nano dev kit',                  confidence: 'verified' },
    bom_cost_min_gbp_industrial:           { value: 8000, unit: '£',        source: 'Jetson AGX Orin industrial enclosure',      confidence: 'industry' },
  },
}

const BIOREACTOR: ClassFloors = {
  product_class: 'bioreactor',
  display_name: 'Bioreactor',
  feasibility_summary: 'Oxygen mass transfer and mixing power scale with volume. Working volume 1L-2000L for benchtop to pilot; 316L stainless cost ~£2,000/L working volume for single-use, £400/L for multi-use.',
  floors: {
    oxygen_transfer_rate_max_per_hour:     { value: 200,  unit: '/h',       source: 'high-cell-density mammalian + microbial pilot bioreactors', confidence: 'industry' },
    capex_min_gbp_per_l_working_volume:    { value: 400,  unit: '£/L',      source: 'multi-use stainless bioreactor pricing 2026',          confidence: 'industry' },
    capex_min_gbp_per_l_single_use:        { value: 2000, unit: '£/L',      source: 'single-use bag bioreactor + skids',                    confidence: 'industry' },
    sterility_assurance_level:             { value: 1e-6, unit: 'SAL',      source: 'pharma cGMP standard',                                 confidence: 'verified' },
  },
}

const AUV: ClassFloors = {
  product_class: 'auv',
  display_name: 'Autonomous Underwater Vehicle',
  feasibility_summary: 'Dive depth × pressure-vessel design = thickness × material density × mass. Energy density limits endurance; LFP at 200 Wh/kg gives ~24h at 0.5 kW propulsion. Cost scales steeply with depth rating.',
  floors: {
    pressure_vessel_thickness_min_mm_per_100m: { value: 1.5, unit: 'mm/100m', source: 'aluminium 6061 hull at 1.5 safety factor',           confidence: 'industry' },
    propulsion_power_min_w_per_knot:       { value: 80,   unit: 'W/knot',     source: 'streamlined torpedo-shape hull at 5 knots',          confidence: 'industry' },
    bom_cost_min_gbp_coastal:              { value: 30000, unit: '£',          source: 'compact coastal AUV (Bluefin SandShark class)',     confidence: 'industry' },
    bom_cost_min_gbp_deep_water:           { value: 500000, unit: '£',         source: 'work-class AUV (Bluefin-21 class)',                 confidence: 'industry' },
  },
}

const HAPS: ClassFloors = {
  product_class: 'haps',
  display_name: 'High-Altitude Platform Station (HAPS)',
  feasibility_summary: 'Solar irradiance × array area × battery storage = endurance. Stratospheric flight (~20 km) requires energy-positive solar at all sun angles; mass budget < 250 kg total for the platform. Cost ~£5-50M per platform.',
  floors: {
    solar_panel_efficiency_min:            { value: 0.22, unit: 'ratio',   source: 'IBC silicon arrays in airborne form factor',       confidence: 'industry' },
    structural_mass_max_kg:                { value: 250,  unit: 'kg',      source: 'Airbus Zephyr / BAE PHASA-35 class',               confidence: 'verified' },
    flight_endurance_max_days_solar:       { value: 60,   unit: 'days',    source: 'Zephyr S record flight 2018; Phasa-35 program',    confidence: 'verified' },
    bom_cost_min_gbp_platform:             { value: 5000000, unit: '£',    source: 'HAPS platform ex-payload pricing',                 confidence: 'estimate' },
  },
}

// ─── Registry ──────────────────────────────────────────────────────────────

export const CLASS_FLOORS: Record<string, ClassFloors> = {
  energy_storage: ENERGY_STORAGE,
  thermal_system:       HEATPUMP,
  vertical_farm:  VERTICAL_FARM,
  ev_charger:     EV_CHARGER,
  wearable_medical:            CGM,
  drone:          DRONE,
  edge_ai_server:        EDGE_AI,
  bioreactor:     BIOREACTOR,
  auv:            AUV,
  haps:           HAPS,
}

/**
 * Look up floors for a product class. Returns null when no entry exists —
 * the plausibility critic should fail-open (return possible=true, low confidence)
 * in that case rather than rejecting briefs we have no data for.
 */
export function getClassFloors(productClass: string): ClassFloors | null {
  return CLASS_FLOORS[productClass] ?? null
}

/**
 * Format floors as a compact bullet list for the plausibility critic's user
 * prompt. Returns empty string when no floors are available for the class.
 */
export function formatFloorsForPrompt(productClass: string): string {
  const cls = getClassFloors(productClass)
  if (!cls) return ''
  const lines: string[] = []
  lines.push(`PHYSICAL FLOORS for ${cls.display_name} (${productClass}):`)
  lines.push(`Summary: ${cls.feasibility_summary}`)
  lines.push('')
  for (const [slug, f] of Object.entries(cls.floors)) {
    lines.push(`  - ${slug}: ${f.value} ${f.unit}  (${f.confidence}; ${f.source})`)
  }
  return lines.join('\n')
}
