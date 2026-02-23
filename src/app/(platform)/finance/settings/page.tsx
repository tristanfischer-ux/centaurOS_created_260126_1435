/**
 * @file page.tsx — Finance alert settings page
 *
 * @description Allows users to configure financial alert thresholds,
 * notification types, and digest frequency.
 */

import type { Metadata } from 'next'
import { AlertPreferences } from '@/components/finance/alert-preferences'

export const metadata: Metadata = {
  title: 'Alert Settings | Finance | ForgeOS',
  description: 'Configure financial alert thresholds and notification preferences',
}

export default function FinanceSettingsPage(): React.ReactNode {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Alert Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure which financial events trigger notifications and set custom thresholds.
        </p>
      </div>
      <AlertPreferences />
    </div>
  )
}
