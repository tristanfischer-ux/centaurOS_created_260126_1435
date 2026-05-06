export interface ProductClassification {
  productClass: string
  technologyDomains: string[]
  hazardDomains: string[]
  manufacturingArchetype: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  reasoning: string
}

export function classifyProduct(briefText: string): ProductClassification {
  const lower = briefText.toLowerCase()

  // FARM-CLS-1 FIX (2026-05-06): order matters — specific/rare product classes
  // are tested first so loose single-token matches don't capture the class.
  // Previously a farm brief containing "2.5 kWh per kg" was classified as
  // energy_storage because the regex `/.../.test()` hit `kwh` and won the
  // cascade. Also tightened each class: require two distinct token matches
  // for the energy_storage class to prevent broad single-keyword matches.

  // Product class detection — specific classes first
  let productClass = 'unknown'
  if (lower.match(/vertical farm|indoor farm|hydroponic|fertigation|growing (?:tray|rack|tier)|horticultur|agricultural lighting/)) {
    productClass = 'vertical_farm'
  } else if (lower.match(/heat pump|chiller|refriger| hvac|thermal\s|boiler/)) {
    productClass = 'thermal_system'
  } else if (lower.match(/satellite|cubesat|orbit|payload|launch/)) {
    productClass = 'aerospace'
  } else if (lower.match(/robot|actuator|manipulator|autonomous/)) {
    productClass = 'robotics'
  } else if (lower.match(/vehicle|car|drivetrain|crash|homologation/)) {
    productClass = 'vehicle'
  } else if (lower.match(/phone|tablet|wearable|display|pcb/)) {
    productClass = 'consumer_electronics'
  } else if (lower.match(/machine|press|mill|conveyor|industrial/)) {
    productClass = 'industrial_machine'
  } else if (lower.match(/appliance|washer|dryer|dishwasher|oven/)) {
    productClass = 'appliance'
  } else if (lower.match(/clock|watch|escapement|pendulum|cuckoo/)) {
    productClass = 'mechanical_clockwork'
  } else if (lower.match(/medical|implant|surgical|diagnostic|patient/)) {
    productClass = 'medical_device'
  } else if (lower.match(/pump|valve|pipe|filtr|desalination|processing/)) {
    productClass = 'fluid_processing'
  } else if (lower.match(/structure|frame|building|bridge|enclosure/)) {
    productClass = 'structural_product'
  }

  // Energy storage — require TWO distinct signals so narrative mentions of
  // "kwh" or "battery" alone (in passing, e.g. "2.5 kWh per kg" for a farm,
  // or "battery-backed UPS" for a machine) don't override more specific
  // classifications above.
  if (productClass === 'unknown') {
    const storageSignals = [
      /\bbess\b/,
      /battery energy storage/,
      /lithium[- ]?ion|li-ion|lfp|nmc|lmfp|sodium[- ]ion/,
      /cell(s)?\s+(?:chemistry|stack|pack|rack|module)/,
      /kwh.*(?:capacity|usable|storage|pack|cell)/,
      /power conversion system|pcs\b/,
      /cycle life/,
    ]
    const storageHits = storageSignals.filter(r => r.test(lower)).length
    if (storageHits >= 2) productClass = 'energy_storage'
  }
  
  // Technology domains
  const techDomains: string[] = []
  if (lower.match(/electr|voltage|current|power|motor|inverter/)) techDomains.push('electrical')
  if (lower.match(/pcb|microcontroller|firmware|sensor|dsp/)) techDomains.push('electronic')
  if (lower.match(/battery|cell|bms|kwh|lithium|sodium/)) techDomains.push('battery')
  if (lower.match(/thermal|heat|cool|temperature|insulation/)) techDomains.push('thermal')
  if (lower.match(/refriger|compressor|condenser|evaporat|cop /)) techDomains.push('refrigeration')
  if (lower.match(/mechanical|gear|bearing|shaft|linkage/)) techDomains.push('mechanical')
  if (lower.match(/struct|frame|chassis|enclosure|load/)) techDomains.push('structural')
  if (lower.match(/fluid|hydraulic|pneumatic|pipe|valve|pump/)) techDomains.push('fluidic')
  if (lower.match(/chemical|electrolyte|catalyst|reaction|coating/)) techDomains.push('chemical')
  if (lower.match(/software|firmware|embedded|rtos|plc/)) techDomains.push('software_embedded')
  if (lower.match(/antenna|rf|radio|wireless|bluetooth|wifi|5g/)) techDomains.push('RF_comms')
  if (lower.match(/lens|optic|laser|led|display|camera/)) techDomains.push('optical')
  if (lower.match(/safety|emergency|fail\.safe|redundan|hazard/)) techDomains.push('safety_critical')
  if (lower.match(/pressure|vessel|hydraulic|pneumatic/)) techDomains.push('pressure_system')
  if (lower.match(/motor|fan|pump|turbine|compressor|rotor/)) techDomains.push('rotating_machinery')
  if (lower.match(/combustion|burner|fuel|gas|flame/)) techDomains.push('combustion')
  if (lower.match(/clock|escapement|spring|pendulum|mechanism/)) techDomains.push('precision_mechanism')
  if (lower.match(/display|touch|button|ui|interface|screen/)) techDomains.push('human_interface')
  if (lower.match(/medical|implant|surgical|fda|ce marking/)) techDomains.push('regulated_medical')
  if (lower.match(/grid|inverter|solar|wind|dual\.use/)) techDomains.push('grid_connected')
  if (lower.match(/container|shipping|transportable|iso container/)) techDomains.push('transportable_containerised')
  
  // Hazard domains
  const hazardDomains: string[] = []
  if (lower.match(/high\.voltage|400v|lv|hv|480v/)) hazardDomains.push('high_voltage')
  if (lower.match(/battery|kwh|stored energy|lithium/)) hazardDomains.push('stored_energy')
  if (lower.match(/r290|r600|r1234yf|propane|butane|flammabl/)) hazardDomains.push('flammable_refrigerant')
  if (lower.match(/fire|flame|combustion|ignition/)) hazardDomains.push('fire')
  if (lower.match(/explos|atex|zone 2|flammable gas/)) hazardDomains.push('explosion')
  if (lower.match(/pressure|vessel|pipe|hydraulic/)) hazardDomains.push('pressure')
  if (lower.match(/motor|fan|rotor|blade|gear/)) hazardDomains.push('rotating_parts')
  if (lower.match(/sharp|cutting|blade|edge/)) hazardDomains.push('sharp_edges')
  if (lower.match(/toxic|poison|chemical|acid/)) hazardDomains.push('toxic_chemistry')
  if (lower.match(/hot|thermal|burn|temperature/)) hazardDomains.push('thermal_burn')
  if (lower.match(/electrical shock|live|exposed|insulation/)) hazardDomains.push('electrical_shock')
  
  // Manufacturing archetype
  let mfgArchetype = 'mixed_assembly'
  if (lower.match(/sheet metal|stamping|press brake|laser cut/)) mfgArchetype = 'sheet_metal_assembly'
  else if (lower.match(/cnc|machined|milling|turning/)) mfgArchetype = 'machined_parts'
  else if (lower.match(/injection mould|injection mold|plastic/)) mfgArchetype = 'injection_moulded_product'
  else if (lower.match(/weld|fabricat|structural steel/)) mfgArchetype = 'welded_fabrication'
  else if (lower.match(/pcb|smt|electronic assembly|solder/)) mfgArchetype = 'electronics_assembly'
  else if (lower.match(/battery pack|cell assembly|module assembly/)) mfgArchetype = 'battery_pack_assembly'
  else if (lower.match(/refriger|braz|copper|compressor/)) mfgArchetype = 'refrigeration_assembly'
  else if (lower.match(/clean room|aerospace|satellite|esd/)) mfgArchetype = 'aerospace_clean_build'
  else if (lower.match(/clock|escapement|precision|watch/)) mfgArchetype = 'precision_clockwork'
  else if (lower.match(/container|skid|modular|iso frame/)) mfgArchetype = 'containerised_skid'
  
  // Confidence
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
  if (productClass === 'unknown') confidence = 'LOW'
  else if (techDomains.length < 2) confidence = 'MEDIUM'
  
  return {
    productClass,
    technologyDomains: techDomains,
    hazardDomains,
    manufacturingArchetype: mfgArchetype,
    confidence,
    reasoning: `Classified as ${productClass} based on keyword matches. Technology domains: ${techDomains.join(', ')}. Hazards: ${hazardDomains.join(', ')}.`
  }
}

export function getRequiredFields(productClass: string): string[] {
  const common = ['product_type', 'target_cost', 'production_volume', 'jurisdiction']
  const recommended = ['max_mass']
  
  const specific: Record<string, string[]> = {
    thermal_system: ['thermal_capacity_kw', 'cop_target', 'refrigerant_type', 'acoustic_target_dba', 'architecture_type'],
    energy_storage: ['energy_kwh', 'power_kw', 'voltage', 'chemistry', 'cycle_life'],
    vertical_farm: ['growing_footprint', 'target_yield', 'lighting_ppfd', 'water_use', 'energy_use'],
    aerospace: ['mass_budget_kg', 'power_budget_w', 'orbit_type', 'payload_mass', 'launch_vehicle'],
    vehicle: ['powertrain_type', 'range_km', 'top_speed', 'crash_rating', 'kerb_mass'],
    consumer_electronics: ['battery_capacity_wh', 'display_size', 'ip_rating', 'drop_test_standard'],
    medical_device: ['device_class', 'intended_use', 'biocompatibility', 'sterilisation'],
    fluid_processing: ['flow_rate', 'pressure_rating', 'fluid_type', 'materials_compatibility'],
  }
  
  return [...common, ...(specific[productClass] || [])]
}
