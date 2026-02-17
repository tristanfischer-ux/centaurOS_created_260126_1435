/**
 * @file page.tsx — Redirect legacy people page to CAD Lab pipeline
 */

import { redirect } from "next/navigation"

export default function PeopleRedirect(): never {
  redirect("/the-forge/cad-lab")
}
