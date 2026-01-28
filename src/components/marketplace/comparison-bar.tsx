'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { X } from "lucide-react"

interface ComparisonBarProps {
    selectedItems: MarketplaceListing[]
    onClear: () => void
    onCompare: () => void
    onRemove: (id: string) => void
}

export function ComparisonBar({ selectedItems, onClear, onCompare, onRemove }: ComparisonBarProps) {
    if (selectedItems.length === 0) return null

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 w-full max-w-2xl px-4 pointer-events-none">
            <Card className="flex items-center justify-between p-3 pl-5 shadow-2xl bg-foreground/90 text-background border-border/50 backdrop-blur-md rounded-full pointer-events-auto">
                <div className="flex items-center gap-4">
                    <span className="font-medium text-sm">
                        {selectedItems.length} item{selectedItems.length !== 1 && 's'} selected
                    </span>
                    <div className="flex -space-x-2">
                        {selectedItems.map(item => (
                            <div key={item.id} className="relative group">
                                <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] uppercase font-bold overflow-hidden text-foreground" title={item.title}>
                                    {item.title.substring(0, 2)}
                                </div>
                                <button
                                    onClick={() => onRemove(item.id)}
                                    aria-label={`Remove ${item.title} from comparison`}
                                    className="absolute -top-1 -right-1 bg-destructive rounded-full min-h-[44px] min-w-[44px] w-8 h-8 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-destructive/80 active:bg-destructive/60"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground hover:text-background hover:bg-background/10 rounded-full px-3 h-8 text-xs">
                        Clear
                    </Button>
                    <Button
                        size="sm"
                        onClick={onCompare}
                        className="rounded-full bg-background text-foreground hover:bg-muted font-semibold h-8 px-4 text-xs"
                        disabled={selectedItems.length < 2}
                    >
                        Compare Now
                    </Button>
                </div>
            </Card>
        </div>
    )
}
