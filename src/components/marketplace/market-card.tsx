'use client'

import { memo, useState, useCallback } from "react"
import { MarketplaceListing, saveMarketplaceListing, unsaveMarketplaceListing } from "@/actions/marketplace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { 
    ShieldCheck, MapPin, Clock, Briefcase,
    Bot, Sparkles, BarChart3, Zap, Shield, Cpu,
    GitCompareArrows, Mail, Eye, ChevronDown, ChevronUp,
    Star, Calendar, Award, Globe, Wrench, Heart
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export type CardSize = 'small' | 'medium' | 'full'

interface MarketCardProps {
    listing: MarketplaceListing
    isSelected: boolean
    onToggleSelect: (id: string) => void
    size?: CardSize
    onSizeChange?: (id: string, size: CardSize) => void
    isSaved?: boolean
    onSaveToggle?: (id: string, isSaved: boolean) => void
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
// Color scheme rationale:
// - People: Orange (International Orange - primary brand, warm, human)
// - Products: Slate (industrial, manufacturing, physical)
// - Services: Blue (Electric Blue - secondary brand, tech, digital)
// - AI: Violet (AI distinction within Services)
function getAvatarGradient(category: string, title: string): string {
    // Use title to generate consistent but varied gradients within category
    const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const variant = hash % 3
    
    switch (category) {
        case 'People':
            // Orange tones - warm, human, primary brand
            return variant === 0 
                ? 'from-orange-400 to-orange-600' 
                : variant === 1 
                ? 'from-amber-400 to-orange-500'
                : 'from-orange-500 to-amber-600'
        case 'Products':
            // Slate tones - industrial, manufacturing
            return variant === 0 
                ? 'from-slate-400 to-slate-600' 
                : variant === 1 
                ? 'from-slate-500 to-slate-700'
                : 'from-zinc-400 to-slate-600'
        case 'Services':
            // Blue tones - tech, digital, secondary brand
            return variant === 0 
                ? 'from-blue-400 to-blue-600' 
                : variant === 1 
                ? 'from-sky-400 to-blue-500'
                : 'from-blue-500 to-sky-600'
        case 'AI':
            // Violet tones - AI distinction
            return variant === 0 
                ? 'from-violet-400 to-violet-600' 
                : variant === 1 
                ? 'from-purple-400 to-violet-500'
                : 'from-indigo-400 to-violet-600'
        default:
            return 'from-gray-400 to-gray-600'
    }
}

export const MarketCard = memo(function MarketCard({ 
    listing, 
    isSelected, 
    onToggleSelect,
    size = 'medium',
    onSizeChange,
    isSaved = false,
    onSaveToggle,
}: MarketCardProps) {
    const [isHovered, setIsHovered] = useState(false)
    const [internalSize, setInternalSize] = useState<CardSize>(size)
    const [isSaving, setIsSaving] = useState(false)
    const [localSavedState, setLocalSavedState] = useState(isSaved)
    
    // Use controlled or uncontrolled size
    const currentSize = onSizeChange ? size : internalSize
    const setSize = useCallback((newSize: CardSize) => {
        if (onSizeChange) {
            onSizeChange(listing.id, newSize)
        } else {
            setInternalSize(newSize)
        }
    }, [listing.id, onSizeChange])

    // Handle save/unsave
    const handleSaveToggle = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsSaving(true)
        
        const newSavedState = !localSavedState
        
        // Optimistic update
        setLocalSavedState(newSavedState)
        
        try {
            const result = newSavedState 
                ? await saveMarketplaceListing(listing.id)
                : await unsaveMarketplaceListing(listing.id)
            
            if (result.error) {
                // Revert on error
                setLocalSavedState(!newSavedState)
                toast.error(result.error)
            } else {
                toast.success(newSavedState ? 'Saved to favorites' : 'Removed from favorites')
                // Notify parent if callback provided
                if (onSaveToggle) {
                    onSaveToggle(listing.id, newSavedState)
                }
            }
        } catch (error) {
            // Revert on exception
            setLocalSavedState(!newSavedState)
            toast.error('Failed to update saved status')
            console.error('[MarketCard] Save toggle error:', error)
        } finally {
            setIsSaving(false)
        }
    }, [listing.id, localSavedState, onSaveToggle])

    // Badge styles matching the category color scheme
    const categoryBadgeStyles: Record<string, string> = {
        'People': 'bg-orange-100 text-orange-700',      // Orange - warm, human
        'Products': 'bg-slate-100 text-slate-700',      // Slate - industrial
        'Services': 'bg-blue-100 text-blue-700',        // Blue - tech, digital
        'AI': 'bg-violet-50 text-violet-700'            // Violet - AI distinction
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
    
    // Get all tags/skills
    const allTags = attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications || []
    
    // Cycle through sizes on click
    const handleCardClick = useCallback((e: React.MouseEvent) => {
        // Don't expand if clicking on buttons or links
        if ((e.target as HTMLElement).closest('button, a')) return
        
        const nextSize: Record<CardSize, CardSize> = {
            'small': 'medium',
            'medium': 'full',
            'full': 'small'
        }
        setSize(nextSize[currentSize])
    }, [currentSize, setSize])
    
    // Size indicator button
    const handleSizeToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        const nextSize: Record<CardSize, CardSize> = {
            'small': 'medium',
            'medium': 'full',
            'full': 'small'
        }
        setSize(nextSize[currentSize])
    }, [currentSize, setSize])

    return (
        <Card 
            className={cn(
                "group relative flex flex-col border hover:border-orange-300 hover:shadow-md transition-all duration-200 overflow-hidden bg-background cursor-pointer",
                isSelected && "ring-2 ring-orange-500 border-orange-500",
                currentSize === 'full' && "col-span-1 md:col-span-2"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleCardClick}
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
                            ? "bg-background text-muted-foreground shadow-md border opacity-100"
                            : "opacity-0"
                )}
                title={isSelected ? "Remove from comparison" : "Add to comparison"}
            >
                <GitCompareArrows className="w-4 h-4" />
            </button>

            <CardContent className={cn(
                "flex flex-col flex-1 transition-all duration-200",
                currentSize === 'small' ? "p-3" : "p-4"
            )}>
                {/* === SMALL SIZE: Compact view === */}
                {currentSize === 'small' && (
                    <>
                        <div className="flex items-center gap-3">
                            {/* Smaller Avatar */}
                            <div className={cn(
                                "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs shrink-0 shadow-sm",
                                avatarGradient
                            )}>
                                {isAI && AITypeIcon ? (
                                    <AITypeIcon className="w-5 h-5" />
                                ) : (
                                    initials
                                )}
                            </div>

                            {/* Title + Badge */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Badge variant="secondary" className={cn("uppercase text-[9px] tracking-wider font-semibold border-0 shrink-0 px-1.5 py-0", categoryBadgeStyles[listing.category])}>
                                        {listing.subcategory}
                                    </Badge>
                                    {listing.is_verified && (
                                        <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0" />
                                    )}
                                </div>
                                <h3 className="text-sm font-bold tracking-tight text-foreground truncate">
                                    {listing.title}
                                </h3>
                            </div>

                            {/* Price */}
                            <div className="text-right shrink-0">
                                {primaryMetric ? (
                                    <span className="text-sm font-bold text-foreground">{primaryMetric}</span>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground">Contact</span>
                                )}
                            </div>
                        </div>
                        
                        {/* Expand indicator */}
                        <div className="flex justify-center mt-2 pt-2 border-t border-muted">
                            <button
                                onClick={handleSizeToggle}
                                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            >
                                <ChevronDown className="w-3 h-3" />
                                More info
                            </button>
                        </div>
                    </>
                )}

                {/* === MEDIUM SIZE: Standard view (current default) === */}
                {currentSize === 'medium' && (
                    <>
                        {/* Avatar + Header Row */}
                        <div className="flex gap-3 mb-3">
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

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0", categoryBadgeStyles[listing.category])}>
                                        {listing.subcategory}
                                    </Badge>
                                    {listing.is_verified && (
                                        <ShieldCheck className="w-4 h-4 text-status-success shrink-0" />
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
                        {allTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                                {allTags.slice(0, 3).map((item: string, i: number) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                        {item}
                                    </span>
                                ))}
                                {allTags.length > 3 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                        +{allTags.length - 3}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Price + CTA Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-muted mt-auto">
                            <div className="flex items-center gap-2">
                                {primaryMetric ? (
                                    <span className="text-sm font-bold text-foreground">{primaryMetric}</span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Contact for pricing</span>
                                )}
                                <button
                                    onClick={handleSizeToggle}
                                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors ml-2"
                                >
                                    <ChevronDown className="w-3 h-3" />
                                </button>
                            </div>
                            
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
                    </>
                )}

                {/* === FULL SIZE: Expanded detailed view === */}
                {currentSize === 'full' && (
                    <>
                        {/* Avatar + Header Row - Larger */}
                        <div className="flex gap-4 mb-4">
                            <div className={cn(
                                "w-16 h-16 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm",
                                avatarGradient
                            )}>
                                {isAI && AITypeIcon ? (
                                    <AITypeIcon className="w-8 h-8" />
                                ) : (
                                    initials
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0", categoryBadgeStyles[listing.category])}>
                                        {listing.subcategory}
                                    </Badge>
                                    {listing.is_verified && (
                                        <ShieldCheck className="w-4 h-4 text-status-success shrink-0" />
                                    )}
                                </div>
                                <h3 className="text-lg font-bold tracking-tight text-foreground">
                                    {listing.title}
                                </h3>
                                {/* Role/Function subtitle in header for full size */}
                                {isPerson && attrs.role && (
                                    <p className="text-sm font-medium text-muted-foreground mt-1">{attrs.role}</p>
                                )}
                                {isAI && attrs.function && (
                                    <p className="text-sm font-medium text-violet-700 mt-1">{attrs.function}</p>
                                )}
                            </div>
                            
                            {/* Price badge in header */}
                            <div className="text-right shrink-0">
                                {primaryMetric ? (
                                    <span className="text-lg font-bold text-foreground">{primaryMetric}</span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Contact for pricing</span>
                                )}
                            </div>
                        </div>

                        {/* Full Description - no clamp */}
                        <p className="text-sm text-muted-foreground mb-4">
                            {listing.description}
                        </p>

                        {/* Detailed Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
                            {attrs.years_experience && (
                                <div className="flex items-center gap-2">
                                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Experience</p>
                                        <p className="text-sm font-medium text-foreground">{attrs.years_experience} years</p>
                                    </div>
                                </div>
                            )}
                            {attrs.location && (
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Location</p>
                                        <p className="text-sm font-medium text-foreground">{attrs.location}</p>
                                    </div>
                                </div>
                            )}
                            {attrs.lead_time && (
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Lead Time</p>
                                        <p className="text-sm font-medium text-foreground">{attrs.lead_time}</p>
                                    </div>
                                </div>
                            )}
                            {attrs.availability && (
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Availability</p>
                                        <p className="text-sm font-medium text-foreground">{attrs.availability}</p>
                                    </div>
                                </div>
                            )}
                            {isAI && attrs.latency && (
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Latency</p>
                                        <p className="text-sm font-medium text-foreground">{attrs.latency}</p>
                                    </div>
                                </div>
                            )}
                            {attrs.rating && (
                                <div className="flex items-center gap-2">
                                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Rating</p>
                                        <p className="text-sm font-medium text-foreground">{attrs.rating}/5</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* All Skills/Tags */}
                        {allTags.length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <Wrench className="w-3 h-3" />
                                    {isPerson ? 'Skills & Expertise' : isAI ? 'Integrations' : 'Capabilities'}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {allTags.map((item: string, i: number) => (
                                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Additional attributes for full view */}
                        {(attrs.certifications && attrs.certifications !== allTags) && (
                            <div className="mb-4">
                                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <Award className="w-3 h-3" />
                                    Certifications
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(attrs.certifications as string[]).map((cert: string, i: number) => (
                                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-status-success-light text-status-success-dark">
                                            {cert}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Footer with actions */}
                        <div className="flex items-center justify-between pt-4 border-t border-muted mt-auto">
                            <button
                                onClick={handleSizeToggle}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            >
                                <ChevronUp className="w-4 h-4" />
                                Show less
                            </button>
                            
                            <div className="flex items-center gap-2">
                                <Button 
                                    size="sm" 
                                    variant="secondary"
                                    className="h-8 text-xs"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onToggleSelect(listing.id)
                                    }}
                                >
                                    <GitCompareArrows className="w-3 h-3 mr-1" />
                                    {isSelected ? 'Remove' : 'Compare'}
                                </Button>
                                <Button 
                                    size="sm" 
                                    variant="default"
                                    className="h-8 text-xs shadow-sm"
                                    asChild
                                >
                                    <Link href={`/marketplace/${listing.id}`}>
                                        <Eye className="w-3 h-3 mr-1" />
                                        View Details
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
})

