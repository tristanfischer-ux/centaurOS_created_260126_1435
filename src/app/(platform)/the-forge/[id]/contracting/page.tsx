/**
 * @file page.tsx — Redirect legacy contracting page to CAD Lab pipeline
 */

import { redirect } from "next/navigation"

export default function ContractingRedirect(): never {
  redirect("/the-forge/cad-lab")
}
