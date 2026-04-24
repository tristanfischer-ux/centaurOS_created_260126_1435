/**
 * @file projects/[id]/plan/page.tsx — THE new Forge plan surface.
 *
 * @description Single scrolling HTML page that mirrors the PDF export, but
 * is the primary read surface. PDF becomes a download artefact — the user
 * reads the plan here first. Replaces the multi-tab workspace grid for
 * V1 per Tristan's "simplify massively" spec (2026-04-24).
 *
 * Reference: FORGE-PLAN-INLINE-MOCKUP.html at repo root — port top-to-bottom.
 *
 * Sections (mirror PDF):
 *   1. Cover summary · 2. Brief + regulatory · 3. Sizing · 4. Floor plan
 *   5. Modules · 6. BOM · 7. Cost · 8. Risks · 9. Suppliers
 *
 * Server component — no client JS. Fits the existing platform shell
 * (ForgeOS left sidebar via (platform) layout).
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { Download, Mail, Link2, ChevronLeft } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/admin"
import { withAuth } from "@/lib/server-action-utils"
import { buildSpatialPlanSvg } from "@/lib/pdf/rasterise-spatial-plan"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { SpatialPlan } from "@/lib/layout/types"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Plan · The Forge",
}

// ─── Types ─────────────────────────────────────────────────────────────

interface PlanRow {
    id: string
    name: string | null
    subject: string | null
    design_revision: number | null
    brief_locked_at: string | null
    foundry_id: string
    modules: CadLabModule[] | null
    reviews: Record<string, ReviewRow[]> | null
    ai_cost_estimates: Record<string, AiCostEstimate> | null
    dimension_sheet: DimensionSheet | null
    spatial_plan: SpatialPlan | null
    research: ResearchPayload | null
}

interface ReviewRow {
    specialistId?: string
    summary?: string
    issues?: { severity?: string; description?: string }[]
}

interface DimensionSheet {
    feasible?: boolean
    rules_domain?: string
    rules_version?: string
    envelope?: { label?: string; interior_floor_m2?: number }
    target?: Record<string, number | string>
    optimisation?: { winner?: { rationale?: string } }
}

interface ResearchPayload {
    report?: string
    designBrief?: {
        compliance?: Array<{ code?: string; name?: string; summary?: string }>
        constraints?: { unitCostCeilingGbp?: number }
    }
}

interface PartRow {
    id: string
    name: string
    module_id: string | null
    module_name: string | null
    type: "make" | "buy" | null
    qty: number | null
    unit_cost_gbp: number | null
    extended_cost_gbp: number | null
}

interface SupplierRow {
    supplierId: string
    supplierName: string
    websiteUrl: string | null
    contactEmail: string | null
    matchScore: number | null
    moduleNames: string[]
}

interface ModuleCost {
    moduleId: string
    totalGbp: number
}

// ─── Data fetch ────────────────────────────────────────────────────────

async function loadPlanData(projectId: string): Promise<
    | { plan: PlanRow; parts: PartRow[]; suppliers: SupplierRow[]; moduleCosts: ModuleCost[] }
    | { error: string }
> {
    return withAuth(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, name, subject, design_revision, brief_locked_at, foundry_id, modules, reviews, ai_cost_estimates, dimension_sheet, spatial_plan, research",
            )
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr || !project) return { error: "Project not found" }
        if (project.foundry_id !== foundryId) return { error: "Project not found" }

        const moduleNameById = new Map<string, string>()
        for (const m of (project.modules as CadLabModule[] | null) ?? []) {
            moduleNameById.set(m.id, m.name ?? m.id)
        }

        const { data: partRows } = await admin
            .from("parts")
            .select(
                "id, name, module_id, type, qty, unit_cost_gbp, extended_cost_gbp",
            )
            .eq("project_id", projectId)
            .order("module_id", { ascending: true })
            .order("name", { ascending: true })
            .limit(200)

        const parts: PartRow[] = (partRows ?? []).map((p) => ({
            id: p.id as string,
            name: (p.name as string) ?? "",
            module_id: (p.module_id as string | null) ?? null,
            module_name:
                typeof p.module_id === "string"
                    ? moduleNameById.get(p.module_id) ?? p.module_id
                    : null,
            type: p.type === "make" || p.type === "buy" ? (p.type as "make" | "buy") : null,
            qty: typeof p.qty === "number" ? p.qty : null,
            unit_cost_gbp: typeof p.unit_cost_gbp === "number" ? p.unit_cost_gbp : null,
            extended_cost_gbp:
                typeof p.extended_cost_gbp === "number" ? p.extended_cost_gbp : null,
        }))

        const { data: shortlistRows } = await admin
            .from("forge_supplier_shortlist")
            .select("supplier_id, supplier_name, module_ids, best_match_score")
            .eq("project_id", projectId)
            .limit(30)

        const supplierIds = (shortlistRows ?? [])
            .map((r) => r.supplier_id as string | null)
            .filter((x): x is string => typeof x === "string" && x.length > 0)

        const websiteById = new Map<string, string | null>()
        const emailById = new Map<string, string | null>()
        if (supplierIds.length > 0) {
            const { data: listings } = await admin
                .from("marketplace_listings")
                .select("id, website_url, contact_email")
                .in("id", supplierIds)
            if (listings) {
                for (const l of listings) {
                    websiteById.set(l.id as string, (l.website_url as string | null) ?? null)
                    emailById.set(l.id as string, (l.contact_email as string | null) ?? null)
                }
            }
        }

        const suppliers: SupplierRow[] = (shortlistRows ?? []).map((r) => ({
            supplierId: r.supplier_id as string,
            supplierName: (r.supplier_name as string | null) ?? "Untitled supplier",
            websiteUrl: websiteById.get(r.supplier_id as string) ?? null,
            contactEmail: emailById.get(r.supplier_id as string) ?? null,
            matchScore: typeof r.best_match_score === "number" ? r.best_match_score : null,
            moduleNames: Array.isArray(r.module_ids)
                ? ((r.module_ids as string[]) ?? []).map(
                      (mid) => moduleNameById.get(mid) ?? mid,
                  )
                : [],
        }))

        const moduleCosts: ModuleCost[] = Object.entries(
            (project.ai_cost_estimates as Record<string, AiCostEstimate> | null) ?? {},
        ).map(([mid, est]) => ({
            moduleId: mid,
            totalGbp: typeof est.totalPerUnit === "number" ? est.totalPerUnit : 0,
        }))

        return { plan: project as unknown as PlanRow, parts, suppliers, moduleCosts }
    })
}

// ─── Helpers ───────────────────────────────────────────────────────────

function fmtGbp(n: number | null | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
}

function deriveCompanyName(websiteUrl: string | null, fallback: string): string {
    if (websiteUrl && /^https?:\/\//i.test(websiteUrl)) {
        try {
            return new URL(websiteUrl).hostname.replace(/^www\./, "")
        } catch {
            /* fall through */
        }
    }
    return fallback
}

function severityClasses(severity: string | undefined): string {
    const s = (severity ?? "").toLowerCase()
    if (s.includes("critical")) return "bg-destructive/10 text-destructive"
    if (s.includes("warn")) return "bg-amber-100 text-amber-900"
    return "bg-blue-100 text-blue-900"
}

/**
 * SVG → data URI via base64. SVG string is built server-side from our own
 * spatial_plan JSONB (never user markup); text labels are escaped inside
 * buildSpatialPlanSvg. Rendering via <img src="data:..."> means the
 * browser treats it as an image, not as DOM — no script execution path.
 */
function svgToDataUri(svg: string): string {
    if (!svg) return ""
    const base64 = Buffer.from(svg, "utf8").toString("base64")
    return `data:image/svg+xml;base64,${base64}`
}

// ─── Page ──────────────────────────────────────────────────────────────

export default async function PlanPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadPlanData(id)
    if ("error" in result) notFound()

    const { plan, parts, suppliers, moduleCosts } = result
    const modules = (plan.modules ?? []) as CadLabModule[]
    const reviewsByModule = (plan.reviews ?? {}) as Record<string, ReviewRow[]>
    const costsByModule = new Map(moduleCosts.map((c) => [c.moduleId, c.totalGbp]))
    const compliance = plan.research?.designBrief?.compliance ?? []
    const ceilingGbp = plan.research?.designBrief?.constraints?.unitCostCeilingGbp ?? null
    const unitTotal = moduleCosts.reduce((s, c) => s + c.totalGbp, 0)
    const headroom = typeof ceilingGbp === "number" ? ceilingGbp - unitTotal : null
    const revLetter = (() => {
        const n = plan.design_revision ?? 1
        if (!Number.isFinite(n) || n < 1) return "A"
        if (n > 26) return String(n)
        return String.fromCharCode(64 + n)
    })()

    const moduleNameById = new Map<string, string>()
    for (const m of modules) moduleNameById.set(m.id, m.name ?? m.id)

    const floorPlanSvg = plan.spatial_plan
        ? buildSpatialPlanSvg(plan.spatial_plan, moduleNameById)
        : ""
    const floorPlanSrc = floorPlanSvg ? svgToDataUri(floorPlanSvg) : ""

    const failureCount = modules.reduce(
        (s, m) => s + (Array.isArray(m.failureModes) ? m.failureModes.length : 0),
        0,
    )
    const reviewedModuleCount = Object.keys(reviewsByModule).filter(
        (k) => (reviewsByModule[k] ?? []).length > 0,
    ).length

    return (
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-6 py-8 md:grid-cols-[200px_1fr]">
            <aside className="hidden md:block sticky top-4 self-start max-h-[calc(100vh-100px)] overflow-y-auto pr-2 text-xs">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                    <Link
                        href="/the-forge-v2"
                        className="inline-flex items-center gap-1 text-international-orange font-semibold hover:underline"
                    >
                        <ChevronLeft className="h-3 w-3" /> All plans
                    </Link>
                </div>
                <h4 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    On this plan
                </h4>
                <ol className="space-y-1">
                    {[
                        { id: "summary", label: "Summary" },
                        { id: "brief", label: "Brief + regulations" },
                        { id: "sizing", label: "Sizing" },
                        { id: "layout", label: "Floor plan" },
                        { id: "modules", label: `Modules (${modules.length})` },
                        { id: "bom", label: `BOM (${parts.length})` },
                        { id: "cost", label: "Cost breakdown" },
                        { id: "risks", label: `Risks (${failureCount})` },
                        { id: "suppliers", label: `Suppliers (${suppliers.length})` },
                    ].map((item) => (
                        <li key={item.id}>
                            <a
                                href={`#${item.id}`}
                                className="block rounded-md border-l-2 border-transparent px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ol>
                <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                    <strong>Draft plan, not a spec.</strong> Your engineer reviews before
                    you build. Your fabricator quotes before you commit.
                </div>
            </aside>

            <div className="min-w-0">
                <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
                    <Link
                        href={`/the-forge-v2/projects/${plan.id}/export/pdf`}
                        className="inline-flex items-center gap-2 rounded-md bg-international-orange px-4 py-2 text-sm font-semibold text-white hover:bg-international-orange/90"
                    >
                        <Download className="h-4 w-4" /> Download PDF
                    </Link>
                    <button
                        type="button"
                        disabled
                        title="Ships in V1.1"
                        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold hover:bg-secondary"
                    >
                        <Mail className="h-3.5 w-3.5" /> Email me
                    </button>
                    <button
                        type="button"
                        disabled
                        title="Ships in V1.1"
                        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold hover:bg-secondary"
                    >
                        <Link2 className="h-3.5 w-3.5" /> Share link
                    </button>
                </div>

                <section
                    id="summary"
                    className="mb-12 rounded-2xl border border-border bg-card p-10 shadow-sm"
                >
                    <h1 className="mb-2 font-serif text-4xl font-black leading-tight tracking-tight">
                        {plan.name ?? plan.subject ?? "Untitled plan"}
                    </h1>
                    <p className="mb-8 max-w-[640px] text-sm leading-relaxed text-muted-foreground">
                        {plan.subject ?? "—"} · Revision {revLetter}
                    </p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                        <CoverSpec label="Unit cost" value={fmtGbp(unitTotal)} />
                        <CoverSpec
                            label={headroom != null && headroom < 0 ? "Over ceiling" : "Under ceiling"}
                            value={
                                headroom == null
                                    ? "—"
                                    : headroom >= 0
                                        ? `+${fmtGbp(headroom)}`
                                        : `${fmtGbp(headroom)}`
                            }
                            tone={
                                headroom == null ? undefined : headroom >= 0 ? "good" : "bad"
                            }
                        />
                        <CoverSpec
                            label="Modules"
                            value={`${modules.length}${reviewedModuleCount > 0 ? ` · ${reviewedModuleCount} reviewed` : ""}`}
                        />
                        <CoverSpec label="Parts in BOM" value={String(parts.length)} />
                        <CoverSpec label="Standards" value={`${compliance.length}`} />
                        <CoverSpec label="Suppliers" value={`${suppliers.length}`} />
                    </div>
                </section>

                <section id="brief" className="mb-16 scroll-mt-24">
                    <SectionHeader
                        number="1"
                        title="Brief + regulatory posture"
                        subtitle="What you said, and what standards apply."
                    />
                    {plan.research?.report ? (
                        <div className="prose prose-sm max-w-[720px] text-sm leading-[1.75]">
                            <p>{plan.research.report.slice(0, 2400)}</p>
                        </div>
                    ) : (
                        <p className="text-sm italic text-muted-foreground">
                            Brief not captured yet.
                        </p>
                    )}
                    {compliance.length > 0 && (
                        <>
                            <h3 className="mt-6 text-lg font-bold">
                                Regulatory standards identified
                            </h3>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                {compliance.map((c, i) => (
                                    <div
                                        key={`${c.code ?? "c"}-${i}`}
                                        className="rounded-md border border-border bg-card p-4"
                                    >
                                        <div className="font-mono text-xs font-bold text-international-orange">
                                            {c.code ?? "—"}
                                        </div>
                                        <div className="mt-1 text-sm font-semibold">
                                            {c.name ?? "—"}
                                        </div>
                                        {c.summary && (
                                            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                {c.summary}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </section>

                {plan.dimension_sheet && (
                    <section id="sizing" className="mb-16 scroll-mt-24">
                        <SectionHeader
                            number="2"
                            title="Sizing"
                            subtitle="Envelope, target output, feasibility."
                        />
                        <div className="rounded-md border border-border bg-card p-5">
                            <DimensionRow
                                label="Envelope"
                                value={plan.dimension_sheet.envelope?.label ?? "—"}
                            />
                            <DimensionRow
                                label="Interior floor"
                                value={
                                    typeof plan.dimension_sheet.envelope?.interior_floor_m2 ===
                                    "number"
                                        ? `${plan.dimension_sheet.envelope.interior_floor_m2.toFixed(2)} m²`
                                        : "—"
                                }
                            />
                            {Object.entries(plan.dimension_sheet.target ?? {}).map(
                                ([k, v]) => (
                                    <DimensionRow
                                        key={k}
                                        label={`Target ${k}`}
                                        value={String(v)}
                                    />
                                ),
                            )}
                            <DimensionRow
                                label="Rules library"
                                value={`${plan.dimension_sheet.rules_domain ?? "—"} v${plan.dimension_sheet.rules_version ?? "—"}`}
                            />
                            <div className="mt-3 flex justify-end">
                                <span
                                    className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                                        plan.dimension_sheet.feasible
                                            ? "bg-green-100 text-green-800"
                                            : "bg-destructive/10 text-destructive"
                                    }`}
                                >
                                    {plan.dimension_sheet.feasible ? "Feasible" : "Infeasible"}
                                </span>
                            </div>
                        </div>
                        {plan.dimension_sheet.optimisation?.winner?.rationale && (
                            <p className="mt-4 max-w-[720px] text-sm italic text-muted-foreground">
                                {plan.dimension_sheet.optimisation.winner.rationale}
                            </p>
                        )}
                    </section>
                )}

                {plan.spatial_plan && (
                    <section id="layout" className="mb-16 scroll-mt-24">
                        <SectionHeader
                            number="3"
                            title="Floor plan"
                            subtitle={`${
                                plan.spatial_plan.view === "top_down"
                                    ? "Top-down view"
                                    : plan.spatial_plan.view === "side_elevation"
                                        ? "Side elevation"
                                        : "Layered diagram"
                            } of the container interior.`}
                        />
                        {floorPlanSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={floorPlanSrc}
                                alt="Floor plan of the container interior"
                                className="rounded-md border border-border bg-card p-4"
                                style={{ width: "100%", height: "auto" }}
                            />
                        ) : (
                            <p className="text-sm italic text-muted-foreground">
                                3D view — download the PDF to see the layered diagram.
                            </p>
                        )}
                    </section>
                )}

                <section id="modules" className="mb-16 scroll-mt-24">
                    <SectionHeader
                        number="4"
                        title="Modules"
                        subtitle="Each module: what it is, key parts, engineering review."
                    />
                    <div className="space-y-7">
                        {modules.map((mod, idx) => {
                            const modReviews = reviewsByModule[mod.id] ?? []
                            const cost = costsByModule.get(mod.id)
                            return (
                                <div
                                    key={mod.id}
                                    className="overflow-hidden rounded-2xl border border-border bg-card"
                                >
                                    {mod.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={mod.imageUrl}
                                            alt={`${mod.name} system illustration`}
                                            className="aspect-[16/7] w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex aspect-[16/7] items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-600 text-xs uppercase tracking-widest text-neutral-200 opacity-80">
                                            [ render pending for {mod.name} ]
                                        </div>
                                    )}
                                    <div className="p-7">
                                        <div className="mb-3 flex items-baseline justify-between gap-3">
                                            <h3 className="text-lg font-bold">
                                                {mod.name}{" "}
                                                <span className="font-normal text-muted-foreground">
                                                    · Module {idx + 1} of {modules.length}
                                                </span>
                                            </h3>
                                            {typeof cost === "number" && (
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {fmtGbp(cost)}
                                                </span>
                                            )}
                                        </div>
                                        {mod.purpose && (
                                            <p className="mb-4 text-sm text-muted-foreground">
                                                {mod.purpose}
                                            </p>
                                        )}
                                        {mod.keyParts && mod.keyParts.length > 0 && (
                                            <>
                                                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                                    Key parts
                                                </div>
                                                <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    {mod.keyParts.slice(0, 10).map((p, i) => (
                                                        <div
                                                            key={`${mod.id}-p-${i}`}
                                                            className="rounded bg-secondary px-3 py-2 text-xs"
                                                        >
                                                            {p}
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        {modReviews.length > 0 && (
                                            <div className="rounded-md border-l-4 border-international-orange bg-international-orange/5 p-4">
                                                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-international-orange">
                                                    Engineering review
                                                </div>
                                                {modReviews.map((r, ri) => (
                                                    <div key={ri} className="mb-2 last:mb-0">
                                                        {r.summary && (
                                                            <p className="mb-2 text-sm">{r.summary}</p>
                                                        )}
                                                        {Array.isArray(r.issues) &&
                                                            r.issues.length > 0 && (
                                                                <ul className="space-y-1.5 pl-0 text-sm leading-relaxed">
                                                                    {r.issues.map((iss, ii) => (
                                                                        <li
                                                                            key={ii}
                                                                            className="flex gap-2"
                                                                        >
                                                                            <span
                                                                                className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${severityClasses(iss.severity)}`}
                                                                            >
                                                                                {iss.severity ?? "info"}
                                                                            </span>
                                                                            <span>{iss.description}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {mod.failureModes &&
                                            mod.failureModes.length > 0 &&
                                            modReviews.length === 0 && (
                                                <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-4">
                                                    <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-900">
                                                        Failure modes flagged
                                                    </div>
                                                    <ul className="list-disc pl-5 text-sm leading-relaxed">
                                                        {mod.failureModes
                                                            .slice(0, 5)
                                                            .map((f, i) => (
                                                                <li key={i}>{f}</li>
                                                            ))}
                                                    </ul>
                                                </div>
                                            )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>

                {parts.length > 0 && (
                    <section id="bom" className="mb-16 scroll-mt-24">
                        <SectionHeader
                            number="5"
                            title="Bill of materials"
                            subtitle={`${parts.length} rows across ${modules.length} modules. Make vs buy flagged.`}
                        />
                        <div className="overflow-hidden rounded-md border border-border bg-card">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-secondary text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <th className="px-3 py-2.5">Part</th>
                                        <th className="px-3 py-2.5">Module</th>
                                        <th className="px-3 py-2.5">Type</th>
                                        <th className="px-3 py-2.5 text-right">Qty</th>
                                        <th className="px-3 py-2.5 text-right">Unit</th>
                                        <th className="px-3 py-2.5 text-right">Extended</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parts.slice(0, 50).map((p) => (
                                        <tr
                                            key={p.id}
                                            className="border-t border-border/50 align-top"
                                        >
                                            <td className="px-3 py-2">{p.name}</td>
                                            <td className="px-3 py-2 text-muted-foreground">
                                                {p.module_name ?? "—"}
                                            </td>
                                            <td className="px-3 py-2">
                                                {p.type === "buy" ? (
                                                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-900">
                                                        Buy
                                                    </span>
                                                ) : p.type === "make" ? (
                                                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-green-900">
                                                        Make
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                                {p.qty ?? "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                                {fmtGbp(p.unit_cost_gbp)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                                {fmtGbp(p.extended_cost_gbp)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {parts.length > 50 && (
                                <div className="border-t border-border bg-secondary py-3 text-center text-xs text-muted-foreground">
                                    {parts.length - 50} more rows · download the PDF for the
                                    full BOM.
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {moduleCosts.length > 0 && (
                    <section id="cost" className="mb-16 scroll-mt-24">
                        <SectionHeader
                            number="6"
                            title="Cost breakdown"
                            subtitle={`Where ${fmtGbp(unitTotal)} lands${ceilingGbp ? `, against a ${fmtGbp(ceilingGbp)} ceiling` : ""}.`}
                        />
                        <div className="rounded-md border border-border bg-card p-5">
                            {moduleCosts
                                .slice()
                                .sort((a, b) => b.totalGbp - a.totalGbp)
                                .map((c) => {
                                    const pct = unitTotal > 0 ? (c.totalGbp / unitTotal) * 100 : 0
                                    return (
                                        <div
                                            key={c.moduleId}
                                            className="mb-1.5 grid grid-cols-[180px_1fr_100px] items-center gap-3 text-sm"
                                        >
                                            <span className="truncate">
                                                {moduleNameById.get(c.moduleId) ?? c.moduleId}
                                            </span>
                                            <div className="relative h-4 overflow-hidden rounded bg-international-orange/15">
                                                <div
                                                    className="absolute inset-y-0 left-0 rounded bg-international-orange"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="text-right font-mono text-xs font-semibold">
                                                {fmtGbp(c.totalGbp)}
                                            </span>
                                        </div>
                                    )
                                })}
                            <div className="mt-4 flex items-start justify-between border-t border-border pt-4 text-base font-bold">
                                <span>Unit total</span>
                                <div className="text-right">
                                    <div>{fmtGbp(unitTotal)}</div>
                                    {headroom != null && (
                                        <div
                                            className={`mt-1 text-xs font-semibold ${
                                                headroom >= 0 ? "text-green-700" : "text-destructive"
                                            }`}
                                        >
                                            {headroom >= 0
                                                ? `${fmtGbp(headroom)} under ceiling`
                                                : `${fmtGbp(-headroom)} over ceiling`}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {failureCount > 0 && (
                    <section id="risks" className="mb-16 scroll-mt-24">
                        <SectionHeader
                            number="7"
                            title="Risks"
                            subtitle={`${failureCount} failure modes identified across ${modules.length} modules.`}
                        />
                        <div className="space-y-2">
                            {modules.flatMap((mod) =>
                                (mod.failureModes ?? []).map((fm, i) => (
                                    <div
                                        key={`${mod.id}-f-${i}`}
                                        className="grid grid-cols-[auto_1fr] gap-3 rounded-md border border-border bg-card p-3 text-sm"
                                    >
                                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                            {mod.name}
                                        </span>
                                        <span>{fm}</span>
                                    </div>
                                )),
                            )}
                        </div>
                    </section>
                )}

                {suppliers.length > 0 && (
                    <section id="suppliers" className="mb-16 scroll-mt-24">
                        <SectionHeader
                            number="8"
                            title="Suppliers"
                            subtitle={`${suppliers.length} real manufacturers shortlisted. Click the domain to reach out.`}
                        />
                        <div className="space-y-2">
                            {suppliers.slice(0, 20).map((s) => {
                                const company = deriveCompanyName(s.websiteUrl, s.supplierName)
                                return (
                                    <div
                                        key={s.supplierId}
                                        className="grid grid-cols-[1fr_auto] items-start gap-4 rounded-md border border-border bg-card p-4"
                                    >
                                        <div>
                                            <div className="font-semibold">{company}</div>
                                            <div className="text-xs italic text-muted-foreground">
                                                {s.supplierName}
                                            </div>
                                            {s.websiteUrl && (
                                                <a
                                                    href={s.websiteUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 block font-mono text-xs text-international-orange hover:underline"
                                                >
                                                    {s.websiteUrl}
                                                </a>
                                            )}
                                            {s.contactEmail &&
                                                !s.contactEmail.toLowerCase().includes("unknown") && (
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {s.contactEmail}
                                                    </div>
                                                )}
                                            {s.moduleNames.length > 0 && (
                                                <div className="mt-2 text-[11px] text-muted-foreground">
                                                    Matched:{" "}
                                                    {s.moduleNames.slice(0, 3).join(", ")}
                                                </div>
                                            )}
                                        </div>
                                        {typeof s.matchScore === "number" && (
                                            <span className="whitespace-nowrap rounded bg-green-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green-800">
                                                Match {s.matchScore.toFixed(0)}
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                )}

                <div className="border-t border-border pt-8 pb-16 text-center text-xs text-muted-foreground">
                    This plan is a draft. Have your engineer review before you build, and
                    your fabricator quote before you commit.
                </div>
            </div>
        </div>
    )
}

function CoverSpec({
    label,
    value,
    tone,
}: {
    label: string
    value: string
    tone?: "good" | "bad"
}): React.ReactElement {
    return (
        <div className="rounded-md border border-border/60 bg-secondary/40 p-3.5">
            <div
                className={`mb-1 text-lg font-black leading-none tracking-tight ${tone === "good" ? "text-green-700" : tone === "bad" ? "text-destructive" : ""}`}
            >
                {value}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
        </div>
    )
}

function SectionHeader({
    number,
    title,
    subtitle,
}: {
    number: string
    title: string
    subtitle: string
}): React.ReactElement {
    return (
        <div className="mb-6">
            <h2 className="mb-1 font-serif text-3xl font-black tracking-tight">
                {number}. {title}
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
    )
}

function DimensionRow({
    label,
    value,
}: {
    label: string
    value: string
}): React.ReactElement {
    return (
        <div className="flex justify-between border-b border-border/50 py-1.5 text-sm last:border-b-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono font-semibold">{value}</span>
        </div>
    )
}
