'use client'

/**
 * CreateSubsystemObjectiveDialog - Create an objective from a subsystem pack
 * 
 * @description Dialog that creates an objective with pre-built tasks from
 * a universal subsystem's objective pack. Automatically includes marketplace
 * discovery tasks.
 * 
 * @component
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Target, Users, ShoppingCart, Clock, User } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createObjectiveFromSubsystem } from '@/actions/objectives'
import type {
  UniversalSubsystem,
  SubsystemObjectivePack,
  SubsystemObjectiveTask,
} from '@/types/blueprints'

interface CreateSubsystemObjectiveDialogProps {
  /** The subsystem this objective is for */
  subsystem: UniversalSubsystem | null
  /** The objective pack with pre-built tasks */
  objectivePack: SubsystemObjectivePack | null
  /** Whether the dialog is open */
  open: boolean
  /** Called when dialog is closed */
  onOpenChange: (open: boolean) => void
}

/**
 * Role badge with appropriate styling
 */
function RoleBadge({ role }: { role: string }) {
  const config = {
    Executive: { bg: 'bg-chart-5/10', text: 'text-chart-5' },
    Apprentice: { bg: 'bg-status-info-light', text: 'text-status-info' },
    AI_Agent: { bg: 'bg-status-success-light', text: 'text-status-success' },
  }[role] || { bg: 'bg-muted', text: 'text-muted-foreground' }
  
  return (
    <Badge variant="outline" className={cn(config.bg, config.text, 'border-0 text-xs')}>
      {role === 'AI_Agent' ? 'AI Agent' : role}
    </Badge>
  )
}

/**
 * Task preview card
 */
function TaskPreview({
  task,
  selected,
  onToggle,
}: {
  task: SubsystemObjectiveTask
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
        selected
          ? 'border-international-orange/50 bg-international-orange/5'
          : 'border-transparent bg-muted/50 hover:bg-muted'
      )}
      onClick={onToggle}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-foreground text-sm">
            {task.title}
          </p>
          <RoleBadge role={task.role} />
        </div>
        
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {task.description.split('\n')[0]}
        </p>
        
        <div className="flex items-center gap-3 mt-2">
          {task.estimated_hours && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {task.estimated_hours}h
            </span>
          )}
          {task.is_marketplace_task && (
            <span className="flex items-center gap-1 text-xs text-international-orange">
              {task.marketplace_filter?.type === 'advice' ? (
                <Users className="h-3 w-3" />
              ) : (
                <ShoppingCart className="h-3 w-3" />
              )}
              Marketplace
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function CreateSubsystemObjectiveDialog({
  subsystem,
  objectivePack,
  open,
  onOpenChange,
}: CreateSubsystemObjectiveDialogProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(
    new Set(objectivePack?.tasks.map((_, i) => i) || [])
  )
  
  if (!subsystem || !objectivePack) return null
  
  const toggleTask = (index: number) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }
  
  const selectAll = () => {
    setSelectedTasks(new Set(objectivePack.tasks.map((_, i) => i)))
  }
  
  const selectNone = () => {
    setSelectedTasks(new Set())
  }
  
  // Calculate totals
  const selectedTasksList = objectivePack.tasks.filter((_, i) => selectedTasks.has(i))
  const totalHours = selectedTasksList.reduce((sum, t) => sum + (t.estimated_hours || 0), 0)
  const marketplaceTasks = selectedTasksList.filter((t) => t.is_marketplace_task).length
  
  const handleCreate = async () => {
    if (selectedTasks.size === 0) {
      toast.error('Please select at least one task')
      return
    }
    
    setIsCreating(true)
    
    try {
      const result = await createObjectiveFromSubsystem({
        subsystemId: subsystem.id,
        subsystemName: subsystem.name,
        packId: objectivePack.id,
        packTitle: objectivePack.title,
        packSummary: objectivePack.summary,
        packDescription: objectivePack.extended_description,
        selectedTaskIndices: Array.from(selectedTasks),
        tasks: objectivePack.tasks,
      })
      
      if (result.error) {
        toast.error(result.error)
        return
      }
      
      toast.success(`Created objective with ${selectedTasks.size} tasks`)
      onOpenChange(false)
      
      // Navigate to the new objective
      if (result.objectiveId) {
        router.push(`/objectives/${result.objectiveId}`)
      }
    } catch (error) {
      console.error('[CreateSubsystemObjective] Error:', error)
      toast.error('Failed to create objective')
    } finally {
      setIsCreating(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-international-orange" />
            {objectivePack.title}
          </DialogTitle>
          <DialogDescription>
            Create an objective for {subsystem.name} with pre-built tasks.
            Select the tasks you want to include.
          </DialogDescription>
        </DialogHeader>
        
        {/* Task selection */}
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              {selectedTasks.size} of {objectivePack.tasks.length} tasks selected
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={selectNone}>
                Select None
              </Button>
            </div>
          </div>
          
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {objectivePack.tasks.map((task, index) => (
                <TaskPreview
                  key={index}
                  task={task}
                  selected={selectedTasks.has(index)}
                  onToggle={() => toggleTask(index)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
        
        {/* Summary footer */}
        <div className="flex items-center gap-4 pt-4 border-t text-sm text-muted-foreground">
          {totalHours > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              ~{totalHours} hours
            </span>
          )}
          {marketplaceTasks > 0 && (
            <span className="flex items-center gap-1 text-international-orange">
              <Users className="h-4 w-4" />
              {marketplaceTasks} marketplace {marketplaceTasks === 1 ? 'task' : 'tasks'}
            </span>
          )}
          <span className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {selectedTasksList.filter((t) => t.role === 'Executive').length} Executive,{' '}
            {selectedTasksList.filter((t) => t.role === 'Apprentice').length} Apprentice,{' '}
            {selectedTasksList.filter((t) => t.role === 'AI_Agent').length} AI
          </span>
        </div>
        
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || selectedTasks.size === 0}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                Create Objective
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
