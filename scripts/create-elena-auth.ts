/**
 * @file create-elena-auth.ts
 * Creates a Playwright storageState file for elena.vasquez@perigee-labs.com
 * using the Supabase JS client (bypasses rate limiting on the login UI).
 *
 * The app uses @supabase/ssr which stores sessions as cookies with format:
 *   sb-[projectRef]-auth-token = "base64-" + btoa(JSON.stringify(session))
 *
 * Usage: npx tsx scripts/create-elena-auth.ts
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = 'https://jyarhvinengfyrwgtskq.supabase.co'
const ANON_KEY = 'sb_publishable_X8C_-6wHZuRbKpPQGj22og_LrTT70VK'
const EMAIL = 'elena.vasquez@perigee-labs.com'
const PASSWORD = 'PerigeeSpace2025!'
const OUTPUT_PATH = path.join(__dirname, '../.playwright/auth/elena.json')
const PRODUCTION_DOMAIN = 'fractionalforge.app'
const PRODUCTION_ORIGIN = 'https://fractionalforge.app'

const ONBOARDING_LS: Array<{ name: string; value: string }> = [
  { name: 'forgeos_onboarding_completed', value: 'true' },
  { name: 'forgeos_intent_selected', value: 'true' },
  { name: 'forgeos_supplier_onboarding_completed', value: 'true' },
  { name: 'forgeos:onboarding:completed', value: 'true' },
  { name: 'forgeos:marketplace:onboarding:completed', value: 'true' },
]

async function main() {
  const supabase = createClient(SUPABASE_URL, ANON_KEY)

  console.log(`Signing in as ${EMAIL}...`)
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

  if (error) {
    throw new Error(`Auth failed: ${error.message}`)
  }

  const session = data.session!
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`

  // @supabase/ssr encodes the session as "base64-" + base64(JSON)
  const sessionPayload = {
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(sessionPayload)).toString('base64')

  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600
  const expiresUnixMs = expiresAt * 1000

  const storageState = {
    cookies: [
      {
        name: cookieName,
        value: cookieValue,
        domain: PRODUCTION_DOMAIN,
        path: '/',
        expires: expiresUnixMs / 1000, // Playwright uses seconds
        httpOnly: false,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [
      {
        origin: PRODUCTION_ORIGIN,
        localStorage: ONBOARDING_LS,
      },
    ],
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(storageState, null, 2))

  console.log(`✓ Saved auth state to ${OUTPUT_PATH}`)
  console.log(`  User: ${session.user.email}`)
  console.log(`  Cookie: ${cookieName}`)
  console.log(`  Expires: ${new Date(expiresUnixMs).toISOString()}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
