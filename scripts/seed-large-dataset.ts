
import { createClient } from '@supabase/supabase-js'
import { faker } from '@faker-js/faker'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing credentials in .env.local')
    console.error('Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
    console.log('🌱 Starting full-scale seed...')

    // 1. Create Foundry
    const foundryId = 'foundry-load-test'

    // 2. Create 100 Profiles
    console.log('Creating Profiles...')
    const profiles = []
    for (let i = 0; i < 100; i++) {
        profiles.push({
            id: faker.string.uuid(),
            email: faker.internet.email(),
            full_name: faker.person.fullName(),
            role: 'Apprentice',
            foundry_id: foundryId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
    }

    const { error: profileError } = await supabase.from('profiles').insert(profiles)
    if (profileError) console.error('Profile Error:', profileError)

    // 3. Create 1000 Tasks
    console.log('Creating 1000 Tasks...')
    const tasks = []
    for (let i = 0; i < 1000; i++) {
        const creator = faker.helpers.arrayElement(profiles)
        const assignee = faker.helpers.arrayElement(profiles)

        tasks.push({
            title: faker.hacker.verb() + ' ' + faker.hacker.noun(),
            description: faker.lorem.paragraph(),
            foundry_id: foundryId,
            creator_id: creator.id,
            assignee_id: assignee.id,
            status: 'Pending',
            start_date: faker.date.recent().toISOString(),
            end_date: faker.date.future().toISOString(),
            objective_id: null // Skipping for speed
        })
    }

    // Insert in chunks
    const chunkSize = 100
    for (let i = 0; i < tasks.length; i += chunkSize) {
        const chunk = tasks.slice(i, i + chunkSize)
        const { error } = await supabase.from('tasks').insert(chunk)
        if (error) console.error('Task Insert Error:', error)
        process.stdout.write('.')
    }

    console.log('\n✅ Seed complete. 100 Profiles, 1000 Tasks created.')
}

seed()
