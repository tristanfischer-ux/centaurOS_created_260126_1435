/**
 * @file seed-perigee-labs.ts
 *
 * @description Seeds a complete demo company — Perigee Labs Ltd — for finance tab testing.
 *
 * Company profile:
 * - CubeSat startup (3U science payloads, Falcon 9 rideshare, parachute deorbit/recovery)
 * - 12 months old (Feb 2025 – Feb 2026), based in Bristol, UK
 * - 7 team members, pre-seed funded, seed round in progress
 * - Full 12-month financial history across all finance tables
 *
 * @usage npx tsx scripts/seed-perigee-labs.ts
 * Idempotent: safe to run multiple times.
 *
 * Login: elena.vasquez@perigee-labs.com / PerigeeSpace2025!
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v5 as uuidv5 } from 'uuid'

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

const FOUNDRY_ID = 'perigee-labs'
const PASSWORD = 'PerigeeSpace2025!'
const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function uid(seed: string): string {
  return uuidv5(`perigee-${seed}`, SEED_NAMESPACE)
}

const FOUNDED = new Date('2025-02-01')

function monthDate(monthsAfterFounding: number, day = 1): string {
  const d = new Date(FOUNDED)
  d.setMonth(d.getMonth() + monthsAfterFounding)
  d.setDate(day)
  return d.toISOString().split('T')[0]
}

function monthTs(monthsAfterFounding: number, day = 1): string {
  return new Date(monthDate(monthsAfterFounding, day)).toISOString()
}

// ─── Team ─────────────────────────────────────────────────────────────────────

const ACCOUNTS = [
  {
    email: 'elena.vasquez@perigee-labs.com',
    fullName: 'Dr. Elena Vasquez',
    role: 'Founder' as const,
    headline: 'CEO & Founder at Perigee Labs',
    bio: 'Aerospace engineer turned founder. 8 years at ESA (ESTEC) working on small satellite systems before leaving to commercialise recoverable CubeSat technology. PhD in Spacecraft Engineering from TU Delft. Holds 4 patents in deorbit propulsion.',
  },
  {
    email: 'marcus.chen@perigee-labs.com',
    fullName: 'Dr. Marcus Chen',
    role: 'Executive' as const,
    headline: 'CTO at Perigee Labs',
    bio: 'Systems architect with 10 years in smallsat development. Former lead engineer at Surrey Satellite Technology (SSTL). Expert in attitude control systems, power budgets, and CubeSat structural design. Co-inventor of Perigee\'s deorbit propulsion unit.',
  },
  {
    email: 'priya.patel@perigee-labs.com',
    fullName: 'Dr. Priya Patel',
    role: 'Executive' as const,
    headline: 'Head of Science at Perigee Labs',
    bio: 'Microbiologist and payload specialist. Spent 6 years at the UK Centre for Astrobiology designing experiment modules for the ISS. Leads all customer experiment integration and scientific mission design at Perigee.',
  },
  {
    email: 'jake.morrison@perigee-labs.com',
    fullName: 'Jake Morrison',
    role: 'Apprentice' as const,
    headline: 'Systems Engineer at Perigee Labs',
    bio: 'MEng Aerospace Engineering from Bristol University. Joined Perigee at founding as first hire. Manages structural analysis, thermal modelling, and integration testing for all CubeSat builds.',
  },
  {
    email: 'aisha.okonkwo@perigee-labs.com',
    fullName: 'Aisha Okonkwo',
    role: 'Apprentice' as const,
    headline: 'Software Engineer at Perigee Labs',
    bio: 'Computer Science graduate from Imperial College London. Develops onboard flight software, ground station communication protocols, and the customer experiment telemetry dashboard.',
  },
  {
    email: 'tom.riley@perigee-labs.com',
    fullName: 'Tom Riley',
    role: 'Apprentice' as const,
    headline: 'Business Development at Perigee Labs',
    bio: 'Former SpaceWorks account manager with 5 years in launch services sales. Manages the UniSpace rideshare programme partnerships and university customer pipeline. Closed the ESA BioCube contract.',
  },
  {
    email: 'sarah.goldstein@perigee-labs.com',
    fullName: 'Sarah Goldstein',
    role: 'Apprentice' as const,
    headline: 'Finance & Operations at Perigee Labs',
    bio: 'ACA-qualified accountant with a background in deep tech startups. Previously at Seedcamp portfolio companies. Manages grant reporting, company finances, and ops at Perigee.',
  },
]

// ─── Auth helpers ─────────────────────────────────────────────────────────────

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
    user_metadata: { full_name: fullName, is_demo_account: true },
  })

  if (error) {
    if (error.message.includes('already been registered')) {
      const tempClient = createClient(supabaseUrl!, supabaseKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: signInData } = await tempClient.auth.signInWithPassword({ email, password })
      if (signInData?.user) return signInData.user.id
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
  if (error) console.error(`   Profile upsert failed for ${fullName}: ${error.message}`)
}

// ─── Seed functions ────────────────────────────────────────────────────────────

async function seedFounder(): Promise<string | null> {
  console.log('\n[1/13] Seeding founder...')
  const account = ACCOUNTS[0]

  const founderId = await getOrCreateAuthUser(account.email, PASSWORD, account.fullName)
  if (!founderId) return null

  // Bootstrap with temp foundry to satisfy FK constraint
  const { error: bootstrapError } = await supabase.from('profiles').upsert({
    id: founderId,
    email: account.email,
    full_name: account.fullName,
    role: account.role,
    foundry_id: 'forge-guild',
    active_foundry_id: 'forge-guild',
    account_type: 'team_builder',
    updated_at: new Date().toISOString(),
  })
  if (bootstrapError && !bootstrapError.message.includes('duplicate')) {
    console.warn(`   Bootstrap profile warning: ${bootstrapError.message}`)
  }

  return founderId
}

async function seedFoundry(ownerId: string): Promise<void> {
  console.log('\n[2/13] Seeding foundry...')

  const { error } = await supabase.from('foundries').upsert({
    id: FOUNDRY_ID,
    name: 'Perigee Labs Ltd',
    slug: FOUNDRY_ID,
    industry: 'Space Technology',
    sector: 'aerospace',
    stage: 'Pre-Seed',
    owner_id: ownerId,
    company_profile: {
      employee_count: '1-10',
      revenue_range: 'Pre-revenue',
      funding_status: 'pre_seed',
      seeking_funding: true,
      founded_year: 2025,
      location: 'Bristol, United Kingdom',
      website: 'https://perigeelabs.com',
      business_model: 'hardware_services',
      competitors: ['Open Cosmos', 'NanoAvionics', 'Spire Global', 'Planet Labs'],
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },
    purpose_data: {
      purpose: 'To democratise access to orbital science by delivering recoverable CubeSat missions at a fraction of traditional costs.',
      mission: 'Build the world\'s first commercially reusable CubeSat platform — launch, experiment, recover, repeat.',
      vision: 'A future where any university, research institute, or company can run an orbital experiment for under £50,000.',
      questionnaire: {
        why: 'Science that can only be done in microgravity has been gated behind billion-pound government missions. We\'re tearing down that gate.',
        how: 'By combining rideshare launch economics with a novel parachute recovery system, we can offer 10x cheaper repeatable access to LEO.',
        what: 'Science-grade 3U CubeSats that fly on Falcon 9 Transporter missions, spend 6 months in orbit running customer experiments, then deorbit and land within 2km of the customer\'s GPS coordinates.',
        impact: 'Accelerating life sciences, materials science, and atmospheric research by orders of magnitude.',
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
    },
  })

  if (error) console.error(`   Foundry upsert failed: ${error.message}`)
  else console.log(`   Foundry '${FOUNDRY_ID}' upserted`)
}

async function updateFounderProfile(
  founderId: string,
  account: typeof ACCOUNTS[0]
): Promise<void> {
  console.log('\n[3/13] Updating founder profile...')
  await upsertProfile(founderId, account.email, account.fullName, account.role, account.headline, account.bio)

  const { error } = await supabase.from('foundry_memberships').upsert({
    foundry_id: FOUNDRY_ID,
    user_id: founderId,
    role: 'Founder',
    is_primary: true,
    joined_at: FOUNDED.toISOString(),
  }, { onConflict: 'foundry_id,user_id' })
  if (error) console.warn(`   Founder membership warning: ${error.message}`)
  else console.log(`   Founder profile + membership updated`)
}

async function seedTeamMembers(founderId: string): Promise<void> {
  console.log('\n[4/13] Seeding team members...')

  const joinDates = [
    monthTs(0), monthTs(0), monthTs(1),
    monthTs(2), monthTs(4), monthTs(7),
  ]

  const teamAccounts = ACCOUNTS.slice(1)

  for (let i = 0; i < teamAccounts.length; i++) {
    const account = teamAccounts[i]
    console.log(`   Creating ${account.fullName}...`)

    const userId = await getOrCreateAuthUser(account.email, PASSWORD, account.fullName)
    if (!userId) continue

    await upsertProfile(userId, account.email, account.fullName, account.role, account.headline, account.bio)

    const { error } = await supabase.from('foundry_memberships').upsert({
      foundry_id: FOUNDRY_ID,
      user_id: userId,
      role: account.role,
      invited_by: founderId,
      is_primary: true,
      joined_at: joinDates[i],
    }, { onConflict: 'foundry_id,user_id' })
    if (error) console.warn(`   Membership warning for ${account.fullName}: ${error.message}`)
  }

  console.log(`   ${teamAccounts.length} team members seeded`)
}

async function seedAccountBalance(founderId: string): Promise<void> {
  console.log('\n[5/13] Seeding account balance...')

  // £185,000 — ~2.4 months runway at current burn, driving urgency for seed round
  const { error } = await supabase.from('account_balances').upsert({
    user_id: founderId,
    balance_amount: 18500000, // pence
    currency: 'GBP',
    last_topped_up_at: monthTs(10, 20),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) console.error(`   Account balance failed: ${error.message}`)
  else console.log(`   Account balance set to £185,000`)
}

async function seedBalanceTransactions(founderId: string): Promise<void> {
  console.log('\n[6/13] Seeding balance transactions...')

  const { count } = await supabase
    .from('balance_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', founderId)

  if ((count ?? 0) > 0) {
    console.log(`   Balance transactions already seeded (${count} found), skipping`)
    return
  }

  // Running balance: start 0, end 18,500,000 (£185k) — matches account_balances
  // balance_before/after computed as a consistent sequence
  const transactions = [
    { user_id: founderId, transaction_type: 'top_up',    amount:  75000000, balance_before:         0, balance_after: 75000000, description: 'Bristol Angels Syndicate — Pre-seed investment (£750k for 10% equity)',                       created_at: monthTs(0,  3) },
    { user_id: founderId, transaction_type: 'top_up',    amount:  12000000, balance_before:  75000000, balance_after: 87000000, description: 'ESA BIC UK grant (£75k) + UKRI Innovate UK contract advance (£45k)',                         created_at: monthTs(2, 20) },
    { user_id: founderId, transaction_type: 'spend',     amount: -22000000, balance_before:  87000000, balance_after: 65000000, description: 'Q1-Q2 2025 operations: payroll (5 FTE × 4 months), lab, insurance, legal setup',             created_at: monthTs(3, 28) },
    { user_id: founderId, transaction_type: 'top_up',    amount:  11800000, balance_before:  65000000, balance_after: 76800000, description: 'ESA BioCube 50% advance (£90k) + Oxford University INV-2025-00001 (£28k)',                   created_at: monthTs(5, 20) },
    { user_id: founderId, transaction_type: 'spend',     amount:  -4700000, balance_before:  76800000, balance_after: 72100000, description: 'SpaceX Transporter-14 rideshare slot (£22k) + SSTL acceptance testing (£25k)',               created_at: monthTs(3, 18) },
    { user_id: founderId, transaction_type: 'spend',     amount: -30000000, balance_before:  72100000, balance_after: 42100000, description: 'Q2-Q3 2025 operations: payroll (6-7 FTE × 5 months), lab, components, travel',              created_at: monthTs(7, 31) },
    { user_id: founderId, transaction_type: 'top_up',    amount:   3450000, balance_before:  42100000, balance_after: 45550000, description: 'Edinburgh INV-2025-00002 (£22.5k) + Surrey Space Centre INV-2025-00004 (£12k)',              created_at: monthTs(9, 14) },
    { user_id: founderId, transaction_type: 'spend',     amount:  -5800000, balance_before:  45550000, balance_after: 39750000, description: 'SpaceX Transporter-16 BioCube slot (£26k) + ESA ESTEC integration week (£32k)',             created_at: monthTs(8, 25) },
    { user_id: founderId, transaction_type: 'top_up',    amount:   4500000, balance_before:  39750000, balance_after: 44250000, description: 'ESA BioCube milestone 2 — LEO operations sign-off payment',                                  created_at: monthTs(10, 20) },
    { user_id: founderId, transaction_type: 'spend',     amount: -25750000, balance_before:  44250000, balance_after: 18500000, description: 'Q4 2025 + Q1 2026 ops: payroll (7 FTE × 3 months), MK2 components, IP filings, investor prep', created_at: monthTs(12,  1) },
  ]

  const { error } = await supabase.from('balance_transactions').insert(transactions)
  if (error) console.error(`   Balance transactions failed: ${error.message}`)
  else console.log(`   ${transactions.length} balance transactions seeded`)
}

async function seedMoneyMapCosts(): Promise<void> {
  console.log('\n[7/13] Seeding Money Map cost items...')

  const { count } = await supabase
    .from('money_map_cost_items')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) > 0) {
    console.log(`   Money Map cost items already seeded (${count} found), skipping`)
    return
  }

  // cost_type valid values: 'direct' | 'indirect' | 'overhead'
  // Amounts in pounds (money_map convention — multiplied by 100 on dashboard)
  const costItems = [
    { foundry_id: FOUNDRY_ID, name: 'Engineering salaries (5 FTE)',         category: 'personnel',      amount: 42000, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'Monthly payroll: CTO, Head of Science, Systems Eng, Software Eng, Biz Dev', sort_order: 1 },
    { foundry_id: FOUNDRY_ID, name: 'Founder salary (CEO)',                  category: 'personnel',      amount:  9000, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'CEO reduced salary — compensated with founder equity',                     sort_order: 2 },
    { foundry_id: FOUNDRY_ID, name: 'Employer NI + pension contributions',   category: 'personnel',      amount:  7200, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'Employer NI + 5% pension auto-enrolment on top of salaries',             sort_order: 3 },
    { foundry_id: FOUNDRY_ID, name: 'Basecamp Bristol — lab + office',       category: 'infrastructure', amount:  8500, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'Innovation Centre workspace, cleanroom bench access, 4 desks',           sort_order: 4 },
    { foundry_id: FOUNDRY_ID, name: 'AWS + ground station cloud',            category: 'infrastructure', amount:  2200, currency: 'GBP', period: 'monthly',   cost_type: 'direct',   source: 'manual', description: 'AWS EC2/S3, AWS Ground Station SDK, telemetry processing pipeline',     sort_order: 5 },
    { foundry_id: FOUNDRY_ID, name: 'Engineering software licences',         category: 'infrastructure', amount:  1800, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'ANSYS Mechanical, SolidWorks PDM, MATLAB/Simulink, STK',                sort_order: 6 },
    { foundry_id: FOUNDRY_ID, name: 'Insurance (D&O, product liability)',    category: 'operations',     amount:  3600, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'D&O, product liability, professional indemnity — annual premium spread', sort_order: 7 },
    { foundry_id: FOUNDRY_ID, name: 'Legal & export compliance',             category: 'operations',     amount:  2500, currency: 'GBP', period: 'monthly',   cost_type: 'indirect', source: 'manual', description: 'IP filings, ITAR/EAR export control compliance, contract review',       sort_order: 8 },
    { foundry_id: FOUNDRY_ID, name: 'Accounting & finance',                  category: 'operations',     amount:  1200, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'External accountant, bookkeeping, VAT returns',                         sort_order: 9 },
    { foundry_id: FOUNDRY_ID, name: 'Conferences & trade shows',             category: 'marketing',      amount: 12000, currency: 'GBP', period: 'quarterly', cost_type: 'indirect', source: 'manual', description: 'SmallSat, Space Symposium, IAC — stand + travel per quarter',          sort_order: 10 },
    { foundry_id: FOUNDRY_ID, name: 'Website & marketing materials',         category: 'marketing',      amount:   800, currency: 'GBP', period: 'monthly',   cost_type: 'overhead', source: 'manual', description: 'Webflow, Figma, LinkedIn ads, PR agency retainer',                       sort_order: 11 },
    { foundry_id: FOUNDRY_ID, name: 'CubeSat components & PCBs',             category: 'other',          amount: 18000, currency: 'GBP', period: 'monthly',   cost_type: 'direct',   source: 'manual', description: 'EPS modules, OBC, ADCS units, comms boards, chassis — rolling procurement', sort_order: 12 },
    { foundry_id: FOUNDRY_ID, name: 'Parachute recovery system parts',       category: 'other',          amount:  4500, currency: 'GBP', period: 'monthly',   cost_type: 'direct',   source: 'manual', description: 'Drogue & main parachutes, GPS beacon, RF transmitter, heat shield',     sort_order: 13 },
  ]

  // @ts-ignore — enum casting in seed scripts
  const { error } = await supabase.from('money_map_cost_items').insert(costItems)
  if (error) console.error(`   Money Map cost items failed: ${error.message}`)
  else console.log(`   ${costItems.length} cost items seeded`)
}

async function seedMoneyMapRevenue(): Promise<void> {
  console.log('\n[8/13] Seeding Money Map revenue streams...')

  const { count } = await supabase
    .from('money_map_revenue_streams')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) > 0) {
    console.log(`   Revenue streams already seeded (${count} found), skipping`)
    return
  }

  // category valid values: 'product' | 'service' | 'marketplace' | 'subscription' | 'other'
  const revenueStreams = [
    { foundry_id: FOUNDRY_ID, name: 'ESA BioCube — ops retainer',       category: 'service',  amount: 15000, currency: 'GBP', period: 'monthly',   source: 'manual', description: 'Monthly retainer for LEO operations & telemetry delivery to ESA science team', sort_order: 1 },
    { foundry_id: FOUNDRY_ID, name: 'UniSpace rideshare programme',      category: 'service',  amount:  8000, currency: 'GBP', period: 'monthly',   source: 'manual', description: '2 university experiment subscriptions (Oxford + Edinburgh), recurring',        sort_order: 2 },
    { foundry_id: FOUNDRY_ID, name: 'UKRI research grant disbursements', category: 'other',    amount: 45000, currency: 'GBP', period: 'quarterly', source: 'manual', description: 'Quarterly disbursements from UKRI Innovate UK research contract',             sort_order: 3 },
  ]

  const { error } = await supabase.from('money_map_revenue_streams').insert(revenueStreams)
  if (error) console.error(`   Revenue streams failed: ${error.message}`)
  else console.log(`   ${revenueStreams.length} revenue streams seeded`)
}

async function seedBudgets(founderId: string): Promise<void> {
  console.log('\n[9/13] Seeding finance budgets...')

  const { count } = await supabase
    .from('finance_budgets')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) > 0) {
    console.log(`   Budgets already seeded (${count} found), skipping`)
    return
  }

  // Amounts in pence, period = annual
  const budgets = [
    { foundry_id: FOUNDRY_ID, created_by: founderId, name: 'Personnel & Salaries FY2025-26',      category: 'personnel',      period: 'annual', amount: 180000000, currency: 'GBP', start_date: '2025-02-01', end_date: '2026-01-31', is_active: true },
    { foundry_id: FOUNDRY_ID, created_by: founderId, name: 'Hardware & Components FY2025-26',      category: 'materials',      period: 'annual', amount:  42000000, currency: 'GBP', start_date: '2025-02-01', end_date: '2026-01-31', is_active: true },
    { foundry_id: FOUNDRY_ID, created_by: founderId, name: 'Operations & Compliance FY2025-26',    category: 'operations',     period: 'annual', amount:  18000000, currency: 'GBP', start_date: '2025-02-01', end_date: '2026-01-31', is_active: true },
    { foundry_id: FOUNDRY_ID, created_by: founderId, name: 'Infrastructure & Cloud FY2025-26',     category: 'infrastructure', period: 'annual', amount:   6000000, currency: 'GBP', start_date: '2025-02-01', end_date: '2026-01-31', is_active: true },
    { foundry_id: FOUNDRY_ID, created_by: founderId, name: 'Marketing & BD FY2025-26',             category: 'marketing',      period: 'annual', amount:   8000000, currency: 'GBP', start_date: '2025-02-01', end_date: '2026-01-31', is_active: true },
    { foundry_id: FOUNDRY_ID, created_by: founderId, name: 'Launch & Integration (2 missions)',    category: 'other',          period: 'annual', amount:  12000000, currency: 'GBP', start_date: '2025-02-01', end_date: '2026-01-31', is_active: true },
  ]

  const { error } = await supabase.from('finance_budgets').insert(budgets)
  if (error) console.error(`   Finance budgets failed: ${error.message}`)
  else console.log(`   ${budgets.length} budgets seeded`)
}

async function seedExpenses(founderId: string): Promise<void> {
  console.log('\n[10/13] Seeding finance expenses...')

  const { count } = await supabase
    .from('finance_expenses')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) > 0) {
    console.log(`   Expenses already seeded (${count} found), skipping`)
    return
  }

  // All amounts in pence
  const expenses = [
    // ── February 2025 (Month 0) ────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'operations',     description: 'Roper & Co — company incorporation, articles, shareholder agreement',               vendor: 'Roper & Co Solicitors',          expense_date: monthDate(0, 3),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  2700000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Feb 2025 (3 FTE: CEO, CTO, Head of Science)',                            vendor: 'BACS Payroll',                   expense_date: monthDate(0, 28), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   320000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — first month lab space + deposit',                              vendor: 'Basecamp Bristol',               expense_date: monthDate(0, 1),  status: 'paid' },
    // ── March 2025 (Month 1) ────────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  3600000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Mar 2025 (4 FTE, Jake Morrison joins)',                                   vendor: 'BACS Payroll',                   expense_date: monthDate(1, 31), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — March lab rental',                                              vendor: 'Basecamp Bristol',               expense_date: monthDate(1, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   220000, currency: 'GBP', category: 'infrastructure', description: 'AWS — cloud infrastructure setup + Ground Station SDK',                           vendor: 'Amazon Web Services',            expense_date: monthDate(1, 15), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   180000, currency: 'GBP', category: 'infrastructure', description: 'SolidWorks + MATLAB licences — annual',                                           vendor: 'Dassault Systèmes / MathWorks',  expense_date: monthDate(1, 10), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   450000, currency: 'GBP', category: 'operations',     description: 'Aon — D&O and product liability insurance (annual premium)',                        vendor: 'Aon plc',                        expense_date: monthDate(1, 5),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  1800000, currency: 'GBP', category: 'materials',      description: 'GomSpace NanoPower — EPS modules × 2 for MK1 prototype',                          vendor: 'GomSpace A/S',                   expense_date: monthDate(1, 20), status: 'paid' },
    // ── April 2025 (Month 2) ────────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  4500000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Apr 2025 (5 FTE, Aisha Okonkwo joins)',                                   vendor: 'BACS Payroll',                   expense_date: monthDate(2, 30), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — April lab rental',                                              vendor: 'Basecamp Bristol',               expense_date: monthDate(2, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  2400000, currency: 'GBP', category: 'materials',      description: 'ISIS iOBC — on-board computer units × 2 (MK1 + spare)',                           vendor: 'Innovative Solutions In Space',  expense_date: monthDate(2, 12), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   320000, currency: 'GBP', category: 'operations',     description: 'ITAR/EAR export control legal review — Q1',                                        vendor: 'Steptoe & Johnson LLP',          expense_date: monthDate(2, 8),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   120000, currency: 'GBP', category: 'marketing',      description: 'SmallSat conference registrations × 3',                                            vendor: 'AIAA',                           expense_date: monthDate(2, 15), status: 'paid' },
    // ── May 2025 (Month 3) ──────────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  4800000, currency: 'GBP', category: 'personnel',      description: 'Payroll — May 2025 (5 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(3, 31), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — May lab rental',                                                vendor: 'Basecamp Bristol',               expense_date: monthDate(3, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  2200000, currency: 'GBP', category: 'travel',         description: 'SpaceX launch site visit — Cape Canaveral. 4 staff × flights + hotel',             vendor: 'Mixed',                          expense_date: monthDate(3, 19), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  2199000, currency: 'GBP', category: 'materials',      description: 'SpaceX Transporter-14 rideshare slot — 3U CubeSat (4kg)',                          vendor: 'SpaceX Inc.',                    expense_date: monthDate(3, 10), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  2500000, currency: 'GBP', category: 'materials',      description: 'SSTL integration & acceptance testing — MK1 CubeSat',                              vendor: 'Surrey Satellite Technology',    expense_date: monthDate(3, 18), status: 'paid' },
    // ── June 2025 (Month 4) ──────────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  5400000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Jun 2025 (6 FTE, Tom Riley joins)',                                       vendor: 'BACS Payroll',                   expense_date: monthDate(4, 30), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — June lab rental',                                               vendor: 'Basecamp Bristol',               expense_date: monthDate(4, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   360000, currency: 'GBP', category: 'materials',      description: 'Parachute canopy systems × 3 (drogue + main) — prototype batch',                  vendor: 'Airborne Systems Ltd',           expense_date: monthDate(4, 14), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   180000, currency: 'GBP', category: 'operations',     description: 'UK Space Agency licence application — orbital operations',                          vendor: 'UK Space Agency',                expense_date: monthDate(4, 5),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   220000, currency: 'GBP', category: 'infrastructure', description: 'AWS — June compute (ground station + telemetry pipeline)',                         vendor: 'Amazon Web Services',            expense_date: monthDate(4, 30), status: 'paid' },
    // ── July 2025 (Month 5) ──────────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  5400000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Jul 2025 (6 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(5, 31), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — July lab rental',                                               vendor: 'Basecamp Bristol',               expense_date: monthDate(5, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  1200000, currency: 'GBP', category: 'materials',      description: 'Honeywell MIMU — miniature IMU units × 2 for ADCS',                               vendor: 'Honeywell Aerospace',            expense_date: monthDate(5, 8),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   680000, currency: 'GBP', category: 'travel',         description: 'IAC 2025 — Milan. Elena + Tom. Conference fees + travel',                          vendor: 'Mixed',                          expense_date: monthDate(5, 15), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   380000, currency: 'GBP', category: 'marketing',      description: 'IAC booth design + printed materials + banner stand',                              vendor: 'SpaceDesign Studio',             expense_date: monthDate(5, 12), status: 'paid' },
    // ── August 2025 (Month 6) ────────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  5400000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Aug 2025 (6 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(6, 31), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — August lab rental',                                             vendor: 'Basecamp Bristol',               expense_date: monthDate(6, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   980000, currency: 'GBP', category: 'materials',      description: 'Clydespace ADCS module — precision attitude control × 1',                         vendor: 'Clydespace Ltd',                 expense_date: monthDate(6, 10), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   250000, currency: 'GBP', category: 'operations',     description: 'Haseltine Lake — provisional patent filing (deorbit propulsion system)',           vendor: 'Haseltine Lake Kempner',         expense_date: monthDate(6, 22), status: 'paid' },
    // ── September 2025 (Month 7) ─────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  6300000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Sep 2025 (7 FTE, Sarah Goldstein joins)',                                 vendor: 'BACS Payroll',                   expense_date: monthDate(7, 30), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — September lab rental',                                          vendor: 'Basecamp Bristol',               expense_date: monthDate(7, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  1600000, currency: 'GBP', category: 'materials',      description: 'PCB prototyping run — telemetry board + power management v2',                     vendor: 'Eurocircuits',                   expense_date: monthDate(7, 14), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   360000, currency: 'GBP', category: 'operations',     description: 'KPMG — R&D tax credit claim preparation (FY2025)',                                  vendor: 'KPMG LLP',                       expense_date: monthDate(7, 20), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:    95000, currency: 'GBP', category: 'marketing',      description: 'LinkedIn campaign — engineering talent acquisition',                                vendor: 'LinkedIn Ireland',               expense_date: monthDate(7, 5),  status: 'paid' },
    // ── October 2025 (Month 8) ───────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  6300000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Oct 2025 (7 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(8, 31), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — October lab rental',                                            vendor: 'Basecamp Bristol',               expense_date: monthDate(8, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  2599000, currency: 'GBP', category: 'materials',      description: 'SpaceX Transporter-16 rideshare slot — ESA BioCube (3.8kg)',                      vendor: 'SpaceX Inc.',                    expense_date: monthDate(8, 5),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  3200000, currency: 'GBP', category: 'travel',         description: 'ESA ESTEC (Noordwijk) — BioCube integration week, 4 engineers',                   vendor: 'Mixed',                          expense_date: monthDate(8, 22), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   450000, currency: 'GBP', category: 'materials',      description: 'Cleanroom experiment containment modules × 4',                                     vendor: 'Precision NanoSystems',          expense_date: monthDate(8, 16), status: 'paid' },
    // ── November 2025 (Month 9) ──────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  6300000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Nov 2025 (7 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(9, 30), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — November lab rental',                                           vendor: 'Basecamp Bristol',               expense_date: monthDate(9, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   280000, currency: 'GBP', category: 'infrastructure', description: 'AWS Ground Station — Q3 satellite contact hours (TLF-1 mission)',                 vendor: 'Amazon Web Services',            expense_date: monthDate(9, 30), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   420000, currency: 'GBP', category: 'operations',     description: 'Seed round legal prep — term sheet review + data room',                            vendor: 'Orrick Herrington',              expense_date: monthDate(9, 18), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   650000, currency: 'GBP', category: 'marketing',      description: 'Space Symposium 2025 — exhibitor package + 2 staff travel',                       vendor: 'Space Foundation',               expense_date: monthDate(9, 12), status: 'paid' },
    // ── December 2025 (Month 10) ─────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  6300000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Dec 2025 (7 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(10, 31), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — December lab rental',                                           vendor: 'Basecamp Bristol',               expense_date: monthDate(10, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  2200000, currency: 'GBP', category: 'materials',      description: 'MK2 CubeSat chassis + solar panels — component build',                            vendor: 'EnduroSat',                      expense_date: monthDate(10, 14), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   180000, currency: 'GBP', category: 'infrastructure', description: 'Annual ANSYS + SolidWorks licence renewal',                                        vendor: 'ANSYS Inc.',                     expense_date: monthDate(10, 2),  status: 'paid' },
    // ── January 2026 (Month 11) ──────────────────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  6300000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Jan 2026 (7 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(11, 31), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — January lab rental',                                            vendor: 'Basecamp Bristol',               expense_date: monthDate(11, 1),  status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  1400000, currency: 'GBP', category: 'materials',      description: 'Recovery system v2 — new parachute & GPS beacon design',                           vendor: 'Airborne Systems Ltd',           expense_date: monthDate(11, 20), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   380000, currency: 'GBP', category: 'operations',     description: 'Innovate UK grant application — professional bid writing',                          vendor: 'Grant Thornton Ltd',             expense_date: monthDate(11, 14), status: 'paid' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   220000, currency: 'GBP', category: 'marketing',      description: 'Pitch deck design + investor materials (Series A prep)',                            vendor: 'The Brandsmen',                  expense_date: monthDate(11, 8),  status: 'approved' },
    // ── February 2026 (Month 12 / current) ──────────────────────────────────────
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:  6300000, currency: 'GBP', category: 'personnel',      description: 'Payroll — Feb 2026 (7 FTE)',                                                        vendor: 'BACS Payroll',                   expense_date: monthDate(12, 28), status: 'pending' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   850000, currency: 'GBP', category: 'infrastructure', description: 'Basecamp Bristol — February lab rental',                                           vendor: 'Basecamp Bristol',               expense_date: monthDate(12, 1),  status: 'pending' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   950000, currency: 'GBP', category: 'materials',      description: 'MK2 PCB prototype run + component procurement batch',                              vendor: 'Eurocircuits / Farnell',         expense_date: monthDate(12, 10), status: 'approved' },
    { foundry_id: FOUNDRY_ID, created_by: founderId, amount:   290000, currency: 'GBP', category: 'travel',         description: 'Seed round investor meetings — London. 2 nights, 2 people',                       vendor: 'Mixed',                          expense_date: monthDate(12, 18), status: 'approved' },
  ]

  // @ts-ignore — enum casting in seed scripts
  const { error } = await supabase.from('finance_expenses').insert(expenses)
  if (error) console.error(`   Finance expenses failed: ${error.message}`)
  else console.log(`   ${expenses.length} expenses seeded`)
}

async function seedProjects(founderId: string): Promise<void> {
  console.log('\n[11/13] Seeding finance projects...')

  const { count } = await supabase
    .from('finance_projects')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) === 0) {
    const projects = [
      { id: uid('project-mk1'),      foundry_id: FOUNDRY_ID, created_by: founderId, name: 'CubeSat MK1 — Development & First Launch',             client_name: null,                          status: 'completed', created_at: monthTs(0) },
      { id: uid('project-biocube'),  foundry_id: FOUNDRY_ID, created_by: founderId, name: 'ESA BioCube — Microbiology Experiment Mission',         client_name: 'European Space Agency (ESA)',  status: 'active',    created_at: monthTs(4) },
      { id: uid('project-unispace'), foundry_id: FOUNDRY_ID, created_by: founderId, name: 'UniSpace Rideshare Programme',                           client_name: 'Multiple UK Universities',     status: 'active',    created_at: monthTs(6) },
    ]
    const { error } = await supabase.from('finance_projects').insert(projects)
    if (error) {
      console.error(`   Finance projects failed: ${error.message}`)
      return
    }
    console.log(`   ${projects.length} projects seeded`)
  } else {
    console.log(`   Projects already seeded (${count} found), skipping`)
  }

  // Check + seed transactions independently
  const { count: txCount } = await supabase
    .from('finance_project_transactions')
    .select('*', { count: 'exact', head: true })
    .in('project_id', [uid('project-mk1'), uid('project-biocube'), uid('project-unispace')])

  if ((txCount ?? 0) > 0) {
    console.log(`   Project transactions already seeded (${txCount} found), skipping`)
    return
  }

  // transaction_type valid values: 'order' | 'retainer_entry' | 'expense' | 'cost_item'
  // is_revenue=true = money in, is_revenue=false = money out
  const transactions = [
    // MK1 — internal R&D, completed
    { project_id: uid('project-mk1'),      transaction_type: 'cost_item',      description: 'CubeSat component procurement (MK1)',                 amount:  8500000, is_revenue: false, created_at: monthTs(1, 20) },
    { project_id: uid('project-mk1'),      transaction_type: 'cost_item',      description: 'SSTL integration & acceptance testing',               amount:  2500000, is_revenue: false, created_at: monthTs(3, 18) },
    { project_id: uid('project-mk1'),      transaction_type: 'expense',        description: 'SpaceX rideshare launch slot',                        amount:  2199000, is_revenue: false, created_at: monthTs(3, 10) },
    { project_id: uid('project-mk1'),      transaction_type: 'expense',        description: 'Cape Canaveral launch site visit (staff travel)',      amount:  2200000, is_revenue: false, created_at: monthTs(3, 19) },
    { project_id: uid('project-mk1'),      transaction_type: 'order',          description: 'UKRI research contract — mission data rights',        amount:  4500000, is_revenue: true,  created_at: monthTs(4, 5)  },
    // BioCube — active
    { project_id: uid('project-biocube'),  transaction_type: 'order',          description: 'ESA contract advance payment (50%)',                  amount:  9000000, is_revenue: true,  created_at: monthTs(5, 12) },
    { project_id: uid('project-biocube'),  transaction_type: 'expense',        description: 'SpaceX Transporter-16 rideshare slot',                amount:  2599000, is_revenue: false, created_at: monthTs(8, 5)  },
    { project_id: uid('project-biocube'),  transaction_type: 'expense',        description: 'ESA ESTEC integration week + travel',                 amount:  3200000, is_revenue: false, created_at: monthTs(8, 22) },
    { project_id: uid('project-biocube'),  transaction_type: 'cost_item',      description: 'Cleanroom experiment containment modules',            amount:   450000, is_revenue: false, created_at: monthTs(8, 16) },
    { project_id: uid('project-biocube'),  transaction_type: 'retainer_entry', description: 'ESA BioCube milestone 2 — LEO operations sign-off', amount:  4500000, is_revenue: true,  created_at: monthTs(10, 20) },
    // UniSpace — growing
    { project_id: uid('project-unispace'), transaction_type: 'order',          description: 'Oxford University — INV-2025-00001 payment',          amount:  2800000, is_revenue: true,  created_at: monthTs(5, 20) },
    { project_id: uid('project-unispace'), transaction_type: 'order',          description: 'Edinburgh University — INV-2025-00002 payment',       amount:  2250000, is_revenue: true,  created_at: monthTs(9, 14) },
    { project_id: uid('project-unispace'), transaction_type: 'order',          description: 'Surrey Space Centre — INV-2025-00004 payment',        amount:  1200000, is_revenue: true,  created_at: monthTs(7, 8)  },
    { project_id: uid('project-unispace'), transaction_type: 'expense',        description: 'Experiment module customisation for university clients', amount: 320000, is_revenue: false, created_at: monthTs(6, 15) },
  ]

  const { error: txError } = await supabase.from('finance_project_transactions').insert(transactions)
  if (txError) console.error(`   Project transactions failed: ${txError.message}`)
  else console.log(`   ${transactions.length} project transactions seeded`)
}

async function seedFunding(founderId: string): Promise<void> {
  console.log('\n[12/13] Seeding funding opportunities...')

  const { count } = await supabase
    .from('finance_funding_opportunities')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) > 0) {
    console.log(`   Funding opportunities already seeded (${count} found), skipping`)
    return
  }

  // Amounts in pence
  const opportunities = [
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      name: 'Bristol Angels Syndicate — Pre-seed', type: 'investment', stage: 'won',
      amount: 75000000, currency: 'GBP', equity_pct: 10, probability_pct: 100,
      funder_name: 'Bristol Angels Syndicate',
      applied_date: monthDate(0, 1), decision_date: monthDate(0, 1),
      notes: 'Pre-seed round led by Bristol Angels. £750k for 10% equity. Funds first 18 months + two Falcon 9 rideshare slots.',
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      name: 'ESA BIC UK Accelerator Grant', type: 'grant', stage: 'won',
      amount: 7500000, currency: 'GBP', equity_pct: null, probability_pct: 100,
      funder_name: 'European Space Agency (ESA)',
      applied_date: monthDate(1, 1), decision_date: monthDate(2, 15),
      notes: 'Non-dilutive grant from ESA\'s Business Incubation Centre UK. Includes mentorship and ESA facility access.',
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      name: 'Innovate UK Smart Grant — Recovery Systems', type: 'grant', stage: 'submitted',
      amount: 25000000, currency: 'GBP', equity_pct: null, probability_pct: 60,
      funder_name: 'Innovate UK',
      deadline: monthDate(10, 15), applied_date: monthDate(11, 14),
      notes: 'Application for MK2 parachute recovery system development. Results expected Q2 2026.',
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      name: 'Orbital Ventures — Seed Round', type: 'investment', stage: 'interview',
      amount: 200000000, currency: 'GBP', equity_pct: 18, probability_pct: 70,
      funder_name: 'Orbital Ventures',
      deadline: monthDate(13, 1), applied_date: monthDate(9, 1),
      notes: 'Seed round: £2M at 18% equity. Led by Orbital Ventures + Seraphim Space. Term sheet expected Feb 2026.',
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      name: 'US DoD SBIR Phase I — Recoverable Platforms', type: 'grant', stage: 'researching',
      amount: 15000000, currency: 'GBP', equity_pct: null, probability_pct: 25,
      funder_name: 'US Department of Defense',
      deadline: monthDate(14, 1),
      notes: 'Exploring SBIR Phase I for recoverable platform technology. Requires ITAR registration. Tom leading eligibility review.',
    },
  ]

  // @ts-ignore — enum casting
  const { error } = await supabase.from('finance_funding_opportunities').insert(opportunities)
  if (error) console.error(`   Funding opportunities failed: ${error.message}`)
  else console.log(`   ${opportunities.length} funding opportunities seeded`)
}

async function seedInvoices(founderId: string): Promise<void> {
  console.log('\n[13/13] Seeding standalone invoices...')

  const { count } = await supabase
    .from('finance_standalone_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) > 0) {
    console.log(`   Invoices already seeded (${count} found), skipping`)
    return
  }

  // All amounts in pence, VAT at 20%
  const invoices = [
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      invoice_number: 'INV-2025-00001',
      recipient_name: 'University of Oxford', recipient_email: 'procurement@ox.ac.uk',
      line_items: [
        { description: 'Microgravity bioreactor experiment — 3U CubeSat payload slot', quantity: 1, unit_price: 2000000, amount: 2000000 },
        { description: 'Telemetry data processing & delivery (6-month mission)',        quantity: 1, unit_price:  333333, amount:  333333 },
      ],
      subtotal: 2333333, vat_amount: 466667, total: 2800000, currency: 'GBP',
      status: 'paid', due_date: monthDate(5, 15), is_recurring: false,
      notes: 'Mission TLF-1. Includes full telemetry dataset and mission report.',
      created_at: monthTs(4, 20),
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      invoice_number: 'INV-2025-00002',
      recipient_name: 'University of Edinburgh', recipient_email: 'finance@ed.ac.uk',
      line_items: [
        { description: 'Atmospheric aerosol sensor suite — 3U CubeSat payload integration', quantity: 1, unit_price: 1562500, amount: 1562500 },
        { description: 'Ground station data relay & mission support (90 days)',             quantity: 1, unit_price:  312500, amount:  312500 },
      ],
      subtotal: 1875000, vat_amount: 375000, total: 2250000, currency: 'GBP',
      status: 'paid', due_date: monthDate(9, 1), is_recurring: false,
      notes: 'Sub-mission aboard Transporter-14. Data rights exclusively to University of Edinburgh.',
      created_at: monthTs(7, 15),
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      invoice_number: 'INV-2025-00003',
      recipient_name: 'UKRI — Innovate UK', recipient_email: 'contracts@ukri.org',
      line_items: [
        { description: 'Research deliverable: LEO reentry thermal protection report', quantity: 1, unit_price: 2500000, amount: 2500000 },
        { description: 'Flight data set (TLF-1 mission, 180-day dataset)',            quantity: 1, unit_price: 1250000, amount: 1250000 },
      ],
      subtotal: 3750000, vat_amount: 750000, total: 4500000, currency: 'GBP',
      status: 'paid', due_date: monthDate(4, 1), is_recurring: false,
      notes: 'Deliverables per UKRI contract UKRI-2025-PL-00814.',
      created_at: monthTs(3, 1),
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      invoice_number: 'INV-2025-00004',
      recipient_name: 'Surrey Space Centre', recipient_email: 'accounts@surrey.ac.uk',
      line_items: [
        { description: 'CubeSat end-to-end integration & environmental testing (3U, MK1)', quantity: 1, unit_price: 833333, amount: 833333 },
        { description: 'Thermal vacuum chamber access — 48hrs (TVAC-S)',                   quantity: 1, unit_price: 166667, amount: 166667 },
      ],
      subtotal: 1000000, vat_amount: 200000, total: 1200000, currency: 'GBP',
      status: 'paid', due_date: monthDate(7, 1), is_recurring: false,
      notes: 'Acceptance testing for MK1 prior to SpaceX delivery.',
      created_at: monthTs(6, 10),
    },
    {
      foundry_id: FOUNDRY_ID, created_by: founderId,
      invoice_number: 'INV-2026-00001',
      recipient_name: 'Imperial College London', recipient_email: 'space-lab@imperial.ac.uk',
      line_items: [
        { description: 'Crystal growth experiment — Transporter-18 payload slot (Q3 2026)', quantity: 1,  unit_price: 2166667, amount: 2166667 },
        { description: 'Payload integration engineering support',                            quantity: 40, unit_price:   20833, amount:  833320 },
      ],
      subtotal: 2999987, vat_amount: 599997, total: 3599984, currency: 'GBP',
      status: 'sent', due_date: monthDate(14, 1), is_recurring: false,
      notes: 'Q3 2026 mission. 50% advance due on signature. Remainder on launch.',
      created_at: monthTs(12, 5),
    },
  ]

  const { error } = await supabase.from('finance_standalone_invoices').insert(invoices)
  if (error) console.error(`   Standalone invoices failed: ${error.message}`)
  else console.log(`   ${invoices.length} invoices seeded`)
}

async function seedObjectives(founderId: string): Promise<void> {
  console.log('\n[+] Bonus: Seeding strategic objectives + tasks...')

  const { count } = await supabase
    .from('objectives')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if ((count ?? 0) > 0) {
    console.log(`   Objectives already seeded (${count} found), skipping`)
    return
  }

  const objs = [
    { id: uid('obj-seed-round'), foundry_id: FOUNDRY_ID, creator_id: founderId, title: 'Close £2M seed round by end of Q1 2026',                  description: 'Secure Series Seed from Orbital Ventures to fund 18 months of operations, MK2 development, and 2 additional rideshare slots.', status: 'In Progress', progress: 65, milestone_date: monthDate(13, 31) },
    { id: uid('obj-mk2'),        foundry_id: FOUNDRY_ID, creator_id: founderId, title: 'Complete CubeSat MK2 design freeze by June 2026',          description: 'Finalise MK2 structural, thermal, power and software designs. Target 6U form factor with < 500m CEP recovery accuracy.',         status: 'In Progress', progress: 30, milestone_date: monthDate(16, 30) },
    { id: uid('obj-biocube'),    foundry_id: FOUNDRY_ID, creator_id: founderId, title: 'Deliver ESA BioCube mission — full data set & report',     description: 'Complete 6-month LEO microbiology experiment. Deorbit and deliver all telemetry + final scientific report per contract.',          status: 'In Progress', progress: 70, milestone_date: monthDate(13, 15) },
    { id: uid('obj-unispace'),   foundry_id: FOUNDRY_ID, creator_id: founderId, title: 'Grow UniSpace programme to 5 university clients',          description: 'Expand from 2 to 5 paying university research clients. Target: Imperial, UCL, Manchester. Goal: £15k MRR by Q3 2026.',        status: 'In Progress', progress: 40, milestone_date: monthDate(18, 1)  },
  ]

  const { error: objError } = await supabase.from('objectives').insert(objs)
  if (objError) {
    console.error(`   Objectives failed: ${objError.message}`)
    return
  }
  console.log(`   ${objs.length} objectives seeded`)

  // task_status valid values: 'Pending' | 'Accepted' | 'Rejected' | 'Amended' |
  //   'Amended_Pending_Approval' | 'Completed' | 'Pending_Peer_Review' | 'Pending_Executive_Approval'
  const tasks = [
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-seed-round'), title: 'Prepare investor data room (financials, cap table, IP register)',            status: 'Completed' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-seed-round'), title: 'First Orbital Ventures partner meeting — pitch deck delivery',               status: 'Completed' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-seed-round'), title: 'Term sheet review with Orrick Herrington',                                   status: 'Accepted' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-seed-round'), title: 'Due diligence: technical Q&A with Orbital Ventures engineering team',        status: 'Pending' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-mk2'),        title: 'MK1 lessons learned review — document all anomalies and improvements',       status: 'Completed' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-mk2'),        title: 'Recovery system v2 — parachute deployment mechanism redesign',               status: 'Accepted' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-mk2'),        title: 'Power budget analysis for 6U configuration',                                  status: 'Pending' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-biocube'),    title: 'Daily telemetry monitoring and anomaly reporting — TLF-2 mission',           status: 'Accepted' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-biocube'),    title: 'Deorbit window calculation and ground station pre-positioning',               status: 'Pending' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-unispace'),   title: 'Imperial College London — proposal submission (crystal growth experiment)', status: 'Completed' },
    { foundry_id: FOUNDRY_ID, creator_id: founderId, objective_id: uid('obj-unispace'),   title: 'UCL Space & Climate Physics — intro meeting',                                status: 'Pending' },
  ]

  // @ts-ignore — enum casting
  const { error: taskError } = await supabase.from('tasks').insert(tasks)
  if (taskError) console.error(`   Tasks failed: ${taskError.message}`)
  else console.log(`   ${tasks.length} tasks seeded`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════╗')
  console.log('║  Perigee Labs Ltd — Finance Seed Script           ║')
  console.log('║  CubeSat startup, 12 months history               ║')
  console.log('╚═══════════════════════════════════════════════════╝')

  const founderId = await seedFounder()
  if (!founderId) { console.error('Failed to get founder ID. Aborting.'); process.exit(1) }

  await seedFoundry(founderId)
  await updateFounderProfile(founderId, ACCOUNTS[0])
  await seedTeamMembers(founderId)
  await seedAccountBalance(founderId)
  await seedBalanceTransactions(founderId)
  await seedMoneyMapCosts()
  await seedMoneyMapRevenue()
  await seedBudgets(founderId)
  await seedExpenses(founderId)
  await seedProjects(founderId)
  await seedFunding(founderId)
  await seedInvoices(founderId)
  await seedObjectives(founderId)

  console.log('\n╔═══════════════════════════════════════════════════╗')
  console.log('║  ✓ Seed complete!                                 ║')
  console.log('╠═══════════════════════════════════════════════════╣')
  console.log('║  Login details:                                   ║')
  console.log('║  Email:    elena.vasquez@perigee-labs.com         ║')
  console.log('║  Password: PerigeeSpace2025!                      ║')
  console.log('╚═══════════════════════════════════════════════════╝')
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Fatal error:', err); process.exit(1) })
