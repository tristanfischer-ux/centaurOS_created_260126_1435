/**
 * @file fork/page.tsx — /the-forge-v2/projects/:id/fork
 *
 * @description Fork is the "start a new revision" wizard landing. Side-by-side:
 *   - Left:  current locked revision (read-only summary of the brief)
 *   - Right: new-revision form skeleton (title · what-changed · tags)
 * The real editor lives behind the Brief lock flow, so every form control
 * renders disabled with honest "ships next round" copy. When the brief is
 * still in draft, the view shows an info card steering the user to the
 * brief-lock page first — you cannot fork from nothing.
 *
 * Mockup ref: FORGE-MOCKUP-FORK.html (scoped down per the V1 brief — no tree
 * diagram, no spine-delta grid; those land when the fork mutation is wired).
 *
 * Data sources (all via `loadCadLabProject`, which enforces auth + foundry
 * scoping inside `withAuth`):
 *   - project.research?.designBrief.{mission, targetCustomers, whyNow}
 *   - project.research?.designBrief.constraints (structured)
 *   - project.research?.designBrief.quantityTarget (legacy batch fallback)
 *   - project.briefLockedAt (drives locked vs draft rendering)
 *   - project.designRevision (revision letter derivation)
 *   - brief_revisions (highest revision_number row — latest change summary)
 *
 * No data is synthesised. Empty fields render neutral "Not yet declared"
 * copy — never the mockup's HAPS example strings.
 *
 * @related
 *   - View:   ./fork-view.tsx
 *   - Styles: ./fork-v2.css (scoped .fk2)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { ForkView, type ForkViewProps } from "./fork-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) {
        return { title: "Fork · The Forge" }
    }
    return { title: `Fork · ${result.project.name}` }
}

export default async function ForgeV2ForkPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // ── 1. Load project + latest revision summary in parallel ──────────
    const [loadResult, latestRevisionSummary] = await Promise.all([
        loadCadLabProject(id),
        safeLatestRevisionSummary(id),
    ])
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // ── 2. Derive current-revision state ───────────────────────────────
    const isLocked = project.briefLockedAt !== null
    const stampedAt = project.briefLockedAt ?? project.createdAt
    const revisionLetter = designRevisionToLetter(project.designRevision)

    // ── 3. Narrative — read from V2 designBrief shape, null if missing ─
    const designBrief = project.research?.designBrief ?? null
    const mission = designBrief?.mission?.trim() || null
    const targetCustomers = designBrief?.targetCustomers?.trim() || null
    const whyNow = designBrief?.whyNow?.trim() || null

    // ── 4. Constraints → display strings ───────────────────────────────
    const c = designBrief?.constraints ?? null
    const legacyBatchSize = designBrief?.quantityTarget?.trim() || null
    const unitCostCeilingGbp = typeof c?.unitCostCeilingGbp === "number" ? c.unitCostCeilingGbp : null
    const maxMassKg = typeof c?.maxMassKg === "number" ? c.maxMassKg : null
    const batchSize = typeof c?.batchSize === "number" ? String(c.batchSize) : legacyBatchSize

    const constraintsDisplay = {
        unitCostCeiling: unitCostCeilingGbp != null
            ? `£${unitCostCeilingGbp.toLocaleString("en-GB")}/unit`
            : null,
        firstShipDate: c?.firstShipDate ? formatDisplayDate(c.firstShipDate) : null,
        maxMass: maxMassKg != null ? `${maxMassKg.toFixed(1)} kg` : null,
        batchSize,
        markets: c?.markets && c.markets.length > 0 ? c.markets.join(" · ") : null,
        productionRegion: c?.productionRegion?.trim() || null,
    }

    const viewProps: ForkViewProps = {
        project: {
            id: project.id,
            name: project.name,
            subject: project.subject,
            designRevision: project.designRevision,
        },
        currentRevision: {
            letter: revisionLetter,
            isLocked,
            stampedAt,
        },
        narrative: {
            mission,
            targetCustomers,
            whyNow,
        },
        constraints: constraintsDisplay,
        latestRevisionSummary,
    }

    return <ForkView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Reads the highest-numbered brief_revisions row for this project and
 * returns its summary (or null on any failure). RLS handles tenancy; if
 * the table isn't populated yet for this project the Promise resolves
 * to null and the view renders without the "latest change note" slot.
 */
async function safeLatestRevisionSummary(projectId: string): Promise<string | null> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("brief_revisions")
            .select("summary")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
            .limit(1)
            .maybeSingle()
        if (error || !data) return null
        const summary = (data.summary as string | null) ?? ""
        return summary.trim().length > 0 ? summary : null
    } catch (err) {
        console.error("[FORK-PAGE] latest revision summary failed:", err)
        return null
    }
}

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "A"
    const idx = Math.floor(n) - 1
    if (idx < 26) return String.fromCharCode(65 + idx)
    const first = Math.floor(idx / 26) - 1
    const second = idx % 26
    return `${String.fromCharCode(65 + first)}${String.fromCharCode(65 + second)}`
}

/** Formats an ISO date for the constraints grid — "Nov 2026" style. */
function formatDisplayDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
}
