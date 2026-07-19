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
  schema: 'pcb-unresolved-component-punchlist/v2'
  sourceReport: {
    path: string
    producingCommit: string
    totalGeneratedComponents: number
    verifiedIdentityCount: number
    unresolvedIdentityCount: number
  }
  summary: {
    baselineUnresolvedFittedComponents: number
    resolvedIdentityCount: number
    reclassifiedNonComponentCount: number
    remainingUnresolvedFittedComponents: number
    remainingMissingMpn: number
    remainingMissingSymbolPinout: number
    targetBoards: number
    productsWithFittedBoards: number
  }
  resolvedIdentityIds: string[]
  scopeReclassifications: Array<{
    id: string
    product: string
    placement:
      | 'off_board_module'
      | 'interconnect_only'
      | 'mechanical_only'
      | 'functional_requirement'
      | 'passive_geometry'
      | 'passive_topology'
    wholeSystemOwner: string
    evidence: string
    retainedFunction: string
  }>
  roleGroups: PunchlistRoleGroup[]
}

interface ProcurementRequirement {
  punchlistId: string
  function: string
  electrical: {
    voltage: string
    current: string
    power: string
  }
  signalIntegrity: {
    precision: string
    bandwidth: string
    noise: string
  }
  channelCount: string
  interface: string
  packageConstraints: string
  environmentLifecycle: string
  evidence: string[]
  disposition: {
    status:
      | 'resolved_exact_mpn'
      | 'rejected_not_fitted'
      | 'reclassified_off_board_module'
      | 'procurement_required'
    manufacturer: string | null
    partNumber: string | null
    blocker: string | null
  }
}

interface ProcurementMatrix {
  schema: 'pcb-residual-procurement-requirements/v1'
  baselineCount: number
  resolvedExactMpnCount: number
  residualProcurementCount: number
  requirements: ProcurementRequirement[]
}

const PUNCHLIST_PATH = resolve(
  __dirname,
  'pcb-unresolved-component-punchlist.json',
)
const MARKDOWN_PATH = resolve(
  __dirname,
  '../../../../../docs/plans/CURSOR-YURI-PCB-UNRESOLVED-COMPONENT-PUNCHLIST-2026-07-18.md',
)
const PROCUREMENT_MATRIX_PATH = resolve(
  __dirname,
  'pcb-residual-procurement-requirements.json',
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

    expect(punchlist.schema).toBe('pcb-unresolved-component-punchlist/v2')
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
    const closedIds = new Set([
      ...punchlist.resolvedIdentityIds,
      ...punchlist.scopeReclassifications.map((item) => item.id),
    ])
    const remainingEntries = entries.filter((entry) => !closedIds.has(entry.id))
    const productCounts = remainingEntries.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.product] = (counts[entry.product] ?? 0) + 1
      return counts
    }, {})
    const boardCounts = remainingEntries.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.targetBoard.boardId] =
        (counts[entry.targetBoard.boardId] ?? 0) + 1
      return counts
    }, {})
    const gapCounts = remainingEntries.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.missingEvidence.kind] =
        (counts[entry.missingEvidence.kind] ?? 0) + 1
      return counts
    }, {})

    expect(productCounts).toEqual({
      NinjaPCR: 9,
      OpenDrop: 7,
    })
    expect(boardCounts).toEqual({
      thermal_controller: 9,
      hv_controller_main: 7,
    })
    expect(gapCounts).toEqual({
      mpn: 16,
    })
    expect(punchlist.summary).toEqual({
      baselineUnresolvedFittedComponents: 50,
      resolvedIdentityCount: 12,
      reclassifiedNonComponentCount: 22,
      remainingUnresolvedFittedComponents: 16,
      remainingMissingMpn: 16,
      remainingMissingSymbolPinout: 0,
      targetBoards: 8,
      productsWithFittedBoards: 5,
    })
  })

  it('reclassifies only evidence-backed non-components and preserves whole-system ownership', () => {
    const punchlist = readPunchlist()
    const reclassifications = punchlist.scopeReclassifications

    expect(punchlist.resolvedIdentityIds).toHaveLength(12)
    expect(reclassifications).toHaveLength(22)
    expect(new Set(reclassifications.map((item) => item.id)).size).toBe(22)
    expect(reclassifications.reduce<Record<string, number>>((counts, item) => {
      counts[item.placement] = (counts[item.placement] ?? 0) + 1
      return counts
    }, {})).toEqual({
      mechanical_only: 1,
      off_board_module: 8,
      interconnect_only: 5,
      functional_requirement: 3,
      passive_geometry: 1,
      passive_topology: 4,
    })
    for (const item of reclassifications) {
      expect(item.wholeSystemOwner.trim()).not.toBe('')
      expect(item.evidence.trim()).not.toBe('')
      expect(item.retainedFunction.trim()).not.toBe('')
    }
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

    expect(markdown).toContain('16 unresolved fitted components')
    expect(markdown).toContain('16 missing MPN')
    expect(markdown).toContain('0 missing symbol/pinout')
    expect(markdown).toContain('22 evidence-backed non-components')
    for (const group of punchlist.roleGroups) {
      expect(markdown).toContain(group.universalFunctionRole)
    }
    for (const entry of entries) {
      expect(markdown).toContain(`<a id="${entry.id}"></a>`)
    }
  })

  it('publishes complete procurement requirements for all 29 residual roles', () => {
    const punchlist = readPunchlist()
    const matrix = JSON.parse(
      readFileSync(PROCUREMENT_MATRIX_PATH, 'utf8'),
    ) as ProcurementMatrix
    const closedBeforeThisPass = new Set([
      ...punchlist.resolvedIdentityIds.filter((id) =>
        ![
          'colorimeter-optical_source-led_source_word',
          'colorimeter-optical_source-source_board_connector_word',
          'pioreactor-wet_lab_hat-debug_header_word',
          'rodeostat-analog_afe-esd_protection_network_word',
          'opendrop-hv_controller_main-dac_output_stage_word',
          'opendrop-hv_controller_main-esd_protection_network_word',
          'opendrop-hv_controller_main-current_measurement_tia_word',
        ].includes(id)),
      ...punchlist.scopeReclassifications
        .filter((item) => ![
          'pioreactor-od_optics-ferrite_emc_bead_word',
          'pioreactor-od_optics-power_indicator_led_word',
          'rodeostat-analog_afe-ferrite_emc_bead_word',
          'rodeostat-analog_afe-power_indicator_led_word',
          'rodeostat-analog_afe-adc_input_stage_word',
          'rodeostat-analog_afe-status_indicator_word',
        ].includes(item.id))
        .map((item) => item.id),
    ])
    const baselineResidualIds = punchlist.roleGroups
      .flatMap((group) => group.entries)
      .filter((entry) => !closedBeforeThisPass.has(entry.id))
      .map((entry) => entry.id)
      .sort()

    expect(matrix.schema).toBe('pcb-residual-procurement-requirements/v1')
    expect(matrix.baselineCount).toBe(29)
    expect(matrix.resolvedExactMpnCount).toBe(7)
    expect(matrix.residualProcurementCount).toBe(16)
    expect(matrix.requirements).toHaveLength(29)
    expect(matrix.requirements.map((item) => item.punchlistId).sort())
      .toEqual(baselineResidualIds)
    expect(matrix.requirements.filter((item) =>
      item.disposition.status === 'resolved_exact_mpn').map((item) =>
      item.punchlistId).sort()).toEqual([
      'colorimeter-optical_source-led_source_word',
      'colorimeter-optical_source-source_board_connector_word',
      'opendrop-hv_controller_main-current_measurement_tia_word',
      'opendrop-hv_controller_main-dac_output_stage_word',
      'opendrop-hv_controller_main-esd_protection_network_word',
      'pioreactor-wet_lab_hat-debug_header_word',
      'rodeostat-analog_afe-esd_protection_network_word',
    ])
    expect(matrix.requirements.filter((item) =>
      item.disposition.status === 'rejected_not_fitted').map((item) =>
      item.punchlistId).sort()).toEqual([
      'pioreactor-od_optics-ferrite_emc_bead_word',
      'pioreactor-od_optics-power_indicator_led_word',
      'rodeostat-analog_afe-ferrite_emc_bead_word',
    ])
    for (const item of matrix.requirements) {
      expect(item.function.trim()).not.toBe('')
      expect(item.electrical.voltage.trim()).not.toBe('')
      expect(item.electrical.current.trim()).not.toBe('')
      expect(item.electrical.power.trim()).not.toBe('')
      expect(item.signalIntegrity.precision.trim()).not.toBe('')
      expect(item.signalIntegrity.bandwidth.trim()).not.toBe('')
      expect(item.signalIntegrity.noise.trim()).not.toBe('')
      expect(item.channelCount.trim()).not.toBe('')
      expect(item.interface.trim()).not.toBe('')
      expect(item.packageConstraints.trim()).not.toBe('')
      expect(item.environmentLifecycle.trim()).not.toBe('')
      expect(item.evidence.length).toBeGreaterThan(0)
      if (item.disposition.status === 'resolved_exact_mpn') {
        expect(item.disposition.manufacturer?.trim()).not.toBe('')
        expect(item.disposition.partNumber?.trim()).not.toBe('')
        expect(item.disposition.blocker).toBeNull()
      } else if (item.disposition.status === 'procurement_required') {
        expect(item.disposition.manufacturer).toBeNull()
        expect(item.disposition.partNumber).toBeNull()
        expect(item.disposition.blocker?.trim()).not.toBe('')
      } else if (item.disposition.status === 'rejected_not_fitted') {
        expect(item.disposition.manufacturer).toBeNull()
        expect(item.disposition.partNumber).toBeNull()
        expect(item.disposition.blocker).toBeNull()
      } else {
        expect(item.disposition.manufacturer?.trim()).not.toBe('')
        expect(item.disposition.partNumber?.trim()).not.toBe('')
        expect(item.disposition.blocker).toBeNull()
      }
    }
  })

})
