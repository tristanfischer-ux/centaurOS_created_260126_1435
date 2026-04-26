import { redirect } from "next/navigation";

/**
 * /join → /signup redirect.
 *
 * @description The canonical signup URL is /signup, matching industry
 * convention. This file preserves /join as a permanent redirect so that any
 * old links (marketing emails, blog posts, third-party references) continue
 * to land on the right page.
 *
 * Server component, single-line redirect — Next.js issues a 307 by default,
 * which preserves the request method and any query string.
 */
export default function JoinRedirect() {
  redirect("/signup");
}
