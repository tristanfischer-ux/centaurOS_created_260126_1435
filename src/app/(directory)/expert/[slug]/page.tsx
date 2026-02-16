import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { getDirectoryExpertBySlug } from '@/actions/directory'
import { DirectoryCTA } from '@/components/directory/DirectoryCTA'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Star,
    MapPin,
    Clock,
    Shield,
    Briefcase,
    Linkedin,
    Globe,
    Calendar,
    ChevronLeft,
    Quote,
    TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateExpertJsonLd } from '@/lib/directory/structured-data'
import type { DirectoryCaseStudy } from '@/lib/directory/types'
import { sanitizeHref } from '@/lib/security/url-validation'

/**
 * /expert/[slug] - Public individual expert profile page.
 *
 * @description SEO-optimized profile page showing an expert's full public
 * information: bio, specializations, case studies, ratings, and CTAs.
 * No authentication required.
 *
 * @security All data from SECURITY DEFINER RPC functions. No email or
 * Stripe data exposed. External URLs sanitized before rendering.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

interface PageProps {
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    const expert = await getDirectoryExpertBySlug(slug)

    if (!expert) {
        return { title: 'Expert Not Found | Fractional Forge' }
    }

    const name = expert.user_name || 'Expert'
    const headline = expert.headline || 'Fractional Executive'
    const description = expert.bio?.slice(0, 160) || `View ${name}'s profile on Fractional Forge`

    const ogParams = new URLSearchParams({
        name,
        headline,
        ...(expert.average_rating ? { rating: expert.average_rating.toString() } : {}),
        ...(expert.total_reviews ? { reviews: expert.total_reviews.toString() } : {}),
        ...(expert.specializations?.length
            ? { skills: expert.specializations.slice(0, 4).join(',') }
            : {}),
        ...(expert.location ? { location: expert.location } : {}),
        ...(expert.is_verified ? { verified: 'true' } : {}),
    })
    const ogImageUrl = `${APP_URL}/api/og/profile?${ogParams.toString()}`

    return {
        title: `${name} - ${headline} | Fractional Forge`,
        description,
        openGraph: {
            title: `${name} - ${headline}`,
            description: `${description} | Find experts like this on Fractional Forge.`,
            type: 'profile',
            url: `${APP_URL}/expert/${slug}`,
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `${name} - ${headline} on Fractional Forge`,
                },
            ],
            siteName: 'Fractional Forge',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${name} - ${headline}`,
            description: `${description} | Find experts like this on Fractional Forge.`,
            images: [ogImageUrl],
        },
        alternates: {
            canonical: `${APP_URL}/expert/${slug}`,
        },
    }
}

function ProfileSkeleton() {
    return (
        <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="flex flex-col gap-8 md:flex-row">
                <div className="md:w-1/3">
                    <Skeleton className="h-32 w-32 rounded-full mx-auto" />
                    <Skeleton className="mx-auto mt-4 h-8 w-48" />
                    <Skeleton className="mx-auto mt-2 h-4 w-64" />
                </div>
                <div className="space-y-4 md:w-2/3">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                </div>
            </div>
        </div>
    )
}

function formatCurrency(amount: number | null, currency: string): string | null {
    if (!amount) return null
    const symbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' }
    return `${symbols[currency] || ''}${amount.toLocaleString()}`
}

function CaseStudyCard({ caseStudy }: { caseStudy: DirectoryCaseStudy }) {
    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-international-orange/10">
                        <TrendingUp className="h-5 w-5 text-international-orange" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-foreground">
                            {caseStudy.title}
                        </h4>
                        {caseStudy.client_name && (
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                {caseStudy.client_name}
                                {caseStudy.client_industry && ` · ${caseStudy.client_industry}`}
                            </p>
                        )}
                    </div>
                    {caseStudy.engagement_type && (
                        <Badge variant="secondary" className="text-xs capitalize">
                            {caseStudy.engagement_type}
                        </Badge>
                    )}
                </div>

                <div className="mt-4 space-y-3 text-sm">
                    <div>
                        <p className="font-medium text-foreground">Challenge</p>
                        <p className="text-muted-foreground leading-relaxed">
                            {caseStudy.challenge}
                        </p>
                    </div>
                    <div>
                        <p className="font-medium text-foreground">Outcome</p>
                        <p className="text-muted-foreground leading-relaxed">
                            {caseStudy.outcome}
                        </p>
                    </div>
                </div>

                {/* Metrics */}
                {caseStudy.metrics && caseStudy.metrics.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-3">
                        {caseStudy.metrics.map((metric, i) => (
                            <div
                                key={i}
                                className="rounded-lg bg-muted/50 px-3 py-2 text-center"
                            >
                                <p className="text-sm font-semibold text-foreground">
                                    {metric.value}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {metric.label}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Testimonial */}
                {caseStudy.testimonial_quote && (
                    <div className="mt-4 border-l-2 border-international-orange/30 pl-4">
                        <div className="flex gap-2">
                            <Quote className="h-4 w-4 flex-shrink-0 text-international-orange/50" />
                            <p className="text-sm italic text-muted-foreground leading-relaxed">
                                {caseStudy.testimonial_quote}
                            </p>
                        </div>
                        {caseStudy.testimonial_author && (
                            <p className="mt-1 text-xs font-medium text-foreground">
                                — {caseStudy.testimonial_author}
                                {caseStudy.testimonial_role && (
                                    <span className="font-normal text-muted-foreground">
                                        , {caseStudy.testimonial_role}
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

async function ExpertProfileContent({ slug }: { slug: string }) {
    const expert = await getDirectoryExpertBySlug(slug)

    if (!expert) {
        notFound()
    }

    const jsonLd = generateExpertJsonLd(expert)

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm">
                    <Link
                        href="/experts"
                        className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Back to Directory
                    </Link>
                </nav>

                <div className="flex flex-col gap-8 lg:flex-row">
                    {/* Sidebar: Profile card */}
                    <div className="lg:w-1/3">
                        <Card className="sticky top-24">
                            <CardContent className="pt-6">
                                {/* Avatar and name */}
                                <div className="text-center">
                                    <div className="mx-auto mb-4">
                                        <UserAvatar
                                            name={expert.user_name}
                                            role="Executive"
                                            avatarUrl={expert.user_avatar}
                                            size="2xl"
                                            className="mx-auto"
                                        />
                                    </div>
                                    <h1 className="text-xl font-bold text-foreground">
                                        {expert.user_name || 'Expert'}
                                    </h1>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {expert.headline || 'Fractional Executive'}
                                    </p>

                                    {/* Tier badge */}
                                    {expert.is_verified && (
                                        <div className="mt-2">
                                            <Badge variant="info" className="gap-1">
                                                <Shield className="h-3 w-3" />
                                                Verified
                                            </Badge>
                                        </div>
                                    )}
                                </div>

                                {/* Rating */}
                                {expert.average_rating && expert.total_reviews > 0 && (
                                    <div className="mt-4 flex items-center justify-center gap-2">
                                        <div className="flex">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <Star
                                                    key={i}
                                                    className={cn(
                                                        'h-4 w-4',
                                                        i < Math.round(expert.average_rating || 0)
                                                            ? 'fill-status-warning text-status-warning'
                                                            : 'text-muted'
                                                    )}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-sm font-medium text-foreground">
                                            {expert.average_rating.toFixed(1)}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                            ({expert.total_reviews} reviews)
                                        </span>
                                    </div>
                                )}

                                {/* Meta info */}
                                <div className="mt-6 space-y-3">
                                    {expert.location && (
                                        <div className="flex items-center gap-3 text-sm">
                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-foreground">{expert.location}</span>
                                        </div>
                                    )}
                                    {expert.years_experience && (
                                        <div className="flex items-center gap-3 text-sm">
                                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-foreground">
                                                {expert.years_experience}+ years experience
                                            </span>
                                        </div>
                                    )}
                                    {expert.timezone && (
                                        <div className="flex items-center gap-3 text-sm">
                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-foreground">
                                                {expert.timezone.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Pricing */}
                                <div className="mt-6 rounded-lg bg-muted/50 p-4">
                                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                        Rates
                                    </p>
                                    <div className="mt-2 space-y-1">
                                        {expert.day_rate && (
                                            <p className="text-lg font-bold text-foreground">
                                                {formatCurrency(expert.day_rate, expert.currency)}
                                                <span className="text-sm font-normal text-muted-foreground">
                                                    /day
                                                </span>
                                            </p>
                                        )}
                                        {expert.hourly_rate && (
                                            <p className={cn(
                                                expert.day_rate ? 'text-sm text-muted-foreground' : 'text-lg font-bold text-foreground'
                                            )}>
                                                {formatCurrency(expert.hourly_rate, expert.currency)}
                                                <span className="text-sm font-normal text-muted-foreground">
                                                    /hr
                                                </span>
                                            </p>
                                        )}
                                        {!expert.day_rate && !expert.hourly_rate && (
                                            <p className="text-sm text-muted-foreground">
                                                Contact for rates
                                            </p>
                                        )}
                                    </div>
                                    {expert.accepts_trial && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Trial engagements available
                                            {expert.trial_rate_discount > 0 && (
                                                <span> · {expert.trial_rate_discount}% trial discount</span>
                                            )}
                                        </p>
                                    )}
                                </div>

                                {/* CTA Button */}
                                <div className="mt-6">
                                    <Link href="/login" className="block">
                                        <Button className="w-full gap-1.5" size="lg">
                                            <Calendar className="h-4 w-4" />
                                            Book a Discovery Call
                                        </Button>
                                    </Link>
                                    <p className="mt-2 text-center text-xs text-muted-foreground">
                                        Free · No commitment · Takes 2 minutes
                                    </p>
                                </div>

                                {/* External links */}
                                {(expert.linkedin_url || expert.website_url) && (
                                    <div className="mt-6 flex items-center justify-center gap-3">
                                        {expert.linkedin_url && (
                                            <a
                                                href={sanitizeHref(expert.linkedin_url) || '#'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                aria-label="LinkedIn profile"
                                            >
                                                <Linkedin className="h-5 w-5" />
                                            </a>
                                        )}
                                        {expert.website_url && (
                                            <a
                                                href={sanitizeHref(expert.website_url) || '#'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                aria-label="Personal website"
                                            >
                                                <Globe className="h-5 w-5" />
                                            </a>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main content */}
                    <div className="lg:w-2/3 space-y-8">
                        {/* About */}
                        {expert.bio && (
                            <section>
                                <h2 className="text-lg font-semibold text-foreground mb-3">
                                    About
                                </h2>
                                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                                    {expert.bio}
                                </p>
                            </section>
                        )}

                        {/* Specializations */}
                        {expert.specializations.length > 0 && (
                            <section>
                                <h2 className="text-lg font-semibold text-foreground mb-3">
                                    Specializations
                                </h2>
                                <div className="flex flex-wrap gap-2">
                                    {expert.specializations.map((spec) => (
                                        <Badge key={spec} variant="secondary">
                                            {spec}
                                        </Badge>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Industries */}
                        {expert.industries.length > 0 && (
                            <section>
                                <h2 className="text-lg font-semibold text-foreground mb-3">
                                    Industries
                                </h2>
                                <div className="flex flex-wrap gap-2">
                                    {expert.industries.map((ind) => (
                                        <Badge key={ind} variant="secondary">
                                            {ind}
                                        </Badge>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Company stages */}
                        {expert.company_stages.length > 0 && (
                            <section>
                                <h2 className="text-lg font-semibold text-foreground mb-3">
                                    Ideal Company Stage
                                </h2>
                                <div className="flex flex-wrap gap-2">
                                    {expert.company_stages.map((stage) => (
                                        <Badge key={stage} variant="secondary">
                                            {stage}
                                        </Badge>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Case Studies */}
                        {expert.case_studies.length > 0 && (
                            <section>
                                <h2 className="text-lg font-semibold text-foreground mb-4">
                                    Case Studies
                                </h2>
                                <div className="space-y-4">
                                    {expert.case_studies.map((cs) => (
                                        <CaseStudyCard key={cs.id} caseStudy={cs} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Bottom CTA */}
                        <DirectoryCTA variant="hire" className="mt-8" />
                    </div>
                </div>
            </div>
        </>
    )
}

export default async function ExpertProfilePage({ params }: PageProps) {
    const { slug } = await params

    return (
        <Suspense fallback={<ProfileSkeleton />}>
            <ExpertProfileContent slug={slug} />
        </Suspense>
    )
}
