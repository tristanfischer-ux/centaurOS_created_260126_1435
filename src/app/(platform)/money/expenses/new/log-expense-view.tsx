/**
 * LogExpenseView — /money/expenses/new, mockup-faithful port of
 * MONEY-MOCKUP-LOG-EXPENSE.html. Scoped to `.lex2`.
 *
 * Port strategy (top-to-bottom per mockup):
 *   1. Breadcrumb: Money › Cockpit › Log expense
 *   2. Page-head (qa-head): orange title-dot + "Log an expense" + sub copy
 *   3. 2/3 grid:
 *        LEFT  — form sections: What was it? · Category · Receipt · Extras
 *        RIGHT — rail cards:    What happens on save · Recent expenses ·
 *                               Keyboard shortcut
 *   4. Footer action bar: readiness message + Cancel / Save & add another /
 *                         Save expense (all disabled until persistence lands)
 *
 * Data contract (what persists today):
 *   - Nothing. `money_transactions` does not yet exist in the schema
 *     (verified via `grep money_transactions src/types/database.types.ts`).
 *     Per the brief's else-branch ("stub with honest banner"), the form is
 *     fully interactive locally but the submit path surfaces a
 *     "not yet saved — persistence wires up next round" banner. No fake
 *     success toast, no fabricated "Recent expenses" — that list is empty
 *     with honest copy.
 *
 * Banned patterns avoided:
 *   - No fabricated `recent expenses` rows (mockup shows 4 seeded ones;
 *     those are demo data — rendering them would be fake per
 *     feedback_only_real_supabase_data.md).
 *   - No success toast that pretends the expense was logged.
 *   - No paraphrased copy — the mockup's hint lines are carried through
 *     verbatim where they were specific.
 */

"use client"

import Link from "next/link"
import { useCallback, useState } from "react"

import "./log-expense-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

type CategoryKey = "people" | "premises" | "tools" | "materials" | "growth" | "other"

interface CategoryOption {
    key: CategoryKey
    label: string
}

type PaidFromValue =
    | "amex_business"
    | "natwest_current"
    | "personal"
    | "cash"

interface PaidFromOption {
    value: PaidFromValue
    label: string
}

type ProjectAllocationValue =
    | "none"
    | "nimfarm_deployment"
    | "prototype_iteration"
    | "rd_general"

interface ProjectAllocationOption {
    value: ProjectAllocationValue
    label: string
}

// ─── Copy constants (from mockup) ───────────────────────────────────────

const CATEGORY_OPTIONS: ReadonlyArray<CategoryOption> = [
    { key: "people", label: "People" },
    { key: "premises", label: "Premises" },
    { key: "tools", label: "Tools" },
    { key: "materials", label: "Materials" },
    { key: "growth", label: "Growth" },
    { key: "other", label: "Other" },
]

// Founder's own accounts — placeholder labels match the mockup but the
// values are opaque enum strings, not bank details. When the
// money_transactions table ships these will come from
// `money_settings.connected_accounts` (not a column today).
const PAID_FROM_OPTIONS: ReadonlyArray<PaidFromOption> = [
    { value: "amex_business", label: "Amex business · ••3421" },
    { value: "natwest_current", label: "NatWest current · ••7789" },
    { value: "personal", label: "Personal (reimbursement)" },
    { value: "cash", label: "Cash" },
]

const PROJECT_ALLOCATION_OPTIONS: ReadonlyArray<ProjectAllocationOption> = [
    { value: "none", label: "None (overhead)" },
    { value: "nimfarm_deployment", label: "NimFarm deployment" },
    { value: "prototype_iteration", label: "Prototype iteration" },
    { value: "rd_general", label: "General R&D" },
]

const DEFAULT_DATE = (): string => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

/** Parse the amount input (accepts £320, £320.00, 320, 320.00) into pence. */
function parseAmountPence(raw: string): number | null {
    const cleaned = raw.replace(/[£,\s]/g, "").trim()
    if (!cleaned) return null
    const value = Number(cleaned)
    if (!Number.isFinite(value)) return null
    if (value < 0) return null
    return Math.round(value * 100)
}

// ─── View ───────────────────────────────────────────────────────────────

export function LogExpenseView(): React.ReactElement {
    // ── Form state (local only — no persistence wired) ────────────────
    const [amount, setAmount] = useState("")
    const [description, setDescription] = useState("")
    const [date, setDate] = useState<string>(() => DEFAULT_DATE())
    const [vendor, setVendor] = useState("")
    const [category, setCategory] = useState<CategoryKey>("materials")
    const [paidFrom, setPaidFrom] = useState<PaidFromValue>("amex_business")
    const [projectAllocation, setProjectAllocation] =
        useState<ProjectAllocationValue>("none")
    const [notes, setNotes] = useState("")
    const [submitAttempted, setSubmitAttempted] = useState(false)
    const [submitBannerOpen, setSubmitBannerOpen] = useState(false)

    const amountPence = parseAmountPence(amount)
    const isAmountValid = amountPence !== null && amountPence > 0
    const isDescriptionValid = description.trim().length > 0
    const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(date)
    const isFormValid = isAmountValid && isDescriptionValid && isDateValid

    const handleSubmit = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            setSubmitAttempted(true)
            if (!isFormValid) return
            // GOTCHA: persistence intentionally not wired — the
            // `money_transactions` table doesn't exist yet. Surface the
            // honest banner so the founder sees exactly why the submit is
            // a no-op. When the migration lands, swap this for a server
            // action call + redirect to /money/cockpit.
            setSubmitBannerOpen(true)
        },
        [isFormValid],
    )

    const largeExpenseFlagged =
        isAmountValid && amountPence !== null && amountPence > 50_000

    return (
        <div className="lex2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="lex2-page-head">
                <nav className="lex2-crumbs" aria-label="Breadcrumb">
                    <Link href="/money">Money</Link>
                    <span className="sep" aria-hidden="true">
                        ›
                    </span>
                    <Link href="/money">Cockpit</Link>
                    <span className="sep" aria-hidden="true">
                        ›
                    </span>
                    <span className="current">Log expense</span>
                </nav>
                <div className="lex2-ctx-chips">
                    <Link href="/money" className="lex2-btn sm">
                        ← Cancel
                    </Link>
                </div>
            </div>

            {/* ── Preview banner (honest: not yet persisting) ─── */}
            <div className="lex2-preview-banner" role="status">
                <strong>Preview</strong>
                <span>
                    This form lays out the log-expense flow. Saving wires up
                    with the <code>money_transactions</code> migration next
                    round — nothing is persisted yet. The form validates
                    locally so the shape is right for pickup.
                </span>
            </div>

            {/* ── Page head (qa-head in mockup) ──────── */}
            <div className="lex2-head">
                <h1>
                    <span className="lex2-title-dot" aria-hidden="true" />
                    Log an expense
                </h1>
                <div className="lex2-sub">
                    One-off cost that isn&apos;t in your Plan. Appears in
                    Cockpit movers and (once Xero is connected) pushes to
                    Xero as a Spend Money transaction.
                </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
                <div className="lex2-grid">
                    {/* ═════ LEFT COLUMN — FORM ══════════════ */}
                    <div>
                        {/* ── 1. What was it? ──────────────── */}
                        <section className="lex2-form-section">
                            <h3>What was it?</h3>

                            <div className="lex2-fld">
                                <label htmlFor="lex2-amount">
                                    Amount
                                    <span className="req" aria-hidden="true">
                                        *
                                    </span>
                                </label>
                                <input
                                    id="lex2-amount"
                                    className="lex2-amount-input"
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    placeholder="£0.00"
                                    value={amount}
                                    onChange={(e) =>
                                        setAmount(e.target.value)
                                    }
                                    aria-invalid={
                                        submitAttempted && !isAmountValid
                                    }
                                    aria-describedby="lex2-amount-hint"
                                    required
                                />
                                <div id="lex2-amount-hint" className="hint">
                                    Number + currency. Multi-currency ok
                                    (EUR, USD, etc); we&apos;ll convert
                                    using the day&apos;s rate once the FX
                                    table lands.
                                </div>
                                {submitAttempted && !isAmountValid && (
                                    <div className="lex2-err" role="alert">
                                        Enter an amount greater than zero.
                                    </div>
                                )}
                            </div>

                            <div className="lex2-fld">
                                <label htmlFor="lex2-description">
                                    Description
                                    <span className="req" aria-hidden="true">
                                        *
                                    </span>
                                </label>
                                <input
                                    id="lex2-description"
                                    type="text"
                                    placeholder='e.g. "Rework connector mockup — McMaster-Carr"'
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    aria-invalid={
                                        submitAttempted && !isDescriptionValid
                                    }
                                    aria-describedby="lex2-description-hint"
                                    required
                                />
                                <div
                                    id="lex2-description-hint"
                                    className="hint"
                                >
                                    Short · specific · shows in Cockpit and
                                    in Xero memo.
                                </div>
                                {submitAttempted && !isDescriptionValid && (
                                    <div className="lex2-err" role="alert">
                                        Describe what this expense was for.
                                    </div>
                                )}
                            </div>

                            <div className="lex2-fld two">
                                <div>
                                    <label htmlFor="lex2-date">
                                        Date
                                        <span
                                            className="req"
                                            aria-hidden="true"
                                        >
                                            *
                                        </span>
                                    </label>
                                    <input
                                        id="lex2-date"
                                        type="date"
                                        value={date}
                                        onChange={(e) =>
                                            setDate(e.target.value)
                                        }
                                        aria-invalid={
                                            submitAttempted && !isDateValid
                                        }
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="lex2-vendor">
                                        Vendor
                                        <span className="opt">
                                            Useful for recurring reports
                                        </span>
                                    </label>
                                    <input
                                        id="lex2-vendor"
                                        type="text"
                                        placeholder="e.g. McMaster-Carr"
                                        value={vendor}
                                        onChange={(e) =>
                                            setVendor(e.target.value)
                                        }
                                    />
                                </div>
                            </div>
                        </section>

                        {/* ── 2. Category ──────────────────── */}
                        <section className="lex2-form-section">
                            <h3>Category</h3>
                            <div className="section-sub">
                                6 founder buckets. Determines where it
                                rolls up in Plan and P&amp;L.
                            </div>
                            <div
                                className="lex2-cat-grid"
                                role="radiogroup"
                                aria-label="Expense category"
                            >
                                {CATEGORY_OPTIONS.map((opt) => {
                                    const on = category === opt.key
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            className={`lex2-cat-opt${on ? " active" : ""}`}
                                            onClick={() => setCategory(opt.key)}
                                        >
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="lex2-tag-hint">
                                Accounting tag auto-suggests once the
                                vendor-to-tag map lands. For now pick the
                                bucket manually.
                            </div>
                        </section>

                        {/* ── 3. Receipt ──────────────────── */}
                        <section className="lex2-form-section">
                            <h3>
                                Receipt
                                <span className="section-subtle">
                                    · optional but helps at tax time
                                </span>
                            </h3>
                            <div
                                className="lex2-receipt-drop"
                                aria-disabled="true"
                                title="Receipt upload + OCR wires in next round"
                            >
                                <div
                                    className="icon"
                                    aria-hidden="true"
                                >
                                    ⬆
                                </div>
                                <div>
                                    <strong>
                                        Drop receipt image/PDF
                                    </strong>
                                </div>
                                <div className="sub">
                                    Or <span className="browse">browse</span>{" "}
                                    · photo from phone also works once the
                                    receipt-OCR job lands.
                                </div>
                            </div>
                        </section>

                        {/* ── 4. Extras ─────────────────────── */}
                        <section className="lex2-form-section">
                            <h3>
                                Extras
                                <span className="section-subtle">
                                    · optional
                                </span>
                            </h3>
                            <div className="lex2-fld two">
                                <div>
                                    <label htmlFor="lex2-paid-from">
                                        Paid from
                                    </label>
                                    <select
                                        id="lex2-paid-from"
                                        value={paidFrom}
                                        onChange={(e) =>
                                            setPaidFrom(
                                                e.target
                                                    .value as PaidFromValue,
                                            )
                                        }
                                    >
                                        {PAID_FROM_OPTIONS.map((opt) => (
                                            <option
                                                key={opt.value}
                                                value={opt.value}
                                            >
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="hint">
                                        If &quot;Personal&quot;, creates a
                                        reimbursement record once the
                                        reimbursement flow ships.
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="lex2-project">
                                        Project allocation
                                    </label>
                                    <select
                                        id="lex2-project"
                                        value={projectAllocation}
                                        onChange={(e) =>
                                            setProjectAllocation(
                                                e.target
                                                    .value as ProjectAllocationValue,
                                            )
                                        }
                                    >
                                        {PROJECT_ALLOCATION_OPTIONS.map(
                                            (opt) => (
                                                <option
                                                    key={opt.value}
                                                    value={opt.value}
                                                >
                                                    {opt.label}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                    <div className="hint">
                                        Project list populates from
                                        decomposed projects once the Plan
                                        ↔ project link lands.
                                    </div>
                                </div>
                            </div>
                            <div className="lex2-fld">
                                <label htmlFor="lex2-notes">
                                    Notes
                                    <span className="opt">
                                        Context for future-you
                                    </span>
                                </label>
                                <textarea
                                    id="lex2-notes"
                                    rows={3}
                                    placeholder="Anything a future reader would want to know. e.g. why this was needed, how it connects to a pilot or test."
                                    value={notes}
                                    onChange={(e) =>
                                        setNotes(e.target.value)
                                    }
                                />
                            </div>
                        </section>
                    </div>

                    {/* ═════ RIGHT COLUMN — RAIL ═══════════ */}
                    <div>
                        {/* ── What happens on save ─────────── */}
                        <aside className="lex2-rail-card">
                            <div className="rc-head">
                                What happens on save
                            </div>
                            <div className="rc-body">
                                <div>
                                    ✓ Cockpit updates · burn this month
                                    rises by the amount entered
                                </div>
                                <div>
                                    ✓ Pushed to Xero as Spend Money (once
                                    Xero is connected)
                                </div>
                                <div>
                                    ✓ Flagged in next variance if a
                                    pattern repeats
                                </div>
                                <div>
                                    ✓ Receipt OCR&apos;d and cross-checked
                                    against the amount entered (receipt
                                    upload wires in next round)
                                </div>
                                <div>
                                    ✓ If over £500, prompts co-founder
                                    awareness per policy
                                </div>
                            </div>
                        </aside>

                        {/* ── Recent expenses · honest empty ─ */}
                        <aside className="lex2-rail-card">
                            <div className="rc-head">
                                Recent expenses · last 7 days
                            </div>
                            <div className="rc-body">
                                <div className="lex2-empty">
                                    No expenses logged yet on this
                                    foundry. Once the
                                    <code> money_transactions</code> table
                                    ships, the last seven days of
                                    submissions appear here.
                                </div>
                            </div>
                        </aside>

                        {/* ── Keyboard shortcut ────────────── */}
                        <aside className="lex2-rail-card">
                            <div className="rc-head">Keyboard shortcut</div>
                            <div className="rc-body muted">
                                Press <kbd>⌘E</kbd> anywhere in Money to
                                open this page (shortcut wires in once the
                                Money command palette lands).
                            </div>
                        </aside>
                    </div>
                </div>

                {/* ── Submit "banner" if the user hits save ─ */}
                {submitBannerOpen && (
                    <div
                        className="lex2-submit-notice"
                        role="status"
                        aria-live="polite"
                    >
                        <strong>Not saved yet.</strong> The{" "}
                        <code>money_transactions</code> table hasn&apos;t
                        shipped — everything you entered is valid, but
                        there&apos;s nowhere to store it today. When the
                        migration lands this button will write the row and
                        bounce you back to the Cockpit.
                        <button
                            type="button"
                            className="lex2-submit-notice-close"
                            onClick={() => setSubmitBannerOpen(false)}
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* ── Footer action bar ─────────────────── */}
                <div className="lex2-action-bar">
                    <div className="lex2-action-status">
                        {isFormValid
                            ? largeExpenseFlagged
                                ? "Ready to save · amount over £500 will prompt co-founder awareness once the policy rule lands."
                                : "Ready to save · fields look good."
                            : "Amount, description, and date are required."}
                    </div>
                    <div className="lex2-action-buttons">
                        <Link href="/money" className="lex2-btn">
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            className="lex2-btn"
                            disabled={!isFormValid}
                            title="Persistence wires up with the money_transactions migration"
                        >
                            Save &amp; add another
                        </button>
                        <button
                            type="submit"
                            className="lex2-btn primary"
                            disabled={!isFormValid}
                            title="Persistence wires up with the money_transactions migration"
                        >
                            Save expense →
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )
}
