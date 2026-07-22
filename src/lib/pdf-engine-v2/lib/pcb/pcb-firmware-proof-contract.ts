/**
 * @file Build fat firmware-proof contracts from thin architecture specs (P9b).
 * @description Thin `deriveFirmwareProofSpecs` output → shape that
 * `prototypes/pcb-firmware-proof/firmware_proof.py` validates. Incomplete pin
 * evidence sets `pin_contract_complete:false` (fail closed). Never claims HIL.
 */

import { buildFirmwareBusesFromNets } from './pcb-firmware-pinmap-from-nets'

import type { PcbFirmwareProofSpec } from './pcb-firmware-proof-spec'

export interface FirmwareProofContractComponent {
  wordId: string
  refdes?: string
  mpn?: string | null
  characterId?: string
  functionClass?: string | null
  instanceName?: string
  manufacturer?: string | null
}

export interface FirmwareProofContractNet {
  name: string
  kind?: string
  members: Array<{ instanceName: string; pin: string }>
}

function componentLooksLikeMcu(c: FirmwareProofContractComponent): boolean {
  return (
    c.functionClass === 'microcontroller'
    || /mcu|microcontroller/i.test(`${c.characterId ?? ''} ${c.wordId ?? ''} ${c.instanceName ?? ''}`)
  )
}

/**
 * @description Expand a thin architecture proof target into a fat prove-able contract.
 * @param args.thin Thin board-level proof sketch from architecture
 * @param args.designFitnessOk Whether PCB design fitness already passed
 * @param args.mcu Optional MCU identity from generator components
 * @param args.components On-board components with optional MPNs
 * @param args.nets Optional generator nets — used to derive real MCU bus pads
 * @param args.implementedChannels Design-evidence counts from
 *   `deriveImplementedChannelCounts` — NEVER invent instances from requiredCount
 * @returns Fat contract object for firmware_proof.py
 */
export function buildFirmwareProofContract(args: {
  thin: PcbFirmwareProofSpec
  designFitnessOk: boolean
  mcu?: { mpn: string; manufacturer?: string }
  components: FirmwareProofContractComponent[]
  nets?: FirmwareProofContractNet[]
  implementedChannels?: Record<string, number>
}): Record<string, unknown> {
  const {
    thin,
    designFitnessOk,
    mcu,
    components,
    nets = [],
    implementedChannels = {},
  } = args
  // INTENT (2026-07-21): Tier-0 previously minted instances.length === requiredCount
  // even when design evidence said stir/pump=0 — firmware "PASS implemented=1" was
  // Goodhart. Instances must mirror real topology evidence; under-count fails proof.
  const channels = thin.channels.map((ch, i) => {
    const implemented = Math.max(0, Math.floor(implementedChannels[ch.role] ?? 0))
    return {
      channel_id: `${ch.role}_${i}`,
      role: ch.role,
      required_count: ch.requiredCount,
      instances: Array.from({ length: implemented }, (_, k) => ({
        instance_id: `${ch.role}_${k}`,
        enable_net: `${ch.role.toUpperCase()}_EN_${k}`,
        output_net: `${ch.role.toUpperCase()}_OUT_${k}`,
      })),
    }
  })

  // DECISION (fixpack12): MCU identity is board-scoped. Passing the HAT SAMD21
  // into od_optics / wet_actuation made pin_contract_complete:true with no MCU
  // fitted — Tier-0 PASS was theatre. No on-board MCU → interconnect_only.
  const boardHasMcu = components.some(componentLooksLikeMcu)
  const effectiveMcu = boardHasMcu ? mcu : undefined
  const kind =
    thin.kind === 'cots_host_integration'
      ? 'cots_host_integration'
      : boardHasMcu
        ? 'custom_board'
        : 'interconnect_only'

  // GOTCHA: pin_contract_complete requires on-board MCU evidence + MPN + fitness.
  const pinComplete = Boolean(effectiveMcu?.mpn) && boardHasMcu && designFitnessOk

  const busComponents = components.map((c) => ({
    instanceName: c.instanceName ?? c.refdes ?? c.wordId,
    functionClass: c.functionClass
      ?? (componentLooksLikeMcu(c) ? 'microcontroller' : null),
    characterId: c.characterId,
    manufacturer: c.manufacturer ?? effectiveMcu?.manufacturer ?? null,
    partNumber: c.mpn ?? null,
  }))
  if (
    boardHasMcu
    && effectiveMcu?.mpn
    && !busComponents.some((c) => c.functionClass === 'microcontroller')
  ) {
    busComponents.push({
      instanceName: '_mcu',
      functionClass: 'microcontroller',
      characterId: 'main_controller_mcu',
      manufacturer: effectiveMcu.manufacturer ?? null,
      partNumber: effectiveMcu.mpn,
    })
  }

  const buses = boardHasMcu
    ? buildFirmwareBusesFromNets({
        nets,
        components: busComponents,
        mcuMpn: effectiveMcu?.mpn,
      })
    : []

  return {
    schema: 'pcb-firmware-proof-spec/v1',
    proof_target_id: thin.proofTargetId,
    kind,
    design_fitness_ok: designFitnessOk,
    mcu: effectiveMcu
      ? {
          mpn: effectiveMcu.mpn,
          toolchain: 'native-draft',
          pin_contract_complete: pinComplete,
        }
      : null,
    buses,
    components: components
      .filter((c) => Boolean(c.mpn))
      .map((c) => ({
        word_id: c.wordId,
        refdes: c.refdes ?? 'U?',
        mpn: c.mpn,
        driver_key: 'generic',
        identity_check: { kind: 'mpn_match' },
      })),
    channels,
    actuators: [],
    communications: [
      {
        kind: 'uart_banner',
        expected_banner_prefix: `PROOF|${thin.proofTargetId}|`,
      },
    ],
  }
}
