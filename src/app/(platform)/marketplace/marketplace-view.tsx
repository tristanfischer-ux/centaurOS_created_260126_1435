'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { ComparisonBar } from "@/components/marketplace/comparison-bar"
import { ComparisonModal } from "@/components/marketplace/comparison-modal"
import { MarketCard } from "@/components/marketplace/market-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { CreateRFQDialog } from "./create-rfq-dialog"
import { useState, useMemo, useEffect } from "react"
import { Loader2, Store, Search } from "lucide-react"

interface MarketplaceViewProps {
    initialListings: MarketplaceListing[]
}

export function MarketplaceView({ initialListings }: MarketplaceViewProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isComparisonOpen, setIsComparisonOpen] = useState(false)
    const [activeTab, setActiveTab] = useState("People")
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery)
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

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

    // Filter items based on active tab and search query
    const filteredItems = useMemo(() => {
        let filtered = initialListings.filter(item => item.category === activeTab)
        
        // Apply search filter if query exists
        if (debouncedSearchQuery.trim()) {
            const query = debouncedSearchQuery.toLowerCase().trim()
            filtered = filtered.filter(item => 
                item.title.toLowerCase().includes(query) ||
                (item.description && item.description.toLowerCase().includes(query))
            )
        }
        
        return filtered
    }, [initialListings, activeTab, debouncedSearchQuery])

    // Sub-tab logic could go here if we want strictly separated sub-tabs
    // For now we show all in category, maybe grouping by subcategory visually

    const selectedItems = initialListings.filter(item => selectedIds.has(item.id))

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-3xl font-serif font-medium tracking-tight">Centaur Marketplace</h1>
                            <p className="text-muted-foreground">Access global expertise, industrial capacity, and autonomous agents.</p>
                        </div>
                        <CreateRFQDialog />
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); clearSelection(); setSearchQuery('') }} className="w-full">
                    <div className="flex flex-col gap-4 mb-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search listings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 w-full max-w-md"
                            />
                        </div>
                        {selectedIds.size === 0 && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                💡 Select up to 3 items to compare
                            </p>
                        )}
                        <TabsList className="grid w-full max-w-md grid-cols-4">
                            <TabsTrigger value="People">People</TabsTrigger>
                            <TabsTrigger value="Products">Products</TabsTrigger>
                            <TabsTrigger value="Services">Services</TabsTrigger>
                            <TabsTrigger value="AI">AI</TabsTrigger>
                        </TabsList>
                    </div>

                    {initialListings.length === 0 ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
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
                    )}

                    {filteredItems.length === 0 && (
                        <div className="col-span-full border-2 border-dashed border-slate-200 rounded-xl">
                            <EmptyState
                                icon={<Store className="h-12 w-12" />}
                                title={debouncedSearchQuery.trim() ? "No listings match your search" : "No listings found in this category yet"}
                                description={debouncedSearchQuery.trim() ? "Try adjusting your search terms or browse other categories." : "Check back later or browse other categories."}
                            />
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
