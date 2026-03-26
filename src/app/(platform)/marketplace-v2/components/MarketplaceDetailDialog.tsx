'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn, getInitials } from '@/lib/utils'
import { safeParseAttributes, safeStringArray } from '@/lib/marketplace-utils'
import {
    getCategoryBadgeClasses,
    getAvatarGradient,
    type MarketplaceCategory,
} from '@/lib/marketplace-colors'
import {
    ShieldCheck,
    Star,
    Clock,
    MapPin,
    Briefcase,
    MessageSquare,
    CalendarDays,
    Users,
    Bot,
    Sparkles,
    BarChart3,
    Zap,
    ExternalLink,
    CheckCircle2,
    FlaskConical,
    Loader2,
    Building2,
    Calendar,
    Globe,
    Mail,
    Scale,
    Award,
    Factory,
    Wrench,
    ChevronDown,
    Activity,
    Shield,
} from 'lucide-react'
import Link from 'next/link'
import { ActOnThisButton } from '@/components/smart/act-on-this-button'
import { InviteToCompanyButton } from '@/components/marketplace/invite-to-company-button'
import { contactExpert } from '@/actions/messaging'
import { toast } from 'sonner'
import { VerificationBadge } from '@/components/marketplace/VerificationBadge'
import type { MarketplaceListing, ProcessCapability } from '@/actions/marketplace'
import { getSimilarListings } from '@/actions/marketplace'
import { EndorsementSection } from '@/components/marketplace/endorsement-section'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import { getEndorsementSummary, getSkillEndorsements } from '@/actions/endorsements'
import type { EndorsementSummary, SkillEndorsement } from '@/actions/endorsements'

type DialogTab = 'overview' | 'capabilities' | 'company'

interface MarketplaceDetailDialogProps {
    listing: MarketplaceListing | null
    onClose: () => void
    /** Whether this listing is currently in the compare selection. */
    isSelectedForCompare?: boolean
    /** Toggle a listing in/out of the compare selection. */
    onToggleCompare?: (id: string) => void
    /** Number of items currently selected for compare. */
    compareCount?: number
    /** Navigate to a different listing (used by Similar Suppliers). */
    onViewDetail?: (listing: MarketplaceListing) => void
}

function getAIIcon(subcategory: string): React.ComponentType<{ className?: string }> {
    switch (subcategory) {
        case 'Agent': return Bot
        case 'Assistant': return Sparkles
        case 'Analyzer': return BarChart3
        case 'Automation': return Zap
        default: return Bot
    }
}

/** Check whether a listing has any enrichment data worth showing in a Capabilities tab. */
function hasEnrichmentData(listing: MarketplaceListing): boolean {
    return !!(
        (listing.industries && listing.industries.length > 0) ||
        (listing.materials && listing.materials.length > 0) ||
        (listing.key_equipment && listing.key_equipment.length > 0) ||
        (listing.process_capabilities && listing.process_capabilities.length > 0)
    )
}

/** Compact company details section for the modal — shows CH enrichment data */
function CompanyDetailsSection({ attrs }: { attrs: Record<string, unknown> }) {
    const details: { label: string; value: string; icon: React.ReactNode }[] = []

    if (attrs.ch_company_status) {
        details.push({
            label: 'Status',
            value: String(attrs.ch_company_status).replace(/\b\w/g, (c) => c.toUpperCase()),
            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        })
    }
    if (attrs.ch_company_number) {
        details.push({ label: 'CH No.', value: String(attrs.ch_company_number), icon: <Building2 className="w-3.5 h-3.5" /> })
    }
    if (attrs.ch_registered_address && !attrs.location) {
        details.push({ label: 'Address', value: String(attrs.ch_registered_address), icon: <MapPin className="w-3.5 h-3.5" /> })
    }
    if (attrs.ch_incorporation_date) {
        const date = new Date(String(attrs.ch_incorporation_date))
        if (!isNaN(date.getTime())) {
            details.push({
                label: 'Incorporated',
                value: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
                icon: <Calendar className="w-3.5 h-3.5" />,
            })
        }
    }
    if (attrs.ch_company_size) {
        details.push({ label: 'Size', value: String(attrs.ch_company_size), icon: <Users className="w-3.5 h-3.5" /> })
    }
    if (attrs.ch_company_type) {
        details.push({ label: 'Type', value: String(attrs.ch_company_type), icon: <Building2 className="w-3.5 h-3.5" /> })
    }
    if (attrs.website_url) {
        details.push({ label: 'Website', value: String(attrs.website_url), icon: <ExternalLink className="w-3.5 h-3.5" /> })
    }

    if (details.length === 0) return null

    return (
        <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Company Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {details.map((d) => (
                    <div key={d.label} className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground shrink-0">{d.icon}</span>
                        <span className="text-muted-foreground">{d.label}:</span>
                        {d.label === 'Website' ? (
                            <a
                                href={d.value}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-international-orange hover:underline truncate"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {(() => { try { return new URL(d.value).hostname.replace(/^www\./, '') } catch { return d.value } })()}
                            </a>
                        ) : (
                            <span className="font-medium text-foreground truncate">{d.value}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

/** Compact card for a single process capability. */
function ProcessCapabilityCard({ cap }: { cap: ProcessCapability }) {
    return (
        <div className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">{cap.process_name || cap.process_category || 'Process'}</span>
                {cap.confidence != null && cap.confidence >= 0.8 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">High confidence</Badge>
                )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {cap.tolerance_claimed && (
                    <span>Tolerance: <span className="text-foreground font-medium">{cap.tolerance_claimed}</span></span>
                )}
                {cap.batch_size_range && (
                    <span>Batch: <span className="text-foreground font-medium">{cap.batch_size_range}</span></span>
                )}
                {cap.max_part_dimensions && (
                    <span>Max dims: <span className="text-foreground font-medium">{cap.max_part_dimensions}</span></span>
                )}
            </div>
            {cap.materials_worked && cap.materials_worked.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {cap.materials_worked.slice(0, 4).map((mat, i) => (
                        <Badge key={`${mat}-${i}`} variant="secondary" className="text-[10px] font-normal py-0">{mat}</Badge>
                    ))}
                    {cap.materials_worked.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">+{cap.materials_worked.length - 4} more</span>
                    )}
                </div>
            )}
        </div>
    )
}

/** Profile section for People listings — shows experience, availability, education, etc. */
function PeopleProfileSection({ attrs }: { attrs: Record<string, unknown> }) {
    const details: { label: string; value: string; icon: React.ReactNode }[] = []

    if (attrs.availability) {
        details.push({ label: 'Availability', value: String(attrs.availability), icon: <Clock className="w-3.5 h-3.5" /> })
    }
    if (attrs.years_experience) {
        details.push({ label: 'Experience', value: `${attrs.years_experience} years`, icon: <Briefcase className="w-3.5 h-3.5" /> })
    }
    if (attrs.education) {
        details.push({ label: 'Education', value: String(attrs.education), icon: <Award className="w-3.5 h-3.5" /> })
    }
    if (attrs.location) {
        details.push({ label: 'Location', value: String(attrs.location), icon: <MapPin className="w-3.5 h-3.5" /> })
    }
    if (attrs.languages) {
        const langs = Array.isArray(attrs.languages) ? (attrs.languages as string[]).join(', ') : String(attrs.languages)
        details.push({ label: 'Languages', value: langs, icon: <Globe className="w-3.5 h-3.5" /> })
    }
    if (attrs.website_url || attrs.portfolio_url) {
        const url = String(attrs.portfolio_url || attrs.website_url)
        details.push({ label: 'Portfolio', value: url, icon: <ExternalLink className="w-3.5 h-3.5" /> })
    }

    const previousCompanies = safeStringArray(attrs.previous_companies)

    if (details.length === 0 && previousCompanies.length === 0) {
        return (
            <p className="text-sm text-muted-foreground text-center py-6">
                This person hasn&apos;t added profile details yet.
            </p>
        )
    }

    return (
        <div className="space-y-6">
            {details.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Profile Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                        {details.map((d) => (
                            <div key={d.label} className="flex items-center gap-1.5 text-sm">
                                <span className="text-muted-foreground shrink-0">{d.icon}</span>
                                <span className="text-muted-foreground">{d.label}:</span>
                                {d.label === 'Portfolio' ? (
                                    <a
                                        href={d.value}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-international-orange hover:underline truncate"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {(() => { try { return new URL(d.value).hostname.replace(/^www\./, '') } catch { return d.value } })()}
                                    </a>
                                ) : (
                                    <span className="font-medium text-foreground truncate">{d.value}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {previousCompanies.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        Previous Companies
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                        {previousCompanies.map((company) => (
                            <Badge key={company} variant="secondary" className="text-xs">{company}</Badge>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export function MarketplaceDetailDialog({ listing, onClose, isSelectedForCompare, onToggleCompare, compareCount = 0, onViewDetail }: MarketplaceDetailDialogProps) {
    const [isSendingEnquiry, setIsSendingEnquiry] = useState(false)
    const [activeTab, setActiveTab] = useState<DialogTab>('overview')
    const [showAllCapabilities, setShowAllCapabilities] = useState(false)
    const [similarListings, setSimilarListings] = useState<MarketplaceListing[]>([])
    const [isSimilarLoading, setIsSimilarLoading] = useState(false)
    const [endorsementSummary, setEndorsementSummary] = useState<EndorsementSummary | null>(null)
    const [skillEndorsements, setSkillEndorsements] = useState<SkillEndorsement[]>([])
    const [isEndorsementsLoading, setIsEndorsementsLoading] = useState(false)
    const [portfolio, setPortfolio] = useState<{ id: string; title: string; client_name?: string; description?: string; image_urls?: string[] }[]>([])
    const [isPortfolioLoading, setIsPortfolioLoading] = useState(false)

    // Fetch portfolio when dialog opens for People listings
    useEffect(() => {
        if (!listing || listing.category !== 'People') {
            setPortfolio([])
            return
        }
        const providerId = listing.created_by_provider_id
        if (!providerId) return

        let cancelled = false
        setIsPortfolioLoading(true)
        // FLOW: Uses getSimilarListings pattern — fetch via import to avoid client supabase
        import('@/actions/portfolio').then(mod => mod.getProviderPortfolio(providerId)).then(result => {
            if (!cancelled) setPortfolio(result)
        }).catch(() => {
            // Non-critical — portfolio section just won't show
        }).finally(() => {
            if (!cancelled) setIsPortfolioLoading(false)
        })
        return () => { cancelled = true }
    }, [listing?.id, listing?.category, listing?.created_by_provider_id]) // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch endorsements when dialog opens for People listings
    useEffect(() => {
        if (!listing || listing.category !== 'People') {
            setEndorsementSummary(null)
            setSkillEndorsements([])
            return
        }
        const userId = listing.created_by_provider_id
        if (!userId) return

        let cancelled = false
        setIsEndorsementsLoading(true)
        Promise.allSettled([
            getEndorsementSummary(userId),
            getSkillEndorsements(userId),
        ]).then(([summaryResult, skillsResult]) => {
            if (cancelled) return
            if (summaryResult.status === 'fulfilled') setEndorsementSummary(summaryResult.value)
            if (skillsResult.status === 'fulfilled') setSkillEndorsements(skillsResult.value)
        }).catch((err) => {
            console.error('[Endorsements] Unexpected fetch error:', err)
        }).finally(() => {
            if (!cancelled) setIsEndorsementsLoading(false)
        })
        return () => { cancelled = true }
    }, [listing?.id, listing?.category, listing?.created_by_provider_id]) // eslint-disable-line react-hooks/exhaustive-deps -- intentional: only refetch when these specific fields change

    // Fetch similar listings when dialog opens or listing changes
    useEffect(() => {
        if (!listing) {
            setSimilarListings([])
            return
        }
        let cancelled = false
        setIsSimilarLoading(true)
        setSimilarListings([])
        setActiveTab('overview')
        setShowAllCapabilities(false)
        getSimilarListings(listing.id, 4).then((results) => {
            if (!cancelled) {
                setSimilarListings(results)
                setIsSimilarLoading(false)
            }
        }).catch(() => {
            if (!cancelled) setIsSimilarLoading(false)
        })
        return () => { cancelled = true }
    }, [listing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!listing) return null

    const attrs = safeParseAttributes(listing.attributes)
    const isAI = listing.category === 'AI'
    const AIIcon = isAI ? getAIIcon(listing.subcategory) : null
    const initials = getInitials(listing.title)
    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)

    // Extract data
    const price = (attrs.rate || attrs.cost || attrs.price || attrs.day_rate) as string | undefined
    const ratingAvg = attrs.rating_average as number | undefined
    const reviewCount = attrs.total_reviews as number | undefined
    const responseHours = attrs.response_time_hours as number | undefined
    const location = (attrs.location || attrs.ch_registered_address) as string | undefined
    const experience = attrs.experience as string | undefined
    const headline = attrs.headline as string | undefined
    const tags = safeStringArray(attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications)
    const hiredCount = attrs.total_bookings as number | undefined
    const specialties = safeStringArray(attrs.specialties || attrs.capabilities)
    const isPeople = listing.category === 'People'

    const showCapabilitiesTab = hasEnrichmentData(listing)
    const processCapabilities = listing.process_capabilities ?? []
    const visibleCapabilities = showAllCapabilities ? processCapabilities : processCapabilities.slice(0, 6)

    const handleSendEnquiry = async () => {
        // DECISION: attrs.provider_id is the attributes-JSON field; fall back to
        // listing.created_by_provider_id (DB column) which is more reliably populated
        // for People listings pushed from Nightshift or created by users.
        const providerId = (attrs.provider_id as string) || listing.created_by_provider_id
        if (!providerId) {
            toast.error('Unable to contact this provider')
            return
        }
        setIsSendingEnquiry(true)
        try {
            const result = await contactExpert(providerId, listing.id)
            if (result.success) {
                toast.success('Conversation started! Check the Messages sidebar.')
            } else {
                toast.error(result.error || 'Failed to start conversation')
            }
        } catch {
            toast.error('Failed to send enquiry')
        } finally {
            setIsSendingEnquiry(false)
        }
    }

    const tabs: { id: DialogTab; label: string; show: boolean }[] = [
        { id: 'overview', label: 'Overview', show: true },
        { id: 'capabilities', label: 'Capabilities', show: showCapabilitiesTab },
        { id: 'company', label: isPeople ? 'Profile' : 'Company', show: true },
    ]

    return (
        <Dialog open={!!listing} onOpenChange={() => onClose()}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col p-0 gap-0">
                <ScrollArea className="flex-1 max-h-[calc(90vh-120px)]">
                    <div className="p-6 space-y-6">
                        {/* Header */}
                        <DialogHeader className="space-y-4">
                            <div className="flex gap-4">
                                {/* Large avatar */}
                                <div className={cn(
                                    'w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-md',
                                    gradient
                                )}>
                                    {isAI && AIIcon ? (
                                        <AIIcon className="w-8 h-8" />
                                    ) : (
                                        initials
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                'uppercase text-[10px] tracking-wider font-semibold border-0',
                                                getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                            )}
                                        >
                                            {listing.subcategory}
                                        </Badge>
                                        <VerificationBadge tier={listing.verification_tier} showLabel />
                                        {listing.is_demo && (
                                            <Badge variant="secondary" className="gap-1 text-muted-foreground bg-muted border-0 text-xs">
                                                <FlaskConical className="w-3 h-3" aria-hidden="true" />
                                                Sample
                                            </Badge>
                                        )}
                                    </div>
                                    <DialogTitle className="text-xl font-bold tracking-tight">
                                        {listing.title}
                                    </DialogTitle>
                                    {headline && (
                                        <p className="text-sm text-muted-foreground mt-1">{headline}</p>
                                    )}
                                </div>
                                <AskSpecialistButton
                                    specialistId={listing.category === 'People' ? 'hiring-team' : 'vp-supply-chain'}
                                    specialistName={listing.category === 'People' ? 'Harper' : 'Chase'}
                                    variant="icon"
                                    context={{
                                        type: 'general',
                                        title: listing.title,
                                        description: `Marketplace listing: ${listing.title}. Category: ${listing.category}. ${listing.description?.slice(0, 200) ?? ''}`,
                                    }}
                                />
                            </div>
                        </DialogHeader>

                        {/* Key metrics row */}
                        <div className="flex flex-wrap gap-4 py-3 px-4 bg-muted/50 rounded-xl">
                            {ratingAvg && ratingAvg > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" aria-hidden="true" />
                                    <span className="font-semibold text-foreground">{ratingAvg.toFixed(1)}</span>
                                    {reviewCount && (
                                        <span className="text-sm text-muted-foreground">({reviewCount} reviews)</span>
                                    )}
                                </div>
                            )}
                            {hiredCount && hiredCount > 0 && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Users className="w-4 h-4" aria-hidden="true" />
                                    Hired {hiredCount} times
                                </div>
                            )}
                            {responseHours && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Clock className="w-4 h-4" aria-hidden="true" />
                                    Responds in ~{responseHours < 24 ? `${responseHours}h` : `${Math.ceil(responseHours / 24)}d`}
                                </div>
                            )}
                            {location && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <MapPin className="w-4 h-4" aria-hidden="true" />
                                    {location}
                                </div>
                            )}
                            {experience && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Briefcase className="w-4 h-4" aria-hidden="true" />
                                    {experience}
                                </div>
                            )}
                        </div>

                        {/* Tab navigation */}
                        <nav className="flex gap-1 border-b border-border -mx-6 px-6">
                            {tabs.filter(t => t.show).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                                        activeTab === tab.id
                                            ? 'border-international-orange text-foreground'
                                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>

                        {/* ═══ Overview Tab ═══ */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* Description */}
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground mb-2">About</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                        {listing.description}
                                    </p>
                                </div>

                                {/* Skills / Tags */}
                                {tags.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2">
                                            {listing.category === 'People' ? 'Skills & Expertise' :
                                             listing.category === 'AI' ? 'Integrations' :
                                             listing.category === 'Products' ? 'Certifications' : 'Capabilities'}
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {tags.map((tag) => (
                                                <Badge key={tag} variant="secondary" className="text-xs">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Specialties */}
                                {specialties.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2">Specialties</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {specialties.map((spec) => (
                                                <div key={spec} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" aria-hidden="true" />
                                                    {spec}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Endorsements (People only) */}
                                {isPeople && listing.created_by_provider_id && (
                                    <>
                                        <Separator />
                                        {isEndorsementsLoading ? (
                                            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Loading endorsements…
                                            </div>
                                        ) : endorsementSummary ? (
                                            <EndorsementSection
                                                endorsedUserId={listing.created_by_provider_id}
                                                summary={endorsementSummary}
                                                profileSkills={tags}
                                                skillEndorsements={skillEndorsements}
                                            />
                                        ) : (
                                            <p className="text-sm text-muted-foreground text-center py-4">
                                                No endorsements yet. Be the first to endorse this expert.
                                            </p>
                                        )}
                                    </>
                                )}

                                {/* Similar Suppliers */}
                                {(similarListings.length > 0 || isSimilarLoading) && (
                                    <div>
                                        <Separator className="mb-6" />
                                        <h3 className="text-sm font-semibold text-foreground mb-3">Similar Suppliers</h3>
                                        {isSimilarLoading ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {[1, 2, 3, 4].map((i) => (
                                                    <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {similarListings.map((sim) => {
                                                    const simGradient = getAvatarGradient(sim.category as MarketplaceCategory, sim.title)
                                                    const simInitials = getInitials(sim.title)
                                                    const topSignal = sim.certifications?.[0] || sim.industries?.[0] || sim.subcategory
                                                    return (
                                                        <button
                                                            key={sim.id}
                                                            onClick={() => onViewDetail?.(sim)}
                                                            className="flex items-center gap-2.5 p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-left"
                                                        >
                                                            <div className={cn(
                                                                'w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs shrink-0',
                                                                simGradient
                                                            )}>
                                                                {simInitials}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-medium text-foreground truncate">{sim.title}</p>
                                                                <p className="text-xs text-muted-foreground truncate">{topSignal}</p>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Full listing link */}
                                <div className="text-center">
                                    <Button variant="ghost" className="gap-2 text-muted-foreground" asChild>
                                        <Link href={`/marketplace/${listing.id}`}>
                                            View full profile
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* ═══ Capabilities Tab ═══ */}
                        {activeTab === 'capabilities' && showCapabilitiesTab && (
                            <div className="space-y-6">
                                {/* Industries */}
                                {listing.industries && listing.industries.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Factory className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            Industries Served
                                        </h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {listing.industries.map((ind, i) => (
                                                <Badge key={`${ind}-${i}`} variant="secondary" className="text-xs">{ind}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Materials */}
                                {listing.materials && listing.materials.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Wrench className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            Materials
                                        </h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {listing.materials.map((mat, i) => (
                                                <Badge key={`${mat}-${i}`} variant="secondary" className="text-xs">{mat}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Key Equipment */}
                                {listing.key_equipment && listing.key_equipment.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Wrench className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            Key Equipment
                                        </h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {listing.key_equipment.map((eq, i) => (
                                                <Badge key={`${eq}-${i}`} variant="secondary" className="text-xs">{eq}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Process Capabilities */}
                                {processCapabilities.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Activity className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            Process Capabilities
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {visibleCapabilities.map((cap, i) => (
                                                <ProcessCapabilityCard key={i} cap={cap} />
                                            ))}
                                        </div>
                                        {processCapabilities.length > 6 && !showAllCapabilities && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="mt-2 gap-1 text-muted-foreground"
                                                onClick={() => setShowAllCapabilities(true)}
                                            >
                                                Show all {processCapabilities.length} capabilities
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ Company / Profile Tab ═══ */}
                        {activeTab === 'company' && (
                            <div className="space-y-6">
                                {/* People get a profile section; others get company details */}
                                {isPeople ? (
                                    <>
                                        <PeopleProfileSection attrs={attrs} />
                                        {/* Past Projects */}
                                        {isPortfolioLoading ? (
                                            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Loading projects…
                                            </div>
                                        ) : portfolio.length > 0 ? (
                                            <div>
                                                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                                                    <Briefcase className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                    Past Projects
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {portfolio.map(project => (
                                                        <div key={project.id} className="rounded-lg border p-3 space-y-2">
                                                            {project.image_urls?.[0] && (
                                                                <div className="w-full h-24 rounded-md overflow-hidden bg-muted">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={project.image_urls[0]}
                                                                        alt={project.title}
                                                                        loading="lazy"
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}
                                                            <p className="text-sm font-medium text-foreground line-clamp-1">{project.title}</p>
                                                            {project.client_name && (
                                                                <p className="text-xs text-muted-foreground">{project.client_name}</p>
                                                            )}
                                                            {project.description && (
                                                                <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <CompanyDetailsSection attrs={attrs} />
                                )}

                                {/* Financial Health (company metric — hide for People) */}
                                {!isPeople && listing.financial_health && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Activity className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            Financial Health
                                        </h3>
                                        <p className="text-sm text-muted-foreground">{listing.financial_health}</p>
                                    </div>
                                )}

                                {/* Security Clearances (company metric — hide for People) */}
                                {!isPeople && listing.security_clearances && listing.security_clearances.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Shield className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            Security Clearances
                                        </h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {listing.security_clearances.map((sc, i) => (
                                                <Badge key={`${sc}-${i}`} variant="secondary" className="text-xs">{sc}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Certifications (detailed) */}
                                {listing.certifications && listing.certifications.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Award className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            Certifications
                                        </h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {listing.certifications.map((cert, i) => (
                                                <Badge key={`${cert}-${i}`} variant="secondary" className="text-xs gap-1">
                                                    <Award className="w-3 h-3" aria-hidden="true" />
                                                    {cert}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Full listing link */}
                                <div className="text-center">
                                    <Button variant="ghost" className="gap-2 text-muted-foreground" asChild>
                                        <Link href={`/marketplace/${listing.id}`}>
                                            View full profile
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* ═══ Sticky CTA Footer ═══ */}
                <div className="border-t bg-background p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            {price ? (
                                <>
                                    <span className="text-2xl font-bold text-foreground">{/^[£$€]/.test(price) ? price : `£${price}`}</span>
                                    {listing.category === 'People' && (
                                        <span className="text-sm text-muted-foreground ml-1">/ day</span>
                                    )}
                                </>
                            ) : (
                                <span className="text-sm text-muted-foreground">Custom pricing available</span>
                            )}
                        </div>

                        {listing.verification_tier !== 'unverified' && (
                            <div className="flex items-center gap-1.5 text-xs text-status-success">
                                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                                <span className="font-medium">Escrow Protected</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        {/* Compare toggle */}
                        {onToggleCompare && (
                            <Button
                                variant={isSelectedForCompare ? 'default' : 'outline'}
                                size="sm"
                                className={cn(
                                    'gap-2',
                                    isSelectedForCompare
                                        ? 'bg-international-orange hover:bg-international-orange/90 text-white'
                                        : 'border-international-orange/30 text-international-orange hover:bg-international-orange/5'
                                )}
                                onClick={() => {
                                    onToggleCompare(listing.id)
                                    if (isSelectedForCompare) {
                                        toast('Removed from compare')
                                    } else {
                                        toast(`Added to compare (${compareCount + 1} of 4)`)
                                    }
                                }}
                            >
                                <Scale className={cn('w-4 h-4', isSelectedForCompare && 'fill-current')} />
                                {isSelectedForCompare ? 'In Compare' : 'Compare'}
                            </Button>
                        )}

                        <InviteToCompanyButton listing={listing} />

                        {isPeople ? (
                            <>
                                {(attrs.provider_id || listing.created_by_provider_id) && (
                                    <Button
                                        variant="outline"
                                        className="gap-2"
                                        onClick={handleSendEnquiry}
                                        disabled={isSendingEnquiry}
                                    >
                                        {isSendingEnquiry ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <MessageSquare className="w-4 h-4" />
                                        )}
                                        Message
                                    </Button>
                                )}
                                <Button className="flex-1 gap-2" asChild>
                                    <Link href={`/marketplace/${listing.id}/book`}>
                                        <CalendarDays className="w-4 h-4" />
                                        Book Now
                                    </Link>
                                </Button>
                            </>
                        ) : attrs.provider_id ? (
                            <Button
                                className="flex-1 gap-2"
                                onClick={handleSendEnquiry}
                                disabled={isSendingEnquiry}
                            >
                                {isSendingEnquiry ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <MessageSquare className="w-4 h-4" />
                                )}
                                {listing.category === 'Products' ? 'Request Quote' :
                                 listing.category === 'AI' ? 'Get Started' : 'Send Enquiry'}
                            </Button>
                        ) : attrs.contact_email ? (
                            <Button className="flex-1 gap-2" asChild>
                                <a href={`mailto:${attrs.contact_email}?subject=Enquiry about ${listing.title}`}>
                                    <Mail className="w-4 h-4" />
                                    Send Enquiry
                                </a>
                            </Button>
                        ) : attrs.website_url ? (
                            <Button className="flex-1 gap-2" asChild>
                                <a href={String(attrs.website_url)} target="_blank" rel="noopener noreferrer">
                                    <Globe className="w-4 h-4" />
                                    Visit Website
                                </a>
                            </Button>
                        ) : (
                            <Button className="flex-1 gap-2" asChild>
                                <Link href={`/marketplace/${listing.id}`}>
                                    <ExternalLink className="w-4 h-4" />
                                    View Full Profile
                                </Link>
                            </Button>
                        )}

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

                    <p className="text-xs text-center text-muted-foreground">
                        Payments are held in escrow until work is approved. 100% money-back guarantee.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
