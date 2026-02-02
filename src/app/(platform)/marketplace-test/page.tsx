import { getMarketplaceListings } from '@/actions/marketplace'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, MapPin, Briefcase } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MarketplaceTestPage() {
    let listings: Awaited<ReturnType<typeof getMarketplaceListings>> = []
    let errorMessage: string | null = null

    try {
        listings = await getMarketplaceListings()
    } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error('[MarketplaceTest] Error:', err)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b">
                <div className="h-8 w-1 bg-orange-600 rounded-full" />
                <div>
                    <h1 className="text-2xl font-semibold">Marketplace (Simple View)</h1>
                    <p className="text-muted-foreground text-sm">
                        {listings.length} listings loaded
                    </p>
                </div>
            </div>

            {/* Error display */}
            {errorMessage && (
                <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                    <p className="text-destructive font-medium">Error: {errorMessage}</p>
                </div>
            )}

            {/* Category tabs - simple buttons */}
            <div className="flex flex-wrap gap-2">
                {['People', 'Products', 'Services', 'AI'].map((cat) => {
                    const count = listings.filter(l => l.category === cat).length
                    return (
                        <Badge key={cat} variant="secondary" className="px-3 py-1.5">
                            {cat} ({count})
                        </Badge>
                    )
                })}
            </div>

            {/* Listings grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {listings.slice(0, 12).map((listing) => (
                    <Card key={listing.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                                <CardTitle className="text-base line-clamp-1">
                                    {listing.title}
                                </CardTitle>
                                {listing.is_verified && (
                                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                )}
                            </div>
                            <Badge variant="secondary" className="w-fit text-xs">
                                {listing.category}
                            </Badge>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {listing.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                    {listing.description}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {listing.location && (
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {listing.location}
                                    </span>
                                )}
                                {listing.subcategory && (
                                    <span className="flex items-center gap-1">
                                        <Briefcase className="h-3 w-3" />
                                        {listing.subcategory}
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Show more indicator */}
            {listings.length > 12 && (
                <p className="text-center text-muted-foreground text-sm">
                    Showing 12 of {listings.length} listings
                </p>
            )}
        </div>
    )
}
