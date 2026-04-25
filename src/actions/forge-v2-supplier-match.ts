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
        return matchSuppliersForProjectInternal(projectId, foundryId)
    })
}

/**
 * Background entry — called from `after()` post-response contexts (e.g. the
 * autopilot `stepMatchSuppliers` chain) where cookies are gone and
 * `withAuth` would return "Unauthorized". Caller MUST have already resolved
 * foundryId from an authenticated request.
 *
 * This is the #90 pattern applied to supplier-match. Mirrors
 * `runMaxDecompositionBackground`.
 */
export async function matchSuppliersForProjectBackground(
    projectId: string,
    foundryId: string,
): Promise<MatchSuppliersForProjectResult> {
    return matchSuppliersForProjectInternal(projectId, foundryId)
}

async function matchSuppliersForProjectInternal(
    projectId: string,
    foundryId: string,
): Promise<MatchSuppliersForProjectResult> {
    {
        const admin = createAdminClient()

        // Foundry-owner fallback for TrustedContext so the downstream
        // matchCadLabModuleSuppliers, addToShortlist, and the auto-fired
        // discoverSuppliersForGap can skip cookie reads inside after()
        // contexts. RT4 Option A.
        const { data: foundryOwner } = await admin
            .from("foundries")
            .select("owner_id")
            .eq("id", foundryId)
            .maybeSingle()
        const trusted = foundryOwner?.owner_id
            ? { userId: foundryOwner.owner_id, foundryId }
            : undefined

        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, modules, diagnostic_answers, research")
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

        // Extract target market from the brief so the scorer can apply a
        // region bonus. The brief's constraints.markets is a string[] of
        // ISO codes or short market names ("United Kingdom", "GB", "Europe").
        // Joined comma-separated so substring matching in scoreRegionMatch
        // can match the listing's country / country_iso against any of them.
        const research = project.research as { designBrief?: { constraints?: { markets?: unknown; batchSize?: number } } } | null
        const briefMarkets = research?.designBrief?.constraints?.markets
        const targetMarket = Array.isArray(briefMarkets) && briefMarkets.length > 0
            ? briefMarkets.filter((m): m is string => typeof m === "string").join(", ")
            : null
        const briefBatchSize = research?.designBrief?.constraints?.batchSize
        const batchSizeHint =
            typeof briefBatchSize === "number" && briefBatchSize > 0
                ? briefBatchSize >= 1000
                    ? "production"
                    : briefBatchSize >= 100
                    ? "low"
                    : "prototype"
                : null

        // BOM-DRIVEN MATCHING (2026-04-25 rebuild): the previous approach
        // searched suppliers per MODULE, which produced shallow matches
        // because module names like "Battery enclosure" embed similarly to
        // every battery-adjacent listing in the corpus. The bill-of-materials
        // is the actual procurement source — each PART has a process,
        // material, tolerance, and module reference, which lets the scorer
        // surface specific manufacturers ("CNC machined 6063 aluminium
        // for the battery rack frame") instead of generic battery shops.
        //
        // We still fall back to module-level matching when:
        //   - The BOM hasn't been generated yet (parts table empty)
        //   - A module has no purchased parts (services-only module)
        const moduleNameById = new Map<string, string>()
        for (const m of modules) moduleNameById.set(m.id, m.name)
        const moduleById = new Map<string, CadLabModule>()
        for (const m of modules) moduleById.set(m.id, m)

        const { data: rawParts } = await admin
            .from("parts")
            .select(
                "id, part_number, name, description, source_module_id, process, material, material_spec, tolerance, mass_kg, finish, is_purchased",
            )
            .eq("cad_lab_project_id", projectId)
            .order("part_number", { ascending: true })
        // Only purchased parts are candidates for supplier matching —
        // in-house-fabricated parts won't be sourced externally.
        const purchasedParts = (rawParts ?? []).filter((p) => p.is_purchased !== false)

        // Each match accumulator carries the parts a supplier can supply +
        // the modules those parts belong to. Display layer (PDF/UI) reads
        // both lists to render "Provides {part} for {module}" reasons.
        interface MatchedPart {
            partId: string
            partNumber: string
            partName: string
            moduleId: string | null
            moduleName: string | null
            process: string | null
            material: string | null
        }
        interface Accumulator {
            match: CadLabSupplierMatch
            moduleIds: string[]
            matchedParts: MatchedPart[]
        }
        const bySupplier = new Map<string, Accumulator>()
        let modulesMatched = 0
        let modulesEmpty = 0
        const matchedModuleIdSet = new Set<string>()

        // Process tolerance string ("±0.05 mm", "0.1 mm", "IT7") into a
        // numeric mm value when it's parseable. Falls back to null otherwise.
        const parseToleranceMm = (raw: string | null | undefined): number | null => {
            if (!raw) return null
            const m = raw.match(/(\d+(?:\.\d+)?)\s*mm/i)
            if (m) {
                const n = Number.parseFloat(m[1])
                return Number.isFinite(n) ? n : null
            }
            return null
        }

        // ── Phase 1: per-part matching ────────────────────────────────────
        if (purchasedParts.length > 0) {
            console.info(
                `[forge-v2-supplier-match] BOM-driven match — ${purchasedParts.length} purchased parts across ${modules.length} modules`,
            )
            for (const part of purchasedParts) {
                const moduleId = part.source_module_id ?? null
                const moduleName = moduleId ? moduleNameById.get(moduleId) ?? null : null
                const partKeyParts = [
                    part.material_spec,
                    part.process,
                    part.finish,
                    part.tolerance,
                ].filter((v): v is string => typeof v === "string" && v.length > 0)

                // Build a search query that's specific to the part — embedding
                // text emphasises the buyable noun + process + material rather
                // than a high-level module concept.
                const searchPurpose = moduleName
                    ? `${part.process ?? "manufactured"} ${part.material ?? ""} part for the ${moduleName} sub-assembly`
                    : `${part.process ?? "manufactured"} ${part.material ?? ""} part`
                const input: CadLabModuleInput = {
                    id: `part:${part.id}`,
                    name: part.name,
                    purpose: searchPurpose,
                    keyParts: partKeyParts,
                    description: typeof part.description === "string" ? part.description : undefined,
                    process: part.process ?? null,
                    material: part.material ?? null,
                    toleranceMm: parseToleranceMm(part.tolerance),
                    batchSize: batchSizeHint,
                    targetMarket,
                }
                let matches: CadLabSupplierMatch[] = []
                try {
                    matches = await matchCadLabModuleSuppliers(input, trusted)
                } catch (err) {
                    console.error(
                        `[forge-v2-supplier-match] scorer threw for part ${part.part_number}:`,
                        err instanceof Error ? err.message : err,
                    )
                    continue
                }
                if (matches.length === 0) continue
                if (moduleId) matchedModuleIdSet.add(moduleId)
                const topN = matches.slice(0, TOP_N_PER_MODULE)
                for (const m of topN) {
                    const matchedPart: MatchedPart = {
                        partId: part.id,
                        partNumber: part.part_number,
                        partName: part.name,
                        moduleId,
                        moduleName,
                        process: part.process ?? null,
                        material: part.material ?? null,
                    }
                    const existing = bySupplier.get(m.id)
                    if (existing) {
                        if (moduleId && !existing.moduleIds.includes(moduleId)) {
                            existing.moduleIds.push(moduleId)
                        }
                        existing.matchedParts.push(matchedPart)
                        if (m.matchScore > existing.match.matchScore) {
                            existing.match = m
                        }
                    } else {
                        bySupplier.set(m.id, {
                            match: m,
                            moduleIds: moduleId ? [moduleId] : [],
                            matchedParts: [matchedPart],
                        })
                    }
                }
            }
            modulesMatched = matchedModuleIdSet.size
            modulesEmpty = modules.length - modulesMatched
        }

        // ── Phase 2: module-level fallback for modules the parts loop
        //    didn't cover (BOM empty, or no purchased parts in this module) ──
        for (const mod of modules) {
            if (matchedModuleIdSet.has(mod.id)) continue
            const diag = diagnostics[mod.id] ?? {}
            const input: CadLabModuleInput = {
                id: mod.id,
                name: mod.name,
                purpose: mod.purpose ?? "",
                keyParts: Array.isArray(mod.keyParts) ? mod.keyParts : [],
                description: typeof mod.description === "string" ? mod.description : undefined,
                process: diag.mfg_process ?? null,
                material: diag.material ?? null,
                batchSize: batchSizeHint,
                targetMarket,
            }
            let matches: CadLabSupplierMatch[] = []
            try {
                matches = await matchCadLabModuleSuppliers(input, trusted)
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
                    bySupplier.set(m.id, {
                        match: m,
                        moduleIds: [mod.id],
                        matchedParts: [],
                    })
                }
            }
        }

        // Upsert each unique supplier. addToShortlist handles the (project,
        // supplier) uniqueness via its ON CONFLICT clause, so re-runs update
        // instead of duplicating.
        //
        // BETTER MATCH REASONS (2026-04-25): the previous reasons read
        // "Semantic match, Manufacturing, Aerospace" — labels that tell the
        // founder nothing about why this supplier matters for THEIR project.
        // Rewrite reasons to lead with what the supplier can supply for what:
        //   "Can supply Battery rack frame member (CNC machined 6063 aluminium)
        //    for Battery enclosure"
        // Falls back to the legacy factor labels only when no parts matched
        // (module-level fallback path).
        const buildMatchReasons = (
            match: CadLabSupplierMatch,
            matchedParts: MatchedPart[],
        ): string[] => {
            if (matchedParts.length === 0) {
                // Module-fallback path — keep existing labels but at least
                // tell the founder which factor was strong.
                return match.matchReasons.slice(0, 3)
            }
            // Show up to 3 representative parts. Sort by part number so the
            // first few are usually structural-type parts (lower numbers).
            const sortedParts = [...matchedParts].sort((a, b) =>
                (a.partNumber || "").localeCompare(b.partNumber || ""),
            )
            const reasons: string[] = []
            const seen = new Set<string>()
            for (const p of sortedParts) {
                const procMat = [p.process, p.material]
                    .filter((v): v is string => typeof v === "string" && v.length > 0)
                    .join(" · ")
                const forModule = p.moduleName ? ` for ${p.moduleName}` : ""
                const reason = procMat.length > 0
                    ? `Can supply ${p.partName} (${procMat})${forModule}`
                    : `Can supply ${p.partName}${forModule}`
                if (!seen.has(reason)) {
                    reasons.push(reason)
                    seen.add(reason)
                }
                if (reasons.length >= 3) break
            }
            // Append a region tag at the end if it hit (preserve from scorer).
            const inMarketReason = match.matchReasons.find((r) => r.startsWith("In ") || r.startsWith("Regional fit"))
            if (inMarketReason && reasons.length < 3) reasons.push(inMarketReason)
            return reasons
        }
        let suppliersAdded = 0
        for (const { match, moduleIds, matchedParts } of bySupplier.values()) {
            const richReasons = buildMatchReasons(match, matchedParts)
            const res = await addToShortlist({
                projectId,
                supplierId: match.id,
                name: match.name,
                isVerified: match.isVerified,
                supplierType: match.supplierType,
                moduleIds,
                bestMatchScore: match.matchScore,
                bestScoreBreakdown: match.scoreBreakdown,
                allMatchReasons: richReasons,
            }, trusted)
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
                        trusted,
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
    }
}
