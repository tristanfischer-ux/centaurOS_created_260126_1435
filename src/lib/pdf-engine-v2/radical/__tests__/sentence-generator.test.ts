/**
 * @file sentence-generator.test.ts — covers the natural-language layer (Iter 4).
 *
 * Tests:
 *   - humaniseId acronym preservation
 *   - modifierStripInline canonical short-names + bare values
 *   - The 6 BESS energy_storage sub-modules from the worked example
 *     (cell_string, bms_slave, bms_master, rack_structure, dc_disconnect,
 *      thermal_loop) — generateSubmoduleSentence + generateModuleParagraph
 *      + generateGrammarTrace
 */

import {
  ACRONYM_MAP,
  GRAMMAR_OPERATORS,
  generateGrammarTrace,
  generateModuleParagraph,
  generateModuleSentence,
  generateSubmoduleSentence,
  humaniseId,
  modifierStripInline,
} from '../sentence-generator'
import type {
  GrammarLink,
  ModifyingCharacter,
  ModuleSpec,
  SubModuleSpec,
} from '../../types/module-decomposition'

// ---------------------------------------------------------------------------
// humaniseId
// ---------------------------------------------------------------------------

describe('humaniseId — acronym preservation', () => {
  it.each([
    ['lfp_prismatic_cell',   'LFP prismatic cell'],
    ['bms_master_pcb',       'BMS master PCB'],
    ['bms_slave',            'BMS slave'],
    ['cell_string',          'cell string'],
    ['rack_structure',       'rack structure'],
    ['high_voltage_dc',      'high voltage DC'],
    ['nmc_chemistry',        'NMC chemistry'],
    ['scada_link',           'SCADA link'],
    ['can_bus_terminator',   'CAN bus terminator'],
    ['imd_trip',             'IMD trip'],
    ['iec_62619_compliance', 'IEC 62619 compliance'],
    ['ev_charger',           'EV charger'],
  ])('humaniseId(%j) → %j', (input, expected) => {
    expect(humaniseId(input)).toBe(expected)
  })

  it('returns empty string for empty input', () => {
    expect(humaniseId('')).toBe('')
  })

  it('handles kebab-case input', () => {
    expect(humaniseId('bms-master-pcb')).toBe('BMS master PCB')
  })

  it('handles CamelCase input — single-acronym CamelCase', () => {
    // CamelCase boundary detection is best-effort: it splits on
    // lowercase→Uppercase transitions, which correctly separates a single
    // PascalCased compound. Adjacent all-caps acronyms (eg BMSMaster) are
    // not supported — pass snake_case in those cases.
    expect(humaniseId('CellString')).toBe('cell string')
  })

  it('contains every claimed canonical acronym', () => {
    // Sanity check that the map has the acronyms the design doc names.
    for (const key of ['bms', 'pcb', 'lfp', 'nmc', 'imd', 'can', 'scada', 'ems', 'pcs', 'igbt', 'mosfet']) {
      expect(ACRONYM_MAP[key]).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// modifierStripInline
// ---------------------------------------------------------------------------

describe('modifierStripInline', () => {
  it('returns empty string for empty list', () => {
    expect(modifierStripInline([])).toBe('')
  })

  it('renders quantity with `qty` prefix', () => {
    const m: ModifyingCharacter = { kind: 'quantity', value: '×3920' }
    expect(modifierStripInline([m])).toBe('qty ×3920')
  })

  it('renders capacity with unit', () => {
    const m: ModifyingCharacter = { kind: 'capacity', value: '280', unit: 'Ah' }
    expect(modifierStripInline([m])).toBe('cap 280 Ah')
  })

  it('renders form bare (no kind prefix)', () => {
    const m: ModifyingCharacter = { kind: 'form', value: 'prismatic' }
    expect(modifierStripInline([m])).toBe('prismatic')
  })

  it('renders topology bare', () => {
    const m: ModifyingCharacter = { kind: 'topology', value: '112s' }
    expect(modifierStripInline([m])).toBe('112s')
  })

  it('renders regulatory bare (value is self-describing)', () => {
    const m: ModifyingCharacter = { kind: 'regulatory', value: 'IEC 62619' }
    expect(modifierStripInline([m])).toBe('IEC 62619')
  })

  it('renders envelope with unit and `env` prefix', () => {
    const m: ModifyingCharacter = { kind: 'envelope', value: '-20…+55', unit: '°C' }
    expect(modifierStripInline([m])).toBe('env -20…+55 °C')
  })

  it('renders performance with `perf` prefix', () => {
    const m: ModifyingCharacter = { kind: 'performance', value: '≥95%' }
    expect(modifierStripInline([m])).toBe('perf ≥95%')
  })

  it('joins multiple modifiers with comma+space', () => {
    const ms: ModifyingCharacter[] = [
      { kind: 'quantity', value: '×3920' },
      { kind: 'capacity', value: '280', unit: 'Ah' },
      { kind: 'form',     value: 'prismatic' },
      { kind: 'lifecycle', value: '6000 cyc' },
    ]
    expect(modifierStripInline(ms)).toBe('qty ×3920, cap 280 Ah, prismatic, life 6000 cyc')
  })

  it('keeps unknown extensible kinds rendered (no silent drop)', () => {
    const m: ModifyingCharacter = { kind: 'colour', value: 'RAL7035' }
    // Unknown kind: render `<kind> <value>`
    expect(modifierStripInline([m])).toBe('colour RAL7035')
  })
})

// ---------------------------------------------------------------------------
// GRAMMAR_OPERATORS — pin the canonical glyphs
// ---------------------------------------------------------------------------

describe('GRAMMAR_OPERATORS', () => {
  it('exposes the four engineering-grammar glyphs', () => {
    expect(GRAMMAR_OPERATORS.WITHIN_WORD).toBe('⊕')
    expect(GRAMMAR_OPERATORS.MUTUAL_LINK).toBe('↔')
    expect(GRAMMAR_OPERATORS.DIRECTIONAL_LINK).toBe('→')
    expect(GRAMMAR_OPERATORS.AND).toBe(' + ')
    expect(GRAMMAR_OPERATORS.PARENTHESES).toEqual(['(', ')'])
  })
})

// ---------------------------------------------------------------------------
// Worked-example fixture: BESS energy_storage_source — 6 sub-modules
// ---------------------------------------------------------------------------

const BESS_SUB_MODULES: SubModuleSpec[] = [
  {
    id: 'cell_string',
    name_human: 'cell string',
    primary_character_id: 'lfp_prismatic_cell',
    primary_character_name_human: 'LFP prismatic cells',
    modifiers: [
      { kind: 'quantity',  value: '×3920' },
      { kind: 'capacity',  value: '280', unit: 'Ah' },
      { kind: 'form',      value: 'prismatic' },
      { kind: 'lifecycle', value: '6000 cyc' },
      { kind: 'regulatory', value: 'IEC 62619' },
    ],
    role_verb: 'consists of',
    topology_clause: 'wired in 112 modules of 35-cells in series',
  },
  {
    id: 'rack_structure',
    name_human: 'rack structure',
    primary_character_id: 'steel_rack_frame',
    primary_character_name_human: 'steel rack frame',
    modifiers: [
      { kind: 'quantity', value: '×4' },
      { kind: 'dimension', value: '2200×600×800', unit: 'mm' },
    ],
    role_verb: 'mounts',
    topology_clause: 'with redundant pack-level seismic bracing',
  },
  {
    id: 'bms_slave',
    name_human: 'BMS slave',
    primary_character_id: 'bms_slave_pcb',
    primary_character_name_human: 'BMS slave PCB',
    modifiers: [
      { kind: 'quantity',  value: '×112' },
      { kind: 'topology',  value: '1-per-module' },
    ],
    role_verb: 'monitors',
    topology_clause: 'reading 35 cell voltages and 5 module temperatures per board',
  },
  {
    id: 'bms_master',
    name_human: 'BMS master',
    primary_character_id: 'bms_master_pcb',
    primary_character_name_human: 'BMS master PCB',
    modifiers: [
      { kind: 'quantity', value: '×2' },
      { kind: 'topology', value: 'redundant pair' },
    ],
    role_verb: 'supervises',
    topology_clause: 'aggregating slave telemetry over CAN and arbitrating contactor command',
  },
  {
    id: 'dc_disconnect',
    name_human: 'DC disconnect',
    primary_character_id: 'dc_contactor',
    primary_character_name_human: 'DC contactor',
    modifiers: [
      { kind: 'quantity',    value: '×2' },
      { kind: 'performance', value: '1500 V DC' },
      { kind: 'regulatory',  value: 'UL 508' },
    ],
    role_verb: 'isolates',
    topology_clause: 'on the pack +/- rails with pre-charge resistor and IMD interlock',
  },
  {
    id: 'thermal_loop',
    name_human: 'thermal loop',
    primary_character_id: 'liquid_cooling_circuit',
    primary_character_name_human: 'liquid cooling circuit',
    modifiers: [
      { kind: 'capacity',    value: '12', unit: 'kW' },
      { kind: 'envelope',    value: '-20…+55', unit: '°C' },
      { kind: 'performance', value: 'ΔT ≤ 5 K' },
    ],
    role_verb: 'cools',
    topology_clause: 'via cold-plate manifolds bonded to each module',
  },
]

const BESS_GRAMMAR_LINKS: GrammarLink[] = [
  { from_sub_module: 'cell_string',     to_sub_module: 'rack_structure', mechanism: 'mechanical_mount', type: 'mutual',     detail: 'cell-to-frame fastener interface' },
  { from_sub_module: 'rack_structure',  to_sub_module: 'bms_slave',      mechanism: 'pcb_mounting',     type: 'mutual' },
  { from_sub_module: 'bms_slave',       to_sub_module: 'bms_master',     mechanism: 'can_bus',          type: 'directional', detail: 'redundant CAN-A / CAN-B' },
  { from_sub_module: 'bms_master',      to_sub_module: 'dc_disconnect',  mechanism: 'contactor_command', type: 'directional' },
  { from_sub_module: 'cell_string',     to_sub_module: 'thermal_loop',   mechanism: 'cooling_loop',     type: 'mutual' },
  { from_sub_module: 'bms_master',      to_sub_module: 'dc_disconnect',  mechanism: 'imd_trip',         type: 'directional', detail: 'isolation fault → open contactor' },
]

const BESS_MODULE: ModuleSpec = {
  module: 'energy_storage_source',
  module_brief:
    'Stores 3.5 MWh of grid-scale energy at the rack level using LFP prismatic cells.' +
    ' Provides 1 MW C-rate discharge for grid-balancing duty.',
  derived_parameters: {
    capacity_kwh: 3500,
    cell_count: 3920,
    dod_fraction: 0.8,
  },
  allowed_radicals: [
    'electrochemical_energy_function',
    'lithium_iron_phosphate_chemistry',
    'fluid_flow_state',
    'pressure_vessel_function',
  ],
  applicability_confidence: 'high',
  sub_modules: BESS_SUB_MODULES,
  grammar_links: BESS_GRAMMAR_LINKS,
}

// ---------------------------------------------------------------------------
// generateSubmoduleSentence — per-sub-module
// ---------------------------------------------------------------------------

describe('generateSubmoduleSentence — BESS worked example', () => {
  it('renders the cell_string sub-module verbatim', () => {
    const out = generateSubmoduleSentence(BESS_SUB_MODULES[0])
    expect(out).toBe(
      'The cell string consists of LFP prismatic cells (qty ×3920, cap 280 Ah, prismatic, life 6000 cyc, IEC 62619) wired in 112 modules of 35-cells in series.',
    )
  })

  it('renders the bms_master sub-module', () => {
    const out = generateSubmoduleSentence(BESS_SUB_MODULES[3])
    expect(out).toBe(
      'The BMS master supervises BMS master PCB (qty ×2, redundant pair) aggregating slave telemetry over CAN and arbitrating contactor command.',
    )
  })

  it('compact style omits topology clause', () => {
    const out = generateSubmoduleSentence(BESS_SUB_MODULES[0], { style: 'compact' })
    expect(out).toBe(
      'The cell string consists of LFP prismatic cells (qty ×3920, cap 280 Ah, prismatic, life 6000 cyc, IEC 62619).',
    )
  })

  it('falls back to humaniseId when name_human is empty', () => {
    const sub: SubModuleSpec = {
      id: 'edge_inverter_pcb',
      name_human: '',
      primary_character_id: 'igbt_module',
      primary_character_name_human: '',
      modifiers: [],
    }
    const out = generateSubmoduleSentence(sub)
    expect(out).toBe('The edge inverter PCB comprises IGBT module.')
  })

  it('omits parenthesised strip when no modifiers', () => {
    const sub: SubModuleSpec = {
      id: 'mounting_bracket',
      name_human: 'mounting bracket',
      primary_character_id: 'steel_bracket',
      primary_character_name_human: 'steel bracket',
      modifiers: [],
    }
    expect(generateSubmoduleSentence(sub)).toBe('The mounting bracket comprises steel bracket.')
  })

  it('renders all 6 BESS sub-modules without throwing', () => {
    for (const sub of BESS_SUB_MODULES) {
      const out = generateSubmoduleSentence(sub)
      expect(out.length).toBeGreaterThan(0)
      expect(out.endsWith('.')).toBe(true)
    }
  })

  it('is deterministic — same input → same output', () => {
    const a = generateSubmoduleSentence(BESS_SUB_MODULES[2])
    const b = generateSubmoduleSentence(BESS_SUB_MODULES[2])
    expect(a).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// generateModuleSentence
// ---------------------------------------------------------------------------

describe('generateModuleSentence — ModuleSpec summary', () => {
  it('summarises the BESS energy_storage_source module', () => {
    const out = generateModuleSentence(BESS_MODULE)
    // Pattern check: module label, sub-module count, link count
    expect(out).toContain('Energy Storage / Source / Dissipation')
    expect(out).toContain('6 sub-modules')
    expect(out).toContain('6 internal')
    expect(out.endsWith('.')).toBe(true)
  })

  it('falls back to module_brief when no sub_modules declared', () => {
    const m: ModuleSpec = { ...BESS_MODULE, sub_modules: undefined, grammar_links: undefined }
    const out = generateModuleSentence(m)
    expect(out).toContain('Stores 3.5 MWh')
  })

  it('handles empty sub_modules + empty grammar_links', () => {
    const m: ModuleSpec = { ...BESS_MODULE, sub_modules: [], grammar_links: [] }
    const out = generateModuleSentence(m)
    // No sub-modules → falls back to brief.
    expect(out).toContain('Stores 3.5 MWh')
  })
})

// ---------------------------------------------------------------------------
// generateModuleParagraph
// ---------------------------------------------------------------------------

describe('generateModuleParagraph', () => {
  it('composes summary + per-sub-module sentences + link prose', () => {
    const sentences = BESS_SUB_MODULES.map(s => generateSubmoduleSentence(s))
    const out = generateModuleParagraph(BESS_MODULE, sentences)
    // Summary present
    expect(out).toContain('Energy Storage / Source / Dissipation')
    // Each sub-module sentence is included
    for (const s of sentences) {
      expect(out).toContain(s)
    }
    // Link prose ("share a … link" for mutual, "drives … via …" for directional) present
    expect(out).toContain('share a mechanical mount link')
    expect(out).toContain('drives the BMS master via CAN bus')
  })

  it('handles empty sentence list — returns just summary + link prose', () => {
    const out = generateModuleParagraph(BESS_MODULE, [])
    expect(out).toContain('Energy Storage / Source / Dissipation')
    expect(out).toContain('share a')
  })

  it('omits link prose when grammar_links is empty', () => {
    const m: ModuleSpec = { ...BESS_MODULE, grammar_links: [] }
    const sentences = (m.sub_modules ?? []).map(s => generateSubmoduleSentence(s))
    const out = generateModuleParagraph(m, sentences)
    expect(out).not.toContain('share a')
    expect(out).not.toContain('drives the')
  })
})

// ---------------------------------------------------------------------------
// generateGrammarTrace
// ---------------------------------------------------------------------------

describe('generateGrammarTrace — symbolic trace', () => {
  it('uses ⊕ within sub-modules and link operators between them', () => {
    const trace = generateGrammarTrace(BESS_MODULE)
    expect(trace).toContain('⊕')
    expect(trace).toContain('↔')
    expect(trace).toContain('→')
  })

  it('renders the cell_string sub-module clause with all modifiers chained by ⊕', () => {
    const trace = generateGrammarTrace(BESS_MODULE)
    expect(trace).toMatch(/lfp_prismatic_cell ⊕ ×3920 ⊕ 280Ah ⊕ prismatic ⊕ 6000 cyc ⊕ IEC 62619/)
  })

  it('tags links with the canonical mechanism name in square brackets', () => {
    const trace = generateGrammarTrace(BESS_MODULE)
    expect(trace).toContain('↔[mechanical mount]')
    expect(trace).toContain('↔[PCB mounting]')
    expect(trace).toContain('→[CAN bus]')
    expect(trace).toContain('→[contactor command]')
    expect(trace).toContain('↔[cooling loop]')
    expect(trace).toContain('→[IMD trip]')
  })

  it('returns empty string for ModuleSpec with no sub-modules', () => {
    const m: ModuleSpec = { ...BESS_MODULE, sub_modules: undefined }
    expect(generateGrammarTrace(m)).toBe('')
  })

  it('appends unlinked sub-modules with the AND operator', () => {
    const m: ModuleSpec = {
      ...BESS_MODULE,
      sub_modules: [
        BESS_SUB_MODULES[0],
        BESS_SUB_MODULES[1],
        // Add an extra unlinked sub-module
        {
          id: 'spare_module',
          name_human: 'spare module',
          primary_character_id: 'spare_part',
          primary_character_name_human: 'spare part',
          modifiers: [],
        },
      ],
      grammar_links: [
        { from_sub_module: 'cell_string', to_sub_module: 'rack_structure', mechanism: 'mechanical_mount', type: 'mutual' },
      ],
    }
    const trace = generateGrammarTrace(m)
    expect(trace).toContain('+')
    expect(trace).toContain('spare_part')
  })
})
