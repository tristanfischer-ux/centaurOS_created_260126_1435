/**
 * @file suppliers/page.tsx — /the-forge-v2/projects/:id/suppliers
 *
 * @description Suppliers artefact — server component that loads only the
 * real, non-fabricated fields for each shortlisted supplier and hands them
 * to SuppliersView.
 *
 * ── Tenant isolation (P0 data-isolation guarantee) ─────────────────────
 * The Suppliers tab is a PROJECT-SCOPED SHORTLIST — not a foundry-wide
 * directory. Founders shortlist suppliers for THIS project via the CAD
 * lab Source stage; this page surfaces that per-project roster and
 * nothing else.
 *
 * Triple-scoped to prevent cross-tenant or cross-project leakage:
 *   1. `loadCadLabProject(id)` enforces auth + foundry scoping —
 *      returns notFound() if the caller's foundry doesn't own the
 *      project, so a logged-in founder of foundry B cannot load
 *      foundry A's project by guessing the URL.
 *   2. `.eq("project_id", projectId)` on forge_supplier_shortlist
 *      filters server-side to rows for THIS project. No other project's
 *      shortlist rows can ever join.
 *   3. RLS policy "view_forge_supplier_shortlist_in_own_foundry" enforces
 *      foundry match at the database level (migration
 *      20260421010000) — defence in depth against a compromised
 *      server-side client.
 *
 * A `[TEST]%` guard also strips any accidentally-seeded test-prefixed
 * supplier names at the query level so founders never see staging
 * fixtures in their production UI.
 *
 * ── Data honesty policy (2026-04-20) ───────────────────────────────────
 * Every field hardcoded per-supplier in `scripts/seed-haps-suppliers.ts`
 * is treated as fabricated and is NOT loaded into the view. We read two
 * values only:
 *   - supplier name (from the shortlist row — stable even if the global
 *     directory renames it)
 *   - HQ city/country (from suppliers.company_info.hq — a public fact
 *     for the companies in the current seed)
 * Everything else (description, supplier_type, capabilities, certifications,
 * ramp role, match score, match reasons, module counts, employees, founded,
 * ratings, verification status) is dropped at the loader boundary so the
 * view physically cannot render seed fabrications.
 *
 * Query-string filters (?role=…, ?type=…) are ignored — they filtered on
 * fabricated columns and are no longer meaningful.
 *
 * @related
 *   - View:   ./suppliers-view.tsx
 *   - Styles: ./suppliers-v2.css (scoped .sp2)
 *   - Seed:   scripts/seed-haps-suppliers.ts
 *   - RLS:    supabase/migrations/20260421010000_forge_supplier_shortlist.sql
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { generateSupplierMatchOutputs } from "@/actions/supplier-match-generation"
import type { SupplierMatchOutput } from "@/actions/supplier-match-generation"
import { getUserSubscription } from "@/lib/billing/subscriptions"
import { createClient } from "@/lib/supabase/server"

import { SuppliersView, type SuppliersSupplierRow, type SuppliersViewProps } from "./suppliers-view"

export const dynamic = "force-dynamic"

/**
 * Top-N supplier results that get the LLM-enriched insight card. Mirrors the
 * Phase G investor cap (12). Anything beyond this falls back to the compact
 * card. This bound is what keeps per-page cost predictable: with caching, the
 * worst case on a fresh project is 12 Sonnet calls (~£0.15 - £0.25 total).
 */
const TOP_N_SUPPLIER_INSIGHTS = 12

/**
 * Tiers that see the full why-relevant + three-questions output. Free and
 * anonymous see the blurred upgrade overlay on top three; the rest of the
 * grid renders the compact card with no overlay.
 */
const PAID_TIERS = new Set<string>([
    "seed",
    "starter",
    "professional",
    "enterprise",
])

type ResolvedTier = "anonymous" | "free" | "seed" | "starter" | "professional" | "enterprise"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Suppliers · The Forge" }
    return { title: `Suppliers · ${r.project.name}` }
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Pull HQ / location out of the global supplier company_info JSONB. */
function extractHq(companyInfo: unknown): string | null {
    if (!companyInfo || typeof companyInfo !== "object") return null
    const c = companyInfo as Record<string, unknown>
    const hq = c.hq ?? c.location ?? c.country ?? null
    return typeof hq === "string" && hq.length > 0 ? hq : null
}

// ─── Page ───────────────────────────────────────────────────────────────

export default async function ForgeV2SuppliersPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()
    const project = result.project

    const shortlistRows = await safeShortlistWithJoin(id)

    // Pass through the first module so the empty-state discovery CTA
    // has something to key the gap search on. modules[0] is usually
    // the biggest structural subsystem (container shell, main chassis,
    // airframe) — a reasonable default for the "find me suppliers for
    // anything" first click. Later we'll surface per-module discovery
    // chips on each module card that comes back with < 3 matches.
    const modules = project.modules ?? []
    const firstModule =
        modules.length > 0
            ? { id: modules[0].id, name: modules[0].name }
            : null

    // ── Resolve tier + enrich top-N supplier rows with the why-relevant +
    // three-questions output. Free / anonymous tiers skip enrichment and
    // see the blurred upgrade overlay on the first three cards instead;
    // the rest of the grid renders the compact card with no overlay.
    const { resolvedTier, userId } = await resolveTier()
    let matchOutputs: Record<string, SupplierMatchOutput> = {}
    const isPaid = PAID_TIERS.has(resolvedTier)
    if (isPaid && userId && shortlistRows.length > 0) {
        const enrichIds = shortlistRows
            .slice(0, TOP_N_SUPPLIER_INSIGHTS)
            .map((r) => r.supplierId)
        try {
            matchOutputs = await generateSupplierMatchOutputs({
                projectId: id,
                userId,
                supplierIds: enrichIds,
                maxParallel: 8,
            })
        } catch (err) {
            // FLOW: Enrichment failure must never break the page itself.
            // Log and fall back to compact-card-only.
            console.error("[SUPPLIERS-PAGE] Match enrichment failed:", err)
            matchOutputs = {}
        }
    }

    const viewProps: SuppliersViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        suppliers: shortlistRows,
        totalShortlisted: shortlistRows.length,
        firstModule,
        matchOutputs,
        resolvedTier,
        topNInsights: TOP_N_SUPPLIER_INSIGHTS,
    }

    return <SuppliersView {...viewProps} />
}

// ─── Tier resolver ─────────────────────────────────────────────────────

/**
 * Resolve the caller's subscription tier. The auth path of this page is
 * already gated by `loadCadLabProject` (anonymous users get notFound), so
 * "anonymous" is only reachable here as a defensive fallback.
 */
async function resolveTier(): Promise<{
    resolvedTier: ResolvedTier
    userId: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { resolvedTier: "anonymous", userId: null }
        const { subscription } = await getUserSubscription(user.id)
        const isActive = subscription?.status === "active" || subscription?.status === "trialing"
        const tier = (subscription && isActive) ? subscription.tier : "free"
        return { resolvedTier: tier as ResolvedTier, userId: user.id }
    } catch (err) {
        console.error("[SUPPLIERS-PAGE] Tier resolution failed:", err)
        return { resolvedTier: "free", userId: null }
    }
}

// ─── Data loaders ──────────────────────────────────────────────────────

/**
 * Loads the project shortlist and joins each row to the global supplier
 * directory for HQ only. Every seed-fabricated column (description,
 * supplier_type, capabilities, ramp_role, match score, match reasons,
 * module_ids count, ratings, verification) is intentionally ignored —
 * see file header for the full list.
 *
 * SECURITY: project_id filter is load-bearing for tenant isolation.
 * Do NOT remove or relax without updating the file-header isolation
 * contract. RLS is the second line of defence, not the first.
 *
 * SECURITY: the `.not("supplier_name", "ilike", "[TEST]%")` clause
 * strips any staging-fixture rows so production founders never see
 * bracketed test names in their UI. Seed scripts today do not insert
 * [TEST] into shortlists, but the guard is cheap and catches future
 * seed mistakes at the query level — not in the view.
 */
async function safeShortlistWithJoin(projectId: string): Promise<SuppliersSupplierRow[]> {
    try {
        const supabase = await createClient()

        const { data: shortlist, error } = await supabase
            .from("forge_supplier_shortlist")
            .select("id, supplier_id, supplier_name")
            .eq("project_id", projectId)
            .not("supplier_name", "ilike", "[TEST]%")
            .order("supplier_name", { ascending: true, nullsFirst: false })

        if (error || !shortlist || shortlist.length === 0) return []

        const supplierIds = shortlist
            .map((r) => r.supplier_id as string | null)
            .filter((x): x is string => typeof x === "string" && x.length > 0)

        const hqById = new Map<string, string | null>()
        if (supplierIds.length > 0) {
            const { data: globals } = await supabase
                .from("suppliers")
                .select("id, company_info")
                .in("id", supplierIds)

            if (globals) {
                for (const g of globals) {
                    hqById.set(g.id as string, extractHq(g.company_info))
                }
            }
        }

        return shortlist.map((r) => ({
            supplierId: r.supplier_id as string,
            shortlistId: r.id as string,
            name: (r.supplier_name as string) ?? "Untitled supplier",
            hq: hqById.get(r.supplier_id as string) ?? null,
        }))
    } catch (err) {
        console.error("[SUPPLIERS-PAGE] shortlist + join failed:", err)
        return []
    }
}
