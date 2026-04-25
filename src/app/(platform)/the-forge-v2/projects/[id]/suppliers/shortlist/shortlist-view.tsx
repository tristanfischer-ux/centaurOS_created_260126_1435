/**
 * @file shortlist-view.tsx — Client view for the supplier shortlist sub-route.
 *
 * @description Renders:
 *   - Status filter chips (All, Researching, Contacted, Quoting, Negotiating,
 *     Selected, Rejected)
 *   - One row per shortlisted supplier with:
 *       - Supplier name + status dropdown
 *       - Lead-time risk pill (computed against project target launch date)
 *       - Best quote badge (lowest price received so far)
 *       - "Log a quote" inline button opening the QuoteModal
 *       - Expanded quote sub-list on click
 *   - Empty state when no suppliers are shortlisted yet
 *
 * British spelling in all user-facing copy. No em dashes. No emojis.
 */

"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronRight, Clock, AlertTriangle, TriangleAlert } from "lucide-react"
import {
  updateShortlistRow,
  removeSupplierFromShortlist,
  type ShortlistStatus,
} from "@/actions/project-supplier-shortlists"
import { computeLeadTimeBuffer } from "@/lib/supplier-lead-time"
import { QuoteModal } from "./quote-modal"
import { SetLaunchDateButton } from "./set-launch-date-button"
import type { Database } from "@/types/database.types"

// ─── Types ───────────────────────────────────────────────────────────────────

type RawShortlistRow =
  Database["public"]["Tables"]["project_supplier_shortlists"]["Row"]
type RawQuoteRow =
  Database["public"]["Tables"]["supplier_quotes"]["Row"]

interface Props {
  project: {
    id: string
    name: string
    targetLaunchDate: string | null
  }
  shortlistRows: RawShortlistRow[]
  allQuotes: RawQuoteRow[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ShortlistStatus, string> = {
  researching: "Researching",
  contacted: "Contacted",
  quoting: "Quoting",
  negotiating: "Negotiating",
  selected: "Selected",
  rejected: "Rejected",
}

const STATUS_ORDER: ShortlistStatus[] = [
  "researching",
  "contacted",
  "quoting",
  "negotiating",
  "selected",
  "rejected",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPence(pence: number | null, currency: string): string {
  if (pence === null) return "Price not logged"
  const pounds = pence / 100
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$"
  return `${symbol}${pounds.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function bestQuote(
  quotes: RawQuoteRow[]
): RawQuoteRow | null {
  const priced = quotes.filter((q) => q.quote_amount_pence !== null)
  if (priced.length === 0) return quotes[0] ?? null
  return priced.reduce((best, q) =>
    (q.quote_amount_pence as number) < (best.quote_amount_pence as number)
      ? q
      : best
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LeadTimePill({
  targetLaunchDate,
  leadTimeDays,
}: {
  targetLaunchDate: string | null
  leadTimeDays: number | null
}) {
  const result = computeLeadTimeBuffer({ targetLaunchDate, leadTimeDays })
  if (!result) return null

  const { weeksUntilLaunch, leadTimeWeeks, bufferWeeks, riskLevel } = result

  const pillStyle =
    riskLevel === "ok"
      ? "bg-success/10 text-success border-success/20"
      : riskLevel === "warning"
      ? "bg-warning/10 text-warning border-warning/30"
      : "bg-destructive/10 text-destructive border-destructive/20"

  const Icon =
    riskLevel === "critical"
      ? TriangleAlert
      : riskLevel === "warning"
      ? AlertTriangle
      : Clock

  const label =
    riskLevel === "ok"
      ? `${bufferWeeks}w buffer`
      : riskLevel === "warning"
      ? `Only ${bufferWeeks}w buffer`
      : bufferWeeks < 0
      ? `${Math.abs(bufferWeeks)}w overdue`
      : `${bufferWeeks}w buffer — tight`

  return (
    <div className="group relative inline-flex">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium cursor-default ${pillStyle}`}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
      {/* Expanded tooltip */}
      <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-[300] w-56 rounded-md border bg-card shadow-lg p-3 text-xs text-foreground leading-relaxed">
        <div className="font-medium mb-1">Lead-time calculation</div>
        <div>Launch in: {weeksUntilLaunch} weeks</div>
        <div>Supplier lead time: {leadTimeWeeks} weeks ({leadTimeDays} days)</div>
        <div className={riskLevel !== "ok" ? "font-semibold" : ""}>
          Buffer: {bufferWeeks} weeks
        </div>
        {riskLevel !== "ok" && (
          <div className="mt-1 text-muted-foreground">
            {riskLevel === "warning"
              ? "Less than 4 weeks of buffer. Chase the quote now."
              : "Critical. Place the order immediately or risk missing launch."}
          </div>
        )}
      </div>
    </div>
  )
}

function QuoteList({ quotes }: { quotes: RawQuoteRow[] }) {
  if (quotes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground pl-1 py-2">
        No quotes logged yet. Use the button above to record the first one.
      </p>
    )
  }

  const best = bestQuote(quotes)

  return (
    <div className="space-y-2 pt-2">
      {quotes.map((q) => (
        <div
          key={q.id}
          className={`rounded-md border px-3 py-2 text-xs space-y-1 ${
            best?.id === q.id
              ? "border-success/40 bg-success/5"
              : "border-border bg-muted/30"
          }`}
        >
          {best?.id === q.id && (
            <span className="inline-block rounded-full bg-success/20 text-success text-[10px] font-medium px-2 py-0 mb-1">
              Best quote
            </span>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-foreground">
              {formatPence(q.quote_amount_pence, q.currency)}
            </span>
            {q.volume && (
              <span className="text-muted-foreground">
                for {q.volume.toLocaleString("en-GB")} units
              </span>
            )}
          </div>
          {q.lead_time_days && (
            <div className="text-muted-foreground">
              Lead time: {q.lead_time_days} days
            </div>
          )}
          {q.valid_until && (
            <div className="text-muted-foreground">
              Valid until: {formatDate(q.valid_until)}
            </div>
          )}
          {q.received_at && (
            <div className="text-muted-foreground">
              Received: {formatDate(q.received_at)}
            </div>
          )}
          {q.notes && (
            <div className="text-muted-foreground italic">{q.notes}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function ShortlistView({ project, shortlistRows, allQuotes }: Props) {
  const base = `/the-forge-v2/projects/${project.id}`

  const [rows, setRows] = useState<RawShortlistRow[]>(shortlistRows)
  const [quotes, setQuotes] = useState<RawQuoteRow[]>(allQuotes)
  const [filter, setFilter] = useState<ShortlistStatus | "all">("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [quoteModalSupplierId, setQuoteModalSupplierId] = useState<string | null>(null)
  const [quoteModalSupplierName, setQuoteModalSupplierName] = useState<string>("")
  const [isPending, startTransition] = useTransition()

  const filtered =
    filter === "all" ? rows : rows.filter((r) => r.status === filter)

  // Group quotes by supplier_id for quick lookup
  const quotesBySupplier = new Map<string, RawQuoteRow[]>()
  for (const q of quotes) {
    const arr = quotesBySupplier.get(q.supplier_id) ?? []
    arr.push(q)
    quotesBySupplier.set(q.supplier_id, arr)
  }

  function toggleExpand(supplierId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(supplierId)) next.delete(supplierId)
      else next.add(supplierId)
      return next
    })
  }

  function handleStatusChange(supplierId: string, newStatus: ShortlistStatus) {
    // Optimistic
    setRows((prev) =>
      prev.map((r) =>
        r.supplier_id === supplierId ? { ...r, status: newStatus } : r
      )
    )
    startTransition(async () => {
      await updateShortlistRow({
        projectId: project.id,
        supplierId,
        status: newStatus,
      })
    })
  }

  function handleRemove(supplierId: string) {
    setRows((prev) => prev.filter((r) => r.supplier_id !== supplierId))
    startTransition(async () => {
      await removeSupplierFromShortlist({
        projectId: project.id,
        supplierId,
      })
    })
  }

  function handleQuoteLogged(newQuote: RawQuoteRow) {
    setQuotes((prev) => [newQuote, ...prev])
    // Expand the row so the quote is visible immediately
    setExpandedIds((prev) => new Set([...prev, newQuote.supplier_id]))
    setQuoteModalSupplierId(null)
  }

  const statusCounts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    {} as Record<ShortlistStatus, number>
  )

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
        <span className="text-foreground font-medium">Shortlist</span>
      </nav>

      {/* ── Page header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Supplier shortlist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length === 0
              ? "No suppliers shortlisted yet."
              : `${rows.length} supplier${rows.length === 1 ? "" : "s"} shortlisted. Track status, log quotes, and monitor lead times.`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SetLaunchDateButton
            projectId={project.id}
            currentDate={project.targetLaunchDate}
          />
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/suppliers/compare`}>
              Compare suppliers
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/suppliers/diary`}>
              Diary
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Launch date context ─────────────────────── */}
      {project.targetLaunchDate && (
        <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Target launch: <strong className="text-foreground">{formatDate(project.targetLaunchDate)}</strong>.
            Lead-time pills below show buffer remaining against each supplier's stated lead time.
          </span>
        </div>
      )}

      {/* ── Status filter chips ─────────────────────── */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-5" role="group" aria-label="Filter by status">
          <button
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground"
            }`}
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
          >
            All ({rows.length})
          </button>
          {STATUS_ORDER.map((s) => {
            const count = statusCounts[s] ?? 0
            if (count === 0) return null
            return (
              <button
                key={s}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === s
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                }`}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
              >
                {STATUS_LABELS[s]} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────── */}
      {rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">
              No suppliers shortlisted for this project yet.
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              On the suppliers page, click "Save to shortlist" on any supplier card to
              add them here and begin tracking status and quotes.
            </p>
            <Button asChild size="sm">
              <Link href={`${base}/suppliers`}>View suppliers</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Shortlist rows ──────────────────────────── */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((row) => {
            const supplierQuotes = quotesBySupplier.get(row.supplier_id) ?? []
            const best = bestQuote(supplierQuotes)
            const isExpanded = expandedIds.has(row.supplier_id)

            // Lead time: take the minimum lead_time_days from all quotes for this supplier
            const quotedLeadDays = supplierQuotes
              .map((q) => q.lead_time_days)
              .filter((d): d is number => d !== null)
            const minLeadDays =
              quotedLeadDays.length > 0 ? Math.min(...quotedLeadDays) : null

            return (
              <Card key={row.id} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* Row header */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        onClick={() => toggleExpand(row.supplier_id)}
                        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} quotes for ${row.supplier_name}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {row.supplier_name}
                          </span>
                          {best && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              Best: {formatPence(best.quote_amount_pence, best.currency)}
                              {best.volume ? ` / ${best.volume.toLocaleString("en-GB")} units` : ""}
                            </Badge>
                          )}
                          <LeadTimePill
                            targetLaunchDate={project.targetLaunchDate}
                            leadTimeDays={minLeadDays}
                          />
                        </div>
                        {supplierQuotes.length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {supplierQuotes.length} quote{supplierQuotes.length === 1 ? "" : "s"} logged
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Select
                        value={row.status}
                        onValueChange={(v) =>
                          handleStatusChange(row.supplier_id, v as ShortlistStatus)
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="h-8 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => {
                          setQuoteModalSupplierId(row.supplier_id)
                          setQuoteModalSupplierName(row.supplier_name)
                          setExpandedIds((prev) => new Set([...prev, row.supplier_id]))
                        }}
                      >
                        Log a quote
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(row.supplier_id)}
                        disabled={isPending}
                        aria-label={`Remove ${row.supplier_name} from shortlist`}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>

                  {/* Notes if present */}
                  {row.notes && (
                    <p className="mt-2 text-xs text-muted-foreground pl-6 italic">
                      {row.notes}
                    </p>
                  )}

                  {/* Quotes expansion */}
                  {isExpanded && (
                    <div className="mt-3 pl-6">
                      <QuoteList quotes={supplierQuotes} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty filter state */}
      {rows.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No suppliers in the &ldquo;{STATUS_LABELS[filter as ShortlistStatus]}&rdquo; stage.
        </p>
      )}

      {/* Quote modal */}
      {quoteModalSupplierId && (
        <QuoteModal
          projectId={project.id}
          supplierId={quoteModalSupplierId}
          supplierName={quoteModalSupplierName}
          onClose={() => setQuoteModalSupplierId(null)}
          onQuoteLogged={handleQuoteLogged}
        />
      )}
    </div>
  )
}
