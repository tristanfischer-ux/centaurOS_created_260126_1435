/**
 * scripts/lib/deterministic-emitter.ts
 *
 * DETERMINISTIC BoM EMITTER — replaces the Stage 1.7 LLM Generator for
 * BESS-class chains. Per 6-seat full council verdict 2026-05-21
 * (mempalace drawer `drawer_forgeos_decisions_f5022035a48fcdec`), the
 * chain's Generator is the single reliability bottleneck — Loop 12 BESS
 * emitted cell_count=432 vs the Contract's 5006 because autoregressive
 * LLM token prediction cannot maintain coupled physical constraints
 * across multi-stage stochastic generation. The plurality verdict
 * (Grok 4.3, Kimi K2.6, MiMo V2.5 Pro: option (d) Constrained-solver
 * Generator) replaces the LLM Generator with a deterministic emitter
 * that computes the BoM from the frozen EngineeringContract + a
 * hand-coded BESS module/sub-module/word template.
 *
 * Reproducibility contract:
 *   - Pure function: no I/O, no Date(), no Math.random()
 *   - Same (contract, brief) → byte-identical DeterministicDesign output
 *   - All quantities sourced from contract.quantities (never invented)
 *   - The LLM is demoted to narrator: it fills `overview_paragraph_en`
 *     and `english_sentence` (and `brief_overview_prose.*`) AFTER this
 *     emitter has fixed the structure
 *
 * Architecture: see `~/.claude/docs/forgeos/forgeos-execution-standards.md`
 * and the council drawer cited above. This file is the structural
 * source of truth for BESS Stage 1.7. Build #17b (next commit) wires
 * it into the chain orchestrator behind a feature flag; Build #17c
 * adds the regression-harness invariants that bind the emitter's
 * outputs to the Contract's deterministic quantities.
 */

// ---------------------------------------------------------------------------
// Local types — kept inline to avoid a circular import with engineering-
// contract.ts. The shapes mirror the published EngineeringContract /
// Quantity / MacroAssemblyPrice / TopologyEdge contracts but the
// emitter only consumes a structural subset.
// ---------------------------------------------------------------------------

interface QuantityShape {
  value: number
  unit: string
  family?: string
  basis?: string
  scope?: string
  source?: string
  source_detail?: string
  condition?: string
}

interface MacroAssemblyPriceShape {
  word_name: string
  unit_price_gbp: number
  dimension_basis: string
  dimension_value: number
  total_gbp: number
  source_detail: string
}

interface ContractShape {
  product_class: string
  brief_summary?: string
  quantities: Record<string, QuantityShape>
  macro_assembly_prices?: MacroAssemblyPriceShape[]
  topology?: unknown[]
  closures?: unknown[]
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export type Radical = string  // closed set lives in src/lib/pdf-engine-v2/prompts.ts (22 content radicals)

export interface ModifierCharacter {
  kind: string
  value: string
  unit?: string
}

export interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: Radical | null
  function_radical_secondary: Radical | null
  material_radical_primary: Radical | null
  material_radical_secondary: Radical | null
}

export interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}

export interface SubModule {
  id: string
  name_human: string
  english_sentence: string  // placeholder '' — LLM narrator fills later
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

export interface DesignModule {
  module: string
  module_brief: string
  overview_paragraph_en: string  // placeholder '' — LLM narrator fills later
  derived_parameters: Record<string, number>
  allowed_radicals: Radical[]
  applicability_confidence: 'high' | 'medium' | 'low'
  sub_modules: SubModule[]
}

export interface CrossModuleGrammarLink {
  from_module: string
  to_module: string
  mechanism: string
  type: 'mutual' | 'directional'
  detail?: string
}

export interface BriefOverviewProse {
  overview_and_context: string
  mission_statement: string
  target_customers: string
  why_now: string
}

export interface DeterministicDesign {
  modules: DesignModule[]
  cross_module_grammar_links: CrossModuleGrammarLink[]
  excluded_modules: string[]
  rationale_excluded: string
  brief_overview_prose: BriefOverviewProse
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function q(contract: ContractShape, key: string, fallback: number): number {
  const v = contract.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  // Deterministic compact representation: integers as-is, decimals to 2 dp.
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string,
  name_human: string,
  fp: Radical | null,
  mp: Radical | null,
  fs: Radical | null = null,
  ms: Radical | null = null,
): ContentCharacter {
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: fs,
    material_radical_primary: mp,
    material_radical_secondary: ms,
  }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  return { id, name_human, content_character: content, modifier_characters: modifiers }
}

/**
 * Synthesize a §4.5 RAD-syntax line from a sub-module's words[].
 * Format: "<character_id> (<mod1>, <mod2>) ⊙ <next_character_id> (<mod1>)"
 * Quantity modifier (kind='quantity') is always the first token if present.
 * Other modifiers follow in their declared order. Empty modifier sets
 * collapse to bare character_id.
 */
function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const modsOrdered = [...w.modifier_characters].sort((a, b) => {
      // quantity first, then everything else in declared order
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    if (tokens.length === 0) return w.content_character.character_id
    return `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

/**
 * Apply rad_syntax synthesis + return SubModule.
 */
function makeSubModule(
  id: string,
  name_human: string,
  role_verb: string,
  topology_clause: string,
  words: Word[],
): SubModule {
  return {
    id,
    name_human,
    english_sentence: '',  // LLM narrator fills later
    rad_syntax: synthesizeRadSyntax(words),
    role_verb,
    topology_clause,
    words,
  }
}

// ---------------------------------------------------------------------------
// BESS TEMPLATE — module emitters
// ---------------------------------------------------------------------------

interface BessParams {
  cellCount: number
  rackCount: number
  thermalRejectionKw: number
  continuousPowerKw: number
  peakPowerKw: number
  nameplateKwh: number
  usableKwh: number
  dodFraction: number
  dcBusVoltageV: number
  busContinuousA: number
  busPeakA: number
  cellCapacityAh: number
  cellVoltageV: number
}

function deriveBessParams(contract: ContractShape): BessParams {
  const cellCount = Math.max(1, Math.round(q(contract, 'cell_count', 5006)))
  // 280 cells per rack is the CATL/EVE class default for utility BESS
  // (matches the BMS slave coverage in the prompts.ts worked example).
  const rackCount = Math.max(1, Math.ceil(cellCount / 280))
  const thermalRejectionKw = q(contract, 'thermal_rejection_min_kw', 30)
  const continuousPowerKw = q(contract, 'continuous_power_kw', 1000)
  const peakPowerKw = q(contract, 'peak_power_kw', 1250)
  const nameplateKwh = q(contract, 'nameplate_capacity_kwh', 4375)
  const usableKwh = q(contract, 'usable_capacity_kwh', 3500)
  const dodFraction = q(contract, 'dod_fraction', 0.80)
  const dcBusVoltageV = q(contract, 'dc_bus_voltage_v', 800)
  const busContinuousA = q(contract, 'bus_continuous_current_a', 1250)
  const busPeakA = q(contract, 'bus_peak_current_a', 1562)
  const cellCapacityAh = q(contract, 'cell_capacity_ah', 280)
  const cellVoltageV = q(contract, 'cell_voltage_v', 3.2)
  return {
    cellCount,
    rackCount,
    thermalRejectionKw,
    continuousPowerKw,
    peakPowerKw,
    nameplateKwh,
    usableKwh,
    dodFraction,
    dcBusVoltageV,
    busContinuousA,
    busPeakA,
    cellCapacityAh,
    cellVoltageV,
  }
}

// ---------------------------------------------------------------------------
// 1. energy_storage_source
// ---------------------------------------------------------------------------

function emitEnergyStorageSource(p: BessParams): DesignModule {
  const cellsPerRack = Math.round(p.cellCount / p.rackCount)
  const busbarsPerRack = Math.max(0, cellsPerRack - 1)
  const totalBusbars = Math.max(0, p.cellCount - p.rackCount)
  const tempSensorCount = p.rackCount * 4

  const cellString = makeSubModule(
    'cell_string',
    'cell string',
    'consists of',
    `wired in ${p.rackCount} racks of ~${cellsPerRack} cells in series`,
    [
      word(
        'lfp_prismatic_cell_word',
        'LFP prismatic cell word',
        cc('lfp_prismatic_cell', 'LFP prismatic cell', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
        [
          mod('quantity', fmtQty(p.cellCount)),
          mod('capacity', String(p.cellCapacityAh), 'Ah'),
          mod('form', 'prismatic'),
          mod('dimension', String(p.cellVoltageV), 'V'),
          mod('regulatory', 'IEC 62619'),
          mod('lifecycle', '6000 cyc'),
        ],
      ),
      word(
        'cell_to_cell_busbar_word',
        'cell-to-cell busbar word',
        cc('cell_to_cell_busbar', 'cell-to-cell busbar', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', fmtQty(totalBusbars)),
          mod('dimension', '350', 'A'),
        ],
      ),
      word(
        'cell_terminal_hardware_word',
        'cell terminal hardware word',
        cc('cell_terminal_hardware', 'cell terminal hardware', null, 'steel'),
        [
          mod('quantity', fmtQty(p.cellCount)),
          mod('form', 'stainless steel terminal set'),
        ],
      ),
      word(
        'cell_voltage_tap_wire_word',
        'cell voltage tap wire word',
        cc('cell_voltage_tap_wire', 'cell voltage tap wire', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', fmtQty(p.cellCount)),
          mod('dimension', '22', 'AWG'),
          mod('regulatory', 'UL 1015'),
        ],
      ),
      word(
        'cell_insulation_pad_word',
        'cell insulation pad word',
        cc('cell_insulation_pad', 'cell insulation pad', null, 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.cellCount)),
          mod('regulatory', 'UL94 V-0'),
        ],
      ),
    ],
  )

  const rackStructure = makeSubModule(
    'rack_structure',
    'rack structure',
    'mounts',
    `${p.rackCount} racks per container`,
    [
      word(
        'module_steel_frame_word',
        'module steel frame word',
        cc('module_steel_frame', 'steel rack frame', null, 'steel'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('form', 'welded'),
        ],
      ),
      word(
        'module_top_cover_word',
        'module top cover word',
        cc('module_top_cover', 'module top cover', null, 'steel'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('form', 'sheet steel'),
        ],
      ),
      word(
        'module_bottom_tray_word',
        'module bottom tray word',
        cc('module_bottom_tray', 'module bottom tray', null, 'steel'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('form', 'sheet steel'),
        ],
      ),
      word(
        'compression_plate_word',
        'compression plate word',
        cc('compression_plate', 'compression plate', null, 'steel'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('dimension', '3.5', 'kN'),
        ],
      ),
      word(
        'compression_tie_rod_set_word',
        'compression tie rod set word',
        cc('compression_tie_rod_set', 'compression tie rod set', null, 'steel'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('form', 'M12×4 rod set'),
        ],
      ),
    ],
  )

  const packInstrumentation = makeSubModule(
    'pack_instrumentation',
    'pack instrumentation',
    'measures',
    'per-rack current + insulation monitoring + temperature feedback',
    [
      word(
        'pack_current_transducer_word',
        'pack current transducer word',
        cc('current_transducer', 'current transducer', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('form', 'hall-effect'),
          mod('tolerance', '±2500', 'A'),
        ],
      ),
      word(
        'insulation_monitor_word',
        'insulation monitor word',
        cc('insulation_monitor', 'insulation monitor', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Bender ISOMETER IR427-D6'),
        ],
      ),
      word(
        'pack_temperature_sensor_word',
        'pack temperature sensor word',
        cc('pack_temperature_sensor', 'pack temperature sensor', 'thermal_transfer_function', 'ceramic'),
        [
          mod('quantity', fmtQty(tempSensorCount)),
          mod('form', 'NTC 10kΩ'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `Stores ${(p.usableKwh / 1000).toFixed(2)} MWh of usable energy (${(p.nameplateKwh / 1000).toFixed(2)} MWh nameplate at ${(p.dodFraction * 100).toFixed(0)}% DoD) using ${p.cellCount} LFP prismatic cells across ${p.rackCount} racks.`,
    overview_paragraph_en: '',
    derived_parameters: {
      capacity_kwh: p.usableKwh,
      nameplate_capacity_kwh: p.nameplateKwh,
      dod_fraction: p.dodFraction,
      cell_count: p.cellCount,
      rack_count: p.rackCount,
      cell_voltage_v: p.cellVoltageV,
      cell_capacity_ah: p.cellCapacityAh,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'lithium_iron_phosphate_chemistry',
      'copper',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [cellString, rackStructure, packInstrumentation],
  }
}

// ---------------------------------------------------------------------------
// 2. energy_conversion_transduction
// ---------------------------------------------------------------------------

function emitEnergyConversionTransduction(p: BessParams): DesignModule {
  const pcsInverter = makeSubModule(
    'pcs_inverter',
    'PCS inverter',
    'converts',
    'DC pack bus ↔ AC grid via bidirectional inverter',
    [
      word(
        'pcs_inverter_1mw_bidirectional_word',
        'PCS inverter 1 MW bidirectional word',
        cc('pcs_inverter_1mw_bidirectional', 'PCS 1 MW bidirectional inverter', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(Math.round(p.continuousPowerKw / 1000)), 'MW'),
          mod('form', 'Sungrow SC1000UD-MV'),
          mod('dimension', '1700', 'V IGBT'),
        ],
      ),
      word(
        'pcs_dc_link_capacitor_bank_word',
        'PCS DC-link capacitor bank word',
        cc('pcs_dc_link_capacitor_bank', 'PCS DC-link capacitor bank', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '6×450µF film'),
        ],
      ),
      word(
        'pcs_lcl_output_filter_word',
        'PCS LCL output filter word',
        cc('pcs_lcl_output_filter', 'PCS LCL output filter', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '50', 'µH'),
          mod('capacity', '100', 'A 3-phase'),
        ],
      ),
    ],
  )

  const stepUpTransformer = makeSubModule(
    'step_up_transformer',
    'step-up transformer',
    'steps up',
    '400 V AC inverter output to 11 kV grid',
    [
      word(
        'step_up_transformer_word',
        'step-up transformer word',
        cc('step_up_transformer', 'step-up transformer', 'magnetic_coupling_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', '1', 'MVA'),
          mod('form', '400V/11kV dry-type'),
          mod('regulatory', 'IEC 60076'),
        ],
      ),
      word(
        'transformer_neutral_grounding_word',
        'transformer neutral grounding word',
        cc('transformer_neutral_grounding', 'transformer neutral grounding resistor', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'NGR'),
          mod('capacity', '600', 'A'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Converts ${(p.continuousPowerKw / 1000).toFixed(1)} MW continuous (${(p.peakPowerKw / 1000).toFixed(2)} MW peak) between the ${p.dcBusVoltageV} V DC pack bus and the AC grid via a bidirectional PCS and step-up transformer.`,
    overview_paragraph_en: '',
    derived_parameters: {
      continuous_power_kw: p.continuousPowerKw,
      peak_power_kw: p.peakPowerKw,
      dc_bus_voltage_v: p.dcBusVoltageV,
      efficiency: 0.98,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'magnetic_coupling_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [pcsInverter, stepUpTransformer],
  }
}

// ---------------------------------------------------------------------------
// 3. control_compute_communication
// ---------------------------------------------------------------------------

function emitControlComputeCommunication(p: BessParams): DesignModule {
  const bmsMaster = makeSubModule(
    'bms_master',
    'BMS master',
    'supervises',
    'reads slaves over CAN, drives contactor sequencing + state-of-charge',
    [
      word(
        'bms_master_controller_word',
        'BMS master controller word',
        cc('bms_master_controller', 'BMS master controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'STM32F427VGT6 MCU'),
          mod('regulatory', 'IEC 62619'),
        ],
      ),
      word(
        'can_transceiver_word',
        'CAN transceiver word',
        cc('can_transceiver', 'CAN transceiver', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'TJA1051'),
          mod('capacity', '500', 'kbit'),
        ],
      ),
      word(
        'digital_isolator_word',
        'digital isolator word',
        cc('digital_isolator', 'digital isolator', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'ISO1042BDWVR'),
          mod('dimension', '5', 'kV/4ch'),
        ],
      ),
      word(
        'bms_master_housing_word',
        'BMS master housing word',
        cc('bms_master_housing', 'BMS master housing', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'IP54'),
        ],
      ),
    ],
  )

  const emsCompute = makeSubModule(
    'ems_compute',
    'EMS compute',
    'orchestrates',
    'industrial PC + Modbus gateway for grid + market dispatch',
    [
      word(
        'ems_industrial_pc_word',
        'EMS industrial PC word',
        cc('ems_industrial_pc', 'EMS industrial PC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Beckhoff CX7000'),
          mod('regulatory', 'Modbus TCP'),
        ],
      ),
      word(
        'modbus_gateway_word',
        'Modbus gateway word',
        cc('modbus_gateway', 'Modbus gateway', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Anybus AB7634'),
          mod('regulatory', 'ModbusRTU/TCP'),
        ],
      ),
    ],
  )

  return {
    module: 'control_compute_communication',
    module_brief: 'Supervises the pack via BMS master + EMS industrial PC. CAN bus to BMS slaves; Modbus TCP to PCS, chiller and grid-edge devices.',
    overview_paragraph_en: '',
    derived_parameters: {
      can_bus_count: 2,
      modbus_tcp_targets: 3,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'digital_logic_function',
      'electrical_conducting_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [bmsMaster, emsCompute],
  }
}

// ---------------------------------------------------------------------------
// 4. power_distribution
// ---------------------------------------------------------------------------

function emitPowerDistribution(p: BessParams): DesignModule {
  const dcDistribution = makeSubModule(
    'dc_distribution',
    'DC distribution',
    'distributes',
    `${p.dcBusVoltageV} V DC pack bus through main + pre-charge contactors + HRC fuses`,
    [
      word(
        'dc_main_contactor_word',
        'DC main contactor word',
        cc('dc_main_contactor', 'DC main contactor', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('dimension', '800', 'V'),
          mod('capacity', '1600', 'A'),
          mod('form', 'Gigavac GX21BAB'),
          mod('regulatory', 'UL 508'),
        ],
      ),
      word(
        'dc_precharge_contactor_word',
        'DC pre-charge contactor word',
        cc('dc_precharge_contactor', 'DC pre-charge contactor', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('dimension', '800', 'V'),
          mod('capacity', '100', 'A'),
        ],
      ),
      word(
        'dc_hrc_fuse_word',
        'DC HRC fuse word',
        cc('dc_hrc_fuse', 'DC HRC fuse', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('capacity', '630', 'A'),
          mod('form', 'Bussmann FWP'),
        ],
      ),
      word(
        'dc_busbar_800v_word',
        'DC busbar 800 V word',
        cc('dc_busbar_800v', 'DC busbar 800 V', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', String(p.dcBusVoltageV), 'V'),
          mod('capacity', '2000', 'A'),
        ],
      ),
    ],
  )

  const acSwitchgear = makeSubModule(
    'ac_switchgear',
    'AC switchgear',
    'isolates',
    '1600 A AC main breaker + G99 protection at the PCC',
    [
      word(
        'ac_main_breaker_word',
        'AC main breaker word',
        cc('ac_main_breaker', 'AC main breaker', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', '1600', 'A'),
          mod('form', 'ABB Tmax frame'),
        ],
      ),
      word(
        'g99_protection_relay_word',
        'G99 protection relay word',
        cc('g99_protection_relay', 'G99 protection relay', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Comap InteliPro G99/3'),
          mod('regulatory', 'ENA G99/3-3'),
        ],
      ),
    ],
  )

  return {
    module: 'power_distribution',
    module_brief: `Routes ${p.busContinuousA.toFixed(0)} A continuous (${p.busPeakA.toFixed(0)} A peak) at ${p.dcBusVoltageV} V DC from racks through pack contactors + fuses to PCS, and the PCS AC output through 1600 A switchgear to the grid PCC.`,
    overview_paragraph_en: '',
    derived_parameters: {
      bus_continuous_current_a: p.busContinuousA,
      bus_peak_current_a: p.busPeakA,
      dc_bus_voltage_v: p.dcBusVoltageV,
    },
    allowed_radicals: [
      'copper',
      'electrical_conducting_function',
      'electromechanical_switching_function',
      'silicon_semiconductor_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [dcDistribution, acSwitchgear],
  }
}

// ---------------------------------------------------------------------------
// 5. environmental_interface
// ---------------------------------------------------------------------------

function emitEnvironmentalInterface(p: BessParams): DesignModule {
  // Chiller sized up to next 30 kW step.
  const chillerKw = Math.max(30, Math.ceil(p.thermalRejectionKw / 30) * 30)

  const liquidCooling = makeSubModule(
    'liquid_cooling',
    'liquid cooling',
    'rejects',
    'glycol/water loop with cold-plate manifolds per rack',
    [
      word(
        'liquid_cooling_chiller_word',
        'liquid cooling chiller word',
        cc('liquid_cooling_chiller', 'liquid cooling chiller', 'thermal_transfer_function', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(chillerKw), 'kW'),
          mod('form', 'glycol/water'),
          mod('regulatory', 'R513A'),
        ],
      ),
      word(
        'cooling_pump_word',
        'cooling pump word',
        cc('cooling_pump', 'cooling pump', 'thermal_transfer_function', 'steel'),
        [
          mod('quantity', '×2'),
          mod('form', 'redundant centrifugal'),
          mod('capacity', '60', 'L/min'),
        ],
      ),
      word(
        'cold_plate_manifold_word',
        'cold plate manifold word',
        cc('cold_plate_manifold', 'cold plate manifold', 'thermal_transfer_function', 'aluminium'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('form', 'aluminium 6061-T6'),
        ],
      ),
      word(
        'expansion_tank_word',
        'expansion tank word',
        cc('expansion_tank', 'expansion tank', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '50', 'L'),
          mod('form', 'stainless'),
        ],
      ),
    ],
  )

  const enclosureClimate = makeSubModule(
    'enclosure_climate',
    'enclosure climate',
    'conditions',
    'forced-air ventilation + intake filtration',
    [
      word(
        'enclosure_ventilation_fan_word',
        'enclosure ventilation fan word',
        cc('enclosure_ventilation_fan', 'enclosure ventilation fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('form', 'axial'),
          mod('capacity', '80', 'W'),
          mod('regulatory', 'EBM-Papst'),
        ],
      ),
      word(
        'air_intake_filter_word',
        'air intake filter word',
        cc('air_intake_filter', 'air intake filter', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('regulatory', 'MERV 7'),
        ],
      ),
    ],
  )

  return {
    module: 'environmental_interface',
    module_brief: `Rejects ${p.thermalRejectionKw.toFixed(0)} kW of inverter + pack losses via a ${chillerKw} kW glycol/water chiller and four enclosure ventilation fans.`,
    overview_paragraph_en: '',
    derived_parameters: {
      cooling_capacity_kw: chillerKw,
      thermal_rejection_required_kw: p.thermalRejectionKw,
      max_ambient_c: 50,
    },
    allowed_radicals: [
      'thermal_transfer_function',
      'refrigerant_fluid',
      'fluid_flow_state',
      'aluminium',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [liquidCooling, enclosureClimate],
  }
}

// ---------------------------------------------------------------------------
// 6. mass_fluid_transport_process
// ---------------------------------------------------------------------------

function emitMassFluidTransportProcess(_p: BessParams): DesignModule {
  const coolantLoop = makeSubModule(
    'coolant_loop',
    'coolant loop',
    'routes',
    'glycol/water from cold plates to chiller via SS304 piping',
    [
      word(
        'coolant_supply_pipe_word',
        'coolant supply pipe word',
        cc('coolant_supply_pipe', 'coolant supply pipe', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '25', 'mm'),
          mod('form', 'SS304'),
        ],
      ),
      word(
        'coolant_return_pipe_word',
        'coolant return pipe word',
        cc('coolant_return_pipe', 'coolant return pipe', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '25', 'mm'),
          mod('form', 'SS304'),
        ],
      ),
      word(
        'ball_valve_isolation_word',
        'ball valve isolation word',
        cc('ball_valve_isolation', 'ball valve isolation', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×4'),
          mod('form', 'brass'),
          mod('regulatory', 'glycol-rated'),
        ],
      ),
      word(
        'pressure_transducer_word',
        'pressure transducer word',
        cc('pressure_transducer', 'pressure transducer', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×2'),
          mod('form', '4-20mA'),
          mod('dimension', '0-10', 'bar'),
        ],
      ),
    ],
  )

  return {
    module: 'mass_fluid_transport_process',
    module_brief: 'Routes the glycol/water coolant between cold-plate manifolds and the chiller via SS304 piping, isolation valves and pressure sensing.',
    overview_paragraph_en: '',
    derived_parameters: {},
    allowed_radicals: [
      'fluid_flow_state',
      'pressure_vessel_function',
      'steel',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [coolantLoop],
  }
}

// ---------------------------------------------------------------------------
// 7. safety_protection
// ---------------------------------------------------------------------------

function emitSafetyProtection(p: BessParams): DesignModule {
  const fireSuppression = makeSubModule(
    'fire_suppression',
    'fire suppression',
    'extinguishes',
    'Novec 1230 clean-agent with rate-of-rise detection + VESDA aspiration',
    [
      word(
        'clean_agent_cylinder_word',
        'clean agent cylinder word',
        cc('clean_agent_cylinder', 'clean agent cylinder', 'chemical_sensing_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Novec 1230'),
          mod('capacity', '25', 'kg'),
          mod('regulatory', 'NFPA 2001'),
        ],
      ),
      word(
        'suppression_nozzle_word',
        'suppression nozzle word',
        cc('suppression_nozzle', 'suppression nozzle', 'pressure_vessel_function', 'copper'),
        [
          mod('quantity', '×4'),
          mod('form', 'brass'),
        ],
      ),
      word(
        'thermal_detector_word',
        'thermal detector word',
        cc('thermal_detector', 'thermal detector', 'thermal_transfer_function', 'ceramic'),
        [
          mod('quantity', fmtQty(p.rackCount)),
          mod('form', 'rate-of-rise + fixed'),
          mod('dimension', '88', '°C'),
        ],
      ),
      word(
        'smoke_aspirating_detector_word',
        'smoke aspirating detector word',
        cc('smoke_aspirating_detector', 'smoke aspirating detector', 'chemical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'VESDA-E'),
        ],
      ),
    ],
  )

  const deflagrationVents = makeSubModule(
    'deflagration_vents',
    'deflagration vents',
    'vents',
    'pressure-relief panels + MOV smoke-vent interlock',
    [
      word(
        'deflagration_vent_panel_word',
        'deflagration vent panel word',
        cc('deflagration_vent_panel', 'deflagration vent panel', 'pressure_vessel_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('form', 'polycarbonate'),
          mod('regulatory', 'NFPA 68'),
        ],
      ),
      word(
        'smoke_vent_interlock_word',
        'smoke vent interlock word',
        cc('smoke_vent_interlock', 'smoke vent interlock', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'MOV-actuated'),
        ],
      ),
    ],
  )

  const safetyLabelling = makeSubModule(
    'safety_labelling',
    'safety labelling',
    'marks',
    'per-rack high-voltage + arc-flash + IEC 62619 compliance signage',
    [
      word(
        'high_voltage_safety_label_word',
        'high voltage safety label word',
        cc('high_voltage_safety_label', 'high-voltage safety label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.rackCount)),
        ],
      ),
      word(
        'arc_flash_hazard_label_word',
        'arc flash hazard label word',
        cc('arc_flash_hazard_label', 'arc-flash hazard label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
        ],
      ),
      word(
        'iec62619_compliance_label_word',
        'IEC 62619 compliance label word',
        cc('iec62619_compliance_label', 'IEC 62619 compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'IEC 62619'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_protection',
    module_brief: 'Detects + extinguishes thermal runaway via Novec 1230 clean-agent, ventilates gas through deflagration panels, and marks all safety-critical surfaces.',
    overview_paragraph_en: '',
    derived_parameters: {
      rack_count: p.rackCount,
      suppression_agent_kg: 25,
    },
    allowed_radicals: [
      'chemical_suppressant_material',
      'optical_sensing_function',
      'chemical_sensing_function',
      'electromechanical_switching_function',
      'pressure_vessel_function',
    ],
    applicability_confidence: 'high',
    sub_modules: [fireSuppression, deflagrationVents, safetyLabelling],
  }
}

// ---------------------------------------------------------------------------
// 8. structure_containment
// ---------------------------------------------------------------------------

function emitStructureContainment(_p: BessParams): DesignModule {
  const isoContainerShell = makeSubModule(
    'iso_container_shell',
    'ISO container shell',
    'contains',
    '40-foot HC ISO container with structural floor + thermal insulation',
    [
      word(
        'iso_container_40hc_word',
        'ISO container 40 HC word',
        cc('iso_container_40hc', 'ISO container 40-ft HC', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'ISO 6346'),
          mod('form', 'CIMC custom-mod'),
        ],
      ),
      word(
        'structural_floor_reinforcement_word',
        'structural floor reinforcement word',
        cc('structural_floor_reinforcement', 'structural floor reinforcement', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '12', 'mm'),
          mod('capacity', '28000', 'kg'),
        ],
      ),
      word(
        'thermal_insulation_panel_word',
        'thermal insulation panel word',
        cc('thermal_insulation_panel', 'thermal insulation panel', null, 'ceramic'),
        [
          mod('quantity', '×1'),
          mod('form', 'mineral wool'),
          mod('dimension', '100', 'mm'),
          mod('regulatory', 'B-s1,d0 EN 13501-1'),
        ],
      ),
      word(
        'door_assembly_double_leaf_word',
        'door assembly double leaf word',
        cc('door_assembly_double_leaf', 'door assembly double leaf', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'IP54'),
        ],
      ),
      word(
        'grounding_lug_set_word',
        'grounding lug set word',
        cc('grounding_lug_set', 'grounding lug set', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×4'),
          mod('form', 'M10 copper'),
        ],
      ),
    ],
  )

  return {
    module: 'structure_containment',
    module_brief: 'Houses the BESS in a 40-foot HC ISO container with reinforced floor, mineral-wool fire-rated insulation and IP54 double-leaf doors.',
    overview_paragraph_en: '',
    derived_parameters: {
      container_count: 1,
      floor_load_kg: 28000,
    },
    allowed_radicals: [
      'steel',
      'aluminium',
      'mineral_fibre_material',
      'polymer_thermoplastic',
      'electrical_conducting_function',
    ],
    applicability_confidence: 'high',
    sub_modules: [isoContainerShell],
  }
}

// ---------------------------------------------------------------------------
// 9. operator_interface (mapped to hmi_ergonomics in the 14-module taxonomy)
// ---------------------------------------------------------------------------

function emitOperatorInterface(_p: BessParams): DesignModule {
  const hmiTouchscreen = makeSubModule(
    'hmi_touchscreen',
    'HMI touchscreen',
    'displays',
    '15" Siemens Comfort panel + redundant mushroom-head E-stops',
    [
      word(
        'hmi_panel_word',
        'HMI panel word',
        cc('hmi_panel', 'HMI panel', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Siemens TP1500 Comfort'),
          mod('dimension', '15', '"'),
          mod('regulatory', 'IP65'),
        ],
      ),
      word(
        'local_emergency_stop_word',
        'local emergency stop word',
        cc('local_emergency_stop', 'local emergency stop', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'mushroom-head'),
          mod('regulatory', 'Eaton M22-PV'),
        ],
      ),
    ],
  )

  return {
    module: 'hmi_ergonomics',
    module_brief: 'Provides local supervisory display + redundant emergency stop for the container operator.',
    overview_paragraph_en: '',
    derived_parameters: {
      hmi_count: 1,
      estop_count: 2,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'optical_sensing_function',
      'electromechanical_switching_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [hmiTouchscreen],
  }
}

// ---------------------------------------------------------------------------
// 10. interconnect (mapped to maintenance_serviceability / external IO in the
//     14-module taxonomy — used here for AC grid + metering connections)
// ---------------------------------------------------------------------------

function emitInterconnect(_p: BessParams): DesignModule {
  const acGridInterconnect = makeSubModule(
    'ac_grid_interconnect',
    'AC grid interconnect',
    'connects',
    'MV cable gland + 0.5S metering CTs at the PCC',
    [
      word(
        'mv_cable_gland_word',
        'MV cable gland word',
        cc('mv_cable_gland', 'MV cable gland', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×3'),
          mod('form', 'ATEX EEx-d'),
        ],
      ),
      word(
        'grid_pcc_metering_ct_word',
        'grid PCC metering CT word',
        cc('grid_pcc_metering_ct', 'grid PCC metering CT', 'magnetic_coupling_function', 'copper'),
        [
          mod('quantity', '×3'),
          mod('regulatory', '0.5S accuracy'),
        ],
      ),
    ],
  )

  return {
    module: 'maintenance_serviceability',
    module_brief: 'Terminates the AC export at the grid point of common coupling via MV glands and 0.5S accuracy CTs for revenue metering. Provides service-side electrical access to PCC for inspection + isolation.',
    overview_paragraph_en: '',
    derived_parameters: {
      phase_count: 3,
    },
    allowed_radicals: [
      'electrical_conducting_function',
      'magnetic_coupling_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [acGridInterconnect],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: BessParams): CrossModuleGrammarLink[] {
  return [
    {
      from_module: 'energy_storage_source',
      to_module: 'power_distribution',
      mechanism: 'dc_busbar',
      type: 'mutual',
      detail: `${p.dcBusVoltageV} V DC pack bus ${p.busContinuousA.toFixed(0)} A continuous`,
    },
    {
      from_module: 'power_distribution',
      to_module: 'energy_conversion_transduction',
      mechanism: 'dc_busbar',
      type: 'mutual',
      detail: `${p.dcBusVoltageV} V DC link to PCS`,
    },
    {
      from_module: 'energy_storage_source',
      to_module: 'control_compute_communication',
      mechanism: 'can_bus',
      type: 'directional',
      detail: 'BMS slave → master',
    },
    {
      from_module: 'environmental_interface',
      to_module: 'energy_storage_source',
      mechanism: 'cooling_loop',
      type: 'mutual',
      detail: 'cold-plate manifold per rack',
    },
    {
      from_module: 'safety_protection',
      to_module: 'control_compute_communication',
      mechanism: 'alarm_interlock',
      type: 'directional',
      detail: 'thermal + smoke + IMD trip → EMS',
    },
    {
      from_module: 'safety_protection',
      to_module: 'power_distribution',
      mechanism: 'imd_trip',
      type: 'directional',
      detail: 'hard-wired contactor trip on insulation fault',
    },
    {
      from_module: 'mass_fluid_transport_process',
      to_module: 'environmental_interface',
      mechanism: 'cooling_loop',
      type: 'mutual',
      detail: 'glycol/water loop to chiller',
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'energy_conversion_transduction',
      mechanism: 'modbus_tcp',
      type: 'mutual',
      detail: 'PCS controller telemetry',
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'environmental_interface',
      mechanism: 'modbus_tcp',
      type: 'mutual',
      detail: 'chiller controller',
    },
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'structure_containment',
      mechanism: 'mechanical_mount',
      type: 'directional',
      detail: 'PCS skid weld + anti-vibration mounts',
    },
    {
      from_module: 'energy_storage_source',
      to_module: 'structure_containment',
      mechanism: 'mechanical_mount',
      type: 'directional',
      detail: 'rack bolts to reinforced floor',
    },
    {
      from_module: 'environmental_interface',
      to_module: 'structure_containment',
      mechanism: 'mechanical_mount',
      type: 'directional',
      detail: 'chiller bolts to skid + roof penetration',
    },
    {
      from_module: 'hmi_ergonomics',
      to_module: 'control_compute_communication',
      mechanism: 'hmi_data',
      type: 'mutual',
      detail: 'HMI ↔ EMS over Modbus TCP',
    },
    {
      from_module: 'maintenance_serviceability',
      to_module: 'energy_conversion_transduction',
      mechanism: 'ac_busbar',
      type: 'mutual',
      detail: '400 V AC PCS output to MV transformer primary',
    },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE — deterministic mission statement; the rest are
// placeholders the LLM narrator fills.
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: BessParams, _brief: unknown): BriefOverviewProse {
  return {
    overview_and_context: '',
    mission_statement: `Deliver ${(p.usableKwh / 1000).toFixed(2)} MWh of usable energy and ${(p.continuousPowerKw / 1000).toFixed(1)} MW continuous (${(p.peakPowerKw / 1000).toFixed(2)} MW peak) discharge from a single containerised LFP BESS at IEC 62619 safety standards.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC ENTRY POINT
// ---------------------------------------------------------------------------

/**
 * Emit a deterministic BESS design from the EngineeringContract.
 *
 * The Generator (Stage 1.7) is replaced by this function for product_class
 * === 'bess'. All numerical fields read from contract.quantities; the
 * structural template (modules, sub-modules, words, radicals) is fixed.
 *
 * The LLM narrator is invoked AFTER this emitter and writes only into
 * `overview_paragraph_en`, `sub_modules[*].english_sentence`, and the
 * three placeholder fields under `brief_overview_prose`. All other fields
 * are immutable downstream.
 */
export function emitBessDesign(contract: ContractShape, brief: unknown): DeterministicDesign {
  const p = deriveBessParams(contract)
  const modules: DesignModule[] = [
    emitEnergyStorageSource(p),
    emitEnergyConversionTransduction(p),
    emitControlComputeCommunication(p),
    emitPowerDistribution(p),
    emitEnvironmentalInterface(p),
    emitMassFluidTransportProcess(p),
    emitSafetyProtection(p),
    emitStructureContainment(p),
    emitOperatorInterface(p),
    emitInterconnect(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 10 canonical modules apply to utility-scale containerised BESS.',
    brief_overview_prose: emitBriefOverviewProse(p, brief),
  }
}
