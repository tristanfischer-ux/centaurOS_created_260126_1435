/**
 * @file gate-5.ts — Quality Gates v2.0 — Gate 5: Supplier Validity Check
 *
 * @description Deterministic gate that runs after `matching_suppliers`
 * (Chase supplier match) and before the pipeline advances to
 * `running_fang_reviews`.
 *
 * ## What it checks
 *
 * Reads the project's supplier shortlist from `forge_supplier_shortlist` and
 * compares it against the BOM part list from the `parts` table to verify:
 *
 *   1. **URL-shape blocklist (check flag 1 — P1 FAIL)** — every supplier URL
 *      in the shortlist must NOT match the patterns in `_url-blocklist.ts`
 *      (news subdomains, blog paths, marketplace product pages, LinkedIn posts,
 *      Wikipedia, .edu domains, etc.). These are the recurring junk-URL classes
 *      the semantic matcher pulls in.
 *
 *   2. **Liveness / HTTP reachability (check flag 2 — P1 FAIL)** — for each
 *      URL that passes the shape check, sends a HEAD request with a 5s timeout.
 *      Falls back to GET with a Range header on 403 / 405 (common for servers
 *      that reject HEAD). URLs that 4xx / 5xx after both attempts are flagged as
 *      dead. Concurrency is capped at 8 simultaneous requests via the existing
 *      `verifySupplierUrls` utility (no separate p-limit dependency needed —
 *      the manual-batch loop in supplier-verification.ts is equivalent).
 *
 *   3. **Minimum 3 valid suppliers per BOM row (check flag 3 — P1 FAIL)** —
 *      for every top-level part row in the `parts` table for this project, the
 *      supplier shortlist must contain at least 3 entries with a valid URL
 *      (passes shape check + liveness) whose `matched_part_numbers` overlap
 *      with that part's `part_number`. The `is_proprietary` exception class
 *      is reserved for future use — the `parts` table does not carry that
 *      column in Phase 2.
 *
 * ## Verdict logic
 *
 * If ANY URL hits the blocklist, OR any URL fails liveness, OR any BOM row has
 * fewer than 3 valid suppliers → verdict `FAIL`, severity `P1`.
 *
 * PASS requires: zero blocklist hits + zero dead URLs + every BOM row ≥3 valid.
 *
 * ## Remediation
 *
 * - **Attempt 1:** Re-fire Chase supplier match with the blocklisted domains
 *   explicitly listed as banned in the remediation context. The context also
 *   names the BOM rows with insufficient supplier coverage so Chase can focus
 *   its re-match effort.
 *
 * - **Attempt 2 (still failing):** Same re-fire with an escalated note stating
 *   that the second attempt is in progress. Per spec §"Critical state-machine
 *   rules" rule 1: the attempt counter does NOT reset between re-fires.
 *   After 2 failures the pipeline ships with an uncertainty marker.
 *
 * ## No LLM calls
 *
 * This is a `deterministic` gate. Zero LLM calls — all checks are pure
 * code (regex + HTTP HEAD/GET). Cost per regen: ~£0.0005 (per spec).
 *
 * @see src/lib/forge-v2/stage-gates/types.ts          — DeterministicGate interface
 * @see src/lib/forge-v2/stage-gates/runner.ts         — runGate() orchestrator
 * @see src/lib/forge-v2/stage-gates/registry.ts       — registration (matching_suppliers entry)
 * @see src/lib/forge-v2/stage-gates/_url-blocklist.ts — blocklist patterns
 * @see src/lib/supplier-verification.ts               — HEAD/GET liveness verifier
 * @see src/actions/forge-v2-supplier-match.ts         — produces forge_supplier_shortlist rows
 *
 * FLOW: matching_suppliers → [Gate 5] → running_fang_reviews
 *       On FAIL attempt 1: → re-fire matching_suppliers (banned domains injected)
 *       On FAIL attempt 2: → re-fire matching_suppliers (escalated context, attempt 2)
 *       On 2× FAIL: → uncertainty_marker_required = true, advance with warning
 */

import { createAdminClient } from "@/lib/supabase/admin"
import {
    verifySupplierUrls,
    type SupplierUrlVerification,
} from "@/lib/supplier-verification"
import { isBlocklistedUrl, blocklistReason } from "./_url-blocklist"
import type { DeterministicGate, DeterministicCheckResult, GateContext } from "./types"

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum number of valid suppliers required per BOM row. */
const MIN_SUPPLIERS_PER_ROW = 3

/** Concurrency cap for HEAD/GET liveness requests. */
const LIVENESS_CONCURRENCY = 8

/** Timeout for each supplier URL HEAD/GET request (milliseconds). */
const LIVENESS_TIMEOUT_MS = 5_000

// ── Gate 5 input shape ──────────────────────────────────────────────────────

/**
 * A single entry from `forge_supplier_shortlist`.
 * Only the fields Gate 5 needs — resolved by `loadInput`.
 */
interface ShortlistEntry {
    id: string
    supplier_name: string
    /** The URL the engine surfaced for this supplier. May be null. */
    website_url: string | null
    /** Part numbers this supplier was matched against. */
    matched_part_numbers: string[]
}

/**
 * A top-level part row for the project from the `parts` table.
 * Used to build the "≥3 per BOM row" check.
 */
interface BomPart {
    id: string
    part_number: string
    name: string
    /**
     * Proprietary-component exception class.
     * The `parts` table does not carry `is_proprietary` in Phase 2.
     * This field defaults to false and is reserved for a future migration.
     */
    is_proprietary: boolean
}

/**
 * Full input data Gate 5 reads from Supabase for one gate evaluation.
 */
interface Gate5Input {
    projectId: string
    subject: string
    shortlist: ShortlistEntry[]
    bomParts: BomPart[]
    attempt: 1 | 2
}

// ── Per-URL check result ────────────────────────────────────────────────────

/**
 * The outcome of the URL shape + liveness check for one shortlist entry.
 * Gate 5 builds one of these per shortlist entry, then aggregates.
 */
interface UrlCheckOutcome {
    supplierId: string
    supplierName: string
    url: string | null
    /** True when the URL is null — no URL was captured for this supplier. */
    urlMissing: boolean
    /** True when the URL matched a blocklist pattern. */
    blocklisted: boolean
    blocklistReason: string | null
    /** True when the URL timed out or returned 4xx/5xx after HEAD+GET fallback. */
    dead: boolean
    livenessStatus: number | null
    livenessReason: string | null
    /** True when the URL is valid (present, not blocklisted, live). */
    valid: boolean
}

// ── Extended check result ───────────────────────────────────────────────────

/**
 * Extends DeterministicCheckResult with the per-URL and per-row findings
 * needed to build the remediation context message for the supplier re-match.
 */
interface Gate5CheckResult extends DeterministicCheckResult {
    /** Entries whose URL matched a blocklist pattern. */
    blocklistedEntries: UrlCheckOutcome[]
    /** Entries whose URL failed the HEAD/GET liveness check. */
    deadEntries: UrlCheckOutcome[]
    /** BOM rows that have fewer than MIN_SUPPLIERS_PER_ROW valid suppliers. */
    insufficientRows: Array<{
        partNumber: string
        partName: string
        validSupplierCount: number
        required: number
    }>
    /** Total supplier entries processed. */
    totalEntries: number
    /** Entries with no URL at all. */
    missingUrlCount: number
    /** Summary of check flags that triggered: 1=blocklist, 2=dead, 3=insufficient */
    checkFlags: number[]
}

// ── loadInput ──────────────────────────────────────────────────────────────

/**
 * Load the supplier shortlist and BOM part list for the project from Supabase.
 * Returns empty arrays rather than throwing on missing data — Gate 5 handles
 * the empty-shortlist case as a WARN (matching_suppliers may still be running).
 */
async function loadInput(ctx: GateContext): Promise<Gate5Input> {
    const admin = createAdminClient()

    // Load project subject for context messages
    const { data: project, error: projectError } = await admin
        .from("cad_lab_projects")
        .select("id, subject")
        .eq("id", ctx.projectId)
        .maybeSingle()

    if (projectError) {
        console.warn(
            `[gate-5] loadInput project query failed for project=${ctx.projectId}:`,
            projectError.message,
        )
    }

    // Load supplier shortlist
    // The shortlist stores supplier_id (= marketplace_listings.id) but does not
    // store the website_url directly. We do two queries:
    //   1. Load the shortlist rows (supplier_id + supplier_name + matched_part_numbers)
    //   2. Batch-load website_url from marketplace_listings for all supplier_ids
    //
    // DECISION: Resolving the URL from marketplace_listings at gate evaluation time
    // ensures we always use the freshest URL from the listing, not a stale snapshot.
    // No FK relationship is declared between forge_supplier_shortlist.supplier_id and
    // marketplace_listings.id in the PostgREST schema, so we cannot use a Supabase
    // join — a separate query is the safe approach.
    const { data: shortlistRaw, error: shortlistError } = await admin
        .from("forge_supplier_shortlist")
        .select("id, supplier_id, supplier_name, matched_part_numbers")
        .eq("project_id", ctx.projectId)

    if (shortlistError) {
        console.warn(
            `[gate-5] loadInput shortlist query failed for project=${ctx.projectId}:`,
            shortlistError.message,
        )
    }

    // Build a map of supplier_id → website_url by querying marketplace_listings
    const supplierIds = (shortlistRaw ?? [])
        .map((r) => r.supplier_id)
        .filter((id): id is string => !!id)

    const urlBySupplier = new Map<string, string | null>()

    if (supplierIds.length > 0) {
        const { data: listings, error: listingsError } = await admin
            .from("marketplace_listings")
            .select("id, website_url")
            .in("id", supplierIds)

        if (listingsError) {
            console.warn(
                `[gate-5] loadInput marketplace_listings query failed for project=${ctx.projectId}:`,
                listingsError.message,
            )
        }

        for (const listing of listings ?? []) {
            // `listing` is typed as the full marketplace_listings Row; we only need id + website_url.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const l = listing as any
            urlBySupplier.set(l.id as string, (l.website_url as string | null) ?? null)
        }
    }

    // Map to the flat ShortlistEntry shape Gate 5 needs
    const shortlist: ShortlistEntry[] = (shortlistRaw ?? []).map((row) => ({
        id: row.id,
        supplier_name: row.supplier_name,
        website_url: urlBySupplier.get(row.supplier_id ?? "") ?? null,
        matched_part_numbers: row.matched_part_numbers ?? [],
    }))

    // Load top-level BOM parts (no parent) for the project
    // The `parts` table does not carry `is_proprietary` in Phase 2 — default false.
    const { data: partsRaw, error: partsError } = await admin
        .from("parts")
        .select("id, part_number, name")
        .eq("cad_lab_project_id", ctx.projectId)

    if (partsError) {
        console.warn(
            `[gate-5] loadInput parts query failed for project=${ctx.projectId}:`,
            partsError.message,
        )
    }

    const bomParts: BomPart[] = (partsRaw ?? []).map((p) => ({
        id: p.id,
        part_number: p.part_number,
        name: p.name,
        is_proprietary: false, // No column in Phase 2 — reserved for future migration
    }))

    return {
        projectId: ctx.projectId,
        subject: (project?.subject as string | null) ?? "(unknown project)",
        shortlist,
        bomParts,
        attempt: ctx.attempt,
    }
}

// ── check ──────────────────────────────────────────────────────────────────

/**
 * Run the three deterministic checks against pre-loaded input data.
 *
 * This function is ASYNC because check 2 (liveness) requires HEAD/GET
 * requests. All URLs are batched in parallel via `verifySupplierUrls`
 * (which implements bounded concurrency at LIVENESS_CONCURRENCY = 8).
 *
 * @param input - Pre-loaded Gate 5 input from `loadInput`.
 * @returns Gate5CheckResult extending DeterministicCheckResult.
 */
async function check(input: Gate5Input): Promise<Gate5CheckResult> {
    const { shortlist, bomParts } = input

    // ── Empty shortlist ────────────────────────────────────────────────────
    // Chase supplier match hasn't completed yet or produced no results.
    // Return WARN rather than FAIL — pipeline may still be in progress.
    if (shortlist.length === 0) {
        return {
            check_name: "supplier_validity",
            passed: false,
            actual: "supplier shortlist empty",
            expected: "≥1 supplier in shortlist, each with a valid URL, ≥3 per BOM row",
            blocklistedEntries: [],
            deadEntries: [],
            insufficientRows: [],
            totalEntries: 0,
            missingUrlCount: 0,
            checkFlags: [],
        }
    }

    // ── Step 1: URL-shape blocklist check (synchronous) ───────────────────
    const blocklistedEntries: UrlCheckOutcome[] = []
    const urlsForLivenessCheck: string[] = []
    const urlToEntry = new Map<string, ShortlistEntry>()

    const missingUrlEntries: UrlCheckOutcome[] = []

    for (const entry of shortlist) {
        if (!entry.website_url) {
            missingUrlEntries.push({
                supplierId: entry.id,
                supplierName: entry.supplier_name,
                url: null,
                urlMissing: true,
                blocklisted: false,
                blocklistReason: null,
                dead: false,
                livenessStatus: null,
                livenessReason: "No URL stored for this supplier",
                valid: false,
            })
            continue
        }

        const reason = blocklistReason(entry.website_url)
        if (reason !== null) {
            blocklistedEntries.push({
                supplierId: entry.id,
                supplierName: entry.supplier_name,
                url: entry.website_url,
                urlMissing: false,
                blocklisted: true,
                blocklistReason: reason,
                dead: false,
                livenessStatus: null,
                livenessReason: null,
                valid: false,
            })
        } else {
            // Passed blocklist — queue for liveness check
            urlsForLivenessCheck.push(entry.website_url)
            urlToEntry.set(entry.website_url, entry)
        }
    }

    // ── Step 2: Liveness check (async HEAD/GET, concurrency=8) ───────────
    const livenessResults: Map<string, SupplierUrlVerification> =
        urlsForLivenessCheck.length > 0
            ? await verifySupplierUrls(
                  urlsForLivenessCheck,
                  LIVENESS_CONCURRENCY,
                  LIVENESS_TIMEOUT_MS,
              )
            : new Map()

    const deadEntries: UrlCheckOutcome[] = []
    const validOutcomes: UrlCheckOutcome[] = []

    for (const url of urlsForLivenessCheck) {
        const entry = urlToEntry.get(url)!
        const result = livenessResults.get(url) ?? {
            ok: false,
            reason: "Verifier returned no result",
            status: null,
            finalUrl: null,
        }

        const outcome: UrlCheckOutcome = {
            supplierId: entry.id,
            supplierName: entry.supplier_name,
            url,
            urlMissing: false,
            blocklisted: false,
            blocklistReason: null,
            dead: !result.ok,
            livenessStatus: result.status,
            livenessReason: result.ok ? null : result.reason,
            valid: result.ok,
        }

        if (!result.ok) {
            deadEntries.push(outcome)
        } else {
            validOutcomes.push(outcome)
        }
    }

    // ── Step 3: Minimum 3 valid suppliers per BOM row ─────────────────────
    // Build a set of (url) for all valid outcomes so we can look them up
    // when checking per-part supplier counts.
    const validSupplierIds = new Set(validOutcomes.map((o) => o.supplierId))

    const insufficientRows: Gate5CheckResult["insufficientRows"] = []

    for (const part of bomParts) {
        // Skip proprietary parts — they may legitimately have fewer suppliers.
        // (No `is_proprietary` column in Phase 2 — all default to false.)
        if (part.is_proprietary) continue

        // Count valid shortlist entries whose matched_part_numbers include this
        // part's part_number.
        const validCount = shortlist.filter(
            (entry) =>
                validSupplierIds.has(entry.id) &&
                entry.matched_part_numbers.includes(part.part_number),
        ).length

        if (validCount < MIN_SUPPLIERS_PER_ROW) {
            insufficientRows.push({
                partNumber: part.part_number,
                partName: part.name,
                validSupplierCount: validCount,
                required: MIN_SUPPLIERS_PER_ROW,
            })
        }
    }

    // ── Aggregate verdict ─────────────────────────────────────────────────
    const hasBlocklisted = blocklistedEntries.length > 0
    const hasDead = deadEntries.length > 0
    const hasInsufficient = insufficientRows.length > 0
    const totalEntries = shortlist.length
    const missingUrlCount = missingUrlEntries.length

    const checkFlags: number[] = []
    if (hasBlocklisted) checkFlags.push(1)
    if (hasDead) checkFlags.push(2)
    if (hasInsufficient) checkFlags.push(3)

    const passed = !hasBlocklisted && !hasDead && !hasInsufficient

    // Build a concise actual / expected string for the DB row
    const actualParts: string[] = []
    if (hasBlocklisted) actualParts.push(`${blocklistedEntries.length} blocklisted URL(s)`)
    if (hasDead) actualParts.push(`${deadEntries.length} dead URL(s)`)
    if (hasInsufficient) actualParts.push(`${insufficientRows.length} BOM row(s) with <${MIN_SUPPLIERS_PER_ROW} valid suppliers`)
    if (missingUrlCount > 0) actualParts.push(`${missingUrlCount} supplier(s) with no URL`)

    const actual = passed
        ? `${validOutcomes.length}/${totalEntries} suppliers valid, all BOM rows ≥${MIN_SUPPLIERS_PER_ROW}`
        : actualParts.join("; ")

    const expected = `0 blocklisted URLs, 0 dead URLs, ≥${MIN_SUPPLIERS_PER_ROW} valid suppliers per BOM row`

    return {
        check_name: "supplier_validity",
        passed,
        actual,
        expected,
        blocklistedEntries,
        deadEntries,
        insufficientRows,
        totalEntries,
        missingUrlCount,
        checkFlags,
    }
}

// ── Remediation context builder ─────────────────────────────────────────────

/**
 * Build the structured remediation context string injected into the
 * Chase supplier re-match request (both attempt 1 and attempt 2).
 *
 * The context explicitly names:
 * - The blocklisted domain(s) so Chase knows which domains to avoid
 * - The dead URL(s) so Chase knows which suppliers failed liveness
 * - The BOM rows that need more suppliers so Chase can focus its effort
 *
 * This string is stored in `gate_verdicts.remediation_context_injected`
 * and injected into the downstream action's `overrides` parameter.
 */
function buildRemediationContext(
    input: Gate5Input,
    result: Gate5CheckResult,
): string {
    const blocklistedLines =
        result.blocklistedEntries.length > 0
            ? result.blocklistedEntries
                  .slice(0, 10)
                  .map(
                      (e, i) =>
                          `  ${i + 1}. ${e.supplierName} — ${e.url} — REASON: ${e.blocklistReason}`,
                  )
                  .join("\n")
            : "  (none)"

    const deadLines =
        result.deadEntries.length > 0
            ? result.deadEntries
                  .slice(0, 10)
                  .map(
                      (e, i) =>
                          `  ${i + 1}. ${e.supplierName} — ${e.url} — HTTP ${e.livenessStatus ?? "N/A"}: ${e.livenessReason}`,
                  )
                  .join("\n")
            : "  (none)"

    const insufficientLines =
        result.insufficientRows.length > 0
            ? result.insufficientRows
                  .slice(0, 20)
                  .map(
                      (r, i) =>
                          `  ${i + 1}. ${r.partName} (${r.partNumber}) — ${r.validSupplierCount}/${r.required} valid suppliers`,
                  )
                  .join("\n")
            : "  (none)"

    // Collect the specific blocked domains to inject as an explicit ban list
    const blockedDomains = [
        ...new Set(
            result.blocklistedEntries.map((e) => {
                try {
                    return new URL(e.url!).hostname
                } catch {
                    return e.url ?? "(unknown)"
                }
            }),
        ),
    ]

    const blockedDomainList =
        blockedDomains.length > 0
            ? blockedDomains.map((d) => `  - ${d}`).join("\n")
            : "  (none)"

    const baseContext = [
        `Gate 5 supplier validity failure — project: ${input.subject}`,
        `Check flags: ${result.checkFlags.join(", ") || "none"} (1=blocklisted, 2=dead URL, 3=<${MIN_SUPPLIERS_PER_ROW} per BOM row)`,
        "",
        "Blocklisted URLs (must not appear in re-match results):",
        blocklistedLines,
        "",
        "Dead URLs (failed HEAD/GET after 5s):",
        deadLines,
        "",
        "BOM rows needing more suppliers:",
        insufficientLines,
        "",
        "Explicitly banned domains for re-match:",
        blockedDomainList,
    ].join("\n")

    if (input.attempt === 1) {
        return [
            baseContext,
            "",
            "REMEDIATION REQUEST (attempt 1):",
            `Re-run supplier match for this project. Exclude all URLs from the banned domains above.`,
            `For each BOM row listed above, find ≥${MIN_SUPPLIERS_PER_ROW} manufacturer/distributor URLs`,
            "that pass both the URL-shape check and the HEAD liveness test.",
            "Do NOT re-use any URL from the dead or blocklisted lists above.",
        ].join("\n")
    }

    // attempt 2
    return [
        baseContext,
        "",
        "REMEDIATION REQUEST (attempt 2 — final):",
        "Attempt 1 re-match still produced invalid supplier URLs or insufficient coverage.",
        "This is the final attempt. Re-run supplier match with the strictest possible URL filter:",
        "  • Only use URLs from manufacturer homepages or authorised distributor product pages.",
        "  • Prefer .com, .co.uk, .de, .jp domains for the manufacturer's own website.",
        "  • Reject any URL that is not a direct manufacturer or tier-1 distributor contact.",
        `  • Every BOM row must have ≥${MIN_SUPPLIERS_PER_ROW} distinct valid suppliers.`,
        "If the re-match still cannot find sufficient suppliers, record 'insufficient market coverage'",
        "in the supplier shortlist notes for that row so the PDF can surface it to the founder.",
        "Do NOT reset the Gate 5 attempt counter — this IS attempt 2.",
    ].join("\n")
}

// ── Gate severity ───────────────────────────────────────────────────────────

/**
 * Gate 5 uses P1 for all failures in Phase 2.
 *
 * Rationale: bad supplier URLs mislead founders about market coverage but do
 * not constitute a safety risk or a technically-infeasible output (unlike
 * INFEASIBLE-but-emitted in Gate 3 which is P0). They are a quality failure —
 * serious enough to block the pipeline but not at the P0 "stop everything" tier.
 *
 * If a future policy change makes supplier 404s a P0 (e.g. the PDF has already
 * been shared with investors), update this function and the spec together.
 */
function gateSeverity(result: Gate5CheckResult): "P0" | "P1" | null {
    if (result.passed) return null
    if (result.totalEntries === 0) return "P1" // empty shortlist
    return "P1"
}

// ── Public gate export ──────────────────────────────────────────────────────

/**
 * gate5 — Deterministic supplier validity gate.
 *
 * Satisfies the `DeterministicGate<Gate5Input>` contract. To be registered
 * in registry.ts under `matching_suppliers` by the main-thread merge commit:
 *
 *   import { gate5 } from "./gate-5"
 *   STAGE_GATE_MAP["matching_suppliers"] = gate5
 *
 * The gate's `check` function is async (liveness checks require HTTP I/O).
 * The `DeterministicGate` interface declares `check` as synchronous — we
 * cast the return type to satisfy the interface while preserving the async
 * contract. The runner.ts already awaits the result, so this is safe.
 *
 * @see src/lib/forge-v2/stage-gates/registry.ts   — registration point
 * @see src/lib/forge-v2/stage-gates/runner.ts     — execution orchestrator
 */
export const gate5: DeterministicGate<Gate5Input> = {
    kind: "deterministic",
    gateId: 5,
    name: "Supplier Validity Check",

    loadInput,

    // GOTCHA: The DeterministicGate interface declares check as sync, but Gate 5's
    // liveness step requires async HTTP I/O. We cast the async Promise<Gate5CheckResult>
    // to satisfy the interface. The runner.ts calls await on the result of runGate(),
    // which in turn awaits the check. TypeScript allows this cast because the runner
    // never enforces the sync contract at the call site.
    //
    // CRITICAL FIX (Loop 22): The runner only fires remediation when the check result
    // carries `remediationContext` and `remediationTargetStage` fields (runner.ts:417-422).
    // Without these fields willRemediate is always false, so Gate 5 never triggered a
    // Chase re-match after FAIL — explaining the 0/5 universal FAIL pattern where
    // attempt 2 was identical to attempt 1. Match the Gate 2/3 pattern: attach
    // remediation fields to the returned result before returning. The runner reads
    // them via the DeterministicCheckResult structural cast.
    check: ((input: Gate5Input) =>
        check(input).then((result) => {
            // Attach remediation fields — consumed by runner.ts willRemediate guard.
            // DECISION: structural extension via type-cast — same pattern as gate-2 and gate-3.
            const extended = result as Gate5CheckResult & {
                remediationContext: string
                remediationTargetStage: string
                severity: "P0" | "P1" | null
            }
            extended.remediationContext = result.passed
                ? ""
                : buildRemediationContext(input, result)
            extended.remediationTargetStage = "matching_suppliers"
            extended.severity = gateSeverity(result)
            return result
        })) as unknown as (input: Gate5Input) => DeterministicCheckResult,
}

// ── Re-exports for cron handler ─────────────────────────────────────────────

/**
 * Build the remediation context for a Gate 5 verdict.
 *
 * Re-exported so the cron handler (autopilot-tick/route.ts) can construct
 * the remediation context from the gate result and inject it into the
 * supplier re-match action's overrides parameter.
 *
 * Usage:
 *   const verdictResult = verdict_row.deterministic_result as Gate5CheckResult
 *   const context = gate5BuildRemediationContext(input, verdictResult)
 *
 * NOTE: The cron handler must first reconstruct a Gate5Input from DB state
 * (project subject + shortlist + bomParts) before calling this. The runner
 * stores the serialised `deterministic_result` in the DB row — the cron
 * handler deserialises it to get the check flags without re-running the check.
 */
export function gate5BuildRemediationContext(
    input: Gate5Input,
    result: Gate5CheckResult,
): string {
    return buildRemediationContext(input, result)
}

/**
 * Derive Gate 5's remediation target stage — always `matching_suppliers`
 * for both attempt 1 and attempt 2 (re-fire Chase supplier match).
 *
 * Unlike Gate 3 which escalates to Max on attempt 2, Gate 5 always retries
 * the supplier match with stricter filter context.
 */
export function gate5RemediationTargetStage(_attempt: 1 | 2): string {
    return "matching_suppliers"
}

/**
 * True when a Gate 5 check result indicates the shortlist was empty (not
 * populated yet). Useful for distinguishing "Chase hasn't finished" from
 * "Chase returned bad results" in the cron handler's retry logic.
 */
export function isGate5EmptyShortlist(result: DeterministicCheckResult): boolean {
    return result.actual === "supplier shortlist empty"
}

/**
 * True when a Gate 5 check result has check flag 1 (blocklisted URLs).
 * Useful for the cron handler to decide whether to inject the banned-domain
 * list into the re-match context.
 */
export function isGate5BlocklistedFailure(result: DeterministicCheckResult): boolean {
    return result.actual.includes("blocklisted URL")
}

/**
 * True when a Gate 5 check result has check flag 3 (insufficient suppliers).
 * Useful for the cron handler when building the supplier re-match overrides.
 */
export function isGate5InsufficientSuppliers(result: DeterministicCheckResult): boolean {
    return result.actual.includes(`<${MIN_SUPPLIERS_PER_ROW} valid suppliers`)
}

/**
 * Derive P-level severity from a persisted Gate 5 verdict's check result.
 * Matches the logic in `gateSeverity` above — used by the cron handler
 * without re-running the full check.
 */
export function gate5Severity(result: DeterministicCheckResult): "P0" | "P1" | null {
    if (result.passed) return null
    return "P1"
}
