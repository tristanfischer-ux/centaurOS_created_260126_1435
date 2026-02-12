import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CompanyProfileCard } from '@/components/settings/company-profile-card'
import { AIProviders } from '@/components/settings/ai-providers'
import { GoogleWorkspaceSettings } from '@/components/settings/google-workspace-settings'
import { IntegrationSetupGuide } from '@/components/settings/integration-setup-guide'
import { CompanyDataExport } from '@/components/settings/company-data-export'
import { TeamManagementCard } from '@/components/settings/team-management-card'
import { getGoogleConnectionStatus } from '@/actions/google-workspace'
import type { CompanyProfile } from '@/types/foundry'
import { ShieldAlert } from 'lucide-react'

interface CompanySettingsPageProps {
    searchParams: Promise<{ error?: string; success?: string }>
}

/**
 * Checks whether required environment variables are configured for integrations.
 */
function getIntegrationConfigStatus(): { isGoogleConfigured: boolean; isResendConfigured: boolean } {
    return {
        isGoogleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        isResendConfigured: Boolean(process.env.RESEND_API_KEY),
    }
}

/**
 * Company Settings Page
 * 
 * @description Company-wide configuration accessible only to Founders and Executives.
 * Includes company profile, AI providers, integrations, data export, and team management.
 * 
 * @security Access restricted to Founder/Executive roles only.
 */
export default async function CompanySettingsPage({ searchParams }: CompanySettingsPageProps) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // AUTH: Check for Founder or Executive role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, foundry_id')
        .eq('id', user.id)
        .single()

    const isCompanyAdmin = profile?.role === 'Founder' || profile?.role === 'Executive'

    if (!isCompanyAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
                <div className="p-4 rounded-full bg-status-error-light mb-4">
                    <ShieldAlert className="h-12 w-12 text-destructive" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                    Access Denied
                </h2>
                <p className="text-muted-foreground max-w-md">
                    Company settings are only accessible to Founders and Executives.
                    Contact your company administrator if you need access.
                </p>
            </div>
        )
    }

    // Fetch company profile data
    let companyProfile: CompanyProfile | null = null
    if (profile?.foundry_id) {
        const { data: foundryData } = await supabase.rpc('ensure_foundry_exists', {
            p_foundry_id: profile.foundry_id,
        })
        companyProfile = (foundryData as { company_profile?: CompanyProfile | null })?.company_profile ?? null
    }

    // Fetch team member count
    let memberCount = 0
    if (profile?.foundry_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await supabase
            .from('foundry_memberships')
            .select('*', { count: 'exact', head: true })
            .eq('foundry_id', profile.foundry_id)
        memberCount = count || 0
    }

    // Fetch Google Workspace integration status
    const params = await searchParams
    const { status: googleStatus } = await getGoogleConnectionStatus()
    const configStatus = getIntegrationConfigStatus()

    const isFounder = profile?.role === 'Founder'

    return (
        <div className="space-y-6">
            <CompanyProfileCard
                companyProfile={companyProfile}
                foundryId={profile?.foundry_id || ''}
                userId={user.id}
                isFounder={isFounder}
            />

            {/* SECURITY: AI Provider API keys are Founder-only (sensitive credentials) */}
            {isFounder && <AIProviders />}

            {/* Integrations Section */}
            <div className="space-y-6">
                {/* SECURITY: Integration setup (env vars, Google Cloud Console) is Founder-only */}
                {isFounder && (
                    <IntegrationSetupGuide
                        isGoogleConfigured={configStatus.isGoogleConfigured}
                        isResendConfigured={configStatus.isResendConfigured}
                    />
                )}

                {configStatus.isGoogleConfigured && googleStatus && (
                    <GoogleWorkspaceSettings
                        status={googleStatus}
                        errorMessage={params.error}
                        successMessage={params.success}
                    />
                )}
            </div>

            <CompanyDataExport />

            <TeamManagementCard memberCount={memberCount} />
        </div>
    )
}
