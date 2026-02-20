/**
 * @file fix-freya-data.ts
 *
 * @description Fixes Freya Miniatures demo data:
 * 1. Sets Freya's role to Founder (profile + membership)
 * 2. Sets foundry owner_id to Freya
 * 3. Deletes duplicate objectives/tasks from double seed run
 * 4. Consolidates from 5 strategies to 3 (moves child objectives)
 * 5. Updates timeline dates for a clean strategy map
 *
 * @usage npx tsx scripts/fix-freya-data.ts
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
  auth: { autoRefreshToken: false, persistSession: false }
})

const FREYA_ID = 'a7a29faa-716f-44d8-8472-bed291931803'
const FOUNDRY_ID = 'freya-miniatures'

// IDs from the SECOND seed run (duplicates to delete)
const DUPLICATE_STRATEGIC_IDS = [
  '378b5215-441b-435c-8655-3297b09c901a', // Launch ForgePrint Pro (dup)
  '5993a4cb-f0f7-4a43-8f3c-7ed83031ee77', // £500K ARR (dup)
  'd9d881cd-bbae-4c99-b4fe-4eecc9e601e0', // Community (dup)
  'dbb242b4-d921-4a4e-8842-1f095273e53a', // Partnerships (dup)
  'adeee361-c5ce-4ab2-a2a5-10bba475430b', // Print quality (dup)
]

const DUPLICATE_CHILD_IDS = [
  '10a12df8-d79a-4a54-9840-f9675308d36f', // Finalise hardware (dup, parent 378b)
  '618ada63-9a5b-4745-94ec-bff9caa9b293', // Kickstarter (dup, parent 378b)
  '79122c08-73e2-4c92-a189-71358ea2018b', // First batch (dup, parent 378b)
  'dd06614c-4d5b-42c1-bdcd-8afdfc890fca', // Resin subscription (dup, parent 5993)
  'abfdf730-f081-44ec-a7e6-603951baca1c', // STL marketplace (dup, parent 5993)
  '66a91201-9344-45a2-bd0c-02cce2ca432d', // Discord (dup, parent d9d8)
  '1e8373e8-3603-4829-ae0f-ede14e03bead', // Conventions (dup, parent d9d8)
  'b362688b-e711-4421-b50e-4b899fe88326', // GW agreement (dup, parent dbb2)
  '5dafb52f-8374-40ef-9cfa-e3211b2e5a0e', // ForgeFlex resin (dup, parent adee)
  '35e02ad4-66b1-4f2d-912e-717e6df89caa', // Print profiles (dup, parent adee)
]

// Strategies to DELETE after moving their children
const STRATEGY_PARTNERSHIPS_ID = '4b0bbc26-9f1b-4784-b2ff-4e51a600c613'
const STRATEGY_PRINT_QUALITY_ID = '4b332d36-50ca-4cc7-93c8-3a1b4f797e55'

// Strategies to KEEP
const STRATEGY_PRODUCT_LAUNCH_ID = '4f81ec05-f89c-4dcb-9111-a348e1a42470'
const STRATEGY_ARR_ID = '683993b0-76dd-4bee-995e-8e0915c4b06d'
const STRATEGY_COMMUNITY_ID = 'cac7bdb3-95a2-4065-b234-18b912c36d46'

// Children to re-parent (from deleted strategies to kept ones)
const REPARENT_MAP: Record<string, string> = {
  '08bf549d-0eee-4442-accb-fb5228de0182': STRATEGY_COMMUNITY_ID,      // Secure GW -> Community
  'c8eaff0b-8faf-47cc-95a0-fe0c7d7e297e': STRATEGY_PRODUCT_LAUNCH_ID, // ForgeFlex resin -> Product Launch
  'f24778d8-4707-45df-821b-7e18702f7bd0': STRATEGY_PRODUCT_LAUNCH_ID, // Print profiles -> Product Launch
}

// All duplicate objective IDs (strategic + child) for bulk task/comment cleanup
const ALL_DUPLICATE_OBJ_IDS = [...DUPLICATE_STRATEGIC_IDS, ...DUPLICATE_CHILD_IDS]

async function deleteRelatedData(objectiveIds: string[]): Promise<void> {
  // Find all tasks under these objectives
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id')
    .in('objective_id', objectiveIds)

  if (tasks && tasks.length > 0) {
    const taskIds = tasks.map(t => t.id)
    console.log(`  Deleting data for ${taskIds.length} tasks under duplicate objectives...`)

    // Delete task_comments
    const { error: tcErr } = await supabase
      .from('task_comments')
      .delete()
      .in('task_id', taskIds)
    if (tcErr) console.warn('  Warning deleting task_comments:', tcErr.message)

    // Delete task_history
    const { error: thErr } = await supabase
      .from('task_history')
      .delete()
      .in('task_id', taskIds)
    if (thErr) console.warn('  Warning deleting task_history:', thErr.message)

    // Delete tasks
    const { error: tErr } = await supabase
      .from('tasks')
      .delete()
      .in('objective_id', objectiveIds)
    if (tErr) console.warn('  Warning deleting tasks:', tErr.message)
    else console.log(`  Deleted ${taskIds.length} duplicate tasks`)
  }

  // Delete objective_comments
  const { error: ocErr } = await supabase
    .from('objective_comments')
    .delete()
    .in('objective_id', objectiveIds)
  if (ocErr) console.warn('  Warning deleting objective_comments:', ocErr.message)
}

function dateStr(year: number, month: number, day: number = 1): string {
  return new Date(year, month - 1, day).toISOString()
}

async function main(): Promise<void> {
  console.log('=== Fixing Freya Miniatures Data ===\n')

  // --- Step 1: Fix Freya's role to Founder ---
  console.log('Step 1: Setting Freya as Founder')

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ role: 'Founder' })
    .eq('id', FREYA_ID)
  if (profileErr) throw new Error(`Failed to update profile role: ${profileErr.message}`)

  const { error: memberErr } = await supabase
    .from('foundry_memberships')
    .update({ role: 'Founder' })
    .eq('user_id', FREYA_ID)
    .eq('foundry_id', FOUNDRY_ID)
  if (memberErr) throw new Error(`Failed to update membership role: ${memberErr.message}`)

  const { error: ownerErr } = await supabase
    .from('foundries')
    .update({ owner_id: FREYA_ID })
    .eq('id', FOUNDRY_ID)
  if (ownerErr) throw new Error(`Failed to set foundry owner_id: ${ownerErr.message}`)

  console.log('  Freya role = Founder, foundry owner_id set\n')

  // --- Step 2: Delete duplicate data from second seed run ---
  console.log('Step 2: Cleaning up duplicate objectives + tasks')

  await deleteRelatedData(ALL_DUPLICATE_OBJ_IDS)

  // Delete duplicate child objectives
  const { error: dupChildErr } = await supabase
    .from('objectives')
    .delete()
    .in('id', DUPLICATE_CHILD_IDS)
  if (dupChildErr) console.warn('  Warning deleting dup children:', dupChildErr.message)
  else console.log(`  Deleted ${DUPLICATE_CHILD_IDS.length} duplicate child objectives`)

  // Delete duplicate strategic objectives
  const { error: dupStratErr } = await supabase
    .from('objectives')
    .delete()
    .in('id', DUPLICATE_STRATEGIC_IDS)
  if (dupStratErr) console.warn('  Warning deleting dup strategies:', dupStratErr.message)
  else console.log(`  Deleted ${DUPLICATE_STRATEGIC_IDS.length} duplicate strategic objectives\n`)

  // --- Step 3: Re-parent children from removed strategies ---
  console.log('Step 3: Re-parenting objectives from removed strategies')

  for (const [childId, newParentId] of Object.entries(REPARENT_MAP)) {
    const { error } = await supabase
      .from('objectives')
      .update({ parent_objective_id: newParentId })
      .eq('id', childId)
    if (error) console.warn(`  Warning re-parenting ${childId}:`, error.message)
  }
  console.log('  Moved 3 child objectives to new parent strategies\n')

  // --- Step 4: Delete the 2 removed strategies ---
  console.log('Step 4: Deleting retired strategies')

  // First clean up any tasks/comments directly under these strategies (shouldn't exist but be safe)
  await deleteRelatedData([STRATEGY_PARTNERSHIPS_ID, STRATEGY_PRINT_QUALITY_ID])

  const { error: retireErr } = await supabase
    .from('objectives')
    .delete()
    .in('id', [STRATEGY_PARTNERSHIPS_ID, STRATEGY_PRINT_QUALITY_ID])
  if (retireErr) console.warn('  Warning deleting retired strategies:', retireErr.message)
  else console.log('  Deleted "Establish partnerships" and "Deliver print quality" strategies\n')

  // --- Step 5: Update timeline dates ---
  console.log('Step 5: Updating timeline dates')

  const dateUpdates: { id: string; start_date: string; end_date: string }[] = [
    // Strategy 1: Launch ForgePrint Pro (Feb 2026 -> Oct 2026)
    { id: STRATEGY_PRODUCT_LAUNCH_ID, start_date: dateStr(2026, 2), end_date: dateStr(2026, 10) },
    // Children
    { id: 'c8eaff0b-8faf-47cc-95a0-fe0c7d7e297e', start_date: dateStr(2026, 2), end_date: dateStr(2026, 5) },    // ForgeFlex resin
    { id: 'ab0c8de7-1981-4cb8-9c2c-cea9b2d7f731', start_date: dateStr(2026, 2), end_date: dateStr(2026, 4) },    // Finalise hardware
    { id: 'f24778d8-4707-45df-821b-7e18702f7bd0', start_date: dateStr(2026, 3), end_date: dateStr(2026, 6) },    // Print profiles
    { id: '27ddf943-b2f9-43a0-9960-d34b06703afa', start_date: dateStr(2026, 5), end_date: dateStr(2026, 8) },    // Kickstarter
    { id: '69cc858f-3f65-423a-acc3-6675d17353da', start_date: dateStr(2026, 7), end_date: dateStr(2026, 10) },   // First batch

    // Strategy 2: £500K ARR (Apr 2026 -> Aug 2027)
    { id: STRATEGY_ARR_ID, start_date: dateStr(2026, 4), end_date: dateStr(2027, 8) },
    // Children
    { id: 'd52fd838-0b38-4740-964f-60d0de5a5853', start_date: dateStr(2026, 4), end_date: dateStr(2026, 8) },    // Resin subscription
    { id: 'b95a4f9c-2508-4afe-9732-e5d21546f8f2', start_date: dateStr(2026, 6), end_date: dateStr(2026, 12) },   // STL marketplace

    // Strategy 3: Community (Feb 2026 -> Feb 2027)
    { id: STRATEGY_COMMUNITY_ID, start_date: dateStr(2026, 2), end_date: dateStr(2027, 2) },
    // Children
    { id: '7a7bb016-74a1-40ab-924b-46e8208ea53a', start_date: dateStr(2026, 2), end_date: dateStr(2026, 5) },    // Discord
    { id: '08ee03f2-5904-4d8c-9738-2db9735f5349', start_date: dateStr(2026, 4), end_date: dateStr(2026, 11) },   // Conventions
    { id: '08bf549d-0eee-4442-accb-fb5228de0182', start_date: dateStr(2026, 5), end_date: dateStr(2026, 10) },   // GW agreement
  ]

  for (const upd of dateUpdates) {
    const { error } = await supabase
      .from('objectives')
      .update({ start_date: upd.start_date, end_date: upd.end_date })
      .eq('id', upd.id)
    if (error) console.warn(`  Warning updating dates for ${upd.id}:`, error.message)
  }
  console.log(`  Updated dates for ${dateUpdates.length} objectives\n`)

  // --- Verify ---
  console.log('=== Verification ===')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', FREYA_ID).single()
  console.log(`Freya role: ${profile?.role}`)

  const { data: foundry } = await supabase.from('foundries').select('owner_id').eq('id', FOUNDRY_ID).single()
  console.log(`Foundry owner_id: ${foundry?.owner_id}`)

  const { data: strats } = await supabase
    .from('objectives')
    .select('title, start_date, end_date')
    .eq('foundry_id', FOUNDRY_ID)
    .eq('is_strategic_goal', true)
  console.log(`\nStrategic objectives (${strats?.length}):`);
  strats?.forEach(s => console.log(`  - ${s.title} (${s.start_date?.substring(0, 10)} -> ${s.end_date?.substring(0, 10)})`))

  const { data: children } = await supabase
    .from('objectives')
    .select('title, parent_objective_id')
    .eq('foundry_id', FOUNDRY_ID)
    .eq('is_strategic_goal', false)
  console.log(`\nChild objectives (${children?.length}):`)
  children?.forEach(c => console.log(`  - ${c.title}`))

  const { data: taskCount } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)
  console.log(`\nTotal tasks: ${taskCount}`)

  console.log('\n=== Done ===')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
