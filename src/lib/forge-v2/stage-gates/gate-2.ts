/**
 * @file gate-2.ts — Quality Gates v2.0 — Gate 2: Module Completeness Check
 *
 * @description Deterministic gate that runs after `waiting_max` (Max's module
 * decomposition) and before the pipeline advances to `waiting_sizing`.
 *
 * ## What it checks
 *
 * Reads `cad_lab_projects.modules` (a JSONB array of CadLabModule) and
 * evaluates three conditions against every module:
 *
 *   1. **Has at least one key part** — `module.keyParts.length >= 1`
 *   2. **Every key part has a non-empty name** — no blank strings
 *   3. **No placeholder values** — neither "None declared" nor "TBD" (exact
 *      string match, case-sensitive) appear as any key part entry.
 *
 * If any module fails any of these conditions the gate returns `FAIL` with
 * severity `P1`. `failure_details` lists every failing module by ID and name.
 *
 * ## Remediation
 *
 * Gate 2 calls `runMaxDecomposition` with a `remediationModuleIds` context
 * injected into the project's `_gate2_remediation` field so that Max can
 * re-expand only the failing modules. There is no dedicated
 * `expandSingleModule` helper — the main `runMaxDecomposition` entry point
 * is used with the failing-module context encoded in the remediation field.
 *
 * Max 2 attempts. After exhaustion: pipeline ships with an uncertainty marker
 * noting incomplete modules.
 *
 * ## No LLM calls
 *
 * This is a `deterministic` gate. Zero LLM calls — the verdict comes entirely
 * from the persisted `modules` JSONB column.
 *
 * @see src/lib/forge-v2/stage-gates/types.ts                       — DeterministicGate interface
 * @see src/lib/forge-v2/stage-gates/runner.ts                      — runGate() orchestrator
 * @see src/lib/cad-lab-types.ts                                     — CadLabModule shape
 * @see src/actions/specialists/run-max-decomposition.ts             — produces modules
 * @see src/lib/forge-v2/stage-gates/fixtures/module_with_no_parts.json — regression fixture
 *
 * FLOW: waiting_max → [Gate 2] → waiting_sizing
 *       On FAIL attempt 1: → re-fire runMaxDecomposition for failing modules only
 *       On FAIL attempt 2: → ship with uncertainty marker
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DeterministicGate, DeterministicCheckResult, GateContext } from "./types"

// ── Placeholder values that signal an incomplete Max output ─────────────────
// These are the exact strings Max sometimes emits when it cannot determine
// the key parts for a module. Case-sensitive exact match.

const PLACEHOLDER_VALUES = ["None declared", "TBD"] as const

// ── Gate input shape ────────────────────────────────────────────────────────

interface Gate2Input {
    projectId: string
    subject: string
    /** Null when Max has not yet run or modules column is empty. Gate → WARN. */
    modules: CadLabModule[] | null
    attempt: 1 | 2
}

// ── Extended check result ───────────────────────────────────────────────────

/**
 * Extended check result carrying the extra fields needed to build the
 * remediation context when verdict is FAIL.
 */
interface Gate2CheckResult extends DeterministicCheckResult {
    /**
     * Array of failing module descriptors — used to build the remediation
     * context injected into the Max re-fire and stored in `failure_details`.
     */
    failingModules: Array<{
        id: string
        name: string
        reason: "no_key_parts" | "empty_part_name" | "placeholder_value"
        /** The offending value (for empty_part_name / placeholder_value). */
        offendingValue?: string
    }>
}

// ── loadInput ───────────────────────────────────────────────────────────────

async function loadInput(ctx: GateContext): Promise<Gate2Input> {
    const admin = createAdminClient()

    const { data, error } = await admin
        .from("cad_lab_projects")
        .select("id, subject, modules")
        .eq("id", ctx.projectId)
        .maybeSingle()

    if (error) {
        console.warn(
            `[gate-2] loadInput failed for project=${ctx.projectId}:`,
            error.message,
        )
    }

    // modules is stored as a JSONB object keyed by moduleId → CadLabModule.
    // bom.ts and other callers use Object.values() to iterate — we do the same.
    const rawModules = data?.modules as Record<string, CadLabModule> | CadLabModule[] | null
    let modules: CadLabModule[] | null = null

    if (rawModules != null) {
        modules = Array.isArray(rawModules)
            ? rawModules
            : Object.values(rawModules)
    }

    return {
        projectId: ctx.projectId,
        subject: (data?.subject as string | null) ?? "(unknown project)",
        modules,
        attempt: ctx.attempt,
    }
}

// ── check ────────────────────────────────────────────────────────────────────

function check(input: Gate2Input): Gate2CheckResult {
    // ── modules column absent or empty ─────────────────────────────────────
    // Max hasn't run yet or the column is empty.
    if (!input.modules || input.modules.length === 0) {
        return {
            check_name: "module_completeness",
            passed: false,
            actual: "modules absent or empty",
            expected: "every module has ≥1 key part with valid names",
            failingModules: [],
        }
    }

    const failingModules: Gate2CheckResult["failingModules"] = []

    for (const mod of input.modules) {
        const moduleId = mod.id ?? "(unknown)"
        const moduleName = mod.name ?? "(unknown)"

        // ── Rule 1: must have at least one key part ─────────────────────
        if (!mod.keyParts || mod.keyParts.length === 0) {
            failingModules.push({
                id: moduleId,
                name: moduleName,
                reason: "no_key_parts",
            })
            continue // no point checking further rules on this module
        }

        // ── Rules 2 & 3: check each key part ────────────────────────────
        for (const part of mod.keyParts) {
            if (!part || part.trim() === "") {
                failingModules.push({
                    id: moduleId,
                    name: moduleName,
                    reason: "empty_part_name",
                    offendingValue: part,
                })
                break // one failure per module is enough
            }

            if ((PLACEHOLDER_VALUES as readonly string[]).includes(part)) {
                failingModules.push({
                    id: moduleId,
                    name: moduleName,
                    reason: "placeholder_value",
                    offendingValue: part,
                })
                break // one failure per module is enough
            }
        }
    }

    // ── PASS ────────────────────────────────────────────────────────────────
    if (failingModules.length === 0) {
        return {
            check_name: "module_completeness",
            passed: true,
            actual: `all ${input.modules.length} module(s) have valid key parts`,
            expected: "every module has ≥1 key part with valid names",
            failingModules: [],
        }
    }

    // ── FAIL ────────────────────────────────────────────────────────────────
    const failSummary = failingModules
        .map((m) => {
            const detail =
                m.reason === "no_key_parts"
                    ? "0 key parts"
                    : m.reason === "empty_part_name"
                      ? "empty part name"
                      : `placeholder "${m.offendingValue}"`
            return `${m.id} (${m.name}): ${detail}`
        })
        .join("; ")

    return {
        check_name: "module_completeness",
        passed: false,
        actual: `${failingModules.length} of ${input.modules.length} module(s) incomplete — ${failSummary}`,
        expected: "every module has ≥1 key part with valid names",
        failingModules,
    }
}

// ── Remediation context builder ─────────────────────────────────────────────

/**
 * Build the structured remediation context string injected into the Max
 * re-fire. Stored in `gate_verdicts.remediation_context_injected`.
 *
 * DECISION: No dedicated `expandSingleModule` helper exists in
 * `run-max-decomposition.ts`. The main `runMaxDecomposition` entry point is
 * used. The failing module IDs are written to a project-level
 * `_gate2_remediation` object that Max reads to constrain which modules to
 * re-expand. Max 2 attempts — after exhaustion, the pipeline ships with an
 * uncertainty marker listing the incomplete modules.
 */
function buildRemediationContext(input: Gate2Input, result: Gate2CheckResult): string {
    const failingIds = result.failingModules.map((m) => m.id).join(", ")
    const failingLines = result.failingModules
        .map((m, i) => {
            const reason =
                m.reason === "no_key_parts"
                    ? "produced zero key parts"
                    : m.reason === "empty_part_name"
                      ? 'produced an empty string as a key part name'
                      : `produced placeholder value "${m.offendingValue}" as a key part`
            return `  ${i + 1}. ${m.name} (id: ${m.id}) — ${reason}`
        })
        .join("\n")

    const baseContext = [
        `Gate 2 module completeness failure.`,
        `Project: ${input.subject}`,
        `Total modules: ${input.modules?.length ?? 0}`,
        `Failing modules (${result.failingModules.length}):`,
        failingLines,
    ].join("\n")

    if (input.attempt === 1) {
        return [
            baseContext,
            "",
            "REMEDIATION REQUEST (attempt 1 → re-expand failing modules only):",
            `Re-run Max decomposition for module IDs: [${failingIds}]`,
            "For each failing module:",
            "  • List every major physical component as a distinct key part.",
            "  • Each key part must be a real engineering component name",
            '    (e.g. "16S2P lithium-ion cell stack", "BMS PCB"), not a placeholder.',
            '  • Do NOT use "None declared", "TBD", or empty strings.',
            "  • The founder's brief is immutable — do not change the module purpose.",
            "Only re-expand the listed modules. Leave all other modules unchanged.",
        ].join("\n")
    }

    // attempt 2
    return [
        baseContext,
        "",
        "REMEDIATION REQUEST (attempt 2 — final):",
        `A previous attempt to re-expand modules [${failingIds}] still resulted`,
        "in incomplete key parts. Max is being re-fired one final time.",
        "If this attempt also fails, the pipeline will ship with an uncertainty marker.",
        "Please provide the most complete list of key parts you can, even if estimated.",
        "Any real component name is better than a placeholder.",
        `Modules still failing: [${failingIds}]`,
    ].join("\n")
}

// ── Uncertainty marker ───────────────────────────────────────────────────────

/**
 * Build the uncertainty marker text surfaced on the PDF when Gate 2 exhausts
 * both remediation attempts.
 *
 * Only called when attempt === 2 AND check still fails — the runner sets
 * `uncertainty_marker_required = true` and stores this text in the verdict row.
 */
export function buildGate2UncertaintyMarker(failingModules: Gate2CheckResult["failingModules"]): string {
    const names = failingModules.map((m) => m.name).join(", ")
    return (
        `Module decomposition incomplete: the following modules could not produce ` +
        `valid key parts after two attempts — ${names}. ` +
        `Bill of materials, cost estimates, and supplier matching for these modules ` +
        `may be incomplete or missing.`
    )
}

// ── Public gate export ───────────────────────────────────────────────────────

/**
 * gate2 — Deterministic module completeness gate.
 *
 * Satisfies the `DeterministicGate<Gate2Input>` contract. Registered in
 * registry.ts under `waiting_max` by the main-thread merge commit.
 *
 * The runner calls `loadInput` then `check`. Remediation context is built
 * here (not in runner.ts) because it requires knowledge of the failing-module
 * list and the Max re-fire contract.
 *
 * Usage from registry.ts (after main-thread merge):
 *   import { gate2 } from "./gate-2"
 *   STAGE_GATE_MAP["waiting_max"] = gate2
 *
 * @see src/lib/forge-v2/stage-gates/registry.ts — registration point
 * @see src/lib/forge-v2/stage-gates/runner.ts   — execution orchestrator
 */
export const gate2: DeterministicGate<Gate2Input> = {
    kind: "deterministic",
    gateId: 2,
    name: "Module Completeness Check",

    loadInput,

    check(input: Gate2Input): DeterministicCheckResult {
        const result = check(input)

        // Attach remediation fields to the returned result so the cron handler
        // can extract them from the GateRunResult without re-running the check.
        // DECISION: structural extension via type-cast — same pattern as gate-3.
        // The runner only reads the base DeterministicCheckResult fields;
        // extra fields are consumed by the cron handler.
        const extended = result as Gate2CheckResult & {
            remediationContext: string
            remediationTargetStage: string
            severity: "P1" | null
            uncertaintyMarkerText: string | null
        }

        extended.remediationContext = input.modules
            ? buildRemediationContext(input, result as Gate2CheckResult)
            : "modules absent — Max decomposition has not completed"
        extended.remediationTargetStage = "waiting_max"
        extended.severity = result.passed ? null : "P1"
        extended.uncertaintyMarkerText =
            !result.passed && input.attempt === 2 && result.failingModules.length > 0
                ? buildGate2UncertaintyMarker(result.failingModules)
                : null

        return result
    },
}

// ── Re-exported helpers for cron handler ────────────────────────────────────

/**
 * Re-exported for use by the cron handler when it needs to extract the
 * remediation context from a Gate 2 verdict row and decide whether to re-fire
 * Max or ship with an uncertainty marker.
 */
export function gate2RemediationTargetStage(): string {
    return "waiting_max"
}

export function isGate2Pass(result: DeterministicCheckResult): boolean {
    return result.passed
}

export function gate2FailingModuleIds(result: DeterministicCheckResult): string[] {
    // The failingModules array is attached to the extended result object.
    // Safe to access via cast because gate-2 always attaches it.
    const extended = result as Gate2CheckResult
    if (!extended.failingModules) return []
    return extended.failingModules.map((m) => m.id)
}
