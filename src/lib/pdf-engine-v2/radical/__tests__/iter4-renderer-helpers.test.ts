/**
 * @file iter4-renderer-helpers.test.ts — covers the renderer helper layer
 * that bridges PipelineState.moduleDecomposition into the natural-language
 * layer outputs the PDF renderer consumes.
 */

import {
  buildModuleParagraphs,
  buildSubModuleLookup,
  findSubModuleForLeaf,
  getModuleDecomposition,
  hasNaturalLanguageLayer,
  renderInlineModifiers,
  renderInlineModifiersForLeaf,
} from '../iter4-renderer-helpers'
import type {
  ModuleDecomposition,
  ModuleSpec,
  SubModuleSpec,
  WordSpec,
} from '../../types/module-decomposition'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CELL_STRING: SubModuleSpec = {
  id: 'cell_string',
  name_human: 'cell string',
  words: [
    {
      id: 'cell_string_word',
      name_human: 'cell string word',
      content_character: {
        character_id: 'lfp_prismatic_cell',
        name_human: 'LFP prismatic cells',
        function_radical_primary: 'electrochemical_energy_function',
        function_radical_secondary: null,
        material_radical_primary: 'lithium_iron_phosphate_chemistry',
        material_radical_secondary: null,
      },
      modifier_characters: [
        { kind: 'quantity', value: '×3920' },
        { kind: 'capacity', value: '280', unit: 'Ah' },
        { kind: 'form',     value: 'prismatic' },
      ],
    },
  ],
  role_verb: 'consists of',
  topology_clause: 'wired in 112s',
}

const BMS_MASTER: SubModuleSpec = {
  id: 'bms_master',
  name_human: 'BMS master',
  words: [
    {
      id: 'bms_master_word',
      name_human: 'BMS master word',
      content_character: {
        character_id: 'bms_master_pcb',
        name_human: 'BMS master PCB',
        function_radical_primary: 'silicon_semiconductor_function',
        function_radical_secondary: 'electrical_conducting_function',
        material_radical_primary: 'polymer_thermoplastic',
        material_radical_secondary: null,
      },
      modifier_characters: [
        { kind: 'quantity', value: '×2' },
        { kind: 'topology', value: 'redundant pair' },
      ],
    },
  ],
}

const ENERGY_STORAGE: ModuleSpec = {
  module: 'energy_storage_source',
  module_brief: 'Stores 3.5 MWh.',
  derived_parameters: { capacity_kwh: 3500 },
  allowed_radicals: ['electrochemical_energy_function'],
  applicability_confidence: 'high',
  sub_modules: [CELL_STRING, BMS_MASTER],
  grammar_links: [
    { from_sub_module: 'cell_string', to_sub_module: 'bms_master', mechanism: 'sensor_feedback', type: 'directional' },
  ],
}

const POWER_DISTRIBUTION: ModuleSpec = {
  // Module without sub_modules — exercises legacy fallback paths.
  module: 'power_distribution',
  module_brief: 'Routes pack-level DC to inverter.',
  derived_parameters: {},
  allowed_radicals: ['copper'],
  applicability_confidence: 'medium',
  sub_modules: [],
  grammar_links: [],
}

const DECOMP: ModuleDecomposition = {
  product_class: 'bess',
  normalised_class: 'bess',
  modules: [ENERGY_STORAGE, POWER_DISTRIBUTION],
  excluded_modules: [],
  rationale_excluded: {},
  cross_module_grammar_links: [],
  council_verdict: 'OK',
  council_seats: [],
  council_notes: [],
  telemetry: {
    llm_call_ms: 0, council_ms: 0, input_tokens: 0, output_tokens: 0,
    estimated_cost_gbp: 0, retried: false,
  },
}

// ---------------------------------------------------------------------------
// getModuleDecomposition
// ---------------------------------------------------------------------------

describe('getModuleDecomposition — type-safe state accessor', () => {
  it('returns the moduleDecomposition when present', () => {
    const state = { moduleDecomposition: DECOMP }
    expect(getModuleDecomposition(state)).toBe(DECOMP)
  })

  it('returns undefined when moduleDecomposition is missing', () => {
    expect(getModuleDecomposition({})).toBeUndefined()
  })

  it('returns undefined when state is not an object', () => {
    expect(getModuleDecomposition(null)).toBeUndefined()
    expect(getModuleDecomposition(undefined)).toBeUndefined()
    expect(getModuleDecomposition('foo')).toBeUndefined()
    expect(getModuleDecomposition(42)).toBeUndefined()
  })

  it('returns undefined when moduleDecomposition is non-object', () => {
    expect(getModuleDecomposition({ moduleDecomposition: 'foo' })).toBeUndefined()
    expect(getModuleDecomposition({ moduleDecomposition: null })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// buildSubModuleLookup + findSubModuleForLeaf
// ---------------------------------------------------------------------------

describe('buildSubModuleLookup', () => {
  it('indexes sub-modules by sub-module id, word id, and content_character.character_id', () => {
    const lookup = buildSubModuleLookup(DECOMP)
    expect(lookup.get('cell_string')).toBe(CELL_STRING)
    expect(lookup.get('lfp_prismatic_cell')).toBe(CELL_STRING)       // content_character.character_id
    expect(lookup.get('cell_string_word')).toBe(CELL_STRING)          // word.id
    expect(lookup.get('bms_master')).toBe(BMS_MASTER)
    expect(lookup.get('bms_master_pcb')).toBe(BMS_MASTER)             // content_character.character_id
    expect(lookup.get('bms_master_word')).toBe(BMS_MASTER)            // word.id
  })

  it('returns an empty map when decomposition is undefined', () => {
    expect(buildSubModuleLookup(undefined).size).toBe(0)
  })

  it('returns an empty map when no module has sub_modules', () => {
    const decomp: ModuleDecomposition = { ...DECOMP, modules: [POWER_DISTRIBUTION] }
    expect(buildSubModuleLookup(decomp).size).toBe(0)
  })

  it('first writer wins for duplicate ids', () => {
    const dupSub: SubModuleSpec = { ...BMS_MASTER, id: 'cell_string' }
    const decomp: ModuleDecomposition = {
      ...DECOMP,
      modules: [
        { ...ENERGY_STORAGE, sub_modules: [CELL_STRING, dupSub] },
      ],
    }
    const lookup = buildSubModuleLookup(decomp)
    expect(lookup.get('cell_string')).toBe(CELL_STRING)
  })
})

describe('findSubModuleForLeaf', () => {
  const lookup = buildSubModuleLookup(DECOMP)

  it('finds by content_character.character_id (typical leaf archetypeId)', () => {
    expect(findSubModuleForLeaf('lfp_prismatic_cell', lookup)).toBe(CELL_STRING)
  })

  it('finds by sub-module id (when archetypeId mirrors id)', () => {
    expect(findSubModuleForLeaf('cell_string', lookup)).toBe(CELL_STRING)
  })

  it('finds by word.id', () => {
    expect(findSubModuleForLeaf('cell_string_word', lookup)).toBe(CELL_STRING)
  })

  it('returns undefined when no match', () => {
    expect(findSubModuleForLeaf('unknown_radical', lookup)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// renderInlineModifiers / renderInlineModifiersForLeaf
// ---------------------------------------------------------------------------

describe('renderInlineModifiersForLeaf', () => {
  const lookup = buildSubModuleLookup(DECOMP)

  it('returns the comma-joined strip for a matched leaf', () => {
    expect(renderInlineModifiersForLeaf('lfp_prismatic_cell', lookup))
      .toBe('qty ×3920, cap 280 Ah, prismatic')
  })

  it('returns empty string for an unmatched leaf', () => {
    expect(renderInlineModifiersForLeaf('unknown_radical', lookup)).toBe('')
  })

  it('returns empty string when sub-module exists but has no modifiers', () => {
    const sub: SubModuleSpec = {
      id: 'plain_part',
      name_human: 'plain part',
      words: [
        {
          id: 'plain_word',
          name_human: 'plain word',
          content_character: {
            character_id: 'plain_part_id',
            name_human: 'plain part',
            function_radical_primary: null,
            function_radical_secondary: null,
            material_radical_primary: 'solid_state_of_matter',
            material_radical_secondary: null,
          },
          modifier_characters: [],
        },
      ],
    }
    const decomp: ModuleDecomposition = {
      ...DECOMP,
      modules: [{ ...ENERGY_STORAGE, sub_modules: [sub] }],
    }
    const lookup = buildSubModuleLookup(decomp)
    expect(renderInlineModifiersForLeaf('plain_part_id', lookup)).toBe('')
  })

  it('result excludes wrapping parentheses (caller wraps for the cell)', () => {
    const out = renderInlineModifiersForLeaf('lfp_prismatic_cell', lookup)
    expect(out.startsWith('(')).toBe(false)
    expect(out.endsWith(')')).toBe(false)
  })
})

describe('renderInlineModifiers — direct list passthrough', () => {
  it('matches modifierStripInline output', () => {
    // Use the first word's modifier_characters from CELL_STRING
    const firstWordModifiers = CELL_STRING.words[0].modifier_characters
    expect(renderInlineModifiers(firstWordModifiers))
      .toBe('qty ×3920, cap 280 Ah, prismatic')
  })
})

// ---------------------------------------------------------------------------
// hasNaturalLanguageLayer
// ---------------------------------------------------------------------------

describe('hasNaturalLanguageLayer — activation gate', () => {
  it('true when at least one module has sub_modules', () => {
    expect(hasNaturalLanguageLayer(DECOMP)).toBe(true)
  })

  it('false when no module has sub_modules', () => {
    const decomp: ModuleDecomposition = { ...DECOMP, modules: [POWER_DISTRIBUTION] }
    expect(hasNaturalLanguageLayer(decomp)).toBe(false)
  })

  it('false when decomposition is undefined', () => {
    expect(hasNaturalLanguageLayer(undefined)).toBe(false)
  })

  it('false when modules is empty', () => {
    const decomp: ModuleDecomposition = { ...DECOMP, modules: [] }
    expect(hasNaturalLanguageLayer(decomp)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildModuleParagraphs
// ---------------------------------------------------------------------------

describe('buildModuleParagraphs', () => {
  it('returns one entry per module in the decomposition', () => {
    const out = buildModuleParagraphs(DECOMP)
    expect(out.length).toBe(2)
    expect(out[0].moduleId).toBe('energy_storage_source')
    expect(out[1].moduleId).toBe('power_distribution')
  })

  it('hasNlLayer reflects whether sub_modules are present', () => {
    const out = buildModuleParagraphs(DECOMP)
    expect(out[0].hasNlLayer).toBe(true)
    expect(out[1].hasNlLayer).toBe(false)
  })

  it('renders human-friendly heading via humaniseId', () => {
    const out = buildModuleParagraphs(DECOMP)
    expect(out[0].heading).toBe('energy storage source')
    expect(out[1].heading).toBe('power distribution')
  })

  it('subSentences is empty when no sub_modules', () => {
    const out = buildModuleParagraphs(DECOMP)
    expect(out[1].subSentences).toEqual([])
    expect(out[1].grammarTrace).toBe('')
  })

  it('grammarTrace contains the canonical operators when sub_modules present', () => {
    const out = buildModuleParagraphs(DECOMP)
    expect(out[0].grammarTrace).toContain('⊕')
    expect(out[0].grammarTrace).toContain('→')
  })

  it('paragraph contains both the summary and per-sub-module sentences', () => {
    const out = buildModuleParagraphs(DECOMP)
    const p = out[0].paragraph
    expect(p).toContain('Energy Storage / Source / Dissipation')
    expect(p).toContain('cell string')
    expect(p).toContain('BMS master')
    expect(p).toContain('drives the BMS master')
  })

  it('returns empty array when decomposition is undefined', () => {
    expect(buildModuleParagraphs(undefined)).toEqual([])
  })
})
