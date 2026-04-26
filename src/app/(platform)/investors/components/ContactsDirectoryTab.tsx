"use client"

/**
 * @file ContactsDirectoryTab.tsx
 *
 * @description Dense, searchable directory of ~49,000 investor contacts from
 * the vc_pe_contacts table. Shows name, title, firm, email (tier-gated),
 * LinkedIn, decision-maker badge, and notes. Supports text search with
 * debounce, boolean filter chips, and load-more pagination.
 *
 * FLOW: Mounted inside InvestorPageTabs as the "Contacts" tab content.
 * Calls searchContacts server action for data.
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Search,
  X,
  Users,
  Shield,
  Mail,
  ExternalLink,
  Loader2,
  FileText,
} from "lucide-react"
import {
  searchContacts,
  type ContactSearchResult,
  type ContactSearchFilters,
} from "@/actions/investors"
import { ContactDetailDialog } from "./ContactDetailDialog"
import Link from "next/link"

// ---------------------------------------------------------------------------
// Filter chip type
// ---------------------------------------------------------------------------

type FilterChip = "all" | "decision_makers" | "with_email" | "with_bio"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactsDirectoryTab(): React.ReactElement {
  // State
  const [contacts, setContacts] = useState<ContactSearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Contact detail dialog
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Set<FilterChip>>(new Set())

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // INTENT: Debounce search input by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  // Build filters from state
  const buildFilters = useCallback(
    (pageNum: number): ContactSearchFilters => ({
      query: debouncedQuery || undefined,
      decisionMakersOnly: activeFilters.has("decision_makers"),
      withEmailOnly: activeFilters.has("with_email"),
      withBioOnly: activeFilters.has("with_bio"),
      page: pageNum,
      pageSize: 50,
    }),
    [debouncedQuery, activeFilters],
  )

  // Fetch contacts (initial / filter change)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPage(1)

    searchContacts(buildFilters(1)).then((result) => {
      if (cancelled) return
      setContacts(result.contacts)
      setTotal(result.total)
      setHasMore(result.hasMore)
      setLoading(false)
    }).catch((err) => {
      console.error("[ContactsDirectoryTab] fetch error:", err)
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [buildFilters])

  // Load more handler
  const handleLoadMore = useCallback(async () => {
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const result = await searchContacts(buildFilters(nextPage))
      setContacts((prev) => [...prev, ...result.contacts])
      setHasMore(result.hasMore)
      setPage(nextPage)
    } catch (err) {
      console.error("[ContactsDirectoryTab] load more error:", err)
    } finally {
      setLoadingMore(false)
    }
  }, [page, buildFilters])

  // Filter chip config
  const filterChips: { key: FilterChip; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "decision_makers", label: "Decision Makers", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "with_email", label: "With Email", icon: <Mail className="h-3.5 w-3.5" /> },
    { key: "with_bio", label: "With Bio", icon: <FileText className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search input */}
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterChips.map((chip) => {
            const isActive = chip.key === "all"
              ? activeFilters.size === 0
              : activeFilters.has(chip.key)
            return (
              <Button
                key={chip.key}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (chip.key === "all") {
                    setActiveFilters(new Set())
                  } else {
                    setActiveFilters(prev => {
                      const next = new Set(prev)
                      if (next.has(chip.key)) next.delete(chip.key)
                      else next.add(chip.key)
                      return next
                    })
                  }
                }}
                className={cn(
                  "h-8 text-xs gap-1.5",
                  isActive && "bg-international-orange hover:bg-international-orange/90",
                )}
              >
                {chip.icon}
                {chip.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {contacts.length.toLocaleString()} of {total.toLocaleString()} contacts
        </span>
        {debouncedQuery && (
          <span className="text-xs">
            Searching: &quot;{debouncedQuery}&quot;
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <ContactsTableSkeleton />
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-3 mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No contacts found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {debouncedQuery
              ? "Try a different search term or adjust your filters."
              : "No contacts match the current filters."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/50">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Title</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Firm</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Email</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 w-10">LinkedIn</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 w-10">DM</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <ContactRow key={contact.id} contact={contact} onSelect={setSelectedContactId} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-2"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more contacts"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Contact detail dialog */}
      <ContactDetailDialog
        contactId={selectedContactId}
        open={selectedContactId !== null}
        onOpenChange={(open) => { if (!open) setSelectedContactId(null) }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contact row
// ---------------------------------------------------------------------------

function ContactRow({ contact, onSelect }: { contact: ContactSearchResult; onSelect: (id: string) => void }): React.ReactElement {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
      {/* Name — clickable to open detail dialog */}
      <td className="px-4 py-2.5">
        <button
          onClick={() => onSelect(contact.id)}
          className="font-medium text-foreground hover:text-international-orange transition-colors text-left"
        >
          {contact.full_name}
        </button>
        {contact.seniority && (
          <span className="ml-1.5 text-xs text-muted-foreground">({contact.seniority})</span>
        )}
      </td>

      {/* Title */}
      <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
        {contact.title ?? "-"}
      </td>

      {/* Firm — linked to investor detail */}
      <td className="px-4 py-2.5">
        <Link
          href={`/investors/${contact.listing_id}`}
          className="text-international-orange hover:underline truncate block max-w-[200px]"
        >
          {contact.firm_name}
        </Link>
      </td>

      {/* Email — tier-gated */}
      <td className="px-4 py-2.5">
        <EmailCell
          email={contact.email}
          hasEmail={contact.has_email}
          emailTier={contact.email_tier}
          emailVerified={contact.email_verified}
        />
      </td>

      {/* LinkedIn */}
      <td className="px-4 py-2.5">
        {contact.linkedin_url ? (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`${contact.full_name} LinkedIn profile`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <span className="text-muted-foreground/40">-</span>
        )}
      </td>

      {/* Decision Maker */}
      <td className="px-4 py-2.5">
        {contact.is_decision_maker && (
          <Badge variant="success" className="text-xs">
            DM
          </Badge>
        )}
      </td>

      {/* Notes — hidden on mobile */}
      <td className="px-4 py-2.5 hidden lg:table-cell max-w-[250px]">
        <span className="text-xs text-muted-foreground truncate block">
          {contact.notes ? (contact.notes.length > 80 ? `${contact.notes.slice(0, 80)}...` : contact.notes) : "-"}
        </span>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Email cell (blurred when gated)
// ---------------------------------------------------------------------------

// INTENT: Compact tier-aware verification badge for the dense contacts directory table.
// Smaller than the PartnerCard variant since it sits inline with the email address.
function renderTierBadgeSmall(tier: string | null, verified: boolean | null): React.ReactElement | null {
  if (tier === 'corresponded' || tier === 'hunter_verified' || tier === 'neverbounce_valid') {
    return <Badge variant="success" size="sm" className="text-[10px] py-0">Verified</Badge>
  }
  if (tier === 'neverbounce_catchall') {
    return <Badge variant="warning" size="sm" className="text-[10px] py-0">Catchall</Badge>
  }
  if (tier === 'neverbounce_unknown') {
    return <Badge variant="warning" size="sm" className="text-[10px] py-0">Unknown</Badge>
  }
  if (tier === 'unverified' || tier === 'generic_blocked') {
    return <Badge variant="warning" size="sm" className="text-[10px] py-0">Unverified</Badge>
  }
  if (tier === 'neverbounce_invalid' || tier === 'bounced') {
    return <Badge variant="destructive" size="sm" className="text-[10px] py-0">Invalid</Badge>
  }
  if (tier === 'neverbounce_disposable') {
    return <Badge variant="destructive" size="sm" className="text-[10px] py-0">Disposable</Badge>
  }
  if (!tier && verified) {
    return <Badge variant="success" size="sm" className="text-[10px] py-0">Verified</Badge>
  }
  return null
}

function EmailCell({
  email,
  hasEmail,
  emailTier,
  emailVerified,
}: {
  email: string | null
  hasEmail: boolean
  emailTier: string | null
  emailVerified: boolean | null
}): React.ReactElement {
  // User has access and email exists
  if (email) {
    const badge = renderTierBadgeSmall(emailTier, emailVerified)
    return (
      <span className="inline-flex items-center gap-1.5 max-w-[260px]">
        <a
          href={`mailto:${email}`}
          className="text-foreground hover:text-international-orange transition-colors text-xs truncate block max-w-[200px]"
        >
          {email}
        </a>
        {badge}
      </span>
    )
  }

  // Email exists but user lacks tier access — show blurred placeholder with Pro badge
  if (hasEmail) {
    return (
      <span className="relative inline-flex items-center gap-1.5">
        <span
          className="text-xs text-muted-foreground select-none"
          style={{ filter: "blur(4px)" }}
          aria-hidden="true"
        >
          name@example.com
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-international-orange text-international-orange">
          Pro
        </Badge>
      </span>
    )
  }

  // No email at all
  return <span className="text-muted-foreground/40 text-xs">-</span>
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ContactsTableSkeleton(): React.ReactElement {
  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/50">
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Title</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Firm</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Email</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5 w-10">LinkedIn</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5 w-10">DM</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-36" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-4" /></td>
                <td className="px-4 py-2.5"><Skeleton className="h-4 w-8" /></td>
                <td className="px-4 py-2.5 hidden lg:table-cell"><Skeleton className="h-4 w-40" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
