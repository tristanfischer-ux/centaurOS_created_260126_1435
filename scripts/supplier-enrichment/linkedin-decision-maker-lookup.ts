/**
 * @file linkedin-decision-maker-lookup.ts — Item #9: find LinkedIn decision-makers (SCAFFOLD).
 *
 * STATUS: scaffold — requires APOLLO_API_KEY OR HUNTER_API_KEY to activate.
 *
 * When activated:
 *   1. For each supplier with website_url but no contact_linkedin, call
 *      Apollo People Search by domain or Hunter.io domain-search
 *   2. Prioritise titles: CEO, Director, Head of Sales, Commercial Manager,
 *      Business Development Manager, Plant Manager
 *   3. Upsert one contact_name + contact_title + contact_linkedin into
 *      marketplace_listings. Store additional contacts as key_people JSONB.
 *
 * Quota caution: set APOLLO_DAILY_QUOTA or HUNTER_MONTHLY_QUOTA env vars to
 * bound spend.
 *
 * Apollo: https://apollo.io — paid, ~$49/mo for 10k credits, people search = 1 credit
 * Hunter: https://hunter.io — free tier 25 req/mo; paid from $49/mo for 500 req/mo
 *
 * Estimated coverage lift: 20-40% of suppliers (higher where Apollo has captured the company).
 *
 * USAGE (after key is set):
 *   APOLLO_API_KEY=xxx npx tsx scripts/supplier-enrichment/linkedin-decision-maker-lookup.ts [--limit 50] [--dry-run]
 */

import { log } from "./_shared"

async function main() {
  const hasApollo = !!process.env.APOLLO_API_KEY
  const hasHunter = !!process.env.HUNTER_API_KEY
  if (!hasApollo && !hasHunter) {
    log("Neither APOLLO_API_KEY nor HUNTER_API_KEY set — scaffold only.")
    log("   Option A: Apollo (https://apollo.io) — $49/mo for 10k credits")
    log("   Option B: Hunter (https://hunter.io) — free 25/mo, paid from $49/mo")
    log("   Set the respective env var + APOLLO_DAILY_QUOTA / HUNTER_MONTHLY_QUOTA to bound usage.")
    log("   Re-run this script once set.")
    process.exit(0)
  }

  log(`Key present: ${hasApollo ? "Apollo" : "Hunter"} — but enrichment implementation is not yet wired.`)
  log("TODO: implement domain-based people search with title-priority ranking.")
  log("      See scaffold header. A future PR will wire this up.")
  process.exit(0)
}

main().catch((e) => { log("FATAL:", e); process.exit(1) })
