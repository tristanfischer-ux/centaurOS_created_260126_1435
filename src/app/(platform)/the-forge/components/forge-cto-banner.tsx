/**
 * @file forge-cto-banner.tsx
 *
 * @description Specialist banner placeholder — removed specialist briefing UI per design direction.
 * File retained to avoid breaking imports (forge-project-list.tsx, tests).
 */

import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"

interface ForgeCtoBannerProps {
  projects: CadLabProjectSummary[]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ForgeCtoBanner(_props: ForgeCtoBannerProps) {
  return null
}
