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
  Users,
  Bot,
  User,
  Store,
  Clock,
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
import { ScrollArea } from '@/components/ui/scroll-area'
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Executive':
        return <User className="h-3 w-3" />
      case 'Apprentice':
        return <Users className="h-3 w-3" />
      case 'AI_Agent':
        return <Bot className="h-3 w-3" />
      default:
        return <User className="h-3 w-3" />
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'Executive':
        return 'You'
      case 'Apprentice':
        return 'Team'
      case 'AI_Agent':
        return 'AI'
      default:
        return role
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Executive':
        return 'bg-orange-100 text-orange-700 border-orange-200'
      case 'Apprentice':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'AI_Agent':
        return 'bg-purple-100 text-purple-700 border-purple-200'
      default:
        return 'bg-muted text-muted-foreground'
    }
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
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-electric-blue" />
            {pack.title}
          </DialogTitle>
          <DialogDescription>
            {pack.description || 'Create an objective with pre-defined tasks'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
          {/* Objective Title */}
          <div className="space-y-2">
            <Label htmlFor="objective-title">Objective Title</Label>
            <Input
              id="objective-title"
              value={objectiveTitle}
              onChange={(e) => setObjectiveTitle(e.target.value)}
              placeholder="Enter objective title..."
            />
          </div>

          {/* Pack metadata */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {pack.estimated_duration && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{pack.estimated_duration}</span>
              </div>
            )}
            {pack.difficulty && (
              <Badge variant="secondary" className="text-xs">
                {pack.difficulty}
              </Badge>
            )}
          </div>

          {/* Task Selection */}
          <div className="flex-1 min-h-0 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tasks to Create</Label>
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

            <ScrollArea className="h-[200px] rounded-md border">
              <div className="p-2 space-y-1">
                {pack.items?.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors',
                      selectedTaskIds.includes(item.id)
                        ? 'bg-muted'
                        : 'hover:bg-muted/50'
                    )}
                    onClick={() => toggleTask(item.id)}
                  >
                    <Checkbox
                      checked={selectedTaskIds.includes(item.id)}
                      onCheckedChange={() => toggleTask(item.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {item.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] shrink-0', getRoleColor(item.role))}
                        >
                          {getRoleIcon(item.role)}
                          <span className="ml-1">{getRoleLabel(item.role)}</span>
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <p className="text-xs text-muted-foreground">
              {selectedTaskIds.length} of {pack.items?.length || 0} tasks selected
            </p>
          </div>

          {/* Marketplace upsell */}
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 flex items-center gap-3">
            <Store className="h-5 w-5 text-international-orange shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                Need expert help executing these tasks?{' '}
                <Link
                  href="/marketplace"
                  className="text-international-orange hover:underline font-medium"
                >
                  Browse marketplace
                </Link>
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
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
                Create Objective
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
