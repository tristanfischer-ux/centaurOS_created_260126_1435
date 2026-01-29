import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPortfolioItems, getMyProviderProfile } from '@/actions/trust-signals'
import { PortfolioManagementView } from './portfolio-view'

export default async function PortfolioPage() {
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
                <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                    <h2 className="text-lg font-semibold text-amber-900 mb-2">
                        Provider Profile Required
                    </h2>
                    <p className="text-amber-700">
                        You need to set up your provider profile before managing your portfolio.
                        Please complete your provider onboarding first.
                    </p>
                </div>
            </div>
        )
    }

    // Fetch portfolio items
    const { data: portfolioItems, error: portfolioError } = await getPortfolioItems()

    return (
        <PortfolioManagementView 
            items={portfolioItems}
            error={portfolioError}
        />
    )
}
