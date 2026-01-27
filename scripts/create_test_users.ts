
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local')
    process.exit(1)
}

// Create Supabase Admin Client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

const TEST_foundry_id = 'test-foundry-001'

const TEST_USERS = [
    {
        email: 'founder@centauros.ai',
        password: 'centaurOS2026!',
        full_name: 'Test Founder',
        role: 'Founder'
    },
    {
        email: 'executive@centauros.ai',
        password: 'centaurOS2026!',
        full_name: 'Test Executive',
        role: 'Executive'
    },
    {
        email: 'apprentice@centauros.ai',
        password: 'centaurOS2026!',
        full_name: 'Test Apprentice',
        role: 'Apprentice'
    }
]

async function main() {
    console.log('🚀 Starting Test User Setup...')
    console.log(`Target Foundry ID: ${TEST_foundry_id}`)

    for (const user of TEST_USERS) {
        console.log(`\nProcessing: ${user.email} (${user.role})`)

        // 1. Check if user exists in Auth
        // Note: listUsers isn't always efficient for checking one, but simple for scripts. 
        // Better: Try to sign in or get user by email if possible, but Admin API allows creating/updating.

        // We'll try to create the user directly. If it exists, we'll get an error, then we update it.
        let userId: string | null = null;

        const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: { full_name: user.full_name }
        })

        if (createError) {
            // If user already exists, we need to find their ID
            if (createError.message.includes('already been registered')) {
                console.log(`  ℹ️ User already exists in Auth. Fetching ID...`)
                // List users to find the ID (limitations apply, but fine for test script)
                const { data: users, error: listError } = await supabase.auth.admin.listUsers()
                if (listError) {
                    console.error('  ❌ Failed to list users:', listError.message)
                    continue
                }
                const existingUser = users.users.find(u => u.email === user.email)
                if (existingUser) {
                    userId = existingUser.id
                    console.log(`  ✅ Found existing Auth ID: ${userId}`)
                    // Optionally update password to ensure it matches
                    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
                        password: user.password
                    })
                    if (updateError) console.warn('  ⚠️ Failed to ensure password:', updateError.message)
                    else console.log('  ✅ Password verified/updated')

                } else {
                    console.error('  ❌ Could not find user in list even though create failed.')
                    continue
                }
            } else {
                console.error(`  ❌ Failed to create auth user: ${createError.message}`)
                continue
            }
        } else {
            userId = createdUser.user.id
            console.log(`  ✅ Created new Auth user: ${userId}`)
        }

        if (!userId) continue

        // 2. Upsert Profile in public table
        // verify the role is valid valid enum type before sending? DB will reject if not.

        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                foundry_id: TEST_foundry_id,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' })

        if (profileError) {
            console.error(`  ❌ Failed to upsert profile:`, profileError.message)
        } else {
            console.log(`  ✅ Profile synced successfully!`)
        }
    }

    console.log('\n🎉 Test User Setup Complete!')
}

main().catch(console.error)
