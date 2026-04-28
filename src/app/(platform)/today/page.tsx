/**
 * @file /today page
 *
 * @description W38 fix (2026-04-28): /today was a 404 that the middleware
 * redirected to when no last-visited cookie was set. Four test users hit it
 * and saw it silently resolve to /investors (via the middleware's fallback
 * logic). The sidebar, mobile nav, and several breadcrumbs also link here.
 *
 * Minimal fix: redirect to /investors (the current primary feature) until
 * a proper "Today" dashboard is built. Server component so the redirect
 * happens immediately with no client-side flash.
 */

import { redirect } from "next/navigation"

export default function TodayPage(): never {
  redirect("/investors")
}
