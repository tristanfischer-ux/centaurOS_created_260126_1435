/**
 * @file modules/page.tsx — /the-forge-v2/projects/:id/modules
 *
 * @description Modules artefact page (V2 — mockup-faithful). Server component
 * that loads the project, derives mass-budget rows + module cards from real
 * `project.modules` JSONB + AI cost estimates + system-level constraints on
 * the designBrief, and hands a typed props bundle to ModulesView.
 *
 * Empty-state policy: when a field isn't captured yet (e.g. per-module
 * `budgetMassKg` — added to the modules shape in the 2026-04-20 seed round)
 * we pass null and the view renders `—`. We never synthesise the mockup's
 * HAPS numbers.
 *
 * Module cards pick a `thumbKind` from the module id/name using a simple
 * keyword matcher (see pickThumbKind). The thumb SVGs themselves live in
 * the view so they stay colocated with the `.m2-mod-thumb` styling.
 *
 * Mockup reference: FORGE-MOCKUP-MODULES.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { after } from "next/server"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import {
    loadImageRenderState,
    startRenderAllRemainingModuleImages,
} from "@/actions/forge-v2-render-all-modules"
import { loadMaxRunStatus, runMaxDecomposition } from "@/actions/specialists/run-max-decomposition"
import { loadFangRunStatusesForProject } from "@/actions/specialists/run-fang-review"
import type { CadLabModule } from "@/lib/cad-lab-types"

import { ModulesView, type ModuleCardRow, type ModuleMassRow, type ModulesViewProps, type ThumbKind } from "./modules-view"

export const dynamic = "force-dynamic"
// Max's decomposition fan-out (skeleton + N module expansions at concurrency 3)
// can run 60-180s on large projects. Vercel's default function cap is 10s for
// Hobby / 60s for Pro — both too short. Route segment config raises the cap
// for server actions invoked from this page (runMaxDecomposition). The ceiling
// is Vercel Pro's hard cap of 300s; any stall beyond that is swept by the
// pipeline-runs-watchdog on the next status read.
export const maxDuration = 300

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Modules · The Forge" }
    return { title: `Modules · ${result.project.name}` }
}

export default async function ForgeV2ModulesPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    // DECISION: Three loaders fired in parallel. The Fang loader is a
    // single DB round-trip for every module's latest Fang run (see
    // loadFangRunStatusesForProject header — N queries is the first thing
    // to blow Vercel's 300s budget once projects exceed 20 modules).
    const [result, maxRunStatus, fangStatuses, imageRenderState] = await Promise.all([
        loadCadLabProject(id),
        loadMaxRunStatus(id),
        loadFangRunStatusesForProject(id),
        loadImageRenderState(id),
    ])
    if ("error" in result || !result.project) {
        notFound()
    }
    const project = result.project
    const modules = project.modules ?? []

    // Auto-fire the per-module render chain on page load when there is
    // unrendered work AND no chain is currently in flight. The server action
    // has its own idempotency gate (ALREADY_RUNNING no-op) + stall recovery,
    // so this is safe to call on every page load — redundant calls are free.
    // Runs via after() so the page response isn't blocked.
    //
    // Together with the autopilot auto-fire in stepGenerateIllustration(),
    // this covers both the autopilot-driven happy path and the deep-link
    // case where a founder navigates straight to /modules after decomposition.
    const needsAutoFire =
        modules.length > 0 &&
        modules.some((m) => !m.imageUrl || m.imageUrl.length === 0) &&
        (imageRenderState === null || imageRenderState.finished_at !== null)
    if (needsAutoFire) {
        after(async () => {
            try {
                const res = await startRenderAllRemainingModuleImages(id)
                if (!res.ok && res.errorCode !== "ALREADY_RUNNING" && res.errorCode !== "NO_UNRENDERED_MODULES") {
                    console.warn(
                        "[modules/page] auto-fire render chain failed (non-fatal):",
                        res.error,
                    )
                }
            } catch (err) {
                console.warn(
                    "[modules/page] auto-fire render chain threw (non-fatal):",
                    err instanceof Error ? err.message : err,
                )
            }
        })
    }

    // Bind the Max orchestrator to this project id so the client button
    // component doesn't need to pass it explicitly. The `"use server"`
    // boundary is on run-max-decomposition.ts itself.
    async function runMaxAction(): Promise<
        { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
    > {
        "use server"
        const res = await runMaxDecomposition(id, "manual")
        if (res.ok) return { ok: true, runId: res.runId }
        return { ok: false, error: res.error, errorCode: res.errorCode }
    }

    // ── Mass rows ──────────────────────────────────────────────
    // Per-module budget lives on the module's optional `budgetMassKg` field
    // (written by the HAPS seed). If no module has a budget, the sum is null
    // and the view renders "not yet declared".
    const mass: ModuleMassRow[] = modules.map((m, i) => {
        const budget = (m as CadLabModule & { budgetMassKg?: number }).budgetMassKg
        return {
            id: m.id,
            label: `M${i + 1} · ${m.name}`,
            budgetKg: typeof budget === "number" ? budget : null,
            currentKg: typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : null,
        }
    })
    const budgetTotalKg = mass.every((r) => r.budgetKg == null)
        ? null
        : mass.reduce((acc, r) => acc + (r.budgetKg ?? 0), 0)
    const currentTotalKg = mass.every((r) => r.currentKg == null)
        ? null
        : mass.reduce((acc, r) => acc + (r.currentKg ?? 0), 0)

    const massDeltaKg =
        budgetTotalKg != null && currentTotalKg != null
            ? currentTotalKg - budgetTotalKg
            : null

    // ── Module cards ────────────────────────────────────────────
    const cards: ModuleCardRow[] = modules.map((m, i) => {
        const moduleNum = `M${i + 1}`
        const budget = (m as CadLabModule & { budgetMassKg?: number }).budgetMassKg
        const mass = m.estimatedMassKg
        const delta = typeof mass === "number" && typeof budget === "number" ? mass - budget : null
        const tone: "green" | "amber" | "red" =
            delta == null ? "green" : delta > 0.15 ? "red" : delta > 0.05 ? "amber" : "green"
        const issues: ModuleCardRow["issues"] = []
        if (delta != null && delta > 0.15) {
            issues.push({ label: `Mass +${delta.toFixed(2)}kg`, severity: "danger" })
        } else if (delta != null && delta > 0.05) {
            issues.push({ label: `Mass +${delta.toFixed(2)}kg`, severity: "warning" })
        }
        if (m.failureModes && m.failureModes.length >= 3) {
            issues.push({ label: `${m.failureModes.length} failure modes`, severity: "warning" })
        }

        const body =
            typeof m.description === "string" && m.description.length > 0
                ? (m.description.length > 140 ? `${m.description.slice(0, 137)}…` : m.description)
                : (typeof m.purpose === "string" ? m.purpose : "")

        const fang = fangStatuses[m.id]
        return {
            id: m.id,
            moduleNum,
            name: m.name,
            body: body || "Module purpose not yet declared.",
            partCount: m.keyParts?.length ?? 0,
            massKg: typeof mass === "number" ? mass : null,
            leadWeeks: typeof m.leadWeeks === "number" ? m.leadWeeks : null,
            leadSource: leadSourceLabel((m as CadLabModule & { leadTimeSource?: string }).leadTimeSource),
            tone,
            hasImage: typeof m.imageUrl === "string" && m.imageUrl.length > 0,
            mirrorOf:
                typeof m.mirrorOf === "string" && m.mirrorOf.trim().length > 0
                    ? m.mirrorOf.trim()
                    : null,
            issues,
            thumbKind: pickThumbKind(m),
            massOver: delta != null && delta > 0.05,
            fangRun: {
                status: fang?.status ?? "not-started",
                startedAt: fang?.startedAt ?? null,
                finishedAt: fang?.finishedAt ?? null,
            },
        }
    })

    // ── System meta ─────────────────────────────────────────────
    const db = project.research?.designBrief
    const mtowKg =
        db && typeof db === "object" && "constraints" in db && db.constraints?.maxMassKg != null
            ? db.constraints.maxMassKg
            : null

    // Span + solar area — derived from the project subject when present.
    // Cheap string scrape keeps the values honest (we don't invent them
    // when the subject doesn't mention them).
    const subject = typeof project.subject === "string" ? project.subject : ""
    const span = /(\d+(?:\.\d+)?)\s*m\s*wing/i.test(subject)
        ? subject.match(/(\d+(?:\.\d+)?)\s*m\s*wing/i)?.[1] + " m"
        : /(\d+(?:\.\d+)?)\s*m\s*span/i.test(subject)
            ? subject.match(/(\d+(?:\.\d+)?)\s*m\s*span/i)?.[1] + " m"
            : null
    const solarAreaMatch = subject.match(/(\d+(?:\.\d+)?)\s*m²\s*solar/i) ?? subject.match(/(\d+(?:\.\d+)?)\s*m2\s*solar/i)
    const solarArea = solarAreaMatch?.[1] ? `${solarAreaMatch[1]} m²` : null

    // Interface count — sum inputs+outputs across modules as a proxy. Real
    // interface_contracts exists on the project row but for the Modules
    // mockup the "N interfaces" count is enough.
    const interfaceCount = modules.reduce((acc, m) => acc + (m.inputs?.length ?? 0) + (m.outputs?.length ?? 0), 0)
    const unmatchedPortCount = 0 // No interface-matching implementation yet → honest 0

    const viewProps: ModulesViewProps = {
        project: {
            id: project.id,
            name: project.name,
            systemIllustrationUrl: project.systemIllustrationUrl,
            conceptRenderUrl: project.conceptRenderUrl,
        },
        header: {
            moduleCount: modules.length,
            interfaceCount,
            unmatchedPortCount,
            massDeltaKg,
        },
        systemMeta: {
            modules: modules.length,
            span,
            solarArea,
            mtowKg,
            interfaces: interfaceCount,
        },
        budgetTotalKg,
        currentTotalKg,
        mass,
        cards,
        maxRun: {
            status: maxRunStatus.status,
            startedAt: maxRunStatus.startedAt ?? null,
            finishedAt: maxRunStatus.finishedAt ?? null,
            errorCode: maxRunStatus.errorCode ?? null,
            errorMessage: maxRunStatus.errorMessage ?? null,
            moduleCount: maxRunStatus.moduleCount ?? null,
        },
        runMaxAction,
        imageRenderState,
    }

    return <ModulesView {...viewProps} />
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Picks a thumbnail kind from the module id / name using simple keyword
 * matching. Falls back to "avionics" (the most generic-looking thumb).
 */
/**
 * Turns a module's `leadTimeSource` tag into the short caption rendered on
 * the module card. Returning null hides the caption entirely (e.g. for
 * legacy modules that haven't been tagged yet).
 */
function leadSourceLabel(source: string | undefined | null): string | null {
    switch (source) {
        case "supplier-quote":      return "Supplier quote"
        // NOTE: `ai-estimate` is labelled "Specialist estimate" on purpose —
        // ForgeOS in-product copy never surfaces "AI" as the source of a
        // number to founders (see CLAUDE.md §No AI Emphasis).
        case "ai-estimate":         return "Specialist estimate"
        case "historical-analogue": return "Historical analogue"
        case "specialist-judgement":return "Specialist judgement"
        default: return null
    }
}

function pickThumbKind(m: CadLabModule): ThumbKind {
    const s = `${m.id ?? ""} ${m.name ?? ""}`.toLowerCase()
    if (/wing/.test(s)) return "wing"
    if (/propulsion|motor|propeller|prop\b/.test(s)) return "propulsion"
    if (/fuselage|body|chassis/.test(s)) return "fuselage"
    if (/tail|empennage|rudder|elevator/.test(s)) return "tail"
    if (/solar|pv\b|photovolt/.test(s)) return "solar"
    if (/battery|pack|cell\b/.test(s)) return "battery"
    if (/mppt|converter|power\b|electronics|inverter/.test(s)) return "power-electronics"
    if (/comms|radio|sat(?:com|link)|iridium|antenna/.test(s)) return "comms"
    return "avionics"
}
