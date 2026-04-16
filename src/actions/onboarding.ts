'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import type { Database, Json } from '@/types/database.types'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { withAuth } from '@/lib/server-action-utils'

type AccountType = Database['public']['Enums']['account_type']

/**
 * Set the user's account type (supplier or team_builder).
 * This determines which portal they land on after login.
 *
 * @description Updates the account_type field on the user's profile.
 * If the profile doesn't exist yet (race condition during signup),
 * attempts to create it before failing.
 *
 * @param accountType - The account type to set
 * @returns Object with success boolean or error string
 *
 * @security Requires authenticated user. Only updates own profile via RLS.
 */
/**
 * Flip the two founder-first opt-in flags on the current user's profile.
 *
 * Every ForgeOS user is a founder of their own foundry. These flags express
 * two independent additional roles they can take on:
 *   - is_fractional_executive: "Yes, list me on the marketplace as available
 *     to other companies." When set true, Phase 5 wiring triggers the provider
 *     profile wizard to collect headline/bio/day rate/etc.
 *   - is_supplier: "Yes, I also supply goods or services." When set true, the
 *     sidebar reveals the Supplier Portal section (Phase 3).
 *
 * Pass `null` for a flag to leave it unchanged.
 */
export async function setOptInFlags(input: {
  is_fractional_executive?: boolean | null
  is_supplier?: boolean | null
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const patch: Record<string, boolean> = {}
  if (typeof input.is_fractional_executive === 'boolean') {
    patch.is_fractional_executive = input.is_fractional_executive
  }
  if (typeof input.is_supplier === 'boolean') {
    patch.is_supplier = input.is_supplier
  }
  if (Object.keys(patch).length === 0) return { success: true }

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)

  if (error) {
    console.error('[Onboarding] setOptInFlags failed:', { userId: user.id, error: error.message })
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setAccountType(accountType: AccountType): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }

  // First check if profile exists (it might not if signup had a race condition)
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (fetchError && fetchError.code === 'PGRST116') {
    // Profile doesn't exist yet — create it with the account type
    console.warn('[Onboarding] Profile missing during setAccountType, creating profile for user:', user.id)
    const userRole = (user.user_metadata?.role as 'Founder' | 'Executive' | 'Apprentice') ?? 'Apprentice'
    // INTENT: Always use forge-guild as fallback. The old `foundry_${userId}` pattern
    // created a non-existent foundry ID → FK violation on profiles.foundry_id.
    // setupNewUser is responsible for creating real founder foundries.
    const fallbackFoundryId = 'forge-guild'
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
        role: userRole,
        foundry_id: fallbackFoundryId,
        account_type: accountType,
      })

    if (insertError) {
      console.error('[Onboarding] Failed to create profile during setAccountType:', {
        userId: user.id,
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
      })
      return { error: `Failed to create profile: ${sanitizeErrorMessage(insertError)}` }
    }

    revalidatePath('/', 'layout')
    revalidatePath('/supplier', 'layout')
    return { success: true }
  }

  if (fetchError) {
    console.error('[Onboarding] Failed to check profile existence:', {
      userId: user.id,
      error: fetchError.message,
      code: fetchError.code,
    })
  }

  // Profile exists — update it
  const { error } = await supabase
    .from('profiles')
    .update({ 
      account_type: accountType,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)
  
  if (error) {
    console.error('[Onboarding] Failed to set account type:', {
      userId: user.id,
      accountType,
      error: error.message,
      code: error.code,
      details: error.details,
    })
    return { error: `Failed to save selection: ${sanitizeErrorMessage(error)}` }
  }
  
  // INTENT: Revalidate BOTH platform and supplier-portal layouts.
  // Without revalidating supplier-portal, the layout cache serves stale
  // account_type → redirects user to login with "not_supplier_account" error.
  // This was Theo's exact bug: Google OAuth → onboarding modal → pick supplier
  // → redirect to /supplier-portal → stale cache → bounced to login.
  revalidatePath('/', 'layout')
  revalidatePath('/supplier', 'layout')
  return { success: true }
}

/**
 * Get the user's account type
 */
export async function getAccountType(): Promise<{ accountType: AccountType | null; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { accountType: null, error: 'Unauthorized' }
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('account_type')
    .eq('id', user.id)
    .single()
  
  if (error) {
    console.error('Error getting account type:', error)
    return { accountType: null, error: 'Failed to get account type' }
  }
  
  return { accountType: profile?.account_type ?? null }
}

export async function createSampleData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Get user's foundry using cached helper
  const foundry_id = await getFoundryIdCached()
  if (!foundry_id) return { error: 'User not in a foundry' }
  
  // Create sample objective
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .insert({
      title: 'Sample Objective: Q1 Goals',
      description: 'This is a sample objective to help you get started. Feel free to edit or delete it.',
      creator_id: user.id,
      foundry_id
    })
    .select()
    .single()
  
  if (objError) return { error: sanitizeErrorMessage(objError) }
  
  // Create sample tasks
  const sampleTasks = [
    { title: 'Review project requirements', description: 'Go through the initial requirements document' },
    { title: 'Set up development environment', description: 'Install necessary tools and dependencies' },
    { title: 'Create project timeline', description: 'Define milestones and deadlines' }
  ]
  
  for (const task of sampleTasks) {
    await supabase.from('tasks').insert({
      ...task,
      objective_id: objective.id,
      creator_id: user.id,
      assignee_id: user.id,
      foundry_id,
      status: 'Pending',
      risk_level: 'Medium'
    })
  }
  
  revalidatePath('/objectives')
  revalidatePath('/tasks')
  
  return { success: true }
}

/**
 * Create initial training tasks for new Apprentices
 */
export async function createApprenticeTrainingTasks() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Get user's foundry (should be forge-guild for apprentices)
  const foundry_id = await getFoundryIdCached()
  if (!foundry_id) return { error: 'User not in a foundry' }
  
  // Create training objective for the apprentice
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .insert({
      title: 'Week 1: Toolkit Setup',
      description: 'Complete your initial training and set up your toolkit - the system that amplifies your output 10x.',
      creator_id: user.id,
      foundry_id,
      status: 'on_track'
    })
    .select()
    .single()
  
  if (objError) {
    console.error('Error creating training objective:', objError)
    return { error: sanitizeErrorMessage(objError) }
  }
  
  // Create training tasks for apprentices
  const trainingTasks = [
    { 
      title: 'Complete your profile', 
      description: 'Add your bio, skills, and interests to help us match you with the right projects and mentors.',
      end_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Due in 1 day
    },
    { 
      title: 'Take the platform tour', 
      description: 'Explore the tools available in the marketplace. These tools will amplify your output and help you ship faster.',
      end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // Due in 2 days
    },
    { 
      title: 'Review The Guild handbook', 
      description: 'Understand how The Guild works, your path to becoming a founder, and how to get the most from your mentors.',
      end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // Due in 3 days
    },
    { 
      title: 'Ship your first deliverable', 
      description: 'Complete a small task assigned by your mentor. This is your first step to proving you can build atoms at the speed of bits.',
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Due in 7 days
    }
  ]
  
  for (const task of trainingTasks) {
    await supabase.from('tasks').insert({
      ...task,
      objective_id: objective.id,
      creator_id: user.id,
      assignee_id: user.id,
      foundry_id,
      status: 'Pending',
      risk_level: 'Low'
    })
  }
  
  revalidatePath('/objectives')
  revalidatePath('/tasks')
  revalidatePath('/dashboard')
  
  return { success: true }
}

/**
 * Marketplace Onboarding Functions
 */

export interface OnboardingData {
  marketplace_tour_completed?: boolean
  marketplace_tour_skipped?: boolean
  first_marketplace_action?: string
  first_marketplace_action_at?: string
  first_marketplace_action_listing_id?: string
  dashboard_tour_completed?: boolean
  guild_tour_completed?: boolean
  /** Unified onboarding modal fields */
  onboarding_modal_completed?: boolean
  account_type_selected?: 'team_builder' | 'supplier'
  onboarding_completed_at?: string
  has_completed_onboarding?: boolean
  /** Getting Started Checklist fields */
  checklist_dismissed?: boolean
  checklist_completed_at?: string
  checklist_profile_completed?: boolean
  checklist_video_watched?: boolean
  checklist_objective_created?: boolean
  checklist_team_member_added?: boolean
  checklist_marketplace_explored?: boolean
  checklist_forge_project_created?: boolean
  checklist_friend_invited?: boolean
  /** Milestone tracking */
  milestones_shown?: string[]
  /** Plan selected during onboarding (actual checkout happens from /settings/billing) */
  selected_plan?: 'free' | 'starter' | 'professional'
  /** Intent selected during onboarding 3-way fork */
  intent_selection?: 'setup_company' | 'join_company' | 'exploring'
  /** Whether demo/seed data has been cleared */
  demo_data_cleared?: boolean
  /** Sandbox welcome banner dismissed on Today page */
  sandbox_banner_dismissed?: boolean
  /** Profile completion wizard (mandatory, post-company-name) */
  profile_wizard_completed?: boolean
  profile_wizard_completed_at?: string
  profile_wizard_draft?: {
    headline?: string
    bio?: string
    skills?: string[]
    industries?: string[]
    years_experience?: number
    expertise_areas?: string[]
    availability_type?: string
    availability_hours_per_week?: number
    current_step?: number
  }
}

/**
 * Generic updater for onboarding_data JSONB field.
 *
 * @description Merges the provided partial data into the user's existing
 * onboarding_data. Safe for concurrent writes since it reads current state
 * first then merges.
 *
 * @param updates - Partial data to merge into onboarding_data
 * @returns Success or error
 *
 * @security Requires authenticated user, updates only own profile
 */
export async function updateOnboardingData(
  updates: Partial<OnboardingData>
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Unauthorized' }

  // Read current onboarding data
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_data')
    .eq('id', user.id)
    .single()

  const currentData = (profile?.onboarding_data as OnboardingData) || {}
  const updatedData: OnboardingData = {
    ...currentData,
    ...updates,
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_data: updatedData as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('[Onboarding] Failed to update onboarding data:', {
      userId: user.id,
      error: error.message,
    })
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

/**
 * Record that a milestone celebration was shown to the user.
 *
 * @description Appends the milestone ID to the milestones_shown array
 * in onboarding_data so it won't trigger again.
 *
 * @param milestoneId - The ID of the milestone that was shown
 * @returns Success or error
 *
 * @security Only updates own profile
 */
export async function recordMilestoneShown(
  milestoneId: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_data')
    .eq('id', user.id)
    .single()

  const currentData = (profile?.onboarding_data as OnboardingData) || {}
  const currentMilestones = currentData.milestones_shown || []

  // Don't duplicate
  if (currentMilestones.includes(milestoneId)) {
    return { success: true }
  }

  return updateOnboardingData({
    milestones_shown: [...currentMilestones, milestoneId],
  })
}

/**
 * Record a page visit for the onboarding system.
 *
 * @description Tracks which pages the user has visited so the onboarding
 * system can show contextual tips and celebrate exploration milestones.
 *
 * @param pageKey - The page key (e.g., 'today', 'tasks', 'marketplace')
 * @returns Success or error
 *
 * @security Only updates own profile
 */
export async function recordPageVisit(
  pageKey: string
): Promise<{ success?: boolean; error?: string }> {
  const key = `visited_${pageKey}` as keyof OnboardingData
  return updateOnboardingData({ [key]: true } as Partial<OnboardingData>)
}

/**
 * Complete the marketplace onboarding tour
 */
export async function completeMarketplaceOnboarding(skipped: boolean = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }

  // Get current profile to read existing onboarding_data
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_data')
    .eq('id', user.id)
    .single()

  // Merge with existing onboarding data
  const currentData = (profile?.onboarding_data as OnboardingData) || {}
  const updatedData: OnboardingData = {
    ...currentData,
    marketplace_tour_completed: true,
    marketplace_tour_skipped: skipped
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_data: updatedData as unknown as Json,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (error) {
    console.error('Error completing marketplace onboarding:', error)
    return { error: 'Failed to update onboarding status' }
  }

  revalidatePath('/marketplace')
  return { success: true }
}

/**
 * Check if user needs to see the marketplace onboarding
 */
export async function getMarketplaceOnboardingStatus() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { needsOnboarding: false, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_data')
    .eq('id', user.id)
    .single()

  const onboardingData = (profile?.onboarding_data as OnboardingData) || {}
  const needsOnboarding = !onboardingData.marketplace_tour_completed

  return { 
    needsOnboarding,
    wasSkipped: onboardingData.marketplace_tour_skipped,
    firstAction: onboardingData.first_marketplace_action,
    firstActionAt: onboardingData.first_marketplace_action_at
  }
}

/**
 * Repair a user's profile when foundry_id is missing or invalid.
 *
 * @description Detects when a user ended up without a valid foundry and
 * creates / assigns one based on their role:
 *   - Founders  → new personal foundry
 *   - Executives / Apprentices → shared "forge-guild" foundry
 *   - Suppliers  → shared "forge-suppliers" foundry
 *
 * Also creates the foundry_memberships row so multi-foundry switching works.
 *
 * @returns Object with `success: true` or an `error` string
 *
 * @security Requires authenticated user. Only modifies own profile.
 * @audit Logs repair events with userId and resolved foundryId.
 */
export async function repairProfile(): Promise<{ success: true; foundryId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Unauthorized' }

  // Call the SECURITY DEFINER database function that bypasses all RLS.
  // This avoids the two problems that block the admin client approach:
  //   1) RLS recursion on profiles (stale policies can cause 500s)
  //   2) Legacy service_role key is disabled in Supabase
  // The RPC function verifies auth.uid() internally.
  const { data, error: rpcError } = await supabase.rpc('repair_user_profile')

  if (rpcError) {
    console.error('[RepairProfile] RPC failed:', {
      userId: user.id,
      code: rpcError.code,
      message: rpcError.message,
      details: rpcError.details,
      hint: rpcError.hint,
    })
    return { error: `Repair failed (${rpcError.code}): ${sanitizeErrorMessage(rpcError)}` }
  }

  const result = data as { success?: boolean; foundry_id?: string; action?: string; error?: string }

  if (result.error) {
    console.error('[RepairProfile] RPC returned error:', { userId: user.id, error: result.error })
    return { error: result.error }
  }

  // AUDIT: Log repair event
  console.info('[RepairProfile] Profile repaired via RPC:', {
    userId: user.id,
    foundryId: result.foundry_id,
    action: result.action,
  })

  revalidatePath('/', 'layout')
  return { success: true, foundryId: result.foundry_id ?? '' }
}

/**
 * Resolve the correct foundry for a user based on role, creating it if needed.
 *
 * @param supabase - Supabase client
 * @param userId - The user's auth ID
 * @param role - The user's role
 * @param displayName - Name to use for new foundry (Founders only)
 * @returns The foundry ID and whether it was newly created, or an error
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries insert requires columns (name, slug, owner_id) not in generated types
async function resolveOrCreateFoundry(
  supabase: any,
  userId: string,
  role: 'Founder' | 'Executive' | 'Apprentice',
  displayName: string,
): Promise<{ foundryId: string; wasCreated: boolean } | { error: string }> {
  if (role === 'Founder') {
    // Founders get their own foundry
    const slug = `foundry-${userId.slice(0, 8)}-${Date.now().toString(36)}`
    const { data: newFoundry, error: createError } = await supabase
      .from('foundries')
      .insert({
        name: `${displayName}'s Foundry`,
        slug,
        owner_id: userId,
      })
      .select('id')
      .single()

    if (createError) {
      console.error('[RepairProfile] Failed to create foundry for Founder:', { userId, error: createError.message })
      return { error: 'Failed to create your workspace. Please contact support.' }
    }

    await ensureMembership(supabase, userId, newFoundry.id, 'Founder')
    return { foundryId: newFoundry.id, wasCreated: true }
  }

  // Executives / Apprentices → forge-guild, Suppliers would use forge-suppliers
  const sharedFoundryId = 'forge-guild'
  const sharedFoundryName = 'ForgeOS Guild'

  // Check if the shared foundry exists
  const { data: foundryExists } = await supabase
    .from('foundries')
    .select('id')
    .eq('id', sharedFoundryId)
    .maybeSingle()

  if (!foundryExists) {
    // Create the shared foundry
    const { error: createError } = await supabase
      .from('foundries')
      .insert({
        id: sharedFoundryId,
        name: sharedFoundryName,
        slug: sharedFoundryId,
        owner_id: userId,
      })

    if (createError) {
      console.error('[RepairProfile] Failed to create shared foundry:', { error: createError.message })
      return { error: 'Failed to set up your workspace. Please contact support.' }
    }
  }

  await ensureMembership(supabase, userId, sharedFoundryId, role)
  return { foundryId: sharedFoundryId, wasCreated: !foundryExists }
}

/**
 * Ensure a foundry_memberships row exists for the user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundry_memberships role param is string, not member_role enum
async function ensureMembership(supabase: any, userId: string, foundryId: string, role: string): Promise<void> {
  const { data: existing } = await supabase
    .from('foundry_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('foundry_id', foundryId)
    .maybeSingle()

  if (!existing) {
    const { error } = await supabase.from('foundry_memberships').insert({
      user_id: userId,
      foundry_id: foundryId,
      role,
      is_primary: true,
      joined_at: new Date().toISOString(),
    })
    if (error) {
      console.warn('[RepairProfile] Failed to create membership:', { userId, foundryId, error: error.message })
    }
  }
}

/**
 * Get the user's onboarding state from the DB.
 *
 * @returns Typed OnboardingData object, or empty object if not set
 *
 * @security Requires authenticated user, reads only own profile
 */
export async function getOnboardingState(): Promise<OnboardingData & { _userRole?: string; _isSandbox?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return {}

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_data, role, foundry_id')
    .eq('id', user.id)
    .single()

  const data = (profile?.onboarding_data as OnboardingData) || {}

  // Check if user's foundry is a sandbox (for Today page banner)
  let isSandbox = false
  if (profile?.foundry_id) {
    const { data: foundry } = await supabase
      .from('foundries')
      .select('is_sandbox')
      .eq('id', profile.foundry_id)
      .single()
    isSandbox = foundry?.is_sandbox ?? false
  }

  // Piggyback role + sandbox status to avoid extra DB calls in today page
  return { ...data, _userRole: profile?.role ?? undefined, _isSandbox: isSandbox }
}

/**
 * Fetch up to 3 marketplace listings matching the user's foundry industry.
 *
 * @description Reads the foundry's industry, then searches marketplace for
 * matches. Falls back to general listings if no industry match found.
 *
 * @returns Array of up to 3 listings for the "aha moment" step
 *
 * @security Requires authenticated user
 */
export async function getOnboardingAhaListings(): Promise<{ title: string; category: string; id: string }[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  // Get user's foundry industry
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  let industry: string | null = null
  if (profile?.foundry_id) {
    const { data: foundry } = await supabase
      .from('foundries')
      .select('industry')
      .eq('id', profile.foundry_id)
      .single()
    industry = foundry?.industry ?? null
  }

  // Search marketplace with industry if available
  let query = supabase
    .from('marketplace_listings')
    .select('id, title, category')
    .eq('status', 'active')
    .limit(3)

  if (industry) {
    // SECURITY: Sanitize industry for PostgREST filter DSL — strip commas,
    // parens, wildcards, and backslashes that could alter filter logic.
    const safeIndustry = industry.replace(/[,%_\\()]/g, ' ').trim().slice(0, 100)
    if (safeIndustry) {
      query = query.or(`category.ilike.%${safeIndustry}%,title.ilike.%${safeIndustry}%,description.ilike.%${safeIndustry}%`)
    }
  }

  const { data: listings } = await query

  // If industry search returned nothing, fall back to any active listings
  if (!listings || listings.length === 0) {
    const { data: fallback } = await supabase
      .from('marketplace_listings')
      .select('id, title, category')
      .eq('status', 'active')
      .limit(3)

    return (fallback ?? []).map(l => ({ id: l.id, title: l.title, category: l.category ?? 'General' }))
  }

  return listings.map(l => ({ id: l.id, title: l.title, category: l.category ?? 'General' }))
}

/**
 * Record the user's first marketplace action
 */
export async function recordMarketplaceAction(
  actionType: 'add_to_stack' | 'create_rfq' | 'book_listing' | 'view_listing' | 'contact_provider',
  listingId?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }

  // Get current profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_data')
    .eq('id', user.id)
    .single()

  const currentData = (profile?.onboarding_data as OnboardingData) || {}

  // Only record if this is the first action
  if (currentData.first_marketplace_action) {
    return { success: true, alreadyRecorded: true }
  }

  const updatedData: OnboardingData = {
    ...currentData,
    first_marketplace_action: actionType,
    first_marketplace_action_at: new Date().toISOString(),
    first_marketplace_action_listing_id: listingId
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_data: updatedData as unknown as Json,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (error) {
    console.error('Error recording marketplace action:', error)
    return { error: 'Failed to record action' }
  }

  return { success: true, alreadyRecorded: false }
}

/**
 * Clears all demo/seed data from the user's foundry.
 * Called when user completes onboarding or clicks "Clear Demo Data" in Settings.
 *
 * @description Deletes demo tasks, objectives, marketplace listings, and activity
 * events that were created during onboarding seed. Marks demo_data_cleared in the
 * user's onboarding_data so it won't be re-seeded.
 *
 * @returns Object with success boolean, optional error, and counts of cleared items
 *
 * @security Requires authenticated user with valid foundry. Deletes only within
 * the user's own foundry (foundry_id filter + RLS).
 */
export async function clearDemoData(): Promise<{
  success: boolean
  error?: string
  cleared: { objectives: number; tasks: number; listings: number; events: number }
}> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!foundryId) {
      return {
        success: false,
        error: 'No foundry found',
        cleared: { objectives: 0, tasks: 0, listings: 0, events: 0 },
      }
    }

    // Delete demo tasks first (FK constraint: tasks reference objectives)
    const { data: deletedTasks } = await supabase
      .from('tasks')
      .delete()
      .eq('foundry_id', foundryId)
      .eq('is_demo', true)
      .select('id')

    // Delete demo objectives
    const { data: deletedObjectives } = await supabase
      .from('objectives')
      .delete()
      .eq('foundry_id', foundryId)
      .eq('is_demo', true)
      .select('id')

    // Delete demo marketplace listings (is_demo in JSONB attributes)
    const { data: deletedListings } = await supabase
      .from('marketplace_listings')
      .delete()
      .eq('foundry_id', foundryId)
      .contains('attributes', { is_demo: true })
      .select('id')

    // Delete demo activity events (is_demo in JSONB event_data)
    const { data: deletedEvents } = await supabase
      .from('activity_events')
      .delete()
      .eq('foundry_id', foundryId)
      .contains('event_data', { is_demo: true })
      .select('id')

    // Mark demo data as cleared in onboarding
    await updateOnboardingData({ demo_data_cleared: true })

    revalidatePath('/', 'layout')

    return {
      success: true,
      cleared: {
        objectives: deletedObjectives?.length ?? 0,
        tasks: deletedTasks?.length ?? 0,
        listings: deletedListings?.length ?? 0,
        events: deletedEvents?.length ?? 0,
      },
    }
  })
}
