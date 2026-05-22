/**
 * scripts/lib/orchestrator/emitters/cgm.ts
 *
 * CONTINUOUS GLUCOSE MONITOR (DISPOSABLE WEARABLE) DETERMINISTIC
 * EMITTER. Hand-tuned 2026-05-22 (Build #20b).
 *
 * The 8 modules emitted:
 *   1. sensor_electrode                → energy_conversion_transduction
 *   2. sensor_implant_housing          → structure_containment
 *   3. applicator_inserter             → mass_fluid_transport_process (delivery)
 *   4. transmitter_PCBA                → control_compute_communication
 *   5. wireless_radio_antenna          → (sub-module of #4)
 *   6. primary_battery                 → energy_storage_source
 *   7. biocompatible_polymer           → safety_protection (skin contact)
 *   8. smartphone_app_interface        → hmi_ergonomics
 *
 * Real-part references: Abbott FreeStyle Libre 3, Dexcom G7, Senseonics
 * Eversense XL. Nordic nRF52805 BLE 5.x SoC; SR416 silver oxide coin
 * cell; 3M 9871 transparent breathable adhesive; Pt-coated stainless
 * microneedle.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// Shape types
// ---------------------------------------------------------------------------

type Radical = string

interface ModifierCharacter { kind: string; value: string; unit?: string }

interface ContentCharacter {
  character_id: string; name_human: string
  function_radical_primary: Radical | null; function_radical_secondary: Radical | null
  material_radical_primary: Radical | null; material_radical_secondary: Radical | null
}

interface Word { id: string; name_human: string; content_character: ContentCharacter; modifier_characters: ModifierCharacter[] }

interface SubModule {
  id: string; name_human: string; english_sentence: string; rad_syntax: string
  role_verb: string; topology_clause: string; words: Word[]
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string, name_human: string,
  fp: Radical | null, mp: Radical | null,
  fs: Radical | null = null, ms: Radical | null = null,
): ContentCharacter {
  return { character_id, name_human, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const modsOrdered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    return tokens.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

function makeSubModule(id: string, name_human: string, role_verb: string, topology_clause: string, words: Word[]): SubModule {
  return { id, name_human, english_sentence: '', rad_syntax: synthesizeRadSyntax(words), role_verb, topology_clause, words }
}

// ---------------------------------------------------------------------------
// PARAMETERS
// ---------------------------------------------------------------------------

interface CgmParams {
  wearDurationDays: number
  targetMardPct: number
  microneedleLengthMm: number
  bodyMassG: number
  batteryVoltageV: number
  batteryCapacityMah: number
  batteryCapacityMwh: number
  powerConsumptionMw: number
  bleTxPowerDbm: number
  operatingTempMinC: number
  operatingTempMaxC: number
  glucoseRangeMin: number
  glucoseRangeMax: number
  readingIntervalMin: number
}

function deriveParams(c: ContractInProgress): CgmParams {
  return {
    wearDurationDays: q(c, 'wear_duration_days', 14),
    targetMardPct: q(c, 'sensor_mard_pct', 10),
    microneedleLengthMm: q(c, 'microneedle_length_mm', 5),
    bodyMassG: q(c, 'body_mass_g', 5),
    batteryVoltageV: q(c, 'battery_voltage_v', 1.55),
    batteryCapacityMah: q(c, 'battery_capacity_mah', 8),
    batteryCapacityMwh: q(c, 'battery_capacity_mwh', 12.4),
    powerConsumptionMw: q(c, 'power_consumption_mw', 0.04),
    bleTxPowerDbm: q(c, 'ble_tx_power_dbm', 0),
    operatingTempMinC: q(c, 'operating_temp_min_c', 20),
    operatingTempMaxC: q(c, 'operating_temp_max_c', 43),
    glucoseRangeMin: q(c, 'glucose_range_mg_dl_min', 40),
    glucoseRangeMax: q(c, 'glucose_range_mg_dl_max', 400),
    readingIntervalMin: q(c, 'reading_interval_min', 5),
  }
}

// ---------------------------------------------------------------------------
// MODULE 1: sensor_electrode — energy_conversion_transduction
// ---------------------------------------------------------------------------

function emitSensorElectrode(p: CgmParams): DesignModule {
  const sensorSm = makeSubModule(
    'glucose_electrode_stack',
    'glucose electrode stack',
    'transduces',
    `interstitial-fluid glucose (${p.glucoseRangeMin.toFixed(0)}-${p.glucoseRangeMax.toFixed(0)} mg/dL) into amperometric current via glucose-oxidase enzymatic reaction`,
    [
      word(
        'enzyme_electrode_assembly_word',
        'enzyme electrode assembly',
        cc('enzyme_electrode_assembly', 'enzyme electrode assembly', 'electrochemical_energy_function', 'platinum'),
        [
          mod('quantity', '×1'),
          mod('form', 'Pt working + Ag/AgCl reference + carbon counter'),
          mod('regulatory', 'ISO 15197 glucose-oxidase enzymatic'),
        ],
      ),
      word(
        'glucose_oxidase_coating_word',
        'glucose oxidase coating',
        cc('glucose_oxidase_coating', 'glucose oxidase enzyme coating', 'chemical_sensing_function', 'enzyme_glucose_oxidase'),
        [
          mod('quantity', '×1'),
          mod('form', 'cross-linked GOx + diffusion-limiting membrane'),
        ],
      ),
      word(
        'platinum_working_electrode_word',
        'platinum working electrode',
        cc('platinum_working_electrode', 'platinum working electrode', 'electrical_conducting_function', 'platinum'),
        [
          mod('quantity', '×1'),
          mod('dimension', '0.5', 'mm² active area'),
        ],
      ),
      word(
        'reference_electrode_silver_chloride_word',
        'reference electrode Ag/AgCl',
        cc('reference_electrode_silver_chloride', 'Ag/AgCl reference electrode', 'electrical_conducting_function', 'silver'),
        [
          mod('quantity', '×1'),
          mod('form', 'Ag/AgCl pseudo-reference'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Three-electrode amperometric glucose sensor stack: platinum working electrode coated with cross-linked glucose oxidase + diffusion-limiting membrane, Ag/AgCl reference, carbon counter. Target MARD ${p.targetMardPct.toFixed(1)}% against YSI reference per ISO 15197.`,
    overview_paragraph_en: '',
    derived_parameters: {
      mard_pct: p.targetMardPct,
      glucose_range_low_mgdl: p.glucoseRangeMin,
      glucose_range_high_mgdl: p.glucoseRangeMax,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'chemical_sensing_function',
      'electrical_conducting_function',
      'platinum',
      'silver',
    ],
    applicability_confidence: 'high',
    sub_modules: [sensorSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 2: sensor_implant_housing — structure_containment
// ---------------------------------------------------------------------------

function emitImplantHousing(p: CgmParams): DesignModule {
  const housingSm = makeSubModule(
    'implant_housing',
    'sensor implant housing',
    'seals',
    `electrode + ${p.microneedleLengthMm.toFixed(1)} mm microneedle in IP68 polycarbonate body with 3M 9871 adhesive base`,
    [
      word(
        'molded_housing_pp_word',
        'molded housing PP',
        cc('molded_housing_pp', 'molded polypropylene housing', 'mechanical_attachment_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'transparent PP injection-moulded'),
          mod('regulatory', 'ISO 10993-5/10 biocompatible'),
        ],
      ),
      word(
        'sealed_enclosure_polymer_word',
        'sealed enclosure polymer',
        cc('sealed_enclosure_polymer', 'sealed enclosure', 'mechanical_attachment_function', 'polymer_thermoset'),
        [
          mod('quantity', '×1'),
          mod('form', 'IP68 epoxy potting + RF window'),
        ],
      ),
      word(
        'microneedle_array_word',
        'microneedle array',
        cc('microneedle_array', 'platinum-coated microneedle array', 'mechanical_penetration_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', p.microneedleLengthMm.toFixed(1), 'mm'),
          mod('form', 'Pt-coated stainless steel'),
        ],
      ),
    ],
  )

  return {
    module: 'structure_containment',
    module_brief: `IP68 polypropylene + epoxy-potted housing seals the electrode stack and ${p.microneedleLengthMm.toFixed(1)} mm Pt-coated microneedle. Body mass ${p.bodyMassG.toFixed(1)} g.`,
    overview_paragraph_en: '',
    derived_parameters: {
      body_mass_g: p.bodyMassG,
      microneedle_length_mm: p.microneedleLengthMm,
    },
    allowed_radicals: [
      'mechanical_attachment_function',
      'mechanical_penetration_function',
      'polymer_thermoplastic',
      'polymer_thermoset',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [housingSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 3: applicator_inserter — mass_fluid_transport_process (delivery)
// ---------------------------------------------------------------------------

function emitApplicator(_p: CgmParams): DesignModule {
  const applicatorSm = makeSubModule(
    'applicator_inserter',
    'single-use applicator inserter',
    'deploys',
    'microneedle through the skin via spring-loaded plunger, then retracts',
    [
      word(
        'applicator_inserter_word',
        'applicator inserter',
        cc('applicator_inserter', 'spring-loaded applicator inserter', 'mechanical_compression_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'compressed-spring single-use applicator'),
          mod('regulatory', 'ISO 11608 needle-based delivery'),
        ],
      ),
      word(
        'spring_actuator_word',
        'spring actuator',
        cc('spring_actuator', 'spring actuator', 'mechanical_compression_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', '316L stainless steel torsion spring'),
        ],
      ),
      word(
        'safety_interlock_word',
        'safety interlock',
        cc('safety_interlock', 'safety interlock', 'mechanical_attachment_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'ISO 11608 pre-fire safety'),
        ],
      ),
    ],
  )

  return {
    module: 'mass_fluid_transport_process',
    module_brief: 'Single-use spring-loaded applicator inserts the microneedle to subcutaneous depth and immediately retracts, leaving the sensor body adhered to the skin. ISO 11608 safety interlock prevents pre-fire.',
    overview_paragraph_en: '',
    derived_parameters: {
      applicator_count: 1,
    },
    allowed_radicals: [
      'mechanical_compression_function',
      'mechanical_attachment_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [applicatorSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 4: transmitter_PCBA + wireless_radio_antenna — control_compute_communication
// ---------------------------------------------------------------------------

function emitTransmitterPCBA(p: CgmParams): DesignModule {
  const pcbaSm = makeSubModule(
    'transmitter_pcba',
    'transmitter PCBA',
    'digitises',
    `nano-ampere amperometric signal and transmits at BLE 5.x every ${p.readingIntervalMin.toFixed(0)} minutes`,
    [
      word(
        'nrf52805_pcb_assembly_word',
        'nRF52805 PCB assembly',
        cc('nrf52805_pcb_assembly', 'Nordic nRF52805 PCB assembly', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Nordic nRF52805 BLE 5.x SoC + matching network'),
          mod('regulatory', 'FCC/CE/Bluetooth SIG 5.x'),
        ],
      ),
      word(
        'precision_potentiostat_word',
        'precision potentiostat',
        cc('precision_potentiostat', 'precision potentiostat front-end', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'TI LMP91000 / similar electrochemical AFE'),
        ],
      ),
      word(
        'rtc_quartz_oscillator_word',
        'RTC quartz oscillator',
        cc('rtc_quartz_oscillator', 'RTC quartz oscillator', 'silicon_semiconductor_function', 'ceramic'),
        [
          mod('quantity', '×1'),
          mod('form', '32.768 kHz crystal'),
        ],
      ),
      word(
        'flash_memory_word',
        'flash memory',
        cc('flash_memory', 'flash memory', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '512 kB on-die flash'),
        ],
      ),
    ],
  )

  const antennaSm = makeSubModule(
    'wireless_radio_antenna',
    'wireless radio antenna',
    'radiates',
    `BLE 5.x telemetry at ${p.bleTxPowerDbm.toFixed(0)} dBm through PP RF window`,
    [
      word(
        'pcb_chip_antenna_word',
        'PCB chip antenna',
        cc('pcb_chip_antenna', 'PCB chip antenna', 'electromagnetic_radiation_function', 'ceramic'),
        [
          mod('quantity', '×1'),
          mod('form', '2.4 GHz Johanson chip antenna'),
        ],
      ),
      word(
        'matching_network_word',
        'matching network',
        cc('matching_network', 'antenna matching network', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'pi-network L-C tuned for 2.4 GHz'),
        ],
      ),
    ],
  )

  return {
    module: 'control_compute_communication',
    module_brief: `Nordic nRF52805 BLE 5.x SoC with electrochemical analog front-end and 32.768 kHz RTC. Transmits a 14-bit glucose reading every ${p.readingIntervalMin.toFixed(0)} minutes at ${p.bleTxPowerDbm.toFixed(0)} dBm through a 2.4 GHz chip antenna.`,
    overview_paragraph_en: '',
    derived_parameters: {
      tx_power_dbm: p.bleTxPowerDbm,
      reading_interval_min: p.readingIntervalMin,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electromagnetic_radiation_function',
      'electrical_conducting_function',
      'polymer_thermoplastic',
      'ceramic',
    ],
    applicability_confidence: 'high',
    sub_modules: [pcbaSm, antennaSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 6: primary_battery — energy_storage_source
// ---------------------------------------------------------------------------

function emitPrimaryBattery(p: CgmParams): DesignModule {
  const batterySm = makeSubModule(
    'silver_oxide_battery',
    'silver oxide primary cell',
    'powers',
    `${p.wearDurationDays.toFixed(0)}-day wearable from ${p.batteryCapacityMwh.toFixed(1)} mWh SR416 coin cell at ${p.powerConsumptionMw.toFixed(3)} mW average draw`,
    [
      word(
        'silver_oxide_battery_word',
        'silver oxide battery',
        cc('silver_oxide_battery', 'silver oxide coin cell', 'electrochemical_energy_function', 'silver'),
        [
          mod('quantity', '×1'),
          mod('form', 'SR416 coin cell'),
          mod('dimension', p.batteryVoltageV.toFixed(2), 'V'),
          mod('capacity', p.batteryCapacityMah.toFixed(0), 'mAh'),
          mod('regulatory', 'UN3496 silver oxide'),
        ],
      ),
      word(
        'battery_holder_word',
        'battery holder',
        cc('battery_holder', 'battery holder', 'electrical_conducting_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'SMD spring contact holder'),
        ],
      ),
      word(
        'power_management_ic_word',
        'power management IC',
        cc('power_management_ic', 'power management IC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '1.55 V → 1.8 V buck-boost + LDO'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `Non-rechargeable SR416 silver oxide coin cell (${p.batteryVoltageV.toFixed(2)} V, ${p.batteryCapacityMah.toFixed(0)} mAh = ${p.batteryCapacityMwh.toFixed(1)} mWh) powers the wearable for ${p.wearDurationDays.toFixed(0)} days at ${p.powerConsumptionMw.toFixed(3)} mW average draw via buck-boost + LDO power management.`,
    overview_paragraph_en: '',
    derived_parameters: {
      battery_capacity_mwh: p.batteryCapacityMwh,
      average_power_mw: p.powerConsumptionMw,
      wear_duration_days: p.wearDurationDays,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'silver',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [batterySm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 7: biocompatible_polymer (adhesive) — safety_protection (skin contact)
// ---------------------------------------------------------------------------

function emitBiocompatiblePolymer(p: CgmParams): DesignModule {
  const adhesiveSm = makeSubModule(
    'adhesive_patch',
    'skin adhesive patch',
    'attaches',
    `body to skin for ${p.wearDurationDays.toFixed(0)} days via 3M 9871 transparent breathable medical adhesive`,
    [
      word(
        'adhesive_patch_3m_word',
        'adhesive patch 3M',
        cc('adhesive_patch_3m', '3M 9871 medical adhesive patch', 'mechanical_attachment_function', 'polymer_pressure_sensitive_adhesive'),
        [
          mod('quantity', '×1'),
          mod('form', '3M 9871 transparent breathable polyurethane'),
          mod('dimension', '25', 'mm dia'),
          mod('regulatory', 'ISO 10993-5/10 skin long-term'),
        ],
      ),
      word(
        'release_liner_word',
        'release liner',
        cc('release_liner', 'release liner', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'silicone-coated paper'),
        ],
      ),
      word(
        'overpatch_optional_word',
        'overpatch optional',
        cc('overpatch_optional', 'overpatch (optional)', 'mechanical_attachment_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'transparent breathable, single use'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_protection',
    module_brief: `3M 9871 transparent breathable polyurethane medical-grade pressure-sensitive adhesive secures the body to skin for ${p.wearDurationDays.toFixed(0)} days. ISO 10993-5/10 cytotoxicity / irritation tested. Optional overpatch for sports/water.`,
    overview_paragraph_en: '',
    derived_parameters: {
      wear_duration_days: p.wearDurationDays,
    },
    allowed_radicals: [
      'mechanical_attachment_function',
      'polymer_pressure_sensitive_adhesive',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [adhesiveSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 8: smartphone_app_interface — hmi_ergonomics
// ---------------------------------------------------------------------------

function emitSmartphoneApp(p: CgmParams): DesignModule {
  const appSm = makeSubModule(
    'smartphone_app',
    'smartphone reader app',
    'displays',
    `glucose curves, alarms and trend arrows updating every ${p.readingIntervalMin.toFixed(0)} minutes via Bluetooth Low Energy`,
    [
      word(
        'ios_companion_app_word',
        'iOS companion app',
        cc('ios_companion_app', 'iOS companion app', 'optical_radiation_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×1'),
          mod('form', 'iOS 16+ / iPadOS, native Swift'),
          mod('regulatory', 'FDA 510(k) Class II Software-as-a-Medical-Device + IEC 62304 Class C'),
        ],
      ),
      word(
        'android_companion_app_word',
        'Android companion app',
        cc('android_companion_app', 'Android companion app', 'optical_radiation_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×1'),
          mod('form', 'Android 11+ Kotlin native'),
          mod('regulatory', 'FDA 510(k) Class II SaMD + IEC 62304 Class C'),
        ],
      ),
      word(
        'cloud_data_sync_word',
        'cloud data sync',
        cc('cloud_data_sync', 'cloud data sync', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'HIPAA + GDPR encrypted REST API'),
        ],
      ),
      word(
        'hypoglycaemia_alarm_word',
        'hypoglycaemia alarm',
        cc('hypoglycaemia_alarm', 'hypoglycaemia alarm', 'acoustic_radiation_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×1'),
          mod('form', 'audible + haptic + push notification'),
          mod('regulatory', 'IEC 60601-1-8 alarm logic'),
        ],
      ),
    ],
  )

  return {
    module: 'hmi_ergonomics',
    module_brief: 'iOS + Android native companion apps display real-time glucose curves, prioritised audible / haptic / push hypoglycaemia alarms, and trend arrows. HIPAA + GDPR compliant encrypted cloud sync. FDA 510(k) Class II Software-as-a-Medical-Device + IEC 62304 Class C.',
    overview_paragraph_en: '',
    derived_parameters: {
      platforms_supported: 2,
    },
    allowed_radicals: [
      'optical_radiation_function',
      'acoustic_radiation_function',
      'silicon_semiconductor_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [appSm],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(_p: CgmParams) {
  return [
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'control_compute_communication',
      mechanism: 'data',
      type: 'directional' as const,
      detail: 'electrode current (~nA) → potentiostat AFE → MCU',
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'hmi_ergonomics',
      mechanism: 'data',
      type: 'directional' as const,
      detail: 'BLE 5.x telemetry to smartphone app',
    },
    {
      from_module: 'energy_storage_source',
      to_module: 'control_compute_communication',
      mechanism: 'electrical_bus',
      type: 'directional' as const,
      detail: 'SR416 cell → buck-boost → 1.8 V VDD',
    },
    {
      from_module: 'mass_fluid_transport_process',
      to_module: 'energy_conversion_transduction',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'applicator deploys microneedle into electrode chamber',
    },
    {
      from_module: 'safety_protection',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'mutual' as const,
      detail: 'adhesive patch bonded to housing base',
    },
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'electrode stack potted into housing chamber',
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'PCBA + antenna + battery sealed in epoxy potting',
    },
    {
      from_module: 'hmi_ergonomics',
      to_module: 'safety_protection',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'app raises IEC 60601-1-8 prioritised alarms on critical glucose excursion',
    },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: CgmParams) {
  return {
    overview_and_context: '',
    mission_statement: `Deliver a ${p.wearDurationDays.toFixed(0)}-day single-use enzymatic-electrochemical continuous glucose monitor with MARD ≤ ${p.targetMardPct.toFixed(1)}% across ${p.glucoseRangeMin.toFixed(0)}-${p.glucoseRangeMax.toFixed(0)} mg/dL glucose range, BLE 5.x telemetry to a smartphone reader app, and ISO 15197 / FDA 510(k) Class II conformance.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

export const emitCgmDesign: ClassEmitter = (
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitSensorElectrode(p),
    emitImplantHousing(p),
    emitApplicator(p),
    emitTransmitterPCBA(p),
    emitPrimaryBattery(p),
    emitBiocompatiblePolymer(p),
    emitSmartphoneApp(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '7 modules cover the canonical disposable CGM (sensor + housing + applicator + transmitter PCBA + primary battery + biocompatible polymer + smartphone app).',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

registerAssembler('cgm', emitCgmDesign)
