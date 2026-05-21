#!/usr/bin/env -S npx tsx
/**
 * estimate-missing-prices.tsx — for every word in moduleDecomposition that
 * doesn't have a real distributor price, attach a plausible UK trade price
 * estimate. Updates state.partVerifications (synthesising new rows for words
 * without any verification entry).
 *
 * Engine B (post-council, 2026-05-18): the estimator NO LONGER asks Flash-
 * Lite for "scale-of-one trade pricing". Instead:
 *   1. Determine the brief's annual production volume (per-class default if
 *      undeclared — see component-classes.ts DEFAULT_VOLUME_BY_BUCKET).
 *   2. Classify each part into one of 20 component classes (lookup against
 *      the forge-truth.db pretraining corpus first; Flash-Lite fallback).
 *   3. Compute unit_cost = reference_unit_cost_gbp × interpolate(curve, V).
 *
 * For parts that don't classify (component_class = 'unknown'), fall back to
 * a Flash-Lite call with a NEW volume-aware prompt rather than the old
 * scale-of-one anchor.
 *
 * Per the diagnostic
 * (forgeos-illustration-experiments/pretraining/cost-engine-heatpump-
 * attribution.html): Layer 2 (the old estimator's wrong anchor) was 85% of
 * the heatpump +789% deviation. This patch eliminates that layer.
 *
 * Usage:
 *   npx tsx scripts/estimate-missing-prices.tsx <state.json> [--write] [--volume N]
 *
 * The optional --volume <N> overrides annual production volume. Otherwise
 * read from state.parsedBrief.constraints.annual_production_volume.value or
 * the class default.
 *
 * Cost: ~£0.05-£0.10 per BESS (mostly from on-the-fly classification of
 * parts that aren't in the corpus). Curve lookups are free (deterministic).
 *
 * W3 RELATIONSHIP: this script writes per-part estimates that are ALREADY
 * volume-anchored. The renderer's `applyBatchEconomics()` still multiplies
 * by `bom_scale_factor` on top — for now. After Engine A ships and we re-
 * validate, the W3 multiplier will be retired (set to 1.0). Keep both
 * layered until then per PLAN-2026-05-18 §"W3 retires the day Engine B
 * ships". See drawer forgeos_gotchas_e1f18dd3cfae9ee3.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'
import { homedir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import {
  COMPONENT_CURVES,
  COMPONENT_CLASS_ORDER,
  interpolateCurve,
  defaultVolumeFor,
  referenceUnitCostFor,
  componentClassFloorGbp,
  type ComponentClass,
} from '../src/lib/pdf-engine-v2/component-classes'

const CONCURRENCY = 8
const FORGE_TRUTH_DB = join(homedir(), '.forge-truth/forge-truth.db')
const COST_LOG = '/tmp/engine-b-cost.log'

const OPENROUTER_KEY = (() => {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  for (const f of [
    '/Users/tristanfischer/secrets/openrouter.env',
    join(process.cwd(), '.env.local'),
  ]) {
    if (existsSync(f)) {
      const content = readFileSync(f, 'utf-8')
      const m = content.match(/^OPENROUTER_API_KEY="?([^\s"]+)"?/m)
      if (m) return m[1]
    }
  }
  try {
    return execFileSync('zsh', ['-ic', 'echo $OPENROUTER_API_KEY'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()

if (!OPENROUTER_KEY) {
  console.error('[estimate] OPENROUTER_API_KEY not found — cannot estimate prices')
  process.exit(1)
}

interface PartContext {
  word_id: string
  word_name: string
  module: string
  sub_module_id: string
  manufacturer: string | null
  part_number: string | null
  description: string | null
  quantity: number
}

/** Universal "finished commodity" heuristic — applies to every product class.
 *  A finished commodity is a real catalogue item bought from a manufacturer
 *  (40-ft ISO container from CIMC, Copeland compressor, Bosch Rexroth rail).
 *  These are priced at retail catalogue; the production-scale curve discount
 *  (multiplier=0.25 etc) does NOT apply because we're not making them
 *  ourselves. By contrast, custom-fab brackets / sheet-metal enclosures /
 *  bespoke PCBs DO get the curve discount because per-unit cost actually
 *  drops with production volume.
 *
 *  Rule: manufacturer is set, not 'custom fab' or 'TBD', AND part_number
 *  looks like a real SKU (not a placeholder).
 *
 *  ITER-10.5 Sprint 1A (Tristan 2026-05-20 fifth review): direct fix for
 *  the £112.50 40-ft container case. Engine B curve was discounting a
 *  £1,500 catalogue item to £375 then renderer halved it again. */
function isFinishedCommodity(ctx: PartContext): boolean {
  const mfr = String(ctx.manufacturer ?? '').trim().toLowerCase()
  if (!mfr) return false
  if (mfr === 'custom fab' || mfr === 'custom_fab' || mfr === 'tbd' || mfr === 'tba' || mfr === 'n/a') return false
  const pn = String(ctx.part_number ?? '').trim()
  if (!pn) return false
  // Placeholder / custom-fab SKU patterns
  if (/^(tbd|tba|n\/a|custom|fab|placeholder)/i.test(pn)) return false
  // Custom-fab SKUs often start with the product's brief acronym + dash
  // ("VFT-LMB-01" = vertical-farm-trolley LED mounting bracket 01).
  // Real catalogue SKUs almost always include a digit, dash, or letter
  // pattern that doesn't begin with project-specific 2-4 letter prefixes
  // followed by another acronym. Heuristic: if the manufacturer name
  // explicitly says "custom", reject.
  return true
}

interface PriceEstimate {
  price_estimate_gbp: number
  estimate_low_gbp: number
  estimate_high_gbp: number
  reasoning: string
  // Engine B additions
  component_class: ComponentClass | 'unknown'
  curve_multiplier: number
  reference_unit_cost_gbp: number
  annual_volume: number
  classification_source: 'corpus' | 'flash_lite' | 'fallback'
  estimate_source: 'curve' | 'flash_lite_unknown_class'
}

// ---------------------------------------------------------------------------
// Annual volume resolution — brief value first, then class-bucket default.
// Per the council plan: brief should declare annual_production_volume; if
// missing, defaults are consumer 100k, mid-volume 1k, industrial-heavy 100.
// ---------------------------------------------------------------------------

function resolveAnnualVolume(
  state: any,
  productClassSlug: string,
  cliOverride: number | null,
): { volume: number; source: 'cli' | 'brief' | 'default' } {
  if (cliOverride && cliOverride > 0) return { volume: cliOverride, source: 'cli' }
  const briefVol =
    state?.parsedBrief?.constraints?.annual_production_volume?.value ??
    state?.parsedBrief?.constraints?.annual_volume?.value ??
    null
  if (typeof briefVol === 'number' && briefVol > 0) {
    return { volume: briefVol, source: 'brief' }
  }
  return { volume: defaultVolumeFor(productClassSlug), source: 'default' }
}

// Pull the canonical product class slug from state. Tries the three places
// the slug lives in iter-64 states (varies by pipeline version).
function getProductClassSlug(state: any): string {
  return String(
    state?.keyMetrics?.product_class ??
      state?.moduleDecomposition?.product_class ??
      state?.parsedBrief?.product_class ??
      String(state?.projectId || '').split('-')[0]?.toLowerCase() ??
      '',
  ).toLowerCase()
}

// ---------------------------------------------------------------------------
// Corpus lookup — for a given part name, find a matching pretraining row and
// return its component_class. Uses case-insensitive contains-match against
// the part_name column (cheap; <2 ms per lookup). Returns 'unknown' or null
// when no match (caller falls back to Flash-Lite classification).
// ---------------------------------------------------------------------------

class CorpusClassifier {
  private db: Database.Database | null = null
  private stmt: Database.Statement | null = null
  private memo = new Map<string, ComponentClass | 'unknown' | null>()

  constructor() {
    if (existsSync(FORGE_TRUTH_DB)) {
      this.db = new Database(FORGE_TRUTH_DB, { readonly: true })
      try {
        this.stmt = this.db.prepare(`
          SELECT component_class, COUNT(*) AS n
          FROM pretraining_extracted_parts
          WHERE component_class IS NOT NULL
            AND part_name IS NOT NULL
            AND LOWER(part_name) LIKE ?
          GROUP BY component_class
          ORDER BY n DESC
          LIMIT 1
        `)
      } catch {
        this.db.close()
        this.db = null
      }
    }
  }

  lookup(partName: string): ComponentClass | 'unknown' | null {
    if (!this.stmt) return null
    const key = partName.toLowerCase().trim()
    if (this.memo.has(key)) return this.memo.get(key)!
    // Try exact word-boundary match first via LIKE %word%; trim to <=80 chars.
    const needle = `%${key.slice(0, 80)}%`
    let result: ComponentClass | 'unknown' | null = null
    try {
      const row = this.stmt.get(needle) as any
      if (row && row.component_class) {
        result = row.component_class as ComponentClass | 'unknown'
      }
    } catch {
      result = null
    }
    this.memo.set(key, result)
    return result
  }

  close() {
    this.db?.close()
  }
}

// ---------------------------------------------------------------------------
// Flash-Lite on-the-fly classification for parts not in the corpus.
// Batched up to 20 at a time (small enough that Flash-Lite doesn't self-
// summarise — drawer forgeos_gotchas_115d8319262232ae).
// ---------------------------------------------------------------------------

async function classifyOnTheFly(
  parts: Array<{ ctx: PartContext }>,
): Promise<Map<string, ComponentClass | 'unknown'>> {
  const result = new Map<string, ComponentClass | 'unknown'>()
  if (parts.length === 0) return result
  const classList = COMPONENT_CLASS_ORDER.join(', ')
  const partsJson = parts
    .map((p, i) => {
      const ctx = p.ctx
      const bits = [`idx=${i}`, `name="${ctx.word_name.replace(/"/g, "'").slice(0, 120)}"`]
      if (ctx.manufacturer) bits.push(`mfr="${ctx.manufacturer.slice(0, 40)}"`)
      if (ctx.part_number) bits.push(`pn="${ctx.part_number.slice(0, 40)}"`)
      if (ctx.module) bits.push(`module=${ctx.module}`)
      return `  - { ${bits.join(', ')} }`
    })
    .join('\n')
  const prompt = `Classify each hardware part below into ONE of these 20 component classes:
${classList}

Class guidance (CRITICAL — read carefully):

oem_subsystem: ONLY for BIG (>£200 typical, >£100 minimum) pre-built modules with substantial BoM inside them — full hermetic compressors, fully-assembled inverters / PSUs / GPU boards / complete BMS mainboards, complete pump assemblies >£100. NEVER for: DC-DC converters, Wi-Fi antennas, emergency stop buttons, RCDs, contactors, MCBs, EMI filters, small pumps <£100, thermostats, gauges, MCU modules, antennas of any kind, push-buttons, relays. Those have their own dedicated classes. RULE OF THUMB: if the part contains the word "antenna", "button", "filter", "thermostat", "switch", "relay", "gauge", "sensor", "converter" — it is NOT oem_subsystem.

electronic_ic: ICs, MCUs, ASICs, FPGAs, RTC chips, ADCs (chip-level only). NOT controller boards.
electronic_pcb: bare PCB or small PCBA / control board (£15-£200). Heat pump controller, anti-icing board, comms board, DC-DC CONVERTER modules, thermostat boards, display PCBAs, expansion-valve drivers.
sensor: thermistor, Hall, IMU, pressure gauge, temperature probe, flow sensor, encoder, transducer, GAS LEAK SENSOR, leak detector, propane sensor.
optical: LEDs, photodiodes, displays (LCD, OLED), lenses. ALSO: WIFI ANTENNAS, ANTENNAS of any kind (radio modules are antenna+IC together — classify as 'optical' if just antenna element; 'electronic_pcb' if module).
safety_consumable: fuses, MCBs, RCDs, contactors, breakers, EMERGENCY STOP BUTTONS, e-stop devices, fire-suppression cartridges, isolation switches, isolators.
thermal: heatsinks, cold plates, fans (cooling fans, condenser fans, evaporator fans — fan ASSEMBLIES go to mechanical_assembly), TIM, plate heat exchangers (BPHE), evaporators, condensers.
fluid_path: pipes, copper tubing, valves (service valves, expansion valves, isolation valves, relief valves), manifolds, fittings, hoses, expansion vessels, refrigerant lines.
magnetic: transformers, EMI FILTERS, line filters, large inductors (>100uH), motor magnets, motor stators, chokes, RF chokes.
motor_actuator: BLDC/stepper/servo motor units, solenoids, linear actuators (the motor itself, not its driver). NOT pumps with motor — pumps go to mechanical_assembly.
electronic_power_module: SiC/IGBT power modules / integrated power stages (the silicon dies — not the assembled PSU).
electronic_passive: discrete resistors, capacitors (including DC-LINK capacitors regardless of physical size), MLCCs, small ferrites, varistors, MOVs.
electronic_discrete: discrete diodes, MOSFETs, BJTs, TVS, single transistors.
electronic_connector: headers, terminal blocks, USB-C, RJ45, Molex/JST, SAE flares, Schrader caps.
electronic_cable: cable assemblies, harnesses, ribbon, coax, mains-cordsets.
structural_metal: chassis, brackets, sheet metal, weldments, frames, base pans, mounting bars.
structural_polymer: injection-moulded plastics, gaskets, polymer housings, mouldings, EPDM/HNBR/PTFE seals (small).
mechanical_fastener: bolts, nuts, washers, pins, springs, rivets, anti-vibration mounts.
mechanical_assembly: hinges, bearings, gears, fan ASSEMBLIES (motor+blade as unit), small PUMP ASSEMBLIES (<£100 like circulator pumps), compressor SHELLS, valve actuators.
battery_cell: lithium-ion cells, lead-acid, supercapacitors.

ANTI-EXAMPLES (these are recurring mis-classifications — DO NOT repeat):
- "Wi-Fi antenna" → optical (or sensor), NEVER oem_subsystem
- "emergency stop button" → safety_consumable, NEVER oem_subsystem
- "DC-DC converter" → electronic_pcb, NEVER oem_subsystem
- "EMI filter" → magnetic, NEVER oem_subsystem
- "Modbus comms board" → electronic_pcb, NEVER oem_subsystem
- "small circulator pump" → mechanical_assembly, NEVER oem_subsystem
- "potting compound" → structural_polymer (or 'unknown' for chemicals), NEVER oem_subsystem

PARTS:
${partsJson}

Return ONLY a JSON array, one entry per part in the same order:
[{"idx":<idx>,"component_class":"<class or 'unknown'>"}, ...]
No prose, no markdown.`
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS Engine B on-the-fly classifier',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1800,
        temperature: 0.1,
      }),
    })
    if (!res.ok) return result
    const j: any = await res.json()
    const text: string = j.choices?.[0]?.message?.content ?? ''
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) return result
    const parsed = JSON.parse(m[0])
    if (!Array.isArray(parsed)) return result
    const valid = new Set<string>([...COMPONENT_CLASS_ORDER, 'unknown'])
    // 2026-05-19 firestorm iter-5 fix: defence-in-depth post-filter. Even with
    // tightened prompt + anti-examples, Flash-Lite occasionally returns
    // oem_subsystem for small parts (DC-DC, antenna, e-stop, EMI filter,
    // potting compound) because the prompt is long and the model's class
    // attribution is heuristic. The £600 oem_subsystem reference price × W3
    // scale = £113.20 — the SAME mis-price observed 5× in iter-3 BoMs across
    // unrelated parts. Override here when the part name contains a forbidden
    // keyword for that class.
    const OEM_SUBSYSTEM_FORBIDDEN = /\b(antenna|button|filter|converter|thermostat|gauge|sensor|relay|contactor|switch|isolator|fuse|breaker|terminal|grommet|gasket|seal|grease|compound|potting|adhesive|silicone|paint|lubricant|fluid|coolant|water|gas|refrigerant|propane|oxygen|nitrogen|gel|wire|cable|hose|pipe|tube|fitting|bolt|nut|washer|spring|pin|rivet|clip|bracket|mount|stand|hinge|bearing)/i
    const overrideClass = (partName: string, currentClass: string): string => {
      if (currentClass !== 'oem_subsystem') return currentClass
      if (!OEM_SUBSYSTEM_FORBIDDEN.test(partName)) return currentClass
      // Forbidden keyword found in oem_subsystem-classified part. Override.
      const lower = partName.toLowerCase()
      if (/\b(antenna)\b/.test(lower)) return 'optical'
      if (/\b(button|switch|isolator|breaker|fuse|relay|contactor)\b/.test(lower)) return 'safety_consumable'
      if (/\b(converter|board|pcb|controller|module|driver)\b/.test(lower)) return 'electronic_pcb'
      if (/\b(filter|choke|inductor|transformer)\b/.test(lower)) return 'magnetic'
      if (/\b(thermostat|gauge|sensor|probe)\b/.test(lower)) return 'sensor'
      if (/\b(gasket|seal|grommet|potting|compound|adhesive|silicone)\b/.test(lower)) return 'structural_polymer'
      if (/\b(hose|pipe|tube|fitting|valve)\b/.test(lower)) return 'fluid_path'
      if (/\b(cable|wire|harness)\b/.test(lower)) return 'electronic_cable'
      if (/\b(bolt|nut|washer|spring|pin|rivet)\b/.test(lower)) return 'mechanical_fastener'
      if (/\b(bracket|mount|hinge|bearing)\b/.test(lower)) return 'mechanical_assembly'
      // Forbidden keyword present but no obvious bucket — mark unknown
      return 'unknown'
    }
    let overrideCount = 0
    for (const r of parsed) {
      const idx = Number(r.idx)
      let cls = String(r.component_class ?? '').trim()
      if (!Number.isFinite(idx) || !valid.has(cls)) continue
      const ctx = parts[idx]?.ctx
      if (!ctx) continue
      const original = cls
      cls = overrideClass(ctx.word_name, cls)
      if (cls !== original) overrideCount += 1
      result.set(ctx.word_id, cls as ComponentClass | 'unknown')
    }
    if (overrideCount > 0) {
      console.log(`[estimate] Engine B classifier override: ${overrideCount} parts moved out of oem_subsystem`)
    }
  } catch (err) {
    console.error('[estimate] on-the-fly classify failed:', err)
  }
  return result
}

// ---------------------------------------------------------------------------
// Small-commodity keyword pre-filter for unknown-class parts (2026-05-21,
// Tristan BESS forensic). Flash-Lite was returning £128 for "cell voltage
// tap wire" (×5000 = £640k!) because it didn't know to bias toward small-
// commodity prices. Universal: short list of keywords that map to a tier
// of typical UK unit prices. When the part name matches, skip the Flash-
// Lite call entirely and use the deterministic floor. Cost Repair can
// still correct upward if a genuinely high-priced item slipped through.
// ---------------------------------------------------------------------------

interface SmallCommodityTier {
  pattern: RegExp
  // Tiered unit prices at different annual production volumes.
  // Council 2026-05-21 verdict (Q1+Q3): original flat prices were 2-3×
  // too high at 100k volume — Tier 2 at £10 systematically overshoots
  // for consumer / mid-vol classes. Now volume-aware.
  unit_gbp_low_vol: number    // ~1-1000 units/yr (bespoke, distributor 1-off)
  unit_gbp_mid_vol: number    // 1k-10k/yr (distributor-discounted, light tooling)
  unit_gbp_high_vol: number   // >50k/yr (commodity, full-tooling OEM contract)
  reason: string
}

const SMALL_COMMODITY_TIERS: SmallCommodityTier[] = [
  // Tier 1: micro commodity — fasteners, micro-electronics, single wires
  // Plus council Q2 additions: standoffs, heat-shrink, crimps, strain relief,
  // cable markers, thermal pads.
  { pattern: /\b(fastener|bolt|nut|screw|rivet|washer|grommet|cable_tie|tie_wrap|spacer_screw|micro_fuse|jumper|ferrite_bead|standoff|pillar|pcb_spacer|heat_shrink|sleeving|spiral_wrap|crimp|spade|pin_terminal|strain_relief|cable_marker|thermal_pad|thermal_paste|tim_pad|cable_saddle|din_end_stop|cable_tray_clip)\b/i,
    unit_gbp_low_vol: 2.0, unit_gbp_mid_vol: 0.8, unit_gbp_high_vol: 0.20,
    reason: 'micro commodity (fastener / small electronic)' },
  { pattern: /\b(voltage_tap_wire|tap_wire|sense_wire|sensing_wire|pilot_wire|signal_wire|trigger_wire|sample_lead)\b/i,
    unit_gbp_low_vol: 3.0, unit_gbp_mid_vol: 1.0, unit_gbp_high_vol: 0.30,
    reason: 'small signal/tap wire' },
  // Tier 2: small fabrication — small clips/lugs/seals/labels.
  // Council Q3 vetoes applied: cable_gland (£0.50-200 spread) +
  // bushing (£0.20-120) + terminal (£0.50-150) DROPPED from this tier
  // — too ambiguous, would false-floor expensive industrial variants.
  // Only the qualified small-variant keywords remain.
  { pattern: /\b(clip|mount(ing)?_clip|tab|spring_clip|ferrule|lug|cable_clamp|p_clip|spacer|pcb_terminal|pcb_terminal_block)\b/i,
    unit_gbp_low_vol: 8, unit_gbp_mid_vol: 2.5, unit_gbp_high_vol: 0.60,
    reason: 'small fabricated clip/terminal' },
  { pattern: /\b(gasket|o_ring|seal|grommet_seal|sleeve|nylon_bushing|polymer_bushing|pg_gland|pg7_gland|pg9_gland|pg11_gland|pg13_gland|pg16_gland|pg21_gland)\b/i,
    unit_gbp_low_vol: 6, unit_gbp_mid_vol: 1.5, unit_gbp_high_vol: 0.50,
    reason: 'small seal/bushing/nylon gland' },
  { pattern: /\b(label|sticker|decal|nameplate|warning_plate)\b/i,
    unit_gbp_low_vol: 3, unit_gbp_mid_vol: 1.0, unit_gbp_high_vol: 0.20,
    reason: 'label/sticker' },
  // Tier 3: small structural — small plates, brackets, panels under 1 m.
  // Council Q1: at 1k/yr £25; at 100k/yr should be £3-8.
  { pattern: /\b(small_bracket|sub_bracket|mounting_bracket|sensor_bracket|micro_bracket)\b/i,
    unit_gbp_low_vol: 25, unit_gbp_mid_vol: 8, unit_gbp_high_vol: 2.5,
    reason: 'small mounting bracket' },
  { pattern: /\b(cable_entry|gland_plate|tray_clip|cover_plate|access_plate|blanking_plate)\b/i,
    unit_gbp_low_vol: 25, unit_gbp_mid_vol: 7, unit_gbp_high_vol: 2.0,
    reason: 'small access/cover plate' },
  // Tier 4: short busbars / cell interconnects.
  // Council Q1: BESS gotcha drawer says cell-to-cell busbar at 100k volume
  // is £0.20-0.50 — the original £25 was 50× too high.
  { pattern: /\b(cell_to_cell|inter_cell|cell_busbar|busbar_short|sense_busbar)\b/i,
    unit_gbp_low_vol: 8, unit_gbp_mid_vol: 1.5, unit_gbp_high_vol: 0.40,
    reason: 'small cell-interconnect busbar' },
  // module_busbar removed from Tier 4 (council Q3: £25-800 spread depending
  // on whether it's a HAPS payload connector or a utility BESS main bus).
]

/**
 * Pick the volume-tier price for a small-commodity match. Council 2026-05-21
 * verdict Q1: flat prices systematically over-shoot for high-volume classes.
 */
function smallCommodityPriceAtVolume(tier: SmallCommodityTier, annualVolume: number): number {
  if (annualVolume >= 50_000) return tier.unit_gbp_high_vol
  if (annualVolume >= 1_000) return tier.unit_gbp_mid_vol
  return tier.unit_gbp_low_vol
}

/**
 * Manufacturer-set veto (council Q3). If the part has a real distributor-
 * sourced manufacturer + part number, the small-commodity floor is the
 * WRONG anchor — the part is a finished catalogue item with its own
 * price. Returning null lets the normal Flash-Lite fallback or downstream
 * cost-repair cite the manufacturer's catalogue price instead.
 */
function isFinishedCommodityVeto(ctx: PartContext): boolean {
  const mfg = String(ctx.manufacturer ?? '').trim()
  const pn = String(ctx.part_number ?? '').trim()
  if (!mfg || !pn) return false
  if (mfg.toLowerCase() === 'unspecified' || mfg.toLowerCase() === 'custom') return false
  // Heuristic: a real catalogue MPN has at least 4 alphanumeric chars
  // and isn't all-letters (which would suggest a category name like "BOLT").
  if (pn.length < 4) return false
  if (!/[0-9]/.test(pn)) return false
  return true
}

function trySmallCommodityFloor(ctx: PartContext, annualVolume: number): { unit_gbp: number; reason: string } | null {
  if (isFinishedCommodityVeto(ctx)) return null
  const name = String(ctx.word_name ?? '').replace(/\s+/g, '_').toLowerCase()
  for (const t of SMALL_COMMODITY_TIERS) {
    if (t.pattern.test(name)) {
      return { unit_gbp: smallCommodityPriceAtVolume(t, annualVolume), reason: t.reason }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Flash-Lite fallback price estimator — used ONLY when the classifier
// returned 'unknown'. New prompt is volume-aware (NOT scale-of-one).
// ---------------------------------------------------------------------------

async function estimatePriceForUnknown(
  ctx: PartContext,
  productClass: string,
  annualVolume: number,
): Promise<{ central: number; low: number; high: number; reasoning: string } | null> {
  const prompt = `You are a UK engineering procurement specialist. Estimate the unit price IN GBP for the part described below AT AN ANNUAL PRODUCTION VOLUME OF ${annualVolume.toLocaleString()} units per year. Use industry-standard component pricing benchmarks for that volume tier. This is NOT scale-of-one distributor pricing — it is the realistic at-volume OEM unit cost.

PART:
  name: ${ctx.word_name}
  module: ${ctx.module}
  sub-module: ${ctx.sub_module_id}
  manufacturer: ${ctx.manufacturer ?? 'unspecified'}
  part number: ${ctx.part_number ?? 'unspecified'}
  context (product type): ${productClass}
  annual production volume: ${annualVolume.toLocaleString()} units/yr
  ${ctx.description ? `description: ${ctx.description.slice(0, 500)}` : ''}

Return ONLY a JSON object (no prose, no code fence):
{"price_estimate_gbp": <central estimate at the given volume>, "estimate_low_gbp": <low end>, "estimate_high_gbp": <high end>, "reasoning": "<one short sentence explaining your reasoning, including the volume tier's effect on pricing>"}

Guidance:
- At 100,000+/yr the part should price near commodity / OEM contract price (often 30-200x cheaper than 1-off distributor price for ICs, plastics, fasteners).
- At 1,000/yr expect distributor-discounted pricing.
- At 100/yr or below distributor 1-off rates apply.
- estimate_low_gbp and estimate_high_gbp bracket a plausible range.
- Use industry knowledge — don't return 0.`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS price estimator (unknown class fallback)',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    })
    if (!res.ok) return null
    const j: any = await res.json()
    const text: string = j.choices?.[0]?.message?.content ?? ''
    const jsonMatch = text.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    const central = Number(parsed.price_estimate_gbp)
    const low = Number(parsed.estimate_low_gbp ?? central * 0.7)
    const high = Number(parsed.estimate_high_gbp ?? central * 1.3)
    if (!Number.isFinite(central) || central <= 0) return null
    return {
      central,
      low: Number.isFinite(low) && low > 0 ? low : central * 0.7,
      high: Number.isFinite(high) && high > 0 ? high : central * 1.3,
      reasoning: String(parsed.reasoning ?? '').trim(),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Pure compute — no LLM. Given a class + volume, return the curve-anchored
// unit cost in GBP. Quantity uncertainty handled by ±25% low/high bracket.
// ---------------------------------------------------------------------------

function curveEstimateFor(
  cls: ComponentClass,
  annualVolume: number,
  productClassSlug?: string | null,
): { central: number; low: number; high: number; multiplier: number; reference: number; floored?: boolean } {
  const c = COMPONENT_CURVES[cls]
  // Engine B (2026-05-18 BESS investigation): the reference unit cost can be
  // overridden per (product_class, component_class) so industrial-heavy hosts
  // (e.g. utility BESS using 280 Ah LFP prismatics + £100k PCS oem_subsystems)
  // don't get under-priced by the median-part anchor. See
  // PRODUCT_CLASS_REFERENCE_OVERRIDES in component-classes.ts for the table
  // and rationale. The curve shape (volume multiplier) is unchanged — only
  // the magnitude anchor shifts.
  const ref = referenceUnitCostFor(cls, productClassSlug)
  const m = interpolateCurve(c.curve, annualVolume)
  const raw = ref * m
  // 2026-05-20 iter-8 council fix A: floor clamp. VF iter-7 BoM showed
  // catastrophic under-pricing — 40ft ISO container at £3.38, Osram LED panel
  // £0.38, Kingspan PIR £0.33, Pilz PNOZ S4 safety relay £0.03. Curve fallback
  // produced impossibly low values when ref was small and multiplier was tiny.
  // Engineering sanity floor per component class (universal — applies to every
  // product) clamps the curve so it can't produce values that would suggest
  // misclassification rather than real economy. Curve can still go ABOVE the
  // floor for low-volume / high-margin cases. See COMPONENT_CLASS_FLOORS_GBP
  // in component-classes.ts for the table.
  const floor = componentClassFloorGbp(cls)
  const floored = floor > 0 && raw < floor
  const central = floored ? floor : raw
  return {
    central: round2(central),
    low: round2(central * 0.7),
    high: round2(central * 1.3),
    multiplier: m,
    reference: ref,
    floored,
  }
}

function round2(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function logCost(line: string) {
  appendFileSync(COST_LOG, `${new Date().toISOString()} | ${line}\n`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const statePath = resolve(args[0])
  const write = args.includes('--write')
  const volumeOverride = (() => {
    const i = args.indexOf('--volume')
    if (i >= 0 && args[i + 1]) {
      const n = parseInt(args[i + 1], 10)
      if (Number.isFinite(n) && n > 0) return n
    }
    return null
  })()
  if (!existsSync(statePath)) {
    console.error(`State not found: ${statePath}`)
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const productClass = getProductClassSlug(state)
  const { volume: annualVolume, source: volumeSource } = resolveAnnualVolume(
    state,
    productClass,
    volumeOverride,
  )
  console.log(`[estimate] product_class=${productClass} annual_volume=${annualVolume.toLocaleString()} (${volumeSource})`)

  // Build verificationByCompoundId index.
  // 2026-05-19 fix C1 (audit-found data-corruption bug): previously keyed by
  // bare `w.id` (`'housing'`, `'sensor'`, `'controller'`, etc.). Word IDs are
  // SCOPED per sub-module — different modules with the same word ID collide
  // and the second occurrence silently overwrites the first. Compound key
  // `{module}::{sub_module_id}::{word_id}` makes every BoM line uniquely
  // addressable. Legacy state files that wrote rows without module/sub_module_id
  // also fall back to bare word_id so we don't break them.
  state.partVerifications = state.partVerifications ?? []
  const compoundKey = (module: string | null | undefined, subModuleId: string | null | undefined, wordId: string | null | undefined): string =>
    `${module ?? ''}::${subModuleId ?? ''}::${wordId ?? ''}`
  const verifByCompoundId = new Map<string, any>()
  const verifByLegacyWordId = new Map<string, any>()  // fallback for old rows
  for (const v of state.partVerifications) {
    if (v.word_id) {
      if (v.module && v.sub_module_id) {
        verifByCompoundId.set(compoundKey(v.module, v.sub_module_id, v.word_id), v)
      } else {
        verifByLegacyWordId.set(v.word_id, v)
      }
    }
  }

  // Collect all targets that need estimates
  const targets: PartContext[] = []
  for (const m of state.moduleDecomposition?.modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const existing = verifByCompoundId.get(compoundKey(m.module, sm.id, w.id)) ?? verifByLegacyWordId.get(w.id)
        if (existing?.distributor_price_gbp != null) continue
        if (existing?.price_estimate_gbp != null) continue
        const qmod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'quantity')
        let qty = 1
        if (qmod) {
          const numStr = String(qmod.value).replace(/[×x,\s]/g, '')
          const n = parseInt(numStr, 10)
          if (Number.isFinite(n) && n > 0) qty = n
        }
        const mfgMod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'manufacturer')
        const pnMod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'part_number')
        targets.push({
          word_id: w.id,
          word_name: w.name_human || w.id,
          module: m.module,
          sub_module_id: sm.id,
          manufacturer: existing?.manufacturer ?? (mfgMod ? String(mfgMod.value) : null),
          part_number: existing?.part_number ?? (pnMod ? String(pnMod.value) : null),
          description: existing?.reasoning ?? null,
          quantity: qty,
        })
      }
    }
  }

  console.log(`[estimate] ${targets.length} parts need price estimates`)
  if (targets.length === 0) {
    console.log('[estimate] nothing to do')
    return
  }

  // -------------------------------------------------------------------------
  // Step 1 — corpus classification pass. Free, sub-millisecond per lookup.
  // -------------------------------------------------------------------------
  const corpus = new CorpusClassifier()
  const classByWordId = new Map<string, ComponentClass | 'unknown'>()
  const classSource = new Map<string, 'corpus' | 'flash_lite' | 'fallback'>()
  const needsClassify: PartContext[] = []

  for (const ctx of targets) {
    const cls = corpus.lookup(ctx.word_name)
    if (cls && cls !== 'unknown') {
      classByWordId.set(ctx.word_id, cls)
      classSource.set(ctx.word_id, 'corpus')
    } else {
      needsClassify.push(ctx)
    }
  }
  console.log(
    `[estimate] corpus-classified ${classByWordId.size}/${targets.length}; ${needsClassify.length} need Flash-Lite`,
  )

  // -------------------------------------------------------------------------
  // Step 2 — on-the-fly classify remaining via Flash-Lite (batches of 20).
  // -------------------------------------------------------------------------
  const BATCH = 20
  const batches: Array<Array<{ ctx: PartContext }>> = []
  for (let i = 0; i < needsClassify.length; i += BATCH) {
    batches.push(needsClassify.slice(i, i + BATCH).map((ctx) => ({ ctx })))
  }
  if (batches.length > 0) {
    let done = 0
    await new Promise<void>((resolveAll) => {
      let inFlight = 0
      let nextIdx = 0
      const tick = () => {
        while (inFlight < CONCURRENCY && nextIdx < batches.length) {
          const batch = batches[nextIdx++]
          inFlight += 1
          classifyOnTheFly(batch).then((map) => {
            for (const [wid, cls] of map.entries()) {
              classByWordId.set(wid, cls)
              classSource.set(wid, 'flash_lite')
            }
            done += 1
            inFlight -= 1
            if (done === batches.length) resolveAll()
            else tick()
          })
        }
      }
      tick()
    })
    console.log(`[estimate] Flash-Lite classified ${batches.length} batches`)
  }

  // Any targets that still don't have a class get 'unknown' fallback.
  for (const ctx of targets) {
    if (!classByWordId.has(ctx.word_id)) {
      classByWordId.set(ctx.word_id, 'unknown')
      classSource.set(ctx.word_id, 'fallback')
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — compute estimates. For known classes use the curve (free).
  // For 'unknown' classes use Flash-Lite with the new volume-aware prompt.
  // -------------------------------------------------------------------------
  const results: Array<{ ctx: PartContext; estimate: PriceEstimate | null }> = []
  const unknowns: PartContext[] = []

  let finishedCommodityCount = 0
  for (const ctx of targets) {
    const cls = classByWordId.get(ctx.word_id)!
    if (cls === 'unknown') {
      unknowns.push(ctx)
      continue
    }
    const c = curveEstimateFor(cls, annualVolume, productClass)
    // ITER-10.5 Sprint 1A (Tristan 2026-05-20): finished commodities
    // (catalogue items bought from a real manufacturer — CIMC container,
    // Copeland compressor, Bosch Rexroth rail) skip the production-scale
    // curve discount. They're priced at retail catalogue, not at our
    // 1000-unit fab volume. Universal across every product class.
    const finished = isFinishedCommodity(ctx)
    const finalCentral = finished ? c.reference : c.central
    const finalLow = finished ? round2(c.reference * 0.7) : c.low
    const finalHigh = finished ? round2(c.reference * 1.3) : c.high
    const finalMultiplier = finished ? 1.0 : c.multiplier
    if (finished) finishedCommodityCount += 1
    results.push({
      ctx,
      estimate: {
        price_estimate_gbp: finalCentral,
        estimate_low_gbp: finalLow,
        estimate_high_gbp: finalHigh,
        reasoning: finished
          ? `Engine B finished-commodity: class=${cls}, manufacturer=${ctx.manufacturer}, SKU=${ctx.part_number}, reference £${c.reference} (no production-scale discount applied — catalogue item)`
          : `Engine B curve: class=${cls}, annual_volume=${annualVolume.toLocaleString()}, reference £${c.reference}, multiplier ${c.multiplier.toFixed(3)} → £${c.central}`,
        component_class: cls,
        curve_multiplier: finalMultiplier,
        reference_unit_cost_gbp: c.reference,
        annual_volume: annualVolume,
        classification_source: classSource.get(ctx.word_id)!,
        estimate_source: 'curve',
      },
    })
  }
  if (finishedCommodityCount > 0) {
    console.log(`[estimate] ${finishedCommodityCount} parts identified as finished commodities — curve discount skipped (priced at reference)`)
  }

  // Flash-Lite for unknowns (concurrency 8).
  if (unknowns.length > 0) {
    console.log(`[estimate] Flash-Lite (volume-aware) for ${unknowns.length} 'unknown' parts`)
    let done = 0
    await new Promise<void>((resolveAll) => {
      let inFlight = 0
      let nextIdx = 0
      const tick = () => {
        while (inFlight < CONCURRENCY && nextIdx < unknowns.length) {
          const ctx = unknowns[nextIdx++]
          inFlight += 1
          // 2026-05-21 (Tristan BESS forensic): small-commodity keyword
          // pre-filter. If the part name matches a known small-commodity
          // tier (fastener, tap wire, small bracket, cable clip, etc.),
          // skip the Flash-Lite call entirely and use the deterministic
          // floor. Saves an LLM call and prevents Flash-Lite from
          // returning £128 for what should be a £2 wire. Cost Repair
          // can still correct upward later if a real high-priced item
          // matched the pattern.
          const smallFloor = trySmallCommodityFloor(ctx, annualVolume)
          if (smallFloor) {
            results.push({
              ctx,
              estimate: {
                price_estimate_gbp: round2(smallFloor.unit_gbp),
                estimate_low_gbp: round2(smallFloor.unit_gbp * 0.5),
                estimate_high_gbp: round2(smallFloor.unit_gbp * 2),
                reasoning: `Engine B small-commodity pre-filter: ${smallFloor.reason}`,
                component_class: 'unknown',
                curve_multiplier: 0,
                reference_unit_cost_gbp: 0,
                annual_volume: annualVolume,
                classification_source: classSource.get(ctx.word_id)!,
                estimate_source: 'flash_lite_unknown_class',
              },
            })
            done += 1
            inFlight -= 1
            if (done === unknowns.length) resolveAll()
            else tick()
            continue
          }
          estimatePriceForUnknown(ctx, productClass, annualVolume).then((e) => {
            if (e) {
              results.push({
                ctx,
                estimate: {
                  price_estimate_gbp: round2(e.central),
                  estimate_low_gbp: round2(e.low),
                  estimate_high_gbp: round2(e.high),
                  reasoning: `Engine B fallback (unknown class): ${e.reasoning}`,
                  component_class: 'unknown',
                  curve_multiplier: 0,
                  reference_unit_cost_gbp: 0,
                  annual_volume: annualVolume,
                  classification_source: classSource.get(ctx.word_id)!,
                  estimate_source: 'flash_lite_unknown_class',
                },
              })
            } else {
              results.push({ ctx, estimate: null })
            }
            done += 1
            inFlight -= 1
            if (done === unknowns.length) resolveAll()
            else tick()
          })
        }
      }
      tick()
    })
  }

  corpus.close()

  // -------------------------------------------------------------------------
  // Step 4 — write back into state.partVerifications.
  // -------------------------------------------------------------------------
  let updated = 0
  let synthesised = 0
  let bySource = { corpus: 0, flash_lite: 0, fallback: 0 }
  let byEstimate = { curve: 0, flash_lite_unknown_class: 0 }
  const classCounts: Record<string, number> = {}

  for (const { ctx, estimate } of results) {
    if (!estimate) continue
    // 2026-05-19 fix C1: lookup by compound key (module::sub_module::word) with
    // legacy bare word_id as fallback. Prevents cross-module overwrite.
    const existing = verifByCompoundId.get(compoundKey(ctx.module, ctx.sub_module_id, ctx.word_id))
      ?? verifByLegacyWordId.get(ctx.word_id)
    bySource[estimate.classification_source]! += 1
    byEstimate[estimate.estimate_source]! += 1
    classCounts[estimate.component_class] = (classCounts[estimate.component_class] || 0) + 1

    const enriched = {
      price_estimate_gbp: estimate.price_estimate_gbp,
      price_estimate_low_gbp: estimate.estimate_low_gbp,
      price_estimate_high_gbp: estimate.estimate_high_gbp,
      price_estimate_reasoning: estimate.reasoning,
      price_estimate_model: estimate.estimate_source === 'curve'
        ? 'engine-b-curve'
        : 'google/gemini-3.1-flash-lite-preview',
      // Engine B attribution columns (new).
      engine_b_component_class: estimate.component_class,
      engine_b_curve_multiplier: estimate.curve_multiplier,
      engine_b_reference_unit_cost_gbp: estimate.reference_unit_cost_gbp,
      engine_b_annual_volume: estimate.annual_volume,
      engine_b_classification_source: estimate.classification_source,
      engine_b_estimate_source: estimate.estimate_source,
    }

    if (existing) {
      Object.assign(existing, enriched)
      updated += 1
    } else {
      state.partVerifications.push({
        id: `${ctx.module}::${ctx.sub_module_id}::${ctx.word_id}`,
        module: ctx.module,
        sub_module_id: ctx.sub_module_id,
        word_id: ctx.word_id,
        word_name: ctx.word_name,
        manufacturer: ctx.manufacturer,
        part_number: ctx.part_number,
        status: 'uncertain',
        confidence: 'low',
        reasoning: estimate.reasoning,
        source_method: 'estimate',
        generated_at: new Date().toISOString(),
        generated_by: 'estimate-missing-prices.tsx (Engine B)',
        ...enriched,
      })
      synthesised += 1
    }
  }

  const noEstimate = results.filter((r) => !r.estimate).length
  console.log(
    `[estimate] updated ${updated} existing, synthesised ${synthesised} new, ${noEstimate} failed`,
  )
  console.log(`[estimate] classification source: corpus=${bySource.corpus} flash_lite=${bySource.flash_lite} fallback=${bySource.fallback}`)
  console.log(`[estimate] estimate source: curve=${byEstimate.curve} flash_lite_unknown=${byEstimate.flash_lite_unknown_class}`)
  const top = Object.entries(classCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log('[estimate] top classes in BoM:')
  for (const [k, v] of top) console.log(`  ${k}: ${v}`)

  // Engine B cost: ~£0.0003 per Flash-Lite classify batch + ~£0.0006 per
  // unknown-class fallback. Rough estimate.
  const classifyBatchCost = batches.length * 0.0003
  const unknownFallbackCost = unknowns.length * 0.0006
  const totalGbp = (classifyBatchCost + unknownFallbackCost) * 0.78
  logCost(`estimate-missing-prices | ${targets.length} parts, ${results.length} results, ${updated + synthesised} written | est GBP ${totalGbp.toFixed(3)}`)
  console.log(`[estimate] estimated cost: GBP ${totalGbp.toFixed(3)}`)

  if (write) {
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[estimate] wrote → ${statePath}`)
  } else {
    console.log('[estimate] dry run; pass --write to persist')
  }
}

main().catch((err) => {
  console.error('[estimate] fatal:', err)
  process.exit(1)
})
