/**
 * Integrations Settings Page
 *
 * @description Displays all external service integrations (Google Workspace,
 * Telegram, Google Sheets) with their connection status and configuration.
 * Shows setup instructions when integrations are not yet configured.
 *
 * @security Requires authenticated user with active foundry
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGoogleConnectionStatus } from '@/actions/google-workspace'
import { GoogleWorkspaceSettings } from '@/components/settings/google-workspace-settings'
import { IntegrationSetupGuide } from '@/components/settings/integration-setup-guide'

interface IntegrationsPageProps {
    searchParams: Promise<{ error?: string; success?: string }>
}

/**
 * Checks whether required environment variables are configured for each integration.
 *
 * @returns Object indicating which integrations have their env vars set
 */
function getIntegrationConfigStatus(): { isGoogleConfigured: boolean; isResendConfigured: boolean } {
    return {
        isGoogleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        isResendConfigured: Boolean(process.env.RESEND_API_KEY),
    }
}

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const params = await searchParams
    const { status } = await getGoogleConnectionStatus()
    const configStatus = getIntegrationConfigStatus()

    return (
        <div className="space-y-6">
            {/* Setup Guide - shows when env vars are missing */}
            <IntegrationSetupGuide
                isGoogleConfigured={configStatus.isGoogleConfigured}
                isResendConfigured={configStatus.isResendConfigured}
            />

            {/* Google Workspace - only shows when Google env vars are configured */}
            {configStatus.isGoogleConfigured && status && (
                <GoogleWorkspaceSettings
                    status={status}
                    errorMessage={params.error}
                    successMessage={params.success}
                />
            )}
        </div>
    )
}
