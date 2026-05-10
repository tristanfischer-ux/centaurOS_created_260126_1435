/**
 * @file eval-harness/chaos/chaos-harness.test.ts
 *
 * Vitest test suite for the Radical chaos harness — Phase 0.
 *
 * All 8 edge cases + schema versioning.
 * Matches the vitest pattern used by the existing radical test suite.
 *
 * Run via: npx vitest run src/lib/pdf-engine-v2/eval-harness/chaos/chaos-harness.test.ts
 */

import { describe, it, expect } from 'vitest'
import { buildSeedLibrary, ALL_GRAMMAR_RULES } from '../../radical/seed-library.js'
import { runGrammarEngine } from '../../radical/grammar.js'
import { getResolvedProperties } from '../../radical/property-api.js'
import { detectCircularReference } from './chaos-harness.js'
import {
  CURRENT_RADICAL_SPEC_VERSION,
  isVersionCompatible,
} from '../../radical/schema.js'
import type { Composition, CompositionNode, RadicalLibrary } from '../../radical/schema.js'

// ---------------------------------------------------------------------------
// Helper: build library + root archetype for indoor tests
// ---------------------------------------------------------------------------

function libWithRoot() {
  const lib = buildSeedLibrary()
  lib.characters.set('system_root', {
    id: 'system_root',
    radicals: ['solid_state_of_matter'],
    properties: { component_type: 'system_root' },
    function: 'integration',
  })
  lib.archetypes.set('test_system', {
    id: 'test_system',
    character: 'system_root',
    modifiers: [],
  })
  return lib
}

// ---------------------------------------------------------------------------
// Case 1: Empty tree
// ---------------------------------------------------------------------------

describe('Chaos case 1: Empty tree', () => {
  it('should PASS grammar engine with no children', () => {
    const lib = libWithRoot()
    const composition: Composition = {
      id: 'chaos_empty',
      description: 'Empty composition',
      root: { archetypeId: 'test_system', quantity: 1, children: [] },
      environment: ['indoor'],
    }
    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)
    expect(result.overallVerdict).toBe('PASS')
  })
})

// ---------------------------------------------------------------------------
// Case 2: Single-radical paragraph
// ---------------------------------------------------------------------------

describe('Chaos case 2: Single-radical paragraph', () => {
  it('should PASS with a single copper wire node', () => {
    const lib = buildSeedLibrary()
    const composition: Composition = {
      id: 'chaos_single',
      description: 'Single archetype',
      root: { archetypeId: 'standard_copper_wire', quantity: 1, children: [] },
      environment: ['indoor'],
    }
    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)
    expect(['PASS', 'PASS_WITH_RELAXATION']).toContain(result.overallVerdict)
  })
})

// ---------------------------------------------------------------------------
// Case 3: Max breadth — all seed archetypes
// ---------------------------------------------------------------------------

describe('Chaos case 3: Max breadth', () => {
  it('should PASS or PASS_WITH_RELAXATION with all 10 seed archetypes (indoor env)', () => {
    const lib = libWithRoot()
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
      description: 'All seed archetypes, indoor',
      root: { archetypeId: 'test_system', quantity: 1, children },
      environment: ['indoor'],
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)
    // copper + aluminium in INDOOR → galvanic rule PASS (marine/humid not set)
    expect(['PASS', 'PASS_WITH_RELAXATION']).toContain(result.overallVerdict)
  })
})

// ---------------------------------------------------------------------------
// Case 4: Excessive multiplicity (10,000 cells)
// ---------------------------------------------------------------------------

describe('Chaos case 4: Excessive multiplicity', () => {
  it('should not throw with qty=10,000', () => {
    const lib = libWithRoot()
    const composition: Composition = {
      id: 'chaos_excessive_qty',
      description: '10,000 316L bolts',
      root: {
        archetypeId: 'test_system',
        quantity: 1,
        children: [
          { archetypeId: 'M8x30_316L_socket_head_bolt', quantity: 10_000, children: [] },
        ],
      },
      environment: ['indoor'],
    }
    expect(() => runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Case 5: Circular reference detection
// ---------------------------------------------------------------------------

describe('Chaos case 5: Circular reference detection', () => {
  it('should detect a repeated archetype ID in the ancestor path', () => {
    const circularNode: CompositionNode = {
      archetypeId: 'M8x30_316L_socket_head_bolt',
      quantity: 1,
      children: [
        {
          archetypeId: 'standard_copper_wire',
          quantity: 1,
          children: [
            {
              archetypeId: 'M8x30_316L_socket_head_bolt', // repeat of ancestor
              quantity: 1,
              children: [],
            },
          ],
        },
      ],
    }

    const cycle = detectCircularReference(circularNode)
    expect(cycle).not.toBeNull()
    expect(cycle!).toContain('M8x30_316L_socket_head_bolt')
  })

  it('should return null for an acyclic tree', () => {
    const acyclicNode: CompositionNode = {
      archetypeId: 'M8x30_316L_socket_head_bolt',
      quantity: 1,
      children: [
        { archetypeId: 'standard_copper_wire', quantity: 1, children: [] },
        { archetypeId: 'standard_aluminium_heatsink', quantity: 1, children: [] },
      ],
    }
    const cycle = detectCircularReference(acyclicNode)
    expect(cycle).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Case 6: Unknown radical IDs
// ---------------------------------------------------------------------------

describe('Chaos case 6: Unknown radical IDs', () => {
  it('should throw when the grammar engine encounters an unknown radical', () => {
    const lib = libWithRoot()

    lib.characters.set('unknown_radical_character', {
      id: 'unknown_radical_character',
      radicals: ['nonexistent_radical_xyz_abc', 'solid_state_of_matter'],
      properties: { component_type: 'unknown' },
      function: 'unknown',
    })
    lib.archetypes.set('unknown_radical_archetype', {
      id: 'unknown_radical_archetype',
      character: 'unknown_radical_character',
      modifiers: [],
    })

    const composition: Composition = {
      id: 'chaos_unknown_radicals',
      description: 'Unknown radical reference',
      root: {
        archetypeId: 'test_system',
        quantity: 1,
        children: [{ archetypeId: 'unknown_radical_archetype', quantity: 1, children: [] }],
      },
      environment: ['indoor'],
    }

    expect(() => runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)).toThrow(
      /Radical "nonexistent_radical_xyz_abc" not found/
    )
  })
})

// ---------------------------------------------------------------------------
// Case 7: Conflicting modifier overrides (M8 + M16)
// ---------------------------------------------------------------------------

describe('Chaos case 7: Conflicting modifier overrides', () => {
  it('resolves M8+M16 deterministically — M16 (last-declared) wins', () => {
    const lib = buildSeedLibrary()

    lib.archetypes.set('chaos_bolt_m8_m16', {
      id: 'chaos_bolt_m8_m16',
      character: 'steel_bolt',
      modifiers: ['M8', 'M16'],
    })

    const archetype = lib.archetypes.get('chaos_bolt_m8_m16')!
    const props = getResolvedProperties(archetype, lib)

    expect(props['thread_diameter_mm']).toBe(16)
    expect(props['size_designation']).toBe('M16')
  })

  it('grammar PASSes with conflicting modifiers in indoor environment', () => {
    const lib = libWithRoot()

    lib.archetypes.set('chaos_bolt_m8_m16', {
      id: 'chaos_bolt_m8_m16',
      character: 'steel_bolt',
      modifiers: ['M8', 'M16'],
    })

    const composition: Composition = {
      id: 'chaos_conflicting_mods',
      description: 'M8+M16 bolt',
      root: {
        archetypeId: 'test_system',
        quantity: 1,
        children: [{ archetypeId: 'chaos_bolt_m8_m16', quantity: 4, children: [] }],
      },
      environment: ['indoor'],
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)
    expect(['PASS', 'PASS_WITH_RELAXATION']).toContain(result.overallVerdict)
  })
})

// ---------------------------------------------------------------------------
// Case 8: Grammar-rule-violating combination (galvanic BLOCK)
// ---------------------------------------------------------------------------

describe('Chaos case 8: Grammar violation — galvanic rule', () => {
  it('should BLOCK for copper + aluminium in marine environment', () => {
    const lib = libWithRoot()

    const composition: Composition = {
      id: 'chaos_galvanic',
      description: 'Copper + aluminium in marine',
      root: {
        archetypeId: 'test_system',
        quantity: 1,
        children: [
          { archetypeId: 'standard_copper_busbar', quantity: 1, children: [] },
          { archetypeId: 'standard_aluminium_heatsink', quantity: 1, children: [] },
        ],
      },
      environment: ['marine', 'humid'],
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)
    expect(result.overallVerdict).toBe('BLOCK')

    const galvanicRule = result.ruleResults.find(r => r.ruleId === 'galvanic_aluminium_copper_contact')
    expect(galvanicRule).toBeDefined()
    expect(galvanicRule!.verdict).toBe('BLOCK')
    // Hard rule — must NOT be relaxed
    expect(galvanicRule!.relaxed).toBe(false)
  })

  it('should PASS for copper + aluminium in non-marine indoor environment', () => {
    const lib = libWithRoot()

    const composition: Composition = {
      id: 'chaos_no_galvanic',
      description: 'Copper + aluminium indoors — galvanic safe',
      root: {
        archetypeId: 'test_system',
        quantity: 1,
        children: [
          { archetypeId: 'standard_copper_busbar', quantity: 1, children: [] },
          { archetypeId: 'standard_aluminium_heatsink', quantity: 1, children: [] },
        ],
      },
      environment: ['indoor'],
    }

    const result = runGrammarEngine(composition, lib, ALL_GRAMMAR_RULES)
    const galvanicRule = result.ruleResults.find(r => r.ruleId === 'galvanic_aluminium_copper_contact')
    expect(galvanicRule!.verdict).toBe('PASS')
  })
})

// ---------------------------------------------------------------------------
// Schema versioning
// ---------------------------------------------------------------------------

describe('Schema versioning — Phase 0', () => {
  it('CURRENT_RADICAL_SPEC_VERSION is semver-shaped "1.0.0"', () => {
    expect(CURRENT_RADICAL_SPEC_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(CURRENT_RADICAL_SPEC_VERSION).toBe('1.0.0')
  })

  it('isVersionCompatible returns true for same-major versions', () => {
    expect(isVersionCompatible('1.0.0')).toBe(true)
    expect(isVersionCompatible('1.1.0')).toBe(true)
    expect(isVersionCompatible('1.99.99')).toBe(true)
  })

  it('isVersionCompatible returns false for different-major versions', () => {
    expect(isVersionCompatible('0.0.0')).toBe(false)
    expect(isVersionCompatible('2.0.0')).toBe(false)
  })
})
