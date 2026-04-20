/**
 * @file suppliers/[supplierId]/page.tsx — /the-forge-v2/projects/:id/suppliers/:supplierId
 *
 * @description Supplier detail drill-in from the project shortlist. Server
 * component that loads two rows in parallel:
 *   1. forge_supplier_shortlist — the project-scoped row with match score,
 *      module_ids, match reasons, ramp role, and shortlist notes.
 *   2. suppliers — the global directory row with description, website,
 *      capabilities (jsonb), company_info (jsonb), verification status,
 *      community rating, review count, used_by_count, domain categories.
 *
 * Both rows are required — 404 if either is missing so bogus ids don't leak
 * existence across foundries or surface a broken half-rendered page.
 *
 * Mockup ref: FORGE-MOCKUP-SUPPLIER-DETAIL.html. Scoped CSS under `.sd2`.
 *
 * Empty-state policy: RFQ lifecycle (RFQs sent / quotes received / awards /
 * NDAs) ships in a later round. Those surfaces are rendered as honest
 * "RFQ lifecycle ships in a later round" placeholders. We NEVER synthesise
 * mockup specifics (Astra AS9100 expired / cert dates / RFQ history /
 * quoted £ amounts / Chase narrative) — only real data from the two rows.
 *
 * @related
 *   - View:   ./supplier-detail-view.tsx
 *   - Styles: ./supplier-detail-v2.css (scoped .sd2 — do NOT modify)
 *   - Mockup: FORGE-MOCKUP-SUPPLIER-DETAIL.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import {
    SupplierDetailView,
    type CapabilityEntry,
    type ModuleLink,
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

    // ── 2. Parallel fetch: shortlist row + global supplier row ──────────
    const supabase = await createClient()
    const [shortlistRes, supplierRes] = await Promise.all([
        supabase
            .from("forge_supplier_shortlist")
            .select("*")
            .eq("project_id", id)
            .eq("supplier_id", supplierId)
            .maybeSingle(),
        supabase
            .from("suppliers")
            .select("*")
            .eq("id", supplierId)
            .maybeSingle(),
    ])

    const shortlist = shortlistRes.data
    const supplier = supplierRes.data
    if (!shortlist || !supplier) notFound()

    // ── 3. Resolve module links ─────────────────────────────────────────
    // forge_supplier_shortlist.module_ids references project.modules[].id.
    // Build lookup so the view can show module name + deep-link.
    const modulesById = new Map(
        (project.modules ?? []).map((m) => [m.id, m.name] as const),
    )
    const matchedModules: ModuleLink[] = (shortlist.module_ids ?? []).map((mid) => ({
        id: mid,
        name: modulesById.get(mid) ?? mid,
        href: `/the-forge-v2/projects/${project.id}/modules/${mid}`,
        isKnown: modulesById.has(mid),
    }))

    // ── 4. Capabilities jsonb → typed entry list ────────────────────────
    // Renders as a capability list with: key → humanised label, value →
    // rendered by kind (array = pills, number = with unit, string = text).
    const capabilities: CapabilityEntry[] = capabilitiesToEntries(supplier.capabilities)

    // ── 5. Company info jsonb → hero meta strip ─────────────────────────
    const companyInfo = isObject(supplier.company_info) ? supplier.company_info : {}
    const hq = stringField(companyInfo.hq)
    const employees = numberField(companyInfo.employees)
    const founded = numberField(companyInfo.founded)

    // ── 6. Match score (shortlist.best_match_score is 0–1, render /100) ─
    const matchScore =
        typeof shortlist.best_match_score === "number"
            ? Math.round(shortlist.best_match_score * 100)
            : null

    const rampRole = normaliseRampRole(shortlist.ramp_role)

    // ── 7. Domain categories (array on the supplier row) ────────────────
    const domainCategories = Array.isArray(supplier.domain_categories)
        ? supplier.domain_categories.filter((c): c is string => typeof c === "string")
        : []

    // ── 8. Match reasons (array on the shortlist row) ───────────────────
    const matchReasons = Array.isArray(shortlist.all_match_reasons)
        ? shortlist.all_match_reasons.filter((r): r is string => typeof r === "string")
        : []

    // Shortlist.notes is free text. Seed populates it with the description,
    // but a curator can override to capture the "why this supplier for this
    // project" context. Trim to avoid whitespace-only strings rendering as
    // populated.
    const shortlistNote = typeof shortlist.notes === "string" && shortlist.notes.trim().length > 0
        ? shortlist.notes.trim()
        : null

    const viewProps: SupplierDetailViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        supplier: {
            id: supplier.id,
            name: supplier.name,
            description: supplier.description ?? null,
            website: supplier.website ?? null,
            supplierType: supplier.supplier_type,
            hq,
            employees,
            founded,
            domainCategories,
            capabilities,
            logoInitials: deriveInitials(supplier.name),
        },
        shortlist: {
            matchScore,
            rampRole,
            matchReasons,
            note: shortlistNote,
            matchedModules,
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

function numberField(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v
    return null
}

function normaliseRampRole(raw: string | null | undefined): "primary" | "secondary" | "backup" {
    if (raw === "primary" || raw === "secondary" || raw === "backup") return raw
    return "backup"
}

function deriveInitials(name: string): string {
    const clean = name.replace(/[^A-Za-z0-9\s]/g, " ").trim()
    const parts = clean.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "S"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

/**
 * Converts supplier.capabilities jsonb into a typed entry list for the view.
 * Handles: string, number, string[], certifications[] (tagged as chips).
 * Ignores null/undefined values and non-primitive objects.
 *
 * Unit inference for numeric values is keyed off the snake_case suffix:
 *   *_kw   → kW   |   *_kg   → kg   |   *_m   → m
 *   *_bar  → bar  |   *_pct  → %    |   *_ah  → Ah
 *   *_kbps → kbps |   everything else → bare number
 */
function capabilitiesToEntries(raw: unknown): CapabilityEntry[] {
    if (!isObject(raw)) return []
    const entries: CapabilityEntry[] = []
    for (const [key, value] of Object.entries(raw)) {
        if (value == null) continue
        const label = humaniseKey(key)
        if (Array.isArray(value)) {
            const items = value.filter((v): v is string => typeof v === "string" && v.length > 0)
            if (items.length === 0) continue
            // Certifications render as neutral chips instead of plain pills.
            const kind: CapabilityEntry["kind"] = key === "certifications" ? "certifications" : "array"
            entries.push({ key, label, kind, items })
        } else if (typeof value === "number" && Number.isFinite(value)) {
            entries.push({ key, label, kind: "number", number: value, unit: inferUnit(key) })
        } else if (typeof value === "string" && value.trim().length > 0) {
            entries.push({ key, label, kind: "string", text: value.trim() })
        }
    }
    // Certifications last so the neutral-chip block sits beneath the pills.
    entries.sort((a, b) => {
        const rank = (e: CapabilityEntry) => (e.kind === "certifications" ? 1 : 0)
        return rank(a) - rank(b)
    })
    return entries
}

function humaniseKey(key: string): string {
    return key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
}

function inferUnit(key: string): string | null {
    if (/_kw$/i.test(key)) return "kW"
    if (/_kg$/i.test(key)) return "kg"
    if (/_m$/i.test(key)) return "m"
    if (/_bar$/i.test(key)) return "bar"
    if (/_pct$/i.test(key)) return "%"
    if (/_ah$/i.test(key)) return "Ah"
    if (/_kbps$/i.test(key)) return "kbps"
    if (/_hz$/i.test(key)) return "Hz"
    if (/_v$/i.test(key)) return "V"
    return null
}
