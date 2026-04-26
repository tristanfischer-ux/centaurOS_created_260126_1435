/**
 * @file compare-view.tsx — Side-by-side supplier comparison table.
 *
 * @description Renders up to four shortlisted suppliers in columns. Rows:
 *   - Status (from shortlist)
 *   - Location (from marketplace_listings)
 *   - Category
 *   - Certifications (from capabilities jsonb)
 *   - Stated lead time (minimum from logged quotes)
 *   - Minimum order quantity (from capabilities jsonb, first mention)
 *   - Best quote received
 *
 * Founder can change which suppliers are compared via the selector at top.
 * URL is updated with ?ids=... so comparisons can be shared.
 *
 * British spelling. No em dashes. No emojis.
 */

"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Database } from "@/types/database.types"

type RawShortlistRow =
  Database["public"]["Tables"]["project_supplier_shortlists"]["Row"]
type RawQuoteRow =
  Database["public"]["Tables"]["supplier_quotes"]["Row"]

// marketplace_listings has a very wide type — use a narrow interface
interface SupplierDirRow {
  id: string
  title: string
  category: string | null
  certifications: unknown
  process_capabilities: unknown
  specialties: unknown
  minimum_order: string | null
  lead_time: string | null
  country: string | null
  country_iso: string | null
}

interface Props {
  project: { id: string; name: string }
  allShortlisted: RawShortlistRow[]
  supplierDirRows: SupplierDirRow[]
  allQuotes: RawQuoteRow[]
  compareIds: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPence(pence: number | null, currency: string): string {
  if (pence === null) return "Not logged"
  const pounds = pence / 100
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$"
  return `${symbol}${pounds.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function extractCertifications(certifications: unknown): string[] {
  if (!certifications) return []
  if (Array.isArray(certifications)) return certifications.map(String).slice(0, 5)
  if (typeof certifications === "string") return [certifications]
  if (typeof certifications === "object") {
    const c = certifications as Record<string, unknown>
    const list = c.list ?? c.certifications ?? []
    if (Array.isArray(list)) return list.map(String).slice(0, 5)
  }
  return []
}

function extractMoq(minOrder: string | null): string | null {
  return minOrder ?? null
}

function bestQuoteForSupplier(
  quotes: RawQuoteRow[],
  supplierId: string
): RawQuoteRow | null {
  const sq = quotes.filter((q) => q.supplier_id === supplierId)
  const priced = sq.filter((q) => q.quote_amount_pence !== null)
  if (priced.length > 0) {
    return priced.reduce((b, q) =>
      (q.quote_amount_pence as number) < (b.quote_amount_pence as number) ? q : b
    )
  }
  return sq[0] ?? null
}

function minLeadTimeForSupplier(
  quotes: RawQuoteRow[],
  supplierId: string
): number | null {
  const days = quotes
    .filter((q) => q.supplier_id === supplierId && q.lead_time_days !== null)
    .map((q) => q.lead_time_days as number)
  return days.length > 0 ? Math.min(...days) : null
}

const STATUS_LABELS: Record<string, string> = {
  researching: "Researching",
  contacted: "Contacted",
  quoting: "Quoting",
  negotiating: "Negotiating",
  selected: "Selected",
  rejected: "Rejected",
}

// ─── Row component ───────────────────────────────────────────────────────────

function CompareRow({
  label,
  cells,
}: {
  label: string
  cells: React.ReactNode[]
}) {
  return (
    <div className="grid border-t" style={{ gridTemplateColumns: `160px repeat(${cells.length}, 1fr)` }}>
      <div className="p-3 bg-muted/40 text-xs font-medium text-muted-foreground flex items-start">
        {label}
      </div>
      {cells.map((cell, i) => (
        <div key={i} className="p-3 text-sm text-foreground border-l">
          {cell}
        </div>
      ))}
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function CompareView({
  project,
  allShortlisted,
  supplierDirRows,
  allQuotes,
  compareIds,
}: Props) {
  const base = `/the-forge-v2/projects/${project.id}`
  const router = useRouter()

  const [selectedIds, setSelectedIds] = useState<string[]>(compareIds.slice(0, 4))

  const dirById = new Map<string, SupplierDirRow>()
  for (const r of supplierDirRows) dirById.set(r.id, r)

  const shortlistById = new Map<string, RawShortlistRow>()
  for (const r of allShortlisted) shortlistById.set(r.supplier_id, r)

  // The suppliers to display in columns
  const displayRows = selectedIds
    .map((id) => shortlistById.get(id))
    .filter((r): r is RawShortlistRow => !!r)

  function toggleSupplier(supplierId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(supplierId)) {
        if (prev.length <= 2) return prev // minimum 2
        const next = prev.filter((id) => id !== supplierId)
        router.replace(`${base}/suppliers/compare?ids=${next.join(",")}`, { scroll: false })
        return next
      }
      if (prev.length >= 4) return prev // maximum 4
      const next = [...prev, supplierId]
      router.replace(`${base}/suppliers/compare?ids=${next.join(",")}`, { scroll: false })
      return next
    })
  }

  const colCount = displayRows.length

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
        <span className="text-foreground font-medium">Compare</span>
      </nav>

      {/* ── Page header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Compare suppliers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select 2 to 4 shortlisted suppliers to compare side by side.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`${base}/suppliers/shortlist`}>Back to shortlist</Link>
        </Button>
      </div>

      {/* ── Supplier selector chips ─────────────────── */}
      {allShortlisted.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-6" role="group" aria-label="Select suppliers to compare">
          {allShortlisted.map((r) => {
            const selected = selectedIds.includes(r.supplier_id)
            return (
              <button
                key={r.supplier_id}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selected
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                }`}
                onClick={() => toggleSupplier(r.supplier_id)}
                aria-pressed={selected}
              >
                {r.supplier_name}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────── */}
      {allShortlisted.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">
            No suppliers shortlisted yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Add suppliers to your shortlist before comparing them.
          </p>
          <Button asChild size="sm">
            <Link href={`${base}/suppliers`}>Go to suppliers</Link>
          </Button>
        </div>
      )}

      {/* ── Comparison table ─────────────────────────── */}
      {displayRows.length >= 1 && (
        <div className="rounded-lg border overflow-hidden">
          {/* Header row — supplier names */}
          <div className="grid bg-muted/30" style={{ gridTemplateColumns: `160px repeat(${colCount}, 1fr)` }}>
            <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Field
            </div>
            {displayRows.map((r) => (
              <div key={r.supplier_id} className="p-3 border-l">
                <div className="font-semibold text-sm text-foreground">
                  {r.supplier_name}
                </div>
              </div>
            ))}
          </div>

          {/* Status */}
          <CompareRow
            label="Status"
            cells={displayRows.map((r) => (
              <Badge key={r.supplier_id} variant="outline" className="text-[10px]">
                {STATUS_LABELS[r.status] ?? r.status}
              </Badge>
            ))}
          />

          {/* Location */}
          <CompareRow
            label="Location"
            cells={displayRows.map((r) => {
              const dir = dirById.get(r.supplier_id)
              return (
                <span key={r.supplier_id} className="text-muted-foreground">
                  {dir?.country ?? dir?.country_iso ?? "Not recorded"}
                </span>
              )
            })}
          />

          {/* Category */}
          <CompareRow
            label="Category"
            cells={displayRows.map((r) => {
              const dir = dirById.get(r.supplier_id)
              return (
                <span key={r.supplier_id} className="text-muted-foreground capitalize">
                  {dir?.category ?? "Not recorded"}
                </span>
              )
            })}
          />

          {/* Certifications */}
          <CompareRow
            label="Certifications"
            cells={displayRows.map((r) => {
              const dir = dirById.get(r.supplier_id)
              const certs = extractCertifications(dir?.certifications)
              return certs.length > 0 ? (
                <div key={r.supplier_id} className="flex flex-wrap gap-1">
                  {certs.map((c) => (
                    <Badge key={c} variant="outline" className="text-[10px]">
                      {c}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span key={r.supplier_id} className="text-muted-foreground">Not recorded</span>
              )
            })}
          />

          {/* Lead time (from quotes) */}
          <CompareRow
            label="Quoted lead time"
            cells={displayRows.map((r) => {
              const days = minLeadTimeForSupplier(allQuotes, r.supplier_id)
              return (
                <span key={r.supplier_id} className={days ? "text-foreground" : "text-muted-foreground"}>
                  {days ? `${days} days` : "No quote logged"}
                </span>
              )
            })}
          />

          {/* Minimum order quantity */}
          <CompareRow
            label="Minimum order quantity"
            cells={displayRows.map((r) => {
              const dir = dirById.get(r.supplier_id)
              const moq = extractMoq(dir?.minimum_order ?? null)
              return (
                <span key={r.supplier_id} className={moq ? "text-foreground" : "text-muted-foreground"}>
                  {moq ?? "Not recorded"}
                </span>
              )
            })}
          />

          {/* Best quote */}
          <CompareRow
            label="Best quote received"
            cells={displayRows.map((r) => {
              const q = bestQuoteForSupplier(allQuotes, r.supplier_id)
              if (!q) {
                return (
                  <span key={r.supplier_id} className="text-muted-foreground">No quote logged</span>
                )
              }
              return (
                <div key={r.supplier_id} className="space-y-0.5">
                  <div className="font-semibold text-foreground">
                    {formatPence(q.quote_amount_pence, q.currency)}
                    {q.volume && (
                      <span className="font-normal text-muted-foreground ml-1">
                        / {q.volume.toLocaleString("en-GB")} units
                      </span>
                    )}
                  </div>
                  {q.valid_until && (
                    <div className="text-xs text-muted-foreground">
                      Valid until: {q.valid_until}
                    </div>
                  )}
                </div>
              )
            })}
          />
        </div>
      )}
    </div>
  )
}
