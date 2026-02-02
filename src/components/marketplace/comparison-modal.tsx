'use client'

import React, { useState, useEffect } from "react"
import { MarketplaceListing } from "@/actions/marketplace"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Check, X, TrendingUp, TrendingDown, Minus, Sparkles, Loader2, Trophy, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface AIAnalysisResult {
    winner: string  // The winning item's ID
    winnerTitle: string  // The winning item's title
    reasoning: string
    tradeoffs: string[]
    summary: string
}

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
    'Services': ['rate', 'check_size', 'stage', 'focus', 'specialty', 'location']
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
        'Investment': ['check_size', 'stage', 'focus'],
        'Pricing': ['rate', 'pricing_model', 'deliverables'],
        'Expertise': ['specialty', 'certifications', 'experience', 'jurisdictions'],
        'Availability': ['location', 'availability', 'turnaround'],
        'Other': []
    }
}

// Numeric attributes where higher is better
const HIGHER_IS_BETTER = ['years_experience', 'accuracy', 'projects_completed', 'capacity_available']
// Numeric attributes where lower is better
const LOWER_IS_BETTER = ['cost', 'latency', 'setup_time', 'lead_time', 'price']

// Badge styles matching the category color scheme - using semantic tokens
const categoryBadgeStyles: Record<string, string> = {
    'People': 'bg-international-orange-light text-international-orange',  // Brand warm - human
    'Products': 'bg-muted text-muted-foreground',                         // Neutral - industrial
    'Services': 'bg-electric-blue-light text-electric-blue',              // Brand tech - digital
    'AI': 'bg-status-info-light text-status-info-dark'                    // Info blue - AI distinction
}

export function ComparisonModal({ open, onOpenChange, items }: ComparisonModalProps) {
    const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisError, setAnalysisError] = useState<string | null>(null)

    // Debug logging
    console.log('[ComparisonModal] Rendered with:', { 
        open, 
        itemCount: items?.length || 0,
        items: items?.map(i => ({ id: i?.id, title: i?.title })) 
    })

    // Clear analysis when items change or modal closes
    useEffect(() => {
        setAiAnalysis(null)
        setAnalysisError(null)
    }, [items])

    // Clear analysis when modal closes
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setAiAnalysis(null)
            setAnalysisError(null)
        }
        onOpenChange(newOpen)
    }

    async function analyzeWithAI() {
        setIsAnalyzing(true)
        setAnalysisError(null)
        // Filter valid items inline since itemsToRender isn't computed yet at function definition
        const validItems = items.filter(item => item && item.id && item.title)
        try {
            const response = await fetch('/api/marketplace/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: validItems })
            })
            const data = await response.json()
            
            if (!response.ok || data.error) {
                setAnalysisError(data.error || 'Failed to analyze. Please try again.')
                return
            }
            
            setAiAnalysis(data)
        } catch (error) {
            console.error('AI analysis failed:', error)
            setAnalysisError('Failed to connect to AI service. Please try again.')
        } finally {
            setIsAnalyzing(false)
        }
    }

    // Step 1: Filter out null/undefined items and ensure basic structure
    const validItems = items.filter(item => {
        if (!item) {
            console.warn('[ComparisonModal] Skipping null/undefined item')
            return false
        }
        if (!item.id) {
            console.warn('[ComparisonModal] Skipping item without id:', item.title)
            return false
        }
        if (!item.title) {
            console.warn('[ComparisonModal] Skipping item without title:', item.id)
            return false
        }
        return true
    }).map(item => ({
        // Create a new object to avoid mutation issues
        ...item,
        attributes: item.attributes || {}
    }))
    
    // Step 2: Deduplicate by ID (in case the same item was added twice)
    const seenIds = new Set<string>()
    const deduplicatedItems = validItems.filter(item => {
        if (seenIds.has(item.id)) {
            console.warn('[ComparisonModal] Skipping duplicate item:', item.id, item.title)
            return false
        }
        seenIds.add(item.id)
        return true
    })
    
    console.log('[ComparisonModal] Deduplicated items:', deduplicatedItems.length, deduplicatedItems.map(i => i.title))
    
    if (!items || items.length === 0 || deduplicatedItems.length === 0) {
        console.warn('[ComparisonModal] No valid items to compare')
        // Show error dialog instead of returning null
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent size="sm" className="p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                            Cannot Compare Listings
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-muted-foreground">
                            No listings are available to compare. This may be because:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                            <li>No listings were selected</li>
                            <li>Selected listings are missing required data</li>
                            <li>Duplicate listings were selected</li>
                        </ul>
                        <p className="text-sm">
                            Please try selecting listings again or refresh the page.
                        </p>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }
    
    // Final items to render
    const itemsToRender = deduplicatedItems

    // Determine the primary category (use most common among items)
    const categoryCount = itemsToRender.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1
        return acc
    }, {} as Record<string, number>)
    const primaryCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'People'

    // Extract all unique attribute keys from all items
    const allKeys = Array.from(new Set(
        itemsToRender.flatMap(item => Object.keys(item.attributes || {}))
    ))

    // Get priority attributes for sorting
    const priorityAttrs = PRIORITY_ATTRIBUTES[primaryCategory] || []
    
    // Get section config for this category
    const sectionConfig = ATTRIBUTE_SECTIONS[primaryCategory] || { 'Other': [] }
    
    // Organize attributes into sections
    const organizedSections = organizeAttributesIntoSections(allKeys, sectionConfig, priorityAttrs)
    
    // Pre-compute best values for numeric comparisons
    const bestValues = computeBestValues(itemsToRender, allKeys)

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent size="xl" className="max-h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-xl font-semibold">
                            Compare Listings ({itemsToRender.length} items)
                        </DialogTitle>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={analyzeWithAI}
                            disabled={isAnalyzing || itemsToRender.length < 2}
                            className="gap-2"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    Analyze with AI
                                </>
                            )}
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto">
                    <div className="p-6 pt-4">
                        {/* AI Analysis Error */}
                        {analysisError && (
                            <Card className="mb-6 p-4 bg-status-error-light border-destructive/20">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="h-5 w-5 text-destructive" />
                                        <p className="text-sm text-destructive">{analysisError}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAnalysisError(null)}
                                        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </Card>
                        )}

                        {/* AI Analysis Results */}
                        {aiAnalysis && (
                            <Card className="mb-6 p-4 bg-accent/10 border-accent/20">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-5 w-5 text-accent" />
                                        <h3 className="font-semibold text-foreground">AI Analysis</h3>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAiAnalysis(null)}
                                        className="h-7 px-2 text-accent hover:text-accent hover:bg-muted"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>

                                {/* Winner Section */}
                                <div className="mb-4 p-3 bg-background rounded-lg border border-accent/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Trophy className="h-4 w-4 text-amber-500" />
                                        <span className="text-sm font-medium text-foreground">Recommended</span>
                                        <Badge className="bg-status-warning-light text-status-warning-dark border-0">
                                            {aiAnalysis.winnerTitle}
                                        </Badge>
                                    </div>
                                    <p className="text-sm font-medium text-foreground">{aiAnalysis.summary}</p>
                                </div>

                                {/* Detailed Reasoning */}
                                <div className="mb-4">
                                    <h4 className="text-sm font-medium text-foreground mb-2">Why This Choice?</h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{aiAnalysis.reasoning}</p>
                                </div>

                                {/* Trade-offs */}
                                {aiAnalysis.tradeoffs && aiAnalysis.tradeoffs.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                                            <AlertCircle className="h-4 w-4" />
                                            Trade-offs to Consider
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {aiAnalysis.tradeoffs.map((tradeoff, index) => (
                                                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                                                    <span className="text-accent mt-1">•</span>
                                                    <span>{tradeoff}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Summary */}
                                <div className="pt-3 border-t border-accent/20">
                                    <p className="text-sm text-accent italic">{aiAnalysis.summary}</p>
                                </div>
                            </Card>
                        )}

                        {/* Mobile: Card Layout */}
                        <div className="block md:hidden space-y-4">
                            {itemsToRender.map(item => (
                                <Card key={item.id} className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold text-base">{item.title}</h3>
                                            <Badge 
                                                variant="secondary" 
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
                                        const hasAnyValue = sectionKeys.some(key => (item.attributes || {})[key] !== undefined)
                                        if (!hasAnyValue) return null
                                        
                                        return (
                                            <div key={sectionName} className="mb-4">
                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b border-border/50">
                                                    {sectionName}
                                                </h4>
                                                <dl className="space-y-2 text-sm">
                                                    {sectionKeys.map((key) => {
                                                        const value = (item.attributes || {})[key]
                                                        if (value === undefined) return null
                                                        const isBest = bestValues[key]?.itemId === item.id
                                                        
                                                        return (
                                                            <div 
                                                                key={key} 
                                                                className={cn(
                                                                    "flex justify-between items-start py-1 px-2 rounded-md",
                                                                    isBest && "bg-status-success-light"
                                                                )}
                                                            >
                                                                <dt className="text-muted-foreground capitalize pr-4 flex-shrink-0">
                                                                    {formatAttributeName(key)}
                                                                </dt>
                                                                <dd className="text-right flex items-center gap-1.5">
                                                                    {renderValue(value, key, itemsToRender, item.id, bestValues)}
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

                        {/* Desktop: Grid Layout - Fixed version */}
                        <div className="hidden md:block overflow-x-auto pb-4">
                            {/* Comparison Grid - using CSS Grid for reliable multi-column layout */}
                            <div 
                                className="grid gap-0 border rounded-lg overflow-hidden"
                                style={{ 
                                    gridTemplateColumns: `150px repeat(${itemsToRender.length}, minmax(200px, 1fr))` 
                                }}
                            >
                                {/* Header Row */}
                                <div className="bg-muted/50 p-3 font-medium text-sm text-muted-foreground border-b">
                                    Attribute
                                </div>
                                {itemsToRender.map((item) => (
                                    <div key={`header-${item.id}`} className="bg-muted/50 p-3 border-b border-l">
                                        <div className="font-bold text-base leading-tight">{item.title}</div>
                                        <Badge 
                                            variant="secondary" 
                                            className={cn(
                                                "mt-2 uppercase text-[10px] tracking-wider font-semibold border-0",
                                                categoryBadgeStyles[item.category]
                                            )}
                                        >
                                            {item.subcategory}
                                        </Badge>
                                    </div>
                                ))}
                                
                                {/* Section Content */}
                                {Object.entries(organizedSections).map(([sectionName, sectionKeys]) => {
                                    if (sectionKeys.length === 0) return null
                                    const hasAnyValue = sectionKeys.some(key => 
                                        itemsToRender.some(item => item.attributes[key] !== undefined)
                                    )
                                    if (!hasAnyValue) return null
                                    
                                    return (
                                        <GridSectionGroup 
                                            key={sectionName}
                                            sectionName={sectionName}
                                            sectionKeys={sectionKeys}
                                            items={itemsToRender}
                                            bestValues={bestValues}
                                            columnCount={itemsToRender.length}
                                        />
                                    )
                                })}
                                
                                {/* Description section header */}
                                <div 
                                    className="col-span-full py-2 border-t-2 border-border"
                                    style={{ gridColumn: `1 / -1` }}
                                >
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Details
                                    </span>
                                </div>
                                
                                {/* Description row */}
                                <div className="text-sm font-medium text-muted-foreground py-3 pr-4 border-t border-border/50">
                                    Description
                                </div>
                                {itemsToRender.map(item => (
                                    <div key={`${item.id}-desc`} className="text-sm text-muted-foreground leading-relaxed py-3 px-4 border-t border-border/50 border-l">
                                        {item.description}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

interface GridSectionGroupProps {
    sectionName: string
    sectionKeys: string[]
    items: MarketplaceListing[]
    bestValues: Record<string, { value: number; itemId: string; direction: 'higher' | 'lower' } | null>
    columnCount: number
}

function GridSectionGroup({ sectionName, sectionKeys, items, bestValues, columnCount }: GridSectionGroupProps) {
    return (
        <>
            {/* Section header - spans all columns */}
            <div 
                className="py-2 border-t-2 border-border"
                style={{ gridColumn: `1 / span ${columnCount + 1}` }}
            >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {sectionName}
                </span>
            </div>
            
            {/* Section rows */}
            {sectionKeys.map((key) => {
                const hasAnyValue = items.some(item => (item.attributes || {})[key] !== undefined)
                if (!hasAnyValue) return null
                
                return (
                    <React.Fragment key={key}>
                        {/* Attribute label cell */}
                        <div className="text-sm font-medium text-muted-foreground capitalize py-3 pr-4 border-t border-border/50">
                            {formatAttributeName(key)}
                        </div>
                        {/* Value cells for each item */}
                        {items.map(item => {
                            const value = (item.attributes || {})[key]
                            const isBest = bestValues[key]?.itemId === item.id
                            
                            return (
                                <div 
                                    key={`${item.id}-${key}`} 
                                    className={cn(
                                        "text-sm py-3 px-4 border-t border-border/50 border-l transition-colors",
                                        isBest && "bg-status-success-light"
                                    )}
                                >
                                    <div className="flex items-center gap-1.5">
                                        {renderValue(value, key, items, item.id, bestValues)}
                                    </div>
                                </div>
                            )
                        })}
                    </React.Fragment>
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
            const rawValue = (item.attributes || {})[key]
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
            ? <Check className="w-4 h-4 text-status-success" /> 
            : <X className="w-4 h-4 text-destructive" />
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
            <span className={cn(isBest && "font-semibold text-status-success")}>
                {String(value)}
            </span>
            {isComparable && isBest && (
                bestInfo.direction === 'higher' 
                    ? <TrendingUp className="w-3.5 h-3.5 text-status-success" />
                    : <TrendingDown className="w-3.5 h-3.5 text-status-success" />
            )}
        </span>
    )
}