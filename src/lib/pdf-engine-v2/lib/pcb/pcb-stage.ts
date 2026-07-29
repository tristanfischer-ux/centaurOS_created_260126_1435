/**
 * @file PCB shadow stage — Phase A (2026-07-12).
 * @description `runPcbStage(state)` decides, from the design's OWN content (words,
 * modifier_characters, module tree, and the brief prose) — never a product-class
 * table — whether the design is PCB-bearing, then calls the real toolchain discovery
 * + the validated disposition policy to record a bespoke/COTS/none verdict.
 *
 * SHADOW (Phase A): this stage NEVER emits anything to the dossier and NEVER fails
 * the chain. It only records `state.pcb` + logs a one-line summary. Wired into
 * `scripts/serial-design-chain-v2.tsx` behind `process.env.PCB_STAGE` — every
 * existing run (PCB_STAGE unset) is byte-identical.
 *
 * Universal detection: an "electronic complexity cluster" is inferred from ≥3
 * distinct electronic-function categories (processor / analog front-end / power
 * electronics / display / connectivity / sensor-IC) matched in the design's own
 * word text, OR a direct "PCB/PCBA/circuit board" mention — never a hardcoded
 * class-name list (a colorimeter, a BMS slave board, a flight controller, and a
 * medical wearable all reach `isPcbBearing=true` via the same signal, with none
 * of those words appearing in this file).
 *
 * Run standalone: npx tsx src/lib/pdf-engine-v2/lib/pcb/pcb-stage.ts <state.json>
 */

import { readFileSync } from 'fs'
import {
  discoverPcbCapability,
  type PcbCapabilityManifest,
} from './discover-capability'
import {
  decidePcbDisposition,
  type PcbStageDisposition,
  type PcbStageDispositionResult,
} from './disposition'
import type { PcbArchitecturePlan } from './pcb-architecture'
import type { PcbPipelineResult } from './pcb-pipeline'

interface CategoryPattern {
  category: string
  pattern: RegExp
}

// Each category is a FUNCTION signal, not a class name — a bespoke lab colorimeter,
// a BMS slave board, and a drone flight controller all trip the same categories via
// completely different word vocabularies.
const ELECTRONIC_CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: 'processor',
    // compute_ui_module = purchased MCU+UI kit (gold PyBadge-class host) — still a
    // processor-category electronic assembly for PCB disposition, just off-board.
    // INTENT: firmware_storage / flash_storage / debug_header are host-MCU companions —
    // collect them from role identity (form-prose matching was removed; see GOTCHA).
    pattern: /\b(main[-_ ]controller|mcu|micro-?controller|compute[_ -]?ui[_ -]?module|\bsoc\b|system[- ]on[- ]chip|fpga|\bprocessor\b|\bcpu\b|signal processing|firmware[_ -]?storage|flash[_ -]?(?:storage|memory)|debug[_ -]?header|debug[_ -]?uart)\b/i,
  },
  {
    category: 'analog_frontend',
    // INTENT (Sol+Fable 2026-07-27): multi-channel electrical instruments emit
    // precision_afe / kelvin_voltage_sense / current_shunt / comparator latch
    // roles — without underscore-aware nouns they never enter collectElectronicWords
    // and Gate 38 audits a token board that cannot source/sink a channel.
    pattern: /\b(photodiode|phototransistor|detector|light[- ]sensor|spectral[- ]sensor|colou?r[- ]sensor|transimpedance|\btia\b|operational amplifier|op-?amp|\badc\b|analog[- ]to[- ]digital|\bdac\b|analog front-?end|\bafe\b|precision[_ -]?afe|current[_ -]?sense(?:or)?|current[_ -]?shunt|kelvin[_ -]?(?:voltage[_ -]?)?sense|voltage[_ -]?sense|over[_ -]?under[_ -]?voltage|overvoltage|undervoltage|comparator(?:[_ -]?latch)?|overcurrent[_ -]?comparator|overtemp[_ -]?trip)\b/i,
  },
  {
    category: 'power_electronics',
    // INTENT (2026-07-14): match character_ids alone (dc_dc_regulator,
    // rechargeable_battery_pack, dc_input_fuse) — not only form-modifier prose
    // that happens to contain "li-po" / "battery charger". Host-side off-board
    // disposition cannot fire on words the collector never sees.
    // INTENT (Poseidon 2026-07-16): stepper/microstep/H-bridge driver boards are
    // power-electronics (collected → atopile) — "Stepper Driver Board" was silently
    // dropped because only "gate driver" / "led driver" matched.
    // INTENT (Pioreactor heater_20ml / organoid 1546): cartridge/resistive heaters
    // are power-electronics on the wet-actuation board. Do NOT match bare
    // peltier/TEC module nouns here — those are purchased thermal assemblies
    // (collected via form-prose smear otherwise) and must stay off-board.
    // INTENT (2026-07-20): capacitors + dc_dc_converters must match role identity —
    // `dc_link_capacitor` / `dc_dc_converters` were dropped after form-prose removal.
    // INTENT (Sol+Fable 2026-07-27): channel power chain — charge source, load
    // MOSFET, pass-bank, source/sink stage, current control, hardware cutout —
    // must collect or expandPhysicalInstances never sees them (cold-v10 15/52).
    pattern: /\b(status[-_ ]?(?:led|indicator)|charge[_ -]?status|low[_ -]?battery|battery[_ -]?indicator|led[-_ ]?source|\bled\b|led driver|gate driver|stepper[_ -]?driver|microstep[_ -]?driver|h[_ -]?bridge|motor[_ -]?driver|driver[_ -]?board|driver[_ -]?ic|rechargeable[_ -]?battery|battery(?:[_ -]?(?:pack|charger|charge|management|modules?|racks?))?|li-?ion|li-?po|lithium[- ]polymer|voltage regulator|dc[_ -]?dc[_ -]?(?:regulator|converters?)|\bldo\b|dc-?dc converter|boost converter|buck converter|power(?:[_ -]?(?:input|switch|indicator|rail|semiconductors?))?|(?:bulk[_ -]?)?capacitors?|power management (?:ic|system)|\bpmic\b|(?:dc[_ -]?)?(?:input[_ -]?)?fuse|mains[_ -]?fuse|polyfuse|ferrite|esd[_ -]?protection|thermal[_ -]?cutoff|reverse[_ -]?polarity|stemma|qwiic|grove|cartridge[_ -]?heater|resistive[_ -]?heater|heater[_ -]?(?:element|channel|pcb|board)|estop|e[_ -]?stop|power[_ -]?kill|discharge[_ -]?load[_ -]?mosfet|\bmosfet\b|charge[_ -]?current[_ -]?source|current[_ -]?control[_ -]?loop|linear[_ -]?source[_ -]?sink|source[_ -]?sink[_ -]?stage|discharge[_ -]?pass[_ -]?bank|pass[_ -]?bank|hardware[_ -]?cutout|channel[_ -]?power[_ -]?bus|cooling[_ -]?fan|heatsink(?:[_ -]?fan)?|finned[_ -]?heatsink|heat[_ -]?sink)\b/i,
  },
  {
    category: 'display',
    pattern: /\b(oled|\block?d\b|\btft\b|e-?ink|display|readout|keypad|user[- ]input|buttons?|membrane[- ]switch|display driver|display module|display panel|segment display|compute[_ -]?ui[_ -]?module|local[_ -]?hmi)\b/i,
  },
  {
    category: 'connectivity',
    // INTENT (Pioreactor 0327): host_protocol_bridge / protocol_bridge / level_shifter
    // are connectivity electronics — without these nouns, collectElectronicWords
    // drops the word entirely (neither off-board nor unresolved) and the LED-board
    // host-scrub proveCatch cannot fire.
    // INTENT (2026-07-20): host_interface + ethernet_switch are role-identity nouns
    // (form-prose "wi-fi gateway" used to collect them; role-only must still see them).
    // GOTCHA (cold-v12): `\busb\b` never matches `usb_c_host_interface` (underscore
    // is a word char). Keep optional c_/host_ the same as classifyFunction.
    pattern: /(?:^|[_ -])(?:usb[_ -]?(?:c[_ -]?)?(?:host[_ -]?)?(?:interface|power|connector|receptacle|port|entry)?|bluetooth|\bble\b|wi-?fi|rf[_ -]?transceiver|antenna|uart|i2c|spi|can[_ -]?bus|zigbee|lora|host[_ -]?protocol[_ -]?bridge|protocol[_ -]?bridge|level[_ -]?shifter|host[_ -]?interface|ethernet[_ -]?switch|type[_ -]?c)(?:$|[_ -])|\b(?:usb|bluetooth|wi-?fi)\b/i,
  },
  {
    category: 'board_role',
    pattern: /\b(pcb|pcba|printed circuit board|circuit board|schematic|gerber)\b/i,
  },
  {
    category: 'sensor_ic',
    // INTENT (Pioreactor heater_20ml / organoid 1546): culture temperature probes
    // and cartridge-heater sense are sensor-IC electronics — without these nouns
    // collectElectronicWords never sees the wet-actuation board scope.
    // INTENT (2026-07-20): fan tach / failure sense is a host peripheral role noun.
    pattern: /\b(sensor ic|monitor ic|\bimu\b|accelerometer|gyroscope|cell monitor|temperature[_ -]?(?:sensor|probe|ic)|culture[_ -]?temperature|tmp\d{3,}|thermistor|rtd|fan[_ -]?(?:failure|tach|sense)|tachometer)\b/i,
  },
  {
    // INTENT (2026-07-20): wall-ESS / plant purchased field assemblies must be
    // collected from role identity so PLANT_PURCHASED_ASSEMBLY_RE can disposition
    // them off-board. Form-prose "fuse-backed supply" used to drag them in; after
    // role-only collection they vanished (neither off-board nor unresolved) and
    // the wall-ESS proveCatch went red. Noun-keyed — never a class table.
    category: 'purchased_field_assembly',
    pattern: /\b(?:smoke[_ -]?detectors?|gas[_ -]?(?:sensors?|detection(?:[_ -]?system)?)|hydrogen[_ -]?(?:detection[_ -]?)?sensors?|fire[_ -]?(?:detectors?|suppression(?:[_ -]?system)?)|arc[_ -]?(?:fault|flash)(?:[_ -]?(?:detection|protection))?|power[_ -]?conversion[_ -]?system|pcs(?:[_ -]?(?:inverter|unit))?|auxiliary[_ -]?power(?:[_ -]?(?:supply|distribution|transformer|pdu|unit))?)\b/i,
  },
  // INTENT (Sol+Fable 2026-07-27): `\b(...)\b` never fires inside underscore
  // character_ids (`per_channel_charge_current_source`). These role-boundary
  // patterns admit the multi-channel power/sense/safety chain from identity alone.
  {
    category: 'power_electronics',
    pattern: /(?:^|[_ -])(?:discharge[_ -]?load[_ -]?mosfet|charge[_ -]?current[_ -]?source|current[_ -]?control[_ -]?loop|linear[_ -]?source[_ -]?sink|source[_ -]?sink[_ -]?stage|discharge[_ -]?pass[_ -]?bank|pass[_ -]?bank|hardware[_ -]?cutout|channel[_ -]?power[_ -]?bus|cooling[_ -]?fan|heatsink(?:[_ -]?fan)?|finned[_ -]?heatsink)(?:$|[_ -])/i,
  },
  {
    category: 'analog_frontend',
    pattern: /(?:^|[_ -])(?:precision[_ -]?afe|current[_ -]?shunt(?:[_ -]?measurement)?|kelvin[_ -]?(?:voltage[_ -]?)?sense|over[_ -]?under[_ -]?voltage|overcurrent[_ -]?comparator|overtemp[_ -]?trip|comparator[_ -]?latch)(?:$|[_ -])/i,
  },
]

// Independent of the category patterns above: signals about the PRODUCT (not its
// electronics) that feed the disposition policy's constraint evidence.
const COMPACT_ENVELOPE_PATTERN = /\b(handheld|hand-held|portable|compact|wearable|pocket-?sized|palm-?sized|desktop instrument|benchtop instrument)\b/i
const SAFETY_PATTERN = /\b(medical|iec ?60601|life-?support|explosion|hazardous area|\batex\b|safety-?critical|implantable)\b/i
const RF_TERM_PATTERN = /\b(bluetooth|wi-?fi|\brf\b|antenna|zigbee|lora|beamforming)\b/i
const EXPLICIT_CUSTOM_PATTERN = /\b(custom pcb|bespoke (?:pcb|board|circuit)|custom-designed board)\b/i
// INTENT (2026-07-14, gold WHY): handheld optical briefs say "commercially
// available electronics" — that IS explicit COTS-module intent for the host
// compute/UI + detector. Keep "custom pcb" as the opposite signal elsewhere.
const EXPLICIT_COTS_PATTERN = /\b(off-the-shelf module|cots module|purchased module|third-party module|commercially available electronics|catalogue electronics|off[\s-]the[\s-]shelf electronics)\b/i
const GENERIC_PLACEHOLDER_WORD_RE =
  /\b(?:[a-z][a-z0-9_ -]+[_ -])?sub[-_ ]?component[_ -]?\d+\b/i

/** Sensing-path anonymous slots (organoid OD emitter/detector proxies). */
const SENSING_INSTRUMENTATION_PROXY_RE =
  /sensing[_ -]?instrumentation[_ -]?subcomponent[_ -]?\d+/i

/**
 * @description Form/modifier evidence that the word is an OD optical path part.
 * Universal noun signal — never a product-class table.
 */
export function hasOdOpticalFormEvidence(formOrModifiers: string): boolean {
  return /optical\s*density|\bod600\b|od[_ -]?sensor|od[_ -]?detector|od[_ -]?source|optical[_ -]?(?:adc|measurement|path)/i
    .test(formOrModifiers)
}

function wordIdentityText(word: RawWordShape): string {
  return [
    word.id ?? '',
    word.name_human ?? '',
    word.content_character?.character_id ?? '',
    word.content_character?.name_human ?? '',
  ].join(' ')
}

function wordFormBlob(word: RawWordShape): string {
  return (word.modifier_characters ?? [])
    .map((mc) => mc.value ?? '')
    .join(' ')
}

function isGenericPlaceholderWord(word: RawWordShape): boolean {
  const identityText = wordIdentityText(word)
  if (!GENERIC_PLACEHOLDER_WORD_RE.test(identityText)) return false
  // INTENT (2026-07-21): OD path parts often arrive only as
  // sensing_instrumentation_subcomponent_N with "optical density (od600)" in
  // form. Keep collecting those; still drop other anonymous subcomponent_N
  // placeholders that inherit sibling prose (false electronic gaps).
  if (
    SENSING_INSTRUMENTATION_PROXY_RE.test(identityText)
    && hasOdOpticalFormEvidence(wordFormBlob(word))
  ) {
    return false
  }
  return true
}

export interface ElectronicSignalScan {
  isPcbBearing: boolean
  electronicPartCount: number
  distinctElectronicCategories: string[]
  reasons: string[]
  matchedWordIds: string[]
}

/**
 * @description Extracts every word-bearing text field (name + character id/name +
 * every modifier_character value) from a moduleDecomposition tree.
 */
function walkDesignWords(
  moduleDecomposition: unknown,
): Array<{ id: string; text: string; quantity: number }> {
  const out: Array<{ id: string; text: string; quantity: number }> = []
  const modules = (moduleDecomposition as { modules?: unknown[] } | null)?.modules ?? []
  for (const mod of Array.isArray(modules) ? modules : []) {
    const subModules = (mod as { sub_modules?: unknown[] })?.sub_modules ?? []
    for (const sub of Array.isArray(subModules) ? subModules : []) {
      const words = (sub as { words?: unknown[] })?.words ?? []
      for (const w of Array.isArray(words) ? words : []) {
        const word = w as {
          id?: string
          name_human?: string
          content_character?: { character_id?: string; name_human?: string }
          modifier_characters?: Array<{ kind?: string; value?: string }>
        }
        // GOTCHA: anonymous coverage placeholders often inherit rich module prose
        // ("photodiode, cuvette, LED...") in their form text. They are not physical
        // PCB candidates; counting them creates false electronic gaps.
        if (isGenericPlaceholderWord(word)) continue
        // Category scan uses role identity only — see collectElectronicWords GOTCHA.
        const parts: string[] = [
          word.id ?? '',
          word.name_human ?? '',
          word.content_character?.character_id ?? '',
          word.content_character?.name_human ?? '',
        ]
        let quantity = 1
        const qtyMod = (word.modifier_characters ?? []).find((mc) => mc?.kind === 'quantity')
        if (qtyMod?.value) {
          const n = Number(String(qtyMod.value).replace(/[^\d.]/g, ''))
          if (Number.isFinite(n) && n > 0) quantity = n
        }
        out.push({ id: word.id ?? 'unknown_word', text: parts.join(' '), quantity })
      }
    }
  }
  return out
}

function briefText(state: Record<string, unknown>): string {
  const pb = (state.parsedBrief as Record<string, unknown> | undefined) ?? {}
  const constraints = (pb.constraints as Record<string, unknown> | undefined) ?? {}
  return [
    pb.product_description,
    pb.mission_statement,
    pb.why_now,
    pb.target_customers,
    (constraints.target_material as { value?: string } | undefined)?.value,
    (constraints.target_process as { value?: string } | undefined)?.value,
  ]
    .filter((v) => typeof v === 'string')
    .join(' ')
}

/**
 * @description Scans the design's own words + brief prose for electronic-function
 * signals. Universal: keyed on function vocabulary (processor/AFE/power/display/
 * connectivity/board-role/sensor-IC), never a product-class name.
 * @param state - The chain's assembled state (moduleDecomposition + parsedBrief).
 * @returns Whether the design is PCB-bearing and the evidence behind that call.
 */
export function scanDesignForElectronicSignals(
  state: Record<string, unknown>,
): ElectronicSignalScan {
  const words = walkDesignWords(state.moduleDecomposition)
  const combinedBrief = briefText(state)
  const categoriesHit = new Set<string>()
  const matchedWordIds = new Set<string>()
  let electronicPartCount = 0

  for (const w of words) {
    let wordMatched = false
    for (const { category, pattern } of ELECTRONIC_CATEGORY_PATTERNS) {
      if (pattern.test(w.text)) {
        categoriesHit.add(category)
        wordMatched = true
      }
    }
    if (wordMatched) {
      matchedWordIds.add(w.id)
      electronicPartCount += w.quantity
    }
  }
  // The brief prose alone can carry a category the deterministic word skeleton hasn't
  // spelled out yet (e.g. "FR4 for PCBs" / "battery-and-USB-powered") — count it as
  // evidence for isPcbBearing, but never toward electronicPartCount (no physical parts).
  for (const { category, pattern } of ELECTRONIC_CATEGORY_PATTERNS) {
    if (pattern.test(combinedBrief)) categoriesHit.add(category)
  }

  const distinctElectronicCategories = [...categoriesHit].sort()
  const boardRoleDirect = categoriesHit.has('board_role')
  // Function-diversity threshold: ≥3 distinct electronic-function categories is a
  // deliberate PCB-class cluster (an MCU alone, or a single sensor, is not); a direct
  // "PCB/PCBA/circuit board" mention is sufficient on its own regardless of diversity.
  const isPcbBearing = boardRoleDirect || distinctElectronicCategories.length >= 3

  const reasons: string[] = []
  if (boardRoleDirect) reasons.push('direct_pcb_pcba_mention')
  if (distinctElectronicCategories.length >= 3) {
    reasons.push(`electronic_function_diversity_${distinctElectronicCategories.length}_categories`)
  }
  if (!isPcbBearing) reasons.push('insufficient_electronic_function_evidence')

  return {
    isPcbBearing,
    electronicPartCount,
    distinctElectronicCategories,
    reasons,
    matchedWordIds: [...matchedWordIds],
  }
}

export interface ElectronicWordRef {
  moduleId: string
  subModuleId: string
  wordId: string
  nameHuman: string
  characterId: string
  /** modifier_characters flattened to {kind: value}; last write wins for duplicate kinds. */
  modifiers: Record<string, string>
  /** Which ELECTRONIC_CATEGORY_PATTERNS this word's OWN text matched (not the design aggregate). */
  categories: string[]
  quantity: number
}

interface RawWordShape {
  id?: string
  name_human?: string
  content_character?: { character_id?: string; name_human?: string }
  modifier_characters?: Array<{ kind?: string; value?: string }>
}

/**
 * @description Per-word electronic-component candidates for the Phase B atopile
 * generator. Reuses the SAME `ELECTRONIC_CATEGORY_PATTERNS` universal detection
 * signal as `scanDesignForElectronicSignals` (never a product-class table) but
 * returns full word detail (module/sub-module id + modifiers) instead of the
 * design-level aggregate, since the generator needs per-word manufacturer/
 * part_number/form data to resolve a footprint.
 * @param state - The chain's assembled state (moduleDecomposition at minimum).
 * @returns One entry per word whose OWN text matched ≥1 electronic-function category.
 */
export function collectElectronicWords(
  state: Record<string, unknown>,
): ElectronicWordRef[] {
  const modules = (state.moduleDecomposition as { modules?: unknown[] } | null)?.modules ?? []
  const out: ElectronicWordRef[] = []
  for (const mod of Array.isArray(modules) ? modules : []) {
    const moduleId = (mod as { module?: string })?.module ?? 'unknown_module'
    const subModules = (mod as { sub_modules?: unknown[] })?.sub_modules ?? []
    for (const sub of Array.isArray(subModules) ? subModules : []) {
      const subModuleId = (sub as { id?: string })?.id ?? 'unknown_sub_module'
      const words = (sub as { words?: unknown[] })?.words ?? []
      for (const w of Array.isArray(words) ? words : []) {
        const word = w as RawWordShape
        if (isGenericPlaceholderWord(word)) continue
        const modifiers: Record<string, string> = {}
        for (const mc of word.modifier_characters ?? []) {
          if (mc?.kind) modifiers[mc.kind] = mc.value ?? ''
        }
        // GOTCHA: form/modifier prose often copies sibling-assembly blurbs
        // ("peltier heating & cooling block", "optical density (od600)…") onto
        // every word in a sub-module. Category detection must key on the word's
        // own identity — otherwise thermal insulation / TIM pads inflate
        // electronicPartCount and steal PCB scope (organoid 1546).
        const roleIdentity = [
          word.id ?? '',
          word.name_human ?? '',
          word.content_character?.character_id ?? '',
          word.content_character?.name_human ?? '',
        ].join(' ')
        let categories = ELECTRONIC_CATEGORY_PATTERNS
          .filter(({ pattern }) => pattern.test(roleIdentity))
          .map(({ category }) => category)
        // GOTCHA: sensing_instrumentation_subcomponent_N never matches a role
        // noun pattern — OD function lives only in form. Mint analog_frontend
        // when form proves optical-density path (collected above via proxy rescue).
        if (
          categories.length === 0
          && SENSING_INSTRUMENTATION_PROXY_RE.test(roleIdentity)
          && hasOdOpticalFormEvidence(Object.values(modifiers).join(' '))
        ) {
          categories = ['analog_frontend']
        }
        if (categories.length === 0) continue
        let quantity = 1
        if (modifiers.quantity) {
          const n = Number(String(modifiers.quantity).replace(/[^\d.]/g, ''))
          if (Number.isFinite(n) && n > 0) quantity = n
        }
        out.push({
          moduleId,
          subModuleId,
          wordId: word.id ?? 'unknown_word',
          nameHuman: word.name_human ?? word.id ?? 'unknown',
          characterId: word.content_character?.character_id ?? '',
          modifiers,
          categories,
          quantity,
        })
      }
    }
  }
  return out
}

export interface DispositionSignals {
  compactProductEnvelope: boolean
  customFormFactor: boolean
  multiFunctionIntegration: boolean
  safetySpecificIntegration: boolean
  rfOrHighSpeedLayout: boolean
  repeatedApplicationSpecificBoard: boolean
  explicitCustomIntent: boolean
  explicitCotsIntent: boolean
  parentIsPurchasedAssembly: boolean
  productionVolumeUnits: number | null
}

// A batch of ≥10 units is treated as "repeated" (a one-off prototype board is not);
// this is a constraint-evidence signal for the disposition policy, not a hard class rule.
const REPEATED_PRODUCTION_THRESHOLD = 10

/**
 * INTENT (2026-07-29 SOL): a traction MGU + SiC MCU pack's control electronics
 * live INSIDE the purchased / OEM inverter assembly — Forge must not author a
 * bespoke ATSAMD21 board. Detected from contract quantities (cold-plate loop +
 * shaft torque / phase current), never a class slug.
 */
function hasTractionDrivePurchasedElectronics(state: Record<string, unknown>): boolean {
  const contract =
    (state.orchestratorContract as { quantities?: Record<string, { value?: unknown }>; topology?: unknown[] } | undefined)
    ?? (state.engineeringContract as { quantities?: Record<string, { value?: unknown }>; topology?: unknown[] } | undefined)
  const q = contract?.quantities ?? {}
  const flow = Number(q.coolant_flow_l_min?.value)
  const tin = Number(q.coolant_inlet_c?.value)
  if (!(Number.isFinite(flow) && flow > 0 && Number.isFinite(tin))) return false
  const edges = Array.isArray(contract?.topology) ? contract.topology : []
  const hasColdPlateEdge = edges.some((e) => {
    const edge = e as { mechanism?: unknown; from_part?: unknown; to_part?: unknown }
    if (String(edge?.mechanism ?? '') !== 'fluid_loop') return false
    return /cold[_\s-]?plates?/i.test(`${edge?.from_part ?? ''} ${edge?.to_part ?? ''}`)
  })
  if (!hasColdPlateEdge) return false
  const torque = Number(q.mgu_shaft_torque_nm?.value)
  const iph = Number(q.phase_current_max_a?.value)
  return (Number.isFinite(torque) && torque > 0) || (Number.isFinite(iph) && iph >= 100)
}

/**
 * @description Derives the disposition policy's constraint-evidence signals from the
 * design's own brief + electronic scan — never a product-class table.
 */
export function deriveDispositionSignals(
  state: Record<string, unknown>,
  scan: ElectronicSignalScan,
): DispositionSignals {
  const combinedBrief = briefText(state)
  const pb = (state.parsedBrief as Record<string, unknown> | undefined) ?? {}
  const constraints = (pb.constraints as Record<string, unknown> | undefined) ?? {}
  const batchSize = (constraints.batch_size as { value?: number } | undefined)?.value
  const productionVolumeUnits = typeof batchSize === 'number' ? batchSize : null

  const compactProductEnvelope = COMPACT_ENVELOPE_PATTERN.test(combinedBrief)
  const rfOrHighSpeedLayout = scan.distinctElectronicCategories.includes('connectivity') && RF_TERM_PATTERN.test(combinedBrief)
  // DECISION (2026-07-29 SOL): SiC traction MCU = purchased OEM assembly — do not
  // explode gate-drive / control into a forge-authored KiCad board.
  const parentIsPurchasedAssembly = hasTractionDrivePurchasedElectronics(state)

  return {
    compactProductEnvelope,
    // A compact custom-housed electronic product implies a custom board form factor
    // (no COTS DIN-rail/rack module fits inside a bespoke handheld enclosure).
    // Traction OEM inverter: form factor is the purchased MCU brick, not a custom PCB.
    customFormFactor: compactProductEnvelope && !parentIsPurchasedAssembly,
    multiFunctionIntegration: scan.distinctElectronicCategories.length >= 3,
    safetySpecificIntegration: SAFETY_PATTERN.test(combinedBrief),
    rfOrHighSpeedLayout,
    repeatedApplicationSpecificBoard:
      (productionVolumeUnits ?? 0) >= REPEATED_PRODUCTION_THRESHOLD,
    explicitCustomIntent: EXPLICIT_CUSTOM_PATTERN.test(combinedBrief) && !parentIsPurchasedAssembly,
    explicitCotsIntent: EXPLICIT_COTS_PATTERN.test(combinedBrief) || parentIsPurchasedAssembly,
    parentIsPurchasedAssembly,
    productionVolumeUnits,
  }
}

/**
 * @description Phase D pipeline record attached to `state.pcb.pipeline` — the REAL
 * `runPcbPipeline()` result (board/route/DRC/Gerbers, honest failure) plus the
 * Phase-B generator's own summary (component/net counts + the honest unresolved
 * list), so the dossier tab + gate can read one place for "did a real board land".
 */
export interface PcbPipelineRecord extends PcbPipelineResult {
  generator?: {
    componentCount: number
    netCount: number
    offBoardCount?: number
    offBoard?: Array<{
      wordId: string
      nameHuman: string
      characterId: string
      quantityInDesign: number
      disposition: string
      reason: string
    }>
    unresolvedCount: number
    unresolved: Array<{ wordId: string; nameHuman: string; characterId: string; reason: string }>
    /** The PCBA BoM the dossier tab renders — resolved components with MPN/footprint.
     *  Slim, serializable projection of AtopileComponentRecord[] (no functionClass enum
     *  object identity, footprint reduced to {library,footprint}). */
    components: Array<{
      instanceName: string
      nameHuman: string
      characterId: string
      manufacturer: string | null
      partNumber: string | null
      footprint: { library: string; footprint: string } | null
      resolutionTier: string
      quantityInDesign: number
    }>
  }
}

export interface PcbStageResult {
  isPcbBearing: boolean
  electronicPartCount: number
  distinctElectronicCategories: string[]
  reasons: string[]
  signals: DispositionSignals
  capability: PcbCapabilityManifest
  disposition: PcbStageDisposition
  dispositionDetail: PcbStageDispositionResult
  canAuthor: boolean
  canRoute: boolean
  canVerifyAndExport: boolean
  /** Phase D (2026-07-12): set only when disposition==='bespoke' AND PCB_STAGE actually
   *  attempted the build/route/DRC pipeline (or honestly recorded why it couldn't). */
  pipeline?: PcbPipelineRecord
  /** Architecture plan recorded by the chain before Atopile generation (scope truth). */
  architecture?: PcbArchitecturePlan
  /** Architecture-vs-implementation fitness (P4b / P9b prerequisite). */
  designFitness?: {
    ok: boolean
    findings: Array<{ severity?: string; code?: string; message?: string; fixStage?: string }>
  }
  /** Design-evidence channel counts — firmware contracts must use this, not requiredCount. */
  implementedChannels?: Record<string, number>
  /** True when architecture needs >1 KiCad deliverable but chain emitted one project (P5). */
  multiBoardMerged?: boolean
  /**
   * Per-board pipeline summaries when `runBespokeMultiBoardPcb` emitted one
   * KiCad project per `requiresKiCadDeliverable` board (2026-07-21).
   */
  boardPipelines?: Array<{
    boardId: string
    role: string
    projectDir: string
    pipelineOk: boolean
    stageReached: string
    componentCount: number
    unresolvedCount: number
  }>
  /**
   * Firmware proof stage record (P9b + fixpack15 Tier-1 + fixpack17 Tier-2 sim).
   * Never alone upgrades to FUNCTIONALLY VERIFIED — HIL still required.
   */
  firmwareProof?: {
    schema: 'pcb-firmware-proof-stage/v1'
    /** Highest completed: 0 native, 1 MCU compile, 2 host bind, 3 QEMU MCU sim. */
    tier: 0 | 1 | 2 | 3
    results: Array<{ target: string; result: { ok: boolean; skipped?: boolean; reason?: string } }>
    allOk: boolean
    /** Alias of allOk — Excel readiness reads `ok`. */
    ok: boolean
    /**
     * Anvil honesty doctrine (pcb-firmware-honesty/v1) — required on every write.
     * Excel MUST prefer honesty.statusLabel; never invent FUNCTIONALLY VERIFIED.
     */
    honesty: {
      schema: 'pcb-firmware-honesty/v1'
      tier: 0 | 1 | 2 | 3 | null
      ok: boolean | null
      statusLabel: string
      fabReadyBanner: string
      forbiddenClaim: string
      readinessWhyFragment: string
      isHil: false
      claimsFunctionalVerification: false
    }
    /** Optional paths written under firmware-proof/ for artefact SIGHT. */
    honestyArtefacts?: { contractPath: string; honestyPath: string }
    tier1?: {
      ok: boolean
      skipped: boolean
      tier: 'tier1_mcu_compile'
      reason: string
      toolchain: string | null
      projectDir?: string
      elfPath?: string
    }
    /** Host net/device bind harness (NOT MCU execution — honesty rename from board_sim). */
    tier2?: {
      ok: boolean
      skipped: boolean
      tier: 'tier2_board_sim' | 'tier2_board_bind'
      reason: string
      modelPath?: string
      resultPath?: string
      transcriptPath?: string
      bindErrorCount?: number
    }
    /** Real Cortex-M ELF under QEMU semihosting — still not HIL. */
    tier3?: {
      ok: boolean
      skipped: boolean
      tier: 'tier3_mcu_sim'
      reason: string
      qemu?: string | null
      simElfPath?: string
      transcriptPath?: string
    }
  }
}

/**
 * @description Runs the Phase-A PCB shadow stage on an assembled chain state.
 * SHADOW: never throws for a normal miss, never mutates the design, never emits
 * to the dossier. Caller (the chain) decides what to do with the result.
 * @param state - The chain's state (moduleDecomposition + parsedBrief at minimum).
 * @param opts - `verbose` logs a one-line summary to stderr.
 */
export function runPcbStage(
  state: Record<string, unknown>,
  opts: { verbose?: boolean } = {},
): PcbStageResult {
  const scan = scanDesignForElectronicSignals(state)
  const signals = deriveDispositionSignals(state, scan)
  const capability = discoverPcbCapability()
  const dispositionDetail = decidePcbDisposition({
    isPcbBearing: scan.isPcbBearing,
    electronicPartCount: scan.electronicPartCount,
    distinctElectronicCategories: scan.distinctElectronicCategories,
    compactProductEnvelope: signals.compactProductEnvelope,
    customFormFactor: signals.customFormFactor,
    multiFunctionIntegration: signals.multiFunctionIntegration,
    safetySpecificIntegration: signals.safetySpecificIntegration,
    rfOrHighSpeedLayout: signals.rfOrHighSpeedLayout,
    repeatedApplicationSpecificBoard: signals.repeatedApplicationSpecificBoard,
    explicitCustomIntent: signals.explicitCustomIntent,
    explicitCotsIntent: signals.explicitCotsIntent,
    parentIsPurchasedAssembly: signals.parentIsPurchasedAssembly,
  })

  const result: PcbStageResult = {
    isPcbBearing: scan.isPcbBearing,
    electronicPartCount: scan.electronicPartCount,
    distinctElectronicCategories: scan.distinctElectronicCategories,
    reasons: scan.reasons,
    signals,
    capability,
    disposition: dispositionDetail.disposition,
    dispositionDetail,
    canAuthor: capability.canAuthor,
    canRoute: capability.canRoute,
    canVerifyAndExport: capability.canVerifyAndExport,
  }

  if (opts.verbose) {
    console.error(
      `[pcb-stage] bearing=${result.isPcbBearing} categories=[${result.distinctElectronicCategories.join(',')}] ` +
      `disposition=${result.disposition} canAuthor=${result.canAuthor} canRoute=${result.canRoute} canVerifyAndExport=${result.canVerifyAndExport}`,
    )
  }
  return result
}

if (require.main === module) {
  const statePathArg = process.argv[2]
  if (!statePathArg) {
    console.error('usage: pcb-stage.ts <state.json>')
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePathArg, 'utf8'))
  const result = runPcbStage(state, { verbose: true })
  console.log(JSON.stringify(result, null, 2))
}
