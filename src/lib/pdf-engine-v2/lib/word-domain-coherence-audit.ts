// word-domain-coherence-audit.ts
//
// THE WORD-LEVEL DOMAIN COHERENCE GATE — the WORD sibling of gate 34
// (tool-archetype-coherence-audit.ts). Gate 34 catches a wrong-domain TOOL
// leaking its worked-calc into the dossier (a marine hull-collapse calc on a
// CO₂ plant, a hydroponic nutrient-dosing calc on a fish farm). This gate
// catches the same class of bug ONE LEVEL LOWER: a wrong-domain PART/WORD
// leaking straight into the module tree with no tool involved at all.
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

// ---------------------------------------------------------------------------
// The finding shape + the pure compute
// ---------------------------------------------------------------------------

export interface FlaggedWord {
  module_id: string
  sub_module_id: string
  word_id: string
  /** The word's human-readable name (for the log / punch-list). */
  name: string
  /** The first PROCESS_PLANT_VESSEL_MARKERS id that matched. */
  marker: string
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
        const hits = scanWordTextForVesselMarkers(wordText(w))
        if (hits.length === 0) continue
        flagged.push({
          module_id: moduleId,
          sub_module_id: subModuleId,
          word_id: String(w?.id ?? ''),
          name: String(w?.name_human ?? w?.id ?? ''),
          marker: hits[0],
        })
      }
    }
  }

  const verdict: WordDomainCoherenceVerdict = flagged.length > 0 ? 'flagged' : 'pass'
  const message =
    verdict === 'flagged'
      ? `${flagged.length} process-plant-vessel word(s) in device-scale "${productClass || 'unknown'}": ` +
        flagged.map((f) => `${f.module_id}/${f.sub_module_id}/${f.word_id}[${f.marker}]`).join(', ')
      : isProcessPlant && !deviceScale
        ? `coherent — "${productClass}" is a genuine process-plant class, process-plant-vessel markers legitimate (${wordsScanned} words scanned)`
        : `coherent — no process-plant-vessel word markers in "${productClass || 'unknown'}" (${wordsScanned} words scanned)`

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
