/**
 * @file page.tsx — Product Studio: unified single-page Forge experience.
 *
 * @description Hidden page at /the-forge/studio that consolidates the three
 * Forge tracks (CAD Lab, Mashup Lab, Assembly Builder) into one vertical flow:
 * Brief -> Research -> Design -> Specs -> Quote.
 *
 * INTENT: This page exists as a prototype for the consolidated Forge experience.
 * It is NOT linked from navigation or the landing page — accessible only via
 * direct URL while we iterate on it.
 */

export const maxDuration = 600

import React, { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { StudioProviderWrapper } from "./studio-layout"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Product Studio | The Forge | ForgeOS",
  description: "Turn a product idea into a supplier-ready engineering package — one page, one flow",
}

function LoadingSkeleton(): React.ReactNode {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  )
}

export default function ProductStudioPage(): React.ReactNode {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <StudioProviderWrapper />
    </Suspense>
  )
}
