export interface ProductClassification {
  productClass: string
  technologyDomains: string[]
  hazardDomains: string[]
  manufacturingArchetype: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  reasoning: string
}

// --- Declared-class signatures (checked BEFORE every keyword rule) ---
// UNIVERSAL FIX (2026-06-01): a brief's DECLARED product class must win over an
// incidental component / sub-system keyword that happens to appear in the prose.
// Real engineering briefs mention adjacent classes as components: a humanoid
// brief ships with a "charging station" (trips ev_charger), a Direct-Air-Capture
// brief USES a "heat pump" + "refrigerant" + "condenser" (trips thermal_system).
// Those incidental mentions previously shadowed the true class because the
// keyword cascade is order-sensitive (first match wins) and the incidental
// keyword sat earlier in the cascade.
//
// This table holds HIGH-SPECIFICITY, UNAMBIGUOUS product-class declarations —
// compound phrases / proper product-type names that a brief only uses when it
// IS that product. Ordered most-specific first; first match short-circuits the
// whole classifier. Adding a class here is one line and makes that class immune
// to incidental-keyword shadowing — it is NOT a per-brief special case.
//
// Each slug MUST resolve in BOTH downstream registries (envelope.ts CLASS_ALIASES
// + engineering-contract.ts ARCHETYPE_ALIASES) or the chain falls back to the
// generic envelope rather than the class-specific path.
const DECLARED_CLASS_SIGNATURES: Array<{ re: RegExp; cls: string }> = [
  // CO2 capture + MINERAL CARBONATION plant (2026-06-03): MEA flue-gas capture →
  // gypsum → CaCO3 + K2SO4, with MEA recovery. Must beat the 'dac' rule below (this
  // is SOLVENT capture + mineralisation to PRODUCTS, not sorbent air capture) and
  // the generic vehicle/other catches ("trailer", "skid"). Routes to the
  // co2_mineralisation emitter + envelope detector.
  { re: /mineral[\s-]?carbon(?:at|is)|capture\s+and\s+mineralis|mineralis\w*\s+(?:the\s+)?(?:captured\s+)?(?:co2|carbon)|(?:co2|carbon).{0,40}gypsum|gypsum.{0,40}(?:co2|carbon|calcium\s*carbonate|caco3)/, cls: 'co2_mineralisation' },
  // e-fuel synthesis — Power-to-Liquid Fischer-Tropsch Sustainable Aviation Fuel
  // (SAF) plant (2026-06-05): single-step CO₂ hydrogenation over an iron FT
  // catalyst → jet-range paraffins + naphtha. Must beat the 'dac' rule below: the
  // brief is FULL of "captured CO₂" + "tonnes/year" signals (the feedstock) that
  // would otherwise trip dac's `tonnes ... co2 per year`. The brief deliberately
  // spells "carbon dioxide" as "CO₂" and uses "water electrolysis" (NOT
  // "electrolyser"/"direct air capture") to avoid mis-routing — this rule keys on
  // the PRODUCT (Fischer-Tropsch / Power-to-Liquid / SAF), not the feedstock.
  { re: /fischer[\s-]?tropsch|power[\s-]?to[\s-]?liquid|\bptl\b|sustainable\s+aviation\s+fuel|\be[\s-]?fuel|synthetic\s+(?:kerosene|paraffin|crude)|\bsaf\b\s+(?:plant|synthesis)/, cls: 'e_fuel_synthesis' },
  // Direct air capture — "direct air capture"/"DAC module"/"X tCO2/yr capture".
  // Must beat thermal_system (DAC regen uses an 80-100 °C heat-pump train, so the
  // brief is FULL of heat-pump / refrigerant / condenser / COP signals).
  { re: /direct[\s-]?air[\s-]?capture|\bdac\b\s+(?:module|unit|plant|system|park|brief)|sorbent[\s-]?based\s+(?:co2|carbon)\s+capture|(?:co2|carbon)\s+capture.{0,40}sorbent|t\s?co2\s*\/?\s*yr|tco2\s*\/?\s*year|tonnes?\s+(?:of\s+)?(?:atmospheric\s+)?co2\s+per\s+year/, cls: 'dac' },
  // Humanoid / legged robot. Must beat ev_charger (humanoid ships a charging
  // dock) and the generic aerospace catch (humanoid briefs say "payload per arm").
  { re: /humanoid|biped(?:al)?\s+robot|legged\s+robot|two[\s-]?legged\s+robot|teleoperat(?:ion|ed)\s+robot/, cls: 'humanoid' },
  // Recirculating Aquaculture System (RAS) — a land-based fish farm that is, in
  // engineering terms, a continuous water-treatment + life-support PROCESS PLANT
  // (rearing tanks → drum solids filter → MBBR biofilter → CO2 degasser → pure-oxygen
  // contactor → UV/ozone → heat → return). A NEW archetype with no hand-wired class
  // plan: routing it to its own slug sends it to the universal auto-planner, which
  // picks the process tools (tank/vessel sizing, pump, pipe, gas-transfer, reactor-as-
  // biofilter, heat exchanger) from the brief physics. MUST beat the generic
  // vehicle/marine/aerospace catches below — a kingfish RAS brief is full of
  // "seawater", "marine", "tank" tokens that otherwise mis-route to 'vehicle'.
  { re: /recirculating\s+aquaculture|\baquaculture\b|land[\s-]?based\s+(?:marine\s+)?(?:fish\b|aquacult)|yellowtail\s+kingfish|fish[\s-]?rearing\s+tank|recirculat\w+.{0,25}\bfish\b/, cls: 'aquaculture_ras' },
  // Water / fertigation / ebb-flow irrigation PLANT (2026-06-25) — a water-treatment +
  // irrigation PROCESS PLANT (RO, softening, GAC, storage tanks, A/B nutrient dosing, pumps,
  // distribution valves) that SUPPLIES an indoor/vertical farm. The PRODUCT is the water
  // system, NOT the farm. MUST beat the vertical_farm keyword rule below (which catches
  // "fertigation" / "growing tray" and would build the whole LED/HVAC/canopy farm — the
  // Codema Fischer Farms mis-route that produced a £112M dossier). Keys on the product NOUN
  // (water/irrigation PLANT or SYSTEM), not the application context (vertical farm). A true
  // leafy-greens vertical-farm brief never names a "water-handling / fertigation / irrigation
  // plant" as its deliverable, so it falls through to vertical_farm.
  { re: /\b(?:irrigation|fertigation)\s+(?:and\s+\w+\s+)?(?:plant|system|installation)\b|water[\s-]?handling(?:\s+(?:and|,))?|\bwater[\s-]?treatment\s+(?:plant|system)|water[\s-]?purification|(?:reverse[\s-]?osmosis|ebb[\s\/.-]*and[\s\/.-]*flow|ebb[\s\/.-]*flow)[^.]{0,160}(?:fertigation|irrigation|nutrient|storage\s+tank|plant|installation)/, cls: 'water_treatment' },
  // Bench / lab PSU (2026-08-16): must beat the generic vehicle fallthrough
  // (`vehicle|car|drivetrain|crash|homologation`). A 240 W supply is an instrument.
  { re: /bench\s+(?:psu|power\s+supply)|lab(?:oratory)?\s+power\s+supply|programmable\s+power\s+supply|desktop\s+psu|\b240\s*w\b.{0,60}(?:psu|power\s+supply)/, cls: 'bench_psu' },
  { re: /\b(?:elisa|assay\s+(?:machine|reader|instrument|analyser|analyzer)|sample[- ]to[- ]answer|diagnostic\s+reader)\b/, cls: 'medical_device' },
  { re: /\belectric\s+motor\s+set|motor[- ]inverter\s+set|drive\s+unit\s+set\b/, cls: 'vehicle' },
  { re: /\bbattery\s+energy\s+storage|\bbess\b(?:\s+(?:pack|system|cabinet|container))/, cls: 'energy_storage' },
]

/** Lock families the one-engine door may force. instrument ≠ vehicle ≠ plant. */
export const CLASS_LOCK_ALLOWED: Record<string, readonly string[]> = {
  instrument: [
    'bench_psu',
    'lab_instrument',
    'optical_instrument',
    'ups_inverter',
    'consumer_electronics',
    'pcb_assembly',
    'medical_device',
    'wearable_medical',
  ],
  assay: [
    'medical_device',
    'optical_instrument',
    'lab_instrument',
    'wearable_medical',
    'pcb_assembly',
    'bench_psu',
  ],
  'wall-store': ['energy_storage'],
  ahs: ['energy_storage'],
  edu: ['vehicle', 'industrial_machine', 'robotics'],
  plant: [
    'water_treatment',
    'bioreactor',
    'vertical_farm',
    'fluid_processing',
    'co2_mineralisation',
    'e_fuel_synthesis',
    'dac',
    'h2_electrolyser',
    'aquaculture_ras',
  ],
}

const CLASS_LOCK_CANONICAL: Record<string, string> = {
  instrument: 'bench_psu',
  'wall-store': 'energy_storage',
  ahs: 'energy_storage',
  edu: 'vehicle',
  plant: 'water_treatment',
}

/**
 * Honour ANVIL_CLASS_LOCK from the one-engine door. If the keyword classifier
 * landed on a forbidden slug (bench PSU → vehicle), force the canonical class
 * for that family and say so. Does not mint a ship flag.
 */
export function applyClassLock(
  classified: ProductClassification,
  lockFamily: string | undefined,
): ProductClassification {
  const family = (lockFamily || '').trim().toLowerCase()
  if (!family || family === 'generic') return classified
  const allowed = CLASS_LOCK_ALLOWED[family]
  if (!allowed) return classified
  if (allowed.includes(classified.productClass)) return classified
  const locked = CLASS_LOCK_CANONICAL[family] || classified.productClass
  return {
    ...classified,
    productClass: locked,
    confidence: 'HIGH',
    reasoning:
      `ANVIL_CLASS_LOCK=${family} refused classified "${classified.productClass}" ` +
      `and forced "${locked}". ${classified.reasoning}`,
  }
}

export function classifyProduct(briefText: string): ProductClassification {
  const lower = briefText.toLowerCase()

  let productClass = 'unknown'

  // Declared-class pass — a high-specificity product-class declaration wins over
  // any incidental component keyword further down the cascade. See table above.
  for (const sig of DECLARED_CLASS_SIGNATURES) {
    if (sig.re.test(lower)) {
      productClass = sig.cls
      break
    }
  }

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
    } else if (lower.match(/\bups\b\s+(?:inverter|system|module|product|brief|test)|uninterruptible\s+power|online\s+double[- ]?conversion|static\s+bypass\s+switch|vfi[- ]ss/)) {
      // 2026-05-24: UPS must beat the pcb_assembly catch — UPS briefs often mention
      // "PCBA supplier" as a manufacturing partner, which trips \bpcba\b first.
      productClass = 'ups_inverter'
    } else if (lower.match(/humanoid|biped(?:al)?\s+robot|legged\s+robot|teleoperat(?:ion|ed)\s+robot/)) {
      // 2026-05-24: humanoid must beat the generic 'aerospace' catch in the
      // fallthrough — humanoid briefs commonly say "payload (per arm): N kg"
      // which trips /payload/ → aerospace.
      productClass = 'humanoid'
    } else if (lower.match(/\bsmr\b|small modular reactor|pressuris(?:ed|er)\s+water\s+reactor|\bpwr\b.*reactor|reactor pressure vessel|nuclear\s+(?:island|reactor|fuel\s+assembl)|fission|control\s+rod\s+drive/)) {
      // 2026-05-24: SMR must beat the generic 'industrial machine' catch.
      productClass = 'smr'
    } else if (lower.match(/\b(?:photometer|colou?rimeter|spectrophotometer|spectrometer|fluorimeter|fluorometer|turbidimeter|nephelometer|refractometer)\b/)
      || (lower.match(/\bcuvette\b/) && lower.match(/absorbance|transmittance|photometr|\bwavelength\b|optical\s+path|beer.?lambert/))) {
      // 2026-07-12 (Grok P0): an optical/photometric benchtop-or-handheld INSTRUMENT
      // (photometer / colorimeter / spectrophotometer / turbidimeter …) must BEAT the
      // pcb_assembly catch below — its brief legitimately says "PCB or module interconnect
      // design … assembly instructions" for the WHOLE instrument, which trips `pcb.*assembly`
      // and mis-routes a £200 photometer onto a PCB-fab-line class (DEFAULT cost stack,
      // plant tool bootstrap, worthless £/unit band). Routes to the generic device-scale
      // path; the instrument-ontology (state.isInstrumentDevice, keyed on enclosure_volume
      // + optical tool signal) handles topology / pricing / rendering. NOT a registered
      // builder class — deliberately generic so any optical instrument is covered.
      productClass = 'optical_instrument'
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
    } else if (lower.match(/satellite|cubesat|orbit|payload|launch|spacecraft|\bleo\b/)) {
      // 2026-06-03 (wall-1 satellite routing): the coarse 'aerospace' class had
      // NO registered emitter/detector → satellite briefs hit exit 7 even though
      // the satellite emitters (satellite_smallsat/cubesat/geo_comsat/
      // interplanetary) are registered + BESS-quality + have envelope detectors.
      // Route to the actual sub-class so the registered emitter fires. Sub-type
      // by keyword; default to smallsat (50-500 kg ESPA-class). Note: the HAPS
      // branch above already claimed "high-altitude pseudo-satellite", so a true
      // free-flyer reaches here.
      if (lower.match(/cubesat|\b[1369]u\b|pocketqube/)) productClass = 'satellite_cubesat'
      else if (lower.match(/interplanetary|deep[- ]?space|cislunar|\blunar\b|\bmars\b|flyby/)) productClass = 'satellite_interplanetary'
      else if (lower.match(/geostationary|\bgeo\b|comsat|communications satellite|broadcast satellite/)) productClass = 'satellite_geo_comsat'
      else productClass = 'satellite_smallsat'
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

/**
 * Decide whether a classification represents a NOVEL archetype — a "new kind of
 * system" the engine has no deep reference library for, which takes 60-90 min to
 * research from scratch rather than the ~30 min a KNOWN system takes.
 *
 * A run is novel when the classifier either could not place the brief into any
 * known product class (`unknown`) or placed it with only LOW confidence. Both
 * mean the same thing to the founder: there's no off-the-shelf reference, so the
 * engine has to study comparable systems and build the library before drafting.
 *
 * Null-safe: callers pass values straight off a pdf_engine_runs row, which may be
 * null for rows inserted before the detected_* columns existed. A null verdict is
 * treated as NOT novel (the generic banner is the safe default).
 */
export function isNovelArchetype(
  productClass: string | null | undefined,
  confidence: string | null | undefined,
): boolean {
  if (!productClass && !confidence) return false
  return confidence === 'LOW' || productClass === 'unknown'
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
