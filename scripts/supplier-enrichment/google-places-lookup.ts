/**
 * @file google-places-lookup.ts — Item #7: Google Business Profile enrichment (SCAFFOLD).
 *
 * STATUS: scaffold — requires GOOGLE_PLACES_API_KEY to activate.
 *
 * When activated:
 *   1. For each UK supplier with city + title, call Places Text Search API
 *   2. Pull place_id, rating, user_ratings_total, opening hours
 *   3. Upsert into marketplace_listings.average_rating + review_count
 *
 * Estimated coverage lift: ~50% of UK suppliers have a Google Business Profile.
 *
 * API setup:
 *   https://developers.google.com/maps/documentation/places/web-service/get-api-key
 *   Enable the Places API on your project. Text Search is ~$32/1000 requests.
 *   With 7,818 UK suppliers ≈ $250 one-off, then periodic re-syncs.
 *
 * USAGE (after key is set):
 *   GOOGLE_PLACES_API_KEY=xxx npx tsx scripts/supplier-enrichment/google-places-lookup.ts [--limit 100] [--dry-run]
 */

import { log } from "./_shared"

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    log("GOOGLE_PLACES_API_KEY not set — scaffold only. See header comment for activation instructions.")
    log("   1. Create a Google Cloud project + enable Places API (new)")
    log("   2. Create an API key, restrict it to Places API")
    log("   3. Budget caution: Text Search is ~$32/1000 req. 7,818 UK suppliers ≈ $250.")
    log("   4. export GOOGLE_PLACES_API_KEY=...")
    log("   5. Re-run this script.")
    process.exit(0)
  }

  log("GOOGLE_PLACES_API_KEY set — but enrichment implementation is not yet wired.")
  log("TODO: implement Text Search lookup + upsert into average_rating / review_count.")
  log("      See scaffold header for the sequence. A future PR will wire this up.")
  process.exit(0)
}

main().catch((e) => { log("FATAL:", e); process.exit(1) })
