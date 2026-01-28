'use client'

import { memo } from "react"
import { MarketplaceListing } from "@/actions/marketplace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { ArrowRight, ShieldCheck } from "lucide-react"

interface MarketCardProps {
    listing: MarketplaceListing
    isSelected: boolean
    onToggleSelect: (id: string) => void
}

export const MarketCard = memo(function MarketCard({ listing, isSelected, onToggleSelect }: MarketCardProps) {
    // Aesthetic variants based on category - now unified to white, using badges for color
    const categoryBadgeStyles = {
        'People': 'bg-stone-100 text-stone-700 border-stone-200',
        'Products': 'bg-slate-100 text-slate-700 border-slate-200',
        'Services': 'bg-blue-50 text-blue-700 border-blue-100',
        'AI': 'bg-violet-50 text-violet-700 border-violet-100'
    }

    return (
        <Card className={cn(
            "group relative flex flex-col justify-between rounded-lg shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200 overflow-hidden",
            isSelected && "ring-2 ring-ring border-ring"
        )}>
            <CardContent className="p-4 relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <Badge variant="outline" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0", categoryBadgeStyles[listing.category])}>
                        {listing.subcategory}
                    </Badge>
                    {listing.is_verified && (
                        <div title="Verified" role="img" aria-label="Verified listing">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        </div>
                    )}
                </div>

                <h3 className="text-lg font-bold tracking-tight mb-2 font-serif text-foreground group-hover:text-primary transition-colors">
                    {listing.title}
                </h3>

                <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">
                    {listing.description}
                </p>

                {/* Key Attributes Display */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(listing.attributes).slice(0, 3).map(([key, value]) => {
                        if (Array.isArray(value)) return null
                        return (
                            <div key={key} className="text-xs px-2 py-1 rounded-md bg-muted border border-border font-medium truncate max-w-[120px]">
                                <span className="opacity-60 capitalize mr-1">{key.replace('_', ' ')}:</span>
                                <span className="text-foreground">{String(value)}</span>
                            </div>
                        )
                    })}
                </div>
            </CardContent>

            <CardFooter className="relative z-10 flex items-center justify-between pt-4 border-t border-border mt-auto">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`compare-${listing.id}`}
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(listing.id)}
                        className="h-4 w-4 rounded border-input data-[state=checked]:bg-foreground data-[state=checked]:border-foreground text-foreground focus:ring-ring"
                        aria-label={`Select ${listing.title} for comparison`}
                    />
                    <label
                        htmlFor={`compare-${listing.id}`}
                        className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground"
                    >
                        Compare
                    </label>
                </div>

                <Button size="sm" variant="ghost" className="text-xs group/btn">
                    View
                    <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </Button>
            </CardFooter>
        </Card>
    )
})
