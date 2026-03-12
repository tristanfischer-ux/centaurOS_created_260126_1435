'use server'

/**
 * @file setup-wizard.ts
 *
 * @description Server actions for the first-run setup wizard. Checks eligibility,
 * saves mission/team/objective data, and marks onboarding complete via the
 * existing onboarding_data JSONB column on profiles.
 *
 * @security All actions use withAuth for authenticated foundry-scoped access
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import { createInvitation } from '@/actions/invitations'
import type { FoundryPurposeData } from '@/types/foundry'
import type { Json } from '@/types/database.types'

/**
 * Check whether the setup wizard should be shown to the current user.
 *
 * @description Shows the wizard if the user has NOT completed onboarding AND
 * the foundry has zero objectives, teams, and tasks (i.e. truly fresh).
 *
 * @returns Eligibility flag plus user context for the wizard greeting
 */
export async function checkSetupWizardEligibility(): Promise<
  | { shouldShow: true; userName: string }
  | { shouldShow: false }
  | { error: string }
> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // Check if user already completed onboarding
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, onboarding_data')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return { shouldShow: false }
    }

    const onboardingData = profile.onboarding_data as Record<string, unknown> | null

    // FLOW: wizard_restart_requested bypasses the empty-foundry check so
    // users who already have data can re-run the wizard from Settings.
    const restartRequested = onboardingData?.wizard_restart_requested === true

    if (onboardingData?.has_completed_onboarding === true && !restartRequested) {
      return { shouldShow: false }
    }

    // Check foundry has zero objectives, teams, and tasks (skip if restart)
    if (!restartRequested) {
      const [objectivesResult, teamsResult, tasksResult] = await Promise.all([
        supabase
          .from('objectives')
          .select('id', { count: 'exact', head: true })
          .eq('foundry_id', foundryId),
        supabase
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('foundry_id', foundryId),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('foundry_id', foundryId),
      ])

      const totalCount =
        (objectivesResult.count ?? 0) +
        (teamsResult.count ?? 0) +
        (tasksResult.count ?? 0)

      if (totalCount > 0) {
        return { shouldShow: false }
      }
    }

    const userName = profile.full_name || user.email?.split('@')[0] || 'there'

    // SECURITY: Only return what the client needs — no foundryId or userId
    return { shouldShow: true, userName }
  })
}

/**
 * Mark the setup wizard as completed so it won't show again.
 *
 * @description Merges `{ has_completed_onboarding: true }` into the existing
 * onboarding_data JSONB column on profiles.
 */
export async function completeSetupWizard(): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user }) => {
    // Fetch existing onboarding_data to merge
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_data')
      .eq('id', user.id)
      .single()

    const existing = (profile?.onboarding_data as Record<string, unknown>) ?? {}
    // INTENT: Clear restart flag alongside marking complete so re-triggering
    // from Settings requires an explicit reset call.
    const merged = {
      ...existing,
      has_completed_onboarding: true,
      wizard_restart_requested: false,
    }

    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_data: merged as unknown as Json })
      .eq('id', user.id)

    if (error) {
      console.error('[SetupWizard] Failed to mark onboarding complete:', error.message)
      return { error: 'Failed to save onboarding status' }
    }

    revalidatePath('/today')
    return { success: true }
  })
}

/**
 * Reset the setup wizard so it can be re-triggered from Settings.
 *
 * @description Sets `has_completed_onboarding` to false in onboarding_data JSONB.
 */
export async function resetSetupWizard(): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user }) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_data')
      .eq('id', user.id)
      .single()

    const existing = (profile?.onboarding_data as Record<string, unknown>) ?? {}
    const merged = {
      ...existing,
      has_completed_onboarding: false,
      wizard_restart_requested: true,
    }

    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_data: merged as unknown as Json })
      .eq('id', user.id)

    if (error) {
      console.error('[SetupWizard] Failed to reset onboarding:', error.message)
      return { error: 'Failed to reset setup wizard' }
    }

    revalidatePath('/today')
    revalidatePath('/settings')
    return { success: true }
  })
}

/**
 * Save the foundry mission statement from the wizard.
 *
 * @description Calls updateFoundryPurpose with minimal data — just the purpose
 * string. Mission and vision are left null for later refinement.
 *
 * @param mission - The mission/purpose statement entered by the user
 */
export async function saveWizardMission(
  mission: string
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const trimmed = mission.trim()
    // VALIDATION: Server-side length guard (client maxLength=300)
    if (!trimmed || trimmed.length > 300) {
      return { error: 'Mission must be 1–300 characters' }
    }

    // INTENT: Merge into existing purpose_data to preserve mission/vision/questionnaire
    // from the full purpose wizard. Only overwrite the `purpose` field.
    const { data: foundry } = await supabase
      .from('foundries')
      .select('purpose_data')
      .eq('id', foundryId)
      .single()

    const existing = (foundry?.purpose_data as Record<string, unknown>) ?? {}
    const merged: FoundryPurposeData = {
      purpose: trimmed,
      mission: (existing.mission as string) ?? null,
      vision: (existing.vision as string) ?? null,
      questionnaire: (existing.questionnaire as FoundryPurposeData['questionnaire']) ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    }

    const { error } = await supabase
      .from('foundries')
      .update({ purpose_data: merged as unknown as Json })
      .eq('id', foundryId)

    if (error) {
      console.error('[SetupWizard] Failed to save mission:', error.message)
      return { error: 'Failed to save mission' }
    }

    revalidatePath('/objectives')
    return { success: true }
  })
}

/**
 * Create a team from the wizard with just the current user as a member.
 *
 * @description Inserts directly into teams + team_members tables, bypassing the
 * createTeamSchema which requires min(2) members. The wizard only has the
 * current user — a team of one is valid for onboarding.
 *
 * @param name - Team name
 * @param inviteEmail - Optional email to invite a teammate
 */
export async function createWizardTeam(
  name: string,
  inviteEmail?: string
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const trimmedName = name.trim()
    // VALIDATION: Server-side length guard (client maxLength=100)
    if (!trimmedName || trimmedName.length > 100) {
      return { error: 'Team name must be 1–100 characters' }
    }

    // INTENT: Insert team directly (bypass createTeamSchema min(2) validation)
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: trimmedName,
        foundry_id: foundryId,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (teamError || !team) {
      console.error('[SetupWizard] Failed to create team:', teamError?.message)
      return { error: 'Failed to create team' }
    }

    // Add current user as team member
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        profile_id: user.id,
      })

    if (memberError) {
      console.error('[SetupWizard] Failed to add team member:', memberError.message)
      // Clean up orphaned team
      await supabase.from('teams').delete().eq('id', team.id)
      return { error: 'Failed to add you to the team' }
    }

    // Optionally invite another team member
    if (inviteEmail?.trim()) {
      // FLOW: createInvitation handles rate-limiting, duplicate checks, and email sending
      await createInvitation(inviteEmail.trim(), 'Executive').catch((err) => {
        console.error('[SetupWizard] Invitation failed (non-blocking):', err)
      })
    }

    revalidatePath('/teams')
    return { success: true }
  })
}

/**
 * Create a first objective from the wizard.
 *
 * @description Creates a minimal objective with just a title and optional
 * target date. No tasks, playbooks, or privacy settings.
 *
 * @param title - Objective title
 * @param targetDate - Optional ISO date string for the target date
 */
export async function createWizardObjective(
  title: string,
  targetDate?: string
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const trimmedTitle = title.trim()
    // VALIDATION: Server-side length guard (client maxLength=200)
    if (!trimmedTitle || trimmedTitle.length > 200) {
      return { error: 'Objective title must be 1–200 characters' }
    }
    // VALIDATION: targetDate must be ISO date if provided
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return { error: 'Invalid target date format' }
    }

    const { error } = await supabase
      .from('objectives')
      .insert({
        title: trimmedTitle,
        foundry_id: foundryId,
        creator_id: user.id,
        status: 'active',
        ...(targetDate ? { end_date: targetDate } : {}),
      })

    if (error) {
      console.error('[SetupWizard] Failed to create objective:', error.message)
      return { error: 'Failed to create objective' }
    }

    revalidatePath('/objectives')
    revalidatePath('/today')
    return { success: true }
  })
}
