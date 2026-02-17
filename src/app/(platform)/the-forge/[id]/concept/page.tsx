/**
 * @file page.tsx — Redirect legacy concept page to CAD Lab pipeline
 */

import { redirect } from "next/navigation"

export default function ConceptRedirect(): never {
  redirect("/the-forge/cad-lab")
}
