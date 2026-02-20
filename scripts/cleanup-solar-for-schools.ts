/**
 * @file cleanup-solar-for-schools.ts
 *
 * @description Removes all Solar for Schools demo data: auth users, profiles,
 * foundry memberships, and the foundry itself (which cascades to tasks,
 * objectives, comments, messages, knowledge vault, etc.).
 *
 * Run this after the 24-hour demo window expires, or manually.
 *
 * @usage npx tsx scripts/cleanup-solar-for-schools.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FOUNDRY_ID = 'solar-for-schools'

async function cleanup(): Promise<void> {
  console.log('\n🧹 Cleaning up Solar for Schools demo data...\n')

  // 1. Look up profile IDs
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('foundry_id', FOUNDRY_ID)

  if (!profiles || profiles.length === 0) {
    console.log('   No Solar for Schools profiles found — nothing to clean up.')
    return
  }

  console.log(`   Found ${profiles.length} profiles to remove`)

  const profileIds = profiles.map((p) => p.id)

  // 2. Delete dependent data that may not cascade from foundry deletion

  // Conversation participants and messages
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .or(`buyer_id.in.(${profileIds.join(',')}),seller_id.in.(${profileIds.join(',')}),creator_id.in.(${profileIds.join(',')})`)

  if (conversations && conversations.length > 0) {
    const convIds = conversations.map((c) => c.id)
    await supabase.from('messages').delete().in('conversation_id', convIds)
    await supabase.from('conversation_participants').delete().in('conversation_id', convIds)
    await supabase.from('conversations').delete().in('id', convIds)
    console.log(`   ✅ Deleted ${conversations.length} conversations and their messages`)
  }

  // Provider profiles and marketplace listings
  for (const profileId of profileIds) {
    const { data: provider } = await supabase
      .from('provider_profiles')
      .select('id')
      .eq('user_id', profileId)
      .single()

    if (provider) {
      await supabase.from('marketplace_listings').delete().eq('created_by_provider_id', provider.id)
      await supabase.from('provider_profiles').delete().eq('id', provider.id)
    }
  }
  console.log('   ✅ Deleted marketplace data')

  // Notifications
  await supabase.from('notifications').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted notifications')

  // Apprenticeship enrollments
  await supabase.from('apprenticeship_enrollments').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted apprenticeship data')

  // Task dependencies and work edges
  await supabase.from('task_dependencies').delete().eq('foundry_id', FOUNDRY_ID)
  await supabase.from('work_edges').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted dependencies and work edges')

  // Task comments, objective comments, task history
  await supabase.from('task_comments').delete().eq('foundry_id', FOUNDRY_ID)
  await supabase.from('objective_comments').delete().eq('foundry_id', FOUNDRY_ID)
  // task_history has no foundry_id — delete via task IDs
  const { data: historyTasks } = await supabase.from('tasks').select('id').eq('foundry_id', FOUNDRY_ID)
  if (historyTasks && historyTasks.length > 0) {
    await supabase.from('task_history').delete().in('task_id', historyTasks.map((t) => t.id))
  }
  console.log('   ✅ Deleted comments and history')

  // Knowledge vault
  await supabase.from('knowledge_notes').delete().eq('foundry_id', FOUNDRY_ID)
  await supabase.from('knowledge_domains').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted knowledge vault')

  // Standups
  await supabase.from('standups').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted standups')

  // Function coverage
  await supabase.from('foundry_function_coverage').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted function coverage')

  // Blueprints
  await supabase.from('blueprints').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted blueprints')

  // Activity events
  await supabase.from('activity_events').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted activity events')

  // Tasks and task assignees
  const { data: taskData } = await supabase.from('tasks').select('id').eq('foundry_id', FOUNDRY_ID)
  if (taskData && taskData.length > 0) {
    const taskIds = taskData.map((t) => t.id)
    await supabase.from('task_assignees').delete().in('task_id', taskIds)
  }
  await supabase.from('tasks').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted tasks')

  // Objectives
  await supabase.from('objectives').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted objectives')

  // Team members and teams
  const { data: teamData } = await supabase.from('teams').select('id').eq('foundry_id', FOUNDRY_ID)
  if (teamData && teamData.length > 0) {
    await supabase.from('team_members').delete().in('team_id', teamData.map((t) => t.id))
    await supabase.from('teams').delete().eq('foundry_id', FOUNDRY_ID)
  }
  console.log('   ✅ Deleted teams')

  // Company invitations
  await supabase.from('company_invitations').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted invitations')

  // Foundry memberships
  await supabase.from('foundry_memberships').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted foundry memberships')

  // Profiles
  await supabase.from('profiles').delete().eq('foundry_id', FOUNDRY_ID)
  console.log('   ✅ Deleted profiles')

  // Foundry
  await supabase.from('foundries').delete().eq('id', FOUNDRY_ID)
  console.log('   ✅ Deleted foundry')

  // 3. Delete auth users
  console.log('\n   Deleting auth users...')
  for (const profile of profiles) {
    const { error } = await supabase.auth.admin.deleteUser(profile.id)
    if (error) {
      console.error(`   ❌ Failed to delete auth user ${profile.email}: ${error.message}`)
    } else {
      console.log(`   ✅ Deleted auth user: ${profile.email}`)
    }
  }

  console.log('\n☀️  Solar for Schools cleanup complete. Robert has been logged out.\n')
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
