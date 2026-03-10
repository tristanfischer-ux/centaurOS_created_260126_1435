/**
 * @file RFQ Edit / Duplicate Page
 * @description Renders the RFQ Wizard pre-filled from an existing RFQ.
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRFQDetail } from '@/actions/rfq'
import { RFQWizard } from '@/components/rfq/RFQWizard'
import type { RFQType } from '@/types/rfq'

interface RFQEditPageProps {
  params: Promise<{ id: string }>
}

export default async function RFQEditPage({ params }: RFQEditPageProps) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const { data: rfq, error } = await getRFQDetail(id)

  if (error || !rfq) {
    notFound()
  }

  // Only the owner can edit
  if (rfq.buyer_id !== user.id) {
    notFound()
  }

  // Cannot edit awarded, closed, or cancelled RFQs
  if (rfq.status === 'Awarded' || rfq.status === 'Closed' || rfq.status === 'cancelled') {
    notFound()
  }

  const specs = rfq.specifications || {}

  return (
    <div className="max-w-5xl h-[calc(100vh-4rem)]">
      <RFQWizard
        editRfqId={rfq.id}
        initialTitle={rfq.title}
        initialCategory={rfq.category || ''}
        initialDescription={
          typeof specs.description === 'string' ? specs.description : ''
        }
        initialRfqType={rfq.rfq_type as RFQType}
        initialBudgetMin={rfq.budget_min != null ? String(rfq.budget_min) : ''}
        initialBudgetMax={rfq.budget_max != null ? String(rfq.budget_max) : ''}
        initialDeadline={rfq.deadline ? rfq.deadline.split('T')[0] : ''}
      />
    </div>
  )
}
