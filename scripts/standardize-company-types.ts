#!/usr/bin/env npx tsx

import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

// ---------------------------------------------------------------------------
// Load .env.local
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

// ---------------------------------------------------------------------------
// Normalization map (case-insensitive key → canonical value)
// ---------------------------------------------------------------------------

const NORMALIZATION_ENTRIES: [string, string][] = [
  ["CNC", "CNC Machining"],
  ["cnc machining", "CNC Machining"],
  ["Metal Fabrication", "Sheet Metal Fabrication"],
  ["sheet metal", "Sheet Metal Fabrication"],
  ["EDM", "Laser & Waterjet Cutting"],
  ["edm machining", "Laser & Waterjet Cutting"],
  ["Electroplating", "Surface Treatment & Finishing"],
  ["Plating", "Surface Treatment & Finishing"],
  ["Anodising", "Surface Treatment & Finishing"],
  ["Anodizing", "Surface Treatment & Finishing"],
  ["Powder Coating", "Surface Treatment & Finishing"],
  ["Heat Treatment", "Surface Treatment & Finishing"],
  ["Injection Moulding", "Injection Molding"],
  ["injection moulding", "Injection Molding"],
  ["Plastic Injection", "Injection Molding"],
  ["3d printing", "3D Printing & Additive Manufacturing"],
  ["Additive Manufacturing", "3D Printing & Additive Manufacturing"],
  ["3D Printing", "3D Printing & Additive Manufacturing"],
  ["Rapid Prototyping", "3D Printing & Additive Manufacturing"],
  ["Die Casting", "Casting"],
  ["Sand Casting", "Casting"],
  ["Investment Casting", "Casting"],
  ["Rubber Moulding", "Rubber Moulding & Extrusion"],
  ["Rubber Molding", "Rubber Moulding & Extrusion"],
  ["Laser Cutting", "Laser & Waterjet Cutting"],
  ["Waterjet", "Laser & Waterjet Cutting"],
  ["Water Jet", "Laser & Waterjet Cutting"],
  ["Stamping", "Forging & Pressing"],
  ["Pressing", "Forging & Pressing"],
  ["Forging", "Forging & Pressing"],
  ["PCB", "Electronics Manufacturing"],
  ["pcb assembly", "Electronics Manufacturing"],
  ["EMS", "Electronics Manufacturing"],
  ["Electronic Manufacturing", "Electronics Manufacturing"],
  ["Wire EDM", "CNC Machining"],
  ["Turned Parts", "CNC Machining"],
  ["Precision Engineering", "CNC Machining"],
  ["Welding", "Welding & Fabrication"],
  ["Structural Steel", "Welding & Fabrication"],
  ["Metal Spinning", "Sheet Metal Fabrication"],
  ["Springs", "Springs, Fasteners & Gears"],
  ["Fasteners", "Springs, Fasteners & Gears"],
  ["Gears", "Springs, Fasteners & Gears"],
  ["Composites", "Composites & Advanced Materials"],
  ["Carbon Fibre", "Composites & Advanced Materials"],
  ["Carbon Fiber", "Composites & Advanced Materials"],
  ["GRP", "Composites & Advanced Materials"],
  ["Fibreglass", "Composites & Advanced Materials"],
  ["Assembly", "Contract Manufacturing & Assembly"],
  ["Contract Manufacturing", "Contract Manufacturing & Assembly"],
  ["Extrusion", "Extrusion"],
  ["Aluminium Extrusion", "Extrusion"],
  ["Plastic Extrusion", "Extrusion"],
];

// Build a lowercase lookup map. Later entries for the same lowercase key
// overwrite earlier ones, but all provided pairs share the same canonical
// target for any given lowercase key so this is fine.
const normMap = new Map<string, string>();
for (const [variant, canonical] of NORMALIZATION_ENTRIES) {
  normMap.set(variant.toLowerCase(), canonical);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Listing {
  id: string;
  attributes: Record<string, unknown>;
}

async function main() {
  console.log(
    dryRun
      ? "=== DRY RUN — no updates will be written ===\n"
      : "=== LIVE RUN — updates will be applied ===\n"
  );

  // Fetch all listings that have a non-null company_type.
  // Supabase JS doesn't natively support `attributes->>'company_type' IS NOT NULL`
  // in the PostgREST filter, so we fetch rows where attributes is not null and
  // filter client-side.
  const PAGE_SIZE = 1000;
  let allListings: Listing[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, attributes")
      .not("attributes", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Error fetching listings:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allListings = allListings.concat(data as Listing[]);
      from += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    }
  }

  // Filter to rows that actually have a company_type value
  const withCompanyType = allListings.filter(
    (l) =>
      l.attributes &&
      typeof l.attributes === "object" &&
      typeof (l.attributes as Record<string, unknown>).company_type === "string" &&
      ((l.attributes as Record<string, unknown>).company_type as string).trim() !== ""
  );

  console.log(`Total listings with company_type: ${withCompanyType.length}`);

  const changeSummary: { id: string; from: string; to: string }[] = [];

  for (const listing of withCompanyType) {
    const current = (listing.attributes as Record<string, unknown>)
      .company_type as string;
    const normalized = normMap.get(current.toLowerCase());

    if (normalized === undefined) continue; // no mapping for this value
    if (current === normalized) continue; // already canonical

    changeSummary.push({ id: listing.id, from: current, to: normalized });

    if (!dryRun) {
      const updatedAttributes = {
        ...listing.attributes,
        company_type: normalized,
      };

      const { error } = await supabase
        .from("marketplace_listings")
        .update({ attributes: updatedAttributes })
        .eq("id", listing.id);

      if (error) {
        console.error(`  Error updating listing ${listing.id}:`, error.message);
      }
    }
  }

  // Print results
  console.log(`Total updated: ${changeSummary.length}\n`);

  if (changeSummary.length === 0) {
    console.log("No changes needed — all company_type values are already canonical.");
    return;
  }

  // Breakdown by change
  const breakdown = new Map<string, number>();
  for (const { from, to } of changeSummary) {
    const key = `"${from}" → "${to}"`;
    breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
  }

  console.log("Breakdown of changes:");
  for (const [change, count] of [...breakdown.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${change}: ${count}`);
  }

  // Individual listing log
  console.log(`\nPer-listing detail:`);
  for (const { id, from, to } of changeSummary) {
    console.log(`  [${id}] "${from}" → "${to}"`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
