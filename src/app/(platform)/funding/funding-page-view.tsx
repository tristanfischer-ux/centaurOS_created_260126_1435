'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
    Banknote, TrendingUp, CheckCircle2, Clock, XCircle,
    ArrowRight, Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { typography } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import { updateFundingRequirementStatus } from '@/actions/business-plan'
import { toast } from 'sonner'
import { RefreshButton } from '@/components/RefreshButton'
import type { SavedFundingRequirement } from '@/lib/business-plan-types'

const STATUS_CONFIG = {
    projected: { label: 'Projected', icon: Clock, color: 'bg-slate-100 text-slate-700' },
    seeking: { label: 'Seeking', icon: TrendingUp, color: 'bg-amber-100 text-amber-700' },
    secured: { label: 'Secured', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', icon: XCircle, color: 'bg-red-100 text-red-700' },
} as const

type FundingStatus = keyof typeof STATUS_CONFIG

function formatCurrency(amount: number | null): string {
    if (amount === null || amount === undefined) return '—'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

interface FundingPageViewProps {
    fundingRequirements: SavedFundingRequirement[]
}

export function FundingPageView({ fundingRequirements }: FundingPageViewProps) {
    const [items, setItems] = useState(fundingRequirements)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const activeItems = items.filter(i => i.status !== 'cancelled')
    const totalRequired = activeItems.reduce((sum, i) => sum + (i.amount_usd || 0), 0)
    const totalSecured = activeItems.filter(i => i.status === 'secured').reduce((sum, i) => sum + (i.amount_usd || 0), 0)
    const stillNeeded = totalRequired - totalSecured

    async function handleStatusChange(id: string, newStatus: FundingStatus) {
        setUpdatingId(id)
        startTransition(async () => {
            const { error } = await updateFundingRequirementStatus(id, newStatus)
            if (error) {
                toast.error('Failed to update status', { description: error })
            } else {
                setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))
                toast.success(`Status updated to ${STATUS_CONFIG[newStatus].label}`)
            }
            setUpdatingId(null)
        })
    }

    if (items.length === 0) {
        return (
            <div className="p-6 sm:p-8 max-w-4xl mx-auto">
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Funding</h1>
                </div>
                <p className={typography.pageSubtitle}>
                    Track funding requirements extracted from your business plan.
                </p>

                <EmptyState
                    icon={<Banknote className="h-12 w-12" />}
                    title="No funding requirements yet"
                    description="Upload a business plan on the Strategy page to automatically extract funding milestones."
                    action={
                        <Button asChild>
                            <Link href="/strategy">
                                Go to Strategy
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    }
                    className="mt-12"
                />
            </div>
        )
    }

    return (
        <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-8">
            {/* Page Header */}
            <div>
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Funding</h1>
                    <RefreshButton className="ml-auto" />
                </div>
                <p className={typography.pageSubtitle}>
                    Track funding requirements extracted from your business plan.
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard
                    label="Total Required"
                    value={formatCurrency(totalRequired)}
                    icon={<Banknote className="h-5 w-5 text-muted-foreground" />}
                />
                <SummaryCard
                    label="Secured"
                    value={formatCurrency(totalSecured)}
                    icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
                    accent="green"
                />
                <SummaryCard
                    label="Still Needed"
                    value={formatCurrency(stillNeeded)}
                    icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
                    accent={stillNeeded > 0 ? 'amber' : 'green'}
                />
            </div>

            {/* Funding Events List */}
            <div className="space-y-3">
                <h2 className={typography.h3}>Funding Events</h2>
                <div className="space-y-2">
                    {items.map(item => {
                        const statusConf = STATUS_CONFIG[item.status as FundingStatus] || STATUS_CONFIG.projected
                        const StatusIcon = statusConf.icon
                        const isUpdating = updatingId === item.id

                        return (
                            <div
                                key={item.id}
                                className={cn(
                                    'flex items-center gap-4 rounded-lg border p-4 transition-colors',
                                    item.status === 'cancelled' && 'opacity-50',
                                )}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-sm text-foreground truncate">
                                            {item.title}
                                        </span>
                                        {item.funding_type && (
                                            <Badge variant="outline" className="text-[10px] shrink-0">
                                                {item.funding_type}
                                            </Badge>
                                        )}
                                    </div>
                                    {item.reason && (
                                        <p className="text-xs text-muted-foreground line-clamp-1">
                                            {item.reason}
                                        </p>
                                    )}
                                    {item.needed_by_date && (
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Needed by {new Date(item.needed_by_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>

                                <div className="text-right shrink-0">
                                    <span className="text-sm font-semibold tabular-nums">
                                        {formatCurrency(item.amount_usd)}
                                    </span>
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className={cn(
                                                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors shrink-0',
                                                statusConf.color,
                                            )}
                                            disabled={isUpdating}
                                        >
                                            {isUpdating ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <StatusIcon className="h-3 w-3" />
                                            )}
                                            {statusConf.label}
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {(Object.entries(STATUS_CONFIG) as [FundingStatus, typeof STATUS_CONFIG[FundingStatus]][]).map(
                                            ([status, conf]) => {
                                                const Icon = conf.icon
                                                return (
                                                    <DropdownMenuItem
                                                        key={status}
                                                        onClick={() => handleStatusChange(item.id, status)}
                                                        disabled={item.status === status}
                                                    >
                                                        <Icon className="h-3.5 w-3.5 mr-2" />
                                                        {conf.label}
                                                    </DropdownMenuItem>
                                                )
                                            }
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function SummaryCard({
    label,
    value,
    icon,
    accent,
}: {
    label: string
    value: string
    icon: React.ReactNode
    accent?: 'green' | 'amber'
}) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
                <span className={typography.label}>{label}</span>
                {icon}
            </div>
            <span
                className={cn(
                    'text-2xl font-semibold tabular-nums',
                    accent === 'green' && 'text-green-600',
                    accent === 'amber' && 'text-amber-600',
                )}
            >
                {value}
            </span>
        </div>
    )
}
