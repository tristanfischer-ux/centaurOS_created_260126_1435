'use client'

import Link from 'next/link'
import { Plus, Target, MessageSquare, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickActionsProps {
  foundryId: string
}

/**
 * Quick Actions Panel - One-click access to common tasks
 */
export function QuickActions({ foundryId }: QuickActionsProps) {
  const actions = [
    {
      label: 'New Task',
      icon: Plus,
      href: '/tasks',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      hoverColor: 'hover:from-blue-600 hover:to-blue-700'
    },
    {
      label: 'New Objective',
      icon: Target,
      href: '/objectives',
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      hoverColor: 'hover:from-purple-600 hover:to-purple-700'
    },
    {
      label: 'Messages',
      icon: MessageSquare,
      href: '/home',
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      hoverColor: 'hover:from-green-600 hover:to-green-700'
    },
    {
      label: 'Team',
      icon: Users,
      href: '/team',
      color: 'from-orange-500 to-orange-600',
      bgColor: 'bg-orange-50',
      hoverColor: 'hover:from-orange-600 hover:to-orange-700'
    }
  ]
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-orange-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-international-orange/10 rounded-lg">
            <Zap className="w-5 h-5 text-international-orange" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Quick Actions</h2>
            <p className="text-sm text-muted-foreground">Jump to common tasks</p>
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="p-6 grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={cn(
              "group relative overflow-hidden rounded-xl p-4 transition-all duration-300",
              "border border-slate-200 hover:border-transparent hover:shadow-lg",
              "flex flex-col items-center justify-center gap-2 text-center"
            )}
          >
            {/* Gradient Background (on hover) */}
            <div className={cn(
              "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br",
              action.color
            )} />
            
            {/* Content */}
            <div className="relative">
              <div className={cn(
                "inline-flex p-3 rounded-xl transition-all duration-300",
                action.bgColor,
                "group-hover:bg-white/20"
              )}>
                <action.icon className={cn(
                  "w-6 h-6 transition-colors duration-300",
                  "text-slate-600 group-hover:text-white"
                )} />
              </div>
            </div>
            
            <span className={cn(
              "relative text-sm font-medium transition-colors duration-300",
              "text-foreground group-hover:text-white"
            )}>
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
