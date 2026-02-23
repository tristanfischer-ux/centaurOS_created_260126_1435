'use client'

import { useState, useEffect } from 'react'
import { MarketplaceListing } from '@/actions/marketplace'
import { contactExpert } from '@/actions/messaging'
import { toast } from 'sonner'
import {
    ShieldCheck,
    MapPin,
    Clock,
    GraduationCap,
    Briefcase,
    Building2,
    PoundSterling,
    Zap,
    Target,
    Award,
    Gauge,
    Layers,
    Timer,
    Package,
    Wrench,
    Users,
    Brain,
    Cpu,
    BarChart3,
    CheckCircle2,
    Star,
    Calendar,
    MessageSquare,
    Loader2,
    Info,
    User,
    Bot,
    Sparkles,
    Store,
    ArrowRight,
    ThumbsUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { safeParseAttributes, safeStringArray } from '@/lib/marketplace-utils'
import { getCategoryBadgeClasses, type MarketplaceCategory } from '@/lib/marketplace-colors'
import { InviteToCompanyButton } from '@/components/marketplace/invite-to-company-button'
import Link from 'next/link'
import { getEntityReviews, type EntityReview, type ReviewSummary } from '@/actions/reviews'

/**
 * MarketplaceListingDialog - Displays marketplace listing details in a centered modal.
 *
 * @description Shows listing information in a dialog with Overview and Details tabs,
 * following the pattern established by UsePackDialog on the inspiration page.
 *
 * @param {MarketplaceListing} listing - The marketplace listing to display
 * @param {React.ReactNode} trigger - Optional custom trigger element
 *
 * @example
 * <MarketplaceListingDialog
 *   listing={listing}
 *   trigger={<Button>View</Button>}
 * />
 */

interface MarketplaceListingDialogProps {
    listing: MarketplaceListing
    trigger?: React.ReactNode
    /** Controlled mode: external open state */
    open?: boolean
    /** Controlled mode: callback when open state changes */
    onOpenChange?: (open: boolean) => void
}

// Get icon for category
function getCategoryIcon(category: string) {
    switch (category) {
        case 'People': return User
        case 'Products': return Package
        case 'Services': return Wrench
        default: return Store
    }
}

export function MarketplaceListingDialog({ 
    listing, 
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange
}: MarketplaceListingDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [isContacting, setIsContacting] = useState(false)
    const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'reviews'>('overview')
    const [reviews, setReviews] = useState<EntityReview[]>([])
    const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null)
    const [reviewsLoading, setReviewsLoading] = useState(false)

    // Support both controlled and uncontrolled modes
    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen

    // Load reviews when tab switches to reviews
    useEffect(() => {
        if (activeTab !== 'reviews' || reviews.length > 0 || reviewsLoading) return
        setReviewsLoading(true)
        const entityType = listing.category === 'People'
            ? 'marketplace_person'
            : listing.category === 'Products'
                ? 'marketplace_product'
                : 'marketplace_service'
        getEntityReviews(entityType, listing.title).then((result) => {
            if ('reviews' in result) {
                setReviews(result.reviews)
                setReviewSummary(result.summary)
            }
            setReviewsLoading(false)
        })
    }, [activeTab, listing.title, listing.category, reviews.length, reviewsLoading])

    const attrs = safeParseAttributes(listing.attributes)
    const category = listing.category
    const CategoryIcon = getCategoryIcon(category)

    // Handle contacting the expert/provider
    const handleContact = async () => {
        const providerId = attrs.provider_id as string

        if (!providerId) {
            toast.error('Unable to contact this provider')
            return
        }

        setIsContacting(true)
        try {
            const result = await contactExpert(providerId, listing.id)
            if (result.success) {
                toast.success('Conversation started! Check the Messages sidebar.')
                setOpen(false)
            } else {
                toast.error(result.error || 'Failed to start conversation')
            }
        } catch (error) {
            toast.error('Failed to contact expert')
            console.error('[MarketplaceListingDialog] Contact error:', error)
        } finally {
            setIsContacting(false)
        }
    }

    // Get primary metric (rate/cost)
    const primaryMetric = attrs.rate || attrs.cost || attrs.price || null

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {/* Only render trigger in uncontrolled mode */}
            {!isControlled && (
                <DialogTrigger asChild>
                    {trigger || (
                        <Button size="sm">
                            View Details
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-1">
                        <Badge
                            variant="secondary"
                            className={cn(
                                "uppercase text-[10px] tracking-wider font-semibold border-0",
                                getCategoryBadgeClasses(category as MarketplaceCategory)
                            )}
                        >
                            {listing.subcategory}
                        </Badge>
                        {listing.is_verified && (
                            <div className="flex items-center gap-1 text-status-success" title="Verified">
                                <ShieldCheck className="h-4 w-4" />
                                <span className="text-xs font-medium">Verified</span>
                            </div>
                        )}
                    </div>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <CategoryIcon className="h-5 w-5 text-electric-blue" />
                        {listing.title}
                        {category === 'People' && attrs.role && (
                            <span className="text-base font-normal text-muted-foreground ml-2">
                                {attrs.role}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'details' | 'reviews')} className="mt-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="overview" className="gap-2">
                            <Info className="h-4 w-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="details" className="gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Details
                        </TabsTrigger>
                        <TabsTrigger value="reviews" className="gap-2">
                            <Star className="h-4 w-4" />
                            Reviews
                        </TabsTrigger>
                    </TabsList>

                    {/* OVERVIEW TAB */}
                    <TabsContent value="overview" className="mt-4 space-y-4">
                        {/* About section */}
                        <Card className="bg-muted/50 border-muted">
                            <CardContent className="pt-6">
                                <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                                    <CategoryIcon className="h-4 w-4 text-electric-blue" />
                                    About
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {listing.description}
                                </p>
                            </CardContent>
                        </Card>

                        {/* Key Metrics Grid */}
                        <KeyMetricsGrid category={category} attrs={attrs} />

                        {/* Skills/Expertise preview */}
                        <SkillsPreview category={category} attrs={attrs} />

                        {/* Marketplace CTA */}
                        <Card className="bg-gradient-to-r from-orange-50 to-background border-orange-100">
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-3">
                                    <Store className="h-5 w-5 text-international-orange shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-foreground mb-1">Ready to connect?</h3>
                                        <p className="text-sm text-muted-foreground mb-3">
                                            Book a consultation or send a message to start the conversation.
                                        </p>
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                            className="border-international-orange text-international-orange"
                                        >
                                            <Link href={`/marketplace/${listing.id}/book`}>
                                                <Calendar className="h-3.5 w-3.5 mr-2" />
                                                Book consultation
                                                <ArrowRight className="ml-2 h-3.5 w-3.5" />
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* DETAILS TAB */}
                    <TabsContent value="details" className="mt-4 space-y-4">
                        {/* Category-specific sections */}
                        {category === 'People' && <PeopleDetails attrs={attrs} />}
                        {category === 'Products' && <ProductsDetails attrs={attrs} />}
                        {category === 'Services' && <ServicesDetails attrs={attrs} />}

                        {/* Additional attributes */}
                        <AdditionalAttributes attrs={attrs} category={category} />
                    </TabsContent>

                    {/* REVIEWS TAB */}
                    <TabsContent value="reviews" className="mt-4 space-y-4">
                        {reviewsLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : reviews.length === 0 ? (
                            <div className="py-12 text-center">
                                <Star className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground">No reviews yet for this listing</p>
                            </div>
                        ) : (
                            <>
                                {/* Rating summary */}
                                {reviewSummary && (
                                    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                                        <div className="text-center">
                                            <p className="text-3xl font-bold text-foreground">
                                                {reviewSummary.avg_rating.toFixed(1)}
                                            </p>
                                            <div className="flex items-center gap-0.5 mt-1">
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <Star
                                                        key={s}
                                                        className={cn(
                                                            'h-4 w-4',
                                                            s <= Math.round(reviewSummary.avg_rating)
                                                                ? 'fill-amber-400 text-amber-400'
                                                                : 'text-muted-foreground'
                                                        )}
                                                    />
                                                ))}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {reviewSummary.total_count} review{reviewSummary.total_count !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                        {/* Distribution bars */}
                                        <div className="flex-1 space-y-1">
                                            {[5, 4, 3, 2, 1].map((star) => {
                                                const count = reviewSummary.distribution[star] ?? 0
                                                const pct = reviewSummary.total_count > 0
                                                    ? (count / reviewSummary.total_count) * 100
                                                    : 0
                                                return (
                                                    <div key={star} className="flex items-center gap-2 text-xs">
                                                        <span className="w-3 text-muted-foreground">{star}</span>
                                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-amber-400 rounded-full"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="w-6 text-right text-muted-foreground">{count}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Individual reviews */}
                                {reviews.map((review) => (
                                    <div key={review.id} className="border-b border-muted pb-4 last:border-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-0.5">
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <Star
                                                            key={s}
                                                            className={cn(
                                                                'h-3 w-3',
                                                                s <= review.rating
                                                                    ? 'fill-amber-400 text-amber-400'
                                                                    : 'text-muted-foreground'
                                                            )}
                                                        />
                                                    ))}
                                                </div>
                                                {review.verified_purchase && (
                                                    <Badge variant="success" className="text-[10px]">
                                                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                                        Verified
                                                    </Badge>
                                                )}
                                            </div>
                                            {review.helpful_count > 0 && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <ThumbsUp className="h-3 w-3" />
                                                    {review.helpful_count}
                                                </div>
                                            )}
                                        </div>
                                        {review.title && (
                                            <p className="text-sm font-semibold text-foreground">{review.title}</p>
                                        )}
                                        <p className="text-sm text-muted-foreground mt-0.5">{review.body}</p>
                                        {(review.pros.length > 0 || review.cons.length > 0) && (
                                            <div className="flex gap-4 mt-2">
                                                {review.pros.length > 0 && (
                                                    <div className="text-xs">
                                                        <span className="text-status-success font-medium">Pros: </span>
                                                        <span className="text-muted-foreground">{review.pros.join(', ')}</span>
                                                    </div>
                                                )}
                                                {review.cons.length > 0 && (
                                                    <div className="text-xs">
                                                        <span className="text-destructive font-medium">Cons: </span>
                                                        <span className="text-muted-foreground">{review.cons.join(', ')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-2">
                                            {review.reviewer_name}
                                            {review.reviewer_role && ` · ${review.reviewer_role}`}
                                            {review.reviewer_company && ` at ${review.reviewer_company}`}
                                        </p>
                                    </div>
                                ))}
                            </>
                        )}
                    </TabsContent>
                </Tabs>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Close
                    </Button>
                    {/* Invite to Company — Founders only, real People listings only */}
                    <InviteToCompanyButton listing={listing} variant="compact" />
                    <Button asChild variant="secondary">
                        <Link href={`/marketplace/${listing.id}/book`}>
                            <Calendar className="h-4 w-4 mr-2" />
                            Book Consultation
                        </Link>
                    </Button>
                    <Button
                        onClick={handleContact}
                        disabled={isContacting}
                        className="bg-international-orange hover:bg-international-orange/90"
                    >
                        {isContacting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Contact
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// Key Metrics Grid Component
function KeyMetricsGrid({ category, attrs }: { category: string; attrs: Record<string, unknown> }) {
    const metrics: { label: string; value: unknown; icon: React.ReactNode }[] = []

    if (category === 'People') {
        if (attrs.rate) metrics.push({ label: 'Rate', value: attrs.rate, icon: <PoundSterling className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.years_experience) metrics.push({ label: 'Experience', value: `${attrs.years_experience} years`, icon: <Briefcase className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.availability) metrics.push({ label: 'Availability', value: attrs.availability, icon: <Calendar className="h-4 w-4 text-muted-foreground" /> })
    } else if (category === 'Products') {
        if (attrs.cost || attrs.price) metrics.push({ label: 'Price', value: attrs.cost || attrs.price, icon: <PoundSterling className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.lead_time) metrics.push({ label: 'Lead Time', value: attrs.lead_time, icon: <Timer className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.moq) metrics.push({ label: 'MOQ', value: attrs.moq, icon: <Package className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4 text-muted-foreground" /> })
    } else if (category === 'Services') {
        if (attrs.rate || attrs.pricing) metrics.push({ label: 'Rate', value: attrs.rate || attrs.pricing, icon: <PoundSterling className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.turnaround) metrics.push({ label: 'Turnaround', value: attrs.turnaround, icon: <Clock className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.capacity) metrics.push({ label: 'Capacity', value: attrs.capacity, icon: <Gauge className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4 text-muted-foreground" /> })
    }

    if (metrics.length === 0) return null

    return (
        <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric, idx) => (
                <Card key={idx}>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-1">
                            {metric.icon}
                            <span className="text-xs font-medium text-muted-foreground uppercase">{metric.label}</span>
                        </div>
                        <p className="text-base font-semibold text-foreground">{String(metric.value)}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

// Skills/Expertise Preview
function SkillsPreview({ category, attrs }: { category: string; attrs: Record<string, unknown> }) {
    const skills = safeStringArray(attrs.skills || attrs.expertise || attrs.integrations || attrs.capabilities)

    if (skills.length === 0) return null

    const label = category === 'People' ? 'Skills & Expertise' :
                  category === 'Products' ? 'Capabilities' : 'Specialties'

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Star className="h-4 w-4 text-electric-blue" />
                    {label}
                </h3>
                <div className="flex flex-wrap gap-2">
                    {skills.slice(0, 6).map((skill: string, i: number) => (
                        <Badge key={i} variant="secondary">
                            {skill}
                        </Badge>
                    ))}
                    {skills.length > 6 && (
                        <Badge variant="outline" className="text-muted-foreground">
                            +{skills.length - 6} more
                        </Badge>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

// People-specific details
function PeopleDetails({ attrs }: { attrs: Record<string, unknown> }) {
    return (
        <div className="space-y-4">
            {/* Education */}
            {!!attrs.education && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <GraduationCap className="h-4 w-4 text-electric-blue" />
                            Education
                        </h3>
                        <p className="text-sm text-muted-foreground">{String(attrs.education)}</p>
                    </CardContent>
                </Card>
            )}

            {/* Previous Companies */}
            {!!attrs.previous_companies && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-electric-blue" />
                            Previous Experience
                        </h3>
                        {(() => {
                            const companies = safeStringArray(attrs.previous_companies)
                            return companies.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {companies.map((company, i) => (
                                        <Badge key={i} variant="secondary">
                                            {company}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">{String(attrs.previous_companies)}</p>
                            )
                        })()}
                    </CardContent>
                </Card>
            )}

            {/* Full Skills/Expertise */}
            {safeStringArray(attrs.skills || attrs.expertise).length > 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Star className="h-4 w-4 text-electric-blue" />
                            Skills & Expertise
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {safeStringArray(attrs.skills || attrs.expertise).map((skill, i) => (
                                <Badge key={i} variant="secondary">
                                    {skill}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Certifications */}
            {!!attrs.certifications && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-electric-blue" />
                            Certifications
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {safeStringArray(attrs.certifications).map((cert, i) => (
                                <Badge key={i} variant="secondary" className="bg-status-success-light text-status-success-dark">
                                    {cert}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// Products-specific details
function ProductsDetails({ attrs }: { attrs: Record<string, unknown> }) {
    const certs = safeStringArray(attrs.certifications)
    const caps = safeStringArray(attrs.capabilities)

    return (
        <div className="space-y-4">
            {/* Certifications */}
            {certs.length > 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-electric-blue" />
                            Certifications
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {certs.map((cert, i) => (
                                <Badge key={i} variant="secondary" className="bg-status-success-light text-status-success-dark">
                                    {cert}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Capabilities */}
            {caps.length > 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Wrench className="h-4 w-4 text-electric-blue" />
                            Capabilities
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {caps.map((cap, i) => (
                                <Badge key={i} variant="secondary">
                                    {cap}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// Services-specific details
function ServicesDetails({ attrs }: { attrs: Record<string, unknown> }) {
    const specs = safeStringArray(attrs.specialty)
    const areas = safeStringArray(attrs.focus_areas)

    return (
        <div className="space-y-4">
            {/* Specialty */}
            {!!attrs.specialty && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-electric-blue" />
                            Specialty
                        </h3>
                        {specs.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {specs.map((spec, i) => (
                                    <Badge key={i} variant="secondary" className="bg-status-info-light text-status-info-dark">
                                        {spec}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">{String(attrs.specialty)}</p>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Focus Areas */}
            {!!attrs.focus_areas && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-electric-blue" />
                            Focus Areas
                        </h3>
                        {areas.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {areas.map((area, i) => (
                                    <Badge key={i} variant="secondary" className="bg-status-info-light text-status-info-dark">
                                        {area}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">{String(attrs.focus_areas)}</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// Additional Attributes section
function AdditionalAttributes({ attrs, category }: { attrs: Record<string, unknown>; category: string }) {
    // Keys already shown in category-specific sections
    const shownKeys = new Set([
        'role', 'rate', 'pricing', 'cost', 'price',
        'years_experience', 'projects_completed', 'education',
        'previous_companies', 'skills', 'expertise',
        'integrations', 'use_cases', 'model', 'provider',
        'accuracy', 'latency', 'throughput',
        'certifications', 'capabilities', 'lead_time', 'moq',
        'specialty', 'focus_areas', 'turnaround', 'capacity',
        'location', 'availability', 'provider_id'
    ])

    const remainingAttrs = Object.entries(attrs).filter(([key]) => !shownKeys.has(key))

    if (remainingAttrs.length === 0) return null

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="font-semibold text-foreground mb-3">Additional Details</h3>
                <div className="space-y-3">
                    {remainingAttrs.map(([key, value]) => {
                        if (value === undefined || value === null) return null
                        const formattedLabel = key.replace(/_/g, ' ')

                        // Render arrays as badges
                        if (Array.isArray(value)) {
                            return (
                                <div key={key}>
                                    <p className="text-sm text-muted-foreground mb-2 capitalize">{formattedLabel}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {value.map((item, i) => (
                                            <Badge key={i} variant="secondary">
                                                {String(item)}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )
                        }

                        // Render booleans
                        if (typeof value === 'boolean') {
                            return (
                                <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                    <span className="text-sm text-muted-foreground capitalize">{formattedLabel}</span>
                                    <Badge variant={value ? "success" : "secondary"}>
                                        {value ? 'Yes' : 'No'}
                                    </Badge>
                                </div>
                            )
                        }

                        // Render strings/numbers
                        return (
                            <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                <span className="text-sm text-muted-foreground capitalize">{formattedLabel}</span>
                                <span className="text-sm font-medium text-foreground">
                                    {String(value)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}