/**
 * @file seed-screenshot-account.ts
 *
 * @description Creates a dedicated demo account for marketing screenshots
 * and seeds it with rich content so every page looks populated.
 *
 * Usage: npx tsx scripts/seed-screenshot-account.ts
 *
 * Creates: screenshots@fractionalforge.app / ForgeScreenshots2026!
 * Seeds: 3 forge concepts, objectives, tasks, team context
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const EMAIL = 'mktg-demo@fractionalforge.app'
const PASSWORD = 'ForgeScreenshots2026!'
const FULL_NAME = 'Sarah Chen'
const COMPANY = 'Aeroframe Technologies'
const INDUSTRY = 'Aerospace, Hardware'
const STAGE = 'Series A'

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Creating screenshot account...')

  // Create or find user
  let userId: string

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME, role: 'founder' },
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      // Find existing user by querying profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', EMAIL)
        .single()

      if (profile) {
        userId = profile.id
        console.log('Found user via profile:', userId)
      } else {
        // Try auth admin getUserByEmail (Supabase v2+)
        // Fallback: query auth.users directly
        const { data: authUsers } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', EMAIL)
          .limit(1)

        if (authUsers && authUsers.length > 0) {
          userId = authUsers[0].id
          console.log('Found user via ilike:', userId)
        } else {
          // User exists in auth but no profile — iterate auth pages to find ID
          let found = false
          let page = 1
          while (!found && page <= 10) {
            const { data: batch } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
            const match = batch?.users?.find(u => u.email === EMAIL)
            if (match) {
              userId = match.id
              console.log('Found orphaned auth user on page', page, ':', userId)
              found = true
            }
            if (!batch?.users?.length) break
            page++
          }
          if (!found) {
            console.error('Could not find user in auth. Aborting.')
            process.exit(1)
          }
        }
      }
    } else {
      console.error('Failed to create user:', authError.message)
      process.exit(1)
    }
  } else {
    userId = authUser.user.id
    console.log('Created user:', userId)
  }

  // Check if profile exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, foundry_id')
    .eq('id', userId)
    .single()

  let foundryId: string

  if (existingProfile?.foundry_id) {
    foundryId = existingProfile.foundry_id
    console.log('Profile exists with foundry:', foundryId)
  } else {
    // FLOW: Profile must exist before foundry (FK: foundries.owner_id → profiles.id)
    // Create profile with temp forge-guild, then create real foundry, then update.

    if (!existingProfile) {
      console.log('Creating profile with temp foundry...')
      await supabase.from('profiles').insert({
        id: userId,
        email: EMAIL,
        full_name: FULL_NAME,
        role: 'Founder',
        foundry_id: 'forge-guild',
        active_foundry_id: 'forge-guild',
        account_type: 'team_builder',
        onboarding_data: {
          onboarding_modal_completed: true,
          has_completed_onboarding: true,
        },
      })
    }

    // Now create the real foundry (profile exists so FK is satisfied)
    const slug = `aeroframe-${userId.slice(0, 6)}`
    const generatedId = `foundry-${slug}`
    const { data: foundry, error: foundryError } = await supabase
      .from('foundries')
      .insert({
        id: generatedId,
        name: COMPANY,
        slug,
        industry: INDUSTRY,
        stage: STAGE,
        owner_id: userId,
      })
      .select('id')
      .single()

    if (foundryError) {
      console.error('Failed to create foundry:', foundryError.message)
      process.exit(1)
    }

    foundryId = foundry.id
    console.log('Created foundry:', foundryId)

    // Update profile to point to real foundry
    await supabase
      .from('profiles')
      .update({ foundry_id: foundryId, active_foundry_id: foundryId })
      .eq('id', userId)

    // Create foundry membership
    await supabase.from('foundry_memberships').insert({
      user_id: userId,
      foundry_id: foundryId,
      role: 'Founder',
      is_primary: true,
      joined_at: new Date().toISOString(),
    })

    // Create provider profile
    await supabase.from('provider_profiles').insert({
      user_id: userId,
      headline: 'Founder',
      bio: 'Building next-gen aerospace components with advanced manufacturing techniques.',
      tier: 'approved',
      is_active: true,
      is_public: true,
    })
  }

  // Seed demo forge concepts
  console.log('Seeding forge concepts...')
  const conceptRpcs = [
    'seed_demo_forge_concept',
    'seed_demo_air_quality_sensor',
    'seed_demo_drone_motor_mount',
  ] as const

  for (const rpc of conceptRpcs) {
    try {
      await supabase.rpc(rpc, { p_foundry_id: foundryId, p_user_id: userId })
      console.log(`  Seeded: ${rpc}`)
    } catch (e) {
      console.warn(`  ${rpc} failed (may already exist):`, (e as Error).message)
    }
  }

  // Seed objectives + tasks
  console.log('Seeding objectives and tasks...')
  try {
    await supabase.rpc('seed_founder_demo_data', { p_foundry_id: foundryId, p_user_id: userId })
    console.log('  Seeded: founder demo data')
  } catch (e) {
    console.warn('  seed_founder_demo_data failed:', (e as Error).message)
  }

  try {
    await supabase.rpc('seed_founder_demo_data_expanded', { p_foundry_id: foundryId, p_user_id: userId })
    console.log('  Seeded: expanded demo data')
  } catch (e) {
    console.warn('  seed_founder_demo_data_expanded failed:', (e as Error).message)
  }

  // Set foundry purpose for strategy page
  console.log('Setting company purpose...')
  await supabase
    .from('foundries')
    .update({
      purpose_data: {
        purpose: 'Democratise advanced aerospace manufacturing for hardware startups',
        mission: 'Make it possible for any founder to build flight-ready components in weeks, not years',
        vision: 'A world where hardware startups move as fast as software companies',
      },
    })
    .eq('id', foundryId)

  console.log('\n=== Screenshot Account Ready ===')
  console.log(`Email:    ${EMAIL}`)
  console.log(`Password: ${PASSWORD}`)
  console.log(`Foundry:  ${foundryId}`)
  console.log(`User ID:  ${userId}`)
  console.log('\nRun screenshots:')
  console.log(`E2E_EMAIL="${EMAIL}" E2E_PASSWORD="${PASSWORD}" npx playwright test e2e/capture-screenshots.ts`)
}

main().catch(console.error)
