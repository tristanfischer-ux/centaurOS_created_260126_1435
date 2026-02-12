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
  // ─── Tier 1: Universal Primitives — Original (14) ───
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
  // ─── Tier 1: Universal Primitives — Expansion (27) ───
  "compression_spring",
  "torsion_spring",
  "shaft",
  "shaft_coupling_jaw",
  "spur_gear",
  "timing_pulley",
  "lead_screw",
  "linear_rail",
  "o_ring",
  "circlip",
  "dowel_pin",
  "keyway_key",
  "aluminium_extrusion",
  "corner_bracket_extrusion",
  "t_nut",
  "din_rail",
  "rivet",
  "threaded_rod",
  "set_screw",
  "levelling_foot",
  "rubber_foot",
  "cable_gland",
  "hinge_butt",
  "p_clip",
  "compression_fitting",
  "push_fit_connector",
  "thrust_washer",
  // ─── Tier 2: Electromechanical — Original (7) ───
  "brushless_motor_outrunner",
  "brushless_motor_pancake",
  "stepper_motor_nema",
  "pcb_board",
  "tactile_switch",
  "axial_fan",
  "centrifugal_pump",
  // ─── Tier 2: Electromechanical — Expansion (13) ───
  "servo_motor",
  "dc_gearmotor",
  "solenoid_linear",
  "relay_module",
  "voltage_regulator_module",
  "oled_display",
  "limit_switch",
  "heatsink_extruded",
  "terminal_block",
  "led_indicator",
  "piezo_buzzer",
  "rotary_encoder",
  "battery_holder_18650",
  // ─── Tier 3: BSF Breeding (5) ───
  "breeding_cage",
  "egg_collection_plate",
  "larvae_rearing_tray",
  "ventilation_louvre",
  "harvesting_screen",
  // ─── Tier 3: Brine Mining (7) ───
  "pressure_vessel",
  "hydrocyclone",
  "crystalliser_vessel",
  "filter_press_plate",
  "product_hopper",
  "pipe_flange",
  "control_valve",
  // ─── Tier 3: EPS Architectural (6) ───
  "eps_block",
  "hot_wire_cutter_frame",
  "reinforcing_mesh_panel",
  "corner_bead",
  "anchor_bracket",
  "surface_texture_panel",
  // ─── Tier 3: CubeSats (10) ───
  "cubesat_frame",
  "solar_panel_cubesat",
  "reaction_wheel",
  "magnetorquer",
  "star_tracker",
  "patch_antenna_cubesat",
  "deployable_antenna",
  "separation_spring",
  "kill_switch",
  "cold_gas_thruster",
  // ─── Tier 3: Drones (8) ───
  "propeller_airfoil",
  "fpv_camera",
  "esc_board",
  "gps_module",
  "lipo_battery_pack",
  "cylindrical_cell_18650",
  "sma_antenna",
  "frame_plate",
  // ─── Tier 3: Vertical Farming (8) ───
  "nft_channel",
  "led_grow_light_bar",
  "grow_tray",
  "net_pot",
  "nutrient_reservoir",
  "sensor_probe",
  "drip_emitter",
  "vertical_tower_section",
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
environment. For any component that matches a library part, call the library function instead
of writing geometry from scratch. Each function takes a single params dict and returns a
cq.Workplane centered at origin, base at Z=0.

The library spans:
- Tier 1 (universal): fasteners, bearings, springs, shafts, gears, pulleys, lead screws, linear rails, seals, extrusions, connectors, tubes, brackets, hinges, fittings
- Tier 2 (electromechanical): motors (brushless, stepper, servo, DC geared), solenoids, relays, PCBs, switches, fans, pumps, heatsinks, displays, encoders, battery holders, terminal blocks, LEDs, buzzers
- Tier 3 (domain): drones, CubeSats, vertical farming, BSF breeding, brine mining, EPS architectural

Available components:
${lines.join("\n")}

LIBRARY USAGE RULES:
- Call library functions directly: motor = brushless_motor_outrunner({"od": 34.5, "height": 13.5, "shaft_d": 5, "shaft_h": 8, "bolt_pcd": 19, "bolt_count": 4, "bolt_size": 3})
- Position the returned Workplane using .union() with .transformed(offset=(...)) for placement
- The library functions are pre-loaded — do NOT redefine them in your code
- For product-specific custom geometry (enclosures, frames, unique shapes), write make_*() functions as usual
- You CAN pass custom parameters to override defaults for any library function
- Library parts produce RECOGNISABLE geometry (visible bolt threads, motor windings, bearing balls, etc.) — much better than simple cylinder/box approximations
- For domain-specific products (drones, CubeSats, farms), check the Tier 3 library FIRST — many specialised parts are available`
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
