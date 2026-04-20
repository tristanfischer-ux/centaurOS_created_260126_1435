/**
 * @file /money/raise/contacts/page.tsx
 *
 * Searchable directory of ~49,000 VC/PE partners from `vc_pe_contacts`.
 * Restores the legacy /investors → "Contacts" tab surface into the new
 * Money/Raise information architecture. Shared searchContacts action is
 * reused verbatim (see src/actions/investors.ts).
 *
 * URL params:
 *   q          — free-text query (name / title), >=3 chars triggers semantic
 *   firm       — client-side post-filter on firm_name (substring, case-insens)
 *   role       — client-side post-filter on title (substring, case-insens)
 *   seniority  — client-side post-filter on seniority (exact match)
 *   dm         — "1" to show decision-makers only (passed to action)
 *   page       — 1-based page number
 *
 * Pagination is server-side (50 per page). `firm`/`role`/`seniority` are
 * refinement filters applied client-side against the current page because
 * the legacy action does not accept them as first-class params — spec
 * explicitly permits adapting the UI to whatever the action provides.
 */

import { searchContacts } from '@/actions/investors'
import { ContactsView } from './contacts-view'

export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  firm?: string
  role?: string
  seniority?: string
  dm?: string
  page?: string
}

export default async function ContactsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = Math.max(parseInt(params.page ?? '1', 10) || 1, 1)
  const pageSize = 50
  const query = (params.q ?? '').trim()
  const firm = (params.firm ?? '').trim()
  const role = (params.role ?? '').trim()
  const seniority = (params.seniority ?? '').trim()
  const decisionMakersOnly = params.dm === '1'

  const { contacts, total, hasMore } = await searchContacts({
    query: query || undefined,
    decisionMakersOnly,
    page,
    pageSize,
  })

  return (
    <ContactsView
      contacts={contacts}
      total={total}
      hasMore={hasMore}
      initial={{
        q: query,
        firm,
        role,
        seniority,
        decisionMakersOnly,
        page,
        pageSize,
      }}
    />
  )
}
