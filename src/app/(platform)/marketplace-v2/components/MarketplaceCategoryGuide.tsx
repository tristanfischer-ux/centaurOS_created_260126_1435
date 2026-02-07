'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Wrench, Package, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FoundryContext } from '@/actions/foundry-context'
import type { MarketplaceCategory } from '../hooks/useMarketplaceState'

interface MarketplaceCategoryGuideProps {
    activeCategory: MarketplaceCategory
    foundryContext?: FoundryContext
    onSelectSubcategory: (subcategory: string) => void
    /** Whether the user has already applied filters (hides the guide) */
    hasFiltersActive: boolean
}

/** Category-specific guidance config */
const CATEGORY_GUIDES: Record<Exclude<MarketplaceCategory, 'All'>, {
    question: string
    icon: React.ElementType
    options: { label: string; subcategory: string; description: string }[]
}> = {
    People: {
        question: 'What kind of person are you looking for?',
        icon: Users,
        options: [
            { label: 'Fractional Executive', subcategory: 'Fractional Executive', description: 'Part-time C-level leadership (CFO, CTO, CMO)' },
            { label: 'Consultant', subcategory: 'Consultant', description: 'Expert advice on strategy, operations, or technology' },
            { label: 'Contractor', subcategory: 'Contractor', description: 'Hands-on work for a defined project or timeframe' },
            { label: 'Virtual Assistant', subcategory: 'Virtual Assistant', description: 'Administrative support, scheduling, and coordination' },
            { label: 'Specialist', subcategory: 'Specialist', description: 'Deep expertise in a specific domain or skill' },
        ],
    },
    Services: {
        question: 'What kind of service do you need?',
        icon: Wrench,
        options: [
            { label: 'Legal', subcategory: 'Legal', description: 'Contracts, IP, compliance, corporate law' },
            { label: 'Financial', subcategory: 'Financial', description: 'Accounting, tax, bookkeeping, financial planning' },
            { label: 'HR', subcategory: 'HR', description: 'Recruiting, payroll, people operations' },
            { label: 'Marketing', subcategory: 'Marketing', description: 'Brand, content, digital marketing, PR' },
            { label: 'Design', subcategory: 'Design', description: 'UI/UX, graphic design, creative direction' },
            { label: 'Development', subcategory: 'Development', description: 'Software, web, mobile, infrastructure' },
        ],
    },
    Products: {
        question: 'What kind of product are you sourcing?',
        icon: Package,
        options: [
            { label: 'Manufacturer', subcategory: 'Manufacturer', description: 'Contract manufacturing and production' },
            { label: 'Machine Capacity', subcategory: 'Machine Capacity', description: 'CNC, 3D printing, and machine time' },
            { label: 'Material', subcategory: 'Material', description: 'Raw materials and supplies' },
            { label: 'Post-Processing', subcategory: 'Post-Processing', description: 'Finishing, coating, and treatment' },
            { label: 'Quality', subcategory: 'Quality', description: 'Testing, inspection, and certification' },
        ],
    },
}

export function MarketplaceCategoryGuide({
    activeCategory,
    foundryContext,
    onSelectSubcategory,
    hasFiltersActive,
}: MarketplaceCategoryGuideProps) {
    // Only show for specific categories, not All, and not when filters are already active
    if (activeCategory === 'All' || hasFiltersActive) return null

    const guide = CATEGORY_GUIDES[activeCategory]
    if (!guide) return null

    const Icon = guide.icon

    // Build contextual framing if we have foundry data
    const stage = foundryContext?.stage
    const industry = foundryContext?.industry
    const contextParts: string[] = []
    if (industry) contextParts.push(industry)
    if (stage) contextParts.push(`${stage} stage`)

    return (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Contextual framing */}
            {contextParts.length > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <HelpCircle className="h-3 w-3 shrink-0" />
                    Foundries in <strong className="text-foreground">{contextParts.join(' at ')}</strong> commonly
                    work with {activeCategory.toLowerCase()} in these areas:
                </p>
            )}

            {/* Question + options */}
            <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium text-foreground">{guide.question}</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {guide.options.map(opt => (
                            <button
                                key={opt.subcategory}
                                onClick={() => onSelectSubcategory(opt.subcategory)}
                                className={cn(
                                    'text-left p-3 rounded-lg border bg-background',
                                    'hover:border-electric-blue/40 hover:shadow-sm transition-all duration-150',
                                )}
                            >
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-sm font-medium">{opt.label}</span>
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0 ml-2">
                                        Select
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-1">{opt.description}</p>
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
