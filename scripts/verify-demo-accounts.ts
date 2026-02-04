/**
 * Verify and fix demo account profiles
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

const DEMO_EMAILS = [
  'demo.founder@forgeos.io',
  'demo.executive@forgeos.io',
  'demo.apprentice@forgeos.io',
  'demo.vc@forgeos.io',
  'demo.supplier@forgeos.io',
  'demo.university@forgeos.io'
]

async function verifyAndFixDemoAccounts() {
  console.log('🔍 Checking demo accounts...\n')

  for (const email of DEMO_EMAILS) {
    console.log(`Checking ${email}`)
    
    // Get user from auth
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users?.find(u => u.email === email)
    
    if (!authUser) {
      console.log(`  ❌ Auth user not found\n`)
      continue
    }
    
    console.log(`  ✅ Auth user exists: ${authUser.id}`)
    
    // Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', authUser.id)
      .single()
    
    if (profileError || !profile) {
      console.log(`  ⚠️  Profile missing - creating...`)
      
      // Determine role and foundry based on demo role
      const demoRole = authUser.user_metadata.demo_role || 'founder'
      const role = demoRole === 'vc' ? 'Executive' : 
                   demoRole === 'supplier' ? 'Apprentice' :
                   demoRole === 'university' ? 'Executive' :
                   demoRole === 'founder' ? 'Founder' :
                   demoRole === 'executive' ? 'Executive' :
                   'Apprentice' // apprentice and any others
      
      // Use correct system foundry IDs
      const foundryId = demoRole === 'supplier' ? 'centaur-suppliers' : 'centaur-guild'
      const accountType = demoRole === 'supplier' ? 'supplier' : 'team_builder'
      
      // Create profile with correct foundry_id
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata.full_name || 'Demo User',
          role: role,
          foundry_id: foundryId,
          account_type: accountType
        })
      
      if (insertError) {
        console.log(`  ❌ Error creating profile: ${insertError.message}`)
      } else {
        console.log(`  ✅ Profile created`)
      }
    } else {
      console.log(`  ✅ Profile exists: ${profile.full_name} (${profile.role})`)
    }
    
    console.log('')
  }
  
  console.log('✨ Verification complete!')
}

verifyAndFixDemoAccounts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
