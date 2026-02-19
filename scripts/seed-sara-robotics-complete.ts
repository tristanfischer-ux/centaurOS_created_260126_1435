/**
 * @file seed-sara-robotics-complete.ts
 *
 * @description Completes the SARA Robotics demo so /today, /updates, /strategy,
 * and related pages look rich. Run AFTER seed-sara-robotics.ts and
 * seed-sara-robotics-extended.ts. Idempotent.
 *
 * @usage npx tsx scripts/seed-sara-robotics-complete.ts
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FOUNDRY_ID = 'sara-robotics'

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

interface ResolvedIds {
  saraId: string
  jamesId: string
  priyaId: string
  carlosId: string
  lenaId: string
  alexId: string
  taskIdsByTitle: Map<string, string>
  objectiveIdsByTitle: Map<string, string>
  strategicGoalIds: string[]
}

async function resolveIds(): Promise<ResolvedIds> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('foundry_id', FOUNDRY_ID)

  const find = (email: string): string => {
    const p = profiles?.find((pr) => pr.email === email)
    if (!p) throw new Error(`Profile not found: ${email}`)
    return p.id
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
    saraId: find('sara.f.macedo@gmail.com'),
    jamesId: find('james.okafor@sararobotics.com'),
    priyaId: find('priya.sharma@sararobotics.com'),
    carlosId: find('carlos.mendez@sararobotics.com'),
    lenaId: find('lena.yun@sararobotics.com'),
    alexId: find('alex.reeves@sararobotics.com'),
    taskIdsByTitle,
    objectiveIdsByTitle,
    strategicGoalIds,
  }
}

// ─── Step Functions ───────────────────────────────────────────────────────────

async function seedTodayPageData(ids: ResolvedIds): Promise<void> {
  console.log('\nStep 1: Today page (completions, at-risk objectives, standup dates)')

  const { saraId, jamesId, carlosId, lenaId, taskIdsByTitle } = ids

  const completedTaskTitles = [
    'Complete LiDAR sensor fusion pipeline refactor for multi-sensor support',
    'Profile and optimise SLAM point cloud processing pipeline',
    'Design fleet coordination protocol specification document',
    'Survey 3 partner warehouses and collect 3D environment scan data',
    'Draft Series B pitch deck with updated traction metrics and product roadmap',
    'Map top 15 robotics-focused VC firms and identify relevant partners',
    'Schedule introduction calls with 3 existing angel investors for referrals',
    'Build 3-year financial model with unit economics by customer vertical',
    'Engage external auditor for Series A financial close and compliance review',
    'Evaluate 3 robotic arm OEM integrations for pallet manipulation',
    'Post robotics engineer positions on 5 specialist job boards and LinkedIn',
    'Write engineering handbook covering code review, deploy, and on-call processes',
    'Prepare commercial proposal and pricing for TechFlow Manufacturing',
    'Define tiered pricing model for NavCore Fleet platform',
  ]

  for (let i = 0; i < completedTaskTitles.length; i++) {
    const taskId = taskIdsByTitle.get(completedTaskTitles[i])
    if (!taskId) continue
    const daysBack = i + 1
    await supabase
      .from('tasks')
      .update({ status: 'Completed', progress: 100, updated_at: daysAgo(daysBack) })
      .eq('id', taskId)
  }
  console.log(`   ${completedTaskTitles.length} tasks marked completed with history`)

  // Add completion history entries
  const completionAssignees = [
    jamesId, jamesId, jamesId, carlosId, saraId, saraId, saraId, saraId, carlosId,
    jamesId, carlosId, ids.priyaId, lenaId, saraId,
  ]

  const { count: existingHistory } = await supabase
    .from('task_history')
    .select('id', { count: 'exact', head: true })
    .eq('action_type', 'COMPLETED')
    .in('task_id', Array.from(taskIdsByTitle.values()))

  if ((existingHistory ?? 0) < 10) {
    const entries = completedTaskTitles
      .map((title, idx) => {
        const taskId = taskIdsByTitle.get(title)
        if (!taskId) return null
        return {
          task_id: taskId,
          user_id: completionAssignees[idx] ?? saraId,
          action_type: 'COMPLETED',
          changes: { status: { old: 'Accepted', new: 'Completed' }, progress: { old: 75, new: 100 } },
          created_at: daysAgo(idx + 1),
        }
      })
      .filter(Boolean)

    await supabase.from('task_history').insert(entries)
    console.log(`   ${entries.length} completion history entries added`)
  }

  // Refresh standup dates to recent
  const yesterday = dateAtStartOfDay(-1)
  const twoDaysAgo = dateAtStartOfDay(-2)
  for (const userId of [ids.saraId, ids.jamesId, ids.priyaId, ids.carlosId, ids.lenaId]) {
    await supabase.from('standups').update({ standup_date: yesterday }).eq('foundry_id', FOUNDRY_ID).eq('user_id', userId)
  }
  await supabase.from('standups').update({ standup_date: twoDaysAgo }).eq('foundry_id', FOUNDRY_ID).eq('user_id', ids.alexId)
  console.log('   Standup dates set to recent')

  // Mark 2 objectives at-risk
  const atRiskTitles = [
    'Expand into warehouse logistics vertical',
    'Grow engineering team from 18 to 35',
  ]
  for (const title of atRiskTitles) {
    const objId = ids.objectiveIdsByTitle.get(title)
    if (objId) {
      await supabase.from('objectives').update({
        progress: 22,
        end_date: dateAtStartOfDay(21),
        status: 'In Progress',
        updated_at: new Date().toISOString(),
      }).eq('id', objId)
    }
  }
  console.log('   At-risk objectives updated')
}

async function seedConversations(ids: ResolvedIds): Promise<void> {
  console.log('\nStep 2: Conversations & Messages')

  const { saraId, jamesId, priyaId, carlosId, lenaId, alexId } = ids

  // Conversation 1: Series B Strategy
  const conv1Id = deterministicId('sara-demo:conv-series-b-strategy')
  const { data: existingConv1 } = await supabase.from('conversations').select('id').eq('id', conv1Id).single()

  if (!existingConv1) {
    await supabase.from('conversations').insert({
      id: conv1Id,
      conversation_type: 'direct',
      is_group: true,
      title: 'Series B Strategy & Timeline',
      status: 'active',
      created_at: daysAgo(14),
      updated_at: daysAgo(1),
      creator_id: saraId,
      buyer_id: saraId,
      seller_id: lenaId,
    })
    await supabase.from('conversation_participants').insert([
      { conversation_id: conv1Id, profile_id: saraId, joined_at: daysAgo(14) },
      { conversation_id: conv1Id, profile_id: lenaId, joined_at: daysAgo(14) },
      { conversation_id: conv1Id, profile_id: carlosId, joined_at: daysAgo(14) },
    ])

    const msgs1 = [
      { sender_id: saraId, content: 'Team, I want to align on our Series B timeline. We have warm intros to 6 VCs now and the pitch deck is ready. First meeting is Lux Capital next Tuesday.', created_at: daysAgo(14) },
      { sender_id: lenaId, content: 'The TechFlow case study is our strongest card. 38% throughput increase in 90 days — that\'s a headline number. I can have the Meridian case study done by Friday if their legal clears the safety data.', created_at: daysAgo(13) },
      { sender_id: carlosId, content: 'On the operations side, I\'ve got quotes from 2 CMs for the 500-unit production run. Both can start in Q3 if we close Series B by end of Q2. Should I include this in the data room?', created_at: daysAgo(12) },
      { sender_id: saraId, content: 'Yes — manufacturing readiness is a key part of the growth story. Include the CM quotes and the timeline to 500 units/month capacity. Investors will want to see we can scale post-funding.', created_at: daysAgo(11) },
      { sender_id: lenaId, content: 'Also worth highlighting: GlobalShip pilot is nearly signed (75 days, 3 units). If we close that before the a16z meeting on March 5, it shows momentum in the warehouse vertical.', created_at: daysAgo(10) },
      { sender_id: saraId, content: 'Great point. Lena, let\'s push to get GlobalShip signed by end of February. The narrative of "4 manufacturing pilots + 1 warehouse pilot" is much stronger than "4 manufacturing pilots, exploring warehouse."', created_at: daysAgo(9) },
      { sender_id: carlosId, content: 'I\'ll coordinate with their ops team on the deployment logistics. If they sign by Feb 28, we can have robots on-site by March 10.', created_at: daysAgo(8) },
    ]

    for (let i = 0; i < msgs1.length; i++) {
      await supabase.from('messages').insert({
        id: deterministicId(`sara-demo:conv1-msg-${i}`),
        conversation_id: conv1Id,
        sender_id: msgs1[i].sender_id,
        content: msgs1[i].content,
        created_at: msgs1[i].created_at,
        is_read: i < msgs1.length - 2,
      })
    }
    console.log('   Conversation 1: Series B Strategy (7 messages)')
  } else {
    console.log('   Conversation 1 exists, skipping')
  }

  // Conversation 2: NavCore v2.0 Technical
  const conv2Id = deterministicId('sara-demo:conv-navcore-technical')
  const { data: existingConv2 } = await supabase.from('conversations').select('id').eq('id', conv2Id).single()

  if (!existingConv2) {
    await supabase.from('conversations').insert({
      id: conv2Id,
      conversation_type: 'direct',
      is_group: true,
      title: 'NavCore v2.0 — Technical Sync',
      status: 'active',
      created_at: daysAgo(10),
      updated_at: daysAgo(0),
      creator_id: jamesId,
      buyer_id: jamesId,
      seller_id: priyaId,
    })
    await supabase.from('conversation_participants').insert([
      { conversation_id: conv2Id, profile_id: jamesId, joined_at: daysAgo(10) },
      { conversation_id: conv2Id, profile_id: priyaId, joined_at: daysAgo(10) },
      { conversation_id: conv2Id, profile_id: alexId, joined_at: daysAgo(10) },
      { conversation_id: conv2Id, profile_id: saraId, joined_at: daysAgo(8) },
    ])

    const msgs2 = [
      { sender_id: jamesId, content: 'SLAM update: GPU feature extraction is done. We\'re at 47ms average latency on the Orin. I think we can get to 42ms with loop closure optimisation, but the marginal effort is high. Should we stop at 47ms and focus on fleet coordination?', created_at: daysAgo(10) },
      { sender_id: priyaId, content: '47ms is already under target. I\'d vote to shift focus to fleet coordination — the task scheduler is working but we still need the collision avoidance layer and the 8-robot stress test. Those are higher priority for the beta release.', created_at: daysAgo(9) },
      { sender_id: alexId, content: 'Agreed. Also, I\'ve been prototyping the Isaac Sim migration for fleet testing. It\'s 3x faster than Gazebo for multi-robot scenarios. If we commit, the 8-robot stress test becomes much more tractable.', created_at: daysAgo(8) },
      { sender_id: saraId, content: 'Joining this thread. 47ms SLAM is incredible work, James. Let\'s lock that and pivot to fleet coordination. For the beta, I need fleet coordination working reliably for the TechFlow deployment. Alex — get a budget request to me for Isaac Sim, I\'ll approve it today.', created_at: daysAgo(8) },
      { sender_id: jamesId, content: 'Agreed, locking SLAM at 47ms. Alex, the Isaac Sim migration makes sense for fleet tests but keep single-robot tests in Gazebo for CI speed. Priya, can you scope the collision avoidance timeline?', created_at: daysAgo(7) },
      { sender_id: priyaId, content: 'Collision avoidance: 2 weeks for core UWB + LiDAR layer, 1 week for integration with the scheduler. Alex can own the UWB beacon code. I\'ll handle the priority negotiation logic. Target: functional in 3 weeks, stress-tested in 4.', created_at: daysAgo(6) },
      { sender_id: alexId, content: 'I\'m on it. Starting with the UWB distance matrix module — each robot broadcasts its position and the system builds a proximity graph. If any pair drops below 2m threshold, the collision protocol kicks in.', created_at: daysAgo(5) },
      { sender_id: jamesId, content: 'Good plan. One thing to watch: UWB accuracy degrades near metal racking in warehouses. We should fuse UWB + LiDAR for the proximity estimate. Priya, can you add that to the spec?', created_at: daysAgo(4) },
      { sender_id: priyaId, content: 'Already in the spec. UWB for coarse proximity (sub-30cm accuracy), LiDAR point cloud matching for fine proximity (sub-5cm). Falls back to LiDAR-only if UWB signal is degraded. Belt and suspenders approach.', created_at: daysAgo(3) },
    ]

    for (let i = 0; i < msgs2.length; i++) {
      await supabase.from('messages').insert({
        id: deterministicId(`sara-demo:conv2-msg-${i}`),
        conversation_id: conv2Id,
        sender_id: msgs2[i].sender_id,
        content: msgs2[i].content,
        created_at: msgs2[i].created_at,
        is_read: i < msgs2.length - 3,
      })
    }
    console.log('   Conversation 2: NavCore Technical (9 messages)')
  } else {
    console.log('   Conversation 2 exists, skipping')
  }

  // Conversation 3: Customer Pipeline Review
  const conv3Id = deterministicId('sara-demo:conv-customer-pipeline')
  const { data: existingConv3 } = await supabase.from('conversations').select('id').eq('id', conv3Id).single()

  if (!existingConv3) {
    await supabase.from('conversations').insert({
      id: conv3Id,
      conversation_type: 'direct',
      is_group: true,
      title: 'Customer Pipeline & Pilot Updates',
      status: 'active',
      created_at: daysAgo(7),
      updated_at: daysAgo(1),
      creator_id: lenaId,
      buyer_id: lenaId,
      seller_id: saraId,
    })
    await supabase.from('conversation_participants').insert([
      { conversation_id: conv3Id, profile_id: lenaId, joined_at: daysAgo(7) },
      { conversation_id: conv3Id, profile_id: saraId, joined_at: daysAgo(7) },
      { conversation_id: conv3Id, profile_id: carlosId, joined_at: daysAgo(7) },
    ])

    const msgs3 = [
      { sender_id: lenaId, content: 'Pipeline update for this week. TechFlow: proposal out, VP Ops presenting to CFO. Meridian: proposal 80% done, blocked on safety data from their legal. Precision Dynamics: negotiating 2-year contract.', created_at: daysAgo(7) },
      { sender_id: saraId, content: 'What\'s your read on TechFlow timeline? If their CFO approves, when do we think we can ink the contract?', created_at: daysAgo(6) },
      { sender_id: lenaId, content: 'Optimistically 3-4 weeks. Their procurement process is standardised — once CFO signs off, legal review takes ~10 business days. I\'ve already shared our standard MSA with their legal team proactively.', created_at: daysAgo(5) },
      { sender_id: carlosId, content: 'If TechFlow signs for 5 units, I need 6 weeks lead time to build and ship the additional 3 NavBot Pro units. Should I start component procurement now or wait for signed contract?', created_at: daysAgo(4) },
      { sender_id: saraId, content: 'Start procurement for long-lead items now — the Velodyne LiDARs are 12-week lead time. We can\'t afford to wait for the signed contract. The risk of carrying $12K in LiDAR inventory is acceptable given the deal size.', created_at: daysAgo(3) },
      { sender_id: lenaId, content: 'Also: GlobalShip pilot terms are nearly done. 75 days, 3 units. They want to start March 10. Carlos, is that deployment date feasible?', created_at: daysAgo(2) },
      { sender_id: carlosId, content: 'March 10 works if we get the signed agreement by February 28. I\'ll need 10 days for NavCore configuration, shipping, and on-site commissioning. I\'ll pre-stage the 3 units in our warehouse this week.', created_at: daysAgo(1) },
    ]

    for (let i = 0; i < msgs3.length; i++) {
      await supabase.from('messages').insert({
        id: deterministicId(`sara-demo:conv3-msg-${i}`),
        conversation_id: conv3Id,
        sender_id: msgs3[i].sender_id,
        content: msgs3[i].content,
        created_at: msgs3[i].created_at,
        is_read: i < msgs3.length - 2,
      })
    }
    console.log('   Conversation 3: Customer Pipeline (7 messages)')
  } else {
    console.log('   Conversation 3 exists, skipping')
  }
}

async function seedStrategyDepth(ids: ResolvedIds): Promise<void> {
  console.log('\nStep 3: Strategy page (milestones, work_edges, progress)')

  const { objectiveIdsByTitle, strategicGoalIds } = ids

  // Set milestones
  const milestoneTitles = [
    'Ship NavCore 2.0 beta to 4 pilot customers',
    'Prepare investor data room and pitch deck',
    'Launch pilot with 2 logistics partners',
    'Convert 3 manufacturing pilots to paid annual contracts',
  ]
  for (const title of milestoneTitles) {
    const objId = objectiveIdsByTitle.get(title)
    if (objId) {
      await supabase.from('objectives').update({ is_milestone: true }).eq('id', objId)
    }
  }
  console.log('   Milestones set on 4 objectives')

  // Work edges: strategic goal -> objective dependencies
  const { count: existingEdges } = await supabase
    .from('work_edges')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((existingEdges ?? 0) < 3) {
    const edgePairs = [
      // NavCore -> Ship beta -> Fleet coordination
      [objectiveIdsByTitle.get('Ship NavCore 2.0 beta to 4 pilot customers'), objectiveIdsByTitle.get('Implement multi-robot fleet coordination engine')],
      // SLAM -> Ship beta
      [objectiveIdsByTitle.get('Reduce SLAM latency to sub-50ms for real-time operation'), objectiveIdsByTitle.get('Ship NavCore 2.0 beta to 4 pilot customers')],
      // Warehouse mapping -> Launch pilot
      [objectiveIdsByTitle.get('Complete warehouse environment mapping prototype'), objectiveIdsByTitle.get('Launch pilot with 2 logistics partners')],
      // Data room -> VC intros
      [objectiveIdsByTitle.get('Prepare investor data room and pitch deck'), objectiveIdsByTitle.get('Secure warm introductions to 8 target VC firms')],
      // Convert pilots -> Achieve ARR
      [objectiveIdsByTitle.get('Convert 3 manufacturing pilots to paid annual contracts'), objectiveIdsByTitle.get('Secure 2 new warehouse logistics pilot contracts')],
    ]

    let edgeCount = 0
    for (let i = 0; i < edgePairs.length; i++) {
      const [fromId, toId] = edgePairs[i]
      if (fromId && toId) {
        await supabase.from('work_edges').insert({
          id: deterministicId(`sara-demo:work-edge-${i}`),
          foundry_id: FOUNDRY_ID,
          from_item_id: fromId,
          from_item_type: 'objective',
          to_item_id: toId,
          to_item_type: 'objective',
          dep_type: 'hard',
          created_at: new Date().toISOString(),
        })
        edgeCount++
      }
    }
    console.log(`   ${edgeCount} work_edges added`)
  } else {
    console.log('   work_edges already exist, skipping')
  }
}

async function seedTaskDependencies(ids: ResolvedIds): Promise<void> {
  console.log('\nStep 4: Task dependencies (Gantt)')

  const { taskIdsByTitle } = ids

  const { count: existingDeps } = await supabase
    .from('task_dependencies')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((existingDeps ?? 0) >= 5) {
    console.log('   Task dependencies already exist, skipping')
    return
  }

  const dependencyPairs: [string, string][] = [
    ['Complete LiDAR sensor fusion pipeline refactor for multi-sensor support', 'Implement obstacle avoidance v2 with dynamic path replanning'],
    ['Implement obstacle avoidance v2 with dynamic path replanning', 'Deploy NavCore 2.0 beta to TechFlow Manufacturing pilot site'],
    ['Design fleet coordination protocol specification document', 'Implement centralised task scheduler for multi-robot job dispatch'],
    ['Implement centralised task scheduler for multi-robot job dispatch', 'Build collision avoidance system for robot-to-robot proximity events'],
    ['Build collision avoidance system for robot-to-robot proximity events', 'Run 8-robot fleet stress test in simulation environment'],
    ['Profile and optimise SLAM point cloud processing pipeline', 'Implement GPU-accelerated feature extraction for LiDAR point clouds'],
    ['Survey 3 partner warehouses and collect 3D environment scan data', 'Adapt NavCore pathfinding for narrow-aisle warehouse layouts'],
    ['Negotiate pilot agreement terms with GlobalShip Logistics', 'Deploy 2 NavBot Pro units to GlobalShip warehouse for 90-day pilot'],
  ]

  let added = 0
  for (let i = 0; i < dependencyPairs.length; i++) {
    const [blockerTitle, blockedTitle] = dependencyPairs[i]
    const dependsOnTaskId = taskIdsByTitle.get(blockerTitle)
    const taskId = taskIdsByTitle.get(blockedTitle)
    if (dependsOnTaskId && taskId && dependsOnTaskId !== taskId) {
      await supabase.from('task_dependencies').insert({
        id: deterministicId(`sara-demo:dep-${i}`),
        foundry_id: FOUNDRY_ID,
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
        dependency_type: 'finish_to_start',
        created_at: new Date().toISOString(),
      })
      added++
    }
  }
  console.log(`   ${added} task dependencies added`)
}

async function seedMarketplacePresence(ids: ResolvedIds): Promise<void> {
  console.log('\nStep 5: Marketplace presence')

  const { saraId } = ids

  const providerId = deterministicId('sara-demo:provider-sara')
  const { data: existingProvider } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', saraId)
    .single()

  if (!existingProvider) {
    await supabase.from('provider_profiles').insert({
      id: providerId,
      user_id: saraId,
      headline: 'Founder & CEO at SARA Robotics',
      bio: 'Building autonomous mobile robots that deploy in 48 hours, not 6 months.',
      is_public: true,
      is_active: true,
      industries: ['Robotics', 'Industrial Automation', 'Logistics', 'Manufacturing'],
      company_stages: ['Series A'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    console.log('   Provider profile created')
  } else {
    console.log('   Provider profile exists, skipping')
  }

  const providerIdToUse = existingProvider?.id ?? providerId
  const { count: existingListings } = await supabase
    .from('marketplace_listings')
    .select('*', { count: 'exact', head: true })
    .eq('created_by_provider_id', providerIdToUse)

  if ((existingListings ?? 0) < 2) {
    const listings = [
      {
        id: deterministicId('sara-demo:listing-navbot-pro'),
        title: 'NavBot Pro — Autonomous Mobile Robot for Industrial Logistics',
        subcategory: 'Hardware',
        category: 'Products' as const,
        description: 'Autonomous mobile robot with sub-50ms LiDAR SLAM, multi-robot fleet coordination, and 48-hour deployment. $45K per unit. Designed for warehouse and manufacturing environments.',
        created_by_provider_id: providerIdToUse,
        is_demo: true,
        is_verified: true,
        approval_status: 'approved',
        created_at: new Date().toISOString(),
      },
      {
        id: deterministicId('sara-demo:listing-navcore-fleet'),
        title: 'NavCore Fleet — Autonomous Robot Fleet Management SaaS',
        subcategory: 'SaaS',
        category: 'Services' as const,
        description: 'Cloud-based fleet management platform for NavBot Pro robots. Real-time monitoring, fleet coordination, analytics, and WMS integration. From $200/robot/month.',
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
    console.log('   2 marketplace listings created')
  } else {
    console.log('   Marketplace listings exist, skipping')
  }
}

async function seedNotificationsAndApprenticeship(ids: ResolvedIds): Promise<void> {
  console.log('\nStep 6: Notifications & Apprenticeship')

  const { saraId, jamesId, priyaId, alexId, taskIdsByTitle, objectiveIdsByTitle } = ids

  // Notifications
  const { count: existingNotifs } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', saraId)
    .eq('foundry_id', FOUNDRY_ID)

  if ((existingNotifs ?? 0) < 5) {
    const taskId = taskIdsByTitle.get('Implement obstacle avoidance v2 with dynamic path replanning')
    const objectiveId = objectiveIdsByTitle.get('Expand into warehouse logistics vertical')

    const notifications = [
      { title: 'Task completed', message: 'James completed "GPU-accelerated feature extraction for LiDAR point clouds" — SLAM at 47ms!', type: 'task_completed', link: null },
      { title: 'Objective at risk', message: '"Expand into warehouse logistics vertical" is behind schedule — 22% progress with 3 weeks to milestone.', type: 'at_risk_alert', link: '/strategy' },
      { title: 'New comment on task', message: 'Priya commented on "Obstacle avoidance v2" — yield-and-wait behaviour spec is ready for review.', type: 'comment_added', link: taskId ? `/new-tasks?task=${taskId}` : null },
      { title: 'Standup reminder', message: 'Don\'t forget to submit your standup for today.', type: 'system', link: '/today' },
      { title: 'Hiring update', message: 'Priya recommends the Clearpath Robotics candidate for the fleet systems engineer role. On-site scheduled Friday.', type: 'system', link: null },
    ]

    for (let i = 0; i < notifications.length; i++) {
      await supabase.from('notifications').insert({
        id: deterministicId(`sara-demo:notif-${i}`),
        foundry_id: FOUNDRY_ID,
        user_id: saraId,
        title: notifications[i].title,
        message: notifications[i].message,
        type: notifications[i].type,
        link: notifications[i].link,
        is_read: i >= 3,
        created_at: daysAgo(5 - i),
      })
    }
    console.log('   5 notifications created for Sara')
  } else {
    console.log('   Notifications exist, skipping')
  }

  // Apprenticeship
  const programmeId = deterministicId('sara-demo:apprenticeship-engineering')
  const { data: existingProgramme } = await supabase
    .from('apprenticeship_programmes')
    .select('id')
    .eq('id', programmeId)
    .single()

  if (!existingProgramme) {
    await supabase.from('apprenticeship_programmes').insert({
      id: programmeId,
      title: 'Robotics Software Engineering Apprenticeship',
      description: '12-month programme in robotics software engineering covering SLAM, simulation, fleet systems, and embedded development.',
      duration_months: 12,
      otjt_hours_required: 600,
      level: 3,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const enrollmentId = deterministicId('sara-demo:enrollment-alex')
    const { data: existingEnrollment } = await supabase
      .from('apprenticeship_enrollments')
      .select('id')
      .eq('apprentice_id', alexId)
      .eq('foundry_id', FOUNDRY_ID)
      .single()

    if (!existingEnrollment) {
      const expectedEnd = new Date()
      expectedEnd.setMonth(expectedEnd.getMonth() + 9)
      await supabase.from('apprenticeship_enrollments').insert({
        id: enrollmentId,
        foundry_id: FOUNDRY_ID,
        programme_id: programmeId,
        apprentice_id: alexId,
        senior_mentor_id: jamesId,
        workplace_buddy_id: priyaId,
        expected_end_date: expectedEnd.toISOString().split('T')[0],
        otjt_hours_target: 600,
        otjt_hours_logged: 180,
        employment_type: 'apprenticeship',
        created_at: daysAgo(90),
      })
      console.log('   Apprenticeship programme and Alex enrollment created')
    } else {
      console.log('   Apprenticeship enrollment exists, skipping')
    }
  } else {
    console.log('   Apprenticeship programme exists, skipping')
  }
}

// ─── Cleanup trigger-generated notification spam ──────────────────────────────

async function cleanupTriggerNotificationSpam(ids: ResolvedIds): Promise<void> {
  console.log('\nStep 7: Cleaning up trigger-generated notification spam')

  const intentionalNotifIds = Array.from({ length: 5 }, (_, i) =>
    deterministicId(`sara-demo:notif-${i}`)
  )

  const memberIds = [ids.saraId, ids.jamesId, ids.priyaId, ids.carlosId, ids.alexId, ids.lenaId]

  const { data: spamNotifs, error: fetchErr } = await supabase
    .from('notifications')
    .select('id')
    .in('user_id', memberIds)
    .not('id', 'in', `(${intentionalNotifIds.join(',')})`)

  if (fetchErr) {
    console.warn('   Could not fetch spam notifications:', fetchErr.message)
    return
  }

  if (!spamNotifs?.length) {
    console.log('   No spam notifications to clean up')
    return
  }

  const spamIds = spamNotifs.map(n => n.id)
  const { error: deleteErr } = await supabase
    .from('notifications')
    .delete()
    .in('id', spamIds)

  if (deleteErr) {
    console.warn('   Failed to delete spam notifications:', deleteErr.message)
  } else {
    console.log(`   Deleted ${spamIds.length} trigger-generated notifications, kept 5 intentional`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n SARA Robotics demo completeness seed\n')

  const ids = await resolveIds()
  console.log('   Resolved all user IDs and task/objective maps')

  await seedTodayPageData(ids)
  await seedConversations(ids)
  await seedStrategyDepth(ids)
  await seedTaskDependencies(ids)
  await seedMarketplacePresence(ids)
  await cleanupTriggerNotificationSpam(ids)
  await seedNotificationsAndApprenticeship(ids)

  console.log('\n SARA Robotics completeness seed finished.\n')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
