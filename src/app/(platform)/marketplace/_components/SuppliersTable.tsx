'use client'

/**
 * @file SuppliersTable.tsx
 *
 * @description Phase B of the /marketplace Forge Capital port (tracker
 * #13). Renders inside the Suppliers tab of `MarketplaceTabs`. Mirrors
 * the Nightshift Supplier Dashboard's Suppliers tab layout
 * (Nightshift-Supplier-Dashboard.html lines 185-219):
 *
 *   - Free-text search box
 *   - 4 filter dropdowns: Category / Country / Status / Quality
 *   - Paginated table (Name · Category · Country · Industries · Score · Verified)
 *   - "← Prev / Page N of M / Next →" pagination
 *
 * @related src/actions/suppliers-directory.ts (server actions)
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import {
  getSuppliersDirectoryPage,
  type SuppliersDirectoryRow,
  type SuppliersDirectoryFacets,
  type SuppliersDirectoryPageResult,
} from '@/actions/suppliers-directory'

interface SuppliersTableProps {
  facets: SuppliersDirectoryFacets
  initialPage: SuppliersDirectoryPageResult
}

const QUALITY_OPTIONS = [
  { value: '0',  label: 'All quality' },
  { value: '80', label: '80+ (High)'  },
  { value: '60', label: '60+ (Good)'  },
  { value: '40', label: '40+ (Fair)'  },
  { value: '20', label: '20+ (Low)'   },
]

const PAGE_SIZE = 20

function formatCount(n: number): string {
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

export function SuppliersTable({ facets, initialPage }: SuppliersTableProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'' | 'Products' | 'Services'>('')
  const [country, setCountry] = useState('')
  const [status, setStatus] = useState('')
  const [minScore, setMinScore] = useState('0')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<SuppliersDirectoryPageResult>(initialPage)
  const [isPending, startTransition] = useTransition()

  // Stable debounced search trigger so typing fires one query per ~250ms.
  const debouncedSetSearch = useMemo(
    () => debounce((v: string) => setSearch(v), 250),
    [],
  )

  // Re-fetch whenever any filter changes. Resets page to 1 except for
  // explicit page changes.
  useEffect(() => {
    startTransition(async () => {
      const r = await getSuppliersDirectoryPage({
        search,
        category,
        country,
        status,
        minScore: parseInt(minScore, 10) || 0,
        page,
        pageSize: PAGE_SIZE,
      })
      setResult(r)
    })
  }, [search, category, country, status, minScore, page])

  // Reset to page 1 on filter change.
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, country, status, minScore])

  const { rows, total, totalPages } = result
  const safePage = Math.min(page, Math.max(1, totalPages))
  const fromIdx = (safePage - 1) * PAGE_SIZE + 1
  const toIdx = Math.min(safePage * PAGE_SIZE, total)

  return (
    <div className="space-y-4">
      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search supplier name…"
            onChange={(e) => debouncedSetSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/40"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/40"
        >
          <option value="">All categories</option>
          <option value="Products">Products</option>
          <option value="Services">Services</option>
        </select>

        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/40"
        >
          <option value="">All countries</option>
          {facets.countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({formatCount(c.count)})
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/40"
        >
          <option value="">All statuses</option>
          {facets.statuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/40"
        >
          {QUALITY_OPTIONS.map((q) => (
            <option key={q.value} value={q.value}>{q.label}</option>
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
          'No suppliers match these filters.'
        ) : (
          <span>
            Showing <strong className="text-foreground">{formatCount(fromIdx)}–{formatCount(toIdx)}</strong> of <strong className="text-foreground">{formatCount(total)}</strong>
          </span>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Supplier</th>
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Category</th>
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Country</th>
                <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Industries</th>
                <th className="text-right px-3 py-2 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => (
                <SupplierRow key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          {/* W26: disabled no longer includes isPending — removing isPending
              from the guard allows the user to click Next/Prev while a fetch
              is in-flight. The useEffect dependency on `page` triggers a new
              startTransition fetch immediately, superseding the old one.
              Keeping the opacity hint on isPending for the counter only. */}
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-international-orange/50 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={safePage >= totalPages}
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-international-orange/50 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Row component ──────────────────────────────────────────────────────────

function SupplierRow({ row }: { row: SuppliersDirectoryRow }) {
  const router = useRouter()
  const verified = row.isVerified
  const scoreClass = row.score == null
    ? 'text-muted-foreground'
    : row.score >= 70 ? 'text-success'
    : row.score >= 40 ? 'text-warning'
    : 'text-destructive'

  // W42: whole row is navigable. External-link icon stops propagation so it
  // opens the website without also triggering row navigation.
  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    // Don't navigate when the user clicked the external-link icon
    if ((e.target as HTMLElement).closest('a[target="_blank"]')) return
    router.push(`/marketplace/${row.id}`)
  }

  return (
    <tr
      className="hover:bg-muted/20 transition-colors cursor-pointer"
      onClick={handleRowClick}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Name is still a Link for right-click / open-in-new-tab UX */}
          <Link
            href={`/marketplace/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-foreground hover:text-international-orange truncate"
          >
            {row.title}
          </Link>
          {verified && (
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" aria-label="Verified" />
          )}
          {row.websiteUrl && (
            <a
              href={row.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-international-orange shrink-0"
              aria-label="Website"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {row.subcategory && (
          <div className="text-[11px] text-muted-foreground truncate">{row.subcategory}</div>
        )}
      </td>
      <td className="px-3 py-2 hidden sm:table-cell">
        <span className="inline-block text-[10px] uppercase tracking-wider text-muted-foreground">
          {row.category}
        </span>
      </td>
      <td className="px-3 py-2 hidden md:table-cell text-muted-foreground text-xs">
        {[row.city, row.country].filter(Boolean).join(', ') || '—'}
      </td>
      <td className="px-3 py-2 hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {row.industries.slice(0, 2).map((ind) => (
            <span key={ind} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {ind}
            </span>
          ))}
        </div>
      </td>
      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${scoreClass}`}>
        {row.score != null ? row.score : '—'}
      </td>
    </tr>
  )
}
