/**
 * @file page.tsx — /onboarding/product · Step 3 of 7.
 *
 * @description Mockup-faithful port of FORGE-MOCKUP-ONBOARD-PRODUCT.html — the
 * branching point in onboarding where a founder chooses a path: validate a
 * hypothesis in Products, start a real project in The Forge, or open a
 * sandbox demo. The mockup is a router/choice page, not a form.
 *
 * Empty-state policy: if the user's foundry already has one or more products
 * persisted, we treat onboarding step 3 as complete and redirect forward to
 * step 4 (/onboarding/team) — the choice has already been made. If no
 * products exist, we render the three-path choice view.
 *
 * Step 4 onwards (/onboarding/team, /onboarding/integrations, etc.) does
 * not exist yet — the mockup links to sibling HTML pages. We honour the
 * sidebar strip in the view but the forward redirect lands on /today when
 * /onboarding/team is missing, which matches the "skip for now" skip-line
 * behaviour in the mockup footer.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 * @related
 *   - Mockup: FORGE-MOCKUP-ONBOARD-PRODUCT.html (repo root)
 *   - View:   ./onboard-product-view.tsx
 *   - Styles: ./onboard-product-v2.css (scoped .opd2-)
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { OnboardProductView } from "./onboard-product-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Your first product idea · Onboarding · ForgeOS",
    description:
        "Pick the path that matches where you are — validate a hypothesis, start a build in The Forge, or open a sandbox demo.",
}

export default async function OnboardProductPage(): Promise<React.ReactNode> {
    // AUTH: Verify authenticated user
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // FOUNDRY: Resolve caller's foundry (cached)
    const foundryId = await getFoundryIdCached()
    if (!foundryId) redirect("/setup/foundry")

    // EMPTY-STATE POLICY: If the foundry already has products, the founder has
    // passed the branching point. Forward to /today — the next onboarding
    // step (/onboarding/team) does not exist yet, so /today is the safe land.
    const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("foundry_id", foundryId)

    if ((count ?? 0) > 0) {
        redirect("/today")
    }

    return <OnboardProductView />
}
