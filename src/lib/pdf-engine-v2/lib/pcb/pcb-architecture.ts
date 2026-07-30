/**
 * @file Universal PCB architecture planner (shadow v1).
 * @description Separates "the design contains electronics" from "the design needs
 * a bespoke PCB". Function quantities and procurement evidence select zero, one,
 * or multiple board roles before any Atopile project is generated.
 */

import { collectElectronicWords } from './pcb-stage'

import type { ElectronicWordRef } from './pcb-stage'
import { hasOdOpticalFormEvidence } from './pcb-stage'
import { isHostHatActuationDrivePublished as forgeHostHatDrivePublished } from './pcb-host-hat-actuation-drive'

export type PcbSystemDisposition =
  | 'not_applicable'
  | 'cots_only'
  | 'daughterboard'
  | 'single_custom'
  | 'multi_board'
  | 'unresolved'

export interface PcbBoardShapeDatum {
  id: string
  valueMm: number
  basis: string
}

export interface PcbBoardShapeContract {
  shapeFamily: string
  outlineBasis: string
  datums?: PcbBoardShapeDatum[]
  mountingHoles: number
  rationale: string
}

export interface PcbDeferredChannelRequirement {
  role: string
  count: number
  /** Why this is not yet a fitted KiCad channel requirement. */
  reason: string
}

export interface PcbBoardPlan {
  boardId: string
  role: string
  requiredWordIds: string[]
  domains: Array<'logic' | 'analog' | 'power' | 'high_voltage' | 'wet_interface' | 'thermal_actuation' | 'motion_actuation'>
  channelRequirements: Array<{ role: string; count: number }>
  /**
   * Product need kept honest without minting fitted drivers.
   * INTENT: stir/pump remain here until published HAT electrical topology exists
   * (Pioreactor gold @ ca40a91e — inventing DRV8876 fails proveCatch).
   */
  deferredChannelRequirements?: PcbDeferredChannelRequirement[]
  workPerformed: string[]
  shape: PcbBoardShapeContract
  requiresKiCadDeliverable: boolean
}

/**
 * @description True when a curated host-HAT drive topology is published for
 * stir/pump (or equivalent culture actuation). Universal — no product name.
 * DECISION: Pioreactor gold HAT KiCad stays unpublished; Forge fixture
 * `forge-host-hat-actuation-drive/v1` is the publication gate (proveCatch).
 */
export function isHostHatActuationDrivePublished(
  _state: Record<string, unknown> = {},
): boolean {
  void _state
  return forgeHostHatDrivePublished()
}

export interface PcbWordAssignment {
  wordId: string
  placement:
    | 'on_board'
    | 'off_board_module'
    | 'interconnect_only'
    | 'mechanical_only'
    | 'functional_requirement'
    | 'passive_geometry'
    | 'unassigned'
  boardId?: string
  reasons: string[]
}

export interface PcbArchitecturePlan {
  schema: 'pcb-architecture/v1'
  systemDisposition: PcbSystemDisposition
  requiresAnyKiCadDeliverable: boolean
  assignments: PcbWordAssignment[]
  boards: PcbBoardPlan[]
  unassignedWordIds: string[]
  rationale: string[]
  confidence: 'high' | 'medium' | 'low'
  /**
   * INTENT (Sol+Fable 2026-07-27): Gate 38 footprint coverage denominator.
   * Sum of quantities for words assigned `on_board` — excludes heatsink/fan/
   * purchased modules so an honest ≥80% is reachable without green-washing.
   */
  onBoardElectronicPartCount: number
}

/**
 * @description Sum design quantities for architecture `on_board` assignments.
 */
export function countOnBoardElectronicParts(
  assignments: PcbWordAssignment[],
  words: ElectronicWordRef[],
): number {
  const byId = new Map(words.map((w) => [w.wordId, w]))
  let total = 0
  for (const assignment of assignments) {
    if (assignment.placement !== 'on_board') continue
    total += byId.get(assignment.wordId)?.quantity ?? 1
  }
  return total
}

function quantity(state: Record<string, unknown>, key: string): number | null {
  for (const holderName of ['orchestratorContract', 'engineeringContract'] as const) {
    const holder = state[holderName] as { quantities?: Record<string, unknown> } | undefined
    const raw = holder?.quantities?.[key]
    const value = typeof raw === 'object' && raw !== null && 'value' in raw
      ? (raw as { value?: unknown }).value
      : raw
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function firstPositiveQuantity(
  state: Record<string, unknown>,
  keys: string[],
  fallback: number,
): number {
  for (const key of keys) {
    const value = quantity(state, key)
    if (value !== null && value > 0) return Math.max(1, Math.floor(value))
  }
  return fallback
}

function contractRecord(state: Record<string, unknown>): Record<string, unknown> {
  for (const holderName of ['orchestratorContract', 'engineeringContract'] as const) {
    const holder = state[holderName]
    if (typeof holder === 'object' && holder !== null && !Array.isArray(holder)) {
      return holder as Record<string, unknown>
    }
  }
  return {}
}

function topologyChannelCount(state: Record<string, unknown>, rolePattern: RegExp): number {
  const topology = contractRecord(state).topology
  if (!Array.isArray(topology)) return 0
  const matchingEndpoints = new Set<string>()
  const indexedEndpoints = new Set<string>()
  let hasContextOnlyMatch = false
  for (const edge of topology) {
    if (typeof edge !== 'object' || edge === null || Array.isArray(edge)) continue
    const record = edge as Record<string, unknown>
    const endpoints = [record.from_part, record.to_part]
      .filter((value): value is string => typeof value === 'string')
      .filter((value) => rolePattern.test(value))
    for (const endpoint of endpoints) {
      const normalized = endpoint.toLowerCase()
      matchingEndpoints.add(normalized)
      const indexMatch = normalized.match(/(?:_|-)(\d+)$/)
      if (indexMatch) indexedEndpoints.add(indexMatch[1])
    }
    if (endpoints.length === 0 && rolePattern.test(evidenceText(record))) {
      hasContextOnlyMatch = true
    }
  }
  if (indexedEndpoints.size > 0) return indexedEndpoints.size
  return matchingEndpoints.size > 0 || hasContextOnlyMatch ? 1 : 0
}

function derivedChannelCount(
  state: Record<string, unknown>,
  quantityKeys: string[],
  topologyPattern: RegExp,
  fallback: number,
): number {
  const quantityCount = firstPositiveQuantity(state, quantityKeys, 0)
  if (quantityCount > 0) return quantityCount
  return Math.max(topologyChannelCount(state, topologyPattern), fallback)
}

function evidenceText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(evidenceText).join(' ')
  if (typeof value !== 'object' || value === null) return ''
  return Object.values(value as Record<string, unknown>).map(evidenceText).join(' ')
}

function architectureEvidenceBlob(state: Record<string, unknown>): string {
  const parsedBrief = state.parsedBrief as Record<string, unknown> | undefined
  const contract = contractRecord(state)
  const electronicWords = collectElectronicWords(state)
    .map((word) => `${word.wordId} ${word.nameHuman} ${word.characterId} ${Object.values(word.modifiers).join(' ')}`)
    .join(' ')
  return [
    electronicWords,
    parsedBrief?.original_text,
    parsedBrief?.product_description,
    contract.topology,
    contract.macro_assembly_prices,
  ].map(evidenceText).join(' ').toLowerCase()
}

function hasFinishedMotionStack(state: Record<string, unknown>): boolean {
  const text = architectureEvidenceBlob(state)
  const hasControllerCarrier =
    /\b(?:arduino|single.board.computer|raspberry|mcu|microcontroller|controller)\b/.test(text)
  const hasFinishedDriverCarrier =
    /\b(?:cnc\s*shield|motor.controller.board|sangaboard|stepper.driver.(?:module|carrier)|plug.in.stepper.driver)\b/.test(text)
  return hasControllerCarrier && hasFinishedDriverCarrier
}

/**
 * INTENT (Sol+Fable 2026-07-27): bare `channel_count` used to mint a
 * motion_driver_board — wrong physics for multi-channel electrical instruments
 * (cell cycler / AFE / power-stage). Domain evidence selects the board family.
 */
function hasMotionChannelEvidence(state: Record<string, unknown>): boolean {
  const text = architectureEvidenceBlob(state)
  return /\b(?:stepper|servo|bldc|lead[_\s-]?screw|gantry|cnc|motion[_\s-]?channel|motor[_\s-]?(?:driver|channel|axis)|axis[_\s-]?count)\b/.test(text)
}

function hasElectricalChannelEvidence(state: Record<string, unknown>): boolean {
  const text = architectureEvidenceBlob(state)
  // GOTCHA: trailing `\b` fails mid-token (`discharge_load_mosfet` — after `load`
  // the next `_` is still a word char). Use underscore-aware edges.
  return /(?:^|[_ -])(?:precision[_ -]?afe|afe|source[_ -]?sink|charge[_ -]?current|discharge[_ -]?(?:load|mosfet|pass)|current[_ -]?shunt|kelvin|cell[_ -]?thermistor|over[_ -]?(?:current|temp|under[_ -]?voltage)|reverse[_ -]?polarity|hardware[_ -]?cutout|cell[_ -]?cycler|potentiostat|galvanostat)(?:$|[_ -])/i
    .test(` ${text} `)
}

function datum(id: string, valueMm: number, basis: string): PcbBoardShapeDatum {
  return { id, valueMm, basis }
}

function board(
  boardId: string,
  role: string,
  domains: PcbBoardPlan['domains'],
  datums: PcbBoardShapeDatum[] = [],
): PcbBoardPlan {
  const phenotype: Record<string, { work: string[]; shape: string; basis: string; holes: number }> = {
    optical_source_daughterboard: { work: ['drive_optical_source', 'mate_source_harness'], shape: 'optical_registration_plate', basis: 'optical_axis_and_cube_face', holes: 4 },
    thermal_power_controller: { work: ['sense_sample_temperature', 'drive_heater_peltier_fan', 'enforce_thermal_cutoff'], shape: 'thermal_power_base', basis: 'thermal_connectors_and_heatsink', holes: 4 },
    motion_driver_board: { work: ['drive_repeated_motion_channels', 'sense_channel_current'], shape: 'linear_channel_spine', basis: 'channel_count_and_connector_pitch', holes: 4 },
    channel_power_afe_controller: {
      work: ['source_sink_channel_power', 'measure_channel_voltage_current', 'enforce_channel_safety_trips'],
      shape: 'multi_channel_power_afe',
      basis: 'channel_count_and_power_dissipation',
      holes: 4,
    },
    analog_front_end_shield: { work: ['drive_cell_voltage', 'measure_cell_current', 'switch_measurement_range'], shape: 'precision_analog_shield', basis: 'host_header_and_guarded_input_edge', holes: 4 },
    wet_lab_hat: { work: ['interface_host_compute', 'isolate_wet_peripherals'], shape: 'wet_lab_hat', basis: 'host_header_standard', holes: 4 },
    od_optics_board: { work: ['drive_od_source', 'measure_od_detector'], shape: 'optical_registration_plate', basis: 'vial_optical_axis', holes: 2 },
    heater_stir_actuation_board: { work: ['drive_heater_stir_pumps', 'sense_wet_actuation_faults'], shape: 'wet_actuation_base', basis: 'wet_connector_edge_and_power_dissipation', holes: 4 },
    high_voltage_controller: { work: ['generate_high_voltage', 'isolate_high_voltage', 'switch_electrode_channels'], shape: 'high_voltage_controller', basis: 'hv_lv_boundary_and_creepage', holes: 4 },
    electrode_cartridge: { work: ['present_electrode_array', 'route_droplet_channels'], shape: 'electrode_cartridge', basis: 'electrode_pitch_and_cartridge_connector', holes: 2 },
    // INTENT (2026-07-29 JLR red-team): traction MCU control + gate-drive are
    // reviewable FR4 deliverables even when the SiC power stage is purchased.
    traction_gate_drive_board: {
      work: ['isolate_gate_drive', 'desat_protect', 'drive_sic_half_bridges'],
      shape: 'traction_gate_drive',
      basis: 'phase_current_and_creepage_to_hv',
      holes: 6,
    },
    traction_control_board: {
      work: [
        'sense_phase_current',
        'demodulate_resolver',
        'vehicle_can',
        'regulate_lv_rails',
        'isolate_hv_lv_domains',
        'torque_current_limits',
      ],
      shape: 'traction_control',
      basis: 'mcu_sensing_and_vehicle_interface',
      holes: 4,
    },
  }
  const p = phenotype[role] ?? { work: ['implement_board_functions'], shape: 'generic_rectangular', basis: 'component_and_connector_envelope', holes: 4 }
  return {
    boardId, role, requiredWordIds: [], domains, channelRequirements: [],
    workPerformed: p.work,
    shape: {
      shapeFamily: p.shape,
      outlineBasis: p.basis,
      datums,
      mountingHoles: p.holes,
      rationale: `form_follows_${role}`,
    },
    requiresKiCadDeliverable: true,
  }
}

function assignmentBoard(word: ElectronicWordRef, boards: PcbBoardPlan[]): PcbBoardPlan | undefined {
  // GOTCHA: modifier/form prose often copies sibling-assembly blurbs
  // ("optical density (od600) sensor & temperature probe assembly") onto every
  // word in the sub-module — matching against that text steals roles across
  // boards. Board routing keys on word identity only.
  const text = `${word.wordId} ${word.nameHuman} ${word.characterId}`.toLowerCase()
  if (boards.length === 1) {
    const onlyBoard = boards[0]
    if (onlyBoard.role !== 'optical_source_daughterboard') return onlyBoard
    return /led.?source|led.?driver|light.?source|optical.?source|source.?board|illumination|emitter/.test(text)
      ? onlyBoard
      : undefined
  }
  const exactRoleBoard = boards.find((candidate) => {
    if (candidate.role === 'electrode_cartridge') return /electrode|cartridge|array|reservoir/.test(text)
    if (candidate.role === 'high_voltage_controller') {
      return /hv|high.?voltage|switch|boost|isolat|controller|microcontroller|current.?measurement|\btia\b|status.?indicator/.test(text)
    }
    // DECISION: heater/stir/temp roles are matched before OD optics so culture
    // temperature probes cannot be stolen by an OD channel sibling blurb.
    if (candidate.role === 'heater_stir_actuation_board') {
      return /heat(?:er|ing)?|stir|agitat|pump|peltier|\btec\b|cartridge[_ -]?heater|temperature[_ -]?(?:sensor|probe)|culture[_ -]?temperature|(?:host[_ -]?)?ffc[_ -]?connector|magnetic[_ -]?lid|hall[_ -]?sense|drv5021/i.test(text)
    }
    // GOTCHA: bare `led` / `sensor` / `adc` used to steal host power-indicator +
    // rail-protection words onto the OD daughterboard (organoid 1546 token board).
    if (candidate.role === 'od_optics_board') {
      if (/(?:^|[_ -])(?:od|optical[_ -]?density)(?:[_ -]|$)|photodiode|od[_ -]?sensor|density[_ -]?sensor|optical[_ -]?(?:adc|measurement)/i.test(text)) {
        return true
      }
      // INTENT (2026-07-21): anonymous sensing_instrumentation_subcomponent_N
      // carries OD only in form. Allow form match for that proxy alone — heater/
      // temp/stir identity already routed above, so sibling OD-form smear cannot
      // steal culture_temperature_probe onto optics.
      const isSensingProxy = /sensing[_ -]?instrumentation[_ -]?subcomponent[_ -]?\d+/i.test(text)
      const formBlob = Object.values(word.modifiers).join(' ')
      return isSensingProxy && hasOdOpticalFormEvidence(formBlob)
    }
    if (candidate.role === 'wet_lab_hat') {
      return /hat|host|microcontroller|compute|raspberry|interface|usb|firmware|debug|esd|ferrite|polyfuse|reverse[_ -]?polarity|power[_ -]?indicator/i.test(text)
    }
    if (candidate.role === 'traction_gate_drive_board') {
      return /gate[_ -]?driv|desat|half[_ -]?bridge[_ -]?driver|sic[_ -]?driver|isolated[_ -]?driver/i.test(text)
    }
    if (candidate.role === 'traction_control_board') {
      return /(?:oem[_ -]?)?inverter[_ -]?control|control[_ -]?board|phase[_ -]?current|current[_ -]?sense[_ -]?front[_ -]?end|resolver|can[_ -]?fd|vehicle[_ -]?interface|microcontroller|mcu|temperature[_ -]?probe|lv[_ -]?buck|dc[_ -]?link[_ -]?voltage[_ -]?sense|hv[_ -]?lv[_ -]?isolat/i.test(text)
    }
    return false
  })
  if (exactRoleBoard) return exactRoleBoard

  // DECISION: Fall back by electrical function only after role-specific routing.
  // This closes whole-system scope without assigning a wet sensor to whichever
  // board happened to be listed first.
  if (word.categories.includes('analog_frontend')) {
    return boards.find((candidate) => candidate.domains.includes('analog'))
  }
  if (
    word.categories.includes('processor') ||
    word.categories.includes('connectivity') ||
    word.categories.includes('display') ||
    word.categories.includes('board_role')
  ) {
    return boards.find((candidate) => candidate.domains.includes('logic'))
  }
  if (word.categories.includes('power_electronics')) {
    // DECISION: host-rail protection prefers the logic/HAT board when present —
    // wet_actuation is thermal loads, not USB/ESD/polyfuse.
    return boards.find((candidate) => candidate.role === 'wet_lab_hat')
      ?? boards.find((candidate) =>
        candidate.domains.includes('power') || candidate.domains.includes('high_voltage'))
  }
  return undefined
}

/**
 * @description Identity blob for temperature-role routing (word + MPN + character).
 */
function temperatureIdentityBlob(word: ElectronicWordRef): string {
  return [
    word.wordId,
    word.nameHuman,
    word.characterId,
    word.modifiers.part_number ?? '',
    word.modifiers.manufacturer ?? '',
    word.modifiers.form ?? '',
  ].join(' ').toLowerCase()
}

/**
 * @description True when the word is an on-board digital temperature IC
 * (I²C/SPI TMP-class or culture_temperature_probe), not a bare NTC/thermistor.
 */
export function isDigitalTemperatureIc(word: ElectronicWordRef): boolean {
  const blob = temperatureIdentityBlob(word)
  return (
    /culture[_ -]?temperature[_ -]?probe/i.test(blob)
    || /\btmp\d{3,}/i.test(blob)
    || /digital[_ -]?temp(?:erature)?[_ -]?(?:ic|sensor|probe)/i.test(blob)
  )
}

/**
 * @description True when the word is a bare NTC/thermistor-class temperature
 * sensor (analogue, typically 2-pin) — not a digital IC.
 */
export function isBareThermistorTemperatureSensor(word: ElectronicWordRef): boolean {
  if (isDigitalTemperatureIc(word)) return false
  const blob = temperatureIdentityBlob(word)
  return (
    /(?:^|[_ -])(?:temperature[_ -]?sensor|thermistor|\bntc\b)(?:$|[_ -])/i.test(blob)
    || /\bntcg?\d/i.test(blob)
  )
}

function nonBoardPlacement(
  word: ElectronicWordRef,
  state: Record<string, unknown>,
  boards: PcbBoardPlan[],
  allWords: ElectronicWordRef[],
): Omit<PcbWordAssignment, 'wordId'> | null {
  const roleText = `${word.wordId} ${word.nameHuman} ${word.characterId}`.toLowerCase()
  const selectedBoard = assignmentBoard(word, boards) ?? (
    boards.length === 1 ? boards[0] : undefined
  )
  const evidence = architectureEvidenceBlob(state)
  const hasExplicitPartIdentity = [word.modifiers.part_number, word.modifiers.manufacturer]
    .some((value) => Boolean(
      value?.trim() &&
      !/\b(?:tbd|unknown|generic|detailed design)\b/i.test(value),
    ))
  const hasCotsComputeHost =
    /\b(?:raspberry\s*pi|single.board.computer|itsybitsy|pybadge|compute.ui.module)\b/i
      .test(evidence)
  // INTENT: named flash-bearing MCU families OR a bare MCU role word when no
  // COTS host owns persistence. Organoid emits `microcontroller_mcu` with no
  // SAMD/ESP/STM token — without the role check, firmware_storage stays
  // on_board and P7-unresolved forever. COTS-host path above still parks
  // firmware off-board first when a Pi/PyBadge-class host is present.
  const hasBareMcuRole = allWords.some((candidate) =>
    /(?:^|[_ -])(?:microcontroller(?:[_ -]?mcu)?|main[_ -]?controller)(?:$|[_ -])/i
      .test(candidate.characterId))
  const hasIntegratedFirmwareMcu =
    /\b(?:samd21|esp8266|esp32|stm32)\b/i.test(evidence)
    || (!hasCotsComputeHost && hasBareMcuRole)
  // INTENT: a fitted Type-C / USB receptacle land (including usb_c_host_interface
  // as the board's only USB role). Logical `usb_interface` alone is NOT physical.
  const isPhysicalUsbLand = (blob: string): boolean =>
    /usb[_ -]?(?:c[_ -]?)?(?:host[_ -]?)?(?:power[_ -]?entry|connector|receptacle|port)|usb[_ -]?(?:c[_ -]?)?host[_ -]?interface|type[_ -]?c/i
      .test(blob)
  const hasPhysicalUsbEntry = allWords.some((candidate) =>
    isPhysicalUsbLand(`${candidate.wordId} ${candidate.nameHuman} ${candidate.characterId}`))
  const hasOtherPhysicalUsbEntry = allWords.some((candidate) =>
    candidate.wordId !== word.wordId
    && isPhysicalUsbLand(`${candidate.wordId} ${candidate.nameHuman} ${candidate.characterId}`))
  const hasRadioAndDebugAccess =
    allWords.some((candidate) => /wi-?fi|wifi[_ -]?module/i.test(
      `${candidate.wordId} ${candidate.nameHuman} ${candidate.characterId}`,
    )) &&
    allWords.some((candidate) => /debug[_ -]?(?:uart|header)|\buart\b/i.test(
      `${candidate.wordId} ${candidate.nameHuman} ${candidate.characterId}`,
    ))

  if (/mounting.?plate|detector.?mount|standoff|bezel|window.?seal|legend/.test(roleText)) {
    return {
      placement: 'mechanical_only',
      ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
      reasons: ['mechanical_datum_not_fitted_component'],
    }
  }
  // INTENT: Peltier modules, heatsink fans, insulation and TIM pads are purchased
  // thermal assemblies — not PCB footprints (same gold WHY as NinjaPCR TEC path).
  // GOTCHA (Sol+Fable 2026-07-27): `per_channel_power_cooling_fan` never matched
  // heatsink_fan — it was assigned on_board and bloated Gate 38's denominator.
  if (
    /peltier|\btec\b|thermoelectric|cold[_ -]?plate|heatsink(?:[_ -]?fan)?|heat[_ -]?sink|cooling[_ -]?fan|heatsink[_ -]?fan|finned[_ -]?heatsink|thermal[_ -]?insulation|thermal[_ -]?interface|thermal[_ -]?pad|tim[_ -]?pad/i
      .test(roleText)
  ) {
    return {
      placement: 'off_board_module',
      reasons: ['purchased_thermal_assembly_not_pcb_footprint'],
    }
  }
  // INTENT: chassis AC-DC brick / touch HMI are purchased modules, not FR4 parts.
  if (
    /isolated[_ -]?ac[_ -]?dc|ac[_ -]?dc[_ -]?power[_ -]?module|bench[_ -]?psu|touch[_ -]?display|local[_ -]?hmi|display[_ -]?panel/i
      .test(roleText)
  ) {
    return {
      placement: 'off_board_module',
      reasons: ['purchased_or_host_side_module'],
    }
  }
  // INTENT (2026-07-29): purchased SiC power stage / HV fuse / DC link bank sit
  // off the control FR4 — gate-drive + control boards remain on_board.
  if (
    /sic[_ -]?traction[_ -]?inverter|traction[_ -]?inverter(?:[_ -]?module)?|power[_ -]?module|hv[_ -]?dc[_ -]?fuse|dc[_ -]?link[_ -]?capacitor/i
      .test(roleText)
  ) {
    return {
      placement: 'off_board_module',
      reasons: ['purchased_traction_power_stage_or_hv_passive'],
    }
  }
  // INTENT (2026-07-30 FE traction): parent inverter-control assemblies and
  // motor-mounted resolver hardware are supplier/mechanical artefacts. Keep the
  // reviewable bespoke board scope on fitted electronics: MCU, CAN transceiver,
  // resolver signal interface, current/voltage sense and rails.
  if (
    /(?:^|[_ -])oem[_ -]?inverter[_ -]?control[_ -]?board(?:$|[_ -])|resolver[_ -]?encoder|(?:^|[_ -])resolver(?:$|[_ -])/i
      .test(roleText)
    && !/resolver[_ -]?signal[_ -]?interface/i.test(roleText)
  ) {
    return {
      placement: 'off_board_module',
      reasons: ['purchased_traction_control_parent_or_motor_sensor'],
    }
  }
  if (
    !hasExplicitPartIdentity
    && /can[_ -]?fd[_ -]?vehicle[_ -]?interface/i.test(roleText)
    && allWords.some((candidate) => /can[_ -]?fd[_ -]?transceiver/i.test(candidate.characterId))
  ) {
    return {
      placement: 'interconnect_only',
      ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
      reasons: ['can_fd_transceiver_owns_vehicle_interface'],
    }
  }
  // INTENT: channel power bus is copper pour / backplane, not a fitted package.
  if (/channel[_ -]?power[_ -]?bus|power[_ -]?bus[_ -]?bar/i.test(roleText)) {
    return {
      placement: 'interconnect_only',
      ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
      reasons: ['board_copper_or_bus_not_fitted_package'],
    }
  }
  // INTENT: Stir tach remains a host-HAT sense obligation until Pioreactor-class
  // HAT electricals are published — do not invent a board package for it.
  if (/stir[_ -]?tach|tachometer[_ -]?sense/i.test(roleText)) {
    return {
      placement: 'functional_requirement',
      ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
      reasons: ['stir_sense_awaits_unpublished_host_hat_topology'],
    }
  }
  if (/cable|harness/.test(roleText)) {
    return { placement: 'interconnect_only', reasons: ['mechanical_or_interconnect_role'] }
  }
  if (
    /compute.?ui.?module|detector.?module|wavelength.?selection.?module|bench.?psu/.test(roleText)
  ) {
    return { placement: 'off_board_module', reasons: ['purchased_or_host_side_module'] }
  }
  if (!hasExplicitPartIdentity && selectedBoard?.role === 'wet_lab_hat') {
    if (/host[_ -]?protocol[_ -]?bridge|protocol[_ -]?bridge/.test(roleText)) {
      return {
        placement: 'interconnect_only',
        boardId: selectedBoard.boardId,
        reasons: ['host_hat_uses_direct_compute_bus'],
      }
    }
    // DECISION: only park USB/firmware off-board when a purchased SBC/UI host
    // already owns those ports. A bare MCU on the wet_lab_hat must keep them
    // as fitted footprints (organoid 1546 coverage floor).
    if (hasCotsComputeHost && /usb[_ -]?interface|firmware[_ -]?storage/.test(roleText)) {
      return {
        placement: 'off_board_module',
        reasons: ['host_compute_owns_usb_or_persistence'],
      }
    }
  }
  if (!hasExplicitPartIdentity && selectedBoard?.role === 'analog_front_end_shield') {
    if (/host[_ -]?protocol[_ -]?bridge|protocol[_ -]?bridge/.test(roleText)) {
      return {
        placement: 'interconnect_only',
        boardId: selectedBoard.boardId,
        reasons: ['host_shield_uses_direct_compute_bus'],
      }
    }
    if (/usb[_ -]?(?:interface|power[_ -]?entry)/.test(roleText)) {
      return {
        placement: 'off_board_module',
        reasons: ['host_compute_module_owns_usb'],
      }
    }
  }
  if (
    !hasExplicitPartIdentity &&
    selectedBoard?.role === 'od_optics_board' &&
    /usb[_ -]?power[_ -]?entry/.test(roleText) &&
    boards.some((candidate) => candidate.role === 'wet_lab_hat')
  ) {
    // When the HAT carries a bare MCU (no COTS host), USB power entry belongs
    // on the HAT as a fitted receptacle — not an optics interconnect stub.
    if (hasCotsComputeHost) {
      return {
        placement: 'interconnect_only',
        boardId: selectedBoard.boardId,
        reasons: ['host_hat_interconnect_owns_peripheral_power_entry'],
      }
    }
  }
  if (!hasExplicitPartIdentity && hasCotsComputeHost) {
    if (/host[_ -]?protocol[_ -]?bridge|protocol[_ -]?bridge/.test(roleText)) {
      return {
        placement: 'interconnect_only',
        ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
        reasons: ['direct_host_bus_interconnect_not_bridge_component'],
      }
    }
    if (/usb[_ -]?(?:interface|power[_ -]?entry)|firmware[_ -]?storage/.test(roleText)) {
      return {
        placement: 'off_board_module',
        reasons: ['cots_compute_host_owns_interface_or_storage'],
      }
    }
  }
  // DECISION: park a *logical* usb_interface as interconnect only when a
  // distinct physical receptacle already exists. A lone usb_c_host_interface
  // IS the physical land (cold-v12) — never self-collapse it.
  const isLogicalUsbInterfaceOnly =
    /usb[_ -]?(?:c[_ -]?)?(?:host[_ -]?)?interface/.test(roleText)
    && !isPhysicalUsbLand(roleText)
  if (
    !hasExplicitPartIdentity &&
    isLogicalUsbInterfaceOnly &&
    hasOtherPhysicalUsbEntry
  ) {
    return {
      placement: 'interconnect_only',
      ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
      reasons: ['duplicate_usb_interface_contract'],
    }
  }
  if (
    !hasExplicitPartIdentity &&
    isLogicalUsbInterfaceOnly &&
    hasRadioAndDebugAccess
  ) {
    return {
      placement: 'interconnect_only',
      ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
      reasons: ['radio_and_debug_interfaces_close_host_access'],
    }
  }
  if (
    !hasExplicitPartIdentity &&
    hasIntegratedFirmwareMcu &&
    /firmware[_ -]?storage|host[_ -]?protocol[_ -]?bridge|protocol[_ -]?bridge/.test(roleText)
  ) {
    return {
      placement: 'functional_requirement',
      ...(selectedBoard ? { boardId: selectedBoard.boardId } : {}),
      reasons: ['integrated_mcu_owns_firmware_or_protocol_function'],
    }
  }
  // INTENT (fixpack14): when a digital temp IC (TMP1075 / culture_temperature_probe)
  // is already on the board plan, a bare NTC/thermistor sibling is half-wired junk
  // (VCC/GND only — no sense net). Park it off-board rather than minting a ghost.
  // DECISION: supersede only when a digital IC is present among allWords — a lone
  // NTC remains a legitimate on-board analogue sensor.
  if (
    isBareThermistorTemperatureSensor(word)
    && allWords.some((candidate) => isDigitalTemperatureIc(candidate))
  ) {
    return {
      placement: 'off_board_module',
      reasons: ['superseded_by_on_board_digital_temperature_ic'],
    }
  }
  return null
}

/**
 * @description True when the design's OWN electronics nouns / quantities imply a
 * traction inverter control stack (gate-drive + control FR4). Universal — keyed
 * on word identity and power/current quantities, never a product-class table.
 */
export function hasTractionInverterBoardSignal(state: Record<string, unknown>): boolean {
  const words = collectElectronicWords(state)
  const blob = words
    .map((w) => `${w.wordId} ${w.nameHuman} ${w.characterId}`)
    .join(' ')
    .toLowerCase()
  const hasGateOrControl =
    /gate[_ -]?driv|(?:oem[_ -]?)?inverter[_ -]?control|sic[_ -]?traction|phase[_ -]?current[_ -]?sensor|traction[_ -]?inverter/
      .test(blob)
  const hasPowerPlane =
    (quantity(state, 'continuous_power_kw') ?? 0) >= 50
    || (quantity(state, 'phase_current_max_a') ?? 0) >= 100
    || (quantity(state, 'front_hardware_power_class_kw') ?? 0) >= 50
    || (quantity(state, 'rear_axle_electrical_power_kw') ?? 0) >= 50
  return hasGateOrControl && hasPowerPlane
}

/**
 * @description Derive a board-system architecture from functional quantities and
 * module procurement signals. Product names are not consulted.
 */
export function derivePcbArchitecture(state: Record<string, unknown>): PcbArchitecturePlan {
  const electrodeCount = Math.max(0, Math.floor(quantity(state, 'electrode_count') ?? 0))
  const opticalPathLengthMm = Math.max(0, quantity(state, 'optical_path_length_mm') ?? 0)
  let systemDisposition: PcbSystemDisposition = 'unresolved'
  let boards: PcbBoardPlan[] = []
  const rationale: string[] = []

  if (electrodeCount >= 8) {
    const connectorPitchMm = quantity(state, 'cartridge_connector_pitch_mm') ?? 1.27
    const electrodePitchMm = quantity(state, 'electrode_pitch_mm') ?? 2.54
    const cartridgeWidthMm = Math.max(60, electrodeCount * connectorPitchMm + 12)
    const cartridgeHeightMm = Math.max(24, electrodePitchMm * 8 + 10)
    systemDisposition = 'multi_board'
    boards = [
      board('hv_controller_main', 'high_voltage_controller', ['logic', 'analog', 'high_voltage']),
      board('electrode_cartridge', 'electrode_cartridge', ['high_voltage', 'wet_interface'], [
        datum('outline_width_mm', cartridgeWidthMm, `${electrodeCount} channels × ${connectorPitchMm}mm connector pitch + edge margins`),
        datum('outline_height_mm', cartridgeHeightMm, `${electrodePitchMm}mm electrode pitch × wet-interface depth`),
        datum('corner_radius_mm', 2, 'replaceable cartridge handling edge'),
        datum('mounting_hole_inset_mm', 3, 'cartridge frame registration'),
        datum('mounting_hole_diameter_mm', 2.5, 'removable cartridge fastener'),
      ]),
    ]
    boards[0].channelRequirements.push({
      role: 'electrode_switch_channel',
      count: electrodeCount,
    })
    boards[1].channelRequirements.push({
      role: 'electrode_channel',
      count: electrodeCount,
    })
    rationale.push('electrode_count_requires_hv_controller_and_removable_array')
  } else if ((quantity(state, 'working_volume_ml') ?? 0) > 0) {
    systemDisposition = 'multi_board'
    boards = [
      // DECISION: wet_lab_hat owns host-rail power (USB/ESD/polyfuse) as well as
      // logic — thermal actuation power stays on heater_stir_actuation_board.
      board('wet_lab_hat', 'wet_lab_hat', ['logic', 'power', 'wet_interface']),
      board('od_optics', 'od_optics_board', ['analog', 'wet_interface']),
      board('wet_actuation', 'heater_stir_actuation_board', ['power', 'wet_interface', 'thermal_actuation']),
    ]
    boards[1].channelRequirements.push({
      role: 'od_measurement_channel',
      count: derivedChannelCount(
        state,
        ['od_channel_count', 'optical_density_channel_count'],
        /\bod\b|optical.?density|photodiode/i,
        1,
      ),
    })
    boards[2].channelRequirements.push({
      role: 'heater_channel',
      count: derivedChannelCount(
        state,
        ['heater_channel_count', 'heater_count'],
        /heat(?:er|ing)|thermal.?actuat/i,
        1,
      ),
    })
    // DECISION (2026-07-22): stir/pump drive ICs live on wet_lab_hat (host HAT),
    // never on heater_20ml. When Forge host-HAT drive fixture publishes, mint
    // fitted channels on boards[0]; otherwise keep deferred (honest DRAFT).
    const stirNeed = derivedChannelCount(
      state,
      ['stir_channel_count', 'stirrer_count'],
      /stir|agitat/i,
      1,
    )
    const pumpNeed = derivedChannelCount(
      state,
      ['dosing_pump_count', 'pump_channel_count'],
      /dosing.?pump|metering.?pump/i,
      1,
    )
    if (isHostHatActuationDrivePublished(state)) {
      boards[0].channelRequirements.push(
        { role: 'stir_channel', count: stirNeed },
        { role: 'pump_channel', count: pumpNeed },
      )
      rationale.push('stir_pump_published_on_host_hat_drive_topology')
    } else {
      boards[2].deferredChannelRequirements = [
        {
          role: 'stir_channel',
          count: stirNeed,
          reason: 'blocked_until_host_hat_drive_topology_published',
        },
        {
          role: 'pump_channel',
          count: pumpNeed,
          reason: 'blocked_until_host_hat_drive_topology_published',
        },
      ]
      rationale.push('stir_pump_deferred_until_host_hat_drive_topology_published')
    }
    rationale.push('culture_volume_requires_host_optics_and_wet_actuation_split')
  } else if ((quantity(state, 'compliance_voltage_v') ?? 0) > 0) {
    systemDisposition = 'daughterboard'
    boards = [board('analog_afe', 'analog_front_end_shield', ['analog', 'logic'])]
    boards[0].channelRequirements.push({
      role: 'electrochemical_cell_channel',
      count: derivedChannelCount(
        state,
        ['electrochemical_cell_count', 'cell_channel_count'],
        /working.?electrode|electrochemical.?cell/i,
        1,
      ),
    })
    rationale.push('compliance_voltage_requires_precision_analog_front_end')
  } else if ((quantity(state, 'tube_count') ?? 0) > 0) {
    systemDisposition = 'single_custom'
    boards = [board('thermal_controller', 'thermal_power_controller', ['logic', 'power', 'thermal_actuation'])]
    boards[0].channelRequirements.push(
      {
        role: 'thermal_zone',
        count: derivedChannelCount(
          state,
          ['thermal_zone_count', 'sample_zone_count', 'block_count'],
          /sample.?block|thermal.?zone|temperature.?sensor/i,
          1,
        ),
      },
      {
        role: 'lid_heater_channel',
        count: derivedChannelCount(
          state,
          ['lid_heater_channel_count', 'lid_heater_count'],
          /lid.?heater|heated.?lid/i,
          1,
        ),
      },
      {
        role: 'fan_channel',
        count: derivedChannelCount(
          state,
          ['fan_channel_count', 'cooling_fan_count'],
          /cooling.?fan|heatsink.?fan|heat.?rejection/i,
          1,
        ),
      },
    )
    rationale.push('tube_array_requires_integrated_thermal_power_controller')
  } else if (opticalPathLengthMm > 0) {
    const sourceBoardWidthMm = Math.max(25.4, Math.min(40, opticalPathLengthMm + 15.4))
    const sourceBoardHeightMm = Math.max(20, Math.min(30, opticalPathLengthMm + 10))
    systemDisposition = 'daughterboard'
    boards = [board('optical_source', 'optical_source_daughterboard', ['logic'], [
      datum('outline_width_mm', sourceBoardWidthMm, `${opticalPathLengthMm}mm optical path + source connector margin`),
      datum('outline_height_mm', sourceBoardHeightMm, `${opticalPathLengthMm}mm optical path + cube-face registration margin`),
      datum('corner_radius_mm', 2, 'optical cube face edge clearance'),
      datum('mounting_hole_inset_mm', 2.5, 'four-point optical-axis registration'),
      datum('mounting_hole_diameter_mm', 2.2, 'source-board registration fastener'),
    ])]
    boards[0].channelRequirements.push({
      role: 'optical_source_channel',
      count: firstPositiveQuantity(state, ['optical_source_channel_count', 'wavelength_channel_count'], 1),
    })
    rationale.push('optical_path_with_cots_host_requires_source_daughterboard')
  } else if ((quantity(state, 'channel_count') ?? 0) > 0) {
    const nCh = Math.max(1, Math.floor(quantity(state, 'channel_count') ?? 1))
    if (hasFinishedMotionStack(state)) {
      systemDisposition = 'cots_only'
      rationale.push('motion_channels_resolved_by_finished_controller_modules')
    } else if (hasElectricalChannelEvidence(state)) {
      // Multi-channel electrical instrument (power + AFE + independent trips).
      // Never mint a motion_driver_board from bare channel_count + AFE nouns.
      // INTENT (2026-07-28): area-derived ~110 mm square starved TO-220 ×N
      // placement (pad overlap ~1.3 mm). Outline follows channel pitch.
      const channelPitchMm = 28
      const outlineWidthMm = Math.max(160, nCh * channelPitchMm + 50)
      const outlineHeightMm = Math.max(160, 100 + nCh * 10)
      systemDisposition = 'single_custom'
      boards = [board(
        'channel_instrument',
        'channel_power_afe_controller',
        ['logic', 'analog', 'power'],
        [
          datum(
            'outline_width_mm',
            outlineWidthMm,
            `${nCh} channels × ${channelPitchMm}mm power-stage pitch + MCU/USB margins`,
          ),
          datum(
            'outline_height_mm',
            outlineHeightMm,
            `${nCh}-channel AFE + safety stack depth`,
          ),
        ],
      )]
      boards[0].channelRequirements.push(
        { role: 'power_channel', count: nCh },
        { role: 'sense_channel', count: nCh },
        { role: 'safety_channel', count: nCh },
      )
      rationale.push('electrical_channels_require_power_afe_safety_board')
    } else if (hasMotionChannelEvidence(state)) {
      systemDisposition = 'single_custom'
      boards = [board('motion_controller', 'motion_driver_board', ['logic', 'power', 'motion_actuation'])]
      boards[0].channelRequirements.push({ role: 'motion_channel', count: nCh })
      rationale.push('motion_channels_require_integrated_driver_board')
    } else {
      // Bare channel_count with no domain evidence — do not invent motion hardware.
      rationale.push('channel_count_without_domain_evidence')
    }
  } else if ((quantity(state, 'stage_axis_count') ?? 0) >= 2) {
    if (hasFinishedMotionStack(state) ||
        /single.board.computer|raspberry|camera/.test(architectureEvidenceBlob(state))) {
      systemDisposition = 'cots_only'
      rationale.push('imaging_and_motion_roles_resolved_by_finished_modules')
    } else {
      systemDisposition = 'daughterboard'
      boards = [board('stage_motion', 'motion_driver_board', ['logic', 'motion_actuation'])]
      rationale.push('stage_axes_require_motion_daughterboard')
    }
  } else if (hasTractionInverterBoardSignal(state)) {
    // Universal noun/quantity signal — not a product-class table.
    // Power stage may be purchased; control + gate-drive still need KiCad.
    const iPh = Math.max(
      100,
      Math.floor(quantity(state, 'phase_current_design_a')
        ?? quantity(state, 'phase_current_max_a')
        ?? 400),
    )
    systemDisposition = 'multi_board'
    boards = [
      board(
        'traction_gate_drive',
        'traction_gate_drive_board',
        ['power', 'high_voltage'],
        [
          datum('outline_width_mm', 120, `gate-drive creepage envelope for ~${iPh} A phase class`),
          datum('outline_height_mm', 90, 'three half-bridge driver channels + isolation'),
        ],
      ),
      board(
        'traction_control',
        'traction_control_board',
        ['logic', 'analog'],
        [
          datum('outline_width_mm', 100, 'MCU + sensing + CAN interface'),
          datum('outline_height_mm', 80, 'resolver + current AFE stack'),
        ],
      ),
    ]
    boards[0].channelRequirements.push(
      { role: 'gate_drive_channel', count: 6 },
      { role: 'desat_channel', count: 6 },
    )
    boards[1].channelRequirements.push(
      { role: 'phase_current_sense', count: 3 },
      { role: 'resolver_channel', count: 1 },
      { role: 'vehicle_can', count: 1 },
      // Physics tree `lv_buck_rails` declares 3v3 / 5v / 1v2.
      { role: 'lv_buck_rail', count: 3 },
      { role: 'hv_lv_isolation_barrier', count: 1 },
    )
    rationale.push('traction_inverter_requires_gate_drive_and_control_boards')
  } else {
    rationale.push('no_functional_board_architecture_signal')
  }

  const words = collectElectronicWords(state)
  const assignments: PcbWordAssignment[] = words.map((word) => {
    if (systemDisposition === 'cots_only') {
      return { wordId: word.wordId, placement: 'off_board_module', reasons: ['cots_only_system'] }
    }
    const nonBoard = nonBoardPlacement(word, state, boards, words)
    if (nonBoard) {
      return { wordId: word.wordId, ...nonBoard }
    }
    const selectedBoard = assignmentBoard(word, boards)
    if (selectedBoard) {
      selectedBoard.requiredWordIds.push(word.wordId)
      return { wordId: word.wordId, placement: 'on_board', boardId: selectedBoard.boardId, reasons: ['function_role_board_assignment'] }
    }
    if (boards.some((candidate) => candidate.role === 'optical_source_daughterboard')) {
      return { wordId: word.wordId, placement: 'off_board_module', reasons: ['optical_source_board_excludes_host_role'] }
    }
    return { wordId: word.wordId, placement: 'unassigned', reasons: ['no_board_plan'] }
  })
  const unassignedWordIds = assignments.filter((item) => item.placement === 'unassigned').map((item) => item.wordId)
  const onBoardElectronicPartCount = countOnBoardElectronicParts(assignments, words)

  return {
    schema: 'pcb-architecture/v1',
    systemDisposition,
    requiresAnyKiCadDeliverable: boards.some((item) => item.requiresKiCadDeliverable),
    assignments,
    boards,
    unassignedWordIds,
    rationale,
    confidence: systemDisposition === 'unresolved' ? 'low' : 'medium',
    onBoardElectronicPartCount,
  }
}
