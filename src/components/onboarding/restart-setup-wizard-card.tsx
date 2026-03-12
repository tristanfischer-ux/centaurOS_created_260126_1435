'use client'

/**
 * @file restart-setup-wizard-card.tsx
 *
 * @description Settings card that allows users to restart the setup wizard.
 * Resets the onboarding flag and navigates to /today where the wizard
 * auto-triggers.
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { resetSetupWizard } from '@/actions/setup-wizard'

/**
 * RestartSetupWizardCard — settings card to re-run the onboarding wizard.
 */
export function RestartSetupWizardCard() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleRestart = () => {
    startTransition(async () => {
      const result = await resetSetupWizard()
      if ('success' in result) {
        router.push('/today')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-international-orange" />
          <CardTitle>Setup Wizard</CardTitle>
        </div>
        <CardDescription>
          Re-run the onboarding wizard to update your foundry&apos;s mission, team, or first objective.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={handleRestart} disabled={isPending}>
          {isPending ? 'Restarting...' : 'Restart Setup Wizard'}
        </Button>
      </CardContent>
    </Card>
  )
}
