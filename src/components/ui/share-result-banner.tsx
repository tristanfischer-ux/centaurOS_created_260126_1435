/**
 * @file Share Result Banner Component
 *
 * @description Dismissable banner shown after positive moments (e.g., assessment
 * complete, specialist chat milestone) to nudge users to share with their network.
 * NOT a modal — sits inline at the bottom of the content area.
 *
 * Will be wired into CAD lab assessments and specialist chats in a future pass.
 *
 * @component
 *
 * @example
 * <ShareResultBanner
 *   title="Assessment Complete"
 *   subtitle="Share this with your co-founder"
 *   referralCode="abc123"
 * />
 */

'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Share2, Copy, Check, X } from 'lucide-react'

interface ShareResultBannerProps {
  /** Headline for the banner (e.g., "Assessment Complete") */
  title: string
  /** Supporting text (e.g., "Share this with your co-founder") */
  subtitle: string
  /** Referral code for the share URL. If null, copies the base share URL without ref param. */
  referralCode: string | null
  /** Optional branded share URL. Defaults to `{origin}/join?ref={referralCode}` */
  shareUrl?: string
}

/**
 * ShareResultBanner — subtle inline banner for post-achievement sharing.
 *
 * @description A dismissable card with a share icon, title/subtitle,
 * and a "Copy Link" button. Sits at the bottom of a content area.
 * Disappears when the user clicks the dismiss button.
 */
export function ShareResultBanner({
  title,
  subtitle,
  referralCode,
  shareUrl,
}: ShareResultBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (dismissed) return null

  function handleCopyLink() {
    const url =
      shareUrl ??
      (referralCode
        ? `${window.location.origin}/join?ref=${referralCode}`
        : window.location.href)

    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Card className="border-border bg-muted/30">
      <CardContent className="py-4 px-5">
        <div className="flex items-center gap-4">
          {/* Share icon */}
          <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center shrink-0">
            <Share2 className="h-5 w-5 text-international-orange" />
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>

          {/* Copy link button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5 text-status-success" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy Link
              </>
            )}
          </Button>

          {/* Dismiss button */}
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Dismiss share banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
