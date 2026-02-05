'use client'

import { useState } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createTask } from '@/actions/tasks'
import { toast } from 'sonner'
import { addDays } from 'date-fns'

interface QuickAddTaskProps {
    objectives: { id: string; title: string }[]
    members: { id: string; full_name: string; role: string }[]
    currentUserId: string
    teams?: { id: string; name: string }[]
    onTaskCreated?: () => void
}

export function QuickAddTask({ objectives, members, currentUserId, teams = [], onTaskCreated }: QuickAddTaskProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [title, setTitle] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return

        // Check if objectives exist (required for task creation)
        if (objectives.length === 0) {
            toast.error('Please create an objective first before adding tasks')
            return
        }

        setIsLoading(true)
        const formData = new FormData()
        formData.append('title', title.trim())
        
        // Use smart defaults
        // Default assignee to current user
        formData.append('assignee_id', currentUserId)
        formData.append('assignee_ids', JSON.stringify([currentUserId]))
        
        // Default objective to first available (required)
        const defaultObjectiveId = objectives[0].id
        formData.append('objective_id', defaultObjectiveId)
        
        // Default deadline to 7 days from now
        const defaultDeadline = addDays(new Date(), 7)
        formData.append('end_date', defaultDeadline.toISOString())
        
        // No description, files, or other optional fields for quick add
        formData.append('file_count', '0')

        const result = await createTask(formData)
        setIsLoading(false)

        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success('Task created')
            setTitle('')
            setIsExpanded(false)
            onTaskCreated?.()
        }
    }

    if (!isExpanded) {
        return (
            <button
                data-quick-add-trigger
                onClick={() => setIsExpanded(true)}
                aria-label="Add a new task (keyboard shortcut: N)"
                className="w-full flex items-center gap-3 px-4 py-3.5 text-muted-foreground hover:text-foreground border border-dashed border-muted hover:border-international-orange/30 rounded-xl bg-muted/30 hover:bg-international-orange/5 transition-all duration-200 ease-out group"
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
        <form onSubmit={handleSubmit} className="flex gap-2 p-3 rounded-xl bg-background border border-international-orange/20 shadow-lg ring-2 ring-international-orange/10" role="form" aria-label="Quick add task">
            <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                disabled={isLoading}
                aria-label="Task title"
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        setIsExpanded(false)
                        setTitle('')
                    }
                }}
                className="flex-1 border focus-visible:ring-international-orange"
            />
            <Button type="submit" size="sm" disabled={isLoading || !title.trim()} aria-label={isLoading ? "Creating task..." : "Create task"} className="bg-international-orange hover:bg-international-orange-hover text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                <span className="ml-1 hidden sm:inline">Add</span>
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => {
                setIsExpanded(false)
                setTitle('')
            }} aria-label="Cancel" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" aria-hidden="true" />
            </Button>
        </form>
    )
}
