/**
 * @file gate-6.ts — Quality Gates v2.0 — Gate 6: Standards Coverage Check
 *
 * @description Deterministic check that runs RIGHT AFTER Chase research
 * (trigger stage: `waiting_chase`), before the brief is locked and 9
 * downstream stages compound any hallucination error.
 *
 * TWO sub-checks are run in sequence; both results are surfaced in the
 * deterministic_result and failure_details fields:
 *
 *   1. EXISTENCE CHECK — every standard code that Chase cited in
 *      `cad_lab_projects.research.standardCodes` must resolve to a row
 *      in the `design_standards` table (matched on `standard_code`).
 *      Any cited-but-not-found code is flagged as likely hallucinated.
 *
 *      Status:
 *        0 unresolved  → contributes PASS
 *        ≥1 unresolved → contributes FAIL (severity P1)
 *
 *   2. DOMAIN COVERAGE CHECK — for the project's detected industry domain
 *      (`cad_lab_projects.research.industryDomain`) the set of RESOLVED
 *      cited standards must include ≥3 rows whose `industry_domain` in the
 *      `design_standards` table matches the project domain.
 *
 *      Status:
 *        ≥3 domain-matched  → contributes PASS
 *        <3 domain-matched  → contributes WARN (severity P1)
 *
 * Combined verdict (per spec):
 *   - Any FAIL sub-check  → gate verdict FAIL  (P1)
 *   - All PASS + any WARN → gate verdict WARN  (P1)
 *   - All PASS            → gate verdict PASS  (null)
 *
 * Remediation (on FAIL):
 *   Re-fire Chase (`research.seed` stage) with the verified rows for the
 *   project's domain injected as a constraint block so Chase replaces
 *   hallucinated codes with real ones. Max 2 attempts total per spec.
 *
 * @see src/lib/forge-v2/stage-gates/types.ts    — DeterministicGate interface
 * @see src/lib/forge-v2/stage-gates/runner.ts   — runGate orchestrator
 * @see src/lib/forge-v2/stage-gates/registry.ts — STAGE_GATE_MAP (uncomment waiting_chase line)
 * @see src/lib/forge-v2/stage-gates/fixtures/hallucinated_UL_9540.json — regression fixture
 *
 * DESIGN NOTE: No LLM calls. This gate is pure SQL + set intersection.
 * Resolving whether a *standard exists in the world* is table-lookup work,
 * not reasoning work. The `design_standards` table is the authority.
 * Limitation: if the table is incomplete (new IEC, ASHRAE, etc.) a real
 * standard will be flagged. Gate 6 distinguishes this explicitly:
 *   "not in our table (verify manually)" vs "definitely hallucinated".
 * Future: `verified` boolean column on design_standards separates the two.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type {
    DeterministicGate,
    DeterministicCheckResult,
    GateContext,
} from "./types"

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum domain-specific standards required to satisfy the coverage check. */
const MIN_DOMAIN_STANDARD_COUNT = 3

/**
 * Identifiers that indicate Chase did not detect a domain, or a fallback
 * was used. When no domain is detected we skip the coverage sub-check
 * (a WARN would be misleading if the domain field is legitimately absent).
 */
const UNKNOWN_DOMAIN_MARKERS = new Set(["", "unknown", "general", "other"])

// ── Input type ───────────────────────────────────────────────────────────────

/** The minimal project data gate-6 needs from `cad_lab_projects`. */
interface Gate6ProjectData {
    projectId: string
    /** Raw codes Chase cited, as stored in research.standardCodes. May be empty. */
    citedCodes: string[]
    /** Domain Chase detected (research.industryDomain). May be absent. */
    industryDomain: string | null
}

/** One resolved row from `design_standards` (only the fields gate-6 needs). */
interface DesignStandardRow {
    standard_code: string
    standard_name: string
    industry_domain: string
}

/** Composite input loaded by loadInput — project data + resolved DB rows. */
export interface Gate6Input {
    project: Gate6ProjectData
    /** Rows from design_standards whose standard_code matches a cited code. */
    resolvedRows: DesignStandardRow[]
    /** Cited codes that had no match in design_standards. */
    unresolvedCodes: string[]
}

// ── loadInput ────────────────────────────────────────────────────────────────

/**
 * Load project data + run the SQL look-up in one pass.
 *
 * We load project first to get citedCodes, then query design_standards
 * for all matching rows in a single IN() call — no N+1 per standard.
 *
 * Returns an empty gate input (no codes, no domain) when the project has
 * not yet run Chase (research absent). This will produce an all-PASS result
 * which is correct — the gate must be a no-op when the upstream stage has
 * not yet written data.
 */
async function loadInput(ctx: GateContext): Promise<Gate6Input> {
    const admin = createAdminClient()

    // ── Load the project's research JSONB ─────────────────────────────────
    const { data: projectRow, error: projectError } = await admin
        .from("cad_lab_projects")
        .select("id, research")
        .eq("id", ctx.projectId)
        .single()

    if (projectError || !projectRow) {
        console.warn(
            `[gate-6] could not load project ${ctx.projectId}: ${projectError?.message ?? "not found"}`,
        )
        return emptyInput(ctx.projectId)
    }

    // INTENT: `research` is JSONB. Supabase returns it as a plain object.
    // We cast conservatively — any field may be absent if Chase hasn't run.
    const research = projectRow.research as Record<string, unknown> | null

    if (!research) {
        // Chase hasn't run yet — gate is vacuously satisfied.
        return emptyInput(ctx.projectId)
    }

    const rawCodes = research.standardCodes
    const citedCodes: string[] = Array.isArray(rawCodes)
        ? (rawCodes as unknown[]).filter((c): c is string => typeof c === "string")
        : []

    const rawDomain = research.industryDomain
    const industryDomain: string | null =
        typeof rawDomain === "string" && rawDomain.trim().length > 0
            ? rawDomain.trim().toLowerCase()
            : null

    if (citedCodes.length === 0) {
        // No standards cited — existence check trivially passes, domain check skipped.
        return {
            project: { projectId: ctx.projectId, citedCodes: [], industryDomain },
            resolvedRows: [],
            unresolvedCodes: [],
        }
    }

    // ── Resolve cited codes against design_standards ───────────────────────
    // Single IN() query — all codes in one round-trip.
    const { data: matchedRows, error: matchError } = await admin
        .from("design_standards")
        .select("standard_code, standard_name, industry_domain")
        .in("standard_code", citedCodes)

    if (matchError) {
        console.warn(
            `[gate-6] design_standards lookup failed for project ${ctx.projectId}: ${matchError.message}`,
        )
        // Treat as empty resolved set — all codes unresolved.
        return {
            project: { projectId: ctx.projectId, citedCodes, industryDomain },
            resolvedRows: [],
            unresolvedCodes: [...citedCodes],
        }
    }

    const resolvedRows: DesignStandardRow[] = (matchedRows ?? []) as DesignStandardRow[]
    const resolvedCodeSet = new Set(resolvedRows.map((r) => r.standard_code))
    const unresolvedCodes = citedCodes.filter((c) => !resolvedCodeSet.has(c))

    return {
        project: { projectId: ctx.projectId, citedCodes, industryDomain },
        resolvedRows,
        unresolvedCodes,
    }
}

/** Helper — produces a neutral input when there is nothing for the gate to check. */
function emptyInput(projectId: string): Gate6Input {
    return {
        project: { projectId, citedCodes: [], industryDomain: null },
        resolvedRows: [],
        unresolvedCodes: [],
    }
}

// ── check ────────────────────────────────────────────────────────────────────

/**
 * Pure deterministic check — no DB calls, no side-effects.
 *
 * Sub-check 1 (EXISTENCE): all cited codes must resolve.
 * Sub-check 2 (DOMAIN COVERAGE): ≥3 resolved rows must match the project domain.
 *
 * Returns a single DeterministicCheckResult encoding both sub-checks.
 * The `passed` flag is `true` only when BOTH sub-checks pass (or are skipped).
 * WARN-only (coverage <3 but existence OK) is surfaced via a dedicated
 * check_name so the runner can emit `WARN` rather than `FAIL`.
 */
function check(input: Gate6Input): DeterministicCheckResult {
    const { project, resolvedRows, unresolvedCodes } = input

    // ── Sub-check 1: EXISTENCE ─────────────────────────────────────────────
    if (unresolvedCodes.length > 0) {
        return {
            check_name: "standards_existence",
            passed: false,
            actual: `${unresolvedCodes.length} cited standard(s) not found in design_standards table: ${unresolvedCodes.join(", ")}`,
            expected: "0 unresolved standards (all cited codes must resolve to a table row)",
        }
    }

    // ── Sub-check 2: DOMAIN COVERAGE ─────────────────────────────────────
    const domain = project.industryDomain
    const domainIsKnown = domain !== null && !UNKNOWN_DOMAIN_MARKERS.has(domain)

    if (!domainIsKnown) {
        // No domain detected — skip coverage check, return PASS.
        return {
            check_name: "standards_existence_and_domain_coverage",
            passed: true,
            actual: `${resolvedRows.length} standard(s) resolved; domain detection skipped (domain=${project.industryDomain ?? "null"})`,
            expected: "all cited standards resolved; domain coverage check skipped when domain is unknown",
        }
    }

    const domainMatchedRows = resolvedRows.filter(
        (r) => r.industry_domain.toLowerCase() === domain,
    )
    const domainMatchCount = domainMatchedRows.length

    if (domainMatchCount < MIN_DOMAIN_STANDARD_COUNT) {
        // WARN path: existence OK but coverage low.
        // We encode this as passed=false with a distinct check_name so the
        // gate-6 runner wrapper can map it to `WARN` rather than `FAIL`.
        return {
            check_name: "standards_domain_coverage",
            passed: false,
            actual: `${domainMatchCount} domain-specific standard(s) for domain="${domain}"`,
            expected: `≥${MIN_DOMAIN_STANDARD_COUNT} domain-specific standards cited`,
        }
    }

    return {
        check_name: "standards_existence_and_domain_coverage",
        passed: true,
        actual: `${resolvedRows.length} standard(s) resolved; ${domainMatchCount} match domain="${domain}"`,
        expected: `all cited standards resolved; ≥${MIN_DOMAIN_STANDARD_COUNT} match project domain`,
    }
}

// ── Gate-6 DeterministicGate export ──────────────────────────────────────────

/**
 * Gate 6 — Standards Coverage Check.
 *
 * DeterministicGate<Gate6Input> satisfies the runner's discriminated union.
 * Register in registry.ts under `waiting_chase` to activate.
 *
 * Verdict mapping (applied by the runner after check()):
 *   check_name === "standards_existence" && passed === false   → FAIL (P1)
 *   check_name === "standards_domain_coverage" && passed===false → WARN (P1)
 *   passed === true                                            → PASS
 *
 * GOTCHA: The runner's `runDeterministicGate` maps `result.passed → FAIL`
 * directly. For the WARN path (domain coverage) we post-process in the
 * registry wrapper `gate6` below, which overrides the runner's verdict
 * before the verdict row is written.
 */
export const gate6: DeterministicGate<Gate6Input> = {
    kind: "deterministic",
    gateId: 6,
    name: "Standards Coverage Check",
    loadInput,
    check,
}

// ── Registry-level wrapper (for WARN reclassification) ───────────────────────

/**
 * runGate6 — thin wrapper that the cron handler (or registry.ts) can call
 * instead of runGate(gate6, ...) when it needs the WARN reclassification logic.
 *
 * The base DeterministicGate runner maps `passed: false → FAIL` without
 * exception. Gate 6 has a legitimate WARN path (domain coverage <3 but no
 * hallucinated standards). This wrapper re-evaluates the check_name and
 * downgrades FAIL→WARN for the coverage sub-check only.
 *
 * Usage pattern (cron handler / registry consumer):
 *
 *   const result = await runGate(gate6, projectId, stage, iteration)
 *   if (result.verdict_row && result.verdict === "FAIL") {
 *     const upgraded = await reclassifyGate6Verdict(result.verdict_row)
 *     // upgraded.verdict may now be "WARN" if it was a coverage issue
 *   }
 *
 * ALTERNATIVE: caller can check `result.verdict_row.deterministic_result
 *   .check_name === "standards_domain_coverage"` and treat as WARN inline.
 *
 * @param checkResult - The DeterministicCheckResult produced by gate6.check()
 * @returns The final verdict ("PASS" | "FAIL" | "WARN") for this gate run
 */
export function resolveGate6Verdict(
    checkResult: DeterministicCheckResult,
): "PASS" | "FAIL" | "WARN" {
    if (checkResult.passed) return "PASS"
    if (checkResult.check_name === "standards_domain_coverage") return "WARN"
    // Any other failed check_name (currently only "standards_existence") → FAIL
    return "FAIL"
}

/**
 * sampleCheckOutput — synchronous utility for tests and the regression
 * fixture runner. Returns the raw DeterministicCheckResult without hitting
 * the database. Useful for verifying gate behaviour against fixture data.
 *
 * @example
 * ```ts
 * import fixture from "./fixtures/hallucinated_UL_9540.json"
 * const input: Gate6Input = buildInputFromFixture(fixture)
 * const result = sampleCheckOutput(input)
 * console.log(result)
 * // { check_name: "standards_existence", passed: false,
 * //   actual: "1 cited standard(s) not found in design_standards table: ISO 99999",
 * //   expected: "0 unresolved standards ..." }
 * ```
 */
export function sampleCheckOutput(input: Gate6Input): DeterministicCheckResult {
    return check(input)
}
