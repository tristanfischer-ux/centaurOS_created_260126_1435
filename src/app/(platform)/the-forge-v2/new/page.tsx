/**
 * @file new/page.tsx — /the-forge-v2/new — Flow A: guided intake wizard.
 *
 * @description Hosts the 5-step guided intake wizard (IntakeWizard) that
 * replaces the blank text box with structured numeric capture. Structured
 * fields (target_scale, market_segment, geography, startup_stage,
 * additional_context) are persisted to cad_lab_projects alongside the brief
 * and used by Gate 1 as ground truth for numeric verification.
 *
 * This is the primary "start a new project" entry point — the simple
 * one-textarea page at /the-forge-v2/start still exists for quick access
 * but the sidebar "+ New project" CTA routes here.
 *
 * @related
 *   - src/app/(platform)/the-forge-v2/new/_components/intake-wizard.tsx
 *   - src/actions/start-project-with-autopilot.ts (accepts WizardIntakeFields)
 *   - supabase/migrations/..._forge_intake_wizard_fields.sql (new columns)
 */

import type { Metadata } from "next"
import Link from "next/link"

import { IntakeWizard } from "./_components/intake-wizard"

export const dynamic = "force-dynamic"
// GOTCHA: createCadLabProject + startAutopilot use after() for Chase
// auto-trigger. after() requires the Node.js runtime — without this,
// containers tear down before the deferred work fires.
export const runtime = "nodejs"
export const maxDuration = 30

export const metadata: Metadata = {
    title: "Start a new project · The Forge",
    description:
        "Tell the engine what you're building, who it's for, and what the key constraints are. The engine produces a full engineering report — Brief, BOM, cost model, supplier shortlist, regulatory matrix, and a printable PDF.",
}

export default function NewProjectPage(): React.ReactElement {
    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
                <Link
                    href="/the-forge-v2"
                    className="hover:text-foreground transition-colors"
                >
                    Forge
                </Link>
                <span className="mx-2">›</span>
                <span className="text-foreground">New project</span>
            </nav>

            {/* Page header */}
            <div className="space-y-1">
                <h1 className="text-3xl font-bold text-foreground">
                    Start a new project
                </h1>
                <p className="text-muted-foreground max-w-2xl">
                    Five quick steps to give the engine everything it needs. The more
                    specific you are about scale and constraints, the tighter the
                    output.
                </p>
            </div>

            {/* Wizard */}
            <IntakeWizard />
        </div>
    )
}
