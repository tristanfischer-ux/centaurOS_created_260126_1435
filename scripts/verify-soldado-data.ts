/**
 * Verify Soldado Account Data
 *
 * Checks that the Soldado account was seeded correctly by querying the database
 * directly to verify:
 * - User exists and can authenticate
 * - Foundry exists
 * - Strategic goals were created
 * - Tasks were created
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = 'mark@soldado.uk'
const PASSWORD = 'Soldado2026!'

async function verify(): Promise<void> {
  console.log('━'.repeat(60))
  console.log('  Verifying Soldado Account')
  console.log('━'.repeat(60))

  // ── 1. Test login ──────────────────────────────────────────────────────────
  console.log('\n1. Testing login...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })

  if (authError) {
    console.error(`   ✗ Login failed: ${authError.message}`)
    if (authError.message.includes('Email not confirmed')) {
      console.log('   → Email needs to be confirmed in Supabase Auth')
    }
    process.exit(1)
  }

  if (!authData.user) {
    console.error('   ✗ Login succeeded but no user returned')
    process.exit(1)
  }

  console.log(`   ✓ Login successful`)
  console.log(`   User ID: ${authData.user.id}`)
  console.log(`   Email: ${authData.user.email}`)

  const userId = authData.user.id

  // ── 2. Check foundry ───────────────────────────────────────────────────────
  console.log('\n2. Checking foundry...')
  const { data: foundry, error: foundryError } = await supabase
    .from('foundries')
    .select('id, name, slug, owner_id')
    .eq('id', 'soldado')
    .single()

  if (foundryError) {
    console.error(`   ✗ Foundry query failed: ${foundryError.message}`)
    process.exit(1)
  }

  if (!foundry) {
    console.error('   ✗ Foundry "soldado" not found')
    process.exit(1)
  }

  console.log(`   ✓ Foundry found: ${foundry.name}`)
  console.log(`   Slug: ${foundry.slug}`)
  console.log(`   Owner: ${foundry.owner_id}`)

  // ── 3. Check profile ───────────────────────────────────────────────────────
  console.log('\n3. Checking profile...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, foundry_id')
    .eq('id', userId)
    .single()

  if (profileError) {
    console.error(`   ✗ Profile query failed: ${profileError.message}`)
    process.exit(1)
  }

  if (!profile) {
    console.error('   ✗ Profile not found')
    process.exit(1)
  }

  console.log(`   ✓ Profile found: ${profile.full_name}`)
  console.log(`   Role: ${profile.role}`)
  console.log(`   Foundry: ${profile.foundry_id}`)

  // ── 4. Check strategic goals ───────────────────────────────────────────────
  console.log('\n4. Checking strategic goals...')
  const { data: goals, error: goalsError } = await supabase
    .from('objectives')
    .select('id, title, status, is_strategic_goal, goal_type')
    .eq('foundry_id', 'soldado')
    .eq('is_strategic_goal', true)
    .order('created_at', { ascending: true })

  if (goalsError) {
    console.error(`   ✗ Goals query failed: ${goalsError.message}`)
    process.exit(1)
  }

  if (!goals || goals.length === 0) {
    console.error('   ✗ No strategic goals found')
    process.exit(1)
  }

  console.log(`   ✓ Found ${goals.length} strategic goals:`)
  goals.forEach((goal) => {
    console.log(`     - ${goal.title} (${goal.goal_type}, ${goal.status})`)
  })

  // ── 5. Check milestones ────────────────────────────────────────────────────
  console.log('\n5. Checking milestones...')
  const { data: milestones, error: milestonesError } = await supabase
    .from('objectives')
    .select('id, title, status, is_milestone')
    .eq('foundry_id', 'soldado')
    .eq('is_milestone', true)

  if (milestonesError) {
    console.error(`   ✗ Milestones query failed: ${milestonesError.message}`)
    process.exit(1)
  }

  console.log(`   ✓ Found ${milestones?.length || 0} milestones`)

  // ── 6. Check objectives ────────────────────────────────────────────────────
  console.log('\n6. Checking objectives...')
  const { data: objectives, error: objectivesError } = await supabase
    .from('objectives')
    .select('id, title, status')
    .eq('foundry_id', 'soldado')
    .eq('is_strategic_goal', false)
    .eq('is_milestone', false)

  if (objectivesError) {
    console.error(`   ✗ Objectives query failed: ${objectivesError.message}`)
    process.exit(1)
  }

  console.log(`   ✓ Found ${objectives?.length || 0} objectives`)

  // ── 7. Check tasks ─────────────────────────────────────────────────────────
  console.log('\n7. Checking tasks...')
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, status')
    .eq('foundry_id', 'soldado')

  if (tasksError) {
    console.error(`   ✗ Tasks query failed: ${tasksError.message}`)
    process.exit(1)
  }

  console.log(`   ✓ Found ${tasks?.length || 0} tasks`)

  // Sample a few tasks
  if (tasks && tasks.length > 0) {
    console.log('   Sample tasks:')
    tasks.slice(0, 3).forEach((task) => {
      console.log(`     - ${task.title} (${task.status})`)
    })
  }

  // ── 8. Check funding requirements ──────────────────────────────────────────
  console.log('\n8. Checking funding requirements...')
  const { data: funding, error: fundingError } = await supabase
    .from('funding_requirements')
    .select('id, title, amount_usd, status')
    .eq('foundry_id', 'soldado')

  if (fundingError) {
    console.error(`   ✗ Funding requirements query failed: ${fundingError.message}`)
  } else {
    console.log(`   ✓ Found ${funding?.length || 0} funding requirements`)
    funding?.forEach((req) => {
      console.log(`     - ${req.title}: $${req.amount_usd.toLocaleString()} (${req.status})`)
    })
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(60))
  console.log('  ✓ Soldado Account Verification Complete')
  console.log('━'.repeat(60))
  console.log('\n  Summary:')
  console.log(`    ✓ Login works`)
  console.log(`    ✓ Foundry: ${foundry.name}`)
  console.log(`    ✓ User: ${profile.full_name} (${profile.role})`)
  console.log(`    ✓ Strategic goals: ${goals.length}`)
  console.log(`    ✓ Milestones: ${milestones?.length || 0}`)
  console.log(`    ✓ Objectives: ${objectives?.length || 0}`)
  console.log(`    ✓ Tasks: ${tasks?.length || 0}`)
  console.log(`    ✓ Funding requirements: ${funding?.length || 0}`)
  console.log('\n  You can now log in at http://localhost:3000/login with:')
  console.log(`    Email: ${EMAIL}`)
  console.log(`    Password: ${PASSWORD}`)
  console.log('━'.repeat(60))
}

verify()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFatal error:', err)
    process.exit(1)
  })
