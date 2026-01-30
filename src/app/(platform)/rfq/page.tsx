import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Loader2, FileText, Send, Award } from 'lucide-react'
import { getMyRFQs, getRFQCounts, checkIsProvider } from '@/actions/rfq'
import { RFQCard } from '@/components/rfq/RFQCard'
import { SupplierRFQFeed } from '@/components/rfq/SupplierRFQFeed'

export const metadata = {
  title: 'RFQ Race | CentaurOS',
  description: 'Manage your requests for quotes',
}

export default async function RFQPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is a provider
  const { isProvider } = await checkIsProvider()

  // Get initial data
  const [buyerRFQs, supplierRFQs, counts] = await Promise.all([
    getMyRFQs('buyer', { limit: 20 }),
    isProvider ? getMyRFQs('supplier', { limit: 20 }) : { data: [], count: 0, error: null },
    getRFQCounts(),
  ])

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>
              RFQ Race
            </h1>
          </div>
          <p className={typography.pageSubtitle}>
            Create requests and compete for opportunities
          </p>
        </div>
        <Button asChild variant="default">
          <Link href="/rfq/create">
            <Plus className="w-4 h-4 mr-2" />
            Create RFQ
          </Link>
        </Button>
      </div>

      {/* Quick Stats */}
      {counts.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Open</p>
                  <p className="text-2xl font-bold">{counts.data.open}</p>
                </div>
                <FileText className="w-8 h-8 text-status-info" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bidding</p>
                  <p className="text-2xl font-bold">{counts.data.bidding}</p>
                </div>
                <Send className="w-8 h-8 text-status-success" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Awarded</p>
                  <p className="text-2xl font-bold">{counts.data.awarded}</p>
                </div>
                <Award className="w-8 h-8 text-international-orange" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{counts.data.total}</p>
                </div>
                <Badge variant="secondary" className="text-lg">All</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="my-requests" className="space-y-6">
        <TabsList>
          <TabsTrigger value="my-requests" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            My Requests
            {buyerRFQs.data.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {buyerRFQs.data.length}
              </Badge>
            )}
          </TabsTrigger>
          {isProvider && (
            <TabsTrigger value="available" className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Available RFQs
              {supplierRFQs.data.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {supplierRFQs.data.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="awarded" className="flex items-center gap-2">
            <Award className="w-4 h-4" />
            Awarded
          </TabsTrigger>
        </TabsList>

        {/* My Requests Tab */}
        <TabsContent value="my-requests" className="space-y-4">
          {buyerRFQs.error && (
            <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
              {buyerRFQs.error}
            </div>
          )}

          {buyerRFQs.data.length === 0 && !buyerRFQs.error ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No RFQs Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first request for quote to get started.
                </p>
                <Button asChild>
                  <Link href="/rfq/create">
                    <Plus className="w-4 h-4 mr-2" />
                    Create RFQ
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {buyerRFQs.data.map((rfq) => (
                <RFQCard key={rfq.id} rfq={rfq} role="buyer" />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Available RFQs Tab (Supplier View) */}
        {isProvider && (
          <TabsContent value="available">
            <SupplierRFQFeed initialRFQs={supplierRFQs.data} />
          </TabsContent>
        )}

        {/* Awarded Tab */}
        <TabsContent value="awarded" className="space-y-4">
          <Suspense fallback={<LoadingCard />}>
            <AwardedRFQs />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Server component for awarded RFQs
async function AwardedRFQs() {
  const { data: rfqs, error } = await getMyRFQs('buyer', { status: 'Awarded' })

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
        {error}
      </div>
    )
  }

  if (rfqs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">No Awarded RFQs</h3>
          <p className="text-muted-foreground">
            RFQs that have been awarded to suppliers will appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rfqs.map((rfq) => (
        <RFQCard key={rfq.id} rfq={rfq} role="buyer" />
      ))}
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
