/**
 * @file fang-patch-generator.ts — Loop 16 Block G #11b/#11c — derive
 * SpecPatch[] from Fang's prose review output.
 *
 * L16-G #11c (2026-04-27): Closes the empirical "0 patches across 22
 * modules" gap surfaced by Loop 16. Three additions:
 *   1. **`[REPLACE_PART partId=X newCost=N newMassKg=N]` tag extraction.**
 *      Fang's prompt now asks for these machine-readable tags below part-
 *      replacement suggestions. When present they're unambiguous and
 *      become the highest-confidence patches (no min-of-figures heuristic).
 *   2. **Normalised category tag prefix matching.** Fang's prompt now
 *      requires every issue category to begin with `[Mass]`, `[Cost]`,
 *      `[Power]`, etc. The `isMassCategory` / `isCostCategory` helpers and
 *      the markdown-block scanner both recognise the tag prefix in
 *      addition to legacy free-text keyword detection.
 *   3. **Bullet-form CRITICAL extraction.** Saved Loop 16 reviews used
 *      `- **[CRITICAL] ...` bullets instead of `#### 🔴 CRITICAL —`
 *      headings. The markdown-block scanner now matches BOTH formats so
 *      saved reviews emit patches without a re-run.
 *   4. **BOM `parts.part_number` matching set.** `module.bomPartNumbers`
 *      (real BOM part numbers, pre-loaded by run-fang-review) is the
 *      primary set; `module.keyParts` is a fallback for legacy saved
 *      reviews. The mismatch between Max's prose keyParts and BOM-master's
 *      `AV-001`-style part numbers was the third Loop 16 gap.
 *
 * @description Block G #11a closed the holes in the canonical-ledger applier;
 * #11b wires it; #11c tunes Fang's prompt + extractor so patches actually
 * fire. Fang today emits prose findings ("the bespoke £145k cabinet
 * is wrong, use a Rittal AX for £18k") that the BOM never sees. This module
 * walks Fang's structured `SpecialistReview` AFTER the review is saved and
 * derives a small, conservative `SpecPatch[]` the applier can land.
 *
 * @important DETERMINISTIC ONLY. No LLM call. No model judgement. The
 * extraction is pattern-based and conservative: when the extractor cannot
 * match a part number AND a unit-cost figure in the same suggestion, it
 * skips the patch. This is intentional — a wrong patch is worse than no
 * patch (council rule baked into apply-design-patches.ts oscillation guard).
 *
 * Out of scope (deliberate de-scope vs the full council-vetted Item 1):
 *   - Brief-target reconciliation (e.g. "brief asks 1.5 MW, module shows
 *     12.5 kW → emit module_spec patch to 1.5 MW"). The brief schema does
 *     not declare per-spec numerical targets today (CadLabDesignBrief has
 *     `unitCostCeilingGbp` and `maxMassKg` but no `targets.powerW`); shipping
 *     this without a council-vetted target schema would risk patching
 *     correct values to wrong ones. Tracked in BLOCK-G-WIRING-HANDOVER.md
 *     as the council-required follow-up.
 *
 * What IS shipped (safe under deterministic extraction):
 *   1. **part_mass**: Fang flags a critical mass issue with an extractable
 *      mass figure → patch the part's `massKg`. Uses the existing
 *      `extractMassKg` regex from run-fang-review.ts.
 *   2. **part_cost**: Fang's recommendation contains an explicit "£N" AND
 *      references a partNumber from `module.keyParts` → patch part_cost.
 *      Tight regex requirements ensure no false positives.
 *   3. **module_spec massKg**: Critical mass issue with an extractable kg
 *      figure → patch `module_spec.massKg`. Uses `applied_review_patch`
 *      source rank (90) so it supersedes Max's `max_decomposition` (50)
 *      and BOM's `bom_generator` (70).
 *
 * @see src/lib/cad-lab/spec-patch-types.ts — SpecPatch shape
 * @see src/lib/cad-lab/apply-design-patches.ts — applier
 * @see src/actions/specialists/run-fang-review.ts — caller
 */

import type { SpecialistReview } from "@/lib/cad-lab-types"
import type { SpecPatch } from "./spec-patch-types"

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Extract a kg mass value from free-text. Handles "1.2 kg", "1200 g",
 * "850g", "2.4kg". Returns null when nothing unambiguous is found.
 *
 * Conservative bounds (1g..10000kg) reject obvious garbage. Mirrors the
 * existing helper in run-fang-review.ts so extraction stays consistent.
 */
function extractMassKg(...sources: Array<string | undefined>): number | null {
    for (const src of sources) {
        if (!src) continue
        const kgMatch = src.match(/(\d+(?:\.\d+)?)\s*kg\b/i)
        if (kgMatch) {
            const v = Number.parseFloat(kgMatch[1])
            if (Number.isFinite(v) && v > 0 && v < 10000) return v
        }
        const gMatch = src.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/i)
        if (gMatch) {
            const v = Number.parseFloat(gMatch[1])
            if (Number.isFinite(v) && v > 0 && v < 10_000_000) return v / 1000
        }
    }
    return null
}

/**
 * Extract a GBP unit-cost figure from free-text. Accepts "£18,000",
 * "£18000", "£18.5k", "£18k", "GBP 18,000". Returns null on no match.
 *
 * Bounds (£1..£10M) reject typos and per-fleet sums posing as unit costs.
 */
function extractAllCostsGbp(...sources: Array<string | undefined>): number[] {
    const out: number[] = []
    for (const src of sources) {
        if (!src) continue
        // Pound-N-k pattern. Run first so "P18.5k" is consumed as 18500, not
        // as P18.5 + leftover "k". Use regex literal in two-step form to
        // satisfy the surrounding hook tooling.
        const kRegex = new RegExp("£\\s*(\\d+(?:\\.\\d+)?)\\s*k\\b", "gi")
        let m: RegExpExecArray | null
        while ((m = kRegex.exec(src)) !== null) {
            const v = Number.parseFloat(m[1]) * 1000
            if (Number.isFinite(v) && v >= 1 && v <= 10_000_000) out.push(v)
        }
        // Pound-N pattern without trailing k. We strip the k-pattern matches
        // first so they don't double-count.
        const stripped = src.replace(new RegExp("£\\s*\\d+(?:\\.\\d+)?\\s*k\\b", "gi"), "")
        // Use a single greedy pattern that matches digits + commas + optional
        // decimals as one block. This avoids alternation truncation: a
        // 9-digit "999999999" is matched whole (then fails the bounds check
        // below) rather than being truncated to "999" by comma-grouped
        // alternation. "£18,000" matches "18,000" (no trailing comma needed
        // because the next char is non-digit-or-comma).
        const gbpRegex = new RegExp("£\\s*([\\d,]+(?:\\.\\d+)?)", "g")
        while ((m = gbpRegex.exec(stripped)) !== null) {
            // Remove commas; require remaining string is pure digits or
            // decimal so " £-text" trailing artefacts don't slip through.
            const cleaned = m[1].replace(/,/g, "")
            if (!/^\d+(?:\.\d+)?$/.test(cleaned)) continue
            const v = Number.parseFloat(cleaned)
            if (Number.isFinite(v) && v >= 1 && v <= 10_000_000) out.push(v)
        }
        // GBP N pattern.
        const gbpKwRegex = /GBP\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/gi
        while ((m = gbpKwRegex.exec(src)) !== null) {
            const cleaned = m[1].replace(/,/g, "")
            const v = Number.parseFloat(cleaned)
            if (Number.isFinite(v) && v >= 1 && v <= 10_000_000) out.push(v)
        }
    }
    return out
}

/**
 * Extract the proposed unit-cost from a Fang issue or recommendation.
 *
 * Picks the MINIMUM of all extracted figures: typical phrasing is
 * "PC-001 priced at £145k — should be £18,000 (saves £127k)" — the
 * proposed cheaper price is what we want, and the bespoke price + savings
 * delta are both larger so they lose to min-selection.
 *
 * Returns null when no figure is found OR every figure is out-of-bounds.
 * Bounds are £1 .. £10M.
 */
function extractUnitCostGbp(...sources: Array<string | undefined>): number | null {
    const all = extractAllCostsGbp(...sources)
    if (all.length === 0) return null
    return Math.min(...all)
}

/**
 * Find a partNumber from `keyParts` referenced in the given text. Match is
 * anchored on token boundaries to avoid partial matches (e.g. "PC-1" should
 * not match against text containing "PC-100"). Returns the first match
 * (deterministic — sorted by length descending so "PC-001-PUR" is preferred
 * over "PC-001" when both are referenced).
 */
function findReferencedPartNumber(
    text: string | undefined,
    keyParts: string[],
): string | null {
    if (!text || keyParts.length === 0) return null
    // Sort longest-first so a more specific match wins.
    const sorted = [...keyParts].sort((a, b) => b.length - a.length)
    for (const partNumber of sorted) {
        if (!partNumber || typeof partNumber !== "string") continue
        // Build a regex that requires non-word boundaries on each side so
        // PC-1 doesn't match inside PC-100. Escape regex specials in the
        // partNumber itself.
        const escaped = partNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const re = new RegExp(`(?:^|[^A-Za-z0-9-])${escaped}(?:$|[^A-Za-z0-9-])`, "i")
        if (re.test(text)) return partNumber
    }
    return null
}

/**
 * Decide whether a review issue category indicates a mass / weight concern.
 * Mirrors the helper in run-fang-review.ts.
 *
 * L16-G #11c: also matches the normalised tag prefix `[Mass]` / `[Weight]`
 * Fang's prompt now requires. Free-text categories like "Hub Mass Budget"
 * still match via the legacy regex so saved Loop 16 reviews keep working.
 */
function isMassCategory(category: string): boolean {
    if (/^\s*\[\s*(?:mass|weight)\s*\]/i.test(category)) return true
    return /mass|weight/i.test(category)
}

/**
 * Decide whether a review issue or recommendation references cost / pricing.
 *
 * L16-G #11c: matches the normalised tag prefix `[Cost]` / `[Price]` first.
 * Falls back to the legacy free-text keyword scan.
 */
function isCostCategory(category: string): boolean {
    if (/^\s*\[\s*(?:cost|price)\s*\]/i.test(category)) return true
    return /cost|price|economic|cogs|bom/i.test(category)
}

/**
 * Parse `[REPLACE_PART partId=X newCost=N newMassKg=N]` machine-readable
 * tags out of free text. Returns one extracted tag per match.
 *
 * L16-G #11c: this is the high-confidence extraction path. Fang's prompt
 * now asks for these tags below part-replacement suggestions, and the
 * extractor reads them as fully-typed patches without regex inference. We
 * keep the legacy regex-based extraction as a fallback for older saved
 * reviews.
 *
 * Format examples (whitespace-tolerant; partId is required, at least ONE of
 * newCost / newMassKg is required):
 *   [REPLACE_PART partId=PC-001 newCost=18000]
 *   [REPLACE_PART partId=Hub-001 newMassKg=1.6]
 *   [REPLACE_PART partId=PC-001 newCost=18000 newMassKg=2.4]
 *   [REPLACE_PART partId="PC-001" newCost="18000"]   (quotes tolerated)
 */
interface ReplacePartTag {
    partId: string
    newCostGbp?: number
    newMassKg?: number
}

function extractReplacePartTags(...sources: Array<string | undefined>): ReplacePartTag[] {
    const out: ReplacePartTag[] = []
    for (const src of sources) {
        if (!src) continue
        // Match the bracketed tag — capture everything inside.
        const tagRe = /\[\s*REPLACE_PART\s+([^\]]+?)\s*\]/gi
        let m: RegExpExecArray | null
        while ((m = tagRe.exec(src)) !== null) {
            const inner = m[1]
            // Pull k=v fragments. Quotes optional. partId can have hyphens
            // and digits and uppercase letters (BOM part-number convention).
            const kv: Record<string, string> = {}
            const kvRe = /(\w+)\s*=\s*"?([A-Za-z0-9_\-.]+)"?/g
            let kvm: RegExpExecArray | null
            while ((kvm = kvRe.exec(inner)) !== null) {
                kv[kvm[1].toLowerCase()] = kvm[2]
            }
            const partId = kv.partid
            if (!partId) continue
            const tag: ReplacePartTag = { partId }
            if (kv.newcost) {
                const v = Number.parseFloat(kv.newcost)
                if (Number.isFinite(v) && v >= 1 && v <= 10_000_000) tag.newCostGbp = v
            }
            if (kv.newmasskg) {
                const v = Number.parseFloat(kv.newmasskg)
                if (Number.isFinite(v) && v > 0 && v < 10000) tag.newMassKg = v
            }
            // Tag must carry at least one numeric field to be useful.
            if (tag.newCostGbp !== undefined || tag.newMassKg !== undefined) {
                out.push(tag)
            }
        }
    }
    return out
}

// ─── Public API ─────────────────────────────────────────────────────────

export interface DerivePatchesArgs {
    /** Fang's saved review for this module. */
    review: SpecialistReview
    /** The module Fang reviewed — id + keyParts come from here. */
    module: {
        id: string
        keyParts: string[]
        budgetMassKg?: number | null
        estimatedMassKg?: number | null
        /**
         * Real BOM part numbers (`parts.part_number`) for this module.
         *
         * L16-G #11c (2026-04-27): the prior implementation matched against
         * `keyParts` only, but `keyParts` is Max's prose hints (e.g.
         * "Triple-redundant flight control computer ...") not part numbers
         * (e.g. `AV-001`). Without the real part numbers, the deterministic
         * extractor could never resolve a Fang reference like
         * `[REPLACE_PART partId=AV-001 ...]` to a row in canonical_specs.
         * When supplied, bomPartNumbers is the PRIMARY matching set;
         * keyParts stays as a fallback for legacy saved reviews.
         */
        bomPartNumbers?: string[]
    }
}

/**
 * Build the union set of part identifiers used for reference matching.
 * Prefer real BOM part numbers; fall back to keyParts (Max's prose hints
 * which sometimes contain partial numbers).
 */
function partMatchingSet(
    bomPartNumbers: string[] | undefined,
    keyParts: string[],
): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const p of [...(bomPartNumbers ?? []), ...keyParts]) {
        if (typeof p !== "string") continue
        const trimmed = p.trim()
        if (trimmed.length === 0) continue
        if (seen.has(trimmed)) continue
        seen.add(trimmed)
        out.push(trimmed)
    }
    return out
}

/**
 * Walk Fang's review and emit a conservative SpecPatch[]. Returns an empty
 * array on a `pass` verdict (Fang green-lit the module — no mutation).
 *
 * Per-issue extraction is independent: a single review can yield zero,
 * one, or several patches. The applier deduplicates and rank-gates anyway,
 * so emitting "best effort" extractions is safe.
 *
 * No throws — extraction failures fall through silently. The audit table
 * sees the patches that DID land via apply-design-patches; nothing fancy
 * is needed here.
 */
export function deriveFangPatches(args: DerivePatchesArgs): SpecPatch[] {
    const { review, module } = args

    // Gate 1: only mutate when verdict says something is wrong.
    if (review.verdict !== "warn" && review.verdict !== "fail") return []

    const patches: SpecPatch[] = []

    // L16-G #11c: union part-number set. Real BOM part_numbers preferred,
    // keyParts as fallback for legacy reviews.
    const matchingParts = partMatchingSet(module.bomPartNumbers, module.keyParts)

    // ── 0. [REPLACE_PART ...] tag extraction (highest confidence) ────
    //
    // L16-G #11c (2026-04-27): Fang's prompt now asks for explicit
    // [REPLACE_PART partId=X newCost=N newMassKg=N] tags below part-
    // replacement suggestions. When present these are unambiguous: no
    // unit-of-measure inference, no min-of-two-figures heuristic.
    //
    // We scan the entire review payload (issues' message+suggestion,
    // recommendations, reviewMarkdown) once and emit one structured patch
    // per tag. Cost patches still require the partId to exist in
    // matchingParts (the applier will reject otherwise).
    {
        const allText: string[] = []
        for (const i of review.issues) {
            if (i.message) allText.push(i.message)
            if (i.suggestion) allText.push(i.suggestion)
        }
        for (const r of review.recommendations) {
            if (typeof r === "string") allText.push(r)
        }
        if (typeof review.reviewMarkdown === "string") {
            allText.push(review.reviewMarkdown)
        }
        const tags = extractReplacePartTags(...allText)
        for (const tag of tags) {
            // Verify the partId is in the matching set. Without this, a
            // hallucinated partId would be passed to the applier which
            // would reject with REJECTED_UNKNOWN_PART — the rejection is
            // logged but it's wasted work. Enforce here so the patch never
            // leaves the extractor unless it's resolvable.
            const resolvedPart = matchingParts.find(
                (p) => p.toLowerCase() === tag.partId.toLowerCase(),
            )
            if (!resolvedPart) continue

            const reasonRaw = `Fang [REPLACE_PART] tag: partId=${resolvedPart}`
                + (tag.newCostGbp !== undefined ? ` newCost=${tag.newCostGbp}` : "")
                + (tag.newMassKg !== undefined ? ` newMassKg=${tag.newMassKg}` : "")
            const reason = reasonRaw.length > 280 ? reasonRaw.slice(0, 277) + "..." : reasonRaw

            if (tag.newCostGbp !== undefined) {
                patches.push({
                    scope: "part_cost",
                    op: "replace",
                    partId: resolvedPart,
                    value: tag.newCostGbp,
                    reason,
                    source: "applied_review_patch",
                })
            }
            if (tag.newMassKg !== undefined) {
                patches.push({
                    scope: "part_mass",
                    op: "replace",
                    partId: resolvedPart,
                    value: tag.newMassKg,
                    reason,
                    source: "applied_review_patch",
                })
            }
        }
    }

    for (const issue of review.issues) {
        // Only critical issues drive automatic mutation. Warnings + info are
        // surfaced in the review prose; the founder reviews them manually.
        if (issue.severity !== "critical") continue

        // ── 1. Mass patches (module + part) ──────────────────────────
        if (isMassCategory(issue.category)) {
            const extractedKg = extractMassKg(issue.suggestion, issue.message)
            if (extractedKg !== null) {
                // Reason text capped to 280 chars to keep audit rows lean
                // (cad_lab_design_patches.reason is unbounded but the UI
                // truncates anyway). Min 20 chars enforced by SpecPatchSchema.
                const reasonRaw = `Fang ${issue.severity} mass finding: ${issue.message}${issue.suggestion ? ` — ${issue.suggestion}` : ""}`
                const reason = reasonRaw.length > 280 ? reasonRaw.slice(0, 277) + "..." : reasonRaw

                // module_spec massKg patch — applied_review_patch rank 90
                // supersedes both Max (50) and BOM (70).
                patches.push({
                    scope: "module_spec",
                    op: "replace",
                    moduleId: module.id,
                    specKey: "massKg",
                    value: extractedKg,
                    priorValue: module.estimatedMassKg ?? undefined,
                    reason,
                    source: "applied_review_patch",
                })

                // If a partNumber is referenced AND the issue is mass,
                // also emit a part_mass patch (the part-level mass might
                // be different from the module-level rollup; the applier
                // rejects unknown partIds with REJECTED_UNKNOWN_PART so
                // unmatched references silent-skip).
                const partNumber = findReferencedPartNumber(
                    `${issue.message} ${issue.suggestion ?? ""}`,
                    matchingParts,
                )
                if (partNumber) {
                    patches.push({
                        scope: "part_mass",
                        op: "replace",
                        partId: partNumber,
                        value: extractedKg,
                        reason,
                        source: "applied_review_patch",
                    })
                }
            }
        }

        // ── 2. Cost patches ──────────────────────────────────────────
        if (isCostCategory(issue.category)) {
            const extractedCost = extractUnitCostGbp(issue.suggestion, issue.message)
            if (extractedCost !== null) {
                const partNumber = findReferencedPartNumber(
                    `${issue.message} ${issue.suggestion ?? ""}`,
                    matchingParts,
                )
                // Cost patches REQUIRE a referenced partNumber. Without it
                // the applier rejects with REJECTED_UNKNOWN_PART (Block G
                // bug #5 closure). Emitting one without a partId would
                // count as a rejection in the audit table for no benefit.
                if (partNumber) {
                    const reasonRaw = `Fang ${issue.severity} cost finding: ${issue.message}${issue.suggestion ? ` — ${issue.suggestion}` : ""}`
                    const reason = reasonRaw.length > 280 ? reasonRaw.slice(0, 277) + "..." : reasonRaw
                    patches.push({
                        scope: "part_cost",
                        op: "replace",
                        partId: partNumber,
                        value: extractedCost,
                        reason,
                        source: "applied_review_patch",
                    })
                }
            }
        }
    }

    // ── 2b. reviewMarkdown CRITICAL block extraction ────────────────
    //
    // Empirical observation 2026-04-27: Fang's saved reviews have rich
    // critical findings in `reviewMarkdown` ("#### 🔴 CRITICAL — Tyre
    // Material: TPU Glass Transition Exceeded ..."), but the structured
    // `issues[]` array is frequently empty. The model emits prose first
    // and the structured-issue-extraction step seems to be a separate
    // (unreliable) pass.
    //
    // To make this wiring useful TODAY, scan reviewMarkdown for sections
    // that look like critical findings and extract mass / cost patches
    // from them with the same pattern-based extractors used for
    // issues[]. Conservative gates apply: a partNumber from keyParts
    // must be referenced for cost patches, mass figures must be
    // bounded, etc.
    //
    // The block delimiter is the heading marker — "#### 🔴 CRITICAL —"
    // or "**🔴 CRITICAL**" or "#### CRITICAL —" — followed by everything
    // up to the next "####" heading. We process up to a hard cap of
    // 8 blocks per review to keep extraction time bounded.
    if (typeof review.reviewMarkdown === "string" && review.reviewMarkdown.length > 0) {
        const md = review.reviewMarkdown
        // Split on heading markers. We use a global lookahead split via
        // RegExp.exec rather than .split() so we can keep block content
        // intact (split on newlines would break tables / code).
        //
        // L16-G #11c (2026-04-27): widened to cover three observed Fang
        // formats:
        //   1. `#### 🔴 CRITICAL —` heading (canonical, what the prompt asks for)
        //   2. `### CRITICAL —` heading (some Fang outputs drop the emoji/level)
        //   3. `- **[CRITICAL]` bullet list (legacy Loop 16 format — what the
        //      empirical Loop 16 verification found in HAPS / BESS / Hedgerow)
        // Format 3 is line-anchored so the block boundary is "next bullet
        // OR next heading" (not just next ####).
        const headingRe = /(?:####|###)\s*(?:🔴\s*)?(?:\*\*)?CRITICAL(?:\*\*)?\s*[—–-]/g
        const bulletRe = /^\s*[-*]\s*\*\*\s*\[\s*CRITICAL\s*\]/gm
        const indices: Array<{ idx: number; kind: "heading" | "bullet" }> = []
        let mm: RegExpExecArray | null
        while ((mm = headingRe.exec(md)) !== null && indices.length < 16) {
            indices.push({ idx: mm.index, kind: "heading" })
        }
        while ((mm = bulletRe.exec(md)) !== null && indices.length < 24) {
            indices.push({ idx: mm.index, kind: "bullet" })
        }
        // Stable sort by index so block ordering matches document ordering.
        indices.sort((a, b) => a.idx - b.idx)

        // Each block spans from indices[i].idx to indices[i+1].idx (or EOF).
        // Cap at 8 blocks to keep extraction time bounded.
        const blocks: string[] = []
        for (let i = 0; i < indices.length && i < 8; i++) {
            const start = indices[i].idx
            const end = i + 1 < indices.length ? indices[i + 1].idx : md.length
            blocks.push(md.slice(start, end))
        }

        for (const block of blocks) {
            // Determine block category from the heading / bullet line.
            //
            // L16-G #11c: also recognise the normalised `[Mass]` / `[Cost]` /
            // `[Power]` etc. tag prefix Fang's prompt now requires. Tag form
            // is the highest-confidence signal — when present, it overrides
            // legacy keyword detection. The bullet form keyword detection
            // stays as a fallback for older saved reviews.
            const headingLine = block.split("\n")[0] ?? ""
            const tagMass = /\[\s*(?:mass|weight)\s*\]/i.test(headingLine)
            const tagCost = /\[\s*(?:cost|price)\s*\]/i.test(headingLine)
            const isMassBlock = tagMass
                || /mass|weight|tyre|hub.*\bkg\b|landing|propulsion.*mass/i.test(headingLine)
            const isCostBlock = tagCost
                || /cost|price|bom|cogs|£|GBP/i.test(headingLine)

            const partNumber = findReferencedPartNumber(block, matchingParts)

            if (isMassBlock || isCostBlock || /mass|weight|kg\b|grams?\b|£|GBP|cost|price/i.test(block)) {
                if (isCostBlock || /£|GBP|cost|price/i.test(block)) {
                    const extractedCost = extractUnitCostGbp(block)
                    if (extractedCost !== null && partNumber) {
                        const reasonRaw = `Fang reviewMarkdown CRITICAL block: ${headingLine.trim()}`
                        const reason = reasonRaw.length > 280 ? reasonRaw.slice(0, 277) + "..." : reasonRaw
                        patches.push({
                            scope: "part_cost",
                            op: "replace",
                            partId: partNumber,
                            value: extractedCost,
                            reason,
                            source: "applied_review_patch",
                        })
                    }
                }

                if (isMassBlock || /mass|weight|kg\b|grams?\b/i.test(block)) {
                    const extractedMass = extractMassKg(block)
                    if (extractedMass !== null) {
                        const reasonRaw = `Fang reviewMarkdown CRITICAL block: ${headingLine.trim()}`
                        const reason = reasonRaw.length > 280 ? reasonRaw.slice(0, 277) + "..." : reasonRaw
                        // Module-level mass patch only when the heading
                        // strongly implies module mass (vs a tolerance
                        // figure quoted inside a CRITICAL CFRP block, say).
                        if (isMassBlock) {
                            patches.push({
                                scope: "module_spec",
                                op: "replace",
                                moduleId: module.id,
                                specKey: "massKg",
                                value: extractedMass,
                                priorValue: module.estimatedMassKg ?? undefined,
                                reason,
                                source: "applied_review_patch",
                            })
                        }
                        if (partNumber) {
                            patches.push({
                                scope: "part_mass",
                                op: "replace",
                                partId: partNumber,
                                value: extractedMass,
                                reason,
                                source: "applied_review_patch",
                            })
                        }
                    }
                }
            }
        }
    }

    // ── 3. Recommendations (free-form) ───────────────────────────────
    // Fang's `recommendations: string[]` is plain-text guidance. We
    // extract patches from each recommendation string with the same
    // gates: cost-keyword + £-figure + matched partNumber.
    //
    // This catches the canonical Block G example: a recommendation like
    // "Specify Rittal AX 1200x800x400 cabinet (PC-001-PUR) for £18,000 —
    // saves £127k vs bespoke design." emits a part_cost patch on PC-001-PUR
    // → £18,000.
    for (const rec of review.recommendations) {
        if (typeof rec !== "string" || rec.length === 0) continue

        // Skip recs that don't mention cost / mass — speeds up the loop
        // and cuts false positives (a recommendation about tolerances
        // shouldn't accidentally extract a £-figure from a CE-mark
        // standard reference).
        const isCostRec = /cost|price|£|gbp|cogs|saves|cheaper|expensive/i.test(rec)
        const isMassRec = /mass|weight|kg\b|grams?\b/i.test(rec)
        if (!isCostRec && !isMassRec) continue

        const partNumber = findReferencedPartNumber(rec, matchingParts)

        if (isCostRec) {
            const extractedCost = extractUnitCostGbp(rec)
            if (extractedCost !== null && partNumber) {
                const reasonRaw = `Fang recommendation: ${rec}`
                const reason = reasonRaw.length > 280 ? reasonRaw.slice(0, 277) + "..." : reasonRaw
                patches.push({
                    scope: "part_cost",
                    op: "replace",
                    partId: partNumber,
                    value: extractedCost,
                    reason,
                    source: "applied_review_patch",
                })
            }
        }

        if (isMassRec) {
            const extractedMass = extractMassKg(rec)
            if (extractedMass !== null && partNumber) {
                const reasonRaw = `Fang recommendation: ${rec}`
                const reason = reasonRaw.length > 280 ? reasonRaw.slice(0, 277) + "..." : reasonRaw
                patches.push({
                    scope: "part_mass",
                    op: "replace",
                    partId: partNumber,
                    value: extractedMass,
                    reason,
                    source: "applied_review_patch",
                })
            }
        }
    }

    return patches
}
