import { redirect } from "next/navigation"

/**
 * @description Legacy redirect: /inspiration action content moved to Objectives
 * page, educational content moved to Workshop > Inspiration (/learn).
 * Preserves old bookmarks and links.
 */
export default function InspirationRedirect(): never {
  redirect("/new-objectives")
}
