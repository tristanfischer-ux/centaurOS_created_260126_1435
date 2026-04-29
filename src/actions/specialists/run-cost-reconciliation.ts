"use server"

/**
 * @file run-cost-reconciliation.ts — Post-Finn cost reconciliation action.
 *
 * @description Fetches the four independent cost sources for a project,
 * runs the pure-function reconciliation, and persists the result to
 * cad_lab_projects.cost_reconciliation.
 *
 * Called immediately after Finn completes in runFinnCostInternal. Can also
 * be triggered on-demand (e.g., when BOM is regenerated or supplier quotes
 * are updated) because it is idempotent — it overwrites with a fresh
 * calculation each time.
 *
 * Pipeline:
 *   1. Load project — verify foundry ownership.
 *   2. Extract four sources:
 *      a. Canonical total from ai_cost_estimates JSONB (Finn's output).
 *      b. BOM-derived total from parts + bom_lines JOIN.
 *      c. Supplier-derived total from manufacturing_order_lines.
 *      d. Brief ceiling from design_brief.constraints.unitCostCeilingGbp.
 *   3. Run reconcileCosts() — pure function, no I/O.
 *   4. Persist result to cad_lab_projects.cost_reconciliation JSONB.
 *   5. Return the result for the caller to log or display.
 *
 * Error handling:
 *   This action MUST NOT block the Finn pipeline even if it fails.
 *   All errors are caught and returned as { ok: false, ... }.
 *   runFinnCostInternal catches the error, logs a warning, and proceeds.
 *
 * @related
 *   - Pure function:    src/lib/cost/cost-reconciliation.ts
 *   - Finn pipeline:    src/actions/specialists/run-finn-cost.ts
 *   - BOM reconcile:    src/lib/bom/bom-reconciliation.ts (count-gate, same pattern)
 */

import { createAdminClient } from "@/lib/supabase/admin"
import {
    reconcileCosts,
    type AiCostEstimateForReconciliation,
    type BomLineForReconciliation,
    type SupplierLineForReconciliation,
    type CostReconciliationResult,
} from "@/lib/cost/cost-reconciliation"
import type { AiCostEstimate, CadLabDesignBrief } from "@/lib/cad-lab-types"

// ── Public types ──────────────────────────────────────────────────────

export interface RunCostReconciliationResult {
    ok: true
    projectId: string
    reconciliation: CostReconciliationResult
}

export interface RunCostReconciliationError {
    ok: false
    projectId: string
    error: string
}

export type RunCostReconciliationReturn =
    | RunCostReconciliationResult
    | RunCostReconciliationError

// ── Main action ───────────────────────────────────────────────────────

/**
 * Run the post-Finn cost reconciliation for a project.
 *
 * Designed to be called from runFinnCostInternal immediately after Finn
 * saves its estimates. MUST be called with try/catch by the caller —
 * this action itself throws on unexpected errors so the caller can
 * distinguish a soft failure (returned error) from a hard failure (throw).
 *
 * @param projectId - V2 project UUID.
 * @param foundryId - Foundry that owns the project (for ownership check).
 */
export async function runCostReconciliation(
    projectId: string,
    foundryId: string,
): Promise<RunCostReconciliationReturn> {
    const admin = createAdminClient()

    // ── 1. Load project ──────────────────────────────────────────────

    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, foundry_id, ai_cost_estimates, design_brief")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr) {
        return { ok: false, projectId, error: `Project load failed: ${projectErr.message}` }
    }
    if (!project) {
        return { ok: false, projectId, error: "Project not found" }
    }
    if (project.foundry_id !== foundryId) {
        return { ok: false, projectId, error: "Foundry ownership mismatch" }
    }

    // ── 2a. Canonical total from ai_cost_estimates ───────────────────

    // DECISION (Council fix 2C): pass ALL estimates through to reconciliation,
    // including those with null totalPerUnit. The reconcileCosts function
    // separates costed from uncosted modules and tracks uncosted ones
    // explicitly rather than silently dropping them.
    const aiEstimatesRaw = project.ai_cost_estimates as Record<string, AiCostEstimate> | null
    const finnEstimates: AiCostEstimateForReconciliation[] = aiEstimatesRaw
        ? Object.values(aiEstimatesRaw)
              .filter((e): e is AiCostEstimate => e != null)
              .map((e) => ({
                  moduleId: e.moduleId,
                  totalPerUnit: typeof e.totalPerUnit === "number" ? e.totalPerUnit : null,
              }))
        : []

    // ── 2b. BOM-derived total from parts + bom_lines JOIN ────────────
    //
    // We join bom_lines (which holds quantity) with parts (which holds
    // estimated_unit_cost_gbp) and only consider top-level lines
    // (parent_part_id IS NULL) to avoid double-counting sub-assemblies
    // that are themselves the sum of their children.

    const { data: bomRows, error: bomErr } = await admin
        .from("bom_lines")
        .select(
            "id, quantity, child_part_id, parent_part_id, parts!inner(id, estimated_unit_cost_gbp, source_module_id)",
        )
        .eq("cad_lab_project_id", projectId)
        .is("parent_part_id", null) // top-level only

    if (bomErr) {
        console.warn(
            `[run-cost-reconciliation] BOM lines load failed for ${projectId}: ${bomErr.message}`,
        )
        // Non-blocking — continue with bomLines = [] which means bomDerivedTotal = null.
    }

    const bomLines: BomLineForReconciliation[] = (bomRows ?? []).map((row) => {
        const part = Array.isArray(row.parts) ? row.parts[0] : row.parts
        return {
            id: row.id,
            estimatedUnitCostGbp:
                typeof (part as { estimated_unit_cost_gbp?: unknown })?.estimated_unit_cost_gbp === "number"
                    ? (part as { estimated_unit_cost_gbp: number }).estimated_unit_cost_gbp
                    : null,
            quantity: row.quantity ?? 1,
            sourceModuleId:
                typeof (part as { source_module_id?: unknown })?.source_module_id === "string"
                    ? (part as { source_module_id: string }).source_module_id
                    : null,
        }
    })

    // ── 2c. Supplier-derived total from manufacturing_order_lines ────
    //
    // manufacturing_order_lines are tied to parts via part_id. We fetch
    // lines whose part is in this project by joining through parts.
    // Only lines with a quoted price contribute.

    const { data: supplierRows, error: supplierErr } = await admin
        .from("manufacturing_order_lines")
        .select("id, part_id, quantity, quoted_unit_price_gbp, parts!inner(cad_lab_project_id)")
        .eq("parts.cad_lab_project_id", projectId)

    if (supplierErr) {
        console.warn(
            `[run-cost-reconciliation] Supplier lines load failed for ${projectId}: ${supplierErr.message}`,
        )
        // Non-blocking — continue with supplierLines = [] which means supplierDerivedTotal = null.
    }

    const supplierLines: SupplierLineForReconciliation[] = (supplierRows ?? []).map((row) => ({
        partId: row.part_id,
        quotedUnitPriceGbp:
            typeof row.quoted_unit_price_gbp === "number" ? row.quoted_unit_price_gbp : null,
        quantity: row.quantity ?? 1,
    }))

    // ── 2d. Brief ceiling ────────────────────────────────────────────

    const designBriefRaw = project.design_brief as CadLabDesignBrief | null
    const briefCeilingGbp =
        typeof designBriefRaw?.constraints?.unitCostCeilingGbp === "number"
            ? designBriefRaw.constraints.unitCostCeilingGbp
            : null

    // ── 3. Run pure reconciliation ───────────────────────────────────

    const reconciliation = reconcileCosts({
        projectId,
        finnEstimates,
        bomLines,
        supplierLines,
        briefCeilingGbp,
    })

    // ── 4. Persist result ────────────────────────────────────────────

    const { error: updateErr } = await admin
        .from("cad_lab_projects")
        .update({ cost_reconciliation: reconciliation as unknown as Record<string, unknown> } as unknown as never)
        .eq("id", projectId)
        .eq("foundry_id", foundryId)

    if (updateErr) {
        console.error(
            `[run-cost-reconciliation] Failed to persist result for ${projectId}: ${updateErr.message}`,
        )
        // Return the result anyway — the caller logs this separately and can
        // retry the persist. The reconciliation itself is correct.
        return { ok: false, projectId, error: `Persist failed: ${updateErr.message}` }
    }

    // ── 5. Log summary ───────────────────────────────────────────────

    const { sources, hasWarnings, hasCritical } = reconciliation
    console.info(
        `[run-cost-reconciliation] ${projectId}: ` +
        `canonical=£${sources.canonicalTotalGbp?.toFixed(2) ?? "—"} ` +
        `bom=£${sources.bomDerivedTotalGbp?.toFixed(2) ?? "—"} ` +
        `supplier=£${sources.supplierDerivedTotalGbp?.toFixed(2) ?? "—"} ` +
        `ceiling=£${sources.briefCeilingGbp?.toFixed(2) ?? "—"} ` +
        `warnings=${hasWarnings} critical=${hasCritical}`,
    )

    if (hasCritical) {
        console.warn(
            `[run-cost-reconciliation] CRITICAL: ${reconciliation.summaryMessage} (project=${projectId})`,
        )
    } else if (hasWarnings) {
        console.warn(
            `[run-cost-reconciliation] WARNING: ${reconciliation.summaryMessage} (project=${projectId})`,
        )
    }

    return { ok: true, projectId, reconciliation }
}
