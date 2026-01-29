'use client'

/**
 * OrgBlueprintGapCard Component
 * Display a coverage gap with marketplace recommendations
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShoppingCart,
  Sparkles,
  Store,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { fillOrgBlueprintGap, getGapMarketplaceListings } from '@/actions/integrations'
import { cn } from '@/lib/utils'

interface MarketplaceListing {
  id: string
  title: string
  category: string
  subcategory: string
  description: string | null
  imageUrl: string | null
  isVerified: boolean
  provider?: {
    id: string
    displayName: string
    tier: string
  }
  relevanceScore?: number
  matchReason?: string
}

interface OrgBlueprintGapCardProps {
  gapId: string
  functionId: string
  functionName: string
  category: string
  description: string | null
  isCritical: boolean
  coverageStatus: 'gap' | 'partial'
  initialListings?: MarketplaceListing[]
  marketplaceUrl?: string
  onOrderCreated?: (orderId: string) => void
}

export function OrgBlueprintGapCard({
  gapId,
  functionId,
  functionName,
  category,
  description,
  isCritical,
  coverageStatus,
  initialListings = [],
  marketplaceUrl,
  onOrderCreated,
}: OrgBlueprintGapCardProps) {
  const [listings, setListings] = useState<MarketplaceListing[]>(initialListings)
  const [isLoadingListings, setIsLoadingListings] = useState(false)
  const [isCreatingOrder, setIsCreatingOrder] = useState<string | null>(null)
  const [showAllListings, setShowAllListings] = useState(false)

  const loadListings = async () => {
    setIsLoadingListings(true)
    try {
      const result = await getGapMarketplaceListings(functionId, 5)
      if (result.listings) {
        setListings(result.listings)
      }
      if ('error' in result && result.error) {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error('Failed to load marketplace listings')
    } finally {
      setIsLoadingListings(false)
    }
  }

  const handleFillGap = async (listingId: string, amount: number = 100) => {
    setIsCreatingOrder(listingId)
    try {
      const result = await fillOrgBlueprintGap(gapId, listingId, amount)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      if (result.orderId) {
        toast.success('Order created successfully')
        onOrderCreated?.(result.orderId)
      }
    } catch (error) {
      toast.error('Failed to create order')
    } finally {
      setIsCreatingOrder(null)
    }
  }

  const displayedListings = showAllListings ? listings : listings.slice(0, 2)

  // Build marketplace URL with filters
  const searchUrl = marketplaceUrl || `/marketplace?category=agencies&search=${encodeURIComponent(functionName)}`

  return (
    <Card className={cn(
      'overflow-hidden',
      isCritical && 'border-destructive/50'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{functionName}</CardTitle>
              {isCritical && (
                <Badge variant="destructive" className="text-[10px]">
                  Critical
                </Badge>
              )}
            </div>
            <CardDescription className="flex items-center gap-1.5">
              <span className="text-xs">{category}</span>
              <span className="text-muted-foreground">•</span>
              {coverageStatus === 'gap' ? (
                <Badge variant="warning" className="text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Gap
                </Badge>
              ) : (
                <Badge variant="info" className="text-[10px]">
                  Partial
                </Badge>
              )}
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            size="sm"
            asChild
          >
            <Link href={searchUrl}>
              <Store className="h-4 w-4 mr-1.5" />
              Find Provider
            </Link>
          </Button>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {description}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {listings.length === 0 && !isLoadingListings ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={loadListings}
            className="w-full"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Find matching providers
          </Button>
        ) : isLoadingListings ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Recommended providers</span>
            </div>
            {displayedListings.map((listing) => (
              <div
                key={listing.id}
                className="p-3 border rounded-lg space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {listing.title}
                      </span>
                      {listing.isVerified && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {listing.subcategory}
                      </span>
                      {listing.relevanceScore && (
                        <Badge variant="secondary" className="text-[10px]">
                          {listing.relevanceScore}% match
                        </Badge>
                      )}
                    </div>
                  </div>
                  {listing.provider && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      by {listing.provider.displayName}
                    </span>
                  )}
                </div>
                {listing.matchReason && (
                  <p className="text-xs text-muted-foreground">
                    {listing.matchReason}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    asChild
                  >
                    <Link href={`/marketplace/${listing.id}`}>
                      View Details
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleFillGap(listing.id)}
                    disabled={isCreatingOrder === listing.id}
                  >
                    {isCreatingOrder === listing.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4 mr-1.5" />
                        Fill Gap
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}

            {listings.length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllListings(!showAllListings)}
                className="w-full text-xs"
              >
                {showAllListings ? 'Show less' : `Show ${listings.length - 2} more`}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Separator />

      <CardFooter className="py-3">
        <Link
          href={searchUrl}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Browse all providers in marketplace
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  )
}
