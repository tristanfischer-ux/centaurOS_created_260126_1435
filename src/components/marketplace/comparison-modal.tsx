'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, X, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface ComparisonModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    items: MarketplaceListing[]
}

// Priority attributes by category - these show first in order
const PRIORITY_ATTRIBUTES: Record<string, string[]> = {
    'People': ['rate', 'years_experience', 'location', 'availability', 'education'],
    'AI': ['cost', 'accuracy', 'latency', 'autonomy_level', 'setup_time', 'support'],
    'Products': ['rate', 'price', 'location', 'lead_time', 'certifications', 'capacity_available'],
    'Services': ['rate', 'specialty', 'location']
}

// Attributes grouped into sections for better organization
const ATTRIBUTE_SECTIONS: Record<string, Record<string, string[]>> = {
    'People': {
        'Pricing & Availability': ['rate', 'availability', 'projects_completed'],
        'Experience': ['years_experience', 'education', 'role'],
        'Skills & Location': ['skills', 'expertise', 'location', 'certifications'],
        'Other': []
    },
    'AI': {
        'Cost & Performance': ['cost', 'accuracy', 'latency'],
        'Capability': ['autonomy_level', 'model', 'training_data'],
        'Setup & Support': ['setup_time', 'support', 'integrations'],
        'Other': []
    },
    'Products': {
        'Pricing': ['rate', 'price', 'minimum_order'],
        'Logistics': ['location', 'lead_time', 'shipping'],
        'Capacity & Quality': ['capacity_available', 'certifications', 'materials'],
        'Other': []
    },
    'Services': {
        'Pricing': ['rate', 'pricing_model'],
        'Expertise': ['specialty', 'certifications', 'experience'],
        'Availability': ['location', 'availability', 'turnaround'],
        'Other': []
    }
}

// Numeric attributes where higher is better
const HIGHER_IS_BETTER = ['years_experience', 'accuracy', 'projects_completed', 'capacity_available']
// Numeric attributes where lower is better
const LOWER_IS_BETTER = ['cost', 'latency', 'setup_time', 'lead_time', 'price']

const categoryBadgeStyles: Record<string, string> = {
    'People': 'bg-stone-100 text-stone-700',
    'Products': 'bg-slate-100 text-slate-700',
    'Services': 'bg-blue-50 text-blue-700',
    'AI': 'bg-violet-50 text-violet-700'
}

export function ComparisonModal({ open, onOpenChange, items }: ComparisonModalProps) {
    if (items.length === 0) return null

    // Determine the primary category (use most common among items)
    const categoryCount = items.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1
        return acc
    }, {} as Record<string, number>)
    const primaryCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'People'

    // Extract all unique attribute keys from all items
    const allKeys = Array.from(new Set(
        items.flatMap(item => Object.keys(item.attributes))
    ))

    // Get priority attributes for sorting
    const priorityAttrs = PRIORITY_ATTRIBUTES[primaryCategory] || []
    
    // Get section config for this category
    const sectionConfig = ATTRIBUTE_SECTIONS[primaryCategory] || { 'Other': [] }
    
    // Organize attributes into sections
    const organizedSections = organizeAttributesIntoSections(allKeys, sectionConfig, priorityAttrs)
    
    // Pre-compute best values for numeric comparisons
    const bestValues = computeBestValues(items, allKeys)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b border-border">
                    <DialogTitle className="text-xl font-semibold">Compare Listings</DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6 pt-4">
                        {/* Mobile: Card Layout */}
                        <div className="block md:hidden space-y-4">
                            {items.map(item => (
                                <Card key={item.id} className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold text-base">{item.title}</h3>
                                            <Badge 
                                                variant="outline" 
                                                className={cn(
                                                    "mt-1 uppercase text-[10px] tracking-wider font-semibold border-0",
                                                    categoryBadgeStyles[item.category]
                                                )}
                                            >
                                                {item.subcategory}
                                            </Badge>
                                        </div>
                                    </div>
                                    
                                    {Object.entries(organizedSections).map(([sectionName, sectionKeys]) => {
                                        if (sectionKeys.length === 0) return null
                                        const hasAnyValue = sectionKeys.some(key => item.attributes[key] !== undefined)
                                        if (!hasAnyValue) return null
                                        
                                        return (
                                            <div key={sectionName} className="mb-4">
                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b border-border/50">
                                                    {sectionName}
                                                </h4>
                                                <dl className="space-y-2 text-sm">
                                                    {sectionKeys.map((key) => {
                                                        const value = item.attributes[key]
                                                        if (value === undefined) return null
                                                        const isBest = bestValues[key]?.itemId === item.id
                                                        
                                                        return (
                                                            <div 
                                                                key={key} 
                                                                className={cn(
                                                                    "flex justify-between items-start py-1 px-2 rounded-md",
                                                                    isBest && "bg-emerald-50 dark:bg-emerald-950/30"
                                                                )}
                                                            >
                                                                <dt className="text-muted-foreground capitalize pr-4 flex-shrink-0">
                                                                    {formatAttributeName(key)}
                                                                </dt>
                                                                <dd className="text-right flex items-center gap-1.5">
                                                                    {renderValue(value, key, items, item.id, bestValues)}
                                                                </dd>
                                                            </div>
                                                        )
                                                    })}
                                                </dl>
                                            </div>
                                        )
                                    })}
                                    
                                    <div className="pt-3 border-t border-border/50">
                                        <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Details</dt>
                                        <dd className="text-sm text-muted-foreground leading-relaxed">{item.description}</dd>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Desktop: Table Layout */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr>
                                        <th className="text-left text-sm font-medium text-muted-foreground py-3 pr-4 w-40 align-top">
                                            Attribute
                                        </th>
                                        {items.map(item => (
                                            <th key={item.id} className="text-left py-3 px-4 min-w-[180px] align-top">
                                                <div className="font-bold text-base leading-tight">{item.title}</div>
                                                <Badge 
                                                    variant="outline" 
                                                    className={cn(
                                                        "mt-2 uppercase text-[10px] tracking-wider font-semibold border-0",
                                                        categoryBadgeStyles[item.category]
                                                    )}
                                                >
                                                    {item.subcategory}
                                                </Badge>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(organizedSections).map(([sectionName, sectionKeys]) => {
                                        if (sectionKeys.length === 0) return null
                                        const hasAnyValue = sectionKeys.some(key => 
                                            items.some(item => item.attributes[key] !== undefined)
                                        )
                                        if (!hasAnyValue) return null
                                        
                                        return (
                                            <SectionGroup 
                                                key={sectionName}
                                                sectionName={sectionName}
                                                sectionKeys={sectionKeys}
                                                items={items}
                                                bestValues={bestValues}
                                            />
                                        )
                                    })}
                                    
                                    {/* Description section */}
                                    <tr className="border-t-2 border-border">
                                        <td colSpan={items.length + 1} className="py-2">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                Details
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="text-sm font-medium text-muted-foreground py-3 pr-4 align-top">
                                            Description
                                        </td>
                                        {items.map(item => (
                                            <td key={`${item.id}-desc`} className="text-sm text-muted-foreground leading-relaxed py-3 px-4 align-top">
                                                {item.description}
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

interface SectionGroupProps {
    sectionName: string
    sectionKeys: string[]
    items: MarketplaceListing[]
    bestValues: Record<string, { value: number; itemId: string; direction: 'higher' | 'lower' } | null>
}

function SectionGroup({ sectionName, sectionKeys, items, bestValues }: SectionGroupProps) {
    return (
        <>
            {/* Section header */}
            <tr className="border-t-2 border-border">
                <td colSpan={items.length + 1} className="py-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {sectionName}
                    </span>
                </td>
            </tr>
            {/* Section rows */}
            {sectionKeys.map((key) => {
                const hasAnyValue = items.some(item => item.attributes[key] !== undefined)
                if (!hasAnyValue) return null
                
                return (
                    <tr key={key} className="border-t border-border/50">
                        <td className="text-sm font-medium text-muted-foreground capitalize py-3 pr-4 align-top">
                            {formatAttributeName(key)}
                        </td>
                        {items.map(item => {
                            const value = item.attributes[key]
                            const isBest = bestValues[key]?.itemId === item.id
                            
                            return (
                                <td 
                                    key={`${item.id}-${key}`} 
                                    className={cn(
                                        "text-sm py-3 px-4 align-top transition-colors",
                                        isBest && "bg-emerald-50 dark:bg-emerald-950/30"
                                    )}
                                >
                                    <div className="flex items-center gap-1.5">
                                        {renderValue(value, key, items, item.id, bestValues)}
                                    </div>
                                </td>
                            )
                        })}
                    </tr>
                )
            })}
        </>
    )
}

function organizeAttributesIntoSections(
    allKeys: string[], 
    sectionConfig: Record<string, string[]>,
    priorityAttrs: string[]
): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    const assignedKeys = new Set<string>()
    
    // First, create sections with their defined attributes
    for (const [sectionName, sectionAttrs] of Object.entries(sectionConfig)) {
        if (sectionName === 'Other') continue
        
        // Filter to only include keys that exist in our data, preserving order from sectionAttrs
        // but prioritize priority attributes within each section
        const sectionKeys = sectionAttrs.filter(attr => allKeys.includes(attr))
        
        // Sort by priority within section
        sectionKeys.sort((a, b) => {
            const aIndex = priorityAttrs.indexOf(a)
            const bIndex = priorityAttrs.indexOf(b)
            if (aIndex === -1 && bIndex === -1) return 0
            if (aIndex === -1) return 1
            if (bIndex === -1) return -1
            return aIndex - bIndex
        })
        
        result[sectionName] = sectionKeys
        sectionKeys.forEach(key => assignedKeys.add(key))
    }
    
    // Assign remaining keys to "Other"
    const otherKeys = allKeys.filter(key => !assignedKeys.has(key))
    if (otherKeys.length > 0) {
        result['Other'] = otherKeys
    }
    
    return result
}

function computeBestValues(
    items: MarketplaceListing[], 
    allKeys: string[]
): Record<string, { value: number; itemId: string; direction: 'higher' | 'lower' } | null> {
    const bestValues: Record<string, { value: number; itemId: string; direction: 'higher' | 'lower' } | null> = {}
    
    for (const key of allKeys) {
        const numericValues: { value: number; itemId: string }[] = []
        
        for (const item of items) {
            const rawValue = item.attributes[key]
            const numValue = extractNumericValue(rawValue)
            if (numValue !== null) {
                numericValues.push({ value: numValue, itemId: item.id })
            }
        }
        
        // Only compute best if we have at least 2 comparable values
        if (numericValues.length >= 2) {
            const isHigherBetter = HIGHER_IS_BETTER.includes(key)
            const isLowerBetter = LOWER_IS_BETTER.includes(key)
            
            if (isHigherBetter || isLowerBetter) {
                const sorted = [...numericValues].sort((a, b) => 
                    isHigherBetter ? b.value - a.value : a.value - b.value
                )
                
                // Only mark as "best" if there's a meaningful difference (>5%)
                const best = sorted[0]
                const second = sorted[1]
                const diff = Math.abs(best.value - second.value)
                const threshold = Math.max(best.value, second.value) * 0.05
                
                if (diff > threshold) {
                    bestValues[key] = {
                        value: best.value,
                        itemId: best.itemId,
                        direction: isHigherBetter ? 'higher' : 'lower'
                    }
                } else {
                    bestValues[key] = null
                }
            } else {
                bestValues[key] = null
            }
        } else {
            bestValues[key] = null
        }
    }
    
    return bestValues
}

function extractNumericValue(value: any): number | null {
    if (typeof value === 'number') return value
    if (typeof value !== 'string') return null
    
    // Handle percentages like "95%"
    if (value.endsWith('%')) {
        const num = parseFloat(value.slice(0, -1))
        return isNaN(num) ? null : num
    }
    
    // Handle currency like "$150/hour" or "$50,000"
    const currencyMatch = value.match(/\$?([\d,]+(?:\.\d+)?)/i)
    if (currencyMatch) {
        const num = parseFloat(currencyMatch[1].replace(/,/g, ''))
        return isNaN(num) ? null : num
    }
    
    // Handle time durations like "2 days", "3 hours", "500ms"
    const durationMatch = value.match(/^([\d.]+)\s*(ms|s|sec|min|hour|hr|day|week|month)?/i)
    if (durationMatch) {
        const num = parseFloat(durationMatch[1])
        return isNaN(num) ? null : num
    }
    
    // Handle simple numbers like "5 years" -> 5
    const simpleMatch = value.match(/^([\d.]+)/)
    if (simpleMatch) {
        const num = parseFloat(simpleMatch[1])
        return isNaN(num) ? null : num
    }
    
    return null
}

function formatAttributeName(key: string): string {
    return key.replace(/_/g, ' ')
}

function renderValue(
    value: any, 
    key: string,
    items: MarketplaceListing[],
    currentItemId: string,
    bestValues: Record<string, { value: number; itemId: string; direction: 'higher' | 'lower' } | null>
): React.ReactNode {
    if (value === undefined || value === null) {
        return <span className="text-muted-foreground">-</span>
    }
    
    if (typeof value === 'boolean') {
        return value 
            ? <Check className="w-4 h-4 text-emerald-500" /> 
            : <X className="w-4 h-4 text-red-400" />
    }
    
    // Handle arrays with smart truncation
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground">-</span>
        if (value.length <= 3) {
            return <span>{value.join(', ')}</span>
        }
        return (
            <span className="inline-flex items-center gap-1">
                <span>{value.slice(0, 3).join(', ')}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{value.length - 3}
                </Badge>
            </span>
        )
    }
    
    if (typeof value === 'object') {
        return <span className="text-muted-foreground text-xs">{JSON.stringify(value)}</span>
    }
    
    // For numeric-comparable values, add trend indicator
    const bestInfo = bestValues[key]
    const numValue = extractNumericValue(value)
    const isBest = bestInfo?.itemId === currentItemId
    const isComparable = numValue !== null && bestInfo !== null
    
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={cn(isBest && "font-semibold text-emerald-700 dark:text-emerald-400")}>
                {String(value)}
            </span>
            {isComparable && isBest && (
                bestInfo.direction === 'higher' 
                    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    : <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
            )}
        </span>
    )
}
