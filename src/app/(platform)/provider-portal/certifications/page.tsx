// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCertifications, getMyProviderProfile } from '@/actions/trust-signals'
import { CertificationsView } from './certifications-view'

export default async function CertificationsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check if user has a provider profile
    const { data: providerProfile, error: profileError } = await getMyProviderProfile()
    
    if (profileError || !providerProfile) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold tracking-tight">Certifications</h1>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                    <h2 className="text-lg font-semibold text-amber-900 mb-2">
                        Provider Profile Required
                    </h2>
                    <p className="text-amber-700">
                        You need to set up your provider profile before managing your certifications.
                        Please complete your provider onboarding first.
                    </p>
                </div>
            </div>
        )
    }

    // Fetch certifications
    const { data: certifications, error: certError } = await getCertifications()

    return (
        <CertificationsView 
            certifications={certifications}
            error={certError}
        />
    )
}
