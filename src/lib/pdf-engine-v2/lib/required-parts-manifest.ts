export interface RequiredPart {
  name: string
  category: 'safety' | 'regulatory' | 'structural' | 'thermal' | 'electrical'
  reason: string // why this part is required
  typicalProcess: string // e.g. 'COTS', 'custom fabrication', 'injection moulding'
  searchTerms: string[] // keywords to match against existing BOM part names
}

export const REQUIRED_PARTS: Record<string, RequiredPart[]> = {
  // B3 FIX (2026-05-09): extended with safety subsystem floor entries for all 10
  // product classes. The manifest is keyed by productClass string from classifyProduct().
  // Both legacy class names (energy_storage) and PA-path class names (bess) are included
  // so checkRequiredParts() works on both pipeline paths.
  energy_storage: [
    { name: 'Battery Management System (BMS)', category: 'safety', reason: 'Cell balancing, overcurrent protection, thermal monitoring', typicalProcess: 'COTS', searchTerms: ['bms', 'battery management', 'cell balancer'] },
    { name: 'Fire Detection and Suppression', category: 'safety', reason: 'UL 9540A thermal runaway propagation test requirement', typicalProcess: 'COTS', searchTerms: ['fire', 'suppression', 'detection', 'smoke', 'thermal runaway'] },
    { name: 'DC Busbars and Fusing', category: 'electrical', reason: 'High-current DC distribution with overcurrent protection', typicalProcess: 'custom fabrication', searchTerms: ['busbar', 'fuse', 'dc disconnect'] },
    { name: 'Expansion Tank', category: 'thermal', reason: 'Thermal expansion of cooling fluid in liquid-cooled systems', typicalProcess: 'COTS', searchTerms: ['expansion tank', 'expansion vessel', 'header tank'] },
    { name: 'Pressure Relief Valve (PRV)', category: 'safety', reason: 'Overpressure protection for sealed enclosures and cooling circuits', typicalProcess: 'COTS', searchTerms: ['pressure relief', 'prv', 'safety valve', 'burst disc'] },
    { name: 'Thermal Insulation', category: 'thermal', reason: 'PIR or mineral wool for thermal management and fire resistance', typicalProcess: 'COTS', searchTerms: ['insulation', 'pir', 'mineral wool', 'thermal barrier'] },
    { name: 'Liquid Cooling Loop', category: 'thermal', reason: 'Heat rejection for high-power battery systems', typicalProcess: 'COTS', searchTerms: ['cooling', 'chiller', 'heat exchanger', 'pump', 'coolant'] },
    { name: 'EMS (Energy Management System)', category: 'electrical', reason: 'Charge/discharge scheduling, grid interaction, monitoring', typicalProcess: 'COTS', searchTerms: ['ems', 'energy management', 'controller', 'monitoring'] },
    // Safety subsystem floors (B3)
    { name: 'BMS Master Controller (Nuvation / Orion)', category: 'safety', reason: 'Minimum floor: £1,500 — cell-level BMS with CAN/Modbus communication', typicalProcess: 'COTS', searchTerms: ['bms master', 'nuvation', 'orion bms', 'bms controller'] },
    { name: 'Fire Suppression Cylinder (Novec/FM-200)', category: 'safety', reason: 'Minimum floor: £800/cylinder — UL 9540A compliant suppression agent', typicalProcess: 'COTS', searchTerms: ['novec', 'fm-200', 'fire cylinder', 'suppression cylinder'] },
    { name: 'Arc Flash Detection Sensor', category: 'safety', reason: 'Minimum floor: £400 — arc flash detection per IEC 62606', typicalProcess: 'COTS', searchTerms: ['arc flash', 'arc detection', 'arc sensor'] },
  ],
  bess: [
    // PA-path class name for BESS — mirrors energy_storage entries
    { name: 'Battery Management System (BMS)', category: 'safety', reason: 'Cell balancing, overcurrent protection, thermal monitoring', typicalProcess: 'COTS', searchTerms: ['bms', 'battery management', 'cell balancer'] },
    { name: 'Fire Detection and Suppression', category: 'safety', reason: 'UL 9540A thermal runaway propagation test requirement', typicalProcess: 'COTS', searchTerms: ['fire', 'suppression', 'detection', 'smoke', 'thermal runaway'] },
    { name: 'High-Voltage Contactor / DC Isolator', category: 'safety', reason: 'Minimum floor: £200 — galvanic isolation for maintenance safety', typicalProcess: 'COTS', searchTerms: ['contactor', 'dc isolator', 'hv isolator', 'disconnect'] },
    { name: 'Arc Flash Detection Sensor', category: 'safety', reason: 'Minimum floor: £400 — arc flash detection per IEC 62606', typicalProcess: 'COTS', searchTerms: ['arc flash', 'arc detection', 'arc sensor'] },
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
    // B3: class-specific safety subsystem floors
    { name: 'Flight Controller (Pixhawk / Cube Orange)', category: 'electrical', reason: 'Minimum floor: £180 — autopilot with redundant IMU', typicalProcess: 'COTS', searchTerms: ['flight controller', 'pixhawk', 'cube orange', 'autopilot', 'fc'] },
    { name: 'ESC (Electronic Speed Controller)', category: 'electrical', reason: 'Motor control — safety interlock required for autonomous flight', typicalProcess: 'COTS', searchTerms: ['esc', 'electronic speed controller', 'motor controller'] },
  ],
  auv: [
    { name: 'Emergency Drop Weight', category: 'safety', reason: 'Emergency surfacing capability', typicalProcess: 'custom fabrication', searchTerms: ['drop weight', 'emergency release', 'ballast release'] },
    { name: 'Leak Detector', category: 'safety', reason: 'Water ingress early warning', typicalProcess: 'COTS', searchTerms: ['leak detector', 'moisture sensor', 'water ingress'] },
    { name: 'Recovery Beacon', category: 'safety', reason: 'Location marking after surfacing', typicalProcess: 'COTS', searchTerms: ['beacon', 'strobe', 'recovery', 'locator'] },
    { name: 'Pressure Relief Valve', category: 'safety', reason: 'Internal pressure equalisation', typicalProcess: 'COTS', searchTerms: ['pressure relief', 'prv', 'equalisation'] },
    // B3: class-specific safety subsystem floors
    { name: 'Pressure Hull Penetrator (Blue Robotics)', category: 'safety', reason: 'Minimum floor: £250/penetrator — rated cable penetration for pressure housing', typicalProcess: 'COTS', searchTerms: ['pressure penetrator', 'hull penetrator', 'blue robotics penetrator', 'cable penetrator'] },
    { name: 'DVL / Acoustic Navigation (Teledyne)', category: 'electrical', reason: 'Doppler velocity log for subsea positioning', typicalProcess: 'COTS', searchTerms: ['dvl', 'doppler', 'acoustic navigation', 'teledyne', 'wayfinder'] },
  ],
  ev_charger: [
    { name: 'G99 Protection Relay', category: 'safety', reason: 'UK grid connection protection per G99 Issue 6', typicalProcess: 'COTS', searchTerms: ['g99', 'protection relay', 'grid protection'] },
    { name: 'Isolation Contactors', category: 'safety', reason: 'Galvanic isolation for maintenance safety', typicalProcess: 'COTS', searchTerms: ['contactor', 'isolation', 'relay', 'disconnect'] },
    { name: 'Residual Current Device (RCD)', category: 'safety', reason: 'Electric shock protection', typicalProcess: 'COTS', searchTerms: ['rcd', 'residual current', 'earth leakage'] },
    { name: 'Surge Protection Device (SPD)', category: 'safety', reason: 'Lightning and transient protection', typicalProcess: 'COTS', searchTerms: ['spd', 'surge', 'lightning protection'] },
    { name: 'Metering', category: 'regulatory', reason: 'Revenue-grade metering for billing', typicalProcess: 'COTS', searchTerms: ['meter', 'metering', 'energy meter'] },
    // B3: class-specific safety subsystem floors
    { name: 'High-Voltage Contactor / DC Isolator', category: 'safety', reason: 'Minimum floor: £200 — galvanic isolation for EV charge port safety', typicalProcess: 'COTS', searchTerms: ['hv contactor', 'dc isolator', 'charge contactor'] },
  ],
  haps: [
    { name: 'Solar Array', category: 'electrical', reason: 'Primary power source for stratospheric endurance', typicalProcess: 'custom fabrication', searchTerms: ['solar', 'photovoltaic', 'solar array', 'solar panel'] },
    { name: 'Battery Pack (Li-S or high-energy Li-ion)', category: 'electrical', reason: 'Night-time energy storage, >350 Wh/kg', typicalProcess: 'custom fabrication', searchTerms: ['battery', 'li-s', 'lithium-sulphur', 'energy storage'] },
    { name: 'GPS + IMU Navigation', category: 'electrical', reason: 'Position and attitude determination', typicalProcess: 'COTS', searchTerms: ['gps', 'imu', 'ins', 'navigation'] },
    { name: 'Radiation-Tolerant Electronics', category: 'electrical', reason: 'Stratospheric radiation environment', typicalProcess: 'COTS', searchTerms: ['radiation', 'rad-hard', 'rad-tolerant', 'kintex'] },
    // B3: class-specific safety subsystem floors
    { name: 'Parachute Recovery System (Airborne Systems)', category: 'safety', reason: 'Minimum floor: £5,000 — HAPS emergency recovery, stratospheric deployment', typicalProcess: 'COTS', searchTerms: ['parachute', 'recovery system', 'recovery chute', 'airborne systems'] },
    { name: 'Flight Termination System (FTS)', category: 'safety', reason: 'Regulatory requirement for HAPS operating in controlled airspace', typicalProcess: 'COTS', searchTerms: ['flight termination', 'fts', 'termination system'] },
  ],
  bioreactor: [
    { name: 'Sterilisation System', category: 'safety', reason: 'SIP (sterilise-in-place) or autoclave compatibility', typicalProcess: 'COTS', searchTerms: ['sterilis', 'sip', 'autoclave', 'steam'] },
    { name: 'pH / DO / Temperature Sensors', category: 'safety', reason: 'Critical process parameters monitoring', typicalProcess: 'COTS', searchTerms: ['ph sensor', 'do sensor', 'dissolved oxygen', 'temperature sensor'] },
    { name: 'Aeration System', category: 'structural', reason: 'Gas sparging for cell culture', typicalProcess: 'COTS', searchTerms: ['aeration', 'sparger', 'gas mixing'] },
    // B3: class-specific safety subsystem floors
    { name: 'Sterility Filter (Millipore / Sartorius)', category: 'safety', reason: 'Minimum floor: £150/filter — 0.2 µm membrane filter for aseptic operation', typicalProcess: 'COTS', searchTerms: ['sterility filter', 'membrane filter', '0.2 micron', 'millipore', 'sartorius'] },
    { name: 'Peristaltic Pump (Watson-Marlow)', category: 'structural', reason: 'Aseptic fluid transfer — sterilisable pump head required', typicalProcess: 'COTS', searchTerms: ['peristaltic pump', 'watson-marlow', 'masterflex', 'pump head'] },
  ],
  edge_ai_server: [
    { name: 'BMC / IPMI Module', category: 'electrical', reason: 'Remote management and health monitoring', typicalProcess: 'COTS', searchTerms: ['bmc', 'ipmi', 'management', 'ilo'] },
    { name: 'Redundant PSU', category: 'electrical', reason: 'High-availability power supply', typicalProcess: 'COTS', searchTerms: ['psu', 'power supply', 'redundant'] },
    { name: 'Thermal Solution (Heat Sink + Fan)', category: 'thermal', reason: 'TDP management for compute modules', typicalProcess: 'COTS', searchTerms: ['heat sink', 'heatsink', 'fan', 'thermal', 'cooler'] },
    // B3: class-specific safety subsystem floors (edge AI in container class)
    { name: 'Emergency Shutdown Relay', category: 'safety', reason: 'Minimum floor: £120 — fire/overtemp emergency power cut', typicalProcess: 'COTS', searchTerms: ['emergency shutdown', 'esd relay', 'e-stop relay', 'safety relay'] },
  ],
  wearable_medical: [
    { name: 'Biocompatible Skin Adhesive', category: 'safety', reason: 'ISO 10993 biocompatibility for skin contact', typicalProcess: 'COTS', searchTerms: ['adhesive', 'biocompatible', 'skin', 'patch adhesive'] },
    { name: 'Battery Safety Circuit', category: 'safety', reason: 'Overcharge/discharge protection for on-body device', typicalProcess: 'COTS', searchTerms: ['battery protection', 'protection circuit', 'pcm'] },
  ],
  pcb_assembly: [
    { name: 'ESD Protection Components', category: 'safety', reason: 'Electrostatic discharge protection for handling', typicalProcess: 'COTS', searchTerms: ['esd', 'tvss', 'esd protection'] },
    { name: 'Conformal Coating', category: 'safety', reason: 'Environmental protection for PCB', typicalProcess: 'service', searchTerms: ['conformal coating', 'protective coating'] },
  ],
  // B3: additional product classes with safety subsystem floors
  vertical_farm: [
    { name: 'LED Grow Lights (Signify / Fluence)', category: 'electrical', reason: 'Primary photosynthesis driver — must specify PPFD and spectrum', typicalProcess: 'COTS', searchTerms: ['led grow', 'grow light', 'fluence', 'signify', 'ppfd'] },
    { name: 'HVAC Fan Coil / Dehumidifier (Munters)', category: 'thermal', reason: 'Climate control — temperature and humidity for crop yield', typicalProcess: 'COTS', searchTerms: ['hvac', 'fan coil', 'dehumidifier', 'munters', 'carel'] },
    { name: 'Fertigation Controller (Priva / Netafim)', category: 'structural', reason: 'Nutrient delivery automation — EC/pH dosing', typicalProcess: 'COTS', searchTerms: ['fertigation', 'nutrient', 'priva', 'netafim', 'dosing controller'] },
    { name: 'Fire Detection System', category: 'safety', reason: 'BS 5839 compliant early warning for enclosed growing environments', typicalProcess: 'COTS', searchTerms: ['fire detection', 'smoke detector', 'heat detector', 'fire alarm'] },
  ],
  wearable_medical: [
    { name: 'Biocompatible Skin Adhesive', category: 'safety', reason: 'ISO 10993 biocompatibility for skin contact', typicalProcess: 'COTS', searchTerms: ['adhesive', 'biocompatible', 'skin', 'patch adhesive'] },
    { name: 'Battery Safety Circuit', category: 'safety', reason: 'Overcharge/discharge protection for on-body device', typicalProcess: 'COTS', searchTerms: ['battery protection', 'protection circuit', 'pcm'] },
    // B3: CGM/wearable-specific safety subsystem floors
    { name: 'Analogue Front-End ASIC (Analog Devices / TI)', category: 'electrical', reason: 'Minimum floor: £8 — precision electrochemical measurement ASIC', typicalProcess: 'COTS', searchTerms: ['asic', 'analog frontend', 'afe', 'analog devices', 'texas instruments'] },
    { name: 'Glucose Sensor Electrode (Metrohm / YSI)', category: 'safety', reason: 'Biosensor — requires biocompatibility certification per ISO 10993', typicalProcess: 'COTS', searchTerms: ['glucose sensor', 'electrochemical sensor', 'metrohm', 'ysi', 'electrode'] },
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
