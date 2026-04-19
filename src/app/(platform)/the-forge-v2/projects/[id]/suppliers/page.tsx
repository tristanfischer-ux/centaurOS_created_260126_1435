/**
 * @file suppliers/page.tsx — /the-forge-v2/projects/:id/suppliers
 *
 * @description Supplier roster stub — full matching/lifecycle tooling lives in
 * a later PR. Today, shows the linked RFQ (if any) + a CTA to run supplier
 * matching from CAD Lab.
 *
 * Mockup ref: FORGE-MOCKUP-SUPPLIERS.html.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Truck, ArrowRight, Sparkles } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Suppliers · The Forge" }
    return { title: `Suppliers · ${result.project.name}` }
}

export default async function ForgeV2SuppliersPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: `/the-forge-v2/projects/${project.id}` },
                { label: "Suppliers" },
            ]}
            subtitle={project.linkedRfqId ? "1 linked RFQ" : "No supplier activity yet"}
        >
            <Card className="rounded-xl border">
                <CardContent className="py-10 flex flex-col items-center text-center gap-4 max-w-xl mx-auto">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-international-orange/10">
                        <Truck className="h-6 w-6 text-international-orange" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">Supplier lifecycle coming to Forge v2</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            The supplier roster, award tracking, and RFQ automation ship in a follow-up PR. In the meantime, supplier matching + RFQ creation run from CAD Lab with your existing supplier database.
                        </p>
                    </div>
                    {project.linkedRfqId ? (
                        <Badge variant="outline" className="text-xs bg-status-success-light text-status-success border-status-success/30">
                            RFQ {project.linkedRfqId} linked
                        </Badge>
                    ) : null}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Link
                            href={`/the-forge/cad-lab?project=${project.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-international-orange text-white text-sm font-semibold hover:bg-international-orange/90 transition-colors"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            Match suppliers in CAD Lab
                        </Link>
                        <Link
                            href="/suppliers/search"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-semibold hover:bg-muted transition-colors"
                        >
                            Browse suppliers <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </WorkspaceShell>
    )
}
