'use client'

import Link from 'next/link'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, 
  FileText, 
  Building2, 
  Calendar,
  Info,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import { PitchPrepRequest, PitchPrepStatus } from '@/types/pitch-prep'
import { formatDistanceToNow } from 'date-fns'

interface PitchPrepListViewProps {
  requests: PitchPrepRequest[]
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

export function PitchPrepListView({ requests }: PitchPrepListViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Pitch Preparation</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Get investor-ready with professional pitch preparation services
          </p>
        </div>
        <Button asChild>
          <Link href="/pitch-prep/create">
            <Plus className="h-4 w-4 mr-2" />
            New Request
          </Link>
        </Button>
      </div>

      {/* Legal Disclaimer */}
      <Alert className="bg-status-info-light border-status-info">
        <Info className="h-4 w-4 text-status-info" />
        <AlertDescription className="text-status-info-dark">
          <strong>Preparation Service Only:</strong> CentaurOS helps you prepare for investor conversations. 
          We do not provide investment advice or facilitate securities transactions.
        </AlertDescription>
      </Alert>

      {/* Requests List */}
      {requests.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12 text-muted-foreground" />}
          title="No pitch prep requests yet"
          description="Start preparing for your investor conversations by creating a pitch prep request."
          action={
            <Button asChild>
              <Link href="/pitch-prep/create">
                <Plus className="h-4 w-4 mr-2" />
                Create Request
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => {
            const statusConfig = STATUS_COLORS[request.status]
            return (
              <Link key={request.id} href={`/pitch-prep/${request.id}`}>
                <Card className="hover:border-accent hover:shadow-md transition-all cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                          <h3 className="font-semibold text-lg truncate">
                            {request.company_name}
                          </h3>
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {request.product_description}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {request.stage}
                          </span>
                          {request.amount_seeking && (
                            <span>Seeking: {request.amount_seeking}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        {request.services_requested && request.services_requested.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {request.services_requested.slice(0, 3).map((service) => (
                              <Badge key={service} variant="secondary" className="text-xs">
                                {service}
                              </Badge>
                            ))}
                            {request.services_requested.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{request.services_requested.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* Browse Providers Link */}
      <Card className="bg-muted/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Looking for pitch prep providers?</h3>
              <p className="text-sm text-muted-foreground">
                Browse our marketplace to find pitch deck designers, coaches, and more.
              </p>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/marketplace?cat=Services&sub=Pitch%20Prep">
                Browse Providers
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
