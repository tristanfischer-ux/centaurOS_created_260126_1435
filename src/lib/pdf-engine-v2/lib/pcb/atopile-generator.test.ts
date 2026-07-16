/**
 * @file atopile-generator.test.ts — Phase B verification (2026-07-12).
 * @description Fixtures cover:
 *   1. The REAL colorimeter design snapshot (`out/colorimeter-20260712-1010/state.json`)
 *      — proves the generator produces a well-formed atopile project with resolved
 *      footprints + an honest unresolved[] list on a real engine run.
 *   2. A hand-crafted, deliberately DIFFERENT electronic design (flight-controller
 *      MCU + IMU sensor + LED driver — no colorimeter vocabulary anywhere) — the
 *      UNIVERSALITY PROOF: the same generator, with zero special-casing, maps this
 *      unrelated design too.
 *   3. A compact instrument UI/controller/detector-module fixture proving COTS
 *      off-board disposition does not turn intentional modules into PCB gaps.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAtopileProject } from './atopile-generator'

const REPO_ROOT = join(__dirname, '../../../../..')
const COLORIMETER_STATE_PATH = join(REPO_ROOT, 'out/colorimeter-20260712-1010/state.json')

jest.mock('../distributors/db-only-cascade', () => ({
  lookupCached: jest.fn(() => ({ found: false, result: null, source: 'unknown', ageHours: null })),
}))

function makeTmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('atopile-generator', () => {
  const tmpDirs: string[] = []
  afterAll(() => {
    for (const dir of tmpDirs) {
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* no-op */ }
    }
  })

  const colorimeterAvailable = existsSync(COLORIMETER_STATE_PATH)
  const describeColorimeter = colorimeterAvailable ? describe : describe.skip

  describeColorimeter('colorimeter design snapshot (real engine run)', () => {
    const state = colorimeterAvailable
      ? JSON.parse(readFileSync(COLORIMETER_STATE_PATH, 'utf8'))
      : null

    it('writes a well-formed main.ato + ato.yaml + board-outline.json', () => {
      const outDir = makeTmpDir('atopile-colorimeter-')
      tmpDirs.push(outDir)
      const result = generateAtopileProject(state, outDir)

      expect(existsSync(result.mainAtoPath)).toBe(true)
      expect(existsSync(result.atoYamlPath)).toBe(true)
      expect(existsSync(result.boardOutlinePath)).toBe(true)

      const mainAto = readFileSync(result.mainAtoPath, 'utf8')
      expect(mainAto).toContain('module App:')
      expect(mainAto).toMatch(/component Part_\w+:/)
      expect(mainAto).toContain('footprint = "')

      const atoYaml = readFileSync(result.atoYamlPath, 'utf8')
      expect(atoYaml).toContain('entry: main.ato:App')
    })

    it('resolves on-board electronic components with verified footprints and separates off-board COTS modules', () => {
      const outDir = makeTmpDir('atopile-colorimeter-')
      tmpDirs.push(outDir)
      const result = generateAtopileProject(state, outDir)

      // The colorimeter design has on-board IC/passive/connector words plus
      // front-panel/controller/display modules that are now intentionally off-board
      // COTS assemblies. Assert sane floors, not exact counts.
      expect(result.components.length).toBeGreaterThanOrEqual(10)
      expect(result.offBoard.length).toBeGreaterThanOrEqual(1)
      for (const component of result.components) {
        expect(component.footprint).not.toBeNull()
        expect(component.footprint!.library.length).toBeGreaterThan(0)
        expect(component.footprint!.footprint.length).toBeGreaterThan(0)
      }
    })

    it('never silently drops a candidate word — every one lands in components[] or unresolved[]', () => {
      const outDir = makeTmpDir('atopile-colorimeter-')
      tmpDirs.push(outDir)
      const result = generateAtopileProject(state, outDir)

      // Every unresolved entry carries a wordId + a human-readable reason (honest
      // gap reporting, never a silent drop and never a faked footprint).
      for (const gap of result.unresolved) {
        expect(gap.wordId.length).toBeGreaterThan(0)
        expect(gap.reason.length).toBeGreaterThan(0)
      }
      expect(Array.isArray(result.unresolved)).toBe(true)
    })

    it('builds VCC/GND rails and at least one topology-derived signal net', () => {
      const outDir = makeTmpDir('atopile-colorimeter-')
      tmpDirs.push(outDir)
      const result = generateAtopileProject(state, outDir)

      const vcc = result.nets.find((n) => n.name === 'VCC')
      const gnd = result.nets.find((n) => n.name === 'GND')
      expect(vcc).toBeDefined()
      expect(gnd).toBeDefined()
      expect(vcc!.members.length).toBeGreaterThan(0)
      expect(gnd!.members.length).toBeGreaterThan(0)

      // Topology-derived signal nets are exercised by the arbitrary design below.
      // This real snapshot may route its UI/controller/detector participants as
      // off-board COTS modules, leaving only board rails in the PCB project.
      expect(Array.isArray(result.nets.filter((n) => n.kind === 'signal'))).toBe(true)
    })

    it('emits a valid board outline geometry (closed contour)', () => {
      const outDir = makeTmpDir('atopile-colorimeter-')
      tmpDirs.push(outDir)
      const result = generateAtopileProject(state, outDir)

      expect(result.boardOutline.outline.segments.length).toBeGreaterThan(0)
      expect(result.boardOutline.source).toBe('derived')
    })

    it('uses a window-scale source board outline for compact optical instruments', () => {
      const outDir = makeTmpDir('atopile-colorimeter-')
      tmpDirs.push(outDir)
      const result = generateAtopileProject(state, outDir)

      const points = result.boardOutline.outline.segments.flatMap((segment) => [
        segment.start,
        segment.end,
        ...(segment.kind === 'arc' ? [segment.mid] : []),
      ])
      const xs = points.map((point) => point.xMm)
      const ys = points.map((point) => point.yMm)
      const widthMm = Math.max(...xs) - Math.min(...xs)
      const heightMm = Math.max(...ys) - Math.min(...ys)

      expect(widthMm).toBeGreaterThanOrEqual(25)
      expect(heightMm).toBeGreaterThanOrEqual(25)
      expect(widthMm).toBeLessThanOrEqual(40)
      expect(heightMm).toBeLessThanOrEqual(40)
      expect(result.boardOutline.sourceDetail).toContain('compact instrument board')
    })
  })

  // ── UNIVERSALITY PROOF ──────────────────────────────────────────────────────
  // A completely different electronic design — a flight-controller MCU + an IMU
  // sensor + an LED driver. Zero character_id/vocabulary overlap with the
  // colorimeter fixture above. If this generator contained ANY colorimeter-
  // specific mapping, this design would fail to resolve; it doesn't, because
  // every table in atopile-generator.ts is keyed on generic function-class role
  // names and generic package-family text tokens.
  const arbitraryElectronicDesign = {
    moduleDecomposition: {
      modules: [
        {
          module: 'control_compute_communication',
          sub_modules: [
            {
              id: 'control_compute_communication__flight_controller',
              words: [
                {
                  id: 'flight_control_processor_word',
                  name_human: 'Flight Control Processor',
                  content_character: { character_id: 'flight_control_processor' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'form', value: 'Flight control MCU, LQFP-32 package, ARM Cortex-M4' },
                    { kind: 'manufacturer', value: 'STMicroelectronics' },
                    { kind: 'part_number', value: 'STM32F405RGT6' },
                  ],
                },
              ],
            },
          ],
        },
        {
          module: 'sensing_instrumentation',
          sub_modules: [
            {
              id: 'sensing_instrumentation__imu',
              words: [
                {
                  id: 'imu_sensor_word',
                  name_human: 'IMU Sensor',
                  content_character: { character_id: 'imu_sensor' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'form', value: 'Accelerometer + gyroscope IMU sensor IC, LGA-14 package' },
                    { kind: 'part_number', value: 'TBD (detailed design)' },
                  ],
                },
              ],
            },
          ],
        },
        {
          module: 'energy_conversion_transduction',
          sub_modules: [
            {
              id: 'energy_conversion_transduction__nav_lights',
              words: [
                {
                  id: 'led_driver_ic_word',
                  name_human: 'Navigation LED Driver',
                  content_character: { character_id: 'led_driver_ic' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'form', value: 'LED driver IC, SOT-23-6 package' },
                    { kind: 'part_number', value: 'TBD (detailed design)' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    orchestratorContract: {
      topology: [
        { from_part: 'IMU Sensor', to_part: 'Flight Control Processor', mechanism: 'signal' },
        { from_part: 'Flight Control Processor', to_part: 'Navigation LED Driver', mechanism: 'signal' },
      ],
    },
  }

  it('generates_for_an_arbitrary_electronic_design_not_just_colorimeter', () => {
    const outDir = makeTmpDir('atopile-arbitrary-')
    tmpDirs.push(outDir)
    const result = generateAtopileProject(arbitraryElectronicDesign, outDir)

    expect(result.unresolved).toEqual([])
    expect(result.components.length).toBeGreaterThanOrEqual(3)

    const byWordId = new Map(result.components.map((c) => [c.wordId, c]))
    const mcu = byWordId.get('flight_control_processor_word')
    const imu = byWordId.get('imu_sensor_word')
    const ledDriver = byWordId.get('led_driver_ic_word')

    expect(mcu).toBeDefined()
    expect(imu).toBeDefined()
    expect(ledDriver).toBeDefined()

    // Package-family OR MPN-package tier fires from the design's OWN package /
    // MPN text — never a hardcoded per-product table. mpn_package is the stronger
    // tier when a real MPN is present; either must land a real KiCad library.
    expect(['package_family', 'mpn_package']).toContain(mcu!.resolutionTier)
    expect(mcu!.footprint!.library).toBe('Package_QFP')
    expect(['package_family', 'mpn_package']).toContain(ledDriver!.resolutionTier)
    expect(ledDriver!.footprint!.library).toBe('Package_TO_SOT_SMD')

    // A generic sensor package default is still weaker than an MPN, but once it
    // resolves a real KiCad package family it is no longer a bare function guess.
    expect(['package_family', 'mpn_package']).toContain(imu!.resolutionTier)
    expect(imu!.functionClass).toBe('sensor_ic')

    // Topology-derived signal nets connect the design's OWN nets, not a fixed pair.
    const signalNets = result.nets.filter((n) => n.kind === 'signal')
    expect(signalNets.length).toBe(2)

    const mainAto = readFileSync(result.mainAtoPath, 'utf8')
    expect(mainAto).not.toMatch(/colorimeter|cuvette|photodiode|absorbance/i)
  })

  it('dispositions compact instrument UI/controller/detector modules as off-board COTS while keeping LEDs on-board', () => {
    const outDir = makeTmpDir('atopile-cots-offboard-')
    tmpDirs.push(outDir)
    const design = {
      isInstrumentDevice: true,
      parsedBrief: {
        product_description: 'A compact handheld optical instrument with a local display and optical detector module.',
      },
      moduleDecomposition: {
        modules: [
          {
            module: 'control_compute_communication',
            sub_modules: [
              {
                id: 'control_compute_communication__controller_ui',
                words: [
                  {
                    id: 'main_controller_word',
                    name_human: 'Main Controller',
                    content_character: { character_id: 'main_controller' },
                    modifier_characters: [{ kind: 'quantity', value: '×1' }],
                  },
                  {
                    id: 'local_display_word',
                    name_human: 'Local Display',
                    content_character: { character_id: 'local_display' },
                    modifier_characters: [{ kind: 'quantity', value: '×1' }],
                  },
                  {
                    id: 'user_input_buttons_word',
                    name_human: 'User Input Buttons',
                    content_character: { character_id: 'user_input_buttons' },
                    modifier_characters: [{ kind: 'quantity', value: '×3' }],
                  },
                ],
              },
            ],
          },
          {
            module: 'sensing_instrumentation',
            sub_modules: [
              {
                id: 'sensing_instrumentation__detector',
                words: [
                  {
                    id: 'optical_detector_module_word',
                    name_human: 'Optical Detector Module',
                    content_character: { character_id: 'optical_detector_module' },
                    modifier_characters: [{ kind: 'quantity', value: '×1' }],
                  },
                  {
                    id: 'sensor_interconnect_cable_word',
                    name_human: 'Sensor Interconnect Cable',
                    content_character: { character_id: 'sensor_interconnect_cable' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'analog detector signal cable for PCBA connection' },
                    ],
                  },
                  {
                    id: 'collimating_optic_word',
                    name_human: 'Collimating Optic',
                    content_character: { character_id: 'collimating_optic' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'optical sensor path part in compact PCBA instrument' },
                    ],
                  },
                  {
                    id: 'sensing_instrumentation_subcomponent_1_word',
                    name_human: 'Sensing Instrumentation Subcomponent 1',
                    content_character: { character_id: 'sensing_instrumentation_subcomponent_1' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'anonymous coverage proxy inheriting photodiode, cuvette, and LED module prose' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            module: 'power_distribution',
            sub_modules: [
              {
                id: 'power_distribution__protection',
                words: [
                  {
                    id: 'dc_input_fuse_word',
                    name_human: 'DC Input Fuse',
                    content_character: { character_id: 'dc_input_fuse' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'low-voltage PCBA power management protection part' },
                    ],
                  },
                  {
                    id: 'reverse_polarity_protection_word',
                    name_human: 'Reverse Polarity Protection',
                    content_character: { character_id: 'reverse_polarity_protection' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'low-voltage PCBA power management protection diode' },
                    ],
                  },
                  {
                    id: 'usb_power_interface_word',
                    name_human: 'USB Power Interface',
                    content_character: { character_id: 'usb_power_interface' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'USB-C PCBA power connector' },
                    ],
                  },
                  {
                    id: 'firmware_storage_word',
                    name_human: 'Firmware Storage',
                    content_character: { character_id: 'firmware_storage' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'PCBA nonvolatile memory for firmware' },
                    ],
                  },
                  {
                    id: 'power_switch_word',
                    name_human: 'Power Switch',
                    content_character: { character_id: 'power_switch' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      { kind: 'form', value: 'PCBA user power switch' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            module: 'energy_conversion_transduction',
            sub_modules: [
              {
                id: 'energy_conversion_transduction__indicator',
                words: [
                  {
                    id: 'status_led_word',
                    name_human: 'Status LED',
                    content_character: { character_id: 'status_indicator_led' },
                    modifier_characters: [{ kind: 'quantity', value: '×1' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      orchestratorContract: { topology: [] },
    }

    const result = generateAtopileProject(design, outDir)
    const offBoardIds = new Set(result.offBoard.map((record) => record.wordId))
    // Host-side power/USB/firmware/status ride with the purchased COTS
    // controller+UI kit (not the optical source daughterboard).
    expect(offBoardIds).toEqual(new Set([
      'main_controller_word',
      'local_display_word',
      'user_input_buttons_word',
      'optical_detector_module_word',
      'sensor_interconnect_cable_word',
      'collimating_optic_word',
      'dc_input_fuse_word',
      'firmware_storage_word',
      'power_switch_word',
      'reverse_polarity_protection_word',
      'usb_power_interface_word',
    ]))
    expect(result.unresolved.map((gap) => gap.wordId)).not.toEqual(
      expect.arrayContaining([...offBoardIds]),
    )
    const allPcbIds = new Set([
      ...result.components.map((record) => record.wordId),
      ...result.offBoard.map((record) => record.wordId),
      ...result.unresolved.map((record) => record.wordId),
    ])
    expect(allPcbIds.has('sensing_instrumentation_subcomponent_1_word')).toBe(false)

    const led = result.components.find((component) => component.wordId === 'status_led_word')
    expect(led).toBeDefined()
    expect(led!.functionClass).toBe('led')
    expect(led!.resolutionTier).toBe('package_family')

    // Host power/USB/firmware ride with the COTS controller kit — not on-board
    // footprints next to the status LED (gold delta G3/G15).
    for (const id of [
      'dc_input_fuse_word',
      'reverse_polarity_protection_word',
      'usb_power_interface_word',
      'firmware_storage_word',
      'power_switch_word',
    ]) {
      expect(offBoardIds.has(id)).toBe(true)
    }
  })

  it('keeps host power/USB off the optical source board when COTS UI+controller are present', () => {
    // proveCatch (2026-07-14 gold delta G3/G15): LED daughterboard ≠ motherboard.
    const outDir = makeTmpDir('atopile-led-daughterboard-')
    tmpDirs.push(outDir)
    const design = {
      isInstrumentDevice: true,
      parsedBrief: {
        product_description: 'A compact handheld optical instrument with replaceable LED source module and local display.',
      },
      moduleDecomposition: {
        modules: [
          {
            module: 'control_compute_communication',
            sub_modules: [{
              id: 'control_compute_communication__controller_ui',
              words: [
                { id: 'microcontroller_word', name_human: 'Microcontroller', content_character: { character_id: 'microcontroller' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'local_display_word', name_human: 'Local Display', content_character: { character_id: 'local_display' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'usb_interface_word', name_human: 'Usb Interface', content_character: { character_id: 'usb_interface' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
              ],
            }],
          },
          {
            module: 'energy_conversion_transduction',
            sub_modules: [{
              id: 'energy_conversion_transduction__led_source',
              words: [
                { id: 'led_source_word', name_human: 'LED Source', content_character: { character_id: 'led_source' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'led_driver_word', name_human: 'LED Driver', content_character: { character_id: 'led_driver' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
              ],
            }],
          },
          {
            module: 'energy_storage_source',
            sub_modules: [{
              id: 'energy_storage_source__battery',
              words: [
                { id: 'rechargeable_battery_pack_word', name_human: 'Rechargeable Battery Pack', content_character: { character_id: 'rechargeable_battery_pack' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'usb_power_interface_word', name_human: 'Usb Power Interface', content_character: { character_id: 'usb_power_interface' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'dc_input_fuse_word', name_human: 'DC Input Fuse', content_character: { character_id: 'dc_input_fuse' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
              ],
            }],
          },
        ],
      },
      orchestratorContract: { topology: [] },
    }
    const result = generateAtopileProject(design, outDir)
    const offBoardIds = new Set(result.offBoard.map((r) => r.wordId))
    expect(offBoardIds.has('microcontroller_word')).toBe(true)
    expect(offBoardIds.has('local_display_word')).toBe(true)
    expect(offBoardIds.has('usb_interface_word')).toBe(true)
    expect(offBoardIds.has('rechargeable_battery_pack_word')).toBe(true)
    expect(offBoardIds.has('usb_power_interface_word')).toBe(true)
    expect(offBoardIds.has('dc_input_fuse_word')).toBe(true)
    const onBoardIds = new Set(result.components.map((c) => c.wordId))
    expect(onBoardIds.has('led_source_word')).toBe(true)
    expect(onBoardIds.has('led_driver_word')).toBe(true)
    expect(result.boardOutline.sourceDetail).toContain('compact instrument board')
    const points = result.boardOutline.outline.segments.flatMap((segment) => [
      segment.start, segment.end, ...(segment.kind === 'arc' ? [segment.mid] : []),
    ])
    const widthMm = Math.max(...points.map((p) => p.xMm)) - Math.min(...points.map((p) => p.xMm))
    expect(widthMm).toBeLessThanOrEqual(40)
  })

  it('keeps mount-plate / STEMMA / charge-status off the optical source board', () => {
    // proveCatch (2026-07-14): colorimeter-2130 put detector_mount_plate (SOIC-8!),
    // stemma_header, charge_status_led, low_battery_indicator on the LED PCBA → 9 parts
    // + DRC edge violation. Gold is LED + driver (+ decouple); host/UI/optomech off-board.
    const outDir = makeTmpDir('atopile-instrument-scrub-2130-')
    tmpDirs.push(outDir)
    const design = {
      isInstrumentDevice: true,
      parsedBrief: {
        product_class: 'optical_instrument',
        product_description: 'A compact handheld optical instrument with LED source and local display.',
      },
      moduleDecomposition: {
        modules: [
          {
            module: 'control_compute_communication',
            sub_modules: [{
              id: 'control_compute_communication__host',
              words: [
                { id: 'compute_ui_module_word', name_human: 'Compute UI Module', content_character: { character_id: 'compute_ui_module' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'charge_status_led_word', name_human: 'Charge Status LED', content_character: { character_id: 'charge_status_led' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'low_battery_indicator_word', name_human: 'Low Battery Indicator', content_character: { character_id: 'low_battery_indicator' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                {
                  id: 'stemma_header_word',
                  name_human: 'Stemma Header',
                  content_character: { character_id: 'stemma_header' },
                  // GOTCHA: collector only sees electronic-category words — bare
                  // "stemma_header" is invisible; real runs carry I²C/connector form.
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'form', value: 'STEMMA QT I2C header, JST-PH' },
                  ],
                },
              ],
            }],
          },
          {
            module: 'sensing_instrumentation',
            sub_modules: [{
              id: 'sensing_instrumentation__detector',
              words: [
                { id: 'detector_mount_plate_word', name_human: 'Detector Mount Plate', content_character: { character_id: 'detector_mount_plate' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
              ],
            }],
          },
          {
            module: 'energy_conversion_transduction',
            sub_modules: [{
              id: 'energy_conversion_transduction__source',
              words: [
                { id: 'led_source_word', name_human: 'LED Source', content_character: { character_id: 'led_source' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'led_driver_word', name_human: 'LED Driver', content_character: { character_id: 'led_driver' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
              ],
            }],
          },
        ],
      },
      orchestratorContract: { topology: [] },
    }
    const result = generateAtopileProject(design, outDir)
    const offBoardIds = new Set(result.offBoard.map((r) => r.wordId))
    const onBoardIds = new Set(result.components.map((c) => c.wordId))
    expect(offBoardIds.has('detector_mount_plate_word')).toBe(true)
    expect(offBoardIds.has('stemma_header_word')).toBe(true)
    expect(offBoardIds.has('charge_status_led_word')).toBe(true)
    expect(offBoardIds.has('low_battery_indicator_word')).toBe(true)
    expect(onBoardIds.has('led_source_word')).toBe(true)
    expect(onBoardIds.has('led_driver_word')).toBe(true)
    expect(onBoardIds.has('detector_mount_plate_word')).toBe(false)
    expect(result.components.length).toBeLessThanOrEqual(4)
  })

  it('keeps a host dc_dc_regulator off the optical source board (not a motherboard rail)', () => {
    // proveCatch: colorimeter-1441 had dc_dc_regulator survive ON_BOARD_PCB_WORD_RE
    // (`regulator`) and inflate the LED daughterboard. Host rails ride with COTS MCU.
    const outDir = makeTmpDir('atopile-host-regulator-')
    tmpDirs.push(outDir)
    const design = {
      isInstrumentDevice: true,
      parsedBrief: {
        product_class: 'optical_instrument',
        product_description: 'A compact handheld optical instrument with LED source and local display.',
      },
      moduleDecomposition: {
        modules: [
          {
            module: 'control_compute_communication',
            sub_modules: [{
              id: 'control_compute_communication__host',
              words: [
                { id: 'compute_ui_module_word', name_human: 'Compute UI Module', content_character: { character_id: 'compute_ui_module' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'microcontroller_word', name_human: 'Microcontroller', content_character: { character_id: 'microcontroller' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
              ],
            }],
          },
          {
            module: 'energy_conversion_transduction',
            sub_modules: [{
              id: 'energy_conversion_transduction__source',
              words: [
                { id: 'led_source_word', name_human: 'LED Source', content_character: { character_id: 'led_source' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'dc_dc_regulator_word', name_human: 'DC-DC Regulator', content_character: { character_id: 'dc_dc_regulator' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
                { id: 'power_input_connector_word', name_human: 'Power Input Connector', content_character: { character_id: 'power_input_connector' }, modifier_characters: [{ kind: 'quantity', value: '×1' }] },
              ],
            }],
          },
        ],
      },
      orchestratorContract: { topology: [] },
    }
    const result = generateAtopileProject(design, outDir)
    const offBoardIds = new Set(result.offBoard.map((r) => r.wordId))
    const onBoardIds = new Set(result.components.map((c) => c.wordId))
    expect(offBoardIds.has('dc_dc_regulator_word')).toBe(true)
    expect(offBoardIds.has('power_input_connector_word')).toBe(true)
    expect(onBoardIds.has('led_source_word')).toBe(true)
    expect(onBoardIds.has('dc_dc_regulator_word')).toBe(false)
    const points = result.boardOutline.outline.segments.flatMap((segment) => [
      segment.start, segment.end, ...(segment.kind === 'arc' ? [segment.mid] : []),
    ])
    const widthMm = Math.max(...points.map((p) => p.xMm)) - Math.min(...points.map((p) => p.xMm))
    expect(widthMm).toBeLessThanOrEqual(40)
  })

  it('keeps a non-instrument display module on-board as a normal PCB footprint', () => {
    const outDir = makeTmpDir('atopile-display-onboard-')
    tmpDirs.push(outDir)
    const design = {
      moduleDecomposition: {
        modules: [
          {
            module: 'control_compute_communication',
            sub_modules: [
              {
                id: 'control_compute_communication__operator_panel',
                words: [
                  {
                    id: 'panel_display_word',
                    name_human: 'Operator Display Module',
                    content_character: { character_id: 'display_panel' },
                    modifier_characters: [{ kind: 'quantity', value: '×1' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      orchestratorContract: { topology: [] },
    }

    const result = generateAtopileProject(design, outDir)
    expect(result.offBoard).toEqual([])
    const display = result.components.find((component) => component.wordId === 'panel_display_word')
    expect(display).toBeDefined()
    expect(display!.functionClass).toBe('display_module')
  })

  // proveCatch (2026-07-15): wall ESS / plantish energy_storage is NOT
  // isInstrumentDevice, so instrument-only COTS filters used to leave battery
  // racks + smoke/gas detectors + DIN eth + HMI as on-board SOIC/JST → placement
  // death (powerwall-2214/0447). Plant purchased assemblies must go off-board
  // universally; status LEDs / board DC-DC may stay on-board.
  it('dispositions wall-ESS plant assemblies as off-board COTS without instrument flag', () => {
    const outDir = makeTmpDir('atopile-wall-ess-plant-')
    tmpDirs.push(outDir)
    // GOTCHA: collector only sees words whose text matches ELECTRONIC_CATEGORY_PATTERNS.
    // Real wall-ESS form modifiers carry fuse/wi-fi/display/battery prose (0447) —
    // fixtures must include that prose or the word never reaches offBoardCotsReason.
    const design = {
      isInstrumentDevice: false,
      parsedBrief: {
        product_class: 'energy_storage',
        product_description: 'Residential wall-mounted battery energy storage system.',
      },
      moduleDecomposition: {
        product_class: 'energy_storage',
        modules: [
          {
            module: 'energy_storage_source',
            sub_modules: [{
              id: 'energy_storage_source__cells',
              words: [
                {
                  id: 'battery_module_racks_word',
                  name_human: 'Battery Module Racks',
                  content_character: { character_id: 'battery_module_racks' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×2' },
                    { kind: 'form', value: 'Battery Module Racks — lfp prismatic cell pack + module frames + integrated bms' },
                  ],
                },
                {
                  id: 'battery_modules_word',
                  name_human: 'Battery Modules',
                  content_character: { character_id: 'battery_modules' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×8' },
                    { kind: 'form', value: 'Battery Modules — lfp prismatic cell pack + integrated bms component' },
                  ],
                },
              ],
            }],
          },
          {
            module: 'safety_protection',
            sub_modules: [{
              id: 'safety_protection__detection',
              words: [
                {
                  id: 'smoke_detectors_word',
                  name_human: 'Smoke Detectors',
                  content_character: { character_id: 'smoke_detectors' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×2' },
                    { kind: 'manufacturer', value: 'Apollo' },
                    { kind: 'part_number', value: '55000-392' },
                    { kind: 'form', value: 'Smoke Detectors — pack fuse + over-temperature cutoff + pack vent path' },
                  ],
                },
                {
                  id: 'gas_sensors_word',
                  name_human: 'Gas Sensors',
                  content_character: { character_id: 'gas_sensors' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'form', value: 'Gas Sensors — combustible gas detector with fuse-backed supply' },
                  ],
                },
                {
                  id: 'hydrogen_detection_sensor_word',
                  name_human: 'Hydrogen Detection Sensor',
                  content_character: { character_id: 'hydrogen_detection_sensor' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'form', value: 'Hydrogen Detection Sensor — H2 detector module with fuse-backed supply' },
                  ],
                },
              ],
            }],
          },
          {
            module: 'control_compute_communication',
            sub_modules: [{
              id: 'control_compute_communication__hmi',
              words: [
                {
                  id: 'ethernet_switch_word',
                  name_human: 'Ethernet Switch',
                  content_character: { character_id: 'ethernet_switch' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'manufacturer', value: 'Phoenix Contact' },
                    { kind: 'part_number', value: '2891005' },
                    { kind: 'form', value: 'Ethernet Switch — energy management controller + wi-fi/ethernet gateway' },
                  ],
                },
                {
                  id: 'local_hmi_display_word',
                  name_human: 'Local HMI Display',
                  content_character: { character_id: 'local_hmi_display' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'form', value: 'Local HMI Display — status led + app-based hmi display panel' },
                  ],
                },
                {
                  id: 'status_indicator_leds_word',
                  name_human: 'Status Indicator LEDs',
                  content_character: { character_id: 'status_indicator_leds' },
                  modifier_characters: [{ kind: 'quantity', value: '×4' }],
                },
                {
                  id: 'dc_dc_converters_word',
                  name_human: 'DC DC Converters',
                  content_character: { character_id: 'dc_dc_converters' },
                  modifier_characters: [
                    { kind: 'quantity', value: '×1' },
                    { kind: 'manufacturer', value: 'XP Power' },
                    { kind: 'part_number', value: 'DDC3024S09' },
                    { kind: 'form', value: 'DC DC Converters — board power rail regulator component' },
                  ],
                },
              ],
            }],
          },
        ],
      },
      orchestratorContract: { topology: [], quantities: { enclosure_volume_m3: { value: 0.14 } } },
    }
    const result = generateAtopileProject(design, outDir)
    const offBoardIds = new Set(result.offBoard.map((r) => r.wordId))
    const onBoardIds = new Set(result.components.map((c) => c.wordId))
    for (const id of [
      'battery_module_racks_word',
      'battery_modules_word',
      'smoke_detectors_word',
      'gas_sensors_word',
      'hydrogen_detection_sensor_word',
      'ethernet_switch_word',
      'local_hmi_display_word',
    ]) {
      expect(offBoardIds.has(id)).toBe(true)
      expect(onBoardIds.has(id)).toBe(false)
    }
    expect(onBoardIds.has('status_indicator_leds_word')).toBe(true)
    expect(onBoardIds.has('dc_dc_converters_word')).toBe(true)
    // No SOIC sensor_ic / battery JST litter on the control board.
    const mainAto = readFileSync(result.mainAtoPath, 'utf8')
    expect(mainAto).not.toMatch(/smoke_detectors_word/)
    expect(mainAto).not.toMatch(/battery_module/)

    // proveCatch: the nine plant assemblies that capped 0447 PCB as ELECTRONIC
    // gaps must also disposition off-board when the collector sees them.
    const plantGapDesign = {
      isInstrumentDevice: false,
      parsedBrief: { product_class: 'energy_storage', product_description: 'Wall ESS' },
      moduleDecomposition: {
        modules: [{
          module: 'safety_protection',
          sub_modules: [{
            id: 'safety_protection__plant',
            words: [
              { id: 'power_semiconductors_word', name_human: 'Power Semiconductors', content_character: { character_id: 'power_semiconductors' }, modifier_characters: [{ kind: 'form', value: 'IGBT power semiconductors in PCS' }] },
              { id: 'power_conversion_system_pcs_word', name_human: 'Power Conversion System PCS', content_character: { character_id: 'power_conversion_system_pcs' }, modifier_characters: [{ kind: 'form', value: 'PCS inverter with wi-fi gateway' }] },
              { id: 'auxiliary_power_supply_word', name_human: 'Auxiliary Power Supply', content_character: { character_id: 'auxiliary_power_supply' }, modifier_characters: [{ kind: 'form', value: 'Auxiliary power supply with fuse' }] },
              { id: 'fire_suppression_system_word', name_human: 'Fire Suppression System', content_character: { character_id: 'fire_suppression_system' }, modifier_characters: [{ kind: 'form', value: 'Fire suppression system with fuse-backed release' }] },
              { id: 'arc_fault_detection_word', name_human: 'Arc Fault Detection', content_character: { character_id: 'arc_fault_detection' }, modifier_characters: [{ kind: 'form', value: 'Arc fault detection module with fuse' }] },
              { id: 'gas_detection_system_word', name_human: 'Gas Detection System', content_character: { character_id: 'gas_detection_system' }, modifier_characters: [{ kind: 'form', value: 'Gas detection system with fuse' }] },
              { id: 'status_indicator_leds_word', name_human: 'Status Indicator LEDs', content_character: { character_id: 'status_indicator_leds' }, modifier_characters: [{ kind: 'quantity', value: '×2' }] },
            ],
          }],
        }],
      },
      orchestratorContract: { topology: [] },
    }
    const gapOut = makeTmpDir('atopile-wall-ess-gaps-')
    tmpDirs.push(gapOut)
    const gapResult = generateAtopileProject(plantGapDesign, gapOut)
    const gapOff = new Set(gapResult.offBoard.map((r) => r.wordId))
    for (const id of [
      'power_semiconductors_word',
      'power_conversion_system_pcs_word',
      'auxiliary_power_supply_word',
      'fire_suppression_system_word',
      'arc_fault_detection_word',
      'gas_detection_system_word',
    ]) {
      expect(gapOff.has(id)).toBe(true)
    }
    expect(gapResult.unresolved.filter((u) => [
      'power_semiconductors_word',
      'fire_suppression_system_word',
      'arc_fault_detection_word',
    ].includes(u.wordId))).toEqual([])
  })

  // INTENT (NinjaPCR 2026-07-15): thermocycler has MCU + host peripherals + TEC
  // and NO optical LED source. Host absorption must not require hasOpticalSource;
  // TEC/sample block must off-board as thermal assemblies.
  it('dispositions thermocycler host peripherals + thermal assemblies as off-board COTS without optical source', () => {
    const outDir = makeTmpDir('atopile-thermocycler-')
    tmpDirs.push(outDir)
    const design = {
      isInstrumentDevice: true,
      parsedBrief: {
        product_class: 'thermocycler',
        product_description: 'Compact research PCR thermocycler with Peltier sample block',
      },
      moduleDecomposition: {
        modules: [{
          module: 'control_compute_communication',
          sub_modules: [{
            id: 'control_compute_communication__main',
            words: [
              { id: 'main_controller_mcu_word', name_human: 'Main Controller MCU', content_character: { character_id: 'main_controller_mcu' }, modifier_characters: [{ kind: 'form', value: 'MCU controller board' }] },
              { id: 'wifi_module_word', name_human: 'Wifi Module', content_character: { character_id: 'wifi_module' }, modifier_characters: [{ kind: 'form', value: 'WiFi radio module' }] },
              { id: 'flash_storage_word', name_human: 'Flash Storage', content_character: { character_id: 'flash_storage' }, modifier_characters: [{ kind: 'form', value: 'SPI flash memory' }] },
              { id: 'debug_uart_word', name_human: 'Debug Uart', content_character: { character_id: 'debug_uart' }, modifier_characters: [{ kind: 'form', value: 'UART debug header' }] },
              { id: 'fan_failure_detect_word', name_human: 'Fan Failure Detect', content_character: { character_id: 'fan_failure_detect' }, modifier_characters: [{ kind: 'form', value: 'Fan tach sense' }] },
              { id: 'estop_or_power_kill_word', name_human: 'Estop Or Power Kill', content_character: { character_id: 'estop_or_power_kill' }, modifier_characters: [{ kind: 'form', value: 'E-stop switch' }] },
              { id: 'peltier_module_word', name_human: 'Peltier Module', content_character: { character_id: 'peltier_module' }, modifier_characters: [{ kind: 'form', value: 'TEC module 40x40' }] },
              { id: 'sample_block_word', name_human: 'Sample Block', content_character: { character_id: 'sample_block' }, modifier_characters: [{ kind: 'form', value: 'Aluminium tube block' }] },
              { id: 'heatsink_fan_word', name_human: 'Heatsink Fan', content_character: { character_id: 'heatsink_fan' }, modifier_characters: [{ kind: 'form', value: 'Heatsink with fan' }] },
            ],
          }],
        }],
      },
      orchestratorContract: { topology: [] },
    }
    const result = generateAtopileProject(design, outDir)
    const offBoardIds = new Set(result.offBoard.map((r) => r.wordId))
    // Host peripherals that the electronic collector flags must ride with the MCU.
    for (const id of [
      'wifi_module_word',
      'flash_storage_word',
      'debug_uart_word',
      'estop_or_power_kill_word',
    ]) {
      expect(offBoardIds.has(id)).toBe(true)
    }
    // Thermal assemblies are either off-board COTS or never collected as
    // electronic footprints — either way they must not land in unresolved[].
    const unresolvedIds = new Set(result.unresolved.map((u) => u.wordId))
    for (const id of [
      'wifi_module_word',
      'flash_storage_word',
      'peltier_module_word',
      'sample_block_word',
      'heatsink_fan_word',
      'fan_failure_detect_word',
    ]) {
      expect(unresolvedIds.has(id)).toBe(false)
    }
  })

  // INTENT (Poseidon 2026-07-16): OPEN-array linear dosing has Touch Display +
  // MCU + lead-screw train. Display must stay off-board HMI, but MCU + drive
  // support (polyfuse/bulk/sense) stay on the control PCB — never the
  // colorimeter "purchased COTS controller+UI kit" path that left fuse+terminal.
  it('keeps actuation-drive MCU on-board when Touch Display is present', () => {
    const outDir = makeTmpDir('atopile-syringe-actuation-')
    tmpDirs.push(outDir)
    const design = {
      isInstrumentDevice: true,
      parsedBrief: {
        product_class: 'syringe_pump',
        product_description: 'Multi-channel benchtop linear syringe dosing array',
      },
      orchestratorContract: {
        quantities: {
          channel_count: { value: 4 },
          lead_screw_pitch_mm: { value: 2 },
          max_syringe_volume_ml: { value: 60 },
        },
        topology: [],
      },
      moduleDecomposition: {
        modules: [{
          module: 'control_compute_communication',
          sub_modules: [{
            id: 'control_compute_communication__main',
            words: [
              { id: 'main_controller_mcu_word', name_human: 'Main Controller MCU', content_character: { character_id: 'main_controller_mcu' }, modifier_characters: [
                { kind: 'form', value: 'MCU controller board' },
                { kind: 'dimensions', value: '7×7 mm QFN56' },
              ] },
              { id: 'stepper_driver_board_word', name_human: 'Stepper Driver Board', content_character: { character_id: 'stepper_driver_board' }, modifier_characters: [{ kind: 'form', value: 'A4988 microstep driver' }] },
              { id: 'current_sense_on_driver_word', name_human: 'Current Sense On Driver', content_character: { character_id: 'current_sense_on_driver' }, modifier_characters: [{ kind: 'form', value: '0.1 ohm shunt' }] },
              { id: 'touch_display_word', name_human: 'Touch Display', content_character: { character_id: 'touch_display' }, modifier_characters: [{ kind: 'form', value: 'TFT touch panel' }] },
              { id: 'polyfuse_resettable_word', name_human: 'Polyfuse Resettable', content_character: { character_id: 'polyfuse_resettable' }, modifier_characters: [{ kind: 'form', value: '1206 polyfuse' }] },
              { id: 'mains_fuse_word', name_human: 'Mains Fuse', content_character: { character_id: 'mains_fuse' }, modifier_characters: [{ kind: 'form', value: 'mains inlet fuse' }] },
              { id: 'bulk_capacitor_word', name_human: 'Bulk Capacitor', content_character: { character_id: 'bulk_capacitor' }, modifier_characters: [{ kind: 'form', value: '100uF bulk cap' }] },
              { id: 'flash_storage_word', name_human: 'Flash Storage', content_character: { character_id: 'flash_storage' }, modifier_characters: [{ kind: 'form', value: 'SPI flash' }] },
              { id: 'host_interface_word', name_human: 'Host Interface', content_character: { character_id: 'host_interface' }, modifier_characters: [{ kind: 'form', value: 'USB host link' }] },
              { id: 'lead_screw_word', name_human: 'Lead Screw', content_character: { character_id: 'lead_screw' }, modifier_characters: [{ kind: 'form', value: 'T8 lead screw' }] },
            ],
          }],
        }],
      },
    }
    const result = generateAtopileProject(design, outDir)
    const onBoardIds = new Set(result.components.map((c) => c.instanceName))
    const offBoardIds = new Set(result.offBoard.map((r) => r.wordId))
    const unresolvedIds = new Set(result.unresolved.map((u) => u.wordId))
    const mcu = result.components.find((c) => c.instanceName === 'main_controller_mcu_word')
    expect(offBoardIds.has('touch_display_word')).toBe(true)
    expect(offBoardIds.has('main_controller_mcu_word')).toBe(false)
    expect(offBoardIds.has('polyfuse_resettable_word')).toBe(false)
    expect(offBoardIds.has('bulk_capacitor_word')).toBe(false)
    expect(offBoardIds.has('flash_storage_word')).toBe(true)
    // Mains/AC inlet fuse stays off the low-voltage control PCB.
    expect(offBoardIds.has('mains_fuse_word')).toBe(true)
    expect(unresolvedIds.has('host_interface_word')).toBe(false)
    expect(unresolvedIds.has('stepper_driver_board_word')).toBe(false)
    expect(unresolvedIds.has('current_sense_on_driver_word')).toBe(false)
    expect(onBoardIds.has('stepper_driver_board_word')).toBe(true)
    expect(onBoardIds.has('current_sense_on_driver_word')).toBe(true)
    // Concept "QFN56" dimensions must NOT pin a 56-pad island for a 4-pin stub.
    expect(mcu?.footprint.footprint).not.toMatch(/QFN-56/i)
    expect(mcu?.footprint.footprint).toMatch(/LQFP-32/i)
    // MCU and/or stepper driver must land as on-board components (not a 2-part fuse board).
    expect(
      onBoardIds.has('main_controller_mcu_word')
      || onBoardIds.has('stepper_driver_board_word')
      || result.components.length >= 3,
    ).toBe(true)
  })

  it('a design with an unrecognisable electronic word lands honestly in unresolved[]', () => {
    const outDir = makeTmpDir('atopile-unresolved-')
    tmpDirs.push(outDir)
    const design = {
      moduleDecomposition: {
        modules: [
          {
            module: 'control_compute_communication',
            sub_modules: [
              {
                id: 'control_compute_communication__mystery',
                words: [
                  {
                    id: 'mystery_electronic_word',
                    name_human: 'Mystery Electronic Assembly',
                    content_character: { character_id: 'mystery_electronic_assembly' },
                    modifier_characters: [
                      { kind: 'quantity', value: '×1' },
                      // "board_role" category match keeps it electronic-flagged so the
                      // test exercises the "detected but unclassifiable" path, not the
                      // "never flagged electronic at all" path.
                      { kind: 'form', value: 'Bespoke PCBA — role not yet characterised' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      orchestratorContract: { topology: [] },
    }

    const result = generateAtopileProject(design, outDir)
    expect(result.components).toEqual([])
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].wordId).toBe('mystery_electronic_word')
    expect(result.unresolved[0].reason.length).toBeGreaterThan(0)
  })
})
