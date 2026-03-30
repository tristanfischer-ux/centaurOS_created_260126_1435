"use client"

/**
 * @file InvestorPageTabs.tsx
 *
 * @description Tab wrapper for the Investors page.
 * "For You" tab (default) shows AI-matched investors.
 * "Browse All" tab shows the existing directory/filter view.
 */

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Sparkles, Grid3X3 } from "lucide-react"
import { InvestorMatchView } from "./InvestorMatchView"

interface InvestorPageTabsProps {
  browseContent: ReactNode
  /** Content rendered above the tab bar (e.g. specialist banner) */
  headerContent?: ReactNode
}

export function InvestorPageTabs({ browseContent, headerContent }: InvestorPageTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<"for-you" | "browse">("for-you")

  return (
    <div className="space-y-6">
      {/* Specialist banner above tabs */}
      {headerContent}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("for-you")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "for-you"
              ? "border-international-orange text-international-orange"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
          )}
        >
          <Sparkles className="h-4 w-4" />
          For You
        </button>
        <button
          onClick={() => setActiveTab("browse")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "browse"
              ? "border-international-orange text-international-orange"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
          )}
        >
          <Grid3X3 className="h-4 w-4" />
          Browse All
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "for-you" && <InvestorMatchView />}
      {activeTab === "browse" && <div className="space-y-6">{browseContent}</div>}
    </div>
  )
}
