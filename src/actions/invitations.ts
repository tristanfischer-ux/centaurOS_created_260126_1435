'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sendInvitationEmail } from '@/lib/notifications/channels/email'
import type { Database } from '@/types/database.types'

type MemberRole = Database['public']['Enums']['member_role']

// Get the base URL for invitation links
function getBaseUrl(): string {
  // In production, use NEXT_PUBLIC_APP_URL or VERCEL_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  // Development fallback
  return 'http://localhost:3000'
}

// Default invitation expiration: 7 days
const INVITATION_EXPIRY_DAYS = 7

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Create a new invitation to join a foundry
 * Only Founders and Executives can invite new members
 */
export async function createInvitation(
  email: string,
  role: MemberRole,
  customMessage?: string
): Promise<{ success: boolean; invitation?: { id: string; token: string }; error?: string }> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }
  
  // Get current user's foundry and role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()
  
  if (profileError || !profile) {
    return { success: false, error: 'Failed to verify permissions' }
  }
  
  // Only Founders and Executives can invite
  if (profile.role !== 'Founder' && profile.role !== 'Executive') {
    return { success: false, error: 'Only Founders and Executives can invite team members' }
  }
  
  // Get the foundry UUID from the foundry_id
  // The foundry_id in profiles is a text field that may be a UUID or a string like "centaur-guild"
  const { data: foundry, error: foundryError } = await supabase
    .from('foundries')
    .select('id, name')
    .eq('id', profile.foundry_id)
    .single()
  
  if (foundryError || !foundry) {
    return { success: false, error: 'Your company/foundry is not properly set up. Please contact support.' }
  }
  
  // Check if there's already a pending invitation for this email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingInvitation } = await (supabase as any)
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
  
  // Generate token and expiry
  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS)
  
  // Create the invitation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invitation, error: inviteError } = await (supabase as any)
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
    console.error('Failed to create invitation:', inviteError)
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
  
  revalidatePath('/team')
  
  return { 
    success: true, 
    invitation: { id: invitation.id, token: invitation.token }
  }
}

/**
 * Get invitation details by token (public - for accepting invitations)
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
  
  // Use the database function to get invitation details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
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
 * Accept an invitation and join the foundry
 * Can be called by:
 * 1. A logged-in user who wants to join a different foundry
 * 2. A new user during signup (with token in URL)
 */
export async function acceptInvitation(token: string): Promise<{
  success: boolean
  error?: string
  redirectTo?: string
}> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // User not logged in - redirect to signup with token
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
  
  // Verify the invitation email matches the user's email
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return { 
      success: false, 
      error: `This invitation was sent to ${invitation.email}. Please log in with that email address.`
    }
  }
  
  // Update the user's profile to join the new foundry
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      foundry_id: invitation.foundryId,
      role: invitation.role,
    })
    .eq('id', user.id)
  
  if (updateError) {
    console.error('Failed to update profile:', updateError)
    return { success: false, error: 'Failed to join company' }
  }
  
  // Mark the invitation as accepted
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: acceptError } = await (supabase as any)
    .from('company_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('token', token)
  
  if (acceptError) {
    console.error('Failed to mark invitation as accepted:', acceptError)
    // Don't fail - the user has already been added to the foundry
  }
  
  revalidatePath('/', 'layout')
  
  return { 
    success: true,
    redirectTo: '/dashboard'
  }
}

/**
 * Accept an invitation during signup (creates new user and joins foundry)
 */
export async function signupWithInvitation(formData: FormData): Promise<void> {
  const supabase = await createClient()
  
  const token = formData.get('token') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('name') as string
  
  if (!token || !email || !password || !fullName) {
    redirect(`/invite/${token}?error=All fields are required`)
  }
  
  // Get invitation details
  const inviteResult = await getInvitationByToken(token)
  if (!inviteResult.valid || !inviteResult.invitation) {
    redirect(`/invite/${token}?error=${encodeURIComponent(inviteResult.error || 'Invalid invitation')}`)
  }
  
  const invitation = inviteResult.invitation
  
  // Verify email matches
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
    console.error('Signup error:', authError)
    redirect(`/invite/${token}?error=${encodeURIComponent(authError.message)}`)
  }
  
  if (!authData.user) {
    redirect(`/invite/${token}?error=Failed to create account`)
  }
  
  // Create profile in the invited foundry
  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    email,
    full_name: fullName,
    role: invitation.role,
    foundry_id: invitation.foundryId,
  })
  
  if (profileError) {
    console.error('Profile creation error:', profileError)
  }
  
  // Mark invitation as accepted
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('company_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: authData.user.id,
    })
    .eq('token', token)
  
  revalidatePath('/', 'layout')
  redirect('/join/success?type=invitation')
}

/**
 * List all pending invitations for the current foundry
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
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
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
    console.error('Failed to list invitations:', error)
    return { invitations: [], error: 'Failed to load invitations' }
  }
  
  const invitations = (data || []).map((inv) => {
    let status: 'pending' | 'expired' | 'accepted' = 'pending'
    if (inv.accepted_at) {
      status = 'accepted'
    } else if (new Date(inv.expires_at) < new Date()) {
      status = 'expired'
    }
    
    return {
      id: inv.id,
      email: inv.email,
      role: inv.role as MemberRole,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invitedByName: (inv.profiles as any)?.full_name || 'Unknown',
      createdAt: inv.created_at,
      expiresAt: inv.expires_at,
      status,
    }
  })
  
  return { invitations }
}

/**
 * Resend an invitation (generates a new token and extends expiry)
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
  
  // Get the existing invitation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invitation, error: fetchError } = await (supabase as any)
    .from('company_invitations')
    .select('id, accepted_at')
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
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('company_invitations')
    .update({
      token: newToken,
      expires_at: newExpiry.toISOString(),
    })
    .eq('id', invitationId)
  
  if (updateError) {
    return { success: false, error: 'Failed to resend invitation' }
  }
  
  revalidatePath('/team')
  
  return { success: true }
}

/**
 * Cancel/delete an invitation
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
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('company_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('foundry_id', foundryId)
  
  if (error) {
    return { success: false, error: 'Failed to cancel invitation' }
  }
  
  revalidatePath('/team')
  
  return { success: true }
}
