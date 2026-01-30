'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bookmark, BookmarkX, ExternalLink, DollarSign, Clock, Star, ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { removeFromStack } from '@/actions/marketplace'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { typography } from '@/lib/design-system/typography'

interface SavedResource {
    id: string
    provider_id: string
    status: string
    created_at: string
    marketplace_listings: {
        id: string
        name: string
        headline: string
        category: string
        subcategory: string
        tags: string[]
        hourly_rate_min: number | null
        hourly_rate_max: number | null
        delivery_time_days: number | null
        certification_level: string | null
        rating_average: number | null
        total_reviews: number | null
        total_bookings: number | null
        response_time_hours: number | null
    } | null
}

interface SavedResourcesViewProps {
    savedResources: SavedResource[]
    error: string | null
}

export function SavedResourcesView({ savedResources: initialResources, error }: SavedResourcesViewProps) {
    const [savedResources, setSavedResources] = useState(initialResources)
    const [removingId, setRemovingId] = useState<string | null>(null)
    const router = useRouter()

    const handleRemove = async (providerId: string) => {
        setRemovingId(providerId)
        const result = await removeFromStack(providerId)
        
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Removed from saved resources')
            // Remove from local state
            setSavedResources(prev => prev.filter(r => r.provider_id !== providerId))
            router.refresh()
        }
        setRemovingId(null)
    }

    const categoryStyles: Record<string, { bg: string; text: string; border: string }> = {
        'People': { bg: 'bg-stone-50', text: 'text-stone-700', border: 'border-stone-200' },
        'Products': { bg: 'bg-muted', text: 'text-foreground', border: 'border-slate-200' },
        'AI_Tools': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                        <p className="text-red-600">Failed to load saved resources: {error}</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>Saved Resources</h1>
                    </div>
                    <p className={typography.pageSubtitle}>
                        Quick access to your saved marketplace providers and tools
                    </p>
                </div>

                {/* Empty State */}
                {savedResources.length === 0 && (
                    <Card className="bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
                        <CardContent className="p-12 text-center">
                            <div className="max-w-md mx-auto space-y-4">
                                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                                    <Bookmark className="h-8 w-8 text-international-orange" />
                                </div>
                                <h2 className="text-xl font-semibold text-foreground">No Saved Resources Yet</h2>
                                <p className="text-muted-foreground">
                                    Browse the marketplace and save providers or tools to quickly access them here.
                                </p>
                                <Button asChild className="mt-4">
                                    <Link href="/marketplace">
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        Explore Marketplace
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Saved Resources Grid */}
                {savedResources.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {savedResources.map((resource) => {
                            const listing = resource.marketplace_listings
                            if (!listing) return null

                            const categoryStyle = categoryStyles[listing.category] || categoryStyles['People']

                            return (
                                <Card key={resource.id} className={`${categoryStyle.border} hover:shadow-lg transition-shadow`}>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <Badge className={`${categoryStyle.bg} ${categoryStyle.text} mb-2`}>
                                                    {listing.category}
                                                </Badge>
                                                <h3 className="font-semibold text-lg leading-tight truncate">
                                                    {listing.name}
                                                </h3>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemove(resource.provider_id)}
                                                disabled={removingId === resource.provider_id}
                                                className="shrink-0 h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                                            >
                                                <BookmarkX className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                                            {listing.headline}
                                        </p>

                                        {/* Key Info */}
                                        <div className="space-y-2 text-sm">
                                            {listing.hourly_rate_min && listing.hourly_rate_max && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <DollarSign className="h-4 w-4" />
                                                    <span>${listing.hourly_rate_min}-${listing.hourly_rate_max}/hr</span>
                                                </div>
                                            )}
                                            {listing.delivery_time_days && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Clock className="h-4 w-4" />
                                                    <span>{listing.delivery_time_days} day delivery</span>
                                                </div>
                                            )}
                                            {listing.rating_average && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                                    <span>{listing.rating_average.toFixed(1)} ({listing.total_reviews} reviews)</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Tags */}
                                        {listing.tags && listing.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {listing.tags.slice(0, 3).map((tag, idx) => (
                                                    <Badge key={idx} variant="secondary" className="text-xs">
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <Button asChild className="w-full" variant="secondary">
                                            <Link href={`/marketplace/${listing.id}`}>
                                                View Details
                                                <ArrowRight className="h-4 w-4 ml-2" />
                                            </Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}

                {/* Footer CTA */}
                {savedResources.length > 0 && (
                    <div className="mt-12 text-center">
                        <Button asChild variant="secondary" size="lg">
                            <Link href="/marketplace">
                                <Sparkles className="h-4 w-4 mr-2" />
                                Find More Resources
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
