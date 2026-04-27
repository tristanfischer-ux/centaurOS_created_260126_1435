'use client'

/**
 * @file ContactsTable.tsx
 *
 * @description Phase C of the /marketplace Forge Capital port (tracker
 * #13). Renders inside the Contacts tab of `MarketplaceTabs`. Mirrors
 * the Forge Capital Nightshift Supplier Dashboard's Contacts tab.
 *
 * Source data: `attributes.key_people` arrays on supplier rows in
 * `marketplace_listings` (heterogeneous shapes — strings, pipe-delimited,
 * objects). Normalised by `normaliseKeyPerson` in the server action.
 *
 * Free-tier UX: free users see counts but masked names ("J***** S******")
 * to give them a feel for breadth without giving away the directory.
 *
 * @related src/actions/suppliers-directory.ts (server actions)
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, Loader2 } from 'lucide-react'
import {
  getSupplierContactsPage,
  type SupplierContactsFacets,
  type SupplierContactsPageResult,
} from '@/actions/suppliers-directory'

interface ContactsTableProps {
  facets: SupplierContactsFacets
  initialPage: SupplierContactsPageResult
  /** When true, contact names render fully; otherwise masked. */
  isPaid: boolean
}

const PAGE_SIZE = 25

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return n.toLocaleString()
}

function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout> | undefined
  return ((...args: Parameters<F>) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as F
}

/** Mask a name for free tier: keep initial of first/last, blank the rest. */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.map(p => (p.length > 1 ? p[0] + '*'.repeat(Math.min(p.length - 1, 6)) : p)).join(' ')
}

export function ContactsTable({ facets, initialPage, isPaid }: ContactsTableProps) {
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<SupplierContactsPageResult>(initialPage)
  const [isPending, startTransition] = useTransition()

  const debouncedSetSearch = useMemo(
    () => debounce((v: string) => setSearch(v), 250),
    [],
  )

  useEffect(() => {
    startTransition(async () => {
      const r = await getSupplierContactsPage({
        search,
        country,
        page,
        pageSize: PAGE_SIZE,
      })
      setResult(r)
    })
  }, [search, country, page])

  // Reset to page 1 on filter change.
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, country])

  const { rows, total, totalPages } = result
  const safePage = Math.min(page, Math.max(1, totalPages))
  const fromIdx = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const toIdx = Math.min(safePage * PAGE_SIZE, total)

  return (
    <div className="space-y-4">
      {/* ── Header stats ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <strong className="text-foreground">{fmt(facets.totalContacts)} contacts</strong>
        <span className="text-muted-foreground text-xs">
          across {fmt(facets.suppliersWithContacts)} suppliers
        </span>
        {!isPaid && (
          <span className="ml-auto text-[11px] text-muted-foreground italic">
            Names masked on the free tier — <Link href="/pricing" className="underline text-international-orange hover:opacity-80">unlock contacts</Link>
          </span>
        )}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, title or supplier…"
            onChange={(e) => debouncedSetSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/40"
          />
        </div>

        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/40"
        >
          <option value="">All countries</option>
          {facets.countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({fmt(c.count)})
            </option>
          ))}
        </select>
      </div>

      {/* ── Result count ─────────────────────────────────────────────────── */}
      <div className="text-xs text-muted-foreground">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </span>
        ) : total === 0 ? (
          'No contacts match these filters.'
        ) : (
          <span>
            Showing <strong className="text-foreground">{fmt(fromIdx)}–{fmt(toIdx)}</strong> of <strong className="text-foreground">{fmt(total)}</strong>
          </span>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Name</th>
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Title</th>
                <th className="text-left px-3 py-2 font-semibold">Supplier</th>
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Country</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {isPaid ? r.name : <span className="text-muted-foreground">{maskName(r.name)}</span>}
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell text-xs text-muted-foreground">
                    {r.title || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/marketplace/${r.supplierId}`}
                      className="text-international-orange hover:underline"
                    >
                      {r.supplierName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground">
                    {r.supplierCountry || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1 || isPending}
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-international-orange/50 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages || isPending}
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-international-orange/50 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
