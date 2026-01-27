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

    // Aesthetic variants based on category
    const variants = {
        'People': "bg-stone-50 border-stone-200 hover:border-stone-400 text-stone-900 shadow-sm", // Marble/Classical
        'Products': "bg-slate-100 border-slate-300 hover:border-slate-500 text-slate-900", // Steel/Industrial
        'Services': "bg-white border-gray-200 hover:border-gray-400 text-gray-900", // Clean/Professional
        'AI': "bg-black/5 backdrop-blur-md border-white/20 hover:border-violet-500/50 text-slate-900 bg-gradient-to-br from-white/40 to-white/10", // Glass/Holographic
    }

    const categoryColor = {
        'People': 'bg-stone-200 text-stone-700',
        'Products': 'bg-slate-200 text-slate-700',
        'Services': 'bg-blue-100 text-blue-700',
        'AI': 'bg-violet-100 text-violet-700 border-violet-200'
    }

    return (
        <div className={cn(
            "group relative flex flex-col justify-between p-5 rounded-xl border transition-all duration-300 overflow-hidden",
            variants[listing.category],
            isSelected && "ring-2 ring-primary ring-offset-2"
        )}>
            {/* Visual Texture Overlays */}
            {listing.category === 'People' && (
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/white-marble.png')] mix-blend-multiply" />
            )}
            {listing.category === 'Products' && (
                <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')]" />
            )}

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <Badge variant="outline" className={cn("uppercase text-[10px] tracking-wider font-semibold", categoryColor[listing.category])}>
                        {listing.subcategory}
                    </Badge>
                    {listing.is_verified && (
                        <div title="Verified">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        </div>
                    )}
                </div>

                <h3 className="text-lg font-bold tracking-tight mb-2 font-serif group-hover:text-primary transition-colors">
                    {listing.title}
                </h3>

                <p className="text-sm opacity-80 mb-4 line-clamp-2 min-h-[40px]">
                    {listing.description}
                </p>

                {/* Key Attributes Display */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(listing.attributes).slice(0, 3).map(([key, value]) => {
                        if (Array.isArray(value)) return null
                        return (
                            <div key={key} className="text-xs px-2 py-1 rounded-md bg-black/5 font-medium truncate max-w-[120px]">
                                <span className="opacity-60 capitalize mr-1">{key.replace('_', ' ')}:</span>
                                <span>{String(value)}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="relative z-10 flex items-center justify-between pt-4 border-t border-black/5 mt-auto">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`compare-${listing.id}`}
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(listing.id)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <label
                        htmlFor={`compare-${listing.id}`}
                        className="text-xs font-medium cursor-pointer select-none opacity-70 hover:opacity-100"
                    >
                        Compare
                    </label>
                </div>

                <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-black/5 group/btn">
                    View
                    <ArrowRight className="w-3 h-3 ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
                </Button>
            </div>
        </div>
    )
}
