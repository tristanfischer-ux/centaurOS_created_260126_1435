// R290 (Propane) Safety Constraints
// Based on BS EN 378, IEC 60335-2-40, ATEX Directive 2014/34/EU

export const R290_CONSTRAINTS = {
  // Sensor type: R290 does NOT have strong IR absorption. Must use catalytic pellistor or NDIR.
  leakSensorType: 'catalytic_pellistor',
  
  // Electrical enclosure: NOT ATEX. Use IP54 with physical separation and ventilation.
  electricalEnclosure: 'IP54_with_physical_separation_and_ventilation',
  
  // Acoustic insulation: MUST be closed-cell near R290. Open-cell foam absorbs heavy gas.
  acousticInsulation: 'closed_cell_elastomeric_or_mass_loaded_vinyl',
  
  // Charge limits: R290 is A3 flammable. BS EN 378 charge limits apply.
  maxChargeKg: 5.0,  // Below this = simpler compliance. Above = additional mitigation required.
  
  // Material compatibility: copper-aluminum galvanic corrosion in outdoor/humid environments
  evaporatorMaterialRule: 'If outdoor and humid: tube_material must equal fin_material. Use all-aluminum microchannel or copper-tube/copper-fin.',
  
  // Pressure ratings: R290 operates at different pressures than R410A
  minTestPressureBar: 45,  // All pressure-retaining components must handle this
  
  // Compressor: No single 30kW R290 scroll compressor exists. Need tandem.
  compressorRule: 'R290 volumetric capacity is ~60% of R410A. 30kW requires tandem configuration (2x 15kW units) with oil equalisation.',
  
  // Manufacturing volume: 500 units/year = no custom tooling
  manufacturingRule: 'If annual_volume < 2000: ban custom injection moulding, ban deep-draw stamping. Use COTS fans (Ebm-Papst, Ziehl-Abegg), laser-cut and press-brake frame.',
}

export function validateR290Safety(modules: any[], parts: any[]): string[] {
  const violations: string[] = []
  
  // Check for ATEX in electrical module
  for (const part of parts) {
    const name = (part.name || '').toLowerCase()
    if (name.includes('atex') && part.sourceModuleId?.includes('electrical')) {
      violations.push(`SAFETY: ${part.name} is ATEX-rated. R290 systems need IP54 with physical separation, not ATEX enclosures.`)
    }
    if (name.includes('infrared') && name.includes('sensor')) {
      violations.push(`SAFETY: ${part.name} uses IR sensing. R290 requires catalytic pellistor or NDIR sensors.`)
    }
    if (name.includes('foam') && !name.includes('closed-cell') && !name.includes('elastomeric')) {
      violations.push(`SAFETY: ${part.name} may be open-cell foam. Near R290 compressor, must be closed-cell elastomeric or mass-loaded vinyl.`)
    }
  }
  
  return violations
}
