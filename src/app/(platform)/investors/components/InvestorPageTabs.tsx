"use client"

/**
 * @file InvestorPageTabs.tsx
 *
 * @description Tab wrapper for the Investors page with 6 tabs:
 * Overview, For You, Investors, Grants, Contacts.
 * Overview tab shows KPI stats + charts matching Forge Capital dashboard.
 */

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { BarChart3, Sparkles, Grid3X3, Award, Users } from "lucide-react"

type TabId = "overview" | "for-you" | "investors" | "grants" | "contacts" | "portfolio"

interface InvestorPageTabsProps {
  overviewContent?: ReactNode
  forYouContent?: ReactNode
  investorsContent: ReactNode
  contactsContent?: ReactNode
  portfolioContent?: ReactNode
  grantsContent?: ReactNode
  /** Record counts for tab labels */
  investorCount?: number
  contactCount?: number
  portfolioCount?: number
  grantsCount?: number
}

const TAB_CONFIG: {
  id: TabId
  label: string
  icon: typeof Sparkles
  countKey?: keyof Pick<InvestorPageTabsProps, 'investorCount' | 'contactCount' | 'portfolioCount' | 'grantsCount'>
}[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "for-you", label: "For You", icon: Sparkles },
  { id: "investors", label: "Investors", icon: Grid3X3, countKey: "investorCount" },
  { id: "grants", label: "Grants", icon: Award, countKey: "grantsCount" },
  { id: "contacts", label: "Contacts", icon: Users, countKey: "contactCount" },
  // Portfolio tab removed per user preference — portfolio data remains available
  // via individual investor detail pages (InvestorDetailDialog + /investors/[id]).
]

export function InvestorPageTabs({
  overviewContent,
  forYouContent,
  investorsContent,
  contactsContent,
  portfolioContent,
  grantsContent,
  investorCount,
  contactCount,
  portfolioCount,
  grantsCount,
}: InvestorPageTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>("overview")

  const counts: Record<string, number | undefined> = { investorCount, contactCount, portfolioCount, grantsCount }

  const enabledIds = TAB_CONFIG.map(({ id }) => id)

  const handleArrowKey = (e: React.KeyboardEvent, currentId: TabId) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const idx = enabledIds.indexOf(currentId)
    if (idx === -1) return
    const nextIdx = e.key === "ArrowRight"
      ? (idx + 1) % enabledIds.length
      : (idx - 1 + enabledIds.length) % enabledIds.length
    const nextId = enabledIds[nextIdx]
    setActiveTab(nextId)
    document.getElementById(`investor-tab-${nextId}`)?.focus()
  }

  return (
    <div className="space-y-6">
      {/* Tab bar — WAI-ARIA tablist, scrollable on mobile, arrow-key navigable */}
      <div className="relative">
        <div
          className="flex items-center gap-1 border-b border-border/40 overflow-x-auto scrollbar-hide"
          role="tablist"
          aria-label="Investor views"
        >
          {TAB_CONFIG.map(({ id, label, icon: Icon, countKey }) => {
            const count = countKey ? counts[countKey] : undefined
            const isActive = activeTab === id
            return (
              <button
                key={id}
                id={`investor-tab-${id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`investor-tabpanel-${id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(id)}
                onKeyDown={(e) => handleArrowKey(e, id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                  isActive
                    ? "border-international-orange text-international-orange"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                {count != null && count > 0 && (
                  <span className={cn(
                    "text-xs tabular-nums",
                    isActive ? "text-international-orange/70" : "text-muted-foreground/60",
                  )}>
                    ({count.toLocaleString()})
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" aria-hidden="true" />
      </div>

      {/* Tab content — each wrapped as a proper tabpanel with aria-labelledby */}
      {activeTab === "overview" && (
        <div role="tabpanel" id="investor-tabpanel-overview" aria-labelledby="investor-tab-overview">
          {overviewContent ?? <div />}
        </div>
      )}
      {activeTab === "for-you" && (
        <div role="tabpanel" id="investor-tabpanel-for-you" aria-labelledby="investor-tab-for-you">
          {forYouContent ?? <div />}
        </div>
      )}
      {activeTab === "investors" && (
        <div className="space-y-6" role="tabpanel" id="investor-tabpanel-investors" aria-labelledby="investor-tab-investors">
          {investorsContent}
        </div>
      )}
      {activeTab === "grants" && (
        <div role="tabpanel" id="investor-tabpanel-grants" aria-labelledby="investor-tab-grants">
          {grantsContent ?? <TabPlaceholder label="Grants" />}
        </div>
      )}
      {activeTab === "contacts" && (
        <div role="tabpanel" id="investor-tabpanel-contacts" aria-labelledby="investor-tab-contacts">
          {contactsContent ?? <TabPlaceholder label="Contacts" />}
        </div>
      )}
      {activeTab === "portfolio" && (
        <div role="tabpanel" id="investor-tabpanel-portfolio" aria-labelledby="investor-tab-portfolio">
          {portfolioContent ?? <TabPlaceholder label="Portfolio" />}
        </div>
      )}
    </div>
  )
}

function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
      {label} loading...
    </div>
  )
}
