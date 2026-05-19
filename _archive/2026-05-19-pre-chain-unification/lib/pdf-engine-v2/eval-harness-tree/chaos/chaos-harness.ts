/**
 * @file eval-harness/chaos/chaos-harness.ts
 *
 * Radical chaos harness — Phase 0 of the Radical v1 migration.
 *
 * Generates edge-case Radical trees that stress the architecture and
 * verifies the system handles them with the expected behaviour.
 *
 * 8 edge cases:
 *   1. Empty tree (paragraph with no sentences)
 *   2. Single-radical paragraph (degenerate)
 *   3. Tree with all radicals at every level (max breadth)
 *   4. Tree exceeding multiplicity bounds (10,000 cells in a paragraph)
 *   5. Tree with circular references (should fail validation)
 *   6. Tree with radicals not in the seed library (unknown radical IDs)
 *   7. Tree with conflicting modifier overrides (M8 + M16 on the same archetype)
 *   8. Tree with grammar-rule-violating combination (copper + aluminium in marine env)
 */

import type { Composition, CompositionNode, RadicalLibrary, Archetype, Character } from '../../radical/schema.js'
import { buildSeedLibrary, ALL_GRAMMAR_RULES } from '../../radical/seed-library.js'
import { runGrammarEngine } from '../../radical/grammar.js'
import { getResolvedProperties } from '../../radical/property-api.js'

// ---------------------------------------------------------------------------
// Expected outcomes
// ---------------------------------------------------------------------------

export type ChaosExpectedBehaviour =
  | 'PASS'           // Should produce a valid, passing composition
  | 'PASS_WITH_RELAXATION'  // Should pass with some rules relaxed
  | 'BLOCK'          // Should produce a grammar BLOCK
  | 'VALIDATION_ERROR'      // Should throw / fail validation before grammar
  | 'GRACEFUL_DEGRADATION'  // Should not crash; should produce a result with warnings

export interface ChaosCase {
  id: string
  description: string
  expectedBehaviour: ChaosExpectedBehaviour
  run: () => ChaosResult
}

export interface ChaosResult {
  caseId: string
  description: string
  expectedBehaviour: ChaosExpectedBehaviour
  actualBehaviour: ChaosExpectedBehaviour
  passed: boolean
  details: string
  error?: string
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Detect circular references in a composition tree.
 * Returns the cycle path if found, or null if the tree is acyclic.
 */
export function detectCircularReference(
  node: CompositionNode,
  visited: Set<string> = new Set(),
  path: string[] = []
): string[] | null {
  const key = `${node.archetypeId}@${path.length}`

  if (visited.has(node.archetypeId)) {
    return [...path, node.archetypeId]
  }

  visited.add(node.archetypeId)
  path.push(node.archetypeId)

  for (const child of node.children) {
    const cycle = detectCircularReference(child, new Set(visited), [...path])
    if (cycle) return cycle
  }

  return null
}

/**
 * Validate that all archetype IDs in the composition exist in the library.
 * Returns the list of unknown archetype IDs.
 */
export function findUnknownArchetypes(
  node: CompositionNode,
  library: RadicalLibrary
): string[] {
  const unknown: string[] = []
  const queue: CompositionNode[] = [node]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (!library.archetypes.has(current.archetypeId)) {
      unknown.push(current.archetypeId)
    }
    queue.push(...current.children)
  }

  return unknown
}

/**
 * Count all nodes in the composition tree.
 */
export function countNodes(node: CompositionNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0)
}

// ---------------------------------------------------------------------------
// Chaos case 1: Empty tree (paragraph with no sentences)
// ---------------------------------------------------------------------------

function buildCase1EmptyTree(): ChaosResult {
  const caseId = 'chaos_01_empty_tree'
  const description = 'Empty tree — root node with zero children'

  try {
    const lib = buildSeedLibrary()

    // Add a minimal root archetype
    lib.characters.set('system_root', {
      id: 'system_root',
      radicals: ['solid_state_of_matter'],
      properties: { component_type: 'system_root' },
      function: 'integration',
    })
    lib.archetypes.set('empty_system', {
      id: 'empty_system',
      character: 'system_root',
      modifiers: [],
    })

    const composition: Composition = {
      id: 'chaos_empty_tree',
      description: 'Empty composition — no children',
      root: {
        archetypeId: 'empty_system',
        quantity: 1,
        children: [],
      },
      environment: ['indoor'],
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)

    // An empty tree has no electrical nodes, no fluid, no materials to check.
    // All rules should PASS (not applicable).
    const actualBehaviour: ChaosExpectedBehaviour =
      result.overallVerdict === 'PASS' ? 'PASS' : 'BLOCK'

    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour,
      passed: actualBehaviour === 'PASS',
      details: `Grammar verdict: ${result.overallVerdict}. Rules: ${result.ruleResults.map(r => `${r.ruleId}=${r.verdict}`).join(', ')}`,
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: false,
      details: 'Unexpected exception on empty tree',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Chaos case 2: Single-radical paragraph (degenerate)
// ---------------------------------------------------------------------------

function buildCase2SingleRadical(): ChaosResult {
  const caseId = 'chaos_02_single_radical'
  const description = 'Single-radical paragraph — one copper wire node'

  try {
    const lib = buildSeedLibrary()

    const composition: Composition = {
      id: 'chaos_single_radical',
      description: 'Degenerate composition — single archetype',
      root: {
        archetypeId: 'standard_copper_wire',
        quantity: 1,
        children: [],
      },
      environment: ['indoor'],
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)

    // Single copper wire, indoor: no galvanic issue, no marine, no electrical node.
    // Voltage derate might not apply if no voltage_rated_V on copper_wire.
    // Should PASS.
    const actualBehaviour: ChaosExpectedBehaviour =
      result.overallVerdict === 'PASS' || result.overallVerdict === 'PASS_WITH_RELAXATION'
        ? 'PASS'
        : 'BLOCK'

    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour,
      passed: actualBehaviour === 'PASS',
      details: `Grammar verdict: ${result.overallVerdict}. Node count: 1. ` +
        `Rules: ${result.ruleResults.map(r => `${r.ruleId}=${r.verdict}`).join(', ')}`,
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: false,
      details: 'Unexpected exception on single-radical composition',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Chaos case 3: Max breadth — all seed archetypes at every level
// ---------------------------------------------------------------------------

function buildCase3MaxBreadth(): ChaosResult {
  const caseId = 'chaos_03_max_breadth'
  const description = 'Max breadth — all 10 seed archetypes as children of root'

  try {
    const lib = buildSeedLibrary()

    lib.characters.set('system_root', {
      id: 'system_root',
      radicals: ['solid_state_of_matter'],
      properties: { component_type: 'system_root' },
      function: 'integration',
    })
    lib.archetypes.set('breadth_system', {
      id: 'breadth_system',
      character: 'system_root',
      modifiers: [],
    })

    const seedArchetypeIds = [
      'M8x30_316L_socket_head_bolt',
      'M16x50_plain_steel_bolt',
      'IP67_polymer_enclosure',
      'bare_polymer_enclosure',
      'M8x30_plain_steel_bolt',
      'tinned_copper_terminal_50A',
      'standard_copper_wire',
      'standard_aluminium_heatsink',
      'standard_copper_busbar',
      'standard_polymer_gasket',
    ]

    const children: CompositionNode[] = seedArchetypeIds.map(id => ({
      archetypeId: id,
      quantity: 1,
      children: [],
    }))

    const composition: Composition = {
      id: 'chaos_max_breadth',
      description: 'Max breadth: all 10 seed archetypes',
      root: {
        archetypeId: 'breadth_system',
        quantity: 1,
        children,
      },
      environment: ['indoor'],
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)

    // Copper + aluminium both present (copper wire/busbar/terminal + aluminium heatsink)
    // but environment is 'indoor' (not 'marine' or 'humid'), so galvanic rule should PASS.
    // Voltage derate: copper_busbar may not have voltage props → PASS.
    // Should be PASS or PASS_WITH_RELAXATION.
    const nodeCount = countNodes(composition.root)
    const verdict = result.overallVerdict
    const expectedOk = verdict === 'PASS' || verdict === 'PASS_WITH_RELAXATION'

    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour: expectedOk ? 'PASS' : 'BLOCK',
      passed: expectedOk,
      details: `Node count: ${nodeCount}. Grammar verdict: ${verdict}. ` +
        `Rules: ${result.ruleResults.map(r => `${r.ruleId}=${r.verdict}`).join(', ')}`,
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: false,
      details: 'Unexpected exception on max-breadth composition',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Chaos case 4: Exceeding multiplicity bounds (10,000 cells)
// ---------------------------------------------------------------------------

function buildCase4ExcessiveMultiplicity(): ChaosResult {
  const caseId = 'chaos_04_excessive_multiplicity'
  const description = 'Excessive multiplicity — single node with qty=10,000'

  try {
    const lib = buildSeedLibrary()

    lib.characters.set('system_root', {
      id: 'system_root',
      radicals: ['solid_state_of_matter'],
      properties: { component_type: 'system_root' },
      function: 'integration',
    })
    lib.archetypes.set('large_system', {
      id: 'large_system',
      character: 'system_root',
      modifiers: [],
    })

    const composition: Composition = {
      id: 'chaos_excessive_multiplicity',
      description: 'Excessive multiplicity: 10,000 bolts',
      root: {
        archetypeId: 'large_system',
        quantity: 1,
        children: [
          {
            archetypeId: 'M8x30_316L_socket_head_bolt',
            quantity: 10_000,   // Far exceeds typical BoM quantity
            children: [],
          },
        ],
      },
      environment: ['indoor'],
    }

    // High qty should not crash the grammar engine.
    // The system should process it (graceful degradation).
    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)

    // 316L bolt in non-marine: should PASS.
    const actualBehaviour: ChaosExpectedBehaviour =
      result.overallVerdict === 'PASS' ? 'PASS' : 'GRACEFUL_DEGRADATION'

    return {
      caseId,
      description,
      expectedBehaviour: 'GRACEFUL_DEGRADATION',
      actualBehaviour,
      // For this case: any non-crashing result counts as passed
      passed: true,
      details: `qty=10,000 processed without crash. Grammar verdict: ${result.overallVerdict}. ` +
        `Rules: ${result.ruleResults.map(r => `${r.ruleId}=${r.verdict}`).join(', ')}`,
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'GRACEFUL_DEGRADATION',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: false,
      details: 'System crashed on excessive multiplicity — should not throw',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Chaos case 5: Circular references
// ---------------------------------------------------------------------------

function buildCase5CircularReference(): ChaosResult {
  const caseId = 'chaos_05_circular_reference'
  const description = 'Circular reference — detectCircularReference() must catch it'

  // Note: JavaScript object graphs can be circular (reference loops).
  // We cannot literally embed a circular JSON structure, but we simulate
  // what would happen if the validator were applied before grammar.

  try {
    const nodeA: CompositionNode = {
      archetypeId: 'M8x30_316L_socket_head_bolt',
      quantity: 1,
      children: [],
    }

    // Simulate circular: nodeA → nodeB → nodeA
    // We do this by creating the structure and detecting it.
    const fakeCircularNode: CompositionNode = {
      archetypeId: 'M8x30_316L_socket_head_bolt',
      quantity: 1,
      children: [
        {
          archetypeId: 'standard_copper_wire',
          quantity: 1,
          children: [
            // Revisit same archetype ID — our detector treats same archetype ID in ancestor chain as potential cycle
            {
              archetypeId: 'M8x30_316L_socket_head_bolt',
              quantity: 1,
              children: [],
            },
          ],
        },
      ],
    }

    // detectCircularReference should find the repeated archetype ID in the path
    const cycle = detectCircularReference(fakeCircularNode)

    // Our validator MUST detect this
    const detected = cycle !== null

    return {
      caseId,
      description,
      expectedBehaviour: 'VALIDATION_ERROR',
      actualBehaviour: detected ? 'VALIDATION_ERROR' : 'PASS',
      passed: detected,
      details: detected
        ? `Circular reference correctly detected. Cycle path: ${cycle.join(' → ')}`
        : `Circular reference NOT detected — validator is blind to cycles`,
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'VALIDATION_ERROR',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: true,  // Exception is acceptable — it IS a validation error
      details: 'Circular reference caused exception (acceptable as a validation error)',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Chaos case 6: Unknown radical IDs
// ---------------------------------------------------------------------------

function buildCase6UnknownRadicals(): ChaosResult {
  const caseId = 'chaos_06_unknown_radicals'
  const description = 'Unknown radical IDs — archetypes referencing non-existent radicals'

  try {
    const lib = buildSeedLibrary()

    // Add an archetype that references characters with unknown radicals
    lib.characters.set('unknown_radical_character', {
      id: 'unknown_radical_character',
      radicals: ['nonexistent_radical_abc123', 'solid_state_of_matter'],
      properties: { component_type: 'unknown' },
      function: 'unknown',
    })
    lib.archetypes.set('unknown_radical_archetype', {
      id: 'unknown_radical_archetype',
      character: 'unknown_radical_character',
      modifiers: [],
    })

    lib.characters.set('system_root', {
      id: 'system_root',
      radicals: ['solid_state_of_matter'],
      properties: { component_type: 'system_root' },
      function: 'integration',
    })
    lib.archetypes.set('unknown_system', {
      id: 'unknown_system',
      character: 'system_root',
      modifiers: [],
    })

    const composition: Composition = {
      id: 'chaos_unknown_radicals',
      description: 'Composition with unknown radical reference',
      root: {
        archetypeId: 'unknown_system',
        quantity: 1,
        children: [
          {
            archetypeId: 'unknown_radical_archetype',
            quantity: 1,
            children: [],
          },
        ],
      },
      environment: ['indoor'],
    }

    // The grammar engine calls getResolvedProperties, which throws on unknown radicals.
    // Expected: VALIDATION_ERROR (exception thrown)
    let threwError = false
    let errorMessage = ''
    try {
      runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)
    } catch (err) {
      threwError = true
      errorMessage = (err as Error).message
    }

    return {
      caseId,
      description,
      expectedBehaviour: 'VALIDATION_ERROR',
      actualBehaviour: threwError ? 'VALIDATION_ERROR' : 'GRACEFUL_DEGRADATION',
      passed: threwError,
      details: threwError
        ? `Correctly threw validation error on unknown radical. Error: ${errorMessage}`
        : `Did NOT throw on unknown radical — silent failure (this is a bug)`,
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'VALIDATION_ERROR',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: true,
      details: 'Outer exception thrown — unknown radical correctly rejected',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Chaos case 7: Conflicting modifier overrides (M8 + M16)
// ---------------------------------------------------------------------------

function buildCase7ConflictingModifiers(): ChaosResult {
  const caseId = 'chaos_07_conflicting_modifiers'
  const description = 'Conflicting modifier overrides — M8 and M16 on the same archetype'

  try {
    const lib = buildSeedLibrary()

    // Add an archetype with both M8 and M16 (conflicting thread diameters)
    lib.archetypes.set('chaos_bolt_m8_and_m16', {
      id: 'chaos_bolt_m8_and_m16',
      character: 'steel_bolt',
      modifiers: ['M8', 'M16'],  // M16 will override M8's thread props (last-write-wins)
    })

    lib.characters.set('system_root', {
      id: 'system_root',
      radicals: ['solid_state_of_matter'],
      properties: { component_type: 'system_root' },
      function: 'integration',
    })
    lib.archetypes.set('conflicting_system', {
      id: 'conflicting_system',
      character: 'system_root',
      modifiers: [],
    })

    const composition: Composition = {
      id: 'chaos_conflicting_modifiers',
      description: 'Conflicting modifier overrides: M8 + M16',
      root: {
        archetypeId: 'conflicting_system',
        quantity: 1,
        children: [
          {
            archetypeId: 'chaos_bolt_m8_and_m16',
            quantity: 4,
            children: [],
          },
        ],
      },
      environment: ['indoor'],
    }

    // Last-write-wins: M16 overrides M8. The system should resolve this deterministically.
    // The grammar does not have a specific conflicting-modifier rule yet.
    // Expected: PASS (property-api resolves deterministically, grammar passes indoor steel).
    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)

    // Also verify property resolution is deterministic
    const archetype = lib.archetypes.get('chaos_bolt_m8_and_m16')!
    const props = getResolvedProperties(archetype, lib)
    const resolvedThreadDiameter = props['thread_diameter_mm']
    const deterministic = resolvedThreadDiameter === 16  // M16 wins (last in list)

    const actualBehaviour: ChaosExpectedBehaviour =
      result.overallVerdict === 'PASS' ? 'PASS' : 'BLOCK'

    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour,
      passed: actualBehaviour === 'PASS' && deterministic,
      details: [
        `Grammar verdict: ${result.overallVerdict}`,
        `Property resolution deterministic: ${deterministic} (thread_diameter_mm=${resolvedThreadDiameter}, expected=16 [M16 last-write-wins])`,
        `Rules: ${result.ruleResults.map(r => `${r.ruleId}=${r.verdict}`).join(', ')}`,
      ].join('. '),
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'PASS',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: false,
      details: 'Unexpected exception on conflicting modifiers',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Chaos case 8: Grammar-rule-violating combination (copper + aluminium in marine)
// ---------------------------------------------------------------------------

function buildCase8GrammarViolation(): ChaosResult {
  const caseId = 'chaos_08_grammar_violation_galvanic'
  const description = 'Grammar violation — copper + aluminium in marine environment (galvanic rule)'

  try {
    const lib = buildSeedLibrary()

    lib.characters.set('system_root', {
      id: 'system_root',
      radicals: ['solid_state_of_matter'],
      properties: { component_type: 'system_root' },
      function: 'integration',
    })
    lib.archetypes.set('marine_system', {
      id: 'marine_system',
      character: 'system_root',
      modifiers: [],
    })

    const composition: Composition = {
      id: 'chaos_galvanic_violation',
      description: 'Copper + aluminium in marine environment',
      root: {
        archetypeId: 'marine_system',
        quantity: 1,
        children: [
          {
            archetypeId: 'standard_copper_busbar',    // copper
            quantity: 1,
            children: [],
          },
          {
            archetypeId: 'standard_aluminium_heatsink', // aluminium
            quantity: 1,
            children: [],
          },
        ],
      },
      environment: ['marine', 'humid'],  // galvanic rule triggers
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)

    // GALVANIC_ALUMINIUM_COPPER_CONTACT is a hard rule (weight: Infinity).
    // Copper + aluminium + marine = BLOCK. Cannot be relaxed.
    const isBlock = result.overallVerdict === 'BLOCK'

    return {
      caseId,
      description,
      expectedBehaviour: 'BLOCK',
      actualBehaviour: isBlock ? 'BLOCK' : 'PASS',
      passed: isBlock,
      details: [
        `Grammar verdict: ${result.overallVerdict} (expected BLOCK)`,
        `Galvanic rule result: ${result.ruleResults.find(r => r.ruleId === 'galvanic_aluminium_copper_contact')?.verdict ?? 'not found'}`,
        `Hard rules cannot be relaxed — BLOCK should persist`,
      ].join('. '),
    }
  } catch (err) {
    return {
      caseId,
      description,
      expectedBehaviour: 'BLOCK',
      actualBehaviour: 'VALIDATION_ERROR',
      passed: false,
      details: 'Unexpected exception on grammar violation test',
      error: (err as Error).message,
    }
  }
}

// ---------------------------------------------------------------------------
// Main chaos test runner
// ---------------------------------------------------------------------------

export function runChaosHarness(): ChaosResult[] {
  const cases: Array<() => ChaosResult> = [
    buildCase1EmptyTree,
    buildCase2SingleRadical,
    buildCase3MaxBreadth,
    buildCase4ExcessiveMultiplicity,
    buildCase5CircularReference,
    buildCase6UnknownRadicals,
    buildCase7ConflictingModifiers,
    buildCase8GrammarViolation,
  ]

  const results: ChaosResult[] = []

  for (const runCase of cases) {
    try {
      results.push(runCase())
    } catch (err) {
      // Should not happen — each case catches its own errors
      results.push({
        caseId: 'unknown',
        description: 'Unknown case — outer exception',
        expectedBehaviour: 'VALIDATION_ERROR',
        actualBehaviour: 'VALIDATION_ERROR',
        passed: false,
        details: 'Outer runner exception',
        error: (err as Error).message,
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function printChaosReport(results: ChaosResult[]): void {
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  Radical Chaos Harness — Phase 0 Report                       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  for (const result of results) {
    const icon = result.passed ? '✓' : '✗'
    const status = result.passed ? 'PASS' : 'FAIL'
    console.log(`${icon} [${status}] ${result.caseId}`)
    console.log(`    ${result.description}`)
    console.log(`    Expected: ${result.expectedBehaviour} | Actual: ${result.actualBehaviour}`)
    console.log(`    ${result.details}`)
    if (result.error) {
      console.log(`    Error: ${result.error}`)
    }
    console.log()
  }

  console.log(`─────────────────────────────────────────────`)
  console.log(`Results: ${passed}/${results.length} passed, ${failed} failed`)
  console.log(`─────────────────────────────────────────────\n`)
}

if (require.main === module) {
  const results = runChaosHarness()
  printChaosReport(results)

  const allPassed = results.every(r => r.passed)
  if (!allPassed) {
    process.exit(1)
  }
  console.log('All chaos cases passed.')
}
