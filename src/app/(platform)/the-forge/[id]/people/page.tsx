/**
 * @file page.tsx — Stage 3: People & Review page
 *
 * @description "Who checks this?" — Assigns fractional executives and
 * experts to review modules. Shows matched people from the marketplace
 * and their expertise alignment with the project's needs.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Components: team-map.tsx
 */

import React from "react"

import { PeopleView } from "../../components/people-view"

export default function PeoplePage(): React.ReactNode {
  return <PeopleView />
}
