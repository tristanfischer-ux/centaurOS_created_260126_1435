"use client"

/**
 * @file InvestorBreadcrumb.tsx
 *
 * @description SessionStorage-backed breadcrumb trail for investor navigation.
 * Shows the path through the investor network: Directory > Firm A > Firm B > ...
 * Each segment is clickable. Trail resets when navigating to /investors directory.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

const STORAGE_KEY = 'investor-breadcrumb-trail'
const MAX_DEPTH = 10

interface BreadcrumbEntry {
  id: string
  name: string
}

export function InvestorBreadcrumb({ investorId, investorName }: { investorId: string; investorName: string }) {
  const pathname = usePathname()
  const [trail, setTrail] = useState<BreadcrumbEntry[]>([])

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      let current: BreadcrumbEntry[] = stored ? JSON.parse(stored) : []

      // If we're already in the trail, truncate to that point (user clicked a breadcrumb or went back)
      const existingIdx = current.findIndex(e => e.id === investorId)
      if (existingIdx >= 0) {
        current = current.slice(0, existingIdx + 1)
      } else {
        // Add new entry
        current.push({ id: investorId, name: investorName })
        // Cap depth
        if (current.length > MAX_DEPTH) {
          current = current.slice(current.length - MAX_DEPTH)
        }
      }

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current))
      setTrail(current)
    } catch {
      // sessionStorage unavailable (SSR, private browsing)
      setTrail([{ id: investorId, name: investorName }])
    }
  }, [investorId, investorName, pathname])

  return (
    <nav aria-label="Investor navigation trail" className="flex items-center gap-1 text-sm flex-wrap">
      <Link
        href="/investors"
        className="text-muted-foreground hover:text-international-orange transition-colors flex items-center gap-1"
        onClick={() => {
          try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
        }}
      >
        <Home className="h-3.5 w-3.5" />
        Directory
      </Link>

      {trail.map((entry, idx) => {
        const isLast = idx === trail.length - 1
        return (
          <span key={entry.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            {isLast ? (
              <span className="font-medium text-foreground">{entry.name}</span>
            ) : (
              <Link
                href={`/investors/${entry.id}`}
                className="text-muted-foreground hover:text-international-orange transition-colors"
              >
                {entry.name}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
