// Migration types for transitioning existing marketplace listings to the transactional system
import { Database } from "@/types/database.types"

// Migration status for tracking listing migration progress
export type MigrationStatus = 'pending' | 'invited' | 'in_progress' | 'completed' | 'declined'

// Status for displaying in the UI
export type ListingTransactionStatus = 
  | 'transactional'  // Fully migrated, can accept bookings
  | 'invite_sent'    // Invitation sent, awaiting signup
  | 'pending_signup' // Provider started signup but not complete
  | 'contact_only'   // Not migrated, contact-only fallback

// Migration record from the database
export interface MigrationRecord {
  id: string
  listing_id: string
  contact_email: string | null
  invitation_sent_at: string | null
  provider_created_at: string | null
  migration_completed_at: string | null
  status: MigrationStatus
}

// Migration record with listing details
export interface MigrationRecordWithListing extends MigrationRecord {
  listing: {
    id: string
    title: string
    category: Database["public"]["Enums"]["marketplace_category"]
    subcategory: string
    description: string | null
    image_url: string | null
    is_verified: boolean | null
    attributes: Record<string, unknown> | null
  }
}

// Stats for the migration dashboard
export interface MigrationStats {
  totalListings: number
  pendingCount: number
  invitedCount: number
  inProgressCount: number
  completedCount: number
  declinedCount: number
  migrationRate: number // Percentage of completed migrations
}

// Invitation data for sending migration emails
export interface MigrationInvite {
  listingId: string
  listingTitle: string
  contactEmail: string
  category: Database["public"]["Enums"]["marketplace_category"]
  subcategory: string
  signupUrl: string
  deadline?: string
}

// Parameters for creating a migration record
export interface CreateMigrationParams {
  listingId: string
  contactEmail?: string
}

// Parameters for completing migration signup
export interface CompleteMigrationParams {
  listingId: string
  userId: string
  stripeAccountId?: string
}

// Available actions for a listing based on migration status
export interface ListingActions {
  canBook: boolean
  canContact: boolean
  contactMethod: 'platform' | 'external' | 'none'
  contactInfo?: {
    email?: string
    phone?: string
    website?: string
  }
  badge: ListingTransactionStatus
  ctaLabel: string
  ctaAction: 'book' | 'contact' | 'signup'
}

// Filter parameters for migration queue
export interface MigrationQueueFilters {
  status?: MigrationStatus | MigrationStatus[]
  category?: Database["public"]["Enums"]["marketplace_category"]
  search?: string
  limit?: number
  offset?: number
}

// Email template data
export interface MigrationEmailData {
  to: string
  subject: string
  html: string
  text: string
}

// Migration candidate from initial scan
export interface MigrationCandidate {
  listingId: string
  title: string
  category: Database["public"]["Enums"]["marketplace_category"]
  subcategory: string
  contactEmail: string | null
  contactPhone: string | null
  hasContactInfo: boolean
  isVerified: boolean
}

// Report from migration script
export interface MigrationReport {
  totalScanned: number
  withContactEmail: number
  withoutContactEmail: number
  alreadyMigrated: number
  newRecordsCreated: number
  errors: Array<{
    listingId: string
    error: string
  }>
  timestamp: string
}
