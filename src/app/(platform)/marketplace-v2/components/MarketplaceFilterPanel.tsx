'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFiltersForCategory } from '@/lib/marketplace-filter-config'
import type { AdvancedFilters } from '@/actions/marketplace'
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
    /** Current advanced filter values */
    advancedFilters: AdvancedFilters
    /** Update a single advanced filter value */
    onAdvancedFilterChange: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void
}

/**
 * Context-aware filter panel showing subcategory badges and advanced filters.
 *
 * @description Renders subcategory selection (existing behavior) plus advanced filters
 * that appear based on the active category. Uses MARKETPLACE_FILTERS config to determine
 * which filters are relevant.
 */
export function MarketplaceFilterPanel({
    subcategories,
    selectedSubcategories,
    onToggleSubcategory,
    onClear,
    activeCategory,
    advancedFilters,
    onAdvancedFilterChange,
}: MarketplaceFilterPanelProps) {
    const categoryKey = activeCategory === 'All' ? '' : (activeCategory ?? '')
    const contextFilters = categoryKey ? getFiltersForCategory(categoryKey) : getFiltersForCategory('')

    // Contextual question based on category
    const question = activeCategory === 'People'
        ? 'What kind of person are you looking for?'
        : activeCategory === 'Services'
            ? 'What kind of service do you need?'
            : activeCategory === 'Products'
                ? 'What kind of product are you sourcing?'
                : 'Subcategories'

    return (
        <div className="bg-muted/50 rounded-xl border p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Subcategory section — existing behavior */}
            {subcategories.length > 0 && (
                <div className="space-y-3">
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
                    {selectedSubcategories.size === 0 && subcategories.some(s => SUBCATEGORY_DESCRIPTIONS[s]) && (
                        <p className="text-[11px] text-muted-foreground">
                            Hover over a subcategory to see its description, or click to filter.
                        </p>
                    )}
                </div>
            )}

            {/* Advanced Filters — context-aware based on active category */}
            {contextFilters.length > 0 && (
                <>
                    {subcategories.length > 0 && <div className="border-t border-border" />}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-foreground">Advanced Filters</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {contextFilters.map((filter) => {
                                switch (filter.type) {
                                    case 'toggle':
                                        return (
                                            <button
                                                key={filter.id}
                                                onClick={() =>
                                                    onAdvancedFilterChange(
                                                        filter.id as keyof AdvancedFilters,
                                                        !advancedFilters[filter.id as keyof AdvancedFilters] as never
                                                    )
                                                }
                                                className={cn(
                                                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                                                    'min-h-[44px] border',
                                                    advancedFilters[filter.id as keyof AdvancedFilters]
                                                        ? 'bg-foreground text-background border-foreground'
                                                        : 'bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                                                )}
                                                aria-pressed={!!advancedFilters[filter.id as keyof AdvancedFilters]}
                                            >
                                                {advancedFilters[filter.id as keyof AdvancedFilters] && (
                                                    <Check className="h-3.5 w-3.5" />
                                                )}
                                                {filter.label}
                                            </button>
                                        )

                                    case 'select':
                                        return (
                                            <div key={filter.id} className="space-y-1">
                                                <label className="text-xs text-muted-foreground">{filter.label}</label>
                                                <Select
                                                    value={String(advancedFilters[filter.id as keyof AdvancedFilters] ?? '')}
                                                    onValueChange={(val) =>
                                                        onAdvancedFilterChange(
                                                            filter.id as keyof AdvancedFilters,
                                                            (val === '' ? undefined : val === 'Full-time' || val === 'Part-time' || val === 'Contract' || val === 'Freelance' ? val : Number(val)) as never
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder={`Select ${filter.label.toLowerCase()}`} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {filter.options?.map((opt) => (
                                                            <SelectItem key={opt.value} value={opt.value}>
                                                                {opt.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )

                                    case 'text':
                                        return (
                                            <div key={filter.id} className="space-y-1">
                                                <label className="text-xs text-muted-foreground">{filter.label}</label>
                                                <Input
                                                    value={String(advancedFilters[filter.id as keyof AdvancedFilters] ?? '')}
                                                    onChange={(e) =>
                                                        onAdvancedFilterChange(
                                                            filter.id as keyof AdvancedFilters,
                                                            (e.target.value || undefined) as never
                                                        )
                                                    }
                                                    placeholder={filter.placeholder}
                                                    className="w-full"
                                                />
                                            </div>
                                        )

                                    case 'range':
                                        return (
                                            <div key={filter.id} className="space-y-1 sm:col-span-2">
                                                <label className="text-xs text-muted-foreground">{filter.label}</label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        value={advancedFilters.minRate ?? ''}
                                                        onChange={(e) =>
                                                            onAdvancedFilterChange(
                                                                'minRate',
                                                                e.target.value ? Number(e.target.value) : undefined
                                                            )
                                                        }
                                                        placeholder="Min"
                                                        className="w-full"
                                                    />
                                                    <span className="text-muted-foreground text-sm">—</span>
                                                    <Input
                                                        type="number"
                                                        value={advancedFilters.maxRate ?? ''}
                                                        onChange={(e) =>
                                                            onAdvancedFilterChange(
                                                                'maxRate',
                                                                e.target.value ? Number(e.target.value) : undefined
                                                            )
                                                        }
                                                        placeholder="Max"
                                                        className="w-full"
                                                    />
                                                </div>
                                            </div>
                                        )

                                    case 'multiselect':
                                        return (
                                            <div key={filter.id} className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                                                <label className="text-xs text-muted-foreground">{filter.label}</label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {filter.options?.map((opt) => {
                                                        const selected = (advancedFilters.skills ?? []).includes(opt.value)
                                                        return (
                                                            <button
                                                                key={opt.value}
                                                                onClick={() => {
                                                                    const current = advancedFilters.skills ?? []
                                                                    const next = selected
                                                                        ? current.filter((s) => s !== opt.value)
                                                                        : [...current, opt.value]
                                                                    onAdvancedFilterChange('skills', next.length > 0 ? next : undefined)
                                                                }}
                                                                className={cn(
                                                                    'px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150',
                                                                    'min-h-[32px]',
                                                                    selected
                                                                        ? 'bg-foreground text-background'
                                                                        : 'bg-background text-muted-foreground border hover:bg-secondary hover:text-foreground'
                                                                )}
                                                                aria-pressed={selected}
                                                            >
                                                                {opt.label}
                                                                {selected && <X className="inline-block ml-1 h-3 w-3" />}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )

                                    default:
                                        return null
                                }
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
