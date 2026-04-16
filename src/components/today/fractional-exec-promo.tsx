'use client'

/**
 * @file fractional-exec-promo.tsx — "Make yourself available" card.
 *
 * Shown on /today when the user has completed onboarding but has
 * is_fractional_executive=false. Clicking "Yes, list me" flips the
 * flag; on reload, the profile-completion-wizard fires to collect
 * headline / bio / day rate. Clicking "Not now" dismisses the card
 * for the session (not persisted — they'll see it again next visit).
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Users, X } from 'lucide-react'
import { setOptInFlags } from '@/actions/onboarding'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Props {
  /** Controls initial visibility. Pass false if the user has already opted in. */
  visible: boolean
}

export function FractionalExecPromoCard({ visible }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (!visible || dismissed) return null

  const handleOptIn = () => {
    startTransition(async () => {
      const result = await setOptInFlags({ is_fractional_executive: true })
      if ('success' in result) {
        toast.success('Added. Next up: a short profile wizard to fill in your listing details.')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card className="border-international-orange/30 bg-international-orange/5">
      <CardContent className="p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Users className="w-5 h-5 text-international-orange" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              List yourself as a fractional executive
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Add a public profile so other companies on ForgeOS can find and
              engage you. You set your day rate. You can opt out from your
              profile at any time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleOptIn}
              disabled={pending}
              size="sm"
              className="bg-international-orange hover:bg-international-orange/90 text-white"
            >
              {pending ? 'Saving…' : 'Yes, list me'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              disabled={pending}
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </CardContent>
    </Card>
  )
}
