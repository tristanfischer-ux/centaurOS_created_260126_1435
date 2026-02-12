"use server"

/**
 * @file cad-lab-claude.ts — Clean Claude CAD pipeline.
 *
 * @description Each step from CLAUDE_CAD_INSTRUCTIONS is a separate exported
 * function so the frontend can call them one-by-one and show live progress.
 *
 * Step 1a: searchWebDimensions  — Gemini + Google Search for real specs
 * Step 1b: searchCadReferences  — Thingiverse for existing models
 * Step 1c: synthesizeResearch   — Claude synthesizes into engineering report
 * Step 2:  generateInterface    — Claude writes text-only interface definition
 * Step 3:  generateCode         — Claude writes CadQuery code
 * Step 4:  executeOnModal       — Run code on Modal, get STEP+STL+SVG
 *
 * @security Server-side only. Uses admin API keys.
 */

import { checkRateLimit } from "@/lib/security/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { CAD_INSTRUCTIONS } from "@/lib/cad-instructions"
import { fetchLibrarySummary, formatLibraryForPrompt, prepareCodeWithLibrary } from "@/actions/component-library"
import type { LibraryComponentSummary } from "@/actions/component-library"
import type { Sector } from "@/types/foundry"

// ─── Types ───────────────────────────────────────────────────────────

export interface WebSearchResult {
  success: boolean
  error?: string
  specs: string
  sources: Array<{ uri: string; title: string }>
  timeMs: number
}

export interface CadSearchResult {
  success: boolean
  error?: string
  models: Array<{ name: string; url: string; description: string; thumbnail?: string }>
  timeMs: number
}

export interface SynthesisResult {
  success: boolean
  error?: string
  report: string
  timeMs: number
}

export interface InterfaceResult {
  success: boolean
  error?: string
  definition: string
  timeMs: number
}

export interface CodeResult {
  success: boolean
  error?: string
  code: string
  lines: number
  timeMs: number
}

export interface ExecutionResult {
  success: boolean
  error?: string
  svgIso?: string
  svgTop?: string
  svgFront?: string
  svgBack?: string
  svgLeft?: string
  svgRight?: string
  svgExploded?: string
  step?: string
  stl?: string
  bbox?: { xLen: number; yLen: number; zLen: number }
  massGrams?: number
  volumeMm3?: number
  stepSizeKb?: number
  stlSizeKb?: number
  fillRatio?: number
  /** Library components that were detected and prepended for execution */
  libraryComponents?: string[]
  timeMs: number
}

// ─── Auth helper ─────────────────────────────────────────────────────

/**
 * Checks authentication and rate limiting.
 *
 * @returns userId on success, or an error string
 */
async function authCheck(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const rateLimitError = await checkRateLimit("aiCadLab", `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError }

  return { userId: user.id }
}

/**
 * Looks up the authenticated user's foundry sector for component filtering.
 *
 * @returns The sector string or null if not set
 */
async function lookupUserSector(): Promise<Sector | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return null

    const { data: foundry } = await supabase
      .from('foundries')
      .select('sector')
      .eq('id', profile.foundry_id)
      .single()

    return (foundry?.sector as Sector) ?? null
  } catch {
    console.warn('[CadLabClaude] Failed to look up user sector, continuing without filter')
    return null
  }
}

// ─── Instructions (bundled as TypeScript constant) ───────────────────
// CAD_INSTRUCTIONS is imported from @/lib/cad-instructions
// This ensures it works on Vercel serverless (no filesystem access needed)

// ─── Step 1a: Web Search for Real Dimensions ─────────────────────────

/**
 * Searches the web for real-world product dimensions using Gemini + Google Search.
 *
 * @param description - Product to research
 * @returns Raw specs text and source URLs
 */
export async function searchWebDimensions(
  description: string,
): Promise<WebSearchResult> {
  const auth = await authCheck()
  if ("error" in auth) return { success: false, error: auth.error, specs: "", sources: [], timeMs: 0 }

  const start = Date.now()
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured")

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Find the real-world specifications for: ${description}

I need precise engineering dimensions for 3D CAD modelling. Search for:

1. OVERALL DIMENSIONS — length, width, height in mm (folded and unfolded if applicable)
2. WEIGHT — total weight and breakdown if available
3. MOTOR/ACTUATOR SPECS — diameter, height, mounting hole pattern (if it has motors)
4. KEY COMPONENT DIMENSIONS — individual part sizes in mm
5. CRITICAL CONSTRAINTS — key clearances, tolerances, interfaces
6. MATERIAL — primary materials and wall thicknesses
7. STANDARD PARTS — bolt sizes, pipe diameters, standards used

Format as a structured specification sheet with exact numbers in millimetres.
If a dimension is approximate, say so. If sources disagree, list both values.
Do NOT guess — only include measurements you found.`,
          }],
        }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = await response.json()
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    const groundingMeta = data.candidates?.[0]?.groundingMetadata
    const chunks: Array<{ web?: { uri?: string; title?: string } }> =
      groundingMeta?.groundingChunks ?? []
    const sources = chunks
      .filter((c): c is { web: { uri: string; title: string } } =>
        Boolean(c.web?.uri && c.web?.title),
      )
      .map((c) => ({ uri: c.web.uri, title: c.web.title }))

    return { success: true, specs: text, sources, timeMs: Date.now() - start }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Web search failed",
      specs: "",
      sources: [],
      timeMs: Date.now() - start,
    }
  }
}

// ─── Step 1b: CAD Model Reference Search ─────────────────────────────

/**
 * Searches Thingiverse for existing CAD models as dimensional references.
 *
 * @param description - Product to search for
 * @returns Matching models with name, URL, description, thumbnail
 */
export async function searchCadReferences(
  description: string,
): Promise<CadSearchResult> {
  const auth = await authCheck()
  if ("error" in auth) return { success: false, error: auth.error, models: [], timeMs: 0 }

  const start = Date.now()
  try {
    const token = process.env.THINGIVERSE_API_TOKEN
    if (!token) {
      return { success: true, models: [], timeMs: Date.now() - start }
    }

    const searchTerm = description
      .replace(/quadcopter|drone|3d model|cad/gi, "")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(" ")
      .trim() || description.slice(0, 30)

    const url = `https://api.thingiverse.com/search/${encodeURIComponent(searchTerm)}?type=things&per_page=5&sort=relevant`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      return { success: true, models: [], timeMs: Date.now() - start }
    }

    const data = await response.json()
    const hits: Array<{
      name?: string
      public_url?: string
      description?: string
      preview_image?: string
    }> = data?.hits ?? data ?? []

    const models = hits
      .filter((h): h is { name: string; public_url: string; description: string; preview_image?: string } =>
        Boolean(h.name && h.public_url),
      )
      .slice(0, 5)
      .map((h) => ({
        name: h.name,
        url: h.public_url,
        description: (h.description ?? "").slice(0, 200),
        thumbnail: h.preview_image,
      }))

    return { success: true, models, timeMs: Date.now() - start }
  } catch {
    return { success: true, models: [], timeMs: Date.now() - start }
  }
}

// ─── Step 1c: Synthesize Research Report ─────────────────────────────

/**
 * Claude synthesizes raw web specs + CAD references into a structured
 * engineering report with precise dimensions.
 *
 * @param description - Product description
 * @param webSpecs - Raw text from Gemini web search
 * @param cadModels - Reference models from Thingiverse
 * @returns Structured engineering research report
 */
export async function synthesizeResearch(
  description: string,
  webSpecs: string,
  cadModels: Array<{ name: string; url: string; description: string }>,
): Promise<SynthesisResult> {
  const auth = await authCheck()
  if ("error" in auth) return { success: false, error: auth.error, report: "", timeMs: 0 }

  const start = Date.now()
  try {
    const rawSections: string[] = []
    if (webSpecs.trim()) rawSections.push(`=== WEB SEARCH RESULTS ===\n${webSpecs}`)
    if (cadModels.length > 0) {
      const list = cadModels.map((m) => `- ${m.name}: ${m.url}\n  ${m.description}`).join("\n")
      rawSections.push(`=== THINGIVERSE CAD MODELS ===\n${list}`)
    }

    const systemPrompt = `You are a senior mechanical engineer preparing a research brief for a 3D CAD modelling project. Synthesize raw research data into a precise, structured engineering specification.

Output format (follow exactly):

# Engineering Research Report: {Product Name}

## Executive Summary
One paragraph: what this product is, its primary function, and its physical characteristics.

## Overall Dimensions
- Folded: W x D x H mm (if applicable)
- Unfolded/Deployed: W x D x H mm
- Weight: X g

## Primary Structure
Main body/frame with precise dimensions. Wall thickness, material if known.

## Components
For each major component:
- **Name**: exact dimensions (W x D x H mm or dia x H mm)
- Position relative to body center
- Mounting/attachment method
- Quantity

## Critical Constraints
- Key critical dimensions with values
- Clearance requirements
- Symmetry/alignment requirements

## Material & Manufacturing Notes
Materials, wall thicknesses, manufacturing method.

## Dimensional Confidence
Rate each major dimension:
- Confirmed (from official specs or multiple sources)
- Approximate (single source or estimated)
- Unknown (not found)

RULES:
- Use millimetres for all dimensions
- Round to nearest 0.5mm
- If sources disagree, state both
- Never invent a dimension — mark as Unknown
- Include source attribution for key numbers`

    const result = await callClaude(
      systemPrompt,
      `Product: ${description}\n\n${rawSections.join("\n\n")}`,
    )

    return { success: true, report: result.text, timeMs: Date.now() - start }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Synthesis failed",
      report: "",
      timeMs: Date.now() - start,
    }
  }
}

// ─── Step 2: Interface Definition ────────────────────────────────────

/**
 * Claude generates the text-only interface definition: space budget,
 * component placement table, connection map, validation checklist.
 *
 * @param description - Product description
 * @param researchReport - Engineering report from Step 1
 * @returns Interface definition text
 */
export async function generateInterface(
  description: string,
  researchReport: string,
): Promise<InterfaceResult> {
  const auth = await authCheck()
  if ("error" in auth) return { success: false, error: auth.error, definition: "", timeMs: 0 }

  const start = Date.now()
  try {
    // Look up user's sector for component filtering
    const sector = await lookupUserSector()
    // Fetch library summary filtered by sector
    const librarySummary = await fetchLibrarySummary(sector)
    const librarySection = librarySummary.length > 0
      ? buildLibrarySectionForInterface(librarySummary)
      : ""

    const systemPrompt = `You are an engineering planner for parametric CAD models. You are NOT writing code — this is pure engineering planning.

Produce a text-only interface definition. Every dimension must be a specific number in millimetres. Numbers must sum correctly — show ALL arithmetic step-by-step.

Output EXACTLY these 5 sections:

=== a) SPACE BUDGET ===
How components stack/fit within the overall envelope. Must add up arithmetically.
Show: base_z + component1_h + gap + component2_h + ... = total_h

Rule: if the numbers don't add up in text, they won't add up in 3D.

=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Dimensions (mm) | Position (x,y,z) | Source | Notes |
|-----------|-----|-----------------|-------------------|--------|-------|
One row per unique component type. Position is centre point.
Minimum 6 unique component types.

The "Source" column MUST be one of:
  - "LIBRARY: slug_name" — if a pre-built library component matches (use the exact slug)
  - "CUSTOM" — if no library component matches and custom geometry is needed

For LIBRARY components, use their default dimensions or override with product-specific values.
For CUSTOM components, you define the geometry from scratch.

=== c) CONNECTION MAP ===
For assemblies with flows (water, air, electrical, structural), trace COMPLETE paths.
If no flows apply: "N/A — Static assembly with no flow paths"

=== d) VALIDATION CHECKLIST ===
Boolean checks. All must pass before writing geometry.
Example:
  - [ ] Magazine ID (39mm) > capsule flange (37mm) — clearance
  - [ ] 10 capsules x 29mm = 290mm < tube height 315mm — fits

=== e) LIBRARY USAGE SUMMARY ===
List which library components will be used and which need custom geometry:
  LIBRARY: [list of slug names that match components in this product]
  CUSTOM: [list of components that need custom make_*() functions]

CRITICAL RULES:
- SHOW ALL ARITHMETIC step-by-step
- Every position calculated from named quantities, not eyeballed
- Components must not overlap spatially
- DO NOT WRITE ANY CODE
- Use the research report dimensions exactly — do not invent new numbers
- ALWAYS check the component library FIRST before planning custom geometry
- Prefer library components over custom geometry — they produce recognisable, detailed parts

ARCHITECTURAL / BUILDING MODELS (houses, cabins, buildings, shelters):
If the product is a building or architectural structure, you MUST also plan:
1. SUB-ASSEMBLY GROUPS: Divide components into 6-10 groups (e.g. Foundation, Structure, Envelope, Roof, Interior Partitions, Doors/Windows, Stairs, Fixtures, Furniture, Landscaping). Each group will be unioned separately, then groups unioned together. This is critical for CadQuery performance.
2. COMPONENT COUNT CAP: Maximum 50 unique make_*() functions total. You have headroom for detailed buildings — model walls, floors, roof, stairs, doors, windows, and furniture as separate functions where it improves clarity.
3. UNION BUDGET: Plan for max 80 total .union() calls and max 40 total .cut() calls across the entire script. Count them in the validation checklist.
4. SIMPLIFICATION RULES: No individual balusters (use solid panels), no individual joists/rafters (use representative samples max 15), no decorative elements under 50mm, no fillets.
5. GABLE STRATEGY: Plan gable walls as "box + cut" not "wire profile" — note this in the table.
6. FURNITURE IS OPTIONAL: If the structure already has 40+ boolean operations, mark furniture as "SKIP — complexity budget exceeded" in the component table. Otherwise, include up to 10 furniture/fixture items.
7. In the Space Budget, show floor plan zones along each axis clearly.
8. TIMEOUT AWARENESS: The CadQuery execution has a 10-minute hard limit. Every union/cut adds time. Plan for simplicity — a clean model that renders is better than a detailed one that times out. Use CadQuery Assembly objects where possible to avoid boolean operations entirely.
9. ASSEMBLY API STRATEGY: For large buildings (20+ components), prefer using cq.Assembly() to place sub-assemblies spatially without boolean unions. Only union within small sub-groups (max 10 unions per group), then add each sub-group to the Assembly. Export the Assembly as the final result. This is dramatically faster than chaining .union() calls.
${librarySection}`

    const result = await callClaude(
      systemPrompt,
      `Product: ${description}\n\nResearch Report (use these dimensions — do not invent new ones):\n${researchReport}\n\nGenerate the complete interface definition.`,
      "claude-sonnet-4-5-20250929",
      8192,
    )

    return { success: true, definition: result.text, timeMs: Date.now() - start }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Interface generation failed",
      definition: "",
      timeMs: Date.now() - start,
    }
  }
}

/**
 * Builds a compact library reference for the interface definition step.
 * Lists available component slugs grouped by domain so the planner can
 * annotate which parts come from the library vs need custom geometry.
 *
 * @param components - Library component summaries from Supabase
 * @returns Formatted text block for the system prompt
 */
function buildLibrarySectionForInterface(
  components: LibraryComponentSummary[],
): string {
  // Group by tier for compact display
  const byTier: Record<string, LibraryComponentSummary[]> = {}
  for (const c of components) {
    const key = c.tier === "universal" ? "Universal" :
      c.tier === "electromechanical" ? "Electromechanical" : "Domain-Specific"
    if (!byTier[key]) byTier[key] = []
    byTier[key].push(c)
  }

  const sections: string[] = []
  for (const [tierLabel, items] of Object.entries(byTier)) {
    const slugList = items.map((c) => `${c.slug} (${c.name})`).join(", ")
    sections.push(`  ${tierLabel}: ${slugList}`)
  }

  return `
AVAILABLE COMPONENT LIBRARY (${components.length} pre-built parts):
${sections.join("\n")}

When a product component matches a library slug, mark it as "LIBRARY: slug_name" in the Source column.`
}

// ─── Step 3: Generate CadQuery Code ──────────────────────────────────

/**
 * Claude writes complete CadQuery Python code in a single pass,
 * following the full CLAUDE_CAD_INSTRUCTIONS methodology.
 *
 * @param description - Product description
 * @param researchReport - Engineering report
 * @param interfaceDefinition - Interface definition from Step 2
 * @returns Complete Python code
 */
export async function generateCode(
  description: string,
  researchReport: string,
  interfaceDefinition: string,
): Promise<CodeResult> {
  const auth = await authCheck()
  if ("error" in auth) return { success: false, error: auth.error, code: "", lines: 0, timeMs: 0 }

  const start = Date.now()
  try {
    // Look up user's sector for component filtering
    const sector = await lookupUserSector()
    // Fetch available library components filtered by sector
    const librarySummary = await fetchLibrarySummary(sector)
    const libraryPromptSection = await formatLibraryForPrompt(librarySummary)

    const systemPrompt = `You are an expert CadQuery engineer generating production-quality parametric CAD models. Follow the methodology in this document EXACTLY — every rule was learned from real failures:

${CAD_INSTRUCTIONS}

${libraryPromptSection}

CRITICAL EXECUTION ENVIRONMENT RULES:
1. The LAST line of your script MUST be: result = <your_assembly_variable>
   where result is a cq.Workplane object. The execution sandbox looks for this variable.
2. Do NOT call cq.exporters.export() — the sandbox handles all file exports automatically.
3. Do NOT use print() — stdout is not captured.
4. Do NOT import os, sys, or use open(). Only import cadquery and math.
5. Output ONLY the Python code inside a single \`\`\`python code fence.

GEOMETRY SAFETY RULES (these prevent runtime crashes in CadQuery):
- NEVER use Workplane("XZ") or Workplane("YZ") — they cause coordinate confusion. Always start from Workplane("XY") and use .transformed(rotate=(...)) to change orientation.
- NEVER use .intersect() with wire profiles (.moveTo/.lineTo/.close) — this produces degenerate geometry and crashes. Use .cut() with simple solid shapes instead.
- For aerodynamic or tapered shapes, use one of these SAFE patterns:
  a) .loft() between exactly 2 cross-sections (bottom profile → top profile)
  b) .cut() with angled boxes to carve away material
  c) Sketch API: .sketch().rect(w,d).vertices().fillet(r).finalize().extrude(h) for rounded shapes
- NEVER use .intersect() at all — it is fragile. Use .cut() to subtract material instead.
- NEVER use .sweep() — it crashes on complex paths.
- NEVER use .rotate() or .translate() — use .transformed(offset=...) and .workplane(offset=z).
- Fillet only BEFORE union, only on simple geometry, max 3mm radius.
- Guard against zero/negative dimensions: use max(value, minimum) for any computed dimension.

ASSEMBLY CONNECTION RULES (prevent floating/disconnected parts):
- When using .union() to assemble components, the two solids MUST physically overlap by at least 1-2mm. If they don't touch, CadQuery produces disconnected geometry that floats in the STL.
- For arms/struts connecting to a body: extend the arm geometry 2-3mm INTO the body so the solids overlap. A hinge boss on the body and a boss on the arm end must penetrate each other.
- For mounted sub-assemblies (gimbal, camera, antenna): add a mounting strut or bracket that physically bridges the gap and overlaps both the mount point and the sub-assembly.
- NEVER rely on two surfaces merely touching at a face — they must volumetrically intersect.
- Test mentally: "If I pulled this part, would it slide out freely or is it embedded?" Every part must be embedded.
- Common mistake: positioning a component at coordinates near another component but with a small gap. Always add overlap_margin = 2.0 mm and extend connecting geometry by that amount.

ARCHITECTURAL / BUILDING MODEL RULES (for houses, buildings, structures):
When building architectural models (houses, cabins, shelters, buildings), follow these additional rules:

⚠️ EXECUTION BUDGET: Building models MUST complete CadQuery execution within 10 minutes.
Every extra union/cut adds time. Keep geometry simple — prefer boxes over complex shapes.
If in doubt, simplify further. A clean simple model is better than a complex one that times out.
For large buildings (20+ components), use cq.Assembly() instead of chaining .union() calls — see Assembly API section below.

WALL CONSTRUCTION:
- Build ALL walls as simple box extrusions on the XY plane: .box(width, thickness, height)
- NEVER use wire profiles (.moveTo/.lineTo/.close) for wall shapes
- Cut window and door openings INTO the walls using .cut() with box shapes
- Extend cut boxes 20mm wider than the wall thickness to ensure clean boolean operations
- Combine all exterior walls of one side into a SINGLE box where possible (reduces unions)

GABLE WALLS (triangular sections above eave line):
- NEVER build gables using wire profiles or .moveTo/.lineTo/.close — this crashes CadQuery
- Instead, build a rectangular box above the eave line, then CUT away the angled portions:
  gable_block = box(full_width, wall_thickness, roof_rise)  // rectangular block above eave
  left_cut = angled box positioned and rotated to remove left triangle
  right_cut = angled box positioned and rotated to remove right triangle
  gable = gable_block.cut(left_cut).cut(right_cut)
- Alternatively, skip gable walls entirely and let the roof panels close the ends

ROOF CONSTRUCTION:
- Build each roof slope as a single rotated box: .transformed(rotate=(0, pitch_angle, 0)).box(...)
- Two roof slopes + a ridge cap is sufficient for a pitched roof
- Flat roofs are just horizontal boxes

SUB-ASSEMBLY STRATEGY (critical for performance):
- Do NOT union all building components into one mega-solid sequentially
- Instead, group components into 6-10 SUB-ASSEMBLIES and union within each group:
  structure = foundation.union(floor).union(walls).union(roof)
  interior = partitions.union(doors).union(stairs)
  fixtures = kitchen.union(bathroom)
  result = structure.union(interior).union(fixtures)
- This produces the same result but is dramatically faster and less error-prone
- Within each sub-assembly, keep to MAX 10 union operations

ASSEMBLY API (preferred for large buildings with 20+ components):
- For large buildings, use cq.Assembly() instead of .union() chains:
  assy = cq.Assembly()
  assy.add(foundation, name="foundation", loc=cq.Location((0, 0, 0)))
  assy.add(floor_slab, name="floor", loc=cq.Location((0, 0, foundation_h)))
  assy.add(ext_walls, name="walls", loc=cq.Location((0, 0, foundation_h + slab_h)))
  assy.add(roof, name="roof", loc=cq.Location((0, 0, wall_top_z)))
  assy.add(interior_group, name="interior", loc=cq.Location((0, 0, foundation_h + slab_h)))
  assy.add(furniture_group, name="furniture", loc=cq.Location((0, 0, foundation_h + slab_h)))
- Each sub-group can still use .union() internally (e.g. all exterior walls unioned into one solid)
- But the top-level assembly uses spatial placement, not boolean operations
- This is DRAMATICALLY faster — O(n) instead of O(n²) for n components
- To export: result = assy.toCompound()  # converts Assembly to a single Compound for STEP/STL export
- Parts in an Assembly do NOT need to physically overlap (unlike .union())

UNION BUDGET:
- Maximum 80 total .union() calls across the ENTIRE script
- Maximum 40 total .cut() calls across the ENTIRE script
- Count them mentally before writing code. If you exceed these limits, use cq.Assembly() for top-level composition.
- Example: instead of 4 separate wall functions unioned one-by-one, make ONE make_all_exterior_walls()
  function that builds them as a single compound solid, then add it to the Assembly
- For buildings with 20+ components: use cq.Assembly() at the top level and only .union() within sub-groups

FURNITURE AND FIXTURES (OPTIONAL — skip if structure already complex):
- If the structure sub-assembly already has 40+ union/cut operations, SKIP furniture entirely
- If included, simplify furniture to 1-2 primitive shapes each (a bed = box + headboard box)
- Do NOT model individual balusters/spindles — use a solid panel
- Skip ALL decorative details (towel rails, light fixtures, switches, handles)
- Cap any loop that creates repeated elements (balusters, joists, rafters) to MAX 15 items
- Maximum 10 furniture/fixture items total
- Add furniture as a separate sub-group in the Assembly (not unioned into the structure)

DIMENSIONAL SANITY:
- Building dimensions are in mm (a house is typically 3000-12000mm per axis)
- Always verify your bounding box mentally: a 6m × 12m house = 6000 × 12000 × ~5500mm
- If any dimension exceeds 25000mm, something is wrong — likely doubled geometry
- AVOID fillets entirely on buildings — they are the #1 cause of CadQuery hangs on large geometry

CODE QUALITY REQUIREMENTS:
- Every component from the interface definition MUST have its own make_*() function.
- Each function must contain REAL geometry (circles, extrudes, cuts, lofts) — not stubs or placeholders.
- Include detailed inline comments explaining what each section builds.
- Typical complete models are 400-800+ lines. Do NOT generate abbreviated or skeleton code.
- If the interface definition lists 10 components, you must model all 10 with real geometry.
- For complex body shapes (e.g. aerodynamic fuselage), use a rounded-rect extrusion as the base, then .cut() with angled solids to create tapers. Do NOT try to create complex wire profiles.`

    const result = await callClaude(
      systemPrompt,
      `Build a COMPLETE, DETAILED parametric CAD model of: ${description}

=== RESEARCH REPORT (use these real dimensions — do NOT invent dimensions) ===
${researchReport}

=== INTERFACE DEFINITION (implement EVERY component listed here) ===
${interfaceDefinition}

Generate the FULL CadQuery Python code. Requirements:
1. Start with "import cadquery as cq" and "import math" (if needed)
2. Define ALL primary parameters at the top with comments showing source dimensions
3. Calculate ALL derived values from primary parameters (never hardcode derived values)
4. Create a make_*() function for EACH component in the interface definition
5. Each function must build REAL geometry — no empty stubs, no "pass", no TODOs
6. Use the assembly pattern: assy = None, then add() each component via union
7. Include validation checks that verify dimensional constraints
8. The LAST line MUST be exactly: result = assy (for Workplane) or result = assy.toCompound() (for Assembly)

This code will be executed in a CadQuery sandbox. The "result" variable must be a cq.Workplane or cq.Compound containing the complete assembled model. If using cq.Assembly(), call .toCompound() to convert it.`,
      "claude-opus-4-6",
      64000,
    )

    let code = extractCode(result.text)

    // Safety: strip calls that would break the sandbox
    code = code
      .split("\n")
      .filter((line: string) => {
        const s = line.trim()
        if (/^print\s*\(/.test(s)) return false
        if (s.startsWith("import os") || s.startsWith("from os")) return false
        if (s.includes("cq.exporters")) return false
        return true
      })
      .join("\n")

    // Safety net: ensure the code ends with `result = assy` (or similar)
    // The Modal worker searches for a cq.Workplane in the namespace
    const hasResultAssignment = /^result\s*=/m.test(code)
    if (!hasResultAssignment) {
      // Check common assembly variable names from the CAD instructions
      const hasAssy = /^assy\s*=/m.test(code)
      const hasAssembly = /^assembly\s*=/m.test(code)
      const hasModel = /^model\s*=/m.test(code)
      if (hasAssy) {
        code += "\n\n# Expose assembly to execution sandbox\nresult = assy\n"
      } else if (hasAssembly) {
        code += "\n\n# Expose assembly to execution sandbox\nresult = assembly\n"
      } else if (hasModel) {
        code += "\n\n# Expose assembly to execution sandbox\nresult = model\n"
      }
      // If none found, the Modal worker will still search for any cq.Workplane
    }

    return {
      success: true,
      code,
      lines: code.split("\n").length,
      timeMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Code generation failed",
      code: "",
      lines: 0,
      timeMs: Date.now() - start,
    }
  }
}

// ─── Step 4: Execute on Modal ────────────────────────────────────────

/**
 * Sends CadQuery code to Modal for execution. Returns STEP, STL, SVG exports.
 *
 * @param code - Complete CadQuery Python code
 * @returns Execution results with exported files and analysis
 */
export async function executeCode(code: string): Promise<ExecutionResult> {
  const auth = await authCheck()
  if ("error" in auth) return { success: false, error: auth.error, timeMs: 0 }

  const start = Date.now()
  try {
    // Detect and prepend library component functions before execution
    const { combinedCode, libraryComponents } = await prepareCodeWithLibrary(code)
    if (libraryComponents.length > 0) {
      console.info("[CadLabClaude] Library components prepended:", {
        count: libraryComponents.length,
        slugs: libraryComponents,
      })
    }

    const endpointUrl = process.env.MODAL_CAD_ENDPOINT_URL
    if (!endpointUrl) throw new Error("MODAL_CAD_ENDPOINT_URL not configured")

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: combinedCode, module_id: "cad-lab-claude", material_density: 1240 }),
      signal: AbortSignal.timeout(600_000), // 10 min — building models need extended execution time
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Modal error (${response.status}): ${errText.slice(0, 300)}`)
    }

    const data = await response.json()

    if (data.error && !data.svg_iso) {
      return { success: false, error: data.error, timeMs: Date.now() - start }
    }

    const mp = data.analysis?.mass_properties
    const bb = mp?.bounding_box
    const vol = mp?.volume_mm3 ?? 0
    const bbVol = bb ? bb.xLen * bb.yLen * bb.zLen : 0

    return {
      success: true,
      svgIso: data.svg_iso ? `data:image/svg+xml;base64,${data.svg_iso}` : undefined,
      svgTop: data.svg_top ? `data:image/svg+xml;base64,${data.svg_top}` : undefined,
      svgFront: data.svg_front ? `data:image/svg+xml;base64,${data.svg_front}` : undefined,
      svgBack: data.svg_back ? `data:image/svg+xml;base64,${data.svg_back}` : undefined,
      svgLeft: data.svg_left ? `data:image/svg+xml;base64,${data.svg_left}` : undefined,
      svgRight: data.svg_right ? `data:image/svg+xml;base64,${data.svg_right}` : undefined,
      svgExploded: data.svg_exploded ? `data:image/svg+xml;base64,${data.svg_exploded}` : undefined,
      step: data.step ? "available" : undefined,
      stl: data.stl ?? undefined,
      bbox: bb ? { xLen: Math.round(bb.xLen), yLen: Math.round(bb.yLen), zLen: Math.round(bb.zLen) } : undefined,
      massGrams: mp?.mass_kg ? Math.round(mp.mass_kg * 1000 * 10) / 10 : undefined,
      volumeMm3: vol ? Math.round(vol) : undefined,
      stepSizeKb: data.step ? Math.round(atob(data.step).length / 1024) : undefined,
      stlSizeKb: data.stl ? Math.round(atob(data.stl).length / 1024) : undefined,
      fillRatio: bbVol > 0 ? Math.round((vol / bbVol) * 1000) / 10 : undefined,
      libraryComponents: libraryComponents.length > 0 ? libraryComponents : undefined,
      error: data.error ?? undefined,
      timeMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Execution failed",
      timeMs: Date.now() - start,
    }
  }
}

// ─── Internal helpers ────────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  modelId: string = "claude-opus-4-6",
  maxTokens: number = 64000,
): Promise<{ text: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(600_000), // 10 min — large building models produce longer code generation
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data = await response.json()
  return { text: data.content?.[0]?.text ?? "" }
}

function extractCode(text: string): string {
  if (text.includes("```python")) {
    return text.split("```python")[1]?.split("```")[0]?.trim() ?? text.trim()
  }
  if (text.includes("```")) {
    return text.split("```")[1]?.split("```")[0]?.trim() ?? text.trim()
  }
  return text.trim()
}
