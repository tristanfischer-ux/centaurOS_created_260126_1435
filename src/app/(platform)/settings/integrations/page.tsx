import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
    getSheetsIntegration,
    getSyncStatus,
    getGoogleConnectionStatus,
    getMicrosoftConnectionStatus,
} from '@/actions/sheets-sync'
import { SheetsConfigForm } from './sheets-config-form'

/**
 * Integrations settings page.
 *
 * @description Admin-only page where Founders/Executives configure
 * spreadsheet sync with Google Sheets or Microsoft Excel.
 * Shows two provider cards side by side.
 *
 * @security Only visible to Founders and Executives (enforced by server actions).
 */
export default async function IntegrationsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const [
        googleConfig,
        googleStatus,
        googleConnection,
        microsoftConfig,
        microsoftStatus,
        microsoftConnection,
    ] = await Promise.all([
        getSheetsIntegration('google_sheets'),
        getSyncStatus('google_sheets'),
        getGoogleConnectionStatus(),
        getSheetsIntegration('microsoft_excel'),
        getSyncStatus('microsoft_excel'),
        getMicrosoftConnectionStatus(),
    ])

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Connect ForgeOS to Google Sheets or Microsoft Excel so your team can edit tasks in a spreadsheet.
                    Changes sync back automatically every few minutes.
                </p>
            </div>

            <SheetsConfigForm
                googleConfig={googleConfig.config}
                googleStatus={googleStatus.status}
                googleConnection={googleConnection}
                microsoftConfig={microsoftConfig.config}
                microsoftStatus={microsoftStatus.status}
                microsoftConnection={microsoftConnection}
            />
        </div>
    )
}
