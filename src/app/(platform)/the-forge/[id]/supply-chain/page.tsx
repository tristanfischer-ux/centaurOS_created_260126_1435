/**
 * @file page.tsx — Stage 4: Supply Chain page
 *
 * @description "Who builds it?" — Matches suppliers to modules, allows
 * supplier comparison and assignment. Sourcing decisions live here.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Components: supply-chain.tsx
 */

import React from "react"

import { SupplyChainView } from "../../components/supply-chain-view"

export default function SupplyChainPage(): React.ReactNode {
  return <SupplyChainView />
}
