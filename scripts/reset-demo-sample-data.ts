/**
 * Delete and recreate sample data for demo accounts
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
  'demo.founder@fractionalforge.app',
  'demo.executive@fractionalforge.app',
  'demo.apprentice@fractionalforge.app'
]

async function resetDemoData() {
  console.log('🗑️  Deleting existing demo data...\n')
  
  for (const email of DEMO_EMAILS) {
    // Get user
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users?.find(u => u.email === email)
    
    if (!authUser) continue
    
    console.log(`Deleting data for ${email}`)
    
    // Delete objectives (cascades to tasks)
    const { error } = await supabase
      .from('objectives')
      .delete()
      .eq('creator_id', authUser.id)
    
    if (error) {
      console.log(`  ⚠️  ${error.message}`)
    } else {
      console.log(`  ✅ Deleted objectives and tasks`)
    }
  }
  
  console.log('\n✨ Reset complete!')
}

resetDemoData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
