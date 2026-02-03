'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createObjective } from '@/actions/objectives'
import type { ObjectivePack, PackItem } from '@/actions/packs'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface UsePackDialogProps {
  pack: ObjectivePack
  trigger?: React.ReactNode
}

export function UsePackDialog({ pack, trigger }: UsePackDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [objectiveTitle, setObjectiveTitle] = useState(pack.title)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(
    pack.items?.map(item => item.id) || []
  )
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string>>(
    pack.items?.reduce((acc, item) => ({ ...acc, [item.id]: 'unassigned' }), {} as Record<string, string>) || {}
  )

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
      formData.append('description', pack.description || '')
      formData.append('playbookId', pack.id)
      selectedTaskIds.forEach(id => {
        formData.append('selectedTaskIds', id)
      })

      const result = await createObjective(formData)

      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Objective created with tasks!')
        setOpen(false)
        router.push('/objectives')
        router.refresh()
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="w-full" size="sm">
            Use This Pack
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="lg" className="max-w-3xl max-h-[85vh] overflow-hidden p-0">
        <div className="flex flex-col h-full">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-electric-blue" />
              {pack.title}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 rounded-none border-b">
              <TabsTrigger value="overview" className="gap-2 rounded-none">
                <Info className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2 rounded-none">
                <CheckCircle2 className="h-4 w-4" />
                Select Tasks
              </TabsTrigger>
            </TabsList>

            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 m-0 space-y-4 data-[state=active]:block">
            {/* What is this pack? */}
            <Card className="bg-blue-50/50 border-blue-100">
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

            {/* What you'll accomplish */}
            <Card className="bg-orange-50/50 border-orange-100">
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
            <Card className="bg-gradient-to-r from-orange-50 to-background border-orange-100">
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
            <TabsContent value="tasks" className="flex-1 overflow-hidden p-6 m-0 flex flex-col space-y-4">
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

            {/* Task Selection */}
            <div className="space-y-2">
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

              <div className="rounded-md border">
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
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <span className="text-sm font-medium flex-1">
                                {idx + 1}. {item.title}
                              </span>
                              <Select
                                value={taskAssignees[item.id] || 'unassigned'}
                                onValueChange={(value) => {
                                  setTaskAssignees(prev => ({ ...prev, [item.id]: value }))
                                }}
                              >
                                <SelectTrigger className="w-[140px] h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">
                                    <div className="flex items-center gap-2">
                                      <UserAvatar name="Unassigned" role="default" size="sm" />
                                      <span>Unassigned</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="you">
                                    <div className="flex items-center gap-2">
                                      <UserAvatar name="You" role="Founder" size="sm" />
                                      <span>You</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="team">
                                    <div className="flex items-center gap-2">
                                      <UserAvatar name="Team" role="Executive" size="sm" />
                                      <span>Team Member</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="agent">
                                    <div className="flex items-center gap-2">
                                      <UserAvatar name="AI Agent" role="AI_Agent" size="sm" />
                                      <span>AI Agent</span>
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
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
                            </div>
                            {!isExpanded && item.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {isExpanded && item.description && (
                          <div className="px-3 pb-3 pt-0">
                            <div className="pl-7">
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs mt-3">
                <p className="text-muted-foreground">
                  {selectedTaskIds.length} of {pack.items?.length || 0} tasks selected
                </p>
                <p className="text-muted-foreground">
                  Click <ChevronDown className="h-3 w-3 inline" /> to see full task details
                </p>
              </div>
            </div>
          </TabsContent>
          </Tabs>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30">
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
