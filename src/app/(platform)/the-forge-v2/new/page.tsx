/**
 * @file new/page.tsx — /the-forge-v2/new Project-create flow stub.
 *
 * @description Redirects to the existing CAD Lab new-concept form until the
 * PROJECT-CREATE V2 wizard ships. The old path stays fully functional — only
 * the entry point moves to /the-forge-v2.
 */

import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function ForgeV2NewProjectPage(): never {
    redirect("/the-forge/cad-lab?new=1")
}
