/**
 * @file layout.tsx — Shared layout for The Forge multi-page pipeline.
 *
 * @description Wraps all The Forge sub-routes in the CadLabProvider and renders
 * the persistent header, project picker, pipeline stepper navigation,
 * progress overlay, and milestone celebrations.
 *
 * maxDuration is set to 600s for long-running server actions (building
 * architectural models with 50+ components can take 5-8 min).
 */

export const maxDuration = 600

import { CadLabProviderWrapper } from "./cad-lab-layout-client"

export default function CadLabLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return <CadLabProviderWrapper>{children}</CadLabProviderWrapper>
}
