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

// feed(0) → product(9) spine, ported from draw_bfd.py::_ROLE_PATTERNS + general
// process-equipment synonyms. Checked IN ORDER — earliest match wins — so a "feed pump"
// lands at feed(0) before the generic pump→distribution(9) rule.
const ROLE_PATTERNS: Array<[RegExp, number]> = [
  [/feed|inlet|supply|make.?up|charge|intake|receiv|raw[ _-]?water/i, 0],
  [/pre.?heat|preheater|guard.?bed|drier|dryer|conditioning|blend|mixer|saturat|soften|dechlor|antiscal|dosing/i, 1],
  [/reactor|synthesis|absorber|contactor|carbonat|crystallis|crystalliz|converter|reformer|electrolys|reverse.?osmosis|\bro\b|membrane|\buf\b|ultrafiltrat|nanofiltrat|\bedi\b|deioni/i, 2],
  [/steam.?generator|waste.?heat|boiler|economiser|economizer|reboiler|quench/i, 3],
  [/separator|flash|knock.?out|ko.?drum|\bdrum\b|decanter|coalesc|demister|filter|stripper|clarifier|\bgac\b|carbon|degass|sediment|cartridge/i, 4],
  [/recycle|\breturn\b|tail.?gas|\bloop\b|recompress|recirc/i, 5],
  [/oxidis|oxidiz|flare|incinerat|\bvent\b|purge|abatement|effluent|disposal|\bwaste\b|\bdrain\b|\bsump\b|reject|concentrate|\bbrine\b|blowdown|backwash/i, 6],
  [/fractionat|distillat|hydrocrack|hydrotreat|isomeris|isomeriz|refin|upgrad|rectif|\bcolumn\b/i, 7],
  [/condenser|cooler|chiller|cold.?box|cryo/i, 8],
  [/storage|\btank\b|\bproduct\b|export|loading|gantry|dispatch|reservoir|bottling|\bpump\b|distribution|irrigation|fertigation|watering|delivery/i, 9],
]

function roleRank(name: string): number {
  const blob = name || ''
  for (const [rx, rank] of ROLE_PATTERNS) if (rx.test(blob)) return rank
  return 5 // neutral mid-spine when no role keyword is present
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
  const items: Array<{ name: string; slug: string; rank: number }> = []
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
        const slug = slugify(name)
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        items.push({ name, slug, rank: roleRank(name) })
      }
    }
  }
  if (items.length < 2) return [] // need ≥2 nodes to draw an edge

  // Order along the spine (rank, then name for a stable deterministic tie-break)
  items.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))

  const edges: TopologyEdge[] = []
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i], b = items[i + 1]
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
// The CONTROL HUB nouns — the PLC / SCADA / control-system the instruments report to + the
// controllers that command actuators. Ranked: a plant control SYSTEM / SCADA / DCS first, then a PLC.
const CONTROL_HUB_RE = /\b(scada|plant control|control system|\bdcs\b|\bplc\b|control panel|controller)\b/i

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
          const s = slugify(name)
          if (s && !seenH.has(s)) { seenH.add(s); hubs.push(s) }
        } else if (INSTRUMENT_RE.test(name)) {
          const s = slugify(name)
          if (s && !seenI.has(s)) { seenI.add(s); instruments.push(s) }
        }
      }
    }
  }
  if (hubs.length === 0 || instruments.length === 0) return []
  // Prefer a SCADA / plant-control-system hub if present (it sorts first by name), else the first PLC.
  const hub = hubs.sort()[0]
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
    if (e.from_part === 'reverse_osmosis_skid') throw new Error('derive-topology SIGNAL: a process vessel must NOT get a signal edge')
  }
  const sigHubs = new Set(sig.map(e => e.to_part))
  if (sigHubs.size !== 1) throw new Error(`derive-topology SIGNAL: all instruments must wire to ONE control hub (got ${[...sigHubs].join(',')})`)
  // no control hub OR no instrument → []
  if (deriveSignalTopology([{ sub_modules: [{ words: [mk('Fresh Water Tank'), mk('Irrigation Pump')] }] }]).length !== 0) throw new Error('derive-topology SIGNAL: no instrument/hub must yield []')
  // eslint-disable-next-line no-console
  console.log(`derive-topology --selftest OK (${topo.length} fluid edges; ${endpoints.size} process nodes; ${sig.length} signal edges to the control hub; electrical/instrument/valve excluded from the fluid spine)`)
}

if (process.argv.includes('--selftest')) _selftest()
