'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { startDirectMessage } from '@/actions/messaging'
import { 
  Search, 
  User, 
  Send, 
  Loader2,
  Check,
  ChevronsUpDown
} from 'lucide-react'
import { toast } from 'sonner'

interface QuickComposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConversationCreated?: (conversationId: string) => void
  preselectedUserId?: string
}

interface TeamMember {
  id: string
  full_name: string | null
  email: string
  role: string | null
  avatar_url: string | null
}

export function QuickComposeDialog({
  open,
  onOpenChange,
  onConversationCreated,
  preselectedUserId
}: QuickComposeDialogProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [memberSearchOpen, setMemberSearchOpen] = useState(false)

  // Load team members
  useEffect(() => {
    if (!open) return

    const loadMembers = async () => {
      setIsLoadingMembers(true)
      try {
        const response = await fetch('/api/team/members')
        if (response.ok) {
          const data = await response.json()
          setMembers(data.members || [])
          
          // Preselect member if specified
          if (preselectedUserId) {
            const member = data.members?.find((m: TeamMember) => m.id === preselectedUserId)
            if (member) {
              setSelectedMember(member)
            }
          }
        }
      } catch (error) {
        console.error('Failed to load team members:', error)
      } finally {
        setIsLoadingMembers(false)
      }
    }

    loadMembers()
  }, [open, preselectedUserId])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedMember(null)
      setMessage('')
      setMemberSearchOpen(false)
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    if (!selectedMember) {
      toast.error('Please select a team member')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await startDirectMessage(
        selectedMember.id,
        message.trim() || undefined
      )

      if (result.success && result.data) {
        toast.success(`Started conversation with ${selectedMember.full_name || selectedMember.email}`)
        onConversationCreated?.(result.data.id)
        onOpenChange(false)
      } else {
        toast.error(result.error || 'Failed to start conversation')
      }
    } catch (error) {
      console.error('Failed to start conversation:', error)
      toast.error('Failed to start conversation')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedMember, message, onConversationCreated, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-international-orange" />
            New Message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recipient selector */}
          <div className="space-y-2">
            <Label htmlFor="recipient">To</Label>
            <Popover open={memberSearchOpen} onOpenChange={setMemberSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={memberSearchOpen}
                  className="w-full justify-between"
                >
                  {selectedMember ? (
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        name={selectedMember.full_name}
                        avatarUrl={selectedMember.avatar_url}
                        role={selectedMember.role}
                        size="sm"
                      />
                      <span>{selectedMember.full_name || selectedMember.email}</span>
                      {selectedMember.role && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedMember.role}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select team member...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[450px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search team members..." />
                  <CommandList>
                    <CommandEmpty>No team member found.</CommandEmpty>
                    <CommandGroup>
                      {isLoadingMembers ? (
                        <div className="p-4 space-y-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-2">
                              <Skeleton className="h-8 w-8 rounded-full" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        members.map((member) => (
                          <CommandItem
                            key={member.id}
                            value={member.full_name || member.email}
                            onSelect={() => {
                              setSelectedMember(member)
                              setMemberSearchOpen(false)
                            }}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Check
                              className={cn(
                                'h-4 w-4',
                                selectedMember?.id === member.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <UserAvatar
                              name={member.full_name}
                              avatarUrl={member.avatar_url}
                              role={member.role}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {member.full_name || member.email}
                              </p>
                              {member.full_name && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.email}
                                </p>
                              )}
                            </div>
                            {member.role && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {member.role}
                              </Badge>
                            )}
                          </CommandItem>
                        ))
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Message input */}
          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Write your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              You can also start with an empty conversation and send your first message later.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedMember || isSubmitting}
            className="bg-international-orange hover:bg-international-orange-hover"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Start Conversation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
