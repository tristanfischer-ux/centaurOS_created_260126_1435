/**
 * @file new/page.tsx — /the-forge-v2/new PROJECT-CREATE wizard (server shell).
 *
 * @description Server page that wraps the client wizard in `WorkspaceShell`
 * so the chrome, breadcrumb, and page typography stay consistent with the
 * rest of The Forge v2. The actual 3-step interaction lives in the client
 * component — this file only owns metadata, the shell, and the Suspense
 * boundary the client component renders beneath.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-PROJECT-CREATE.html
 * - Client: ./_components/new-project-wizard
 */

import type { Metadata } from "next"

import { WorkspaceShell } from "../_components/workspace-shell"

import { NewProjectWizard } from "./_components/new-project-wizard"

export const metadata: Metadata = {
    title: "The Forge · New project",
    description:
        "Describe what you're building and let the specialists draft rev 0.1 of your Brief, Modules, BOM, and Risks register.",
}

export const dynamic = "force-dynamic"

export default function NewProjectPage(): React.ReactElement {
    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: "New project" },
            ]}
            subtitle="Describe the product in your own words. Rev 0.1 of the Brief, Modules, BOM, and Risks register drafts from what you say — you review before anything locks."
            maxWidth="narrow"
        >
            <NewProjectWizard />
        </WorkspaceShell>
    )
}
