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
  label?: string
  signalType: SignalType
  incompatible?: boolean
  incompatibilityReason?: string
}

/* ─── Signal type classification ───────────────────────────────────────── */

/** Keywords that classify a connection's signal type. */
export const SIGNAL_KEYWORDS: Record<Exclude<SignalType, "other">, string[]> = {
  power: ["voltage", "battery", "current", "watt", "amp", "dc", "charger", "power", "supply", "energy"],
  data: ["signal", "data", "control", "sensor", "telemetry", "pwm", "serial", "usb", "uart", "command", "feedback", "communication", "protocol", "digital", "analog"],
  mechanical: ["force", "torque", "mount", "structural", "load", "bracket", "axle", "frame", "chassis", "gear", "shaft", "bearing", "mechanical", "assembly"],
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
  dot: string
  text: string
  activeBorder: string
  activeBg: string
  strokeHsl: string
}> = {
  power:      { label: "Power",      dot: "bg-chart-1",  text: "text-chart-1",  activeBorder: "border-chart-1/50",  activeBg: "bg-chart-1/10",  strokeHsl: "hsl(var(--chart-1))" },
  data:       { label: "Data",       dot: "bg-chart-2",  text: "text-chart-2",  activeBorder: "border-chart-2/50",  activeBg: "bg-chart-2/10",  strokeHsl: "hsl(var(--chart-2))" },
  mechanical: { label: "Mechanical", dot: "bg-chart-3",  text: "text-chart-3",  activeBorder: "border-chart-3/50",  activeBg: "bg-chart-3/10",  strokeHsl: "hsl(var(--chart-3))" },
  thermal:    { label: "Thermal",    dot: "bg-chart-4",  text: "text-chart-4",  activeBorder: "border-chart-4/50",  activeBg: "bg-chart-4/10",  strokeHsl: "hsl(var(--chart-4))" },
  other:      { label: "Other",      dot: "bg-chart-5",  text: "text-chart-5",  activeBorder: "border-chart-5/50",  activeBg: "bg-chart-5/10",  strokeHsl: "hsl(var(--chart-5))" },
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
 * Builds edges from extracted interface contracts instead of keyword overlap.
 * Each contract becomes an edge with compatibility status preserved.
 */
export function buildEdgesFromContracts(contracts: InterfaceContract[]): FlowEdge[] {
  const edges: FlowEdge[] = []
  for (const contract of contracts) {
    const isDuplicate = edges.some(
      (e) => e.from === contract.sourceModuleId && e.to === contract.targetModuleId && e.label === contract.sourcePort,
    )
    if (!isDuplicate) {
      edges.push({
        from: contract.sourceModuleId,
        to: contract.targetModuleId,
        label: contract.sourcePort,
        signalType: portTypeToSignalType(contract.portType),
        incompatible: contract.compatible === false,
        incompatibilityReason: contract.incompatibilityReason,
      })
    }
  }
  return edges
}
