
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or Service Key in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function verifyMarketplace() {
    console.log('Verifying Marketplace Listings...')

    const { count, error } = await supabase
        .from('marketplace_listings')
        .select('*', { count: 'exact', head: true })

    if (error) {
        console.error('Error querying marketplace_listings:', error)
        process.exit(1)
    }

    console.log(`Found ${count} listings in the marketplace.`)

    if (count === 39) {
        console.log('✅ SUCCESS: Seed data count matches expected (39).')
    } else {
        console.log('⚠️ WARNING: Count differs from expected 39. Did you run the seed file?')
    }
}

verifyMarketplace()
