'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MarketplaceRecommendation } from '@/actions/marketplace'
import type { MarketplaceCategory } from '../hooks/useMarketplaceState'

interface MarketplaceRecommendationsProps {
    recommendations: MarketplaceRecommendation[]
    onApplyRecommendation: (category: MarketplaceCategory, searchTerm?: string) => void
    onDismiss: (id: string) => void
}

const SOURCE_LABELS: Record<string, string> = {
    advisory: 'From Q&A',
    coverage_gap: 'Coverage Gap',
    ai_suggestion: 'AI Suggested',
    manual: 'Suggested',
}

export function MarketplaceRecommendations({
    recommendations,
    onApplyRecommendation,
    onDismiss,
}: MarketplaceRecommendationsProps) {
    if (recommendations.length === 0) return null

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
                </div>
            </CardContent>
        </Card>
    )
}
