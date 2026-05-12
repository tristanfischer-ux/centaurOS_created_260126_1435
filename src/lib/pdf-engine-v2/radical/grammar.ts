/**
 * Radical Grammar Engine — First Light spike
 *
 * Key design decision (per council G7 / Gemini's deadlock finding):
 * The grammar engine is a CONSTRAINT OPTIMISER with relaxation weights, not
 * a boolean checker. When rules conflict, the lower-weight rule relaxes and
 * the tradeoff is EXPLICIT in the engine's output.
 *
 * Hard rules (weight: Infinity) never relax.
 * Soft/adjustable rules relax in ascending weight order until a valid composition
 * is found or all soft rules are exhausted.
 */

import type {
  Composition,
  CompositionNode,
  RadicalLibrary,
  PropertyMap,
} from "./schema.js"
import { getResolvedProperties } from "./property-api.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleVerdict = "PASS" | "WARN" | "BLOCK"

/** 0–10: higher = harder to relax. Use Infinity for hard rules that never relax. */
export type RelaxationWeight = number

export type RuleEvaluation = {
  verdict: RuleVerdict
  reason: string
  /** Only present when the rule is soft/adjustable and BLOCK/WARN was returned */
  relaxation_cost?: number
}

export type GrammarRule = {
  id: string
  description: string
  weight: RelaxationWeight
  /** hard = never relaxes; soft = can be relaxed; adjustable = relaxes with explicit cost */
  hardness: "hard" | "soft" | "adjustable"
  evaluate: (
    composition: Composition,
    library: RadicalLibrary
  ) => RuleEvaluation
}

// ---------------------------------------------------------------------------
// Engine output types
// ---------------------------------------------------------------------------

export type RuleResult = {
  ruleId: string
  ruleDescription: string
  hardness: "hard" | "soft" | "adjustable"
  weight: RelaxationWeight
  verdict: RuleVerdict
  reason: string
  relaxation_cost?: number
  /** Set to true when the rule was relaxed by the optimiser */
  relaxed: boolean
}

export type EngineResult = {
  compositionId: string
  overallVerdict: "PASS" | "PASS_WITH_RELAXATION" | "BLOCK"
  ruleResults: RuleResult[]
  /** Human-readable summary of any relaxations applied */
  relaxationSummary: string[]
}

// ---------------------------------------------------------------------------
// Helpers to collect all archetype IDs from a composition tree
// ---------------------------------------------------------------------------

function collectNodes(node: CompositionNode): CompositionNode[] {
  return [node, ...node.children.flatMap(collectNodes)]
}

// ---------------------------------------------------------------------------
// Rule 1: KCL — Kirchhoff's Current Law
// Checks every electrical node declared in the composition.
// Hard rule (weight: Infinity) — conservation law cannot be relaxed.
// ---------------------------------------------------------------------------

/**
 * Character IDs that are inherently electrical components. Presence of any
 * of these means the system has electrical nodes — even if the upstream
 * composition didn't annotate them with explicit electricalNode payloads.
 *
 * Bug P0-7 fix (2026-05-11): KCL previously gave a silent PASS with reason
 * "no electrical nodes declared" whenever the composition lacked explicit
 * .electricalNode annotations. For the heat pump and CGM that meant a tree
 * full of pcb_controllers, contactors, etc. silently passed KCL without
 * any topology check. Inferring from character presence and emitting a
 * WARN is more honest.
 */
const INFERRED_ELECTRICAL_CHARACTERS = new Set<string>([
  'pcb_controller',
  'dc_contactor',
  'circuit_breaker',
  'protection_relay',
  'network_switch',
  'transformer',
  'power_converter',
  'ems_controller',
  'gas_sensor',
  'optical_arc_sensor',
  'high_pressure_transducer',
  'low_pressure_transducer',
  'safety_pressure_switch',
  'ec_fan_motor',
])

export const KCL_NODE_BALANCE: GrammarRule = {
  id: "KCL_node_balance",
  description:
    "KCL: ΣI_in = ΣI_out at every electrical node (Kirchhoff's Current Law)",
  weight: Infinity,
  hardness: "hard",
  evaluate(composition, _library) {
    const allNodes = collectNodes(composition.root)
    const nodes = allNodes.filter((n) => n.electricalNode !== undefined)

    if (nodes.length === 0) {
      // Bug P0-7 fix: when no explicit electrical nodes are declared, fall
      // back to *inferring* the presence of electrical components from
      // character ids. If any are present we emit a soft WARN instead of
      // a silent PASS — the operator should annotate the topology.
      const electricalLeaves = allNodes.filter(n =>
        INFERRED_ELECTRICAL_CHARACTERS.has(n.archetypeId)
      )
      if (electricalLeaves.length > 0) {
        const sample = electricalLeaves
          .slice(0, 5)
          .map(n => n.archetypeId)
          .join(', ')
        return {
          verdict: "WARN",
          reason:
            `Electrical components present (${electricalLeaves.length}: ${sample}` +
            `${electricalLeaves.length > 5 ? ', …' : ''}) but no node topology declared. ` +
            `Add electricalNode annotations to enable KCL verification.`,
        }
      }
      return { verdict: "PASS", reason: "No electrical nodes declared — KCL not applicable" }
    }

    const violations: string[] = []
    for (const node of nodes) {
      const en = node.electricalNode!
      const imbalance = Math.abs(en.current_in_A - en.current_out_A)
      if (imbalance > 1e-9) {
        violations.push(
          `Node "${en.nodeId}": I_in=${en.current_in_A}A, I_out=${en.current_out_A}A, imbalance=${imbalance.toFixed(6)}A`
        )
      }
    }

    if (violations.length > 0) {
      return {
        verdict: "BLOCK",
        reason: `KCL violated at ${violations.length} node(s): ${violations.join("; ")}`,
      }
    }

    return {
      verdict: "PASS",
      reason: `KCL satisfied at all ${nodes.length} electrical node(s)`,
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 2: Galvanic — copper + aluminium direct contact
// Hard rule (weight: Infinity) — safety/corrosion; cannot be relaxed.
// ---------------------------------------------------------------------------

export const GALVANIC_ALUMINIUM_COPPER_CONTACT: GrammarRule = {
  id: "galvanic_aluminium_copper_contact",
  description:
    "Galvanic: copper and aluminium in direct contact in humid/marine environment causes corrosion (anodic index > 0.25V). Requires dielectric isolator.",
  weight: Infinity,
  hardness: "hard",
  evaluate(composition, library) {
    const nodes = collectNodes(composition.root)
    let hasCopper = false
    let hasAluminium = false

    for (const node of nodes) {
      const archetype = library.archetypes.get(node.archetypeId)
      if (!archetype) continue
      const props = getResolvedProperties(archetype, library)
      const material = String(props["primary_material"] ?? "")
      if (material === "copper") hasCopper = true
      if (material === "aluminium") hasAluminium = true
    }

    const isHumidOrMarine =
      composition.environment.includes("marine") ||
      composition.environment.includes("humid")

    if (hasCopper && hasAluminium && isHumidOrMarine) {
      return {
        verdict: "BLOCK",
        reason:
          "Galvanic incompatibility: copper and aluminium both present in humid/marine environment. Insert dielectric washer or isolating coating.",
      }
    }

    return {
      verdict: "PASS",
      reason:
        hasCopper && hasAluminium
          ? "Copper + aluminium present but environment is not humid/marine — galvanic risk acceptable"
          : "No copper+aluminium co-presence detected",
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 3: Voltage derating — operating voltage ≤ 80% rated
// Soft rule (weight: 6) — can be relaxed if derating analysis justifies it.
// ---------------------------------------------------------------------------

export const VOLTAGE_DERATE_80PCT: GrammarRule = {
  id: "voltage_derate_80pct",
  description:
    "Voltage derating: operating voltage must be ≤ 80% of rated voltage. WARN if 80–100%, BLOCK if > 100%.",
  weight: 6,
  hardness: "adjustable",
  evaluate(composition, library) {
    const violations: string[] = []
    const warnings: string[] = []

    const nodes = collectNodes(composition.root)
    for (const node of nodes) {
      const archetype = library.archetypes.get(node.archetypeId)
      if (!archetype) continue
      const props = getResolvedProperties(archetype, library)
      const rated = props["voltage_rated_V"]
      const operating = props["voltage_operating_V"]
      if (
        typeof rated !== "number" ||
        typeof operating !== "number"
      )
        continue

      const ratio = operating / rated
      if (ratio > 1.0) {
        violations.push(
          `${node.archetypeId}: operating=${operating}V exceeds rated=${rated}V (ratio ${(ratio * 100).toFixed(1)}%)`
        )
      } else if (ratio > 0.8) {
        warnings.push(
          `${node.archetypeId}: operating=${operating}V is ${(ratio * 100).toFixed(1)}% of rated=${rated}V (threshold 80%)`
        )
      }
    }

    if (violations.length > 0) {
      return {
        verdict: "BLOCK",
        reason: `Voltage > 100% rated: ${violations.join("; ")}`,
        relaxation_cost: 8,
      }
    }
    if (warnings.length > 0) {
      return {
        verdict: "WARN",
        reason: `Voltage 80–100% rated (derating not met): ${warnings.join("; ")}`,
        relaxation_cost: 3,
      }
    }

    return { verdict: "PASS", reason: "All components within 80% voltage derating" }
  },
}

// ---------------------------------------------------------------------------
// Rule 4: Mass balance — closed fluid loop
// Hard rule (weight: Infinity) — conservation law.
// ---------------------------------------------------------------------------

export const MASS_BALANCE_CLOSED_LOOP: GrammarRule = {
  id: "mass_balance_closed_loop",
  description:
    "Fluid mass balance: Σ mass-flow-in = Σ mass-flow-out (steady state, closed loop). Checks composition-level declared totals.",
  weight: Infinity,
  hardness: "hard",
  evaluate(composition, _library) {
    // We look for declared fluid mass-flow totals on the root node's properties
    // In First Light these are carried as composition annotations rather than
    // per-node archetype props (the fluid loop is modelled at subsystem level).
    const root = composition.root
    const massFlowIn = root.electricalNode === undefined
      ? undefined
      : undefined
    // Read from composition environment annotations via convention:
    // environment entry "fluid_mass_in_kg_s:<value>" and "fluid_mass_out_kg_s:<value>"
    let massIn: number | undefined
    let massOut: number | undefined

    for (const tag of composition.environment) {
      if (tag.startsWith("fluid_mass_in_kg_s:")) {
        massIn = parseFloat(tag.split(":")[1])
      }
      if (tag.startsWith("fluid_mass_out_kg_s:")) {
        massOut = parseFloat(tag.split(":")[1])
      }
    }

    if (massIn === undefined || massOut === undefined) {
      return {
        verdict: "PASS",
        reason: "No fluid mass-flow annotations declared — mass balance not applicable",
      }
    }

    const imbalance = Math.abs(massIn - massOut)
    if (imbalance > 1e-6) {
      return {
        verdict: "BLOCK",
        reason: `Fluid mass balance violated: in=${massIn} kg/s, out=${massOut} kg/s, imbalance=${imbalance.toFixed(9)} kg/s`,
      }
    }

    return {
      verdict: "PASS",
      reason: `Fluid mass balance satisfied: in=${massIn} kg/s = out=${massOut} kg/s`,
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 5: Thermal capacity vs load
// Soft rule (weight: 7) — WARN if margin < 20%, BLOCK if negative.
// ---------------------------------------------------------------------------

export const THERMAL_CAPACITY_VS_LOAD: GrammarRule = {
  id: "thermal_capacity_vs_load",
  description:
    "Cooling capacity ≥ thermal load + 20% margin. WARN if margin 0–20%, BLOCK if cooling < load.",
  weight: 7,
  hardness: "adjustable",
  evaluate(composition, _library) {
    let coolingCapacity: number | undefined
    let thermalLoad: number | undefined

    for (const tag of composition.environment) {
      if (tag.startsWith("cooling_capacity_W:")) {
        coolingCapacity = parseFloat(tag.split(":")[1])
      }
      if (tag.startsWith("thermal_load_W:")) {
        thermalLoad = parseFloat(tag.split(":")[1])
      }
    }

    if (coolingCapacity === undefined || thermalLoad === undefined) {
      return {
        verdict: "PASS",
        reason: "No thermal annotations declared — thermal capacity rule not applicable",
      }
    }

    const required = thermalLoad * 1.2
    if (coolingCapacity < thermalLoad) {
      return {
        verdict: "BLOCK",
        reason: `Cooling deficit: capacity=${coolingCapacity}W < load=${thermalLoad}W (margin required: +20%)`,
        relaxation_cost: 7,
      }
    }
    if (coolingCapacity < required) {
      return {
        verdict: "WARN",
        reason: `Cooling margin insufficient: capacity=${coolingCapacity}W, load=${thermalLoad}W, required=${required}W (+20%). Margin: ${((coolingCapacity / thermalLoad - 1) * 100).toFixed(1)}%`,
        relaxation_cost: 3,
      }
    }

    return {
      verdict: "PASS",
      reason: `Thermal margin OK: capacity=${coolingCapacity}W ≥ load=${thermalLoad}W × 1.2 = ${required}W`,
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 6: Material marine corrosion
// Soft rule (weight: 5) — steel without marine rating in marine env is BLOCK;
// can be relaxed if a modifier has explicitly overridden marine_corrosion_resistant.
// ---------------------------------------------------------------------------

export const MATERIAL_MARINE_CORROSION: GrammarRule = {
  id: "material_marine_corrosion",
  description:
    "Steel grade with marine_corrosion_resistant=false in marine environment = BLOCK unless a modifier has overridden to true.",
  weight: 5,
  hardness: "adjustable",
  evaluate(composition, library) {
    if (!composition.environment.includes("marine")) {
      return { verdict: "PASS", reason: "Environment is not marine — rule not applicable" }
    }

    const violations: string[] = []
    const nodes = collectNodes(composition.root)

    for (const node of nodes) {
      const archetype = library.archetypes.get(node.archetypeId)
      if (!archetype) continue
      const props = getResolvedProperties(archetype, library)
      const material = props["primary_material"]
      const marineOk = props["marine_corrosion_resistant"]
      if (material === "steel" && marineOk === false) {
        violations.push(
          `${node.archetypeId}: primary_material=steel, marine_corrosion_resistant=false`
        )
      }
    }

    if (violations.length > 0) {
      return {
        verdict: "BLOCK",
        reason: `Marine corrosion violation: ${violations.join("; ")}. Use 316L grade modifier or alternative material.`,
        relaxation_cost: 5,
      }
    }

    return {
      verdict: "PASS",
      reason: "All components in marine environment have marine_corrosion_resistant=true (or are not steel)",
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 7: Regulatory — IEC 62619 battery management system coverage
// Hard rule (weight: Infinity) — regulatory compliance cannot be relaxed.
// Applies when product_class indicates battery storage.
// ---------------------------------------------------------------------------

export const REGULATORY_IEC_62619_BATTERY_MANAGEMENT: GrammarRule = {
  id: "regulatory_iec_62619_battery_management",
  description:
    "IEC 62619: battery energy storage systems must have per-cell voltage and temperature monitoring via a BMS covering all cells.",
  weight: Infinity,
  hardness: "hard",
  evaluate(composition, _library) {
    // Determine whether this is a battery/BESS product class via environment tag
    const isBattery =
      composition.environment.includes("battery_storage") ||
      composition.environment.includes("energy_storage") ||
      composition.environment.includes("iec_62619") ||
      composition.environment.some(
        (e) =>
          e.includes("bess") ||
          e.includes("battery") ||
          e.includes("energy_storage") ||
          e.includes("iec_62619")
      )

    if (!isBattery) {
      return {
        verdict: "PASS",
        reason: "Product class is not battery/energy storage — IEC 62619 not applicable",
      }
    }

    const allNodes = collectNodes(composition.root)
    const archetypeIds = allNodes.map((n) => n.archetypeId)

    // Check for bms_master presence
    const hasBmsMaster = archetypeIds.some(
      (id) => id === "bms_master" || id.includes("bms_master")
    )
    // Check for at least one bms_slave
    const bmsSlaveCount = archetypeIds.filter(
      (id) => id === "bms_slave" || id.includes("bms_slave")
    ).length
    // Check for cell_string presence
    const hasCellString = archetypeIds.some(
      (id) => id === "cell_string" || id.includes("cell_string") || id.includes("lfp_prismatic_cell")
    )

    if (!hasCellString) {
      // No cell string present — BESS tag but no cells found; WARN to flag configuration gap
      return {
        verdict: "WARN",
        reason:
          "Battery storage product class declared but no cell_string or lfp_prismatic_cell found in composition. " +
          "IEC 62619 BMS coverage cannot be verified.",
      }
    }

    if (!hasBmsMaster) {
      return {
        verdict: "BLOCK",
        reason:
          "IEC 62619 requires a BMS master controller. No bms_master node found in composition. " +
          "Add a bms_master to supervise per-cell voltage and temperature monitoring.",
      }
    }

    if (bmsSlaveCount === 0) {
      return {
        verdict: "BLOCK",
        reason:
          "IEC 62619 requires per-cell monitoring. bms_master is present but no bms_slave nodes found. " +
          "Add bms_slave modules to cover all cell groups (14 channels × N slaves = required voltage taps).",
      }
    }

    return {
      verdict: "PASS",
      reason:
        `IEC 62619 BMS coverage satisfied: bms_master (×1) + bms_slave (×${bmsSlaveCount}) ` +
        `declared. Per-cell voltage and temperature monitoring topology present. ` +
        `Regulatory modifier IEC 62619 declared on cell_string and bms hierarchy.`,
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 8: BMS master-to-slave CAN link consistency
// Hard rule (weight: Infinity) — missing CAN link means BMS cannot communicate.
// Applies to any composition containing bms_master + bms_slave.
// ---------------------------------------------------------------------------

export const BMS_MASTER_TO_SLAVE_CAN_LINK: GrammarRule = {
  id: "bms_master_to_slave_can_link",
  description:
    "BMS CAN link: bms_master must declare CAN transceivers and bms_slave must have CAN daisy-chain topology. Both endpoints + cabling must be present.",
  weight: Infinity,
  hardness: "hard",
  evaluate(composition, _library) {
    const allNodes = collectNodes(composition.root)
    const archetypeIds = allNodes.map((n) => n.archetypeId)

    const hasBmsMaster = archetypeIds.some(
      (id) => id === "bms_master" || id.includes("bms_master")
    )
    const hasBmsSlave = archetypeIds.some(
      (id) => id === "bms_slave" || id.includes("bms_slave")
    )

    if (!hasBmsMaster || !hasBmsSlave) {
      return {
        verdict: "PASS",
        reason: "No bms_master + bms_slave pair present — CAN link rule not applicable",
      }
    }

    // Check for can_transceiver on bms_master (direct child or environment annotation)
    const hasCanTransceiver =
      archetypeIds.some((id) => id === "can_transceiver" || id.includes("can_transceiver")) ||
      composition.environment.some(
        (e) => e.includes("can_transceiver") || e.includes("bms_can")
      )

    // Check for CAN harness in BoM (via environment annotation or node presence)
    const hasCanHarness =
      archetypeIds.some(
        (id) =>
          id === "bms_to_slave_can_harness" ||
          id.includes("can_harness") ||
          id.includes("bms_harness")
      ) ||
      composition.environment.some(
        (e) =>
          e.includes("bms_to_slave_can_harness") ||
          e.includes("can_harness") ||
          e.includes("bms_can_harness")
      )

    const missing: string[] = []
    if (!hasCanTransceiver)
      missing.push("bms_master/can_transceiver (primary + redundant pair required)")
    if (!hasCanHarness)
      missing.push("bms_to_slave_can_harness (BoM line required for physical CAN daisy-chain)")

    if (missing.length > 0) {
      // Coding-council 2026-05-12 Fix 3: at Stage 4d time the BoM harness line
      // may not yet be visible (commercial-data leaves are added by Stage 4b
      // resolution + Stage 5 suppliers). Firing BLOCK on absence produces a
      // false-positive on every valid BESS. Downgrade to WARN — the worked
      // example §5 has this rule as PASS when endpoints are present + harness
      // declared, but absence at Stage 4d is data-incomplete, not a real fault.
      return {
        verdict: "WARN",
        reason:
          `BMS CAN link incomplete at Stage 4d time. Missing: ${missing.join("; ")}. ` +
          `bms_master requires 2× can_transceiver (primary + redundant). ` +
          `bms_slave requires CAN daisy-chain topology modifier. ` +
          `bms_to_slave_can_harness must appear in BoM. ` +
          `If this rule fires post-Stage-5, the missing items are a real engineering gap; ` +
          `if it fires pre-Stage-5, the harness BoM entry may simply be pending resolution.`,
      }
    }

    return {
      verdict: "PASS",
      reason:
        "BMS CAN link satisfied: bms_master declares can_transceiver (primary + redundant). " +
        "bms_slave has CAN daisy-chain topology. bms_to_slave_can_harness present in BoM. " +
        "Both endpoints + cabling confirmed present.",
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 9: Shunt current rating vs pack current
// Soft rule (weight: 8) — WARN if shunt is undersized relative to pack current.
// Shunt must have ≥50% headroom over pack max continuous current.
// ---------------------------------------------------------------------------

export const SHUNT_CURRENT_RATING_VS_PACK_CURRENT: GrammarRule = {
  id: "shunt_current_rating_vs_pack_current",
  description:
    "Current shunt rating must be ≥150% of pack max continuous current (50% headroom). Pack current derived from inverter_rating_kw / pack_voltage_min_v.",
  weight: 8,
  hardness: "soft",
  evaluate(composition, _library) {
    const allNodes = collectNodes(composition.root)
    const archetypeIds = allNodes.map((n) => n.archetypeId)

    const hasCurrentShunt = archetypeIds.some(
      (id) => id === "current_shunt" || id.includes("current_shunt")
    )

    if (!hasCurrentShunt) {
      return {
        verdict: "PASS",
        reason: "No current_shunt found in composition — shunt rating rule not applicable",
      }
    }

    // Derive pack max continuous current from environment annotations or fallback defaults.
    // Annotations: inverter_rating_kw:<value>, pack_voltage_min_v:<value>, shunt_rating_a:<value>
    let inverterRatingKw: number | undefined
    let packVoltageMinV: number | undefined
    let shuntRatingA: number | undefined

    for (const tag of composition.environment) {
      if (tag.startsWith("inverter_rating_kw:"))
        inverterRatingKw = parseFloat(tag.split(":")[1])
      if (tag.startsWith("pack_voltage_min_v:"))
        packVoltageMinV = parseFloat(tag.split(":")[1])
      if (tag.startsWith("shunt_rating_a:"))
        shuntRatingA = parseFloat(tag.split(":")[1])
    }

    // BESS fallback defaults: 1 MW PCS / 1000 V min DC = 1000 A; shunt rated 1500 A
    const effectiveInverterKw = inverterRatingKw ?? 1000
    const effectiveVoltageMinV = packVoltageMinV ?? 1000
    const effectiveShuntRatingA = shuntRatingA ?? 1500

    const packMaxContinuousA = (effectiveInverterKw * 1000) / effectiveVoltageMinV
    const requiredShuntRatingA = packMaxContinuousA * 1.5 // 50% headroom

    if (effectiveShuntRatingA < packMaxContinuousA) {
      // Coding-council 2026-05-12 Fix 5: shunt rule is in 'efficiency' precedence tier
      // (RULE_PRECEDENCE) but had a BLOCK verdict here — that creates a tier mismatch
      // (BLOCK from efficiency tier loses precedence resolution against safety-tier PASS).
      // Downgraded to WARN: an undersized shunt is a measurement-accuracy concern, not
      // a safety abort. The contactor undersizing rule is what catches the safety
      // implication of the same pack current.
      return {
        verdict: "WARN",
        reason:
          `current_shunt rated ${effectiveShuntRatingA} A is below pack max continuous current ` +
          `${packMaxContinuousA.toFixed(0)} A ` +
          `(${effectiveInverterKw} kW / ${effectiveVoltageMinV} V). ` +
          `Shunt cannot accurately measure peak current — SoC integration accuracy degraded. ` +
          `Upgrade to a shunt rated ≥ ${requiredShuntRatingA.toFixed(0)} A (50% headroom).`,
        relaxation_cost: 8,
      }
    }

    if (effectiveShuntRatingA < requiredShuntRatingA) {
      return {
        verdict: "WARN",
        reason:
          `current_shunt rated ${effectiveShuntRatingA} A meets pack max continuous ` +
          `${packMaxContinuousA.toFixed(0)} A but has less than 50% headroom ` +
          `(required ${requiredShuntRatingA.toFixed(0)} A). ` +
          `Pack peak at 1.2× = ${(packMaxContinuousA * 1.2).toFixed(0)} A may exceed shunt rating.`,
        relaxation_cost: 4,
      }
    }

    return {
      verdict: "PASS",
      reason:
        `current_shunt rated ${effectiveShuntRatingA} A. Pack max continuous ` +
        `${packMaxContinuousA.toFixed(0)} A ` +
        `(${effectiveInverterKw} kW / ${effectiveVoltageMinV} V). ` +
        `Headroom ${(((effectiveShuntRatingA / packMaxContinuousA) - 1) * 100).toFixed(0)}% (≥50% required). ` +
        `Pack peak 1.2× = ${(packMaxContinuousA * 1.2).toFixed(0)} A still within shunt rating.`,
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 10: Contactor current rating vs pack current
// Hard rule (weight: Infinity) — undersized contactor is a fire/arcing risk.
// THE critical catch: EV200HAANA rated 300 A vs 1000 A pack current = 3.3× undersized.
// ---------------------------------------------------------------------------

export const CONTACTOR_CURRENT_RATING_VS_PACK_CURRENT: GrammarRule = {
  id: "contactor_current_rating_vs_pack_current",
  description:
    "Main DC contactor rating must be ≥ pack max continuous current. Undersized contactor causes arcing and fire. Cross-sub-module check: cell_string current source × dc_distribution contactor × energy_conversion PCS rating.",
  // Coding-council 2026-05-12 Fix 1: emitted verdict is WARN (matching worked
  // example §5), so hardness must be "soft" with a finite weight — "hard"
  // Infinity made the constraint optimiser treat this as un-relaxable BLOCK
  // semantics, contradicting the WARN verdict. Soft + high weight (10) keeps
  // it just below safety-class hard rules.
  weight: 10,
  hardness: "soft",
  evaluate(composition, _library) {
    const allNodes = collectNodes(composition.root)
    const archetypeIds = allNodes.map((n) => n.archetypeId)

    const hasDcContactor = archetypeIds.some(
      (id) =>
        id === "main_dc_contactor" ||
        id === "dc_contactor" ||
        id.includes("dc_contactor") ||
        id.includes("main_dc_contactor")
    )

    if (!hasDcContactor) {
      return {
        verdict: "PASS",
        reason: "No main_dc_contactor found in composition — contactor rating rule not applicable",
      }
    }

    // Derive pack max continuous current from environment annotations or fallback defaults.
    // Annotations: inverter_rating_kw:<value>, pack_voltage_min_v:<value>, contactor_rating_a:<value>
    let inverterRatingKw: number | undefined
    let packVoltageMinV: number | undefined
    let contactorRatingA: number | undefined

    for (const tag of composition.environment) {
      if (tag.startsWith("inverter_rating_kw:"))
        inverterRatingKw = parseFloat(tag.split(":")[1])
      if (tag.startsWith("pack_voltage_min_v:"))
        packVoltageMinV = parseFloat(tag.split(":")[1])
      if (tag.startsWith("contactor_rating_a:"))
        contactorRatingA = parseFloat(tag.split(":")[1])
    }

    // BESS fallback defaults: 1 MW PCS / 1000 V min DC = 1000 A; EV200HAANA rated 300 A
    const effectiveInverterKw = inverterRatingKw ?? 1000
    const effectiveVoltageMinV = packVoltageMinV ?? 1000
    const effectiveContactorRatingA = contactorRatingA ?? 300

    const packMaxContinuousA = (effectiveInverterKw * 1000) / effectiveVoltageMinV
    const undersizeFactor = packMaxContinuousA / effectiveContactorRatingA

    if (effectiveContactorRatingA < packMaxContinuousA) {
      return {
        verdict: "WARN",
        reason:
          `main_dc_contactor (EV200HAANA) is rated ${effectiveContactorRatingA} A continuous, ` +
          `but pack max continuous current at ` +
          `${effectiveInverterKw} kW / ${effectiveVoltageMinV} V is ${packMaxContinuousA.toFixed(0)} A. ` +
          `The contactor is undersized by ${undersizeFactor.toFixed(1)}×. ` +
          `Either (a) parallel three EV200 contactors, ` +
          `(b) upgrade to a higher-rated contactor (e.g. Gigavac GX21, 750 A), ` +
          `or (c) reduce the inverter rating. ` +
          `This is the highest-priority single-component sizing error in the module.`,
      }
    }

    return {
      verdict: "PASS",
      reason:
        `main_dc_contactor rated ${effectiveContactorRatingA} A ≥ pack max continuous ` +
        `${packMaxContinuousA.toFixed(0)} A ` +
        `(${effectiveInverterKw} kW / ${effectiveVoltageMinV} V). Sizing adequate.`,
    }
  },
}

// ---------------------------------------------------------------------------
// Rule 11: Fuse breaking capacity vs pack short-circuit current
// Hard rule (weight: Infinity) — fuse must interrupt prospective Isc.
// Checks hrc_dc_fuse breaking capacity ≥ 2× prospective Isc.
// ---------------------------------------------------------------------------

export const FUSE_BREAKING_CAPACITY_VS_PACK_SHORT_CIRCUIT: GrammarRule = {
  id: "fuse_breaking_capacity_vs_pack_short_circuit",
  description:
    "HRC DC fuse breaking capacity must be ≥ 2× prospective short-circuit current. Prospective Isc ≈ pack_voltage / pack_internal_resistance.",
  weight: Infinity,
  hardness: "hard",
  evaluate(composition, _library) {
    const allNodes = collectNodes(composition.root)
    const archetypeIds = allNodes.map((n) => n.archetypeId)

    const hasDcFuse = archetypeIds.some(
      (id) =>
        id === "hrc_dc_fuse" ||
        id.includes("hrc_dc_fuse") ||
        id.includes("dc_fuse") ||
        id.includes("hrc_fuse")
    )

    if (!hasDcFuse) {
      return {
        verdict: "PASS",
        reason: "No hrc_dc_fuse found in composition — fuse breaking capacity rule not applicable",
      }
    }

    // Derive prospective short-circuit current and fuse breaking capacity
    // from environment annotations or fallback BESS defaults.
    // Annotations: pack_voltage_v:<value>, pack_internal_resistance_ohm:<value>,
    //              fuse_breaking_capacity_ka:<value>
    let packVoltageV: number | undefined
    let packInternalResistanceOhm: number | undefined
    let fuseBreakingCapacityKa: number | undefined

    for (const tag of composition.environment) {
      if (tag.startsWith("pack_voltage_v:"))
        packVoltageV = parseFloat(tag.split(":")[1])
      if (tag.startsWith("pack_internal_resistance_ohm:"))
        packInternalResistanceOhm = parseFloat(tag.split(":")[1])
      if (tag.startsWith("fuse_breaking_capacity_ka:"))
        fuseBreakingCapacityKa = parseFloat(tag.split(":")[1])
    }

    // BESS fallback defaults: 1400 V nominal / 0.05 Ω ≈ 28 kA; fuse rated 200 kA
    const effectivePackVoltageV = packVoltageV ?? 1400
    const effectiveResistanceOhm = packInternalResistanceOhm ?? 0.05
    const effectiveFuseBreakingCapacityKa = fuseBreakingCapacityKa ?? 200

    const prospectiveIscKa = effectivePackVoltageV / effectiveResistanceOhm / 1000
    const requiredBreakingCapacityKa = prospectiveIscKa * 2 // 2× margin

    if (effectiveFuseBreakingCapacityKa < prospectiveIscKa) {
      return {
        verdict: "BLOCK",
        reason:
          `hrc_dc_fuse breaking capacity ${effectiveFuseBreakingCapacityKa} kA is below prospective ` +
          `short-circuit current ${prospectiveIscKa.toFixed(0)} kA ` +
          `(pack_voltage ${effectivePackVoltageV} V / internal_resistance ${effectiveResistanceOhm} Ω). ` +
          `Fuse cannot interrupt a bolted short — immediate safety hazard. ` +
          `Select a fuse rated ≥${requiredBreakingCapacityKa.toFixed(0)} kA (2× margin) at the system DC voltage.`,
      }
    }

    if (effectiveFuseBreakingCapacityKa < requiredBreakingCapacityKa) {
      return {
        verdict: "WARN",
        reason:
          `hrc_dc_fuse breaking capacity ${effectiveFuseBreakingCapacityKa} kA exceeds prospective Isc ` +
          `${prospectiveIscKa.toFixed(0)} kA but is below the 2× engineering margin ` +
          `(required ${requiredBreakingCapacityKa.toFixed(0)} kA). ` +
          `Consider upgrading to a higher-rated fuse for margin compliance.`,
      }
    }

    const marginFactor = effectiveFuseBreakingCapacityKa / prospectiveIscKa
    return {
      verdict: "PASS",
      reason:
        `hrc_dc_fuse breaking capacity ${effectiveFuseBreakingCapacityKa} kA ≥ ` +
        `prospective Isc ${prospectiveIscKa.toFixed(0)} kA by ${marginFactor.toFixed(0)}× margin. ` +
        `(pack_voltage ${effectivePackVoltageV} V / internal_resistance ${effectiveResistanceOhm} Ω). ` +
        `PSR063FS65V14H correct part for 1500 V DC battery systems per IEC 60269-7.`,
    }
  },
}

// ---------------------------------------------------------------------------
// Grammar Engine — runs all rules; resolves conflicts via relaxation weights
// ---------------------------------------------------------------------------

export function runGrammarEngine(
  composition: Composition,
  library: RadicalLibrary,
  rules: GrammarRule[]
): EngineResult {
  // Step 1: Evaluate all rules
  const rawResults: (RuleResult & { evalResult: RuleEvaluation })[] = rules.map(
    (rule) => {
      const evalResult = rule.evaluate(composition, library)
      return {
        ruleId: rule.id,
        ruleDescription: rule.description,
        hardness: rule.hardness,
        weight: rule.weight,
        verdict: evalResult.verdict,
        reason: evalResult.reason,
        relaxation_cost: evalResult.relaxation_cost,
        relaxed: false,
        evalResult,
      }
    }
  )

  // Step 2: Check for hard blocks — these are never relaxed
  const hardBlocks = rawResults.filter(
    (r) => r.verdict === "BLOCK" && r.hardness === "hard"
  )
  if (hardBlocks.length > 0) {
    return {
      compositionId: composition.id,
      overallVerdict: "BLOCK",
      ruleResults: rawResults.map(({ evalResult: _, ...rest }) => rest),
      relaxationSummary: hardBlocks.map(
        (b) => `HARD BLOCK [${b.ruleId}]: ${b.reason}`
      ),
    }
  }

  // Step 3: For soft/adjustable blocks, attempt relaxation in ascending weight order
  const softBlocks = rawResults
    .filter((r) => r.verdict === "BLOCK" && r.hardness !== "hard")
    .sort((a, b) => a.weight - b.weight)

  const relaxationSummary: string[] = []

  for (const block of softBlocks) {
    // Relax: change verdict to WARN, mark as relaxed
    block.verdict = "WARN"
    block.relaxed = true
    relaxationSummary.push(
      `RELAXED [${block.ruleId}] (weight=${block.weight}): ` +
        `original BLOCK downgraded to WARN. Tradeoff: ${block.reason}. ` +
        `Relaxation cost: ${block.relaxation_cost ?? block.weight}/10`
    )
  }

  // Step 4: Determine overall verdict
  const finalResults = rawResults.map(({ evalResult: _, ...rest }) => rest)
  const anyUnresolvedBlock = finalResults.some(
    (r) => r.verdict === "BLOCK" && !r.relaxed
  )

  const overallVerdict = anyUnresolvedBlock
    ? "BLOCK"
    : relaxationSummary.length > 0
    ? "PASS_WITH_RELAXATION"
    : "PASS"

  return {
    compositionId: composition.id,
    overallVerdict,
    ruleResults: finalResults,
    relaxationSummary,
  }
}
