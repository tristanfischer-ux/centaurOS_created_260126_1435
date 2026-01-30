'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
    ArrowLeft,
    Brain,
    Cpu,
    BarChart3,
    CheckCircle2,
    Star,
    Calendar,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { typography } from "@/lib/design-system"

interface MarketplaceListingDetailProps {
    listing: MarketplaceListing
}

const categoryBadgeStyles = {
    'People': 'bg-stone-100 text-stone-700',
    'Products': 'bg-muted text-foreground',
    'Services': 'bg-blue-50 text-blue-700',
    'AI': 'bg-violet-50 text-violet-700'
}

export function MarketplaceListingDetail({ listing }: MarketplaceListingDetailProps) {
    const router = useRouter()
    const attrs = listing.attributes || {}
    const category = listing.category

    return (
        <div className="max-w-5xl mx-auto">
            {/* Back button */}
            <div className="mb-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.back()}
                    className="gap-2"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Marketplace
                </Button>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-slate-100 mb-8">
                <div className="min-w-0 flex-1">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <div className="flex items-center gap-3 mb-2">
                            <Badge 
                                variant="secondary" 
                                className={cn(
                                    "uppercase text-[10px] tracking-wider font-semibold",
                                    categoryBadgeStyles[category]
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
                        <h1 className={typography.h1}>
                            {listing.title}
                        </h1>
                        {category === 'People' && attrs.role && (
                            <p className="text-lg text-muted-foreground mt-1">
                                {attrs.role}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="secondary" asChild>
                        <Link href={`/marketplace/${listing.id}/book`}>
                            <Calendar className="h-4 w-4 mr-2" />
                            Book Consultation
                        </Link>
                    </Button>
                    <Button variant="default">
                        Contact
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main content */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Description */}
                    <section>
                        <h2 className="text-lg font-semibold text-foreground mb-4">About</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {listing.description}
                        </p>
                    </section>

                    {/* Category-specific sections */}
                    {category === 'People' && <PeopleSection attrs={attrs} />}
                    {category === 'AI' && <AISection attrs={attrs} />}
                    {category === 'Products' && <ProductsSection attrs={attrs} />}
                    {category === 'Services' && <ServicesSection attrs={attrs} />}

                    {/* All Attributes */}
                    <AttributesSection attrs={attrs} category={category} />
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Key Metrics */}
                    <KeyMetricsCard category={category} attrs={attrs} />
                </div>
            </div>
        </div>
    )
}

// Key Metrics Card
function KeyMetricsCard({ category, attrs }: { category: string; attrs: Record<string, any> }) {
    const metrics: { label: string; value: any; icon: React.ReactNode }[] = []

    if (category === 'People') {
        if (attrs.rate) metrics.push({ label: 'Rate', value: attrs.rate, icon: <DollarSign className="h-4 w-4" /> })
        if (attrs.years_experience) metrics.push({ label: 'Experience', value: `${attrs.years_experience} years`, icon: <Briefcase className="h-4 w-4" /> })
        if (attrs.projects_completed) metrics.push({ label: 'Projects', value: attrs.projects_completed, icon: <CheckCircle2 className="h-4 w-4" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4" /> })
    } else if (category === 'AI') {
        if (attrs.cost || attrs.pricing) metrics.push({ label: 'Pricing', value: attrs.cost || attrs.pricing, icon: <DollarSign className="h-4 w-4" /> })
        if (attrs.accuracy) metrics.push({ label: 'Accuracy', value: attrs.accuracy, icon: <Target className="h-4 w-4" /> })
        if (attrs.latency) metrics.push({ label: 'Latency', value: attrs.latency, icon: <Zap className="h-4 w-4" /> })
    } else if (category === 'Products') {
        if (attrs.cost || attrs.price) metrics.push({ label: 'Price', value: attrs.cost || attrs.price, icon: <DollarSign className="h-4 w-4" /> })
        if (attrs.lead_time) metrics.push({ label: 'Lead Time', value: attrs.lead_time, icon: <Timer className="h-4 w-4" /> })
        if (attrs.moq) metrics.push({ label: 'MOQ', value: attrs.moq, icon: <Package className="h-4 w-4" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4" /> })
    } else if (category === 'Services') {
        if (attrs.rate || attrs.pricing) metrics.push({ label: 'Rate', value: attrs.rate || attrs.pricing, icon: <DollarSign className="h-4 w-4" /> })
        if (attrs.turnaround) metrics.push({ label: 'Turnaround', value: attrs.turnaround, icon: <Clock className="h-4 w-4" /> })
        if (attrs.capacity) metrics.push({ label: 'Capacity', value: attrs.capacity, icon: <Gauge className="h-4 w-4" /> })
        if (attrs.location) metrics.push({ label: 'Location', value: attrs.location, icon: <MapPin className="h-4 w-4" /> })
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
                        <span className="text-sm font-semibold text-foreground text-right">
                            {metric.value}
                        </span>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

// People-specific section
function PeopleSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <div className="space-y-8">
            {/* Education */}
            {attrs.education && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <GraduationCap className="h-5 w-5" />
                        Education
                    </h2>
                    <p className="text-muted-foreground">{attrs.education}</p>
                </section>
            )}

            {/* Previous Companies */}
            {attrs.previous_companies && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Building2 className="h-5 w-5" />
                        Previous Experience
                    </h2>
                    {Array.isArray(attrs.previous_companies) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.previous_companies.map((company: string, i: number) => (
                                <Badge key={i} variant="secondary">
                                    {company}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{attrs.previous_companies}</p>
                    )}
                </section>
            )}

            {/* Skills/Expertise */}
            {(attrs.skills || attrs.expertise) && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Star className="h-5 w-5" />
                        Skills & Expertise
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {(attrs.skills || attrs.expertise || []).map((skill: string, i: number) => (
                            <Badge key={i} variant="secondary" className="bg-stone-100 text-stone-700">
                                {skill}
                            </Badge>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

// AI-specific section
function AISection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <div className="space-y-8">
            {/* Integrations */}
            {attrs.integrations && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Layers className="h-5 w-5" />
                        Integrations
                    </h2>
                    {Array.isArray(attrs.integrations) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.integrations.map((integration: string, i: number) => (
                                <Badge key={i} variant="secondary" className="bg-violet-50 text-violet-700">
                                    {integration}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{attrs.integrations}</p>
                    )}
                </section>
            )}

            {/* Use Cases */}
            {attrs.use_cases && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Brain className="h-5 w-5" />
                        Use Cases
                    </h2>
                    {Array.isArray(attrs.use_cases) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.use_cases.map((useCase: string, i: number) => (
                                <Badge key={i} variant="secondary" className="bg-violet-50 text-violet-700">
                                    {useCase}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{attrs.use_cases}</p>
                    )}
                </section>
            )}

            {/* Model Info */}
            {(attrs.model || attrs.provider) && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Cpu className="h-5 w-5" />
                        Model Details
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        {attrs.model && (
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-xs text-muted-foreground mb-1">Model</p>
                                    <p className="font-medium text-foreground">{attrs.model}</p>
                                </CardContent>
                            </Card>
                        )}
                        {attrs.provider && (
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-xs text-muted-foreground mb-1">Provider</p>
                                    <p className="font-medium text-foreground">{attrs.provider}</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </section>
            )}

            {/* Performance metrics */}
            {(attrs.accuracy || attrs.latency || attrs.throughput) && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <BarChart3 className="h-5 w-5" />
                        Performance
                    </h2>
                    <div className="grid grid-cols-3 gap-4">
                        {attrs.accuracy && (
                            <Card className="bg-status-success-light border-status-success">
                                <CardContent className="pt-6 text-center">
                                    <p className="text-xl font-bold text-status-success-dark">{attrs.accuracy}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Accuracy</p>
                                </CardContent>
                            </Card>
                        )}
                        {attrs.latency && (
                            <Card className="bg-status-info-light border-status-info">
                                <CardContent className="pt-6 text-center">
                                    <p className="text-xl font-bold text-status-info-dark">{attrs.latency}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Latency</p>
                                </CardContent>
                            </Card>
                        )}
                        {attrs.throughput && (
                            <Card className="bg-violet-50 border-violet-200">
                                <CardContent className="pt-6 text-center">
                                    <p className="text-xl font-bold text-violet-700">{attrs.throughput}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Throughput</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </section>
            )}
        </div>
    )
}

// Products-specific section
function ProductsSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <div className="space-y-8">
            {/* Certifications */}
            {attrs.certifications && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Award className="h-5 w-5" />
                        Certifications
                    </h2>
                    {Array.isArray(attrs.certifications) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.certifications.map((cert: string, i: number) => (
                                <Badge key={i} variant="secondary" className="bg-status-success-light text-status-success-dark">
                                    {cert}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{attrs.certifications}</p>
                    )}
                </section>
            )}

            {/* Capabilities */}
            {attrs.capabilities && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Wrench className="h-5 w-5" />
                        Capabilities
                    </h2>
                    {Array.isArray(attrs.capabilities) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.capabilities.map((cap: string, i: number) => (
                                <Badge key={i} variant="secondary">
                                    {cap}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{attrs.capabilities}</p>
                    )}
                </section>
            )}
        </div>
    )
}

// Services-specific section
function ServicesSection({ attrs }: { attrs: Record<string, any> }) {
    return (
        <div className="space-y-8">
            {/* Specialty */}
            {attrs.specialty && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Target className="h-5 w-5" />
                        Specialty
                    </h2>
                    {Array.isArray(attrs.specialty) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.specialty.map((spec: string, i: number) => (
                                <Badge key={i} variant="secondary" className="bg-blue-50 text-blue-700">
                                    {spec}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{attrs.specialty}</p>
                    )}
                </section>
            )}

            {/* Focus Areas */}
            {attrs.focus_areas && (
                <section>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                        <Users className="h-5 w-5" />
                        Focus Areas
                    </h2>
                    {Array.isArray(attrs.focus_areas) ? (
                        <div className="flex flex-wrap gap-2">
                            {attrs.focus_areas.map((area: string, i: number) => (
                                <Badge key={i} variant="secondary" className="bg-blue-50 text-blue-700">
                                    {area}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{attrs.focus_areas}</p>
                    )}
                </section>
            )}
        </div>
    )
}

// Attributes Section - renders all remaining attributes
function AttributesSection({ attrs, category }: { attrs: Record<string, any>; category: string }) {
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
            <h2 className="text-lg font-semibold text-foreground mb-4">
                Additional Details
            </h2>
            <Card>
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        {remainingAttrs.map(([key, value]) => (
                            <AttributeRow key={key} label={key} value={value} />
                        ))}
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}

function AttributeRow({ label, value }: { label: string; value: any }) {
    const formattedLabel = label.replace(/_/g, ' ')

    if (value === undefined || value === null) return null

    // Render arrays as tag pills
    if (Array.isArray(value)) {
        return (
            <div>
                <p className="text-sm text-muted-foreground mb-2 capitalize">{formattedLabel}</p>
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
                <span className="text-sm text-muted-foreground capitalize">{formattedLabel}</span>
                <Badge variant={value ? "success" : "secondary"} className="text-xs">
                    {value ? 'Yes' : 'No'}
                </Badge>
            </div>
        )
    }

    // Render objects
    if (typeof value === 'object') {
        return (
            <div>
                <p className="text-sm text-muted-foreground mb-2 capitalize">{formattedLabel}</p>
                <pre className="bg-muted p-3 rounded text-xs text-muted-foreground overflow-x-auto">
                    {JSON.stringify(value, null, 2)}
                </pre>
            </div>
        )
    }

    // Render strings/numbers
    return (
        <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-sm text-muted-foreground capitalize">{formattedLabel}</span>
            <span className="text-sm font-medium text-foreground">
                {String(value)}
            </span>
        </div>
    )
}
