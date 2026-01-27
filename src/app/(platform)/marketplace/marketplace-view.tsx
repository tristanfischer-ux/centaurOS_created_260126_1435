'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { ComparisonBar } from "@/components/marketplace/comparison-bar"
import { ComparisonModal } from "@/components/marketplace/comparison-modal"
import { MarketCard } from "@/components/marketplace/market-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"

interface MarketplaceViewProps {
    initialListings: MarketplaceListing[]
}

export function MarketplaceView({ initialListings }: MarketplaceViewProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isComparisonOpen, setIsComparisonOpen] = useState(false)
    const [activeTab, setActiveTab] = useState("People")

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) {
            next.delete(id)
        } else {
            // Limit to 3 items for reasonable comparison UI
            if (next.size >= 3) {
                // optionally alert user, for now simple limit
                return
            }
            next.add(id)
        }
        setSelectedIds(next)
    }

    const clearSelection = () => setSelectedIds(new Set())

    // Filter items based on active tab
    const filteredItems = initialListings.filter(item => item.category === activeTab)

    // Sub-tab logic could go here if we want strictly separated sub-tabs
    // For now we show all in category, maybe grouping by subcategory visually

    const selectedItems = initialListings.filter(item => selectedIds.has(item.id))

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-serif font-medium tracking-tight">Centaur Marketplace</h1>
                    <p className="text-muted-foreground">Access global expertise, industrial capacity, and autonomous agents.</p>
                </div>

                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); clearSelection() }} className="w-full">
                    <TabsList className="grid w-full max-w-md grid-cols-4 mb-8">
                        <TabsTrigger value="People">People</TabsTrigger>
                        <TabsTrigger value="Products">Products</TabsTrigger>
                        <TabsTrigger value="Services">Services</TabsTrigger>
                        <TabsTrigger value="AI">AI</TabsTrigger>
                    </TabsList>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
                        {filteredItems.map(item => (
                            <MarketCard
                                key={item.id}
                                listing={item}
                                isSelected={selectedIds.has(item.id)}
                                onToggleSelect={toggleSelect}
                            />
                        ))}
                    </div>

                    {filteredItems.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
                            No listings found in this category yet.
                        </div>
                    )}
                </Tabs>
            </div>

            <ComparisonBar
                selectedItems={selectedItems}
                onClear={clearSelection}
                onCompare={() => setIsComparisonOpen(true)}
                onRemove={(id) => toggleSelect(id)}
            />

            <ComparisonModal
                open={isComparisonOpen}
                onOpenChange={setIsComparisonOpen}
                items={selectedItems}
            />
        </div>
    )
}
