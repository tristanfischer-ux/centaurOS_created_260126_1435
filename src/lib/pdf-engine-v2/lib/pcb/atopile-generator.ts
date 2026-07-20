/**
 * @file Universal atopile project generator — Phase B (2026-07-12).
 * @description `generateAtopileProject(state, outDir)` maps the engine's electronic
 * design (moduleDecomposition words + orchestratorContract.topology nets) into a
 * valid atopile project (`main.ato` + `ato.yaml`) that `ato build` can compile into
 * a KiCad netlist + BoM. Verified live against atopile 0.2.69 (see the header notes
 * below — every syntax choice here was confirmed against a real `ato build` run,
 * not guessed from documentation).
 *
 * ⭐ THE OVERRIDING CONSTRAINT (Tristan, mandatory) — UNIVERSAL, NO PER-CLASS /
 * PER-PRODUCT TABLES. This file must work for ANY electronic design the engine
 * produces (a colorimeter, an insulin pump, a drone flight controller, a BMS
 * board) by reading each part's OWN generic attributes. There is no
 * colorimeter-specific mapping anywhere below — every table here is keyed on
 * UNIVERSAL vocabulary the engine already uses across all 35 product classes
 * (function-class role names like `voltage_sensor`/`main_controller`/
 * `storage_cell`, and package-family tokens like `SOT-23`/`0603`/`QFP-32`).
 *
 * RESOLUTION TIERS (all universal, checked in priority order):
 *   (0) off_board_cots — compact instrument UI/controller and detector-module shapes
 *                        are purchased modules connected by headers/FFC, not board
 *                        footprints. This is a shape rule, not a gold-MPN table.
 *   (a) mpn_symbol_footprint — DB-verified manufacturer/MPN + role/rating-compatible
 *                        curated candidate + exact local KiCad symbol/full pinout +
 *                        exact footprint with pin/pad parity. This is the only tier
 *                        that counts as a resolved fabrication identity.
 *   (a.5) mpn_package_only — DB-verified manufacturer/MPN whose local symbol/pinout
 *                        mapping is still absent; retained as an explicit draft.
 *   (b) package_family — the word's own `form`/`dimensions` modifier text is
 *                        regex-matched against a PACKAGE_TEXT_RULES table (SMD
 *                        passive sizes, SOT-23-N, SOIC-N, QFN-N, QFP-N, USB-C
 *                        receptacle, 2.54mm header, screw terminal) and resolved
 *                        against the REAL local KiCad footprint library (15,435
 *                        footprints) by directory glob — never a hardcoded exact
 *                        filename guess, always `existsSync`-verified.
 *   (c) function_class — no MPN, no package text: the word's `character_id` role
 *                        (a GENERIC function name, not a product name — the same
 *                        role vocabulary the engine's own emitter uses across every
 *                        archetype) maps to a sensible default footprint.
 *   unresolved[]        — a part matching none of the above is NEVER silently
 *                        dropped or faked; it is listed honestly.
 *
 * ATOPILE 0.2.69 SYNTAX NOTES (verified live 2026-07-12 via real `ato build` runs —
 * see `docs/plans/pcb-capability-integration.md` Phase B study notes):
 *   - `component X:` blocks still emit generic Atopile schematic syntax, but the
 *     fabrication-verified tier derives those declarations from a real local
 *     KiCad symbol and exact inherited pin numbers. Synthetic function pins remain
 *     draft-only evidence and never count as resolved identity.
 *   - `footprint = "<Library>:<FootprintName>"` (the classic KiCad
 *     `LibraryNickname:FootprintName` reference) resolves DIRECTLY against a real
 *     installed KiCad global footprint library — CONFIRMED: `ato build` embeds this
 *     string verbatim into the netlist's `(footprint …)` field with ZERO network
 *     calls, because `components.py::_get_generic_from_db` only fires when a
 *     component has NO explicit `footprint`. This is the load-bearing reason every
 *     component this file emits carries an explicit, existsSync-verified footprint:
 *     it keeps `ato build` fully offline and deterministic (no dependency on
 *     atopile's remote parts DB, which the un-ported prior art's bare `Resistor`/
 *     `Capacitor` types silently hit over the network).
 *   - `module App:` instantiates components with `new` and wires pins with `~`.
 *     `~` MERGES two signals into one net — connecting two different power rails
 *     with `~` would short them, so VCC/GND/topology nets are each a single
 *     `signal` declared once at the module level and every pin ties into it.
 *   - `designator_prefix` + atopile's own build-time counter assigns real KiCad
 *     reference designators (U1, R1, C1, …); this generator does not predict them.
 *
 * Run: npx tsx src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts <state.json> <outDir>
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { collectElectronicWords, type ElectronicWordRef } from './pcb-stage'
import { lookupCached } from '../distributors/db-only-cascade'
import {
  resolveVerifiedComponentIdentity,
} from './pcb-verified-candidates'
import { isDeniedPcbMpn } from './pcb-manufacturer-pinouts'
import {
  createBoardGeometryFromShapeContract,
  createRoundedRectangleContour,
  validateBoardGeometry,
} from './pcb-outline'
import type { PcbBoardGeometry } from './pcb-contract'
import type { PcbBoardShapeContract } from './pcb-architecture'
import type { PcbPinSpec } from './pcb-component-resolution'
import type { VerifiedCandidateRequest } from './pcb-verified-candidates'

// ── Real local KiCad footprint library root (the "15,435-footprint library" the
// task's universal resolution target) — same install `discover-capability.ts` probes. ──

const KICAD_ROOT = '/Applications/KiCad/KiCad.app/Contents'
const DEFAULT_SYMBOLS_ROOT = join(KICAD_ROOT, 'SharedSupport/symbols')
const DEFAULT_FOOTPRINTS_ROOT = join(KICAD_ROOT, 'SharedSupport/footprints')

// ── Function classes — GENERIC electronic roles, never a product name ──────────

export type FunctionClass =
  | 'microcontroller'
  | 'sensor_ic'
  | 'op_amp'
  | 'connectivity_ic'
  | 'io_connector'
  | 'regulator'
  | 'gate_driver_ic'
  | 'power_module'
  | 'passive_c'
  | 'passive_r'
  | 'passive_l'
  | 'fuse_protection'
  | 'diode_protection'
  | 'memory_ic'
  | 'usb_connector'
  | 'debug_connector'
  | 'battery_connector'
  | 'display_module'
  | 'led'
  | 'switch'
  | 'connector'

/**
 * Ordered role-vocabulary rules, keyed on `content_character.character_id` — the
 * SAME generic role names the engine's deterministic emitter already uses across
 * every product class (a `main_controller` in a colorimeter is the same role word
 * as a `main_controller` in a drone or a BMS). First match wins.
 */
const FUNCTION_CLASS_RULES: ReadonlyArray<{ id: FunctionClass; test: RegExp }> = [
  { id: 'sensor_ic', test: /photodiode|phototransistor|detector|analog[_-]?to[_-]?digital|(^|[_-])adc($|[_-])|imu\b|accelerometer|gyroscope|sensor|probe|monitor[_-]?ic|cell[_-]?monitor|fan[_-]?failure|fan[_-]?tach|tachometer/i },
  // INTENT (Rodeostat 0201): dac_output_stage is a real SOIC DAC IC — without
  // this it landed in unresolved[] ELECTRONIC gap and capped PCB at DRAFT/5.
  { id: 'op_amp', test: /signal[_-]?conditioner|amplifier|(^|[_-])tia($|[_-])|op[_-]?amp|dac[_-]?output|(^|[_-])dac($|[_-])|digital[_-]?to[_-]?analog/i },
  { id: 'microcontroller', test: /main[_-]?controller|(^|[_-])mcu($|[_-])|microcontroller|processor|(^|[_-])cpu($|[_-])|control[_-]?unit/i },
  { id: 'connectivity_ic', test: /communication_gateway|network_switch|transceiver|\bmodem\b|wireless|wi[_-]?fi|host[_-]?protocol[_-]?bridge|protocol[_-]?bridge|level[_-]?shifter/i },
  { id: 'io_connector', test: /io_module|\bi_?o_?module\b/i },
  // INTENT (Poseidon 2026-07-16): stepper/microstep/H-bridge driver boards are
  // gate-drive ICs (SOIC-8 class default) — without this, `stepper_driver_board`
  // landed in unresolved[] and floored the PCB readiness gate.
  { id: 'gate_driver_ic', test: /gate[_-]?driver|led[_-]?driver|inverter[_-]?bridge|driver[_-]?ic|stepper[_-]?driver|microstep[_-]?driver|h[_-]?bridge|motor[_-]?driver|(?:heater|stir|pump)[_-]?.*driver/i },
  { id: 'regulator', test: /controller[_-]?power[_-]?supply|power[_-]?converter|regulator|(^|[_-])ldo($|[_-])|dc[_-]?dc/i },
  { id: 'fuse_protection', test: /fuse|poly[_-]?fuse|overcurrent[_-]?protection|thermal[_-]?cut(?:off)?|ptc|resettable/i },
  { id: 'diode_protection', test: /reverse[_-]?polarity|esd[_-]?protection|tvs|surge[_-]?protection|transient/i },
  // INTENT (2026-07-20): flash_storage is the engine's common character_id —
  // flash_memory alone left NinjaPCR thermal_controller unresolved after
  // role-only collection started seeing the word.
  { id: 'memory_ic', test: /firmware[_-]?storage|flash[_-]?(?:storage|memory)|eeprom|nonvolatile[_-]?memory/i },
  // P4: USB power/receptacle roles must not share PinHeader defaults with SWD/UART.
  { id: 'usb_connector', test: /usb[_-]?(?:interface|power|connector|receptacle|port|entry)|type[_-]?c/i },
  { id: 'debug_connector', test: /debug[_-]?(?:interface|header|uart)|swd[_-]?header|uart[_-]?header|jtag[_-]?header/i },
  { id: 'passive_c', test: /capacitor|decoupling/i },
  // current_sense_on_driver / sense_shunt → SMD resistor (shunt), not unresolved.
  // GOTCHA: do not bare-match `current_sense` alone — that can be an amplifier IC.
  // INTENT (Pioreactor heater_20ml): cartridge/resistive heater loads are SMD
  // resistor packages on the actuation daughterboard — not gate-driver ICs.
  { id: 'passive_r', test: /resistor|current[_-]?sense(?:[_-]?on[_-]?driver|_shunt)|sense[_-]?shunt|shunt[_-]?resistor|cartridge[_-]?heater|resistive[_-]?heater|heater[_-]?element/i },
  { id: 'passive_l', test: /ferrite|inductor|choke/i },
  { id: 'battery_connector', test: /storage_cell|cell_module_assembly|battery/i },
  { id: 'display_module', test: /display[_-]?panel|\block?d\b|\boled\b|\btft\b|screen/i },
  { id: 'led', test: /status[_-]?indicator|annunciator|led[_-]?source|^led\b|[_-]led\b/i },
  { id: 'switch', test: /control[_-]?switch|power[_-]?switch|pushbutton|estop|e[_-]?stop|power[_-]?kill|(^|[_-])switch($|[_-])/i },
  { id: 'connector', test: /interface_membrane|connector|receptacle|header|terminal/i },
]

/**
 * @description Maps a generic electronic role (`character_id`) to a function class.
 * @param characterId Engine word role vocabulary (never a product name)
 * @returns Matching function class, or null when no rule matches
 */
export function classifyFunction(characterId: string): FunctionClass | null {
  for (const rule of FUNCTION_CLASS_RULES) {
    if (rule.test.test(characterId)) return rule.id
  }
  return null
}

// ── Footprint library glob resolution (universal — never a per-product filename) ──

export interface ResolvedFootprintRef {
  library: string
  footprint: string
}

/** Cache of directory listings so repeated resolutions don't re-stat the filesystem. */
const footprintDirCache = new Map<string, string[]>()

function listFootprintDir(root: string, library: string): string[] {
  const key = `${root}::${library}`
  const cached = footprintDirCache.get(key)
  if (cached) return cached
  const dir = join(root, `${library}.pretty`)
  let entries: string[] = []
  if (existsSync(dir)) {
    try {
      entries = readdirSync(dir).filter((f) => f.endsWith('.kicad_mod')).sort()
    } catch {
      entries = []
    }
  }
  footprintDirCache.set(key, entries)
  return entries
}

/**
 * @description Resolves a footprint by PACKAGE-FAMILY GLOB against the real local
 * KiCad footprint library — never a hardcoded exact filename; the candidate
 * filename is regex-matched against the library's actual directory listing and
 * `existsSync`-verified before being returned.
 */
function resolveFootprintByGlob(
  root: string,
  library: string,
  filenameTest: RegExp,
): ResolvedFootprintRef | null {
  const entries = listFootprintDir(root, library)
  const match = entries.find((f) => filenameTest.test(f))
  if (!match) return null
  return { library, footprint: match.replace(/\.kicad_mod$/, '') }
}

// ── Tier (c): function-class defaults — a small ROLE→package-family map, never a
// per-product part list. Every entry is glob-resolved + existsSync-verified at
// generation time, not baked as a literal string (a library reorganisation or a
// missing footprint degrades to `unresolved`, never a silent fake). ──────────────

interface FunctionClassDefault {
  library: string
  filenameTest: RegExp
  designatorPrefix: string
  pins: string[]
  /** Pin name (case-insensitive) that carries the positive supply rail, if any. */
  powerPin: string | null
  /** Pin name (case-insensitive) that carries ground, if any. */
  groundPin: string | null
  decouple: boolean
  /** Resolution confidence for the default footprint family, never an MPN claim. */
  resolutionTier: 'package_family' | 'function_class'
}

const FUNCTION_CLASS_DEFAULTS: Record<FunctionClass, FunctionClassDefault> = {
  microcontroller: {
    library: 'Package_QFP',
    filenameTest: /^LQFP-32_7x7mm_P0\.8mm\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VDD', 'GND', 'GPIO1', 'GPIO2'],
    powerPin: 'VDD',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  sensor_ic: {
    library: 'Package_SO',
    filenameTest: /^SOIC-8_3\.9x4\.9mm_P1\.27mm\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VCC', 'GND', 'OUT', 'NC'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  op_amp: {
    library: 'Package_SO',
    filenameTest: /^SOIC-8_3\.9x4\.9mm_P1\.27mm\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VCC', 'GND', 'IN_POS', 'IN_NEG', 'OUT'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  connectivity_ic: {
    library: 'Package_DFN_QFN',
    filenameTest: /^QFN-24-1EP_4x4mm_P0\.5mm_EP2\.6x2\.6mm\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VCC', 'GND', 'TX', 'RX'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  io_connector: {
    library: 'Connector_PinHeader_2.54mm',
    filenameTest: /^PinHeader_1x04_P2\.54mm_Vertical\.kicad_mod$/,
    designatorPrefix: 'J',
    pins: ['P1', 'P2', 'P3', 'P4'],
    powerPin: null,
    groundPin: null,
    decouple: false,
    resolutionTier: 'package_family',
  },
  regulator: {
    library: 'Package_TO_SOT_SMD',
    filenameTest: /^SOT-23-5\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VIN', 'GND', 'VOUT', 'EN', 'NC'],
    powerPin: 'VIN',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  gate_driver_ic: {
    library: 'Package_SO',
    filenameTest: /^SOIC-8_3\.9x4\.9mm_P1\.27mm\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VCC', 'GND', 'IN', 'OUT'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  power_module: {
    library: 'Connector_PinHeader_2.54mm',
    filenameTest: /^PinHeader_1x04_P2\.54mm_Vertical\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VIN', 'GND', 'VOUT', 'NC'],
    powerPin: 'VIN',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
  passive_c: {
    library: 'Capacitor_SMD',
    filenameTest: /^C_0603_1608Metric\.kicad_mod$/,
    designatorPrefix: 'C',
    pins: ['P1', 'P2'],
    powerPin: null,
    groundPin: null,
    decouple: false,
    resolutionTier: 'package_family',
  },
  passive_r: {
    library: 'Resistor_SMD',
    filenameTest: /^R_0603_1608Metric\.kicad_mod$/,
    designatorPrefix: 'R',
    pins: ['P1', 'P2'],
    powerPin: null,
    groundPin: null,
    decouple: false,
    resolutionTier: 'package_family',
  },
  passive_l: {
    library: 'Inductor_SMD',
    filenameTest: /^L_0603_1608Metric\.kicad_mod$/,
    designatorPrefix: 'L',
    pins: ['P1', 'P2'],
    powerPin: null,
    groundPin: null,
    decouple: false,
    resolutionTier: 'package_family',
  },
  fuse_protection: {
    library: 'Fuse',
    filenameTest: /^Fuse_1206_3216Metric\.kicad_mod$/,
    designatorPrefix: 'F',
    pins: ['P1', 'P2'],
    powerPin: null,
    groundPin: null,
    decouple: false,
    resolutionTier: 'package_family',
  },
  diode_protection: {
    library: 'Diode_SMD',
    filenameTest: /^D_SOD-323\.kicad_mod$/,
    designatorPrefix: 'D',
    pins: ['A', 'K'],
    powerPin: 'A',
    groundPin: 'K',
    decouple: false,
    resolutionTier: 'package_family',
  },
  memory_ic: {
    library: 'Package_SO',
    filenameTest: /^SOIC-8_3\.9x4\.9mm_P1\.27mm\.kicad_mod$/,
    designatorPrefix: 'U',
    pins: ['VCC', 'GND', 'SCL', 'SDA'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  usb_connector: {
    library: 'Connector_USB',
    // Prefer real receptacle; glob miss → unresolved (honest), never PinHeader.
    filenameTest: /^USB_C_Receptacle_.*\.kicad_mod$/i,
    designatorPrefix: 'J',
    pins: ['VBUS', 'GND', 'D+', 'D-', 'CC1', 'CC2'],
    powerPin: 'VBUS',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
  debug_connector: {
    library: 'Connector_PinHeader_2.54mm',
    filenameTest: /^PinHeader_1x04_P2\.54mm_Vertical\.kicad_mod$/,
    designatorPrefix: 'J',
    pins: ['SWDIO', 'SWCLK', 'GND', 'VCC'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
  battery_connector: {
    library: 'Connector_JST',
    filenameTest: /^JST_XH_B2B-XH-A_1x02_P2\.50mm_Vertical\.kicad_mod$/,
    designatorPrefix: 'J',
    pins: ['VBAT', 'GND'],
    powerPin: 'VBAT',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
  display_module: {
    library: 'Connector_PinHeader_2.54mm',
    filenameTest: /^PinHeader_1x04_P2\.54mm_Vertical\.kicad_mod$/,
    designatorPrefix: 'J',
    pins: ['VCC', 'GND', 'SDA', 'SCL'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: true,
    resolutionTier: 'package_family',
  },
  led: {
    library: 'LED_SMD',
    filenameTest: /^LED_0603_1608Metric\.kicad_mod$/,
    designatorPrefix: 'D',
    pins: ['ANODE', 'CATHODE'],
    powerPin: 'ANODE',
    groundPin: 'CATHODE',
    decouple: false,
    resolutionTier: 'package_family',
  },
  switch: {
    library: 'Button_Switch_SMD',
    filenameTest: /^SW_SPST_B3U-1000P\.kicad_mod$/,
    designatorPrefix: 'SW',
    pins: ['P1', 'P2'],
    powerPin: null,
    groundPin: 'P2',
    decouple: false,
    resolutionTier: 'package_family',
  },
  connector: {
    library: 'Connector_JST',
    filenameTest: /^JST_XH_B2B-XH-A_1x02_P2\.50mm_Vertical\.kicad_mod$/,
    designatorPrefix: 'J',
    pins: ['P1', 'P2'],
    powerPin: null,
    groundPin: null,
    decouple: false,
    resolutionTier: 'package_family',
  },
}

/** Nominal footprint area (mm²) per function class — used only for the board-outline
 * area heuristic (Phase C recomputes from the real chosen footprint bbox). */
const AREA_MM2_BY_CLASS: Partial<Record<FunctionClass, number>> = {
  microcontroller: 64, sensor_ic: 20, op_amp: 20, connectivity_ic: 25,
  io_connector: 60, regulator: 15, gate_driver_ic: 20, power_module: 80,
  passive_c: 1.3, passive_r: 1.3, passive_l: 1.3, fuse_protection: 4, diode_protection: 2,
  memory_ic: 20, usb_connector: 32, debug_connector: 20, battery_connector: 32, display_module: 600,
  led: 1.3, switch: 12, connector: 40,
}
const DEFAULT_AREA_MM2 = 25

// ── Tier (b): package/form text → footprint, by GENERIC package-family tokens ──

interface PackageTextResolution {
  ref: ResolvedFootprintRef
  rule: string
}

const IMPERIAL_TO_METRIC_MM: Record<string, string> = {
  '01005': '0402', '0201': '0603', '0402': '1005', '0603': '1608',
  '0805': '2012', '1206': '3216', '1210': '3225', '1812': '4532', '2220': '5750',
}

function resolveFootprintByPackageText(
  packageText: string,
  kindHint: FunctionClass | null,
  root: string,
): PackageTextResolution | null {
  const text = packageText.toLowerCase()

  const smdSize = text.match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2220)\b/)
  if (smdSize) {
    const size = smdSize[1]
    const metric = IMPERIAL_TO_METRIC_MM[size] ?? size
    // GOTCHA: fuse/polyfuse form text often says "1206 polyfuse" — must land in
    // Fuse:* not Resistor_SMD (Poseidon polyfuse was mis-resolved to R_1206).
    if (kindHint === 'fuse_protection' || /\b(?:fuse|polyfuse|ptc)\b/i.test(text)) {
      const fuseRef = resolveFootprintByGlob(
        root,
        'Fuse',
        new RegExp(`^Fuse_${size}_${metric}Metric\\.kicad_mod$`),
      )
      if (fuseRef) return { ref: fuseRef, rule: `smd_fuse_size_${size}` }
    }
    const prefix = kindHint === 'passive_c' ? 'C' : kindHint === 'led' ? 'LED' : 'R'
    const library = kindHint === 'passive_c' ? 'Capacitor_SMD' : kindHint === 'led' ? 'LED_SMD' : 'Resistor_SMD'
    const ref = resolveFootprintByGlob(root, library, new RegExp(`^${prefix}_${size}_${metric}Metric\\.kicad_mod$`))
    if (ref) return { ref, rule: `smd_passive_size_${size}` }
  }

  const sot = text.match(/\bsot-?23(?:-([3-8]))?\b/)
  if (sot) {
    const pins = sot[1]
    const test = pins ? new RegExp(`^SOT-23-${pins}\\.kicad_mod$`) : /^SOT-23\.kicad_mod$/
    const ref = resolveFootprintByGlob(root, 'Package_TO_SOT_SMD', test)
    if (ref) return { ref, rule: 'sot23_family' }
  }

  const soic = text.match(/\bsoic-?(8|14|16)\b/)
  if (soic) {
    const ref = resolveFootprintByGlob(root, 'Package_SO', new RegExp(`^SOIC-${soic[1]}_`))
    if (ref) return { ref, rule: `soic_${soic[1]}_family` }
  }

  const qfn = text.match(/\bqfn-?(\d+)\b/)
  if (qfn) {
    const ref = resolveFootprintByGlob(root, 'Package_DFN_QFN', new RegExp(`^QFN-${qfn[1]}-1EP_`))
    if (ref) return { ref, rule: `qfn_${qfn[1]}_family` }
  }

  const qfp = text.match(/\b(?:l|t)?qfp-?(\d+)\b/)
  if (qfp) {
    const ref = resolveFootprintByGlob(root, 'Package_QFP', new RegExp(`^LQFP-${qfp[1]}_`))
    if (ref) return { ref, rule: `qfp_${qfp[1]}_family` }
  }

  if (/usb-?c/.test(text)) {
    const ref = resolveFootprintByGlob(root, 'Connector_USB', /^USB_C_Receptacle_/)
    if (ref) return { ref, rule: 'usb_c_receptacle' }
  }

  if (/2\.54\s?mm|pin header/.test(text)) {
    const ref = resolveFootprintByGlob(root, 'Connector_PinHeader_2.54mm', /^PinHeader_1x\d+_P2\.54mm_Vertical\.kicad_mod$/)
    if (ref) return { ref, rule: 'header_2_54mm_family' }
  }

  if (/screw terminal|terminal block/.test(text)) {
    const ref = resolveFootprintByGlob(root, 'TerminalBlock_Phoenix', /1x02.*P5\.08mm/)
    if (ref) return { ref, rule: 'screw_terminal_family' }
  }

  return null
}

/**
 * @description Declared pin/pad count from a KiCad footprint name (QFN-56, LQFP-32…),
 * or null when the name carries no numeric package size.
 */
function footprintDeclaredPinCount(footprintName: string): number | null {
  const m = footprintName.match(/\b(?:QFN|LQFP|TQFP|SOIC|SSOP|TSSOP)-(\d+)\b/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @description Concept-stage form/dimensions often claim dense packages
 * ("7×7 mm QFN56") while the schematic only wires a 4-pin power/GPIO stub.
 * Freerouting then leaves unconnected nets on a 56-pad island (Poseidon 0602).
 * Prefer the function-class default when package pads ≫ schematic pins and there
 * is no verified MPN — universal, never a per-product package table.
 */
function packageOversizeForSchematic(footprintName: string, schematicPinCount: number): boolean {
  const pads = footprintDeclaredPinCount(footprintName)
  if (pads == null || schematicPinCount <= 0) return false
  return pads > Math.max(schematicPinCount * 2, schematicPinCount + 8)
}

// ── Tier (a): MPN-driven — DB-first lookup, never a live distributor call ──────

interface MpnResolution {
  verified: boolean
  packageText: string | null
}

/** CHAIN-AS-DB-CONSUMER PRINCIPLE: only `lookupCached()`, never a live adapter. */
function resolveViaMpn(manufacturer: string | null, partNumber: string): MpnResolution {
  const result = lookupCached(manufacturer, partNumber)
  if (!result.found || !result.result) return { verified: false, packageText: null }
  return { verified: true, packageText: result.result.description ?? null }
}

function isRealPartNumber(pn: string | undefined): pn is string {
  if (!pn) return false
  const norm = pn.trim().toLowerCase()
  if (!norm || norm.includes('tbd')) return false
  return norm.length >= 3
}

// ── Component + net records ─────────────────────────────────────────────────────

export type ResolutionTier =
  | 'mpn_symbol_footprint'
  | 'mpn_package_only'
  | 'mpn_package'
  | 'package_family'
  | 'function_class'
  | 'unresolved'

export interface AtopileComponentRecord {
  instanceName: string
  wordId: string
  moduleId: string
  subModuleId: string
  nameHuman: string
  characterId: string
  functionClass: FunctionClass | null
  manufacturer: string | null
  partNumber: string | null
  mpnVerified: boolean
  identityVerified: boolean
  symbolId: string | null
  pinSpecs: PcbPinSpec[]
  pinPadMap: Record<string, string>
  identityProvenance: string | null
  roleCompatibility: string | null
  packageCompatibility: string | null
  identityBlocker: string | null
  resolutionTier: ResolutionTier
  footprint: ResolvedFootprintRef | null
  designatorPrefix: string
  pins: string[]
  powerPin: string | null
  groundPin: string | null
  decouple: boolean
  quantityInDesign: number
}

export interface AtopileNetRecord {
  name: string
  kind: 'power' | 'ground' | 'signal'
  members: Array<{ instanceName: string; pin: string }>
}

export interface AtopileUnresolvedRecord {
  wordId: string
  nameHuman: string
  characterId: string
  reason: string
}

export interface AtopileOffBoardCotsRecord {
  wordId: string
  nameHuman: string
  characterId: string
  quantityInDesign: number
  disposition: 'off_board_cots_module'
  reason: string
}

export interface AtopileFunctionRequirementRecord {
  role: string
  implementation: 'unresolved_board_function' | 'passive_board_geometry'
  reason: string
}

export interface GenerateAtopileProjectResult {
  projectDir: string
  mainAtoPath: string
  atoYamlPath: string
  boardOutlinePath: string
  components: AtopileComponentRecord[]
  nets: AtopileNetRecord[]
  offBoard: AtopileOffBoardCotsRecord[]
  unresolved: AtopileUnresolvedRecord[]
  functionRequirements: AtopileFunctionRequirementRecord[]
  boardOutline: PcbBoardGeometry
}

export interface GenerateAtopileProjectOptions {
  footprintsRoot?: string
  symbolsRoot?: string
  requiredWordIds?: string[]
  requiredFunctionRoles?: string[]
  boardShape?: PcbBoardShapeContract
}

function sanitizeIdentifier(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1')
  return cleaned || 'part'
}

function sanitizePinName(pin: string | null): string | null {
  if (!pin) return null
  const cleaned = pin.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1')
  return cleaned || 'PIN'
}

function pinIdentifier(pin: PcbPinSpec): string {
  return `${sanitizePinName(pin.name) ?? 'PIN'}_${sanitizeIdentifier(pin.number)}`
}

function requiredRatings(word: ElectronicWordRef): VerifiedCandidateRequest['requiredRatings'] {
  const text = Object.values(word.modifiers).join(' ')
  const voltageValues = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:v|volt(?:s)?)\b/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite)
  const currentValues = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:a|amp(?:s|ere|eres)?)\b/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite)
  return {
    ...(voltageValues.length > 0 ? { voltageV: Math.max(...voltageValues) } : {}),
    ...(currentValues.length > 0 ? { currentA: Math.max(...currentValues) } : {}),
  }
}

function toTypeName(instanceName: string): string {
  return `Part_${instanceName}`
}

function wordText(word: ElectronicWordRef): string {
  return [
    word.wordId,
    word.nameHuman,
    word.characterId,
    ...Object.values(word.modifiers),
  ].join(' ')
}

function wordRoleText(word: ElectronicWordRef): string {
  return [word.wordId, word.nameHuman, word.characterId].join(' ')
}

const INSTRUMENT_DEVICE_TEXT_RE =
  /\b(optical[_ -]?instrument|photometer|colou?rimeter|spectrophotometer|absorbance|portable|handheld|hand-held|benchtop|bench-top)\b/i

const COTS_UI_WORD_RE =
  /\b(local[_ -]?display|display(?:[_ -]?(?:module|panel|screen))?|oled|lcd|tft|readout|user[_ -]?input|buttons?|keypad|membrane[_ -]?(?:switch|keypad)|front[_ -]?panel|hmi|compute[_ -]?ui[_ -]?module)\b/i

const COTS_DETECTOR_MODULE_RE =
  /\b(?:detector|spectral[_ -]?sensor|light[_ -]?sensor|colour[_ -]?sensor|color[_ -]?sensor|photodiode[_ -]?array).*\b(module|breakout|board|assembly)\b|\b(module|breakout|board|assembly).*(?:detector|spectral[_ -]?sensor|light[_ -]?sensor|colour[_ -]?sensor|color[_ -]?sensor|photodiode[_ -]?array)\b/i

// Gold WHY: one purchased compute/UI kit absorbs MCU+display+buttons+USB+battery.
// INTENT (OpenFlexure 0101): SBC / Pi compute + motor-controller board + webcam
// are purchased host modules for OPEN lab microscopes — same off-board path as
// PyBadge-class compute/UI kits. Noun-keyed (never product==openflexure).
const COTS_COMPUTE_UI_MODULE_RE =
  /\bcompute[_ -]?ui[_ -]?module\b|\b(?:controller|mcu).{0,24}(?:ui|display|badge).{0,16}module\b|\b(?:sbc|compute[_ -]?module|raspberry[_ -]?pi|single[_ -]?board[_ -]?computer|motor[_ -]?controller[_ -]?board|sangaboard|host[_ -]?protocol[_ -]?bridge|protocol[_ -]?bridge|usb[_ -]?uart)\b/i

const INSTRUMENT_OPTOMECH_WORD_RE =
  /\b(collimat\w*|lens|optic(?:al)?|optics?[_ -]?tube|tube[_ -]?assembly|objective(?:[_ -]?mount)?|\brms\b|webcam|pi[_ -]?camera|grade[_ -]?camera|camera[_ -]?module|flexure(?:[_ -]?stage)?|condenser|wavelength[_ -]?selection|filter[_ -]?(?:wheel|optic)|cuvette|sample[_ -]?(?:holder|cell|chamber)|bezel|mount(?:ing)?[_ -]?(?:bezel|plate|standoff)|pcb[_ -]?mounting[_ -]?standoff|standoff|detector[_ -]?mount|face[_ -]?plate|front[_ -]?panel)\b/i

const INSTRUMENT_INTERCONNECT_WORD_RE =
  /\b(?:sensor|detector|photodiode|signal|analog|adc|afe).{0,48}(?:interconnect|cable|lead|wire|harness|ffc|ribbon)\b|\b(?:interconnect|cable|lead|wire|harness|ffc|ribbon).{0,48}(?:sensor|detector|photodiode|signal|analog|adc|afe)\b|\b(?:wire[_ -]?harness|wiring[_ -]?harness|cable[_ -]?assembly|sensor[_ -]?cable)\b/i

// INTENT (2026-07-14): STEMMA/Qwiic/Grove headers mate to purchased COTS modules —
// they are not optical-source-board footprints (colorimeter-2130 put stemma_header on
// the LED PCBA and bloated hygiene).
const INSTRUMENT_COTS_BUS_HEADER_RE =
  /\b(stemma|qwiic|grove(?:[_ -]?connector)?|i2c[_ -]?header)\b/i

const CONTROLLER_WORD_RE =
  /\b(main[_ -]?controller|microcontroller|mcu|processor|control[_ -]?unit|compute[_ -]?ui[_ -]?module)\b/i

const INCLUDED_ON_COMPUTE_UI_RE =
  /\b(?:battery_included_in_compute_ui|usb_charge_path_on_compute_ui|power_switch_on_compute_ui|host_power_rail_on_compute_ui|usb_5v_input_on_compute_ui|input_protection_on_compute_ui|thermal_protection_on_compute_ui|reverse_polarity_on_compute_ui|charge_status_led|low_battery_indicator|board_level_decoupling)\b/i

// GOTCHA: do NOT match bare `status led` / `indicator` here — host charge-status and
// battery indicators must stay off the optical source board (see INCLUDED_ON_COMPUTE_UI
// + INSTRUMENT_HOST_SIDE). Keep optical LED source / driver / board-level protection.
const ON_BOARD_PCB_WORD_RE =
  /\b(led[_ -]?source|\bled\b|led[_ -]?driver|regulator|fuse|polyfuse|thermal[_ -]?cutoff|polarity|protection|power[_ -]?switch|usb[_ -]?power|analog[_ -]?to[_ -]?digital|\badc\b|stepper[_ -]?driver|microstep[_ -]?driver|h[_ -]?bridge)\b/i

// INTENT (Poseidon 2026-07-16): OPEN-array linear dosing — MCU + stepper
// drivers ARE the control PCB. A Touch Display must not license the colorimeter
// "purchased COTS controller+UI kit" path that strips the board to fuse+terminal.
const INSTRUMENT_ACTUATION_DRIVE_RE =
  /\b(?:stepper(?:[_ -]?(?:motor|driver|drive))?|microstep(?:[_ -]?driver)?|\bnema\b|lead[_ -]?screw|leadscrew|linear[_ -]?carriage)\b/i

// Drive-rail parts that stay on the actuation control PCB (not absorbed into a
// purchased UI kit) when INSTRUMENT_ACTUATION_DRIVE_RE is present.
const ACTUATION_ON_BOARD_SUPPORT_RE =
  /\b(?:polyfuse|bulk[_ -]?capacitor|status[_ -]?led|current[_ -]?sense(?:[_ -]?shunt|_on_driver)?|sense[_ -]?shunt|dc[_ -]?dc[_ -]?regulator)\b/i

const OPTICAL_SOURCE_BOARD_WORD_RE =
  /\b(?:led[_ -]?source|light[_ -]?source|optical[_ -]?source|source[_ -]?(?:pcb|board|module|connector)|illumination|emitter|led[_ -]?driver)\b/i

// Host-side power / USB / protection that belongs on the purchased controller/UI
// COTS assembly (PyBadge-class), NOT on the window-scale LED daughterboard.
// Gold Open Colorimeter: LED PCB = LED + R + JST only; battery/USB/rail live on the MCU.
// INTENT (2026-07-14): also keep generic rail regulators / host connectors off the
// optical source board — `dc_dc_regulator` used to survive via ON_BOARD_PCB_WORD_RE
// (`regulator`) and inflate the LED board into a 14-part / 80 mm motherboard.
// GOTCHA: do NOT include status_led / bare LED here — ON_BOARD_PCB_WORD_RE keeps
// LEDs on the optical source / actuation drive board (colorimeter proveCatch).
// INTENT (Pioreactor 0327): host_protocol_bridge is a purchased USB↔UART/FTDI
// dongle that rides with the MCU COTS kit — leaving it unresolved floored PCB
// to DRAFT (1 electronic gap) despite a clean DRC board.
const INSTRUMENT_HOST_SIDE_ON_COTS_CONTROLLER_RE =
  /\b(?:rechargeable[_ -]?battery|battery[_ -]?(?:pack|charge|management|indicator)|low[_ -]?battery|charge[_ -]?status|usb[_ -]?(?:interface|power|data)|host[_ -]?protocol[_ -]?bridge|protocol[_ -]?bridge|usb[_ -]?uart|\bftdi\b|firmware[_ -]?(?:storage|watchdog)|flash[_ -]?(?:storage|memory)|wifi|wi[_ -]?fi|wireless|bluetooth|\bble\b|debug[_ -]?uart|uart[_ -]?header|serial[_ -]?debug|fan[_ -]?(?:failure|tach|sense)|tachometer|overtemp|estop|e[_ -]?stop|power[_ -]?kill|protective[_ -]?earth|\bpe\b|power[_ -]?(?:switch|input|indicator|rail)|dc[_ -]?dc[_ -]?regulator|buck[_ -]?regulator|ldo|host[_ -]?(?:power|interface)|dc[_ -]?input[_ -]?fuse|input[_ -]?fuse|overcurrent|esd[_ -]?protection|thermal[_ -]?cutoff|polyfuse|reverse[_ -]?polarity|ferrite|status[_ -]?indicator|control[_ -]?switch|run[_ -]?start|start[_ -]?control|debug[_ -]?interface|\bswd\b|\bjtag\b|i2c[_ -]?level[_ -]?shifter|level[_ -]?shifter|current[_ -]?sense(?:[_ -]?shunt)?|sense[_ -]?shunt|bulk[_ -]?capacitor|thermal[_ -]?fuse)\b/i

// INTENT (NinjaPCR 2026-07-15): TEC / sample block / heatsink fan are purchased
// thermal assemblies — not PCB footprints. Same off-board pattern as plant
// purchased assemblies / optical optomech; noun-keyed, not class-tabled.
const INSTRUMENT_THERMAL_ASSEMBLY_RE =
  /\b(?:peltier|\btec\b|thermoelectric(?:[_ -]?cooler)?|heatsink(?:[_ -]?fan)?|heat[_ -]?sink|sample[_ -]?block|thermal[_ -]?block|tube[_ -]?block|lid[_ -]?heater|heated[_ -]?lid|cooling[_ -]?fan)\b/i

// Labels / silkscreen legends are not PCB footprints (2130 left user_facing_legend
// in unresolved[] and the Excel electronic-gap axis capped PCB at FAIL/DRAFT).
const INSTRUMENT_NON_FOOTPRINT_WORD_RE =
  /\b(?:user[_ -]?facing[_ -]?legend|front[_ -]?panel[_ -]?legend|silkscreen[_ -]?legend|nameplate|label[_ -]?plate|browser[_ -]?ui|host[_ -]?software|network[_ -]?api|api[_ -]?service|firmware[_ -]?image)\b/i

// INTENT (OpenFlexure 0101): purchased PSU / barrel inlet / stall-sense switches
// ride off the control PCB (daughterboard keeps MCU + photodiode only).
const INSTRUMENT_PURCHASED_POWER_SENSE_RE =
  /\b(?:usb[_ -]?or[_ -]?barrel|barrel[_ -]?power|power[_ -]?inlet|dc[_ -]?inlet|low[_ -]?voltage[_ -]?dc[_ -]?supply|bench[_ -]?psu|dc[_ -]?supply|stage[_ -]?limit|stall[_ -]?sense|limit[_ -]?switch)\b/i

// INTENT (2026-07-15): residential wall-ESS / plant BoMs name purchased field
// assemblies (battery racks, Apollo smoke heads, DIN ethernet switches, HMI
// panels). Those are NOT PCB footprints. Instrument-only COTS filters skipped
// them because isInstrumentDevice is false for plantish classes even at
// device-scale volume — powerwall-2214/0447 then pinned smoke detectors as
// SOIC-8 + battery racks as JST and died at placement (U1 vs C* overlap).
// UNIVERSAL: keyed off assembly nouns, not a class table.
const PLANT_PURCHASED_ASSEMBLY_RE =
  /\b(?:battery[_ -]?(?:module|rack|pack|string)s?|module[_ -]?rack|cell[_ -]?module(?:[_ -]?assembly)?|smoke[_ -]?detectors?|gas[_ -]?(?:sensors?|detection(?:[_ -]?system)?)|hydrogen[_ -]?(?:detection[_ -]?)?sensors?|fire[_ -]?(?:detectors?|suppression(?:[_ -]?system)?)|ethernet[_ -]?switch(?:es)?|din[_ -]?rail[_ -]?(?:switch|eth)|local[_ -]?hmi(?:[_ -]?(?:display|touchscreen|panel)s?)?|hmi[_ -]?(?:display|touchscreen|panel)s?|touchscreen[_ -]?(?:module|panel)s?|power[_ -]?semiconductors?|power[_ -]?conversion[_ -]?system|pcs(?:[_ -]?(?:inverter|unit))?|auxiliary[_ -]?power(?:[_ -]?(?:supply|distribution|transformer|pdu|unit))?|arc[_ -]?(?:fault|flash)(?:[_ -]?(?:detection|protection))?)\b/i

function stateText(state: Record<string, unknown>): string {
  const parsed = (state.parsedBrief as Record<string, unknown> | undefined) ?? {}
  return [
    state.isInstrumentDevice ? 'isInstrumentDevice' : '',
    parsed.product_class,
    parsed.product_description,
    parsed.original_text,
    parsed.application_context,
  ].filter((v): v is string => typeof v === 'string').join(' ')
}

function instrumentDeviceContext(
  state: Record<string, unknown>,
  words: ElectronicWordRef[],
): boolean {
  if (state.isInstrumentDevice === true) return true
  const combined = `${stateText(state)} ${words.map(wordText).join(' ')}`
  return INSTRUMENT_DEVICE_TEXT_RE.test(combined)
}

/**
 * @description True when the design is an OPEN-array / linear dosing form whose
 * control PCB must keep the MCU + stepper drivers on-board.
 * PURE — electronic words OR mechanical train nouns in moduleDecomposition OR
 * the archetype quantity triad (channel_count + lead_screw_pitch_mm).
 */
function hasActuationDriveBoard(
  state: Record<string, unknown>,
  words: ElectronicWordRef[],
): boolean {
  if (words.some((w) => INSTRUMENT_ACTUATION_DRIVE_RE.test(wordRoleText(w)))) {
    return true
  }
  const contract =
    (state.orchestratorContract as { quantities?: Record<string, { value?: unknown }> } | undefined)
    ?? (state.engineeringContract as { quantities?: Record<string, { value?: unknown }> } | undefined)
  const q = contract?.quantities ?? {}
  const channels = Number(q.channel_count?.value)
  const pitch = Number(q.lead_screw_pitch_mm?.value)
  if (
    Number.isFinite(channels) && channels >= 1
    && Number.isFinite(pitch) && pitch > 0
  ) {
    return true
  }
  // Mechanical train words (lead screw / carriage) are often non-electronic —
  // still the form signal for a drive PCB (Poseidon live BoM had no stepper_* word).
  const names: string[] = []
  const md = state.moduleDecomposition as {
    modules?: Array<{ sub_modules?: Array<{ words?: Array<{ name_human?: string; id?: string }> }> }>
  } | undefined
  for (const m of md?.modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        names.push(String(w.name_human || w.id || ''))
      }
    }
  }
  return INSTRUMENT_ACTUATION_DRIVE_RE.test(names.join(' '))
}

function offBoardCotsReason(
  word: ElectronicWordRef,
  words: ElectronicWordRef[],
  state: Record<string, unknown>,
): string | null {
  const text = wordText(word)
  const roleText = wordRoleText(word)
  const isInstrument = instrumentDeviceContext(state, words)
  const hasUiModule = words.some((candidate) => candidate.wordId !== word.wordId && COTS_UI_WORD_RE.test(wordRoleText(candidate)))
  const hasOpticalSource = words.some((candidate) => OPTICAL_SOURCE_BOARD_WORD_RE.test(wordRoleText(candidate)))
  const hasActuationDrive = hasActuationDriveBoard(state, words)
  const hasCotsControllerOrUi = hasUiModule || words.some((candidate) =>
    candidate.wordId !== word.wordId && CONTROLLER_WORD_RE.test(wordRoleText(candidate)))
  // DECISION (2026-07-14, gold delta G3/G15; extended 2026-07-15 thermocycler):
  // when a compact instrument already has a COTS controller/UI, host-side
  // battery/USB/wifi/uart/fan-tach/protection ride with that MCU — NOT as bare
  // footprints. Optical instruments also keep them off the LED daughterboard.
  // Must run BEFORE ON_BOARD_PCB_WORD_RE early-keep.
  // GOTCHA: do NOT require hasOpticalSource — thermocycler has MCU+TEC and no
  // LED source; requiring optics left wifi/uart/flash as unresolved ELECTRONIC.
  // GOTCHA (Poseidon): actuation-drive boards KEEP polyfuse/bulk/sense/LED on
  // the control PCB — absorbing them into a "purchased UI kit" left only
  // fuse+terminal and routed=false.
  if (
    isInstrument &&
    hasCotsControllerOrUi &&
    INSTRUMENT_HOST_SIDE_ON_COTS_CONTROLLER_RE.test(roleText) &&
    !OPTICAL_SOURCE_BOARD_WORD_RE.test(roleText) &&
    !(hasActuationDrive && ACTUATION_ON_BOARD_SUPPORT_RE.test(roleText))
  ) {
    return hasOpticalSource
      ? 'instrument host power/USB/protection — rides with the purchased controller/UI COTS module, not the optical source daughterboard'
      : 'instrument host peripheral — rides with the purchased controller/UI COTS module, not a bare on-board footprint'
  }
  if (isInstrument && INSTRUMENT_THERMAL_ASSEMBLY_RE.test(roleText)) {
    return 'purchased thermal assembly (TEC / sample block / heatsink fan / lid heater) — off-board module driven by the control PCB, not an on-board footprint'
  }
  // DECISION: off-board COTS / optomech / bus-header rules MUST run before the
  // ON_BOARD_PCB early-keep. Otherwise `charge_status_led` / `status indicator`
  // match `\bled\b` and never reach the host-side disposition (2130: 9-part board).
  //
  // DECISION (2026-07-15): plant purchased assemblies are class-agnostic — they
  // must fire even when isInstrumentDevice is false (wall ESS / BESS / plant).
  if (PLANT_PURCHASED_ASSEMBLY_RE.test(roleText) || PLANT_PURCHASED_ASSEMBLY_RE.test(text)) {
    return 'purchased plant/field assembly (battery rack, safety detector, DIN eth switch, HMI panel) — off-board COTS connected to the control PCB, not an on-board footprint'
  }
  if (isInstrument && (COTS_COMPUTE_UI_MODULE_RE.test(roleText) || INCLUDED_ON_COMPUTE_UI_RE.test(roleText))) {
    return 'purchased compute/UI COTS kit (MCU+display+buttons+USB+battery path) — off-board host assembly; optical source board stays separate'
  }
  if (isInstrument && COTS_UI_WORD_RE.test(roleText)) {
    return 'front-panel/UI module shape (display/keypad/buttons) — purchased off-board COTS assembly connected to the PCB by header/FFC, not an on-board footprint'
  }
  if (isInstrument && COTS_DETECTOR_MODULE_RE.test(text)) {
    return 'detector-module/breakout shape — purchased optical sensor module connected to the PCB, not a bare on-board IC footprint'
  }
  if (isInstrument && INSTRUMENT_OPTOMECH_WORD_RE.test(roleText)) {
    return 'optical/mechanical instrument part — mounted in the optical bench or front panel, not a PCB footprint'
  }
  if (isInstrument && INSTRUMENT_INTERCONNECT_WORD_RE.test(roleText)) {
    return 'instrument interconnect harness/FFC — cable assembly between modules, represented on the connection trace rather than as a PCB footprint'
  }
  if (isInstrument && INSTRUMENT_COTS_BUS_HEADER_RE.test(roleText)) {
    return 'COTS I²C bus header (STEMMA/Qwiic/Grove) — mates to a purchased module, not an optical-source-board footprint'
  }
  if (isInstrument && INSTRUMENT_NON_FOOTPRINT_WORD_RE.test(roleText)) {
    return 'front-panel legend / nameplate / host software — not a soldered PCB footprint'
  }
  if (isInstrument && INSTRUMENT_PURCHASED_POWER_SENSE_RE.test(roleText)) {
    return 'purchased PSU / inlet / limit-sense assembly — off-board module connected to the control PCB, not an on-board footprint'
  }
  // INTENT (2026-07-16): instrument control PCBs are low-voltage. A "mains fuse"
  // / IEC inlet fuse lives at the chassis inlet or external PSU — packing three
  // 1206 fuses (polyfuse + overcurrent + mains) onto a 35 mm board caused pad
  // overlap and freerouting leftovers (Poseidon 0602). Keep PCB polyfuses.
  if (
    isInstrument
    && /\b(?:mains|line|ac[_ -]?input)[_ -]?fuse\b|\bfuse[_ -]?holder\b/i.test(roleText)
  ) {
    return 'mains/AC inlet protection — lives at the IEC inlet or external PSU, not on the low-voltage control PCB'
  }
  // OPEN-array / linear dosing: MCU stays on the control PCB even when a
  // Touch Display exists — the display is the off-board HMI, not a license to
  // replace the whole controller with a purchased kit (Poseidon 2026-07-16).
  if (
    isInstrument &&
    hasUiModule &&
    CONTROLLER_WORD_RE.test(roleText) &&
    !hasActuationDrive
  ) {
    return 'compact instrument controller paired with UI/display module — prefer a purchased controller/UI module at concept stage, while LEDs/regulators remain on-board'
  }
  if (ON_BOARD_PCB_WORD_RE.test(roleText)) return null
  return null
}

/**
 * @description Resolves one candidate electronic word to a component record via
 * the three universal tiers, in priority order. Never fakes a footprint — a word
 * matching no tier lands in the caller's `unresolved[]` list.
 */
function resolveComponent(
  word: ElectronicWordRef,
  footprintsRoot: string,
  symbolsRoot: string,
): { component: AtopileComponentRecord } | { unresolved: AtopileUnresolvedRecord } {
  const functionClass = classifyFunction(word.characterId)
  const manufacturer = word.modifiers.manufacturer?.trim() || null
  const partNumberRaw = word.modifiers.part_number?.trim()
  const partNumber = isRealPartNumber(partNumberRaw) ? partNumberRaw! : null
  const packageText = [word.modifiers.form ?? '', word.modifiers.dimensions ?? ''].join(' ')

  const fallback = functionClass ? FUNCTION_CLASS_DEFAULTS[functionClass] : null
  const instanceName = sanitizeIdentifier(word.wordId)

  let footprint: ResolvedFootprintRef | null = null
  let tier: ResolutionTier = 'unresolved'
  let mpnVerified = false
  let identityVerified = false
  let symbolId: string | null = null
  let pinSpecs: PcbPinSpec[] = []
  let pinPadMap: Record<string, string> = {}
  let identityProvenance: string | null = null
  let roleCompatibility: string | null = null
  let packageCompatibility: string | null = null
  let identityBlocker: string | null = null
  let resolvedManufacturer = manufacturer
  let resolvedPartNumber = partNumber

  // Tier (a): MPN-driven — DENYLIST first (P3)
  // INTENT: lookupCached verifies catalogue identity, not "safe to place as this role".
  // TE 4-2489541-7 is a 110 V panel indicator that previously became mpn_package_only
  // on LED_0603 because curated pinout reject never ran on this path.
  if (partNumber) {
    const denyReason = isDeniedPcbMpn(partNumber)
    if (denyReason) {
      mpnVerified = false
      identityBlocker = denyReason
      resolvedPartNumber = null
      // Do NOT set footprint from the denylisted MPN's package text.
      // Fall through to curated identity (a.5) then package/function-class.
    } else {
      const mpnResult = resolveViaMpn(manufacturer, partNumber)
      mpnVerified = mpnResult.verified
      if (mpnResult.packageText) {
        const resolved = resolveFootprintByPackageText(mpnResult.packageText, functionClass, footprintsRoot)
        if (resolved) {
          footprint = resolved.ref
          tier = 'mpn_package'
        }
      }
    }
  }

  // Tier (a.5): curated generic candidate, promoted only when its DB identity,
  // role, ratings, full local symbol pinout and exact local footprint all agree.
  if (!mpnVerified) {
    const identity = resolveVerifiedComponentIdentity({
      wordId: word.wordId,
      nameHuman: word.nameHuman,
      characterId: word.characterId,
      functionClass,
      requiredRatings: requiredRatings(word),
    }, lookupCached, { symbolsRoot, footprintsRoot })
    if (!('status' in identity)) {
      footprint = identity.footprint
      tier = 'mpn_symbol_footprint'
      mpnVerified = true
      identityVerified = true
      symbolId = identity.symbolId
      pinSpecs = identity.pins
      pinPadMap = Object.fromEntries(identity.pins.map((pin) => [
        pinIdentifier(pin),
        pin.number,
      ]))
      identityProvenance = identity.provenance
      roleCompatibility = identity.roleCompatibility
      packageCompatibility = identity.packageCompatibility
      resolvedManufacturer = identity.manufacturer
      resolvedPartNumber = identity.partNumber
    } else {
      identityBlocker = identity.reason
    }
  } else {
    identityBlocker = `DB-verified MPN ${partNumber} has no curated local KiCad symbol/pinout mapping`
  }

  // Tier (b): the word's own package/form text
  if (!footprint && packageText.trim()) {
    const resolved = resolveFootprintByPackageText(packageText, functionClass, footprintsRoot)
    if (resolved) {
      const schematicPins = fallback?.pins.length ?? 0
      // GOTCHA: skip oversize package_text when no real MPN — fall through to (c).
      if (
        mpnVerified
        || !packageOversizeForSchematic(resolved.ref.footprint, schematicPins)
      ) {
        footprint = resolved.ref
        tier = 'package_family'
      }
    }
  }

  // Tier (c): function-class default
  if (!footprint && fallback) {
    const resolved = resolveFootprintByGlob(footprintsRoot, fallback.library, fallback.filenameTest)
    if (resolved) {
      footprint = resolved
      // DECISION: a resolved KiCad package family is stronger than a bare role
      // guess even when no MPN is known. It remains below mpn_package in scoring.
      tier = fallback.resolutionTier
    }
  }

  if (!footprint) {
    return {
      unresolved: {
        wordId: word.wordId,
        nameHuman: word.nameHuman,
        characterId: word.characterId,
        reason: functionClass
          ? `function class '${functionClass}' resolved but its default footprint is missing from the local KiCad library`
          : 'no MPN, no matching package-family text, and no recognised function-class role for this word',
      },
    }
  }

  // INTENT: Catalogue-verified string without symbol/pinout is mpn_package_only —
  // unless the MPN is denylisted for PCB placement (P3 belt-and-braces).
  if (partNumber && mpnVerified && !identityVerified && tier !== 'unresolved') {
    const denyReason = isDeniedPcbMpn(partNumber)
    if (denyReason) {
      mpnVerified = false
      identityBlocker = denyReason
      resolvedPartNumber = null
      // GOTCHA: tier is never already mpn_package_only here (that promote is the else).
      if (tier === 'mpn_package') {
        const fb = functionClass ? FUNCTION_CLASS_DEFAULTS[functionClass] : null
        if (fb) {
          const resolved = resolveFootprintByGlob(footprintsRoot, fb.library, fb.filenameTest)
          footprint = resolved
          tier = fb.resolutionTier
        } else {
          return {
            unresolved: {
              wordId: word.wordId,
              nameHuman: word.nameHuman,
              characterId: word.characterId,
              reason: denyReason,
            },
          }
        }
      }
    } else {
      tier = 'mpn_package_only'
    }
  }

  if (!footprint) {
    return {
      unresolved: {
        wordId: word.wordId,
        nameHuman: word.nameHuman,
        characterId: word.characterId,
        reason: identityBlocker
          ?? (functionClass
            ? `function class '${functionClass}' resolved but its default footprint is missing from the local KiCad library`
            : 'no MPN, no matching package-family text, and no recognised function-class role for this word'),
      },
    }
  }

  // P4: USB power/interface roles must never ship as debug pin headers.
  const fpName = footprint.footprint ?? ''
  if (
    /usb[_-]?(?:power|interface|connector|entry|receptacle|port)/i.test(word.characterId)
    && /PinHeader/i.test(fpName)
  ) {
    return {
      unresolved: {
        wordId: word.wordId,
        nameHuman: word.nameHuman,
        characterId: word.characterId,
        reason:
          'usb_power_entry cannot use PinHeader_* — need a USB receptacle footprint/MPN or leave unresolved',
      },
    }
  }

  const fallbackPins = fallback ? fallback.pins.map((pin) => sanitizePinName(pin)!) : ['P1', 'P2']
  const resolvedPins = identityVerified ? pinSpecs.map(pinIdentifier) : fallbackPins
  const resolvedPowerPin = identityVerified
    ? pinSpecs.find((pin) =>
      pin.kind === 'power_in' && !/(?:gnd|vss)/i.test(pin.name)) ?? null
    : null
  const resolvedGroundPin = identityVerified
    ? pinSpecs.find((pin) => /(?:gnd|vss)/i.test(pin.name)) ?? null
    : null

  return {
    component: {
      instanceName,
      wordId: word.wordId,
      moduleId: word.moduleId,
      subModuleId: word.subModuleId,
      nameHuman: word.nameHuman,
      characterId: word.characterId,
      functionClass,
      manufacturer: resolvedManufacturer,
      partNumber: resolvedPartNumber,
      mpnVerified,
      identityVerified,
      symbolId,
      pinSpecs,
      pinPadMap,
      identityProvenance: identityProvenance ?? (
        partNumber && mpnVerified ? `forge-truth:cached upstream MPN ${partNumber}` : null
      ),
      roleCompatibility,
      packageCompatibility,
      identityBlocker: identityVerified ? null : identityBlocker,
      resolutionTier: tier,
      footprint,
      designatorPrefix: fallback?.designatorPrefix ?? 'U',
      pins: resolvedPins,
      powerPin: identityVerified
        ? (resolvedPowerPin ? pinIdentifier(resolvedPowerPin) : null)
        : sanitizePinName(fallback?.powerPin ?? null),
      groundPin: identityVerified
        ? (resolvedGroundPin ? pinIdentifier(resolvedGroundPin) : null)
        : sanitizePinName(fallback?.groundPin ?? null),
      decouple: fallback?.decouple ?? false,
      quantityInDesign: word.quantity,
    },
  }
}

// ── Net building — global VCC/GND rails + topology-derived signal nets ─────────

interface TopologyEdge {
  from_part?: string
  to_part?: string
  mechanism?: string
}

function findComponentByPartName(
  components: AtopileComponentRecord[],
  partName: string,
): AtopileComponentRecord | null {
  const norm = partName.trim().toLowerCase()
  return components.find((c) => c.nameHuman.trim().toLowerCase() === norm) ?? null
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * @description Builds VCC/GND global rails (battery → regulator → rails when both
 * exist, per the universal power topology every electronic product shares),
 * topology-derived signal nets from `orchestratorContract.topology`, and one
 * generic decoupling cap per powered IC-class component (a rule, not a per-part
 * table). Mutates `components` in place to append dynamically-needed extra pins
 * for topology signal connections (this design is concept-stage — the engine's
 * own BoM already marks every part "exact pinout confirmed at detailed design").
 */
function buildNets(
  components: AtopileComponentRecord[],
  topology: TopologyEdge[],
  footprintsRoot: string,
  symbolsRoot: string,
): { nets: AtopileNetRecord[]; decouplingCaps: AtopileComponentRecord[] } {
  const nets = new Map<string, AtopileNetRecord>()
  const ensureNet = (name: string, kind: AtopileNetRecord['kind']): AtopileNetRecord => {
    let net = nets.get(name)
    if (!net) {
      net = { name, kind, members: [] }
      nets.set(name, net)
    }
    return net
  }
  const addMember = (net: AtopileNetRecord, instanceName: string, pin: string) => {
    if (!net.members.some((m) => m.instanceName === instanceName && m.pin === pin)) {
      net.members.push({ instanceName, pin })
    }
  }

  const vcc = ensureNet('VCC', 'power')
  const gnd = ensureNet('GND', 'ground')

  const battery = components.find((c) => c.functionClass === 'battery_connector') ?? null
  const regulator = components.find((c) => c.functionClass === 'regulator') ?? null

  // Universal power topology: battery → regulator → rails, else battery → rails
  // directly, else every powered part just ties to the shared rails (a bench/USB
  // supply is assumed upstream of the board — concept-stage, per the engine's own
  // maturity convention).
  let regulatorHandledSeparately = false
  if (battery && regulator && battery.powerPin && battery.groundPin && regulator.powerPin && regulator.groundPin) {
    const battNet = ensureNet('BATT', 'power')
    addMember(battNet, battery.instanceName, battery.powerPin)
    addMember(battNet, regulator.instanceName, regulator.powerPin)
    addMember(gnd, battery.instanceName, battery.groundPin)
    addMember(gnd, regulator.instanceName, regulator.groundPin)
    const regOutPin = regulator.pins.find((p) => /vout|out/i.test(p)) ?? regulator.pins[regulator.pins.length - 1]
    addMember(vcc, regulator.instanceName, regOutPin)
    regulatorHandledSeparately = true
  }

  for (const component of components) {
    if (regulatorHandledSeparately && (component === battery || component === regulator)) continue
    if (component.powerPin) addMember(vcc, component.instanceName, component.powerPin)
    if (component.groundPin) addMember(gnd, component.instanceName, component.groundPin)
  }

  // Topology-derived signal nets: extend each participating component with a
  // fresh generic signal pin (concept-stage placeholder, consistent with the
  // engine's own "exact pinout confirmed at detailed design" maturity marker).
  let edgeIndex = 0
  for (const edge of topology) {
    if (!edge.from_part || !edge.to_part) continue
    const fromComponent = findComponentByPartName(components, edge.from_part)
    const toComponent = findComponentByPartName(components, edge.to_part)
    if (!fromComponent || !toComponent) continue
    edgeIndex += 1
    const netName = `NET_${slug(edge.from_part)}_${slug(edge.to_part)}_${edgeIndex}`
    const net = ensureNet(netName, 'signal')
    const fromPin = `SIG_OUT_${edgeIndex}`
    const toPin = `SIG_IN_${edgeIndex}`
    fromComponent.pins.push(fromPin)
    toComponent.pins.push(toPin)
    addMember(net, fromComponent.instanceName, fromPin)
    addMember(net, toComponent.instanceName, toPin)
  }

  // Generic decoupling: one 100nF 0603 cap per powered IC-class component that
  // resolved a real footprint — a UNIVERSAL rule (every IC with a VCC/GND pin
  // pair gets one), never a per-part table.
  const decouplingCaps: AtopileComponentRecord[] = []
  for (const component of components) {
    if (!component.decouple || !component.powerPin || !component.groundPin) continue
    const capFootprint = resolveFootprintByGlob(footprintsRoot, 'Capacitor_SMD', /^C_0603_1608Metric\.kicad_mod$/)
    if (!capFootprint) continue
    const capWordId = `${component.wordId}__decouple`
    const verifiedCap = resolveVerifiedComponentIdentity({
      wordId: capWordId,
      nameHuman: `Decoupling capacitor (${component.nameHuman})`,
      characterId: 'decoupling_capacitor',
      functionClass: 'passive_c',
      requiredRatings: {},
    }, lookupCached, { symbolsRoot, footprintsRoot })
    const hasVerifiedCap = !('status' in verifiedCap)
    const capPinSpecs = hasVerifiedCap ? verifiedCap.pins : []
    const capPins = hasVerifiedCap ? capPinSpecs.map(pinIdentifier) : ['P1', 'P2']
    const cap: AtopileComponentRecord = {
      instanceName: `decouple_${component.instanceName}`,
      wordId: capWordId,
      moduleId: component.moduleId,
      subModuleId: component.subModuleId,
      nameHuman: `Decoupling capacitor (${component.nameHuman})`,
      characterId: 'decoupling_capacitor',
      functionClass: 'passive_c',
      manufacturer: hasVerifiedCap ? verifiedCap.manufacturer : null,
      partNumber: hasVerifiedCap ? verifiedCap.partNumber : null,
      mpnVerified: hasVerifiedCap,
      identityVerified: hasVerifiedCap,
      symbolId: hasVerifiedCap ? verifiedCap.symbolId : null,
      pinSpecs: capPinSpecs,
      pinPadMap: hasVerifiedCap
        ? Object.fromEntries(capPinSpecs.map((pin) => [pinIdentifier(pin), pin.number]))
        : {},
      identityProvenance: hasVerifiedCap ? verifiedCap.provenance : null,
      roleCompatibility: hasVerifiedCap ? verifiedCap.roleCompatibility : null,
      packageCompatibility: hasVerifiedCap ? verifiedCap.packageCompatibility : null,
      identityBlocker: hasVerifiedCap ? null : verifiedCap.reason,
      resolutionTier: hasVerifiedCap ? 'mpn_symbol_footprint' : 'package_family',
      footprint: capFootprint,
      designatorPrefix: 'C',
      pins: capPins,
      powerPin: capPins[0],
      groundPin: capPins[1],
      decouple: false,
      quantityInDesign: 1,
    }
    decouplingCaps.push(cap)
    addMember(vcc, cap.instanceName, capPins[0])
    addMember(gnd, cap.instanceName, capPins[1])
  }

  return { nets: [...nets.values()], decouplingCaps }
}

// ── Board outline — reuses the ported pcb-outline.ts geometry helpers ──────────

function hasInstrumentOpticalSourceBoard(
  state: Record<string, unknown>,
  words: ElectronicWordRef[],
  components: AtopileComponentRecord[],
): boolean {
  const designText = `${stateText(state)} ${words.map(wordText).join(' ')}`
  if (OPTICAL_SOURCE_BOARD_WORD_RE.test(designText)) return true
  return components.some((component) => {
    const roleText = [component.wordId, component.nameHuman, component.characterId].join(' ')
    return OPTICAL_SOURCE_BOARD_WORD_RE.test(roleText)
  })
}

function computeBoardOutline(
  components: AtopileComponentRecord[],
  opts: { isInstrumentSourceBoard?: boolean } = {},
): PcbBoardGeometry {
  const AREA_MULTIPLIER = 5.0 // matches prior-art pcb_chain.py's validated constant
  const totalAreaMm2 = components.reduce(
    (sum, c) => sum + (c.functionClass ? AREA_MM2_BY_CLASS[c.functionClass] ?? DEFAULT_AREA_MM2 : DEFAULT_AREA_MM2),
    0,
  )
  const rawSide = Math.sqrt(Math.max(totalAreaMm2, 1) * AREA_MULTIPLIER)
  const minSide = opts.isInstrumentSourceBoard ? 25 : 50
  const maxSide = opts.isInstrumentSourceBoard ? 40 : 250
  const roundTo = opts.isInstrumentSourceBoard ? 5 : 10
  const side = Math.max(minSide, Math.min(maxSide, Math.ceil(rawSide / roundTo) * roundTo))
  const outline = createRoundedRectangleContour('board_outline', side, side, 3)
  const geometry: PcbBoardGeometry = {
    outline,
    cutouts: [],
    mountingHoles: [],
    source: 'derived',
    sourceDetail: opts.isInstrumentSourceBoard
      ? `Phase B compact instrument board estimate: sqrt(sum(per-class nominal footprint area mm²) × ${AREA_MULTIPLIER}) ` +
        `over ${components.length} on-board components after COTS off-board filtering, clamped [25,40]mm, rounded to 5mm. ` +
        'Host peripherals / purchased assemblies stay off-board; this outline is the control/source daughterboard.'
      : `Phase B estimate: sqrt(sum(per-class nominal footprint area mm²) × ${AREA_MULTIPLIER}) ` +
        `over ${components.length} components, clamped [50,250]mm, rounded to 10mm. ` +
        'Phase C recomputes from the real placed footprint bounding boxes once layout runs.',
  }
  const findings = validateBoardGeometry(geometry)
  if (findings.length) {
    throw new Error(`computeBoardOutline produced invalid geometry: ${findings.join(', ')}`)
  }
  return geometry
}

// ── .ato emission ────────────────────────────────────────────────────────────

function emitComponentBlock(component: AtopileComponentRecord): string {
  const lines: string[] = []
  const typeName = toTypeName(component.instanceName)
  lines.push(`component ${typeName}:`)
  lines.push(`    designator_prefix = "${component.designatorPrefix}"`)
  lines.push(`    footprint = "${component.footprint!.library}:${component.footprint!.footprint}"`)
  // GOTCHA (verified live against atopile 0.2.69, 2026-07-12): any `mpn` value
  // starting with the literal prefix "generic_" is a MAGIC TRIGGER in atopile's
  // own `_is_generic()` (components.py) — it forces `ato build` to call atopile's
  // REMOTE parts-DB API (https://components.atopileapi.com) for that component
  // regardless of an explicit `footprint`, breaking offline/deterministic builds
  // and failing outright for our synthesised function-class defaults (which have
  // no `value:` physical type the remote resistor/capacitor endpoint requires).
  // NEVER prefix a placeholder mpn with "generic_" — use the engine's own
  // "TBD (detailed design)" concept-stage convention instead.
  const mpnComment = component.mpnVerified && component.partNumber
    ? `${component.manufacturer ?? ''} ${component.partNumber}`.trim()
    : `TBD (detailed design) - ${component.functionClass ?? 'part'}`
  lines.push(`    mpn = "${mpnComment.replace(/"/g, "'")}"`)
  component.pins.forEach((pin, index) => {
    const padNumber = component.pinPadMap[pin] ?? String(index + 1)
    lines.push(`    signal ${pin} ~ pin ${padNumber}`)
  })
  return lines.join('\n')
}

function emitModule(components: AtopileComponentRecord[], nets: AtopileNetRecord[]): string {
  const lines: string[] = []
  lines.push('module App:')
  for (const component of components) {
    lines.push(`    ${component.instanceName} = new ${toTypeName(component.instanceName)}`)
  }
  lines.push('')
  for (const net of nets) {
    lines.push(`    signal ${net.name}`)
  }
  lines.push('')
  for (const net of nets) {
    for (const member of net.members) {
      lines.push(`    ${member.instanceName}.${member.pin} ~ ${net.name}`)
    }
  }
  return lines.join('\n')
}

// ── Top-level entry point ───────────────────────────────────────────────────────

/**
 * @description Maps the engine's electronic design (state.moduleDecomposition +
 * state.orchestratorContract.topology) into a valid atopile project under `outDir`.
 * Universal: no colorimeter-specific (or any product-specific) code anywhere in
 * this file — every table is keyed on generic function-class role names or
 * generic package-family text tokens.
 * @param state - The chain's assembled state (same shape `pcb-stage.ts` consumes).
 * @param outDir - Directory to write `main.ato` + `ato.yaml` (+ `board-outline.json`) into.
 * @param opts - Optional footprint root, board scope, and function-derived shape contract.
 * Shape-less callers retain the component-area-derived legacy outline.
 * @returns Generated Atopile project paths, records, and board geometry.
 */
export function generateAtopileProject(
  state: Record<string, unknown>,
  outDir: string,
  opts: GenerateAtopileProjectOptions = {},
): GenerateAtopileProjectResult {
  const footprintsRoot = opts.footprintsRoot ?? DEFAULT_FOOTPRINTS_ROOT
  const symbolsRoot = opts.symbolsRoot ?? DEFAULT_SYMBOLS_ROOT
  footprintDirCache.clear()

  const allElectronicWords = collectElectronicWords(state)
  const requiredWordIds = opts.requiredWordIds ? new Set(opts.requiredWordIds) : null
  const scopedElectronicWords = requiredWordIds
    ? allElectronicWords.filter((word) => requiredWordIds.has(word.wordId))
    : allElectronicWords
  const electronicWords = scopedElectronicWords
  // INTENT: Channel contracts describe work the board must implement; they are
  // not manufacturer-orderable packages. Keep the obligation explicit until a
  // real topology assigns components or passive copper geometry to the role.
  const functionRequirements: AtopileFunctionRequirementRecord[] =
    (scopedElectronicWords.length === 0 ? opts.requiredFunctionRoles ?? [] : []).map((role) => (
      /electrode.*channel/i.test(role)
        ? {
            role,
            implementation: 'passive_board_geometry',
            reason: 'electrode channel is patterned board geometry, not a fitted package',
          }
        : {
            role,
            implementation: 'unresolved_board_function',
            reason: 'architecture function requires a real component topology',
          }
    ))

  const components: AtopileComponentRecord[] = []
  const offBoard: AtopileOffBoardCotsRecord[] = []
  const unresolved: AtopileUnresolvedRecord[] = []
  for (const word of electronicWords) {
    // DECISION: requiredWordIds is the architecture planner's authoritative
    // on-board scope. Legacy procurement heuristics may classify unplanned
    // projects, but must never reverse an explicit on-board assignment.
    const cotsReason = requiredWordIds
      ? null
      : offBoardCotsReason(word, electronicWords, state)
    if (cotsReason) {
      offBoard.push({
        wordId: word.wordId,
        nameHuman: word.nameHuman,
        characterId: word.characterId,
        quantityInDesign: word.quantity,
        disposition: 'off_board_cots_module',
        reason: cotsReason,
      })
      continue
    }
    const result = resolveComponent(word, footprintsRoot, symbolsRoot)
    if ('component' in result) components.push(result.component)
    else unresolved.push(result.unresolved)
  }

  const topology = (
    (state.orchestratorContract as { topology?: TopologyEdge[] } | undefined)?.topology ?? []
  )
  const { nets, decouplingCaps } = buildNets(
    components,
    topology,
    footprintsRoot,
    symbolsRoot,
  )
  const allComponents = [...components, ...decouplingCaps]

  // DECISION (NinjaPCR 2026-07-15): compact instrument boards use the [25,40] mm
  // clamp whether or not an optical LED source exists — thermocycler MCU boards
  // were stuck at the plant [50,250] floor and failed Verification HARD
  // "Instrument PCB max side". Optical source board remains the stricter path
  // when present; any other isInstrumentDevice with ≤12 on-board parts qualifies.
  // GOTCHA (Poseidon 2026-07-16): actuation-drive boards (MCU + stepper driver +
  // polyfuses) cannot pack under a 40 mm ceiling — keep them on the [50,250]
  // plant floor so Freerouting/placement can converge DRC-clean.
  const isCompactInstrumentBoard =
    instrumentDeviceContext(state, electronicWords) &&
    !hasActuationDriveBoard(state, electronicWords) &&
    (hasInstrumentOpticalSourceBoard(state, electronicWords, allComponents) ||
      allComponents.length <= 12)
  // DECISION: Board-plan geometry wins only when it carries complete dimensional
  // datums. Missing/legacy shape contracts deliberately fall through to the
  // unchanged area heuristic, keeping every existing caller compatible.
  const boardOutline =
    (opts.boardShape
      ? createBoardGeometryFromShapeContract(opts.boardShape)
      : null) ??
    computeBoardOutline(allComponents, {
      isInstrumentSourceBoard: isCompactInstrumentBoard,
    })

  mkdirSync(outDir, { recursive: true })

  const componentBlocks = allComponents.map(emitComponentBlock).join('\n\n')
  const moduleBlock = emitModule(allComponents, nets)
  const mainAto = `${componentBlocks}\n\n${moduleBlock}\n`

  const atoYaml = 'ato-version: ^0.2.0\nbuilds:\n  default:\n    entry: main.ato:App\n'

  const mainAtoPath = join(outDir, 'main.ato')
  const atoYamlPath = join(outDir, 'ato.yaml')
  const boardOutlinePath = join(outDir, 'board-outline.json')

  writeFileSync(mainAtoPath, mainAto, 'utf8')
  writeFileSync(atoYamlPath, atoYaml, 'utf8')
  writeFileSync(boardOutlinePath, JSON.stringify(boardOutline, null, 2), 'utf8')

  return {
    projectDir: outDir,
    mainAtoPath,
    atoYamlPath,
    boardOutlinePath,
    components: allComponents,
    nets,
    offBoard,
    unresolved,
    functionRequirements,
    boardOutline,
  }
}

if (require.main === module) {
  const statePathArg = process.argv[2]
  const outDirArg = process.argv[3]
  if (!statePathArg || !outDirArg) {
    console.error('usage: atopile-generator.ts <state.json> <outDir>')
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePathArg, 'utf8'))
  const result = generateAtopileProject(state, outDirArg)
  console.log(
    `[atopile-generator] ${result.components.length} components resolved, ` +
    `${result.offBoard.length} off-board COTS, ${result.unresolved.length} unresolved, ` +
    `${result.nets.length} nets → ${result.projectDir}`,
  )
  if (result.offBoard.length) {
    console.log('Off-board COTS:', JSON.stringify(result.offBoard, null, 2))
  }
  if (result.unresolved.length) {
    console.log('Unresolved:', JSON.stringify(result.unresolved, null, 2))
  }
}
