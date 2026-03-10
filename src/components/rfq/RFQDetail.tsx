'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  Download,
  FileBox,
  Copy,
  BarChart3,
  FileDown,
  ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import {
  cancelMyRFQ,
  closeMyRFQ,
  awardRFQToSupplier,
  releaseRFQPriorityHold,
  duplicateRFQ,
} from '@/actions/rfq'
import { RFQWithDetails, RFQStatus, RFQType, RFQResponseWithProvider } from '@/types/rfq'
import { RaceStatusIndicator } from './RaceStatusIndicator'
import { RFQBroadcastDashboard } from './RFQBroadcastDashboard'
import { RFQResponseCompareDialog } from './RFQResponseCompareDialog'
import { RFQInfoRequestThread } from './RFQInfoRequestThread'
import { RFQSpecCard } from './RFQSpecCard'
import { MatchReasoningCard } from './MatchReasoningCard'
import { BuyerContextCard } from './BuyerContextCard'
import { RFQClarificationsPanel } from './RFQClarificationsPanel'
import { RaceCountdown } from './RaceStatusIndicator'
import { exportAsPDF } from '@/lib/export-utils'
import { downloadTechPack } from '@/lib/rfq/download-pack'
import { format } from 'date-fns'

interface RFQDetailProps {
  rfq: RFQWithDetails
  isOwner: boolean
  hasResponded?: boolean
  className?: string
}

const statusMap: Record<RFQStatus, { label: string; status: 'info' | 'success' | 'warning' | 'error' | 'pending' | 'active' }> = {
  'Open': { label: 'Open', status: 'info' },
  'Bidding': { label: 'Bidding', status: 'success' },
  'priority_hold': { label: 'Priority Hold', status: 'warning' },
  'Awarded': { label: 'Awarded', status: 'success' },
  'Closed': { label: 'Closed', status: 'pending' },
  'cancelled': { label: 'Cancelled', status: 'error' },
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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())

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

  const handleDuplicate = () => {
    startTransition(async () => {
      const result = await duplicateRFQ(rfq.id)
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        router.push(`/rfq/${result.data.id}/edit`)
      }
    })
  }

  const handleDownloadPDF = async () => {
    try {
      const specs = rfq.specifications || {}
      const sections: string[] = []

      sections.push(`# ${rfq.title}`)
      sections.push('')
      sections.push(`**Type:** ${typeLabels[rfq.rfq_type]}`)
      sections.push(`**Status:** ${statusMap[rfq.status].label}`)
      sections.push(`**Category:** ${rfq.category || 'Not specified'}`)
      sections.push(`**Created:** ${format(new Date(rfq.created_at), 'MMM d, yyyy')}`)

      if (rfq.deadline) {
        sections.push(`**Deadline:** ${format(new Date(rfq.deadline), 'MMM d, yyyy')}`)
      }

      if (rfq.budget_min != null || rfq.budget_max != null) {
        sections.push(`**Budget:** ${formatBudget()}`)
      }

      sections.push('')
      sections.push('## Specifications')
      sections.push('')

      if (specs.description) {
        sections.push(specs.description as string)
      }

      // Include module data from custom_fields
      const customFields = specs.custom_fields as Record<string, unknown> | undefined
      if (customFields?.modules && Array.isArray(customFields.modules)) {
        sections.push('')
        sections.push('### Modules')
        for (const mod of customFields.modules as Array<Record<string, unknown>>) {
          sections.push(`- **${mod.name || 'Module'}**: ${mod.process || ''} / ${mod.material || ''} / ${mod.finish || ''}`)
        }
      }

      if (Array.isArray(specs.attachments) && specs.attachments.length > 0) {
        sections.push('')
        sections.push('### Attachments')
        for (const url of specs.attachments) {
          if (typeof url === 'string') {
            sections.push(`- ${url}`)
          }
        }
      }

      await exportAsPDF(sections.join('\n'), `RFQ-${rfq.title.replace(/[^a-z0-9]/gi, '-')}.pdf`)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      setError('Failed to generate PDF')
    }
  }

  const toggleThread = (responseId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(responseId)) {
        next.delete(responseId)
      } else {
        next.add(responseId)
      }
      return next
    })
  }

  const formatBudget = () => {
    if (rfq.budget_min != null && rfq.budget_max != null) {
      return `£${rfq.budget_min.toLocaleString()} - £${rfq.budget_max.toLocaleString()}`
    }
    if (rfq.budget_min != null) {
      return `From £${rfq.budget_min.toLocaleString()}`
    }
    if (rfq.budget_max != null) {
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
        <Card className="border-status-success bg-status-success-light">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-light">
                <ShoppingCart className="h-5 w-5 text-status-success" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-status-success-dark mb-1">Order Automatically Created</h3>
                <p className="text-sm text-status-success-dark mb-3">
                  An order has been automatically created with the winning quote. You can now proceed with payment and project setup.
                </p>
                <Button asChild size="sm" variant="success">
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
                <StatusBadge status={statusMap[rfq.status].status} size="md">
                  {statusMap[rfq.status].label}
                </StatusBadge>
                <Badge variant="secondary" className="text-sm">
                  {typeLabels[rfq.rfq_type]}
                </Badge>
                {rfq.urgency === 'urgent' && (
                  <StatusBadge status="warning" size="md">
                    <Zap className="w-3 h-3 mr-1" />
                    Urgent
                  </StatusBadge>
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

          {/* Specifications — Structured (Feature 11) or plain text */}
          <RFQSpecCard
            customFields={rfq.specifications?.custom_fields as Record<string, unknown> | undefined}
            description={rfq.specifications?.description as string | undefined}
          />

          {/* Supplier: Deadline countdown banner (Feature 18) */}
          {!isOwner && rfq.race_opens_at && (
            <div className="p-3 rounded-lg bg-status-info-light border border-status-info/20">
              <RaceCountdown raceOpensAt={rfq.race_opens_at} />
              {rfq.deadline && (
                <p className="text-xs text-muted-foreground mt-1">
                  Response deadline: {format(new Date(rfq.deadline), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          )}

          {/* Attachments — STEP/STL and other files for suppliers to download */}
          {Array.isArray(rfq.specifications?.attachments) &&
            rfq.specifications.attachments.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Attachments</h3>
                <ul className="space-y-2">
                  {rfq.specifications.attachments.map((url, index) => {
                    const href = typeof url === 'string' ? url : ''
                    if (!href) return null
                    const lower = href.toLowerCase()
                    const isStep = lower.endsWith('.step') || lower.includes('.step?')
                    const isStl = lower.endsWith('.stl') || lower.includes('.stl?')
                    const label = isStep ? 'STEP' : isStl ? 'STL' : `File ${index + 1}`
                    return (
                      <li key={index}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-international-orange hover:underline"
                        >
                          <FileBox className="h-4 w-4 shrink-0" />
                          <span>{label}</span>
                          <Download className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      </li>
                    )
                  })}
                </ul>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => downloadTechPack(rfq)}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download Tech Pack
                </Button>
              </div>
            )}

          {/* Clarifications panel (Feature 16) */}
          <RFQClarificationsPanel
            rfqId={rfq.id}
            isOwner={isOwner}
            infoRequests={
              isOwner
                ? rfq.responses
                    .filter((r) => r.response_type === 'info_request')
                    .map((r) => ({
                      id: r.id,
                      message: r.message,
                      provider_profile: r.provider_profile,
                    }))
                : []
            }
          />

          {/* Owner action buttons: PDF, Duplicate */}
          {isOwner && (
            <div className="flex items-center gap-2 pt-4 border-t">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadPDF}
              >
                <FileDown className="w-4 h-4 mr-1" />
                Download PDF
              </Button>

              {(rfq.status === 'Awarded' || rfq.status === 'Closed' || rfq.status === 'cancelled') && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDuplicate}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Copy className="w-4 h-4 mr-1" />
                  )}
                  Duplicate
                </Button>
              )}
            </div>
          )}

          {/* Buyer info — enhanced with context for suppliers (Feature 19) */}
          {rfq.buyer && (
            !isOwner ? (
              <BuyerContextCard
                buyerId={rfq.buyer_id}
                buyerName={rfq.buyer.full_name}
                buyerAvatarUrl={rfq.buyer.avatar_url}
              />
            ) : (
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
            )
          )}
        </CardContent>
      </Card>

      {/* Broadcast Dashboard (Feature 6) — owner only */}
      {isOwner && rfq.broadcasts && rfq.broadcasts.length > 0 && (
        <RFQBroadcastDashboard broadcasts={rfq.broadcasts} />
      )}

      {/* Responses Section (Buyer View) */}
      {isOwner && rfq.responses.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Responses ({rfq.responses.length})
              </CardTitle>

              {/* Compare button (Feature 8) */}
              {acceptResponses.length >= 2 && (
                <RFQResponseCompareDialog
                  responses={acceptResponses}
                  onAward={(providerId) => handleAward(providerId)}
                  isPending={isPending}
                  awardedTo={rfq.awarded_to}
                >
                  <Button variant="secondary" size="sm">
                    <BarChart3 className="w-4 h-4 mr-1" />
                    Compare
                  </Button>
                </RFQResponseCompareDialog>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Accept responses */}
            {acceptResponses.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-status-success" />
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

            {/* Info requests with inline thread (Feature 9) */}
            {infoRequests.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <HelpCircle className="w-4 h-4 text-status-info" />
                  Info Requests ({infoRequests.length})
                </h4>
                <div className="space-y-3">
                  {infoRequests.map((response) => (
                    <div key={response.id}>
                      <ResponseCard response={response} />
                      {response.provider?.user_id && (
                        <Collapsible
                          open={expandedThreads.has(response.id)}
                          onOpenChange={() => toggleThread(response.id)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1 ml-4 text-xs"
                            >
                              <MessageSquare className="w-3 h-3 mr-1" />
                              {expandedThreads.has(response.id) ? 'Hide Thread' : 'Reply'}
                              <ChevronDown className={cn(
                                'w-3 h-3 ml-1 transition-transform',
                                expandedThreads.has(response.id) && 'rotate-180'
                              )} />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="ml-4">
                            <RFQInfoRequestThread
                              rfqId={rfq.id}
                              sellerId={response.provider.user_id}
                              initialQuestion={response.message || ''}
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
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

      {/* Match Reasoning (Feature 14) — supplier only */}
      {!isOwner && (
        <MatchReasoningCard rfqId={rfq.id} />
      )}

      {/* Supplier View: Already Responded */}
      {!isOwner && hasResponded && (
        <Card>
          <CardContent className="py-6">
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-status-success mb-2" />
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
                    stageStatus === 'complete' && 'border-status-success bg-status-success-light text-status-success',
                    stageStatus === 'current' && 'border-status-info bg-status-info-light text-status-info',
                    stageStatus === 'pending' && 'border-muted bg-muted text-muted-foreground'
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
                    stageStatus === 'complete' && 'text-status-success',
                    stageStatus === 'current' && 'text-status-info',
                    stageStatus === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {stage.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 mb-6',
                    stageStatus === 'complete' ? 'bg-status-success' : 'bg-muted'
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
        isAwarded && 'bg-status-success-light border-status-success'
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
                <StatusBadge status="success" size="sm">
                  <Award className="w-3 h-3 mr-1" />
                  Awarded
                </StatusBadge>
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
