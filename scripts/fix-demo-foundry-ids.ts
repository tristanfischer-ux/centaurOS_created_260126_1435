/**
 * Fix Demo Account Foundry IDs
 * 
 * Updates existing demo accounts to have correct foundry_id values.
 * This fixes login issues caused by missing/invalid foundry_id.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Demo accounts and their correct foundry assignments
const DEMO_ACCOUNT_FOUNDRIES = [
  { email: 'demo.founder@forgeos.io', foundry_id: 'centaur-guild', account_type: 'team_builder' },
  { email: 'demo.executive@forgeos.io', foundry_id: 'centaur-guild', account_type: 'team_builder' },
  { email: 'demo.apprentice@forgeos.io', foundry_id: 'centaur-guild', account_type: 'team_builder' },
  { email: 'demo.vc@forgeos.io', foundry_id: 'centaur-guild', account_type: 'team_builder' },
  { email: 'demo.supplier@forgeos.io', foundry_id: 'centaur-suppliers', account_type: 'supplier' },
  { email: 'demo.university@forgeos.io', foundry_id: 'centaur-guild', account_type: 'team_builder' }
]

async function fixDemoFoundryIds() {
  console.log('🔧 Fixing demo account foundry IDs...\n')

  for (const account of DEMO_ACCOUNT_FOUNDRIES) {
    console.log(`Updating ${account.email}`)
    
    // Get user from auth
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users?.find(u => u.email === account.email)
    
    if (!authUser) {
      console.log(`  ⏭️  User not found, skipping\n`)
      continue
    }

    // Check current profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, foundry_id, account_type')
      .eq('id', authUser.id)
      .single()

    if (!profile) {
      console.log(`  ⚠️  No profile found - will be created on next login\n`)
      continue
    }

    console.log(`  Current foundry_id: ${profile.foundry_id || 'NULL'}`)
    console.log(`  Current account_type: ${profile.account_type || 'NULL'}`)

    // Update foundry_id and account_type
    const { error } = await supabase
      .from('profiles')
      .update({ 
        foundry_id: account.foundry_id,
        account_type: account.account_type
      })
      .eq('id', authUser.id)

    if (error) {
      console.log(`  ❌ Error: ${error.message}`)
    } else {
      console.log(`  ✅ Updated to foundry_id: ${account.foundry_id}`)
      console.log(`  ✅ Updated to account_type: ${account.account_type}`)
    }
    console.log('')
  }

  console.log('✨ Demo account fix complete!')
}

fixDemoFoundryIds()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
