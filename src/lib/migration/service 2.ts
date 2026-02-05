// Migration service for transitioning existing marketplace listings to the transactional system
import { createClient } from "@/lib/supabase/server"
import { 
  MigrationRecord, 
  MigrationRecordWithListing,
  MigrationStats, 
  MigrationCandidate,
  MigrationReport,
  CreateMigrationParams,
  CompleteMigrationParams,
  MigrationStatus,
  MigrationQueueFilters
} from "@/types/migration"
import { getMigrationInviteEmail } from "./emails"
import { Database } from "@/types/database.types"

type MarketplaceCategory = Database["public"]["Enums"]["marketplace_category"]

/**
 * Identify all listings that can be migrated to the transactional system
 * Returns listings that don't have an associated provider profile
 */
export async function identifyMigratableListings(): Promise<{
  candidates: MigrationCandidate[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Get all marketplace listings
    const { data: listings, error: listingsError } = await supabase
      .from('marketplace_listings')
      .select('id, title, category, subcategory, attributes, is_verified')
      .order('created_at', { ascending: false })
    
    if (listingsError) {
      throw listingsError
    }
    
    // Get listings that already have migration records
    const { data: existingMigrations } = await supabase
      .from('listing_migration')
      .select('listing_id')
    
    const migratedListingIds = new Set(
      (existingMigrations || []).map(m => m.listing_id)
    )
    
    // Get listings that already have provider profiles
    const { data: providerProfiles } = await supabase
      .from('provider_profiles')
      .select('listing_id')
      .not('listing_id', 'is', null)
    
    const providerListingIds = new Set(
      (providerProfiles || []).map(p => p.listing_id).filter(Boolean)
    )
    
    // Filter to only migratable listings
    const candidates: MigrationCandidate[] = (listings || [])
      .filter(listing => 
        !migratedListingIds.has(listing.id) && 
        !providerListingIds.has(listing.id)
      )
      .map(listing => {
        const attrs = listing.attributes as Record<string, unknown> | null
        const contactEmail = attrs?.email as string || attrs?.contact_email as string || null
        const contactPhone = attrs?.phone as string || attrs?.contact_phone as string || null
        
        return {
          listingId: listing.id,
          title: listing.title,
          category: listing.category,
          subcategory: listing.subcategory,
          contactEmail,
          contactPhone,
          hasContactInfo: !!(contactEmail || contactPhone),
          isVerified: listing.is_verified || false
        }
      })
    
    return { candidates, error: null }
  } catch (err) {
    console.error('Error identifying migratable listings:', err)
    return {
      candidates: [],
      error: err instanceof Error ? err.message : 'Failed to identify migratable listings'
    }
  }
}

/**
 * Create a migration tracking record for a listing
 */
export async function createMigrationRecord(
  params: CreateMigrationParams
): Promise<{
  record: MigrationRecord | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('listing_migration')
      .insert({
        listing_id: params.listingId,
        contact_email: params.contactEmail || null,
        status: 'pending'
      })
      .select()
      .single()
    
    if (error) {
      if (error.code === '23505') { // Unique violation
        return { record: null, error: 'Migration record already exists for this listing' }
      }
      throw error
    }
    
    return { record: data as MigrationRecord, error: null }
  } catch (err) {
    console.error('Error creating migration record:', err)
    return {
      record: null,
      error: err instanceof Error ? err.message : 'Failed to create migration record'
    }
  }
}

/**
 * Bulk create migration records for multiple listings
 */
export async function createMigrationRecords(
  listings: Array<{ listingId: string; contactEmail?: string }>
): Promise<{
  created: number
  errors: Array<{ listingId: string; error: string }>
}> {
  const results = {
    created: 0,
    errors: [] as Array<{ listingId: string; error: string }>
  }
  
  const supabase = await createClient()
  
  // Process in batches of 100
  const batchSize = 100
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize)
    
    const { data, error } = await supabase
      .from('listing_migration')
      .insert(
        batch.map(item => ({
          listing_id: item.listingId,
          contact_email: item.contactEmail || null,
          status: 'pending' as MigrationStatus
        }))
      )
      .select()
    
    if (error) {
      // On batch error, try individual inserts
      for (const item of batch) {
        const result = await createMigrationRecord(item)
        if (result.error) {
          results.errors.push({ listingId: item.listingId, error: result.error })
        } else {
          results.created++
        }
      }
    } else {
      results.created += (data || []).length
    }
  }
  
  return results
}

/**
 * Send a migration invitation email to a listing contact
 */
export async function sendMigrationInvitation(
  listingId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Get the migration record and listing details
    const { data: migration, error: migrationError } = await supabase
      .from('listing_migration')
      .select(`
        *,
        listing:marketplace_listings(*)
      `)
      .eq('listing_id', listingId)
      .single()
    
    if (migrationError || !migration) {
      throw new Error('Migration record not found')
    }
    
    if (!migration.contact_email) {
      return { success: false, error: 'No contact email for this listing' }
    }
    
    const listing = migration.listing as {
      id: string
      title: string
      category: MarketplaceCategory
      subcategory: string
    }
    
    // Generate the invitation email
    const emailData = getMigrationInviteEmail({
      listingId: listing.id,
      listingTitle: listing.title,
      contactEmail: migration.contact_email,
      category: listing.category,
      subcategory: listing.subcategory,
      signupUrl: `${process.env.NEXT_PUBLIC_APP_URL}/provider-signup?listing=${listingId}`
    })
    
    // In production, send via email service
    // For now, just log and update status
    console.log('[Migration] Would send email:', {
      to: emailData.to,
      subject: emailData.subject
    })
    
    // Update the migration record
    const { error: updateError } = await supabase
      .from('listing_migration')
      .update({
        status: 'invited',
        invitation_sent_at: new Date().toISOString()
      })
      .eq('listing_id', listingId)
    
    if (updateError) {
      throw updateError
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error sending migration invitation:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send invitation'
    }
  }
}

/**
 * Process a provider signing up via migration invitation
 */
export async function processMigrationSignup(
  params: CompleteMigrationParams
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Verify the migration record exists and is in valid state
    const { data: migration, error: migrationError } = await supabase
      .from('listing_migration')
      .select('*')
      .eq('listing_id', params.listingId)
      .single()
    
    if (migrationError || !migration) {
      return { success: false, error: 'Migration record not found' }
    }
    
    if (migration.status === 'completed') {
      return { success: false, error: 'Migration already completed' }
    }
    
    if (migration.status === 'declined') {
      return { success: false, error: 'Migration was declined' }
    }
    
    // Update migration status to in_progress
    const { error: updateError } = await supabase
      .from('listing_migration')
      .update({
        status: 'in_progress',
        provider_created_at: new Date().toISOString()
      })
      .eq('listing_id', params.listingId)
    
    if (updateError) {
      throw updateError
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error processing migration signup:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to process signup'
    }
  }
}

/**
 * Complete the migration for a listing
 * Called after provider profile is fully set up with Stripe
 */
export async function completeMigration(
  listingId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Verify provider profile exists for this listing
    const { data: providerProfile } = await supabase
      .from('provider_profiles')
      .select('id, stripe_account_id')
      .eq('listing_id', listingId)
      .single()
    
    if (!providerProfile) {
      return { success: false, error: 'Provider profile not found for this listing' }
    }
    
    // Update migration record to completed
    const { error: updateError } = await supabase
      .from('listing_migration')
      .update({
        status: 'completed',
        migration_completed_at: new Date().toISOString()
      })
      .eq('listing_id', listingId)
    
    if (updateError) {
      throw updateError
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error completing migration:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to complete migration'
    }
  }
}

/**
 * Get the current migration status for a listing
 */
export async function getMigrationStatus(
  listingId: string
): Promise<{
  data: MigrationRecord | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('listing_migration')
      .select('*')
      .eq('listing_id', listingId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return { data: null, error: null }
      }
      throw error
    }
    
    return { data: data as MigrationRecord, error: null }
  } catch (err) {
    console.error('Error getting migration status:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to get migration status'
    }
  }
}

/**
 * Get migration statistics for the admin dashboard
 */
export async function getMigrationStats(): Promise<{
  data: MigrationStats | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Get total marketplace listings
    const { count: totalListings } = await supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact', head: true })
    
    // Get migration status counts
    const { data: migrations, error: migrationsError } = await supabase
      .from('listing_migration')
      .select('status')
    
    if (migrationsError) {
      throw migrationsError
    }
    
    const statusCounts = (migrations || []).reduce((acc, m) => {
      acc[m.status] = (acc[m.status] || 0) + 1
      return acc
    }, {} as Record<MigrationStatus, number>)
    
    const completedCount = statusCounts['completed'] || 0
    const totalMigrations = migrations?.length || 0
    
    return {
      data: {
        totalListings: totalListings || 0,
        pendingCount: statusCounts['pending'] || 0,
        invitedCount: statusCounts['invited'] || 0,
        inProgressCount: statusCounts['in_progress'] || 0,
        completedCount,
        declinedCount: statusCounts['declined'] || 0,
        migrationRate: totalMigrations > 0 
          ? Math.round((completedCount / totalMigrations) * 100) 
          : 0
      },
      error: null
    }
  } catch (err) {
    console.error('Error getting migration stats:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to get migration stats'
    }
  }
}

/**
 * Get the migration queue with filters
 */
export async function getMigrationQueue(
  filters: MigrationQueueFilters = {}
): Promise<{
  data: MigrationRecordWithListing[]
  total: number
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('listing_migration')
      .select(`
        *,
        listing:marketplace_listings(*)
      `, { count: 'exact' })
      .order('invitation_sent_at', { ascending: false, nullsFirst: true })
    
    // Apply status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }
    
    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit)
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)
    }
    
    const { data, count, error } = await query
    
    if (error) {
      throw error
    }
    
    return {
      data: (data || []) as MigrationRecordWithListing[],
      total: count || 0,
      error: null
    }
  } catch (err) {
    console.error('Error getting migration queue:', err)
    return {
      data: [],
      total: 0,
      error: err instanceof Error ? err.message : 'Failed to get migration queue'
    }
  }
}

/**
 * Decline a migration (provider opts out)
 */
export async function declineMigration(
  listingId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('listing_migration')
      .update({ status: 'declined' })
      .eq('listing_id', listingId)
    
    if (error) {
      throw error
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error declining migration:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to decline migration'
    }
  }
}

/**
 * Archive an unmigrated listing
 * This removes it from active marketplace but keeps data
 */
export async function archiveUnmigratedListing(
  listingId: string
): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Update the listing's attributes to mark as archived
    const { data: listing, error: fetchError } = await supabase
      .from('marketplace_listings')
      .select('attributes')
      .eq('id', listingId)
      .single()
    
    if (fetchError) {
      throw fetchError
    }
    
    const currentAttrs = (listing?.attributes as Record<string, unknown>) || {}
    
    const { error: updateError } = await supabase
      .from('marketplace_listings')
      .update({
        attributes: {
          ...currentAttrs,
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: 'unmigrated'
        }
      })
      .eq('id', listingId)
    
    if (updateError) {
      throw updateError
    }
    
    return { success: true, error: null }
  } catch (err) {
    console.error('Error archiving listing:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to archive listing'
    }
  }
}

/**
 * Generate a migration report for all listings
 */
export async function generateMigrationReport(): Promise<{
  report: MigrationReport | null
  error: string | null
}> {
  try {
    const { candidates, error: candidatesError } = await identifyMigratableListings()
    
    if (candidatesError) {
      throw new Error(candidatesError)
    }
    
    const withEmail = candidates.filter(c => c.contactEmail)
    const withoutEmail = candidates.filter(c => !c.contactEmail)
    
    // Get already migrated count
    const supabase = await createClient()
    const { count: migratedCount } = await supabase
      .from('listing_migration')
      .select('*', { count: 'exact', head: true })
    
    return {
      report: {
        totalScanned: candidates.length + (migratedCount || 0),
        withContactEmail: withEmail.length,
        withoutContactEmail: withoutEmail.length,
        alreadyMigrated: migratedCount || 0,
        newRecordsCreated: 0,
        errors: [],
        timestamp: new Date().toISOString()
      },
      error: null
    }
  } catch (err) {
    console.error('Error generating migration report:', err)
    return {
      report: null,
      error: err instanceof Error ? err.message : 'Failed to generate report'
    }
  }
}
