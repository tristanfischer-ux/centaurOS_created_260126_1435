import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMarketplaceListings } from '@/actions/marketplace'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getMarketplaceOnboardingStatus } from '@/actions/onboarding'

export async function GET() {
    const results: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        tests: {}
    }

    // Test 1: Can we create a Supabase client?
    try {
        const supabase = await createClient()
        results.tests = { ...results.tests as object, createClient: 'OK' }
        
        // Test 2: Can we get the user?
        try {
            const { data: { user }, error } = await supabase.auth.getUser()
            results.tests = { 
                ...results.tests as object, 
                getUser: error ? `ERROR: ${error.message}` : (user ? `OK: ${user.id}` : 'No user')
            }
        } catch (err) {
            results.tests = { ...results.tests as object, getUser: `EXCEPTION: ${err}` }
        }

        // Test 3: Can we get foundry ID?
        try {
            const foundryId = await getFoundryIdCached()
            results.tests = { ...results.tests as object, foundryId: foundryId || 'null' }
        } catch (err) {
            results.tests = { ...results.tests as object, foundryId: `EXCEPTION: ${err}` }
        }

        // Test 4: Can we fetch marketplace listings?
        try {
            const listings = await getMarketplaceListings()
            results.tests = { ...results.tests as object, listings: `OK: ${listings.length} listings` }
        } catch (err) {
            results.tests = { ...results.tests as object, listings: `EXCEPTION: ${err}` }
        }

        // Test 5: Can we check onboarding status?
        try {
            const status = await getMarketplaceOnboardingStatus()
            results.tests = { ...results.tests as object, onboarding: status }
        } catch (err) {
            results.tests = { ...results.tests as object, onboarding: `EXCEPTION: ${err}` }
        }

        // Test 6: Direct query to marketplace_listings
        try {
            const { data, error, count } = await supabase
                .from('marketplace_listings')
                .select('*', { count: 'exact' })
                .limit(3)
            
            if (error) {
                results.tests = { ...results.tests as object, directQuery: `ERROR: ${error.message}` }
            } else {
                results.tests = { 
                    ...results.tests as object, 
                    directQuery: `OK: ${count} total, got ${data?.length || 0}`
                }
            }
        } catch (err) {
            results.tests = { ...results.tests as object, directQuery: `EXCEPTION: ${err}` }
        }

    } catch (err) {
        results.tests = { ...results.tests as object, createClient: `EXCEPTION: ${err}` }
    }

    return NextResponse.json(results)
}
