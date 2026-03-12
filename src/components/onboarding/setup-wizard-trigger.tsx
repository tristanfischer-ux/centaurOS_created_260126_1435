'use client'

/**
 * @file setup-wizard-trigger.tsx
 *
 * @description Auto-trigger component that checks eligibility on mount and
 * renders the setup wizard if the user qualifies. Self-contained — no props
 * needed from the parent page.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { checkSetupWizardEligibility } from '@/actions/setup-wizard'

const SetupWizard = dynamic(
  () => import('./setup-wizard').then((mod) => ({ default: mod.SetupWizard })),
  { ssr: false }
)

/**
 * SetupWizardTrigger — renders the onboarding wizard if the user is eligible.
 *
 * @description Calls checkSetupWizardEligibility on mount. If the user hasn't
 * completed onboarding and the foundry is empty, shows the wizard dialog.
 */
export function SetupWizardTrigger() {
  const [wizardData, setWizardData] = useState<{
    userName: string
  } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    checkSetupWizardEligibility()
      .then((result) => {
        if (cancelled) return
        if ('shouldShow' in result && result.shouldShow) {
          setWizardData({ userName: result.userName })
        }
      })
      .catch(() => {
        // Non-critical — wizard just won't show
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!wizardData || dismissed) return null

  return (
    <SetupWizard
      userName={wizardData.userName}
      onComplete={() => setDismissed(true)}
    />
  )
}
