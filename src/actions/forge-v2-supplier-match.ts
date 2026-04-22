"use server"

/**
 * @file forge-v2-supplier-match.ts — orchestrator for V2 Suppliers tab.
 *
 * @description Reusable server action the V2 Suppliers page calls from its
 * "Match with Chase" button. Reads the project's modules, fans out to the
 * existing `matchCadLabModuleSuppliers()` scorer per module, and writes the
 * top N matches per module into `forge_supplier_shortlist` via the existing
 * `addToShortlist` writer.
 *
 * @security withAuth wraps the whole action; the inner match + shortlist
 * writers each do their own auth checks so this is defence-in-depth.
 *
 * @related
 * - Scorer: src/actions/cad-lab-supplier-match.ts (matchCadLabModuleSuppliers)
 * - Writer: src/actions/forge-shortlist.ts (addToShortlist)
 * - UI:     src/app/(platform)/the-forge-v2/projects/[id]/suppliers/
 * - Table:  forge_supplier_shortlist
 */

import { after } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { withAuth } from "@/lib/server-action-utils"
import {
    matchCadLabModuleSuppliers,
    type CadLabModuleInput,
    type CadLabSupplierMatch,
} from "@/actions/cad-lab-supplier-match"
import { addToShortlist } from "@/actions/forge-shortlist"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Types ────────────────────────────────────────────────────────────

export interface MatchSuppliersForProjectResult {
    ok: boolean
    /** Unique supplier count after dedup across modules. */
    suppliersAdded: number
    /** Modules we produced at least one candidate for. */
    modulesMatched: number
    /** Modules the scorer returned zero candidates for. */
    modulesEmpty: number
    error?: string
    errorCode?:
        | "PROJECT_NOT_FOUND"
        | "PROJECT_FORBIDDEN"
        | "NO_MODULES"
        | "INTERNAL"
}

// ─── Orchestrator ─────────────────────────────────────────────────────

/** Max candidates to write to shortlist per module. Tuned low (3) because
 *  shortlist UI becomes unreadable past ~15–20 total entries. Tristan can
 *  still use Source's manual add flow for deeper rosters. */
const TOP_N_PER_MODULE = 3

/**
 * Matches suppliers against every module in the project and upserts the top
 * candidates into the shortlist. Idempotent — re-running replaces existing
 * rows for the same (project, supplier) pair via upsert.
 */
export async function matchSuppliersForProject(
    projectId: string,
): Promise<MatchSuppliersForProjectResult> {
    return withAuth<MatchSuppliersForProjectResult>(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, modules, diagnostic_answers")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return {
                ok: false,
                suppliersAdded: 0,
                modulesMatched: 0,
                modulesEmpty: 0,
                error: "Couldn't load project",
                errorCode: "INTERNAL",
            }
        }
        if (!project) {
            return {
                ok: false,
                suppliersAdded: 0,
                modulesMatched: 0,
                modulesEmpty: 0,
                error: "Project not found",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects
            return {
                ok: false,
                suppliersAdded: 0,
                modulesMatched: 0,
                modulesEmpty: 0,
                error: "Project not found",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        const rawModules = project.modules as unknown
        const modules = (Array.isArray(rawModules) ? rawModules : []) as CadLabModule[]
        if (modules.length === 0) {
            return {
                ok: false,
                suppliersAdded: 0,
                modulesMatched: 0,
                modulesEmpty: 0,
                error:
                    "This project hasn't been decomposed yet — run Max's module decomposition first.",
                errorCode: "NO_MODULES",
            }
        }

        const diagnostics = (project.diagnostic_answers as DiagnosticAnswers | null) ?? {}

        // Run the scorer against each module. Sequential rather than parallel —
        // the underlying scorer embeds + queries Postgres per call and a large
        // fan-out would hammer the DB. 10 modules * ~2s/call = ~20s, fits
        // comfortably under Vercel's 300s cap.
        //
        // We dedupe across modules: a single supplier matched to three
        // subsystems gets one row with moduleIds = ["m1","m2","m3"], not
        // three rows.
        interface Accumulator {
            match: CadLabSupplierMatch
            moduleIds: string[]
        }
        const bySupplier = new Map<string, Accumulator>()
        let modulesMatched = 0
        let modulesEmpty = 0

        for (const mod of modules) {
            const diag = diagnostics[mod.id] ?? {}
            const input: CadLabModuleInput = {
                id: mod.id,
                name: mod.name,
                purpose: mod.purpose ?? "",
                keyParts: Array.isArray(mod.keyParts) ? mod.keyParts : [],
                description: typeof mod.description === "string" ? mod.description : undefined,
                process: diag.mfg_process ?? null,
                material: diag.material ?? null,
            }
            let matches: CadLabSupplierMatch[] = []
            try {
                matches = await matchCadLabModuleSuppliers(input)
            } catch (err) {
                console.error(
                    `[forge-v2-supplier-match] scorer threw for module ${mod.id}:`,
                    err instanceof Error ? err.message : err,
                )
                continue
            }
            if (matches.length === 0) {
                modulesEmpty += 1
                continue
            }
            modulesMatched += 1
            const topN = matches.slice(0, TOP_N_PER_MODULE)
            for (const m of topN) {
                const existing = bySupplier.get(m.id)
                if (existing) {
                    if (!existing.moduleIds.includes(mod.id)) {
                        existing.moduleIds.push(mod.id)
                    }
                    // Keep the higher match score across modules
                    if (m.matchScore > existing.match.matchScore) {
                        existing.match = m
                    }
                } else {
                    bySupplier.set(m.id, { match: m, moduleIds: [mod.id] })
                }
            }
        }

        // Upsert each unique supplier. addToShortlist handles the (project,
        // supplier) uniqueness via its ON CONFLICT clause, so re-runs update
        // instead of duplicating.
        let suppliersAdded = 0
        for (const { match, moduleIds } of bySupplier.values()) {
            const res = await addToShortlist({
                projectId,
                supplierId: match.id,
                name: match.name,
                isVerified: match.isVerified,
                supplierType: match.supplierType,
                moduleIds,
                bestMatchScore: match.matchScore,
                bestScoreBreakdown: match.scoreBreakdown,
                allMatchReasons: match.matchReasons,
            })
            if (res.ok) {
                suppliersAdded += 1
            } else {
                console.warn(
                    `[forge-v2-supplier-match] addToShortlist failed for ${match.id}:`,
                    res.error,
                )
            }
        }

        // Auto-fire gap discovery when the shortlist comes back thin.
        // Triggers `discoverSuppliersForGap` against the first module
        // without a match, which runs Claude Opus + web_search and
        // persists real UK/EU companies as unverified-ai-discovery
        // rows — same mechanism the founder can trigger manually from
        // the /suppliers empty state. Scheduled via after() so the
        // match action returns immediately and the discovery happens
        // post-response with its own <300s Vercel budget.
        //
        // Threshold: suppliersAdded < 3 OR at least one module has
        // zero matches. For non-core-domain projects (horticulture,
        // HVAC, shipping containers) this will nearly always fire,
        // which is the intent — founders shouldn't have to know to
        // click "research the web" for the directory to catch up.
        const AUTO_DISCOVERY_THRESHOLD = 3
        const shouldAutoDiscover =
            suppliersAdded < AUTO_DISCOVERY_THRESHOLD || modulesEmpty > 0
        if (shouldAutoDiscover && modules.length > 0) {
            // Identify the first module with zero matches by
            // computing the set of module ids that WERE matched
            // across all shortlisted suppliers.
            const matchedModuleIds = new Set<string>()
            for (const { moduleIds } of bySupplier.values()) {
                for (const mid of moduleIds) matchedModuleIds.add(mid)
            }
            const moduleWithoutMatch =
                modules.find((m) => !matchedModuleIds.has(m.id)) ??
                modules[0]
            console.info(
                `[forge-v2-supplier-match] auto-firing gap discovery for ${projectId} ` +
                    `(${suppliersAdded} suppliers, ${modulesEmpty} empty modules)`,
            )
            after(async () => {
                try {
                    const { discoverSuppliersForGap } = await import(
                        "./forge-v2-supplier-discovery"
                    )
                    const res = await discoverSuppliersForGap(
                        projectId,
                        moduleWithoutMatch.id,
                    )
                    if (!res.ok) {
                        console.warn(
                            `[forge-v2-supplier-match] auto-discovery did not persist: ` +
                                `${res.error} (${res.errorCode})`,
                        )
                    } else {
                        console.info(
                            `[forge-v2-supplier-match] auto-discovery added ` +
                                `${res.job.candidatesPersisted} candidates`,
                        )
                    }
                } catch (err) {
                    console.error(
                        "[forge-v2-supplier-match] auto-discovery threw:",
                        err instanceof Error ? err.message : err,
                    )
                }
            })
        }

        return {
            ok: true,
            suppliersAdded,
            modulesMatched,
            modulesEmpty,
        }
    })
}
