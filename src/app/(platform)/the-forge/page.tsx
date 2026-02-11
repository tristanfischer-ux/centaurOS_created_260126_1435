/**
 * @file page.tsx — The Forge project list page
 *
 * @description Shows all forge projects for the current foundry with
 * cards showing project name, stage, module count, and thumbnail.
 * Provides a "New Scan" CTA to start a new project.
 *
 * @related
 * - Server actions: src/actions/xray.ts (listScansAction)
 * - New scan page: src/app/(platform)/the-forge/new/page.tsx
 */

import React, { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ForgeProjectList } from "./components/forge-project-list"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "The Forge | ForgeOS",
  description: "Scan product ideas into buildable engineering dossiers",
}

function LoadingSkeleton(): React.ReactNode {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
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
