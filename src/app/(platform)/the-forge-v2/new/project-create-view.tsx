/**
 * ProjectCreateView — mockup-faithful port of FORGE-MOCKUP-PROJECT-CREATE.html.
 *
 * Scope: the global "start a new project" wizard reached from the sidebar
 * "+ New project" CTA. Step 1 of 5 ("What is it?") is the only currently
 * interactive step — steps 2–5 appear as a visible strip at the top of the
 * wizard per the mockup, with tab-styling only. Invitees multi-select, the
 * starter-reference picker, and the preview rail all live on this page.
 *
 * Sections (top to bottom), matching the mockup 1:1:
 *   1. Breadcrumb — Today › New project
 *   2. Page title + sub
 *   3. Wizard head — "New project — step 1 of 5" + "Est. 4 minutes"
 *   4. Wizard step strip — 1 current, 2–5 inactive
 *   5. Wizard body — left: active step (voice CTA + textarea + inline note +
 *      labeled fields for name / industry / mission / target customers /
 *      why-now / regulatory / invitees + step-4 reference picker preview);
 *      right rail: "What you're creating" (Chase/Max/Fang/Jian/Finn briefings),
 *      live "What this will create" preview from form state,
 *      "Similar projects in the network".
 *   6. Footer bar — Cancel (left), note (centre), disabled "Draft Brief
 *      rev 0.1 →" primary CTA (right). Tooltip names the server action that
 *      is intentionally NOT wired in V1.
 *   7. Inline annotation note — steps 2–5 are progressive, pauseable, etc.
 *
 * Data contract
 * -------------
 * V1 ships with NO mutation. The `createCadLabProject` server action exists
 * at src/actions/cad-lab-projects.ts but is intentionally not invoked from
 * this route. The submit button is disabled with a tooltip naming the
 * action so the follow-up ticket is self-evident. Form state is held in
 * local React state and feeds the preview card on the right rail.
 *
 * Empty-state policy
 * ------------------
 * Every form slot is fully interactive client-side. The preview card shows
 * placeholder copy ("Not yet declared", italicised muted) that swaps to the
 * live value as the user types. Invitees list is empty by default with a
 * helpful inline hint — we do NOT fake foundry members since this page is
 * read-only pending the server-action wire-up.
 */

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import "./project-create-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

type StarterReferenceChoice = "blank" | "product-hypothesis" | "fork"

interface FormState {
    name: string
    subject: string
    industry: string
    mission: string
    targetCustomers: string
    whyNow: string
    regulatory: string
    invitees: string[]
    inviteeDraft: string
    starterReference: StarterReferenceChoice | null
}

const SUBJECT_MAX = 1000
const DISABLED_TOOLTIP =
    "Project creation ships with the createCadLabProject server action wire-up"

// ─── View ──────────────────────────────────────────────────────────────

export function ProjectCreateView(): React.ReactElement {
    const [form, setForm] = useState<FormState>({
        name: "",
        subject: "",
        industry: "",
        mission: "",
        targetCustomers: "",
        whyNow: "",
        regulatory: "",
        invitees: [],
        inviteeDraft: "",
        starterReference: null,
    })

    const subjectCount = form.subject.length
    const subjectOverLimit = subjectCount > SUBJECT_MAX

    const previewRows = useMemo(
        () => [
            { label: "Project name", value: form.name.trim() },
            { label: "Subject", value: form.subject.trim() },
            { label: "Target industry / domain", value: form.industry.trim() },
            { label: "Mission", value: form.mission.trim() },
            { label: "Target customers", value: form.targetCustomers.trim() },
            { label: "Why now", value: form.whyNow.trim() },
            { label: "Regulatory hints", value: form.regulatory.trim() },
            {
                label: "Starter reference",
                value: form.starterReference
                    ? starterReferenceLabel(form.starterReference)
                    : "",
            },
            {
                label: "Invitees",
                value: form.invitees.length > 0 ? form.invitees.join(", ") : "",
            },
        ],
        [form],
    )

    function handleAddInvitee(): void {
        const draft = form.inviteeDraft.trim()
        if (!draft) return
        if (form.invitees.includes(draft)) {
            setForm((s) => ({ ...s, inviteeDraft: "" }))
            return
        }
        setForm((s) => ({
            ...s,
            invitees: [...s.invitees, draft],
            inviteeDraft: "",
        }))
    }

    function handleRemoveInvitee(invitee: string): void {
        setForm((s) => ({
            ...s,
            invitees: s.invitees.filter((v) => v !== invitee),
        }))
    }

    function handleInviteeKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            handleAddInvitee()
        }
    }

    return (
        <div className="pc2">
            {/* ── Breadcrumb ─────────────────────────────────────── */}
            <nav className="pc2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/today">Today</Link>
                <span className="sep">›</span>
                <span className="current">New project</span>
            </nav>

            {/* ── Page title + sub ───────────────────────────────── */}
            <h1 className="pc2-page-title"><span className="pc2-title-dot" aria-hidden="true" />Start a new project</h1>
            <p className="pc2-page-sub">
                A project begins as a short voice memo or free-text spec. Chase and Max draft
                rev 0.1 of the Brief from what you say. You review before anything else happens.
            </p>

            {/* ── Wizard ─────────────────────────────────────────── */}
            <div className="pc2-wizard">
                <div className="pc2-wizard-head">
                    <h2>New project — step 1 of 5</h2>
                    <div className="step">Est. 4 minutes</div>
                </div>

                {/* Step strip */}
                <div className="pc2-wizard-steps" role="list" aria-label="Wizard steps">
                    <div className="s current" role="listitem" aria-current="step">
                        <span className="num">1</span> What is it?
                    </div>
                    <div className="s" role="listitem">
                        <span className="num">2</span> Who is it for?
                    </div>
                    <div className="s" role="listitem">
                        <span className="num">3</span> Constraints
                    </div>
                    <div className="s" role="listitem">
                        <span className="num">4</span> Starter reference
                    </div>
                    <div className="s" role="listitem">
                        <span className="num">5</span> Review &amp; create
                    </div>
                </div>

                <div className="pc2-wizard-body">
                    <div className="pc2-wizard-body-grid">
                        {/* ── Left column — the active step ──────────── */}
                        <div>
                            <h3 className="pc2-step-heading">Describe what you&apos;re building</h3>
                            <p className="pc2-step-lede">
                                Talk to us like you&apos;d brief a capable co-founder over coffee.
                                Chase is listening for the edges of the problem, not the polish.
                            </p>

                            {/* Voice row — disabled in V1 */}
                            <div className="pc2-voice-row">
                                <button
                                    type="button"
                                    className="pc2-voice-btn"
                                    disabled
                                    title="Voice capture wires in with the server action"
                                >
                                    <span style={{ fontSize: 18 }} aria-hidden="true">🎙</span>
                                    Record 60–90 sec voice memo
                                </button>
                                <span className="pc2-voice-alt">or type below</span>
                            </div>

                            {/* Subject (voice-memo-transcript) */}
                            <div className="pc2-field">
                                <label htmlFor="pc2-subject" className="pc2-field-label">
                                    Voice memo · transcript
                                </label>
                                <textarea
                                    id="pc2-subject"
                                    className="pc2-big-textarea"
                                    placeholder="e.g. 'We want to build a high-altitude solar UAV — 22m wing, 14-day persistence, maritime surveillance market. Target unit cost under £200k. First flight in 6 months.'"
                                    value={form.subject}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, subject: e.target.value }))
                                    }
                                    maxLength={SUBJECT_MAX + 200}
                                    aria-describedby="pc2-subject-count"
                                />
                                <span
                                    id="pc2-subject-count"
                                    className="pc2-char-count"
                                    aria-live="polite"
                                >
                                    {subjectCount.toLocaleString("en-GB")} / {SUBJECT_MAX.toLocaleString("en-GB")}
                                    {subjectOverLimit ? " · over limit" : ""}
                                </span>
                            </div>

                            <div className="pc2-inline-note">
                                <strong>What Chase listens for:</strong> problem, market, envelope
                                (cost / mass / timeline), regulatory stack, launch target. The fewer
                                blanks you leave, the less Chase has to infer.
                            </div>

                            {/* Name + industry row */}
                            <div className="pc2-field" style={{ marginTop: 20 }}>
                                <label htmlFor="pc2-name" className="pc2-field-label">
                                    Project name
                                </label>
                                <input
                                    id="pc2-name"
                                    type="text"
                                    className="pc2-text-input"
                                    placeholder="e.g. HAPS UAV — maritime surveillance"
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, name: e.target.value }))
                                    }
                                    maxLength={120}
                                />
                                <p className="pc2-field-hint">
                                    Short label — this appears in the sidebar and on the workspace card.
                                </p>
                            </div>

                            <div className="pc2-field">
                                <label htmlFor="pc2-industry" className="pc2-field-label">
                                    Target industry / domain
                                </label>
                                <input
                                    id="pc2-industry"
                                    type="text"
                                    className="pc2-text-input"
                                    placeholder="e.g. Aerospace — persistent ISR"
                                    value={form.industry}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, industry: e.target.value }))
                                    }
                                    maxLength={120}
                                />
                                <p className="pc2-field-hint">
                                    Helps Chase seed the regulatory library and Fang seed the supplier shortlist.
                                </p>
                            </div>

                            {/* Initial brief seed */}
                            <div className="pc2-field">
                                <label htmlFor="pc2-mission" className="pc2-field-label">
                                    Mission
                                </label>
                                <textarea
                                    id="pc2-mission"
                                    className="pc2-big-textarea"
                                    style={{ minHeight: 100 }}
                                    placeholder="Short statement of the problem you're solving and the outcome you want."
                                    value={form.mission}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, mission: e.target.value }))
                                    }
                                    maxLength={800}
                                />
                            </div>

                            <div className="pc2-field">
                                <label htmlFor="pc2-customers" className="pc2-field-label">
                                    Target customers
                                </label>
                                <textarea
                                    id="pc2-customers"
                                    className="pc2-big-textarea"
                                    style={{ minHeight: 100 }}
                                    placeholder="Who buys this? Operators, agencies, OEMs, primes — name them."
                                    value={form.targetCustomers}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, targetCustomers: e.target.value }))
                                    }
                                    maxLength={800}
                                />
                            </div>

                            <div className="pc2-field">
                                <label htmlFor="pc2-whynow" className="pc2-field-label">
                                    Why now
                                </label>
                                <textarea
                                    id="pc2-whynow"
                                    className="pc2-big-textarea"
                                    style={{ minHeight: 100 }}
                                    placeholder="What's changed in the market / tech / regulation that makes this the right moment?"
                                    value={form.whyNow}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, whyNow: e.target.value }))
                                    }
                                    maxLength={800}
                                />
                            </div>

                            <div className="pc2-field">
                                <label htmlFor="pc2-regulatory" className="pc2-field-label">
                                    Regulatory hint
                                </label>
                                <textarea
                                    id="pc2-regulatory"
                                    className="pc2-big-textarea"
                                    style={{ minHeight: 80 }}
                                    placeholder="e.g. 'CAA BVLOS OA · DO-178C software · ITAR-free BOM preferred'"
                                    value={form.regulatory}
                                    onChange={(e) =>
                                        setForm((s) => ({ ...s, regulatory: e.target.value }))
                                    }
                                    maxLength={500}
                                />
                                <p className="pc2-field-hint">
                                    Optional. Chase seeds the regulatory posture grid from these hints.
                                </p>
                            </div>

                            {/* Invitees */}
                            <div className="pc2-field">
                                <label htmlFor="pc2-invitees" className="pc2-field-label">
                                    Invitees · foundry members
                                </label>
                                <div className="pc2-invitees" role="group" aria-label="Project invitees">
                                    {form.invitees.length === 0 ? (
                                        <span className="pc2-invitee-empty">
                                            No invitees yet — type a name or email and press Enter.
                                        </span>
                                    ) : (
                                        form.invitees.map((invitee) => (
                                            <span key={invitee} className="pc2-invitee-chip">
                                                {invitee}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveInvitee(invitee)}
                                                    aria-label={`Remove ${invitee}`}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <input
                                        id="pc2-invitees"
                                        type="text"
                                        className="pc2-text-input"
                                        placeholder="name@foundry.test or @handle"
                                        value={form.inviteeDraft}
                                        onChange={(e) =>
                                            setForm((s) => ({ ...s, inviteeDraft: e.target.value }))
                                        }
                                        onKeyDown={handleInviteeKeyDown}
                                        maxLength={120}
                                    />
                                    <button
                                        type="button"
                                        className="pc2-btn"
                                        onClick={handleAddInvitee}
                                        disabled={form.inviteeDraft.trim().length === 0}
                                    >
                                        Add
                                    </button>
                                </div>
                                <p className="pc2-field-hint">
                                    Full foundry-member picker lands with the server action — for now, type the person&apos;s name or email.
                                </p>
                            </div>

                            {/* Step 4 preview: starter reference picker */}
                            <div className="pc2-ref-picker">
                                <h3>
                                    Starter reference{" "}
                                    <span className="pc2-pill-step">Step 4 preview</span>
                                </h3>
                                <p className="sub">
                                    You&apos;ll pick this in step 4 — showing it now so you know the three
                                    entry shapes before you commit to a voice memo.
                                </p>

                                <div className="pc2-ref-grid">
                                    <StarterReferenceCard
                                        icon="📄"
                                        title="Start blank"
                                        sub="Nothing preloaded. Chase and Max build rev 0.1 of the Brief purely from what you said above."
                                        isSelected={form.starterReference === "blank"}
                                        onSelect={() =>
                                            setForm((s) => ({ ...s, starterReference: "blank" }))
                                        }
                                    />
                                    <StarterReferenceCard
                                        icon="📦"
                                        title="Promote from a Product hypothesis"
                                        sub="Bring your market-validated hypothesis from Products into build mode. Market signals, pricing, LOIs all carry over."
                                        isSelected={form.starterReference === "product-hypothesis"}
                                        onSelect={() =>
                                            setForm((s) => ({
                                                ...s,
                                                starterReference: "product-hypothesis",
                                            }))
                                        }
                                    />
                                    <StarterReferenceCard
                                        icon="⑂"
                                        title="Fork from existing project"
                                        sub="HAPS Maritime v1.1 was forked this way. BOM, modules, suppliers — all copied, then diverged."
                                        isSelected={form.starterReference === "fork"}
                                        onSelect={() =>
                                            setForm((s) => ({ ...s, starterReference: "fork" }))
                                        }
                                    />
                                </div>

                                <div className="pc2-annot">
                                    <strong>Note</strong>
                                    Promote-from-Product is the canonical flow — Products is where you
                                    decide WHAT to build; Forge is where you BUILD it. Brief lock is the
                                    handoff contract between the two surfaces. Blank is the exception,
                                    not the default.
                                </div>
                            </div>
                        </div>

                        {/* ── Right rail ──────────────────────────── */}
                        <aside className="pc2-rail" aria-label="Preview">
                            {/* What you're creating — static specialist briefing */}
                            <div className="pc2-rail-card">
                                <h4>What you&apos;re creating</h4>
                                <ul className="pc2-rail-list">
                                    <li>
                                        <span className="who">Chase</span>a Brief rev 0.1 — editable before lock
                                    </li>
                                    <li>
                                        <span className="who">Max</span>a Modules decomposition — you approve each line
                                    </li>
                                    <li>
                                        <span className="who">Fang</span>a BOM skeleton (parts, quantities, cost envelopes)
                                    </li>
                                    <li>
                                        <span className="who">Jian</span>a Risks register seeded from the voice memo
                                    </li>
                                    <li>
                                        <span className="who">Finn</span>a Cost envelope with sensitivity bands
                                    </li>
                                    <li>
                                        <span className="who">Chase</span>a Suppliers shortlist — search begins in step 5
                                    </li>
                                </ul>
                            </div>

                            {/* Live preview from form state */}
                            <div className="pc2-rail-card">
                                <h4>What this will create</h4>
                                <ul className="pc2-rail-preview-list">
                                    {previewRows.map((row) => (
                                        <li key={row.label} className="pc2-rail-preview-item">
                                            <span className="label">{row.label}</span>
                                            {row.value ? (
                                                <span className="value">{row.value}</span>
                                            ) : (
                                                <span className="value empty">Not yet declared</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Similar projects — static per mockup */}
                            <div className="pc2-rail-card">
                                <h4>Similar projects in the network</h4>
                                <Link href="/the-forge-v2" className="pc2-sim-item">
                                    <div className="pc2-sim-thumb" aria-hidden="true">✈</div>
                                    <div className="pc2-sim-body">
                                        <div className="pc2-sim-name">HAPS UAV (maritime)</div>
                                        <div className="pc2-sim-meta">22m solar wing · 14 day · MoD demo Q4</div>
                                    </div>
                                </Link>
                                <Link href="/the-forge-v2" className="pc2-sim-item">
                                    <div className="pc2-sim-thumb" aria-hidden="true">🛩</div>
                                    <div className="pc2-sim-body">
                                        <div className="pc2-sim-name">Atmos Drone (forestry)</div>
                                        <div className="pc2-sim-meta">9m wing · 6 day · South America pilot</div>
                                    </div>
                                </Link>
                                <p className="pc2-rail-footnote">
                                    Chase finds analogues to stop you reinventing decisions other Forges have already made.
                                </p>
                            </div>
                        </aside>
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────── */}
                <div className="pc2-wizard-foot">
                    <Link href="/today" className="pc2-btn ghost">Cancel</Link>
                    <div className="note">
                        Nothing is committed until step 5 — everything is revisable.
                    </div>
                    <button
                        type="button"
                        className="pc2-btn primary"
                        disabled
                        title={DISABLED_TOOLTIP}
                        aria-disabled="true"
                    >
                        Draft Brief rev 0.1 →
                    </button>
                </div>
            </div>

            {/* ── Inline annotation ──────────────────────────────── */}
            <div className="pc2-annot">
                <strong>Note</strong>
                Steps 2–5 (Who is it for? · Constraints · Starter reference · Review &amp; create)
                are collapsed here. They progressively resolve from the voice memo — Chase
                auto-fills what it heard, you correct the gaps. The wizard is pauseable and
                resumable.
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function StarterReferenceCard({
    icon,
    title,
    sub,
    isSelected,
    onSelect,
}: {
    icon: string
    title: string
    sub: string
    isSelected: boolean
    onSelect: () => void
}): React.ReactElement {
    return (
        <button
            type="button"
            className={`pc2-ref-card${isSelected ? " is-selected" : ""}`}
            onClick={onSelect}
            aria-pressed={isSelected}
        >
            <div className="pc2-ref-icon" aria-hidden="true">{icon}</div>
            <div className="pc2-ref-title">{title}</div>
            <div className="pc2-ref-sub">{sub}</div>
        </button>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function starterReferenceLabel(choice: StarterReferenceChoice): string {
    if (choice === "blank") return "Start blank"
    if (choice === "product-hypothesis") return "Promote from a Product hypothesis"
    return "Fork from existing project"
}
