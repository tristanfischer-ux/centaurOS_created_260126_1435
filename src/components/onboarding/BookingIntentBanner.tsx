'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, X, ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { dismissIntent } from '@/actions/onboarding-intent'
import { toast } from 'sonner'

interface BookingIntent {
  id: string
  intent_type: string
  listing_id: string | null
  created_at: string
  listing?: {
    id: string
    title: string
    category: string
    subcategory: string
    description: string | null
  } | null
}

interface BookingIntentBannerProps {
  intents: BookingIntent[]
}

export function BookingIntentBanner({ intents }: BookingIntentBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // Filter out dismissed intents
  const visibleIntents = intents.filter(intent => !dismissedIds.has(intent.id))

  if (visibleIntents.length === 0) {
    return null
  }

  const handleDismiss = async (intentId: string) => {
    // Optimistically hide the banner
    setDismissedIds(prev => new Set([...prev, intentId]))
    
    // Persist dismissal to server
    const result = await dismissIntent(intentId)
    if (!result.success) {
      // Revert if failed
      setDismissedIds(prev => {
        const next = new Set(prev)
        next.delete(intentId)
        return next
      })
      toast.error('Failed to dismiss. Please try again.')
    }
  }

  return (
    <div className="space-y-3">
      {visibleIntents.map(intent => (
        <Card 
          key={intent.id} 
          className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 overflow-hidden"
        >
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2 bg-orange-100 rounded-full shrink-0">
                  <Sparkles className="h-5 w-5 text-orange-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-orange-900">
                      Continue where you left off
                    </h3>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">
                      {intent.intent_type === 'book_listing' ? 'Booking' : intent.intent_type}
                    </Badge>
                  </div>
                  
                  {intent.listing ? (
                    <div className="mt-2">
                      <p className="text-sm text-orange-800">
                        You were interested in booking:
                      </p>
                      <div className="mt-2 p-3 bg-white/60 rounded border border-orange-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-orange-200">
                            {intent.listing.subcategory || intent.listing.category}
                          </Badge>
                        </div>
                        <p className="font-medium text-slate-900">{intent.listing.title}</p>
                        {intent.listing.description && (
                          <p className="text-sm text-slate-600 mt-1 line-clamp-1">
                            {intent.listing.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-orange-700 mt-1">
                      You showed interest in a marketplace listing during signup.
                    </p>
                  )}
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-orange-400 hover:text-orange-600 hover:bg-orange-100"
                onClick={() => handleDismiss(intent.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pl-11">
              {intent.listing_id ? (
                <Link href={`/marketplace/${intent.listing_id}/book`}>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Book Now
                  </Button>
                </Link>
              ) : (
                <Link href="/marketplace">
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                    Browse Marketplace
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="border border-orange-200 text-orange-700 hover:bg-orange-100 bg-transparent"
                onClick={() => handleDismiss(intent.id)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
