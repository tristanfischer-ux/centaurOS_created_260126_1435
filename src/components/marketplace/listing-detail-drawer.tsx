'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
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
    Mail,
    Plus,
    Brain,
    Cpu,
    BarChart3,
    CheckCircle2,
    Star,
} from "lucide-react"

interface ListingDetailDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    listing: MarketplaceListing | null
}

const categoryBadgeStyles = {
    'People': 'bg-stone-100 text-stone-700',
    'Products': 'bg-slate-100 text-slate-700',
    'Services': 'bg-blue-50 text-blue-700',
    'AI': 'bg-violet-50 text-violet-700'
}

export function ListingDetailDrawer({ open, onOpenChange, listing }: ListingDetailDrawerProps) {
    if (!listing) return null

    const attrs = listing.attributes || {}
    const category = listing.category

    const handleAddToComparison = () => {
        console.log('Add to comparison:', listing.id, listing.title)
    }

    const handleContact = () => {
        console.log('Contact/Enquire:', listing.id, listing.title)
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] p-0 flex flex-col bg-card">
                <SheetHeader className="p-6 pb-4 border-b border-border space-y-3">
                    {/* Subcategory badge + Verified */}
                    <div className="flex items-center gap-2">
                        <Badge 
                            variant="outline" 
                            className={cn(
                                "uppercase text-[10px] tracking-wider font-semibold border-0",
                                categoryBadgeStyles[category]
                            )}
                        >
                            {listing.subcategory}
                        </Badge>
                        {listing.is_verified && (
                            <div className="flex items-center gap-1 text-emerald-600" title="Verified">
                                <ShieldCheck className="w-4 h-4" />
                                <span className="text-xs font-medium">Verified</span>
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <SheetTitle className="text-xl font-bold tracking-tight">
                        {listing.title}
                    </SheetTitle>

                    {/* Role for People */}
                    {category === 'People' && attrs.role && (
                        <p className="text-sm font-medium text-muted-foreground -mt-1">
                            {attrs.role}
                        </p>
                    )}
                </SheetHeader>

                <ScrollArea className="flex-1 overflow-auto">
                    <div className="p-6 space-y-6">
                        {/* Description Section */}
                        <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                About
                            </h3>
                            <p className="text-sm text-foreground leading-relaxed">
                                {listing.description}
                            </p>
                        </section>

                        {/* Key Metrics Section */}
                        <KeyMetricsSection category={category} attrs={attrs} />

                        {/* Category-specific sections */}
                        {category === 'People' && <PeopleSection attrs={attrs} />}
                        {category === 'AI' && <AISection attrs={attrs} />}
                        {category === 'Products' && <ProductsSection attrs={attrs} />}
                        {category === 'Services' && <ServicesSection attrs={attrs} />}

                        {/* All Attributes Grid */}
                        <AttributesGrid attrs={attrs} category={category} />
                    </div>
                </ScrollArea>

                {/* Footer Actions */}
                <div className="p-4 border-t border-border bg-muted/30 flex gap-3">
                    <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={handleAddToComparison}
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        Add to Comparison
                    </Button>
                    <Button 
                        variant="brand" 
                        className="flex-1"
                        onClick={handleContact}
                    >
                        <Mail className="w-4 h-4 mr-1" />
                        {category === 'People' ? 'Contact' : 'Enquire'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}

// Key Metrics Section - prominent rate/cost display
function KeyMetricsSection({ category, attrs }: { category: string; attrs: Record<string, any> }) {
    const metrics: { label: string; value: any; icon: React.ReactNode }[] = []

    if (category === 'People') {
        if (attrs.rate) metrics.push({ label: 'Rate', value: attrs.rate, icon: <DollarSign className="w-4 h-4" /> })
        if (attrs.years_experience) metrics.push({ label: 'Experience', value: `${attrs.years_experience} years`, icon: <Briefcase className="w-4 h-4" /> })
        if (attrs.projects_completed) metrics.push({ label: 'Projects', value: attrs.projects_completed, icon: <CheckCircle2 className="w-4 h-4" /> })
    } else if (category === 'AI') {
        if (attrs.cost || attrs.pricing) metrics.push({ label: 'Pricing', value: attrs.cost || attrs.pricing, icon: <DollarSign className="w-4 h-4" /> })
        if (attrs.accuracy) metrics.push({ label: 'Accuracy', value: attrs.accuracy, icon: <Target className="w-4 h-4" /> })
        if (attrs.latency) metrics.push({ label: 'Latency', value: attrs.latency, icon: <Zap className="w-4 h-4" /> })
    } else if (category === 'Products') {
        if (attrs.cost || attrs.price) metrics.push({ label: 'Price', value: attrs.cost || attrs.price, icon: <DollarSign className="w-4 h-4" /> })
        if (attrs.lead_time) metrics.push({ label: 'Lead Time', value: attrs.lead_time, icon: <Timer className="w-4 h-4" /> })
        if (attrs.moq) metrics.push({ label: 'MOQ', value: attrs.moq, icon: <Package className="w-4 h-4" /> })
    } else if (category === 'Services') {
        if (attrs.rate || attrs.pricing) metrics.push({ label: 'Rate', value: attrs.rate || attrs.pricing, icon: <DollarSign className="w-4 h-4" /> })
        if (attrs.turnaround) metrics.push({ label: 'Turnaround', value: attrs.turnaround, icon: <Clock className="w-4 h-4" /> })
        if (attrs.capacity) metrics.push({ label: 'Capacity', value: attrs.capacity, icon: <Gauge className="w-4 h-4" /> })
    }

    if (metrics.length === 0) return null

    return (
        <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Key Metrics
            </h3>
            <div className="grid grid-cols-3 gap-3">
                {metrics.map((metric, idx) => (
                    <div 
                        key={idx} 
                        className="bg-muted/50 p-3 text-center border border-border"
                    >
                        <div className="flex justify-center text-muted-foreground mb-1">
                            {metric.icon}
                        </div>
                        <p className="text-sm font-bold text-foreground">{metric.value}</p>
                        <p className="text-xs text-muted-foreground">{metric.label}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}

// People-specific section
function PeopleSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <section className="space-y-4">
            {/* Education */}
            {attrs.education && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <GraduationCap className="w-4 h-4" />
                        Education
                    </h4>
                    <p className="text-sm text-foreground">{attrs.education}</p>
                </div>
            )}

            {/* Previous Companies */}
            {attrs.previous_companies && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4" />
                        Previous Experience
                    </h4>
                    {Array.isArray(attrs.previous_companies) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.previous_companies.map((company: string, i: number) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                                    {company}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-foreground">{attrs.previous_companies}</p>
                    )}
                </div>
            )}

            {/* Skills/Expertise */}
            {(attrs.skills || attrs.expertise) && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Star className="w-4 h-4" />
                        Skills & Expertise
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {(attrs.skills || attrs.expertise || []).map((skill: string, i: number) => (
                            <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-700">
                                {skill}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </section>
    )
}

// AI-specific section
function AISection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <section className="space-y-4">
            {/* Integrations */}
            {attrs.integrations && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Layers className="w-4 h-4" />
                        Integrations
                    </h4>
                    {Array.isArray(attrs.integrations) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.integrations.map((integration: string, i: number) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700">
                                    {integration}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-foreground">{attrs.integrations}</p>
                    )}
                </div>
            )}

            {/* Use Cases */}
            {attrs.use_cases && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4" />
                        Use Cases
                    </h4>
                    {Array.isArray(attrs.use_cases) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.use_cases.map((useCase: string, i: number) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700">
                                    {useCase}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-foreground">{attrs.use_cases}</p>
                    )}
                </div>
            )}

            {/* Model Info */}
            {(attrs.model || attrs.provider) && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Cpu className="w-4 h-4" />
                        Model Details
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {attrs.model && (
                            <div className="bg-muted/50 p-2 border border-border">
                                <span className="text-muted-foreground text-xs">Model</span>
                                <p className="font-medium">{attrs.model}</p>
                            </div>
                        )}
                        {attrs.provider && (
                            <div className="bg-muted/50 p-2 border border-border">
                                <span className="text-muted-foreground text-xs">Provider</span>
                                <p className="font-medium">{attrs.provider}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Performance metrics */}
            {(attrs.accuracy || attrs.latency || attrs.throughput) && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <BarChart3 className="w-4 h-4" />
                        Performance
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        {attrs.accuracy && (
                            <div className="bg-emerald-50 p-2 text-center border border-emerald-100">
                                <p className="font-bold text-emerald-700">{attrs.accuracy}</p>
                                <span className="text-muted-foreground text-xs">Accuracy</span>
                            </div>
                        )}
                        {attrs.latency && (
                            <div className="bg-blue-50 p-2 text-center border border-blue-100">
                                <p className="font-bold text-blue-700">{attrs.latency}</p>
                                <span className="text-muted-foreground text-xs">Latency</span>
                            </div>
                        )}
                        {attrs.throughput && (
                            <div className="bg-purple-50 p-2 text-center border border-purple-100">
                                <p className="font-bold text-purple-700">{attrs.throughput}</p>
                                <span className="text-muted-foreground text-xs">Throughput</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    )
}

// Products-specific section
function ProductsSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <section className="space-y-4">
            {/* Certifications */}
            {attrs.certifications && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Award className="w-4 h-4" />
                        Certifications
                    </h4>
                    {Array.isArray(attrs.certifications) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.certifications.map((cert: string, i: number) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                                    {cert}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-foreground">{attrs.certifications}</p>
                    )}
                </div>
            )}

            {/* Capabilities */}
            {attrs.capabilities && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Wrench className="w-4 h-4" />
                        Capabilities
                    </h4>
                    {Array.isArray(attrs.capabilities) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.capabilities.map((cap: string, i: number) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                                    {cap}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-foreground">{attrs.capabilities}</p>
                    )}
                </div>
            )}

            {/* Location & Lead Time */}
            <div className="grid grid-cols-2 gap-3">
                {attrs.location && (
                    <div className="bg-muted/50 p-3 border border-border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <MapPin className="w-4 h-4" />
                            <span className="text-xs">Location</span>
                        </div>
                        <p className="text-sm font-medium">{attrs.location}</p>
                    </div>
                )}
                {attrs.lead_time && (
                    <div className="bg-muted/50 p-3 border border-border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Timer className="w-4 h-4" />
                            <span className="text-xs">Lead Time</span>
                        </div>
                        <p className="text-sm font-medium">{attrs.lead_time}</p>
                    </div>
                )}
            </div>
        </section>
    )
}

// Services-specific section
function ServicesSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <section className="space-y-4">
            {/* Specialty */}
            {attrs.specialty && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4" />
                        Specialty
                    </h4>
                    {Array.isArray(attrs.specialty) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.specialty.map((spec: string, i: number) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                                    {spec}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-foreground">{attrs.specialty}</p>
                    )}
                </div>
            )}

            {/* Focus Areas */}
            {attrs.focus_areas && (
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4" />
                        Focus Areas
                    </h4>
                    {Array.isArray(attrs.focus_areas) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.focus_areas.map((area: string, i: number) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                                    {area}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-foreground">{attrs.focus_areas}</p>
                    )}
                </div>
            )}

            {/* Service details */}
            <div className="grid grid-cols-2 gap-3">
                {attrs.location && (
                    <div className="bg-muted/50 p-3 border border-border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <MapPin className="w-4 h-4" />
                            <span className="text-xs">Location</span>
                        </div>
                        <p className="text-sm font-medium">{attrs.location}</p>
                    </div>
                )}
                {attrs.availability && (
                    <div className="bg-muted/50 p-3 border border-border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Clock className="w-4 h-4" />
                            <span className="text-xs">Availability</span>
                        </div>
                        <p className="text-sm font-medium">{attrs.availability}</p>
                    </div>
                )}
            </div>
        </section>
    )
}

// Attributes Grid - renders all remaining attributes
function AttributesGrid({ attrs, category }: { attrs: Record<string, any>; category: string }) {
    // Keys already shown in category-specific sections
    const shownKeys = new Set([
        'role', 'rate', 'pricing', 'cost', 'price',
        'years_experience', 'projects_completed', 'education',
        'previous_companies', 'skills', 'expertise',
        'integrations', 'use_cases', 'model', 'provider',
        'accuracy', 'latency', 'throughput',
        'certifications', 'capabilities', 'lead_time', 'moq',
        'specialty', 'focus_areas', 'turnaround', 'capacity',
        'location', 'availability'
    ])

    const remainingAttrs = Object.entries(attrs).filter(([key]) => !shownKeys.has(key))

    if (remainingAttrs.length === 0) return null

    return (
        <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Additional Details
            </h3>
            <div className="space-y-3">
                {remainingAttrs.map(([key, value]) => (
                    <AttributeRow key={key} label={key} value={value} />
                ))}
            </div>
        </section>
    )
}

function AttributeRow({ label, value }: { label: string; value: any }) {
    const formattedLabel = label.replace(/_/g, ' ')

    // Get appropriate icon based on key
    const getIcon = () => {
        const key = label.toLowerCase()
        if (key.includes('location') || key.includes('region')) return <MapPin className="w-4 h-4" />
        if (key.includes('time') || key.includes('duration') || key.includes('hours')) return <Clock className="w-4 h-4" />
        if (key.includes('experience') || key.includes('work')) return <Briefcase className="w-4 h-4" />
        if (key.includes('education') || key.includes('degree')) return <GraduationCap className="w-4 h-4" />
        if (key.includes('company') || key.includes('organization')) return <Building2 className="w-4 h-4" />
        if (key.includes('cost') || key.includes('price') || key.includes('rate')) return <DollarSign className="w-4 h-4" />
        if (key.includes('cert')) return <Award className="w-4 h-4" />
        return null
    }

    if (value === undefined || value === null) return null

    // Render arrays as tag pills
    if (Array.isArray(value)) {
        return (
            <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1.5">
                    {getIcon()}
                    <span className="capitalize">{formattedLabel}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {value.map((item, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {String(item)}
                        </span>
                    ))}
                </div>
            </div>
        )
    }

    // Render booleans
    if (typeof value === 'boolean') {
        return (
            <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {getIcon()}
                    <span className="capitalize">{formattedLabel}</span>
                </div>
                <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    value ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                )}>
                    {value ? 'Yes' : 'No'}
                </span>
            </div>
        )
    }

    // Render objects
    if (typeof value === 'object') {
        return (
            <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1.5">
                    {getIcon()}
                    <span className="capitalize">{formattedLabel}</span>
                </div>
                <div className="bg-muted/50 p-2 text-xs text-muted-foreground font-mono border border-border">
                    {JSON.stringify(value, null, 2)}
                </div>
            </div>
        )
    }

    // Render strings/numbers
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {getIcon()}
                <span className="capitalize">{formattedLabel}</span>
            </div>
            <span className="text-sm font-medium text-foreground">
                {String(value)}
            </span>
        </div>
    )
}
