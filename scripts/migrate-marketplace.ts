#!/usr/bin/env npx tsx
/**
 * Migration Script: Identify and prepare marketplace listings for migration
 * 
 * This script:
 * 1. Scans all marketplace_listings
 * 2. Extracts contact information from attributes
 * 3. Creates migration records for eligible listings
 * 4. Generates a report of migration candidates
 * 
 * Usage:
 *   npx tsx scripts/migrate-marketplace.ts [--dry-run] [--category=People|Products|Services|AI]
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { Database } from "../src/types/database.types"

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

type MarketplaceCategory = Database["public"]["Enums"]["marketplace_category"]

interface MigrationCandidate {
  listingId: string
  title: string
  category: MarketplaceCategory
  subcategory: string
  contactEmail: string | null
  contactPhone: string | null
  hasContactInfo: boolean
  isVerified: boolean
}

interface MigrationReport {
  totalScanned: number
  withContactEmail: number
  withoutContactEmail: number
  alreadyMigrated: number
  newRecordsCreated: number
  errors: Array<{ listingId: string; error: string }>
  candidates: MigrationCandidate[]
  timestamp: string
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const categoryArg = args.find(a => a.startsWith('--category='))
  const category = categoryArg?.split('=')[1] as MarketplaceCategory | undefined

  console.log('='.repeat(60))
  console.log('Marketplace Migration Script')
  console.log('='.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`)
  if (category) {
    console.log(`Category filter: ${category}`)
  }
  console.log('')

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Error: Missing required environment variables')
    console.error('  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    process.exit(1)
  }

  // Create Supabase client with service role key
  const supabase = createSupabaseClient<Database>(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  const report: MigrationReport = {
    totalScanned: 0,
    withContactEmail: 0,
    withoutContactEmail: 0,
    alreadyMigrated: 0,
    newRecordsCreated: 0,
    errors: [],
    candidates: [],
    timestamp: new Date().toISOString()
  }

  try {
    // Step 1: Get all marketplace listings
    console.log('Step 1: Fetching marketplace listings...')
    
    let query = supabase
      .from('marketplace_listings')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (category) {
      query = query.eq('category', category)
    }
    
    const { data: listings, error: listingsError } = await query
    
    if (listingsError) {
      throw new Error(`Failed to fetch listings: ${listingsError.message}`)
    }
    
    report.totalScanned = listings?.length || 0
    console.log(`  Found ${report.totalScanned} listings`)
    
    // Step 2: Get existing migration records
    console.log('\nStep 2: Checking existing migration records...')
    
    const { data: existingMigrations, error: migrationsError } = await supabase
      .from('listing_migration')
      .select('listing_id')
    
    if (migrationsError) {
      throw new Error(`Failed to fetch migrations: ${migrationsError.message}`)
    }
    
    const migratedIds = new Set((existingMigrations || []).map(m => m.listing_id))
    report.alreadyMigrated = migratedIds.size
    console.log(`  Found ${report.alreadyMigrated} existing migration records`)
    
    // Step 3: Get listings with provider profiles
    console.log('\nStep 3: Checking provider profiles...')
    
    const { data: providerProfiles } = await supabase
      .from('provider_profiles')
      .select('listing_id')
      .not('listing_id', 'is', null)
    
    const providerListingIds = new Set(
      (providerProfiles || []).map(p => p.listing_id).filter(Boolean)
    )
    console.log(`  Found ${providerListingIds.size} listings with provider profiles`)
    
    // Step 4: Process each listing
    console.log('\nStep 4: Processing listings...')
    
    for (const listing of listings || []) {
      // Skip if already migrated or has provider profile
      if (migratedIds.has(listing.id) || providerListingIds.has(listing.id)) {
        continue
      }
      
      // Extract contact info from attributes
      const attrs = listing.attributes as Record<string, unknown> | null
      const contactEmail = extractEmail(attrs)
      const contactPhone = extractPhone(attrs)
      
      const candidate: MigrationCandidate = {
        listingId: listing.id,
        title: listing.title,
        category: listing.category,
        subcategory: listing.subcategory,
        contactEmail,
        contactPhone,
        hasContactInfo: !!(contactEmail || contactPhone),
        isVerified: listing.is_verified || false
      }
      
      report.candidates.push(candidate)
      
      if (contactEmail) {
        report.withContactEmail++
      } else {
        report.withoutContactEmail++
      }
    }
    
    console.log(`  Identified ${report.candidates.length} migration candidates`)
    console.log(`    With email: ${report.withContactEmail}`)
    console.log(`    Without email: ${report.withoutContactEmail}`)
    
    // Step 5: Create migration records (if not dry run)
    if (!dryRun && report.candidates.length > 0) {
      console.log('\nStep 5: Creating migration records...')
      
      const batchSize = 100
      for (let i = 0; i < report.candidates.length; i += batchSize) {
        const batch = report.candidates.slice(i, i + batchSize)
        
        const { data, error } = await supabase
          .from('listing_migration')
          .insert(
            batch.map(c => ({
              listing_id: c.listingId,
              contact_email: c.contactEmail || null,
              status: 'pending' as const
            }))
          )
          .select()
        
        if (error) {
          console.error(`  Error inserting batch ${i / batchSize + 1}: ${error.message}`)
          
          // Try individual inserts for failed batch
          for (const candidate of batch) {
            const { error: singleError } = await supabase
              .from('listing_migration')
              .insert({
                listing_id: candidate.listingId,
                contact_email: candidate.contactEmail || null,
                status: 'pending'
              })
            
            if (singleError) {
              report.errors.push({
                listingId: candidate.listingId,
                error: singleError.message
              })
            } else {
              report.newRecordsCreated++
            }
          }
        } else {
          report.newRecordsCreated += data?.length || 0
        }
        
        process.stdout.write(`  Progress: ${Math.min(i + batchSize, report.candidates.length)}/${report.candidates.length}\r`)
      }
      
      console.log(`\n  Created ${report.newRecordsCreated} migration records`)
    } else if (dryRun) {
      console.log('\nStep 5: Skipped (dry run mode)')
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('Migration Report Summary')
    console.log('='.repeat(60))
    console.log(`Timestamp: ${report.timestamp}`)
    console.log(`Total listings scanned: ${report.totalScanned}`)
    console.log(`Already in migration queue: ${report.alreadyMigrated}`)
    console.log(`Migration candidates: ${report.candidates.length}`)
    console.log(`  - With contact email: ${report.withContactEmail}`)
    console.log(`  - Without contact email: ${report.withoutContactEmail}`)
    if (!dryRun) {
      console.log(`New records created: ${report.newRecordsCreated}`)
    }
    if (report.errors.length > 0) {
      console.log(`Errors: ${report.errors.length}`)
      report.errors.slice(0, 10).forEach(e => {
        console.log(`  - ${e.listingId}: ${e.error}`)
      })
      if (report.errors.length > 10) {
        console.log(`  ... and ${report.errors.length - 10} more`)
      }
    }
    
    // Print top candidates
    if (report.candidates.length > 0) {
      console.log('\nTop Migration Candidates (with email):')
      report.candidates
        .filter(c => c.contactEmail)
        .slice(0, 10)
        .forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.title} (${c.category}/${c.subcategory})`)
          console.log(`     Email: ${c.contactEmail}`)
        })
    }
    
  } catch (err) {
    console.error('\nError:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

function extractEmail(attrs: Record<string, unknown> | null): string | null {
  if (!attrs) return null
  
  const contact = attrs.contact as Record<string, unknown> | undefined
  return (attrs.email as string) ||
         (attrs.contact_email as string) ||
         (contact?.email as string) ||
         null
}

function extractPhone(attrs: Record<string, unknown> | null): string | null {
  if (!attrs) return null
  
  const contact = attrs.contact as Record<string, unknown> | undefined
  return (attrs.phone as string) ||
         (attrs.contact_phone as string) ||
         (contact?.phone as string) ||
         null
}

// Run the script
main().catch(console.error)
