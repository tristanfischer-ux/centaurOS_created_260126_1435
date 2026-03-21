/**
 * @file industry-domains.ts — Second-tier domain detection for standards retrieval.
 *
 * INTENT: The existing CadLabDomain (electronics/mechanical/electromechanical/fluid)
 * controls prompt templates and code gen hints. IndustryDomain is a finer-grained
 * classification used to retrieve the right engineering standards from Supabase.
 * Both run in parallel — this does NOT replace the existing domain system.
 */

export type IndustryDomain =
  | "marine"
  | "automotive"
  | "aerospace"
  | "medical"
  | "consumer"
  | "industrial"
  | "energy"
  | "construction"
  | "rail"
  | "defense"
  | "robotics"
  | "oil_gas"
  | "mining"
  | "water_treatment"
  | "processing"
  | "agriculture"
  | "furniture"
  | "sporting"
  | "packaging"
  | "general"

const INDUSTRY_KEYWORDS: Record<IndustryDomain, string[]> = {
  marine: [
    "boat", "ship", "vessel", "hull", "keel", "rudder", "sailing", "yacht",
    "dinghy", "catamaran", "outboard", "marine", "watercraft", "pontoon",
    "kayak", "canoe", "submarine", "propeller shaft", "bilge", "deck",
    "mooring", "anchor", "mast", "rigging", "navigation buoy", "liferaft",
  ],
  automotive: [
    "car", "vehicle", "truck", "suv", "sedan", "bumper", "chassis",
    "dashboard", "windshield", "airbag", "seatbelt", "brake", "suspension",
    "transmission", "exhaust", "headlight", "fender", "motorcycle",
    "ev charging", "steering wheel", "axle", "differential", "catalytic",
    "crumple zone", "roll cage",
  ],
  aerospace: [
    "aircraft", "airplane", "wing", "fuselage", "landing gear", "propeller",
    "avionics", "satellite", "rocket", "turbine", "airfoil", "drone",
    "uav", "glider", "helicopter", "rotor", "nacelle", "empennage",
    "radome", "flight control", "quadcopter", "multirotor", "fpv",
    "esc", "flight controller", "gimbal", "payload bay",
  ],
  medical: [
    "medical device", "implant", "prosthetic", "surgical", "diagnostic",
    "biocompatible", "steriliz", "catheter", "stent", "syringe",
    "ventilator", "defibrillator", "patient", "clinical", "endoscope",
    "insulin pump", "heart rate", "blood pressure", "orthopedic",
    "dental", "hearing aid", "wheelchair",
  ],
  consumer: [
    "consumer electronics", "phone case", "headphones", "speaker",
    "smart home", "appliance", "toaster", "blender", "vacuum",
    "remote control", "charger", "power bank", "led lamp", "fan",
    "wearable", "smartwatch", "fitness tracker", "earbuds",
    "pcb", "printed circuit board", "circuit board", "solder", "trace width",
    "via", "layer stackup", "smt", "surface mount", "through-hole",
    "copper pour", "impedance control", "gerber",
    "computer", "motherboard", "gpu", "cpu cooler", "server rack",
    "atx", "mini-itx", "pcie", "ram", "ssd enclosure", "nas",
    "laptop", "desktop case", "data center",
  ],
  industrial: [
    "factory", "conveyor", "robotic arm", "tooling", "jig", "fixture",
    "cnc", "lathe", "press", "stamping die", "injection mold",
    "assembly line", "material handling", "forklift", "hoist",
    "compressor", "pump station", "industrial control",
    "amr", "autonomous mobile robot", "agv", "automated guided vehicle",
    "asrs", "automated storage", "retrieval system", "stacker crane",
    "belt conveyor", "roller conveyor", "sortation", "palletizer",
    "pick and place", "warehouse automation", "intralogistics",
  ],
  robotics: [
    "robot", "actuator", "gripper", "servo", "stepper motor",
    "collaborative robot", "cobot", "lidar mount",
    "end effector", "mobile robot",
  ],
  energy: [
    "solar panel", "wind turbine", "battery pack", "generator",
    "transformer", "inverter", "photovoltaic", "energy storage",
    "fuel cell", "power converter", "charge controller", "turbine blade",
    "lithium ion", "lithium battery", "battery cell", "battery module",
    "bms", "battery management", "thermal runaway", "cell balancing",
    "heat sink", "thermal management", "cooling system",
    "thermal interface", "heat pipe", "thermoelectric",
    "solar tracker",
  ],
  construction: [
    "building", "bridge", "beam", "column", "truss", "foundation",
    "concrete", "rebar", "structural steel", "scaffolding", "formwork",
    "hvac duct", "plumbing", "railing", "staircase",
    "house", "apartment", "roof", "wall framing", "insulation",
    "window frame", "door frame", "floor joist", "timber frame",
    "cladding", "damp proof", "waterproofing",
    "flashing", "weatherproofing", "sealant", "vapor barrier",
    "tanking", "flat roof", "pitched roof", "guttering", "downpipe",
  ],
  rail: [
    "train", "railway", "locomotive", "rail car", "bogie", "pantograph",
    "signaling", "track", "sleeper", "coupling", "buffer",
  ],
  defense: [
    "military", "armor", "ballistic", "weapon", "munition", "tactical",
    "mil-spec", "camouflage", "helmet", "body armor", "vehicle armor",
    "radar housing",
  ],
  oil_gas: [
    "pipeline", "wellhead", "drill", "refinery", "offshore platform",
    "subsea", "valve tree", "christmas tree", "flare stack", "separator",
    "storage tank", "lng", "petrochemical", "oil rig", "blowout preventer",
  ],
  mining: [
    "mining", "excavator", "crusher", "conveyor belt", "ore",
    "underground", "ventilation shaft", "drilling rig", "haul truck",
    "screening", "tailings", "mineral processing",
    "brine", "lithium extraction", "evaporation pond", "leaching",
    "hydrometallurgy", "mineral recovery", "salt flat", "salar",
  ],
  water_treatment: [
    "water treatment", "sewage", "wastewater", "filtration", "desalination",
    "chlorination", "settling tank", "aeration", "sludge", "membrane",
    "reverse osmosis", "drinking water", "pipe network", "reservoir",
  ],
  processing: [
    "chemical plant", "reactor", "distillation", "heat exchanger",
    "pressure vessel", "piping", "process equipment", "mixing tank",
    "centrifuge", "evaporator", "autoclave", "fermentation",
    "pharmaceutical", "cleanroom",
  ],
  agriculture: [
    "tractor", "harvester", "irrigation", "plough", "seeder", "sprayer",
    "greenhouse", "farm equipment", "silo", "grain", "livestock",
    "milking machine", "food processing",
    "insect farming", "black soldier fly", "bsf", "larvae", "insect rearing",
    "bioconversion", "frass", "insect protein", "mealworm",
    "aquaponics", "hydroponics", "vertical farm",
  ],
  furniture: [
    "chair", "table", "desk", "shelf", "cabinet", "bookcase", "bed frame",
    "sofa", "bench", "stool", "wardrobe", "drawer", "crib", "high chair",
  ],
  sporting: [
    "bicycle", "surfboard", "ski", "snowboard", "climbing",
    "sports helmet", "bike helmet", "cycling helmet",
    "kayak paddle", "golf club", "tennis racket", "skateboard",
    "paraglider", "hang glider", "scuba", "wetsuit",
  ],
  packaging: [
    "container", "box", "bottle", "can", "carton", "crate", "pallet",
    "blister pack", "shrink wrap", "label", "shipping container",
  ],
  general: [],
}

/**
 * Detects the most likely industry domain from a product description.
 *
 * @param text - Product description, research report, or combined context
 * @returns Top-scoring IndustryDomain (falls back to "general")
 */
export function detectIndustryDomain(text: string): IndustryDomain {
  const lower = text.toLowerCase()
  let bestDomain: IndustryDomain = "general"
  let bestScore = 0

  // DECISION: Fixed iteration order for deterministic tie-breaking.
  // More specific domains checked first so "drone for mining" → mining (not aerospace).
  const DOMAIN_PRIORITY: IndustryDomain[] = [
    "medical", "aerospace", "marine", "automotive", "defense",
    "oil_gas", "mining", "water_treatment", "processing", "rail",
    "robotics", "energy", "construction", "agriculture",
    "industrial", "consumer", "furniture", "sporting", "packaging",
  ]

  for (const domain of DOMAIN_PRIORITY) {
    const keywords = INDUSTRY_KEYWORDS[domain]
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestDomain = domain
    }
  }

  return bestDomain
}

/**
 * Extracts product-level keywords from text for standards tag matching.
 *
 * @param text - Product description
 * @returns Array of lowercase keywords found in the text
 */
export function extractProductKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  const found = new Set<string>()
  for (const keywords of Object.values(INDUSTRY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) found.add(kw)
    }
  }
  return [...found]
}
