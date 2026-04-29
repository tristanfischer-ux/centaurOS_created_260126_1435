/**
 * @file compute-verdict.ts — Deterministic feasibility verdict.
 *
 * @description The frontier-LLM council (GPT-5.5, Gemini 3.1 Pro, DeepSeek
 * V4-Pro, Kimi K2.6, 2026-04-25 NIGHT) unanimously identified the highest-
 * impact engine patch as a "chief engineer feasibility gate": when sizing
 * is infeasible, mass overshoots the brief, or cost overshoots the ceiling
 * by a hard margin, the engine should NOT ship a polished 91-page design
 * package as if the project were proceeding. It should surface a Red
 * verdict on the brief page, emit a Feasibility Exception summary, and
 * tag downstream sections as tentative.
 *
 * This module is the deterministic compute step. It reads the assembled
 * project state (the same fields the proofreader and PDF render already
 * consume) and emits a {status, fails, tradeoffs} verdict. No LLM is
 * involved — every fail is grounded in numbers from the engine's own
 * outputs, so the verdict is reproducible and auditable.
 *
 * Status policy:
 *   red    — at least one BLOCKER fail (sizing infeasible, cost > 1.5×
 *            ceiling, mass > ceiling, mass > UK flatbed legal payload)
 *   amber  — at least one WARNING fail (cost over but ≤ 1.5×, mass within
 *            10% of ceiling, supplier coverage < 50%)
 *   green  — no fails
 *
 * UK 44-tonne articulated lorry: max gross 44,000 kg INCLUDING tractor +
 * trailer. Tractor + flatbed trailer typically weighs 14-16 t, so the
 * legal payload caps around 28-30 t. Above that, the load is "abnormal
 * indivisible" and needs STGO Category 2 paperwork, marker boards, 2 days
 * police notice. Surfaced 2026-04-25 NIGHT by Gemini 3.1 Pro on the BESS
 * critique — the engine had no mass calculator, so the "ships complete on
 * a flatbed" claim went unchallenged in the PDF.
 */

export type VerdictStatus = "green" | "amber" | "red"
export type VerdictAxis = "envelope" | "mass" | "cost" | "transport" | "suppliers" | "spatial_overflow" | "fang_critical_findings" | "cross_modal_consistency"
export type VerdictSeverity = "blocker" | "warning"

export interface VerdictFail {
    axis: VerdictAxis
    severity: VerdictSeverity
    summary: string
    evidence: string
}

export interface FeasibilityVerdict {
    status: VerdictStatus
    ran_at: string
    fails: VerdictFail[]
    tradeoffs: string[]
    /**
     * List of constraint axes the solver actually evaluated on this run.
     *
     * A GREEN verdict is only meaningful when this list is non-empty — it
     * means the solver ran, checked these constraints, and found no
     * violations. An empty `checkedConstraints` list means the solver had no
     * inputs to check (null dimensionSheet, null briefConstraints, zero parts)
     * and the GREEN is NOT evidence of a passing design; it is evidence of a
     * missing data pipeline. The PDF renders this as UNREVIEWED rather than GREEN.
     *
     * Loop 24 P0 fix — eliminates phantom-GREEN on Hedgerow / Vertical Farm /
     * Desalination / HAPS where the solver ran but found nothing to check.
     */
    checkedConstraints: string[]
}

export interface VerdictInput {
    /** dimension_sheet column */
    dimensionSheet: Record<string, unknown> | null
    /** research.designBrief.constraints — { unitCostCeilingGbp, maxMassKg, markets } */
    briefConstraints: Record<string, unknown> | null
    /** parts table rows — used for mass + cost roll-up */
    parts: Array<{
        mass_kg?: number | null
        estimated_unit_cost_gbp?: number | null
    }>
    /** Per-module cost estimates from ai_cost_estimates JSONB */
    aiCostEstimates: Record<string, unknown> | null
    /** Supplier shortlist count (used for coverage check) */
    shortlistCount: number
    /** Number of BOM rows (so coverage threshold scales) */
    bomRowCount: number
    /**
     * Notes from the spatial plan that may contain overflow annotations.
     * The layout engine writes "Port-side row overflows envelope by Nmm"
     * style notes when a placement does not fit the declared envelope.
     * When present, the verdict checks for overflow exceeding 5% of the
     * relevant envelope dimension and, when found, adds a blocker fail
     * on the "spatial_overflow" axis. This wires the spatial plan's own
     * overflow detection into the governing feasibility verdict rather
     * than silently emitting a note alongside a GREEN or AMBER badge.
     *
     * A3 — Loop 26 Tier-A fix.
     */
    spatialPlanNotes?: string[] | null
    /**
     * Envelope dimensions for the spatial plan (mm), used to compute the
     * 5% overflow threshold in the spatial_overflow check. Supply from
     * SpatialPlan.envelope when spatialPlanNotes is non-null.
     */
    spatialPlanEnvelopeDimensions?: {
        interior_w_mm: number
        interior_d_mm: number
        interior_h_mm: number
    } | null
    /**
     * Canonical pre-computed unit cost in GBP, from the de-duplicated
     * BOM parts roll-up (dedupedUnitTotalGbp). When supplied, this REPLACES
     * the aiCostEstimates + parts.estimated_unit_cost_gbp computation so
     * the verdict uses the IDENTICAL cost source that the PDF stat tile uses.
     *
     * Fix 1 — Loop 25 P0: unified cost roll-up.
     * The root cause of the stat-tile vs feasibility-exception gap was that
     * computeFeasibilityVerdict was called at pipeline time (proofreader stage)
     * using aiCostEstimates (Finn's coarse per-module numbers), while the PDF
     * stat tile is computed at render time using dedupAssemblyRollUp (granular
     * parts table, assembly-parent rows de-duplicated). Passing the same
     * dedupedUnitTotalGbp value here closes the gap: a single canonical source
     * feeds both the persisted verdict and the cover tile.
     *
     * callers: run-proofreader.ts (pipeline time), export-project-pdf.tsx
     * (render time re-compute for assertion).
     */
    canonicalUnitCostGbp?: number | null
    /**
     * Fang manufacturing review outputs, one entry per module. Used to
     * escalate CRITICAL manufacturing findings into the feasibility verdict
     * as blockers — previously they appeared only on individual module pages.
     *
     * Fix 3 — Loop 25 P0: HAPS phantom-GREEN via Fang CRITICAL escalation.
     * HAPS solar array had CRITICAL findings (£35M–£80M cell cost against a
     * £2.5M brief) that were visible on the module review page but not wired
     * into the feasibility verdict. Without a blocker in fails[], the verdict
     * had status=GREEN with empty checkedConstraints (phantom-GREEN). Adding
     * the fang_critical_findings axis ensures any module with CRITICAL findings
     * produces RED, not phantom-GREEN.
     *
     * Severity values that count as CRITICAL: "CRITICAL", "critical". Any
     * module with at least one such issue adds a blocker fail on the
     * fang_critical_findings axis.
     */
    fangModuleReviews?: Array<{
        moduleName: string
        issues: Array<{ severity: string; message: string }>
    }> | null
}

/** UK 44-tonne articulated lorry legal payload, in kilograms. Beyond this,
 *  the load is "abnormal indivisible" under the STGO and needs Category 2
 *  paperwork. Conservative 28t — 6-axle artic with heavy flatbed trailer. */
const UK_FLATBED_LEGAL_PAYLOAD_KG = 28_000

export function computeFeasibilityVerdict(
    input: VerdictInput,
): FeasibilityVerdict {
    const fails: VerdictFail[] = []
    // Tracks which constraint axes the solver had real data to evaluate.
    // Only axes with non-null, non-trivial inputs are added here.
    // A GREEN verdict is only valid when this list is non-empty.
    const checkedConstraints: string[] = []

    // ── Envelope (sizing) ────────────────────────────────────────────
    const sizingFeasible =
        input.dimensionSheet === null
            ? null
            : (input.dimensionSheet["feasible"] as boolean | undefined) ?? null
    const sizingConflicts = Array.isArray(input.dimensionSheet?.["conflicts"])
        ? (input.dimensionSheet!["conflicts"] as unknown[]).filter(
              (s): s is string => typeof s === "string",
          )
        : []
    // Mark envelope as checked when the dimension sheet was present and
    // contained a definitive feasible flag (true or false).
    if (input.dimensionSheet !== null && sizingFeasible !== null) {
        checkedConstraints.push("envelope")
    }
    if (sizingFeasible === false) {
        const evidence = sizingConflicts.length
            ? sizingConflicts.slice(0, 2).join(" ")
            : "Sizing solver returned feasible=false."
        fails.push({
            axis: "envelope",
            severity: "blocker",
            summary: "Design does not fit the declared envelope.",
            evidence,
        })
    }

    // ── Cost ─────────────────────────────────────────────────────────
    //
    // Fix 1 — Loop 25 P0: unified cost source.
    // When canonicalUnitCostGbp is supplied (the de-duplicated BOM
    // parts roll-up), use it directly. This is the IDENTICAL value the
    // PDF stat tile reads, so the verdict evidence and the cover tile
    // always agree. Fall back to aiCostEstimates + parts sum only when
    // the canonical value is absent (legacy / re-run paths).
    const costCeiling = numberOrNull(input.briefConstraints?.["unitCostCeilingGbp"])
    const totalCostGbp =
        input.canonicalUnitCostGbp != null && input.canonicalUnitCostGbp > 0
            ? input.canonicalUnitCostGbp
            : computeTotalCost(input.parts, input.aiCostEstimates)
    // Only treat cost as checked when both the ceiling and the total are
    // meaningful numbers — if either is null/zero there is nothing to
    // compare and a "no violations" result is vacuously true.
    if (costCeiling !== null && costCeiling > 0 && totalCostGbp !== null && totalCostGbp > 0) {
        checkedConstraints.push("cost")
        const overFactor = totalCostGbp / costCeiling
        if (overFactor > 1.5) {
            fails.push({
                axis: "cost",
                severity: "blocker",
                summary: `Estimated unit cost is ${overFactor.toFixed(1)}× the brief ceiling.`,
                evidence:
                    `£${formatGbp(totalCostGbp)} estimated vs £${formatGbp(costCeiling)} ceiling — ` +
                    `over by £${formatGbp(totalCostGbp - costCeiling)}.`,
            })
        } else if (overFactor > 1.0) {
            fails.push({
                axis: "cost",
                severity: "warning",
                summary: "Estimated unit cost exceeds the brief ceiling.",
                evidence: `£${formatGbp(totalCostGbp)} vs £${formatGbp(costCeiling)} (over by ${((overFactor - 1) * 100).toFixed(0)}%).`,
            })
        }
    }

    // ── Mass + UK transport legality ────────────────────────────────
    const massCeiling = numberOrNull(input.briefConstraints?.["maxMassKg"])
    const totalMassKg = computeTotalMass(input.parts)
    if (totalMassKg !== null && totalMassKg > 0) {
        if (massCeiling !== null && massCeiling > 0) {
            // Mass ceiling was declared AND parts have mass — real check.
            checkedConstraints.push("mass")
            if (totalMassKg > massCeiling) {
                fails.push({
                    axis: "mass",
                    severity: "blocker",
                    summary: "Estimated mass exceeds the brief ceiling.",
                    evidence: `${totalMassKg.toLocaleString("en-GB")} kg estimated vs ${massCeiling.toLocaleString("en-GB")} kg ceiling.`,
                })
            } else if (totalMassKg > massCeiling * 0.9) {
                fails.push({
                    axis: "mass",
                    severity: "warning",
                    summary: "Estimated mass within 10% of the brief ceiling.",
                    evidence: `${totalMassKg.toLocaleString("en-GB")} kg vs ${massCeiling.toLocaleString("en-GB")} kg.`,
                })
            }
        }

        const ukMarket =
            Array.isArray(input.briefConstraints?.["markets"]) &&
            (input.briefConstraints!["markets"] as unknown[]).some(
                (m) => typeof m === "string" && /^GB|UK$/i.test(m),
            )
        if (ukMarket) {
            // Transport legality is checkable once we have mass and a UK market flag.
            checkedConstraints.push("transport")
            if (totalMassKg > UK_FLATBED_LEGAL_PAYLOAD_KG) {
                fails.push({
                    axis: "transport",
                    severity: "blocker",
                    summary:
                        "Mass exceeds UK flatbed legal payload — cannot ship complete on a standard articulated lorry without abnormal-loads paperwork.",
                    evidence:
                        `${totalMassKg.toLocaleString("en-GB")} kg estimated; UK flatbed legal payload ~${UK_FLATBED_LEGAL_PAYLOAD_KG.toLocaleString("en-GB")} kg. ` +
                        "Above this the load is abnormal indivisible — STGO Category 2: marker boards, 2 days police notice, specialised heavy haulage.",
                })
            }
        }
    }

    // ── Spatial plan overflow ───────────────────────────────────────
    //
    // A3 — Loop 26 Tier-A fix.
    //
    // The layout engine writes notes like:
    //   "Port-side row overflows envelope by 38914mm — consider ..."
    // when a placement does not fit the declared envelope. Previously
    // the note appeared on the spatial plan page alongside a GREEN or
    // AMBER feasibility verdict — a 19.2m rack visibly outside a 10m
    // envelope was not flagged as a blocker. This check:
    //   1. Scans spatial plan notes for overflow annotations.
    //   2. Extracts the overflow magnitude in mm.
    //   3. Compares it to 5% of the largest envelope dimension.
    //   4. When exceeded, adds a BLOCKER fail on "spatial_overflow" so
    //      the verdict is RED and the PDF renders accordingly.
    //
    // Threshold: 5% of the maximum envelope dimension (w/d/h). This
    // admits small rounding artefacts (a few mm on a 3m envelope is
    // 150mm headroom) while catching gross physical impossibilities
    // like the 38914mm overflow on a 10000mm envelope.
    const SPATIAL_OVERFLOW_THRESHOLD_FRACTION = 0.05
    if (Array.isArray(input.spatialPlanNotes) && input.spatialPlanNotes.length > 0) {
        // The envelope threshold defaults to a generous 1m when dimensions
        // are not supplied — callers must pass dimensions for accurate checks.
        const envMax = input.spatialPlanEnvelopeDimensions
            ? Math.max(
                  input.spatialPlanEnvelopeDimensions.interior_w_mm,
                  input.spatialPlanEnvelopeDimensions.interior_d_mm,
                  input.spatialPlanEnvelopeDimensions.interior_h_mm,
              )
            : 1_000
        const threshold = envMax * SPATIAL_OVERFLOW_THRESHOLD_FRACTION

        // Parse overflow notes — pattern: "overflows envelope by Nmm"
        // The layout engine writes this in natural language; extract
        // the mm value with a lenient regex that handles spaces and commas.
        const OVERFLOW_RE = /overflows?\s+envelope\s+by\s+([\d,]+)\s*mm/i
        let maxOverflowMm = 0
        const overflowNotes: string[] = []
        for (const note of input.spatialPlanNotes) {
            const m = OVERFLOW_RE.exec(note)
            if (m) {
                const mm = parseFloat(m[1].replace(/,/g, ""))
                if (Number.isFinite(mm) && mm > maxOverflowMm) {
                    maxOverflowMm = mm
                }
                overflowNotes.push(note.trim())
            }
        }

        if (maxOverflowMm > threshold) {
            checkedConstraints.push("spatial_overflow")
            fails.push({
                axis: "spatial_overflow",
                severity: "blocker",
                summary: `Spatial plan does not fit the briefed envelope — maximum overflow is ${Math.round(maxOverflowMm).toLocaleString("en-GB")} mm.`,
                evidence:
                    `The layout engine flagged placement(s) that exceed the declared envelope ` +
                    `(${Math.round(envMax).toLocaleString("en-GB")} mm) by ${Math.round(maxOverflowMm).toLocaleString("en-GB")} mm ` +
                    `(${((maxOverflowMm / envMax) * 100).toFixed(0)}% of the envelope). ` +
                    `Spatial plan notes: ${overflowNotes.slice(0, 3).join(" | ")}`,
            })
        }
    }

    // ── Fang CRITICAL manufacturing findings ────────────────────────
    //
    // Fix 3 — Loop 25 P0: HAPS phantom-GREEN closure.
    //
    // Fang's CRITICAL findings (e.g. solar array cell cost £35M–£80M
    // against a £2.5M brief) appeared only on module review pages and
    // were NOT wired into the feasibility verdict. The result was a
    // verdict with status=GREEN and empty checkedConstraints — phantom-GREEN.
    //
    // This check scans fangModuleReviews for any issue with
    // severity="CRITICAL" (case-insensitive). When found, it adds a
    // BLOCKER fail on the fang_critical_findings axis. This means:
    //   (a) checkedConstraints becomes non-empty → phantom-GREEN cannot fire.
    //   (b) fails[] is non-empty → status becomes RED.
    //   (c) The feasibility exception page lists the CRITICAL findings
    //       as blockers, not silent module footnotes.
    if (Array.isArray(input.fangModuleReviews) && input.fangModuleReviews.length > 0) {
        // Collect all CRITICAL issues across all modules.
        const criticalFindings: Array<{ moduleName: string; message: string }> = []
        for (const mod of input.fangModuleReviews) {
            if (!Array.isArray(mod.issues)) continue
            for (const issue of mod.issues) {
                if (
                    typeof issue.severity === "string" &&
                    issue.severity.toUpperCase() === "CRITICAL"
                ) {
                    criticalFindings.push({
                        moduleName: mod.moduleName,
                        message: typeof issue.message === "string" ? issue.message : "(no message)",
                    })
                }
            }
        }
        if (criticalFindings.length > 0) {
            // Mark fang_critical_findings as a checked axis — the solver
            // had reviews with CRITICAL findings, so the constraint is real.
            checkedConstraints.push("fang_critical_findings")
            // Emit one blocker per module that has CRITICAL findings.
            // Group by module so a module with multiple CRITICAL issues
            // appears as a single blocker (avoids flooding the exception page).
            const byModule = new Map<string, string[]>()
            for (const f of criticalFindings) {
                const existing = byModule.get(f.moduleName) ?? []
                existing.push(f.message)
                byModule.set(f.moduleName, existing)
            }
            for (const [moduleName, messages] of byModule) {
                fails.push({
                    axis: "fang_critical_findings",
                    severity: "blocker",
                    summary: `${moduleName}: Fang raised CRITICAL manufacturing finding${messages.length > 1 ? "s" : ""}.`,
                    evidence: messages.slice(0, 3).join(" | "),
                })
            }
        }
    }

    // ── Supplier coverage ───────────────────────────────────────────
    if (input.bomRowCount > 0) {
        // A BOM with at least one row is a real coverage check.
        checkedConstraints.push("suppliers")
        const coverage = input.shortlistCount / input.bomRowCount
        if (coverage < 0.5) {
            fails.push({
                axis: "suppliers",
                severity: "warning",
                summary:
                    "Supplier shortlist covers under half the bill of materials.",
                evidence: `${input.shortlistCount} candidates against ${input.bomRowCount} rows — directory may be too thin for this domain.`,
            })
        }
    }

    // ── Status ──────────────────────────────────────────────────────
    // LOOP 24 P0: status GREEN is only valid when at least one constraint
    // axis was actually checked. When checkedConstraints is empty, the
    // solver had no inputs — every axis was null or trivially skipped.
    // Callers that read "green" must also verify checkedConstraints.length > 0;
    // the PDF layer maps empty-checked-green to UNREVIEWED.
    const hasBlocker = fails.some((f) => f.severity === "blocker")
    const status: VerdictStatus = hasBlocker
        ? "red"
        : fails.length > 0
          ? "amber"
          : "green"

    // ── Tradeoff suggestions ────────────────────────────────────────
    const tradeoffs: string[] = []
    const sizingRecs = Array.isArray(input.dimensionSheet?.["recommendations"])
        ? (input.dimensionSheet!["recommendations"] as unknown[]).filter(
              (s): s is string => typeof s === "string",
          )
        : []
    if (sizingFeasible === false && sizingRecs.length > 0) {
        tradeoffs.push(...sizingRecs.slice(0, 4))
    }
    if (
        fails.some((f) => f.axis === "cost" && f.severity === "blocker") &&
        costCeiling !== null
    ) {
        tradeoffs.push(
            `Revisit the £${formatGbp(costCeiling)} ceiling — for the declared scope, an independent cost benchmark suggests a higher floor; either the brief target needs adjusting, or scope must be cut.`,
        )
    }
    if (fails.some((f) => f.axis === "transport" && f.severity === "blocker")) {
        tradeoffs.push(
            "Either reduce capacity to fit a standard flatbed payload (~28 t), split the system across multiple containers shipped separately, or scope abnormal-loads transport into the cost and lead-time plan.",
        )
    }

    return {
        status,
        ran_at: new Date().toISOString(),
        fails,
        tradeoffs,
        checkedConstraints,
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function numberOrNull(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }
    return null
}

function computeTotalMass(
    parts: VerdictInput["parts"],
): number | null {
    let total = 0
    let any = false
    for (const p of parts) {
        const m = numberOrNull(p.mass_kg)
        if (m !== null && m > 0) {
            total += m
            any = true
        }
    }
    return any ? total : null
}

/** Use the cost estimates JSONB if present (per-module roll-up) — falls
 *  back to summing parts.estimated_unit_cost_gbp if the per-module cache
 *  is empty. The PDF Cost Waterfall page uses the same source, so this
 *  matches what the founder sees. */
function computeTotalCost(
    parts: VerdictInput["parts"],
    aiCostEstimates: Record<string, unknown> | null,
): number | null {
    if (aiCostEstimates && typeof aiCostEstimates === "object") {
        // Each value is { moduleId, totalPerUnit, labourCost, parts: [...] }.
        // Field name is `totalPerUnit` (NOT `totalGbp`); the PDF cost
        // waterfall reads the same field. Match it so the verdict and
        // the cost waterfall always agree.
        let total = 0
        let any = false
        for (const v of Object.values(aiCostEstimates)) {
            if (v && typeof v === "object") {
                const obj = v as { totalPerUnit?: unknown; totalGbp?: unknown }
                const t = numberOrNull(obj.totalPerUnit ?? obj.totalGbp)
                if (t !== null && t > 0) {
                    total += t
                    any = true
                }
            }
        }
        if (any) return total
    }
    let total = 0
    let any = false
    for (const p of parts) {
        const c = numberOrNull(p.estimated_unit_cost_gbp)
        if (c !== null && c > 0) {
            total += c
            any = true
        }
    }
    return any ? total : null
}

function formatGbp(n: number): string {
    return Math.round(n).toLocaleString("en-GB")
}
