/**
 * @file people-view.tsx — Stage 3: People & Review client component
 *
 * @description "Who checks this?" — Displays matched experts and allows
 * assigning fractional executives to review modules. Loads people on mount.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/people/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 */

"use client"

import React, { useEffect } from "react"

import { EmptyState } from "@/components/ui/empty-state"

import { useForgeProject } from "./forge-project-context"
import { TeamMap } from "./team-map"

/**
 * PeopleView — Stage 3 client component.
 *
 * @description Renders the TeamMap component for expert matching and review.
 * Automatically loads people matches on mount if modules exist.
 */
export function PeopleView(): React.ReactNode {
  const {
    spec,
    people,
    isPeopleLoading,
    loadPeople,
  } = useForgeProject()

  const hasModules = spec.modules.length > 0

  // Auto-load people on mount
  useEffect(() => {
    if (hasModules && people.length === 0 && !isPeopleLoading) {
      loadPeople(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasModules])

  if (!hasModules) {
    return (
      <EmptyState
        title="No modules defined yet"
        description="Create a product concept on the Concept page first. Expert matches will appear here based on the modules identified."
      />
    )
  }

  return (
    <TeamMap
      spec={spec}
      people={people}
      isPeopleLoading={isPeopleLoading}
      onRefreshPeople={() => loadPeople(true)}
    />
  )
}
