/**
 * QuickActions — Common action shortcuts for the personal dashboard.
 *
 * @description Renders 3 quick-action cards linking to the most common
 * next actions a user would take from their command centre.
 *
 * @component
 */

'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { CheckSquare, Bell, Waypoints, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Quick action definition. */
interface QuickAction {
  label: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  accentBg: string
  accentText: string
}

const ACTIONS: QuickAction[] = [
  {
    label: 'Create a Task',
    description: 'Add a new task to your backlog',
    href: '/new-tasks',
    icon: CheckSquare,
    accentBg: 'bg-international-orange/10',
    accentText: 'text-international-orange',
  },
  {
    label: 'Check Updates',
    description: 'See what changed while you were away',
    href: '/updates',
    icon: Bell,
    accentBg: 'bg-electric-blue/10',
    accentText: 'text-electric-blue',
  },
  {
    label: 'View Strategy',
    description: 'Review your strategic roadmap',
    href: '/canvas',
    icon: Waypoints,
    accentBg: 'bg-status-success-light',
    accentText: 'text-status-success',
  },
]

export function QuickActions(): React.ReactElement {
  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
        Quick actions
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Link key={action.href} href={action.href}>
              <Card className="group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0',
                      action.accentBg,
                    )}>
                      <Icon className={cn('h-5 w-5', action.accentText)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors">
                        {action.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {action.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-international-orange transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
