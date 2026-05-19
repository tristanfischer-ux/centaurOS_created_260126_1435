/**
 * @file new-v2/page.tsx — A1-minimal entry point.
 *
 * Single textarea + Go button. Submits the brief to
 * /api/pdf-engine-v2/submit, then routes to /the-forge-v2/runs/[id]/wait.
 *
 * This page intentionally sidesteps the existing 5-step Intake Wizard at
 * /the-forge-v2/new. It exists alongside it while we validate the new
 * end-to-end engine (Mac Studio worker → serial-design-chain-v2). Once we
 * are happy with the new path, this becomes the default and the wizard is
 * archived.
 */

import type { Metadata } from "next"

import { NewBriefForm } from "./new-brief-form"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

export const metadata: Metadata = {
    title: "Generate an engineering report · The Forge",
    description:
        "Describe what you're building. The engine returns a full engineering report — brief, modules, bill of materials, costing, suppliers, and a printable PDF.",
}

export default function NewProjectV2Page(): React.ReactElement {
    return (
        <div className="space-y-6 max-w-3xl">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                    Generate an engineering report
                </h1>
                <p className="text-muted-foreground">
                    Describe what you are building in your own words. Be specific
                    about scale, geography, key constraints, and any numbers you
                    have. The engine reads the brief, decomposes the product into
                    modules, sizes each one, costs the bill of materials,
                    shortlists suppliers, and writes the report. Expect 40 to 60
                    minutes end-to-end.
                </p>
            </div>
            <NewBriefForm />
        </div>
    )
}
