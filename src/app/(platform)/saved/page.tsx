/**
 * @file /saved page
 *
 * @description W39 fix (2026-04-28): /saved was a 404. Three users hit it —
 * likely from old bookmarks, shared links, or email footers referencing this
 * path. The closest equivalent is /agents where saved brainstorm sessions live.
 *
 * Redirect to /agents so users land on the saved-sessions panel rather than
 * seeing a 404.
 */

import { redirect } from "next/navigation"

export default function SavedPage(): never {
  redirect("/agents")
}
