'use client'

/**
 * ExpertCard - Card component for displaying an expert in the directory grid.
 *
 * @description Shows expert name, headline, location, rating, specializations,
 * and a link to their full profile. Designed for the /experts browse page.
 *
 * @component
 *
 * @example
 * <ExpertCard expert={expert} />
 */

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Star, MapPin, Clock, Shield, ArrowRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DirectoryExpert } from '@/lib/directory/types'
import { getExpertSlug } from '@/lib/directory/types'

interface ExpertCardProps {
    /** The expert data to display */
    expert: DirectoryExpert
    /** Additional CSS classes */
    className?: string
}

/**
 * Formats a currency amount with the appropriate symbol.
 */
function formatRate(amount: number | null, currency: string): string | null {
    if (!amount) return null
    const symbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' }
    return `${symbols[currency] || ''}${amount.toLocaleString()}`
}

export function ExpertCard({ expert, className }: ExpertCardProps) {
    const slug = getExpertSlug(expert)
    const isFeatured = expert.featured_until
        ? new Date(expert.featured_until) > new Date()
        : false

    const href = slug ? `/expert/${slug}` : '#'

    return (
        <Link href={href} className="group block">
            <Card
                className={cn(
                    'relative overflow-hidden transition-all duration-200',
                    'hover:shadow-md hover:-translate-y-0.5',
                    isFeatured && 'ring-1 ring-international-orange/20',
                    className
                )}
            >
                {/* Featured indicator */}
                {isFeatured && (
                    <div className="absolute right-3 top-3 z-10">
                        <Badge variant="warning" className="gap-1 text-xs">
                            <Sparkles className="h-3 w-3" />
                            Featured
                        </Badge>
                    </div>
                )}

                <CardContent className="p-6">
                    <div className="flex gap-4">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                            <UserAvatar
                                name={expert.user_name}
                                role="Executive"
                                avatarUrl={expert.user_avatar}
                                size="lg"
                            />
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="truncate text-base font-semibold text-foreground group-hover:text-international-orange transition-colors">
                                        {expert.user_name || 'Expert'}
                                    </h3>
                                    <p className="truncate text-sm text-muted-foreground">
                                        {expert.headline || 'Fractional Executive'}
                                    </p>
                                </div>
                                {expert.is_verified && (
                                    <Shield className="h-4 w-4 flex-shrink-0 text-status-info" />
                                )}
                            </div>

                            {/* Meta */}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                {expert.location && (
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {expert.location}
                                    </span>
                                )}
                                {expert.years_experience && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {expert.years_experience}+ years
                                    </span>
                                )}
                                {expert.average_rating && expert.total_reviews > 0 && (
                                    <span className="flex items-center gap-1">
                                        <Star className="h-3 w-3 fill-status-warning text-status-warning" />
                                        {expert.average_rating.toFixed(1)}
                                        <span className="text-muted-foreground">
                                            ({expert.total_reviews})
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bio excerpt */}
                    {expert.bio && (
                        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                            {expert.bio}
                        </p>
                    )}

                    {/* Specializations */}
                    {expert.specializations.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {expert.specializations.slice(0, 4).map((spec) => (
                                <Badge
                                    key={spec}
                                    variant="secondary"
                                    className="text-xs"
                                >
                                    {spec}
                                </Badge>
                            ))}
                            {expert.specializations.length > 4 && (
                                <Badge variant="secondary" className="text-xs">
                                    +{expert.specializations.length - 4}
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Footer: Rate + CTA */}
                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                        <div className="text-sm">
                            {expert.day_rate ? (
                                <span className="font-semibold text-foreground">
                                    {formatRate(expert.day_rate, expert.currency)}
                                    <span className="font-normal text-muted-foreground">/day</span>
                                </span>
                            ) : expert.hourly_rate ? (
                                <span className="font-semibold text-foreground">
                                    {formatRate(expert.hourly_rate, expert.currency)}
                                    <span className="font-normal text-muted-foreground">/hr</span>
                                </span>
                            ) : (
                                <span className="text-muted-foreground">Contact for rates</span>
                            )}
                        </div>
                        <span className="flex items-center gap-1 text-xs font-medium text-international-orange opacity-0 transition-opacity group-hover:opacity-100">
                            View Profile
                            <ArrowRight className="h-3 w-3" />
                        </span>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
