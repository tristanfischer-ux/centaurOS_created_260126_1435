/**
 * @file bom/page.tsx — /the-forge-v2/projects/:id/bom
 *
 * @description BOM artefact — mockup-faithful port of FORGE-MOCKUP-BOM.html.
 * Server component reads the project, flattens every module's keyParts into
 * BOM rows grouped by module, pulls module-level cost estimates to build the
 * bottom-right cost stack, and hands a typed props bundle to BomView.
 *
 * Empty-state policy: per-part material, tolerance, supplier, unit £ and
 * spec-fit don't exist yet — they ship with a dedicated parts_spec table in
 * a future migration. Every such column renders honest "—" / "Not yet
 * shortlisted" placeholders. We never synthesise mockup specifics (T800
 * prepreg, Astra Composites, etc.).
 *
 * @related
 *   - View:   ./bom-view.tsx
 *   - Styles: ./bom-v2.css (scoped .bm2)
 *   - Mockup: FORGE-MOCKUP-BOM.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import {
    loadBomRunStatus,
    runBomGenerator,
} from "@/actions/specialists/run-bom-generator"
import { createClient } from "@/lib/supabase/server"
import { shortenPartName, partDescription } from "../../../_components/part-name"

import { BomView, type BomCategoryGroup, type BomCostStackLine, type BomPartRow, type BomViewProps } from "./bom-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "BOM · The Forge" }
    return { title: `BOM · ${r.project.name}` }
}

export default async function ForgeV2BomPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const [result, bomRunStatus] = await Promise.all([
        loadCadLabProject(id),
        safeBomRunStatus(id),
    ])
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // Bind the BOM orchestrator to this project id so the client button
    // component doesn't need to pass it explicitly. The `"use server"`
    // boundary is on run-bom-generator.ts itself.
    async function runBomAction(): Promise<
        { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
    > {
        "use server"
        const res = await runBomGenerator(id, "manual")
        if (res.ok) return { ok: true, runId: res.runId }
        return { ok: false, error: res.error, errorCode: res.errorCode }
    }

    // ── 1. BOM categories ────────────────────────────────────────
    // One category per module. Each keyPart becomes a row. Per-part qty/cost
    // are unknown today, so we show 1 / — until a parts_spec table lands.
    const costEstimatesById = project.aiCostEstimates ?? {}

    const categories: BomCategoryGroup[] = modules.map((m, i) => {
        const parts: BomPartRow[] = (m.keyParts ?? []).map((kp, idx) => ({
            id: `${m.id}-${idx}`,
            name: shortenPartName(kp),
            // Preserve the original keyPart string for the part-detail route
            // (the slug matches against m.keyParts[] after decodeURIComponent).
            slug: kp,
            meta: partDescription(kp),
            qty: 1,
            unitCostGbp: null,
            extCostGbp: null,
            leadWeeks: null,
            moduleId: m.id,
            moduleLeadWeeks: typeof m.leadWeeks === "number" ? m.leadWeeks : null,
        }))

        const est = costEstimatesById[m.id]
        const moduleUnitCostGbp =
            est && typeof est.totalPerUnit === "number" ? est.totalPerUnit : null

        return {
            moduleId: m.id,
            moduleNum: `M${i + 1}`,
            moduleName: m.name,
            moduleUnitCostGbp,
            moduleLeadWeeks: typeof m.leadWeeks === "number" ? m.leadWeeks : null,
            parts,
        }
    })

    const totalParts = categories.reduce((acc, c) => acc + c.parts.length, 0)

    // ── 2. Cost stack ────────────────────────────────────────────
    // Per-module roll-up — the founder wants to see where the £172k came from,
    // but honestly: we only have module totals (AI estimate), not the full
    // labour / NRE breakdown the mockup shows. So we render a module-level
    // stack instead of fabricating labour/NRE line items.
    const costStack: BomCostStackLine[] = []
    let rolledUpTotal: number | null = null
    for (const cat of categories) {
        if (cat.moduleUnitCostGbp != null) {
            costStack.push({
                label: `${cat.moduleNum} · ${cat.moduleName}`,
                valueGbp: cat.moduleUnitCostGbp,
                kind: "line",
            })
            rolledUpTotal = (rolledUpTotal ?? 0) + cat.moduleUnitCostGbp
        }
    }
    if (rolledUpTotal != null) {
        costStack.push({
            label: "All-in unit cost (module roll-up)",
            valueGbp: rolledUpTotal,
            kind: "total",
        })
    }

    // ── 3. Suppliers engaged — from forge_supplier_shortlist ─────
    const suppliersEngaged = await safeSupplierCount(id)

    // ── 4. Engineering library grounding counts ──────────────────
    const grounding = await safeLibraryCounts()

    // ── 5. Unit cost ceiling from brief (if declared) ────────────
    const unitCostCeilingGbp =
        project.research?.designBrief?.constraints?.unitCostCeilingGbp ?? null

    const viewProps: BomViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        header: {
            totalParts,
            moduleCount: modules.length,
            // SpecD = parts tagged with material/tolerance/supplier. We don't
            // track this yet, so honestly it's 0 until parts_spec ships.
            specdParts: 0,
            suppliersEngaged: suppliersEngaged.total,
            suppliersPrimary: suppliersEngaged.primary,
        },
        unitCostGbp: rolledUpTotal,
        unitCostCeilingGbp,
        categories,
        costStack,
        grounding,
        bomRun: {
            status: bomRunStatus.status,
            startedAt: bomRunStatus.startedAt ?? null,
            finishedAt: bomRunStatus.finishedAt ?? null,
            errorCode: bomRunStatus.errorCode ?? null,
            errorMessage: bomRunStatus.errorMessage ?? null,
        },
        noModules: modules.length === 0,
        runBomAction,
    }

    return <BomView {...viewProps} />
}

async function safeBomRunStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadBomRunStatus>>> {
    try {
        return await loadBomRunStatus(projectId)
    } catch (err) {
        console.error("[BOM-PAGE] bom-run status failed:", err)
        return { status: "not-started" }
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function safeSupplierCount(projectId: string): Promise<{ total: number; primary: number }> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("forge_supplier_shortlist")
            .select("ramp_role")
            .eq("project_id", projectId)
        if (error || !data) return { total: 0, primary: 0 }
        return {
            total: data.length,
            primary: data.filter((r) => (r.ramp_role as string) === "primary").length,
        }
    } catch (err) {
        console.error("[BOM-PAGE] supplier count failed:", err)
        return { total: 0, primary: 0 }
    }
}

async function safeLibraryCounts(): Promise<{ materials: number; hardware: number; processes: number }> {
    try {
        const supabase = await createClient()
        const [m, h, p] = await Promise.all([
            supabase.from("material_properties").select("*", { count: "exact", head: true }),
            supabase.from("standard_hardware").select("*", { count: "exact", head: true }),
            supabase.from("process_capabilities").select("*", { count: "exact", head: true }),
        ])
        return {
            materials: m.count ?? 0,
            hardware: h.count ?? 0,
            processes: p.count ?? 0,
        }
    } catch (err) {
        console.error("[BOM-PAGE] library counts failed:", err)
        return { materials: 0, hardware: 0, processes: 0 }
    }
}
