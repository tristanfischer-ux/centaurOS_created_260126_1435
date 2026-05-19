/**
 * @file pdf-validator.ts — Pre-render layout validator for ForgeOS project PDF export.
 *
 * Checks the PdfInput data structure BEFORE it is handed to @react-pdf/renderer.
 * The goal is to catch common bugs that silently produce a bad PDF (blank pages,
 * truncated tables, missing sections) without requiring the expensive render step.
 *
 * This is a DATA validator — it inspects the data that feeds the PDF, not the
 * rendered bytes themselves. Render-artefact bugs (black SVG rectangles, page-break
 * splits) require the forgeos-loop.md step-2 read-the-PDF procedure.
 *
 * Usage:
 *   const { valid, issues } = validatePdfLayout(pdfInput)
 *   if (!valid) console.warn("[pdf-validator]", issues)
 *   // Continue rendering — validation is advisory, not blocking.
 */

// ---------------------------------------------------------------------------
// Minimal type mirror of PdfInput — we only declare what the validator needs.
// Keeping this self-contained avoids a circular import from the 7 000-line
// export-project-pdf.tsx action file.
// ---------------------------------------------------------------------------

export interface PdfValidatorInput {
    projectName: string
    brief: {
        subject: string | null
        mission: string | null
        useCase: string | null
        unitCostCeilingGbp: number | null
        maxMassKg: number | null
    }
    regulatory: Array<{ code: string | null | undefined }>
    modules: Array<{
        id: string
        name: string
        purpose: string
        description: string
        keyParts: string[]
        failureModes: string[]
        unknowns: string[]
        reviews: Array<unknown>
        riskMatrix: Array<unknown>
        cost: unknown | null
    }>
    parts: Array<{
        partNumber: string
        name: string
        sourceModuleName: string | null
        estimatedUnitCostGbp: number | null
    }>
    cost: {
        unitTotalGbp: number | null
        ceilingGbp: number | null
        perModule: Array<{ moduleName: string; totalGbp: number | null }>
    }
    suppliers: Array<{
        name: string
        moduleNames: string[]
    }>
    totals: {
        moduleCount: number
        keyPartCount: number
        partRowCount: number
        failureModeCount: number
        unknownCount: number
        regulatoryCount: number
        supplierCount: number
        reviewCount: number
    }
    auditLog: Array<unknown>
}

// ---------------------------------------------------------------------------
// Thresholds — the "expected" floor counts for a full ForgeOS report.
// These are derived from the forgeos-loop.md surface-level red flags list.
// ---------------------------------------------------------------------------

/** A complete report should have at least this many modules. */
const MIN_MODULE_COUNT = 2

/**
 * A complete BOM should have at least this many part rows.
 * Single-module proofs-of-concept may have fewer, but a full pipeline output
 * should always have at least a handful of key parts.
 */
const MIN_PART_ROWS = 3

/**
 * Each BOM row should have a supplier match. The loop red-flag says
 * "less than 3 suppliers per BOM row" — we enforce a softer floor of at
 * least MIN_SUPPLIERS_TOTAL total suppliers in the export.
 */
const MIN_SUPPLIERS_TOTAL = 1

/**
 * A full report typically produces 20+ pages. A page count much lower than
 * this usually means large sections (BOM, suppliers, regulatory) were empty.
 * We estimate page count from content volume rather than rendering.
 */
const MIN_ESTIMATED_PAGES = 6

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PdfValidationResult {
    /** True if no blocking issues were found. Issues are always warnings — the
     *  render is not prevented, but the caller should log them prominently. */
    valid: boolean
    /** Human-readable descriptions of every issue found. Empty when valid=true. */
    issues: string[]
}

/**
 * Validates the data structure that feeds the PDF export before rendering.
 *
 * All checks are non-blocking — the function never throws. Issues are
 * returned as strings so callers can decide how loudly to surface them.
 *
 * @param input - The fully-assembled PdfInput (or a compatible subset).
 * @returns `{ valid, issues }` — valid=true means no issues were found.
 */
export function validatePdfLayout(input: PdfValidatorInput): PdfValidationResult {
    const issues: string[] = []

    // -----------------------------------------------------------------------
    // 1. Brief completeness — blank brief fields produce a sparse cover page
    //    and an empty Brief section. Each null is a warning, not an error,
    //    because stub projects legitimately leave fields blank.
    // -----------------------------------------------------------------------
    if (!input.brief.subject) {
        issues.push("Brief subject is blank — the cover page title will be empty.")
    }
    if (!input.brief.mission) {
        issues.push("Brief mission is blank — the Brief section will show a placeholder.")
    }
    if (!input.brief.useCase) {
        issues.push("Brief use-case is blank — the Brief section will show a placeholder.")
    }

    // -----------------------------------------------------------------------
    // 2. Module count — a full report needs at least MIN_MODULE_COUNT modules.
    //    Zero modules means the entire modules body of the PDF will be blank.
    // -----------------------------------------------------------------------
    const actualModuleCount = input.modules.length
    if (actualModuleCount < MIN_MODULE_COUNT) {
        issues.push(
            `Module count is ${actualModuleCount} — expected at least ${MIN_MODULE_COUNT}. ` +
                `The modules section of the PDF will be sparse or empty.`,
        )
    }

    // -----------------------------------------------------------------------
    // 3. Module content quality — catch hollow modules that have a name but
    //    no parts, no reviews, and no description.
    // -----------------------------------------------------------------------
    for (const mod of input.modules) {
        const isHollow =
            (!mod.description || mod.description.trim().length === 0) &&
            mod.keyParts.length === 0 &&
            mod.reviews.length === 0
        if (isHollow) {
            issues.push(
                `Module "${mod.name}" (id=${mod.id}) is hollow — no description, no key parts, no reviews. ` +
                    `Its module page will render mostly empty.`,
            )
        }
        if (mod.reviews.length === 0) {
            issues.push(
                `Module "${mod.name}" has 0 engineering reviews — Fang did not fire or returned nothing. ` +
                    `The engineering review section for this module will be blank.`,
            )
        }
    }

    // -----------------------------------------------------------------------
    // 4. BOM / parts count — a very small BOM usually means the decomposition
    //    didn't complete or the BOM builder dropped rows.
    // -----------------------------------------------------------------------
    const actualPartRows = input.parts.length
    if (actualPartRows < MIN_PART_ROWS) {
        issues.push(
            `BOM has only ${actualPartRows} part rows — expected at least ${MIN_PART_ROWS}. ` +
                `The BOM master table will be sparse.`,
        )
    }

    // -----------------------------------------------------------------------
    // 5. BOM cost coverage — parts with null cost are rendered as "—".
    //    If EVERY part has null cost the cost waterfall will be all dashes,
    //    which is a strong signal the Finn / cost-builder stage didn't run.
    // -----------------------------------------------------------------------
    if (actualPartRows > 0) {
        const nullCostParts = input.parts.filter(
            (p) => p.estimatedUnitCostGbp === null,
        )
        if (nullCostParts.length === actualPartRows) {
            issues.push(
                `All ${actualPartRows} BOM parts have null unit cost — the cost waterfall will show only "—". ` +
                    `This suggests the cost-builder stage did not run.`,
            )
        } else if (nullCostParts.length > Math.ceil(actualPartRows * 0.5)) {
            issues.push(
                `${nullCostParts.length} of ${actualPartRows} BOM parts have null unit cost (>${50}%). ` +
                    `The cost waterfall will have many "—" values.`,
            )
        }
    }

    // -----------------------------------------------------------------------
    // 6. BOM ↔ module linkage — parts without a sourceModuleName can't appear
    //    in the per-module cost breakdown. If a significant fraction is
    //    unlinked the per-module breakdown will be wrong.
    // -----------------------------------------------------------------------
    if (actualPartRows > 0) {
        const unlinkedParts = input.parts.filter((p) => !p.sourceModuleName)
        if (unlinkedParts.length > 0) {
            issues.push(
                `${unlinkedParts.length} of ${actualPartRows} BOM parts have no source module — ` +
                    `they will not appear in the per-module cost breakdown. ` +
                    `Unlinked part numbers: ${unlinkedParts
                        .slice(0, 5)
                        .map((p) => p.partNumber)
                        .join(", ")}${unlinkedParts.length > 5 ? "…" : ""}.`,
            )
        }
    }

    // -----------------------------------------------------------------------
    // 7. BOM ↔ totals consistency — totals are pre-computed at build time.
    //    A mismatch means the totals block is stale or was computed from a
    //    different data source than the parts array.
    // -----------------------------------------------------------------------
    if (input.totals.partRowCount !== actualPartRows) {
        issues.push(
            `Totals mismatch: totals.partRowCount=${input.totals.partRowCount} but ` +
                `parts.length=${actualPartRows}. The cover-page stat tile will show the wrong number.`,
        )
    }
    if (input.totals.moduleCount !== actualModuleCount) {
        issues.push(
            `Totals mismatch: totals.moduleCount=${input.totals.moduleCount} but ` +
                `modules.length=${actualModuleCount}. The cover-page stat tile will show the wrong number.`,
        )
    }

    // -----------------------------------------------------------------------
    // 8. Supplier count — a report with no suppliers means the supplier-match
    //    stage did not run.
    // -----------------------------------------------------------------------
    if (input.suppliers.length < MIN_SUPPLIERS_TOTAL) {
        issues.push(
            `Supplier count is ${input.suppliers.length} — the supplier shortlist section will be empty. ` +
                `This suggests the supplier-match stage did not run.`,
        )
    }

    // -----------------------------------------------------------------------
    // 9. Supplier ↔ module linkage — suppliers with no moduleNames will render
    //    with empty "relevant to" columns.
    // -----------------------------------------------------------------------
    const unlinkeddSuppliers = input.suppliers.filter(
        (s) => !Array.isArray(s.moduleNames) || s.moduleNames.length === 0,
    )
    if (unlinkeddSuppliers.length > 0) {
        issues.push(
            `${unlinkeddSuppliers.length} supplier(s) have no linked modules: ` +
                `${unlinkeddSuppliers
                    .slice(0, 3)
                    .map((s) => `"${s.name}"`)
                    .join(", ")}${unlinkeddSuppliers.length > 3 ? "…" : ""}. ` +
                `The "relevant to modules" column will be blank for those rows.`,
        )
    }

    // -----------------------------------------------------------------------
    // 10. Cost ↔ BOM cross-check — if unitTotalGbp is populated but
    //     perModule is empty (or vice-versa) the cost waterfall will be
    //     internally inconsistent.
    // -----------------------------------------------------------------------
    const hasUnitTotal = typeof input.cost.unitTotalGbp === "number"
    const hasPerModule =
        Array.isArray(input.cost.perModule) && input.cost.perModule.length > 0
    if (hasUnitTotal && !hasPerModule) {
        issues.push(
            `cost.unitTotalGbp is set (£${input.cost.unitTotalGbp}) but cost.perModule is empty — ` +
                `the per-module cost breakdown table will be blank.`,
        )
    }
    if (!hasUnitTotal && hasPerModule) {
        issues.push(
            `cost.perModule has ${input.cost.perModule.length} rows but cost.unitTotalGbp is null — ` +
                `the cost waterfall total will show "—".`,
        )
    }

    // -----------------------------------------------------------------------
    // 11. Regulatory section — an entirely empty regulatory array with
    //     modules present is suspicious (the engine should have extracted
    //     at least some standards if the brief has any compliance notes).
    // -----------------------------------------------------------------------
    if (input.regulatory.length === 0 && actualModuleCount >= MIN_MODULE_COUNT) {
        issues.push(
            `Regulatory array is empty with ${actualModuleCount} modules present — ` +
                `the regulatory compliance matrix will render blank.`,
        )
    }

    // -----------------------------------------------------------------------
    // 12. Estimated page count heuristic — each section contributes a known
    //     minimum number of pages. If the estimate is below the threshold
    //     something major is probably missing.
    //
    //     Heuristic:
    //       1 cover
    //     + 1 brief
    //     + ceil(regulatory / 20) regulatory pages
    //     + modules.length module pages  (1 page each minimum)
    //     + ceil(parts / 15) BOM pages
    //     + ceil(suppliers / 5) supplier pages
    //     + 1 audit log
    // -----------------------------------------------------------------------
    const estimatedPages =
        1 + // cover
        1 + // brief
        Math.max(1, Math.ceil(input.regulatory.length / 20)) + // regulatory
        Math.max(0, actualModuleCount) + // module pages
        Math.max(1, Math.ceil(actualPartRows / 15)) + // BOM
        Math.max(1, Math.ceil(input.suppliers.length / 5)) + // suppliers
        1 // audit log

    if (estimatedPages < MIN_ESTIMATED_PAGES) {
        issues.push(
            `Estimated page count is ~${estimatedPages} — expected at least ${MIN_ESTIMATED_PAGES}. ` +
                `Possible cause: modules (${actualModuleCount}), parts (${actualPartRows}), or suppliers (${input.suppliers.length}) are very sparse.`,
        )
    }

    // -----------------------------------------------------------------------
    // 13. Project name sanity — a blank project name produces an unreadable
    //     filename and cover page.
    // -----------------------------------------------------------------------
    if (!input.projectName || input.projectName.trim().length === 0) {
        issues.push(
            "projectName is blank — the cover page title and the downloaded filename will be empty.",
        )
    }

    return {
        valid: issues.length === 0,
        issues,
    }
}
