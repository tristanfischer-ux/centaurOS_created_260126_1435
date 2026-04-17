/**
 * @file layout.tsx — Shared layout for The Forge multi-page pipeline.
 *
 * @description Wraps all The Forge sub-routes in the CadLabProvider and renders
 * the persistent header, project picker, pipeline stepper navigation,
 * progress overlay, and milestone celebrations.
 *
 * maxDuration is set to 300s — Vercel Pro caps at 300s without Fluid Compute.
 * The decomposition chain races Sonnet+Gemini in parallel (240s) then OpenAI fallback (55s) = 295s worst case.
 */

export const maxDuration = 300

import { Suspense } from "react"
import { CadLabProviderWrapper } from "./cad-lab-layout-client"

export default function CadLabLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  // Next 15+ requires useSearchParams consumers to sit inside a Suspense
  // boundary or the whole segment bails to CSR at build time. The CAD Lab
  // shell (cad-lab-layout-client.tsx) reads useSearchParams(), and so do
  // all 4 stage pages. One shared boundary here avoids per-page Suspense
  // wrappers. Fallback renders as null so the user sees nothing flashing —
  // the pages render their own loading states via loading.tsx.
  return (
    <Suspense fallback={null}>
      <CadLabProviderWrapper>{children}</CadLabProviderWrapper>
    </Suspense>
  )
}
