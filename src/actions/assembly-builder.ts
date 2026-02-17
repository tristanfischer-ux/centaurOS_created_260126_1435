"use server"

/**
 * @file assembly-builder.ts — Server actions for the RPG Assembly Builder.
 *
 * @description Provides data access for the assembly workbench:
 * - Component library browsing with search, filter, and tier tabs
 * - Assembly template CRUD
 * - Assembly persistence (create, update, load)
 * - Placed component management
 *
 * @security Server-side only. Uses authenticated Supabase client.
 * @audit Assembly mutations log to cad_assemblies table.
 */

import { createClient } from "@/lib/supabase/server"
import { createCadLabProject } from "@/actions/cad-lab-projects"

// ─── Types ───────────────────────────────────────────────────────────

/** A component from the geometry library, formatted for the catalog UI */
export interface CatalogComponent {
  id: string
  slug: string
  name: string
  tier: string
  category: string
  description: string | null
  defaultColour: string
  paramSchema: Record<string, unknown>
  physicalProperties: Record<string, unknown>
  procurement: Record<string, unknown>
  mountingInterfaces: Record<string, unknown>
  visualTags: string[]
  verified: boolean
}

/** Filters for browsing the component catalog */
export interface CatalogFilters {
  search?: string
  tier?: string
  category?: string
  limit?: number
  offset?: number
}

/** Summary stats returned alongside catalog results */
export interface CatalogStats {
  total: number
  byTier: Record<string, number>
  byCategory: Record<string, number>
}

/** A slot definition within an assembly template */
export interface TemplateSlot {
  id: string
  label: string
  group: string
  required: boolean
  compatibleCategories: string[]
  compatibleTiers: string[]
  mountingStandard: string | null
  position: { x: number; y: number }
  quantity: number
  constraints: Record<string, unknown>
}

/** An assembly template (design skeleton) */
export interface AssemblyTemplate {
  id: string
  slug: string
  name: string
  category: string
  description: string
  thumbnailUrl: string | null
  schematicSvg: string | null
  slots: TemplateSlot[]
  defaultStats: Record<string, unknown>
  difficulty: string
  sector: string | null
}

/** A user's assembly with its placed components */
export interface UserAssembly {
  id: string
  name: string
  description: string | null
  templateId: string | null
  status: string
  slots: TemplateSlot[]
  schematicSvg: string | null
  placedComponents: PlacedComponent[]
  createdAt: string
  updatedAt: string
}

/** A component placed into an assembly slot */
export interface PlacedComponent {
  id: string
  assemblyId: string
  slotId: string
  geometryTypeSlug: string | null
  catalogueId: string | null
  componentName: string
  customParams: Record<string, unknown> | null
  quantity: number
}

// ─── getComponentCatalog ─────────────────────────────────────────────

/**
 * Fetches components from the geometry library with optional filtering.
 *
 * @description Queries component_geometry_types with search, tier, and
 * category filters. Returns paginated results with stats for the filter UI.
 *
 * @param filters - Optional search, tier, category, limit, offset
 * @returns Array of catalog components and stats for filter chips
 * @throws If Supabase query fails
 */
export async function getComponentCatalog(
  filters: CatalogFilters = {},
): Promise<{ components: CatalogComponent[]; stats: CatalogStats }> {
  const supabase = await createClient()
  const { search, tier, category, limit = 50, offset = 0 } = filters

  // Build query
  let query = supabase
    .from("component_geometry_types")
    .select(
      "id, slug, name, tier, category, description, default_colour, param_schema, physical_properties, procurement, mounting_interfaces, visual_tags, verified",
    )
    .eq("verified", true)
    .order("tier")
    .order("category")
    .order("name")

  if (tier) {
    query = query.eq("tier", tier)
  }

  if (category) {
    query = query.eq("category", category)
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,slug.ilike.%${search}%,category.ilike.%${search}%,description.ilike.%${search}%`,
    )
  }

  // Fetch with pagination
  const { data, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    console.error("[AssemblyBuilder] Failed to fetch component catalog:", {
      filters,
      error: error.message,
      code: error.code,
    })
    return { components: [], stats: { total: 0, byTier: {}, byCategory: {} } }
  }

  const components: CatalogComponent[] = (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tier: row.tier,
    category: row.category,
    description: row.description,
    defaultColour: row.default_colour ?? "#888888",
    paramSchema: row.param_schema as Record<string, unknown>,
    physicalProperties: row.physical_properties as Record<string, unknown>,
    procurement: row.procurement as Record<string, unknown>,
    mountingInterfaces: row.mounting_interfaces as Record<string, unknown>,
    visualTags: (row.visual_tags as string[]) ?? [],
    verified: row.verified ?? false,
  }))

  // Fetch stats for filter UI (unfiltered counts)
  const statsResult = await getComponentStats()

  return { components, stats: statsResult }
}

// ─── getComponentStats ───────────────────────────────────────────────

/**
 * Fetches aggregate stats for the component library.
 *
 * @description Returns total count plus breakdowns by tier and category
 * for rendering filter chips with counts.
 *
 * @returns Stats object with total, byTier, and byCategory counts
 */
export async function getComponentStats(): Promise<CatalogStats> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("component_geometry_types")
    .select("tier, category")
    .eq("verified", true)

  if (error) {
    console.error("[AssemblyBuilder] Failed to fetch component stats:", {
      error: error.message,
    })
    return { total: 0, byTier: {}, byCategory: {} }
  }

  const rows = data ?? []
  const byTier: Record<string, number> = {}
  const byCategory: Record<string, number> = {}

  for (const row of rows) {
    byTier[row.tier] = (byTier[row.tier] ?? 0) + 1
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1
  }

  return { total: rows.length, byTier, byCategory }
}

// ─── getAssemblyTemplates ────────────────────────────────────────────

/**
 * Fetches all available assembly templates.
 *
 * @description Returns the pre-built design skeletons users can pick from.
 * Templates are seeded in the database.
 *
 * @param category - Optional category filter
 * @returns Array of assembly templates
 */
export async function getAssemblyTemplates(
  category?: string,
): Promise<AssemblyTemplate[]> {
  const supabase = await createClient()

  let query = supabase
    .from("assembly_templates")
    .select("*")
    .order("difficulty")
    .order("name")

  if (category) {
    query = query.eq("category", category)
  }

  const { data, error } = await query

  if (error) {
    console.error("[AssemblyBuilder] Failed to fetch templates:", {
      error: error.message,
      code: error.code,
    })
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    schematicSvg: row.schematic_svg,
    slots: row.slots as unknown as TemplateSlot[],
    defaultStats: (row.default_stats as Record<string, unknown>) ?? {},
    difficulty: row.difficulty,
    sector: row.sector,
  }))
}

// ─── createAssemblyFromTemplate ──────────────────────────────────────

/**
 * Creates a new assembly from a template.
 *
 * @description Copies the template's slot definitions into a new cad_assembly
 * record owned by the current user.
 *
 * @param templateId - ID of the template to use
 * @returns The created assembly ID, or error
 *
 * @security Requires authenticated user
 * @audit Creates cad_assemblies record with creator_id
 */
export async function createAssemblyFromTemplate(
  templateId: string,
): Promise<{ assemblyId: string } | { error: string }> {
  const supabase = await createClient()

  // AUTH: Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  // Fetch template
  const { data: template, error: templateError } = await supabase
    .from("assembly_templates")
    .select("*")
    .eq("id", templateId)
    .single()

  if (templateError || !template) {
    return { error: "Template not found" }
  }

  // Create assembly
  const { data: assembly, error: assemblyError } = await supabase
    .from("cad_assemblies")
    .insert({
      name: template.name,
      description: template.description,
      creator_id: user.id,
      status: "draft",
      assembly_params: {
        templateId: template.id,
        templateSlug: template.slug,
        slots: template.slots,
        schematicSvg: template.schematic_svg,
        defaultStats: template.default_stats,
      },
    })
    .select("id")
    .single()

  if (assemblyError || !assembly) {
    console.error("[AssemblyBuilder] Failed to create assembly:", {
      templateId,
      error: assemblyError?.message,
    })
    return { error: "Failed to create assembly" }
  }

  return { assemblyId: assembly.id }
}

// ─── createAssemblyFromDescription ───────────────────────────────────

/**
 * Creates a new assembly from an AI-generated skeleton.
 *
 * @description Creates a draft assembly with the AI-generated slot definitions
 * and schematic SVG. Called after Claude generates the skeleton.
 *
 * @param name - Assembly name
 * @param description - Assembly description
 * @param slots - AI-generated slot definitions
 * @param schematicSvg - AI-generated SVG schematic
 * @returns The created assembly ID, or error
 *
 * @security Requires authenticated user
 */
export async function createAssemblyFromDescription(
  name: string,
  description: string,
  slots: TemplateSlot[],
  schematicSvg: string,
): Promise<{ assemblyId: string } | { error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { data: assembly, error } = await supabase
    .from("cad_assemblies")
    .insert({
      name,
      description,
      creator_id: user.id,
      status: "draft",
      // Safe assertion: assembly_params is JSONB, our object is JSON-serializable
      assembly_params: {
        slots: JSON.parse(JSON.stringify(slots)),
        schematicSvg,
        defaultStats: {},
        generatedFromDescription: true,
      },
    })
    .select("id")
    .single()

  if (error || !assembly) {
    console.error("[AssemblyBuilder] Failed to create assembly from description:", {
      error: error?.message,
    })
    return { error: "Failed to create assembly" }
  }

  return { assemblyId: assembly.id }
}

// ─── getAssembly ─────────────────────────────────────────────────────

/**
 * Loads an assembly with its placed components.
 *
 * @description Fetches the assembly record and all placed_components for
 * rendering the workbench.
 *
 * @param assemblyId - The assembly to load
 * @returns The assembly with placed components, or error
 *
 * @security Verifies user owns the assembly via RLS
 */
export async function getAssembly(
  assemblyId: string,
): Promise<UserAssembly | { error: string }> {
  const supabase = await createClient()

  const { data: assembly, error } = await supabase
    .from("cad_assemblies")
    .select("*")
    .eq("id", assemblyId)
    .single()

  if (error || !assembly) {
    return { error: "Assembly not found" }
  }

  // Fetch placed components
  const { data: placed } = await supabase
    .from("placed_components")
    .select("*")
    .eq("assembly_id", assemblyId)

  const params = assembly.assembly_params as Record<string, unknown> | null

  return {
    id: assembly.id,
    name: assembly.name,
    description: assembly.description,
    templateId: (params?.templateId as string) ?? null,
    status: assembly.status ?? "draft",
    slots: (params?.slots as TemplateSlot[]) ?? [],
    schematicSvg: (params?.schematicSvg as string) ?? null,
    placedComponents: (placed ?? []).map((p) => ({
      id: p.id,
      assemblyId: p.assembly_id,
      slotId: (p.custom_params as Record<string, unknown>)?.slotId as string ?? "",
      geometryTypeSlug: p.geometry_type_slug,
      catalogueId: p.catalogue_id,
      componentName: p.label ?? "Unknown",
      customParams: p.custom_params as Record<string, unknown> | null,
      quantity: p.quantity ?? 1,
    })),
    createdAt: assembly.created_at ?? "",
    updatedAt: assembly.updated_at ?? "",
  }
}

// ─── assignComponentToSlot ───────────────────────────────────────────

/**
 * Assigns a component from the catalog to a slot in an assembly.
 *
 * @description Creates or updates a placed_component record linking
 * the geometry type to the assembly at the specified slot position.
 *
 * @param assemblyId - The assembly to modify
 * @param slotId - The slot to fill
 * @param componentSlug - The geometry type slug
 * @param componentName - Display name for the component
 * @returns Success or error
 *
 * @security Verifies assembly ownership via RLS
 * @audit Modifies placed_components table
 */
export async function assignComponentToSlot(
  assemblyId: string,
  slotId: string,
  componentSlug: string,
  componentName: string,
): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()

  // Remove existing component in this slot (if any)
  await supabase
    .from("placed_components")
    .delete()
    .eq("assembly_id", assemblyId)
    .eq("custom_params->>slotId", slotId)

  // Insert new placement
  const { error } = await supabase.from("placed_components").insert({
    assembly_id: assemblyId,
    geometry_type_slug: componentSlug,
    label: componentName,
    position: { x: 0, y: 0, z: 0 },
    rotation: { rx: 0, ry: 0, rz: 0 },
    quantity: 1,
    custom_params: { slotId },
  })

  if (error) {
    console.error("[AssemblyBuilder] Failed to assign component:", {
      assemblyId,
      slotId,
      componentSlug,
      error: error.message,
    })
    return { error: "Failed to assign component" }
  }

  return { success: true }
}

// ─── removeComponentFromSlot ─────────────────────────────────────────

/**
 * Removes a component from a slot in an assembly.
 *
 * @param assemblyId - The assembly to modify
 * @param slotId - The slot to clear
 * @returns Success or error
 */
export async function removeComponentFromSlot(
  assemblyId: string,
  slotId: string,
): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("placed_components")
    .delete()
    .eq("assembly_id", assemblyId)
    .eq("custom_params->>slotId", slotId)

  if (error) {
    console.error("[AssemblyBuilder] Failed to remove component:", {
      assemblyId,
      slotId,
      error: error.message,
    })
    return { error: "Failed to remove component" }
  }

  return { success: true }
}

// ─── generateSkeletonFromDescription ─────────────────────────────────

/**
 * Generates an assembly skeleton from a natural language description using Claude.
 *
 * @description Sends the user's description to Claude along with the template
 * schema, receives slot definitions and schematic layout hints, generates a
 * simple SVG, and creates an assembly.
 *
 * @param description - Natural language description of what to build
 * @returns The created assembly ID, or error
 *
 * @security Requires authenticated user. Uses ANTHROPIC_API_KEY.
 */
export async function generateSkeletonFromDescription(
  description: string,
): Promise<{ assemblyId: string } | { error: string }> {
  if (!description.trim()) {
    return { error: "Please provide a description" }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { error: "AI generation is not configured" }
  }

  try {
    // Call Claude to generate slot definitions
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: `You are an engineering design assistant. Given a product description, generate a component assembly skeleton.

Return ONLY valid JSON with this exact structure:
{
  "name": "Short name for the assembly",
  "category": "drone|robot|satellite|vehicle|iot|residential|farming",
  "description": "One-sentence description",
  "difficulty": "beginner|intermediate|advanced",
  "slots": [
    {
      "id": "unique_snake_case_id",
      "label": "Human-readable slot name",
      "group": "propulsion|structure|electronics|power|sensors|payload|control",
      "required": true/false,
      "compatibleCategories": ["motor", "bearing", etc],
      "compatibleTiers": ["universal", "electromechanical", "domain"],
      "mountingStandard": null,
      "position": {"x": number, "y": number},
      "quantity": 1,
      "constraints": {}
    }
  ]
}

Position slots in a logical 2D layout within a 500x500 grid. Group related slots together.
Include 5-15 slots covering the main functional groups of the design.
Choose compatible categories from: motor, fastener, bearing, connector, structural, electronics, sensor, pcb, battery, power, antenna, display, switch, spring, shaft, gear, frame, enclosure, solar, camera, esc, servo.`,
        messages: [
          {
            role: "user",
            content: `Generate an assembly skeleton for: ${description}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error("[AssemblyBuilder] Claude API error:", response.status)
      return { error: "AI generation failed. Please try again." }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ""

    // Extract JSON from response (Claude may wrap it in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { error: "AI returned an unexpected format. Please try again." }
    }

    const skeleton = JSON.parse(jsonMatch[0]) as {
      name: string
      category: string
      description: string
      difficulty: string
      slots: TemplateSlot[]
    }

    // Generate a simple SVG schematic from slot positions
    const svgSchematic = generateSchematicSvg(skeleton.slots)

    // Create the assembly
    const result = await createAssemblyFromDescription(
      skeleton.name || description.slice(0, 50),
      skeleton.description || description,
      skeleton.slots,
      svgSchematic,
    )

    return result
  } catch (err) {
    console.error("[AssemblyBuilder] Skeleton generation failed:", err)
    return { error: "Failed to generate skeleton. Please try again." }
  }
}

// ─── generateSchematicSvg ────────────────────────────────────────────

/**
 * Generates a simple SVG schematic from slot definitions.
 *
 * @description Creates connection lines between slots in the same group
 * and renders group labels. Used as background art for the schematic view.
 *
 * @param slots - Array of slot definitions with positions
 * @returns SVG string for the schematic background
 */
function generateSchematicSvg(slots: TemplateSlot[]): string {
  if (slots.length === 0) return ""

  // Group slots
  const groups = new Map<string, TemplateSlot[]>()
  for (const slot of slots) {
    const existing = groups.get(slot.group) ?? []
    existing.push(slot)
    groups.set(slot.group, existing)
  }

  const lines: string[] = []

  // Draw connection lines between slots in same group
  for (const [, groupSlots] of groups) {
    if (groupSlots.length < 2) continue
    for (let i = 0; i < groupSlots.length - 1; i++) {
      const a = groupSlots[i]
      const b = groupSlots[i + 1]
      lines.push(
        `<line x1="${a.position.x + 60}" y1="${a.position.y + 28}" x2="${b.position.x + 60}" y2="${b.position.y + 28}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 3"/>`,
      )
    }
  }

  return lines.join("\n")
}

// ─── bridgeToCadLab ──────────────────────────────────────────────────

/**
 * Creates a CAD Lab project pre-filled with the assembly's components.
 *
 * @description Takes the completed assembly (slots + assigned components)
 * and creates a new CAD Lab project with the subject pre-filled from the
 * assembly name and component list. The user then continues in the CAD Lab
 * pipeline for 3D model generation.
 *
 * @param assemblyId - The assembly to bridge
 * @returns The CAD Lab project ID, or error
 *
 * @security Requires authenticated user
 */
export async function bridgeToCadLab(
  assemblyId: string,
): Promise<{ projectId: string } | { error: string }> {
  const assembly = await getAssembly(assemblyId)

  if ("error" in assembly) {
    return { error: assembly.error }
  }

  if (assembly.placedComponents.length === 0) {
    return { error: "Assembly has no components. Fill some slots first." }
  }

  // Build a subject line from the assembly
  const componentList = assembly.placedComponents
    .map((pc) => pc.componentName)
    .join(", ")

  const subject = `${assembly.name} with components: ${componentList}`

  // Create a CAD Lab project
  const result = await createCadLabProject(subject)

  if ("error" in result) {
    return { error: result.error }
  }

  return { projectId: result.projectId }
}

// ─── Assembly Enrichment Data ────────────────────────────────────────

/** Pricing data from the component_pricing table */
export interface ComponentPricingData {
  component_name: string
  manufacturer: string | null
  pricing_tiers: unknown[]
  moq: number | null
  lead_time_days: unknown
  currency: string
}

/** Certification entry from the component_certifications table */
export interface ComponentCertData {
  component_name: string
  certifications: unknown[]
  compliance_summary: Record<string, unknown> | null
  export_control: Record<string, unknown> | null
}

/** Compatibility pair from the component_compatibility table */
export interface ComponentCompatData {
  component_a: string
  component_b: string
  relationship: string
  confidence: number | null
  notes: string | null
}

/** Full enrichment payload for the Assembly Builder */
export interface AssemblyEnrichment {
  pricing: ComponentPricingData[]
  certifications: ComponentCertData[]
  compatibility: ComponentCompatData[]
}

/**
 * Fetches enrichment data (pricing, certifications, compatibility) for a set
 * of placed component names. Used by the Assembly Builder workbench to surface
 * live market data alongside the schematic.
 *
 * @param componentNames - Array of component names from placedComponents
 * @returns Enrichment data or error
 *
 * @security Requires authenticated user. All tables have public SELECT RLS.
 */
export async function getAssemblyEnrichment(
  componentNames: string[],
): Promise<AssemblyEnrichment | { error: string }> {
  if (componentNames.length === 0) {
    return { pricing: [], certifications: [], compatibility: [] }
  }

  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Authentication required" }
  }

  try {
    const [pricingResult, certsResult, compatResult] = await Promise.all([
      // Pricing for placed components
      supabase
        .from("component_pricing")
        .select("component_name, manufacturer, pricing_tiers, moq, lead_time_days, currency")
        .in("component_name", componentNames),

      // Certifications for placed components
      supabase
        .from("component_certifications")
        .select("component_name, certifications, compliance_summary, export_control")
        .in("component_name", componentNames),

      // Compatibility pairs where both sides are in the placed list
      supabase
        .from("component_compatibility")
        .select("component_a, component_b, relationship, confidence, notes")
        .or(
          componentNames
            .map((n) => `component_a.eq.${n},component_b.eq.${n}`)
            .join(","),
        ),
    ])

    return {
      pricing: (pricingResult.data ?? []) as ComponentPricingData[],
      certifications: (certsResult.data ?? []) as ComponentCertData[],
      compatibility: (compatResult.data ?? []) as ComponentCompatData[],
    }
  } catch (err) {
    console.error("[AssemblyBuilder] Enrichment fetch failed:", err)
    return { error: "Failed to load enrichment data" }
  }
}
