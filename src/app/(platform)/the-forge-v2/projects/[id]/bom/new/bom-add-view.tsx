/**
 * BomAddView — Add-BOM-line form (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-BOM-ADD.html. Scoped CSS under `.ba2` keeps the
 * styling isolated so the mockup's palette/typography don't leak into the
 * rest of the platform.
 *
 * Sections (mockup order, top to bottom):
 *   1. Breadcrumb
 *   2. Page header — "Add BOM line item" + sub (revision letter)
 *   3. Annotation note — why this screen exists
 *   4. Two-column grid:
 *      LEFT (1.4fr):
 *         - Part card (name, category chips, make/buy chips)
 *         - Source spec card (drawing reference, spec notes textarea)
 *         - Quantity & cost card (qty per assy, batch 1, lead wks, cost lo/hi)
 *         - Supplier shortlist card (project-scoped shortlist rows)
 *      RIGHT (1fr):
 *         - Live preview card — mirrors the committed BOM row
 *         - Risk-flag strip — DFM / supply / reg / cost rows
 *         - Action bar — Cancel · Save draft · Add to BOM & raise RFQ
 *
 * Empty-state policy: the form is fully interactive client-side (name, qty,
 * chips, etc. update the preview). Submit is disabled with a tooltip that
 * says "Part persistence ships with the parts_spec table" — no server write
 * is performed from this screen.
 *
 * If no modules exist, the module selector disables with a link back to
 * /modules. If no suppliers are shortlisted, that section renders an honest
 * "Nothing on the shortlist yet" empty state with a link to /suppliers.
 */

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import "./bom-add-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface BomAddModuleOption {
    id: string
    label: string
}

export interface BomAddSupplierOption {
    id: string
    name: string
    meta: string | null
    rampRole: string | null
}

export interface BomAddMaterialOption {
    code: string
    name: string
    family: string
    processes: string[]
}

export interface BomAddViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    modules: BomAddModuleOption[]
    suppliers: BomAddSupplierOption[]
    materials: BomAddMaterialOption[]
}

// ─── Constants ──────────────────────────────────────────────────────────

const MAKE_BUY_OPTIONS = ["Make (in-house)", "Buy (supplier)", "Hybrid"] as const
type MakeBuy = (typeof MAKE_BUY_OPTIONS)[number]

// ─── Helpers ────────────────────────────────────────────────────────────

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

function formatGbpBand(lo: number | null, hi: number | null): string {
    if (lo == null && hi == null) return "—"
    if (lo != null && hi != null) return `£${lo.toLocaleString()} – £${hi.toLocaleString()}`
    if (lo != null) return `£${lo.toLocaleString()}+`
    return `up to £${(hi as number).toLocaleString()}`
}

function toNumberOrNull(v: string): number | null {
    if (v.trim() === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

// ─── View ───────────────────────────────────────────────────────────────

export function BomAddView(props: BomAddViewProps): React.ReactElement {
    const { project, modules, suppliers, materials } = props

    const base = `/the-forge-v2/projects/${project.id}`
    const revisionLetter = designRevisionToLetter(project.designRevision)
    const hasModules = modules.length > 0
    const hasSuppliers = suppliers.length > 0

    // Material family categories — drawn from the engineering library, not
    // fabricated. Fall back to a single "No material library" chip if nothing
    // loaded.
    const categoryChips = useMemo(() => {
        const families = Array.from(new Set(materials.map((m) => m.family))).slice(0, 8)
        return families.length > 0 ? families : []
    }, [materials])

    // ─── Client state ──────────────────────────────────────────────
    const [partName, setPartName] = useState("")
    const [category, setCategory] = useState<string | null>(null)
    const [makeBuy, setMakeBuy] = useState<MakeBuy>("Buy (supplier)")
    const [moduleId, setModuleId] = useState<string>(modules[0]?.id ?? "")
    const [drawingRef, setDrawingRef] = useState("")
    const [specNotes, setSpecNotes] = useState("")
    const [qtyPerAssy, setQtyPerAssy] = useState("1")
    const [batchSize, setBatchSize] = useState("")
    const [leadWeeks, setLeadWeeks] = useState("")
    const [costLo, setCostLo] = useState("")
    const [costHi, setCostHi] = useState("")
    const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set())

    const qtyNum = toNumberOrNull(qtyPerAssy) ?? 1
    const loNum = toNumberOrNull(costLo)
    const hiNum = toNumberOrNull(costHi)
    const extLo = loNum != null ? loNum * qtyNum : null
    const extHi = hiNum != null ? hiNum * qtyNum : null

    const selectedSupplierList = suppliers.filter((s) => selectedSuppliers.has(s.id))

    function toggleSupplier(id: string): void {
        setSelectedSuppliers((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <div className="ba2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="ba2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={`${base}/bom`}>BOM</Link>
                <span className="sep">›</span>
                <span className="current">Add line item</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="ba2-page-header">
                <div>
                    <h1>
                        <span className="ba2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add BOM line item
                    </h1>
                    <div className="sub">
                        New part for {project.name} · Revision {revisionLetter} · will appear in the BOM
                        once the parts-spec store ships.
                    </div>
                </div>
            </div>

            <div className="ba2-annot">
                <strong>Note</strong>
                Adding a BOM line doesn&apos;t just insert a row — it captures the part with its supply-chain
                context. The shortlist and preview on the right show what the row will look like in the BOM
                before you commit. Persistence ships with the parts-spec table in the next migration.
            </div>

            <div className="ba2-form-grid">
                {/* ── LEFT column ─────────────────────── */}
                <div>
                    {/* Part card */}
                    <div className="ba2-form-card">
                        <h3><span className="hdot" />Part</h3>

                        <div className="group">
                            <label htmlFor="ba2-part-name">Part name<span className="req">*</span></label>
                            <input
                                id="ba2-part-name"
                                type="text"
                                value={partName}
                                onChange={(e) => setPartName(e.target.value)}
                                placeholder="e.g. Carbon-fibre empennage yoke"
                            />
                            <div className="hint">As it will appear in the BOM. Short, descriptive. Avoid part numbers — those come from the supplier.</div>
                        </div>

                        <div className="group">
                            <label htmlFor="ba2-module-select">Module<span className="req">*</span></label>
                            {hasModules ? (
                                <select
                                    id="ba2-module-select"
                                    value={moduleId}
                                    onChange={(e) => setModuleId(e.target.value)}
                                >
                                    {modules.map((m) => (
                                        <option key={m.id} value={m.id}>{m.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <>
                                    <select id="ba2-module-select" disabled aria-disabled="true">
                                        <option>No modules decomposed yet</option>
                                    </select>
                                    <div className="hint">
                                        <Link href={`${base}/modules`} className="ba2-inline-link">Decompose the brief first →</Link>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="group">
                            <label>Material family</label>
                            {categoryChips.length > 0 ? (
                                <div className="chip-row">
                                    {categoryChips.map((c) => (
                                        <button
                                            type="button"
                                            key={c}
                                            className={`chip-opt ${category === c ? "on" : ""}`}
                                            onClick={() => setCategory((prev) => (prev === c ? null : c))}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="hint">
                                    Engineering material library is empty — seed material_properties rows
                                    to enable family selection.
                                </div>
                            )}
                            <div className="hint">Pulled from the engineering material library ({materials.length} rows). Family sets which specialist reviews the line.</div>
                        </div>

                        <div className="group">
                            <label>Make / buy<span className="req">*</span></label>
                            <div className="chip-row">
                                {MAKE_BUY_OPTIONS.map((o) => (
                                    <button
                                        type="button"
                                        key={o}
                                        className={`chip-opt ${makeBuy === o ? "on" : ""}`}
                                        onClick={() => setMakeBuy(o)}
                                    >
                                        {o}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Source spec card */}
                    <div className="ba2-form-card">
                        <h3><span className="hdot info" />Source spec</h3>

                        <div className="group">
                            <label htmlFor="ba2-drawing">Engineering drawing / CAD reference<span className="req">*</span></label>
                            <input
                                id="ba2-drawing"
                                type="text"
                                value={drawingRef}
                                onChange={(e) => setDrawingRef(e.target.value)}
                                placeholder="e.g. assembly.step — Onshape doc, latest"
                            />
                            <div className="hint">Link to the canonical drawing. Suppliers cite this revision on their RFQs. A locked BOM cannot reference an unlocked drawing.</div>
                        </div>

                        <div className="group">
                            <label htmlFor="ba2-spec-notes">Specification notes</label>
                            <textarea
                                id="ba2-spec-notes"
                                rows={3}
                                value={specNotes}
                                onChange={(e) => setSpecNotes(e.target.value)}
                                placeholder="Process, tolerance envelope, mass budget, environment, etc."
                            />
                            <div className="hint">Free-form — copied verbatim into the RFQ packet.</div>
                        </div>
                    </div>

                    {/* Quantity & cost card */}
                    <div className="ba2-form-card">
                        <h3><span className="hdot success" />Quantity &amp; cost</h3>

                        <div className="inline-trio">
                            <div className="group">
                                <label htmlFor="ba2-qty">Qty per assembly<span className="req">*</span></label>
                                <input
                                    id="ba2-qty"
                                    type="number"
                                    min={0}
                                    value={qtyPerAssy}
                                    onChange={(e) => setQtyPerAssy(e.target.value)}
                                />
                                <div className="hint">Per unit of the assembly.</div>
                            </div>
                            <div className="group">
                                <label htmlFor="ba2-batch">Batch 1 size</label>
                                <input
                                    id="ba2-batch"
                                    type="number"
                                    min={0}
                                    value={batchSize}
                                    onChange={(e) => setBatchSize(e.target.value)}
                                />
                                <div className="hint">From the Brief if declared.</div>
                            </div>
                            <div className="group">
                                <label htmlFor="ba2-lead">Target lead time (wks)</label>
                                <input
                                    id="ba2-lead"
                                    type="number"
                                    min={0}
                                    value={leadWeeks}
                                    onChange={(e) => setLeadWeeks(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="inline-pair">
                            <div className="group">
                                <label htmlFor="ba2-cost-lo">Est. unit cost (low)</label>
                                <input
                                    id="ba2-cost-lo"
                                    type="number"
                                    min={0}
                                    value={costLo}
                                    onChange={(e) => setCostLo(e.target.value)}
                                />
                                <div className="hint">£ — best quote received.</div>
                            </div>
                            <div className="group">
                                <label htmlFor="ba2-cost-hi">Est. unit cost (high)</label>
                                <input
                                    id="ba2-cost-hi"
                                    type="number"
                                    min={0}
                                    value={costHi}
                                    onChange={(e) => setCostHi(e.target.value)}
                                />
                                <div className="hint">£ — worst-case, pre-DFM review.</div>
                            </div>
                        </div>
                    </div>

                    {/* Supplier shortlist card */}
                    <div className="ba2-form-card">
                        <h3><span className="hdot warning" />Supplier shortlist</h3>
                        {hasSuppliers ? (
                            <>
                                <div className="shortlist">
                                    {suppliers.map((s) => {
                                        const on = selectedSuppliers.has(s.id)
                                        return (
                                            <button
                                                type="button"
                                                key={s.id}
                                                className={`short-row ${on ? "on" : ""}`}
                                                onClick={() => toggleSupplier(s.id)}
                                                aria-pressed={on}
                                            >
                                                <span className="sv-check" aria-hidden="true">{on ? "✓" : ""}</span>
                                                <div className="sv-body">
                                                    <div className="sv-name">{s.name}</div>
                                                    {s.meta && <div className="sv-meta">{s.meta}</div>}
                                                </div>
                                                {s.rampRole && (
                                                    <span className={`sv-fit ${s.rampRole === "primary" ? "good" : "ok"}`}>
                                                        {s.rampRole}
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="hint" style={{ marginTop: 12 }}>
                                    Chase will raise an RFQ with the checked suppliers once part persistence ships.
                                </div>
                            </>
                        ) : (
                            <div className="ba2-empty">
                                Nothing on the shortlist yet for this project.{" "}
                                <Link href={`${base}/suppliers`} className="ba2-inline-link">Build a shortlist →</Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT column ────────────────────── */}
                <div>
                    {/* Live preview */}
                    <div className="ba2-preview-card">
                        <div className="preview-row preview-row-4">
                            <div>
                                <div className="k">Part name</div>
                                <div className="v strong">{partName || "—"}</div>
                            </div>
                            <div>
                                <div className="k">Qty</div>
                                <div className="v">{qtyNum} / assy</div>
                            </div>
                            <div>
                                <div className="k">Make / buy</div>
                                <div className="v"><span className="ba2-mb-badge">{makeBuy.split(" ")[0]}</span></div>
                            </div>
                            <div>
                                <div className="k">Cost band (ext)</div>
                                <div className="v strong">{formatGbpBand(extLo, extHi)}</div>
                            </div>
                        </div>

                        <div className="preview-row preview-row-2">
                            <div>
                                <div className="k">Supplier shortlist</div>
                                <div className="v">
                                    {selectedSupplierList.length === 0
                                        ? <span className="muted">None selected</span>
                                        : (
                                            <>
                                                {selectedSupplierList.slice(0, 2).map((s) => s.name).join(" · ")}
                                                {selectedSupplierList.length > 2 && (
                                                    <span className="muted"> + {selectedSupplierList.length - 2} more</span>
                                                )}
                                            </>
                                        )}
                                </div>
                            </div>
                            <div>
                                <div className="k">Spec source</div>
                                <div className="v">{drawingRef || <span className="muted">Not linked</span>}</div>
                            </div>
                        </div>

                        <div className="preview-row preview-row-1">
                            <div>
                                <div className="k">Status at commit</div>
                                <div className="v">
                                    <span className="ba2-status pending">Draft</span>
                                    <span className="muted" style={{ marginLeft: 8 }}>
                                        No write — part persistence ships with the parts-spec store.
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Risk-flag strip — honest empty state */}
                    <div className="ba2-risk-strip">
                        <div className="ba2-risk-row">
                            <span className="sev info">DFM</span>
                            <div className="body">
                                <strong>DFM review runs once the part is committed.</strong>{" "}
                                Fang will check the material / tolerance envelope against the process-capability library
                                and flag any violations.
                            </div>
                        </div>
                        <div className="ba2-risk-row">
                            <span className="sev info">Supply</span>
                            <div className="body">
                                <strong>Supply risk depends on the shortlisted suppliers.</strong>{" "}
                                Chase pulls cert coverage, NCR history and lead-time variance once RFQs land.
                            </div>
                        </div>
                        <div className="ba2-risk-row">
                            <span className="sev info">Reg</span>
                            <div className="body">
                                <strong>Regulatory scope is set by the Brief.</strong>{" "}
                                Primary control surfaces, pressure vessels and certified components require traceability
                                — Leo flags the required certificates at commit.
                            </div>
                        </div>
                        <div className="ba2-risk-row">
                            <span className="sev info">Cost</span>
                            <div className="body">
                                <strong>Cost-band impact rolls up to the unit projection</strong>{" "}
                                once the part is priced. Finn re-runs the cost stack the moment supplier quotes land.
                            </div>
                        </div>
                    </div>

                    {/* Action bar */}
                    <div className="ba2-action-bar">
                        <Link href={`${base}/bom`} className="ba2-btn">Cancel</Link>
                        <button
                            type="button"
                            className="ba2-btn"
                            disabled
                            aria-disabled="true"
                            title="Part persistence ships with the parts_spec table"
                        >
                            Save as draft
                        </button>
                        <button
                            type="button"
                            className="ba2-btn primary"
                            disabled
                            aria-disabled="true"
                            title="Part persistence ships with the parts_spec table"
                        >
                            Add to BOM &amp; raise RFQ →
                        </button>
                    </div>
                </div>
            </div>

            <div className="ba2-annot ba2-annot-foot">
                <strong>Note — why this screen exists.</strong>{" "}
                Adding a BOM line is where most small hardware shops lose money: the part gets added, somebody
                rings a supplier, the quote comes back high, and the first-flight date slips. This screen
                enforces that the shortlist and risk signals are visible <em>before</em> the founder commits —
                so the cost band and the risk flags are seen, not discovered three weeks later.
            </div>
        </div>
    )
}
