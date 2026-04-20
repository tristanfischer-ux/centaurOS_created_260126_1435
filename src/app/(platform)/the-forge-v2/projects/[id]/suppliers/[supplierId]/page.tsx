/**
 * @file suppliers/[supplierId]/page.tsx — /the-forge-v2/projects/:id/suppliers/:supplierId
 *
 * @description Supplier detail drill-in from the project shortlist. Server
 * component that loads two rows in parallel:
 *   1. forge_supplier_shortlist — to assert membership (the supplier is
 *      actually shortlisted against this project). 404 if missing so bogus
 *      ids don't leak existence across foundries.
 *   2. suppliers — the global directory row, but we read only name,
 *      website, and company_info for HQ extraction.
 *
 * Data honesty policy (2026-04-20): every per-supplier seed literal is
 * treated as fabricated and dropped at the loader boundary. Description,
 * supplier_type, domain_categories, capabilities, employees, founded,
 * ramp_role, match score, match reasons, module_ids, notes, ratings,
 * verification — none of these flow through to the view. See
 * `scripts/seed-haps-suppliers.ts` for the full list of hardcoded fields.
 *
 * @related
 *   - View:   ./supplier-detail-view.tsx
 *   - Styles: ./supplier-detail-v2.css (scoped .sd2 — do NOT modify)
 *   - Seed:   scripts/seed-haps-suppliers.ts
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import {
    SupplierDetailView,
    type SupplierDetailViewProps,
} from "./supplier-detail-view"

export const dynamic = "force-dynamic"

// ─── Metadata ───────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; supplierId: string }> },
): Promise<Metadata> {
    const { supplierId } = await params
    try {
        const supabase = await createClient()
        const { data } = await supabase
            .from("suppliers")
            .select("name")
            .eq("id", supplierId)
            .maybeSingle()
        if (!data?.name) return { title: "Supplier · The Forge" }
        return { title: `${data.name} · Suppliers · The Forge` }
    } catch {
        return { title: "Supplier · The Forge" }
    }
}

// ─── Page ───────────────────────────────────────────────────────────

export default async function ForgeV2SupplierDetailPage(
    { params }: { params: Promise<{ id: string; supplierId: string }> },
): Promise<React.ReactNode> {
    const { id, supplierId } = await params

    // ── 1. Project load (enforces auth + foundry scoping via withAuth) ──
    const projectResult = await loadCadLabProject(id)
    if ("error" in projectResult || !projectResult.project) notFound()
    const project = projectResult.project

    // ── 2. Parallel fetch: shortlist membership + global supplier row ───
    const supabase = await createClient()
    const [shortlistRes, supplierRes] = await Promise.all([
        supabase
            .from("forge_supplier_shortlist")
            .select("id")
            .eq("project_id", id)
            .eq("supplier_id", supplierId)
            .maybeSingle(),
        supabase
            .from("suppliers")
            .select("id, name, website, company_info")
            .eq("id", supplierId)
            .maybeSingle(),
    ])

    const shortlist = shortlistRes.data
    const supplier = supplierRes.data
    if (!shortlist || !supplier) notFound()

    // ── 3. Resolve HQ from company_info jsonb ───────────────────────────
    const companyInfo = isObject(supplier.company_info) ? supplier.company_info : {}
    const hq = stringField(companyInfo.hq)

    const website = typeof supplier.website === "string" && supplier.website.trim().length > 0
        ? supplier.website.trim()
        : null

    const viewProps: SupplierDetailViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        supplier: {
            id: supplier.id,
            name: supplier.name,
            website,
            hq,
            logoInitials: deriveInitials(supplier.name),
        },
    }

    return <SupplierDetailView {...viewProps} />
}

// ─── Helpers ────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function stringField(v: unknown): string | null {
    if (typeof v === "string" && v.trim().length > 0) return v.trim()
    return null
}

function deriveInitials(name: string): string {
    const clean = name.replace(/[^A-Za-z0-9\s]/g, " ").trim()
    const parts = clean.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "S"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}
