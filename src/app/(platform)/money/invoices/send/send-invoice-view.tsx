/**
 * SendInvoiceView — Money · Send invoice (V2, mockup-faithful).
 *
 * Mockup-faithful DOM ported from MONEY-MOCKUP-SEND-INVOICE.html. Scoped to
 * `.inv2`. Quick-send invoice form — pairs a branded PDF with a hosted
 * Stripe payment link so recipients can pay in one click, and pushes to
 * Xero when the integration is connected.
 *
 * Interaction contract (V1 preview):
 *   - Recipient + line items + payment block are fully interactive form
 *     state. Live totals recompute as the user edits quantity / unit
 *     price / VAT on the single line (matches the mockup which shows
 *     one line + an "Add line" affordance).
 *   - Stripe payment-link toggle flips visual state only — nothing is
 *     wired to Stripe yet.
 *   - Action buttons (Send · Save draft · Download PDF · Cancel) render
 *     honest previews — they persist the draft to `localStorage` under
 *     `forge-v2:money:send-invoice:draft` and toast an honest "wires up
 *     next round" message. Never pretend we sent.
 *   - Live preview email on the right rail mirrors the form state so the
 *     founder can read what the recipient will see.
 *
 * Empty-state policy (per feedback_only_real_supabase_data.md):
 *   - The "Outstanding · from <customer>" rail card accepts real rows as
 *     props. When the caller has none (no invoice integration wired yet),
 *     the view renders honest "No outstanding invoices on record" copy —
 *     never the mockup's seeded "Inv 2026-038 · 7 days overdue" row.
 *   - Existing customers + past invoices autocomplete is deferred (typing
 *     is free-form until the Xero integration lands).
 *
 * Banned mockup specifics we do NOT render as live data:
 *   - Fake outstanding invoice numbers / overdue flags
 *   - Pre-filled NimFarm / Sasha / accounts@ recipient (mockup copy only)
 *   - The seeded £5,000 milestone description
 *   - Pay-link URL with a fake invoice number
 *   All of these are placeholder text the founder can type over — the
 *   preview frame renders their own input verbatim.
 *
 * Sections (top to bottom, matching the mockup 1:1):
 *   1. Breadcrumb — Money › Cockpit › Send invoice
 *   2. Preview banner — honest state of what wires up today
 *   3. QA head (hero title + subhead, orange title dot)
 *   4. Two-column grid
 *      a. Left: Recipient → Line items → Payment form sections
 *      b. Right: Preview email → When you send → Outstanding rail cards
 *   5. Action bar — summary + Cancel · Save draft · Download PDF · Send
 */

"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import "./send-invoice-v2.css"

// ─── Local draft persistence ───────────────────────────────────────────
//
// DECISION: persist the draft to localStorage so the founder doesn't lose
// what they've typed when they tab away. A server-side drafts row is the
// proper home once the invoice-send mutation lands; until then this is
// the only honest way to say "Save draft" and mean it.
const DRAFT_STORAGE_KEY = "forge-v2:money:send-invoice:draft"

interface PersistedDraft {
    customer: string
    recipientEmail: string
    ccRecipients: string
    description: string
    quantity: string
    unitPrice: string
    vatRate: VatRate
    dueDate: string
    stripeEnabled: boolean
    note: string
    savedAt: string
}

// ─── Types ─────────────────────────────────────────────────────────────

export type VatRate = "20" | "5" | "0" | "exempt"

/**
 * One outstanding invoice from the chosen customer — rendered in the
 * right-rail "Outstanding" card. `null` array means "no integration" and
 * the card renders the honest empty-state copy.
 */
export interface OutstandingInvoice {
    /** Stable key — Xero or internal invoice id. */
    id: string
    /** Display reference — "Inv 2026-038". */
    reference: string
    /** Pre-formatted amount label, e.g. "£5,000". */
    amountLabel: string
    /** Status hint rendered after the amount, e.g. "7 days overdue" or "paid". */
    statusLabel: string
    /** Tone for the status hint — warning = overdue, neutral = paid/on-time. */
    tone: "warning" | "neutral"
}

export interface SendInvoiceViewProps {
    /**
     * Sender's trading entity — seeds the preview "From" block. Null when
     * no foundry name on record → preview shows "Your business".
     */
    senderOrgName: string | null
    /**
     * Next invoice reference for preview. Null until numbering wires up;
     * preview shows "Invoice —" as a neutral placeholder.
     */
    nextInvoiceReference: string | null
    /**
     * Whether Xero is connected for this foundry. Drives the "Xero invoice
     * created" checklist line in the right rail.
     */
    xeroConnected: boolean
    /**
     * Whether a Stripe payment account is connected. When false, the
     * payment-link toggle still visually flips but the toast makes clear
     * Stripe connection is required.
     */
    stripeConnected: boolean
    /**
     * Outstanding invoices from the currently-typed customer. `null`
     * means the lookup isn't wired yet (no integration) and the rail
     * shows the honest empty-state copy. `[]` means the lookup ran and
     * the customer has nothing outstanding.
     */
    outstandingInvoices: OutstandingInvoice[] | null
}

// ─── View ──────────────────────────────────────────────────────────────

export function SendInvoiceView(props: SendInvoiceViewProps): React.ReactElement {
    const {
        senderOrgName,
        nextInvoiceReference,
        xeroConnected,
        stripeConnected,
        outstandingInvoices,
    } = props

    const [customer, setCustomer] = useState<string>("")
    const [recipientEmail, setRecipientEmail] = useState<string>("")
    const [ccRecipients, setCcRecipients] = useState<string>("")
    const [description, setDescription] = useState<string>("")
    const [quantity, setQuantity] = useState<string>("1")
    const [unitPrice, setUnitPrice] = useState<string>("")
    const [vatRate, setVatRate] = useState<VatRate>("20")
    const [dueDate, setDueDate] = useState<string>(() => defaultDueDateIso())
    const [stripeEnabled, setStripeEnabled] = useState<boolean>(true)
    const [note, setNote] = useState<string>("")
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

    // Rehydrate the local draft on mount so nothing is lost when tabbing
    // away. Runs client-only.
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
            if (!raw) return
            const parsed = JSON.parse(raw) as PersistedDraft
            if (typeof parsed !== "object" || parsed === null) return
            if (typeof parsed.customer === "string") setCustomer(parsed.customer)
            if (typeof parsed.recipientEmail === "string") setRecipientEmail(parsed.recipientEmail)
            if (typeof parsed.ccRecipients === "string") setCcRecipients(parsed.ccRecipients)
            if (typeof parsed.description === "string") setDescription(parsed.description)
            if (typeof parsed.quantity === "string") setQuantity(parsed.quantity)
            if (typeof parsed.unitPrice === "string") setUnitPrice(parsed.unitPrice)
            if (isVatRate(parsed.vatRate)) setVatRate(parsed.vatRate)
            if (typeof parsed.dueDate === "string") setDueDate(parsed.dueDate)
            if (typeof parsed.stripeEnabled === "boolean") setStripeEnabled(parsed.stripeEnabled)
            if (typeof parsed.note === "string") setNote(parsed.note)
            if (typeof parsed.savedAt === "string") setLastSavedAt(parsed.savedAt)
        } catch (err) {
            // Don't block the page on a corrupt draft — just log.
            console.warn("[SEND-INVOICE] failed to rehydrate local draft:", err)
        }
    }, [])

    // ── Live totals ────────────────────────────────────────────────
    const { subtotalPence, vatPence, totalPence } = useMemo(() => {
        const qty = parseNumber(quantity)
        const unit = parseNumber(unitPrice)
        const gross = qty * unit
        const subP = Math.round(gross * 100)
        const pct = vatPercent(vatRate)
        const vP = Math.round((subP * pct) / 100)
        return { subtotalPence: subP, vatPence: vP, totalPence: subP + vP }
    }, [quantity, unitPrice, vatRate])

    const subtotalLabel = formatGBP(subtotalPence)
    const vatLabel = formatGBP(vatPence)
    const totalLabel = formatGBP(totalPence)

    const collectDraft = useCallback(
        (): PersistedDraft => ({
            customer,
            recipientEmail,
            ccRecipients,
            description,
            quantity,
            unitPrice,
            vatRate,
            dueDate,
            stripeEnabled,
            note,
            savedAt: new Date().toISOString(),
        }),
        [
            customer,
            recipientEmail,
            ccRecipients,
            description,
            quantity,
            unitPrice,
            vatRate,
            dueDate,
            stripeEnabled,
            note,
        ],
    )

    const handleSaveDraft = useCallback((): boolean => {
        if (typeof window === "undefined") return false
        const hasContent =
            customer.trim().length > 0 ||
            recipientEmail.trim().length > 0 ||
            description.trim().length > 0 ||
            unitPrice.trim().length > 0
        if (!hasContent) {
            toast.error("Nothing to save yet — add a customer or a line first.")
            return false
        }
        const payload = collectDraft()
        try {
            window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
            setLastSavedAt(payload.savedAt)
            toast.success("Draft saved to this browser.")
            return true
        } catch (err) {
            console.error("[SEND-INVOICE] failed to save draft:", err)
            toast.error("Could not save the draft locally — check browser storage.")
            return false
        }
    }, [customer, recipientEmail, description, unitPrice, collectDraft])

    const handleSend = useCallback(() => {
        handleSaveDraft()
        toast("Invoice delivery wires up next round — your draft is saved locally.", {
            description:
                "Stripe payment-link creation, Xero sales-invoice push, and email send land with the finance integration.",
        })
    }, [handleSaveDraft])

    const handleDownloadPdf = useCallback(() => {
        handleSaveDraft()
        toast("PDF export wires up next round.", {
            description: "Draft is saved locally until the PDF builder lands.",
        })
    }, [handleSaveDraft])

    const handleStripeToggle = useCallback(() => {
        setStripeEnabled((prev) => {
            const next = !prev
            if (next && !stripeConnected) {
                toast("Stripe isn't connected yet — toggle is visual only.", {
                    description:
                        "Connect Stripe under Settings to enable one-click payment links. Draft preference is saved locally.",
                })
            }
            return next
        })
    }, [stripeConnected])

    const customerLabel = customer.trim().length > 0 ? customer.trim() : "Your customer"
    const recipientLine = recipientEmail.trim().length > 0
        ? recipientEmail.trim()
        : "recipient email"
    const descriptionLabel = description.trim().length > 0
        ? description.trim()
        : "Line description"
    const senderLabel = senderOrgName && senderOrgName.trim().length > 0
        ? senderOrgName.trim()
        : "Your business"
    const previewReference = nextInvoiceReference && nextInvoiceReference.trim().length > 0
        ? nextInvoiceReference.trim()
        : "—"

    const summaryLine = totalPence > 0
        ? `Ready to preview · ${totalLabel} invoice to ${customer.trim() || "recipient"}${
              stripeEnabled ? " · payment link on" : ""
          }`
        : "Add a line item to continue"

    const dueDateDisplay = formatDueDate(dueDate)

    const footMeta = lastSavedAt
        ? `Draft · saved locally ${formatRelative(lastSavedAt)}`
        : "Draft · not yet saved"

    return (
        <div className="inv2">
            {/* ── Breadcrumb ─────────────────────────────────────────── */}
            <nav className="inv2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/money">Money</Link>
                <span className="sep">›</span>
                <Link href="/money">Cockpit</Link>
                <span className="sep">›</span>
                <span className="current">Send invoice</span>
            </nav>

            {/* ── Preview banner ─────────────────────────────────────── */}
            <div className="inv2-preview-banner" role="status" aria-live="polite">
                <span className="inv2-preview-badge">Preview</span>
                <span className="inv2-preview-text">
                    Send invoice is in preview. <strong>Save draft</strong> persists
                    to this browser so nothing is lost. Stripe payment-link creation,
                    Xero sales-invoice push, and email delivery wire up next round.
                </span>
            </div>

            {/* ── QA head (hero) ─────────────────────────────────────── */}
            <div className="inv2-qa-head">
                <h1>
                    <span className="inv2-title-dot" aria-hidden="true" />
                    Send an invoice
                </h1>
                <div className="sub">
                    Quick send to a customer. Creates a branded PDF, optionally attaches
                    a payment link, and logs to Xero as a sales invoice when connected.
                    Recipient can pay with one click.
                </div>
            </div>

            <div className="inv2-grid">
                {/* ── Left: Form ────────────────────────────────────── */}
                <div>
                    {/* Recipient */}
                    <div className="inv2-form-section">
                        <h3>Recipient</h3>
                        <div className="inv2-fld">
                            <div className="two">
                                <div>
                                    <label htmlFor="inv2-customer">
                                        Customer <span className="req" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="inv2-customer"
                                        type="text"
                                        value={customer}
                                        onChange={(e) => setCustomer(e.target.value)}
                                        placeholder="Who are you billing?"
                                        aria-required="true"
                                    />
                                    <div className="hint">
                                        Type the customer name. Autocomplete from Xero + past
                                        invoices wires up next round.
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="inv2-recipient-email">
                                        Email <span className="req" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="inv2-recipient-email"
                                        type="email"
                                        value={recipientEmail}
                                        onChange={(e) => setRecipientEmail(e.target.value)}
                                        placeholder="name@company.com"
                                        aria-required="true"
                                    />
                                    <div className="hint">
                                        Primary contact. Receives the invoice email once send wires up.
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="inv2-fld">
                            <label htmlFor="inv2-cc">
                                CC recipients <span className="opt">Comma-separated</span>
                            </label>
                            <input
                                id="inv2-cc"
                                type="text"
                                value={ccRecipients}
                                onChange={(e) => setCcRecipients(e.target.value)}
                                placeholder="accounts@company.com"
                            />
                        </div>
                    </div>

                    {/* Line items */}
                    <div className="inv2-form-section">
                        <h3>Line items</h3>
                        <div className="inv2-section-sub">
                            What you&apos;re billing for. Multi-line support lands next round —
                            one line for now.
                        </div>
                        <table className="inv2-line-table">
                            <thead>
                                <tr>
                                    <th style={{ width: "40%" }}>Description</th>
                                    <th style={{ width: "80px" }}>Qty</th>
                                    <th style={{ width: "100px" }}>Unit price</th>
                                    <th style={{ width: "80px" }}>VAT</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="What this invoice covers"
                                            className="inv2-line-input"
                                            aria-label="Line description"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={quantity}
                                            onChange={(e) => setQuantity(e.target.value)}
                                            className="inv2-line-input num"
                                            aria-label="Quantity"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={unitPrice}
                                            onChange={(e) => setUnitPrice(e.target.value)}
                                            placeholder="0.00"
                                            className="inv2-line-input num"
                                            aria-label="Unit price"
                                        />
                                    </td>
                                    <td>
                                        <select
                                            value={vatRate}
                                            onChange={(e) => setVatRate(e.target.value as VatRate)}
                                            className="inv2-line-input"
                                            aria-label="VAT rate"
                                        >
                                            <option value="20">20%</option>
                                            <option value="5">5%</option>
                                            <option value="0">0%</option>
                                            <option value="exempt">Exempt</option>
                                        </select>
                                    </td>
                                    <td>{formatGBP(subtotalPence + vatPence)}</td>
                                </tr>
                                <tr>
                                    <td>
                                        <button
                                            type="button"
                                            className="inv2-add-line"
                                            disabled
                                            aria-label="Add line — multi-line ships next round"
                                            title="Multi-line invoices wire up next round"
                                        >
                                            + Add line
                                        </button>
                                    </td>
                                    <td colSpan={4} />
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={3} />
                                    <td className="inv2-lab">Subtotal</td>
                                    <td className="inv2-val">{subtotalLabel}</td>
                                </tr>
                                <tr>
                                    <td colSpan={3} />
                                    <td className="inv2-lab">VAT ({vatRateLabel(vatRate)})</td>
                                    <td className="inv2-val">{vatLabel}</td>
                                </tr>
                                <tr className="inv2-total">
                                    <td colSpan={3} />
                                    <td className="inv2-lab">Total</td>
                                    <td className="inv2-val">{totalLabel}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Payment */}
                    <div className="inv2-form-section">
                        <h3>Payment</h3>
                        <div className="inv2-fld">
                            <div className="two">
                                <div>
                                    <label htmlFor="inv2-due">
                                        Due date <span className="req" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="inv2-due"
                                        type="date"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        aria-required="true"
                                    />
                                    <div className="hint">
                                        Defaults to 14 days. Longer terms for bigger customers.
                                    </div>
                                </div>
                                <div>
                                    <label>Include Stripe payment link</label>
                                    <button
                                        type="button"
                                        className="inv2-toggle"
                                        data-state={stripeEnabled ? "on" : "off"}
                                        onClick={handleStripeToggle}
                                        aria-pressed={stripeEnabled}
                                    >
                                        <span className="inv2-toggle-switch" aria-hidden="true" />
                                        <span className="inv2-toggle-label">
                                            {stripeEnabled
                                                ? stripeConnected
                                                    ? "Enabled · one-click pay in email"
                                                    : "Enabled · Stripe connects next round"
                                                : "Disabled · PDF only"}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="inv2-fld">
                            <label htmlFor="inv2-note">
                                Note on invoice <span className="opt">Shows at bottom of PDF</span>
                            </label>
                            <textarea
                                id="inv2-note"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="A line of context or thanks — the recipient reads this first."
                                style={{ minHeight: "70px" }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Right: Preview + rails ───────────────────────── */}
                <div>
                    <div className="inv2-rail-card">
                        <div className="inv2-rc-head">Preview · invoice email</div>
                        <div className="inv2-rc-body inv2-no-pad">
                            <div className="inv2-preview-frame">
                                <h4>Invoice {previewReference}</h4>
                                <div className="inv2-inv-meta">
                                    <div>
                                        <strong>From</strong>
                                        <br />
                                        {senderLabel}
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <strong>Due</strong>
                                        <br />
                                        {dueDateDisplay}
                                        <br />
                                        {totalLabel}
                                    </div>
                                </div>
                                <div className="inv2-inv-to">
                                    <strong>To</strong>
                                    <br />
                                    {customerLabel}
                                    <br />
                                    {recipientLine}
                                </div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>{descriptionLabel}</td>
                                            <td>{subtotalLabel}</td>
                                        </tr>
                                        {vatPence > 0 ? (
                                            <tr>
                                                <td style={{ color: "var(--c-fg-muted)" }}>
                                                    VAT {vatRateLabel(vatRate)}
                                                </td>
                                                <td style={{ color: "var(--c-fg-muted)" }}>
                                                    {vatLabel}
                                                </td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                                <div className="inv2-tot-row grand">
                                    <span>Total due</span>
                                    <span>{totalLabel}</span>
                                </div>
                                {stripeEnabled ? (
                                    <div className="inv2-pay-link">
                                        <div className="inv2-pay-link-label">Pay in one click</div>
                                        <span className="inv2-pay-link-url">
                                            {stripeConnected
                                                ? "pay link activates on send"
                                                : "connect Stripe to enable"}
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="inv2-rail-card">
                        <div className="inv2-rc-head">When you send</div>
                        <div className="inv2-rc-body inv2-check-list">
                            <div>
                                {recipientEmail.trim().length > 0
                                    ? `Email queued for ${recipientEmail.trim()}${
                                          ccRecipients.trim().length > 0 ? ` + ${ccRecipients.trim()}` : ""
                                      }`
                                    : "Email queues to recipient + any CC addresses"}
                            </div>
                            <div>PDF attached · branded with your foundry</div>
                            <div>
                                {stripeEnabled
                                    ? stripeConnected
                                        ? "Stripe payment link activated"
                                        : "Stripe payment link · enable once Stripe connects"
                                    : "No payment link attached"}
                            </div>
                            <div>
                                {xeroConnected
                                    ? "Xero invoice created (status: Authorised)"
                                    : "Xero push · connect Xero to enable"}
                            </div>
                            <div>Tracked · you&apos;ll be notified on open and on payment</div>
                            <div>Cash-in expected line updates · Cockpit refreshes</div>
                            <div className="inv2-foot-meta">{footMeta}</div>
                        </div>
                    </div>

                    <div className="inv2-rail-card">
                        <div className="inv2-rc-head">
                            Outstanding · from {customer.trim().length > 0 ? customer.trim() : "customer"}
                        </div>
                        <div className="inv2-rc-body">
                            {outstandingInvoices === null ? (
                                <div className="inv2-outstanding-empty">
                                    Invoice history wires up with the Xero + Stripe integration.
                                    Once connected, any outstanding or recently-paid invoices from
                                    this customer show here.
                                </div>
                            ) : outstandingInvoices.length === 0 ? (
                                <div className="inv2-outstanding-empty">
                                    {customer.trim().length > 0
                                        ? `No outstanding invoices from ${customer.trim()} on record.`
                                        : "No outstanding invoices on record for this customer."}
                                </div>
                            ) : (
                                <div className="inv2-outstanding">
                                    {outstandingInvoices.map((inv) => (
                                        <div key={inv.id}>
                                            <strong>{inv.reference}</strong> · {inv.amountLabel}
                                            {" · "}
                                            <span className={inv.tone === "warning" ? "late" : undefined}>
                                                {inv.statusLabel}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Action bar ─────────────────────────────────────────── */}
            <div className="inv2-action-bar">
                <div className="inv2-action-summary">{summaryLine}</div>
                <div className="inv2-action-btns">
                    <Link href="/money" className="inv2-btn">
                        Cancel
                    </Link>
                    <button
                        type="button"
                        className="inv2-btn"
                        onClick={() => handleSaveDraft()}
                        aria-label="Save draft to this browser"
                        title="Save this draft locally so nothing is lost"
                    >
                        Save as draft
                    </button>
                    <button
                        type="button"
                        className="inv2-btn"
                        onClick={handleDownloadPdf}
                        aria-label="Download PDF only — wires up next round"
                        title="PDF export wires up next round"
                    >
                        Download PDF only
                    </button>
                    <button
                        type="button"
                        className="inv2-btn primary"
                        onClick={handleSend}
                        aria-label="Send invoice — delivery wires up next round"
                        title="Delivery wires up next round — click to save your draft locally"
                    >
                        Send invoice →
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function isVatRate(v: unknown): v is VatRate {
    return v === "20" || v === "5" || v === "0" || v === "exempt"
}

function vatPercent(rate: VatRate): number {
    if (rate === "20") return 20
    if (rate === "5") return 5
    return 0
}

function vatRateLabel(rate: VatRate): string {
    if (rate === "exempt") return "Exempt"
    return `${rate}%`
}

/**
 * Parse a free-typed number string into a finite number. Leniently
 * handles empty strings, commas, trailing decimal points. Invalid input
 * falls back to 0 so totals keep computing rather than blowing up the
 * whole view.
 */
function parseNumber(raw: string): number {
    const cleaned = raw.replace(/,/g, "").trim()
    if (cleaned.length === 0) return 0
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
}

/**
 * Format a pence integer as "£1,234.56". Always renders in GBP — the
 * multi-currency story lands with money_settings (MONEY-SCHEMA §6.1).
 */
function formatGBP(pence: number): string {
    const pounds = pence / 100
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(pounds)
}

/**
 * Default due date = today + 14 days, rendered as an ISO YYYY-MM-DD
 * string for the <input type="date"> field. Matches the mockup copy.
 */
function defaultDueDateIso(): string {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(d.getUTCDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
}

/**
 * Render the due date for the preview email — "3 May 2026" — in British
 * English. Falls back to the raw string when parsing fails so the
 * preview never goes blank.
 */
function formatDueDate(iso: string): string {
    if (!iso || iso.length === 0) return "—"
    const d = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso
    try {
        return d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
        })
    } catch {
        return iso
    }
}

/**
 * Coarse relative-time formatter for the "saved locally Xm ago" meta
 * line. Mirrors the helper in compose-view.tsx so the two preview pages
 * behave the same way to the founder.
 */
function formatRelative(iso: string): string {
    const then = Date.parse(iso)
    if (Number.isNaN(then)) return iso
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
    if (seconds < 45) return "just now"
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
    try {
        return new Date(then).toLocaleDateString()
    } catch {
        return iso
    }
}
