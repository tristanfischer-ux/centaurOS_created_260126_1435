'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Briefcase, PoundSterling, Sparkles, Edit3, ArrowRight,
} from 'lucide-react'
import { ProfileStrengthGauge } from './profile-strength-gauge'
import { ListingOptimizer } from '../listing-optimizer'

/**
 * MarketplaceTab - Provider-specific marketplace profile and listing management.
 *
 * @description Shows the provider's marketplace profile details (headline, bio,
 * rates, skills), a compact profile strength gauge, and the listing optimizer.
 * Only rendered for users who have a provider profile.
 *
 * @component
 */

interface MarketplaceTabProps {
  /** Provider profile data */
  providerProfile: {
    headline: string | null
    bio: string | null
    day_rate: number | null
    hourly_rate: number | null
    currency: string | null
    years_experience: number | null
    specializations: string[] | null
    industries: string[] | null
  }
  /** Marketplace listing data */
  listing: {
    id: string
    title: string | null
    description: string | null
    category: string | null
    subcategory: string | null
    image_url: string | null
    approval_status: string | null
  } | null
  /** Profile strength data */
  strength: {
    score: number
    sections: Array<{
      name: string
      weight: number
      completed: boolean
      suggestion: string
    }>
  }
  /** Callback to open the edit wizard */
  onEditClick: () => void
}

export function MarketplaceTab({
  providerProfile,
  listing,
  strength,
  onEditClick,
}: MarketplaceTabProps) {
  const currencySymbol = getCurrencySymbol(providerProfile.currency)

  return (
    <div className="space-y-6">
      {/* Profile Strength Gauge */}
      <ProfileStrengthGauge score={strength.score} sections={strength.sections} />

      {/* Provider Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-international-orange" />
              Marketplace Profile
            </CardTitle>
            <Button size="sm" onClick={onEditClick}>
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Headline */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Headline
            </p>
            {providerProfile.headline ? (
              <p className="text-sm font-medium text-foreground">{providerProfile.headline}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No headline set</p>
            )}
          </div>

          {/* Bio */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              About
            </p>
            {providerProfile.bio ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
                {providerProfile.bio}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No bio written yet</p>
            )}
          </div>

          {/* Rates */}
          <div className="flex flex-wrap gap-6">
            {providerProfile.day_rate && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Day Rate
                </p>
                <p className="text-lg font-bold text-foreground flex items-center gap-1">
                  <PoundSterling className="h-4 w-4 text-muted-foreground" />
                  {currencySymbol}{providerProfile.day_rate.toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground">/day</span>
                </p>
              </div>
            )}
            {providerProfile.years_experience && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Experience
                </p>
                <p className="text-lg font-bold text-foreground">
                  {providerProfile.years_experience}
                  <span className="text-sm font-normal text-muted-foreground"> years</span>
                </p>
              </div>
            )}
          </div>

          {/* Specializations */}
          {providerProfile.specializations && providerProfile.specializations.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Specializations
              </p>
              <div className="flex flex-wrap gap-1.5">
                {providerProfile.specializations.map((skill) => (
                  <Badge key={skill} variant="secondary" size="sm">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Industries */}
          {providerProfile.industries && providerProfile.industries.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Industries
              </p>
              <div className="flex flex-wrap gap-1.5">
                {providerProfile.industries.map((industry) => (
                  <Badge key={industry} variant="outline" size="sm">
                    {industry}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* CTA if incomplete */}
          {strength.score < 80 && (
            <div className="rounded-lg bg-status-warning-light p-4 border border-status-warning/20">
              <p className="text-sm font-medium text-foreground">
                Complete your profile to get more visibility
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Profiles with 80%+ completion get significantly more views and opportunities.
              </p>
              <Button
                size="sm"
                onClick={onEditClick}
                className="mt-3 bg-international-orange hover:bg-international-orange/90"
              >
                Complete Profile
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Listing Optimizer */}
      <ListingOptimizer listing={listing} />
    </div>
  )
}

/** Map currency code to symbol. */
function getCurrencySymbol(currency: string | null): string {
  const symbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' }
  return symbols[currency || 'GBP'] || ''
}
