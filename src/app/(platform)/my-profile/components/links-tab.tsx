'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Linkedin, Globe, MapPin, Clock, Edit3, ExternalLink, Phone } from 'lucide-react'

/**
 * LinksTab - Social links, location, and contact management.
 *
 * @description Displays the user's external links, location, and contact info.
 * Available to all users. Non-providers see their profile-level data;
 * providers see their provider_profiles data. All users can edit.
 *
 * @component
 */

interface LinksTabProps {
  /** LinkedIn URL (merged: provider or profile-level) */
  linkedinUrl: string | null
  /** Personal website URL (provider only) */
  websiteUrl: string | null
  /** User location (provider only) */
  location: string | null
  /** Timezone string (provider only) */
  timezone: string | null
  /** Phone number (from profiles table) */
  phoneNumber: string | null
  /** Whether the user is a provider */
  isProvider: boolean
  /** Callback to open the appropriate edit dialog */
  onEditClick: () => void
}

export function LinksTab({
  linkedinUrl,
  websiteUrl,
  location,
  timezone,
  phoneNumber,
  isProvider,
  onEditClick,
}: LinksTabProps) {
  const hasAnyData = linkedinUrl || websiteUrl || location || timezone || phoneNumber

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Links & Contact</CardTitle>
            <Button size="sm" variant="outline" onClick={onEditClick}>
              <Edit3 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {hasAnyData ? (
            <div className="space-y-4">
              {linkedinUrl && (
                <LinkRow
                  icon={Linkedin}
                  label="LinkedIn"
                  href={linkedinUrl}
                  displayText={formatUrl(linkedinUrl)}
                />
              )}
              {websiteUrl && (
                <LinkRow
                  icon={Globe}
                  label="Website"
                  href={websiteUrl}
                  displayText={formatUrl(websiteUrl)}
                />
              )}
              {phoneNumber && (
                <InfoRow
                  icon={Phone}
                  label="Phone"
                  value={phoneNumber}
                />
              )}
              {location && (
                <InfoRow
                  icon={MapPin}
                  label="Location"
                  value={location}
                />
              )}
              {timezone && (
                <InfoRow
                  icon={Clock}
                  label="Timezone"
                  value={timezone.replace(/_/g, ' ')}
                />
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {isProvider
                  ? 'Add your links and location to help clients find and connect with you.'
                  : 'Add your LinkedIn and contact details so your team can connect with you.'}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={onEditClick}
                className="mt-3"
              >
                Add Links
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** External link row with icon and clickable URL. */
function LinkRow({
  icon: Icon,
  label,
  href,
  displayText,
}: {
  icon: React.ElementType
  label: string
  href: string
  displayText: string
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded-md">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className="text-sm text-foreground">{displayText}</p>
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Open ${label}`}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  )
}

/** Info row for non-link data (location, timezone, phone). */
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="p-2 bg-muted rounded-md">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  )
}

/** Format a URL for display by removing protocol and trailing slash. */
function formatUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
