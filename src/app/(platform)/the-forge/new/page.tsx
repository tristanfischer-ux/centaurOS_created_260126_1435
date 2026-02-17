/**
 * @file page.tsx — Redirect legacy /the-forge/new to CAD Lab pipeline
 *
 * @description The legacy concept creation page has been replaced by the
 * CAD Lab pipeline at /the-forge/cad-lab. This redirect preserves URL
 * stability for any bookmarks.
 */

import { redirect } from "next/navigation"

export default function NewScanRedirect(): never {
  redirect("/the-forge/cad-lab")
}
