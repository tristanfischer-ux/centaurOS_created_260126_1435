'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, ArrowRight, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MarketplaceRecommendation } from '@/actions/marketplace'
import type { MarketplaceCategory } from '../hooks/useMarketplaceState'
import type { FoundryContext } from '@/actions/foundry-context'

interface MarketplaceRecommendationsProps {
    /** AI-generated recommendations from the server */
    recommendations: MarketplaceRecommendation[]
    /** Called when user clicks a recommendation to apply it as a filter */
    onApplyRecommendation: (category: MarketplaceCategory, searchTerm?: string) => void
    /** Called when user dismisses a recommendation */
    onDismiss: (id: string) => void
    /** Foundry context for gap-based suggestions */
    foundryContext?: FoundryContext
    /** Called when user clicks a gap suggestion to search for it */
    onSearch?: (query: string) => void
    /** Called when user selects a category from gap suggestions */
    onCategoryChange?: (category: MarketplaceCategory) => void
}

const SOURCE_LABELS: Record<string, string> = {
    advisory: 'From Q&A',
    coverage_gap: 'Coverage Gap',
    ai_suggestion: 'AI Suggested',
    manual: 'Suggested',
}

/** Maps business function gap categories to marketplace search suggestions */
const GAP_TO_SUGGESTIONS: Record<string, { label: string; searchTerm: string; category: MarketplaceCategory }[]> = {
    'Finance': [
        { label: 'Fractional CFO', searchTerm: 'fractional CFO', category: 'People' },
        { label: 'Bookkeeper', searchTerm: 'bookkeeper accounting', category: 'Services' },
    ],
    'Finance & Accounting': [
        { label: 'Fractional CFO', searchTerm: 'fractional CFO', category: 'People' },
        { label: 'Bookkeeper', searchTerm: 'bookkeeper accounting', category: 'Services' },
    ],
    'Legal': [
        { label: 'Startup lawyer', searchTerm: 'startup attorney legal', category: 'Services' },
        { label: 'Contract review', searchTerm: 'contract review', category: 'Services' },
    ],
    'Legal & Compliance': [
        { label: 'Startup lawyer', searchTerm: 'startup attorney legal', category: 'Services' },
        { label: 'Compliance advisor', searchTerm: 'compliance regulatory', category: 'Services' },
    ],
    'Human Resources': [
        { label: 'HR consultant', searchTerm: 'HR consultant', category: 'People' },
        { label: 'Recruiter', searchTerm: 'recruiter talent', category: 'People' },
    ],
    'Marketing': [
        { label: 'Growth marketer', searchTerm: 'growth marketing', category: 'People' },
        { label: 'Brand designer', searchTerm: 'brand design', category: 'Services' },
    ],
    'Marketing & Sales': [
        { label: 'Growth marketer', searchTerm: 'growth marketing', category: 'People' },
        { label: 'Sales consultant', searchTerm: 'sales development', category: 'People' },
    ],
    'Sales': [
        { label: 'Sales consultant', searchTerm: 'sales development', category: 'People' },
        { label: 'SDR / BDR', searchTerm: 'SDR outbound', category: 'People' },
    ],
    'Product': [
        { label: 'Product manager', searchTerm: 'product manager', category: 'People' },
        { label: 'UX designer', searchTerm: 'UX designer', category: 'People' },
    ],
    'Product & Design': [
        { label: 'Product manager', searchTerm: 'product manager', category: 'People' },
        { label: 'UX/UI designer', searchTerm: 'UX UI designer', category: 'People' },
    ],
    'Technology': [
        { label: 'Developer', searchTerm: 'software developer engineer', category: 'People' },
        { label: 'DevOps engineer', searchTerm: 'devops infrastructure', category: 'People' },
    ],
    'Engineering': [
        { label: 'Developer', searchTerm: 'software developer engineer', category: 'People' },
        { label: 'DevOps engineer', searchTerm: 'devops infrastructure', category: 'People' },
    ],
    'Operations': [
        { label: 'Operations manager', searchTerm: 'operations manager', category: 'People' },
        { label: 'Supply chain', searchTerm: 'supply chain logistics', category: 'Services' },
    ],
    'Customer Support': [
        { label: 'Customer success', searchTerm: 'customer success', category: 'People' },
        { label: 'Support agent', searchTerm: 'customer support', category: 'People' },
    ],
    'Administration': [
        { label: 'Executive assistant', searchTerm: 'executive assistant VA', category: 'People' },
        { label: 'Office manager', searchTerm: 'office manager', category: 'People' },
    ],
    'Strategy': [
        { label: 'Business advisor', searchTerm: 'business advisor strategy', category: 'People' },
        { label: 'Fundraising consultant', searchTerm: 'fundraising investor', category: 'Services' },
    ],
}

/**
 * Displays AI recommendations and gap-based suggestions as compact clickable chips.
 *
 * @description Combines server-generated AI recommendations with foundry coverage-gap
 * suggestions (formerly in MarketplaceIntentPrompt) into a single compact card.
 * Only renders when there are recommendations or gap suggestions to show.
 */
export function MarketplaceRecommendations({
    recommendations,
    onApplyRecommendation,
    onDismiss,
    foundryContext,
    onSearch,
    onCategoryChange,
}: MarketplaceRecommendationsProps) {
    // Build gap-based suggestions from foundry context
    const gapSuggestions = foundryContext?.gapCategories
        ?.flatMap(gc => GAP_TO_SUGGESTIONS[gc] || [])
        .slice(0, 4) || []

    const hasRecommendations = recommendations.length > 0
    const hasGapSuggestions = gapSuggestions.length > 0

    if (!hasRecommendations && !hasGapSuggestions) return null

    const handleGapClick = (searchTerm: string, category: MarketplaceCategory): void => {
        onCategoryChange?.(category)
        onSearch?.(searchTerm)
    }

    return (
        <Card className="bg-gradient-to-r from-international-orange/5 to-status-warning-light/50 border-international-orange/20">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-international-orange/10 flex items-center justify-center">
                            <Sparkles className="h-4 w-4 text-international-orange" />
                        </div>
                        <h3 className="font-semibold text-foreground text-sm">Recommended for You</h3>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {/* AI recommendations */}
                    {recommendations.map((rec) => (
                        <button
                            key={rec.id}
                            onClick={() => onApplyRecommendation(
                                rec.category as MarketplaceCategory,
                                rec.search_term || undefined
                            )}
                            className={cn(
                                'group relative flex items-center gap-2 px-3 py-2 bg-background rounded-lg border',
                                'hover:border-international-orange/40 hover:shadow-sm transition-all text-left'
                            )}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 border-0 bg-international-orange/10 text-international-orange">
                                        {SOURCE_LABELS[rec.source_type] || rec.source_type}
                                    </Badge>
                                    <span className="text-sm font-medium text-foreground truncate">
                                        {rec.search_term || rec.subcategory || rec.category}
                                    </span>
                                </div>
                                {rec.reasoning && (
                                    <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                                        {rec.reasoning}
                                    </p>
                                )}
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-international-orange shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />

                            {/* Dismiss button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDismiss(rec.id)
                                }}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-muted border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                                aria-label="Dismiss recommendation"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </button>
                    ))}

                    {/* Gap-based suggestions */}
                    {hasGapSuggestions && gapSuggestions.map((sug, idx) => (
                        <button
                            key={`gap-${idx}`}
                            onClick={() => handleGapClick(sug.searchTerm, sug.category)}
                            className={cn(
                                'group flex items-center gap-1.5 px-3 py-2 bg-background rounded-lg border',
                                'hover:border-international-orange/40 hover:shadow-sm transition-all text-left'
                            )}
                        >
                            <AlertCircle className="h-3 w-3 text-status-warning shrink-0" />
                            <span className="text-sm font-medium">{sug.label}</span>
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 border-0">
                                {sug.category}
                            </Badge>
                        </button>
                    ))}
                </div>

                {/* Gap context line */}
                {hasGapSuggestions && (
                    <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Based on your coverage gaps
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
