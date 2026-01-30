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

    const AITypeIcon = isAI ? getAITypeIcon(listing.subcategory) : null
    const initials = getInitials(listing.title)
    const avatarGradient = getAvatarGradient(listing.category, listing.title)

    // Get the primary metric to show (rate/cost)
    const primaryMetric = attrs.rate || attrs.cost || attrs.price || null

    return (
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

                {/* Key metrics row */}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
                    {attrs.years_experience && (
                        <span className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {attrs.years_experience}y
                        </span>
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
                        variant="default"
                        className="h-8 text-xs shadow-sm"
                        asChild
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

