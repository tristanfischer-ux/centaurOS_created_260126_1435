'use client'

import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Star,
    Award,
    Briefcase,
    Shield,
    ChevronRight,
    Image as ImageIcon,
    CheckCircle2,
    Sparkles,
} from 'lucide-react'
import { BadgeDisplay, BADGE_CONFIG } from '@/components/provider/BadgeDisplay'
import { PortfolioGallery } from '@/components/provider/PortfolioGallery'
import { RatingsSummary } from '@/components/provider/RatingsSummary'
import { ReviewCard } from '@/components/provider/ReviewCard'
import type { PortfolioItem, Certification, ProviderBadge } from '@/actions/trust-signals'
import type { RatingsSummary as RatingsSummaryType, ProviderRating } from '@/actions/ratings'

interface ProviderTrustSectionProps {
    // Rating info
    ratingSummary?: RatingsSummaryType | null
    reviews?: ProviderRating[]
    // Trust signals
    badges?: ProviderBadge[]
    certifications?: Certification[]
    portfolio?: PortfolioItem[]
    // Display options
    compact?: boolean
    showViewAll?: boolean
    className?: string
}

export const ProviderTrustSection = memo(function ProviderTrustSection({
    ratingSummary,
    reviews = [],
    badges = [],
    certifications = [],
    portfolio = [],
    compact = false,
    showViewAll = true,
    className,
}: ProviderTrustSectionProps) {
    const [activeTab, setActiveTab] = useState('overview')

    // Filter valid certifications (not expired)
    const validCertifications = certifications.filter(c => {
        if (!c.expiry_date) return true
        return new Date(c.expiry_date) > new Date()
    })
    const verifiedCertifications = validCertifications.filter(c => c.is_verified)
    
    // Get featured portfolio items
    const featuredPortfolio = portfolio.filter(p => p.is_featured).slice(0, 3)
    const hasPortfolio = portfolio.length > 0

    // Check for verified partner badge
    const isVerifiedPartner = badges.some(b => b.badge_type === 'verified_partner')
    const displayBadges = badges.filter(b => b.badge_type !== 'verified_partner')

    // Determine if we have enough content to show
    const hasContent = 
        (ratingSummary && ratingSummary.totalReviews > 0) ||
        badges.length > 0 ||
        validCertifications.length > 0 ||
        hasPortfolio

    if (!hasContent && !ratingSummary?.isNewProvider) {
        return null
    }

    // Compact inline display for marketplace cards
    if (compact) {
        return (
            <div className={cn('flex items-center gap-3 flex-wrap', className)}>
                {/* Verified Partner */}
                {isVerifiedPartner && (
                    <Badge variant="secondary" className="bg-violet-50 text-violet-700 border-violet-200">
                        <Shield className="w-3 h-3 mr-1" />
                        Verified
                    </Badge>
                )}

                {/* New Provider or Rating */}
                {ratingSummary?.isNewProvider ? (
                    <Badge variant="secondary" className="bg-violet-50 text-violet-700 border-violet-200">
                        <Sparkles className="w-3 h-3 mr-1" />
                        New
                    </Badge>
                ) : ratingSummary?.averageRating !== null && ratingSummary?.averageRating !== undefined ? (
                    <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="font-semibold">{ratingSummary.averageRating.toFixed(1)}</span>
                        <span className="text-muted-foreground text-sm">
                            ({ratingSummary.totalReviews})
                        </span>
                    </div>
                ) : null}

                {/* Badges */}
                {displayBadges.length > 0 && (
                    <BadgeDisplay badges={displayBadges} maxDisplay={3} size="sm" />
                )}

                {/* Certifications count */}
                {verifiedCertifications.length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        {verifiedCertifications.length} cert{verifiedCertifications.length > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        )
    }

    // Full section with tabs
    return (
        <Card className={className}>
            <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Trust & Credentials</CardTitle>
                    {isVerifiedPartner && (
                        <Badge variant="secondary" className="bg-violet-50 text-violet-700 border-violet-200">
                            <Shield className="w-3 h-3 mr-1" />
                            Verified Partner
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-4 h-9">
                        <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                        <TabsTrigger value="reviews" className="text-xs">
                            Reviews {ratingSummary?.totalReviews ? `(${ratingSummary.totalReviews})` : ''}
                        </TabsTrigger>
                        <TabsTrigger value="portfolio" className="text-xs">
                            Portfolio {hasPortfolio ? `(${portfolio.length})` : ''}
                        </TabsTrigger>
                        <TabsTrigger value="credentials" className="text-xs">
                            Credentials
                        </TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4 mt-4">
                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {/* Rating */}
                            <div className="text-center p-3 rounded-lg bg-muted/50">
                                {ratingSummary?.isNewProvider ? (
                                    <>
                                        <Sparkles className="w-6 h-6 mx-auto mb-1 text-violet-600" />
                                        <p className="text-sm font-medium">New</p>
                                    </>
                                ) : ratingSummary?.averageRating ? (
                                    <>
                                        <div className="flex items-center justify-center gap-1 mb-1">
                                            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                                            <span className="text-xl font-bold">{ratingSummary.averageRating.toFixed(1)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {ratingSummary.totalReviews} reviews
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <Star className="w-6 h-6 mx-auto mb-1 text-muted-foreground/50" />
                                        <p className="text-sm text-muted-foreground">No reviews</p>
                                    </>
                                )}
                            </div>

                            {/* Badges */}
                            <div className="text-center p-3 rounded-lg bg-muted/50">
                                <div className="text-xl font-bold mb-1">{badges.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Badge{badges.length !== 1 ? 's' : ''}
                                </p>
                            </div>

                            {/* Certifications */}
                            <div className="text-center p-3 rounded-lg bg-muted/50">
                                <div className="text-xl font-bold mb-1">{verifiedCertifications.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Verified Cert{verifiedCertifications.length !== 1 ? 's' : ''}
                                </p>
                            </div>

                            {/* Portfolio */}
                            <div className="text-center p-3 rounded-lg bg-muted/50">
                                <div className="text-xl font-bold mb-1">{portfolio.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Project{portfolio.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>

                        {/* Badges Display */}
                        {displayBadges.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium mb-2">Achievements</h4>
                                <BadgeDisplay 
                                    badges={displayBadges} 
                                    maxDisplay={5} 
                                    size="md" 
                                    showLabels 
                                />
                            </div>
                        )}

                        {/* Featured Portfolio Preview */}
                        {featuredPortfolio.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium">Featured Work</h4>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 text-xs"
                                        onClick={() => setActiveTab('portfolio')}
                                    >
                                        View All
                                        <ChevronRight className="w-3 h-3 ml-1" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {featuredPortfolio.map((item) => (
                                        <div 
                                            key={item.id}
                                            className="aspect-video rounded-lg bg-muted overflow-hidden"
                                        >
                                            {item.image_urls && item.image_urls[0] ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={item.image_urls[0]}
                                                    alt={item.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* Reviews Tab */}
                    <TabsContent value="reviews" className="mt-4">
                        {ratingSummary && (
                            <div className="space-y-4">
                                {/* Summary */}
                                <RatingsSummary summary={ratingSummary} />

                                {/* Reviews List */}
                                {reviews.length > 0 ? (
                                    <div className="space-y-3">
                                        {reviews.slice(0, 5).map((review) => (
                                            <ReviewCard key={review.id} review={review} />
                                        ))}
                                        {reviews.length > 5 && showViewAll && (
                                            <Button 
                                                variant="secondary" 
                                                className="w-full"
                                            >
                                                View All {reviews.length} Reviews
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-muted-foreground">
                                        <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p>No reviews yet</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    {/* Portfolio Tab */}
                    <TabsContent value="portfolio" className="mt-4">
                        {hasPortfolio ? (
                            <PortfolioGallery items={portfolio} maxDisplay={6} />
                        ) : (
                            <div className="text-center py-6 text-muted-foreground">
                                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No portfolio items yet</p>
                            </div>
                        )}
                    </TabsContent>

                    {/* Credentials Tab */}
                    <TabsContent value="credentials" className="mt-4 space-y-4">
                        {/* Badges */}
                        {badges.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium mb-2">Badges</h4>
                                <div className="space-y-2">
                                    {badges.map((badge) => {
                                        const config = BADGE_CONFIG[badge.badge_type]
                                        if (!config) return null
                                        const Icon = config.icon

                                        return (
                                            <div 
                                                key={badge.id}
                                                className={cn(
                                                    'flex items-center gap-3 p-3 rounded-lg',
                                                    config.bgColor
                                                )}
                                            >
                                                <Icon className={cn('w-5 h-5', config.color)} />
                                                <div>
                                                    <p className={cn('font-medium', config.color)}>
                                                        {config.label}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {config.description}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Certifications */}
                        {validCertifications.length > 0 ? (
                            <div>
                                <h4 className="text-sm font-medium mb-2">Certifications</h4>
                                <div className="space-y-2">
                                    {validCertifications.map((cert) => (
                                        <div 
                                            key={cert.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-border"
                                        >
                                            <div className="flex items-center gap-2">
                                                {cert.is_verified && (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                )}
                                                <div>
                                                    <p className="font-medium text-sm">{cert.certification_name}</p>
                                                    <p className="text-xs text-muted-foreground">{cert.issuing_body}</p>
                                                </div>
                                            </div>
                                            {cert.verification_url && (
                                                <Button variant="ghost" size="sm" asChild>
                                                    <a 
                                                        href={cert.verification_url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                    >
                                                        Verify
                                                    </a>
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6 text-muted-foreground">
                                <Award className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No certifications</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
})

// Minimal inline version for marketplace listings
interface ProviderTrustInlineProps {
    ratingSummary?: RatingsSummaryType | null
    badges?: ProviderBadge[]
    isVerifiedPartner?: boolean
    className?: string
}

export const ProviderTrustInline = memo(function ProviderTrustInline({
    ratingSummary,
    badges = [],
    isVerifiedPartner,
    className,
}: ProviderTrustInlineProps) {
    const hasVerifiedBadge = isVerifiedPartner || badges.some(b => b.badge_type === 'verified_partner')
    const displayBadges = badges.filter(b => b.badge_type !== 'verified_partner').slice(0, 2)

    return (
        <div className={cn('flex items-center gap-2 flex-wrap', className)}>
            {hasVerifiedBadge && (
                <Shield className="w-4 h-4 text-violet-600" />
            )}
            
            {ratingSummary?.isNewProvider ? (
                <Badge variant="secondary" className="bg-violet-50 text-violet-700 border-violet-200 text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    New
                </Badge>
            ) : ratingSummary?.averageRating ? (
                <div className="flex items-center gap-1 text-sm">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold">{ratingSummary.averageRating.toFixed(1)}</span>
                    <span className="text-muted-foreground text-xs">({ratingSummary.totalReviews})</span>
                </div>
            ) : null}

            {displayBadges.length > 0 && (
                <BadgeDisplay badges={displayBadges} maxDisplay={2} size="sm" />
            )}
        </div>
    )
})
