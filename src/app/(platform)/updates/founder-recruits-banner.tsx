'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Users, ArrowRight, X } from 'lucide-react'

/**
 * Banner shown to Founders on the Updates page directing them to the Recruits
 * section to find Executives and Apprentices for their team.
 *
 * @description Dismissible via local state. Not persisted — will reappear on
 * page reload during the trial period, which is acceptable since the trial
 * is short-lived.
 */
export function FounderRecruitsBanner(): React.ReactElement | null {
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed) return null

  return (
    <Card className="border-international-orange/20 bg-international-orange/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-international-orange" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Build your team from the Recruits marketplace
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Browse Executives and Apprentices who have joined ForgeOS, then invite them
              to your company with one click.
            </p>
            <Button asChild size="sm" className="gap-2">
              <Link href="/recruits">
                Browse Recruits
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <button
            onClick={() => setIsDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
