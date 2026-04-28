/**
 * @file page.tsx — /the-forge redirect
 *
 * @description Redirects /the-forge to /the-forge-v2 (the dashboard with the
 * project grid + a "Start a new project" CTA). Founders typing
 * fractionalforge.app/the-forge land on the projects overview, not the
 * blank wizard.
 *
 * The original cockpit view is preserved at /the-forge/cockpit for any
 * internal or admin links that still reference the old route.
 *
 * History: an earlier version (2026-04-28 16:26 BST) redirected directly to
 * /the-forge-v2/new (the 5-step intake wizard), which skipped the project
 * grid entirely — Tristan flagged this. Fixed to land on the dashboard.
 */

import { redirect } from "next/navigation"

export default function TheForgeRedirectPage(): never {
  // Land on the V2 dashboard (project grid + new-project CTA), not the wizard.
  // The wizard is one click away via "Start a new project →" on the dashboard.
  redirect("/the-forge-v2")
}
