/**
 * @file pcb-cross-board-nets.ts
 * @description Plan system-level nets that span (or must span) PCBs in a
 * multi-board assembly. Pure + deterministic — no LLM.
 *
 * INTENT: Boards are separate KiCad projects (`multiBoardMerged: false`), but
 * the *product* still has cables (heater FFC, OD host I2C). Shared net *names*
 * + mate connectors on each side are the contract; this planner tags those nets
 * `crossBoard` so exporters / firmware / SIGHT can see the system story.
 *
 * FLOW: runBespokeMultiBoardPcb → planSystemNets(boards)
 *    → generateAtopileProject({ boardId, systemNets }) densifies mates + wires
 *    → applySystemNetTags stamps crossBoard on matching net names
 */

import type { PcbBoardPlan } from './pcb-architecture'

export type SystemNetPlan = {
  /** Net names that must appear on ≥2 boards or are role-forced cable nets. */
  crossBoardNetNames: string[]
  /** Heater FFC cable present (heater board + HAT mate). */
  hasHeaterFfc: boolean
  /** OD ↔ HAT 4P host/I2C cable present. */
  hasOdHostI2c: boolean
  /** Board ids participating in the plan. */
  boardIds: string[]
}

/** Canonical heater-FFC cable nets (wet_actuation ↔ wet_lab_hat). */
export const HEATER_FFC_CROSS_NETS = [
  'HEATER_I2C_SCL',
  'HEATER_I2C_SDA',
  'HEATER_HALL',
  'HEATER_RES_A',
  'HEATER_RES_B',
] as const

/** Canonical OD ↔ HAT host cable nets (4P: GND/3V3/SDA/SCL per BOOMELE pinout). */
export const OD_HOST_CROSS_NETS = [
  'OD_I2C_GND',
  'OD_I2C_VCC',
  'OD_I2C_SDA',
  'OD_I2C_SCL',
] as const

export type CrossBoardTaggableNet = {
  name: string
  crossBoard?: boolean
}

function boardBlob(b: PcbBoardPlan): string {
  return `${b.boardId} ${b.role} ${b.workPerformed.join(' ')}`
}

/**
 * @description Infer which cable families the multi-board plan needs from board
 * roles / ids (not product-name branches).
 */
export function planSystemNets(boards: PcbBoardPlan[]): SystemNetPlan {
  const boardIds = boards.map((b) => b.boardId)
  const hasHeater = boards.some(
    (b) =>
      b.boardId === 'wet_actuation' ||
      b.role === 'heater_stir_actuation_board' ||
      /\bheater\b/i.test(boardBlob(b)),
  )
  const hasHat = boards.some(
    (b) =>
      b.boardId === 'wet_lab_hat' ||
      b.role === 'wet_lab_hat' ||
      /\bhat\b/i.test(boardBlob(b)),
  )
  const hasOd = boards.some(
    (b) =>
      b.boardId === 'od_optics' ||
      b.role === 'od_optics_board' ||
      /\b(od_|optics|photodiode|optical)\b/i.test(boardBlob(b)),
  )

  const hasHeaterFfc = hasHeater && hasHat
  const hasOdHostI2c = hasOd && hasHat

  const crossBoardNetNames: string[] = []
  if (hasHeaterFfc) crossBoardNetNames.push(...HEATER_FFC_CROSS_NETS)
  if (hasOdHostI2c) crossBoardNetNames.push(...OD_HOST_CROSS_NETS)

  return {
    crossBoardNetNames: [...new Set(crossBoardNetNames)],
    hasHeaterFfc,
    hasOdHostI2c,
    boardIds,
  }
}

/**
 * @description Stamp `crossBoard: true` on nets whose names are in the system plan.
 */
export function applySystemNetTags<T extends CrossBoardTaggableNet>(
  nets: T[],
  plan: SystemNetPlan | undefined,
): T[] {
  if (!plan || plan.crossBoardNetNames.length === 0) return nets
  const want = new Set(plan.crossBoardNetNames.map((n) => n.toUpperCase()))
  return nets.map((n) => {
    const name = String(n.name ?? '').toUpperCase()
    if (!want.has(name)) return n
    if (n.crossBoard === true) return n
    return { ...n, crossBoard: true }
  })
}

/**
 * @description True when this board should skip USB-host densify (slave boards
 * that only speak FFC / sense — e.g. wet_actuation heater daughterboard).
 */
export function boardSkipsUsbHostDensify(
  boardId: string | undefined,
  boardRole: string | undefined,
): boolean {
  const blob = `${boardId ?? ''} ${boardRole ?? ''}`
  return (
    boardId === 'wet_actuation' ||
    boardRole === 'heater_stir_actuation_board' ||
    /^heater_/i.test(blob)
  )
}

/**
 * @description True when this board is the host HAT that receives cable mates.
 */
export function boardIsHostHat(
  boardId: string | undefined,
  boardRole: string | undefined,
): boolean {
  return boardId === 'wet_lab_hat' || boardRole === 'wet_lab_hat'
}

/**
 * @description True when this board is the OD / optics daughterboard.
 */
export function boardIsOdOptics(
  boardId: string | undefined,
  boardRole: string | undefined,
): boolean {
  return (
    boardId === 'od_optics' ||
    boardRole === 'od_optics_board' ||
    /\bod[_ -]?optics\b/i.test(`${boardId ?? ''} ${boardRole ?? ''}`)
  )
}
