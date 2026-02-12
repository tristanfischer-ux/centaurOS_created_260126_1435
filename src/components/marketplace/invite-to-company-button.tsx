'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, Loader2, CheckCircle2 } from 'lucide-react'
import { inviteFromMarketplace } from '@/actions/marketplace-invite'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { MarketplaceListing } from '@/actions/marketplace'

interface InviteToCompanyButtonProps {
  /** The marketplace listing to potentially invite */
  listing: MarketplaceListing
  /** Visual style variant */
  variant?: 'default' | 'compact'
}

/**
 * "Invite to Company" button shown on marketplace People listings.
 *
 * @description Only renders for Founder users viewing non-demo listings that
 * are linked to real user accounts. Triggers the existing invitation flow to
 * send a company invitation email.
 *
 * @param listing - The marketplace listing to invite
 * @param variant - Visual variant: 'default' for full button, 'compact' for icon-only
 */
export function InviteToCompanyButton({ listing, variant = 'default' }: InviteToCompanyButtonProps): React.ReactElement | null {
  const [isFounder, setIsFounder] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isInvited, setIsInvited] = useState(false)

  // Check if the current user is a Founder
  useEffect(() => {
    async function checkRole(): Promise<void> {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      setIsFounder(profile?.role === 'Founder')
    }
    checkRole()
  }, [])

  const handleInvite = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    const result = await inviteFromMarketplace(listing.id)

    if (result.success) {
      setIsInvited(true)
      toast.success(`Invitation sent to ${result.personName}!`)
    } else {
      toast.error(result.error || 'Failed to send invitation')
    }

    setIsLoading(false)
  }, [listing.id])

  // Don't render if:
  // - User is not a Founder
  // - Listing is demo data
  // - Listing is not a People category
  // - Listing has no real user behind it
  const canInvite = isFounder
    && !listing.is_demo
    && listing.category === 'People'
    && !!listing.created_by_provider_id

  if (!canInvite) return null

  if (isInvited) {
    return (
      <Button variant="secondary" disabled className="gap-2">
        <CheckCircle2 className="h-4 w-4 text-status-success" />
        {variant === 'compact' ? 'Invited' : 'Invitation Sent'}
      </Button>
    )
  }

  return (
    <Button
      variant={variant === 'compact' ? 'secondary' : 'default'}
      onClick={handleInvite}
      disabled={isLoading}
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {variant === 'compact' ? 'Invite' : 'Invite to Company'}
    </Button>
  )
}
