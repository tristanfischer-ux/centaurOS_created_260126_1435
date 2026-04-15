'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react'

type ContactStatus = 'verified' | 'inferred' | 'none'

interface ContactStatusPillProps {
  status: ContactStatus
  size?: 'sm' | 'md'
}

const CONFIG: Record<ContactStatus, {
  label: string
  variant: 'success' | 'warning' | 'secondary'
  Icon: typeof CheckCircle2
  tip: string
}> = {
  verified: {
    label: 'Verified contact',
    variant: 'success',
    Icon: CheckCircle2,
    tip: 'At least one partner has a verified email address.',
  },
  inferred: {
    label: 'Contact inferred',
    variant: 'warning',
    Icon: HelpCircle,
    tip: 'Contact email pattern-inferred — may bounce.',
  },
  none: {
    label: 'No direct contact',
    variant: 'secondary',
    Icon: XCircle,
    tip: 'No partner emails on file. LinkedIn or warm intro recommended.',
  },
}

export function ContactStatusPill({ status, size = 'sm' }: ContactStatusPillProps) {
  const { label, variant, Icon, tip } = CONFIG[status]
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} size={size} className="gap-1 cursor-help">
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
