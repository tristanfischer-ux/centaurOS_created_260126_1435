/**
 * @file risks/page.tsx — /the-forge-v2/projects/:id/risks
 *
 * @description Risks artefact — mockup-faithful port of FORGE-MOCKUP-RISKS.html
 * (populated) + FORGE-MOCKUP-EMPTY-RISKS.html (empty). Server component reads
 * the project, flattens every module's failureModes[] + unknowns[] into risk
 * rows grouped by severity, and hands a typed props bundle to RisksView.
 *
 * Empty-state policy: there is no dedicated risks table yet. Severity / owner
 * / due date / status / mitigation are honestly blank on every row, and the
 * resolved count is always 0. When both failureModes and unknowns are empty
 * across every module, the view renders the empty-state hero + library pills.
 *
 * Severity mapping (conservative — we never invent per-row severity):
 *   - failureModes → "med"  (honest default; tagged "From module decomposition")
 *   - unknowns     → "low"  (open questions, tagged "Open question")
 *   - "high" count is always 0 (no blocking logic until risks table ships)
 *
 * @related
 *   - View:   ./risks-view.tsx
 *   - Styles: ./risks-v2.css (scoped .rk2)
 *   - Mockup: FORGE-MOCKUP-RISKS.html / FORGE-MOCKUP-EMPTY-RISKS.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { RisksView, type RiskRow, type RisksViewProps } from "./risks-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Risks · The Forge" }
    return { title: `Risks · ${r.project.name}` }
}

export default async function ForgeV2RisksPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // ── 1. Flatten module failureModes + unknowns into risk rows ────────
    const risks: RiskRow[] = []
    let failureModeSourceModules = 0

    for (const m of modules) {
        const failureModes = m.failureModes ?? []
        const unknowns = m.unknowns ?? []

        if (failureModes.length > 0) failureModeSourceModules += 1

        failureModes.forEach((text, idx) => {
            if (typeof text !== "string" || text.trim().length === 0) return
            risks.push({
                id: `${m.id}-fm-${idx}`,
                severity: "med",
                category: `Known failure mode · ${m.name}`,
                sourceBadge: "From module decomposition",
                title: text.trim(),
                moduleId: m.id,
                moduleName: m.name,
            })
        })

        unknowns.forEach((text, idx) => {
            if (typeof text !== "string" || text.trim().length === 0) return
            risks.push({
                id: `${m.id}-uk-${idx}`,
                severity: "low",
                category: `Open question · ${m.name}`,
                sourceBadge: "Open question",
                title: text.trim(),
                moduleId: m.id,
                moduleName: m.name,
            })
        })
    }

    // ── 2. Summary counts (honest — derived only from real data) ────────
    const counts = {
        blocking: risks.filter((r) => r.severity === "high").length,
        medium: risks.filter((r) => r.severity === "med").length,
        low: risks.filter((r) => r.severity === "low").length,
        resolved: 0,
        total: risks.length,
    }

    // ── 3. Engineering library grounding counts ─────────────────────────
    const libraryCounts = await safeLibraryCounts()

    const viewProps: RisksViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        counts,
        risks,
        grounding: {
            failureModeLibrary: failureModeSourceModules,
            hardware: libraryCounts.hardware,
            materials: libraryCounts.materials,
        },
    }

    return <RisksView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function safeLibraryCounts(): Promise<{ materials: number; hardware: number }> {
    try {
        const supabase = await createClient()
        const [m, h] = await Promise.all([
            supabase.from("material_properties").select("*", { count: "exact", head: true }),
            supabase.from("standard_hardware").select("*", { count: "exact", head: true }),
        ])
        return {
            materials: m.count ?? 0,
            hardware: h.count ?? 0,
        }
    } catch (err) {
        console.error("[RISKS-PAGE] library counts failed:", err)
        return { materials: 0, hardware: 0 }
    }
}
