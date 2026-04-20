/**
 * @file bom/new/page.tsx — /the-forge-v2/projects/:id/bom/new
 *
 * @description Add-BOM-line form — mockup-faithful port of
 * FORGE-MOCKUP-BOM-ADD.html. Server component loads the project (for module
 * selector + design revision), the project-level supplier shortlist (for the
 * four-row supplier picker), and the first 50 rows of the material_properties
 * engineering library (for the material hint list). Hands a typed props
 * bundle to BomAddView.
 *
 * Empty-state policy: the form is fully interactive, but Submit is disabled
 * with a "Part persistence ships with the parts_spec table" hint — no parts
 * are written to the database from this screen. Supplier shortlist populates
 * from forge_supplier_shortlist rows that already exist on the project; if
 * none are present, the supplier section renders an honest "no shortlist
 * yet" empty state. If no modules exist the module selector disables with a
 * "Decompose the brief first" link back to /modules.
 *
 * @related
 *   - View:   ./bom-add-view.tsx
 *   - Styles: ./bom-add-v2.css (scoped .ba2)
 *   - Mockup: FORGE-MOCKUP-BOM-ADD.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import {
    BomAddView,
    type BomAddMaterialOption,
    type BomAddModuleOption,
    type BomAddSupplierOption,
    type BomAddViewProps,
} from "./bom-add-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Add BOM line · The Forge" }
    return { title: `Add BOM line · ${r.project.name}` }
}

export default async function ForgeV2BomAddPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // ── 1. Module options (for the module selector) ────────────────
    const moduleOptions: BomAddModuleOption[] = modules.map((m, i) => ({
        id: m.id,
        label: `M${i + 1} · ${m.name}`,
    }))

    // ── 2. Supplier shortlist (project-scoped) ─────────────────────
    const suppliers = await safeSupplierShortlist(id)

    // ── 3. Material library — first 50 rows for the hint list ─────
    const materials = await safeMaterialLibrary()

    const viewProps: BomAddViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        modules: moduleOptions,
        suppliers,
        materials,
    }

    return <BomAddView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function safeSupplierShortlist(projectId: string): Promise<BomAddSupplierOption[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("forge_supplier_shortlist")
            .select("supplier_id, supplier_name, supplier_type, ramp_role, best_match_score, all_match_reasons, notes")
            .eq("project_id", projectId)
            .order("best_match_score", { ascending: false, nullsFirst: false })
        if (error || !data) return []
        return data.map((r) => ({
            id: r.supplier_id,
            name: r.supplier_name,
            meta: [
                r.supplier_type,
                r.ramp_role,
                r.best_match_score != null ? `score ${Math.round(r.best_match_score)}` : null,
                ...(Array.isArray(r.all_match_reasons) ? r.all_match_reasons.slice(0, 2) : []),
            ]
                .filter(Boolean)
                .join(" · ") || null,
            rampRole: r.ramp_role ?? null,
        }))
    } catch (err) {
        console.error("[BOM-ADD-PAGE] supplier shortlist failed:", err)
        return []
    }
}

async function safeMaterialLibrary(): Promise<BomAddMaterialOption[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("material_properties")
            .select("material_code, material_name, material_family, common_processes")
            .order("material_family", { ascending: true })
            .limit(50)
        if (error || !data) return []
        return data.map((r) => ({
            code: r.material_code,
            name: r.material_name,
            family: r.material_family,
            processes: Array.isArray(r.common_processes) ? r.common_processes : [],
        }))
    } catch (err) {
        console.error("[BOM-ADD-PAGE] material library failed:", err)
        return []
    }
}
