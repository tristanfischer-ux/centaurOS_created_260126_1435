'use client'

import { Target, Users, TrendingUp, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardsProps {
  totalTasks: number
  todayTasks: number
  overdueCount: number
  activeObjectives: number
  teamOnline: number
  teamTotal: number
  unreadMessages: number
  isExecutiveOrFounder: boolean
  blockersCount: number
  pendingDecisionsCount: number
}

export function StatsCards({
  totalTasks,
  todayTasks,
  overdueCount,
  activeObjectives,
  teamOnline,
  teamTotal,
  unreadMessages,
  isExecutiveOrFounder,
  blockersCount,
  pendingDecisionsCount
}: StatsCardsProps) {
  const cards = [
    {
      title: 'Active Objectives',
      value: activeObjectives,
      icon: Target,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600'
    },
    {
      title: 'Team Online',
      value: `${teamOnline}/${teamTotal}`,
      icon: Users,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600'
    },
    {
      title: 'Completion Rate',
      value: '85%', // This could be calculated from data
      icon: TrendingUp,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600'
    }
  ]
  
  if (isExecutiveOrFounder && (blockersCount > 0 || pendingDecisionsCount > 0)) {
    cards.push({
      title: 'Needs Attention',
      value: blockersCount + pendingDecisionsCount,
      icon: AlertTriangle,
      color: 'from-red-500 to-red-600',
      bgColor: 'bg-red-50',
      textColor: 'text-red-600'
    })
  }
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="relative bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg transition-all duration-300 group overflow-hidden"
        >
          {/* Gradient Background */}
          <div className={cn(
            "absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300 bg-gradient-to-br",
            card.color
          )} />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                "p-3 rounded-xl",
                card.bgColor
              )}>
                <card.icon className={cn("w-6 h-6", card.textColor)} />
              </div>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground font-medium">
                {card.title}
              </p>
              <p className={cn(
                "text-3xl font-bold",
                card.textColor
              )}>
                {card.value}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
