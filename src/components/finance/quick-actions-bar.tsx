/**
 * @file quick-actions-bar.tsx — Quick action buttons for common finance operations
 *
 * @description Four action buttons: Send Invoice, Request Payout, Top Up, Add Expense.
 * Links to relevant pages or opens relevant dialogs.
 */

'use client'

import Link from 'next/link'
import { FileText, Banknote, CreditCard, Receipt } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface QuickAction {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const quickActions: QuickAction[] = [
  {
    label: 'Send Invoice',
    href: '/finance/invoices',
    icon: FileText,
    description: 'Create and send an invoice',
  },
  {
    label: 'Request Payout',
    href: '/marketplace-orders',
    icon: Banknote,
    description: 'Withdraw available funds',
  },
  {
    label: 'Top Up',
    href: '/my-profile?tab=billing',
    icon: CreditCard,
    description: 'Add funds to your wallet',
  },
  {
    label: 'View Costs',
    href: '/finance/money-map',
    icon: Receipt,
    description: 'Review your Money Map',
  },
]

interface QuickActionsBarProps {
  className?: string
}

export function QuickActionsBar({ className }: QuickActionsBarProps) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {quickActions.map((action) => {
        const Icon = action.icon
        return (
          <Link key={action.label} href={action.href}>
            <Card className="group hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer h-full">
              <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center group-hover:bg-international-orange/20 transition-colors">
                  <Icon className="h-5 w-5 text-international-orange" />
                </div>
                <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors">
                  {action.label}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {action.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
