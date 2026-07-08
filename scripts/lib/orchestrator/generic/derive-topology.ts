// Universal process-topology deriver.
//
// WHY (Tristan 2026-06-27, the P&ID/BFD ≥8 work): the P&ID + BFD generators draw
// the process flow graph from `contract.topology` (an array of TopologyEdge
// {from_part,to_part,mechanism,...}). ~40 registered archetype builders hand-author
// that array; a few (water_treatment) — and ANY unseen archetype that comes through
// the generic emitter — emit none, so the drawings render "No process topology in
// state — nothing to draw." and score 0. Hand-authoring a per-class topology is the
// wrong answer (it does nothing for the next unknown class). The universal answer:
// DERIVE a feed→product process spine from the principal equipment the physics engine
// already synthesised (universal-contract-sizing), so every class — seen or unseen —
// gets a drawable graph. Fires ONLY when no hand-authored topology exists, so the
// classes that author their own edges are untouched.
//
// The role-rank table is ported from draw_bfd.py::_ROLE_PATTERNS (the canonical
// feed(0)→product(9) process spine the BFD itself lays out by), enriched with GENERAL
// process vocabulary (membrane/RO/UF separation, GAC, softening, brine/reject disposal,
// distribution pumping) — all class-agnostic, no per-class table. Keying the derived
// spine off the BFD's own role vocabulary guarantees the topology and the BFD layout
// agree. Endpoints are snake_case slugs of each item's name_human; the drawings resolve
// endpoints by fuzzy token-overlap against the part display name (build_universal_scene
// resolve_endpoint), so a slug == snake_case(name_human) always resolves.

import type { TopologyEdge } from '../../engineering-contract'

type AnyWord = {
  name_human?: string
  content_character?: { name_human?: string }
  _synthesized?: boolean
  _subcomponent?: boolean
  id?: string
  // The word's own quantity modifier (`×N`) — written by universal-contract-sizing.ts's
  // synthWord()/buildGroups from a contract `*_count` key (e.g. drain_collection_sump_count =
  // departmentCount). Read by wordQtyCount() below for the per-zone recovery-collection pass.
  modifier_characters?: Array<{ kind?: string; value?: unknown }>
}
type AnyModule = { sub_modules?: Array<{ words?: AnyWord[] }> }

// Equipment that belongs on the SINGLE-LINE (electrical) or as a P&ID instrument/valve
// TAG — NOT a node on the fluid process spine. Excluded from the derived topology.
const NON_PROCESS_RE =
  /\b(generator|ups\b|scada|switchboard|switchgear|incomer|transformer|\bmcc\b|motor[ _-]?control|distribution[ _-]?board|\bpanel\b|\bplc\b|\bhmi\b|circuit[ _-]?breaker|busbar|cabling|earthing|\bvalve\b|transmitter|transducer|\bsensor\b|analy[sz]er|\bgauge\b|\bprobe\b|flow[ _-]?meter|\bdetector\b|\bindicator\b|controller|interface|gateway|monitoring)\b/i

// A PRINCIPAL process-equipment device noun. A grounded (non-`_synthesized`) emitter word
// that names one of these IS a real node on the fluid spine and must appear on the P&ID/BFD
// even though it carries no `_synthesized` flag (the brief's Cip Tank, Cleaning Tank, UF
// Membrane Bank were skipped because the deriver only walked synthesised words). Keyed on the
// device noun → UNIVERSAL, any archetype. Sub-components (Tank Wall, Impeller) are excluded by
// the `_subcomponent` flag, not by this list, so a 'tank' here never pulls in a tank wall.
const PRINCIPAL_PROCESS_RE =
  /\b(tank|vessel|reservoir|\bsump\b|silo|column|tower|reactor|skid|membrane|\bro\b|\buf\b|filter|softener|clarifier|separator|degass|stripper|scrubber|exchanger|\bhex\b|chiller|boiler|pump|blower|compressor|mixer|cyclone|hopper|contactor)\b/i

// STRUCTURAL parts — a frame / plinth / support / walkway is STRUCTURE, never a node on the
// fluid spine. v55 root-cause: 'Painted Carbon Steel Skid Frame' / 'Painted Steel Skid Frame' /
// 'SST304 Skid Frame' matched \bskid\b in PRINCIPAL_PROCESS_RE and were serially threaded INTO
// the process chain (gac_filter → skid_frame → skid_frame → skid_frame → drain_sump), scrambling
// the whole downstream graph. Keyed on the structural noun — a genuine 'Reverse Osmosis Skid'
// (no 'frame') stays a process node. UNIVERSAL, no class table.
const STRUCTURAL_RE =
  /\b(frame|framework|plinth|baseplate|base[ _-]?plate|foundation|footing|support(?:s|ing)?[ _-]?(?:steel|structure)?$|racking|walkway|access[ _-]?platform|ladder|handrail|grating|bund|kerb|curb)\b/i

// feed(0) → product(9) spine, ported from draw_bfd.py::_ROLE_PATTERNS + general
// process-equipment synonyms. Checked IN ORDER — earliest match wins — so a "feed pump"
// lands at feed(0) before the generic pump→distribution(9) rule.
//
// v55 SCRAMBLE FIXES (2026-07-02, the "connection graph is scrambled" root cause):
//  1. DELIVERY-APPLICATION OVERRIDE (first entry): a part named for the DELIVERY system it
//     serves (fertigation / irrigation / watering) belongs at the delivery END of the spine —
//     the served-system noun governs over the generic mechanism noun. v55: 'Fertigation
//     Dosing Pump' matched 'dosing'(1) first and became the spine HEAD, feeding the softener.
//  2. MEMBRANE-FINENESS SUB-RANKS: in any multi-membrane train the coarser separation feeds
//     the finer (pore-size physics, universal): microfiltration < ultrafiltration <
//     nanofiltration < reverse osmosis. v55 lumped UF + RO at one rank and alphabetical
//     tie-break sent the RO high-pressure pump discharging BACKWARDS into the UF bank.
// Named (not just inline) so the trim/additive-chemical override below can test the SAME
// vocabulary a sibling item was classified by, without duplicating/drifting the regex.
const DELIVERY_APPLICATION_RE = /fertigation|irrigation|hand.?watering|\bwatering\b|sprinkler/i
const ROLE_PATTERNS: Array<[RegExp, number]> = [
  [DELIVERY_APPLICATION_RE, 9], // delivery-application override (see 1)
  [/feed|inlet|supply|make.?up|charge|intake|receiv|raw[ _-]?water/i, 0],
  [/pre.?heat|preheater|guard.?bed|drier|dryer|conditioning|blend|mixer|saturat|soften|dechlor|antiscal|dosing/i, 1],
  [/micro.?filtrat|\bmf\b/i, 2.1],                                      // membrane fineness (see 2)
  [/ultra.?filtrat|\buf\b/i, 2.2],
  [/nano.?filtrat/i, 2.3],
  [/reverse.?osmosis|\bro\b|\bedi\b|deioni/i, 2.4],
  [/reactor|synthesis|absorber|contactor|carbonat|crystallis|crystalliz|converter|reformer|electrolys|membrane/i, 2],
  [/steam.?generator|waste.?heat|boiler|economiser|economizer|reboiler|quench/i, 3],
  [/separator|flash|knock.?out|ko.?drum|\bdrum\b|decanter|coalesc|demister|filter|stripper|clarifier|\bgac\b|carbon|degass|sediment|cartridge/i, 4],
  [/recycle|\breturn\b|tail.?gas|\bloop\b|recompress|recirc/i, 5],
  [/oxidis|oxidiz|flare|incinerat|\bvent\b|purge|abatement|effluent|disposal|\bwaste\b|\bdrain\b|\bsump\b|reject|concentrate|\bbrine\b|blowdown|backwash/i, 6],
  [/fractionat|distillat|hydrocrack|hydrotreat|isomeris|isomeriz|refin|upgrad|rectif|\bcolumn\b/i, 7],
  [/condenser|cooler|chiller|cold.?box|cryo/i, 8],
  [/storage|\btank\b|\bproduct\b|export|loading|gantry|dispatch|reservoir|bottling|\bpump\b|distribution|delivery/i, 9],
]

function roleRank(name: string): number {
  const blob = name || ''
  for (const [rx, rank] of ROLE_PATTERNS) if (rx.test(blob)) return rank
  return 5 // neutral mid-spine when no role keyword is present
}

// ── TRIM/ADDITIVE-CHEMICAL POINT-OF-USE OVERRIDE (2026-07-08, Sam Green SME review — Rule 2
// "per-unit dosing depth": each Codema pump unit has its OWN acid + H₂O₂ trim dosing, injected
// into that unit's pressurised discharge, NOT a shared central pretreatment stage). Bare
// ROLE_PATTERNS rank-1 ("dosing" is in the generic pretreatment/conditioning vocabulary) puts
// an "Acid Dosing Pump" / "Chemical Dosing Pump" right after FEED — before the RO/softener
// treatment train — because those words carry no delivery-system name of their own the
// rank-9 override (ROLE_PATTERNS[0]) can key on. That mis-positions a genuinely PER-ZONE trim
// pump as if it were a shared upstream conditioning stage, scrambling the spine
// (acid_dosing_pump -> chemical_dosing_pump -> gac_softener, upstream of the RO train).
//
// UNIVERSAL, no class name, and DELIBERATELY NARROW to avoid re-classifying the EXISTING
// Rule-2 GENERAL conditioning path (a bare "Zone Chemical Dosing Skid" with no delivery-system
// name of its own — the proveCatch fixture for an archetype whose per-zone conditioning unit
// isn't fertigation/irrigation-named — which correctly STAYS at rank-1): a trim/additive-
// chemical pump (acid, caustic, peroxide, biocide, scale-inhibitor/antiscalant, corrosion-
// inhibitor, chemical) is relocated to rank-9 ONLY when it shares its exact zone COUNT with an
// ALREADY-classified delivery-application item (ROLE_PATTERNS[0] — Fertigation/Irrigation/
// Hand-watering Pump) elsewhere in the SAME design — i.e. there IS a known delivery mover this
// trim item doses alongside. Without that co-located delivery-mover evidence (the "Zone
// Chemical Dosing Skid" fixture: no fertigation/irrigation word present at all), it is left at
// its natural rank — proveNoFalsePositive.
const TRIM_ADDITIVE_CHEMICAL_RE = /\b(acid|caustic|chemical|peroxide|hydrogen[\s-]?peroxide|biocide|scale[\s-]?inhibitor|antiscalant|corrosion[\s-]?inhibitor)\b/i
const TRIM_DOSING_ACTION_RE = /\bdos(?:e|ing|er)\b|\binject(?:ion|or)?\b|\bmeter(?:ing)?\b/i
function isTrimAdditiveDosingPump(name: string): boolean {
  return TRIM_ADDITIVE_CHEMICAL_RE.test(name || '') && TRIM_DOSING_ACTION_RE.test(name || '')
}

// Within one spine rank, direction is ROLE-BASED, never alphabetical (v55 fix 3): a stage's
// STORAGE feeds its MOVER, and a MOVER (pump / compressor / blower) discharges INTO the stage
// units it drives — a membrane HP pump feeds its membrane bank, a storage tank feeds its
// distribution pump. Sub-order: storage(0) → mover(1) → process unit(2); name is only the
// deterministic FINAL tie-break between two parts of the same sub-role.
const SUBROLE_STORAGE_RE = /\b(tank|storage|reservoir|silo|sump|cistern|basin)\b/i
const SUBROLE_MOVER_RE = /\b(pump|compressor|blower|fan)\b/i
function subRole(name: string): number {
  if (SUBROLE_STORAGE_RE.test(name || '')) return 0
  if (SUBROLE_MOVER_RE.test(name || '')) return 1
  return 2
}

export function slugify(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Parse a word's population/quantity count from its `quantity` modifier ('×3' → 3; absent
 *  or unparseable → 1). Mirrors universal-contract-sizing.ts::_wordPopCount (the SAME format
 *  synthWord() there writes: `mod('quantity', '×'+count)`) — so a word the physics engine
 *  already sized to N per-zone instances (drain_collection_sump_count = departmentCount,
 *  cloth_filter_count, drain_transfer_pump_count, …) is read correctly here without importing
 *  across the two files (kept independent — this module has no dependency on the sizer). */
function wordQtyCount(w: AnyWord): number {
  const mods = w.modifier_characters
  if (!Array.isArray(mods)) return 1
  const q = mods.find((m) => m?.kind === 'quantity')
  if (!q) return 1
  const n = /(\d+)/.exec(String(q.value ?? ''))
  return n ? parseInt(n[1], 10) || 1 : 1
}

/**
 * Derive a feed→product process-flow topology from the synthesised principal
 * equipment in `modules`. Returns [] when there is no process equipment to chain
 * (caller keeps any existing/empty topology).
 */
export function deriveProcessTopology(modules: AnyModule[]): TopologyEdge[] {
  // Collect distinct principal PROCESS equipment (physics-synthesised, fluid-side).
  const seen = new Set<string>()
  const items: Array<{ name: string; slug: string; rank: number; sub: number; qty: number; _zoneGroup?: string }> = []
  for (const m of modules || []) {
    for (const sm of m.sub_modules || []) {
      for (const w of sm.words || []) {
        if (!w) continue
        if (w._subcomponent) continue // a sub-assembly part (Tank Wall, Impeller) is not a spine node
        const name = w.name_human || w.content_character?.name_human || ''
        if (!name) continue
        // Include a word if it is physics-SYNTHESISED OR it NAMES a principal process device
        // (a grounded Cip/Cleaning tank, UF membrane bank the synthesised-only walk missed).
        if (!w._synthesized && !PRINCIPAL_PROCESS_RE.test(name)) continue
        if (NON_PROCESS_RE.test(name)) continue // electrical / instrument / valve → not the fluid spine
        if (STRUCTURAL_RE.test(name)) continue // a frame / plinth / walkway is structure, not process
        const slug = slugify(name)
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        const qty = wordQtyCount(w)
        items.push({ name, slug, rank: roleRank(name), sub: subRole(name), qty })
      }
    }
  }
  if (items.length < 2) return [] // need ≥2 nodes to draw an edge

  // TRIM/ADDITIVE-CHEMICAL POINT-OF-USE RELOCATION (see isTrimAdditiveDosingPump's header
  // comment) — a second pass, run AFTER every item's natural rank is known: relocate a trim/
  // additive-chemical item from its generic rank-1 pretreatment slot to rank-9 ONLY when a
  // delivery-application item (ROLE_PATTERNS[0]) with the SAME zone count exists elsewhere in
  // this design — the evidence that this trim pump doses alongside a known per-zone delivery
  // mover, not a shared upstream conditioning stage. No co-located delivery mover of matching
  // count → untouched (the "Zone Chemical Dosing Skid" rank-1 fixture, proveNoFalsePositive).
  {
    const deliveryQtys = new Set(items.filter((it) => DELIVERY_APPLICATION_RE.test(it.name)).map((it) => it.qty))
    if (deliveryQtys.size > 0) {
      for (const it of items) {
        if (it.rank !== 1 || !isTrimAdditiveDosingPump(it.name)) continue
        if (deliveryQtys.has(it.qty)) it.rank = 9
      }
    }
  }

  // Order along the spine: rank, then ROLE-BASED sub-order within the rank (storage feeds its
  // mover, the mover discharges into the stage's process units — see subRole), then name as
  // the deterministic final tie-break. Alphabetical-within-rank was the v55 direction scramble.
  items.sort((a, b) => a.rank - b.rank || a.sub - b.sub || a.name.localeCompare(b.name))

  // FILTER-ON-DIRTY-STREAM REORDER (2026-07-08 follow-up — see the function's own header
  // comment below): relocates a treatment unit-op that landed immediately downstream of an
  // already-clean source onto the recovery/dirty side, IN THE ACTUAL SPINE, not just an
  // after-the-fact audit flag. Must run before edges are built so the rendered P&ID reflects
  // the fix, not merely a shadow verdict.
  repositionFiltersOntoRecoverySide(items)

  // PARALLEL-PER-ZONE DISTRIBUTION BRANCHES (2026-07-08 — see the function's own header
  // comment below, RULES 1+2 of the multizone-distribution handover): splits a distribution
  // prime-mover/manifold/header or a point-of-use conditioning unit the physics engine has
  // already sized to N per-zone instances into N distinct parallel spine nodes, instead of
  // the single collapsed node the plain slug-dedupe above produces.
  expandDistributionBranchesPerZone(items)

  // PER-ZONE RECOVERY-COLLECTION EXPANSION (2026-07-08 — see the function's own header
  // comment below): splits a recovery COLLECTION node (drainpit/sump) the physics engine has
  // already sized to N per-zone instances into N distinct spine nodes, instead of the single
  // collapsed node the plain slug-dedupe above produces.
  expandRecoveryCollectionPerZone(items)

  const edges: TopologyEdge[] = []
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i], b = items[i + 1]
    if (a.slug === b.slug) continue // a self-loop is never authored (belt + braces on the dedupe)
    // thermal mechanism for heat-recovery(3)/cooling(8) endpoints, else fluid.
    const thermal = a.rank === 3 || a.rank === 8 || b.rank === 8
    edges.push({
      from_part: a.slug,
      to_part: b.slug,
      mechanism: thermal ? 'thermal' : 'fluid_loop',
      constraint_kind: thermal ? 'thermal_rejection' : 'flow_capacity',
    } as TopologyEdge)
  }

  // Fan-out/fan-in correction for any zone-replica group EITHER expansion above created
  // (distribution branches upstream, recovery-collection points downstream — the SAME
  // _zoneGroup tagging mechanism, so this one reconciler handles both without change): the
  // naive consecutive-chain loop above would otherwise wire the zone replicas SERIALLY
  // (zone_1 → zone_2 → zone_3), implying one branch feeds the next — physically wrong (each
  // zone's distribution branch / collection point is independent, fed from / feeding a
  // SHARED header). reconcileZoneReplicaEdges replaces that with the correct fan-out (shared
  // upstream → every zone) / fan-in (every zone → shared downstream) shape.
  reconcileZoneReplicaEdges(items, edges)

  // ── UNIVERSAL RECIRCULATION-LOOP CLOSURE (2026-07-07, Sam Green SME review of
  // the real Codema Fischer Farms system — "Process is not usually this straight
  // a line. With flow only going one way at all times?"). The deriver above only
  // ever builds a strict feed→product CHAIN — real recirculating plants (water
  // reuse, condensate/glycol return, gas recycle) close a cycle instead. Detect a
  // RECOVERY BUFFER: a storage/tank/reservoir/sump node whose name ALSO carries a
  // recovery qualifier (drain(water)/recover/reclaim/recycle/return/reuse/
  // condensate) — deliberately NARROWER than rank-6's disposal vocabulary (waste/
  // reject/brine/concentrate/blowdown), which is the PURGE the design-basis memo
  // says must NEVER be looped back (that is what stops salt/pathogen
  // accumulation). When found, close the loop back to the spine HEAD
  // (items[0]) — the same universal target the aquaculture_ras hand-authored
  // loop already uses (`recirc_pumps -> rearing_tanks`, engineering-contract.ts).
  // Keyed on generic stream vocabulary only — no class name — so it fires for
  // water (Codema drainwater), condensate, glycol/coolant return, or any future
  // archetype whose synthesised equipment includes a recovery buffer, and stays
  // silent (untouched, no regression) for a genuinely once-through archetype
  // (DAC, single-pass cooling, stoichiometric reactants consumed to completion).
  const recoveryItem = [...items].reverse().find((it) => RECOVERY_BUFFER_RE.test(it.name))
  if (recoveryItem && recoveryItem.slug !== items[0].slug) {
    edges.push({
      from_part: recoveryItem.slug,
      to_part: items[0].slug,
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      material_context: 'recirculation return loop — recovered stream re-enters the spine head (design-basis: recovery closes the cycle; purge/disposal streams are never looped back)',
      _recirculation_loop: true,
    } as TopologyEdge)
  }

  return edges
}

// A storage/buffer node whose name ALSO signals it holds a RECOVERED stream —
// see the recirculation-loop-closure comment above for the disposal-vs-recovery
// distinction. Matches either word order ("Drainwater Reservoir" / "Reservoir
// for recovered condensate").
const RECOVERY_BUFFER_RE =
  /\b(drain(?:ed|age|water)?|recover(?:ed|y)?|reclaim(?:ed)?|recycl(?:ed|e)?|return(?:ed)?|reus(?:e|ed|able)|condensate)\b.{0,30}\b(tank|reservoir|storage|sump|buffer|cistern|basin)\b|\b(tank|reservoir|storage|sump|buffer|cistern|basin)\b.{0,30}\b(drain(?:ed|age|water)?|recover(?:ed|y)?|reclaim(?:ed)?|recycl(?:ed|e)?|return(?:ed)?|reus(?:e|ed|able)|condensate)\b/i

// Generic FEED/makeup vocabulary (mirrors ROLE_PATTERNS rank 0) — used by the
// makeup-sizing invariant below to identify the makeup-side flow, never a class name.
const FEED_MAKEUP_RE = /feed|inlet|supply|make.?up|charge|intake|receiv|raw[ _-]?water/i

/**
 * UNIVERSAL makeup-sizing invariant (design-basis §5): when a recirculation loop
 * exists, the MAKEUP/feed equipment must be sized to losses (Q_loss + Q_purge),
 * NEVER to the loop's full circulation flow — the Codema defect ("RO sized as if
 * no drainwater were recovered", a ~5-50x oversize). Pure + deterministic; reads
 * `required_value` already joined onto fluid edges by `joinFlowDemandsOntoTopology`.
 * NEVER fabricates: returns 'unverified' (not a false pass) when a loop exists but
 * the two flows aren't both known from joined contract quantities, and
 * 'not_applicable' when there is no loop at all (a once-through archetype is never
 * flagged). Detects a loop generically (an edge whose `to_part` was an earlier
 * edge's `from_part`), so it also covers a hand-authored cycle such as
 * aquaculture_ras's `recirc_pumps -> rearing_tanks`, not just the auto-injected one.
 */
export interface MakeupSizingInvariantResult {
  verdict: 'not_applicable' | 'pass' | 'unverified' | 'high'
  has_loop: boolean
  makeup_flow_m3_h: number | null
  circulation_flow_m3_h: number | null
  ratio: number | null
  reason: string
}

export function evaluateMakeupSizingInvariant(
  topology: Array<Record<string, unknown>>,
  quantities: Record<string, unknown>,
): MakeupSizingInvariantResult {
  void quantities // reserved for a future direct-quantity lookup path; today reads joined required_value only
  if (!Array.isArray(topology) || topology.length === 0) {
    return { verdict: 'not_applicable', has_loop: false, makeup_flow_m3_h: null, circulation_flow_m3_h: null, ratio: null, reason: 'no topology' }
  }
  const seenFrom = new Set<string>()
  let hasLoop = false
  for (const e of topology) {
    const from = String((e as Record<string, unknown>).from_part ?? '')
    const to = String((e as Record<string, unknown>).to_part ?? '')
    if (seenFrom.has(to)) hasLoop = true
    seenFrom.add(from)
  }
  if (!hasLoop) {
    return { verdict: 'not_applicable', has_loop: false, makeup_flow_m3_h: null, circulation_flow_m3_h: null, ratio: null, reason: 'no recirculation loop in this topology — invariant not applicable (once-through)' }
  }
  let makeup: number | null = null
  let circulation: number | null = null
  for (const e of topology) {
    const rec = e as Record<string, unknown>
    const mech = String(rec.mechanism ?? '').toLowerCase()
    if (!(mech.includes('fluid') || mech === 'water')) continue
    const v = qtyNum(rec.required_value)
    if (v === null) continue
    const from = String(rec.from_part ?? '')
    if (FEED_MAKEUP_RE.test(from)) {
      makeup = makeup === null ? v : Math.min(makeup, v)
    } else {
      circulation = circulation === null ? v : Math.max(circulation, v)
    }
  }
  if (makeup === null || circulation === null) {
    return {
      verdict: 'unverified', has_loop: true, makeup_flow_m3_h: makeup, circulation_flow_m3_h: circulation, ratio: null,
      reason: 'loop present but makeup/circulation flow not both known from joined contract quantities — cannot verify sizing without fabricating a value',
    }
  }
  const ratio = makeup / circulation
  if (makeup >= circulation) {
    return {
      verdict: 'high', has_loop: true, makeup_flow_m3_h: makeup, circulation_flow_m3_h: circulation, ratio,
      reason: `makeup flow (${makeup} m3/h) is NOT smaller than the loop's circulation flow (${circulation} m3/h) — the source/makeup equipment reads as sized to the FULL loop instead of losses only (design-basis §5: Q_makeup = Q_loss + Q_purge)`,
    }
  }
  return {
    verdict: 'pass', has_loop: true, makeup_flow_m3_h: makeup, circulation_flow_m3_h: circulation, ratio,
    reason: `makeup (${makeup} m3/h) < circulation (${circulation} m3/h), ratio ${(ratio * 100).toFixed(1)}%`,
  }
}

// ── FILTER-ON-DIRTY-STREAM INVARIANT (Sam Green SME review, 2026-07-07 — "RO water
// feeds into cloth filter which doesn't make sense as it's clean already... Filters and
// disinfection should be after drain pits"). A treatment unit-op (filter / cloth-belt /
// paperbelt filter / disinfection / UV / chlorination) exists to turn a DIRTY stream
// clean — it must sit on the dirty/recovered side, never immediately downstream of an
// already-clean stream (RO permeate, a cleanwater reservoir, treated/product water).
// UNIVERSAL: keyed on the stream_state vocabulary already in this file (RECOVERY_BUFFER_RE
// = dirty/recovered) plus a CLEAN-source vocabulary (permeate/cleanwater/RO/UF/deionised),
// never a class name — so it fires identically whether the topology came from the generic
// deriver above or a hand-authored contract.topology (aquaculture_ras, co2_mineralisation,
// any future archetype with a treatment stage). A filter EXPLICITLY named as a final-polish
// / point-of-use stage is exempt — polishing already-clean water immediately before
// delivery is legitimate engineering (a carbon polish filter before bottling), unlike a
// coarse cloth/paperbelt filter (a dirty-stream solids-removal device) sitting on RO
// permeate, which is the defect Sam flagged.
const TREATMENT_UNIT_OP_RE =
  /\b(filter|cloth[\s-]?filter|paperbelt|paper[\s-]?belt|disinfect(?:ion|ing)?|\buv\b|chlorinat(?:e|ion|ing)?|ozonat(?:e|ion|ing)?|strain(?:er)?)\b/i
const POLISH_EXEMPT_RE =
  /\b(polish(?:ing)?|final[\s-]?(?:stage|treatment|polish)|point[\s-]?of[\s-]?use|\bpou\b|pre[\s-]?(?:use|delivery|distribution|dispatch|bottling))\b/i
const CLEAN_SOURCE_RE =
  /\b(permeate|clean\s?water|cleanwater|treated\s?water|product\s?water|potable|purified|fresh\s?water|reverse[\s-]?osmosis|\bro\b|\buf\b|deioni[sz]ed?|\bedi\b)\b/i

export interface FilterOnDirtyStreamResult {
  verdict: 'not_applicable' | 'pass' | 'high'
  violations: Array<{ filter: string; upstream: string; reason: string }>
}

/**
 * UNIVERSAL filter-on-dirty-stream invariant (design-basis: a treatment unit-op processes
 * a dirty/recovered stream, never re-treats an already-clean one). Pure + deterministic;
 * string-vocabulary only, so it never fabricates a numeric verdict — 'not_applicable' when
 * the topology has no treatment-unit-op node at all, 'high' when a non-polish treatment
 * node's immediate upstream is a clean/RO-permeate source, 'pass' otherwise (incl. every
 * legitimate dirty/recovered-side filter and every explicitly-named polish stage).
 */
// The REAL topology this invariant runs against (deriveProcessTopology's own output, and
// most hand-authored contract.topology arrays) keys nodes with SLUGIFIED endpoints
// (`ro_membrane_elements`, `cloth_filter`, `drain_collection_sump` — underscore-joined,
// see `slugify()` above), not the space-separated display names the vocabulary regexes
// above were written against. `\b` does NOT break on `_` (it is a \w character), so
// `/\bro\b/` never matches `ro_membrane_elements` and `/\bdrain\b/` never matches
// `drain_collection_sump` — every regex above silently failed on the real slug shape.
// This is exactly why the invariant returned 'not_applicable' on the real Codema
// topology (ro_membrane_elements -> cloth_filter) even after being wired into the chain:
// the FIXTURE-only selftest used display names ('Reverse Osmosis Skid', 'Cloth Filter')
// and never caught it. Normalise underscores/hyphens to spaces before matching — for
// THIS invariant's matching only; the shared vocabulary regexes are untouched.
function _normaliseSlugForMatch(s: string): string {
  return s.replace(/[_-]+/g, ' ')
}

export function evaluateFilterOnDirtyStreamInvariant(
  topology: Array<Record<string, unknown>>,
): FilterOnDirtyStreamResult {
  if (!Array.isArray(topology) || topology.length === 0) return { verdict: 'not_applicable', violations: [] }
  const violations: Array<{ filter: string; upstream: string; reason: string }> = []
  let anyTreatmentNode = false
  for (const e of topology) {
    const rec = e as Record<string, unknown>
    const from = String(rec.from_part ?? '')
    const to = String(rec.to_part ?? '')
    const fromN = _normaliseSlugForMatch(from)
    const toN = _normaliseSlugForMatch(to)
    if (!TREATMENT_UNIT_OP_RE.test(toN)) continue
    anyTreatmentNode = true
    if (POLISH_EXEMPT_RE.test(toN)) continue // an explicit final-polish / point-of-use stage — legitimate on clean water
    if (RECOVERY_BUFFER_RE.test(fromN)) continue // a genuinely dirty/recovered source — the filter's correct role
    if (CLEAN_SOURCE_RE.test(fromN)) {
      violations.push({
        filter: to, upstream: from,
        reason: `"${to}" (a treatment unit-op) sits immediately downstream of "${from}" — an already-CLEAN/RO-permeate stream. A non-polish filter/disinfection stage belongs on the DIRTY/recovered side (design-basis: it exists to make a dirty stream clean, never to re-treat one that already is), unless explicitly named as a final-polish/point-of-use stage.`,
      })
    }
  }
  if (!anyTreatmentNode) return { verdict: 'not_applicable', violations: [] }
  return violations.length > 0 ? { verdict: 'high', violations } : { verdict: 'pass', violations: [] }
}

// ── FILTER-ON-DIRTY-STREAM REORDER (2026-07-08 follow-up to the invariant above) ───────────
// Sam Green: "RO water feeds into cloth filter which doesn't make sense as it's clean
// already... filters and disinfection should be after drain pits." The invariant above only
// FLAGS this (shadow — serial-design-chain-v2.tsx records the verdict and writes a punch-
// list, never blocks, by design: "the physical reorder this defect calls for is a topology-
// authoring fix... a deeper change than this detector should make silently"). This function
// IS that reorder, applied inside deriveProcessTopology itself so the actual rendered P&ID/
// BFD changes, not just an audit verdict.
//
// UNIVERSAL: reuses the EXACT SAME vocabulary the invariant already uses — TREATMENT_UNIT_OP_RE
// / POLISH_EXEMPT_RE / CLEAN_SOURCE_RE / RECOVERY_BUFFER_RE — never a class name. A non-polish
// treatment node whose ORIGINAL spine position lands it immediately downstream of an already-
// clean source is relocated to sit immediately after the (first) recovery buffer on the spine —
// design-basis §5's "conditioning node" position, downstream of the dirty/recovered stream it
// exists to treat. proveNoFalsePositive is built in: (a) a filter fed by a genuinely dirty/
// mid-process stream is untouched (its upstream never matches CLEAN_SOURCE_RE); (b) an
// explicitly-named final-polish/point-of-use stage is untouched (POLISH_EXEMPT_RE); (c) a
// once-through archetype with NO recovery buffer anywhere is untouched (nothing to relocate
// onto — never invents a node).
//
// Detection reads the CURRENT adjacency each pass and iterates to a FIXED POINT, not just a
// single pass (2026-07-08 follow-up — a real fresh chain render, out/topo-verify, exposed a
// cascade case: RO -> Cloth Filter -> Gac Filter. A single pass over the original snapshot
// relocates Cloth Filter but leaves Gac Filter's ORIGINAL upstream as Cloth Filter, so it looks
// untouched at detection time — except removing Cloth Filter closes the gap and Gac Filter is
// now directly downstream of RO, the SAME defect one relocation later. Re-running detection
// after each relocation catches this; capped at items.length passes for guaranteed termination
// (a relocated node's new upstream is the recovery buffer or another already-relocated
// treatment node — neither ever matches CLEAN_SOURCE_RE by vocabulary construction — so each
// pass strictly shrinks the misplaced set until none remain).
function repositionFiltersOntoRecoverySide(
  items: Array<{ name: string; slug: string; rank: number; sub: number; qty: number; _zoneGroup?: string }>,
): void {
  const recoveryItem = items.find((it) => RECOVERY_BUFFER_RE.test(it.name))
  if (!recoveryItem) return // no recovery buffer on this spine — nothing to relocate onto (once-through, untouched)
  for (let pass = 0; pass < items.length; pass++) {
    const misplaced: typeof items = []
    for (let i = 1; i < items.length; i++) {
      const it = items[i]
      if (it === recoveryItem || RECOVERY_BUFFER_RE.test(it.name)) continue // never relocate a recovery buffer itself
      if (!TREATMENT_UNIT_OP_RE.test(it.name)) continue
      if (POLISH_EXEMPT_RE.test(it.name)) continue // explicit final-polish/point-of-use stage — legitimate on clean water
      if (!CLEAN_SOURCE_RE.test(items[i - 1].name)) continue // fed by a genuinely dirty/mid-process stream — untouched
      misplaced.push(it)
    }
    if (misplaced.length === 0) break // fixed point — nothing left misplaced
    for (const it of misplaced) {
      const idx = items.indexOf(it)
      if (idx >= 0) items.splice(idx, 1)
    }
    const insertAt = items.indexOf(recoveryItem) + 1
    items.splice(insertAt, 0, ...misplaced)
  }
}

// ── PARALLEL-PER-ZONE DISTRIBUTION BRANCHES (2026-07-08, the UNIVERSAL multizone
// distribution design-rules handover — Sam Green's real Codema Fischer Farms drawings vs
// the engine's output: "Process is not usually this straight a line" extended by the
// follow-up SME review of the P&ID/BFD/layout — the REAL system is a SHARED-SOURCE,
// PARALLEL-PER-ZONE DISTRIBUTION NETWORK (3 pump trains 90/90/45 m³/h from shared
// reservoirs, each serving a zone with its OWN dosing, each zone's own drainpit), not the
// single serial line the deriver emits.
//
// RULE 1 — a DISTRIBUTION-side item (a prime-mover/manifold/header on the delivery rank —
// rank 9, e.g. a distribution/irrigation pump or a distribution manifold) that the physics
// engine has ALREADY sized to N≥2 per-zone instances (its own `quantity` modifier, ×N — the
// SAME demand-coverage mechanism wordQtyCount() reads for the recovery-collection expansion
// below, e.g. `distribution_manifold_count` = delivery groups, `fertigation_dosing_pump_
// count` = one per department) is expanded into N distinct PARALLEL-branch spine nodes,
// instead of the single collapsed node the plain slug-dedupe above produces.
//
// RULE 2 (point-of-use conditioning) falls out of the SAME mechanism: a conditioning/dosing
// unit whose setpoint varies PER ZONE (e.g. a fertigation A/B dosing skid, a per-zone chemical
// trim/injection unit) is exactly this shape, so it renders attached to EACH branch (point of
// use), not once centrally. The delivery-application override in ROLE_PATTERNS (rank 9,
// "fertigation/irrigation/watering") already reclassifies most REAL water-plant dosing pumps
// to rank 9 — the isDistributionBranchCandidate rank-9-mover branch below catches those; the
// DOSING vocabulary branch keeps the rule general for an archetype whose conditioning unit
// isn't named for its delivery system (a bare "Zone Chemical Dosing Skid", a per-reactor
// injection unit, …). DELIBERATELY NARROWER than rank 1's full ROLE_PATTERNS vocabulary
// (preheat/guard-bed/dryer/blend/mixer/saturate/SOFTEN/dechlor/antiscalant/dosing all share
// rank 1): a shared PRETREATMENT stage sized ≥2 for its OWN reasons (e.g. two softener tanks
// alternating regeneration cycles) is a CENTRAL stage, not a per-zone point-of-use dose, and
// must NOT be mistaken for Rule 2 — only the DOSING/INJECTION/CHEMICAL-TRIM noun itself
// (never the wider "conditioning" rank) signals "varies per zone".
//
// NEVER FABRICATES (RULE 1/2's proveNoFalsePositive): only expands a node the physics engine
// has ALREADY counted ≥2 — a node stuck at qty=1 (a genuinely single shared prime-mover/
// manifold, or a once-through/single-train archetype with no zone replication at all — BESS,
// CO2 mineralisation, DAC) is untouched, so that design stays exactly ONE train/line, never an
// invented parallel branch. Deliberately EXCLUDES the recovery-buffer/collection vocabulary
// already owned by expandRecoveryCollectionPerZone below (RECOVERY_BUFFER_RE /
// PER_ZONE_COLLECTION_RE) so the two expansion passes never double-process the same node —
// distribution branches upstream (feed→zone), recovery collection downstream (zone→return),
// mirror images of the same "network, not a line" fix on opposite sides of the spine.
const DISTRIBUTION_HEADER_RE = /\b(manifold|header)\b/i
const POINT_OF_USE_DOSING_RE = /\bdos(?:e|ing|er)\b|\binject(?:ion|or)?\b|\btrim\b|\bchemical\b/i

function isDistributionBranchCandidate(it: { name: string; rank: number; sub: number }): boolean {
  if (RECOVERY_BUFFER_RE.test(it.name) || PER_ZONE_COLLECTION_RE.test(it.name)) return false // owned by the recovery-side expansion below — never double-process
  if (it.rank === 1 && POINT_OF_USE_DOSING_RE.test(it.name)) return true // a per-zone dosing/injection/chemical-trim unit — point-of-use (Rule 2); NOT the wider rank-1 "conditioning" vocabulary (a shared softener/preheat/dryer stage is central, not per-zone)
  if (it.rank === 9 && (it.sub === 1 || DISTRIBUTION_HEADER_RE.test(it.name))) return true // a distribution prime-mover (mover sub-role) or a manifold/header
  return false
}

function expandDistributionBranchesPerZone(
  items: Array<{ name: string; slug: string; rank: number; sub: number; qty: number; _zoneGroup?: string }>,
): void {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (!Number.isFinite(it.qty) || it.qty < 2) continue // single-zone / non-counted — untouched (no fabrication)
    if (!isDistributionBranchCandidate(it)) continue
    const n = Math.round(it.qty)
    const zoneGroup = it.slug
    const replicas = Array.from({ length: n }, (_, k) => ({
      name: `${it.name} ${k + 1}`,
      slug: `${it.slug}_${k + 1}`,
      rank: it.rank,
      sub: it.sub,
      qty: 1,
      _zoneGroup: zoneGroup,
    }))
    items.splice(i, 1, ...replicas)
  }
}

// ── PER-ZONE RECOVERY-COLLECTION EXPANSION (2026-07-08, Sam Green SME review — "the real
// system has per-zone drainpits + buried recovery pipe" vs the engine's single shared node).
// deriveProcessTopology's item-collection dedupes by SLUG — one spine node per distinct part
// name — which is correct for a genuinely singular vessel but wrong for a recovery COLLECTION
// point (drainpit/sump) the physics engine has already sized to serve N distinct consumer
// zones/departments (its word's own `quantity` modifier, ×N — see engineering-contract.ts
// `drain_collection_sump_count = departmentCount`, "N drain pits, one per cultivation room").
// A P&ID that shows ONE sump for an N-zone recirculating plant is Sam's civils-cost critique
// in diagram form ("drain pits suggest a lot of underground civils work but previous pages
// suggest almost no civils cost" — a collapsed node undercounts the real physical/buried scope).
//
// UNIVERSAL, keyed on generic stream-role vocabulary: RECOVERY_BUFFER_RE (the SAME test the
// recirculation-loop-closure and the reorder above use) PLUS a narrower COLLECTION-POINT noun
// (sump/pit/collection) — deliberately excludes the shared AGGREGATE storage downstream (e.g. a
// "Drainwater Reservoir" or a plant's 2 fixed-capacity storage tanks): those genuinely are one
// or a few shared vessels, not a per-zone structure, so they are NEVER split by this rule. The
// count itself is READ, never fabricated, from the word's own synthesised quantity — a
// single-zone/non-recirculating design (qty=1) is a strict no-op (proveNoFalsePositive).
const PER_ZONE_COLLECTION_RE = /\b(sump|pit|collection)\b/i

function expandRecoveryCollectionPerZone(
  items: Array<{ name: string; slug: string; rank: number; sub: number; qty: number; _zoneGroup?: string }>,
): void {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (!Number.isFinite(it.qty) || it.qty < 2) continue // single-zone / non-counted — untouched
    if (!RECOVERY_BUFFER_RE.test(it.name) || !PER_ZONE_COLLECTION_RE.test(it.name)) continue
    const n = Math.round(it.qty)
    const zoneGroup = it.slug
    const replicas = Array.from({ length: n }, (_, k) => ({
      name: `${it.name} ${k + 1}`,
      slug: `${it.slug}_${k + 1}`,
      rank: it.rank,
      sub: it.sub,
      qty: 1,
      _zoneGroup: zoneGroup,
    }))
    items.splice(i, 1, ...replicas)
  }
}

// Corrects the naive consecutive-chain SERIAL wiring a zone-replica group would otherwise get
// (zone_1 → zone_2 → zone_3, implying one drainpit feeds the next) into the physically-correct
// fan-out (shared upstream → every zone replica) / fan-in (every zone replica → shared
// downstream) shape. Reads the upstream/downstream neighbours off the edges the normal
// consecutive-chain loop already built for the FIRST and LAST replica in the group (which are
// correct — only the INTER-replica links are wrong), then removes the inter-replica edges and
// adds the missing fan edges. No-op when no zone-replica group exists (expandRecoveryCollectionPerZone
// never fired) or a group has only one member.
function reconcileZoneReplicaEdges(
  items: Array<{ slug: string; _zoneGroup?: string }>,
  edges: TopologyEdge[],
): void {
  const groups = new Map<string, string[]>()
  for (const it of items) {
    if (!it._zoneGroup) continue
    if (!groups.has(it._zoneGroup)) groups.set(it._zoneGroup, [])
    groups.get(it._zoneGroup)!.push(it.slug)
  }
  for (const slugs of groups.values()) {
    if (slugs.length < 2) continue
    const slugSet = new Set(slugs)
    let upstream: string | null = null
    let downstream: string | null = null
    for (const e of edges) {
      if (slugSet.has(e.to_part) && !slugSet.has(e.from_part)) upstream = e.from_part
      if (slugSet.has(e.from_part) && !slugSet.has(e.to_part)) downstream = e.to_part
    }
    for (let i = edges.length - 1; i >= 0; i--) {
      if (slugSet.has(edges[i].from_part) && slugSet.has(edges[i].to_part)) edges.splice(i, 1)
    }
    for (const slug of slugs) {
      if (upstream && !edges.some((e) => e.from_part === upstream && e.to_part === slug)) {
        edges.push({
          from_part: upstream, to_part: slug, mechanism: 'fluid_loop', constraint_kind: 'flow_capacity',
          material_context: 'per-zone recovery collection — fan-out from the shared upstream stage to each zone’s own drainpit/sump',
        } as TopologyEdge)
      }
      if (downstream && !edges.some((e) => e.from_part === slug && e.to_part === downstream)) {
        edges.push({
          from_part: slug, to_part: downstream, mechanism: 'fluid_loop', constraint_kind: 'flow_capacity',
          material_context: 'per-zone recovery collection — fan-in from each zone’s drainpit/sump into the shared conditioning stage',
        } as TopologyEdge)
      }
    }
  }
}

// A FIELD INSTRUMENT word (sensor / transmitter / transducer / analyser / gauge / probe / level /
// flow / pressure / temperature element) — needs a SIGNAL tie to the control system.
const INSTRUMENT_RE =
  /\b(transmitter|transducer|sensor|analy[sz]er|gauge|probe|detector|\borp\b|\bph\b|conductivity|turbidity|silica|chlorine|level|flow ?meter|flowmeter)\b/i
// The CONTROL HUB nouns — the PLC / SCADA / control-system the instruments report to.
// TIERED (v55 fix): the bare noun 'controller' also matches POWER-ELECTRONIC device controllers
// ('Dc3 Power Controller', a motor/drive/dosing controller) — v55 wired every instrument's
// 4-20 mA signal to the DC POWER controller instead of the plant control panel. A device
// controller is NEVER the plant control hub; a generic 'controller' is only a LAST-resort hub.
const NON_HUB_CONTROLLER_RE =
  /\b(power|motor|speed|drive|dosing|pump|temperature|lighting|charge|battery|inverter)\s+controller\b/i
function hubTier(name: string): number {
  const n = name || ''
  if (/\b(scada|plant control|control system|dcs)\b/i.test(n)) return 0
  if (/\bplc\b/i.test(n)) return 1
  if (/\bcontrol (?:panel|cabinet)\b/i.test(n)) return 2
  if (/\bcontroller\b/i.test(n) && !NON_HUB_CONTROLLER_RE.test(n)) return 3
  return -1 // not a control hub (incl. any device-level power/motor/drive controller)
}
const CONTROL_HUB_RE = { test: (n: string) => hubTier(n) >= 0 } // same call-shape as a RegExp

/**
 * Derive SIGNAL topology — every field INSTRUMENT wires to the control hub (a PLC / SCADA / control
 * system). The fluid topology (above) deliberately EXCLUDES instruments/controllers (they are P&ID
 * tags / panel contents, not fluid-spine nodes) AND the Blender signal-wiring only sees 3-D-PLACED
 * parts — but instruments + control gear are dropped from the 3-D scene (ga_massing), so they never
 * get a signal edge and the connectivity audit reports "0 of N instruments wired" (an orphan-sensor
 * FAIL). This pass adds the LOGICAL instrument→control-hub signal edges, independent of 3-D placement,
 * so the connection-ledger + the deterministic instrument-association invariant see a wired plant.
 * Returns [] when there is no control hub or no instrument. UNIVERSAL — keyed on the instrument +
 * control-hub vocabulary, no class table.
 */
export function deriveSignalTopology(modules: AnyModule[]): TopologyEdge[] {
  // Endpoints are the part's HUMAN NAME (name_human), NOT the slug. The connection-ledger's
  // referential-integrity check resolves an edge endpoint against the AUTHORED part names; the
  // slug→placed-part resolution that fluid edges rely on never fires for an instrument (it is not in
  // the 3-D scene), so a slug endpoint reads as "not an authored part" (broken reference). Using the
  // authored name resolves cleanly without needing the instrument to be placed.
  const instruments: string[] = []
  const hubs: string[] = []
  const seenI = new Set<string>()
  const seenH = new Set<string>()
  for (const m of modules || []) {
    for (const sm of m.sub_modules || []) {
      for (const w of sm.words || []) {
        if (!w || (w as AnyWord)._subcomponent) continue
        const name = w.name_human || w.content_character?.name_human || ''
        if (!name) continue
        if (CONTROL_HUB_RE.test(name)) {
          if (!seenH.has(name)) { seenH.add(name); hubs.push(name) }
        } else if (INSTRUMENT_RE.test(name)) {
          if (!seenI.has(name)) { seenI.add(name); instruments.push(name) }
        }
      }
    }
  }
  if (hubs.length === 0 || instruments.length === 0) return []
  // Prefer the highest hub TIER (SCADA/plant-control(0) > PLC(1) > control panel(2) > generic
  // controller(3)); name is only the deterministic tie-break WITHIN a tier. v55's alphabetical
  // pick chose 'Dc3 Power Controller' over the plant control panel.
  const hub = hubs.sort((a, b) => hubTier(a) - hubTier(b) || a.localeCompare(b))[0]
  const edges: TopologyEdge[] = []
  for (const inst of instruments) {
    if (inst === hub) continue
    edges.push({
      from_part: inst, to_part: hub, mechanism: 'signal',
      constraint_kind: 'signal', material_context: 'instrument signal cable 4-20mA',
    } as TopologyEdge)
  }
  return edges
}

// ── FLOW-DEMAND JOIN (2026-07-02, the v52 "every fluid edge required_value=null" fix) ──
// The contract's flow demands live as PER-PART quantities (fertigation_dosing_pump_
// throughput_m3_h = 45, gac_softener_throughput_m3_h = 14.5, …) but were never joined
// onto the topology edges — so connection_sizing received flow=0 for every fluid line,
// sized everything at the DN15 minimum, and (since commit 1303f8535) the Line & velocity
// tab honestly reads UNVERIFIED/FAIL. This join moves the landed Excel-render fallback
// (build-excel-export.py::_flow_qty_for_part, commit 1303f8535) UPSTREAM so the edges
// CARRY the demand and the pipes SIZE from it.
//
// MATCH SEMANTICS (mirrors the Excel join + the distinguishing-token discipline of
// edm._equip_kw_from_quantities, commit f9dfc2918 — the blanket-match family has bitten
// 3×): (1) exact snake(endpoint) + flow-suffix key; (2) else a UNIQUE snake(endpoint)-
// prefixed flow-suffix candidate — never a guess between two, and a name made ONLY of
// generic tokens (pump/tank/filter/…) may never ride the prefix path (generic tokens
// never decide); NO bare-substring containment anywhere. Ambiguity → null.
//
// PRECEDENCE RULE (the governing endpoint): the DESTINATION's demand governs — a line is
// sized for what the consumer it feeds must receive (a DN-tap to a 14.5 m³/h softener
// carries the softener's demand, not the 90 m³/h loop). When the destination carries no
// flow quantity, the SOURCE's delivery rating governs (a pump's rated delivery IS the
// design flow of the line it drives — which is also how a recycle/return edge takes its
// loop's flow: the return pump that drives the loop names it). NEVER fabricate: no
// matching quantity on either endpoint → required_value stays null and the honest-
// UNVERIFIED path from 1303f8535 reports it.

const FLOW_QTY_SUFFIXES = [
  '_throughput_m3_h', '_flow_m3_h', '_demand_m3_h', '_capacity_m3_h',
  '_throughput_m3_per_hr', '_flow_m3_per_hr', '_demand_m3_per_hr',
] as const

// Tokens that carry no identity — every pump/tank/filter shares them; a name made ONLY
// of these must never decide a prefix match (same discipline as _GENERIC_EQUIP_TOKENS).
const GENERIC_FLOW_TOKENS = new Set([
  'pump', 'tank', 'vessel', 'filter', 'water', 'system', 'unit', 'skid', 'motor',
  'line', 'pipe', 'main', 'process', 'supply',
])

function qtyNum(v: unknown): number | null {
  const raw = v !== null && typeof v === 'object' ? (v as { value?: unknown }).value : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** (quantity key, flow m³/h) for an endpoint name, or null — see MATCH SEMANTICS above. */
export function flowQtyForPart(
  name: unknown,
  quantities: Record<string, unknown>,
): { key: string; flowM3h: number } | null {
  const s = slugify(String(name ?? ''))
  if (!s) return null
  // (1) exact snake-name + flow-suffix
  for (const suf of FLOW_QTY_SUFFIXES) {
    const v = qtyNum(quantities[s + suf])
    if (v !== null && v > 0) return { key: s + suf, flowM3h: v }
  }
  // (2) a UNIQUE prefixed candidate — generic-only names are barred from this path
  const toks = s.split('_').filter(Boolean)
  if (toks.length > 0 && toks.every((t) => GENERIC_FLOW_TOKENS.has(t))) return null
  const cands: Array<{ key: string; flowM3h: number }> = []
  for (const k of Object.keys(quantities)) {
    if (!k.startsWith(s + '_')) continue
    if (!FLOW_QTY_SUFFIXES.some((suf) => k.endsWith(suf))) continue
    const v = qtyNum(quantities[k])
    if (v !== null && v > 0) cands.push({ key: k, flowM3h: v })
  }
  return cands.length === 1 ? cands[0] : null
}

/**
 * Join the contract's per-part flow demands onto the FLUID topology edges in place
 * (required_value + required_unit + a _flow_join_basis provenance note). Only a fluid
 * edge (mechanism contains 'fluid', or 'water') with NO existing required_value and a
 * flow_capacity (or absent) constraint_kind is touched — a hand-authored rating is
 * never overwritten, and no edge is ever given a fabricated value. Returns the number
 * of edges joined.
 */
export function joinFlowDemandsOntoTopology(
  topology: Array<Record<string, unknown>>,
  quantities: Record<string, unknown>,
): number {
  if (!Array.isArray(topology) || topology.length === 0) return 0
  if (!quantities || typeof quantities !== 'object') return 0
  let joined = 0
  for (const e of topology) {
    if (!e || typeof e !== 'object') continue
    const mech = String(e.mechanism ?? '').toLowerCase()
    if (!(mech.includes('fluid') || mech === 'water')) continue // fluid lines only
    const ck = e.constraint_kind
    if (ck != null && ck !== 'flow_capacity') continue // don't re-type an authored constraint
    if (e.required_value != null) continue // never overwrite an authored rating
    // destination's demand governs; else the source's delivery (see PRECEDENCE RULE)
    const dst = flowQtyForPart(e.to_part, quantities)
    const src = dst ? null : flowQtyForPart(e.from_part, quantities)
    const hit = dst ?? src
    if (!hit) continue // honest null — the UNVERIFIED path reports it
    e.required_value = hit.flowM3h
    e.required_unit = 'm3/h'
    if (ck == null) e.constraint_kind = 'flow_capacity'
    e._flow_join_basis = `contract qty ${hit.key} = ${hit.flowM3h} m3/h (${dst ? 'destination demand' : 'source delivery'})`
    joined++
  }
  return joined
}

// ── proveCatch selftest ──────────────────────────────────────────────────────
function _selftest() {
  const mk = (name: string): AnyWord => ({ name_human: name, _synthesized: true })
  // a water plant's synthesised equipment (the real Codema set, incl. electrical +
  // instruments + valves that MUST be excluded from the fluid spine)
  const modules: AnyModule[] = [{
    sub_modules: [{
      words: [
        mk('Mains Incomer'), mk('Reverse Osmosis Skid'), mk('Ro Membrane'),
        mk('Gac Filter'), mk('Softener Vessel'), mk('Cloth Filter'),
        mk('Fresh Water Tank'), mk('Total Water Storage'), mk('Drain Collection Sump'),
        mk('Irrigation Pump'), mk('Fertigation Dosing Pump'),
        // GROUNDED principal vessels (NOT _synthesized) — must now appear on the spine
        // (the P&ID-coverage gap: these were skipped by the synthesised-only walk):
        { name_human: 'Cip Tank', _synthesized: false },
        { name_human: 'Cleaning Tank', _synthesized: false },
        { name_human: 'Uf Membrane Bank', _synthesized: false },
        // v55 SCRAMBLE adversarial set (2026-07-02): the HP pump + module bank whose
        // alphabetical tie-break produced 'RO HP pump discharges into the UF bank', and
        // the three structural skid FRAMES that were threaded INTO the process chain.
        mk('Ro High Pressure Pump'), mk('Uf Module Bank'),
        mk('Painted Carbon Steel Skid Frame'), mk('Painted Steel Skid Frame'),
        mk('Sst304 Skid Frame'),
        // a grounded SUB-COMPONENT must NOT appear (it is part of a parent vessel):
        { name_human: 'Tank Wall (laminate)', _synthesized: false, _subcomponent: true },
        // these MUST be excluded from the process spine:
        mk('Standby Diesel Generator'), mk('Main Switchboard'), mk('SCADA / Plant Control System'),
        mk('Inlet Flow Control Valve'), mk('Level Transmitter'), mk('pH Analyser'),
        { name_human: 'Skeleton Filler', _synthesized: false }, // non-synth, non-process → ignored
      ],
    }],
  }]
  const topo = deriveProcessTopology(modules)
  if (topo.length === 0) throw new Error('derive-topology FAILED: empty topology for a water plant with principal equipment')
  const endpoints = new Set<string>()
  for (const e of topo) { endpoints.add(e.from_part); endpoints.add(e.to_part) }
  // electrical / instrument / valve gear must NOT appear as process nodes
  for (const bad of ['standby_diesel_generator', 'main_switchboard', 'inlet_flow_control_valve', 'level_transmitter', 'ph_analyser', 'scada_plant_control_system']) {
    if (endpoints.has(bad)) throw new Error(`derive-topology leaked a non-process node onto the fluid spine: ${bad}`)
  }
  // the principal process equipment MUST be present — incl. the GROUNDED (non-synth) vessels
  for (const need of ['reverse_osmosis_skid', 'gac_filter', 'fresh_water_tank', 'irrigation_pump', 'cip_tank', 'cleaning_tank', 'uf_membrane_bank']) {
    if (!endpoints.has(need)) throw new Error(`derive-topology missing principal equipment node: ${need}`)
  }
  // a grounded SUB-COMPONENT must NOT be promoted to a spine node
  if (endpoints.has('tank_wall_laminate')) throw new Error('derive-topology leaked a sub-component (Tank Wall) onto the spine')
  // feed must come before product on the spine (RO/membrane/filter < storage/pump rank)
  const ranks = topo.map(e => e.from_part)
  if (!ranks.includes('gac_filter')) throw new Error('derive-topology: separation stage absent from spine')

  // ── v55 SCRAMBLE proveCatch (2026-07-02) — each check FIRES on the pre-fix behaviour ──
  // The spine is a serial chain, so spine position = index in the from→to sequence.
  const order: string[] = [topo[0].from_part, ...topo.map(e => e.to_part)]
  const idx = (slug: string) => {
    const i = order.indexOf(slug)
    if (i < 0) throw new Error(`derive-topology proveCatch: expected spine node missing: ${slug}`)
    return i
  }
  // (1) structural skid FRAMES must NOT be process nodes (pre-fix: 3 frames serially threaded)
  for (const bad of ['painted_carbon_steel_skid_frame', 'painted_steel_skid_frame', 'sst304_skid_frame']) {
    if (endpoints.has(bad)) throw new Error(`derive-topology leaked a STRUCTURAL frame onto the fluid spine: ${bad}`)
  }
  // (2) membrane fineness: UF (coarser) feeds the RO train, never the reverse (pre-fix:
  //     RO HP pump discharged backwards into the UF bank via the alphabetical tie-break)
  if (!(idx('uf_membrane_bank') < idx('ro_high_pressure_pump')) || !(idx('uf_module_bank') < idx('ro_high_pressure_pump'))) {
    throw new Error(`derive-topology: UF must be UPSTREAM of the RO HP pump (got order ${order.join(' → ')})`)
  }
  // (3) a stage's MOVER discharges INTO the stage units it drives: the RO HP pump feeds the
  //     RO membranes (role-based sub-order, not alphabetical)
  if (!(idx('ro_high_pressure_pump') < idx('ro_membrane'))) {
    throw new Error('derive-topology: the RO HP pump must FEED the RO membranes (mover before unit within the rank)')
  }
  // (4) delivery-application override: the fertigation dosing pump sits at the DELIVERY end,
  //     never at the spine head feeding the softener (pre-fix: 'dosing' rank-1 match)
  if (!(idx('softener_vessel') < idx('fertigation_dosing_pump'))) {
    throw new Error('derive-topology: fertigation dosing pump must be DOWNSTREAM of pretreatment (delivery-application override)')
  }
  if (order[0] === 'fertigation_dosing_pump') throw new Error('derive-topology: fertigation dosing pump must not head the spine')
  // (5) storage feeds its distribution mover (tank → pump, not pump → tank)
  if (!(idx('fresh_water_tank') < idx('irrigation_pump'))) {
    throw new Error('derive-topology: storage must feed its distribution pump (fresh_water_tank before irrigation_pump)')
  }
  // (6) no self-loop is ever authored
  for (const e of topo) if (e.from_part === e.to_part) throw new Error(`derive-topology authored a self-loop: ${e.from_part}`)
  // empty / single-node inputs return []
  if (deriveProcessTopology([]).length !== 0) throw new Error('derive-topology: empty modules must yield []')
  if (deriveProcessTopology([{ sub_modules: [{ words: [mk('Lone Tank')] }] }]).length !== 0) throw new Error('derive-topology: single node must yield [] (no edge)')
  // a class that ALREADY has principal equipment but where all are electrical → [] (no fluid spine invented)
  const elecOnly = deriveProcessTopology([{ sub_modules: [{ words: [mk('Main Switchboard'), mk('Distribution Transformer'), mk('Standby Diesel Generator')] }] }])
  if (elecOnly.length !== 0) throw new Error('derive-topology: electrical-only plant must NOT get an invented fluid spine')
  // SIGNAL topology: every instrument wires to the control hub (orphan-sensor fix).
  const sig = deriveSignalTopology([{ sub_modules: [{ words: [
    mk('Level Transmitter'), mk('pH Analyser'), mk('Pressure Transducer'),
    mk('SCADA / Plant Control System'), mk('PLC Controller'),
    mk('Reverse Osmosis Skid'), // a process vessel — NOT an instrument, must not get a signal edge
  ] }] }])
  if (sig.length < 3) throw new Error(`derive-topology SIGNAL: the 3 instruments must each get a signal edge to the hub (got ${sig.length})`)
  for (const e of sig) {
    if (e.mechanism !== 'signal') throw new Error('derive-topology SIGNAL: edges must carry mechanism "signal"')
    // endpoints must be the AUTHORED human name (so the ledger referential-integrity check resolves them), NOT a slug
    if (/_/.test(String(e.from_part))) throw new Error(`derive-topology SIGNAL: endpoint must be the authored human name, not a slug (got "${e.from_part}")`)
    if (e.from_part === 'Reverse Osmosis Skid') throw new Error('derive-topology SIGNAL: a process vessel must NOT get a signal edge')
  }
  const sigHubs = new Set(sig.map(e => e.to_part))
  if (sigHubs.size !== 1) throw new Error(`derive-topology SIGNAL: all instruments must wire to ONE control hub (got ${[...sigHubs].join(',')})`)
  // no control hub OR no instrument → []
  if (deriveSignalTopology([{ sub_modules: [{ words: [mk('Fresh Water Tank'), mk('Irrigation Pump')] }] }]).length !== 0) throw new Error('derive-topology SIGNAL: no instrument/hub must yield []')
  // v55 proveCatch: a device-level POWER controller is NEVER the plant control hub — with a
  // 'Dc3 Power Controller' AND an 'Electrical Control Panel' present, the instruments wire to
  // the CONTROL PANEL (pre-fix: alphabetical pick sent every 4-20 mA signal to the DC power
  // controller); with ONLY the power controller present, NO signal hub exists (no edges).
  const sigV55 = deriveSignalTopology([{ sub_modules: [{ words: [
    mk('Level Transmitter'), mk('pH Analyser'),
    mk('Dc3 Power Controller'), mk('Electrical Control Panel'),
  ] }] }])
  if (sigV55.length !== 2 || sigV55.some(e => e.to_part !== 'Electrical Control Panel')) {
    throw new Error(`derive-topology SIGNAL: instruments must wire to the control PANEL, never a device power controller (got ${JSON.stringify(sigV55.map(e => e.to_part))})`)
  }
  if (deriveSignalTopology([{ sub_modules: [{ words: [mk('Level Transmitter'), mk('Dc3 Power Controller')] }] }]).length !== 0) {
    throw new Error('derive-topology SIGNAL: a lone device power controller must not become the signal hub')
  }

  // ── FLOW-DEMAND JOIN (the v52 required_value=null fix) ──────────────────────
  const q = {
    fertigation_dosing_pump_throughput_m3_h: { value: 45 },
    gac_softener_throughput_m3_h: 14.5,
    irrigation_pump_flow_m3_h: 90,
    drain_transfer_pump_throughput_m3_h: 45,
    // TWO tank-farm keys share the 'storage_tank' prefix → ambiguous, must never decide:
    storage_tank_a_flow_m3_h: 10, storage_tank_b_flow_m3_h: 20,
  } as Record<string, unknown>
  const jt: Array<Record<string, unknown>> = [
    // destination demand governs (dest 14.5 beats source 45):
    { from_part: 'fertigation_dosing_pump', to_part: 'gac_softener', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    // destination has no qty → source delivery governs (the recycle/return case):
    { from_part: 'drain_transfer_pump', to_part: 'fresh_water_tank', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    // NO-FABRICATION counter-case: neither endpoint has a flow qty → stays null:
    { from_part: 'grp_membrane_housings', to_part: 'uf_module_bank', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    // an authored rating is NEVER overwritten:
    { from_part: 'irrigation_pump', to_part: 'gac_softener', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 7.7, required_unit: 'm3/h' },
    // a NON-fluid edge is untouched even when its endpoints carry flow quantities:
    { from_part: 'irrigation_pump', to_part: 'main_switchboard', mechanism: 'electrical_bus', constraint_kind: 'current_rating' },
    // ambiguity between two prefixed candidates → null (never a guess):
    { from_part: 'clean_water_pump', to_part: 'storage_tank', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const nJoined = joinFlowDemandsOntoTopology(jt, q)
  if (nJoined !== 2) throw new Error(`flow-join: expected exactly 2 edges joined, got ${nJoined}`)
  if (jt[0].required_value !== 14.5 || !String(jt[0]._flow_join_basis).includes('destination demand')) throw new Error(`flow-join: destination demand must govern (got ${jt[0].required_value})`)
  if (jt[1].required_value !== 45 || !String(jt[1]._flow_join_basis).includes('source delivery')) throw new Error(`flow-join: source delivery must govern when the destination has no qty (got ${jt[1].required_value})`)
  if (jt[2].required_value != null) throw new Error('flow-join: NO-FABRICATION violated — an edge with no matching quantity must stay null')
  if (jt[3].required_value !== 7.7) throw new Error('flow-join: an authored rating must never be overwritten')
  if (jt[4].required_value != null) throw new Error('flow-join: a non-fluid edge must be untouched')
  if (jt[5].required_value != null) throw new Error('flow-join: two prefixed candidates are ambiguous — must stay null')
  // generic-only name must not ride the unique-prefix path even when unambiguous:
  if (flowQtyForPart('tank', { tank_farm_flow_m3_h: 33 }) !== null) throw new Error('flow-join: a generic-only name must never decide a prefix match')
  // …but its EXACT key still matches (the full name IS the identity):
  const g = flowQtyForPart('tank', { tank_flow_m3_h: 33 })
  if (!g || g.flowM3h !== 33) throw new Error('flow-join: exact snake-name + suffix must match even for a generic name')

  // ── UNIVERSAL RECIRCULATION-LOOP CLOSURE proveCatch + proveNoFalsePositive (2026-07-07) ──
  // (a) proveCatch: the REAL Codema water-plant fixture (defined above, used by the whole
  // existing test) already includes 'Drain Collection Sump' — a recovery-buffer name — so
  // `topo` (computed above) must ALREADY contain the auto-injected back-edge closing the loop
  // to the spine head. This proves the loop-closure fires on a genuinely recirculating,
  // real-world equipment list, not just a hand-crafted synthetic one.
  const backEdge = topo.find((e) => (e as unknown as { _recirculation_loop?: boolean })._recirculation_loop)
  if (!backEdge) throw new Error('derive-topology RECIRC: expected an auto-injected recovery loop for the Codema water-plant fixture (Drain Collection Sump) — none found')
  if (backEdge.from_part !== 'drain_collection_sump') throw new Error(`derive-topology RECIRC: expected the loop to close FROM the recovery buffer (drain_collection_sump), got ${backEdge.from_part}`)
  if (backEdge.to_part !== order[0]) throw new Error(`derive-topology RECIRC: expected the loop to close back TO the spine head (${order[0]}), got ${backEdge.to_part}`)
  if (backEdge.mechanism !== 'fluid_loop') throw new Error('derive-topology RECIRC: the closing edge must carry mechanism fluid_loop')
  // a genuine cycle: the closing edge's to_part must equal an EARLIER edge's from_part.
  const seenFromCheck = new Set<string>()
  let cycleFound = false
  for (const e of topo) {
    if (seenFromCheck.has(e.to_part)) cycleFound = true
    seenFromCheck.add(e.from_part)
  }
  if (!cycleFound) throw new Error('derive-topology RECIRC: topology must contain a genuine cycle (a to_part matching an earlier from_part), not just a line')

  // (b) proveNoFalsePositive: a genuinely ONCE-THROUGH archetype (mirrors CO2 mineralisation /
  // DAC — feed gas -> absorber -> reactor -> product storage, waste/reject genuinely disposed,
  // never named as a recovery buffer) must get NO injected loop and stay a pure chain.
  const onceThroughModules: AnyModule[] = [{
    sub_modules: [{
      words: [
        mk('Flue Gas Intake'), mk('Amine Absorber Column'), mk('Mineralisation Reactor'),
        mk('Gypsum Product Storage Silo'), mk('K2so4 Product Storage Tank'),
        mk('Waste Brine Disposal Sump'), mk('Concentrate Reject Tank'), // disposal — must NOT loop
      ],
    }],
  }]
  const onceThroughTopo = deriveProcessTopology(onceThroughModules)
  if (onceThroughTopo.length === 0) throw new Error('derive-topology RECIRC counter-case: expected a fluid spine for the once-through fixture')
  if (onceThroughTopo.some((e) => (e as unknown as { _recirculation_loop?: boolean })._recirculation_loop)) {
    throw new Error('derive-topology RECIRC: a FALSE loop was injected on a genuinely once-through archetype (waste/reject/brine disposal must never be looped back)')
  }
  const seenFromOT = new Set<string>()
  let cycleFoundOT = false
  for (const e of onceThroughTopo) {
    if (seenFromOT.has(e.to_part)) cycleFoundOT = true
    seenFromOT.add(e.from_part)
  }
  if (cycleFoundOT) throw new Error('derive-topology RECIRC: the once-through fixture must stay acyclic (a straight chain)')

  // ── UNIVERSAL MAKEUP-SIZING INVARIANT proveCatch + proveNoFalsePositive ─────────────────
  // (a) proveCatch: a loop exists AND the makeup edge is sized to (≈) the FULL circulation
  // flow instead of losses only — must flag 'high'.
  const badLoopTopo: Array<Record<string, unknown>> = [
    { from_part: 'ro_makeup_skid', to_part: 'cleanwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 225 }, // WRONG: makeup sized to full loop
    { from_part: 'cleanwater_reservoir', to_part: 'pump_units', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 225 },
    { from_part: 'pump_units', to_part: 'drainwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 220 },
    { from_part: 'drainwater_reservoir', to_part: 'cleanwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' }, // closes the cycle (to_part = an earlier from_part)
  ]
  const badVerdict = evaluateMakeupSizingInvariant(badLoopTopo, {})
  if (badVerdict.verdict !== 'high') throw new Error(`makeup-sizing invariant proveCatch FAILED: expected 'high' for a makeup edge sized to the full loop, got '${badVerdict.verdict}' (${badVerdict.reason})`)

  // (b) proveNoFalsePositive #1: a CORRECTLY-sized loop (makeup << circulation) must PASS.
  const goodLoopTopo: Array<Record<string, unknown>> = [
    { from_part: 'ro_makeup_skid', to_part: 'cleanwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 11 }, // RIGHT: losses only (~11 m3/h city water)
    { from_part: 'cleanwater_reservoir', to_part: 'pump_units', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 225 },
    { from_part: 'pump_units', to_part: 'drainwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 220 },
    { from_part: 'drainwater_reservoir', to_part: 'cleanwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const goodVerdict = evaluateMakeupSizingInvariant(goodLoopTopo, {})
  if (goodVerdict.verdict !== 'pass') throw new Error(`makeup-sizing invariant proveNoFalsePositive FAILED (correctly-sized loop): expected 'pass', got '${goodVerdict.verdict}' (${goodVerdict.reason})`)
  if (goodVerdict.ratio === null || goodVerdict.ratio >= 0.5) throw new Error(`makeup-sizing invariant: expected a materially-smaller makeup ratio, got ${goodVerdict.ratio}`)

  // (b) proveNoFalsePositive #2: NO loop at all → 'not_applicable' (never flagged 'high').
  const lineTopo: Array<Record<string, unknown>> = [
    { from_part: 'feed_pump', to_part: 'reactor', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 50 },
    { from_part: 'reactor', to_part: 'product_tank', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 50 },
  ]
  const naVerdict = evaluateMakeupSizingInvariant(lineTopo, {})
  if (naVerdict.verdict !== 'not_applicable' || naVerdict.has_loop) throw new Error(`makeup-sizing invariant: a once-through line must be 'not_applicable', got '${naVerdict.verdict}'`)

  // (b) proveNoFalsePositive #3: a loop exists but flow data is incomplete → 'unverified'
  // (never a false 'pass' or a fabricated 'high').
  const unknownFlowLoopTopo: Array<Record<string, unknown>> = [
    { from_part: 'ro_makeup_skid', to_part: 'cleanwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' }, // no required_value
    { from_part: 'cleanwater_reservoir', to_part: 'pump_units', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity', required_value: 225 },
    { from_part: 'pump_units', to_part: 'cleanwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' }, // closes the cycle, no value
  ]
  const unverifiedVerdict = evaluateMakeupSizingInvariant(unknownFlowLoopTopo, {})
  if (unverifiedVerdict.verdict !== 'unverified') throw new Error(`makeup-sizing invariant: a loop with unknown makeup flow must be 'unverified' (never fabricated), got '${unverifiedVerdict.verdict}'`)

  // ── FILTER-ON-DIRTY-STREAM INVARIANT proveCatch + proveNoFalsePositive (2026-07-07) ──
  // (a) proveCatch: the EXACT Sam Green defect — RO permeate feeds straight into a cloth
  // filter (a coarse dirty-stream device), with no polish qualifier anywhere.
  const badFilterTopo: Array<Record<string, unknown>> = [
    { from_part: 'Reverse Osmosis Skid', to_part: 'Cloth Filter', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    { from_part: 'Cloth Filter', to_part: 'Cleanwater Reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const badFilterVerdict = evaluateFilterOnDirtyStreamInvariant(badFilterTopo)
  if (badFilterVerdict.verdict !== 'high') throw new Error(`filter-on-dirty-stream proveCatch FAILED: expected 'high' for a cloth filter fed by RO permeate, got '${badFilterVerdict.verdict}'`)
  if (!badFilterVerdict.violations.some((v) => v.filter === 'Cloth Filter' && v.upstream === 'Reverse Osmosis Skid')) {
    throw new Error(`filter-on-dirty-stream proveCatch: expected the violation to name the Cloth Filter + its RO upstream, got ${JSON.stringify(badFilterVerdict.violations)}`)
  }

  // (a2) proveCatch — REAL SLUG SHAPE (2026-07-08 follow-up): the actual topology this
  // invariant runs against in production is deriveProcessTopology's own SLUGIFIED output
  // (underscore-joined endpoints), not the space-separated display names used above. The
  // real out/codema-sam-verify/state.json topology reads
  // `ro_membrane_elements -> cloth_filter`, exactly this shape — this fixture proves the
  // invariant catches it (a bare `\b`-based regex does NOT break on `_`, so this failed
  // silently before the `_normaliseSlugForMatch` fix).
  const slugBadFilterTopo: Array<Record<string, unknown>> = [
    { from_part: 'reverse_osmosis_skid', to_part: 'ro_membrane_elements', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    { from_part: 'ro_membrane_elements', to_part: 'cloth_filter', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    { from_part: 'cloth_filter', to_part: 'gac_filter', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const slugBadFilterVerdict = evaluateFilterOnDirtyStreamInvariant(slugBadFilterTopo)
  if (slugBadFilterVerdict.verdict !== 'high') throw new Error(`filter-on-dirty-stream proveCatch (slug shape) FAILED: expected 'high' for ro_membrane_elements -> cloth_filter, got '${slugBadFilterVerdict.verdict}'`)
  if (!slugBadFilterVerdict.violations.some((v) => v.filter === 'cloth_filter' && v.upstream === 'ro_membrane_elements')) {
    throw new Error(`filter-on-dirty-stream proveCatch (slug shape): expected the violation to name cloth_filter + its ro_membrane_elements upstream, got ${JSON.stringify(slugBadFilterVerdict.violations)}`)
  }

  // (a3) proveNoFalsePositive — REAL SLUG SHAPE, correctly placed on the recovery side
  // (drain_collection_sump -> cloth_filter, also from the real Codema topology's later
  // stage) must PASS even in slug form.
  const slugGoodFilterTopo: Array<Record<string, unknown>> = [
    { from_part: 'drain_collection_sump', to_part: 'cloth_filter', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    { from_part: 'cloth_filter', to_part: 'drainwater_reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const slugGoodFilterVerdict = evaluateFilterOnDirtyStreamInvariant(slugGoodFilterTopo)
  if (slugGoodFilterVerdict.verdict !== 'pass') throw new Error(`filter-on-dirty-stream proveNoFalsePositive (slug shape) FAILED: expected 'pass', got '${slugGoodFilterVerdict.verdict}' (${JSON.stringify(slugGoodFilterVerdict.violations)})`)

  // (b) proveNoFalsePositive #1: an explicitly-named FINAL POLISH filter on clean water
  // (legitimate — polishing already-treated water immediately before delivery) must PASS.
  const polishTopo: Array<Record<string, unknown>> = [
    { from_part: 'Cleanwater Reservoir', to_part: 'Final Polish Filter', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    { from_part: 'Final Polish Filter', to_part: 'Distribution Pump', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const polishVerdict = evaluateFilterOnDirtyStreamInvariant(polishTopo)
  if (polishVerdict.verdict !== 'pass') throw new Error(`filter-on-dirty-stream proveNoFalsePositive FAILED (final-polish filter): expected 'pass', got '${polishVerdict.verdict}' (${JSON.stringify(polishVerdict.violations)})`)

  // (b) proveNoFalsePositive #2: the SAME cloth filter, correctly placed on the RECOVERY
  // side (fed by a drain-collection sump, the real Codema topology) must PASS.
  const goodFilterTopo: Array<Record<string, unknown>> = [
    { from_part: 'Drain Collection Sump', to_part: 'Cloth Filter', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    { from_part: 'Cloth Filter', to_part: 'Drainwater Reservoir', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const goodFilterVerdict = evaluateFilterOnDirtyStreamInvariant(goodFilterTopo)
  if (goodFilterVerdict.verdict !== 'pass') throw new Error(`filter-on-dirty-stream proveNoFalsePositive FAILED (dirty-side filter): expected 'pass', got '${goodFilterVerdict.verdict}' (${JSON.stringify(goodFilterVerdict.violations)})`)

  // (b) proveNoFalsePositive #3: a topology with NO treatment-unit-op node at all → 'not_applicable'.
  const noFilterTopo: Array<Record<string, unknown>> = [
    { from_part: 'Feed Pump', to_part: 'Reactor', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
    { from_part: 'Reactor', to_part: 'Product Tank', mechanism: 'fluid_loop', constraint_kind: 'flow_capacity' },
  ]
  const noFilterVerdict = evaluateFilterOnDirtyStreamInvariant(noFilterTopo)
  if (noFilterVerdict.verdict !== 'not_applicable') throw new Error(`filter-on-dirty-stream: a topology with no treatment unit-op must be 'not_applicable', got '${noFilterVerdict.verdict}'`)

  // ── FILTER-ON-DIRTY-STREAM REORDER proveCatch + proveNoFalsePositive (2026-07-08) ──────────
  // These drive deriveProcessTopology ITSELF (not the isolated evaluate* helper above), so they
  // prove the ACTUAL rendered spine changes — the bar the SME review set ("if the P&ID still
  // shows the filter after RO, it's NOT fixed regardless of selftest").
  const mkQ = (name: string, qty?: number): AnyWord => ({
    name_human: name, _synthesized: true,
    ...(qty !== undefined ? { modifier_characters: [{ kind: 'quantity', value: `×${qty}` }] } : {}),
  })

  // (a) proveCatch — the EXACT real shape observed in out/codema-sam-verify/state.json
  // (reverse_osmosis_skid -> cloth_filter, with the recovery buffer further down the spine):
  // after derivation, RO must NOT feed the cloth filter directly, and the cloth filter must
  // sit immediately downstream of the recovery buffer instead.
  const reorderCatchTopo = deriveProcessTopology([{
    sub_modules: [{ words: [
      mkQ('Reverse Osmosis Skid'), mkQ('Cloth Filter'), mkQ('Drain Collection Sump'), mkQ('Fresh Water Tank'),
    ] }],
  }])
  if (reorderCatchTopo.some((e) => e.from_part === 'reverse_osmosis_skid' && e.to_part === 'cloth_filter')) {
    throw new Error('filter-reorder proveCatch FAILED: reverse_osmosis_skid -> cloth_filter edge still present after derivation')
  }
  if (!reorderCatchTopo.some((e) => e.from_part === 'drain_collection_sump' && e.to_part === 'cloth_filter')) {
    throw new Error(`filter-reorder proveCatch FAILED: expected the cloth filter relocated immediately after the recovery buffer, got ${JSON.stringify(reorderCatchTopo)}`)
  }

  // (a2) proveCatch — the CASCADE case a real fresh chain render (out/topo-verify, 2026-07-08)
  // exposed: TWO treatment nodes in a row downstream of RO (Reverse Osmosis Skid -> Cloth
  // Filter -> Gac Filter, the exact real ordering — both share rank 4, alphabetical tie-break
  // puts Cloth before Gac). A single-pass fix relocates Cloth Filter and stops, leaving Gac
  // Filter newly adjacent to RO — the SAME defect one relocation later. Both must end up
  // downstream of the recovery buffer.
  const cascadeCatchTopo = deriveProcessTopology([{
    sub_modules: [{ words: [
      mkQ('Reverse Osmosis Skid'), mkQ('Cloth Filter'), mkQ('Gac Filter'), mkQ('Drain Collection Sump'), mkQ('Fresh Water Tank'),
    ] }],
  }])
  if (cascadeCatchTopo.some((e) => e.from_part === 'reverse_osmosis_skid' && (e.to_part === 'cloth_filter' || e.to_part === 'gac_filter'))) {
    throw new Error(`filter-reorder proveCatch (cascade) FAILED: RO must not feed EITHER treatment node directly, got ${JSON.stringify(cascadeCatchTopo)}`)
  }
  if (!cascadeCatchTopo.some((e) => e.from_part === 'drain_collection_sump' && (e.to_part === 'cloth_filter' || e.to_part === 'gac_filter'))) {
    throw new Error(`filter-reorder proveCatch (cascade) FAILED: expected at least one treatment node relocated immediately after the recovery buffer, got ${JSON.stringify(cascadeCatchTopo)}`)
  }

  // (b) proveNoFalsePositive #1 — a legitimate MID-PROCESS filter in a DIFFERENT (non-water)
  // archetype, fed by a genuinely dirty/raw stream (never a clean source), with a recovery
  // buffer present elsewhere on the spine: must stay exactly where rank places it.
  const dirtyStreamFilterTopo = deriveProcessTopology([{
    sub_modules: [{ words: [
      mkQ('Feed Gas Intake'), mkQ('Particulate Filter'), mkQ('Recycle Gas Buffer Tank'), mkQ('Product Storage Silo'),
    ] }],
  }])
  if (!dirtyStreamFilterTopo.some((e) => e.to_part === 'particulate_filter' && e.from_part === 'feed_gas_intake')) {
    throw new Error(`filter-reorder proveNoFalsePositive (dirty-stream filter) FAILED: a filter fed by a genuinely dirty/raw stream must stay put, got ${JSON.stringify(dirtyStreamFilterTopo)}`)
  }

  // (c) proveNoFalsePositive #2 — an explicitly-named FINAL POLISH filter downstream of a clean
  // source, WITH a recovery buffer present elsewhere: must stay put (polish-exempt).
  const polishStaysTopo = deriveProcessTopology([{
    sub_modules: [{ words: [
      mkQ('Reverse Osmosis Skid'), mkQ('Final Polish Filter'), mkQ('Drain Collection Sump'), mkQ('Storage Tank'),
    ] }],
  }])
  if (!polishStaysTopo.some((e) => e.from_part === 'reverse_osmosis_skid' && e.to_part === 'final_polish_filter')) {
    throw new Error(`filter-reorder proveNoFalsePositive (final-polish) FAILED: an explicitly-named polish filter must stay downstream of the clean source, got ${JSON.stringify(polishStaysTopo)}`)
  }

  // (d) proveNoFalsePositive #3 — a genuinely ONCE-THROUGH archetype (no recovery buffer
  // anywhere): a filter downstream of a clean source has nowhere legitimate to relocate to, so
  // it must stay put (never invent a node to relocate onto).
  const onceThroughFilterTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Reverse Osmosis Skid'), mkQ('Cartridge Filter'), mkQ('Product Storage Tank')] }],
  }])
  if (!onceThroughFilterTopo.some((e) => e.from_part === 'reverse_osmosis_skid' && e.to_part === 'cartridge_filter')) {
    throw new Error(`filter-reorder proveNoFalsePositive (once-through, no recovery buffer) FAILED: got ${JSON.stringify(onceThroughFilterTopo)}`)
  }

  // ── PER-ZONE RECOVERY-COLLECTION EXPANSION proveCatch + proveNoFalsePositive (2026-07-08) ──
  // (a) proveCatch — a recovery COLLECTION node (drainpit/sump) the physics engine has sized to
  // qty=2 (the departmentCount-driven contract quantity) must become TWO distinct spine nodes,
  // fanned out from the shared upstream and fanned back in to the shared downstream — never a
  // direct edge between the two zone replicas (that would imply one drainpit feeds the next).
  const zoneCatchTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Drain Collection Sump', 2), mkQ('Drain Water Tank')] }],
  }])
  const zoneSlugs = ['drain_collection_sump_1', 'drain_collection_sump_2']
  for (const slug of zoneSlugs) {
    if (!zoneCatchTopo.some((e) => e.from_part === 'feed_pump' && e.to_part === slug)) {
      throw new Error(`per-zone-recovery proveCatch FAILED: expected fan-out feed_pump -> ${slug}, got ${JSON.stringify(zoneCatchTopo)}`)
    }
    if (!zoneCatchTopo.some((e) => e.from_part === slug && e.to_part === 'drain_water_tank')) {
      throw new Error(`per-zone-recovery proveCatch FAILED: expected fan-in ${slug} -> drain_water_tank, got ${JSON.stringify(zoneCatchTopo)}`)
    }
  }
  if (zoneCatchTopo.some((e) => zoneSlugs.includes(e.from_part) && zoneSlugs.includes(e.to_part))) {
    throw new Error(`per-zone-recovery proveCatch FAILED: a direct edge between the two zone replicas must never be authored (implies serial flow), got ${JSON.stringify(zoneCatchTopo)}`)
  }
  if (zoneCatchTopo.some((e) => e.from_part === 'drain_collection_sump' || e.to_part === 'drain_collection_sump')) {
    throw new Error('per-zone-recovery proveCatch FAILED: the un-suffixed collapsed node must not survive the expansion')
  }

  // (b) proveNoFalsePositive #1 — qty=1 (single-zone / non-recirculating): the collection node
  // stays exactly ONE node, byte-identical to the pre-fix behaviour.
  const zoneSingleTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Drain Collection Sump', 1), mkQ('Drain Water Tank')] }],
  }])
  // (NB: a recirculation-loop-closure edge back to items[0] is ALSO expected here — Drain Water
  // Tank is itself a recovery-buffer match — so this asserts the plain chain survives untouched,
  // not an exact edge count.)
  if (!zoneSingleTopo.some((e) => e.from_part === 'feed_pump' && e.to_part === 'drain_collection_sump')
    || !zoneSingleTopo.some((e) => e.from_part === 'drain_collection_sump' && e.to_part === 'drain_water_tank')
    || zoneSingleTopo.some((e) => /drain_collection_sump_[12]/.test(e.from_part) || /drain_collection_sump_[12]/.test(e.to_part))) {
    throw new Error(`per-zone-recovery proveNoFalsePositive (qty=1) FAILED: expected the plain chain untouched (no zone-suffixed split), got ${JSON.stringify(zoneSingleTopo)}`)
  }

  // (b) proveNoFalsePositive #2 — a SHARED aggregate storage buffer (reservoir/tank, not a
  // collection point) with qty=2 must NEVER be split: it is genuinely one/a-few shared vessels,
  // not a per-zone structure (e.g. the real Codema "2 drain-water storage tanks", a fixed
  // aggregate count unrelated to department count).
  const sharedReservoirTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Drainwater Reservoir', 2), mkQ('Product Storage Tank')] }],
  }])
  if (sharedReservoirTopo.some((e) => /drainwater_reservoir_[12]/.test(e.from_part) || /drainwater_reservoir_[12]/.test(e.to_part))) {
    throw new Error(`per-zone-recovery proveNoFalsePositive (shared reservoir) FAILED: a non-collection-point recovery buffer must never be split, got ${JSON.stringify(sharedReservoirTopo)}`)
  }
  if (!sharedReservoirTopo.some((e) => e.from_part === 'feed_pump' && e.to_part === 'drainwater_reservoir')) {
    throw new Error(`per-zone-recovery proveNoFalsePositive (shared reservoir) FAILED: expected the single collapsed node untouched, got ${JSON.stringify(sharedReservoirTopo)}`)
  }

  // ── PARALLEL-PER-ZONE DISTRIBUTION BRANCHES proveCatch + proveNoFalsePositive (2026-07-08,
  // the UNIVERSAL multizone-distribution handover, RULES 1+2) ──────────────────────────────
  // (a) proveCatch — the REAL Codema shape: a per-zone dosing pump (qty=2, delivery-override
  // rank) AND a per-zone distribution manifold (qty=2) both downstream of ONE shared prime-
  // mover. Both must fan out into PARALLEL branches from their shared upstream and fan back
  // into their shared downstream — never a direct edge between the two zone replicas (that
  // would draw the P&ID as ONE line through both zones, exactly the SME-flagged defect).
  const distCatchTopo = deriveProcessTopology([{
    sub_modules: [{ words: [
      mkQ('Feed Pump'), mkQ('Fertigation Dosing Pump', 2), mkQ('Irrigation Pump'), mkQ('Distribution Manifold', 2),
    ] }],
  }])
  const dosingSlugs = ['fertigation_dosing_pump_1', 'fertigation_dosing_pump_2']
  const manifoldSlugs = ['distribution_manifold_1', 'distribution_manifold_2']
  for (const slug of dosingSlugs) {
    if (!distCatchTopo.some((e) => e.from_part === 'feed_pump' && e.to_part === slug)) {
      throw new Error(`parallel-distribution proveCatch FAILED: expected fan-out feed_pump -> ${slug}, got ${JSON.stringify(distCatchTopo)}`)
    }
    if (!distCatchTopo.some((e) => e.from_part === slug && e.to_part === 'irrigation_pump')) {
      throw new Error(`parallel-distribution proveCatch FAILED: expected fan-in ${slug} -> irrigation_pump, got ${JSON.stringify(distCatchTopo)}`)
    }
  }
  for (const slug of manifoldSlugs) {
    if (!distCatchTopo.some((e) => e.from_part === 'irrigation_pump' && e.to_part === slug)) {
      throw new Error(`parallel-distribution proveCatch FAILED: expected fan-out irrigation_pump -> ${slug}, got ${JSON.stringify(distCatchTopo)}`)
    }
  }
  if (distCatchTopo.some((e) => dosingSlugs.includes(e.from_part) && dosingSlugs.includes(e.to_part))) {
    throw new Error(`parallel-distribution proveCatch FAILED: a direct edge between the two dosing-pump zone replicas must never be authored (implies one serial line), got ${JSON.stringify(distCatchTopo)}`)
  }
  if (distCatchTopo.some((e) => manifoldSlugs.includes(e.from_part) && manifoldSlugs.includes(e.to_part))) {
    throw new Error(`parallel-distribution proveCatch FAILED: a direct edge between the two manifold zone replicas must never be authored (implies one serial line), got ${JSON.stringify(distCatchTopo)}`)
  }
  if (distCatchTopo.some((e) => e.from_part === 'fertigation_dosing_pump' || e.to_part === 'distribution_manifold')) {
    throw new Error('parallel-distribution proveCatch FAILED: the un-suffixed collapsed nodes must not survive the expansion')
  }

  // (a2) proveCatch — RULE 2's GENERAL conditioning path (rank 1), for an archetype whose
  // per-zone conditioning unit is NOT named for a delivery system (so the fertigation/
  // irrigation/watering override never fires) — e.g. a bare "Zone Chemical Dosing Skid".
  const conditioningCatchTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Zone Chemical Dosing Skid', 2), mkQ('Product Tank')] }],
  }])
  const doseSlugs = ['zone_chemical_dosing_skid_1', 'zone_chemical_dosing_skid_2']
  for (const slug of doseSlugs) {
    if (!conditioningCatchTopo.some((e) => e.from_part === 'feed_pump' && e.to_part === slug)) {
      throw new Error(`parallel-distribution proveCatch (rank-1 conditioning) FAILED: expected fan-out feed_pump -> ${slug}, got ${JSON.stringify(conditioningCatchTopo)}`)
    }
    if (!conditioningCatchTopo.some((e) => e.from_part === slug && e.to_part === 'product_tank')) {
      throw new Error(`parallel-distribution proveCatch (rank-1 conditioning) FAILED: expected fan-in ${slug} -> product_tank, got ${JSON.stringify(conditioningCatchTopo)}`)
    }
  }

  // (b) proveNoFalsePositive #1 — qty=1 (a single shared manifold/dosing unit, no zoning):
  // stays exactly ONE node, byte-identical to the pre-fix behaviour.
  const distSingleTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Distribution Manifold', 1)] }],
  }])
  if (!distSingleTopo.some((e) => e.from_part === 'feed_pump' && e.to_part === 'distribution_manifold')
    || distSingleTopo.some((e) => /distribution_manifold_[12]/.test(e.from_part) || /distribution_manifold_[12]/.test(e.to_part))) {
    throw new Error(`parallel-distribution proveNoFalsePositive (qty=1) FAILED: expected the plain single-train chain untouched, got ${JSON.stringify(distSingleTopo)}`)
  }

  // (b) proveNoFalsePositive #2 — a uniform-demand conditioning unit (qty=1, "doses once
  // centrally") must stay a single node — Rule 2's own no-false-positive guard.
  const conditioningSingleTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Zone Chemical Dosing Skid', 1), mkQ('Product Tank')] }],
  }])
  if (conditioningSingleTopo.some((e) => /zone_chemical_dosing_skid_[12]/.test(e.from_part) || /zone_chemical_dosing_skid_[12]/.test(e.to_part))) {
    throw new Error(`parallel-distribution proveNoFalsePositive (uniform-demand conditioning) FAILED: a qty=1 conditioning unit must never be split, got ${JSON.stringify(conditioningSingleTopo)}`)
  }

  // (b) proveNoFalsePositive #4 — the REAL false positive caught on the fischer-codema fast
  // re-render (2026-07-08): a SHARED PRETREATMENT stage sized ≥2 for its own reasons (e.g. two
  // softener tanks alternating regeneration cycles) is a CENTRAL stage, not a per-zone
  // point-of-use dose — the wider rank-1 "conditioning" vocabulary (soften/preheat/dry/blend/
  // mixer/saturate/dechlor/antiscalant) must NEVER be mistaken for Rule 2 just because it
  // shares rank 1 with genuine dosing; only the DOSING/INJECTION/CHEMICAL-TRIM noun itself
  // signals "varies per zone".
  const softenerTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Gac Softener'), mkQ('Softener Vessel', 2), mkQ('Grp Membrane Housings')] }],
  }])
  if (softenerTopo.some((e) => /softener_vessel_[12]/.test(e.from_part) || /softener_vessel_[12]/.test(e.to_part))) {
    throw new Error(`parallel-distribution proveNoFalsePositive (shared pretreatment, e.g. softener duplex) FAILED: a central pretreatment stage must never be split as a per-zone branch, got ${JSON.stringify(softenerTopo)}`)
  }

  // (b) proveNoFalsePositive #5 — a genuinely ONCE-THROUGH / single-train archetype (the SAME
  // BESS/CO2-mineralisation-style fixture used by the recirculation-loop proveNoFalsePositive
  // above — every item qty=1, no zone replication anywhere) must stay a pure single-train
  // chain: no node anywhere gets split into zone-numbered branches.
  if (onceThroughTopo.some((e) => /_[12]$/.test(e.from_part) || /_[12]$/.test(e.to_part))) {
    throw new Error(`parallel-distribution proveNoFalsePositive (once-through archetype) FAILED: a single-train archetype must never grow a parallel branch, got ${JSON.stringify(onceThroughTopo)}`)
  }

  // ── TRIM/ADDITIVE-CHEMICAL POINT-OF-USE RELOCATION proveCatch + proveNoFalsePositive
  // (2026-07-08, Sam Green SME review, Rule 2 depth — the real fischer-codema scramble this
  // fix resolves: "Acid Dosing Pump" / "Chemical Dosing Pump" spliced in BEFORE the softener/
  // RO treatment train instead of alongside the fertigation pump they actually dose). ──────
  // proveCatch: a trim/additive-chemical pump CO-LOCATED (same qty) with a delivery-
  // application mover relocates OFF the generic rank-1 slot — it must never sit directly
  // downstream of Feed Pump (the rank-1 position this bug produced); it must sit adjacent to
  // the Fertigation Dosing Pump it doses.
  const trimRelocateCatchTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Acid Dosing Pump', 2), mkQ('Fertigation Dosing Pump', 2), mkQ('Irrigation Pump')] }],
  }])
  if (trimRelocateCatchTopo.some((e) => e.from_part === 'feed_pump' && /^acid_dosing_pump/.test(e.to_part))) {
    throw new Error(`trim-additive relocation proveCatch FAILED: a per-zone acid dosing pump co-located with a delivery mover must NOT sit directly downstream of Feed Pump (the rank-1 scramble position), got ${JSON.stringify(trimRelocateCatchTopo)}`)
  }
  if (!trimRelocateCatchTopo.some((e) => /^acid_dosing_pump/.test(e.from_part) && /^fertigation_dosing_pump/.test(e.to_part))
    && !trimRelocateCatchTopo.some((e) => /^fertigation_dosing_pump/.test(e.from_part) && /^acid_dosing_pump/.test(e.to_part))) {
    throw new Error(`trim-additive relocation proveCatch FAILED: expected the acid dosing pump adjacent to the fertigation dosing pump it doses, got ${JSON.stringify(trimRelocateCatchTopo)}`)
  }
  // proveNoFalsePositive: the SAME trim/additive-chemical pump with NO co-located delivery-
  // application mover anywhere in the design (the "Zone Chemical Dosing Skid" shape, just with
  // an "acid"-vocabulary name instead) is left at its natural rank-1 slot, untouched.
  const trimRelocateNoFPTopo = deriveProcessTopology([{
    sub_modules: [{ words: [mkQ('Feed Pump'), mkQ('Acid Dosing Pump', 2), mkQ('Product Tank')] }],
  }])
  if (!trimRelocateNoFPTopo.some((e) => e.from_part === 'feed_pump' && /^acid_dosing_pump/.test(e.to_part))) {
    throw new Error(`trim-additive relocation proveNoFalsePositive FAILED: with no co-located delivery mover, the acid dosing pump must stay at its natural rank-1 position (feed_pump -> acid_dosing_pump), got ${JSON.stringify(trimRelocateNoFPTopo)}`)
  }

  // eslint-disable-next-line no-console
  console.log(`derive-topology --selftest OK (${topo.length} fluid edges; ${endpoints.size} process nodes; ${sig.length} signal edges to the control hub; electrical/instrument/valve excluded from the fluid spine; flow-demand join: ${nJoined} joined, counter-cases hold; recirculation-loop closure: catch+no-false-positive hold; makeup-sizing invariant: catch+3×no-false-positive hold; filter-on-dirty-stream invariant: catch+3×no-false-positive hold; filter-on-dirty-stream REORDER: catch+3×no-false-positive hold; per-zone recovery-collection EXPANSION: catch+2×no-false-positive hold; PARALLEL-PER-ZONE DISTRIBUTION BRANCHES (rules 1+2): catch+5×no-false-positive hold; TRIM/ADDITIVE-CHEMICAL POINT-OF-USE RELOCATION: catch+no-false-positive hold)`)
}

if (process.argv.includes('--selftest')) _selftest()
