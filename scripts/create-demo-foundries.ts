/**
 * Create foundry records for demo accounts
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

const DEMO_FOUNDRIES = [
  { id: 'demo-foundry-founder', name: 'Demo Founder Foundry', slug: 'demo-founder' },
  { id: 'demo-foundry-executive', name: 'Demo Executive Foundry', slug: 'demo-executive' },
  { id: 'demo-foundry-apprentice', name: 'Demo Apprentice Foundry', slug: 'demo-apprentice' },
  { id: 'demo-foundry-vc', name: 'Demo VC Foundry', slug: 'demo-vc' },
  { id: 'demo-foundry-supplier', name: 'Demo Supplier Foundry', slug: 'demo-supplier' },
  { id: 'demo-foundry-university', name: 'Demo University Foundry', slug: 'demo-university' }
]

async function createDemoFoundries() {
  console.log('🏭 Creating demo foundries...\n')
  
  for (const foundry of DEMO_FOUNDRIES) {
    console.log(`Creating ${foundry.name}`)
    
    // Check if it exists
    const { data: existing } = await supabase
      .from('foundries')
      .select('id')
      .eq('id', foundry.id)
      .single()
    
    if (existing) {
      console.log(`  ⏭️  Foundry already exists\n`)
      continue
    }
    
    // Create it
    const { error } = await supabase
      .from('foundries')
      .insert({
        id: foundry.id,
        name: foundry.name,
        slug: foundry.slug,
        industry: 'Technology',
        stage: 'Demo'
      })
    
    if (error) {
      console.log(`  ❌ Error: ${error.message}\n`)
    } else {
      console.log(`  ✅ Created\n`)
    }
  }
  
  console.log('✨ Done!')
}

createDemoFoundries()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
