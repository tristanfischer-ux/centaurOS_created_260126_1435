"use server"

/**
 * @file component-assembly.ts — Server actions for adding catalogue components to assemblies.
 *
 * @description Used by the Component Library "Add to Assembly" flow: list user draft
 * assemblies and add a component from the catalogue to a chosen assembly.
 *
 * @security All operations use authenticated Supabase client; RLS enforces assembly ownership.
 * @audit Mutations affect placed_components and cad_assemblies.
 */

import { createClient } from "@/lib/supabase/server"

export interface DraftAssembly {
  id: string
  name: string
  description: string | null
  status: string
  componentCount: number
  createdAt: string
}

/**
 * Returns the current user's draft assemblies for the assembly picker.
 *
 * @description Fetches cad_assemblies where creator_id = current user and status = 'draft',
 * with a count of placed_components per assembly.
 *
 * @returns List of draft assemblies or error
 *
 * @security RLS ensures user only sees their own assemblies
 */
export async function getUserDraftAssemblies(): Promise<
  DraftAssembly[] | { error: string }
> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const { data: assemblies, error: assyError } = await supabase
    .from("cad_assemblies")
    .select("id, name, description, status, created_at")
    .eq("creator_id", user.id)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })

  if (assyError) {
    console.error("[ComponentAssembly] Failed to fetch assemblies:", assyError.message)
    return { error: "Failed to load assemblies" }
  }

  if (!assemblies?.length) {
    return []
  }

  const ids = assemblies.map((a) => a.id)
  const { data: counts } = await supabase
    .from("placed_components")
    .select("assembly_id")
    .in("assembly_id", ids)

  const countByAssembly: Record<string, number> = {}
  for (const row of counts ?? []) {
    countByAssembly[row.assembly_id] = (countByAssembly[row.assembly_id] ?? 0) + 1
  }

  return assemblies.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? null,
    status: a.status ?? "draft",
    componentCount: countByAssembly[a.id] ?? 0,
    createdAt: a.created_at ?? new Date().toISOString(),
  }))
}

/**
 * Adds a catalogue component to an assembly.
 *
 * @description Loads the component's geometry_type_slug and name, verifies the user
 * owns the assembly (RLS + explicit check), and inserts a placed_component with
 * default position and rotation.
 *
 * @param assemblyId - The assembly to add the component to
 * @param catalogueId - The component_catalogue id
 * @returns Success or error
 *
 * @security Verifies assembly ownership; RLS on placed_components enforces same
 * @audit Inserts into placed_components
 */
export async function addComponentToAssembly(
  assemblyId: string,
  catalogueId: string,
): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Not authenticated" }
  }

  const { data: assembly, error: assyError } = await supabase
    .from("cad_assemblies")
    .select("id, creator_id")
    .eq("id", assemblyId)
    .single()

  if (assyError || !assembly) {
    return { error: "Assembly not found" }
  }

  if (assembly.creator_id !== user.id) {
    return { error: "You do not have access to this assembly" }
  }

  const { data: component, error: compError } = await supabase
    .from("component_catalogue")
    .select("id, geometry_type_slug, name")
    .eq("id", catalogueId)
    .single()

  if (compError || !component) {
    return { error: "Component not found" }
  }

  const { error: insertError } = await supabase.from("placed_components").insert({
    assembly_id: assemblyId,
    catalogue_id: catalogueId,
    geometry_type_slug: component.geometry_type_slug,
    label: component.name,
    position: { x: 0, y: 0, z: 0 },
    rotation: { rx: 0, ry: 0, rz: 0 },
    quantity: 1,
    custom_params: {},
  })

  if (insertError) {
    console.error("[ComponentAssembly] Failed to add component:", {
      assemblyId,
      catalogueId,
      error: insertError.message,
    })
    return { error: "Failed to add component to assembly" }
  }

  return { success: true }
}

/**
 * Creates a new draft assembly owned by the current user.
 *
 * @description Inserts a cad_assemblies row with default name and status 'draft'.
 * Used by the assembly picker when the user chooses "Create New Assembly".
 *
 * @returns The new assembly id or error
 *
 * @security Requires authenticated user; creator_id set to current user
 * @audit Inserts into cad_assemblies
 */
export async function createDraftAssembly(): Promise<
  { assemblyId: string } | { error: string }
> {
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
      name: "Untitled Assembly",
      description: null,
      creator_id: user.id,
      status: "draft",
      assembly_params: {},
    })
    .select("id")
    .single()

  if (error || !assembly) {
    console.error("[ComponentAssembly] Failed to create assembly:", error?.message)
    return { error: "Failed to create assembly" }
  }

  return { assemblyId: assembly.id }
}
