// word-domain-coherence-audit.ts
//
// THE WORD-LEVEL DOMAIN COHERENCE GATE — the WORD sibling of gate 34
// (tool-archetype-coherence-audit.ts). Gate 34 catches a wrong-domain TOOL
// leaking its worked-calc into the dossier (a marine hull-collapse calc on a
// CO₂ plant, a hydroponic nutrient-dosing calc on a fish farm). This gate
// catches the same class of bug ONE LEVEL LOWER: a wrong-domain PART/WORD
// leaking straight into the module tree with no tool involved at all.
//
// EXTENDED 2026-07-12 (the Open Colorimeter BESS-template benchmark, CORE FIX
// PRINCIPLE). Running a portable colorimeter/photometer brief through the
// generic emitter (no registered class emitter for `pcb_assembly`), the
// TIER_C_FLOOR generic-component fallback in `generic/derive-skeleton.ts`
// filled every under-populated universal module with its default component
// set — which for `energy_storage_source` / `energy_conversion_transduction`
// / `control_compute_communication` is a BESS/industrial-power template
// (storage cell, cell module assembly, module rack, dc busbar, inverter
// bridge, dc link capacitor, gate driver, i/o module, communication gateway).
// The engine's TOOL layer had already run the CORRECT optical tools for this
// brief (`photodiode-tia:gain-sizing`, `cuvette:sample-volume`,
// `photometry:stray-light-limit`, `wearable-battery:life`, …) and their
// quantities were sitting right there in `orchestratorContract.quantities` —
// but the generic-emitter's static per-module floor never consulted them, so
// the design shipped a battery-storage BoM with NOTHING optical in it.
//
// TWO complementary, fully universal (no per-product/per-class table)
// mechanisms close this, both keyed on the SELECTED TOOLS' own identity
// (never a product name):
//
//   (B-strip) `INDUSTRIAL_POWER_MARKERS` — suppress on device-scale designs
//   that are NOT a BESS/energy-storage class. Colorimeter (`pcb_assembly`)
//   device-scale → strip BESS template words. Residential wall ESS is ALSO
//   device-scale by volume (<1 m³) but IS a process-plant class (`bess` /
//   `energy_storage`) — industrial_power vocabulary (contactor, busbar,
//   module rack) MUST stay; only process-plant VESSEL markers still strip.
//   (2026-07-15: powerwall-0446 enforcing stripped 19 legitimate pack/PCS
//   words because volume<1 treated wall ESS like a colorimeter.)
//
//   (A/B-add) `TOOL_IMPLIED_COMPONENTS` — a tool-IDENTITY-keyed (never
//   product-keyed) map from a selected tool's own id/name to the physical
//   component(s) it implies (a `photodiode-tia` tool always implies an optical
//   detector module / breakout, on ANY future archetype that ever selects it;
//   a `cuvette` tool always implies a sample-cell holder; a
//   `wearable-battery` tool always implies a small battery + charge-
//   management circuit). `computeToolImpliedComponents` reads the run's own
//   selected-tool list (`state.toolsUsedPage.tools`) and, for every implied
//   component NOT already present anywhere in the design, reports it as
//   missing; `addImpliedWords` grounds the design by adding a minimal, honest
//   BoM word for it (same 4-modifier shape as the generic emitter's own
//   `componentWord()` — quantity / form / part_number TBD / lifecycle). A
//   design that already carries the part, or a tool this table doesn't yet
//   recognise, is left untouched — additive-only, never fabricates a claim.
//
// Both passes are wired from the SAME chain call site (right after the
// generic emitter emits `design`, before the Physics Critic) and share the
// SAME `WORD_DOMAIN_COHERENCE_ENFORCING` gate — one universal grounding step,
// two complementary directions (strip the unsupported, add the missing).
//
// WHY THIS EXISTS (the Open Colorimeter benchmark, 2026-07-12). Running a
// portable single-wavelength photometer brief through the chain, the LLM
// generator (Stage 1.7) appended a whole WATER-TREATMENT PRESSURE-SAND-FILTER
// VESSEL into the `hmi_ergonomics` (display/controls) module of a hand-held
// benchtop instrument. `4-generator.json` shows
// `modules[hmi_ergonomics].sub_modules[0].words` = [Display Panel, Status
// Indicator, Control Switch, Annunciator, Interface Membrane, **Pressure
// Vessel Shell, Filter Media / Membrane Elements, Upper Distribution Header,
// Lower Underdrain / Nozzle Plate, Backwash / Service Valve Nest,
// Differential-Pressure Gauges, Air Scour / Vent, Sample Cock, Skid Frame &
// Pipework**, Nameplate]. Words 0-4 + the Nameplate are correct HMI parts;
// the bolded run is wrong-domain large-process-vessel pollution. The class
// auto-detected as `pcb_assembly` (the generic path — no class-reference-graph
// for this archetype), so the generator had no in-class skeleton to anchor on
// and hallucinated a stand-in from a completely different physical scale. The
// Physics Critic caught it and gate 33 blocked (exit 33), killing the run —
// but there was no pass that STRIPS the pollution so a clean run could ship.
//
// THIS GATE makes the strip DETERMINISTIC + CLASS-CONDITIONAL, mirroring gate
// 34's philosophy exactly: a curated `PROCESS_PLANT_VESSEL_MARKERS` vocabulary
// (pressure vessel shell, filter media / membrane element, underdrain / nozzle
// plate, backwash, air scour, skid frame & pipework, distribution header in
// the vessel sense, valve nest, clarifier, sludge, decanter, launder, weir,
// differential-pressure gauge, sample cock — vocabulary that CANNOT belong to
// a hand-held/benchtop/wall device) is scanned against every emitted word's
// name. On a DEVICE-SCALE design (small enclosure volume, or a product class
// that is not a genuine process/plant archetype) a hit is a WORD-LEVEL
// wrongness — a stand-in the generator reached for when it had no in-class
// skeleton. On a genuine process plant (water treatment, RAS, CO₂/e-fuel,
// utility-container BESS, chemical plant, …) the SAME words are legitimate and
// never fire — mirrors `isMarineClass` / `isHydroponicClass` via a new
// `isProcessPlantClass()` predicate built on gate 34's exported
// `classMatchesTokens()` matcher (no divergent copy).
//
// SHADOW by default (records `state.wordDomainCoherence`, logs the flagged
// words, NEVER strips): enforcing is opt-in via `WORD_DOMAIN_COHERENCE_ENFORCING`
// (off/0/false/no/shadow→off; anything truthy→on). The chain wiring defaults
// this ON (the pollution MUST be removed before it reaches the Physics Critic
// / BoM / render), but the pure functions here support both directions so the
// module is independently unit-testable. Pure + deterministic (no LLM) —
// `computeWordDomainCoherence` / `stripFlaggedWords` /
// `wordDomainCoherenceEnforceModeFromEnv` / `isProcessPlantClass` /
// `isDeviceScaleDesign` / `scanWordTextForVesselMarkers` are unit-testable
// directly. This gate never exits the chain — it only flags + (when enforcing)
// strips; the physics critic (gate 33) remains the only hard-stop for a
// design that still has a wrong-domain part after this pass runs.

import { classMatchesTokens, inferProductClass, type DomainMarker } from './tool-archetype-coherence-audit'

export { inferProductClass }

// ---------------------------------------------------------------------------
// Marker vocabulary (curated — the large-process-vessel / water-treatment-skid
// vocabulary a device-scale product must never present as a BoM word)
// ---------------------------------------------------------------------------

/**
 * PROCESS_PLANT_VESSEL_MARKERS — the unmistakable large-process-vessel /
 * water-treatment-skid vocabulary. Every one of these is a LEGITIMATE part
 * name on a genuine process plant (a water-treatment sand filter really does
 * have a pressure vessel shell, an underdrain, a backwash valve nest) and a
 * DOMAIN ERROR on anything that lives on a bench or in a hand. Kept
 * conservative: only tokens that CANNOT belong to a hand-held/benchtop/wall
 * device. Word-boundaried so a bare substring never over-matches (e.g.
 * "launder" must not match inside "launderette").
 */
export const PROCESS_PLANT_VESSEL_MARKERS: DomainMarker[] = [
  { id: 'pressure vessel shell', re: /\bpressure\s+vessel(?:\s+shell)?\b/ },
  { id: 'filter media / membrane element', re: /\bfilter\s+media\b|\bmembrane\s+elements?\b/ },
  { id: 'underdrain / nozzle plate', re: /\bunderdrains?\b|\bnozzle\s+plate\b/ },
  { id: 'backwash', re: /\bbackwash\b/ },
  { id: 'air scour', re: /\bair\s+scour\b/ },
  { id: 'skid frame & pipework', re: /\bskid\s+frame\b|\bskid\s*(?:&|and)\s*pipework\b/ },
  { id: 'distribution header (vessel)', re: /\b(?:upper|lower)\s+distribution\s+header\b/ },
  { id: 'valve nest', re: /\bvalve\s+nest\b/ },
  { id: 'clarifier', re: /\bclarifiers?\b/ },
  { id: 'sludge', re: /\bsludge\b/ },
  { id: 'decanter', re: /\bdecanters?\b/ },
  { id: 'launder', re: /\blaunders?\b/ },
  { id: 'weir', re: /\bweirs?\b/ },
  { id: 'differential-pressure gauge', re: /\bdifferential[-\s]?pressure\s+gauges?\b/ },
  { id: 'sample cock', re: /\bsample\s+cocks?\b/ },
]

/**
 * INDUSTRIAL_POWER_MARKERS — the unmistakable BESS / industrial-power-
 * electronics vocabulary (Open Colorimeter benchmark, 2026-07-12). Every one
 * of these is a LEGITIMATE part name on a genuine BESS / grid-power / process
 * plant (see PROCESS_PLANT_CLASS_TOKENS below — it already lists `bess` /
 * `battery_storage` / `energy_storage` / `utility_bess`) and a DOMAIN ERROR
 * on a hand-held/benchtop/wall device with no power-conversion or energy-
 * storage duty. Kept conservative (mirrors PROCESS_PLANT_VESSEL_MARKERS'
 * restraint): only tokens that CANNOT belong to a small instrument's own
 * incidental power supply — e.g. `power_converter` / `voltage_sensor` /
 * `current_sensor` are deliberately EXCLUDED (a small device legitimately has
 * a DC-DC converter or a current-sense resistor; those are not flagged).
 * Word-boundaried throughout.
 */
export const INDUSTRIAL_POWER_MARKERS: DomainMarker[] = [
  { id: 'inverter bridge', re: /\binverter\s+bridges?\b/ },
  { id: 'dc link capacitor', re: /\bdc\s+link\s+capacitors?\b/ },
  { id: 'dc busbar', re: /\bdc\s+busbars?\b/ },
  { id: 'storage cell', re: /\bstorage\s+cells?\b/ },
  { id: 'cell module assembly', re: /\bcell\s+module\s+assembl(?:y|ies)\b/ },
  { id: 'module rack', re: /\bmodule\s+racks?\b/ },
  { id: 'cell monitoring unit', re: /\bcell\s+monitoring\s+units?\b/ },
  { id: 'gate driver', re: /\bgate\s+drivers?\b/ },
  { id: 'i/o module', re: /\bi\s*\/\s*o\s+modules?\b/ },
  { id: 'plc', re: /\bplcs?\b/ },
  { id: 'contactor', re: /\bcontactors?\b/ },
  { id: 'switchgear', re: /\bswitchgears?\b/ },
  { id: 'communication gateway', re: /\bcommunication\s+gateways?\b/ },
  // INTENT (2026-07-15 NinjaPCR): plant HVAC / LV incomer vocabulary is as
  // wrong on a benchtop thermocycler as inverter bridges on a photometer.
  // Skeleton floors used to mint "Chiller Unit" + "Scroll Compressor" +
  // "Mains Incomer" from the plant thermal/energy defaults — strip them when
  // the design is device-scale.
  { id: 'chiller unit', re: /\bchiller\s+units?\b|\bscroll\s+compressors?\b|\bpackaged\s+chillers?\b/ },
  { id: 'mains incomer', re: /\bmains\s+incomers?\b|\bdistribution\s+transformers?\b|\bmain\s+switchboards?\b/ },
  { id: 'lv acb incomer', re: /\b(?:lv\s+)?incomers?\b|\bacb\s+frames?\b|\b400\s*v\s+3[-\s]?phase\b/ },
]

// ---------------------------------------------------------------------------
// Class inference — is the product class a genuine process/plant archetype?
// ---------------------------------------------------------------------------

/**
 * PROCESS_PLANT_CLASS_TOKENS — classes that LEGITIMATELY use the process-
 * plant vessel vocabulary above (a water-treatment plant genuinely has a
 * pressure-vessel sand filter with an underdrain and backwash valve nest; a
 * utility-container BESS genuinely has a skid frame). Word-boundaried token
 * match via gate 34's `classMatchesTokens` (shared matcher, no divergent
 * copy). Deliberately does NOT include `bess_residential` (a Powerwall-class
 * sealed-enclosure device) — residential BESS is disambiguated from utility
 * BESS by the SCALE signal (`isDeviceScaleDesign`'s enclosure-volume check),
 * not by slug, matching the rest of the engine's scale-aware BESS handling.
 */
const PROCESS_PLANT_CLASS_TOKENS = [
  // water / fluid treatment & handling
  'water_treatment', 'water_treatment_plant', 'water_purification', 'water_handling',
  'wastewater', 'waste_water', 'effluent_treatment', 'sewage_treatment', 'sewage',
  'desalination', 'desal', 'reverse_osmosis', 'reverse_osmosis_plant', 'ro_plant',
  'fertigation', 'irrigation', 'irrigation_plant', 'irrigation_system', 'ebb_flow',
  // aquaculture / recirculating aquaculture systems
  'aquaculture', 'aquaculture_ras', 'ras', 'recirculating_aquaculture',
  'recirculating_aquaculture_system', 'mariculture', 'fish_farm', 'fishfarm', 'hatchery',
  // CO2 capture / mineralisation / e-fuel synthesis (process columns + skids)
  'co2_mineralisation', 'co2_mineralization', 'co2_capture', 'carbon_capture',
  'amine_capture', 'dac', 'direct_air_capture',
  'e_fuel_synthesis', 'e_fuel', 'power_to_liquid', 'fischer_tropsch', 'ptl', 'saf', 'e_kerosene',
  // chemical / process plant
  'chemical_plant', 'process_plant', 'petrochemical', 'chemical_process',
  // BESS — utility-container scale genuinely uses skid/frame vocabulary
  // (residential is excluded — see comment above; disambiguated by SCALE).
  'bess', 'battery_storage', 'energy_storage', 'utility_bess', 'bess_utility',
  // other large process/skid plants that legitimately carry this vocabulary
  'biogas', 'anaerobic_digester', 'anaerobic_digestion', 'bioreactor', 'fermentation', 'fermenter',
  'brewery', 'distillery', 'dairy_processing', 'food_processing',
  'mineral_processing', 'mining', 'pulp_paper', 'pulp_and_paper',
]

/** Is this product class a genuine process/plant archetype (process-plant
 *  vessel vocabulary legitimate)? PURE. */
export function isProcessPlantClass(productClass: string): boolean {
  return classMatchesTokens(productClass, PROCESS_PLANT_CLASS_TOKENS)
}

// ---------------------------------------------------------------------------
// Scale inference — is the design DEVICE-SCALE (bench/hand-held/wall) rather
// than a process plant?
// ---------------------------------------------------------------------------

/** Read `orchestratorContract.quantities.enclosure_volume_m3.value` from state
 *  (the same field the BESS sealed-enclosure regime + drawing gates key on —
 *  see build_universal_scene.py / drawing_gates.py). Returns null when absent
 *  or not a finite number. PURE. */
export function getEnclosureVolumeM3(state: any): number | null {
  const raw = state?.orchestratorContract?.quantities?.enclosure_volume_m3?.value
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Is this design DEVICE-SCALE (a hand-held/benchtop/wall product, not a
 * process plant)? Fires true when EITHER signal says "small device":
 *   - `enclosure_volume_m3 < 1` (a physical-scale fact — even a class token
 *     that reads as a process plant must not shield a genuinely tiny unit;
 *     this is the override that keeps a sealed-enclosure residential BESS
 *     honest even though `bess` is in PROCESS_PLANT_CLASS_TOKENS), OR
 *   - the product class is NOT a genuine process/plant archetype (the
 *     colorimeter case — `pcb_assembly` is not in PROCESS_PLANT_CLASS_TOKENS,
 *     so it is device-scale regardless of whether volume data exists).
 * PURE.
 */
export function isDeviceScaleDesign(state: any): boolean {
  const productClass = inferProductClass(state)
  const vol = getEnclosureVolumeM3(state)
  if (vol !== null && vol < 1) return true
  return !isProcessPlantClass(productClass)
}

// ---------------------------------------------------------------------------
// Marker scanning over one word's text
// ---------------------------------------------------------------------------

/** Build the scannable text for one word: its own id, its name_human, its
 *  content_character.name_human, and the `form` modifier value (which the
 *  deterministic emitter/generator often echoes the name into, e.g. "Pressure
 *  Vessel Shell (assembly component)"). PURE. */
function wordText(w: any): string {
  const modifiers: any[] = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
  const formValue = modifiers.find((m) => m?.kind === 'form')?.value
  const parts = [w?.id, w?.name_human, w?.content_character?.name_human, formValue]
  return parts.filter((p) => p != null && p !== '').join(' | ')
}

/** Build the IDENTITY-only text for one word: id + name_human +
 *  content_character.name_human — deliberately EXCLUDES the `form` modifier.
 *  Used by the tool-implied-component PRESENCE check below, which must not be
 *  satisfied by loose prose (e.g. a "Voltage Sensor" word whose `form` text
 *  narrates "part of an optical sensing engine (photodiode + transimpedance
 *  amplifier)" from a downstream reviewer pass — that sensor is still not a
 *  dedicated photodiode word). The vessel/industrial-power STRIP scanners
 *  above deliberately keep `form` in scope (a genuinely polluted word's own
 *  name IS the marker, so including `form` there never causes a false
 *  positive) — this is a narrower, presence-only variant. PURE. */
function wordIdentityText(w: any): string {
  const parts = [w?.id, w?.name_human, w?.content_character?.name_human]
  return parts.filter((p) => p != null && p !== '').join(' | ')
}

/** Scan one word's text for every PROCESS_PLANT_VESSEL_MARKERS hit. Returns
 *  the distinct marker ids matched, in declaration order. PURE —
 *  case-insensitive via lower-casing once. */
export function scanWordTextForVesselMarkers(text: string): string[] {
  const lower = String(text ?? '').toLowerCase()
  if (!lower) return []
  const hits: string[] = []
  for (const m of PROCESS_PLANT_VESSEL_MARKERS) {
    if (m.re.test(lower)) hits.push(m.id)
  }
  return hits
}

/** Scan one word's text for every INDUSTRIAL_POWER_MARKERS hit. Same shape +
 *  case-insensitivity as scanWordTextForVesselMarkers — a SEPARATE function
 *  (not merged into it) so the vessel scanner stays byte-identical for its
 *  existing callers. PURE. */
export function scanWordTextForIndustrialPowerMarkers(text: string): string[] {
  const lower = String(text ?? '').toLowerCase()
  if (!lower) return []
  const hits: string[] = []
  for (const m of INDUSTRIAL_POWER_MARKERS) {
    if (m.re.test(lower)) hits.push(m.id)
  }
  return hits
}

/**
 * INTENT (2026-07-28 Formula E rear MGU): INDUSTRIAL_POWER_MARKERS correctly
 * strip BESS template pollution from a colorimeter — but a traction MCU
 * (SiC inverter + gate drivers + DC-link) IS industrial power electronics by
 * product duty. When the run's OWN selected tools + contract quantities show a
 * dedicated inverter stage, keep the inverter-duty marker subset and still
 * strip plant-HVAC / pack-storage pollution (chiller, scroll compressor,
 * storage cell, module rack, …). Tool-backed, never product-name keyed.
 */
const DEDICATED_INVERTER_TOOL_RE =
  /\binverter:(?:current-voltage-envelope|sic-loss|field-weakening-mtpa)\b/

/** Markers that are legitimate on a dedicated inverter / MCU stage. */
export const INVERTER_DUTY_POWER_MARKERS = new Set<string>([
  'inverter bridge',
  'dc link capacitor',
  'gate driver',
  'dc busbar',
  'contactor',
  'i/o module',
  'communication gateway',
])

/**
 * True when this run selected a dedicated inverter tool AND the contract
 * carries a positive DC-bus voltage with a power or phase-current duty.
 * PURE — never throws.
 */
export function hasDedicatedInverterDuty(state: any): boolean {
  const tools = selectedToolIdentities(state)
  const hasTool = tools.some((id) => DEDICATED_INVERTER_TOOL_RE.test(id))
  if (!hasTool) return false
  const q = state?.orchestratorContract?.quantities ?? {}
  const dcV = Number(q.dc_bus_voltage_v?.value ?? q.v_dc_max_v?.value ?? 0)
  const powerKw = Number(
    q.continuous_power_kw?.value
      ?? q.rear_axle_electrical_power_kw?.value
      ?? q.rated_power_kw?.value
      ?? 0,
  )
  const phaseA = Number(q.phase_current_max_a?.value ?? q.ac_rms_current_a?.value ?? 0)
  return dcV > 0 && (powerKw > 0 || phaseA > 0)
}

// ---------------------------------------------------------------------------
// The finding shape + the pure compute
// ---------------------------------------------------------------------------

export interface FlaggedWord {
  module_id: string
  sub_module_id: string
  word_id: string
  /** The word's human-readable name (for the log / punch-list). */
  name: string
  /** The first marker id that matched (from EITHER marker family). */
  marker: string
  /** Which marker vocabulary matched — lets a consumer distinguish a
   *  process-plant-vessel hit from an industrial-power hit without re-scanning.
   *  Defaults to 'process_plant_vessel' when omitted (back-compat with any
   *  caller built before this field existed). */
  marker_family?: 'process_plant_vessel' | 'industrial_power'
}

export type WordDomainCoherenceVerdict = 'pass' | 'flagged' | 'unavailable'

export interface WordDomainCoherenceResult {
  verdict: WordDomainCoherenceVerdict
  /** The inferred product class, lower-cased ('' if none). */
  product_class: string
  /** Whether the class was treated as a genuine process/plant archetype
   *  (process-plant vessel markers legitimate there — suppressed). */
  is_process_plant_class: boolean
  /** Whether the design was treated as device-scale (markers can fire). */
  is_device_scale: boolean
  /** enclosure_volume_m3 read from the contract, or null if absent. */
  enclosure_volume_m3: number | null
  /** One finding per offending word — deduped by (module, sub_module, word). */
  flagged: FlaggedWord[]
  /** Count of words scanned. */
  words_scanned: number
  /** Short verdict line for the log. */
  message: string
}

/**
 * PURE + deterministic. Given the chain state, infer the class + scale and
 * scan every word's name in `state.moduleDecomposition.modules` for
 * PROCESS_PLANT_VESSEL_MARKERS. On a device-scale design (see
 * `isDeviceScaleDesign`) each offending word yields a finding. A genuine
 * process plant (see `isProcessPlantClass`) at plant scale is SUPPRESSED —
 * the same words are legitimate there, so a water-treatment / RAS / e-fuel /
 * utility-BESS design is byte-identical after this gate runs.
 *
 * NEVER throws — a malformed/absent moduleDecomposition yields a clean
 * 'unavailable' result so this gate can never wedge the chain.
 */
export function computeWordDomainCoherence(state: any): WordDomainCoherenceResult {
  const productClass = inferProductClass(state)
  const isProcessPlant = isProcessPlantClass(productClass)
  const enclosureVolumeM3 = getEnclosureVolumeM3(state)
  const deviceScale = isDeviceScaleDesign(state)
  const hasInverterDuty = hasDedicatedInverterDuty(state)

  const base: WordDomainCoherenceResult = {
    verdict: 'pass',
    product_class: productClass,
    is_process_plant_class: isProcessPlant,
    is_device_scale: deviceScale,
    enclosure_volume_m3: enclosureVolumeM3,
    flagged: [],
    words_scanned: 0,
    message: '',
  }

  const modules: any[] = Array.isArray(state?.moduleDecomposition?.modules) ? state.moduleDecomposition.modules : []
  if (modules.length === 0) {
    return { ...base, verdict: 'unavailable', message: 'no moduleDecomposition.modules in state' }
  }

  const flagged: FlaggedWord[] = []
  let wordsScanned = 0

  for (const m of modules) {
    const moduleId = String(m?.module ?? '')
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? '')
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        wordsScanned++
        if (!deviceScale) continue // suppressed — a genuine plant-scale process class
        const text = wordText(w)
        const vesselHits = scanWordTextForVesselMarkers(text)
        // GOTCHA (2026-07-15 powerwall-0446): residential wall ESS is device-scale
        // (enclosure_volume_m3 ≈ 0.14 < 1) AND class `energy_storage` / `bess`.
        // INDUSTRIAL_POWER markers (contactor, dc busbar, module rack, CMU) are
        // LEGITIMATE on every BESS — only strip them from non-BESS devices
        // (colorimeter / pcb_assembly). Process-plant VESSEL markers still strip
        // on wall ESS (no sand-filter underdrain on a Powerwall).
        //
        // GOTCHA (2026-07-28 Formula E rear MGU): scan industrial markers against
        // IDENTITY text only — a controller whose `form` prose mentions "gate
        // drivers" must not be reclassified as a gate driver. When the run has a
        // dedicated inverter duty (tools + Vdc + power/current), keep the
        // inverter-duty marker subset; still strip chiller / pack-storage pollution.
        const industrialHits = isProcessPlant
          ? []
          : scanWordTextForIndustrialPowerMarkers(wordIdentityText(w))
              .filter((marker) => !(hasInverterDuty && INVERTER_DUTY_POWER_MARKERS.has(marker)))
        if (vesselHits.length === 0 && industrialHits.length === 0) continue
        const [marker, marker_family]: [string, 'process_plant_vessel' | 'industrial_power'] =
          vesselHits.length > 0 ? [vesselHits[0], 'process_plant_vessel'] : [industrialHits[0], 'industrial_power']
        flagged.push({
          module_id: moduleId,
          sub_module_id: subModuleId,
          word_id: String(w?.id ?? ''),
          name: String(w?.name_human ?? w?.id ?? ''),
          marker,
          marker_family,
        })
      }
    }
  }

  const verdict: WordDomainCoherenceVerdict = flagged.length > 0 ? 'flagged' : 'pass'
  const message =
    verdict === 'flagged'
      ? `${flagged.length} process-plant-vessel/industrial-power word(s) in device-scale "${productClass || 'unknown'}": ` +
        flagged.map((f) => `${f.module_id}/${f.sub_module_id}/${f.word_id}[${f.marker_family}:${f.marker}]`).join(', ')
      : isProcessPlant && !deviceScale
        ? `coherent — "${productClass}" is a genuine process-plant class, process-plant-vessel/industrial-power markers legitimate (${wordsScanned} words scanned)`
        : `coherent — no process-plant-vessel or industrial-power word markers in "${productClass || 'unknown'}" (${wordsScanned} words scanned)`

  return { ...base, verdict, flagged, words_scanned: wordsScanned, message }
}

// ---------------------------------------------------------------------------
// Stripping — pure, mutates a DEEP COPY of design, never the input
// ---------------------------------------------------------------------------

/**
 * Remove the flagged words from `design.modules[*].sub_modules[*].words`.
 * PURE: never mutates the input `design` — clones first (structuredClone
 * when available, else a JSON round-trip fallback), removes only the exact
 * (module_id, sub_module_id, word_id) triples named in `flagged`, and returns
 * the new design + how many were actually removed. A design with an empty
 * `flagged` list is returned untouched (same reference) — the CO₂/SAF
 * byte-identity guarantee: a clean design (no markers) is never touched.
 */
export function stripFlaggedWords(design: any, flagged: FlaggedWord[]): { design: any; stripped: number } {
  if (!design || !Array.isArray(flagged) || flagged.length === 0) return { design, stripped: 0 }
  const cloned: any = typeof structuredClone === 'function' ? structuredClone(design) : JSON.parse(JSON.stringify(design))
  const toStrip = new Set(flagged.map((f) => `${f.module_id}::${f.sub_module_id}::${f.word_id}`))
  let stripped = 0
  const modules: any[] = Array.isArray(cloned?.modules) ? cloned.modules : []
  for (const m of modules) {
    const moduleId = String(m?.module ?? '')
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? '')
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      const kept = words.filter((w: any) => {
        const key = `${moduleId}::${subModuleId}::${String(w?.id ?? '')}`
        if (toStrip.has(key)) { stripped++; return false }
        return true
      })
      if (kept.length !== words.length) sm.words = kept
    }
  }
  return { design: cloned, stripped }
}

// ---------------------------------------------------------------------------
// The pure enforcement decision (mirrors gates 31-34's shadow/enforcing idiom)
// ---------------------------------------------------------------------------

export type WordDomainCoherenceEnforceMode = 'off' | 'on'

/** Map WORD_DOMAIN_COHERENCE_ENFORCING to a mode. unset / 0 / false / off / no
 *  / shadow → off; anything else truthy (1 / true / on / enforce / enforcing)
 *  → on. Distinct from gates 31-34: this gate's default CHAIN WIRING sets the
 *  env var truthy (the pollution MUST be stripped before it reaches the
 *  Physics Critic / BoM / render), but the pure mode-mapper itself defaults
 *  OFF like every other gate so an unset env var never silently strips. */
export function wordDomainCoherenceEnforceModeFromEnv(v: string | undefined): WordDomainCoherenceEnforceMode {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no' || s === 'shadow') return 'off'
  return 'on'
}

export interface WordDomainCoherenceRunResult {
  result: WordDomainCoherenceResult
  mode: WordDomainCoherenceEnforceMode
  /** Set only when mode === 'on' AND result.flagged.length > 0 — the design
   *  with the flagged words removed, ready to replace the chain's `design`. */
  strip?: { design: any; stripped: number }
}

/** Convenience for the chain: compute + (when enforcing) strip in one call.
 *  Never exits/throws — this gate is additive-only (no chain exit code). */
export function runWordDomainCoherence(state: any, envValue?: string): WordDomainCoherenceRunResult {
  const result = computeWordDomainCoherence(state)
  const mode = wordDomainCoherenceEnforceModeFromEnv(envValue)
  if (mode === 'on' && result.flagged.length > 0) {
    const strip = stripFlaggedWords(state?.moduleDecomposition, result.flagged)
    return { result, mode, strip }
  }
  return { result, mode }
}

// ---------------------------------------------------------------------------
// TOOL-IMPLIED COMPONENT GROUNDING — the ADD-side complement to the strip
// pass above (Open Colorimeter benchmark, 2026-07-12). See the file-header
// comment for the full rationale.
// ---------------------------------------------------------------------------

/** One physical component a tool implies, and how to detect it is ALREADY
 *  present (so a re-run, or a design that already carries the part, is never
 *  double-added — idempotent). */
export interface ImpliedComponent {
  /** Target UniversalModule this component belongs in (per the same 12-
   *  module taxonomy every emitter uses — energy_storage_source,
   *  sensing_instrumentation, etc.). */
  module: string
  /** id-safe component noun — also used to build the new word's id. */
  component: string
  /** Human-readable display name for the new BoM word. */
  name_human: string
  /** Tested (case-insensitive) against the text of EVERY existing word in the
   *  design; a match means the component is already represented and nothing
   *  is added. */
  presence_re: RegExp
}

export interface ToolImpliedComponentRule {
  /** Id for logging/attribution (source_tool_id on the finding). */
  id: string
  /** Matched against a selected tool's own "<tool_id> <tool_name>" identity
   *  string, lower-cased. This is the ONLY signal — never a product/class
   *  check. A brand-new brief in ANY domain that happens to select a tool
   *  matching this rule gets the SAME implied components; a tool this table
   *  doesn't recognise implies nothing (graceful, additive-only). */
  re: RegExp
  implies: ImpliedComponent[]
}

/**
 * TOOL_IMPLIED_COMPONENTS — the tool-IDENTITY-keyed (never product-keyed)
 * grounding table. Each entry reads: "a tool whose id/name matches `re`
 * ALWAYS implies these physical components, regardless of what product
 * selected it." Seeded from the tool families the on-the-fly tool-creation
 * pass (`generic/tool-creation-pass.ts`) has generated so far; extending
 * coverage for a new tool family is a one-line addition here, never a
 * per-product branch.
 */
// OPTICAL/PHOTOMETRIC-INSTRUMENT tool rule ids — the subset of TOOL_IMPLIED_COMPONENTS
// below that mark a design as a genuine optical/photometric INSTRUMENT (never the
// generic 'wearable-battery' / 'control-systems' rules, which many non-optical
// device-scale products also legitimately select — a coin-cell wristband or a plain
// IoT sensor is not an optical instrument just because it has a battery and an MCU).
// Exported so derive-skeleton.ts's skeleton FLOOR (A1, the Open Colorimeter training
// run, 2026-07-12) keys off the EXACT SAME tool-identity signal as this file's own ADD
// backstop (A2) — one shared signal, never a duplicated list or a product/class check.
const OPTICAL_INSTRUMENT_TOOL_IDS = new Set(['photodiode-tia', 'cuvette', 'photometry', 'led-par'])

// INTENT (2026-07-15 NinjaPCR): solid-state PCR / thermocycler tool ids — the
// subset that marks a benchtop thermal-cycling INSTRUMENT (Peltier + sample
// block), never a plant chiller plant. Shared with derive-skeleton.ts floors.
const THERMOCYCLER_TOOL_IDS = new Set(['peltier', 'thermal-block', 'heatsink-forced'])

/** True when a single tool identity/id string (e.g. "photodiode-tia:gain-sizing" from
 *  contract._tools_run, or a lower-cased "<tool_id> <tool_name>" pair) matches an
 *  OPTICAL_INSTRUMENT_TOOL_IDS rule's own regex. PURE. */
export function isOpticalInstrumentToolIdentity(identity: string): boolean {
  const lower = String(identity ?? '').toLowerCase()
  return TOOL_IMPLIED_COMPONENTS.some((rule) => OPTICAL_INSTRUMENT_TOOL_IDS.has(rule.id) && rule.re.test(lower))
}

/** True when ANY of the given tool identity/id strings matches an optical-instrument
 *  tool rule — the UNIVERSAL "is this design a genuine optical/photometric instrument"
 *  signal, keyed on the SAME tool-identity vocabulary as the ADD backstop (never a
 *  product/class name). Accepts contract._tools_run (bare tool_id strings) directly, or
 *  any other list of tool identity strings. PURE, never throws on a malformed input. */
export function hasOpticalInstrumentToolSignal(identities: string[] | undefined | null): boolean {
  if (!Array.isArray(identities)) return false
  return identities.some((idy) => isOpticalInstrumentToolIdentity(idy))
}

/** True when a tool identity matches a thermocycler / solid-state TEC rule. PURE. */
export function isThermocyclerToolIdentity(identity: string): boolean {
  const lower = String(identity ?? '').toLowerCase()
  return TOOL_IMPLIED_COMPONENTS.some((rule) => THERMOCYCLER_TOOL_IDS.has(rule.id) && rule.re.test(lower))
}

/** True when ANY tool identity marks a PCR / thermocycler instrument (Peltier +
 *  sample-block tools). PURE — never a product-class name check. */
export function hasThermocyclerToolSignal(identities: string[] | undefined | null): boolean {
  if (!Array.isArray(identities)) return false
  return identities.some((idy) => isThermocyclerToolIdentity(idy))
}

export const TOOL_IMPLIED_COMPONENTS: ToolImpliedComponentRule[] = [
  {
    id: 'photodiode-tia',
    re: /\bphotodiode[-\s]?tia\b|\btransimpedance\b/,
    implies: [
      // INTENT: photodiode/TIA sizing tools prove an optical detector channel is
      // needed, but a small catalogue instrument should buy that channel as a
      // detector module/breakout unless a later schematic stage deliberately
      // decomposes it. This keeps COTS detector modules off the bespoke LED PCB.
      { module: 'sensing_instrumentation', component: 'optical_detector_module', name_human: 'Optical detector module / breakout', presence_re: /\b(?:optical\s+)?detector\s+(?:module|breakout|board|assembly)\b|\b(?:module|breakout|board|assembly)\b.{0,40}\b(?:optical\s+)?detector\b/i },
    ],
  },
  {
    id: 'cuvette',
    re: /\bcuvette\b/,
    implies: [
      { module: 'structure_containment', component: 'cuvette_holder', name_human: 'Cuvette / sample-cell holder', presence_re: /\bcuvette\b/i },
    ],
  },
  {
    id: 'photometry',
    re: /\bphotometry\b|\bstray[-\s]?light\b/,
    implies: [
      { module: 'energy_conversion_transduction', component: 'led_source', name_human: 'LED optical source', presence_re: /\bled\b/i },
      { module: 'energy_conversion_transduction', component: 'led_driver', name_human: 'LED constant-current driver circuit', presence_re: /\bled\b.*\bdriver\b|\bled[-\s]?driver\b/i },
      { module: 'structure_containment', component: 'optical_path_baffle', name_human: 'Light-tight optical path / baffle assembly', presence_re: /\boptical\s+path\b|\bbaffle\b/i },
    ],
  },
  {
    id: 'led-par',
    re: /\bled[-\s]?par\b/,
    implies: [
      { module: 'energy_conversion_transduction', component: 'led_source', name_human: 'LED source', presence_re: /\bled\b/i },
    ],
  },
  {
    id: 'wearable-battery',
    re: /\bwearable[-\s]?battery\b|\bcoin[-\s]?cell\b/,
    implies: [
      { module: 'energy_storage_source', component: 'coin_cell_battery', name_human: 'Coin-cell battery', presence_re: /\bcoin[-\s]?cell\b|\bbutton\s+cell\b/i },
      { module: 'power_distribution', component: 'battery_charge_management_circuit', name_human: 'Battery charge-management circuit', presence_re: /\bcharg(?:e|ing|er)\b/i },
    ],
  },
  {
    id: 'control-systems',
    re: /\bcontrol[-\s]?systems?\b|\bpid[-\s]?tuning\b/,
    implies: [
      { module: 'control_compute_communication', component: 'microcontroller', name_human: 'Microcontroller (MCU)', presence_re: /\bmicrocontroller\b|\bmcu\b/i },
      { module: 'control_compute_communication', component: 'usb_interface', name_human: 'USB data / firmware interface', presence_re: /\busb\b/i },
    ],
  },
  {
    id: 'peltier',
    re: /\bpeltier\b|\btec[-\s]?sizing\b|\bthermoelectric\b/,
    implies: [
      { module: 'environmental_interface', component: 'peltier_tec_module', name_human: 'Peltier TEC module', presence_re: /\bpeltier\b|\btec\b|\bthermoelectric\b/i },
      { module: 'environmental_interface', component: 'heatsink_fan_assembly', name_human: 'Heatsink + forced-air fan', presence_re: /\bheatsink\b|\bheat\s*sink\b/i },
    ],
  },
  {
    id: 'thermal-block',
    re: /\bthermal[-\s]?block\b|\bspreading[-\s]?resistance\b/,
    implies: [
      { module: 'structure_containment', component: 'aluminum_sample_block', name_human: 'Aluminum PCR sample block', presence_re: /\bsample\s+block\b|\baluminum\s+block\b|\bthermal\s+block\b/i },
    ],
  },
  {
    id: 'heatsink-forced',
    re: /\bheatsink:forced|\bforced[-\s]?convection\b/,
    implies: [
      { module: 'environmental_interface', component: 'heatsink_fan_assembly', name_human: 'Forced-convection heatsink assembly', presence_re: /\bheatsink\b|\bheat\s*sink\b|\bcooling\s+fan\b/i },
    ],
  },
]

/** A target module named by a rule may not exist in every design (the
 *  generic emitter only creates the modules its class-reference graph
 *  declared). FALLBACKS give the ADD pass a next-best home instead of
 *  silently dropping the finding; still additive-only (never invents a
 *  module) — if NONE of the fallback candidates exist, the item is left
 *  `resolved_module: null` and simply reported, never force-created. */
const MODULE_FALLBACKS: Record<string, string[]> = {
  power_distribution: ['power_distribution', 'energy_conversion_transduction', 'energy_storage_source'],
}

function resolveTargetModuleId(design: any, preferred: string): string | null {
  const modules: any[] = Array.isArray(design?.modules) ? design.modules : []
  const candidates = MODULE_FALLBACKS[preferred] ?? [preferred]
  for (const cand of candidates) {
    if (modules.some((m) => String(m?.module ?? '') === cand)) return cand
  }
  return null
}

/** Every distinct selected-tool identity string ("<tool_id> <tool_name>",
 *  lower-cased) available for THIS run. Prefers `state.toolsUsedPage.tools`
 *  (carries both id and human name — the richer signal); falls back to the
 *  raw `_tools_run` id list on the contract when the attribution page isn't
 *  threaded through. PURE, never throws. */
export function selectedToolIdentities(state: any): string[] {
  const out: string[] = []
  const pageTools: any[] = Array.isArray(state?.toolsUsedPage?.tools) ? state.toolsUsedPage.tools : []
  for (const t of pageTools) {
    out.push(`${String(t?.tool_id ?? '')} ${String(t?.tool_name ?? '')}`.toLowerCase())
  }
  if (out.length === 0) {
    const ran: any[] = Array.isArray(state?.orchestratorContract?._tools_run) ? state.orchestratorContract._tools_run : []
    for (const id of ran) out.push(String(id ?? '').toLowerCase())
  }
  return out
}

export interface MissingImpliedComponent extends ImpliedComponent {
  /** Which TOOL_IMPLIED_COMPONENTS rule id produced this finding. */
  source_tool_id: string
  /** The module id actually resolved for this item (may differ from
   *  `module` via MODULE_FALLBACKS); null when no candidate module exists in
   *  this design — the finding still surfaces, but addImpliedWords skips it. */
  resolved_module: string | null
}

export interface ToolImpliedComponentResult {
  verdict: 'pass' | 'missing' | 'unavailable'
  /** Every selected-tool identity string checked (diagnostic). */
  tools_checked: string[]
  missing: MissingImpliedComponent[]
  message: string
}

/**
 * PURE + deterministic. For every TOOL_IMPLIED_COMPONENTS rule whose regex
 * matches a selected-tool identity, checks whether each implied component is
 * already present ANYWHERE in the design (its `presence_re` tested against
 * every word's text); anything absent is reported as missing, with its
 * resolved target module. NEVER throws — no selected tools or no
 * moduleDecomposition yields a clean 'unavailable' result.
 */
export function computeToolImpliedComponents(state: any): ToolImpliedComponentResult {
  const identities = selectedToolIdentities(state)
  const design = state?.moduleDecomposition
  const modules: any[] = Array.isArray(design?.modules) ? design.modules : []
  if (identities.length === 0 || modules.length === 0) {
    return { verdict: 'unavailable', tools_checked: identities, missing: [], message: 'no selected tools or moduleDecomposition in state' }
  }

  const allWordText = modules
    .flatMap((m: any) => (Array.isArray(m?.sub_modules) ? m.sub_modules : []))
    .flatMap((sm: any) => (Array.isArray(sm?.words) ? sm.words : []))
    .map((w: any) => wordIdentityText(w))
    .join(' \n ')

  const missing: MissingImpliedComponent[] = []
  const seen = new Set<string>()
  for (const rule of TOOL_IMPLIED_COMPONENTS) {
    const matchedTool = identities.find((idy) => rule.re.test(idy))
    if (!matchedTool) continue
    for (const imp of rule.implies) {
      if (imp.presence_re.test(allWordText)) continue // already present — untouched
      const key = `${imp.module}::${imp.component}`
      if (seen.has(key)) continue
      seen.add(key)
      missing.push({ ...imp, source_tool_id: rule.id, resolved_module: resolveTargetModuleId(design, imp.module) })
    }
  }

  const verdict: ToolImpliedComponentResult['verdict'] = missing.length > 0 ? 'missing' : 'pass'
  const message = verdict === 'missing'
    ? `${missing.length} tool-implied component(s) absent from the design: ` +
      missing.map((m) => `${m.component}[from ${m.source_tool_id}]→${m.resolved_module ?? 'NO TARGET MODULE IN DESIGN'}`).join(', ')
    : `coherent — every tool-implied component already present (${identities.length} selected tool(s) checked)`
  return { verdict, tools_checked: identities, missing, message }
}

/**
 * PURE. Clone `design`, and for every `missing` item WITH a `resolved_module`,
 * push a new minimal, honest BoM word into that module's FIRST sub_module —
 * same 4-modifier shape as the generic emitter's own `componentWord()`
 * (quantity / form / part_number "TBD" / lifecycle); the part_number stays a
 * gate-23-satisfying placeholder so the chain's own `fillBlankWordMpns`
 * grounds it with a real catalogue MPN downstream, exactly like every other
 * generic-emitter word. An item with no resolved target module is skipped
 * (non-fatal — the finding still surfaced in `computeToolImpliedComponents`).
 * A `missing` list with nothing addable returns `design` UNTOUCHED (same
 * object reference) — the CO₂/SAF byte-identity guarantee applies here too.
 */
export function addImpliedWords(
  design: any,
  missing: MissingImpliedComponent[],
): { design: any; added: number; skipped: number } {
  const addable = missing.filter((m) => m.resolved_module)
  if (!design || addable.length === 0) return { design, added: 0, skipped: missing.length }
  const cloned: any = typeof structuredClone === 'function' ? structuredClone(design) : JSON.parse(JSON.stringify(design))
  const modules: any[] = Array.isArray(cloned?.modules) ? cloned.modules : []
  let added = 0
  for (const item of addable) {
    const target = modules.find((m: any) => String(m?.module ?? '') === item.resolved_module)
    const subs: any[] = Array.isArray(target?.sub_modules) ? target.sub_modules : []
    const sub = subs[0]
    if (!target || !sub) continue
    // SINGLE underscore throughout (2026-07-12 propagation fix — the Open Colorimeter
    // training run): build_universal_scene.py::extract_parts treats ANY word id
    // containing a DOUBLE underscore as a BoM-only sub-component of its parent
    // assembly (the SAME "parent__slug" convention makeSubModule uses for sub_module
    // ids) and silently drops it from Blender placement — so it never reaches
    // parts-manifest.json, the connection-ledger, or requirements_bom.py's rendered
    // rows. The old id `${component}_word__tool_grounded` collided with that filter
    // by construction (every added word was silently dropped from the BoM even
    // though it was correctly present in moduleDecomposition — confirmed on
    // out/colorimeter-corefix-20260712-1453: 10 tool-grounded words in state.json,
    // 0 in requirementsBom). A single underscore is never mistaken for the
    // sub-component convention, so the grounded word places + prices normally.
    const wordId = `${item.component}_tool_grounded_word`
    if (!Array.isArray(sub.words)) sub.words = []
    if (sub.words.some((w: any) => String(w?.id ?? '') === wordId)) continue // idempotent — never double-adds
    sub.words.push({
      id: wordId,
      name_human: item.name_human,
      content_character: {
        character_id: item.component,
        name_human: item.name_human,
        function_radical_primary: null,
        function_radical_secondary: null,
        material_radical_primary: null,
        material_radical_secondary: null,
      },
      modifier_characters: [
        { kind: 'quantity', value: '×1' },
        { kind: 'form', value: `${item.name_human} — required by the selected engineering tool "${item.source_tool_id}"; the module generator omitted it` },
        { kind: 'part_number', value: 'TBD (detailed design)' },
        { kind: 'lifecycle', value: 'Concept design — catalogue part + exact MPN confirmed at detailed design' },
      ],
    })
    added++
  }
  return { design: added > 0 ? cloned : design, added, skipped: missing.length - added }
}

export interface ToolGroundingRunResult {
  result: ToolImpliedComponentResult
  mode: WordDomainCoherenceEnforceMode
  /** Set only when mode === 'on' AND at least one missing item was addable —
   *  the design with the tool-grounded words added, ready to replace the
   *  chain's `design`. */
  add?: { design: any; added: number; skipped: number }
}

/** Convenience for the chain: compute + (when enforcing) add in one call.
 *  Shares the SAME env-mode mapper as the strip side (`WORD_DOMAIN_COHERENCE_
 *  ENFORCING`) — one universal grounding gate, two complementary passes.
 *  Never exits/throws — additive-only, no chain exit code. */
export function runToolImpliedComponentGrounding(state: any, envValue?: string): ToolGroundingRunResult {
  const result = computeToolImpliedComponents(state)
  const mode = wordDomainCoherenceEnforceModeFromEnv(envValue)
  if (mode === 'on' && result.missing.length > 0) {
    const add = addImpliedWords(state?.moduleDecomposition, result.missing)
    return { result, mode, add }
  }
  return { result, mode }
}
