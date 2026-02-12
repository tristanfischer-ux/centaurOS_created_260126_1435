'use client'

import { memo, useState, useCallback, useEffect } from "react"
import { MarketplaceListing, saveMarketplaceListing, unsaveMarketplaceListing } from "@/actions/marketplace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn, getInitials } from "@/lib/utils"
import { getCategoryBadgeClasses, getAvatarGradient, type MarketplaceCategory } from "@/lib/marketplace-colors"
import { 
    ShieldCheck, MapPin, Clock, Briefcase,
    GitCompareArrows, Mail, Eye, ChevronDown, ChevronUp,
    Star, Calendar, Award, Globe, Wrench, Heart, FlaskConical
} from "lucide-react"
import { toast } from "sonner"
import { MarketplaceListingDialog } from "./marketplace-listing-dialog"
import { InviteToCompanyButton } from "./invite-to-company-button"

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

// Avatar gradients now imported from shared lib (marketplace-colors.ts)

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
    const [dialogOpen, setDialogOpen] = useState(false)

    // Sync local state when parent prop changes (e.g. after save/unsave from another component)
    useEffect(() => { setLocalSavedState(isSaved) }, [isSaved])
    
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

    const attrs = listing.attributes || {}
    const isPerson = listing.category === 'People'
    const isProduct = listing.category === 'Products'
    const isManufacturer = isProduct && listing.subcategory === 'Manufacturer'
    const isMachineCapacity = isProduct && listing.subcategory === 'Machine Capacity'

    const initials = getInitials(listing.title)
    const category = listing.category as MarketplaceCategory
    const avatarGradient = getAvatarGradient(category, listing.title)
    const categoryBadgeClasses = getCategoryBadgeClasses(category)

    // Get the primary metric to show (rate/cost)
    const primaryMetric = attrs.rate || attrs.cost || attrs.price || null
    
    // Get all tags/skills
    const allTags = attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications || []
    
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

    // Handle card click - cycles size for small/medium, opens dialog for full
    const handleCardClickWithDialog = useCallback((e: React.MouseEvent) => {
        // Don't expand if clicking on buttons or links
        if ((e.target as HTMLElement).closest('button, a')) return
        
        if (currentSize === 'full') {
            // Full size: open dialog
            setDialogOpen(true)
        } else {
            // Small/medium: cycle to next size
            const nextSize: Record<CardSize, CardSize> = {
                'small': 'medium',
                'medium': 'full',
                'full': 'small'
            }
            setSize(nextSize[currentSize])
        }
    }, [currentSize, setSize, setDialogOpen])

    return (
        <>
        <Card 
            className={cn(
                "group relative flex flex-col border shadow-sm overflow-hidden bg-background cursor-pointer",
                "hover:border-muted-foreground/20 hover:shadow-lg hover:-translate-y-0.5",
                "transition-all duration-200 ease-out",
                isSelected && "ring-2 ring-international-orange/50 border-international-orange/30",
                currentSize === 'full' && "col-span-1 md:col-span-2"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleCardClickWithDialog}
        >
            {/* Action buttons - top right */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                {/* Save/Heart button */}
                <button
                    onClick={handleSaveToggle}
                    disabled={isSaving}
                    className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                        localSavedState
                            ? "bg-red-500 text-white shadow-md"
                            : isHovered
                                ? "bg-background text-muted-foreground shadow-md border opacity-100"
                                : "sm:opacity-0 sm:group-hover:opacity-100"
                    )}
                    title={localSavedState ? "Remove from saved" : "Save for later"}
                >
                    <Heart className={cn(
                        "w-4 h-4 transition-all",
                        localSavedState && "fill-current"
                    )} />
                </button>

                {/* Compare button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleSelect(listing.id)
                    }}
                    className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                        isSelected 
                            ? "bg-international-orange text-white shadow-md" 
                            : isHovered 
                                ? "bg-background text-muted-foreground shadow-md border opacity-100"
                                : "sm:opacity-0 sm:group-hover:opacity-100"
                    )}
                    title={isSelected ? "Remove from comparison" : "Add to comparison"}
                >
                    <GitCompareArrows className="w-4 h-4" />
                </button>
            </div>

            <CardContent className={cn(
                "flex flex-col flex-1 transition-all duration-200",
                currentSize === 'small' ? "p-3" : "p-4"
            )}>
                {/* === SMALL SIZE: Compact view === */}
                {currentSize === 'small' && (
                    <>
                        <div className="flex items-center gap-3 pr-20">
                            {/* Smaller Avatar */}
                            <div className={cn(
                                "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs shrink-0 shadow-sm",
                                avatarGradient
                            )}>
                                {initials}
                            </div>

                            {/* Title + Badge */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Badge variant="secondary" className={cn("uppercase text-[9px] tracking-wider font-semibold border-0 shrink-0 px-1.5 py-0", categoryBadgeClasses)}>
                                        {listing.subcategory}
                                    </Badge>
                                    {listing.is_verified && (
                                        <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0" />
                                    )}
                                    {listing.is_demo && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground bg-muted rounded px-1 py-0 shrink-0">
                                            <FlaskConical className="w-2.5 h-2.5" />
                                            Sample
                                        </span>
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
                        <div className="flex gap-3 mb-3 pr-20">
                            <div className={cn(
                                "w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-sm",
                                avatarGradient
                            )}>
                                {initials}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0", categoryBadgeClasses)}>
                                        {listing.subcategory}
                                    </Badge>
                                    {listing.is_verified && (
                                        <ShieldCheck className="w-4 h-4 text-status-success shrink-0" />
                                    )}
                                    {listing.is_demo && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                            <FlaskConical className="w-3 h-3" />
                                            Sample
                                        </span>
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
                            
                            <div className="flex items-center gap-2">
                                {/* Invite to Company — Founders only, real People listings only */}
                                <InviteToCompanyButton listing={listing} variant="compact" />

                                <MarketplaceListingDialog
                                    listing={listing}
                                    trigger={
                                        <Button 
                                            size="sm" 
                                            variant="default"
                                            className="h-8 text-xs shadow-sm"
                                        >
                                            <Eye className="w-3 h-3 mr-1" />
                                            View
                                        </Button>
                                    }
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* === FULL SIZE: Expanded detailed view === */}
                {currentSize === 'full' && (
                    <>
                        {/* Avatar + Header Row - Larger */}
                        <div className="flex gap-4 mb-4 pr-20">
                            <div className={cn(
                                "w-16 h-16 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm",
                                avatarGradient
                            )}>
                                {initials}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0", categoryBadgeClasses)}>
                                        {listing.subcategory}
                                    </Badge>
                                    {listing.is_verified && (
                                        <ShieldCheck className="w-4 h-4 text-status-success shrink-0" />
                                    )}
                                    {listing.is_demo && (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                            <FlaskConical className="w-3 h-3" />
                                            Sample
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-lg font-bold tracking-tight text-foreground">
                                    {listing.title}
                                </h3>
                                {isPerson && attrs.role && (
                                    <p className="text-sm font-medium text-muted-foreground mt-1">{attrs.role}</p>
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

                        {/* Full Description */}
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
                                    {isPerson ? 'Skills & Expertise' : 'Capabilities'}
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

                        {/* Certifications */}
                        {(attrs.certifications && Array.isArray(attrs.certifications) && attrs.certifications !== allTags) && (
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

                        {/* Footer - Click to view prompt */}
                        <div className="flex items-center justify-between pt-4 border-t border-muted mt-auto">
                            <div className="flex items-center gap-2 text-sm text-electric-blue font-medium">
                                <Eye className="h-4 w-4" />
                                Click to view full details
                            </div>
                            
                            <div className="flex items-center gap-2">
                                {/* Invite to Company — Founders only, real People listings only */}
                                <InviteToCompanyButton listing={listing} variant="compact" />
                                
                                <button
                                    onClick={handleSizeToggle}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                >
                                    <ChevronUp className="w-4 h-4" />
                                    Show less
                                </button>
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
                            </div>
                        </div>
                    </>
                )}

            </CardContent>
        </Card>
        
        {/* Controlled dialog - always rendered in same place in component tree */}
        <MarketplaceListingDialog
            listing={listing}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
        />
        </>
    )
})

