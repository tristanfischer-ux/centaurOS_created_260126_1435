/**
 * @file specialists/page.tsx — /the-forge-v2/specialists
 *
 * @description Legacy redirect. The canonical Experts directory lives at
 * `/the-forge-v2/experts` (broader bench — includes the 13 in-product
 * specialists AND any fractional executives on the foundry). This route
 * used to render a parallel "just the 13" list, which duplicated the
 * Experts page in a slightly different format and confused founders
 * about which directory was authoritative.
 *
 * Per the Forge V2 consolidation (2026-04-20), the list is gone. The
 * detail route `/the-forge-v2/specialists/:id` is still live and owns
 * the specialist profile pages — only the bare list redirects.
 *
 * @related
 *   - Canonical list: /the-forge-v2/experts
 *   - Detail:         /the-forge-v2/specialists/:id (kept)
 */

import { redirect } from "next/navigation"

export default function ForgeV2SpecialistsListRedirect(): never {
    redirect("/the-forge-v2/experts")
}
