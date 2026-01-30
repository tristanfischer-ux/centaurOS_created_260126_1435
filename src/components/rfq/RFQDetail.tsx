'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  MessageSquare,
  Award,
  X,
  CheckCircle2,
  HelpCircle,
  Ban,
  Loader2,
  User,
  Zap,
  ShoppingCart,
  ArrowRight,
  Send,
  Users,
  FileCheck,
} from 'lucide-react'
import Link from 'next/link'
import {
  cancelMyRFQ,
  closeMyRFQ,
  awardRFQToSupplier,
  releaseRFQPriorityHold,
} from '@/actions/rfq'
import { RFQWithDetails, RFQStatus, RFQType, RFQResponseWithProvider } from '@/types/rfq'
import { RaceStatusIndicator } from './RaceStatusIndicator'
import { format } from 'date-fns'

interface RFQDetailProps {
  rfq: RFQWithDetails
  isOwner: boolean
  hasResponded?: boolean
  className?: string
}

const statusColors: Record<RFQStatus, string> = {
  'Open': 'bg-blue-50 text-blue-700 border',
  'Bidding': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'priority_hold': 'bg-amber-50 text-amber-700 border-amber-200',
  'Awarded': 'bg-violet-50 text-violet-700 border-violet-200',
  'Closed': 'bg-gray-50 text-gray-700 border-gray-200',
  'cancelled': 'bg-red-50 text-red-700 border-red-200',
}

const typeLabels: Record<RFQType, string> = {
  'commodity': 'Commodity (First Click Wins)',
  'custom': 'Custom (Priority Hold)',
  'service': 'Service (Review All)',
}

export function RFQDetail({
  rfq,
  isOwner,
  hasResponded = false,
  className,
}: RFQDetailProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelMyRFQ(rfq.id)
      if (result.error) {
        setError(result.error)
      }
    })
  }

  const handleClose = () => {
    startTransition(async () => {
      const result = await closeMyRFQ(rfq.id)
      if (result.error) {
        setError(result.error)
      }
    })
  }

  const handleReleasePriorityHold = () => {
    startTransition(async () => {
      const result = await releaseRFQPriorityHold(rfq.id)
      if (result.error) {
        setError(result.error)
      }
    })
  }

  const handleAward = (providerId: string) => {
    startTransition(async () => {
      const result = await awardRFQToSupplier(rfq.id, providerId)
      if (result.error) {
        setError(result.error)
      }
    })
  }

  const formatBudget = () => {
    if (rfq.budget_min && rfq.budget_max) {
      return `£${rfq.budget_min.toLocaleString()} - £${rfq.budget_max.toLocaleString()}`
    }
    if (rfq.budget_min) {
      return `From £${rfq.budget_min.toLocaleString()}`
    }
    if (rfq.budget_max) {
      return `Up to £${rfq.budget_max.toLocaleString()}`
    }
    return 'Not specified'
  }

  // Group responses by type
  const acceptResponses = rfq.responses.filter((r) => r.response_type === 'accept')
  const infoRequests = rfq.responses.filter((r) => r.response_type === 'info_request')
  const declines = rfq.responses.filter((r) => r.response_type === 'decline')

  return (
    <div className={cn('space-y-6', className)}>
      {/* Order Created Alert - shown when RFQ is awarded */}
      {isOwner && rfq.status === 'Awarded' && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <ShoppingCart className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-emerald-900 mb-1">Order Automatically Created</h3>
                <p className="text-sm text-emerald-700 mb-3">
                  An order has been automatically created with the winning quote. You can now proceed with payment and project setup.
                </p>
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Link href="/orders">
                    View Orders
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl">{rfq.title}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={cn('text-sm', statusColors[rfq.status])}>
                  {rfq.status === 'priority_hold' ? 'Priority Hold' : rfq.status}
                </Badge>
                <Badge variant="secondary" className="text-sm">
                  {typeLabels[rfq.rfq_type]}
                </Badge>
                {rfq.urgency === 'urgent' && (
                  <Badge variant="secondary" className="text-sm bg-amber-50 text-amber-700 border-amber-200">
                    <Zap className="w-3 h-3 mr-1" />
                    Urgent
                  </Badge>
                )}
              </div>
            </div>

            {/* Owner actions */}
            {isOwner && (rfq.status === 'Open' || rfq.status === 'Bidding' || rfq.status === 'priority_hold') && (
              <div className="flex items-center gap-2">
                {rfq.status === 'priority_hold' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="secondary" size="sm" disabled={isPending}>
                        Release Hold
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Release Priority Hold?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will allow other suppliers to compete for this RFQ.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReleasePriorityHold}>
                          Release
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={isPending}>
                      Close RFQ
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Close this RFQ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        No more responses will be accepted. You can still award to an existing response.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClose}>Close</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isPending}>
                      Cancel RFQ
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this RFQ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. Suppliers will be notified.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep RFQ</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground">
                        Cancel RFQ
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 p-3 mt-4 rounded-lg bg-destructive/10 text-destructive">
              <X className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Progress Indicator */}
          <RFQProgressIndicator status={rfq.status} />

          {/* Race Status */}
          <RaceStatusIndicator
            status={rfq.status}
            raceOpensAt={rfq.race_opens_at}
            priorityHoldExpiresAt={rfq.priority_hold_expires_at}
            responseCount={rfq.response_count}
          />

          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Budget</div>
              <div className="font-semibold">{formatBudget()}</div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Deadline</div>
              <div className="font-semibold">
                {rfq.deadline
                  ? format(new Date(rfq.deadline), 'MMM d, yyyy')
                  : 'Not specified'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Category</div>
              <div className="font-semibold">{rfq.category || 'Not specified'}</div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Responses</div>
              <div className="font-semibold">{rfq.response_count}</div>
            </div>
          </div>

          {/* Specifications */}
          {rfq.specifications?.description && (
            <div>
              <h3 className="font-semibold mb-2">Specifications</h3>
              <div className="p-4 rounded-lg bg-muted/50 whitespace-pre-wrap">
                {rfq.specifications.description}
              </div>
            </div>
          )}

          {/* Buyer info */}
          {rfq.buyer && (
            <div className="flex items-center gap-3 pt-4 border-t">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                {rfq.buyer.avatar_url ? (
                  <img
                    src={rfq.buyer.avatar_url}
                    alt={rfq.buyer.full_name || 'User'}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="font-medium">{rfq.buyer.full_name || 'Unknown'}</div>
                <div className="text-sm text-muted-foreground">Buyer</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Responses Section (Buyer View) */}
      {isOwner && rfq.responses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Responses ({rfq.responses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Accept responses */}
            {acceptResponses.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Accepted ({acceptResponses.length})
                </h4>
                <div className="space-y-3">
                  {acceptResponses.map((response) => (
                    <ResponseCard
                      key={response.id}
                      response={response}
                      isAwarded={rfq.awarded_to === response.provider_id}
                      canAward={
                        isOwner &&
                        (rfq.status === 'Bidding' || rfq.status === 'priority_hold' || rfq.status === 'Closed')
                      }
                      onAward={() => handleAward(response.provider_id)}
                      isPending={isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Info requests */}
            {infoRequests.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  Info Requests ({infoRequests.length})
                </h4>
                <div className="space-y-3">
                  {infoRequests.map((response) => (
                    <ResponseCard
                      key={response.id}
                      response={response}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Declines */}
            {declines.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-3 text-muted-foreground">
                  <Ban className="w-4 h-4" />
                  Declined ({declines.length})
                </h4>
                <div className="space-y-3">
                  {declines.map((response) => (
                    <ResponseCard
                      key={response.id}
                      response={response}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Supplier View: Already Responded */}
      {!isOwner && hasResponded && (
        <Card>
          <CardContent className="py-6">
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-2" />
              <p className="font-medium">You have already responded to this RFQ</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Progress indicator showing RFQ lifecycle stages
function RFQProgressIndicator({ status }: { status: RFQStatus }) {
  const stages = [
    { key: 'created', label: 'Created', icon: FileCheck },
    { key: 'broadcast', label: 'Broadcast', icon: Send },
    { key: 'bidding', label: 'Bidding', icon: Users },
    { key: 'awarded', label: 'Awarded', icon: Award },
    { key: 'order', label: 'Order', icon: ShoppingCart },
  ]

  // Determine which stages are complete based on status
  const getStageStatus = (stageKey: string): 'complete' | 'current' | 'pending' => {
    if (status === 'cancelled') {
      return stageKey === 'created' ? 'complete' : 'pending'
    }

    const stageOrder = ['created', 'broadcast', 'bidding', 'awarded', 'order']
    const currentStageIndex = status === 'Open' ? 0 :
                              status === 'Bidding' || status === 'priority_hold' ? 2 :
                              status === 'Awarded' ? 3 :
                              status === 'Closed' ? 2 : 0

    const stageIndex = stageOrder.indexOf(stageKey)
    
    if (stageIndex < currentStageIndex) return 'complete'
    if (stageIndex === currentStageIndex) return 'current'
    return 'pending'
  }

  return (
    <div className="py-4">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const stageStatus = getStageStatus(stage.key)
          const Icon = stage.icon
          const isLast = index === stages.length - 1

          return (
            <div key={stage.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                    stageStatus === 'complete' && 'border-emerald-500 bg-emerald-50 text-emerald-600',
                    stageStatus === 'current' && 'border-blue-500 bg-blue-50 text-blue-600',
                    stageStatus === 'pending' && 'border-gray-200 bg-gray-50 text-gray-400'
                  )}
                >
                  {stageStatus === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium',
                    stageStatus === 'complete' && 'text-emerald-600',
                    stageStatus === 'current' && 'text-blue-600',
                    stageStatus === 'pending' && 'text-gray-400'
                  )}
                >
                  {stage.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 mb-6',
                    stageStatus === 'complete' ? 'bg-emerald-500' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Response card sub-component
interface ResponseCardProps {
  response: RFQResponseWithProvider
  isAwarded?: boolean
  canAward?: boolean
  onAward?: () => void
  isPending?: boolean
}

function ResponseCard({
  response,
  isAwarded = false,
  canAward = false,
  onAward,
  isPending = false,
}: ResponseCardProps) {
  const providerName = response.provider_profile?.full_name || 'Unknown Supplier'
  const tierLabel = response.provider?.tier === 'verified_partner' ? 'Verified Partner' : 
                    response.provider?.tier === 'approved' ? 'Approved' : ''

  return (
    <div
      className={cn(
        'p-4 rounded-lg border',
        isAwarded && 'bg-violet-50 border-violet-200'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            {response.provider_profile?.avatar_url ? (
              <img
                src={response.provider_profile.avatar_url}
                alt={providerName}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <User className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="font-medium flex items-center gap-2">
              {providerName}
              {isAwarded && (
                <Badge className="bg-violet-100 text-violet-700">
                  <Award className="w-3 h-3 mr-1" />
                  Awarded
                </Badge>
              )}
            </div>
            {tierLabel && (
              <Badge variant="secondary" className="text-xs mt-1">
                {tierLabel}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {response.quoted_price && (
            <span className="font-semibold text-lg">
              £{response.quoted_price.toLocaleString()}
            </span>
          )}
          {canAward && onAward && !isAwarded && (
            <Button size="sm" onClick={onAward} disabled={isPending}>
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Award className="w-4 h-4 mr-1" />
                  Award
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {response.message && (
        <div className="mt-3 p-3 rounded bg-muted/50 text-sm">
          {response.message}
        </div>
      )}

      <div className="mt-2 text-xs text-muted-foreground">
        {format(new Date(response.responded_at), 'MMM d, yyyy HH:mm')}
      </div>
    </div>
  )
}
