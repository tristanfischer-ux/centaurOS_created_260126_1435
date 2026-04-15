/**
 * @file Quote Requests tracking page
 *
 * @description Shows the user's sent quote requests with status tracking.
 * Linked from the success toast after sending a quote request.
 */

import { getMyQuoteRequests } from '@/actions/marketplace-rfq'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'
import { EmptyState } from '@/components/ui/empty-state'
import { typography } from '@/lib/design-system'
import { Send } from 'lucide-react'
import Link from 'next/link'

const STATUS_BADGE: Record<string, { variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary'; label: string }> = {
    sent: { variant: 'default', label: 'Sent' },
    draft: { variant: 'secondary', label: 'Draft' },
    replied: { variant: 'success', label: 'Replied' },
    expired: { variant: 'warning', label: 'Expired' },
    cancelled: { variant: 'destructive', label: 'Cancelled' },
}

export default async function QuoteRequestsPage() {
    const requests = await getMyQuoteRequests()

    return (
        <div className="space-y-6">
            <div className="pb-4 border-b border-muted">
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Quote Requests</h1>
                </div>
                <p className={typography.pageSubtitle}>
                    Track quote requests you&apos;ve sent to suppliers
                </p>
            </div>

            {requests.length === 0 ? (
                <EmptyState
                    icon={<Send className="h-10 w-10 text-muted-foreground" />}
                    title="No quote requests yet"
                    description="Browse the marketplace and request quotes from suppliers. Your requests will appear here."
                    action={<Link href="/marketplace" className="text-sm font-medium text-primary hover:underline">Browse Marketplace</Link>}
                />
            ) : (
                <Card>
                    <CardHeader className="pb-2">
                        <p className="text-sm text-muted-foreground">{requests.length} quote request{requests.length !== 1 ? 's' : ''}</p>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border">
                            {requests.map((req) => {
                                const statusInfo = STATUS_BADGE[req.status] ?? STATUS_BADGE.sent
                                return (
                                    <div key={req.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/marketplace/${req.listing_id}`}
                                                    className="text-sm font-medium text-foreground hover:text-international-orange transition-colors truncate"
                                                >
                                                    {req.supplier_name}
                                                </Link>
                                                <Badge variant={statusInfo.variant} className="text-[10px] shrink-0">
                                                    {statusInfo.label}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                {req.subject}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                            </p>
                                            {req.quantity && (
                                                <p className="text-xs text-muted-foreground">
                                                    Qty: {req.quantity}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
