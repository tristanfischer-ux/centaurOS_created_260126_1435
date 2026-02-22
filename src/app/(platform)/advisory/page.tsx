import { redirect } from "next/navigation"

/**
 * @description Advisory page redirect — Q&A now lives on the Learn page.
 */
export default function AdvisoryPage(): never {
  redirect("/learn?tab=qa")
}
