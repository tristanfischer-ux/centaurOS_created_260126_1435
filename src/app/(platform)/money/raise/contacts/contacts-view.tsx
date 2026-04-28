'use client'

/**
 * @file contacts-view.tsx
 *
 * Dense, searchable directory of ~49,000 VC/PE partners. Reuses the legacy
 * `searchContacts` action from `@/actions/investors`. URL-backed state so
 * back/forward + deep-links work.
 *
 * Filter model:
 *  - q          server-side (name / title)
 *  - dm         server-side (decision-makers only)
 *  - firm       client-side (substring, case-insens) — post-filter on the
 *               current page. Unavoidable because the legacy action does not
 *               expose firm_name as a first-class filter.
 *  - role       client-side (substring on title, case-insens)
 *  - seniority  client-side (substring, case-insens) — populated from the
 *               seniority values present on the current page.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Search,
  X,
  Mail,
  Linkedin,
  Copy,
  Check,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { ContactSearchResult } from '@/actions/investors'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InitialState = {
  q: string
  firm: string
  role: string
  seniority: string
  decisionMakersOnly: boolean
  page: number
  pageSize: number
}

type ContactsViewProps = {
  contacts: ContactSearchResult[]
  total: number
  hasMore: boolean
  initial: InitialState
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function buildQuery(args: {
  q: string
  firm: string
  role: string
  seniority: string
  decisionMakersOnly: boolean
  page: number
}): string {
  const params = new URLSearchParams()
  if (args.q) params.set('q', args.q)
  if (args.firm) params.set('firm', args.firm)
  if (args.role) params.set('role', args.role)
  if (args.seniority) params.set('seniority', args.seniority)
  if (args.decisionMakersOnly) params.set('dm', '1')
  if (args.page > 1) params.set('page', String(args.page))
  return params.toString()
}

// ---------------------------------------------------------------------------
// Initial avatar
// ---------------------------------------------------------------------------

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <div
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
    >
      {initials || '?'}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ContactRow({ contact }: { contact: ContactSearchResult }) {
  const [copied, setCopied] = useState(false)

  const handleCopyEmail = async () => {
    if (!contact.email) return
    try {
      await navigator.clipboard.writeText(contact.email)
      setCopied(true)
      toast.success(`Copied ${contact.email}`)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy email — clipboard blocked')
    }
  }

  return (
    <li className="group flex items-center gap-4 border-b border-border bg-background px-3 py-3 transition-colors last:border-0 hover:bg-muted/40">
      <Avatar name={contact.full_name} />

      {/* Name + title */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {contact.full_name}
          </h3>
          {contact.is_decision_maker && (
            <Badge
              variant="outline"
              className="h-5 border-emerald-500/40 bg-emerald-50 px-1.5 text-[10px] text-emerald-700"
            >
              <ShieldCheck className="mr-1 h-3 w-3" />
              Decision maker
            </Badge>
          )}
        </div>
        {contact.title && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {contact.title}
          </p>
        )}
      </div>

      {/* Firm */}
      <div className="hidden min-w-0 flex-1 md:block">
        {contact.listing_id ? (
          <Link
            href={`/money/raise/investor/${contact.listing_id}`}
            className="truncate text-sm text-international-orange hover:underline"
            title={contact.firm_name}
          >
            {contact.firm_name}
          </Link>
        ) : (
          <span className="truncate text-sm text-muted-foreground" title={contact.firm_name}>
            {contact.firm_name}
          </span>
        )}
      </div>

      {/* Seniority chip */}
      <div className="hidden w-24 shrink-0 lg:block">
        {contact.seniority ? (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {contact.seniority}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Contact actions */}
      <div className="flex shrink-0 items-center gap-1">
        {contact.email ? (
          <>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              aria-label={`Email ${contact.full_name}`}
            >
              <a href={`mailto:${contact.email}`}>
                <Mail className="h-4 w-4" />
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={handleCopyEmail}
              aria-label={`Copy email for ${contact.full_name}`}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </>
        ) : contact.has_email ? (
          <Badge
            variant="outline"
            className="h-6 border-international-orange/60 px-1.5 text-[10px] text-international-orange"
            title="Upgrade to reveal email"
          >
            Pro
          </Badge>
        ) : null}

        {contact.linkedin_url && (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            aria-label={`${contact.full_name} on LinkedIn`}
          >
            <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
              <Linkedin className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ContactsView({ contacts, total, hasMore, initial }: ContactsViewProps) {
  const router = useRouter()

  // Local (debounced) state for q; firm/role/seniority are URL-synced on blur
  // or submit to avoid firing a push per keystroke.
  const [q, setQ] = useState(initial.q)
  const [firm, setFirm] = useState(initial.firm)
  const [role, setRole] = useState(initial.role)
  const [seniority, setSeniority] = useState(initial.seniority)
  const [dm, setDm] = useState(initial.decisionMakersOnly)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local state when server-driven URL changes land
  useEffect(() => {
    setQ(initial.q)
  }, [initial.q])
  useEffect(() => {
    setFirm(initial.firm)
  }, [initial.firm])
  useEffect(() => {
    setRole(initial.role)
  }, [initial.role])
  useEffect(() => {
    setSeniority(initial.seniority)
  }, [initial.seniority])
  useEffect(() => {
    setDm(initial.decisionMakersOnly)
  }, [initial.decisionMakersOnly])

  // Debounced q push (400ms) — spec requirement
  useEffect(() => {
    if (q === initial.q) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const qs = buildQuery({
        q,
        firm: initial.firm,
        role: initial.role,
        seniority: initial.seniority,
        decisionMakersOnly: initial.decisionMakersOnly,
        page: 1,
      })
      router.push(`/money/raise/contacts${qs ? `?${qs}` : ''}`)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const pushState = (overrides: Partial<InitialState> = {}) => {
    const qs = buildQuery({
      q: overrides.q ?? q,
      firm: overrides.firm ?? firm,
      role: overrides.role ?? role,
      seniority: overrides.seniority ?? seniority,
      decisionMakersOnly: overrides.decisionMakersOnly ?? dm,
      page: overrides.page ?? 1,
    })
    router.push(`/money/raise/contacts${qs ? `?${qs}` : ''}`)
  }

  const applyRefinement = () => {
    pushState({ firm, role, seniority, page: 1 })
  }

  const clearAll = () => {
    setQ('')
    setFirm('')
    setRole('')
    setSeniority('')
    setDm(false)
    router.push('/money/raise/contacts')
  }

  // Client-side refinement: firm / role / seniority substrings applied to the
  // current server page. Honest caveat: cross-page matches that fall outside
  // the current 50 are not surfaced — the action doesn't expose these filters.
  const refinedContacts = useMemo(() => {
    const firmLc = initial.firm.toLowerCase()
    const roleLc = initial.role.toLowerCase()
    const seniorityLc = initial.seniority.toLowerCase()
    if (!firmLc && !roleLc && !seniorityLc) return contacts
    return contacts.filter((c) => {
      if (firmLc && !c.firm_name.toLowerCase().includes(firmLc)) return false
      if (roleLc && !(c.title ?? '').toLowerCase().includes(roleLc)) return false
      if (seniorityLc && !(c.seniority ?? '').toLowerCase().includes(seniorityLc))
        return false
      return true
    })
  }, [contacts, initial.firm, initial.role, initial.seniority])

  const hasActiveFilter =
    !!initial.q ||
    !!initial.firm ||
    !!initial.role ||
    !!initial.seniority ||
    initial.decisionMakersOnly

  const resultCountLabel = `${refinedContacts.length.toLocaleString()} of ${total.toLocaleString()} partner${total === 1 ? '' : 's'}`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            VC/PE partners directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {resultCountLabel} · search 49,000+ partners at funds worldwide.
          </p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        {/* Primary search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or title (e.g. Sarah Chen, Partner)"
            className="pl-9 pr-9"
            aria-label="Search partners by name or title"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Refinement row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="filter-firm" className="text-xs">
              Firm
            </Label>
            <Input
              id="filter-firm"
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              onBlur={applyRefinement}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyRefinement()
              }}
              placeholder="e.g. Sequoia"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="filter-role" className="text-xs">
              Role
            </Label>
            <Input
              id="filter-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onBlur={applyRefinement}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyRefinement()
              }}
              placeholder="e.g. Partner, Principal"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="filter-seniority" className="text-xs">
              Seniority
            </Label>
            <Input
              id="filter-seniority"
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              onBlur={applyRefinement}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyRefinement()
              }}
              placeholder="e.g. senior"
              className="mt-1 h-9"
            />
          </div>
        </div>

        {/* Quick toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={dm ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              const next = !dm
              setDm(next)
              pushState({ decisionMakersOnly: next, page: 1 })
            }}
            className={cn(
              'h-8 gap-1.5 text-xs',
              dm && 'bg-international-orange hover:bg-international-orange/90',
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Decision makers only
          </Button>
          {hasActiveFilter && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-8 gap-1.5 text-xs text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {refinedContacts.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No partners match"
          description="Try broadening your search — fewer keywords, or clear a filter."
        />
      ) : (
        <div className="rounded-lg border border-border bg-background">
          <ul className="divide-y divide-border">
            {refinedContacts.map((c) => (
              <ContactRow key={c.id} contact={c} />
            ))}
          </ul>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {initial.page} · {initial.pageSize} per page
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={initial.page <= 1}
            onClick={() => pushState({ page: Math.max(1, initial.page - 1) })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore}
            onClick={() => pushState({ page: initial.page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
