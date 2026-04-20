/**
 * seed-haps-suppliers.ts
 *
 * Seeds 7 HAPS-relevant suppliers into the global suppliers directory and
 * shortlists them against the Stratosphere HAPS-S1 project. The Workspace
 * + Suppliers pages read from these rows so the "Who's on the hook" card
 * surfaces real supplier names instead of "0 suppliers".
 *
 * Idempotent: deterministic UUIDs + supplier_id slugs.
 *
 * Run: npx tsx scripts/seed-haps-suppliers.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { v5 as uuidv5 } from "uuid"

dotenv.config({ path: ".env.local" })

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SB_URL, SVC_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const TEST_USER_EMAIL = "claude-test@forgeos.test"
const HAPS_PROJECT_ID = "3711dffd-8881-500a-b7d8-1c900eb4c41a"
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
const uid = (s: string) => uuidv5(`haps-suppliers-${s}`, NAMESPACE)

interface SeedSupplier {
    slug: string
    name: string
    description: string
    website: string
    supplier_type: "manufacturer" | "component" | "integrator" | "certifier" | "service"
    domain_categories: string[]
    capabilities: Record<string, unknown>
    company_info: Record<string, unknown>
    community_rating: number
    review_count: number
    used_by_count: number
    matchedModules: string[]
    matchScore: number
    rampRole: "primary" | "secondary" | "backup"
    matchReasons: string[]
}

const SUPPLIERS: SeedSupplier[] = [
    {
        slug: "astra-composites",
        name: "Astra Composites Ltd",
        description:
            "UK-based aerospace composites manufacturer. Prepreg lay-up, RTM, and autoclave capacity up to 25 m part length. AS9100D certified (renewal in progress).",
        website: "https://astra-composites.example.com",
        supplier_type: "manufacturer",
        domain_categories: ["aerospace", "composites", "primary-structure"],
        capabilities: {
            processes: ["prepreg-layup", "rtm", "autoclave", "5-axis-mill"],
            materials: ["CFRP", "T700", "T800", "Kevlar"],
            max_part_length_m: 25,
            certifications: ["AS9100D (renewal in progress 2026-03-14)"],
        },
        company_info: { hq: "Bristol, UK", employees: 140, founded: 2008 },
        community_rating: 4.6,
        review_count: 28,
        used_by_count: 47,
        matchedModules: ["wing_structure", "fuselage_central", "tail_assembly"],
        matchScore: 0.92,
        rampRole: "primary",
        matchReasons: ["prepreg capacity", "25 m part length", "UK-based ITAR-free"],
    },
    {
        slug: "intelligent-energy",
        name: "Intelligent Energy",
        description:
            "Loughborough-based PEM fuel cell manufacturer. IE-SOAR 4 kW modules suited for HAPS endurance. ISO 9001 + aerospace derivative programme.",
        website: "https://www.intelligent-energy.com",
        supplier_type: "component",
        domain_categories: ["fuel-cells", "propulsion", "hydrogen"],
        capabilities: {
            products: ["IE-SOAR 4 kW PEM stack", "IE-LIFT 2 kW module"],
            cell_chemistry: "PEM",
            peak_power_kw: 4,
            certifications: ["ISO 9001", "DO-160G (in review)"],
        },
        company_info: { hq: "Loughborough, UK", employees: 320, founded: 2001 },
        community_rating: 4.4,
        review_count: 14,
        used_by_count: 22,
        matchedModules: ["propulsion_pods"],
        matchScore: 0.88,
        rampRole: "primary",
        matchReasons: ["4 kW PEM stack fits endurance budget", "UK-based", "aerospace derivative road-map"],
    },
    {
        slug: "maxeon-solar",
        name: "Maxeon Solar Technologies",
        description:
            "High-efficiency IBC cell manufacturer (26%+). Flexible laminates suitable for HAPS upper-wing skin integration. EU shipments from Malta plant.",
        website: "https://maxeon.com",
        supplier_type: "component",
        domain_categories: ["solar", "photovoltaic", "flexible-cells"],
        capabilities: {
            products: ["Maxeon 7 IBC cells", "Flexible laminate SP-F"],
            cell_efficiency_pct: 26,
            substrates: ["PET", "TPT"],
            certifications: ["IEC 61215", "IEC 61646"],
        },
        company_info: { hq: "Singapore (EU: Malta plant)", employees: 3200, founded: 1985 },
        community_rating: 4.7,
        review_count: 42,
        used_by_count: 89,
        matchedModules: ["solar_array"],
        matchScore: 0.90,
        rampRole: "primary",
        matchReasons: ["26% IBC cells", "flexible laminate ready", "EU supply from Malta"],
    },
    {
        slug: "samsung-sdi",
        name: "Samsung SDI",
        description:
            "21700 Li-ion cell manufacturer — 50GB cell well-suited for HAPS night-cycle pack. 14-week lead on 500-pack orders.",
        website: "https://www.samsungsdi.com",
        supplier_type: "component",
        domain_categories: ["batteries", "lithium-ion", "cells"],
        capabilities: {
            products: ["Samsung 50GB 21700", "50E 21700"],
            chemistry: "Li-ion NMC",
            capacity_ah: 5.0,
            certifications: ["UN 38.3", "IEC 62133"],
        },
        company_info: { hq: "Yongin, Korea", employees: 11000, founded: 1991 },
        community_rating: 4.5,
        review_count: 73,
        used_by_count: 210,
        matchedModules: ["battery_buffer"],
        matchScore: 0.87,
        rampRole: "primary",
        matchReasons: ["50GB cell fits pack voltage", "UN 38.3 ready", "EU distributor"],
    },
    {
        slug: "emrax-motors",
        name: "Emrax d.o.o.",
        description:
            "Slovenian high-power-density brushless motors for electric aviation. Emrax 188 fits HAPS pod size/weight envelope.",
        website: "https://emrax.com",
        supplier_type: "component",
        domain_categories: ["motors", "propulsion", "electric-aviation"],
        capabilities: {
            products: ["Emrax 188", "Emrax 208 MV"],
            peak_power_kw: 9.2,
            weight_kg: 7.3,
            certifications: ["DO-160G (subset)"],
        },
        company_info: { hq: "Kamnik, Slovenia", employees: 85, founded: 2012 },
        community_rating: 4.8,
        review_count: 19,
        used_by_count: 34,
        matchedModules: ["propulsion_pods"],
        matchScore: 0.84,
        rampRole: "primary",
        matchReasons: ["9.2 kW fits pod size", "EU-based", "aviation-graded"],
    },
    {
        slug: "iljin-composites",
        name: "ILJIN Composites",
        description:
            "Korean Type-IV composite hydrogen tank manufacturer. 700 bar, 3.7 kg tank variant suitable for HAPS pod integration.",
        website: "https://iljin.co.kr",
        supplier_type: "component",
        domain_categories: ["hydrogen", "composite-tanks", "pressure-vessels"],
        capabilities: {
            products: ["Type-IV H2 tank 3.7 kg (700 bar)", "Type-IV H2 tank 6.0 kg"],
            working_pressure_bar: 700,
            cycle_life: 15000,
            certifications: ["EC79", "HGV2"],
        },
        company_info: { hq: "Chungju, Korea", employees: 420, founded: 1998 },
        community_rating: 4.3,
        review_count: 8,
        used_by_count: 12,
        matchedModules: ["propulsion_pods"],
        matchScore: 0.82,
        rampRole: "secondary",
        matchReasons: ["Type-IV 700 bar", "3.7 kg mass matches pod budget", "EC79 certified"],
    },
    {
        slug: "iridium-comms",
        name: "Iridium Communications",
        description:
            "Certus 700 satellite data modems for beyond-line-of-sight ISR and telco backhaul. Global coverage incl. polar.",
        website: "https://www.iridium.com",
        supplier_type: "component",
        domain_categories: ["satcom", "comms", "iot"],
        capabilities: {
            products: ["Certus 700 modem", "Edge Pro antenna"],
            throughput_kbps: 704,
            coverage: "global including poles",
            certifications: ["FCC Part 25", "CE"],
        },
        company_info: { hq: "McLean, VA, USA", employees: 580, founded: 2000 },
        community_rating: 4.4,
        review_count: 56,
        used_by_count: 135,
        matchedModules: ["comms_satlink"],
        matchScore: 0.86,
        rampRole: "primary",
        matchReasons: ["polar coverage for FL650 missions", "BLOS comms", "proven HAPS precedent"],
    },
]

async function main() {
    console.log("\n▶ Seeding HAPS suppliers …\n")

    const { data: profile } = await supabase
        .from("profiles")
        .select("id, foundry_id")
        .eq("email", TEST_USER_EMAIL)
        .maybeSingle()
    if (!profile) {
        console.error("Test user not found.")
        process.exit(1)
    }
    const userId = profile.id as string

    // 1. Upsert each supplier into the global suppliers directory
    for (const s of SUPPLIERS) {
        const supplierId = uid(`supplier-${s.slug}`)
        const { error } = await supabase.from("suppliers").upsert(
            {
                id: supplierId,
                name: s.name,
                description: s.description,
                website: s.website,
                supplier_type: s.supplier_type,
                domain_categories: s.domain_categories,
                capabilities: s.capabilities,
                company_info: s.company_info,
                verification_status: "verified",
                verified_at: new Date().toISOString(),
                community_rating: s.community_rating,
                review_count: s.review_count,
                used_by_count: s.used_by_count,
            },
            { onConflict: "id" },
        )
        if (error) console.error(`  ✗ suppliers upsert [${s.slug}]:`, error.message)
    }
    console.log(`  ✓ Global suppliers: ${SUPPLIERS.length} upserted`)

    // 2. Clear + re-insert project shortlist
    await supabase.from("forge_supplier_shortlist").delete().eq("project_id", HAPS_PROJECT_ID)

    const shortlistRows = SUPPLIERS.map((s, i) => ({
        id: uid(`shortlist-${s.slug}`),
        project_id: HAPS_PROJECT_ID,
        supplier_id: uid(`supplier-${s.slug}`),
        supplier_name: s.name,
        is_verified: true,
        supplier_type: s.supplier_type,
        module_ids: s.matchedModules,
        best_match_score: s.matchScore,
        best_score_breakdown: { reasons: s.matchReasons, matched_modules: s.matchedModules.length },
        all_match_reasons: s.matchReasons,
        ramp_role: s.rampRole,
        notes: s.description,
        added_by: userId,
        added_at: new Date(Date.now() - i * 86400000).toISOString(),
    }))

    const { error: slErr } = await supabase.from("forge_supplier_shortlist").insert(shortlistRows)
    if (slErr) console.error("  ✗ forge_supplier_shortlist insert:", slErr.message)
    else console.log(`  ✓ Project shortlist: ${shortlistRows.length} suppliers linked to HAPS-S1`)

    console.log("\n✅ Supplier seed complete.\n")
}

main().catch((err) => {
    console.error("Unhandled seed error:", err)
    process.exit(1)
})
