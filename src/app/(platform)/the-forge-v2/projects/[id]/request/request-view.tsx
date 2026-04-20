/**
 * RequestView — RFQ bundle creation page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-REQUEST.html. Scoped CSS under `.rq2`.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb: Forge › Project › Request
 *   2. Annotation strip — explains the one-form pattern
 *   3. Title + subtitle — "N recipients · N parts" summary
 *   4. Two-column grid:
 *      Left (request-main):
 *        - Header: "Request details" + 4-mode type toggle
 *          (Re-quote · Re-cert · Request audit · Find second source)
 *          All 4 toggles are visible but only "Re-quote" is active — the
 *          other modes land with a workflow migration. Disabled, not hidden.
 *        - Form rows:
 *            · Parts (grouped pickable list from the BOM)
 *            · Recipients (chip list from the shortlist)
 *            · Quantity (text input, prefilled)
 *            · Deadline (text input, prefilled)
 *            · Tone (chip selector)
 *            · Cover message (textarea)
 *            · Preview — generated subject + body per selected supplier
 *        - Footer: Back · "N drafts queued" meta · Review & send (disabled)
 *      Right (side column):
 *        - Request history — honest "no prior bundles" state
 *        - What happens on send — 4-step explainer
 *   5. Closing annotation — reiterates the pattern intent
 *
 * Empty-state gates render BEFORE the form if prerequisites missing:
 *   - No shortlisted suppliers → link to /suppliers
 *   - No parts decomposed      → link to /modules
 */

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import "./request-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface ShortlistSupplier {
    id: string
    supplierId: string
    name: string
    type: string | null
    rampRole: string | null
    isVerified: boolean
    matchScore: number | null
    moduleIds: string[]
}

export interface RequestPartOption {
    id: string
    name: string
    meta: string | null
    moduleId: string
}

export interface RequestModuleGroup {
    moduleId: string
    moduleNum: string
    moduleName: string
    parts: RequestPartOption[]
}

export interface RequestViewProps {
    project: {
        id: string
        name: string
    }
    suppliers: ShortlistSupplier[]
    modules: RequestModuleGroup[]
    totalParts: number
    requestHistory: {
        sentCount: number
        lastSentIso: string | null
    }
}

type RequestMode = "requote" | "recert" | "audit" | "second-source"
type Tone = "direct" | "formal" | "rebuild"

const MODE_LABELS: Record<RequestMode, string> = {
    requote: "Re-quote",
    recert: "Re-cert",
    audit: "Request audit",
    "second-source": "Find second source",
}
const TONE_LABELS: Record<Tone, string> = {
    direct: "Direct",
    formal: "Formal",
    rebuild: "Relationship-rebuild",
}

// ─── View ───────────────────────────────────────────────────────────────

export function RequestView(props: RequestViewProps): React.ReactElement {
    const { project, suppliers, modules, totalParts, requestHistory } = props
    const base = `/the-forge-v2/projects/${project.id}`

    const hasSuppliers = suppliers.length > 0
    const hasParts = totalParts > 0

    // ── Breadcrumb is always rendered, even on gate states ─────────
    const breadcrumb = (
        <div className="rq2-breadcrumb">
            <Link href="/the-forge-v2">Forge</Link>
            <span className="sep">›</span>
            <Link href={base}>{project.name}</Link>
            <span className="sep">›</span>
            <Link href={`${base}/bom`}>BOM</Link>
            <span className="sep">›</span>
            <span className="current">Request</span>
        </div>
    )

    // ── Empty-state gates ──────────────────────────────────────────
    if (!hasSuppliers) {
        return (
            <div className="rq2">
                {breadcrumb}
                <h1 className="rq2-title">
                    <span className="rq2-title-dot" aria-hidden="true" />
                    RFQ bundle · {project.name}
                </h1>
                <p className="rq2-subtitle">Pick suppliers + parts, draft the message, send the bundle.</p>
                <div className="rq2-gate">
                    <h3>
                        <span className="dot" aria-hidden="true" />
                        Shortlist suppliers first
                    </h3>
                    <p>
                        The RFQ bundle goes out to the suppliers on this project&rsquo;s shortlist.
                        You haven&rsquo;t shortlisted any yet — once one or two suppliers are in the
                        shortlist, this page becomes the single form that turns the BOM into a
                        quote pack.
                    </p>
                    <div className="actions">
                        <Link href={`${base}/suppliers`} className="rq2-btn primary">Go to suppliers →</Link>
                        <Link href={base} className="rq2-btn ghost">Back to project</Link>
                    </div>
                </div>
            </div>
        )
    }

    if (!hasParts) {
        return (
            <div className="rq2">
                {breadcrumb}
                <h1 className="rq2-title">
                    <span className="rq2-title-dot" aria-hidden="true" />
                    RFQ bundle · {project.name}
                </h1>
                <p className="rq2-subtitle">Pick suppliers + parts, draft the message, send the bundle.</p>
                <div className="rq2-gate">
                    <h3>
                        <span className="dot" aria-hidden="true" />
                        Decompose the brief into modules first
                    </h3>
                    <p>
                        You have {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"} on the
                        shortlist but no parts to quote yet. Decompose the brief into modules in the
                        CAD lab — every module&rsquo;s keyParts become quotable line items here.
                    </p>
                    <div className="actions">
                        <Link href={`${base}/modules`} className="rq2-btn primary">Go to modules →</Link>
                        <Link href={base} className="rq2-btn ghost">Back to project</Link>
                    </div>
                </div>
            </div>
        )
    }

    return <RequestForm project={project} suppliers={suppliers} modules={modules} totalParts={totalParts} requestHistory={requestHistory} base={base} breadcrumb={breadcrumb} />
}

// ─── Form ───────────────────────────────────────────────────────────────

function RequestForm(props: RequestViewProps & { base: string; breadcrumb: React.ReactNode }): React.ReactElement {
    const { project, suppliers, modules, totalParts, requestHistory, base, breadcrumb } = props

    const [mode] = useState<RequestMode>("requote")
    const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(
        () => new Set(suppliers.map((s) => s.id)),
    )
    const [selectedParts, setSelectedParts] = useState<Set<string>>(
        () => new Set(modules.flatMap((m) => m.parts.map((p) => p.id))),
    )
    const [tone, setTone] = useState<Tone>("direct")
    const [quantity, setQuantity] = useState<string>("1 ea (first batch) · option on further batches")
    const [deadline, setDeadline] = useState<string>("Quotes back within 6 working days")
    const [coverMessage, setCoverMessage] = useState<string>(
        `Hi — we're putting together an RFQ bundle for ${project.name}. Spec pack and drawings attached per part. Happy to jump on a call if it's easier.`,
    )

    function toggleSupplier(id: string): void {
        setSelectedSuppliers((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }
    function togglePart(id: string): void {
        setSelectedParts((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectedSupplierCount = selectedSuppliers.size
    const selectedPartCount = selectedParts.size

    const selectedSupplierList = useMemo(
        () => suppliers.filter((s) => selectedSuppliers.has(s.id)),
        [suppliers, selectedSuppliers],
    )
    const selectedPartsByModule = useMemo(() => {
        return modules
            .map((m) => ({
                moduleName: m.moduleName,
                moduleNum: m.moduleNum,
                parts: m.parts.filter((p) => selectedParts.has(p.id)),
            }))
            .filter((g) => g.parts.length > 0)
    }, [modules, selectedParts])

    const canSubmit = selectedSupplierCount > 0 && selectedPartCount > 0

    return (
        <div className="rq2">
            {breadcrumb}

            <div className="rq2-annot">
                <strong>Note</strong>
                One form serves every outreach action — Re-quote, Re-cert, Request audit, Find second source.
                Mode toggles change the recipient set and message template. Today only Re-quote is wired; the
                others ship with the RFQ spine.
            </div>

            <h1 className="rq2-title">
                <span className="rq2-title-dot" aria-hidden="true" />
                RFQ bundle · {project.name}
            </h1>
            <p className="rq2-subtitle">
                {selectedSupplierCount} recipient{selectedSupplierCount === 1 ? "" : "s"} ·{" "}
                {selectedPartCount} part{selectedPartCount === 1 ? "" : "s"} selected ·{" "}
                1 RFQ per spec
            </p>

            <div className="rq2-grid">
                {/* ── LEFT: form panel ─────────────────────── */}
                <div className="rq2-main">
                    <div className="rq2-head">
                        <h2>Request details</h2>
                        <div className="rq2-type-toggle" role="tablist" aria-label="Request mode">
                            {(Object.keys(MODE_LABELS) as RequestMode[]).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    role="tab"
                                    aria-selected={mode === m}
                                    className={mode === m ? "active" : ""}
                                    disabled={mode !== m}
                                    title={mode === m ? MODE_LABELS[m] : `${MODE_LABELS[m]} ships with the RFQ spine`}
                                >
                                    {MODE_LABELS[m]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rq2-body">
                        {/* Parts picker */}
                        <div className="rq2-form-row">
                            <div className="label">Parts</div>
                            <div className="value">
                                <div className="rq2-parts-list">
                                    {modules.map((group) => (
                                        <div key={group.moduleId}>
                                            <div className="rq2-parts-group-head">
                                                <span>{group.moduleNum} · {group.moduleName}</span>
                                                <span>{group.parts.length} part{group.parts.length === 1 ? "" : "s"}</span>
                                            </div>
                                            {group.parts.map((p) => {
                                                const checked = selectedParts.has(p.id)
                                                return (
                                                    <label key={p.id} className="rq2-part-item">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => togglePart(p.id)}
                                                            aria-label={`Include ${p.name}`}
                                                        />
                                                        <span className="body">
                                                            <span className="name">{p.name}</span>
                                                            {p.meta && <span className="meta">{p.meta}</span>}
                                                        </span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    ))}
                                </div>
                                <div className="hint">
                                    {selectedPartCount} of {totalParts} parts selected — each line gets its
                                    own spec page in the outgoing bundle.
                                </div>
                            </div>
                        </div>

                        {/* Recipients */}
                        <div className="rq2-form-row">
                            <div className="label">Recipients</div>
                            <div className="value">
                                <div className="rq2-chips">
                                    {suppliers.map((s) => {
                                        const selected = selectedSuppliers.has(s.id)
                                        const label = s.rampRole === "primary" ? "primary" : s.rampRole ?? ""
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                className={`rq2-chip${selected ? " selected" : ""}`}
                                                onClick={() => toggleSupplier(s.id)}
                                                aria-pressed={selected}
                                            >
                                                <span className="dot" />
                                                {s.name}
                                                {label && <span className="count">· {label}</span>}
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="hint">
                                    Every selected supplier gets the same spec pack. Quote responses come back
                                    into the BOM comparison surface (ships with the RFQ spine).
                                </div>
                            </div>
                        </div>

                        {/* Quantity */}
                        <div className="rq2-form-row">
                            <div className="label">Quantity</div>
                            <div className="value">
                                <input
                                    type="text"
                                    className="rq2-input"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    aria-label="Quantity"
                                />
                                <div className="hint">Option-quantity framing typically gets a better unit rate without locking a commitment.</div>
                            </div>
                        </div>

                        {/* Deadline */}
                        <div className="rq2-form-row">
                            <div className="label">Deadline</div>
                            <div className="value">
                                <input
                                    type="text"
                                    className="rq2-input"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                    aria-label="Deadline"
                                />
                            </div>
                        </div>

                        {/* Tone */}
                        <div className="rq2-form-row">
                            <div className="label">Tone</div>
                            <div className="value">
                                <div className="rq2-chips">
                                    {(Object.keys(TONE_LABELS) as Tone[]).map((t) => {
                                        const selected = tone === t
                                        return (
                                            <button
                                                key={t}
                                                type="button"
                                                className={`rq2-chip${selected ? " selected" : ""}`}
                                                onClick={() => setTone(t)}
                                                aria-pressed={selected}
                                            >
                                                <span className="dot" />
                                                {TONE_LABELS[t]}
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="hint">
                                    Direct for incumbents on a steady footing. Formal for fresh relationships.
                                    Relationship-rebuild for suppliers bridging through a rough patch.
                                </div>
                            </div>
                        </div>

                        {/* Cover message */}
                        <div className="rq2-form-row">
                            <div className="label">Cover message</div>
                            <div className="value">
                                <textarea
                                    className="rq2-textarea"
                                    value={coverMessage}
                                    onChange={(e) => setCoverMessage(e.target.value)}
                                    aria-label="Cover message"
                                />
                                <div className="hint">
                                    Sent above the per-part spec pack. Keep it short — the spec sheets carry the detail.
                                </div>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="rq2-form-row">
                            <div className="label">Preview</div>
                            <div className="value">
                                {selectedSupplierList.length === 0 || selectedPartsByModule.length === 0 ? (
                                    <div className="rq2-preview-box">
                                        <p style={{ margin: 0, color: "var(--rq-fg-muted)", fontStyle: "italic" }}>
                                            Select at least one supplier and one part to see the draft.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="rq2-preview-box">
                                        <div className="subject">
                                            {MODE_LABELS[mode]}: {project.name} — {selectedPartCount} part{selectedPartCount === 1 ? "" : "s"}
                                        </div>
                                        <p>Hi {selectedSupplierList[0]?.name?.split(" ")[0] ?? "there"},</p>
                                        <p>{coverMessage}</p>
                                        <p>
                                            <strong>Parts in this bundle:</strong>
                                        </p>
                                        <ul style={{ margin: "0 0 10px 18px", padding: 0, lineHeight: 1.6 }}>
                                            {selectedPartsByModule.map((g) => (
                                                <li key={g.moduleNum}>
                                                    {g.moduleNum} · {g.moduleName}
                                                    <ul style={{ margin: "2px 0 0 18px", padding: 0, color: "var(--rq-fg-muted)" }}>
                                                        {g.parts.map((p) => (
                                                            <li key={p.id}>{p.name}</li>
                                                        ))}
                                                    </ul>
                                                </li>
                                            ))}
                                        </ul>
                                        <p><strong>Quantity:</strong> {quantity || "—"}</p>
                                        <p><strong>Deadline:</strong> {deadline || "—"}</p>
                                        <p>Spec pack attached per part. Happy to clarify anything.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rq2-foot">
                        <Link href={base} className="rq2-btn ghost">← Back</Link>
                        <div className="meta">
                            {canSubmit
                                ? `${selectedSupplierCount} draft${selectedSupplierCount === 1 ? "" : "s"} queued · review before sending`
                                : "Pick at least one supplier and one part to enable send"}
                        </div>
                        <button
                            type="button"
                            className="rq2-btn primary"
                            disabled={!canSubmit}
                            aria-disabled={!canSubmit}
                            title="Send flow ships with the RFQ spine"
                        >
                            Review &amp; send {selectedSupplierCount > 0 ? `(${selectedSupplierCount})` : ""} →
                        </button>
                    </div>
                </div>

                {/* ── RIGHT: sidebar ──────────────────────── */}
                <div>
                    <div className="rq2-side-card">
                        <h4>Request history — this project</h4>
                        {requestHistory.sentCount === 0 ? (
                            <div className="copy" style={{ color: "var(--rq-fg-muted)" }}>
                                No prior RFQ bundles on this project yet. Once the send pipeline lands,
                                every dispatch gets logged here with recipient count, status and award.
                            </div>
                        ) : (
                            <>
                                <div className="row">
                                    <div className="k">Bundles sent</div>
                                    <div className="v">{requestHistory.sentCount}</div>
                                </div>
                                {requestHistory.lastSentIso && (
                                    <div className="row">
                                        <div className="k">Last sent</div>
                                        <div className="v">{new Date(requestHistory.lastSentIso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="rq2-side-card">
                        <h4>What happens on send</h4>
                        <div className="copy">
                            <strong>1.</strong> Emails drop to every selected supplier via Comms ·{" "}
                            <strong>2.</strong> Every quoted part flips to &ldquo;RFQ out&rdquo; on the BOM ·{" "}
                            <strong>3.</strong> Chase follows up on the deadline ·{" "}
                            <strong>4.</strong> Quotes come back into the BOM comparison surface for award.
                        </div>
                    </div>

                    <div className="rq2-side-card">
                        <h4>Bundle summary</h4>
                        <div className="row">
                            <div className="k">Recipients</div>
                            <div className="v">{selectedSupplierCount} of {suppliers.length}</div>
                        </div>
                        <div className="row">
                            <div className="k">Parts</div>
                            <div className="v">{selectedPartCount} of {totalParts}</div>
                        </div>
                        <div className="row">
                            <div className="k">Mode</div>
                            <div className="v">{MODE_LABELS[mode]}</div>
                        </div>
                        <div className="row">
                            <div className="k">Tone</div>
                            <div className="v">{TONE_LABELS[tone]}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rq2-annot" style={{ marginTop: 18 }}>
                <strong>Note</strong>
                The 4 mode toggles collapse the old &ldquo;re-quote here, re-cert there, audit somewhere else&rdquo; sprawl into one
                surface. Tone defaults are relationship-aware — incumbents get a direct framing, fresh
                suppliers get formal, bridging suppliers get relationship-rebuild.
            </div>
        </div>
    )
}
