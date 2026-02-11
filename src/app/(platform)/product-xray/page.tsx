/**
 * @file page.tsx — Redirect from old /product-xray route to /the-forge
 *
 * @description Permanent redirect so bookmarks and shared links don't break.
 */

import { redirect } from "next/navigation"

export default function ProductXRayRedirect(): never {
  redirect("/the-forge")
}
