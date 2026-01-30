'use client'

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { 
    ShieldCheck, MapPin, Briefcase, Star, Bot, Sparkles, 
    BarChart3, Zap, Clock, Cpu
} from "lucide-react"
import Image from "next/image"

export interface PreviewListing {
    id: string
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string
    title: string
    description: string
    attributes: Record<string, any>
    image_url: string | null
    is_verified: boolean
    rating?: number
}

interface MarketplacePreviewCardProps {
    listing: PreviewListing
    onJoinClick: () => void
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

export function MarketplacePreviewCard({ listing, onJoinClick }: MarketplacePreviewCardProps) {
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
    const isMachineCapacity = isProduct && listing.subcategory === 'Machine Capacity'

    const AITypeIcon = isAI ? getAITypeIcon(listing.subcategory) : null
    const ctaText = isPerson ? 'Join to Connect' : 'Join to Book'

    // Calculate rating display
    const rating = listing.rating || (attrs.rating ? parseFloat(attrs.rating) : 4.8)

    return (
        <Card className="group relative flex flex-col shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border-slate-200">
            {/* Image */}
            {listing.image_url && (
                <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
                    <Image 
                        src={listing.image_url} 
                        alt={listing.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {listing.is_verified && (
                        <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-full p-1.5 shadow-sm">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        </div>
                    )}
                </div>
            )}

            <CardContent className="p-4 flex-1">
                {/* Header with category and AI icon */}
                <div className="flex items-center gap-2 mb-2">
                    {isAI && AITypeIcon && (
                        <AITypeIcon className="w-4 h-4 text-violet-600" />
                    )}
                    <Badge 
                        variant="secondary" 
                        className={cn(
                            "uppercase text-[10px] tracking-wider font-semibold border-0",
                            categoryBadgeStyles[listing.category]
                        )}
                    >
                        {listing.subcategory}
                    </Badge>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold tracking-tight mb-1 text-foreground line-clamp-1">
                    {listing.title}
                </h3>

                {/* Role for People */}
                {isPerson && attrs.role && (
                    <p className="text-sm font-medium text-muted-foreground mb-2 line-clamp-1">
                        {attrs.role}
                    </p>
                )}

                {/* Function description for AI */}
                {isAI && attrs.function && (
                    <p className="text-sm font-medium text-violet-700 mb-2 line-clamp-1">
                        {attrs.function}
                    </p>
                )}

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {listing.description}
                </p>

                {/* Key Metrics */}
                <div className="space-y-2">
                    {/* Rating & Trust Signals */}
                    <div className="flex items-center gap-3 text-xs">
                        {/* Star Rating */}
                        <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
                            <span className="text-muted-foreground">
                                ({attrs.reviews_count || Math.floor(Math.random() * 50) + 10})
                            </span>
                        </div>

                        {/* Location for People/Products */}
                        {(isPerson || isProduct) && attrs.location && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate max-w-[100px]">{attrs.location}</span>
                            </div>
                        )}

                        {/* Experience for People */}
                        {isPerson && attrs.years_experience && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Briefcase className="w-3 h-3" />
                                <span>{attrs.years_experience}y</span>
                            </div>
                        )}
                    </div>

                    {/* Skills/Tags - show 2-3 max */}
                    {(attrs.skills || attrs.expertise || attrs.integrations) && (
                        <div className="flex flex-wrap gap-1">
                            {(attrs.skills || attrs.expertise || attrs.integrations || [])
                                .slice(0, 3)
                                .map((item: string, i: number) => (
                                    <span 
                                        key={i} 
                                        className={cn(
                                            "text-[10px] px-2 py-0.5 rounded-full",
                                            isAI ? "bg-violet-50 text-violet-600" : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {item}
                                    </span>
                                ))}
                        </div>
                    )}

                    {/* AI Specific: Autonomy/Accuracy */}
                    {isAI && (
                        <div className="flex gap-3 text-xs text-muted-foreground">
                            {attrs.autonomy_level && (
                                <div className="flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    <span>{attrs.autonomy_level}</span>
                                </div>
                            )}
                            {attrs.accuracy && (
                                <div className="flex items-center gap-1">
                                    <BarChart3 className="w-3 h-3" />
                                    <span>{attrs.accuracy}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Machine Capacity Specific */}
                    {isMachineCapacity && attrs.machine_type && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Cpu className="w-3 h-3" />
                            <span className="font-medium text-foreground">{attrs.machine_type}</span>
                        </div>
                    )}
                </div>
            </CardContent>

            <CardFooter className="p-4 pt-0 border-t border-slate-100 mt-auto">
                <div className="flex items-center justify-between w-full">
                    {/* Price/Rate */}
                    <div>
                        <span className="text-xs text-muted-foreground block">
                            {isPerson ? 'Rate' : isAI ? 'Cost' : 'From'}
                        </span>
                        <p className="text-lg font-bold text-foreground">
                            {attrs.rate || attrs.cost || attrs.price || '$$$'}
                        </p>
                    </div>

                    {/* CTA Button */}
                    <Button 
                        onClick={onJoinClick}
                        size="sm"
                        className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-sm"
                    >
                        {ctaText}
                    </Button>
                </div>
            </CardFooter>
        </Card>
    )
}
