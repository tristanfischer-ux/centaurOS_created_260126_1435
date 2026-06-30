/**
 * scripts/lib/orchestrator/generic/universal-contract-sizing.ts
 *
 * UNIVERSAL contract-driven equipment sizing + synthesis (no per-class table — the
 * super-brief direction).
 *
 * THE WALL it removes (RAS, 2026-06-13): the engineering CONTRACT computes every
 * physics quantity an archetype needs (`rearing_tank_volume_each_m3 = 334`,
 * `rearing_tank_count = 10`, `biofilter_tank_volume_m3 = 515`,
 * `drum_filter_throughput_m3_h = 13360`, `heat_pump_electrical_kw = 427`), but the
 * generic emitter ships a FIXED 10-module × ~5-word skeleton (structure / power /
 * control / sensing / safety boilerplate) that is the SAME for every archetype, with
 * a few grounded parts and several "representative component" placeholders. So:
 *   (1) the PRINCIPAL process equipment is never emitted — the 10 rearing tanks, the
 *       biofilter vessel and the degasser are simply ABSENT from the bill of materials;
 *   (2) the few real words carry no dimension or count, so a 334 m³ tank renders as
 *       the Blender 700 mm type-default box, part-grounding picks scale-wrong parts,
 *       counts stay ×1, and the cost collapses.
 *
 * The legacy `applyFamilySizing` (sizing.ts) solved (2) ONLY for the battery family via
 * a hand-written name→quantity rule table — exactly the per-class curation we retire.
 *
 * THIS pass is the universal replacement, in two moves driven entirely by the contract:
 *   A. SIZE — the quantity KEYS are self-describing (`<equipment>_<measure>_<unit>`).
 *      Parse (equipment, measure, value, unit), group by equipment, match each BoM word
 *      by STEMMED token overlap, and stamp a real DIMENSION (cylinder from a volume,
 *      scaled box from a power/throughput, area from an area), a real QUANTITY (from a
 *      `_count`), and an engineering RATING.
 *   B. SYNTHESISE — for every PRINCIPAL equipment group (a volume / area / throughput /
 *      device-power) that no existing word matched, CREATE a sized + counted equipment
 *      word and place it in the most appropriate module. This is what puts the 10 tanks,
 *      the biofilter and the degasser into the BoM + geometry for the first time.
 *
 * Nothing is invented: a dimension/rating is only set when a contract quantity supplies
 * it; a word is only synthesised for a group the contract actually computed. Universal
 * — consumes whatever the contract computed, any archetype, no `if class`. Dimension
 * strings use the format the Blender's `parse_dimension` + the renderer both read
 * ("<d> m dia x <h> m", "<w>x<d>x<h> mm", "<a> m² area"), so geometry + BoM + cost all
 * consume the same sized words at once.
 *
 * British spelling throughout.
 */

import type { ContractInProgress } from '../types'
import { mod, type ModifierCharacter } from './emitter-primitives'
import { mergeMods, type ModuleLike, type WordLike } from './sizing'
import { contractCountFor } from './derive-skeleton'

// ── measure taxonomy ───────────────────────────────────────────────────────
type Measure =
  | 'volume' // m³ — a vessel/tank (drives a cylinder dimension)
  | 'area' // m² — a footprint/membrane/pond
  | 'count' // integer — drives the quantity modifier
  | 'power' // kW/kVA on a DEVICE (drives a scaled box + rating + synthesis)
  | 'duty' // kW of LOAD/demand (rating only — NOT a device, never synthesised)
  | 'throughput' // m³/h flow or process throughput (scaled box + rating)
  | 'rate' // kg/h, kg/day mass rate (rating only)
  | 'mass' // kg (rating only)
  | 'current' // A (rating only)

interface EquipGroup {
  phrase: string
  stems: string[]
  volume?: number
  volumeIsEach: boolean
  // Provenance note when `volume` was OVERRIDDEN from the plant aggregate ÷ count (a stale
  // per-each value reconciled to the authoritative aggregate) — see the per-unit↔aggregate
  // reconcile in buildGroups. Undefined when the contract's per-each value was taken verbatim.
  volumeProvenance?: 'per-unit-derived-from-aggregate'
  // PHYSICAL-VESSEL precedence when one device declares MULTIPLE volume keys (universal,
  // Tristan 2026-06-19): the SYNTHESISED vessel must be sized to its CONTAINMENT — the
  // tank / shell / vessel volume — NOT to the internal FILL (MBBR media, packing, resin,
  // sludge bed, working/liquid volume). 2 = containment (tank/shell/vessel), 1 = neutral
  // (a bare `_volume_m3`), 0 = fill (media/working/active/bed/packing/liquid). A higher
  // role overwrites a lower one (so biofilter_tank_volume_m3=153 wins over
  // biofilter_media_volume_m3=92, the 60 %-fill the emitter wrongly read as the vessel).
  volumeRole?: number
  area?: number
  count?: number
  power?: number // device power (kW) — synthesisable
  duty?: number // load/demand (kW) — rating only
  throughput?: number
  rate?: number
  rateUnit?: string
  mass?: number
  current?: number
  // Per-unit FLOW (m³/h) of a counted flow-machine, derived from the plant loop flow ÷ count,
  // surfaced as a SECONDARY rating beside the machine's primary (power) rating so the recirc
  // pump reads "97 kW · 1,670 m³/h each". Set in buildGroups for pumps/filters/degassers only.
  perUnitFlow?: number
  // A SUB-ASPECT of a larger principal (its stems strictly CONTAIN another synthesisable
  // group's stems in the same device family) — e.g. `degasser_column`(⊃ `degasser`),
  // `drum_filter_backwash` / `drum_filter_screen`(⊃ `drum_filter`). It is an ATTRIBUTE /
  // sub-system of the parent vessel/machine, NOT a second principal, so it must not mint a
  // duplicate top-level BoM item (which double-counts the same machine on the panel schedule
  // → the load_reconcile divergence). Universal, set in buildGroups; suppresses synthesis.
  subAspect?: boolean
}

// Ordered longest-suffix-first. [regex on key tail, measure, unit, perEach?]
// volRole on a VOLUME rule (universal vessel-vs-fill precedence): 2 = CONTAINMENT
// (tank/shell/vessel — the physical envelope to synthesise), 0 = FILL (media/working/
// active/bed/packing/liquid — the inventory INSIDE the vessel), undefined = neutral.
const SUFFIX_RULES: { re: RegExp; measure: Measure; unit: string; each?: boolean; volRole?: number }[] = [
  { re: /_volume_each_m3$/, measure: 'volume', unit: 'm³', each: true },
  { re: /_each_m3$/, measure: 'volume', unit: 'm³', each: true },
  { re: /_(media|working|active|bed|packing|liquid|fill|resin)_volume_m3$/, measure: 'volume', unit: 'm³', volRole: 0 },
  { re: /_(tank|shell|vessel|reactor|column|chamber)_volume_m3$/, measure: 'volume', unit: 'm³', volRole: 2 },
  { re: /_volume_m3$/, measure: 'volume', unit: 'm³' },
  { re: /_throughput_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_air_flow_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_water_flow_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_flow_m3_h$/, measure: 'throughput', unit: 'm³/h' },
  { re: /_duty_kw$/, measure: 'duty', unit: 'kW' },
  { re: /_heating_kw$/, measure: 'duty', unit: 'kW' },
  { re: /_loss_kw$/, measure: 'duty', unit: 'kW' },
  { re: /_electrical_kw$/, measure: 'power', unit: 'kW' },
  { re: /_power_kw$/, measure: 'power', unit: 'kW' },
  { re: /_rating_kva$/, measure: 'power', unit: 'kVA' },
  // a bare `<stem>_kva` (e.g. transformer_kva=100) must size its principal too — without this the
  // Distribution Transformer never reads its 100 kVA and falls to the 2 kW default box (the physics
  // critic's "2 kW transformer for a 48 kW load"). The aggregate total_supply_demand_kva is dropped by
  // isPureAggregatePhrase, so only a real per-unit rating (transformer_kva) binds. (Tristan 2026-06-28.)
  { re: /_kva$/, measure: 'power', unit: 'kVA' },
  { re: /_supply_kg_h$/, measure: 'rate', unit: 'kg/h' },
  { re: /_kg_h$/, measure: 'rate', unit: 'kg/h' },
  { re: /_area_m2$/, measure: 'area', unit: 'm²' },
  { re: /_m2$/, measure: 'area', unit: 'm²' },
  { re: /_mass_kg$/, measure: 'mass', unit: 'kg' },
  { re: /_current_a$/, measure: 'current', unit: 'A' },
  { re: /_count$/, measure: 'count', unit: '' },
]

// Stems describing an AGGREGATE / property / driver / load — never a discrete
// equipment item; excluded from matching + synthesis.
const STOP_STEMS = new Set([
  'total', 'syste', 'desig', 'plant', 'overa', 'conne', 'suppl', 'deman',
  'annua', 'daily', 'stand', 'makeu', 'sourc', 'setpo', 'capex', 'ceili',
  'auto', 'plann', 'tool', 'ran', 'flag', 'fract', 'ratio', 'load', 'dose',
  'inter', 'build', 'proce', 'recyc', 'turno', 'harve', 'stock', 'conce',
  'solid', 'ammon', 'bioma', 'feed', 'air', 'each', 'avail', 'maxim', 'minim',
])

function stem(tok: string): string {
  let t = tok.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (t.endsWith('s') && t.length > 4) t = t.slice(0, -1)
  return t.slice(0, 5)
}

function significantStems(phrase: string): string[] {
  const out: string[] = []
  for (const raw of phrase.split(/[_\s]+/)) {
    if (!raw) continue
    const s = stem(raw)
    if (s.length < 3) continue
    if (STOP_STEMS.has(s)) continue
    if (/^\d+$/.test(s)) continue
    if (!out.includes(s)) out.push(s)
  }
  return out
}

// ── "computed" twin-collapse (universal, deterministic) ──────────────────────
// The engineering contract sometimes carries TWO parallel quantity families for the
// SAME physical unit: the grounded `uv_reactor_volume_m3` AND a recomputed alias
// `computed_uv_reactor_volume_m3` (likewise `computed_biofilter_*`, `computed_degasser_*`,
// `computed_heat_pump_*`). Left alone, each family yields its OWN equipment group → its own
// synthesised word ("Uv Reactor" AND "Computed Uv Reactor") → its own BoM line, geometry node
// and routed connection. That is the RAS phantom-cost duplication (incl. a self-pipe
// "Computed Uv Reactor → Uv Reactor" and a mis-priced £1M twin). Normalise the group key by
// STRIPPING a leading or embedded `computed` token so both families fold into the SAME logical
// unit — exactly ONE word is ever synthesised/reconciled, under the real (de-prefixed) name.
//   · Strip ONLY a whole `computed` token (`computed_uv_reactor` → `uv_reactor`, `recomputed`
//     is NOT a token so it is untouched), then collapse the freed separators.
//   · NEVER strip to empty: a key named purely `computed_*` with no base noun keeps its phrase
//     (defensive — no such key exists today).
// A `computed_*` key with NO real twin (`computed_degasser_column`, `computed_building_process`)
// still forms its OWN group, just titled by the cleaner de-prefixed phrase — which is correct,
// not an over-merge: it collapses onto a real group ONLY when one shares the same base noun.
function stripComputedToken(phrase: string): string {
  const cleaned = phrase
    .replace(/(^|[_\s])(?:computed|calc)([_\s]|$)/gi, '$1$2') // drop a whole "computed"/"calc" collision-shadow token, keep the boundary
    .replace(/[_\s]{2,}/g, '_') // collapse the gap the removal left
    .replace(/^[_\s]+|[_\s]+$/g, '') // trim leading/trailing separators
  return cleaned.length > 0 ? cleaned : phrase
}
// id-level twin-collapse: drop a leading/embedded `computed_` segment from a word/host id so
// `computed_uv_reactor_synth_word` ↔ `uv_reactor_synth_word`. Mirrors stripComputedToken.
function stripComputedId(id: string): string {
  const cleaned = String(id ?? '').replace(/(^|_)(?:computed|calc)_/i, '$1')
  return cleaned.length > 0 ? cleaned : id
}

function buildGroups(quantities: Record<string, number>): EquipGroup[] {
  const byPhrase = new Map<string, EquipGroup>()
  for (const [key, value] of Object.entries(quantities)) {
    if (!Number.isFinite(value) || value <= 0) continue
    // The building envelope keys synthesizeBuildingStructure writes back
    // (building_footprint_m2 / _gross_floor_area_m2 / _wall_area_m2 / _height_m) DESCRIBE the
    // hall — they are NOT equipment to size or synthesise. Skip them so re-running the
    // contract passes (or the reconcile re-derivation) never mints a phantom "Building
    // Footprint" principal from the area suffix.
    if (/^building_(footprint|gross_floor_area|wall_area|height)_/.test(key)) continue
    // A `calc_*` key is a tool COLLISION-SHADOW: the auto-planner re-emitted a quantity the
    // contract already owns under another name, so the aggregator prefixed it `calc_`. It must
    // NEVER mint its own equipment group — that is the phantom "Calc Biofilter / Calc Degasser /
    // Calc Uv" vessel bug (the real unit is sized from its canonical, non-prefixed key). Universal:
    // no archetype carries a legitimate `calc_*` quantity (BESS/CO2/e-fuel = 0). Same family as the
    // computed_* twin reconciliation — see reconcileComputedTwins + stripComputedToken.
    if (/(^|_)calc_/i.test(key)) continue
    let matched: { phrase: string; measure: Measure; perEach: boolean; volRole?: number } | null = null
    for (const rule of SUFFIX_RULES) {
      if (rule.re.test(key)) {
        // Strip the "computed" twin token so a recomputed alias folds into the real unit's
        // group (one logical unit, one synthesised word) — see stripComputedToken.
        matched = { phrase: stripComputedToken(key.replace(rule.re, '')), measure: rule.measure, perEach: !!rule.each, volRole: rule.volRole }
        break
      }
    }
    if (!matched) continue
    const stems = significantStems(matched.phrase)
    if (stems.length === 0) continue
    const id = stems.join('|')
    let g = byPhrase.get(id)
    if (!g) {
      g = { phrase: matched.phrase, stems, volumeIsEach: false }
      byPhrase.set(id, g)
    }
    switch (matched.measure) {
      case 'volume': {
        // Pick the vessel's CONTAINMENT volume over its internal FILL when a device declares
        // both (tank 153 wins over media 92), and a per-EACH key over a lumped one. Precedence:
        // (1) higher volumeRole — containment(2) > neutral(1) > fill(0); (2) on a tie, a per-each
        // value over a lumped one. First value seen when neither key carries a role/each signal.
        const role = matched.volRole ?? 1
        const curRole = g.volumeRole ?? (g.volume === undefined ? -1 : 1)
        const take = g.volume === undefined
          || role > curRole
          || (role === curRole && matched.perEach && !g.volumeIsEach)
        if (take) {
          g.volume = value
          g.volumeIsEach = matched.perEach
          g.volumeRole = role
        }
        break
      }
      case 'area': g.area = Math.max(g.area ?? 0, value); break
      case 'count': g.count = Math.max(g.count ?? 0, value); break
      case 'power': g.power = Math.max(g.power ?? 0, value); break
      case 'duty': g.duty = Math.max(g.duty ?? 0, value); break
      case 'throughput': g.throughput = Math.max(g.throughput ?? 0, value); break
      case 'rate': if (g.rate === undefined) { g.rate = value; g.rateUnit = 'kg/h' } break
      case 'mass': g.mass = Math.max(g.mass ?? 0, value); break
      case 'current': g.current = Math.max(g.current ?? 0, value); break
    }
  }
  // ── PER-UNIT DUTY GUARD (universal, Tristan 2026-06-19) ───────────────────────
  // A principal's PER-UNIT throughput must equal (authoritative TOTAL ÷ its OWN count).
  // The contract convention is that a `<device>_throughput_m3_h` key is ALREADY per-unit,
  // but a generic/aggregate flow key can leak a PLANT-TOTAL flow into a COUNTED device
  // group (the RAS shape the drawer warns of: a whole-loop 13,360 m³/h landing on a ×8
  // pump/filter group). When a group carries a count ≥2 AND its throughput equals a
  // separately-declared plant-total flow (within tolerance) — i.e. it is the TOTAL, not a
  // per-unit value — divide it by the count so the rating + scaled box are PER-UNIT. This
  // never touches a genuinely per-unit throughput (which does NOT equal the loop total),
  // and never fires for a single unit (count < 2). Deterministic, no class branch.
  const plantTotals: number[] = []
  for (const [key, value] of Object.entries(quantities)) {
    if (!Number.isFinite(value) || value <= 0) continue
    if (/(recircul\w*|total|system|loop)_flow_m3_h$|_flow_m3_h_total$/.test(key)) plantTotals.push(value)
  }
  if (plantTotals.length > 0) {
    for (const g of byPhrase.values()) {
      if (g.throughput === undefined || (g.count ?? 1) < 2) continue
      const near = plantTotals.find((t) => Math.abs(g.throughput! - t) / t <= 0.02)
      if (near !== undefined) {
        g.throughput = g.throughput / Math.round(g.count!)   // total ÷ own count → per-unit
      }
    }
  }
  // ── PER-UNIT FLOW ON A COUNTED FLOW-MACHINE (universal, Tristan 2026-06-19) ──────
  // A counted PUMP / FILTER / DEGASSER is sized from its POWER (kW) so its word shows only kW —
  // the reader cannot see its per-unit FLOW, and the physics critic mis-reads the only visible
  // recirc flow (a per-tank inlet valve at loop÷tanks) as "the pumps deliver X". Surface the
  // per-unit flow ON the machine = (the plant loop flow) ÷ (its own count), so the recirc pump
  // unambiguously reads "1,670 m³/h each" beside its 97 kW. Only a flow-handling machine
  // (pump/filter/screen/degasser/separator by noun) with a count ≥2 and NO own throughput key
  // gets it; a heater/fan/compressor never does. Deterministic, no class table.
  const loopFlow = plantTotals.length > 0 ? Math.max(...plantTotals) : 0
  if (loopFlow > 0) {
    const FLOW_MACHINE = /pump|filter|screen|degass|separator|clarifier|microscreen|strainer/i
    for (const g of byPhrase.values()) {
      if (g.throughput !== undefined) continue
      if ((g.count ?? 1) < 2) continue
      if (g.power === undefined && g.area === undefined) continue
      if (!FLOW_MACHINE.test(g.phrase)) continue
      g.perUnitFlow = loopFlow / Math.round(g.count!)
    }
  }
  // ── REDUNDANT-SHELL SUB-ASPECT SUPPRESSION (universal, Tristan 2026-06-19) ─────────
  // A group whose ONLY physical extent is a VOLUME and whose stems STRICTLY CONTAIN an existing
  // device group that already has its OWN duty (throughput/power) is a REDUNDANT NAME for that
  // device's shell, not a second machine: `degasser_column_volume_m3`(⊃ the `degasser` group
  // sized from its water flow) mints a phantom "Degasser Column" beside the real "Degasser".
  // Mark it a sub-aspect so it does not synthesise a duplicate vessel. SCOPE IS DELIBERATELY
  // NARROW — a distinct sub-MACHINE with its OWN duty (`drum_filter_backwash` pump at 12 m³/h,
  // `drum_filter_screen`) is NOT folded: it is real separate equipment (a panel that
  // double-counts those at the parent's load is a panel load-attribution issue, fixed there, NOT
  // by deleting the part — the synonym/dedup harness invariant requires they survive).
  // Deterministic, no class table; a genuinely distinct vessel shares no superset relation.
  const all = [...byPhrase.values()]
  // ── PER-UNIT VOLUME ↔ AGGREGATE RECONCILE (universal, Tristan 2026-06-19) ───────────
  // A `<device>_volume_each_m3` (per-unit) key is sometimes a STALE leftover of an earlier
  // sizing pass while the plant-AGGREGATE `<...>_volume_m3` for the SAME equipment family was
  // correctly rescaled — on RAS the contract carried rearing_tank_volume_each_m3 = 334 (a 204
  // t/yr leftover) with rearing_tank_count = 4 → 1,336 m³, yet total_tank_volume_m3 = 737. Left
  // alone the synthesised tank renders 334 m³ each (1,336 m³ of tankage the plant does not have),
  // diverging from the authoritative aggregate. The AGGREGATE ÷ COUNT is the authoritative
  // per-unit, so when a group carries a per-EACH volume AND a count ≥2 AND a sibling aggregate
  // `_volume_m3` exists for the SAME device family (sharing the group's device-kind noun, e.g.
  // `tank`; a containment/neutral aggregate, NEVER an internal media/working/fill key), OVERRIDE
  // per_unit = aggregate / count. Universal — any family with the _each_m3 / _volume_m3 / _count
  // triple; deterministic, no class branch. A per-each value with no aggregate twin, or a count <2,
  // is left exactly as the contract computed it.
  // The aggregate for a `<device>_volume_each_m3` group must be a genuine PLANT-AGGREGATE of the
  // SAME named family — NOT another specifically-named vessel that merely shares the generic device
  // noun (e.g. a `rearing_tank` per-each must NOT borrow a `biofilter_tank`'s 515 m³ just because
  // both contain "tank"). Precision: share the group's device-kind noun (tank/vessel/column…) AND,
  // after removing those device nouns, the aggregate's remaining SPECIFIC tokens must be a SUBSET of
  // the group's specific tokens — so `total_tank` (specific tokens ∅ after `total` is a stop-stem →
  // a pure total, ⊆ anything) and a same-family `rearing_tank` aggregate qualify, while
  // `biofilter_tank` (specific token `biofil` ⊄ the rearing group's `rear`) is rejected. Universal.
  const aggregateVolumeForGroup = (g: EquipGroup, deviceToks: string[]): number | undefined => {
    if (deviceToks.length === 0) return undefined
    const groupSpecific = new Set(g.stems.filter((s) => !DEVICE_NOUNS_STEMS.has(s)))
    let best: number | undefined
    for (const [k, v] of Object.entries(quantities)) {
      if (!Number.isFinite(v) || v <= 0) continue
      if (!/_volume_m3$/.test(k)) continue          // a lumped/aggregate volume key …
      if (/_each_m3$/.test(k)) continue             // … NOT a per-each one
      if (/_(media|working|active|bed|packing|liquid|fill|resin)_volume_m3$/.test(k)) continue // NOT an internal fill
      const keyToks = significantStems(k.replace(/_volume_m3$/, ''))
      if (!deviceToks.some((t) => keyToks.includes(t))) continue                 // must share the device-kind noun
      const keySpecific = keyToks.filter((t) => !DEVICE_NOUNS_STEMS.has(t))       // the aggregate's specific tokens
      if (!keySpecific.every((t) => groupSpecific.has(t))) continue              // ⊆ the group's specifics (∅ = a pure total)
      best = Math.max(best ?? 0, v)
    }
    return best
  }
  for (const g of all) {
    if (!g.volumeIsEach || g.volume === undefined || (g.count ?? 0) < 2) continue
    // The device-kind noun(s) the aggregate must share (tank / vessel / column …) — a generic,
    // universal join key, NOT a class table. With no device noun in the name, fall back to the
    // group's own stems so a bare per-each still anchors on its specific name.
    const deviceToks = g.stems.filter((s) => DEVICE_NOUNS_STEMS.has(s))
    const join = deviceToks.length > 0 ? deviceToks : g.stems
    const aggregate = aggregateVolumeForGroup(g, join)
    if (aggregate === undefined) continue
    const perUnit = aggregate / Math.round(g.count!)
    // Only override a genuine divergence (a stale per-each that disagrees with aggregate÷count by
    // >1 %); a per-each that already reconciles with the aggregate is left byte-untouched.
    if (Math.abs(perUnit - g.volume) / Math.max(perUnit, g.volume) > 0.01) {
      g.volume = perUnit
      g.volumeProvenance = 'per-unit-derived-from-aggregate'
    }
  }
  const parentHasOwnDuty = (p: EquipGroup): boolean =>
    ((p.throughput !== undefined && p.throughput >= 10) || (p.power !== undefined && p.power >= 15))
    && phraseLooksLikeDevice(p.phrase)
  for (const g of all) {
    // Only a VOLUME-ONLY superset is a redundant shell name (never a sub-machine with a duty).
    const gVolumeOnly = g.volume !== undefined
      && g.throughput === undefined && g.power === undefined && g.area === undefined
      && g.rate === undefined && g.current === undefined && g.duty === undefined && g.mass === undefined
    if (!gVolumeOnly) continue
    for (const parent of all) {
      if (parent === g) continue
      if (parent.stems.length === 0 || g.stems.length <= parent.stems.length) continue
      if (parent.stems.every((s) => g.stems.includes(s)) && parentHasOwnDuty(parent)) {
        g.subAspect = true
        break
      }
    }
  }
  return all
}

// ── dimension synthesis (Blender- + renderer-parseable strings) ─────────────
// CONTRACT-CANONICAL ⌀×H (#136, council 2026-06-16): the PRINTED diameter and height MUST
// reproduce the vessel's contract volume — a reader (or the GA, or Blender) computing
// π/4·⌀²·H has to get the stated capacity back. The old open-tank path sized ⌀ at the WATER
// depth but printed the +15 % freeboard SHELL height, so the printed pair over-stated the
// volume by the freeboard factor (⌀12.4 × 3.2 m → 386 m³ vs the contract's 334 m³, 15.6 %
// off). We now choose a target aspect, ROUND the diameter to the printed 1-dp value, then
// SOLVE the height from that printed diameter so π/4·⌀²·H = V (rounded to 1 dp it reproduces
// V to within one rounding step). The freeboard story lives in the form prose, not in the
// geometry triple — the (⌀, H, V) the BoM/GA/Blender read is now internally exact.
//   · OPEN process tanks/basins (RAS rearing tank, clarifier, aeration basin, buffer sump)
//     are WIDE + SHALLOW — target water depth grows gently with volume (≈0.4·V^⅓, clamped
//     [1.5, 4] m), the diameter follows, then H is solved back from the rounded diameter.
//   · Mass-transfer COLUMNS/TOWERS stay TALL (target h ≈ 2.2·⌀); everything else neutral
//     (h ≈ ⌀). Keyed on the device NOUN, universal across classes, no `if class`.

/** The single self-consistent (⌀, H) producer for a vessel of working volume V (m³): the
 *  PRINTED, 1-dp-rounded pair reproduces V (π/4·⌀²·H ≈ V). Returns the rounded diameter +
 *  height in metres so EVERY surface (dimension string, plan footprint, Blender) reads ONE
 *  canonical triple. Universal — the aspect is chosen by the device noun, not the class. */
function cylinderDimsForVolume(v: number, phrase = ''): { dia: number; ht: number } {
  const p = phrase.toLowerCase()
  // OPEN process BASINS are wide + shallow; a CLOSED VERTICAL STORAGE tank (water/buffer/day tank — a
  // galvanised or rotomoulded cylinder) is TALL (h≈d). The old test matched bare "tank", so a 40 m³
  // "Fresh Water Tank" came out 5.8 ⌀ × 1.5 m (a paddling pool) instead of the real Enduramaxx 3.64×3.88
  // (physics-critic HIGH: conflicting tank dims). Match only genuine OPEN-basin nouns; a plain storage
  // "tank" falls through to the neutral h≈d aspect. Universal — keyed on the device noun, no class table.
  const isOpenTank = /basin|sump|\bpond\b|reservoir|clarifier|settl|lagoon|\bpit\b|raceway|trough|rearing|\bculture\b|grow[_ -]?out|fish[_ ]?tank|aeration|equali[sz]|balancing|stilling|wet[_ ]?well|open[_ -]?tank/.test(p)
  const isTower = /column|tower|stripper|scrubber|absorber|contactor|degasser/.test(p)
  // Target diameter for the chosen aspect (before printing-rounding).
  let dTarget: number
  if (isOpenTank) {
    const waterDepth = Math.min(4.0, Math.max(1.5, 0.4 * Math.cbrt(v)))
    dTarget = Math.sqrt((4 * v) / (Math.PI * waterDepth))
  } else {
    const a = isTower ? 2.2 : 1.0 // h ≈ a·d
    dTarget = Math.cbrt((4 * v) / (a * Math.PI))
  }
  // Print the diameter at 1 dp, then SOLVE the height from that PRINTED diameter so the
  // emitted pair reproduces V. Choose the 1-dp height that best reproduces V (floor / round
  // / ceil), with a 1.0 m floor (a printed height never collapses below a metre).
  const dia = Math.max(0.1, Math.round(dTarget * 10) / 10)
  const hExact = v / ((Math.PI / 4) * dia * dia)
  const candidates = [Math.floor(hExact * 10) / 10, Math.round(hExact * 10) / 10, Math.ceil(hExact * 10) / 10]
    .map((h) => Math.max(1.0, h))
  const ht = candidates.reduce((best, h) =>
    Math.abs((Math.PI / 4) * dia * dia * h - v) < Math.abs((Math.PI / 4) * dia * dia * best - v) ? h : best)
  return { dia, ht }
}
export function cylinderFromVolumeM3(v: number, phrase = ''): string {
  const { dia, ht } = cylinderDimsForVolume(v, phrase)
  return `${dia.toFixed(1)} m dia x ${ht.toFixed(1)} m`
}
function boxFromRatingKw(kw: number): string {
  const side = Math.min(6, Math.max(0.6, 1.2 * Math.cbrt(kw / 100)))
  const mm = Math.round(side * 1000)
  return `${mm}x${Math.round(mm * 0.85)}x${Math.round(mm * 1.1)} mm`
}
function boxFromThroughputM3h(q: number): string {
  const side = Math.min(7, Math.max(0.7, 1.4 * Math.cbrt(q / 1000)))
  const mm = Math.round(side * 1000)
  return `${mm}x${Math.round(mm * 0.85)}x${Math.round(mm * 1.1)} mm`
}

// Display a working volume so the printed CAPACITY stays consistent with the printed ⌀×H even
// at small scale: integer truncation of a 1.3 m³ vessel to "1" would read 24 % off its own
// ⌀1.2×1.1 ≈ 1.2 m³ dimension. Keep 1 dp below 100 m³ (where the rounding granularity bites),
// integer at/above (a 334 m³ tank stays "334"). The contract value is the authoritative anchor;
// this only governs its DISPLAY precision so the (⌀, H, V) triple reconciles at every scale.
function formatCapacityM3(v: number): string {
  return v < 100 ? String(Math.round(v * 10) / 10) : String(Math.round(v))
}
// Emit a kW RATING faithfully to the contract value rather than integer-truncating it: a 2.5 kW
// aeration blower or a 54.6 kW degasser blower must read its CONTRACT value verbatim, never
// `Math.round` (2.5 → 3, 54.6 → 55) — the audit caught the emitted blower rating (3 kW) diverging
// from the contract quantity (2.5 kW). Keep 1 dp below 100 kW (where the rounding granularity
// bites), integer at/above; strip a trailing `.0` so a whole number stays clean. Universal.
function formatRatingKw(kw: number): string {
  return kw < 100 ? String(Math.round(kw * 10) / 10) : String(Math.round(kw))
}
function dimAndRatingFor(g: EquipGroup): ModifierCharacter[] {
  const add: ModifierCharacter[] = []
  if (g.volume !== undefined) {
    add.push(mod('dimension', cylinderFromVolumeM3(g.volume, g.phrase)))
    add.push(mod('capacity', formatCapacityM3(g.volume), 'm³'))
  } else if (g.area !== undefined) {
    add.push(mod('dimension', `${Math.round(g.area)} m² area`))
  } else if (g.power !== undefined) {
    add.push(mod('dimension', boxFromRatingKw(g.power)))
  } else if (g.throughput !== undefined) {
    add.push(mod('dimension', boxFromThroughputM3h(g.throughput)))
  }
  if (g.power !== undefined) add.push(mod('rating_primary', `${Math.round(g.power)}`, 'kW'))
  else if (g.throughput !== undefined) add.push(mod('rating_primary', `${Math.round(g.throughput)}`, 'm³/h'))
  else if (g.duty !== undefined) add.push(mod('rating_primary', `${Math.round(g.duty)}`, 'kW'))
  else if (g.rate !== undefined) add.push(mod('rating_primary', `${Math.round(g.rate)}`, g.rateUnit || 'kg/h'))
  else if (g.current !== undefined) add.push(mod('rating_primary', `${Math.round(g.current)}`, 'A'))
  // Per-unit FLOW as a secondary rating on a counted flow-machine (the recirc pump's 1,670 m³/h
  // beside its 97 kW) — so the machine itself states its duty, not only the inlet valve.
  if (g.perUnitFlow !== undefined && g.throughput === undefined) {
    add.push(mod('rating_secondary', `${Math.round(g.perUnitFlow)}`, 'm³/h'))
  }
  return add
}

// Universal device-noun morphology: a vessel/footprint (volume/area) is ALWAYS a
// discrete equipment item, but a throughput/power only denotes equipment worth
// synthesising when the phrase NAMES a device — either a known device noun or an
// "-er/-or" agent noun (degasser, stripper, blower, clarifier). This is what keeps
// `recirculation_flow` (a SYSTEM flow → "-tion" process noun) from minting a bogus box
// while `degasser_air_flow` (a device) correctly synthesises. No per-class table.
const DEVICE_NOUNS = new Set([
  'pump', 'fan', 'tank', 'vessel', 'column', 'tower', 'skid', 'unit', 'exchanger', 'hex',
  'chiller', 'boiler', 'degasser', 'filter', 'blower', 'compressor', 'reactor',
  'clarifier', 'separator', 'stripper', 'mixer', 'press', 'membrane', 'sump',
  'basin', 'cone', 'scrubber', 'cyclone', 'centrifuge', 'hopper', 'silo', 'drum',
])
// The same device nouns reduced to the 5-char STEM form (matching significantStems), used as the
// universal join key for the per-unit↔aggregate volume reconcile in buildGroups: a `_each_m3`
// group and its plant-aggregate `_volume_m3` are the SAME family when they share a device-kind
// stem (rearing_tank `tank` ↔ total_tank `tank`). Referenced only at call-time, never at load.
const DEVICE_NOUNS_STEMS = new Set<string>([...DEVICE_NOUNS].map((n) => stem(n)))
function phraseLooksLikeDevice(phrase: string): boolean {
  for (const raw of phrase.split(/[_\s]+/)) {
    const t = raw.toLowerCase()
    if (DEVICE_NOUNS.has(t)) return true
    if (t.length > 4 && /(er|or)$/.test(t)) return true
  }
  return false
}

// A group is SYNTHESISABLE equipment (worth creating if absent) when it has a real
// physical extent: a vessel volume or a footprint area (always), or a throughput /
// device power whose phrase actually names a device. A load/duty/rate/mass/current,
// or a system flow with a process-noun phrase, is NOT equipment.
function isSynthesisable(g: EquipGroup): boolean {
  // A sub-aspect of a larger principal (degasser_column ⊂ a degasser) is not a second machine.
  if (g.subAspect) return false
  if (g.volume !== undefined && g.volume >= 1) return true
  if (g.area !== undefined && g.area >= 2) return true
  if ((g.throughput !== undefined && g.throughput >= 10) || (g.power !== undefined && g.power >= 15)) {
    return phraseLooksLikeDevice(g.phrase)
  }
  return false
}

// A phrase that NAMES a reporting aggregate (a roll-up SUM across real units), never a
// discrete vessel — `total_water_storage`, `overall_tank_volume`, `combined_buffer`. The
// engine already treats a `total_*` volume as the per-unit↔aggregate reconciliation anchor
// (aggregateVolumeForGroup); this marks the same family so it is never ALSO synthesised as
// its own physical mega-vessel (the physics-critic HIGH: a single 262 m³ "Total Water
// Storage" tank standing in for the brief's three separate 40 m³ tanks → cross-contamination).
const AGGREGATE_MARKER_RE = /\b(total|overall|combined|aggregate|grand|whole|sum)\b/i
function isPureAggregatePhrase(phrase: string): boolean {
  // Normalise `_` → space first: `\b` does NOT break between word-chars `l` and `_`, so a raw
  // `total_water_storage` phrase would evade `\btotal\b` without this.
  return AGGREGATE_MARKER_RE.test(String(phrase ?? '').replace(/_/g, ' '))
}

// ── cleanup (Round 3): physics-first BoM — drop the skeleton's leftover junk ──
// Small generic detailed-design filler that is never PRINCIPAL equipment (keeps it
// out of the GA + the headline cost). Structure/enclosure are NOT here — they're real.
const PADDING_RE = /mounting\s+(bracket|hardware)|fastener\s+set|wiring\s+harness|gasket\s+seal|access\s+panel|service\s+connector|diagnostic\s+port|labelling\s+set|lifting\s+(point|lug)|\b(primary|secondary)\s+assembly\b/i
// Generic head-nouns that must NOT trigger a duplicate-drop (every pump/tank shares
// them); dedup fires only on a SPECIFIC shared stem (filt, degas, biofi…).
const DEDUP_GENERIC_STOP = new Set(['pump', 'tank', 'unit', 'syst', 'modu', 'pane', 'devi', 'asse'])
// A skeleton placeholder (no real catalogue MPN) — only these are ever dropped; a
// real grounded part (structured MPN) is always kept.
function isPlaceholder(w: WordLike): boolean {
  const pn = String((w.modifier_characters ?? []).find((m) => m.kind === 'part_number')?.value ?? '')
  return pn === '' || /tbd|detailed design|specify|representative/i.test(pn)
}

// ── sub-assembly explosion (PHYSICS-DERIVED — Tristan 2026-06-13 "make depth physics
// derived"). A real plant BoM is 200+ parts because every principal equipment is an
// ASSEMBLY. Earlier this was a flat name template with TBD parts + ALLOCATED prices
// (rejected as "made up"). Now each sub-component is SIZED from the parent's physics
// (motor kW from pump duty, shell area from the vessel's computed dia×height, drum from
// throughput) and PRICED BOTTOM-UP from that size via universal engineering cost factors
// (£/kW, £/m², £/m³, flat-rate instruments). Universal by equipment TYPE — the physics
// of a pump is identical in any plant — so no per-class table. The component prices SUM
// to the equipment cost; the contract's installed-cost anchor becomes a cross-check, not
// the source. Nothing is allocated; every line traces to the parent's computed physics.
interface ParentPhysics { kw: number; m3: number; m3h: number; diaM: number; htM: number; qty: number; motorKwOverride?: number }
interface SubSpec { name: string; derive: (p: ParentPhysics) => { size?: string; rating?: { v: number; u: string }; gbp: number } }

function parentQty(w: WordLike): number {
  const mt = /(\d+)/.exec(String((w.modifier_characters ?? []).find((m) => m.kind === 'quantity')?.value ?? '1'))
  return mt ? Math.max(1, parseInt(mt[1], 10)) : 1
}
function readParentPhysics(w: WordLike): ParentPhysics {
  const mods = w.modifier_characters ?? []
  const r = mods.find((m) => m.kind === 'rating_primary')
  const cap = mods.find((m) => m.kind === 'capacity')
  const dimv = String(mods.find((m) => m.kind === 'dimension' || m.kind === 'dimensions')?.value ?? '')
  let kw = 0, m3h = 0
  if (r) {
    const v = parseFloat(String(r.value)) || 0
    const u = String(r.unit ?? '').toLowerCase()
    if (u.includes('kw') || u.includes('kva')) kw = v
    else if (u.includes('m³/h') || u.includes('m3/h') || u.includes('m³/hr')) m3h = v
  }
  const m3 = cap && /m³|m3/.test(String(cap.unit ?? '')) ? parseFloat(String(cap.value)) || 0 : 0
  const dm = /([\d.]+)\s*m\s*dia/i.exec(dimv)
  const hm = /dia[^x]*x\s*([\d.]+)\s*m/i.exec(dimv)
  return { kw, m3, m3h, diaM: dm ? parseFloat(dm[1]) : 0, htM: hm ? parseFloat(hm[1]) : 0, qty: parentQty(w) }
}

const R2 = (n: number) => Math.round(n)
// Motor/VSD electrical power for a pump/blower/fan. PREFER the hydraulic motor power the
// sizing tool already computed into the contract (motorKwOverride — P=ρgQH/η, the RIGHT
// physics that knows the head); only when absent fall back to the crude flow heuristic.
// Without this, a FLOW-rated pump (p.kw=0) collapsed to the 1.5 kW floor because the
// heuristic ignores head entirely (e.g. 90 m³/h @ 3.5 bar → true ≈ 9.7 kW, was floored to
// ~2 kW). The motor is the most-flagged pump physics error; this makes it scale with duty.
// Flow-only fallback (no contract motor_kw, no device kW): estimate shaft power from the
// hydraulic relation P[kW] = Q[m³/h]·ΔP[bar] / (36·η) at a SENSIBLE DEFAULT head. The old
// `m3h/120` implied ΔP ≈ 0.18 bar — physically absurd for any pumped duty (a 25 m³/h hand-
// watering pump came out ~0.2 kW → floored to 1.5, the physics-critic "2 kW undersized for
// 25 m³/h @ 3 bar" HIGH). A real process-water pump runs ~2–4 bar; assume ΔP=2.5 bar, η=0.62
// when the contract gives no head → 25 m³/h → ~2.8 kW (vs the brief's 3 bar → ~3.5 kW: honest,
// no over-claim without the real head, but no longer absurdly low). Override path (the sizing
// tool's true P=ρgQH/η) is UNCHANGED — this only governs a pump the contract never head-sized.
const FLOW_PUMP_DEFAULT_BAR = 2.5
const FLOW_PUMP_EFF = 0.62
// Standard IEC three-phase motor frames (kW). You cannot buy a "9.653 kW" motor — a real motor is
// SELECTED at the next standard frame ABOVE the required power with a service margin. Rounding the
// derived shaft power up to the next frame (×1.15 service factor) gives the honest NAMEPLATE rating
// the physics critic checks against (90 m³/h @ 3.5 bar → ~8.75 kW hydraulic / ~12 kW shaft @ η0.72 →
// 15 kW frame) instead of a bare hydraulic number that reads as undersized. UNIVERSAL — any motor.
const IEC_MOTOR_FRAMES_KW = [
  0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200,
  250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000,
]
const MOTOR_SERVICE_FACTOR = 1.15
function nextMotorFrameKw(kw: number): number {
  if (!(kw > 0)) return kw
  const need = kw * MOTOR_SERVICE_FACTOR
  for (const f of IEC_MOTOR_FRAMES_KW) if (f >= need - 1e-9) return f
  return Math.ceil(need)
}
const motorKw = (p: ParentPhysics) =>
  nextMotorFrameKw(
    (p.motorKwOverride && p.motorKwOverride > 0)
      ? p.motorKwOverride
      : Math.max(1.5, (p.kw / 0.88) || (p.m3h ? (p.m3h * FLOW_PUMP_DEFAULT_BAR) / (36 * FLOW_PUMP_EFF) : 30 / 0.88)),
  )

// Read a pump/rotating parent's already-computed motor/drive power (kW) from the contract
// quantities by stem (e.g. parent 'Irrigation Pump' → irrigation_pump_motor_kw=9.653). The
// hydraulic sizing tool (process:/irrigation:pump-sizing) emits *_motor_kw / *_power_kw for
// pumps across EVERY process archetype, so this is universal — no per-class table.
function motorKwFromContract(w: WordLike, quantities: Record<string, number>): number {
  const stems = wordStems(w).filter((s) => !['synth', 'word', 'system', 'unit', 'assembly'].includes(s))
  if (stems.length < 2) return 0 // need ≥2 distinctive stems (e.g. irrigation+pump) to bind unambiguously
  let best = 0, bestScore = 1
  for (const [k, v] of Object.entries(quantities)) {
    if (!(v > 0)) continue
    if (!/_(motor_kw|motor_power_kw|power_kw|drive_kw)$/.test(k)) continue
    // stem the key tokens the SAME way wordStems does (5-char truncation) so
    // 'irrigation' (key) ≡ 'irrig' (word stem) — otherwise nothing ever binds.
    const ktoks = new Set(k.toLowerCase().split(/[^a-z0-9]+/).map(stem))
    const overlap = stems.reduce((n, s) => n + (ktoks.has(s) ? 1 : 0), 0)
    if (overlap >= 2 && overlap > bestScore) { bestScore = overlap; best = v }
  }
  return best
}
const vesselArea = (p: ParentPhysics) => { const d = p.diaM || Math.cbrt(((p.m3 || 50) * 4) / Math.PI); const h = p.htM || d; return { shell: Math.PI * d * h, head: (Math.PI * d * d) / 4, d, h } }

// Each entry: parts SIZED + PRICED from the parent's physics. Cost factors are
// engineering order-of-magnitude (UK, installed-equipment basis), universal by type.
const SUB_ASSEMBLY: { re: RegExp; parts: SubSpec[] }[] = [
  // OPEN ATMOSPHERIC TANK (#144) — checked FIRST so a rearing tank / basin / MBBR biofilter
  // explodes into OPEN-TANK parts (wall + graded floor + dual-drain + walkway), NOT the
  // pressure-vessel parts below (top head, support skirt, manway, PVRV) that don't exist on
  // a tank open to atmosphere. Closed vessels (degasser column, reactor, pressure vessel)
  // don't match this noun set and fall through to the steel pressure-vessel list. Matches
  // the OPEN/CLOSED split in requirements_bom.py::_materials_takeoff so cost + breakdown agree.
  { re: /\btank\b|\bbasin\b|\bsump\b|\bpond\b|biofilter|clarifier|raceway|lagoon/i,
    parts: [
      { name: 'Tank Wall (laminate)', derive: (p) => { const a = vesselArea(p); return { size: `${a.d.toFixed(1)} m dia × ${a.h.toFixed(1)} m`, gbp: a.shell * 240 } } },
      { name: 'Tank Floor (graded to centre)', derive: (p) => ({ gbp: vesselArea(p).head * 220 }) },
      { name: 'Dual Drain / Centre Standpipe', derive: () => ({ gbp: 1800 }) },
      { name: 'Side Drain & Overflow', derive: () => ({ gbp: 900 }) },
      { name: 'Inlet Distribution Ring', derive: (p) => ({ gbp: 600 + (p.m3 || 50) * 4 }) },
      { name: 'Internal Flow Baffles', derive: (p) => ({ gbp: 500 + (p.m3 || 50) * 3 }) },
      { name: 'Rim Stiffener', derive: (p) => ({ gbp: 400 + vesselArea(p).d * 120 }) },
      { name: 'Access Walkway & Handrail', derive: (p) => ({ gbp: 1800 + (p.htM || 3) * 300 }) },
      { name: 'Internal Gelcoat / Lining', derive: (p) => { const a = vesselArea(p); return { gbp: (a.shell + a.head) * 45 } } },
      { name: 'Earthing Boss', derive: () => ({ gbp: 120 }) },
      { name: 'Nameplate', derive: () => ({ gbp: 60 }) },
    ] },
  { re: /vessel|reservoir|reactor|\bcolumn\b|tower|degass|digester|scrubber|\btank\b|basin|\bsump\b/i,
    parts: [
      { name: 'Shell Course', derive: (p) => { const a = vesselArea(p); return { size: `${a.d.toFixed(1)} m dia × ${a.h.toFixed(1)} m`, gbp: a.shell * 430 } } },
      { name: 'Top Head / Roof', derive: (p) => ({ gbp: vesselArea(p).head * 380 }) },
      { name: 'Base / Floor Plate', derive: (p) => ({ gbp: vesselArea(p).head * 340 }) },
      { name: 'Support Skirt / Legs', derive: (p) => ({ gbp: 1500 + (p.m3 || 50) * 12 }) },
      { name: 'Manway & Cover', derive: () => ({ gbp: 1400 }) },
      { name: 'Inlet Nozzle Set', derive: () => ({ gbp: 650 }) },
      { name: 'Outlet Nozzle Set', derive: () => ({ gbp: 650 }) },
      { name: 'Drain Nozzle', derive: () => ({ gbp: 450 }) },
      { name: 'Overflow / Weir', derive: () => ({ gbp: 700 }) },
      { name: 'Internal Distribution', derive: (p) => ({ gbp: 800 + (p.m3 || 50) * 6 }) },
      // Process instrumentation (level / temperature / pressure / dissolved-O₂ / pH) is
      // synthesised PROPERLY by synthesizeInstrumentation() — driven by the contract's
      // declared control variables, wired as signal, priced as catalogue-class field
      // instruments — so it is no longer buried here as a generic vessel fitting. What
      // stays is the MECHANICAL safety fitting (a vent / relief, correct for an open
      // tank's atmospheric breather AND a pressurised vessel's PVRV).
      { name: 'Tank Vent / Pressure Relief', derive: () => ({ gbp: 700 }) },
      { name: 'Access Ladder & Platform', derive: (p) => ({ gbp: 1800 + (p.htM || 4) * 320 }) },
      { name: 'Internal Lining / Coating', derive: (p) => { const a = vesselArea(p); return { gbp: (a.shell + a.head) * 55 } } },
      { name: 'Earthing Boss', derive: () => ({ gbp: 120 }) },
      { name: 'Nameplate', derive: () => ({ gbp: 60 }) },
    ] },
  { re: /(?<!heat[\s-])\bpump\b|blower|(?<!scroll\s)compressor|\bfan\b/i,  // NOT 'heat pump' (its own rule below)
    parts: [
      { name: 'Casing', derive: (p) => ({ gbp: 1500 + (p.kw || 30) * 14 }) },
      { name: 'Impeller / Rotor', derive: (p) => ({ gbp: 600 + (p.kw || 30) * 5 }) },
      { name: 'Drive Motor', derive: (p) => ({ rating: { v: motorKw(p), u: 'kW' }, gbp: 1200 + motorKw(p) * 48 }) },
      { name: 'Variable-Speed Drive', derive: (p) => ({ rating: { v: motorKw(p), u: 'kW' }, gbp: 800 + motorKw(p) * 72 }) },
      { name: 'Flexible Coupling', derive: (p) => ({ gbp: 300 + (p.kw || 30) * 2 }) },
      { name: 'Coupling Guard', derive: () => ({ gbp: 180 }) },
      { name: 'Baseplate', derive: (p) => ({ gbp: 600 + (p.kw || 30) * 4 }) },
      { name: 'Mechanical Seal', derive: (p) => ({ gbp: 900 + (p.kw || 30) * 9 }) },
      { name: 'Suction Isolation Valve', derive: (p) => ({ gbp: 400 + (p.kw || 30) * 6 }) },
      { name: 'Discharge Isolation Valve', derive: (p) => ({ gbp: 400 + (p.kw || 30) * 6 }) },
      { name: 'Non-Return Valve', derive: (p) => ({ gbp: 350 + (p.kw || 30) * 4 }) },
      { name: 'Discharge Pressure Gauge', derive: () => ({ gbp: 160 }) },
      { name: 'Anti-Vibration Mounts', derive: () => ({ gbp: 220 }) },
    ] },
  // PRESSURE-VESSEL FILTER (GAC / activated-carbon / sand / multimedia / cartridge / softener /
  // ion-exchange / RO / UF / NF membrane) — a CLOSED pressure vessel with a media bed OR membrane
  // elements, NOT a rotary drum/microscreen. MUST be matched BEFORE the drum-filter rule so a 'Gac
  // Filter' / 'Ro Membrane' never inherits a drum + gearmotor + backwash spray bar + reject trough
  // (the physics-critic HIGH: "the Gac Filter / RO Membrane sub-module contains rotary drum-filter
  // components"). Universal — keyed on the media/membrane noun, no class table.
  { re: /\bgac\b|granular.?activ|activated.?carbon|carbon.?filter|sand.?filter|multi.?media|cartridge|\bmembrane\b|reverse.?osmos|\bro\b|\buf\b|ultrafiltrat|nanofiltrat|\bnf\b|softener|ion.?exchange|\bresin\b|deioni/i,
    parts: [
      { name: 'Pressure Vessel Shell', derive: (p) => ({ rating: { v: p.m3h || 15, u: 'm³/h' }, gbp: 3000 + (p.m3h || 15) * 90 }) },
      { name: 'Filter Media / Membrane Elements', derive: (p) => ({ gbp: 2000 + (p.m3h || 15) * 65 }) },
      { name: 'Upper Distribution Header', derive: () => ({ gbp: 900 }) },
      { name: 'Lower Underdrain / Nozzle Plate', derive: () => ({ gbp: 1200 }) },
      { name: 'Backwash / Service Valve Nest', derive: () => ({ gbp: 2600 }) },
      { name: 'Differential-Pressure Gauges', derive: () => ({ gbp: 320 }) },
      { name: 'Air Scour / Vent', derive: () => ({ gbp: 480 }) },
      { name: 'Sample Cock', derive: () => ({ gbp: 140 }) },
      { name: 'Skid Frame & Pipework', derive: () => ({ gbp: 1800 }) },
      { name: 'Nameplate', derive: () => ({ gbp: 60 }) },
    ] },
  // ROTARY DRUM / MICROSCREEN / DISC / CLOTH / BAND SCREEN filter — a moving-media screen with a
  // drum, drive gearmotor, backwash spray bar + reject trough. NARROWED from the old broad
  // /filter|membrane/ (which swept GAC + RO into here) to the genuine rotary-screen vocabulary.
  { re: /drum.?filter|micro.?screen|rotary.?(?:drum|screen|disc)|disc.?filter|cloth.?filter|\bscreen\b|band.?screen|travel(?:ling)?.?screen|\bstrainer\b|skimmer/i,
    parts: [
      { name: 'Drum / Element', derive: (p) => ({ rating: { v: p.m3h || 500, u: 'm³/h' }, gbp: 4000 + (p.m3h || 500) * 1.1 }) },
      { name: 'Media / Mesh Panels', derive: (p) => ({ gbp: 1500 + (p.m3h || 500) * 0.4 }) },
      { name: 'Drive Gearmotor', derive: (p) => ({ rating: { v: Math.max(0.55, (p.m3h || 500) / 3500), u: 'kW' }, gbp: 1400 }) },
      { name: 'Backwash Spray Bar', derive: () => ({ gbp: 900 }) },
      { name: 'Backwash Pump', derive: () => ({ gbp: 2200 }) },
      { name: 'Reject Trough', derive: () => ({ gbp: 1100 }) },
      { name: 'Differential-Pressure Switch', derive: () => ({ gbp: 420 }) },
      { name: 'Support Frame', derive: () => ({ gbp: 1600 }) },
      { name: 'Local Control Panel', derive: () => ({ gbp: 3800 }) },
    ] },
  { re: /heat[\s-]?exchang|\bhx\b|condenser|evaporator|\bcooler\b/i,
    parts: [
      { name: 'Shell', derive: (p) => ({ rating: { v: p.kw || 200, u: 'kW' }, gbp: 2500 + (p.kw || 200) * 9 }) },
      { name: 'Tube Bundle', derive: (p) => ({ gbp: 3000 + (p.kw || 200) * 18 }) },
      { name: 'Tube Sheet', derive: () => ({ gbp: 1400 }) },
      { name: 'Channel Cover', derive: () => ({ gbp: 1100 }) },
      { name: 'Inlet Nozzle', derive: () => ({ gbp: 600 }) },
      { name: 'Outlet Nozzle', derive: () => ({ gbp: 600 }) },
      { name: 'Gasket Set', derive: () => ({ gbp: 450 }) },
      { name: 'Support Saddles', derive: () => ({ gbp: 900 }) },
      { name: 'Vent & Drain Valves', derive: () => ({ gbp: 520 }) },
    ] },
  { re: /heat[\s-]?pump|chiller|refrigerat/i,
    parts: [
      { name: 'Scroll Compressor', derive: (p) => ({ rating: { v: p.kw || 200, u: 'kW' }, gbp: 4000 + (p.kw || 200) * 95 }) },
      { name: 'Evaporator Coil', derive: (p) => ({ gbp: 1800 + (p.kw || 200) * 22 }) },
      { name: 'Condenser Coil', derive: (p) => ({ gbp: 1800 + (p.kw || 200) * 22 }) },
      { name: 'Expansion Valve', derive: () => ({ gbp: 650 }) },
      { name: 'Refrigerant Charge', derive: (p) => ({ gbp: 600 + (p.kw || 200) * 6 }) },
      { name: 'Suction Accumulator', derive: () => ({ gbp: 900 }) },
      { name: 'Refrigerant Pressure Switches', derive: () => ({ gbp: 520 }) },
      { name: 'Control Panel', derive: () => ({ gbp: 4200 }) },
      { name: 'Frame & Panels', derive: (p) => ({ gbp: 1500 + (p.kw || 200) * 4 }) },
      { name: 'Anti-Vibration Mounts', derive: () => ({ gbp: 280 }) },
    ] },
  { re: /oxygen|aerat|\buv\b|ozone|steriliz|disinfe|skimming/i,
    parts: [
      { name: 'Process Unit', derive: (p) => ({ gbp: 3000 + (p.m3h || p.kw || 100) * 3 }) },
      { name: 'Inlet / Outlet Manifolds', derive: () => ({ gbp: 1200 }) },
      { name: 'Flow Control Valve', derive: () => ({ gbp: 800 }) },
      { name: 'Dosing / Lamp Module', derive: () => ({ gbp: 2400 }) },
      { name: 'Local Sensor', derive: () => ({ gbp: 900 }) },
      { name: 'Control & Power Module', derive: () => ({ gbp: 2600 }) },
      { name: 'Mounting Frame', derive: () => ({ gbp: 1100 }) },
    ] },
]

function sanitizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'part'
}
function subWord(spec: SubSpec, parentId: string, qty: number, physics: ParentPhysics): WordLike & { _subcomponent?: boolean } {
  const d = spec.derive(physics)
  const mods: ModifierCharacter[] = [mod('quantity', `×${qty}`)]
  if (d.size) mods.push(mod('dimension', d.size))
  if (d.rating) mods.push(mod('rating_primary', String(R2(d.rating.v)), d.rating.u))
  mods.push(mod('price_estimate_gbp', String(Math.max(1, R2(d.gbp)))))   // BOTTOM-UP physics price
  mods.push(mod('form', `${spec.name} (assembly component)`))
  mods.push(mod('part_number', 'TBD (detailed design)'))
  mods.push(mod('lifecycle', 'Concept design — sized from parent physics; exact MPN at detailed design'))
  return {
    id: `${parentId}__${sanitizeId(spec.name)}`,
    name_human: spec.name,
    content_character: { character_id: `${parentId}__${sanitizeId(spec.name)}`, name_human: spec.name },
    modifier_characters: mods,
    _subcomponent: true,
  }
}

/** Append each principal equipment's PHYSICS-SIZED sub-components (qty inherited), each
 *  priced bottom-up from the parent's computed physics. Mutates modules in place; returns
 *  the number of sub-component lines added. Universal by equipment type. */
export function explodeEquipmentSubAssemblies(modules: ModuleLike[], quantities: Record<string, number> = {}, maxDepth = 3): number {
  // IDEMPOTENT + RECURSIVE: explode ONE level of the un-exploded frontier per call. A
  // part already carrying children is skipped (so re-running never duplicates — the
  // bug that gave a pump 39 children); a sub-component that itself matches a rule (a
  // heat-pump's Scroll Compressor → pump parts, an Evaporator Coil → exchanger parts,
  // a filter's Backwash Pump) explodes on the NEXT call, so the iteration LOOP deepens
  // the BoM a level at a time and settles when nothing un-exploded matches (capped at
  // maxDepth '__' levels). Returns the number of sub-component lines added THIS call.
  const hasChildren = new Set<string>()
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      for (const w of sm.words) {
        const id = String(w.id ?? '')
        const cut = id.lastIndexOf('__')
        if (cut > 0) hasChildren.add(id.slice(0, cut))
      }
    }
  }
  let added = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      const out: WordLike[] = []
      for (const w of sm.words) {
        out.push(w)
        if (isInstrument(w) || isActuator(w) || isUtility(w) || isProcessSystem(w) || isBuildingStructure(w)) continue   // instrument / valve / blower / whole system / building element — priced whole, not exploded
        const id = String(w.id ?? '')
        const depth = (id.match(/__/g) ?? []).length
        if (depth >= maxDepth) continue          // too deep — stop the recursion
        if (hasChildren.has(id)) continue         // already exploded — idempotent
        const nm = w.name_human ?? ''
        const rule = SUB_ASSEMBLY.find((r) => r.re.test(nm))
        if (!rule) continue
        const physics = readParentPhysics(w)
        // CONSUME-THE-CONTRACT: a flow-rated pump has p.kw=0, so the Drive Motor + VSD would
        // collapse to the 1.5 kW floor. Bind the hydraulic motor power the sizing tool already
        // computed (e.g. irrigation_pump_motor_kw=9.653) so the motor reflects the real duty +
        // the casing/impeller/baseplate scale off the true power. Universal across all pumps.
        const cmk = motorKwFromContract(w, quantities)
        if (cmk > 0) { physics.motorKwOverride = cmk; if (physics.kw === 0) physics.kw = cmk }
        for (const spec of rule.parts) {
          out.push(subWord(spec, id || sanitizeId(nm), physics.qty, physics))
          added += 1
        }
      }
      sm.words = out
    }
  }
  return added
}

// ── matching ────────────────────────────────────────────────────────────────
function wordStems(w: WordLike): string[] {
  return significantStems(
    `${w.name_human ?? ''} ${w.content_character?.character_id ?? ''} ${w.content_character?.name_human ?? ''}`,
  )
}
function scoreMatch(wStems: string[], g: EquipGroup): number {
  let s = 0
  for (const gs of g.stems) if (wStems.includes(gs)) s += 1
  return s
}
function completeness(g: EquipGroup): number {
  return (g.volume !== undefined ? 1 : 0) + (g.count !== undefined ? 1 : 0) + (g.power !== undefined ? 1 : 0)
}

// ── module placement for synthesised equipment (universal module taxonomy) ──
// Ordered: treatment terms before tank (a "biofilter tank" is treatment, not bare
// containment); each maps an equipment keyword family → the universal module id.
const PLACEMENT: { re: RegExp; module: RegExp }[] = [
  { re: /filter|biofil|degas|skim|clarif|\buv\b|ozone|treat|media|membran|aerat|settl|disinfe|steril/i, module: /water_treatment|treatment|process/i },
  { re: /pump|blower|compress|\bfan\b|manifold|\bpipe|flow|valve|duct/i, module: /mass_fluid|fluid|transport|process/i },
  { re: /heat|chill|boiler|thermal|hvac|cool|refrig|exchang|\bhex\b|\bhx\b|condenser|evaporator|dehumid|latent/i, module: /environment|thermal|interface/i },
  { re: /tank|vessel|reservoir|sump|basin|silo|hopper|column|tower|cone|enclos|frame|contain/i, module: /structure|contain|process/i },
]

function pickModule(modules: ModuleLike[], phrase: string): ModuleLike | undefined {
  const idOf = (m: ModuleLike): string => String((m as { module?: string }).module ?? '')
  for (const rule of PLACEMENT) {
    if (rule.re.test(phrase)) {
      const hit = modules.find((m) => rule.module.test(idOf(m)) && (m.sub_modules?.length ?? 0) > 0)
      if (hit) return hit
    }
  }
  // fallback: structure/containment, else the first module that has a sub-module
  return (
    modules.find((m) => /structure|contain/i.test(idOf(m)) && (m.sub_modules?.length ?? 0) > 0) ||
    modules.find((m) => (m.sub_modules?.length ?? 0) > 0)
  )
}

function titleCase(phrase: string): string {
  return phrase
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function synthWord(g: EquipGroup): WordLike & { _synthesized?: boolean } {
  const title = titleCase(g.phrase)
  const mods: ModifierCharacter[] = []
  if (g.count !== undefined && g.count >= 2) mods.push(mod('quantity', `×${Math.round(g.count)}`))
  else mods.push(mod('quantity', '×1'))
  mods.push(...dimAndRatingFor(g))
  mods.push(mod('form', `${title} — principal equipment sized from the engineering contract`))
  mods.push(mod('part_number', 'TBD (detailed design)'))
  mods.push(mod('lifecycle', 'Concept design — catalogue part + exact MPN confirmed at detailed design'))
  mods.push(mod('installation', 'Internal / external placement confirmed at layout / detailed design'))
  return {
    id: `${g.phrase}_synth_word`,
    name_human: title,
    content_character: { character_id: `${g.phrase}_synth`, name_human: title },
    modifier_characters: mods,
    _synthesized: true,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PROCESS INSTRUMENTATION SYNTHESIS (Tristan #140 — life-safety per-vessel).
//
// Universal principle: "you cannot control what you do not measure." Every PROCESS
// CONTROL VARIABLE the contract declares a setpoint / target / load for demands a
// field instrument, placed where that variable physically lives:
//   · FAST, inventory-specific VITAL SIGNS (level + temperature + dissolved O₂) are
//     measured PER fluid-vessel instance — a tank's dissolved O₂ is drawn down by its
//     OWN stock and cannot be inferred from a neighbour; a level / temperature excursion
//     in one tank is invisible to a probe in another.
//   · SLOW, loop-homogeneous CHEMISTRY (pH, salinity / conductivity) is measured ONCE on
//     the common recirculation loop (it is dosed / controlled centrally).
//   · PRESSURE is added only where a vessel is PRESSURISED (the contract declares a design
//     pressure above atmospheric); an open tank correctly receives none.
// The set of variables is read from the contract's own quantity KEYS — a pharma reactor
// with a pH setpoint, an anaerobic digester with a temperature band and a RAS rearing
// tank with a dissolved-O₂ target all light up the same way. No per-class table.
//
// Each instrument is a first-class word in the sensing / instrumentation module (so the
// single-line + P&ID wire it as SIGNAL via the module-primary service classifier), at
// the right per-vessel quantity, carrying its engineering range (from the setpoint) and
// an installed cost the BoM prices directly. The generic vessel-explosion no longer
// buries a duplicate level / temperature / pressure fitting — instrumentation is owned
// HERE, once, properly.
// ──────────────────────────────────────────────────────────────────────────────

// A FIELD INSTRUMENT is a 4-20 mA / loop-powered measurement device (transmitter,
// transducer, sensor, analyser, flowmeter, gauge, probe, detector) — it draws < 1 W and
// is a P&ID TAG, never a kW machine. The vocabulary mirrors ga_massing.py's instrument set
// (the same list that drops these from the 3-D GA scene), so SIGHT (render-side) and SIZING
// (contract-side) agree on what an instrument is. UNIVERSAL — keyed purely on the instrument
// noun, no archetype table. (Deliberately excludes 'switch'/'indicator' to avoid catching
// switchgear / indicator lights, which DO carry a real electrical rating.)
const FIELD_INSTRUMENT_RE =
  /\b(transmitters?|transducers?|sensors?|analy[sz]ers?|flow\s?meters?|gauges?|probes?|detectors?|thermocouples?|thermowells?|pyrometers?|manometers?|piezometers?|hygrometers?)\b/i
function isFieldInstrumentByName(w: WordLike): boolean {
  return FIELD_INSTRUMENT_RE.test(String(w.name_human ?? ''))
}
// True for a word that is a field instrument by EITHER the synthesised `_instrument` flag
// (synthesizeInstrumentation) OR its NAME (a skeleton / padding instrument word the flag
// never reaches — e.g. the generic 'Pressure Transducer' the skeleton padded into
// sensing_instrumentation). The name path is what stops such a word being sized as a 2 kW
// rotating machine by the contract-quantity fuzzy match (physics-critic HIGH: "pressure
// transducer rated 2 kW — off by four orders of magnitude").
function isInstrument(w: WordLike): boolean {
  return (w as { _instrument?: boolean })._instrument === true || isFieldInstrumentByName(w)
}
function anyKey(q: Record<string, number>, re: RegExp): boolean {
  return Object.keys(q).some((k) => re.test(k))
}
function pickQ(q: Record<string, number>, re: RegExp): number | undefined {
  for (const [k, v] of Object.entries(q)) if (re.test(k) && Number.isFinite(v) && v > 0) return v
  return undefined
}

// A fluid-HOLDING vessel: a synthesised principal with a real m³ capacity (the level /
// temperature / quality variables live in its inventory). Pumps / filters / blowers
// (sized from kW / throughput, no capacity) are not vessels.
function isFluidVessel(w: WordLike): boolean {
  if (!isSynth(w) || isSubcomponent(w) || isInstrument(w)) return false
  const mods = w.modifier_characters ?? []
  const cap = mods.find((m) => m.kind === 'capacity' && /m³|m3/.test(String(m.unit ?? '')))
  if (cap && (parseFloat(String(cap.value)) || 0) >= 1) return true
  const dim = String(mods.find((m) => m.kind === 'dimension')?.value ?? '')
  return /m\s*dia/i.test(dim) && /tank|vessel|basin|sump|reactor|column|tower|biofilter|degass|clarifier|digester|reservoir|pond|cone|contactor/i.test(w.name_human ?? '')
}

// Vessels holding LIVE / aerobic-biological inventory need a dissolved-O₂ analyser —
// universal bioprocess vocabulary (aquaculture / fermentation / digestion / activated
// sludge), not an `if ras`. The primary (largest-holdup) process vessel always qualifies.
const BIO_VESSEL_RE = /rear|grow|culture|nursery|broodstock|biofilter|\bbio\b|mbbr|moving.?bed|aeration|raceway|\bpond\b|ferment|bioreactor|digester|activated.?sludge|lagoon/i

// SENSING PRINCIPLE = f(measured property, phase) — a UNIVERSAL physics fact, NOT a class
// choice (Tristan council round-1 2026-06-16). The sensing technology is dictated by WHAT is
// measured and in WHICH phase, so it is declared here, once, per instrument family and emitted
// as an authoritative `sensing_principle` modifier the drawings read — rather than left to a
// downstream name-regex that defaulted a "…Analyser" to NDIR (NDIR measures GAS-PHASE CO₂; it
// cannot measure dissolved-O₂ in WATER — that is an OPTICAL/luminescent or galvanic probe):
//   · dissolved-gas-in-liquid (DO)            → optical / luminescent (or galvanic / electrochemical)
//   · gas-phase CO₂ / composition             → NDIR (non-dispersive infra-red)
//   · pH                                      → glass / Memosens electrode
//   · conductivity / salinity                 → toroidal (or contacting) conductivity
//   · level (liquid)                          → guided-radar (or hydrostatic)
//   · temperature                             → Pt100 RTD
//   · pressure                                → piezoresistive
// The token chosen is one the schedule's sensing-type reader recognises, so the engine's
// medium-correct principle always wins over the name default.
type SensingPrinciple =
  | 'optical' | 'NDIR' | 'electrode' | 'toroidal' | 'guided-radar' | 'Pt100' | 'piezoresistive'

interface InstrumentSpec {
  key: string
  present: (q: Record<string, number>) => boolean
  label: string
  range: (q: Record<string, number>, p: ParentPhysics) => string
  gbp: number // installed cost (UK budget, catalogue class)
  scope: 'level' | 'vessel-temp' | 'bio-do' | 'unit-analyser' | 'loop-ph' | 'loop-salinity' | 'loop-o2p' | 'loop-lox' | 'vessel-pressure'
  // sensing technology, dictated by the MEASURED MEDIUM + PHASE (see table above) — universal,
  // never a function of the product class.
  principle: SensingPrinciple
  // OPTIONAL host-name predicate (for a per-unit-operation analyser): only mount on a vessel
  // whose name names the unit that controls this parameter (e.g. the biofilter for TAN).
  hostMatch?: RegExp
  form: (host: string) => string
}

const INSTRUMENT_FAMILIES: InstrumentSpec[] = [
  { key: 'level', scope: 'level', principle: 'guided-radar', present: () => true, label: 'Level Transmitter', gbp: 900,
    range: (_q, p) => (p.htM > 0 ? `0–${p.htM.toFixed(1)} m` : '0–100 %'),
    form: (h) => `Guided-radar level transmitter, ${h}-mounted; 4–20 mA to PLC with high / low-level alarm` },
  { key: 'temperature', scope: 'vessel-temp', principle: 'Pt100', present: (q) => anyKey(q, /setpoint_temp|temp_c$|_temp_/), label: 'Temperature Transmitter', gbp: 350,
    range: (q) => { const t = pickQ(q, /water.*temp|setpoint_temp|temp_c$/); return t !== undefined ? `0–40 °C (control ${t.toFixed(1)} °C)` : '0–40 °C' },
    form: (h) => `Pt100 RTD + head transmitter in ${h} thermowell; 4–20 mA to PLC` },
  // DISSOLVED O₂ is a gas dissolved in WATER → an OPTICAL/luminescent probe (NOT NDIR, which
  // is a gas-phase infra-red method). principle:'optical' makes that explicit + drawing-correct.
  { key: 'dissolved_oxygen', scope: 'bio-do', principle: 'optical', present: (q) => anyKey(q, /oxygen|dissolved|(^|_)do(_|$)/), label: 'Dissolved-Oxygen Analyser', gbp: 1600,
    range: () => '0–20 mg/L', form: (h) => `Optical (luminescent) dissolved-oxygen probe + transmitter in ${h}; 4–20 mA with low-DO trip to standby oxygenation` },
  // PRIMARY-CONTROL ANALYSER PER UNIT OPERATION (council round-1 2026-06-16): a treatment unit
  // whose FUNCTION is to control a specific water-quality parameter must carry the analyser for
  // that parameter on the unit itself — the biofilter governs nitrification, so it needs a
  // TAN/ammonia analyser (+ nitrate), the only direct read of whether the biofilter is working.
  // Mounted on the vessel whose NAME names the controlling unit (hostMatch), present only when
  // the contract declares the parameter's load. Universal — a unit operation gets the analyser
  // for the parameter it controls, no `if ras`, no class table.
  { key: 'tan', scope: 'unit-analyser', principle: 'electrode', present: (q) => anyKey(q, /tan_load|ammonia|_tan_|tan_setpoint/), label: 'TAN / Ammonia Analyser', gbp: 2200,
    hostMatch: /biofil|nitrif|moving.?bed|mbbr|trickl|raceway/i,
    range: (q) => { const v = pickQ(q, /tan_setpoint|tan_target/); return v !== undefined ? `0–5 mg/L TAN (control ${v.toFixed(2)})` : '0–5 mg/L TAN' },
    form: (h) => `Ion-selective ammonium (TAN) analyser on ${h} — the primary nitrification-control measurement; 4–20 mA to the make-up / feed-rate and biofilter supervision` },
  { key: 'nitrate', scope: 'unit-analyser', principle: 'optical', present: (q) => anyKey(q, /nitrate_load|nitrate|no3/), label: 'Nitrate Analyser', gbp: 2400,
    hostMatch: /biofil|nitrif|denitr|moving.?bed|mbbr|raceway/i,
    range: () => '0–200 mg/L NO₃-N',
    form: (h) => `UV nitrate analyser on ${h}; tracks the nitrate accumulation that sets the make-up / bleed rate; 4–20 mA to the water-exchange control` },
  // DEGASSER controls dissolved CO₂ → an in-liquid dissolved-CO₂ analyser on the degasser.
  { key: 'dissolved_co2', scope: 'unit-analyser', principle: 'optical', present: (q) => anyKey(q, /co2_stripping|dissolved_co2|degas.*air_flow|co2_load/), label: 'Dissolved-CO₂ Analyser', gbp: 2300,
    hostMatch: /degas|stripp|co2|aerat.*column|contactor/i,
    range: () => '0–30 mg/L CO₂',
    form: (h) => `Dissolved-CO₂ analyser on ${h}; controls the stripping-air rate to hold the culture CO₂ below the welfare limit; 4–20 mA to the degasser blower` },
  // UV disinfection controls UV transmittance / dose → a UV-transmittance / intensity monitor.
  { key: 'uv_transmittance', scope: 'unit-analyser', principle: 'optical', present: (q) => anyKey(q, /uv_lamp|uv_dose|uv_reactor|uvt|transmittance/), label: 'UV Transmittance / Intensity Monitor', gbp: 1500,
    hostMatch: /\buv\b|ultraviolet|disinfe|steril/i,
    range: () => '0–100 %UVT (intensity-validated)',
    form: (h) => `In-line UV-transmittance sensor + reactor UV-intensity monitor on ${h}; validates delivered dose and trims lamp power; 4–20 mA to the UV controller` },
  { key: 'ph', scope: 'loop-ph', principle: 'electrode', present: (q) => anyKey(q, /(^|_)ph_|_ph$|ph_setpoint/), label: 'pH Analyser', gbp: 1300,
    range: (q) => { const v = pickQ(q, /ph_setpoint|(^|_)ph_/); return v !== undefined ? `pH 0–14 (control ${v.toFixed(1)})` : 'pH 0–14' },
    form: () => 'Differential pH electrode + transmitter on the common loop; 4–20 mA to acid / base dosing control' },
  { key: 'salinity', scope: 'loop-salinity', principle: 'toroidal', present: (q) => anyKey(q, /salinity|conductiv/), label: 'Conductivity / Salinity Analyser', gbp: 1200,
    range: (q) => { const v = pickQ(q, /salinity_ppt|salinity/); return v !== undefined ? `0–50 ppt (design ${v.toFixed(0)} ppt)` : '0–50 ppt' },
    form: () => 'Toroidal conductivity sensor + transmitter on the common loop; 4–20 mA to make-up / bleed control' },
  // council round-1 2026-06-16: the OXYGEN SUPPLY — the thing keeping the fish alive — was
  // unmonitored. An O₂ header pressure transmitter (low-pressure → auto LOX↔PSA changeover +
  // trip to the emergency diffusers) and a LOX tank level + low-level alarm, both present
  // when the contract declares an oxygen supply duty.
  { key: 'o2_pressure', scope: 'loop-o2p', principle: 'piezoresistive', present: (q) => anyKey(q, /oxygen_supply|oxygen_demand|(^|_)lox/), label: 'O₂ Header Pressure Transmitter', gbp: 850,
    range: () => '0–16 bar (low-pressure alarm + trip)',
    form: () => 'Pressure transmitter on the gaseous-O₂ header; low-pressure alarm auto-changes over LOX↔PSA and trips the fail-open emergency diffusers — the guaranteed-O₂ supervision' },
  { key: 'lox_level', scope: 'loop-lox', principle: 'guided-radar', present: (q) => anyKey(q, /oxygen_supply|oxygen_demand|(^|_)lox/), label: 'LOX Tank Level + Low Alarm', gbp: 1100,
    range: () => '0–100 % (low-level auto-dialler)',
    form: () => 'Cryogenic level gauge on the bulk LOX tank with a low-level alarm to the auto-dialler, so a depleting oxygen buffer is flagged hours before it runs out' },
  { key: 'pressure', scope: 'vessel-pressure', principle: 'piezoresistive', present: (q) => (pickQ(q, /design_pressure|operating_pressure|pressure_bar/) ?? 0) > 1.3, label: 'Pressure Transmitter', gbp: 700,
    range: (q) => { const v = pickQ(q, /design_pressure|operating_pressure|pressure_bar/) ?? 10; return `0–${Math.ceil(v * 1.5)} bar` },
    form: (h) => `Piezoresistive pressure transmitter on ${h}; 4–20 mA to PLC` },
]

// Optional consolidation payload (BUG C, Tristan 2026-06-19): when ONE instrument family is
// measured across SEVERAL vessel types (a level transmitter on the rearing tank AND the biofilter
// AND the degasser), the schedule should carry ONE consolidated line, not a duplicate per vessel —
// so the word takes a `vessel_location` modifier (the vessel types it serves) and a combined
// requirement string spanning their per-vessel ranges. Universal: any multi-vessel control variable.
interface InstrumentConsolidation {
  vesselLocation: string // e.g. "rearing tank ×4 (0–2.8 m), biofilter ×1 (0–3.5 m), degasser ×2 (0–2.7 m)"
  combinedForm: string // the merged requirement string covering every served vessel
}
function instrumentWord(spec: InstrumentSpec, host: WordLike | undefined, qty: number, range: string, consolidation?: InstrumentConsolidation): WordLike {
  const hostName = host?.name_human ?? 'Recirculation Loop'
  const hostId = String(host?.id ?? 'recirc_loop')
  const mods: ModifierCharacter[] = []
  mods.push(mod('quantity', `×${Math.max(1, Math.round(qty))}`))
  mods.push(mod('rating_primary', range))
  // Sensing principle = f(measured medium, phase) — emitted as authoritative engine data so a
  // downstream schedule reads the medium-correct type (DO = optical, NOT NDIR) instead of a
  // name-regex default. Universal, never class-keyed.
  mods.push(mod('sensing_principle', spec.principle))
  // ONE consolidated line across vessel types (BUG C): a `vessel_location` modifier names the
  // vessels (with their per-vessel count + range) so the single line is unambiguous despite the
  // per-vessel range differences. Only present when the instrument was consolidated.
  if (consolidation) mods.push(mod('vessel_location', consolidation.vesselLocation))
  mods.push(mod('price_estimate_gbp', String(Math.max(1, Math.round(spec.gbp)))))
  mods.push(mod('form', consolidation ? consolidation.combinedForm : spec.form(hostName)))
  mods.push(mod('part_number', 'TBD (field instrument — catalogue class)'))
  mods.push(mod('lifecycle', 'Concept design — measures a contract-declared control variable; exact MPN at detailed design'))
  mods.push(mod('installation', consolidation ? `Field-mounted across ${consolidation.vesselLocation}; signal wired to the control system` : `Field-mounted on ${hostName}; signal wired to the control system`))
  // single-underscore separator ONLY — a '__' would collide with the sub-component id
  // convention (parent__suffix) and the BoM would file the instrument as an assembly child. A
  // CONSOLIDATED instrument is keyed by its spec (not a host) so it is one stable id, never per host.
  const id = (consolidation ? `instr_${spec.key}_consolidated` : `instr_${spec.key}_on_${sanitizeId(hostId)}`).replace(/__+/g, '_')
  return {
    id,
    name_human: spec.label,
    content_character: { character_id: id, name_human: spec.label },
    modifier_characters: mods,
    ...({ _synthesized: true, _instrument: true, _instrument_of: hostId } as object),
  }
}

type SubLike = { id?: string; words?: WordLike[] }
function findInstrumentSubModule(modules: ModuleLike[]): SubLike | undefined {
  for (const re of [/sensing|instrument|monitor/i, /control|compute|scada|plc/i]) {
    for (const m of modules ?? []) for (const sm of (m.sub_modules ?? []) as SubLike[]) {
      if (re.test(String(sm.id ?? ''))) return sm
    }
  }
  const sm = (modules?.[0]?.sub_modules ?? [])[0] as SubLike | undefined
  return sm
}

/** Synthesise the PROCESS instrumentation the contract's control variables demand and
 *  place each instrument in the sensing module at the right per-vessel quantity. Mutates
 *  modules in place; returns the number of instrument words added. Universal — driven by
 *  which control-variable keys the contract computed, no `if class`. */
export function synthesizeInstrumentation(modules: ModuleLike[], quantities: Record<string, number>): number {
  const target = findInstrumentSubModule(modules)
  if (!target) return 0
  const vessels: { w: WordLike; cap: number; count: number; p: ParentPhysics }[] = []
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    if (!isFluidVessel(w)) continue
    const p = readParentPhysics(w)
    vessels.push({ w, cap: p.m3 || 0, count: p.qty, p })
  }
  if (vessels.length === 0) return 0
  const primary = vessels.slice().sort((a, b) => b.cap * b.count - a.cap * a.count)[0]

  // idempotency: drop any instruments a prior pass added (re-derive cleanly)
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) {
    if (Array.isArray(sm.words)) sm.words = sm.words.filter((w) => !isInstrument(w))
  }

  const toAdd: WordLike[] = []
  for (const spec of INSTRUMENT_FAMILIES) {
    if (!spec.present(quantities)) continue
    if (spec.scope.startsWith('loop')) {
      toAdd.push(instrumentWord(spec, primary.w, 1, spec.range(quantities, primary.p)))
      continue
    }
    // PER-UNIT-OPERATION ANALYSER: mount the parameter's analyser ONLY on the vessel(s) whose
    // name names the controlling unit (biofilter→TAN/nitrate, degasser→CO₂, UV→UVT), one per
    // matching unit (×1 — a single analyser on the treatment unit, not per rearing-tank). When
    // the unit isn't a discrete vessel in the BoM, fall back to the primary vessel so a declared
    // control parameter is never left unmeasured. Universal — the unit gets the parameter it
    // controls, no class table.
    if (spec.scope === 'unit-analyser') {
      const hosts = spec.hostMatch ? vessels.filter((v) => spec.hostMatch!.test(v.w.name_human ?? '')) : []
      const targets = hosts.length ? hosts : [primary]
      for (const v of targets) toAdd.push(instrumentWord(spec, v.w, 1, spec.range(quantities, v.p)))
      continue
    }
    // PER-VESSEL-INSTANCE VITAL SIGN (level / temperature / dissolved-O₂): measured on EACH served
    // fluid vessel. BUG C (Tristan 2026-06-19): emitting one word PER vessel TYPE duplicated the base
    // instrument name across the schedule (three "Level Transmitter" lines for the rearing tank /
    // biofilter / degasser, differing only by range). CONSOLIDATE to ONE line per instrument family:
    // sum the per-vessel quantities, attach a `vessel_location` modifier naming each served vessel
    // (with its count + range), and a combined requirement string. A single served vessel keeps its
    // verbatim per-vessel word (no consolidation needed). Universal — any archetype, any vessel set.
    const served = vessels.filter((v) => !(spec.scope === 'bio-do' && !(v === primary || BIO_VESSEL_RE.test(v.w.name_human ?? ''))))
    if (served.length === 0) continue
    if (served.length === 1) {
      const v = served[0]
      toAdd.push(instrumentWord(spec, v.w, v.count, spec.range(quantities, v.p)))
      continue
    }
    // ≥2 vessel types → one consolidated line. Host it on the largest served vessel (the primary
    // when it is served), sum the counts, build the location + combined-requirement strings.
    const hostV = served.includes(primary) ? primary : served.slice().sort((a, b) => b.cap * b.count - a.cap * a.count)[0]
    // A consolidated LEVEL instrument's RANGE must span the TALLEST served vessel — its range IS the
    // vessel height, and the host is the largest by CAPACITY (a wide, shallow sump) which can be
    // SHORTER than a narrow, tall vessel it also serves. A 0–1.4 m range hosted on the sump cannot
    // read a 1.6 m nutrient tank → "unmonitored dead zone / overflow risk" (physics-critic HIGH).
    // Pick the max-HEIGHT served vessel for the consolidated RANGE only (host/name/form stay the
    // largest). Keyed on the height-ranged 'level' family; temp/pressure/pH ranges are NOT vessel-
    // height-derived so they keep the host range. UNIVERSAL — no class table.
    const rangeV = spec.scope === 'level'
      ? served.slice().sort((a, b) => (b.p.htM || 0) - (a.p.htM || 0))[0]
      : hostV
    const totalQty = served.reduce((s, v) => s + Math.max(1, Math.round(v.count)), 0)
    const perVessel = served.map((v) => ({ name: v.w.name_human ?? 'vessel', qty: Math.max(1, Math.round(v.count)), range: spec.range(quantities, v.p) }))
    const vesselLocation = perVessel.map((p) => `${p.name.toLowerCase()} ×${p.qty} (${p.range})`).join(', ')
    // The combined requirement: the family's own form on the host, then the per-vessel breakdown so
    // every served vessel's range is explicit on the single line.
    const combinedForm = `${spec.form(hostV.w.name_human ?? 'the served vessels')} Consolidated across ${perVessel.map((p) => `${p.name.toLowerCase()} ×${p.qty} (${p.range})`).join(', ')} — one schedule line for the ${spec.label.toLowerCase()} on every served vessel.`
    toAdd.push(instrumentWord(spec, hostV.w, totalQty, spec.range(quantities, rangeV.p), { vesselLocation, combinedForm }))
  }
  ;((target.words ??= []) as WordLike[]).push(...toAdd)
  return toAdd.length
}

// ──────────────────────────────────────────────────────────────────────────────
// PROCESS ACTUATION SYNTHESIS (Tristan #141 — the actuator sibling of #140).
//
// Every measured variable needs a FINAL CONTROL ELEMENT to act on it — a level
// transmitter (#140) is only half a control loop; the other half is the valve that
// admits flow. And every process AIR/GAS duty the contract declares needs a BLOWER to
// move it. Both are derived from the contract, universal, no per-class table:
//   · INLET FLOW CONTROL VALVE — one per fluid-vessel instance, DN-sized from the vessel's
//     share of the recirculation/process flow (loop flow ÷ instance count). Pairs 1:1 with
//     the level transmitter to close the level loop.
//   · AERATION / PROCESS BLOWER — one set per `*_air_flow_m3_h` duty, sized for that air
//     flow (split into N units above a single-machine cap), placed on the served vessel.
//     Auto-corrects if the upstream air-flow quantity is later refined (no hardcoding).
// Tagged `_actuator` so the BoM prices them from their installed-cost estimate and the
// single-line / P&ID can wire them as actuated final elements.
// ──────────────────────────────────────────────────────────────────────────────

function isActuator(w: WordLike): boolean {
  return (w as { _actuator?: boolean })._actuator === true
}

// DN from a volumetric flow at a target line velocity (2.0 m/s — standard pumped water),
// rounded to the nearest preferred DN. Returns { dn, label, gbp } for a modulating control
// valve (body + electric/pneumatic actuator), installed-cost budget (£ grows with DN).
const PREFERRED_DN = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200, 1400]
function valveFromFlow(m3h: number): { dn: number; label: string; gbp: number } {
  const v = 2.0
  const dMm = Math.sqrt((4 * (m3h / 3600)) / (Math.PI * v)) * 1000
  const dn = PREFERRED_DN.find((d) => d >= dMm) ?? PREFERRED_DN[PREFERRED_DN.length - 1]
  // installed cost grows super-linearly with bore; £ ≈ 10·DN^1.2 fits real modulating
  // butterfly-control-valve prices (DN100 ≈ £3.3k, DN500 ≈ £15k, DN1400 ≈ £55k) — far
  // better than the linear £·DN that under-prices large valves.
  return { dn, label: `DN${dn} modulating control valve (${Math.round(m3h)} m³/h @ ${v} m/s)`, gbp: Math.round(800 + 10 * Math.pow(dn, 1.2)) }
}

// Blower power (kW) from air flow × the process pressure rise / efficiency; cost from the
// duty with a SIZE TAPER (£/kW falls with machine size). dP is service-dependent: a
// degassing/stripping blower only overcomes packing + ducting (~4 kPa), a SUBMERGED
// aeration blower must overcome the diffuser depth (ρg·h). £ ≈ 2000 + 1200·kW^0.8 fits
// real blower prices (10 kW ≈ £10k, 50 kW ≈ £30k, 200 kW ≈ £85k) — not the linear £/kW
// that priced a 309 kW machine at £375k.
const STD_BLOWER_MOTOR_KW = [1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315]
/** Installed motor rating for a blower: shaft ÷ motor-η(0.9) × service-factor(1.15), snapped to a
 *  standard IEC frame. A motor stamped at bare shaft power trips on thermal overload (physics
 *  critic #182). Universal — mirrors engineering-contract.ts::blowerKw for the no-canonical path. */
function installedMotorKw(shaftKw: number): number {
  const m = (shaftKw / 0.9) * 1.15
  return STD_BLOWER_MOTOR_KW.find((s) => s >= m) ?? Math.ceil(m)
}
function blowerFromAirFlow(m3hEach: number, dPkPa: number): { kw: number; gbp: number } {
  const eff = 0.6
  const shaftKw = Math.max(1.5, (m3hEach / 3600) * (dPkPa * 1000) / (eff * 1000))
  // rating = installed MOTOR (won't trip), cost = the air-duty shaft (the blower package price)
  return { kw: installedMotorKw(shaftKw), gbp: Math.round(2000 + 1200 * Math.pow(shaftKw, 0.8)) }
}

function actuatorWord(kind: string, label: string, host: WordLike | undefined, qty: number, spec: ModifierCharacter[], gbp: number, form: string): WordLike {
  const hostName = host?.name_human ?? 'Process Loop'
  const hostId = String(host?.id ?? 'process_loop')
  const mods: ModifierCharacter[] = [mod('quantity', `×${Math.max(1, Math.round(qty))}`), ...spec]
  mods.push(mod('price_estimate_gbp', String(Math.max(1, Math.round(gbp)))))
  mods.push(mod('form', form))
  mods.push(mod('part_number', 'TBD (catalogue class)'))
  mods.push(mod('lifecycle', 'Concept design — final control element sized from the contract; exact MPN at detailed design'))
  mods.push(mod('installation', `Field-mounted on ${hostName}; actuator wired to the control system`))
  const id = `actr_${kind}_on_${sanitizeId(hostId)}`.replace(/__+/g, '_')
  return { id, name_human: label, content_character: { character_id: id, name_human: label }, modifier_characters: mods, ...({ _synthesized: true, _actuator: true, _actuator_of: hostId } as object) }
}

/** Synthesise the final control elements the contract implies — an inlet flow control valve
 *  per fluid vessel (closing the level loop) and an aeration/process blower per air-flow
 *  duty. Mutates modules in place; returns the number of actuator words added. Universal. */
export function synthesizeActuation(modules: ModuleLike[], quantities: Record<string, number>): number {
  // idempotency: drop any actuators a prior pass added
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) {
    if (Array.isArray(sm.words)) sm.words = sm.words.filter((w) => !isActuator(w))
  }
  const vessels: WordLike[] = []
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    if (isFluidVessel(w)) vessels.push(w)
  }
  // the dominant process/recirculation flow that feeds the vessels
  const loopFlow = pickQ(quantities, /recircul.*flow_m3_h|recirculation_flow_m3_h/) ?? pickQ(quantities, /throughput_m3_h|water_flow_m3_h/) ?? 0
  const target = findActuationSubModule(modules)
  const toAdd: { sm: SubLike; w: WordLike }[] = []

  // A. inlet flow control valve per fluid vessel instance
  if (loopFlow > 0 && target) {
    for (const v of vessels) {
      const count = parentQty(v)
      const perInst = loopFlow / Math.max(1, count) // this vessel's share of the loop flow
      const valve = valveFromFlow(perInst)
      toAdd.push({ sm: target, w: actuatorWord('valve', 'Inlet Flow Control Valve', v, count,
        [mod('dimension', valve.label), mod('rating_primary', `${Math.round(perInst)}`, 'm³/h')], valve.gbp,
        `${valve.label}, on the inlet of ${v.name_human}; modulated against the tank level transmitter to balance the recirculation flow`) })
    }
  }

  // B. aeration / process blower per air-flow duty (split into N units above a single-unit cap)
  const SINGLE_BLOWER_CAP = 30000 // m³/h per machine
  const blowerNamesUsed = new Set<string>()   // anti-collision (see blowerName below)
  for (const [key, val] of Object.entries(quantities)) {
    if (!/_air_flow_m3_h$/.test(key) || !(val > 0)) continue
    if (/(^|_)calc_/i.test(key)) continue   // collision-shadow air-flow → never mint a phantom blower (see buildGroups)
    const stemKey = significantStems(key.replace(/_air_flow_m3_h$/, ''))
    let host = vessels.find((v) => { const vs = wordStems(v); return stemKey.some((s) => vs.includes(s)) })
    const n = Math.max(1, Math.ceil(val / SINGLE_BLOWER_CAP))
    const each = val / n
    // dP by service: a degassing / stripping blower overcomes only packing + ducting
    // (~4 kPa); a submerged-aeration blower overcomes the diffuser depth (ρg·h, capped to
    // a sane 8–25 kPa band). Read the service from the air-flow KEY (the degasser is box-
    // modelled, so it has no host vessel to read a depth from).
    const isDegas = /degas|strip|scrub|\bvent|tower|column|contactor/.test(key)
    if (!host && isDegas) {
      // a degassing/stripping duty whose KEY stem names no vessel (e.g. co2_stripping_air_flow →
      // stems co2/stripping, but the vessel is "Degasser") → attach the blower to the degasser/
      // stripper/scrubber vessel by NOUN so it gets a real host (power + process edge) instead of
      // orphaning on process_loop (connectivity #185). Universal — any air-mover whose duty key
      // doesn't stem-match a vessel falls back to its served process vessel.
      host = vessels.find((v) => /degas|strip|scrub|column|contactor|tower/i.test(String(v.name_human ?? '')))
    }
    const dPkPa = isDegas ? 4 : Math.min(25, Math.max(8, (readParentPhysics(host ?? ({} as WordLike)).htM || 1.2) * 9.81))
    // ONE RATED VALUE PER DEVICE (council RAS fix, blower): if the contract declares a CANONICAL
    // per-device rating for this service (`<service>_blower_kw`), USE it verbatim so every page
    // reads the same kW — never re-derive a per-page value from the air flow × a host-depth-
    // dependent dP (the cause of the 6/11/31 kW cross-page contradiction). The canonical key is
    // matched by stem to this air-flow duty (degasser→degasser_blower_kw, biofilter aeration→
    // aeration_blower_kw); fall back to the computed kW only when no canonical rating exists.
    const canonicalBlowerKw = (() => {
      for (const [bk, bv] of Object.entries(quantities)) {
        if (!/_blower_kw$/.test(bk) || !(bv > 0)) continue
        const bkStems = significantStems(bk.replace(/_blower_kw$/, ''))
        const serviceMatch = isDegas
          ? /degas|strip/.test(bk)
          : (bkStems.some((s) => stemKey.includes(s)) || /aeration|aerator/.test(bk))
        if (serviceMatch) return bv
      }
      return undefined
    })()
    const b = canonicalBlowerKw !== undefined
      ? { kw: canonicalBlowerKw, gbp: blowerFromAirFlow(each, dPkPa).gbp }   // canonical rating, cost still from the duty
      : blowerFromAirFlow(each, dPkPa)
    const dest = (host && findWordSubModule(modules, host)) || target
    if (!dest) continue
    // DISTINCT device name per service (council RAS fix, blower): a degassing blower and an
    // aeration blower are DIFFERENT machines with different ratings — give them different names
    // so two services with different (single) kW are not read as one device with conflicting
    // values (the cross-page consistency audit clusters by noun phrase). Each service still
    // carries ONE canonical kW; the names keep the two services apart.
    // ANTI-COLLISION (Tristan 2026-06-20): TWO different air-flow duties can BOTH be `isDegas`
    // (e.g. `degasser_air_flow_m3_h` + a process-loop stripping duty), minting TWO words both
    // named "Degassing Blower". Same name_human → same render object-prefix → the parts-manifest
    // unions their geometry ACROSS regions into a PHANTOM mega-part (a 32 m "blower" spanning the
    // gap — wrong size in the GA + BoM, and it breaks the layout optimiser which legitimately
    // separates them). The id is already host-unique; bring the NAME into line: suffix the SECOND+
    // same-named blower with its serving host (or its duty stem) so each renders as its own part.
    const blowerBase = isDegas ? 'Degassing Blower' : 'Aeration Blower'
    let blowerName = blowerBase
    if (blowerNamesUsed.has(blowerName)) {
      const stemLabel = (host?.name_human
        ? host.name_human
        : stemKey.join(' ')).replace(/[_]+/g, ' ').trim()
      const titled = stemLabel.replace(/\b\w/g, (c) => c.toUpperCase())
      blowerName = titled ? `${blowerBase} — ${titled}` : `${blowerBase} ${blowerNamesUsed.size + 1}`
      let k = 2
      while (blowerNamesUsed.has(blowerName)) blowerName = `${blowerBase} ${k++}`
    }
    blowerNamesUsed.add(blowerName)
    toAdd.push({ sm: dest, w: actuatorWord('blower', blowerName, host, n,
      // rating_primary reads the contract blower kW VERBATIM (2.5 / 54.6 kW), not Math.round (which
      // emitted 3 / 55 kW — the audit's emitted-rating≠contract mismatch). formatRatingKw keeps the
      // contract precision so the BoM line equals the canonical degasser_blower_kw / aeration_blower_kw.
      [mod('dimension', boxFromRatingKw(b.kw)), mod('rating_primary', formatRatingKw(b.kw), 'kW')], b.gbp,
      `Centrifugal ${isDegas ? 'degassing' : 'aeration'} blower, ${Math.round(each).toLocaleString('en-GB')} m³/h @ ~${Math.round(dPkPa)} kPa each${host ? `, serving ${host.name_human}` : ''}; ${n}× duty/assist`) })
  }

  // C. LIFE-SAFETY O₂ final elements (council round-1 2026-06-16): the dissolved-O₂ loop was
  // OPEN — DO is measured per tank (#140) but had NO final control element, and the brief's
  // explicit fail-open emergency-O₂ requirement was absent. For each CULTURE vessel instance,
  // add (i) an EMERGENCY O₂ SOLENOID + diffuser that FAILS OPEN on power loss (energise-to-
  // close, fed from the LOX buffer — the device that keeps the stock alive through a power /
  // SCADA failure) and (ii) a normal-duty DISSOLVED-O₂ CONTROL VALVE modulated by the DO
  // analyser (closes the DO loop). Only when the contract declares an oxygen demand (a live
  // aerobic culture). Universal — distinct id kinds so they don't collide with the inlet valve.
  const o2Declared = (pickQ(quantities, /oxygen_demand|oxygen_supply|dissolved/) ?? 0) > 0
  if (o2Declared && vessels.length) {
    const culture = vessels.filter((v) => BIO_VESSEL_RE.test(v.name_human ?? ''))
    const cultureVessels = culture.length ? culture
      : [vessels.slice().sort((a, b) => (readParentPhysics(b).m3 * parentQty(b)) - (readParentPhysics(a).m3 * parentQty(a)))[0]]
    for (const v of cultureVessels) {
      const count = parentQty(v)
      const dest = findWordSubModule(modules, v) || target || findActuationSubModule(modules)
      if (!dest) continue
      toAdd.push({ sm: dest, w: actuatorWord('emergency_o2', 'Emergency O₂ Solenoid + Diffuser (fail-open)', v, count,
        [mod('rating_primary', 'fail-open on power loss')], 680,
        `Normally-open (energise-to-close) pure-O₂ solenoid + fine-bubble diffuser in ${v.name_human}, fed from the LOX buffer on a guaranteed-O₂ header UPSTREAM of any controlled valve; loss of power ADMITS oxygen — the brief-mandated device that keeps the stock alive through a power / SCADA failure`) })
      toAdd.push({ sm: dest, w: actuatorWord('do_valve', 'Dissolved-O₂ Control Valve', v, count,
        [mod('rating_primary', 'DO-modulated')], 900,
        `Modulating O₂ dosing valve on ${v.name_human} — the FINAL CONTROL ELEMENT closed-loop on the dissolved-O₂ analyser (DO → O₂ valve); its low-DO trip target is the fail-open emergency solenoid above`) })
    }
  }

  for (const { sm, w } of toAdd) ((sm.words ??= []) as WordLike[]).push(w)
  return toAdd.length
}

function findActuationSubModule(modules: ModuleLike[]): SubLike | undefined {
  for (const re of [/actuation|valve|kinematic/i, /mass_fluid|fluid|process|circulation/i]) {
    for (const m of modules ?? []) for (const sm of (m.sub_modules ?? []) as SubLike[]) {
      if (re.test(String(sm.id ?? ''))) return sm
    }
  }
  return (modules?.[0]?.sub_modules ?? [])[0] as SubLike | undefined
}
function findWordSubModule(modules: ModuleLike[], target: WordLike): SubLike | undefined {
  for (const m of modules ?? []) for (const sm of (m.sub_modules ?? []) as SubLike[]) {
    if ((sm.words ?? []).some((w) => w.id === target.id)) return sm
  }
  return undefined
}
function findSubModuleByRe(modules: ModuleLike[], re: RegExp): SubLike | undefined {
  for (const m of modules ?? []) for (const sm of (m.sub_modules ?? []) as SubLike[]) {
    if (re.test(String(sm.id ?? ''))) return sm
  }
  return undefined
}

// ──────────────────────────────────────────────────────────────────────────────
// UTILITY + SAFETY SYSTEMS SYNTHESIS (Tristan #142).
//
// Every process plant needs the BALANCE-OF-PLANT systems the principal equipment can't run
// without — and they were ENTIRELY absent (the power module had a breaker but no standby
// generator; the fluid module had pumps but no make-up or bleed/drain; no building
// ventilation). Each is derived from a contract DUTY it depends on, universal, no per-class
// table — a declared electrical load implies a standby generator sized to the life-safety
// fraction; a declared make-up flow implies a make-up skid + its bleed/drain complement; a
// declared building heat load implies heat-recovery ventilation. A plant that doesn't
// declare the duty doesn't get the system.
// ──────────────────────────────────────────────────────────────────────────────

function isUtility(w: WordLike): boolean {
  return (w as { _utility?: boolean })._utility === true
}
// Real diesel-genset frame sizes (kVA), incl. LARGE single containerised sets up to ~6300 kVA.
// BUG (Physics Critic high/high, RAS 2026-06-23): the table capped at 2500 and the fallback returned
// the cap, so any plant whose life-safety load needs >2500 kVA was SILENTLY undersized — a RAS with a
// 3,784 kW life-safety load needs ~4,730 kVA but got 2,500 (~1.9× undersized). UNIVERSAL fix: realistic
// large frames + a fallback that ROUNDS UP to the next 500 kVA (never caps), so a genset is never
// silently undersized at any plant scale. (Above ~6300 kVA real plants parallel N sets; the rounded-up
// single rating is a correct, non-undersized spec the BoM/critic accept.)
const STD_GENSET_KVA = [40, 60, 100, 150, 200, 250, 300, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3000, 3300, 3750, 4000, 5000, 6300]
function stdGenset(kva: number): number {
  return STD_GENSET_KVA.find((k) => k >= kva) ?? Math.ceil(kva / 500) * 500  // round up, NEVER cap-undersize
}

interface UtilitySpec {
  key: string
  driver: (q: Record<string, number>) => number | undefined // the contract duty that sizes it
  label: string
  // OPTIONAL labelOf: when the bare `driver` quantity is ambiguous across archetypes (e.g.
  // media_volume_m3 = MBBR biofilm carrier on a bio-plant, but catalyst / resin / packing on
  // a chemical bed), resolve the equipment NAME from a PHYSICAL signal in the quantities so a
  // non-bio plant gets a generic "Packed Media" line, never "Biofilm Carrier (MBBR)". When
  // present it overrides `label`; `label` remains the default for every other consumer.
  labelOf?: (q: Record<string, number>) => string
  module: RegExp
  size: (d: number) => { dim: string; rating: [string, string]; gbp: number }
  // `form` may read the full contract quantities (2nd arg) to make its rationale conditional
  // on a PHYSICAL signal (e.g. a nitrification / bio-process key) rather than asserting a
  // fixed archetype rationale. Specs that don't need it keep the single-arg `(d) => …` form.
  form: (d: number, q?: Record<string, number>) => string
  // OPTIONAL supersedes: the physics-derived system REPLACES any generic word-engine
  // PLACEHOLDER for the same function (e.g. the LOX system supersedes the bare
  // "Oxygenation System" word). When this fires, the matching non-flagged principal
  // word is removed so the design carries ONE fully-wired part, not a wired system +
  // an orphan duplicate (the connectivity-completeness gap). Instruments / actuators /
  // utilities / other synthesised systems are NEVER matched (flag-guarded below).
  supersedes?: RegExp
}
const UTILITY_SYSTEMS: UtilitySpec[] = [
  { key: 'standby_generator', driver: (q) => pickQ(q, /connected_electrical_load_kw|total_supply_demand_kw/), label: 'Standby Diesel Generator', module: /power|electric|distribution/,
    size: (load) => { const crit = load * 0.7; return { dim: boxFromRatingKw(crit), rating: [String(stdGenset(crit / 0.8)), 'kVA'], gbp: Math.round(crit * 400 + 30000) } },
    form: (load) => `Containerised standby diesel genset + automatic transfer switch + day tank; covers the ~${Math.round(load * 0.7)} kW life-safety load (recirculation + oxygenation + controls) on a mains failure — a RAS loses its stock within minutes without it` },
  { key: 'makeup_water', driver: (q) => pickQ(q, /makeup_water_m3_h|make_up_water_m3_h/), label: 'Make-up Water System', module: /mass_fluid|fluid|process|water|circulation/,
    size: (mu) => { const buf = Math.max(5, mu * 0.5); return { dim: cylinderFromVolumeM3(buf, 'make-up tank'), rating: [String(Math.round(mu)), 'm³/h'], gbp: Math.round(25000 + mu * 200) } },
    form: (mu) => `Make-up water skid: ~${Math.round(Math.max(5, mu * 0.5))} m³ break tank + level control + ${Math.round(mu)} m³/h control valve + meter; replaces evaporation + bleed losses` },
  { key: 'bleed_drain', driver: (q) => { const mu = pickQ(q, /makeup_water_m3_h|make_up_water_m3_h/); return mu ? mu * 0.9 : undefined }, label: 'Bleed / Drain System', module: /mass_fluid|fluid|process|water|circulation/,
    size: (bl) => ({ dim: '', rating: [String(Math.round(bl * 10) / 10), 'm³/h'], gbp: Math.round(8000 + bl * 80) }),
    form: (bl) => `Continuous bleed + drain header: ~${Math.round(bl * 10) / 10} m³/h blowdown to hold water quality + an emergency drain-down route to the site discharge` },
  // The HRV is sized to the FULL ventilation SUPPLY FLOW the contract declares
  // (`ventilation_supply_air_m3_h` — the air-change requirement of the hall), NOT to a flow
  // back-inferred from the building-fabric loss (which undersized it to ~36% of the supply and
  // left the ventilation make-up heating term un-honoured). The driver is therefore the supply
  // airflow directly; it falls back to the old building-load→flow derivation for any class that
  // declares a building heat load but no explicit supply airflow. Universal — keyed on the
  // declared duty, not the class. `m3h` is already a flow, so size/form consume it as-is.
  { key: 'ventilation',
    driver: (q) => pickQ(q, /ventilation_supply_air_m3_h/) ?? (() => { const kw = pickQ(q, /building_process_loss_kw|building_heat|building.*_kw/); return kw ? (kw / (1.2 * 1.005 * 15)) * 3600 : undefined })(),
    label: 'Building Ventilation (HRV)', module: /environmental|hvac|climate|ventil/,
    size: (m3h) => ({ dim: boxFromThroughputM3h(m3h), rating: [String(Math.round(m3h)), 'm³/h'], gbp: Math.round(20000 + m3h * 4) }),
    form: (m3h) => `Heat-recovery ventilation sized to the full ~${Math.round(m3h).toLocaleString('en-GB')} m³/h supply + extract (a parallel HRV bank where one unit cannot take the flow); clears building moisture / CO₂ off the warm open-water surface while recovering sensible heat from the extract` },
  // council round-1 (2026-06-16): a single genset+ATS leaves the PLC/DO-analysers/auto-dialler
  // dead for the ~10-15 s genset start after a mains failure — the plant is blind exactly when
  // it must alarm. A UPS / DC bus rides the controls + life-safety instrumentation through the
  // changeover. Sized to the CONTROL load (~8 % of the connected load), 30-min autonomy.
  { key: 'control_ups', driver: (q) => pickQ(q, /connected_electrical_load_kw|total_supply_demand_kw/), label: 'Control + Instrument UPS', module: /control|compute|scada|power|electric|distribution/,
    size: (kw) => { const ctrlKw = Math.max(5, kw * 0.08); return { dim: boxFromRatingKw(ctrlKw), rating: [String(Math.round(ctrlKw)), 'kW (30 min)'], gbp: Math.round(18000 + ctrlKw * 700) } },
    form: (kw) => `On-line double-conversion UPS + battery (~30 min autonomy) sized to the ~${Math.round(kw * 0.08)} kW control + instrument + alarm load; rides the PLC, dissolved-oxygen analysers and auto-dialler through the genset start so the plant alarms even while mains is lost` },
]

function utilityWord(spec: UtilitySpec, d: number, category: 'utility' | 'process' = 'utility', quantities?: Record<string, number>): WordLike {
  const s = spec.size(d)
  const mods: ModifierCharacter[] = [mod('quantity', '×1')]
  if (s.dim) mods.push(mod('dimension', s.dim))
  mods.push(mod('rating_primary', s.rating[0], s.rating[1]))
  mods.push(mod('price_estimate_gbp', String(Math.max(1, Math.round(s.gbp)))))
  mods.push(mod('form', spec.form(d, quantities)))
  mods.push(mod('part_number', 'TBD (catalogue class)'))
  mods.push(mod('lifecycle', `Concept design — ${category === 'process' ? 'process-support' : 'balance-of-plant'} system sized from the contract duty; exact MPN at detailed design`))
  mods.push(mod('installation', `Plant-level ${category === 'process' ? 'process' : 'utility / safety'} system; placement confirmed at layout`))
  const id = `${category === 'process' ? 'proc' : 'util'}_${spec.key}`
  const flags = category === 'process' ? { _synthesized: true, _process: true } : { _synthesized: true, _utility: true }
  const label = (spec.labelOf && quantities) ? spec.labelOf(quantities) : spec.label
  return { id, name_human: label, content_character: { character_id: id, name_human: label }, modifier_characters: mods, ...(flags as object) }
}

function isProcessSystem(w: WordLike): boolean {
  return (w as { _process?: boolean })._process === true
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN-INCOMER BREAKER SIZING (universal, Tristan 2026-06-19).
//
// THE WALL it removes (RAS physics_fidelity=2, verified out/ras-inc3): the generic skeleton's
// power_distribution floor emits a bare "Main Breaker" word with NO rating; Phase-2 then PINS a
// rating by reading whatever current is nearest in the contract — on RAS it grabbed the
// transformer PRIMARY current (120.72 A, the 11 kV HV side) and stamped 121 A onto the LV main
// breaker of a ~1.7 MW plant (the physics critic: "undersized by 25×, will trip instantly").
//
// THE RULE: the main incomer / service breaker is sized from the CONNECTED ELECTRICAL LOAD, not
// from a stray current. I_main = P_kW·1000 / (√3 · V_line · PF) · margin. Universal — ANY class
// that declares a connected electrical load gets a correctly-sized incomer; a product with no
// connected-load quantity (a passive part, a vehicle on its own battery) is a strict no-op.
// V_line is taken from the LV side: the transformer SECONDARY voltage when known, else the
// standard 400 V 3-phase LV. The breaker FRAME is the next standard ACB/MCCB rating ≥ I_main.
// PF 0.9, margin 1.25 (matches the standby-genset + transformer-resize convention in this file).

const STD_BREAKER_FRAME_A = [
  16, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300, 8000,
]
function nextBreakerFrameA(iReq: number): number {
  for (const f of STD_BREAKER_FRAME_A) if (f >= iReq - 1e-9) return f
  return Math.ceil(iReq / 1000) * 1000 // above the ladder, round up to the next 1 kA
}
// Words that ARE the main service incomer (universal naming; never a sub-circuit breaker, a
// branch MCB, a DC breaker, or a motor protector — those are sized to their own circuit, not
// the plant incomer). Keyed on the incomer NOUN, no class table.
const MAIN_INCOMER_RE = /\b(main(\s|_)?(breaker|incomer|switch|acb|isolator|disconnect|switchboard|panel|distribution\s?board|lv\s?panel)|incoming(\s|_)?(breaker|supply|feeder|acb)|service(\s|_)?(entrance|breaker)|main(\s|_)?lv|incomer)\b/i
const NON_INCOMER_RE = /\b(sub|branch|final|feeder\s?to|motor|mcb|rcbo|fuse|surge|contactor|busbar|terminal|dc\b|battery|pv|string|outgoing)\b/i

function isMainIncomerWord(w: WordLike): boolean {
  const name = `${w.name_human ?? ''} ${w.content_character?.name_human ?? ''} ${w.content_character?.character_id ?? ''} ${w.id ?? ''}`
  if (!MAIN_INCOMER_RE.test(name)) return false
  if (NON_INCOMER_RE.test(name)) return false
  return true
}

/** Universal: size the MAIN service incomer breaker from the connected electrical load and
 *  stamp its frame rating onto every main-incomer word; write `main_incomer_breaker_a` +
 *  `main_incomer_breaker_frame_a` back to the contract quantities (the BoM / single-line /
 *  panel / drawing_gates read it). Returns the number of words stamped. Strict no-op when the
 *  contract declares no connected load OR there is no main-incomer word to stamp. */
function sizeMainIncomer(
  modules: ModuleLike[],
  quantities: Record<string, number>,
  contract?: ContractInProgress,
): number {
  // The LV connected (coincident running) load the incomer must carry: the contract's
  // connected_electrical_load_kw. Fall back to the as-routed supply demand only when the
  // connected load is not declared (the supply demand also carries distribution parasitics, so
  // it is NOT the right incomer basis when the running connected load is known — the breaker
  // protects the load, the transformer covers the demand).
  const connectedKw = pickQ(quantities, /^connected_electrical_load_kw$/)
    ?? pickQ(quantities, /^total_supply_demand_kw$/)
    ?? 0
  if (!(connectedKw > 0)) return 0
  // LV line voltage: the transformer secondary when known (kVA ÷ √3·secondary_A gives V), else
  // the standard 400 V 3-phase. We read an explicit secondary-current pair when present.
  const txKva = pickQ(quantities, /^(main_)?transformer_(rating_)?kva$/) ?? pickQ(quantities, /transformer.*kva/)
  const txSecA = pickQ(quantities, /transformer_secondary_current_a/)
  let vLine = 400
  if (txKva && txSecA && txSecA > 0) {
    const v = (txKva * 1000) / (Math.sqrt(3) * txSecA) // V_line = kVA·1000 / (√3·I_secondary)
    if (Number.isFinite(v) && v >= 200 && v <= 1000) vLine = Math.round(v)
  }
  const PF = 0.9
  const MARGIN = 1.25
  const iReq = (connectedKw * 1000) / (Math.sqrt(3) * vLine * PF) * MARGIN
  const frameA = nextBreakerFrameA(iReq)

  // Stamp the frame onto every main-incomer word (overwrite a mispinned rating). Mark it
  // _synthesized so the post-Phase-2 reconcile + cost characteriser treat it as engine-derived.
  let stamped = 0
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    if (!isMainIncomerWord(w)) continue
    if (isSubcomponent(w)) continue
    mergeMods(w, [
      mod('rating_primary', String(frameA), 'A'),
      mod('dimension', `${vLine} V 3-phase LV incomer · ${frameA} A ACB frame (sized to ${Math.round(connectedKw)} kW connected load, PF ${PF}, ${Math.round((MARGIN - 1) * 100)}% margin)`),
    ])
    ;(w as { _synthesized?: boolean })._synthesized = true
    stamped += 1
  }

  // Write the sizing back to the contract quantities so the BoM / single-line / panel /
  // drawing_gates load-reconcile all read ONE authoritative incomer rating.
  quantities['main_incomer_breaker_a'] = Math.round(iReq)
  quantities['main_incomer_breaker_frame_a'] = frameA
  if (contract) {
    const cq = ((contract as { quantities?: Record<string, unknown> }).quantities ??= {}) as Record<string, unknown>
    const basis = `main incomer sized from the connected electrical load ${Math.round(connectedKw)} kW: I = P·1000/(√3·${vLine}·${PF})·${MARGIN} = ${Math.round(iReq)} A → next standard ${frameA} A ACB frame`
    // lineage.from = the load quantity it was sized from, so the breaker rating traces back to the brief.
    // breaker_a is a CLEAN function of the connected load → carry an Excel formula (the constants vLine/PF/
    // margin are embedded as used) so the Excel renders it as a LIVE, provable cell, not a bare number.
    const breakerLineage = { from: ['connected_electrical_load_kw'], via: 'calculator',
      formula: `ROUND(connected_electrical_load_kw*1000/(SQRT(3)*${vLine}*${PF})*${MARGIN},0)` }
    // frame_a is the next STANDARD ACB frame (a discrete lookup, not a clean formula) → lineage only.
    const frameLineage = { from: ['main_incomer_breaker_a'], via: 'calculator' }
    cq['main_incomer_breaker_a'] = { value: Math.round(iReq), unit: 'A', family: 'current', scope: 'system', source: 'calculator', source_detail: basis, lineage: breakerLineage }
    cq['main_incomer_breaker_frame_a'] = { value: frameA, unit: 'A', family: 'current', scope: 'system', source: 'calculator', source_detail: basis, lineage: frameLineage }
  }
  return stamped
}

// ──────────────────────────────────────────────────────────────────────────────
// PROCESS-SUPPORT SYSTEMS SYNTHESIS (Tristan #143).
//
// The plant systems that handle the CONSUMABLES + WASTE the process produces — each absent
// from the BoM though the contract sizes its duty: chemical (pH / alkalinity) dosing, feed,
// oxygen (LOX) supply, solids / sludge handling, the SCADA that runs it all, and biomass
// grading / harvest. Each is derived from the contract DUTY it serves, universal: a declared
// chemical dose implies a dosing skid, a declared feed rate implies a feed system, a declared
// oxygen demand implies LOX storage + vaporiser, a declared solids load implies dewatering.
// Same machinery as the utility systems (#142), priced whole from the duty.
// ──────────────────────────────────────────────────────────────────────────────
// A nitrification / biological-process signal: present only when the contract declares a
// bio-treatment duty (biofilter media, an alkalinity-against-nitrification dose, an ammonia /
// nitrate / TAN load). A chemical plant (CO₂ capture, SAF) has none of these even when it
// doses chemicals, so its dosing rationale stays generic ("process pH / chemistry"), never
// "nitrification". Universal — keyed on the physical bio quantities, never a class name.
function hasNitrificationSignal(q: Record<string, number>): boolean {
  return (pickQ(q, /nitrif|alkalinity|ammonia|_tan_|nitrate|biofilm|biofilter|_bio_/i) ?? 0) > 0
}
// Derive the SCADA closed-loop list from the measurement quantities the contract actually
// carries — universal, no fixed RAS string. Each entry fires only when its physical signal is
// present (a DO loop only when there's a dissolved-oxygen duty; a pH loop only with a pH/dose
// signal; etc.). Returns "every measured process loop" when no specific signal is present.
function scadaLoopList(q: Record<string, number>): string {
  const loops: string[] = []
  if ((pickQ(q, /\blevel\b|_level_|tank_level|water_level/i) ?? 0) > 0) loops.push('level')
  if ((pickQ(q, /temperature|_temp_|_temp_c|thermal_load|heating_load|cooling_load/i) ?? 0) > 0) loops.push('temperature')
  if ((pickQ(q, /oxygen|dissolved.?oxygen|\bdo_|_do_|aeration/i) ?? 0) > 0) loops.push('dissolved-oxygen')
  if ((pickQ(q, /\bph\b|_ph_|alkalinity|_dose_kg_day$|dosing_kg/i) ?? 0) > 0) loops.push('pH')
  if ((pickQ(q, /flow|_m3_h$|throughput|recirc/i) ?? 0) > 0) loops.push('flow')
  if ((pickQ(q, /pressure|_bar$|_kpa$|_mpa$/i) ?? 0) > 0) loops.push('pressure')
  if ((pickQ(q, /conductiv|salinity|_ec_/i) ?? 0) > 0) loops.push('conductivity')
  return loops.length ? `every measured loop (${loops.join(' / ')})` : 'every measured process loop'
}
const PROCESS_SYSTEMS: UtilitySpec[] = [
  { key: 'chemical_dosing', driver: (q) => pickQ(q, /_dose_kg_day$|dosing_kg|alkalinity_dose/), label: 'Chemical Dosing System (pH / Alkalinity)', module: /mass_fluid|process|chemical|dosing|water/,
    size: (kgd) => { const store = Math.max(2, (kgd * 7) / 1000); return { dim: cylinderFromVolumeM3(store, 'dosing tank'), rating: [String(Math.round(kgd)), 'kg/day'], gbp: Math.round(30000 + kgd * 20) } },
    form: (kgd, q) => `Bulk + day storage (~${Math.round((kgd * 7) / 1000)} m³, 7-day) + duty/standby dosing pumps + in-line mixer; doses ~${Math.round(kgd)} kg/day to ${q && hasNitrificationSignal(q) ? 'hold pH / alkalinity against nitrification' : 'hold process pH / chemistry to the declared dose-rate set-point'}` },
  { key: 'feed_system', driver: (q) => pickQ(q, /daily_feed_kg|feed_kg_day|_feed_kg$/), label: 'Feed Storage + Distribution System', module: /mass_fluid|process|feed/,
    size: (kgd) => { const silo = Math.max(10, (kgd * 14) / 650); return { dim: cylinderFromVolumeM3(silo, 'feed silo'), rating: [String(Math.round(kgd)), 'kg/day'], gbp: Math.round(40000 + kgd * 30) } },
    form: (kgd) => `Bulk feed silos (~${Math.round((kgd * 14) / 650)} m³, ~2-week) + pneumatic conveying + per-tank automatic feeders + load cells; delivers ~${Math.round(kgd)} kg/day on a controlled ration` },
  { key: 'oxygen_lox', driver: (q) => pickQ(q, /oxygen_supply_kg_h|oxygen_demand_kg_h/) ?? ((pickQ(q, /oxygen_demand_kg_day/) ?? 0) / 24 || undefined), label: 'Oxygen Supply (LOX) System', module: /environmental|oxygen|process|mass_fluid/, supersedes: /\boxygenation\b/i,
    size: (kgh) => { const tank = Math.max(3, (kgh * 24 * 5) / 1140); return { dim: cylinderFromVolumeM3(tank, 'lox tank'), rating: [String(Math.round(kgh)), 'kg/h'], gbp: Math.round(35000 + kgh * 800) } },
    form: (kgh) => `Vacuum-insulated bulk LOX tank (~${Math.round((kgh * 24 * 5) / 1140)} m³, 5-day) + ambient vaporiser + pressure-control panel; supplies ~${Math.round(kgh)} kg/h gaseous O₂ to the oxygenation cones` },
  { key: 'sludge_handling', driver: (q) => pickQ(q, /solids_load_kg_day|sludge_kg_day|tss_load/), label: 'Solids / Sludge Handling System', module: /mass_fluid|process|waste|water/,
    size: (kgd) => ({ dim: '', rating: [String(Math.round(kgd)), 'kg/day'], gbp: Math.round(25000 + kgd * 40) }),
    form: (kgd) => `Gravity thickener + rotary-screen / belt dewatering + skip; concentrates ~${Math.round(kgd)} kg/day captured solids to a haulable cake for off-site disposal` },
  { key: 'scada', driver: (q) => pickQ(q, /connected_electrical_load_kw|total_supply_demand_kw/), label: 'SCADA / Plant Control System', module: /control|compute|scada|sensing|instrument/,
    size: (kw) => ({ dim: '', rating: [String(Math.round(kw)), 'kW plant'], gbp: Math.round(60000 + kw * 50) }),
    // The closed-loop list is DERIVED from the measurement quantities the contract actually
    // carries (level / temperature / DO / pH / flow / pressure / conductivity), never a fixed
    // RAS string — a CO₂/SAF plant lists the loops IT measures, not "DO / pH". Generic fallback
    // ("every measured process loop") when no measurement signal is present.
    form: (kw, q) => `Redundant PLC racks + SCADA servers + operator HMIs + plant network + auto-dialler alarms; closes ${q ? scadaLoopList(q) : 'every measured process loop'} and alarms the ~${Math.round(kw)} kW plant 24/7` },
  // media_volume_m3 is AMBIGUOUS: MBBR biofilm carrier on a bio-plant, but catalyst / resin /
  // adsorbent / structured packing on a chemical bed (SAF, CO₂). Resolve the equipment NAME +
  // rationale from a nitrification/bio signal — generic "packed media" otherwise. The volume
  // still SIZES the line either way. Universal — keyed on the physical bio signal, never a class.
  { key: 'biofilm_media', driver: (q) => pickQ(q, /_media_volume_m3$|media_volume_m3$/), label: 'Packed / Bed Media', labelOf: (q) => hasNitrificationSignal(q) ? 'Biofilm Carrier Media (MBBR)' : 'Packed / Bed Media', module: /mass_fluid|process|water|biofilter/,
    size: (v) => ({ dim: `${Math.round(v)} m³ fill`, rating: [String(Math.round(v)), 'm³'], gbp: Math.round(v * 700) }),
    form: (v, q) => (q && hasNitrificationSignal(q))
      ? `~${Math.round(v)} m³ of high-surface-area polyethylene biofilm carriers (moving-bed / MBBR media, ~500–800 m²/m³); the nitrifying-biofilm support that does the ammonia removal — the working heart of the biofilter, and a major line a shell-only take-off misses entirely`
      : `~${Math.round(v)} m³ of bed media fill (the catalyst / sorbent / structured packing the process beds require); a major bulk-media line a shell-only take-off misses entirely` },
  { key: 'grading_harvest', driver: (q) => pickQ(q, /standing_biomass_kg|harvest_biomass_kg/), label: 'Grading / Harvest System', module: /mass_fluid|process|actuation|harvest/,
    size: (bio) => ({ dim: '', rating: [String(Math.round(bio / 1000)), 't biomass'], gbp: Math.round(40000 + (bio / 1000) * 100) }),
    form: (bio) => `Fish pump + grader + counter + crowding screens; handles the ~${Math.round(bio / 1000)} t standing biomass for routine grading + harvest without manual netting` },
  // Tristan 2026-06-16: "how do they get harvested AND chilled?" — the grading/harvest
  // system above lands the fish, but a harvested batch must be CHILLED immediately (from
  // the culture temperature to ~1 °C) for product quality + shelf life.
  // GATE (2026-06-23): keyed on a PERISHABLE-BIOMASS signal, NOT the bare annual t/yr.
  // A CO₂-capture or e-fuel plant is also rated in t/yr but produces a stable chemical that
  // needs no flake-ice; only a plant that declares a live/harvested BIOMASS quantity gets a
  // fish-chilling ice system. The throughput still SIZES the chiller — but only once the
  // biomass signal has CONFIRMED the product is a perishable harvest. Universal: any plant
  // with a standing/harvest biomass duty AND a throughput rate gets it; a chemical plant
  // (no biomass quantity) never does.
  { key: 'harvest_chilling', driver: (q) => { const bio = pickQ(q, /standing_biomass_kg|harvest_biomass_kg|biomass_kg/); if (!bio || !(bio > 0)) return undefined; return pickQ(q, /annual_production_t_yr|harvest_throughput_t_yr|production_capacity_t_yr/) }, label: 'Product Chilling + Ice System', module: /mass_fluid|process|harvest|environmental|water/,
    size: (tyr) => { const weeklyKg = (tyr * 1000) / 52; const dutyKw = Math.max(8, (weeklyKg * 3.6 * 25) / (8 * 3600)); return { dim: boxFromRatingKw(dutyKw), rating: [String(Math.round(dutyKw)), 'kW chill'], gbp: Math.round(25000 + tyr * 250) } },
    form: (tyr) => `Flake-ice machine + refrigerated-seawater (RSW) chiller + insulated harvest holding; chills the graded harvest (~${Math.round((tyr * 1000) / 52)} kg/week) from culture temperature to ~1 °C on ice immediately after harvest for product quality + shelf life` },
  // ── council round-1 (2026-06-16): the systems a BUILDABLE live-animal RAS must have but
  // were absent. Each driven by an existing contract duty, universal (any plant declaring a
  // live biomass / make-up / waste duty gets them) — no if-ras. ──
  { key: 'mortality_handling', driver: (q) => pickQ(q, /standing_biomass_kg|harvest_biomass_kg/), label: 'Mortality Handling System', module: /mass_fluid|process|waste|water/,
    size: (bio) => { const mortsKgDay = (bio * 0.002); return { dim: '', rating: [String(Math.round(mortsKgDay)), 'kg/day morts'], gbp: Math.round(20000 + (bio / 1000) * 120) } },
    form: (bio) => `Per-tank mort collection on the dual-drain + transfer airlift/pump + macerator + acid-dosed ensiling tank (or refrigerated mort store), sized for ~0.2 %/day of the ${Math.round(bio / 1000)} t standing biomass (~${Math.round(bio * 0.002)} kg/day); dead fish are removed before they crash the biofilter` },
  { key: 'intake_treatment', driver: (q) => pickQ(q, /makeup_water_m3_h|make_up_water_m3_h/), label: 'Intake + Make-up Treatment Skid', module: /mass_fluid|process|water|intake/,
    size: (mu) => ({ dim: boxFromThroughputM3h(mu), rating: [String(Math.round(mu)), 'm³/h'], gbp: Math.round(40000 + mu * 900) }),
    form: (mu) => `Make-up intake train: coarse screen → drum/sand pre-filter → aeration + iron/manganese removal (borehole) → UV/ozone disinfection → buffer, sized to the ${Math.round(mu)} m³/h make-up; treats incoming well/seawater before it enters the closed loop` },
  { key: 'effluent_treatment', driver: (q) => { const mu = pickQ(q, /makeup_water_m3_h|make_up_water_m3_h/); return mu ? mu * 0.9 : undefined }, label: 'Effluent Treatment + Discharge System', module: /mass_fluid|process|waste|water|effluent/,
    size: (bl) => ({ dim: boxFromThroughputM3h(bl), rating: [String(Math.round(bl)), 'm³/h'], gbp: Math.round(45000 + bl * 1100) }),
    form: (bl) => `Combined sludge+bleed effluent train: settlement/lamella → belt/geotube dewatering → final screening + UV/de-gas before the consented outfall, sized to the ~${Math.round(bl)} m³/h bleed; carries a sampling/monitoring point for the discharge consent` },
  { key: 'fish_handling', driver: (q) => pickQ(q, /standing_biomass_kg|harvest_biomass_kg/), label: 'Live-Fish Handling + Transfer System', module: /mass_fluid|process|actuation|harvest/,
    size: (bio) => ({ dim: '', rating: [String(Math.round(bio / 1000)), 't biomass'], gbp: Math.round(35000 + (bio / 1000) * 120) }),
    form: (bio) => `Vacuum/centrifugal fish pump + dewatering tower + fish-transfer pipework + crowding screens for moving the ${Math.round(bio / 1000)} t live biomass between tanks, to grading and to harvest — the live-handling train the grading/harvest step needs but a single catalogue line omits` },
  { key: 'biosecurity', driver: (q) => pickQ(q, /standing_biomass_kg|harvest_biomass_kg/), label: 'Biosecurity / Quarantine System', module: /mass_fluid|process|water|biosecurity/,
    size: (bio) => ({ dim: '', rating: [String(Math.round(bio / 1000)), 't biomass'], gbp: Math.round(60000 + (bio / 1000) * 150) }),
    form: (bio) => `Dedicated quarantine/nursery RAS skid (separate tanks + own filtration/UV/ozone, hydraulically isolated from the production loop) + disinfection-barrier line items (foot-baths, wheel-wash, equipment dip) + influent/effluent boundary disinfection — the containment a live-animal import facility (${Math.round(bio / 1000)} t) must have to meet veterinary/consent requirements` },
]

/** Synthesise the process-support systems the contract's consumable + waste duties imply —
 *  dosing, feed, oxygen (LOX), sludge handling, SCADA, grading. Mutates modules in place;
 *  returns the number of systems added. Universal — driven by declared duties. */
export function synthesizeProcessSystems(modules: ModuleLike[], quantities: Record<string, number>): number {
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) {
    if (Array.isArray(sm.words)) sm.words = sm.words.filter((w) => !isProcessSystem(w))
  }
  let n = 0
  for (const spec of PROCESS_SYSTEMS) {
    const d = spec.driver(quantities)
    if (!d || !(d > 0)) continue
    const sm = findSubModuleByRe(modules, spec.module) ?? (modules?.[0]?.sub_modules ?? [])[0] as SubLike | undefined
    if (!sm) continue
    // SUPERSEDE the generic word-engine placeholder for this function (e.g. the LOX
    // system replaces the bare "Oxygenation System" word) so the design carries ONE
    // fully-wired part, not a wired system + an orphan duplicate (the connectivity-
    // completeness gap, 2026-06-20). Flag-guarded: only a NON-synthesised PRINCIPAL word
    // is removed — instruments / actuators / utilities / other systems are kept (so the
    // Dissolved-Oxygen Analyser + DO control valve survive). Universal, opt-in per spec.
    if (spec.supersedes) {
      for (const m of modules ?? []) for (const s of m.sub_modules ?? []) {
        if (!Array.isArray(s.words)) continue
        s.words = s.words.filter((w) => {
          const isPrincipalPlaceholder = !isInstrument(w) && !isActuator(w) && !isUtility(w)
            && !isProcessSystem(w) && !String(w.id ?? '').includes('__')
          return !(isPrincipalPlaceholder && spec.supersedes!.test(String(w.name_human ?? '')))
        })
      }
    }
    ;((sm.words ??= []) as WordLike[]).push(utilityWord(spec, d, 'process', quantities))
    n += 1
  }
  return n
}

/** Synthesise the balance-of-plant utility + safety systems the contract's duties imply —
 *  standby generator, make-up water, bleed/drain, building ventilation. Mutates modules in
 *  place; returns the number of systems added. Universal — driven by declared duties. */
export function synthesizeUtilitySafety(modules: ModuleLike[], quantities: Record<string, number>): number {
  // idempotency: drop any utility systems a prior pass added
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) {
    if (Array.isArray(sm.words)) sm.words = sm.words.filter((w) => !isUtility(w))
  }
  let n = 0
  for (const spec of UTILITY_SYSTEMS) {
    const d = spec.driver(quantities)
    if (!d || !(d > 0)) continue
    const sm = findSubModuleByRe(modules, spec.module) ?? (modules?.[0]?.sub_modules ?? [])[0] as SubLike | undefined
    if (!sm) continue
    ;((sm.words ??= []) as WordLike[]).push(utilityWord(spec, d))
    n += 1
  }
  return n
}

// ──────────────────────────────────────────────────────────────────────────────
// BUILDING-STRUCTURE TAKE-OFF SYNTHESIS (Tristan #145 — "the plant is a building").
//
// THE WALL it removes (RAS, 2026-06-16): a land-based RAS is fundamentally a large
// INSULATED HALL that houses the tanks — typically 15-30 % of capex — yet the BoM
// carried only a skeleton "Structural Frame £3,078" token and the building envelope was
// mis-sized at 216 m² while ten ⌀12.4 m rearing tanks need ~1,200 m² of tank footprint
// (≈2,400 m² of hall with access). So the single largest civil line item was simply
// ABSENT, and any downstream consumer that asked the contract for a footprint got a
// type-default 216 m² instead of the real ~2,400 m².
//
// This pass DERIVES the building deterministically from the equipment it houses, then
// emits a parametric take-off (slab / portal frame / wall + roof cladding / foundations /
// doors) as `_structure`-flagged synthesised words, and writes the real footprint back to
// the contract quantities so the GA + the heat-loss tool size against it. Universal — a
// HOUSED process plant of any archetype gets a hall scaled to its own equipment; a
// manufactured product with no housed footprint (a drone) gets nothing (the pass is a
// no-op below ~30 m² of total equipment footprint). No per-class table, British spelling.
// ──────────────────────────────────────────────────────────────────────────────

function isBuildingStructure(w: WordLike): boolean {
  return (w as { _structure?: boolean })._structure === true
}

// A principal equipment item's PLAN FOOTPRINT (m²) parsed from its dimension modifier:
//   · a cylinder "⌀D m dia x H m" → π(D/2)²  (the circle the vessel stands on)
//   · a box "W x D x H mm" → (W·D)/1e6        (the rectangle the skid stands on)
// A "<a> m² area" dimension is a HEAT-TRANSFER / membrane SURFACE area, NOT a plan
// footprint (a 117 m² HEX occupies a ~few-m² shell), so it is deliberately NOT counted.
// Returns 0 when no plan footprint can be read.
function planFootprintM2(w: WordLike): number {
  const dim = String((w.modifier_characters ?? []).find((m) => m.kind === 'dimension' || m.kind === 'dimensions')?.value ?? '')
  if (!dim) return 0
  const cyl = /([\d.]+)\s*m\s*dia/i.exec(dim)
  if (cyl) { const d = parseFloat(cyl[1]); return Number.isFinite(d) && d > 0 ? Math.PI * (d / 2) * (d / 2) : 0 }
  const box = /([\d.]+)\s*x\s*([\d.]+)\s*x\s*[\d.]+\s*mm/i.exec(dim)
  if (box) { const w_ = parseFloat(box[1]); const d_ = parseFloat(box[2]); return Number.isFinite(w_) && Number.isFinite(d_) ? (w_ * d_) / 1e6 : 0 }
  return 0
}

// The tallest equipment height (m), used to set the hall clear height. Reads a cylinder
// height "dia x H m" or a box height "W x D x H mm".
function equipHeightM(w: WordLike): number {
  const dim = String((w.modifier_characters ?? []).find((m) => m.kind === 'dimension' || m.kind === 'dimensions')?.value ?? '')
  const cyl = /dia[^x]*x\s*([\d.]+)\s*m/i.exec(dim)
  if (cyl) { const h = parseFloat(cyl[1]); return Number.isFinite(h) ? h : 0 }
  const box = /[\d.]+\s*x\s*[\d.]+\s*x\s*([\d.]+)\s*mm/i.exec(dim)
  if (box) { const h = parseFloat(box[1]); return Number.isFinite(h) ? h / 1000 : 0 }
  return 0
}

// A building TAKE-OFF element: priced parametrically from the derived footprint / wall /
// roof areas (UK 2026 installed rates, £/m² unless a flat figure). `qty` is the area (or 1
// for the flat door allowance); `rate` is £/m² (or the flat £ when qtyIsArea is false).
interface BuildingElementSpec {
  key: string
  label: string
  area: (g: BuildingGeometry) => number // the area this element is priced over (m²)
  gbpPerM2: number // £/m² (UK 2026 installed)
  flatGbp?: number // a fixed allowance instead of area×rate (doors)
  form: (g: BuildingGeometry) => string
}
interface BuildingGeometry {
  footprintM2: number
  heightM: number
  wallAreaM2: number
  roofAreaM2: number
}

const BUILDING_ELEMENTS: BuildingElementSpec[] = [
  { key: 'floor_slab', label: 'Reinforced Floor Slab', area: (g) => g.footprintM2, gbpPerM2: 140,
    form: (g) => `Reinforced concrete ground-bearing slab, ~${Math.round(g.footprintM2).toLocaleString('en-GB')} m², power-floated and falls-to-drain — carries the tank loads, the equipment and the wet-process floor` },
  { key: 'portal_frame', label: 'Steel Portal Frame', area: (g) => g.footprintM2, gbpPerM2: 90,
    form: (g) => `Hot-rolled steel portal frame to ~${g.heightM.toFixed(1)} m haunch over ~${Math.round(g.footprintM2).toLocaleString('en-GB')} m², with purlins + side rails — the primary structure of the process hall` },
  { key: 'wall_cladding', label: 'Insulated Wall Cladding', area: (g) => g.wallAreaM2, gbpPerM2: 70,
    form: (g) => `Insulated composite wall cladding, ~${Math.round(g.wallAreaM2).toLocaleString('en-GB')} m² (perimeter ${Math.round(4 * Math.sqrt(g.footprintM2))} m × ${g.heightM.toFixed(1)} m), holds the controlled internal environment against the make-up heat load` },
  { key: 'roof_cladding', label: 'Insulated Roof Cladding', area: (g) => g.roofAreaM2, gbpPerM2: 75,
    form: (g) => `Insulated composite roof cladding, ~${Math.round(g.roofAreaM2).toLocaleString('en-GB')} m², with rooflights + gutters — caps the conditioned process volume` },
  { key: 'foundations', label: 'Foundations + Ground Works', area: (g) => g.footprintM2, gbpPerM2: 60,
    form: (g) => `Pad / strip foundations + sub-base + drainage over the ~${Math.round(g.footprintM2).toLocaleString('en-GB')} m² building footprint` },
  { key: 'doors', label: 'Roller + Personnel Doors', area: () => 1, gbpPerM2: 0, flatGbp: 12000,
    form: () => `Insulated roller-shutter access doors + personnel / fire-escape doors for the process hall` },
]

function buildingWord(spec: BuildingElementSpec, g: BuildingGeometry): WordLike {
  const area = spec.area(g)
  const gbp = spec.flatGbp !== undefined ? spec.flatGbp : Math.max(1, Math.round(area * spec.gbpPerM2))
  const mods: ModifierCharacter[] = [mod('quantity', '×1')]
  // Element dimension: an area for the area-priced elements; the gross hall envelope for the
  // frame so the GA + reader see the building extent.
  if (spec.flatGbp === undefined) mods.push(mod('dimension', `${Math.round(area)} m² area`))
  else mods.push(mod('dimension', `${Math.round(4 * Math.sqrt(g.footprintM2))} m perimeter`))
  mods.push(mod('rating_primary', `${Math.round(g.footprintM2)}`, 'm² footprint'))
  mods.push(mod('price_estimate_gbp', String(Math.max(1, Math.round(gbp)))))
  // TYPED SERVICE (Phase 0 — council 2026-06-17): a building element is dry, at
  // atmospheric pressure, and priced as a CIVIL take-off (£/m²), never a vessel. The
  // descriptor is emitted HERE at synthesis from the element's own civil identity (the
  // take-off already carries a footprint/area driver, no fluid), so the cost
  // characteriser keys off this TYPED field — never a downstream noun re-parse.
  mods.push(mod('service', serviceJson({ fluid: 'none', phase: 'solid', pressure_bar: 0, fabrication_family: 'building_element', criticality: 'standard' })))
  mods.push(mod('form', spec.form(g)))
  mods.push(mod('part_number', 'TBD'))
  mods.push(mod('lifecycle', 'Concept design — building element sized parametrically from the housed-equipment footprint; quantities confirmed at detailed design'))
  mods.push(mod('installation', 'Building / civil works — the hall that houses the plant'))
  const id = `bldg_${spec.key}`
  return { id, name_human: spec.label, content_character: { character_id: id, name_human: spec.label }, modifier_characters: mods, ...({ _synthesized: true, _structure: true } as object) }
}

/**
 * Synthesise the BUILDING the plant lives in — a deterministic take-off (floor slab,
 * portal frame, wall + roof cladding, foundations, doors) sized from the principal
 * equipment's plan footprint, and write the derived footprint / floor area / height /
 * wall area back to the contract quantities (so the GA + the heat-loss tool use the REAL
 * footprint, fixing the type-default). Mutates `modules` in place AND `quantities` in
 * place (adds the building_* keys); when `contract` is supplied it ALSO persists those
 * keys to `contract.quantities` in the engine's `{value, unit, …}` shape so the saved
 * contract carries the real footprint. Returns the number of building words added.
 *
 * Universal: any housed process plant gets a hall scaled to its own equipment; a
 * manufactured product with a negligible housed footprint gets nothing (no-op below
 * ~30 m² of total equipment footprint — no hall for a drone). No per-class table.
 */
export function synthesizeBuildingStructure(
  modules: ModuleLike[],
  quantities: Record<string, number>,
  contract?: ContractInProgress,
): number {
  // idempotency: drop any building-structure words a prior pass added (re-derive cleanly).
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) {
    if (Array.isArray(sm.words)) sm.words = sm.words.filter((w) => !isBuildingStructure(w))
  }

  // SCOPE FIDELITY (Tristan 2026-06-25): if the brief EXPLICITLY excludes the building / civils
  // (a process plant supplied INTO an existing building by others — e.g. the Codema Fischer Farms
  // water/fertigation plant), do NOT synthesise a hall around the equipment. Otherwise the universal
  // BUILDING_ELEMENTS add a floor slab + portal frame + cladding + foundations regardless of scope
  // — a £1.1M+ scope-creep line on a plant whose building is supplied by others. Keyed on the brief's
  // OWN exclusion words (carried on the contract by any archetype that emits scope_exclusions_desc),
  // universal + opt-in — no per-class table. A class that excludes nothing is unaffected (the
  // building still synthesises as before).
  // PRIMARY signal — a numeric flag on the quantities map (this DOES propagate into the orchestrator
  // contract, unlike the string scope_exclusions_desc on shared_quantities, which is stripped).
  const buildingExcludedFlag = Number(
    quantities?.['building_out_of_scope'] ?? quantities?.['building_excluded'] ?? 0,
  )
  // FALLBACK — the string exclusions, when an archetype does carry them through.
  const scopeExclusions = String(
    (contract as unknown as { shared_quantities?: Record<string, unknown>; scope_exclusions_desc?: unknown })
      ?.shared_quantities?.scope_exclusions_desc
    ?? (contract as unknown as { scope_exclusions_desc?: unknown })?.scope_exclusions_desc ?? '',
  ).toLowerCase()
  if (buildingExcludedFlag >= 1 || /\bbuilding\b|\bcivils?\b|\bthe\s+hall\b|process\s+hall|rack\s+framework/.test(scopeExclusions)) {
    return 0
  }

  // Collect the PLAN FOOTPRINT (× quantity) + height of every PRINCIPAL equipment item it
  // houses. Exclude the non-principal synthesised families (instruments / actuators /
  // utilities / process-support / sub-components) — they sit on / inside the principals, not
  // beside them — and any prior structure word (already dropped above, belt-and-braces).
  type Item = { stems: string[]; fp: number; h: number }
  const items: Item[] = []
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    if (isInstrument(w) || isActuator(w) || isUtility(w) || isProcessSystem(w) || isSubcomponent(w) || isBuildingStructure(w)) continue
    const fp = planFootprintM2(w)
    if (fp <= 0) continue
    items.push({ stems: wordStems(w), fp: fp * parentQty(w), h: equipHeightM(w) })
  }

  // De-duplicate the SAME physical vessel represented under two contract keys (e.g. a
  // biofilter's `_tank_volume` ⌀4.6 AND its `_working_volume` ⌀8.6 both synthesise a vessel —
  // one tank, counted twice would inflate the hall + pick a phantom tallest). Two principals
  // whose stem-sets are subset-related (one names the same equipment as the other, just more
  // specifically) are ONE physical item: keep the LARGER footprint + the taller height once.
  // Distinct equipment (rearing tank vs drum filter vs degasser) share no subset relation and
  // are summed normally. Universal — mirrors the reconcile's subset-claim logic, no class table.
  const merged: Item[] = []
  for (const it of items) {
    const dup = merged.find((m) =>
      (m.stems.length > 0 && m.stems.every((s) => it.stems.includes(s))) ||
      (it.stems.length > 0 && it.stems.every((s) => m.stems.includes(s))))
    if (dup) {
      if (it.fp > dup.fp) dup.fp = it.fp
      if (it.h > dup.h) dup.h = it.h
      if (it.stems.length > dup.stems.length) dup.stems = it.stems // keep the more-specific name
    } else {
      merged.push({ ...it })
    }
  }
  let equipFootprint = 0
  let tallest = 0
  for (const it of merged) { equipFootprint += it.fp; if (it.h > tallest) tallest = it.h }

  // UNIVERSAL no-op guard: a product with a negligible housed footprint (a drone, an
  // edge-AI box, a satellite) is NOT a building — don't synthesise a hall for it.
  if (equipFootprint < 30) return 0

  // Footprint = equipment footprint × an aisle / access / services factor, floored at a
  // small minimum hall. A square approximation gives the perimeter + wall area.
  const AISLE_FACTOR = 2.2
  const footprintM2 = Math.max(150, Math.round(equipFootprint * AISLE_FACTOR))
  const heightM = Math.max(6, Math.round((tallest + 2.5) * 10) / 10) // tallest equipment + ~2.5 m clearance, floored ~6 m
  const side = Math.sqrt(footprintM2) // square hall approximation
  const wallAreaM2 = Math.round(4 * side * heightM)
  const roofAreaM2 = footprintM2
  const g: BuildingGeometry = { footprintM2, heightM, wallAreaM2, roofAreaM2 }

  // Write the derived envelope back to the contract quantities so the GA + the heat-loss
  // tool size against the REAL footprint (fixes the 216 m² type-default). The local
  // number-map (read by same-call consumers) AND — when the contract is supplied — the
  // persisted `contract.quantities` (in the engine's `{value, unit, …}` shape) both get
  // the keys, so the saved contract carries the real footprint downstream.
  const envelope: { key: string; value: number; unit: string }[] = [
    { key: 'building_footprint_m2', value: footprintM2, unit: 'm²' },
    { key: 'building_gross_floor_area_m2', value: footprintM2, unit: 'm²' },
    { key: 'building_height_m', value: heightM, unit: 'm' },
    { key: 'building_wall_area_m2', value: wallAreaM2, unit: 'm²' },
  ]
  for (const e of envelope) quantities[e.key] = e.value
  if (contract) {
    const cq = ((contract as { quantities?: Record<string, unknown> }).quantities ??= {}) as Record<string, unknown>
    for (const e of envelope) {
      cq[e.key] = {
        value: e.value,
        unit: e.unit,
        family: 'geometry',
        basis: 'derived',
        scope: 'system',
        source: 'calculator',
        source_detail: 'building take-off — equipment plan footprint × ~2.2 aisle/access factor (synthesizeBuildingStructure)',
      }
    }
  }

  // ── PHASE 0: GROUND THE LEGACY SKELETON STRUCTURE WORD IN THE FOOTPRINT PHYSICS ──
  // The generic skeleton emits a bare representative "Structural Frame" word
  // (structure_containment floor) that carries NO size driver — and downstream the
  // cost characteriser, finding no driver on the word, reached for the whole-plant
  // bounding-box geometry and priced it as a 57,000 m³ closed pressure vessel (the
  // £42.36M bug). The building take-off has JUST computed the real hall footprint, so
  // stamp THAT footprint onto the bare structural word as a genuine AREA DRIVER + the
  // TYPED structural service. The part is now driven by the physics that created it (the
  // building plan area), not its noun — so deriveService + the cost characteriser price
  // it as structural tonnage / £-per-m², never a vessel. Universal: any unhoused product
  // never reaches here (the no-op guard above), and a structural word that already
  // carries a real driver (a synthesised building element, a sized member) is left
  // untouched. No per-class table.
  const STRUCTURAL_SKELETON_RE = /structural[_ ]?frame|structure[_ ]?frame|\bframe\b|enclosure|structural[_ ]?member|space[_ ]?frame|chassis|skid[_ ]?frame|support[_ ]?structure/i
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    if (isBuildingStructure(w) || isSubcomponent(w) || isInstrument(w) || isActuator(w) || isUtility(w) || isProcessSystem(w)) continue
    const charId = String(w.content_character?.character_id ?? w.id ?? '')
    const nm = String(w.name_human ?? '')
    if (!STRUCTURAL_SKELETON_RE.test(charId) && !STRUCTURAL_SKELETON_RE.test(nm)) continue
    // only a TRULY un-driven structural placeholder: no fluid capacity, no kW/kVA
    // rating, no 3-D vessel geometry, no area dimension yet. (A frame that already
    // carries a real driver — or a vessel/machine that merely contains "frame" in its
    // name — is skipped.)
    if (deriveService(w, quantities) !== null) continue
    const existing = w.modifier_characters ?? []
    const hasDim = existing.some((mc) => (mc.kind === 'dimension' || mc.kind === 'dimensions') && String(mc.value ?? '').trim() !== '')
    if (hasDim) continue
    mergeMods(w, [
      mod('dimension', `${footprintM2} m² footprint, ${heightM.toFixed(1)} m haunch height`),
      mod('rating_primary', `${footprintM2}`, 'm² footprint'),
      mod('service', serviceJson({ fluid: 'none', phase: 'solid', pressure_bar: 0, fabrication_family: 'structural', criticality: 'standard' })),
    ])
  }

  // Place the take-off in the structure / containment module (fallback: first module with
  // a sub-module), matching the /structure|contain|building|civil/ intent.
  const target = findSubModuleByRe(modules, /structure|contain|building|civil/i)
    ?? (modules?.[0]?.sub_modules ?? [])[0] as SubLike | undefined
  if (!target) return 0

  let n = 0
  for (const spec of BUILDING_ELEMENTS) {
    ;((target.words ??= []) as WordLike[]).push(buildingWord(spec, g))
    n += 1
  }
  return n
}

// ──────────────────────────────────────────────────────────────────────────────
// TYPED SERVICE AT SYNTHESIS (Phase 0 — council 2026-06-17, the £42.36M Structural
// Frame bug). THE ROOT FIX.
//
// THE BUG it removes: the cost characteriser (requirements_bom.py) decided a part's
// FABRICATION KIND from a noun-regex on its NAME. "Structural Frame" matched the
// `frame|structure` shell-fabrication branch → a CLOSED pressure-vessel hoop-stress
// take-off → a 66 mm steel wall over the whole-plant 54.5×54.5×24.5 m bounding box →
// 4.6 M kg × £4.5/kg × 1.70 = £42.36 M. A noun decided physics it had no business
// deciding, and there was no second value to contradict it.
//
// THE FIX (council-mandated, NOT another noun-check): every word carries a TYPED
// `service{}` descriptor, EMITTED HERE at synthesis, DERIVED FROM ITS DRIVER QUANTITY
// — not re-parsed from its name downstream:
//   · a part whose only size driver is a FOOTPRINT/PLAN AREA (m² / m² footprint /
//     m² area), with NO fluid capacity and NO pressure  → structural, dry, 0 bar.
//   · a part with a real m³ FLUID capacity or a m³/h FLOW driver               → a
//     fluid vessel; its pressure_bar is read from the contract (a reactor_pressure_bar
//     / column_pressure_bar quantity), else 0 (an open / atmospheric tank).
//   · a part whose only driver is a kW / kVA POWER rating, with no fluid         → a
//     rotating / electrical machine, dry, 0 bar.
// The characteriser reads `service.fabrication_family` and prices STRUCTURAL by
// tonnage / £-per-m² (never hoop-stress), a FLUID vessel by a shell take-off only when
// it truly has fluid + pressure, an open tank by the open take-off. The legacy
// noun-heuristic survives ONLY as the fallback when a word has no typed service
// (legacy archetypes), so nothing else moves. Universal, deterministic, no per-class
// table; the descriptor is a single JSON `service` modifier so requirements_bom.py
// reads it per part.
// ──────────────────────────────────────────────────────────────────────────────

type FluidKind = 'process_water' | 'seawater' | 'gas' | 'process_liquid' | 'none'
type FabricationFamily = 'fluid_vessel' | 'structural' | 'rotating_electrical' | 'building_element' | 'commodity' | 'unknown'
interface ServiceDescriptor {
  fluid: FluidKind
  phase: 'liquid' | 'gas' | 'solid' | 'multiphase' | 'none'
  pressure_bar: number
  fabrication_family: FabricationFamily
  criticality: 'standard' | 'high'
}

/** Serialise a typed service descriptor to the compact JSON the `service` modifier
 *  carries (read verbatim by requirements_bom.py). */
function serviceJson(s: ServiceDescriptor): string {
  return JSON.stringify({
    fluid: s.fluid,
    phase: s.phase,
    pressure_bar: Math.round(s.pressure_bar * 100) / 100,
    fabrication_family: s.fabrication_family,
    criticality: s.criticality,
  })
}

/** True if a dimension string is an AREA driver (a footprint / plan / membrane area)
 *  rather than a 3-D vessel geometry. `… m² footprint`, `… m² area`, a bare `… m²`. */
function dimIsAreaDriver(dim: string): boolean {
  if (!dim) return false
  if (/m\s*dia/i.test(dim)) return false // a cylinder — a vessel, not an area
  if (/\d\s*x\s*\d.*mm/i.test(dim)) return false // a W×D×H box — a 3-D part
  return /m²|m2\b|sq\s*m|square\s*met/i.test(dim) && /footprint|area|plan|floor|slab|roof|wall|membrane/i.test(dim)
}

/** The vessel design pressure (bar gauge) for a fluid part, read from the CONTRACT
 *  quantities by the part's stem — a `*_pressure_bar` / `*_design_pressure_bar` /
 *  `*_pressure_barg` key whose stem token-overlaps the word, else the single global
 *  `reactor_pressure_bar` / `operating_pressure_bar` when present, else 0
 *  (atmospheric). A kPa pressure-DROP key is NOT a design pressure and is ignored.
 *  This is DRIVER physics, not a name read. */
function vesselPressureBar(w: WordLike, quantities: Record<string, number>): number {
  const stems = new Set(wordStems(w))
  const pressureKeys = Object.keys(quantities).filter((k) => /(_|^)(design_)?pressure_bar(g)?$/i.test(k) || /(_|^)operating_pressure_bar$/i.test(k))
  // 1) a pressure key whose stem token-overlaps this part's stems (its OWN pressure).
  let best = 0
  for (const k of pressureKeys) {
    const v = quantities[k]
    if (!Number.isFinite(v) || v <= 0) continue
    const keyToks = k.replace(/(_|^)(design_|operating_)?pressure_bar(g)?$/i, '').split(/[_\d]+/).filter(Boolean)
    if (keyToks.some((t) => stems.has(t))) best = Math.max(best, v)
  }
  if (best > 0) return best
  // 2) a vessel that is plainly a pressurised PROCESS vessel adopts the NOUN-MATCHING
  //    global process-pressure key the contract declares — a reactor reads
  //    `reactor_pressure_bar`, a column/absorber/stripper reads `column_pressure_bar`
  //    (NOT a reactor's pressure: an absorber is not at the reactor's pressure). It only
  //    falls back to a single generic `operating_/system_pressure_bar` when no
  //    noun-specific key exists. Either way the FABRICATION FAMILY is fluid_vessel; this
  //    only sharpens the design pressure (and thus the wall), never the branch.
  const nm = w.name_human ?? ''
  const nounKeys: string[] = []
  if (/reactor|autoclave|digester/i.test(nm)) nounKeys.push('reactor_pressure_bar')
  if (/column|tower|absorber|stripper|scrubber|contactor|distillation|fractionation/i.test(nm)) nounKeys.push('column_pressure_bar', 'absorber_pressure_bar', 'stripper_pressure_bar')
  if (/separator|knock.?out|flash|drum|crystalli/i.test(nm)) nounKeys.push('separator_pressure_bar')
  for (const k of [...nounKeys, 'operating_pressure_bar', 'system_pressure_bar']) {
    const v = quantities[k]
    if (Number.isFinite(v) && v > 0) return v
  }
  return 0
}

/** Derive the TYPED service descriptor for a word FROM ITS DRIVER QUANTITY (never its
 *  noun). Returns null when the word has no characterising driver (a pure commodity /
 *  sub-component / instrument is left for the catalogue path). */
function deriveService(w: WordLike, quantities: Record<string, number>): ServiceDescriptor | null {
  const mods = w.modifier_characters ?? []
  const dim = String(mods.find((m) => m.kind === 'dimension' || m.kind === 'dimensions')?.value ?? '')
  const capMod = mods.find((m) => m.kind === 'capacity')
  const capM3 = capMod && /m³|m3/.test(String(capMod.unit ?? '') + ' ' + String(capMod.value ?? '')) ? (parseFloat(String(capMod.value)) || 0) : 0
  const rating = mods.find((m) => m.kind === 'rating_primary')
  const ratingUnit = String(rating?.unit ?? '').toLowerCase()
  const ratingVal = rating ? parseFloat(String(rating.value)) || 0 : 0

  // 1) FOOTPRINT / PLAN-AREA driver + NO fluid capacity + NO 3-D vessel dimension →
  //    a STRUCTURAL, dry, atmospheric part (the £42M Structural Frame case: its driver
  //    is a `… m² footprint`, never a vessel). Decided by the DRIVER, not the name.
  // 0) HEAT EXCHANGER — its m² is the HEAT-TRANSFER area (a thermal-process spec), NEVER a
  //    building footprint, so it must not fall to the structural rule below. (The 'Makeup Hex'
  //    abbreviation evaded the device classifier and was priced as structural tonnage in the
  //    building module; the physics critic flagged the mis-placement.) A water/water plate HEX
  //    is a fluid component on the process-water side. Universal: keyed off the exchanger noun.
  if (/heat[\s-]?exchang|\bhx\b|\bhex\b|condenser|evaporator|\beconomiser\b|\binterchanger\b|recuperat/i.test(w.name_human ?? '')) {
    const seawaterHx = /seawater|brine|marine|sea.?water|saline|titanium/i.test(w.name_human ?? '')
    return { fluid: seawaterHx ? 'seawater' : 'process_water', phase: 'liquid', pressure_bar: 0, fabrication_family: 'fluid_vessel', criticality: 'standard' }
  }

  const areaDriver = dimIsAreaDriver(dim) || /m²|m2\b/.test(ratingUnit)
  const hasVesselGeom = /m\s*dia/i.test(dim) || /\d\s*x\s*\d.*mm/i.test(dim)
  if (areaDriver && capM3 <= 0 && !hasVesselGeom) {
    return { fluid: 'none', phase: 'solid', pressure_bar: 0, fabrication_family: 'structural', criticality: 'standard' }
  }

  // 2) FLUID driver — a real m³ capacity OR a 3-D vessel geometry on a vessel-noun
  //    holdup (reuse the existing physics-based isFluidVessel detector). Its pressure
  //    comes from the CONTRACT; an atmospheric tank reads 0 bar (an OPEN tank).
  if (isFluidVessel(w) || capM3 >= 1) {
    const pbar = vesselPressureBar(w, quantities)
    const seawater = /seawater|brine|marine|sea.?water|saline/i.test(w.name_human ?? '')
    const gas = /gas|vapour|vapor|\bco2\b|oxygen|nitrogen|flue|stack/i.test(w.name_human ?? '') && !/water|tank|basin/i.test(w.name_human ?? '')
    return {
      fluid: gas ? 'gas' : seawater ? 'seawater' : 'process_water',
      phase: gas ? 'gas' : 'liquid',
      pressure_bar: pbar,
      fabrication_family: 'fluid_vessel',
      criticality: pbar > 0 ? 'high' : 'standard',
    }
  }

  // 3) kW / kVA POWER driver with NO fluid → a ROTATING / ELECTRICAL machine, dry.
  if ((ratingUnit.includes('kw') || ratingUnit.includes('kva')) && ratingVal > 0) {
    return { fluid: 'none', phase: 'none', pressure_bar: 0, fabrication_family: 'rotating_electrical', criticality: 'standard' }
  }

  return null
}

/**
 * Stamp a TYPED `service` modifier on every characterisable word in the design,
 * DERIVED FROM ITS DRIVER QUANTITY (Phase 0 root fix). Runs as the FINAL synthesis
 * pass — after the principal-equipment sizing, the instrument / actuator / utility /
 * process / building synthesis AND the legacy skeleton words are all in place — so a
 * footprint-driven "Structural Frame" carries `fabrication_family:'structural'` and
 * the cost characteriser never reaches its hoop-stress branch.
 *
 * Idempotent (re-derives + replaces a prior `service` via mergeMods). Skips
 * sub-components (their parent carries the service) and any word with no driver
 * (a pure commodity / instrument is a catalogue line). Mutates `modules` in place;
 * returns the count of words annotated. Universal — no per-class table.
 */
export function annotateServiceFamilies(modules: ModuleLike[], quantities: Record<string, number>): number {
  let n = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        if (isSubcomponent(w)) continue // the parent carries the service descriptor
        // building words already carry their typed service from buildingWord(); leave
        // them (deriveService would re-confirm building_element via the area driver,
        // but buildingWord set it authoritatively — don't churn it).
        if (isBuildingStructure(w)) continue
        const svc = deriveService(w, quantities)
        if (!svc) continue
        mergeMods(w, [mod('service', serviceJson(svc))])
        n += 1
      }
    }
  }
  return n
}

export interface UniversalSizingResult {
  sized: number
  synthesized: number
  dropped: number
  exploded: number
  instrumented: number
  actuated: number
  utilities: number
  processSystems: number
  buildingStructure: number
  mainIncomer: number
  serviceFamilies: number
  groups: number
  matchedPhrases: string[]
  synthesizedPhrases: string[]
}

// ──────────────────────────────────────────────────────────────────────────────
// PRINCIPAL-EQUIPMENT RECONCILE (Stage F core — Tristan 2026-06-14).
//
// THE WALL it removes (verified on out/ras-converged2): the emitter SYNTHESISES the
// principal equipment deterministically from the contract (4-generator.json: a
// "Rearing Tank" word, id=rearing_tank_synth_word, qty=×10, 9.5 m dia × 4.7 m), but
// the THREE post-emission LLM stages that follow (R1 reviewer, R4 reviewer, Phase-2
// repair) can rewrite a synthesised word's identity wholesale — in the converged run
// the rearing tank's id AND content_character were both overwritten to a SIBLING's
// (biofilter_synth_word) and its count collapsed ×10 → ×1. The emitter-identity-lock
// (which keys on word-id + char-id) cannot heal that: when BOTH keys are rewritten to
// collide with another real word, the snapshot entry is simply "missing" and the
// corrupted word silently matches the wrong entry. Result: the drawings + Blender +
// bill of materials (all read from the final moduleDecomposition) render 1 tank where
// the contract says 10, and the count VARIES run-to-run because it is whatever the LLM
// left, not what the contract computed.
//
// This pass makes the PRINCIPAL-EQUIPMENT SET authoritative from the DETERMINISTIC
// contract again, AFTER the LLM stages, just before state is saved (so geometry, BoM
// and cost all consume it). For every synthesisable contract group it guarantees
// EXACTLY ONE canonical equipment word with the contract-derived identity (id, char-id,
// name) + count + dimension + rating, repairing a corrupted/renamed survivor in place
// and dropping LLM duplicate/collided copies (and their orphaned sub-components). The
// LLM may still DECORATE (prose, narrative) but it can no longer DEFINE or mutate the
// principal-equipment set or its counts. Universal — consumes whatever the contract
// computed, any archetype, no `if class`. Only `_synthesized` words are touched, so a
// registered hand-emitter (which never sets `_synthesized`) is byte-untouched.
// ──────────────────────────────────────────────────────────────────────────────

interface CanonEquip {
  group: EquipGroup
  id: string
  charId: string
  name: string
}

function canonFor(g: EquipGroup): CanonEquip {
  return {
    group: g,
    id: `${g.phrase}_synth_word`,
    charId: `${g.phrase}_synth`,
    name: titleCase(g.phrase),
  }
}

// ── SYNONYM-AWARE PRINCIPAL DEDUP (Tristan #136 "ONE part identity", council 2026-06-16) ────
// THE WALL it removes (verified on out/ras-v10): the contract computes ONE recirculation pump
// (`recirc_pump_power_kw = 94`, `recirc_pump_count = 8`) but the BoM carried it TWICE under
// synonym names — a grounded emitter word "Circulation Pump" (94 kW × 8) AND the synthesised
// "Recirc Pump" (94 kW × 8) — the SAME physical pump in the SAME recirc loop, doubling its
// £526k. The principal reconcile's exact-id + stem-subset dedup misses this: "circulation"
// (stem `circul`) and "recirc"/"recirculation" (stem `recir`) are DIFFERENT stems, so neither
// claims the other, and one of the two isn't `_synthesized` so the reconcile skips it entirely.
//
// THE RULE (universal, no class table): two PRINCIPAL words collapse to one when they (a)
// resolve to the SAME canonical ROLE (a general role-synonym map keyed on the device kind +
// its function qualifier — circulation ≡ recirculation ≡ recirc for a PUMP; drum ≡ microscreen
// for a FILTER) AND (b) carry a COMPATIBLE rating (within tolerance) AND a COMPATIBLE count.
// All three must hold, so a make-up pump, a feed pump, a backwash pump (DIFFERENT role
// qualifiers) or a differently-rated/​differently-counted pump are NEVER merged. The survivor
// is the better-IDENTIFIED word (real catalogue MPN > priced > grounded-emitter > richer
// modifier set); exactly ONE cost remains. BESS/SAF: a no-op when no two principals share a
// role+rating. British spelling.

// Canonical ROLE qualifiers: each maps a family of synonym tokens onto ONE canonical token, so
// "circulation"/"recirc"/"recirculation" all key the SAME role while "makeup"/"feed"/"backwash"
// stay distinct. ONLY synonyms of the SAME function belong in a set — never merge distinct duties.
const ROLE_SYNONYMS: { canonical: string; tokens: string[] }[] = [
  { canonical: 'recirc', tokens: ['recirc', 'recirculation', 'recirculating', 'circulation', 'circulating', 'circ'] },
  { canonical: 'microscreen', tokens: ['microscreen', 'micro-screen', 'drumfilter', 'drum'] },
  { canonical: 'transfer', tokens: ['transfer', 'conveyance'] },
  { canonical: 'makeup', tokens: ['makeup', 'make-up', 'topup', 'top-up'] },
  { canonical: 'booster', tokens: ['booster', 'boost'] },
]
// The DEVICE KIND nouns a role attaches to — the second half of the role key. A role only
// collapses two words of the SAME kind (a recirc PUMP never merges with a recirc FAN). Shared
// with DEVICE_NOUNS conceptually but kept explicit here so the role key is stable.
const ROLE_DEVICE_KINDS = ['pump', 'filter', 'screen', 'blower', 'fan', 'compressor', 'mixer', 'separator', 'clarifier', 'exchanger']
function normTok(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '')
}
function canonicalRoleToken(tok: string): string {
  const n = normTok(tok)
  for (const r of ROLE_SYNONYMS) if (r.tokens.some((s) => normTok(s) === n)) return r.canonical
  return n
}
/** A word's ROLE SIGNATURE: `<canonical-role-qualifier>|<device-kind>` (e.g. recirc|pump),
 *  or undefined when the name carries no device kind OR no recognised role qualifier — those
 *  words are never synonym-merged (they fall to the normal id/stem reconcile). The qualifier
 *  must be a KNOWN synonym (present in a ROLE_SYNONYMS set); a bare "Pump" with no qualifier,
 *  or a unique qualifier (make-up, feed, backwash) that is its OWN role, yields its own key —
 *  so only true synonyms ever collide. */
function wordRoleTokens(w: WordLike): string[] {
  const name = `${w.name_human ?? ''} ${w.content_character?.name_human ?? ''}`
  return name.split(/[_\s]+/).map(normTok).filter(Boolean)
}
// Parse a word's role parts: the device KIND (the FIRST recognised device-kind token — that is
// THE noun the role attaches to) + the canonical ROLE qualifier (the first KNOWN role-synonym
// token). Returns undefined for either when absent. A SECOND device-kind token (e.g. "screen"
// in "Drum Filter Screen", where "filter" is the kind) is NOT the kind — it stays a
// distinguishing residual token, so it can't be stripped away into a false synonym.
function roleParts(w: WordLike): { kind?: string; role?: string } {
  const toks = wordRoleTokens(w)
  const kind = ROLE_DEVICE_KINDS.find((k) => toks.includes(k))
  let role: string | undefined
  for (const t of toks) {
    if (t === kind) continue
    const c = canonicalRoleToken(t)
    if (ROLE_SYNONYMS.some((r) => r.canonical === c)) { role = c; break }
  }
  return { kind, role }
}
function roleSignature(w: WordLike): string | undefined {
  const { kind, role } = roleParts(w)
  if (!kind || !role) return undefined
  return `${role}|${kind}`
}
// The DISTINGUISHING residual: a word's significant tokens MINUS the ONE selected device-kind
// token and MINUS every role-synonym token (the qualifiers a synonym is allowed to differ on).
// Two words are the SAME physical item ONLY when they differ purely in the role-synonym word —
// i.e. their residuals are EQUAL. This stops the OVER-MERGE of a "Drum Filter" (1670 m³/h ×8 —
// the screen filters) with its "Drum Filter Backwash" (the low-flow backwash sub-system) and
// "Drum Filter Screen" (the screen media): they share the `microscreen|filter` signature but the
// distinguishing tokens "backwash" / "screen" survive in the residual (only the selected kind
// "filter" is stripped, not the second-noun "screen"), so their residuals differ and they stay
// separate. A genuine synonym pair (circulation pump ↔ recirc pump) has an EMPTY residual on both.
function roleResidual(w: WordLike): string {
  // DEDUPE first — the name_human + content_character.name_human pair usually repeats every
  // token, so a single "Circulation Pump" contributes [circulation, pump] (not the doubled set
  // that would leave a stray second "pump" in the residual). Then drop the selected device-kind
  // token + every role-synonym token; what remains DISTINGUISHES the item.
  const { kind } = roleParts(w)
  const uniq = [...new Set(wordRoleTokens(w))]
  const isRoleSyn = (t: string) => ROLE_SYNONYMS.some((r) => r.tokens.some((s) => normTok(s) === t))
  const residual = uniq
    .filter((t) => t !== kind && !isRoleSyn(t))
    .filter((t) => t.length >= 3 && !STOP_STEMS.has(t.slice(0, 5)))
    .map((t) => t.slice(0, 5))
  return [...new Set(residual)].sort().join('|')
}
// Compatible rating: the principal duty matches within tolerance, comparing BOTH kW and the
// volumetric throughput (so a 1670 m³/h filter never reads "compatible" with a 12 m³/h backwash
// just because neither carries kW). Same kW within 12 % AND same throughput within 12 %; a duty
// one side simply omits is compatible on THAT axis only (an emitter word may carry just one
// rating), PROVIDED the role+kind already matched and the residual is equal.
function ratingCompatible(a: WordLike, b: WordLike): boolean {
  const pa = readParentPhysics(a)
  const pb = readParentPhysics(b)
  const within = (x: number, y: number) => { if (x <= 0 || y <= 0) return true; return Math.abs(x - y) / Math.max(x, y) <= 0.12 }
  return within(pa.kw, pb.kw) && within(pa.m3h, pb.m3h)
}
// Compatible count: identical quantity (×8 vs ×8) — or one is ×1/absent (a single-line emitter
// stand-in collapsing into the counted synthesised set). Differing real counts (×8 vs ×3) are
// two DIFFERENT pump banks and must NOT merge.
function countCompatible(a: WordLike, b: WordLike): boolean {
  const qa = parentQty(a)
  const qb = parentQty(b)
  if (qa === qb) return true
  return qa === 1 || qb === 1
}
// Better-identified survivor: a real catalogue MPN beats a placeholder; a priced line beats an
// unpriced one; a grounded (non-_synthesized) emitter word beats a synthesised one; richer
// modifier set breaks the final tie. Higher score wins.
function identityScore(w: WordLike): number {
  const mods = w.modifier_characters ?? []
  const hasRealPn = !isPlaceholder(w)
  const hasPrice = mods.some((m) => m.kind === 'price_estimate_gbp' && (parseFloat(String(m.value)) || 0) > 0)
  const grounded = !isSynth(w)
  return (hasRealPn ? 1000 : 0) + (hasPrice ? 100 : 0) + (grounded ? 10 : 0) + mods.length
}

/** Collapse same-role + same-rating + same-count PRINCIPAL synonyms to ONE word (keeping the
 *  better-identified survivor + its children, dropping the rest + their orphaned sub-components).
 *  Considers BOTH grounded emitter words and `_synthesized` principals (the duplicate spans the
 *  two), but NEVER touches instruments / actuators / utilities / process / building / sub-
 *  components. Mutates `modules` in place; returns the number of duplicate principals removed.
 *
 *  CANON RE-IDENTIFY: when a cluster's role matches a contract canon (e.g. the `recirc|pump`
 *  signature ↔ the `recirc_pump` contract group), the survivor is RE-IDENTIFIED onto that
 *  canon's id/name (keeping its richer modifiers — including a real catalogue MPN — but taking
 *  the canonical identity + contract count/size). This is essential: it lets the downstream
 *  principal reconcile CLAIM the survivor (exact-id match) instead of finding the canon
 *  unowned and re-synthesising a fresh twin — which would re-introduce the duplicate. A
 *  cluster whose role matches NO canon (an LLM pair the contract never sized) just keeps the
 *  better-identified survivor verbatim. Universal + deterministic — role-synonym map, no class. */
function collapseRoleSynonyms(modules: ModuleLike[], canons: CanonEquip[] = []): { removed: number; removedOrphanChildren: number; details: string[] } {
  const out = { removed: 0, removedOrphanChildren: 0, details: [] as string[] }
  // Map each contract canon to its (signature + residual) so a synonym cluster adopts the canon
  // ONLY when it is the SAME item (same residual) — a backwash sub-item that shares the signature
  // but has a different residual never adopts the principal canon.
  const canonByKey = new Map<string, CanonEquip>()
  for (const c of canons) {
    const cw = { name_human: c.name, content_character: { name_human: c.name } }
    const sig = roleSignature(cw)
    if (sig && !canonByKey.has(`${sig}::${roleResidual(cw)}`)) canonByKey.set(`${sig}::${roleResidual(cw)}`, c)
  }
  type Owned = { word: WordLike; sm: { words?: WordLike[] } }
  const bySig = new Map<string, Owned[]>()
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        if (isSubcomponent(w)) continue
        if (isInstrument(w) || isActuator(w) || isUtility(w) || isProcessSystem(w) || isBuildingStructure(w)) continue
        const sig = roleSignature(w)
        if (!sig) continue
        if (!bySig.has(sig)) bySig.set(sig, [])
        bySig.get(sig)!.push({ word: w, sm })
      }
    }
  }
  for (const owned of bySig.values()) {
    // LONE ROLE-SYNONYM → ADOPT THE CANON (THE SOURCE FIX, #136 council 2026-06-17). A single
    // principal carrying a role-synonym name (a grounded "Circulation Pump", stem `circul`) whose
    // role SIGNATURE+residual matches a contract canon (the `recirc_pump` group, stem `recir`) must
    // be RE-IDENTIFIED onto that canon NOW — before the canon-claim phase below runs. Without this,
    // the canon-claim (which only inspects `_synthesized` words AND matches by exact-id / stem-
    // subset) cannot see that the grounded `circulation` word already IS the `recirc` pump: the
    // stems differ, so it finds the canon UNOWNED and re-synthesises a fresh `recirc_pump_synth`
    // TWIN — the SAME pump a second time (×8, 94 kW, £526k). The pair-collapse loop below can't
    // catch that twin because it is born AFTER this whole pass. Folding the lone grounded synonym
    // onto its canon up-front means the canon-claim then EXACT-matches it (no re-synth, no twin).
    // Strictly scoped: fires ONLY when there is exactly ONE such word (no pair to collapse) AND it
    // is NOT already the canon id AND its signature+residual hits a contract canon — so a make-up /
    // feed / backwash pump (distinct role qualifier → distinct signature → no canon match) and a
    // genuinely-paired set (handled by the cluster loop) are untouched. Universal — role-synonym
    // map keyed on role+kind, no class branch.
    if (owned.length === 1) {
      const only = owned[0]
      const sigKey = `${roleSignature(only.word)}::${roleResidual(only.word)}`
      const canon = canonByKey.get(sigKey)
      if (canon && String(only.word.id ?? '') !== canon.id) {
        const oldId = only.word.id
        if (forceCanonIdentity(only.word, canon)) {
          rekeyChildren(only.sm.words ?? [], oldId, canon.id)
          out.details.push(`adopted lone synonym '${only.word.name_human ?? oldId}' → canon ${canon.id} (role ${sigKey}; pre-empts a re-synthesised twin)`)
        }
      }
      continue
    }
    // Within a role+kind signature, group into clusters that are the SAME physical item: an
    // EQUAL distinguishing residual (differ only in the role-synonym word) AND a compatible
    // rating AND a compatible count. Two words that share the role but carry a different
    // residual (Drum Filter vs Drum Filter Backwash), a different duty, or a different real
    // count are distinct machines and seed their OWN cluster — kept, never merged.
    const clusters: Owned[][] = []
    for (const o of owned) {
      const c = clusters.find((cl) =>
        roleResidual(cl[0].word) === roleResidual(o.word) &&
        ratingCompatible(cl[0].word, o.word) &&
        countCompatible(cl[0].word, o.word))
      if (c) c.push(o)
      else clusters.push([o])
    }
    for (const cl of clusters) {
      if (cl.length < 2) continue
      cl.sort((a, b) => identityScore(b.word) - identityScore(a.word))
      const keep = cl[0]
      const sigKey = `${roleSignature(keep.word)}::${roleResidual(keep.word)}`
      // If the survivor lacks a real count but a dropped twin carried the contract count, lift
      // that count onto the survivor so the merged line keeps the ×N the contract computed.
      const keepQty = parentQty(keep.word)
      const maxDupQty = Math.max(...cl.slice(1).map((o) => parentQty(o.word)))
      if (keepQty <= 1 && maxDupQty > 1) {
        mergeMods(keep.word, [mod('quantity', `×${maxDupQty}`)])
      }
      for (const dup of cl.slice(1)) {
        const dupId = dup.word.id
        const words = dup.sm.words ?? []
        dup.sm.words = words.filter((w) => {
          if (w === dup.word) return false
          if (isSubcomponent(w) && dupId && (w.id ?? '').startsWith(`${dupId}__`)) { out.removedOrphanChildren += 1; return false }
          return true
        })
        out.removed += 1
        out.details.push(`collapsed synonym '${dup.word.name_human ?? dupId}' → '${keep.word.name_human ?? keep.word.id}' (role ${sigKey}, same residual+rating+count)`)
      }
      // Re-identify the survivor onto the matching contract canon (SAME signature AND residual)
      // so the principal reconcile claims it (no re-synthesis). forceCanonIdentity keeps the
      // survivor's non-spec mods (incl. its real MPN/manufacturer) and stamps the contract
      // count/dimension/rating. No matching canon → keep the survivor's own identity verbatim.
      const canon = canonByKey.get(sigKey)
      if (canon) {
        const oldId = keep.word.id
        if (forceCanonIdentity(keep.word, canon)) {
          rekeyChildren(keep.sm.words ?? [], oldId, canon.id)
        }
      }
    }
  }
  return out
}

// MOTORLESS-DUPLICATE DROP (Tristan 2026-06-29). A PASSIVE / MOTORLESS machine word — a
// "Water-Powered Dosing Pump" (a Dosatron injector: no motor, ~8 m³/h) — cannot be the
// design's POWERED principal, yet it survives EVERY other dedup: it is not `_synthesized`
// (the principal reconcile skips it), it carries an MPN (the section-C cleanup protects it
// as a "real grounded part"), its name differs (the exact-name dedup misses it), and its
// distinguishing residual differs from the canon's (collapseRoleSynonyms correctly refuses
// to merge it). The result was TWO fertigation pumps — the correct synthesised "Fertigation
// Dosing Pump ×2, 7.5 kW" AND the LLM-invented motorless Dosatron the physics critic flags.
// RULE: when the contract sizes a POWERED canon (a `*_power_kw` group → power>0) of a powered
// device KIND (pump/blower/fan/compressor/mixer) and a NON-synth word of that SAME kind names
// a MOTORLESS drive AND shares ≥1 of that canon's distinguishing stems, the word is an
// LLM mis-conception duplicate of that powered principal → drop it; the synthesised powered
// principal stands. NARROW + SAFE: the MOTORLESS vocabulary is water-powered/-driven/-operated
// only (the injector category), so a real ELECTRIC dosing pump (the brief's Iwaki units) is
// NEVER matched; the powered-canon + shared-stem requirement ties the drop to a specific
// principal so an unrelated motorless device is left alone. UNIVERSAL — no class table.
const MOTORLESS_RE = /\bwater[-\s]?(?:powered|driven|operated|motor)\b|\bhydraulically[-\s]powered\b/i
const POWERED_DEVICE_KINDS = new Set(['pump', 'blower', 'fan', 'compressor', 'mixer'])
function dropMotorlessPoweredDuplicates(
  modules: ModuleLike[], canons: CanonEquip[],
): { removed: number; details: string[] } {
  const out = { removed: 0, details: [] as string[] }
  const poweredCanons = canons.filter((c) => (c.group.power ?? 0) > 0)
  if (poweredCanons.length === 0) return out
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      sm.words = sm.words.filter((w) => {
        if (isSynth(w) || isSubcomponent(w)) return true
        if (!MOTORLESS_RE.test(String(w.name_human ?? ''))) return true
        const { kind } = roleParts(w)
        if (!kind || !POWERED_DEVICE_KINDS.has(kind)) return true
        const wStems = new Set(wordStems(w))
        const hit = poweredCanons.find(
          (c) => c.group.stems.includes(kind)
            && c.group.stems.some((s) => s !== kind && wStems.has(s)),
        )
        if (!hit) return true
        out.removed += 1
        out.details.push(
          `dropped motorless duplicate '${w.name_human}' — a powered ${kind} principal `
          + `(${hit.group.phrase}, ${hit.group.power} kW) is the contract's equipment`,
        )
        return false
      })
    }
  }
  return out
}

// Deterministic modifier set for a canonical equipment word, identical to synthWord's
// (count + dimension + rating), but used to OVERWRITE a survivor's locked spec mods so
// the count/size the contract computed always wins over an LLM edit.
function canonMods(g: EquipGroup): ModifierCharacter[] {
  const out: ModifierCharacter[] = []
  if (g.count !== undefined && g.count >= 2) out.push(mod('quantity', `×${Math.round(g.count)}`))
  else out.push(mod('quantity', '×1'))
  out.push(...dimAndRatingFor(g))
  return out
}

function isSynth(w: WordLike): boolean {
  return (w as { _synthesized?: boolean })._synthesized === true
}
function isSubcomponent(w: WordLike): boolean {
  return (w as { _subcomponent?: boolean })._subcomponent === true
}

/** Overwrite a word's identity + deterministic spec mods with the canonical truth,
 *  preserving any NON-spec modifiers (form/part_number/lifecycle/installation prose)
 *  and preserving the order of the spec kinds it already had. Returns true if anything
 *  changed. */
function forceCanonIdentity(w: WordLike, canon: CanonEquip): boolean {
  let changed = false
  const oldId = w.id
  if (w.id !== canon.id) { w.id = canon.id; changed = true }
  if ((w.name_human ?? '') !== canon.name) { w.name_human = canon.name; changed = true }
  if (!w.content_character || typeof w.content_character !== 'object') w.content_character = {}
  if (w.content_character.character_id !== canon.charId) { w.content_character.character_id = canon.charId; changed = true }
  if (w.content_character.name_human !== canon.name) { w.content_character.name_human = canon.name; changed = true }

  // Replace the deterministic spec kinds (quantity / dimension / capacity / rating_primary)
  // with the contract truth at their existing positions; keep everything else verbatim.
  const SPEC = new Set(['quantity', 'dimension', 'capacity', 'rating_primary', 'rating_secondary'])
  const truth = canonMods(canon.group)
  const existing = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
  const rebuilt: ModifierCharacter[] = []
  const placed = new Set<string>()
  for (const mc of existing) {
    const k = String(mc.kind ?? '')
    if (SPEC.has(k)) {
      if (!placed.has(k)) {
        for (const t of truth) if (String(t.kind) === k) rebuilt.push({ ...t })
        placed.add(k)
      }
      // drop duplicate / LLM-added same-kind entries
    } else {
      rebuilt.push(mc)
    }
  }
  for (const t of truth) {
    const k = String(t.kind)
    if (!placed.has(k)) { rebuilt.push({ ...t }); placed.add(k) }
  }
  // Detect a real change in the spec mods (cheap signature compare).
  const sig = (ms: ModifierCharacter[]) => ms.filter((m) => SPEC.has(String(m.kind)))
    .map((m) => `${m.kind}=${String(m.value ?? '')}${m.unit ?? ''}`).sort().join('|')
  if (sig(existing) !== sig(rebuilt)) changed = true
  w.modifier_characters = rebuilt
  ;(w as { _synthesized?: boolean })._synthesized = true
  return changed || oldId !== canon.id
}

/** Re-key a survivor's exploded sub-components onto the canonical parent id (their ids
 *  are `<parentId>__<suffix>`). Keeps Blender/BoM parent↔child grouping coherent after
 *  an identity repair. */
function rekeyChildren(words: WordLike[], oldParentId: string | undefined, canonId: string): void {
  if (!oldParentId || oldParentId === canonId) return
  const prefix = `${oldParentId}__`
  for (const w of words) {
    if (!isSubcomponent(w)) continue
    const id = w.id ?? ''
    if (id.startsWith(prefix)) {
      const suffix = id.slice(prefix.length)
      w.id = `${canonId}__${suffix}`
      if (w.content_character && typeof w.content_character === 'object') {
        w.content_character.character_id = `${canonId}__${suffix}`
      }
    }
  }
}

export interface PrincipalReconcileResult {
  groups: number
  repaired: number // survivors whose identity/spec was corrected to contract truth
  removedDuplicates: number // extra synth copies of a contract group (LLM collisions/renames) dropped
  removedSynonymDuplicates: number // same-role+rating+count synonyms collapsed to one (circulation≡recirc pump)
  removedInvented: number // _synthesized principals backed by NO contract group (LLM inventions) dropped
  removedOrphanChildren: number // sub-components of removed duplicates/inventions dropped
  synthesizedMissing: number // principal groups with NO surviving synth word, re-created
  buildingResynthesised: number // building take-off lines re-derived against the FINAL equipment set
  rehostedDependents: number // instruments/actuators whose dropped "computed_*" host was re-pointed to the real host
  removedDuplicateDependents: number // those that then collided with an identical sibling on the real host → dropped
  details: string[]
}

/**
 * Make the principal-equipment SET deterministic from the contract, AFTER the LLM
 * stages. For each synthesisable contract group, guarantee exactly one canonical
 * `_synthesized` equipment word with the contract identity + count + size, repair a
 * corrupted survivor in place, drop LLM duplicate/collided copies, and re-create a
 * principal item the LLM deleted entirely. Mutates `modules` in place. Idempotent.
 *
 * Scope: touches ONLY `_synthesized` words (registered hand-emitters never set the
 * flag → byte-untouched). Universal: keyed entirely on the contract's self-describing
 * quantities, no class branch.
 */
// ── POPULATION-COUNT RE-ASSERT (LLM valve/instrument smear) ───────────────────────────────
// The LLM Phase-2 commonly stamps a single large contract POPULATION count (e.g.
// `actuated_distribution_valve_count = 200`) onto EVERY word that merely shares its HEAD NOUN —
// ~15 valve words each ×200 = 3,000 valves for a 200-valve network (the physics-critic "massive
// duplication of valve counts" HIGH + a grossly over-counted bill). This pass re-asserts the
// DETERMINISTIC per-word count (contractCountFor, qualifier-strict) over exactly that smear.
//
// PRECISELY TARGETED (false-positive-safe): a word's count is reset ONLY when ALL hold —
//   (a) the word currently carries a value ≥ POP_MIN that EQUALS some contract `*_count` value, AND
//   (b) that count key's HEAD NOUN is one of the word's tokens (so the word plausibly grabbed THIS
//       count by head-noun match — the smear signature), AND
//   (c) the qualifier-strict contractCountFor gives a DIFFERENT value.
// → "Solenoid Valves ×200" (head noun valve, fails actuated/distribution qualifiers) drops to 1;
//   "Pneumatic Actuated Valve ×200" (matches the qualifiers) is UNCHANGED; a "Drip Emitter ×200"
//   whose count key's head noun isn't "emitter" is never touched; a small per-equipment count
//   (<POP_MIN) is never touched. UNIVERSAL — token-overlap keyed, no class table. Mutates in place.
const POP_MIN = 12
function singulariseTok(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '')
}
export function reassertPopulationCounts(modules: ModuleLike[], contract: ContractInProgress): number {
  const quantities: Record<string, number> = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' && Number.isFinite(val)) quantities[k] = val
  }
  // population counts: value → set of HEAD NOUNS of the `*_count` keys carrying that value
  const popHeadsByValue = new Map<number, Set<string>>()
  for (const [k, v] of Object.entries(quantities)) {
    const m = k.match(/^(.+?)_(count|qty|quantity|number)$/i)
    if (!m || v < POP_MIN) continue
    const head = singulariseTok(m[1].split('_').pop() ?? '')
    if (!head) continue
    const val = Math.round(v)
    if (!popHeadsByValue.has(val)) popHeadsByValue.set(val, new Set())
    popHeadsByValue.get(val)!.add(head)
  }
  // QUALIFIER-GRAB SMEAR: a contract count (e.g. actuated_distribution_VALVE_count = 200) is grabbed by a
  // word that shares one of the count key's QUALIFIER tokens but NOT its HEAD noun — so the word does not
  // OWN that count (a "Power Distribution Block" / "Flow Distribution Plates" inherits 200 via the shared
  // "distribution" qualifier; it is electrical/internal infrastructure, not 200 units). The head-only
  // matcher (b) below misses these because the head differs. Detect them by: value IS a contract count,
  // the word shares a NON-HEAD token with a same-valued key, and the word does NOT carry that key's head.
  // Reset to the word's own qualifier-strict contractCountFor. A word that owns the count (shares the head
  // noun — the real "Pneumatic Actuated Valve") is untouched, as is one that shares NOTHING with the key
  // (e.g. "Pneumatic Actuators", whose count stays coherent with the valves). UNIVERSAL — token-keyed.
  const popKeysByValue = new Map<number, Array<{ head: string; toks: Set<string> }>>()
  for (const [k, v] of Object.entries(quantities)) {
    const m = k.match(/^(.+?)_(count|qty|quantity|number)$/i)
    if (!m || v < POP_MIN) continue
    const parts = m[1].split('_').filter(Boolean).map(singulariseTok)
    const head = parts[parts.length - 1] ?? ''
    if (!head) continue
    const val = Math.round(v)
    if (!popKeysByValue.has(val)) popKeysByValue.set(val, [])
    popKeysByValue.get(val)!.push({ head, toks: new Set(parts) })
  }
  if (popHeadsByValue.size === 0) return 0
  let fixed = 0
  for (const mdl of modules ?? []) {
    for (const sm of mdl.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const qmod = (w.modifier_characters ?? []).find((mc) => mc.kind === 'quantity')
        if (!qmod) continue
        const cur = Math.round(parseFloat(String(qmod.value).replace(/[^0-9.]/g, '')) || 0)
        if (cur < POP_MIN) continue
        const name = w.name_human ?? w.content_character?.name_human ?? ''
        const toks = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singulariseTok))
        // (b) HEAD-noun smear: the word shares a HEAD NOUN with a same-valued contract count …
        const heads = popHeadsByValue.get(cur)
        const headSmear = !!heads && [...heads].some((h) => toks.has(h))
        // … OR QUALIFIER-GRAB: shares a NON-HEAD token with a same-valued count key it does NOT head-own.
        const qualGrab = (popKeysByValue.get(cur) ?? []).some(
          (key) => !toks.has(key.head) && [...key.toks].some((t) => t !== key.head && toks.has(t)),
        )
        if (!headSmear && !qualGrab) continue
        // (c) the qualifier-strict deterministic count must DISAGREE with the stamped population
        const cc = contractCountFor(name, contract)
        if (cc !== cur && cc >= 1) {
          qmod.value = `×${cc}`
          fixed += 1
        }
      }
    }
  }
  return fixed
}

// ── ATTRIBUTE-PHANTOM DROP + EXACT-ID DEDUP (post-Phase-2 cleanup) ─────────────────────────
// Two defects, both fixed here (runs BEFORE routing + BoM, so no manifest pruning is needed):
//  (1) A standalone word whose name ENDS in a DIMENSION/PROPERTY noun ("RO Membrane Area", "GAC
//      Vessel Diameter") is a PHANTOM — an attribute of its parent device, never a discrete part.
//      It mints a bogus BoM line + a duplicate tag + an absurd "Skid → its own Area" connection.
//  (2) Two words with the SAME id (an LLM/skeleton duplication) collide on ONE tag (the v19
//      X-108 "RO Membrane Area"×2 BoM "tags must be unique" HIGH).
// UNIVERSAL — a real part ends in a DEVICE noun (the `\s*$` anchor spares "Pressure Vessel" /
// "Control Valve"); sub-components are spared (their parent owns the attribute). Mutates in place.
const ATTRIBUTE_NAME_RE = /\b(area|diameter|radius|circumference|volume|height|length|width|depth|thickness|capacity|throughput|flow ?rate|velocity|head|footprint|pressure|temperature|count|spacing|pitch|ratio|density|mass|weight|power|voltage|current|frequency)\s*$/i
// Parse a word's population count from its quantity modifier ('×200' → 200; '1' → 1; absent → 1).
function _wordPopCount(w: WordLike): number {
  for (const mc of (w as { modifier_characters?: Array<{ kind?: string; value?: unknown }> }).modifier_characters ?? []) {
    if (mc.kind === 'quantity') {
      const n = parseInt(String(mc.value ?? '').replace(/[^0-9]/g, ''), 10)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return 1
}
// Singularise each token (strip a word-final 's') so 'Pneumatic Actuated Valves' === 'Pneumatic
// Actuated Valve' for de-duplication. Lower-cased + whitespace-collapsed.
function _singularisePhrase(s: string): string {
  return (s || '').toLowerCase().replace(/s\b/g, '').replace(/\s+/g, ' ').trim()
}

export function dropAttributePhantomWords(modules: ModuleLike[]): { droppedPhantom: number; droppedDuplicate: number } {
  let droppedPhantom = 0
  let droppedDuplicate = 0
  const seenIds = new Set<string>()
  // POPULATION duplicate guard (Tristan 2026-06-27): a high-count population emitted under both a
  // SINGULAR and a PLURAL name ('Pneumatic Actuated Valve ×200' + 'Pneumatic Actuated Valves ×200') is
  // the SAME 200 valves counted twice — the physics critic's "multiple redundant groups of 200" HIGH.
  // De-dup across the WHOLE design by (singularised-name, count) for population words (count ≥ POP_MIN),
  // keeping the first. Safe: two genuinely-distinct parts won't share an identical name AND count.
  const seenPopKey = new Set<string>()
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      sm.words = sm.words.filter((w) => {
        const isSub = (w as { _subcomponent?: boolean })._subcomponent === true
        const name = w.name_human ?? w.content_character?.name_human ?? ''
        if (!isSub && ATTRIBUTE_NAME_RE.test(name)) { droppedPhantom += 1; return false }
        const id = String((w as { id?: unknown }).id ?? '')
        if (id) {
          if (seenIds.has(id)) { droppedDuplicate += 1; return false }
          seenIds.add(id)
        }
        if (!isSub) {
          const count = _wordPopCount(w)
          if (count >= POP_MIN) {
            const key = `${_singularisePhrase(name)}|${count}`
            if (seenPopKey.has(key)) { droppedDuplicate += 1; return false }
            seenPopKey.add(key)
          }
        }
        return true
      })
    }
  }
  return { droppedPhantom, droppedDuplicate }
}

export function reconcilePrincipalEquipment(
  modules: ModuleLike[],
  contract: ContractInProgress,
): PrincipalReconcileResult {
  const res: PrincipalReconcileResult = {
    groups: 0, repaired: 0, removedDuplicates: 0, removedSynonymDuplicates: 0, removedInvented: 0, removedOrphanChildren: 0, synthesizedMissing: 0, buildingResynthesised: 0, rehostedDependents: 0, removedDuplicateDependents: 0, details: [],
  }

  const quantities: Record<string, number> = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' && Number.isFinite(val)) quantities[k] = val
  }
  // A `total_*`/overall/combined volume is a reporting SUM, not a vessel — exclude it from the
  // principal-equipment set when its constituent vessels are present (≥2 other non-aggregate
  // volume groups). SAME rule as the generic-emitter synthesis path; applying it HERE is what
  // removes the phantom "Total Water Storage" 262 m³ mega-tank (the physics-critic HIGH): this
  // reconcile re-mints principals from the contract LATER in the chain, and because the aggregate
  // is dropped from `canons`, the reconcile's invented-removal also deletes any pre-existing copy.
  const allSynth = buildGroups(quantities).filter(isSynthesisable)
  const principalGroups = allSynth.filter((g) => {
    if (isPureAggregatePhrase(g.phrase) && g.volume !== undefined) {
      const constituents = allSynth.filter(
        (o) => o !== g && o.volume !== undefined && o.volume >= 1 && !isPureAggregatePhrase(o.phrase),
      )
      if (constituents.length >= 2) return false
    }
    return true
  })
  res.groups = principalGroups.length
  if (principalGroups.length === 0) return res

  // Map each synthesisable group to its canonical identity.
  const canons = principalGroups.map(canonFor)
  const freshlySynthesised: WordLike[] = [] // re-created principals → explode their sub-assemblies

  // SYNONYM COLLAPSE (FIRST — #136 "ONE part identity"): collapse same-role + same-rating +
  // same-count principal SYNONYMS to one BEFORE the canon-claim, so the SAME physical machine
  // emitted under two synonym names (a grounded "Circulation Pump" + the synthesised "Recirc
  // Pump", both 94 kW × 8 — the recirculation pump twice, doubling its £526k) is a single line.
  // It re-identifies the better-identified survivor onto the matching contract canon (here
  // `recirc_pump`) so the canon-claim below treats it as the verbatim survivor rather than
  // finding the canon unowned and re-synthesising a fresh twin. A no-op when no two principals
  // share a role+rating+count (BESS / SAF). The exact-id/stem reconcile that follows handles
  // the `computed_*`-twin + LLM-rename duplicates as before.
  {
    const syn = collapseRoleSynonyms(modules, canons)
    res.removedSynonymDuplicates += syn.removed
    res.removedOrphanChildren += syn.removedOrphanChildren
    res.details.push(...syn.details)
  }

  // Drop a MOTORLESS word duplicating a POWERED contract principal (the fertigation
  // "Water-Powered Dosing Pump"/Dosatron beside the synthesised 7.5 kW pump). Runs AFTER
  // the synonym collapse (so a survivor is already chosen) and BEFORE the canon-claim (so
  // the motorless impostor never claims the canon). Counts as a removed duplicate.
  {
    const ml = dropMotorlessPoweredDuplicates(modules, canons)
    res.removedDuplicates += ml.removed
    res.details.push(...ml.details)
  }

  // Assign every surviving top-level _synthesized word to its owning canon. The
  // principal-equipment SET is the contract's — exactly one word per synthesisable
  // group — so the LLM may DECORATE the prose but may NOT add, rename, or duplicate a
  // principal. A synth word claims a canon when it (a) EXACT-matches the canon id/char
  // (a verbatim survivor, or an LLM rename that COLLIDED onto a sibling's id), OR (b)
  // its name fully COVERS the canon's group stems (canon stems ⊆ word stems) — which
  // catches an LLM that re-titled the synth equipment ("Calculated Heat Pump",
  // "Working Biofilter") while keeping its synthesised identity. Each canon keeps ONE
  // survivor (repaired to contract truth); the rest are LLM duplicates → dropped. A
  // synth word that claims NO canon is an LLM-INVENTED principal not backed by any
  // contract quantity → also dropped (it must not enter the deterministic set). Sub-
  // components (`_subcomponent`) are NOT principals and are left to follow their parent.
  type Owned = { word: WordLike; sm: { words?: WordLike[] } }
  const byCanon = new Map<string, Owned[]>() // canon.id → survivors claiming it
  for (const c of canons) byCanon.set(c.id, [])
  const unclaimed: Owned[] = [] // _synthesized principals backed by no contract group

  // Compare an id/charId after collapsing the "computed" twin token (module-scope
  // stripComputedId), so a stray `computed_uv_reactor_synth_word` already in the tree (a
  // prior-state re-run, or an LLM copy) folds onto the real `uv_reactor` canon and is merged —
  // never treated as a separate invented principal.
  const canonClaimedBy = (w: WordLike): CanonEquip | undefined => {
    const wid = stripComputedId(String(w.id ?? ''))
    const wcid = stripComputedId(String(w.content_character?.character_id ?? ''))
    const exact = canons.find((c) => wid === c.id || (wcid !== '' && wcid === c.charId))
    if (exact) return exact
    const wStems = wordStems(w)
    if (wStems.length === 0) return undefined
    // Full-subset: the canon's group stems must ALL be present in the word — so the word
    // genuinely names that equipment. Prefer the canon with the most stems (the most
    // specific) to avoid a 1-stem group stealing a more-specific word.
    let best: CanonEquip | undefined
    let bestStems = 0
    for (const c of canons) {
      const gs = c.group.stems
      if (gs.length > 0 && gs.every((s) => wStems.includes(s)) && gs.length > bestStems) {
        best = c
        bestStems = gs.length
      }
    }
    return best
  }

  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        if (!isSynth(w) || isSubcomponent(w)) continue
        // PRINCIPAL-ONLY: instruments / actuators / utility-safety / process-support
        // words are ALSO deterministically synthesised from the contract (they carry
        // `_synthesized` so geometry/cost treat them as engine-derived), but they are
        // NOT principal equipment — they have their own contract-driven passes
        // (synthesizeInstrumentation / Actuation / UtilitySafety / ProcessSystems) and
        // their own id namespaces (instr_ / actr_ / util_ / proc_ / bldg_). The principal-set
        // reconcile must NOT see them: a "Level Transmitter" full-stem-subset-matches a
        // tank canon → dropped as a duplicate; a "Standby Diesel Generator" / "SCADA" /
        // "Feed Storage" / "Steel Portal Frame" matches no principal group → dropped as an
        // LLM-invented principal. Both are FALSE drops — these systems are exactly as
        // contract-derived as the tanks, and dropping them is why a RAS rendered "not
        // buildable" (the genset, LOX, feed, sludge, instrumentation, and the BUILDING ITSELF
        // never reached the costed BoM). Leave them in place; the reconcile only governs the
        // principal-equipment SET. (The building take-off carries `_structure`.)
        // The main-incomer breaker is contract-SIZED (sizeMainIncomer) but is NOT a synthesisable
        // principal GROUP — it claims no canon, so the principal-set logic would drop it as
        // "invented". Skip it exactly like the instrument / utility families it sits beside.
        if (isInstrument(w) || isActuator(w) || isUtility(w) || isProcessSystem(w) || isBuildingStructure(w) || isMainIncomerWord(w)) continue
        const pick = canonClaimedBy(w)
        if (pick) byCanon.get(pick.id)!.push({ word: w, sm })
        else unclaimed.push({ word: w, sm })
      }
    }
  }

  // Reconcile each group: ONE survivor → repair to canonical; the rest → remove.
  for (const c of canons) {
    const owned = byCanon.get(c.id)!
    if (owned.length === 0) {
      // The LLM deleted/renamed this principal item's top word but may have LEFT its
      // exploded children behind (keyed `<canonId>__…`) — sweep those orphans first so
      // re-synthesising doesn't duplicate them. Then re-create the principal + explode.
      const childPrefix = `${c.id}__`
      for (const m of modules ?? []) {
        for (const sm of m.sub_modules ?? []) {
          if (!Array.isArray(sm.words)) continue
          sm.words = sm.words.filter((w) => {
            if (isSubcomponent(w) && (w.id ?? '').startsWith(childPrefix)) { res.removedOrphanChildren += 1; return false }
            return true
          })
        }
      }
      const target = pickModule(modules, c.group.phrase)
      const sm = target?.sub_modules?.[0]
      if (sm) {
        const wNew = synthWord(c.group)
        ;(sm.words ??= []).push(wNew)
        freshlySynthesised.push(wNew)
        res.synthesizedMissing += 1
        res.details.push(`re-synthesised missing principal '${c.name}' (${c.id})`)
      }
      continue
    }
    // Survivor preference: keep the REAL (non-"computed") word, ideally one already carrying
    // the canonical id, then anything not prefixed `computed_*`, then the first. When a real
    // emitter word and its `computed_*` twin both claim the canon, the real word survives (its
    // identity/spec is the grounded one) and the twin is dropped below — never the reverse.
    const rank = (w: WordLike): number => {
      const id = String(w.id ?? '')
      if (id === c.id) return 0
      if (!/(^|_)computed_/i.test(id)) return 1
      return 2
    }
    owned.sort((a, b) => rank(a.word) - rank(b.word))
    const survivor = owned[0]
    const oldId = survivor.word.id
    if (forceCanonIdentity(survivor.word, c)) {
      res.repaired += 1
      res.details.push(`repaired '${c.name}' identity → ${c.id} (was ${oldId ?? '∅'})`)
    }
    rekeyChildren(survivor.sm.words ?? [], oldId, c.id)
    // Drop the rest (LLM duplicates/collisions) + their exploded children.
    for (let i = 1; i < owned.length; i++) {
      const dup = owned[i]
      const dupId = dup.word.id
      const words = dup.sm.words ?? []
      const before = words.length
      dup.sm.words = words.filter((w) => {
        if (w === dup.word) return false
        if (isSubcomponent(w) && dupId && (w.id ?? '').startsWith(`${dupId}__`)) { res.removedOrphanChildren += 1; return false }
        return true
      })
      res.removedDuplicates += 1
      res.details.push(`dropped duplicate '${dup.word.name_human ?? dupId}' colliding onto ${c.id} (${(dup.sm.words?.length ?? 0) - (before - 1 - 0)} child cleanup)`)
    }
  }

  // Drop LLM-INVENTED principals (a _synthesized top word backed by no contract group)
  // + their exploded children. The principal-equipment set is the contract's; an item
  // the contract never computed must not enter it (run-to-run stability + no-invention).
  for (const inv of unclaimed) {
    const invId = inv.word.id
    const words = inv.sm.words ?? []
    inv.sm.words = words.filter((w) => {
      if (w === inv.word) return false
      if (isSubcomponent(w) && invId && (w.id ?? '').startsWith(`${invId}__`)) { res.removedOrphanChildren += 1; return false }
      return true
    })
    res.removedInvented += 1
    res.details.push(`dropped LLM-invented principal '${inv.word.name_human ?? invId}' (no contract group backs it)`)
  }

  // Explode the sub-assemblies of any PRINCIPAL we just re-created (a repaired survivor
  // already carries its children; a freshly-synthesised one does not). Insert each
  // parent's physics-sized children immediately after it, matching the synthesis path.
  if (freshlySynthesised.length > 0) {
    const fresh = new Set(freshlySynthesised)
    for (const m of modules ?? []) {
      for (const sm of m.sub_modules ?? []) {
        if (!Array.isArray(sm.words)) continue
        const out: WordLike[] = []
        for (const w of sm.words) {
          out.push(w)
          if (!fresh.has(w)) continue
          const nm = w.name_human ?? ''
          const rule = SUB_ASSEMBLY.find((r) => r.re.test(nm))
          if (!rule) continue
          const physics = readParentPhysics(w)
          for (const spec of rule.parts) out.push(subWord(spec, w.id ?? sanitizeId(nm), physics.qty, physics))
        }
        sm.words = out
      }
    }
  }

  // RE-HOST + DE-DUP DEPENDENTS OF A COLLAPSED "computed_*" TWIN. The instrument / actuator
  // passes synthesise their words ONTO a host vessel (`_instrument_of` / `_actuator_of` + an
  // `…_on_<hostId>` id). On already-emitted state where the OLD sizing minted both a real and
  // a `computed_*` twin vessel, those passes instrumented BOTH — so a dropped/renamed twin host
  // leaves dependents pointing at a host that no longer exists (e.g. `instr_level_on_computed_
  // biofilter_synth_word` after the `Computed Biofilter` principal collapsed into `Biofilter`).
  // A FRESH run never hits this (no twin vessel is ever synthesised), but the reconcile must be
  // idempotent on prior state: re-point each such dependent's host to the surviving canonical
  // host, then drop it if an identical-kind sibling already sits on that host (so the cleanup
  // also removes the routed connection the dropped twin carried, via its now-absent node).
  // Universal + deterministic — keyed on the "computed" token + the surviving host-id set.
  {
    const hostIdOf = (w: WordLike): string =>
      String((w as { _instrument_of?: string; _actuator_of?: string })._instrument_of
        ?? (w as { _actuator_of?: string })._actuator_of ?? '')
    // Surviving top-level principal host ids (what a dependent is allowed to hang off).
    const survivingHosts = new Set<string>()
    for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
      const id = String(w.id ?? '')
      if (!id || id.includes('__')) continue
      if (isInstrument(w) || isActuator(w)) continue
      survivingHosts.add(id)
    }
    const seen = new Set<string>() // `${kind-key}|${canonicalHost}` already kept → later collisions dropped
    for (const m of modules ?? []) {
      for (const sm of m.sub_modules ?? []) {
        if (!Array.isArray(sm.words)) continue
        const out: WordLike[] = []
        for (const w of sm.words) {
          if (!isInstrument(w) && !isActuator(w)) { out.push(w); continue }
          const host = hostIdOf(w)
          const hostIsComputed = host !== '' && /(^|_)computed_/i.test(host)
          const strippedHost = stripComputedId(host)
          // ORPHAN DROP: a dependent whose host carried a "computed" token and whose host is now
          // gone with NO surviving real equivalent (neither the computed id nor its stripped
          // form is a live principal) hung off a twin that was itself dropped as invented (e.g.
          // the duty-only "Computed Building Process", never a real principal). Remove it — it
          // measures/actuates a unit that does not exist. A loop-scope host (e.g. `process_loop`,
          // no "computed" token) is never touched.
          if (hostIsComputed && !survivingHosts.has(host) && !survivingHosts.has(strippedHost)) {
            res.removedDuplicateDependents += 1
            continue
          }
          // Re-point ONLY when the host carries a "computed" token, is now absent, and its
          // stripped form is a surviving real host (so we never invent a host).
          const needsRehost = hostIsComputed && !survivingHosts.has(host) && survivingHosts.has(strippedHost)
          if (needsRehost) {
            if ((w as { _instrument_of?: string })._instrument_of !== undefined) (w as { _instrument_of?: string })._instrument_of = strippedHost
            if ((w as { _actuator_of?: string })._actuator_of !== undefined) (w as { _actuator_of?: string })._actuator_of = strippedHost
            const oldId = String(w.id ?? '')
            const newId = oldId.replace(`_on_${host}`, `_on_${strippedHost}`)
            if (newId !== oldId) {
              w.id = newId
              if (w.content_character && typeof w.content_character === 'object') w.content_character.character_id = newId
            }
            res.rehostedDependents += 1
          }
          // De-dup identical-kind dependents on the same (now-canonical) host. The kind key is
          // the dependent's id with the host segment removed (so `instr_level_on_X` keys on
          // `instr_level_on_`), keeping the first and dropping later collisions.
          const finalHost = hostIdOf(w)
          const kindKey = String(w.id ?? '').replace(`_on_${finalHost}`, '_on_') || (w.name_human ?? '')
          const dedupKey = `${kindKey}|${finalHost}`
          if (seen.has(dedupKey)) { res.removedDuplicateDependents += 1; continue }
          seen.add(dedupKey)
          out.push(w)
        }
        sm.words = out
      }
    }
    if (res.rehostedDependents > 0 || res.removedDuplicateDependents > 0) {
      res.details.push(`re-hosted ${res.rehostedDependents} dependent(s) off collapsed computed-twin host(s); dropped ${res.removedDuplicateDependents} duplicate dependent(s)`)
    }
  }

  // RE-DERIVE THE BUILDING against the FINAL principal-equipment set. The building take-off
  // is first emitted at generator time (in applyUniversalContractSizing), but the SET it
  // measured can change here — a duplicate principal dropped, a deleted one re-created — so
  // the emit-time footprint can drift from the equipment that actually survives (verified on
  // RAS: an LLM "Biofilter Working" duplicate at ⌀8.6 × 8.6 m inflated the hall to 2,942 m² /
  // 11.1 m before the reconcile dropped it, leaving the real 6-vessel set at ~2,794 m²). The
  // pass is idempotent (it drops the prior `_structure` words and re-derives), so running it
  // again here makes the building + the written-back footprint reflect the canonical set, and
  // persists the corrected footprint to `contract.quantities`. Universal — no-op for an
  // unhoused product (negligible footprint). Reuses the number-map built at the top.
  res.buildingResynthesised = synthesizeBuildingStructure(modules, quantities, contract)

  // RE-ASSERT THE MAIN-INCOMER BREAKER against the contract connected load (Tristan 2026-06-19).
  // The bare "Main Breaker" skeleton word is NOT a synthesisable contract GROUP (no `_volume`/
  // `_power` driver), so the principal-set re-assert above never touches it — but Phase-2 may
  // have mispinned its rating (the 121 A on a 1.7 MW RAS). This idempotent pass re-stamps the
  // contract-derived frame onto every main-incomer word so the shipped breaker matches the load.
  // Universal — strict no-op for a class with no connected-load quantity. (No new res field —
  // the count is logged at emit time; here it is a stability re-assert.)
  sizeMainIncomer(modules, quantities, contract)

  // RE-STAMP the typed service descriptors against the FINAL tree (Phase 0). This pass
  // runs AFTER the emit-time annotateServiceFamilies (in applyUniversalContractSizing),
  // so a principal that survived a drop / re-host already carries its service; this
  // re-derives any word the reconcile re-created (the re-synthesised building words
  // carry service from buildingWord; a re-created principal gets re-annotated from its
  // driver) and is idempotent via mergeMods. Guarantees the cost characteriser sees a
  // typed service on every characterisable word of the final design. Universal.
  annotateServiceFamilies(modules, quantities)

  // FINAL same-name principal de-dup (Tristan 2026-06-29, the v37 TK-108 duplicate). reconcile is
  // the LAST synthesis pass: it can re-synthesise a `*_synth_word` TWIN of an equipment the LLM
  // decomposition already named (e.g. a second "Nutrient Tank" when the original word was not
  // recognised as owning the contract canon). That twin escapes applyUniversalContractSizing's
  // EARLIER dedupePrincipalWords, and the original — being non-`_synthesized` — also escapes the
  // invented-principal drop above. Both then get tagged → a DUPLICATE TAG (TK-108×2) that collapses
  // the BoM Ledger score. dedupePrincipalWords collapses principals sharing a normalised name_human
  // (keeping the better-specified survivor: more modifiers, real over synth), so running it HERE —
  // after ALL synthesis — guarantees ONE word per named principal regardless of which path minted it.
  // Universal + deterministic; a strict no-op when there are no same-name twins.
  res.removedDuplicates += dedupePrincipalWords(modules)

  return res
}

/**
 * Collapse DUPLICATE principal words BEFORE the sub-assembly explosion. Two duplication
 * modes seen on RAS: (a) the SAME id emitted into >1 module (`circulation_pump_word` in
 * both mass_fluid + environmental) and (b) a synthesised duplicate of a real word with
 * the SAME human name (`heat_pump_synth_word` vs `heat_pump_word`). If a duplicate is
 * left in, the explosion runs on EACH copy and — because the children inherit
 * `<parentId>__<suffix>` — N copies sharing an id collide into N× the same sub-components
 * (a pump showed 39 children = 3×13). This MUST run before explode(). Identity = id
 * first (a shared id is unambiguously one word), then normalised name. Keeps the RICHER
 * modifier set (non-synthesised as the tiebreak) and removes the rest from their
 * sub_modules. Skips sub-components (`__` ids). Universal + deterministic. Returns the
 * count removed.
 */
export function dedupePrincipalWords(modules: ModuleLike[]): number {
  const collapse = (keyOf: (w: WordLike) => string): number => {
    const groups = new Map<string, Array<{ w: WordLike; sm: { words?: WordLike[] } }>>()
    for (const m of modules ?? []) {
      for (const sm of m.sub_modules ?? []) {
        if (!Array.isArray(sm.words)) continue
        for (const w of sm.words) {
          if (String(w.id ?? '').includes('__')) continue
          const k = keyOf(w)
          if (!k) continue
          if (!groups.has(k)) groups.set(k, [])
          groups.get(k)!.push({ w, sm })
        }
      }
    }
    const score = (w: WordLike) =>
      (w.modifier_characters?.length ?? 0) * 2 + ((w as { _synthesized?: boolean })._synthesized ? 0 : 1)
    let removed = 0
    for (const items of groups.values()) {
      if (items.length < 2) continue
      items.sort((a, b) => score(b.w) - score(a.w))
      const keep = items[0].w
      for (const { w, sm } of items.slice(1)) {
        if (w === keep || !Array.isArray(sm.words)) continue
        sm.words = sm.words.filter((x) => x !== w)
        removed += 1
      }
    }
    return removed
  }
  const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  let total = collapse((w) => String(w.id ?? ''))                 // (a) shared id
  total += collapse((w) => norm(w.name_human ?? w.id ?? ''))      // (b) same human name
  return total
}

/**
 * Stamp the contract's self-describing quantities onto BoM words AND synthesise the
 * principal equipment the emitter omitted — universally. Mutates `modules` in place.
 *
 * @param opts.onlyUnsized  (default true) leave a word that already carries a
 *   dimension/dimensions modifier untouched for SIZING (curated/grounded wins); the
 *   QUANTITY count is still applied when the word is ×1 (under-counting is worse).
 * @param opts.synthesizeMissing (default true) create equipment words for principal
 *   groups no existing word matched.
 */
export function applyUniversalContractSizing(
  modules: ModuleLike[],
  contract: ContractInProgress,
  opts: { onlyUnsized?: boolean; synthesizeMissing?: boolean; dedupeAndStrip?: boolean; explode?: boolean; instrument?: boolean; minScore?: number } = {},
): UniversalSizingResult {
  const onlyUnsized = opts.onlyUnsized ?? true
  const synthesizeMissing = opts.synthesizeMissing ?? true
  const dedupeAndStrip = opts.dedupeAndStrip ?? true
  const minScore = opts.minScore ?? 1

  const quantities: Record<string, number> = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' && Number.isFinite(val)) quantities[k] = val
  }

  const groups = buildGroups(quantities)
  const matched = new Set<string>() // group phrase → matched an existing word
  let sized = 0

  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        // A FIELD INSTRUMENT (sensor / transmitter / transducer / analyser / gauge / probe)
        // must NEVER be sized from a power / throughput group: a fuzzy contract-quantity
        // match stamps it a rotating-machine box + a kW rating (boxFromRatingKw floored to
        // 600×510×660 mm + "2 kW" — the physics-critic HIGH "transducer rated 2 kW, off by
        // four orders of magnitude", and the SAME default box that littered the GA). An
        // instrument is a 4-20 mA loop tag, not a machine; leave it un-sized here (it is a
        // P&ID tag downstream). UNIVERSAL — keyed on the instrument noun, any archetype.
        if (isInstrument(w)) continue
        const wStems = wordStems(w)
        if (wStems.length === 0) continue
        let best: EquipGroup | null = null
        let bestScore = 0
        for (const g of groups) {
          const sc = scoreMatch(wStems, g)
          if (sc < minScore) continue
          if (sc > bestScore || (sc === bestScore && best && completeness(g) > completeness(best))) {
            best = g
            bestScore = sc
          }
        }
        if (!best) continue
        matched.add(best.phrase)

        const existing = w.modifier_characters ?? []
        const hasDim = existing.some((mc) => mc.kind === 'dimension' || mc.kind === 'dimensions')
        const isCountOne = !existing.some(
          (mc) => mc.kind === 'quantity' && !/×\s*1\b/.test(String(mc.value ?? '')),
        )
        const add: ModifierCharacter[] = []
        if (!(onlyUnsized && hasDim)) add.push(...dimAndRatingFor(best))
        if (best.count !== undefined && best.count >= 2 && isCountOne) add.push(mod('quantity', `×${Math.round(best.count)}`))
        if (add.length) {
          mergeMods(w, add)
          sized += 1
        }
      }
    }
  }

  // ── B. synthesise principal equipment no word matched ─────────────────────
  const synthesizedPhrases: string[] = []
  if (synthesizeMissing) {
    for (const g of groups) {
      if (matched.has(g.phrase)) continue
      if (!isSynthesisable(g)) continue
      // A `total_*` / overall / combined volume is a REPORTING SUM of the real vessels, not a
      // physical tank. Synthesising it mints a phantom mega-vessel that double-counts the
      // constituents and reads as one contaminating store. Suppress it ONLY when the
      // constituent vessels ARE present as ≥2 other synthesisable, non-aggregate volume groups
      // (so a lone total_* with no breakdown still makes its vessel). UNIVERSAL — keyed on the
      // aggregate marker + constituent presence, no class table. (physics-critic Risk-tab fix.)
      if (isPureAggregatePhrase(g.phrase) && g.volume !== undefined) {
        const constituents = groups.filter(
          (o) => o !== g && o.volume !== undefined && o.volume >= 1
            && !isPureAggregatePhrase(o.phrase) && isSynthesisable(o),
        )
        if (constituents.length >= 2) continue
      }
      const target = pickModule(modules, g.phrase)
      const sm = target?.sub_modules?.[0]
      if (!sm) continue
      ;(sm.words ??= []).push(synthWord(g))
      synthesizedPhrases.push(g.phrase)
    }
  }

  // ── C. cleanup: make the BoM the physics equipment, not skeleton junk ─────
  // Drop (a) generic detailed-design PADDING and (b) placeholder function-words a
  // synthesised equipment item already COVERS (Mechanical Filtration ← Drum Filter;
  // Biological Filtration ← Biofilter). Only placeholders (no real MPN) are dropped;
  // synthesised physics equipment + real grounded parts are always kept.
  let dropped = 0
  if (dedupeAndStrip) {
    const synthStems4 = new Set<string>()
    for (const g of groups) {
      if (!synthesizedPhrases.includes(g.phrase)) continue
      for (const s of g.stems) {
        const s4 = s.slice(0, 4)
        if (!DEDUP_GENERIC_STOP.has(s4)) synthStems4.add(s4)
      }
    }
    for (const m of modules ?? []) {
      for (const sm of m.sub_modules ?? []) {
        if (!Array.isArray(sm.words)) continue
        sm.words = sm.words.filter((w) => {
          if ((w as { _synthesized?: boolean })._synthesized) return true // physics equipment
          if (!isPlaceholder(w)) return true // real grounded part
          if (PADDING_RE.test((w.name_human ?? '').toLowerCase())) { dropped += 1; return false }
          const w4 = wordStems(w).map((s) => s.slice(0, 4)).filter((s) => !DEDUP_GENERIC_STOP.has(s))
          if (w4.some((s) => synthStems4.has(s))) { dropped += 1; return false }
          return true
        })
      }
    }
  }

  // ── C2. collapse duplicate principals BEFORE the explosion (else a duplicate
  // multiplies into N× the same sub-components — see dedupePrincipalWords). ──
  const dedupedPrincipals = dedupeAndStrip ? dedupePrincipalWords(modules) : 0

  // ── C3. PROCESS INSTRUMENTATION: every contract-declared control variable gets its
  // measuring instrument on the vessel that holds it (level / temp / DO per fluid vessel;
  // pH / salinity once on the loop; pressure only on a pressurised vessel). Runs on the
  // CANONICAL vessel set (post-dedupe), before the explosion (instruments are leaves). ──
  const instrumented = (opts.instrument ?? true) ? synthesizeInstrumentation(modules, quantities) : 0

  // ── C4. PROCESS ACTUATION: the final control elements the contract implies — an inlet
  // flow control valve per fluid vessel (closing the level loop) + an aeration/process
  // blower per air-flow duty. Runs after instrumentation, before the explosion (leaves). ──
  const actuated = (opts.instrument ?? true) ? synthesizeActuation(modules, quantities) : 0

  // ── C5. BALANCE-OF-PLANT utility + safety systems (standby generator, make-up water,
  // bleed/drain, ventilation) the contract's duties imply. ──
  const utilities = (opts.instrument ?? true) ? synthesizeUtilitySafety(modules, quantities) : 0

  // ── C6. PROCESS-SUPPORT systems (dosing, feed, LOX, sludge, SCADA, grading) the
  // contract's consumable + waste duties imply. ──
  const processSystems = (opts.instrument ?? true) ? synthesizeProcessSystems(modules, quantities) : 0

  // ── C7. BUILDING-STRUCTURE take-off: the HALL that houses the plant — slab / portal
  // frame / wall + roof cladding / foundations / doors — sized from the principal
  // equipment's plan footprint, with the derived footprint written back to `quantities`
  // (so the GA + the heat-loss tool size against the real footprint). Runs AFTER the
  // principal + process passes (it needs the synthesised equipment in place to measure)
  // and is a no-op for a product with a negligible housed footprint. Passes the contract
  // so the derived footprint persists to `contract.quantities` (GA + heat-loss read it). ──
  const buildingStructure = (opts.instrument ?? true) ? synthesizeBuildingStructure(modules, quantities, contract) : 0

  // ── C8. MAIN-INCOMER BREAKER: size the service incomer from the connected electrical load
  // and stamp its frame onto the skeleton's bare "Main Breaker" word (which Phase-2 otherwise
  // mispins — RAS stamped 121 A on a 1.7 MW plant by grabbing the transformer PRIMARY current).
  // Writes `main_incomer_breaker_a/_frame_a` back to the contract so the single-line + panel +
  // drawing_gates load-reconcile read ONE authoritative incomer. No-op for a class with no
  // connected-load quantity. Runs after the building take-off (the connected load is final). ──
  const mainIncomer = (opts.instrument ?? true) ? sizeMainIncomer(modules, quantities, contract) : 0

  // ── D. sub-assembly explosion: BoM DEPTH (each equipment → its real components) ──
  const exploded = (opts.explode ?? true) ? explodeEquipmentSubAssemblies(modules, quantities) : 0

  // ── E. TYPED SERVICE (Phase 0 root fix): stamp every characterisable word with a
  // `service{fabrication_family,…}` descriptor DERIVED FROM ITS DRIVER QUANTITY (a
  // footprint-area driver → structural; a m³/flow driver → fluid_vessel; a kW driver →
  // rotating_electrical) — so the cost characteriser keys off the typed field, never a
  // downstream noun re-parse (the £42M "Structural Frame" hoop-stress bug). Runs LAST so
  // it sees the principals + the synthesised + the legacy skeleton words all in place. ──
  const serviceFamilies = annotateServiceFamilies(modules, quantities)

  return {
    sized,
    synthesized: synthesizedPhrases.length,
    dropped,
    exploded,
    instrumented,
    actuated,
    utilities,
    processSystems,
    buildingStructure,
    mainIncomer,
    serviceFamilies,
    groups: groups.length,
    matchedPhrases: [...matched],
    synthesizedPhrases,
  }
}

// ── COMPUTED-TWIN QUANTITY RECONCILIATION (keystone defect — Tristan 2026-06-16) ───────────
// The engineering contract carries, for ~12-18 quantities, BOTH a calculator value `<base>`
// (e.g. `daily_feed_kg = 765.7`, source 'calculator') AND a per-component-physics-tool twin
// `computed_<base>` (e.g. `computed_daily_feed_kg = 2745`, a wrong-basis standing-biomass figure
// — `recirc_pump_motor_kw = 132` vs `computed_recirc_pump_motor_kw = 1217`, the head inflated by
// uncapped routing friction). NOTHING reconciles them, so the contradiction LEAKS into the
// dossier: the panel-schedule's principal-motor anchor reads the synthesised `computed_*` BoM
// line (1217 kW) while the summary reads the calculator's connected load (940 kW) — a chartered
// engineer spots the clash instantly and rejects the document. The 6-seat RAS council scored 3.7
// and all six seats independently flagged THIS as the root cause.
//
// THE RESOLUTION (council-established): the CALCULATOR `<base>` is AUTHORITATIVE. The `computed_*`
// twin is a DIAGNOSTIC byproduct of a convergence/sizing tool and is often wrong-basis — it must
// never appear as a competing DISPLAYED value. So:
//   · For every quantity key matching `computed_<base>` where a non-computed `<base>` key ALSO
//     exists in the contract → DELETE the `computed_<base>` entry (the calculator `<base>` stays,
//     untouched, as the single source every consumer reads).
//   · A `computed_<base>` with NO `<base>` twin (e.g. `computed_degasser_air_flow_m3_h`,
//     `computed_degasser_column_volume_m3`) is the SOLE source for that quantity — KEEP it (never
//     orphan a real value). [Its de-prefixed display is handled by buildGroups/stripComputedToken
//     on the synthesis side; this pass leaves the orphan quantity in place.]
//
// Beyond the quantities, EARLIER pipeline passes have, by this point, already SYNTHESISED a
// `computed_<base>` quantity into a loose phantom WORD in moduleDecomposition (e.g. the
// un-parented `computed_recirc_pump_motor_kw_word` "Computed Recirc Pump Motor Power · 1217 kW"
// — a duty-only scalar that the host-keyed reconcilePrincipalEquipment did not catch because it
// has no vessel volume + no host). Left in the tree it mints phantom requirementsBom rows +
// phantom routed connections (water/electrical connection "Computed Recirc … → Rearing Tank").
// So this pass ALSO drops those phantom words + their downstream word_id references
// (partVerifications / costBasis) when the word's `computed_` identity has a surviving `<base>`
// twin quantity. It is the QUANTITIES + their already-rendered phantom-word echoes; it COMPLEMENTS
// (does not undo) the buildGroups stripComputedToken dedup that handles the principal-equipment
// PARTS on a fresh emit.
//
// UNIVERSAL + deterministic — keyed purely on the `computed_<base>` ↔ `<base>` twin relationship,
// no class branch. STRICT NO-OP for any class with no `computed_*`-with-twin pairs (verified:
// BESS / CO₂ / e-fuel state carries zero `computed_*` keys). Idempotent: a second run finds no
// twin to drop. Operates IN PLACE on a loosely-typed chain state object (read from state.json
// AFTER the design loop, BEFORE requirementsBom). British spelling throughout.

export interface ComputedTwinReconcileResult {
  twinQuantitiesDropped: number          // computed_<base> quantity entries removed (had a <base> twin)
  droppedQuantityKeys: string[]          // the keys removed
  survivingComputedKeys: string[]        // computed_<base> kept (NO <base> twin — the sole source)
  phantomWordsDropped: number            // loose computed_* synthesised words removed from moduleDecomposition
  droppedWordIds: string[]               // their word ids (used to prune dependents)
  droppedWordNames: string[]             // their name_human (used to prune the CAD manifests by endpoint)
  dependentRefsPruned: number            // partVerifications / costBasis lines whose word_id referenced a dropped word
  manifestEntriesPruned: number          // CAD-manifest rows/specs/lines/parts referencing a dropped phantom endpoint
}

/** Normalise an endpoint display string for matching a CAD-manifest `from`/`to`/`name` against a
 *  dropped phantom word's `name_human` (the manifest writes the word's name_human verbatim; the
 *  schedule reader also does a `_`→' ' swap, so we compare on a lower-cased, separator-folded form). */
function normEndpoint(s: string): string {
  return String(s ?? '').replace(/[_\s]+/g, ' ').trim().toLowerCase()
}

/** Is `k` of the form `computed_<base>` (carries a leading/embedded `computed_` segment that,
 *  when stripped, yields a DIFFERENT, non-empty key)? */
function isComputedTwinKey(k: string): boolean {
  const base = stripComputedId(k)
  return base !== k && base.length > 0
}

/** Reconcile the computed_<base> ↔ <base> quantity twins on a chain state object, in place.
 *  When `outDir` is given, ALSO prune the routed-CAD manifests in that directory
 *  (connection-schedule.json / route-manifest.json / parts-manifest.json) of any entry that
 *  references a dropped phantom word as an endpoint — those manifests were baked by the EARLY
 *  design loop (before this pass) so they still carry the phantom edges the requirements-driven
 *  BoM + the isometric/single-line drawings consume. Returns counts for logging. Pure of
 *  side-effects beyond the in-place state mutation + the manifest rewrites in `outDir`. */
export function reconcileComputedTwins(
  state: any,
  outDir?: string,
  // Loosely typed so the node `fs` exports (with their overloaded signatures) assign cleanly.
  fs?: { readFileSync: (p: string, enc: any) => any; writeFileSync: (p: string, d: any) => void; existsSync: (p: string) => boolean },
): ComputedTwinReconcileResult {
  const res: ComputedTwinReconcileResult = {
    twinQuantitiesDropped: 0,
    droppedQuantityKeys: [],
    survivingComputedKeys: [],
    phantomWordsDropped: 0,
    droppedWordIds: [],
    droppedWordNames: [],
    dependentRefsPruned: 0,
    manifestEntriesPruned: 0,
  }
  if (!state || typeof state !== 'object') return res

  // (1) Determine, from the orchestrator contract (the canonical quantity map every consumer
  //     reads), the set of `computed_<base>` keys whose de-prefixed `<base>` twin ALSO exists.
  //     Use a UNION of both contracts' keys to decide "twin exists" (a base may live in either),
  //     then DELETE the computed_<base> from BOTH contracts so neither can leak it downstream.
  const orchQ: Record<string, unknown> =
    (state.orchestratorContract && typeof state.orchestratorContract === 'object'
      ? (state.orchestratorContract.quantities as Record<string, unknown>)
      : undefined) ?? {}
  const engQ: Record<string, unknown> =
    (state.engineeringContract && typeof state.engineeringContract === 'object'
      ? (state.engineeringContract.quantities as Record<string, unknown>)
      : undefined) ?? {}
  const baseKeyExists = new Set<string>([...Object.keys(orchQ), ...Object.keys(engQ)])

  const dropBaseSet = new Set<string>() // the surviving <base> names whose computed twin we drop
  for (const k of new Set<string>([...Object.keys(orchQ), ...Object.keys(engQ)])) {
    if (!isComputedTwinKey(k)) continue
    const base = stripComputedId(k)
    if (baseKeyExists.has(base)) {
      // a real twin exists → the computed_* is redundant + often wrong-basis → drop it.
      if (Object.prototype.hasOwnProperty.call(orchQ, k)) delete orchQ[k]
      if (Object.prototype.hasOwnProperty.call(engQ, k)) delete engQ[k]
      res.twinQuantitiesDropped++
      res.droppedQuantityKeys.push(k)
      dropBaseSet.add(base)
    } else if (/(^|_)calc_/i.test(k)) {
      // no de-prefixed <base> twin, but this is a `calc_*` COLLISION-SHADOW — it exists only
      // because a tool re-emitted a key the contract already owns under a DIFFERENT name (e.g.
      // calc_degasser_air_flow vs the canonical co2_stripping_air_flow). It is NEVER a legitimate
      // sole source, so drop it so it can't survive as a phantom vessel/blower source. Universal:
      // no archetype carries a legitimate `calc_*` key (BESS/CO2/e-fuel = 0).
      if (Object.prototype.hasOwnProperty.call(orchQ, k)) delete orchQ[k]
      if (Object.prototype.hasOwnProperty.call(engQ, k)) delete engQ[k]
      res.twinQuantitiesDropped++
      res.droppedQuantityKeys.push(k)
      dropBaseSet.add(stripComputedId(k))
    } else {
      // no twin → this computed_* is the SOLE source for the quantity → keep it untouched.
      // (AUV computed_endurance_min, drone computed_peak_flow_lpm — consumed by the verifier.)
      res.survivingComputedKeys.push(k)
    }
  }
  res.droppedQuantityKeys.sort()
  res.survivingComputedKeys.sort()

  // (2) Drop loose phantom WORDS that an earlier synthesis pass minted from a now-dropped
  //     `computed_<base>` quantity. A word qualifies when its id OR content_character.character_id
  //     carries a `computed_` segment whose stripped form maps to a `<base>` we dropped in (1)
  //     (i.e. the canonical twin survives). This removes ONLY the duplicate "Computed X" echo;
  //     the real "X" word is untouched. Collect the dropped ids to prune dependents.
  const droppedWordIds = new Set<string>()
  const droppedWordNames = new Set<string>() // name_human of each dropped phantom (manifest endpoint key)
  const computedHostMatchesDroppedTwin = (w: any): boolean => {
    if (!w || typeof w !== 'object') return false
    const id = String(w.id ?? '')
    const cid = String((w.content_character && w.content_character.character_id) ?? '')
    for (const ident of [id, cid]) {
      if (!ident) continue
      const stripped = stripComputedId(ident)
      if (stripped === ident) continue // no computed_ segment → real word, leave it
      // The word's de-prefixed base (drop a trailing _word / _synth_word suffix to compare with
      // the quantity base) must correspond to a twin we dropped. Match on the quantity base being
      // a prefix of the stripped word base — `recirc_pump_motor_kw` ⊂ `recirc_pump_motor_kw_word`.
      const strippedBase = stripped.replace(/_(synth_)?word$/i, '')
      for (const b of dropBaseSet) {
        if (strippedBase === b || strippedBase.startsWith(b + '_') || b.startsWith(strippedBase + '_')) {
          return true
        }
      }
    }
    return false
  }
  const md = state.moduleDecomposition
  if (md && Array.isArray(md.modules)) {
    for (const m of md.modules) {
      if (!m || !Array.isArray(m.sub_modules)) continue
      for (const sm of m.sub_modules) {
        if (!sm || !Array.isArray(sm.words)) continue
        const kept: any[] = []
        for (const w of sm.words) {
          if (computedHostMatchesDroppedTwin(w)) {
            const wid = String(w?.id ?? '')
            if (wid) droppedWordIds.add(wid)
            const nm = String(w?.name_human ?? '').trim()
            if (nm) droppedWordNames.add(nm)
            res.phantomWordsDropped++
          } else {
            kept.push(w)
          }
        }
        if (kept.length !== sm.words.length) sm.words = kept
      }
    }
  }
  res.droppedWordIds = [...droppedWordIds].sort()
  res.droppedWordNames = [...droppedWordNames].sort()

  // (3) Prune downstream records that reference a dropped phantom word by word_id, so the BoM /
  //     cost ledger never re-surface it (partVerifications[].word_id + costBasis.lines[].word_id).
  if (droppedWordIds.size > 0) {
    const pruneByWordId = (arr: unknown): unknown => {
      if (!Array.isArray(arr)) return arr
      const out = arr.filter((row: any) => !(row && droppedWordIds.has(String(row.word_id ?? ''))))
      res.dependentRefsPruned += arr.length - out.length
      return out
    }
    if (Array.isArray(state.partVerifications)) state.partVerifications = pruneByWordId(state.partVerifications)
    if (state.costBasis && Array.isArray(state.costBasis.lines)) state.costBasis.lines = pruneByWordId(state.costBasis.lines)
  }

  // (3b) Prune the CACHED state.requirementsBom of any row naming a dropped phantom word. The
  //      requirements-driven BoM is REBUILT later in the chain (after the drawings), but the field
  //      on disk is a CACHE from the prior run — and the panel-schedule / single-line drawings
  //      (drawn from state.requirementsBom BEFORE that rebuild) would otherwise read the phantom
  //      "Computed … · 1217 kW" row as the plant's principal-motor anchor, inflating every circuit.
  //      A phantom row's `requirement` string embeds the dropped word's name_human verbatim (both
  //      the principal row "Computed Recirc Pump Motor Power · 1217 kW" and the connection rows
  //      "… connection: Computed Recirc Pump Motor Power → Rearing Tank · …").
  if (droppedWordNames.size > 0 && Array.isArray(state.requirementsBom)) {
    const before = state.requirementsBom.length
    state.requirementsBom = state.requirementsBom.filter((row: any) => {
      const req = normEndpoint(String(row?.requirement ?? ''))
      for (const nm of droppedWordNames) {
        if (req.includes(normEndpoint(nm))) return false
      }
      return true
    })
    res.dependentRefsPruned += before - state.requirementsBom.length
  }

  // (4) Prune the routed-CAD manifests of any entry that names a dropped phantom word as an
  //     endpoint. These manifests (connection-schedule.json / route-manifest.json /
  //     parts-manifest.json) were written by the EARLY design loop — BEFORE this pass — so they
  //     still carry the phantom edges (e.g. "Computed Recirc Pump Motor Power → Rearing Tank")
  //     that requirements_bom.py turns into phantom connection BoM lines + the isometric/single-
  //     line drawings render. The later generate_drawing_set call REUSES these artifacts (it does
  //     not rebuild the Blender scene), so the phantom would survive into the dossier unless we
  //     prune the files here. Match endpoints on the dropped words' name_human (the manifest
  //     writes that string verbatim). No-op when no phantom word was dropped, or no outDir / fs.
  if (droppedWordNames.size > 0 && outDir && fs) {
    const dropNorm = new Set<string>([...droppedWordNames].map(normEndpoint))
    const refsADroppedEndpoint = (obj: any): boolean => {
      if (!obj || typeof obj !== 'object') return false
      for (const k of ['from', 'to', 'from_part', 'to_part', 'from_name', 'to_name', 'name', 'label', 'a', 'b']) {
        const val = obj[k]
        if (typeof val === 'string' && dropNorm.has(normEndpoint(val))) return true
      }
      return false
    }
    const pruneArrayInPlace = (arr: unknown): number => {
      if (!Array.isArray(arr)) return 0
      let removed = 0
      for (let i = arr.length - 1; i >= 0; i--) {
        if (refsADroppedEndpoint(arr[i])) { arr.splice(i, 1); removed++ }
      }
      return removed
    }
    // join without importing 'path' — outDir is an absolute dir, simple separator append is safe.
    const sep = outDir.endsWith('/') ? '' : '/'
    for (const file of ['connection-schedule.json', 'route-manifest.json', 'parts-manifest.json']) {
      const p = `${outDir}${sep}${file}`
      try {
        if (!fs.existsSync(p)) continue
        const doc = JSON.parse(fs.readFileSync(p, 'utf8'))
        let removed = 0
        // every array-valued container the manifests use: rows/specs/out_of_spec/upsized
        // (connection-schedule), lines (route-manifest), parts (parts-manifest).
        for (const key of ['rows', 'specs', 'out_of_spec', 'upsized', 'lines', 'parts']) {
          if (doc && Array.isArray(doc[key])) removed += pruneArrayInPlace(doc[key])
        }
        if (removed > 0) {
          res.manifestEntriesPruned += removed
          fs.writeFileSync(p, JSON.stringify(doc))
        }
      } catch {
        // non-fatal: a malformed/absent manifest must never break the reconcile — the in-state
        // word + quantity drops above already removed the primary leak surface.
      }
    }
  }

  return res
}
