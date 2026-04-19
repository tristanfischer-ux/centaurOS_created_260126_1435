/**
 * @file suppliers/page.tsx — /the-forge-v2/projects/:id/suppliers
 *
 * @description Supplier roster for a project. Pulls the general supplier list
 * (marketplace_listings via searchSuppliers) and renders it as a filter-chip-led
 * roster: specialism chips pre-filter the visible cards, each card opens the
 * per-supplier detail page. Highlighted banner when the project has a linked
 * RFQ; Create-RFQ CTA deep-links back into CAD Lab's RFQ flow.
 *
 * Mockup ref: FORGE-MOCKUP-SUPPLIERS.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Truck, MapPin, Check, Building2, ArrowRight, Plus, ShieldCheck } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { searchSuppliers, type SupplierCard } from "@/actions/suppliers"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

// ─── Metadata ───────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Suppliers · The Forge" }
    return { title: `Suppliers · ${result.project.name}` }
}

// ─── Specialism chips ───────────────────────────────────────────────

/**
 * Canonical specialism chips shown at the top of the roster. Each maps to a
 * loose substring match against the supplier's name, description, or
 * domain_categories. Keeps the UX simple: filter chips, not a search box.
 */
const SPECIALISMS = [
    { id: "all",        label: "All" },
    { id: "cnc",        label: "CNC" },
    { id: "sheet",      label: "Sheet metal" },
    { id: "cfrp",       label: "CFRP" },
    { id: "injection",  label: "Injection moulding" },
    { id: "additive",   label: "Additive" },
    { id: "pcba",       label: "PCBA" },
    { id: "assembly",   label: "Assembly" },
] as const

type SpecialismId = (typeof SPECIALISMS)[number]["id"]

function matchesSpecialism(supplier: SupplierCard, specialism: SpecialismId): boolean {
    if (specialism === "all") return true
    const haystack = [
        supplier.name,
        supplier.description ?? "",
        supplier.subcategory,
        ...(Array.isArray(supplier.attributes?.specialties) ? supplier.attributes.specialties as string[] : []),
        ...(Array.isArray(supplier.attributes?.materials) ? supplier.attributes.materials as string[] : []),
        ...(Array.isArray(supplier.attributes?.key_equipment) ? supplier.attributes.key_equipment as string[] : []),
    ].join(" ").toLowerCase()

    switch (specialism) {
        case "cnc":        return /\bcnc\b|milling|machining|turning/.test(haystack)
        case "sheet":      return /sheet metal|laser cut|press brake|stamping/.test(haystack)
        case "cfrp":       return /cfrp|composite|prepreg|autoclave|layup/.test(haystack)
        case "injection":  return /injection|moulding|molding|tooling/.test(haystack)
        case "additive":   return /additive|3d print|sls|fdm|slm|dmls/.test(haystack)
        case "pcba":       return /pcba|pcb|electronics|smt|assembly/.test(haystack)
        case "assembly":   return /assembly|integrat|sub-assembly/.test(haystack)
        default:           return true
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Pulls the RFQ status for the project's linked RFQ, if any. Kept inline and
 * lightweight — we only need status for the banner label, not the whole RFQ.
 * Returns null gracefully when the RFQ has been deleted or access is denied.
 */
async function loadLinkedRfqStatus(rfqId: string | null): Promise<string | null> {
    if (!rfqId) return null
    try {
        const supabase = await createClient()
        const { data } = await supabase
            .from("rfqs")
            .select("status")
            .eq("id", rfqId)
            .maybeSingle()
        return (data?.status as string | undefined) ?? null
    } catch {
        return null
    }
}

function extractCountry(supplier: SupplierCard): string | null {
    const country = supplier.attributes?.country
    if (typeof country === "string" && country.length > 0) return country
    return null
}

function extractCertifications(supplier: SupplierCard): string[] {
    const raw = supplier.attributes?.certifications
    if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === "string").slice(0, 3)
    if (typeof raw === "string" && raw.length > 0) return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    return []
}

function extractSpecialismTags(supplier: SupplierCard): string[] {
    const specialties = supplier.attributes?.specialties
    if (Array.isArray(specialties)) {
        return specialties.filter((s): s is string => typeof s === "string").slice(0, 3)
    }
    // Fall back to subcategory + first material
    const tags: string[] = []
    if (supplier.subcategory) tags.push(supplier.subcategory)
    const materials = supplier.attributes?.materials
    if (Array.isArray(materials)) {
        tags.push(...materials.filter((m): m is string => typeof m === "string").slice(0, 2))
    }
    return tags.slice(0, 3)
}

// ─── Page ───────────────────────────────────────────────────────────

export default async function ForgeV2SuppliersPage(
    { params, searchParams }: {
        params: Promise<{ id: string }>
        searchParams: Promise<{ specialism?: string }>
    },
): Promise<React.ReactNode> {
    const { id } = await params
    const { specialism: specialismRaw } = await searchParams
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    // Read chosen specialism from query (default: "all")
    const specialism: SpecialismId = SPECIALISMS.some(s => s.id === specialismRaw)
        ? (specialismRaw as SpecialismId)
        : "all"

    // Parallel fetch: supplier roster + linked RFQ status
    const [suppliersResult, linkedRfqStatus] = await Promise.all([
        searchSuppliers({ limit: 50, sortBy: "name" }).catch(() => ({
            results: [] as SupplierCard[],
            total: 0,
            searchMode: "browse" as const,
        })),
        loadLinkedRfqStatus(project.linkedRfqId),
    ])

    const allSuppliers = suppliersResult.results
    const filtered = allSuppliers.filter(s => matchesSpecialism(s, specialism))

    const createRfqHref = `/the-forge/cad-lab?project=${project.id}&action=rfq`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Suppliers" },
            ]}
            subtitle={
                allSuppliers.length === 0
                    ? "No suppliers matched yet"
                    : `${filtered.length} of ${allSuppliers.length} supplier${allSuppliers.length === 1 ? "" : "s"}${specialism !== "all" ? ` · ${SPECIALISMS.find(s => s.id === specialism)?.label}` : ""}`
            }
            primaryCta={{
                label: "Create RFQ",
                href: createRfqHref,
                icon: <Plus className="h-3.5 w-3.5" />,
            }}
        >
            {/* Linked RFQ banner */}
            {project.linkedRfqId && (
                <Card className="rounded-xl border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.04]">
                    <CardContent className="py-3 px-5 flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10 text-international-orange">
                            <Truck className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                                RFQ {project.linkedRfqId.slice(0, 8)} open
                                {linkedRfqStatus && (
                                    <span className="text-muted-foreground font-medium"> · {linkedRfqStatus}</span>
                                )}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground mt-0.5">
                                Broadcast to matched suppliers from CAD Lab. Responses land in the RFQ page.
                            </p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
                            <Link href={`/rfq/${project.linkedRfqId}`}>
                                View RFQ <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Specialism filter chips */}
            {allSuppliers.length > 0 && (
                <nav aria-label="Filter by specialism" className="flex flex-wrap gap-2">
                    {SPECIALISMS.map(chip => {
                        const active = chip.id === specialism
                        const href = chip.id === "all"
                            ? `/the-forge-v2/projects/${project.id}/suppliers`
                            : `/the-forge-v2/projects/${project.id}/suppliers?specialism=${chip.id}`
                        return (
                            <Link
                                key={chip.id}
                                href={href}
                                className={cn(
                                    "inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                                    active
                                        ? "bg-international-orange text-white border-international-orange"
                                        : "border-border bg-background text-foreground hover:bg-muted/50",
                                )}
                                aria-pressed={active}
                            >
                                {chip.label}
                            </Link>
                        )
                    })}
                </nav>
            )}

            {/* Roster */}
            {allSuppliers.length === 0 ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                            <Truck className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="max-w-sm space-y-2">
                            <p className="text-sm font-semibold text-foreground">No suppliers matched yet</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Run supplier matching from CAD Lab to populate this roster, or create an RFQ to broadcast to the network.
                            </p>
                        </div>
                        <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                            <Link href={createRfqHref}>
                                <Plus className="h-3.5 w-3.5" /> Create RFQ
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : filtered.length === 0 ? (
                <Card className="rounded-xl border">
                    <CardContent className="py-10 flex flex-col items-center text-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-muted">
                            <Truck className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">No matches for this specialism</p>
                        <p className="text-xs text-muted-foreground max-w-sm">
                            Try a different chip, or clear the filter to see all {allSuppliers.length} suppliers.
                        </p>
                        <Link
                            href={`/the-forge-v2/projects/${project.id}/suppliers`}
                            className="text-sm font-semibold text-international-orange hover:underline"
                        >
                            Clear filter
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(supplier => {
                        const country = extractCountry(supplier)
                        const certs = extractCertifications(supplier)
                        const tags = extractSpecialismTags(supplier)
                        return (
                            <Link
                                key={supplier.id}
                                href={`/the-forge-v2/projects/${project.id}/suppliers/${supplier.id}`}
                                className="group block"
                            >
                                <Card className="h-full rounded-xl border hover:border-international-orange/60 hover:shadow-sm transition-all">
                                    <CardContent className="p-5 flex flex-col gap-3 h-full">
                                        <div className="flex items-start gap-3">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10 text-international-orange shrink-0">
                                                <Building2 className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-foreground truncate group-hover:text-international-orange transition-colors">
                                                    {supplier.name || "Untitled supplier"}
                                                </p>
                                                {country && (
                                                    <p className="text-[11.5px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                                                        <MapPin className="h-3 w-3" />
                                                        {country}
                                                    </p>
                                                )}
                                            </div>
                                            {supplier.is_verified && (
                                                <Badge variant="outline" className="shrink-0 text-[10px] bg-status-success-light text-status-success border-status-success/30 gap-1">
                                                    <Check className="h-3 w-3" /> Verified
                                                </Badge>
                                            )}
                                        </div>

                                        {supplier.description && (
                                            <p className="text-[12.5px] text-muted-foreground leading-relaxed line-clamp-2">
                                                {supplier.description}
                                            </p>
                                        )}

                                        {tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {tags.map((t, i) => (
                                                    <Badge key={i} variant="outline" className="text-[10.5px] border-border bg-muted/40 text-foreground">
                                                        {t}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}

                                        {certs.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                                                {certs.map((c, i) => (
                                                    <span
                                                        key={i}
                                                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-status-success"
                                                    >
                                                        <ShieldCheck className="h-3 w-3" />
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-auto pt-2 flex items-center justify-end text-[12px] font-semibold text-muted-foreground group-hover:text-international-orange transition-colors">
                                            Open <ArrowRight className="h-3.5 w-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            )}
        </WorkspaceShell>
    )
}
