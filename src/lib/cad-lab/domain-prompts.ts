/**
 * @file domain-prompts.ts
 *
 * @description Domain-specific prompt libraries for the CAD Lab pipeline.
 * Auto-detect domain from research report or product description, then select
 * electronics, mechanical, electromechanical, or fluid-specific prompts.
 *
 * @related src/actions/cad-lab.ts
 */

export type CadLabDomain = "electronics" | "mechanical" | "electromechanical" | "fluid"

const DOMAIN_VALUES: CadLabDomain[] = ["electronics", "mechanical", "electromechanical", "fluid"]

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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return "mechanical"

  const truncated = text.slice(0, 8000)
  const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    signal: AbortSignal.timeout(15_000),
  })

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
- Include source attribution for key numbers`

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

Output STRICTLY as a JSON array with this exact structure for each module:

[
  {
    "id": "lowercase_no_spaces",
    "name": "Human Readable Name",
    "purpose": "One sentence: what this module does",
    "inputs": ["Input stream or signal 1", "Input 2"],
    "outputs": ["Output stream or signal 1"],
    "keyParts": ["Part 1 with spec", "Part 2 with spec", "Part 3"],
    "leadWeeks": 6,
    "description": "1-2 paragraph technical description of what this module physically is, its operating principle, and key material choices.",
    "whyItMatters": "Why this module is critical to the overall system.",
    "failureModes": ["Failure mode 1", "Failure mode 2"],
    "unknowns": ["Open question 1", "Open question 2"]
  }
]

RULES:
- Generate 4-8 modules (more for complex products, fewer for simple ones)
- Each module MUST have at least 3 keyParts
- leadWeeks should be realistic (1-2 for off-the-shelf, 4-8 for custom, 12+ for specialised)
- Every module must have at least 1 input and 1 output
- Modules should cover the ENTIRE product — no gaps
- Use dimensions from the research report — do not invent new ones
- If the research report mentions sub-components, those are good module candidates
- Output ONLY the JSON array — no markdown, no explanation`

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

// ─── Diagnostics pre-fill prompts ─────────────────────────────────────

const BASE_DIAGNOSTICS = `For each module, output exactly these 6 fields:
- mfg_process: One of: FDM 3D Print, SLA/Resin Print, SLS/Powder Print, CNC Machining, Sheet Metal, Injection Molding, Casting, Manual/Assembly, Other
- material: One of: PLA/PETG, ABS/Nylon, Aluminium, Steel/Iron, Stainless Steel, Copper/Brass, Titanium, Carbon Fiber Composite, CFRP/GFRP, Wood/Plywood, Silicone/Rubber, Glass/Ceramic, PCB/Electronic, Other
- tolerance: One of: ±1mm (hobby), ±0.5mm (standard), ±0.1mm (precision), ±0.01mm (ultra-precision)
- surface_finish: One of: As-printed (rough), Sanded/Deburred, Painted/Coated, Anodised/Plated, Polished (mirror), Textured (mold)
- batch_size: One of: 1-10 (prototyping), 10-100 (small batch), 100-1000 (pilot), 1000-10000 (production), 10000+ (mass production)
- environment: One of: Indoor (office/home), Indoor (industrial), Outdoor (sheltered), Outdoor (exposed), High-temp (>80°C), Wet/Submerged, Food-safe, Medical/Cleanroom

Return a JSON object mapping module IDs to their answers. Example:
{
  "motor_assembly": {
    "mfg_process": "CNC Machining",
    "material": "Aluminium",
    "tolerance": "±0.1mm (precision)",
    "surface_finish": "Anodised/Plated",
    "batch_size": "10-100 (small batch)",
    "environment": "Indoor (industrial)"
  }
}

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
