/**
 * @file auth-elena-sdk.setup.ts — SDK-based auth setup for elena.vasquez@perigee-labs.com
 *
 * Uses the Supabase JS client directly (not the login UI) to create a fresh
 * Playwright storageState on every test run. Avoids UI rate-limiting issues.
 *
 * Registered as the 'auth-setup-elena' project in playwright.config.ts.
 * The 'finance-phase2' project depends on it so auth is always fresh.
 */

import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = 'https://jyarhvinengfyrwgtskq.supabase.co'
const ANON_KEY = 'sb_publishable_X8C_-6wHZuRbKpPQGj22og_LrTT70VK'
const EMAIL = 'elena.vasquez@perigee-labs.com'
const PASSWORD = 'PerigeeSpace2025!'
const OUTPUT_PATH = path.join(__dirname, '../.playwright/auth/elena.json')
const PRODUCTION_DOMAIN = 'fractionalforge.app'

const ONBOARDING_LS: Array<{ name: string; value: string }> = [
  { name: 'forgeos_onboarding_completed', value: 'true' },
  { name: 'forgeos_intent_selected', value: 'true' },
  { name: 'forgeos_supplier_onboarding_completed', value: 'true' },
  { name: 'forgeos:onboarding:completed', value: 'true' },
  { name: 'forgeos:marketplace:onboarding:completed', value: 'true' },
]

setup('create elena auth state via Supabase SDK', async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY)

  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw new Error(`Elena auth failed: ${error.message}`)

  const session = data.session!
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`

  // @supabase/ssr encodes sessions as "base64-" + base64(JSON.stringify(session))
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
      name: cookieName,
      value: cookieValue,
      domain: PRODUCTION_DOMAIN,
      path: '/',
      expires: expiresAt,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax' as const,
    }],
    origins: [{
      origin: 'https://fractionalforge.app',
      localStorage: ONBOARDING_LS,
    }],
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(storageState, null, 2))

  console.log(`✓ Elena auth state refreshed — expires ${new Date(expiresAt * 1000).toISOString()}`)
})
