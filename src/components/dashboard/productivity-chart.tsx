'use client'

import { TrendingUp, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TaskCompletionStat {
  date: string
  label: string
  myTasks: number
  teamTasks: number
}

interface ProductivityChartProps {
  data: TaskCompletionStat[]
}

/**
 * Productivity Chart - Beautiful visualization of task completion trends
 */
export function ProductivityChart({ data }: ProductivityChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Productivity Trends</h2>
              <p className="text-sm text-muted-foreground">Task completion over time</p>
            </div>
          </div>
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No data available yet
            </p>
          </div>
        </div>
      </div>
    )
  }
  
  const maxValue = Math.max(...data.map(d => d.myTasks + d.teamTasks), 5)
  const totalMyTasks = data.reduce((sum, d) => sum + d.myTasks, 0)
  const totalTeamTasks = data.reduce((sum, d) => sum + d.teamTasks, 0)
  const total = totalMyTasks + totalTeamTasks
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Productivity Trends</h2>
              <p className="text-sm text-muted-foreground">Last 7 days</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-semibold">{total} tasks</span>
          </div>
        </div>
      </div>
      
      {/* Chart */}
      <div className="p-6">
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-international-orange" />
            <span className="text-xs text-muted-foreground">
              You ({totalMyTasks})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-muted-foreground">
              Team ({totalTeamTasks})
            </span>
          </div>
        </div>
        
        {/* Bar Chart */}
        <div className="flex items-end justify-between gap-2 h-48">
          {data.map((day, index) => {
            const totalHeight = day.myTasks + day.teamTasks
            const myPercent = totalHeight > 0 ? (day.myTasks / maxValue) * 100 : 0
            const teamPercent = totalHeight > 0 ? (day.teamTasks / maxValue) * 100 : 0
            const isEmpty = totalHeight === 0
            
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                {/* Bar */}
                <div className="relative w-full h-full flex flex-col justify-end">
                  <div className="relative w-full flex flex-col-reverse gap-0.5">
                    {/* My tasks bar */}
                    {myPercent > 0 && (
                      <div
                        className="w-full bg-international-orange rounded-t-lg transition-all duration-500 hover:bg-orange-600 group relative"
                        style={{ height: `${myPercent}%` }}
                      >
                        {day.myTasks > 0 && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-bold text-white">
                              {day.myTasks}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Team tasks bar */}
                    {teamPercent > 0 && (
                      <div
                        className={cn(
                          "w-full bg-blue-500 transition-all duration-500 hover:bg-blue-600 group relative",
                          myPercent === 0 && "rounded-t-lg"
                        )}
                        style={{ height: `${teamPercent}%` }}
                      >
                        {day.teamTasks > 0 && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-bold text-white">
                              {day.teamTasks}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Empty state */}
                    {isEmpty && (
                      <div className="w-full h-2 bg-slate-100 rounded-full" />
                    )}
                  </div>
                </div>
                
                {/* Label */}
                <span className={cn(
                  "text-xs font-medium",
                  index === data.length - 1 ? "text-international-orange" : "text-muted-foreground"
                )}>
                  {day.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Footer Stats */}
      <div className="px-6 pb-6">
        <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-international-orange">{totalMyTasks}</p>
            <p className="text-xs text-muted-foreground">You</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{totalTeamTasks}</p>
            <p className="text-xs text-muted-foreground">Team</p>
          </div>
        </div>
      </div>
    </div>
  )
}
