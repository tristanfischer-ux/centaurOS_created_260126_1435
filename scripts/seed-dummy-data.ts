import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const FOUNDRY_ID = 'foundry-demo'

async function createUser(email: string, fullName: string, role: 'Founder' | 'Executive' | 'Apprentice') {
    console.log(`👤 Processing User: ${email} (${role})...`)
    let userId

    // Check if exists
    const { data: users } = await supabase.auth.admin.listUsers()
    const existingUser = users.users.find(u => u.email === email)

    if (existingUser) {
        console.log(`   - User already exists: ${existingUser.id}`)
        userId = existingUser.id
    } else {
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password: 'password123',
            email_confirm: true,
            user_metadata: { full_name: fullName }
        })
        if (error) {
            console.error(`   ❌ Error creating auth user: ${error.message}`)
            return null
        }
        userId = data.user.id
        console.log(`   ✅ Created Auth User: ${userId}`)
    }

    // Upsert Profile
    const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId,
        email,
        full_name: fullName,
        role, // Matches the ENUM we just updated
        foundry_id: FOUNDRY_ID,
        updated_at: new Date().toISOString()
    })

    if (profileError) {
        console.error(`   ❌ Error updating profile: ${profileError.message}`)
    } else {
        console.log(`   ✅ Profile Synced`)
    }

    return userId
}

async function seed() {
    console.log('🌱 Starting Seed...')

    // 1. Create Users
    const founderId = await createUser('founder@centauros.app', 'Alice Founder', 'Founder')
    const execId = await createUser('executive@centauros.app', 'Bob Executive', 'Executive')
    const apprenticeId = await createUser('apprentice@centauros.app', 'Charlie Apprentice', 'Apprentice')

    if (!founderId || !execId || !apprenticeId) {
        console.error('❌ Failed to create all users. Aborting.')
        return
    }

    // 2. Create Objectives (10)
    console.log('🎯 Creating 10 Objectives...')
    const objectivesData = Array.from({ length: 10 }).map((_, i) => ({
        id: uuidv4(),
        title: `Strategic Objective ${i + 1}: ${['Expand Market', 'Reduce Churn', 'Launch Product X', 'Optimize Ops', 'Hire Talent'][i % 5]}`,
        description: 'A key high-level goal for Q1/Q2.',
        status: ['In Progress', 'Not Started', 'Completed'][i % 3],
        progress: Math.floor(Math.random() * 100),
        creator_id: founderId,
        foundry_id: FOUNDRY_ID,
        created_at: new Date().toISOString()
    }))

    const { error: objError } = await supabase.from('objectives').insert(objectivesData)
    if (objError) console.error('Error creating objectives:', objError)
    else console.log('✅ Objectives Created')

    const objectiveIds = objectivesData.map(o => o.id)

    // 3. Create Tasks (20)
    console.log('✅ Creating 20 Tasks...')
    const tasksData = Array.from({ length: 20 }).map((_, i) => ({
        title: `Task ${i + 1}: ${['Draft Proposal', 'Review Legal Docs', 'Update Website', 'Client Meeting', 'Prepare Financials'][i % 5]}`,
        description: 'Specific actionable item needed for the objective.',
        status: ['Pending', 'Accepted', 'Rejected', 'Amended'][i % 4],
        creator_id: i % 2 === 0 ? founderId : execId, // Mixed creators
        assignee_id: i % 3 === 0 ? apprenticeId : (i % 3 === 1 ? execId : null), // Mixed assignees
        objective_id: objectiveIds[i % objectiveIds.length],
        foundry_id: FOUNDRY_ID,
        start_date: new Date().toISOString(),
        created_at: new Date().toISOString()
    }))

    // @ts-ignore - casting issues with ENUMs sometimes in seed scripts
    const { error: taskError } = await supabase.from('tasks').insert(tasksData)
    if (taskError) console.error('Error creating tasks:', taskError)
    else console.log('✅ Tasks Created')

    console.log('\n🎉 Seed Complete!')
    console.log('-----------------------------------')
    console.log('Founder:    founder@centauros.app  / password123')
    console.log('Executive:  executive@centauros.app / password123')
    console.log('Apprentice: apprentice@centauros.app / password123')
    console.log('-----------------------------------')
}

seed()
