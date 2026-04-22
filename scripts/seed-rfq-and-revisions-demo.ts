/**
 * seed-rfq-and-revisions-demo.ts
 *
 * Seeds demo rows so /the-forge-v2/projects/:id/request and
 * /the-forge-v2/projects/:id/revisions/merge render populated instead of
 * their empty-state gates.
 *
 * WHAT THIS CREATES (per project):
 *   - 3 rows in `forge_supplier_shortlist`, each pinned to real modules of
 *     the target project, with a mix of `ramp_role` values (production,
 *     pilot, proto_only) and varied match scores. These are the three
 *     quote-state proxies the mockup calls "quoted / pending / declined" —
 *     the current page data contract surfaces ramp_role + match_score, not a
 *     quotes table, so we vary those honestly.
 *   - Enough rows in `brief_revisions` to reach 3 revisions total (Rev A,
 *     Rev B, Rev C). Each row has a realistic label + summary so the merge
 *     cockpit has non-trivial diff content.
 *
 * IDEMPOTENCE:
 *   - forge_supplier_shortlist has a UNIQUE (project_id, supplier_id)
 *     constraint — we upsert on that key.
 *   - brief_revisions has UNIQUE (project_id, revision_number) — we upsert
 *     on that key, so reruns do not duplicate.
 *
 * USAGE:
 *   npx tsx scripts/seed-rfq-and-revisions-demo.ts [projectId]
 *   (defaults to the BESS project: b96380cb-878a-47b6-8265-6992c17df138)
 *
 * ENV REQUIRED:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Config ──────────────────────────────────────────────────────────────

const DEFAULT_PROJECT_ID = "b96380cb-878a-47b6-8265-6992c17df138" // BESS project
const projectId = process.argv[2] ?? DEFAULT_PROJECT_ID

// Stable supplier_ids so reruns upsert instead of insert-new.
// These are namespaced "demo-rfq-<slug>" to avoid collision with any real
// marketplace_listings.id values. The page treats supplier_id as opaque text.
const SUPPLIERS = [
    {
        supplier_id: "demo-rfq-zimmermann-mfg",
        supplier_name: "Zimmermann Manufacturing GmbH",
        supplier_type: "Contract Manufacturer",
        ramp_role: "production",          // mockup-equivalent "quoted"
        is_verified: true,
        best_match_score: 0.92,
        all_match_reasons: [
            "Certified to ISO 9001 and ISO 14001",
            "Experience with containerised battery energy storage systems",
            "Based in Germany — matches target deployment region",
        ],
        best_score_breakdown: {
            capability: 0.95,
            region: 0.90,
            capacity: 0.88,
            certifications: 0.96,
        },
    },
    {
        supplier_id: "demo-rfq-nordic-power-systems",
        supplier_name: "Nordic Power Systems AS",
        supplier_type: "Systems Integrator",
        ramp_role: "pilot",               // mockup-equivalent "pending"
        is_verified: false,
        best_match_score: 0.78,
        all_match_reasons: [
            "Specialises in modular power conversion for storage",
            "Lead time indicative — not confirmed",
            "Quote awaiting technical clarification",
        ],
        best_score_breakdown: {
            capability: 0.85,
            region: 0.80,
            capacity: 0.65,
            certifications: 0.80,
        },
    },
    {
        supplier_id: "demo-rfq-astra-composites",
        supplier_name: "Astra Composites Ltd",
        supplier_type: "Component Supplier",
        ramp_role: "proto_only",          // mockup-equivalent "declined" (won't scale)
        is_verified: false,
        best_match_score: 0.42,
        all_match_reasons: [
            "Declined to quote — capacity booked through Q3",
            "Previously supplied thermal lining prototypes only",
            "Recommended Nordic Power Systems as alternative",
        ],
        best_score_breakdown: {
            capability: 0.70,
            region: 0.50,
            capacity: 0.10,
            certifications: 0.60,
        },
    },
]

// Revision history content. Each revision is tied to a specific concrete
// change, so the merge cockpit has real diff text to display in its summary
// column.
const REVISIONS = [
    {
        revision_number: 1,
        revision_label: "Rev A",
        summary:
            "Initial design lock. 8 modules defined across container shell, battery racks, DC distribution, PCS, AC switchgear, HVAC, fire suppression, and SCADA controls.",
    },
    {
        revision_number: 2,
        revision_label: "Rev B",
        summary:
            "Thermal lining swapped from generic mineral wool to rockwool-faced composite. HVAC duty raised from 12 kW to 18 kW to handle peak ambient. PCS inverter family narrowed from 3 candidates to 2 after Zimmermann feedback.",
    },
    {
        revision_number: 3,
        revision_label: "Rev C",
        summary:
            "Fire suppression moved from aerosol to Novec 1230 after insurance review. Added redundant SCADA uplink over cellular + Ethernet. DC distribution uprated for 1500 V DC to reduce copper mass and cost.",
    },
]

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log(`\n▶ Seeding RFQ + revisions demo data for project ${projectId}\n`)

    // 1. Sanity-check the project exists + grab its modules + foundry.
    const { data: project, error: projectErr } = await supabase
        .from("cad_lab_projects")
        .select("id, name, foundry_id, modules")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr || !project) {
        console.error("✗ Could not load target project:", projectErr?.message ?? "not found")
        process.exit(1)
    }

    const foundryId = (project as { foundry_id: string | null }).foundry_id
    if (!foundryId) {
        console.error("✗ Project has no foundry_id — cannot seed brief_revisions (foundry_id NOT NULL)")
        process.exit(1)
    }

    const modules = Array.isArray((project as { modules: unknown }).modules)
        ? ((project as { modules: Array<{ id: string }> }).modules)
        : []
    const moduleIds = modules.map((m) => m.id)
    if (moduleIds.length === 0) {
        console.error("✗ Project has no modules — shortlist rows need module_ids to render meaningfully")
        process.exit(1)
    }

    console.log(`  Project: ${(project as { name: string }).name}`)
    console.log(`  Foundry: ${foundryId}`)
    console.log(`  Modules found: ${moduleIds.length} (${moduleIds.slice(0, 3).join(", ")}…)\n`)

    // 2. Look up a seed profile for added_by / locked_by. Prefer a founder in
    //    the same foundry; fall back to NULL so FK doesn't fail.
    const { data: seedProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("foundry_id", foundryId)
        .limit(1)
        .maybeSingle()

    const seedUserId = (seedProfile as { id: string } | null)?.id ?? null
    console.log(`  Seed user for added_by / locked_by: ${seedUserId ?? "(none — will leave NULL)"}\n`)

    // 3. Upsert shortlist rows. Each supplier is pinned to a rotating pair
    //    of real modules so the "modules" chip area isn't empty.
    console.log("▶ forge_supplier_shortlist — upserting 3 rows")
    for (let i = 0; i < SUPPLIERS.length; i++) {
        const s = SUPPLIERS[i]
        const primary = moduleIds[i % moduleIds.length]
        const secondary = moduleIds[(i + 1) % moduleIds.length]
        const modulesForSupplier = primary === secondary ? [primary] : [primary, secondary]

        const row = {
            project_id: projectId,
            supplier_id: s.supplier_id,
            supplier_name: s.supplier_name,
            supplier_type: s.supplier_type,
            is_verified: s.is_verified,
            module_ids: modulesForSupplier,
            best_match_score: s.best_match_score,
            best_score_breakdown: s.best_score_breakdown,
            all_match_reasons: s.all_match_reasons,
            ramp_role: s.ramp_role,
            notes: null,
            added_by: seedUserId,
        }

        const { error } = await supabase
            .from("forge_supplier_shortlist")
            .upsert(row, { onConflict: "project_id,supplier_id" })
        if (error) {
            console.error(`  ✗ upsert ${s.supplier_id} failed:`, error.message)
            process.exit(1)
        }
        console.log(`  ✓ ${s.supplier_name} (${s.ramp_role}, match ${s.best_match_score}, modules: ${modulesForSupplier.join("+")})`)
    }

    // 4. Upsert brief_revisions — 3 rows (revisions 1/2/3). Revision 1 already
    //    exists in some projects from the brief-lock flow; we rewrite it with
    //    richer copy so the merge cockpit has a meaningful source to diff
    //    against.
    console.log("\n▶ brief_revisions — upserting 3 rows")
    const now = Date.now()
    for (let i = 0; i < REVISIONS.length; i++) {
        const r = REVISIONS[i]
        // Space the rows across the last ~21 days so created_at / locked_at
        // read naturally in the UI.
        const lockedAt = new Date(now - (REVISIONS.length - 1 - i) * 7 * 24 * 60 * 60 * 1000).toISOString()

        const row = {
            project_id: projectId,
            foundry_id: foundryId,
            revision_number: r.revision_number,
            revision_label: r.revision_label,
            summary: r.summary,
            locked_at: lockedAt,
            locked_by: seedUserId,
        }

        const { error } = await supabase
            .from("brief_revisions")
            .upsert(row, { onConflict: "project_id,revision_number" })
        if (error) {
            console.error(`  ✗ upsert revision ${r.revision_number} failed:`, error.message)
            process.exit(1)
        }
        console.log(`  ✓ Revision ${r.revision_number} (${r.revision_label}) — locked ${lockedAt.slice(0, 10)}`)
    }

    // 5. Summary.
    const { count: shortlistCount } = await supabase
        .from("forge_supplier_shortlist")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
    const { count: revisionCount } = await supabase
        .from("brief_revisions")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)

    console.log("\n✔ Done.")
    console.log(`  forge_supplier_shortlist rows for project: ${shortlistCount ?? "?"}`)
    console.log(`  brief_revisions rows for project:          ${revisionCount ?? "?"}`)
    console.log(`\n  Verify at:`)
    console.log(`    /the-forge-v2/projects/${projectId}/request`)
    console.log(`    /the-forge-v2/projects/${projectId}/revisions/merge`)
}

main().catch((err) => {
    console.error("Fatal:", err)
    process.exit(1)
})
