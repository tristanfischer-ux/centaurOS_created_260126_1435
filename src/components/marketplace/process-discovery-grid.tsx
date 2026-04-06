'use client'

/**
 * @file process-discovery-grid.tsx
 *
 * @description Grid of manufacturing process categories for supplier discovery.
 * Users click a process (e.g., "CNC Machining") to filter the marketplace
 * to suppliers offering that capability. Replaces the wall-of-13k-suppliers
 * experience with intent-driven browsing.
 */

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import {
    Layers, Cog, Flame, Box, Printer, Cpu,
    Paintbrush, Wrench, Shield, MoreHorizontal,
} from 'lucide-react'
import type { ProcessGroup } from '@/actions/marketplace-process-discovery'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Layers, Cog, Flame, Box, Printer, Cpu,
    Paintbrush, Wrench, Shield, MoreHorizontal,
}

interface ProcessDiscoveryGridProps {
    /** Process groups with supplier counts */
    groups: ProcessGroup[]
    /** Total supplier count for the "browse all" link */
    totalCount: number
}

export function ProcessDiscoveryGrid({ groups, totalCount }: ProcessDiscoveryGridProps) {
    const router = useRouter()

    function handleGroupClick(group: ProcessGroup) {
        // Navigate with subcategory filter — uses pipe delimiter to avoid
        // breaking on subcategory names containing commas
        const params = new URLSearchParams()
        params.set('subcategory', group.subcategories.join('|'))
        router.push(`/marketplace?${params.toString()}`)
    }

    if (groups.length === 0) return null

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-foreground">Browse by Manufacturing Process</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Find suppliers by what they make — {totalCount.toLocaleString()} suppliers across {groups.length} categories
                </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {groups.map((group) => {
                    const IconComponent = ICON_MAP[group.icon] || MoreHorizontal

                    return (
                        <Card
                            key={group.id}
                            className="cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] transition-all duration-200 border-border hover:border-international-orange/30"
                            onClick={() => handleGroupClick(group)}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-international-orange/10 shrink-0">
                                        <IconComponent className="h-5 w-5 text-international-orange" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-foreground leading-tight">
                                            {group.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {group.count.toLocaleString()} suppliers
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
