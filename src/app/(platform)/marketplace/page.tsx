import { createClient } from '@/lib/supabase/server'
import { MarketplaceView } from './marketplace-view'

// Force dynamic since we're fetching data that might change
export const dynamic = 'force-dynamic'

export default async function MarketplacePage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    // Parallel fetch for speed
    const [providersResult, aiToolsResult, rfqsResult, profileResult] = await Promise.all([
        supabase.from('service_providers').select('*').eq('is_verified', true),
        supabase.from('ai_tools').select('*'),
        supabase.from('manufacturing_rfqs').select('*').limit(5),
        user ? supabase.from('profiles').select('foundry_id').eq('id', user.id).single() : Promise.resolve({ data: null })
    ])

    const stackProviders: Set<string> = new Set()

    if (profileResult.data?.foundry_id) {
        const { data: stack } = await supabase
            .from('foundry_stack')
            .select('provider_id')
            .eq('foundry_id', profileResult.data.foundry_id)

        if (stack) {
            stack.forEach(item => {
                if (item.provider_id) stackProviders.add(item.provider_id)
            })
        }
    }

    const providers = providersResult.data || []
    const aiTools = aiToolsResult.data || []
    const rfqs = rfqsResult.data || []

    return (
        <MarketplaceView
            providers={providers}
            aiTools={aiTools}
            rfqs={rfqs}
            initialStack={Array.from(stackProviders)}
        />
    )
}
