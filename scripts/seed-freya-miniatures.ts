/**
 * @file seed-freya-miniatures.ts
 *
 * @description Seeds a complete demo company — Freya Miniatures Ltd — for tester Freya.
 * Creates: foundry, users, foundry memberships, teams, strategic objectives,
 * objectives, and tasks.
 *
 * @usage npx tsx scripts/seed-freya-miniatures.ts
 *
 * Idempotent: safe to run multiple times. Checks for existing records before inserting.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v5 as uuidv5 } from 'uuid'

const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

/**
 * Generates a deterministic UUID from a seed string so the script
 * produces the same IDs every run, making upsert truly idempotent.
 */
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
  auth: { autoRefreshToken: false, persistSession: false }
})

// ─── Constants ────────────────────────────────────────────────────────────────

const FOUNDRY_ID = 'freya-miniatures'

const ACCOUNTS = [
  {
    email: 'freya.jane.foster@gmail.com',
    password: 'FreyaMinis2026!',
    fullName: 'Freya Foster',
    role: 'Executive' as const,
    headline: 'Founder & CEO at Freya Miniatures Ltd',
    bio: 'Passionate about making high-quality 3D printing accessible to every tabletop gamer. Former product designer at Games Workshop.',
  },
  {
    email: 'marcus.chen@freyaminiatures.com',
    password: 'FreyaMinis2026!',
    fullName: 'Marcus Chen',
    role: 'Executive' as const,
    headline: 'Head of Product Engineering',
    bio: 'Mechanical engineer with 8 years in additive manufacturing. Obsessed with layer resolution and resin chemistry.',
  },
  {
    email: 'isla.thornton@freyaminiatures.com',
    password: 'FreyaMinis2026!',
    fullName: 'Isla Thornton',
    role: 'Apprentice' as const,
    headline: 'Community & Marketing Apprentice',
    bio: 'Warhammer enthusiast and content creator. Joining Freya Miniatures to help grow the best community in tabletop 3D printing.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates or retrieves a Supabase auth user.
 *
 * @param email - User email address
 * @param password - Login password
 * @param fullName - Display name
 * @returns The user's UUID, or null on failure
 */
async function getOrCreateAuthUser(
  email: string,
  password: string,
  fullName: string
): Promise<string | null> {
  // Check profiles table first (avoids paginated auth.admin.listUsers)
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

  if (error || !data.user) {
    console.error(`   ❌ Failed to create auth user: ${error?.message}`)
    return null
  }

  console.log(`   ✅ Created auth user: ${data.user.id}`)
  return data.user.id
}

/**
 * Upserts a profile record for a user.
 *
 * @param id - User UUID from auth
 * @param email - User email
 * @param fullName - Display name
 * @param role - member_role ENUM value
 * @param headline - Short professional headline
 * @param bio - Profile bio
 */
async function upsertProfile(
  id: string,
  email: string,
  fullName: string,
  role: 'Executive' | 'Apprentice' | 'AI_Agent',
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
    console.error(`   ❌ Profile upsert failed: ${error.message}`)
  } else {
    console.log(`   ✅ Profile synced`)
  }
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('\n🌱 Seeding Freya Miniatures Ltd...\n')

  // ── 1. Foundry ────────────────────────────────────────────────────────────
  console.log('🏭 Step 1: Foundry')

  const { data: existingFoundry } = await supabase
    .from('foundries')
    .select('id')
    .eq('id', FOUNDRY_ID)
    .single()

  // Always upsert so purpose_data and company_profile are applied on re-runs too
  const { error } = await supabase.from('foundries').upsert({
    id: FOUNDRY_ID,
    name: 'Freya Miniatures Ltd',
    slug: 'freya-miniatures',
    industry: 'Manufacturing',
    sector: 'manufacturing',
    stage: 'Seed',

    // Matches CompanyProfile interface in src/types/foundry.ts
    company_profile: {
      employee_count: '2-5',
      revenue_range: 'pre_revenue',
      funding_status: 'seed',
      seeking_funding: true,
      founded_year: 2024,
      location: 'Bristol, United Kingdom',
      website: 'https://freyaminiatures.com',
      business_model: 'hardware',
      competitors: ['Elegoo', 'Phrozen', 'Anycubic', 'Bambu Lab'],
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },

    // Matches FoundryPurposeData interface in src/types/foundry.ts
    purpose_data: {
      purpose:
        'We exist to democratise high-quality miniature printing — putting studio-grade results in the hands of every hobbyist and indie game creator, not just those with engineering degrees.',
      mission:
        'To design and manufacture the world\'s most accessible precision resin printers for the tabletop gaming community, backed by an open ecosystem of print profiles and community support.',
      vision:
        'A world where any tabletop gamer — from a teenager in their bedroom to an indie game studio — can bring their imagination to life at professional quality, without compromise.',
      questionnaire: {
        whyExists:
          'Because the tools that exist today were designed for engineers, not for people who want to print a beautiful orc at 2am. The hobbyist community deserves hardware and software built specifically for them.',
        problemSolved:
          'Consumer resin printers are either too cheap to deliver crisp 28mm detail, or too complex and expensive for the average hobbyist. There is no middle ground that combines quality, ease of use, and community support.',
        whoServed:
          'Tabletop gamers, miniature painters, indie game designers, and small game publishers who want to create and print high-quality miniatures without needing a manufacturing background.',
        uniqueValue:
          'We are the only printer manufacturer whose entire product — hardware, resin, slicing software, and print profiles — is designed from the ground up for miniature gaming. We ship with print profiles for 50+ popular miniature lines out of the box.',
        fiveYearVision:
          'Freya Miniatures is the default choice for the tabletop 3D printing community globally. Our STL marketplace has 500+ indie designers, and our printers are used in 10,000+ homes. We have official partnerships with 5 major game publishers.',
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },
  })

  if (error) {
    console.error(`   ❌ Foundry upsert failed: ${error.message}`)
    process.exit(1)
  }
  console.log(existingFoundry ? '   ✅ Foundry updated with purpose & profile data' : '   ✅ Foundry created')

  // ── 2. Users & Profiles ───────────────────────────────────────────────────
  console.log('\n👥 Step 2: Users & Profiles')
  const userIds: Record<string, string> = {}

  for (const account of ACCOUNTS) {
    console.log(`\n   👤 ${account.fullName} (${account.email})`)
    const id = await getOrCreateAuthUser(account.email, account.password, account.fullName)
    if (!id) continue

    await upsertProfile(id, account.email, account.fullName, account.role, account.headline, account.bio)
    userIds[account.email] = id
  }

  const freyaId = userIds['freya.jane.foster@gmail.com']
  const marcusId = userIds['marcus.chen@freyaminiatures.com']
  const islaId = userIds['isla.thornton@freyaminiatures.com']

  if (!freyaId) {
    console.error('\n❌ Freya user not created — cannot continue.')
    process.exit(1)
  }

  // ── 3. Foundry Memberships ────────────────────────────────────────────────
  console.log('\n🔗 Step 3: Foundry Memberships')

  const memberships = [
    { user_id: freyaId, role: 'Executive', is_primary: true },
    ...(marcusId ? [{ user_id: marcusId, role: 'Executive', is_primary: true }] : []),
    ...(islaId ? [{ user_id: islaId, role: 'Apprentice', is_primary: true }] : []),
  ]

  for (const m of memberships) {
    const { data: existing } = await supabase
      .from('foundry_memberships')
      .select('id')
      .eq('user_id', m.user_id)
      .eq('foundry_id', FOUNDRY_ID)
      .single()

    if (existing) {
      console.log(`   ↳ Membership already exists for user ${m.user_id}`)
      continue
    }

    const { error } = await supabase.from('foundry_memberships').insert({
      user_id: m.user_id,
      foundry_id: FOUNDRY_ID,
      role: m.role,
      is_primary: m.is_primary,
      joined_at: new Date().toISOString(),
    })

    if (error) {
      console.error(`   ❌ Membership insert failed: ${error.message}`)
    } else {
      console.log(`   ✅ Membership created for ${m.user_id}`)
    }
  }

  // ── 4. Teams ──────────────────────────────────────────────────────────────
  console.log('\n👥 Step 4: Teams')

  const engineeringTeamId = uuidv4()
  const communityTeamId = uuidv4()

  const teams = [
    {
      id: engineeringTeamId,
      name: 'Engineering & R&D',
      description: 'Hardware design, resin chemistry, firmware, and print quality.',
      members: [freyaId, ...(marcusId ? [marcusId] : [])],
    },
    {
      id: communityTeamId,
      name: 'Community & Growth',
      description: 'Discord, social media, conventions, and creator partnerships.',
      members: [freyaId, ...(islaId ? [islaId] : [])],
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
      const { error } = await supabase.from('teams').insert({
        id: team.id,
        name: team.name,
        description: team.description,
        foundry_id: FOUNDRY_ID,
      })

      if (error) {
        console.error(`   ❌ Team "${team.name}" failed: ${error.message}`)
        continue
      }

      teamId = team.id
      console.log(`   ✅ Team "${team.name}" created`)
    }

    // Add members
    for (const userId of team.members) {
      const { error: memberError } = await supabase
        .from('team_members')
        .upsert({ team_id: teamId, profile_id: userId })

      if (memberError) {
        console.error(`      ❌ Team member insert failed: ${memberError.message}`)
      }
    }
  }

  // ── 5. Strategic Objectives ───────────────────────────────────────────────
  console.log('\n🎯 Step 5: Strategic Objectives')

  const now = new Date()
  const d = (months: number, day = 1): string => {
    const dt = new Date(now)
    dt.setMonth(dt.getMonth() + months)
    dt.setDate(day)
    return dt.toISOString()
  }

  const strategicObjectives = [
    {
      id: deterministicId('freya-strat:Launch the ForgePrint Pro resin printer to market'),
      title: 'Launch the ForgePrint Pro resin printer to market',
      description:
        'Bring our flagship 3D printer from prototype to commercial launch. Includes hardware finalisation, resin certification, packaging, and fulfilment pipeline.',
      status: 'In Progress',
      progress: 28,
      start_date: d(0),
      end_date: d(10),
    },
    {
      id: deterministicId('freya-strat:Achieve £500K ARR within 18 months'),
      title: 'Achieve £500K ARR within 18 months',
      description:
        'Build recurring revenue through printer sales, resin subscriptions, and digital STL marketplace commissions.',
      status: 'Not Started',
      progress: 5,
      start_date: d(0),
      end_date: d(18),
    },
    {
      id: deterministicId('freya-strat:Build a thriving tabletop creator community of 2,000+ members'),
      title: 'Build a thriving tabletop creator community of 2,000+ members',
      description:
        'Grow and nurture an engaged community of miniature painters, game designers, and 3D printing enthusiasts who champion the brand.',
      status: 'In Progress',
      progress: 15,
      start_date: d(0),
      end_date: d(10),
    },
    {
      id: deterministicId('freya-strat:Establish partnerships with 3 major game publishers'),
      title: 'Establish partnerships with 3 major game publishers',
      description:
        'Secure official licensing and co-marketing deals with established tabletop IP holders to provide optimised print profiles.',
      status: 'Not Started',
      progress: 8,
      start_date: d(1),
      end_date: d(7),
    },
    {
      id: deterministicId('freya-strat:Deliver industry-leading print quality at 28mm scale'),
      title: 'Deliver industry-leading print quality at 28mm scale',
      description:
        'Achieve and certify sub-20 micron XY resolution for standard miniature sizes, validated by community test prints and independent review.',
      status: 'In Progress',
      progress: 45,
      start_date: d(0),
      end_date: d(4),
    },
  ]

  const { error: strObjError } = await supabase.from('objectives').upsert(
    strategicObjectives.map((o) => ({
      ...o,
      foundry_id: FOUNDRY_ID,
      creator_id: freyaId,
      is_strategic_goal: true,
      created_at: new Date().toISOString(),
    }))
  )

  if (strObjError) {
    console.error(`   ❌ Strategic objectives failed: ${strObjError.message}`)
  } else {
    console.log(`   ✅ ${strategicObjectives.length} strategic objectives created`)
  }

  const [launchId, arrId, communityId, partnershipsId, qualityId] = strategicObjectives.map((o) => o.id)

  // ── 6. Regular Objectives ─────────────────────────────────────────────────
  console.log('\n📋 Step 6: Objectives')

  const objectives = [
    // → Launch printer
    {
      id: deterministicId('freya-obj:Finalise ForgePrint Pro hardware design'),
      title: 'Finalise ForgePrint Pro hardware design',
      description:
        'Complete chassis CAD, validate structural integrity, and sign off final bill of materials with our CM partner.',
      parent_objective_id: launchId,
      status: 'In Progress',
      progress: 60,
      start_date: d(0),
      end_date: d(2),
      workstream: 'Hardware',
    },
    {
      id: deterministicId('freya-obj:Run Kickstarter campaign for ForgePrint Pro'),
      title: 'Run Kickstarter campaign for ForgePrint Pro',
      description:
        'Plan, launch, and manage a crowdfunding campaign targeting £150K to fund the first production run.',
      parent_objective_id: launchId,
      status: 'Not Started',
      progress: 10,
      start_date: d(3),
      end_date: d(6),
      workstream: 'Marketing',
    },
    {
      id: deterministicId('freya-obj:Deliver first commercial batch of 100 printers'),
      title: 'Deliver first commercial batch of 100 printers',
      description:
        'Coordinate contract manufacture, QC testing, packaging, and delivery of the initial 100-unit batch to backers.',
      parent_objective_id: launchId,
      status: 'Not Started',
      progress: 0,
      start_date: d(7),
      end_date: d(10),
      workstream: 'Operations',
    },
    // → ARR
    {
      id: deterministicId('freya-obj:Launch tiered resin subscription service'),
      title: 'Launch tiered resin subscription service',
      description:
        'Design and go live with monthly resin subscription tiers (Hobbyist, Studio, Pro) including fulfilment and billing.',
      parent_objective_id: arrId,
      status: 'Not Started',
      progress: 12,
      start_date: d(4),
      end_date: d(8),
      workstream: 'Product',
    },
    {
      id: deterministicId('freya-obj:Build and launch STL marketplace for indie designers'),
      title: 'Build and launch STL marketplace for indie designers',
      description:
        'Create a curated digital marketplace where independent miniature designers can sell print-ready STL files, with Freya Miniatures taking a commission.',
      parent_objective_id: arrId,
      status: 'Not Started',
      progress: 5,
      start_date: d(5),
      end_date: d(12),
      workstream: 'Platform',
    },
    // → Community
    {
      id: deterministicId('freya-obj:Launch and grow the Freya Miniatures Discord community'),
      title: 'Launch and grow the Freya Miniatures Discord community',
      description:
        'Set up, structure, and actively grow a Discord server with print help channels, gallery, and monthly community events.',
      parent_objective_id: communityId,
      status: 'In Progress',
      progress: 35,
      start_date: d(0),
      end_date: d(3),
      workstream: 'Community',
    },
    {
      id: deterministicId('freya-obj:Attend and activate at 3 UK tabletop conventions'),
      title: 'Attend and activate at 3 UK tabletop conventions',
      description:
        'Book, prepare, and run demo booths at UK Games Expo, Tabletop Gaming Live, and UKGE Fringe to build brand awareness and collect leads.',
      parent_objective_id: communityId,
      status: 'Not Started',
      progress: 0,
      start_date: d(2),
      end_date: d(9),
      workstream: 'Events',
    },
    // → Partnerships
    {
      id: deterministicId('freya-obj:Secure Games Workshop official print profile agreement'),
      title: 'Secure Games Workshop official print profile agreement',
      description:
        'Negotiate and sign a licensing agreement with Games Workshop to provide officially endorsed print profiles for Warhammer 40K and Age of Sigmar miniatures.',
      parent_objective_id: partnershipsId,
      status: 'Not Started',
      progress: 8,
      start_date: d(1),
      end_date: d(6),
      workstream: 'Partnerships',
    },
    // → Print quality
    {
      id: deterministicId('freya-obj:Develop proprietary ForgeFlex resin formula'),
      title: 'Develop proprietary ForgeFlex resin formula',
      description:
        'Formulate and validate a custom resin blend optimised for fine detail, reduced warping, and safety (low-VOC) for use with the ForgePrint Pro.',
      parent_objective_id: qualityId,
      status: 'In Progress',
      progress: 55,
      start_date: d(0),
      end_date: d(3),
      workstream: 'Hardware',
    },
    {
      id: deterministicId('freya-obj:Build print profile library for 50 popular miniature ranges'),
      title: 'Build print profile library for 50 popular miniature ranges',
      description:
        'Create and publish optimised print profiles (exposure, supports, orientation) for 50 of the most popular miniature lines in the community.',
      parent_objective_id: qualityId,
      status: 'In Progress',
      progress: 30,
      start_date: d(0),
      end_date: d(4),
      workstream: 'Software',
    },
  ]

  const { error: objError } = await supabase.from('objectives').upsert(
    objectives.map((o) => ({
      ...o,
      foundry_id: FOUNDRY_ID,
      creator_id: freyaId,
      is_strategic_goal: false,
      created_at: new Date().toISOString(),
    }))
  )

  if (objError) {
    console.error(`   ❌ Objectives failed: ${objError.message}`)
  } else {
    console.log(`   ✅ ${objectives.length} objectives created`)
  }

  // ── 7. Tasks ──────────────────────────────────────────────────────────────
  console.log('\n✅ Step 7: Tasks')

  // Objective IDs by index: [0]=hardware, [1]=kickstarter, [2]=batch,
  // [3]=subscription, [4]=marketplace, [5]=discord, [6]=conventions,
  // [7]=gw-partnership, [8]=resin, [9]=print-profiles
  const [
    hardwareObjId,
    kickstarterObjId,
    batchObjId,
    subscriptionObjId,
    marketplaceObjId,
    discordObjId,
    conventionsObjId,
    gwPartnershipObjId,
    resinObjId,
    printProfilesObjId,
  ] = objectives.map((o) => o.id)

  const tasks = [
    // Hardware design
    {
      title: 'Finalise CAD model for printer chassis v2.1',
      description:
        'Complete the revised chassis geometry in Fusion 360, incorporating feedback from the print farm stress test. Export for CM review.',
      objective_id: hardwareObjId,
      status: 'Accepted',
      assignee_id: marcusId ?? freyaId,
      start_date: d(0),
      end_date: d(0, 28),
      progress: 75,
    },
    {
      title: 'Source UV-resistant FEP film suppliers — request samples from 5 vendors',
      description:
        'Contact at least 5 FEP film suppliers, request sample sheets for print testing, and compare optical clarity and longevity.',
      objective_id: hardwareObjId,
      status: 'Accepted',
      assignee_id: marcusId ?? freyaId,
      start_date: d(0),
      end_date: d(0, 21),
      progress: 100,
    },
    {
      title: 'Conduct structural load test on chassis prototype',
      description:
        'Run standard mechanical load tests on the v2 prototype chassis to verify it meets the 15kg static load spec.',
      objective_id: hardwareObjId,
      status: 'Pending',
      assignee_id: marcusId ?? freyaId,
      start_date: d(1),
      end_date: d(2),
      progress: 0,
    },
    // Kickstarter
    {
      title: 'Write Kickstarter campaign copy and set funding goal',
      description:
        'Draft all campaign page copy: headline, problem statement, product description, tiers, team section, and FAQ. Set £150K funding target.',
      objective_id: kickstarterObjId,
      status: 'Pending',
      assignee_id: freyaId,
      start_date: d(2),
      end_date: d(3),
      progress: 15,
    },
    {
      title: 'Produce Kickstarter campaign video',
      description:
        'Brief and direct a 90-second campaign video showing the printer in action, print results, and Freya\'s founder story.',
      objective_id: kickstarterObjId,
      status: 'Pending',
      assignee_id: freyaId,
      start_date: d(3),
      end_date: d(4),
      progress: 0,
    },
    {
      title: 'Build pre-launch email waitlist to 1,000 subscribers',
      description:
        'Run a targeted pre-launch campaign to build an email list of 1,000+ interested buyers before the Kickstarter goes live.',
      objective_id: kickstarterObjId,
      status: 'Pending',
      assignee_id: islaId ?? freyaId,
      start_date: d(2),
      end_date: d(4),
      progress: 20,
    },
    // First batch
    {
      title: 'Select contract manufacturer and sign production agreement',
      description:
        'Shortlist 3 CM partners, conduct factory audits (virtual or in person), and sign a contract for the first 100-unit run.',
      objective_id: batchObjId,
      status: 'Not Started',
      assignee_id: freyaId,
      start_date: d(5),
      end_date: d(6),
      progress: 0,
    },
    {
      title: 'Define QC checklist for printer acceptance testing',
      description:
        'Write a formal QC checklist covering print resolution, Z-axis calibration, UV uniformity, and safety checks for each unit.',
      objective_id: batchObjId,
      status: 'Pending',
      assignee_id: marcusId ?? freyaId,
      start_date: d(4),
      end_date: d(5),
      progress: 0,
    },
    // Subscription
    {
      title: 'Define subscription tier structure and pricing',
      description:
        'Map out 3 tiers (Hobbyist 500ml/mo, Studio 1L/mo, Pro 2L/mo), set pricing, and validate margins against COGS.',
      objective_id: subscriptionObjId,
      status: 'Pending',
      assignee_id: freyaId,
      start_date: d(3),
      end_date: d(4),
      progress: 30,
    },
    {
      title: 'Integrate Stripe subscription billing into storefront',
      description:
        'Add recurring billing support to the Shopify storefront using Stripe Billing, with upgrade/downgrade and pause flows.',
      objective_id: subscriptionObjId,
      status: 'Not Started',
      assignee_id: marcusId ?? freyaId,
      start_date: d(5),
      end_date: d(6),
      progress: 0,
    },
    // STL Marketplace
    {
      title: 'Research competitor STL marketplaces (MyMiniFactory, Cults3D, Printables)',
      description:
        'Conduct a competitive analysis of existing STL platforms — commission structures, designer experience, discovery features.',
      objective_id: marketplaceObjId,
      status: 'Accepted',
      assignee_id: islaId ?? freyaId,
      start_date: d(0),
      end_date: d(1),
      progress: 80,
    },
    {
      title: 'Recruit 20 founding designer partners for STL marketplace launch',
      description:
        'Identify and on-board 20 well-known miniature designers to populate the marketplace at launch with premium content.',
      objective_id: marketplaceObjId,
      status: 'Pending',
      assignee_id: freyaId,
      start_date: d(4),
      end_date: d(7),
      progress: 5,
    },
    // Discord
    {
      title: 'Set up Discord server with channels, roles, and moderation bots',
      description:
        'Create the server structure: welcome, announcements, print-help, gallery, off-topic, events. Add Carl-bot for moderation.',
      objective_id: discordObjId,
      status: 'Accepted',
      assignee_id: islaId ?? freyaId,
      start_date: d(0),
      end_date: d(0, 14),
      progress: 90,
    },
    {
      title: 'Run first community "print challenge" event',
      description:
        'Organise a themed monthly print challenge (theme: undead miniatures) with prizes to drive engagement and user-generated content.',
      objective_id: discordObjId,
      status: 'Pending',
      assignee_id: islaId ?? freyaId,
      start_date: d(1),
      end_date: d(2),
      progress: 0,
    },
    {
      title: 'Publish 4 tutorials on YouTube: "First Print with ForgePrint Pro"',
      description:
        'Script, record, and publish a beginner tutorial series covering unboxing, calibration, slicing in MiniSlice Pro, and first print.',
      objective_id: discordObjId,
      status: 'Pending',
      assignee_id: islaId ?? freyaId,
      start_date: d(1),
      end_date: d(3),
      progress: 10,
    },
    // Conventions
    {
      title: 'Book booth space at UK Games Expo 2026',
      description:
        'Apply for and secure a 3x3m trade stand at UKGE Birmingham. Confirm logistics, power, and furniture requirements.',
      objective_id: conventionsObjId,
      status: 'Pending',
      assignee_id: freyaId,
      start_date: d(1),
      end_date: d(2),
      progress: 40,
    },
    {
      title: 'Design and print exhibition banner and stand graphics',
      description:
        'Brief designer on stand visuals, review and approve artwork, and arrange print/delivery before UKGE.',
      objective_id: conventionsObjId,
      status: 'Not Started',
      assignee_id: islaId ?? freyaId,
      start_date: d(3),
      end_date: d(4),
      progress: 0,
    },
    // GW Partnership
    {
      title: 'Draft partnership proposal for Games Workshop licensing',
      description:
        'Create a formal licensing proposal deck: business case, community reach data, proposed print profile scope, and revenue share model.',
      objective_id: gwPartnershipObjId,
      status: 'Pending',
      assignee_id: freyaId,
      start_date: d(1),
      end_date: d(2),
      progress: 20,
    },
    {
      title: 'Identify and contact GW licensing department contact',
      description:
        'Research the correct GW licensing team contact, draft intro email, and request an initial call.',
      objective_id: gwPartnershipObjId,
      status: 'Accepted',
      assignee_id: freyaId,
      start_date: d(1),
      end_date: d(1, 21),
      progress: 50,
    },
    // Resin formula
    {
      title: 'Procure resin base materials from 3 chemical suppliers',
      description:
        'Order sample quantities of oligomers, monomers, and photoinitiators from 3 shortlisted chemical suppliers for lab testing.',
      objective_id: resinObjId,
      status: 'Accepted',
      assignee_id: marcusId ?? freyaId,
      start_date: d(0),
      end_date: d(0, 14),
      progress: 100,
    },
    {
      title: 'Run toxicology safety assessment on candidate resin formulations',
      description:
        'Commission a COSHH assessment and SDS documentation for the top 3 candidate formulations ahead of UK consumer product approval.',
      objective_id: resinObjId,
      status: 'In Progress',
      assignee_id: marcusId ?? freyaId,
      start_date: d(0),
      end_date: d(2),
      progress: 40,
    },
    {
      title: 'Print and evaluate 100-miniature test batch with ForgeFlex v3 resin',
      description:
        'Use the v3 resin formula to print 100 miniatures across 10 popular designs. Evaluate for detail, warp, and cure consistency.',
      objective_id: resinObjId,
      status: 'Pending',
      assignee_id: marcusId ?? freyaId,
      start_date: d(2),
      end_date: d(3),
      progress: 0,
    },
    // Print profiles
    {
      title: 'Create print profile template and testing protocol',
      description:
        'Define the standard profile parameters (layer time, lift speed, rest time) and the test print checklist all new profiles must pass.',
      objective_id: printProfilesObjId,
      status: 'Accepted',
      assignee_id: marcusId ?? freyaId,
      start_date: d(0),
      end_date: d(1),
      progress: 85,
    },
    {
      title: 'Publish first 10 community-tested print profiles',
      description:
        'Complete, validate, and publish optimised profiles for Warhammer 40K, Age of Sigmar, D&D Nolzur\'s, and 7 other popular ranges.',
      objective_id: printProfilesObjId,
      status: 'In Progress',
      assignee_id: marcusId ?? freyaId,
      start_date: d(1),
      end_date: d(2),
      progress: 50,
    },
    {
      title: 'Recruit 10 beta testers from community to validate print profiles',
      description:
        'Identify experienced hobbyists in the Discord community willing to test and give detailed feedback on pre-release print profiles.',
      objective_id: printProfilesObjId,
      status: 'Pending',
      assignee_id: islaId ?? freyaId,
      start_date: d(1),
      end_date: d(2),
      progress: 20,
    },
  ]

  // Check if tasks already exist for this foundry to avoid duplicates
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
        status: t.status === 'In Progress' ? 'Accepted' : t.status === 'Not Started' ? 'Pending' : t.status,
        foundry_id: FOUNDRY_ID,
        creator_id: freyaId,
        task_number: i + 1,
        created_at: new Date().toISOString(),
      }))
    )

    if (taskError) {
      console.error(`   ❌ Tasks failed: ${taskError.message}`)
    } else {
      console.log(`   ✅ ${tasks.length} tasks created`)
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n🎉 Freya Miniatures Ltd seed complete!\n')
  console.log('━'.repeat(60))
  console.log('📧 Freya\'s login credentials:')
  console.log('   Email:    freya.jane.foster@gmail.com')
  console.log('   Password: FreyaMinis2026!')
  console.log('━'.repeat(60))
  console.log('\n📧 Team accounts (same password: FreyaMinis2026!):')
  console.log('   marcus.chen@freyaminiatures.com')
  console.log('   isla.thornton@freyaminiatures.com')
  console.log('━'.repeat(60))
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
