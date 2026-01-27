'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Check, X } from "lucide-react"

interface ComparisonModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    items: MarketplaceListing[]
}

export function ComparisonModal({ open, onOpenChange, items }: ComparisonModalProps) {
    if (items.length === 0) return null

    // Extract all unique attribute keys from all items
    const allKeys = Array.from(new Set(
        items.flatMap(item => Object.keys(item.attributes))
    ))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0 gap-0 backdrop-blur-xl">
                <DialogHeader className="p-6 border-b border-border">
                    <DialogTitle className="text-xl font-serif">Compare Listings</DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 p-6">
                    <div className="grid gap-8" style={{ gridTemplateColumns: `150px repeat(${items.length}, minmax(200px, 1fr))` }}>
                        {/* Header Row */}
                        <div className="font-semibold text-muted-foreground pt-4">Item</div>
                        {items.map(item => (
                            <div key={item.id} className="flex flex-col gap-2">
                                <div className="font-bold text-lg leading-tight">{item.title}</div>
                                <div className="text-sm text-muted-foreground">{item.subcategory}</div>
                            </div>
                        ))}

                        {/* Attribute Rows */}
                        {allKeys.map((key) => (
                            <>
                                <div className="col-span-full h-px bg-border/50 my-2" />
                                <div key={key} className="font-medium text-sm text-muted-foreground capitalize flex items-center">
                                    {key.replace('_', ' ')}
                                </div>
                                {items.map(item => {
                                    const val = item.attributes[key];
                                    return (
                                        <div key={`${item.id}-${key}`} className="text-sm">
                                            {renderValue(val)}
                                        </div>
                                    )
                                })}
                            </>
                        ))}

                        {/* Description Row (Optional) */}
                        <div className="col-span-full h-px bg-border/50 my-2" />
                        <div className="font-medium text-sm text-muted-foreground pt-2">Details</div>
                        {items.map(item => (
                            <div key={`${item.id}-desc`} className="text-xs text-muted-foreground leading-relaxed pt-2">
                                {item.description}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

function renderValue(value: any): React.ReactNode {
    if (value === undefined || value === null) return <span className="text-muted-foreground">-</span>
    if (typeof value === 'boolean') return value ? <Check className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-red-400" />
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}
