// @ts-nocheck
'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  Play, 
  CheckCircle2, 
  Lock, 
  Clock,
  BookOpen,
  Sparkles,
  FileText,
  Code
} from 'lucide-react'
import { startModule, completeModule } from '@/actions/apprenticeship-progress'
import { toast } from 'sonner'

interface ModuleCompletion {
  id: string
  status: 'locked' | 'available' | 'in_progress' | 'completed' | 'failed'
  started_at?: string
  completed_at?: string
  hours_logged?: number
  module: {
    id: string
    title: string
    description?: string
    module_type: string
    estimated_hours: number
    content_type?: string
  }
}

interface ModuleProgressListProps {
  modules: ModuleCompletion[]
  enrollmentId: string
}

const MODULE_TYPE_CONFIG: Record<string, { icon: typeof BookOpen; color: string; label: string }> = {
  core: { icon: BookOpen, color: 'text-primary', label: 'Core' },
  functional: { icon: FileText, color: 'text-status-warning', label: 'Functional' },
  quick_skill: { icon: Sparkles, color: 'text-purple-600', label: 'Quick Skill' },
  ai_readiness: { icon: Sparkles, color: 'text-electric-blue', label: 'AI Readiness' },
  assessment: { icon: CheckCircle2, color: 'text-status-success', label: 'Assessment' },
  project: { icon: Code, color: 'text-status-info', label: 'Project' }
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  locked: { color: 'secondary', label: 'Locked' },
  available: { color: 'info', label: 'Available' },
  in_progress: { color: 'warning', label: 'In Progress' },
  completed: { color: 'success', label: 'Completed' },
  failed: { color: 'destructive', label: 'Failed' }
}

export function ModuleProgressList({ modules, enrollmentId }: ModuleProgressListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  
  const handleStartModule = async (completionId: string) => {
    setLoadingId(completionId)
    const result = await startModule(completionId)
    setLoadingId(null)
    
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Module started!')
    }
  }
  
  const handleCompleteModule = async (completionId: string) => {
    setLoadingId(completionId)
    const result = await completeModule(completionId, enrollmentId)
    setLoadingId(null)
    
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Module completed! OTJT hours logged.')
    }
  }
  
  if (modules.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p>No learning modules available yet.</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      {modules.map((completion) => {
        const moduleData = completion.module
        const typeConfig = MODULE_TYPE_CONFIG[moduleData.module_type] || MODULE_TYPE_CONFIG.core
        const statusConfig = STATUS_CONFIG[completion.status]
        const Icon = typeConfig.icon
        const isLocked = completion.status === 'locked'
        const isLoading = loadingId === completion.id
        
        return (
          <div 
            key={completion.id}
            className={`flex items-center gap-4 p-4 rounded-lg border ${
              isLocked ? 'bg-muted/50 opacity-60' : 'bg-background'
            } ${completion.status === 'completed' ? 'border-status-success/30' : ''}`}
          >
            {/* Icon */}
            <div className={`p-2 rounded-lg ${isLocked ? 'bg-muted' : 'bg-primary/10'}`}>
              {isLocked ? (
                <Lock className="h-5 w-5 text-muted-foreground" />
              ) : completion.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              ) : (
                <Icon className={`h-5 w-5 ${typeConfig.color}`} />
              )}
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-sm truncate">{moduleData.title}</h4>
                <Badge variant="outline" className="text-xs shrink-0">
                  {typeConfig.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {moduleData.estimated_hours}h
                </span>
                <Badge 
                  variant={statusConfig.color as 'secondary' | 'info' | 'warning' | 'success' | 'destructive'}
                  className="text-xs"
                >
                  {statusConfig.label}
                </Badge>
              </div>
              
              {/* Progress bar for in-progress modules */}
              {completion.status === 'in_progress' && completion.hours_logged !== undefined && (
                <div className="mt-2">
                  <Progress 
                    value={(completion.hours_logged / moduleData.estimated_hours) * 100} 
                    className="h-1"
                  />
                </div>
              )}
            </div>
            
            {/* Action Button */}
            <div className="shrink-0">
              {completion.status === 'available' && (
                <Button 
                  size="sm" 
                  onClick={() => handleStartModule(completion.id)}
                  disabled={isLoading}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Start
                </Button>
              )}
              {completion.status === 'in_progress' && (
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => handleCompleteModule(completion.id)}
                  disabled={isLoading}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Complete
                </Button>
              )}
              {completion.status === 'completed' && completion.completed_at && (
                <span className="text-xs text-muted-foreground">
                  {new Date(completion.completed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
