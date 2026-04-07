'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clearFoundryCache } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'

/**
 * Switch the current user's active foundry/workspace.
 * Validates that the user has a membership in the target foundry.
 * Updates both active_foundry_id and the legacy foundry_id + role for backward compatibility.
 */
export async function switchFoundry(foundryId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Use the database function to switch foundry (validates membership internally)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .rpc('switch_active_foundry', {
      p_user_id: user.id,
      p_foundry_id: foundryId,
    })

  if (error) {
    console.error('Failed to switch foundry:', error)
    return { success: false, error: 'Failed to switch workspace' }
  }

  if (data === false) {
    return { success: false, error: 'You do not have access to this workspace' }
  }

  // Clear the foundry cache so subsequent requests use the new foundry
  clearFoundryCache(user.id)

  // Revalidate all paths since foundry context affects everything
  revalidatePath('/', 'layout')

  return { success: true }
}

/**
 * Get the count of foundries a user belongs to.
 * Used for post-login routing decisions.
 */
export async function getFoundryCount(): Promise<number> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  // SECURITY: Use admin client for foundry_memberships count — RLS depends on
  // get_my_foundry_id() which can return NULL for new accounts, causing count=0
  // and breaking post-login routing. User identity is already verified above.
  let queryClient: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>
  try {
    queryClient = createAdminClient()
  } catch {
    queryClient = supabase
  }

  const { count, error } = await queryClient
    .from('foundry_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (error) {
    console.error('Failed to count foundries:', error)
    return 0
  }

  return count || 0
}
