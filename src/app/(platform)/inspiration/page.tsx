import { redirect } from "next/navigation"

/**
 * @description Legacy redirect: /inspiration now lives at /playbooks.
 * Preserves old bookmarks and links.
 */
export default function InspirationRedirect(): never {
  redirect("/playbooks")
}
