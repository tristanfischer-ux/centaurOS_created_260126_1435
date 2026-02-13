'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
    Users,
    TrendingUp,
    Target,
    Building2,
    ArrowRight,
    X,
    Sparkles,
    ChevronRight,
} from 'lucide-react'
import type { PeopleRecommendation } from '@/actions/people-recommendations'

/**
 * PeopleRecommendationBanner - Contextual "Founders Like You Also Hired" banners.
 *
 * @description Displays personalized hiring recommendations based on the foundry's
 * industry, stage, team gaps, and what similar companies did. Dismissible per
 * session. Creates the "this platform gets me" moment.
 *
 * @component
 */

interface PeopleRecommendationBannerProps {
    /** Pre-fetched recommendations */
    recommendations: PeopleRecommendation[]
    /** Callback when user clicks to browse a recommendation */
    onBrowseRecommendation?: (recommendation: PeopleRecommendation) => void
    /** Additional CSS classes */
    className?: string
}

const ICON_MAP: Record<string, typeof Users> = {
    gap: Target,
    industry: Building2,
    stage: Users,
    trending: TrendingUp,
}

export function PeopleRecommendationBanner({
    recommendations,
    onBrowseRecommendation,
    className,
}: PeopleRecommendationBannerProps) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set())
    const [expanded, setExpanded] = useState(false)

    const visibleRecs = recommendations.filter(r => !dismissed.has(r.id))

    if (visibleRecs.length === 0) return null

    const topRec = visibleRecs[0]
    const remainingRecs = visibleRecs.slice(1)
    const TopIcon = ICON_MAP[topRec.iconType] || Sparkles

    return (
        <div className={cn('space-y-2', className)}>
            {/* Primary recommendation */}
            <Card className="bg-gradient-to-r from-international-orange/5 via-background to-electric-blue/5 border-international-orange/20">
                <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-international-orange/10 flex items-center justify-center shrink-0 mt-0.5">
                            <TopIcon className="h-4.5 w-4.5 text-international-orange" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <Badge variant="secondary" className="text-[10px] bg-international-orange/10 text-international-orange border-0">
                                    {topRec.type === 'similar_company' ? 'Trending' : 'Recommended'}
                                </Badge>
                                <h3 className="text-sm font-semibold text-foreground">{topRec.title}</h3>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                {topRec.reasoning}
                            </p>
                            {topRec.matchedListingIds.length > 0 && (
                                <p className="text-xs text-international-orange mt-1 font-medium">
                                    {topRec.matchedListingIds.length} matching expert{topRec.matchedListingIds.length !== 1 ? 's' : ''} available
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {onBrowseRecommendation && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 text-xs h-8 border-international-orange/30 text-international-orange hover:bg-international-orange/5"
                                    onClick={() => onBrowseRecommendation(topRec)}
                                >
                                    Browse
                                    <ArrowRight className="w-3 h-3" />
                                </Button>
                            )}
                            <button
                                onClick={() => setDismissed(prev => new Set([...prev, topRec.id]))}
                                className="min-w-[44px] min-h-[44px] w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Dismiss recommendation"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Expandable additional recommendations */}
            {remainingRecs.length > 0 && (
                <>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                    >
                        <ChevronRight className={cn(
                            'w-3 h-3 transition-transform',
                            expanded && 'rotate-90'
                        )} />
                        {remainingRecs.length} more recommendation{remainingRecs.length !== 1 ? 's' : ''}
                    </button>

                    {expanded && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {remainingRecs.map(rec => {
                                const Icon = ICON_MAP[rec.iconType] || Sparkles
                                return (
                                    <Card key={rec.id} className="border-dashed">
                                        <CardContent className="py-2.5 px-3">
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-foreground truncate">{rec.title}</p>
                                                    <p className="text-[10px] text-muted-foreground truncate">{rec.description}</p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {onBrowseRecommendation && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="gap-1 text-[10px] h-6 px-2"
                                                            onClick={() => onBrowseRecommendation(rec)}
                                                        >
                                                            View
                                                            <ArrowRight className="w-2.5 h-2.5" />
                                                        </Button>
                                                    )}
                                                    <button
                                                        onClick={() => setDismissed(prev => new Set([...prev, rec.id]))}
                                                        className="min-w-[44px] min-h-[44px] w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
                                                        aria-label="Dismiss"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
