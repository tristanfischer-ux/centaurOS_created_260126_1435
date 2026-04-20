/**
 * @file modules/[moduleId]/page.tsx — /the-forge-v2/projects/:id/modules/:moduleId
 *
 * @description Module detail page — mockup-faithful port of
 * FORGE-MOCKUP-MODULE-DETAIL.html. Server component that resolves the
 * module off `loadCadLabProject(id).project.modules[]`, derives the
 * typed props bundle (including honest empty states for fields not yet
 * authored), and hands it to `ModuleDetailView`.
 *
 * Empty-state policy: every field that isn't captured yet renders as
 * "not yet declared" / "—" rather than fabricating mockup specifics.
 * No HAPS UAV copy leaks through.
 *
 * Mockup ref: FORGE-MOCKUP-MODULE-DETAIL.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import type { CadLabModule } from "@/lib/cad-lab-types"

import {
    ModuleDetailView,
    type ModuleDetailGroundedPill,
    type ModuleDetailPartRow,
    type ModuleDetailViewProps,
} from "./module-detail-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; moduleId: string }> },
): Promise<Metadata> {
    const { id, moduleId } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Module · The Forge" }
    const mod = (result.project.modules ?? []).find((m) => m.id === moduleId)
    if (!mod) return { title: `Module · ${result.project.name}` }
    return { title: `${mod.name} · ${result.project.name}` }
}

export default async function ForgeV2ModuleDetailPage({
    params,
}: {
    params: Promise<{ id: string; moduleId: string }>
}): Promise<React.ReactNode> {
    const { id, moduleId } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []
    const mod = modules.find((m) => m.id === moduleId)
    if (!mod) notFound()

    const moduleIndex = modules.findIndex((m) => m.id === moduleId)
    const moduleNum = `M${moduleIndex + 1}`

    // ── Revision chip ───────────────────────────────────────────
    // Shown in the mockup as "Stable · rev A" next to the title. We only
    // assert "Stable" when status === "generated" (the pipeline's terminal
    // green state); otherwise we fall back to the status label or hide.
    const revisionChip = revisionChipLabel(mod)

    // ── Lead-time provenance caption ───────────────────────────
    const leadSourceLabel = leadSourceCaption(mod.leadTimeSource)

    // ── Grounded-in pills ──────────────────────────────────────
    // The mockup seeds two static pills (Titanium Properties, Composite
    // Properties). We drive them from whatever grounding data the module
    // actually has — seed template, mirror, reference templates. When
    // none exist we render the honest empty state.
    const groundedIn: ModuleDetailGroundedPill[] = []
    if (mod.seedTemplateSlug) {
        groundedIn.push({
            label: humaniseSlug(mod.seedTemplateSlug),
            href: null,
        })
    }
    if (mod.mirrorOf) {
        groundedIn.push({
            label: `Mirrors ${mod.mirrorOf}`,
            href: `/the-forge-v2/projects/${project.id}/modules/${mod.mirrorOf}`,
        })
    }
    const refs = mod.templateMatchResult?.referenceTemplates ?? []
    for (const r of refs.slice(0, 3)) {
        groundedIn.push({
            label: r.name ?? humaniseSlug(r.slug),
            href: null,
        })
    }

    // ── Parts rollup ───────────────────────────────────────────
    // Per-part masses/materials/suppliers aren't persisted yet (the
    // CadLabModule shape only carries keyParts: string[]). We render one
    // row per keyPart with null mass/material/supplier so every row is
    // honest about what's known.
    const parts: ModuleDetailPartRow[] = (mod.keyParts ?? []).map((k) => ({
        slug: k,
        name: k,
        qty: 1,
        massKg: null,
        material: null,
        supplier: null,
    }))

    // ── Concept render + drawing sources ───────────────────────
    const conceptRenderUrl = mod.imageUrl ?? null
    const conceptRenderModel = mod.imageModelUsed ?? null
    // No per-module engineering drawing url is captured yet — the right
    // hero pane stays empty with an honest caveat until one ships.
    const engineeringDrawingUrl: string | null = null

    const viewProps: ModuleDetailViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        module: {
            id: mod.id,
            moduleNum,
            name: mod.name,
            purpose: typeof mod.purpose === "string" && mod.purpose.length > 0 ? mod.purpose : null,
            description: typeof mod.description === "string" && mod.description.length > 0 ? mod.description : null,
            whyItMatters: typeof mod.whyItMatters === "string" && mod.whyItMatters.length > 0 ? mod.whyItMatters : null,
            revisionChip,
            inputs: mod.inputs ?? [],
            outputs: mod.outputs ?? [],
            keyParts: mod.keyParts ?? [],
            failureModes: mod.failureModes ?? [],
            unknowns: mod.unknowns ?? [],
            leadWeeks: typeof mod.leadWeeks === "number" ? mod.leadWeeks : null,
            leadSourceLabel,
            conceptRenderUrl,
            conceptRenderModel,
            engineeringDrawingUrl,
        },
        groundedIn,
        parts,
        currentMassKg: typeof mod.estimatedMassKg === "number" ? mod.estimatedMassKg : null,
        budgetMassKg:
            typeof (mod as CadLabModule & { budgetMassKg?: number }).budgetMassKg === "number"
                ? (mod as CadLabModule & { budgetMassKg?: number }).budgetMassKg ?? null
                : null,
    }

    return <ModuleDetailView {...viewProps} />
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Builds the "Stable · rev A" chip. Only asserts the cheerful "Stable" label
 * when the pipeline status is "generated" (terminal green). Otherwise it
 * reflects the actual status so the header doesn't lie.
 */
function revisionChipLabel(mod: CadLabModule): string | null {
    const rev = mod.revisionNumber ?? 1
    const revLetter = String.fromCharCode(64 + Math.min(Math.max(rev, 1), 26)) // 1 → A
    switch (mod.status) {
        case "generated":
            return `Stable · rev ${revLetter}`
        case "specified":
        case "interface_ready":
            return `Draft · rev ${revLetter}`
        case "researched":
            return `Research · rev ${revLetter}`
        case "failed":
            return `Failed · rev ${revLetter}`
        default:
            return null
    }
}

function leadSourceCaption(source: CadLabModule["leadTimeSource"]): string | null {
    switch (source) {
        case "supplier-quote":      return "Supplier quote"
        case "ai-estimate":         return "AI estimate"
        case "historical-analogue": return "Historical analogue"
        case "specialist-judgement":return "Specialist judgement"
        default:                    return null
    }
}

/** Turns "ti_properties" / "titanium-properties" into "Titanium Properties". */
function humaniseSlug(slug: string): string {
    return slug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
}
