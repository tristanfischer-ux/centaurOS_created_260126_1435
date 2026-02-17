/**
 * @file page.tsx — Redirect legacy /the-forge/[id] to CAD Lab pipeline
 *
 * @description The legacy per-project routes have been replaced by the
 * CAD Lab pipeline. This redirect preserves URL stability.
 */

import { redirect } from "next/navigation"

export default function ForgeProjectRedirect(): never {
  redirect("/the-forge/cad-lab")
}
