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
  { email: 'demo.founder@forgeos.io', role: 'founder' },
  { email: 'demo.executive@forgeos.io', role: 'executive' },
  { email: 'demo.apprentice@forgeos.io', role: 'apprentice' }
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
  
  // Create sample objective
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .insert({
      title: role === 'founder' ? 'Launch MVP' : 
             role === 'executive' ? 'Strategic Consulting Engagements' :
             'Complete Apprenticeship Training',
      description: role === 'founder' 
        ? 'Build and launch your minimum viable product in 90 days' 
        : role === 'executive'
        ? 'Portfolio of fractional executive engagements across multiple startups'
        : 'Complete your Founder-in-Training program',
      creator_id: userId,
      foundry_id: foundryId,
      status: 'In Progress',
      progress: 10
    })
    .select()
    .single()
  
  if (objError) {
    console.log(`  ❌ Error creating objective: ${objError.message}`)
    return
  }
  
  console.log(`  ✅ Created objective: "${objective.title}"`)
  
  // Create sample tasks (status must be: Pending, Accepted, Rejected, Amended, Amended_Pending_Approval)
  const sampleTasks = role === 'founder' ? [
    { title: 'Define product requirements', description: 'Document core features and user stories', status: 'Accepted' },
    { title: 'Build prototype', description: 'Create clickable prototype for user testing', status: 'Pending' },
    { title: 'Secure seed funding', description: 'Pitch to 10 investors, close $500K round', status: 'Pending' },
    { title: 'Hire first engineer', description: 'Interview candidates and make offer', status: 'Pending' }
  ] : role === 'executive' ? [
    { title: 'Strategic planning session', description: 'Lead quarterly planning with startup A', status: 'Accepted' },
    { title: 'Mentor apprentice team', description: 'Review deliverables and provide guidance', status: 'Pending' },
    { title: 'Investor deck review', description: 'Critique pitch deck for startup B', status: 'Pending' }
  ] : [
    { title: 'Complete toolkit tutorial', description: 'Learn ForgeOS productivity tools', status: 'Accepted' },
    { title: 'Ship first feature', description: 'Complete and deploy your first real feature', status: 'Pending' },
    { title: 'Shadow an Executive', description: 'Observe strategic decision-making in action', status: 'Pending' },
    { title: 'Present at Guild meeting', description: 'Demo your work to The Guild', status: 'Pending' }
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
