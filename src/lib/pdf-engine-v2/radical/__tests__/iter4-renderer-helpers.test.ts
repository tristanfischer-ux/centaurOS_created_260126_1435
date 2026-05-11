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
} from '../../types/module-decomposition'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CELL_STRING: SubModuleSpec = {
  id: 'cell_string',
  name_human: 'cell string',
  primary_character_id: 'lfp_prismatic_cell',
  primary_character_name_human: 'LFP prismatic cells',
  modifiers: [
    { kind: 'quantity', value: '×3920' },
    { kind: 'capacity', value: '280', unit: 'Ah' },
    { kind: 'form',     value: 'prismatic' },
  ],
  role_verb: 'consists of',
  topology_clause: 'wired in 112s',
}

const BMS_MASTER: SubModuleSpec = {
  id: 'bms_master',
  name_human: 'BMS master',
  primary_character_id: 'bms_master_pcb',
  primary_character_name_human: 'BMS master PCB',
  modifiers: [
    { kind: 'quantity', value: '×2' },
    { kind: 'topology', value: 'redundant pair' },
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
}

const DECOMP: ModuleDecomposition = {
  product_class: 'bess',
  normalised_class: 'bess',
  modules: [ENERGY_STORAGE, POWER_DISTRIBUTION],
  excluded_modules: [],
  rationale_excluded: {},
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
  it('indexes sub-modules by both id and primary_character_id', () => {
    const lookup = buildSubModuleLookup(DECOMP)
    expect(lookup.get('cell_string')).toBe(CELL_STRING)
    expect(lookup.get('lfp_prismatic_cell')).toBe(CELL_STRING)
    expect(lookup.get('bms_master')).toBe(BMS_MASTER)
    expect(lookup.get('bms_master_pcb')).toBe(BMS_MASTER)
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

  it('finds by primary_character_id (typical leaf archetypeId)', () => {
    expect(findSubModuleForLeaf('lfp_prismatic_cell', lookup)).toBe(CELL_STRING)
  })

  it('finds by sub-module id (when archetypeId mirrors id)', () => {
    expect(findSubModuleForLeaf('cell_string', lookup)).toBe(CELL_STRING)
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
      primary_character_id: 'plain_part_id',
      primary_character_name_human: 'plain part',
      modifiers: [],
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
    expect(renderInlineModifiers(CELL_STRING.modifiers))
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
