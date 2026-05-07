export interface RequiredPart {
  name: string
  category: 'safety' | 'regulatory' | 'structural' | 'thermal' | 'electrical'
  reason: string // why this part is required
  typicalProcess: string // e.g. 'COTS', 'custom fabrication', 'injection moulding'
  searchTerms: string[] // keywords to match against existing BOM part names
}

export const REQUIRED_PARTS: Record<string, RequiredPart[]> = {
  energy_storage: [
    { name: 'Battery Management System (BMS)', category: 'safety', reason: 'Cell balancing, overcurrent protection, thermal monitoring', typicalProcess: 'COTS', searchTerms: ['bms', 'battery management', 'cell balancer'] },
    { name: 'Fire Detection and Suppression', category: 'safety', reason: 'UL 9540A thermal runaway propagation test requirement', typicalProcess: 'COTS', searchTerms: ['fire', 'suppression', 'detection', 'smoke', 'thermal runaway'] },
    { name: 'DC Busbars and Fusing', category: 'electrical', reason: 'High-current DC distribution with overcurrent protection', typicalProcess: 'custom fabrication', searchTerms: ['busbar', 'fuse', 'dc disconnect'] },
    { name: 'Expansion Tank', category: 'thermal', reason: 'Thermal expansion of cooling fluid in liquid-cooled systems', typicalProcess: 'COTS', searchTerms: ['expansion tank', 'expansion vessel', 'header tank'] },
    { name: 'Pressure Relief Valve (PRV)', category: 'safety', reason: 'Overpressure protection for sealed enclosures and cooling circuits', typicalProcess: 'COTS', searchTerms: ['pressure relief', 'prv', 'safety valve', 'burst disc'] },
    { name: 'Thermal Insulation', category: 'thermal', reason: 'PIR or mineral wool for thermal management and fire resistance', typicalProcess: 'COTS', searchTerms: ['insulation', 'pir', 'mineral wool', 'thermal barrier'] },
    { name: 'Liquid Cooling Loop', category: 'thermal', reason: 'Heat rejection for high-power battery systems', typicalProcess: 'COTS', searchTerms: ['cooling', 'chiller', 'heat exchanger', 'pump', 'coolant'] },
    { name: 'EMS (Energy Management System)', category: 'electrical', reason: 'Charge/discharge scheduling, grid interaction, monitoring', typicalProcess: 'COTS', searchTerms: ['ems', 'energy management', 'controller', 'monitoring'] },
  ],
  thermal_system: [
    { name: 'Expansion Vessel', category: 'thermal', reason: 'Thermal expansion of refrigerant/heating circuit', typicalProcess: 'COTS', searchTerms: ['expansion vessel', 'expansion tank'] },
    { name: 'Pressure Relief Valve', category: 'safety', reason: 'Overpressure protection per BS EN 378', typicalProcess: 'COTS', searchTerms: ['pressure relief', 'prv', 'safety valve'] },
    { name: 'Check Valve / Non-Return Valve', category: 'safety', reason: 'Prevent reverse flow in refrigerant circuit', typicalProcess: 'COTS', searchTerms: ['check valve', 'non-return', 'nr'] },
    { name: 'Vibration Isolators', category: 'structural', reason: 'Reduce compressor vibration transmission', typicalProcess: 'COTS', searchTerms: ['vibration', 'isolator', 'mount', 'anti-vibration'] },
    { name: 'Acoustic Enclosure / Silencer', category: 'regulatory', reason: 'Meet acoustic target dBA', typicalProcess: 'custom fabrication', searchTerms: ['acoustic', 'silencer', 'enclosure', 'sound'] },
  ],
  drone: [
    { name: 'Propeller Guards', category: 'safety', reason: 'CAA CAP 722 safety requirement for over-people operation', typicalProcess: 'injection moulding', searchTerms: ['propeller guard', 'prop guard', 'blade guard'] },
    { name: 'Emergency Parachute', category: 'safety', reason: 'C0/C1 class identification requirement for over-people', typicalProcess: 'COTS', searchTerms: ['parachute', 'recovery system', 'emergency'] },
    { name: 'LED Navigation Lights', category: 'regulatory', reason: 'Night flight and orientation identification', typicalProcess: 'COTS', searchTerms: ['led', 'navigation light', 'nav light', 'strobe'] },
    { name: 'LiPo Battery Safety Bag', category: 'safety', reason: 'UN 38.3 transport compliance', typicalProcess: 'COTS', searchTerms: ['lipo bag', 'safety bag', 'fire bag'] },
  ],
  auv: [
    { name: 'Emergency Drop Weight', category: 'safety', reason: 'Emergency surfacing capability', typicalProcess: 'custom fabrication', searchTerms: ['drop weight', 'emergency release', 'ballast release'] },
    { name: 'Leak Detector', category: 'safety', reason: 'Water ingress early warning', typicalProcess: 'COTS', searchTerms: ['leak detector', 'moisture sensor', 'water ingress'] },
    { name: 'Recovery Beacon', category: 'safety', reason: 'Location marking after surfacing', typicalProcess: 'COTS', searchTerms: ['beacon', 'strobe', 'recovery', 'locator'] },
    { name: 'Pressure Relief Valve', category: 'safety', reason: 'Internal pressure equalisation', typicalProcess: 'COTS', searchTerms: ['pressure relief', 'prv', 'equalisation'] },
  ],
  ev_charger: [
    { name: 'G99 Protection Relay', category: 'safety', reason: 'UK grid connection protection per G99 Issue 6', typicalProcess: 'COTS', searchTerms: ['g99', 'protection relay', 'grid protection'] },
    { name: 'Isolation Contactors', category: 'safety', reason: 'Galvanic isolation for maintenance safety', typicalProcess: 'COTS', searchTerms: ['contactor', 'isolation', 'relay', 'disconnect'] },
    { name: 'Residual Current Device (RCD)', category: 'safety', reason: 'Electric shock protection', typicalProcess: 'COTS', searchTerms: ['rcd', 'residual current', 'earth leakage'] },
    { name: 'Surge Protection Device (SPD)', category: 'safety', reason: 'Lightning and transient protection', typicalProcess: 'COTS', searchTerms: ['spd', 'surge', 'lightning protection'] },
    { name: 'Metering', category: 'regulatory', reason: 'Revenue-grade metering for billing', typicalProcess: 'COTS', searchTerms: ['meter', 'metering', 'energy meter'] },
  ],
  haps: [
    { name: 'Solar Array', category: 'electrical', reason: 'Primary power source for stratospheric endurance', typicalProcess: 'custom fabrication', searchTerms: ['solar', 'photovoltaic', 'solar array', 'solar panel'] },
    { name: 'Battery Pack (Li-S or high-energy Li-ion)', category: 'electrical', reason: 'Night-time energy storage, >350 Wh/kg', typicalProcess: 'custom fabrication', searchTerms: ['battery', 'li-s', 'lithium-sulphur', 'energy storage'] },
    { name: 'GPS + IMU Navigation', category: 'electrical', reason: 'Position and attitude determination', typicalProcess: 'COTS', searchTerms: ['gps', 'imu', 'ins', 'navigation'] },
    { name: 'Radiation-Tolerant Electronics', category: 'electrical', reason: 'Stratospheric radiation environment', typicalProcess: 'COTS', searchTerms: ['radiation', 'rad-hard', 'rad-tolerant', 'kintex'] },
  ],
  bioreactor: [
    { name: 'Sterilisation System', category: 'safety', reason: 'SIP (sterilise-in-place) or autoclave compatibility', typicalProcess: 'COTS', searchTerms: ['sterilis', 'sip', 'autoclave', 'steam'] },
    { name: 'pH / DO / Temperature Sensors', category: 'safety', reason: 'Critical process parameters monitoring', typicalProcess: 'COTS', searchTerms: ['ph sensor', 'do sensor', 'dissolved oxygen', 'temperature sensor'] },
    { name: 'Aeration System', category: 'structural', reason: 'Gas sparging for cell culture', typicalProcess: 'COTS', searchTerms: ['aeration', 'sparger', 'gas mixing'] },
  ],
  edge_ai_server: [
    { name: 'BMC / IPMI Module', category: 'electrical', reason: 'Remote management and health monitoring', typicalProcess: 'COTS', searchTerms: ['bmc', 'ipmi', 'management', 'ilo'] },
    { name: 'Redundant PSU', category: 'electrical', reason: 'High-availability power supply', typicalProcess: 'COTS', searchTerms: ['psu', 'power supply', 'redundant'] },
    { name: 'Thermal Solution (Heat Sink + Fan)', category: 'thermal', reason: 'TDP management for compute modules', typicalProcess: 'COTS', searchTerms: ['heat sink', 'heatsink', 'fan', 'thermal', 'cooler'] },
  ],
  wearable_medical: [
    { name: 'Biocompatible Skin Adhesive', category: 'safety', reason: 'ISO 10993 biocompatibility for skin contact', typicalProcess: 'COTS', searchTerms: ['adhesive', 'biocompatible', 'skin', 'patch adhesive'] },
    { name: 'Battery Safety Circuit', category: 'safety', reason: 'Overcharge/discharge protection for on-body device', typicalProcess: 'COTS', searchTerms: ['battery protection', 'protection circuit', 'pcm'] },
  ],
  pcb_assembly: [
    { name: 'ESD Protection Components', category: 'safety', reason: 'Electrostatic discharge protection for handling', typicalProcess: 'COTS', searchTerms: ['esd', 'tvss', 'esd protection'] },
    { name: 'Conformal Coating', category: 'safety', reason: 'Environmental protection for PCB', typicalProcess: 'service', searchTerms: ['conformal coating', 'protective coating'] },
  ],
}

export interface MissingPart {
  name: string
  category: string
  reason: string
  typicalProcess: string
}

export interface ManifestResult {
  productClass: string
  totalRequired: number
  found: number
  missing: MissingPart[]
  coverage: number // 0-100
}

export function checkRequiredParts(
  productClass: string,
  bomParts: Array<{ name: string; partNumber?: string }>
): ManifestResult {
  const requirements = REQUIRED_PARTS[productClass]

  if (!requirements || requirements.length === 0) {
    return {
      productClass,
      totalRequired: 0,
      found: 0,
      missing: [],
      coverage: 100,
    }
  }

  const missing: MissingPart[] = []
  let foundCount = 0

  for (const req of requirements) {
    let isFound = false
    
    for (const part of bomParts) {
      if (!part.name) continue
      
      const partNameLower = part.name.toLowerCase()
      
      // Check if any search term is included in the part name
      for (const term of req.searchTerms) {
        if (partNameLower.includes(term.toLowerCase())) {
          isFound = true
          break
        }
      }
      
      if (isFound) break
    }
    
    if (isFound) {
      foundCount++
    } else {
      missing.push({
        name: req.name,
        category: req.category,
        reason: req.reason,
        typicalProcess: req.typicalProcess,
      })
    }
  }

  return {
    productClass,
    totalRequired: requirements.length,
    found: foundCount,
    missing,
    coverage: Math.round((foundCount / requirements.length) * 100),
  }
}
