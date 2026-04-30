/**
 * @file bom-reconciliation.ts — BOM quantity/chemistry reconciliation gate.
 *
 * Loop 24 Fix 5. Three concerns:
 *
 *   1. Deterministic count gate: after BOM generation, for each module,
 *      count part-class references declared in the module description vs
 *      the number of BOM rows sourced from that module. Mismatch >10%
 *      returns a failed result that the merge stage logs and flags in
 *      project state so the PDF emitter can surface a RED banner.
 *
 *   2. Chemistry/material reconciliation: per-module LLM check that confirms
 *      each BOM row's material/chemistry matches what the module page says.
 *      Returns pass/fail per module with a structured reason for fails.
 *      NOTE: this module is side-effect-free (pure function + typed return)
 *      so callers (merge stage, future PDF gate) decide what to do with fails.
 *
 *   3. Cost-provenance classification: adds a `cost_provenance` field to
 *      every StructuredPart-like object based on heuristic signals in the
 *      cost value and description. Callers persist this alongside the row;
 *      the PDF cost-waterfall renderer reads it to show orange warning badges
 *      on parametric / placeholder rows.
 *
 * All functions in this file are pure (no I/O, no LLM calls). The LLM
 * reconciliation pass (Part 2) is handled by `runBomChemistryCheck` which
 * lives in `src/actions/bom-reconciliation-gate.ts` (server action) to keep
 * the LLM call and OpenRouter import out of this pure lib.
 *
 * @related
 *   - Caller: src/actions/bom.ts -> runBomMergeStage
 *   - LLM gate: src/actions/bom-reconciliation-gate.ts
 *   - Numerical gate: src/lib/cad-lab-numerical-reconciliation.ts
 *   - Part-type: src/lib/cad-lab-types.ts -> StructuredPart
 */

// ---- Types -------------------------------------------------------

/** How a cost value was sourced. Drives the PDF cost-waterfall badge. */
export type CostProvenance =
    | "quoted"       // supplier/catalogue quote — green, no badge
    | "parametric"   // range estimate (+-30%, +-N%) — orange badge
    | "placeholder"  // GBP0 or "TBD" — red badge
    | "todo"         // literally zero cost with no explanation — red badge

export interface PartWithProvenance {
    partNumber: string
    name: string
    estimatedUnitCostGbp?: number | null
    costJustification?: string | null
    /** Derived by classifyCostProvenance — not originally on StructuredPart. */
    cost_provenance: CostProvenance
}

/** A single count-check finding for one part-class in one module. */
export interface CountMismatch {
    moduleId: string
    moduleName: string
    partClass: string
    /** Count extracted from the module description text. */
    moduleCount: number
    /** Count of BOM rows (grouped by loose part-class keyword match). */
    bomCount: number
    pctDiff: number
}

export interface BomCountCheckResult {
    /** True if ALL modules are within the 10% threshold. */
    passed: boolean
    /** Only populated if passed === false. */
    mismatches: CountMismatch[]
    /** Structured log line ready for console.log. */
    logLine: string
}

/** Per-module verdict from the LLM chemistry pass. */
export interface ChemistryCheckVerdictModule {
    moduleId: string
    moduleName: string
    passed: boolean
    /** Populated only when passed === false. One entry per failing part. */
    issues: Array<{
        partNumber: string
        field: "chemistry" | "material" | "form_factor" | "quantity"
        moduleStatement: string
        bomValue: string
        explanation: string
    }>
}

export interface BomChemistryCheckResult {
    /** True when every module passed. */
    allPassed: boolean
    modules: ChemistryCheckVerdictModule[]
}

// ---- Part-class keyword extraction ---------------------------------

/**
 * Extract (count, class) pairs from a module description or keyParts list.
 *
 * Matches patterns like:
 *   "5 pressure vessels"
 *   "30 RO elements"
 *   "1 PCS skid"
 *   "twelve membrane modules"
 *   "two redundant pumps"
 *
 * Returns a map of normalised class name -> integer count.
 */
export function extractModulePartCounts(
    description: string,
    keyParts: string[],
): Map<string, number> {
    const combined = [description, ...keyParts].join("\n")
    const result = new Map<string, number>()

    const WORD_NUMBERS: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
        nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
        thirty: 30, forty: 40, fifty: 50, sixty: 60, eighty: 80, hundred: 100,
    }

    // Match: [digit+] [whitespace] [1-3 word class]
    const digitRe =
        /\b(\d+)\s+([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2})\b/gi
    // Match: [word-number] [whitespace] [1-3 word class]
    const wordRe =
        /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|eighty|hundred)\s+([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2})\b/gi

    const addCandidate = (count: number, rawClass: string) => {
        const SKIP = new Set([
            "of", "the", "a", "an", "and", "or", "in", "on", "to", "for",
            "with", "per", "at", "from", "that", "this", "each", "by",
            "are", "is", "be", "have", "has",
            "minutes", "hours", "days", "weeks", "months", "years",
            "percent", "metres", "meters", "litres", "liters", "kilowatt",
            "megawatt", "watt", "volt", "amp", "bar", "psi", "mpa", "kpa",
            "kilogram", "gram", "tonne", "mm", "cm", "km",
        ])
        const wordArray = rawClass.toLowerCase().split(/\s+/)

        // Skip if the first word is a stop-word (noise like "of the")
        if (SKIP.has(wordArray[0])) return

        // Strip trailing stop-words so "pressure vessels each" -> "pressure vessels"
        // and "battery cells in" -> "battery cells"
        while (wordArray.length > 1 && SKIP.has(wordArray[wordArray.length - 1])) {
            wordArray.pop()
        }

        // Normalise: singularise trailing -s on the last word (naive)
        const lastWord = wordArray[wordArray.length - 1]
        if (lastWord.endsWith("s") && lastWord.length > 3) {
            wordArray[wordArray.length - 1] = lastWord.slice(0, -1)
        }
        const key = wordArray.join(" ")

        // Keep the largest count seen for a given class
        const existing = result.get(key) ?? 0
        if (count > existing) result.set(key, count)
    }

    let m: RegExpExecArray | null

    digitRe.lastIndex = 0
    while ((m = digitRe.exec(combined)) !== null) {
        const count = parseInt(m[1], 10)
        if (count > 0 && count < 10_000) addCandidate(count, m[2])
    }

    wordRe.lastIndex = 0
    while ((m = wordRe.exec(combined)) !== null) {
        const count = WORD_NUMBERS[m[1].toLowerCase()] ?? 0
        if (count > 0) addCandidate(count, m[2])
    }

    return result
}

/**
 * Count how many BOM parts (sourced from a given module) match a loose
 * keyword from the module's declared part-class map.
 *
 * Matching strategy: any BOM part whose name contains the class keyword
 * (case-insensitive, partial match) contributes to the BOM count with
 * its quantity.
 */
export function countBomPartsForClass(
    bomParts: Array<{ name: string; quantity?: number }>,
    partClassKeyword: string,
): number {
    const kw = partClassKeyword.toLowerCase()
    let count = 0
    for (const p of bomParts) {
        const pName = p.name.toLowerCase()
        if (pName.includes(kw)) {
            count += p.quantity ?? 1
        }
    }
    return count
}

// ---- Count-check gate ----------------------------------------------

/**
 * For each module, compare the part-class counts declared in the module
 * description against the BOM rows sourced from that module.
 *
 * Returns a structured result. The caller (merge stage) decides whether to
 * block emission or just log.
 *
 * @param modules   Array of { id, name, description, keyParts }
 * @param bomParts  Array of { partNumber, name, sourceModuleId, quantity }
 * @param threshold Fractional mismatch threshold (default 0.10 = 10%).
 */
export function runBomCountCheck(
    modules: Array<{
        id: string
        name: string
        description?: string | null
        keyParts?: string[] | null
    }>,
    bomParts: Array<{
        partNumber?: string | null
        name: string
        sourceModuleId?: string | null
        quantity?: number | null
    }>,
    threshold = 0.10,
): BomCountCheckResult {
    const mismatches: CountMismatch[] = []

    for (const mod of modules) {
        const desc = mod.description ?? ""
        const kp = mod.keyParts ?? []
        const declared = extractModulePartCounts(desc, kp)
        if (declared.size === 0) continue

        const partsForMod = bomParts.filter((p) => p.sourceModuleId === mod.id)
        if (partsForMod.length === 0) continue

        for (const [cls, moduleCount] of declared) {
            // Only check classes with count >= 2 to avoid single-item noise.
            // The Desalination bug (5 vessels vs 3) has moduleCount=5 -- caught.
            if (moduleCount <= 1) continue

            const bomCount = countBomPartsForClass(
                partsForMod.map((p) => ({ name: p.name, quantity: p.quantity ?? 1 })),
                cls,
            )
            if (bomCount === 0) continue // No BOM match on this keyword -- skip.

            const diff = Math.abs(moduleCount - bomCount) / Math.max(moduleCount, bomCount)
            if (diff > threshold) {
                mismatches.push({
                    moduleId: mod.id,
                    moduleName: mod.name,
                    partClass: cls,
                    moduleCount,
                    bomCount,
                    pctDiff: diff * 100,
                })
            }
        }
    }

    const passed = mismatches.length === 0
    const logLine = passed
        ? "[bom-reconcile] count-check: PASS -- all modules within 10% threshold"
        : mismatches
              .map(
                  (m) =>
                      `[bom-reconcile] mismatch: project=<project> module=${m.moduleName} class="${m.partClass}" module_count=${m.moduleCount} bom_count=${m.bomCount} diff=${m.pctDiff.toFixed(1)}%`,
              )
              .join("\n")

    return { passed, mismatches, logLine }
}

// ---- Cost-provenance classification --------------------------------

/**
 * Classify a BOM part's cost provenance from heuristic signals.
 *
 * Rules (in priority order):
 *   1. cost == null || cost == 0 -> "todo"
 *   2. costJustification contains "tbd" / "placeholder" / "todo" -> "todo"
 *   3. costJustification contains "+-" or "parametric" -> "parametric"
 *   4. costJustification matches percentage variance pattern -> "parametric"
 *   5. Otherwise -> "quoted"
 */
export function classifyCostProvenance(
    estimatedUnitCostGbp: number | null | undefined,
    costJustification: string | null | undefined,
): CostProvenance {
    const cost = estimatedUnitCostGbp
    const note = (costJustification ?? "").toLowerCase()

    if (cost == null || cost === 0) {
        if (note.includes("tbd") || note.includes("todo") || note.includes("placeholder")) {
            return "todo"
        }
        return "todo"
    }

    if (note.includes("tbd") || note.includes("todo") || note.includes("placeholder")) {
        return "todo"
    }

    if (
        note.includes("+-") ||
        note.includes("+/-") ||
        note.includes("parametric") ||
        /\b\d+\s*%\s*(?:contingency|range|variance|uncertainty)\b/.test(note) ||
        /[+-]{1,2}\s*\d+\s*%/.test(note)
    ) {
        return "parametric"
    }

    return "quoted"
}

/**
 * Enrich an array of BOM parts with `cost_provenance` derived heuristically.
 * Returns a new array -- does not mutate inputs.
 */
export function enrichPartsWithProvenance<
    T extends {
        partNumber?: string | null
        estimatedUnitCostGbp?: number | null
        costJustification?: string | null
    },
>(parts: T[]): Array<T & { cost_provenance: CostProvenance }> {
    return parts.map((p) => ({
        ...p,
        cost_provenance: classifyCostProvenance(
            p.estimatedUnitCostGbp,
            p.costJustification,
        ),
    }))
}

/**
 * Return a summary of parametric/placeholder rows for logging and banner copy.
 */
export function summariseProvenanceGaps(
    parts: Array<{ partNumber?: string | null; name: string; cost_provenance: CostProvenance }>,
): {
    todoCount: number
    parametricCount: number
    quotedCount: number
    bannerNeeded: boolean
    bannerCopy: string | null
} {
    let todoCount = 0
    let parametricCount = 0
    let quotedCount = 0

    for (const p of parts) {
        if (p.cost_provenance === "todo" || p.cost_provenance === "placeholder") {
            todoCount++
        } else if (p.cost_provenance === "parametric") {
            parametricCount++
        } else {
            quotedCount++
        }
    }

    const bannerNeeded = todoCount > 0 || parametricCount > 0
    const todoPart = todoCount > 0
        ? `${todoCount} row${todoCount === 1 ? "" : "s"} have no cost (marked Todo)`
        : ""
    const paramPart = parametricCount > 0
        ? `${parametricCount} row${parametricCount === 1 ? "" : "s"} are parametric range estimates (marked Parametric)`
        : ""
    const bannerCopy = bannerNeeded
        ? `Cost accuracy warning: ${[todoPart, paramPart].filter(Boolean).join("; ")}. Obtain real quotes before committing to procurement.`
        : null

    return { todoCount, parametricCount, quotedCount, bannerNeeded, bannerCopy }
}

// ---- Mass and cost outlier detection (Loop 26 A1/P4) ---------------

/**
 * Severity level for an outlier flag.
 *
 *   "warning" — flag is notable but does not indicate a definitive error.
 *   "error"   — flag indicates a physically or financially impossible value.
 */
export type OutlierSeverity = "warning" | "error"

/**
 * A single outlier flag produced by {@link detectBomOutliers}.
 * Stored alongside the bill of materials data so the PDF reconciliation
 * section can surface it without re-running the check.
 */
export interface BomOutlierFlag {
    /** Identifies the check that fired. */
    checkId:
        | "COMPONENT_EXCEEDS_TOTAL_MASS_BUDGET_100PCT"  // error: single component > total assembly mass
        | "COMPONENT_EXCEEDS_TOTAL_MASS_BUDGET_50PCT"   // warning: single component > 50% of total mass
        | "COMPONENT_EXCEEDS_MODULE_MASS_BUDGET"        // error: part exceeds its parent module's mass budget
        | "COMPONENT_EXCEEDS_COST_CEILING_30PCT"        // warning: single component > 30% of unit cost ceiling
        | "COMPONENT_DOMINATES_MODULE_COST"             // warning: single part costs more than all other parts in its module combined
        | "MODULE_BOM_MASS_DIVERGENCE"                  // warning: module-page estimated mass vs bill-of-materials mass total >20% off
        | "MODULE_BOM_COST_DIVERGENCE"                  // warning: module-page estimated cost vs bill-of-materials cost total >30% off
    severity: OutlierSeverity
    /** Human-readable explanation. No acronyms; user-facing. */
    message: string
    /** Part number of the offending component, when applicable. */
    partNumber?: string
    /** Module identifier of the offending module, when applicable. */
    moduleId?: string
    /** The numeric value that triggered the flag (for display). */
    observedValue?: number
    /** The threshold that was exceeded (for display). */
    thresholdValue?: number
}

/**
 * Aggregate result returned by {@link detectBomOutliers}.
 */
export interface BomOutlierResult {
    /** True when at least one error-severity flag was raised. */
    hasErrors: boolean
    /** True when at least one flag of any severity was raised. */
    hasAnyFlag: boolean
    /** All flags ordered by severity (errors first). */
    flags: BomOutlierFlag[]
    /** Single-line log summary ready for console.warn. */
    logLine: string
}

/**
 * Detect mass and cost outliers in a bill-of-materials assembly.
 *
 * This is a **pure function** — no I/O, no LLM calls. Call it after the
 * skeleton + expansion merge but before persisting parts, so flags reach
 * the PDF reconciliation section on the same regen that produced the data.
 *
 * Checks performed:
 *
 *   1. **Total mass budget — single component >50% (warning) or >100% (error).**
 *      FUS-001 Central Fuselage Pod at 700 kg on a 160 kg platform is the
 *      canonical example (Loop 26 HAPS demo). Any single component exceeding
 *      the programme's total assembly mass budget is physically impossible.
 *
 *   2. **Module-level mass budget — part exceeds parent module budget (error).**
 *      Each module declares an `estimatedMassKg` during Max decomposition.
 *      A part attributed to that module must not exceed the module's own
 *      budget — that would imply the module is heavier than the entire
 *      sub-system it belongs to.
 *
 *   3. **Cost ceiling — single component >30% of unit cost ceiling (warning).**
 *      A single COTS component eating 30%+ of the stated unit cost ceiling
 *      is unusual and warrants investigation. Loop 28 tightened from 80%.
 *
 *   4. **Module mass divergence — bill-of-materials sum vs module estimate >20%.**
 *      Fang sizes modules; the bill of materials generator independently
 *      estimates part masses. When these diverge by more than 20% for a given
 *      module, one of the two sources is wrong and the PDF would report
 *      contradictory mass figures.
 *
 *   5. **Single-part cost dominance — one part costs more than all others
 *      in its module combined (warning).** A single component dominating a
 *      module's cost suggests either a pricing error or a fundamental design
 *      issue. Loop 28 addition.
 *
 *   6. **Module cost divergence — bill-of-materials cost sum vs module
 *      estimate >30% off (warning).** Same principle as mass divergence but
 *      for cost. Catches the CE-004-PUR class of bug (PLC at £18,000 in BOM
 *      vs £900 on module page). Loop 28 addition.
 *
 * @param parts         Merged bill of materials parts from the expansion stage.
 * @param modules       Module list from Max's decomposition (for per-module budgets and mass/cost divergence).
 * @param totalMassBudgetKg  Programme-level assembly mass budget from the design brief (optional).
 * @param unitCostCeilingGbp Founder's stated unit cost ceiling from the design brief (optional).
 *
 * @returns A structured result with all flags raised, ready for logging and PDF annotation.
 */
export function detectBomOutliers(
    parts: Array<{
        partNumber: string
        name: string
        massKg?: number | null
        estimatedUnitCostGbp?: number | null
        sourceModuleId?: string | null
    }>,
    modules: Array<{
        id: string
        name: string
        estimatedMassKg?: number | null
        estimatedCostGbp?: number | null
    }>,
    totalMassBudgetKg?: number | null,
    unitCostCeilingGbp?: number | null,
): BomOutlierResult {
    const flags: BomOutlierFlag[] = []

    // ── Check 1 & 2: per-component mass vs total and module budgets ──

    // Build a module id → estimated mass lookup for check 2.
    const moduleEstimatedMass = new Map<string, number>()
    for (const m of modules) {
        if (typeof m.estimatedMassKg === "number" && m.estimatedMassKg > 0) {
            moduleEstimatedMass.set(m.id, m.estimatedMassKg)
        }
    }

    for (const part of parts) {
        const massKg = typeof part.massKg === "number" && Number.isFinite(part.massKg) && part.massKg > 0
            ? part.massKg
            : null
        if (massKg === null) continue

        // Check 1: single component vs total assembly mass budget.
        if (typeof totalMassBudgetKg === "number" && totalMassBudgetKg > 0) {
            if (massKg > totalMassBudgetKg) {
                flags.push({
                    checkId: "COMPONENT_EXCEEDS_TOTAL_MASS_BUDGET_100PCT",
                    severity: "error",
                    partNumber: part.partNumber,
                    observedValue: massKg,
                    thresholdValue: totalMassBudgetKg,
                    message:
                        `Mass error: component "${part.name}" (${part.partNumber}) has a mass of ` +
                        `${massKg.toFixed(2)} kg which exceeds the entire programme assembly mass ` +
                        `budget of ${totalMassBudgetKg.toFixed(2)} kg. ` +
                        `A single component cannot be heavier than the complete product. ` +
                        `The mass figure for this component is almost certainly a scale error ` +
                        `(for example, grams mistakenly entered as kilograms, or a sub-system ` +
                        `total used instead of a part-level value). Regenerate the bill of ` +
                        `materials and verify this component's mass against industry-standard ` +
                        `references for its material and form factor.`,
                })
            } else if (massKg > totalMassBudgetKg * 0.5) {
                flags.push({
                    checkId: "COMPONENT_EXCEEDS_TOTAL_MASS_BUDGET_50PCT",
                    severity: "warning",
                    partNumber: part.partNumber,
                    observedValue: massKg,
                    thresholdValue: totalMassBudgetKg * 0.5,
                    message:
                        `Mass warning: component "${part.name}" (${part.partNumber}) accounts for ` +
                        `${((massKg / totalMassBudgetKg) * 100).toFixed(1)}% of the programme ` +
                        `assembly mass budget (${massKg.toFixed(2)} kg of ${totalMassBudgetKg.toFixed(2)} kg). ` +
                        `A single component consuming more than 50% of the total mass budget ` +
                        `is unusual and may indicate a scale error. Verify this figure before ` +
                        `using it in a supplier or investor presentation.`,
                })
            }
        }

        // Check 2: single component vs its parent module's mass budget.
        const modId = part.sourceModuleId
        if (typeof modId === "string" && modId.length > 0) {
            const moduleBudget = moduleEstimatedMass.get(modId)
            if (typeof moduleBudget === "number" && moduleBudget > 0 && massKg > moduleBudget) {
                const modName = modules.find((m) => m.id === modId)?.name ?? modId
                flags.push({
                    checkId: "COMPONENT_EXCEEDS_MODULE_MASS_BUDGET",
                    severity: "error",
                    partNumber: part.partNumber,
                    moduleId: modId,
                    observedValue: massKg,
                    thresholdValue: moduleBudget,
                    message:
                        `Mass error: component "${part.name}" (${part.partNumber}) has a mass of ` +
                        `${massKg.toFixed(2)} kg which exceeds the entire estimated mass of its ` +
                        `parent module "${modName}" (${moduleBudget.toFixed(2)} kg). ` +
                        `A single part cannot be heavier than the sub-system it belongs to. ` +
                        `This is almost certainly a scale error — verify the component mass ` +
                        `against the module-level mass budget before proceeding.`,
                })
            }
        }
    }

    // ── Check 3: per-component cost vs unit cost ceiling (Loop 28: 80% → 30%) ──

    if (typeof unitCostCeilingGbp === "number" && unitCostCeilingGbp > 0) {
        const warnThreshold = unitCostCeilingGbp * 0.3
        for (const part of parts) {
            const cost = typeof part.estimatedUnitCostGbp === "number" && Number.isFinite(part.estimatedUnitCostGbp)
                ? part.estimatedUnitCostGbp
                : null
            if (cost === null || cost <= 0) continue

            if (cost > warnThreshold) {
                flags.push({
                    checkId: "COMPONENT_EXCEEDS_COST_CEILING_30PCT",
                    severity: "warning",
                    partNumber: part.partNumber,
                    observedValue: cost,
                    thresholdValue: warnThreshold,
                    message:
                        `Cost warning: component "${part.name}" (${part.partNumber}) costs ` +
                        `£${cost.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} — ` +
                        `${((cost / unitCostCeilingGbp) * 100).toFixed(1)}% of the stated unit cost ` +
                        `ceiling of £${unitCostCeilingGbp.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}. ` +
                        `A single component consuming 30% or more of the entire programme cost ` +
                        `ceiling is unusual and warrants investigation. Review whether this part ` +
                        `is correctly priced, or whether a lower-cost alternative exists.`,
                })
            }
        }
    }

    // ── Check 4: module-level mass divergence (bill-of-materials sum vs module estimate) ──

    // Build a module id → name lookup.
    const moduleNameMap = new Map<string, string>(modules.map((m) => [m.id, m.name]))

    // Sum bill-of-materials part masses per module.
    const bomMassByModule = new Map<string, number>()
    for (const part of parts) {
        const modId = part.sourceModuleId
        if (typeof modId !== "string" || modId.length === 0) continue
        const massKg = typeof part.massKg === "number" && Number.isFinite(part.massKg) ? part.massKg : 0
        bomMassByModule.set(modId, (bomMassByModule.get(modId) ?? 0) + massKg)
    }

    for (const [modId, moduleBudget] of moduleEstimatedMass) {
        const bomSum = bomMassByModule.get(modId)
        // Only check when the bill of materials has at least one mass-carrying part for this module.
        if (typeof bomSum !== "number" || bomSum === 0) continue

        const divergence = Math.abs(bomSum - moduleBudget) / Math.max(bomSum, moduleBudget)
        if (divergence > 0.20) {
            const modName = moduleNameMap.get(modId) ?? modId
            flags.push({
                checkId: "MODULE_BOM_MASS_DIVERGENCE",
                severity: "warning",
                moduleId: modId,
                observedValue: bomSum,
                thresholdValue: moduleBudget,
                message:
                    `Mass divergence: module "${modName}" has an estimated mass of ` +
                    `${moduleBudget.toFixed(2)} kg from the sizing stage, but the sum of ` +
                    `bill-of-materials part masses for this module totals ${bomSum.toFixed(2)} kg ` +
                    `(a ${(divergence * 100).toFixed(1)}% divergence). ` +
                    `The sizing specialist and the bill-of-materials generator have produced ` +
                    `inconsistent figures. Whichever is wrong will cause the programme mass ` +
                    `budget to appear misleading. Verify part-level masses against the ` +
                    `module-level mass estimate.`,
            })
        }
    }

    // ── Check 5 (Loop 28): single-part cost dominance per module ──

    // Group parts by module, sum costs, find the dominant part.
    const moduleCostMap = new Map<string, { total: number; parts: Array<{ partNumber: string; name: string; cost: number }> }>()
    for (const part of parts) {
        const modId = part.sourceModuleId
        if (typeof modId !== "string" || modId.length === 0) continue
        const cost = typeof part.estimatedUnitCostGbp === "number" && Number.isFinite(part.estimatedUnitCostGbp) ? part.estimatedUnitCostGbp : 0
        if (cost <= 0) continue
        if (!moduleCostMap.has(modId)) {
            moduleCostMap.set(modId, { total: 0, parts: [] })
        }
        const entry = moduleCostMap.get(modId)!
        entry.total += cost
        entry.parts.push({ partNumber: part.partNumber, name: part.name, cost })
    }

    for (const [modId, entry] of moduleCostMap) {
        if (entry.parts.length < 2) continue
        for (const p of entry.parts) {
            const othersCost = entry.total - p.cost
            if (p.cost > othersCost && othersCost > 0) {
                const modName = moduleNameMap.get(modId) ?? modId
                const dominanceRatio = p.cost / entry.total
                flags.push({
                    checkId: "COMPONENT_DOMINATES_MODULE_COST",
                    severity: "warning",
                    partNumber: p.partNumber,
                    moduleId: modId,
                    observedValue: p.cost,
                    thresholdValue: othersCost,
                    message:
                        `Cost dominance: component "${p.name}" (${p.partNumber}) costs ` +
                        `£${p.cost.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} — ` +
                        `${(dominanceRatio * 100).toFixed(1)}% of module "${modName}" total ` +
                        `(£${entry.total.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}). ` +
                        `This single part costs more than all other parts in the module combined ` +
                        `(£${othersCost.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}). ` +
                        `Verify the pricing is correct — a dominant component may indicate a ` +
                        `scale error or an opportunity to substitute a lower-cost alternative.`,
                })
            }
        }
    }

    // ── Check 6 (Loop 28): module-level cost divergence (BOM sum vs module estimate) ──

    const moduleEstimatedCost = new Map<string, number>()
    for (const m of modules) {
        if (typeof m.estimatedCostGbp === "number" && m.estimatedCostGbp > 0) {
            moduleEstimatedCost.set(m.id, m.estimatedCostGbp)
        }
    }

    for (const [modId, moduleEstimate] of moduleEstimatedCost) {
        const bomEntry = moduleCostMap.get(modId)
        if (!bomEntry || bomEntry.total === 0) continue

        const divergence = Math.abs(bomEntry.total - moduleEstimate) / Math.max(bomEntry.total, moduleEstimate)
        if (divergence > 0.30) {
            const modName = moduleNameMap.get(modId) ?? modId
            flags.push({
                checkId: "MODULE_BOM_COST_DIVERGENCE",
                severity: "warning",
                moduleId: modId,
                observedValue: bomEntry.total,
                thresholdValue: moduleEstimate,
                message:
                    `Cost divergence: module "${modName}" has an estimated cost of ` +
                    `£${moduleEstimate.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ` +
                    `from the costing stage, but the sum of bill-of-materials part costs for ` +
                    `this module totals £${bomEntry.total.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ` +
                    `(a ${(divergence * 100).toFixed(1)}% divergence). ` +
                    `The costing specialist and the bill-of-materials generator have produced ` +
                    `inconsistent figures. Verify part-level costs against the module-level ` +
                    `cost estimate — a single overpriced component may be the root cause.`,
            })
        }
    }

    // ── Sort: errors before warnings ──
    flags.sort((a, b) => {
        if (a.severity === b.severity) return 0
        return a.severity === "error" ? -1 : 1
    })

    const hasErrors = flags.some((f) => f.severity === "error")
    const hasAnyFlag = flags.length > 0

    const logLine = hasAnyFlag
        ? flags
              .map((f) => `[bom-outlier] ${f.severity.toUpperCase()} check=${f.checkId} part=${f.partNumber ?? "-"} module=${f.moduleId ?? "-"} observed=${f.observedValue?.toFixed(2) ?? "-"} threshold=${f.thresholdValue?.toFixed(2) ?? "-"}`)
              .join("\n")
        : "[bom-outlier] PASS — no mass or cost outliers detected"

    return { hasErrors, hasAnyFlag, flags, logLine }
}

// ---- Chemistry/spec reconciliation prompt builder ------------------

/**
 * Build the prompt for the LLM chemistry-check pass. Kept here (not in the
 * server action) so the test suite can verify the prompt shape without
 * importing server-only modules.
 */
export function buildChemistryCheckPrompt(
    moduleName: string,
    moduleDescription: string,
    moduleKeyParts: string[],
    bomRows: Array<{ partNumber: string; name: string; material?: string | null; description?: string | null }>,
): string {
    const partsBlock = bomRows
        .map(
            (r) => [
                `  - ${r.partNumber}: "${r.name}"`,
                r.material ? `, material: "${r.material}"` : "",
                r.description ? `, desc: "${r.description.slice(0, 200)}"` : "",
            ].join(""),
        )
        .join("\n")

    return `You are a meticulous bill-of-materials reconciliation checker.

MODULE: "${moduleName}"

MODULE DESCRIPTION (what the module page says it needs):
${moduleDescription.slice(0, 1500)}

MODULE KEY PARTS (declared on the module page):
${moduleKeyParts.map((kp) => `  - ${kp}`).join("\n")}

BILL-OF-MATERIALS ROWS SOURCED FROM THIS MODULE:
${partsBlock || "  (none)"}

For each BOM row, answer THREE checks:
  (a) chemistry/material -- does the BOM row's material match what the module description implies?
  (b) form factor -- does the part name/description match the physical form called for?
  (c) quantity -- does the BOM quantity align with what the module description states?

Return ONLY valid JSON in this exact shape (no markdown fences, no prose):
{
  "moduleId": "${moduleName}",
  "passed": true,
  "issues": []
}

If there are issues, set "passed" to false and populate "issues":
{
  "moduleId": "${moduleName}",
  "passed": false,
  "issues": [
    {
      "partNumber": "<part number>",
      "field": "chemistry",
      "moduleStatement": "<what the module page says>",
      "bomValue": "<what the BOM row says>",
      "explanation": "<one sentence why this is a mismatch>"
    }
  ]
}

field must be one of: "chemistry", "material", "form_factor", "quantity"
"passed" must be true if and only if "issues" is empty.
Only report genuine mismatches -- not minor wording differences.`
}
