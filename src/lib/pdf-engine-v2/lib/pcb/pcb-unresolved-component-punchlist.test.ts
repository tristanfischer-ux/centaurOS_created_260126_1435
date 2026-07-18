import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface PunchlistEntry {
  id: string
  product: string
  targetBoard: {
    boardId: string
    boardRole: string
  }
  wordId: string
  characterId: string
  requiredRatings: {
    status: 'source_verified' | 'partially_verified' | 'unproven'
    requirements: string[]
    missing: string[]
    evidence: string[]
  }
  missingEvidence: {
    kind: 'mpn' | 'symbol_pinout'
    details: string
  }
  sourceCandidate: null | {
    identity: string
    evidenceLevel: 'manufacturer_ordering_code' | 'gold_source_value' | 'gold_role_family'
    source: string
    disposition: 'candidate_only' | 'reject_for_target_role'
  }
  exactAction: {
    action: 'ingest' | 'map_symbol_pinout' | 'reclassify' | 'derive_and_source'
    targetSource: string
    acceptance: string[]
  }
}

interface PunchlistRoleGroup {
  universalFunctionRole: string
  entries: PunchlistEntry[]
}

interface Punchlist {
  schema: 'pcb-unresolved-component-punchlist/v1'
  sourceReport: {
    path: string
    producingCommit: string
    totalGeneratedComponents: number
    verifiedIdentityCount: number
    unresolvedIdentityCount: number
  }
  summary: {
    unresolvedFittedComponents: number
    missingMpn: number
    missingSymbolPinout: number
    targetBoards: number
    productsWithFittedBoards: number
  }
  roleGroups: PunchlistRoleGroup[]
}

const PUNCHLIST_PATH = resolve(
  __dirname,
  'pcb-unresolved-component-punchlist.json',
)
const MARKDOWN_PATH = resolve(
  __dirname,
  '../../../../../docs/plans/CURSOR-YURI-PCB-UNRESOLVED-COMPONENT-PUNCHLIST-2026-07-18.md',
)

const EXPECTED_BLOCKERS = [
  'Colorimeter/optical_source/detector_mount_plate_word',
  'Colorimeter/optical_source/led_source_word',
  'Colorimeter/optical_source/led_driver_word',
  'Colorimeter/optical_source/dc_dc_regulator_word',
  'Colorimeter/optical_source/source_board_connector_word',
  'NinjaPCR/thermal_controller/terminal_block_word',
  'NinjaPCR/thermal_controller/bulk_capacitor_word',
  'NinjaPCR/thermal_controller/status_led_word',
  'NinjaPCR/thermal_controller/h_bridge_tec_driver_word',
  'NinjaPCR/thermal_controller/dc_dc_regulator_word',
  'NinjaPCR/thermal_controller/current_sense_shunt_word',
  'NinjaPCR/thermal_controller/wifi_module_word',
  'NinjaPCR/thermal_controller/debug_uart_word',
  'NinjaPCR/thermal_controller/usb_interface_tool_grounded_word',
  'NinjaPCR/thermal_controller/thermal_fuse_safety_word',
  'NinjaPCR/thermal_controller/estop_or_power_kill_word',
  'Pioreactor/wet_lab_hat/usb_interface_word',
  'Pioreactor/wet_lab_hat/firmware_storage_word',
  'Pioreactor/wet_lab_hat/debug_header_word',
  'Pioreactor/wet_lab_hat/host_protocol_bridge_word',
  'Pioreactor/od_optics/usb_power_entry_word',
  'Pioreactor/od_optics/esd_protection_network_word',
  'Pioreactor/od_optics/ferrite_emc_bead_word',
  'Pioreactor/od_optics/power_indicator_led_word',
  'Pioreactor/wet_actuation/required_heater_channel_word',
  'Pioreactor/wet_actuation/required_stir_channel_word',
  'Pioreactor/wet_actuation/required_pump_channel_word',
  'Rodeostat/analog_afe/usb_power_entry_word',
  'Rodeostat/analog_afe/esd_protection_network_word',
  'Rodeostat/analog_afe/ferrite_emc_bead_word',
  'Rodeostat/analog_afe/power_indicator_led_word',
  'Rodeostat/analog_afe/dac_output_stage_word',
  'Rodeostat/analog_afe/adc_input_stage_word',
  'Rodeostat/analog_afe/usb_interface_word',
  'Rodeostat/analog_afe/host_protocol_bridge_word',
  'Rodeostat/analog_afe/current_measurement_tia_word',
  'Rodeostat/analog_afe/status_indicator_word',
  'OpenDrop/hv_controller_main/dac_output_stage_word',
  'OpenDrop/hv_controller_main/adc_input_stage_word',
  'OpenDrop/hv_controller_main/usb_power_entry_word',
  'OpenDrop/hv_controller_main/esd_protection_network_word',
  'OpenDrop/hv_controller_main/ferrite_emc_bead_word',
  'OpenDrop/hv_controller_main/power_indicator_led_word',
  'OpenDrop/hv_controller_main/usb_interface_word',
  'OpenDrop/hv_controller_main/firmware_storage_word',
  'OpenDrop/hv_controller_main/debug_header_word',
  'OpenDrop/hv_controller_main/host_protocol_bridge_word',
  'OpenDrop/hv_controller_main/current_measurement_tia_word',
  'OpenDrop/hv_controller_main/status_indicator_word',
  'OpenDrop/electrode_cartridge/required_electrode_channel_word',
].sort()

function readPunchlist(): Punchlist {
  const parsed: unknown = JSON.parse(readFileSync(PUNCHLIST_PATH, 'utf8'))
  return parsed as Punchlist
}

describe('Yuri unresolved fitted-component punchlist', () => {
  it('uses the versioned schema and exactly reconciles the latest offline report', () => {
    const punchlist = readPunchlist()
    const entries = punchlist.roleGroups.flatMap((group) => group.entries)

    expect(punchlist.schema).toBe('pcb-unresolved-component-punchlist/v1')
    expect(punchlist.sourceReport).toEqual({
      path: '/tmp/pcb-yuri-identity-final/verification-report.json',
      producingCommit: 'd43f46aaf',
      totalGeneratedComponents: 85,
      verifiedIdentityCount: 35,
      unresolvedIdentityCount: 50,
    })
    expect(entries).toHaveLength(50)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(50)
    expect(new Set(entries.map((entry) =>
      `${entry.product}/${entry.targetBoard.boardId}/${entry.wordId}`)).size).toBe(50)
    expect(entries.map((entry) =>
      `${entry.product}/${entry.targetBoard.boardId}/${entry.wordId}`).sort())
      .toEqual(EXPECTED_BLOCKERS)
  })

  it('covers every product/board blocker and reconciles evidence-gap counts', () => {
    const punchlist = readPunchlist()
    const entries = punchlist.roleGroups.flatMap((group) => group.entries)
    const productCounts = entries.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.product] = (counts[entry.product] ?? 0) + 1
      return counts
    }, {})
    const boardCounts = entries.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.targetBoard.boardId] =
        (counts[entry.targetBoard.boardId] ?? 0) + 1
      return counts
    }, {})
    const gapCounts = entries.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.missingEvidence.kind] =
        (counts[entry.missingEvidence.kind] ?? 0) + 1
      return counts
    }, {})

    expect(productCounts).toEqual({
      Colorimeter: 5,
      NinjaPCR: 11,
      Pioreactor: 11,
      Rodeostat: 10,
      OpenDrop: 13,
    })
    expect(boardCounts).toEqual({
      optical_source: 5,
      thermal_controller: 11,
      wet_lab_hat: 4,
      od_optics: 4,
      wet_actuation: 3,
      analog_afe: 10,
      hv_controller_main: 12,
      electrode_cartridge: 1,
    })
    expect(gapCounts).toEqual({
      mpn: 38,
      symbol_pinout: 12,
    })
    expect(punchlist.summary).toEqual({
      unresolvedFittedComponents: 50,
      missingMpn: 38,
      missingSymbolPinout: 12,
      targetBoards: 8,
      productsWithFittedBoards: 5,
    })
  })

  it('keeps every candidate unresolved and specifies ratings and a source action', () => {
    const punchlist = readPunchlist()
    const entries = punchlist.roleGroups.flatMap((group) => group.entries)

    for (const group of punchlist.roleGroups) {
      expect(group.universalFunctionRole.trim()).not.toBe('')
      expect(group.entries.length).toBeGreaterThan(0)
    }
    for (const entry of entries) {
      expect(entry.requiredRatings.missing.length).toBeGreaterThan(0)
      expect(entry.requiredRatings.evidence.length).toBeGreaterThan(0)
      expect(entry.missingEvidence.details.trim()).not.toBe('')
      expect(entry.exactAction.targetSource.trim()).not.toBe('')
      expect(entry.exactAction.acceptance.length).toBeGreaterThan(0)
      if (entry.sourceCandidate) {
        expect(entry.sourceCandidate.disposition).not.toBe('resolved')
        expect(entry.sourceCandidate.source).toMatch(/https?:\/\/|forge-truth/)
      }
    }
  })

  it('keeps the human punchlist complete and keyed to every machine-readable item', () => {
    const punchlist = readPunchlist()
    const markdown = readFileSync(MARKDOWN_PATH, 'utf8')
    const entries = punchlist.roleGroups.flatMap((group) => group.entries)

    expect(markdown).toContain('50 unresolved fitted components')
    expect(markdown).toContain('38 missing MPN')
    expect(markdown).toContain('12 missing symbol/pinout')
    for (const group of punchlist.roleGroups) {
      expect(markdown).toContain(group.universalFunctionRole)
    }
    for (const entry of entries) {
      expect(markdown).toContain(`<a id="${entry.id}"></a>`)
    }
  })
})
