import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase URL or Service Key in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Expected seed data from migration
const EXPECTED_PACKS = [
    {
        title: 'Launch MVP',
        description: 'Standard startup launch protocol with AI support.',
        category: 'Product',
        difficulty: 'Hard',
        estimated_duration: '4 Weeks',
        icon_name: 'Rocket',
        expectedItems: 3,
        expectedItemTitles: ['Market Research', 'Define User Stories', 'Initial Deployment']
    },
    {
        title: 'Content Marketing Sprint',
        description: 'Generate 1 month of content in 3 days.',
        category: 'Marketing',
        difficulty: 'Medium',
        estimated_duration: '3 Days',
        icon_name: 'Pencil',
        expectedItems: 3,
        expectedItemTitles: ['Keyword Research', 'Draft Blog Posts', 'Review and Publish']
    }
]

async function verifyObjectivePacks() {
    console.log('🔍 Verifying Objective Packs...\n')

    // 1. Check if tables exist and get pack count
    const { data: packs, error: packsError } = await supabase
        .from('objective_packs')
        .select('*')
        .order('title')

    if (packsError) {
        console.error('❌ Error querying objective_packs:', packsError)
        console.error('   This might mean:')
        console.error('   - The migration has not been run')
        console.error('   - The table does not exist')
        console.error('   - There is a connection issue')
        process.exit(1)
    }

    console.log(`📦 Found ${packs?.length || 0} objective pack(s) in database\n`)

    if (!packs || packs.length === 0) {
        console.log('⚠️  WARNING: No packs found!')
        console.log('   The migration may not have been run, or the seed data was not inserted.')
        console.log('   Run the migration: supabase/migrations/20260127110000_add_objective_packs.sql')
        process.exit(1)
    }

    // 2. Verify each expected pack exists
    let allPacksValid = true
    for (const expectedPack of EXPECTED_PACKS) {
        const foundPack = packs.find(p => p.title === expectedPack.title)
        
        if (!foundPack) {
            console.log(`❌ Missing pack: "${expectedPack.title}"`)
            allPacksValid = false
            continue
        }

        console.log(`✅ Found pack: "${foundPack.title}"`)
        console.log(`   ID: ${foundPack.id}`)
        console.log(`   Category: ${foundPack.category}`)
        console.log(`   Difficulty: ${foundPack.difficulty}`)
        console.log(`   Duration: ${foundPack.estimated_duration}`)
        console.log(`   Icon: ${foundPack.icon_name}`)

        // 3. Verify pack items
        const { data: items, error: itemsError } = await supabase
            .from('pack_items')
            .select('*')
            .eq('pack_id', foundPack.id)
            .order('order_index')

        if (itemsError) {
            console.error(`   ❌ Error querying pack_items for "${foundPack.title}":`, itemsError)
            allPacksValid = false
            continue
        }

        const itemCount = items?.length || 0
        console.log(`   Items: ${itemCount} (expected ${expectedPack.expectedItems})`)

        if (itemCount !== expectedPack.expectedItems) {
            console.log(`   ⚠️  WARNING: Expected ${expectedPack.expectedItems} items, found ${itemCount}`)
            allPacksValid = false
        }

        // Verify expected item titles
        if (items && items.length > 0) {
            console.log(`   Item details:`)
            for (const item of items) {
                const isExpected = expectedPack.expectedItemTitles.includes(item.title)
                const status = isExpected ? '✅' : '⚠️'
                console.log(`     ${status} ${item.order_index}. ${item.title} (${item.role})`)
            }

            // Check for missing expected items
            const foundTitles = items.map(i => i.title)
            const missingTitles = expectedPack.expectedItemTitles.filter(
                title => !foundTitles.includes(title)
            )
            if (missingTitles.length > 0) {
                console.log(`   ⚠️  Missing expected items: ${missingTitles.join(', ')}`)
                allPacksValid = false
            }
        } else {
            console.log(`   ❌ No items found for pack "${foundPack.title}"`)
            allPacksValid = false
        }

        console.log('')
    }

    // 4. Check for unexpected packs
    const expectedTitles = EXPECTED_PACKS.map(p => p.title)
    const unexpectedPacks = packs.filter(p => !expectedTitles.includes(p.title))
    if (unexpectedPacks.length > 0) {
        console.log(`ℹ️  Found ${unexpectedPacks.length} additional pack(s) not in seed data:`)
        for (const pack of unexpectedPacks) {
            console.log(`   - "${pack.title}" (${pack.category})`)
        }
        console.log('')
    }

    // 5. Summary
    const totalItems = await supabase
        .from('pack_items')
        .select('*', { count: 'exact', head: true })

    console.log('📊 Summary:')
    console.log(`   Total packs: ${packs.length}`)
    console.log(`   Total pack items: ${totalItems.count || 0}`)
    console.log('')

    if (allPacksValid) {
        console.log('✅ SUCCESS: All expected objective packs and items are present!')
        console.log('   The seed data from the migration is correctly loaded.')
    } else {
        console.log('⚠️  WARNING: Some packs or items are missing or incorrect.')
        console.log('   Please check:')
        console.log('   1. Has the migration been run?')
        console.log('   2. Did the migration INSERT statements execute successfully?')
        console.log('   3. Are there any database errors?')
        process.exit(1)
    }
}

verifyObjectivePacks().catch((error) => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
})
