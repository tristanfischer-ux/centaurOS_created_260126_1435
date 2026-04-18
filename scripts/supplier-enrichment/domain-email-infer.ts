/**
 * @file domain-email-infer.ts — Item #2: infer contact_email from website_url.
 *
 * For rows with website_url but no contact_email, try common aliases (sales@,
 * info@, enquiries@, hello@) at the website's domain. Validate the domain's MX
 * records resolve. If MX resolves, write the highest-priority alias as the
 * inferred contact_email — mark it as such in enrichment_sources so callers
 * know it's not explicitly provided.
 *
 * SAFETY: We DON'T verify the inbox accepts mail via SMTP (RCPT TO) — that's
 * noisy and can get your IP blocklisted. MX resolution is enough evidence the
 * domain can receive mail.
 *
 * USAGE:
 *   npx tsx scripts/supplier-enrichment/domain-email-infer.ts [--limit 100] [--dry-run]
 */

import dns from "node:dns/promises"
import { getAdminClient, parseArgs, appendEnrichmentSource, log, sleep } from "./_shared"

const ALIAS_PRIORITY = ["sales", "enquiries", "info", "hello", "contact"]

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, "").toLowerCase()
  } catch { return null }
}

async function hasMx(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain)
    return records.length > 0
  } catch { return false }
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv)
  const supabase = getAdminClient()

  log(`domain-email-infer starting${dryRun ? " (DRY-RUN)" : ""}${limit ? ` limit=${limit}` : ""}`)

  let query = supabase
    .from("marketplace_listings")
    .select("id, title, website_url, contact_email, enrichment_sources")
    .not("website_url", "is", null)
    .is("contact_email", null)
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) { log("fetch error:", error.message); process.exit(1) }
  log(`Candidates: ${data?.length ?? 0}`)

  let inferred = 0
  let nowWithMx = 0
  for (const row of data ?? []) {
    const domain = extractDomain(row.website_url ?? "")
    if (!domain) continue
    const hasMail = await hasMx(domain)
    if (!hasMail) continue
    nowWithMx++
    const inferredEmail = `${ALIAS_PRIORITY[0]}@${domain}`
    if (dryRun) {
      log(`INFER ${row.title} → ${inferredEmail}`)
    } else {
      const { error: upErr } = await supabase
        .from("marketplace_listings")
        .update({
          contact_email: inferredEmail,
          enrichment_sources: appendEnrichmentSource(row.enrichment_sources, "domain_email_infer", ["contact_email"]),
          last_enriched_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      if (upErr) log(`update failed ${row.id}:`, upErr.message)
      else inferred++
    }
    await sleep(150) // polite DNS rate
  }
  log(`Done. Candidates with MX: ${nowWithMx}. Inferred: ${inferred}.`)
}

main().catch((e) => { log("FATAL:", e); process.exit(1) })
