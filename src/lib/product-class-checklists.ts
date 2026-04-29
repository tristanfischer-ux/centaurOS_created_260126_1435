/**
 * @file product-class-checklists.ts — Post-decomposition completeness heuristics.
 *
 * @description After Max produces the module decomposition, the engine checks
 * the result against a known-good module checklist for the detected product
 * class. Missing modules are surfaced as decomposition gaps — WARNING-level
 * findings in the feasibility verdict (not blocking, because the checklist is
 * a heuristic and Max may have legitimately renamed or merged modules).
 *
 * Detection is fuzzy: we match the project subject and module names against
 * keyword sets, not exact strings. A confidence threshold prevents false
 * positives when the project is ambiguous.
 *
 * Product classes supported in this version:
 *   - High-Altitude Pseudo-Satellite (HAPS)
 *   - Battery Energy Storage System (BESS)
 *   - Seawater Reverse Osmosis (SWRO)
 *   - Vertical Farm
 *   - Consumer Device
 *
 * No acronyms in user-facing strings. Every module name is spelled out.
 */

// ─── Types ──────────────────────────────────────────────────────────────

/** A single expected module entry in a product-class checklist. */
export interface ChecklistModule {
    /** Canonical long-form name shown in gap messages. */
    canonicalName: string
    /** Fuzzy-match keywords — if any module name contains one of these, this
     *  checklist entry is considered present. Lower-cased for comparison. */
    keywords: string[]
}

export interface ProductClassDefinition {
    /** Human-readable class name (no acronyms). */
    className: string
    /** Keywords that, when found in the project subject OR a module name, suggest
     *  this product class. Three or more hits confirms the class. */
    subjectKeywords: string[]
    /** Module-level keywords that also confirm the product class (in addition to
     *  subject keywords — a strong module-level signal can confirm alone). */
    moduleKeywords: string[]
    /** The full checklist of expected modules. */
    checklist: ChecklistModule[]
}

export interface DecompositionGap {
    /** The product class that was detected. */
    productClass: string
    /** Confidence score 0-1 (based on keyword hits). */
    confidence: number
    /** Canonical names of expected modules that are missing. */
    missingModules: string[]
}

// ─── Product class definitions ──────────────────────────────────────────

export const PRODUCT_CLASS_DEFINITIONS: ProductClassDefinition[] = [
    {
        className: "High-Altitude Pseudo-Satellite",
        subjectKeywords: [
            "haps",
            "high altitude pseudo",
            "pseudo-satellite",
            "pseudosatellite",
            "stratospheric",
            "high altitude platform",
            "hale",
            "high altitude long endurance",
        ],
        moduleKeywords: [
            "solar array",
            "solar cell",
            "ground control",
            "datalink",
            "communications link",
            "pseudo-satellite",
        ],
        checklist: [
            {
                canonicalName: "airframe and structure",
                keywords: ["airframe", "fuselage", "structure", "wing", "spar", "boom"],
            },
            {
                canonicalName: "propulsion",
                keywords: ["propulsion", "motor", "propeller", "thruster", "drive"],
            },
            {
                canonicalName: "solar array",
                keywords: ["solar array", "solar cell", "photovoltaic", "pv panel", "solar panel"],
            },
            {
                canonicalName: "battery and energy storage",
                keywords: ["battery", "energy storage", "lithium", "cell pack", "accumulator"],
            },
            {
                canonicalName: "avionics and flight control",
                keywords: ["avionics", "flight control", "autopilot", "flight computer", "imu", "inertial", "gnss", "navigation"],
            },
            {
                canonicalName: "payload",
                keywords: ["payload", "sensor", "camera", "imager", "sar", "lidar", "mission system"],
            },
            {
                canonicalName: "ground control station",
                keywords: ["ground control", "ground station", "gcs", "control station", "operator console"],
            },
            {
                canonicalName: "communications and data link",
                keywords: ["communications", "datalink", "data link", "radio", "telemetry", "satcom", "comms"],
            },
            {
                canonicalName: "launch and recovery",
                keywords: ["launch", "recovery", "take-off", "takeoff", "landing", "retrieval"],
            },
        ],
    },
    {
        className: "Battery Energy Storage System",
        subjectKeywords: [
            "bess",
            "battery energy storage",
            "battery storage",
            "grid storage",
            "utility storage",
            "energy storage system",
        ],
        moduleKeywords: [
            "battery management",
            "bms",
            "inverter",
            "power conversion",
            "grid connection",
        ],
        checklist: [
            {
                canonicalName: "battery modules",
                keywords: ["battery module", "battery pack", "cell module", "battery rack", "battery string"],
            },
            {
                canonicalName: "battery management system",
                keywords: ["battery management", "bms", "cell monitoring", "state of charge"],
            },
            {
                canonicalName: "thermal management",
                keywords: ["thermal", "cooling", "hvac", "heat", "temperature control"],
            },
            {
                canonicalName: "power conversion and inverter",
                keywords: ["inverter", "power conversion", "converter", "pcs", "power electronics"],
            },
            {
                canonicalName: "enclosure and container",
                keywords: ["enclosure", "container", "cabinet", "housing", "rack"],
            },
            {
                canonicalName: "fire suppression",
                keywords: ["fire suppression", "fire detection", "suppression", "fire protection", "sprinkler"],
            },
            {
                canonicalName: "monitoring and control",
                keywords: ["monitoring", "scada", "control system", "energy management", "ems"],
            },
            {
                canonicalName: "grid connection",
                keywords: ["grid connection", "grid interface", "point of common coupling", "pcc", "transformer", "switchgear"],
            },
        ],
    },
    {
        className: "Seawater Reverse Osmosis",
        subjectKeywords: [
            "swro",
            "seawater reverse osmosis",
            "desalination",
            "reverse osmosis",
            "desal",
            "brine",
            "potable water",
        ],
        moduleKeywords: [
            "membrane",
            "high pressure pump",
            "energy recovery",
            "pre-treatment",
            "post-treatment",
        ],
        checklist: [
            {
                canonicalName: "pre-treatment",
                keywords: ["pre-treatment", "pretreatment", "filtration", "screening", "clarifier", "coagulation"],
            },
            {
                canonicalName: "high-pressure pump",
                keywords: ["high pressure pump", "high-pressure pump", "hppu", "booster pump", "feed pump"],
            },
            {
                canonicalName: "membrane array",
                keywords: ["membrane", "ro membrane", "pressure vessel", "element", "module array"],
            },
            {
                canonicalName: "energy recovery",
                keywords: ["energy recovery", "pressure exchanger", "isobaric", "turbocharger", "energy recycling"],
            },
            {
                canonicalName: "post-treatment",
                keywords: ["post-treatment", "post treatment", "remineralisation", "remineralization", "disinfection", "chlorination"],
            },
            {
                canonicalName: "instrumentation and control",
                keywords: ["instrumentation", "control system", "plc", "scada", "flow meter", "pressure transmitter"],
            },
            {
                canonicalName: "intake and outfall",
                keywords: ["intake", "outfall", "brine discharge", "seawater intake", "subsea intake"],
            },
            {
                canonicalName: "enclosure and container",
                keywords: ["enclosure", "container", "building", "skid", "shelter"],
            },
        ],
    },
    {
        className: "Vertical Farm",
        subjectKeywords: [
            "vertical farm",
            "vertical farming",
            "indoor farm",
            "controlled environment agriculture",
            "cea",
            "hydroponic",
            "aeroponic",
        ],
        moduleKeywords: [
            "grow light",
            "nutrient delivery",
            "climate control",
            "grow rack",
            "growing system",
        ],
        checklist: [
            {
                canonicalName: "growing system and racking",
                keywords: ["grow rack", "racking", "growing tower", "tray system", "hydroponic system", "aeroponic", "growing layer"],
            },
            {
                canonicalName: "lighting",
                keywords: ["lighting", "led light", "grow light", "luminaire", "light fixture"],
            },
            {
                canonicalName: "climate control and ventilation",
                keywords: ["climate control", "hvac", "ventilation", "cooling", "dehumidification", "air handling"],
            },
            {
                canonicalName: "irrigation and nutrient delivery",
                keywords: ["irrigation", "nutrient delivery", "fertigation", "nutrient solution", "dosing", "water pump"],
            },
            {
                canonicalName: "monitoring and control",
                keywords: ["monitoring", "control system", "sensor", "environmental monitoring", "automation"],
            },
            {
                canonicalName: "power distribution",
                keywords: ["power distribution", "electrical distribution", "mains supply", "power supply", "panel board"],
            },
            {
                canonicalName: "enclosure and container",
                keywords: ["enclosure", "container", "building", "warehouse", "glasshouse", "shell"],
            },
        ],
    },
    {
        className: "Consumer Device",
        subjectKeywords: [
            "consumer device",
            "consumer product",
            "wearable",
            "handheld",
            "smart device",
            "iot device",
            "personal device",
        ],
        moduleKeywords: [
            "printed circuit board",
            "display",
            "battery",
            "firmware",
            "enclosure",
        ],
        checklist: [
            {
                canonicalName: "housing and enclosure",
                keywords: ["housing", "enclosure", "casing", "shell", "body", "chassis"],
            },
            {
                canonicalName: "electronics and printed circuit board",
                keywords: ["electronics", "pcb", "printed circuit", "board", "microcontroller", "processor"],
            },
            {
                canonicalName: "power supply",
                keywords: ["power supply", "battery", "charger", "power management", "pmic", "usb power"],
            },
            {
                canonicalName: "user interface",
                keywords: ["user interface", "display", "screen", "button", "touchscreen", "speaker", "haptic"],
            },
            {
                canonicalName: "connectivity",
                keywords: ["connectivity", "wireless", "bluetooth", "wifi", "wi-fi", "nfc", "cellular", "radio"],
            },
        ],
    },
]

// ─── Detection and gap checking ─────────────────────────────────────────

/**
 * Normalises a string to lower-case with whitespace collapsed, for fuzzy
 * keyword matching.
 */
function normalise(s: string): string {
    return s.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Returns the number of subject keywords from a product class definition
 * that appear in either the project subject text or the set of module names.
 */
function countKeywordHits(
    def: ProductClassDefinition,
    subjectText: string,
    moduleNames: string[],
): number {
    const normSubject = normalise(subjectText)
    const normModules = moduleNames.map(normalise)

    let hits = 0
    for (const kw of def.subjectKeywords) {
        if (normSubject.includes(kw)) hits += 1
    }
    for (const kw of def.moduleKeywords) {
        if (normModules.some((m) => m.includes(kw))) hits += 1
    }
    return hits
}

/**
 * Detects the product class from the project subject and module names.
 *
 * Returns the best-matching class definition and a confidence score (0–1),
 * or null when no class reaches the minimum confidence threshold.
 *
 * Confidence formula: keyword hits / (total subject + module keywords).
 * Minimum confidence to report: 0.15 (at least ~1.5 keyword hits on a
 * typical 10-keyword class definition). This prevents false positives when
 * a generic project happens to contain one relevant word.
 */
export function detectProductClass(
    subject: string,
    moduleNames: string[],
): { definition: ProductClassDefinition; confidence: number } | null {
    const MIN_CONFIDENCE = 0.15

    let bestDef: ProductClassDefinition | null = null
    let bestScore = 0

    for (const def of PRODUCT_CLASS_DEFINITIONS) {
        const totalKeywords = def.subjectKeywords.length + def.moduleKeywords.length
        const hits = countKeywordHits(def, subject, moduleNames)
        const confidence = totalKeywords > 0 ? hits / totalKeywords : 0
        if (confidence > bestScore) {
            bestScore = confidence
            bestDef = def
        }
    }

    if (!bestDef || bestScore < MIN_CONFIDENCE) return null
    return { definition: bestDef, confidence: bestScore }
}

/**
 * Checks whether each expected module in the checklist is accounted for in
 * the actual module list. Uses the same fuzzy keyword matching as detection.
 *
 * Returns a `DecompositionGap` when at least one module is missing, or null
 * when all checklist entries are covered.
 */
export function checkDecompositionCompleteness(
    subject: string,
    moduleNames: string[],
): DecompositionGap | null {
    const detection = detectProductClass(subject, moduleNames)
    if (!detection) return null

    const { definition, confidence } = detection
    const normModules = moduleNames.map(normalise)

    const missingModules: string[] = []
    for (const entry of definition.checklist) {
        const isPresent = entry.keywords.some((kw) =>
            normModules.some((m) => m.includes(kw)),
        )
        if (!isPresent) {
            missingModules.push(entry.canonicalName)
        }
    }

    if (missingModules.length === 0) return null

    return {
        productClass: definition.className,
        confidence,
        missingModules,
    }
}
