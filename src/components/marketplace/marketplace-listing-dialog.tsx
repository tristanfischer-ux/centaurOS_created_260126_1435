'use client'

import { useState } from 'react'
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
    DollarSign,
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
import { getCategoryBadgeClasses, type MarketplaceCategory } from '@/lib/marketplace-colors'
import Link from 'next/link'

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
        case 'AI': return Bot
        default: return Store
    }
}

// Get icon for AI subcategory
function getAITypeIcon(subcategory: string) {
    switch (subcategory) {
        case 'Agent': return Bot
        case 'Assistant': return Sparkles
        case 'Analyzer': return BarChart3
        case 'Automation': return Zap
        default: return Bot
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
    const [activeTab, setActiveTab] = useState<'overview' | 'details'>('overview')

    // Support both controlled and uncontrolled modes
    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen

    const attrs = listing.attributes || {}
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
            <DialogContent size="lg" className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'details')} className="mt-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="overview" className="gap-2">
                            <Info className="h-4 w-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="details" className="gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Details
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
                        {category === 'AI' && <AIDetails attrs={attrs} />}
                        {category === 'Products' && <ProductsDetails attrs={attrs} />}
                        {category === 'Services' && <ServicesDetails attrs={attrs} />}

                        {/* Additional attributes */}
                        <AdditionalAttributes attrs={attrs} category={category} />
                    </TabsContent>
                </Tabs>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Close
                    </Button>
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
        if (attrs.rate) metrics.push({ label: 'Rate', value: attrs.rate, icon: <DollarSign className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.years_experience) metrics.push({ label: 'Experience', value: `${attrs.years_experience} years`, icon: <Briefcase className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.availability) metrics.push({ label: 'Availability', value: attrs.availability, icon: <Calendar className="h-4 w-4 text-muted-foreground" /> })
    } else if (category === 'AI') {
        if (attrs.cost || attrs.pricing) metrics.push({ label: 'Pricing', value: attrs.cost || attrs.pricing, icon: <DollarSign className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.accuracy) metrics.push({ label: 'Accuracy', value: attrs.accuracy, icon: <Target className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.latency) metrics.push({ label: 'Latency', value: attrs.latency, icon: <Zap className="h-4 w-4 text-muted-foreground" /> })
    } else if (category === 'Products') {
        if (attrs.cost || attrs.price) metrics.push({ label: 'Price', value: attrs.cost || attrs.price, icon: <DollarSign className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.lead_time) metrics.push({ label: 'Lead Time', value: attrs.lead_time, icon: <Timer className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.moq) metrics.push({ label: 'MOQ', value: attrs.moq, icon: <Package className="h-4 w-4 text-muted-foreground" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4 text-muted-foreground" /> })
    } else if (category === 'Services') {
        if (attrs.rate || attrs.pricing) metrics.push({ label: 'Rate', value: attrs.rate || attrs.pricing, icon: <DollarSign className="h-4 w-4 text-muted-foreground" /> })
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
    const rawSkills = attrs.skills || attrs.expertise || attrs.integrations || attrs.capabilities || []
    const skills = Array.isArray(rawSkills) ? rawSkills as string[] : []

    if (skills.length === 0) return null

    const label = category === 'People' ? 'Skills & Expertise' :
                  category === 'AI' ? 'Integrations' :
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
            {attrs.education && (
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
            {attrs.previous_companies && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-electric-blue" />
                            Previous Experience
                        </h3>
                        {Array.isArray(attrs.previous_companies) ? (
                            <div className="flex flex-wrap gap-2">
                                {(attrs.previous_companies as string[]).map((company: string, i: number) => (
                                    <Badge key={i} variant="secondary">
                                        {company}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">{String(attrs.previous_companies)}</p>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Full Skills/Expertise */}
            {(attrs.skills || attrs.expertise) && Array.isArray(attrs.skills || attrs.expertise) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Star className="h-4 w-4 text-electric-blue" />
                            Skills & Expertise
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {((attrs.skills || attrs.expertise) as string[]).map((skill: string, i: number) => (
                                <Badge key={i} variant="secondary">
                                    {skill}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Certifications */}
            {attrs.certifications && Array.isArray(attrs.certifications) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-electric-blue" />
                            Certifications
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {(attrs.certifications as string[]).map((cert: string, i: number) => (
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

// AI-specific details
function AIDetails({ attrs }: { attrs: Record<string, unknown> }) {
    return (
        <div className="space-y-4">
            {/* Integrations */}
            {attrs.integrations && Array.isArray(attrs.integrations) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Layers className="h-4 w-4 text-electric-blue" />
                            Integrations
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {(attrs.integrations as string[]).map((integration: string, i: number) => (
                                <Badge key={i} variant="secondary">
                                    {integration}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Use Cases */}
            {attrs.use_cases && Array.isArray(attrs.use_cases) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Brain className="h-4 w-4 text-electric-blue" />
                            Use Cases
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {(attrs.use_cases as string[]).map((useCase: string, i: number) => (
                                <Badge key={i} variant="secondary">
                                    {useCase}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Model Info */}
            {(attrs.model || attrs.provider) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                            <Cpu className="h-4 w-4 text-electric-blue" />
                            Model Details
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            {attrs.model && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Model</p>
                                    <p className="font-medium text-foreground">{String(attrs.model)}</p>
                                </div>
                            )}
                            {attrs.provider && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Provider</p>
                                    <p className="font-medium text-foreground">{String(attrs.provider)}</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Performance metrics */}
            {(attrs.accuracy || attrs.latency || attrs.throughput) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                            <BarChart3 className="h-4 w-4 text-electric-blue" />
                            Performance
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                            {attrs.accuracy && (
                                <div className="text-center p-3 rounded-lg bg-status-success-light">
                                    <p className="text-lg font-bold text-status-success-dark">{String(attrs.accuracy)}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Accuracy</p>
                                </div>
                            )}
                            {attrs.latency && (
                                <div className="text-center p-3 rounded-lg bg-status-info-light">
                                    <p className="text-lg font-bold text-status-info-dark">{String(attrs.latency)}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Latency</p>
                                </div>
                            )}
                            {attrs.throughput && (
                                <div className="text-center p-3 rounded-lg bg-muted">
                                    <p className="text-lg font-bold text-foreground">{String(attrs.throughput)}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Throughput</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// Products-specific details
function ProductsDetails({ attrs }: { attrs: Record<string, unknown> }) {
    return (
        <div className="space-y-4">
            {/* Certifications */}
            {attrs.certifications && Array.isArray(attrs.certifications) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-electric-blue" />
                            Certifications
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {(attrs.certifications as string[]).map((cert: string, i: number) => (
                                <Badge key={i} variant="secondary" className="bg-status-success-light text-status-success-dark">
                                    {cert}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Capabilities */}
            {attrs.capabilities && Array.isArray(attrs.capabilities) && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Wrench className="h-4 w-4 text-electric-blue" />
                            Capabilities
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {(attrs.capabilities as string[]).map((cap: string, i: number) => (
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
    return (
        <div className="space-y-4">
            {/* Specialty */}
            {attrs.specialty && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-electric-blue" />
                            Specialty
                        </h3>
                        {Array.isArray(attrs.specialty) ? (
                            <div className="flex flex-wrap gap-2">
                                {(attrs.specialty as string[]).map((spec: string, i: number) => (
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
            {attrs.focus_areas && (
                <Card>
                    <CardContent className="pt-6">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-electric-blue" />
                            Focus Areas
                        </h3>
                        {Array.isArray(attrs.focus_areas) ? (
                            <div className="flex flex-wrap gap-2">
                                {(attrs.focus_areas as string[]).map((area: string, i: number) => (
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