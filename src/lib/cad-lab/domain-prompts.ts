/**
 * @file domain-prompts.ts
 *
 * @description Domain-specific prompt libraries for the CAD Lab pipeline.
 * Auto-detect domain from research report or product description, then select
 * electronics, mechanical, electromechanical, or fluid-specific prompts.
 *
 * @related src/actions/cad-lab.ts
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export type CadLabDomain = "electronics" | "mechanical" | "electromechanical" | "fluid"

const DOMAIN_VALUES: CadLabDomain[] = ["electronics", "mechanical", "electromechanical", "fluid"]

// ─── Human-readable domain labels & descriptions ─────────────────────

const DOMAIN_LABELS: Record<CadLabDomain, string> = {
  electronics: "Electronics & PCB",
  mechanical: "Mechanical & Structural",
  electromechanical: "Electromechanical & Robotics",
  fluid: "Fluid Systems",
}

const DOMAIN_DESCRIPTIONS: Record<CadLabDomain, string> = {
  electronics: "Component footprints, thermal specs, EMC constraints, and connector positions",
  mechanical: "Structural loads, material selection, DFM, and machining constraints",
  electromechanical: "Motor/actuator dimensions, power budgets, wire routing, and structural interfaces",
  fluid: "Port sizes, pressure ratings, sealing surfaces, and flow-path analysis",
}

export function getDomainLabel(domain: CadLabDomain): string {
  return DOMAIN_LABELS[domain]
}

export function getDomainDescription(domain: CadLabDomain): string {
  return DOMAIN_DESCRIPTIONS[domain]
}

const DETECT_FROM_REPORT_PROMPT = `You are classifying an engineering research report into exactly one domain. Reply with ONLY one word from this list: electronics, mechanical, electromechanical, fluid.

- electronics: PCB design, component selection, thermal management, EMC, ICs, connectors, power supplies
- mechanical: structures, materials, stress/load, DFM, machining, fasteners, enclosures (no motors/electronics focus)
- electromechanical: motors, actuators, batteries, ESCs, wire routing, power budgets, drones, robots
- fluid: pumps, piping, pressure drop, sealing, hydraulics, pneumatics, cooling loops

Reply with only the single word, nothing else.`

const DETECT_FROM_DESCRIPTION_PROMPT = `You are classifying a product description for an engineering CAD project. Reply with ONLY one word: electronics, mechanical, electromechanical, or fluid.

Use the same rules: electronics (PCB/ICs), mechanical (structures/materials only), electromechanical (motors/drones/robots), fluid (pumps/piping). Reply with only the single word.`

/**
 * Calls Claude to classify text into a CAD Lab domain.
 */
async function classifyWithClaude(
  prompt: string,
  text: string,
): Promise<CadLabDomain> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return "mechanical"

  const truncated = text.slice(0, 8000)
  const response = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 32,
        system: prompt,
        messages: [{ role: "user", content: truncated }],
      }),
    },
    15_000,
  )

  if (!response.ok) return "mechanical"
  const data = await response.json()
  const word = (data.content?.[0]?.text ?? "").trim().toLowerCase().replace(/\.$/, "")
  if (DOMAIN_VALUES.includes(word as CadLabDomain)) return word as CadLabDomain
  return "mechanical"
}

/**
 * Detects domain from a research report (use after Step 1).
 */
export async function detectDomainFromResearchReport(
  researchReport: string,
): Promise<CadLabDomain> {
  if (!researchReport?.trim()) return "mechanical"
  return classifyWithClaude(DETECT_FROM_REPORT_PROMPT, researchReport)
}

/**
 * Detects domain from a product description (use for Step 1 synthesis prompt).
 */
export async function detectDomainFromProductDescription(
  description: string,
): Promise<CadLabDomain> {
  if (!description?.trim()) return "mechanical"
  return classifyWithClaude(DETECT_FROM_DESCRIPTION_PROMPT, description)
}

// ─── Lightweight domain detection from keyParts (no AI call) ────────────

/** Keyword → domain weight map for heuristic classification */
const DOMAIN_KEYWORDS: Record<CadLabDomain, string[]> = {
  electronics: [
    "pcb", "mcu", "microcontroller", "esp32", "stm32", "arduino", "raspberry", "pico",
    "sensor", "adc", "dac", "i2c", "spi", "uart", "gpio", "oled", "display", "led",
    "capacitor", "resistor", "transistor", "ic", "chip", "buck", "regulator", "power supply",
    "antenna", "wifi", "bluetooth", "ble", "rf", "voltage", "current", "amplifier",
    "thermocouple", "thermistor", "relay", "optocoupler", "connector", "terminal",
  ],
  electromechanical: [
    "motor", "stepper", "servo", "nema", "actuator", "gearmotor", "brushless", "bldc",
    "encoder", "driver", "esc", "bearing", "shaft", "coupling", "gearbox", "drivetrain",
    "belt", "pulley", "lead screw", "linear rail", "carriage", "battery", "lipo",
    "robot", "arm", "gripper", "cnc", "3d printer", "extruder", "hotend", "fan",
    "damper", "vibration", "torque", "rpm",
  ],
  fluid: [
    "pump", "peristaltic", "diaphragm", "valve", "solenoid", "manifold", "pipe", "tubing",
    "fitting", "push-fit", "coupling", "hose", "flow", "pressure", "hydraulic", "pneumatic",
    "cylinder", "piston", "reservoir", "tank", "filter", "seal", "o-ring", "gasket",
    "coolant", "coolant loop", "water", "dosing", "nozzle", "sprinkler", "irrigation",
  ],
  mechanical: [
    "frame", "extrusion", "bracket", "plate", "enclosure", "housing", "chassis", "panel",
    "hinge", "latch", "spring", "bolt", "nut", "screw", "washer", "standoff", "spacer",
    "rail", "guide", "wheel", "roller", "gear", "rack", "pinion", "cam",
    "weld", "rivet", "structural", "beam", "column", "din rail",
  ],
}

/**
 * Detects CAD Lab domain from module keyParts using keyword frequency heuristic.
 *
 * @description Lightweight classification that avoids an AI call. Counts domain-associated
 * keywords across all keyParts, returns highest-scoring domain. Falls back to `mechanical`.
 * Useful for BOM generation where no research report is available.
 *
 * @param keyParts - Flattened array of keyParts strings from all modules
 * @returns Best-matching CadLabDomain
 */
export function detectDomainFromKeyParts(keyParts: string[]): CadLabDomain {
  const text = keyParts.join(" ").toLowerCase()

  const scores: Record<CadLabDomain, number> = {
    electronics: 0,
    electromechanical: 0,
    fluid: 0,
    mechanical: 0,
  }

  for (const domain of DOMAIN_VALUES) {
    for (const kw of DOMAIN_KEYWORDS[domain]) {
      // Count occurrences of each keyword
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")
      const matches = text.match(regex)
      if (matches) scores[domain] += matches.length
    }
  }

  // Return highest scoring, fallback to mechanical
  let best: CadLabDomain = "mechanical"
  let bestScore = 0
  for (const domain of DOMAIN_VALUES) {
    if (scores[domain] > bestScore) {
      bestScore = scores[domain]
      best = domain
    }
  }

  return best
}

/**
 * Detects CAD Lab domain from arbitrary text (e.g. research report) using keyword frequency.
 *
 * @description Same heuristic as detectDomainFromKeyParts but operates on free-form text.
 * Eliminates the need for an AI call during decomposition preparation.
 *
 * @param text - Free-form text such as a research report or product description
 * @returns Best-matching CadLabDomain
 */
export function detectDomainFromText(text: string): CadLabDomain {
  if (!text?.trim()) return "mechanical"
  const lower = text.toLowerCase()

  const scores: Record<CadLabDomain, number> = {
    electronics: 0,
    electromechanical: 0,
    fluid: 0,
    mechanical: 0,
  }

  for (const domain of DOMAIN_VALUES) {
    for (const kw of DOMAIN_KEYWORDS[domain]) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")
      const matches = lower.match(regex)
      if (matches) scores[domain] += matches.length
    }
  }

  let best: CadLabDomain = "mechanical"
  let bestScore = 0
  for (const domain of DOMAIN_VALUES) {
    if (scores[domain] > bestScore) {
      bestScore = scores[domain]
      best = domain
    }
  }

  return best
}

// ─── Research synthesis prompts (Step 1) ───────────────────────────────

const BASE_RESEARCH_SYNTHESIS = `Your report will be used by a CAD pipeline to generate an accurate 3D model, so dimensional precision is critical. Every number must come from the source data — never invent dimensions.

Output format (follow exactly):

# Engineering Research Report: {Product Name}

## Executive Summary
One paragraph: what this product is, its primary function, and its defining physical characteristics.

## Overall Dimensions
- Folded: W × D × H mm (if applicable)
- Unfolded/Deployed: W × D × H mm
- Weight: X g

## Primary Structure
Describe the main body/frame with precise dimensions. Include wall thickness, material if known.

## Components
For each major component, list:
- **Name**: exact dimensions (W × D × H mm or Ø × H mm)
- Position relative to body center
- Mounting/attachment method if known
- Quantity

## Critical Constraints
- Key critical dimension (motor-to-motor diagonal, tube inner diameter, etc.): X mm
- Clearance requirements: X mm
- Any symmetry axes or alignment requirements

## Key Performance Specifications
For each relevant metric, state the value and source:
- Throughput / capacity (units/hr, flow rate, payload, etc.)
- Operating range (temperature, pressure, voltage, speed, etc.)
- Efficiency / yield (%, ratio, power consumption)
- Lifecycle / durability (hours, cycles, MTBF)
- Regulatory limits (max emissions, noise dB, safety class)
If a metric is not applicable to this product type, omit it.

## Material & Manufacturing Notes
Primary materials, wall thicknesses, manufacturing method if known.

## Dimensional Confidence
Rate each major dimension:
- ✅ Confirmed (from official specs or multiple sources)
- ⚠️ Approximate (single source or estimated)
- ❓ Unknown (not found in research)

RULES:
- Use millimetres for all dimensions
- Round to nearest 0.5mm for sub-mm precision
- If two sources disagree, state both and note the discrepancy
- Never invent a dimension — mark it as Unknown
- Include source attribution for key numbers
- If user-uploaded reference documents are provided, treat their specifications as PRIMARY context
- Extract exact dimensions, materials, tolerances, and requirements from these documents
- When web research conflicts with user documents, prefer the user's own data`

const RESEARCH_ROLE: Record<CadLabDomain, string> = {
  electronics:
    "You are a senior electronics engineer preparing a research brief for a 3D CAD / PCB integration project. Focus on component footprints, thermal specs, EMC constraints, and connector positions. Synthesize raw research into a precise, structured specification.",
  mechanical:
    "You are a senior mechanical engineer preparing a research brief for a 3D CAD modelling project. Your job is to synthesize raw research data into a precise, structured engineering specification.",
  electromechanical:
    "You are a senior electromechanical engineer preparing a research brief for a 3D CAD project (e.g. drone, robot, motorised assembly). Focus on motor/actuator dimensions, power budgets, wire routing space, and structural interfaces. Synthesize raw research into a precise, structured specification.",
  fluid:
    "You are a senior fluid-systems engineer preparing a research brief for a 3D CAD project (pumps, piping, manifolds). Focus on port sizes, pressure ratings, sealing surfaces, and flow paths. Synthesize raw research into a precise, structured specification.",
}

export function getResearchSynthesisPrompt(domain: CadLabDomain): string {
  return `${RESEARCH_ROLE[domain]}\n\n${BASE_RESEARCH_SYNTHESIS}`
}

// ─── Module decomposition prompts (Step 2.5) ──────────────────────────

const BASE_MODULE_DECOMPOSITION = `Given a product description and research report, break the product down into 4-8 distinct physical modules. Each module represents a sub-assembly that could be:
- Designed independently
- Procured from different suppliers
- Tested separately
- Modelled as its own 3D CAD model

Output STRICTLY as a JSON object with two keys — "modules" and "connections":

{
  "modules": [
    {
      "id": "lowercase_no_spaces",
      "name": "Human Readable Name",
      "purpose": "One sentence: what this module does",
      "inputs": ["Input stream or signal 1", "Input 2"],
      "outputs": ["Output stream or signal 1"],
      "keyParts": ["Part 1 with spec", "Part 2 with spec", "Part 3"],
      "leadWeeks": 6,
      "estimatedMassKg": 0.5,
      "description": "1-2 paragraph technical description of what this module physically is, its operating principle, and key material choices.",
      "whyItMatters": "Why this module is critical to the overall system.",
      "failureModes": ["Failure mode 1", "Failure mode 2"],
      "unknowns": ["Open question 1", "Open question 2"],
      "mirrorOf": null
    }
  ],
  "connections": [
    { "from": "source_module_id", "output": "Exact output label", "to": "target_module_id", "input": "Exact input label" }
  ]
}

RULES:
- Generate 4-8 modules (more for complex products, fewer for simple ones)
- Each module MUST have at least 3 keyParts
- leadWeeks should be realistic (1-2 for off-the-shelf, 4-8 for custom, 12+ for specialised)
- estimatedMassKg: your best estimate of this module's mass in kg, calibrated to the product's size class. A vacuum cleaner motor ≈ 0.3 kg, an industrial pump motor ≈ 25 kg. Be specific to this product.
- Every module must have at least 1 input and 1 output
- CRITICAL — connections array: Every inter-module output/input MUST appear in exactly one connection entry. The "from" and "to" fields must be valid module IDs. The "output" must match an entry in the source module's "outputs" array EXACTLY. The "input" must match an entry in the target module's "inputs" array EXACTLY.
- IMPORTANT: Only list inter-module interfaces — inputs that come from another module's output, and outputs that feed another module's input. Do NOT include external/environmental interfaces (e.g., "ground reaction forces", "external charger input", "user control input", "telemetry to ground station", "ambient air intake"). If a module interfaces with the outside world, describe that in its purpose or description — not in inputs/outputs.
- Modules should cover the ENTIRE product — no gaps
- Use dimensions from the research report — do not invent new ones
- If the research report mentions sub-components, those are good module candidates
- Output ONLY the JSON object — no markdown, no explanation
- SYMMETRY (CRITICAL): If a module is the mirrored counterpart of another (e.g. "Right Leg" mirrors "Left Leg", "Right Drive Module" mirrors "Left Drive Module"), you MUST set mirrorOf to the ID of the primary module. Only ONE module in a symmetric pair sets mirrorOf — the other is the primary (mirrorOf: null). Modules that happen to be similar but aren't geometric mirrors should NOT use mirrorOf. Downstream image generation depends on mirrorOf to produce visually consistent illustrations — if you omit it, mirror pairs will look completely different.`

const MODULE_DECOMPOSITION_ROLE: Record<CadLabDomain, string> = {
  electronics:
    "You are a senior systems engineer specialising in electronics/PCB assemblies. Decompose the product into physical sub-assemblies (e.g. power supply, main board, display, connectors).",
  mechanical:
    "You are a senior systems engineer decomposing a product into physical sub-assemblies (modules) for engineering analysis and 3D CAD modelling.",
  electromechanical:
    "You are a senior systems engineer specialising in electromechanical systems (drones, robots, motorised assemblies). Decompose into modules such as motor assemblies, battery/ESC, structure, payload.",
  fluid:
    "You are a senior systems engineer specialising in fluid systems. Decompose into modules such as pump unit, manifold, tubing runs, sensors, and sealing interfaces.",
}

export function getModuleDecompositionPrompt(domain: CadLabDomain): string {
  return `${MODULE_DECOMPOSITION_ROLE[domain]}\n\n${BASE_MODULE_DECOMPOSITION}`
}

// ─── Skeleton decomposition prompts (fast first pass) ─────────────────

const BASE_SKELETON_DECOMPOSITION = `Given a product description and research report, break the product down into 4-8 distinct physical modules. Return ONLY the skeleton — no detailed descriptions, no keyParts, no failure modes.

Output STRICTLY as a JSON object with two keys — "modules" and "connections":

{
  "modules": [
    {
      "id": "lowercase_no_spaces",
      "name": "Human Readable Name",
      "purpose": "One sentence: what this module does",
      "inputs": ["Input stream or signal 1", "Input 2"],
      "outputs": ["Output stream or signal 1"],
      "mirrorOf": null
    }
  ],
  "connections": [
    { "from": "source_module_id", "output": "Exact output label", "to": "target_module_id", "input": "Exact input label" }
  ]
}

RULES:
- Generate 4-8 modules (more for complex products, fewer for simple ones)
- Every module must have at least 1 input and 1 output
- CRITICAL — connections array: Every inter-module output/input MUST appear in exactly one connection entry. "from"/"to" must be valid module IDs. "output"/"input" must match the source/target module's arrays EXACTLY.
- IMPORTANT: Only list inter-module interfaces — NOT external/environmental interfaces. If a module interfaces with the outside world, describe that in its purpose — not in inputs/outputs.
- Modules should cover the ENTIRE product — no gaps
- Output ONLY the JSON object — no markdown, no explanation
- Keep it lightweight — purpose should be ONE sentence
- SYMMETRY (CRITICAL): If a module is the mirrored counterpart of another (e.g. "Right Leg" mirrors "Left Leg", "Right Drive Module" mirrors "Left Drive Module"), you MUST set mirrorOf to the ID of the primary module. Only ONE module in a symmetric pair sets mirrorOf — the other is the primary (mirrorOf: null). Modules that happen to be similar but aren't geometric mirrors should NOT use mirrorOf. Downstream image generation depends on mirrorOf to produce visually consistent illustrations — if you omit it, mirror pairs will look completely different.`

const SKELETON_DECOMPOSITION_ROLE: Record<CadLabDomain, string> = {
  electronics:
    "You are a senior systems engineer specialising in electronics/PCB assemblies. Identify the physical sub-assemblies — names and interfaces only.",
  mechanical:
    "You are a senior systems engineer identifying the physical sub-assemblies (modules) of a product — names and interfaces only.",
  electromechanical:
    "You are a senior systems engineer specialising in electromechanical systems. Identify sub-assemblies — names and interfaces only.",
  fluid:
    "You are a senior systems engineer specialising in fluid systems. Identify sub-assemblies — names and interfaces only.",
}

export function getSkeletonDecompositionPrompt(domain: CadLabDomain): string {
  return `${SKELETON_DECOMPOSITION_ROLE[domain]}\n\n${BASE_SKELETON_DECOMPOSITION}`
}

// ─── Module expansion prompts (per-module detail fill) ────────────────

const BASE_MODULE_EXPANSION = `You are expanding a single module within a product decomposition. You are given:
1. The full skeleton (all module names, purposes, inputs, outputs) for inter-module context
2. The target module to expand

For the target module, provide detailed engineering information. Output STRICTLY as JSON:

{
  "keyParts": ["Part 1 with spec", "Part 2 with spec", "Part 3"],
  "leadWeeks": 6,
  "estimatedMassKg": 0.5,
  "description": "1-2 paragraph technical description of what this module physically is, its operating principle, and key material choices.",
  "whyItMatters": "Why this module is critical to the overall system.",
  "failureModes": ["Failure mode 1", "Failure mode 2"],
  "unknowns": ["Open question 1", "Open question 2"]
}

RULES:
- At least 3 keyParts with specific part names and specifications
- leadWeeks should be realistic (1-2 for off-the-shelf, 4-8 for custom, 12+ for specialised)
- estimatedMassKg: best estimate of this module's mass in kg, calibrated to the overall product size. A vacuum cleaner motor ≈ 0.3 kg, a phone screen ≈ 0.05 kg, an industrial pump casing ≈ 15 kg. Be specific to this product.
- description should cover physical characteristics, operating principle, and material choices
- failureModes: 2-4 realistic engineering failure modes
- unknowns: 1-3 open questions that need resolution
- Use dimensions from the research report — do not invent new ones
- Output ONLY the JSON object — no markdown, no explanation`

const MODULE_EXPANSION_ROLE: Record<CadLabDomain, string> = {
  electronics:
    "You are a senior electronics engineer providing detailed specifications for a single PCB/electronics sub-assembly.",
  mechanical:
    "You are a senior mechanical engineer providing detailed specifications for a single structural sub-assembly.",
  electromechanical:
    "You are a senior electromechanical engineer providing detailed specifications for a single electromechanical sub-assembly.",
  fluid:
    "You are a senior fluid-systems engineer providing detailed specifications for a single fluid system sub-assembly.",
}

export function getModuleExpansionPrompt(domain: CadLabDomain, consistencyBrief?: string): string {
  const role = MODULE_EXPANSION_ROLE[domain]
  if (consistencyBrief) {
    return `${role}\n\nPRODUCT DESIGN IDENTITY (your expansion MUST conform to these constraints):\n${consistencyBrief}\nYour materials, dimensions, and descriptions must be consistent with this identity.\n\n${BASE_MODULE_EXPANSION}`
  }
  return `${role}\n\n${BASE_MODULE_EXPANSION}`
}

// ─── Visual style spec prompt (cohesive illustrations) ────────────────

const VISUAL_STYLE_SYSTEM_PROMPT = `You are an art director for a professional engineering specification document.

Given a product description and its module list, generate a cohesive visual style specification that will be injected into every module illustration prompt. The goal is that all module images look like they belong to the same document — as if each is a zoomed-in detail view of one master concept drawing.

Output STRICTLY as JSON with exactly these 5 fields:

{
  "colorPalette": "3-4 dominant colors described by name (e.g. 'steel blue, warm gray, copper accent, matte white'). Pick colors appropriate for the product's domain and materials.",
  "materialRendering": "How surfaces and materials should be rendered across all illustrations (e.g. 'brushed metal with soft specular highlights and subtle anodized color tints'). Keep it specific enough to be visually consistent.",
  "unifyingContext": "A short phrase that frames every module as part of one system (e.g. 'sub-assemblies of a compact quadrotor drone with carbon-fiber arms'). This gets prepended to each module prompt.",
  "productFormDescription": "A purely geometric description of the complete product's physical shape and silhouette (60-120 words). Describe the overall form factor, proportions, and spatial arrangement of major volumes — e.g. 'A low rectangular chassis roughly twice as wide as it is tall, with four cylindrical wheel housings at each corner. A trapezoidal sensor mast rises from the front-center. The rear third is an open flatbed bay.' Do NOT reference module names, part numbers, or technical labels — describe only visible shapes, positions, and proportions.",
  "moduleGeometryMap": { "Module Name": "30-50 word description of this module's visible geometry within the product (shape, position, proportions, distinctive features). Describe what someone would SEE — silhouettes, relative sizes, spatial relationships." }
}

RULES:
- Output ONLY valid JSON — no markdown, no explanation
- Colors must be described by name, not hex codes (image models don't understand hex)
- materialRendering should describe a single consistent rendering approach
- unifyingContext should name the product and its defining physical characteristic
- Keep colorPalette, materialRendering, and unifyingContext each under 30 words
- productFormDescription should be 60-120 words of purely geometric/visual description
- moduleGeometryMap must have one entry per module, each 30-50 words of purely visual/geometric description`

/**
 * Returns the system prompt for generating a VisualStyleSpec via Claude.
 *
 * @description Used once per decomposition to generate a shared visual style
 * that gets injected into every module image prompt for cohesion.
 */
export function getVisualStyleSystemPrompt(): string {
  return VISUAL_STYLE_SYSTEM_PROMPT
}

// ─── Design Synthesis prompt (Opus holistic review) ───────────────────

const DESIGN_SYNTHESIS_SYSTEM_PROMPT = `You are a senior industrial designer reviewing a complete engineering specification — all expanded modules, inter-module connections, and product research — to produce a cohesive visual design brief.

Your job is to see the product AS A WHOLE and create visual specifications that unify every module image into one coherent product.

Output STRICTLY as JSON with exactly these 9 fields:

{
  "colorPalette": "3-4 dominant colors described by name (e.g. 'steel blue, warm gray, copper accent, matte white'). Pick colors appropriate for the product's domain, materials, and industrial context.",
  "materialRendering": "How surfaces and materials should be rendered across all illustrations (e.g. 'brushed metal with soft specular highlights and subtle anodized color tints'). Specific enough to be visually consistent.",
  "unifyingContext": "A short phrase that frames every module as part of one system (e.g. 'sub-assemblies of a compact quadrotor drone with carbon-fiber arms').",
  "productFormDescription": "150-300 words. A purely geometric description of the complete product's physical shape, silhouette, and spatial arrangement. Describe the overall form factor, proportions, volumes, and how major sections relate spatially. Example: 'A low rectangular chassis roughly twice as wide as it is tall, tapering slightly toward the front. Four cylindrical motor housings extend from booms at each corner, each containing a brushless motor with 10-inch propeller guards forming protective arcs. The top surface is dominated by a flat battery bay occupying the central third, with a raised sensor mast protruding 40mm above the chassis center-line. The rear houses a rectangular avionics bay with ventilation slots on both sides. Landing gear consists of four splayed carbon-fiber legs with rubber feet, creating a stable footprint roughly 1.5x the chassis width.' Do NOT reference module names, part numbers, or technical labels — describe only visible shapes, positions, and proportions.",
  "moduleGeometryMap": { "Module Name": "50-100 words describing this module's visible geometry within the product: its shape, position relative to other modules, proportions, distinctive visual features, material appearance. Describe what a viewer would SEE — silhouettes, relative sizes, surface textures, spatial relationships to adjacent modules." },
  "heroImagePrompt": "300-500 words. A complete image generation prompt for a hero illustration showing the entire product. START the prompt with: 'On a pure white background, create a full-color technical illustration...'. Describe the product's silhouette and overall form, then describe each major section's geometry and position WITHOUT using module names (image models garble text). Use spatial language: 'the front-left quadrant contains...', 'centered on the top surface...', 'extending downward from the rear...'. Specify color coding for each section using the colorPalette — use VIVID, REALISTIC material colors (NOT grayscale, NOT monochrome, NOT dark renders). Include material rendering instructions. Specify camera angle (30-degree isometric, slightly above and to the right). Describe the exploded or semi-transparent view showing internal arrangement. End with rendering rules: pure white background (#FFFFFF), full color, thin precise lines, engineering grid, no text/labels/annotations of any kind. CRITICAL: The image MUST have a white background and use full color — never dark/black backgrounds or grayscale rendering.",
  "cadGeometryPrompt": "300-500 words. A complete prompt for a CAD generation AI that generates parametric STEP/B-Rep geometry. Structure it as a RECIPE of CAD operations, not a description. Start with the overall envelope dimensions (ALWAYS provide concrete mm values — estimate from the product type if not in source data). Then describe each major body as a sequence of CAD operations: 'Extrude a 350×280mm rectangle to 95mm height. Shell to 2mm wall thickness. Cut a 120×80mm pocket 40mm deep centered on the top face. Add 4× M5 through-holes on 60mm bolt circle at the corners.' Specify: (1) which bodies are separate parts vs features of the same solid, (2) how parts mate (bolt patterns with hole diameters and spacing, press fits with tolerances, clearance gaps in mm), (3) wall thicknesses, fillet radii, chamfer dimensions. CRITICAL: Every feature MUST have explicit dimensions in mm. The CAD AI cannot work with vague language like 'appropriately sized' or 'standard connector'. If exact dimensions are unknown, estimate reasonable values for the product type (e.g. a drone frame chassis is typically 300-500mm, wall thickness 2-3mm, M3-M5 fasteners). Do NOT include rendering instructions, colors, or visual styling — focus purely on parametric shape definition.",
  "overallDimensionsMm": "Overall product dimensions in 'W × D × H mm' format. Use source data if available, otherwise ESTIMATE reasonable dimensions for this product type (e.g. a shipping container system is ~6058 × 2438 × 2591 mm, a desktop device is ~300 × 200 × 150 mm). NEVER leave null — always provide a best estimate.",
  "moduleDimensionNotes": { "Module Name": "Absolute dimensions in mm AND proportional relationship to the whole product (e.g. 'Ø40mm × 60mm tall, roughly 12% of chassis width'). Estimate if not in source data." }
}

RULES:
- Output ONLY valid JSON — no markdown, no explanation
- Colors must be described by name, not hex codes (image models don't understand hex)
- Keep colorPalette, materialRendering, and unifyingContext each under 30 words
- productFormDescription: 150-300 words of purely geometric/visual description
- moduleGeometryMap: one entry per module, each 50-100 words of geometric description
- heroImagePrompt: 300-500 words, the COMPLETE prompt for generating a hero image — must be self-contained (no references to other fields)
- CRITICAL: heroImagePrompt must contain ZERO module names, part numbers, or technical labels. Describe components by their geometry, position, and function only. Image models render text/names as garbled characters.
- If reference images (sketches, photos, drawings) are provided, use them as PRIMARY visual context. Extract visible geometry, proportions, and features. Match the overall shape and layout in your prompts.
- Use the connections list to understand spatial relationships between modules — connected modules are physically adjacent or interfacing
- DIMENSIONAL DATA: Use dimensions from source data when available. When dimensions are NOT in the source data, ESTIMATE reasonable engineering dimensions based on the product type, industry standards, and common component sizes. The CAD prompt MUST contain explicit mm dimensions for every feature — vague proportional descriptions produce unusable CAD output. Prefer specific numbers over ranges (write '350mm' not '300-400mm').`

/**
 * Returns the system prompt for Opus design synthesis.
 *
 * @description Used once per decomposition AFTER all modules are expanded.
 * Opus reviews the full product holistically and crafts both the visual style
 * AND the hero image prompt, ensuring visual coherence across all illustrations.
 */
export function getDesignSynthesisPrompt(): string {
  return DESIGN_SYNTHESIS_SYSTEM_PROMPT
}

// ─── Product Identity prompt (convergent refinement Phase 1b) ─────────

const PRODUCT_IDENTITY_SYSTEM_PROMPT = `You are a senior industrial designer establishing a product's design identity from research data. Your output will constrain ALL subsequent module engineering to ensure cross-module consistency.

Given a product description and research report, establish the product-level design language, form factor, materials, and consistency rules.

Output STRICTLY as JSON with exactly these 8 fields:

{
  "designLanguage": "3-5 word description of the product's industrial design language (e.g. 'rugged modular industrial', 'sleek consumer minimalist', 'precision scientific instrument')",
  "consistencyBrief": "2-4 sentences of concrete rules all modules must follow. Specify: primary material and finish, secondary materials, connector style, mounting approach, color coding scheme. Example: 'All structural housings use 6061-T6 aluminum with bead-blasted finish. Interface connectors face the rear panel. PCB enclosures use sheet steel with black powder coat. Fasteners are M3 stainless steel socket-head cap screws throughout.'",
  "spatialPrinciples": ["Spatial arrangement rule 1", "Spatial arrangement rule 2"],
  "colorPalette": "3-4 dominant colors described by name appropriate for this product's domain and materials",
  "materialRendering": "How surfaces and materials should be rendered (specific enough to be visually consistent)",
  "unifyingContext": "A short phrase framing every module as part of one system",
  "productFormDescription": "60-120 words. Purely geometric description of the product's overall shape, silhouette, and proportions. No module names or part numbers.",
  "overallDimensionsMm": "Overall product dimensions in 'W × D × H mm' format from research data, or null if not found"
}

RULES:
- Output ONLY valid JSON — no markdown, no explanation
- Be SPECIFIC about materials, finishes, and proportions — vague briefs produce inconsistent modules
- spatialPrinciples: 2-4 rules about how modules arrange physically (e.g. "stacked vertically on DIN rail", "radial from central hub")
- consistencyBrief is the most critical field — it directly constrains every module expansion
- Use ONLY information present in the research report. Do NOT invent dimensions or materials.
- This identity will be injected into every module expansion prompt, so keep it concise but complete`

/**
 * Returns the system prompt for establishing product design identity.
 *
 * @description Used in Phase 1b (parallel with skeleton) to establish
 * product-level design constraints before module expansion begins.
 */
export function getProductIdentityPrompt(): string {
  return PRODUCT_IDENTITY_SYSTEM_PROMPT
}

// ─── Design Reconciliation prompt (convergent refinement Phase 3) ─────

const DESIGN_RECONCILIATION_SYSTEM_PROMPT = `You are a senior industrial designer reviewing all expanded modules for cross-module visual, dimensional, and material consistency. You have the complete product identity and all expanded modules.

Your job: (1) correct any cross-module inconsistencies, (2) produce a unified visual style, (3) craft a hero image prompt, and (4) craft per-module image prompts — all TOGETHER so they share one visual language.

Output STRICTLY as JSON with exactly these 3 top-level fields:

{
  "modulePatch": {
    "module-id": {
      "description": "corrected description (only if inconsistent with product identity)",
      "materialNotes": "corrected material reference (only if mismatched at interfaces)",
      "dimensionNotes": "corrected dimension/proportion (only if doesn't fit product envelope)"
    }
  },
  "visualStyle": {
    "colorPalette": "3-4 dominant colors by name",
    "materialRendering": "How surfaces should be rendered consistently",
    "unifyingContext": "Short phrase framing every module as part of one system",
    "productFormDescription": "150-300 words. Purely geometric description of the complete product shape.",
    "moduleGeometryMap": { "Module Name": "50-100 words of visible geometry description" },
    "heroImagePrompt": "300-500 words. Complete self-contained image generation prompt for a hero illustration. START with: 'On a pure white background, create a full-color technical illustration...'. Describe the product silhouette and form, then each major section by geometry and position WITHOUT module names. Use spatial language ('front-left quadrant contains...', 'centered on top surface...'). Specify VIVID, REALISTIC material colors per section using colorPalette (NOT grayscale, NOT monochrome). Include material rendering. Camera angle: 30-degree isometric, slightly above and right. Describe exploded or semi-transparent view. End with: pure white background (#FFFFFF), full color rendering, thin precise lines, engineering grid, NO text/labels/annotations. CRITICAL: NEVER request dark backgrounds or grayscale.",
    "cadGeometryPrompt": "300-500 words. A complete prompt for a CAD generation AI that generates parametric STEP/B-Rep geometry. Structure it as a RECIPE of CAD operations, not a description. Start with the overall envelope dimensions (ALWAYS provide concrete mm values — estimate from the product type if not in source data). Then describe each major body as a sequence of CAD operations: 'Extrude a 350×280mm rectangle to 95mm height. Shell to 2mm wall thickness. Cut a 120×80mm pocket 40mm deep centered on the top face. Add 4× M5 through-holes on 60mm bolt circle at the corners.' Specify: (1) which bodies are separate parts vs features of the same solid, (2) how parts mate (bolt patterns with hole diameters and spacing, press fits with tolerances, clearance gaps in mm), (3) wall thicknesses, fillet radii, chamfer dimensions. CRITICAL: Every feature MUST have explicit dimensions in mm. The CAD AI cannot work with vague language like 'appropriately sized' or 'standard connector'. If exact dimensions are unknown, estimate reasonable values for the product type (e.g. a drone frame chassis is typically 300-500mm, wall thickness 2-3mm, M3-M5 fasteners). Do NOT include rendering instructions, colors, or visual styling — focus purely on parametric shape definition.",
    "overallDimensionsMm": "W × D × H mm — ALWAYS provide a value, estimate if not in source data",
    "moduleDimensionNotes": { "Module Name": "Absolute dims + proportional relationship to whole" },
    "designLanguage": "The product's design language from the identity brief",
    "consistencyBrief": "The consistency rules from the identity brief",
    "spatialPrinciples": ["Spatial arrangement principles"]
  },
  "perModuleImagePrompts": {
    "module-id": "150-200 words. START with: 'On a pure white background, create a full-color zoomed-in detail view...'. Reference the same product context and visual language as the hero. Describe the module's geometry, materials, key visible components, and spatial relationship to adjacent modules. Use VIVID, REALISTIC material colors from colorPalette (NOT grayscale, NOT monochrome). Use consistent color coding from visualStyle. Specify: isometric perspective, pure white background (#FFFFFF), full color, engineering aesthetic, ZERO text/labels/annotations. CRITICAL: NEVER dark backgrounds or grayscale."
  }
}

RULES:
- Output ONLY valid JSON — no markdown, no explanation
- modulePatch: ONLY include modules that need correction. Omit modules that are already consistent. Only adjust for cross-module consistency — do NOT rewrite engineering content.
  - Fix dimensional mismatches (module dimensions must fit within product envelope)
  - Align materials at interfaces (connected modules must agree on interface materials)
  - Correct proportional inconsistencies
- heroImagePrompt MUST be self-contained (300-500 words) — no references to other fields
- CRITICAL: heroImagePrompt and ALL perModuleImagePrompts must contain ZERO module names, part numbers, or technical labels. Image models render text as garbled characters. Describe components by geometry, position, and function only.
- perModuleImagePrompts: one entry per module (keyed by module ID), each 150-200 words
- heroImagePrompt and perModuleImagePrompts must be crafted TOGETHER — they are views of the same product
- perModuleImagePrompts should describe zoomed-in detail views that match the hero composition
- Use consistent color coding, material language, and perspective across ALL prompts
- Reference spatial relationships between modules (connected modules are physically adjacent)
- MIRROR PAIR SYMMETRY (MANDATORY, two parts):
  1. perModuleImagePrompts: For modules that are mirror pairs (one has mirrorOf pointing to the other, or they follow a Left/Right / Port/Starboard naming pattern like "Left Drive Module" / "Right Drive Module"), generate ONE shared per-module image prompt and assign the IDENTICAL prompt text to BOTH module IDs. Describe the geometry from a neutral perspective — avoid left/right directives since the overlay label distinguishes them. This guarantees visually identical illustrations for symmetric pairs.
  2. heroImagePrompt: Mirror pairs MUST share IDENTICAL colour, material, surface detail, and geometry in the hero narrative. Do NOT assign different colours to the two halves of a mirror pair (e.g. NOT "blue left wing, green right wing"; NOT "yellow port propulsion, orange starboard propulsion"). Describe the pair using one colour + one material, and where spatial positioning matters, describe it symmetrically ("wings of identical span and cell layout extending left and right from the fuselage, both rendered in <colour>"). The vision-QA gate on the hero will mark left/right colour asymmetry as a fail, so ensure the narrative commits to symmetric rendering.
- AIRCRAFT / UAV / DRONE HERO (apply when the product is a fixed-wing, rotary-wing, glider, HAPS, quadcopter, VTOL, airship, or other aerial vehicle — detect from subject text): the heroImagePrompt MUST describe a SINGLE coherent airframe. Propellers face FORWARD along the flight axis (not sideways off the wing tips). Propeller count must be plausible (typically 2 or 4 on a fixed-wing UAV; no odd extra pod-mounted engine). The empennage (tail) must be explicitly attached to the fuselage directly or via a visible tail boom — never floating detached. Wings attach to the fuselage at a wing root. Each part should appear exactly once (do NOT describe e.g. a battery pack both inside the fuselage AND outside as a separate module). These constraints align with the server-side vision-QA rubric; ignoring them will produce low-confidence heroes that fail QA.
- DIMENSIONAL DATA: Use dimensions from source data when available. When dimensions are NOT in the source data, ESTIMATE reasonable engineering dimensions based on the product type, industry standards, and common component sizes. The cadGeometryPrompt MUST contain explicit mm dimensions for every feature — vague proportional descriptions produce unusable CAD output.`

/**
 * Returns the system prompt for cross-module design reconciliation.
 *
 * @description Used in Phase 3 (after all modules are expanded) to reconcile
 * cross-module inconsistencies and craft unified image prompts. Replaces the
 * old design synthesis step with a more comprehensive reconciliation that also
 * produces per-module image prompts for visual consistency.
 */
export function getDesignReconciliationPrompt(): string {
  return DESIGN_RECONCILIATION_SYSTEM_PROMPT
}

// ─── Diagnostics pre-fill prompts ─────────────────────────────────────

const BASE_DIAGNOSTICS = `For each module, output exactly these 6 fields:
- mfg_process: One of: FDM 3D Print, SLA/Resin Print, SLS/Powder Print, CNC Machining, Sheet Metal, Injection Molding, Casting, Manual/Assembly, Other
- material: One of: PLA/PETG, ABS/Nylon, Resin (standard), Aluminum 6061, Steel (mild), Stainless Steel, Titanium, Copper/Brass, Carbon Fiber, Wood/Plywood, Other
- tolerance: One of: Loose (±1mm), Standard (±0.5mm), Precision (±0.1mm), Tight (±0.05mm), Ultra-tight (±0.01mm)
- surface_finish: One of: As-manufactured, Sanded/Deburred, Painted/Coated, Anodized, Polished, Plated, N/A
- batch_size: One of: Prototype (1–5), Small batch (10–50), Medium (50–500), Production (500+), Mass production (10k+)
- environment: One of: Indoor (office), Indoor (industrial), Outdoor (temperate), Outdoor (harsh), High temperature, Wet/Marine, Corrosive, Cleanroom, Space/Vacuum

Return a JSON object with two keys: "answers" and "enrichment".

"answers" maps module IDs to their diagnostic answers:
{
  "answers": {
    "motor_assembly": {
      "mfg_process": "CNC Machining",
      "material": "Aluminum 6061",
      "tolerance": "Precision (±0.1mm)",
      "surface_finish": "Anodized",
      "batch_size": "Small batch (10–50)",
      "environment": "Indoor (industrial)"
    }
  },
  "enrichment": {
    "motor_assembly": {
      "mfg_process": {
        "reason": "Tight tolerances on bearing seats require subtractive machining",
        "alternatives": [
          { "value": "Sheet Metal", "reason": "Housing could be bent but loses precision" },
          { "value": "Casting", "reason": "Viable at higher volumes but longer lead" }
        ]
      },
      "material": {
        "reason": "6061 balances machinability with thermal conductivity for motor heat",
        "alternatives": [
          { "value": "Stainless Steel", "reason": "Better corrosion resistance but heavier" }
        ]
      }
    }
  }
}

ENRICHMENT RULES:
- Keep reasons under 20 words. Focus on engineering rationale.
- Provide 1-3 ranked alternatives per field (best alternative first).
- Alternatives must be different from the chosen answer.
- Every module and every field must have an enrichment entry.

Only output valid JSON. No explanation.`

const DIAGNOSTICS_ROLE: Record<CadLabDomain, string> = {
  electronics:
    "You are an expert electronics manufacturing engineer. Given a research report and module list, recommend diagnostic answers for each module. Prefer PCB/Electronic material and appropriate tolerances for PCBA.",
  mechanical:
    "You are an expert manufacturing engineer. Given a research report and module list, recommend diagnostic answers for each module.",
  electromechanical:
    "You are an expert electromechanical manufacturing engineer. Given a research report and module list, recommend diagnostic answers for each module. Consider both structural and electrical/thermal environments.",
  fluid:
    "You are an expert fluid-systems manufacturing engineer. Given a research report and module list, recommend diagnostic answers for each module. Consider sealing, pressure, and corrosion in material and environment.",
}

export function getDiagnosticsSystemPrompt(domain: CadLabDomain): string {
  return `${DIAGNOSTICS_ROLE[domain]}\n\n${BASE_DIAGNOSTICS}`
}

// ─── H5: Domain-specific CadQuery code generation hints ─────────────

const CODE_GEN_DOMAIN_HINTS: Record<CadLabDomain, string> = {
  electronics: `DOMAIN-SPECIFIC GUIDANCE (Electronics & PCB):
- Use .rect() and .extrude() for PCB boards — typical thicknesses: 1.6mm (standard), 0.8mm (flex)
- Model component footprints as extruded rectangles with correct pin pitch (2.54mm DIP, 0.5/0.65mm SMD)
- Include standoff mounting holes at standard positions (M3 at corners, 3.2mm clearance holes)
- Heat sinks: use .rect() grid of .extrude() fins — 1-2mm thick, 5-15mm tall, 2-3mm spacing
- Connector cutouts: model to exact footprint dimensions (USB-C: 8.94×3.26mm, RJ45: 15.88×13.08mm)
- Edge clearances: 1mm minimum from board edge to copper, 5mm for connectors`,

  mechanical: `DOMAIN-SPECIFIC GUIDANCE (Mechanical & Structural):
- Wall thickness minimums: FDM 1.2mm (3 perimeters), CNC 0.8mm, sheet metal per gauge table
- Fillet all internal corners (min 0.5mm) to reduce stress concentrations — use .fillet() on individual parts BEFORE .union()
- Bolt holes: clearance = nominal + 0.5mm (M3→3.5mm, M4→4.5mm, M5→5.5mm)
- Counterbore pockets: head_diameter + 1mm clearance, head_height + 0.5mm depth
- Draft angles for injection molding: 1-2° on vertical walls
- Chamfer sharp external edges (0.5mm) for deburring and safety`,

  electromechanical: `DOMAIN-SPECIFIC GUIDANCE (Electromechanical & Robotics):
- NEMA motor mounting patterns: NEMA17 = 31mm square, M3 holes; NEMA23 = 47.14mm, M5 holes
- Bearing seats: use .circle().extrude() with press-fit tolerance (hole = bearing OD + 0.01mm)
- Shaft holes: clearance fit = shaft + 0.1mm, press fit = shaft - 0.02mm
- Wire routing channels: minimum 2× cable diameter width, smooth radii (no sharp bends < 5× cable dia)
- Motor mount bolt circles: match NEMA standard hole patterns exactly
- Battery compartments: add 1mm clearance per dimension, include cable egress notch`,

  fluid: `DOMAIN-SPECIFIC GUIDANCE (Fluid Systems):
- Pipe threads: model tap drill diameter (G1/4 = 11.5mm, G1/2 = 18.6mm, G3/4 = 24.1mm)
- O-ring grooves: use .circle().cut() with groove width = 1.4× cord dia, depth = 0.7× cord dia
- Sealing surfaces: must be flat — no .fillet() across seal faces
- Flow channels: minimum 2mm wall between adjacent channels for pressure integrity
- Port boss height: minimum 8mm for G1/4, 10mm for G1/2 to allow thread engagement
- Drain features: 1-2° slope on internal floors toward drain port`,
}

/**
 * Returns domain-specific CadQuery tips for code generation.
 *
 * @description Covers geometry patterns typical of each domain. Returns
 * empty string for unrecognised domains so callers can unconditionally append.
 *
 * @param domain - Detected CAD Lab domain
 * @returns Domain-specific hint text, or empty string
 */
export function getCodeGenDomainHints(domain: CadLabDomain): string {
  return CODE_GEN_DOMAIN_HINTS[domain] ?? ""
}
