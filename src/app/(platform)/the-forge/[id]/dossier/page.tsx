/**
 * @file page.tsx — Redirect legacy dossier page to CAD Lab pipeline
 */

import { redirect } from "next/navigation"

export default function DossierRedirect(): never {
  redirect("/the-forge/cad-lab")
}
