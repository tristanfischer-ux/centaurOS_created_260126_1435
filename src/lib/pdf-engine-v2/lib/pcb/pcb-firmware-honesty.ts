/**
 * @file Canonical PCB firmware honesty doctrine (Anvil engine — not LLM memory).
 * @description Tristan 2026-07-22/23: never oversell QEMU/host-bind as product validation.
 * Machine-readable SSOT: `pcb-firmware-honesty.contract.json` (this module + Python
 * `scripts/lib/pcb_firmware_honesty.py` both load it). Chain/solo MUST attach
 * `buildFirmwareHonestyRecord()` onto `state.pcb.firmwareProof.honesty` every run.
 *
 * INTENT: lessons live on the Anvil execution path (state + artefacts + guards),
 * so Excel/pack/agents cannot drift into "firmware works" / FUNCTIONALLY VERIFIED theatre.
 */

import fs from 'node:fs'
import path from 'node:path'

import contractJson from './pcb-firmware-honesty.contract.json'

export type FirmwareProofTier = 0 | 1 | 2 | 3

/** @description Committed contract object (schema pcb-firmware-honesty/v1). */
export const PCB_FIRMWARE_HONESTY_CONTRACT = contractJson

/** Max honest PCB readiness banner prefix (never bare FAB-READY). */
export const PCB_FAB_READY_BANNER =
  PCB_FIRMWARE_HONESTY_CONTRACT.fabReadyBanner as 'FAB-READY — UNPROVEN IN HARDWARE'

/** Forbidden claim — requires real HIL transcript we do not have in-chain. */
export const PCB_FORBIDDEN_FUNCTIONAL_CLAIM =
  PCB_FIRMWARE_HONESTY_CONTRACT.forbiddenFunctionalClaim as 'FUNCTIONALLY VERIFIED'

/** First-class git tree for Cortex-M bring-up (fixpack20). */
export const FIRMWARE_PCB_BRINGUP_REL_POSIX =
  PCB_FIRMWARE_HONESTY_CONTRACT.firmwarePcbBringupRelPosix as 'firmware/pcb-bringup'

/** Deliverable pack root for firmware (sibling of pcb/, not under it). */
export const DELIVERABLE_FIRMWARE_ROOT =
  PCB_FIRMWARE_HONESTY_CONTRACT.deliverableFirmwareRoot as 'firmware'

export interface FirmwareHonestyRecord {
  schema: 'pcb-firmware-honesty/v1'
  tier: FirmwareProofTier | null
  ok: boolean | null
  /** Excel "Firmware status" cell — never FUNCTIONALLY VERIFIED. */
  statusLabel: string
  fabReadyBanner: typeof PCB_FAB_READY_BANNER
  forbiddenClaim: typeof PCB_FORBIDDEN_FUNCTIONAL_CLAIM
  /** Fragment for readiness_why when ok; empty when not. */
  readinessWhyFragment: string
  /** Always false in-chain until a real HIL transcript exists. */
  isHil: false
  claimsFunctionalVerification: false
}

/**
 * @description Canonical Firmware-status cell for the Excel PCB tab.
 * Reads from the committed contract JSON — keep Python loader in lockstep.
 */
export function firmwareStatusString(
  tier: number | null | undefined,
  fwOk: boolean | null | undefined,
): string {
  const s = PCB_FIRMWARE_HONESTY_CONTRACT.status
  if (fwOk === false) return s.fail
  if (tier == null || fwOk == null) return s.notRun
  if (tier >= 3) return s.tier3
  if (tier === 2) return s.tier2
  if (tier === 1) return s.tier1
  return s.tier0
}

/**
 * @description Tier-aware readiness_why fragment when firmwareProof.ok.
 * Never implies HIL or product validation.
 */
export function firmwareReadinessWhyFragment(tier: number | null | undefined): string {
  const w = PCB_FIRMWARE_HONESTY_CONTRACT.readinessWhyFragment
  if (tier != null && tier >= 3) return w.tier3
  if (tier === 2) return w.tier2
  if (tier === 1) return w.tier1
  return w.tier0
}

/** Pack README honesty paragraph (Terminal bundler + Cursor tip). */
export const FIRMWARE_PACK_README_BODY =
  PCB_FIRMWARE_HONESTY_CONTRACT.packReadmeLines.join('\n')

/**
 * @description Structured honesty block written onto every firmwareProof in state.
 * Excel MUST prefer `honesty.statusLabel` over recomputing from tier alone.
 */
export function buildFirmwareHonestyRecord(
  tier: number | null | undefined,
  fwOk: boolean | null | undefined,
): FirmwareHonestyRecord {
  const normalizedTier: FirmwareProofTier | null =
    tier == null || Number.isNaN(Number(tier))
      ? null
      : (Math.min(3, Math.max(0, Math.trunc(Number(tier)))) as FirmwareProofTier)
  const okNorm = fwOk === true ? true : fwOk === false ? false : null
  return {
    schema: 'pcb-firmware-honesty/v1',
    tier: normalizedTier,
    ok: okNorm,
    statusLabel: firmwareStatusString(normalizedTier, okNorm),
    fabReadyBanner: PCB_FAB_READY_BANNER,
    forbiddenClaim: PCB_FORBIDDEN_FUNCTIONAL_CLAIM,
    readinessWhyFragment:
      okNorm === true ? firmwareReadinessWhyFragment(normalizedTier) : '',
    isHil: false,
    claimsFunctionalVerification: false,
  }
}

/**
 * @description Persist contract + per-run honesty into a firmware-proof artefact dir.
 * Fail-closed consumers (Excel, pack README, proveCatch) can load without re-deriving.
 */
export function writeFirmwareHonestyArtefacts(
  artefactDir: string,
  honesty: FirmwareHonestyRecord,
): { contractPath: string; honestyPath: string } {
  fs.mkdirSync(artefactDir, { recursive: true })
  const contractPath = path.join(artefactDir, 'pcb-firmware-honesty.contract.json')
  const honestyPath = path.join(artefactDir, 'honesty.json')
  fs.writeFileSync(contractPath, JSON.stringify(PCB_FIRMWARE_HONESTY_CONTRACT, null, 2))
  fs.writeFileSync(honestyPath, JSON.stringify(honesty, null, 2))
  return { contractPath, honestyPath }
}

/**
 * @description True when a status/banner string illegally asserts product validation.
 * Allows the word FUNCTIONALLY VERIFIED only when guarded by NEVER/never/must not.
 */
export function claimsFunctionalVerificationIllegally(text: string): boolean {
  const re = /FUNCTIONALLY VERIFIED/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) != null) {
    const ctx = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase()
    if (!ctx.includes('never') && !ctx.includes('must not') && !ctx.includes('not ')) {
      return true
    }
  }
  return false
}

/**
 * @description Adversarial theatre detector: CHECK … PASS without virt_i2c_read8 in MCU sim main.
 */
export function isHardcodedMcuSimTheatre(mainC: string): boolean {
  const hasPass = /forge_sh_write0\s*\(\s*"CHECK [^"]*PASS/i.test(mainC)
  const probes = mainC.includes('virt_i2c_read8')
  return hasPass && !probes
}

/**
 * @description What each firmware tier actually proves (for SIGHT / agents).
 */
export const FIRMWARE_TIER_TRUTH = {
  0: PCB_FIRMWARE_HONESTY_CONTRACT.tierTruth['0'],
  1: PCB_FIRMWARE_HONESTY_CONTRACT.tierTruth['1'],
  2: PCB_FIRMWARE_HONESTY_CONTRACT.tierTruth['2'],
  3: PCB_FIRMWARE_HONESTY_CONTRACT.tierTruth['3'],
} as const satisfies Record<FirmwareProofTier, { is: string; isNot: string }>
