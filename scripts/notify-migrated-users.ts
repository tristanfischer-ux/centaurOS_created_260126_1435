/**
 * One-shot script: Send email to all users migrated from forge-guild to sandbox.
 *
 * Usage: npx tsx scripts/notify-migrated-users.ts [--dry-run]
 *
 * Identifies migrated users by: foundry is_sandbox=true AND profile has
 * has_completed_onboarding=true but no intent_selection (they went through
 * the old onboarding, not the new 3-way fork).
 */

import { config } from "dotenv"
import { resolve } from "path"

// Load .env.local from project root
config({ path: resolve(__dirname, "../.env.local") })

import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
// Resend key from Nightshift config DB (not in ForgeOS env)
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_ZSUUvC58_E2ujtaAYwGXB5KRYVSCLaZhJ"

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RESEND_API_KEY) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const resend = new Resend(RESEND_API_KEY)

const APP_URL = "https://fractionalforge.app"
const FROM = "Tristan @ Fractional Forge <tristan@fractionalforge.app>"

const DRY_RUN = process.argv.includes("--dry-run")

async function main() {
  if (DRY_RUN) console.log("=== DRY RUN — no emails will be sent ===\n")
  // Find all sandbox users who were migrated (not new signups via 3-way fork)
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, foundry_id, onboarding_data")
    .eq("role", "Executive")

  if (error) {
    console.error("Failed to fetch profiles:", error)
    process.exit(1)
  }

  // Filter to sandbox foundries
  const sandboxProfiles = profiles?.filter(p => p.foundry_id?.startsWith("sandbox-")) ?? []

  // Filter to migrated users (completed old onboarding, no intent_selection)
  const migratedUsers = sandboxProfiles.filter(p => {
    const data = p.onboarding_data as Record<string, unknown> | null
    return data?.has_completed_onboarding === true && !data?.intent_selection
  })

  console.log(`Found ${migratedUsers.length} migrated users to notify:\n`)

  let sent = 0
  let skipped = 0

  for (const user of migratedUsers) {
    if (!user.email) {
      console.log(`  SKIP: ${user.full_name} — no email`)
      skipped++
      continue
    }

    const firstName = user.full_name?.split(" ")[0] || "there"

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="margin-bottom: 24px;">
          <img src="${APP_URL}/images/logo-dark.svg" alt="ForgeOS" width="120" />
        </div>

        <h2 style="color: #1a1a1a; font-size: 22px; margin-bottom: 8px;">
          Hi ${firstName}, you now have your own workspace
        </h2>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          We&rsquo;ve made an important change to how ForgeOS works. Previously, everyone shared a common workspace &mdash; which meant you could accidentally see other people&rsquo;s data and they could see yours.
        </p>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          <strong>You now have your own private workspace.</strong> Your data is completely isolated and only visible to you.
        </p>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          When you&rsquo;re ready, you have two paths forward:
        </p>

        <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 24px 0;">
          <tr>
            <td style="width: 50%; background: #f0f7ff; border-radius: 12px; padding: 20px; vertical-align: top;">
              <h3 style="color: #1a1a1a; font-size: 16px; margin: 0 0 8px;">Set up your company</h3>
              <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                Create a named company workspace, build your team, and manage your venture.
              </p>
              <a href="${APP_URL}/today" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
                Create Company
              </a>
            </td>
            <td style="width: 50%; background: #fff7ed; border-radius: 12px; padding: 20px; vertical-align: top;">
              <h3 style="color: #1a1a1a; font-size: 16px; margin: 0 0 8px;">Get found as a fractional exec</h3>
              <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                Complete your profile so companies can discover you and invite you to their teams.
              </p>
              <a href="${APP_URL}/my-profile" style="display: inline-block; background: #ff4500; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
                Complete Profile
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          You&rsquo;re also now listed on the <a href="${APP_URL}/recruits" style="color: #ff4500;">Recruits page</a> where companies browse for fractional executives. The more complete your profile, the more likely you are to be found.
        </p>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          If you have any questions, just reply to this email.
        </p>

        <p style="color: #1a1a1a; font-size: 15px; margin-top: 24px;">
          Tristan<br/>
          <span style="color: #888; font-size: 13px;">Founder, Fractional Forge</span>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
        <p style="color: #aaa; font-size: 11px;">
          Fractional Forge Ltd &middot; London, UK<br/>
          You received this because you have a ForgeOS account.
        </p>
      </div>
    `

    if (DRY_RUN) {
      console.log(`  WOULD SEND: ${user.full_name} <${user.email}>`)
      sent++
      continue
    }

    try {
      const { error: sendError } = await resend.emails.send({
        from: FROM,
        to: [user.email],
        subject: "You now have your own private workspace on ForgeOS",
        html,
      })

      if (sendError) {
        console.log(`  FAIL: ${user.full_name} <${user.email}> — ${sendError.message}`)
        skipped++
      } else {
        console.log(`  SENT: ${user.full_name} <${user.email}>`)
        sent++
      }

      // Resend free tier: 2 req/sec max
      await new Promise(r => setTimeout(r, 600))
    } catch (err) {
      console.log(`  ERROR: ${user.full_name} <${user.email}> — ${err}`)
      skipped++
    }
  }

  console.log(`\nDone: ${sent} sent, ${skipped} skipped`)
}

main()
