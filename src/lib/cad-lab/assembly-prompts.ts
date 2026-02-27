/**
 * @file assembly-prompts.ts — Prompts for system assembly code generation.
 *
 * @description Defines system/user prompts for the Build pipeline's integration step:
 * Claude generates CadQuery code that imports all module STEP files and positions
 * them into a single assembly. Template components (real parts from the library)
 * are placed first as anchors; generated modules are positioned relative to them.
 *
 * INTENT: Components-first assembly — real hardware is the ground truth,
 * generated structure adapts to it.
 */

import type { InterfaceContract } from "@/lib/cad-lab-types"

/** Spatial and semantic metadata for one module in the assembly */
export interface AssemblyModuleInfo {
  /** Sanitised filename (used as importStep name, e.g. "drive_system") */
  name: string
  /** Human-readable display name */
  displayName: string
  /** True if this module originated from the template library (anchor) */
  isTemplateComponent: boolean
  /** Template slug if matched from library */
  seedTemplateSlug?: string
  /** Bounding box dimensions in mm */
  bbox?: { xLen: number; yLen: number; zLen: number }
  /** Centre of gravity [x, y, z] in mm */
  centerOfGravity?: [number, number, number]
  /** Estimated mass in grams */
  massGrams?: number
  /** One-sentence purpose */
  purpose: string
  /** Major physical components */
  keyParts: string[]
  /** Input streams/signals this module receives */
  inputs: string[]
  /** Output streams/signals this module produces */
  outputs: string[]
  /** Full interface definition text (contains placement table + connection map) */
  interfaceDefinition?: string
}

/**
 * Builds the system prompt for assembly CadQuery code generation.
 *
 * @param sourceNames - Sanitised filenames of all module STEPs
 * @returns System prompt string
 */
export function getAssemblyCodeGenSystemPrompt(sourceNames: string[]): string {
  const namesList = sourceNames.map((n) => `"${n}"`).join(", ")

  return `You are generating CadQuery Python code that combines module STEP files into a single system assembly.

ENVIRONMENT:
- A variable SOURCE_DIR is already set (path to a directory containing the source STEP files).
- Source filenames are: ${namesList}. Each file is at SOURCE_DIR + "/" + name + ".step"
- Load a source with: cq.importers.importStep(SOURCE_DIR + "/<name>.step") which returns a cq.Workplane.
- You may translate/rotate with .translate((x,y,z)) and .rotate(axisStart, axisEnd, angleDegrees).
- The final variable MUST be named "result" and be a cq.Workplane.
- Do NOT use open(), os, or file paths other than SOURCE_DIR. Do NOT export or print.
- Output ONLY Python code inside a \`\`\`python code fence. No explanations.

COMPONENTS-FIRST ASSEMBLY RULES:
1. TEMPLATE COMPONENTS are anchors — real parts from the hardware library. Position them FIRST.
2. GENERATED MODULES (chassis, adapters, mounting plates) position RELATIVE to template component anchors.
3. Use cq.Assembly() ALWAYS — never boolean union/cut across modules. Complex imported STEP geometry will fail boolean operations.
4. Honor bounding boxes to prevent overlap. Leave 2-5mm clearance between adjacent parts.
5. When interface definitions include placement tables or exact positions, use those coordinates.
6. When interface definitions specify connection points, align mating faces.

ASSEMBLY PATTERN (mandatory):
\`\`\`python
import cadquery as cq

# Load modules
mod_a = cq.importers.importStep(SOURCE_DIR + "/module_a.step")
mod_b = cq.importers.importStep(SOURCE_DIR + "/module_b.step")

# Build assembly — template components first, then generated modules
assy = cq.Assembly()
assy.add(mod_a, name="module_a", loc=cq.Location(cq.Vector(0, 0, 0)))
assy.add(mod_b, name="module_b", loc=cq.Location(cq.Vector(x, y, z)))

result = cq.Workplane("XY").newObject([assy.toCompound()])
\`\`\`

POSITIONING STRATEGY (in priority order):
1. INTERFACE DEFINITIONS: If a module's interface definition contains exact coordinates or a placement table, use those positions directly.
2. CONNECTION MAP: If modules have matching inputs/outputs, position them adjacent along the appropriate axis with mating faces aligned.
3. BOUNDING BOX STACKING: If no position data is available, stack modules along the Z axis with 5mm gaps between them. Place the largest module at origin, then stack others on top by descending size.

ROTATION: Only rotate if interface definitions or connection logic require it. Default orientation is identity (no rotation).

MANDATORY: The final line must be: result = cq.Workplane("XY").newObject([assy.toCompound()])`
}

/**
 * Computes a suggested starting layout by stacking modules along Z axis.
 *
 * @description Sorts modules with bboxes by volume (descending), places the largest
 * at origin, then stacks upward with 5mm gaps. Modules without bboxes get a note
 * to position manually. Returns a markdown table with suggested (x, y, z) positions.
 *
 * @param modules - Array of module metadata
 * @returns Markdown table with suggested positions
 */
export function computeLayoutHint(modules: AssemblyModuleInfo[]): string {
  const withBbox = modules
    .filter((m) => m.bbox)
    .map((m) => ({
      name: m.displayName,
      sourceName: m.name,
      volume: m.bbox!.xLen * m.bbox!.yLen * m.bbox!.zLen,
      zLen: m.bbox!.zLen,
    }))
    .sort((a, b) => b.volume - a.volume) // largest first = base

  const withoutBbox = modules.filter((m) => !m.bbox)

  const rows: string[] = [
    "| Module | Source file | Suggested X | Suggested Y | Suggested Z | Notes |",
    "|--------|------------|-------------|-------------|-------------|-------|",
  ]

  let zCursor = 0
  for (const m of withBbox) {
    rows.push(`| ${m.name} | ${m.sourceName}.step | 0 | 0 | ${zCursor.toFixed(1)} | bbox vol ${(m.volume / 1e3).toFixed(1)} cm³ |`)
    zCursor += m.zLen + 5 // 5mm gap
  }

  for (const m of withoutBbox) {
    rows.push(`| ${m.displayName} | ${m.name}.step | ? | ? | ? | no bbox — position manually |`)
  }

  return rows.join("\n")
}

/**
 * Builds the user prompt with structured module data for assembly code generation.
 *
 * @param modules - Array of module metadata
 * @param productSubject - The product being assembled
 * @param interfaceContracts - Optional extracted interface contracts (P1) for richer connection data
 * @returns User prompt string
 */
export function getAssemblyCodeGenUserPrompt(
  modules: AssemblyModuleInfo[],
  productSubject: string,
  interfaceContracts?: InterfaceContract[],
): string {
  const anchors = modules.filter((m) => m.isTemplateComponent)
  const generated = modules.filter((m) => !m.isTemplateComponent)

  const formatModule = (m: AssemblyModuleInfo, role: string): string => {
    const lines: string[] = [
      `### ${m.displayName} (${role})`,
      `- Source file: "${m.name}.step"`,
      `- Purpose: ${m.purpose}`,
    ]
    if (m.seedTemplateSlug) lines.push(`- Template: ${m.seedTemplateSlug}`)
    if (m.bbox) lines.push(`- Bounding box: ${m.bbox.xLen.toFixed(1)} × ${m.bbox.yLen.toFixed(1)} × ${m.bbox.zLen.toFixed(1)} mm`)
    if (m.centerOfGravity) lines.push(`- Center of gravity: [${m.centerOfGravity.map((v) => v.toFixed(1)).join(", ")}] mm`)
    if (m.massGrams != null) lines.push(`- Mass: ${m.massGrams.toFixed(1)} g`)
    if (m.keyParts.length > 0) lines.push(`- Key parts: ${m.keyParts.join(", ")}`)
    if (m.inputs.length > 0) lines.push(`- Inputs: ${m.inputs.join("; ")}`)
    if (m.outputs.length > 0) lines.push(`- Outputs: ${m.outputs.join("; ")}`)
    if (m.interfaceDefinition) lines.push(`\nINTERFACE DEFINITION:\n${m.interfaceDefinition}`)
    return lines.join("\n")
  }

  // R1: Use extracted interface contracts when available, fall back to heuristic
  const hasContracts = interfaceContracts && interfaceContracts.length > 0
  const connectionMapText = hasContracts
    ? formatInterfaceContractsForAssembly(interfaceContracts, modules)
    : deriveConnectionMap(modules)
  const connectionLabel = hasContracts
    ? "CONTRACT-VALIDATED CONNECTION MAP"
    : "DERIVED CONNECTION MAP"

  const sections: string[] = [
    `PRODUCT: ${productSubject}`,
    `TOTAL MODULES: ${modules.length} (${anchors.length} template components, ${generated.length} generated)`,
  ]

  if (anchors.length > 0) {
    sections.push(
      `\n## TEMPLATE COMPONENTS (position first — these are anchors)`,
      ...anchors.map((m) => formatModule(m, "TEMPLATE COMPONENT — anchor")),
    )
  }

  if (generated.length > 0) {
    sections.push(
      `\n## GENERATED MODULES (position relative to anchors)`,
      ...generated.map((m) => formatModule(m, "GENERATED — position relative to anchors")),
    )
  }

  sections.push(`\n## ${connectionLabel}\n${connectionMapText}`)

  const layoutHint = computeLayoutHint(modules)
  sections.push(
    `\n## SUGGESTED STARTING LAYOUT`,
    `(Override with interface definition positions when available)`,
    layoutHint,
  )

  sections.push(
    `\nGenerate CadQuery assembly code that:`,
    `1. Loads all ${modules.length} module STEP files`,
    `2. Places template components first at sensible anchor positions`,
    `3. Positions generated modules relative to the anchors`,
    `4. Uses cq.Assembly() — no boolean operations between modules`,
    `5. Assigns the final compound to "result"`,
  )

  return sections.join("\n")
}

/**
 * Formats extracted interface contracts into a structured connection map for the assembly prompt.
 *
 * @description Replaces the crude `deriveConnectionMap()` heuristic when real contract data
 * is available. Includes port types, specs, and compatibility warnings so Claude can
 * position mating faces correctly.
 *
 * @param contracts - Validated interface contracts from P1 extraction
 * @param modules - Assembly module metadata (for resolving module IDs to display names)
 * @returns Formatted connection map text
 */
export function formatInterfaceContractsForAssembly(
  contracts: InterfaceContract[],
  modules: AssemblyModuleInfo[],
): string {
  if (contracts.length === 0) {
    return "No interface contracts extracted.\nUse bounding box stacking: place largest module at origin, stack others along Z with 5mm gaps."
  }

  // Build module ID → display name lookup
  const nameMap = new Map<string, string>()
  for (const m of modules) {
    nameMap.set(m.name, m.displayName)
  }
  const resolveName = (id: string) => nameMap.get(id) ?? id

  const lines: string[] = []
  for (const c of contracts) {
    const sourceName = resolveName(c.sourceModuleId)
    const targetName = resolveName(c.targetModuleId)
    const typeLabel = c.portType.toUpperCase()

    let line = `${sourceName} [${c.sourcePort}] → ${targetName} [${c.targetPort}] (${typeLabel})`

    // Add spec details when available
    const specs: string[] = []
    if (c.sourceSpec) specs.push(`source: ${c.sourceSpec}`)
    if (c.targetSpec) specs.push(`target: ${c.targetSpec}`)
    if (specs.length > 0) line += ` — ${specs.join(", ")}`

    // Flag incompatible connections
    if (c.compatible === false) {
      line += ` ⚠ INCOMPATIBLE: ${c.incompatibilityReason ?? "specs do not match"}`
    }

    lines.push(line)
  }

  return lines.join("\n")
}

/**
 * Derives a best-effort connection map by matching module outputs to other modules' inputs.
 *
 * @description Simple substring matching heuristic. For each module output, scans all
 * other modules' inputs for overlapping terms (power, signal, data, mount, etc.).
 *
 * @param modules - Array of module metadata
 * @returns Human-readable connection map text
 */
function deriveConnectionMap(modules: AssemblyModuleInfo[]): string {
  const connections: string[] = []

  for (const source of modules) {
    for (const output of source.outputs) {
      const outputTerms = extractTerms(output)
      for (const target of modules) {
        if (target.name === source.name) continue
        for (const input of target.inputs) {
          const inputTerms = extractTerms(input)
          // Match if any significant term overlaps
          const overlap = outputTerms.some((t) => inputTerms.includes(t))
          if (overlap) {
            connections.push(`${source.displayName} [${output}] → ${target.displayName} [${input}]`)
          }
        }
      }
    }
  }

  if (connections.length === 0) {
    return "No explicit connections detected between module inputs/outputs.\nUse bounding box stacking: place largest module at origin, stack others along Z with 5mm gaps."
  }

  return connections.join("\n")
}

/**
 * Extracts significant terms from an input/output description for matching.
 * Filters out very short or generic words.
 */
function extractTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .filter((t) => !["the", "and", "for", "from", "into", "with", "out", "via"].includes(t))
}
