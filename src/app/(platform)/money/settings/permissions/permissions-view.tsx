'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
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
import { Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  grantCapabilityOverride,
  revokeCapabilityOverride,
  type MemberWithOverrides,
  type PermissionOverrideRow,
} from '@/actions/money-permissions'
import {
  PERMISSION_CAPABILITIES,
  type PermissionCapability,
} from '@/lib/money/permission-capabilities'

const CAPABILITY_LABEL: Record<PermissionCapability, string> = {
  raise_read: 'Raise · Read',
  raise_write: 'Raise · Write',
  raise_lock: 'Raise · Lock',
  raise_send_update: 'Raise · Send update',
  plan_read: 'Plan · Read',
  plan_write: 'Plan · Write',
  plan_lock: 'Plan · Lock',
  cockpit_read: 'Cockpit · Read',
  xero_connect: 'Xero · Connect',
  xero_disconnect: 'Xero · Disconnect',
  credits_read: 'Credits · Read',
  credits_budget_edit: 'Credits · Edit budget',
  settings_read: 'Settings · Read',
  settings_write: 'Settings · Write',
  permissions_edit: 'Permissions · Edit',
  audit_read: 'Audit · Read',
  audit_export: 'Audit · Export',
}

function formatExpiry(iso: string | null): string {
  if (!iso) return 'No expiry'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Invalid expiry'
  const now = Date.now()
  if (d.getTime() < now) return `Expired ${d.toLocaleDateString('en-GB')}`
  return `Until ${d.toLocaleDateString('en-GB')}`
}

export function PermissionsView({ members }: { members: MemberWithOverrides[] }) {
  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No members yet"
            description="Invite teammates from your account-level Team page first; they'll appear here once they accept."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <MemberCard key={member.membership_id} member={member} />
      ))}
    </div>
  )
}

function MemberCard({ member }: { member: MemberWithOverrides }) {
  const displayName = member.full_name ?? member.email ?? 'Member'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar
              name={displayName}
              role={member.role}
              avatarUrl={member.avatar_url}
              size="md"
            />
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{displayName}</CardTitle>
              <p className="text-xs text-muted-foreground truncate">{member.email ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={member.role === 'Founder' ? 'default' : 'secondary'}>
              {member.role}
            </Badge>
            {!member.active && <Badge variant="destructive">Revoked</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {member.overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No overrides — using {member.role} defaults.
          </p>
        ) : (
          <ul className="space-y-2">
            {member.overrides.map((override) => (
              <OverrideRow key={override.id} override={override} />
            ))}
          </ul>
        )}
        <div className="pt-2">
          <GrantOverrideDialog
            userId={member.user_id}
            displayName={displayName}
            existingCapabilities={member.overrides.map((o) => o.capability)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function OverrideRow({ override }: { override: PermissionOverrideRow }) {
  const [isPending, startTransition] = useTransition()

  function handleRevoke() {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Revoke "${CAPABILITY_LABEL[override.capability]}" override?`,
      )
      if (!ok) return
    }
    startTransition(async () => {
      const result = await revokeCapabilityOverride(override.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Override revoked.')
    })
  }

  const expiryNote = formatExpiry(override.expires_at)
  const expired = override.expires_at && new Date(override.expires_at).getTime() < Date.now()

  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <ShieldCheck className="h-4 w-4 mt-0.5 text-international-orange shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-sm font-medium">{CAPABILITY_LABEL[override.capability]}</span>
          <Badge variant={override.granted ? 'success' : 'secondary'} size="sm">
            {override.granted ? 'Granted' : 'Denied'}
          </Badge>
          {expired && <Badge variant="destructive" size="sm">Expired</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{expiryNote}</p>
        {override.reason && (
          <p className="text-xs text-muted-foreground italic">“{override.reason}”</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRevoke}
        disabled={isPending}
        aria-label={`Revoke ${CAPABILITY_LABEL[override.capability]}`}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  )
}

function GrantOverrideDialog({
  userId,
  displayName,
  existingCapabilities,
}: {
  userId: string
  displayName: string
  existingCapabilities: PermissionCapability[]
}) {
  const [open, setOpen] = useState(false)
  const [capability, setCapability] = useState<PermissionCapability | ''>('')
  const [expiresAt, setExpiresAt] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  function reset() {
    setCapability('')
    setExpiresAt('')
    setReason('')
  }

  function handleSubmit() {
    if (!capability) {
      toast.error('Pick a capability to grant.')
      return
    }
    startTransition(async () => {
      const result = await grantCapabilityOverride(
        userId,
        capability,
        expiresAt ? new Date(expiresAt).toISOString() : null,
        reason.trim() || null,
      )
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Granted ${CAPABILITY_LABEL[capability]}.`)
      reset()
      setOpen(false)
    })
  }

  const remainingCapabilities = PERMISSION_CAPABILITIES.filter(
    (c) => !existingCapabilities.includes(c),
  )

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Grant exception
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant capability to {displayName}</DialogTitle>
          <DialogDescription>
            Overrides extend the {displayName}&apos;s role default. Time-box where you can — open-ended grants are harder to audit later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grant-capability">Capability</Label>
            <Select
              value={capability || undefined}
              onValueChange={(v) => setCapability(v as PermissionCapability)}
            >
              <SelectTrigger id="grant-capability">
                <SelectValue placeholder="Pick a capability" />
              </SelectTrigger>
              <SelectContent>
                {remainingCapabilities.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    All capabilities already granted
                  </SelectItem>
                ) : (
                  remainingCapabilities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CAPABILITY_LABEL[c]}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-expires">Expires (optional)</Label>
            <Input
              id="grant-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for an open-ended grant.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-reason">Reason (optional)</Label>
            <Input
              id="grant-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. covering Q3 close while Tom is away"
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !capability || remainingCapabilities.length === 0}>
            {isPending ? 'Granting…' : 'Grant override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
