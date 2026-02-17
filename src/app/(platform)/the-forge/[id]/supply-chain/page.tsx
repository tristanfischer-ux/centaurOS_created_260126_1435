/**
 * @file page.tsx — Redirect legacy supply chain page to CAD Lab pipeline
 */

import { redirect } from "next/navigation"

export default function SupplyChainRedirect(): never {
  redirect("/the-forge/cad-lab")
}
