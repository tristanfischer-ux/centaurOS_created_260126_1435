/**
 * seed-haps-today-data.ts
 *
 * Seeds ancillary rows the Today page reads — runway, anchor milestone,
 * strategic goal, top tasks, ops summary, product. Keeps the HAPS UAV
 * project as the thematic centre so all surfaces tell a coherent story.
 *
 * Idempotent: every insert keys off a deterministic UUID or a seed-tagged
 * marker so reruns overwrite / don't duplicate.
 *
 * Run: npx tsx scripts/seed-haps-today-data.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { v5 as uuidv5 } from "uuid"

dotenv.config({ path: ".env.local" })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const TEST_USER_EMAIL = "claude-test@forgeos.test"
const FOUNDRY_ID = "claude-test-foundry"
const HAPS_PROJECT_ID = "3711dffd-8881-500a-b7d8-1c900eb4c41a"
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

function uid(seed: string): string {
    return uuidv5(`haps-today-${seed}`, NAMESPACE)
}

function daysAhead(days: number, hour = 12): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    d.setUTCHours(hour, 0, 0, 0)
    return d.toISOString()
}

function daysAgo(days: number, hour = 12): string {
    return daysAhead(-days, hour)
}

async function main() {
    console.log("\n▶ Seeding Today-page data for HAPS foundry …\n")

    const { data: profile } = await supabase
        .from("profiles")
        .select("id, foundry_id")
        .eq("email", TEST_USER_EMAIL)
        .maybeSingle()
    if (!profile || profile.foundry_id !== FOUNDRY_ID) {
        console.error(`Test user not found or in wrong foundry.`)
        process.exit(1)
    }
    const userId = profile.id as string
    console.log(`  ✓ Test user: ${userId}`)

    // ── 1. Strategic goal (anchor milestone + waiting-on-you source) ──
    // Upsert a strategic goal with milestone_date 11 days out so the 14-day
    // risk horizon renders an anchor.
    const strategicGoalId = uid("strategic-goal-haps-ship")
    const { error: goalErr } = await supabase.from("objectives").upsert(
        {
            id: strategicGoalId,
            foundry_id: FOUNDRY_ID,
            creator_id: userId,
            title: "Ship HAPS-S1 to first UK CAA test flight",
            description: "Fly first test flight of Stratosphere HAPS-S1 over the North Sea corridor with UK CAA experimental permit.",
            status: "In Progress",
            progress: 35,
            milestone_date: daysAhead(11, 10),
            is_strategic_goal: true,
            is_milestone: true,
            milestone_order_index: 1,
            workstream: "Product",
            is_private: false,
            is_ghost: false,
            is_demo: false,
        },
        { onConflict: "id" },
    )
    if (goalErr) console.error("  ✗ objectives upsert:", goalErr.message)
    else console.log("  ✓ Strategic goal: anchor milestone in 11 days")

    // Two more milestones inside the 14-day horizon so the horizon markers
    // are populated (not just the anchor dot).
    const horizonGoals = [
        {
            id: uid("horizon-brief-lock"),
            title: "Lock Brief · Revision B (EASA DOA target)",
            milestone_date: daysAhead(5, 11),
            order_index: 2,
        },
        {
            id: uid("horizon-supplier-onboard"),
            title: "Onboard Astra Composites after AS9100 renewal",
            milestone_date: daysAhead(13, 14),
            order_index: 3,
        },
    ]
    for (const m of horizonGoals) {
        const { error } = await supabase.from("objectives").upsert(
            {
                id: m.id,
                foundry_id: FOUNDRY_ID,
                creator_id: userId,
                title: m.title,
                status: "In Progress",
                progress: 10,
                milestone_date: m.milestone_date,
                is_strategic_goal: false,
                is_milestone: true,
                milestone_order_index: m.order_index,
                is_private: false,
                is_ghost: false,
                is_demo: false,
            },
            { onConflict: "id" },
        )
        if (error) console.error(`  ✗ milestone ${m.title}:`, error.message)
    }
    console.log(`  ✓ Horizon markers: ${horizonGoals.length}`)

    // ── 2. Tasks (topTasks + queue + overdueCount) ──
    // Delete prior HAPS-seeded tasks so reruns don't duplicate.
    await supabase
        .from("tasks")
        .delete()
        .eq("foundry_id", FOUNDRY_ID)
        .eq("metadata->>seeded", "haps-today")

    const taskRows = [
        {
            id: uid("task-chase-astra"),
            foundry_id: FOUNDRY_ID,
            objective_id: strategicGoalId,
            creator_id: userId,
            assignee_id: userId,
            title: "Chase Astra for AS9100 renewal timeline",
            description: "Astra's AS9100 cert expired 14 Mar 2026 — blocks wing-spar supply until renewed. Get a dated commitment by end of week.",
            status: "Pending",
            risk_level: "High",
            task_type: "external_action",
            end_date: daysAgo(1, 17),
            start_date: daysAgo(3, 10),
            is_private: false,
            is_ghost: false,
            is_demo: false,
            is_draft: false,
            is_pinned: true,
            workstream: "Supply Chain",
            horizon: "this_week",
            origin: "manual",
            task_number: 1001,
            metadata: { seeded: "haps-today" },
        },
        {
            id: uid("task-easa-doa"),
            foundry_id: FOUNDRY_ID,
            objective_id: strategicGoalId,
            creator_id: userId,
            assignee_id: userId,
            title: "Submit EASA Part 21 DOA scope memo",
            description: "Design Organisation Approval scope memo — define limits for HAPS-S1 (airframe + flight control FW only).",
            status: "Pending",
            risk_level: "Medium",
            task_type: "content",
            end_date: daysAhead(2, 17),
            start_date: daysAgo(4, 10),
            is_private: false,
            is_ghost: false,
            is_demo: false,
            is_draft: false,
            is_pinned: false,
            workstream: "Compliance",
            horizon: "this_week",
            origin: "manual",
            task_number: 1002,
            metadata: { seeded: "haps-today" },
        },
        {
            id: uid("task-iridium-quote"),
            foundry_id: FOUNDRY_ID,
            objective_id: strategicGoalId,
            creator_id: userId,
            assignee_id: userId,
            title: "Lock Iridium Certus 700 airtime quote",
            description: "Airtime contract for first 12 flights — not in hardware BOM. 5-year term quoted at £48/kg/month.",
            status: "Pending",
            risk_level: "Low",
            task_type: "external_action",
            end_date: daysAhead(5, 17),
            start_date: daysAgo(1, 10),
            is_private: false,
            is_ghost: false,
            is_demo: false,
            is_draft: false,
            is_pinned: false,
            workstream: "Supply Chain",
            horizon: "this_week",
            origin: "manual",
            task_number: 1003,
            metadata: { seeded: "haps-today" },
        },
    ]

    const { error: taskInsErr } = await supabase.from("tasks").insert(taskRows)
    if (taskInsErr) console.error("  ✗ tasks insert:", taskInsErr.message)
    else console.log(`  ✓ Tasks: ${taskRows.length} (1 overdue, 2 upcoming)`)

    // ── 3. Finance — cost items + wallet balance ──
    // money_map_cost_items (monthly burn proxy)
    // NOTE: money_map_cost_items.source is constrained to 'manual' | 'auto'.
    // We can't tag our seed rows distinctly in that column, so prune by
    // foundry_id + description-prefix (all our descriptions start with the
    // known Bristol / HAPS context strings) using name as the discriminator.
    const ourCostNames = [
        "Salaries (founders + 2 engineers)",
        "Bristol workshop — rent + utilities",
        "Composite materials + autoclave",
        "Software & tooling",
        "Compliance & insurance",
    ]
    await supabase
        .from("money_map_cost_items")
        .delete()
        .eq("foundry_id", FOUNDRY_ID)
        .in("name", ourCostNames)

    // NOTE: money_map_cost_items.category is constrained to:
    //   personnel | infrastructure | marketing | operations | other
    // Put the human-readable label in the `name` field.
    const costItems = [
        { name: "Salaries (founders + 2 engineers)", category: "personnel", amount: 28000, description: "Founders + 2 engineers (part-time)" },
        { name: "Bristol workshop — rent + utilities", category: "infrastructure", amount: 3400, description: "Bristol workshop" },
        { name: "Composite materials + autoclave", category: "operations", amount: 6200, description: "Prepreg + autoclave time (monthly average)" },
        { name: "Software & tooling", category: "infrastructure", amount: 1850, description: "CAD + sims + ERP" },
        { name: "Compliance & insurance", category: "operations", amount: 2100, description: "AS9100 audit + public liability + aerospace cover" },
    ]
    const costRows = costItems.map((c, i) => ({
        foundry_id: FOUNDRY_ID,
        name: c.name,
        category: c.category,
        amount: c.amount,
        currency: "GBP",
        period: "monthly",
        cost_type: "indirect",
        source: "manual",
        description: c.description,
        sort_order: i,
        is_active: true,
    }))
    const { error: costErr } = await supabase.from("money_map_cost_items").insert(costRows)
    if (costErr) console.error("  ✗ money_map_cost_items insert:", costErr.message)
    else console.log(`  ✓ Monthly costs: £${costRows.reduce((a, c) => a + c.amount, 0).toLocaleString("en-GB")}/mo`)

    // account_balances — wallet (cashPosition in pence)
    const walletBalancePence = 32_500_000 // £325 000 cash
    const { error: balErr } = await supabase
        .from("account_balances")
        .upsert(
            {
                user_id: userId,
                balance_amount: walletBalancePence,
                currency: "GBP",
                last_topped_up_at: daysAgo(21, 9),
            },
            { onConflict: "user_id" },
        )
    if (balErr) console.error("  ✗ account_balances upsert:", balErr.message)
    else console.log(`  ✓ Wallet: £${(walletBalancePence / 100).toLocaleString("en-GB")} cash`)

    // ── 4. Product (for operations shippedProducts + products surface) ──
    const productId = uid("product-haps-s1")
    const { error: prodErr } = await supabase.from("products").upsert(
        {
            id: productId,
            foundry_id: FOUNDRY_ID,
            created_by: userId,
            name: "Stratosphere HAPS-S1",
            description: "Solar-powered high-altitude pseudo-satellite with 30-day endurance at FL650.",
            lifecycle: "prototyping",
            unit_price_pence: 15_000_000,
            target_monthly_units: 4,
            cad_lab_project_id: HAPS_PROJECT_ID,
        },
        { onConflict: "id" },
    )
    if (prodErr) console.error("  ✗ products upsert:", prodErr.message)
    else console.log("  ✓ Product: HAPS-S1 linked to cad_lab project")

    console.log("\n✅ Today-page seed complete.\n")
}

main().catch((err) => {
    console.error("Unhandled seed error:", err)
    process.exit(1)
})
