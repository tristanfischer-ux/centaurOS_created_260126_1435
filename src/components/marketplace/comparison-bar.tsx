'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, GitCompare, User, Bot, Package, Briefcase, MapPin, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface ComparisonBarProps {
    selectedItems: MarketplaceListing[]
    onClear: () => void
    onCompare: () => void
    onRemove: (id: string) => void
}

// Get category icon
function getCategoryIcon(category: string) {
    switch (category) {
        case 'People': return User
        case 'AI': return Bot
        case 'Products': return Package
        case 'Services': return Briefcase
        default: return Package
    }
}

// Get category color classes
function getCategoryColors(category: string) {
    switch (category) {
        case 'People': return 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700'
        case 'AI': return 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900 dark:text-violet-300 dark:border-violet-700'
        case 'Products': return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'
        case 'Services': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700'
        default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
    }
}

// Get a key metric for the item
function getKeyMetric(item: MarketplaceListing): { icon: typeof MapPin; value: string } | null {
    const attrs = item.attributes || {}
    
    if (item.category === 'People') {
        if (attrs.years_experience) return { icon: Clock, value: `${attrs.years_experience}y exp` }
        if (attrs.location) return { icon: MapPin, value: attrs.location }
    }
    if (item.category === 'Products') {
        if (attrs.location) return { icon: MapPin, value: attrs.location }
    }
    if (attrs.location) return { icon: MapPin, value: attrs.location }
    
    return null
}

export function ComparisonBar({ selectedItems, onClear, onCompare, onRemove }: ComparisonBarProps) {
    if (selectedItems.length === 0) return null

    return (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 w-full max-w-4xl px-4 pointer-events-none">
            <Card className="shadow-xl bg-card border-t-2 border-t-international-orange pointer-events-auto">
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                        <GitCompare className="w-4 h-4 text-international-orange" />
                        <span className="text-sm font-medium text-foreground">
                            Comparing {selectedItems.length} item{selectedItems.length !== 1 && 's'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={onClear} 
                            className="text-muted-foreground hover:text-foreground text-xs h-8 px-3"
                        >
                            Clear all
                        </Button>
                        <Button
                            size="sm"
                            variant="default"
                            onClick={onCompare}
                            className="h-8 px-4"
                            disabled={selectedItems.length < 2}
                        >
                            Compare
                        </Button>
                    </div>
                </div>
                
                {/* Selected items row - horizontal scroll */}
                <div className="px-4 py-3 overflow-x-auto">
                    <div className="flex gap-3 min-w-min">
                        {selectedItems.map(item => {
                            const CategoryIcon = getCategoryIcon(item.category)
                            const colorClasses = getCategoryColors(item.category)
                            const metric = getKeyMetric(item)
                            const MetricIcon = metric?.icon
                            
                            return (
                                <div 
                                    key={item.id} 
                                    className={cn(
                                        "relative group flex items-center gap-3 px-3 py-2 rounded-lg border min-w-[200px] max-w-[280px]",
                                        colorClasses
                                    )}
                                >
                                    {/* Category icon */}
                                    <div className="flex-shrink-0 w-8 h-8 rounded-md bg-white/50 dark:bg-black/20 flex items-center justify-center">
                                        <CategoryIcon className="w-4 h-4" />
                                    </div>
                                    
                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" title={item.title}>
                                            {item.title}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs opacity-80">
                                            <span>{item.subcategory}</span>
                                            {metric && MetricIcon && (
                                                <>
                                                    <span className="opacity-50">•</span>
                                                    <span className="flex items-center gap-1">
                                                        <MetricIcon className="w-3 h-3" />
                                                        {metric.value}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Remove button */}
                                    <button
                                        onClick={() => onRemove(item.id)}
                                        aria-label={`Remove ${item.title} from comparison`}
                                        className="flex-shrink-0 w-6 h-6 rounded-full bg-white/50 dark:bg-black/20 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </Card>
        </div>
    )
}
