/**
 * src/lib/pdf-engine-v2/lib/bespoke-equipment-bands.ts
 *
 * BESPOKE CHEMICAL-PROCESS EQUIPMENT REFERENCE BANDS — the per-line price-check
 * anchor for fabricated / build-to-order process equipment that has NO catalogue
 * price (316L agitated vessels, reactors, crystallisers, packed columns,
 * plate/shell-tube heat exchangers, centrifuges, fluid-bed dryers, screw feeders,
 * fabricated supports/baffles/manifolds, GRP bunds, silos, …).
 *
 * WHY THIS EXISTS (CO₂-mineralisation v10 post-mortem, 2026-06-04)
 * ---------------------------------------------------------------
 * The per-line "PRICE CHECK" REF column (`>2x` / `<.5x` / `OK`) is set by
 * Engine C (`scripts/enrich-state-with-reference-anchor.tsx`) from a RAG-corpus
 * MEDIAN of the top-5 semantically-nearest priced parts in forge-truth.db. For
 * BESS / PV / heat-pump that corpus is rich and the median is meaningful. For
 * BESPOKE chemical fabrication the corpus has essentially NO comparable priced
 * record, so the nearest-neighbour search returns whatever is closest in
 * embedding space — and its price is noise:
 *
 *   flue-gas inlet blower   £8,500  vs corpus median £8.66   → ratio 981×  → >2x  (FALSE: matched a desk fan)
 *   reactor temp sensor     £1,100  vs corpus median £3.20   → ratio 344×  → >2x  (FALSE: matched a thermistor)
 *   power+control cabling    £9,000 vs corpus median £20     → ratio 451×  → >2x  (FALSE: per-metre cable price)
 *   vessel supports+saddles  £650   vs corpus median £29,500 → ratio 0.02× → <.5x (FALSE: matched a whole skid)
 *   reactor internal baffles £1,200 vs corpus median £36,000 → ratio 0.03× → <.5x (FALSE: matched a vessel)
 *   brazed-plate exchanger   £2,400 vs corpus median £21,500 → ratio 0.19× → <.5x (FALSE: matched a shell-tube)
 *
 * On the v10 doc this produced ~79% of priced lines flagged (66 <.5x, 45 >2x,
 * 25 PRICE-QUERY, 25 OK → BoM section scored 4.50/10) even though the bespoke
 * prices were credible (a 3 m³ 316L agitated vessel ≈ £15-25k; a forced-
 * circulation crystalliser ≈ £20-40k; a pusher centrifuge ≈ £20-30k).
 *
 * WHAT THIS FIXES
 * ---------------
 * It supplies a CREDIBLE reference band keyed by EQUIPMENT CLASS (not by an
 * embedding neighbour), anchored to published chemical-plant equipment costs
 * (Towler & Sinnott "Chemical Engineering Design" cost correlations + Matche /
 * Peters-Timmerhaus / UK fabricator quotations, 2024-2026 UK ex-works). Engine C
 * uses it as the comparison input whenever the line is a recognised bespoke
 * process item AND the corpus median is unreliable, so an honestly-costed
 * fabricated vessel lands OK/RFQ and only a GENUINE outlier (>2× the band high
 * or <0.5× the band low) stays flagged.
 *
 * UNIVERSAL, not per-dossier: the classes here are generic unit operations that
 * appear in ANY chemical / minerals / process plant (CO₂ capture, electrolyser
 * balance-of-plant, bioprocess downstream, water treatment, …), so a new
 * process archetype gets credible per-line checks without hand-coding.
 *
 * The band is a TYPICAL midpoint + a [low, high] envelope. Where the part
 * carries a size signal (mass kg, working volume m³, or a capacity/throughput),
 * the midpoint is scaled along the envelope by a gentle power law; otherwise the
 * class midpoint stands. Material (316L stainless vs carbon steel vs GRP) and a
 * fabrication-complexity hint (jacketed / agitated / vacuum) shift the midpoint
 * within the envelope. Scaling never escapes [low, high] — the envelope is the
 * honesty bound the flag is judged against.
 */

// ---------------------------------------------------------------------------
// Equipment-class band table. £ are UK ex-works 2024-2026, single-unit
// build-to-order. low/high bracket the realistic spread for the class across
// the small-to-large sizes a modular (~1-10 t/day) process plant uses; typical
// is the mid working point. Sources noted per row.
// ---------------------------------------------------------------------------

export interface EquipmentBand {
  /** Canonical equipment class key. */
  key: string
  /** Realistic single-unit ex-works spread, £. The flag is judged against these. */
  low_gbp: number
  high_gbp: number
  /** Working-point midpoint, £ (the "typical" a credibly-costed unit sits near). */
  typical_gbp: number
  /** Size signal used to scale within [low, high], if the part exposes one. */
  size_basis: 'mass_kg' | 'volume_m3' | 'capacity' | 'none'
  /** Reference size at which `typical_gbp` holds (in size_basis units). */
  ref_size: number
  /** Power-law exponent for size scaling (0.6-0.7 is the classic six-tenths rule). */
  size_exp: number
  /** Source anchor. */
  source: string
}

/** Order is irrelevant (lookup is by key); kept grouped for readability. */
export const EQUIPMENT_BANDS: Record<string, EquipmentBand> = {
  // ── Vessels / reactors / columns (fabricated 316L pressure-or-atmospheric) ──
  agitated_vessel: {
    key: 'agitated_vessel', low_gbp: 8_000, high_gbp: 60_000, typical_gbp: 20_000,
    size_basis: 'volume_m3', ref_size: 3, size_exp: 0.65,
    source: 'Fabricated jacketed/agitated 316L stirred-tank ~£15-25k at 3 m³ (Towler & Sinnott vessel correlation + UK fabricator quotes); excl. agitator drive (separate line).',
  },
  reactor_vessel: {
    key: 'reactor_vessel', low_gbp: 10_000, high_gbp: 80_000, typical_gbp: 24_000,
    size_basis: 'volume_m3', ref_size: 3, size_exp: 0.65,
    source: 'Jacketed glass-lined / 316L carbonation-or-reaction vessel ~£20-30k at 3 m³ (De Dietrich / Pfaudler class).',
  },
  packed_column: {
    key: 'packed_column', low_gbp: 8_000, high_gbp: 70_000, typical_gbp: 22_000,
    size_basis: 'volume_m3', ref_size: 2, size_exp: 0.6,
    source: 'Fabricated 316L packed absorber/stripper column shell ~£18-28k (Sulzer/Koch shell, ex-internals); structured packing priced separately.',
  },
  storage_tank: {
    key: 'storage_tank', low_gbp: 4_000, high_gbp: 45_000, typical_gbp: 14_000,
    size_basis: 'volume_m3', ref_size: 5, size_exp: 0.6,
    source: 'Fabricated 316L atmospheric storage / dissolution / reclaim tank ~£8-18k mid-size (UK tank fabricators).',
  },
  pressure_vessel: {
    key: 'pressure_vessel', low_gbp: 6_000, high_gbp: 60_000, typical_gbp: 18_000,
    size_basis: 'volume_m3', ref_size: 2, size_exp: 0.65,
    source: 'PED-rated fabricated 316L flash / condensate / buffer vessel ~£12-22k mid-size.',
  },

  // ── Separation / size-reduction / drying packages ──────────────────────────
  crystalliser: {
    key: 'crystalliser', low_gbp: 12_000, high_gbp: 120_000, typical_gbp: 30_000,
    size_basis: 'capacity', ref_size: 100, size_exp: 0.6,
    source: 'Forced-circulation / draft-tube-baffle crystalliser package ~£20-40k modular (GEA Messo / Swenson); scales with crystal throughput.',
  },
  centrifuge: {
    key: 'centrifuge', low_gbp: 12_000, high_gbp: 90_000, typical_gbp: 25_000,
    size_basis: 'capacity', ref_size: 150, size_exp: 0.6,
    source: 'Pusher / decanter / peeler centrifuge ~£20-30k mid-duty (Andritz / GEA / Ferrum).',
  },
  dryer: {
    key: 'dryer', low_gbp: 10_000, high_gbp: 90_000, typical_gbp: 24_000,
    size_basis: 'capacity', ref_size: 75, size_exp: 0.6,
    source: 'Fluid-bed / vibro-fluidiser / flash dryer package ~£20-30k modular (GEA / Glatt); scales with evaporation duty.',
  },
  filter_separator: {
    key: 'filter_separator', low_gbp: 4_000, high_gbp: 50_000, typical_gbp: 12_000,
    size_basis: 'capacity', ref_size: 50, size_exp: 0.6,
    source: 'Filter press / belt filter / cyclone / candle filter mid-duty ~£8-18k.',
  },

  // ── Heat transfer ──────────────────────────────────────────────────────────
  plate_heat_exchanger: {
    key: 'plate_heat_exchanger', low_gbp: 1_500, high_gbp: 25_000, typical_gbp: 6_000,
    size_basis: 'capacity', ref_size: 100, size_exp: 0.6,
    source: 'Brazed-plate / gasketed-plate exchanger (Alfa Laval CB/M-series) ~£2-10k by duty; far cheaper than shell-tube — the corpus mis-anchors these to shell-tube medians.',
  },
  shell_tube_exchanger: {
    key: 'shell_tube_exchanger', low_gbp: 6_000, high_gbp: 80_000, typical_gbp: 22_000,
    size_basis: 'capacity', ref_size: 100, size_exp: 0.6,
    source: 'Fabricated 316L shell-and-tube / vacuum condenser ~£15-35k mid-area (TEMA class).',
  },
  reboiler: {
    key: 'reboiler', low_gbp: 4_000, high_gbp: 60_000, typical_gbp: 14_000,
    size_basis: 'capacity', ref_size: 100, size_exp: 0.6,
    source: 'Thermosiphon / kettle reboiler (plate or shell-tube) ~£9-20k mid-duty.',
  },

  // ── Solids handling / feeders ──────────────────────────────────────────────
  feeder: {
    key: 'feeder', low_gbp: 4_000, high_gbp: 45_000, typical_gbp: 13_000,
    size_basis: 'capacity', ref_size: 110, size_exp: 0.55,
    source: 'Loss-in-weight / screw / gravimetric feeder ~£12-20k (Gericke GLD / Schenck / K-Tron); a GLD 115 ≈ £15.5k.',
  },
  hopper_silo: {
    key: 'hopper_silo', low_gbp: 3_000, high_gbp: 60_000, typical_gbp: 14_000,
    size_basis: 'volume_m3', ref_size: 10, size_exp: 0.6,
    source: 'Fabricated feed hopper / product storage silo ~£6-25k by volume (powder-handling fabricators).',
  },
  conveyor: {
    key: 'conveyor', low_gbp: 2_000, high_gbp: 30_000, typical_gbp: 8_000,
    size_basis: 'capacity', ref_size: 50, size_exp: 0.6,
    source: 'Screw / belt / drag conveyor mid-length ~£5-12k.',
  },

  // ── Rotating / fluid movers (bespoke process duty, not catalogue) ──────────
  process_blower: {
    key: 'process_blower', low_gbp: 2_000, high_gbp: 40_000, typical_gbp: 8_000,
    size_basis: 'capacity', ref_size: 100, size_exp: 0.6,
    source: 'Made-to-order centrifugal process / flue-gas fan ~£5-12k mid-duty (Howden / Nyborg); the corpus mis-anchors to a desk fan.',
  },
  process_pump: {
    key: 'process_pump', low_gbp: 1_500, high_gbp: 30_000, typical_gbp: 6_000,
    size_basis: 'capacity', ref_size: 50, size_exp: 0.6,
    source: 'Progressive-cavity / slurry / metering process pump ~£3-10k mid-duty (SEEPEX / Bredel).',
  },
  agitator: {
    key: 'agitator', low_gbp: 3_000, high_gbp: 35_000, typical_gbp: 9_000,
    size_basis: 'capacity', ref_size: 5, size_exp: 0.5,
    source: 'Top-entry agitator / mixer head ~£6-15k (Ekato / Chemineer); drive + gearbox + seal are separate lines.',
  },

  // ── Fabricated structures / internals (small, NOT a whole skid) ─────────────
  fabricated_internal: {
    key: 'fabricated_internal', low_gbp: 300, high_gbp: 12_000, typical_gbp: 2_000,
    size_basis: 'mass_kg', ref_size: 50, size_exp: 0.7,
    source: 'Fabricated 316L internals — baffles, sparger rings, launders, wash/blow manifolds, distributor bars, couplings. Small weld-ups: hundreds-to-low-thousands £, NOT a vessel.',
  },
  vessel_support: {
    key: 'vessel_support', low_gbp: 300, high_gbp: 15_000, typical_gbp: 1_500,
    size_basis: 'mass_kg', ref_size: 80, size_exp: 0.7,
    source: 'Bolted structural-steel saddles / support frames / plinths — fabricated steelwork £/kg, NOT a packaged skid.',
  },
  skid_frame: {
    key: 'skid_frame', low_gbp: 6_000, high_gbp: 80_000, typical_gbp: 22_000,
    size_basis: 'mass_kg', ref_size: 2_000, size_exp: 0.7,
    source: 'Full process skid base frame with secondary containment ~£15-35k mid-size (structural steel + galv + bund).',
  },
  bund_containment: {
    key: 'bund_containment', low_gbp: 2_000, high_gbp: 30_000, typical_gbp: 8_000,
    size_basis: 'volume_m3', ref_size: 10, size_exp: 0.6,
    source: 'GRP / coated-steel 110% secondary-containment bund ~£5-12k mid-size.',
  },
  ducting: {
    key: 'ducting', low_gbp: 300, high_gbp: 12_000, typical_gbp: 2_000,
    size_basis: 'mass_kg', ref_size: 60, size_exp: 0.7,
    source: 'Fabricated 316L / FRP process ducting (dryer exhaust, vent) — fabricated sheet £/kg, low-thousands typical.',
  },
  insulation_lagging: {
    key: 'insulation_lagging', low_gbp: 300, high_gbp: 10_000, typical_gbp: 2_000,
    size_basis: 'none', ref_size: 1, size_exp: 0,
    source: 'Mineral-wool + cladding insulation on a vessel/column — labour+material, low-thousands; NOT priced like the vessel it wraps.',
  },
}

// ---------------------------------------------------------------------------
// Classification — map a part's free text (name + form + part_number) to an
// equipment class. Order matters: most-specific FIRST so "vessel supports"
// hits vessel_support not agitated_vessel, "internal baffles" hits
// fabricated_internal not reactor_vessel, brazed-PLATE hits plate not
// shell_tube. Each pattern is anchored on a noun the emitter actually uses.
// ---------------------------------------------------------------------------

/**
 * Catalogue sub-components that frequently appear with a vessel/reactor/
 * crystalliser noun in their NAME (e.g. "reactor drain valve", "crystalliser
 * agitator VSD", "mother-liquor recycle pump") but are themselves CATALOGUE
 * parts with a real list price — NOT bespoke fabrication. If a part name hits
 * one of these it is excluded from the bespoke bands entirely so the corpus /
 * catalogue check owns it (and we don't price a £950 valve against a £10k vessel
 * floor). Rotating equipment that IS legitimately bespoke-duty (pumps, blowers,
 * agitator heads) is handled by its OWN class pattern below, which runs before
 * the vessel nouns — so a bare "process pump" still gets process_pump; only a
 * pump/valve/probe NAMED as part of a vessel is excluded here.
 */
const NON_FABRICATION_GUARD =
  /\b(valve|probe|sensor|transmitter|gauge|switch|VSD|VFD|inverter[_\s-]?drive|drive\b|motor\b|gearbox|coupling|seal\b|bearing|fan\b|belt\b|gasket|fitting|flange|nozzle|instrument|analyser|analyzer|meter\b|controller|PLC|relay|contactor|breaker|cable|wiring|busbar|panel\b|junction[_\s-]?box|light\b|lamp|actuator|positioner|orifice|rupture[_\s-]?disc|sight[_\s-]?glass|load[_\s-]?cell|scale\b)\b/i

const CLASSIFIERS: Array<[RegExp, string]> = [
  // Small fabricated internals / structures FIRST (they contain vessel/reactor
  // nouns that would otherwise mis-route to the vessel bands).
  [/\bbaffle|sparger|launder|distributor[_\s-]?bar|wash[_\s-]?(bar|water)?[_\s-]?manifold|air[_\s-]?blow|manifold|coupling|static[_\s-]?mixer\b/i, 'fabricated_internal'],
  [/\bsupport|saddle|plinth|support[_\s-]?frame|exchanger[_\s-]?support\b/i, 'vessel_support'],
  [/\bskid[_\s-]?frame|process[_\s-]?skid\b/i, 'skid_frame'],
  [/\bbund|containment[_\s-]?tray|secondary[_\s-]?containment\b/i, 'bund_containment'],
  [/\bduct|exhaust[_\s-]?duct|vent[_\s-]?duct\b/i, 'ducting'],
  [/\binsulation|lagging|cladding\b/i, 'insulation_lagging'],

  // Heat transfer — brazed/gasketed PLATE before shell-tube before generic.
  [/\breboiler|reboil[_\s-]?pot\b/i, 'reboiler'],
  [/(brazed|gasket|plate)[_\s-]?(plate[_\s-]?)?(heat[_\s-]?)?exchang|\bCB\d|\bM\d+[_\s-]?[A-Z]?FG?\b|economiser|subcooler|trim[_\s-]?cooler|condensate[_\s-]?cooler|product[_\s-]?cooler|recuperat/i, 'plate_heat_exchanger'],
  [/shell[_\s-]?and[_\s-]?tube|shell[_\s-]?tube|vacuum[_\s-]?condenser|\bcondenser\b/i, 'shell_tube_exchanger'],
  [/heat[_\s-]?exchang|\bcooler\b|\bheater\b|recovery[_\s-]?exchang/i, 'plate_heat_exchanger'],

  // Rotating / fluid movers — BEFORE the unit nouns so "crystalliser agitator"
  // / "mother-liquor recycle pump" / "flue-gas blower" route to the rotating
  // class, not the unit they serve. (A bare "centrifuge" / "blower" still hits
  // the right class; only compound names are disambiguated by this ordering.)
  [/\bagitator\b|\bmixer\b(?![_\s-]?static)|impeller/i, 'agitator'],
  [/slurry[_\s-]?pump|process[_\s-]?pump|metering[_\s-]?pump|recycle[_\s-]?pump|feed[_\s-]?pump|progressive[_\s-]?cavity|\bpump\b/i, 'process_pump'],
  [/blower|process[_\s-]?fan|flue[_\s-]?gas[_\s-]?(inlet[_\s-]?)?(fan|blower)|centrifugal[_\s-]?(process[_\s-]?)?fan/i, 'process_blower'],

  // Separation / size-reduction / drying.
  [/crystallis|recrystallis/i, 'crystalliser'],
  [/centrifuge/i, 'centrifuge'],
  [/\bdryer\b|fluid[_\s-]?bed|fluidis|vibro[_\s-]?fluidis|flash[_\s-]?dry/i, 'dryer'],
  [/filter[_\s-]?press|belt[_\s-]?filter|candle[_\s-]?filter|\bcyclone\b|separator/i, 'filter_separator'],

  // Solids handling / feeders.
  [/feeder|loss[_\s-]?in[_\s-]?weight|screw[_\s-]?feed|dosing[_\s-]?feeder|gravimetric/i, 'feeder'],
  [/\bsilo\b|storage[_\s-]?silo/i, 'hopper_silo'],
  [/\bhopper\b|feed[_\s-]?hopper\b/i, 'hopper_silo'],
  [/conveyor|conveying/i, 'conveyor'],

  // Columns / reactors / vessels / tanks LAST (broadest nouns).
  [/packed[_\s-]?(absorber[_\s-]?)?column|absorber[_\s-]?column|stripper[_\s-]?column|\bcolumn\b/i, 'packed_column'],
  [/carbonation[_\s-]?reactor|stirred[_\s-]?(tank[_\s-]?)?reactor|\breactor\b(?![_\s-]?temp|[_\s-]?ph|[_\s-]?probe|[_\s-]?internal)/i, 'reactor_vessel'],
  [/stirred[_\s-]?tank|agitated[_\s-]?(dissolution[_\s-]?)?(tank|vessel)|dissolution[_\s-]?(tank|vessel)|\bjacketed\b/i, 'agitated_vessel'],
  [/flash[_\s-]?vessel|condensate[_\s-]?vessel|buffer[_\s-]?(tank|vessel)|feedwater[_\s-]?vessel|knock[_\s-]?out|stripper[_\s-]?pot|reboil[_\s-]?pot/i, 'pressure_vessel'],
  [/reclaim[_\s-]?(water[_\s-]?)?tank|dissolution[_\s-]?tank|storage[_\s-]?tank|\btank\b/i, 'storage_tank'],
  [/\bvessel\b/i, 'agitated_vessel'],
]

/** Large fabricated-UNIT classes — a £-thousands floor only makes sense for the
 *  whole unit. If a part NAME also hits the non-fabrication guard (it is really
 *  a valve / probe / drive / belt NAMED as part of one of these units) it must
 *  NOT inherit the unit's floor. Rotating-equipment + small-internal classes are
 *  exempt from the guard (a "process pump" legitimately IS process_pump). */
const LARGE_UNIT_CLASSES = new Set([
  'agitated_vessel', 'reactor_vessel', 'packed_column', 'storage_tank', 'pressure_vessel',
  'crystalliser', 'centrifuge', 'dryer', 'filter_separator',
  'plate_heat_exchanger', 'shell_tube_exchanger', 'reboiler',
  'hopper_silo', 'conveyor', 'skid_frame', 'bund_containment',
])

/**
 * Classify a part into a bespoke-equipment class from its free text.
 * Returns null when no class matches (the part is not bespoke process kit — let
 * the corpus / catalogue check own it), OR when the part is really a catalogue
 * sub-component (valve / probe / drive / belt) that merely NAMES a large unit.
 */
export function classifyBespokeEquipment(
  name: string | undefined | null,
  form?: string | null,
  partNumber?: string | null,
): string | null {
  const hay = `${name ?? ''} ${form ?? ''} ${partNumber ?? ''}`.trim()
  if (!hay) return null
  // A variable-speed / inverter DRIVE is always a catalogue electrical part, even when
  // named after the unit it drives (e.g. "crystalliser agitator VSD") — never bespoke.
  if (/\b(VSD|VFD|inverter[_\s-]?drive|variable[_\s-]?speed[_\s-]?drive)\b/i.test(`${name ?? ''}`)) return null
  for (const [re, key] of CLASSIFIERS) {
    if (!re.test(hay)) continue
    // A catalogue sub-component named after a large fabricated unit (e.g.
    // "reactor drain valve", "crystalliser agitator VSD") must not be priced
    // against that unit's £-thousands floor — let the catalogue/corpus own it.
    if (LARGE_UNIT_CLASSES.has(key) && NON_FABRICATION_GUARD.test(`${name ?? ''}`)) return null
    return key
  }
  return null
}

/**
 * Is this part a BESPOKE / build-to-order fabrication (no catalogue price)?
 * Signals: the part_number carries a fabrication marker, OR it classifies into
 * one of the fabricated-vessel/structure classes. Catalogue-sourced rotating
 * equipment with a real MPN (a named pump/blower/agitator model) is bespoke-
 * DUTY but still gets the band as a sanity envelope — the band lows are wide
 * enough not to false-flag a real catalogue price.
 */
export function isBespokeFabrication(
  name: string | undefined | null,
  form?: string | null,
  partNumber?: string | null,
): boolean {
  const pn = String(partNumber ?? '')
  if (/fabricat|bespoke|made[_\s-]?to[_\s-]?order|build[_\s-]?to[_\s-]?order|TBD at quotation|frame TBD|at quotation/i.test(pn)) return true
  if (/fabricat|bespoke|made[_\s-]?to[_\s-]?order/i.test(String(form ?? ''))) return true
  return classifyBespokeEquipment(name, form, partNumber) !== null
}

// ---------------------------------------------------------------------------
// Material + complexity adjustment. The envelope already spans materials; this
// nudges the midpoint within it so a 316L jacketed-agitated vessel reads a bit
// higher than a plain carbon-steel tank of the same size. Bounded to keep the
// scaled typical inside [low, high].
// ---------------------------------------------------------------------------

function materialComplexityFactor(text: string): number {
  let f = 1
  const t = text.toLowerCase()
  // Material
  if (/duplex|super[_\s-]?duplex|hastelloy|titanium|inconel|tantalum|glass[_\s-]?lined/.test(t)) f *= 1.4
  else if (/316l|316|317|904l|stainless/.test(t)) f *= 1.1
  else if (/\bgrp\b|frp|hdpe|mdpe|pp\b|plastic|polymer/.test(t)) f *= 0.8
  // Complexity
  if (/jacketed/.test(t)) f *= 1.15
  if (/agitated|stirred/.test(t)) f *= 1.1
  if (/vacuum|pressuris|ped\b|pressure[_\s-]?rated/.test(t)) f *= 1.1
  // Clamp the cumulative nudge so it never dominates the size scaling.
  return Math.min(1.8, Math.max(0.7, f))
}

// ---------------------------------------------------------------------------
// Size-scaled reference. Given a class + an optional size signal + material/
// complexity text, return a credible reference price + the honesty envelope.
// ---------------------------------------------------------------------------

export interface BespokeReference {
  /** Equipment class matched. */
  key: string
  /** Credible reference unit price for THIS part (the "typical" the flag uses as median). */
  reference_gbp: number
  /** Honesty envelope — the flag treats prices inside as OK. */
  low_gbp: number
  high_gbp: number
  /** Which size signal (if any) scaled the reference. */
  scaled_by: 'mass_kg' | 'volume_m3' | 'capacity' | 'none'
  source: string
}

/**
 * Compute the bespoke-equipment reference for a part.
 *
 * @param text   combined name + form + part_number (classification + material signal)
 * @param size   optional { mass_kg?, volume_m3?, capacity? } parsed from the word's modifiers
 * @returns      reference + envelope, or null if the part isn't a recognised bespoke class
 */
export function bespokeEquipmentReference(
  text: string,
  size?: { mass_kg?: number | null; volume_m3?: number | null; capacity?: number | null },
): BespokeReference | null {
  const key = classifyBespokeEquipment(text)
  if (!key) return null
  const band = EQUIPMENT_BANDS[key]
  if (!band) return null

  let ref = band.typical_gbp
  let scaledBy: BespokeReference['scaled_by'] = 'none'

  // Size scaling along the power law, if the part exposes the right signal.
  const sizeVal =
    band.size_basis === 'mass_kg' ? size?.mass_kg :
    band.size_basis === 'volume_m3' ? size?.volume_m3 :
    band.size_basis === 'capacity' ? size?.capacity :
    null
  if (band.size_basis !== 'none' && typeof sizeVal === 'number' && Number.isFinite(sizeVal) && sizeVal > 0 && band.ref_size > 0) {
    ref = band.typical_gbp * Math.pow(sizeVal / band.ref_size, band.size_exp)
    scaledBy = band.size_basis
  }

  // Material / complexity nudge.
  ref *= materialComplexityFactor(text)

  // Never let the scaled reference escape the honesty envelope.
  ref = Math.min(band.high_gbp, Math.max(band.low_gbp, ref))

  return {
    key,
    reference_gbp: Math.round(ref),
    low_gbp: band.low_gbp,
    high_gbp: band.high_gbp,
    scaled_by: scaledBy,
    source: band.source,
  }
}

// ---------------------------------------------------------------------------
// Flag decision — the per-line REF verdict using the bespoke envelope.
// `in_range` when the price sits inside [low, high]; `over`/`under` only for a
// GENUINE outlier beyond the envelope by the same 2× / 0.5× discipline Engine C
// uses against the corpus median. This is what keeps real outliers flagged while
// honest bespoke prices read OK.
// ---------------------------------------------------------------------------

export type BespokeFlag = 'in_range' | 'over' | 'under'

export function bespokeFlagFor(
  unitGbp: number,
  ref: BespokeReference,
  overRatio = 2.0,
  underRatio = 0.5,
): { flag: BespokeFlag; ratio: number } {
  // Ratio is reported against the class TYPICAL (so the cover panel + per-line
  // glyph still show a meaningful multiple), but the in/out decision is made
  // against the ENVELOPE so a credibly-costed unit anywhere in the realistic
  // spread reads in_range.
  const ratio = ref.reference_gbp > 0 ? unitGbp / ref.reference_gbp : 1
  if (unitGbp > ref.high_gbp * overRatio) return { flag: 'over', ratio }
  if (unitGbp < ref.low_gbp * underRatio) return { flag: 'under', ratio }
  return { flag: 'in_range', ratio }
}
