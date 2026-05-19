// Hard cost constraints based on engineering reality
export const COST_CONSTRAINTS = {
  // NRE floor: realistic minimum for a commercial 30kW R290 heat pump
  nreFloorGbp: 150000,  // Safety testing, tooling, MCS/UKCA compliance, field trials
  
  // Compressor cost: R290 scroll compressors at 30kW are £1,200-£3,800
  compressorCostRange: { min: 1200, max: 3800 },
  
  // BPHE cost: 316L stainless for 30kW is £1,400-£1,900
  bpheCostRange: { min: 1400, max: 1900 },
  
  // Minimum BOM parts for a 30kW heat pump: 150+ items
  minBomParts: 150,
  
  // Required components that MUST appear in BOM
  requiredComponents: [
    'suction_accumulator',
    'liquid_receiver',
    'filter_drier',
    'sight_glass',
    'service_isolation_valves',
    'schrader_valves',
    'oil_separator',
    'discharge_check_valve',
    'pressure_transducers',
    'discharge_temperature_sensor',
    'vibration_eliminators',
    'copper_tubing',
    'brazing_consumables',
    'refrigerant_charge',
    'nitrogen_purge',
  ],
}

export function validateCosts(costBreakdown: any, bomParts: any[]): string[] {
  const warnings: string[] = []
  
  if (costBreakdown.nreTotalGbp < COST_CONSTRAINTS.nreFloorGbp) {
    warnings.push(`NRE ${costBreakdown.nreTotalGbp} is below realistic floor of ${COST_CONSTRAINTS.nreFloorGbp}. Real NRE for a commercial heat pump includes safety testing, tooling, MCS/UKCA compliance.`)
  }
  
  if (bomParts.length < COST_CONSTRAINTS.minBomParts) {
    warnings.push(`BOM has only ${bomParts.length} parts. A 30kW heat pump requires ${COST_CONSTRAINTS.minBomParts}+ parts including fasteners, tubing, brazing consumables, and safety components.`)
  }
  
  // Check for required components
  const partNames = bomParts.map(p => (p.name || '').toLowerCase())
  for (const required of COST_CONSTRAINTS.requiredComponents) {
    const found = partNames.some(n => n.includes(required.replace(/_/g, ' ')))
    if (!found) {
      warnings.push(`Missing required component: ${required.replace(/_/g, ' ')}`)
    }
  }
  
  return warnings
}
