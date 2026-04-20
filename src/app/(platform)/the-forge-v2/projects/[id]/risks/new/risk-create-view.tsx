/**
 * RiskCreateView — "Raise a risk" form page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-RISK-CREATE.html. Scoped CSS under `.rc2` keeps the
 * styling isolated. No `risks` table exists yet, so nothing persists: the form
 * is fully interactive (title, description, category chips, 5×5 P×I matrix,
 * mitigation plan, residual score, budget, owner, cadence, linked artefacts),
 * but the primary Submit is disabled with a tooltip pointing at the next
 * migration. The module selector reuses `project.modules` from
 * `loadCadLabProject`; if modules are empty it disables with
 * "Decompose the brief first".
 *
 * Sections (top to bottom, left then right per mockup grid):
 *   1. Breadcrumb
 *   2. Page header — warning icon + title + sub
 *   3. Annotation note
 *   4. Grid: LEFT (form cards) · RIGHT (score + owner + cadence + linked + actions)
 *        LEFT 1:  Title & category — title, category chip multi-select, description
 *        LEFT 2:  Probability × Impact — 5×5 matrix + hint
 *        LEFT 3:  Mitigation plan — textarea, residual select, budget
 *        RIGHT 1: Score card — P×I live tier + band
 *        RIGHT 2: Owner — module select (linked module), default-owner info
 *        RIGHT 3: Review cadence — pill group
 *        RIGHT 4: Linked artefacts — brief / module / supplier / cost rows
 *        RIGHT 5: Action bar — Cancel · Save draft · Raise risk (disabled)
 *   5. Annotation note — why this screen exists
 */

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import "./risk-create-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

type Category = "supply" | "eng" | "reg" | "comm" | "people" | "financial"

type Cadence = "weekly" | "biweekly" | "monthly" | "event"

interface ModuleOption {
    id: string
    name: string
}

export interface RiskCreateViewProps {
    project: {
        id: string
        name: string
    }
    /** Modules decomposed on the project — used for the Owner/Module selector. */
    modules: ModuleOption[]
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Impact axis labels — legend beneath matrix, per mockup. */
const IMPACT_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Severe"] as const

/** Probability labels used in the live hint sentence. */
const PROBABILITY_LABELS: Record<number, string> = {
    1: "Rare",
    2: "Unlikely",
    3: "Possible",
    4: "Likely",
    5: "Almost certain",
}

/** Impact labels used in the live hint sentence. */
const IMPACT_HINT_LABELS: Record<number, string> = {
    1: "Negligible",
    2: "Minor",
    3: "Moderate",
    4: "Major",
    5: "Severe",
}

const CATEGORY_CHIPS: Array<{ key: Category; label: string; catClass: string }> = [
    { key: "supply", label: "Supply chain", catClass: "cat-supply" },
    { key: "eng", label: "Engineering", catClass: "cat-eng" },
    { key: "reg", label: "Regulatory", catClass: "cat-reg" },
    { key: "comm", label: "Commercial", catClass: "cat-comm" },
    { key: "people", label: "People", catClass: "cat-supply" },
    { key: "financial", label: "Financial", catClass: "cat-comm" },
]

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Map a P×I product (1..25) to a colour-level (l1..l5) matching the mockup's
 * green→yellow→orange→red ramp. Keeps the matrix visually identical.
 */
function levelForScore(score: number): 1 | 2 | 3 | 4 | 5 {
    if (score <= 2) return 1
    if (score <= 4) return 2
    if (score <= 9) return 3
    if (score <= 12) return 4
    return 5
}

/** Critical / High / Medium / Low band — mockup matches 1–4 / 5–9 / 10–15 / 16–25. */
function tierForScore(score: number): { label: string; tone: "low" | "med" | "high" | "critical" } {
    if (score <= 4) return { label: "LOW", tone: "low" }
    if (score <= 9) return { label: "MEDIUM", tone: "med" }
    if (score <= 15) return { label: "HIGH", tone: "high" }
    return { label: "CRITICAL", tone: "critical" }
}

// ─── View ───────────────────────────────────────────────────────────────

export function RiskCreateView(props: RiskCreateViewProps): React.ReactElement {
    const { project, modules } = props
    const base = `/the-forge-v2/projects/${project.id}`
    const hasModules = modules.length > 0

    // ── Form state (local only — no mutation wired) ─────────────────────
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [categories, setCategories] = useState<Set<Category>>(new Set())
    const [probability, setProbability] = useState(4)
    const [impact, setImpact] = useState(4)
    const [mitigation, setMitigation] = useState("")
    const [residual, setResidual] = useState<string>("8")
    const [budget, setBudget] = useState("")
    const [moduleId, setModuleId] = useState<string>("")
    const [cadence, setCadence] = useState<Cadence>("weekly")

    const score = probability * impact
    const tier = useMemo(() => tierForScore(score), [score])

    const toggleCategory = (key: Category): void => {
        setCategories((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    return (
        <div className="rc2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="rc2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={`${base}/risks`}>Risks</Link>
                <span className="sep">›</span>
                <span className="current">Raise new risk</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="rc2-page-header">
                <div>
                    <h1>
                        <span className="rc2-title-dot" aria-hidden="true" />
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Raise a risk
                    </h1>
                    <div className="sub">
                        {project.name} risk register · new entry will be saved once the risks table ships ·
                        visible to the project team by default.
                    </div>
                </div>
            </div>

            <div className="rc2-annot">
                <strong>Note</strong>
                Risks on the Forge are specific, owned, and cadenced. A risk without an owner and a review
                date is just anxiety. The Probability × Impact matrix is the 5×5 industry standard; score =
                P × I maps to tiers (Low 1–4 · Medium 5–9 · High 10–15 · Critical 16–25). Once the risks
                table ships, risks that cross High surface on Today automatically.
            </div>

            <div className="rc2-grid">
                {/* ═════ LEFT COLUMN — FORM ══════════════ */}
                <div>
                    {/* ── 1. Title & category ───────────── */}
                    <div className="rc2-form-card">
                        <h3>
                            <span className="hdot danger" aria-hidden="true" />
                            Title &amp; category
                        </h3>

                        <div className="group">
                            <label htmlFor="rc2-title">
                                Risk title<span className="req">*</span>
                            </label>
                            <input
                                id="rc2-title"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder='e.g. "UN38.3 battery certification slips past Q2"'
                            />
                            <div className="hint">
                                A one-line statement of what could go wrong. &quot;X happens and Y breaks&quot;
                                format works best.
                            </div>
                        </div>

                        <div className="group">
                            <label>
                                Category<span className="req">*</span>
                            </label>
                            <div className="rc2-chip-row">
                                {CATEGORY_CHIPS.map((chip) => {
                                    const on = categories.has(chip.key)
                                    return (
                                        <button
                                            key={chip.key}
                                            type="button"
                                            className={`rc2-chip-opt ${on ? `on ${chip.catClass}` : ""}`}
                                            onClick={() => toggleCategory(chip.key)}
                                            aria-pressed={on}
                                        >
                                            {chip.label}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="hint">
                                Multi-select. Categories drive which specialists get notified once
                                mitigation authoring ships.
                            </div>
                        </div>

                        <div className="group">
                            <label htmlFor="rc2-description">Description</label>
                            <textarea
                                id="rc2-description"
                                rows={4}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the mechanism of failure — supplier, queue time, downstream blockers, dates."
                            />
                            <div className="hint">
                                The thing that makes a risk actionable is specificity about the mechanism of
                                failure, not just the failure.
                            </div>
                        </div>
                    </div>

                    {/* ── 2. Probability × Impact ───────── */}
                    <div className="rc2-form-card">
                        <h3>
                            <span className="hdot warning" aria-hidden="true" />
                            Probability × Impact
                        </h3>

                        <div className="rc2-matrix-wrap">
                            <div className="rc2-matrix-axis-y">Probability →</div>
                            <div>
                                <div className="rc2-matrix" role="grid" aria-label="Probability by Impact risk matrix">
                                    {/* Rows rendered P=5 at top → P=1 at bottom so hover matches axis. */}
                                    {[5, 4, 3, 2, 1].map((p) =>
                                        [1, 2, 3, 4, 5].map((i) => {
                                            const cellScore = p * i
                                            const level = levelForScore(cellScore)
                                            const selected = p === probability && i === impact
                                            return (
                                                <button
                                                    key={`${p}-${i}`}
                                                    type="button"
                                                    role="gridcell"
                                                    aria-selected={selected}
                                                    aria-label={`Probability ${p}, Impact ${i}, score ${cellScore}`}
                                                    className={`rc2-m-cell l${level} ${selected ? "sel" : ""}`}
                                                    onClick={() => {
                                                        setProbability(p)
                                                        setImpact(i)
                                                    }}
                                                >
                                                    {cellScore}
                                                </button>
                                            )
                                        }),
                                    )}
                                </div>
                                <div className="rc2-matrix-legend">
                                    {IMPACT_LABELS.map((label) => (
                                        <span key={label}>{label}</span>
                                    ))}
                                </div>
                                <div className="rc2-matrix-axis-x">Impact →</div>
                            </div>
                        </div>
                        <div className="hint" style={{ marginTop: 12 }}>
                            Click a cell to score. Current selection:{" "}
                            <strong>
                                Probability {probability} ({PROBABILITY_LABELS[probability]})
                            </strong>{" "}
                            ×{" "}
                            <strong>
                                Impact {impact} ({IMPACT_HINT_LABELS[impact]})
                            </strong>{" "}
                            = <strong>score {score} ({tier.label.toLowerCase()})</strong>.
                        </div>
                    </div>

                    {/* ── 3. Mitigation plan ────────────── */}
                    <div className="rc2-form-card">
                        <h3>
                            <span className="hdot success" aria-hidden="true" />
                            Mitigation plan
                        </h3>

                        <div className="group">
                            <label htmlFor="rc2-mitigation">What we&apos;ll do (next 4 weeks)</label>
                            <textarea
                                id="rc2-mitigation"
                                rows={4}
                                value={mitigation}
                                onChange={(e) => setMitigation(e.target.value)}
                                placeholder="Numbered actions with named owners and dates. One per line."
                            />
                        </div>

                        <div className="inline-pair">
                            <div className="group">
                                <label htmlFor="rc2-residual">
                                    Target residual score (after mitigation)
                                </label>
                                <select
                                    id="rc2-residual"
                                    value={residual}
                                    onChange={(e) => setResidual(e.target.value)}
                                >
                                    <option value="4">4 (Low)</option>
                                    <option value="6">6 (Medium)</option>
                                    <option value="8">8 (Medium)</option>
                                    <option value="10">10 (High)</option>
                                </select>
                                <div className="hint">
                                    Where the score lands once the plan succeeds. Keep this honest — a
                                    residual that matches the current score means there&apos;s no plan.
                                </div>
                            </div>
                            <div className="group">
                                <label htmlFor="rc2-budget">Budget allocated</label>
                                <input
                                    id="rc2-budget"
                                    type="text"
                                    value={budget}
                                    onChange={(e) => setBudget(e.target.value)}
                                    placeholder='e.g. "£38k cert + £9k dual-path"'
                                />
                                <div className="hint">
                                    Finn flags this against cash burn once the risks table ships.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═════ RIGHT COLUMN — SCORE · OWNER · CADENCE · LINKED ══ */}
                <div>
                    {/* ── Score card ────────────────────── */}
                    <div className={`rc2-score-card tone-${tier.tone}`}>
                        <div className="sc-label">Current risk score</div>
                        <div className="sc-num">{score}</div>
                        <div className="sc-tier">{tier.label}</div>
                        <div className="sc-desc">
                            P{probability} ({PROBABILITY_LABELS[probability]}) × I{impact} (
                            {IMPACT_HINT_LABELS[impact]} impact).{" "}
                            {tier.tone === "critical" && (
                                <>Enters the Critical band — should auto-escalate to Today with daily review cadence once the risks table ships.</>
                            )}
                            {tier.tone === "high" && (
                                <>Enters the High band — weekly review recommended until residual drops below 10.</>
                            )}
                            {tier.tone === "med" && (
                                <>In the Medium band — bi-weekly review keeps it honest.</>
                            )}
                            {tier.tone === "low" && (
                                <>In the Low band — monthly review is enough. Document and move on.</>
                            )}
                        </div>
                    </div>

                    {/* ── Owner + module selector ───────── */}
                    <div className="rc2-form-card">
                        <h3>
                            <span className="hdot info" aria-hidden="true" />
                            Module affected
                        </h3>
                        <div className="group" style={{ marginBottom: 10 }}>
                            <label htmlFor="rc2-module">Module</label>
                            <select
                                id="rc2-module"
                                value={moduleId}
                                onChange={(e) => setModuleId(e.target.value)}
                                disabled={!hasModules}
                            >
                                {hasModules ? (
                                    <>
                                        <option value="">— Select module —</option>
                                        {modules.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.name}
                                            </option>
                                        ))}
                                    </>
                                ) : (
                                    <option value="">Decompose the brief first</option>
                                )}
                            </select>
                            <div className="hint">
                                {hasModules
                                    ? "Linking a module deep-links the risk row on the Risks artefact into the module's failure-mode section."
                                    : "Modules will appear here once decomposition runs on the brief."}
                            </div>
                        </div>

                        <h3 style={{ marginTop: 18 }}>
                            <span className="hdot info" aria-hidden="true" />
                            Owner
                        </h3>
                        <div className="rc2-owner-line">
                            <div className="rc2-owner-avatar">—</div>
                            <div>
                                <div className="name">Not yet assigned</div>
                                <div className="role">Owner assignment ships with the risks table</div>
                            </div>
                        </div>
                        <div className="hint" style={{ marginTop: 10 }}>
                            Each owner will get Today items matching their actions. The risk closes when
                            every action set completes.
                        </div>
                    </div>

                    {/* ── Review cadence ────────────────── */}
                    <div className="rc2-form-card">
                        <h3>
                            <span className="hdot info" aria-hidden="true" />
                            Review cadence
                        </h3>
                        <div className="rc2-chip-row">
                            {(
                                [
                                    { key: "weekly" as const, label: "Weekly" },
                                    { key: "biweekly" as const, label: "Bi-weekly" },
                                    { key: "monthly" as const, label: "Monthly" },
                                    { key: "event" as const, label: "On event" },
                                ]
                            ).map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    className={`rc2-cadence-pill ${cadence === c.key ? "on" : ""}`}
                                    onClick={() => setCadence(c.key)}
                                    aria-pressed={cadence === c.key}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                        <div className="hint" style={{ marginTop: 10 }}>
                            Weekly is recommended while score ≥ 10. Drops to bi-weekly once residual hits 8
                            or below. Review scheduling wires in once the risks table ships.
                        </div>
                    </div>

                    {/* ── Linked artefacts ──────────────── */}
                    <div className="rc2-form-card">
                        <h3>
                            <span className="hdot muted" aria-hidden="true" />
                            Linked artefacts
                        </h3>

                        <div className="rc2-linked-row">
                            <span className="icon" aria-hidden="true">📄</span>
                            <div>
                                <div className="label">Brief</div>
                                <div className="sub">Project brief &amp; regulatory posture</div>
                            </div>
                            <Link href={`${base}/brief`}>Open</Link>
                        </div>

                        <div className="rc2-linked-row">
                            <span className="icon" aria-hidden="true">⚙</span>
                            <div>
                                <div className="label">Module</div>
                                <div className="sub">
                                    {moduleId
                                        ? modules.find((m) => m.id === moduleId)?.name ?? "Selected module"
                                        : hasModules
                                            ? "Pick a module above"
                                            : "No modules yet"}
                                </div>
                            </div>
                            {moduleId ? (
                                <Link href={`${base}/modules/${moduleId}`}>Open</Link>
                            ) : (
                                <Link href={`${base}/modules`}>Browse</Link>
                            )}
                        </div>

                        <div className="rc2-linked-row">
                            <span className="icon" aria-hidden="true">🏭</span>
                            <div>
                                <div className="label">Suppliers</div>
                                <div className="sub">Link a supplier implicated in this risk</div>
                            </div>
                            <Link href={`${base}/suppliers`}>Open</Link>
                        </div>

                        <div className="rc2-linked-row">
                            <span className="icon" aria-hidden="true">💰</span>
                            <div>
                                <div className="label">Cost</div>
                                <div className="sub">Mitigation budget lands against project cost</div>
                            </div>
                            <Link href={`${base}/cost`}>Open</Link>
                        </div>
                    </div>

                    {/* ── Action bar ────────────────────── */}
                    <div className="rc2-action-bar">
                        <Link href={`${base}/risks`} className="rc2-btn ghost">
                            Cancel
                        </Link>
                        <span
                            className="rc2-btn ghost soon"
                            title="Draft saving ships with the risks table (next migration)"
                        >
                            Save as draft
                        </span>
                        <span
                            className="rc2-btn cta soon"
                            title="Risk persistence ships with the risks table (next migration)"
                            aria-disabled="true"
                        >
                            Raise risk →
                        </span>
                    </div>
                </div>
            </div>

            <div className="rc2-annot" style={{ marginTop: 22 }}>
                <strong>Note — why this screen exists.</strong>
                On the Risks artefact page every row is already owned and cadenced; this screen is how that
                happens. The matrix is decorative if it only lives on a PDF nobody reads. Here the score
                flips the risk into Today if it&apos;s ≥ 10, forces a named owner, and auto-schedules the
                first review — so &quot;high risk&quot; stops being a vibe and becomes a tracked dependency
                that closes itself when the residual drops.
            </div>
        </div>
    )
}
