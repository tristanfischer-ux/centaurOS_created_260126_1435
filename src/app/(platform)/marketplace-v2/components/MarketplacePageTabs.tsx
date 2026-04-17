"use client"

/**
 * @file MarketplacePageTabs.tsx
 *
 * @description Tab wrapper for the Marketplace page.
 * "Recommended" tab (default) shows scored supplier matches.
 * "Suppliers" tab shows the existing directory/filter view.
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
      {/* Tab bar — WAI-ARIA tablist with keyboard navigation */}
      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Marketplace views"
      >
        <button
          id="marketplace-tab-for-you"
          role="tab"
          aria-selected={activeTab === "for-you"}
          aria-controls="marketplace-tabpanel-for-you"
          tabIndex={activeTab === "for-you" ? 0 : -1}
          onClick={() => setActiveTab("for-you")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault()
              setActiveTab("browse")
              document.getElementById("marketplace-tab-browse")?.focus()
            }
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "for-you"
              ? "border-international-orange text-international-orange"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
          )}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Recommended
        </button>
        <button
          id="marketplace-tab-browse"
          role="tab"
          aria-selected={activeTab === "browse"}
          aria-controls="marketplace-tabpanel-browse"
          tabIndex={activeTab === "browse" ? 0 : -1}
          onClick={() => setActiveTab("browse")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault()
              setActiveTab("for-you")
              document.getElementById("marketplace-tab-for-you")?.focus()
            }
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "browse"
              ? "border-international-orange text-international-orange"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
          )}
        >
          <Grid3X3 className="h-4 w-4" aria-hidden="true" />
          Suppliers
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "for-you" && (
        <div role="tabpanel" id="marketplace-tabpanel-for-you" aria-labelledby="marketplace-tab-for-you">
          <SupplierMatchView />
        </div>
      )}
      {activeTab === "browse" && (
        <div
          className="space-y-6"
          role="tabpanel"
          id="marketplace-tabpanel-browse"
          aria-labelledby="marketplace-tab-browse"
        >
          {browseContent}
        </div>
      )}
    </div>
  )
}
