#!/usr/bin/env npx tsx
/**
 * Migration Invites Script: Send batch migration invitation emails
 * 
 * This script:
 * 1. Finds pending migration records with contact emails
 * 2. Sends invitation emails in batches
 * 3. Updates migration status to 'invited'
 * 4. Handles bounces/failures
 * 
 * Usage:
 *   npx tsx scripts/send-migration-invites.ts [--dry-run] [--limit=100] [--status=pending|invited]
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { Database } from "../src/types/database.types"

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Rate limiting
const BATCH_SIZE = 10
const DELAY_BETWEEN_BATCHES_MS = 1000

type MigrationStatus = 'pending' | 'invited' | 'in_progress' | 'completed' | 'declined'

interface InviteResult {
  listingId: string
  email: string
  success: boolean
  error?: string
}

interface InviteReport {
  totalProcessed: number
  sent: number
  skipped: number
  failed: number
  results: InviteResult[]
  timestamp: string
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.find(a => a.startsWith('--limit='))
  const statusArg = args.find(a => a.startsWith('--status='))
  
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100
  const status = (statusArg?.split('=')[1] || 'pending') as MigrationStatus

  console.log('='.repeat(60))
  console.log('Migration Invites Script')
  console.log('='.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN (no emails will be sent)' : 'LIVE'}`)
  console.log(`Status filter: ${status}`)
  console.log(`Limit: ${limit}`)
  console.log('')

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Error: Missing required environment variables')
    console.error('  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    process.exit(1)
  }

  // Create Supabase client
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

  const report: InviteReport = {
    totalProcessed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    results: [],
    timestamp: new Date().toISOString()
  }

  try {
    // Step 1: Fetch migration records ready for invitation
    console.log('Step 1: Fetching migration records...')
    
    const { data: migrations, error: migrationsError } = await supabase
      .from('listing_migration')
      .select(`
        *,
        listing:marketplace_listings(id, title, category, subcategory)
      `)
      .eq('status', status)
      .not('contact_email', 'is', null)
      .limit(limit)
      .order('created_at', { ascending: true })
    
    if (migrationsError) {
      throw new Error(`Failed to fetch migrations: ${migrationsError.message}`)
    }
    
    console.log(`  Found ${migrations?.length || 0} migration records to process`)
    
    if (!migrations || migrations.length === 0) {
      console.log('\nNo migration records to process.')
      return
    }
    
    // Step 2: Process in batches
    console.log('\nStep 2: Processing invitations...')
    
    for (let i = 0; i < migrations.length; i += BATCH_SIZE) {
      const batch = migrations.slice(i, i + BATCH_SIZE)
      
      console.log(`\n  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(migrations.length / BATCH_SIZE)}`)
      
      for (const migration of batch) {
        report.totalProcessed++
        
        const listing = migration.listing as {
          id: string
          title: string
          category: string
          subcategory: string
        } | null
        
        if (!listing) {
          report.skipped++
          report.results.push({
            listingId: migration.listing_id,
            email: migration.contact_email || '',
            success: false,
            error: 'Listing not found'
          })
          continue
        }
        
        if (!migration.contact_email) {
          report.skipped++
          report.results.push({
            listingId: migration.listing_id,
            email: '',
            success: false,
            error: 'No contact email'
          })
          continue
        }
        
        console.log(`    Processing: ${listing.title}`)
        console.log(`      Email: ${migration.contact_email}`)
        
        if (!dryRun) {
          // In production, send actual email here
          // For now, simulate sending
          const sendResult = await simulateSendEmail({
            to: migration.contact_email,
            listingId: listing.id,
            listingTitle: listing.title,
            category: listing.category,
            subcategory: listing.subcategory
          })
          
          if (sendResult.success) {
            // Update migration status
            const { error: updateError } = await supabase
              .from('listing_migration')
              .update({
                status: 'invited',
                invitation_sent_at: new Date().toISOString()
              })
              .eq('listing_id', migration.listing_id)
            
            if (updateError) {
              report.failed++
              report.results.push({
                listingId: migration.listing_id,
                email: migration.contact_email,
                success: false,
                error: `Failed to update status: ${updateError.message}`
              })
            } else {
              report.sent++
              report.results.push({
                listingId: migration.listing_id,
                email: migration.contact_email,
                success: true
              })
              console.log(`      ✓ Sent successfully`)
            }
          } else {
            report.failed++
            report.results.push({
              listingId: migration.listing_id,
              email: migration.contact_email,
              success: false,
              error: sendResult.error
            })
            console.log(`      ✗ Failed: ${sendResult.error}`)
          }
        } else {
          // Dry run - just log
          report.sent++
          report.results.push({
            listingId: migration.listing_id,
            email: migration.contact_email,
            success: true
          })
          console.log(`      [DRY RUN] Would send invitation`)
        }
      }
      
      // Rate limiting delay between batches
      if (i + BATCH_SIZE < migrations.length && !dryRun) {
        console.log(`\n  Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`)
        await sleep(DELAY_BETWEEN_BATCHES_MS)
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('Invitation Report Summary')
    console.log('='.repeat(60))
    console.log(`Timestamp: ${report.timestamp}`)
    console.log(`Total processed: ${report.totalProcessed}`)
    console.log(`Sent: ${report.sent}`)
    console.log(`Skipped: ${report.skipped}`)
    console.log(`Failed: ${report.failed}`)
    
    if (report.results.filter(r => !r.success).length > 0) {
      console.log('\nFailed invitations:')
      report.results
        .filter(r => !r.success)
        .slice(0, 20)
        .forEach(r => {
          console.log(`  - ${r.listingId}: ${r.error}`)
        })
    }
    
    if (dryRun) {
      console.log('\n[DRY RUN] No actual emails were sent or database records updated.')
    }
    
  } catch (err) {
    console.error('\nError:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

interface SendEmailParams {
  to: string
  listingId: string
  listingTitle: string
  category: string
  subcategory: string
}

async function simulateSendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  // In production, integrate with email service (SendGrid, Postmark, etc.)
  // This is a simulation for development
  
  const signupUrl = `${APP_URL}/provider-signup?listing=${params.listingId}`
  
  console.log(`      Sending to: ${params.to}`)
  console.log(`      Signup URL: ${signupUrl}`)
  
  // Simulate occasional failures for testing
  const shouldFail = Math.random() < 0.05 // 5% failure rate
  
  if (shouldFail) {
    return { success: false, error: 'Simulated email delivery failure' }
  }
  
  // Simulate email send delay
  await sleep(100)
  
  return { success: true }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run the script
main().catch(console.error)
