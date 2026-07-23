/**
 * @file Canonical PCB firmware honesty doctrine (shared labels + forbidden claims).
 * @description Tristan 2026-07-22/23: never oversell QEMU/host-bind as product validation.
 * Excel (`build-excel-export.py::_pcb_firmware_status_string`) MUST stay byte-aligned with
 * these strings — proveCatch in pcb-firmware-honesty.test.ts locks the contract.
 *
 * INTENT: one source of truth so Cursor TS + Terminal Excel + pack README cannot drift
 * into "firmware works" / FUNCTIONALLY VERIFIED theatre.
 */

/** Max honest PCB readiness banner prefix (never bare FAB-READY). */
export const PCB_FAB_READY_BANNER = 'FAB-READY — UNPROVEN IN HARDWARE' as const

/** Forbidden claim — requires real HIL transcript we do not have in-chain. */
export const PCB_FORBIDDEN_FUNCTIONAL_CLAIM = 'FUNCTIONALLY VERIFIED' as const

/** First-class git tree for Cortex-M bring-up (fixpack20). */
export const FIRMWARE_PCB_BRINGUP_REL_POSIX = 'firmware/pcb-bringup'

/** Deliverable pack root for firmware (sibling of pcb/, not under it). */
export const DELIVERABLE_FIRMWARE_ROOT = 'firmware'

export type FirmwareProofTier = 0 | 1 | 2 | 3

/**
 * @description Canonical Firmware-status cell for the Excel PCB tab.
 * Mirrors Terminal `_pcb_firmware_status_string` — keep in lockstep.
 */
export function firmwareStatusString(
  tier: number | null | undefined,
  fwOk: boolean | null | undefined,
): string {
  if (fwOk === false) return 'FAIL'
  if (tier == null || fwOk == null) return 'NOT RUN'
  if (tier >= 3) {
    return 'VIRTUAL BRING-UP PASS (QEMU + modelled I²C) — UNPROVEN IN HARDWARE'
  }
  if (tier === 2) return 'HOST BIND / CONTRACT PASS — UNPROVEN IN HARDWARE'
  if (tier === 1) return 'COMPILE / CONTRACT ONLY — UNPROVEN IN HARDWARE'
  return 'CONTRACT ONLY — UNPROVEN IN HARDWARE'
}

/**
 * @description Tier-aware readiness_why fragment when firmwareProof.ok.
 * Never implies HIL or product validation.
 */
export function firmwareReadinessWhyFragment(tier: number | null | undefined): string {
  if (tier != null && tier >= 3) {
    return (
      'QEMU Cortex-M bring-up probed modelled I²C devices (virt_i2c_read8) — ' +
      'VIRTUAL BOARD ONLY, not HIL; NOT FUNCTIONALLY VERIFIED'
    )
  }
  if (tier === 2) {
    return 'host-bind / board-sim contract PASS — UNPROVEN IN HARDWARE (not MCU execution, not HIL)'
  }
  if (tier === 1) {
    return 'Tier-1 pinmap compile PASS — UNPROVEN IN HARDWARE (not running on silicon)'
  }
  return 'firmware-contract evidence present — UNPROVEN IN HARDWARE (not HIL)'
}

/** Pack README honesty paragraph (Terminal bundler + Cursor tip). */
export const FIRMWARE_PACK_README_BODY = [
  'PCB firmware in this pack is VIRTUAL BRING-UP only.',
  'QEMU (or host bind) exercises modelled peripherals — NOT SAMD21 silicon, NOT HIL.',
  `Max claim: ${PCB_FAB_READY_BANNER}.`,
  `NEVER claim ${PCB_FORBIDDEN_FUNCTIONAL_CLAIM} from these artefacts alone.`,
].join('\n')

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
  0: {
    is: 'Native host contract harness (buses/channels/safe-off as software contract)',
    isNot: 'MCU execution, board silicon, HIL',
  },
  1: {
    is: 'arm-none-eabi link of pinmap-bound freestanding project from firmware/pcb-bringup',
    isNot: 'Running firmware, peripheral I/O, HIL',
  },
  2: {
    is: 'Host net/device bind against board-sim model (pads/nets/expected I²C)',
    isNot: 'Cortex-M execution — Mac/Mach-O mock only',
  },
  3: {
    is: 'QEMU Cortex-M ELF calls virt_i2c_read8 on RAM-modelled devices from expected_devices',
    isNot: 'SAMD21 SERCOM silicon, physical chips, HIL, FUNCTIONALLY VERIFIED',
  },
} as const satisfies Record<FirmwareProofTier, { is: string; isNot: string }>
