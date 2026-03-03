/**
 * @file flow-edge-utils.ts — Shared edge-building logic for module flow visualisations.
 *
 * @description Pure-logic module (no React) that classifies signal types and builds
 * edges from either keyword overlap or interface contracts. Used by both the static
 * ProcessFlowDiagram and the interactive ModuleFlowCanvas.
 *
 * FLOW: process-flow-diagram.tsx + module-flow-canvas.tsx → import from here
 */

import type { CadLabModule, InterfaceContract } from "@/lib/cad-lab-types"
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
 * Builds edges using contracts first, then fills gaps with 2-tier fallback.
 *
 * INTENT: Contract extraction is non-deterministic — Claude may miss ports or
 * rephrase names so `resolvePortName` fails. The either/or strategy left those
 * ports completely disconnected. This hybrid approach gives contracts priority,
 * then uses relaxed keyword overlap (Tier 1), then signal-type matching (Tier 2)
 * for any ports that remain unconnected.
 *
 * DECISION: Gap-fill uses minShared=1 (not 2) because it only runs for already-
 * orphaned ports — the contract pass had first crack. Signal-type fallback is a
 * last resort: it only fires for ports still orphaned after keyword matching, and
 * connects 1:1 (each output to at most one input).
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

  // Step 3 (Tier 1): Keyword-match unconnected outputs → unconnected inputs
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

  // Step 4 (Tier 2): Signal-type fallback for still-orphaned ports.
  // INTENT: Last resort — connects orphaned outputs to orphaned inputs that share
  // the same signal type classification. 1:1 matching only.
  const orphanedOutputs: { moduleId: string; port: string; signalType: SignalType }[] = []
  const orphanedInputs: { moduleId: string; port: string; signalType: SignalType }[] = []

  for (const m of modules) {
    for (const output of m.outputs) {
      if (!connectedOutputs.has(`${m.id}::${output}`)) {
        const st = classifySignalType(output)
        if (st !== "other") orphanedOutputs.push({ moduleId: m.id, port: output, signalType: st })
      }
    }
    for (const input of m.inputs) {
      if (!connectedInputs.has(`${m.id}::${input}`)) {
        const st = classifySignalType(input)
        if (st !== "other") orphanedInputs.push({ moduleId: m.id, port: input, signalType: st })
      }
    }
  }

  const claimedInputs = new Set<string>()
  for (const out of orphanedOutputs) {
    for (const inp of orphanedInputs) {
      if (inp.moduleId === out.moduleId) continue
      if (claimedInputs.has(`${inp.moduleId}::${inp.port}`)) continue
      if (out.signalType !== inp.signalType) continue

      gapEdges.push({
        from: out.moduleId,
        to: inp.moduleId,
        sourceHandle: out.port,
        targetHandle: inp.port,
        label: out.port,
        signalType: out.signalType,
      })
      claimedInputs.add(`${inp.moduleId}::${inp.port}`)
      break // 1:1 — this output is now connected, move to next
    }
  }

  return [...contractEdges, ...gapEdges]
}
