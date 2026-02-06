'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MarketplaceFilterPanelProps {
    subcategories: string[]
    selectedSubcategories: Set<string>
    onToggleSubcategory: (sub: string) => void
    onClear: () => void
}

export function MarketplaceFilterPanel({
    subcategories,
    selectedSubcategories,
    onToggleSubcategory,
    onClear,
}: MarketplaceFilterPanelProps) {
    if (subcategories.length === 0) return null

    return (
        <div className="bg-muted/50 rounded-xl border p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Subcategories</h3>
                {selectedSubcategories.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs">
                        <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                {subcategories.map((sub) => {
                    const isActive = selectedSubcategories.has(sub)
                    return (
                        <button
                            key={sub}
                            onClick={() => onToggleSubcategory(sub)}
                            className={cn(
                                'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                                'min-h-[36px]',
                                isActive
                                    ? 'bg-foreground text-background shadow-sm'
                                    : 'bg-background text-muted-foreground border hover:bg-secondary hover:text-foreground'
                            )}
                            aria-pressed={isActive}
                        >
                            {sub}
                            {isActive && (
                                <X className="inline-block ml-1.5 h-3 w-3" />
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
