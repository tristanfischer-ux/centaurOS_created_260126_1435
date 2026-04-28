/**
 * @file /today page
 *
 * @description W38 fix (2026-04-28, v2): /today is the default landing page
 * referenced throughout the sidebar, mobile nav, middleware last-visited
 * fallback, and several onboarding redirects. This stub renders a proper
 * 200 response so those links resolve cleanly while a full "Today" dashboard
 * is built.
 *
 * DECISION: Render inline rather than redirect so the URL stays stable.
 * A redirect-stub breaks any feature that checks the current pathname
 * (e.g. active-nav highlighting, middleware last-path cookie).
 */

import { TodayView } from "./today-view"

export const metadata = {
  title: "Today — ForgeOS",
}

export default function TodayPage() {
  return <TodayView />
}
