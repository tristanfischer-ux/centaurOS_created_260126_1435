'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Award,
  Loader2,
  BarChart3,
  User,
} from 'lucide-react'
import type { RFQResponseWithProvider, SupplierTier } from '@/types/rfq'
import { format } from 'date-fns'

interface RFQResponseCompareDialogProps {
  responses: RFQResponseWithProvider[]
  onAward: (providerId: string) => void
  isPending?: boolean
  awardedTo?: string | null
  children: React.ReactNode
}

const tierLabels: Record<SupplierTier, string> = {
  verified_partner: 'Verified Partner',
  approved: 'Approved',
  pending: 'Pending',
  suspended: 'Suspended',
}

function findBestPrice(responses: RFQResponseWithProvider[]): string | null {
  let bestId: string | null = null
  let bestPrice = Infinity

  for (const r of responses) {
    if (r.quoted_price && r.quoted_price < bestPrice) {
      bestPrice = r.quoted_price
      bestId = r.provider_id
    }
  }

  return bestId
}

export function RFQResponseCompareDialog({
  responses,
  onAward,
  isPending = false,
  awardedTo,
  children,
}: RFQResponseCompareDialogProps) {
  const [open, setOpen] = useState(false)
  const bestPriceId = findBestPrice(responses)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Compare Responses ({responses.length})
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium text-muted-foreground">Attribute</th>
                {responses.map((r) => (
                  <th key={r.id} className="text-left py-3 px-2 font-medium min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {r.provider_profile?.avatar_url ? (
                          <img
                            src={r.provider_profile.avatar_url}
                            alt=""
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <span className="truncate">
                        {r.provider_profile?.full_name || 'Unknown'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Tier */}
              <tr className="border-b">
                <td className="py-3 px-2 text-muted-foreground">Tier</td>
                {responses.map((r) => (
                  <td key={r.id} className="py-3 px-2">
                    <Badge variant="outline" className="text-xs">
                      {tierLabels[r.provider?.tier || 'pending']}
                    </Badge>
                  </td>
                ))}
              </tr>

              {/* Price */}
              <tr className="border-b">
                <td className="py-3 px-2 text-muted-foreground">Quoted Price</td>
                {responses.map((r) => (
                  <td key={r.id} className="py-3 px-2">
                    {r.quoted_price ? (
                      <span
                        className={cn(
                          'font-semibold',
                          r.provider_id === bestPriceId && 'text-status-success'
                        )}
                      >
                        £{r.quoted_price.toLocaleString()}
                        {r.provider_id === bestPriceId && (
                          <Badge variant="outline" className="ml-2 text-[10px] text-status-success border-status-success">
                            Best
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not quoted</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Message / Headline */}
              <tr className="border-b">
                <td className="py-3 px-2 text-muted-foreground">Headline</td>
                {responses.map((r) => (
                  <td key={r.id} className="py-3 px-2 text-xs">
                    {r.provider?.headline || '—'}
                  </td>
                ))}
              </tr>

              {/* Message */}
              <tr className="border-b">
                <td className="py-3 px-2 text-muted-foreground">Message</td>
                {responses.map((r) => (
                  <td key={r.id} className="py-3 px-2">
                    <p className="text-xs line-clamp-4 whitespace-pre-wrap">
                      {r.message || '—'}
                    </p>
                  </td>
                ))}
              </tr>

              {/* Timestamp */}
              <tr className="border-b">
                <td className="py-3 px-2 text-muted-foreground">Responded</td>
                {responses.map((r) => (
                  <td key={r.id} className="py-3 px-2 text-xs text-muted-foreground">
                    {format(new Date(r.responded_at), 'MMM d, HH:mm')}
                  </td>
                ))}
              </tr>

              {/* Action */}
              <tr>
                <td className="py-3 px-2 text-muted-foreground">Action</td>
                {responses.map((r) => (
                  <td key={r.id} className="py-3 px-2">
                    {awardedTo === r.provider_id ? (
                      <StatusBadge status="success" size="sm">
                        <Award className="w-3 h-3 mr-1" />
                        Awarded
                      </StatusBadge>
                    ) : !awardedTo ? (
                      <Button
                        size="sm"
                        onClick={() => onAward(r.provider_id)}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Award className="w-3 h-3 mr-1" />
                            Award
                          </>
                        )}
                      </Button>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
