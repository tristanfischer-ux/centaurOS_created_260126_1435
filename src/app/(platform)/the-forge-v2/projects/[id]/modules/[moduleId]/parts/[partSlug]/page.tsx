/**
 * @file parts/[partSlug]/page.tsx — /the-forge-v2/projects/:id/modules/:moduleId/parts/:partSlug
 *
 * @description Mockup-faithful port of FORGE-MOCKUP-PART-DETAIL.html. Server
 * component that resolves the module + keyPart from the loaded project, then
 * delegates rendering to PartDetailView (a client component with scoped `.pd2`
 * CSS).
 *
 * Route params:
 *   - id:        project id
 *   - moduleId:  CadLabModule.id — matched against project.modules[].id
 *   - partSlug:  URL-encoded raw keyPart string — decoded and matched against
 *                module.keyParts[].
 *
 * Data policy:
 *   - loadCadLabProject(id) returns the full project. notFound() when the
 *     project fails to load, the module id isn't found, or the decoded part
 *     slug isn't a keyPart of the module.
 *   - Most per-part fields (tolerance, supplier, inspection, revision history,
 *     lifecycle state) don't exist in today's data model. The view renders
 *     honest "—" / "Not yet declared" copy for those sections.
 *   - Cost: if `project.aiCostEstimates[moduleId].parts[]` has a name that
 *     matches the current keyPart (exact match or short-name match), surface
 *     the AI cost estimate; otherwise "—".
 */

import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import type { PartCostEstimate } from "@/lib/cad-lab-types"

import { shortenPartName, partDescription } from "../../../../../../_components/part-name"
import { PartDetailView, type PartDetailSpec, type PartDetailRelated } from "./part-detail-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; moduleId: string; partSlug: string }> },
): Promise<Metadata> {
    const { id, partSlug } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Part · The Forge" }
    const decoded = safeDecode(partSlug)
    return { title: `${shortenPartName(decoded)} · ${result.project.name}` }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function safeDecode(slug: string): string {
    try {
        return decodeURIComponent(slug)
    } catch {
        return slug
    }
}

/**
 * Match a PartCostEstimate to a keyPart by name. Tolerates both exact matches
 * on the raw keyPart and short-name matches (e.g. AI estimate says "Left wing
 * spar" while the keyPart is "Left wing spar (T700 / 8552 prepreg)").
 */
function findPartCost(
    rawKeyPart: string,
    shortName: string,
    estimates: PartCostEstimate[] | undefined,
): PartCostEstimate | null {
    if (!estimates || estimates.length === 0) return null
    const needleRaw = rawKeyPart.trim().toLowerCase()
    const needleShort = shortName.trim().toLowerCase()
    for (const e of estimates) {
        if (!e.name) continue
        const candidate = e.name.trim().toLowerCase()
        if (candidate === needleRaw || candidate === needleShort) return e
        // Loose: AI estimate name is a prefix of the raw keyPart (or vice versa)
        if (needleRaw.startsWith(candidate) || candidate.startsWith(needleShort)) return e
    }
    return null
}

/**
 * Build the 6-cell spec strip. Material / process are populated from the AI
 * cost estimate when available; tolerance / finish / certification / mass are
 * empty at part level today.
 */
function buildSpecs(material: string | null, process: string | null): PartDetailSpec[] {
    return [
        { label: "Material", value: material ?? "—", empty: material == null },
        { label: "Dimensions", value: "—", empty: true },
        { label: "Tolerance", value: "—", empty: true },
        { label: "Process", value: process ?? "—", empty: process == null },
        { label: "Certification", value: "—", empty: true },
        { label: "Mass target", value: "—", empty: true },
    ]
}

// ─── Page ─────────────────────────────────────────────────────────────

export default async function ForgeV2PartDetailPage({
    params,
}: {
    params: Promise<{ id: string; moduleId: string; partSlug: string }>
}): Promise<React.ReactNode> {
    const { id, moduleId, partSlug } = await params

    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    const mod = (project.modules ?? []).find((m) => m.id === moduleId)
    if (!mod) notFound()

    const rawKeyPart = safeDecode(partSlug)
    const keyParts = mod.keyParts ?? []
    const matchedKeyPart =
        keyParts.find((k) => k === rawKeyPart)
        ?? keyParts.find((k) => k.trim().toLowerCase() === rawKeyPart.trim().toLowerCase())
    if (!matchedKeyPart) notFound()

    const displayName = shortenPartName(matchedKeyPart)
    const description = partDescription(matchedKeyPart)

    // ── Per-part cost (optional — from AI cost estimate)
    const moduleEstimate = project.aiCostEstimates?.[mod.id]
    const partCostEstimate = findPartCost(matchedKeyPart, displayName, moduleEstimate?.parts)

    // ── Spec strip — populated from AI cost estimate where possible
    const specs = buildSpecs(
        partCostEstimate?.material ?? null,
        partCostEstimate?.process ?? null,
    )

    // ── Related (sibling) parts within the same module
    const related: PartDetailRelated[] = keyParts
        .filter((k) => k !== matchedKeyPart)
        .slice(0, 12)
        .map((k) => ({
            slug: encodeURIComponent(k),
            name: shortenPartName(k),
            meta: partDescription(k),
        }))

    return (
        <PartDetailView
            project={{ id: project.id, name: project.name }}
            module={{
                id: mod.id,
                name: mod.name,
                purpose: mod.purpose,
                imageUrl: mod.imageUrl ?? null,
                imageModelUsed: mod.imageModelUsed ?? null,
                leadWeeks: mod.leadWeeks ?? null,
            }}
            part={{
                slug: partSlug,
                displayName,
                description,
                raw: matchedKeyPart,
            }}
            specs={specs}
            cost={
                partCostEstimate
                    ? {
                        gbp: partCostEstimate.cost,
                        type: partCostEstimate.type,
                        reasoning: partCostEstimate.reasoning ?? null,
                    }
                    : null
            }
            related={related}
        />
    )
}
