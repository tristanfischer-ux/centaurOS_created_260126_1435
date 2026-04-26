/**
 * @file diary-view.tsx — Procurement diary: reverse-chronological changelog
 * with an inline new-entry composer at the top.
 *
 * @description Founders log freehand notes: "Reached out to Brixham 2026-04-25",
 * "Quote received from Sheffield Engineering, £12k for 50 units". Entries are
 * immutable once created (append-only diary — delete is available for accidents).
 *
 * British spelling. No em dashes. No emojis.
 */

"use client"

import { useState, useTransition, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Trash2 } from "lucide-react"
import { addDiaryEntry, deleteDiaryEntry } from "@/actions/project-supplier-shortlists"
import type { Database } from "@/types/database.types"

type RawDiaryRow =
  Database["public"]["Tables"]["procurement_diary_entries"]["Row"]

interface Props {
  project: { id: string; name: string }
  initialEntries: RawDiaryRow[]
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function DiaryView({ project, initialEntries }: Props) {
  const base = `/the-forge-v2/projects/${project.id}`
  const [entries, setEntries] = useState<RawDiaryRow[]>(initialEntries)
  const [draft, setDraft] = useState("")
  const [occurredAt, setOccurredAt] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setErrorMessage(null)

    startTransition(async () => {
      const result = await addDiaryEntry({
        projectId: project.id,
        entry: trimmed,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      })

      if (!result.success || !result.row) {
        setErrorMessage(result.error ?? "Could not save the entry. Please try again.")
        return
      }

      const r = result.row
      const rawRow: RawDiaryRow = {
        id: r.id,
        project_id: r.projectId,
        author_user_id: r.authorUserId,
        entry: r.entry,
        occurred_at: r.occurredAt,
        created_at: r.createdAt,
      }

      setEntries((prev) => [rawRow, ...prev])
      setDraft("")
      setOccurredAt("")
      textareaRef.current?.focus()
    })
  }

  function handleDelete(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
    startTransition(async () => {
      const result = await deleteDiaryEntry(entryId)
      if (!result.success) {
        // Restore the deleted entry (re-fetch would be cleaner but this avoids
        // an extra round-trip for a rare operation)
        setErrorMessage("Could not delete the entry. Please refresh and try again.")
      }
    })
  }

  return (
    <div>
      {/* ── Breadcrumb ──────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6" aria-label="Breadcrumb">
        <Link href="/the-forge-v2" className="hover:text-foreground transition-colors">Forge</Link>
        <span aria-hidden="true">›</span>
        <Link href={base} className="hover:text-foreground transition-colors">{project.name}</Link>
        <span aria-hidden="true">›</span>
        <Link href={`${base}/suppliers`} className="hover:text-foreground transition-colors">Suppliers</Link>
        <span aria-hidden="true">›</span>
        <Link href={`${base}/suppliers/shortlist`} className="hover:text-foreground transition-colors">Shortlist</Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground font-medium">Diary</span>
      </nav>

      {/* ── Page header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Procurement diary
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A running log of every contact, quote, and decision in your supplier procurement process.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`${base}/suppliers/shortlist`}>Back to shortlist</Link>
        </Button>
      </div>

      {/* ── Inline composer ─────────────────────────── */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="diary-entry" className="text-sm font-medium">
              New entry
            </Label>
            <Textarea
              id="diary-entry"
              ref={textareaRef}
              placeholder="e.g. Reached out to Brixham Precision via email — asked for lead time on 500 units of the enclosure. Awaiting response."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="resize-none"
              aria-required="true"
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1 flex-1 max-w-xs">
              <Label htmlFor="diary-date" className="text-xs text-muted-foreground">
                When did this happen? (optional, defaults to now)
              </Label>
              <Input
                id="diary-date"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isPending || !draft.trim()}
              className="h-9"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Add entry
            </Button>
          </div>

          {errorMessage && (
            <p className="text-xs text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Diary feed ──────────────────────────────── */}
      {entries.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">
            No diary entries yet.
          </p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Use the composer above to log the first contact, quote, or decision.
            Entries are recorded in the order things happened, newest first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="relative rounded-lg border bg-card px-4 py-3 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {formatTimestamp(entry.occurred_at)}
                  </p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {entry.entry}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0 p-1 rounded"
                  aria-label="Delete this diary entry"
                  disabled={isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
