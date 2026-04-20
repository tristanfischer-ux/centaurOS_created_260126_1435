'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/money/raise', label: 'Pipeline', match: /^\/money\/raise\/?$/ },
  { href: '/money/raise/for-you', label: 'For you', match: /^\/money\/raise\/for-you/ },
  { href: '/money/raise/browse', label: 'Browse', match: /^\/money\/raise\/browse/ },
  { href: '/money/raise/contacts', label: 'Contacts', match: /^\/money\/raise\/contacts/ },
  { href: '/money/raise/grants', label: 'Grants', match: /^\/money\/raise\/grants/ },
  { href: '/money/raise/thesis', label: 'Thesis', match: /^\/money\/raise\/thesis/ },
  { href: '/money/raise/pitch', label: 'Pitch prep', match: /^\/money\/raise\/pitch/ },
  { href: '/money/raise/update', label: 'Updates', match: /^\/money\/raise\/update/ },
] as const

export function RaiseSubNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav
      aria-label="Raise sections"
      className="flex flex-wrap items-center gap-1 border-b border-border pb-0"
    >
      {TABS.map((tab) => {
        const active = tab.match.test(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-3 py-2 -mb-px text-sm font-medium border-b-2 transition-colors',
              active
                ? 'border-international-orange text-international-orange'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
