/**
 * @file decision-log.tsx
 *
 * @description Decision log component for /plan page — lever #4.
 * Lists strategic decisions chronologically with a "Log a decision" modal.
 * Decisions are founder-logged records of what was decided and why.
 *
 * Features:
 *   - Card list of decisions (summary, date, expandable rationale)
 *   - "Log a decision" button opening a modal form
 *   - Related objectives / tasks shown as linked chips
 *   - Server action: logDecision (inserts into decisions table)
 *
 * @related
 *   - src/actions/plan/log-decision.ts — server action
 *   - supabase/migrations/20260425080000_decisions_table.sql
 */

"use client"

import * as React from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DecisionRecord {
  id: string
  summary: string
  rationale: string | null
  decided_at: string
  author_name: string | null
  related_objective_count: number
  related_task_count: number
}

interface DecisionLogProps {
  decisions: DecisionRecord[]
  canLog: boolean
  onLog: (data: { summary: string; rationale: string; decided_at: string }) => Promise<void>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDecisionDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Log Decision Modal ────────────────────────────────────────────────────────

interface LogDecisionModalProps {
  onClose: () => void
  onSubmit: (data: { summary: string; rationale: string; decided_at: string }) => Promise<void>
}

function LogDecisionModal({ onClose, onSubmit }: LogDecisionModalProps): React.ReactElement {
  const [summary, setSummary] = React.useState("")
  const [rationale, setRationale] = React.useState("")
  const [decidedAt, setDecidedAt] = React.useState(todayIso())
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const summaryRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => { summaryRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!summary.trim()) {
      setError("A one-line summary is required.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({ summary: summary.trim(), rationale: rationale.trim(), decided_at: decidedAt })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log decision.")
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="decision-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="decision-modal">
        <div className="decision-modal__header">
          <h2 id="decision-modal-title" className="decision-modal__title">
            Log a decision
          </h2>
          <button
            type="button"
            className="decision-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="decision-modal__form" onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className="decision-modal__error" role="alert">{error}</p>
          ) : null}

          <div className="decision-modal__field">
            <label htmlFor="dm-summary" className="decision-modal__label">
              Summary <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="dm-summary"
              ref={summaryRef}
              className="decision-modal__textarea decision-modal__textarea--short"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Pivoted from direct sales to channel partners"
              aria-required="true"
              aria-invalid={!!error}
              maxLength={280}
              rows={2}
            />
            <span className="decision-modal__char-count">{summary.length}/280</span>
          </div>

          <div className="decision-modal__field">
            <label htmlFor="dm-rationale" className="decision-modal__label">
              Rationale
            </label>
            <textarea
              id="dm-rationale"
              className="decision-modal__textarea"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why this decision, and what did you weigh up before making it?"
              rows={4}
            />
          </div>

          <div className="decision-modal__field">
            <label htmlFor="dm-decided-at" className="decision-modal__label">
              Decision date
            </label>
            <input
              id="dm-decided-at"
              type="date"
              className="decision-modal__input"
              value={decidedAt}
              onChange={(e) => setDecidedAt(e.target.value)}
              max={todayIso()}
            />
          </div>

          <div className="decision-modal__footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !summary.trim()}
            >
              {submitting ? "Logging..." : "Log decision"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Decision Card ─────────────────────────────────────────────────────────────

function DecisionCard({ decision }: { decision: DecisionRecord }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className="decision-card">
      <div className="decision-card__header">
        <div className="decision-card__meta">
          <time
            className="decision-card__date"
            dateTime={decision.decided_at}
          >
            {formatDecisionDate(decision.decided_at)}
          </time>
          {decision.author_name ? (
            <span className="decision-card__author">
              {" "}by {decision.author_name}
            </span>
          ) : null}
        </div>
        <div className="decision-card__links">
          {decision.related_objective_count > 0 ? (
            <span className="decision-card__chip">
              {decision.related_objective_count}{" "}
              {decision.related_objective_count === 1 ? "objective" : "objectives"}
            </span>
          ) : null}
          {decision.related_task_count > 0 ? (
            <span className="decision-card__chip">
              {decision.related_task_count}{" "}
              {decision.related_task_count === 1 ? "task" : "tasks"}
            </span>
          ) : null}
        </div>
      </div>

      <p className="decision-card__summary">{decision.summary}</p>

      {decision.rationale ? (
        <div className="decision-card__rationale-toggle">
          <button
            type="button"
            className="decision-card__toggle-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Hide rationale" : "Read rationale"}
          </button>
          {expanded ? (
            <p className="decision-card__rationale">{decision.rationale}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DecisionLog({
  decisions,
  canLog,
  onLog,
}: DecisionLogProps): React.ReactElement {
  const [modalOpen, setModalOpen] = React.useState(false)

  return (
    <div className="decision-log" id="decisions">
      <div className="decision-log__header">
        <h2 className="decision-log__title">Decision log</h2>
        {canLog ? (
          <button
            type="button"
            className="btn btn-primary decision-log__add-btn"
            onClick={() => setModalOpen(true)}
          >
            Log a decision
          </button>
        ) : null}
      </div>

      {decisions.length === 0 ? (
        <div className="decision-log__empty">
          <p>
            No decisions logged yet. When you make a strategic call, record it
            here so the reasoning is preserved alongside the plan.
          </p>
          {canLog ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setModalOpen(true)}
            >
              Log your first decision
            </button>
          ) : null}
        </div>
      ) : (
        <div className="decision-log__list">
          {decisions.map((d) => (
            <DecisionCard key={d.id} decision={d} />
          ))}
        </div>
      )}

      {modalOpen ? (
        <LogDecisionModal
          onClose={() => setModalOpen(false)}
          onSubmit={onLog}
        />
      ) : null}
    </div>
  )
}
