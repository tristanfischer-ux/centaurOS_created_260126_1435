/**
 * @file Pure PCB component-resolution contract and evaluator.
 * @description Keeps package/function placeholders visibly distinct from
 * fabrication-verified components before schematic or layout generation.
 */

import type { PcbBoardPlan } from './pcb-architecture'

export type PcbPinKind =
  | 'power_in'
  | 'power_out'
  | 'ground'
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'passive'
  | 'nc'

export interface PcbPinSpec {
  number: string
  name: string
  kind: PcbPinKind
  domain?: PcbBoardPlan['domains'][number]
}

export interface PcbFootprintSpec {
  library: string
  footprint: string
  padCount: number
  nonElectricalPadCount: number
}

export type PcbComponentResolutionTier =
  | 'mpn_symbol_footprint'
  | 'mpn_package_only'
  | 'package_family'
  | 'function_class'
  | 'unresolved'

export interface PcbComponentResolutionCandidate {
  wordId: string
  instanceName: string
  requestedRole: string
  manufacturer: string | null
  partNumber: string | null
  mpnVerified: boolean
  procurementProvenance: string | null
  compatibleRoles: string[]
  symbolId: string | null
  footprint: PcbFootprintSpec | null
  pins: PcbPinSpec[]
  resolutionTier: PcbComponentResolutionTier
  resolutionBasis: string
}

export type PcbComponentResolutionFindingCode =
  | 'component_resolution_stub'
  | 'unverified_component_mpn'
  | 'missing_component_symbol'
  | 'incomplete_component_pinout'
  | 'missing_component_footprint'
  | 'component_role_mismatch'
  | 'pinout_footprint_mismatch'

export interface PcbComponentResolutionFinding {
  severity: 'high'
  code: PcbComponentResolutionFindingCode
  message: string
  fixStage: 'component-resolution'
  wordId: string
  instanceName: string
}

export interface PcbComponentResolutionResult {
  wordId: string
  instanceName: string
  status: 'verified' | 'stub' | 'invalid'
  isFabricationVerified: boolean
  uniquePinCount: number
  electricalPadCount: number | null
  findings: PcbComponentResolutionFinding[]
}

const STUB_TIERS = new Set<PcbComponentResolutionTier>([
  'mpn_package_only',
  'package_family',
  'function_class',
])

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

function finding(
  candidate: PcbComponentResolutionCandidate,
  code: PcbComponentResolutionFindingCode,
  message: string,
): PcbComponentResolutionFinding {
  return {
    severity: 'high',
    code,
    message,
    fixStage: 'component-resolution',
    wordId: candidate.wordId,
    instanceName: candidate.instanceName,
  }
}

/**
 * @description Evaluates whether one proposed PCB component has verified
 * identity, role, symbol, complete pinout, and a physically compatible footprint.
 * Package-family and function-class fallbacks remain explicit engineering stubs.
 * @param candidate Component evidence assembled by a DB-only resolver.
 * @returns A pure status and named findings for PCB design-fitness routing.
 */
export function evaluatePcbComponentResolution(
  candidate: PcbComponentResolutionCandidate,
): PcbComponentResolutionResult {
  // INTENT: A routable package is not evidence of an electrically real part.
  // Fitness may only trust a component after every identity boundary closes.
  const findings: PcbComponentResolutionFinding[] = []
  const isStubTier = STUB_TIERS.has(candidate.resolutionTier)

  if (isStubTier) {
    findings.push(finding(
      candidate,
      'component_resolution_stub',
      `${candidate.instanceName} uses ${candidate.resolutionTier} fallback evidence, not a verified component`,
    ))
  }

  const hasVerifiedMpn = Boolean(
    candidate.manufacturer?.trim()
    && candidate.partNumber?.trim()
    && candidate.mpnVerified
    && candidate.procurementProvenance?.trim(),
  )
  if (!hasVerifiedMpn) {
    findings.push(finding(
      candidate,
      'unverified_component_mpn',
      `${candidate.instanceName} has no verified manufacturer/MPN with procurement provenance`,
    ))
  }

  if (!candidate.symbolId?.trim()) {
    findings.push(finding(
      candidate,
      'missing_component_symbol',
      `${candidate.instanceName} has no resolved schematic symbol`,
    ))
  }

  const pinNumbers = candidate.pins.map((pin) => pin.number.trim()).filter(Boolean)
  const uniquePinCount = new Set(pinNumbers).size
  const hasCompletePinRecords = candidate.pins.length > 0
    && pinNumbers.length === candidate.pins.length
    && uniquePinCount === candidate.pins.length
    && candidate.pins.every((pin) => pin.name.trim().length > 0)
  if (!hasCompletePinRecords) {
    findings.push(finding(
      candidate,
      'incomplete_component_pinout',
      `${candidate.instanceName} has no complete, uniquely numbered symbol pinout`,
    ))
  }

  if (!candidate.footprint) {
    findings.push(finding(
      candidate,
      'missing_component_footprint',
      `${candidate.instanceName} has no resolved footprint`,
    ))
  }

  const requestedRole = normalized(candidate.requestedRole)
  const compatibleRoles = new Set(candidate.compatibleRoles.map(normalized))
  if (!requestedRole || !compatibleRoles.has(requestedRole)) {
    findings.push(finding(
      candidate,
      'component_role_mismatch',
      `${candidate.instanceName} is not verified for requested role ${candidate.requestedRole || '(missing)'}`,
    ))
  }

  let electricalPadCount: number | null = null
  if (candidate.footprint) {
    const { padCount, nonElectricalPadCount } = candidate.footprint
    const hasValidPadCounts = Number.isInteger(padCount)
      && Number.isInteger(nonElectricalPadCount)
      && padCount > 0
      && nonElectricalPadCount >= 0
      && nonElectricalPadCount < padCount
    electricalPadCount = hasValidPadCounts ? padCount - nonElectricalPadCount : null
    if (electricalPadCount === null || uniquePinCount !== electricalPadCount) {
      findings.push(finding(
        candidate,
        'pinout_footprint_mismatch',
        `${candidate.instanceName} has ${uniquePinCount} unique symbol pins for ${electricalPadCount ?? 'an invalid number of'} electrical footprint pads`,
      ))
    }
  }

  const invalidCodes = new Set<PcbComponentResolutionFindingCode>([
    'missing_component_symbol',
    'incomplete_component_pinout',
    'missing_component_footprint',
    'component_role_mismatch',
    'pinout_footprint_mismatch',
  ])
  const hasInvalidStructure = findings.some((item) => invalidCodes.has(item.code))
  const isFabricationVerified = candidate.resolutionTier === 'mpn_symbol_footprint'
    && hasVerifiedMpn
    && !hasInvalidStructure

  return {
    wordId: candidate.wordId,
    instanceName: candidate.instanceName,
    status: isFabricationVerified ? 'verified' : isStubTier && !hasInvalidStructure ? 'stub' : 'invalid',
    isFabricationVerified,
    uniquePinCount,
    electricalPadCount,
    findings,
  }
}
