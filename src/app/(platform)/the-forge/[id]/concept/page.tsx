/**
 * @file page.tsx — Stage 1: Concept page
 *
 * @description "What am I building?" — Idea input and product research.
 * This is the creative, one-time setup stage where users define their
 * product concept. After a successful scan, users are auto-navigated
 * to the Dossier Summary tab for the system overview.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Components: scan-hero.tsx, concept-research.tsx
 * - Post-scan destination: dossier/page.tsx (Summary tab)
 */

import React from "react"

import { ConceptView } from "../../components/concept-view"

export default function ConceptPage(): React.ReactNode {
  return <ConceptView />
}
