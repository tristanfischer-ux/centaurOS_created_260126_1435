'use client'

import { useState } from 'react'
import { Lock, Unlock, X, Users, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { cn } from '@/lib/utils'

/** Represents a user or team share target */
export interface ShareTarget {
    type: 'user' | 'team'
    id: string
}

interface PrivacyShareControlProps {
    /** Whether the item is private */
    isPrivate: boolean
    /** Callback when privacy changes */
    onPrivateChange: (isPrivate: boolean) => void
    /** Currently shared targets */
    sharedWith: ShareTarget[]
    /** Callback when shares change */
    onSharedWithChange: (targets: ShareTarget[]) => void
    /** Available members to share with */
    members: { id: string; full_name: string; role: string }[]
    /** Available teams to share with */
    teams?: { id: string; name: string }[]
    /** Current user (excluded from share picker) */
    currentUserId: string
    /** Compact mode - only shows the toggle, no share picker */
    compact?: boolean
    /** Additional CSS classes */
    className?: string
}

/**
 * PrivacyShareControl - Toggle for private/public with share picker.
 *
 * @description Reusable component for marking tasks or objectives as
 * private and selecting which users/teams to share them with.
 * Used in create dialogs, edit views, and detail panels.
 */
export function PrivacyShareControl({
    isPrivate,
    onPrivateChange,
    sharedWith,
    onSharedWithChange,
    members,
    teams = [],
    currentUserId,
    compact = false,
    className,
}: PrivacyShareControlProps) {
    // Build options for MultiSelect - teams first, then members (exclude self)
    const shareOptions = [
        ...teams.map(t => ({
            value: `team:${t.id}`,
            label: t.name,
            icon: <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
        })),
        ...members
            .filter(m => m.id !== currentUserId)
            .map(m => ({
                value: `user:${m.id}`,
                label: m.full_name || 'Unknown',
                icon: (
                    <UserAvatar
                        name={m.full_name}
                        role={m.role}
                        size="xs"
                        className="shrink-0"
                    />
                ),
            })),
    ]

    // Convert ShareTarget[] to MultiSelect string values
    const selectedValues = sharedWith.map(s => `${s.type}:${s.id}`)

    const handleShareChange = (values: string[]) => {
        const targets: ShareTarget[] = values.map(v => {
            const [type, id] = v.split(':')
            return { type: type as 'user' | 'team', id }
        })
        onSharedWithChange(targets)
    }

    return (
        <div className={cn('space-y-3', className)}>
            {/* Privacy Toggle */}
            <button
                type="button"
                onClick={() => {
                    const newValue = !isPrivate
                    onPrivateChange(newValue)
                    // Clear shares when switching to public
                    if (!newValue) {
                        onSharedWithChange([])
                    }
                }}
                className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full',
                    isPrivate
                        ? 'bg-status-warning-light text-status-warning-dark border border-status-warning/30'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
                )}
                aria-pressed={isPrivate}
                aria-label={isPrivate ? 'Item is private. Click to make public.' : 'Item is public. Click to make private.'}
            >
                {isPrivate ? (
                    <Lock className="h-4 w-4 shrink-0" />
                ) : (
                    <Unlock className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 text-left">
                    {isPrivate ? 'Private' : 'Visible to everyone'}
                </span>
                {isPrivate && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Confidential
                    </Badge>
                )}
            </button>

            {/* Share Picker - only show when private and not compact */}
            {isPrivate && !compact && (
                <div className="space-y-2 pl-1">
                    <Label className="text-xs text-muted-foreground">
                        Share with (people & teams who can see this)
                    </Label>
                    <MultiSelect
                        options={shareOptions}
                        selected={selectedValues}
                        onChange={handleShareChange}
                        placeholder="Add people or teams..."
                        emptyMessage="No members or teams found"
                    />
                    {sharedWith.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Shared with {sharedWith.length} {sharedWith.length === 1 ? 'recipient' : 'recipients'}
                            {' '}+ you and assignees
                        </p>
                    )}
                    {sharedWith.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            Only you and assignees can see this.
                        </p>
                    )}
                </div>
            )}

            {/* Compact mode hint */}
            {isPrivate && compact && (
                <p className="text-xs text-muted-foreground pl-1">
                    Only you and assignees can see this.
                </p>
            )}
        </div>
    )
}

/**
 * PrivacyBadge - Small visual indicator for private items.
 *
 * @description Shows a lock icon badge on task/objective cards
 * to indicate the item is private/confidential.
 */
export function PrivacyBadge({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                'bg-status-warning-light text-status-warning-dark',
                className
            )}
            title="Private - only visible to you, assignees, and shared recipients"
            aria-label="Private item"
        >
            <Lock className="h-3 w-3" />
            Private
        </span>
    )
}
