'use client'

import { MarketplaceListing } from "@/actions/marketplace"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
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
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b border-border">
                    <DialogTitle className="text-xl font-semibold">Compare Listings</DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6 pt-4">
                        {/* Mobile: Card Layout */}
                        <div className="block md:hidden space-y-4">
                            {items.map(item => (
                                <Card key={item.id} className="p-4">
                                    <h3 className="font-semibold mb-1 text-base">{item.title}</h3>
                                    <p className="text-sm text-muted-foreground mb-3">{item.subcategory}</p>
                                    <dl className="space-y-2 text-sm">
                                        {allKeys.map((key) => (
                                            <div key={key} className="flex justify-between items-start border-b border-border/50 pb-2 last:border-0 last:pb-0">
                                                <dt className="text-muted-foreground capitalize pr-4 flex-shrink-0">
                                                    {key.replace(/_/g, ' ')}
                                                </dt>
                                                <dd className="text-right flex-shrink-0 min-w-[120px]">
                                                    {renderValue(item.attributes[key])}
                                                </dd>
                                            </div>
                                        ))}
                                        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                                            <dt className="text-muted-foreground font-medium">Details</dt>
                                            <dd className="text-muted-foreground leading-relaxed">{item.description}</dd>
                                        </div>
                                    </dl>
                                </Card>
                            ))}
                        </div>

                        {/* Desktop: Table Layout */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr>
                                        <th className="text-left text-sm font-medium text-muted-foreground py-3 pr-4 w-32 align-top">
                                            Item
                                        </th>
                                        {items.map(item => (
                                            <th key={item.id} className="text-left py-3 px-4 min-w-[180px] align-top">
                                                <div className="font-bold text-base leading-tight">{item.title}</div>
                                                <div className="text-sm text-muted-foreground font-normal mt-1">{item.subcategory}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {allKeys.map((key) => (
                                        <tr key={key} className="border-t border-border/50">
                                            <td className="text-sm font-medium text-muted-foreground capitalize py-3 pr-4 align-top">
                                                {key.replace(/_/g, ' ')}
                                            </td>
                                            {items.map(item => (
                                                <td key={`${item.id}-${key}`} className="text-sm py-3 px-4 align-top">
                                                    {renderValue(item.attributes[key])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr className="border-t border-border/50">
                                        <td className="text-sm font-medium text-muted-foreground py-3 pr-4 align-top">
                                            Details
                                        </td>
                                        {items.map(item => (
                                            <td key={`${item.id}-desc`} className="text-sm text-muted-foreground leading-relaxed py-3 px-4 align-top">
                                                {item.description}
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <ScrollBar orientation="horizontal" />
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
