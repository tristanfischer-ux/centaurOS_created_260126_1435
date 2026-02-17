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
import type { Sector } from "@/types/foundry"

// ─── Catalogue Browsing Types ────────────────────────────────────────

/** Filters for the component catalogue list view */
export interface ComponentFilters {
  search?: string
  category?: string
  sortBy?: "name" | "price_asc" | "price_desc" | "rating" | "compat"
  page?: number
  pageSize?: number
}

/** Summary item for the component grid card */
export interface ComponentListItem {
  id: string
  name: string
  manufacturer: string | null
  geometry_type_slug: string
  material: string | null
  verified: boolean | null
  price_min: number | null
  price_max: number | null
  currency: string | null
  avg_rating: number | null
  review_count: number
  cert_count: number
  compat_count: number
}

/** Full detail for the component detail dialog */
export interface ComponentDetail {
  component: Record<string, unknown>
  pricing: Record<string, unknown> | null
  certifications: Record<string, unknown> | null
  compatibility: Record<string, unknown>[]
  reviews: Record<string, unknown>[]
}

// ─── Catalogue Browsing Actions ──────────────────────────────────────

/**
 * Fetches a paginated list of components from the catalogue with
 * enrichment data (pricing, ratings, certifications, compatibility).
 *
 * @description Joins component_catalogue with component_pricing,
 * entity_reviews, component_certifications, and component_compatibility
 * to produce a rich card view. Supports search, category filter, and sorting.
 *
 * @param filters - Search, category, sort, and pagination options
 * @returns Paginated list of components with enrichment counts
 */
export async function getComponents(
  filters: ComponentFilters = {}
): Promise<{ data: ComponentListItem[]; total: number } | { error: string }> {
  const supabase = await createClient()
  const { search, category, sortBy = "name", page = 1, pageSize = 24 } = filters
  const offset = (page - 1) * pageSize

  // Base query on component_catalogue
  let query = supabase
    .from("component_catalogue")
    .select("id, name, manufacturer, geometry_type_slug, material, verified, tags", { count: "exact" })

  // Apply search filter
  if (search) {
    query = query.or(`name.ilike.%${search}%,manufacturer.ilike.%${search}%,geometry_type_slug.ilike.%${search}%`)
  }

  // Apply category filter (matches geometry_type_slug category prefix)
  if (category) {
    query = query.ilike("geometry_type_slug", `%${category}%`)
  }

  // Sort
  switch (sortBy) {
    case "name":
      query = query.order("name", { ascending: true })
      break
    case "price_asc":
    case "price_desc":
    case "rating":
    case "compat":
      // These sorts require enrichment data — fall back to name sort
      // and we'll re-sort client-side after enrichment
      query = query.order("name", { ascending: true })
      break
  }

  // Paginate
  query = query.range(offset, offset + pageSize - 1)

  const { data: components, error, count } = await query

  if (error) {
    console.error("[ComponentLibrary] Failed to fetch components:", {
      error: error.message,
      code: error.code,
    })
    return { error: "Failed to load components. Please try again." }
  }

  if (!components || components.length === 0) {
    return { data: [], total: count ?? 0 }
  }

  // Enrich with pricing, reviews, certifications, compatibility
  const componentNames = components.map((c) => c.name)

  const [pricingResult, reviewsResult, certsResult, compatResult] = await Promise.all([
    supabase
      .from("component_pricing")
      .select("component_name, pricing_tiers, currency")
      .in("component_name", componentNames),
    supabase
      .from("entity_reviews")
      .select("entity_name, rating")
      .eq("entity_type", "component")
      .in("entity_name", componentNames),
    supabase
      .from("component_certifications")
      .select("component_name, certifications")
      .in("component_name", componentNames),
    supabase
      .from("component_compatibility")
      .select("component_a, component_b")
      .or(
        componentNames.map((n) => `component_a.eq.${n}`).join(",") +
        "," +
        componentNames.map((n) => `component_b.eq.${n}`).join(",")
      ),
  ])

  // Build lookup maps
  const pricingMap = new Map<string, { min: number | null; max: number | null; currency: string | null }>()
  for (const p of pricingResult.data ?? []) {
    const tiers = p.pricing_tiers as Array<{ unit_price_usd: number }> | null
    if (tiers && tiers.length > 0) {
      const prices = tiers.map((t) => t.unit_price_usd)
      pricingMap.set(p.component_name, {
        min: Math.min(...prices),
        max: Math.max(...prices),
        currency: p.currency,
      })
    }
  }

  const reviewMap = new Map<string, { total: number; sum: number }>()
  for (const r of reviewsResult.data ?? []) {
    const existing = reviewMap.get(r.entity_name) ?? { total: 0, sum: 0 }
    existing.total += 1
    existing.sum += r.rating
    reviewMap.set(r.entity_name, existing)
  }

  const certMap = new Map<string, number>()
  for (const c of certsResult.data ?? []) {
    const certs = c.certifications as unknown[] | null
    certMap.set(c.component_name, Array.isArray(certs) ? certs.length : 0)
  }

  const compatMap = new Map<string, number>()
  for (const c of compatResult.data ?? []) {
    compatMap.set(c.component_a, (compatMap.get(c.component_a) ?? 0) + 1)
    compatMap.set(c.component_b, (compatMap.get(c.component_b) ?? 0) + 1)
  }

  // Assemble enriched list items
  const enriched: ComponentListItem[] = components.map((comp) => {
    const pricing = pricingMap.get(comp.name)
    const reviews = reviewMap.get(comp.name)
    return {
      id: comp.id,
      name: comp.name,
      manufacturer: comp.manufacturer,
      geometry_type_slug: comp.geometry_type_slug,
      material: comp.material,
      verified: comp.verified,
      price_min: pricing?.min ?? null,
      price_max: pricing?.max ?? null,
      currency: pricing?.currency ?? null,
      avg_rating: reviews ? reviews.sum / reviews.total : null,
      review_count: reviews?.total ?? 0,
      cert_count: certMap.get(comp.name) ?? 0,
      compat_count: compatMap.get(comp.name) ?? 0,
    }
  })

  // Client-side sort for enrichment-based sorts
  if (sortBy === "price_asc") {
    enriched.sort((a, b) => (a.price_min ?? Infinity) - (b.price_min ?? Infinity))
  } else if (sortBy === "price_desc") {
    enriched.sort((a, b) => (b.price_max ?? 0) - (a.price_max ?? 0))
  } else if (sortBy === "rating") {
    enriched.sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
  } else if (sortBy === "compat") {
    enriched.sort((a, b) => b.compat_count - a.compat_count)
  }

  return { data: enriched, total: count ?? 0 }
}

/**
 * Fetches distinct geometry type categories from the component catalogue.
 *
 * @description Used for the category filter tabs on the component library page.
 * Extracts unique geometry_type_slug values grouped by their category prefix.
 *
 * @returns Array of category strings
 */
export async function getComponentCategories(): Promise<{ data: string[] } | { error: string }> {
  const supabase = await createClient()

  // Get distinct categories from component_geometry_types
  const { data, error } = await supabase
    .from("component_geometry_types")
    .select("category")
    .eq("verified", true)
    .order("category")

  if (error) {
    console.error("[ComponentLibrary] Failed to fetch categories:", {
      error: error.message,
      code: error.code,
    })
    return { error: "Failed to load categories." }
  }

  // Deduplicate
  const categories = [...new Set((data ?? []).map((d) => d.category))]
  return { data: categories }
}

/**
 * Fetches full detail for a single component including all enrichment data.
 *
 * @description Loads the component record from component_catalogue, then
 * fetches pricing, certifications, compatibility, and reviews in parallel.
 *
 * @param componentId - UUID of the component in component_catalogue
 * @returns Full component detail with all enrichment data
 */
export async function getComponentDetail(
  componentId: string
): Promise<ComponentDetail | { error: string }> {
  const supabase = await createClient()

  // Fetch the base component
  const { data: component, error } = await supabase
    .from("component_catalogue")
    .select("*")
    .eq("id", componentId)
    .single()

  if (error || !component) {
    console.error("[ComponentLibrary] Failed to fetch component detail:", {
      componentId,
      error: error?.message,
    })
    return { error: "Component not found." }
  }

  const name = component.name

  // Fetch enrichment data in parallel
  const [pricingResult, certsResult, compatResult, reviewsResult] = await Promise.all([
    supabase
      .from("component_pricing")
      .select("*")
      .eq("component_name", name)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("component_certifications")
      .select("*")
      .eq("component_name", name)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("component_compatibility")
      .select("*")
      .or(`component_a.eq.${name},component_b.eq.${name}`)
      .limit(20),
    supabase
      .from("entity_reviews")
      .select("*")
      .eq("entity_type", "component")
      .eq("entity_name", name)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  return {
    component: component as unknown as Record<string, unknown>,
    pricing: (pricingResult.data as unknown as Record<string, unknown>) ?? null,
    certifications: (certsResult.data as unknown as Record<string, unknown>) ?? null,
    compatibility: (compatResult.data as unknown as Record<string, unknown>[]) ?? [],
    reviews: (reviewsResult.data as unknown as Record<string, unknown>[]) ?? [],
  }
}

// ─── CAD Geometry Library Types ──────────────────────────────────────

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
  // ─── Tier 3: EV / Automotive (23) ───
  "hub_motor",
  "mid_drive_motor",
  "traction_motor",
  "motor_controller_ev",
  "reduction_gearbox",
  "cv_joint",
  "chain_sprocket",
  "battery_module_ev",
  "bms_board",
  "charging_port",
  "hv_contactor",
  "wiring_connector_deutsch",
  "wheel_hub",
  "brake_disc",
  "brake_caliper",
  "coilover_shock",
  "wishbone",
  "tie_rod_end",
  "steering_rack",
  "wheel_rim",
  "throttle_sensor",
  "speed_sensor_wheel",
  "fuse_box",
  // ─── Tier 3: UK House / Residential (37) ───
  "kitchen_base_cabinet",
  "kitchen_wall_cabinet",
  "kitchen_tall_cabinet",
  "kitchen_worktop",
  "kitchen_sink_belfast",
  "kitchen_mixer_tap",
  "induction_hob",
  "built_in_oven",
  "extractor_hood",
  "bath_freestanding",
  "shower_tray",
  "shower_screen",
  "wc_close_coupled",
  "basin_countertop",
  "vanity_unit",
  "towel_radiator",
  "bed_frame",
  "wardrobe_hinged",
  "chest_of_drawers",
  "dining_table",
  "desk",
  "internal_door",
  "composite_front_door",
  "bifold_door",
  "sliding_pocket_door",
  "casement_window",
  "sash_window",
  "roof_window",
  "light_switch",
  "double_socket",
  "downlight",
  "panel_radiator",
  "trv_valve",
  "combi_boiler",
  "roof_tile",
  "gutter_profile",
  "steel_lintel",
  // ─── Tier 3: Architectural Styles — Georgian (6) ───
  "georgian_sash_window",
  "georgian_fanlight",
  "georgian_dentil_cornice",
  "georgian_panelled_door",
  "georgian_quoin",
  "georgian_iron_railing",
  // ─── Tier 3: Architectural Styles — Victorian (5) ───
  "victorian_bay_window",
  "victorian_ridge_tile",
  "victorian_porch_column",
  "victorian_bargeboard",
  "victorian_tile_hanging",
  // ─── Tier 3: Architectural Styles — Tudor (4) ───
  "tudor_half_timber",
  "tudor_herringbone_brick",
  "tudor_mullioned_window",
  "tudor_chimney_stack",
  // ─── Tier 3: Architectural Styles — Arts & Crafts (3) ───
  "ac_catslide_dormer",
  "ac_inglenook_surround",
  "ac_leaded_casement",
  // ─── Tier 3: Architectural Styles — Neo-Classical (3) ───
  "classical_column",
  "classical_pediment",
  "classical_balustrade",
  // ─── Tier 3: Architectural Styles — Art Deco (3) ───
  "deco_crittall_window",
  "deco_sunburst_panel",
  "deco_stepped_parapet",
  // ─── Tier 3: Architectural Styles — Brutalist (2) ───
  "brise_soleil",
  "brutalist_balcony",
  // ─── Tier 3: Architectural Styles — Contemporary (4) ───
  "zinc_standing_seam_panel",
  "frameless_glass_balustrade",
  "corten_panel",
  "perforated_metal_screen",
] as const

export type LibrarySlug = (typeof LIBRARY_FUNCTION_SLUGS)[number]

// ─── fetchLibrarySummary ─────────────────────────────────────────────

/**
 * Fetches a compact summary of available component geometry types.
 * Used to inject a "COMPONENT LIBRARY" section into Claude's prompt.
 *
 * Returns ALL verified components regardless of sector. Claude decides
 * which components are relevant to the design task at hand.
 *
 * @param sector - Kept for API compatibility but no longer used for filtering
 * @returns Array of component summaries with slug, name, param schema, etc.
 * @throws If Supabase query fails
 */
export async function fetchLibrarySummary(
  sector?: Sector | null,
): Promise<LibraryComponentSummary[]> {
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

  const rows = data ?? []

  // All components available to all sectors — Claude decides which are relevant
  // to the design task. No Tier 3 domain filtering.

  return rows.map((row) => ({
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
- Tier 3 (domain): EV/automotive (motors, drivetrain, battery, chassis, brakes, suspension, steering, sensors), drones, CubeSats, vertical farming, BSF breeding, brine mining, EPS architectural, house/residential (kitchen cabinets, worktops, sinks, taps, hobs, ovens, extractors, baths, showers, WCs, basins, vanity units, towel rails, beds, wardrobes, desks, tables, internal/external doors, bifolds, windows, sash windows, roof windows, switches, sockets, downlights, radiators, TRVs, boilers, roof tiles, gutters, lintels), architectural styles (Georgian sash windows, fanlights, dentil cornices, panelled doors, quoins, iron railings; Victorian bay windows, ridge tiles, porch columns, bargeboards, tile hanging; Tudor half-timber, herringbone brick, mullioned windows, chimney stacks; Arts & Crafts catslide dormers, inglenook surrounds, leaded casements; Neo-Classical columns, pediments, balustrades; Art Deco Crittall windows, sunburst panels, stepped parapets; Brutalist brise-soleil, cantilevered balconies; Contemporary zinc standing seam, frameless glass balustrades, corten panels, perforated metal screens)

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
