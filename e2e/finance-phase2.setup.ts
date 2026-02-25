/**
 * @file finance-phase2.setup.ts — Global setup for Finance Phase 2 E2E suite
 *
 * Runs automatically before every test run via playwright.finance-phase2.config.ts.
 * No manual steps required.
 *
 * Steps:
 *   1. Refresh elena.vasquez@perigee-labs.com auth state (SDK-based, no rate limiting)
 *   2. Seed fresh test data: 2 sent invoices + 1 manual transaction
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = 'https://jyarhvinengfyrwgtskq.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A'
const ANON_KEY = 'sb_publishable_X8C_-6wHZuRbKpPQGj22og_LrTT70VK'
const EMAIL = 'elena.vasquez@perigee-labs.com'
const PASSWORD = 'PerigeeSpace2025!'
const AUTH_OUTPUT = path.join(__dirname, '../.playwright/auth/elena.json')
const PRODUCTION_DOMAIN = 'fractionalforge.app'

const ONBOARDING_LS = [
  { name: 'forgeos_onboarding_completed', value: 'true' },
  { name: 'forgeos_intent_selected', value: 'true' },
  { name: 'forgeos_supplier_onboarding_completed', value: 'true' },
  { name: 'forgeos:onboarding:completed', value: 'true' },
  { name: 'forgeos:marketplace:onboarding:completed', value: 'true' },
]

export default async function globalSetup() {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ─── Step 1: Refresh auth ──────────────────────────────────────────────────

  console.log('[setup] Refreshing Elena auth state...')
  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  if (authError) throw new Error(`Elena auth failed: ${authError.message}`)

  const session = authData.session!
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })).toString('base64')

  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600
  const storageState = {
    cookies: [{
      name: cookieName, value: cookieValue, domain: PRODUCTION_DOMAIN,
      path: '/', expires: expiresAt, httpOnly: false, secure: true, sameSite: 'Lax' as const,
    }],
    origins: [{ origin: 'https://fractionalforge.app', localStorage: ONBOARDING_LS }],
  }
  fs.mkdirSync(path.dirname(AUTH_OUTPUT), { recursive: true })
  fs.writeFileSync(AUTH_OUTPUT, JSON.stringify(storageState, null, 2))
  console.log(`[setup] ✓ Auth refreshed (expires ${new Date(expiresAt * 1000).toISOString()})`)

  // ─── Step 2: Seed test data ────────────────────────────────────────────────

  const userId = authData.user!.id

  const { data: profile, error: profileError } = await admin
    .from('profiles').select('foundry_id').eq('id', userId).single()
  if (profileError || !profile) throw new Error(`Profile not found: ${profileError?.message}`)
  const foundryId = profile.foundry_id
  console.log(`[setup] ✓ Foundry: ${foundryId}`)

  // Delete ALL prior E2E test invoices (any status)
  await admin
    .from('finance_standalone_invoices')
    .delete()
    .eq('foundry_id', foundryId)
    .eq('created_by', userId)
    .in('recipient_name', ['Test Client Alpha', 'Test Client Beta'])
  console.log('[setup] ✓ Cleared old E2E test invoices')

  // Determine next invoice numbers
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const { count: existingCount } = await admin
    .from('finance_standalone_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', foundryId)
    .like('invoice_number', `${prefix}%`)
  const baseCount = existingCount ?? 0

  const { data: insertedInvoices, error: invoiceError } = await admin
    .from('finance_standalone_invoices')
    .insert([
      {
        foundry_id: foundryId, created_by: userId,
        invoice_number: `${prefix}${String(baseCount + 1).padStart(5, '0')}`,
        recipient_name: 'Test Client Alpha', recipient_email: 'alpha@test-client.com',
        line_items: [{ description: 'E2E Test Service — Phase 2', quantity: 1, unitPrice: 500000, amount: 500000 }],
        subtotal: 500000, vat_amount: 100000, total: 600000, currency: 'GBP', status: 'sent',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        is_recurring: false,
      },
      {
        foundry_id: foundryId, created_by: userId,
        invoice_number: `${prefix}${String(baseCount + 2).padStart(5, '0')}`,
        recipient_name: 'Test Client Beta', recipient_email: 'beta@test-client.com',
        line_items: [{ description: 'E2E Test Consultancy — Phase 2', quantity: 2, unitPrice: 250000, amount: 500000 }],
        subtotal: 500000, vat_amount: 100000, total: 600000, currency: 'GBP', status: 'sent',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        is_recurring: false,
      },
    ])
    .select('invoice_number, status')
  if (invoiceError) throw new Error(`Invoice insert failed: ${invoiceError.message}`)
  console.log(`[setup] ✓ Created ${insertedInvoices?.length ?? 0} sent invoices`)

  // Seed project transaction
  const { data: projects, error: projectError } = await admin
    .from('finance_projects')
    .select('id, name, status')
    .eq('foundry_id', foundryId)
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (projectError || !projects?.length) throw new Error(`No projects found: ${projectError?.message}`)

  // Delete orphaned E2E transactions from previous failed runs
  await admin
    .from('finance_project_transactions')
    .delete()
    .in('project_id', projects.map(p => p.id))
    .like('description', 'E2E Test — manual transaction%')
  console.log('[setup] ✓ Cleared orphaned E2E transactions')

  const targetProject = projects.find(p => p.status === 'active') ?? projects[0]
  const { error: txError } = await admin
    .from('finance_project_transactions')
    .insert({
      project_id: targetProject.id,
      transaction_type: 'cost_item',
      description: 'E2E Test — manual transaction (delete me)',
      amount: 50000,
      is_revenue: false,
      reference_id: null,
    })
  if (txError) throw new Error(`Transaction insert failed: ${txError.message}`)
  console.log(`[setup] ✓ Seeded transaction on "${targetProject.name}"`)

  console.log('[setup] ✅ Finance Phase 2 test data ready')
}
