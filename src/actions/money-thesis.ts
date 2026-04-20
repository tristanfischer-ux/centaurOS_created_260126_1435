/**
 * @file money-thesis.ts — Server actions for /money/raise/thesis.
 *
 * @description Read + write for the foundry-scoped `investor_thesis` table.
 * Theses are versioned — every save inserts a brand-new row with
 * `version = prev_max + 1`, never an update. The current active version
 * is pointed to by `foundries.active_thesis_id`.
 *
 * @security Uses `withAuth` for tenant-scoped writes. The RLS policy on
 * `investor_thesis` permits founder/co_founder only; we also derive
 * foundry_id from the authenticated session and never trust a
 * client-supplied foundry_id.
 *
 * @related
 *   - Table:  public.investor_thesis (versioned, soft-delete via archived_at)
 *   - Table:  public.foundries.active_thesis_id (FK → investor_thesis.id)
 *   - View:   src/app/(platform)/money/raise/thesis/thesis-view.tsx
 *   - Page:   src/app/(platform)/money/raise/thesis/page.tsx
 *   - Mockup: MONEY-MOCKUP-THESIS-BUILDER.html
 *   - Schema: MONEY-SCHEMA.md §2 `investor_thesis`
 */

"use server"

import { revalidatePath } from "next/cache"

import { withAuth } from "@/lib/server-action-utils"

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * Weight bag — MUST sum to 100. Mirrors MONEY-SCHEMA.md §investor_thesis
 * weights default. Keys are fixed; the view renders them in this order.
 */
export interface ThesisWeights {
    thesis: number
    stage: number
    cheque: number
    warm: number
    geo: number
    recency: number
    speed: number
}

/**
 * Data-source toggles for the 6 sources in the mockup. Every source is
 * a boolean; disabled sources are ignored when the match engine runs.
 */
export interface ThesisDataSources {
    crunchbase: boolean
    companies_house: boolean
    forge_capital: boolean
    forge_network: boolean
    angellist: boolean
    manual: boolean
}

/** `lead_follower_pref` enum — three values per schema. */
export type LeadFollowerPref = "lead_only" | "follower_only" | "either"

/**
 * Full `investor_thesis` row exposed to the client. Mirrors the table
 * columns exactly; the view renders defaults when no thesis exists yet.
 */
export interface ThesisRow {
    id: string | null
    version: number
    stageTags: string[]
    sectorTags: string[]
    geography: string[]
    chequeMinCents: number | null
    chequeMaxCents: number | null
    keywords: string[]
    preferredInstrument: string[]
    decisionSpeedMaxWeeks: number | null
    leadFollowerPref: LeadFollowerPref
    weights: ThesisWeights
    dataSources: ThesisDataSources
}

/**
 * Patch accepted by `saveThesis`. All fields required because every save
 * creates a new version — partial patches don't make sense when the
 * next row copies from the previous one.
 */
export interface ThesisPatch {
    stageTags: string[]
    sectorTags: string[]
    geography: string[]
    chequeMinCents: number | null
    chequeMaxCents: number | null
    keywords: string[]
    preferredInstrument: string[]
    decisionSpeedMaxWeeks: number | null
    leadFollowerPref: LeadFollowerPref
    weights: ThesisWeights
    dataSources: ThesisDataSources
}

// ─── Defaults (used when no row exists yet) ────────────────────────────

/**
 * Default weights sum to 100. Mirrors MONEY-SCHEMA.md §investor_thesis
 * weights default column.
 */
export const DEFAULT_WEIGHTS: ThesisWeights = {
    thesis: 35,
    stage: 20,
    cheque: 15,
    warm: 12,
    geo: 8,
    recency: 6,
    speed: 4,
}

/**
 * Default data-source toggles — 4 on, 2 off. Mirrors MONEY-SCHEMA.md
 * §investor_thesis data_sources default column.
 */
export const DEFAULT_DATA_SOURCES: ThesisDataSources = {
    crunchbase: true,
    companies_house: true,
    forge_capital: true,
    forge_network: true,
    angellist: false,
    manual: false,
}

export const DEFAULT_THESIS: ThesisRow = {
    id: null,
    version: 0,
    stageTags: [],
    sectorTags: [],
    geography: [],
    chequeMinCents: null,
    chequeMaxCents: null,
    keywords: [],
    preferredInstrument: [],
    decisionSpeedMaxWeeks: null,
    leadFollowerPref: "either",
    weights: DEFAULT_WEIGHTS,
    dataSources: DEFAULT_DATA_SOURCES,
}

// ─── Validation helpers ────────────────────────────────────────────────

const VALID_LEAD_PREF: ReadonlySet<string> = new Set([
    "lead_only",
    "follower_only",
    "either",
])

/** Sum of weights must be exactly 100. */
function weightsSumTo100(w: ThesisWeights): boolean {
    const sum =
        w.thesis + w.stage + w.cheque + w.warm + w.geo + w.recency + w.speed
    return sum === 100
}

function allWeightsNonNegative(w: ThesisWeights): boolean {
    return (
        w.thesis >= 0 &&
        w.stage >= 0 &&
        w.cheque >= 0 &&
        w.warm >= 0 &&
        w.geo >= 0 &&
        w.recency >= 0 &&
        w.speed >= 0
    )
}

function isNullOrPositiveInt(value: number | null, max: number): boolean {
    if (value === null) return true
    return Number.isInteger(value) && value >= 0 && value <= max
}

// ─── Actions ───────────────────────────────────────────────────────────

/**
 * Load the foundry's current thesis (the row pointed to by
 * `foundries.active_thesis_id`). Returns the default shape when no
 * active thesis exists yet so the form always renders.
 */
export async function loadThesis(): Promise<
    { thesis: ThesisRow } | { error: string }
> {
    return withAuth(async ({ supabase, foundryId }) => {
        // Get the foundry's active thesis id — FK column.
        const { data: foundry, error: foundryError } = await supabase
            .from("foundries")
            .select("active_thesis_id")
            .eq("id", foundryId)
            .maybeSingle()

        if (foundryError) {
            console.error("[money-thesis] load foundry failed", {
                foundryId,
                error: foundryError.message,
            })
            return { error: "Could not load your thesis." }
        }

        if (!foundry?.active_thesis_id) {
            return { thesis: DEFAULT_THESIS }
        }

        const { data, error } = await supabase
            .from("investor_thesis")
            .select(
                "id, version, stage_tags, sector_tags, geography, cheque_min_cents, cheque_max_cents, keywords, preferred_instrument, decision_speed_max_weeks, lead_follower_pref, weights, data_sources",
            )
            .eq("id", foundry.active_thesis_id)
            .maybeSingle()

        if (error) {
            console.error("[money-thesis] load thesis failed", {
                foundryId,
                thesisId: foundry.active_thesis_id,
                error: error.message,
            })
            return { error: "Could not load your thesis." }
        }

        if (!data) {
            return { thesis: DEFAULT_THESIS }
        }

        return {
            thesis: {
                id: data.id,
                version: data.version,
                stageTags: data.stage_tags ?? [],
                sectorTags: data.sector_tags ?? [],
                geography: data.geography ?? [],
                chequeMinCents: data.cheque_min_cents,
                chequeMaxCents: data.cheque_max_cents,
                keywords: data.keywords ?? [],
                preferredInstrument: data.preferred_instrument ?? [],
                decisionSpeedMaxWeeks: data.decision_speed_max_weeks,
                leadFollowerPref: normaliseLeadPref(data.lead_follower_pref),
                weights: normaliseWeights(data.weights),
                dataSources: normaliseDataSources(data.data_sources),
            } satisfies ThesisRow,
        }
    })
}

/**
 * Save a new thesis version. Inserts a brand-new `investor_thesis` row
 * with `version = prev_max + 1`, then points `foundries.active_thesis_id`
 * at it. Previous versions remain in the table (not archived) so the
 * founder can see version history.
 */
export async function saveThesis(
    patch: ThesisPatch,
): Promise<{ success: true; version: number } | { error: string }> {
    // ── Validation ────────────────────────────────────────────────────

    if (!allWeightsNonNegative(patch.weights)) {
        return { error: "Every weight must be zero or positive." }
    }
    if (!weightsSumTo100(patch.weights)) {
        return { error: "Weights must sum to exactly 100." }
    }
    if (!VALID_LEAD_PREF.has(patch.leadFollowerPref)) {
        return {
            error: `Unknown lead / follower preference: ${patch.leadFollowerPref}`,
        }
    }
    if (!isNullOrPositiveInt(patch.chequeMinCents, 10_000_000_000)) {
        return { error: "Minimum cheque must be zero or positive." }
    }
    if (!isNullOrPositiveInt(patch.chequeMaxCents, 10_000_000_000)) {
        return { error: "Maximum cheque must be zero or positive." }
    }
    if (
        patch.chequeMinCents !== null &&
        patch.chequeMaxCents !== null &&
        patch.chequeMinCents > patch.chequeMaxCents
    ) {
        return {
            error: "Minimum cheque cannot be higher than maximum cheque.",
        }
    }
    if (
        !isNullOrPositiveInt(patch.decisionSpeedMaxWeeks, 520 /* 10 years */)
    ) {
        return { error: "Decision speed must be zero or positive weeks." }
    }

    return withAuth(async ({ supabase, user, foundryId }) => {
        // ── Find the current max version for this foundry ────────────
        const { data: prev, error: prevError } = await supabase
            .from("investor_thesis")
            .select("version")
            .eq("foundry_id", foundryId)
            .order("version", { ascending: false })
            .limit(1)

        if (prevError) {
            console.error("[money-thesis] fetch prev version failed", {
                foundryId,
                error: prevError.message,
            })
            return { error: "Could not save your thesis. Please try again." }
        }

        const nextVersion = (prev?.[0]?.version ?? 0) + 1

        // ── Insert the new row ──────────────────────────────────────
        const { data: inserted, error: insertError } = await supabase
            .from("investor_thesis")
            .insert({
                foundry_id: foundryId,
                version: nextVersion,
                stage_tags: patch.stageTags,
                sector_tags: patch.sectorTags,
                geography: patch.geography,
                cheque_min_cents: patch.chequeMinCents,
                cheque_max_cents: patch.chequeMaxCents,
                keywords: patch.keywords,
                preferred_instrument: patch.preferredInstrument,
                decision_speed_max_weeks: patch.decisionSpeedMaxWeeks,
                lead_follower_pref: patch.leadFollowerPref,
                weights: { ...patch.weights },
                data_sources: { ...patch.dataSources },
                created_by: user.id,
            })
            .select("id, version")
            .single()

        if (insertError || !inserted) {
            console.error("[money-thesis] insert failed", {
                foundryId,
                error: insertError?.message,
            })
            return { error: "Could not save your thesis. Please try again." }
        }

        // ── Point the foundry at the new version ────────────────────
        const { error: updateError } = await supabase
            .from("foundries")
            .update({ active_thesis_id: inserted.id })
            .eq("id", foundryId)

        if (updateError) {
            console.error("[money-thesis] update foundry pointer failed", {
                foundryId,
                thesisId: inserted.id,
                error: updateError.message,
            })
            return {
                error: "Saved the version but could not make it active. Please try again.",
            }
        }

        revalidatePath("/money/raise/thesis")
        return { success: true, version: inserted.version }
    })
}

// ─── Internal ──────────────────────────────────────────────────────────

function normaliseLeadPref(value: string | null | undefined): LeadFollowerPref {
    if (value === "lead_only" || value === "follower_only") return value
    return "either"
}

function normaliseWeights(value: unknown): ThesisWeights {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return DEFAULT_WEIGHTS
    }
    const v = value as Record<string, unknown>
    return {
        thesis: toInt(v.thesis, DEFAULT_WEIGHTS.thesis),
        stage: toInt(v.stage, DEFAULT_WEIGHTS.stage),
        cheque: toInt(v.cheque, DEFAULT_WEIGHTS.cheque),
        warm: toInt(v.warm, DEFAULT_WEIGHTS.warm),
        geo: toInt(v.geo, DEFAULT_WEIGHTS.geo),
        recency: toInt(v.recency, DEFAULT_WEIGHTS.recency),
        speed: toInt(v.speed, DEFAULT_WEIGHTS.speed),
    }
}

function normaliseDataSources(value: unknown): ThesisDataSources {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return DEFAULT_DATA_SOURCES
    }
    const v = value as Record<string, unknown>
    return {
        crunchbase: v.crunchbase === false ? false : true,
        companies_house: v.companies_house === false ? false : true,
        forge_capital: v.forge_capital === false ? false : true,
        forge_network: v.forge_network === false ? false : true,
        angellist: v.angellist === true,
        manual: v.manual === true,
    }
}

function toInt(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        return value
    }
    return fallback
}
