/**
 * RoundsNewView — Money "Create round" form page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-CREATE-ROUND.html. Scoped CSS under `.rnd2` keeps the
 * styling isolated. The `investor_round` table is not live yet (see
 * MONEY-SCHEMA §investor_round — pending migration), so the form is fully
 * interactive locally but submit shows an honest "Saved locally" state rather
 * than pretending to persist.
 *
 * Sections (top to bottom, per mockup):
 *   1. Breadcrumb + cancel chip
 *   2. Header card (orange-dot title + subtitle)
 *   3. The basics — round name, stage, target amount, currency, close date
 *   4. Instrument & terms — instrument chip picker, valuation cap, discount,
 *      min/max cheque
 *   5. Structure & policy — lead structure chips, close style chips,
 *      syndicate narrative
 *   6. Preview — rendered raise-header tile + math check
 *   7. Action footer — Cancel / Save as draft / Create round
 */

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import "./rounds-new-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

type Stage =
    | "pre_seed"
    | "pre_seed_thesis"
    | "seed"
    | "series_a"
    | "bridge"

type Currency = "GBP" | "USD" | "EUR"

type Instrument = "safe_post" | "safe_pre" | "priced" | "convertible" | "asa"

type LeadStructure = "open_to_leads" | "follower_only" | "party"

type CloseStyle = "rolling" | "single_close"

// ─── Constants ──────────────────────────────────────────────────────────

const STAGE_OPTIONS: Array<{ key: Stage; label: string }> = [
    { key: "pre_seed", label: "Pre-seed" },
    { key: "pre_seed_thesis", label: "Pre-seed (your thesis)" },
    { key: "seed", label: "Seed" },
    { key: "series_a", label: "Series A" },
    { key: "bridge", label: "Bridge / extension" },
]

const CURRENCY_OPTIONS: Array<{ key: Currency; label: string; symbol: string }> = [
    { key: "GBP", label: "GBP · £", symbol: "£" },
    { key: "USD", label: "USD · $", symbol: "$" },
    { key: "EUR", label: "EUR · €", symbol: "€" },
]

const INSTRUMENT_CHIPS: Array<{ key: Instrument; label: string }> = [
    { key: "safe_post", label: "SAFE (post-money)" },
    { key: "safe_pre", label: "SAFE (pre-money)" },
    { key: "priced", label: "Priced equity" },
    { key: "convertible", label: "Convertible note" },
    { key: "asa", label: "ASA (UK)" },
]

const LEAD_CHIPS: Array<{ key: LeadStructure; label: string }> = [
    { key: "open_to_leads", label: "Yes · 1–2 leads needed" },
    { key: "follower_only", label: "No · pure-follower round" },
    { key: "party", label: "Party round" },
]

const CLOSE_STYLE_CHIPS: Array<{ key: CloseStyle; label: string }> = [
    { key: "rolling", label: "Rolling (close as commits land)" },
    { key: "single_close", label: "Single close (wait for all)" },
]

const INSTRUMENT_SHORT: Record<Instrument, string> = {
    safe_post: "SAFE",
    safe_pre: "SAFE",
    priced: "Priced",
    convertible: "Convertible",
    asa: "ASA",
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Parse a user-typed money field ("£800,000" / "800000") to a number. */
function parseMoney(raw: string): number | null {
    const cleaned = raw.replace(/[^\d.]/g, "")
    if (cleaned.length === 0) return null
    const n = Number(cleaned)
    return Number.isFinite(n) && n > 0 ? n : null
}

/** Format a number as a short money label — £800k / £4m — for the preview. */
function formatShortMoney(value: number | null, symbol: string): string {
    if (value == null) return `${symbol}—`
    if (value >= 1_000_000) {
        const m = value / 1_000_000
        const trimmed = m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)
        return `${symbol}${trimmed}m`
    }
    if (value >= 1_000) {
        const k = Math.round(value / 1_000)
        return `${symbol}${k}k`
    }
    return `${symbol}${value.toFixed(0)}`
}

/** Days-between-now-and-date rounded to whole weeks (min 0). */
function weeksUntil(iso: string): number | null {
    if (!iso) return null
    const target = new Date(iso)
    if (Number.isNaN(target.getTime())) return null
    const now = new Date()
    const days = Math.max(0, Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    return Math.max(0, Math.round(days / 7))
}

// ─── View ───────────────────────────────────────────────────────────────

export function RoundsNewView(): React.ReactElement {
    // ── Form state (local only — no mutation wired) ─────────────────────
    const [roundName, setRoundName] = useState("Pre-seed · Summer 2026")
    const [stage, setStage] = useState<Stage>("pre_seed_thesis")
    const [targetRaw, setTargetRaw] = useState("£800,000")
    const [currency, setCurrency] = useState<Currency>("GBP")
    const [closeDate, setCloseDate] = useState("2026-07-26")
    const [instrument, setInstrument] = useState<Instrument>("safe_post")
    const [capRaw, setCapRaw] = useState("£4,000,000")
    const [discountRaw, setDiscountRaw] = useState("20%")
    const [chequeMinRaw, setChequeMinRaw] = useState("£25,000")
    const [chequeMaxRaw, setChequeMaxRaw] = useState("£400,000")
    const [leadStructure, setLeadStructure] = useState<LeadStructure>("open_to_leads")
    const [closeStyle, setCloseStyle] = useState<CloseStyle>("rolling")
    const [syndicateNarrative, setSyndicateNarrative] = useState(
        "Target: 1 agri-tech lead (£250–£400k), 2 hardware-generalist partners, and 3–5 angel operators. We want operator perspective on supply chain given our manufacturing plans.",
    )
    const [saveState, setSaveState] = useState<"idle" | "saved">("idle")

    const currencySymbol = useMemo(
        () => CURRENCY_OPTIONS.find((c) => c.key === currency)?.symbol ?? "£",
        [currency],
    )
    const target = useMemo(() => parseMoney(targetRaw), [targetRaw])
    const cap = useMemo(() => parseMoney(capRaw), [capRaw])
    const weeks = useMemo(() => weeksUntil(closeDate), [closeDate])
    const instrumentShort = INSTRUMENT_SHORT[instrument]

    // Math check — target ÷ £60k avg cheque. Mockup hardcodes the avg; keep it
    // honest by labelling it as the assumption, not a computed value.
    const AVG_CHEQUE = 60_000
    const cheques = useMemo(() => {
        if (target == null) return null
        return Math.max(1, Math.ceil(target / AVG_CHEQUE))
    }, [target])

    const leadLabel = useMemo(() => {
        if (leadStructure === "open_to_leads") return "looking for 1–2 leads"
        if (leadStructure === "follower_only") return "pure-follower round"
        return "party round"
    }, [leadStructure])

    const closeLabel = closeStyle === "rolling" ? "rolling close" : "single close"

    const handleSaveDraft = (): void => {
        setSaveState("saved")
    }

    const handleCreate = (): void => {
        setSaveState("saved")
    }

    return (
        <div className="rnd2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="rnd2-breadcrumb">
                <Link href="/money/cockpit">Money</Link>
                <span className="sep">›</span>
                <Link href="/money/raise">Raise</Link>
                <span className="sep">›</span>
                <span className="current">Create round</span>
            </div>

            {/* ── Header card ─────────────────────────── */}
            <div className="rnd2-head">
                <h1>
                    <span className="rnd2-title-dot" aria-hidden="true" />
                    Create your {stage === "seed" ? "seed" : stage === "series_a" ? "Series A" : stage === "bridge" ? "bridge" : "pre-seed"} round
                </h1>
                <div className="sub">
                    A round defines the target you&apos;re raising against. The pipeline, verbal +
                    committed totals, and investor-update templates are all anchored to it. Takes 2
                    minutes.
                </div>
            </div>

            {/* ── 1. The basics ───────────────────────── */}
            <div className="rnd2-section">
                <h3>The basics</h3>
                <div className="section-sub">
                    Defaults inferred from your thesis (stage: pre-seed). Edit if different.
                </div>

                <div className="fld two">
                    <div>
                        <label htmlFor="rnd2-name">
                            Round name <span className="req">*</span>
                        </label>
                        <input
                            id="rnd2-name"
                            type="text"
                            value={roundName}
                            onChange={(e) => setRoundName(e.target.value)}
                        />
                        <div className="hint">
                            Internal label · appears in Raise header and investor updates.
                        </div>
                    </div>
                    <div>
                        <label htmlFor="rnd2-stage">
                            Stage <span className="req">*</span>
                        </label>
                        <select
                            id="rnd2-stage"
                            value={stage}
                            onChange={(e) => setStage(e.target.value as Stage)}
                        >
                            {STAGE_OPTIONS.map((s) => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="fld">
                    <label htmlFor="rnd2-target">
                        Target amount <span className="req">*</span>
                    </label>
                    <input
                        id="rnd2-target"
                        type="text"
                        value={targetRaw}
                        onChange={(e) => setTargetRaw(e.target.value)}
                        className="xl"
                    />
                    <div className="hint">
                        What you&apos;re raising. Pipeline progress will show against this.
                    </div>
                </div>

                <div className="fld two">
                    <div>
                        <label htmlFor="rnd2-currency">Currency</label>
                        <select
                            id="rnd2-currency"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value as Currency)}
                        >
                            {CURRENCY_OPTIONS.map((c) => (
                                <option key={c.key} value={c.key}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="rnd2-close">
                            Target close date <span className="req">*</span>
                        </label>
                        <input
                            id="rnd2-close"
                            type="date"
                            value={closeDate}
                            onChange={(e) => setCloseDate(e.target.value)}
                        />
                        <div className="hint">
                            {weeks != null
                                ? `"${weeks} weeks to close" counter starts now.`
                                : "Pick a date to start the \"weeks to close\" counter."}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 2. Instrument & terms ──────────────── */}
            <div className="rnd2-section">
                <h3>Instrument &amp; terms</h3>
                <div className="section-sub">
                    Primary instrument for this round. Leo (legal) will use these when drafting
                    SAFEs/agreements per investor.
                </div>

                <div className="fld">
                    <label>
                        Primary instrument <span className="req">*</span>
                    </label>
                    <div className="rnd2-chip-pick">
                        {INSTRUMENT_CHIPS.map((chip) => (
                            <button
                                key={chip.key}
                                type="button"
                                className={`rnd2-cp ${instrument === chip.key ? "active" : ""}`}
                                onClick={() => setInstrument(chip.key)}
                                aria-pressed={instrument === chip.key}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="fld two">
                    <div>
                        <label htmlFor="rnd2-cap">
                            Valuation cap <span className="req">*</span>
                        </label>
                        <input
                            id="rnd2-cap"
                            type="text"
                            value={capRaw}
                            onChange={(e) => setCapRaw(e.target.value)}
                        />
                        <div className="hint">
                            SAFE-style cap. Investor below cap = they win if you raise higher.
                        </div>
                    </div>
                    <div>
                        <label htmlFor="rnd2-discount">
                            Discount <span className="opt">if convertible</span>
                        </label>
                        <input
                            id="rnd2-discount"
                            type="text"
                            value={discountRaw}
                            onChange={(e) => setDiscountRaw(e.target.value)}
                        />
                        <div className="hint">Applies if next priced round &lt; cap.</div>
                    </div>
                </div>

                <div className="fld two">
                    <div>
                        <label htmlFor="rnd2-cheque-min">Minimum cheque</label>
                        <input
                            id="rnd2-cheque-min"
                            type="text"
                            value={chequeMinRaw}
                            onChange={(e) => setChequeMinRaw(e.target.value)}
                        />
                        <div className="hint">
                            Below this we don&apos;t engage. Filters the pipeline.
                        </div>
                    </div>
                    <div>
                        <label htmlFor="rnd2-cheque-max">Maximum single cheque</label>
                        <input
                            id="rnd2-cheque-max"
                            type="text"
                            value={chequeMaxRaw}
                            onChange={(e) => setChequeMaxRaw(e.target.value)}
                        />
                        <div className="hint">
                            Biggest single allocation. Used to suggest cap sizing.
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 3. Structure & policy ──────────────── */}
            <div className="rnd2-section">
                <h3>Structure &amp; policy</h3>

                <div className="fld two">
                    <div>
                        <label>Are you looking for a lead?</label>
                        <div className="rnd2-chip-pick">
                            {LEAD_CHIPS.map((chip) => (
                                <button
                                    key={chip.key}
                                    type="button"
                                    className={`rnd2-cp ${leadStructure === chip.key ? "active" : ""}`}
                                    onClick={() => setLeadStructure(chip.key)}
                                    aria-pressed={leadStructure === chip.key}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label>Close style</label>
                        <div className="rnd2-chip-pick">
                            {CLOSE_STYLE_CHIPS.map((chip) => (
                                <button
                                    key={chip.key}
                                    type="button"
                                    className={`rnd2-cp ${closeStyle === chip.key ? "active" : ""}`}
                                    onClick={() => setCloseStyle(chip.key)}
                                    aria-pressed={closeStyle === chip.key}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="fld">
                    <label htmlFor="rnd2-syndicate">
                        Your ideal syndicate <span className="opt">narrative</span>
                    </label>
                    <textarea
                        id="rnd2-syndicate"
                        rows={4}
                        value={syndicateNarrative}
                        onChange={(e) => setSyndicateNarrative(e.target.value)}
                    />
                    <div className="hint">
                        Shown in investor updates and as a Fiona reference when prioritising the
                        pipeline.
                    </div>
                </div>
            </div>

            {/* ── 4. Preview ─────────────────────────── */}
            <div className="rnd2-section">
                <h3>Preview</h3>
                <div className="section-sub">
                    The raise header will look like this when you land on Raise.
                </div>

                <div className="rnd2-preview-card">
                    <div className="kicker">Active round</div>
                    <div className="headline">
                        {stage === "seed"
                            ? "Seed"
                            : stage === "series_a"
                                ? "Series A"
                                : stage === "bridge"
                                    ? "Bridge"
                                    : "Pre-seed"}
                        {" · "}
                        {formatShortMoney(target, currencySymbol)}
                        <small>
                            {instrumentShort}
                            {cap != null ? ` · ${formatShortMoney(cap, currencySymbol)} cap` : ""}
                        </small>
                    </div>
                    <div className="meta">
                        {weeks != null ? `${weeks} weeks to close` : "Pick a close date"} · {leadLabel} ·{" "}
                        {closeLabel}
                    </div>
                </div>

                <div className="rnd2-math">
                    <strong>Math check · based on target + avg cheque (assumption)</strong>
                    <div className="eq">
                        {formatShortMoney(target, currencySymbol)} target ÷{" "}
                        {formatShortMoney(AVG_CHEQUE, currencySymbol)} avg cheque ≈{" "}
                        <strong>{cheques != null ? `${cheques} cheques` : "— cheques"}</strong>{" "}
                        needed
                    </div>
                    <span className="big">
                        {cheques != null ? `${cheques} commitments to close` : "— commitments to close"}
                    </span>
                    We&apos;ll suggest adding ~
                    {cheques != null ? `${Math.round(cheques * 1.5)}–${Math.round(cheques * 1.75)}` : "—"}{" "}
                    investors to your pipeline (1.5x cover for drop-off).
                </div>
            </div>

            {/* ── 5. Action footer ───────────────────── */}
            <div className="rnd2-footer">
                <div className="note">
                    {saveState === "saved"
                        ? "Saved locally · persistence wires up when the investor_round migration lands."
                        : "Round will become the active round on Raise · previous round (if any) archives to history."}
                </div>
                <div className="actions">
                    <Link href="/money/raise" className="rnd2-btn ghost">
                        Cancel
                    </Link>
                    <button
                        type="button"
                        className="rnd2-btn ghost"
                        onClick={handleSaveDraft}
                        disabled={saveState === "saved"}
                    >
                        {saveState === "saved" ? "Saved locally" : "Save as draft"}
                    </button>
                    <button
                        type="button"
                        className="rnd2-btn primary"
                        onClick={handleCreate}
                        disabled={saveState === "saved"}
                    >
                        {saveState === "saved" ? "Saved locally" : "Create round →"}
                    </button>
                </div>
            </div>
        </div>
    )
}
