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
// Tier 2: Pattern / substring rules (checked when no exact match exists)
// Order matters — first match wins. Put specific rules before catch-alls.
// A canonical of "" means "remove the company_type field entirely".
// ---------------------------------------------------------------------------

const PATTERN_RULES: { test: (val: string) => boolean; canonical: string }[] = [
  // CNC variants: "CNC Machining (Aerospace)", "CNC Machining (Medical)", etc.
  { test: (v) => v.startsWith("CNC Machining ("), canonical: "CNC Machining" },
  // 3D Printing with / instead of &, or bare "Additive Manufacturing"
  {
    test: (v) => v.includes("3D Printing") || v.includes("Additive Manufacturing"),
    canonical: "3D Printing & Additive Manufacturing",
  },
  // Surface Treatment without "& Finishing", plus individual finishing processes
  {
    test: (v) =>
      v === "Surface Treatment" ||
      v.includes("Anodising") ||
      v.includes("Anodizing") ||
      v.includes("Electroplating") ||
      v.includes("Powder Coating") ||
      v.includes("Plating") ||
      v === "Heat Treatment",
    canonical: "Surface Treatment & Finishing",
  },
  // Sheet Metal variants
  {
    test: (v) =>
      v === "Metal Fabrication" || v === "Sheet Metal" || v.includes("Metal Spinning"),
    canonical: "Sheet Metal Fabrication",
  },
  // Electronics
  {
    test: (v) =>
      v === "PCB" ||
      v.includes("PCB Assembly") ||
      v === "EMS" ||
      v === "Electronic Manufacturing",
    canonical: "Electronics Manufacturing",
  },
  // Injection molding UK spelling
  {
    test: (v) => v.includes("Injection Moulding") || v === "Plastic Injection",
    canonical: "Injection Molding",
  },
  // Composites
  {
    test: (v) =>
      v === "Composites" ||
      v.includes("Carbon Fibre") ||
      v.includes("Carbon Fiber") ||
      v === "GRP" ||
      v.includes("Fibreglass"),
    canonical: "Composites & Advanced Materials",
  },
  // Welding
  { test: (v) => v === "Welding" || v === "Structural Steel", canonical: "Welding & Fabrication" },
  // Contract Manufacturing
  {
    test: (v) => v === "Assembly" || v === "Contract Manufacturing",
    canonical: "Contract Manufacturing & Assembly",
  },
  // Springs/Fasteners/Gears
  {
    test: (v) => v === "Springs" || v === "Fasteners" || v === "Gears",
    canonical: "Springs, Fasteners & Gears",
  },
  // Rubber
  {
    test: (v) => v === "Rubber Moulding" || v === "Rubber Molding",
    canonical: "Rubber Moulding & Extrusion",
  },
  // Forging
  {
    test: (v) => v === "Forging" || v === "Stamping" || v === "Pressing",
    canonical: "Forging & Pressing",
  },
  // Laser/Waterjet
  {
    test: (v) =>
      v === "Laser Cutting" ||
      v.includes("Waterjet") ||
      v.includes("Water Jet") ||
      v === "EDM",
    canonical: "Laser & Waterjet Cutting",
  },
  // CNC catch-all (after specific CNC rules above)
  {
    test: (v) =>
      v === "CNC" || v === "Precision Engineering" || v === "Turned Parts" || v === "Wire EDM",
    canonical: "CNC Machining",
  },
  // Extrusion (but not Rubber Extrusion — that's already handled above)
  { test: (v) => v.includes("Extrusion") && !v.includes("Rubber"), canonical: "Extrusion" },
  // Casting variants (but not bare "Casting" which is already canonical)
  { test: (v) => v.includes("Casting") && v !== "Casting", canonical: "Casting" },
  // Clean up placeholder entries
  { test: (v) => v === "placeholder", canonical: "" },
  // ── VC-backed hardware & remaining unmapped types ──
  {
    test: (v) => /ai.*(chip|silicon|hardware|compute|accelerat)/i.test(v),
    canonical: "AI & Compute Hardware",
  },
  { test: (v) => /quantum/i.test(v), canonical: "Quantum Technology" },
  {
    test: (v) => /robot|autonomous/i.test(v),
    canonical: "Robotics & Automation",
  },
  {
    test: (v) => /clean.?tech|green.?tech|carbon/i.test(v),
    canonical: "Clean Technology",
  },
  {
    test: (v) => /space|satellite|launch/i.test(v),
    canonical: "Space Technology",
  },
  {
    test: (v) => /bio.?tech|life.?science|pharma/i.test(v),
    canonical: "Biotechnology",
  },
  {
    test: (v) => /semicon/i.test(v),
    canonical: "Semiconductor Manufacturing",
  },
  {
    test: (v) => /fibre|fiber|optical/i.test(v),
    canonical: "Fibre Optics & Photonics",
  },
  {
    test: (v) => /drone|uav/i.test(v),
    canonical: "Drone & UAV Manufacturing",
  },
  {
    test: (v) => /batter|energy.?storage/i.test(v),
    canonical: "Battery & Energy Storage",
  },
  { test: (v) => /packaging/i.test(v), canonical: "Packaging Manufacturing" },
  {
    test: (v) => /textile|weav|knit/i.test(v),
    canonical: "Textile Manufacturing",
  },
  { test: (v) => /glass/i.test(v), canonical: "Glass Manufacturing" },
  { test: (v) => /ceramic/i.test(v), canonical: "Ceramic Manufacturing" },
  {
    test: (v) => /metrol|inspect|testing.*lab/i.test(v),
    canonical: "Metrology & Testing",
  },
];

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

    // Tier 1: exact match (case-insensitive)
    let normalized = normMap.get(current.toLowerCase());

    // Tier 2: pattern / substring match (case-sensitive, original value)
    if (normalized === undefined) {
      for (const rule of PATTERN_RULES) {
        if (rule.test(current)) {
          normalized = rule.canonical;
          break;
        }
      }
    }

    if (normalized === undefined) continue; // no mapping for this value
    if (current === normalized) continue; // already canonical

    // If normalized is empty string, we want to remove the company_type
    // (for "placeholder" entries)
    changeSummary.push({ id: listing.id, from: current, to: normalized || "(removed)" });

    if (!dryRun) {
      const updatedAttributes = { ...listing.attributes };
      if (normalized) {
        (updatedAttributes as Record<string, unknown>).company_type = normalized;
      } else {
        delete (updatedAttributes as Record<string, unknown>).company_type;
      }

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
