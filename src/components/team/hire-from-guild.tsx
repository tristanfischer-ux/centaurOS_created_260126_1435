'use client'

/**
 * @file hire-from-guild.tsx
 * 
 * @description Component for browsing and hiring Guild members.
 * Shows available Apprentices and Executives from The Forge Guild
 * that can be invited to join the user's foundry.
 * 
 * @component HireFromGuild
 */

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { UserAvatar } from '@/components/ui/user-avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  UserPlus,
  CheckCircle2,
  Loader2,
  Briefcase,
  Star,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAvailableGuildMembers, inviteGuildMember } from '@/actions/guild-hiring'
import type { GuildMember } from '@/actions/guild-hiring'
import { toast } from 'sonner'

interface HireFromGuildProps {
  /** Whether to show as a compact card or expanded view */
  variant?: 'card' | 'expanded'
  /** CSS class name */
  className?: string
}

/**
 * HireFromGuild - Browse and invite Guild members to your foundry
 * 
 * @description Shows available Apprentices and Executives from The Forge Guild.
 * Founders can invite members directly from this component.
 * 
 * @example
 * // Compact card for dashboard
 * <HireFromGuild variant="card" />
 * 
 * // Expanded view for team page
 * <HireFromGuild variant="expanded" />
 */
export function HireFromGuild({ variant = 'card', className }: HireFromGuildProps) {
  const [members, setMembers] = useState<GuildMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<GuildMember | null>(null)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadMembers(): Promise<void> {
      setIsLoading(true)
      const result = await getAvailableGuildMembers(undefined, variant === 'card' ? 5 : 20)
      setMembers(result.members)
      setIsLoading(false)
    }
    loadMembers()
  }, [variant])

  function handleInviteClick(member: GuildMember): void {
    setSelectedMember(member)
    setIsInviteDialogOpen(true)
  }

  function handleInviteConfirm(): void {
    if (!selectedMember) return

    startTransition(async () => {
      const result = await inviteGuildMember(
        selectedMember.id,
        selectedMember.role as 'Executive' | 'Apprentice'
      )

      if (result.success) {
        toast.success(`${selectedMember.fullName} has been invited to your team!`)
        setInvitedIds(prev => new Set([...prev, selectedMember.id]))
        setIsInviteDialogOpen(false)
        setSelectedMember(null)
      } else {
        toast.error(result.error || 'Failed to send invitation')
      }
    })
  }

  if (variant === 'card') {
    return (
      <Card className={cn('border', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-1 h-6 bg-international-orange rounded-full" />
            Hire from the Guild
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No Guild members available right now.
            </p>
          ) : (
            <div className="space-y-2">
              {members.slice(0, 3).map((member) => (
                <GuildMemberRow
                  key={member.id}
                  member={member}
                  isInvited={invitedIds.has(member.id)}
                  onInvite={() => handleInviteClick(member)}
                  compact
                />
              ))}
              {members.length > 3 && (
                <Button variant="ghost" size="sm" className="w-full text-international-orange">
                  View all {members.length} available
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
            </div>
          )}
        </CardContent>

        <InviteDialog
          open={isInviteDialogOpen}
          onOpenChange={setIsInviteDialogOpen}
          member={selectedMember}
          onConfirm={handleInviteConfirm}
          isPending={isPending}
        />
      </Card>
    )
  }

  // Expanded view
  return (
    <div className={cn('space-y-6', className)}>
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-international-orange" />
          Hire from the Guild
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse available Apprentices and Executives from The Forge Guild.
          These are talented people ready to help grow your business.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : members.length === 0 ? (
        <Card className="border">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-base font-semibold text-foreground mb-2">No Guild members available</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Check back soon. New Apprentices and Executives join The Forge Guild regularly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {members.map((member) => (
            <GuildMemberCard
              key={member.id}
              member={member}
              isInvited={invitedIds.has(member.id)}
              onInvite={() => handleInviteClick(member)}
            />
          ))}
        </div>
      )}

      <InviteDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        member={selectedMember}
        onConfirm={handleInviteConfirm}
        isPending={isPending}
      />
    </div>
  )
}

// --- Sub-components ---

interface GuildMemberRowProps {
  member: GuildMember
  isInvited: boolean
  onInvite: () => void
  compact?: boolean
}

function GuildMemberRow({ member, isInvited, onInvite, compact }: GuildMemberRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <UserAvatar name={member.fullName} role={member.role} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{member.fullName}</p>
        <p className="text-xs text-muted-foreground">{member.role}</p>
      </div>
      {isInvited ? (
        <StatusBadge status="success" size="sm">Invited</StatusBadge>
      ) : (
        <Button variant="ghost" size="sm" onClick={onInvite} className="text-international-orange">
          <UserPlus className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

interface GuildMemberCardProps {
  member: GuildMember
  isInvited: boolean
  onInvite: () => void
}

function GuildMemberCard({ member, isInvited, onInvite }: GuildMemberCardProps) {
  const completionRate = member.taskCount > 0
    ? Math.round((member.completedCount / member.taskCount) * 100)
    : 0

  return (
    <Card className="border hover:shadow-sm transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <UserAvatar name={member.fullName} role={member.role} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground truncate">{member.fullName}</h4>
              <StatusBadge
                status={member.role === 'Executive' ? 'info' : 'warning'}
                size="sm"
              >
                {member.role}
              </StatusBadge>
            </div>
            {member.bio && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{member.bio}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                {member.taskCount} tasks
              </span>
              {member.taskCount > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {completionRate}% completed
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex justify-end">
          {isInvited ? (
            <StatusBadge status="success" size="sm">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Invited
            </StatusBadge>
          ) : (
            <Button size="sm" onClick={onInvite}>
              <UserPlus className="h-3.5 w-3.5 mr-2" />
              Invite to Team
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface InviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: GuildMember | null
  onConfirm: () => void
  isPending: boolean
}

function InviteDialog({ open, onOpenChange, member, onConfirm, isPending }: InviteDialogProps) {
  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Invite {member.fullName}?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-4">
            <UserAvatar name={member.fullName} role={member.role} size="lg" />
            <div>
              <p className="text-sm font-semibold text-foreground">{member.fullName}</p>
              <p className="text-xs text-muted-foreground">{member.role} in The Forge Guild</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {member.fullName} will be invited to join your foundry as a{' '}
            <strong>{member.role}</strong>. They&apos;ll keep their Guild membership too,
            so they can switch between workspaces.
          </p>

          {member.taskCount > 0 && (
            <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Track record</p>
              <p>{member.taskCount} tasks completed on the platform ({Math.round((member.completedCount / member.taskCount) * 100)}% completion rate)</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Send Invitation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
