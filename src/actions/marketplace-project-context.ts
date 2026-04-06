"use server"

/**
 * @file marketplace-project-context.ts
 *
 * @description Fetches the user's active CAD Lab project context for the
 * marketplace page. Extracts manufacturing processes and materials from
 * diagnostic answers, maps them to marketplace subcategory groups, and
 * returns a supplier count so the banner can show "47 suppliers match."
 *
 * @security Uses withAuth for user/foundry scoping.
 */

import { unstable_cache } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export interface ProjectContext {
    projectId: string
    projectName: string
    processes: string[]
    materials: string[]
    matchingSubcategories: string[]
    supplierCount: number
}

/**
 * Maps diagnostic mfg_process values to marketplace subcategory search terms.
 * These are used to filter marketplace_listings.subcategory for matching suppliers.
 */
const PROCESS_TO_SUBCATEGORY_TERMS: Record<string, string[]> = {
    "CNC Machining": ["CNC Machining", "Precision Machining", "CNC"],
    "Sheet Metal": ["Sheet Metal", "Metal Fabrication", "Laser Cutting", "Steel Fabrication"],
    "Injection Molding": ["Injection Mould", "Injection Mold", "Plastic Injection"],
    "Casting": ["Casting", "Investment Casting", "Die Casting", "Sand Casting", "Foundry"],
    "FDM 3D Print": ["3D Print", "Additive Manufacturing", "FDM", "Rapid Prototyping"],
    "SLA/Resin Print": ["3D Print", "SLA", "Additive Manufacturing", "Rapid Prototyping"],
    "SLS/Powder Print": ["3D Print", "SLS", "Additive Manufacturing", "Rapid Prototyping"],
    "Manual/Assembly": ["Assembly", "Contract Manufacturing"],
    "Other": [],
}

/**
 * Gets the user's most recently updated CAD Lab project and extracts
 * manufacturing context for marketplace filtering.
 *
 * @returns ProjectContext or null if no active projects or no diagnostic data
 */
export async function getActiveProjectContext(): Promise<ProjectContext | null> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Get user's profile for foundry_id
    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id")
        .eq("id", user.id)
        .single()

    if (!profile?.foundry_id) return null

    // Fetch most recently updated non-archived project
    const { data: project } = await supabase
        .from("cad_lab_projects")
        .select("id, name, diagnostic_answers")
        .eq("foundry_id", profile.foundry_id)
        .neq("stage", "archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single()

    if (!project?.diagnostic_answers) return null

    // Extract unique mfg_process and material values from all modules
    const diagnostics = project.diagnostic_answers as Record<string, Record<string, string>>
    const processes = new Set<string>()
    const materials = new Set<string>()

    for (const moduleAnswers of Object.values(diagnostics)) {
        if (moduleAnswers.mfg_process) processes.add(moduleAnswers.mfg_process)
        if (moduleAnswers.material) materials.add(moduleAnswers.material)
    }

    if (processes.size === 0) return null

    // Map processes to subcategory search terms
    const subcategoryTerms = new Set<string>()
    for (const process of processes) {
        const terms = PROCESS_TO_SUBCATEGORY_TERMS[process] ?? []
        terms.forEach(t => subcategoryTerms.add(t))
    }

    if (subcategoryTerms.size === 0) return null

    // Count matching suppliers using admin client (faster, no RLS overhead)
    const matchingSubcategories = await getMatchingSubcategories(Array.from(subcategoryTerms))

    return {
        projectId: project.id,
        projectName: project.name,
        processes: Array.from(processes),
        materials: Array.from(materials),
        matchingSubcategories: matchingSubcategories.subcategories,
        supplierCount: matchingSubcategories.count,
    }
}

/**
 * Counts non-demo suppliers whose subcategory matches any of the given terms.
 * Cached 60s to avoid repeated DB calls on navigation.
 */
const getMatchingSubcategories = unstable_cache(
    async (terms: string[]): Promise<{ count: number; subcategories: string[] }> => {
        const supabase = createAdminClient()

        // Build OR filter for subcategory ILIKE matching
        const filters = terms.map(t => `subcategory.ilike.%${t}%`).join(",")

        const { count, data } = await supabase
            .from("marketplace_listings")
            .select("subcategory", { count: "exact" })
            .in("category", ["Products", "Services"])
            .eq("is_demo", false)
            .or(filters)
            .limit(1000)

        // Get unique matching subcategories for the filter URL
        const uniqueSubcats = [...new Set((data ?? []).map(r => r.subcategory).filter(Boolean) as string[])]

        return { count: count ?? 0, subcategories: uniqueSubcats }
    },
    ["marketplace-project-supplier-count"],
    { revalidate: 60 }
)
