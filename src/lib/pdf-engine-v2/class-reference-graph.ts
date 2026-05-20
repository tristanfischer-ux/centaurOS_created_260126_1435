/**
 * @file class-reference-graph.ts — K10 Engineering Reference Graph.
 *
 * @description Typed, executable, permitted-connection graph that backs the
 * G4 grammar gate. Replaces (additively, NOT destructively) the prose priors
 * in `class-connections.ts` with structured fields a validator can execute
 * against at emission time.
 *
 * @rationale 2026-05-18 council unanimously flagged that today's prose
 * priors in `class-connections.ts` ("BMS master communicates with cell rack
 * via CAN bus") are insufficient to validate sub-module emissions. The
 * three architecture seats (GLM, Gemini, Kimi) all called out:
 *   - Typed: structured fields, not free text — so a validator can check
 *     compatibility at emission time (voltage match, protocol match,
 *     pressure rating, etc).
 *   - Executable: queryable as a graph, not just enumerated — so traversal-
 *     based validations work (e.g. "is there a control path from EMS to
 *     every contactor?").
 *   - Complete enough to validate: signal/power/mechanical compatibility,
 *     not just topology.
 *
 * @relationship-to-existing
 *   - `class-connections.ts` keeps its prose `RequiredConnection[]` form —
 *     consumed by `G4` today. K10 is ADDITIVE.
 *   - `stages/class-module-priors.ts` lists which UniversalModules apply
 *     to a class. K10 maps each pair of modules (or sub-module classes)
 *     to a TYPED edge.
 *   - `types/module-decomposition.ts` defines the 26-entry GrammarMechanism
 *     vocabulary. K10's edge `protocol` field is OPEN-ENUM (the closed-set
 *     mechanism stays at the GrammarLink level); K10 covers narrower
 *     industry protocols (CANopen, Modbus-RTU vs Modbus-TCP, IO-Link, etc).
 *
 * @scaffolding-status
 *   - Schema + 20 seeded graphs (BESS, heat pump residential/commercial, VFD,
 *     PV inverter, PV module, industrial robot arm, DC fast EV charger,
 *     insulin pump, fuel cell power module, industrial 3D printer, hydrogen
 *     electrolyser, wind turbine small, AUV subsea, vehicle battery pack,
 *     bioreactor, industrial inspection drone, AGV/AMR, chiller,
 *     distribution transformer — last five added 2026-05-18 in the "B2:
 *     15 → 20 coverage" dispatch).
 *   - Validator function `validateConnectionsAgainstGraph` callable from
 *     test harness `scripts/test-reference-graph.tsx`.
 *   - G4 shadow-mode wire-up shipped 2026-05-18; 20-class coverage clears
 *     the full ~20-class target footprint.
 *
 * @author Tristan Fischer 2026-05-18 (K10 build, dispatched after council
 *     recommendations 5/6/7)
 */

import type { GrammarMechanism, UniversalModule } from './types/module-decomposition.js'

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Industry-standard communication protocol identifiers used at the EDGE
 * level. Open-enum: a `string` fallback is permitted so new protocols can be
 * added without a schema rev, but prefer the canonical vocabulary.
 *
 * Distinct from `GrammarMechanism.can_bus` etc., which is the COARSE
 * mechanism class (used at the GrammarLink/CrossModuleGrammarLink level).
 * K10's `protocol` field is the SPECIFIC wire protocol (e.g. CANopen vs raw
 * CAN, Modbus-RTU vs Modbus-TCP).
 */
export type ConnectionProtocol =
  // Field bus / industrial control
  | 'CAN'                  // raw CAN 2.0 (J1939 / OBD-II / battery comms)
  | 'CANopen'              // CiA 301 application layer over CAN
  | 'Modbus-RTU'           // RS-485 serial Modbus
  | 'Modbus-TCP'           // Ethernet Modbus
  | 'EtherCAT'             // real-time industrial Ethernet
  | 'EtherNet/IP'          // ODVA industrial Ethernet
  | 'PROFINET'             // Siemens industrial Ethernet
  | 'PROFIBUS-DP'          // Siemens RS-485 field bus
  | 'IO-Link'              // sensor/actuator point-to-point (IEC 61131-9)
  | 'RS-485'               // raw RS-485 serial (no Modbus framing)
  | 'RS-232'               // raw RS-232 serial
  // Embedded buses
  | 'I2C'                  // chip-to-chip
  | 'SPI'                  // chip-to-chip
  | 'OneWire'              // Dallas 1-Wire (DS18B20, etc.)
  | 'UART'                 // raw async serial
  // Signal types
  | 'Analog-0-10V'         // industrial analog
  | 'Analog-4-20mA'        // industrial current loop
  | 'Analog-thermistor'    // NTC/PTC two-wire
  | 'Digital-24V'          // industrial digital I/O
  | 'Digital-5V'           // TTL digital
  | 'PWM'                  // pulse-width modulated command
  | 'PT100'                // 4-wire RTD
  // Wireless / IP
  | 'BLE'                  // Bluetooth Low Energy
  | 'WiFi'                 // 802.11
  | 'LoRa'                 // long-range low-power
  | 'Cellular-LTE'         // 4G/LTE
  // Power-carrying (control protocol layered on)
  | 'CCS-PLC'              // Combined Charging System PLC over HomePlug GreenPHY
  | 'CHAdeMO-CAN'          // CHAdeMO CAN dialect
  // Non-protocol — physical only
  | 'physical'             // mechanical / pneumatic / hydraulic — no wire protocol
  | string                 // open-enum: domain-specific protocols not yet canonicalised

/**
 * Role of a node in the product class graph. Helps a traversal validator
 * distinguish "is the principal energy module connected to all required
 * subsystems?" from "did each sensor find its actuator?".
 */
export type NodeRole =
  | 'principal'            // the dominant energy / function module (e.g. cell pack in BESS)
  | 'subsystem'            // major subsystem (PCS, HVAC, BMS)
  | 'sensor'               // measurement node
  | 'actuator'             // command-receiving node
  | 'communications'       // pure comms (gateway, modem)
  | 'enclosure'            // mechanical container
  | 'safety'               // safety-rated chain
  | 'service'              // maintenance / port-access node

/**
 * Electrical compatibility envelope for an edge. All fields optional —
 * populate what the corpus or datasheet specifies.
 */
export interface ElectricalEnvelope {
  /** Nominal operating voltage (V). */
  voltage_nominal_v?: number
  /** Voltage operating range (V). Tuple [min, max]. */
  voltage_range_v?: [number, number]
  /** Continuous current rating (A). */
  current_max_a?: number
  /** Continuous power rating (W). */
  power_max_w?: number
  /** AC or DC. Use 'DC' for batteries, 'AC' for grid-tie, 'either' for power-electronics modules. */
  ac_or_dc?: 'AC' | 'DC' | 'either'
  /** Phase count for AC (1 or 3). */
  ac_phases?: 1 | 3
  /** Frequency (Hz) for AC. */
  ac_frequency_hz?: number
}

/**
 * Mechanical interface envelope for an edge.
 */
export interface MechanicalEnvelope {
  /** Mounting style. */
  mount?: 'panel' | 'din-rail' | 'bracket' | 'in-line' | 'cabled' | 'bolted' | 'welded' | 'standoff'
  /** Cable type (e.g. "shielded twisted pair", "single-pair Ethernet"). */
  cable_type?: string
  /** Connector family (e.g. "M12-A-coded", "USB-C", "Phoenix MSTB"). */
  connector?: string
  /** Approximate run length (m). */
  run_length_m?: number
}

/**
 * Fluid path envelope for an edge (refrigerant, water-glycol, oil, gas).
 */
export interface FluidEnvelope {
  /** Maximum operating pressure (bar). */
  pressure_max_bar?: number
  /** Maximum flow rate (litres per minute). */
  flow_max_lpm?: number
  /** Maximum medium temperature (°C). */
  temperature_max_c?: number
  /** Minimum medium temperature (°C). */
  temperature_min_c?: number
  /** Working medium. */
  medium?: 'water-glycol' | 'oil' | 'air' | 'gas' | 'process-fluid' | 'refrigerant-R290' | 'refrigerant-R32' | 'refrigerant-R410A' | 'refrigerant-R134a' | 'refrigerant-R1233zd' | 'refrigerant-CO2' | string
  /** Pipe nominal size (DN, mm). */
  pipe_dn_mm?: number
}

/**
 * A single permitted (or required) connection between two classes (modules
 * or sub-module classes) in a product class graph.
 *
 * Edges are DIRECTED in storage (from_class → to_class). The validator
 * treats them as bidirectional unless the underlying mechanism is inherently
 * unidirectional (e.g. PWM command from controller to driver).
 */
export interface ConnectionEdge {
  /** Source class (UniversalModule key or sub-module class identifier). */
  from_class: UniversalModule | string
  /** Target class. */
  to_class: UniversalModule | string
  /** Specific wire protocol (open-enum). */
  protocol?: ConnectionProtocol
  /**
   * Coarse mechanism — overlaps with the closed-set `GrammarMechanism`
   * vocabulary used by `class-connections.ts` and the GrammarLink validator.
   * Storing it here lets a single graph edge satisfy BOTH the prose-prior
   * checker and the typed validator.
   */
  mechanism?: GrammarMechanism
  /** Electrical envelope (if applicable). */
  electrical?: ElectricalEnvelope
  /** Mechanical envelope (if applicable). */
  mechanical?: MechanicalEnvelope
  /** Fluid envelope (if applicable). */
  fluid?: FluidEnvelope
  /** Is this connection mandatory for the class system to function? */
  required: boolean
  /** Direction. 'mutual' = bidirectional, 'directional' = one-way. */
  direction?: 'mutual' | 'directional'
  /** Free-form qualifier (short — keep under 200 chars). */
  notes?: string
  /**
   * Provenance — datasheet / standard / corpus references that ground this
   * edge. One of:
   *   - 'corpus:<spec_key>@<product_class>' — value derived from
   *     `pretraining_extracted_specs` at ~/.forge-truth/forge-truth.db
   *   - 'standard:<standard_name>' — e.g. 'standard:UL 9540A'
   *   - 'datasheet:<vendor>:<product>' — e.g. 'datasheet:tesla:megapack-2xl'
   *   - 'llm:<model>:<date>' — value from typed LLM extraction
   *   - 'industry:<source>' — well-established industry convention
   */
  source_references?: string[]
}

/**
 * A node in the product class graph.
 */
export interface GraphNode {
  /** Class identifier — UniversalModule key or sub-module class. */
  class: UniversalModule | string
  /** Role in the system. */
  role: NodeRole
  /** Is this node mandatory for the class system to function? */
  required: boolean
  /** Short human-readable label (for diagnostic output). */
  display?: string
}

/**
 * Full typed graph for a single product class.
 */
export interface ProductClassGraph {
  /** Product class slug (matches `class-priors.ts` keys). */
  product_class: string
  /** Human-readable display name. */
  display_name: string
  /** Nodes (modules / sub-module classes). */
  nodes: GraphNode[]
  /** Edges (connections). */
  edges: ConnectionEdge[]
  /** Sources cited across the whole graph (deduped, for renderer attribution). */
  sources_cited?: string[]
  /** Free-form notes about scope / what's intentionally OUT-of-scope. */
  scope_notes?: string
}

// ---------------------------------------------------------------------------
// Validator — scaffolding for G4 hookup. NOT wired into the live pipeline.
// ---------------------------------------------------------------------------

/**
 * Coarse mechanism (closed-set GrammarMechanism) → narrow protocol (open-enum
 * ConnectionProtocol) compatibility map. Used both for:
 *   1. Edge MATCHING when an emitted mechanism doesn't equal the graph
 *      mechanism but the emitted mechanism is a known coarse-grain stand-in
 *      for the graph edge's protocol (e.g. emitted mechanism=modbus_tcp
 *      matches a graph edge whose protocol=RS-485 / mechanism=hmi_data,
 *      because Modbus often runs on the RS-485 physical layer).
 *   2. Protocol-mismatch DIAGNOSTICS — flagging mechanism/protocol pairs
 *      that genuinely disagree (e.g. emitted modbus_tcp vs graph CANopen).
 *
 * Entries 2026-05-18: modbus_tcp + can_bus map directly into their narrow
 * protocol siblings. modbus_tcp ALSO maps to RS-485 / Modbus-RTU because in
 * practice Modbus-TCP and Modbus-RTU share the application layer and many
 * datasheets quote "Modbus" without distinguishing the physical layer.
 */
const COARSE_MECH_TO_NARROW_PROTO: Record<string, string[]> = {
  can_bus:    ['CAN', 'CANopen'],
  modbus_tcp: ['Modbus-TCP', 'PROFINET', 'EtherNet/IP', 'RS-485', 'Modbus-RTU'],
  modbus_rtu: ['Modbus-RTU', 'RS-485'],
  i2c_bus:    ['I2C'],
  spi_bus:    ['SPI'],
  hmi_data:   ['RS-485', 'Modbus-RTU', 'Modbus-TCP'],
}

/**
 * The shape of an emitted cross-module connection that we validate against
 * the graph. Matches `CrossModuleGrammarLink` from the type system but
 * widened so the validator can be called on raw JSON state.
 */
export interface EmittedConnection {
  from_module: string
  to_module: string
  mechanism?: string
  protocol?: string
  detail?: string
}

export interface GraphValidationResult {
  /** Edges in `emitted` that match a graph edge. */
  matched: Array<{
    emitted: EmittedConnection
    graph_edge: ConnectionEdge
    direction: 'forward' | 'reverse'
  }>
  /** Required graph edges that have NO corresponding emitted connection (FAIL). */
  missing_required: ConnectionEdge[]
  /** Emitted connections that don't match any graph edge (potentially OK — flag for review). */
  extra: EmittedConnection[]
  /**
   * Edges that matched topologically but where the protocol/mechanism didn't
   * fit the graph's expected vocabulary. Diagnostic only — not a hard fail
   * (the LLM may have used a valid synonym).
   */
  protocol_mismatch: Array<{
    emitted: EmittedConnection
    graph_edge: ConnectionEdge
    reason: string
  }>
  /** Summary counters. */
  summary: {
    emitted_count: number
    graph_node_count: number
    graph_edge_count: number
    graph_required_edge_count: number
    matched_count: number
    missing_required_count: number
    extra_count: number
  }
}

/**
 * Validate a set of emitted cross-module connections against a product
 * class graph. Returns a structured diagnostic — does NOT throw, does NOT
 * block. Callers decide whether `missing_required.length > 0` is a hard
 * fail or a council-warning.
 *
 * Treats edges as BIDIRECTIONAL for matching purposes — an emitted
 * connection {A → B} matches a graph edge {B → A} unless the graph edge is
 * explicitly tagged `direction: 'directional'`.
 *
 * @param emitted - The cross-module connections from a Stage 1.7 emission.
 * @param graph - The product class reference graph.
 */
export function validateConnectionsAgainstGraph(
  emitted: EmittedConnection[],
  graph: ProductClassGraph,
): GraphValidationResult {
  const matched: GraphValidationResult['matched'] = []
  const protocolMismatch: GraphValidationResult['protocol_mismatch'] = []
  const matchedGraphEdgeIndexes = new Set<number>()
  const unmatchedEmitted: EmittedConnection[] = []

  for (const e of emitted) {
    // Prefer an unmatched graph edge whose mechanism matches the emitted one,
    // so that distinct parallel edges (e.g. refrigerant_line + fluid_routing
    // between the same two modules) match the corresponding emitted line.
    // Fall back to the first endpoint-matching edge whether or not it's been
    // matched before.
    let foundIndex = -1
    let foundDirection: 'forward' | 'reverse' = 'forward'
    let fallbackIndex = -1
    let fallbackDirection: 'forward' | 'reverse' = 'forward'
    for (let i = 0; i < graph.edges.length; i += 1) {
      const g = graph.edges[i]
      const forward = g.from_class === e.from_module && g.to_class === e.to_module
      const reverse =
        g.from_class === e.to_module &&
        g.to_class === e.from_module &&
        (g.direction ?? 'mutual') === 'mutual'
      if (!forward && !reverse) continue
      const dir: 'forward' | 'reverse' = forward ? 'forward' : 'reverse'
      const mechanismHit = !!e.mechanism && g.mechanism === e.mechanism
      if (mechanismHit && !matchedGraphEdgeIndexes.has(i)) {
        foundIndex = i
        foundDirection = dir
        break
      }
      if (fallbackIndex === -1) {
        fallbackIndex = i
        fallbackDirection = dir
      }
    }
    if (foundIndex === -1) {
      foundIndex = fallbackIndex
      foundDirection = fallbackDirection
    }
    if (foundIndex === -1) {
      unmatchedEmitted.push(e)
      continue
    }
    const graphEdge = graph.edges[foundIndex]
    matchedGraphEdgeIndexes.add(foundIndex)
    matched.push({ emitted: e, graph_edge: graphEdge, direction: foundDirection })

    // Protocol / mechanism cross-check (diagnostic only).
    // Compare like-with-like: mechanism↔mechanism, then protocol↔protocol.
    // The graph carries BOTH a coarse `mechanism` (closed-set GrammarMechanism)
    // and a narrow `protocol` (open-enum ConnectionProtocol). Emitted state
    // today only carries `mechanism`. We flag only when the comparable pair
    // genuinely disagrees.
    const emittedMech = e.mechanism
    const emittedProto = e.protocol
    const graphMech = graphEdge.mechanism
    const graphProto = graphEdge.protocol

    // Mechanism vs mechanism — true closed-set comparison.
    if (emittedMech && graphMech && emittedMech !== graphMech) {
      protocolMismatch.push({
        emitted: e,
        graph_edge: graphEdge,
        reason: `mechanism: emitted=${emittedMech} graph=${graphMech}`,
      })
    }
    // Protocol vs protocol — only when both sides carry one.
    else if (emittedProto && graphProto && emittedProto !== graphProto && graphProto !== 'physical') {
      // Coarse mechanism → narrow protocol compatibility (so emitted
      // mechanism=can_bus is compatible with graph protocol=CANopen).
      // Module-scoped map at COARSE_MECH_TO_NARROW_PROTO above; consulted
      // by both the diagnostic flag here AND any future matching extension.
      const compat = emittedMech ? COARSE_MECH_TO_NARROW_PROTO[emittedMech] : undefined
      const isCompat = compat ? compat.includes(graphProto) : false
      if (!isCompat) {
        protocolMismatch.push({
          emitted: e,
          graph_edge: graphEdge,
          reason: `protocol: emitted=${emittedProto} graph=${graphProto}`,
        })
      }
    }
  }

  const missingRequired: ConnectionEdge[] = []
  for (let i = 0; i < graph.edges.length; i += 1) {
    if (graph.edges[i].required && !matchedGraphEdgeIndexes.has(i)) {
      missingRequired.push(graph.edges[i])
    }
  }

  const graphRequiredCount = graph.edges.filter(e => e.required).length

  return {
    matched,
    missing_required: missingRequired,
    extra: unmatchedEmitted,
    protocol_mismatch: protocolMismatch,
    summary: {
      emitted_count: emitted.length,
      graph_node_count: graph.nodes.length,
      graph_edge_count: graph.edges.length,
      graph_required_edge_count: graphRequiredCount,
      matched_count: matched.length,
      missing_required_count: missingRequired.length,
      extra_count: unmatchedEmitted.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry of seeded product class graphs. Lookups are by canonical class
 * slug (matches `class-priors.ts` / `class-connections.ts`).
 *
 * Populated lazily — when `getClassReferenceGraph` or
 * `ensureGraphsRegistered` is first called, the per-class files in
 * `./class-reference-graphs/` are dynamically imported, and each one
 * calls `registerClassReferenceGraph` as a side effect.
 *
 * Lazy initialisation avoids the temporal-dead-zone (TDZ) hazard of
 * importing the per-class files at the top of this module: the per-class
 * files import `registerClassReferenceGraph` from here, and a top-of-file
 * side-effect import would run before the `export const` initialisers
 * below complete.
 */
export const CLASS_REFERENCE_GRAPHS: Record<string, ProductClassGraph> = {}

let _registrationsLoaded = false

/**
 * Ensure all known per-class graphs have been registered. Idempotent.
 * Safe to call multiple times. Throws (synchronously, after async resolve)
 * if a per-class file fails to load.
 */
export async function ensureGraphsRegistered(): Promise<void> {
  if (_registrationsLoaded) return
  _registrationsLoaded = true
  // Keep alphabetical for deterministic registration order.
  await import('./class-reference-graphs/automated-guided-vehicle-agv.js')
  await import('./class-reference-graphs/auv-subsea.js')
  await import('./class-reference-graphs/bess-utility-scale.js')
  await import('./class-reference-graphs/bioreactor.js')
  await import('./class-reference-graphs/chiller.js')
  await import('./class-reference-graphs/dc-fast-ev-charger.js')
  await import('./class-reference-graphs/distribution-transformer.js')
  await import('./class-reference-graphs/fuel-cell-power-module.js')
  await import('./class-reference-graphs/heat-pump-commercial.js')
  await import('./class-reference-graphs/heat-pump-residential.js')
  await import('./class-reference-graphs/hydrogen-electrolyser.js')
  await import('./class-reference-graphs/industrial-3d-printer.js')
  await import('./class-reference-graphs/industrial-inspection-drone.js')
  await import('./class-reference-graphs/industrial-robot-arm.js')
  await import('./class-reference-graphs/insulin-pump.js')
  await import('./class-reference-graphs/pv-module-residential.js')
  await import('./class-reference-graphs/pv-string-inverter.js')
  await import('./class-reference-graphs/vehicle-battery-pack.js')
  await import('./class-reference-graphs/vertical-farm.js')
  await import('./class-reference-graphs/vfd-motor-drive.js')
  await import('./class-reference-graphs/wind-turbine-small.js')
}

export function getClassReferenceGraph(productClass: string): ProductClassGraph | null {
  return CLASS_REFERENCE_GRAPHS[productClass] ?? null
}

/**
 * Register a graph in the global registry. Called by the per-class graph
 * files. Throws if the class is already registered (to catch accidental
 * double-registration during bulk imports).
 */
export function registerClassReferenceGraph(graph: ProductClassGraph): void {
  if (CLASS_REFERENCE_GRAPHS[graph.product_class]) {
    throw new Error(
      `K10: class reference graph for "${graph.product_class}" already registered. ` +
        `Check for duplicate imports in src/lib/pdf-engine-v2/class-reference-graphs/.`,
    )
  }
  CLASS_REFERENCE_GRAPHS[graph.product_class] = graph
}
