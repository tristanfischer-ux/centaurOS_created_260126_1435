/**
 * @file layout.tsx — Shared layout for The Forge multi-page pipeline.
 *
 * @description Wraps all The Forge sub-routes in the CadLabProvider and renders
 * the persistent header, project picker, pipeline stepper navigation,
 * progress overlay, and milestone celebrations.
 *
 * maxDuration is set to 300s — Vercel Pro caps at 300s without Fluid Compute.
 * The decomposition fallback chain (Opus→Sonnet→Gemini) fits within ~230s worst case.
 */

export const maxDuration = 300

import { CadLabProviderWrapper } from "./cad-lab-layout-client"

export default function CadLabLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return <CadLabProviderWrapper>{children}</CadLabProviderWrapper>
}
