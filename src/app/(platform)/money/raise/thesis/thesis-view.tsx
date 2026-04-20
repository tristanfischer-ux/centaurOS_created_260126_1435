/**
 * ThesisView — /money/raise/thesis, mockup-faithful port of
 * MONEY-MOCKUP-THESIS-BUILDER.html. Scoped to `.ths2`.
 *
 * DOM ported top-to-bottom: breadcrumb, header tile (with orange
 * title-dot + 4 stat tiles), 5-step navigation stepper, five form
 * sections (Company snapshot · Fit criteria · Weighting · Data
 * sources · Match preview), and a right rail with the score-math
 * card + thesis keyword engine + warm intro detection + versions.
 *
 * Data contract — what persists today via `saveThesis`:
 *   - Stage tags            → investor_thesis.stage_tags (text[])
 *   - Sector tags           → investor_thesis.sector_tags (text[])
 *   - Geography             → investor_thesis.geography (text[])
 *   - Cheque min / max      → investor_thesis.cheque_min_cents / max_cents
 *   - Keywords              → investor_thesis.keywords (text[])
 *   - Preferred instrument  → investor_thesis.preferred_instrument (text[])
 *   - Decision speed weeks  → investor_thesis.decision_speed_max_weeks
 *   - Lead / follow pref    → investor_thesis.lead_follower_pref (enum text)
 *   - Weights (7 fields)    → investor_thesis.weights (jsonb)
 *   - Data sources (6 bools)→ investor_thesis.data_sources (jsonb)
 *
 * Every save inserts a NEW investor_thesis row (version + 1) and points
 * foundries.active_thesis_id at it.
 *
 * Fields on the mockup we do NOT persist yet — each renders with
 * honest chrome so the founder can see what's live:
 *   - Section 1 Company snapshot — read-only summary sourced from the
 *     foundry + existing Money surfaces. Real "edit in Strategy / Plan /
 *     Raise" links are kept so the founder knows where each fact lives.
 *     No fabricated per-foundry numbers — if we don't have the data, we
 *     render "not yet set · edit upstream".
 *   - Header stats (Pool size / Matches / High match / Warm intros) —
 *     empty state until the match engine is wired. Numbers render as
 *     "—" with "Matching engine lands with Raise pipeline" helper.
 *   - Section 5 Match preview — empty state for the same reason.
 *
 * No-go rules (text[]) — not yet persisted as a first-class column in
 * the current schema (the table has `no_go_rules jsonb DEFAULT '[]'` but
 * the UI wires this as future-round scope per the briefing). This view
 * does NOT render a no-go list yet; the mockup's copy is edited out
 * rather than paraphrased into a fake empty state.
 */

"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"

import { saveThesis } from "@/actions/money-thesis"
import {
    DEFAULT_WEIGHTS,
    type LeadFollowerPref,
    type ThesisDataSources,
    type ThesisPatch,
    type ThesisRow,
    type ThesisWeights,
} from "@/actions/money-thesis-types"

import "./ths2.css"

// ─── Lookup tables ─────────────────────────────────────────────────────

interface Option<T extends string> {
    value: T
    label: string
}

/** Stage tags the founder can toggle — 4 canonical rounds. */
const STAGE_OPTIONS: ReadonlyArray<Option<string>> = [
    { value: "pre_seed", label: "Pre-seed" },
    { value: "seed", label: "Seed" },
    { value: "series_a", label: "Series A" },
    { value: "later", label: "Later" },
]

/**
 * Sector suggestions that show as add-chips. These are prompts, not a
 * fixed list — the founder can add any sector they want via the input.
 * No pre-selected mockup values (Agri-tech / Robotics / etc) because
 * those are Nimbus Robotics's thesis, not every foundry's.
 */
const SECTOR_SUGGESTIONS: ReadonlyArray<string> = [
    "Hardware",
    "Robotics",
    "Agri-tech",
    "Climate / sustainability",
    "Deeptech",
    "B2B SaaS",
    "Health-tech",
    "Energy",
    "AI infrastructure",
    "Fintech",
]

/** ISO country codes for the geography field. Alpha-2. */
const GEO_OPTIONS: ReadonlyArray<Option<string>> = [
    { value: "GB", label: "United Kingdom" },
    { value: "IE", label: "Ireland" },
    { value: "DE", label: "Germany" },
    { value: "FR", label: "France" },
    { value: "NL", label: "Netherlands" },
    { value: "US", label: "United States" },
    { value: "CA", label: "Canada" },
    { value: "SE", label: "Sweden" },
    { value: "DK", label: "Denmark" },
    { value: "CH", label: "Switzerland" },
]

const INSTRUMENT_OPTIONS: ReadonlyArray<Option<string>> = [
    { value: "safe_post", label: "SAFE (post-money)" },
    { value: "safe_pre", label: "SAFE (pre-money)" },
    { value: "priced", label: "Priced equity" },
    { value: "convertible", label: "Convertible note" },
    { value: "asa", label: "ASA" },
]

const LEAD_PREF_OPTIONS: ReadonlyArray<Option<LeadFollowerPref>> = [
    { value: "either", label: "Either — leads or followers" },
    { value: "lead_only", label: "Lead cheques only" },
    { value: "follower_only", label: "Follower cheques only" },
]

interface DataSourceMeta {
    key: keyof ThesisDataSources
    name: string
    desc: string
}

/**
 * Six data sources from the mockup. Descriptions explain what each one
 * contributes once the engine is wired — the tile still toggles today
 * so the founder can express their preference; the stored value drives
 * the engine the moment it lands.
 */
const DATA_SOURCE_META: ReadonlyArray<DataSourceMeta> = [
    {
        key: "crunchbase",
        name: "Crunchbase Pro",
        desc: "Commercial investor database — firm and partner records, cheque sizes, recent deals.",
    },
    {
        key: "companies_house",
        name: "Companies House (UK)",
        desc: "UK-registered fund entities and director records for regulated investors.",
    },
    {
        key: "forge_capital",
        name: "Forge Capital enrichment",
        desc: "Fractional Forge's investor research pipeline — cheque history, thesis language, published statements.",
    },
    {
        key: "forge_network",
        name: "ForgeOS network",
        desc: "Shared connections from other founders on the platform — warm intros surface from this.",
    },
    {
        key: "angellist",
        name: "AngelList",
        desc: "US-heavy angel and syndicate listings. Enable if you want US exposure.",
    },
    {
        key: "manual",
        name: "Manually added",
        desc: "Investors you add yourself — from conferences, intros, prior rounds.",
    },
]

interface WeightDef {
    key: keyof ThesisWeights
    label: string
    helper: string
}

const WEIGHT_DEFS: ReadonlyArray<WeightDef> = [
    {
        key: "thesis",
        label: "Thesis alignment",
        helper: "Sector keywords · problem statement overlap",
    },
    {
        key: "stage",
        label: "Stage fit",
        helper: "Do they write cheques at your stage?",
    },
    {
        key: "cheque",
        label: "Cheque match",
        helper: "Does your ask fit their range?",
    },
    {
        key: "warm",
        label: "Warm intro availability",
        helper: "Do we share a connection?",
    },
    {
        key: "geo",
        label: "Geographic fit",
        helper: "Active in your markets",
    },
    {
        key: "recency",
        label: "Recency of activity",
        helper: "Deployed capital in last 12 months",
    },
    {
        key: "speed",
        label: "Decision speed",
        helper: "Fast enough for your timeline",
    },
]

// ─── Small helpers ────────────────────────────────────────────────────

/**
 * Format pence to human-readable "£50k" / "£1.2m". Returns null-safe
 * fallback when value is null.
 */
function formatCheque(cents: number | null): string {
    if (cents === null) return "—"
    const pounds = Math.round(cents / 100)
    if (pounds >= 1_000_000) {
        return `£${(pounds / 1_000_000).toFixed(1)}m`
    }
    if (pounds >= 1_000) {
        return `£${Math.round(pounds / 1_000)}k`
    }
    return `£${pounds}`
}

function parsePoundsToCents(value: string): number | null {
    const trimmed = value.trim()
    if (trimmed === "") return null
    // Accept "50", "50000", "50,000", "50k", "1.5m"
    const normalised = trimmed
        .toLowerCase()
        .replace(/[£,\s]/g, "")
    const mMatch = normalised.match(/^(\d+(?:\.\d+)?)m$/)
    if (mMatch) {
        return Math.round(Number(mMatch[1]) * 1_000_000 * 100)
    }
    const kMatch = normalised.match(/^(\d+(?:\.\d+)?)k$/)
    if (kMatch) {
        return Math.round(Number(kMatch[1]) * 1_000 * 100)
    }
    const num = Number(normalised)
    if (!Number.isFinite(num) || num < 0) return null
    return Math.round(num * 100)
}

// ─── Props ────────────────────────────────────────────────────────────

export interface ThesisViewProps {
    /** Initial thesis loaded from the DB (or DEFAULT_THESIS). */
    initialThesis: ThesisRow
    /** Count of investor_thesis rows for this foundry (version history depth). */
    historyCount: number
}

// ─── Component ────────────────────────────────────────────────────────

export function ThesisView(props: ThesisViewProps): React.ReactElement {
    const { initialThesis, historyCount } = props

    // Form state — each field is its own piece of state so changes stay
    // granular and the save button can check diff against `initialThesis`.
    const [stageTags, setStageTags] = useState<string[]>(
        initialThesis.stageTags,
    )
    const [sectorTags, setSectorTags] = useState<string[]>(
        initialThesis.sectorTags,
    )
    const [geography, setGeography] = useState<string[]>(initialThesis.geography)
    const [chequeMinCents, setChequeMinCents] = useState<number | null>(
        initialThesis.chequeMinCents,
    )
    const [chequeMaxCents, setChequeMaxCents] = useState<number | null>(
        initialThesis.chequeMaxCents,
    )
    const [keywords, setKeywords] = useState<string[]>(initialThesis.keywords)
    const [preferredInstrument, setPreferredInstrument] = useState<string[]>(
        initialThesis.preferredInstrument,
    )
    const [decisionSpeedMaxWeeks, setDecisionSpeedMaxWeeks] = useState<
        number | null
    >(initialThesis.decisionSpeedMaxWeeks)
    const [leadFollowerPref, setLeadFollowerPref] = useState<LeadFollowerPref>(
        initialThesis.leadFollowerPref,
    )
    const [weights, setWeights] = useState<ThesisWeights>(initialThesis.weights)
    const [dataSources, setDataSources] = useState<ThesisDataSources>(
        initialThesis.dataSources,
    )

    // Chip-input pending values (for add-new flows)
    const [sectorInput, setSectorInput] = useState("")
    const [keywordInput, setKeywordInput] = useState("")
    const [chequeMinInput, setChequeMinInput] = useState(
        initialThesis.chequeMinCents !== null
            ? String(initialThesis.chequeMinCents / 100)
            : "",
    )
    const [chequeMaxInput, setChequeMaxInput] = useState(
        initialThesis.chequeMaxCents !== null
            ? String(initialThesis.chequeMaxCents / 100)
            : "",
    )

    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // ── Computed ──────────────────────────────────────────────────

    const weightsSum = useMemo(
        () =>
            weights.thesis +
            weights.stage +
            weights.cheque +
            weights.warm +
            weights.geo +
            weights.recency +
            weights.speed,
        [weights],
    )

    const weightsValid = weightsSum === 100

    const dataSourcesOnCount = useMemo(
        () =>
            Object.values(dataSources).filter(Boolean).length,
        [dataSources],
    )

    const isDirty = useMemo(() => {
        const i = initialThesis
        return (
            !arraysEqual(stageTags, i.stageTags) ||
            !arraysEqual(sectorTags, i.sectorTags) ||
            !arraysEqual(geography, i.geography) ||
            chequeMinCents !== i.chequeMinCents ||
            chequeMaxCents !== i.chequeMaxCents ||
            !arraysEqual(keywords, i.keywords) ||
            !arraysEqual(preferredInstrument, i.preferredInstrument) ||
            decisionSpeedMaxWeeks !== i.decisionSpeedMaxWeeks ||
            leadFollowerPref !== i.leadFollowerPref ||
            !weightsEqual(weights, i.weights) ||
            !dataSourcesEqual(dataSources, i.dataSources)
        )
    }, [
        initialThesis,
        stageTags,
        sectorTags,
        geography,
        chequeMinCents,
        chequeMaxCents,
        keywords,
        preferredInstrument,
        decisionSpeedMaxWeeks,
        leadFollowerPref,
        weights,
        dataSources,
    ])

    // ── Toggle helpers ───────────────────────────────────────────

    function toggleInArray(
        value: string,
        current: string[],
        setter: (next: string[]) => void,
    ): void {
        if (current.includes(value)) {
            setter(current.filter((v) => v !== value))
        } else {
            setter([...current, value])
        }
    }

    function commitCheque(which: "min" | "max"): void {
        if (which === "min") {
            const parsed = parsePoundsToCents(chequeMinInput)
            setChequeMinCents(parsed)
            // Keep input value in sync with parsed result for clarity.
            if (parsed !== null) {
                setChequeMinInput(String(parsed / 100))
            }
        } else {
            const parsed = parsePoundsToCents(chequeMaxInput)
            setChequeMaxCents(parsed)
            if (parsed !== null) {
                setChequeMaxInput(String(parsed / 100))
            }
        }
    }

    function addSector(): void {
        const trimmed = sectorInput.trim()
        if (trimmed === "" || sectorTags.includes(trimmed)) {
            setSectorInput("")
            return
        }
        setSectorTags([...sectorTags, trimmed])
        setSectorInput("")
    }

    function addKeyword(): void {
        const trimmed = keywordInput.trim()
        if (trimmed === "" || keywords.includes(trimmed)) {
            setKeywordInput("")
            return
        }
        setKeywords([...keywords, trimmed])
        setKeywordInput("")
    }

    function toggleDataSource(key: keyof ThesisDataSources): void {
        setDataSources({ ...dataSources, [key]: !dataSources[key] })
    }

    function setWeight(key: keyof ThesisWeights, value: number): void {
        setWeights({ ...weights, [key]: value })
    }

    function resetWeights(): void {
        setWeights(DEFAULT_WEIGHTS)
    }

    // ── Save ─────────────────────────────────────────────────────

    function handleSave(): void {
        setError(null)
        setSuccess(null)

        if (!weightsValid) {
            setError(
                `Weights must sum to exactly 100 (currently ${weightsSum}).`,
            )
            return
        }

        const patch: ThesisPatch = {
            stageTags,
            sectorTags,
            geography,
            chequeMinCents,
            chequeMaxCents,
            keywords,
            preferredInstrument,
            decisionSpeedMaxWeeks,
            leadFollowerPref,
            weights,
            dataSources,
        }

        startTransition(async () => {
            const result = await saveThesis(patch)
            if ("error" in result) {
                setError(result.error)
                return
            }
            setSuccess(
                `Thesis saved — version ${result.version} is now active.`,
            )
        })
    }

    // ── Render ───────────────────────────────────────────────────

    const hasAnyData =
        stageTags.length > 0 ||
        sectorTags.length > 0 ||
        geography.length > 0 ||
        chequeMinCents !== null ||
        chequeMaxCents !== null ||
        keywords.length > 0 ||
        preferredInstrument.length > 0 ||
        decisionSpeedMaxWeeks !== null ||
        initialThesis.version > 0

    return (
        <div className="ths2">
            {/* ── Breadcrumb ────────────────────────────────── */}
            <div className="ths2-page-head">
                <div className="ths2-crumbs">
                    <Link href="/money">Money</Link>
                    <span className="sep">›</span>
                    <Link href="/money/raise">Raise</Link>
                    <span className="sep">›</span>
                    <span className="current">Investor thesis</span>
                </div>
                <div className="ths2-ctx">
                    <button
                        type="button"
                        className="ths2-btn ths2-btn-primary sm"
                        onClick={handleSave}
                        disabled={!isDirty || isPending || !weightsValid}
                    >
                        {isPending ? "Saving…" : "Save & apply"}
                    </button>
                </div>
            </div>

            {/* ── Header tile ──────────────────────────────── */}
            <div className="ths2-head">
                <h1>
                    <span className="ths2-title-dot" aria-hidden="true" />
                    Your investor thesis
                </h1>
                <div className="sub">
                    A structured description of the{" "}
                    <strong>investor who&apos;s right for you</strong>. Once
                    the Raise pipeline lands, we use this to score every
                    investor in the directory into a shortlist. Fine-tune
                    the weighting and the criteria below — each save stores
                    a new version so you can compare over time.
                </div>

                <div className="ths2-stats">
                    <div className="rs">
                        <div className="lab">Pool size</div>
                        <div className="val empty">—</div>
                        <div className="sub">Directory lands with Raise</div>
                    </div>
                    <div className="rs">
                        <div className="lab">Matches</div>
                        <div className="val empty">—</div>
                        <div className="sub">After your criteria</div>
                    </div>
                    <div className="rs">
                        <div className="lab">Versions saved</div>
                        <div className="val">{historyCount}</div>
                        <div className="sub">
                            {initialThesis.version > 0
                                ? `Current is v${initialThesis.version}`
                                : "No saved version yet"}
                        </div>
                    </div>
                    <div className="rs">
                        <div className="lab">Status</div>
                        <div
                            className="val"
                            style={{
                                color: hasAnyData
                                    ? "var(--ths-success)"
                                    : "var(--ths-fg-faint)",
                                fontSize: 18,
                            }}
                        >
                            {hasAnyData ? "Draft ready" : "Empty"}
                        </div>
                        <div className="sub">
                            {isDirty ? "Unsaved changes" : "All saved"}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Fiona briefing (Fundraising specialist) ─────── */}
            <div className="ths2-briefing">
                <div
                    className="ths2-briefing-avatar"
                    aria-label="Fiona — Fundraising advisor"
                >
                    Fi
                </div>
                <div className="ths2-briefing-body">
                    <strong>Fiona — Fundraising advisor.</strong> A sharp
                    thesis is the single biggest lever on outreach
                    efficiency. Set the stage, cheque range, and sector
                    tags that describe the investor you want. Skip the
                    fields you&apos;re not sure about — every save makes a
                    new version so you can refine later without losing
                    the earlier draft.
                </div>
            </div>

            {/* ── Stepper ───────────────────────────────────── */}
            <div className="ths2-stepper">
                <div className="stepper-label">Thesis</div>
                <a href="#company" className="step active">
                    <span className="n">01</span>
                    <span className="lbl">Company snapshot</span>
                    <span className="sub">Read-only</span>
                </a>
                <a href="#criteria" className="step">
                    <span className="n">02</span>
                    <span className="lbl">Fit criteria</span>
                    <span className="sub">You edit</span>
                </a>
                <a href="#weighting" className="step">
                    <span className="n">03</span>
                    <span className="lbl">Weighting</span>
                    <span className="sub">
                        {weightsValid
                            ? "100% · valid"
                            : `${weightsSum}% · fix`}
                    </span>
                </a>
                <a href="#sources" className="step">
                    <span className="n">04</span>
                    <span className="lbl">Data sources</span>
                    <span className="sub">
                        {dataSourcesOnCount} of 6 on
                    </span>
                </a>
                <a href="#preview" className="step">
                    <span className="n">05</span>
                    <span className="lbl">Match preview</span>
                    <span className="sub">Empty</span>
                </a>
            </div>

            {/* ── Save banner ──────────────────────────────── */}
            {isDirty && !isPending ? (
                <div className="ths2-save-banner" role="status">
                    <strong>Unsaved changes</strong>
                    <span>
                        Save to store a new version of your thesis.
                    </span>
                    <div className="ths2-save-banner-actions">
                        <button
                            type="button"
                            className="ths2-btn ths2-btn-primary sm"
                            onClick={handleSave}
                            disabled={isPending || !weightsValid}
                        >
                            Save now
                        </button>
                    </div>
                </div>
            ) : null}

            {error ? (
                <div className="ths2-alert ths2-alert-error" role="alert">
                    {error}
                </div>
            ) : null}
            {success ? (
                <div
                    className="ths2-alert ths2-alert-success"
                    role="status"
                >
                    {success}
                </div>
            ) : null}

            {/* ── Two-column body + rail ───────────────────── */}
            <div className="ths2-body">
                <div>
                    {/* ── SECTION 1: Company snapshot (read-only) ── */}
                    <section className="ths2-section" id="company">
                        <h3>
                            01 · Company snapshot
                            <span className="ths2-auto-tag">
                                Read-only
                            </span>
                        </h3>
                        <div className="ths2-section-sub">
                            Facts about your company — edit upstream in
                            Strategy, Plan, or Raise. Each field here
                            mirrors what those surfaces already hold.
                        </div>

                        <div className="ths2-snapshot-note">
                            <strong>How this section works.</strong> We
                            don&apos;t duplicate your stage, sector, or
                            ask on this page. Once Strategy and the Raise
                            round editor are wired, the values you set
                            there auto-populate the snapshot below and
                            feed into the matching engine. Until then,
                            focus on Fit criteria (Section 2) and
                            Weighting (Section 3) — those persist today.
                        </div>

                        <div className="ths2-fld" style={{ marginTop: 12 }}>
                            <label>
                                Stage
                                <small>Where you are</small>
                            </label>
                            <div className="val empty">
                                Set in Strategy
                            </div>
                            <div className="action">
                                <Link
                                    href="/strategy"
                                    className="ths2-btn sm"
                                >
                                    Strategy →
                                </Link>
                            </div>
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Ask
                                <small>What you want</small>
                            </label>
                            <div className="val empty">
                                Set in Raise round
                            </div>
                            <div className="action">
                                <Link
                                    href="/money/raise"
                                    className="ths2-btn sm"
                                >
                                    Raise →
                                </Link>
                            </div>
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Business model
                                <small>How you make money</small>
                            </label>
                            <div className="val empty">
                                Set in Plan
                            </div>
                            <div className="action">
                                <Link
                                    href="/money/plan"
                                    className="ths2-btn sm"
                                >
                                    Plan →
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* ── SECTION 2: Fit criteria (editable) ─── */}
                    <section className="ths2-section" id="criteria">
                        <h3>
                            02 · Fit criteria
                            <span className="ths2-auto-tag manual">
                                You edit
                            </span>
                        </h3>
                        <div className="ths2-section-sub">
                            What an ideal investor looks like. Each row
                            persists to `investor_thesis` the next time
                            you save.
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Cheque size
                                <small>£ range they write</small>
                            </label>
                            <div className="ths2-cheque-grid">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className="ths2-input"
                                    value={chequeMinInput}
                                    onChange={(e) =>
                                        setChequeMinInput(e.target.value)
                                    }
                                    onBlur={() => commitCheque("min")}
                                    placeholder="£ min (e.g. 50000)"
                                    aria-label="Minimum cheque size in pounds"
                                />
                                <div className="sep">–</div>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className="ths2-input"
                                    value={chequeMaxInput}
                                    onChange={(e) =>
                                        setChequeMaxInput(e.target.value)
                                    }
                                    onBlur={() => commitCheque("max")}
                                    placeholder="£ max (e.g. 350000)"
                                    aria-label="Maximum cheque size in pounds"
                                />
                            </div>
                            <div className="action">
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--ths-fg-muted)",
                                    }}
                                >
                                    {chequeMinCents !== null ||
                                    chequeMaxCents !== null
                                        ? `${formatCheque(chequeMinCents)} – ${formatCheque(chequeMaxCents)}`
                                        : "Not set"}
                                </span>
                            </div>
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Stage focus
                                <small>Rounds they lead</small>
                            </label>
                            <div className="ths2-chips">
                                {STAGE_OPTIONS.map((opt) => {
                                    const on = stageTags.includes(opt.value)
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={
                                                on
                                                    ? "ths2-chip"
                                                    : "ths2-chip off"
                                            }
                                            onClick={() =>
                                                toggleInArray(
                                                    opt.value,
                                                    stageTags,
                                                    setStageTags,
                                                )
                                            }
                                            aria-pressed={on}
                                        >
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <div />
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Geography
                                <small>Where they invest</small>
                            </label>
                            <div className="ths2-chips">
                                {GEO_OPTIONS.map((opt) => {
                                    const on = geography.includes(opt.value)
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={
                                                on
                                                    ? "ths2-chip"
                                                    : "ths2-chip off"
                                            }
                                            onClick={() =>
                                                toggleInArray(
                                                    opt.value,
                                                    geography,
                                                    setGeography,
                                                )
                                            }
                                            aria-pressed={on}
                                        >
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <div />
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Sector tags
                                <small>Their stated areas of interest</small>
                            </label>
                            <div className="ths2-chips">
                                {sectorTags.map((tag) => (
                                    <button
                                        key={tag}
                                        type="button"
                                        className="ths2-chip"
                                        onClick={() =>
                                            setSectorTags(
                                                sectorTags.filter(
                                                    (t) => t !== tag,
                                                ),
                                            )
                                        }
                                        aria-label={`Remove ${tag}`}
                                    >
                                        {tag}
                                        <span className="x">×</span>
                                    </button>
                                ))}
                                <span className="ths2-chip-input">
                                    <input
                                        type="text"
                                        value={sectorInput}
                                        onChange={(e) =>
                                            setSectorInput(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault()
                                                addSector()
                                            }
                                        }}
                                        placeholder="Add sector…"
                                        aria-label="Add a sector tag"
                                    />
                                </span>
                            </div>
                            <div />
                        </div>

                        {sectorTags.length === 0 ? (
                            <div
                                className="ths2-fld"
                                style={{ borderTop: "none" }}
                            >
                                <label />
                                <div
                                    style={{
                                        fontSize: 11.5,
                                        color: "var(--ths-fg-muted)",
                                    }}
                                >
                                    Suggestions:{" "}
                                    {SECTOR_SUGGESTIONS.map((s, i) => (
                                        <span key={s}>
                                            <button
                                                type="button"
                                                className="ths2-chip-add"
                                                onClick={() =>
                                                    setSectorTags([
                                                        ...sectorTags,
                                                        s,
                                                    ])
                                                }
                                                style={{
                                                    display: "inline-flex",
                                                    marginRight: 4,
                                                    marginBottom: 4,
                                                }}
                                            >
                                                + {s}
                                            </button>
                                            {i <
                                            SECTOR_SUGGESTIONS.length - 1
                                                ? ""
                                                : ""}
                                        </span>
                                    ))}
                                </div>
                                <div />
                            </div>
                        ) : null}

                        <div className="ths2-fld">
                            <label>
                                Keywords
                                <small>
                                    Words the match engine looks for in
                                    investor statements
                                </small>
                            </label>
                            <div className="ths2-chips">
                                {keywords.map((kw) => (
                                    <button
                                        key={kw}
                                        type="button"
                                        className="ths2-chip"
                                        onClick={() =>
                                            setKeywords(
                                                keywords.filter(
                                                    (k) => k !== kw,
                                                ),
                                            )
                                        }
                                        aria-label={`Remove ${kw}`}
                                    >
                                        {kw}
                                        <span className="x">×</span>
                                    </button>
                                ))}
                                <span className="ths2-chip-input">
                                    <input
                                        type="text"
                                        value={keywordInput}
                                        onChange={(e) =>
                                            setKeywordInput(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault()
                                                addKeyword()
                                            }
                                        }}
                                        placeholder="Add keyword…"
                                        aria-label="Add a keyword"
                                    />
                                </span>
                            </div>
                            <div />
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Preferred instrument
                                <small>What they accept</small>
                            </label>
                            <div className="ths2-chips">
                                {INSTRUMENT_OPTIONS.map((opt) => {
                                    const on =
                                        preferredInstrument.includes(
                                            opt.value,
                                        )
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={
                                                on
                                                    ? "ths2-chip"
                                                    : "ths2-chip off"
                                            }
                                            onClick={() =>
                                                toggleInArray(
                                                    opt.value,
                                                    preferredInstrument,
                                                    setPreferredInstrument,
                                                )
                                            }
                                            aria-pressed={on}
                                        >
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <div />
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Decision speed
                                <small>Max weeks from first meeting to term sheet</small>
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={52}
                                className="ths2-input"
                                style={{ maxWidth: 140 }}
                                value={
                                    decisionSpeedMaxWeeks === null
                                        ? ""
                                        : decisionSpeedMaxWeeks
                                }
                                onChange={(e) => {
                                    const val = e.target.value
                                    if (val === "") {
                                        setDecisionSpeedMaxWeeks(null)
                                    } else {
                                        const n = parseInt(val, 10)
                                        setDecisionSpeedMaxWeeks(
                                            Number.isFinite(n) && n >= 0
                                                ? n
                                                : null,
                                        )
                                    }
                                }}
                                placeholder="e.g. 8"
                                aria-label="Decision speed max weeks"
                            />
                            <div />
                        </div>

                        <div className="ths2-fld">
                            <label>
                                Leads / follows
                                <small>Cheque role</small>
                            </label>
                            <select
                                className="ths2-select"
                                style={{ maxWidth: 280 }}
                                value={leadFollowerPref}
                                onChange={(e) =>
                                    setLeadFollowerPref(
                                        e.target.value as LeadFollowerPref,
                                    )
                                }
                                aria-label="Lead or follower preference"
                            >
                                {LEAD_PREF_OPTIONS.map((opt) => (
                                    <option
                                        key={opt.value}
                                        value={opt.value}
                                    >
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <div />
                        </div>
                    </section>

                    {/* ── SECTION 3: Weighting ──────────────── */}
                    <section className="ths2-section" id="weighting">
                        <h3>
                            03 · Criteria weighting
                            <span className="ths2-auto-tag manual">
                                You tune
                            </span>
                        </h3>
                        <div className="ths2-section-sub">
                            Which criteria matter most in the match score.
                            Must sum to 100. The match engine multiplies
                            each criterion&apos;s 0–100 score by its
                            weight, then sums.
                        </div>

                        {WEIGHT_DEFS.map((def) => (
                            <div
                                key={def.key}
                                className="ths2-weight-row"
                            >
                                <div className="ths2-weight-name">
                                    {def.label}
                                    <small>{def.helper}</small>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={weights[def.key]}
                                    onChange={(e) =>
                                        setWeight(
                                            def.key,
                                            parseInt(e.target.value, 10),
                                        )
                                    }
                                    className="ths2-weight-slider"
                                    aria-label={`${def.label} weight`}
                                />
                                <div className="ths2-weight-val">
                                    {weights[def.key]}%
                                </div>
                            </div>
                        ))}

                        <div className="ths2-weight-foot">
                            <span className="muted">Sum must = 100</span>
                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    type="button"
                                    className="ths2-btn sm"
                                    onClick={resetWeights}
                                >
                                    Reset to defaults
                                </button>
                                <span
                                    className={
                                        weightsValid ? "valid" : "invalid"
                                    }
                                >
                                    {weightsSum}%{" "}
                                    {weightsValid ? "· valid" : "· fix"}
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* ── SECTION 4: Data sources ───────────── */}
                    <section className="ths2-section" id="sources">
                        <h3>
                            04 · Data sources
                            <span className="ths2-auto-tag">
                                {dataSourcesOnCount} of 6 enabled
                            </span>
                        </h3>
                        <div className="ths2-section-sub">
                            Which feeds supply the investor directory.
                            Your choice persists today; the live engine
                            lands with the Raise pipeline PR.
                        </div>
                        <div className="ths2-ds-grid">
                            {DATA_SOURCE_META.map((meta) => {
                                const on = dataSources[meta.key]
                                return (
                                    <button
                                        key={meta.key}
                                        type="button"
                                        onClick={() =>
                                            toggleDataSource(meta.key)
                                        }
                                        className={
                                            on
                                                ? "ths2-ds-tile on"
                                                : "ths2-ds-tile off"
                                        }
                                        aria-pressed={on}
                                    >
                                        <div className="ds-top">
                                            <div className="ds-name">
                                                {meta.name}
                                            </div>
                                            <span
                                                className="ths2-ds-toggle"
                                                aria-hidden="true"
                                            />
                                        </div>
                                        <div className="ds-desc">
                                            {meta.desc}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    {/* ── SECTION 5: Match preview (empty) ────── */}
                    <section className="ths2-section" id="preview">
                        <h3>
                            05 · Match preview
                            <span className="ths2-auto-tag">
                                Waiting on engine
                            </span>
                        </h3>
                        <div className="ths2-section-sub">
                            Once the investor directory and match engine
                            land with the Raise pipeline PR, the top
                            matches ranked against this thesis will
                            appear here.
                        </div>
                        <div className="ths2-empty">
                            <strong>No matches to show yet.</strong>
                            Save your thesis to lock in the criteria.
                            When the Raise pipeline PR lands, this panel
                            populates with the top-scoring investors from
                            the sources you&apos;ve enabled above.
                        </div>
                    </section>
                </div>

                {/* ── Rail ─────────────────────────────────── */}
                <aside className="ths2-rail" aria-label="Thesis notes">
                    <div className="ths2-rail-card">
                        <div className="rc-head">How the score works</div>
                        <div className="rc-body">
                            <p style={{ marginBottom: 10 }}>
                                A weighted sum of each fit criterion,
                                each scored 0–100. No-go rules hard-filter
                                investors before scoring when the engine
                                ships.
                            </p>
                            <div className="ths2-score-math">
                                <div>
                                    <span className="sm-name">thesis</span>{" "}
                                    ×{" "}
                                    <span className="sm-num">
                                        {(weights.thesis / 100).toFixed(2)}
                                    </span>{" "}
                                    +{" "}
                                    <span className="sm-name">stage</span>{" "}
                                    ×{" "}
                                    <span className="sm-num">
                                        {(weights.stage / 100).toFixed(2)}
                                    </span>{" "}
                                    +
                                </div>
                                <div>
                                    <span className="sm-name">cheque</span>{" "}
                                    ×{" "}
                                    <span className="sm-num">
                                        {(weights.cheque / 100).toFixed(2)}
                                    </span>{" "}
                                    +{" "}
                                    <span className="sm-name">warm</span>{" "}
                                    ×{" "}
                                    <span className="sm-num">
                                        {(weights.warm / 100).toFixed(2)}
                                    </span>{" "}
                                    +
                                </div>
                                <div>
                                    <span className="sm-name">geo</span>{" "}
                                    ×{" "}
                                    <span className="sm-num">
                                        {(weights.geo / 100).toFixed(2)}
                                    </span>{" "}
                                    +{" "}
                                    <span className="sm-name">recency</span>{" "}
                                    ×{" "}
                                    <span className="sm-num">
                                        {(weights.recency / 100).toFixed(2)}
                                    </span>{" "}
                                    +
                                </div>
                                <div>
                                    <span className="sm-name">speed</span>{" "}
                                    ×{" "}
                                    <span className="sm-num">
                                        {(weights.speed / 100).toFixed(2)}
                                    </span>{" "}
                                    ={" "}
                                    <span className="sm-num">score</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="ths2-rail-card">
                        <div className="rc-head">
                            Thesis keyword engine
                        </div>
                        <div className="rc-body">
                            Your <strong>keywords</strong> (set in Section
                            2) are compared against each investor&apos;s
                            public statements — website, posts,
                            portfolio tags. Cosine similarity → thesis
                            score 0–100. The engine lands with the Raise
                            pipeline PR.
                        </div>
                    </div>

                    <div className="ths2-rail-card">
                        <div className="rc-head">Warm intro detection</div>
                        <div className="rc-body">
                            The ForgeOS network plus your LinkedIn graph
                            will score warm-intro availability as 100
                            (first-degree), 60 (second-degree via a
                            named contact), or 0 otherwise — once
                            wired. Enable the <strong>ForgeOS network</strong>{" "}
                            source above to use it.
                        </div>
                    </div>

                    <div className="ths2-rail-card">
                        <div className="rc-head">Versions</div>
                        <div className="rc-body">
                            {initialThesis.version > 0 ? (
                                <>
                                    <strong>
                                        v{initialThesis.version}
                                    </strong>{" "}
                                    is active.
                                    <div
                                        style={{
                                            marginTop: 6,
                                            fontSize: 11,
                                            color: "var(--ths-fg-subtle)",
                                        }}
                                    >
                                        {historyCount} version
                                        {historyCount === 1 ? "" : "s"}{" "}
                                        saved in total. Full history view
                                        lands with the Raise pipeline PR.
                                    </div>
                                </>
                            ) : (
                                <span
                                    style={{
                                        color: "var(--ths-fg-faint)",
                                    }}
                                >
                                    No saved version yet — save below to
                                    store v1.
                                </span>
                            )}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}

// ─── Pure helpers ────────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function weightsEqual(a: ThesisWeights, b: ThesisWeights): boolean {
    return (
        a.thesis === b.thesis &&
        a.stage === b.stage &&
        a.cheque === b.cheque &&
        a.warm === b.warm &&
        a.geo === b.geo &&
        a.recency === b.recency &&
        a.speed === b.speed
    )
}

function dataSourcesEqual(
    a: ThesisDataSources,
    b: ThesisDataSources,
): boolean {
    return (
        a.crunchbase === b.crunchbase &&
        a.companies_house === b.companies_house &&
        a.forge_capital === b.forge_capital &&
        a.forge_network === b.forge_network &&
        a.angellist === b.angellist &&
        a.manual === b.manual
    )
}
