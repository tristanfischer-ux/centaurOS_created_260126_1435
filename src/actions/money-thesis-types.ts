/**
 * @file money-thesis-types.ts — Type definitions and defaults for money thesis.
 *
 * Split from money-thesis.ts because Next.js "use server" files can only
 * export async functions. All non-async exports (types, interfaces, and
 * const defaults) live here so consumers can import them cleanly.
 */

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
