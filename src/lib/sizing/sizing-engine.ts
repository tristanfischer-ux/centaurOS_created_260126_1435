/**
 * @file src/lib/sizing/sizing-engine.ts — Generic sizing solver wrapper.
 *
 * @description Glue layer between Max's module list and per-domain coefficient
 * libraries. Responsibilities:
 *
 *   1. Resolve the correct domain rules via the registry.
 *   2. Run the domain's `solve()` to produce slot-keyed dimensions.
 *   3. Match each Max module ID back to a slot by name/keyParts substring —
 *      so downstream consumers can look up `module_dimensions[moduleId]`
 *      with the same id they already hold.
 *   4. Record any slots Max didn't produce a module for, or modules that
 *      didn't match any slot, under `unmatched_*` arrays.
 *   5. Assemble the final DimensionSheet for persistence on
 *      `cad_lab_projects.dimension_sheet`.
 *
 * This wrapper NEVER throws — an infeasible project still produces a
 * dimension sheet (with conflicts + recommendations). The only failure
 * path is "no rules library for this domain", which returns `null` and
 * lets Fang skip the sizing stage gracefully.
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import type {
    DimensionSheet,
    DomainRules,
    Envelope,
    ModuleDimensions,
    SlotDefinition,
} from "./types"
import { pickRulesForDomain, getRulesByDomain } from "./rules/_registry"
import {
    CONTAINER_40FT_ISO,
    CONTAINER_40FT_HC_REEFER,
    CONTAINER_20FT_ISO,
    CONTAINER_53FT_HC,
    WAREHOUSE_BAY_100,
    HEATPUMP_CABINET,
} from "./envelopes"

export interface RunSizingInput {
    /** Industry domain emitted by Max (or overridden by the founder). */
    industryDomain?: string | null
    /** Exact domain key override (skips auto-detection). */
    domainOverride?: string | null
    /** Declared envelope — defaults to the domain's `defaultEnvelope`. */
    envelope?: Envelope | null
    /** Numeric targets — shape is domain-specific (see `DomainRules.targetSpec`). */
    targets: Record<string, number>
    /** Max modules for slot matching. */
    modules: CadLabModule[]
}

export interface RunSizingResult {
    ok: true
    sheet: DimensionSheet
}

export interface RunSizingSkipped {
    ok: false
    reason:
        | "NO_RULES_FOR_DOMAIN"
        | "MISSING_TARGETS"
        | "NO_MODULES"
    message: string
    industryDomain?: string | null
}

export type RunSizingOutcome = RunSizingResult | RunSizingSkipped

/**
 * Main entry point. Runs the full sizing stage for one project.
 */
export function runSizing(input: RunSizingInput): RunSizingOutcome {
    const { industryDomain, domainOverride, envelope, targets, modules } = input

    if (!modules || modules.length === 0) {
        return {
            ok: false,
            reason: "NO_MODULES",
            message: "Cannot size a project with zero modules — decompose first.",
            industryDomain,
        }
    }

    const rules: DomainRules | null = domainOverride
        ? getRulesByDomain(domainOverride)
        : pickRulesForDomain(industryDomain)

    if (!rules) {
        return {
            ok: false,
            reason: "NO_RULES_FOR_DOMAIN",
            message: `No sizing rule library registered for domain "${industryDomain ?? "(unknown)"}". Skipping sizing stage.`,
            industryDomain,
        }
    }

    // Validate required targets — each library declares its target spec.
    const missing: string[] = []
    for (const [key, spec] of Object.entries(rules.targetSpec)) {
        if (spec.required && (targets[key] === undefined || targets[key] === null)) {
            missing.push(`${spec.label} (${key})`)
        }
    }
    if (missing.length > 0) {
        return {
            ok: false,
            reason: "MISSING_TARGETS",
            message: `Missing required sizing targets: ${missing.join(", ")}.`,
            industryDomain,
        }
    }

    const resolvedEnvelope = envelope ?? rules.defaultEnvelope

    // Run the domain solver.
    const solveResult = rules.solve({
        envelope: resolvedEnvelope,
        targets,
        modules: modules.map((m) => ({
            id: m.id,
            name: m.name,
            purpose: m.purpose,
            keyParts: m.keyParts,
        })),
    })

    // Match Max module IDs to slot names via alias matching.
    const matched: Record<string, ModuleDimensions> = {}
    const unmatched_module_ids: string[] = []
    const usedSlotIds = new Set<string>()

    for (const mod of modules) {
        const slotName = matchModuleToSlot(mod, rules.slots)
        if (slotName && solveResult.slot_dimensions[slotName]) {
            matched[mod.id] = solveResult.slot_dimensions[slotName]
            usedSlotIds.add(slotName)
        } else {
            unmatched_module_ids.push(mod.id)
        }
    }

    // Also preserve slot dimensions that DIDN'T match any Max module —
    // downstream (hero prompt) still benefits from seeing the full intended
    // spatial layout even when Max missed a slot (e.g. container_shell).
    // We key these under the slot name itself (which won't clash with Max
    // ids because our canonical slots use underscored names like
    // `container_shell` which Max won't emit as a module id).
    const unmatched_slot_ids: string[] = []
    for (const [slotName, dims] of Object.entries(solveResult.slot_dimensions)) {
        if (!usedSlotIds.has(slotName)) {
            matched[slotName] = dims
            unmatched_slot_ids.push(slotName)
        }
    }

    // Loop 8 L5-P4 sizing universalisation: when the primary attempt is
    // INFEASIBLE, try alternates and pick the largest-target feasible one.
    // Cheap — each alternate is a deterministic re-run of the same solver
    // with different inputs (no LLM, no I/O). Stops at the first success
    // ordered from "least scope cut" to "most scope cut" so the founder
    // sees the smallest revision that closes the gap.
    let closestFeasibleAlternate: DimensionSheet["closest_feasible_alternate"] = null
    if (!solveResult.feasible) {
        const alternateAttempts: Array<{
            envelope: Envelope
            targets: Record<string, number>
            label: string
        }> = []
        // Alternate envelopes the rules library may accept.
        const altEnvelopes: Array<{ env: Envelope; label: string }> = []
        if (resolvedEnvelope.kind !== "container_53ft_hc") {
            altEnvelopes.push({ env: CONTAINER_53FT_HC, label: "53ft high-cube container" })
        }
        if (resolvedEnvelope.kind !== "warehouse_bay") {
            altEnvelopes.push({ env: WAREHOUSE_BAY_100, label: "warehouse bay 100 m²" })
        }
        // First: bigger envelope at original targets.
        for (const { env, label } of altEnvelopes) {
            alternateAttempts.push({
                envelope: env,
                targets: { ...targets },
                label: `Switch envelope to ${label} at original targets`,
            })
        }
        // Second: original envelope with progressively smaller numeric
        // targets (90%, 75%, 50%, 33%). All targetSpec entries are
        // numeric in current rule libraries; if a future library adds a
        // non-numeric target it would need a TargetFieldSpec.type tag
        // to skip here.
        const numericTargetKeys = Object.keys(rules.targetSpec)
        for (const factor of [0.9, 0.75, 0.5, 0.33]) {
            const scaled: Record<string, number> = { ...targets }
            for (const k of numericTargetKeys) {
                if (typeof scaled[k] === "number") {
                    scaled[k] = Math.round(scaled[k] * factor)
                }
            }
            alternateAttempts.push({
                envelope: resolvedEnvelope,
                targets: scaled,
                label: `Reduce numeric targets to ${Math.round(factor * 100)}% of brief`,
            })
        }
        for (const attempt of alternateAttempts) {
            try {
                const altResult = rules.solve({
                    envelope: attempt.envelope,
                    targets: attempt.targets,
                    modules: modules.map((m) => ({
                        id: m.id,
                        name: m.name,
                        purpose: m.purpose,
                        keyParts: m.keyParts,
                    })),
                })
                if (altResult.feasible) {
                    closestFeasibleAlternate = {
                        envelope: attempt.envelope,
                        target: attempt.targets,
                        floor_budget_m2: altResult.floor_budget_m2,
                        module_dimensions: altResult.slot_dimensions,
                        delta_from_primary: attempt.label,
                    }
                    break
                }
            } catch (err) {
                // Some alternates may throw if they fall outside the rule
                // library's domain assumptions — skip and try the next.
                console.warn(
                    `[sizing] alternate attempt "${attempt.label}" threw, skipping:`,
                    err instanceof Error ? err.message : err,
                )
            }
        }
    }

    const sheet: DimensionSheet = {
        feasible: solveResult.feasible,
        rules_domain: rules.domain,
        rules_version: rules.version,
        envelope: resolvedEnvelope,
        target: targets,
        floor_budget_m2: solveResult.floor_budget_m2,
        module_dimensions: matched,
        unmatched_module_ids,
        unmatched_slot_ids,
        conflicts: solveResult.conflicts,
        recommendations: solveResult.recommendations,
        notes: solveResult.notes ?? [],
        iterations: solveResult.iterations,
        ...(solveResult.optimisation ? { optimisation: solveResult.optimisation } : {}),
        closest_feasible_alternate: closestFeasibleAlternate,
        generated_at: new Date().toISOString(),
    }

    return { ok: true, sheet }
}

// ─── Internal: slot matcher ────────────────────────────────────────────

function matchModuleToSlot(
    mod: { name: string; keyParts?: string[]; purpose?: string },
    slots: Record<string, SlotDefinition>,
): string | null {
    // Tiered match: a hit on the module name is ~10× more trustworthy than a
    // hit in keyParts (an HVAC module's keyParts might include "structural
    // mounting rails" which would falsely match container_shell). Scoring:
    //   name match    → alias.length * 10
    //   purpose match → alias.length * 3
    //   keyParts match → alias.length
    // Longest alias inside the strongest field wins.
    const nameL = mod.name.toLowerCase()
    const purposeL = (mod.purpose ?? "").toLowerCase()
    const keyPartsL = (mod.keyParts ?? []).join(" ").toLowerCase()

    let best: { slot: string; score: number } | null = null
    for (const [slotName, def] of Object.entries(slots)) {
        for (const alias of def.matchAliases) {
            const needle = alias.toLowerCase()
            let score = 0
            if (nameL.includes(needle)) {
                score = needle.length * 10
            } else if (purposeL.includes(needle)) {
                score = needle.length * 3
            } else if (keyPartsL.includes(needle)) {
                score = needle.length
            }
            if (score > 0 && (!best || score > best.score)) {
                best = { slot: slotName, score }
            }
        }
    }
    return best?.slot ?? null
}

// ─── Helpers for callers ───────────────────────────────────────────────

/**
 * Infer sensible default targets from the project's research/design brief
 * when Max produced them. This is a best-effort extraction — if the brief
 * doesn't declare the target the founder has to set it manually via the
 * UI. Keeps Fang's auto-run useful without requiring extra UI state
 * upfront.
 */
export function inferTargetsFromBrief(
    industryDomain: string | null | undefined,
    brief: {
        capacity?: { kwh?: number; kw?: number; canopy_m2?: number; kw_thermal?: number }
        targets?: Record<string, number>
    } | null | undefined,
): Record<string, number> {
    const out: Record<string, number> = {}
    if (!brief) return out

    // Explicit targets block wins if it exists.
    if (brief.targets) {
        return { ...brief.targets }
    }

    // Otherwise infer by domain.
    const rules = pickRulesForDomain(industryDomain)
    if (!rules) return out

    for (const key of Object.keys(rules.targetSpec)) {
        const fromCapacity = (brief.capacity as Record<string, number> | undefined)?.[key]
        if (typeof fromCapacity === "number") {
            out[key] = fromCapacity
            continue
        }
        const spec = rules.targetSpec[key]
        if (spec.default !== undefined) {
            out[key] = spec.default
        }
    }
    return out
}

/**
 * Extract numeric capacity targets from a free-text brief — handles the
 * common case where the founder states "3.5 MWh and 1.5 MW" in a sentence
 * but Max didn't populate brief.capacity / brief.targets. Returns only
 * brief-derived values (no library defaults) so the caller can tell what
 * came from the brief vs a fallback.
 *
 * Recognised patterns:
 *   - "3.5 MWh", "1.5 MW", "1500 kW", "500 kWh"
 *   - "200 m² canopy", "8 kW thermal"
 *   - mixes of upper/lower case, with or without spaces
 *
 * Conservative: returns the LARGEST extracted value for each unit. Briefs
 * typically state "X to Y", "around X", or "up to X" — taking the largest
 * matches the founder's stated ceiling, not a min.
 */
export function inferTargetsFromBriefText(
    industryDomain: string | null | undefined,
    text: string,
): Record<string, number> {
    if (!industryDomain || !text) return {}
    const out: Record<string, number> = {}
    const haystack = text.toLowerCase()

    const captureAll = (re: RegExp, multiplier = 1): number[] => {
        const values: number[] = []
        const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`
        const globalRe = new RegExp(re.source, flags)
        for (const match of haystack.matchAll(globalRe)) {
            const n = Number.parseFloat(match[1])
            if (Number.isFinite(n)) values.push(n * multiplier)
        }
        return values
    }

    const max = (xs: number[]): number | undefined => (xs.length === 0 ? undefined : Math.max(...xs))

    if (industryDomain === "battery_energy_storage") {
        // MWh → kWh (×1000), GWh → kWh (×1_000_000)
        const kwh = max([
            ...captureAll(/(\d+(?:\.\d+)?)\s*kwh/i),
            ...captureAll(/(\d+(?:\.\d+)?)\s*mwh/i, 1000),
            ...captureAll(/(\d+(?:\.\d+)?)\s*gwh/i, 1_000_000),
        ])
        // Negative-lookahead to avoid matching "kWh" as "kW"
        const kw = max([
            ...captureAll(/(\d+(?:\.\d+)?)\s*kw(?![a-z])/i),
            ...captureAll(/(\d+(?:\.\d+)?)\s*mw(?![a-z])/i, 1000),
        ])
        if (kwh !== undefined) out.kwh = kwh
        if (kw !== undefined) out.kw = kw
    } else if (industryDomain === "vertical_farm") {
        const canopy = max([
            ...captureAll(/(\d+(?:\.\d+)?)\s*m(?:²|2|\^2)\s*(?:canopy|growing|grow)/i),
        ])
        const tiers = max([...captureAll(/(\d+)\s*tiers?/i)])
        if (canopy !== undefined) out.canopy_m2 = canopy
        if (tiers !== undefined) out.tiers = tiers
    } else if (industryDomain === "heat_pump") {
        const kw = max([
            ...captureAll(/(\d+(?:\.\d+)?)\s*kw\s*(?:thermal|output)/i),
            ...captureAll(/(\d+(?:\.\d+)?)\s*kw(?![a-z])/i),
        ])
        if (kw !== undefined) out.kw_thermal = kw
    }
    return out
}

/**
 * Detect the founder's stated form factor / envelope from a free-text brief.
 * Returns null if no signal — caller falls back to the rule library's
 * defaultEnvelope.
 *
 * Currently handles: 40ft / 20ft / 53ft ISO containers, warehouse bays,
 * heat-pump cabinets.
 *
 * VF demo regression: brief said "40-foot containerised modular vertical
 * farm" but the rule library hardcoded WAREHOUSE_BAY_100 — every spatial
 * row then overflowed. With this function the orchestrator picks
 * CONTAINER_40FT_ISO from the brief text and the rack count drops to fit.
 */
export function inferEnvelopeFromBriefText(
    text: string,
): import("./types").Envelope | null {
    if (!text) return null
    const haystack = text.toLowerCase()

    // 40ft high-cube reefer — must match before generic 40ft
    if ((/\b(?:40[\s-]?ft|40[\s-]?foot|forty[\s-]?foot)\b/.test(haystack))
        && (/\b(?:high[\s-]?cube|hc)\b/.test(haystack) || /\breefer\b/.test(haystack))) {
        return CONTAINER_40FT_HC_REEFER
    }

    // 40ft container — most common BESS / containerised farm signal
    if (/\b(?:40[\s-]?ft|40[\s-]?foot|40['']|forty[\s-]?foot)\b.*\b(?:iso|container|containerised|containerized|shipping)\b/i.test(haystack)
        || /\b(?:iso|shipping)?\s*container.*\b(?:40[\s-]?ft|40[\s-]?foot)\b/i.test(haystack)
        || (/\b40[\s-]?ft\b/.test(haystack) && /\b(container|cont\b)/.test(haystack))) {
        return CONTAINER_40FT_ISO
    }

    // 20ft container
    if (/\b(?:20[\s-]?ft|20[\s-]?foot|twenty[\s-]?foot)\b.*\b(?:iso|container|shipping)\b/i.test(haystack)
        || (/\b20[\s-]?ft\b/.test(haystack) && /\b(container|cont\b)/.test(haystack))) {
        return CONTAINER_20FT_ISO
    }

    // 53ft high-cube
    if (/\b53[\s-]?(?:ft|foot)\b.*\b(?:hc|high.cube|container)\b/i.test(haystack)) {
        return CONTAINER_53FT_HC
    }

    // Heat-pump cabinet (only when domain is heat-pump-shaped)
    if (/\b(?:cabinet|outdoor[\s-]?unit)\b.*\b(?:heat[\s-]?pump|ashp|gshp|wshp)\b/i.test(haystack)
        || /\b(?:heat[\s-]?pump|ashp)\b.*\b(?:cabinet|outdoor[\s-]?unit)\b/i.test(haystack)) {
        return HEATPUMP_CABINET
    }

    // Warehouse bay (explicit only — don't match "warehouse-style" or
    // generic uses of the word "warehouse")
    if (/\b(?:warehouse[\s-]?bay|grow[\s-]?room|cea[\s-]?facility)\b/i.test(haystack)) {
        return WAREHOUSE_BAY_100
    }

    return null
}
