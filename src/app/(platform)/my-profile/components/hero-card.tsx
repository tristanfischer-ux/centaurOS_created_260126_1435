'use client'

import { UserAvatar } from '@/components/ui/user-avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Calendar, Linkedin, Globe, Eye, Building2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'

/**
 * HeroCard - Top-of-page profile card with avatar, name, metadata, and social links.
 *
 * @description Displays the user's identity at the top of the profile hub.
 * Features a gradient header band, large avatar, name, role badge,
 * and contextual metadata (location, company, member since).
 *
 * @component
 */

interface HeroCardProps {
  /** User's display name */
  name: string | null
  /** Provider headline (e.g., "Fractional CFO") */
  headline: string | null
  /** User role (Founder, Executive, Apprentice) */
  role: string
  /** Avatar image URL */
  avatarUrl: string | null
  /** User location */
  location: string | null
  /** ISO date string of account creation */
  memberSince: string
  /** Foundry/company name */
  foundryName: string | null
  /** LinkedIn profile URL */
  linkedinUrl: string | null
  /** Personal website URL */
  websiteUrl: string | null
  /** Public profile slug for "View Public Profile" link */
  profileSlug: string | null
  /** Whether the user has a provider profile */
  isProvider: boolean
}

export function HeroCard({
  name,
  headline,
  role,
  avatarUrl,
  location,
  memberSince,
  foundryName,
  linkedinUrl,
  websiteUrl,
  profileSlug,
  isProvider,
}: HeroCardProps) {
  const formattedDate = formatMemberSince(memberSince)

  return (
    <Card className="overflow-hidden">
      {/* Gradient header band */}
      <div className="h-24 bg-gradient-to-r from-orange-50 via-orange-100/40 to-background" />

      <CardContent className="-mt-14 relative pb-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* Avatar */}
          <UserAvatar
            name={name}
            role={role}
            avatarUrl={avatarUrl}
            size="2xl"
            className="border-4 border-background shadow-lg flex-shrink-0"
          />

          {/* Info */}
          <div className="flex-1 min-w-0 pt-2 sm:pt-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight truncate">
                  {name || 'Your Name'}
                </h2>
                {headline && (
                  <p className="text-muted-foreground mt-0.5 text-sm">{headline}</p>
                )}
              </div>

              {/* Public profile link */}
              {isProvider && profileSlug && (
                <Button variant="outline" size="sm" asChild className="flex-shrink-0">
                  <a href={`/profile/${profileSlug}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-2" />
                    Public Profile
                  </a>
                </Button>
              )}
            </div>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
              <Badge variant="brand" size="sm">
                {role}
              </Badge>

              {foundryName && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {foundryName}
                </span>
              )}

              {location && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {location}
                </span>
              )}

              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Member since {formattedDate}
              </span>
            </div>

            {/* Social links */}
            {(linkedinUrl || websiteUrl) && (
              <div className="flex items-center gap-3 mt-3">
                {linkedinUrl && (
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="LinkedIn profile"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Personal website"
                  >
                    <Globe className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Formats a created_at ISO string into "Jan 2026" format.
 */
function formatMemberSince(dateString: string): string {
  try {
    return format(parseISO(dateString), 'MMM yyyy')
  } catch {
    return 'Unknown'
  }
}
