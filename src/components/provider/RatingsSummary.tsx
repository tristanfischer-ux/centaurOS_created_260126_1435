'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Star, Sparkles } from 'lucide-react'
import type { RatingsSummary as RatingsSummaryType } from '@/actions/ratings'

interface RatingsSummaryProps {
    summary: RatingsSummaryType
    compact?: boolean
    showDistribution?: boolean
    className?: string
}

export const RatingsSummary = memo(function RatingsSummary({
    summary,
    compact = false,
    showDistribution = true,
    className,
}: RatingsSummaryProps) {
    const { averageRating, totalReviews, ratingDistribution, isNewProvider } = summary

    // Compact display for cards/listings
    if (compact) {
        if (isNewProvider) {
            return (
                <div className={cn('flex items-center gap-1.5', className)}>
                    <Badge variant="secondary" className="bg-violet-50 text-violet-700 border-violet-200">
                        <Sparkles className="w-3 h-3 mr-1" />
                        New
                    </Badge>
                </div>
            )
        }

        return (
            <div className={cn('flex items-center gap-1.5', className)}>
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{averageRating?.toFixed(1)}</span>
                <span className="text-muted-foreground text-sm">({totalReviews})</span>
            </div>
        )
    }

    // Full display
    return (
        <Card className={className}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Ratings & Reviews</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* New Provider Badge */}
                {isNewProvider && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 border border-violet-100">
                        <Sparkles className="w-5 h-5 text-violet-600" />
                        <div>
                            <p className="font-medium text-violet-800">New Provider</p>
                            <p className="text-sm text-violet-600">
                                {totalReviews === 0 
                                    ? 'No reviews yet'
                                    : `${totalReviews} review${totalReviews > 1 ? 's' : ''} so far`
                                }
                            </p>
                        </div>
                    </div>
                )}

                {/* Rating Display */}
                {averageRating !== null && (
                    <div className="flex items-start gap-4">
                        <div className="text-center">
                            <div className="text-4xl font-bold text-foreground">
                                {averageRating.toFixed(1)}
                            </div>
                            <div className="flex items-center justify-center gap-0.5 mt-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                        key={star}
                                        className={cn(
                                            'w-4 h-4',
                                            star <= Math.round(averageRating)
                                                ? 'fill-amber-400 text-amber-400'
                                                : 'fill-muted text-muted'
                                        )}
                                    />
                                ))}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                {totalReviews} review{totalReviews !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* Distribution */}
                        {showDistribution && totalReviews > 0 && (
                            <div className="flex-1 space-y-1.5">
                                {[5, 4, 3, 2, 1].map((rating) => {
                                    const count = ratingDistribution[rating as keyof typeof ratingDistribution]
                                    const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0

                                    return (
                                        <div key={rating} className="flex items-center gap-2 text-sm">
                                            <span className="w-3 text-muted-foreground">{rating}</span>
                                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                            <Progress 
                                                value={percentage} 
                                                className="flex-1 h-2"
                                            />
                                            <span className="w-8 text-right text-muted-foreground text-xs">
                                                {count}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* No Ratings Yet */}
                {averageRating === null && !isNewProvider && (
                    <div className="text-center py-4 text-muted-foreground">
                        <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No ratings yet</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
})

// Inline star rating display
interface StarRatingProps {
    rating: number
    size?: 'sm' | 'md' | 'lg'
    showValue?: boolean
    className?: string
}

export const StarRating = memo(function StarRating({
    rating,
    size = 'md',
    showValue = true,
    className,
}: StarRatingProps) {
    const sizeClasses = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    }

    const textClasses = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
    }

    return (
        <div className={cn('flex items-center gap-1', className)}>
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={cn(
                        sizeClasses[size],
                        star <= Math.round(rating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-muted text-muted'
                    )}
                />
            ))}
            {showValue && (
                <span className={cn('font-semibold ml-1', textClasses[size])}>
                    {rating.toFixed(1)}
                </span>
            )}
        </div>
    )
})
