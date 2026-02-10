/**
 * Create sample data for demo accounts
 * Ensures demo accounts have tasks/objectives to explore
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

const DEMO_ACCOUNTS = [
  { email: 'demo.founder@fractionalforge.app', role: 'founder' },
  { email: 'demo.executive@fractionalforge.app', role: 'executive' },
  { email: 'demo.apprentice@fractionalforge.app', role: 'apprentice' }
]

async function createSampleDataForUser(userId: string, foundryId: string, role: string) {
  console.log(`  Creating sample data for ${role}...`)
  
  // Check if they already have objectives
  const { data: existingObjectives } = await supabase
    .from('objectives')
    .select('id')
    .eq('creator_id', userId)
    .limit(1)
  
  if (existingObjectives && existingObjectives.length > 0) {
    console.log(`  ⏭️  Sample data already exists, skipping...`)
    return
  }
  
  // Create discovery objective - same for all roles
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .insert({
      title: 'Discover ForgeOS',
      description: 'Welcome! Complete these tasks to explore ForgeOS features and see how everything works. Each task guides you to a different part of the platform.',
      creator_id: userId,
      foundry_id: foundryId,
      status: 'In Progress',
      progress: 0
    })
    .select()
    .single()
  
  if (objError) {
    console.log(`  ❌ Error creating objective: ${objError.message}`)
    return
  }
  
  console.log(`  ✅ Created objective: "${objective.title}"`)
  
  // Create discovery tasks that guide through the platform
  // Tasks reference actual features/routes in ForgeOS
  const sampleTasks = [
    { 
      title: 'Explore Your Tasks', 
      description: 'Visit the Tasks page to see how work is organized. Create, assign, and track tasks. Try the different views (list, kanban, calendar).', 
      status: 'Pending' 
    },
    { 
      title: 'Review Your Team', 
      description: 'Check out the Team page to see who\'s in your foundry. View member profiles, roles, and activity. Invite new members if needed.', 
      status: 'Pending' 
    },
    { 
      title: 'Browse the Marketplace', 
      description: 'Explore the Marketplace to find Executives, Apprentices, and service providers. See how to build your fractional team.', 
      status: 'Pending' 
    },
    { 
      title: 'Check Your Inbox', 
      description: 'Visit the Inbox to see notifications and action items. This is your command center for what needs attention.', 
      status: 'Pending' 
    },
    { 
      title: 'Explore Inspiration', 
      description: 'Browse the Inspiration library for resources, templates, and playbooks. Save items to your personal collection.', 
      status: 'Pending' 
    },
    { 
      title: 'Visit The Guild', 
      description: 'Check out The Guild page to connect with the ForgeOS community. Share knowledge and learn from others.', 
      status: 'Pending' 
    }
  ]
  
  for (const task of sampleTasks) {
    const { error: taskError } = await supabase.from('tasks').insert({
      ...task,
      objective_id: objective.id,
      creator_id: userId,
      assignee_id: userId,
      foundry_id: foundryId,
      risk_level: 'Medium',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    })
    
    if (taskError) {
      console.log(`  ⚠️  Failed to create task "${task.title}": ${taskError.message}`)
    } else {
      console.log(`  ✅ Created task: "${task.title}"`)
    }
  }
}

async function createDemoSampleData() {
  console.log('🌱 Creating sample data for demo accounts...\n')
  
  for (const account of DEMO_ACCOUNTS) {
    console.log(`Processing ${account.email}`)
    
    // Get user from auth
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users?.find(u => u.email === account.email)
    
    if (!authUser) {
      console.log(`  ❌ User not found\n`)
      continue
    }
    
    // Get profile to get foundry_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', authUser.id)
      .single()
    
    if (!profile || !profile.foundry_id) {
      console.log(`  ❌ Profile or foundry_id not found\n`)
      continue
    }
    
    await createSampleDataForUser(authUser.id, profile.foundry_id, account.role)
    console.log('')
  }
  
  console.log('✨ Sample data creation complete!')
}

createDemoSampleData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
