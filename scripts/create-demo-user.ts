import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function createDemoUser() {
    console.log('👤 Creating Demo User...')
    const email = 'demo@centauros.app'
    const password = 'password123'

    // 1. Create OR Fetch Auth User
    let userId;
    const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Demo Executive' }
    })

    if (createError && createError.message.includes('already been registered')) {
        console.log('ℹ️ User already exists, fetching ID...')
        // Admin getUser by email is not directly available in all versions, but listUsers is
        const { data: users } = await supabase.auth.admin.listUsers()
        const existingUser = users.users.find(u => u.email === email)
        if (existingUser) {
            userId = existingUser.id
            console.log(`✅ Found User ID: ${userId}`)
        } else {
            console.error('❌ Could not find existing user ID')
            return
        }
    } else if (createdData.user) {
        userId = createdData.user.id
        console.log(`✅ Auth User Created: ${email}`)
    }

    // 2. Ensure Profile exists
    if (userId) {
        // Check if profile exists
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()

        if (!profile) {
            console.log('Creating Public Profile...')
            const { error: profileError } = await supabase.from('profiles').insert({
                id: userId,
                email: email,
                full_name: 'Demo Executive',
                role: 'Executive', // Admin role
                foundry_id: 'foundry-demo',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            if (profileError) console.error('Profile Error:', profileError)
            else console.log('✅ Public Profile Created')
        } else {
            console.log('ℹ️ Public Profile already exists')
        }
    }

    // ---------------------------------------------------------
    // 3. Create Alice (Apprentice)
    // ---------------------------------------------------------
    console.log('👤 Creating Apprentice User (Alice)...')
    const aliceEmail = 'alice@centauros.app'
    let aliceId;

    const { data: aliceData, error: aliceCreateError } = await supabase.auth.admin.createUser({
        email: aliceEmail,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: 'Alice Apprentice' }
    })

    if (aliceCreateError && aliceCreateError.message.includes('already been registered')) {
        console.log('ℹ️ Alice already exists, fetching ID...')
        const { data: users } = await supabase.auth.admin.listUsers()
        const existingAlice = users.users.find(u => u.email === aliceEmail)
        if (existingAlice) aliceId = existingAlice.id
    } else if (aliceData.user) {
        aliceId = aliceData.user.id
        console.log(`✅ Auth User Created: ${aliceEmail}`)
    }

    if (aliceId) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', aliceId).single()
        if (!profile) {
            await supabase.from('profiles').insert({
                id: aliceId,
                email: aliceEmail,
                full_name: 'Alice Apprentice',
                role: 'Apprentice',
                foundry_id: 'foundry-demo', // Same foundry!
                created_at: new Date().toISOString()
            })
            console.log('✅ Alice Profile Created')
        } else {
            console.log('ℹ️ Alice Profile already exists')
        }
    }
}

createDemoUser()
