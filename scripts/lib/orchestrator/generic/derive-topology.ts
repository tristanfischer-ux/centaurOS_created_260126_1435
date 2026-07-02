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
const ROLE_PATTERNS: Array<[RegExp, number]> = [
  [/fertigation|irrigation|hand.?watering|\bwatering\b|sprinkler/i, 9], // delivery-application override (see 1)
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

/**
 * Derive a feed→product process-flow topology from the synthesised principal
 * equipment in `modules`. Returns [] when there is no process equipment to chain
 * (caller keeps any existing/empty topology).
 */
export function deriveProcessTopology(modules: AnyModule[]): TopologyEdge[] {
  // Collect distinct principal PROCESS equipment (physics-synthesised, fluid-side).
  const seen = new Set<string>()
  const items: Array<{ name: string; slug: string; rank: number; sub: number }> = []
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
        items.push({ name, slug, rank: roleRank(name), sub: subRole(name) })
      }
    }
  }
  if (items.length < 2) return [] // need ≥2 nodes to draw an edge

  // Order along the spine: rank, then ROLE-BASED sub-order within the rank (storage feeds its
  // mover, the mover discharges into the stage's process units — see subRole), then name as
  // the deterministic final tie-break. Alphabetical-within-rank was the v55 direction scramble.
  items.sort((a, b) => a.rank - b.rank || a.sub - b.sub || a.name.localeCompare(b.name))

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
  return edges
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

  // eslint-disable-next-line no-console
  console.log(`derive-topology --selftest OK (${topo.length} fluid edges; ${endpoints.size} process nodes; ${sig.length} signal edges to the control hub; electrical/instrument/valve excluded from the fluid spine; flow-demand join: ${nJoined} joined, counter-cases hold)`)
}

if (process.argv.includes('--selftest')) _selftest()
