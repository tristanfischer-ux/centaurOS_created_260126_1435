// INTENT: Per-product-class safety requirement registry.  The engine
// checks whether the BOM and module descriptions address each class's
// mandatory safety standards.  Gaps surface as warnings in the PDF so
// founders can address them before investor presentation.

export interface SafetyRequirement {
  id: string
  name: string
  standard: string
  description: string
  searchTerms: string[]
}

interface SafetyCheckResult {
  productClass: string
  total: number
  addressed: number
  gaps: SafetyRequirement[]
  coveragePercent: number
}

export const SAFETY_REGISTRY: Record<string, SafetyRequirement[]> = {
  energy_storage: [
    { id: 'ess-01', name: 'Thermal Runaway Propagation', standard: 'UL 9540A', description: 'System-level thermal runaway test', searchTerms: ['thermal runaway', 'fire suppression', 'fire detection'] },
    { id: 'ess-02', name: 'Grid Connection Protection', standard: 'G99', description: 'UK grid connection protection relay', searchTerms: ['g99', 'protection relay', 'grid protection'] },
    { id: 'ess-03', name: 'Cell-Level Safety', standard: 'IEC 62619', description: 'Cell safety for lithium batteries', searchTerms: ['iec 62619', 'cell safety'] },
    { id: 'ess-04', name: 'Overcurrent Protection', standard: 'IEC 62477', description: 'DC overcurrent and short circuit', searchTerms: ['fuse', 'circuit breaker', 'overcurrent'] },
  ],
  thermal_system: [
    { id: 'hp-01', name: 'Refrigerant Safety', standard: 'BS EN 378', description: 'Flammable refrigerant handling', searchTerms: ['en 378', 'refrigerant safety', 'leak detection'] },
    { id: 'hp-02', name: 'Electrical Safety', standard: 'IEC 60335', description: 'Household appliance safety', searchTerms: ['iec 60335', 'electrical safety'] },
    { id: 'hp-03', name: 'Pressure Equipment', standard: 'PED 2014/68/EU', description: 'Pressure vessel compliance', searchTerms: ['pressure vessel', 'ped', 'pressure equipment'] },
  ],
  drone: [
    { id: 'drone-01', name: 'Remote ID', standard: 'ASTM F3322', description: 'Remote identification broadcast', searchTerms: ['remote id', 'broadcast module'] },
    { id: 'drone-02', name: 'Battery Transport', standard: 'UN 38.3', description: 'Lithium battery transport tests', searchTerms: ['un 38.3', 'transport test'] },
    { id: 'drone-03', name: 'Operational Category', standard: 'CAA CAP 722', description: 'UK drone operating requirements', searchTerms: ['cap 722', 'caa', 'operating category'] },
  ],
  auv: [
    { id: 'auv-01', name: 'Maritime Classification', standard: 'DNV-RU-NAVAL', description: 'Autonomous vessel classification', searchTerms: ['dnv', 'classification', 'maritime'] },
    { id: 'auv-02', name: 'Emergency Surfacing', standard: 'IMO MSC.1/Circ.1638', description: 'Emergency recovery capability', searchTerms: ['emergency', 'drop weight', 'recovery', 'beacon'] },
    { id: 'auv-03', name: 'Pressure Housing', standard: 'IP68', description: 'Electronics pressure housing integrity', searchTerms: ['ip68', 'pressure housing', 'titanium'] },
  ],
  ev_charger: [
    { id: 'ev-01', name: 'Grid Connection', standard: 'G99 Issue 6', description: 'UK grid protection', searchTerms: ['g99', 'protection relay'] },
    { id: 'ev-02', name: 'Charging Protocol', standard: 'IEC 61851', description: 'EV conductive charging', searchTerms: ['iec 61851', 'ccs', 'charging protocol'] },
    { id: 'ev-03', name: 'Enclosure Protection', standard: 'IP54', description: 'Outdoor weather protection', searchTerms: ['ip54', 'ip65', 'weatherproof'] },
  ],
  haps: [
    { id: 'haps-01', name: 'Airworthiness', standard: 'EASA SC-HAPS', description: 'Special condition certification', searchTerms: ['easa', 'sc-haps', 'airworthiness'] },
    { id: 'haps-02', name: 'Battery Transport', standard: 'UN 38.3 + IATA DGR', description: 'Lithium battery air transport', searchTerms: ['un 38.3', 'iata', 'dgr'] },
  ],
  bioreactor: [
    { id: 'bio-01', name: 'Sterilisation Validation', standard: 'SIP/Autoclave', description: 'Sterilisation-in-place validation', searchTerms: ['sterilis', 'sip', 'autoclave'] },
    { id: 'bio-02', name: 'Biocompatibility', standard: 'ISO 10993', description: 'Cell culture contact materials', searchTerms: ['iso 10993', 'biocompatibility'] },
  ],
  wearable_medical: [
    { id: 'med-01', name: 'MDR Classification', standard: 'EU 2017/745', description: 'Medical device regulation', searchTerms: ['mdr', '2017/745', 'medical device regulation'] },
    { id: 'med-02', name: 'Biocompatibility', standard: 'ISO 10993', description: 'Skin contact biocompatibility', searchTerms: ['iso 10993', 'biocompatibility', 'skin contact'] },
    { id: 'med-03', name: 'Electrical Safety', standard: 'IEC 60601-1', description: 'Medical electrical equipment', searchTerms: ['iec 60601', 'electrical safety'] },
  ],
}

/**
 * Check whether BOM and module text address the safety requirements
 * for a given product class.
 *
 * For each requirement, any match of its `searchTerms` (case-insensitive)
 * in the concatenated bomText + moduleText counts as "addressed".
 *
 * Returns 100% coverage for unknown product classes (no requirements
 * to check) and 0% when text is empty but requirements exist.
 */
export function checkSafetyRequirements(
  productClass: string,
  bomText: string,
  moduleText: string,
): SafetyCheckResult {
  const requirements = SAFETY_REGISTRY[productClass]

  if (!requirements || requirements.length === 0) {
    return { productClass, total: 0, addressed: 0, gaps: [], coveragePercent: 100 }
  }

  const combined = (bomText + ' ' + moduleText).toLowerCase()
  const gaps: SafetyRequirement[] = []

  for (const req of requirements) {
    const matched = req.searchTerms.some(term => combined.includes(term.toLowerCase()))
    if (!matched) {
      gaps.push(req)
    }
  }

  const addressed = requirements.length - gaps.length
  const coveragePercent = Math.round((addressed / requirements.length) * 100)

  return { productClass, total: requirements.length, addressed, gaps, coveragePercent }
}
