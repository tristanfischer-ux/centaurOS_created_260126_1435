/**
 * LineEditorView — Line-item editor (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-LINE-ITEM-EDITOR.html. Scoped CSS under `.lie2`.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb + cancel CTA
 *   2. Advisory banner — what this surface does
 *   3. Hero header — line name + metadata
 *   4. 5-step stepper (Basics · Amount · When · Tags · Review)
 *   5. Left column — 4 form sections (read-only preview, not wired)
 *   6. Right rail — impact preview / dependencies / audit trail / related
 *   7. Footer — step progress + Cancel / Back / Save buttons
 *   8. Annotation footer
 *
 * Empty-state policy: the editor renders the real current values from
 * `plan_line_items` but save-back wiring ships in the next round. All
 * inputs are pre-filled and visually live; the footer's Save buttons
 * are labelled "ships next round" to be honest about non-interactive
 * state until `updatePlanLine` lands. Impact preview ("runway delta")
 * renders honest em-dashes — the projection engine doesn't exist yet.
 */

"use client"

import Link from "next/link"
import "./line-editor-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export type EditorCategory =
  | "people"
  | "premises"
  | "tools"
  | "materials"
  | "growth"
  | "other"
  | "revenue"
  | "grants"
  | "equity"
  | "loans"

export type EditorFrequency =
  | "one_off"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "variable"

export type EditorDirection = "out" | "in"

export interface LineEditorViewProps {
  line: {
    id: string
    name: string
    direction: EditorDirection
    category: EditorCategory
    amountCents: number
    currency: string
    frequency: EditorFrequency
    effectiveFromIso: string
    effectiveToIso: string | null
    probabilityPct: number
    sensitivityPct: number
    annualUpliftPct: number
    vatTreatment: string
    xeroAccountCode: string | null
    accountingTags: string[]
    projectAllocation: string | null
    notes: string | null
    source: string
    createdAtIso: string
    updatedAtIso: string
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

const CATEGORIES: { id: EditorCategory; label: string }[] = [
  { id: "people",    label: "People"    },
  { id: "premises",  label: "Premises"  },
  { id: "tools",     label: "Tools"     },
  { id: "materials", label: "Materials" },
  { id: "growth",    label: "Growth"    },
  { id: "other",     label: "Other"     },
]

const INCOME_CATEGORIES: { id: EditorCategory; label: string }[] = [
  { id: "revenue", label: "Revenue" },
  { id: "grants",  label: "Grants"  },
  { id: "equity",  label: "Equity"  },
  { id: "loans",   label: "Loans"   },
]

const FREQUENCIES: { id: EditorFrequency; label: string }[] = [
  { id: "one_off",    label: "One-off"    },
  { id: "weekly",     label: "Weekly"     },
  { id: "monthly",    label: "Monthly"    },
  { id: "quarterly",  label: "Quarterly"  },
  { id: "annual",     label: "Annual"     },
  { id: "variable",   label: "Variable"   },
]

function currencySymbol(currency: string): string {
  if (currency === "GBP") return "£"
  if (currency === "USD") return "$"
  if (currency === "EUR") return "€"
  return ""
}

function formatAmount(cents: number, currency = "GBP"): string {
  const sym = currencySymbol(currency)
  const value = cents / 100
  if (Math.abs(value) >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(2)}M`
  return `${sym}${Math.round(value).toLocaleString()}`
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function directionLabel(dir: EditorDirection): string {
  return dir === "out" ? "Cash out" : "Cash in"
}

function categoryLabel(cat: EditorCategory): string {
  const all = [...CATEGORIES, ...INCOME_CATEGORIES]
  return all.find((c) => c.id === cat)?.label ?? cat
}

function frequencyLabel(f: EditorFrequency): string {
  return FREQUENCIES.find((x) => x.id === f)?.label ?? f
}

// ─── Component ──────────────────────────────────────────────────────────

export function LineEditorView({ line }: LineEditorViewProps): React.ReactElement {
  const isIncome = line.direction === "in"
  const activeCategories = isIncome ? INCOME_CATEGORIES : CATEGORIES

  return (
    <div className="lie2">

      {/* 1 · Breadcrumb + cancel */}
      <div className="lie2-page-head">
        <div className="lie2-crumbs">
          <Link href="/money">Money</Link>
          <span className="sep">›</span>
          <Link href="/money/plan">Plan</Link>
          <span className="sep">›</span>
          <span className="current">Edit line</span>
        </div>
        <Link href="/money/plan" className="lie2-btn">
          ← Cancel
        </Link>
      </div>

      {/* 2 · Advisory banner */}
      <div className="lie2-banner">
        <div>
          <strong>Line-item editor</strong>
          Edit the name, direction, category, amount, cadence, tags and
          accounting export for this line. Save wiring ships in the next
          round — changes made here won&apos;t persist yet.
        </div>
      </div>

      {/* 3 · Hero header */}
      <div className="lie2-hero">
        <div className="lie2-title-row">
          <span className="lie2-title-dot" aria-hidden="true" />
          <h1 className="lie2-title">Edit · {line.name}</h1>
        </div>
        <div className="sub">
          {directionLabel(line.direction)} · {categoryLabel(line.category)} ·
          {" "}{frequencyLabel(line.frequency)} ·{" "}
          created {formatDate(line.createdAtIso)} · last edited{" "}
          {formatDate(line.updatedAtIso)}
        </div>
      </div>

      {/* 4 · Stepper */}
      <div className="lie2-stepper">
        <div className="lie2-stepper-label">Step</div>
        <a href="#basics" className="lie2-step active">
          <span className="n">01</span>
          <span>
            <span className="lbl">Basics</span>
            <span className="sub">Name, direction, category</span>
          </span>
        </a>
        <a href="#amount" className="lie2-step">
          <span className="n">02</span>
          <span>
            <span className="lbl">Amount</span>
            <span className="sub">{formatAmount(line.amountCents, line.currency)}/{frequencyLabel(line.frequency).toLowerCase()}</span>
          </span>
        </a>
        <a href="#when" className="lie2-step">
          <span className="n">03</span>
          <span>
            <span className="lbl">When</span>
            <span className="sub">From {formatDate(line.effectiveFromIso)}</span>
          </span>
        </a>
        <a href="#tags" className="lie2-step">
          <span className="n">04</span>
          <span>
            <span className="lbl">Tags + export</span>
            <span className="sub">{line.xeroAccountCode ?? "—"}</span>
          </span>
        </a>
        <a href="#review" className="lie2-step">
          <span className="n">05</span>
          <span>
            <span className="lbl">Review</span>
            <span className="sub">Impact preview</span>
          </span>
        </a>
      </div>

      {/* 5 · Main form + right rail */}
      <div className="lie2-layout">

        <div>
          {/* Step 1 · Basics */}
          <div className="lie2-form-section" id="basics">
            <h3>01 · Basics</h3>
            <div className="section-sub">
              Name this line, pick the direction (money flowing out or in),
              and assign it to one of your founder-facing categories.
            </div>

            <div className="lie2-fld">
              <label>Name</label>
              <input type="text" defaultValue={line.name} readOnly />
              <div className="hint">
                Short, specific. Appears in the Plan grid, dashboards and
                any accounting export.
              </div>
            </div>

            <div className="lie2-fld">
              <label>Direction</label>
              <div className="lie2-dir-toggle">
                <div className={`lie2-dir-opt out ${line.direction === "out" ? "active" : "muted"}`}>
                  <div className="name">Cash out</div>
                  <div className="sub">Money leaving</div>
                </div>
                <div className={`lie2-dir-opt in ${line.direction === "in" ? "active" : "muted"}`}>
                  <div className="name">Cash in</div>
                  <div className="sub">Money arriving</div>
                </div>
              </div>
            </div>

            <div className="lie2-fld">
              <label>Category</label>
              <div className="lie2-cat-grid">
                {activeCategories.map((c) => (
                  <div
                    key={c.id}
                    className={
                      c.id === line.category
                        ? "lie2-cat-opt active"
                        : "lie2-cat-opt"
                    }
                  >
                    {c.label}
                  </div>
                ))}
              </div>
              <div className="hint">
                {isIncome
                  ? "4 founder-facing income buckets."
                  : "6 founder-facing cost buckets. Detailed accounting tags (for Xero / QBO export) live in step 4."}
              </div>
            </div>
          </div>

          {/* Step 2 · Amount */}
          <div className="lie2-form-section" id="amount">
            <h3>02 · Amount</h3>
            <div className="section-sub">
              Fixed amount for this line. Formula-mode entry (headcount ×
              salary × NI multiplier etc.) ships in the next round.
            </div>

            <div className="lie2-fld">
              <label>Entry mode</label>
              <div className="lie2-chip-pick">
                <span className="cp active">Fixed amount</span>
                <span className="cp">Formula (soon)</span>
                <span className="cp">Range (soon)</span>
                <span className="cp">Manual per month (soon)</span>
              </div>
            </div>

            <div className="lie2-fld two">
              <div>
                <label>Amount ({line.currency})</label>
                <input
                  type="text"
                  defaultValue={formatAmount(line.amountCents, line.currency)}
                  readOnly
                />
                <div className="hint">Stored as pence / cents on the row.</div>
              </div>
              <div>
                <label>Sensitivity ±</label>
                <input
                  type="text"
                  defaultValue={`${line.sensitivityPct}%`}
                  readOnly
                />
                <div className="hint">
                  Feeds best / worst scenario envelopes automatically.
                </div>
              </div>
            </div>

            {isIncome && (
              <div className="lie2-fld">
                <label>Probability</label>
                <input
                  type="text"
                  defaultValue={`${line.probabilityPct}%`}
                  readOnly
                />
                <div className="hint">
                  Income lines are weighted by probability in the forecast.
                  100% = certain · &lt;40% = speculative.
                </div>
              </div>
            )}

            <div className="lie2-fld">
              <label>Notes</label>
              <textarea defaultValue={line.notes ?? ""} readOnly />
            </div>
          </div>

          {/* Step 3 · When */}
          <div className="lie2-form-section" id="when">
            <h3>03 · Cadence &amp; duration</h3>

            <div className="lie2-fld">
              <label>Frequency</label>
              <div className="lie2-chip-pick">
                {FREQUENCIES.map((f) => (
                  <span
                    key={f.id}
                    className={
                      f.id === line.frequency ? "cp active" : "cp"
                    }
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="lie2-fld three">
              <div>
                <label>Effective from</label>
                <input
                  type="text"
                  defaultValue={formatDate(line.effectiveFromIso)}
                  readOnly
                />
              </div>
              <div>
                <label>Effective to</label>
                <input
                  type="text"
                  defaultValue={formatDate(line.effectiveToIso)}
                  readOnly
                />
                <div className="hint">Blank = indefinite.</div>
              </div>
              <div>
                <label>Annual uplift</label>
                <input
                  type="text"
                  defaultValue={`${line.annualUpliftPct}%`}
                  readOnly
                />
                <div className="hint">Applied on each anniversary.</div>
              </div>
            </div>
          </div>

          {/* Step 4 · Tags + export */}
          <div className="lie2-form-section" id="tags">
            <h3>
              04 · Accounting tags &amp; export{" "}
              <span className="lie2-badge">Hidden from grid</span>
            </h3>
            <div className="section-sub">
              These only matter for Xero / QuickBooks / FreeAgent export. The
              founder-facing grid never shows them.
            </div>

            <div className="lie2-fld">
              <label>Xero account code</label>
              <input
                type="text"
                defaultValue={line.xeroAccountCode ?? "—"}
                readOnly
              />
              <div className="hint">
                Auto-suggested from category + name. Override here when your
                chart of accounts differs.
              </div>
            </div>

            <div className="lie2-fld">
              <label>Accounting tags</label>
              {line.accountingTags.length === 0 ? (
                <div
                  className="hint"
                  style={{
                    padding: "8px 12px",
                    background: "var(--lie-surface-soft)",
                    borderRadius: 7,
                  }}
                >
                  No tags set. Tags help split a single line across multiple
                  Xero accounts at export time.
                </div>
              ) : (
                <div className="lie2-chip-pick">
                  {line.accountingTags.map((tag) => (
                    <span key={tag} className="cp active">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="lie2-fld two">
              <div>
                <label>Project allocation</label>
                <input
                  type="text"
                  defaultValue={line.projectAllocation ?? "None (overhead)"}
                  readOnly
                />
                <div className="hint">
                  Drives COGS vs. opex split in the P&amp;L.
                </div>
              </div>
              <div>
                <label>VAT treatment</label>
                <input
                  type="text"
                  defaultValue={line.vatTreatment}
                  readOnly
                />
              </div>
            </div>

            <div className="lie2-fld">
              <label>Xero sync</label>
              <div className="lie2-chip-pick">
                <span
                  className="cp"
                  title="Xero sync ships with accounting integration"
                >
                  Not synced · Xero not connected
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div>
          <div className="lie2-impact-card" id="review">
            <h3>Runway impact preview</h3>
            <div className="lie2-impact-grid">
              <div className="lie2-impact-tile">
                <div className="tile-lab">Amount</div>
                <div className="tile-val">
                  {formatAmount(line.amountCents, line.currency)}
                </div>
                <div className="tile-delta">
                  {frequencyLabel(line.frequency).toLowerCase()}
                </div>
              </div>
              <div className="lie2-impact-tile">
                <div className="tile-lab">Annualised</div>
                <div className="tile-val">
                  {formatAmount(annualise(line.amountCents, line.frequency), line.currency)}
                </div>
                <div className="tile-delta">assumes steady cadence</div>
              </div>
              <div className="lie2-impact-tile">
                <div className="tile-lab">Runway delta</div>
                <div className="tile-val empty">—</div>
                <div className="tile-delta">projection engine pending</div>
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--lie-fg-muted)",
                lineHeight: 1.55,
              }}
            >
              The &ldquo;runway delta&rdquo; tile populates once the
              projection engine lands — it&apos;ll tell you how many weeks
              of runway change if you save this edit.
            </div>
          </div>

          <div className="lie2-rail-card">
            <div className="rc-head">Dependencies</div>
            <div className="rc-body">
              <strong>Variables pulled from</strong>
              <div>· amount_cents (stored on this row)</div>
              <div>· currency ({line.currency})</div>
              <div>· frequency ({frequencyLabel(line.frequency)})</div>
              <div style={{ marginTop: 8 }}>
                <strong>Downstream effects (once wired)</strong>
              </div>
              <div>· Plan grid · {categoryLabel(line.category)} subtotal</div>
              <div>· P&amp;L · relevant opex / revenue row</div>
              <div>· Cockpit · burn / runway</div>
            </div>
          </div>

          <div className="lie2-rail-card">
            <div className="rc-head">Audit trail</div>
            <div className="rc-body">
              <div>
                <strong>Created</strong> {formatDate(line.createdAtIso)}
              </div>
              <div>
                <strong>Last edited</strong> {formatDate(line.updatedAtIso)}
              </div>
              <div>
                <strong>Source</strong> {line.source.replace(/_/g, " ")}
              </div>
            </div>
          </div>

          <div className="lie2-rail-card">
            <div className="rc-head">Related</div>
            <div className="rc-body">
              <div style={{ padding: "4px 0" }}>
                <Link
                  href="/money/plan"
                  style={{ color: "var(--lie-brand)", fontWeight: 600 }}
                >
                  Back to Plan grid →
                </Link>
              </div>
              <div style={{ padding: "4px 0" }}>
                <Link
                  href="/money/pnl"
                  style={{ color: "var(--lie-brand)", fontWeight: 600 }}
                >
                  Full P&amp;L →
                </Link>
              </div>
              <div style={{ padding: "4px 0" }}>
                <Link
                  href="/money"
                  style={{ color: "var(--lie-brand)", fontWeight: 600 }}
                >
                  Cockpit →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6 · Footer */}
      <div className="lie2-footer">
        <div className="meta">
          5 steps · save and delete actions ship in the next round
        </div>
        <div className="actions">
          <Link href="/money/plan" className="lie2-btn">
            Cancel
          </Link>
          <span className="lie2-btn disabled" title="Save wiring ships next round">
            Save as draft
          </span>
          <span className="lie2-btn primary disabled" title="Save wiring ships next round">
            Save + apply →
          </span>
        </div>
      </div>

      {/* 7 · Annotation */}
      <div className="lie2-annot">
        <strong>How this surface works</strong>
        Line-item schema per{" "}
        <code>plan_line_items</code>: name · direction (out/in) · category
        (6 cost + 4 income) · amount_cents · currency · frequency ·
        effective_from / to · probability · sensitivity · annual uplift ·
        VAT · Xero account · accounting tags · project allocation · notes.
        Save-back wiring + the impact preview ship together in the next
        round — the form is honest about non-interactive state until
        then.
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function annualise(amountCents: number, frequency: EditorFrequency): number {
  switch (frequency) {
    case "weekly":    return Math.round(amountCents * 52)
    case "monthly":   return amountCents * 12
    case "quarterly": return amountCents * 4
    case "annual":    return amountCents
    case "one_off":
    case "variable":
    default:          return amountCents
  }
}
