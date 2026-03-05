/**
 * @file RFQ Detail Page
 * @description Displays a single RFQ with its specifications, status, and responses.
 * Reuses the existing RFQDetail client component.
 */

import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getRFQDetail } from "@/actions/rfq"
import { RFQDetail } from "@/components/rfq/RFQDetail"

interface RFQPageProps {
  params: Promise<{ id: string }>
}

export default async function RFQPage({ params }: RFQPageProps) {
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

  const isOwner = rfq.buyer_id === user.id
  const hasResponded = rfq.has_user_responded ?? false

  return (
    <div className="max-w-5xl space-y-6">
      <RFQDetail rfq={rfq} isOwner={isOwner} hasResponded={hasResponded} />
    </div>
  )
}
