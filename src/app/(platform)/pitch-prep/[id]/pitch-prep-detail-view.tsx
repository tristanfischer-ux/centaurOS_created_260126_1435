'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { 
  ArrowLeft,
  Building2,
  Users,
  Target,
  TrendingUp,
  Calendar,
  Info,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react'
import { PitchPrepRequest, PitchPrepStatus } from '@/types/pitch-prep'
import { cancelPitchPrepRequest } from '@/actions/pitch-prep'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface PitchPrepDetailViewProps {
  request: PitchPrepRequest
}

const STATUS_COLORS: Record<PitchPrepStatus, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'; label: string }> = {
  draft: { variant: 'secondary', label: 'Draft' },
  submitted: { variant: 'info', label: 'Submitted' },
  in_review: { variant: 'warning', label: 'In Review' },
  matched: { variant: 'default', label: 'Matched' },
  in_progress: { variant: 'default', label: 'In Progress' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'destructive', label: 'Cancelled' },
}

export function PitchPrepDetailView({ request }: PitchPrepDetailViewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const statusConfig = STATUS_COLORS[request.status]
  const canCancel = !['completed', 'cancelled'].includes(request.status)

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelPitchPrepRequest(request.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Request cancelled')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <Link 
            href="/pitch-prep" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Pitch Prep
          </Link>
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>{request.company_name}</h1>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            <span className="text-sm text-muted-foreground">
              Created {format(new Date(request.created_at), 'PPP')}
            </span>
          </div>
        </div>
        
        {canCancel && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <X className="h-4 w-4 mr-2" />
                Cancel Request
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will cancel your pitch prep request. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Request</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Cancel Request
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Legal Disclaimer */}
      <Alert className="bg-status-info-light border-status-info">
        <Info className="h-4 w-4 text-status-info" />
        <AlertDescription className="text-status-info-dark">
          <strong>Preparation Service Only:</strong> CentaurOS helps you prepare for investor conversations. 
          We do not provide investment advice or facilitate securities transactions.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Company Name</p>
                  <p className="font-medium">{request.company_name}</p>
                </div>
                {request.company_website && (
                  <div>
                    <p className="text-sm text-muted-foreground">Website</p>
                    <a 
                      href={request.company_website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="font-medium text-electric-blue hover:underline inline-flex items-center gap-1"
                    >
                      {request.company_website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {request.headquarters && (
                  <div>
                    <p className="text-sm text-muted-foreground">Headquarters</p>
                    <p className="font-medium">{request.headquarters}</p>
                  </div>
                )}
                {request.legal_structure && (
                  <div>
                    <p className="text-sm text-muted-foreground">Legal Structure</p>
                    <p className="font-medium">{request.legal_structure}</p>
                  </div>
                )}
              </div>

              {(request.founder_count || request.team_size) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    {request.founder_count && (
                      <div>
                        <p className="text-sm text-muted-foreground">Founders</p>
                        <p className="font-medium">{request.founder_count}</p>
                      </div>
                    )}
                    {request.team_size && (
                      <div>
                        <p className="text-sm text-muted-foreground">Team Size</p>
                        <p className="font-medium">{request.team_size}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Product & Market */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Product & Market
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Product Description</p>
                <p className="whitespace-pre-wrap">{request.product_description}</p>
              </div>
              
              {request.problem_solved && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Problem Solved</p>
                  <p className="whitespace-pre-wrap">{request.problem_solved}</p>
                </div>
              )}

              {request.target_market && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Target Market</p>
                  <p className="whitespace-pre-wrap">{request.target_market}</p>
                </div>
              )}

              {request.competitive_landscape && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Competitive Landscape</p>
                  <p className="whitespace-pre-wrap">{request.competitive_landscape}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Traction */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Traction & Stage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="text-sm">{request.stage}</Badge>
                {request.has_revenue && (
                  <Badge variant="success">Has Revenue</Badge>
                )}
              </div>

              {request.traction_summary && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Traction Summary</p>
                  <p className="whitespace-pre-wrap">{request.traction_summary}</p>
                </div>
              )}

              {(request.amount_seeking || request.timeline || request.use_of_funds) && (
                <>
                  <Separator />
                  <p className="text-sm text-muted-foreground">Fundraising Context (informational)</p>
                  <div className="grid grid-cols-2 gap-4">
                    {request.amount_seeking && (
                      <div>
                        <p className="text-sm text-muted-foreground">Amount Seeking</p>
                        <p className="font-medium">{request.amount_seeking}</p>
                      </div>
                    )}
                    {request.timeline && (
                      <div>
                        <p className="text-sm text-muted-foreground">Timeline</p>
                        <p className="font-medium">{request.timeline}</p>
                      </div>
                    )}
                  </div>
                  {request.use_of_funds && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Use of Funds</p>
                      <p className="whitespace-pre-wrap">{request.use_of_funds}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Services Requested */}
          <Card>
            <CardHeader>
              <CardTitle>Services Requested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {request.services_requested?.map((service) => (
                  <Badge key={service} variant="default">{service}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Target Investors */}
          {request.target_investor_types && request.target_investor_types.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Target Investor Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {request.target_investor_types.map((type) => (
                    <Badge key={type} variant="secondary">{type}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Specific Questions */}
          {request.specific_questions && (
            <Card>
              <CardHeader>
                <CardTitle>Specific Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{request.specific_questions}</p>
              </CardContent>
            </Card>
          )}

          {/* Find Providers CTA */}
          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="p-4">
              <h3 className="font-medium mb-2">Ready to connect with providers?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Browse our marketplace to find pitch deck designers, coaches, and more.
              </p>
              <Button variant="default" asChild className="w-full">
                <Link href="/marketplace?cat=Services&sub=Pitch%20Prep">
                  Browse Providers
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
