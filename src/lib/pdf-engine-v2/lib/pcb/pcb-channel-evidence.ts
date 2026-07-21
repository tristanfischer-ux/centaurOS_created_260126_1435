/**
 * @file Derive implemented channel counts from real component topology evidence.
 * @description Architecture `channelRequirements` used to stay at 0 whenever the
 * generator had ANY electronic words — `functionRequirements` was only emitted on
 * an empty board, so fitness always reported channel_under_implementation. This
 * module counts channels from (a) passive geometry roles and (b) known component
 * topology signatures (heater gold MPNs, OD optical path nouns) — never from a
 * bare role name. Stir/pump stay 0 without HAT electrical evidence (honest DRAFT).
 */

import type { AtopileFunctionRequirementRecord } from './atopile-generator'

export interface ChannelEvidenceComponent {
  partNumber?: string | null
  characterId?: string | null
  nameHuman?: string | null
  functionClass?: string | null
}

/** Pioreactor heater_20ml gold constituents (ca40a91e) — all four required to mint heater_channel. */
export const HEATER_CHANNEL_GOLD_MPNS = [
  'TMP1075DSGR',
  'DRV5021A3QDBZR',
  'ESR18EZPJ3R9',
  '52207-0760',
] as const

/**
 * @description Normalize an MPN for set membership (case / separator insensitive).
 */
export function normalizeMpnToken(mpn: string): string {
  return mpn.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * @description True when every gold heater MPN appears among resolved components.
 */
export function hasHeaterChannelGoldTopology(
  components: ChannelEvidenceComponent[],
): boolean {
  const have = new Set(
    components
      .map((c) => (c.partNumber ? normalizeMpnToken(c.partNumber) : ''))
      .filter(Boolean),
  )
  return HEATER_CHANNEL_GOLD_MPNS.every((mpn) => have.has(normalizeMpnToken(mpn)))
}

/**
 * @description True when components show an OD measurement path (source + sense/ADC).
 */
export function hasOdMeasurementPath(components: ChannelEvidenceComponent[]): boolean {
  const blob = components
    .map((c) => `${c.characterId ?? ''} ${c.nameHuman ?? ''} ${c.functionClass ?? ''} ${c.partNumber ?? ''}`)
    .join(' ')
    .toLowerCase()
  const hasSource = /led|emitter|light.?source|od.?source|optical.?source/.test(blob)
  const hasSense = /photodiode|photo.?transistor|ads111|adc|od.?detector|optical.?detector|tsl2591/.test(blob)
  return hasSource && hasSense
}

/**
 * @description Count implemented channels from topology evidence + function records.
 * @param components Resolved on-board components for THIS board (or aggregate).
 * @param functionRequirements Generator function-requirement records.
 * @param requiredRoles Roles the architecture demands (union of board channelRequirements).
 * @returns role → implemented count (0 when no honest evidence).
 */
export function deriveImplementedChannelCounts(args: {
  components: ChannelEvidenceComponent[]
  functionRequirements: AtopileFunctionRequirementRecord[]
  requiredRoles: string[]
}): Record<string, number> {
  const { components, functionRequirements, requiredRoles } = args
  const counts: Record<string, number> = {}

  for (const role of requiredRoles) {
    counts[role] = 0
  }

  for (const fr of functionRequirements) {
    if (fr.implementation === 'passive_board_geometry') {
      counts[fr.role] = Math.max(counts[fr.role] ?? 0, 1)
    }
  }

  // Heater: gold topology only — never invent from a lone "heater" noun.
  if ((counts.heater_channel ?? 0) === 0 && hasHeaterChannelGoldTopology(components)) {
    counts.heater_channel = 1
  }

  // OD: source + detector/ADC co-present.
  if ((counts.od_measurement_channel ?? 0) === 0 && hasOdMeasurementPath(components)) {
    counts.od_measurement_channel = 1
  }

  // GOTCHA: stir_channel / pump_channel intentionally stay 0 here until a
  // curated HAT electrical topology exists (see pcb-pioreactor-wet-actuation-topology).

  return counts
}
