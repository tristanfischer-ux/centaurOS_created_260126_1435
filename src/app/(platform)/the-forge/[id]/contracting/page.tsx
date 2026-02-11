/**
 * @file page.tsx — Stage 5: Contracting & RFQ page
 *
 * @description "How do we formalize it?" — Generate Requests for Quotation,
 * review contract terms, and formalize procurement. The final pipeline stage.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Components: rfq-section.tsx
 */

import React from "react"

import { ContractingView } from "../../components/contracting-view"

export default function ContractingPage(): React.ReactNode {
  return <ContractingView />
}
