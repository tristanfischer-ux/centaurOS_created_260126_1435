'use client'

import { useState } from "react"
import { MarketplaceListing } from "@/actions/marketplace"
import { contactExpert } from "@/actions/messaging"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
    safeParseAttributes,
    safeStringArray,
    HIDDEN_ATTRIBUTES,
    ATTRIBUTE_GROUP_ORDER,
    formatAttributeLabel,
    isURL,
} from "@/lib/marketplace-utils"
import { getCategoryBadgeClasses, type MarketplaceCategory } from "@/lib/marketplace-colors"
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
    ExternalLink,
    Globe,
    Mail,
    Send,
} from "lucide-react"
import Link from "next/link"
import { QuoteRequestDialog } from "@/components/marketplace/quote-request-dialog"
import { ProviderTrustSection } from "@/components/marketplace/ProviderTrustSection"
import { CompanyLocationMap } from "@/components/marketplace/CompanyLocationMap"
import { VerificationBadge } from "@/components/marketplace/VerificationBadge"
import type { PortfolioItem, Certification, ProviderBadge } from "@/actions/trust-signals"
import type { RatingsSummary, ProviderRating } from "@/actions/ratings"
import type { PublicExecutive } from "@/actions/listing-executives"
import type { MarketplaceReview } from "@/actions/marketplace-reviews"
import { ListingReviewsSection, ListingRatingSummary } from "@/components/marketplace/listing-reviews"
import { toast } from "sonner"

interface TrustSignalsData {
    portfolio: PortfolioItem[]
    certifications: Certification[]
    badges: ProviderBadge[]
}

interface RatingsData {
    summary: RatingsSummary | null
    reviews: ProviderRating[]
    error: string | null
}

interface MarketplaceListingDetailProps {
    listing: MarketplaceListing
    trustSignals?: TrustSignalsData | null
    ratings?: RatingsData | null
    executives?: PublicExecutive[]
    reviews?: MarketplaceReview[]
    currentUserId?: string | null
}

export function MarketplaceListingDetail({ listing, trustSignals, ratings, executives = [], reviews = [], currentUserId = null }: MarketplaceListingDetailProps) {
    const attrs = safeParseAttributes(listing.attributes)
    const category = listing.category
    const [isContacting, setIsContacting] = useState(false)

    // Handle contacting the expert/provider
    const handleContact = async () => {
        // Get the provider ID from the listing attributes
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
            } else {
                toast.error(result.error || 'Failed to start conversation')
            }
        } catch (error) {
            toast.error('Failed to contact expert')
        } finally {
            setIsContacting(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header - Matches Strategic Objectives style exactly */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-border">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <Badge 
                            variant="secondary" 
                            className={cn(
                                "uppercase text-[10px] tracking-wider font-semibold",
                                getCategoryBadgeClasses(category as MarketplaceCategory)
                            )}
                        >
                            {listing.subcategory}
                        </Badge>
                        <VerificationBadge tier={listing.verification_tier} size="md" showLabel />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                            {listing.title}
                        </h1>
                        {category === 'People' && attrs.role && (
                            <span className="text-lg text-muted-foreground">
                                {attrs.role}
                            </span>
                        )}
                    </div>
                    {/* Star rating summary */}
                    <ListingRatingSummary
                        averageRating={listing.average_rating != null ? Number(listing.average_rating) : null}
                        reviewCount={listing.review_count ?? 0}
                    />
                </div>

                <div className="flex items-center gap-2">
                    {category === 'People' ? (
                        <Button variant="secondary" asChild>
                            <Link href={`/marketplace/${listing.id}/book`}>
                                <Calendar className="h-4 w-4 mr-2" />
                                Book Consultation
                            </Link>
                        </Button>
                    ) : attrs.provider_id ? (
                        <Button
                            variant="secondary"
                            onClick={handleContact}
                            disabled={isContacting}
                        >
                            {isContacting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Send Enquiry
                                </>
                            )}
                        </Button>
                    ) : attrs.contact_email ? (
                        <Button variant="secondary" asChild>
                            <a href={`mailto:${attrs.contact_email}?subject=Enquiry about ${listing.title}`}>
                                <Mail className="h-4 w-4 mr-2" />
                                Send Enquiry
                            </a>
                        </Button>
                    ) : attrs.website_url ? (
                        <Button variant="secondary" asChild>
                            <a href={String(attrs.website_url)} target="_blank" rel="noopener noreferrer">
                                <Globe className="h-4 w-4 mr-2" />
                                Visit Website
                            </a>
                        </Button>
                    ) : null}
                    {/* Request Quote — available for any listing with contact_email */}
                    {category !== 'People' && listing.contact_email && (
                        <QuoteRequestDialog
                            listings={listing}
                            trigger={
                                <Button variant="default" className="bg-international-orange hover:bg-international-orange-hover">
                                    <Send className="h-4 w-4 mr-2" />
                                    Request Quote
                                </Button>
                            }
                        />
                    )}
                    {attrs.provider_id && (
                        <Button
                            variant="default"
                            onClick={handleContact}
                            disabled={isContacting}
                            className="bg-international-orange hover:bg-international-orange-hover"
                        >
                            {isContacting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Connecting...
                                </>
                            ) : (
                                <MessageSquare className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main content */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Description */}
                    <section>
                        <h2 className="text-lg font-semibold text-foreground mb-2">About</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {listing.description}
                        </p>
                    </section>

                    {/* Category-specific sections */}
                    {category === 'People' && <PeopleSection attrs={attrs} />}
                    {category === 'Products' && <ProductsSection attrs={attrs} />}
                    {category === 'Services' && <ServicesSection attrs={attrs} />}

                    {/* Companies House info (directors, PSC, SIC codes) — only for non-People listings */}
                    {category !== 'People' && <CompanyInfoSection attrs={attrs} />}

                    {/* Fractional Executives */}
                    {executives.length > 0 && (
                        <ExecutivesDisplay executives={executives} />
                    )}

                    {/* All Attributes */}
                    <AttributesSection attrs={attrs} category={category} />

                    {/* Reviews Section */}
                    <ListingReviewsSection
                        listingId={listing.id}
                        initialReviews={reviews}
                        currentUserId={currentUserId}
                    />
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* Key Metrics */}
                    <KeyMetricsCard category={category} attrs={attrs} />

                    {/* Location Map */}
                    {(attrs.ch_registered_address || attrs.location) && (
                        <CompanyLocationMap address={String(attrs.ch_registered_address || attrs.location)} />
                    )}

                    {/* Trust & Credentials Section */}
                    {(trustSignals || ratings) && (
                        <ProviderTrustSection
                            ratingSummary={ratings?.summary}
                            reviews={ratings?.reviews || []}
                            badges={trustSignals?.badges || []}
                            certifications={trustSignals?.certifications || []}
                            portfolio={trustSignals?.portfolio || []}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

// Key Metrics Card
function KeyMetricsCard({ category, attrs }: { category: string; attrs: Record<string, any> }) {
    const metrics: { label: string; value: any; icon: React.ReactNode }[] = []

    if (category === 'People') {
        if (attrs.rate) metrics.push({ label: 'Rate', value: attrs.rate, icon: <PoundSterling className="h-4 w-4" /> })
        if (attrs.years_experience) metrics.push({ label: 'Experience', value: `${attrs.years_experience} years`, icon: <Briefcase className="h-4 w-4" /> })
        if (attrs.projects_completed) metrics.push({ label: 'Projects', value: attrs.projects_completed, icon: <CheckCircle2 className="h-4 w-4" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4" /> })
    } else if (category === 'Products') {
        if (attrs.cost || attrs.price) metrics.push({ label: 'Price', value: attrs.cost || attrs.price, icon: <PoundSterling className="h-4 w-4" /> })
        if (attrs.lead_time) metrics.push({ label: 'Lead Time', value: attrs.lead_time, icon: <Timer className="h-4 w-4" /> })
        if (attrs.moq) metrics.push({ label: 'MOQ', value: attrs.moq, icon: <Package className="h-4 w-4" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4" /> })
    } else if (category === 'Services') {
        if (attrs.rate || attrs.pricing) metrics.push({ label: 'Rate', value: attrs.rate || attrs.pricing, icon: <PoundSterling className="h-4 w-4" /> })
        if (attrs.turnaround) metrics.push({ label: 'Turnaround', value: attrs.turnaround, icon: <Clock className="h-4 w-4" /> })
        if (attrs.capacity) metrics.push({ label: 'Capacity', value: attrs.capacity, icon: <Gauge className="h-4 w-4" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4" /> })
    }

    // CH data fallbacks — only for non-People listings (company data, not recruit profiles)
    if (category !== 'People') {
        if (attrs.ch_company_status) metrics.push({ label: 'Status', value: String(attrs.ch_company_status).replace(/\b\w/g, (c: string) => c.toUpperCase()), icon: <CheckCircle2 className="h-4 w-4" /> })
        if (attrs.ch_company_number) metrics.push({ label: 'CH Number', value: attrs.ch_company_number, icon: <Building2 className="h-4 w-4" /> })
        if (attrs.ch_incorporation_date) {
            const date = new Date(attrs.ch_incorporation_date)
            if (!isNaN(date.getTime())) {
                metrics.push({ label: 'Incorporated', value: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), icon: <Calendar className="h-4 w-4" /> })
            }
        }
        if (attrs.ch_company_size) metrics.push({ label: 'Size', value: attrs.ch_company_size, icon: <Users className="h-4 w-4" /> })
        if (attrs.ch_company_type) metrics.push({ label: 'Type', value: attrs.ch_company_type, icon: <Layers className="h-4 w-4" /> })
        if (!metrics.some(m => m.label === 'Location') && attrs.ch_registered_address) {
            metrics.push({ label: 'Address', value: attrs.ch_registered_address, icon: <MapPin className="h-4 w-4" /> })
        }
        if (attrs.website_url) metrics.push({ label: 'Website', value: attrs.website_url, icon: <ExternalLink className="h-4 w-4" /> })
    }

    if (metrics.length === 0) return null

    return (
        <Card>
            <CardHeader>
                <h3 className="font-semibold text-foreground">Key Details</h3>
            </CardHeader>
            <CardContent className="space-y-4">
                {metrics.map((metric, idx) => (
                    <div key={idx} className="flex items-start justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            {metric.icon}
                            <span className="text-sm">{metric.label}</span>
                        </div>
                        {metric.label === 'Website' && typeof metric.value === 'string' && isURL(metric.value) ? (
                            <a
                                href={metric.value}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                            >
                                {new URL(metric.value).hostname.replace(/^www\./, '')}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        ) : (
                            <span className="text-sm font-semibold text-foreground text-right max-w-[60%]">
                                {metric.value}
                            </span>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

// People-specific section
function PeopleSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <div className="space-y-4">
            {/* Education */}
            {attrs.education && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <GraduationCap className="h-5 w-5" />
                        Education
                    </h2>
                    <p className="text-muted-foreground">{attrs.education}</p>
                </section>
            )}

            {/* Previous Companies */}
            {attrs.previous_companies && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Building2 className="h-5 w-5" />
                        Previous Experience
                    </h2>
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
                            <p className="text-muted-foreground">{String(attrs.previous_companies)}</p>
                        )
                    })()}
                </section>
            )}

            {/* Skills/Expertise */}
            {(attrs.skills || attrs.expertise) && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Star className="h-5 w-5" />
                        Skills & Expertise
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {safeStringArray(attrs.skills || attrs.expertise).map((skill, i) => (
                            <Badge key={i} variant="secondary" className="bg-secondary text-secondary-foreground">
                                {skill}
                            </Badge>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

// Products-specific section
function ProductsSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <div className="space-y-4">
            {/* Certifications */}
            {attrs.certifications && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Award className="h-5 w-5" />
                        Certifications
                    </h2>
                    {(() => {
                        const certs = safeStringArray(attrs.certifications)
                        return certs.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {certs.map((cert, i) => (
                                    <Badge key={i} variant="secondary" className="bg-status-success-light text-status-success-dark">
                                        {cert}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">{String(attrs.certifications)}</p>
                        )
                    })()}
                </section>
            )}

            {/* Capabilities */}
            {attrs.capabilities && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Wrench className="h-5 w-5" />
                        Capabilities
                    </h2>
                    {(() => {
                        const caps = safeStringArray(attrs.capabilities)
                        return caps.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {caps.map((cap, i) => (
                                    <Badge key={i} variant="secondary">
                                        {cap}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">{String(attrs.capabilities)}</p>
                        )
                    })()}
                </section>
            )}
        </div>
    )
}

// Services-specific section
function ServicesSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <div className="space-y-4">
            {/* Specialty */}
            {attrs.specialty && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Target className="h-5 w-5" />
                        Specialty
                    </h2>
                    {(() => {
                        const specs = safeStringArray(attrs.specialty)
                        return specs.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {specs.map((spec, i) => (
                                    <Badge key={i} variant="secondary" className="bg-status-info-light text-status-info-dark">
                                        {spec}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">{String(attrs.specialty)}</p>
                        )
                    })()}
                </section>
            )}

            {/* Focus Areas */}
            {attrs.focus_areas && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Users className="h-5 w-5" />
                        Focus Areas
                    </h2>
                    {(() => {
                        const areas = safeStringArray(attrs.focus_areas)
                        return areas.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {areas.map((area, i) => (
                                    <Badge key={i} variant="secondary" className="bg-status-info-light text-status-info-dark">
                                        {area}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">{String(attrs.focus_areas)}</p>
                        )
                    })()}
                </section>
            )}
        </div>
    )
}

// Companies House info section — directors, PSC, SIC codes
function CompanyInfoSection({ attrs }: { attrs: Record<string, any> }) {
    const directors = Array.isArray(attrs.ch_directors) ? attrs.ch_directors : []
    const pscs = Array.isArray(attrs.ch_psc) ? attrs.ch_psc : []
    const sicCodes = Array.isArray(attrs.ch_sic_codes) ? attrs.ch_sic_codes : []

    if (directors.length === 0 && pscs.length === 0 && sicCodes.length === 0) return null

    return (
        <div className="space-y-4">
            {directors.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <Users className="h-5 w-5" />
                        Directors
                    </h2>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="space-y-1">
                                {directors.map((d: { name?: string; appointed_on?: string }, i: number) => (
                                    <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                        <span className="text-sm font-medium text-foreground">{d.name || 'Unknown'}</span>
                                        {d.appointed_on && (
                                            <span className="text-xs text-muted-foreground">
                                                Appointed {new Date(d.appointed_on).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </section>
            )}

            {pscs.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <ShieldCheck className="h-5 w-5" />
                        Persons of Significant Control
                    </h2>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="space-y-1">
                                {pscs.map((p: { name?: string; natures_of_control?: string[] }, i: number) => (
                                    <div key={i} className="py-2 border-b border-border last:border-0">
                                        <span className="text-sm font-medium text-foreground">{p.name || 'Unknown'}</span>
                                        {p.natures_of_control && p.natures_of_control.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {p.natures_of_control.map((n: string, j: number) => (
                                                    <Badge key={j} variant="secondary" className="text-[10px]">
                                                        {n.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </section>
            )}

            {sicCodes.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                        <BarChart3 className="h-5 w-5" />
                        SIC Codes
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {sicCodes.map((code: string, i: number) => (
                            <Badge key={i} variant="secondary">{code}</Badge>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

// Attributes Section - renders all remaining attributes
function AttributesSection({ attrs, category }: { attrs: Record<string, any>; category: string }) {
    // Keys already shown in category-specific sections, key metrics, or company info
    const shownKeys = new Set([
        'role', 'rate', 'pricing', 'cost', 'price',
        'years_experience', 'projects_completed', 'education',
        'previous_companies', 'skills', 'expertise',
        'integrations', 'use_cases', 'model', 'provider',
        'accuracy', 'latency', 'throughput',
        'certifications', 'capabilities', 'lead_time', 'moq',
        'specialty', 'focus_areas', 'turnaround', 'capacity',
        'location', 'availability',
        // CH fields shown in KeyMetricsCard or CompanyInfoSection
        'ch_company_status', 'ch_company_number', 'ch_incorporation_date',
        'ch_company_size', 'ch_company_type', 'ch_registered_address',
        'ch_directors', 'ch_psc', 'ch_sic_codes', 'website_url',
    ])

    const remainingAttrs = Object.entries(attrs)
        .filter(([key]) => !shownKeys.has(key) && !HIDDEN_ATTRIBUTES.has(key))
        .filter(([key]) => category !== 'People' || !key.startsWith('ch_'))

    if (remainingAttrs.length === 0) return null

    // Sort: known keys in ATTRIBUTE_GROUP_ORDER first, then unknown keys alphabetically
    const orderIndex = new Map(ATTRIBUTE_GROUP_ORDER.map((k, i) => [k, i]))
    remainingAttrs.sort(([a], [b]) => {
        const ia = orderIndex.get(a) ?? Infinity
        const ib = orderIndex.get(b) ?? Infinity
        if (ia !== ib) return ia - ib
        return a.localeCompare(b)
    })

    return (
        <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
                Additional Details
            </h2>
            <Card>
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        {remainingAttrs.map(([key, value]) => (
                            <AttributeRow key={key} attrKey={key} value={value} />
                        ))}
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}

function AttributeRow({ attrKey, value }: { attrKey: string; value: any }) {
    const label = formatAttributeLabel(attrKey)

    if (value === undefined || value === null) return null

    // Render arrays — handle objects (directors, PSCs) vs simple strings
    if (Array.isArray(value)) {
        const hasObjects = value.some(item => item && typeof item === 'object')

        if (hasObjects) {
            return (
                <div>
                    <p className="text-sm text-muted-foreground mb-2">{label}</p>
                    <div className="space-y-2">
                        {value.map((item, i) => {
                            if (item && typeof item === 'object') {
                                const name = item.name || item.title || 'Unknown'
                                const detail = item.appointed_on
                                    ? `Appointed ${new Date(item.appointed_on).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                                    : item.natures_of_control
                                        ? (Array.isArray(item.natures_of_control)
                                            ? item.natures_of_control.map((n: string) => n.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(', ')
                                            : String(item.natures_of_control))
                                        : null
                                return (
                                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                                        <span className="text-sm font-medium text-foreground">{name}</span>
                                        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
                                    </div>
                                )
                            }
                            return (
                                <Badge key={i} variant="secondary" className="text-xs">
                                    {String(item)}
                                </Badge>
                            )
                        })}
                    </div>
                </div>
            )
        }

        return (
            <div>
                <p className="text-sm text-muted-foreground mb-2">{label}</p>
                <div className="flex flex-wrap gap-2">
                    {value.map((item, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
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
            <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Badge variant={value ? "success" : "secondary"} className="text-xs">
                    {value ? 'Yes' : 'No'}
                </Badge>
            </div>
        )
    }

    // Render objects as structured key-value rows
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).filter(
            ([, v]) => v !== null && v !== undefined && v !== ''
        )
        if (entries.length === 0) return null

        const formatKey = (key: string) =>
            key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

        const renderValue = (k: string, v: unknown) => {
            if (typeof v === 'boolean') {
                return (
                    <Badge variant={v ? 'success' : 'secondary'} className="text-xs">
                        {v ? 'Yes' : 'No'}
                    </Badge>
                )
            }
            if (k === 'health' && typeof v === 'string') {
                const variant = v === 'good' ? 'success' : v === 'caution' ? 'warning' : v === 'risk' ? 'destructive' : 'secondary'
                return (
                    <Badge variant={variant} className="text-xs capitalize">
                        {v}
                    </Badge>
                )
            }
            if (k === 'company_status' && typeof v === 'string') {
                const variant = v === 'active' ? 'success' : v === 'dissolved' ? 'destructive' : 'secondary'
                return (
                    <Badge variant={variant} className="text-xs capitalize">
                        {v}
                    </Badge>
                )
            }
            return <span className="text-sm font-medium text-foreground">{String(v)}</span>
        }

        return (
            <div>
                <p className="text-sm text-muted-foreground mb-2">{label}</p>
                <div className="bg-muted/50 rounded-lg p-3 space-y-0">
                    {entries.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                            <span className="text-sm text-muted-foreground">{formatKey(k)}</span>
                            {renderValue(k, v)}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const strValue = String(value)

    // Render URLs as clickable links
    if (typeof value === 'string' && isURL(value)) {
        return (
            <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-international-orange hover:underline inline-flex items-center gap-1"
                >
                    {new URL(value).hostname.replace(/^www\./, '')}
                    <ExternalLink className="h-3 w-3" />
                </a>
            </div>
        )
    }

    // Render ISO dates as human-readable
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|\s)/.test(value)) {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
            const formatted = date.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            })
            return (
                <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium text-foreground">{formatted}</span>
                </div>
            )
        }
    }

    // Render strings/numbers
    return (
        <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-medium text-foreground">
                {strValue}
            </span>
        </div>
    )
}

// ── Executives Display ──────────────────────────────────────────────────────

const AVAILABILITY_LABELS: Record<string, string> = {
    full_time: 'Full-Time',
    part_time: 'Part-Time',
    advisory: 'Advisory',
    project_based: 'Project-Based',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    GBP: '\u00a3',
    USD: '$',
    EUR: '\u20ac',
}

function formatDayRate(rate: number, currency: string | null): string {
    const symbol = CURRENCY_SYMBOLS[currency ?? 'GBP'] ?? currency ?? '\u00a3'
    return `${symbol}${rate.toLocaleString()}/day`
}

function ExecutivesDisplay({ executives }: { executives: PublicExecutive[] }) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-international-orange" />
                    <h2 className="text-lg font-semibold text-foreground">
                        Fractional Executives
                    </h2>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {executives.map((exec) => (
                    <div
                        key={exec.id}
                        className="rounded-lg border border-border p-4"
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">
                                {exec.full_name}
                            </span>
                            {exec.title && (
                                <span className="text-sm text-muted-foreground">
                                    &middot; {exec.title}
                                </span>
                            )}
                            <Badge variant="secondary" className="text-xs">
                                {AVAILABILITY_LABELS[exec.availability] ?? exec.availability}
                            </Badge>
                            {exec.day_rate != null && (
                                <span className="text-sm font-medium text-international-orange">
                                    {formatDayRate(exec.day_rate, exec.currency)}
                                </span>
                            )}
                        </div>
                        {exec.bio && (
                            <p className="text-sm text-muted-foreground mt-1">
                                {exec.bio}
                            </p>
                        )}
                        {exec.specializations && exec.specializations.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {exec.specializations.map((s) => (
                                    <Badge key={s} variant="outline" className="text-xs">
                                        {s}
                                    </Badge>
                                ))}
                            </div>
                        )}
                        {exec.linkedin_url && (
                            <a
                                href={exec.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-international-orange hover:underline inline-flex items-center gap-1 mt-2"
                            >
                                <ExternalLink className="h-3 w-3" />
                                LinkedIn Profile
                            </a>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
