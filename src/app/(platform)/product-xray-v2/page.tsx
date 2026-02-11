/**
 * @file page.tsx — X-Ray v2 route entry
 *
 * @description Renders the redesigned Product X-Ray "dossier" page
 * with Suspense boundary and loading skeleton.
 */

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { XRayV2View } from "./xray-v2-view"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Product X-Ray v2 | ForgeOS",
  description: "AI-powered product decomposition — dossier view",
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

export default function ProductXRayV2Page(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <XRayV2View />
    </Suspense>
  )
}
