/**
 * @file seed-perigee-test-data.ts
 * Seeds fresh test data for elena.vasquez@perigee-labs.com so that
 * all Finance Phase 2 E2E tests have data to operate on.
 *
 * Creates:
 *   - 2 standalone invoices with status = 'sent' (for tests 5 & 6)
 *   - 1 manual project transaction on the first active project (for test 4)
 *
 * Usage: npx tsx scripts/seed-perigee-test-data.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jyarhvinengfyrwgtskq.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A'
const ANON_KEY = 'sb_publishable_X8C_-6wHZuRbKpPQGj22og_LrTT70VK'
const EMAIL = 'elena.vasquez@perigee-labs.com'
const PASSWORD = 'PerigeeSpace2025!'

async function main() {
  // Sign in as Elena to get her user ID
  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  if (authError) throw new Error(`Auth failed: ${authError.message}`)
  const userId = authData.user!.id
  console.log(`✓ Signed in as ${EMAIL} (${userId})`)

  // Use service role for direct inserts (bypasses RLS)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Get Elena's foundry_id from her profile
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('foundry_id')
    .eq('id', userId)
    .single()
  if (profileError || !profile) throw new Error(`Profile not found: ${profileError?.message}`)
  const foundryId = profile.foundry_id
  console.log(`✓ Foundry ID: ${foundryId}`)

  // ─── 1. Seed invoices ─────────────────────────────────────────────────────

  // Delete ALL prior E2E test invoices (any status) so they don't accumulate over time
  await admin
    .from('finance_standalone_invoices')
    .delete()
    .eq('foundry_id', foundryId)
    .eq('created_by', userId)
    .in('recipient_name', ['Test Client Alpha', 'Test Client Beta'])
  console.log('✓ Deleted prior E2E test invoices (all statuses)')

  // Determine next invoice numbers
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const { count: existingCount } = await admin
    .from('finance_standalone_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', foundryId)
    .like('invoice_number', `${prefix}%`)

  const baseCount = existingCount ?? 0

  // Create 2 sent invoices
  const invoices = [
    {
      foundry_id: foundryId,
      created_by: userId,
      invoice_number: `${prefix}${String(baseCount + 1).padStart(5, '0')}`,
      recipient_name: 'Test Client Alpha',
      recipient_email: 'alpha@test-client.com',
      line_items: [{
        description: 'E2E Test Service — Phase 2',
        quantity: 1,
        unitPrice: 500000,
        amount: 500000,
      }],
      subtotal: 500000,
      vat_amount: 100000,
      total: 600000,
      currency: 'GBP',
      status: 'sent',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      is_recurring: false,
    },
    {
      foundry_id: foundryId,
      created_by: userId,
      invoice_number: `${prefix}${String(baseCount + 2).padStart(5, '0')}`,
      recipient_name: 'Test Client Beta',
      recipient_email: 'beta@test-client.com',
      line_items: [{
        description: 'E2E Test Consultancy — Phase 2',
        quantity: 2,
        unitPrice: 250000,
        amount: 500000,
      }],
      subtotal: 500000,
      vat_amount: 100000,
      total: 600000,
      currency: 'GBP',
      status: 'sent',
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      is_recurring: false,
    },
  ]

  const { data: insertedInvoices, error: invoiceError } = await admin
    .from('finance_standalone_invoices')
    .insert(invoices)
    .select('id, invoice_number, status')

  if (invoiceError) throw new Error(`Invoice insert failed: ${invoiceError.message}`)
  console.log(`✓ Created ${insertedInvoices?.length ?? 0} sent invoices:`)
  insertedInvoices?.forEach(inv => console.log(`    ${inv.invoice_number} (${inv.status})`))

  // ─── 2. Seed project transaction ──────────────────────────────────────────

  // Get the first active project belonging to Elena
  const { data: projects, error: projectError } = await admin
    .from('finance_projects')
    .select('id, name, status')
    .eq('foundry_id', foundryId)
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (projectError || !projects?.length) throw new Error(`No projects found: ${projectError?.message}`)

  // Cleanup: delete orphaned E2E transactions from previous failed runs
  await admin
    .from('finance_project_transactions')
    .delete()
    .in('project_id', projects.map(p => p.id))
    .like('description', 'E2E Test — manual transaction%')
  console.log('✓ Cleaned up orphaned E2E transactions')

  // Prefer an active project, fall back to any project
  const targetProject = projects.find(p => p.status === 'active') ?? projects[0]
  console.log(`✓ Using project: "${targetProject.name}" (${targetProject.id})`)

  const { data: insertedTx, error: txError } = await admin
    .from('finance_project_transactions')
    .insert({
      project_id: targetProject.id,
      transaction_type: 'cost_item',
      description: 'E2E Test — manual transaction (delete me)',
      amount: 50000, // £500.00 in pence
      is_revenue: false,
      reference_id: null,
    })
    .select('id, description, amount')
    .single()

  if (txError) throw new Error(`Transaction insert failed: ${txError.message}`)
  console.log(`✓ Created transaction: "${insertedTx.description}" (£${insertedTx.amount / 100})`)

  console.log('\n✅ Perigee Labs test data seeded successfully')
  console.log('   Now run: npx playwright test --project=chromium e2e/finance-phase2-crud.spec.ts')
}

main().catch(err => {
  console.error('❌ Seed failed:', err.message)
  process.exit(1)
})
