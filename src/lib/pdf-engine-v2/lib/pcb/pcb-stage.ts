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
    pattern: /\b(mcu|micro-?controller|\bsoc\b|system[- ]on[- ]chip|fpga|\bprocessor\b|\bcpu\b|signal processing)\b/i,
  },
  {
    category: 'analog_frontend',
    pattern: /\b(photodiode|phototransistor|transimpedance|\btia\b|operational amplifier|op-?amp|\badc\b|analog[- ]to[- ]digital|\bdac\b|analog front-?end|\bafe\b|current sense(?:or)?)\b/i,
  },
  {
    category: 'power_electronics',
    pattern: /\b(led driver|gate driver|battery charger|li-?ion|li-?po|lithium[- ]polymer|voltage regulator|\bldo\b|dc-?dc converter|boost converter|buck converter|power management (?:ic|system)|\bpmic\b)\b/i,
  },
  {
    category: 'display',
    pattern: /\b(oled|\block?d\b|\btft\b|e-?ink|display driver|display module|display panel|segment display)\b/i,
  },
  {
    category: 'connectivity',
    pattern: /\b(usb|bluetooth|\bble\b|wi-?fi|rf transceiver|\bantenna\b|\buart\b|\bi2c\b|\bspi\b|\bcan bus\b|zigbee|lora)\b/i,
  },
  {
    category: 'board_role',
    pattern: /\b(pcb|pcba|printed circuit board|circuit board|schematic|gerber)\b/i,
  },
  {
    category: 'sensor_ic',
    pattern: /\b(sensor ic|monitor ic|\bimu\b|accelerometer|gyroscope|cell monitor)\b/i,
  },
]

// Independent of the category patterns above: signals about the PRODUCT (not its
// electronics) that feed the disposition policy's constraint evidence.
const COMPACT_ENVELOPE_PATTERN = /\b(handheld|hand-held|portable|compact|wearable|pocket-?sized|palm-?sized|desktop instrument|benchtop instrument)\b/i
const SAFETY_PATTERN = /\b(medical|iec ?60601|life-?support|explosion|hazardous area|\batex\b|safety-?critical|implantable)\b/i
const RF_TERM_PATTERN = /\b(bluetooth|wi-?fi|\brf\b|antenna|zigbee|lora|beamforming)\b/i
const EXPLICIT_CUSTOM_PATTERN = /\b(custom pcb|bespoke (?:pcb|board|circuit)|custom-designed board)\b/i
const EXPLICIT_COTS_PATTERN = /\b(off-the-shelf module|cots module|purchased module|third-party module)\b/i

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
        const parts: string[] = [
          word.name_human ?? '',
          word.content_character?.character_id ?? '',
          word.content_character?.name_human ?? '',
          ...(word.modifier_characters ?? []).map((mc) => mc?.value ?? ''),
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
        const modifiers: Record<string, string> = {}
        for (const mc of word.modifier_characters ?? []) {
          if (mc?.kind) modifiers[mc.kind] = mc.value ?? ''
        }
        const text = [
          word.name_human ?? '',
          word.content_character?.character_id ?? '',
          word.content_character?.name_human ?? '',
          ...Object.values(modifiers),
        ].join(' ')
        const categories = ELECTRONIC_CATEGORY_PATTERNS
          .filter(({ pattern }) => pattern.test(text))
          .map(({ category }) => category)
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

  return {
    compactProductEnvelope,
    // A compact custom-housed electronic product implies a custom board form factor
    // (no COTS DIN-rail/rack module fits inside a bespoke handheld enclosure).
    customFormFactor: compactProductEnvelope,
    multiFunctionIntegration: scan.distinctElectronicCategories.length >= 3,
    safetySpecificIntegration: SAFETY_PATTERN.test(combinedBrief),
    rfOrHighSpeedLayout,
    repeatedApplicationSpecificBoard:
      (productionVolumeUnits ?? 0) >= REPEATED_PRODUCTION_THRESHOLD,
    explicitCustomIntent: EXPLICIT_CUSTOM_PATTERN.test(combinedBrief),
    explicitCotsIntent: EXPLICIT_COTS_PATTERN.test(combinedBrief),
    // Phase A has no OEM-parent resolution pass yet (that lives in the orchestrator's
    // catalogue-module matching, not built for PCB candidates); conservative default.
    parentIsPurchasedAssembly: false,
    productionVolumeUnits,
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
