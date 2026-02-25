#!/usr/bin/env npx tsx

/**
 * One-off backfill script: Patch ch_company_size on marketplace_listings
 * that have a companies_house_number in their attributes JSONB.
 *
 * Usage:
 *   npx tsx scripts/patch-company-size.ts
 *   npx tsx scripts/patch-company-size.ts --dry-run
 *   npx tsx scripts/patch-company-size.ts --limit 10
 *   npx tsx scripts/patch-company-size.ts --dry-run --limit 5
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

// ---------------------------------------------------------------------------
// Load .env.local (same pattern as import-vcpe-to-marketplace.ts)
// ---------------------------------------------------------------------------
const __dirname_compat = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname_compat, "../.env.local")
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    const val = rest.join("=").replace(/^['"]|['"]$/g, "")
    if (key && !(key in process.env)) {
      process.env[key.trim()] = val.trim()
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

if (!COMPANIES_HOUSE_API_KEY) {
  console.error("Missing COMPANIES_HOUSE_API_KEY in .env.local")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIndex = args.indexOf("--limit");
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : undefined;

if (DRY_RUN) console.log("🏷  DRY RUN — no writes will be made\n");
if (LIMIT) console.log(`🏷  LIMIT — processing at most ${LIMIT} listings\n`);

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Companies House helpers
// ---------------------------------------------------------------------------

const CH_BASE = "https://api.company-information.service.gov.uk";
const CH_AUTH = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString("base64");

const ACCOUNT_TYPE_TO_SIZE: Record<string, string> = {
  "micro-entity": "Micro",
  "total-exemption-full": "Micro",

  small: "Small",
  "total-exemption-small": "Small",
  "unaudited-abridged": "Small",
  "audit-exemption-subsidiary": "Small",
  "filing-exemption-subsidiary": "Small",

  medium: "Medium",
  "partial-exemption": "Medium",
  "audited-abridged": "Medium",

  full: "Large",
  group: "Large",

  dormant: "Dormant",
};

function mapAccountTypeToSize(accountType: string | undefined | null): string {
  if (!accountType) return "Unknown";
  return ACCOUNT_TYPE_TO_SIZE[accountType] ?? "Unknown";
}

async function fetchCompanyProfile(companyNumber: string): Promise<{
  accountType: string | null;
  error: string | null;
}> {
  try {
    const res = await fetch(`${CH_BASE}/company/${companyNumber}`, {
      headers: { Authorization: `Basic ${CH_AUTH}` },
    });

    if (!res.ok) {
      return { accountType: null, error: `HTTP ${res.status} ${res.statusText}` };
    }

    const data = await res.json();
    const accountType: string | null =
      data?.accounts?.last_accounts?.type ?? null;

    return { accountType, error: null };
  } catch (err: any) {
    return { accountType: null, error: err.message ?? String(err) };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Fetch listings that have a CH number under EITHER attribute key.
  // INTENT: Older listings use "companies_house_number", newer CH-enriched ones
  // use "ch_company_number". We need to query both to cover the full dataset.
  const allListings: { id: string; attributes: Record<string, unknown> }[] = [];
  const seenIds = new Set<string>();

  for (const attrKey of ["companies_house_number", "ch_company_number"]) {
    let query = supabase
      .from("marketplace_listings")
      .select("id, attributes")
      .not(`attributes->>${attrKey}`, "is", null);

    if (LIMIT) {
      query = query.limit(LIMIT);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch listings (${attrKey}):`, error.message);
      process.exit(1);
    }

    for (const row of data ?? []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        allListings.push(row as { id: string; attributes: Record<string, unknown> });
      }
    }
  }

  const listings = allListings;

  if (listings.length === 0) {
    console.log("No listings found with a CH company number. Nothing to do.");
    return;
  }

  console.log(`Found ${listings.length} listing(s) with a CH company number\n`);

  // Stats
  const stats: Record<string, number> = {};
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = listing.attributes as Record<string, any>;
    // Support both attribute key names
    const companyNumber: string = attrs.ch_company_number ?? attrs.companies_house_number;

    // Skip if already has ch_company_size
    if (attrs.ch_company_size) {
      console.log(
        `[${i + 1}/${listings.length}] ${listing.id} (${companyNumber}) — already has ch_company_size="${attrs.ch_company_size}", skipping`
      );
      skipped++;
      continue;
    }

    // Rate-limit: 0.12s between calls (600 req/min)
    if (i > 0) await sleep(120);

    const { accountType, error } = await fetchCompanyProfile(companyNumber);

    if (error) {
      console.log(
        `[${i + 1}/${listings.length}] ${listing.id} (${companyNumber}) — ERROR: ${error}`
      );
      errored++;
      continue;
    }

    const size = mapAccountTypeToSize(accountType);
    stats[size] = (stats[size] ?? 0) + 1;

    console.log(
      `[${i + 1}/${listings.length}] ${listing.id} (${companyNumber}) — account_type="${accountType ?? "N/A"}" → ch_company_size="${size}"${DRY_RUN ? " (dry run)" : ""}`
    );

    if (!DRY_RUN) {
      const newAttrs = { ...attrs, ch_company_size: size };
      const { error: updateError } = await supabase
        .from("marketplace_listings")
        .update({ attributes: newAttrs })
        .eq("id", listing.id);

      if (updateError) {
        console.error(`  ⚠ Update failed: ${updateError.message}`);
        errored++;
        continue;
      }
    }

    updated++;
  }

  // Summary
  console.log("\n--- Summary ---");
  console.log(`Total listings:  ${listings.length}`);
  console.log(`Updated:         ${updated}${DRY_RUN ? " (would update)" : ""}`);
  console.log(`Skipped:         ${skipped} (already had ch_company_size)`);
  console.log(`Errored:         ${errored}`);
  console.log("\nSize distribution:");
  for (const [size, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${size}: ${count}`);
  }

  if (DRY_RUN) {
    console.log("\nDry run complete — no changes were written.");
  } else {
    console.log("\nDone.");
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
