/**
 * @file promote/page.tsx — /the-forge-v2/projects/:id/promote (V2 — mockup-faithful rebuild).
 *
 * @description Confirm-screen for promoting a Forge project into a Product line.
 * This is NOT the supplier promotion the mockup file (FORGE-MOCKUP-PROMOTE.html)
 * was originally drawn for — the mockup's wizard shell (head + step nav +
 * side-by-side compare + "what this will create" checklist + wizard-foot) is
 * re-used here for the project → product lifecycle promotion that lives at this
 * URL.
 *
 * The promote mutation itself (`promoteFromCadLab` in src/actions/products.ts)
 * already runs automatically via `autoPromoteIfComplete` when a design reaches
 * `generated` state. This page is the deliberate / pre-auto surface: it
 * previews what the Product row will carry, but the CTA is intentionally
 * disabled so we don't ship a second mutation path that can diverge from the
 * auto flow. When the dedicated promote action lands this page flips the
 * button live.
 *
 * Data sources, slot by slot:
 *   - loadCadLabProject(id).project.name / subject / stage       → breadcrumb + title + left compare card
 *   - getProductByCadLabProjectId(id)                            → already-promoted variant (linked row)
 *   - project.stage                                              → isDesignComplete gate
 *   - project.modules[].keyParts                                 → part count (sum of keyParts arrays)
 *   - project.modules[].leadTimeSource === "supplier-quote"      → supplier-contact proxy count
 *   - project.aiCostEstimates[moduleId].totalPerUnit             → rolled-up COGS (null when zero)
 *   - project.systemIllustrationUrl                              → "hero image will be seeded" checklist row
 *   - project.productOverview                                    → "description will carry over" checklist row
 *
 * Empty-state policy: every compare row + checklist row renders "—" /
 * "Not declared" / "No estimate" when the underlying field is missing. We
 * never synthesise the mockup's Zimmermann / Astra example content.
 *
 * Mockup ref: FORGE-MOCKUP-PROMOTE.html.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { getProductByCadLabProjectId } from "@/actions/products"

import { PromoteView, type PromoteChecklistItem, type PromoteViewProps } from "./promote-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Promote · The Forge" }
    return {
        title: `Promote · ${result.project.name}`,
        description: "Promote a Forge project into a commercial Product line.",
    }
}

export default async function ForgeV2PromotePage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    const loadResult = await loadCadLabProject(id)
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // Check for an existing linked Product row. Service returns `{ data: ... }`
    // on success and `{ error: ... }` on failure — we treat failure as "no
    // linked product" (the surface still renders; the user just won't see
    // the success banner).
    const linkedResult = await getProductByCadLabProjectId(project.id)
    const linkedProduct = "error" in linkedResult ? null : linkedResult.data

    // ── Lifecycle gate ────────────────────────────────────────────────
    // Design-complete projects seed the Products row at "prototyping";
    // everything earlier lands at "concept" so the commercial surface
    // knows this is still a hypothesis.
    const isDesignComplete = project.stage === "generated" || project.stage === "complete"
    const targetLifecycle: "concept" | "prototyping" = isDesignComplete ? "prototyping" : "concept"

    // ── Aggregate stats (honest counts, no fabrication) ───────────────
    const modules = project.modules ?? []
    const moduleCount = modules.length

    // partCount = sum of keyParts across modules. keyParts can be undefined
    // on pre-2026 modules so we coerce safely.
    const partCount = modules.reduce((acc, m) => acc + (Array.isArray(m.keyParts) ? m.keyParts.length : 0), 0)

    // supplierCount proxy: modules whose leadTimeSource is a supplier quote.
    // When the dedicated supplier_shortlists table lands this becomes a
    // direct count; for now it's the most honest signal available.
    const supplierCount = modules.filter((m) => m.leadTimeSource === "supplier-quote").length

    // rollupCogsGbp: sum of per-module AI cost estimates (totalPerUnit). We
    // only report a number when at least one module has a non-zero estimate
    // — otherwise null so the compare card shows "—" instead of "£0".
    const costEstimates = project.aiCostEstimates ?? {}
    const rollupCogsRaw = Object.values(costEstimates).reduce((sum, est) => {
        const v = (est as { totalPerUnit?: number })?.totalPerUnit
        return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0)
    }, 0)
    const rollupCogsGbp = rollupCogsRaw > 0 ? rollupCogsRaw : null

    const hasOverview = typeof project.productOverview === "string" && project.productOverview.trim().length > 0
    const hasHeroImage = typeof project.systemIllustrationUrl === "string" && project.systemIllustrationUrl.trim().length > 0

    // ── Pre-promote checklist ─────────────────────────────────────────
    // Mirrors the mockup's "What this will create" block. Each row is a
    // concrete assertion about what the Products row will inherit — tick
    // means the source field is populated; pending means it's missing but
    // promotion is still allowed (the Product row just starts thinner).
    const checklist: PromoteChecklistItem[] = [
        {
            title: "Product name seeded",
            meta: `Product row will be named "${project.name}".`,
            status: "Ready",
            done: true,
        },
        {
            title: "Description carries over",
            meta: hasOverview
                ? `${countWords(project.productOverview ?? "")} words of product overview flow into the Product description field.`
                : "No product overview authored yet — the Product row will start with an empty description until the brief is written.",
            status: hasOverview ? "Ready" : "Thin",
            done: hasOverview,
        },
        {
            title: "Hero illustration carries over",
            meta: hasHeroImage
                ? "The system illustration seeds the Product hero image."
                : "No system illustration yet — the Product row will render without a hero until one is generated.",
            status: hasHeroImage ? "Ready" : "No image",
            done: hasHeroImage,
        },
        {
            title: "Module rollup seeded",
            meta: moduleCount > 0
                ? `${moduleCount} module${moduleCount === 1 ? "" : "s"} roll up into the Product build tab (${partCount} key part${partCount === 1 ? "" : "s"} declared).`
                : "No modules decomposed yet — Product build tab starts empty.",
            status: moduleCount > 0 ? "Ready" : "Empty",
            done: moduleCount > 0,
        },
        {
            title: "Supplier links carried",
            meta: supplierCount > 0
                ? `${supplierCount} module${supplierCount === 1 ? "" : "s"} quoted by a real supplier — those links flow into the Product supplier tab.`
                : "No supplier quotes recorded — Product supplier tab starts empty.",
            status: supplierCount > 0 ? "Ready" : "Empty",
            done: supplierCount > 0,
        },
        {
            title: "Unit COGS rolled up",
            meta: rollupCogsGbp != null
                ? `£${Math.round(rollupCogsGbp).toLocaleString("en-GB")}/unit rolls up from AI cost estimates across the decomposed modules.`
                : "No AI cost estimates yet — Product starts without unit economics until the Cost artefact is run.",
            status: rollupCogsGbp != null ? "Ready" : "No estimate",
            done: rollupCogsGbp != null,
        },
        {
            title: "Lifecycle seed",
            meta: isDesignComplete
                ? `Design is ${project.stage} — Product row lands at "prototyping".`
                : `Design stage is "${project.stage || "pending"}" — Product row lands at "concept" (earlier-stage row).`,
            status: targetLifecycle,
            done: true,
        },
        {
            title: "Archive link back to project",
            meta: "Product row keeps a cad_lab_project_id pointer back to this Forge project for the full lineage.",
            status: "On confirm",
            done: false,
        },
    ]

    const viewProps: PromoteViewProps = {
        project: {
            id: project.id,
            name: project.name,
            subject: project.subject,
            stage: project.stage,
        },
        linkedProduct,
        targetLifecycle,
        isDesignComplete,
        stats: {
            moduleCount,
            partCount,
            supplierCount,
            rollupCogsGbp,
        },
        checklist,
    }

    return <PromoteView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Counts whitespace-separated tokens in a string, ignoring empties. */
function countWords(s: string): number {
    return s.split(/\s+/).filter(Boolean).length
}
