'use client'

import { cn } from '@/lib/utils'
import { Users, Package, Wrench, Bot, LayoutGrid } from 'lucide-react'
import type { MarketplaceCategory } from '../hooks/useMarketplaceState'

const CATEGORY_CONFIG: Record<MarketplaceCategory, {
    icon: React.ElementType
    activeClasses: string
}> = {
    All: { icon: LayoutGrid, activeClasses: 'bg-foreground text-background' },
    People: { icon: Users, activeClasses: 'bg-international-orange text-white' },
    Products: { icon: Package, activeClasses: 'bg-secondary-foreground text-background' },
    Services: { icon: Wrench, activeClasses: 'bg-electric-blue text-white' },
    AI: { icon: Bot, activeClasses: 'bg-status-info text-white' },
}

interface MarketplaceCategoryNavProps {
    activeCategory: MarketplaceCategory
    onCategoryChange: (category: MarketplaceCategory) => void
    counts: Record<string, number>
}

export function MarketplaceCategoryNav({
    activeCategory,
    onCategoryChange,
    counts,
}: MarketplaceCategoryNavProps) {
    const categories: MarketplaceCategory[] = ['All', 'People', 'Products', 'Services', 'AI']

    return (
        <nav aria-label="Marketplace categories" className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {categories.map((cat) => {
                const config = CATEGORY_CONFIG[cat]
                const Icon = config.icon
                const isActive = activeCategory === cat
                const count = counts[cat] || 0

                return (
                    <button
                        key={cat}
                        onClick={() => onCategoryChange(cat)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium',
                            'transition-all duration-200 whitespace-nowrap shrink-0',
                            'min-h-[44px]',
                            isActive
                                ? config.activeClasses
                                : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground'
                        )}
                        aria-pressed={isActive}
                        aria-label={`${cat === 'All' ? 'All categories' : cat} (${count})`}
                    >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>{cat === 'AI' ? 'AI Tools' : cat}</span>
                        <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full min-w-[24px] text-center',
                            isActive
                                ? 'bg-white/20'
                                : 'bg-background'
                        )}>
                            {count}
                        </span>
                    </button>
                )
            })}
        </nav>
    )
}
