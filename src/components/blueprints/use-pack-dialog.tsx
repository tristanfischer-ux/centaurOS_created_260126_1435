'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createObjective } from '@/actions/objectives'
import type { ObjectivePack } from '@/actions/packs'
import { toast } from 'sonner'
import {
  Loader2,
  ArrowRight,
  CheckCircle2,
  Package,
  Target,
  Store,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  CircleDashed,
  AlertCircle,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string
  avatar_url?: string | null
}

interface UsePackDialogProps {
  pack: ObjectivePack
  trigger?: React.ReactNode
  members?: TeamMember[]
  /** Controlled open state — when provided, the component is fully controlled */
  open?: boolean
  /** Controlled open change handler — required when `open` is provided */
  onOpenChange?: (open: boolean) => void
}

export function UsePackDialog({ pack, trigger, members = [], open: controlledOpen, onOpenChange }: UsePackDialogProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [isCreating, setIsCreating] = useState(false)
  const [objectiveTitle, setObjectiveTitle] = useState(pack.title)
  const [objectiveDescription, setObjectiveDescription] = useState(pack.description || '')
  const [dueDate, setDueDate] = useState('')
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(
    pack.items?.map(item => item.id) || []
  )
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string>>(
    pack.items?.reduce((acc, item) => ({ ...acc, [item.id]: 'unassigned' }), {} as Record<string, string>) || {}
  )
  const [bulkAssigneeKey, setBulkAssigneeKey] = useState(0)

  // Reset state when dialog opens to avoid stale values after cancel-reopen
  const resetState = () => {
    setObjectiveTitle(pack.title)
    setObjectiveDescription(pack.description || '')
    setDueDate('')
    setSelectedTaskIds(pack.items?.map(item => item.id) || [])
    setTaskAssignees(
      pack.items?.reduce((acc, item) => ({ ...acc, [item.id]: 'unassigned' }), {} as Record<string, string>) || {}
    )
    setBulkAssigneeKey(prev => prev + 1)
    setExpandedTaskId(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) resetState()
    setOpen(nextOpen)
  }

  const handleCreate = async () => {
    if (!objectiveTitle.trim()) {
      toast.error('Please enter an objective title')
      return
    }

    if (selectedTaskIds.length === 0) {
      toast.error('Please select at least one task')
      return
    }

    setIsCreating(true)

    try {
      const formData = new FormData()
      formData.append('title', objectiveTitle)
      formData.append('description', objectiveDescription)
      formData.append('playbookId', pack.id)
      if (dueDate) {
        formData.append('end_date', dueDate)
      }
      selectedTaskIds.forEach(id => {
        formData.append('selectedTaskIds', id)
      })
      // Pass task assignee selections so they're persisted
      formData.append('taskAssignees', JSON.stringify(taskAssignees))

      const result = await createObjective(formData)

      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Objective created with tasks!')
        setOpen(false)
        router.push('/new-objectives')
      }
    } catch (error) {
      toast.error('Failed to create objective')
      console.error(error)
    } finally {
      setIsCreating(false)
    }
  }

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    )
  }

  const toggleAll = () => {
    if (selectedTaskIds.length === (pack.items?.length || 0)) {
      setSelectedTaskIds([])
    } else {
      setSelectedTaskIds(pack.items?.map(item => item.id) || [])
    }
  }

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTaskId(expandedTaskId === taskId ? null : taskId)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== undefined ? (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      ) : controlledOpen === undefined ? (
        <DialogTrigger asChild>
          <Button className="w-full" size="sm">
            Use This Pack
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-electric-blue" />
            {pack.title}
          </DialogTitle>
          <DialogDescription>
            Create an objective from this pack. Review details and select tasks to include.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" className="gap-2">
              <Info className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Select Tasks
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* What is this pack? */}
            <Card className="bg-electric-blue/5 border-electric-blue/20">
              <CardContent className="pt-6">
                <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4 text-electric-blue" />
                  What is this pack?
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {pack.description || 
                    'This objective pack contains pre-built tasks designed by experienced founders to help you execute efficiently. Each task is assigned to the appropriate role (you, your team, or an AI agent) to optimize workflow.'}
                </p>
              </CardContent>
            </Card>

            {/* Pack Details */}
            <div className="grid grid-cols-2 gap-3">
              {pack.estimated_duration && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase">Duration</span>
                    </div>
                    <p className="text-base font-semibold text-foreground">{pack.estimated_duration}</p>
                  </CardContent>
                </Card>
              )}
              {pack.difficulty && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase">Difficulty</span>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {pack.difficulty}
                    </Badge>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Tasks</span>
                  </div>
                  <p className="text-base font-semibold text-foreground">
                    {pack.items?.length || 0} tasks
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Prerequisites */}
            {pack.prerequisites && pack.prerequisites.length > 0 && (
              <Card className="border-status-warning/30">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-status-warning" />
                    Prerequisites
                  </h3>
                  <ul className="space-y-2">
                    {pack.prerequisites.map((prereq, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5 text-status-warning shrink-0 mt-0.5" />
                        <span>{prereq}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Success Criteria */}
            {pack.success_criteria && pack.success_criteria.length > 0 && (
              <Card className="border-status-success/30">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-status-success" />
                    Success Criteria
                  </h3>
                  <ul className="space-y-2">
                    {pack.success_criteria.map((criterion, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0 mt-0.5" />
                        <span>{criterion}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* What you'll accomplish */}
            <Card className="bg-international-orange/5 border-international-orange/20">
              <CardContent className="pt-6">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-international-orange" />
                  What you&apos;ll accomplish
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                  By completing the tasks in this pack, you will:
                </p>
                <ul className="space-y-2">
                  {pack.items?.slice(0, 4).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-status-success shrink-0 mt-0.5" />
                      <span>{item.title}</span>
                    </li>
                  ))}
                  {pack.items && pack.items.length > 4 && (
                    <li className="text-xs text-muted-foreground pl-6">
                      ...and {pack.items.length - 4} more tasks
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {/* Marketplace upsell */}
            <Card className="bg-gradient-to-r from-international-orange/5 to-background border-international-orange/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Store className="h-5 w-5 text-international-orange shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground mb-1">Need expert help?</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Connect with advisors and suppliers in the marketplace who can help you execute these tasks faster.
                    </p>
                    <Button asChild variant="outline" size="sm" className="border-international-orange text-international-orange">
                      <Link href="/marketplace">
                        Browse marketplace
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

            {/* TASKS TAB */}
            <TabsContent value="tasks" className="mt-4 space-y-4">
            {/* Objective Title */}
            <div className="space-y-2">
              <Label htmlFor="objective-title">Objective Title</Label>
              <Input
                id="objective-title"
                value={objectiveTitle}
                onChange={(e) => setObjectiveTitle(e.target.value)}
                placeholder="Enter objective title..."
              />
              <p className="text-xs text-muted-foreground">
                Customize the objective title to fit your specific needs
              </p>
            </div>

            {/* Objective Description */}
            <div className="space-y-2">
              <Label htmlFor="objective-description">Description</Label>
              <Textarea
                id="objective-description"
                value={objectiveDescription}
                onChange={(e) => setObjectiveDescription(e.target.value)}
                placeholder="Describe this objective..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Customize the objective description to fit your specific needs
              </p>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="objective-due-date">Due Date (optional)</Label>
              <Input
                id="objective-due-date"
                type="date"
                value={dueDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Bulk Assignee */}
            <div className="space-y-2">
              <Label>Assign all tasks to</Label>
              <Select
                key={bulkAssigneeKey}
                onValueChange={(value) => {
                  const updated = { ...taskAssignees }
                  for (const key of Object.keys(updated)) {
                    updated[key] = value
                  }
                  setTaskAssignees(updated)
                  setBulkAssigneeKey(prev => prev + 1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose team member..." />
                </SelectTrigger>
                <SelectContent className="min-w-[200px]">
                  <SelectItem value="unassigned" className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span>Unassigned</span>
                    </div>
                  </SelectItem>
                  {members
                    .filter((member) => member.role !== 'AI_Agent')
                    .map((member) => (
                    <SelectItem key={member.id} value={member.id} className="py-2.5">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={member.full_name}
                          role={member.role}
                          avatarUrl={member.avatar_url}
                          size="sm"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{member.full_name}</span>
                          <span className="text-xs text-muted-foreground">{member.role}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Task Selection */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select tasks to include</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="h-auto py-1 px-2 text-xs"
                >
                  {selectedTaskIds.length === (pack.items?.length || 0)
                    ? 'Deselect All'
                    : 'Select All'}
                </Button>
              </div>

              <div className="rounded-md border overflow-hidden">
                <div className="p-2 space-y-2">
                  {pack.items?.map((item, idx) => {
                    const isExpanded = expandedTaskId === item.id
                    const isSelected = selectedTaskIds.includes(item.id)
                    
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'rounded-md border transition-colors',
                          isSelected ? 'bg-muted border-electric-blue' : 'bg-background hover:bg-muted/50'
                        )}
                      >
                        <div
                          className="flex items-start gap-3 p-3 cursor-pointer"
                          onClick={(e) => {
                            // Only toggle checkbox if clicking on the row, not the expand button
                            if (!(e.target as HTMLElement).closest('[data-expand-button]')) {
                              toggleTask(item.id)
                            }
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleTask(item.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium flex-1 min-w-0">
                                {idx + 1}. {item.title}
                              </span>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Select
                                  value={taskAssignees[item.id] || 'unassigned'}
                                  onValueChange={(value) => {
                                    setTaskAssignees(prev => ({ ...prev, [item.id]: value }))
                                  }}
                                >
                                  <SelectTrigger className="w-[160px] h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="min-w-[200px]">
                                    <SelectItem value="unassigned" className="py-2.5">
                                      <div className="flex items-center gap-2">
                                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                          <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                                        </div>
                                        <span>Unassigned</span>
                                      </div>
                                    </SelectItem>
                                    {members
                                      .filter((member) => member.role !== 'AI_Agent')
                                      .map((member) => (
                                      <SelectItem key={member.id} value={member.id} className="py-2.5">
                                        <div className="flex items-center gap-2">
                                          <UserAvatar
                                            name={member.full_name}
                                            role={member.role}
                                            avatarUrl={member.avatar_url}
                                            size="sm"
                                          />
                                          <div className="flex flex-col">
                                            <span className="text-sm font-medium">{member.full_name}</span>
                                            <span className="text-xs text-muted-foreground">{member.role}</span>
                                          </div>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {item.description && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 shrink-0"
                                    data-expand-button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleTaskExpand(item.id)
                                    }}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            {item.description && (
                              <div className={cn(
                                "text-xs leading-relaxed transition-all",
                                !isExpanded && "line-clamp-1"
                              )}>
                                <Markdown content={item.description} className="text-xs text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs mt-3">
                <p className="text-muted-foreground">
                  {selectedTaskIds.length} of {pack.items?.length || 0} tasks selected
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !objectiveTitle.trim() || selectedTaskIds.length === 0}
            className="bg-international-orange hover:bg-international-orange/90"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                Create Objective ({selectedTaskIds.length} {selectedTaskIds.length === 1 ? 'task' : 'tasks'})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
