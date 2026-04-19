/**
 * @file request/page.tsx — /the-forge-v2/projects/:id/request
 *
 * @description RFQ / request surface. Lists the project&rsquo;s in-network suppliers
 * (via searchSuppliers) so the user can pick recipients and attach a free-text
 * prompt. Submit stubs to a mailto: link that opens a pre-filled quote
 * request &mdash; no supplier-marketplace broadcast from this page yet.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-REQUEST.html
 * - Data:   loadCadLabProject from @/actions/cad-lab-projects
 *           searchSuppliers from @/actions/suppliers
 * - Shell:  ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    Truck,
    ArrowLeft,
    Send,
    Building2,
    MapPin,
    ShieldCheck,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { searchSuppliers, type SupplierCard } from "@/actions/suppliers"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Request · The Forge" }
    return {
        title: `Request a quote · ${result.project.name}`,
        description: "Pick suppliers, attach a prompt, open a draft in your mail client.",
    }
}

function supplierCountry(supplier: SupplierCard): string | null {
    const c = supplier.attributes?.country
    return typeof c === "string" && c.length > 0 ? c : null
}

function supplierCerts(supplier: SupplierCard): string[] {
    const raw = supplier.attributes?.certifications
    if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === "string").slice(0, 2)
    if (typeof raw === "string" && raw.length > 0) return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 2)
    return []
}

export default async function ForgeV2RequestPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ subject?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const { subject } = await searchParams
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    const suppliersResult = await searchSuppliers({ limit: 12, sortBy: "name" }).catch(() => ({
        results: [] as SupplierCard[],
        total: 0,
        searchMode: "browse" as const,
    }))
    const suppliers = suppliersResult.results

    const defaultSubject = subject?.trim() || `${project.name} — RFQ`
    const defaultPrompt = [
        `Hi,`,
        ``,
        `We&rsquo;re putting together a quote package for ${project.name}.`,
        project.productOverview ? `Context: ${project.productOverview.split(/\s+/).slice(0, 30).join(" ")}${project.productOverview.split(/\s+/).length > 30 ? "…" : ""}` : null,
        ``,
        `Target: 2 ea first batch, option on 8 ea batch 2. Quotes back within 6 working days ideally.`,
        ``,
        `Happy to hop on a call if easier. Full spec pack on request.`,
        ``,
        `— Sent from ForgeOS`,
    ].filter(Boolean).join("\n")

    // Stub mailto: — real recipient list would be assembled client-side from
    // the user&rsquo;s ticked rows. For now the primary CTA opens a blank-to mailto
    // with subject + prompt pre-filled, which the user fills with recipients.
    const mailto = `mailto:?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultPrompt.replace(/&rsquo;/g, "'"))}`

    const backHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: backHref },
                { label: "Request a quote" },
            ]}
            subtitle={suppliers.length === 0
                ? "Pick suppliers and draft the request."
                : `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"} available &mdash; tick the ones you want to quote.`}
            maxWidth="narrow"
        >
            {/* Request form */}
            <Card className="rounded-xl border">
                <CardContent className="py-0 px-0">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-sm font-bold text-foreground">Request details</h2>
                        <Badge variant="outline" className="text-[10.5px] bg-muted/50 text-muted-foreground">
                            Stub &mdash; opens in mail client
                        </Badge>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="request-subject" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Subject
                            </Label>
                            <Input
                                id="request-subject"
                                type="text"
                                defaultValue={defaultSubject}
                                className="text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="request-prompt" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Prompt
                            </Label>
                            <Textarea
                                id="request-prompt"
                                defaultValue={defaultPrompt.replace(/&rsquo;/g, "'")}
                                className="text-sm min-h-[180px] font-sans leading-relaxed"
                            />
                            <p className="text-[11.5px] text-muted-foreground">
                                Edit before sending. Spec pack, drawings, and deadline go into the mail client after the draft opens.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Supplier picker */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5 text-international-orange" />
                            Suppliers
                        </h3>
                        <Link
                            href={`/the-forge-v2/projects/${project.id}/suppliers`}
                            className="text-[11.5px] font-semibold text-international-orange hover:underline"
                        >
                            Browse all suppliers &rarr;
                        </Link>
                    </div>

                    {suppliers.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic py-4">
                            No supplier rows available. Create a supplier match from the suppliers page first.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border/50">
                            {suppliers.map(supplier => {
                                const country = supplierCountry(supplier)
                                const certs = supplierCerts(supplier)
                                return (
                                    <li key={supplier.id} className="flex items-start gap-3 py-3">
                                        <input
                                            type="checkbox"
                                            aria-label={`Include ${supplier.name}`}
                                            className="mt-1 h-4 w-4 rounded border-input accent-international-orange shrink-0"
                                        />
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-international-orange/10 text-international-orange shrink-0">
                                            <Building2 className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-0.5">
                                            <p className="text-sm font-semibold text-foreground truncate">
                                                {supplier.name || "Untitled supplier"}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                                                {country && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="h-3 w-3" />
                                                        {country}
                                                    </span>
                                                )}
                                                {supplier.subcategory && (
                                                    <span>{supplier.subcategory}</span>
                                                )}
                                                {certs.map((c, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 text-status-success">
                                                        <ShieldCheck className="h-3 w-3" />
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        {supplier.is_verified && (
                                            <Badge variant="outline" className="text-[10px] bg-status-success-light text-status-success border-status-success/30 shrink-0">
                                                Verified
                                            </Badge>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {/* Submit strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Link href={backHref}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Cancel
                    </Link>
                </Button>
                <Button asChild size="sm" className="gap-1.5 text-xs bg-international-orange hover:bg-international-orange/90 text-white">
                    <a href={mailto}>
                        <Send className="h-3.5 w-3.5" />
                        Open draft in mail client
                    </a>
                </Button>
            </div>

            <p className="text-[11.5px] text-muted-foreground italic">
                The mail draft opens without pre-filled recipients &mdash; copy the supplier emails from the list above once the draft&rsquo;s open.
                Native broadcast lands with the RFQ spine.
            </p>
        </WorkspaceShell>
    )
}
