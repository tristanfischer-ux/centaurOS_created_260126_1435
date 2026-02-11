/**
 * @file page.tsx — Stage 1: Concept page
 *
 * @description "What am I building?" — Shows the system blueprint,
 * executive dashboard, and inline idea refinement. This is the creative,
 * one-time setup stage where users define their product concept.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Components: system-blueprint.tsx, executive-dashboard.tsx, scan-hero.tsx
 */

import React from "react"

import { ConceptView } from "../../components/concept-view"

export default function ConceptPage(): React.ReactNode {
  return <ConceptView />
}
