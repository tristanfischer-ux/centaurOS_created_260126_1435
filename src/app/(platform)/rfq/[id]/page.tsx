import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { getRFQDetail, checkIsProvider } from '@/actions/rfq'
import { getMyRFQResponse } from '@/actions/rfq-responses'
import { RFQResponseForm } from '@/components/rfq/RFQResponseForm'
import { RFQDetailClient } from './rfq-detail-client'

interface RFQDetailPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: RFQDetailPageProps) {
  const { id } = await params
  const { data: rfq } = await getRFQDetail(id)

  return {
    title: rfq ? `${rfq.title} | RFQ` : 'RFQ Not Found',
    description: rfq?.specifications?.description || 'Request for Quote details',
  }
}

export default async function RFQDetailPage({ params }: RFQDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  // Get RFQ details
  const { data: rfq, error } = await getRFQDetail(id)

  if (error || !rfq) {
    notFound()
  }

  // Check ownership and provider status
  const isOwner = rfq.buyer_id === user.id
  const { isProvider } = await checkIsProvider()

  // Check if supplier has already responded
  let hasResponded = false
  if (isProvider && !isOwner) {
    const { data: myResponse } = await getMyRFQResponse(id)
    hasResponded = !!myResponse
  }

  // Determine if supplier can respond
  const canRespond = isProvider && 
    !isOwner && 
    !hasResponded && 
    (rfq.status === 'Open' || rfq.status === 'Bidding')

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Back button */}
      <Button variant="ghost" asChild>
        <Link href="/rfq">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to RFQs
        </Link>
      </Button>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* RFQ Details - Takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <RFQDetailClient
            rfq={rfq}
            isOwner={isOwner}
            hasResponded={hasResponded}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Response Form for Suppliers */}
          {canRespond && (
            <Suspense fallback={<LoadingCard />}>
              <RFQResponseForm rfq={rfq} />
            </Suspense>
          )}

          {/* Already responded message */}
          {isProvider && !isOwner && hasResponded && (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-muted-foreground">
                  You have already responded to this RFQ.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Quick Info */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">
                Race Mechanics
              </h4>
              <div className="text-sm space-y-2">
                {rfq.rfq_type === 'commodity' && (
                  <p>
                    <strong>Commodity:</strong> First supplier to accept wins automatically.
                  </p>
                )}
                {rfq.rfq_type === 'custom' && (
                  <p>
                    <strong>Custom:</strong> First supplier gets 2-hour priority hold. 
                    Buyer confirms or releases.
                  </p>
                )}
                {rfq.rfq_type === 'service' && (
                  <p>
                    <strong>Service:</strong> Buyer reviews all responses and selects winner.
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground pt-2 border-t">
                <p>Verified Partners get priority access (30s head start).</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="py-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  )
}
