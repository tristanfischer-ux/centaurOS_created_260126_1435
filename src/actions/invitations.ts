'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sendInvitationEmail } from '@/lib/notifications/channels/email'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { getBaseUrl } from '@/lib/domains'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'
import { getFoundryTier } from '@/lib/ai/limit-check'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { Database } from '@/types/database.types'

type MemberRole = Database['public']['Enums']['member_role']

/** Default invitation expiration: 7 days */
const INVITATION_EXPIRY_DAYS = 7

/**
 * Generate a cryptographically secure random token.
 *
 * @returns A 32-character hex string (128 bits of entropy)
 */
function generateToken(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Create a new invitation to join a foundry.
 * Only Founders and Executives can invite new members.
 *
 * @param email - Email address to invite
 * @param role - Role to assign the invitee
 * @param customMessage - Optional personal message included in the email
 * @returns Success status with invitation details or error
 *
 * @security Requires authenticated Founder or Executive
 * @audit Sends invitation email and creates DB record
 */
export async function createInvitation(
  email: string,
  role: MemberRole,
  customMessage?: string
): Promise<{ success: boolean; invitation?: { id: string; token: string }; error?: string }> {
  const supabase = await createClient()
  
  // AUTH: Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  // SECURITY: Rate limit invitation emails to prevent spam
  const rateLimitError = await checkRateLimit('emailInvite', `invite:${user.id}`)
  if (rateLimitError) return { success: false, error: rateLimitError }
  
  // AUTH: Get current user's foundry and role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()
  
  if (profileError || !profile) {
    return { success: false, error: 'Failed to verify permissions' }
  }
  
  // AUTH: Only Founders and Executives can invite
  if (profile.role !== 'Founder' && profile.role !== 'Executive') {
    return { success: false, error: 'Only Founders and Executives can invite team members' }
  }
  
  // DECISION: Use admin client for the foundries lookup to bypass RLS.
  // The foundries SELECT policy depends on get_my_foundry_id() which calls
  // is_active on profiles — this can return NULL for newly-created accounts
  // due to function caching or timing issues with the SECURITY DEFINER function.
  // Since we've already verified the user's identity and role above, using
  // the admin client here is safe and avoids a class of RLS edge-case bugs.
  let foundry: { id: string; name: string } | null = null
  try {
    const adminSupabase = createAdminClient()
    const { data, error: foundryError } = await adminSupabase
      .from('foundries')
      .select('id, name')
      .eq('id', profile.foundry_id)
      .single()

    if (foundryError || !data) {
      console.error('[Invitations] Foundry lookup failed:', {
        foundryId: profile.foundry_id,
        userId: user.id,
        error: foundryError?.message,
      })
      return { success: false, error: 'Your company/foundry is not properly set up. Please contact support.' }
    }
    foundry = data
  } catch (adminError) {
    // GOTCHA: If admin client is unavailable (missing service role key in dev),
    // fall back to the user's client. This preserves backward compatibility.
    console.warn('[Invitations] Admin client unavailable, falling back to user client:', adminError)
    const { data, error: foundryError } = await supabase
      .from('foundries')
      .select('id, name')
      .eq('id', profile.foundry_id)
      .single()

    if (foundryError || !data) {
      console.error('[Invitations] Foundry lookup failed (fallback):', {
        foundryId: profile.foundry_id,
        userId: user.id,
        error: foundryError?.message,
      })
      return { success: false, error: 'Your company/foundry is not properly set up. Please contact support.' }
    }
    foundry = data
  }
  
  // Check if there's already a pending invitation for this email
  const { data: existingInvitation } = await supabase
    .from('company_invitations')
    .select('id, expires_at, accepted_at')
    .eq('foundry_id', foundry.id)
    .eq('email', email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  
  if (existingInvitation) {
    return { success: false, error: 'An active invitation already exists for this email address' }
  }
  
  // Check if user is already a member of this foundry
  const { data: existingMember } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .eq('foundry_id', profile.foundry_id)
    .single()
  
  if (existingMember) {
    return { success: false, error: 'This person is already a member of your company' }
  }

  // SECURITY: Enforce team member limit based on subscription tier
  const tier = await getFoundryTier(foundry.id)
  const plan = SUBSCRIPTION_PLANS[tier]
  const maxMembers = plan.limits.maxTeamMembers

  if (maxMembers !== undefined) {
    // Count current members (profiles in this foundry) + pending invitations
    const { count: memberCount, error: countError } = await supabase
      .from('foundry_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundry.id)

    if (countError) {
      console.error('[Invitations] Failed to count team members:', {
        foundryId: foundry.id,
        error: countError.message,
      })
      return { success: false, error: 'Failed to verify team member limit' }
    }

    // Also count pending (non-expired, non-accepted) invitations
    const { count: pendingCount } = await supabase
      .from('company_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundry.id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())

    const totalCommitted = (memberCount || 0) + (pendingCount || 0)

    if (totalCommitted >= maxMembers) {
      return {
        success: false,
        error: `Team member limit reached for your ${plan.name} plan (${maxMembers} members). Upgrade to add more members.`,
      }
    }
  }

  // Generate token and expiry
  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS)
  
  // Create the invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('company_invitations')
    .insert({
      foundry_id: foundry.id,
      email: email.toLowerCase(),
      role,
      token,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token')
    .single()
  
  if (inviteError) {
    console.error('[Invitations] Failed to create invitation:', {
      foundryId: foundry.id,
      email: email.toLowerCase(),
      error: inviteError.message,
    })
    return { success: false, error: 'Failed to create invitation' }
  }
  
  // Get inviter's name for the email
  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  
  // Send invitation email
  const inviteUrl = `${getBaseUrl()}/invite/${token}`
  await sendInvitationEmail({
    to: email.toLowerCase(),
    foundryName: foundry.name,
    role,
    invitedByName: inviterProfile?.full_name || 'A team member',
    inviteUrl,
    expiresAt: expiresAt.toISOString(),
    customMessage,
  })

  // AUDIT: Log invitation
  logAudit({
    action: 'user.invited',
    entityType: 'invitation',
    entityId: invitation.id,
    metadata: { email: email.toLowerCase(), role },
    userId: user.id,
    foundryId: foundry.id,
  })

  revalidatePath('/team')

  return {
    success: true,
    invitation: { id: invitation.id, token: invitation.token }
  }
}

/**
 * Get invitation details by token (public - for accepting invitations).
 * Uses a SECURITY DEFINER DB function to bypass RLS for public token lookups.
 *
 * @param token - The invitation token from the URL
 * @returns Invitation details if valid, or error
 */
export async function getInvitationByToken(token: string): Promise<{
  valid: boolean
  invitation?: {
    id: string
    foundryId: string
    foundryName: string
    email: string
    role: MemberRole
    invitedByName: string
    expiresAt: string
  }
  error?: string
}> {
  const supabase = await createClient()
  
  // Use the SECURITY DEFINER database function to get invitation details
  const { data, error } = await supabase
    .rpc('get_invitation_by_token', { invitation_token: token })
    .single()
  
  if (error || !data) {
    return { valid: false, error: 'Invitation not found' }
  }
  
  if (!data.is_valid) {
    return { valid: false, error: 'This invitation has expired or already been used' }
  }
  
  return {
    valid: true,
    invitation: {
      id: data.id,
      foundryId: data.foundry_id,
      foundryName: data.foundry_name,
      email: data.email,
      role: data.role,
      invitedByName: data.invited_by_name,
      expiresAt: data.expires_at,
    }
  }
}

/**
 * Accept an invitation and join the foundry.
 *
 * @description Called by a logged-in user to accept a pending invitation.
 * Creates a foundry membership, updates the user's active foundry, and
 * marks the invitation as accepted.
 *
 * @param token - The invitation token
 * @returns Success status with redirect URL, or error
 *
 * @security Verifies the authenticated user's email matches the invitation
 */
export async function acceptInvitation(token: string): Promise<{
  success: boolean
  error?: string
  redirectTo?: string
}> {
  const supabase = await createClient()
  
  // AUTH: Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { 
      success: false, 
      error: 'Please sign up or log in first',
      redirectTo: `/invite/${token}`
    }
  }
  
  // Get invitation details
  const inviteResult = await getInvitationByToken(token)
  if (!inviteResult.valid || !inviteResult.invitation) {
    return { success: false, error: inviteResult.error || 'Invalid invitation' }
  }
  
  const invitation = inviteResult.invitation
  
  // SECURITY: Verify the invitation email matches the user's email
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return {
      success: false,
      error: `This invitation was sent to ${invitation.email}. Please log in with that email address.`
    }
  }

  // SECURITY: Enforce team member limit at acceptance time (double-check)
  const acceptTier = await getFoundryTier(invitation.foundryId)
  const acceptPlan = SUBSCRIPTION_PLANS[acceptTier]
  const acceptMaxMembers = acceptPlan.limits.maxTeamMembers

  if (acceptMaxMembers !== undefined) {
    const { count: currentMembers } = await supabase
      .from('foundry_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', invitation.foundryId)

    if ((currentMembers || 0) >= acceptMaxMembers) {
      return {
        success: false,
        error: `This company has reached its team member limit. Ask the team admin to upgrade their plan.`,
      }
    }
  }

  // Add user to the foundry via foundry_memberships (supports multi-foundry)
  const { error: membershipError } = await supabase
    .from('foundry_memberships')
    .upsert({
      user_id: user.id,
      foundry_id: invitation.foundryId,
      role: invitation.role,
      is_primary: false,
      joined_at: new Date().toISOString(),
    }, { onConflict: 'user_id,foundry_id' })

  if (membershipError) {
    console.error('[Invitations] Failed to create membership:', {
      userId: user.id,
      foundryId: invitation.foundryId,
      error: membershipError.message,
    })
    return { success: false, error: 'Failed to join company' }
  }

  // Set as active foundry and update legacy fields for backward compatibility
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      active_foundry_id: invitation.foundryId,
      foundry_id: invitation.foundryId,
      role: invitation.role,
    })
    .eq('id', user.id)
  
  if (updateError) {
    console.error('[Invitations] Failed to update profile:', {
      userId: user.id,
      error: updateError.message,
    })
    // Non-fatal - membership was already created
  }
  
  // Mark the invitation as accepted (RLS policy allows invited user to update own invitation)
  const { error: acceptError } = await supabase
    .from('company_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('token', token)
  
  if (acceptError) {
    console.error('[Invitations] Failed to mark invitation as accepted:', {
      token,
      error: acceptError.message,
    })
    // Non-fatal - the user has already been added to the foundry
  }
  
  revalidatePath('/', 'layout')
  
  return { 
    success: true,
    redirectTo: '/updates'
  }
}

/**
 * Accept an invitation during signup (creates new user and joins foundry).
 *
 * @description Handles the full signup-via-invitation flow: creates auth user,
 * creates profile, creates foundry membership, and marks invitation accepted.
 * Redirects to error page if profile creation fails (prevents orphaned auth accounts).
 *
 * @param formData - Form data with token, email, password, name
 *
 * @security Verifies email matches invitation before creating account
 */
export async function signupWithInvitation(formData: FormData): Promise<void> {
  const supabase = await createClient()
  
  const token = formData.get('token') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('name') as string
  
  // VALIDATION: All fields required
  if (!token || !email || !password || !fullName) {
    redirect(`/invite/${token}?error=All fields are required`)
  }
  
  // Get invitation details
  const inviteResult = await getInvitationByToken(token)
  if (!inviteResult.valid || !inviteResult.invitation) {
    redirect(`/invite/${token}?error=${encodeURIComponent(inviteResult.error || 'Invalid invitation')}`)
  }
  
  const invitation = inviteResult.invitation
  
  // SECURITY: Verify email matches
  if (email.toLowerCase() !== invitation.email.toLowerCase()) {
    redirect(`/invite/${token}?error=${encodeURIComponent(`This invitation was sent to ${invitation.email}`)}`)
  }
  
  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: invitation.role,
      },
    },
  })
  
  if (authError) {
    console.error('[Invitations] Signup error:', {
      email,
      error: authError.message,
    })
    redirect(`/invite/${token}?error=${encodeURIComponent(sanitizeErrorMessage(authError))}`)
  }
  
  if (!authData.user) {
    redirect(`/invite/${token}?error=Failed to create account`)
  }
  
  const newUserId = authData.user.id
  
  // Create profile in the invited foundry
  const { error: profileError } = await supabase.from('profiles').insert({
    id: newUserId,
    email,
    full_name: fullName,
    role: invitation.role,
    foundry_id: invitation.foundryId,
    active_foundry_id: invitation.foundryId,
  })
  
  if (profileError) {
    console.error('[Invitations] Profile creation failed:', {
      userId: newUserId,
      email,
      foundryId: invitation.foundryId,
      error: profileError.message,
    })
    // SECURITY: Clean up the orphaned auth account to prevent a broken state
    await supabase.auth.admin.deleteUser(newUserId).catch((deleteErr) => {
      console.error('[Invitations] Failed to clean up orphaned auth user:', {
        userId: newUserId,
        error: deleteErr instanceof Error ? deleteErr.message : 'Unknown error',
      })
    })
    redirect(`/invite/${token}?error=${encodeURIComponent('Failed to create your profile. Please try again.')}`)
  }

  // Create foundry membership record
  const { error: membershipError } = await supabase
    .from('foundry_memberships')
    .insert({
      user_id: newUserId,
      foundry_id: invitation.foundryId,
      role: invitation.role,
      is_primary: true,
      joined_at: new Date().toISOString(),
    })

  if (membershipError) {
    console.error('[Invitations] Failed to create membership during signup:', {
      userId: newUserId,
      foundryId: invitation.foundryId,
      error: membershipError.message,
    })
    // Non-fatal: profile exists, user can still log in. Membership can be fixed manually.
  }
  
  // Mark invitation as accepted
  const { error: acceptError } = await supabase
    .from('company_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: newUserId,
    })
    .eq('token', token)

  if (acceptError) {
    console.error('[Invitations] Failed to mark invitation accepted during signup:', {
      token,
      error: acceptError.message,
    })
    // Non-fatal: user is already created and in the foundry
  }
  
  revalidatePath('/', 'layout')
  redirect('/join/success?type=invitation')
}

/**
 * List all pending invitations for the current foundry.
 *
 * @returns Array of invitations with status (pending/expired/accepted)
 *
 * @security Requires authenticated user in a foundry (RLS enforces Founder/Executive)
 */
export async function listInvitations(): Promise<{
  invitations: Array<{
    id: string
    email: string
    role: MemberRole
    invitedByName: string
    createdAt: string
    expiresAt: string
    status: 'pending' | 'expired' | 'accepted'
  }>
  error?: string
}> {
  const supabase = await createClient()
  
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { invitations: [], error: 'Not in a foundry' }
  }
  
  const { data, error } = await supabase
    .from('company_invitations')
    .select(`
      id,
      email,
      role,
      created_at,
      expires_at,
      accepted_at,
      invited_by,
      profiles!company_invitations_invited_by_fkey(full_name)
    `)
    .eq('foundry_id', foundryId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('[Invitations] Failed to list invitations:', {
      foundryId,
      error: error.message,
    })
    return { invitations: [], error: 'Failed to load invitations' }
  }
  
  const invitations = (data || []).map((inv) => {
    let status: 'pending' | 'expired' | 'accepted' = 'pending'
    if (inv.accepted_at) {
      status = 'accepted'
    } else if (new Date(inv.expires_at) < new Date()) {
      status = 'expired'
    }
    
    // The join returns profiles as an object with full_name
    const inviterProfile = inv.profiles as unknown as { full_name: string } | null
    
    return {
      id: inv.id,
      email: inv.email,
      role: inv.role,
      invitedByName: inviterProfile?.full_name || 'Unknown',
      createdAt: inv.created_at ?? '',
      expiresAt: inv.expires_at,
      status,
    }
  })
  
  return { invitations }
}

/**
 * Resend an invitation with a new token and extended expiry.
 *
 * @description Generates a fresh token, extends the expiry by 7 days,
 * and sends a new invitation email to the recipient.
 *
 * @param invitationId - The invitation UUID to resend
 * @returns Success status or error
 *
 * @security Requires authenticated user in the same foundry (RLS enforced)
 */
export async function resendInvitation(invitationId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }
  
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { success: false, error: 'Not in a foundry' }
  }
  
  // Get the existing invitation with all fields needed for the email
  const { data: invitation, error: fetchError } = await supabase
    .from('company_invitations')
    .select('id, email, role, accepted_at')
    .eq('id', invitationId)
    .eq('foundry_id', foundryId)
    .single()
  
  if (fetchError || !invitation) {
    return { success: false, error: 'Invitation not found' }
  }
  
  if (invitation.accepted_at) {
    return { success: false, error: 'This invitation has already been accepted' }
  }
  
  // Generate new token and extend expiry
  const newToken = generateToken()
  const newExpiry = new Date()
  newExpiry.setDate(newExpiry.getDate() + INVITATION_EXPIRY_DAYS)
  
  const { error: updateError } = await supabase
    .from('company_invitations')
    .update({
      token: newToken,
      expires_at: newExpiry.toISOString(),
    })
    .eq('id', invitationId)
  
  if (updateError) {
    console.error('[Invitations] Failed to update invitation for resend:', {
      invitationId,
      error: updateError.message,
    })
    return { success: false, error: 'Failed to resend invitation' }
  }

  // DECISION: Use admin client for foundry name lookup (same RLS bypass as createInvitation)
  let foundryName = 'Your company'
  try {
    const adminSupabase = createAdminClient()
    const { data: foundryData } = await adminSupabase
      .from('foundries')
      .select('name')
      .eq('id', foundryId)
      .single()
    if (foundryData) foundryName = foundryData.name
  } catch {
    // Fallback to user client
    const { data: foundryData } = await supabase
      .from('foundries')
      .select('name')
      .eq('id', foundryId)
      .single()
    if (foundryData) foundryName = foundryData.name
  }

  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Send the invitation email with the new token
  const inviteUrl = `${getBaseUrl()}/invite/${newToken}`
  await sendInvitationEmail({
    to: invitation.email,
    foundryName,
    role: invitation.role,
    invitedByName: inviterProfile?.full_name || 'A team member',
    inviteUrl,
    expiresAt: newExpiry.toISOString(),
  })
  
  revalidatePath('/team')
  
  return { success: true }
}

/**
 * Cancel/delete an invitation.
 *
 * @param invitationId - The invitation UUID to cancel
 * @returns Success status or error
 *
 * @security Requires authenticated user in the same foundry (RLS enforced)
 */
export async function cancelInvitation(invitationId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }
  
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { success: false, error: 'Not in a foundry' }
  }
  
  const { error } = await supabase
    .from('company_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('foundry_id', foundryId)
  
  if (error) {
    console.error('[Invitations] Failed to cancel invitation:', {
      invitationId,
      foundryId,
      error: error.message,
    })
    return { success: false, error: 'Failed to cancel invitation' }
  }
  
  revalidatePath('/team')
  
  return { success: true }
}
