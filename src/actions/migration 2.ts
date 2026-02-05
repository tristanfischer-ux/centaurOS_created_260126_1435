"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin/access"
import { createClient } from "@/lib/supabase/server"
import {
  getMigrationStats as getStats,
  getMigrationQueue as getQueue,
  sendMigrationInvitation,
  archiveUnmigratedListing as archive,
  createMigrationRecord,
  processMigrationSignup as processSignup
} from "@/lib/migration/service"
import { logAdminAction } from "@/actions/admin"
import { 
  MigrationStats, 
  MigrationRecordWithListing,
  MigrationStatus,
  MigrationQueueFilters
} from "@/types/migration"

// ==========================================
// PUBLIC ACTIONS (No admin required)
// ==========================================

/**
 * Complete migration signup - called when a provider finishes signup
 * This is used by the provider signup flow
 */
export async function completeMigrationSignup(
  listingId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Process the signup
    const result = await processSignup({
      listingId,
      userId: user.id
    })
    
    if (!result.success) {
      return result
    }
    
    revalidatePath('/marketplace')
    revalidatePath('/provider-portal')
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error completing migration signup:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to complete signup'
    }
  }
}

// ==========================================
// ADMIN ACTIONS (Require admin access)
// ==========================================

/**
 * Get migration statistics for the admin dashboard
 */
export async function getMigrationStats(): Promise<{
  data: MigrationStats | null
  error: string | null
}> {
  try {
    await requireAdmin()
    return await getStats()
  } catch (err) {
    console.error('Error fetching migration stats:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to fetch migration stats'
    }
  }
}

/**
 * Get the migration queue with optional filters
 */
export async function getMigrationQueue(
  filters?: MigrationQueueFilters
): Promise<{
  data: MigrationRecordWithListing[]
  total: number
  error: string | null
}> {
  try {
    await requireAdmin()
    return await getQueue(filters)
  } catch (err) {
    console.error('Error fetching migration queue:', err)
    return {
      data: [],
      total: 0,
      error: err instanceof Error ? err.message : 'Failed to fetch migration queue'
    }
  }
}

/**
 * Resend migration invitation email
 */
export async function resendMigrationInvite(
  listingId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    
    // Get listing info for audit log
    const { data: migration } = await supabase
      .from('listing_migration')
      .select('*, listing:marketplace_listings(title)')
      .eq('listing_id', listingId)
      .single()
    
    // Send the invitation
    const result = await sendMigrationInvitation(listingId)
    
    if (result.success) {
      // Log the action
      await logAdminAction(
        'resend_migration_invite',
        'listing_migration',
        listingId,
        { status: migration?.status },
        { status: 'invited', invitation_sent_at: new Date().toISOString() }
      )
      
      revalidatePath('/admin/migration')
    }
    
    return result
  } catch (err) {
    console.error('Error resending migration invite:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to resend invitation'
    }
  }
}

/**
 * Force migrate a listing by manually linking it to a provider
 */
export async function forceMigrateListing(
  listingId: string,
  providerId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    
    // Verify the provider exists
    const { data: provider, error: providerError } = await supabase
      .from('provider_profiles')
      .select('id, user_id, listing_id')
      .eq('id', providerId)
      .single()
    
    if (providerError || !provider) {
      return { success: false, error: 'Provider not found' }
    }
    
    if (provider.listing_id) {
      return { success: false, error: 'Provider already linked to a listing' }
    }
    
    // Get listing before state
    const { data: beforeState } = await supabase
      .from('listing_migration')
      .select('*')
      .eq('listing_id', listingId)
      .single()
    
    // Link the provider to the listing
    const { error: updateError } = await supabase
      .from('provider_profiles')
      .update({ listing_id: listingId })
      .eq('id', providerId)
    
    if (updateError) {
      throw updateError
    }
    
    // Update or create migration record
    if (beforeState) {
      const { error: migrationError } = await supabase
        .from('listing_migration')
        .update({
          status: 'completed',
          migration_completed_at: new Date().toISOString()
        })
        .eq('listing_id', listingId)
      
      if (migrationError) {
        throw migrationError
      }
    } else {
      await createMigrationRecord({ listingId })
      const { error: migrationError } = await supabase
        .from('listing_migration')
        .update({
          status: 'completed',
          migration_completed_at: new Date().toISOString()
        })
        .eq('listing_id', listingId)
      
      if (migrationError) {
        throw migrationError
      }
    }
    
    // Get after state
    const { data: afterState } = await supabase
      .from('listing_migration')
      .select('*')
      .eq('listing_id', listingId)
      .single()
    
    // Log the action
    await logAdminAction(
      'force_migrate_listing',
      'listing_migration',
      listingId,
      beforeState,
      afterState,
      `Manually linked to provider ${providerId}`
    )
    
    revalidatePath('/admin/migration')
    revalidatePath('/marketplace')
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error force migrating listing:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to force migrate listing'
    }
  }
}

/**
 * Archive an unmigrated listing
 */
export async function archiveUnmigratedListing(
  listingId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    
    // Get listing before state
    const { data: beforeState } = await supabase
      .from('marketplace_listings')
      .select('*')
      .eq('id', listingId)
      .single()
    
    const result = await archive(listingId)
    
    if (result.success) {
      // Get after state
      const { data: afterState } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('id', listingId)
        .single()
      
      // Log the action
      await logAdminAction(
        'archive_unmigrated_listing',
        'marketplace_listing',
        listingId,
        beforeState,
        afterState
      )
      
      revalidatePath('/admin/migration')
      revalidatePath('/marketplace')
    }
    
    return result
  } catch (err) {
    console.error('Error archiving listing:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to archive listing'
    }
  }
}

/**
 * Bulk send migration invites
 */
export async function bulkSendMigrationInvites(
  listingIds: string[]
): Promise<{
  sent: number
  failed: number
  errors: Array<{ listingId: string; error: string }>
}> {
  try {
    await requireAdmin()
    
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as Array<{ listingId: string; error: string }>
    }
    
    for (const listingId of listingIds) {
      const result = await sendMigrationInvitation(listingId)
      
      if (result.success) {
        results.sent++
      } else {
        results.failed++
        results.errors.push({ 
          listingId, 
          error: result.error || 'Unknown error' 
        })
      }
    }
    
    revalidatePath('/admin/migration')
    
    return results
  } catch (err) {
    console.error('Error bulk sending invites:', err)
    return {
      sent: 0,
      failed: listingIds.length,
      errors: listingIds.map(id => ({ 
        listingId: id, 
        error: err instanceof Error ? err.message : 'Failed to send invites'
      }))
    }
  }
}

/**
 * Update migration status manually
 */
export async function updateMigrationStatus(
  listingId: string,
  status: MigrationStatus
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    
    // Get before state
    const { data: beforeState } = await supabase
      .from('listing_migration')
      .select('*')
      .eq('listing_id', listingId)
      .single()
    
    // Update status
    const { data: afterState, error } = await supabase
      .from('listing_migration')
      .update({ status })
      .eq('listing_id', listingId)
      .select()
      .single()
    
    if (error) {
      throw error
    }
    
    // Log the action
    await logAdminAction(
      'update_migration_status',
      'listing_migration',
      listingId,
      beforeState,
      afterState,
      `Status changed to ${status}`
    )
    
    revalidatePath('/admin/migration')
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error updating migration status:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update status'
    }
  }
}

/**
 * Get migration candidates (listings not yet in migration queue)
 */
export async function getMigrationCandidates(): Promise<{
  data: Array<{
    id: string
    title: string
    category: string
    subcategory: string
    hasEmail: boolean
    email?: string
  }>
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()
    
    // Get all listings
    const { data: listings, error: listingsError } = await supabase
      .from('marketplace_listings')
      .select('id, title, category, subcategory, attributes')
    
    if (listingsError) {
      throw listingsError
    }
    
    // Get listings already in migration queue
    const { data: migrations } = await supabase
      .from('listing_migration')
      .select('listing_id')
    
    const migrationIds = new Set((migrations || []).map(m => m.listing_id))
    
    // Get listings with provider profiles
    const { data: providers } = await supabase
      .from('provider_profiles')
      .select('listing_id')
      .not('listing_id', 'is', null)
    
    const providerIds = new Set((providers || []).map(p => p.listing_id).filter(Boolean))
    
    // Filter to candidates
    const candidates = (listings || [])
      .filter(l => !migrationIds.has(l.id) && !providerIds.has(l.id))
      .map(l => {
        const attrs = l.attributes as Record<string, unknown> | null
        const email = attrs?.email as string || 
                      attrs?.contact_email as string || 
                      undefined
        
        return {
          id: l.id,
          title: l.title,
          category: l.category,
          subcategory: l.subcategory,
          hasEmail: !!email,
          email
        }
      })
    
    return { data: candidates, error: null }
  } catch (err) {
    console.error('Error getting migration candidates:', err)
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Failed to get candidates'
    }
  }
}

/**
 * Add listings to migration queue
 */
export async function addToMigrationQueue(
  listings: Array<{ listingId: string; contactEmail?: string }>
): Promise<{
  created: number
  errors: Array<{ listingId: string; error: string }>
}> {
  try {
    await requireAdmin()
    
    const supabase = await createClient()
    const results = {
      created: 0,
      errors: [] as Array<{ listingId: string; error: string }>
    }
    
    for (const item of listings) {
      const { error } = await supabase
        .from('listing_migration')
        .insert({
          listing_id: item.listingId,
          contact_email: item.contactEmail || null,
          status: 'pending'
        })
      
      if (error) {
        if (error.code === '23505') {
          results.errors.push({ 
            listingId: item.listingId, 
            error: 'Already in queue' 
          })
        } else {
          results.errors.push({ 
            listingId: item.listingId, 
            error: error.message 
          })
        }
      } else {
        results.created++
      }
    }
    
    revalidatePath('/admin/migration')
    
    return results
  } catch (err) {
    console.error('Error adding to migration queue:', err)
    return {
      created: 0,
      errors: listings.map(l => ({
        listingId: l.listingId,
        error: err instanceof Error ? err.message : 'Failed to add to queue'
      }))
    }
  }
}
