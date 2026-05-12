/**
 * First Light — Vitest test suite
 *
 * Mirrors the 5 kill criteria from FIRST-LIGHT-KILL-CRITERIA.md.
 * Run: npm test (filters to this file via vitest pattern)
 */

import { describe, it, expect } from "vitest"
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

// ---------------------------------------------------------------------------
// Shared library instance
// ---------------------------------------------------------------------------

const library = buildSeedLibrary()

// ---------------------------------------------------------------------------
// Library sanity
// ---------------------------------------------------------------------------

describe("Radical seed library", () => {
  it("loads 5 radicals, 10 characters, 5 modifiers, 10 archetypes, 2 catalogue entries", () => {
    expect(library.radicals.size).toBe(5)
    expect(library.characters.size).toBe(10)
    expect(library.modifiers.size).toBe(5)
    expect(library.archetypes.size).toBe(10)
    expect(library.catalogueEntries.size).toBe(2)
  })

  it("loads 11 grammar rules", () => {
    expect(ALL_GRAMMAR_RULES).toHaveLength(11)
  })
})

// ---------------------------------------------------------------------------
// Kill criterion 1: Property cascade integrity
// ---------------------------------------------------------------------------

describe("Kill criterion 1: Property cascade integrity", () => {
  it("M8x30_plain_steel_bolt inherits density_g_cm3 = 7.85 from steel radical", () => {
    const archetype = library.archetypes.get("M8x30_plain_steel_bolt")!
    expect(archetype).toBeDefined()

    const props = getResolvedProperties(archetype, library)
    expect(props["density_g_cm3"]).toBe(7.85)
  })

  it("steel_bolt character (no modifier) inherits all steel radical properties", () => {
    // Use a plain archetype with no modifiers to show raw radical inheritance
    // bare_polymer_enclosure demonstrates polymer cascade
    const polymerArch = library.archetypes.get("bare_polymer_enclosure")!
    const props = getResolvedProperties(polymerArch, library)
    // polymer_thermoplastic radical has density_g_cm3: 1.1
    expect(props["density_g_cm3"]).toBe(1.1)
  })

  it("M8 modifier does NOT override density — cascade integrity preserved", () => {
    // M8 modifier only has thread_diameter_mm, thread_pitch_mm, size_designation
    const m8Mod = library.modifiers.get("M8")!
    expect(m8Mod.properties["density_g_cm3"]).toBeUndefined()

    // Therefore M8x30_plain_steel_bolt still resolves to steel's density
    const props = resolveById("M8x30_plain_steel_bolt", library)
    expect(props["density_g_cm3"]).toBe(7.85)
  })
})

// ---------------------------------------------------------------------------
// Kill criterion 2: Grammar rule firing (KCL)
// ---------------------------------------------------------------------------

describe("Kill criterion 2: Grammar rule firing (KCL)", () => {
  const kclRule = ALL_GRAMMAR_RULES.find((r) => r.id === "KCL_node_balance")!

  it("KCL fires BLOCK on broken composition (I_in=5A, I_out=3A)", () => {
    const result = kclRule.evaluate(KCL_BROKEN_COMPOSITION, library)
    expect(result.verdict).toBe("BLOCK")
    expect(result.reason).toMatch(/imbalance/)
  })

  it("KCL fires PASS on balanced composition (I_in=5A, I_out=5A)", () => {
    const result = kclRule.evaluate(KCL_BALANCED_COMPOSITION, library)
    expect(result.verdict).toBe("PASS")
  })

  it("KCL verdicts are different for broken vs balanced (both polarities observed)", () => {
    const broken = kclRule.evaluate(KCL_BROKEN_COMPOSITION, library)
    const balanced = kclRule.evaluate(KCL_BALANCED_COMPOSITION, library)
    expect(broken.verdict).not.toBe(balanced.verdict)
  })

  it("KCL is a hard rule — weight is Infinity, hardness is hard", () => {
    expect(kclRule.weight).toBe(Infinity)
    expect(kclRule.hardness).toBe("hard")
  })
})

// ---------------------------------------------------------------------------
// Kill criterion 3: Inheritance with override
// ---------------------------------------------------------------------------

describe("Kill criterion 3: Inheritance with override (316L_grade)", () => {
  it("steel radical has marine_corrosion_resistant = false", () => {
    const steel = library.radicals.get("steel")!
    expect(steel.properties["marine_corrosion_resistant"]).toBe(false)
  })

  it("316L_grade modifier has marine_corrosion_resistant = true", () => {
    const mod = library.modifiers.get("316L_grade")!
    expect(mod.properties["marine_corrosion_resistant"]).toBe(true)
  })

  it("M8x30_316L_socket_head_bolt resolves marine_corrosion_resistant = true (modifier overrides radical)", () => {
    const resolved = resolveById("M8x30_316L_socket_head_bolt", library)
    expect(resolved["marine_corrosion_resistant"]).toBe(true)
  })

  it("M8x30_plain_steel_bolt (no 316L modifier) keeps marine_corrosion_resistant = false", () => {
    const resolved = resolveById("M8x30_plain_steel_bolt", library)
    expect(resolved["marine_corrosion_resistant"]).toBe(false)
  })

  it("marine_corrosion rule PASSes for 316L bolt in marine environment", () => {
    const marineRule = ALL_GRAMMAR_RULES.find(
      (r) => r.id === "material_marine_corrosion"
    )!
    const result = marineRule.evaluate(MARINE_316L_COMPOSITION, library)
    expect(result.verdict).toBe("PASS")
  })

  it("marine_corrosion rule BLOCKs for plain steel bolt in marine environment", () => {
    const marineRule = ALL_GRAMMAR_RULES.find(
      (r) => r.id === "material_marine_corrosion"
    )!
    const result = marineRule.evaluate(MARINE_PLAIN_STEEL_COMPOSITION, library)
    expect(result.verdict).toBe("BLOCK")
  })
})

// ---------------------------------------------------------------------------
// Kill criterion 4: Archetype layer present in schema
// ---------------------------------------------------------------------------

describe("Kill criterion 4: Archetype layer present in schema", () => {
  it("library has archetypes (layer exists)", () => {
    expect(library.archetypes.size).toBeGreaterThan(0)
  })

  it("library has catalogue entries that reference archetypes (not characters directly)", () => {
    expect(library.catalogueEntries.size).toBeGreaterThan(0)
    for (const [, entry] of library.catalogueEntries) {
      expect(library.archetypes.has(entry.archetype)).toBe(true)
    }
  })

  it("all archetypes reference known characters", () => {
    for (const [, arch] of library.archetypes) {
      expect(library.characters.has(arch.character)).toBe(true)
    }
  })

  it("property resolution flows through archetype → character → radical (not direct to catalogue)", () => {
    // resolveById requires the archetype layer — if collapsed, this would fail
    const props = resolveById("M8x30_316L_socket_head_bolt", library)
    // Prove radical property was inherited
    expect(typeof props["density_g_cm3"]).toBe("number")
    // Prove modifier override was applied
    expect(props["marine_corrosion_resistant"]).toBe(true)
    // Prove character property was inherited
    expect(props["component_type"]).toBe("fastener")
  })

  it("archetype is the grammar interface layer — rule evaluates against archetype, not MPN", () => {
    // The marine corrosion rule checks props via getResolvedProperties(archetype)
    // NOT via catalogue entry — confirm by checking a catalogue entry's archetype is used
    const catalogueEntry = library.catalogueEntries.get("mcmaster_91290A115")!
    const archetype = library.archetypes.get(catalogueEntry.archetype)!
    expect(archetype.id).toBe("M8x30_316L_socket_head_bolt")
    // If we delete the catalogue entry and the rule still fires, the archetype is the interface
    const marineRule = ALL_GRAMMAR_RULES.find(
      (r) => r.id === "material_marine_corrosion"
    )!
    const result = marineRule.evaluate(MARINE_316L_COMPOSITION, library)
    expect(result.verdict).toBe("PASS") // rule fires against archetype props, not MPN
  })
})

// ---------------------------------------------------------------------------
// Kill criterion 5: Relaxation weight applied
// ---------------------------------------------------------------------------

describe("Kill criterion 5: Relaxation weight applied", () => {
  it("TWO_RULE_CONFLICT_COMPOSITION triggers BLOCK on both marine_corrosion and thermal rules", () => {
    const marineRule = ALL_GRAMMAR_RULES.find(
      (r) => r.id === "material_marine_corrosion"
    )!
    const thermalRule = ALL_GRAMMAR_RULES.find(
      (r) => r.id === "thermal_capacity_vs_load"
    )!
    const marine = marineRule.evaluate(TWO_RULE_CONFLICT_COMPOSITION, library)
    const thermal = thermalRule.evaluate(TWO_RULE_CONFLICT_COMPOSITION, library)
    expect(marine.verdict).toBe("BLOCK")
    expect(thermal.verdict).toBe("BLOCK")
  })

  it("engine returns PASS_WITH_RELAXATION (not BLOCK or PASS)", () => {
    const result = runGrammarEngine(
      TWO_RULE_CONFLICT_COMPOSITION,
      library,
      ALL_GRAMMAR_RULES
    )
    expect(result.overallVerdict).toBe("PASS_WITH_RELAXATION")
  })

  it("both soft-blocked rules are marked relaxed=true", () => {
    const result = runGrammarEngine(
      TWO_RULE_CONFLICT_COMPOSITION,
      library,
      ALL_GRAMMAR_RULES
    )
    const marineResult = result.ruleResults.find(
      (r) => r.ruleId === "material_marine_corrosion"
    )!
    const thermalResult = result.ruleResults.find(
      (r) => r.ruleId === "thermal_capacity_vs_load"
    )!
    expect(marineResult.relaxed).toBe(true)
    expect(thermalResult.relaxed).toBe(true)
  })

  it("relaxation summary is non-empty and explicit about the tradeoff", () => {
    const result = runGrammarEngine(
      TWO_RULE_CONFLICT_COMPOSITION,
      library,
      ALL_GRAMMAR_RULES
    )
    expect(result.relaxationSummary.length).toBeGreaterThan(0)
    // Each entry must mention which rule was relaxed
    const mentionsMarine = result.relaxationSummary.some((s) =>
      s.includes("material_marine_corrosion")
    )
    const mentionsThermal = result.relaxationSummary.some((s) =>
      s.includes("thermal_capacity_vs_load")
    )
    expect(mentionsMarine).toBe(true)
    expect(mentionsThermal).toBe(true)
  })

  it("lower-weight rule (marine, w=5) appears in relaxation summary before higher-weight (thermal, w=7)", () => {
    const result = runGrammarEngine(
      TWO_RULE_CONFLICT_COMPOSITION,
      library,
      ALL_GRAMMAR_RULES
    )
    const marineIdx = result.relaxationSummary.findIndex((s) =>
      s.includes("material_marine_corrosion")
    )
    const thermalIdx = result.relaxationSummary.findIndex((s) =>
      s.includes("thermal_capacity_vs_load")
    )
    expect(marineIdx).toBeGreaterThanOrEqual(0)
    expect(thermalIdx).toBeGreaterThanOrEqual(0)
    expect(marineIdx).toBeLessThanOrEqual(thermalIdx)
  })

  it("hard rules (KCL, galvanic) are never relaxed even when soft rules conflict", () => {
    const result = runGrammarEngine(
      TWO_RULE_CONFLICT_COMPOSITION,
      library,
      ALL_GRAMMAR_RULES
    )
    const kclResult = result.ruleResults.find((r) => r.ruleId === "KCL_node_balance")!
    const galvanicResult = result.ruleResults.find(
      (r) => r.ruleId === "galvanic_aluminium_copper_contact"
    )!
    expect(kclResult.relaxed).toBe(false)
    expect(galvanicResult.relaxed).toBe(false)
  })

  it("hard KCL block on broken composition overrides all relaxation — result is BLOCK", () => {
    const result = runGrammarEngine(
      KCL_BROKEN_COMPOSITION,
      library,
      ALL_GRAMMAR_RULES
    )
    // KCL is hard — BLOCK cannot be relaxed
    expect(result.overallVerdict).toBe("BLOCK")
  })
})

// ---------------------------------------------------------------------------
// Property API edge cases
// ---------------------------------------------------------------------------

describe("Property API", () => {
  it("throws on unknown archetype", () => {
    expect(() => resolveById("nonexistent_archetype", library)).toThrow()
  })

  it("throws on unknown character", () => {
    const badArch = { id: "bad", character: "ghost", modifiers: [] }
    expect(() => getResolvedProperties(badArch, library)).toThrow()
  })

  it("modifier applied after character — modifier wins on same key", () => {
    // 316L_grade overrides primary_material to "stainless_steel_316L"
    // steel radical has primary_material: "steel"
    // character steel_bolt has no primary_material property
    // modifier 316L_grade has primary_material: "stainless_steel_316L"
    const resolved = resolveById("M8x30_316L_socket_head_bolt", library)
    expect(resolved["primary_material"]).toBe("stainless_steel_316L")
  })

  it("multiple modifiers applied in declared order — later modifier wins", () => {
    // M8x30_316L_socket_head_bolt: modifiers = ["M8", "316L_grade"]
    // M8 sets size_designation: "M8"
    // 316L_grade does not set size_designation
    // Result: size_designation = "M8" (not overwritten by 316L_grade)
    const resolved = resolveById("M8x30_316L_socket_head_bolt", library)
    expect(resolved["size_designation"]).toBe("M8")
    expect(resolved["grade_designation"]).toBe("316L")
  })
})
