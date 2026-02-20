/**
 * @file seed-solar-for-schools.ts
 *
 * @description Seeds a complete demo company — Solar for Schools — for Robert Schrimpff.
 * Creates: foundry, users (Robert + 4 executives), foundry memberships, teams,
 * strategic objectives, objectives, tasks with 6-month history, task history,
 * and activity events. Schedules auto-cleanup after 24 hours.
 *
 * Based on the real company: https://www.solarforschools.co.uk/
 * Robert Schrimpff is the real Co-Founder & CEO.
 *
 * @usage npx tsx scripts/seed-solar-for-schools.ts
 *
 * Idempotent: safe to run multiple times. Checks for existing records before inserting.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { execSync } from 'child_process'

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

// ─── Constants ────────────────────────────────────────────────────────────────

const FOUNDRY_ID = 'solar-for-schools'
const PASSWORD = 'SolarSchools2026!'

const ACCOUNTS = [
  {
    email: 'robert.schrimpff@gmail.com',
    fullName: 'Robert Schrimpff',
    role: 'Founder' as const,
    headline: 'Co-Founder & CEO, Solar for Schools',
    bio: 'Serial entrepreneur. Built Hotels.com before 9/11, started the INSEAD Energy network. Founded Solar for Schools in 2015 to decarbonise schools and empower 100,000+ students through solar energy and climate education. Based in Munich.',
    skills: ['Solar Energy', 'Education Policy', 'Fundraising', 'Community Energy', 'Scaling Operations', 'Impact Investing'],
    expertise_areas: ['Renewable Energy', 'EdTech', 'Social Enterprise', 'Impact Investing', 'Government Relations'],
    industries: ['Renewable Energy', 'Education', 'Social Enterprise'],
  },
  {
    email: 'elena.vasquez@solarforschools.co.uk',
    fullName: 'Elena Vasquez',
    role: 'Executive' as const,
    headline: 'COO & Head of Operations',
    bio: 'Manages the installation pipeline across 326+ schools. Coordinates with councils, dioceses, multi-academy trusts, and community energy partners across the UK, Germany, and India.',
    skills: ['Operations Management', 'Supply Chain', 'Project Delivery', 'Stakeholder Management', 'Quality Assurance'],
    expertise_areas: ['Solar Installation', 'School Operations', 'Multi-site Project Management'],
    industries: ['Renewable Energy', 'Construction', 'Education'],
  },
  {
    email: 'tobias.richter@solarforschools.co.uk',
    fullName: 'Tobias Richter',
    role: 'Executive' as const,
    headline: 'CTO & Head of Engineering',
    bio: 'Leads the technical design of solar + battery systems for schools. Oversees site surveys, grid connections, and the Solar Explorer monitoring platform. 12 years in commercial solar.',
    skills: ['Solar PV Design', 'Battery Storage', 'Grid Connection', 'Electrical Engineering', 'Monitoring Systems'],
    expertise_areas: ['Commercial Solar', 'Battery Energy Storage', 'Smart Grid', 'IoT Monitoring'],
    industries: ['Renewable Energy', 'Electrical Engineering', 'Technology'],
  },
  {
    email: 'sophie.andersson@solarforschools.co.uk',
    fullName: 'Sophie Andersson',
    role: 'Executive' as const,
    headline: 'VP Sales & School Partnerships',
    bio: 'Builds relationships with school leaders, MATs, councils, and dioceses. Manages the pipeline from school interest to signed agreement. Previously at a Big Four consulting firm advising public sector clients.',
    skills: ['School Partnerships', 'Business Development', 'Stakeholder Engagement', 'Public Sector Sales', 'Event Management'],
    expertise_areas: ['Education Sector', 'Public Sector', 'Community Energy', 'Government Relations'],
    industries: ['Education', 'Renewable Energy', 'Public Sector'],
  },
  {
    email: 'liam.oconnor@solarforschools.co.uk',
    fullName: 'Liam O\'Connor',
    role: 'Executive' as const,
    headline: 'CFO & Head of Finance',
    bio: 'Manages CBS bond issuance, Triodos bank relationships, grant applications, and the Series B fundraise process. Oversees financial modelling for 25-year school agreements. Former investment banker at Macquarie.',
    skills: ['Financial Modelling', 'Bond Issuance', 'Grant Applications', 'Fundraising', 'Impact Finance'],
    expertise_areas: ['Impact Finance', 'Community Benefit Societies', 'Renewable Energy Finance', 'Series B Fundraising'],
    industries: ['Finance', 'Renewable Energy', 'Social Enterprise'],
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
    console.log(`   ↳ User already exists: ${existingProfile.id}`)
    return existingProfile.id
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, is_demo_account: true },
  })

  if (error) {
    // Auth user may exist from a previous partial run — look them up via generateLink
    if (error.message.includes('already been registered')) {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
      if (linkData?.user) {
        console.log(`   ↳ Auth user exists (no profile yet): ${linkData.user.id}`)
        return linkData.user.id
      }
    }
    console.error(`   ❌ Failed to create auth user: ${error.message}`)
    return null
  }

  if (!data.user) {
    console.error(`   ❌ No user returned from createUser`)
    return null
  }

  console.log(`   ✅ Created auth user: ${data.user.id}`)
  return data.user.id
}

async function upsertProfile(
  id: string,
  account: (typeof ACCOUNTS)[number]
): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({
    id,
    email: account.email,
    full_name: account.fullName,
    role: account.role,
    foundry_id: FOUNDRY_ID,
    active_foundry_id: FOUNDRY_ID,
    headline: account.headline,
    bio: account.bio,
    skills: account.skills,
    expertise_areas: account.expertise_areas,
    industries: account.industries,
    account_type: 'team_builder',
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error(`   ❌ Profile upsert failed: ${error.message}`)
  } else {
    console.log(`   ✅ Profile synced`)
  }
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function monthsFromNow(months: number, day = 1): string {
  const dt = new Date()
  dt.setMonth(dt.getMonth() + months)
  dt.setDate(day)
  return dt.toISOString()
}

function monthsAgo(months: number, day = 15): string {
  const dt = new Date()
  dt.setMonth(dt.getMonth() - months)
  dt.setDate(day)
  return dt.toISOString()
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('\n🌱 Seeding Solar for Schools...\n')

  // ── 1. Create Robert's auth user first (foundry needs owner_id) ─────────
  console.log('👤 Step 1: Create Robert (Founder)')

  const robertAccount = ACCOUNTS[0]
  console.log(`\n   👤 ${robertAccount.fullName} (${robertAccount.email})`)
  const robertId = await getOrCreateAuthUser(robertAccount.email, PASSWORD, robertAccount.fullName)

  if (!robertId) {
    console.error('\n❌ Robert user not created — cannot continue.')
    process.exit(1)
  }

  // Create Robert's profile without active_foundry_id (FK constraint)
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: robertId,
    email: robertAccount.email,
    full_name: robertAccount.fullName,
    role: robertAccount.role,
    foundry_id: FOUNDRY_ID,
    headline: robertAccount.headline,
    bio: robertAccount.bio,
    skills: robertAccount.skills,
    expertise_areas: robertAccount.expertise_areas,
    industries: robertAccount.industries,
    account_type: 'team_builder',
    updated_at: new Date().toISOString(),
  })
  if (profileErr) {
    console.error(`   ❌ Robert profile failed: ${profileErr.message}`)
    process.exit(1)
  }
  console.log('   ✅ Robert profile created (without active_foundry_id)')

  // ── 2. Foundry ────────────────────────────────────────────────────────────
  console.log('\n🏭 Step 2: Foundry')

  const { data: existingFoundry } = await supabase
    .from('foundries')
    .select('id')
    .eq('id', FOUNDRY_ID)
    .single()

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('foundries').upsert({
    id: FOUNDRY_ID,
    name: 'Solar for Schools',
    slug: 'solar-for-schools',
    owner_id: robertId,
    industry: 'Renewable Energy',
    sector: 'energy',
    stage: 'Series B',

    company_profile: {
      employee_count: '50-100',
      revenue_range: 'gbp_5m_10m',
      funding_status: 'series_b',
      seeking_funding: true,
      founded_year: 2015,
      location: 'Castle Hedingham, Essex, United Kingdom',
      website: 'https://www.solarforschools.co.uk',
      business_model: 'services',
      competitors: ['Solarcentury Schools', 'Egni Co-op', 'Low Carbon Hub', 'Energy Garden'],
      demo_expires_at: expiresAt,
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },

    purpose_data: {
      purpose:
        'We exist to decarbonise schools and empower students to create a net-zero carbon future, starting with their own school rooftops.',
      mission:
        'To install solar panels on every school in the UK and beyond, while delivering 25 years of sustainability education that turns students into climate advocates — reaching 108,000+ pupils per year.',
      vision:
        'A world where every school generates its own clean energy and every student understands their power to shape a sustainable future. 326 schools and counting.',
      questionnaire: {
        whyExists:
          'Because schools spend billions on energy each year while teaching students about climate change in classrooms without doing anything about it. We bridge that gap — panels on the roof, education in the classroom.',
        problemSolved:
          'Schools lack the capital, technical knowledge, and project management capacity to go solar. Our end-to-end model — from funding via our Community Benefit Society to 25-year maintenance — removes every barrier.',
        whoServed:
          'Primary and secondary schools, multi-academy trusts, local councils, dioceses, and universities across the UK, Ireland, Germany, Spain, Mexico, Colombia, and India.',
        uniqueValue:
          'We are the only organisation that combines solar installation with 25 years of sustainability education. Our CBS funding model means schools pay nothing upfront and share in the long-term profits. We manage 326 schools — the largest portfolio of solar on schools in the UK.',
        fiveYearVision:
          'Solar for Schools is the default partner for every school in Europe that wants to go solar. We manage 2,000+ school installations, our education platform reaches 500,000 students annually, and we have expanded battery storage + grid export revenue to make schools net energy producers.',
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },
  })

  if (error) {
    console.error(`   ❌ Foundry upsert failed: ${error.message}`)
    process.exit(1)
  }
  console.log(existingFoundry ? '   ✅ Foundry updated' : '   ✅ Foundry created')

  // Now set Robert's active_foundry_id (FK is safe now that foundry exists)
  await supabase.from('profiles').update({ active_foundry_id: FOUNDRY_ID }).eq('id', robertId)
  console.log('   ✅ Robert\'s active_foundry_id set')

  // ── 3. Remaining users ─────────────────────────────────────────────────
  console.log('\n👥 Step 3: Executive Team')

  const userIds: Record<string, string> = { [robertAccount.email]: robertId }

  for (const account of ACCOUNTS.slice(1)) {
    console.log(`\n   👤 ${account.fullName} (${account.email})`)
    const id = await getOrCreateAuthUser(account.email, PASSWORD, account.fullName)
    if (!id) continue

    await upsertProfile(id, account)
    userIds[account.email] = id
  }

  const elenaId = userIds['elena.vasquez@solarforschools.co.uk']
  const tobiasId = userIds['tobias.richter@solarforschools.co.uk']
  const sophieId = userIds['sophie.andersson@solarforschools.co.uk']
  const liamId = userIds['liam.oconnor@solarforschools.co.uk']

  // ── 4. Foundry Memberships ────────────────────────────────────────────────
  console.log('\n🔗 Step 4: Foundry Memberships')

  const allUserIds = [robertId, elenaId, tobiasId, sophieId, liamId].filter(Boolean) as string[]
  const membershipRoles: Record<string, string> = {
    [robertId]: 'Founder',
    ...(elenaId ? { [elenaId]: 'Executive' } : {}),
    ...(tobiasId ? { [tobiasId]: 'Executive' } : {}),
    ...(sophieId ? { [sophieId]: 'Executive' } : {}),
    ...(liamId ? { [liamId]: 'Executive' } : {}),
  }

  for (const userId of allUserIds) {
    const { data: existing } = await supabase
      .from('foundry_memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('foundry_id', FOUNDRY_ID)
      .single()

    if (existing) {
      console.log(`   ↳ Membership already exists for user ${userId}`)
      continue
    }

    const { error: memErr } = await supabase.from('foundry_memberships').insert({
      user_id: userId,
      foundry_id: FOUNDRY_ID,
      role: membershipRoles[userId] ?? 'Executive',
      is_primary: true,
      joined_at: new Date().toISOString(),
    })

    if (memErr) {
      console.error(`   ❌ Membership insert failed: ${memErr.message}`)
    } else {
      console.log(`   ✅ Membership created for ${userId}`)
    }
  }

  // ── 5. Teams ──────────────────────────────────────────────────────────────
  console.log('\n👥 Step 5: Teams')

  const teams = [
    {
      id: uuidv4(),
      name: 'Installation & Engineering',
      description: 'Solar panel installation, battery storage, wiring, grid connections, and site surveys across all school sites.',
      members: [robertId, ...(tobiasId ? [tobiasId] : []), ...(elenaId ? [elenaId] : [])],
    },
    {
      id: uuidv4(),
      name: 'Sales & School Partnerships',
      description: 'School outreach, council relationships, MAT partnerships, and the pipeline from interest to signed agreement.',
      members: [robertId, ...(sophieId ? [sophieId] : [])],
    },
    {
      id: uuidv4(),
      name: 'Finance & Fundraising',
      description: 'Series B fundraise, CBS bond issuance, Triodos facility, grant applications, and 25-year financial modelling.',
      members: [robertId, ...(liamId ? [liamId] : [])],
    },
    {
      id: uuidv4(),
      name: 'Education & Impact',
      description: 'Student solar ambassadors, assemblies, workshops, parliamentary showcases, and impact reporting.',
      members: [robertId, ...(sophieId ? [sophieId] : []), ...(elenaId ? [elenaId] : [])],
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
      console.log(`   ↳ Team "${team.name}" already exists`)
      teamId = existingTeam.id
    } else {
      const { error: teamErr } = await supabase.from('teams').insert({
        id: team.id,
        name: team.name,
        description: team.description,
        foundry_id: FOUNDRY_ID,
      })

      if (teamErr) {
        console.error(`   ❌ Team "${team.name}" failed: ${teamErr.message}`)
        continue
      }

      teamId = team.id
      console.log(`   ✅ Team "${team.name}" created`)
    }

    for (const userId of team.members) {
      const { error: memberError } = await supabase
        .from('team_members')
        .upsert({ team_id: teamId, profile_id: userId })

      if (memberError) {
        console.error(`      ❌ Team member insert failed: ${memberError.message}`)
      }
    }
  }

  // ── 6. Strategic Objectives ───────────────────────────────────────────────
  console.log('\n🎯 Step 6: Strategic Objectives')

  const strategicObjectives = [
    {
      id: deterministicId('sfs-strat:Install solar on 75 new schools in 2026'),
      title: 'Install solar on 75 new schools in 2026',
      description:
        'Scale from 63 installations in 2025 to 75 in 2026. Includes panel installation, battery storage, wiring, grid connection, and student education programs at each site.',
      status: 'In Progress',
      progress: 42,
      start_date: monthsAgo(3),
      end_date: monthsFromNow(9),
    },
    {
      id: deterministicId('sfs-strat:Close Series B at EUR 25M for pan-European expansion'),
      title: 'Close Series B at EUR 25M for pan-European expansion',
      description:
        'Raise €25 million Series B to fund expansion into Germany, Spain, and Ireland at scale. Covers hiring 50+ staff, fleet buildout, and CBS capitalisation across 3 new markets.',
      status: 'In Progress',
      progress: 30,
      start_date: monthsAgo(2),
      end_date: monthsFromNow(4),
    },
    {
      id: deterministicId('sfs-strat:Launch university solar and storage program'),
      title: 'Launch university solar + storage program',
      description:
        'Expand from primary/secondary schools into universities with larger rooftop arrays (200kW-1MW) and battery storage. Pilot with 3 UK universities in 2026.',
      status: 'In Progress',
      progress: 20,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(8),
    },
    {
      id: deterministicId('sfs-strat:Scale outreach to 500 schools via sales and marketing engine'),
      title: 'Scale outreach to 500 schools via sales & marketing engine',
      description:
        'Build a repeatable sales and marketing machine to reach 500+ schools per year. Includes email campaigns to headteachers, council partnerships, referral programs, and conference presence.',
      status: 'In Progress',
      progress: 35,
      start_date: monthsAgo(4),
      end_date: monthsFromNow(6),
    },
    {
      id: deterministicId('sfs-strat:Deploy battery storage and grid export at 20 pilot schools'),
      title: 'Deploy battery storage + grid export at 20 pilot schools',
      description:
        'Install battery storage at 20 existing school sites and negotiate grid export agreements with DNOs. Generate additional revenue from stored energy sold back to the grid during peak hours.',
      status: 'Not Started',
      progress: 8,
      start_date: monthsFromNow(1),
      end_date: monthsFromNow(10),
    },
  ]

  const { error: strObjError } = await supabase.from('objectives').upsert(
    strategicObjectives.map((o) => ({
      ...o,
      foundry_id: FOUNDRY_ID,
      creator_id: robertId,
      is_strategic_goal: true,
      created_at: monthsAgo(6),
    }))
  )

  if (strObjError) {
    console.error(`   ❌ Strategic objectives failed: ${strObjError.message}`)
  } else {
    console.log(`   ✅ ${strategicObjectives.length} strategic objectives created`)
  }

  const [installationsId, seriesBId, universityId, salesMarketingId, batteryStorageId] =
    strategicObjectives.map((o) => o.id)

  // ── 7. Regular Objectives ─────────────────────────────────────────────────
  console.log('\n📋 Step 7: Objectives')

  const objectives = [
    // → Installations
    {
      id: deterministicId('sfs-obj:Complete Q1 batch: 18 school installations'),
      title: 'Complete Q1 batch: 18 school installations',
      description: 'Deliver 18 complete solar installations in Q1 2026 including panel mounting, wiring, grid connection, and student handover.',
      parent_objective_id: installationsId,
      status: 'Completed',
      progress: 100,
      start_date: monthsAgo(6),
      end_date: monthsAgo(3),
      workstream: 'Installations',
    },
    {
      id: deterministicId('sfs-obj:Complete Q2 batch: 20 school installations'),
      title: 'Complete Q2 batch: 20 school installations',
      description: 'Deliver 20 installations in Q2 including Sacred Heart, Ark Victoria Academy, and 18 others currently in the pipeline.',
      parent_objective_id: installationsId,
      status: 'In Progress',
      progress: 60,
      start_date: monthsAgo(3),
      end_date: monthsFromNow(1),
      workstream: 'Installations',
    },
    {
      id: deterministicId('sfs-obj:Secure council framework agreements for 5 new local authorities'),
      title: 'Secure council framework agreements for 5 new local authorities',
      description: 'Negotiate and sign framework agreements with 5 new councils, building on the 5 councils added in 2025.',
      parent_objective_id: installationsId,
      status: 'In Progress',
      progress: 40,
      start_date: monthsAgo(2),
      end_date: monthsFromNow(4),
      workstream: 'Partnerships',
    },
    {
      id: deterministicId('sfs-obj:Finalise Great British Energy partnership schools'),
      title: 'Finalise Great British Energy partnership — tranche 2 schools',
      description: 'Work with DESNZ and GB Energy to allocate and begin installations at tranche 2 schools from the £80 million program.',
      parent_objective_id: installationsId,
      status: 'In Progress',
      progress: 25,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(5),
      workstream: 'Government',
    },
    // → Series B
    {
      id: deterministicId('sfs-obj:Prepare Series B investor deck and data room'),
      title: 'Prepare Series B investor deck & data room',
      description: 'Build the pitch deck, financial model, impact metrics, and virtual data room for the €25M Series B raise.',
      parent_objective_id: seriesBId,
      status: 'In Progress',
      progress: 70,
      start_date: monthsAgo(3),
      end_date: monthsAgo(0, 28),
      workstream: 'Fundraising',
    },
    {
      id: deterministicId('sfs-obj:Complete investor roadshow: 15 target funds'),
      title: 'Complete investor roadshow: 15 target funds',
      description: 'Meet with 15 target impact funds and climate VCs. Priority targets: Foresight Group, Triodos Investment Management, Big Society Capital, Abundance Investment.',
      parent_objective_id: seriesBId,
      status: 'In Progress',
      progress: 35,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(2),
      workstream: 'Fundraising',
    },
    {
      id: deterministicId('sfs-obj:Negotiate and close lead investor term sheet'),
      title: 'Negotiate and close lead investor term sheet',
      description: 'Secure a lead investor committing €10-15M and negotiate the term sheet covering valuation, board seats, and expansion milestones.',
      parent_objective_id: seriesBId,
      status: 'Not Started',
      progress: 5,
      start_date: monthsFromNow(1),
      end_date: monthsFromNow(3),
      workstream: 'Fundraising',
    },
    // → University program
    {
      id: deterministicId('sfs-obj:Sign pilot agreements with 3 universities'),
      title: 'Sign pilot agreements with 3 universities',
      description: 'Secure signed agreements for rooftop solar + battery storage pilots at University of Essex, University of Birmingham, and a London university.',
      parent_objective_id: universityId,
      status: 'In Progress',
      progress: 25,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(4),
      workstream: 'University',
    },
    {
      id: deterministicId('sfs-obj:Design 500kW+ rooftop system for university campus'),
      title: 'Design 500kW+ rooftop system for university campus',
      description: 'Create the technical design for a large-scale university rooftop system including structural assessment, panel layout, inverter sizing, and battery integration.',
      parent_objective_id: universityId,
      status: 'Not Started',
      progress: 0,
      start_date: monthsFromNow(2),
      end_date: monthsFromNow(6),
      workstream: 'Engineering',
    },
    // → Sales & Marketing
    {
      id: deterministicId('sfs-obj:Launch school board outreach campaign'),
      title: 'Launch school board outreach campaign',
      description: 'Build and execute a multi-channel outreach campaign targeting headteachers and school business managers. Includes email sequences, the 2026 Impact Report, and council co-marketing.',
      parent_objective_id: salesMarketingId,
      status: 'In Progress',
      progress: 55,
      start_date: monthsAgo(3),
      end_date: monthsFromNow(2),
      workstream: 'Marketing',
    },
    {
      id: deterministicId('sfs-obj:Build referral program: school-to-school recommendations'),
      title: 'Build referral program: school-to-school recommendations',
      description: 'Launch a formal referral program where satisfied schools can recommend us to neighbouring schools, with incentives for both parties.',
      parent_objective_id: salesMarketingId,
      status: 'In Progress',
      progress: 30,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(3),
      workstream: 'Marketing',
    },
    {
      id: deterministicId('sfs-obj:Produce 2026 Impact Report for school recruitment'),
      title: 'Produce 2026 Impact Report for school decision-makers',
      description: 'Create a professionally designed impact report covering 326 schools, 108K students reached, carbon savings, and financial savings — to use as a sales tool.',
      parent_objective_id: salesMarketingId,
      status: 'In Progress',
      progress: 45,
      start_date: monthsAgo(2),
      end_date: monthsAgo(0, 15),
      workstream: 'Marketing',
    },
    // → Battery storage
    {
      id: deterministicId('sfs-obj:Specify battery and inverter system for school deployment'),
      title: 'Specify battery + inverter system for school deployment',
      description: 'Select the battery chemistry, inverter, and BMS for the standard school deployment package. Target: 10-20kWh storage per school.',
      parent_objective_id: batteryStorageId,
      status: 'In Progress',
      progress: 15,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(3),
      workstream: 'Engineering',
    },
    {
      id: deterministicId('sfs-obj:Secure grid export agreements with DNOs for 10 schools'),
      title: 'Secure grid export agreements with DNOs for 10 schools',
      description: 'Negotiate grid export agreements with UK Power Networks and Western Power Distribution for 10 pilot school sites.',
      parent_objective_id: batteryStorageId,
      status: 'Not Started',
      progress: 0,
      start_date: monthsFromNow(2),
      end_date: monthsFromNow(7),
      workstream: 'Operations',
    },
  ]

  const { error: objError } = await supabase.from('objectives').upsert(
    objectives.map((o) => ({
      ...o,
      foundry_id: FOUNDRY_ID,
      creator_id: robertId,
      is_strategic_goal: false,
      created_at: o.start_date,
    }))
  )

  if (objError) {
    console.error(`   ❌ Objectives failed: ${objError.message}`)
  } else {
    console.log(`   ✅ ${objectives.length} objectives created`)
  }

  // Grab objective IDs by index for task linking
  const objIds = objectives.map((o) => o.id)
  const [
    q1BatchId, q2BatchId, councilId, gbEnergyId,
    deckId, roadshowId, termSheetId,
    uniPilotsId, uniDesignId,
    outreachId, referralId, impactReportId,
    batterySpecId, gridExportId,
  ] = objIds

  // ── 8. Tasks ──────────────────────────────────────────────────────────────
  console.log('\n✅ Step 8: Tasks')

  const tasks = [
    // ─── COMPLETED TASKS (backdated 3-6 months) ───
    {
      title: 'Complete site survey — Barn Croft Primary School',
      description: 'Conduct full roof survey including structural load assessment, shading analysis, and electrical capacity check at Barn Croft Primary.',
      objective_id: q1BatchId,
      status: 'Accepted',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsAgo(6),
      end_date: monthsAgo(5),
      progress: 100,
    },
    {
      title: 'Install 25kW array — Sacred Heart Catholic Primary School',
      description: 'Complete installation of 25kW rooftop solar array including panel mounting, DC wiring, inverter installation, and AC connection to school distribution board.',
      objective_id: q1BatchId,
      status: 'Accepted',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsAgo(5),
      end_date: monthsAgo(4),
      progress: 100,
    },
    {
      title: 'Commission grid connection — Abingdon Primary School',
      description: 'Complete DNO notification, G99 application, and final grid connection commissioning for the 20kW system at Abingdon Primary.',
      objective_id: q1BatchId,
      status: 'Accepted',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsAgo(5),
      end_date: monthsAgo(4, 20),
      progress: 100,
    },
    {
      title: 'Complete wiring & battery install — Shakespeare Primary School',
      description: 'Install AC/DC wiring runs, battery storage unit (10kWh), and monitoring hardware at Shakespeare Primary. Commission the Solar Explorer dashboard.',
      objective_id: q1BatchId,
      status: 'Accepted',
      assignee_id: elenaId ?? robertId,
      start_date: monthsAgo(4),
      end_date: monthsAgo(3),
      progress: 100,
    },
    {
      title: 'Run student solar ambassador assembly — Hollybush Primary School',
      description: 'Deliver solar ambassador assembly to 200+ students at Hollybush Primary. Train 12 student solar ambassadors who will monitor the system and present to parents.',
      objective_id: q1BatchId,
      status: 'Accepted',
      assignee_id: sophieId ?? robertId,
      start_date: monthsAgo(4),
      end_date: monthsAgo(3, 20),
      progress: 100,
    },
    {
      title: 'Submit CBS bond prospectus to FCA',
      description: 'Submit the updated Community Benefit Society bond prospectus to the Financial Conduct Authority for the 2026 bond round, targeting £3M.',
      objective_id: deckId,
      status: 'Accepted',
      assignee_id: liamId ?? robertId,
      start_date: monthsAgo(4),
      end_date: monthsAgo(3),
      progress: 100,
    },
    {
      title: 'Close Triodos bank facility extension — £2M',
      description: 'Negotiate and close a £2M credit facility extension with Triodos Bank to fund Q2 installations while Series B is in progress.',
      objective_id: deckId,
      status: 'Accepted',
      assignee_id: liamId ?? robertId,
      start_date: monthsAgo(3),
      end_date: monthsAgo(2),
      progress: 100,
    },
    {
      title: 'Finalise Q1 impact report: 18 schools, 4,200 students',
      description: 'Compile Q1 2026 impact data: 18 schools installed, 4,200 students reached through assemblies and workshops, 450 tonnes CO₂ avoided.',
      objective_id: impactReportId,
      status: 'Accepted',
      assignee_id: sophieId ?? robertId,
      start_date: monthsAgo(3),
      end_date: monthsAgo(2, 15),
      progress: 100,
    },

    // ─── IN-PROGRESS TASKS (current) ───
    {
      title: 'Site survey — Ark Victoria Academy, Birmingham',
      description: 'Conduct comprehensive site survey at Ark Victoria Academy. Large campus with multiple buildings — assess roof capacity across 3 buildings for combined 50kW+ system.',
      objective_id: q2BatchId,
      status: 'Accepted',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(0, 28),
      progress: 60,
    },
    {
      title: 'Battery pack specification for 10-school pilot',
      description: 'Evaluate LFP vs NMC chemistry for school deployments. Compare Tesla Powerwall, BYD Battery-Box, and GivEnergy offerings for 10-20kWh per school.',
      objective_id: batterySpecId,
      status: 'Accepted',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(1),
      progress: 45,
    },
    {
      title: 'Draft Series B pitch deck v3 — €25M raise',
      description: 'Iterate on the pitch deck incorporating latest impact data (326 schools, £80M GBE backing, 108K students). Focus on pan-European expansion thesis and CBS model scalability.',
      objective_id: deckId,
      status: 'Accepted',
      assignee_id: robertId,
      start_date: monthsAgo(2),
      end_date: monthsAgo(0, 25),
      progress: 70,
    },
    {
      title: 'Schedule investor meetings: Foresight, Triodos IM, Big Society Capital',
      description: 'Reach out to 15 target funds and schedule initial meetings. Priority: Foresight Group (€10M lead), Triodos Investment Management, Big Society Capital, Abundance Investment.',
      objective_id: roadshowId,
      status: 'Accepted',
      assignee_id: liamId ?? robertId,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(1),
      progress: 40,
    },
    {
      title: 'Design 200kW rooftop system for University of Essex pilot',
      description: 'Create preliminary design for 200kW rooftop array across the University of Essex Colchester campus. Include battery storage integration and EV charging potential.',
      objective_id: uniPilotsId,
      status: 'Accepted',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsAgo(0, 1),
      end_date: monthsFromNow(2),
      progress: 30,
    },
    {
      title: 'Negotiate grid export terms with UK Power Networks for 5 schools',
      description: 'Work with UKPN to establish export agreements for battery-equipped schools. Target: minimum 5p/kWh export tariff for peak-time discharge.',
      objective_id: gridExportId,
      status: 'Accepted',
      assignee_id: elenaId ?? robertId,
      start_date: monthsAgo(0, 10),
      end_date: monthsFromNow(3),
      progress: 20,
    },
    {
      title: 'Build school outreach email sequence — 500 headteachers',
      description: 'Design and build a 6-email nurture sequence targeting headteachers and school business managers. Include case studies from Barn Croft, Sacred Heart, and Shakespeare Primary.',
      objective_id: outreachId,
      status: 'Accepted',
      assignee_id: sophieId ?? robertId,
      start_date: monthsAgo(2),
      end_date: monthsAgo(0, 20),
      progress: 55,
    },
    {
      title: 'Prepare parliamentary showcase materials for spring 2026',
      description: 'Build presentation materials for the spring 2026 Westminster Parliamentary Showcase. Coordinate with 8 schools for student presentations to MPs.',
      objective_id: outreachId,
      status: 'Accepted',
      assignee_id: sophieId ?? robertId,
      start_date: monthsAgo(1),
      end_date: monthsFromNow(2),
      progress: 25,
    },

    // ─── UPCOMING TASKS (next 1-3 months) ───
    {
      title: 'Install 30kW array — St. Augustine\'s Catholic Primary School',
      description: 'Full installation of 30kW rooftop system at St. Augustine\'s. Scheduled for half-term to minimise disruption. Includes student assembly on installation day.',
      objective_id: q2BatchId,
      status: 'Pending',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsFromNow(0, 20),
      end_date: monthsFromNow(1, 15),
      progress: 0,
    },
    {
      title: 'Commission battery storage — Mountjoy School',
      description: 'Install and commission 15kWh battery storage system at Mountjoy School. Integrate with existing 20kW solar array and Solar Explorer monitoring.',
      objective_id: batterySpecId,
      status: 'Pending',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsFromNow(1),
      end_date: monthsFromNow(2),
      progress: 0,
    },
    {
      title: 'Meeting with Oasis Academy Bank Leaze — expansion proposal',
      description: 'Present expansion proposal to Oasis Academy Bank Leaze for adding battery storage and doubling their existing solar capacity. Prepare ROI analysis.',
      objective_id: q2BatchId,
      status: 'Pending',
      assignee_id: sophieId ?? robertId,
      start_date: monthsFromNow(0, 25),
      end_date: monthsFromNow(1, 5),
      progress: 0,
    },
    {
      title: 'Meeting with Great British Energy — tranche 2 school allocation',
      description: 'Meeting with DESNZ and GB Energy team to discuss allocation of tranche 2 schools from the £80M program. Target: 40 schools in our allocation.',
      objective_id: gbEnergyId,
      status: 'Pending',
      assignee_id: robertId,
      start_date: monthsFromNow(0, 22),
      end_date: monthsFromNow(1, 1),
      progress: 0,
    },
    {
      title: 'University of Birmingham — initial campus solar feasibility study',
      description: 'Conduct initial feasibility assessment for the University of Birmingham campus. Estimate potential for 300-500kW across multiple buildings.',
      objective_id: uniPilotsId,
      status: 'Pending',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsFromNow(1),
      end_date: monthsFromNow(3),
      progress: 0,
    },
    {
      title: 'Series B due diligence data room — financial model review',
      description: 'Prepare the virtual data room with audited financials, 25-year school agreement templates, CBS governance docs, and the 5-year expansion model.',
      objective_id: termSheetId,
      status: 'Pending',
      assignee_id: liamId ?? robertId,
      start_date: monthsFromNow(1),
      end_date: monthsFromNow(2),
      progress: 0,
    },
    {
      title: 'Investor meeting — Foresight Group (€10M lead ticket)',
      description: 'Pitch meeting with Foresight Group infrastructure team for a potential €10M lead investment in the Series B round. Prepare bespoke deck focusing on infrastructure-grade returns.',
      objective_id: roadshowId,
      status: 'Pending',
      assignee_id: robertId,
      start_date: monthsFromNow(0, 26),
      end_date: monthsFromNow(1, 10),
      progress: 0,
    },
    {
      title: 'Produce 2026 Impact Video for school recruitment',
      description: 'Commission and produce a 2-minute impact video featuring headteacher testimonials from Barn Croft, Sacred Heart, and Shakespeare Primary. For use in email outreach and conferences.',
      objective_id: impactReportId,
      status: 'Pending',
      assignee_id: sophieId ?? robertId,
      start_date: monthsFromNow(1),
      end_date: monthsFromNow(2, 15),
      progress: 0,
    },
    {
      title: 'Launch school referral incentive program',
      description: 'Design and launch a referral program: schools that refer another school receive a free battery monitoring dashboard upgrade. Target: 20 referrals in first quarter.',
      objective_id: referralId,
      status: 'Pending',
      assignee_id: sophieId ?? robertId,
      start_date: monthsFromNow(0, 20),
      end_date: monthsFromNow(2),
      progress: 0,
    },
    {
      title: 'Hire 5 new regional educators for 2026 expansion',
      description: 'Recruit 5 new regional educators to join the existing team of 18. Focus on regions with high school density: Greater Manchester, West Midlands, South East London, Leeds, and Bristol.',
      objective_id: outreachId,
      status: 'Pending',
      assignee_id: elenaId ?? robertId,
      start_date: monthsFromNow(1),
      end_date: monthsFromNow(3),
      progress: 0,
    },
    {
      title: 'Complete Adderley Primary School wiring inspection',
      description: 'Final electrical inspection and sign-off of the wiring installation at Adderley Primary School. Verify compliance with BS 7671 and issue EIC certificate.',
      objective_id: q2BatchId,
      status: 'Pending',
      assignee_id: tobiasId ?? robertId,
      start_date: monthsFromNow(0, 18),
      end_date: monthsFromNow(1, 5),
      progress: 0,
    },
    {
      title: 'Henry Maynard Primary — battery monitoring system setup',
      description: 'Install and configure the Solar Explorer battery monitoring dashboard at Henry Maynard Primary. Train school staff and student eco-committee on the interface.',
      objective_id: batterySpecId,
      status: 'Pending',
      assignee_id: elenaId ?? robertId,
      start_date: monthsFromNow(1, 10),
      end_date: monthsFromNow(2, 5),
      progress: 0,
    },
  ]

  const { count: existingTaskCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingTaskCount && existingTaskCount > 0) {
    console.log(`   ⏭️  Skipping — ${existingTaskCount} tasks already exist for this foundry`)
  } else {
    const { error: taskError } = await supabase.from('tasks').insert(
      tasks.map((t, i) => ({
        ...t,
        foundry_id: FOUNDRY_ID,
        creator_id: robertId,
        task_number: i + 1,
        created_at: t.start_date,
      }))
    )

    if (taskError) {
      console.error(`   ❌ Tasks failed: ${taskError.message}`)
    } else {
      console.log(`   ✅ ${tasks.length} tasks created`)
    }
  }

  // ── 9. Task History (audit trail) ─────────────────────────────────────────
  console.log('\n📜 Step 9: Task History')

  const { data: allTasks } = await supabase
    .from('tasks')
    .select('id, title, status, created_at, start_date, end_date, assignee_id')
    .eq('foundry_id', FOUNDRY_ID)
    .is('deleted_at', null)

  if (allTasks && allTasks.length > 0) {
    const taskIds = allTasks.map((t) => t.id)
    const { count: existingHistory } = await supabase
      .from('task_history')
      .select('*', { count: 'exact', head: true })
      .in('task_id', taskIds)

    if (existingHistory && existingHistory > 0) {
      console.log(`   ⏭️  Skipping — ${existingHistory} history entries already exist`)
    } else {
      const historyEntries = []

      for (const task of allTasks) {
        historyEntries.push({
          id: uuidv4(),
          task_id: task.id,
          user_id: robertId,
          action_type: 'CREATED',
          changes: { title: task.title },
          created_at: task.created_at ?? task.start_date ?? monthsAgo(6),
        })

        if (task.status === 'Accepted' && task.assignee_id) {
          historyEntries.push({
            id: uuidv4(),
            task_id: task.id,
            user_id: task.assignee_id,
            action_type: 'STATUS_CHANGED',
            changes: { from: 'Pending', to: 'Accepted' },
            created_at: new Date(
              new Date(task.start_date ?? task.created_at ?? monthsAgo(5)).getTime() + 2 * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
        }

        const isComplete = task.title.includes('Q1') ||
          task.title.includes('Barn Croft') ||
          task.title.includes('Sacred Heart') ||
          task.title.includes('Abingdon') ||
          task.title.includes('Shakespeare') ||
          task.title.includes('Hollybush') ||
          task.title.includes('CBS bond') ||
          task.title.includes('Triodos bank') ||
          task.title.includes('Q1 impact')

        if (isComplete && task.end_date) {
          historyEntries.push({
            id: uuidv4(),
            task_id: task.id,
            user_id: task.assignee_id ?? robertId,
            action_type: 'COMPLETED',
            changes: { progress: 100 },
            created_at: task.end_date,
          })
        }
      }

      const { error: histError } = await supabase.from('task_history').insert(historyEntries)

      if (histError) {
        console.error(`   ❌ Task history failed: ${histError.message}`)
      } else {
        console.log(`   ✅ ${historyEntries.length} task history entries created`)
      }
    }
  }

  // ── 10. Activity Events ───────────────────────────────────────────────────
  console.log('\n📊 Step 10: Activity Events')

  const { count: existingEvents } = await supabase
    .from('activity_events')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingEvents && existingEvents > 0) {
    console.log(`   ⏭️  Skipping — ${existingEvents} events already exist`)
  } else {
    const events = [
      { event_type: 'page_view', event_data: { page: '/today' }, created_at: daysAgo(1) },
      { event_type: 'page_view', event_data: { page: '/strategy' }, created_at: daysAgo(1) },
      { event_type: 'page_view', event_data: { page: '/tasks' }, created_at: daysAgo(2) },
      { event_type: 'page_view', event_data: { page: '/objectives' }, created_at: daysAgo(2) },
      { event_type: 'page_view', event_data: { page: '/team' }, created_at: daysAgo(3) },
      { event_type: 'search', event_data: { query: 'battery storage specification' }, created_at: daysAgo(3) },
      { event_type: 'search', event_data: { query: 'Series B pitch deck' }, created_at: daysAgo(4) },
      { event_type: 'feature_use', event_data: { feature: 'task_create' }, created_at: daysAgo(5) },
      { event_type: 'feature_use', event_data: { feature: 'objective_view' }, created_at: daysAgo(6) },
      { event_type: 'page_view', event_data: { page: '/today' }, created_at: daysAgo(7) },
      { event_type: 'page_view', event_data: { page: '/advisory' }, created_at: daysAgo(8) },
      { event_type: 'search', event_data: { query: 'grid export agreement' }, created_at: daysAgo(10) },
      { event_type: 'feature_use', event_data: { feature: 'task_status_change' }, created_at: daysAgo(12) },
      { event_type: 'page_view', event_data: { page: '/today' }, created_at: daysAgo(14) },
      { event_type: 'page_view', event_data: { page: '/marketplace' }, created_at: daysAgo(15) },
    ]

    const { error: eventError } = await supabase.from('activity_events').insert(
      events.map((e) => ({
        ...e,
        user_id: robertId,
        foundry_id: FOUNDRY_ID,
      }))
    )

    if (eventError) {
      console.error(`   ❌ Activity events failed: ${eventError.message}`)
    } else {
      console.log(`   ✅ ${events.length} activity events created`)
    }
  }

  // ── 11. Schedule 24-hour auto-cleanup ─────────────────────────────────────
  console.log('\n⏰ Step 11: Scheduling 24-hour auto-cleanup')

  try {
    const scriptDir = new URL('.', import.meta.url).pathname
    const cleanupScript = `${scriptDir}cleanup-solar-for-schools.ts`
    const cmd = `echo "cd '${process.cwd()}' && npx tsx '${cleanupScript}'" | at now + 24 hours 2>&1`
    const result = execSync(cmd, { encoding: 'utf-8' })
    console.log(`   ✅ Auto-cleanup scheduled: ${result.trim()}`)
  } catch {
    console.log('   ⚠️  Could not schedule auto-cleanup via `at` command.')
    console.log('   ℹ️  Run manually in 24 hours: npx tsx scripts/cleanup-solar-for-schools.ts')
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n🎉 Solar for Schools seed complete!\n')
  console.log('━'.repeat(70))
  console.log('☀️  Robert\'s login credentials:')
  console.log(`   Email:    robert.schrimpff@gmail.com`)
  console.log(`   Password: ${PASSWORD}`)
  console.log('━'.repeat(70))
  console.log('\n👥 Executive team (same password):')
  console.log('   elena.vasquez@solarforschools.co.uk    (COO)')
  console.log('   tobias.richter@solarforschools.co.uk   (CTO)')
  console.log('   sophie.andersson@solarforschools.co.uk (VP Sales)')
  console.log('   liam.oconnor@solarforschools.co.uk     (CFO)')
  console.log('━'.repeat(70))
  console.log(`\n⏰ Demo expires: ${new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString()}`)
  console.log('   Auto-cleanup scheduled (or run: npx tsx scripts/cleanup-solar-for-schools.ts)')
  console.log('━'.repeat(70))
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
