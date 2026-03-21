/**
 * @file InvestorDetailActions.tsx
 *
 * @description Client component for the detail page header actions:
 * shortlist heart toggle, alert bell toggle, and outreach draft button.
 * Tier-gated: alerts require starter+, outreach requires professional+.
 */

'use client'

import { useState, useCallback, useEffect, useTransition, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Heart, Bell, BellOff, Mail, Lock, Loader2 } from 'lucide-react'
import {
  addToShortlist,
  removeFromShortlist,
  getShortlistIds,
  toggleInvestorAlert,
  getAlertedListingIds,
} from '@/actions/investors'
import { OutreachDraftDialog } from './OutreachDraftDialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { InvestorTierAccess } from '@/actions/investors'

interface InvestorDetailActionsProps {
  listingId: string
  access: InvestorTierAccess
  firmName?: string
}

export function InvestorDetailActions({ listingId, access, firmName }: InvestorDetailActionsProps) {
  const [isShortlisted, setIsShortlisted] = useState(false)
  const [isAlerted, setIsAlerted] = useState(false)
  const [showOutreach, setShowOutreach] = useState(false)
  const [shortlistPending, startShortlistTransition] = useTransition()
  const [alertPending, startAlertTransition] = useTransition()
  const shortlistBusyRef = useRef(false)

  // Load initial state
  useEffect(() => {
    getShortlistIds()
      .then(ids => { if (listingId in ids) setIsShortlisted(true) })
      .catch(err => console.error('[InvestorDetailActions] Failed to load shortlist:', err))
    if (access.detailAccess) {
      getAlertedListingIds()
        .then(ids => { if (ids.includes(listingId)) setIsAlerted(true) })
        .catch(err => console.error('[InvestorDetailActions] Failed to load alerts:', err))
    }
  }, [listingId, access.detailAccess])

  // GOTCHA: Use a ref to track authoritative shortlist state to avoid stale closure.
  // The callback no longer depends on `isShortlisted` state — reads from ref instead.
  const shortlistStateRef = useRef(false)
  shortlistStateRef.current = isShortlisted

  const handleToggleShortlist = useCallback(() => {
    // SECURITY: Guard against rapid double-clicks corrupting shortlist state
    if (shortlistBusyRef.current) return
    shortlistBusyRef.current = true
    const wasShortlisted = shortlistStateRef.current
    setIsShortlisted(!wasShortlisted)
    startShortlistTransition(async () => {
      try {
        const { error } = wasShortlisted
          ? await removeFromShortlist(listingId)
          : await addToShortlist(listingId)
        if (error) {
          setIsShortlisted(wasShortlisted)
          toast.error(error)
        } else {
          toast.success(wasShortlisted ? 'Removed from shortlist' : 'Added to shortlist')
        }
      } finally {
        shortlistBusyRef.current = false
      }
    })
  }, [listingId])

  const handleToggleAlert = useCallback(() => {
    if (!access.detailAccess) return
    const wasAlerted = isAlerted
    setIsAlerted(!wasAlerted)
    startAlertTransition(async () => {
      const result = await toggleInvestorAlert(listingId)
      if (result.error) {
        setIsAlerted(wasAlerted)
        toast.error(result.error)
      } else {
        toast.success(result.active ? 'Alert enabled' : 'Alert disabled')
      }
    })
  }, [isAlerted, listingId, access.detailAccess])

  return (
    <div className="flex items-center gap-1.5">
      {/* Shortlist toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleShortlist}
        disabled={shortlistPending}
        className="h-8 w-8 p-0"
        aria-label={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
      >
        <Heart className={cn(
          'h-4 w-4 transition-colors',
          isShortlisted ? 'text-international-orange fill-current' : 'text-muted-foreground'
        )} />
      </Button>

      {/* Alert toggle (starter+) */}
      {access.detailAccess ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleAlert}
          disabled={alertPending}
          className="h-8 w-8 p-0"
          aria-label={isAlerted ? 'Disable alerts' : 'Enable alerts'}
        >
          {isAlerted ? (
            <Bell className="h-4 w-4 text-international-orange" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      ) : null}

      {/* Outreach button (professional+) */}
      {access.intelligenceAccess ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setShowOutreach(true)}>
          <Mail className="h-3.5 w-3.5" />
          Draft Outreach
        </Button>
      ) : access.detailAccess ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" disabled>
          <Lock className="h-3 w-3" />
          <Mail className="h-3.5 w-3.5" />
          Pro
        </Button>
      ) : null}

      {/* Outreach dialog */}
      <OutreachDraftDialog
        open={showOutreach}
        onOpenChange={setShowOutreach}
        listingId={listingId}
        firmName={firmName ?? 'this investor'}
      />
    </div>
  )
}
