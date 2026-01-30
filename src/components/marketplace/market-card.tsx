'use client'

import { memo, useState } from "react"
import { MarketplaceListing } from "@/actions/marketplace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { 
    ShieldCheck, MapPin, Clock, Briefcase,
    Bot, Sparkles, BarChart3, Zap, Shield, Cpu,
    GitCompareArrows, Mail, Eye
} from "lucide-react"
import Link from "next/link"

interface MarketCardProps {
    listing: MarketplaceListing
    isSelected: boolean
    onToggleSelect: (id: string) => void
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

// Generate initials from title
function getInitials(title: string): string {
    const words = title.trim().split(/\s+/)
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase()
    }
    return (words[0][0] + words[1][0]).toUpperCase()
}

// Get gradient colors based on category
function getAvatarGradient(category: string, title: string): string {
    // Use title to generate consistent but varied gradients within category
    const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const variant = hash % 3
    
    switch (category) {
        case 'People':
            return variant === 0 
                ? 'from-stone-400 to-stone-600' 
                : variant === 1 
                ? 'from-amber-400 to-amber-600'
                : 'from-orange-400 to-orange-600'
        case 'Products':
            return variant === 0 
                ? 'from-slate-400 to-slate-600' 
                : variant === 1 
                ? 'from-zinc-400 to-zinc-600'
                : 'from-gray-400 to-gray-600'
        case 'Services':
            return variant === 0 
                ? 'from-blue-400 to-blue-600' 
                : variant === 1 
                ? 'from-sky-400 to-sky-600'
                : 'from-cyan-400 to-cyan-600'
        case 'AI':
            return variant === 0 
                ? 'from-violet-400 to-violet-600' 
                : variant === 1 
                ? 'from-purple-400 to-purple-600'
                : 'from-indigo-400 to-indigo-600'
        default:
            return 'from-gray-400 to-gray-600'
    }
}

export const MarketCard = memo(function MarketCard({ 
    listing, 
    isSelected, 
    onToggleSelect,
}: MarketCardProps) {
    const [isHovered, setIsHovered] = useState(false)

    const categoryBadgeStyles: Record<string, string> = {
        'People': 'bg-stone-100 text-stone-700',
        'Products': 'bg-muted text-foreground',
        'Services': 'bg-blue-50 text-blue-700',
        'AI': 'bg-violet-50 text-violet-700'
    }

    const attrs = listing.attributes || {}
    const isPerson = listing.category === 'People'
    const isAI = listing.category === 'AI'
    const isProduct = listing.category === 'Products'
    const isManufacturer = isProduct && listing.subcategory === 'Manufacturer'
    const isMachineCapacity = isProduct && listing.subcategory === 'Machine Capacity'

    const AITypeIcon = isAI ? getAITypeIcon(listing.subcategory) : null
    const initials = getInitials(listing.title)
    const avatarGradient = getAvatarGradient(listing.category, listing.title)

    // Get the primary metric to show (rate/cost)
    const primaryMetric = attrs.rate || attrs.cost || attrs.price || null

    return (
<<<<<<< HEAD
        <Card 
            className={cn(
                "group relative flex flex-col border-slate-200 hover:border-orange-300 hover:shadow-md transition-all duration-200 overflow-hidden bg-white",
                isSelected && "ring-2 ring-orange-500 border-orange-500"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Compare button - appears on hover in top right */}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onToggleSelect(listing.id)
                }}
                className={cn(
                    "absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                    isSelected 
                        ? "bg-orange-500 text-white shadow-md" 
                        : isHovered 
                            ? "bg-white/90 text-slate-600 shadow-md border border-slate-200 opacity-100"
                            : "opacity-0"
                )}
                title={isSelected ? "Remove from comparison" : "Add to comparison"}
            >
                <GitCompareArrows className="w-4 h-4" />
            </button>

            <CardContent className="p-4 flex flex-col flex-1">
                {/* Avatar + Header Row */}
                <div className="flex gap-3 mb-3">
                    {/* Initials Avatar */}
                    <div className={cn(
                        "w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-sm",
                        avatarGradient
                    )}>
                        {isAI && AITypeIcon ? (
                            <AITypeIcon className="w-6 h-6" />
                        ) : (
                            initials
=======
        <Card className={cn(
            "group relative flex flex-col border hover:border-orange-200 hover:shadow-sm transition-all duration-200 overflow-hidden bg-white",
            isSelected && "ring-2 ring-orange-500 border-orange-500",
            isExpanded && "shadow-md border-orange-200"
        )}>
            <CardContent className="p-4 relative z-10">
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                        {isAI && AITypeIcon && (
                            <AITypeIcon className="w-4 h-4 text-violet-600" />
>>>>>>> feat/design-consistency
                        )}
                    </div>

                    {/* Title + Badge + Verified */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0", categoryBadgeStyles[listing.category])}>
                                {listing.subcategory}
                            </Badge>
                            {listing.is_verified && (
                                <div title="Verified" className="shrink-0">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                </div>
                            )}
                        </div>
                        <h3 className="text-base font-bold tracking-tight text-foreground truncate">
                            {listing.title}
                        </h3>
                    </div>
                </div>

                {/* Role/Function subtitle */}
                {isPerson && attrs.role && (
                    <p className="text-sm font-medium text-muted-foreground mb-2 truncate">{attrs.role}</p>
                )}
                {isAI && attrs.function && (
                    <p className="text-sm font-medium text-violet-700 mb-2 line-clamp-2">{attrs.function}</p>
                )}

                {/* Description - 2 lines */}
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2 flex-1">
                    {listing.description}
                </p>

<<<<<<< HEAD
                {/* Key metrics row */}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
                    {attrs.years_experience && (
                        <span className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {attrs.years_experience}y
                        </span>
=======
                {/* Summary metrics - always visible */}
                <SummaryMetrics listing={listing} attrs={attrs} />
            </CardContent>

            {/* Expanded Content - Details only - NO flex-grow, only shows when expanded */}
            {isExpanded && (
                <div className="border-t border bg-muted p-4">
                    <ExpandedDetails listing={listing} attrs={attrs} />
                </div>
            )}

            {/* Action buttons - shown when expanded */}
            {isExpanded && (
                <div className="flex gap-2 px-4 pb-3 pt-2 border-t border bg-white">
                    <Button 
                        variant="secondary" 
                        size="sm"
                        className="flex-1 text-xs border hover:border-orange-500/50 hover:bg-orange-50/50 hover:text-orange-700"
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleSelect(listing.id)
                        }}
                    >
                        <Plus className="w-3 h-3 mr-1" />
                        {isSelected ? 'Remove' : 'Compare'}
                    </Button>
                    <Button 
                        size="sm"
                        variant="default"
                        className="flex-1 text-xs shadow-md"
                        onClick={(e) => {
                            e.stopPropagation()
                            console.log('Contact:', listing.id)
                        }}
                    >
                        <Mail className="w-3 h-3 mr-1" />
                        {isPerson ? 'Contact' : 'Enquire'}
                    </Button>
                </div>
            )}

            <CardFooter className="relative z-10 flex items-center justify-between pt-3 pb-3 px-4 bg-muted border-t border">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`compare-${listing.id}`}
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(listing.id)}
                        className="h-4 w-4 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                        aria-label={`Select ${listing.title} for comparison`}
                    />
                    <label
                        htmlFor={`compare-${listing.id}`}
                        className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground"
                    >
                        Compare
                    </label>
                </div>

                <div className="flex items-center gap-2">
                    {isExpanded && (
                        <Button 
                            size="sm" 
                            variant="secondary"
                            className="text-xs gap-1 border hover:border-orange-500/50 hover:bg-orange-50/50 hover:text-orange-700"
                            asChild
                        >
                            <Link href="/rfq/create">
                                <FileText className="w-3 h-3" />
                                Request Quote
                            </Link>
                        </Button>
>>>>>>> feat/design-consistency
                    )}
                    {attrs.location && (
                        <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {attrs.location}
                        </span>
                    )}
                    {attrs.lead_time && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {attrs.lead_time}
                        </span>
                    )}
                    {isAI && attrs.latency && (
                        <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {attrs.latency}
                        </span>
                    )}
                </div>

                {/* Skills/Tags - 3 max */}
                {(attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications) && (
                    <div className="flex flex-wrap gap-1 mb-3">
                        {(attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications || []).slice(0, 3).map((item: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                {item}
                            </span>
                        ))}
                        {(attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications || []).length > 3 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                +{(attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications).length - 3}
                            </span>
                        )}
                    </div>
                )}

                {/* Price + CTA Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
                    {primaryMetric ? (
                        <span className="text-sm font-bold text-foreground">{primaryMetric}</span>
                    ) : (
                        <span className="text-xs text-muted-foreground">Contact for pricing</span>
                    )}
                    
                    <Button 
                        size="sm" 
<<<<<<< HEAD
                        variant="default"
                        className="h-8 text-xs shadow-sm"
                        asChild
=======
                        variant="ghost" 
                        className="text-xs gap-1 hover:bg-muted"
                        onClick={handleToggleExpand}
>>>>>>> feat/design-consistency
                    >
                        <Link href={`/marketplace/${listing.id}`}>
                            <Eye className="w-3 h-3 mr-1" />
                            View
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
})

<<<<<<< HEAD
=======
// Summary metrics shown on collapsed card
function SummaryMetrics({ listing, attrs }: { listing: MarketplaceListing; attrs: Record<string, any> }) {
    const isPerson = listing.category === 'People'
    const isAI = listing.category === 'AI'
    const isProduct = listing.category === 'Products'
    const isManufacturer = isProduct && listing.subcategory === 'Manufacturer'
    const isMachineCapacity = isProduct && listing.subcategory === 'Machine Capacity'

    if (isAI) {
        return (
            <div className="space-y-3">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {attrs.autonomy_level && (
                        <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            <span>{attrs.autonomy_level}</span>
                        </div>
                    )}
                    {attrs.accuracy && (
                        <div className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            <span>{attrs.accuracy}</span>
                        </div>
                    )}
                    {attrs.latency && (
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{attrs.latency}</span>
                        </div>
                    )}
                </div>
                {attrs.integrations && Array.isArray(attrs.integrations) && (
                    <div className="flex flex-wrap gap-1">
                        {attrs.integrations.slice(0, 3).map((integration: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                                {integration}
                            </span>
                        ))}
                        {attrs.integrations.length > 3 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-500">
                                +{attrs.integrations.length - 3}
                            </span>
                        )}
                    </div>
                )}
                {attrs.cost && (
                    <div className="flex items-center justify-between pt-2 border-t border-violet-100">
                        <div>
                            <span className="text-xs text-muted-foreground">Cost</span>
                            <p className="text-sm font-bold text-foreground">{attrs.cost}</p>
                        </div>
                        {attrs.setup_time && (
                            <div className="text-right">
                                <span className="text-xs text-muted-foreground">Setup</span>
                                <p className="text-sm font-medium text-muted-foreground">{attrs.setup_time}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    if (isManufacturer) {
        return (
            <div className="space-y-3">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {attrs.location && (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{attrs.location}</span>
                        </div>
                    )}
                    {attrs.lead_time && (
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{attrs.lead_time}</span>
                        </div>
                    )}
                </div>
                {attrs.capacity_available && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Capacity</span>
                            <span className="font-medium text-foreground">{attrs.capacity_available}</span>
                        </div>
                        <Progress value={parseInt(String(attrs.capacity_available).replace('%', '')) || 0} className="h-1.5" />
                    </div>
                )}
                {attrs.certifications && Array.isArray(attrs.certifications) && (
                    <div className="flex flex-wrap gap-1">
                        {attrs.certifications.slice(0, 3).map((cert: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                                {cert}
                            </span>
                        ))}
                        {attrs.certifications.length > 3 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-500">
                                +{attrs.certifications.length - 3}
                            </span>
                        )}
                    </div>
                )}
            </div>
        )
    }

    if (isMachineCapacity) {
        return (
            <div className="space-y-3">
                {attrs.machine_type && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Cpu className="w-3 h-3" />
                        <span className="font-medium text-foreground">{attrs.machine_type}</span>
                    </div>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {attrs.location && (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{attrs.location}</span>
                        </div>
                    )}
                    {attrs.availability && (
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{attrs.availability}</span>
                        </div>
                    )}
                </div>
                {attrs.rate && (
                    <div className="pt-2 border-t border-slate-100">
                        <span className="text-xs text-muted-foreground">Rate</span>
                        <p className="text-sm font-bold text-foreground">{attrs.rate}</p>
                    </div>
                )}
            </div>
        )
    }

    if (isPerson) {
        return (
            <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {attrs.years_experience && (
                        <div className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            <span>{attrs.years_experience} years</span>
                        </div>
                    )}
                    {attrs.location && (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{attrs.location}</span>
                        </div>
                    )}
                </div>
                {(attrs.skills || attrs.expertise) && (
                    <div className="flex flex-wrap gap-1">
                        {(attrs.skills || attrs.expertise || []).slice(0, 3).map((skill: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {skill}
                            </span>
                        ))}
                        {(attrs.skills || attrs.expertise || []).length > 3 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                +{(attrs.skills || attrs.expertise).length - 3}
                            </span>
                        )}
                    </div>
                )}
                {attrs.rate && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div>
                            <span className="text-xs text-muted-foreground">Rate</span>
                            <p className="text-sm font-bold text-foreground">{attrs.rate}</p>
                        </div>
                        {attrs.projects_completed && (
                            <div className="text-right">
                                <span className="text-xs text-muted-foreground">Projects</span>
                                <p className="text-sm font-bold text-foreground">{attrs.projects_completed}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    // Generic products/services
    return (
        <div className="flex flex-wrap gap-2">
            {Object.entries(attrs).slice(0, 3).map(([key, value]) => {
                if (Array.isArray(value)) return null
                if (key.includes('value')) return null
                return (
                    <div key={key} className="text-xs px-2 py-1 rounded-md bg-muted font-medium truncate max-w-[140px]">
                        <span className="opacity-60 capitalize mr-1">{key.replace(/_/g, ' ')}:</span>
                        <span className="text-foreground">{String(value)}</span>
                    </div>
                )
            })}
        </div>
    )
}

// Expanded details section
function ExpandedDetails({ listing, attrs }: { listing: MarketplaceListing; attrs: Record<string, any> }) {
    const category = listing.category

    return (
        <div className="space-y-4">
            {/* Category-specific expanded content */}
            {category === 'People' && <PeopleExpanded attrs={attrs} />}
            {category === 'AI' && <AIExpanded attrs={attrs} />}
            {category === 'Products' && <ProductsExpanded attrs={attrs} />}
            {category === 'Services' && <ServicesExpanded attrs={attrs} />}

            {/* Additional attributes */}
            <AdditionalAttributes attrs={attrs} category={category} />
        </div>
    )
}

function PeopleExpanded({ attrs }: { attrs: Record<string, any> }) {
    return (
        <>
            {attrs.education && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                        <GraduationCap className="w-3 h-3" /> Education
                    </h4>
                    <p className="text-sm text-foreground">{attrs.education}</p>
                </div>
            )}
            {attrs.previous_companies && Array.isArray(attrs.previous_companies) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                        <Building2 className="w-3 h-3" /> Previous Experience
                    </h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.previous_companies.map((company: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground">
                                {company}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {(attrs.skills || attrs.expertise) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                        <Star className="w-3 h-3" /> All Skills
                    </h4>
                    <div className="flex flex-wrap gap-1">
                        {(attrs.skills || attrs.expertise || []).map((skill: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                                {skill}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

function AIExpanded({ attrs }: { attrs: Record<string, any> }) {
    return (
        <>
            {attrs.integrations && Array.isArray(attrs.integrations) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                        <Layers className="w-3 h-3" /> All Integrations
                    </h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.integrations.map((integration: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                                {integration}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {attrs.use_cases && Array.isArray(attrs.use_cases) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                        <Target className="w-3 h-3" /> Use Cases
                    </h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.use_cases.map((useCase: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                                {useCase}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {attrs.data_inputs && Array.isArray(attrs.data_inputs) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Data Inputs</h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.data_inputs.map((input: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {input}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {attrs.outputs && Array.isArray(attrs.outputs) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Outputs</h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.outputs.map((output: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {output}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

function ProductsExpanded({ attrs }: { attrs: Record<string, any> }) {
    return (
        <>
            {attrs.certifications && Array.isArray(attrs.certifications) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                        <Award className="w-3 h-3" /> All Certifications
                    </h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.certifications.map((cert: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                {cert}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {attrs.capabilities && Array.isArray(attrs.capabilities) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Capabilities</h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.capabilities.map((cap: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground">
                                {cap}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {attrs.industries && Array.isArray(attrs.industries) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Industries Served</h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.industries.map((ind: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                {ind}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {attrs.materials && Array.isArray(attrs.materials) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Materials</h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.materials.map((mat: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {mat}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

function ServicesExpanded({ attrs }: { attrs: Record<string, any> }) {
    return (
        <>
            {attrs.focus && Array.isArray(attrs.focus) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Focus Areas</h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.focus.map((area: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                {area}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {attrs.jurisdictions && Array.isArray(attrs.jurisdictions) && (
                <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Jurisdictions</h4>
                    <div className="flex flex-wrap gap-1">
                        {attrs.jurisdictions.map((j: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {j}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

function AdditionalAttributes({ attrs, category }: { attrs: Record<string, any>; category: string }) {
    const shownKeys = new Set([
        'role', 'rate', 'cost', 'price', 'function',
        'years_experience', 'projects_completed', 'education', 'availability',
        'previous_companies', 'skills', 'expertise', 'location',
        'integrations', 'use_cases', 'data_inputs', 'outputs', 'autonomy_level', 'accuracy', 'latency', 'setup_time',
        'certifications', 'capabilities', 'industries', 'materials', 'lead_time', 'capacity_available',
        'machine_type', 'build_volume', 'technology',
        'focus', 'jurisdictions', 'specialty'
    ])

    const remaining = Object.entries(attrs).filter(([key, value]) => 
        !shownKeys.has(key) && 
        !key.includes('_value') && 
        value !== null && 
        value !== undefined
    )

    if (remaining.length === 0) return null

    return (
        <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Additional Info</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
                {remaining.map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-foreground">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
>>>>>>> feat/design-consistency
