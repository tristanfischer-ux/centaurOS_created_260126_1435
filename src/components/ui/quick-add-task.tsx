'use client'

import { useState } from 'react'
import { Plus, X, Loader2, Target, ChevronDown, Lock, Unlock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import { createTask } from '@/actions/tasks'
import { toast } from 'sonner'
import { addDays } from 'date-fns'
import { cn } from '@/lib/utils'

interface QuickAddTaskProps {
    objectives: { id: string; title: string }[]
    members: { id: string; full_name: string; role: string }[]
    currentUserId: string
    teams?: { id: string; name: string }[]
    defaultObjectiveId?: string
    onTaskCreated?: () => void
}

/**
 * Quick inline task creation with required objective selection.
 *
 * @description Provides a lightweight inline form for rapid task creation.
 * Users must select an objective before creating the task - no silent defaults.
 */
export function QuickAddTask({ objectives, members, currentUserId, teams = [], defaultObjectiveId, onTaskCreated }: QuickAddTaskProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [title, setTitle] = useState('')
    const [selectedObjective, setSelectedObjective] = useState(defaultObjectiveId || '')
    const [objectiveOpen, setObjectiveOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isPrivate, setIsPrivate] = useState(false)

    const hasObjectives = objectives.length > 0

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return

        // CRITICAL: Require objective selection
        if (!hasObjectives) {
            toast.error('Please create an objective first before adding tasks')
            return
        }

        if (!selectedObjective) {
            toast.error('Please select an objective for this task')
            return
        }

        setIsLoading(true)
        const formData = new FormData()
        formData.append('title', title.trim())
        
        // Default assignee to current user
        formData.append('assignee_id', currentUserId)
        formData.append('assignee_ids', JSON.stringify([currentUserId]))
        
        // Use the explicitly selected objective
        formData.append('objective_id', selectedObjective)
        
        // Default deadline to 7 days from now
        const defaultDeadline = addDays(new Date(), 7)
        formData.append('end_date', defaultDeadline.toISOString())
        
        // Privacy
        formData.append('is_private', String(isPrivate))
        
        // No description, files, or other optional fields for quick add
        formData.append('file_count', '0')

        const result = await createTask(formData)
        setIsLoading(false)

        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success('Task created')
            setTitle('')
            setSelectedObjective(defaultObjectiveId || '')
            setIsPrivate(false)
            setIsExpanded(false)
            onTaskCreated?.()
        }
    }

    const handleCancel = () => {
        setIsExpanded(false)
        setTitle('')
        setSelectedObjective(defaultObjectiveId || '')
        setIsPrivate(false)
    }

    const selectedObjectiveTitle = objectives.find(o => o.id === selectedObjective)?.title

    if (!isExpanded) {
        return (
            <button
                data-quick-add-trigger
                onClick={() => setIsExpanded(true)}
                disabled={!hasObjectives}
                title={!hasObjectives ? 'Create an objective first' : undefined}
                aria-label="Add a new task (keyboard shortcut: N)"
                className="w-full flex items-center gap-3 px-4 py-3.5 text-muted-foreground hover:text-foreground border border-dashed border-muted hover:border-international-orange/30 rounded-xl bg-muted/30 hover:bg-international-orange/5 transition-all duration-200 ease-out group disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted/50 group-hover:bg-international-orange transition-colors duration-200">
                    <Plus className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors duration-200" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium">Add a task...</span>
                <kbd className="ml-auto px-2 py-0.5 text-[10px] font-mono bg-muted/50 group-hover:bg-international-orange/10 text-muted-foreground rounded-md border border-muted/50 transition-colors duration-200">N</kbd>
            </button>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-xl bg-background border border-international-orange/20 shadow-lg ring-2 ring-international-orange/10" role="form" aria-label="Quick add task">
            {/* Row 1: Title input */}
            <div className="flex gap-2">
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    autoFocus
                    disabled={isLoading}
                    aria-label="Task title"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            handleCancel()
                        }
                    }}
                    className="flex-1 border focus-visible:ring-international-orange"
                />
            </div>

            {/* Row 2: Objective selector + actions */}
            <div className="flex gap-2 items-center">
                <Popover open={objectiveOpen} onOpenChange={setObjectiveOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            role="combobox"
                            aria-expanded={objectiveOpen}
                            aria-label="Select objective"
                            className={cn(
                                "flex-1 justify-between text-left h-9",
                                !selectedObjective && "text-muted-foreground"
                            )}
                        >
                            <span className="flex items-center gap-1.5 truncate">
                                <Target className="h-3.5 w-3.5 shrink-0 text-international-orange" aria-hidden="true" />
                                <span className="truncate">
                                    {selectedObjectiveTitle || 'Select objective *'}
                                </span>
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search objectives..." />
                            <CommandList>
                                <CommandEmpty>No objectives found.</CommandEmpty>
                                <CommandGroup>
                                    {objectives.map((obj) => (
                                        <CommandItem
                                            key={obj.id}
                                            value={obj.title}
                                            onSelect={() => {
                                                setSelectedObjective(obj.id)
                                                setObjectiveOpen(false)
                                            }}
                                        >
                                            <Target className={cn(
                                                "mr-2 h-3.5 w-3.5 shrink-0",
                                                selectedObjective === obj.id ? "text-international-orange" : "text-muted-foreground"
                                            )} />
                                            <span className="truncate">{obj.title}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* Privacy toggle */}
                <Button
                    type="button"
                    size="sm"
                    variant={isPrivate ? "secondary" : "ghost"}
                    onClick={() => setIsPrivate(!isPrivate)}
                    aria-pressed={isPrivate}
                    aria-label={isPrivate ? 'Task is private. Click to make public.' : 'Task is public. Click to make private.'}
                    title={isPrivate ? 'Private task' : 'Make private'}
                    className={cn(
                        "px-2",
                        isPrivate && "bg-status-warning-light text-status-warning-dark"
                    )}
                >
                    {isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </Button>

                <Button
                    type="submit"
                    size="sm"
                    disabled={isLoading || !title.trim() || !selectedObjective}
                    aria-label={isLoading ? 'Creating task...' : 'Create task'}
                    className="bg-international-orange hover:bg-international-orange-hover text-white"
                    title={!selectedObjective ? 'Select an objective first' : undefined}
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                    <span className="ml-1 hidden sm:inline">Add</span>
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleCancel}
                    aria-label="Cancel"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <X className="w-4 h-4" aria-hidden="true" />
                </Button>
            </div>
        </form>
    )
}
