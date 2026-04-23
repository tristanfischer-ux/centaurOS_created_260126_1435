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

    for (const module of modules) {
        const slotName = matchModuleToSlot(module, rules.slots)
        if (slotName && solveResult.slot_dimensions[slotName]) {
            matched[module.id] = solveResult.slot_dimensions[slotName]
            usedSlotIds.add(slotName)
        } else {
            unmatched_module_ids.push(module.id)
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
        generated_at: new Date().toISOString(),
    }

    return { ok: true, sheet }
}

// ─── Internal: slot matcher ────────────────────────────────────────────

function matchModuleToSlot(
    module: { name: string; keyParts?: string[]; purpose?: string },
    slots: Record<string, SlotDefinition>,
): string | null {
    // Tiered match: a hit on `module.name` is ~10× more trustworthy than a
    // hit in keyParts (an HVAC module's keyParts might include "structural
    // mounting rails" which would falsely match container_shell). Scoring:
    //   name match    → alias.length * 10
    //   purpose match → alias.length * 3
    //   keyParts match → alias.length
    // Longest alias inside the strongest field wins.
    const nameL = module.name.toLowerCase()
    const purposeL = (module.purpose ?? "").toLowerCase()
    const keyPartsL = (module.keyParts ?? []).join(" ").toLowerCase()

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
