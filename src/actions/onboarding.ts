'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

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
  
  if (objError) return { error: objError.message }
  
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
  
  // Get user's foundry (should be centaur-guild for apprentices)
  const foundry_id = await getFoundryIdCached()
  if (!foundry_id) return { error: 'User not in a foundry' }
  
  // Create training objective for the apprentice
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .insert({
      title: 'Week 1: Digital Body Setup',
      description: 'Complete your initial training and set up your Digital Body - the AI-powered toolkit that amplifies your output 10x.',
      creator_id: user.id,
      foundry_id,
      status: 'on_track'
    })
    .select()
    .single()
  
  if (objError) {
    console.error('Error creating training objective:', objError)
    return { error: objError.message }
  }
  
  // Create training tasks for apprentices
  const trainingTasks = [
    { 
      title: 'Complete your profile', 
      description: 'Add your bio, skills, and interests to help us match you with the right projects and mentors.',
      end_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Due in 1 day
    },
    { 
      title: 'Take the Digital Body tour', 
      description: 'Explore the AI tools available in the marketplace. These tools will amplify your output and help you ship faster.',
      end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // Due in 2 days
    },
    { 
      title: 'Review the Guild handbook', 
      description: 'Understand how the Centaur Guild works, your path to becoming a founder, and how to get the most from your mentors.',
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

interface OnboardingData {
  marketplace_tour_completed?: boolean
  marketplace_tour_skipped?: boolean
  first_marketplace_action?: string
  first_marketplace_action_at?: string
  first_marketplace_action_listing_id?: string
  dashboard_tour_completed?: boolean
  guild_tour_completed?: boolean
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onboarding_data: updatedData as any,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onboarding_data: updatedData as any,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (error) {
    console.error('Error recording marketplace action:', error)
    return { error: 'Failed to record action' }
  }

  return { success: true, alreadyRecorded: false }
}
