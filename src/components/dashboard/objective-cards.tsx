'use client'

import Link from 'next/link'
import { Target, TrendingUp, ChevronRight, Calendar } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface Objective {
  id: string
  title: string
  description?: string | null
  status: string
  progress?: number | null
  start_date: string | null
  end_date: string | null
  creator?: { full_name: string | null; avatar_url?: string | null } | null
}

interface ObjectiveCardsProps {
  objectives: Objective[]
}

/**
 * Objective Progress Cards - Beautiful visual progress for active goals
 */
export function ObjectiveCards({ objectives }: ObjectiveCardsProps) {
  const activeObjectives = objectives.filter(obj => 
    obj.status === 'Active' || obj.status === 'In_Progress'
  ).slice(0, 3) // Show top 3
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Active Objectives</h2>
              <p className="text-sm text-muted-foreground">Track your strategic goals</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Objective Cards */}
      <div className="p-6 space-y-4">
        {activeObjectives.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Target className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              No active objectives yet
            </p>
            <Link
              href="/objectives"
              className="inline-block mt-3 text-sm text-international-orange hover:text-orange-700 font-medium"
            >
              Create your first objective
            </Link>
          </div>
        ) : (
          activeObjectives.map((objective) => (
            <ObjectiveCard key={objective.id} objective={objective} />
          ))
        )}
      </div>
      
      {/* Footer */}
      {activeObjectives.length > 0 && (
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <Link
            href="/objectives"
            className="text-sm text-international-orange hover:text-orange-700 font-medium flex items-center gap-1 group w-fit"
          >
            View all objectives
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}
    </div>
  )
}

function ObjectiveCard({ objective }: { objective: Objective }) {
  const progress = objective.progress || 0
  const daysRemaining = objective.end_date 
    ? differenceInDays(new Date(objective.end_date), new Date())
    : null
  
  return (
    <Link
      href={`/objectives/${objective.id}`}
      className="block p-4 rounded-xl border border-slate-200 hover:border-international-orange hover:shadow-md transition-all duration-200 group"
    >
      <div className="space-y-3">
        {/* Title and Progress */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors line-clamp-2 flex-1">
            {objective.title}
          </h3>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-international-orange transition-colors flex-shrink-0" />
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className={cn(
              "font-bold",
              progress >= 75 ? "text-green-600" :
              progress >= 50 ? "text-blue-600" :
              progress >= 25 ? "text-amber-600" :
              "text-slate-600"
            )}>
              {progress}%
            </span>
          </div>
          <Progress 
            value={progress} 
            className="h-2"
            indicatorClassName={cn(
              progress >= 75 ? "bg-green-500" :
              progress >= 50 ? "bg-blue-500" :
              progress >= 25 ? "bg-amber-500" :
              "bg-slate-400"
            )}
          />
        </div>
        
        {/* Footer Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {daysRemaining !== null && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {daysRemaining > 0 ? `${daysRemaining} days left` : 
               daysRemaining === 0 ? 'Due today' :
               'Overdue'}
            </span>
          )}
          {objective.creator?.full_name && (
            <span className="truncate">
              by {objective.creator.full_name}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
