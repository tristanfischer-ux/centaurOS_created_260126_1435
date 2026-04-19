/**
 * @file suppliers/[supplierId]/page.tsx — /the-forge-v2/projects/:id/suppliers/:supplierId
 *
 * @description Supplier drill-in from the project roster. Pulls the supplier
 * row via getSupplierById (marketplace_listings), renders a spec strip
 * (certifications, typical lead times, MOQ, price range), contact block,
 * linked RFQs list (project-scoped), and a Message-supplier CTA.
 *
 * Mockup ref: FORGE-MOCKUP-SUPPLIER-DETAIL.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    Building2,
    MapPin,
    Check,
    Mail,
    Phone,
    ArrowRight,
    ShieldCheck,
    Truck,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { getSupplierById, type SupplierCard } from "@/actions/suppliers"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { WorkspaceShell } from "../../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

// ─── Metadata ───────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; supplierId: string }> },
): Promise<Metadata> {
    const { supplierId } = await params
    const supplier = await getSupplierById(supplierId).catch(() => null)
    if (!supplier) return { title: "Supplier · The Forge" }
    return { title: `${supplier.name} · Suppliers · The Forge` }
}

// ─── Helpers ────────────────────────────────────────────────────────

interface LinkedRfq {
    id: string
    title: string
    status: string
    createdAt: string | null
}

/**
 * Pulls RFQs created from this project so we can show a per-supplier history
 * row. Project-linked RFQs are tagged via `specifications.custom_fields.source`.
 * Returns an empty array on any failure — never crash this surface.
 */
async function loadProjectRfqs(projectId: string, linkedRfqId: string | null): Promise<LinkedRfq[]> {
    if (!linkedRfqId) return []
    try {
        const supabase = await createClient()
        const { data } = await supabase
            .from("rfqs")
            .select("id, title, status, created_at")
            .eq("id", linkedRfqId)
            .maybeSingle()
        if (!data) return []
        return [{
            id: data.id,
            title: (data.title as string | null) ?? `Project ${projectId.slice(0, 8)} RFQ`,
            status: (data.status as string | null) ?? "draft",
            createdAt: (data.created_at as string | null) ?? null,
        }]
    } catch {
        return []
    }
}

function extractContact(supplier: SupplierCard): { email: string | null; phone: string | null } {
    const attrs = supplier.attributes ?? {}
    // attributes.contact may be a JSON object or separate email/phone fields
    const contact = (attrs.contact ?? {}) as Record<string, unknown>
    const email = typeof attrs.email === "string"
        ? attrs.email
        : typeof contact.email === "string"
            ? contact.email
            : null
    const phone = typeof attrs.phone === "string"
        ? attrs.phone
        : typeof contact.phone === "string"
            ? contact.phone
            : null
    return { email, phone }
}

function extractStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
    if (typeof value === "string" && value.length > 0) {
        return value.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    }
    return []
}

function extractStringField(value: unknown): string | null {
    if (typeof value === "string" && value.trim().length > 0) return value.trim()
    if (typeof value === "number") return String(value)
    return null
}

// ─── Page ───────────────────────────────────────────────────────────

export default async function ForgeV2SupplierDetailPage(
    { params }: { params: Promise<{ id: string; supplierId: string }> },
): Promise<React.ReactNode> {
    const { id, supplierId } = await params

    const projectResult = await loadCadLabProject(id)
    if ("error" in projectResult) notFound()
    const project = projectResult.project

    const supplier = await getSupplierById(supplierId).catch(() => null)
    if (!supplier) notFound()

    const attrs = supplier.attributes ?? {}
    const country = extractStringField(attrs.country)
    const city = extractStringField(attrs.city)
    const location = [city, country].filter(Boolean).join(", ") || null

    const certifications = extractStringArray(attrs.certifications)
    const specialties = extractStringArray(attrs.specialties)
    const materials = extractStringArray(attrs.materials)
    const keyEquipment = extractStringArray(attrs.key_equipment)

    const leadTime = extractStringField(attrs.lead_time)
    const moq = extractStringField(attrs.minimum_order) ?? extractStringField(attrs.moq)
    const priceRange = extractStringField(attrs.price_range)
        ?? extractStringField(attrs.pricing)
        ?? extractStringField(attrs.typical_price)

    const { email, phone } = extractContact(supplier)

    const linkedRfqs = await loadProjectRfqs(project.id, project.linkedRfqId)

    const specStrip: Array<{ label: string; value: string | null }> = [
        { label: "Lead time", value: leadTime },
        { label: "MOQ", value: moq },
        { label: "Price range", value: priceRange },
        { label: "Certifications", value: certifications.length > 0 ? `${certifications.length}` : null },
    ]
    const hasSpecStrip = specStrip.some(s => s.value !== null)

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Suppliers", href: `/the-forge-v2/projects/${project.id}/suppliers` },
                { label: supplier.name || "Supplier" },
            ]}
            subtitle={[location, specialties[0] ?? supplier.subcategory ?? null].filter(Boolean).join(" · ") || "Supplier detail"}
            primaryCta={{
                label: "Message supplier",
                href: `/messages/compose?supplier=${supplier.id}&project=${project.id}`,
                icon: <Mail className="h-3.5 w-3.5" />,
            }}
        >
            {/* Supplier header card */}
            <Card className="rounded-xl border">
                <CardContent className="p-6 flex items-start gap-5">
                    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-international-orange/10 text-international-orange shrink-0">
                        <Building2 className="h-8 w-8" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl font-bold text-foreground truncate">
                                    {supplier.name || "Untitled supplier"}
                                </h2>
                                {supplier.is_verified && (
                                    <Badge variant="outline" className="text-[10px] bg-status-success-light text-status-success border-status-success/30 gap-1">
                                        <Check className="h-3 w-3" /> Verified
                                    </Badge>
                                )}
                            </div>
                            {location && (
                                <p className="text-[12.5px] text-muted-foreground inline-flex items-center gap-1 mt-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {location}
                                </p>
                            )}
                        </div>

                        {supplier.description && (
                            <p className="text-sm text-foreground leading-relaxed max-w-2xl">
                                {supplier.description}
                            </p>
                        )}

                        {specialties.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {specialties.slice(0, 6).map((s, i) => (
                                    <Badge key={i} variant="outline" className="text-[11px] border-border bg-muted/40 text-foreground">
                                        {s}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Spec strip */}
            {hasSpecStrip && (
                <Card className="rounded-xl border">
                    <CardContent className="p-0">
                        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
                            {specStrip.map((cell, i) => (
                                <div key={i} className="p-4">
                                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                        {cell.label}
                                    </p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {cell.value ?? <span className="text-muted-foreground font-normal">—</span>}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Two-column: certifications + capabilities/contact */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
                {/* Certifications */}
                <section aria-label="Certifications">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-international-orange" />
                        <h3 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Certifications ({certifications.length})
                        </h3>
                    </div>
                    {certifications.length === 0 ? (
                        <Card className="rounded-xl border">
                            <CardContent className="py-6 text-center">
                                <p className="text-sm text-muted-foreground italic">
                                    No certifications on file.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="rounded-xl border">
                            <CardContent className="p-0">
                                <ul className="divide-y divide-border">
                                    {certifications.map((cert, i) => (
                                        <li key={i} className="flex items-center gap-3 px-5 py-3">
                                            <ShieldCheck className="h-4 w-4 text-status-success shrink-0" />
                                            <span className="text-sm font-medium text-foreground flex-1 truncate">{cert}</span>
                                            <Badge variant="outline" className="text-[10px] bg-status-success-light text-status-success border-status-success/30">
                                                Valid
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}

                    {/* Capabilities */}
                    {(materials.length > 0 || keyEquipment.length > 0) && (
                        <div className="mt-6">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-1 h-5 rounded-full bg-electric-blue" />
                                <h3 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                    Capabilities
                                </h3>
                            </div>
                            <Card className="rounded-xl border">
                                <CardContent className="p-5 space-y-4">
                                    {materials.length > 0 && (
                                        <div>
                                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                                                Materials
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {materials.map((m, i) => (
                                                    <Badge key={i} variant="outline" className="text-[11px] border-border bg-muted/40 text-foreground">
                                                        {m}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {keyEquipment.length > 0 && (
                                        <div>
                                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                                                Key equipment
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {keyEquipment.map((e, i) => (
                                                    <Badge key={i} variant="outline" className="text-[11px] border-border bg-muted/40 text-foreground">
                                                        {e}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </section>

                {/* Contact + Linked RFQs */}
                <section className="space-y-6" aria-label="Contact and RFQs">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-5 rounded-full bg-international-orange" />
                            <h3 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                Contact
                            </h3>
                        </div>
                        <Card className="rounded-xl border">
                            <CardContent className="p-5 space-y-3">
                                {email ? (
                                    <a
                                        href={`mailto:${email}`}
                                        className="flex items-center gap-3 text-sm text-foreground hover:text-international-orange transition-colors"
                                    >
                                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="truncate">{email}</span>
                                    </a>
                                ) : (
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <Mail className="h-4 w-4 shrink-0" />
                                        <span className="italic">No email on file</span>
                                    </div>
                                )}
                                {phone ? (
                                    <a
                                        href={`tel:${phone}`}
                                        className="flex items-center gap-3 text-sm text-foreground hover:text-international-orange transition-colors"
                                    >
                                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="truncate">{phone}</span>
                                    </a>
                                ) : (
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <Phone className="h-4 w-4 shrink-0" />
                                        <span className="italic">No phone on file</span>
                                    </div>
                                )}
                                <Button
                                    asChild
                                    size="sm"
                                    className="w-full gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white mt-2"
                                >
                                    <Link href={`/messages/compose?supplier=${supplier.id}&project=${project.id}`}>
                                        <Mail className="h-3.5 w-3.5" />
                                        Message supplier
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-5 rounded-full bg-international-orange" />
                            <h3 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                                Linked RFQs
                            </h3>
                        </div>
                        {linkedRfqs.length === 0 ? (
                            <Card className="rounded-xl border">
                                <CardContent className="py-6 px-5 flex flex-col items-center text-center gap-2">
                                    <Truck className="h-5 w-5 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">
                                        No RFQs tracked against this supplier for this project yet.
                                    </p>
                                    <Link
                                        href={`/the-forge/cad-lab?project=${project.id}&action=rfq`}
                                        className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                                    >
                                        Create RFQ <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="rounded-xl border">
                                <CardContent className="p-0">
                                    <ul className="divide-y divide-border">
                                        {linkedRfqs.map(rfq => (
                                            <li key={rfq.id}>
                                                <Link
                                                    href={`/rfq/${rfq.id}`}
                                                    className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group"
                                                >
                                                    <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold text-foreground truncate group-hover:text-international-orange transition-colors">
                                                            {rfq.title}
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {rfq.status}
                                                            {rfq.createdAt && ` · ${new Date(rfq.createdAt).toLocaleDateString()}`}
                                                        </p>
                                                    </div>
                                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange group-hover:translate-x-0.5 transition-all" />
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </section>
            </div>
        </WorkspaceShell>
    )
}
