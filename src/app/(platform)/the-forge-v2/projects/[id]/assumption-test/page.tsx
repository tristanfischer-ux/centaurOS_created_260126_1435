/**
 * @file assumption-test/page.tsx — /the-forge-v2/projects/:id/assumption-test
 *
 * @description Logs a Products-style experiment against this Forge project —
 * hypothesis, expected outcome, actual outcome, decision (keep / kill / pivot).
 * No `assumption_tests` table exists yet; the submit handler in the client
 * form persists only to local state so the founder can see the record shape.
 * When the table + Products propagation ship, the client form swaps for a
 * server action without changing the UX.
 *
 * Mockup ref: FORGE-MOCKUP-ASSUMPTION-TEST.html.
 */

import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Beaker } from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"

import { WorkspaceShell } from "../../../_components/workspace-shell"

import { AssumptionForm } from "./_components/assumption-form"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Assumption test · The Forge" }
    return { title: `Assumption test · ${result.project.name}` }
}

export default async function ForgeV2AssumptionTestPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project
    const projectHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: projectHref },
                { label: "Assumption test" },
            ]}
            subtitle="Turn a belief into a test — hypothesis, expected result, actual result, decision."
            maxWidth="narrow"
        >
            {/* Intent callout */}
            <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <Beaker className="h-5 w-5 text-international-orange mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-foreground">How assumption tests work</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Every risky assumption deserves its own test. Write the hypothesis, define what validated looks like (specific numbers, not vibes), run the test, record what actually happened, then decide: keep, kill, or pivot. The decision propagates to the Products surface — SAM confidence, pricing band, persona focus.
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Pre-commit the decision tree before the data arrives. That stops sunk-cost reasoning when a result lands mid-way between validated and killed.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <AssumptionForm />
        </WorkspaceShell>
    )
}
