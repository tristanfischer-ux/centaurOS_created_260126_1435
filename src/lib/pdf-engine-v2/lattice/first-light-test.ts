#!/usr/bin/env node
/**
 * First Light Test Runner — Lattice architecture kill-criteria validation
 *
 * Run: npx tsx src/lib/pdf-engine-v2/lattice/first-light-test.ts
 *
 * Exits 0 if all 5 criteria pass. Exits 1 if any fail.
 */

import { buildSeedLibrary, ALL_GRAMMAR_RULES } from "./seed-library.js"
import { getResolvedProperties, resolveById } from "./property-api.js"
import { runGrammarEngine } from "./grammar.js"
import {
  KCL_BALANCED_COMPOSITION,
  KCL_BROKEN_COMPOSITION,
  MARINE_316L_COMPOSITION,
  MARINE_PLAIN_STEEL_COMPOSITION,
  TWO_RULE_CONFLICT_COMPOSITION,
} from "./composition.js"
import type { LatticeLibrary } from "./schema.js"

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"

function pass(msg: string) {
  console.log(`${GREEN}  PASS${RESET} ${msg}`)
}

function fail(msg: string) {
  console.log(`${RED}  FAIL${RESET} ${msg}`)
}

function header(msg: string) {
  console.log(`\n${BOLD}=== ${msg} ===${RESET}`)
}

// ---------------------------------------------------------------------------
// Kill criterion checks
// ---------------------------------------------------------------------------

type CriterionResult = { number: number; name: string; passed: boolean; detail: string }

function criterion1_propertyCascadeIntegrity(library: LatticeLibrary): CriterionResult {
  // A character containing radical "steel" must inherit steel.density = 7.85 g/cm³
  // Use the steel_bolt character (radicals: ["steel", "solid_state_of_matter"])
  // with NO overriding modifier — just the M8x30_plain_steel_bolt archetype (modifiers: ["M8"])
  // M8 modifier does NOT touch density, so the resolved value must be 7.85.

  const archetype = library.archetypes.get("M8x30_plain_steel_bolt")!
  const props = getResolvedProperties(archetype, library)
  const resolvedDensity = props["density_g_cm3"]

  const passed = resolvedDensity === 7.85

  return {
    number: 1,
    name: "Property cascade integrity",
    passed,
    detail: `M8x30_plain_steel_bolt resolved density_g_cm3 = ${resolvedDensity} (expected 7.85)`,
  }
}

function criterion2_grammarRuleFiring(library: LatticeLibrary): CriterionResult {
  // KCL must BLOCK on broken composition, PASS on balanced
  const kclRule = ALL_GRAMMAR_RULES.find((r) => r.id === "KCL_node_balance")!

  const brokenResult = kclRule.evaluate(KCL_BROKEN_COMPOSITION, library)
  const balancedResult = kclRule.evaluate(KCL_BALANCED_COMPOSITION, library)

  const brokenIsBlock = brokenResult.verdict === "BLOCK"
  const balancedIsPass = balancedResult.verdict === "PASS"
  const passed = brokenIsBlock && balancedIsPass

  return {
    number: 2,
    name: "Grammar rule firing (KCL)",
    passed,
    detail:
      `BROKEN composition: KCL=${brokenResult.verdict} (${brokenResult.reason}) | ` +
      `BALANCED composition: KCL=${balancedResult.verdict} (${balancedResult.reason})`,
  }
}

function criterion3_inheritanceWithOverride(library: LatticeLibrary): CriterionResult {
  // steel radical has marine_corrosion_resistant = false
  // 316L_grade modifier overrides to marine_corrosion_resistant = true
  // M8x30_316L_socket_head_bolt archetype uses steel_bolt character + [M8, 316L_grade]

  const steelRadical = library.radicals.get("steel")!
  const radicalValue = steelRadical.properties["marine_corrosion_resistant"]

  const resolvedProps = resolveById("M8x30_316L_socket_head_bolt", library)
  const resolvedValue = resolvedProps["marine_corrosion_resistant"]

  const passed = radicalValue === false && resolvedValue === true

  return {
    number: 3,
    name: "Inheritance with override (316L_grade → marine_corrosion_resistant)",
    passed,
    detail:
      `Radical "steel" marine_corrosion_resistant=${radicalValue} | ` +
      `Archetype "M8x30_316L_socket_head_bolt" resolved marine_corrosion_resistant=${resolvedValue} ` +
      `(expected: radical=false, archetype=true)`,
  }
}

function criterion4_archetypeLayerPresent(library: LatticeLibrary): CriterionResult {
  // Archetype type must exist between Modifier and CatalogueEntry.
  // Verify:
  //   1. The library has archetypes
  //   2. Archetypes reference characters (not directly catalogue entries)
  //   3. Catalogue entries reference archetypes
  //   4. Property resolution flows through archetype → character → radicals → modifiers

  const archetypeCount = library.archetypes.size
  const catalogueCount = library.catalogueEntries.size

  // Every catalogue entry must point to a known archetype
  const orphanCatalogueEntries: string[] = []
  for (const [id, entry] of library.catalogueEntries) {
    if (!library.archetypes.has(entry.archetype)) {
      orphanCatalogueEntries.push(id)
    }
  }

  // Every archetype must point to a known character
  const orphanArchetypes: string[] = []
  for (const [id, arch] of library.archetypes) {
    if (!library.characters.has(arch.character)) {
      orphanArchetypes.push(id)
    }
  }

  // Property resolution must flow through archetype (not collapse into catalogue entry)
  // Test: resolve through archetype — if it throws, the layer is broken
  let resolutionWorks = false
  let resolutionError = ""
  try {
    const props = resolveById("M8x30_316L_socket_head_bolt", library)
    // Must have inherited density from steel radical through archetype→character→radical cascade
    resolutionWorks = typeof props["density_g_cm3"] === "number"
  } catch (e) {
    resolutionError = String(e)
  }

  const passed =
    archetypeCount > 0 &&
    catalogueCount > 0 &&
    orphanCatalogueEntries.length === 0 &&
    orphanArchetypes.length === 0 &&
    resolutionWorks

  return {
    number: 4,
    name: "Archetype layer present in schema",
    passed,
    detail:
      `Archetypes: ${archetypeCount}, CatalogueEntries: ${catalogueCount} | ` +
      `Orphan catalogue entries: ${orphanCatalogueEntries.length} | ` +
      `Orphan archetypes: ${orphanArchetypes.length} | ` +
      `Resolution through archetype: ${resolutionWorks}` +
      (resolutionError ? ` ERROR: ${resolutionError}` : ""),
  }
}

function criterion5_relaxationWeightApplied(library: LatticeLibrary): CriterionResult {
  // Two grammar rules must conflict on a test composition;
  // the lower-weight rule must relax with tradeoff EXPLICIT in output.
  //
  // TWO_RULE_CONFLICT_COMPOSITION has:
  //   - MATERIAL_MARINE_CORROSION (plain steel, marine, weight=5) → BLOCK
  //   - THERMAL_CAPACITY_VS_LOAD (800W cooling vs 1000W load, weight=7) → BLOCK
  //
  // Engine must: relax weight=5 first, then weight=7, output PASS_WITH_RELAXATION
  // with explicit relaxation summary.

  const result = runGrammarEngine(
    TWO_RULE_CONFLICT_COMPOSITION,
    library,
    ALL_GRAMMAR_RULES
  )

  const isPassWithRelaxation = result.overallVerdict === "PASS_WITH_RELAXATION"
  const relaxationSummaryNonEmpty = result.relaxationSummary.length > 0

  // Lower-weight rule (material_marine_corrosion, w=5) must appear in relaxation before
  // higher-weight (thermal_capacity_vs_load, w=7)
  const marineRelaxedIdx = result.relaxationSummary.findIndex((s) =>
    s.includes("material_marine_corrosion")
  )
  const thermalRelaxedIdx = result.relaxationSummary.findIndex((s) =>
    s.includes("thermal_capacity_vs_load")
  )
  const orderCorrect =
    marineRelaxedIdx !== -1 &&
    thermalRelaxedIdx !== -1 &&
    marineRelaxedIdx <= thermalRelaxedIdx

  // The relaxed rules must be marked relaxed=true
  const marineRule = result.ruleResults.find(
    (r) => r.ruleId === "material_marine_corrosion"
  )
  const thermalRule = result.ruleResults.find(
    (r) => r.ruleId === "thermal_capacity_vs_load"
  )
  const relaxedRulesMarked =
    marineRule?.relaxed === true && thermalRule?.relaxed === true

  const passed =
    isPassWithRelaxation &&
    relaxationSummaryNonEmpty &&
    orderCorrect &&
    relaxedRulesMarked

  return {
    number: 5,
    name: "Relaxation weight applied (lower-weight rule relaxes first)",
    passed,
    detail:
      `Overall verdict: ${result.overallVerdict} | ` +
      `Relaxation summary entries: ${result.relaxationSummary.length} | ` +
      `Marine corrosion relaxed (w=5): ${marineRule?.relaxed} | ` +
      `Thermal relaxed (w=7): ${thermalRule?.relaxed} | ` +
      `Order correct (marine before thermal): ${orderCorrect}\n` +
      `  Relaxation summary:\n` +
      result.relaxationSummary.map((s) => `    - ${s}`).join("\n"),
  }
}

// ---------------------------------------------------------------------------
// Bonus: print the actual resolved property map for a representative archetype
// ---------------------------------------------------------------------------

function printResolvedPropertyMap(library: LatticeLibrary) {
  header("Resolved property map: M8x30_316L_socket_head_bolt")
  const props = resolveById("M8x30_316L_socket_head_bolt", library)
  console.log(JSON.stringify(props, null, 2))
}

// ---------------------------------------------------------------------------
// Bonus: show KCL verdicts side by side
// ---------------------------------------------------------------------------

function printKCLVerdicts(library: LatticeLibrary) {
  header("KCL rule: BROKEN vs BALANCED composition")
  const kclRule = ALL_GRAMMAR_RULES.find((r) => r.id === "KCL_node_balance")!

  console.log("BROKEN composition (I_in=5A, I_out=3A):")
  const broken = kclRule.evaluate(KCL_BROKEN_COMPOSITION, library)
  console.log(`  Verdict: ${broken.verdict}`)
  console.log(`  Reason: ${broken.reason}`)

  console.log("\nBALANCED composition (I_in=5A, I_out=5A):")
  const balanced = kclRule.evaluate(KCL_BALANCED_COMPOSITION, library)
  console.log(`  Verdict: ${balanced.verdict}`)
  console.log(`  Reason: ${balanced.reason}`)
}

// ---------------------------------------------------------------------------
// Bonus: show inheritance-with-override detail
// ---------------------------------------------------------------------------

function printInheritanceOverride(library: LatticeLibrary) {
  header("Inheritance with override: steel radical → 316L_grade modifier")
  const steel = library.radicals.get("steel")!
  console.log(`Radical "steel" marine_corrosion_resistant = ${steel.properties["marine_corrosion_resistant"]}`)

  const mod = library.modifiers.get("316L_grade")!
  console.log(`Modifier "316L_grade" marine_corrosion_resistant = ${mod.properties["marine_corrosion_resistant"]}`)

  const resolved = resolveById("M8x30_316L_socket_head_bolt", library)
  console.log(`Archetype "M8x30_316L_socket_head_bolt" resolved marine_corrosion_resistant = ${resolved["marine_corrosion_resistant"]}`)
}

// ---------------------------------------------------------------------------
// Bonus: show relaxation in detail
// ---------------------------------------------------------------------------

function printRelaxationDetail(library: LatticeLibrary) {
  header("Relaxation test: two conflicting soft rules")
  const result = runGrammarEngine(
    TWO_RULE_CONFLICT_COMPOSITION,
    library,
    ALL_GRAMMAR_RULES
  )
  console.log(`Overall verdict: ${result.overallVerdict}`)
  console.log("\nRule results:")
  for (const r of result.ruleResults) {
    const relaxedTag = r.relaxed ? " [RELAXED]" : ""
    console.log(
      `  [${r.ruleId}] weight=${r.weight === Infinity ? "∞" : r.weight} → ${r.verdict}${relaxedTag}`
    )
    console.log(`    ${r.reason}`)
  }
  if (result.relaxationSummary.length > 0) {
    console.log("\nRelaxation summary:")
    for (const line of result.relaxationSummary) {
      console.log(`  ${line}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`${BOLD}First Light — Lattice Architecture Kill-Criteria Validation${RESET}`)
  console.log("=".repeat(60))

  const library = buildSeedLibrary()

  console.log(
    `\nLibrary loaded: ${library.radicals.size} radicals, ` +
      `${library.characters.size} characters, ` +
      `${library.modifiers.size} modifiers, ` +
      `${library.archetypes.size} archetypes, ` +
      `${library.catalogueEntries.size} catalogue entries, ` +
      `${ALL_GRAMMAR_RULES.length} grammar rules`
  )

  // Run kill criteria
  const criteria = [
    criterion1_propertyCascadeIntegrity(library),
    criterion2_grammarRuleFiring(library),
    criterion3_inheritanceWithOverride(library),
    criterion4_archetypeLayerPresent(library),
    criterion5_relaxationWeightApplied(library),
  ]

  header("Kill Criteria Results")
  for (const c of criteria) {
    if (c.passed) {
      pass(`Criterion ${c.number}: ${c.name}`)
    } else {
      fail(`Criterion ${c.number}: ${c.name}`)
    }
    console.log(`       ${c.detail}`)
  }

  // Bonus output sections
  printResolvedPropertyMap(library)
  printKCLVerdicts(library)
  printInheritanceOverride(library)
  printRelaxationDetail(library)

  // Summary
  const allPassed = criteria.every((c) => c.passed)
  const failedCount = criteria.filter((c) => !c.passed).length

  header("VERDICT")
  if (allPassed) {
    console.log(
      `${GREEN}${BOLD}FIRST LIGHT SUCCEEDS — all 5 kill criteria pass.${RESET}\n` +
        `Recommend Week 2 dispatch: decompose BESS into the new schema using the seed library.\n` +
        `Measure how many new entries are needed beyond the 10 archetypes already seeded.`
    )
  } else {
    console.log(
      `${RED}${BOLD}FIRST LIGHT KILLS THE ARCHITECTURE — ${failedCount} of 5 criteria failed.${RESET}\n` +
        `Failed criteria:\n` +
        criteria
          .filter((c) => !c.passed)
          .map((c) => `  - Criterion ${c.number}: ${c.name}`)
          .join("\n")
    )
  }

  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
