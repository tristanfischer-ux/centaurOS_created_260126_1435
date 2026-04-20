/**
 * @file suppliers/page.tsx — /the-forge-v2/projects/:id/suppliers
 *
 * @description Suppliers artefact — mockup-faithful port of
 * FORGE-MOCKUP-SUPPLIERS.html. Server component reads the project, pulls the
 * full per-project supplier shortlist from `forge_supplier_shortlist`, joins
 * to the global `suppliers` table for community rating / verification /
 * capabilities / company_info, then hands a typed props bundle to
 * SuppliersView.
 *
 * Empty-state policy: the RFQ lifecycle (sent / quoted / awarded) does not
 * yet exist on this project — those tiles render honest zeros. Suppliers
 * without a global row fall back to null rating / null hq / empty
 * capabilities; they still render but the missing fields show "—" or a
 * muted empty-state variant. We never synthesise mockup specifics
 * (Astra cert expiries, £18.1k RFQ exposure, etc.).
 *
 * @related
 *   - View:   ./suppliers-view.tsx
 *   - Styles: ./suppliers-v2.css (scoped .sp2)
 *   - Mockup: FORGE-MOCKUP-SUPPLIERS.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { SuppliersView, type SuppliersSupplierRow, type SuppliersViewProps } from "./suppliers-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Suppliers · The Forge" }
    return { title: `Suppliers · ${r.project.name}` }
}

// ─── Helpers ───────────────────────────────────────────────────────────

type RampRole = "primary" | "secondary" | "backup"

function coerceRole(v: unknown): RampRole {
    const s = typeof v === "string" ? v.toLowerCase() : ""
    if (s === "primary" || s === "secondary" || s === "backup") return s
    return "secondary"
}

/** Extract up to 3 meaningful capability strings from the global supplier row. */
function extractCapabilities(caps: unknown): string[] {
    if (!caps || typeof caps !== "object") return []
    const c = caps as Record<string, unknown>
    const out: string[] = []
    // Common shapes from the seed: processes / products / materials arrays.
    const arrayKeys = ["processes", "products", "materials", "substrates"]
    for (const k of arrayKeys) {
        const arr = c[k]
        if (Array.isArray(arr)) {
            for (const v of arr) {
                if (typeof v === "string" && v.length > 0 && out.length < 4) out.push(v)
            }
        }
    }
    return out.slice(0, 4)
}

/** Pull HQ / location out of the global supplier company_info JSONB. */
function extractHq(companyInfo: unknown): string | null {
    if (!companyInfo || typeof companyInfo !== "object") return null
    const c = companyInfo as Record<string, unknown>
    const hq = c.hq ?? c.location ?? c.country ?? null
    return typeof hq === "string" && hq.length > 0 ? hq : null
}

/** Extract up to N match reasons from all_match_reasons. */
function extractReasons(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw.filter((r): r is string => typeof r === "string" && r.length > 0)
}

// ─── Page ───────────────────────────────────────────────────────────────

export default async function ForgeV2SuppliersPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ role?: string; type?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const { role: roleRaw, type: typeRaw } = await searchParams

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()
    const project = result.project

    // Parse active filters from the query string.
    const activeRole: RampRole | null =
        roleRaw === "primary" || roleRaw === "secondary" || roleRaw === "backup"
            ? roleRaw
            : null
    const activeType: string | null = typeof typeRaw === "string" && typeRaw.length > 0 ? typeRaw : null

    // Fetch shortlist + library counts in parallel. Individual failures do not
    // break the page — each returns a neutral empty-state shape.
    const [shortlistRows, grounding] = await Promise.all([
        safeShortlistWithJoin(id),
        safeLibraryCounts(),
    ])

    // Role counts across the whole shortlist (pre-filter) — drives stat strip.
    const roleCounts = {
        primary: shortlistRows.filter((r) => r.rampRole === "primary").length,
        secondary: shortlistRows.filter((r) => r.rampRole === "secondary").length,
        backup: shortlistRows.filter((r) => r.rampRole === "backup").length,
    }

    // Type counts — distinct supplier_type values with a count.
    const typeMap = new Map<string, number>()
    for (const r of shortlistRows) {
        if (r.type) typeMap.set(r.type, (typeMap.get(r.type) ?? 0) + 1)
    }
    const typeCounts = Array.from(typeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)

    // Apply active filters for the rendered grid.
    const filtered = shortlistRows.filter((r) => {
        if (activeRole && r.rampRole !== activeRole) return false
        if (activeType && r.type !== activeType) return false
        return true
    })

    const viewProps: SuppliersViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        suppliers: filtered,
        totalShortlisted: shortlistRows.length,
        roleCounts,
        typeCounts,
        activeRole,
        activeType,
        grounding,
    }

    return <SuppliersView {...viewProps} />
}

// ─── Data loaders ──────────────────────────────────────────────────────

/**
 * Loads the project shortlist and joins each row to the global supplier
 * directory (community_rating / verification_status / capabilities / hq /
 * description). Returns an empty array on failure rather than throwing —
 * the page should degrade to the empty state, never crash.
 */
async function safeShortlistWithJoin(projectId: string): Promise<SuppliersSupplierRow[]> {
    try {
        const supabase = await createClient()

        const { data: shortlist, error } = await supabase
            .from("forge_supplier_shortlist")
            .select(
                "id, supplier_id, supplier_name, supplier_type, module_ids, ramp_role, best_match_score, all_match_reasons, notes",
            )
            .eq("project_id", projectId)
            .order("best_match_score", { ascending: false, nullsFirst: false })

        if (error || !shortlist || shortlist.length === 0) return []

        // Batch-fetch global supplier rows we need for rating / verify / hq.
        const supplierIds = shortlist
            .map((r) => r.supplier_id as string | null)
            .filter((x): x is string => typeof x === "string" && x.length > 0)

        const globalById = new Map<string, {
            capabilities: unknown
            community_rating: number | null
            company_info: unknown
            description: string | null
            domain_categories: string[] | null
            review_count: number | null
            used_by_count: number | null
            verification_status: string | null
        }>()

        if (supplierIds.length > 0) {
            const { data: globals } = await supabase
                .from("suppliers")
                .select(
                    "id, capabilities, community_rating, company_info, description, domain_categories, review_count, used_by_count, verification_status",
                )
                .in("id", supplierIds)

            if (globals) {
                for (const g of globals) {
                    globalById.set(g.id as string, {
                        capabilities: g.capabilities,
                        community_rating: g.community_rating as number | null,
                        company_info: g.company_info,
                        description: g.description as string | null,
                        domain_categories: g.domain_categories as string[] | null,
                        review_count: g.review_count as number | null,
                        used_by_count: g.used_by_count as number | null,
                        verification_status: g.verification_status as string | null,
                    })
                }
            }
        }

        return shortlist.map((r) => {
            const supplierId = r.supplier_id as string
            const g = globalById.get(supplierId)
            return {
                supplierId,
                shortlistId: r.id as string,
                name: (r.supplier_name as string) ?? "Untitled supplier",
                type: (r.supplier_type as string | null) ?? null,
                hq: extractHq(g?.company_info),
                description: g?.description ?? (r.notes as string | null) ?? null,
                rampRole: coerceRole(r.ramp_role),
                matchScore: (r.best_match_score as number | null) ?? null,
                modulesMatched: Array.isArray(r.module_ids) ? (r.module_ids as string[]).length : 0,
                matchReasons: extractReasons(r.all_match_reasons),
                capabilities: extractCapabilities(g?.capabilities),
                domainCategories: g?.domain_categories ?? [],
            }
        })
    } catch (err) {
        console.error("[SUPPLIERS-PAGE] shortlist + join failed:", err)
        return []
    }
}

async function safeLibraryCounts(): Promise<{ materials: number; processes: number; standards: number }> {
    try {
        const supabase = await createClient()
        const [m, p, s] = await Promise.all([
            supabase.from("material_properties").select("*", { count: "exact", head: true }),
            supabase.from("process_capabilities").select("*", { count: "exact", head: true }),
            supabase.from("design_standards").select("*", { count: "exact", head: true }),
        ])
        return {
            materials: m.count ?? 0,
            processes: p.count ?? 0,
            standards: s.count ?? 0,
        }
    } catch (err) {
        console.error("[SUPPLIERS-PAGE] library counts failed:", err)
        return { materials: 0, processes: 0, standards: 0 }
    }
}
