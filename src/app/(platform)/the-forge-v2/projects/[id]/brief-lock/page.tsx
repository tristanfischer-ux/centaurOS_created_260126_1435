/**
 * @file brief-lock/page.tsx — /the-forge-v2/projects/:id/brief-lock (V2 — mockup-faithful rebuild).
 *
 * @description Confirm-screen before the Brief lock event. Summarises what is
 * about to be frozen (narrative + constraints + regulatory), lists the
 * revision bump (N → N+1), aggregates still-open unknowns / failure modes /
 * un-spec'd parts / un-shortlisted suppliers as things the user will "lock
 * in", and renders a big Lock CTA.
 *
 * This page NEVER mutates — the lock server action lives elsewhere and the
 * CTA button here is disabled. When the action lands it replaces the
 * disabled button with a client-component form. Data shape is otherwise
 * stable.
 *
 * Data sources, slot by slot:
 *   - loadCadLabProject(id).project.name / subject        → breadcrumb + product line
 *   - project.designRevision                              → current revision letter
 *   - brief_revisions (newest revision_number)            → current revision number shown in title
 *   - project.briefLockedAt / project.briefLockedBy       → already-locked variant
 *   - project.research.designBrief.{mission,...}          → narrative slots (null → empty state)
 *   - project.research.designBrief.constraints            → constraints display
 *   - project.research.designBrief.regulatory[]           → regulatory codes
 *   - project.modules[].unknowns / failureModes           → still-open aggregates
 *   - project.modules[].keyParts count                    → parts not yet spec'd proxy
 *   - project.modules[].status / leadTimeSource           → suppliers not yet shortlisted proxy
 *
 * Empty-state policy: every slot renders a neutral "not declared" link to
 * the Brief editor when the underlying field is missing. We never
 * synthesise the mockup's HAPS example content.
 *
 * Mockup ref: FORGE-MOCKUP-BRIEF-LOCK.html.
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadBriefLockStatus } from "@/actions/brief-lock"
import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { BriefLockView, type BriefLockViewProps, type ChecklistItem, type StillOpenItem } from "./brief-lock-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Lock brief · The Forge" }
    return {
        title: `Lock brief · ${result.project.name}`,
        description: "Confirm the Brief lock — ownership flips from Products to Forge.",
    }
}

export default async function ForgeV2BriefLockPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // ── 1. Fetch project + newest brief_revision + canonical lock status
    //        in parallel. loadCadLabProject enforces auth + foundry
    //        scoping. `loadBriefLockStatus` is the canonical lock-state
    //        reader (project row + newest revision); we prefer it over
    //        reading the stamp off the project alone so the UI
    //        stays correct when the revisions table and the project row
    //        briefly disagree. Both are soft failures — if either query
    //        fails we fall back to the project's in-row fields.
    const [loadResult, currentRevisionNumber, lockStatus] = await Promise.all([
        loadCadLabProject(id),
        readCurrentRevisionNumber(id),
        safeLockStatus(id),
    ])
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // ── 2. Derive narrative + constraints (identical shape to brief/page.tsx) ──
    const designBrief = project.research?.designBrief ?? null

    const mission = designBrief?.mission?.trim() || null
    const targetCustomers = designBrief?.targetCustomers?.trim() || null
    const whyNow = designBrief?.whyNow?.trim() || null

    const c = designBrief?.constraints ?? null
    const unitCostCeilingGbp = typeof c?.unitCostCeilingGbp === "number" ? c.unitCostCeilingGbp : null
    const maxMassKg = typeof c?.maxMassKg === "number" ? c.maxMassKg : null
    const quantityTarget = designBrief?.quantityTarget?.trim() || null
    const batchSize = typeof c?.batchSize === "number" ? String(c.batchSize) : quantityTarget

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

    const regulatoryCodes = (designBrief?.regulatory ?? [])
        .filter((r) => typeof r?.code === "string" && r.code.trim().length > 0)
        .map((r) => r.code.trim())

    // ── 3. Module aggregates for "still open" ──────────────────────────
    const modules = project.modules ?? []
    const moduleCount = modules.length

    const modulesWithUnknowns = modules.filter((m) => Array.isArray(m.unknowns) && m.unknowns.length > 0)
    const modulesWithFailureModes = modules.filter((m) => Array.isArray(m.failureModes) && m.failureModes.length > 0)

    const totalUnknowns = modulesWithUnknowns.reduce((acc, m) => acc + (m.unknowns?.length ?? 0), 0)
    const totalFailureModes = modulesWithFailureModes.reduce((acc, m) => acc + (m.failureModes?.length ?? 0), 0)

    // "Parts not yet spec'd" proxy: modules whose status is still pre-"specified"
    // (i.e. `pending` / `researched` / `interface_ready`). A dedicated
    // `parts_spec` table doesn't exist yet; this is the honest placeholder.
    const modulesWithoutParts = modules.filter((m) => {
        const status = m.status
        return status === "pending" || status === "researched" || status === "interface_ready"
    })

    // "Suppliers not yet shortlisted" proxy: modules whose lead-time source is
    // NOT a supplier quote. These haven't been RFQ'd yet. When the
    // supplier_shortlists table lands this becomes a direct count.
    const modulesWithoutSupplierShortlist = modules.filter((m) => {
        // If leadTimeSource is undefined (legacy pre-2026-04-20 modules), we
        // count it as "no shortlist" — honest but cautious.
        return m.leadTimeSource !== "supplier-quote"
    })

    const stillOpen: StillOpenItem[] = []
    if (totalUnknowns > 0) {
        stillOpen.push({
            label: totalUnknowns === 1 ? "open unknown" : "open unknowns",
            count: totalUnknowns,
            caption: `across ${modulesWithUnknowns.length} module${modulesWithUnknowns.length === 1 ? "" : "s"}`,
            href: `/the-forge-v2/projects/${project.id}/modules`,
            linkLabel: "Open modules",
        })
    }
    if (totalFailureModes > 0) {
        stillOpen.push({
            label: totalFailureModes === 1 ? "declared failure mode" : "declared failure modes",
            count: totalFailureModes,
            caption: `across ${modulesWithFailureModes.length} module${modulesWithFailureModes.length === 1 ? "" : "s"}`,
            href: `/the-forge-v2/projects/${project.id}/risks`,
            linkLabel: "Open risks",
        })
    }
    if (modulesWithoutParts.length > 0) {
        stillOpen.push({
            label: modulesWithoutParts.length === 1 ? "module without specs" : "modules without specs",
            count: modulesWithoutParts.length,
            caption: "pre-specified stage — no detailed parts yet",
            href: `/the-forge-v2/projects/${project.id}/modules`,
            linkLabel: "Open modules",
        })
    }
    if (modulesWithoutSupplierShortlist.length > 0 && moduleCount > 0) {
        stillOpen.push({
            label: modulesWithoutSupplierShortlist.length === 1 ? "module without supplier quote" : "modules without supplier quotes",
            count: modulesWithoutSupplierShortlist.length,
            caption: "lead times from AI/historical estimates, not quoted suppliers",
            href: `/the-forge-v2/projects/${project.id}/suppliers`,
            linkLabel: "Open suppliers",
        })
    }
    const stillOpenTotal =
        totalUnknowns +
        totalFailureModes +
        modulesWithoutParts.length +
        (moduleCount > 0 ? modulesWithoutSupplierShortlist.length : 0)

    // ── 4. Pre-lock checklist derived from real project state ──────────
    const hasOverview = typeof project.productOverview === "string" && project.productOverview.trim().length > 0
    const hasBrief = Boolean(designBrief)
    const hasNarrative = Boolean(mission) && Boolean(targetCustomers) && Boolean(whyNow)
    const hasConstraints =
        unitCostCeilingGbp !== null ||
        maxMassKg !== null ||
        (c?.firstShipDate?.length ?? 0) > 0 ||
        (c?.markets?.length ?? 0) > 0 ||
        (c?.productionRegion?.trim().length ?? 0) > 0
    const hasRegulatory = regulatoryCodes.length > 0

    const checklist: ChecklistItem[] = [
        {
            label: "Product overview captured",
            detail: hasOverview
                ? `${countWords(project.productOverview ?? "")} words in the narrative`
                : "No overview yet — author the brief first",
            done: hasOverview,
        },
        {
            label: "Design brief attached",
            detail: hasBrief
                ? "Research stage produced a structured design brief"
                : "No design brief yet — run research on the project",
            done: hasBrief,
        },
        {
            label: "Narrative declared (mission, target customers, why-now)",
            detail: hasNarrative
                ? "All three narrative slots are non-empty"
                : "One or more narrative slots are empty — locking an empty brief is allowed but not recommended",
            done: hasNarrative,
        },
        {
            label: "Programme constraints declared",
            detail: hasConstraints
                ? "Cost ceiling, mass, first-ship or production region declared"
                : "No constraints declared — cost ceiling / max mass / first-ship missing",
            done: hasConstraints,
        },
        {
            label: "Regulatory envelope identified",
            detail: hasRegulatory
                ? `${regulatoryCodes.length} standard${regulatoryCodes.length === 1 ? "" : "s"} declared: ${regulatoryCodes.join(" · ")}`
                : "No standards declared on the brief",
            done: hasRegulatory,
        },
        {
            label: "Modules decomposed",
            detail: moduleCount > 0
                ? `${moduleCount} module${moduleCount === 1 ? "" : "s"} define the system architecture`
                : "No modules yet — decomposition defines what the brief is for",
            done: moduleCount > 0,
        },
    ]

    // Prefer the canonical lock status from `loadBriefLockStatus` — it
    // reads both tables — and fall back to the project row's stamped
    // fields if that call failed. The end result is identical in the
    // happy path; this just protects against transient drift.
    const lockIsLocked = lockStatus ? lockStatus.isLocked : project.briefLockedAt !== null
    const lockLockedAt = lockStatus ? lockStatus.lockedAt : project.briefLockedAt
    const lockLockedBy = lockStatus ? lockStatus.lockedBy : project.briefLockedBy

    const viewProps: BriefLockViewProps = {
        project: {
            id: project.id,
            name: project.name,
            subject: project.subject,
            designRevision: project.designRevision,
        },
        lockState: {
            isLocked: lockIsLocked,
            lockedAt: lockLockedAt,
            lockedBy: lockLockedBy,
        },
        currentRevisionNumber:
            lockStatus?.revisionNumber ??
            currentRevisionNumber ??
            project.designRevision,
        narrative: { mission, targetCustomers, whyNow },
        constraints: constraintsDisplay,
        regulatoryCodes,
        checklist,
        stillOpen,
        stillOpenTotal,
        moduleCount,
        modulesWithFailureModesCount: modulesWithFailureModes.length,
        modulesWithUnknownsCount: modulesWithUnknowns.length,
    }

    return <BriefLockView {...viewProps} />
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Canonical lock-status reader — delegates to `loadBriefLockStatus` which
 * joins the project row + newest revisions row + foundry check. Soft
 * failure: returns null if the action throws (the caller falls back to
 * the project row's in-line fields).
 */
async function safeLockStatus(
    projectId: string,
): Promise<Awaited<ReturnType<typeof loadBriefLockStatus>> | null> {
    try {
        return await loadBriefLockStatus(projectId)
    } catch (err) {
        console.error("[BRIEF-LOCK-PAGE] loadBriefLockStatus failed:", err)
        return null
    }
}

/**
 * Reads the newest revision_number from brief_revisions. Returns null if the
 * table is empty for this project (page falls back to project.designRevision
 * in that case). Errors are swallowed — this is a soft enhancement, not
 * security-sensitive.
 */
async function readCurrentRevisionNumber(projectId: string): Promise<number | null> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("brief_revisions")
            .select("revision_number")
            .eq("project_id", projectId)
            .order("revision_number", { ascending: false })
            .limit(1)
            .maybeSingle()
        if (error || !data) return null
        const n = (data.revision_number as number | null) ?? null
        return typeof n === "number" && Number.isFinite(n) && n >= 1 ? n : null
    } catch (err) {
        console.error("[BRIEF-LOCK-PAGE] revision lookup failed:", err)
        return null
    }
}

/** Counts whitespace-separated tokens in a string, ignoring empties. */
function countWords(s: string): number {
    return s.split(/\s+/).filter(Boolean).length
}

/** Formats an ISO date for the constraints display — "Nov 2026" style. */
function formatDisplayDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
}
