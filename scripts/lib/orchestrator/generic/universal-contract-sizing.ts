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
  volumeProvenance?: 'per-unit-derived-from-aggregate' | 'cleaning-service-one-charge-clamp'
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
    // A `<endpoint>_line_flow_m3_h` quantity is a SERVICE-LINE duty published for the
    // topology flow-demand join (mintDemandCoverage rule 3: CIP recirculation / drain
    // transfer / train service flows, keyed on the endpoint slug so derive-topology's
    // joinFlowDemandsOntoTopology + connection_ledger.join_flow_demands pick them up).
    // It describes a CONNECTION (a pipe), never equipment — it must not mint or resize
    // an equipment group (same family as the calc_*/building_* skips above).
    if (SERVICE_LINE_FLOW_KEY_RE.test(key)) continue
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
  // ── CLEANING-ROLE GROUP CLAMP (one-charge rule — see CLEANING_ROLE_RE) ────────────
  // A contract group whose OWN phrase names a cleaning role (`cip_tank_volume_m3` …) is a
  // service-charge vessel, not plant storage: whatever upstream rule computed its volume,
  // the synthesised/reconciled word must never exceed one cleaning-solution recirculation
  // charge. buildGroups is the ONE choke point BOTH synthesis paths read (part A/B of
  // applyUniversalContractSizing AND reconcilePrincipalEquipment's canons), so clamping
  // here covers every mint. A cleaning group already at/below one charge is untouched.
  for (const g of all) {
    if (g.volume === undefined || !isCleaningRolePhrase(g.phrase)) continue
    const charge = cleaningChargeM3(quantities)
    if (g.volume > charge) {
      g.volume = charge
      g.volumeProvenance = 'cleaning-service-one-charge-clamp'
    }
  }
  // ── STORAGE-PIN ALIAS SUPPRESSION (universal, 2026-07-09 raised-tank dual fix) ─────
  // Contracts often emit BOTH a lock-gate / brief-compliance SCALAR (`cleanwater_reservoir_
  // volume_m3 = 91`) AND the equipment family that DELIVERS it (`fresh_water_tank_volume_
  // each_m3 = 91` + `_count = 1`). Both are real quantity keys (compliance needs the exact
  // brief name; synthesis needs the equipment noun), but only ONE physical vessel must reach
  // the BoM/GA/3D. Without this, buildGroups mints two 91 m³ principals — Fresh Water Tank
  // (correct h≈d tank on deck) AND Cleanwater Reservoir (open-basin pancake on a vertical-
  // vessel skirt, centre z ≈ 6 m). THE RULE: a volume-only storage-vessel group that is NOT
  // per-each and has no explicit count is a compliance PIN when another storage-vessel group
  // already delivers the same volume (±2 %) as a real equipment family (per-each and/or a
  // declared count) AND both names the SAME water-storage role (clean/fresh/potable/drain/
  // raw/grey/rain/recovery/irrigation/fertigation/makeup — synonym family, not token-equal).
  // Mark the pin `subAspect` so isSynthesisable refuses it. Never collapses a chemical/oil/
  // nutrient store onto a water store (different role phrase). No class table.
  const isStorageVesselGroup = (g: EquipGroup): boolean =>
    /\btanks?\b|\bvessels?\b|\bsilos?\b|\breservoirs?\b|\bcisterns?\b|\bbasins?\b|\bdrums?\b/i
      .test(String(g.phrase ?? '').replace(/_/g, ' '))
  // Inventory-stream role family for a water store. clean/fresh/potable/raw/makeup alias
  // together (one clean side); drain/recover/reclaim/grey alias together (one dirty side).
  // A clean pin must never collapse onto a drain tank of the same volume (and vice versa).
  const waterStorageRoleFamily = (g: EquipGroup): 'clean' | 'dirty' | null => {
    const p = String(g.phrase ?? '').replace(/_/g, ' ').toLowerCase()
    if (/drain|recover|reclaim|recycl|return|grey|gray|waste\s*water|dirty/.test(p)) return 'dirty'
    if (/clean|fresh|potable|raw|rain|irrig|fertig|makeup|make[\s_-]?up|\bwater\b/.test(p)) return 'clean'
    return null
  }
  for (const g of all) {
    if (g.subAspect || g.volume === undefined) continue
    // volume-only pin candidate: no duty, not per-each, no declared count
    if (g.throughput !== undefined || g.power !== undefined || g.area !== undefined) continue
    if (g.volumeIsEach || (g.count !== undefined && g.count >= 1)) continue
    if (!isStorageVesselGroup(g)) continue
    const gRole = waterStorageRoleFamily(g)
    if (!gRole) continue
    for (const o of all) {
      if (o === g || o.volume === undefined || o.subAspect) continue
      if (!isStorageVesselGroup(o)) continue
      // the other group must be a real equipment family (per-each and/or counted)
      if (!(o.volumeIsEach || (o.count !== undefined && o.count >= 1))) continue
      if (waterStorageRoleFamily(o) !== gRole) continue
      const rel = Math.abs(g.volume - o.volume) / Math.max(g.volume, o.volume, 1e-9)
      if (rel > 0.02) continue
      g.subAspect = true
      break
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
  //
  // RESERVOIR is NOT open-basin (2026-07-09 raised-pancake fix): in plant engineering a "cleanwater
  // reservoir" / "day reservoir" is a CLOSED galvanised or lined storage cylinder (h≈d, typically
  // 4–6 m dia × matching height for ~90 m³), never an open lagoon. Matching bare "reservoir" to the
  // open-basin path produced ⌀8.0 × 1.8 m pancakes that Blender then elevated on vertical-vessel
  // skirts (centre z ≈ 6 m). Open surface water is already covered by basin|pond|lagoon|pit|sump|
  // raceway|rearing|clarifier — no need for the storage-noun "reservoir" here.
  const isOpenTank = /basin|sump|\bpond\b|clarifier|settl|lagoon|\bpit\b|raceway|trough|rearing|\bculture\b|grow[_ -]?out|fish[_ ]?tank|aeration|equali[sz]|balancing|stilling|wet[_ ]?well|open[_ -]?tank/.test(p)
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
  // Continuous in kW — NO floor clamp at 0.6 m. The old max(0.6, …) collapsed every
  // sub-15 kW machine to ONE 600×510×660 box (acid/chemical/drain/fertigation pumps
  // all identical → Renders/GA default-size LITTER score 6). Scale from a 5 kW
  // reference envelope so 0.04 kW dosing, 2 kW drain, and 8 kW fertigation each get
  // a distinct footprint. Cap at 6 m for megawatt-class only.
  const side = Math.min(6, Math.max(0.25, 0.55 * Math.cbrt(Math.max(0.05, kw) / 5)))
  const mm = Math.round(side * 1000)
  return `${mm}x${Math.round(mm * 0.85)}x${Math.round(mm * 1.1)} mm`
}
/** Pump-set envelope from shaft/motor kW (when no flow is on the group). Continuous
 *  in power so two different kW pumps never share a dims signature. */
function pumpSetDimsFromKw(kw: number, phrase = ''): string {
  // 5 kW ≈ the 25 m³/h reference pump envelope (900×500×700); cube-root scale.
  const s = Math.cbrt(Math.max(0.05, kw) / 5)
  const raw = `${Math.round(900 * s)}x${Math.round(500 * s)}x${Math.round(700 * s)} mm`
  return scaleBoxDimsMm(raw, serviceEnvelopeScale(phrase))
}
function boxFromThroughputM3h(q: number): string {
  const side = Math.min(7, Math.max(0.7, 1.4 * Math.cbrt(q / 1000)))
  const mm = Math.round(side * 1000)
  return `${mm}x${Math.round(mm * 0.85)}x${Math.round(mm * 1.1)} mm`
}

// ── TYPE-DERIVED dims for flow-rated devices (default-size LITTER fix, codema v53) ──
// boxFromThroughputM3h clamps its side at 0.7 m, so EVERY small flow-rated principal —
// a 25 m³/h hand-watering pump, a 45 m³/h drain pump, a 90 m³/h irrigation pump, a
// 14.5 m³/h GAC softener — collapsed to ONE identical 700x595x770 mm box: 5 distinct
// parts sharing one dims signature = the manifest-sight default-size LITTER cluster
// that capped the render/GA tabs. Fix at source: derive per-TYPE dims from the physics
// the group already carries (mirroring how grounded words get real dims), keyed on the
// device NOUN in the group phrase — no class table, universal.
//   · PUMP / BLOWER / FAN → scale the canonical pump-set envelope (900×500×700 mm at
//     25 m³/h — the same envelope build_universal_scene's TYPE_DEFAULTS uses) by the
//     CUBE ROOT of the flow ratio. Continuous in Q, no floor clamp → two different
//     flows can never share a dims signature.
//   · MEDIA-BED VESSEL (filter / softener / adsorber / GAC / polisher) → a vertical
//     cylinder sized at a standard 25 m/h superficial velocity: bed area = Q/25 m²,
//     ⌀ from the area, height ≈ 2⌀ (bed + freeboard) — the honest silhouette of a
//     packaged media vessel, printed in the same "⌀ m dia x H m" grammar every
//     downstream parser (Blender, GA, BoM) already reads.
//   · anything else keeps the legacy throughput box (unchanged behaviour).
const PUMP_SET_REF_FLOW_M3H = 25
const PUMP_SET_REF_MM = { w: 900, d: 500, h: 700 } // = build_universal_scene TYPE_DEFAULTS "pump"
// INTENT: metering pumps at identical catalogue kW (acid/chemical/oxygen @ 0.04 kW)
// must not share one exact mm signature — that trips default-size LITTER (≥5 names
// @ one box) and caps Renders/GA at 8 (codema-full-20260709-1359). Scale by a
// stable service/zone noun factor so dims stay duty-derived but name-distinct.
function serviceEnvelopeScale(phrase: string): number {
  const p = phrase.replace(/[_\s]+/g, ' ').toLowerCase()
  let s = 1
  if (/\bnursery\b/.test(p)) s *= 0.91
  if (/\bacid\b/.test(p)) s *= 0.96
  if (/\bchemical\b|\bnutrient\b/.test(p)) s *= 1.04
  if (/\boxygen\b/.test(p)) s *= 1.08
  if (/\bhand\s*watering\b/.test(p)) s *= 1.02
  if (/\bfertigation\b/.test(p)) s *= 1.0
  return s
}
function scaleBoxDimsMm(dims: string, scale: number): string {
  if (!(scale > 0) || Math.abs(scale - 1) < 1e-9) return dims
  const m = /^(\d+)x(\d+)x(\d+) mm$/.exec(dims)
  if (!m) return dims
  return `${Math.round(Number(m[1]) * scale)}x${Math.round(Number(m[2]) * scale)}x${Math.round(Number(m[3]) * scale)} mm`
}
function pumpSetDimsFromFlowM3h(q: number, phrase = ''): string {
  // GOTCHA: Math.max(2, q) collapsed every metering pump (<2 m³/h) onto one box.
  // Floor at 0.02 m³/h so trim duties stay continuous in Q.
  const s = Math.cbrt(Math.max(0.02, q) / PUMP_SET_REF_FLOW_M3H)
  const raw = `${Math.round(PUMP_SET_REF_MM.w * s)}x${Math.round(PUMP_SET_REF_MM.d * s)}x${Math.round(PUMP_SET_REF_MM.h * s)} mm`
  return scaleBoxDimsMm(raw, serviceEnvelopeScale(phrase))
}
const MEDIA_BED_SUPERFICIAL_M_H = 25
function mediaVesselDimsFromFlowM3h(q: number): string {
  const areaM2 = Math.max(0.05, q / MEDIA_BED_SUPERFICIAL_M_H)
  const dia = Math.max(0.4, Math.round(Math.sqrt((4 * areaM2) / Math.PI) * 10) / 10)
  const ht = Math.max(1.2, Math.round(2.0 * dia * 10) / 10)
  return `${dia.toFixed(1)} m dia x ${ht.toFixed(1)} m`
}
const PUMPLIKE_NOUN_RE = /\b(pumps?|blowers?|fans?)\b/
const MEDIA_VESSEL_NOUN_RE = /\b(filters?|softeners?|adsorbers?|polishers?|strainers?|deionisers?|demineralisers?|gac)\b|activated carbon/
function dimsForThroughputDevice(q: number, phrase: string): string {
  const p = phrase.replace(/[_\s]+/g, ' ').toLowerCase()
  if (PUMPLIKE_NOUN_RE.test(p)) return pumpSetDimsFromFlowM3h(q, phrase)
  if (MEDIA_VESSEL_NOUN_RE.test(p)) return mediaVesselDimsFromFlowM3h(q)
  return boxFromThroughputM3h(q)
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
//
// GOTCHA (Codema ship 2026-07-09): 1-dp rounding collapses metering/dosing pumps
// (≈0.04 kW) to the literal string "0" → BoM/EA rows read "Acid Dosing Pump · 0 kW"
// and shaft power joins as 0. Below 1 kW keep 2 dp so a real trim duty never prints as zero.
function formatRatingKw(kw: number): string {
  if (!(kw > 0)) return '0'
  if (kw < 1) {
    const s = (Math.round(kw * 100) / 100).toFixed(2)
    return s.replace(/\.?0+$/, '') || '0'
  }
  if (kw < 100) {
    const v = Math.round(kw * 10) / 10
    return Number.isInteger(v) ? String(v) : String(v)
  }
  return String(Math.round(kw))
}
function dimAndRatingFor(g: EquipGroup): ModifierCharacter[] {
  const add: ModifierCharacter[] = []
  if (g.volume !== undefined) {
    add.push(mod('dimension', cylinderFromVolumeM3(g.volume, g.phrase)))
    add.push(mod('capacity', formatCapacityM3(g.volume), 'm³'))
  } else if (g.area !== undefined) {
    add.push(mod('dimension', `${Math.round(g.area)} m² area`))
  } else if (g.throughput !== undefined) {
    // Flow first (pump-set / media-bed continuous dims) — preferred over power box.
    add.push(mod('dimension', dimsForThroughputDevice(g.throughput, g.phrase)))
  } else if (g.power !== undefined) {
    // Pump/blower with only kW: scale the pump-set envelope by power so small dosing
    // pumps never collapse to the shared 600×510×660 litter cluster. Pass phrase so
    // serviceEnvelopeScale keeps same-kW acid/chemical/oxygen/nursery pumps distinct.
    const p = g.phrase.replace(/[_\s]+/g, ' ').toLowerCase()
    add.push(mod('dimension',
      PUMPLIKE_NOUN_RE.test(p) ? pumpSetDimsFromKw(g.power, g.phrase) : boxFromRatingKw(g.power)))
  }
  // Prefer 1-dp kW display (formatRatingKw) so 5.04 / 7.5 stay honest vs integer round.
  if (g.power !== undefined) add.push(mod('rating_primary', formatRatingKw(g.power), 'kW'))
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
  // 'manifold' — a distribution manifold station is real process equipment (headers +
  // isolation/non-return valves); needed so the zoned-delivery rule-8 principal
  // (distribution_manifold_count + _throughput_m3_h) is synthesisable. The only pre-existing
  // `*manifold*` quantity keys are `_line_flow_m3_h` service duties, which buildGroups skips,
  // so no other archetype gains or loses a group from this noun. (2026-07-03)
  'manifold',
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
/** A bare `<demand-stem>_pump` group whose throughput equals a plant demand that is
 *  already covered by ≥2 brief-stated parallel unit capacities — a phantom plant-total
 *  twin (Codema 1820: Irrigation Pump 225 m³/h beside pump_unit_1/2 + nursery capacities).
 *  Universal: demand-echo + unit-capacity signals only. */
function isPhantomPlantTotalPumpCoveredByUnits(
  g: EquipGroup,
  quantities: Record<string, number>,
): boolean {
  if (g.throughput === undefined || g.throughput <= 0) return false
  if (!/\bpump\b/i.test(g.phrase.replace(/_/g, ' '))) return false
  // only a plant-TOTAL twin: throughput matches a demand echo (±5%)
  let matchedDemand = 0
  for (const [k, v] of Object.entries(quantities)) {
    if (!FLUID_DEMAND_ECHO_RE.test(k) || !Number.isFinite(v) || v <= 0) continue
    if (Math.abs(g.throughput - v) / v <= 0.05) { matchedDemand = v; break }
  }
  if (!(matchedDemand > 0)) return false
  return parallelUnitCapacityCoverage(quantities, matchedDemand) !== null
}

function isSynthesisable(g: EquipGroup, quantities?: Record<string, number>): boolean {
  // A sub-aspect of a larger principal (degasser_column ⊂ a degasser) is not a second machine.
  if (g.subAspect) return false
  // Phantom plant-total pump beside brief-stated parallel units — never mint.
  if (quantities && isPhantomPlantTotalPumpCoveredByUnits(g, quantities)) return false
  if (g.volume !== undefined && g.volume >= 1) return true
  if (g.area !== undefined && g.area >= 2) {
    // a MEMBRANE / transfer SURFACE area (RO/UF/NF) is a process SPEC, not a plan footprint — the
    // membranes live INSIDE the RO/UF skid principal, so minting a standalone "364 m² membrane slab"
    // is wrong (the recurring £61M membrane-area bug + the physics-critic HIGH "364 m² for an 8040
    // element"). Universal — keyed on the membrane/RO noun, no class table.
    if (/membrane|reverse.?osmos|\bro\b|\buf\b|\bnf\b|ultrafiltrat|nanofiltrat/i.test(g.phrase)) return false
    return true
  }
  if ((g.throughput !== undefined && g.throughput >= 10) || (g.power !== undefined && g.power >= 15)) {
    // a DISINFECTION STAGE (uv / disinfect / steril / ozone / chlorinat) is a real process
    // unit even though its noun is a "-tion" process word — 'uv_disinfection' failed
    // phraseLooksLikeDevice, so the calculator-sized UV existed as quantities on v54–v56b
    // yet only rendered when the generator happened to emit the word (the UV coin-flip).
    // Keyed on the stage noun family, universal, no class table (gate-36 round 2).
    return phraseLooksLikeDevice(g.phrase) || isDisinfectionPhrase(g.phrase)
  }
  // EXPLICITLY-COUNTED SMALL DEVICE (Sam Green SME review, 2026-07-07 — "each pump unit has
  // its own fertilizer + acid + hydrogen-peroxide dosing"). The 10 m³/h / 15 kW floor above
  // exists to keep a diffuse NOISE quantity (a load/duty aggregate with no device identity)
  // from minting a phantom machine — it was never meant to exclude a genuinely small,
  // explicitly-counted DISCRETE unit. A metering/dosing pump (Iwaki EWN-C21, ~40 L/h, ~40 W)
  // fails both floors by two orders of magnitude yet is real, priced, installed equipment —
  // the brief states it, the contract carries its OWN `_count` (acid_dosing_pump_count = 2,
  // chemical_dosing_pump_count = 2), and Sam's real Codema P&ID draws it as a named device.
  // Before this fix those quantities existed on every fischer-codema run but ZERO acid/H₂O₂
  // dosing pump ever reached the BoM/topology (isSynthesisable silently refused them) —
  // Rule 2 of the multizone-distribution handover ("per-unit dosing depth") was
  // unimplementable without this. UNIVERSAL, no class table: a group qualifies only when (a)
  // it carries an EXPLICIT discrete count ≥1 (proof the contract/brief counted a real unit,
  // not a synthesised default), (b) it also carries SOME rated duty (throughput or power —
  // a bare, unrated count alone is still refused, e.g. a generic non-device `*_count`), and
  // (c) its phrase names an actual device noun. proveNoFalsePositive: a diffuse load/duty
  // quantity with no `_count` sibling never reaches this branch at all (measure !== 'count'
  // is not how groups are gated — g.count is only ever set from a real `_count` key).
  if (g.count !== undefined && g.count >= 1 && (g.throughput !== undefined || g.power !== undefined)) {
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

// ── CLEANING-SERVICE (CIP / flush / rinse / washdown) vessels — one-charge rule ──────────
// THE BUG (codema v50 physics-critic HIGH): the contract-quantity fuzzy match scored the
// 40 m³ `fresh_water_tank` STORAGE group onto the grounded "Cleaning Tank" / "Cip Tank"
// words via the single shared generic stem 'tank' (scoreMatch=1 ≥ minScore=1) — two absurd
// 3.7 m ⌀ × 3.7 m CIP vessels, each the size of the plant's entire fresh-water store, AND
// the REAL storage tanks were suppressed at generator time (matched.add) so they were only
// re-minted later by the reconcile, with no instrumentation.
// THE RULE (universal, keyed on the role NOUN, no class table): a vessel whose ROLE noun is
// cleaning / CIP / flush / rinse sizes from the process it SERVES, never from a plant-storage
// default. ENGINEERING BASIS: a CIP tank holds ONE cleaning-solution recirculation charge —
// the hold-up of the circuit it flushes (membrane vessels + interconnecting pipework), in
// practice ~10–20 % of the plant's hourly design flow volume; for package plants that lands
// in the 0.5–2 m³ band. Charge = max(0.5 m³, min(2 m³, 0.15 × hourly design flow m³/h)).
// Deliberately does NOT match a bare "clean" adjective ("Clean Water Tank" is storage FOR
// clean water, not a vessel that DOES cleaning).
const CLEANING_ROLE_RE = /\b(cip|clean[\s_-]?in[\s_-]?place|cleaning|flush(?:ing)?|rins(?:e|ing)|wash(?:ing|down))\b/i
function isCleaningRolePhrase(s: string): boolean {
  return CLEANING_ROLE_RE.test(String(s ?? '').replace(/_/g, ' '))
}
function wordRoleText(w: WordLike): string {
  return `${w.name_human ?? ''} ${w.id ?? ''} ${w.content_character?.character_id ?? ''}`
}
// The vessel nouns the one-charge rule applies to (mirrors the reconcile's authored-vessel
// noun test; a cleaning-role PUMP or hose station is not a vessel and is never touched).
const CLEANING_VESSEL_NOUN_RE = /\btanks?\b|\bvessels?\b|\bdrums?\b|\bsilos?\b|\breservoirs?\b|\bcisterns?\b|\bbasins?\b/i
/** One cleaning-solution recirculation charge (m³) for the plant the contract describes:
 *  ~15 % of the largest hourly design flow, bounded [0.5, 2] m³ (see basis above). */
function cleaningChargeM3(quantities: Record<string, number>): number {
  let flow = 0
  for (const [k, v] of Object.entries(quantities)) {
    if (!Number.isFinite(v) || v <= 0) continue
    if (/_m3_h$|_m3_per_hr$/.test(k)) flow = Math.max(flow, v)
  }
  return Math.max(0.5, Math.min(2, 0.15 * flow))
}

/** Apply the one-charge rule to every cleaning-role VESSEL word: an unsized CIP/flush/rinse
 *  tank gets one charge; an oversized one (however it was minted — fuzzy match, LLM author,
 *  prior state) is clamped to one charge. A cleaning vessel already at/below one charge is
 *  byte-untouched. Runs in BOTH synthesis paths (applyUniversalContractSizing AND
 *  reconcilePrincipalEquipment) so a re-mint can never resurrect the storage-sized CIP tank.
 *  Universal — keyed on the role noun + vessel noun, no class table. Returns words sized. */
function sizeCleaningServiceVessels(modules: ModuleLike[], quantities: Record<string, number>): number {
  const charge = cleaningChargeM3(quantities)
  let sized = 0
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    if (isInstrument(w) || isSubcomponent(w)) continue
    const txt = wordRoleText(w)
    if (!isCleaningRolePhrase(txt) || !CLEANING_VESSEL_NOUN_RE.test(txt)) continue
    const mods = w.modifier_characters ?? []
    const cap = mods.find((mc) => mc.kind === 'capacity' && /m³|m3/.test(`${mc.unit ?? ''} ${mc.value ?? ''}`))
    const capM3 = cap ? parseFloat(String(cap.value)) || 0 : 0
    const hasDim = mods.some((mc) => mc.kind === 'dimension' || mc.kind === 'dimensions')
    if (capM3 > 0 && capM3 <= charge + 1e-9 && hasDim) continue // already correctly sized
    mergeMods(w, [
      mod('dimension', cylinderFromVolumeM3(charge, 'cip tank')),
      mod('capacity', formatCapacityM3(charge), 'm³'),
      mod('sizing_basis', `CIP/cleaning-service vessel — one cleaning-solution recirculation charge (~15 % of the plant hourly design flow, bounded 0.5–2 m³); never the plant-storage default`),
    ])
    sized += 1
  }
  return sized
}

// ── DISINFECTION-STAGE + STORAGE-DELIVERY machinery (gate-36 round 2, 2026-07-03) ─────────
// THE BUGS (fischer-codema v54→v56b): (1) UV COIN-FLIP — the contract carried
// uv_disinfection_{throughput,power,count} on all four runs, but the principal only existed
// when the GENERATOR happened to emit a UV word (v54/v55 yes, v56/v56b no): the group phrase
// 'uv_disinfection' fails phraseLooksLikeDevice ('disinfection' is a "-tion" process noun),
// so isSynthesisable refused it and neither synthesis path ever minted the unit. A hygiene-
// critical water loop lost its disinfection stage on generator whim. (2) STORAGE PIN — the
// brief pins a total storage volume (water_storage_capacity_m3 = 120, "three 40 m³ tanks");
// nothing GUARANTEED the delivered tank principals sum to it, and no DELIVERED-total quantity
// existed for a compliance/benchmark reader (the per-scope fresh_water_storage_capacity_m3 =
// 40 read as "the storage" → the gate-36 0.33× false-RADICAL).
// THE RULES (universal — nouns + quantity-key semantics, no class table):
//   · a disinfection-stage phrase (uv / disinfect / steril / ozone / chlorinat) IS a device
//     for synthesisability, and rule 5 mints its quantities from the validated-dose rule
//     when a hygiene-critical loop has NO disinfection at all;
//   · an existing disinfection WORD suppresses the synthetic principal in BOTH paths
//     (grounded delivery always wins — no twin);
//   · rule 6 sums the DELIVERED storage-vessel principals against every brief storage pin,
//     synthesises the shortfall as real tank principals, and mints the `_delivered_m3`
//     total either way so every reader diffs the DELIVERED quantity, never a per-scope key.
const DISINFECTION_STAGE_WORD_RE = /(^|\s)uv(\s|$)|disinfect|steril|ozon|chlorinat/i
function isDisinfectionPhrase(s: string): boolean {
  return DISINFECTION_STAGE_WORD_RE.test(String(s ?? '').replace(/[_-]/g, ' '))
}
// hygiene-critical loop signal (potable / drinking / irrigation / fertigation / hygiene /
// recirculating water) — the brief/contract noun families whose water demands a disinfection
// stage. BESS / SAF / CO₂ carry none of these → strict no-op.
const HYGIENE_CRITICAL_RE = /potable|drinking|irrigat|fertigat|hygien|recircul/i
// UV electrical demand per delivered flow: the P1 validated-dose rule — 40 mJ/cm² validated
// dose (potable/reuse practice, DVGW/USEPA) at typical UVT ⇒ ≈ 0.046 kWe per m³/h delivered
// (matches the water-treatment calculator: 90 m³/h → 4.1 kW).
const UV_DOSE_MJ_CM2 = 40
const UV_KW_PER_M3H = 0.046
/** True when the design already carries a disinfection-stage WORD (any UV / ozone /
 *  steriliser / chlorination unit). Instruments (a UV-intensity sensor) and sub-components
 *  never count — they monitor the stage, they are not the stage. `groundedOnly` restricts
 *  to non-synthesised words (the reconcile's suppression test: a grounded unit owns the
 *  function; a synth twin from a prior pass is reconciled via its canon instead). */
function modulesHaveDisinfectionWord(mods: ModuleLike[], groundedOnly = false): boolean {
  for (const m of mods ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    if (isSubcomponent(w) || isInstrument(w) || isFieldInstrumentByName(w)) continue
    if (groundedOnly && isSynth(w)) continue
    if (isDisinfectionPhrase(wordRoleText(w))) return true
  }
  return false
}
// storage-pin metric noun test (mirrors benchmark-expectation briefPinnedVolumesM3) + the
// vessel nouns whose capacity counts as DELIVERED storage.
const STORAGE_METRIC_NOUN_RE = /storage|store|tank|buffer|reservoir/i
const STORAGE_VESSEL_NOUN_RE = /\btanks?\b|\bvessels?\b|\bsilos?\b|\breservoirs?\b|\bcisterns?\b|\bbasins?\b|\bdrums?\b/i
// a rule-6 SHORTFALL-coverage group ('<core>_reserve_tank') exists precisely BECAUSE the
// existing vessel words do NOT cover the pin — a loose stem overlap ('water'+'tank') must
// never let an existing tank ADOPT it (that both suppresses the reserve synthesis AND
// stamps the reserve count onto the grounded tank). Only a word that FULLY contains the
// group's stems (its own synth word on a re-run) may match it.
const RESERVE_COVERAGE_PHRASE_RE = /(^|_)reserve_tank$/i
// rule-8 zoned-network principal (the per-group distribution manifold) — like the rule-6
// reserve tank, its group must only ever be adopted by a word that FULLY names it: a 1-stem
// 'distr' overlap ("Flow Distribution Plates", "Power Distribution Block") must neither
// inherit its ×N count + flow box nor suppress its synthesis via matched.add().
const ZONED_NETWORK_PRINCIPAL_RE = /(^|_)distribution_manifold$/i

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
interface ParentPhysics { kw: number; m3: number; m3h: number; diaM: number; htM: number; qty: number; motorKwOverride?: number; motorKwPinned?: boolean }
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
// SELECTED at the next standard frame at or above the required power. SINGLE ROUNDING ONLY
// (Tristan 2026-07-03): the old rule stacked a ×1.15 service factor ON TOP of the frame
// rounding (a double margin) — the tool's 9.653 kW motor became 11.1 → a 15 kW frame, and a
// brief-pinned 7.5 kW Lowara e-SHE became 8.6 → an 11 kW frame — tripping the deterministic
// rating-pair corroboration (>1.25× motor-service tolerance) on v56c/v56d (fertigation
// 11-vs-8, RO 5.5-vs-4.2, drain 3-vs-2 → Risk 7.5 / physics_fidelity 7 / floor 7). The frame
// step IS the service margin: a computed requirement already carries the tool's own
// efficiency terms, and a brief-pinned rating is a NAMEPLATE (honoured exactly — see
// motorKwPinned; the brief-pinned protection family: never exceed a pin by stacked margins).
const IEC_MOTOR_FRAMES_KW = [
  0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200,
  250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000,
]
// Same 1.25× band dossier_audit._RATING_PAIR_SERVICE_TOL uses — keep in lockstep.
// Declared here (with the motor-frame table) so explodeEquipmentSubAssemblies and
// reconcileDriveTrainRatings both read one constant.
const RATING_PAIR_SERVICE_TOL = 1.25
function nextMotorFrameKw(kw: number): number {
  if (!(kw > 0)) return kw
  for (const f of IEC_MOTOR_FRAMES_KW) if (f >= kw - 1e-9) return f
  return Math.ceil(kw)
}
// INTENT: metering/trim dosing pumps (acid/chemical, ~0.04 m³/h) must NOT inherit the
// 1.5 kW bulk-pump floor — that stamped every small injector as a 1.5 kW process motor.
// Below METERING_FLOW_M3H_MAX use the hydraulic duty (or a 0.04 kW catalogue floor for
// diaphragm metering), never the bulk IEC ladder. Universal — keyed on flow magnitude.
const METERING_FLOW_M3H_MAX = 0.5
const METERING_POWER_KW_FLOOR = 0.04
const motorKw = (p: ParentPhysics) => {
  if (p.motorKwOverride && p.motorKwOverride > 0 && p.motorKwPinned) {
    return p.motorKwOverride // brief-pinned NAMEPLATE — honoured exactly, never re-margined
  }
  if (p.motorKwOverride && p.motorKwOverride > 0) {
    return nextMotorFrameKw(p.motorKwOverride)
  }
  const fromShaft = p.kw > 0 ? p.kw / 0.88 : 0
  const fromFlow = p.m3h > 0 ? (p.m3h * FLOW_PUMP_DEFAULT_BAR) / (36 * FLOW_PUMP_EFF) : 0
  const hydraulic = fromShaft || fromFlow
  if (p.m3h > 0 && p.m3h < METERING_FLOW_M3H_MAX) {
    // Trim/metering: keep the real small duty (floor at catalogue diaphragm ~40 W).
    return Math.max(METERING_POWER_KW_FLOOR, hydraulic || METERING_POWER_KW_FLOOR)
  }
  return nextMotorFrameKw(Math.max(1.5, hydraulic || 30 / 0.88))
}

// Read a pump/rotating parent's already-computed motor/drive power (kW) from the contract
// quantities by stem (e.g. parent 'Irrigation Pump' → irrigation_pump_motor_kw=9.653). The
// hydraulic sizing tool (process:/irrigation:pump-sizing) emits *_motor_kw / *_power_kw for
// pumps across EVERY process archetype, so this is universal — no per-class table. Returns
// the matched KEY too so the caller can test brief-pinned provenance (motorKwPinned).
function motorKwFromContract(w: WordLike, quantities: Record<string, number>): { kw: number; key: string } {
  const stems = wordStems(w).filter((s) => !['synth', 'word', 'system', 'unit', 'assembly'].includes(s))
  if (stems.length < 2) return { kw: 0, key: '' } // need ≥2 distinctive stems (e.g. irrigation+pump) to bind unambiguously
  let best = 0, bestKey = '', bestScore = 1
  for (const [k, v] of Object.entries(quantities)) {
    if (!(v > 0)) continue
    if (!/_(motor_kw|motor_power_kw|power_kw|drive_kw)$/.test(k)) continue
    // stem the key tokens the SAME way wordStems does (5-char truncation) so
    // 'irrigation' (key) ≡ 'irrig' (word stem) — otherwise nothing ever binds.
    const ktoks = new Set(k.toLowerCase().split(/[^a-z0-9]+/).map(stem))
    const overlap = stems.reduce((n, s) => n + (ktoks.has(s) ? 1 : 0), 0)
    if (overlap >= 2 && overlap > bestScore) { bestScore = overlap; best = v; bestKey = k }
  }
  return { kw: best, key: bestKey }
}

/** The contract-quantity keys whose value the BRIEF pinned (source === 'brief') — a pinned
 *  machine rating is a NAMEPLATE the design must honour exactly (brief-pinned protection:
 *  change the part to meet the demand, never exceed a pin by stacked margins). */
export function briefPinnedQuantityKeys(contract?: ContractInProgress): Set<string> {
  const out = new Set<string>()
  const q = (contract as { quantities?: Record<string, unknown> } | undefined)?.quantities ?? {}
  for (const [k, v] of Object.entries(q)) {
    if (v && typeof v === 'object' && String((v as { source?: unknown }).source ?? '') === 'brief') out.add(k)
  }
  return out
}

// ── DEMAND-COVERAGE COMPLETENESS (the omission-side counterpart of principal-emitter
// authority — codema v51, Tristan 2026-07-02) ────────────────────────────────────────────
// THE BUG: the generator's word-set varies run-to-run. On v51 the LLM emitted NO irrigation-
// pump word (v49 + v50 both had one — pure word-set variance), so the hydraulic pump-sizing
// tool never ran for irrigation and the contract carried ONLY the requirement ECHO
// (irrigation_demand_m3_h = 90, the lock-gate HARD slot) with no DELIVERED quantity. The
// compliance matcher deliberately refuses to match an echo key (…_demand — dossier_audit.py
// _ECHO_NAME_TOKENS; the honest-scoring principle, NOT to be relaxed), so the brief metric
// max_irrigation_demand_per_department (45 m³/h × 2 departments) went UNVERIFIED → 2 HIGH
// findings → Executive Summary + Audit capped at 2 — and the design GENUINELY lacked the
// irrigation train. The same run-to-run tool luck lost drain_transfer_pump_power_kw on v51
// (the pump word + its *_throughput_m3_h / *_count survived; the motor quantity vanished).
// THE RULE (universal — keyed on quantity-key SEMANTICS + stems, never a class table):
//   1. every FLUID-DELIVERY DEMAND quantity — an echo-token key (demand / required /
//      requested / target / setpoint: exactly the token family the compliance matcher
//      refuses to verify) anchored on a volumetric-flow unit — with value > 0 yields a
//      DELIVERED supply-pump pair for its stem family: <stem>_pump_flow_m3_h = the demand,
//      <stem>_pump_motor_kw from the flow-only hydraulic idiom (P = Q·ΔP/(36·η) at
//      ΔP = FLOW_PUMP_DEFAULT_BAR, η = FLOW_PUMP_EFF — the same relation the sub-assembly
//      Drive Motor falls back to). Minted ONLY when the family carries no delivered pump
//      flow/power already: a sizing-tool value ALWAYS wins — this is a deterministic floor,
//      never an override. (Survey 2026-07-02: the only fluid demand key any archetype
//      builder emits is irrigation_demand_m3_h; every other _demand_/_supply_ key is
//      electrical kW/kVA or a gas kg/h rate — excluded by the m3_h unit anchor.)
//   2. every PUMP-named flow family (<fam>_throughput/flow_m3_h where <fam> carries a
//      'pump' token) with no *_power_kw / *_motor_kw family twin gets <fam>_power_kw
//      minted from the same hydraulics. A fan / blower / compressor is NOT covered — a
//      gas-mover's head physics differ from the liquid ΔP default.
// The minted keys are written into the LOCAL quantities map BEFORE buildGroups — the ONE
// choke point BOTH synthesis paths read (applyUniversalContractSizing part A/B AND
// reconcilePrincipalEquipment's canons) — so the EXISTING matched/suppression logic applies
// unchanged: a design that already HAS the pump word (v50) gets NO synthetic principal,
// only the delivered quantities; one without it (v51) synthesises the principal via the
// normal synthWord path. When the contract is supplied, each minted quantity persists to
// contract.quantities with provenance source='demand-coverage' (CORE FIX PRINCIPLE — route
// by provenance) so the compliance matrix verifies the brief metric on EVERY run. STRICT
// NO-OP — byte-identical output — for a class with no fluid-delivery demand key and no
// motorless pump-flow family (BESS / smallsat / edge-ai).
const FLUID_DEMAND_ECHO_RE = /_(demand|required|requested|target|setpoint)_(m3_h|m3_hr|m3_per_hr)$/
// INTENT: when a brief states N parallel pump-UNIT capacities (pump_unit_1_capacity,
// nursery_pump_unit_capacity, …) whose sum ≈ a plant demand, that demand is ALREADY
// delivered by those units — minting/synthesising a single plant-total `<stem>_pump`
// (225 m³/h Irrigation Pump beside 2×90 + 1×45 fertigation units) is a phantom twin
// the physics critic correctly flags. Universal: keyed on `*_unit*_capacity*` flow
// keys (≥2), no class name. (Codema 1820 Risk 7.9.)
const PARALLEL_UNIT_CAPACITY_KEY_RE =
  /(^|_)pump_unit(_\d+)?_capacity_(m3_h|m3_hr|m3_per_hr)$|(^|_)[a-z0-9]+_pump_unit_capacity_(m3_h|m3_hr|m3_per_hr)$|(^|_)[a-z0-9]+_unit_capacity_(m3_h|m3_hr|m3_per_hr)$/i
function parallelUnitCapacityCoverage(
  quantities: Record<string, number>,
  demandM3h: number,
): { sum: number; count: number } | null {
  if (!(demandM3h > 0)) return null
  let sum = 0
  let count = 0
  for (const [k, v] of Object.entries(quantities)) {
    if (!Number.isFinite(v) || v <= 0) continue
    if (!PARALLEL_UNIT_CAPACITY_KEY_RE.test(k)) continue
    sum += v
    count += 1
  }
  if (count < 2) return null
  if (Math.abs(sum - demandM3h) / demandM3h > 0.05) return null
  return { sum, count }
}
/** True when a demand echo is already covered by brief-stated parallel unit capacities
 *  OR by an existing delivered pump-flow / synonym delivery capacity (±5%). */
function fluidDemandAlreadyCovered(
  quantities: Record<string, number>,
  demandKey: string,
  demandM3h: number,
): boolean {
  if (parallelUnitCapacityCoverage(quantities, demandM3h)) return true
  return Object.entries(quantities).some(([ok, ov]) => {
    if (ok === demandKey || !Number.isFinite(ov) || ov <= 0) return false
    if (FLUID_DEMAND_ECHO_RE.test(ok) || FLOW_ECHO_TOKEN_RE.test(ok)) return false
    // delivered pump flow OR a dosing/circulation capacity roll-up that is the plant delivery
    if (
      !DELIVERED_PUMP_FLOW_RE.test(ok) &&
      !/(irrigation|recirculation).*(m3_h|m3_hr|m3_per_hr)$/.test(ok) &&
      !/(fertigation|irrigation).*(capacity|total).*(m3_h|m3_hr|m3_per_hr)$/.test(ok)
    ) {
      return false
    }
    return Math.abs(ov - demandM3h) / demandM3h <= 0.05
  })
}
const DELIVERED_PUMP_FLOW_RE = /_(flow|throughput)_(m3_h|m3_hr|m3_per_hr)$/
const PUMP_POWER_KEY_RE = /_(motor_kw|motor_power_kw|power_kw|drive_kw|electrical_kw)$/
function demandKeyTokens(k: string): Set<string> {
  return new Set(String(k ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
}
/** Flow-only hydraulic motor estimate (kW) at the sensible default head — the SAME idiom the
 *  sub-assembly Drive Motor uses for a pump with no contract motor power (see motorKw). */
function hydraulicMotorKwForFlow(m3h: number): number {
  return Math.round(((m3h * FLOW_PUMP_DEFAULT_BAR) / (36 * FLOW_PUMP_EFF)) * 1000) / 1000
}

// ── rule-3 (service-loop flow publication) machinery — routed follow-up of the daed1aeab
// flow-demand join (Tristan 2026-07-02). The join sizes a fluid line from a quantity keyed
// on an ENDPOINT slug; these constants mirror its match surface. ──────────────────────────
// suffixes the ledger/topology join reads (derive-topology FLOW_QTY_SUFFIXES ∪
// connection_ledger._FLOW_QTY_SUFFIXES): any such key on an endpoint-slug prefix makes the
// endpoint join-visible — a second one would make the prefix AMBIGUOUS and null the join,
// so rule 3 mints ONLY for an endpoint with none.
const JOIN_VISIBLE_FLOW_RE = /_(throughput|flow|demand|capacity)_(m3_h|m3_per_hr)$/
// rule-3 mint suffix: join-visible (ends `_flow_m3_h`) but SKIPPED by buildGroups — a
// service-LINE duty describes a connection (a pipe), never an equipment group.
const SERVICE_LINE_FLOW_KEY_RE = /_line_flow_(m3_h|m3_hr|m3_per_hr)$/
// rule-3b delivered-flow SOURCE keys. An echo (…_demand_…) is never a source — rule 1
// already turns a demand into a delivered pump flow.
const DELIVERED_FLOW_SOURCE_RE = /_(flow|throughput|capacity|delivery)_(m3_h|m3_hr|m3_per_hr)$/
const FLOW_ECHO_TOKEN_RE = /(^|_)(demand|required|requested|target|setpoint)(_|$)/
// name tokens that carry no endpoint identity (derive-topology GENERIC_FLOW_TOKENS + the
// module/bank/plant fillers): a rule-3b mint must be decided by a DISTINCTIVE token only
// (f9dfc2918 discipline — generic tokens never decide).
const GENERIC_ENDPOINT_TOKENS = new Set([
  'pump', 'tank', 'vessel', 'filter', 'water', 'system', 'unit', 'skid', 'motor',
  'line', 'pipe', 'main', 'process', 'supply', 'module', 'bank', 'plant',
  // measure words — every flow-source key carries one; they must never decide a match
  'flow', 'throughput', 'capacity', 'delivery', 'control',
  // structural stream nouns — a manifold/outlet/inlet is WHAT the part is, not WHOSE
  // stream it carries; only the stream identity token (permeate/drain/…) may decide
  'manifold', 'outlet', 'inlet', 'header', 'nozzle',
])
// PROCESS vessel / boundary nouns eligible for a rule-3b service-line duty. A pump /
// blower / compressor / fan is a fluid MOVER — its delivery is rules 1–2, never 3b; a
// VALVE is an INLINE device (it sits ON a line, it is not a stream endpoint).
const PROCESS_STREAM_NOUN_RE =
  /\b(tanks?|vessels?|sumps?|basins?|silos?|reservoirs?|cisterns?|clarifiers?|filters?|softeners?|skids?|columns?|towers?|membranes?|outlets?|inlets?|manifolds?|separators?|drums?)\b/i
const FLUID_MOVER_NOUN_RE = /\b(pumps?|blowers?|compressors?|fans?|valves?)\b/i
// CIP recirculation turnover: one cleaning-solution charge (the one-charge rule, 27888aeff)
// turned over in 20–30 min industry practice; 30 min = the conservative low end.
const CIP_RECIRC_TURNOVER_MIN = 30
const slugifyEndpointName = (name: unknown): string =>
  String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const depluralToken = (t: string): string => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)

// ═══ WORKBOOK COMPLIANCE-MATCHER MIRROR (rule-4 mint-GATING only) ═══════════════════════
// A faithful TS mirror of build-excel-export.py::_match_quantity (+ _unit_family /
// _norm_qty_name / _ECHO_SUFFIXES / _QTY_STOP_TOKENS) used ONLY to decide whether a brief
// target metric ALREADY has a verifiable DELIVERED contract quantity — when it does, rule 4
// mints nothing. It never scores compliance: the deterministic floor + the workbook still
// import the real python matcher (agreement-by-construction, a503acdde). Mirror drift is
// SAFE in both directions: a false-"matched" skips a mint (the row stays honest
// UNVERIFIED); a false-"unmatched" mints a redundant delivered quantity (still honest —
// its value derives from the design, never from the target).
export interface BriefTargetMetric {
  key_metric?: string
  metric?: string
  name?: string
  value?: unknown
  unit?: string
  category?: string
}
const MATCHER_ECHO_SUBSTRINGS = ['_requested', '_request', '_target', '_demand', '_brief', '_spec'] as const
const MATCHER_NAME_UNIT_SUFFIX_RE =
  /_(kwh|mwh|gwh|wh|kw|mw|gw|w|kva|mva|kv|mv|v|ka|ma|a|percent|pct|cycles?|kg|t|m2|m3|c)$/
const MATCHER_STOP_TOKENS = new Set([
  'the', 'of', 'per', 'system', 'total', 'design', 'rated', 'nominal',
  'm3', 'm2', 'm', 'l', 'hr', 'h', 'hour', 'hrs', 'min', 'mins', 'sec', 's', 'day', 'yr', 'year',
  'kw', 'mw', 'gw', 'w', 'kwh', 'mwh', 'gwh', 'wh', 'kg', 'kt', 't', 'g', 'v', 'kv', 'a', 'ka', 'ma',
  'bar', 'pa', 'kpa', 'mpa', 'psi', 'c', 'k', 'pct', 'percent', 'mm', 'cm', 'km', 'nm', 'ppm',
  'capacity', 'throughput', 'flow', 'rate', 'demand', 'output', 'volume', 'duty', 'load',
])
const MATCHER_UNIT_FAMILY: Record<string, string> = {
  tpy: 't_per_yr', 't/yr': 't_per_yr', 't/y': 't_per_yr', 'tonnes/yr': 't_per_yr',
  'tonne/yr': 't_per_yr', 'te/yr': 't_per_yr', 'kg/yr': 't_per_yr',
  m3: 'volume_m3', litre: 'volume_m3', l: 'volume_m3', litres: 'volume_m3',
  'm3/h': 'flow_m3h', 'm3/hr': 'flow_m3h', m3perhr: 'flow_m3h', 'm3/hour': 'flow_m3h',
  m3ph: 'flow_m3h', 'l/h': 'flow_m3h', lph: 'flow_m3h', 'l/s': 'flow_m3h', lps: 'flow_m3h',
  count: 'count', nr: 'count', no: 'count', qty: 'count', ea: 'count', off: 'count',
  pcs: 'count', pieces: 'count', '#': 'count',
  'kg/m3': 'density', 'g/l': 'density',
  days: 'time_days', day: 'time_days', d: 'time_days', hr: 'time_days', hours: 'time_days', h: 'time_days',
  kg: 'mass_kg', g: 'mass_kg', t: 'mass_kg', tonne: 'mass_kg', tonnes: 'mass_kg',
  wh: 'energy_kwh', kwh: 'energy_kwh', mwh: 'energy_kwh', gwh: 'energy_kwh',
  w: 'power_kw', kw: 'power_kw', mw: 'power_kw', gw: 'power_kw',
  v: 'voltage_v', kv: 'voltage_v', mv: 'voltage_v',
  a: 'current_a', ka: 'current_a', ma: 'current_a',
  c: 'temp_c', degc: 'temp_c', celsius: 'temp_c',
  ratio: 'ratio', '': 'ratio', '-': 'ratio',
}
function matcherUnitFamily(unit: unknown): string {
  const u = String(unit ?? '').trim().toLowerCase().replace(/ /g, '')
    .replace(/³/g, '3').replace(/²/g, '2').replace(/\^/g, '').replace(/·/g, '.')
    .replace(/μ/g, 'u').replace(/°/g, '')
  return MATCHER_UNIT_FAMILY[u] ?? '?' + u
}
function matcherNormName(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(MATCHER_NAME_UNIT_SUFFIX_RE, '')
}
/** letters-only identity tokens of a NORMED name, minus the matcher's stop tokens. */
function matcherIdentityTokens(normed: string): Set<string> {
  return new Set((normed.match(/[a-z]+/g) ?? []).filter((t) => !MATCHER_STOP_TOKENS.has(t)))
}
const MATCHER_COUNT_KEY_RE = /(?:_|^)(?:count|qty|number|nr)$/
const MATCHER_COUNT_NOUN_RE =
  /^(?:valves?|containers?|vials?|units?|drums?|modules?|racks?|cells?|tanks?|pumps?|bags?|cartridges?|elements?|skids?|trains?)$/
/** the metric's unit family AFTER the matcher's count-noun promotion. */
function matcherMetricFamily(metric: BriefTargetMetric, bKey: string): string {
  let bFam = matcherUnitFamily(metric.unit ?? '')
  const unitRaw = String(metric.unit ?? '').trim().toLowerCase()
  if (bFam.startsWith('?') && (MATCHER_COUNT_KEY_RE.test(bKey) || MATCHER_COUNT_NOUN_RE.test(unitRaw))) bFam = 'count'
  return bFam
}
/** true ⇢ _match_quantity would return a match for this metric over these contract
 *  quantities (name+unit-family arithmetic — no values compared, no scoring). */
function matcherWouldVerify(
  metric: BriefTargetMetric,
  contractQuantities: Record<string, unknown>,
): boolean {
  const bKey = String(metric.key_metric ?? metric.metric ?? metric.name ?? '').toLowerCase().trim()
  if (!bKey) return true // unnamed metric — nothing a mint could ever verify
  const bFam = matcherMetricFamily(metric, bKey)
  const bNorm = matcherNormName(bKey)
  const bTokens = matcherIdentityTokens(bNorm)
  const famOk = (aFam: string, qname: string): boolean => {
    if (aFam === bFam) return true
    if (bFam === 'count') {
      return (aFam === 'count' || aFam === 'ratio' || aFam.startsWith('?')) &&
        /(count|qty|number|_nr|valves?|containers?|units?)$/.test(qname.toLowerCase())
    }
    return false
  }
  const need = Math.max(1, Math.floor((bTokens.size + 1) / 2))
  for (const [qname, qv] of Object.entries(contractQuantities)) {
    if (!qv || typeof qv !== 'object') continue
    const ql = qname.toLowerCase()
    const aVal = Number((qv as { value?: unknown }).value)
    if (!Number.isFinite(aVal)) continue
    if (!famOk(matcherUnitFamily((qv as { unit?: unknown }).unit), qname)) continue
    if (ql === bKey || matcherNormName(qname) === bNorm) return true // (1) exact name ALWAYS wins

    if (MATCHER_ECHO_SUBSTRINGS.some((e) => ql.includes(e))) continue
    
    let overlap = 0
    for (const t of matcherIdentityTokens(matcherNormName(ql))) if (bTokens.has(t)) overlap += 1
    if (overlap >= need) return true // (2) token-overlap path
  }
  return false
}
// brief-metric qualifier tokens (peak/max framing) — excluded from a rule-4 mint's
// identity core; echo words are excluded too so the minted NAME can never read as an echo.
const METRIC_QUALIFIER_TOKENS = new Set([
  'max', 'maximum', 'peak', 'min', 'minimum', 'mean', 'average', 'avg',
  'demand', 'required', 'requested', 'target', 'setpoint', 'request', 'brief', 'spec',
])

export interface DemandCoverageMint { key: string; value: number; unit: string; from: string }

export interface DemandCoverageOpts {
  /** design words — enables rule 3 (service-loop flow publication keyed on endpoint slugs) */
  modules?: ModuleLike[]
  /** parsed-brief target_performance.metrics — enables rule 4 (brief-metric delivery coverage) */
  briefMetrics?: BriefTargetMetric[]
}

/** Mint the DELIVERED supply-pump quantities every fluid-delivery demand implies (rule 1),
 *  the motor floor every pump-named flow family implies (rule 2), the SERVICE-LOOP line
 *  flows the topology join needs (rule 3 — when `opts.modules` is given), and the delivered
 *  quantity every brief target metric needs to verify (rule 4 — when `opts.briefMetrics` is
 *  given) — see the block comments. Mutates `quantities` in place (feeding buildGroups)
 *  and, when `contract` is given, persists each mint to `contract.quantities` with
 *  'demand-coverage' provenance. NEVER overwrites an existing quantity; NEVER fabricates
 *  where no engineering basis exists (the honest-UNVERIFIED path stays red). Returns the
 *  mints (empty = byte-identical no-op). */

/**
 * T-18 — mint a design-decision row when N+1 backup counts exist.
 *
 * @description If any quantity key matching `/_backup_count$/` has value ≥ 1, push
 *   `RULE_N_PLUS_1_STANDBY` onto `contract.design_decisions` so Excel's design-decisions
 *   register explains intentional standby redundancy (Sam Green / Exec J28: "why is it
 *   providing double capacity?"). Idempotent — never duplicates the same id.
 * @param quantities Flat numeric quantity map (post rule-9 backup mint).
 * @param contract Optional contract sink; when absent this is a pure no-op.
 * @returns true when a new decision was pushed (or one already existed).
 */
export function mintNPlus1StandbyDesignDecision(
  quantities: Record<string, number>,
  contract?: ContractInProgress,
): boolean {
  if (!contract) return false
  const backupKeys = Object.keys(quantities).filter((k) => {
    if (!/_backup_count$/.test(k)) return false
    const v = quantities[k]
    return Number.isFinite(v) && v >= 1
  })
  if (backupKeys.length === 0) return false
  const loose = contract as ContractInProgress & {
    design_decisions?: Array<Record<string, unknown>>
    designDecisions?: Array<Record<string, unknown>>
  }
  const sink: Array<Record<string, unknown>> =
    loose.design_decisions ?? loose.designDecisions ?? (loose.design_decisions = [])
  if (!loose.design_decisions) loose.design_decisions = sink
  if (sink.some((d) => String(d?.id ?? '') === 'RULE_N_PLUS_1_STANDBY')) return true
  const stems = backupKeys.map((k) => k.replace(/_backup_count$/, '').replace(/_/g, ' '))
  const totalBackup = backupKeys.reduce((s, k) => s + Math.round(quantities[k]), 0)
  sink.push({
    id: 'RULE_N_PLUS_1_STANDBY',
    module: 'mass_fluid_transport_process',
    sub_module_id: 'distribution',
    word_id: backupKeys[0],
    word_name: stems[0] || 'backup pump',
    kind: 'n_plus_1_redundancy',
    conflicting_values: backupKeys.map((k) => `${k}=${quantities[k]}`),
    explanation:
      `N+1 standby redundancy is intentional: ${totalBackup} labelled BACKUP / STANDBY ` +
      `unit(s) (${stems.join('; ')}) mirror the duty movers so a single zone failure does ` +
      `not halt continuous process delivery. This is NOT unexplained double capacity.`,
    why_it_matters:
      'Without this decision on the register, a reviewer reading duty+backup totals as ' +
      '"double the required capacity" will reject the design as oversizing. The real ' +
      'Codema P&ID labels each pump unit with a backup pump for the same reason.',
    recommendation:
      'Keep the BACKUP / STANDBY units; treat them as N+1 standby (RULE_N_PLUS_1_STANDBY), ' +
      'not as additional continuous duty. Confirm fail-over philosophy with the client.',
    recommended_value: 'N+1 standby (intentional redundancy)',
    generated_by: 'universal-contract-sizing:mintNPlus1StandbyDesignDecision',
    generated_at: 'deterministic',
  })
  return true
}

export function mintDemandCoverage(
  quantities: Record<string, number>,
  contract?: ContractInProgress,
  opts?: DemandCoverageOpts,
): DemandCoverageMint[] {
  const minted: DemandCoverageMint[] = []
  // LIVE existence check over the current map (a rule-1 mint is visible to rule 2 — the
  // irrigation family never double-mints a _power_kw beside its fresh _motor_kw).
  const familyKeyExists = (famTokens: string[], suffixRe: RegExp, requirePumpToken: boolean): boolean => {
    for (const k of Object.keys(quantities)) {
      if (!suffixRe.test(k)) continue
      const kt = demandKeyTokens(k)
      if (requirePumpToken && !kt.has('pump')) continue
      if (famTokens.every((t) => kt.has(t))) return true
    }
    return false
  }
  const mint = (key: string, value: number, unit: string, family: string, from: string, detail: string): void => {
    if (Object.prototype.hasOwnProperty.call(quantities, key)) return // NEVER overwrite an existing quantity
    quantities[key] = value
    minted.push({ key, value, unit, from })
    if (contract) {
      const cq = ((contract as { quantities?: Record<string, unknown> }).quantities ??= {}) as Record<string, unknown>
      if (cq[key] === undefined) {
        cq[key] = {
          value,
          unit,
          family,
          basis: 'rated',
          scope: 'system',
          source: 'demand-coverage',
          lineage: { from: [from], via: 'demand-coverage' },
          source_detail: detail,
        }
      }
    }
  }
  // ── rule 1: fluid-delivery demand echo → delivered supply-pump pair ──────────────────
  for (const k of Object.keys(quantities)) {
    const v = quantities[k]
    if (!Number.isFinite(v) || v <= 0) continue
    const m = FLUID_DEMAND_ECHO_RE.exec(k)
    if (!m) continue
    if (/(^|_)(calc|computed)_/i.test(k)) continue // collision-shadow — never a mint source
    // a rule-4b-exact brief-key ALIAS is shaped like a demand echo (…_demand_m3_per_hr)
    // so the compliance matrix can exact-match it, but it is NOT a missing pump family —
    // it restates an already-delivered system flow. Re-minting a phantom
    // peak_circulation_pump_* from it on the next pass is the regression this guards.
    const cqNow = (contract as { quantities?: Record<string, unknown> } | undefined)?.quantities
    const cqDetail = String((cqNow?.[k] as { source_detail?: unknown } | undefined)?.source_detail ?? '')
    if (/exact brief-key alias/.test(cqDetail)) continue
    // same discipline without relying on provenance text: if ANY non-echo delivered
    // system flow already equals this demand (±5%), OR brief-stated parallel unit
    // capacities sum to the demand, the demand is covered — no new plant-total pump.
    if (fluidDemandAlreadyCovered(quantities, k, v)) continue
    const stemPhrase = k.slice(0, m.index)
    if (!stemPhrase) continue
    if (isPureAggregatePhrase(stemPhrase)) continue // a total/overall roll-up is not one pumped train
    if (significantStems(stemPhrase).length === 0) continue // no engineering identity → no group could anchor
    const famTokens = [...demandKeyTokens(stemPhrase)]
    const pumpBase = /(^|_)pump$/.test(stemPhrase) ? stemPhrase : `${stemPhrase}_pump`
    if (!familyKeyExists(famTokens, DELIVERED_PUMP_FLOW_RE, true)) {
      mint(`${pumpBase}_flow_m3_h`, v, 'm3/h', 'flow_rate', k,
        `demand-coverage: delivered supply-pump flow = the ${k} demand (${v} m³/h) — no pump-sizing tool covered this demand family this run`)
    }
    if (!familyKeyExists(famTokens, PUMP_POWER_KEY_RE, true)) {
      mint(`${pumpBase}_motor_kw`, hydraulicMotorKwForFlow(v), 'kW', 'power', k,
        `demand-coverage: hydraulic motor floor P = Q·ΔP/(36·η) @ ΔP = ${FLOW_PUMP_DEFAULT_BAR} bar, η = ${FLOW_PUMP_EFF}, from ${k} = ${v} m³/h (a sizing-tool value always wins when present)`)
    }
  }
  // ── rule 2: a pump-named flow family with no motor/power twin → deterministic floor ──
  // Minted as `<fam>_motor_kw` (NOT `_power_kw`): a `_motor_kw` key binds the Drive Motor /
  // VSD sub-assembly (motorKwFromContract) + the electrical feeder match, but forms NO
  // equipment group of its own (no SUFFIX_RULES entry) — so the pump word's PRIMARY rating
  // stays its grounded per-unit FLOW (the per-unit-duty convention the regression harness
  // pins: UNIVERSAL.principal_per_unit_duty_equals_total_over_count). A tool-emitted
  // `_power_kw` keeps its authority (and its kW-primary rendering) untouched.
  for (const k of Object.keys(quantities)) {
    const v = quantities[k]
    if (!Number.isFinite(v) || v <= 0) continue
    const m = DELIVERED_PUMP_FLOW_RE.exec(k)
    if (!m) continue
    if (/(^|_)(calc|computed)_/i.test(k)) continue
    const fam = k.slice(0, m.index)
    if (!fam || isPureAggregatePhrase(fam)) continue
    const famTokens = [...demandKeyTokens(fam)]
    if (!famTokens.includes('pump')) continue // liquid pump only — see the block comment
    if (familyKeyExists(famTokens, PUMP_POWER_KEY_RE, false)) continue
    mint(`${fam}_motor_kw`, hydraulicMotorKwForFlow(v), 'kW', 'power', k,
      `demand-coverage: hydraulic motor floor P = Q·ΔP/(36·η) @ ΔP = ${FLOW_PUMP_DEFAULT_BAR} bar, η = ${FLOW_PUMP_EFF}, from ${k} = ${v} m³/h (a sizing-tool value always wins when present)`)
  }
  // ── rule 3: SERVICE-LOOP FLOW PUBLICATION (the daed1aeab routed follow-up — Tristan
  // 2026-07-02). The flow-demand join sizes a fluid line from a quantity keyed on an
  // ENDPOINT slug; on v52, 23/45 Line & Velocity rows had NO derivable flow on either
  // endpoint because the CIP / cleaning / drain / service-train loops never publish one.
  // Publish them HERE (the same choke point, both synthesis paths) where a stated
  // engineering basis exists — NEVER fabricate:
  //   3a. a CLEANING-ROLE vessel word (Cip/Cleaning Tank — the one-charge rule's noun
  //       tests, 27888aeff) recirculates ONE cleaning charge per CIP_RECIRC_TURNOVER_MIN
  //       → <slug>_line_flow_m3_h = charge × 60/turnover. Gated on the plant having a
  //       nonzero hourly design flow (no flow → no CIP duty to state).
  //   3b. a PROCESS vessel / boundary word (tank / sump / filter / softener / outlet /
  //       manifold …, never a pump/blower — those are rules 1–2) with NO join-visible
  //       flow key takes the delivered flow of EXACTLY ONE pre-existing quantity sharing
  //       a DISTINCTIVE name token (f9dfc2918: generic tokens never decide; ≥2 candidate
  //       keys → NO mint, the honest-UNVERIFIED path reports the line): a drain sump/tank
  //       takes its drain-TRANSFER pump's duty (the flow that fills/empties it), the
  //       softener vessel + GAC filter take the softener-train throughput, the permeate
  //       outlet takes the RO permeate capacity.
  // The `_line_flow_m3_h` suffix is deliberate: join-visible (ends `_flow_m3_h`) but
  // SKIPPED by buildGroups — a line duty describes a CONNECTION, never equipment, so it
  // can neither mint a phantom principal nor resize the vessel it names. A manifold with
  // no basis of its own stays null — its edges join via the partner endpoint's quantity.
  const mods = opts?.modules ?? []
  if (mods.length > 0) {
    // sources + the plant design flow come from the PRE-rule-3 key set: rule-3 mints must
    // never chain off each other (a second pass sees its own mints only as existing keys).
    const preKeys = Object.keys(quantities)
    const flowSourceKeys = preKeys.filter((k) => {
      const v = quantities[k]
      // a prior-pass `_line_flow` mint is a PIPE duty, never a train delivery — excluding
      // it keeps rule 3 idempotent (pass 2 must not chain new endpoints off pass 1's mints)
      return Number.isFinite(v) && v > 0 && DELIVERED_FLOW_SOURCE_RE.test(k) &&
        !FLOW_ECHO_TOKEN_RE.test(k) && !SERVICE_LINE_FLOW_KEY_RE.test(k)
    })
    let maxHourlyFlow = 0
    for (const k of preKeys) {
      const v = quantities[k]
      if (Number.isFinite(v) && v > 0 && /_m3_h$|_m3_per_hr$/.test(k)) maxHourlyFlow = Math.max(maxHourlyFlow, v)
    }
    const joinVisibleFlowExists = (slug: string): boolean =>
      Object.keys(quantities).some((k) => k.startsWith(slug + '_') && JOIN_VISIBLE_FLOW_RE.test(k))
    const seenSlugs = new Set<string>()
    for (const m of mods) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
      if (isInstrument(w) || isSubcomponent(w)) continue
      const name = w.name_human ?? w.content_character?.name_human ?? ''
      const slug = slugifyEndpointName(name)
      if (!slug || seenSlugs.has(slug)) continue
      seenSlugs.add(slug)
      const roleTxt = wordRoleText(w)
      // 3a — CIP / cleaning recirculation duty (charge basis, not token-share)
      if (isCleaningRolePhrase(roleTxt) && CLEANING_VESSEL_NOUN_RE.test(roleTxt)) {
        if (maxHourlyFlow <= 0 || joinVisibleFlowExists(slug)) continue
        const charge = cleaningChargeM3(quantities)
        const recirc = Math.round(charge * (60 / CIP_RECIRC_TURNOVER_MIN) * 100) / 100
        mint(`${slug}_line_flow_m3_h`, recirc, 'm3/h', 'flow_rate', '(cip one-charge rule)',
          `demand-coverage: CIP recirculation duty — one cleaning-solution charge (${charge} m³, the one-charge rule: ~15% of the plant hourly design flow bounded 0.5–2 m³) turned over in ${CIP_RECIRC_TURNOVER_MIN} min → ${recirc} m³/h service-line flow for ${name}`)
        continue
      }
      // 3b — vessel / boundary service duty from the unique distinctive-token family
      if (!PROCESS_STREAM_NOUN_RE.test(name) || FLUID_MOVER_NOUN_RE.test(name)) continue
      if (joinVisibleFlowExists(slug)) continue
      const distinctive = slug.split('_')
        .filter((t) => t.length >= 2 && !GENERIC_ENDPOINT_TOKENS.has(t))
        .map(depluralToken)
      if (distinctive.length === 0) continue // a generic-only name never decides (f9dfc2918)
      const cands: Array<{ key: string; value: number }> = []
      for (const k of flowSourceKeys) {
        // tokenise the key's BASE (suffix stripped): flow/throughput/m3/h suffix tokens
        // appear on every source key and must never decide a match.
        const ktoks = new Set(k.replace(DELIVERED_FLOW_SOURCE_RE, '').split('_').map(depluralToken))
        if (distinctive.some((t) => ktoks.has(t))) cands.push({ key: k, value: quantities[k] })
      }
      if (cands.length !== 1) continue // 0 = no basis (honest null); ≥2 = ambiguous → never a guess
      mint(`${slug}_line_flow_m3_h`, cands[0].value, 'm3/h', 'flow_rate', cands[0].key,
        `demand-coverage: service-line duty for ${name} = ${cands[0].key} (${cands[0].value} m³/h) — the one delivered flow in this endpoint's distinctive-token family (the duty that serves/fills/drains it)`)
    }
  }
  // ── rule 4: BRIEF-METRIC DELIVERY COVERAGE (Tristan issue 4 — codema v52 floor=5). Every
  // brief target_performance metric must end with a DELIVERED contract quantity the workbook
  // matcher verifies, or stay honestly UNVERIFIED. v52: `total_cultivation_containers`
  // (6,000 trays — the unit-noun 'trays' is outside the matcher's count-noun promotion, so
  // the design's cultivation_container_count could never verify it) and
  // `max_irrigation_demand_per_department` (45 m³/h — the delivered irrigation_pump_flow
  // shares only ONE identity token with the metric, below the matcher's ≥half threshold)
  // both sat UNVERIFIED → deterministic brief_compliance floor 5. The mints derive from the
  // DESIGN's own quantities — never a bare echo of the target — so a genuine shortfall
  // still reads FAIL (honest-scoring principle):
  //   4a COUNT family (an unknown-unit count noun, e.g. 'trays'): the design's ONE
  //      count-suffixed quantity in the metric's token family (cultivation_container_count,
  //      itself carried with its structural factorisation) is re-published in the metric's
  //      unit so the matcher's unit-family gate can see it.
  //   4b FLOW family (m³/h): the ONE delivered flow in the metric's identity-token family,
  //      divided by the per-share count when the metric is a `…_per_<noun>` target (shares
  //      = system demand echo ÷ per-share target, accepted only when near-integer).
  // No candidate / ambiguous candidates / any other unit family → NO mint (honest red).
  const briefMetrics = opts?.briefMetrics ?? []
  const cq = (contract as { quantities?: Record<string, unknown> } | undefined)?.quantities
  if (briefMetrics.length > 0 && cq) {
    for (const met of briefMetrics) {
      const bKey = String(met?.key_metric ?? met?.metric ?? met?.name ?? '').toLowerCase().trim()
      const target = Number(met?.value)
      if (!bKey || !Number.isFinite(target) || target <= 0) continue
      if (matcherWouldVerify(met, cq)) continue // already ends in a verifiable delivered quantity
      const bFam = matcherMetricFamily(met, bKey)
      const bTokens = matcherIdentityTokens(matcherNormName(bKey))
      if (bTokens.size === 0) continue
      const need = Math.max(1, Math.floor((bTokens.size + 1) / 2))
      const bTokensDepl = new Set([...bTokens].map(depluralToken))
      const overlapDepl = (k: string): number => {
        let n = 0
        for (const t of new Set((k.toLowerCase().match(/[a-z]+/g) ?? []).map(depluralToken))) {
          if (bTokensDepl.has(t)) n += 1
        }
        return n
      }
      const unitNoun = bFam.startsWith('?') ? bFam.slice(1) : ''
      if (bFam !== 'count' && unitNoun && /^[a-z]{2,}$/.test(unitNoun)) {
        // ── 4a: count-noun family ('trays' / any noun the matcher can't promote) ────────
        const cands: Array<{ key: string; value: number }> = []
        for (const [k, qv] of Object.entries(cq)) {
          if (!qv || typeof qv !== 'object') continue
          if (!/_(count|qty|number|nr)$/.test(k)) continue
          const kl = k.toLowerCase()
          if (MATCHER_ECHO_SUBSTRINGS.some((e) => kl.includes(e))) continue
          const v = Number((qv as { value?: unknown }).value)
          if (!Number.isFinite(v) || v <= 0) continue
          if (overlapDepl(k) >= need) cands.push({ key: k, value: v })
        }
        if (cands.length !== 1) continue // no structural basis, or two families → honest red
        const base = cands[0].key.replace(/_(count|qty|number|nr)$/, '')
        const srcDetail = String((cq[cands[0].key] as { source_detail?: unknown })?.source_detail ?? '')
        mint(`${base}_served_${unitNoun}`, cands[0].value, String(met.unit ?? unitNoun), 'count', cands[0].key,
          `demand-coverage: delivered served-position count for brief metric ${bKey} = the design's ${cands[0].key} (${cands[0].value}), expressed in the metric's unit '${unitNoun}' so the compliance matrix can verify it${srcDetail ? ` — structural basis: ${srcDetail}` : ''}`)
      } else if (bFam === 'flow_m3h') {
        // ── 4b: flow family, incl. per-share (…_per_<noun>) targets ─────────────────────
        const perIdx = bKey.indexOf('_per_')
        const headKey = perIdx >= 0 ? bKey.slice(0, perIdx) : bKey
        const perNoun = perIdx >= 0 ? bKey.slice(perIdx + 5).replace(/[^a-z0-9_]/g, '') : ''
        const core = [...matcherIdentityTokens(matcherNormName(headKey))]
          .filter((t) => !METRIC_QUALIFIER_TOKENS.has(t))
        const coreDepl = new Set(core.map(depluralToken))
        const shares1 = (k: string): boolean => {
          for (const t of new Set((k.toLowerCase().match(/[a-z]+/g) ?? []).map(depluralToken))) {
            if (coreDepl.has(t)) return true
          }
          return false
        }
        const flowCands: Array<{ key: string; value: number }> = []
        const echoCands: Array<{ key: string; value: number }> = []
        for (const [k, qv] of Object.entries(cq)) {
          if (!qv || typeof qv !== 'object') continue
          const v = Number((qv as { value?: unknown }).value)
          if (!Number.isFinite(v) || v <= 0) continue
          const isFlow = matcherUnitFamily((qv as { unit?: unknown }).unit) === 'flow_m3h' ||
            /_(m3_h|m3_hr|m3_per_hr)$/.test(k)
          if (!isFlow) continue
          const kl = k.toLowerCase()
          const isEcho = MATCHER_ECHO_SUBSTRINGS.some((e) => kl.includes(e)) || FLOW_ECHO_TOKEN_RE.test(kl)
          if (isEcho) {
            if (core.length > 0 && shares1(k)) echoCands.push({ key: k, value: v })
            continue
          }
          if (SERVICE_LINE_FLOW_KEY_RE.test(k)) continue
          if (core.length > 0 && shares1(k)) flowCands.push({ key: k, value: v })
        }
        // identity path: ONE delivered flow sharing the metric's subject tokens
        if (flowCands.length === 1 && core.length > 0) {
          let shares = 1
          let sharesBasis = ''
          if (perNoun) {
            if (echoCands.length !== 1) continue // per-share split needs the ONE system demand echo
            const raw = echoCands[0].value / target
            shares = Math.round(raw)
            if (!(shares >= 1 && Math.abs(raw - shares) <= 0.05)) continue // not a clean share split
            sharesBasis = ` ÷ ${shares} ${perNoun}s (system ${echoCands[0].key} = ${echoCands[0].value} m³/h = ${shares} × the ${target} m³/h per-${perNoun} target)`
          }
          const val = Math.round((flowCands[0].value / shares) * 1000) / 1000
          const mintKey = perNoun
            ? `${core.join('_')}_per_${perNoun}_delivered_m3_h`
            : `${core.join('_')}_delivered_m3_h`
          // the minted NAME must itself clear the matcher's overlap threshold, or it can
          // never verify the metric — then minting it would be pointless clutter.
          if (matcherIdentityTokens(matcherNormName(mintKey)).size > 0 && overlapDepl(mintKey) >= need) {
            mint(mintKey, val, 'm3/h', 'flow_rate', flowCands[0].key,
              `demand-coverage: delivered flow for brief metric ${bKey} = ${flowCands[0].key} (${flowCands[0].value} m³/h)${sharesBasis} — derives from the design's delivered quantity, never the target (a genuine shortfall stays a FAIL)`)
          }
          continue
        }
        // ── 4b-exact: brief-key ALIAS when identity tokens don't hit a delivered flow ──
        // Codema peak_circulation_demand_m3_per_hr: identity = {circulation} but the
        // design publishes irrigation_pump_flow_m3_h = 225 — no shared subject token, so
        // 4b above stays empty and Exec Summary stays UNVERIFIED. Mint under the EXACT
        // brief key (matcherWouldVerify exact-name path) from a preferred system-scale
        // delivery flow. Never fabricate from dosing/CIP micro-flows or multi-ambiguous
        // system flows. BESS/SAF/CO₂ (no preferred keys) → strict no-op.
        if (Object.prototype.hasOwnProperty.call(quantities, bKey)) continue
        const PREFERRED_SYS_FLOW_RE =
          /(irrigation|recirculation|circulation).*(m3_h|m3_hr|m3_per_hr)$|(^|_)(irrigation_pump_flow|recirculation_flow)(_|$)/
        const preferred: Array<{ key: string; value: number }> = []
        const allSys: Array<{ key: string; value: number }> = []
        for (const [k, qv] of Object.entries(cq)) {
          if (!qv || typeof qv !== 'object') continue
          const v = Number((qv as { value?: unknown }).value)
          if (!Number.isFinite(v) || v <= 0) continue
          const isFlow = matcherUnitFamily((qv as { unit?: unknown }).unit) === 'flow_m3h' ||
            /_(m3_h|m3_hr|m3_per_hr)$/.test(k)
          if (!isFlow) continue
          const kl = k.toLowerCase()
          if (MATCHER_ECHO_SUBSTRINGS.some((e) => kl.includes(e)) || FLOW_ECHO_TOKEN_RE.test(kl)) continue
          if (SERVICE_LINE_FLOW_KEY_RE.test(k)) continue
          if (v < target * 0.5) continue // system-scale only — never a dosing/CIP micro-flow
          allSys.push({ key: k, value: v })
          if (PREFERRED_SYS_FLOW_RE.test(kl)) preferred.push({ key: k, value: v })
        }
        let src: { key: string; value: number } | null = null
        if (preferred.length === 1) src = preferred[0]
        else if (preferred.length > 1) {
          // take the unique maximum if one preferred dominates; else honest red
          preferred.sort((a, b) => b.value - a.value)
          if (preferred[0].value > preferred[1].value) src = preferred[0]
        } else if (allSys.length === 1) {
          src = allSys[0]
        }
        if (!src) continue
        mint(bKey, src.value, String(met.unit ?? 'm3/h'), 'flow_rate', src.key,
          `demand-coverage: exact brief-key alias for ${bKey} = the design's ${src.key} (${src.value} m³/h) so the compliance matrix can verify by exact name — derives from the delivered system flow, never the target (a genuine shortfall stays a FAIL)`)
      }
    }
  }
  // ── rule 5: DISINFECTION-STAGE COVERAGE (gate-36 round 2 — the v54/v55-present,
  // v56/v56b-absent UV coin-flip; see the DISINFECTION-STAGE block comment). A POTABLE /
  // IRRIGATION / HYGIENE-critical water loop requires a disinfection stage. When (a) a
  // hygiene-critical signal exists in the contract keys or brief metrics, (b) NO
  // disinfection quantity family exists, and (c) NO disinfection word exists in the design,
  // mint the uv_disinfection_* quantities sized by the validated-dose rule (40 mJ/cm² at
  // the delivered hygiene flow ⇒ ~0.046 kWe/(m³/h)); buildGroups + the disinfection-stage
  // synthesisable rule then mint the principal in BOTH paths. An existing disinfection
  // WORD (v55's grounded UV unit) or quantity family (the calculator ran) suppresses the
  // mint entirely — grounded delivery always wins. No hygiene noun (BESS / SAF / CO₂) or
  // no delivered hygiene flow → strict byte-identical no-op (never fabricate).
  if (mods.length > 0) {
    const hygieneSignal =
      Object.keys(quantities).some((k) => HYGIENE_CRITICAL_RE.test(k)) ||
      briefMetrics.some((met) => HYGIENE_CRITICAL_RE.test(String(met?.key_metric ?? met?.metric ?? met?.name ?? '')))
    const disinfectionQtyExists = Object.keys(quantities).some((k) => isDisinfectionPhrase(k))
    if (hygieneSignal && !disinfectionQtyExists && !modulesHaveDisinfectionWord(mods)) {
      let flow = 0
      let flowKey = ''
      for (const [k, v] of Object.entries(quantities)) {
        if (!Number.isFinite(v) || v <= 0) continue
        if (!/_m3_h$|_m3_hr$|_m3_per_hr$/.test(k)) continue
        if (FLOW_ECHO_TOKEN_RE.test(k) || SERVICE_LINE_FLOW_KEY_RE.test(k) || /(^|_)(calc|computed)_/i.test(k)) continue
        if (!HYGIENE_CRITICAL_RE.test(k)) continue // size at the hygiene-critical delivery, not a stray duty
        if (v > flow) { flow = v; flowKey = k }
      }
      if (flow > 0) {
        const uvKw = Math.round(flow * UV_KW_PER_M3H * 10) / 10
        const doseDetail =
          `demand-coverage: disinfection-stage coverage — a hygiene-critical loop (${flowKey}) requires a ` +
          `disinfection stage; sized by the validated-dose rule (${UV_DOSE_MJ_CM2} mJ/cm² at the delivered ` +
          `${flow} m³/h ⇒ ~${UV_KW_PER_M3H} kWe per m³/h). Suppressed whenever a disinfection word or quantity already exists.`
        mint('uv_disinfection_throughput_m3_h', flow, 'm3/h', 'flow_rate', flowKey, doseDetail)
        mint('uv_disinfection_power_kw', uvKw, 'kW', 'power', flowKey, doseDetail)
        mint('uv_disinfection_count', 1, '', 'count', flowKey, doseDetail)
      }
    }
  }
  // ── rule 11: RECOVERY-SIDE OXYGEN / AERATION DOSING (T-24 / Sam Green SME —
  // fertigation-water-recycling reference graph: cloth/paperbelt filter + oxygen dosing
  // on the drainwater return). UNIVERSAL: a water plant with (a) a drain / recovery /
  // reclaim reservoir (volume or count key) AND (b) a recovery-conditioning filter
  // (cloth / paperbelt / recovery filter) OR an explicit recirculation/recovery loop
  // signal, but NO oxygen/aeration dosing quantity family yet, gets one metering
  // injector per recovery zone (count tracks the cloth-filter / drain-sump population).
  // Once-through plants (fresh storage only, no drain reservoir, no recovery filter) →
  // strict byte-identical no-op. Never fabricates LOX cones (those are RAS life-support;
  // this is a small ~40 L/h injector on the filtered return).
  {
    const r11Keys = Object.keys(quantities)
    const hasDrainReservoir = r11Keys.some((k) =>
      /(drain|recover|reclaim|recycl).*(tank|reservoir|storage).*(volume|count)|(tank|reservoir).*(drain|recover|reclaim|recycl).*(volume|count)/i.test(k)
      || /^drain_water_tank_/.test(k) || /^drainwater_/.test(k) || /_drain_water_tank_/.test(k))
    const hasRecoveryFilter = r11Keys.some((k) =>
      /(cloth|paperbelt|paper_belt|recovery).*(filter)|filter.*(cloth|paperbelt|recovery)/i.test(k))
    const hasRecircSignal = r11Keys.some((k) =>
      /(recircul|reclaim|recover|recycl|return_loop)/i.test(k))
    const hasOxygenDosing = r11Keys.some((k) =>
      /(oxygen|aeration)_dosing|dosing.*(oxygen|aerat)|oxygenat.*dos/i.test(k))
    if (hasDrainReservoir && (hasRecoveryFilter || hasRecircSignal) && !hasOxygenDosing) {
      // zone count: prefer cloth_filter_count → drain_collection_sump_count → drain_water_tank_count → 1
      let zoneN = 0
      let zoneFrom = ''
      for (const cand of [
        'cloth_filter_count', 'drain_collection_sump_count', 'drain_water_tank_count',
        'drainwater_reservoir_count',
      ]) {
        const v = quantities[cand]
        if (Number.isFinite(v) && v >= 1) { zoneN = Math.round(v); zoneFrom = cand; break }
      }
      if (zoneN < 1) {
        for (const k of r11Keys) {
          if (!/(cloth_filter|drain_collection_sump|drain_water_tank).*_count$/.test(k)) continue
          const v = quantities[k]
          if (Number.isFinite(v) && v >= 1 && v > zoneN) { zoneN = Math.round(v); zoneFrom = k }
        }
      }
      if (zoneN >= 1) {
        const detail =
          `demand-coverage: recovery-side oxygen dosing — drain/recovery reservoir + recovery ` +
          `conditioning (${zoneFrom || 'recovery signal'}) requires re-oxygenation of returned ` +
          `drainwater before the reservoir; ${zoneN} metering injector(s) (~40 L/h each), one per ` +
          `recovery zone. Suppressed when oxygen/aeration dosing already exists; once-through ` +
          `(no drain reservoir) is a no-op.`
        mint('oxygen_dosing_pump_throughput_m3_h', 0.04, 'm3/h', 'flow_rate', zoneFrom || 'recovery', detail)
        mint('oxygen_dosing_pump_power_kw', 0.04, 'kW', 'power', zoneFrom || 'recovery', detail)
        mint('oxygen_dosing_pump_count', zoneN, '', 'count', zoneFrom || 'recovery', detail)
      }
    }
  }
  // ── rule 6: STORAGE DELIVERY COVERAGE (gate-36 round 2 — the v56b storage 40-vs-120
  // false-RADICAL; see the STORAGE-DELIVERY block comment). Every brief STORAGE pin
  // (volume-family target metric whose name reads storage/tank/buffer) must be DELIVERED:
  // sum the design's storage-vessel principals in the pin's token family (capacity × qty;
  // cleaning/CIP vessels excluded — a cleaning charge is not brief storage); synthesise the
  // shortfall as real tank principals (`<core>_reserve_tank_volume_each_m3` + `_count` →
  // buildGroups mints the words in BOTH paths); and mint `<core>_delivered_m3` either way so
  // compliance + the benchmark diff the DELIVERED total, never a per-scope sibling. The
  // delivered value derives from the words (+ the synthesised principals that WILL be
  // delivered) — never a bare echo of the target. No storage pin (BESS/SAF/CO₂) → no-op.
  if (mods.length > 0 && briefMetrics.length > 0) {
    for (const met of briefMetrics) {
      const bKey = String(met?.key_metric ?? met?.metric ?? met?.name ?? '').toLowerCase().trim()
      const target = Number(met?.value)
      if (!bKey || !Number.isFinite(target) || target <= 0) continue
      if (matcherUnitFamily(met?.unit ?? '') !== 'volume_m3') continue
      if (!STORAGE_METRIC_NOUN_RE.test(bKey.replace(/_/g, ' '))) continue
      const idTokens = [...matcherIdentityTokens(matcherNormName(bKey))]
        .filter((t) => !METRIC_QUALIFIER_TOKENS.has(t)).map(depluralToken)
      if (idTokens.length === 0) continue
      const core = idTokens.join('_')
      if (Object.prototype.hasOwnProperty.call(quantities, `${core}_delivered_m3`)) continue // idempotent (path 2 re-run)
      const items: string[] = []
      let delivered = 0
      let refEach = 0
      const countedWordTokSets: Set<string>[] = []
      for (const m of mods) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
        if (isInstrument(w) || isSubcomponent(w)) continue
        const name = String(w.name_human ?? '')
        if (!STORAGE_VESSEL_NOUN_RE.test(name)) continue
        if (isCleaningRolePhrase(wordRoleText(w))) continue
        const wToks = new Set((name.toLowerCase().match(/[a-z]+/g) ?? []).map(depluralToken))
        if (!idTokens.some((t) => wToks.has(t))) continue
        const wm = w.modifier_characters ?? []
        const capMod = wm.find((mc) => mc.kind === 'capacity' && /m³|m3/.test(`${mc.unit ?? ''} ${mc.value ?? ''}`))
        const each = capMod ? (parseFloat(String(capMod.value)) || 0) : 0
        if (!(each > 0)) continue
        const qtyMod = wm.find((mc) => mc.kind === 'quantity')
        const qn = qtyMod ? (parseInt(String(qtyMod.value).replace(/[^\d]/g, ''), 10) || 1) : 1
        delivered += each * qn
        refEach = Math.max(refEach, each)
        countedWordTokSets.push(wToks)
        items.push(`${name} ${qn}× ${each} m³`)
      }
      // QUANTITY-FAMILY DELIVERED STORAGE (the v56c phantom-reserve fix, 2026-07-03): at
      // this point in the pass a storage principal may exist ONLY as a contract quantity
      // family (`<stem>_volume_each_m3` + `<stem>_count`) — buildGroups mints its WORD
      // later in the SAME pass. v56c: fresh_water_tank (1× 40 m³) + drain_water_tank
      // (2× 40 m³) were quantity families with no words yet → the word-only sum read
      // "0 m³ delivered" → a phantom 120 m³ water_storage_reserve_tank was synthesised
      // ON TOP of the 120 m³ the design already delivers (the Quantities-tab 120×
      // same-role flag). Count each quantity family that (a) is a storage-vessel noun,
      // (b) shares an identity token with the pin, (c) is not a cleaning/CIP charge, and
      // (d) is not this rule's own reserve mint — unless a counted WORD already covers
      // the same family (grounded words stay the primary source; no double count).
      for (const [qk, qvv] of Object.entries(quantities)) {
        const qm = /^(.+)_volume_each_m3$/.exec(qk)
        if (!qm || !Number.isFinite(qvv) || qvv <= 0) continue
        const stem = qm[1]
        if (stem === `${core}_reserve_tank`) continue // never count our own mint
        const stemPhrase = stem.replace(/_/g, ' ')
        if (!STORAGE_VESSEL_NOUN_RE.test(stemPhrase)) continue
        if (isCleaningRolePhrase(stemPhrase)) continue
        const sToks = new Set((stemPhrase.toLowerCase().match(/[a-z]+/g) ?? []).map(depluralToken))
        if (!idTokens.some((t) => sToks.has(t))) continue
        // a counted word already covers this family (its tokens ⊇ the stem's) → skip
        if (countedWordTokSets.some((ws) => [...sToks].every((t) => ws.has(t)))) continue
        const cntRaw = quantities[`${stem}_count`]
        const qn = Number.isFinite(cntRaw) && cntRaw >= 1 ? Math.round(cntRaw) : 1
        delivered += qvv * qn
        refEach = Math.max(refEach, qvv)
        items.push(`${titleCase(stem)} ${qn}× ${qvv} m³ (contract quantity family)`)
      }
      const shortfall = target - delivered
      let mintedReserveM3 = 0
      if (shortfall >= Math.max(1, target * 0.02)) {
        // shortfall tanks at the family's grounded unit size (else one tank) — real principals,
        // synthesised by the normal buildGroups path, so the pin is DELIVERED, not asserted.
        const eachRef = refEach > 0 ? Math.min(refEach, shortfall) : shortfall
        const cnt = Math.max(1, Math.ceil(shortfall / eachRef - 1e-9))
        const each = Math.round((shortfall / cnt) * 100) / 100
        const reserveDetail =
          `demand-coverage: storage shortfall coverage for brief metric ${bKey} = ${target} m³ pinned − ` +
          `${Math.round(delivered * 100) / 100} m³ delivered by the design's storage vessels (${items.join(' + ') || 'none'}) → ` +
          `${cnt}× ${each} m³ reserve tank(s) synthesised so the pinned volume is DELIVERED (suppressed when the grounded words already deliver it)`
        mint(`${core}_reserve_tank_volume_each_m3`, each, 'm³', 'volume', bKey, reserveDetail)
        mint(`${core}_reserve_tank_count`, cnt, '', 'count', bKey, reserveDetail)
        mintedReserveM3 = each * cnt
        items.push(`${titleCase(`${core}_reserve_tank`)} ${cnt}× ${each} m³ (synthesised shortfall coverage)`)
      }
      const deliveredTotal = Math.round((delivered + mintedReserveM3) * 100) / 100
      if (deliveredTotal > 0) {
        mint(`${core}_delivered_m3`, deliveredTotal, 'm3', 'volume_m3', bKey,
          `demand-coverage: DELIVERED storage total for brief metric ${bKey} = ${items.join(' + ')} — ` +
          `sums the design's storage-vessel principals (capacity × qty), never the target echo, so a genuine shortfall stays visible`)
      }
    }
  }
  // ── rule 7: PER-UNIT × COUNT DELIVERED-TOTAL TWIN (gate-36 round 2 — the v56b
  // fertigation 45-vs-90 misread: fertigation_dosing_pump_throughput_m3_h = 45 PER UNIT with
  // fertigation_dosing_pump_count = 2 delivers 90 m³/h, but no key SAID so explicitly and a
  // reader (the benchmark net included) took the per-unit 45 as the system delivery). For a
  // per-unit rate key with a counted sibling (≥2), mint the explicit `<family>_total_m3_h`
  // twin with per-unit × count lineage — ONLY when the design already corroborates that
  // total in the same distinctive-token family (±2%): a duty/standby pair whose combined
  // flow is NOT the system delivery must never be restated as one (no new arithmetic claim,
  // only explicit lineage). No counted rate / no corroboration → no mint. ──
  {
    const r7Keys = Object.keys(quantities)
    for (const k of r7Keys) {
      const v = quantities[k]
      if (!Number.isFinite(v) || v <= 0) continue
      const m = /^(.+)_(throughput|flow|capacity|delivery)_(m3_h|m3_hr|m3_per_hr)$/.exec(k)
      if (!m) continue
      if (FLOW_ECHO_TOKEN_RE.test(k) || SERVICE_LINE_FLOW_KEY_RE.test(k) || /(^|_)(calc|computed)_/i.test(k)) continue
      const stem = m[1]
      if (isPureAggregatePhrase(stem) || /(^|_)(total|delivered)(_|$)/.test(stem)) continue
      const cnt = quantities[`${stem}_count`]
      if (!Number.isFinite(cnt) || cnt < 2 || Math.abs(cnt - Math.round(cnt)) > 1e-9) continue
      const total = Math.round(v * cnt * 1000) / 1000
      const distinctive = stem.split('_')
        .filter((t) => t.length >= 2 && !GENERIC_ENDPOINT_TOKENS.has(t)).map(depluralToken)
      if (distinctive.length === 0) continue
      const inFamily = (k2: string): boolean => {
        const kt = new Set(k2.split('_').map(depluralToken))
        return distinctive.some((t) => kt.has(t))
      }
      // family already states an explicit total/delivered flow → nothing to restate
      if (r7Keys.some((k3) => k3 !== k && /(^|_)(total|delivered)(_|$)/.test(k3) &&
        /_m3_h$|_m3_hr$|_m3_per_hr$/.test(k3) && inFamily(k3))) continue
      let corrKey = ''
      let corrVal = 0
      for (const k2 of r7Keys) {
        if (k2 === k || k2 === `${stem}_count`) continue
        const v2 = quantities[k2]
        if (!Number.isFinite(v2) || v2 <= 0) continue
        if (!/_m3_h$|_m3_hr$|_m3_per_hr$/.test(k2) || SERVICE_LINE_FLOW_KEY_RE.test(k2)) continue
        if (!inFamily(k2)) continue
        if (Math.abs(v2 - total) / total <= 0.02) { corrKey = k2; corrVal = v2; break }
      }
      if (!corrKey) continue
      const famBase = stem.replace(/_(pumps?|blowers?|compressors?|fans?)$/i, '') || stem
      mint(`${famBase}_total_m3_h`, total, 'm3/h', 'flow_rate', k,
        `demand-coverage: DELIVERED total = ${v} m³/h per unit × ${Math.round(cnt)} units (${k} × ${stem}_count), ` +
        `corroborated by ${corrKey} = ${corrVal} m³/h — the explicit system total, so no reader mistakes the per-unit figure for the delivery`)
    }
  }
  // ── rule 8: ZONED-DELIVERY DISTRIBUTION NETWORK (parametric — Tristan 2026-07-03, the
  // fischer-codema client section D £895k vs ~£158k modelled HOLD-003). A plant that delivers
  // to N VALVE-SECTIONED ZONES (an ebb/flow irrigation grid, a fertigation bench network, any
  // zoned sprinkler/delivery loop) carries most of its cost in the DISTRIBUTION network —
  // mains, risers, zone laterals, drain/return mirror — which is never per-pipe ROUTED by the
  // Blender (it routes plant-room equipment ties, not a 15,000 m field grid). This rule mints
  // the network as a PARAMETRICALLY-DERIVED engineered allowance: lengths by DN family +
  // connection counts, every value carrying its derivation formula in source_detail and
  // 'parametric — not routed' provenance, plus the per-department distribution-manifold
  // principal via the normal buildGroups path (so drawings/schedules pick it up naturally).
  // KEYED ON ZONED-DELIVERY SIGNALS ONLY (never a class table):
  //   (a) a zone-valve population — a `*valve*_count` quantity carrying a zoning qualifier
  //       token (actuated / zone / distribution / section), ≥ 8 zones;
  //   (b) a delivery-flow basis — the brief's `…_per_<group>` flow metric resolved against
  //       the design's ONE delivered flow in that family (the rule-4b derivation: the split
  //       count D = system ÷ per-group only when it divides cleanly), or an explicit
  //       `distribution_delivery_groups` quantity + the largest delivered flow.
  //   No zone valves (BESS / SAF / CO₂ / RAS) or no delivered-flow basis → strict
  //   byte-identical no-op (never fabricate — the honest-out-of-scope hold stays).
  // GEOMETRY: brief-stated zoning quantities when the contract carries them
  // (distribution_positions_per_zone / _zone_rows / _position_pitch_mm / _levels_per_branch /
  // _branch_runs / _risers_per_branch — generic distribution vocabulary, emitted by any
  // builder that parses them from its brief), with stated standard-layout fallbacks.
  // HYDRAULICS: DN per segment from the flow-split duties at standard service velocities
  // (delivery mains/risers ≤1.3 m/s surge-limited on cycling valve networks; zone laterals
  // ≤3.0 m/s short-duration flood-fill; gravity drains ≤1.4 m/s; main drain headers ≤0.8 m/s
  // part-full equivalent), d = √(4Q/πv), snapped to the PVC-U metric ladder. Idempotent —
  // the `distribution_network_length_m` sentinel + mint()'s never-overwrite guarantee.
  {
    const r8Keys = Object.keys(quantities)
    const qpos = (k: string): number => (Number.isFinite(quantities[k]) && quantities[k] > 0 ? quantities[k] : 0)
    // (a) the zone-valve population
    let zoneValveKey = ''
    let zoneCount = 0
    for (const k of r8Keys) {
      if (!/valve\w*_count$/.test(k)) continue
      if (!/(actuat|zone|distribut|section)/.test(k)) continue
      const v = quantities[k]
      if (Number.isFinite(v) && v >= 8 && v > zoneCount) { zoneCount = Math.round(v); zoneValveKey = k }
    }
    if (zoneCount >= 8 && !Object.prototype.hasOwnProperty.call(quantities, 'distribution_network_length_km')) {
      // (b) delivery-flow basis: per-group brief metric → the ONE delivered flow in its family
      let sysFlow = 0
      let groups = 0
      let flowBasis = ''
      for (const met of briefMetrics) {
        const bKey = String(met?.key_metric ?? met?.metric ?? met?.name ?? '').toLowerCase().trim()
        const perIdx = bKey.indexOf('_per_')
        if (perIdx < 0) continue
        if (matcherMetricFamily(met, bKey) !== 'flow_m3h') continue
        const target = Number(met?.value)
        if (!Number.isFinite(target) || target <= 0) continue
        const core = [...matcherIdentityTokens(matcherNormName(bKey.slice(0, perIdx)))]
          .filter((t) => !METRIC_QUALIFIER_TOKENS.has(t)).map(depluralToken)
        if (core.length === 0) continue
        const coreSet = new Set(core)
        const cands: Array<{ key: string; value: number }> = []
        for (const k of r8Keys) {
          const v = quantities[k]
          if (!Number.isFinite(v) || v <= 0) continue
          if (!/_(m3_h|m3_hr|m3_per_hr)$/.test(k) || SERVICE_LINE_FLOW_KEY_RE.test(k)) continue
          if (FLOW_ECHO_TOKEN_RE.test(k) || /(^|_)(calc|computed)_/i.test(k)) continue
          // a rule-4/rule-7 RE-PUBLICATION (`…_delivered_m3_h`, `…_per_<noun>_delivered_…`,
          // `…_total_m3_h`) restates a flow that already exists under its source key — counting
          // it would make the ONE-delivered-flow test ambiguous against its own derivation.
          if (/_delivered_(m3_h|m3_hr|m3_per_hr)$/.test(k) || /_per_[a-z0-9]+_delivered_/.test(k)
            || /_total_(m3_h|m3_hr|m3_per_hr)$/.test(k)) continue
          const kt = new Set((k.toLowerCase().match(/[a-z]+/g) ?? []).map(depluralToken))
          if ([...coreSet].some((t) => kt.has(t))) cands.push({ key: k, value: v })
        }
        if (cands.length !== 1) continue // ambiguous / no delivered basis → never a guess
        const raw = cands[0].value / target
        const sh = Math.round(raw)
        if (!(sh >= 1 && Math.abs(raw - sh) <= 0.05)) continue // not a clean per-group split
        sysFlow = cands[0].value
        groups = sh
        flowBasis = `${cands[0].key} = ${cands[0].value} m³/h delivered ÷ ${sh} groups (the ${bKey} = ${target} m³/h per-group brief metric)`
        break
      }
      if (sysFlow <= 0 && qpos('distribution_delivery_groups') >= 1) {
        // explicit builder opt-in: the delivery-group count is a stated quantity
        groups = Math.round(qpos('distribution_delivery_groups'))
        for (const k of r8Keys) {
          const v = quantities[k]
          if (!Number.isFinite(v) || v <= 0) continue
          if (!/_(m3_h|m3_hr|m3_per_hr)$/.test(k) || SERVICE_LINE_FLOW_KEY_RE.test(k)) continue
          if (FLOW_ECHO_TOKEN_RE.test(k) || /(^|_)(calc|computed)_/i.test(k)) continue
          if (v > sysFlow) { sysFlow = v; flowBasis = `${k} = ${v} m³/h delivered (largest delivered flow; distribution_delivery_groups = ${groups})` }
        }
      }
      if (sysFlow > 0 && groups >= 1) {
        const groupFlow = Math.round((sysFlow / groups) * 100) / 100 // the open-zone fill duty (one zone open per group)
        // geometry — brief-stated quantities first, stated standard-layout fallbacks second
        let servedPositions = 0
        for (const k of r8Keys) {
          if (!/(container|tray|bench|position|pot|plot)s?_count$/.test(k)) continue
          const v = quantities[k]
          if (Number.isFinite(v) && v >= 2 * zoneCount && v > servedPositions) servedPositions = Math.round(v)
        }
        const posPerZone = qpos('distribution_positions_per_zone')
          || (servedPositions > 0 ? servedPositions / zoneCount : 24)
        const zoneRows = qpos('distribution_zone_rows') || 2
        const pitchM = (qpos('distribution_position_pitch_mm') || 2500) / 1000
        const widthM = (qpos('distribution_position_width_mm') || 1200) / 1000
        const levels = Math.max(1, Math.round(qpos('distribution_levels_per_branch') || 1))
        const risersPerBranch = Math.max(1, Math.round(qpos('distribution_risers_per_branch') || 2))
        const branches = Math.max(groups, Math.round(qpos('distribution_branch_runs')
          || (levels > 1 ? zoneCount / levels / risersPerBranch : Math.sqrt(zoneCount))))
        const hasDrainReturn = r8Keys.some((k) => /(^|_)(drain|return|reclaim)/.test(k))
        // hydraulics — DN per segment from the flow-split duty at its service velocity
        const PVC_DN_LADDER = [50, 63, 75, 90, 110, 125, 160, 200, 250, 315, 400]
        const dnFor = (m3h: number, vMs: number): number => {
          const dMm = Math.sqrt((4 * (m3h / 3600)) / (Math.PI * vMs)) * 1000
          return PVC_DN_LADDER.find((d) => d >= dMm) ?? PVC_DN_LADDER[PVC_DN_LADDER.length - 1]
        }
        const R1 = (x: number): number => Math.round(x * 10) / 10
        // segment lengths (standard layout arithmetic — every formula stated)
        const riserRuns = levels > 1 ? Math.round(zoneCount / levels) : 0
        const riserHeight = levels > 1 ? R1(levels * 1.3 + 0.5) : 0 // 1.3 m standard multi-level rack tier pitch + connection
        const riserTotal = Math.round(riserRuns * riserHeight)
        const zonesPerLevelPerBranch = zoneCount / branches / Math.max(1, levels)
        const branchPitchM = R1(zonesPerLevelPerBranch * zoneRows * widthM * 1.5) // rows served + 50 % aisle allowance
        const spineM = R1((branches / groups) * branchPitchM + 30) // + 30 m plant-room stand-off per group
        const mainTotal = Math.round(groups * spineM)
        const lateralEach = levels > 1 ? R1(Math.max(0.5, widthM * 0.5)) : R1((posPerZone / zoneRows) * pitchM)
        const lateralTotal = Math.round(zoneCount * lateralEach)
        const drainRiserRuns = hasDrainReturn && levels > 1
          ? Math.round(branches * levels)
          : 0
        const drainRiserTotal = Math.round(drainRiserRuns * riserHeight)
        const drainCollectTotal = hasDrainReturn 
          ? (levels > 1 ? Math.round(2 * branchPitchM * branches) : Math.round(2 * lateralEach * branches)) 
          : 0 // a floor line per branch side
        const drainMainTotal = hasDrainReturn ? mainTotal : 0
        const mainDn = dnFor(groupFlow, 1.3)
        const lateralDn = dnFor(groupFlow, 3.0)
        const drainDn = dnFor(groupFlow, 1.4)
        const drainMainDn = dnFor(groupFlow, 0.8)
        const valveDn = qpos('distribution_zone_valve_dn_mm')
          || (PREFERRED_DN.find((d) => d >= Math.sqrt((4 * (groupFlow / 3600)) / (Math.PI * 3.8)) * 1000) ?? 65)
        const prov = 'parametric — not routed (zoned-delivery distribution network, engineered allowance)'
        const geomBasis = `${zoneCount} zones (${zoneValveKey}) × ${posPerZone} positions/zone` +
          (servedPositions > 0 ? ` (${servedPositions} served positions)` : '') +
          `; ${groups} delivery group(s); ${branches} branch runs × ${levels} level(s); fill duty ${groupFlow} m³/h/group from ${flowBasis}`
        const mintLen = (key: string, lenM: number, dn: number, formula: string): void => {
          if (lenM <= 0) return
          mint(`${key}_length_m`, lenM, 'm', 'length', zoneValveKey, `${prov}: ${formula} · ${geomBasis}`)
          mint(`${key}_dn_mm`, dn, 'mm', 'dimension', zoneValveKey,
            `${prov}: DN${dn} from d = √(4·Q/π·v) at the segment service velocity — see ${key}_length_m for the run derivation`)
        }
        mintLen('distribution_main', mainTotal, mainDn,
          `delivery mains (department spines) = ${groups} group(s) × (${branches / groups} branches × ${branchPitchM} m branch pitch + 30 m plant-room stand-off) = ${mainTotal} m; DN${mainDn} at ${groupFlow} m³/h ≤ 1.3 m/s (surge-limited delivery main on a cycling valve network)`)
        mintLen('distribution_riser', riserTotal, mainDn,
          `delivery risers = ${riserRuns} risers (${zoneCount} zones ÷ ${levels} levels) × ${riserHeight} m (${levels} levels × 1.3 m tier pitch + 0.5 m) = ${riserTotal} m; DN${mainDn} at ${groupFlow} m³/h ≤ 1.3 m/s`)
        mintLen('distribution_zone_lateral', lateralTotal, lateralDn,
          levels > 1
            ? `zone laterals = ${zoneCount} zones × ${lateralEach} m (multi-tier shared-tray zone-valve stub) = ${lateralTotal} m; DN${lateralDn} at the ${groupFlow} m³/h open-zone flood-fill duty ≤ 3.0 m/s (short-duration fill)`
            : `zone laterals = ${zoneCount} zones × (${posPerZone} positions/zone ÷ ${zoneRows} rows × ${pitchM} m position pitch) = ${zoneCount} × ${lateralEach} m = ${lateralTotal} m; DN${lateralDn} at the ${groupFlow} m³/h open-zone flood-fill duty ≤ 3.0 m/s (short-duration fill)`)
        mintLen('distribution_drain_riser', drainRiserTotal, drainDn,
          levels > 1
            ? `drain/return risers (mirror of the delivery grid) = ${drainRiserRuns} gravity drops (one outlet per tier per branch: ${branches} branches × ${levels} levels) × ${riserHeight} m = ${drainRiserTotal} m; DN${drainDn} gravity at ${groupFlow} m³/h ≤ 1.4 m/s`
            : `drain/return risers (mirror of the delivery grid) = ${drainRiserRuns} gravity drops (an outlet per 2 positions per level) × ${riserHeight} m = ${drainRiserTotal} m; DN${drainDn} gravity at ${groupFlow} m³/h ≤ 1.4 m/s`)
        mintLen('distribution_drain_collection', drainCollectTotal, drainDn,
          levels > 1
            ? `drain collection lines = 2 floor lines/branch × ${branchPitchM} m branch span × ${branches} branches = ${drainCollectTotal} m; DN${drainDn} gravity ≤ 1.4 m/s`
            : `drain collection lines = 2 floor lines/branch × ${lateralEach} m × ${branches} branches = ${drainCollectTotal} m; DN${drainDn} gravity ≤ 1.4 m/s`)
        mintLen('distribution_drain_main', drainMainTotal, drainMainDn,
          `main drain headers = the delivery-spine mirror (${mainTotal} m); DN${drainMainDn} at ${groupFlow} m³/h ≤ 0.8 m/s part-full gravity equivalent`)
        const networkTotal = mainTotal + riserTotal + lateralTotal + drainRiserTotal + drainCollectTotal + drainMainTotal
        // the headline roll-up is minted in km (its natural scale for a ~15,000 m network) —
        // deliberately a DIFFERENT unit family from the per-segment `_length_m` runs, so the
        // provenance divergence net (same-unit, shared-role, >50× → HIGH) never false-fires
        // on an explicit total-vs-segment pair (both values are correct by construction).
        mint('distribution_network_length_km', Math.round(networkTotal) / 1000, 'km', 'length', zoneValveKey,
          `${prov}: total zoned-distribution pipework = mains ${mainTotal} + risers ${riserTotal} + zone laterals ${lateralTotal} + drain risers ${drainRiserTotal} + drain collection ${drainCollectTotal} + drain mains ${drainMainTotal} = ${networkTotal} m = ${Math.round(networkTotal) / 1000} km · ${geomBasis}`)
        mint('distribution_zone_valve_dn_mm', valveDn, 'mm', 'dimension', zoneValveKey,
          `${prov}: zone valve DN${valveDn} — the ${zoneCount} sectioning valves each pass the ${groupFlow} m³/h open-zone fill duty at ≤ 3.8 m/s valve velocity`)
        mint('distribution_zone_kits', zoneCount, '', 'count', zoneValveKey,
          `${prov}: one zone connection kit (valve stub-in, unions, supports) per sectioning valve = ${zoneCount}`)
        if (servedPositions > 0) {
          if (levels > 1) {
            mint('distribution_position_connections', zoneCount, '', 'count', zoneValveKey,
              `${prov}: one shared-tray inlet per zone = ${zoneCount}`)
            if (hasDrainReturn) {
              mint('distribution_drain_outlet_connections', Math.round(branches * levels), '', 'count', zoneValveKey,
                `${prov}: one drain outlet per tier per branch = ${Math.round(branches * levels)}`)
            }
          } else {
            mint('distribution_position_connections', servedPositions, '', 'count', zoneValveKey,
              `${prov}: one delivery inlet stub + fitting per served position = ${servedPositions}`)
            if (hasDrainReturn) {
              mint('distribution_drain_outlet_connections', Math.round(servedPositions / 2), '', 'count', zoneValveKey,
                `${prov}: one gravity drain outlet per 2 served positions = ${Math.round(servedPositions / 2)}`)
            }
          }
        }
        // the per-group distribution-manifold principal — minted through the NORMAL buildGroups
        // path (throughput device + count) so BoM, drawings, schedules and the panel see it as
        // real equipment, not a note. 'manifold' is a device noun (see DEVICE_NOUNS).
        mint('distribution_manifold_count', groups, '', 'count', zoneValveKey,
          `${prov}: one distribution manifold station (delivery header, isolation + non-return valves, drain tie-in) per delivery group = ${groups}`)
        mint('distribution_manifold_throughput_m3_h', groupFlow, 'm3/h', 'flow_rate', zoneValveKey,
          `${prov}: each distribution manifold passes its group's ${groupFlow} m³/h delivery duty (${flowBasis})`)
        // ── rule 8b: HAND-WATERING RING MAIN (parametric — Tristan 2026-07-03, the
        // fischer-codema client section E £24k vs a pump-only £4k model, 0.18×). A zoned
        // facility that ALSO states a hand-watering duty (the brief: "a DN90 … hand-watering
        // ring main to both departments with 44 risers (two per tunnel plus four at the
        // irrigation room), each with a hand valve and a quick connector") carries a manual
        // tap RING around the same delivery grid — never per-pipe routed, exactly like the
        // zoned network above. KEYED ON THE BRIEF'S OWN SIGNALS ONLY: a `hand_watering*`
        // flow quantity (the pump duty the water builder parses from the brief) PLUS the
        // zoned-delivery geometry already established in this scope — no hand-watering flow
        // (BESS / SAF / CO₂) or no zoning → strict no-op (never fabricate). The SAME zoning
        // geometry reproduces the brief's stated numbers: risers = risers-per-branch ×
        // branches + 2 per delivery group at the plant/irrigation room (v61: 2 × 20 + 4 =
        // the brief's stated 44); ring = out-and-return legs along each group's delivery
        // spine; DN from d = √(4Q/πv) at ≤ 1.3 m/s (25 m³/h → DN90, the brief's stated DN).
        // PRICING: requirements_bom.py's _DISTRIBUTION_SEGMENTS reads
        // `hand_watering_ring_main_*` (one length segment) and the tap-station
        // allowance reads `hand_watering_riser_count` — these quantities become
        // priced section-E BoM rows (parametric basis stated on each).
        let hwKey = ''
        let hwFlow = 0
        for (const k of r8Keys) {
          if (!/^hand_?watering/.test(k)) continue
          if (!/_(m3_h|m3_hr|m3_per_hr)$/.test(k) || SERVICE_LINE_FLOW_KEY_RE.test(k)) continue
          if (FLOW_ECHO_TOKEN_RE.test(k) || /(^|_)(calc|computed)_/i.test(k)) continue
          const v = quantities[k]
          if (Number.isFinite(v) && v > 0 && v > hwFlow) { hwFlow = v; hwKey = k }
        }
        if (hwFlow > 0 && !Object.prototype.hasOwnProperty.call(quantities, 'hand_watering_ring_main_length_m')) {
          const hwRingM = Math.round(groups * 2 * spineM)
          const hwDn = dnFor(hwFlow, 1.3)
          const hwRisers = Math.round(risersPerBranch * branches + 2 * groups)
          mint('hand_watering_ring_main_length_m', hwRingM, 'm', 'length', hwKey,
            `${prov}: hand-watering ring main = ${groups} delivery group(s)/department(s) × 2 legs (ring out-and-return along the ${spineM} m delivery spine, serving every branch head) = ${hwRingM} m · ${geomBasis}`)
          mint('hand_watering_ring_main_dn_mm', hwDn, 'mm', 'dimension', hwKey,
            `${prov}: DN${hwDn} from d = √(4·Q/π·v) at the ${hwFlow} m³/h hand-watering duty (${hwKey}) ≤ 1.3 m/s ring velocity — see hand_watering_ring_main_length_m for the run derivation`)
          mint('hand_watering_riser_count', hwRisers, '', 'count', hwKey,
            `${prov}: hand-watering tap risers (each a hand valve + quick connector) = ${risersPerBranch} per branch × ${branches} branches + 2 per delivery group at the plant/irrigation room (${2 * groups}) = ${hwRisers}`)
        }
      }
    }
  }
  // ── rule 9: CRITICAL DISTRIBUTION-MOVER BACKUP — N+1 (2026-07-08, Sam Green SME review of
  // the real Codema Fischer Farms system, RULE 3 of the UNIVERSAL multizone-distribution
  // handover — "each pump unit has a backup pump" (P&ID SO21101551-100d); Exec J28 "why is
  // it providing double capacity required?" traced to this redundancy existing but never
  // being LABELLED as a deliberate N+1 decision). UNIVERSAL rule: a distribution prime-mover
  // that has ALREADY been sized to N≥2 per-zone instances (rule-8's
  // distribution_delivery_groups shape, or the mover's own zone-keyed vocabulary) — i.e. it
  // is the SOLE path delivering its zone's continuous process duty from a shared source, no
  // internal spare — is a single point of failure for that zone and gets a labelled BACKUP
  // replica, rated IDENTICALLY to the duty unit it protects, minted as a REAL BoM word (not a
  // fabricated topology-only node): `<stem>_backup_count` + `_throughput_m3_h` / `_power_kw`
  // form their OWN equipment group (buildGroups) distinct from the duty group, so the P&ID/
  // BoM render a genuine duty+backup pair.
  //
  // 'backup' (not 'standby') is the deliberate token: `stem('standby')` truncates to 'stand',
  // which IS a STOP_STEMS entry — a `_standby_*` mint would silently collapse back into the
  // SAME duty group (zero visible effect) instead of forming a new one. 'backup' truncates to
  // 'backu', not a stop-stem, so it correctly forms a distinct group — and it is also Sam's
  // own P&ID terminology ("backup pump"), so the rendered label matches the real drawing.
  //
  // proveNoFalsePositive (RULE 3's guard — "a non-critical / already-redundant duty gets
  // none"): (a) a single-instance mover (count<2 — RO high-pressure pump, hand-watering pump)
  // is untouched, nothing to protect since there is no per-zone replication; (b) a
  // RECOVERY/DISPOSAL-side mover (drain transfer, backwash, reject, blowdown, purge) is
  // untouched — Sam names backups only on the FORWARD distribution pumps; (c) a TRIM/METERING
  // pump (acid/chemical dosing, ~0.04 m³/h, ~0.04 kW) is untouched by the magnitude floor —
  // it shares the zone count (2, one per department) and the 'dosing' vocabulary, but losing
  // it is tolerable for a period (unlike losing bulk water circulation), and Sam's review
  // never mentions a backup for the small metering pumps, only the pump UNITS; (d) idempotent
  // — mint() never overwrites, so a stem already carrying its own `_backup_count` (re-run, or
  // a class builder's hand-authored redundancy) is left exactly as is.
  {
    // NB: `\b` does NOT break on `_` (it is a \w character) — a quantity key is underscore-
    // joined (`fertigation_dosing_pump`), so `/\bpump\b/` never matches `..._pump` the way it
    // would match "fertigation dosing pump". Match against the underscore→space-normalised
    // stem (same fix as derive-topology.ts's `_normaliseSlugForMatch`, the identical trap).
    const moverExclusionRe = /\b(drain|recover|reclaim|return|reject|waste|backwash|blowdown|transfer|purge|standby|backup|spare)\b/i
    const moverNounRe = /\b(pump|blower|fan|compressor)\b/i
    const deliveryZoneRe = /fertigation|irrigation|hand.?water|watering|sprinkler|distribution/i
    const deliveryGroups = quantities['distribution_delivery_groups']
    const r9Keys = Object.keys(quantities)
    for (const k of r9Keys) {
      const m = /^(.+)_count$/.exec(k)
      if (!m) continue
      const stemPhrase = m[1]
      const stemNorm = stemPhrase.replace(/[_-]+/g, ' ')
      if (moverExclusionRe.test(stemNorm) || !moverNounRe.test(stemNorm)) continue
      const cnt = quantities[k]
      if (!Number.isFinite(cnt) || cnt < 2 || Math.abs(cnt - Math.round(cnt)) > 1e-9) continue
      const isZoneMover = deliveryZoneRe.test(stemNorm) ||
        (Number.isFinite(deliveryGroups) && Math.round(cnt) === Math.round(deliveryGroups as number))
      if (!isZoneMover) continue
      if (Object.prototype.hasOwnProperty.call(quantities, `${stemPhrase}_backup_count`)) continue
      const dutyThroughput = quantities[`${stemPhrase}_throughput_m3_h`] ?? quantities[`${stemPhrase}_flow_m3_h`]
      const dutyPower = quantities[`${stemPhrase}_power_kw`] ?? quantities[`${stemPhrase}_motor_kw`]
      // magnitude floor: a BULK circulation/distribution duty, never a small trim/metering
      // pump (proveNoFalsePositive (c) above) — deliberately much lower than isSynthesisable's
      // 10 m³/h / 15 kW BoM-inclusion floor (this is a "is it the critical bulk duty" test,
      // not a "is it worth listing" test).
      const dutyMagnitudeOk = (dutyThroughput !== undefined && dutyThroughput >= 1) ||
        (dutyPower !== undefined && dutyPower >= 1)
      if (!dutyMagnitudeOk) continue
      mint(`${stemPhrase}_backup_count`, Math.round(cnt), '', 'count', k,
        `RULE 3 (N+1 critical distribution redundancy, Sam Green SME review of the real Codema system): ${Math.round(cnt)} distribution-mover unit(s) (${k}) each serve their own zone from a shared source with no internal spare — a single point of failure for that zone's continuous process duty. One labelled BACKUP pump per duty unit (= ${Math.round(cnt)}), rated identically, mirrors the real system ("each pump unit has a backup pump")`)
      if (dutyThroughput !== undefined) {
        mint(`${stemPhrase}_backup_throughput_m3_h`, dutyThroughput, 'm3/h', 'flow_rate', k,
          `RULE 3: backup pump rated identically to its duty unit's ${dutyThroughput} m³/h — a failed-over backup must meet the SAME per-zone duty, not a derated one`)
      }
      if (dutyPower !== undefined) {
        mint(`${stemPhrase}_backup_power_kw`, dutyPower, 'kW', 'power', k,
          `RULE 3: backup pump motor rated identically to its duty unit's ${dutyPower} kW`)
      }
    }
  }
  // ── T-18: N+1 STANDBY as an explicit DESIGN DECISION (Sam Green / Exec J28) ──────────
  // INTENT: when any `*_backup_count` ≥ 1 exists (minted above OR hand-authored by a class
  // builder), surface a design-decision row so the Excel register explains the apparent
  // "double capacity" as intentional N+1 redundancy — never unexplained oversizing.
  // DECISION: write onto `contract.design_decisions` (loose array the chain merges into
  // state.designDecisions). Idempotent — never duplicates RULE_N_PLUS_1_STANDBY.
  mintNPlus1StandbyDesignDecision(quantities, contract)
  // ── rule 10: PLANT-ROOM CLEAR HEIGHT (Sam J6 — "graphics can't be used for construction —
  // not enough details or dimensions"; plant rooms exist as walled Elec/Mech partitions but
  // the finished ceiling / clear height was never stated). UNIVERSAL: when the design already
  // signals a plant room / mechanical room / electrical room / building envelope (quantity
  // keys OR a distribution_main plant-room stand-off from rule 8), mint a documented clear
  // height. Prefer a brief-stated clear/ceiling height if present; else the UK industrial
  // plant-room default 3.5 m with provenance that G6 will surface as "confirm with customer".
  // BESS / open-pad / no-building designs → strict no-op.
  {
    if (!Object.prototype.hasOwnProperty.call(quantities, 'plant_room_clear_height_m')) {
      const r10Keys = Object.keys(quantities)
      const plantRoomSignal = r10Keys.some((k) =>
        /(plant_?room|mech(anical)?_?room|elec(trical)?_?room|building_envelope|enclosure_height|room_height)/i.test(k)
      ) || Number.isFinite(quantities['distribution_main_length_m']) // rule-8 plant-room stand-off plants
        || Number.isFinite(quantities['distribution_manifold_count'])
      if (plantRoomSignal) {
        // brief-stated clear / ceiling height wins when present
        let clearM = 0
        let from = ''
        let detail = ''
        for (const met of (opts?.briefMetrics ?? [])) {
          const bKey = String(met?.key_metric ?? met?.metric ?? met?.name ?? '').toLowerCase()
          if (!/(clear_?height|ceiling_?height|plant_?room.*height|finished_?floor.*ceiling)/.test(bKey)) continue
          const v = Number(met?.value)
          if (!Number.isFinite(v) || v <= 0) continue
          // accept metres; if value looks like mm (>50) convert
          clearM = v > 50 ? v / 1000 : v
          from = bKey
          detail = `demand-coverage: plant-room clear height = brief metric ${bKey} (${clearM} m) — construction-usable ceiling definition`
          break
        }
        if (clearM <= 0) {
          // scan existing quantities for a clear/ceiling height already stated
          for (const k of r10Keys) {
            if (!/(clear_?height|ceiling_?height|room_height)_?m$/.test(k)) continue
            const v = quantities[k]
            if (!Number.isFinite(v) || v <= 0) continue
            clearM = v
            from = k
            detail = `demand-coverage: plant-room clear height = the design's ${k} (${v} m)`
            break
          }
        }
        if (clearM <= 0) {
          clearM = 3.5
          from = plantRoomSignal ? 'plant_room_signal' : 'default'
          detail =
            'demand-coverage: plant-room clear height = 3.5 m standard industrial plant-room clear height ' +
            '(UK practice for pump / RO / MCC plant rooms) — confirm with customer (G6 elicitation); ' +
            'replace via brief clear_height_m if the site differs'
        }
        mint('plant_room_clear_height_m', clearM, 'm', 'dimension', from, detail)
      }
    }
  }
  return minted
}

// ── PUMP MOTOR vs BRIEF-STATED DISCHARGE PRESSURE (universal duty cross-check, Tristan
// 2026-07-08 — the Codema 90 m³/h @ 2.9 bar pump physics-critic "undersized" HIGH) ──────
// A pump/circulator/prime-mover's drive-motor rating must be sized from its HYDRAULIC DUTY
// (P = rho·g·Q·H / eta), never a rough guess — the single-IEC-frame rounding rule fixed
// 2026-07-03 is the right OUTPUT step, but it can only round what the hydraulic sizing
// TOOL handed it. That tool's OWN assumed head/pressure is itself sometimes a generic
// per-system-type default (e.g. 1.5 bar) that diverges from a REAL, EXPLICIT discharge
// pressure the BRIEF states for this exact pump family ("90 m³/h at approximately 2.9
// bar"). When that happens the tool's motor_kw undershoots the true duty and can land on
// the wrong side of an IEC frame boundary (9.65 kW → rounds to 11 kW; the true 2.9 bar
// duty needs ~11.2 kW → rounds to 15 kW) — the physics critic is right that 11 kW is
// undersized even though the rounding rule itself is correct; the INPUT was wrong.
//
// THE FIX (universal, keyed on generic pump-role + flow + head signals, no class name):
// cross-check every principal FLOW-RATED pump's motor_kw contract quantity against ANY
// brief target_performance metric stating a discharge/design PRESSURE (a `..._pressure_bar`
// key — this codebase's own self-describing-unit-suffix convention, mirroring
// `reactor_pressure_bar` / `column_pressure_bar` elsewhere in this file) for the SAME pump
// family, matched by stem overlap. 'irrigation' and 'fertigation' canonicalise to the same
// stem: fertigation IS irrigation + in-line fertiliser dosing — the identical physical
// delivery pump under two names, a standard horticultural/agricultural-engineering synonym
// (like this file's existing recirc/recirculation collapse), not a class name. Recompute
// P = rho·g·Q·H / eta at the REAL pressure (eta = 0.65, a sane combined pump+motor
// efficiency default) and LIFT (never lower) the family's motor_kw when the resulting IEC
// frame is higher than what's already there. A brief-pinned nameplate is honoured exactly
// and never touched. A pump with no matching BULK-FLOW (`_flow_m3_h`) sibling never
// qualifies — a dosing/trim pump's duty is litres/hour, not m³/h, so it can never bind here
// regardless of any incidental stem overlap (the proveNoFalsePositive guard). Mutates
// `quantities` in place (feeding buildGroups/motorKw downstream) and, when `contract` is
// given, persists the correction with 'demand-coverage' provenance. Strict no-op when the
// brief states no pump discharge pressure at all (BESS / RAS / CO2 / any archetype whose
// pump head comes from a different signal — e.g. the RAS `<device>_head_m` sibling
// injection in bootstrap-tool-plan.ts — is untouched).
const PRESSURE_METRIC_SUFFIX_RE = /_(pressure_bar|discharge_pressure_bar|design_pressure_bar)$/i
const PUMP_MOTOR_QTY_SUFFIX_RE = /_(motor_kw|motor_power_kw|power_kw|drive_kw)$/
const PUMP_FLOW_QTY_SUFFIX_RE = /_(flow_m3_h|flow_m3_hr|throughput_m3_h)$/
const PUMP_STEM_SYNONYMS: Record<string, string> = { ferti: 'irrig' }
const canonPumpStem = (s: string): string => PUMP_STEM_SYNONYMS[s] ?? s
// 'pump' + the plant-wide descriptor tokens (discharge / operating / main / delivery) are
// near-universal — they must never by themselves decide a family match (the f9dfc2918
// generic-token discipline used throughout this file), or a small DOSING pump
// ('fertigation_dosing_pump…') would wrongly bind to the MAIN delivery pump on the shared
// 'ferti'≡'irrig' + 'pump' tokens alone. A pressure metric that reduces to NO tokens after
// this filter (e.g. `pump_pressure_bar`, `discharge_pressure_bar`, `system_pressure_bar`,
// `operating_pressure_bar`) is a PLANT-WIDE pump discharge pressure — the brief's "each at
// approximately 2.9 bar" stated once for every delivery pump — not one family's spec; it
// applies as a GLOBAL floor to any bulk-flow pump family with no family-specific pressure of
// its own. This mirrors the generic `operating_/system_pressure_bar` vessel fallback already
// used for vessel-pressure lookup elsewhere in this file.
const PUMP_FAMILY_GENERIC_TOKENS = new Set(['pump', 'disch', 'opera', 'main', 'deliv'])
const pumpFamilyIdentity = (phrase: string): string[] =>
  significantStems(phrase).map(canonPumpStem).filter((t) => !PUMP_FAMILY_GENERIC_TOKENS.has(t))
/** exact-set equality (order-independent) of the non-generic identity tokens — a DOSING
 *  pump carries an extra distinctive token ('dosin') the main pump doesn't, so it never
 *  set-equals; two spellings of the SAME family (after synonym canonicalisation) do. */
const sameFamilyIdentity = (a: string[], b: string[]): boolean =>
  a.length > 0 && a.length === b.length && a.every((t) => b.includes(t))
// P = rho·g·Q·H / eta with eta a sane COMBINED pump+motor efficiency default (0.6-0.7) —
// deliberately a single combined factor (not separate pump-eff × motor-eff) so this cross-
// check stays a simple, universal duty FLOOR independent of any one tool's own efficiency
// assumptions.
const PUMP_MOTOR_COMBINED_EFF = 0.65
function requiredMotorKwFromPressure(m3h: number, bar: number): number {
  const qM3s = m3h / 3600
  const headM = bar * 10.2 // 1 bar ≈ 10.2 m water column
  const pHydW = 1000 * 9.81 * qM3s * headM
  return pHydW / PUMP_MOTOR_COMBINED_EFF / 1000
}

export function reconcilePumpMotorAgainstStatedPressure(
  quantities: Record<string, number>,
  contract?: ContractInProgress,
  briefMetrics?: BriefTargetMetric[],
): DemandCoverageMint[] {
  const corrected: DemandCoverageMint[] = []
  const metrics = (briefMetrics ?? []).filter((m) => {
    const k = String(m?.key_metric ?? m?.metric ?? m?.name ?? '')
    return PRESSURE_METRIC_SUFFIX_RE.test(k) && typeof m?.value === 'number' && Number.isFinite(m.value as number) && (m.value as number) > 0
  })
  if (metrics.length === 0) return corrected // no brief-stated pump pressure at all — untouched
  // split into FAMILY-SPECIFIC pressures (a distinctive identity token survives, e.g.
  // fertigation_pump_pressure_bar → 'irrig') and PLANT-WIDE pressures (reduce to no
  // identity token, e.g. pump_pressure_bar / discharge_pressure_bar → the brief's global
  // "each at ~2.9 bar"). A family uses its own metric first, else the global maximum.
  const familyMetrics: Array<{ identity: string[]; bar: number }> = []
  let globalBar = 0
  for (const met of metrics) {
    const mk = String(met.key_metric ?? met.metric ?? met.name ?? '')
    const identity = pumpFamilyIdentity(mk.replace(PRESSURE_METRIC_SUFFIX_RE, ''))
    if (identity.length > 0) familyMetrics.push({ identity, bar: met.value as number })
    else globalBar = Math.max(globalBar, met.value as number)
  }
  const pinnedKeys = briefPinnedQuantityKeys(contract)
  for (const key of Object.keys(quantities)) {
    const mm = PUMP_MOTOR_QTY_SUFFIX_RE.exec(key)
    if (!mm) continue
    if (pinnedKeys.has(key)) continue // never re-margin a brief-pinned nameplate
    const famPhrase = key.slice(0, mm.index)
    if (!famPhrase) continue
    // GOTCHA: `_power_kw` also matches UV / disinfection / heater electrical draws.
    // Hydraulic P = ρ·g·Q·H is a PUMP duty only — a UV reactor's `_throughput_m3_h` is
    // the treated flow, not a pumped head. Require an explicit `pump` token in the
    // family phrase (Codema 1820: uv_disinfection_power_kw 10.1 → 30 kW via 225 m³/h
    // @ 2.9 bar). Universal — noun signal, no class table.
    if (!/(^|_)pump(_|$)/i.test(famPhrase)) continue
    const famStems = pumpFamilyIdentity(famPhrase)
    if (famStems.length === 0) continue
    // the family's own BULK-FLOW sibling — a dosing/trim pump (litres/hour, no m³/h
    // quantity) never has one, so it can never qualify regardless of stem overlap. Exact
    // identity-set match (not mere overlap) so a dosing pump's extra distinctive token
    // ('dosin') keeps it from binding to the main delivery pump's flow.
    let flowM3h: number | undefined
    for (const fk of Object.keys(quantities)) {
      const fm = PUMP_FLOW_QTY_SUFFIX_RE.exec(fk)
      if (!fm) continue
      const v = quantities[fk]
      if (!(Number.isFinite(v) && v > 0)) continue
      const fStems = pumpFamilyIdentity(fk.slice(0, fm.index))
      if (sameFamilyIdentity(fStems, famStems)) { flowM3h = v; break }
    }
    if (!(flowM3h !== undefined && flowM3h > 0)) continue
    // family-specific pressure first (exact identity-set match); else the plant-wide global.
    let bestBar = 0
    for (const fm of familyMetrics) if (sameFamilyIdentity(fm.identity, famStems)) bestBar = Math.max(bestBar, fm.bar)
    if (!(bestBar > 0)) bestBar = globalBar // plant-wide pump discharge pressure (the brief's "each at ~X bar")
    if (!(bestBar > 0)) continue
    const requiredKw = requiredMotorKwFromPressure(flowM3h, bestBar)
    const requiredFrame = nextMotorFrameKw(requiredKw)
    const current = quantities[key]
    if (!(requiredFrame > current + 1e-9)) continue // never lower an existing/oversized value
    quantities[key] = requiredFrame
    corrected.push({ key, value: requiredFrame, unit: 'kW', from: 'brief-pressure-reconcile' })
    if (contract) {
      const cq = ((contract as { quantities?: Record<string, unknown> }).quantities ??= {}) as Record<string, unknown>
      const prev = (typeof cq[key] === 'object' && cq[key] ? cq[key] : {}) as Record<string, unknown>
      cq[key] = {
        ...prev,
        value: requiredFrame,
        unit: 'kW',
        source: 'demand-coverage',
        source_detail: `duty cross-check: ${flowM3h} m³/h @ ${bestBar} bar stated in the brief → P = ρ·g·Q·H / ${PUMP_MOTOR_COMBINED_EFF} = ${requiredKw.toFixed(2)} kW → next IEC frame ${requiredFrame} kW (was ${current} kW, undersized against the brief's stated discharge pressure)`,
      }
    }
  }
  return corrected
}

const vesselArea = (p: ParentPhysics) => { const d = p.diaM || Math.cbrt(((p.m3 || 50) * 4) / Math.PI); const h = p.htM || d; return { shell: Math.PI * d * h, head: (Math.PI * d * d) / 4, d, h } }

// Each entry: parts SIZED + PRICED from the parent's physics. Cost factors are
// engineering order-of-magnitude (UK, installed-equipment basis), universal by type.
// `refKw` (2026-07-09, Powerwall exit-32 round 2): a rule may declare the DUTY its
// fixed bases are priced at — the thermal-plant templates' £4,000 compressor /
// £4,200 control panel / £3,000 tube bundle are packaged-industrial (Pfannenberg
// EB-XT-class, ~40 kW) money. A parent far BELOW that reference gets the standard
// equipment cost-capacity law (six-tenths rule) applied to the whole derived price:
// f = (kw/refKw)^0.6 clamped to [0.005^0.6, 1] — a 0.11 kW mini-chiller's compressor
// prices at ~£117, not £4,010. NEVER scales up (the linear kW terms own upsizing),
// and a rule WITHOUT refKw is byte-identical (the pump/vessel calibrations that
// Codema/RAS shipped on are untouched).
const SUB_ASSEMBLY: { re: RegExp; refKw?: number; parts: SubSpec[] }[] = [
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
    // refKw 2: the £1,500-casing-class bases are industrial-pump money, honest from
    // ~2 kW up (every Codema principal — drain 2.2 / hand 3 / fertigation 15 kW — sits
    // at f=1, byte-identical). A sub-kW metering pump or cabinet fan scales down by
    // the six-tenths law instead of billing an industrial casing (Powerwall exit-32).
    refKw: 2,
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
    refKw: 40,
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
    refKw: 40,
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
function subWord(spec: SubSpec, parentId: string, qty: number, physics: ParentPhysics, costScale = 1): WordLike & { _subcomponent?: boolean } {
  const d = spec.derive(physics)
  const mods: ModifierCharacter[] = [mod('quantity', `×${qty}`)]
  if (d.size) mods.push(mod('dimension', d.size))
  if (d.rating) {
    // GOTCHA: R2 (= Math.round) collapses metering motors (0.04 kW) to "0" — use
    // formatRatingKw for kW so trim duties stay honest (Codema ship 2026-07-09).
    const u = String(d.rating.u || '')
    const vStr = /kw/i.test(u) ? formatRatingKw(d.rating.v) : String(R2(d.rating.v))
    mods.push(mod('rating_primary', vStr, d.rating.u))
  }
  // costScale: the rule's cost-capacity factor vs its declared reference duty (six-
  // tenths rule; 1 unless the rule declares refKw and the parent sits below it).
  mods.push(mod('price_estimate_gbp', String(Math.max(1, R2(d.gbp * costScale)))))   // BOTTOM-UP physics price
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
// ── LIQUID-THERMAL-PLANT DEMOTION AT AIR-COOLED SCALE (2026-07-10, Powerwall exit-32
// round 3). The generic path consumes a containerised class-reference graph whose
// liquid-cooling chain the graph ITSELF marks scale-conditional ("Optional only because
// some <1 MWh systems use forced-air cooling"). Below ~2 kW required duty (dissipation ×
// 1.2 margin — the SAME threshold as the deterministic emitter's air-cooled branch) a
// glycol loop does not exist on the real product: no chiller, no coolant pump, no
// expansion/coolant tank, no heat exchanger, no coolant manifolds. Stamp
// mis_emission_note (the ONE shared drop mechanism — deterministic_finalize demotes the
// word to an unpriced scope note) BEFORE the explode, and the explode skips stamped
// words, so the plant is never decomposed into priced children. Air-path words (fan /
// vent / filter / louvre / cold plate) stay. Duty ≥ 2 kW or no dissipation quantity
// (non-thermal archetypes): strict no-op.
const LIQUID_THERMAL_PLANT_RE =
  /\bchiller\b|coolant\s+pump|cooling\s+pump|coolant\s+\w*\s*(?:tank|reservoir|manifold|distribution)|expansion\s+tank|heat\s+exchanger|\bglycol\b/i
// Occupancy-scale safety PLANT (gas-detection systems/sensor networks, aspirating smoke
// plant) exists to protect a space a PERSON can enter. A sealed sub-1 m³ cabinet (wall
// ESS, EV-charger pillar, drone dock) has no occupancy — cell protection is the BMS's
// temperature chain + the pack vent path, and the real products carry none of this
// plant. A single smoke/heat DETECTOR (point device) is not plant and stays.
const OCCUPANCY_SAFETY_PLANT_RE =
  /gas[\s_]+detection|aspirating\s+smoke|smoke\s+detection\s+system|fire\s+suppression\s+(?:system|skid|plant)|clean\s+agent|novec|inergen/i
export function demoteLiquidThermalPlantAtAirCooledScale(modules: ModuleLike[], quantities: Record<string, number> = {}): number {
  const dissipation = Number(quantities['system_thermal_dissipation_kw'] ?? 0)
  const airCooled = dissipation > 0 && dissipation * 1.2 < 2
  const envM3 = Number(quantities['enclosure_volume_m3'] ?? 0)
  const noOccupancy = envM3 > 0 && envM3 < 1
  if (!airCooled && !noOccupancy) return 0
  let demoted = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        if ((w as { mis_emission_note?: string }).mis_emission_note) continue
        const nm = String(w.name_human ?? w.content_character?.name_human ?? '')
        const nmHead = nm.replace(/\s*\([^)]*\)\s*$/g, '').trim() || nm
        if (airCooled && LIQUID_THERMAL_PLANT_RE.test(nmHead)) {
          ;(w as { mis_emission_note?: string }).mis_emission_note =
            `liquid-thermal-plant at air-cooled scale: required duty ${(dissipation * 1.2).toFixed(2)} kW < 2 kW — ` +
            `no glycol loop exists on the real product (forced-air cooling per environmental_interface); ` +
            `demoted to a scope note, never a priced line`
          demoted += 1
          continue
        }
        if (noOccupancy && OCCUPANCY_SAFETY_PLANT_RE.test(nmHead)) {
          ;(w as { mis_emission_note?: string }).mis_emission_note =
            `occupancy-scale safety plant in a sealed ${envM3.toFixed(2)} m³ enclosure (< 1 m³, no personnel ` +
            `access): protection is the BMS temperature chain + the pack vent path — a gas-detection/` +
            `suppression PLANT does not exist on the real product; demoted to a scope note`
          demoted += 1
        }
      }
    }
  }
  return demoted
}

export function explodeEquipmentSubAssemblies(modules: ModuleLike[], quantities: Record<string, number> = {}, maxDepth = 3, briefPinnedKeys?: Set<string>): number {
  // Air-cooled-scale demotion runs FIRST (both synthesis paths call this explode —
  // the Codema two-paths lesson), so a demoted plant word is never decomposed below.
  demoteLiquidThermalPlantAtAirCooledScale(modules, quantities)
  // IDEMPOTENT + RECURSIVE: explode ONE level of the un-exploded frontier per call. A
  // part already carrying children is skipped (so re-running never duplicates — the
  // bug that gave a pump 39 children); a sub-component that itself matches a rule (a
  // heat-pump's Scroll Compressor → pump parts, an Evaporator Coil → exchanger parts,
  // a filter's Backwash Pump) explodes on the NEXT call, so the iteration LOOP deepens
  // the BoM a level at a time and settles when nothing un-exploded matches (capped at
  // maxDepth '__' levels). Returns the number of sub-component lines added THIS call.

  // PRUNE prior-run defect: valve fittings that were re-exploded as pumps (nested
  // Drive Motor / Impeller under "Suction Isolation Valve (on … Pump)"). Drop those
  // children so a re-run settles clean; isValveFitting + nmHead strip prevent re-mint.
  const PUMP_PART_UNDER_VALVE_RE =
    /__(?:suction|discharge|non_return|check|isolation)[\w]*valve__(?:casing|impeller|drive_motor|variable_speed|flexible_coupling|coupling_guard|baseplate|mechanical_seal|suction_isolation|discharge_isolation|non_return|discharge_pressure|anti_vibration)/i
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      sm.words = sm.words.filter((w) => !PUMP_PART_UNDER_VALVE_RE.test(String(w.id ?? w.content_character?.character_id ?? '')))
    }
  }

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
        // Valve fittings (isolation / NRV / control) are priced whole — never re-explode.
        // GOTCHA: their name often embeds "(on … Pump)", which would otherwise match the
        // pump SUB_ASSEMBLY rule and mint a nested drive train under the valve.
        if (isInstrument(w) || isActuator(w) || isValveFitting(w) || isUtility(w) || isProcessSystem(w) || isBuildingStructure(w)) continue
        // A word the air-cooled-scale pass (above) flagged as not-real-equipment must
        // never be decomposed into priced children — finalize demotes it whole.
        if ((w as { mis_emission_note?: string }).mis_emission_note) continue
        const id = String(w.id ?? '')
        const depth = (id.match(/__/g) ?? []).length
        if (depth >= maxDepth) continue          // too deep — stop the recursion
        if (hasChildren.has(id)) continue         // already exploded — idempotent
        const nm = w.name_human ?? ''
        // DECISION: match SUB_ASSEMBLY on the word's OWN head noun, not a parenthetical
        // duty note ("… (on Fertigation Dosing Pump)"). Strip trailing "(…)" before the
        // rule test so a valve fitting that slipped past isValveFitting still cannot
        // inherit the pump parts list from the parenthetical.
        const nmHead = nm.replace(/\s*\([^)]*\)\s*$/g, '').trim() || nm
        const rule = SUB_ASSEMBLY.find((r) => r.re.test(nmHead))
        if (!rule) continue
        const physics = readParentPhysics(w)
        // UNKNOWN-SIZE VESSEL ENVELOPE CAP (2026-07-09, Powerwall exit-32 round 2): a
        // size-less vessel word (no kW, no m³, no dims — the generic path's "Coolant
        // Expansion Tank") used to fall to the templates' 50 m³ default → a 4.0 m GRP
        // tank with walkway + gelcoat (£13.6k) inside a 0.13 m³ wall cabinet. When the
        // contract declares a COMPACT enclosure (< 50 m³), no internal vessel can
        // plausibly exceed a quarter of it — cap the default there. A plant-scale or
        // envelope-less contract (Codema tanks carry real m³) is byte-identical.
        if (physics.kw === 0 && physics.m3 === 0 && physics.diaM === 0) {
          const envM3 = Number(quantities['enclosure_volume_m3'] ?? 0)
          if (envM3 > 0 && envM3 < 50) physics.m3 = Math.max(0.01, envM3 * 0.25)
        }
        // CABINET-FAN DUTY CAP (2026-07-10, exit-32 round 5): an enclosure/ventilation
        // FAN moves the heat the system actually rejects — its motor can never usefully
        // exceed ~1.5× the contract's own thermal/aux load. The generic path emitted a
        // 1.7 kW fan rating on a 0.43 kW-dissipation wall cabinet (30× a real 40 W
        // cabinet fan), which also defeated the refKw cost scaling. Cap physics.kw at
        // the contract's declared load; a plant with no thermal quantities (or a fan
        // genuinely serving a big load) is untouched.
        if (/\bfan\b/i.test(nmHead)) {
          const thermalLoadKw = Math.max(
            Number(quantities['hvac_design_load_kw'] ?? 0),
            Number(quantities['system_thermal_dissipation_kw'] ?? 0),
          )
          if (thermalLoadKw > 0 && physics.kw > thermalLoadKw * 1.5) {
            physics.kw = Math.round(thermalLoadKw * 1.5 * 1000) / 1000
          }
        }
        // Cost-capacity scale vs the rule's own declared reference duty (see the
        // SUB_ASSEMBLY refKw comment). f = 1 when at/above reference or when the rule
        // declares none — those calibrations are untouched.
        const capRatio = rule.refKw && physics.kw > 0 ? physics.kw / rule.refKw : 1
        const costScale = capRatio >= 1 ? 1 : Math.pow(Math.max(capRatio, 0.005), 0.6)
        // CONSUME-THE-CONTRACT: a flow-rated pump has p.kw=0, so the Drive Motor + VSD would
        // collapse to the 1.5 kW floor. Bind the hydraulic motor power the sizing tool already
        // computed (e.g. irrigation_pump_motor_kw=9.653) so the motor reflects the real duty +
        // the casing/impeller/baseplate scale off the true power. Universal across all pumps.
        const cmk = motorKwFromContract(w, quantities)
        if (cmk.kw > 0) {
          const pinned = briefPinnedKeys?.has(cmk.key) ?? false
          const parentRp = wordPowerKw(w)
          // Mirror reconcileDriveTrainRatings: pin exact; else IEC-frame, but never a
          // full-frame jump above the machine nameplate (4.5→5.5 nursery fertigation).
          // GOTCHA: metering/trim motors (<1 kW, e.g. acid dosing 0.04 kW) must NEVER
          // IEC-frame to 0.75/1.1 — that re-inflates the trim duty the contract minted
          // (Codema ship Acid Dosing Pump · 0 kW / Drive Motor 1 kW, 2026-07-09).
          const IEC_NAMEPLATE_BUMP_TOL = 1.12
          const isMeteringMotor = cmk.kw < 1
          let drive = (pinned || isMeteringMotor) ? cmk.kw : nextMotorFrameKw(cmk.kw)
          if (!pinned && !isMeteringMotor && parentRp > 0
              && drive / parentRp > IEC_NAMEPLATE_BUMP_TOL + 1e-9) {
            drive = parentRp
          }
          if (!isMeteringMotor && parentRp > 0
              && drive / parentRp > RATING_PAIR_SERVICE_TOL + 1e-9) {
            let capped = parentRp
            for (const f of IEC_MOTOR_FRAMES_KW) {
              if (f + 1e-9 >= parentRp && f / parentRp <= RATING_PAIR_SERVICE_TOL + 1e-9) capped = f
              if (f > parentRp * RATING_PAIR_SERVICE_TOL) break
            }
            if (capped / parentRp > RATING_PAIR_SERVICE_TOL + 1e-9) capped = parentRp
            drive = capped
          }
          physics.motorKwOverride = drive
          physics.motorKwPinned = true
          if (physics.kw === 0) physics.kw = drive
        }
        for (const spec of rule.parts) {
          out.push(subWord(spec, id || sanitizeId(nm), physics.qty, physics, costScale))
          added += 1
        }
      }
      sm.words = out
    }
  }
  return added
}

// ── DRIVE-TRAIN RATING RECONCILE (Tristan 2026-07-03 — the v56c/v56d rating-pair fix) ──────
// The deterministic rating-pair corroboration (dossier_audit._rating_pair_sweep) proved 3
// REAL drive-train mint defects: the old motor rule stacked a ×1.15 service factor on top of
// IEC-frame rounding AND ignored brief-pinned machine ratings (fertigation pump 8 kW with an
// 11 kW motor vs the brief's stated 7.5 kW Lowara; RO 5.5-vs-4.2; drain 3-vs-2 — each pair
// beyond the 1.25× motor-service tolerance → Risk 7.5 / physics_fidelity 7 / floor 7). The
// SOURCE rule (motorKw/nextMotorFrameKw) is fixed above; THIS pass re-asserts the fixed rule
// onto drive-train children that already exist in the state (a prior run's mints — the
// explode is not re-run for surviving principals), so BOTH synthesis paths converge on the
// corrected ratings. Pairing is by character-id lineage (`<parent>_word__<child>`, the same
// exact join the audit sweep uses); only a DRIVEN-machine parent (pump/blower/compressor/…)
// is touched, and only when the target genuinely differs. Universal, deterministic, idempotent.
const DRIVEN_PARENT_NOUN_RE = /\b(pump|blower|compressor|fan|agitator|mixer|conveyor|feeder|centrifuge)s?\b/i
const DRIVE_CHILD_ID_RE = /motor|drive|vsd/i
function wordPowerKw(w: WordLike): number {
  for (const mc of w.modifier_characters ?? []) {
    if (mc.kind !== 'rating_primary' && mc.kind !== 'power' && mc.kind !== 'rating') continue
    const blob = `${mc.value ?? ''} ${mc.unit ?? ''}`
    if (/m³|m3|\/h|\/s|bar|°c|litre|\bv\b/i.test(blob)) continue // flow/pressure/voltage — not power
    if (!/kw/i.test(blob)) continue
    const v = parseFloat(String(mc.value))
    if (Number.isFinite(v) && v > 0) return v
  }
  return 0
}
/**
 * Resolve the driven-machine parent for a drive-train child character_id.
 * INTENT: completion-skeleton children use
 *   `<stem>__primary_assembly_completion_word__drive_motor`
 * (no `_word__` before the completion token), so the classic
 *   `/^(.+?)_word__(.+)$/`
 * never finds a parent and an 11 kW IEC-framed motor survives under a 7.5–8 kW
 * fertigation pump (Codema physics_fidelity floor, 2026-07-09). Walk candidate
 * parent cids from most-specific to stem until a driven-machine noun hits.
 */
function resolveDriveParent(
  childCid: string,
  byCid: Map<string, WordLike>,
): WordLike | undefined {
  const m2 = /^(.+?)_word__(.+)$/.exec(childCid)
  if (m2 && DRIVE_CHILD_ID_RE.test(m2[2])) {
    const direct = byCid.get(m2[1])
    if (direct && DRIVEN_PARENT_NOUN_RE.test(String(direct.name_human ?? ''))) return direct
  }
  // completion_word / primary_assembly_completion_word lineage (no `_word__` join)
  const mComp = /^(.*?)(?:__)?(?:primary_assembly_)?completion_word__(.+)$/.exec(childCid)
  if (!mComp || !DRIVE_CHILD_ID_RE.test(mComp[2])) return undefined
  const stem = mComp[1].replace(/_+$/, '')
  const candidates = [
    `${stem}__primary_assembly_primary_component`,
    `${stem}_synth`,
    `${stem}_word`,
    stem,
  ]
  for (const c of candidates) {
    const p = byCid.get(c)
    if (p && DRIVEN_PARENT_NOUN_RE.test(String(p.name_human ?? ''))) return p
  }
  // Last resort: any byCid entry whose cid starts with stem and is a driven noun
  // (not itself a drive child).
  for (const [cid, w] of byCid) {
    if (!cid.startsWith(stem)) continue
    if (/__(?:drive_motor|variable_speed_drive|motor|vsd|vfd)/.test(cid)) continue
    if (DRIVEN_PARENT_NOUN_RE.test(String(w.name_human ?? ''))) return w
  }
  return undefined
}

export function reconcileDriveTrainRatings(
  modules: ModuleLike[],
  quantities: Record<string, number>,
  briefPinnedKeys?: Set<string>,
): number {
  const byCid = new Map<string, WordLike>()
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    const cid = String(w.content_character?.character_id ?? '')
    if (cid && !byCid.has(cid)) byCid.set(cid, w)
  }
  let repaired = 0
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    const cid = String(w.content_character?.character_id ?? '')
    const parent = resolveDriveParent(cid, byCid)
    if (!parent) continue
    const cmk = motorKwFromContract(parent, quantities)
    let target = 0
    let basisNote = ''
    // Parent nameplate (if any) is the audit's left-hand side of the 1.25× motor-service
    // pair. A drive child must NEVER land above parent × 1.25 — that is exactly the
    // corroborated HIGH that floored physics_fidelity (fertigation 8 kW parent + 11 kW
    // motor from IEC-framing 7.691). Prefer contract/pin physics, then cap to the
    // service band so parent and motor stay one coherent drive train.
    // Prefer contract motor when the parent word itself carries no kW nameplate
    // (completion-skeleton primary_component often has only an MPN).
    const parentKw = wordPowerKw(parent) || (cmk.kw > 0 ? cmk.kw : 0)
    // Small IEC bump above a nameplate is OK (1.923→2.2 on a 2 kW drain); a full
    // frame jump is not (4.5→5.5 on nursery fertigation — Sam, 2026-07-09).
    const IEC_NAMEPLATE_BUMP_TOL = 1.12
    if (cmk.kw > 0) {
      const pinned = briefPinnedKeys?.has(cmk.key) ?? false
      if (pinned) {
        target = cmk.kw
        basisNote = `brief-pinned machine rating ${cmk.kw} kW (${cmk.key}) honoured exactly — a pin is a nameplate, never re-margined`
      } else {
        const framed = nextMotorFrameKw(cmk.kw)
        if (parentKw > 0 && framed / parentKw > IEC_NAMEPLATE_BUMP_TOL + 1e-9) {
          target = parentKw
          basisNote = `contract ${cmk.kw} kW (${cmk.key}) would IEC-frame to ${framed} kW (>${IEC_NAMEPLATE_BUMP_TOL}× nameplate ${parentKw} kW) — drive matches the machine shaft instead`
        } else {
          target = framed
          basisNote = `contract motor requirement ${cmk.kw} kW (${cmk.key}) → next IEC frame ${target} kW (single rounding, no stacked service factor)`
        }
      }
    } else if (parentKw > 0) {
      const framed = nextMotorFrameKw(Math.max(1.5, parentKw / 0.88))
      if (framed / parentKw > IEC_NAMEPLATE_BUMP_TOL + 1e-9) {
        target = parentKw
        basisNote = `driven machine ${parentKw} kW — drive matches the shaft (IEC frame ${framed} kW would overshoot the nameplate)`
      } else {
        target = framed
        basisNote = `driven machine ${parentKw} kW ÷ 0.88 motor efficiency → next IEC frame ${target} kW (single rounding)`
      }
    }
    if (parentKw > 0 && target > 0 && target / parentKw > RATING_PAIR_SERVICE_TOL + 1e-9) {
      // Cap: largest IEC frame still within the service band of the parent nameplate.
      // If even the parent itself is the only in-band value, use the parent (motor =
      // machine rating — the honest "same drive train" reading).
      let capped = parentKw
      for (const f of IEC_MOTOR_FRAMES_KW) {
        if (f + 1e-9 >= parentKw && f / parentKw <= RATING_PAIR_SERVICE_TOL + 1e-9) capped = f
        if (f > parentKw * RATING_PAIR_SERVICE_TOL) break
      }
      // Also accept the exact parent when no larger in-band frame exists.
      if (capped / parentKw > RATING_PAIR_SERVICE_TOL + 1e-9) capped = parentKw
      basisNote = `${basisNote}; capped to ${capped} kW so drive stays within ${RATING_PAIR_SERVICE_TOL}× parent nameplate ${parentKw} kW (rating-pair service band)`
      target = capped
    }
    if (!(target > 0)) continue
    const rp = (w.modifier_characters ?? []).find((mc) => mc.kind === 'rating_primary')
    if (!rp) continue
    if (rp.unit && !/kw/i.test(String(rp.unit))) continue // never rewrite a non-kW rating
    const cur = parseFloat(String(rp.value))
    if (!Number.isFinite(cur) || Math.abs(cur - target) <= 1e-9) continue
    rp.value = String(Math.round(target * 100) / 100)
    mergeMods(w, [mod('sizing_basis', `drive-train rating reconciled to the driven machine: ${basisNote}`)])
    repaired += 1
  }
  return repaired
}

// ── DUTY-LESS DRIVE WORD DERIVATION (Tristan 2026-07-04 — round-3 residual class) ──────
// A drive-family filler word ('Motor Starter' / 'VFD Drive' / 'VFD Controller') the
// skeleton emits with a FLAT character_id (no `<parent>_word__<child>` lineage join —
// 'motor_starter', not '<pump>_word__vfd') carries NO rating_primary at all, so the
// fill-blank duty-aware pin (emitter-completion.wordMotorDriveDutyKw) is permanently
// blind and the slot stays an honest-but-uninformative generic TBD forever. Two REAL
// signals can still supply the duty without guessing:
//   1. the SAME lineage join reconcileDriveTrainRatings uses (parent_word__child
//      character_id) — covers a properly-linked drive that simply hasn't run through
//      the reconcile yet (this pass runs BEFORE the reconcile in the sizing sequence,
//      so it stamps the INITIAL rating_primary the reconcile then re-asserts later);
//   2. MODULE-LEVEL driven-motor evidence: any DRIVEN_PARENT_NOUN_RE word in the SAME
//      module with a resolvable kW that is not already lineage-paired to another drive
//      word — the LARGEST unpaired one for a single starter/VFD word, or the SUM of all
//      unpaired ones for an MCC-LEVEL starter group (a 'Motor Control Center' / plural
//      'Starters' word represents the whole panel, not one motor).
// When NEITHER signal exists ANYWHERE in the module (the codema v70 case: 'Motor
// Starter' / 'Vfd Drive' / 'Vfd Controller' sit in `power_distribution`, which owns no
// pump/blower/compressor word at all — the driven equipment lives in a DIFFERENT
// module), the word has no physical referent to size against. Guessing a duty here
// would be worse than honesty (the ACS580-on-15kW physics HIGH this whole family exists
// to prevent) — stamp `mis_emission_note` so deterministic_finalize's scope-word rule
// can demote it to a scope note instead of shipping a fictional-duty or forever-generic
// priced equipment line. UNIVERSAL — no class table; keyed on the drive/starter
// vocabulary + the driven-machine noun family already used by the lineage reconcile.
const DRIVE_WORD_NAME_RE = /\b(vfd|vsd|variable[- ]?(?:speed|frequency)[- ]?(?:drive|controller)|soft[- ]?start\w*|motor starter|frequency converter|inverter drive)\b/i
// 'Motor Starter' (bare, singular) is the panel abstraction for the WHOLE starter group
// in an MCC — sum every unpaired motor. 'VFD Drive'/'VFD Controller'/'Soft Starter' are
// channel-specific (one drive sized to one motor, matching the Bar-B duty-aware pin
// philosophy elsewhere in this file) — largest-single, never a sum.
const MCC_GROUP_NAME_RE = /\bmotor control cent(?:er|re)\b|\bmcc\b|\bstarters\b|\bmotor starter\b/i

export interface DutylessDriveDerivationResult { derived: number; flagged: number }

export function deriveDutylessDriveWords(
  modules: ModuleLike[],
  quantities: Record<string, number>,
  briefPinnedKeys?: Set<string>,
): DutylessDriveDerivationResult {
  const safeModules = modules ?? []
  // Same global cid map reconcileDriveTrainRatings uses (lineage join, any module).
  const byCid = new Map<string, WordLike>()
  for (const m of safeModules) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
    const cid = String(w.content_character?.character_id ?? '')
    if (cid && !byCid.has(cid)) byCid.set(cid, w)
  }
  // Every parent character_id already lineage-paired to SOME drive word (any module) —
  // excluded from the module-level unpaired-motor fallback below.
  const pairedParentCids = new Set<string>()
  for (const cid of byCid.keys()) {
    const m2 = /^(.+?)_word__(.+)$/.exec(cid)
    if (m2 && DRIVE_CHILD_ID_RE.test(m2[2])) pairedParentCids.add(m2[1])
  }

  let derived = 0
  let flagged = 0
  for (const m of safeModules) {
    const moduleId = String((m as { module?: string }).module ?? '')
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const nm = String(w.name_human ?? w.content_character?.name_human ?? '')
        if (!DRIVE_WORD_NAME_RE.test(nm)) continue
        if (wordPowerKw(w) > 0) continue // already carries a duty — nothing to derive
        if ((w as { mis_emission_note?: string }).mis_emission_note) continue // already dispositioned

        let dutyKw = 0
        let basis = ''

        // 1. LINEAGE JOIN — the same exact rule reconcileDriveTrainRatings uses.
        const cid = String(w.content_character?.character_id ?? '')
        const lineageMatch = /^(.+?)_word__(.+)$/.exec(cid)
        if (lineageMatch && DRIVE_CHILD_ID_RE.test(lineageMatch[2])) {
          const parent = byCid.get(lineageMatch[1])
          if (parent && DRIVEN_PARENT_NOUN_RE.test(String(parent.name_human ?? ''))) {
            const cmk = motorKwFromContract(parent, quantities)
            if (cmk.kw > 0) {
              const pinned = briefPinnedKeys?.has(cmk.key) ?? false
              dutyKw = pinned ? cmk.kw : nextMotorFrameKw(cmk.kw)
              basis = `duty derived from driven motor ${dutyKw} kW (lineage: ${lineageMatch[1]}, contract requirement ${cmk.kw} kW${pinned ? ', brief-pinned' : ''})`
            } else {
              const parentKw = wordPowerKw(parent)
              if (parentKw > 0) {
                dutyKw = nextMotorFrameKw(Math.max(1.5, parentKw / 0.88))
                basis = `duty derived from driven motor ${parentKw} kW (lineage: ${lineageMatch[1]})`
              }
            }
          }
        }

        // 2. MODULE-LEVEL FALLBACK — the largest unpaired driven machine in the SAME
        //    module, or the sum of all unpaired ones for an MCC-level group word.
        if (!(dutyKw > 0)) {
          const driven: number[] = []
          for (const sm2 of m.sub_modules ?? []) {
            for (const w2 of sm2.words ?? []) {
              if (w2 === w) continue
              const nm2 = String(w2.name_human ?? w2.content_character?.name_human ?? '')
              if (!DRIVEN_PARENT_NOUN_RE.test(nm2)) continue
              const cid2 = String(w2.content_character?.character_id ?? '')
              if (cid2 && pairedParentCids.has(cid2)) continue // already lineage-paired elsewhere
              const cmk2 = motorKwFromContract(w2, quantities)
              const kw2 = cmk2.kw > 0 ? cmk2.kw : wordPowerKw(w2)
              if (kw2 > 0) driven.push(kw2)
            }
          }
          if (driven.length > 0) {
            if (MCC_GROUP_NAME_RE.test(nm)) {
              const sum = driven.reduce((s, d) => s + d, 0)
              dutyKw = nextMotorFrameKw(sum)
              basis = `duty derived from driven motor ${sum} kW (MCC-level group sum of ${driven.length} unpaired motor(s) in ${moduleId})`
            } else {
              const largestKw = driven.reduce((a, b) => Math.max(a, b), 0)
              dutyKw = nextMotorFrameKw(largestKw)
              basis = `duty derived from driven motor ${largestKw} kW (largest unpaired motor in ${moduleId})`
            }
          }
        }

        if (dutyKw > 0) {
          mergeMods(w, [
            mod('rating_primary', String(Math.round(dutyKw * 100) / 100), 'kW'),
            mod('sizing_basis', basis),
          ])
          derived += 1
        } else {
          // MIS-EMISSION: no motor evidence anywhere in the module — do not guess.
          ;(w as { mis_emission_note?: string }).mis_emission_note =
            `deterministic_finalize scope-note candidate: '${nm}' is a drive/starter word with ` +
            `no driven-motor evidence anywhere in module '${moduleId}' — a mis-emission (nothing to size against)`
          flagged += 1
        }
      }
    }
  }
  return { derived, flagged }
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
  // soften/osmosis/deionis/demineral/desalin added 2026-07-02 (codema v53): "gac_softener" +
  // "reverse_osmosis_skid" matched NO placement rule and fell to the structure/containment
  // FALLBACK — the scene then placed them in the far structure region, metres from the fluid
  // train they pipe into (the vision critic's "floating disconnected objects"). A water-
  // treatment noun belongs with the treatment/process module, like every other filter.
  { re: /filter|biofil|degas|skim|clarif|\buv\b|ozone|treat|media|membran|aerat|settl|disinfe|steril|soften|osmosis|deionis|demineral|desalin/i, module: /water_treatment|treatment|process/i },
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

/**
 * INTENT (T-22/T-13): N+1 backup movers must read as BACKUP/STANDBY on the BoM/P&ID,
 * not a bare "Fertigation Dosing Pump Backup" that looks like a second duty train.
 * UNIVERSAL: keyed on the `_backup` stem token minted by rule 9 — never a class table.
 */
function equipmentDisplayName(phrase: string): string {
  const parts = phrase.split(/[_\s]+/).filter(Boolean)
  const isBackup = parts.some((p) => /^backup$/i.test(p) || /^standby$/i.test(p))
  const core = parts.filter((p) => !/^backup$/i.test(p) && !/^standby$/i.test(p))
  const base = titleCase(core.join('_') || phrase)
  if (!isBackup) return base
  return `${base} (BACKUP / STANDBY)`
}

/**
 * INTENT (T-22): group fertigation/irrigation duty+backup (+ on-board dosing) under a
 * shared Pump Unit N parent tag so layout/P&ID can cluster them as one skid bay.
 * UNIVERSAL: zone-mover vocabulary + optional unit index from the count/phrase — no Codema hardcode.
 */
function pumpUnitParentTag(phrase: string, unitIndex?: number): string | undefined {
  const norm = phrase.replace(/[_-]+/g, ' ')
  if (!/\b(fertigation|irrigation|hand.?water|watering|sprinkler|distribution)\b/i.test(norm)) return undefined
  if (!/\bpump\b/i.test(norm)) return undefined
  // metering/trim pumps ride ON the unit but keep their own identity; still tag them
  // to the parent skid when they share the fertigation/irrigation zone vocabulary.
  const idx = unitIndex !== undefined && unitIndex >= 1 ? unitIndex : 1
  return `Pump Unit ${idx}`
}

function synthWord(g: EquipGroup): WordLike & { _synthesized?: boolean; _pump_unit_tag?: string } {
  const title = equipmentDisplayName(g.phrase)
  const mods: ModifierCharacter[] = []
  if (g.count !== undefined && g.count >= 2) mods.push(mod('quantity', `×${Math.round(g.count)}`))
  else mods.push(mod('quantity', '×1'))
  mods.push(...dimAndRatingFor(g))
  const isBackup = /_backup(?:_|$)/i.test(g.phrase) || /\bbackup\b/i.test(g.phrase.replace(/_/g, ' '))
  if (isBackup) {
    mods.push(mod('form', `${title} — labelled N+1 BACKUP/STANDBY replica of the duty pump unit (same rating); not a second duty train`))
  } else {
    mods.push(mod('form', `${title} — principal equipment sized from the engineering contract`))
  }
  const unitTag = pumpUnitParentTag(g.phrase)
  if (unitTag) {
    mods.push(mod('installation', `Skid assembly: ${unitTag} (duty${isBackup ? '+BACKUP' : ''} clustered as one pump-unit bay)`))
  } else {
    mods.push(mod('installation', 'Internal / external placement confirmed at layout / detailed design'))
  }
  mods.push(mod('part_number', 'TBD (detailed design)'))
  mods.push(mod('lifecycle', 'Concept design — catalogue part + exact MPN confirmed at detailed design'))
  const word: WordLike & { _synthesized?: boolean; _pump_unit_tag?: string } = {
    id: `${g.phrase}_synth_word`,
    name_human: title,
    content_character: { character_id: `${g.phrase}_synth`, name_human: title },
    modifier_characters: mods,
    _synthesized: true,
  }
  if (unitTag) word._pump_unit_tag = unitTag
  return word
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
// noun, no archetype table. (Deliberately excludes BARE 'switch'/'indicator' to avoid catching
// switchgear / transfer·disconnect·changeover switches / indicator lights, which DO carry a
// real electrical rating — the qualifier-gated PROCESS_SWITCH_INSTRUMENT_RE below covers the
// instrument half of those nouns.)
const FIELD_INSTRUMENT_RE =
  /\b(transmitters?|transducers?|sensors?|analy[sz]ers?|flow\s?meters?|gauges?|probes?|detectors?|thermocouples?|thermowells?|pyrometers?|manometers?|piezometers?|hygrometers?)\b/i
// A PROCESS-VARIABLE SWITCH / INDICATOR (codema v60, BoM line I-104): a pressure / level /
// temperature / flow / limit / float / proximity / vacuum / differential … SWITCH or
// INDICATOR is a field instrument — a P&ID tag wired to the PLC, never a kW machine. The
// bare nouns were DELIBERATELY excluded above (switchgear / disconnect·transfer·changeover
// switches / indicator lights carry real ratings), which left a coverage gap the fuzzy
// contract match fell through: the skeleton 'Low Pressure Switch' shared the 'pressure' stem
// with the ro_high_pressure_pump contract group and was stamped its 4 kW rating + the
// boxFromRatingKw floor box (600×510×660 mm) — the SAME instrument-never-kW physics family
// as the 2026-06-27 "2 kW pressure transducer", reached through the excluded noun. Gated on
// a MEASURED-VARIABLE qualifier immediately before the noun so every electrical exclusion
// above still holds ('disconnect switch' / 'switchgear' / 'emergency stop switch' never match).
const PROCESS_SWITCH_INSTRUMENT_RE =
  /\b(pressure|vacuum|level|temperature|thermal|flow|limit|float|proximity|position|differential|speed|vibration)[\s-]*(switch(?:es)?|indicators?)\b/i
function isFieldInstrumentByName(w: WordLike): boolean {
  const nm = String(w.name_human ?? '')
  return FIELD_INSTRUMENT_RE.test(nm) || PROCESS_SWITCH_INSTRUMENT_RE.test(nm)
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
// ── INSTRUMENT MACHINE-ATTRIBUTE STRIP (codema v60 I-104 — the skip's other half) ──────────
// The isInstrument skip below prevents a NEW fuzzy machine stamp, but a word that ALREADY
// carries one (minted before the noun joined the family, or authored upstream) sailed
// through untouched: v60's 'Low Pressure Switch' reached the BoM reading
// '4 kW · 600x510x660 mm' with a rotating_electrical service — an instrument wearing a
// machine's clothes (£76 Danfoss KPI35 catalogue pin vs a machine-priced £420 estimate).
// Strip, at the SAME choke point as the skip, any machine kW/kVA rating, any machine-scale
// 3-axis box (longest side > the instrument envelope — a real switch/transmitter body is
// ≲0.3 m), and any stale rotating_electrical service from an instrument-family word,
// recording provenance on source_detail. A rating with NO kW/kVA unit (an instrument's
// measuring RANGE from instrumentWord()) and honest small library dims are untouched; a
// real machine never enters (isInstrument gates the call). UNIVERSAL — no class table.
const INSTRUMENT_MAX_ENVELOPE_MM = 400
const MACHINE_BOX_DIM_RE = /^(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s*mm$/i
function stripMachineAttrsFromInstrument(w: WordLike): number {
  const mods = w.modifier_characters ?? []
  const stripped: string[] = []
  const keep = mods.filter((mc) => {
    if (mc.kind === 'rating_primary' || mc.kind === 'rating_secondary') {
      if (/k(?:w|va)\b/i.test(String(mc.unit ?? ''))) {
        stripped.push(`${mc.value} ${mc.unit} rating`)
        return false
      }
    }
    if (mc.kind === 'dimension' || mc.kind === 'dimensions') {
      const m = MACHINE_BOX_DIM_RE.exec(String(mc.value ?? '').trim())
      if (m && Math.max(Number(m[1]), Number(m[2]), Number(m[3])) > INSTRUMENT_MAX_ENVELOPE_MM) {
        stripped.push(`${String(mc.value).trim()} machine box`)
        return false
      }
    }
    if (mc.kind === 'service' && /"fabrication_family"\s*:\s*"rotating_electrical"/.test(String(mc.value ?? ''))) {
      stripped.push('rotating_electrical service')
      return false
    }
    return true
  })
  if (stripped.length === 0) return 0
  w.modifier_characters = keep
  const prior = String((w as { source_detail?: unknown }).source_detail ?? '').trim()
  ;(w as { source_detail?: string }).source_detail =
    `${prior ? prior + ' · ' : ''}instrument-guard: stripped machine attrs (${stripped.join('; ')}) — a field instrument is a P&ID tag, never a kW machine`
  return stripped.length
}
// An ELECTRICAL POWER-DISTRIBUTION device word (transformer / switchgear / switchboard /
// MCC / UPS / busbar / incomer / distribution board / genset / VFD). Codema v53: the
// 5-char stem 'trans' is shared by "Distribution TRANSformer" and the drain_TRANSfer_pump
// contract group, so the fuzzy sizing match stamped the transformer with the pump group's
// 700x595x770 mm flow box + a bogus "45 m³/h" rating + a phantom ×2 count — an electrical
// machine rated in water flow, and the 5th member of the default-size litter cluster. An
// electrical-distribution device may only ever be sized from an ELECTRICAL group (kW /
// kVA / A) — never a fluid volume / flow / mass-rate group. Deliberately NARROW nouns:
// a bare "generator" is NOT here (a steam/oxygen/nitrogen generator is process
// equipment) — only the explicitly electrical genset forms. UNIVERSAL, no class table.
const ELECTRICAL_DISTRIBUTION_DEVICE_RE =
  /\b(transformers?|switchgear|switchboards?|substations?|rectifiers?|inverters?|ups|busbars?|mcc|motor control cent(?:re|er)s?|distribution (?:boards?|panels?)|panel ?boards?|gensets?|(?:diesel|standby|backup|emergency) generators?|incomers?|vfds?|variable[- ]frequency drives?)\b/i
function isElectricalDistributionWord(w: WordLike): boolean {
  const name = `${w.name_human ?? ''} ${w.content_character?.name_human ?? ''} ${w.content_character?.character_id ?? ''} ${w.id ?? ''}`
    .replace(/_+/g, ' ')
  return ELECTRICAL_DISTRIBUTION_DEVICE_RE.test(name)
}
// A contract group whose driving physics is FLUID / MASS-RATE — the measures an
// electrical-distribution device must never adopt a size or rating from.
function groupIsFluidSized(g: EquipGroup): boolean {
  return g.volume !== undefined || g.throughput !== undefined || g.perUnitFlow !== undefined || g.rate !== undefined
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

// A LEVEL transmitter is a CATALOGUE instrument with STANDARD measuring ranges — you order
// the next standard range at/above the span you must read, you cannot order a "3.7 m"
// custom span at concept design. An LT's range therefore derives from its HOST vessel's
// height: nextStdLevelRange(host height). THE BUG this encodes against (codema v50
// physics-critic HIGH): the emitted range was the RAW host height (0–1.4 m from the sump)
// while the plant's tallest liquid vessels (3.7 m storage tanks) both exceeded the range
// AND — being minted by the later reconcile path — carried no level instrument at all.
// UNIVERSAL — keyed on host geometry only, no class table.
const STD_LEVEL_RANGES_M = [1.4, 2, 3, 4, 6, 8, 10, 15, 20, 30]
function stdLevelRangeM(htM: number): number {
  return STD_LEVEL_RANGES_M.find((r) => r >= htM - 1e-9) ?? Math.ceil(htM)
}
function fmtLevelRange(htM: number): string {
  const r = stdLevelRangeM(htM)
  return `0–${Number.isInteger(r) ? String(r) : r.toFixed(1)} m`
}

const INSTRUMENT_FAMILIES: InstrumentSpec[] = [
  { key: 'level', scope: 'level', principle: 'guided-radar', present: () => true, label: 'Level Transmitter', gbp: 900,
    // next STANDARD range ≥ the host vessel's height (never the raw height, never a shorter
    // sibling's range) — see STD_LEVEL_RANGES_M above.
    range: (_q, p) => (p.htM > 0 ? fmtLevelRange(p.htM) : '0–100 %'),
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
  // BANDED consolidation (codema v61): when the served vessels span SEVERAL standard
  // measuring ranges, each range band ships its OWN consolidated line — the suffix keeps
  // the per-band word ids distinct + stable ('' / absent = the classic single-band line).
  idSuffix?: string
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
  // CONSOLIDATED instrument is keyed by its spec (not a host) so it is one stable id, never per
  // host; a BANDED consolidated line (several standard-range bands) adds its range-band suffix.
  const id = (consolidation
    ? `instr_${spec.key}_consolidated${consolidation.idSuffix ? `_${consolidation.idSuffix}` : ''}`
    : `instr_${spec.key}_on_${sanitizeId(hostId)}`).replace(/__+/g, '_')
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

  // idempotency: drop any instruments a prior pass ADDED (re-derive cleanly). Keyed on
  // the `_instrument` SYNTHESIS flag only — never the name-based family: a GROUNDED /
  // library-matched instrument word (codema v60's 'Low Pressure Switch', a £76 Danfoss
  // KPI35 catalogue pin) is authored equipment this pass never minted and must survive
  // the re-derive (dropping it by name deletes its BoM line entirely).
  for (const m of modules ?? []) for (const sm of m.sub_modules ?? []) {
    if (Array.isArray(sm.words)) sm.words = sm.words.filter((w) => (w as { _instrument?: boolean })._instrument !== true)
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
    // ≥2 vessel types → consolidate, ONE LINE PER STANDARD-RANGE BAND (codema v61 physics-
    // critic, 2026-07-03). The v50 rule (range = next STANDARD range ≥ the TALLEST served
    // vessel) is kept — but applied PER BAND, not across the whole plant: one 0–4 m line
    // serving a 1.4 m GAC filter reads that vessel over ~1/3 of its span (a ~2/3 usable-
    // resolution loss on every short vessel sharing the line). Each served vessel takes the
    // SMALLEST standard range ≥ its own height (the STD_LEVEL_RANGES_M ladder, via
    // spec.range), vessels sharing a range group into one band, and each band ships its own
    // consolidated line (per-band quantity + vessel_location; total count conserved).
    // Families whose range is NOT vessel-height-derived (temperature / pressure / DO read
    // CONTRACT quantities — identical on every vessel) collapse to ONE band and keep the
    // classic single consolidated line byte-identically (no gratuitous split). A vessel
    // ABOVE the ladder max keeps a ≥-height CUSTOM range (never a shorter standard range —
    // the v50 unmonitored-head-space bug) and its band is FLAGGED for detailed design.
    // UNIVERSAL — banded on the emitted range string only, no class table.
    const ladderMaxM = STD_LEVEL_RANGES_M[STD_LEVEL_RANGES_M.length - 1]
    const isAboveLadder = (v: (typeof served)[number]) => spec.scope === 'level' && (v.p.htM || 0) > ladderMaxM
    const bands = new Map<string, typeof served>()
    for (const v of served) {
      // all above-ladder vessels share ONE top band (keyed apart from the standard ranges so
      // e.g. a 32 m and a 35 m silo don't fragment into two custom lines)
      const key = isAboveLadder(v) ? '__above_ladder__' : spec.range(quantities, v.p)
      const arr = bands.get(key) ?? []
      arr.push(v)
      bands.set(key, arr)
    }
    const bandNum = (key: string): number => {
      if (key === '__above_ladder__') return Number.MAX_SAFE_INTEGER
      const m = /([\d.]+)\s*m\b/.exec(key)
      return m ? parseFloat(m[1]) : 1e9 // non-metric ranges ('0–100 %') sort after the metric bands
    }
    const multiBand = bands.size > 1
    for (const [key, bandServed] of [...bands.entries()].sort((a, b) => bandNum(a[0]) - bandNum(b[0]))) {
      const flagged = key === '__above_ladder__'
      // Band host = the largest served vessel IN the band (the primary when it is in the band).
      const hostV = bandServed.includes(primary) ? primary : bandServed.slice().sort((a, b) => b.cap * b.count - a.cap * a.count)[0]
      // The band's RANGE must still span its TALLEST vessel (the v50 ≥-tallest direction) —
      // the host is the largest by CAPACITY (a wide, shallow sump) which can be SHORTER than
      // a narrow, tall vessel in the same band. Height-ranged 'level' family only; the other
      // families' ranges are quantity-derived (identical on every band member).
      const rangeV = spec.scope === 'level'
        ? bandServed.slice().sort((a, b) => (b.p.htM || 0) - (a.p.htM || 0))[0]
        : hostV
      const range = spec.range(quantities, rangeV.p)
      if (bandServed.length === 1 && !flagged) {
        // a band serving ONE vessel type keeps its verbatim per-vessel word — the same rule
        // as a single served vessel (no consolidation payload, host-keyed id).
        const v = bandServed[0]
        toAdd.push(instrumentWord(spec, v.w, v.count, range))
        continue
      }
      const totalQty = bandServed.reduce((s, v) => s + Math.max(1, Math.round(v.count)), 0)
      const perVessel = bandServed.map((v) => ({ name: v.w.name_human ?? 'vessel', qty: Math.max(1, Math.round(v.count)), range: spec.range(quantities, v.p) }))
      const flag = flagged ? ' — above the standard measuring-range ladder: custom range, confirm at detailed design' : ''
      const vesselLocation = perVessel.map((p) => `${p.name.toLowerCase()} ×${p.qty} (${p.range})`).join(', ') + flag
      // The combined requirement: the family's own form on the band host, then the per-vessel
      // breakdown so every served vessel's range is explicit on the line.
      const combinedForm = `${spec.form(hostV.w.name_human ?? 'the served vessels')} Consolidated across ${vesselLocation} — one schedule line for the ${spec.label.toLowerCase()} on every served vessel${multiBand ? ` in the ${range} range band` : ''}.`
      toAdd.push(instrumentWord(spec, hostV.w, totalQty, range, { vesselLocation, combinedForm, idSuffix: multiBand ? sanitizeId(range) : '' }))
    }
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

// INTENT: pump sub-assembly explode mints "Suction Isolation Valve (on … Pump)".
// The next explode depth matched the pump SUB_ASSEMBLY rule because the parenthetical
// contains `\bpump\b`, then minted a full nested drive train (Drive Motor 5.5 kW under
// a 4.5 kW nursery fertigation pump's isolation valve — Codema ship, 2026-07-09).
// Valve fittings are priced whole; they must never re-explode as rotating machines.
const VALVE_FITTING_NAME_RE =
  /\b(?:isolation|non-?return|check|control|butterfly|gate|ball|globe|solenoid|relief|vent|drain|modulating)\b[\w\s/-]*\bvalves?\b|\bvalves?\b[\w\s/-]*\b(?:isolation|non-?return|check|control)\b/i
function isValveFitting(w: WordLike): boolean {
  if (isActuator(w)) return true
  return VALVE_FITTING_NAME_RE.test(String(w.name_human ?? ''))
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
  // OPTIONAL basis: the STATED derivation of the £ estimate (what the price includes + the
  // class formula), stamped as a `price_basis` modifier so the BoM row carries an auditable
  // basis string instead of a bare "catalogue-class budget" (gate-36 round 2 — the SCADA
  // £62,650 read as an unexplained outlier because nothing STATED £60k base + £50/kW).
  basis?: (d: number) => string
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
// The load families the standby genset actually protects, derived from the contract's OWN
// quantity keys (a physical signal, never a product class): a recirculation duty implies
// pump loads, an oxygen duty implies oxygenation, a ventilation duty implies air handling,
// etc. "controls" always applies (the genset always rides the plant controls through an
// outage). Deterministic order; used by the standby_generator `form` rationale.
export function standbyLoadFamilies(q?: Record<string, number>): string {
  const keys = Object.keys(q ?? {}).join(' ').toLowerCase()
  const fams: string[] = []
  for (const [re, label] of [
    [/recirc|circulation|circulat/, 'recirculation'],
    [/oxygen|aerat|\bdo_|dissolved_o/, 'oxygenation'],
    [/pump/, 'process pumping'],
    [/dosing|dose_|chemical/, 'dosing'],
    [/uv_|disinfect|steril/, 'disinfection'],
    [/ventilation|hvac|air_change|airflow/, 'ventilation'],
    [/heating|heat_pump|makeup_heat/, 'heating'],
    [/cooling|chiller|refriger|thermal_dissipation/, 'cooling'],
  ] as [RegExp, string][]) {
    if (re.test(keys) && !fams.includes(label)) fams.push(label)
  }
  const top = fams.slice(0, 3)
  top.push('controls')
  return top.join(' + ')
}

const UTILITY_SYSTEMS: UtilitySpec[] = [
  { key: 'standby_generator', driver: (q) => pickQ(q, /connected_electrical_load_kw|total_supply_demand_kw/), label: 'Standby Diesel Generator', module: /power|electric|distribution/,
    size: (load) => { const crit = load * 0.7; return { dim: boxFromRatingKw(crit), rating: [String(stdGenset(crit / 0.8)), 'kVA'], gbp: Math.round(crit * 400 + 30000) } },
    // The covered-load description is DERIVED from the load families the contract actually
    // declares — never a class narrative (the old fixed "(recirculation + oxygenation +
    // controls) … a RAS loses its stock" string shipped verbatim on a potable-water plant,
    // v54 2026-07-02). Universal: keyed on quantity-key signals; "controls" always applies.
    form: (load, q) => `Containerised standby diesel genset + automatic transfer switch + day tank; covers the ~${Math.round(load * 0.7)} kW life-safety / essential load (${standbyLoadFamilies(q)}) on a mains failure` },
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
  if (spec.basis) mods.push(mod('price_basis', spec.basis(d)))
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
    // P1-D (Sam/Codema 2026-07-08): was £60k + £50/kW → £63k on a 67 kW plant (~2× a
    // realistic installed SCADA for this scale). Recalibrated: £25k base + £80/kW → ~£30k
    // at 67 kW (industry band for a single-plant fertigation SCADA + PLC + HMI + I/O).
    size: (kw) => ({ dim: '', rating: [String(Math.round(kw)), 'kW plant'], gbp: Math.round(25000 + kw * 80) }),
    // stated basis (gate-36 round 2): the £ is a whole-system supply+install budget, not a
    // panel price — state WHAT it includes + the class formula so a reader can audit it.
    basis: (kw) => `installed process system — catalogue-class budget: £25k base (PLC rack + SCADA/HMI + I/O + plant network + software licences + panel build + commissioning; supply + install) + £80/kW × ~${Math.round(kw)} kW connected plant load`,
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

  // SCOPE FIDELITY (Tristan 2026-06-25): if the brief EXPLICITLY excludes the building FABRIC
  // / polytunnel / hall / rack framework (a process plant supplied INTO an existing building by
  // others), do NOT synthesise a hall around the equipment. Otherwise the universal
  // BUILDING_ELEMENTS add a floor slab + portal frame + cladding + foundations regardless of scope
  // — a £1.1M+ scope-creep line on a plant whose building is supplied by others. Keyed on the brief's
  // OWN exclusion words (carried on the contract by any archetype that emits scope_exclusions_desc),
  // universal + opt-in — no per-class table. A class that excludes nothing is unaffected (the
  // building still synthesises as before).
  // GOTCHA (T-06/E-03): "civils" in exclusions historically meant building fabric — underground
  // drain-pit excavation is a SEPARATE BoM line (civils_rows_from_underground_scope) and must
  // NOT be suppressed by this flag. The flag only skips the hall synthesis.
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
  if (buildingExcludedFlag >= 1 || /\bbuilding\b|\bcivils?\b|\bthe\s+hall\b|process\s+hall|rack\s+framework|polytunnel|building\s+fabric/.test(scopeExclusions)) {
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

  // 1b) PACKAGED ASSEMBLY / structural frame (skid, frame, rack, cabinet, enclosure, gantry, package) —
  //     FABRICATED as a steel structure carrying components, NOT a fluid containment vessel; its m³ is the
  //     ENVELOPE, not a holdup. Without this a "RO skid (10 m³ envelope)" fell through to the capM3≥1 fluid
  //     branch below and was classed + priced as a 10 m³ fluid vessel (physics-critic HIGH: "a skid frame
  //     is a structural support, not a fluid containment vessel"). Universal — keyed on the assembly noun;
  //     a genuine vessel noun (tank/drum/column/…) in the name excludes it so a "tank skid" stays a vessel.
  const nmS = w.name_human ?? ''
  if (/\bskids?\b|\bframes?\b|\bracks?\b|\bcabinets?\b|\benclosure\b|\bgantry\b|\bpackage\b|\bpallet\b/i.test(nmS)
      && !/tank|vessel|drum|column|tower|reactor|separator|clarifier|basin|sump|scrubber|absorber|degasser/i.test(nmS)) {
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
    name: equipmentDisplayName(g.phrase),
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
  instrumentsResynthesised: number // instruments re-derived against the FINAL vessel set (two-paths coverage)
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

// INTENT: A brief "200 actuated valves" population is often emitted under BOTH a solenoid
// name AND a pneumatic-actuated name (plus singular/plural). Those are the SAME 200 valves
// under synonym labels — collapsing only exact singularised names left Solenoid Valves ×200
// beside Pneumatic Actuated Valves ×200 (and Solenoid Valve ×200) → population_duplication HIGH.
// DECISION: for population counts, also key by a ROLE family when the name is clearly an
// on/off actuated process valve (solenoid / pneumatic / electric / motorised). Distinct
// families (manual ball, check, sample) keep their own keys and never collapse together.
function _populationRoleKey(name: string): string {
  const sing = _singularisePhrase(name)
  if (/\b(solenoid|pneumatic|electric|motor(?:is|iz)ed|actuated)\b/.test(sing)
      && /\bvalve\b/.test(sing)
      && !/\b(manual|ball|check|sample|relief|butterfly|gate|needle)\b/.test(sing)) {
    return 'actuated_on_off_valve'
  }
  return sing
}

export function dropAttributePhantomWords(modules: ModuleLike[]): { droppedPhantom: number; droppedDuplicate: number } {
  let droppedPhantom = 0
  let droppedDuplicate = 0
  const seenIds = new Set<string>()
  // POPULATION duplicate guard (Tristan 2026-06-27): a high-count population emitted under both a
  // SINGULAR and a PLURAL name ('Pneumatic Actuated Valve ×200' + 'Pneumatic Actuated Valves ×200') is
  // the SAME 200 valves counted twice — the physics critic's "multiple redundant groups of 200" HIGH.
  // De-dup across the WHOLE design by (role-or-singularised-name, count) for population words
  // (count ≥ POP_MIN), keeping the first. Safe: two genuinely-distinct parts won't share an
  // identical role key AND count (manual vs actuated stay distinct).
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
            const key = `${_populationRoleKey(name)}|${count}`
            if (seenPopKey.has(key)) { droppedDuplicate += 1; return false }
            seenPopKey.add(key)
          }
        }
        return true
      })
    }
    // INTENT: dropping a synonym population word can empty its host sub_module
    // (Codema: actuation_kinematics__solenoid_valve left with words=[] after the
    // survivor stayed in __solenoid_valves). A hollow described sub_module fails
    // the modules:hollow_count invariant — prune empties that lost every word.
    if (Array.isArray(m.sub_modules)) {
      m.sub_modules = m.sub_modules.filter((sm) => {
        if (!Array.isArray(sm.words)) return true
        return sm.words.length > 0
      })
    }
  }
  return { droppedPhantom, droppedDuplicate }
}

// ── BRIEF-STATED MEMBRANE-STAGE GATE (2026-07-09, Codema ship UF banks) ──────────────────
// INTENT: A brief that names only RO (city water → particle → GAC → softener → RO) must
// never ship UF / NF / MF membrane banks the generator invented from library candidates
// (Toray HFU-2020AN UF Module, Uf Membrane Bank, Uf Module Bank — codema-ship). Those words
// are NOT `_synthesized` so the invented-principal drop never sees them, and they have no
// contract group either — they survive as grounded phantoms on the P&ID.
// DECISION: Key off BRIEF TEXT vocabulary (ultrafiltration / nanofiltration / microfiltration
// / \buf\b / \bnf\b / \bmf\b), never a class table. When the brief is silent on a membrane
// stage family, drop every principal word whose name/id claims that family. RO-only briefs
// keep reverse-osmosis words. A brief that DOES name UF keeps UF words (proveNoFalsePositive).
// When briefText is empty/absent the pass is a strict no-op (never invent a drop without
// evidence the brief omitted the stage).
const MEMBRANE_STAGE_FAMILIES: Array<{ family: string; briefRe: RegExp; wordRe: RegExp }> = [
  {
    family: 'ultrafiltration',
    briefRe: /\bultra[\s-]?filtrat|\buf\b/i,
    wordRe: /\bultra[\s-]?filtrat|\buf\b/i,
  },
  {
    family: 'nanofiltration',
    briefRe: /\bnano[\s-]?filtrat|\bnf\b/i,
    wordRe: /\bnano[\s-]?filtrat|\bnf\b/i,
  },
  {
    family: 'microfiltration',
    briefRe: /\bmicro[\s-]?filtrat|\bmf\b/i,
    wordRe: /\bmicro[\s-]?filtrat|\bmf\b/i,
  },
]

/**
 * @description Drop principal membrane-stage words (UF/NF/MF banks/modules) the brief never
 *   named. Mutates `modules` in place. Strict no-op when `briefText` is empty.
 * @param modules Module tree (words mutated).
 * @param briefText Original / revised brief prose used as the stated-unit-op signal.
 * @returns Count of principal words dropped (children of dropped principals also removed).
 */
export function dropUnstatedMembraneStages(
  modules: ModuleLike[],
  briefText: string | undefined | null,
): number {
  const brief = String(briefText ?? '').trim()
  if (!brief) return 0
  const absent = MEMBRANE_STAGE_FAMILIES.filter((f) => !f.briefRe.test(brief))
  if (absent.length === 0) return 0
  let dropped = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      const dropIds = new Set<string>()
      for (const w of sm.words) {
        if (isSubcomponent(w) || isInstrument(w) || isActuator(w)) continue
        const blob = `${w.name_human ?? ''} ${w.id ?? ''} ${w.content_character?.character_id ?? ''}`.replace(/[_-]+/g, ' ')
        // Never drop an RO / reverse-osmosis principal via a short \buf\b false match inside
        // an unrelated token — family regexes already require word boundaries.
        if (/\breverse[\s-]?osmos|\bro\b/i.test(blob) && !absent.some((f) => f.wordRe.test(blob))) continue
        for (const f of absent) {
          if (f.wordRe.test(blob)) {
            dropIds.add(String(w.id ?? ''))
            break
          }
        }
      }
      if (dropIds.size === 0) continue
      const before = sm.words.length
      sm.words = sm.words.filter((w) => {
        const id = String(w.id ?? '')
        if (dropIds.has(id)) { dropped += 1; return false }
        // Drop exploded children of a dropped principal (`<id>__…`).
        for (const pid of dropIds) {
          if (pid && id.startsWith(`${pid}__`)) { dropped += 1; return false }
        }
        return true
      })
      void before
    }
  }
  return dropped
}

// ── BRIEF-STATED ION-EXCHANGE / SOFTENER GATE (2026-07-09, T-19) ─────────────────────────
// INTENT: Mirror of dropUnstatedMembraneStages for softener / ion-exchange / resin beds.
// A brief that never names softening (RO-only makeup, or a plant with no hardness treatment)
// must never ship Softener Vessel / ion-exchange resin beds the generator invented from
// library candidates. Those words are often grounded (not `_synthesized`) so the invented-
// principal drop never sees them.
// DECISION: Key off BRIEF TEXT vocabulary (soften / ion-exchange / resin / deioni /
// demineral), never a class table. Plain GAC / activated-carbon filters are NOT softeners —
// wordRe only matches when the word's name/id claims softener/ion-exchange/resin, so a
// "Gac Filter" survives while "Gac Softener" / "Softener Vessel" drop when the brief is silent.
// Codema's brief names "water softener duplex" → briefRe matches → KEEP (proveNoFalsePositive).
// Empty briefText → strict no-op.
const ION_EXCHANGE_BRIEF_RE = /\bsoften|\bion[\s-]?exchange|\bresin\b|\bdeioni|\bdemineral/i
const ION_EXCHANGE_WORD_RE = /\bsoften|\bion[\s-]?exchange|\bresin\b|\bdeioni|\bdemineral/i
const ION_EXCHANGE_STAGE_FAMILIES: Array<{ family: string; briefRe: RegExp; wordRe: RegExp }> = [
  {
    family: 'ion_exchange_softener',
    briefRe: ION_EXCHANGE_BRIEF_RE,
    wordRe: ION_EXCHANGE_WORD_RE,
  },
]

/**
 * @description Drop principal softener / ion-exchange / resin-bed words the brief never
 *   named. Mutates `modules` in place. Strict no-op when `briefText` is empty. Does NOT
 *   drop plain GAC / activated-carbon filters (those lack softener/ion-exchange/resin tokens).
 * @param modules Module tree (words mutated).
 * @param briefText Original / revised brief prose used as the stated-unit-op signal.
 * @returns Count of principal words dropped (children of dropped principals also removed).
 */
export function dropUnstatedIonExchangeStages(
  modules: ModuleLike[],
  briefText: string | undefined | null,
): number {
  const brief = String(briefText ?? '').trim()
  if (!brief) return 0
  const absent = ION_EXCHANGE_STAGE_FAMILIES.filter((f) => !f.briefRe.test(brief))
  if (absent.length === 0) return 0
  let dropped = 0
  for (const m of modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      if (!Array.isArray(sm.words)) continue
      const dropIds = new Set<string>()
      for (const w of sm.words) {
        if (isSubcomponent(w) || isInstrument(w) || isActuator(w)) continue
        const blob = `${w.name_human ?? ''} ${w.id ?? ''} ${w.content_character?.character_id ?? ''}`.replace(/[_-]+/g, ' ')
        for (const f of absent) {
          if (f.wordRe.test(blob)) {
            dropIds.add(String(w.id ?? ''))
            break
          }
        }
      }
      if (dropIds.size === 0) continue
      sm.words = sm.words.filter((w) => {
        const id = String(w.id ?? '')
        if (dropIds.has(id)) { dropped += 1; return false }
        for (const pid of dropIds) {
          if (pid && id.startsWith(`${pid}__`)) { dropped += 1; return false }
        }
        return true
      })
    }
  }
  return dropped
}

/**
 * @description Strip softener_* (and gac_softener_*) quantity keys from the reconcile
 *   synthesis map when the brief never named softener/ion-exchange/resin. Prevents
 *   buildGroups → re-mint of Softener Vessel after the word drop. No-op on empty brief
 *   or when brief vocabulary matches. Mutates `quantities` in place.
 * @param quantities Flat numeric quantity map used by buildGroups / reconcile.
 * @param briefText Brief prose (same signal as dropUnstatedIonExchangeStages).
 * @returns Number of keys removed.
 */
export function stripUnstatedSoftenerQuantities(
  quantities: Record<string, number>,
  briefText: string | undefined | null,
): number {
  const brief = String(briefText ?? '').trim()
  if (!brief) return 0
  if (ION_EXCHANGE_BRIEF_RE.test(brief)) return 0
  let removed = 0
  for (const k of Object.keys(quantities)) {
    // softener_vessel_count / softener_vessel_volume_each_m3 / softener_*_throughput /
    // gac_softener_throughput_m3_h — any key whose stem claims softener.
    if (/softener/i.test(k)) {
      delete quantities[k]
      removed += 1
    }
  }
  return removed
}

export function reconcilePrincipalEquipment(
  modules: ModuleLike[],
  contract: ContractInProgress,
  reconcileOpts: { briefMetrics?: BriefTargetMetric[]; briefText?: string } = {},
): PrincipalReconcileResult {
  const res: PrincipalReconcileResult = {
    groups: 0, repaired: 0, removedDuplicates: 0, removedSynonymDuplicates: 0, removedInvented: 0, removedOrphanChildren: 0, synthesizedMissing: 0, buildingResynthesised: 0, instrumentsResynthesised: 0, rehostedDependents: 0, removedDuplicateDependents: 0, details: [],
  }

  const quantities: Record<string, number> = {}
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(q)) {
    const val = v?.value
    if (typeof val === 'number' && Number.isFinite(val)) quantities[k] = val
  }
  // DEMAND-COVERAGE (choke-point feed — codema v51): mint the delivered supply-pump
  // quantities for any uncovered fluid-delivery demand + the motor floor for any motorless
  // pump-flow family BEFORE buildGroups, so the reconcile's canons carry the pump group on
  // every run regardless of the generator's word-set luck (see mintDemandCoverage). A mint
  // persists to contract.quantities ('demand-coverage' provenance) so the compliance matrix
  // verifies the brief demand metric. Strict no-op (byte-identical) when nothing is missing.
  mintDemandCoverage(quantities, contract, { modules, briefMetrics: reconcileOpts.briefMetrics })
  // PUMP MOTOR vs BRIEF-STATED PRESSURE (same choke-point, both synthesis paths — see the
  // function doc): a pump's motor_kw must never undershoot the brief's own stated duty.
  reconcilePumpMotorAgainstStatedPressure(quantities, contract, reconcileOpts.briefMetrics)

  // BRIEF-STATED ION-EXCHANGE QUANTITY GATE (T-19): when the brief never named softener /
  // ion-exchange / resin, strip softener_* keys from the synthesis map BEFORE buildGroups
  // so reconcile cannot re-mint Softener Vessel from a stale contract quantity. Word drop
  // (dropUnstatedIonExchangeStages) runs later for grounded library-invented softener words.
  {
    const nSoftQ = stripUnstatedSoftenerQuantities(quantities, reconcileOpts.briefText)
    if (nSoftQ > 0) {
      res.details.push(`stripped ${nSoftQ} unstated softener quantity key(s) (brief never named softener/ion-exchange)`)
      // Also clear from contract.quantities so a later pass / compliance read does not
      // resurrect the softener canon from the persisted map.
      const cq = (contract?.quantities ?? {}) as Record<string, unknown>
      for (const k of Object.keys(cq)) {
        if (/softener/i.test(k) && !(k in quantities)) delete cq[k]
      }
    }
  }

  // A `total_*`/overall/combined volume is a reporting SUM, not a vessel — exclude it from the
  // principal-equipment set when its constituent vessels are present (≥2 other non-aggregate
  // volume groups). SAME rule as the generic-emitter synthesis path; applying it HERE is what
  // removes the phantom "Total Water Storage" 262 m³ mega-tank (the physics-critic HIGH): this
  // reconcile re-mints principals from the contract LATER in the chain, and because the aggregate
  // is dropped from `canons`, the reconcile's invented-removal also deletes any pre-existing copy.
  const allSynth = buildGroups(quantities).filter((g) => isSynthesisable(g, quantities))
  // a GROUNDED disinfection word (v55's generator-emitted UV unit — non-synth, so it can
  // never claim a canon below) owns the disinfection function: drop the disinfection canon
  // so the reconcile never mints a synth twin beside it. A prior pass's SYNTH UV word keeps
  // its canon and is reconciled through the normal exact-id claim (gate-36 round 2).
  const groundedDisinfectionWordExists = modulesHaveDisinfectionWord(modules ?? [], true)
  const principalGroups = allSynth.filter((g) => {
    if (isDisinfectionPhrase(g.phrase) && groundedDisinfectionWordExists) return false
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
    // ROLE COHERENCE (one-charge rule, match-side — mirrors applyUniversalContractSizing):
    // a cleaning/CIP/flush/rinse-role word must never claim a non-cleaning canon (nor the
    // reverse), so a re-minted STORAGE principal can never be adopted by a CIP vessel here.
    const wIsCleaningRole = isCleaningRolePhrase(wordRoleText(w))
    let best: CanonEquip | undefined
    let bestStems = 0
    for (const c of canons) {
      if (wIsCleaningRole !== isCleaningRolePhrase(c.group.phrase)) continue
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
        // A LARGE LLM-AUTHORED FLUID VESSEL (a principal tank/vessel ≥10 m³ the LLM invented, not the
        // sizer) must ALSO face the grounding test — a legit one matches a contract canon (kept below),
        // a PHANTOM matches none → dropped. This catches the LLM-invented "Cleaning Tank / CIP Tank"
        // (2× 40 m³) the brief never asked for (physics-critic HIGH, scope-fidelity). NARROW: only fluid
        // vessels ≥10 m³ — instruments / genset / building / small pots are NOT vessels, so the prior
        // false-drop family (RAS genset/LOX/building) is untouched. Universal — no class table.
        const _capMod = (w.modifier_characters ?? []).find((m) => m.kind === 'capacity')
        const _capM3 = _capMod && /m³|m3/.test(`${_capMod.unit ?? ''} ${_capMod.value ?? ''}`) ? (parseFloat(String(_capMod.value)) || 0) : 0
        // detect the vessel by NOUN+capacity (isFluidVessel returns false for any non-synth word, so it
        // can't be used here). A large LLM-authored tank/vessel is a candidate phantom.
        const _isVesselNoun = /\btanks?\b|\bvessels?\b|\bdrums?\b|\bsilos?\b|\breservoirs?\b|\bcisterns?\b|\bbasins?\b/i.test(w.name_human ?? '')
        const isLargeAuthoredVessel = !isSynth(w) && _isVesselNoun && _capM3 >= 10
        if ((!isSynth(w) && !isLargeAuthoredVessel) || isSubcomponent(w)) continue
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
        // The instrument/utility/process-system/building guard protects SYNTH non-principals from a false
        // drop; a large AUTHORED vessel must still be grounding-tested, so it bypasses the guard.
        if (!isLargeAuthoredVessel && (isInstrument(w) || isActuator(w) || isUtility(w) || isProcessSystem(w) || isBuildingStructure(w) || isMainIncomerWord(w))) continue
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

  // BRIEF-STATED MEMBRANE-STAGE GATE (see dropUnstatedMembraneStages): a grounded
  // (non-_synthesized) UF/NF/MF bank the generator invented from library candidates has no
  // contract group AND is not `_synthesized`, so the invented-principal drop above never
  // sees it. When the brief never named that membrane family, drop it here.
  {
    const nMem = dropUnstatedMembraneStages(modules, reconcileOpts.briefText)
    if (nMem > 0) {
      res.removedInvented += nMem
      res.details.push(`dropped ${nMem} unstated membrane-stage word(s) (brief never named UF/NF/MF)`)
    }
  }

  // BRIEF-STATED ION-EXCHANGE / SOFTENER GATE (see dropUnstatedIonExchangeStages, T-19):
  // same shape as the membrane gate — grounded Softener Vessel / resin beds with no
  // contract group survive the invented-principal drop; when the brief is silent on
  // softener/ion-exchange/resin, drop them here. Plain GAC filters are untouched.
  {
    const nIx = dropUnstatedIonExchangeStages(modules, reconcileOpts.briefText)
    if (nIx > 0) {
      res.removedInvented += nIx
      res.details.push(`dropped ${nIx} unstated ion-exchange/softener word(s) (brief never named softener/ion-exchange/resin)`)
    }
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

  // DRIVE-TRAIN RATING RECONCILE (both-paths coverage — see reconcileDriveTrainRatings):
  // re-assert the fixed motor rule (brief-pin honoured exactly; otherwise a SINGLE IEC-frame
  // rounding, no stacked ×1.15) onto every machine↔motor/VSD pair in the tree, including
  // survivors from a prior run whose children were minted under the old double-margin rule
  // (the v56c/v56d fertigation 11-vs-8 / RO 5.5-vs-4.2 / drain 3-vs-2 corroborated defects).
  {
    const dtr = reconcileDriveTrainRatings(modules, quantities, briefPinnedQuantityKeys(contract))
    if (dtr > 0) {
      res.repaired += dtr
      res.details.push(`drive-train reconcile: ${dtr} motor/VSD rating(s) re-asserted (pin-honour / single IEC rounding)`)
    }
    // DUTY-LESS DRIVE WORDS (both-paths coverage — see deriveDutylessDriveWords): a
    // flat-cid drive/starter word the reconcile above cannot touch (it requires an
    // EXISTING rating_primary) — this pass STAMPS the initial one, or flags a
    // mis-emission when the module owns no driven-motor evidence at all. Same
    // both-synthesis-paths discipline as the DRIVE-TRAIN reconcile immediately above
    // (a re-mint via reconcilePrincipalEquipment must never resurrect an un-derived
    // duty-less drive word — verified in the FINAL state, not per-function).
    const ddw = deriveDutylessDriveWords(modules, quantities, briefPinnedQuantityKeys(contract))
    if (ddw.derived > 0 || ddw.flagged > 0) {
      res.repaired += ddw.derived
      res.details.push(`duty-less drive words: ${ddw.derived} duty-derived, ${ddw.flagged} flagged as mis-emissions (no driven-motor evidence)`)
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

  // CLEANING-SERVICE VESSEL CLAMP on the FINAL tree (the one-charge rule's second mint
  // path — "synthesis runs in TWO paths"): an oversized CIP/flush/rinse vessel that reached
  // this reconcile (LLM-authored in Phase 2, or surviving prior state) is clamped to one
  // cleaning-solution recirculation charge, exactly as the generator-time pass does. Runs
  // BEFORE the instrumentation re-derive so any level range reads the post-clamp geometry.
  sizeCleaningServiceVessels(modules, quantities)

  // SECOND-PATH INSTRUMENT COVERAGE (the "synthesis runs in TWO paths" trap — codema v50):
  // this reconcile can RE-MINT a principal fluid vessel the sizing-time instrumentation pass
  // (applyUniversalContractSizing C3) never saw — v50's 40 m³ Fresh/Drain Water Tanks were
  // re-created HERE, so the plant's TALLEST liquid vessels (3.7 m) shipped with NO level
  // instrument while the consolidated LT (softener/nutrient/sump only) read 0–1.4 m.
  // synthesizeInstrumentation is idempotent (drops every instrument word, re-derives from
  // the CURRENT vessel set), so re-running it against the FINAL principal set guarantees
  // every principal liquid vessel carries level coverage, ranged off ITS OWN height (next
  // standard range ≥ height). STRICT NO-OP for a class with no fluid vessels (it returns
  // before its idempotent drop), so BESS / SAF / CO₂ state is byte-identical.
  res.instrumentsResynthesised = synthesizeInstrumentation(modules, quantities)

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
          // An ENGINE-MINTED field instrument is never a principal: its identity is owned by
          // synthesizeInstrumentation's idempotent re-derive (drop-all + re-add), and the
          // BANDED consolidation (codema v61) legitimately ships SEVERAL words sharing one
          // human name ('Level Transmitter' 0–1.4 m + 0–4 m) — the same-name collapse here
          // would eat a band line and break count conservation. LLM-authored / grounded
          // instrument words carry no `_instrument` flag and still dedupe as before.
          if ((w as { _instrument?: boolean })._instrument === true) continue
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
  opts: { onlyUnsized?: boolean; synthesizeMissing?: boolean; dedupeAndStrip?: boolean; explode?: boolean; instrument?: boolean; minScore?: number; briefMetrics?: BriefTargetMetric[] } = {},
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

  // DEMAND-COVERAGE (choke-point feed — codema v51): mint the delivered supply-pump
  // quantities for any uncovered fluid-delivery demand + the motor floor for any motorless
  // pump-flow family BEFORE buildGroups, so the pump group exists on every run regardless
  // of the generator's word-set luck (see mintDemandCoverage). The normal match/suppress
  // logic below then applies: an existing pump word adopts the group (no synthetic twin);
  // a missing one is synthesised in part B. Mints persist to contract.quantities with
  // 'demand-coverage' provenance. Strict no-op (byte-identical) when nothing is missing.
  mintDemandCoverage(quantities, contract, { modules, briefMetrics: opts.briefMetrics })
  // PUMP MOTOR vs BRIEF-STATED PRESSURE (same choke-point, both synthesis paths — see the
  // function doc): a pump's motor_kw must never undershoot the brief's own stated duty.
  reconcilePumpMotorAgainstStatedPressure(quantities, contract, opts.briefMetrics)

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
        // AND strip any machine attrs it ALREADY carries (stamped before the noun joined
        // the family / authored upstream) — codema v60 I-104, see stripMachineAttrsFromInstrument.
        if (isInstrument(w)) {
          stripMachineAttrsFromInstrument(w)
          continue
        }
        const wStems = wordStems(w)
        if (wStems.length === 0) continue
        // ROLE COHERENCE (the one-charge rule's match-side half — codema v50 physics-critic
        // HIGH): a CLEANING/CIP/flush/rinse-role word must never adopt a non-cleaning group's
        // size, and vice versa. Without this the single shared generic stem 'tank' scored the
        // 40 m³ fresh_water_tank STORAGE group onto "Cleaning Tank"/"Cip Tank" (two plant-
        // storage-sized CIP vessels) AND `matched.add()` then suppressed the REAL storage
        // tank's synthesis until the late reconcile — which left it un-instrumented. Keyed on
        // the role NOUN, universal, no class table.
        const wIsCleaningRole = isCleaningRolePhrase(wordRoleText(w))
        // ELECTRICAL-ROLE COHERENCE (codema v53 litter member #5): an electrical power-
        // distribution device (transformer / switchboard / MCC / UPS / genset …) must never
        // adopt a FLUID group's size or rating — the shared 'trans' stem let the drain-
        // TRANSfer-pump group stamp "Distribution TRANSformer" with a 700x595x770 mm flow
        // box + "45 m³/h" + ×2. Electrical groups (kW / kVA / A) still match normally.
        const wIsElectricalDevice = isElectricalDistributionWord(w)
        let best: EquipGroup | null = null
        let bestScore = 0
        for (const g of groups) {
          if (wIsCleaningRole !== isCleaningRolePhrase(g.phrase)) continue
          if (wIsElectricalDevice && groupIsFluidSized(g)) continue
          // rule-6 shortfall group: full-stem containment only (see RESERVE_COVERAGE_PHRASE_RE)
          if (RESERVE_COVERAGE_PHRASE_RE.test(g.phrase) && !g.stems.every((s) => wStems.includes(s))) continue
          // rule-8 zoned-network principal: full-stem containment only (see ZONED_NETWORK_PRINCIPAL_RE)
          if (ZONED_NETWORK_PRINCIPAL_RE.test(g.phrase) && !g.stems.every((s) => wStems.includes(s))) continue
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

  // ── A2. CLEANING-SERVICE VESSELS: one-charge rule (see sizeCleaningServiceVessels) ──
  // Runs after the contract match (so the role-coherence gate above has already kept the
  // storage groups off these words) and before synthesis: a grounded CIP/flush/rinse tank
  // is sized to one cleaning-solution recirculation charge from the plant's design flow.
  sized += sizeCleaningServiceVessels(modules, quantities)

  // ── B. synthesise principal equipment no word matched ─────────────────────
  const synthesizedPhrases: string[] = []
  // an existing disinfection word (grounded OR a prior pass's synth) owns the disinfection
  // function — never mint a twin beside it (gate-36 round 2; e.g. an "Ozone Generator" whose
  // stems don't fuzzy-match the uv_disinfection group would otherwise gain a UV sibling).
  const disinfectionWordExists = modulesHaveDisinfectionWord(modules ?? [])
  if (synthesizeMissing) {
    for (const g of groups) {
      if (matched.has(g.phrase)) continue
      if (!isSynthesisable(g, quantities)) continue
      if (isDisinfectionPhrase(g.phrase) && disinfectionWordExists) continue
      // A `total_*` / overall / combined volume is a REPORTING SUM of the real vessels, not a
      // physical tank. Synthesising it mints a phantom mega-vessel that double-counts the
      // constituents and reads as one contaminating store. Suppress it ONLY when the
      // constituent vessels ARE present as ≥2 other synthesisable, non-aggregate volume groups
      // (so a lone total_* with no breakdown still makes its vessel). UNIVERSAL — keyed on the
      // aggregate marker + constituent presence, no class table. (physics-critic Risk-tab fix.)
      if (isPureAggregatePhrase(g.phrase) && g.volume !== undefined) {
        const constituents = groups.filter(
          (o) => o !== g && o.volume !== undefined && o.volume >= 1
            && !isPureAggregatePhrase(o.phrase) && isSynthesisable(o, quantities),
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
  const pinnedKeys = briefPinnedQuantityKeys(contract)
  const exploded = (opts.explode ?? true) ? explodeEquipmentSubAssemblies(modules, quantities, 3, pinnedKeys) : 0
  // Re-assert the fixed drive-train rule onto ANY machine↔motor/VSD pair already in the
  // tree (a prior run's stacked-margin mints) — see reconcileDriveTrainRatings.
  const driveTrainRepaired = (opts.explode ?? true) ? reconcileDriveTrainRatings(modules, quantities, pinnedKeys) : 0
  if (driveTrainRepaired > 0) {
    // eslint-disable-next-line no-console
    console.error(`[universal-sizing] drive-train reconcile: ${driveTrainRepaired} motor/VSD rating(s) re-asserted (pin-honour / single IEC rounding)`)
  }
  // Duty-less drive-word derivation (round-3 residual class, 2026-07-04): stamp an
  // initial rating_primary on any flat-cid drive/starter word the reconcile above cannot
  // touch (it requires an EXISTING rating_primary), or flag a mis-emission when the
  // module owns no driven-motor evidence at all — see deriveDutylessDriveWords. Wired
  // in BOTH synthesis paths (here AND reconcilePrincipalEquipment, mirroring the
  // drive-train reconcile immediately above) so neither path silently re-mints an
  // un-derived duty-less drive word.
  const driveDuty = (opts.explode ?? true) ? deriveDutylessDriveWords(modules, quantities, pinnedKeys) : { derived: 0, flagged: 0 }
  if (driveDuty.derived > 0 || driveDuty.flagged > 0) {
    // eslint-disable-next-line no-console
    console.error(`[universal-sizing] duty-less drive words: ${driveDuty.derived} duty-derived, ${driveDuty.flagged} flagged as mis-emissions (no driven-motor evidence)`)
  }

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
