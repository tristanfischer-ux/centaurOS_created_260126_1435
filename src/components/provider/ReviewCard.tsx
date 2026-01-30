'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Star, CheckCircle2, User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ProviderRating } from '@/actions/ratings'

interface ReviewCardProps {
    review: ProviderRating
    showOrderReference?: boolean
    className?: string
}

export const ReviewCard = memo(function ReviewCard({
    review,
    showOrderReference = false,
    className,
}: ReviewCardProps) {
    const displayName = review.is_anonymous 
        ? 'Anonymous' 
        : review.reviewer_name || 'Customer'

    return (
        <Card className={cn('transition-colors', className)}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    {/* Avatar */}
                    {review.is_anonymous ? (
                        <div className="w-10 h-10 shrink-0 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                            <User className="w-5 h-5" />
                        </div>
                    ) : (
                        <UserAvatar
                            name={displayName}
                            avatarUrl={review.reviewer_avatar}
                            size="lg"
                            className="shrink-0"
                        />
                    )}

                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground">
                                        {displayName}
                                    </span>
                                    {review.is_verified_purchase && (
                                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            Verified
                                        </Badge>
                                    )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                                </span>
                            </div>

                            {/* Rating Stars */}
                            <div className="flex items-center gap-0.5 shrink-0">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                        key={star}
                                        className={cn(
                                            'w-4 h-4',
                                            star <= review.rating
                                                ? 'fill-amber-400 text-amber-400'
                                                : 'fill-muted text-muted'
                                        )}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Comment */}
                        {review.comment && (
                            <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
                                {review.comment}
                            </p>
                        )}

                        {/* Order Reference */}
                        {showOrderReference && review.order_id && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Order #{review.order_id.slice(0, 8)}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
})

// Compact review list item
interface ReviewListItemProps {
    review: ProviderRating
    className?: string
}

export const ReviewListItem = memo(function ReviewListItem({
    review,
    className,
}: ReviewListItemProps) {
    const displayName = review.is_anonymous 
        ? 'Anonymous' 
        : review.reviewer_name || 'Customer'

    return (
        <div className={cn('py-3 border-b border-border last:border-0', className)}>
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{displayName}</span>
                    {review.is_verified_purchase && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                            key={star}
                            className={cn(
                                'w-3 h-3',
                                star <= review.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'fill-muted text-muted'
                            )}
                        />
                    ))}
                </div>
            </div>
            {review.comment && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                    {review.comment}
                </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
            </p>
        </div>
    )
})
