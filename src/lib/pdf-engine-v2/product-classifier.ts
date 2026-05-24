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

  let productClass = 'unknown'

  // --- Single-keyword specific classes (checked FIRST) ---
  // These product types are specific enough that a single keyword is sufficient.
  // They MUST come before multi-signal energy_storage because products like
  // drones, HAPS, and EV chargers all contain batteries but are not BESS.
  if (productClass === 'unknown') {
    if (lower.match(/\bhaps\b|high[- ]altitude pseudo[- ]satellite|stratospheric.*aircraft|solar.*stratospher/)) {
      productClass = 'haps'
    } else if (lower.match(/\bauv\b|\brov\b|autonomous underwater|unmanned underwater|underwater vehicle|subsea vehicle/)) {
      productClass = 'auv'
    } else if (lower.match(/\bdrone\b|\buav\b|unmanned aerial|quadcopter|multirotor/)) {
      productClass = 'drone'
    } else if (lower.match(/ev charger|dc fast.?charger|electric vehicle.*charger|charging station|\bccs2?\b.*charger|\bocpp\b/)) {
      productClass = 'ev_charger'
    } else if (lower.match(/bioreactor|fermenter|fermentation.*(?:vessel|tank|process)|bioprocess|cell culture/)) {
      productClass = 'bioreactor'
    } else if (lower.match(/edge.?ai|gpu server|1u.*server|rack.?mount.*server|datacentre|\btpu\b|\bnpu\b|compute server|inference.*server|inference.*appliance/)) {
      productClass = 'edge_ai_server'
    } else if (lower.match(/wearable.*medical|\bcgm\b|continuous glucose|blood sugar|biosensor.*patch|on.body.*sensor|skin.worn|diabet/)) {
      productClass = 'wearable_medical'
    } else if (lower.match(/\bpcba\b|\bsmt\b.*assembly|surface mount.*assembly|bga.*reflow|solder paste|pcb.*assembly/)) {
      productClass = 'pcb_assembly'
    }
  }

  // --- Multi-signal classes (require 2+ signals to avoid false-positives) ---

  // Energy storage — two distinct signals required.
  if (productClass === 'unknown') {
    const storageSignals = [
      /\bbess\b/,
      /battery energy storage/,
      /lithium[- ]?ion pack|li[- ]?ion (?:pack|module|system)|lfp (?:cell|pack|module)|nmc (?:cell|pack|module)|lmfp|sodium[- ]ion (?:cell|pack|module)/,
      /prismatic (?:cell|module)|pouch cell|cylindrical (?:cell|can)/,
      /kwh (?:capacity|usable|storage|pack|cell|system|battery)/,
      /\b(?:pcs|power conversion system)\b/,
      /cycle life.*(?:6000|8000|10000)/,
      /c[- ]rate/,
    ]
    const storageHits = storageSignals.filter(r => r.test(lower)).length
    if (storageHits >= 2) productClass = 'energy_storage'
  }

  // Vertical farm — at least one specific farm signal.
  if (productClass === 'unknown' && lower.match(/vertical farm|indoor farm|hydroponic|aeroponic|fertigation|growing (?:tray|rack|tier)|horticultur|agricultural lighting|leafy greens|indoor grow/)) {
    productClass = 'vertical_farm'
  }

  // Heat-pump / thermal — require TWO signals so BESS-with-thermal-management
  // doesn't trigger it.
  if (productClass === 'unknown') {
    const thermalSignals = [
      /heat pump/,
      /chiller/,
      /refriger(?:ant|ation)/,
      /\bhvac\b/,
      /cop\b|scop\b/,
      /r[- ]?290|r[- ]?32|r[- ]?134a|r[- ]?454b|propane refrigerant/,
      /monobloc|split system|hydrobox/,
      /heating (?:mode|cycle)|cooling (?:mode|cycle)/,
      /evaporator|condenser/,
    ]
    const thermalHits = thermalSignals.filter(r => r.test(lower)).length
    if (thermalHits >= 2) productClass = 'thermal_system'
  }

  // --- Generic fallthrough (single-keyword, broad) ---
  // These are checked AFTER specific classes. "autonomous" appears in both
  // AUV ("autonomous underwater") and robotics — AUV is caught above.
  if (productClass === 'unknown') {
    // 2026-05-22 (Tristan eVTOL chain audit): eVTOL must match BEFORE the
    // generic 'aerospace' catch — the eVTOL brief contains "passenger payload"
    // which trips the aerospace rule and routes the design to a too-generic
    // class. Distinct eVTOL signals: 'eVTOL' string itself, tilt-rotor /
    // tiltrotor / UAM / urban air mobility / vertical take-off references.
    if (lower.match(/\bevtol\b|tilt[- ]?rotor|urban air mobility|\buam\b/)) {
      productClass = 'evtol'
    } else if (lower.match(/satellite|cubesat|orbit|payload|launch/)) {
      productClass = 'aerospace'
    } else if (lower.match(/\bcnc\b|machining cent(?:re|er)|\b5[- ]?axis\b|\bvmc\b|vertical machining/)) {
      // 2026-05-23 (CNC chain audit): CNC briefs often mention "robot
      // integration" as an EXCLUDED component, which would trip the generic
      // robotics catch. Match CNC-specific signals first.
      productClass = 'cnc_machine'
    } else if (lower.match(/wind turbine|onshore wind|offshore wind|\bhawt\b|\bvawt\b|rotor blade|yaw drive|pitch system/)) {
      // 2026-05-23 (wind turbine L4 audit): wind turbine briefs contain
      // "rotor blades" + "actuators" + "pitch" — all trip the generic
      // robotics catch. Need explicit wind-turbine pattern first.
      productClass = 'wind_turbine'
    } else if (lower.match(/solar inverter|pv inverter|string inverter|central inverter|1500\s*v\s*dc|photovoltaic inverter/)) {
      // 2026-05-23: solar inverter briefs mention "active front end" + power
      // electronics — should map to solar_inverter, not consumer_electronics.
      productClass = 'solar_inverter'
    } else if (lower.match(/electrolyser|electrolyzer|\bpem stack\b|hydrogen production|h2\s*\/?h2 stack|green hydrogen/)) {
      productClass = 'h2_electrolyser'
    } else if (lower.match(/\bauv\b|autonomous underwater|subsea inspection|underwater vehicle|rov\b/)) {
      productClass = 'auv'
    } else if (lower.match(/dc charger|dc fast charger|ev charger|ccs2|ultra[- ]?rapid/)) {
      productClass = 'ev_charger'
    } else if (lower.match(/bioreactor|fermenter|single[- ]?use bag|cell culture vessel|sterile manufacture/)) {
      productClass = 'bioreactor'
    } else if (lower.match(/humanoid|biped(?:al)?\s+robot|legged\s+robot|teleoperat(?:ion|ed)\s+robot/)) {
      // 2026-05-24: humanoid must match BEFORE the generic 'robot' catch.
      // Distinct signals: 'humanoid', 'bipedal/biped robot', 'legged robot'.
      productClass = 'humanoid'
    } else if (lower.match(/\bsmr\b|small modular reactor|pressuris(?:ed|er)\s+water\s+reactor|\bpwr\b.*reactor|reactor pressure vessel|nuclear\s+(?:island|reactor|fuel\s+assembl)|fission|control rod drive/)) {
      // 2026-05-24: SMR/nuclear must match BEFORE generic 'industrial machine' catch.
      productClass = 'smr'
    } else if (lower.match(/\bups\b\s+(?:inverter|system)|uninterruptible\s+power|online\s+double[- ]?conversion|static\s+bypass\s+switch|vfi[- ]ss/)) {
      // 2026-05-24: UPS must match BEFORE pcb_assembly/consumer_electronics.
      // VFI-SS-111 is the IEC 62040-3 UPS performance classification.
      productClass = 'ups_inverter'
    } else if (lower.match(/robot|actuator|manipulator|autonomous/)) {
      productClass = 'robotics'
    } else if (lower.match(/vehicle|car|drivetrain|crash|homologation/)) {
      productClass = 'vehicle'
    } else if (lower.match(/phone|tablet|display|pcb/)) {
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

const COMMON_REQUIRED = ['product_type', 'target_cost', 'production_volume', 'jurisdiction']

const SPECIFIC_FIELDS: Record<string, string[]> = {
  thermal_system: ['thermal_capacity_kw', 'cop_target', 'refrigerant_type', 'acoustic_target_dba', 'architecture_type'],
  energy_storage: ['energy_kwh', 'power_kw', 'voltage', 'chemistry', 'cycle_life'],
  vertical_farm: ['growing_footprint', 'target_yield', 'lighting_ppfd', 'water_use', 'energy_use'],
  aerospace: ['mass_budget_kg', 'power_budget_w', 'orbit_type', 'payload_mass', 'launch_vehicle'],
  vehicle: ['powertrain_type', 'range_km', 'top_speed', 'crash_rating', 'kerb_mass'],
  consumer_electronics: ['battery_capacity_wh', 'display_size', 'ip_rating', 'drop_test_standard'],
  medical_device: ['device_class', 'intended_use', 'biocompatibility', 'sterilisation'],
  fluid_processing: ['flow_rate', 'pressure_rating', 'fluid_type', 'materials_compatibility'],
  drone: ['flight_time_min', 'payload_kg', 'range_km', 'regulatory_class'],
  auv: ['depth_rating_m', 'mission_duration_h', 'payload_sensors', 'navigation_type'],
  haps: ['wingspan_m', 'altitude_m', 'endurance_days', 'solar_array_area_m2'],
  ev_charger: ['power_kw', 'connector_type', 'grid_connection', 'outdoor_rating'],
  edge_ai_server: ['compute_tdp_w', 'rack_units', 'gpu_count', 'network_interface'],
  pcb_assembly: ['board_count', 'layer_count', 'component_count', 'assembly_type'],
  wearable_medical: ['device_class', 'battery_life_days', 'sensor_type', 'skin_contact_area'],
  bioreactor: ['volume_litres', 'vessel_type', 'sterilisation_method', 'cell_type'],
}

const RECOMMENDED_UNKNOWN = ['target_cost', 'production_volume', 'jurisdiction', 'max_mass']

/**
 * Returns the fields that MUST be present for the pipeline to proceed.
 *
 * Known product classes (in the SPECIFIC_FIELDS map) keep the full common +
 * specific list for backward compatibility. Unknown or unrecognised classes
 * only require `product_type` — a naive founder saying "I want to build a
 * drone" should get a useful report, not a validation error.
 */
export function getRequiredFields(productClass: string): string[] {
  if (productClass !== 'unknown' && productClass in SPECIFIC_FIELDS) {
    return [...COMMON_REQUIRED, ...SPECIFIC_FIELDS[productClass]]
  }
  return ['product_type']
}

/**
 * Returns fields that are nice-to-have but should NOT block the pipeline.
 * The validator can surface these as warnings to encourage richer briefs
 * without rejecting minimal ones.
 */
export function getRecommendedFields(productClass: string): string[] {
  if (productClass === 'unknown' || !(productClass in SPECIFIC_FIELDS)) {
    return [...RECOMMENDED_UNKNOWN]
  }
  // Known classes already have all common fields in required — only max_mass
  // is a genuine recommendation.
  return ['max_mass']
}
