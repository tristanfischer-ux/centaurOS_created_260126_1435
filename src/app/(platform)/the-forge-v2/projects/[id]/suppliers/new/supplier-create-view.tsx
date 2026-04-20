/**
 * SupplierCreateView — "Find or add a supplier" page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-SUPPLIER-CREATE.html. Scoped under `.sc2` so the
 * mockup's palette/typography don't leak.
 *
 * Sections (top to bottom, matching the mockup):
 *   1. Breadcrumb
 *   2. Page title + sub
 *   3. Mode toggle — Search the ForgeOS network / Add manually
 *   4. Note band
 *   5. Two-column layout:
 *      - LEFT (mode A default): search bar, filter chip groups, results list.
 *        Results are honest-empty — network search wires with the supplier
 *        matching service next round, so the panel reads "No network matches
 *        yet" until the action lands.
 *      - LEFT (mode B): Add-manually form. Fields adapted to the
 *        `forge_supplier_shortlist` data contract: name, type, modules
 *        matched, match score (0-100 slider), ramp role, match reasons,
 *        notes. Submit is disabled pending the creation mutation.
 *      - RIGHT: Why this search / Who's searching / After shortlist rails.
 *        Right-rail content stays mockup-verbatim as static context copy.
 *   6. "Saved drafts" pane below the form — honest empty state.
 *
 * Data policy: fields here map 1:1 to columns that exist (or will exist) on
 * `forge_supplier_shortlist`. No mockup specifics are faked. Right-rail
 * context rows (part ID, cert floor, cost owner) render as static mockup
 * copy because no per-project part-spec store exists yet — when the RFQ
 * lifecycle lands, this rail hydrates from real data.
 */

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import "./supplier-create-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface SupplierCreateViewProps {
    project: {
        id: string
        name: string
    }
    /** Project modules available for the multi-select. Empty array => no modules yet. */
    modules: Array<{ id: string; name: string }>
}

type Mode = "search" | "manual"
type RampRole = "primary" | "secondary" | "backup"
type SupplierType = "manufacturer" | "component" | "integrator" | "certifier" | "service"

const TYPE_OPTIONS: Array<{ value: SupplierType; label: string }> = [
    { value: "manufacturer", label: "Manufacturer" },
    { value: "component", label: "Component supplier" },
    { value: "integrator", label: "Integrator" },
    { value: "certifier", label: "Certifier" },
    { value: "service", label: "Service provider" },
]

const ROLE_OPTIONS: Array<{ value: RampRole; label: string }> = [
    { value: "primary", label: "Primary" },
    { value: "secondary", label: "Secondary" },
    { value: "backup", label: "Backup" },
]

// ─── View ───────────────────────────────────────────────────────────────

export function SupplierCreateView(props: SupplierCreateViewProps): React.ReactElement {
    const { project, modules } = props

    const base = `/the-forge-v2/projects/${project.id}`

    const [mode, setMode] = useState<Mode>("search")

    // Mode A (search) — inputs are interactive but don't hit the network yet.
    const [searchQuery, setSearchQuery] = useState("")
    const [region, setRegion] = useState<Set<string>>(new Set(["UK", "EU"]))
    const [certs, setCerts] = useState<Set<string>>(new Set(["AS9100"]))
    const [capacity, setCapacity] = useState<string>("100–1000")
    const [leadTime, setLeadTime] = useState<string>("10–20d")

    // Mode B (manual) — the real creation form, aligned to shortlist columns.
    const [name, setName] = useState("")
    const [type, setType] = useState<SupplierType>("manufacturer")
    const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set())
    const [matchScore, setMatchScore] = useState<number>(70)
    const [rampRole, setRampRole] = useState<RampRole>("secondary")
    const [reasons, setReasons] = useState("")
    const [notes, setNotes] = useState("")

    const toggleSet = (set: Set<string>, value: string, setter: (s: Set<string>) => void): void => {
        const next = new Set(set)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        setter(next)
    }

    const disabledSubmitTitle = "Creation ships with the supplier mutation (next round)"

    const canAttemptSubmit = useMemo(() => {
        // Informational only — Submit stays disabled regardless (mutation not wired).
        return name.trim().length > 0
    }, [name])

    return (
        <div className="sc2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="sc2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={`${base}/suppliers`}>Suppliers</Link>
                <span className="sep">›</span>
                <span className="current">Find supplier</span>
            </div>

            {/* ── Page title ─────────────────────────── */}
            <h1 className="sc2-page-title">Find or add a supplier</h1>
            <p className="sc2-page-sub">
                Search the ForgeOS network first — the match score reflects fit against this project&apos;s
                modules and part specs. If you already have an incumbent you want on record, switch to
                Add manually.
            </p>

            {/* ── Mode toggle ────────────────────────── */}
            <div className="sc2-mode-toggle" role="tablist" aria-label="Supplier entry mode">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "search"}
                    className={`m ${mode === "search" ? "active" : ""}`}
                    onClick={() => setMode("search")}
                >
                    <span aria-hidden="true">🔎</span>
                    Search the ForgeOS network
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "manual"}
                    className={`m ${mode === "manual" ? "active" : ""}`}
                    onClick={() => setMode("manual")}
                >
                    <span aria-hidden="true">✎</span>
                    Add manually
                </button>
            </div>

            {/* ── Note band ──────────────────────────── */}
            <div className="sc2-annot">
                <strong>Note</strong>
                The search is the default path because ForgeOS&apos;s network coverage is the product moat.
                Add-manually exists for the rare case of a known incumbent you want on record before a
                search finds them — it should feel like a fallback, not a primary flow.
            </div>

            {/* ── Layout ─────────────────────────────── */}
            <div className="sc2-layout">

                {/* LEFT column — active mode */}
                <div>
                    {mode === "search" ? (
                        <SearchPanel
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            region={region}
                            toggleRegion={(v) => toggleSet(region, v, setRegion)}
                            certs={certs}
                            toggleCerts={(v) => toggleSet(certs, v, setCerts)}
                            capacity={capacity}
                            setCapacity={setCapacity}
                            leadTime={leadTime}
                            setLeadTime={setLeadTime}
                        />
                    ) : (
                        <ManualPanel
                            modules={modules}
                            name={name} setName={setName}
                            type={type} setType={setType}
                            selectedModules={selectedModules}
                            toggleModule={(v) => toggleSet(selectedModules, v, setSelectedModules)}
                            matchScore={matchScore} setMatchScore={setMatchScore}
                            rampRole={rampRole} setRampRole={setRampRole}
                            reasons={reasons} setReasons={setReasons}
                            notes={notes} setNotes={setNotes}
                            canAttemptSubmit={canAttemptSubmit}
                            disabledSubmitTitle={disabledSubmitTitle}
                            cancelHref={`${base}/suppliers`}
                        />
                    )}

                    {/* Saved drafts pane — honest empty */}
                    <div className="sc2-drafts">
                        <h4>Saved drafts</h4>
                        <p>No drafts yet — fill in the form above.</p>
                    </div>
                </div>

                {/* RIGHT rail */}
                <aside className="sc2-rail">
                    <div className="sc2-rail-card">
                        <h4>Why this search?</h4>
                        <div className="row"><div className="k">Project</div><div className="v">{project.name}</div></div>
                        <div className="row"><div className="k">Modules</div><div className="v">{modules.length > 0 ? `${modules.length} declared` : "Not yet declared"}</div></div>
                        <div className="row"><div className="k">Part ID</div><div className="v muted">Not yet declared</div></div>
                        <div className="row"><div className="k">Material</div><div className="v muted">Not yet declared</div></div>
                        <div className="row"><div className="k">Tolerance</div><div className="v muted">Not yet declared</div></div>
                        <div className="row"><div className="k">Cert floor</div><div className="v muted">Not yet declared</div></div>
                        <div className="row"><div className="k">Qty / mo</div><div className="v muted">Not yet declared</div></div>
                        <div className="row"><div className="k">Budget / unit</div><div className="v muted">Not yet declared</div></div>
                        <p>
                            Context will be pulled from the part that triggers each search once the
                            part-spec store lands. Edit filters above to widen or narrow the field.
                        </p>
                    </div>

                    <div className="sc2-rail-card">
                        <h4>Who&apos;s searching</h4>
                        <div className="row"><div className="k">Lead</div><div className="v">Chase · VP Supply</div></div>
                        <div className="row"><div className="k">Second opinion</div><div className="v">Fang · VP Mfg</div></div>
                        <div className="row"><div className="k">Cost owner</div><div className="v">Finn · Finance</div></div>
                        <p>
                            Chase runs the shortlist. Fang validates manufacturability. Finn confirms price
                            fit before any RFQ goes out.
                        </p>
                    </div>

                    <div className="sc2-rail-card">
                        <h4>After shortlist</h4>
                        <p className="solid">
                            3+ shortlisted → Chase drafts an RFQ → you approve → ForgeOS sends it. First
                            quotes typically land within 5 working days.
                        </p>
                    </div>
                </aside>

            </div>
        </div>
    )
}

// ─── Mode A — Search panel ──────────────────────────────────────────────

interface SearchPanelProps {
    searchQuery: string
    setSearchQuery: (s: string) => void
    region: Set<string>
    toggleRegion: (v: string) => void
    certs: Set<string>
    toggleCerts: (v: string) => void
    capacity: string
    setCapacity: (s: string) => void
    leadTime: string
    setLeadTime: (s: string) => void
}

function SearchPanel(props: SearchPanelProps): React.ReactElement {
    const {
        searchQuery, setSearchQuery,
        region, toggleRegion,
        certs, toggleCerts,
        capacity, setCapacity,
        leadTime, setLeadTime,
    } = props

    const REGIONS = ["UK", "EU", "US", "Asia", "Africa"]
    const CERTS = ["AS9100", "ISO 9001", "ITAR-reg"]
    const CAPACITIES = ["< 100", "100–1000", "1000+"]
    const LEAD_TIMES = ["< 10d", "10–20d", "20–45d"]

    return (
        <>
            <div className="sc2-search-bar">
                <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. composite wing-spar CNC AS9100D ±0.3mm"
                    aria-label="Supplier search"
                />
                <button
                    type="button"
                    className="sc2-btn primary"
                    disabled
                    title="Network search wires in next round"
                >
                    Search
                </button>
            </div>

            <div className="sc2-filter-groups">
                <FilterGroup
                    label="Region"
                    options={REGIONS}
                    selected={region}
                    onToggle={toggleRegion}
                    multi
                />
                <FilterGroup
                    label="Certs"
                    options={CERTS}
                    selected={certs}
                    onToggle={toggleCerts}
                    multi
                />
                <FilterGroup
                    label="Capacity / mo"
                    options={CAPACITIES}
                    selected={new Set([capacity])}
                    onToggle={(v) => setCapacity(v)}
                />
                <FilterGroup
                    label="Lead time"
                    options={LEAD_TIMES}
                    selected={new Set([leadTime])}
                    onToggle={(v) => setLeadTime(v)}
                />
            </div>

            {/* Results — honest empty state */}
            <div className="sc2-results-head">
                <h3>0 matches in the network</h3>
                <span className="meta">Network search ships next round</span>
            </div>
            <div className="sc2-empty">
                <strong>No network matches yet</strong>
                <p>
                    Network search is wired up with the supplier-matching service in the next round.
                    Until then, use <strong>Add manually</strong> to record known incumbents against this
                    project&apos;s shortlist.
                </p>
            </div>
        </>
    )
}

interface FilterGroupProps {
    label: string
    options: string[]
    selected: Set<string>
    onToggle: (v: string) => void
    multi?: boolean
}

function FilterGroup(props: FilterGroupProps): React.ReactElement {
    const { label, options, selected, onToggle } = props
    return (
        <div className="sc2-filter-group">
            <span className="label">{label}</span>
            {options.map((o) => (
                <button
                    key={o}
                    type="button"
                    className={`sc2-fchip ${selected.has(o) ? "active" : ""}`}
                    onClick={() => onToggle(o)}
                    aria-pressed={selected.has(o)}
                >
                    {o}
                </button>
            ))}
        </div>
    )
}

// ─── Mode B — Manual panel ──────────────────────────────────────────────

interface ManualPanelProps {
    modules: Array<{ id: string; name: string }>
    name: string; setName: (s: string) => void
    type: SupplierType; setType: (t: SupplierType) => void
    selectedModules: Set<string>
    toggleModule: (v: string) => void
    matchScore: number; setMatchScore: (n: number) => void
    rampRole: RampRole; setRampRole: (r: RampRole) => void
    reasons: string; setReasons: (s: string) => void
    notes: string; setNotes: (s: string) => void
    canAttemptSubmit: boolean
    disabledSubmitTitle: string
    cancelHref: string
}

function ManualPanel(props: ManualPanelProps): React.ReactElement {
    const {
        modules,
        name, setName,
        type, setType,
        selectedModules, toggleModule,
        matchScore, setMatchScore,
        rampRole, setRampRole,
        reasons, setReasons,
        notes, setNotes,
        disabledSubmitTitle,
        cancelHref,
    } = props

    return (
        <div className="sc2-mode-b">
            <h3>Add manually</h3>
            <p className="sub">
                For known incumbents you want on record before a network search finds them.
                Everything here is editable later from the supplier detail page.
            </p>

            <div className="sc2-form-grid">
                <div className="sc2-form-field">
                    <label htmlFor="sc2-name">Supplier name</label>
                    <input
                        id="sc2-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Astra Engineering Ltd"
                    />
                </div>

                <div className="sc2-form-field">
                    <label htmlFor="sc2-type">Supplier type</label>
                    <select
                        id="sc2-type"
                        value={type}
                        onChange={(e) => setType(e.target.value as SupplierType)}
                    >
                        {TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>

                <div className="sc2-form-field full">
                    <label>Modules matched</label>
                    {modules.length === 0 ? (
                        <div className="sc2-modules-empty">
                            This project hasn&apos;t declared modules yet. Run module decomposition from
                            the CAD lab to enable module-level matching.
                        </div>
                    ) : (
                        <div className="sc2-modules-chips">
                            {modules.map((m) => {
                                const active = selectedModules.has(m.id)
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        className={`sc2-fchip ${active ? "active" : ""}`}
                                        onClick={() => toggleModule(m.id)}
                                        aria-pressed={active}
                                    >
                                        {m.name}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="sc2-form-field full">
                    <div className="sc2-slider-head">
                        <label htmlFor="sc2-score">Match score</label>
                        <span className="sc2-slider-value">{matchScore}<small>/ 100</small></span>
                    </div>
                    <input
                        id="sc2-score"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={matchScore}
                        onChange={(e) => setMatchScore(Number(e.target.value))}
                        className="sc2-slider"
                    />
                    <div className="sc2-slider-ticks">
                        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                    </div>
                </div>

                <div className="sc2-form-field full">
                    <label>Ramp role</label>
                    <div className="sc2-role-row">
                        {ROLE_OPTIONS.map((r) => (
                            <button
                                key={r.value}
                                type="button"
                                className={`sc2-role-chip role-${r.value} ${rampRole === r.value ? "active" : ""}`}
                                onClick={() => setRampRole(r.value)}
                                aria-pressed={rampRole === r.value}
                            >
                                <span className={`sc2-role-dot role-${r.value}`} aria-hidden="true" />
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="sc2-form-field full">
                    <label htmlFor="sc2-reasons">Match reasons</label>
                    <textarea
                        id="sc2-reasons"
                        value={reasons}
                        onChange={(e) => setReasons(e.target.value)}
                        placeholder="One per line — e.g. AS9100D to 2027, composite CNC specialists, 17d lead time"
                    />
                </div>

                <div className="sc2-form-field full">
                    <label htmlFor="sc2-notes">Notes</label>
                    <textarea
                        id="sc2-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Anything the shortlist should remember — incumbent relationship, pricing history, known constraints"
                    />
                </div>
            </div>

            <div className="sc2-form-actions">
                <Link href={cancelHref} className="sc2-btn ghost">Cancel</Link>
                <button
                    type="button"
                    className="sc2-btn primary"
                    disabled
                    title={disabledSubmitTitle}
                >
                    Save supplier
                </button>
            </div>
        </div>
    )
}
