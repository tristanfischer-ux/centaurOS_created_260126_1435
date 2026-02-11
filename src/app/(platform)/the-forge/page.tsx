/**
 * @file page.tsx — The Forge route entry (formerly Product X-Ray)
 *
 * @description Renders the unified product dossier page with Suspense boundary
 * and loading skeleton. Consolidates the full product decomposition workflow:
 * idea -> blueprint -> architecture -> modules -> timeline -> risks -> team.
 */

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { XRayView } from "./xray-view"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "The Forge | ForgeOS",
  description: "Scan an idea into a buildable engineering dossier with 3D CAD models",
}

function LoadingSkeleton(): React.ReactNode {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

export default function TheForgePage(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <XRayView />
    </Suspense>
  )
}
