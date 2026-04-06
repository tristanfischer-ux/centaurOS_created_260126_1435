"use client"

/**
 * @file MarketplacePageTabs.tsx
 *
 * @description Tab wrapper for the Marketplace page.
 * "For You" tab (default) shows AI-matched suppliers.
 * "Browse All" tab shows the existing directory/filter view.
 *
 * FLOW: Mirrors InvestorPageTabs pattern.
 */

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Sparkles, Grid3X3 } from "lucide-react"
import { SupplierMatchView } from "./SupplierMatchView"

interface MarketplacePageTabsProps {
  browseContent: ReactNode
}

export function MarketplacePageTabs({ browseContent }: MarketplacePageTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<"for-you" | "browse">("for-you")

  return (
    <div className="space-y-6">
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
          Suppliers
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "for-you" && <SupplierMatchView />}
      {activeTab === "browse" && <div className="space-y-6">{browseContent}</div>}
    </div>
  )
}
