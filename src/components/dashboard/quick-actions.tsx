'use client'

import Link from 'next/link'
import { Plus, Target, Bell, Users, Zap, Store, Lightbulb, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickActionsProps {
  foundryId: string
}

interface ActionItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  color: string
  bgColor: string
}

/**
 * Quick Actions Panel - Two sections:
 * 1. "Do" - Operational quick actions (create tasks, objectives, etc.)
 * 2. "Discover" - Revenue-driving actions (marketplace, inspiration, workflows)
 * 
 * The Discover section uses warm/inviting colours to draw the eye naturally.
 */
export function QuickActions({ foundryId }: QuickActionsProps) {
  const doActions: ActionItem[] = [
    {
      label: 'New Task',
      icon: Plus,
      href: '/new-tasks',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'New Objective',
      icon: Target,
      href: '/new-objectives',
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Updates',
      icon: Bell,
      href: '/updates',
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Team',
      icon: Users,
      href: '/team',
      color: 'from-slate-500 to-slate-600',
      bgColor: 'bg-slate-50',
    },
  ]

  const discoverActions: ActionItem[] = [
    {
      label: 'Marketplace',
      icon: Store,
      href: '/marketplace',
      color: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Playbooks',
      icon: Lightbulb,
      href: '/playbooks',
      color: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Workflows',
      icon: Workflow,
      href: '/agents',
      color: 'from-international-orange to-orange-600',
      bgColor: 'bg-international-orange/10',
    },
  ]
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border bg-gradient-to-r from-orange-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-international-orange/10 rounded-lg">
            <Zap className="w-5 h-5 text-international-orange" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Quick Actions</h2>
            <p className="text-sm text-muted-foreground">Jump to what matters</p>
          </div>
        </div>
      </div>
      
      {/* Do Section */}
      <div className="p-4 pb-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Do</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {doActions.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
        </div>
      </div>

      {/* Discover Section */}
      <div className="p-4 pt-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Discover</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {discoverActions.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionButton({ action }: { action: ActionItem }) {
  return (
    <Link
      href={action.href}
      className={cn(
        "group relative overflow-hidden rounded-xl p-3 transition-all duration-300",
        "border border-border hover:border-transparent hover:shadow-lg",
        "flex flex-col items-center justify-center gap-1.5 text-center"
      )}
    >
      {/* Gradient Background (on hover) */}
      <div className={cn(
        "absolute inset-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br",
        action.color
      )} />
      
      {/* Content */}
      <div className="relative">
        <div className={cn(
          "inline-flex p-2.5 rounded-xl transition-all duration-300",
          action.bgColor,
          "group-hover:bg-white/20"
        )}>
          <action.icon className={cn(
            "w-5 h-5 transition-colors duration-300",
            "text-slate-600 group-hover:text-white"
          )} />
        </div>
      </div>
      
      <span className={cn(
        "relative text-xs font-medium transition-colors duration-300",
        "text-foreground group-hover:text-white"
      )}>
        {action.label}
      </span>
    </Link>
  )
}
