"use server"

/**
 * @file forge-v2-supplier-discovery.ts — demand-driven supplier
 * directory enrichment.
 *
 * @description Minimum-viable-loop implementation of the plan in
 * SUPPLIER-DISCOVERY-PLAN.md. When a founder's project surfaces a
 * supplier gap (horticulture, HVAC, shipping container — domains the
 * existing 651-row directory has zero coverage of), this action asks
 * Brave Search API + DeepSeek V4-Flash (via OpenRouter) to find UK/EU
 * suppliers matching the gap, persists them as `suppliers` rows tagged
 * `verification_status = 'unverified-ai-discovery'`, and re-runs the
 * Chase matcher so the triggering project's shortlist refreshes.
 *
 * V0 scope (deliberately narrow):
 *   - One foundry, one project, one trigger per gap key (idempotent on
 *     gap_key_hash over last 24h)
 *   - Up to 10 candidates per run
 *   - Persists to the GLOBAL suppliers directory with metadata that
 *     scopes visibility to the triggering foundry until promoted —
 *     `verification_status = 'unverified-ai-discovery'` + a metadata
 *     field `discovery.triggered_by_foundry`
 *   - No Companies House / website scrape verification — added in V1
 *   - No admin promotion UI — added in V1
 *   - No two-witnesses auto-promotion — added in V1
 *
 * Vercel budget: 3 Brave Search calls (~5s total) + one DeepSeek
 * V4-Flash call (~10-30s) + up to 10 insert statements + one re-match.
 * Should fit comfortably in 120s.
 *
 * @related
 *   - Plan + red team: SUPPLIER-DISCOVERY-PLAN.md + REDTEAM.md
 *   - Migration: 20260426100000_supplier_discovery_jobs (applied via
 *     Supabase MCP on 2026-04-21)
 *   - Re-match engine: src/actions/forge-v2-supplier-match.ts
 */

import { createHash } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"
import { withAuth } from "@/lib/server-action-utils"
import type { TrustedContext } from "@/lib/server-action-utils"
import { matchSuppliersForProject } from "@/actions/forge-v2-supplier-match"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ─────────────────────────────────────────────────────────────

export type SupplierDiscoveryErrorCode =
    | "PROJECT_NOT_FOUND"
    | "PROJECT_FORBIDDEN"
    | "MODULE_NOT_FOUND"
    | "NO_GAP_KEY"
    | "NO_API_KEY"
    | "DAILY_CAP_REACHED"
    | "ALREADY_DISCOVERED_RECENTLY"
    | "DISCOVERY_FAILED"
    | "PERSIST_FAILED"
    | "INTERNAL"

export interface DiscoveryJobResult {
    jobId: string
    candidatesReturned: number
    candidatesPersisted: number
    status: "done" | "failed"
    error?: string
}

export type SupplierDiscoveryResult =
    | { ok: true; job: DiscoveryJobResult }
    | {
          ok: false
          error: string
          errorCode: SupplierDiscoveryErrorCode
      }

interface CandidateShape {
    name: string
    website: string | null
    hq_country: string | null
    capabilities: string[]
    rationale: string
}

// ─── Constants ─────────────────────────────────────────────────────────

const DISCOVERY_MODEL = "deepseek/deepseek-v4-flash"
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
const DAILY_CAP_PER_FOUNDRY = 20
const IDEMPOTENCY_WINDOW_HOURS = 24
const MAX_CANDIDATES = 10

// ─── Helpers ───────────────────────────────────────────────────────────

function normaliseGapString(s: string | null | undefined): string {
    return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

function computeGapKeyHash(parts: {
    industry: string | null
    process: string | null
    material: string | null
}): string {
    const canonical = [
        normaliseGapString(parts.industry),
        normaliseGapString(parts.process),
        normaliseGapString(parts.material),
    ].join("|")
    return createHash("sha256").update(canonical).digest("hex").slice(0, 32)
}

interface ProjectGapSource {
    subject: string | null
    designBrief: {
        targetProcess?: string
        targetMaterial?: string
    } | null
}

function extractGap(m: CadLabModule, src: ProjectGapSource): {
    industry: string | null
    process: string | null
    material: string | null
} {
    // Module name carries module-specific context (HVAC, Grow Rack).
    // The project's designBrief carries the canonical process + material
    // the brief was locked against — that's what Chase matches on. We
    // prefer brief-level process/material because they already filtered
    // through Max's decomposition logic.
    const industry = src.subject ? src.subject.slice(0, 120) : null
    const process =
        typeof src.designBrief?.targetProcess === "string" &&
        src.designBrief.targetProcess.length > 0
            ? src.designBrief.targetProcess
            : null
    const material =
        typeof src.designBrief?.targetMaterial === "string" &&
        src.designBrief.targetMaterial.length > 0
            ? src.designBrief.targetMaterial
            : null
    return { industry, process, material }
}

async function fetchBraveSearch(query: string, apiKey: string): Promise<string> {
    const url = new URL(BRAVE_SEARCH_URL)
    url.searchParams.set("q", query)
    url.searchParams.set("count", "10")
    url.searchParams.set("search_lang", "en")
    const res = await fetch(url.toString(), {
        headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
        throw new Error(`Brave Search ${res.status}: ${await res.text().catch(() => "no body")}`)
    }
    const data = await res.json()
    const results = (data.web?.results ?? []) as Array<{
        title?: string
        url?: string
        description?: string
    }>
    return results
        .slice(0, 10)
        .map(
            (r, i) =>
                `[${i + 1}] ${r.title ?? "—"}\n    ${r.url ?? ""}\n    ${r.description ?? ""}`,
        )
        .join("\n\n")
}

function buildDiscoveryPrompt(
    gap: {
        industry: string | null
        process: string | null
        material: string | null
        moduleName: string | null
    },
    searchResults: string,
): string {
    return `You are a UK + EU industrial supplier researcher. A founder is building a product and needs to find manufacturers who can make parts for the module described below. The ForgeOS supplier directory has zero entries matching this gap.

PROJECT CONTEXT: ${gap.industry ?? "not specified"}
MODULE: ${gap.moduleName ?? "not specified"}
MANUFACTURING PROCESS NEEDED: ${gap.process ?? "not specified"}
MATERIAL NEEDED: ${gap.material ?? "not specified"}

Below are search results from Brave Search. Use ONLY these results to identify 5-10 real, active, UK-or-EU companies that could genuinely supply this. For each, return:
- name (real company name)
- website (real URL, starting https://)
- hq_country (ISO-2 or country name, UK preferred)
- capabilities (2–5 specific tags, e.g. "CNC machining", "food-grade HDPE", "ISO 9001")
- rationale (one short sentence — why they match this gap)

SEARCH RESULTS:
${searchResults}

CRITICAL constraints:
- Do NOT invent companies. Only use companies that appear in the search results above.
- If you can only find 2 real matches, return 2.
- Prefer UK companies; then EU; then broader only if nothing closer.
- No fake review scores, no made-up certifications.

Respond with ONLY valid JSON, no prose, no markdown fences:
{ "candidates": [ { "name": "...", "website": "...", "hq_country": "...", "capabilities": ["..."], "rationale": "..." } ] }

If you cannot find any real matches, return { "candidates": [] }.`
}

// ─── Main action ───────────────────────────────────────────────────────

export async function discoverSuppliersForGap(
    projectId: string,
    moduleId: string,
    trusted?: TrustedContext,
): Promise<SupplierDiscoveryResult> {
    return withAuth<SupplierDiscoveryResult>(async ({ foundryId }) => {
        const admin = createAdminClient()

        // 1. Load project + module + ownership check
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, modules, subject, research")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr || !project) {
            return { ok: false, error: "Project not found.", errorCode: "PROJECT_NOT_FOUND" }
        }
        if (project.foundry_id !== foundryId) {
            return { ok: false, error: "Project not found.", errorCode: "PROJECT_FORBIDDEN" }
        }

        const rawModules = project.modules as unknown
        const modules = (Array.isArray(rawModules) ? rawModules : []) as CadLabModule[]
        const targetModule = modules.find((m) => m.id === moduleId)
        if (!targetModule) {
            return { ok: false, error: "Module not found.", errorCode: "MODULE_NOT_FOUND" }
        }

        const research = project.research as
            | { designBrief?: { targetProcess?: string; targetMaterial?: string } }
            | null
        const gap = extractGap(targetModule, {
            subject: typeof project.subject === "string" ? project.subject : null,
            designBrief: research?.designBrief ?? null,
        })
        if (!gap.industry && !gap.process && !gap.material) {
            return {
                ok: false,
                error: "This module doesn't declare enough detail (industry / process / material) to search for suppliers.",
                errorCode: "NO_GAP_KEY",
            }
        }

        const gapKeyHash = computeGapKeyHash(gap)

        // 2. Rate limits
        //    a) Daily cap per foundry
        const { count: todayCount } = await admin
            .from("supplier_discovery_jobs")
            .select("id", { count: "exact", head: true })
            .eq("foundry_id", foundryId)
            .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())

        if ((todayCount ?? 0) >= DAILY_CAP_PER_FOUNDRY) {
            return {
                ok: false,
                error: `Daily discovery cap reached (${DAILY_CAP_PER_FOUNDRY} runs/24h). Try again tomorrow.`,
                errorCode: "DAILY_CAP_REACHED",
            }
        }

        //    b) Idempotency — same gap discovered recently by this foundry
        const { data: existing } = await admin
            .from("supplier_discovery_jobs")
            .select("id, status, candidates_persisted, finished_at")
            .eq("foundry_id", foundryId)
            .eq("gap_key_hash", gapKeyHash)
            .gt(
                "created_at",
                new Date(
                    Date.now() - IDEMPOTENCY_WINDOW_HOURS * 3600_000,
                ).toISOString(),
            )
            .order("created_at", { ascending: false })
            .limit(1)

        if (existing && existing.length > 0 && existing[0].status === "done") {
            return {
                ok: false,
                error: `We already researched this gap in the last ${IDEMPOTENCY_WINDOW_HOURS}h and persisted ${existing[0].candidates_persisted ?? 0} candidates. Refresh the supplier list — they're already there.`,
                errorCode: "ALREADY_DISCOVERED_RECENTLY",
            }
        }

        const braveKey = process.env.BRAVE_SEARCH_API_KEY
        if (!braveKey) {
            return { ok: false, error: "BRAVE_SEARCH_API_KEY not configured.", errorCode: "NO_API_KEY" }
        }

        // 3. Insert job row (status = discovering)
        const { data: jobRow, error: jobInsertErr } = await admin
            .from("supplier_discovery_jobs")
            .insert({
                foundry_id: foundryId,
                triggering_project_id: projectId,
                triggering_module_id: moduleId,
                gap_key_hash: gapKeyHash,
                gap_industry: gap.industry,
                gap_process: gap.process,
                gap_material: gap.material,
                status: "discovering",
            })
            .select("id")
            .single()

        if (jobInsertErr || !jobRow) {
            console.error(
                "[supplier-discovery] job insert failed:",
                jobInsertErr?.message ?? jobInsertErr,
            )
            return {
                ok: false,
                error: "Couldn't start the discovery job.",
                errorCode: "INTERNAL",
            }
        }
        const jobId = jobRow.id as string

        // Helper to update + return job result
        const failJob = async (
            message: string,
            code: string,
        ): Promise<SupplierDiscoveryResult> => {
            await admin
                .from("supplier_discovery_jobs")
                .update({
                    status: "failed",
                    error_code: code,
                    error_message: message,
                    finished_at: new Date().toISOString(),
                })
                .eq("id", jobId)
            return {
                ok: false,
                error: message,
                errorCode: "DISCOVERY_FAILED",
            }
        }

        // 4. Brave Search (3 queries) + DeepSeek V4-Flash synthesis
        const gapDetails = {
            ...gap,
            moduleName: targetModule.name ?? null,
        }
        const searchQueries = [
            `${gap.industry ?? ""} ${gap.process ?? ""} manufacturer UK`.trim(),
            `${gap.material ?? ""} ${gap.process ?? ""} supplier Europe`.trim(),
            `${gap.industry ?? ""} contract manufacturer ${gap.material ?? ""} UK EU`.trim(),
        ].filter((q) => q.length > 10)

        let searchResults: string
        try {
            const searchPromises = searchQueries.map((q) => fetchBraveSearch(q, braveKey))
            const results = await Promise.all(searchPromises)
            searchResults = results
                .map((r, i) => `--- Search ${i + 1}: "${searchQueries[i]}" ---\n${r}`)
                .join("\n\n")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "brave search threw"
            console.error("[supplier-discovery] Brave Search threw:", msg)
            return await failJob(msg, "SEARCH_THREW")
        }

        if (!searchResults || searchResults.length < 50) {
            return await failJob("Search returned no meaningful results.", "EMPTY_SEARCH")
        }

        const prompt = buildDiscoveryPrompt(gapDetails, searchResults)

        let rawJson: string
        try {
            const llmResult = await callOpenRouter({
                model: DISCOVERY_MODEL,
                prompt,
                system: "You are a supplier research assistant. Output ONLY valid JSON. No markdown fences, no prose.",
                maxTokens: 4096,
                temperature: 0.2,
                timeoutMs: 60_000,
            })
            if (!llmResult.ok) {
                return await failJob(
                    `DeepSeek synthesis failed: ${llmResult.error}`,
                    "LLM_FAILED",
                )
            }
            rawJson = llmResult.text.trim()
        } catch (err) {
            const msg = err instanceof Error ? err.message : "discovery threw"
            console.error("[supplier-discovery] DeepSeek call threw:", msg)
            return await failJob(msg, "LLM_THREW")
        }

        // Loop 7 fix (2026-04-26 NIGHT): all 44 prior discovery jobs
        // failed with PARSE_FAIL because the parser only stripped markdown
        // fences. Opus + web_search responses sometimes prepend
        // "Here are the candidates I found:" before the JSON. Extract the
        // first {...} block as a fallback before failing.
        let cleaned = rawJson
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim()
        if (!cleaned.startsWith("{")) {
            const firstBrace = cleaned.indexOf("{")
            const lastBrace = cleaned.lastIndexOf("}")
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1)
            }
        }

        let parsed: { candidates?: Array<Partial<CandidateShape>> }
        try {
            parsed = JSON.parse(cleaned)
        } catch {
            console.error(
                "[supplier-discovery] JSON parse failed. Raw (first 500):",
                cleaned.slice(0, 500),
            )
            return await failJob("Couldn't parse research output.", "PARSE_FAIL")
        }

        const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : []
        const candidates: CandidateShape[] = rawCandidates
            .filter((c) => typeof c.name === "string" && typeof c.website === "string")
            .map((c) => ({
                name: String(c.name).slice(0, 200),
                website: String(c.website).slice(0, 300),
                hq_country: typeof c.hq_country === "string" ? c.hq_country.slice(0, 80) : null,
                capabilities: Array.isArray(c.capabilities)
                    ? c.capabilities.slice(0, 10).map((x) => String(x).slice(0, 80))
                    : [],
                rationale: typeof c.rationale === "string" ? c.rationale.slice(0, 400) : "",
            }))
            .slice(0, MAX_CANDIDATES)

        await admin
            .from("supplier_discovery_jobs")
            .update({
                status: "persisting",
                candidates_returned: candidates.length,
            })
            .eq("id", jobId)

        if (candidates.length === 0) {
            await admin
                .from("supplier_discovery_jobs")
                .update({
                    status: "done",
                    candidates_persisted: 0,
                    finished_at: new Date().toISOString(),
                })
                .eq("id", jobId)
            return {
                ok: true,
                job: {
                    jobId,
                    candidatesReturned: 0,
                    candidatesPersisted: 0,
                    status: "done",
                    error: "No real UK/EU suppliers found for this gap yet.",
                },
            }
        }

        // 5. Persist — upsert into `suppliers` with discovery metadata.
        //    Dedup by normalised website domain (case-insensitive, strip
        //    trailing slash, strip scheme).
        const nowIso = new Date().toISOString()
        const inferredDomain = (c: CandidateShape): string => {
            if (!c.website) return ""
            return c.website
                .replace(/^https?:\/\//i, "")
                .replace(/^www\./i, "")
                .replace(/\/.*$/, "")
                .toLowerCase()
                .trim()
        }

        const domainSet = new Set<string>()
        const deduped: CandidateShape[] = []
        for (const c of candidates) {
            const d = inferredDomain(c)
            if (!d || domainSet.has(d)) continue
            domainSet.add(d)
            deduped.push(c)
        }

        // Check which domains already exist in suppliers (dedup against
        // the global directory — don't insert duplicates of companies
        // we already have).
        const { data: existingByDomain } = await admin
            .from("suppliers")
            .select("id, website")
            .in(
                "website",
                Array.from(domainSet).flatMap((d) => [
                    `https://${d}`,
                    `https://www.${d}`,
                    `http://${d}`,
                    `http://www.${d}`,
                ]),
            )

        const existingDomains = new Set<string>()
        for (const row of existingByDomain ?? []) {
            const d = (row.website ?? "")
                .replace(/^https?:\/\//i, "")
                .replace(/^www\./i, "")
                .replace(/\/.*$/, "")
                .toLowerCase()
                .trim()
            if (d) existingDomains.add(d)
        }

        let persisted = 0
        for (const c of deduped) {
            const domain = inferredDomain(c)
            if (existingDomains.has(domain)) continue

            const supplierType = "manufacturer"
            const { error: insertErr } = await admin.from("suppliers").insert({
                name: c.name,
                website: c.website ?? null,
                supplier_type: supplierType,
                description: c.rationale || `Discovered for gap: ${gap.process ?? ""} / ${gap.material ?? ""}`,
                capabilities: {
                    processes: c.capabilities,
                },
                company_info: {
                    hq: c.hq_country,
                },
                verification_status: "unverified-ai-discovery",
                domain_categories: [normaliseGapString(gap.industry)].filter(Boolean),
                metadata: {
                    discovery: {
                        job_id: jobId,
                        gap_key_hash: gapKeyHash,
                        gap_process: gap.process,
                        gap_material: gap.material,
                        gap_industry: gap.industry,
                        triggered_by_foundry: foundryId,
                        triggered_by_project: projectId,
                        triggered_by_module: moduleId,
                        discovered_at: nowIso,
                        rationale: c.rationale,
                    },
                },
            })
            if (insertErr) {
                console.warn(
                    `[supplier-discovery] skip ${c.name}: ${insertErr.message}`,
                )
                continue
            }
            persisted += 1
        }

        // 6. Re-match — so the triggering project's shortlist refreshes
        try {
            await admin
                .from("supplier_discovery_jobs")
                .update({ status: "re_matching" })
                .eq("id", jobId)
            await matchSuppliersForProject(projectId)
        } catch (err) {
            console.warn(
                "[supplier-discovery] re-match threw:",
                err instanceof Error ? err.message : err,
            )
        }

        await admin
            .from("supplier_discovery_jobs")
            .update({
                status: "done",
                candidates_persisted: persisted,
                finished_at: new Date().toISOString(),
            })
            .eq("id", jobId)

        return {
            ok: true,
            job: {
                jobId,
                candidatesReturned: candidates.length,
                candidatesPersisted: persisted,
                status: "done",
            },
        }
    }, trusted)
}
