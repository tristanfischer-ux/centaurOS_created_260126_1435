"use server"

/**
 * @file component-library.ts — Server actions for the component geometry library.
 *
 * @description Provides access to the reusable component library stored in Supabase.
 * Two primary functions:
 * - fetchLibrarySummary(): Returns a compact text summary of all available library
 *   components for injection into Claude's code generation prompt.
 * - fetchLibraryCode(): Given an array of slugs, returns the full CadQuery source
 *   code for each, ready to prepend to generated scripts before execution.
 *
 * @security Server-side only. Uses authenticated Supabase client.
 */

import { createClient } from "@/lib/supabase/server"

// ─── Types ───────────────────────────────────────────────────────────

/** Compact summary of a library component for prompt injection */
export interface LibraryComponentSummary {
  slug: string
  name: string
  category: string
  tier: string
  paramSchema: Record<string, unknown>
  defaultColour: string
  description: string | null
}

/** Full component code fetched for execution prepending */
export interface LibraryComponentCode {
  slug: string
  cadqueryCode: string
}

// ─── All available library function slugs (for detection) ───────────

const LIBRARY_FUNCTION_SLUGS = [
  "hex_bolt",
  "hex_nut",
  "socket_head_cap_screw",
  "washer",
  "heat_set_insert",
  "standoff",
  "ball_bearing",
  "sleeve_bearing",
  "usb_c_receptacle",
  "barrel_jack",
  "jst_connector",
  "round_tube",
  "square_tube",
  "l_bracket",
  "brushless_motor_outrunner",
  "brushless_motor_pancake",
  "stepper_motor_nema",
  "pcb_board",
  "tactile_switch",
  "axial_fan",
  "centrifugal_pump",
] as const

export type LibrarySlug = (typeof LIBRARY_FUNCTION_SLUGS)[number]

// ─── fetchLibrarySummary ─────────────────────────────────────────────

/**
 * Fetches a compact summary of all available component geometry types.
 * Used to inject a "COMPONENT LIBRARY" section into Claude's prompt.
 *
 * @returns Array of component summaries with slug, name, param schema, etc.
 * @throws If Supabase query fails
 */
export async function fetchLibrarySummary(): Promise<LibraryComponentSummary[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("component_geometry_types")
    .select("slug, name, category, tier, param_schema, default_colour, description")
    .eq("verified", true)
    .order("tier")
    .order("category")

  if (error) {
    console.error("[ComponentLibrary] Failed to fetch library summary:", {
      error: error.message,
      code: error.code,
    })
    return []
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    category: row.category,
    tier: row.tier,
    paramSchema: row.param_schema as Record<string, unknown>,
    defaultColour: row.default_colour ?? "#888888",
    description: row.description,
  }))
}

// ─── fetchLibraryCode ────────────────────────────────────────────────

/**
 * Fetches the full CadQuery source code for specific component types.
 * Called before execution to prepend library functions to the generated script.
 *
 * @param slugs - Array of component type slugs to fetch code for
 * @returns Array of {slug, cadqueryCode} pairs
 * @throws If Supabase query fails
 */
export async function fetchLibraryCode(
  slugs: string[],
): Promise<LibraryComponentCode[]> {
  if (slugs.length === 0) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("component_geometry_types")
    .select("slug, cadquery_code")
    .in("slug", slugs)

  if (error) {
    console.error("[ComponentLibrary] Failed to fetch library code:", {
      slugs,
      error: error.message,
      code: error.code,
    })
    return []
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    cadqueryCode: row.cadquery_code,
  }))
}

// ─── formatLibraryForPrompt ──────────────────────────────────────────

/**
 * Formats the library summary into a text block suitable for injection
 * into Claude's system prompt during code generation.
 *
 * @param components - Array of library component summaries
 * @returns Formatted text block listing all available components
 */
export async function formatLibraryForPrompt(
  components: LibraryComponentSummary[],
): Promise<string> {
  if (components.length === 0) return ""

  const lines = components.map((c) => {
    const params = Object.entries(c.paramSchema)
      .map(([key, schema]) => {
        const s = schema as Record<string, unknown>
        const def = s.default !== undefined ? ` (default: ${s.default})` : ""
        const unit = s.unit ? ` ${s.unit}` : ""
        return `${key}${unit}${def}`
      })
      .join(", ")

    return `  - ${c.slug}(params) — ${c.name} [${c.category}]\n    Params: {${params || "none"}}\n    Colour: ${c.defaultColour}`
  })

  return `COMPONENT LIBRARY — REUSABLE PARTS:
The following ${components.length} pre-built CadQuery functions are available in the execution
environment. For standard components (motors, fasteners, bearings, connectors, tubes,
brackets, PCBs, switches, fans, pumps), call these functions instead of writing geometry
from scratch. Each function takes a single params dict and returns a cq.Workplane
centered at origin, base at Z=0.

Available components:
${lines.join("\n")}

LIBRARY USAGE RULES:
- Call library functions directly: motor = brushless_motor_outrunner({"od": 34.5, "height": 13.5, "shaft_d": 5, "shaft_h": 8, "bolt_pcd": 19, "bolt_count": 4, "bolt_size": 3})
- Position the returned Workplane using .union() with .transformed(offset=(...)) for placement
- The library functions are pre-loaded — do NOT redefine them in your code
- For product-specific custom geometry (enclosures, frames, unique shapes), write make_*() functions as usual
- You CAN pass custom parameters to override defaults for any library function
- Library parts produce RECOGNISABLE geometry (visible bolt threads, motor windings, bearing balls, etc.) — much better than simple cylinder/box approximations`
}

// ─── detectLibraryUsage ──────────────────────────────────────────────

/**
 * Scans generated CadQuery code to detect which library functions it calls.
 * Uses simple regex matching against known function names.
 *
 * @param code - Generated CadQuery Python code
 * @returns Array of library slugs that appear as function calls in the code
 */
export async function detectLibraryUsage(code: string): Promise<string[]> {
  const used: string[] = []

  for (const slug of LIBRARY_FUNCTION_SLUGS) {
    // Match function calls like: hex_bolt({...}) or hex_bolt(params)
    const pattern = new RegExp(`\\b${slug}\\s*\\(`, "m")
    if (pattern.test(code)) {
      used.push(slug)
    }
  }

  return used
}

// ─── prepareCodeWithLibrary ──────────────────────────────────────────

/**
 * Prepares generated code for execution by prepending required library
 * function definitions. Detects which library functions are used in the
 * code, fetches their source from Supabase, and prepends them.
 *
 * @param code - Generated CadQuery Python code from Claude
 * @returns Object with the combined code and list of library slugs used
 */
export async function prepareCodeWithLibrary(
  code: string,
): Promise<{ combinedCode: string; libraryComponents: string[] }> {
  // Detect which library functions the code calls
  const usedSlugs = await detectLibraryUsage(code)

  if (usedSlugs.length === 0) {
    return { combinedCode: code, libraryComponents: [] }
  }

  // Fetch the source code for used functions
  const libraryCode = await fetchLibraryCode(usedSlugs)

  if (libraryCode.length === 0) {
    return { combinedCode: code, libraryComponents: [] }
  }

  // Build the library preamble
  const preambleLines = [
    "# ═══════════════════════════════════════════════════════════════",
    "# ForgeOS Component Library — Pre-loaded standard components",
    `# ${libraryCode.length} library functions injected automatically`,
    "# ═══════════════════════════════════════════════════════════════",
    "",
    "import cadquery as cq",
    "import math",
    "",
  ]

  for (const comp of libraryCode) {
    preambleLines.push(
      `# ─── Library: ${comp.slug} ────`,
      comp.cadqueryCode.trim(),
      "",
    )
  }

  preambleLines.push(
    "# ═══════════════════════════════════════════════════════════════",
    "# END OF LIBRARY — Generated code follows",
    "# ═══════════════════════════════════════════════════════════════",
    "",
  )

  // Remove duplicate import lines from the generated code since the library preamble has them
  const cleanedCode = code
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim()
      // Remove duplicate imports that the preamble already provides
      if (trimmed === "import cadquery as cq") return false
      if (trimmed === "import math") return false
      return true
    })
    .join("\n")

  const combinedCode = preambleLines.join("\n") + cleanedCode

  return {
    combinedCode,
    libraryComponents: usedSlugs,
  }
}
