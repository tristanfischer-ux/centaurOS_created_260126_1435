/**
 * @file module-assignment-validator.ts
 *
 * UNIVERSAL-ROBUSTNESS FIX (2026-05-10): Module assignment plausibility
 * validation. Runs after Module Decomposition to catch parts placed in the
 * wrong module (e.g. HVAC Fan Coil in Structural Frame, BMS in ISO Container).
 *
 * Architecture:
 * - Each part name maps to one of 7 functional categories: electronic, thermal,
 *   electrical_distribution, fluid, structural, safety, software.
 * - Each module name maps to a set of expected part categories.
 * - Parts whose category is not in their module's expected set are flagged as
 *   misassigned.
 *
 * This is a DETERMINISTIC validator (no LLM) — it runs in < 5 ms.
 * Results are warnings only — they do not block the pipeline.
 */

export interface ModuleAssignmentWarning {
  partName: string
  moduleName: string
  partCategory: string
  suggestedModule: string
  reasoning: string
}

export interface ModuleAssignmentResult {
  warnings: ModuleAssignmentWarning[]
  checkedCount: number
  warningCount: number
}

// ── Part category classifier ─────────────────────────────────────────────────
// Maps keywords in a part name to a functional category.
// Order matters: more specific patterns first.

interface CategoryRule {
  regex: RegExp
  category: string
}

const PART_CATEGORY_RULES: CategoryRule[] = [
  // Safety — must come before thermal/electrical to avoid misclassification
  { regex: /fire.?(suppression|detection|system|alarm|extinguish)|smoke.?detect|novec|fm-200|aerosol|suppression.?agent/i, category: 'safety' },
  { regex: /arc.?flash|arc.?detect|emergency.?shutdown|e-stop|safety.?relay|pressure.?relief|prv|burst.?disc|drop.?weight|recovery.?beacon|parachute/i, category: 'safety' },
  { regex: /leak.?detect|moisture.?sensor|water.?ingress/i, category: 'safety' },

  // Thermal — HVAC, cooling, heat exchange
  { regex: /hvac|fan.?coil|dehumidif|cooling|chiller|heat.?exchanger|thermal.?management|refrigerant|compressor|evaporator|condenser|expansion.?valve|heat.?pump/i, category: 'thermal' },

  // Electrical distribution
  { regex: /busbar|contactor|switchgear|transformer|circuit.?breaker|acb|inverter|pcs|converter|vfd|drive|ups|battery.?charger/i, category: 'electrical_distribution' },

  // Fluid / hydronic
  { regex: /pump|valve|manifold|fertigation|nutrient|irrigation|hydroponic|co2.?dosing|sparger|sterilisation|sip|cip|dosing/i, category: 'fluid' },

  // Electronic / sensing / controls
  { regex: /bms|battery.?management|ems|energy.?management|controller|sensor|hmi|scada|plc|pcb|microcontroller|ble|radio|gps|imu|beacon|telemetry|flight.?controller|esc|electronic.?speed/i, category: 'electronic' },

  // Structural / mechanical
  { regex: /frame|chassis|enclosure|housing|rack|grow.?rack|tray|tier|shelf|panel|plate|bracket|fastener|bolt|screw|washer|bushing|bearing|mount|structural|foundation|container|cabinet|insulation/i, category: 'structural' },

  // Software / firmware
  { regex: /firmware|software|licence|algorithm|ip.?core/i, category: 'software' },

  // Electrical — general (catch-all for components not caught above)
  { regex: /battery|cell|capacitor|resistor|diode|relay|switch|led|light|lighting|solar|motor|propeller|thruster/i, category: 'electronic' },
]

function classifyPartCategory(partName: string): string {
  const n = partName.toLowerCase()
  for (const { regex, category } of PART_CATEGORY_RULES) {
    if (regex.test(n)) return category
  }
  return 'unknown'
}

// ── Module expected categories ───────────────────────────────────────────────
// Maps keywords in a module name to which part categories are expected there.
// A module can accept multiple part categories.

interface ModuleExpectation {
  regex: RegExp
  acceptedCategories: string[]
  suggestFor: Record<string, string> // partCategory → suggested module name
}

const MODULE_EXPECTATIONS: ModuleExpectation[] = [
  {
    regex: /battery|cell|pack|rack|energy.?storage|lfp|lithium/i,
    acceptedCategories: ['electronic', 'electrical_distribution', 'thermal', 'structural', 'safety'],
    suggestFor: { fluid: 'Liquid Cooling Loop', software: 'EMS / Controls Module' },
  },
  {
    regex: /structural|chassis|frame|container|enclosure|housing/i,
    acceptedCategories: ['structural'],
    // These categories should NOT be in structural:
    suggestFor: {
      thermal: 'HVAC / Thermal Management Module',
      electronic: 'Controls & Monitoring Module',
      safety: 'Fire Safety Module',
      electrical_distribution: 'Power Electronics Module',
      fluid: 'Liquid Cooling / Hydronic Module',
    },
  },
  {
    regex: /thermal|hvac|cooling|heat.?exchanger|climate|refriger/i,
    acceptedCategories: ['thermal', 'fluid', 'electronic', 'structural'],
    suggestFor: { electrical_distribution: 'Power Electronics Module', safety: 'Fire Safety Module' },
  },
  {
    regex: /power.?electronics|pcs|inverter|converter|switchgear|transformer|electrical.?distribution/i,
    acceptedCategories: ['electrical_distribution', 'electronic', 'structural', 'safety'],
    suggestFor: { thermal: 'Thermal Management Module', fluid: 'Liquid Cooling Module' },
  },
  {
    regex: /fire|suppression|safety/i,
    acceptedCategories: ['safety', 'electronic', 'structural'],
    suggestFor: { thermal: 'HVAC / Thermal Module', fluid: 'Liquid Cooling Module', electrical_distribution: 'Power Electronics Module' },
  },
  {
    regex: /control|monitor|ems|bms|sensor|hmi|scada|plc|avionics|navigation/i,
    acceptedCategories: ['electronic', 'software', 'structural'],
    suggestFor: { thermal: 'Thermal Management Module', safety: 'Fire Safety Module', electrical_distribution: 'Power Electronics Module' },
  },
  {
    regex: /grow|lighting|horticultural|photosynthes|led.?light|grow.?light/i,
    acceptedCategories: ['electronic', 'structural', 'electrical_distribution'],
    suggestFor: { thermal: 'HVAC / Climate Control Module', fluid: 'Fertigation / Hydronic Module', safety: 'Fire Detection Module' },
  },
  {
    regex: /fertigation|nutrient|hydronic|irrigation|co2|dosing|fluid|pump/i,
    acceptedCategories: ['fluid', 'electronic', 'structural'],
    suggestFor: { thermal: 'HVAC / Climate Control Module', electrical_distribution: 'Power Electronics Module', safety: 'Safety Module' },
  },
  {
    regex: /propulsion|thrust|motor|actuator|drive/i,
    acceptedCategories: ['electronic', 'electrical_distribution', 'structural'],
    suggestFor: { thermal: 'Thermal Management Module', safety: 'Safety Module' },
  },
]

function getModuleExpectation(moduleName: string): ModuleExpectation | null {
  const n = moduleName.toLowerCase()
  for (const exp of MODULE_EXPECTATIONS) {
    if (exp.regex.test(n)) return exp
  }
  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

interface PartLike {
  name: string
  role?: string
}

interface ModuleLike {
  name: string
  id: string
  keyParts?: string[]
  expected_parts?: PartLike[]
}

/**
 * Validate that each part in each module is plausibly assigned.
 *
 * Returns a list of warnings for misassigned parts. Never throws.
 * Safe to call in any pipeline path.
 */
export function validateModuleAssignments(modules: ModuleLike[]): ModuleAssignmentResult {
  const warnings: ModuleAssignmentWarning[] = []
  let checkedCount = 0

  for (const mod of modules) {
    const modExpectation = getModuleExpectation(mod.name)
    if (!modExpectation) continue // module type unrecognised — skip

    // Collect parts from both legacy keyParts (string[]) and PA expected_parts (PartLike[])
    const parts: string[] = []
    if (Array.isArray(mod.keyParts)) {
      for (const p of mod.keyParts) {
        if (typeof p === 'string') parts.push(p)
      }
    }
    if (Array.isArray(mod.expected_parts)) {
      for (const p of mod.expected_parts) {
        if (p && typeof p.name === 'string') parts.push(p.name)
      }
    }

    for (const partName of parts) {
      checkedCount++
      const partCategory = classifyPartCategory(partName)
      if (partCategory === 'unknown') continue // can't classify — skip

      if (!modExpectation.acceptedCategories.includes(partCategory)) {
        const suggestedModule = modExpectation.suggestFor[partCategory] || 'a dedicated functional module'
        warnings.push({
          partName,
          moduleName: mod.name,
          partCategory,
          suggestedModule,
          reasoning:
            `"${partName}" is classified as ${partCategory} but assigned to module "${mod.name}" ` +
            `which expects ${modExpectation.acceptedCategories.join('/')} parts. ` +
            `Consider moving to ${suggestedModule}.`,
        })
      }
    }
  }

  return {
    warnings,
    checkedCount,
    warningCount: warnings.length,
  }
}
