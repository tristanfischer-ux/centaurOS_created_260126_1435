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
