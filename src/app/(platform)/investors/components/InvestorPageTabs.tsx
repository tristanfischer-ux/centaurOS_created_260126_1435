"use client"

/**
 * @file InvestorPageTabs.tsx
 *
 * @description Tab wrapper for the Investors page with 6 tabs:
 * Overview, For You, Investors, Grants, Contacts, Portfolio.
 * Overview tab shows KPI stats + charts matching Forge Capital dashboard.
 */

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { BarChart3, Sparkles, Grid3X3, Award, Users, Briefcase } from "lucide-react"
import { InvestorMatchView } from "./InvestorMatchView"

type TabId = "overview" | "for-you" | "investors" | "grants" | "contacts" | "portfolio"

interface InvestorPageTabsProps {
  overviewContent?: ReactNode
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
  { id: "portfolio", label: "Portfolio", icon: Briefcase, countKey: "portfolioCount" },
]

export function InvestorPageTabs({
  overviewContent,
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
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" />
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (overviewContent ?? <div />)}
      {activeTab === "for-you" && <InvestorMatchView />}
      {activeTab === "investors" && <div className="space-y-6">{investorsContent}</div>}
      {activeTab === "grants" && (grantsContent ?? <TabPlaceholder label="Grants" />)}
      {activeTab === "contacts" && (contactsContent ?? <TabPlaceholder label="Contacts" />)}
      {activeTab === "portfolio" && (portfolioContent ?? <TabPlaceholder label="Portfolio" />)}
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
