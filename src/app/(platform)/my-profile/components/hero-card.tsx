'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Calendar, Linkedin, Globe, Eye, Building2, Pencil, Camera, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { uploadAvatar } from '@/actions/profile-hub'

/**
 * HeroCard - Top-of-page profile card with avatar, name, metadata, and social links.
 *
 * @description Displays the user's identity at the top of the profile hub.
 * Features a gradient header band, large clickable avatar (for upload),
 * name, role badge, and contextual metadata (location, company, member since).
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
  /** Callback to open the edit profile dialog */
  onEditClick?: () => void
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
  onEditClick,
}: HeroCardProps) {
  const formattedDate = formatMemberSince(memberSince)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [isUploading, startUploadTransition] = useTransition()

  function handleAvatarClick(): void {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    // VALIDATION: Client-side checks before upload
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB')
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, GIF, or WebP image')
      return
    }

    startUploadTransition(async () => {
      const formData = new FormData()
      formData.set('file', file)

      const result = await uploadAvatar(formData)
      if (result.success) {
        toast.success('Avatar updated')
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to upload avatar')
      }
    })

    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  return (
    <Card className="overflow-hidden">
      {/* Gradient header band */}
      <div className="h-16 sm:h-24 bg-gradient-to-r from-orange-50 via-orange-100/40 to-background" />

      <CardContent className="-mt-10 sm:-mt-14 relative pb-6">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
          {/* Avatar with upload overlay */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={isUploading}
              className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Upload profile photo"
            >
              <UserAvatar
                name={name}
                role={role}
                avatarUrl={avatarUrl}
                size="2xl"
                className="h-20 w-20 sm:h-28 sm:w-28 border-4 border-background shadow-lg"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 rounded-full bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center">
                {isUploading ? (
                  <Loader2 className="h-6 w-6 text-background animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-background opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </button>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
            />
            {/* Avatar upload hint when no photo */}
            {!avatarUrl && !isUploading && (
              <button
                type="button"
                onClick={handleAvatarClick}
                className="text-xs text-muted-foreground text-center mt-1 w-full hover:text-foreground transition-colors cursor-pointer"
              >
                Add photo
              </button>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-1 sm:pt-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-display font-semibold text-foreground tracking-tight truncate">
                  {name || 'Your Name'}
                </h2>
                {headline && (
                  <p className="text-muted-foreground mt-0.5 text-sm">{headline}</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {onEditClick && (
                  <Button variant="outline" size="sm" onClick={onEditClick} className="min-h-[44px]">
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
                {isProvider && profileSlug && (
                  <Button variant="outline" size="sm" asChild className="min-h-[44px]">
                    <a href={`/profile/${profileSlug}`} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Public Profile</span>
                      <span className="sm:hidden">Public</span>
                    </a>
                  </Button>
                )}
              </div>
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
                    className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                    className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
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
