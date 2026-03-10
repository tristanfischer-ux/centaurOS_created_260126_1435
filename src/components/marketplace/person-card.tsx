'use client'

import { memo, useState, useCallback, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, getInitials } from '@/lib/utils'
import { safeParseAttributes, safeStringArray } from '@/lib/marketplace-utils'
import { getAvatarGradient, type MarketplaceCategory } from '@/lib/marketplace-colors'
import {
    ShieldCheck,
    Star,
    Clock,
    Heart,
    ArrowRight,
    MapPin,
    Users,
    Scale,
    MessageSquare,
    CalendarCheck,
    Award,
    TrendingUp,
    Zap,
} from 'lucide-react'
import { saveMarketplaceListing, unsaveMarketplaceListing } from '@/actions/marketplace'
import { toast } from 'sonner'
import { ActOnThisButton } from '@/components/smart/act-on-this-button'
import type { EnrichedPersonListing } from '@/actions/people-marketplace'
import type { MarketplaceListing } from '@/actions/marketplace'

/**
 * PersonCard - Purpose-built card for People marketplace listings.
 *
 * @description Replaces the generic MarketCardV2 for People category listings.
 * Surfaces trust signals, social proof, availability status, and badges that
 * communicate credibility at a glance. Designed to make users trust the platform.
 *
 * @component
 *
 * @example
 * <PersonCard
 *   listing={enrichedListing}
 *   isSaved={false}
 *   onSaveToggle={handleToggle}
 *   onViewDetail={handleView}
 * />
 */

/** Badge type to display config */
const BADGE_CONFIG: Record<string, { label: string; icon: typeof Award; className: string }> = {
    fast_responder: { label: 'Fast', icon: Zap, className: 'bg-status-info-light text-status-info' },
    top_rated: { label: 'Top Rated', icon: Star, className: 'bg-amber-50 text-amber-700' },
    verified_partner: { label: 'Verified', icon: ShieldCheck, className: 'bg-status-success-light text-status-success' },
    reliable: { label: 'Reliable', icon: Award, className: 'bg-status-success-light text-status-success' },
    rising_star: { label: 'Rising', icon: TrendingUp, className: 'bg-international-orange/10 text-international-orange' },
}

/** Availability status display */
function getAvailabilityStatus(attrs: Record<string, unknown>): {
    label: string
    dotColor: string
} | null {
    const availability = attrs.availability as string | undefined
    if (!availability) return null
    if (availability.toLowerCase().includes('full-time') || availability.toLowerCase().includes('available now')) {
        return { label: 'Available', dotColor: 'bg-status-success' }
    }
    if (availability.toLowerCase().includes('part') || availability.toLowerCase().includes('day')) {
        return { label: availability, dotColor: 'bg-amber-400' }
    }
    return { label: availability, dotColor: 'bg-muted-foreground' }
}

/** Response time display */
function getResponseTimeLabel(hours: number | null): string | null {
    if (!hours) return null
    if (hours < 1) return 'Under 1h'
    if (hours <= 2) return '~2h'
    if (hours <= 24) return `~${hours}h`
    return `~${Math.ceil(hours / 24)}d`
}

interface PersonCardProps {
    listing: EnrichedPersonListing
    isSaved: boolean
    isSelectedForCompare?: boolean
    onSaveToggle: (id: string) => void
    onViewDetail: (listing: MarketplaceListing) => void
    onToggleCompare?: (id: string) => void
}

export const PersonCard = memo(function PersonCard({
    listing,
    isSaved,
    isSelectedForCompare = false,
    onSaveToggle,
    onViewDetail,
    onToggleCompare,
}: PersonCardProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [localSaved, setLocalSaved] = useState(isSaved)

    useEffect(() => { setLocalSaved(isSaved) }, [isSaved])

    const attrs = safeParseAttributes(listing.attributes)
    const trust = listing.trustData
    const initials = getInitials(listing.title)
    const gradient = getAvatarGradient('People' as MarketplaceCategory, listing.title)
    const role = attrs.role as string | undefined
    const headline = attrs.headline as string | undefined
    const location = attrs.location as string | undefined
    const rawRateValue = attrs.rate || attrs.day_rate
    const rawRate = rawRateValue ? String(rawRateValue) : undefined
    const ratePeriodMatch = rawRate?.match(/\/(day|month|hr|hour|week|year)$/i)
    const rate = rawRate && ratePeriodMatch ? rawRate.slice(0, ratePeriodMatch.index) : rawRate
    const ratePeriod = ratePeriodMatch ? ratePeriodMatch[1].toLowerCase() : 'day'
    const yearsExp = attrs.years_experience as number | undefined
    const skills = safeStringArray(attrs.skills || attrs.expertise).slice(0, 4)
    const previousCompanies = safeStringArray(attrs.previous_companies).slice(0, 3)
    const availability = getAvailabilityStatus(attrs)
    // INTENT: trust.responseTimeHours is always null (provider_ratings doesn't have the column yet),
    // so fall back to attrs.response_time_hours which may be populated from listing attributes.
    const responseTime = getResponseTimeLabel(trust.responseTimeHours ?? (attrs.response_time_hours as number | null))

    const handleSave = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsSaving(true)
        const newState = !localSaved
        setLocalSaved(newState)

        try {
            const result = newState
                ? await saveMarketplaceListing(listing.id)
                : await unsaveMarketplaceListing(listing.id)

            if (result.error) {
                setLocalSaved(!newState)
                toast.error(result.error)
            } else {
                onSaveToggle(listing.id)
                toast.success(newState ? 'Saved to favorites' : 'Removed from favorites')
            }
        } catch {
            setLocalSaved(!newState)
            toast.error('Failed to update')
        } finally {
            setIsSaving(false)
        }
    }, [listing.id, localSaved, onSaveToggle])

    return (
        <Card
            className={cn(
                'group relative flex flex-col border shadow-sm overflow-hidden bg-background cursor-pointer',
                'hover:shadow-lg hover:-translate-y-0.5 hover:border-muted-foreground/20',
                'transition-all duration-200 ease-out',
                isSelectedForCompare && 'ring-2 ring-international-orange/50 border-international-orange/30'
            )}
            role="button"
            tabIndex={0}
            onClick={() => onViewDetail(listing)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onViewDetail(listing)
                }
            }}
            aria-label={`View profile for ${listing.title}`}
        >
            {/* Action buttons - top right */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                {onToggleCompare && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleCompare(listing.id)
                        }}
                        className={cn(
                            'min-w-[44px] min-h-[44px] w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                            isSelectedForCompare
                                ? 'bg-international-orange text-white shadow-md'
                                : 'bg-background/90 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 shadow-sm border'
                        )}
                        aria-label={isSelectedForCompare ? 'Remove from comparison' : 'Add to comparison'}
                    >
                        <Scale className={cn('w-4 h-4', isSelectedForCompare && 'fill-current')} />
                    </button>
                )}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={cn(
                        'min-w-[44px] min-h-[44px] w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                        localSaved
                            ? 'bg-destructive text-destructive-foreground shadow-md'
                            : 'bg-background/90 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 shadow-sm border'
                    )}
                    aria-label={localSaved ? 'Remove from saved' : 'Save for later'}
                >
                    <Heart className={cn('w-4 h-4', localSaved && 'fill-current')} />
                </button>
            </div>

            <CardContent className="flex flex-col flex-1 p-5">
                {/* Header: Avatar with availability dot + Name + Role */}
                <div className="flex gap-3 mb-3">
                    <div className="relative">
                        <div className={cn(
                            'w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-sm',
                            gradient
                        )}>
                            {initials}
                        </div>
                        {/* Availability status dot */}
                        {availability && (
                            <div
                                className={cn(
                                    'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background',
                                    availability.dotColor
                                )}
                                title={availability.label}
                            />
                        )}
                    </div>

                    <div className="flex-1 min-w-0 pr-8">
                        {/* Badges row */}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <Badge
                                variant="secondary"
                                className="uppercase text-[10px] tracking-wider font-semibold border-0 bg-international-orange/10 text-international-orange"
                            >
                                {listing.subcategory}
                            </Badge>
                            {listing.is_verified && (
                                <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0" aria-label="Verified" />
                            )}
                        </div>

                        {/* Name */}
                        <h3 className="text-base font-bold tracking-tight text-foreground line-clamp-1">
                            {listing.title}
                        </h3>
                        {/* Role */}
                        {role && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{role}</p>
                        )}
                        {/* Headline */}
                        {headline && (
                            <p className={cn(
                                'text-muted-foreground line-clamp-1',
                                role ? 'text-xs' : 'text-sm'
                            )}>{headline}</p>
                        )}
                    </div>
                </div>

                {/* Trust badges (earned badges) */}
                {trust.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {trust.badges.slice(0, 3).map(badgeType => {
                            const config = BADGE_CONFIG[badgeType]
                            if (!config) return null
                            const Icon = config.icon
                            return (
                                <Badge
                                    key={badgeType}
                                    variant="secondary"
                                    className={cn('text-[10px] gap-1 border-0', config.className)}
                                >
                                    <Icon className="w-3 h-3" />
                                    {config.label}
                                </Badge>
                            )
                        })}
                    </div>
                )}

                {/* Skills */}
                {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {skills.map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-xs font-normal">
                                {skill}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Previous companies (social proof) */}
                {previousCompanies.length > 0 && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-1">
                        Previously: {previousCompanies.join(' · ')}
                    </p>
                )}

                {/* Social proof metrics row */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-4">
                    {trust.averageRating && trust.averageRating > 0 && (
                        <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-hidden="true" />
                            <span className="font-medium text-foreground">
                                {trust.averageRating.toFixed(1)}
                            </span>
                            <span>({trust.totalReviews})</span>
                        </div>
                    )}
                    {trust.trustedByCount > 0 && (
                        <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Trusted by {trust.trustedByCount}</span>
                        </div>
                    )}
                    {responseTime && (
                        <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Responds {responseTime}</span>
                        </div>
                    )}
                    {yearsExp != null && (
                        <div className="flex items-center gap-1">
                            <Award className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{yearsExp}y exp</span>
                        </div>
                    )}
                    {location && (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="truncate max-w-[100px]">{location}</span>
                        </div>
                    )}
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Footer: Rate + CTAs */}
                <div className="flex items-center justify-between pt-3 border-t border-muted">
                    <div>
                        {rate ? (
                            <span>
                                <span className="text-lg font-bold text-foreground">
                                    {rate.startsWith('£') || rate.startsWith('$') || rate.startsWith('€') ? rate : `£${rate}`}
                                </span>
                                <span className="text-xs text-muted-foreground ml-0.5">/{ratePeriod}</span>
                            </span>
                        ) : (
                            <span className="text-sm text-muted-foreground">Request pricing</span>
                        )}
                        {availability && (
                            <p className={cn(
                                'text-xs font-medium mt-0.5',
                                availability.dotColor === 'bg-status-success'
                                    ? 'text-status-success'
                                    : 'text-muted-foreground'
                            )}>
                                {availability.label}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <div onClick={(e) => e.stopPropagation()}>
                            <ActOnThisButton
                                context={{
                                    source: 'marketplace',
                                    entityTitle: listing.title,
                                    entityDescription: listing.description || undefined,
                                }}
                                variant="subtle"
                                label="Act"
                            />
                        </div>
                        <Button
                            size="sm"
                            variant="default"
                            className="gap-1.5 shrink-0"
                            onClick={(e) => {
                                e.stopPropagation()
                                onViewDetail(listing)
                            }}
                        >
                            View Profile
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
})
