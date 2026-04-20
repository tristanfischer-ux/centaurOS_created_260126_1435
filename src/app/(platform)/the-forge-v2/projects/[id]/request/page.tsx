/**
 * @file request/page.tsx — /the-forge-v2/projects/:id/request
 *
 * @description RFQ bundle creation flow — mockup-faithful port of
 * FORGE-MOCKUP-REQUEST.html. Founder picks suppliers (from the project's
 * forge_supplier_shortlist) plus a subset of BOM parts (from each module's
 * keyParts), drafts a cover message, and previews the generated bundle
 * before sending. No mutation is wired today — Submit is disabled.
 *
 * Empty-state policy (per CLAUDE.md):
 *   - No shortlisted suppliers? Show a top-level "Shortlist suppliers first"
 *     gate card with a link to /suppliers. Do NOT render the form.
 *   - No modules or no keyParts at all? Show a "Decompose the brief first"
 *     gate card linking to /modules. Do NOT render the form.
 * Never fake mockup specifics (Zimmermann, Astra, ±0.3, etc.) — real
 * supplier names + real part names only.
 *
 * @related
 *   - View:   ./request-view.tsx
 *   - Styles: ./request-v2.css (scoped .rq2)
 *   - Mockup: FORGE-MOCKUP-REQUEST.html
 *   - Data:   loadCadLabProject (modules + keyParts)
 *             forge_supplier_shortlist (suppliers selected for this project)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"
import { shortenPartName, partDescription } from "../../../_components/part-name"

import {
    RequestView,
    type RequestViewProps,
    type ShortlistSupplier,
    type RequestModuleGroup,
    type RequestPartOption,
} from "./request-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Request · The Forge" }
    return { title: `RFQ bundle · ${r.project.name}` }
}

export default async function ForgeV2RequestPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // ── 1. Shortlisted suppliers ─────────────────────────────────
    const suppliers = await safeLoadShortlist(id)

    // ── 2. Part pool ─ one group per module, one row per keyPart ─
    const moduleGroups: RequestModuleGroup[] = modules.map((m, i) => {
        const parts: RequestPartOption[] = (m.keyParts ?? []).map((kp, idx) => ({
            id: `${m.id}::${idx}`,
            name: shortenPartName(kp),
            meta: partDescription(kp),
            moduleId: m.id,
        }))
        return {
            moduleId: m.id,
            moduleNum: `M${i + 1}`,
            moduleName: m.name,
            parts,
        }
    })

    const totalParts = moduleGroups.reduce((acc, g) => acc + g.parts.length, 0)

    // ── 3. Request history on this project (placeholder) ─────────
    // We don't track prior RFQ bundles per project yet — the send pipeline
    // lands with the RFQ spine. Render an honest "no prior requests" state
    // in the sidebar rather than faking 22 Mar / 2 of 3 / 5 Apr Astra.
    const requestHistory = { sentCount: 0, lastSentIso: null as string | null }

    const viewProps: RequestViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        suppliers,
        modules: moduleGroups,
        totalParts,
        requestHistory,
    }

    return <RequestView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function safeLoadShortlist(projectId: string): Promise<ShortlistSupplier[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("forge_supplier_shortlist")
            .select("id, supplier_id, supplier_name, supplier_type, ramp_role, is_verified, best_match_score, module_ids")
            .eq("project_id", projectId)
            .order("added_at", { ascending: true })

        if (error || !data) {
            if (error) {
                console.error("[REQUEST-PAGE] shortlist load failed:", error.message)
            }
            return []
        }

        return data.map((row) => ({
            id: row.id,
            supplierId: row.supplier_id,
            name: row.supplier_name,
            type: row.supplier_type ?? null,
            rampRole: (row.ramp_role as string | null) ?? null,
            isVerified: Boolean(row.is_verified),
            matchScore: typeof row.best_match_score === "number" ? row.best_match_score : null,
            moduleIds: Array.isArray(row.module_ids) ? (row.module_ids as string[]) : [],
        }))
    } catch (err) {
        console.error("[REQUEST-PAGE] shortlist load threw:", err)
        return []
    }
}
