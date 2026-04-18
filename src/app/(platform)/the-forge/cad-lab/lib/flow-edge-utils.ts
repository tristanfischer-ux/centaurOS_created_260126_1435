/**
 * @file flow-edge-utils.ts — Shared edge-building logic for module flow visualisations.
 *
 * @description Pure-logic module (no React) that classifies signal types and builds
 * edges from either keyword overlap or interface contracts. Used by both the static
 * ProcessFlowDiagram and the interactive ModuleFlowCanvas.
 *
 * FLOW: process-flow-diagram.tsx + module-flow-canvas.tsx → import from here
 */

import type { CadLabModule, InterfaceContract, ModuleConnection } from "@/lib/cad-lab-types"
import { hasKeywordOverlap } from "@/lib/cad-lab/keyword-matching"

/* ─── Types ────────────────────────────────────────────────────────────── */

export type SignalType = "power" | "data" | "mechanical" | "thermal" | "other"

export interface FlowNode {
  id: string
  name: string
  inputs: string[]
  outputs: string[]
}

export interface FlowEdge {
  from: string
  to: string
  /** Output port name on source node (maps to React Flow sourceHandle) */
  sourceHandle?: string
  /** Input port name on target node (maps to React Flow targetHandle) */
  targetHandle?: string
  label?: string
  signalType: SignalType
  incompatible?: boolean
  incompatibilityReason?: string
}

/* ─── Signal type classification ───────────────────────────────────────── */

/** Keywords that classify a connection's signal type. */
export const SIGNAL_KEYWORDS: Record<Exclude<SignalType, "other">, string[]> = {
  power: ["voltage", "battery", "current", "watt", "amp", "dc", "charger", "power", "supply", "energy", "fuel", "charge", "discharge"],
  // DECISION: Removed "motor" (belongs in mechanical — "motor torque" misclassified as data),
  // "input"/"output" (too generic — nearly every port label contains these words).
  data: ["signal", "data", "control", "sensor", "telemetry", "pwm", "serial", "usb", "uart", "command", "feedback", "communication", "protocol", "digital", "analog", "throttle", "pilot"],
  mechanical: ["force", "torque", "mount", "structural", "load", "bracket", "axle", "frame", "chassis", "gear", "shaft", "bearing", "mechanical", "assembly", "deploy", "deployment", "propulsion", "thrust", "lift", "arm", "capability"],
  thermal: ["heat", "thermal", "cooling", "temperature", "dissipation", "fan", "heatsink", "ventilation"],
}

/**
 * Display config per signal type. All Tailwind classes are spelled out in full
 * so the JIT compiler picks them up (no dynamic string interpolation).
 *
 * `strokeHsl` maps to CSS custom properties for React Flow edge styling.
 */
export const SIGNAL_CONFIG: Record<SignalType, {
  label: string
  description: string
  dot: string
  text: string
  activeBorder: string
  activeBg: string
  strokeHsl: string
}> = {
  power:      { label: "Power",      description: "Electrical supply, battery, voltage distribution",       dot: "bg-chart-1",  text: "text-chart-1",  activeBorder: "border-chart-1/50",  activeBg: "bg-chart-1/10",  strokeHsl: "hsl(14, 100%, 50%)" },
  data:       { label: "Data",       description: "Signals, sensors, telemetry, digital communication",     dot: "bg-chart-2",  text: "text-chart-2",  activeBorder: "border-chart-2/50",  activeBg: "bg-chart-2/10",  strokeHsl: "hsl(217, 91%, 60%)" },
  mechanical: { label: "Mechanical", description: "Structural loads, torque, mounting, assemblies",          dot: "bg-chart-3",  text: "text-chart-3",  activeBorder: "border-chart-3/50",  activeBg: "bg-chart-3/10",  strokeHsl: "hsl(160, 84%, 39%)" },
  thermal:    { label: "Thermal",    description: "Heat dissipation, cooling, temperature management",       dot: "bg-chart-4",  text: "text-chart-4",  activeBorder: "border-chart-4/50",  activeBg: "bg-chart-4/10",  strokeHsl: "hsl(38, 92%, 50%)" },
  other:      { label: "Other",      description: "Unclassified or mixed-type connections",                  dot: "bg-chart-5",  text: "text-chart-5",  activeBorder: "border-chart-5/50",  activeBg: "bg-chart-5/10",  strokeHsl: "hsl(258, 90%, 66%)" },
}

/** Classify a connection label into a signal type by keyword matching. */
export function classifySignalType(label: string): SignalType {
  const lower = label.toLowerCase()
  for (const [type, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return type as SignalType
  }
  return "other"
}

/* ─── Edge building (keyword overlap) ──────────────────────────────────── */

/**
 * Builds edges by matching outputs of one module to inputs of another
 * using keyword overlap (2+ shared significant words). Each edge is also
 * classified by signal type.
 */
export function buildEdges(modules: CadLabModule[]): FlowEdge[] {
  const edges: FlowEdge[] = []
  for (const source of modules) {
    for (const output of source.outputs) {
      for (const target of modules) {
        if (target.id === source.id) continue
        for (const input of target.inputs) {
          if (hasKeywordOverlap(output, input)) {
            const isDuplicate = edges.some(
              (e) => e.from === source.id && e.to === target.id && e.label === output,
            )
            if (!isDuplicate) {
              edges.push({
                from: source.id,
                to: target.id,
                sourceHandle: output,
                targetHandle: input,
                label: output,
                signalType: classifySignalType(output),
              })
            }
          }
        }
      }
    }
  }
  return edges
}

/* ─── Edge building (from interface contracts) ─────────────────────── */

/** Maps InterfacePortType → SignalType for display config. */
export function portTypeToSignalType(portType: string): SignalType {
  if (portType === "power" || portType === "data" || portType === "mechanical" || portType === "thermal") {
    return portType as SignalType
  }
  return "other"
}

/**
 * Resolve a contract port name to the actual module port name.
 *
 * INTENT: Claude's interface extraction may rephrase port names (e.g.
 * "Motor Power Supply" vs the module's "Motor Power Supply 12V"). React Flow
 * silently drops edges when handle IDs don't match. This snaps contract names
 * to the real port names via exact match first, then keyword overlap fallback.
 */
function resolvePortName(contractPort: string, actualPorts: string[]): string | null {
  // Tier 1: Exact match — fast path
  if (actualPorts.includes(contractPort)) return contractPort

  // Tier 2: Keyword overlap (2+ shared significant words)
  for (const port of actualPorts) {
    if (hasKeywordOverlap(contractPort, port)) return port
  }

  // Tier 3: Substring containment — one label contains the other (case-insensitive).
  // Catches "Motor Power Supply" matching "Motor Power Supply 12V" when keyword overlap fails.
  const contractLower = contractPort.toLowerCase()
  for (const port of actualPorts) {
    const portLower = port.toLowerCase()
    if (portLower.includes(contractLower) || contractLower.includes(portLower)) return port
  }

  return null
}

/**
 * Builds edges from extracted interface contracts instead of keyword overlap.
 * Each contract becomes an edge with compatibility status preserved.
 *
 * DECISION: Accepts modules to fuzzy-match contract port names against actual
 * module port names. Without this, rephrased port names from Claude's extraction
 * cause React Flow to silently drop arrows (handle ID mismatch).
 */
export function buildEdgesFromContracts(contracts: InterfaceContract[], modules: CadLabModule[]): FlowEdge[] {
  // Build port lookup: moduleId → { inputs, outputs }
  const portLookup = new Map<string, { inputs: string[]; outputs: string[] }>()
  for (const m of modules) {
    portLookup.set(m.id, { inputs: m.inputs, outputs: m.outputs })
  }

  const edges: FlowEdge[] = []
  for (const contract of contracts) {
    // INTENT: "external" contracts exist for validation bookkeeping only —
    // they represent ports that interface with the environment, not another module node.
    if (contract.sourceModuleId === "external" || contract.targetModuleId === "external") continue

    const sourcePorts = portLookup.get(contract.sourceModuleId)
    const targetPorts = portLookup.get(contract.targetModuleId)

    // Resolve port names to actual module handles
    const resolvedSource = sourcePorts
      ? resolvePortName(contract.sourcePort, sourcePorts.outputs)
      : null
    const resolvedTarget = targetPorts
      ? resolvePortName(contract.targetPort, targetPorts.inputs)
      : null

    // Skip edge if either port can't be resolved — contract is invalid
    if (!resolvedSource || !resolvedTarget) {
      console.warn("[FLOW] Dropped contract edge: could not resolve port", {
        contract: `${contract.sourceModuleId}.${contract.sourcePort} → ${contract.targetModuleId}.${contract.targetPort}`,
        resolvedSource,
        resolvedTarget,
      })
      continue
    }

    const isDuplicate = edges.some(
      (e) => e.from === contract.sourceModuleId && e.to === contract.targetModuleId && e.label === resolvedSource,
    )
    if (!isDuplicate) {
      edges.push({
        from: contract.sourceModuleId,
        to: contract.targetModuleId,
        sourceHandle: resolvedSource,
        targetHandle: resolvedTarget,
        label: resolvedSource,
        signalType: portTypeToSignalType(contract.portType),
        incompatible: contract.compatible === false,
        incompatibilityReason: contract.incompatibilityReason,
      })
    }
  }
  return edges
}

/* ─── Hybrid edge building (contracts + keyword gap-fill) ─────────────── */

/**
 * Builds edges using contracts first, then fills gaps with keyword overlap.
 *
 * INTENT: Contract extraction is non-deterministic — Claude may miss ports or
 * rephrase names so `resolvePortName` fails. The either/or strategy left those
 * ports completely disconnected. This hybrid approach gives contracts priority,
 * then uses relaxed keyword overlap for any ports that remain unconnected.
 *
 * DECISION: Gap-fill uses minShared=1 (not 2) because it only runs for already-
 * orphaned ports — the contract pass had first crack.
 *
 * DECISION: Signal-type fallback (Tier 2) removed — it connected any "power" output
 * to any "power" input regardless of specs, causing false positives. Projects with
 * connections data should use buildEdgesFromConnections() instead.
 */
export function buildEdgesHybrid(contracts: InterfaceContract[], modules: CadLabModule[]): FlowEdge[] {
  // Step 1: Start with contract-based edges
  const contractEdges = buildEdgesFromContracts(contracts, modules)

  // Step 2: Track which ports are already connected
  const connectedOutputs = new Set<string>() // "moduleId::portName"
  const connectedInputs = new Set<string>()
  for (const e of contractEdges) {
    if (e.sourceHandle) connectedOutputs.add(`${e.from}::${e.sourceHandle}`)
    if (e.targetHandle) connectedInputs.add(`${e.to}::${e.targetHandle}`)
  }

  // Step 3: Keyword-match unconnected outputs → unconnected inputs
  // DECISION: minShared=1 (relaxed) since these are already orphaned ports
  const gapEdges: FlowEdge[] = []
  for (const source of modules) {
    for (const output of source.outputs) {
      if (connectedOutputs.has(`${source.id}::${output}`)) continue

      for (const target of modules) {
        if (target.id === source.id) continue
        for (const input of target.inputs) {
          if (connectedInputs.has(`${target.id}::${input}`)) continue

          if (hasKeywordOverlap(output, input, 1)) {
            const isDuplicate =
              contractEdges.some((e) => e.from === source.id && e.to === target.id && e.sourceHandle === output && e.targetHandle === input) ||
              gapEdges.some((e) => e.from === source.id && e.to === target.id && e.sourceHandle === output && e.targetHandle === input)

            if (!isDuplicate) {
              gapEdges.push({
                from: source.id,
                to: target.id,
                sourceHandle: output,
                targetHandle: input,
                label: output,
                signalType: classifySignalType(output),
              })
              connectedOutputs.add(`${source.id}::${output}`)
              connectedInputs.add(`${target.id}::${input}`)
            }
          }
        }
      }
    }
  }

  return [...contractEdges, ...gapEdges]
}

/* ─── Edge building (from decomposition connections) ───────────────── */

/**
 * Builds edges from explicit connections declared during decomposition.
 *
 * INTENT: Highest-fidelity edge source — the AI declared these connections at
 * decomposition time when it had full topology knowledge. No fuzzy matching needed;
 * connections reference exact module IDs and port names (already validated server-side).
 */
export function buildEdgesFromConnections(connections: ModuleConnection[], modules: CadLabModule[]): FlowEdge[] {
  const moduleIds = new Set(modules.map(m => m.id))
  const edges: FlowEdge[] = []

  for (const conn of connections) {
    // Skip if module IDs don't exist (shouldn't happen — validated server-side)
    if (!moduleIds.has(conn.from) || !moduleIds.has(conn.to)) continue

    const isDuplicate = edges.some(
      (e) => e.from === conn.from && e.to === conn.to && e.sourceHandle === conn.output && e.targetHandle === conn.input,
    )
    if (!isDuplicate) {
      edges.push({
        from: conn.from,
        to: conn.to,
        sourceHandle: conn.output,
        targetHandle: conn.input,
        label: conn.output,
        signalType: classifySignalType(conn.output),
      })
    }
  }

  return edges
}

/* ─── Unified edge builder ──────────────────────────────────────────── */

/**
 * Single entry point for edge building — picks the best strategy based on
 * available data, gracefully degrading for older projects.
 *
 * Priority: connections (highest fidelity) → contracts (legacy) → keywords (oldest)
 *
 * GOTCHA: Each tier must produce at least one edge to be picked — otherwise
 * fall through to the next. Previous behaviour: a non-empty but fully-stale
 * `connections` array (IDs no longer match the current module set, e.g. after
 * a re-decompose or schema drift) would return `[]` and never reach the
 * contracts tier. Users saw "0 interfaces mapped (contract-validated)" in the
 * header even though contracts + keyword overlap would have produced edges.
 * Reported live on the Mirror Verify project — fix: fall through on empty.
 */
export function buildEdgesUnified(
  modules: CadLabModule[],
  opts: { connections?: ModuleConnection[]; contracts?: InterfaceContract[] },
): FlowEdge[] {
  if (opts.connections && opts.connections.length > 0) {
    const connectionEdges = buildEdgesFromConnections(opts.connections, modules)
    if (connectionEdges.length > 0) return connectionEdges
  }
  if (opts.contracts && opts.contracts.length > 0) {
    const contractEdges = buildEdgesHybrid(opts.contracts, modules)
    if (contractEdges.length > 0) return contractEdges
  }
  return buildEdges(modules)
}
