'use client'

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
import { cn } from '@/lib/utils'
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
} from 'lucide-react'
import Link from 'next/link'
import type { MarketplaceListing } from '@/actions/marketplace'

interface MarketplaceDetailDialogProps {
    listing: MarketplaceListing | null
    onClose: () => void
}

function getAIIcon(subcategory: string): React.ElementType {
    switch (subcategory) {
        case 'Agent': return Bot
        case 'Assistant': return Sparkles
        case 'Analyzer': return BarChart3
        case 'Automation': return Zap
        default: return Bot
    }
}

function getInitials(title: string): string {
    const words = title.trim().split(/\s+/)
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}

export function MarketplaceDetailDialog({ listing, onClose }: MarketplaceDetailDialogProps) {
    if (!listing) return null

    const attrs = listing.attributes || {}
    const isAI = listing.category === 'AI'
    const AIIcon = isAI ? getAIIcon(listing.subcategory) : null
    const initials = getInitials(listing.title)
    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)

    // Extract data
    const price = (attrs.rate || attrs.cost || attrs.price || attrs.day_rate) as string | undefined
    const ratingAvg = attrs.rating_average as number | undefined
    const reviewCount = attrs.total_reviews as number | undefined
    const responseHours = attrs.response_time_hours as number | undefined
    const location = attrs.location as string | undefined
    const experience = attrs.experience as string | undefined
    const headline = attrs.headline as string | undefined
    const tags: string[] = attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications || []
    const hiredCount = attrs.total_bookings as number | undefined
    const specialties: string[] = attrs.specialties || attrs.capabilities || []

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
                                        {listing.is_verified && (
                                            <Badge variant="secondary" className="gap-1 text-status-success bg-status-success-light border-0 text-xs">
                                                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                                                Verified
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
                                            <span className="text-2xl font-bold text-foreground">{price}</span>
                                            {listing.category === 'People' && (
                                                <span className="text-sm text-muted-foreground ml-1">/ day</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">Custom pricing available</span>
                                    )}
                                </div>

                                {listing.is_verified && (
                                    <div className="flex items-center gap-1.5 text-xs text-status-success">
                                        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                                        <span className="font-medium">Escrow Protected</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <Button className="flex-1 gap-2 h-12" asChild>
                                    <Link href={`/marketplace/${listing.id}/book`}>
                                        <CalendarDays className="w-4 h-4" />
                                        {listing.category === 'People' ? 'Book Now' :
                                         listing.category === 'Products' ? 'Request Quote' :
                                         listing.category === 'AI' ? 'Get Started' : 'Hire Now'}
                                    </Link>
                                </Button>
                                <Button variant="secondary" className="flex-1 gap-2 h-12">
                                    <MessageSquare className="w-4 h-4" />
                                    Send Message
                                </Button>
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
