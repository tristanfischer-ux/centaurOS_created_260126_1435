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

export const KCL_NODE_BALANCE: GrammarRule = {
  id: "KCL_node_balance",
  description:
    "KCL: ΣI_in = ΣI_out at every electrical node (Kirchhoff's Current Law)",
  weight: Infinity,
  hardness: "hard",
  evaluate(composition, _library) {
    const nodes = collectNodes(composition.root).filter(
      (n) => n.electricalNode !== undefined
    )
    if (nodes.length === 0) {
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
