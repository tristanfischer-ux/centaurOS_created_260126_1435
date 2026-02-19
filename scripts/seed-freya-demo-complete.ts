/**
 * @file seed-freya-demo-complete.ts
 *
 * @description Completes the Freya Miniatures demo so /today, /updates, /strategy,
 * and related pages look rich. Run AFTER seed-freya-miniatures.ts and
 * seed-freya-miniatures-extended.ts. Idempotent: uses relative dates and
 * existence checks so re-runs don't duplicate data.
 *
 * @usage npx tsx scripts/seed-freya-demo-complete.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v5 as uuidv5 } from 'uuid'

const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function deterministicId(seed: string): string {
  return uuidv5(seed, SEED_NAMESPACE)
}

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FOUNDRY_ID = 'freya-miniatures'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function dateAtStartOfDay(daysOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

async function resolveFreyaIds(): Promise<{
  freyaId: string
  marcusId: string
  islaId: string
  taskIdsByTitle: Map<string, string>
  objectiveIdsByTitle: Map<string, string>
  strategicGoalIds: string[]
}> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('foundry_id', FOUNDRY_ID)

  const freya = profiles?.find((p) => p.email === 'freya.jane.foster@gmail.com')
  const marcus = profiles?.find((p) => p.email === 'marcus.chen@freyaminiatures.com')
  const isla = profiles?.find((p) => p.email === 'isla.thornton@freyaminiatures.com')

  if (!freya?.id) {
    throw new Error('Freya profile not found. Run seed-freya-miniatures.ts first.')
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title')
    .eq('foundry_id', FOUNDRY_ID)
    .is('deleted_at', null)

  const taskIdsByTitle = new Map<string, string>()
  tasks?.forEach((t) => taskIdsByTitle.set(t.title, t.id))

  const { data: objectives } = await supabase
    .from('objectives')
    .select('id, title, is_strategic_goal')
    .eq('foundry_id', FOUNDRY_ID)
    .is('deleted_at', null)

  const objectiveIdsByTitle = new Map<string, string>()
  const strategicGoalIds: string[] = []
  objectives?.forEach((o) => {
    objectiveIdsByTitle.set(o.title, o.id)
    if (o.is_strategic_goal) strategicGoalIds.push(o.id)
  })

  return {
    freyaId: freya.id,
    marcusId: marcus?.id ?? freya.id,
    islaId: isla?.id ?? freya.id,
    taskIdsByTitle,
    objectiveIdsByTitle,
    strategicGoalIds,
  }
}

async function seedTodayPageData(
  ids: Awaited<ReturnType<typeof resolveFreyaIds>>
): Promise<void> {
  console.log('\n📅 Step 1: Today page (completions, streak, standups, at-risk objectives)')

  const { freyaId, marcusId, islaId, taskIdsByTitle } = ids

  const taskTitlesToComplete = [
    'Source UV-resistant FEP film suppliers — request samples from 5 vendors',
    'Procure resin base materials from 3 chemical suppliers',
    'Set up Discord server with channels, roles, and moderation bots',
    'Create print profile template and testing protocol',
    'Research competitor STL marketplaces (MyMiniFactory, Cults3D, Printables)',
  ]
  const taskIdsToComplete = taskTitlesToComplete
    .map((t) => taskIdsByTitle.get(t))
    .filter(Boolean) as string[]

  for (let i = 0; i < taskIdsToComplete.length; i++) {
    const taskId = taskIdsToComplete[i]
    const daysBack = i + 1
    await supabase
      .from('tasks')
      .update({
        status: 'Completed',
        progress: 100,
        updated_at: daysAgo(daysBack),
      })
      .eq('id', taskId)
  }

  const existingHistory = await supabase
    .from('task_history')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskIdsToComplete[0] ?? '')

  if ((existingHistory.count ?? 0) < 10) {
    const completionHistoryEntries = taskIdsToComplete.flatMap((taskId, idx) => {
      const daysBack = idx + 1
      const userId = [marcusId, marcusId, islaId, marcusId, marcusId][idx] ?? freyaId
      return [
        {
          task_id: taskId,
          user_id: userId,
          action_type: 'COMPLETED',
          changes: { status: { old: 'Accepted', new: 'Completed' }, progress: { old: 75, new: 100 } },
          created_at: daysAgo(daysBack),
        },
      ]
    })
    await supabase.from('task_history').insert(completionHistoryEntries)
    console.log(`   ✅ ${completionHistoryEntries.length} completion history entries added`)
  } else {
    console.log('   ↳ Task history already has entries, skipping')
  }

  const yesterday = dateAtStartOfDay(-1)
  const twoDaysAgo = dateAtStartOfDay(-2)
  await supabase
    .from('standups')
    .update({ standup_date: yesterday })
    .eq('foundry_id', FOUNDRY_ID)
    .eq('user_id', freyaId)
  await supabase
    .from('standups')
    .update({ standup_date: yesterday })
    .eq('foundry_id', FOUNDRY_ID)
    .eq('user_id', marcusId)
  await supabase
    .from('standups')
    .update({ standup_date: twoDaysAgo })
    .eq('foundry_id', FOUNDRY_ID)
    .eq('user_id', islaId)
  console.log('   ✅ Standup dates set to recent')

  const atRiskObjectiveTitles = [
    'Build a thriving tabletop creator community of 2,000+ members',
    'Establish partnerships with 3 major game publishers',
  ]
  for (const title of atRiskObjectiveTitles) {
    const objId = ids.objectiveIdsByTitle.get(title)
    if (objId) {
      await supabase
        .from('objectives')
        .update({
          progress: 28,
          end_date: dateAtStartOfDay(14),
          status: 'In Progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', objId)
    }
  }
  console.log('   ✅ At-risk objectives updated')
}

async function seedActivityFeedData(
  ids: Awaited<ReturnType<typeof resolveFreyaIds>>
): Promise<void> {
  console.log('\n💬 Step 2: Updates/activity feed (recent comments, unread, conversation)')

  const { freyaId, marcusId, islaId } = ids

  const { data: taskComments } = await supabase
    .from('task_comments')
    .select('id, created_at')
    .eq('foundry_id', FOUNDRY_ID)
    .limit(12)

  if (taskComments?.length) {
    const updates = taskComments.slice(0, 6).map((c, i) => ({
      id: c.id,
      created_at: daysAgo(i + 1),
    }))
    for (const u of updates) {
      await supabase.from('task_comments').update({ created_at: u.created_at }).eq('id', u.id)
    }
    console.log('   ✅ Task comments redated to recent')

    // Leave first 3 comments unread for Freya (no task_comment_reads row = unread)
    // Optionally mark the rest as read so feed shows mix of read/unread
    const commentsToMarkRead = taskComments.slice(3, 8)
    for (const c of commentsToMarkRead) {
      await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o: unknown) => Promise<{ error: unknown }> } })
        .from('task_comment_reads')
        .upsert(
          {
            user_id: freyaId,
            comment_id: c.id,
            foundry_id: FOUNDRY_ID,
            read_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,comment_id' }
        )
    }
    if (commentsToMarkRead.length > 0) {
      console.log('   ✅ Some task comments marked read (others stay unread)')
    }
  }

  const convId = deterministicId('freya-demo:team-conv-1')
  const { data: existingConv } = await supabase.from('conversations').select('id').eq('id', convId).single()

  if (!existingConv) {
    await supabase.from('conversations').insert({
      id: convId,
      buyer_id: freyaId,
      seller_id: marcusId,
      conversation_type: 'direct',
      is_group: true,
      title: 'ForgePrint Pro launch',
      status: 'active',
      created_at: daysAgo(2),
      updated_at: daysAgo(0),
      creator_id: freyaId,
    })
    await supabase.from('conversation_participants').insert([
      { conversation_id: convId, profile_id: freyaId, joined_at: daysAgo(2) },
      { conversation_id: convId, profile_id: marcusId, joined_at: daysAgo(2) },
      { conversation_id: convId, profile_id: islaId, joined_at: daysAgo(2) },
    ])

    const messagePayloads = [
      { sender_id: freyaId, content: "Quick sync: let's align on Kickstarter timeline before the copy goes to the designer.", created_at: daysAgo(2) },
      { sender_id: marcusId, content: "I'm good for a call tomorrow after the CM pack is sent. How about 3pm?", created_at: daysAgo(2) },
      { sender_id: islaId, content: "I'll have the waitlist numbers and Discord growth ready to share.", created_at: daysAgo(1) },
      { sender_id: freyaId, content: "3pm works. Isla — can you pull the top 5 requested print profiles from the poll?", created_at: daysAgo(1) },
      { sender_id: islaId, content: "Already done. Space Marines, AoS Stormcast, Nolzur's, Reaper, and One Page Rules. I'll drop the summary in the doc.", created_at: daysAgo(1) },
      { sender_id: marcusId, content: "FEP samples are in. Chem-Foil looks best so far — running one more comparison print tonight.", created_at: daysAgo(0) },
      { sender_id: freyaId, content: "Great. Let's lock the campaign headline by EOW so we can brief the video team.", created_at: daysAgo(0) },
    ]

    const messageIds: string[] = []
    for (let i = 0; i < messagePayloads.length; i++) {
      const msgId = deterministicId(`freya-demo:conv-msg-${i}`)
      messageIds.push(msgId)
      await supabase.from('messages').insert({
        id: msgId,
        conversation_id: convId,
        sender_id: messagePayloads[i].sender_id,
        content: messagePayloads[i].content,
        created_at: messagePayloads[i].created_at,
        is_read: false,
      })
    }
    console.log('   ✅ 1 conversation with 7 messages created')
  } else {
    console.log('   ↳ Conversation already exists, skipping')
  }
}

async function seedStrategyDepth(
  ids: Awaited<ReturnType<typeof resolveFreyaIds>>
): Promise<void> {
  console.log('\n🎯 Step 3: Strategy page (milestones, work_edges, progress)')

  const { objectiveIdsByTitle, strategicGoalIds } = ids

  const milestoneTitles = [
    'Finalise ForgePrint Pro hardware design',
    'Run Kickstarter campaign for ForgePrint Pro',
    'Deliver first commercial batch of 100 printers',
  ]
  for (const title of milestoneTitles) {
    const objId = objectiveIdsByTitle.get(title)
    if (objId) {
      await supabase.from('objectives').update({ is_milestone: true }).eq('id', objId)
    }
  }
  console.log('   ✅ Milestones set on 3 objectives')

  const launchId = strategicGoalIds[0]
  if (launchId) {
    const hardwareId = objectiveIdsByTitle.get('Finalise ForgePrint Pro hardware design')
    const kickstarterId = objectiveIdsByTitle.get('Run Kickstarter campaign for ForgePrint Pro')
    const batchId = objectiveIdsByTitle.get('Deliver first commercial batch of 100 printers')
    const edges = [
      { from: launchId, to: hardwareId },
      { from: hardwareId, to: kickstarterId },
      { from: kickstarterId, to: batchId },
    ].filter((e) => e.to) as { from: string; to: string }[]

    const { count: existingEdges } = await supabase
      .from('work_edges')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', FOUNDRY_ID)

    if ((existingEdges ?? 0) < 3) {
      for (let i = 0; i < edges.length; i++) {
        await supabase.from('work_edges').insert({
          id: deterministicId(`freya-demo:work-edge-${i}`),
          foundry_id: FOUNDRY_ID,
          from_item_id: edges[i].from,
          from_item_type: 'objective',
          to_item_id: edges[i].to,
          to_item_type: 'objective',
          dep_type: 'blocks',
          created_at: new Date().toISOString(),
        })
      }
      console.log('   ✅ work_edges added')
    } else {
      console.log('   ↳ work_edges already exist, skipping')
    }
  }

  const progressUpdates: [string, number][] = [
    ['Finalise ForgePrint Pro hardware design', 60],
    ['Run Kickstarter campaign for ForgePrint Pro', 10],
    ['Deliver first commercial batch of 100 printers', 0],
  ]
  for (const [title, progress] of progressUpdates) {
    const objId = objectiveIdsByTitle.get(title)
    if (objId) await supabase.from('objectives').update({ progress }).eq('id', objId)
  }
  console.log('   ✅ Objective progress updated')
}

async function seedTaskDependencies(
  ids: Awaited<ReturnType<typeof resolveFreyaIds>>
): Promise<void> {
  console.log('\n🔗 Step 5: Task dependencies (Gantt)')

  const { taskIdsByTitle } = ids

  const dependencyPairs: [string, string][] = [
    ['Procure resin base materials from 3 chemical suppliers', 'Run toxicology safety assessment on candidate resin formulations'],
    ['Run toxicology safety assessment on candidate resin formulations', 'Print and evaluate 100-miniature test batch with ForgeFlex v3 resin'],
    ['Finalise CAD model for printer chassis v2.1', 'Select contract manufacturer and sign production agreement'],
    ['Create print profile template and testing protocol', 'Publish first 10 community-tested print profiles'],
    ['Publish first 10 community-tested print profiles', 'Define QC checklist for printer acceptance testing'],
    ['Source UV-resistant FEP film suppliers — request samples from 5 vendors', 'Finalise CAD model for printer chassis v2.1'],
  ]

  const { count: existingDeps } = await supabase
    .from('task_dependencies')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((existingDeps ?? 0) < 5) {
    let added = 0
    for (let i = 0; i < dependencyPairs.length; i++) {
      const [blockerTitle, blockedTitle] = dependencyPairs[i]
      const dependsOnTaskId = taskIdsByTitle.get(blockerTitle)
      const taskId = taskIdsByTitle.get(blockedTitle)
      if (dependsOnTaskId && taskId && dependsOnTaskId !== taskId) {
        await supabase.from('task_dependencies').insert({
          id: deterministicId(`freya-demo:dep-${i}`),
          foundry_id: FOUNDRY_ID,
          task_id: taskId,
          depends_on_task_id: dependsOnTaskId,
          dependency_type: 'blocks',
          created_at: new Date().toISOString(),
        })
        added++
      }
    }
    console.log(`   ✅ ${added} task dependencies added`)
  } else {
    console.log('   ↳ Task dependencies already exist, skipping')
  }
}

async function seedMarketplacePresence(
  ids: Awaited<ReturnType<typeof resolveFreyaIds>>
): Promise<void> {
  console.log('\n🛒 Step 6: Marketplace presence (provider, listings)')

  const { freyaId } = ids

  const providerId = deterministicId('freya-demo:provider-freya')
  const { data: existingProvider } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', freyaId)
    .single()

  if (!existingProvider) {
    await supabase.from('provider_profiles').insert({
      id: providerId,
      user_id: freyaId,
      headline: 'Founder & CEO at Freya Miniatures Ltd',
      bio: 'Passionate about making high-quality 3D printing accessible to every tabletop gamer.',
      is_public: true,
      is_active: true,
      industries: ['Manufacturing', 'Consumer Electronics', 'Gaming'],
      company_stages: ['Seed'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    console.log('   ✅ Provider profile created for Freya')
  } else {
    console.log('   ↳ Provider profile exists, skipping')
  }

  const providerIdToUse = existingProvider?.id ?? providerId
  const { count: existingListings } = await supabase
    .from('marketplace_listings')
    .select('*', { count: 'exact', head: true })
    .eq('created_by_provider_id', providerIdToUse)

  if ((existingListings ?? 0) < 2) {
    const listings = [
      {
        id: deterministicId('freya-demo:listing-forgeprint-pro'),
        title: 'ForgePrint Pro — Precision Resin Printer for Miniatures',
        subcategory: 'Hardware',
        category: 'Products' as const,
        description: 'Studio-grade resin printer designed for tabletop miniatures. Sub-20 micron XY resolution, 50+ print profiles in-box.',
        created_by_provider_id: providerIdToUse,
        is_demo: true,
        is_verified: true,
        approval_status: 'approved',
        created_at: new Date().toISOString(),
      },
      {
        id: deterministicId('freya-demo:listing-custom-printing'),
        title: 'Custom Miniature Printing Service',
        subcategory: 'Printing',
        category: 'Services' as const,
        description: 'Bulk and bespoke miniature printing using ForgePrint Pro and ForgeFlex resin. Ideal for indie game studios and events.',
        created_by_provider_id: providerIdToUse,
        is_demo: true,
        is_verified: false,
        approval_status: 'approved',
        created_at: new Date().toISOString(),
      },
    ]
    for (const row of listings) {
      await supabase.from('marketplace_listings').upsert(row)
    }
    console.log('   ✅ 2 marketplace listings created')
  } else {
    console.log('   ↳ Marketplace listings exist, skipping')
  }
}

async function seedNotificationsAndApprenticeship(
  ids: Awaited<ReturnType<typeof resolveFreyaIds>>
): Promise<void> {
  console.log('\n🔔 Step 7: Notifications & apprenticeship')

  const { freyaId, marcusId, islaId, taskIdsByTitle, objectiveIdsByTitle } = ids

  const { count: existingNotifs } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', freyaId)

  if ((existingNotifs ?? 0) < 5) {
    const taskId = taskIdsByTitle.get('Finalise CAD model for printer chassis v2.1')
    const objectiveId = objectiveIdsByTitle.get('Run Kickstarter campaign for ForgePrint Pro')
    const notifications = [
      { title: 'Task assigned to you', message: 'Marcus assigned you "Finalise CAD model for printer chassis v2.1".', type: 'task_assigned', link: taskId ? `/new-tasks?task=${taskId}` : null },
      { title: 'Comment on objective', message: 'Isla commented on "Run Kickstarter campaign for ForgePrint Pro".', type: 'objective_comment', link: objectiveId ? `/new-objectives?objective=${objectiveId}` : null },
      { title: 'Task completed', message: 'Marcus completed "Source UV-resistant FEP film suppliers".', type: 'task_completed', link: null },
      { title: 'Standup reminder', message: 'Don\'t forget to submit your standup for today.', type: 'standup_reminder', link: '/today' },
      { title: 'Objective at risk', message: 'Build a thriving tabletop creator community of 2,000+ members is behind schedule.', type: 'objective_at_risk', link: '/strategy' },
    ]
    for (let i = 0; i < notifications.length; i++) {
      await supabase.from('notifications').insert({
        id: deterministicId(`freya-demo:notif-${i}`),
        foundry_id: FOUNDRY_ID,
        user_id: freyaId,
        title: notifications[i].title,
        message: notifications[i].message,
        type: notifications[i].type,
        link: notifications[i].link,
        is_read: i >= 3,
        created_at: daysAgo(5 - i),
      })
    }
    console.log('   ✅ Notifications created for Freya')
  } else {
    console.log('   ↳ Notifications exist, skipping')
  }

  const programmeId = deterministicId('freya-demo:apprenticeship-community')
  const { data: existingProgramme } = await supabase
    .from('apprenticeship_programmes')
    .select('id')
    .eq('id', programmeId)
    .single()

  if (!existingProgramme) {
    await supabase.from('apprenticeship_programmes').insert({
      id: programmeId,
      title: 'Community & Marketing Apprenticeship',
      description: '12-month programme in community building, content marketing, and creator partnerships.',
      duration_months: 12,
      otjt_hours_required: 600,
      level: 3,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const enrollmentId = deterministicId('freya-demo:enrollment-isla')
    const { data: existingEnrollment } = await supabase
      .from('apprenticeship_enrollments')
      .select('id')
      .eq('apprentice_id', islaId)
      .eq('foundry_id', FOUNDRY_ID)
      .single()

    if (!existingEnrollment) {
      const expectedEnd = new Date()
      expectedEnd.setMonth(expectedEnd.getMonth() + 11)
      await supabase.from('apprenticeship_enrollments').insert({
        id: enrollmentId,
        foundry_id: FOUNDRY_ID,
        programme_id: programmeId,
        apprentice_id: islaId,
        senior_mentor_id: freyaId,
        workplace_buddy_id: marcusId,
        expected_end_date: expectedEnd.toISOString().split('T')[0],
        otjt_hours_target: 600,
        otjt_hours_logged: 120,
        employment_type: 'apprenticeship',
        created_at: daysAgo(90),
      })
      console.log('   ✅ Apprenticeship programme and Isla enrollment created')
    } else {
      console.log('   ↳ Apprenticeship enrollment exists, skipping')
    }
  } else {
    console.log('   ↳ Apprenticeship programme exists, skipping')
  }
}

async function main(): Promise<void> {
  console.log('\n🌱 Freya demo completeness seed (today, updates, strategy, deps, marketplace, notifications, apprenticeship)\n')

  const ids = await resolveFreyaIds()
  console.log('   Resolved Freya, Marcus, Isla IDs and task/objective maps')

  await seedTodayPageData(ids)
  await seedActivityFeedData(ids)
  await seedStrategyDepth(ids)
  await seedTaskDependencies(ids)
  await seedMarketplacePresence(ids)
  await seedNotificationsAndApprenticeship(ids)

  console.log('\n🎉 Freya demo completeness seed finished.\n')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
