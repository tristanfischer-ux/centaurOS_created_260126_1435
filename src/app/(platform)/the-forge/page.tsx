/**
 * @file page.tsx — /the-forge redirect
 *
 * @description Redirects /the-forge to /the-forge-v2/start so founders
 * typing fractionalforge.app/the-forge land on the narrative UX rather
 * than the legacy cockpit.
 *
 * The original cockpit view is preserved at /the-forge/cockpit for any
 * internal or admin links that still reference the old route.
 */

import { redirect } from "next/navigation"

export default function TheForgeRedirectPage(): never {
  redirect("/the-forge-v2/start")
}
