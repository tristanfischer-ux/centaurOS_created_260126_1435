/**
 * @file page.tsx — X-Ray v3 route entry (3D CAD models)
 *
 * @description Product X-Ray with integrated 3D CAD model generation.
 * Reuses the v2 dossier view which now includes CadQuery-powered
 * 3D model generation per module (STEP, STL, SVG views).
 *
 * This is a separate route so v1 and v2 remain untouched.
 */

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { XRayV2View } from "../product-xray-v2/xray-v2-view"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Product X-Ray v3 (3D CAD) | CentaurOS",
  description: "AI-powered product decomposition with 3D CAD model generation",
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

export default function ProductXRayV3Page(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <XRayV2View />
    </Suspense>
  )
}
