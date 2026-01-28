'use client'

import { memo } from "react"
import { MarketplaceListing } from "@/actions/marketplace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { 
    ArrowRight, ShieldCheck, MapPin, GraduationCap, Clock, Briefcase,
    Bot, Sparkles, BarChart3, Zap, Shield, Factory, Cpu
} from "lucide-react"

interface MarketCardProps {
    listing: MarketplaceListing
    isSelected: boolean
    onToggleSelect: (id: string) => void
    onViewDetails?: (listing: MarketplaceListing) => void
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

export const MarketCard = memo(function MarketCard({ listing, isSelected, onToggleSelect, onViewDetails }: MarketCardProps) {
    const categoryBadgeStyles: Record<string, string> = {
        'People': 'bg-stone-100 text-stone-700',
        'Products': 'bg-slate-100 text-slate-700',
        'Services': 'bg-blue-50 text-blue-700',
        'AI': 'bg-violet-50 text-violet-700'
    }

    const attrs = listing.attributes || {}
    const isPerson = listing.category === 'People'
    const isAI = listing.category === 'AI'
    const isProduct = listing.category === 'Products'
    const isManufacturer = isProduct && listing.subcategory === 'Manufacturer'
    const isMachineCapacity = isProduct && listing.subcategory === 'Machine Capacity'
    const isGenericProduct = isProduct && !isManufacturer && !isMachineCapacity

    const AITypeIcon = isAI ? getAITypeIcon(listing.subcategory) : null

    return (
        <Card className={cn(
            "group relative flex flex-col justify-between rounded-lg shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200 overflow-hidden",
            isSelected && "ring-2 ring-ring"
        )}>
            <CardContent className="p-4 relative z-10">
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                        {isAI && AITypeIcon && (
                            <AITypeIcon className="w-4 h-4 text-violet-600" />
                        )}
                        <Badge variant="outline" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0", categoryBadgeStyles[listing.category])}>
                            {listing.subcategory}
                        </Badge>
                    </div>
                    {listing.is_verified && (
                        <div title="Verified" role="img" aria-label="Verified listing">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        </div>
                    )}
                </div>

                {/* Name/Title */}
                <h3 className="text-lg font-bold tracking-tight mb-1 text-foreground group-hover:text-primary transition-colors">
                    {listing.title}
                </h3>

                {/* Role for People */}
                {isPerson && attrs.role && (
                    <p className="text-sm font-medium text-muted-foreground mb-2">{attrs.role}</p>
                )}

                {/* Function description for AI - prominent */}
                {isAI && attrs.function && (
                    <p className="text-sm font-medium text-violet-700 mb-2 line-clamp-2">{attrs.function}</p>
                )}

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                    {listing.description}
                </p>

                {/* AI-specific details */}
                {isAI && (
                    <div className="space-y-3 mb-4">
                        {/* Key metrics row */}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {attrs.autonomy_level && (
                                <div className="flex items-center gap-1">
                                    <Shield className="w-3 h-3" />
                                    <span>{attrs.autonomy_level} autonomy</span>
                                </div>
                            )}
                            {attrs.accuracy && (
                                <div className="flex items-center gap-1">
                                    <BarChart3 className="w-3 h-3" />
                                    <span>{attrs.accuracy} accuracy</span>
                                </div>
                            )}
                            {attrs.latency && (
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{attrs.latency}</span>
                                </div>
                            )}
                        </div>

                        {/* Integrations Tags */}
                        {attrs.integrations && Array.isArray(attrs.integrations) && (
                            <div className="flex flex-wrap gap-1">
                                {attrs.integrations.slice(0, 4).map((integration: string, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                                        {integration}
                                    </span>
                                ))}
                                {attrs.integrations.length > 4 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-500">
                                        +{attrs.integrations.length - 4}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* AI Cost and Setup */}
                {isAI && attrs.cost && (
                    <div className="flex items-center justify-between pt-3 mt-auto border-t border-violet-100">
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

                {/* Manufacturer-specific details */}
                {isManufacturer && (
                    <div className="space-y-3 mb-4">
                        {/* Location and Lead Time */}
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

                        {/* Capacity Available as percentage bar */}
                        {attrs.capacity_available && (
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Capacity Available</span>
                                    <span className="font-medium text-foreground">{attrs.capacity_available}</span>
                                </div>
                                <Progress 
                                    value={parseInt(String(attrs.capacity_available).replace('%', '')) || 0} 
                                    className="h-1.5"
                                />
                            </div>
                        )}

                        {/* Certifications Tags */}
                        {attrs.certifications && Array.isArray(attrs.certifications) && (
                            <div className="flex flex-wrap gap-1">
                                {attrs.certifications.slice(0, 4).map((cert: string, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                                        {cert}
                                    </span>
                                ))}
                                {attrs.certifications.length > 4 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-500">
                                        +{attrs.certifications.length - 4}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Machine Capacity-specific details */}
                {isMachineCapacity && (
                    <div className="space-y-3 mb-4">
                        {/* Machine Type */}
                        {attrs.machine_type && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Cpu className="w-3 h-3" />
                                <span className="font-medium text-foreground">{attrs.machine_type}</span>
                            </div>
                        )}

                        {/* Key metrics row */}
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

                        {/* Build Volume */}
                        {attrs.build_volume && (
                            <div className="text-xs">
                                <span className="text-muted-foreground">Build Volume: </span>
                                <span className="font-medium text-foreground">{attrs.build_volume}</span>
                            </div>
                        )}

                        {/* Rate */}
                        {attrs.rate && (
                            <div className="pt-2 border-t border-slate-100">
                                <span className="text-xs text-muted-foreground">Rate</span>
                                <p className="text-sm font-bold text-foreground">{attrs.rate}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Generic Product (Material, Post-Processing, Quality) */}
                {isGenericProduct && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {Object.entries(attrs).slice(0, 4).map(([key, value]) => {
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
                )}

                {/* People-specific details */}
                {isPerson && (
                    <div className="space-y-2 mb-4">
                        {/* Key metrics row */}
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
                            {attrs.availability && (
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{attrs.availability}</span>
                                </div>
                            )}
                        </div>

                        {/* Education */}
                        {attrs.education && (
                            <div className="flex items-start gap-1 text-xs text-muted-foreground">
                                <GraduationCap className="w-3 h-3 mt-0.5 shrink-0" />
                                <span className="line-clamp-1">{attrs.education}</span>
                            </div>
                        )}

                        {/* Skills/Expertise Tags */}
                        {(attrs.skills || attrs.expertise) && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {(attrs.skills || attrs.expertise || []).slice(0, 4).map((skill: string, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                        {skill}
                                    </span>
                                ))}
                                {(attrs.skills || attrs.expertise || []).length > 4 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                        +{(attrs.skills || attrs.expertise).length - 4}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Rate - prominent for People */}
                {isPerson && attrs.rate && (
                    <div className="flex items-center justify-between pt-3 mt-auto border-t border-slate-100">
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
            </CardContent>

            <CardFooter className="relative z-10 flex items-center justify-between pt-3 pb-3 px-4 mt-auto bg-slate-50">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`compare-${listing.id}`}
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(listing.id)}
                        className="h-4 w-4 rounded bg-slate-200 data-[state=checked]:bg-foreground text-foreground focus:ring-ring"
                        aria-label={`Select ${listing.title} for comparison`}
                    />
                    <label
                        htmlFor={`compare-${listing.id}`}
                        className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground"
                    >
                        Compare
                    </label>
                </div>

                <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-xs group/btn"
                    onClick={() => onViewDetails?.(listing)}
                >
                    View
                    <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </Button>
            </CardFooter>
        </Card>
    )
})
