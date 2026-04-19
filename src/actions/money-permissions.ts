'use server'

/**
 * Money Permissions server actions.
 *
 * Powers /money/settings/permissions — Founder-only view that lists every
 * member of the foundry plus any per-user permission_override exceptions to
 * the role default. Founders grant or revoke time-boxed capability overrides
 * here.
 *
 * The 5-value member_role enum coarse-compiles the planned 9-role matrix
 * (per MONEY-SCHEMA §0.1 + §4 Option A). permission_override is the escape
 * valve that closes the gap until the enum-expansion PR lands.
 *
 * Authorisation is enforced in two layers:
 *   1. Server-side guard here: the calling user must hold the Founder role
 *      in the active foundry (no override can grant access to this surface).
 *   2. Postgres RLS on permission_override: Founder-only writes per the
 *      permission_override_founder_write policy (Chunk 1F migration).
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import type { Database } from '@/types/database.types'

type MemberRole = Database['public']['Enums']['member_role']

export type PermissionCapability =
  | 'raise_read'
  | 'raise_write'
  | 'raise_lock'
  | 'raise_send_update'
  | 'plan_read'
  | 'plan_write'
  | 'plan_lock'
  | 'cockpit_read'
  | 'xero_connect'
  | 'xero_disconnect'
  | 'credits_read'
  | 'credits_budget_edit'
  | 'settings_read'
  | 'settings_write'
  | 'permissions_edit'
  | 'audit_read'
  | 'audit_export'

export const PERMISSION_CAPABILITIES: readonly PermissionCapability[] = [
  'raise_read',
  'raise_write',
  'raise_lock',
  'raise_send_update',
  'plan_read',
  'plan_write',
  'plan_lock',
  'cockpit_read',
  'xero_connect',
  'xero_disconnect',
  'credits_read',
  'credits_budget_edit',
  'settings_read',
  'settings_write',
  'permissions_edit',
  'audit_read',
  'audit_export',
] as const

export type PermissionOverrideRow = {
  id: string
  capability: PermissionCapability
  granted: boolean
  expires_at: string | null
  reason: string | null
  granted_by_user_id: string | null
  created_at: string
}

export type MemberWithOverrides = {
  membership_id: string
  user_id: string
  role: MemberRole
  active: boolean
  is_primary: boolean | null
  joined_at: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
  overrides: PermissionOverrideRow[]
}

export type ListMembersResult =
  | { error: string }
  | { members: MemberWithOverrides[]; viewerIsFounder: true }

function coerceCapability(raw: string): PermissionCapability | null {
  return (PERMISSION_CAPABILITIES as readonly string[]).includes(raw)
    ? (raw as PermissionCapability)
    : null
}

/**
 * Server-side Founder guard. Returns the role of the caller in the active
 * foundry, or null if no membership / not active.
 */
async function getCallerFoundryRole(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  userId: string,
  foundryId: string,
): Promise<MemberRole | null> {
  const { data, error } = await supabase
    .from('foundry_memberships')
    .select('role, active')
    .eq('user_id', userId)
    .eq('foundry_id', foundryId)
    .maybeSingle()
  if (error || !data || !data.active) return null
  return data.role
}

/**
 * Lists every member of the active foundry plus their permission overrides.
 * Founder-only. Returns { error } for non-founders rather than partial data.
 */
export async function listMembersWithOverrides(): Promise<ListMembersResult> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const role = await getCallerFoundryRole(supabase, user.id, foundryId)
    if (role !== 'Founder') {
      return { error: 'Only founders can view foundry permissions' }
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('foundry_memberships')
      .select('id, user_id, role, active, is_primary, joined_at')
      .eq('foundry_id', foundryId)
      .order('role', { ascending: true })
      .order('joined_at', { ascending: true })

    if (membershipError) return { error: membershipError.message }
    if (!memberships || memberships.length === 0) {
      return { members: [], viewerIsFounder: true as const }
    }

    const userIds = memberships.map((m) => m.user_id)

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', userIds)

    if (profilesError) return { error: profilesError.message }

    const profileById = new Map<string, { full_name: string | null; email: string | null; avatar_url: string | null }>()
    for (const p of profiles ?? []) {
      profileById.set(p.id, {
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        avatar_url: p.avatar_url ?? null,
      })
    }

    const { data: overrides, error: overridesError } = await supabase
      .from('permission_override')
      .select('id, user_id, capability, granted, expires_at, reason, granted_by_user_id, created_at')
      .eq('foundry_id', foundryId)
      .in('user_id', userIds)
      .order('created_at', { ascending: false })

    if (overridesError) return { error: overridesError.message }

    const overridesByUser = new Map<string, PermissionOverrideRow[]>()
    for (const raw of overrides ?? []) {
      const cap = coerceCapability(raw.capability)
      if (!cap) continue
      const list = overridesByUser.get(raw.user_id) ?? []
      list.push({
        id: raw.id,
        capability: cap,
        granted: raw.granted,
        expires_at: raw.expires_at,
        reason: raw.reason,
        granted_by_user_id: raw.granted_by_user_id,
        created_at: raw.created_at,
      })
      overridesByUser.set(raw.user_id, list)
    }

    const members: MemberWithOverrides[] = memberships.map((m) => {
      const profile = profileById.get(m.user_id) ?? {
        full_name: null,
        email: null,
        avatar_url: null,
      }
      return {
        membership_id: m.id,
        user_id: m.user_id,
        role: m.role,
        active: m.active,
        is_primary: m.is_primary,
        joined_at: m.joined_at,
        full_name: profile.full_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        overrides: overridesByUser.get(m.user_id) ?? [],
      }
    })

    return { members, viewerIsFounder: true as const }
  })
}

/**
 * Grant a capability override to a foundry member. Optional expiry time-boxes
 * the grant. Inserts (or updates the existing row, since (foundry_id, user_id,
 * capability) is unique) with granted = true.
 */
export async function grantCapabilityOverride(
  userId: string,
  capability: string,
  expiresAt?: string | null,
  reason?: string | null,
): Promise<{ success: true; id: string } | { error: string }> {
  const cap = coerceCapability(capability)
  if (!cap) return { error: `Unknown capability: ${capability}` }

  if (!userId || typeof userId !== 'string') {
    return { error: 'A valid user id is required' }
  }

  let normalisedExpiry: string | null = null
  if (expiresAt) {
    const d = new Date(expiresAt)
    if (Number.isNaN(d.getTime())) return { error: 'Expiry must be a valid date' }
    if (d.getTime() <= Date.now()) {
      return { error: 'Expiry must be in the future' }
    }
    normalisedExpiry = d.toISOString()
  }

  return withAuth(async ({ supabase, foundryId, user }) => {
    const role = await getCallerFoundryRole(supabase, user.id, foundryId)
    if (role !== 'Founder') {
      return { error: 'Only founders can grant capability overrides' }
    }

    // Ensure the target user is actually a member of this foundry.
    const { data: target } = await supabase
      .from('foundry_memberships')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!target) return { error: 'Target user is not a member of this foundry' }

    const { data, error } = await supabase
      .from('permission_override')
      .upsert(
        {
          foundry_id: foundryId,
          user_id: userId,
          capability: cap,
          granted: true,
          granted_by_user_id: user.id,
          reason: reason ?? null,
          expires_at: normalisedExpiry,
        },
        { onConflict: 'foundry_id,user_id,capability' },
      )
      .select('id')
      .single()

    if (error || !data) return { error: error?.message ?? 'Failed to grant override' }

    revalidatePath('/money/settings/permissions')
    return { success: true as const, id: data.id }
  })
}

/**
 * Revoke (delete) a capability override row by id.
 */
export async function revokeCapabilityOverride(
  overrideId: string,
): Promise<{ success: true } | { error: string }> {
  if (!overrideId) return { error: 'Override id is required' }

  return withAuth(async ({ supabase, foundryId, user }) => {
    const role = await getCallerFoundryRole(supabase, user.id, foundryId)
    if (role !== 'Founder') {
      return { error: 'Only founders can revoke capability overrides' }
    }

    const { error } = await supabase
      .from('permission_override')
      .delete()
      .eq('id', overrideId)
      .eq('foundry_id', foundryId)

    if (error) return { error: error.message }

    revalidatePath('/money/settings/permissions')
    return { success: true as const }
  })
}
