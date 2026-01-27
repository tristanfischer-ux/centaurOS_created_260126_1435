import { createClient } from '@/lib/supabase/server'
import { MarketplaceView } from './marketplace-view'

// Force dynamic since we're fetching data that might change
export const dynamic = 'force-dynamic'

export default async function MarketplacePage() {
    const supabase = await createClient()

    // Parallel fetch for speed
    const [providersResult, aiToolsResult, rfqsResult] = await Promise.all([
        supabase.from('service_providers').select('*').eq('is_verified', true),
        supabase.from('ai_tools').select('*'),
        supabase.from('manufacturing_rfqs').select('*').limit(5)
    ])

    const providers = providersResult.data || []
    const aiTools = aiToolsResult.data || []
    const rfqs = rfqsResult.data || []

    return (
        <MarketplaceView
            providers={providers}
            aiTools={aiTools}
            rfqs={rfqs}
        />
    )
}
