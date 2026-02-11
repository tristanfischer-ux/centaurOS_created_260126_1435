/**
 * @file page.tsx — Product X-Ray route entry
 *
 * @description Renders the unified Product X-Ray dossier page with
 * Suspense boundary and loading skeleton. Consolidates v1 (interview,
 * RFQ), v2 (narrative dossier), and v3 (3D CAD) into a single route.
 */

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { XRayView } from "./xray-view"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Product X-Ray | ForgeOS",
  description: "AI-powered product decomposition — scan an idea into a buildable engineering dossier with 3D CAD models",
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

export default function ProductXRayPage(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <XRayView />
    </Suspense>
  )
}
