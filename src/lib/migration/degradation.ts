// Graceful degradation for non-migrated marketplace listings
import { createClient } from "@/lib/supabase/server"
import { ListingActions, ListingTransactionStatus, MigrationStatus } from "@/types/migration"
import { Database } from "@/types/database.types"

type MarketplaceListing = Database["public"]["Tables"]["marketplace_listings"]["Row"]

/**
 * Check if a listing has been migrated to the transactional system
 */
export async function isListingTransactional(
  listingId: string
): Promise<{
  isTransactional: boolean
  status: ListingTransactionStatus
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Check if there's an active provider profile linked to this listing
    const { data: providerProfile } = await supabase
      .from('provider_profiles')
      .select('id, stripe_account_id, is_active')
      .eq('listing_id', listingId)
      .eq('is_active', true)
      .single()
    
    if (providerProfile && providerProfile.stripe_account_id) {
      return {
        isTransactional: true,
        status: 'transactional',
        error: null
      }
    }
    
    // Check migration status
    const { data: migration } = await supabase
      .from('listing_migration')
      .select('status')
      .eq('listing_id', listingId)
      .single()
    
    if (migration) {
      const migrationStatus = migration.status as MigrationStatus
      
      if (migrationStatus === 'completed') {
        // Provider exists but may not have Stripe yet
        return {
          isTransactional: false,
          status: 'pending_signup',
          error: null
        }
      }
      
      if (migrationStatus === 'invited') {
        return {
          isTransactional: false,
          status: 'invite_sent',
          error: null
        }
      }
      
      if (migrationStatus === 'in_progress') {
        return {
          isTransactional: false,
          status: 'pending_signup',
          error: null
        }
      }
    }
    
    // Not migrated at all
    return {
      isTransactional: false,
      status: 'contact_only',
      error: null
    }
  } catch (err) {
    console.error('Error checking listing transactional status:', err)
    return {
      isTransactional: false,
      status: 'contact_only',
      error: err instanceof Error ? err.message : 'Failed to check status'
    }
  }
}

/**
 * Get available actions for a listing based on its migration status
 */
export async function getListingActions(
  listingId: string
): Promise<{
  actions: ListingActions
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Get the listing with attributes
    const { data: listing, error: listingError } = await supabase
      .from('marketplace_listings')
      .select('*')
      .eq('id', listingId)
      .single()
    
    if (listingError || !listing) {
      throw new Error('Listing not found')
    }
    
    // Check transactional status
    const { isTransactional, status } = await isListingTransactional(listingId)
    
    if (isTransactional) {
      return {
        actions: {
          canBook: true,
          canContact: true,
          contactMethod: 'platform',
          badge: 'transactional',
          ctaLabel: 'Book Now',
          ctaAction: 'book'
        },
        error: null
      }
    }
    
    // Extract contact info from attributes
    const attrs = listing.attributes as Record<string, unknown> | null
    const contactInfo = extractContactInfo(attrs)
    
    // Determine actions based on status
    switch (status) {
      case 'invite_sent':
        return {
          actions: {
            canBook: false,
            canContact: contactInfo.email || contactInfo.phone || contactInfo.website ? true : false,
            contactMethod: 'external',
            contactInfo,
            badge: 'invite_sent',
            ctaLabel: 'Contact Provider',
            ctaAction: 'contact'
          },
          error: null
        }
      
      case 'pending_signup':
        return {
          actions: {
            canBook: false,
            canContact: contactInfo.email || contactInfo.phone || contactInfo.website ? true : false,
            contactMethod: 'external',
            contactInfo,
            badge: 'pending_signup',
            ctaLabel: 'Contact Provider',
            ctaAction: 'contact'
          },
          error: null
        }
      
      case 'contact_only':
      default:
        return {
          actions: {
            canBook: false,
            canContact: contactInfo.email || contactInfo.phone || contactInfo.website ? true : false,
            contactMethod: 'external',
            contactInfo,
            badge: 'contact_only',
            ctaLabel: contactInfo.email || contactInfo.phone || contactInfo.website 
              ? 'Contact Provider' 
              : 'View Details',
            ctaAction: 'contact'
          },
          error: null
        }
    }
  } catch (err) {
    console.error('Error getting listing actions:', err)
    return {
      actions: {
        canBook: false,
        canContact: false,
        contactMethod: 'none',
        badge: 'contact_only',
        ctaLabel: 'View Details',
        ctaAction: 'contact'
      },
      error: err instanceof Error ? err.message : 'Failed to get listing actions'
    }
  }
}

/**
 * Get contact fallback for a non-migrated listing
 */
export async function getContactFallback(
  listingId: string
): Promise<{
  hasContact: boolean
  contactInfo: {
    email?: string
    phone?: string
    website?: string
  }
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { data: listing, error } = await supabase
      .from('marketplace_listings')
      .select('attributes')
      .eq('id', listingId)
      .single()
    
    if (error || !listing) {
      throw new Error('Listing not found')
    }
    
    const attrs = listing.attributes as Record<string, unknown> | null
    const contactInfo = extractContactInfo(attrs)
    
    return {
      hasContact: !!(contactInfo.email || contactInfo.phone || contactInfo.website),
      contactInfo,
      error: null
    }
  } catch (err) {
    console.error('Error getting contact fallback:', err)
    return {
      hasContact: false,
      contactInfo: {},
      error: err instanceof Error ? err.message : 'Failed to get contact info'
    }
  }
}

/**
 * Get the display badge for a listing's migration status
 */
export function getMigrationBadge(status: ListingTransactionStatus): {
  label: string
  variant: 'success' | 'warning' | 'default' | 'secondary'
  description: string
} {
  switch (status) {
    case 'transactional':
      return {
        label: 'Book Now',
        variant: 'success',
        description: 'This provider accepts direct bookings'
      }
    case 'invite_sent':
      return {
        label: 'Coming Soon',
        variant: 'warning',
        description: 'This provider is setting up bookings'
      }
    case 'pending_signup':
      return {
        label: 'Setting Up',
        variant: 'default',
        description: 'Provider is completing their profile'
      }
    case 'contact_only':
    default:
      return {
        label: 'Contact',
        variant: 'secondary',
        description: 'Contact this provider directly'
      }
  }
}

/**
 * Check if a listing should show booking UI
 */
export async function shouldShowBookingUI(listingId: string): Promise<boolean> {
  const { isTransactional } = await isListingTransactional(listingId)
  return isTransactional
}

/**
 * Get all non-migrated listings that are still visible
 */
export async function getNonMigratedListings(
  category?: Database["public"]["Enums"]["marketplace_category"]
): Promise<{
  listings: MarketplaceListing[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    // Get listings without provider profiles
    let query = supabase
      .from('marketplace_listings')
      .select('*')
    
    if (category) {
      query = query.eq('category', category)
    }
    
    const { data: listings, error } = await query
    
    if (error) {
      throw error
    }
    
    // Get listings that have provider profiles
    const { data: providerListings } = await supabase
      .from('provider_profiles')
      .select('listing_id')
      .not('listing_id', 'is', null)
    
    const providerListingIds = new Set(
      (providerListings || []).map(p => p.listing_id).filter(Boolean)
    )
    
    // Filter to non-migrated
    const nonMigrated = (listings || []).filter(
      listing => !providerListingIds.has(listing.id)
    )
    
    return { listings: nonMigrated, error: null }
  } catch (err) {
    console.error('Error getting non-migrated listings:', err)
    return {
      listings: [],
      error: err instanceof Error ? err.message : 'Failed to get listings'
    }
  }
}

/**
 * Helper function to extract contact info from listing attributes
 */
function extractContactInfo(attrs: Record<string, unknown> | null): {
  email?: string
  phone?: string
  website?: string
} {
  if (!attrs) return {}
  
  return {
    email: (attrs.email as string) || 
           (attrs.contact_email as string) || 
           (attrs.contact?.email as string) || 
           undefined,
    phone: (attrs.phone as string) || 
           (attrs.contact_phone as string) || 
           (attrs.contact?.phone as string) || 
           undefined,
    website: (attrs.website as string) || 
             (attrs.url as string) || 
             (attrs.contact?.website as string) || 
             undefined
  }
}

/**
 * Determine if a listing is archived due to non-migration
 */
export function isListingArchived(listing: MarketplaceListing): boolean {
  const attrs = listing.attributes as Record<string, unknown> | null
  return attrs?.is_archived === true && attrs?.archived_reason === 'unmigrated'
}
