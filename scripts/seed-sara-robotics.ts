/**
 * @file seed-sara-robotics.ts
 *
 * @description Seeds a complete demo company — SARA Robotics — for Series B demonstration.
 * Creates: foundry, users, foundry memberships, teams, strategic objectives,
 * regular objectives, and tasks spanning 6 months of company history.
 *
 * @usage npx tsx scripts/seed-sara-robotics.ts
 *
 * Idempotent: safe to run multiple times. Checks for existing records before inserting.
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

// ─── Constants ────────────────────────────────────────────────────────────────

const FOUNDRY_ID = 'sara-robotics'
const PASSWORD = 'SaraRobotics2026!'
const DEMO_EXPIRES_AT = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

const ACCOUNTS = [
  {
    email: 'sara.f.macedo@gmail.com',
    fullName: 'Sara Macedo',
    role: 'Founder' as const,
    headline: 'Founder & CEO at SARA Robotics',
    bio: 'Former Boston Dynamics engineer who left to build autonomous mobile robots that are actually affordable and deployable for mid-market warehouses. 12 years in robotics, 3 patents in autonomous navigation.',
  },
  {
    email: 'james.okafor@sararobotics.com',
    fullName: 'Dr. James Okafor',
    role: 'Executive' as const,
    headline: 'CTO at SARA Robotics',
    bio: 'PhD in Autonomous Systems from MIT. Led the SLAM team at Waymo for 5 years before joining Sara to build NavCore. Specialises in real-time LiDAR processing and multi-agent coordination.',
  },
  {
    email: 'priya.sharma@sararobotics.com',
    fullName: 'Priya Sharma',
    role: 'Executive' as const,
    headline: 'VP Engineering at SARA Robotics',
    bio: 'Systems engineer with 10 years building embedded firmware for industrial robots. Previously Principal Engineer at ABB Robotics. Leads the fleet coordination and firmware teams.',
  },
  {
    email: 'carlos.mendez@sararobotics.com',
    fullName: 'Carlos Mendez',
    role: 'Executive' as const,
    headline: 'Head of Operations at SARA Robotics',
    bio: 'Operations leader with deep supply chain experience in hardware startups. Previously VP Ops at Zipline (drone delivery). Manages manufacturing, logistics, and facility operations.',
  },
  {
    email: 'lena.yun@sararobotics.com',
    fullName: 'Lena Yun',
    role: 'Executive' as const,
    headline: 'Head of Business Development at SARA Robotics',
    bio: 'Enterprise sales and partnerships expert with 8 years in industrial automation. Previously at Rockwell Automation. Drives customer pilots, partnerships, and go-to-market strategy.',
  },
  {
    email: 'alex.reeves@sararobotics.com',
    fullName: 'Alex Reeves',
    role: 'Apprentice' as const,
    headline: 'Junior Software Engineer at SARA Robotics',
    bio: 'Recent UT Austin CS graduate specialising in robotics simulation and SLAM algorithms. Building the NavCore simulation test framework and contributing to the fleet coordination engine.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateAuthUser(
  email: string,
  password: string,
  fullName: string
): Promise<string | null> {
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (existingProfile?.id) {
    console.log(`   -> User already exists: ${existingProfile.id}`)
    return existingProfile.id
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      is_demo_account: true,
      expires_at: DEMO_EXPIRES_AT,
    },
  })

  if (error) {
    if (error.message.includes('already been registered')) {
      // Auth user exists — look up by signing in (we know the password)
      const tempClient = createClient(supabaseUrl!, supabaseKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: signInData, error: signInErr } = await tempClient.auth.signInWithPassword({
        email,
        password,
      })
      if (signInData?.user) {
        console.log(`   -> Auth user already exists: ${signInData.user.id}`)
        return signInData.user.id
      }
      console.error(`   User registered but sign-in failed: ${signInErr?.message}`)
      return null
    }
    console.error(`   Failed to create auth user: ${error.message}`)
    return null
  }

  console.log(`   Created auth user: ${data.user.id}`)
  return data.user.id
}

async function upsertProfile(
  id: string,
  email: string,
  fullName: string,
  role: 'Founder' | 'Executive' | 'Apprentice',
  headline: string,
  bio: string
): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({
    id,
    email,
    full_name: fullName,
    role,
    foundry_id: FOUNDRY_ID,
    active_foundry_id: FOUNDRY_ID,
    headline,
    bio,
    account_type: 'team_builder',
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error(`   Profile upsert failed: ${error.message}`)
  } else {
    console.log(`   Profile synced`)
  }
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('\n Seeding SARA Robotics...\n')

  // ── 0. Bootstrap Sara (auth user + minimal profile for foundry FK) ──────
  console.log('Step 0: Bootstrap founder')
  const saraAccount = ACCOUNTS[0]
  const bootstrapSaraId = await getOrCreateAuthUser(saraAccount.email, PASSWORD, saraAccount.fullName)
  if (!bootstrapSaraId) {
    console.error('Cannot create Sara auth user — cannot continue.')
    process.exit(1)
  }

  // Bootstrap profile with temporary foundry so owner_id FK is satisfied
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: bootstrapSaraId,
    email: saraAccount.email,
    full_name: saraAccount.fullName,
    role: saraAccount.role,
    foundry_id: 'forge-guild',
    active_foundry_id: 'forge-guild',
    account_type: 'team_builder',
    updated_at: new Date().toISOString(),
  })
  if (profileErr) {
    console.error(`   Bootstrap profile failed: ${profileErr.message}`)
    process.exit(1)
  }
  console.log('   Bootstrap profile created (temporary foundry: forge-guild)')

  // ── 1. Foundry ────────────────────────────────────────────────────────────
  console.log('\nStep 1: Foundry')

  const { data: existingFoundry } = await supabase
    .from('foundries')
    .select('id')
    .eq('id', FOUNDRY_ID)
    .single()

  const { error } = await supabase.from('foundries').upsert({
    id: FOUNDRY_ID,
    name: 'SARA Robotics',
    slug: 'sara-robotics',
    industry: 'Robotics',
    sector: 'robotics',
    stage: 'Series A',
    owner_id: bootstrapSaraId,

    company_profile: {
      employee_count: '11-50',
      revenue_range: '$1M-$5M',
      funding_status: 'series_a',
      seeking_funding: true,
      founded_year: 2025,
      location: 'Austin, Texas',
      website: 'https://sararobotics.com',
      business_model: 'hardware_saas',
      competitors: [
        'Locus Robotics',
        '6 River Systems',
        'Fetch Robotics',
        'MiR (Mobile Industrial Robots)',
      ],
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },

    purpose_data: {
      purpose:
        'We exist to liberate human workers from repetitive and dangerous material handling by deploying intelligent autonomous robots that navigate, adapt, and collaborate in real-world industrial environments.',
      mission:
        "To build the world's most capable autonomous mobile robots for industrial logistics — robots that see, think, and move with human-level spatial intelligence, making every warehouse and factory safer, faster, and more efficient.",
      vision:
        'A world where every industrial facility operates with a fleet of intelligent autonomous robots working alongside humans — eliminating forklift injuries, reducing logistics costs by 40%, and enabling same-day fulfilment at any scale.',
      questionnaire: {
        whyExists:
          'Because every year, 85 warehouse workers die and 95,000 are injured in forklift-related incidents in the US alone. The technology to prevent this exists — it just hasn\'t been packaged into a product that\'s affordable, deployable, and intelligent enough for real-world environments.',
        problemSolved:
          'Current autonomous mobile robots are either too expensive for mid-market warehouses ($200K+ per unit), too simple to handle dynamic environments, or require months of custom integration. SARA Robotics delivers NavBot Pro — a $45K AMR with real-time SLAM navigation that deploys in days, not months.',
        whoServed:
          'Mid-market warehouse operators, third-party logistics providers (3PLs), and manufacturing facilities with 50,000-500,000 sqft of floor space who need to automate material handling without the capital expenditure or complexity of traditional AGV systems.',
        uniqueValue:
          'NavCore — our proprietary autonomous navigation platform — uses real-time LiDAR SLAM with sub-50ms latency, enabling NavBot Pro to navigate dynamic environments without pre-mapped routes or floor markers. Combined with multi-robot fleet coordination, customers deploy in 48 hours versus 3-6 months for competitors.',
        fiveYearVision:
          'SARA Robotics operates the largest fleet of autonomous industrial robots in North America — 10,000+ units across 500+ facilities. Our NavCore platform is the industry standard for autonomous navigation, and our SaaS fleet management generates $50M+ in recurring revenue.',
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },
  })

  if (error) {
    console.error(`   Foundry upsert failed: ${error.message}`)
    process.exit(1)
  }
  console.log(existingFoundry ? '   Foundry updated' : '   Foundry created')

  // Update Sara's profile to point to the real foundry
  await supabase.from('profiles').update({
    foundry_id: FOUNDRY_ID,
    active_foundry_id: FOUNDRY_ID,
  }).eq('id', bootstrapSaraId)
  console.log('   Sara profile updated to point to SARA Robotics foundry')

  // ── 2. Users & Profiles ───────────────────────────────────────────────────
  console.log('\nStep 2: Users & Profiles')
  const userIds: Record<string, string> = {}

  for (const account of ACCOUNTS) {
    console.log(`\n   ${account.fullName} (${account.email})`)
    const id = await getOrCreateAuthUser(account.email, PASSWORD, account.fullName)
    if (!id) continue

    await upsertProfile(id, account.email, account.fullName, account.role, account.headline, account.bio)
    userIds[account.email] = id
  }

  const saraId = userIds['sara.f.macedo@gmail.com']
  const jamesId = userIds['james.okafor@sararobotics.com']
  const priyaId = userIds['priya.sharma@sararobotics.com']
  const carlosId = userIds['carlos.mendez@sararobotics.com']
  const lenaId = userIds['lena.yun@sararobotics.com']
  const alexId = userIds['alex.reeves@sararobotics.com']

  if (!saraId) {
    console.error('\nSara user not created — cannot continue.')
    process.exit(1)
  }

  // ── 3. Foundry Memberships ────────────────────────────────────────────────
  console.log('\nStep 3: Foundry Memberships')

  const memberships = [
    { user_id: saraId, role: 'Founder', is_primary: true },
    ...(jamesId ? [{ user_id: jamesId, role: 'Executive', is_primary: true }] : []),
    ...(priyaId ? [{ user_id: priyaId, role: 'Executive', is_primary: true }] : []),
    ...(carlosId ? [{ user_id: carlosId, role: 'Executive', is_primary: true }] : []),
    ...(lenaId ? [{ user_id: lenaId, role: 'Executive', is_primary: true }] : []),
    ...(alexId ? [{ user_id: alexId, role: 'Apprentice', is_primary: true }] : []),
  ]

  for (const m of memberships) {
    const { data: existing } = await supabase
      .from('foundry_memberships')
      .select('id')
      .eq('user_id', m.user_id)
      .eq('foundry_id', FOUNDRY_ID)
      .single()

    if (existing) {
      console.log(`   Membership already exists for ${m.user_id}`)
      continue
    }

    const { error: memErr } = await supabase.from('foundry_memberships').insert({
      user_id: m.user_id,
      foundry_id: FOUNDRY_ID,
      role: m.role,
      is_primary: m.is_primary,
      joined_at: new Date().toISOString(),
    })

    if (memErr) {
      console.error(`   Membership insert failed: ${memErr.message}`)
    } else {
      console.log(`   Membership created for ${m.user_id}`)
    }
  }

  // ── 4. Teams ──────────────────────────────────────────────────────────────
  console.log('\nStep 4: Teams')

  const teams = [
    {
      id: deterministicId('sara-team:Robotics Engineering'),
      name: 'Robotics Engineering',
      description: 'Autonomous navigation, SLAM, fleet coordination, firmware, and simulation.',
      members: [jamesId, priyaId, alexId].filter(Boolean) as string[],
    },
    {
      id: deterministicId('sara-team:Operations & Supply Chain'),
      name: 'Operations & Supply Chain',
      description: 'Manufacturing, supply chain, facility operations, and logistics.',
      members: [saraId, carlosId].filter(Boolean) as string[],
    },
    {
      id: deterministicId('sara-team:Business Development'),
      name: 'Business Development',
      description: 'Customer pilots, enterprise sales, partnerships, and go-to-market.',
      members: [saraId, lenaId].filter(Boolean) as string[],
    },
  ]

  for (const team of teams) {
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('name', team.name)
      .eq('foundry_id', FOUNDRY_ID)
      .single()

    let teamId = existingTeam?.id

    if (existingTeam) {
      console.log(`   Team "${team.name}" already exists`)
      teamId = existingTeam.id
    } else {
      const { error: teamErr } = await supabase.from('teams').insert({
        id: team.id,
        name: team.name,
        description: team.description,
        foundry_id: FOUNDRY_ID,
      })

      if (teamErr) {
        console.error(`   Team "${team.name}" failed: ${teamErr.message}`)
        continue
      }

      teamId = team.id
      console.log(`   Team "${team.name}" created`)
    }

    for (const userId of team.members) {
      const { error: memberError } = await supabase
        .from('team_members')
        .upsert({ team_id: teamId, profile_id: userId })

      if (memberError) {
        console.error(`      Team member insert failed: ${memberError.message}`)
      }
    }
  }

  // ── 5. Strategic Objectives ───────────────────────────────────────────────
  console.log('\nStep 5: Strategic Objectives')

  const d = (months: number, day = 1): string => {
    const dt = new Date()
    dt.setMonth(dt.getMonth() + months)
    dt.setDate(day)
    return dt.toISOString()
  }

  const strategicObjectives = [
    {
      id: deterministicId('sara-strat:Secure $25M Series B funding by Q2 2026'),
      title: 'Secure $25M Series B funding by Q2 2026',
      description:
        'Close a $25M Series B round to fund production scale-up, warehouse vertical expansion, and team growth from 22 to 50+ employees. Target close by end of Q2 2026.',
      status: 'In Progress',
      progress: 35,
      start_date: d(-3),
      end_date: d(3),
    },
    {
      id: deterministicId('sara-strat:Ship NavCore v2.0 autonomous navigation platform'),
      title: 'Ship NavCore v2.0 autonomous navigation platform',
      description:
        'Major platform release with multi-robot fleet coordination, improved SLAM latency (<50ms), dynamic obstacle avoidance v2, and warehouse-specific navigation modes.',
      status: 'In Progress',
      progress: 55,
      start_date: d(-5),
      end_date: d(1),
    },
    {
      id: deterministicId('sara-strat:Expand into warehouse logistics vertical'),
      title: 'Expand into warehouse logistics vertical',
      description:
        'Enter the $12B warehouse automation market with NavBot Pro adapted for logistics environments. Secure 2 pilot customers and develop pallet-handling capabilities.',
      status: 'In Progress',
      progress: 20,
      start_date: d(-2),
      end_date: d(6),
    },
    {
      id: deterministicId('sara-strat:Grow engineering team from 18 to 35'),
      title: 'Grow engineering team from 18 to 35',
      description:
        'Scale the engineering team to support NavCore v2.0 development, warehouse vertical, and production ramp. Focus on robotics engineers, firmware developers, and ML specialists.',
      status: 'In Progress',
      progress: 40,
      start_date: d(-4),
      end_date: d(4),
    },
    {
      id: deterministicId('sara-strat:Achieve $5M ARR from pilot and commercial contracts'),
      title: 'Achieve $5M ARR from pilot and commercial contracts',
      description:
        'Build recurring revenue through hardware sales, NavCore Fleet SaaS subscriptions, and support contracts. Convert pilot customers to paid annual agreements.',
      status: 'In Progress',
      progress: 30,
      start_date: d(-6),
      end_date: d(6),
    },
  ]

  const { error: strObjError } = await supabase.from('objectives').upsert(
    strategicObjectives.map((o) => ({
      ...o,
      foundry_id: FOUNDRY_ID,
      creator_id: saraId,
      is_strategic_goal: true,
      created_at: d(-6),
    }))
  )

  if (strObjError) {
    console.error(`   Strategic objectives failed: ${strObjError.message}`)
  } else {
    console.log(`   ${strategicObjectives.length} strategic objectives created`)
  }

  const [seriesBId, navcoreId, warehouseId, growTeamId, arrId] = strategicObjectives.map((o) => o.id)

  // ── 6. Regular Objectives ─────────────────────────────────────────────────
  console.log('\nStep 6: Objectives')

  const objectives = [
    // -> Series B
    {
      id: deterministicId('sara-obj:Prepare investor data room and pitch deck'),
      title: 'Prepare investor data room and pitch deck',
      description:
        'Build a comprehensive data room with financials, IP documentation, customer case studies, and a compelling Series B pitch deck.',
      parent_objective_id: seriesBId,
      status: 'In Progress',
      progress: 65,
      start_date: d(-3),
      end_date: d(0),
    },
    {
      id: deterministicId('sara-obj:Complete Series B financial model and projections'),
      title: 'Complete Series B financial model and projections',
      description:
        'Build a detailed 3-year financial model with unit economics by customer vertical, cap table scenarios, and growth projections.',
      parent_objective_id: seriesBId,
      status: 'In Progress',
      progress: 50,
      start_date: d(-2),
      end_date: d(0),
    },
    {
      id: deterministicId('sara-obj:Secure warm introductions to 8 target VC firms'),
      title: 'Secure warm introductions to 8 target VC firms',
      description:
        'Leverage existing angel investors and industry contacts to get warm introductions to top robotics-focused VC firms.',
      parent_objective_id: seriesBId,
      status: 'In Progress',
      progress: 75,
      start_date: d(-2),
      end_date: d(1),
    },
    // -> NavCore v2.0
    {
      id: deterministicId('sara-obj:Ship NavCore 2.0 beta to 4 pilot customers'),
      title: 'Ship NavCore 2.0 beta to 4 pilot customers',
      description:
        'Deploy the NavCore 2.0 beta firmware to all 4 existing pilot customers for real-world validation before general release.',
      parent_objective_id: navcoreId,
      status: 'In Progress',
      progress: 60,
      start_date: d(-4),
      end_date: d(0),
    },
    {
      id: deterministicId('sara-obj:Implement multi-robot fleet coordination engine'),
      title: 'Implement multi-robot fleet coordination engine',
      description:
        'Build the centralised fleet coordination system that enables multiple NavBot Pro units to collaborate, avoid collisions, and optimise task allocation in shared environments.',
      parent_objective_id: navcoreId,
      status: 'In Progress',
      progress: 45,
      start_date: d(-3),
      end_date: d(1),
    },
    {
      id: deterministicId('sara-obj:Reduce SLAM latency to sub-50ms for real-time operation'),
      title: 'Reduce SLAM latency to sub-50ms for real-time operation',
      description:
        'Optimise the SLAM pipeline to achieve consistent sub-50ms localisation latency, enabling NavBot Pro to navigate at full speed in dynamic environments.',
      parent_objective_id: navcoreId,
      status: 'In Progress',
      progress: 70,
      start_date: d(-5),
      end_date: d(-1),
    },
    // -> Warehouse
    {
      id: deterministicId('sara-obj:Complete warehouse environment mapping prototype'),
      title: 'Complete warehouse environment mapping prototype',
      description:
        'Adapt NavCore for warehouse-specific challenges: narrow aisles, pallet racks, dynamic inventory zones, and high-traffic intersections.',
      parent_objective_id: warehouseId,
      status: 'In Progress',
      progress: 40,
      start_date: d(-2),
      end_date: d(2),
    },
    {
      id: deterministicId('sara-obj:Launch pilot with 2 logistics partners'),
      title: 'Launch pilot with 2 logistics partners',
      description:
        'Secure and execute 90-day pilot programmes with 2 logistics companies to validate NavBot Pro in warehouse environments.',
      parent_objective_id: warehouseId,
      status: 'In Progress',
      progress: 25,
      start_date: d(-1),
      end_date: d(4),
    },
    {
      id: deterministicId('sara-obj:Develop autonomous pallet-handling manipulation module'),
      title: 'Develop autonomous pallet-handling manipulation module',
      description:
        'Integrate a robotic arm attachment that enables NavBot Pro to autonomously pick up and place pallets, expanding from transport-only to full material handling.',
      parent_objective_id: warehouseId,
      status: 'Not Started',
      progress: 10,
      start_date: d(1),
      end_date: d(6),
    },
    // -> Grow team
    {
      id: deterministicId('sara-obj:Hire 8 robotics engineers in Q1 2026'),
      title: 'Hire 8 robotics engineers in Q1 2026',
      description:
        'Fill 8 open robotics engineering positions across SLAM, firmware, fleet coordination, and simulation to support NavCore v2.0 and warehouse vertical.',
      parent_objective_id: growTeamId,
      status: 'In Progress',
      progress: 50,
      start_date: d(-3),
      end_date: d(1),
    },
    {
      id: deterministicId('sara-obj:Establish engineering culture docs and onboarding playbook'),
      title: 'Establish engineering culture docs and onboarding playbook',
      description:
        'Document engineering processes, code review standards, and create a structured onboarding programme for new hires to ramp in 90 days.',
      parent_objective_id: growTeamId,
      status: 'In Progress',
      progress: 55,
      start_date: d(-4),
      end_date: d(0),
    },
    {
      id: deterministicId('sara-obj:Launch university partnership internship programme'),
      title: 'Launch university partnership internship programme',
      description:
        'Establish formal partnerships with UT Austin and Georgia Tech robotics labs for a 12-week summer internship programme.',
      parent_objective_id: growTeamId,
      status: 'In Progress',
      progress: 30,
      start_date: d(-1),
      end_date: d(3),
    },
    // -> ARR
    {
      id: deterministicId('sara-obj:Convert 3 manufacturing pilots to paid annual contracts'),
      title: 'Convert 3 manufacturing pilots to paid annual contracts',
      description:
        'Transition TechFlow Manufacturing, Meridian Automotive, and Precision Dynamics from pilot to paid annual contracts with committed ACV.',
      parent_objective_id: arrId,
      status: 'In Progress',
      progress: 45,
      start_date: d(-4),
      end_date: d(1),
    },
    {
      id: deterministicId('sara-obj:Secure 2 new warehouse logistics pilot contracts'),
      title: 'Secure 2 new warehouse logistics pilot contracts',
      description:
        'Win 2 new pilot contracts in the warehouse logistics vertical to validate the market opportunity and feed the Series B growth story.',
      parent_objective_id: arrId,
      status: 'In Progress',
      progress: 20,
      start_date: d(-1),
      end_date: d(3),
    },
    {
      id: deterministicId('sara-obj:Launch tiered SaaS pricing for NavCore Fleet platform'),
      title: 'Launch tiered SaaS pricing for NavCore Fleet platform',
      description:
        'Define and launch a tiered SaaS pricing model for NavCore Fleet — the cloud dashboard for fleet management, analytics, and remote monitoring.',
      parent_objective_id: arrId,
      status: 'Not Started',
      progress: 15,
      start_date: d(0),
      end_date: d(4),
    },
  ]

  const { error: objError } = await supabase.from('objectives').upsert(
    objectives.map((o) => ({
      ...o,
      foundry_id: FOUNDRY_ID,
      creator_id: saraId,
      is_strategic_goal: false,
      created_at: d(-6),
    }))
  )

  if (objError) {
    console.error(`   Objectives failed: ${objError.message}`)
  } else {
    console.log(`   ${objectives.length} objectives created`)
  }

  // ── 7. Tasks ──────────────────────────────────────────────────────────────
  console.log('\nStep 7: Tasks')

  const objIds = Object.fromEntries(objectives.map((o) => [o.title, o.id]))

  const tasks = [
    // --- Prepare investor data room ---
    {
      title: 'Draft Series B pitch deck with updated traction metrics and product roadmap',
      description: 'Build a 25-slide pitch deck covering problem, solution, traction (4 pilots, 22 employees, $1.2M ARR), market size ($12B warehouse automation), team, and ask ($25M Series B).',
      objective_id: objIds['Prepare investor data room and pitch deck'],
      status: 'Completed', assignee_id: saraId, start_date: d(-3), end_date: d(-2), progress: 100,
    },
    {
      title: 'Compile technical IP portfolio and patent filings for data room',
      description: 'Prepare documentation of 3 filed patents (NavCore SLAM, fleet coordination protocol, sensor fusion pipeline) and 2 pending applications for investor review.',
      objective_id: objIds['Prepare investor data room and pitch deck'],
      status: 'Accepted', assignee_id: jamesId ?? saraId, start_date: d(-2), end_date: d(0), progress: 60,
    },
    {
      title: 'Prepare 3 customer case studies with ROI data for investor materials',
      description: 'Write detailed case studies for TechFlow Manufacturing (38% throughput increase), Meridian Automotive (52% reduction in material handling incidents), and Precision Dynamics (24-hour deployment).',
      objective_id: objIds['Prepare investor data room and pitch deck'],
      status: 'Accepted', assignee_id: lenaId ?? saraId, start_date: d(-1), end_date: d(0), progress: 70,
    },
    // --- Financial model ---
    {
      title: 'Build 3-year financial model with unit economics by customer vertical',
      description: 'Model revenue, COGS, and margins for manufacturing vs warehouse verticals. Include hardware ASP ($45K), NavCore Fleet SaaS ($500/robot/month), and support contracts.',
      objective_id: objIds['Complete Series B financial model and projections'],
      status: 'Completed', assignee_id: saraId, start_date: d(-3), end_date: d(-1), progress: 100,
    },
    {
      title: 'Prepare cap table and dilution scenarios for board review',
      description: 'Model 3 dilution scenarios at $80M, $100M, and $120M pre-money valuations. Include ESOP expansion from 10% to 15% and pro-rata rights for existing investors.',
      objective_id: objIds['Complete Series B financial model and projections'],
      status: 'Accepted', assignee_id: saraId, start_date: d(-1), end_date: d(0), progress: 55,
    },
    {
      title: 'Engage external auditor for Series A financial close and compliance review',
      description: 'Contract KPMG Austin to audit Series A financials, verify revenue recognition, and prepare clean financials for due diligence.',
      objective_id: objIds['Complete Series B financial model and projections'],
      status: 'Completed', assignee_id: carlosId ?? saraId, start_date: d(-3), end_date: d(-2), progress: 100,
    },
    // --- VC introductions ---
    {
      title: 'Map top 15 robotics-focused VC firms and identify relevant partners',
      description: 'Research and rank VC firms by robotics portfolio, check size alignment ($20-30M), and identify the partner most likely to lead. Top targets: Andreessen Horowitz, Lux Capital, Eclipse Ventures.',
      objective_id: objIds['Secure warm introductions to 8 target VC firms'],
      status: 'Completed', assignee_id: saraId, start_date: d(-3), end_date: d(-2), progress: 100,
    },
    {
      title: 'Schedule introduction calls with 3 existing angel investors for referrals',
      description: 'Reach out to seed angels (David Chen, Maria Gonzalez, Robert Kim) to request warm intros to partners at target VC firms.',
      objective_id: objIds['Secure warm introductions to 8 target VC firms'],
      status: 'Completed', assignee_id: saraId, start_date: d(-2), end_date: d(-1), progress: 100,
    },
    {
      title: 'Prepare one-pager executive summary for cold outreach to tier-2 VCs',
      description: 'Write a compelling one-page executive summary for email outreach to VCs where we lack warm introductions. Include key metrics, differentiation, and ask.',
      objective_id: objIds['Secure warm introductions to 8 target VC firms'],
      status: 'Accepted', assignee_id: lenaId ?? saraId, start_date: d(-1), end_date: d(0), progress: 80,
    },
    // --- NavCore 2.0 beta ---
    {
      title: 'Complete LiDAR sensor fusion pipeline refactor for multi-sensor support',
      description: 'Refactor the sensor fusion module to support simultaneous input from Velodyne VLP-16, Ouster OS1-64, and Intel RealSense D455 depth cameras.',
      objective_id: objIds['Ship NavCore 2.0 beta to 4 pilot customers'],
      status: 'Completed', assignee_id: jamesId ?? saraId, start_date: d(-5), end_date: d(-3), progress: 100,
    },
    {
      title: 'Implement obstacle avoidance v2 with dynamic path replanning',
      description: 'Replace the static avoidance buffer with a predictive model that anticipates moving obstacles (forklifts, humans) and replans paths in real-time at 20Hz.',
      objective_id: objIds['Ship NavCore 2.0 beta to 4 pilot customers'],
      status: 'Accepted', assignee_id: priyaId ?? saraId, start_date: d(-3), end_date: d(0), progress: 75,
    },
    {
      title: 'Build NavCore 2.0 simulation test suite with 50+ scenarios',
      description: 'Create a comprehensive simulation test suite in Gazebo covering 50+ edge cases: narrow passages, dynamic obstacles, multi-robot intersections, sensor failures, and low-light conditions.',
      objective_id: objIds['Ship NavCore 2.0 beta to 4 pilot customers'],
      status: 'Accepted', assignee_id: alexId ?? saraId, start_date: d(-2), end_date: d(0), progress: 65,
    },
    {
      title: 'Deploy NavCore 2.0 beta to TechFlow Manufacturing pilot site',
      description: 'Flash NavCore 2.0 beta firmware to the 3 NavBot Pro units at TechFlow Manufacturing. Coordinate with their ops team for a 2-week validation window.',
      objective_id: objIds['Ship NavCore 2.0 beta to 4 pilot customers'],
      status: 'Pending', assignee_id: priyaId ?? saraId, start_date: d(0), end_date: d(1), progress: 0,
    },
    // --- Fleet coordination ---
    {
      title: 'Design fleet coordination protocol specification document',
      description: 'Write the technical specification for the fleet coordination protocol: message format, priority queuing, deadlock detection, and task handoff between robots.',
      objective_id: objIds['Implement multi-robot fleet coordination engine'],
      status: 'Completed', assignee_id: jamesId ?? saraId, start_date: d(-4), end_date: d(-3), progress: 100,
    },
    {
      title: 'Implement centralised task scheduler for multi-robot job dispatch',
      description: 'Build the central scheduler that assigns transport jobs to available robots based on proximity, battery level, payload capacity, and priority queue.',
      objective_id: objIds['Implement multi-robot fleet coordination engine'],
      status: 'Accepted', assignee_id: priyaId ?? saraId, start_date: d(-2), end_date: d(0), progress: 60,
    },
    {
      title: 'Build collision avoidance system for robot-to-robot proximity events',
      description: 'Implement the inter-robot collision avoidance layer that uses UWB beacons and LiDAR to prevent collisions in shared corridors and intersections.',
      objective_id: objIds['Implement multi-robot fleet coordination engine'],
      status: 'Pending', assignee_id: alexId ?? saraId, start_date: d(0), end_date: d(1), progress: 10,
    },
    {
      title: 'Run 8-robot fleet stress test in simulation environment',
      description: 'Execute a full stress test with 8 simulated NavBot Pro units in a 100,000 sqft warehouse model. Measure throughput, deadlock frequency, and coordination latency.',
      objective_id: objIds['Implement multi-robot fleet coordination engine'],
      status: 'Pending', assignee_id: alexId ?? saraId, start_date: d(0, 15), end_date: d(1), progress: 0,
    },
    // --- SLAM latency ---
    {
      title: 'Profile and optimise SLAM point cloud processing pipeline',
      description: 'Use perf profiling to identify bottlenecks in the SLAM pipeline. Current latency: 82ms average. Target: sub-50ms. Focus on point cloud downsampling, feature extraction, and loop closure.',
      objective_id: objIds['Reduce SLAM latency to sub-50ms for real-time operation'],
      status: 'Completed', assignee_id: jamesId ?? saraId, start_date: d(-5), end_date: d(-3), progress: 100,
    },
    {
      title: 'Implement GPU-accelerated feature extraction for LiDAR point clouds',
      description: 'Port the feature extraction pipeline from CPU to CUDA, leveraging the Jetson AGX Orin GPU on NavBot Pro. Expected 3-4x speedup on point cloud processing.',
      objective_id: objIds['Reduce SLAM latency to sub-50ms for real-time operation'],
      status: 'Accepted', assignee_id: jamesId ?? saraId, start_date: d(-2), end_date: d(0), progress: 85,
    },
    {
      title: 'Benchmark SLAM latency across 5 real-world test environments',
      description: 'Run standardised SLAM benchmarks at TechFlow Manufacturing, Meridian Automotive, the SARA test lab, a partner warehouse, and an outdoor loading dock.',
      objective_id: objIds['Reduce SLAM latency to sub-50ms for real-time operation'],
      status: 'Pending', assignee_id: alexId ?? saraId, start_date: d(0), end_date: d(1), progress: 0,
    },
    // --- Warehouse mapping ---
    {
      title: 'Survey 3 partner warehouses and collect 3D environment scan data',
      description: 'Visit GlobalShip Logistics, FastTrack Distribution, and Amazon SPN partner warehouse. Collect LiDAR scans, floor plans, traffic flow data, and rack configurations.',
      objective_id: objIds['Complete warehouse environment mapping prototype'],
      status: 'Completed', assignee_id: carlosId ?? saraId, start_date: d(-2), end_date: d(-1), progress: 100,
    },
    {
      title: 'Adapt NavCore pathfinding for narrow-aisle warehouse layouts',
      description: 'Modify the A* pathfinding to handle 1.2m aisle widths (standard warehouse racking). Add bidirectional traffic rules and intersection priority logic.',
      objective_id: objIds['Complete warehouse environment mapping prototype'],
      status: 'Accepted', assignee_id: priyaId ?? saraId, start_date: d(-1), end_date: d(1), progress: 40,
    },
    {
      title: 'Build pallet rack detection and zone classification module',
      description: 'Train a computer vision model to detect pallet racks, classify storage zones (picking, staging, shipping), and update the environment map in real-time.',
      objective_id: objIds['Complete warehouse environment mapping prototype'],
      status: 'Pending', assignee_id: jamesId ?? saraId, start_date: d(0), end_date: d(2), progress: 5,
    },
    // --- Logistics pilots ---
    {
      title: 'Negotiate pilot agreement terms with GlobalShip Logistics',
      description: 'Finalise 90-day pilot terms: 2 NavBot Pro units, success metrics (throughput, uptime, ROI), data sharing agreement, and path to commercial contract.',
      objective_id: objIds['Launch pilot with 2 logistics partners'],
      status: 'Accepted', assignee_id: lenaId ?? saraId, start_date: d(-1), end_date: d(0), progress: 70,
    },
    {
      title: 'Negotiate pilot agreement terms with FastTrack Distribution',
      description: 'Mirror the GlobalShip pilot structure for FastTrack Distribution. Their warehouse is 180,000 sqft with a focus on e-commerce fulfilment — different use case from GlobalShip.',
      objective_id: objIds['Launch pilot with 2 logistics partners'],
      status: 'Pending', assignee_id: lenaId ?? saraId, start_date: d(0), end_date: d(1), progress: 15,
    },
    {
      title: 'Deploy 2 NavBot Pro units to GlobalShip warehouse for 90-day pilot',
      description: 'Ship, install, and commission 2 NavBot Pro units at GlobalShip Logistics Houston facility. Includes on-site setup, NavCore configuration, and operator training.',
      objective_id: objIds['Launch pilot with 2 logistics partners'],
      status: 'Pending', assignee_id: carlosId ?? saraId, start_date: d(1), end_date: d(2), progress: 0,
    },
    // --- Pallet handling ---
    {
      title: 'Evaluate 3 robotic arm OEM integrations for pallet manipulation',
      description: 'Test compatibility of Universal Robots UR10e, FANUC CRX-10iA, and Doosan M1013 with the NavBot Pro chassis. Evaluate payload capacity, reach, and integration complexity.',
      objective_id: objIds['Develop autonomous pallet-handling manipulation module'],
      status: 'Completed', assignee_id: jamesId ?? saraId, start_date: d(-2), end_date: d(-1), progress: 100,
    },
    {
      title: 'Build autonomous pallet pickup and placement control firmware',
      description: 'Write the firmware for autonomous pallet manipulation: approach alignment, fork engagement, lift, transport, and placement. Must handle standard EUR pallets (800x1200mm).',
      objective_id: objIds['Develop autonomous pallet-handling manipulation module'],
      status: 'Pending', assignee_id: priyaId ?? saraId, start_date: d(1), end_date: d(3), progress: 0,
    },
    {
      title: 'Run CE safety certification testing for manipulation module',
      description: 'Engage TUV Rheinland to conduct CE machinery directive safety testing for the NavBot Pro with pallet manipulation attachment. Required for EU market entry.',
      objective_id: objIds['Develop autonomous pallet-handling manipulation module'],
      status: 'Pending', assignee_id: carlosId ?? saraId, start_date: d(3), end_date: d(5), progress: 0,
    },
    // --- Hire engineers ---
    {
      title: 'Post robotics engineer positions on 5 specialist job boards and LinkedIn',
      description: 'Publish job listings on Robotics Worldwide, IEEE Job Site, ROS Discourse, Hacker News, and LinkedIn. Include SLAM Engineer, Firmware Engineer, and Fleet Systems Engineer roles.',
      objective_id: objIds['Hire 8 robotics engineers in Q1 2026'],
      status: 'Completed', assignee_id: carlosId ?? saraId, start_date: d(-3), end_date: d(-2), progress: 100,
    },
    {
      title: 'Attend RoboCon 2026 hiring event and career fair in San Francisco',
      description: 'Book booth at RoboCon 2026 career fair. Prepare hiring materials, live NavBot Pro demo, and schedule on-site interviews for qualified candidates.',
      objective_id: objIds['Hire 8 robotics engineers in Q1 2026'],
      status: 'Accepted', assignee_id: saraId, start_date: d(-1), end_date: d(0), progress: 40,
    },
    {
      title: 'Conduct technical interview pipeline for 20+ candidates',
      description: 'Run the 4-stage interview pipeline: resume screen, technical phone screen, take-home challenge (SLAM or fleet coordination), and on-site day. Target 20+ candidates in pipeline.',
      objective_id: objIds['Hire 8 robotics engineers in Q1 2026'],
      status: 'Accepted', assignee_id: priyaId ?? saraId, start_date: d(-2), end_date: d(1), progress: 55,
    },
    // --- Engineering culture ---
    {
      title: 'Write engineering handbook covering code review, deploy, and on-call processes',
      description: 'Document SARA engineering standards: PR review expectations, CI/CD pipeline, firmware deploy procedures, on-call rotation, and incident response playbook.',
      objective_id: objIds['Establish engineering culture docs and onboarding playbook'],
      status: 'Completed', assignee_id: priyaId ?? saraId, start_date: d(-4), end_date: d(-2), progress: 100,
    },
    {
      title: 'Set up mentorship pairing programme for new robotics hires',
      description: 'Create a structured mentorship programme: pair each new hire with a senior engineer for their first 90 days. Define weekly 1:1 format, milestone checklist, and feedback mechanism.',
      objective_id: objIds['Establish engineering culture docs and onboarding playbook'],
      status: 'Accepted', assignee_id: jamesId ?? saraId, start_date: d(-1), end_date: d(1), progress: 35,
    },
    {
      title: 'Create 90-day onboarding checklist and ramp plan for robotics engineers',
      description: 'Design a 90-day programme: Week 1 (orientation + NavCore architecture deep dive), Weeks 2-4 (paired programming on a starter task), Weeks 5-12 (independent feature ownership).',
      objective_id: objIds['Establish engineering culture docs and onboarding playbook'],
      status: 'Pending', assignee_id: priyaId ?? saraId, start_date: d(0), end_date: d(1), progress: 10,
    },
    // --- University internship ---
    {
      title: 'Establish partnership agreements with UT Austin and Georgia Tech robotics labs',
      description: 'Negotiate formal partnership MOUs with UT Austin RPAL and Georgia Tech IRIM labs for internship pipeline, guest lectures, and co-research opportunities.',
      objective_id: objIds['Launch university partnership internship programme'],
      status: 'Accepted', assignee_id: saraId, start_date: d(-1), end_date: d(1), progress: 45,
    },
    {
      title: 'Design 12-week summer internship curriculum and project briefs',
      description: 'Create structured internship programme: 3 project tracks (SLAM research, fleet simulation, warehouse mapping). Each intern gets a defined deliverable and a mentor.',
      objective_id: objIds['Launch university partnership internship programme'],
      status: 'Pending', assignee_id: jamesId ?? saraId, start_date: d(0), end_date: d(2), progress: 0,
    },
    // --- Convert pilots ---
    {
      title: 'Prepare commercial proposal and pricing for TechFlow Manufacturing',
      description: 'Build a custom proposal for TechFlow: 5 NavBot Pro units, NavCore Fleet Professional, 24/7 support. Target ACV: $280K. Include ROI analysis from pilot data.',
      objective_id: objIds['Convert 3 manufacturing pilots to paid annual contracts'],
      status: 'Completed', assignee_id: lenaId ?? saraId, start_date: d(-3), end_date: d(-2), progress: 100,
    },
    {
      title: 'Prepare commercial proposal and pricing for Meridian Automotive',
      description: 'Build proposal for Meridian: 3 NavBot Pro units with hazardous material handling certification. Target ACV: $195K. Leverage their 52% safety improvement data.',
      objective_id: objIds['Convert 3 manufacturing pilots to paid annual contracts'],
      status: 'Accepted', assignee_id: lenaId ?? saraId, start_date: d(-1), end_date: d(0), progress: 50,
    },
    {
      title: 'Negotiate annual contract terms with Precision Dynamics ($180K ACV)',
      description: 'Finalise annual contract with Precision Dynamics. They want a 2-year term with a 15% discount. Counter with 2-year at 10% discount plus fleet expansion clause.',
      objective_id: objIds['Convert 3 manufacturing pilots to paid annual contracts'],
      status: 'Accepted', assignee_id: saraId, start_date: d(-1), end_date: d(0), progress: 40,
    },
    // --- New logistics pilots ---
    {
      title: 'Respond to GlobalShip Logistics inbound RFP for warehouse automation',
      description: 'Complete GlobalShip\'s formal RFP: technical requirements, pricing, implementation timeline, and references. Due in 3 weeks. Coordinate with James on technical sections.',
      objective_id: objIds['Secure 2 new warehouse logistics pilot contracts'],
      status: 'Accepted', assignee_id: lenaId ?? saraId, start_date: d(-1), end_date: d(0), progress: 55,
    },
    {
      title: 'Build warehouse-specific ROI calculator and sales collateral',
      description: 'Create an interactive ROI calculator that estimates labour savings, throughput improvement, and injury reduction for warehouse prospects. Build supporting sales deck.',
      objective_id: objIds['Secure 2 new warehouse logistics pilot contracts'],
      status: 'Pending', assignee_id: lenaId ?? saraId, start_date: d(0), end_date: d(1), progress: 0,
    },
    // --- SaaS pricing ---
    {
      title: 'Define tiered pricing model for NavCore Fleet platform',
      description: 'Design 3 SaaS tiers: Starter ($200/robot/month — monitoring + alerts), Professional ($500/robot/month — fleet coordination + analytics), Enterprise (custom — API access + dedicated support).',
      objective_id: objIds['Launch tiered SaaS pricing for NavCore Fleet platform'],
      status: 'Completed', assignee_id: saraId, start_date: d(-2), end_date: d(-1), progress: 100,
    },
    {
      title: 'Build usage metering and billing integration with Stripe',
      description: 'Integrate Stripe Billing for NavCore Fleet subscriptions. Implement usage metering (robot count, API calls), automated invoicing, and upgrade/downgrade flows.',
      objective_id: objIds['Launch tiered SaaS pricing for NavCore Fleet platform'],
      status: 'Pending', assignee_id: alexId ?? saraId, start_date: d(0), end_date: d(2), progress: 0,
    },
    {
      title: 'Launch self-serve NavCore Fleet pricing page on marketing website',
      description: 'Design and publish a pricing page on sararobotics.com with tier comparison, FAQ, and self-serve signup for Starter and Professional tiers.',
      objective_id: objIds['Launch tiered SaaS pricing for NavCore Fleet platform'],
      status: 'Pending', assignee_id: lenaId ?? saraId, start_date: d(1), end_date: d(2), progress: 0,
    },
  ]

  const { count: existingTaskCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingTaskCount && existingTaskCount > 0) {
    console.log(`   Skipping — ${existingTaskCount} tasks already exist for this foundry`)
  } else {
    const { error: taskError } = await supabase.from('tasks').insert(
      tasks.map((t, i) => ({
        ...t,
        foundry_id: FOUNDRY_ID,
        creator_id: saraId,
        task_number: i + 1,
        created_at: t.status === 'Completed' ? d(-4) : t.status === 'Accepted' ? d(-2) : d(-1),
      }))
    )

    if (taskError) {
      console.error(`   Tasks failed: ${taskError.message}`)
    } else {
      console.log(`   ${tasks.length} tasks created`)
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n SARA Robotics seed complete!\n')
  console.log('='.repeat(60))
  console.log('Sara\'s login credentials:')
  console.log(`   Email:    sara.f.macedo@gmail.com`)
  console.log(`   Password: ${PASSWORD}`)
  console.log(`   Expires:  ${DEMO_EXPIRES_AT}`)
  console.log('='.repeat(60))
  console.log('\nTeam accounts (same password):')
  console.log('   james.okafor@sararobotics.com')
  console.log('   priya.sharma@sararobotics.com')
  console.log('   carlos.mendez@sararobotics.com')
  console.log('   lena.yun@sararobotics.com')
  console.log('   alex.reeves@sararobotics.com')
  console.log('='.repeat(60))
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
