'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MarketplaceCategory } from '../hooks/useMarketplaceState'

/** Subcategory descriptions from the former CategoryGuide, keyed by subcategory name */
const SUBCATEGORY_DESCRIPTIONS: Record<string, string> = {
    // People
    'Fractional Executive': 'Part-time C-level leadership (CFO, CTO, CMO)',
    'Consultant': 'Expert advice on strategy, operations, or technology',
    'Contractor': 'Hands-on work for a defined project or timeframe',
    'Virtual Assistant': 'Administrative support, scheduling, and coordination',
    'Specialist': 'Deep expertise in a specific domain or skill',
    // Services
    'Legal': 'Contracts, IP, compliance, corporate law',
    'Financial': 'Accounting, tax, bookkeeping, financial planning',
    'HR': 'Recruiting, payroll, people operations',
    'Marketing': 'Brand, content, digital marketing, PR',
    'Design': 'UI/UX, graphic design, creative direction',
    'Development': 'Software, web, mobile, infrastructure',
    // Products
    'Manufacturer': 'Contract manufacturing and production',
    'Machine Capacity': 'CNC, 3D printing, and machine time',
    'Material': 'Raw materials and supplies',
    'Post-Processing': 'Finishing, coating, and treatment',
    'Quality': 'Testing, inspection, and certification',
}

interface MarketplaceFilterPanelProps {
    /** Available subcategories for the current category */
    subcategories: string[]
    /** Currently selected subcategories */
    selectedSubcategories: Set<string>
    /** Toggle a subcategory selection */
    onToggleSubcategory: (sub: string) => void
    /** Clear all selected subcategories */
    onClear: () => void
    /** The active category, used for contextual question text */
    activeCategory?: MarketplaceCategory
}

/**
 * Collapsible filter panel showing subcategory badges with descriptions.
 *
 * @description Replaces both the former MarketplaceFilterPanel and MarketplaceCategoryGuide.
 * When auto-expanded after category selection, the descriptions help users understand
 * what each subcategory means without needing a separate guide component.
 */
export function MarketplaceFilterPanel({
    subcategories,
    selectedSubcategories,
    onToggleSubcategory,
    onClear,
    activeCategory,
}: MarketplaceFilterPanelProps) {
    if (subcategories.length === 0) return null

    // Contextual question based on category
    const question = activeCategory === 'People'
        ? 'What kind of person are you looking for?'
        : activeCategory === 'Services'
            ? 'What kind of service do you need?'
            : activeCategory === 'Products'
                ? 'What kind of product are you sourcing?'
                : 'Subcategories'

    return (
        <div className="bg-muted/50 rounded-xl border p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">{question}</h3>
                {selectedSubcategories.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs">
                        <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                {subcategories.map((sub) => {
                    const isActive = selectedSubcategories.has(sub)
                    const description = SUBCATEGORY_DESCRIPTIONS[sub]
                    return (
                        <button
                            key={sub}
                            onClick={() => onToggleSubcategory(sub)}
                            className={cn(
                                'group text-left px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                                'min-h-[44px]',
                                isActive
                                    ? 'bg-foreground text-background shadow-sm'
                                    : 'bg-background text-muted-foreground border hover:bg-secondary hover:text-foreground'
                            )}
                            aria-pressed={isActive}
                            title={description || undefined}
                        >
                            {sub}
                            {isActive && (
                                <X className="inline-block ml-1.5 h-3 w-3" />
                            )}
                        </button>
                    )
                })}
            </div>
            {/* Show descriptions for unselected state to help guide choice */}
            {selectedSubcategories.size === 0 && subcategories.some(s => SUBCATEGORY_DESCRIPTIONS[s]) && (
                <p className="text-[11px] text-muted-foreground">
                    Hover over a subcategory to see its description, or click to filter.
                </p>
            )}
        </div>
    )
}
