'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { ArrowRight, ShieldCheck } from "lucide-react"

interface MarketCardProps {
    listing: MarketplaceListing
    isSelected: boolean
    onToggleSelect: (id: string) => void
}

export function MarketCard({ listing, isSelected, onToggleSelect }: MarketCardProps) {
    // Aesthetic variants based on category - now unified to white, using badges for color
    const categoryBadgeStyles = {
        'People': 'bg-stone-100 text-stone-700 border-stone-200',
        'Products': 'bg-slate-100 text-slate-700 border-slate-200',
        'Services': 'bg-blue-50 text-blue-700 border-blue-100',
        'AI': 'bg-violet-50 text-violet-700 border-violet-100'
    }

    return (
        <div className={cn(
            "group relative flex flex-col justify-between p-5 rounded-xl border bg-white border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden",
            isSelected && "ring-2 ring-primary ring-offset-2 border-primary"
        )}>
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <Badge variant="outline" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0", categoryBadgeStyles[listing.category])}>
                        {listing.subcategory}
                    </Badge>
                    {listing.is_verified && (
                        <div title="Verified">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        </div>
                    )}
                </div>

                <h3 className="text-lg font-bold tracking-tight mb-2 font-serif text-slate-900 group-hover:text-primary transition-colors">
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
                            <div key={key} className="text-xs px-2 py-1 rounded-md bg-slate-50 border border-slate-100 font-medium truncate max-w-[120px]">
                                <span className="opacity-60 capitalize mr-1">{key.replace('_', ' ')}:</span>
                                <span className="text-slate-700">{String(value)}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="relative z-10 flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`compare-${listing.id}`}
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(listing.id)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <label
                        htmlFor={`compare-${listing.id}`}
                        className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground"
                    >
                        Compare
                    </label>
                </div>

                <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-slate-50 group/btn">
                    View
                    <ArrowRight className="w-3 h-3 ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
                </Button>
            </div>
        </div>
    )
}
