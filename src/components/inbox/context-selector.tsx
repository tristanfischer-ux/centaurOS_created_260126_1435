'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getStatusBadgeClass } from '@/lib/status-colors'

interface Task {
  id: string
  title: string
  status: string | null
  task_number?: number
  objective?: Objective | null
  objective_id?: string | null
}

interface Objective {
  id: string
  title: string
}

interface ContextSelectorProps {
  tasks: Task[]
  objectives: Objective[]
  currentContext: { taskId?: string; objectiveId?: string } | null
  onContextChange: (context: { taskId?: string; objectiveId?: string } | null) => void
  recentContexts?: Array<{ taskId?: string; objectiveId?: string }>
}

export function ContextSelector({
  tasks,
  objectives,
  currentContext,
  onContextChange,
  recentContexts = [],
}: ContextSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  // Get current selection display text
  const getCurrentLabel = () => {
    if (!currentContext) return 'General conversation'
    
    if (currentContext.taskId) {
      const task = tasks.find(t => t.id === currentContext.taskId)
      if (task) {
        const taskNum = task.task_number ? `#${task.task_number}` : '#--'
        return `${taskNum} ${task.title}`
      }
    }
    
    if (currentContext.objectiveId) {
      const objective = objectives.find(o => o.id === currentContext.objectiveId)
      if (objective) return objective.title
    }
    
    return 'Select context...'
  }

  // Filter tasks by search term
  const filteredTasks = React.useMemo(() => {
    if (!search) return tasks
    const searchLower = search.toLowerCase()
    return tasks.filter(task => 
      task.title.toLowerCase().includes(searchLower) ||
      task.task_number?.toString().includes(searchLower)
    )
  }, [tasks, search])

  // Get recent tasks
  const recentTasks = React.useMemo(() => {
    if (!recentContexts.length) return []
    return recentContexts
      .filter(ctx => ctx.taskId)
      .map(ctx => tasks.find(t => t.id === ctx.taskId))
      .filter((task): task is Task => !!task)
      .slice(0, 5)
  }, [recentContexts, tasks])

  // Group tasks by objective
  const groupedTasks = React.useMemo(() => {
    const groups = new Map<string, Task[]>()
    
    // Group with objectives
    filteredTasks.forEach(task => {
      const objectiveId = task.objective_id || 'no-objective'
      if (!groups.has(objectiveId)) {
        groups.set(objectiveId, [])
      }
      groups.get(objectiveId)!.push(task)
    })
    
    return Array.from(groups.entries()).map(([objectiveId, tasks]) => ({
      objectiveId,
      objective: objectiveId === 'no-objective' 
        ? null 
        : objectives.find(o => o.id === objectiveId),
      tasks: tasks.sort((a, b) => 
        (b.task_number || 0) - (a.task_number || 0)
      ),
    }))
  }, [filteredTasks, objectives])

  const handleSelect = (context: { taskId?: string; objectiveId?: string } | null) => {
    onContextChange(context)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="truncate">{getCurrentLabel()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search tasks..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No tasks found.</CommandEmpty>
            
            {/* General Conversation Option */}
            <CommandGroup>
              <CommandItem
                onSelect={() => handleSelect(null)}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>General conversation</span>
                {!currentContext && (
                  <Check className="ml-auto h-4 w-4" />
                )}
              </CommandItem>
            </CommandGroup>

            {/* Recently Used */}
            {recentTasks.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recently Used">
                  {recentTasks.map(task => {
                    const taskNum = task.task_number ? `#${task.task_number}` : '#--'
                    const isSelected = currentContext?.taskId === task.id
                    
                    return (
                      <CommandItem
                        key={task.id}
                        onSelect={() => handleSelect({ taskId: task.id })}
                        className="gap-2"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {taskNum}
                        </span>
                        <span className="flex-1 truncate">{task.title}</span>
                        {task.status && (
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs',
                            getStatusBadgeClass(task.status)
                          )}>
                            {task.status.replace(/_/g, ' ')}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}

            {/* Tasks grouped by objective */}
            {groupedTasks.length > 0 && (
              <>
                <CommandSeparator />
                {groupedTasks.map(group => (
                  <CommandGroup
                    key={group.objectiveId}
                    heading={group.objective ? `📋 ${group.objective.title}` : 'No Objective'}
                  >
                    {group.tasks.map(task => {
                      const taskNum = task.task_number ? `#${task.task_number}` : '#--'
                      const isSelected = currentContext?.taskId === task.id
                      
                      return (
                        <CommandItem
                          key={task.id}
                          onSelect={() => handleSelect({ taskId: task.id })}
                          className="gap-2"
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {taskNum}
                          </span>
                          <span className="flex-1 truncate">{task.title}</span>
                          {task.status && (
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-xs',
                              getStatusBadgeClass(task.status)
                            )}>
                              {task.status.replace(/_/g, ' ')}
                            </span>
                          )}
                          {isSelected && (
                            <Check className="ml-auto h-4 w-4" />
                          )}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
