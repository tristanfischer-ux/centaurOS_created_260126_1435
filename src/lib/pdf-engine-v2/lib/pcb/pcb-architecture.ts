/**
 * @file Universal PCB architecture planner (shadow v1).
 * @description Separates "the design contains electronics" from "the design needs
 * a bespoke PCB". Function quantities and procurement evidence select zero, one,
 * or multiple board roles before any Atopile project is generated.
 */

import { collectElectronicWords } from './pcb-stage'

export type PcbSystemDisposition =
  | 'not_applicable'
  | 'cots_only'
  | 'daughterboard'
  | 'single_custom'
  | 'multi_board'
  | 'unresolved'

export interface PcbBoardPlan {
  boardId: string
  role: string
  requiredWordIds: string[]
  domains: Array<'logic' | 'analog' | 'power' | 'high_voltage' | 'wet_interface' | 'thermal_actuation' | 'motion_actuation'>
  channelRequirements: Array<{ role: string; count: number }>
  requiresKiCadDeliverable: boolean
}

export interface PcbWordAssignment {
  wordId: string
  placement: 'on_board' | 'off_board_module' | 'interconnect_only' | 'unassigned'
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

function wordBlob(state: Record<string, unknown>): string {
  return collectElectronicWords(state)
    .map((word) => `${word.wordId} ${word.nameHuman} ${word.characterId} ${Object.values(word.modifiers).join(' ')}`)
    .join(' ')
    .toLowerCase()
}

function board(boardId: string, role: string, domains: PcbBoardPlan['domains']): PcbBoardPlan {
  return { boardId, role, requiredWordIds: [], domains, channelRequirements: [], requiresKiCadDeliverable: true }
}

function assignmentBoard(wordText: string, boards: PcbBoardPlan[]): PcbBoardPlan | undefined {
  if (boards.length <= 1) return boards[0]
  const text = wordText.toLowerCase()
  return boards.find((candidate) => {
    if (candidate.role === 'electrode_cartridge') return /electrode|cartridge|array|reservoir/.test(text)
    if (candidate.role === 'high_voltage_controller') return /hv|high.?voltage|switch|boost|isolat|controller|microcontroller/.test(text)
    if (candidate.role === 'od_optics_board') return /optical|density|photodiode|adc|sensor|led/.test(text)
    if (candidate.role === 'heater_stir_actuation_board') return /heat|stir|motor|pump|driver|peltier|power/.test(text)
    if (candidate.role === 'wet_lab_hat') return /hat|host|microcontroller|compute|raspberry|interface/.test(text)
    return false
  })
}

/**
 * @description Derive a board-system architecture from functional quantities and
 * module procurement signals. Product names are not consulted.
 */
export function derivePcbArchitecture(state: Record<string, unknown>): PcbArchitecturePlan {
  const blob = wordBlob(state)
  let systemDisposition: PcbSystemDisposition = 'unresolved'
  let boards: PcbBoardPlan[] = []
  const rationale: string[] = []

  if ((quantity(state, 'electrode_count') ?? 0) >= 8) {
    systemDisposition = 'multi_board'
    boards = [
      board('hv_controller_main', 'high_voltage_controller', ['logic', 'high_voltage']),
      board('electrode_cartridge', 'electrode_cartridge', ['high_voltage', 'wet_interface']),
    ]
    rationale.push('electrode_count_requires_hv_controller_and_removable_array')
  } else if ((quantity(state, 'working_volume_ml') ?? 0) > 0) {
    systemDisposition = 'multi_board'
    boards = [
      board('wet_lab_hat', 'wet_lab_hat', ['logic', 'wet_interface']),
      board('od_optics', 'od_optics_board', ['analog', 'wet_interface']),
      board('wet_actuation', 'heater_stir_actuation_board', ['power', 'wet_interface', 'thermal_actuation']),
    ]
    rationale.push('culture_volume_requires_host_optics_and_wet_actuation_split')
  } else if ((quantity(state, 'compliance_voltage_v') ?? 0) > 0) {
    systemDisposition = 'daughterboard'
    boards = [board('analog_afe', 'analog_front_end_shield', ['analog', 'logic'])]
    rationale.push('compliance_voltage_requires_precision_analog_front_end')
  } else if ((quantity(state, 'tube_count') ?? 0) > 0) {
    systemDisposition = 'single_custom'
    boards = [board('thermal_controller', 'thermal_power_controller', ['logic', 'power', 'thermal_actuation'])]
    rationale.push('tube_array_requires_integrated_thermal_power_controller')
  } else if ((quantity(state, 'optical_path_length_mm') ?? 0) > 0) {
    systemDisposition = 'daughterboard'
    boards = [board('optical_source', 'optical_source_daughterboard', ['logic'])]
    rationale.push('optical_path_with_cots_host_requires_source_daughterboard')
  } else if ((quantity(state, 'channel_count') ?? 0) > 0) {
    if (/arduino|cnc\s*shield|driver\s*module|finished\s*module/.test(blob)) {
      systemDisposition = 'cots_only'
      rationale.push('motion_channels_resolved_by_finished_controller_modules')
    } else {
      systemDisposition = 'single_custom'
      boards = [board('motion_controller', 'motion_driver_board', ['logic', 'power', 'motion_actuation'])]
      boards[0].channelRequirements.push({ role: 'motion_channel', count: Math.max(1, Math.floor(quantity(state, 'channel_count') ?? 1)) })
      rationale.push('motion_channels_require_integrated_driver_board')
    }
  } else if ((quantity(state, 'stage_axis_count') ?? 0) >= 2) {
    if (/single.board.computer|raspberry|camera|motor.controller.board|driver.module/.test(blob)) {
      systemDisposition = 'cots_only'
      rationale.push('imaging_and_motion_roles_resolved_by_finished_modules')
    } else {
      systemDisposition = 'daughterboard'
      boards = [board('stage_motion', 'motion_driver_board', ['logic', 'motion_actuation'])]
      rationale.push('stage_axes_require_motion_daughterboard')
    }
  } else {
    rationale.push('no_functional_board_architecture_signal')
  }

  const words = collectElectronicWords(state)
  const assignments: PcbWordAssignment[] = words.map((word) => {
    if (systemDisposition === 'cots_only') {
      return { wordId: word.wordId, placement: 'off_board_module', reasons: ['cots_only_system'] }
    }
    const selectedBoard = assignmentBoard(
      `${word.wordId} ${word.nameHuman} ${word.characterId} ${Object.values(word.modifiers).join(' ')}`,
      boards,
    )
    if (selectedBoard) {
      selectedBoard.requiredWordIds.push(word.wordId)
      return { wordId: word.wordId, placement: 'on_board', boardId: selectedBoard.boardId, reasons: ['function_role_board_assignment'] }
    }
    return { wordId: word.wordId, placement: 'unassigned', reasons: ['no_board_plan'] }
  })
  const unassignedWordIds = assignments.filter((item) => item.placement === 'unassigned').map((item) => item.wordId)

  return {
    schema: 'pcb-architecture/v1',
    systemDisposition,
    requiresAnyKiCadDeliverable: boards.some((item) => item.requiresKiCadDeliverable),
    assignments,
    boards,
    unassignedWordIds,
    rationale,
    confidence: systemDisposition === 'unresolved' ? 'low' : 'medium',
  }
}
