/**
 * @file seed-sara-robotics-extended.ts
 *
 * @description Extends the SARA Robotics demo with lived-in data:
 * profile depth, task/objective comments, knowledge vault, task history,
 * standups, foundry function coverage, and a blueprint.
 *
 * @usage npx tsx scripts/seed-sara-robotics-extended.ts
 *
 * Run AFTER seed-sara-robotics.ts. Safe to re-run (uses existence checks).
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'

const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
function deterministicId(seed: string): string {
  return uuidv5(seed, SEED_NAMESPACE)
}

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FOUNDRY_ID = 'sara-robotics'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString()
}

interface ResolvedIds {
  saraId: string
  jamesId: string
  priyaId: string
  carlosId: string
  lenaId: string
  alexId: string
  tasksByTitle: Map<string, string>
  objectivesByTitle: Map<string, string>
}

async function resolveIds(): Promise<ResolvedIds> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('foundry_id', FOUNDRY_ID)

  const find = (email: string): string => {
    const p = profiles?.find((pr) => pr.email === email)
    if (!p) throw new Error(`Profile not found: ${email}. Run seed-sara-robotics.ts first.`)
    return p.id
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title')
    .eq('foundry_id', FOUNDRY_ID)
    .is('deleted_at', null)

  const tasksByTitle = new Map<string, string>()
  tasks?.forEach((t) => tasksByTitle.set(t.title, t.id))

  const { data: objectives } = await supabase
    .from('objectives')
    .select('id, title')
    .eq('foundry_id', FOUNDRY_ID)
    .is('deleted_at', null)

  const objectivesByTitle = new Map<string, string>()
  objectives?.forEach((o) => objectivesByTitle.set(o.title, o.id))

  return {
    saraId: find('sara.f.macedo@gmail.com'),
    jamesId: find('james.okafor@sararobotics.com'),
    priyaId: find('priya.sharma@sararobotics.com'),
    carlosId: find('carlos.mendez@sararobotics.com'),
    lenaId: find('lena.yun@sararobotics.com'),
    alexId: find('alex.reeves@sararobotics.com'),
    tasksByTitle,
    objectivesByTitle,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('\n Extending SARA Robotics demo data...\n')

  const ids = await resolveIds()
  const { saraId, jamesId, priyaId, carlosId, lenaId, alexId, tasksByTitle, objectivesByTitle } = ids

  // ── 1. Profile Depth ──────────────────────────────────────────────────────
  console.log('Step 1: Profile Depth')

  const profileUpdates = [
    {
      id: saraId,
      skills: ['Product Strategy', 'Robotics Systems', 'Fundraising', 'Customer Development', 'Hardware Design'],
      expertise_areas: ['Autonomous Navigation', 'Mobile Robotics', 'Industrial Automation', 'Go-to-Market Strategy'],
      industries: ['Robotics', 'Industrial Automation', 'Logistics', 'Manufacturing'],
      professional_background: {
        summary: 'Former Senior Robotics Engineer at Boston Dynamics (6 years) where Sara led the Spot warehouse navigation team. Left to found SARA Robotics after identifying the gap between $200K enterprise AGVs and consumer-grade robots. Previously worked at Amazon Robotics on Kiva system integration. 3 patents in autonomous navigation.',
        previous_companies: 'Boston Dynamics, Amazon Robotics',
        education: 'MS Robotics, Carnegie Mellon University (2015); BS Mechanical Engineering, UT Austin (2013)',
      },
    },
    {
      id: jamesId,
      skills: ['SLAM Algorithms', 'LiDAR Processing', 'Computer Vision', 'ROS2', 'CUDA Programming', 'Research Leadership'],
      expertise_areas: ['Simultaneous Localisation and Mapping', 'Sensor Fusion', 'Multi-Agent Systems', 'Real-Time Computing'],
      industries: ['Autonomous Vehicles', 'Robotics', 'Defence', 'Research'],
      professional_background: {
        summary: 'PhD in Autonomous Systems from MIT (2018) with a thesis on real-time LiDAR SLAM for dynamic environments. Led the SLAM team at Waymo for 5 years, scaling the localisation stack from prototype to production across 1,000+ autonomous vehicles. Published 12 papers on SLAM and multi-agent coordination. Holds 5 patents.',
        previous_companies: 'Waymo, MIT Lincoln Laboratory',
        education: 'PhD Autonomous Systems, MIT (2018); BS Computer Science, Stanford (2013)',
      },
    },
    {
      id: priyaId,
      skills: ['Embedded Systems', 'Firmware Development', 'Fleet Systems Architecture', 'C++/Rust', 'Real-Time OS', 'Team Leadership'],
      expertise_areas: ['Industrial Robot Firmware', 'Fleet Coordination', 'Safety-Critical Systems', 'Hardware-Software Integration'],
      industries: ['Industrial Robotics', 'Automotive', 'Manufacturing Automation'],
      professional_background: {
        summary: 'Systems engineer with 10 years building embedded firmware for industrial robots. Most recently Principal Engineer at ABB Robotics, where Priya led the FlexLoader fleet coordination firmware team. Deep expertise in safety-critical embedded systems (IEC 61508) and real-time operating systems. Manages the 8-person engineering team at SARA.',
        previous_companies: 'ABB Robotics, Bosch, Texas Instruments',
        education: 'MS Electrical Engineering, Georgia Tech (2015); BTech Electronics, IIT Bombay (2013)',
      },
    },
    {
      id: carlosId,
      skills: ['Supply Chain Management', 'Manufacturing Operations', 'Facility Management', 'Vendor Negotiations', 'Hardware Logistics'],
      expertise_areas: ['Hardware Startup Operations', 'Contract Manufacturing', 'Regulatory Compliance', 'Warehouse Operations'],
      industries: ['Robotics', 'Drone Delivery', 'Hardware Manufacturing', 'Logistics'],
      professional_background: {
        summary: 'Operations leader with deep supply chain experience in hardware startups. Previously VP Operations at Zipline (drone delivery), where Carlos scaled manufacturing from 50 to 2,000 drones per year and managed a global supply chain across 3 continents. Expert in contract manufacturing, regulatory compliance (CE, FCC, UL), and facility buildout.',
        previous_companies: 'Zipline, Flex Ltd, Jabil',
        education: 'MBA, Wharton School (2017); BS Industrial Engineering, Georgia Tech (2012)',
      },
    },
    {
      id: lenaId,
      skills: ['Enterprise Sales', 'Partnership Development', 'Customer Success', 'Solution Selling', 'Market Analysis'],
      expertise_areas: ['Industrial Automation Sales', 'Warehouse Automation', 'Pilot-to-Production Conversion', 'Channel Partnerships'],
      industries: ['Industrial Automation', 'Logistics', 'Manufacturing', 'Enterprise Software'],
      professional_background: {
        summary: 'Enterprise sales and partnerships expert with 8 years in industrial automation. Previously Senior Director of Strategic Accounts at Rockwell Automation, where Lena managed a $40M annual portfolio of automation and robotics accounts. Brings deep relationships across manufacturing and logistics decision-makers.',
        previous_companies: 'Rockwell Automation, Siemens, Deloitte Consulting',
        education: 'MBA, Kellogg School of Management (2018); BA Economics, UC Berkeley (2014)',
      },
    },
    {
      id: alexId,
      skills: ['Python', 'ROS2', 'Gazebo Simulation', 'SLAM', 'Docker', 'CI/CD'],
      expertise_areas: ['Robotics Simulation', 'Automated Testing', 'SLAM Algorithms', 'DevOps'],
      industries: ['Robotics', 'Software Engineering'],
      professional_background: {
        summary: 'Recent UT Austin CS graduate (2025) with a specialisation in robotics simulation. Completed a senior thesis on "Efficient Multi-Robot Simulation for Warehouse Environments" under Prof. Andrea Thomaz. Interned at NVIDIA Isaac Sim team in summer 2024. Building the NavCore simulation test framework at SARA.',
        previous_companies: 'NVIDIA (intern), UT Austin Robotics Lab (research assistant)',
        education: 'BS Computer Science, UT Austin (2025)',
      },
    },
  ]

  for (const update of profileUpdates) {
    const { error } = await supabase.from('profiles').update(update).eq('id', update.id)
    if (error) {
      console.error(`   Profile update failed for ${update.id}: ${error.message}`)
    } else {
      console.log(`   Updated profile: ${update.id}`)
    }
  }

  // ── 2. Task Comments ──────────────────────────────────────────────────────
  console.log('\nStep 2: Task Comments')

  const { count: existingComments } = await supabase
    .from('task_comments')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingComments && existingComments > 0) {
    console.log(`   Task comments already exist (${existingComments}), skipping`)
  } else {
    const t = (title: string): string => tasksByTitle.get(title) ?? ''

    const taskComments = [
      // LiDAR sensor fusion
      {
        task_id: t('Complete LiDAR sensor fusion pipeline refactor for multi-sensor support'),
        user_id: jamesId,
        content: 'Finished the multi-sensor abstraction layer. We can now hot-swap between Velodyne, Ouster, and RealSense at runtime without restarting the SLAM pipeline. Latency overhead from the abstraction is <2ms — well within budget.',
        created_at: daysAgo(45),
      },
      {
        task_id: t('Complete LiDAR sensor fusion pipeline refactor for multi-sensor support'),
        user_id: priyaId,
        content: 'Tested the new pipeline on the bench rig with all 3 sensors running simultaneously. Point cloud registration is solid. One edge case: the RealSense depth drops out at >8m range in warehouse lighting conditions. Adding a fallback to LiDAR-only mode when depth confidence drops below threshold.',
        created_at: daysAgo(42),
      },
      // Obstacle avoidance
      {
        task_id: t('Implement obstacle avoidance v2 with dynamic path replanning'),
        user_id: priyaId,
        content: 'The predictive model is working in simulation. We can now anticipate a forklift trajectory 2 seconds ahead and start replanning before the obstacle enters the robot\'s path. Tested with 100 randomised forklift paths — 98.7% successful avoidance rate.',
        created_at: daysAgo(18),
      },
      {
        task_id: t('Implement obstacle avoidance v2 with dynamic path replanning'),
        user_id: jamesId,
        content: 'The 1.3% failure cases are all in tight T-junctions where the robot has no viable replan. We need to add a "yield and wait" behaviour for deadlock situations. I\'ll spec this out — it\'s a 2-day addition.',
        created_at: daysAgo(16),
      },
      {
        task_id: t('Implement obstacle avoidance v2 with dynamic path replanning'),
        user_id: saraId,
        content: 'This is critical for the TechFlow deployment next month. The forklift operators at TechFlow are fast and unpredictable — the yield-and-wait behaviour is non-negotiable. Priya, can you prioritise this?',
        created_at: daysAgo(15),
      },
      // NavCore simulation
      {
        task_id: t('Build NavCore 2.0 simulation test suite with 50+ scenarios'),
        user_id: alexId,
        content: 'We\'re at 38 scenarios now. The hardest ones to simulate are the multi-robot intersection scenarios — Gazebo struggles with more than 4 robots at real-time speed. Investigating Isaac Sim as an alternative for fleet-scale testing.',
        created_at: daysAgo(10),
      },
      {
        task_id: t('Build NavCore 2.0 simulation test suite with 50+ scenarios'),
        user_id: jamesId,
        content: 'Isaac Sim would be a significant upgrade for fleet testing. Alex, can you prototype the migration for the intersection test? If it works, we should move all fleet scenarios there. Keep single-robot tests in Gazebo for speed.',
        created_at: daysAgo(9),
      },
      // Fleet coordination
      {
        task_id: t('Implement centralised task scheduler for multi-robot job dispatch'),
        user_id: priyaId,
        content: 'The scheduler is assigning jobs correctly based on proximity and battery level. Issue: when 2 robots are equidistant, we get race conditions in the assignment. Adding a tiebreaker based on robot ID + load factor. Should resolve by EOD.',
        created_at: daysAgo(8),
      },
      // SLAM GPU acceleration
      {
        task_id: t('Implement GPU-accelerated feature extraction for LiDAR point clouds'),
        user_id: jamesId,
        content: 'CUDA port of the feature extraction is complete. Benchmarks on Jetson AGX Orin: feature extraction dropped from 34ms to 8ms. Total SLAM pipeline is now at 47ms average. We\'re within striking distance of the 50ms target. The remaining 15ms is in loop closure — that\'s next.',
        created_at: daysAgo(7),
      },
      {
        task_id: t('Implement GPU-accelerated feature extraction for LiDAR point clouds'),
        user_id: saraId,
        content: 'James, this is fantastic. Sub-50ms SLAM is a huge differentiator for the pitch deck. Can you document the benchmark methodology? I want to share these numbers with investors.',
        created_at: daysAgo(6),
      },
      // Series B pitch deck
      {
        task_id: t('Draft Series B pitch deck with updated traction metrics and product roadmap'),
        user_id: saraId,
        content: 'Deck is done. 28 slides. Key metrics: 4 pilots, 22 employees, $1.2M ARR, 38% throughput improvement at TechFlow, sub-50ms SLAM (new!), and $12B TAM in warehouse automation. Sending to David Chen for angel feedback before VC meetings.',
        created_at: daysAgo(25),
      },
      {
        task_id: t('Draft Series B pitch deck with updated traction metrics and product roadmap'),
        user_id: lenaId,
        content: 'Reviewed the competitive slide. I\'d strengthen the "Why Now" section — the 3PL market is consolidating rapidly and there\'s a real labour shortage driving automation urgency. I can pull the latest Bureau of Labor Statistics data for warehouse worker attrition.',
        created_at: daysAgo(23),
      },
      // Customer case studies
      {
        task_id: t('Prepare 3 customer case studies with ROI data for investor materials'),
        user_id: lenaId,
        content: 'TechFlow case study is drafted. Headline: "38% throughput increase in 90 days with 2 NavBot Pro units." They approved the quote from their VP Ops for use in investor materials. Meridian draft is 80% done — waiting for final safety incident data from their EHS team.',
        created_at: daysAgo(12),
      },
      // Warehouse survey
      {
        task_id: t('Survey 3 partner warehouses and collect 3D environment scan data'),
        user_id: carlosId,
        content: 'All 3 warehouses surveyed. Key findings: (1) GlobalShip has 1.4m aisles — tighter than standard. (2) FastTrack uses dynamic slotting so rack positions change weekly. (3) All 3 have significant forklift traffic between 6am-2pm. The LiDAR scans are uploaded to the shared drive.',
        created_at: daysAgo(20),
      },
      {
        task_id: t('Survey 3 partner warehouses and collect 3D environment scan data'),
        user_id: priyaId,
        content: 'The 1.4m aisles at GlobalShip are going to be tight for the current NavBot Pro turning radius (1.6m). We need to either adapt the pathfinding for K-turn manoeuvres or negotiate wider aisle access. This is a blocker for the pilot deployment.',
        created_at: daysAgo(19),
      },
      // GlobalShip negotiation
      {
        task_id: t('Negotiate pilot agreement terms with GlobalShip Logistics'),
        user_id: lenaId,
        content: 'GlobalShip is pushing for a 60-day pilot instead of 90 days — they want faster results to present to their board. I think we can compromise at 75 days if we increase the unit count from 2 to 3 to accelerate data collection. Sara, thoughts on the additional unit cost?',
        created_at: daysAgo(5),
      },
      {
        task_id: t('Negotiate pilot agreement terms with GlobalShip Logistics'),
        user_id: saraId,
        content: 'The third unit is worth it if it gets us a faster path to contract. Our COGS on NavBot Pro is $18K and the pilot fee covers 2 units. Let\'s absorb the third unit cost as a customer acquisition investment. If the pilot converts at $300K+ ACV, it\'s a no-brainer.',
        created_at: daysAgo(4),
      },
      // Hiring pipeline
      {
        task_id: t('Conduct technical interview pipeline for 20+ candidates'),
        user_id: priyaId,
        content: 'Pipeline update: 24 candidates in, 8 passed phone screen, 5 completed take-home, 3 scheduled for on-site. Strongest candidate is a former Clearpath Robotics firmware engineer — 6 years of fleet systems experience. Second strong candidate from Nuro with SLAM background.',
        created_at: daysAgo(3),
      },
      {
        task_id: t('Conduct technical interview pipeline for 20+ candidates'),
        user_id: jamesId,
        content: 'I did the technical deep-dive with the Clearpath candidate yesterday. Very strong on real-time systems and fleet architecture. Slightly weaker on ML but that\'s fine — we need systems engineers more than ML engineers right now. Strong hire recommendation.',
        created_at: daysAgo(2),
      },
      // SaaS pricing
      {
        task_id: t('Define tiered pricing model for NavCore Fleet platform'),
        user_id: saraId,
        content: 'Pricing model finalised after benchmarking Locus, 6RS, and Fetch. Our tiers: Starter $200/robot/mo (monitoring), Professional $500/robot/mo (fleet coordination + analytics), Enterprise custom (API + dedicated). At our target of 200 robots deployed, Professional tier alone generates $1.2M ARR in software.',
        created_at: daysAgo(14),
      },
    ]

    const validComments = taskComments.filter((c) => c.task_id)
    const { error } = await supabase.from('task_comments').insert(
      validComments.map((c) => ({ ...c, foundry_id: FOUNDRY_ID }))
    )
    if (error) {
      console.error(`   Task comments failed: ${error.message}`)
    } else {
      console.log(`   ${validComments.length} task comments created`)
    }
  }

  // ── 3. Objective Comments ─────────────────────────────────────────────────
  console.log('\nStep 3: Objective Comments')

  const { count: existingObjComments } = await supabase
    .from('objective_comments')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingObjComments && existingObjComments > 0) {
    console.log(`   Objective comments already exist (${existingObjComments}), skipping`)
  } else {
    const o = (title: string): string => objectivesByTitle.get(title) ?? ''

    const objectiveComments = [
      {
        objective_id: o('Ship NavCore 2.0 beta to 4 pilot customers'),
        user_id: jamesId,
        content: 'Major milestone: sensor fusion pipeline refactor is complete and tested. We now support 3 LiDAR vendors natively. The obstacle avoidance v2 is 75% done — Priya is leading the yield-and-wait behaviour addition. On track for beta deployment to TechFlow next month.',
        created_at: daysAgo(14),
      },
      {
        objective_id: o('Reduce SLAM latency to sub-50ms for real-time operation'),
        user_id: jamesId,
        content: 'GPU-accelerated feature extraction has brought us to 47ms average SLAM latency. This is a breakthrough result — when I started at SARA, we were at 120ms. The remaining optimisation is in loop closure, where I believe we can shave another 5-8ms with incremental map matching. We are ahead of schedule on this objective.',
        created_at: daysAgo(6),
      },
      {
        objective_id: o('Secure warm introductions to 8 target VC firms'),
        user_id: saraId,
        content: 'Strong progress on fundraising pipeline. We have warm intros to 6 of our 8 target firms through angel referrals. Meetings scheduled with Lux Capital (next week), Eclipse Ventures (2 weeks), and Andreessen Horowitz (3 weeks). The sub-50ms SLAM result and TechFlow case study are the strongest cards in our hand.',
        created_at: daysAgo(5),
      },
      {
        objective_id: o('Complete warehouse environment mapping prototype'),
        user_id: priyaId,
        content: 'The warehouse scans from Carlos revealed a challenge we didn\'t anticipate: GlobalShip\'s 1.4m aisles are tighter than our current turning radius allows. I\'m working on a K-turn manoeuvre for narrow aisles. This adds 8 seconds per aisle transition but keeps us within the physical constraints. Not ideal but workable for the pilot.',
        created_at: daysAgo(10),
      },
      {
        objective_id: o('Hire 8 robotics engineers in Q1 2026'),
        user_id: priyaId,
        content: 'Pipeline is healthy: 24 candidates in, 3 at on-site stage. The Clearpath candidate is our top pick for the fleet systems role. We still need to fill the SLAM engineer and 2 firmware positions. RoboCon next week should help — James and I are both attending the career fair.',
        created_at: daysAgo(3),
      },
      {
        objective_id: o('Convert 3 manufacturing pilots to paid annual contracts'),
        user_id: lenaId,
        content: 'TechFlow proposal is out — $280K ACV for 5 units + Professional tier SaaS. Their VP Ops is championing internally. Meridian proposal is 80% done. Precision Dynamics wants a 2-year term with a 15% discount — Sara and I are countering at 10% with a fleet expansion clause.',
        created_at: daysAgo(8),
      },
      {
        objective_id: o('Launch pilot with 2 logistics partners'),
        user_id: lenaId,
        content: 'GlobalShip negotiation update: they want 60 days instead of 90. We\'re compromising at 75 days with 3 units (up from 2) to accelerate data collection. FastTrack is 2-3 weeks behind — their procurement team moves slowly. Hoping to have both pilots signed by end of month.',
        created_at: daysAgo(4),
      },
      {
        objective_id: o('Implement multi-robot fleet coordination engine'),
        user_id: priyaId,
        content: 'The centralised task scheduler is functional — assigning jobs based on proximity, battery, and load. The collision avoidance layer is next (Alex is leading). The 8-robot stress test is scheduled for next sprint. If it passes, we\'re ready to ship fleet coordination as part of NavCore 2.0.',
        created_at: daysAgo(7),
      },
    ]

    const validComments = objectiveComments.filter((c) => c.objective_id)
    const { error } = await supabase.from('objective_comments').insert(
      validComments.map((c) => ({ ...c, foundry_id: FOUNDRY_ID }))
    )
    if (error) {
      console.error(`   Objective comments failed: ${error.message}`)
    } else {
      console.log(`   ${validComments.length} objective comments created`)
    }
  }

  // ── 4. Knowledge Domains & Notes ──────────────────────────────────────────
  console.log('\nStep 4: Knowledge Vault')

  const { count: existingDomains } = await supabase
    .from('knowledge_domains')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingDomains && existingDomains > 0) {
    console.log(`   Knowledge domains already exist, skipping`)
  } else {
    const domains = [
      { id: uuidv4(), name: 'Technology & IP', slug: 'technology-ip', description: 'NavCore platform, SLAM algorithms, patents, and technical architecture decisions.', icon: 'cpu', sort_order: 1 },
      { id: uuidv4(), name: 'Market & Competitors', slug: 'market-competitors', description: 'Market sizing, competitive intelligence, and industry trends in warehouse automation.', icon: 'bar-chart', sort_order: 2 },
      { id: uuidv4(), name: 'Customers & Pilots', slug: 'customers-pilots', description: 'Customer insights, pilot results, deployment learnings, and case studies.', icon: 'users', sort_order: 3 },
      { id: uuidv4(), name: 'Fundraising & Finance', slug: 'fundraising-finance', description: 'Series B preparation, financial modelling, investor pipeline, and board materials.', icon: 'dollar-sign', sort_order: 4 },
    ]

    const { error: domainError } = await supabase.from('knowledge_domains').insert(
      domains.map((d) => ({ ...d, foundry_id: FOUNDRY_ID }))
    )

    if (domainError) {
      console.error(`   Knowledge domains failed: ${domainError.message}`)
    } else {
      console.log(`   ${domains.length} knowledge domains created`)
    }

    const [techDomain, marketDomain, customerDomain, fundingDomain] = domains

    const notes = [
      // Technology & IP
      {
        domain_id: techDomain.id,
        title: 'NavCore SLAM achieves sub-50ms latency with GPU acceleration',
        description: 'Benchmark results for GPU-accelerated SLAM pipeline on Jetson AGX Orin.',
        content: 'After porting feature extraction to CUDA on the Jetson AGX Orin, the SLAM pipeline now achieves 47ms average localisation latency (down from 82ms CPU-only). Breakdown: point cloud preprocessing 5ms, feature extraction 8ms (was 34ms on CPU), scan matching 18ms, loop closure 12ms, map update 4ms. This positions NavBot Pro as the fastest-localising AMR in its price range. The Locus Robotics Vector reportedly runs at ~80ms; MiR claims 60ms but hasn\'t published benchmarks.',
        note_type: 'fact', tags: ['slam', 'gpu', 'benchmark', 'milestone'], is_pinned: true, is_verified: true, confidence: 0.95, source_specialist: 'Dr. James Okafor',
      },
      {
        domain_id: techDomain.id,
        title: 'Decision: Multi-sensor abstraction layer architecture',
        description: 'Architecture decision for supporting multiple LiDAR vendors.',
        content: 'Evaluated 3 approaches for multi-sensor support: (1) vendor-specific drivers with shared interface, (2) ROS2 abstraction with custom messages, (3) hardware abstraction layer (HAL) with plug-in drivers. Decided on option 3: HAL with plug-in drivers. Reasons: runtime sensor swapping without restart, <2ms overhead, and easier CE certification since sensor-specific code is isolated. Trade-off: more complex initial implementation (2 weeks vs 1 week for option 1) but dramatically better maintainability.',
        note_type: 'decision', tags: ['architecture', 'sensors', 'lidar'], is_pinned: false, is_verified: true, confidence: 0.98, source_specialist: 'Dr. James Okafor',
      },
      {
        domain_id: techDomain.id,
        title: 'Patent portfolio: 3 filed, 2 pending',
        description: 'Intellectual property status summary.',
        content: 'Filed patents: (1) "Real-time LiDAR SLAM with GPU-accelerated feature extraction for mobile robots" — filed Sept 2025, (2) "Multi-robot fleet coordination protocol with deadlock prevention" — filed Nov 2025, (3) "Adaptive sensor fusion for heterogeneous LiDAR configurations" — filed Jan 2026. Pending applications: (4) Predictive obstacle avoidance using trajectory forecasting, (5) Narrow-aisle K-turn navigation for warehouse AMRs. Patent counsel: Wilson Sonsini. Estimated portfolio value for Series B: strong defensibility signal.',
        note_type: 'fact', tags: ['ip', 'patents', 'legal'], is_pinned: true, is_verified: true, confidence: 0.97, source_specialist: 'Sara Macedo',
      },
      {
        domain_id: techDomain.id,
        title: 'NavBot Pro hardware BOM and unit economics',
        description: 'Cost breakdown for NavBot Pro production unit.',
        content: 'NavBot Pro per-unit BOM at 100-unit volume: Jetson AGX Orin module $899, Velodyne VLP-16 LiDAR $3,999, Intel RealSense D455 x2 $598, chassis + drivetrain $4,200, battery (48V 40Ah LFP) $1,800, motor controllers + electronics $2,100, UWB beacons $320, assembly labour $1,400, enclosure + finishing $980, packaging $280. Total COGS: $16,576. At $45,000 ASP, gross margin is 63.2%. At 500-unit volume, COGS drops to ~$14,200 (volume pricing on Jetson and LiDAR), pushing margin to 68.4%.',
        note_type: 'fact', tags: ['hardware', 'bom', 'unit-economics', 'manufacturing'], is_pinned: true, is_verified: true, confidence: 0.92, source_specialist: 'Carlos Mendez',
      },
      // Market & Competitors
      {
        domain_id: marketDomain.id,
        title: 'Warehouse automation TAM: $12B by 2028, 24% CAGR',
        description: 'Market sizing data from McKinsey and internal analysis.',
        content: 'The global warehouse automation market is projected to reach $41B by 2030 (McKinsey, 2025). The AMR subsegment — our addressable market — is $12B by 2028 at 24% CAGR. Key drivers: (1) chronic warehouse labour shortage (800K unfilled positions in US alone), (2) e-commerce fulfilment pressure (next-day delivery expectations), (3) workplace safety regulations tightening globally. The mid-market segment ($50K-$100K per unit) is the fastest growing at 35% CAGR as large enterprises are already served by Kiva/Amazon and the bottom is too price-sensitive.',
        note_type: 'insight', tags: ['market-sizing', 'tam', 'growth'], is_pinned: true, is_verified: true, confidence: 0.88, source_specialist: 'Sara Macedo',
      },
      {
        domain_id: marketDomain.id,
        title: 'Competitive teardown: Locus Robotics vs SARA Robotics',
        description: 'Detailed comparison with closest competitor.',
        content: 'Locus Robotics (Series E, $300M raised) is our most relevant competitor. Key differences: (1) Price: Locus charges $25K/year lease per robot vs our $45K purchase + $500/mo SaaS — different models but comparable 3-year TCO. (2) Navigation: Locus uses QR code floor markers for localisation — SARA uses marker-free LiDAR SLAM. This is a major differentiator for warehouses that can\'t shut down to install markers. (3) Fleet size: Locus targets 50+ robot deployments; SARA targets 2-20 (mid-market). (4) Manipulation: Neither offers pallet manipulation yet — our module gives us a 6-month lead. (5) Software: Locus fleet management is proprietary and closed; NavCore Fleet is API-first and integrable with WMS systems.',
        note_type: 'insight', tags: ['competitors', 'locus-robotics', 'competitive-intelligence'], is_pinned: true, is_verified: true, confidence: 0.9, source_specialist: 'Lena Yun',
      },
      {
        domain_id: marketDomain.id,
        title: 'Key trend: 3PLs are the fastest-growing buyer segment for AMRs',
        description: 'Market trend analysis from customer conversations and industry data.',
        content: 'In the last 6 months, inbound interest has shifted: 60% of our qualified leads are now 3PLs (third-party logistics providers), up from 20% at launch. Why: 3PLs operate on thin margins (3-5%) and face intense pressure to reduce costs. They can\'t afford $200K+ AGVs but desperately need automation. Our $45K price point + 48-hour deployment is perfectly positioned. Additionally, 3PLs manage multiple client warehouses — a single successful pilot can lead to 5-10x expansion across their network. GlobalShip alone operates 23 warehouses.',
        note_type: 'observation', tags: ['3pl', 'market-trend', 'customer-segment'], is_pinned: false, is_verified: false, confidence: 0.85, source_specialist: 'Lena Yun',
      },
      // Customers & Pilots
      {
        domain_id: customerDomain.id,
        title: 'TechFlow Manufacturing pilot results: 38% throughput increase',
        description: 'Pilot results from our longest-running customer.',
        content: '90-day pilot at TechFlow Manufacturing (automotive parts, 120,000 sqft facility): 2 NavBot Pro units running 16 hours/day on material transport routes. Results: throughput increased 38% (from 245 to 338 pallets/day), material handling labour reduced by 2.5 FTEs (from 8 to 5.5), zero safety incidents (down from 4 near-misses per quarter), NavBot Pro uptime: 97.3%. TechFlow VP Ops quote: "The NavBots paid for themselves in the first 60 days." They\'re now requesting a commercial proposal for 5 units.',
        note_type: 'fact', tags: ['pilot-results', 'techflow', 'roi', 'case-study'], is_pinned: true, is_verified: true, confidence: 0.96, source_specialist: 'Lena Yun',
      },
      {
        domain_id: customerDomain.id,
        title: 'Meridian Automotive pilot: 52% reduction in material handling incidents',
        description: 'Safety-focused pilot results.',
        content: 'Meridian Automotive (brake components manufacturing, 85,000 sqft) ran a 60-day pilot focused on safety in their hazardous materials zone. Results: material handling incidents dropped 52% (from 6.2 to 3.0 per quarter annualised), zero forklift-robot collisions despite operating in shared space, compliance with their internal EHS standards. Key learning: our obstacle avoidance v1 struggled with reflective surfaces near the paint booth. Obstacle avoidance v2 (dynamic path replanning) was developed partially in response to this feedback.',
        note_type: 'fact', tags: ['pilot-results', 'meridian', 'safety', 'case-study'], is_pinned: true, is_verified: true, confidence: 0.93, source_specialist: 'Lena Yun',
      },
      {
        domain_id: customerDomain.id,
        title: 'Lesson: 48-hour deployment is our biggest competitive advantage',
        description: 'Deployment speed insight from customer conversations.',
        content: 'Across 4 pilot deployments, our average time from hardware delivery to first autonomous transport run is 47 hours. Competitors: Locus Robotics 2-4 weeks (QR code installation), MiR 1-2 weeks (environment mapping required), 6 River Systems 3-6 weeks (custom integration). Every customer we\'ve talked to cites deployment speed as a top-3 evaluation criterion. Reason: warehouse ops can\'t afford downtime for installation. Our marker-free SLAM is the technical enabler — no floor modification required. This should be front and centre in the pitch deck.',
        note_type: 'lesson', tags: ['deployment', 'competitive-advantage', 'customer-insight'], is_pinned: true, is_verified: true, confidence: 0.95, source_specialist: 'Sara Macedo',
      },
      {
        domain_id: customerDomain.id,
        title: 'Customer request: WMS integration API is the #1 feature request',
        description: 'Product feedback from pilot customers.',
        content: 'All 4 pilot customers and 3 of our qualified prospects have asked for native WMS (Warehouse Management System) integration. Specifically: Manhattan Associates (2 customers), SAP EWM (1 customer), and Oracle WMS Cloud (1 prospect). Currently, NavCore Fleet requires manual job creation or CSV import. Building a REST API + webhook layer for WMS integration would unlock Enterprise tier pricing and remove the biggest barrier to fleet-scale deployments. Estimated effort: 6-8 weeks. Priority: HIGH for Series B story.',
        note_type: 'insight', tags: ['product-feedback', 'wms', 'integration', 'feature-request'], is_pinned: false, is_verified: true, confidence: 0.92, source_specialist: 'Lena Yun',
      },
      // Fundraising & Finance
      {
        domain_id: fundingDomain.id,
        title: 'Series B target: $25M at $100M pre-money valuation',
        description: 'Fundraising strategy and valuation rationale.',
        content: 'Target: $25M Series B at $100M pre-money. Valuation rationale: 20x forward revenue multiple on projected $5M ARR by end of 2026, benchmarked against Locus Robotics ($1.3B at 400 robots deployed — we\'re on a faster trajectory per-unit). Use of funds: 40% engineering (team growth to 35), 25% manufacturing scale-up (500-unit production capacity), 20% sales & marketing (enterprise sales team, channel partnerships), 15% G&A and working capital. Expected runway: 24 months to Series C or profitability.',
        note_type: 'decision', tags: ['series-b', 'fundraising', 'valuation', 'strategy'], is_pinned: true, is_verified: true, confidence: 0.88, source_specialist: 'Sara Macedo',
      },
      {
        domain_id: fundingDomain.id,
        title: 'Investor pipeline: 6 warm intros, 3 meetings scheduled',
        description: 'Current state of Series B investor outreach.',
        content: 'Warm introductions secured to: Lux Capital (Josh Wolfe — robotics thesis), Eclipse Ventures (Greg Reichow — hardware focus), Andreessen Horowitz (Connie Chan — applied AI), Khosla Ventures (Vinod Khosla — deep tech), NEA (Scott Sandell — growth), and Accel (Rich Wong — enterprise). First meetings: Lux Capital (next Tuesday), Eclipse (Feb 28), a16z (March 5). Strategy: position as "the Shopify of warehouse robotics" — making autonomous robots accessible to the mid-market, not just Amazon-scale operations.',
        note_type: 'fact', tags: ['investor-pipeline', 'vc-meetings', 'fundraising'], is_pinned: true, is_verified: true, confidence: 0.9, source_specialist: 'Sara Macedo',
      },
      {
        domain_id: fundingDomain.id,
        title: 'Unit economics are Series B ready',
        description: 'Summary of unit economics for investor conversations.',
        content: 'Hardware: $45K ASP, 63% gross margin at current volume. SaaS: $500/robot/month Professional tier, ~95% gross margin. Blended customer LTV (3-year): $63K per robot (hardware + SaaS). CAC: ~$12K per robot (pilot conversion model). LTV:CAC ratio: 5.25x. Payback period: 7 months. At 200 robots deployed (target end of 2026): $9M hardware revenue + $1.2M SaaS ARR. These unit economics compare favourably to Locus (estimated 3.2x LTV:CAC on lease model) and are significantly better than traditional AGV economics.',
        note_type: 'fact', tags: ['unit-economics', 'ltv-cac', 'financials', 'series-b'], is_pinned: true, is_verified: true, confidence: 0.91, source_specialist: 'Sara Macedo',
      },
      {
        domain_id: fundingDomain.id,
        title: 'Risk: Velodyne LiDAR supply chain concentration',
        description: 'Supply chain risk identified during Series B prep.',
        content: 'Velodyne VLP-16 is our primary LiDAR sensor and represents $4K of our $16.6K BOM. Risks: (1) Velodyne was acquired by Ouster in 2023 — product roadmap uncertain, (2) Lead times have extended from 6 to 12 weeks, (3) Single-source dependency. Mitigation: the multi-sensor HAL we built means we can switch to Ouster OS1-64 ($5,500, higher cost but better specs) or Hesai QT64 ($2,800, lower cost, Chinese supplier). Recommendation: dual-qualify Ouster and Hesai before Series B close to derisk the narrative for investors.',
        note_type: 'observation', tags: ['supply-chain', 'risk', 'lidar', 'velodyne'], is_pinned: false, is_verified: true, confidence: 0.87, source_specialist: 'Carlos Mendez',
      },
    ]

    const { error: notesError } = await supabase.from('knowledge_notes').insert(
      notes.map((n) => ({ ...n, foundry_id: FOUNDRY_ID }))
    )

    if (notesError) {
      console.error(`   Knowledge notes failed: ${notesError.message}`)
    } else {
      console.log(`   ${notes.length} knowledge notes created`)
    }

    for (const domain of domains) {
      const count = notes.filter((n) => n.domain_id === domain.id).length
      await supabase.from('knowledge_domains').update({ note_count: count }).eq('id', domain.id)
    }
    console.log('   Domain note counts updated')
  }

  // ── 5. Task History ───────────────────────────────────────────────────────
  console.log('\nStep 5: Task History')

  // task_history doesn't have foundry_id — check by task_id existence
  const anyTaskId = Array.from(tasksByTitle.values())[0]
  const { count: existingHistory } = await supabase
    .from('task_history')
    .select('*', { count: 'exact', head: true })
    .eq('task_id', anyTaskId ?? '')

  if (existingHistory && existingHistory > 0) {
    console.log(`   Task history already exists (${existingHistory}), skipping`)
  } else {
    const t = (title: string): string => tasksByTitle.get(title) ?? ''

    const historyEntries = [
      // LiDAR sensor fusion — completed
      { task_id: t('Complete LiDAR sensor fusion pipeline refactor for multi-sensor support'), user_id: jamesId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(5) },
      { task_id: t('Complete LiDAR sensor fusion pipeline refactor for multi-sensor support'), user_id: jamesId, action_type: 'STATUS_CHANGE', changes: { status: { old: 'Pending', new: 'Accepted' } }, created_at: monthsAgo(5) },
      { task_id: t('Complete LiDAR sensor fusion pipeline refactor for multi-sensor support'), user_id: jamesId, action_type: 'COMPLETED', changes: { status: { old: 'Accepted', new: 'Completed' }, progress: { old: 80, new: 100 } }, created_at: daysAgo(45) },
      // Obstacle avoidance — in progress
      { task_id: t('Implement obstacle avoidance v2 with dynamic path replanning'), user_id: priyaId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(3) },
      { task_id: t('Implement obstacle avoidance v2 with dynamic path replanning'), user_id: priyaId, action_type: 'STATUS_CHANGE', changes: { status: { old: 'Pending', new: 'Accepted' } }, created_at: monthsAgo(3) },
      { task_id: t('Implement obstacle avoidance v2 with dynamic path replanning'), user_id: priyaId, action_type: 'UPDATED', changes: { progress: { old: 0, new: 40 } }, created_at: daysAgo(20) },
      { task_id: t('Implement obstacle avoidance v2 with dynamic path replanning'), user_id: priyaId, action_type: 'UPDATED', changes: { progress: { old: 40, new: 75 } }, created_at: daysAgo(10) },
      // SLAM profiling — completed
      { task_id: t('Profile and optimise SLAM point cloud processing pipeline'), user_id: jamesId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(5) },
      { task_id: t('Profile and optimise SLAM point cloud processing pipeline'), user_id: jamesId, action_type: 'COMPLETED', changes: { status: { old: 'Accepted', new: 'Completed' }, progress: { old: 60, new: 100 } }, created_at: monthsAgo(3) },
      // GPU acceleration — in progress
      { task_id: t('Implement GPU-accelerated feature extraction for LiDAR point clouds'), user_id: jamesId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(2) },
      { task_id: t('Implement GPU-accelerated feature extraction for LiDAR point clouds'), user_id: jamesId, action_type: 'UPDATED', changes: { progress: { old: 0, new: 50 } }, created_at: daysAgo(14) },
      { task_id: t('Implement GPU-accelerated feature extraction for LiDAR point clouds'), user_id: jamesId, action_type: 'UPDATED', changes: { progress: { old: 50, new: 85 } }, created_at: daysAgo(7) },
      // Pitch deck — completed
      { task_id: t('Draft Series B pitch deck with updated traction metrics and product roadmap'), user_id: saraId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(3) },
      { task_id: t('Draft Series B pitch deck with updated traction metrics and product roadmap'), user_id: saraId, action_type: 'COMPLETED', changes: { status: { old: 'Accepted', new: 'Completed' }, progress: { old: 70, new: 100 } }, created_at: daysAgo(25) },
      // Fleet coordination spec — completed
      { task_id: t('Design fleet coordination protocol specification document'), user_id: jamesId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(4) },
      { task_id: t('Design fleet coordination protocol specification document'), user_id: jamesId, action_type: 'COMPLETED', changes: { status: { old: 'Accepted', new: 'Completed' } }, created_at: monthsAgo(3) },
      // Warehouse survey — completed
      { task_id: t('Survey 3 partner warehouses and collect 3D environment scan data'), user_id: carlosId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(2) },
      { task_id: t('Survey 3 partner warehouses and collect 3D environment scan data'), user_id: carlosId, action_type: 'COMPLETED', changes: { status: { old: 'Accepted', new: 'Completed' } }, created_at: daysAgo(20) },
      // TechFlow proposal — completed
      { task_id: t('Prepare commercial proposal and pricing for TechFlow Manufacturing'), user_id: lenaId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(3) },
      { task_id: t('Prepare commercial proposal and pricing for TechFlow Manufacturing'), user_id: lenaId, action_type: 'COMPLETED', changes: { status: { old: 'Accepted', new: 'Completed' } }, created_at: daysAgo(15) },
      // Simulation test suite — in progress
      { task_id: t('Build NavCore 2.0 simulation test suite with 50+ scenarios'), user_id: alexId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(2) },
      { task_id: t('Build NavCore 2.0 simulation test suite with 50+ scenarios'), user_id: alexId, action_type: 'UPDATED', changes: { progress: { old: 0, new: 35 } }, created_at: daysAgo(18) },
      { task_id: t('Build NavCore 2.0 simulation test suite with 50+ scenarios'), user_id: alexId, action_type: 'UPDATED', changes: { progress: { old: 35, new: 65 } }, created_at: daysAgo(8) },
      // Hiring pipeline — in progress
      { task_id: t('Conduct technical interview pipeline for 20+ candidates'), user_id: priyaId, action_type: 'CREATED', changes: {}, created_at: monthsAgo(2) },
      { task_id: t('Conduct technical interview pipeline for 20+ candidates'), user_id: priyaId, action_type: 'UPDATED', changes: { progress: { old: 0, new: 30 } }, created_at: daysAgo(12) },
      { task_id: t('Conduct technical interview pipeline for 20+ candidates'), user_id: priyaId, action_type: 'UPDATED', changes: { progress: { old: 30, new: 55 } }, created_at: daysAgo(3) },
    ]

    const validEntries = historyEntries.filter((e) => e.task_id)
    const { error: historyError } = await supabase.from('task_history').insert(validEntries)
    if (historyError) {
      console.error(`   Task history failed: ${historyError.message}`)
    } else {
      console.log(`   ${validEntries.length} task history entries created`)
    }
  }

  // ── 6. Standups ───────────────────────────────────────────────────────────
  console.log('\nStep 6: Standups')

  const { count: existingStandups } = await supabase
    .from('standups')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingStandups && existingStandups > 0) {
    console.log(`   Standups already exist, skipping`)
  } else {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yDate = yesterday.toISOString().split('T')[0]

    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const tdaDate = twoDaysAgo.toISOString().split('T')[0]

    const standups = [
      {
        user_id: saraId, foundry_id: FOUNDRY_ID, standup_date: yDate,
        completed: 'Finalised Series B pitch deck (28 slides). Sent to David Chen for angel feedback. Scheduled first VC meeting with Lux Capital for next Tuesday. Reviewed and approved Lena\'s TechFlow commercial proposal ($280K ACV).',
        planned: 'Prepare for Lux Capital partner meeting — rehearse pitch and Q&A. Review cap table dilution scenarios with our lawyer. Follow up on a16z meeting confirmation.',
        blockers: 'The auditor (KPMG) is delayed on the Series A financial review — they need another 2 weeks. This pushes back our data room completion and could delay due diligence start.',
        blocker_tags: ['fundraising', 'audit'], blocker_severity: 'high', needs_help: false,
      },
      {
        user_id: jamesId, foundry_id: FOUNDRY_ID, standup_date: yDate,
        completed: 'CUDA feature extraction port complete — SLAM pipeline at 47ms average. Reviewed Priya\'s obstacle avoidance yield-and-wait spec. Technical deep-dive interview with Clearpath candidate (strong hire recommendation).',
        planned: 'Optimise loop closure for final 5-8ms SLAM improvement. Document GPU benchmark methodology for investor materials. Start fleet coordination spec review for 8-robot stress test.',
        blockers: null, blocker_tags: [], blocker_severity: null, needs_help: false,
      },
      {
        user_id: priyaId, foundry_id: FOUNDRY_ID, standup_date: yDate,
        completed: 'Centralised task scheduler passing all unit tests — race condition fix deployed. Obstacle avoidance v2 at 98.7% success rate in simulation. Screened 5 firmware engineer candidates.',
        planned: 'Add yield-and-wait behaviour for deadlock scenarios (2-day task). Run scheduler integration test with Alex\'s simulation. On-site interview for Clearpath candidate on Friday.',
        blockers: 'Need access to TechFlow Manufacturing VPN to test NavCore 2.0 beta deployment remotely. Their IT team has been unresponsive for 5 days. Carlos — can you escalate with their ops contact?',
        blocker_tags: ['deployment', 'techflow', 'vpn-access'], blocker_severity: 'medium', needs_help: true,
      },
      {
        user_id: carlosId, foundry_id: FOUNDRY_ID, standup_date: yDate,
        completed: 'All 3 warehouse surveys complete and LiDAR scans uploaded. Received quotes from 2 contract manufacturers for the 100-unit production run. Started CE certification prep docs.',
        planned: 'Compare CM quotes and prepare recommendation for Sara. Follow up with TechFlow IT on VPN access for Priya. Begin logistics planning for GlobalShip pilot deployment.',
        blockers: null, blocker_tags: [], blocker_severity: null, needs_help: false,
      },
      {
        user_id: lenaId, foundry_id: FOUNDRY_ID, standup_date: yDate,
        completed: 'TechFlow commercial proposal sent ($280K ACV). GlobalShip pilot negotiation — compromised at 75 days with 3 units. Meridian case study draft 80% complete.',
        planned: 'Follow up on TechFlow proposal — their VP Ops is presenting to CFO this week. Complete Meridian case study. Start FastTrack Distribution pilot negotiation.',
        blockers: 'Meridian won\'t release their safety incident data for the case study without legal review. Their legal team is backed up for 2 weeks. Without this data, the case study is incomplete for investor materials.',
        blocker_tags: ['case-study', 'legal', 'meridian'], blocker_severity: 'medium', needs_help: false,
      },
      {
        user_id: alexId, foundry_id: FOUNDRY_ID, standup_date: tdaDate,
        completed: 'Simulation test suite at 38 of 50 scenarios. Prototyped Isaac Sim migration for fleet scenarios — performance is 3x better than Gazebo for multi-robot tests. Fixed 2 CI pipeline flakes.',
        planned: 'Complete 12 remaining Gazebo scenarios. Migrate 5 fleet intersection scenarios to Isaac Sim as proof-of-concept. Start collision avoidance system implementation (inter-robot UWB layer).',
        blockers: 'Isaac Sim licence costs $2,400/year — need budget approval before we can commit to the migration. James recommended it but I don\'t have purchasing authority.',
        blocker_tags: ['budget', 'tooling', 'isaac-sim'], blocker_severity: 'low', needs_help: true,
      },
    ]

    const { error: standupError } = await supabase.from('standups').insert(standups)
    if (standupError) {
      console.error(`   Standups failed: ${standupError.message}`)
    } else {
      console.log(`   ${standups.length} standups created`)
    }
  }

  // ── 7. Foundry Function Coverage ──────────────────────────────────────────
  console.log('\nStep 7: Function Coverage')

  const { count: existingCoverage } = await supabase
    .from('foundry_function_coverage')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingCoverage && existingCoverage > 0) {
    console.log(`   Function coverage already exists, skipping`)
  } else {
    // Look up business functions by name
    const { data: bfData } = await supabase.from('business_functions').select('id, name')
    const bfMap = new Map<string, string>()
    bfData?.forEach((bf) => bfMap.set(bf.name.toLowerCase(), bf.id))

    const findBf = (keyword: string): string | undefined => {
      for (const [name, id] of bfMap) {
        if (name.includes(keyword.toLowerCase())) return id
      }
      return undefined
    }

    const coverageItems = [
      { keyword: 'hardware', coverage_status: 'covered', covered_by: 'Dr. James Okafor (CTO) + Priya Sharma (VP Engineering)', notes: 'Full hardware and firmware coverage. James leads NavCore architecture, Priya leads fleet systems and embedded firmware.' },
      { keyword: 'product', coverage_status: 'covered', covered_by: 'Sara Macedo (Founder & CEO)', notes: 'Sara owns product roadmap, customer discovery, and feature prioritisation. Strong product instincts from Boston Dynamics and Amazon Robotics background.' },
      { keyword: 'supply', coverage_status: 'covered', covered_by: 'Carlos Mendez (Head of Operations)', notes: 'Carlos manages CM relationships, component sourcing, and logistics. Deep experience from Zipline scaling. Handles regulatory compliance (CE, FCC).' },
      { keyword: 'brand', coverage_status: 'partial', covered_by: 'Sara Macedo (partial) + Lena Yun (partial)', notes: 'No dedicated marketing resource. Sara handles thought leadership and conference talks. Lena creates sales collateral. Need a marketing hire post-Series B.' },
      { keyword: 'financial', coverage_status: 'gap', covered_by: null, notes: 'Using a fractional CFO (2 days/month) for financial modelling and board reporting. Need a full-time finance leader before Series B close to manage due diligence and post-close financial operations.' },
      { keyword: 'contract', coverage_status: 'partial', covered_by: 'Lena Yun (sales contracts) + external counsel', notes: 'Lena handles customer contract negotiations with Wilson Sonsini on retainer for review. No in-house legal. IP management handled externally.' },
      { keyword: 'community', coverage_status: 'gap', covered_by: null, notes: 'No community or developer relations function. NavCore Fleet API documentation is written by engineering. Post-Series B: need a developer advocate for the API ecosystem.' },
      { keyword: 'manufacturing', coverage_status: 'partial', covered_by: 'Carlos Mendez', notes: 'Carlos has strong DFM knowledge from Zipline but we are pre-mass-production. Full manufacturing coverage needed once 500-unit production ramp begins.' },
    ]

    const validCoverage = coverageItems
      .map((c) => {
        const functionId = findBf(c.keyword)
        if (!functionId) return null
        return {
          foundry_id: FOUNDRY_ID,
          function_id: functionId,
          coverage_status: c.coverage_status,
          covered_by: c.covered_by,
          notes: c.notes,
          assessed_by: saraId,
        }
      })
      .filter(Boolean)

    if (validCoverage.length > 0) {
      const { error: coverageError } = await supabase.from('foundry_function_coverage').upsert(validCoverage, { onConflict: 'foundry_id,function_id' })
      if (coverageError) {
        console.error(`   Function coverage failed: ${coverageError.message}`)
      } else {
        console.log(`   ${validCoverage.length} function coverage entries created`)
      }
    } else {
      console.log('   No matching business functions found — skipping coverage')
    }
  }

  // ── 8. Blueprint ──────────────────────────────────────────────────────────
  console.log('\nStep 8: Blueprint')

  const { count: existingBlueprints } = await supabase
    .from('blueprints')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingBlueprints && existingBlueprints > 0) {
    console.log(`   Blueprint already exists, skipping`)
  } else {
    const { error: blueprintError } = await supabase.from('blueprints').insert({
      foundry_id: FOUNDRY_ID,
      name: 'Series B Readiness',
      description: 'End-to-end blueprint for achieving Series B readiness: close $25M round, ship NavCore v2.0, convert pilots to paid contracts, and scale team. Covers fundraising, product, sales, and operations tracks.',
      project_type: 'venture',
      project_stage: 'prototype',
      status: 'active',
      coverage_score: 68.0,
      critical_gaps: 2,
      total_domains: 8,
      covered_domains: 5,
      created_by: saraId,
    })

    if (blueprintError) {
      console.error(`   Blueprint failed: ${blueprintError.message}`)
    } else {
      console.log('   Blueprint created')
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n Extended seed complete!\n')
  console.log('='.repeat(60))
  console.log('Added:')
  console.log('  Profile depth (skills, background, expertise) for all 6 users')
  console.log('  20+ task comments (realistic cross-team discussions)')
  console.log('  8 objective comments (progress updates)')
  console.log('  4 knowledge domains + 16 knowledge notes')
  console.log('  26 task history entries spanning 6 months')
  console.log('  6 standups (with blockers and help flags)')
  console.log('  8 foundry function coverage entries')
  console.log('  1 blueprint (Series B Readiness)')
  console.log('='.repeat(60))
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
