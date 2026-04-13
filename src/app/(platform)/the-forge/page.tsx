/**
 * @file page.tsx — The Forge project list page
 *
 * @description Shows all forge projects for the current foundry with
 * cards showing project name, stage, module count, and thumbnail.
 * Provides a "Create Concept" CTA to start a new project.
 *
 * @related
 * - Server actions: src/actions/xray.ts (listScansAction)
 * - New concept page: src/app/(platform)/the-forge/new/page.tsx
 */

import React, { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ForgeProjectList } from "./components/forge-project-list"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "The Forge",
  description: "Turn product ideas into buildable engineering dossiers",
}

function LoadingSkeleton(): React.ReactNode {
  return (
    <div className="space-y-10">
      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-1 rounded-full" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-4 w-80 mt-2" />
      </div>

      {/* Starting paths */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Reference tools */}
      <Skeleton className="h-16 rounded-xl" />

      {/* Recent projects */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`proj-${i}`} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TheForgePage(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ForgeProjectList />
    </Suspense>
  )
}
