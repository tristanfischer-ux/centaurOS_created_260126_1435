'use client'

import { useState } from 'react'
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
    ArrowRight,
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
} from 'lucide-react'
import Link from 'next/link'
import { ActOnThisButton } from '@/components/smart/act-on-this-button'
import { InviteToCompanyButton } from '@/components/marketplace/invite-to-company-button'
import { contactExpert } from '@/actions/messaging'
import { toast } from 'sonner'
import { VerificationBadge } from '@/components/marketplace/VerificationBadge'
import type { MarketplaceListing } from '@/actions/marketplace'

interface MarketplaceDetailDialogProps {
    listing: MarketplaceListing | null
    onClose: () => void
    /** Whether this listing is currently in the compare selection. */
    isSelectedForCompare?: boolean
    /** Toggle a listing in/out of the compare selection. */
    onToggleCompare?: (id: string) => void
    /** Number of items currently selected for compare. */
    compareCount?: number
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
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

export function MarketplaceDetailDialog({ listing, onClose, isSelectedForCompare, onToggleCompare, compareCount = 0 }: MarketplaceDetailDialogProps) {
    const [isSendingEnquiry, setIsSendingEnquiry] = useState(false)

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

    const handleSendEnquiry = async () => {
        const providerId = attrs.provider_id as string
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

    return (
        <Dialog open={!!listing} onOpenChange={() => onClose()}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col p-0 gap-0">
                <ScrollArea className="max-h-[85vh]">
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

                        {/* Description */}
                        <div>
                            <h3 className="text-sm font-semibold text-foreground mb-2">About</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                {listing.description}
                            </p>
                        </div>

                        {/* Company Details (CH data) — only for non-People listings */}
                        {!isPeople && <CompanyDetailsSection attrs={attrs} />}

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

                        <Separator />

                        {/* Booking / Action section */}
                        <div className="bg-muted/30 rounded-xl p-5 border space-y-4">
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

                            <div className="flex flex-col sm:flex-row gap-3">
                                {/* Compare toggle */}
                                {onToggleCompare && (
                                    <Button
                                        variant={isSelectedForCompare ? 'default' : 'outline'}
                                        className={cn(
                                            'gap-2 h-12',
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
                                        {isSelectedForCompare ? (
                                            <>
                                                In Compare List
                                                <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0 text-[10px] px-1.5 py-0">
                                                    {compareCount}
                                                </Badge>
                                            </>
                                        ) : (
                                            'Add to Compare'
                                        )}
                                    </Button>
                                )}

                                {/* Invite to Company — shown to Founders for real People listings */}
                                <InviteToCompanyButton listing={listing} />

                                {isPeople ? (
                                    <Button className="flex-1 gap-2 h-12" asChild>
                                        <Link href={`/marketplace/${listing.id}/book`}>
                                            <CalendarDays className="w-4 h-4" />
                                            Book Now
                                        </Link>
                                    </Button>
                                ) : attrs.provider_id ? (
                                    <Button
                                        className="flex-1 gap-2 h-12"
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
                                    <Button className="flex-1 gap-2 h-12" asChild>
                                        <a href={`mailto:${attrs.contact_email}?subject=Enquiry about ${listing.title}`}>
                                            <Mail className="w-4 h-4" />
                                            Send Enquiry
                                        </a>
                                    </Button>
                                ) : attrs.website_url ? (
                                    <Button className="flex-1 gap-2 h-12" asChild>
                                        <a href={String(attrs.website_url)} target="_blank" rel="noopener noreferrer">
                                            <Globe className="w-4 h-4" />
                                            Visit Website
                                        </a>
                                    </Button>
                                ) : (
                                    <Button className="flex-1 gap-2 h-12" asChild>
                                        <Link href={`/marketplace/${listing.id}`}>
                                            <ExternalLink className="w-4 h-4" />
                                            View Full Profile
                                        </Link>
                                    </Button>
                                )}
                            </div>

                            {/* Act on this - turn into objective/task */}
                            <div className="flex justify-center">
                                <ActOnThisButton
                                    context={{
                                        source: 'marketplace',
                                        entityTitle: listing.title,
                                        entityDescription: listing.description || undefined,
                                    }}
                                    variant="subtle"
                                    label="Turn into objective or task"
                                />
                            </div>

                            <p className="text-xs text-center text-muted-foreground">
                                Payments are held in escrow until work is approved. 100% money-back guarantee.
                            </p>
                        </div>

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
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
