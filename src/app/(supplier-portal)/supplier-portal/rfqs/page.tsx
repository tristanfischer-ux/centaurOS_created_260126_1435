import { Suspense } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { typography } from "@/lib/design-system"
import { FileText, Clock, DollarSign, Users, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

function RFQsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-full" />
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  )
}

async function RFQsContent() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // Fetch open RFQs
  const { data: openRfqs } = await supabase
    .from("rfqs")
    .select(`
      id,
      title,
      description,
      budget_min,
      budget_max,
      currency,
      deadline,
      category,
      created_at,
      rfq_responses (id, provider_id)
    `)
    .eq("status", "Open")
    .order("created_at", { ascending: false })

  // Fetch RFQs I've responded to
  const { data: myResponses } = await supabase
    .from("rfq_responses")
    .select(`
      id,
      status,
      proposed_amount,
      created_at,
      rfq:rfqs (
        id,
        title,
        budget_max,
        currency,
        deadline,
        status
      )
    `)
    .order("created_at", { ascending: false })

  const availableRfqs = openRfqs || []
  const respondedRfqs = myResponses || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>RFQ Opportunities</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Browse and respond to quote requests
          </p>
        </div>
      </div>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">
            Available ({availableRfqs.length})
          </TabsTrigger>
          <TabsTrigger value="responded">
            My Responses ({respondedRfqs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-6">
          {availableRfqs.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No RFQs available</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Check back later for new quote requests matching your profile.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {availableRfqs.map((rfq) => (
                <Card key={rfq.id} className="hover:border-international-orange/50 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{rfq.title}</h3>
                          {rfq.category && (
                            <Badge variant="secondary">{rfq.category}</Badge>
                          )}
                        </div>
                        {rfq.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {rfq.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {rfq.budget_max && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              Budget: {rfq.currency} {rfq.budget_min?.toLocaleString()} - {rfq.budget_max.toLocaleString()}
                            </span>
                          )}
                          {rfq.deadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Due: {new Date(rfq.deadline).toLocaleDateString()}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {rfq.rfq_responses?.length || 0} responses
                          </span>
                        </div>
                      </div>
                      <Link href={`/rfq/${rfq.id}`}>
                        <Button>
                          Respond
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="responded" className="mt-6">
          {respondedRfqs.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No responses yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Your RFQ responses will appear here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {respondedRfqs.map((response) => (
                <Card key={response.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold truncate">
                            {response.rfq?.title || 'Unknown RFQ'}
                          </h3>
                          <Badge 
                            variant="secondary"
                            className={cn(
                              response.status === 'pending' && 'bg-status-warning-light text-status-warning-dark',
                              response.status === 'accepted' && 'bg-status-success-light text-status-success-dark',
                              response.status === 'rejected' && 'bg-status-error-light text-status-error-dark'
                            )}
                          >
                            {response.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>
                            Your quote: {response.rfq?.currency || 'USD'} {response.proposed_amount?.toLocaleString()}
                          </span>
                          <span>
                            Submitted: {new Date(response.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Link href={`/rfq/${response.rfq?.id}`}>
                        <Button variant="secondary" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function SupplierRFQsPage() {
  return (
    <Suspense fallback={<RFQsSkeleton />}>
      <RFQsContent />
    </Suspense>
  )
}
