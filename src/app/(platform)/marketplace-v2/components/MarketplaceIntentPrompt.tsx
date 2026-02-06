'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, Sparkles, ArrowRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FoundryContext } from '@/actions/foundry-context'
import type { MarketplaceCategory } from '../hooks/useMarketplaceState'

interface MarketplaceIntentPromptProps {
    foundryContext?: FoundryContext
    onSearch: (query: string) => void
    onCategoryChange: (category: MarketplaceCategory) => void
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

const EXAMPLE_PROMPTS = [
    'I need a fractional CFO',
    'Help with patent filing',
    'Someone to build my MVP',
    'Marketing strategy consultant',
]

export function MarketplaceIntentPrompt({
    foundryContext,
    onSearch,
    onCategoryChange,
}: MarketplaceIntentPromptProps) {
    const [query, setQuery] = useState('')

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        if (query.trim()) {
            onSearch(query.trim())
        }
    }, [query, onSearch])

    const handleSuggestionClick = useCallback((searchTerm: string, category: MarketplaceCategory) => {
        onCategoryChange(category)
        onSearch(searchTerm)
    }, [onCategoryChange, onSearch])

    // Build gap-based suggestions from foundry context
    const gapSuggestions = foundryContext?.gapCategories
        ?.flatMap(gc => GAP_TO_SUGGESTIONS[gc] || [])
        .slice(0, 4) || []

    return (
        <Card className="bg-gradient-to-r from-electric-blue/5 to-international-orange/5 border-electric-blue/20">
            <CardContent className="py-5">
                {/* Search prompt */}
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Search className="h-4 w-4 text-electric-blue" />
                        <h2 className="font-semibold text-sm text-foreground">What do you need help with?</h2>
                    </div>
                    <form onSubmit={handleSubmit} className="relative max-w-xl">
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="e.g. I need a fractional CFO for my startup..."
                            className={cn(
                                'w-full px-4 py-2.5 pr-10 rounded-lg border bg-background text-sm',
                                'placeholder:text-muted-foreground/60',
                                'focus:outline-none focus:ring-2 focus:ring-electric-blue/30 focus:border-electric-blue/40',
                                'transition-all duration-200',
                            )}
                        />
                        <button
                            type="submit"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-electric-blue/10 transition-colors"
                            aria-label="Search"
                        >
                            <ArrowRight className="h-4 w-4 text-electric-blue" />
                        </button>
                    </form>
                    {/* Example prompts */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {EXAMPLE_PROMPTS.map(prompt => (
                            <button
                                key={prompt}
                                onClick={() => {
                                    setQuery(prompt)
                                    onSearch(prompt)
                                }}
                                className="text-[11px] px-2 py-1 rounded-md bg-background border text-muted-foreground hover:text-foreground hover:border-electric-blue/30 transition-colors"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Gap-based suggestions */}
                {gapSuggestions.length > 0 && (
                    <div className="pt-3 border-t border-electric-blue/10">
                        <div className="flex items-center gap-1.5 mb-2">
                            <AlertCircle className="h-3.5 w-3.5 text-status-warning" />
                            <span className="text-xs font-medium text-muted-foreground">Based on your coverage gaps, you might need:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {gapSuggestions.map((sug, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSuggestionClick(sug.searchTerm, sug.category)}
                                    className={cn(
                                        'group flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-lg border',
                                        'hover:border-international-orange/40 hover:shadow-sm transition-all text-left'
                                    )}
                                >
                                    <Sparkles className="h-3 w-3 text-international-orange" />
                                    <span className="text-xs font-medium">{sug.label}</span>
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 border-0">
                                        {sug.category}
                                    </Badge>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
