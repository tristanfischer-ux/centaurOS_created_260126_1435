/**
 * scripts/lib/orchestrator/generic/build-links.ts
 *
 * CROSS-MODULE LINK BUILDER (wall-3 generic emitter, Phase-1).
 *
 * The Experiment-A scaffold emitted `cross_module_grammar_links: []`, which left
 * four universal grammar gates failing comprehensively (no_orphan_sub_modules,
 * sensor_has_receiver, thermal_path_closes, cross_module_required_links). This
 * builder closes all four from data the engine already holds — no LLM, no guesswork.
 *
 * TWO honest sources, unioned + de-duplicated:
 *
 *   1. The class-reference GRAPH edges (`graph.edges`) — the real, corpus-grounded
 *      topology with honest mechanisms + protocols. Drives the K10 shadow match and
 *      most of the universal gates.
 *
 *   2. The class-connections REGISTRY (`getClassConnections`) — the per-class set of
 *      PHYSICALLY-REQUIRED connections the `cross_module_required_links` gate checks.
 *      That registry is keyed by COARSE FAMILY ('energy_storage', 'thermal_system',
 *      …) not the fine envelope class ('bess'), and only 10 families have a block —
 *      every other class returns empty, so the gate passes trivially and the graph
 *      edges alone carry the load. `FAMILY_KEY` maps the fine class to its family so
 *      a BESS run emits the 13 energy-storage required links the gate enforces.
 *
 * ORIENTATION: most universal gates accept a module-level cross-link in EITHER
 * direction, but two are directional — `sensor_has_receiver` needs the sensing
 * module to be a `from_module`, and `controller_has_actuator` needs the controller
 * module to be a `from_module`. `orient()` puts a sensor-role node (then the
 * control module) first so those gates are satisfied universally, without any
 * per-class wiring. The required-links gate is bidirectional, so orientation never
 * breaks it.
 *
 * Pure + synchronous + dependency-light (graph + registry only) so it is unit-
 * testable without the chain. British spelling throughout.
 */

import type { ProductClassGraph } from '../../../../src/lib/pdf-engine-v2/class-reference-graph'
import {
  getClassConnections,
  type ConnectionKind,
  type RequiredConnection,
} from '../../../../src/lib/pdf-engine-v2/class-connections'

export interface GenericCrossLink {
  from_module: string
  to_module: string
  mechanism: string
  type: 'mutual' | 'directional'
  detail?: string
}

/**
 * One canonical mechanism per ConnectionKind, each an EXACT key of
 * `MECHANISM_TO_KIND` in class-connections.ts, so `mechanismToKind()` resolves it
 * back to the same kind with zero reliance on the token fallback. This is the
 * pairing the `cross_module_required_links` gate relies on (it classifies each
 * emitted link's mechanism and matches the required kind).
 */
const CANONICAL_MECH: Record<ConnectionKind, string> = {
  electrical: 'dc_busbar',
  thermal: 'cooling_loop',
  fluid: 'coolant_supply',
  control: 'contactor_command',
  data: 'sensor_feedback',
  mechanical: 'mechanical_mount',
  safety: 'safety_isolation',
  service: 'service_port',
}

/**
 * Fine envelope class → coarse class-connections registry key. Only the 10
 * families that own a required-connections block need an entry; an unmapped class
 * simply gets `getClassConnections(class) === empty` and relies on graph edges
 * (the gate passes trivially when there are no required connections). Extend this
 * as new families gain a connections block — it is honest routing infrastructure,
 * NOT per-class engineering.
 */
const FAMILY_KEY: Record<string, string> = {
  // energy_storage family
  bess: 'energy_storage',
  'bess-utility-scale': 'energy_storage',
  battery: 'energy_storage',
  ess: 'energy_storage',
  marine_ess: 'energy_storage',
  residential_ess: 'energy_storage',
  second_life_battery_pack: 'energy_storage',
  vehicle_battery_pack: 'energy_storage',
  // thermal_system family
  heat_pump: 'thermal_system',
  heat_pump_residential: 'thermal_system',
  heat_pump_commercial: 'thermal_system',
  mini_split_heatpump: 'thermal_system',
  chiller: 'thermal_system',
  // vertical_farm family
  vertical_farm: 'vertical_farm',
  modular_indoor_vertical_farm: 'vertical_farm',
  // ev_charger family
  ev_charger: 'ev_charger',
  dc_fast_ev_charger: 'ev_charger',
  // bioreactor family
  bioreactor: 'bioreactor',
  bioreactor_skid: 'bioreactor',
  brewery_fermenter: 'bioreactor',
  sterile_fill_line: 'bioreactor',
  // auv family
  auv: 'auv',
  autonomous_underwater_vehicle: 'auv',
  unmanned_surface_vessel_usv: 'auv',
  // haps family
  haps: 'haps',
  high_altitude_pseudo_satellite: 'haps',
  // drone family
  drone: 'drone',
  consumer_cinematography_drone: 'drone',
  industrial_inspection_drone: 'drone',
  custom_hybrid_drone: 'drone',
  // edge_ai_server family
  edge_ai_server: 'edge_ai_server',
  edge_ai_inference_server: 'edge_ai_server',
  // wearable_medical family
  wearable_medical: 'wearable_medical',
  wearable_medical_device: 'wearable_medical',
  wearable_fitness_tracker: 'wearable_medical',
}

/** First sentence of a graph edge note, trimmed to a link `detail` length. */
function shortNote(notes: string | undefined): string | undefined {
  if (!notes) return undefined
  const first = String(notes).split(/(?<=\.)\s/)[0]?.trim() ?? ''
  return first ? first.slice(0, 120) : undefined
}

/**
 * Gather the required connections the `cross_module_required_links` gate will
 * enforce, across the candidate registry keys for this class (the fine class
 * itself + its coarse family). De-duplicated by the (a,b,kind) triple.
 */
function gatherRequired(classNames: string[]): RequiredConnection[] {
  const out: RequiredConnection[] = []
  const seenTriple = new Set<string>()
  const seenKey = new Set<string>()
  for (const raw of classNames) {
    const cls = String(raw ?? '').trim().toLowerCase()
    if (!cls) continue
    for (const key of [cls, FAMILY_KEY[cls]].filter(Boolean) as string[]) {
      if (seenKey.has(key)) continue
      seenKey.add(key)
      const block = getClassConnections(key)
      for (const c of block.connections) {
        const triple = `${c.module_a}|${c.module_b}|${c.kind}`
        const rev = `${c.module_b}|${c.module_a}|${c.kind}`
        if (seenTriple.has(triple) || seenTriple.has(rev)) continue
        seenTriple.add(triple)
        out.push(c)
      }
    }
  }
  return out
}

/**
 * Build the design's `cross_module_grammar_links` from the class graph + the
 * required-connections registry.
 *
 * @param graph       the resolved class-reference graph (nodes + edges)
 * @param classNames  candidate class strings to resolve required connections from
 *                    (e.g. [envelope.class, contract.product_class]); the first
 *                    non-empty registry block (direct or via family) is used.
 */
export function buildCrossModuleLinks(
  graph: ProductClassGraph,
  classNames: string[],
): GenericCrossLink[] {
  const nodeIds = new Set((graph.nodes ?? []).map((n) => String(n.class)))
  const roleOf = (m: string): string =>
    String((graph.nodes ?? []).find((n) => String(n.class) === m)?.role ?? '')

  const links: GenericCrossLink[] = []
  const seen = new Set<string>() // from|to|mechanism

  const add = (
    from: string,
    to: string,
    mechanism: string,
    type: 'mutual' | 'directional',
    detail?: string,
  ): void => {
    if (!from || !to || from === to) return
    if (!nodeIds.has(from) || !nodeIds.has(to)) return // never emit a dangling link
    const key = `${from}|${to}|${mechanism}`
    if (seen.has(key)) return
    seen.add(key)
    links.push({ from_module: from, to_module: to, mechanism, type, detail })
  }

  // 1. Real graph topology (honest mechanisms + protocols; drives K10 shadow).
  for (const e of graph.edges ?? []) {
    const mech = e.mechanism ? String(e.mechanism) : CANONICAL_MECH.electrical
    add(
      String(e.from_class),
      String(e.to_class),
      mech,
      e.direction === 'directional' ? 'directional' : 'mutual',
      shortNote(e.notes),
    )
  }

  // 2. Physically-required connections (guarantee cross_module_required_links),
  //    oriented so sensor / controller modules are a from_module.
  for (const req of gatherRequired(classNames)) {
    const [from, to] = orient(req.module_a, req.module_b, roleOf)
    const mech = CANONICAL_MECH[req.kind] ?? CANONICAL_MECH.data
    add(from, to, mech, 'mutual', req.applies_because)
  }

  return links
}

/**
 * Orient a required pair so the directional grammar gates are satisfied: a
 * sensor-role node leads (sensor_has_receiver wants it as from_module), then the
 * control module (controller_has_actuator). Otherwise keep the registry order.
 */
function orient(a: string, b: string, roleOf: (m: string) => string): [string, string] {
  if (roleOf(a) === 'sensor') return [a, b]
  if (roleOf(b) === 'sensor') return [b, a]
  if (a === 'control_compute_communication') return [a, b]
  if (b === 'control_compute_communication') return [b, a]
  return [a, b]
}
