"use client"

/**
 * @file history-entry-view.tsx — Client-side interactive surface for a
 * single history entry (PLAN-SCHEMA §9, §17.5).
 *
 * Owns: inline "Mark outcome" form, body-edit affordance, and the expandable
 * edit log panel. Delegates persistence to `markHistoryOutcome` and
 * `editHistoryEntryBody` in src/actions/plan/history.ts. Both server actions
 * enforce the 5-minute edit-lock server-side — this UI is informational.
 */

import { useState, useTransition } from "react"
import { Pencil, Check, X, ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import type { HistoryEntryRow, OutcomeState } from "@/types/plan"
import {
    markHistoryOutcome,
    editHistoryEntryBody,
} from "@/actions/plan/history"
import { HISTORY_EDIT_LOCK_MS } from "@/actions/plan/types"

interface Props {
    entry: HistoryEntryRow
}

const OUTCOME_OPTIONS: Array<{ value: OutcomeState; label: string }> = [
    { value: "positive", label: "Worked out" },
    { value: "negative", label: "Backfired" },
    { value: "neutral", label: "Neutral" },
    { value: "pending", label: "Too early to say" },
]

export function HistoryEntryView({ entry: initial }: Props) {
    const [entry, setEntry] = useState<HistoryEntryRow>(initial)
    const [outcomeOpen, setOutcomeOpen] = useState(false)
    const [outcomeNote, setOutcomeNote] = useState(entry.outcome_note ?? "")
    const [outcomeValue, setOutcomeValue] = useState<OutcomeState>(
        entry.outcome ?? "pending",
    )
    const [editingBody, setEditingBody] = useState(false)
    const [bodyDraft, setBodyDraft] = useState(entry.body ?? "")
    const [editLogOpen, setEditLogOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const createdMs = new Date(entry.created_at).getTime()
    const withinEditLock = Date.now() - createdMs < HISTORY_EDIT_LOCK_MS
    const editLogCount = entry.edit_log_json?.length ?? 0

    function submitOutcome() {
        setError(null)
        startTransition(async () => {
            const result = await markHistoryOutcome(
                entry.id,
                outcomeValue,
                outcomeNote.trim() || null,
            )
            if (!result.success) {
                setError(result.error ?? "Could not save outcome.")
                return
            }
            setEntry(result.data)
            setOutcomeOpen(false)
        })
    }

    function submitBodyEdit() {
        setError(null)
        startTransition(async () => {
            const result = await editHistoryEntryBody(entry.id, bodyDraft)
            if (!result.success) {
                setError(result.error ?? "Could not save edit.")
                return
            }
            setEntry(result.data)
            setEditingBody(false)
        })
    }

    return (
        <div className="space-y-6">
            {/* Body panel with inline-edit */}
            <section>
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Narrative
                    </h2>
                    {!editingBody ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingBody(true)}
                        >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            {withinEditLock ? "Edit" : "Append edit"}
                        </Button>
                    ) : null}
                </div>
                {editingBody ? (
                    <div className="mt-2 space-y-2">
                        <textarea
                            value={bodyDraft}
                            onChange={(e) => setBodyDraft(e.target.value)}
                            rows={8}
                            className="w-full rounded-md border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/40"
                        />
                        <p className="text-xs text-muted-foreground">
                            {withinEditLock
                                ? "Within 5 minutes of creation — edits replace the body in place."
                                : "After 5 minutes — the previous body is kept in the edit log and the new body is shown."}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                onClick={submitBodyEdit}
                                disabled={isPending || bodyDraft === (entry.body ?? "")}
                            >
                                <Check className="mr-1 h-3.5 w-3.5" /> Save
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setEditingBody(false)
                                    setBodyDraft(entry.body ?? "")
                                    setError(null)
                                }}
                            >
                                <X className="mr-1 h-3.5 w-3.5" /> Cancel
                            </Button>
                        </div>
                    </div>
                ) : entry.body ? (
                    <div className="mt-2 rounded-md border border-border bg-card p-4">
                        <Markdown content={entry.body} className="text-sm" />
                    </div>
                ) : (
                    <p className="mt-2 text-sm italic text-muted-foreground">
                        No narrative captured.
                    </p>
                )}
            </section>

            {/* Outcome card */}
            <section>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    Outcome
                </h2>
                <div className="mt-2 rounded-md border border-border bg-card p-4">
                    {entry.outcome && !outcomeOpen ? (
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold capitalize text-foreground">
                                    {entry.outcome}
                                </p>
                                {entry.outcome_note ? (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {entry.outcome_note}
                                    </p>
                                ) : null}
                                {entry.outcome_revisit_at ? (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Revisit on{" "}
                                        {new Date(entry.outcome_revisit_at).toLocaleDateString()}
                                    </p>
                                ) : null}
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setOutcomeOpen(true)}
                            >
                                <Pencil className="mr-1 h-3.5 w-3.5" /> Update
                            </Button>
                        </div>
                    ) : outcomeOpen || !entry.outcome ? (
                        <div className="space-y-3">
                            <fieldset>
                                <legend className="text-sm font-medium text-foreground">
                                    How did this land?
                                </legend>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {OUTCOME_OPTIONS.map((o) => (
                                        <label
                                            key={o.value}
                                            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
                                                outcomeValue === o.value
                                                    ? "border-international-orange bg-international-orange/10 text-international-orange"
                                                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="outcome"
                                                value={o.value}
                                                className="sr-only"
                                                checked={outcomeValue === o.value}
                                                onChange={() => setOutcomeValue(o.value)}
                                            />
                                            {o.label}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            <label className="block text-sm">
                                <span className="text-muted-foreground">Note (optional)</span>
                                <textarea
                                    value={outcomeNote}
                                    onChange={(e) => setOutcomeNote(e.target.value)}
                                    rows={3}
                                    className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/40"
                                />
                            </label>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={submitOutcome}
                                    disabled={isPending}
                                >
                                    <Check className="mr-1 h-3.5 w-3.5" /> Save outcome
                                </Button>
                                {entry.outcome ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setOutcomeOpen(false)
                                            setOutcomeValue(entry.outcome ?? "pending")
                                            setOutcomeNote(entry.outcome_note ?? "")
                                        }}
                                    >
                                        <X className="mr-1 h-3.5 w-3.5" /> Cancel
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>

            {/* Edit log — expandable */}
            {editLogCount > 0 ? (
                <section>
                    <button
                        type="button"
                        onClick={() => setEditLogOpen((v) => !v)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                        {editLogOpen ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        Edited {editLogCount} time{editLogCount === 1 ? "" : "s"}
                    </button>
                    {editLogOpen ? (
                        <ol className="mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
                            {entry.edit_log_json.map((log, i) => (
                                <li key={i} className="space-y-0.5">
                                    <div className="flex items-center justify-between text-muted-foreground">
                                        <span className="font-medium capitalize text-foreground">
                                            {log.field}
                                        </span>
                                        <time dateTime={log.at}>
                                            {new Date(log.at).toLocaleString()}
                                        </time>
                                    </div>
                                    {log.from ? (
                                        <p className="text-muted-foreground">
                                            <span className="font-semibold">Was:</span> {log.from}
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ol>
                    ) : null}
                </section>
            ) : null}

            {error ? (
                <p
                    role="alert"
                    className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                    {error}
                </p>
            ) : null}
        </div>
    )
}
