"use client"

/**
 * @file InvestorPageTabs.tsx
 *
 * @description Tab wrapper for the Investors page with 5 tabs:
 * For You (AI-matched), Browse All (directory), Contacts, Portfolio, Grants.
 * Matches Forge Capital dashboard's tabbed structure for full data parity.
 */

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Sparkles, Grid3X3, Users, Briefcase, Award } from "lucide-react"
import { InvestorMatchView } from "./InvestorMatchView"

type TabId = "for-you" | "browse" | "contacts" | "portfolio" | "grants"

interface InvestorPageTabsProps {
  browseContent: ReactNode
  contactsContent?: ReactNode
  portfolioContent?: ReactNode
  grantsContent?: ReactNode
  /** Record counts for tab labels */
  contactCount?: number
  portfolioCount?: number
  grantsCount?: number
}

const TAB_CONFIG: { id: TabId; label: string; icon: typeof Sparkles; countKey?: keyof Pick<InvestorPageTabsProps, 'contactCount' | 'portfolioCount' | 'grantsCount'> }[] = [
  { id: "for-you", label: "For You", icon: Sparkles },
  { id: "browse", label: "Investors", icon: Grid3X3 },
  { id: "contacts", label: "Contacts", icon: Users, countKey: "contactCount" },
  { id: "portfolio", label: "Portfolio", icon: Briefcase, countKey: "portfolioCount" },
  { id: "grants", label: "Grants", icon: Award, countKey: "grantsCount" },
]

export function InvestorPageTabs({
  browseContent,
  contactsContent,
  portfolioContent,
  grantsContent,
  contactCount,
  portfolioCount,
  grantsCount,
}: InvestorPageTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>("for-you")

  const counts: Record<string, number | undefined> = { contactCount, portfolioCount, grantsCount }

  return (
    <div className="space-y-6">
      {/* Tab bar — scrollable on mobile */}
      <div className="relative">
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-hide">
          {TAB_CONFIG.map(({ id, label, icon: Icon, countKey }) => {
            const count = countKey ? counts[countKey] : undefined
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                  activeTab === id
                    ? "border-international-orange text-international-orange"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {count != null && count > 0 && (
                  <span className={cn(
                    "text-xs tabular-nums",
                    activeTab === id ? "text-international-orange/70" : "text-muted-foreground/60",
                  )}>
                    ({count.toLocaleString()})
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* Scroll fade indicators for mobile */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" />
      </div>

      {/* Tab content */}
      {activeTab === "for-you" && <InvestorMatchView />}
      {activeTab === "browse" && <div className="space-y-6">{browseContent}</div>}
      {activeTab === "contacts" && (contactsContent ?? <TabPlaceholder label="Contacts" />)}
      {activeTab === "portfolio" && (portfolioContent ?? <TabPlaceholder label="Portfolio" />)}
      {activeTab === "grants" && (grantsContent ?? <TabPlaceholder label="Grants" />)}
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
